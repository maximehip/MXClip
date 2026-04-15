import fs from 'fs'
import path from 'path'
import { startFastVLMServer } from './stream/fastvlmVision'
import { nowClock } from './utils'
import { record, timer } from './metrics'

const DEFAULT_FRAMES_DIR = path.resolve(__dirname, '..', 'output', 'frames')
const N_SERVERS = 1

export interface FrameCaption {
    file: string
    caption: string
}

export async function analyzeAllFrames(framesDir: string = DEFAULT_FRAMES_DIR, framePaths?: string[]): Promise<FrameCaption[]> {
    const resolvedPaths: string[] = framePaths ?? fs.readdirSync(framesDir)
        .filter((f: string) => f.endsWith('.png'))
        .sort()
        .map((f: string) => path.join(framesDir, f))

    if (resolvedPaths.length === 0) {
        console.log('No frames found.')
        return []
    }

    const elapsed = timer()
    console.log(`[${nowClock()}] Starting frame analysis with FastVLM (${resolvedPaths.length} frames, ${N_SERVERS} servers)...`)

    const servers = Array.from({ length: N_SERVERS }, () => startFastVLMServer('video'))

    // Wait for all servers to have the model loaded before sending frames
    await Promise.all(servers.map(s => s.ready))

    // Split into contiguous chunks — preserves temporal similarity skip per server
    const chunkSize = Math.ceil(resolvedPaths.length / N_SERVERS)
    const chunks: string[][] = Array.from({ length: N_SERVERS }, (_, i) =>
        resolvedPaths.slice(i * chunkSize, (i + 1) * chunkSize)
    )

    let done = 0
    const allResults: FrameCaption[] = []

    const PREFETCH = 4  // frames sent ahead to keep the Python prefetch thread busy

    try {
        await Promise.all(chunks.map(async (chunk: string[], serverIdx: number) => {
            const server = servers[serverIdx]
            const pending: Array<Promise<FrameCaption>> = []

            for (let i = 0; i < chunk.length; i++) {
                // Send PREFETCH frames ahead so the Python prefetch thread
                // always has images to load while the GPU runs inference
                const prefetchIdx = i + PREFETCH
                if (prefetchIdx < chunk.length) {
                    pending[prefetchIdx] = server.caption(chunk[prefetchIdx])
                }

                const result = await (pending[i] ?? server.caption(chunk[i]))
                allResults.push(result)
                done++
                if (done % 10 === 0 || done === resolvedPaths.length) {
                    process.stdout.write(`\r[${nowClock()}] Frames ${done}/${resolvedPaths.length}`)
                }
            }
        }))
    } finally {
        servers.forEach(s => s.kill())
    }

    process.stdout.write('\n')
    allResults.sort((a: FrameCaption, b: FrameCaption) => a.file.localeCompare(b.file))
    const ms = elapsed()
    const avgMs = allResults.length > 0 ? Math.round(ms / allResults.length) : 0
    const fps = allResults.length > 0 ? (allResults.length / (ms / 1000)).toFixed(2) : '0'
    record('vision_analysis', ms, 'ms', { frames: allResults.length, avg_ms_per_frame: avgMs, fps })
    console.log(`[${nowClock()}] Frame analysis complete: ${allResults.length} frames captioned (${(ms / 1000).toFixed(2)}s, avg ${avgMs}ms/frame, ${fps} fps)`)
    return allResults
}
