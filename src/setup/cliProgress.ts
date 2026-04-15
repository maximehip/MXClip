import { ModelKey, ModelProgress } from './modelSetup'

interface BarState {
    label: string
    pct: number
    status: 'pending' | 'downloading' | 'ready' | 'done' | 'error'
    message: string
}

const MODEL_DEFS: Array<{ key: ModelKey; label: string }> = [
    { key: 'whisper',          label: 'Whisper' },
    { key: 'nomic-embed-text', label: 'nomic-embed-text' },
    { key: 'gemma4:e4b',       label: 'gemma4:e4b' },
    { key: 'fastvlm',          label: 'FastVLM (Apple)' },
]

const BAR_WIDTH = 24
const LABEL_WIDTH = 22

const C = {
    reset:     '\x1b[0m',
    bold:      '\x1b[1m',
    dim:       '\x1b[2m',
    green:     '\x1b[32m',
    cyan:      '\x1b[36m',
    red:       '\x1b[31m',
    gray:      '\x1b[90m',
    up:        (n: number) => `\x1b[${n}A`,
    clearLine: '\x1b[2K\r',
}

export class CliProgressRenderer {
    private bars: Map<ModelKey, BarState> = new Map()
    private rendered = false
    // header line + blank line + N bar lines
    private readonly headerLines = 2

    constructor() {
        for (const { key, label } of MODEL_DEFS) {
            this.bars.set(key, { label, pct: 0, status: 'pending', message: '' })
        }
    }

    start(): void {
        process.stdout.write(`\n${C.bold}  Vérification des modèles IA…${C.reset}\n\n`)
        for (const bar of this.bars.values()) {
            process.stdout.write(this.formatRow(bar) + '\n')
        }
        this.rendered = true
    }

    update(progress: ModelProgress): void {
        const bar = this.bars.get(progress.model)
        if (!bar) return

        switch (progress.status) {
            case 'checking':
                bar.status = 'pending'; bar.pct = 0; bar.message = ''
                break
            case 'ready':
                bar.status = 'ready'; bar.pct = 100; bar.message = 'déjà présent'
                break
            case 'downloading':
                bar.status = 'downloading'; bar.pct = progress.pct
                bar.message = progress.message ?? ''
                break
            case 'done':
                bar.status = 'done'; bar.pct = 100; bar.message = 'installé'
                break
            case 'error':
                bar.status = 'error'; bar.message = progress.message ?? 'erreur'
                break
        }

        if (this.rendered) this.redraw()
    }

    finish(): void {
        if (this.rendered) {
            this.redraw()
            process.stdout.write('\n')
        }
    }

    private redraw(): void {
        const totalLines = this.headerLines + this.bars.size
        process.stdout.write(C.up(totalLines))
        // skip header (2 lines already printed, just move past them)
        process.stdout.write(`\n\n`)
        for (const bar of this.bars.values()) {
            process.stdout.write(C.clearLine + this.formatRow(bar) + '\n')
        }
    }

    private formatRow(bar: BarState): string {
        const { icon, color } = this.statusStyle(bar.status)
        const label = bar.label.padEnd(LABEL_WIDTH)

        const filled = Math.round((bar.pct / 100) * BAR_WIDTH)
        const barStr = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
        const pctStr = `${bar.pct}%`.padStart(4)

        let suffix = ''
        if (bar.status === 'ready' || bar.status === 'done') {
            suffix = `  ${C.green}${bar.message}${C.reset}`
        } else if (bar.status === 'error') {
            suffix = `  ${C.red}✗ erreur${C.reset}`
        } else if (bar.status === 'downloading' && bar.message) {
            suffix = `  ${C.dim}${bar.message.slice(0, 26)}${C.reset}`
        } else if (bar.status === 'pending') {
            suffix = `  ${C.gray}en attente…${C.reset}`
        }

        return `  ${color}${icon}${C.reset} ${label} ${color}[${barStr}]${C.reset}${pctStr}${suffix}`
    }

    private statusStyle(status: BarState['status']): { icon: string; color: string } {
        switch (status) {
            case 'done':
            case 'ready':       return { icon: '✓', color: C.green }
            case 'downloading': return { icon: '↓', color: C.cyan }
            case 'error':       return { icon: '✗', color: C.red }
            default:            return { icon: '·', color: C.gray }
        }
    }
}
