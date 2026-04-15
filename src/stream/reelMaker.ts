import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { SEGMENT_DURATION } from './rollingBuffer'
import { nowClock } from '../utils'

const execAsync = promisify(exec)

const MIN_SEGMENTS = 2
const MAX_SEGMENTS_CLIP = 12
const POST_ROLL_MS = 10000

export async function makeReel(
    bufferDir: string,
    clipsDir: string,
    clipName: string,
    segmentCount: number,
    startTimestamp: number = 0
): Promise<string | null> {
    // 1. Vérifier le buffer au moment de la détection
    const segsAtDetection: string[] = fs.readdirSync(bufferDir)
        .filter((f: string) => f.endsWith('.ts'))
        .sort()

    const clamped: number = Math.min(MAX_SEGMENTS_CLIP, Math.max(MIN_SEGMENTS, segmentCount))
    process.stdout.write(`[${nowClock()}] [reel] ${segsAtDetection.length} seg(s) dispo — visé : ~${clamped * SEGMENT_DURATION + POST_ROLL_MS / 1000}s\n`)

    if (segsAtDetection.length < MIN_SEGMENTS) {
        process.stdout.write(`[${nowClock()}] [reel] Annulé — pas assez de contexte\n`)
        return null
    }

    // 2. Post-roll
    await new Promise<void>(r => setTimeout(r, POST_ROLL_MS))

    // 3. Sélectionner les segments alignés avec le timestamp de début narratif
    const allSegs: string[] = fs.readdirSync(bufferDir)
        .filter((f: string) => f.endsWith('.ts'))
        .sort()

    // Trouver l'index de segment correspondant au timestamp (avec 1 segment de marge avant)
    const targetIndex: number = Math.max(0, Math.floor(startTimestamp / SEGMENT_DURATION) - 1)

    // Chercher le segment le plus proche du targetIndex dans les segments disponibles
    const startIdx: number = allSegs.findIndex((f: string) => {
        const n: number = parseInt(f.match(/(\d+)/)?.[1] ?? '0')
        return n >= targetIndex
    })

    let segs: string[]
    if (startIdx !== -1) {
        segs = allSegs.slice(startIdx, startIdx + clamped)
        // Si pas assez de segments à partir du point de départ, compléter avec les suivants
        if (segs.length < MIN_SEGMENTS) segs = allSegs.slice(-clamped)
    } else {
        segs = allSegs.slice(-clamped)
    }

    fs.mkdirSync(clipsDir, { recursive: true })

    const listPath  = path.join(bufferDir, `concat_${clipName}.txt`)
    const reelPath  = path.join(clipsDir, `${clipName}_reel.mp4`)

    try {
        // 3. Concat + format vertical en une seule passe
        fs.writeFileSync(listPath, segs.map((s: string) => `file '${path.join(bufferDir, s)}'`).join('\n'))
        const filterComplex =
            `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];` +
            `[0:v]scale=1080:-2[fg];` +
            `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`

        await execAsync(
            `ffmpeg -y -f concat -safe 0 -i "${listPath}" ` +
            `-filter_complex "${filterComplex}" ` +
            `-map "[out]" -map "0:a?" ` +
            `-c:v h264_videotoolbox -b:v 4M -c:a aac -b:a 128k ` +
            `-movflags +faststart "${reelPath}"`
        )

        return reelPath
    } catch (err) {
        process.stdout.write(`[${nowClock()}] [reel error] ${(err as Error).message}\n`)
        return null
    } finally {
        fs.rmSync(listPath, { force: true })
    }
}
