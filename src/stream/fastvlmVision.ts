import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { FrameCaption } from '../vision'

const FASTVLM_SERVER = path.resolve(__dirname, '..', '..', 'scripts', 'fastvlm_server.py')
const VENV_PYTHON = path.resolve(__dirname, '..', '..', 'venv', 'bin', 'python3')
const FASTVLM_TIMEOUT_MS = 120_000

export interface FastVLMServer {
    proc: ChildProcess
    ready: Promise<void>
    caption: (framePath: string) => Promise<FrameCaption>
    kill: () => void
}

export function startFastVLMServer(mode: 'stream' | 'video' = 'stream'): FastVLMServer {
    const proc = spawn(VENV_PYTHON, [FASTVLM_SERVER, '--mode', mode])

    let resolveReady!: () => void
    const ready = new Promise<void>(resolve => { resolveReady = resolve })

    proc.stderr.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach((l: string) => {
            if (l.includes('ready')) {
                resolveReady()
                process.stdout.write(`[fastvlm] ${l}\n`)
            } else if (l.includes('Device') || l.includes('Error')) {
                process.stdout.write(`[fastvlm] ${l}\n`)
            }
        })
    })

    let buffer: string = ''
    const queue: Array<(result: FrameCaption) => void> = []

    proc.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines: string[] = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            const trimmed: string = line.trim()
            if (!trimmed) continue
            try {
                const parsed: { file: string; caption: string } = JSON.parse(trimmed)
                queue.shift()?.({ file: parsed.file, caption: parsed.caption })
            } catch {}
        }
    })

    const caption = (framePath: string): Promise<FrameCaption> =>
        new Promise<FrameCaption>((resolve, reject) => {
            const handler = (r: FrameCaption): void => {
                clearTimeout(timeout)
                resolve(r)
            }
            const timeout = setTimeout(() => {
                const i: number = queue.indexOf(handler)
                if (i !== -1) queue.splice(i, 1)
                reject(new Error('FastVLM timeout'))
            }, FASTVLM_TIMEOUT_MS)

            queue.push(handler)
            proc.stdin!.write(framePath + '\n')
        })

    const kill = (): void => { proc.kill() }

    return { proc, ready, caption, kill }
}
