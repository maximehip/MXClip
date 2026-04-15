import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { nowClock } from '../utils'
import { FaceCaption } from '../faces'

const FACE_SERVER = path.resolve(__dirname, '..', '..', 'scripts', 'face_server.py')

export function startFaceServer(): { proc: ChildProcess; nextResult: () => Promise<FaceCaption> } {
    const proc = spawn('python3', [FACE_SERVER])

    proc.stderr.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach(l => {
            if (l.includes('ready') || l.includes('Re-clustered')) process.stdout.write(`[${nowClock()}] [face] ${l}\n`)
        })
    })

    let buffer = ''
    const queue: Array<(r: FaceCaption) => void> = []

    proc.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
                queue.shift()?.(JSON.parse(trimmed) as FaceCaption)
            } catch {}
        }
    })

    const nextResult = (): Promise<FaceCaption> => new Promise<FaceCaption>((resolve, reject) => {
        const handler = (r: FaceCaption): void => { clearTimeout(timeout); resolve(r) }
        const timeout = setTimeout(() => {
            const i = queue.indexOf(handler)
            if (i !== -1) queue.splice(i, 1)
            reject(new Error('Face server timeout'))
        }, 30000)
        queue.push(handler)
    })

    return { proc, nextResult }
}
