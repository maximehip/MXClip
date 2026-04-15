import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { TranscriptSegment } from '../types/TranscriptSegment'

const AUDIO_SERVER = path.resolve(__dirname, '..', '..', 'scripts', 'audio_server.py')
const VENV_PYTHON = path.resolve(__dirname, '..', '..', 'venv', 'bin', 'python3')
const AUDIO_TIMEOUT_MS = 60000

export interface AudioServer {
    proc: ChildProcess
    transcribe: (audioPath: string) => Promise<TranscriptSegment[]>
    kill: () => void
}

export function startAudioServer(model: string = 'medium', language: string = 'auto'): AudioServer {
    const proc = spawn(VENV_PYTHON, [AUDIO_SERVER, '--model', model, '--language', language])

    proc.stderr!.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach((l: string) => {
            if (l.includes('ready') || l.startsWith('Error on ')) {
                process.stdout.write(`[whisper] ${l}\n`)
            }
        })
    })

    let buffer: string = ''
    const queue: Array<(result: TranscriptSegment[]) => void> = []

    proc.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines: string[] = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            const trimmed: string = line.trim()
            if (!trimmed) continue
            try {
                const segments: TranscriptSegment[] = JSON.parse(trimmed) as TranscriptSegment[]
                queue.shift()?.(segments)
            } catch {}
        }
    })

    const transcribe = (audioPath: string): Promise<TranscriptSegment[]> =>
        new Promise<TranscriptSegment[]>((resolve, reject) => {
            const timeout = setTimeout(() => {
                const i: number = queue.indexOf(resolve)
                if (i !== -1) queue.splice(i, 1)
                reject(new Error('Whisper timeout'))
            }, AUDIO_TIMEOUT_MS)

            queue.push((segments: TranscriptSegment[]) => {
                clearTimeout(timeout)
                resolve(segments)
            })

            proc.stdin!.write(audioPath + '\n')
        })

    const kill = (): void => { proc.kill() }

    return { proc, transcribe, kill }
}
