import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { nowClock } from '../utils'
import { record, timer } from '../metrics'
import { MAX_CLIP_DURATION, MIN_CLIP_DURATION, CLIP_PADDING_AFTER } from './constants'

const execAsync = promisify(exec)

export async function extractClip(
    videoPath: string,
    clipsDir: string,
    clipName: string,
    start: number,
    end: number
): Promise<string | null> {
    const duration = Math.min(MAX_CLIP_DURATION, Math.max(MIN_CLIP_DURATION, end - start))
    const clipStart = Math.max(0, start)
    const clipDuration = duration + CLIP_PADDING_AFTER

    const reelPath = path.join(clipsDir, `${clipName}_reel.mp4`)

    const filterComplex =
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];` +
        `[0:v]scale=1080:-2[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`

    const ffmpegElapsed = timer()
    try {
        await execAsync(
            `ffmpeg -y -ss ${clipStart} -i "${videoPath}" -t ${clipDuration} ` +
            `-filter_complex "${filterComplex}" ` +
            `-map "[out]" -map "0:a?" ` +
            `-c:v h264_videotoolbox -b:v 4M -c:a aac -b:a 128k ` +
            `-movflags +faststart "${reelPath}"`
        )
        const ms = ffmpegElapsed()
        record('reel_encode', ms, 'ms', { duration_s: Math.round(duration), clip: clipName })
        return reelPath
    } catch (err) {
        process.stdout.write(`[${nowClock()}] [clip error] ${(err as Error).message.split('\n')[0]}\n`)
        return null
    }
}

export async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let index = 0

    async function consume(): Promise<void> {
        while (index < items.length) {
            const currentIndex = index++
            results[currentIndex] = await worker(items[currentIndex])
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume))
    return results
}
