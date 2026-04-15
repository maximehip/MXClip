import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'

const AUDIO_CHUNK_DURATION = 15

export function startFrameExtraction(m3u8Url: string, framesDir: string): void {
    ffmpeg(m3u8Url)
        .outputOptions(['-vf', 'fps=1/3', '-q:v', '5'])
        .on('error', (err) => process.stdout.write(`[frames error] ${err.message}\n`))
        .save(path.join(framesDir, 'frame-%06d.png'))
}

export function startAudioSegmentation(m3u8Url: string, audioDir: string): void {
    ffmpeg(m3u8Url)
        .outputOptions([
            '-f', 'segment',
            '-segment_time', String(AUDIO_CHUNK_DURATION),
            '-reset_timestamps', '1',
            '-ar', '16000', '-ac', '1'
        ])
        .on('error', (err) => process.stdout.write(`[audio error] ${err.message}\n`))
        .save(path.join(audioDir, 'chunk-%06d.wav'))
}

// Live Mode : un seul process ffmpeg pour les 3 sorties au lieu de 3 connexions séparées
export function startLiveExtractions(
    m3u8Url: string,
    framesTargetDir: string,
    audioTargetDir: string,
    bufferDir: string,
): { stop: () => void } {
    const cmd = ffmpeg(m3u8Url)

    cmd.output(path.join(framesTargetDir, 'frame-%06d.png'))
        .outputOptions(['-vf', "fps=1/2,select='gt(scene,0.04)',setpts=N/TB", '-q:v', '5', '-an', '-vsync', 'vfr'])

    cmd.output(path.join(audioTargetDir, 'chunk-%06d.wav'))
        .outputOptions([
            '-vn', '-f', 'segment',
            '-segment_time', String(AUDIO_CHUNK_DURATION),
            '-reset_timestamps', '1',
            '-ar', '16000', '-ac', '1'
        ])

    cmd.output(path.join(bufferDir, 'seg-%06d.ts'))
        .outputOptions([
            '-c', 'copy', '-f', 'segment',
            '-segment_time', '10', '-reset_timestamps', '1'
        ])

    cmd.on('error', (err: Error) => {
        if (!err.message.includes('SIGKILL') && !err.message.includes('killed')) {
            process.stdout.write(`[ffmpeg error] ${err.message}\n`)
        }
    }).run()

    // Nettoyage du buffer glissant
    const bufferInterval = setInterval((): void => {
        const segs: string[] = fs.readdirSync(bufferDir)
            .filter((f: string) => f.endsWith('.ts'))
            .sort()
        if (segs.length > 9) {
            segs.slice(0, segs.length - 9).forEach((f: string) => {
                fs.rmSync(path.join(bufferDir, f), { force: true })
            })
        }
    }, 10000)

    return {
        stop: () => {
            clearInterval(bufferInterval)
            try { (cmd as unknown as { kill: (sig: string) => void }).kill('SIGKILL') } catch { /* ignore */ }
        }
    }
}
