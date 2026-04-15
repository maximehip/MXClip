import fs from 'fs'
import path from 'path'
import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { formatTime, nowClock } from '../utils'
import { record, timer } from '../metrics'
import {
    SCORE_THRESHOLD, MIN_GAP_BETWEEN_CLIPS, PARALLEL_WINDOWS, PARALLEL_ENCODERS,
    MIN_CLIP_DURATION, ScoredWindow,
} from './constants'
import { buildAdaptiveWindows, buildWindowCandidates } from './windows'
import { preFilterByEmbedding } from './prefilter'
import { scoreWindow } from './scorer'
import { applyNMS } from './deduplication'
import { snapClipStart, snapClipEnd } from './snapping'
import { extractClip, runWithConcurrency } from './extraction'

export interface ClipResult {
    clipNum: number
    category: string
    score: number
    startSeconds: number
    endSeconds: number
    duration: number
    hook: string
    reason: string
    reelPath: string | null
}

export async function detectAndCreateClips(
    embeddedEvents: EmbeddedEvent[],
    videoPath: string,
    clipsDir: string
): Promise<ClipResult[]> {
    fs.mkdirSync(clipsDir, { recursive: true })

    const audioEvents = embeddedEvents.filter(e => e.type === 'audio')
    const maxTime = Math.max(...embeddedEvents.map(e => e.start))

    // --- Fenêtres adaptatives basées sur la densité de contenu ---
    const windows = buildAdaptiveWindows(embeddedEvents, maxTime)

    // --- Pré-filtre : ignorer les fenêtres sans contenu audio ---
    const MIN_AUDIO_EVENTS = 3
    const allWindowsWithContext = buildWindowCandidates(embeddedEvents, windows)
    const skipped = allWindowsWithContext.filter(w => w.audioCount < MIN_AUDIO_EVENTS)
    let windowsWithContext = allWindowsWithContext.filter(w => w.audioCount >= MIN_AUDIO_EVENTS)

    if (skipped.length > 0) {
        console.log(`  Skipped ${skipped.length} window(s) with < ${MIN_AUDIO_EVENTS} audio events`)
        record('windows_skipped', skipped.length, 'count')
    }

    // --- Pré-filtrage par similarité d'embedding ---
    windowsWithContext = await preFilterByEmbedding(windowsWithContext)
    // Tri par densité décroissante : les fenêtres denses démarrent en premier
    windowsWithContext.sort((a, b) => b.context.length - a.context.length)

    console.log(`\nPass 1/2 — Scoring ${windowsWithContext.length} windows (pool of ${PARALLEL_WINDOWS})...`)
    const candidates: ScoredWindow[] = []
    let done = 0
    const scoringElapsed = timer()

    // Work-stealing pool : chaque worker prend le prochain disponible dès qu'il est libre
    const queue = [...windowsWithContext]
    async function worker(): Promise<void> {
        while (true) {
            const item = queue.shift()
            if (!item) break
            const result = await scoreWindow(item.context, item.start, item.end)
            done++
            process.stdout.write(`\r  ${done}/${windowsWithContext.length} windows scored...`)
            if (result && result.score >= SCORE_THRESHOLD && result.category !== 'none') {
                candidates.push(result)
            }
        }
    }
    await Promise.all(Array.from({ length: PARALLEL_WINDOWS }, worker))

    process.stdout.write('\n')
    record('clip_scoring_total', scoringElapsed(), 'ms', { windows: windows.length, candidates: candidates.length })
    console.log(`  ${candidates.length} candidate(s) found (score ≥ ${SCORE_THRESHOLD})`)

    if (candidates.length === 0) {
        console.log('No clip-worthy moments detected.')
        return []
    }

    // --- Passe 2 : NMS → garder seulement les meilleurs moments sans doublon ---
    console.log(`\nPass 2/2 — Deduplication (NMS, min gap ${MIN_GAP_BETWEEN_CLIPS}s)...`)
    const selected = applyNMS(candidates, MIN_GAP_BETWEEN_CLIPS)
    console.log(`  ${selected.length} clip(s) selected after deduplication\n`)

    // --- Création des clips en parallèle ---
    const validClips = selected
        .map((w, idx) => {
            if (w.endSeconds - w.startSeconds < 5) {
                console.log(`  [skip] Clip #${idx + 1} rejected: LLM timestamps too tight (${w.endSeconds - w.startSeconds}s)`)
                return null
            }
            const snappedStart = snapClipStart(w.startSeconds, audioEvents)
            const snappedEnd = snapClipEnd(w.endSeconds, audioEvents)
            if (!isFinite(snappedStart) || !isFinite(snappedEnd) || snappedEnd <= snappedStart) return null
            const effectiveEnd = snappedEnd - snappedStart < MIN_CLIP_DURATION
                ? snappedStart + MIN_CLIP_DURATION
                : snappedEnd
            return { w, snappedStart, snappedEnd: effectiveEnd, clipNum: idx + 1 }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)

    const reelElapsed = timer()
    const reelResults = await runWithConcurrency(validClips, PARALLEL_ENCODERS, async ({ w, snappedStart, snappedEnd, clipNum }) => {
        const clipName = `clip_${String(clipNum).padStart(3, '0')}_${w.category}`
        const reelPath = await extractClip(videoPath, clipsDir, clipName, snappedStart, snappedEnd)
        return { w, snappedStart, snappedEnd, clipNum, clipName, reelPath }
    })

    reelResults.sort((a, b) => a.snappedStart - b.snappedStart)
    for (const { w, snappedStart, snappedEnd, clipNum, reelPath } of reelResults) {
        const actualDuration = Math.round(snappedEnd - snappedStart)
        process.stdout.write(`[${nowClock()}] CLIP #${clipNum} — ${w.category} (score ${w.score}/10)\n`)
        process.stdout.write(`  ${formatTime(snappedStart)} → ${formatTime(snappedEnd)} (${actualDuration}s)\n`)
        process.stdout.write(`  Hook: "${w.hook}"\n`)
        process.stdout.write(`  Reason: "${w.reason}"\n`)
        if (reelPath) process.stdout.write(`  Saved → ${path.basename(reelPath)}\n\n`)
    }

    const clipCount = reelResults.filter(r => r.reelPath).length
    record('reel_creation_total', reelElapsed(), 'ms', { clips: clipCount })
    console.log(`Clip detection done. ${clipCount} clip(s) created in ${clipsDir}`)

    return reelResults.map(({ w, snappedStart, snappedEnd, clipNum, reelPath }) => ({
        clipNum,
        category: w.category,
        score: w.score,
        startSeconds: snappedStart,
        endSeconds: snappedEnd,
        duration: Math.round(snappedEnd - snappedStart),
        hook: w.hook,
        reason: w.reason,
        reelPath,
    }))
}
