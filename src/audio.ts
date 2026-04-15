import ffmpeg from "fluent-ffmpeg"
import fs from "fs"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { TranscriptSegment } from "./types/TranscriptSegment"
import { nowClock } from "./utils"
import { record, timer } from "./metrics"

const WHISPER_CLI = 'whisper-cli'
const WHISPER_MODEL = path.resolve(__dirname, '..', 'models', 'ggml-small.bin')
const CPU_COUNT = os.cpus().length
const IS_APPLE_SILICON = process.platform === 'darwin' && process.arch === 'arm64'
const WHISPER_THREADS = IS_APPLE_SILICON
    ? Math.max(8, Math.min(12, CPU_COUNT - 2))
    : Math.max(4, Math.min(8, CPU_COUNT - 1))

export async function extractAudioFromVideo(videoPath: string, audioPath: string): Promise<void> {
    const elapsed = timer()
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioFrequency(16000)
            .audioChannels(1)
            .audioCodec('pcm_s16le')
            .on('end', () => {
                const ms = elapsed()
                const fileSizeKb = Math.round(fs.statSync(audioPath).size / 1024)
                record('audio_extraction', ms, 'ms', { size_kb: fileSizeKb })
                console.log(`[${nowClock()}] Audio extracted to ${audioPath} (${(ms / 1000).toFixed(2)}s, ${fileSizeKb} KB)`)
                resolve()
            })
            .on('error', (err) => {
                console.error(`[${nowClock()}] Error extracting audio: ${err.message}`)
                reject(err)
            })
            .save(audioPath)
    })
}

interface WhisperSegment {
    offsets: { from: number; to: number }
    text: string
}

interface WhisperOutput {
    transcription: WhisperSegment[]
}

export async function transcribeAudio(audioPath: string, language: string = 'auto'): Promise<TranscriptSegment[]> {
    if (!fs.existsSync(WHISPER_MODEL)) {
        throw new Error(`Whisper model not found at ${WHISPER_MODEL}. Run: curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" -o ${WHISPER_MODEL}`)
    }

    const elapsed = timer()
    const outputBase = path.join(path.dirname(audioPath), 'whisper_out')
    const outputJson = outputBase + '.json'

    if (fs.existsSync(outputJson)) fs.rmSync(outputJson)

    const langLabel = language === 'auto' ? 'auto language detection' : `language: ${language}`
    process.stdout.write(`[${nowClock()}] Transcribing via whisper.cpp (Metal, ${langLabel})...\n`)

    let detectedLanguage: string | null = null

    await new Promise<void>((resolve, reject) => {
        const proc = spawn(WHISPER_CLI, [
            '-m', WHISPER_MODEL,
            '-f', audioPath,
            '-l', language,
            '-oj',
            '-of', outputBase,
            '--threads', String(WHISPER_THREADS),
            '--split-on-word',
            '--max-len', '80',
        ])

        proc.stderr.on('data', (d: Buffer) => {
            const line = d.toString().trim()
            const langMatch = line.match(/auto-detected language:\s*([a-z]{2,})/i)
            if (langMatch) {
                detectedLanguage = langMatch[1]
                process.stdout.write(`[${nowClock()}] Detected language: ${detectedLanguage}\n`)
            }
            if (line.includes('error') || line.includes('Error')) {
                process.stderr.write(`[whisper.cpp] ${line}\n`)
            }
        })

        proc.on('close', (code: number) => {
            if (code === 0) resolve()
            else reject(new Error(`whisper-cli exited with code ${code}`))
        })
    })

    const raw: WhisperOutput = JSON.parse(fs.readFileSync(outputJson, 'utf-8'))
    fs.rmSync(outputJson, { force: true })

    const segments: TranscriptSegment[] = raw.transcription
        .filter(seg => seg.text.trim().length > 0)
        .map(seg => ({
            start: Math.round(seg.offsets.from / 10) / 100,
            end: Math.round(seg.offsets.to / 10) / 100,
            text: seg.text.trim(),
        }))

    const ms = elapsed()
    const coveredDuration = segments.length > 0
        ? segments[segments.length - 1].end - segments[0].start
        : 0
    const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0)
    record('transcription', ms, 'ms', {
        segments: segments.length,
        words: wordCount,
        covered_s: Math.round(coveredDuration)
    })
    console.log(`[${nowClock()}] Transcription done: ${segments.length} segments, ${wordCount} words, ${Math.round(coveredDuration)}s covered (${(ms / 1000).toFixed(2)}s)`)
    return segments
}
