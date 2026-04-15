import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { nowClock } from './utils'
import { record, timer } from './metrics'

export const FOCUS_CANDIDATE_FPS = 1

interface SegmentState {
    segIdx: number
    frames: string[]
    scores: number[]
    mean: number
    M2: number
    nSampled: number
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items]

    async function consume(): Promise<void> {
        while (queue.length > 0) {
            const item = queue.shift()
            if (!item) return
            await worker(item)
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume))
}

// Cheap visual informativeness: normalized variance over greyscale channel
async function scoreFrame(framePath: string): Promise<number> {
    const stats = await sharp(framePath).greyscale().stats()
    const ch = stats.channels[0]
    return (ch.stdev * ch.stdev) / (255 * 255)
}

// Bernstein upper confidence bound
function bernsteinUCB(mean: number, variance: number, nArm: number, nTotal: number): number {
    if (nArm === 0) return Infinity
    const log = Math.log(nTotal + 1)
    return mean + Math.sqrt(2 * variance * log / nArm) + 3 * log / nArm
}

// Bernstein lower confidence bound
function bernsteinLCB(mean: number, variance: number, nArm: number, nTotal: number): number {
    if (nArm === 0) return -Infinity
    const log = Math.log(nTotal + 1)
    return mean - Math.sqrt(2 * variance * log / nArm) - 3 * log / nArm
}

// Welford online variance update
function updateStats(seg: SegmentState, score: number): void {
    seg.scores.push(score)
    seg.nSampled++
    const delta = score - seg.mean
    seg.mean += delta / seg.nSampled
    const delta2 = score - seg.mean
    seg.M2 += delta * delta2
}

function segVariance(seg: SegmentState): number {
    return seg.nSampled > 1 ? seg.M2 / (seg.nSampled - 1) : 0
}

export async function extractCandidateFrames(videoPath: string, outputDir: string): Promise<string[]> {
    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true })
    }
    fs.mkdirSync(outputDir, { recursive: true })

    const elapsed = timer()
    return new Promise<string[]>((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions(['-vf', `fps=${FOCUS_CANDIDATE_FPS}`, '-q:v', '5'])
            .saveToFile(path.join(outputDir, 'frame-%05d.png'))
            .on('end', () => {
                const frames = fs.readdirSync(outputDir)
                    .filter((f: string) => f.endsWith('.png'))
                    .sort()
                    .map((f: string) => path.join(outputDir, f))
                const ms = elapsed()
                record('focus_extraction', ms, 'ms', { frames: frames.length })
                console.log(`[${nowClock()}] [focus] Extracted ${frames.length} candidate frames at ${FOCUS_CANDIDATE_FPS}fps (${(ms / 1000).toFixed(2)}s)`)
                resolve(frames)
            })
            .on('error', reject)
    })
}

// Select the K most visually informative frames from candidates
// using a Bernstein UCB bandit over temporal segments
export async function focusSelectFrames(
    candidates: string[],
    K: number
): Promise<string[]> {
    const N = candidates.length
    if (N <= K) return candidates

    const elapsed = timer()
    const SCORE_CONCURRENCY = 4

    // Number of segments ≈ 2K (so each segment holds ~segmentSize frames)
    const T = Math.min(Math.max(K * 2, 10), N)
    const budget = Math.ceil(N * 0.25)  // score at most 25% of candidates
    const segmentSize = Math.ceil(N / T)

    const segments: SegmentState[] = Array.from({ length: T }, (_, i) => ({
        segIdx: i,
        frames: candidates.slice(i * segmentSize, (i + 1) * segmentSize),
        scores: [] as number[],
        mean: 0,
        M2: 0,
        nSampled: 0
    })).filter((s: SegmentState) => s.frames.length > 0)

    let totalSampled = 0

    // Phase 1 — initial pull: score first frame of each segment
    await runWithConcurrency(segments, SCORE_CONCURRENCY, async (seg: SegmentState) => {
        const score = await scoreFrame(seg.frames[0])
        updateStats(seg, score)
    })
    totalSampled = segments.length

    // Phase 2 — UCB exploration: pull high-UCB segments until budget exhausted
    while (totalSampled < budget) {
        let bestSeg: SegmentState | null = null
        let bestUCB = -Infinity

        for (const seg of segments) {
            if (seg.nSampled >= seg.frames.length) continue
            const ucb = bernsteinUCB(seg.mean, segVariance(seg), seg.nSampled, totalSampled)
            if (ucb > bestUCB) {
                bestUCB = ucb
                bestSeg = seg
            }
        }

        if (!bestSeg) break

        const score = await scoreFrame(bestSeg.frames[bestSeg.nSampled])
        updateStats(bestSeg, score)
        totalSampled++

        // Early stopping: check if top ceil(K/segmentSize) segments are confidently identified
        if (totalSampled % segments.length === 0) {
            const kSegs = Math.ceil(K / segmentSize)
            if (kSegs < segments.length) {
                const ranked = [...segments].sort((a: SegmentState, b: SegmentState) => b.mean - a.mean)
                const kthLCB = bernsteinLCB(
                    ranked[kSegs - 1].mean,
                    segVariance(ranked[kSegs - 1]),
                    ranked[kSegs - 1].nSampled,
                    totalSampled
                )
                const nextUCB = bernsteinUCB(
                    ranked[kSegs].mean,
                    segVariance(ranked[kSegs]),
                    ranked[kSegs].nSampled,
                    totalSampled
                )
                if (kthLCB > nextUCB) {
                    console.log(`[${nowClock()}] [focus] Early stopping at ${totalSampled}/${N} evaluations`)
                    break
                }
            }
        }
    }

    // Phase 3 — selection: take K frames from top-ranked segments
    const rankedSegs = [...segments].sort((a: SegmentState, b: SegmentState) => b.mean - a.mean)
    const selected: string[] = []

    for (const seg of rankedSegs) {
        if (selected.length >= K) break

        // Within segment: prefer scored frames (sorted desc), then unseen frames
        const scoredPairs = seg.scores
            .map((s: number, i: number) => ({ frame: seg.frames[i], score: s }))
            .sort((a: { frame: string; score: number }, b: { frame: string; score: number }) => b.score - a.score)

        const unseenFrames = seg.frames
            .slice(seg.nSampled)
            .map((f: string) => ({ frame: f, score: -1 as number }))

        for (const { frame } of [...scoredPairs, ...unseenFrames]) {
            if (selected.length >= K) break
            selected.push(frame)
        }
    }

    const ms = elapsed()
    const pct = ((selected.length / N) * 100).toFixed(1)
    record('focus_selection', ms, 'ms', { candidates: N, selected: selected.length, evaluations: totalSampled })
    console.log(`[${nowClock()}] [focus] Selected ${selected.length}/${N} frames (${pct}%) — ${totalSampled} evaluations (${(ms / 1000).toFixed(2)}s)`)

    // Return in temporal order
    return selected.sort()
}
