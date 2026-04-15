import fs from 'fs'
import path from 'path'
import { nowClock } from './utils'

interface MetricEntry {
    ts: string
    name: string
    value: number
    unit: string
    meta?: Record<string, string | number>
}

const entries: MetricEntry[] = []
const metricsFile = path.resolve(__dirname, '..', 'output', 'metrics.jsonl')
let pendingLines = ''
let flushTimer: NodeJS.Timeout | null = null

function ensureMetricsDir(): void {
    const dir = path.dirname(metricsFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function flushPending(sync: boolean = false): void {
    if (!pendingLines) return
    const chunk = pendingLines
    pendingLines = ''
    if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
    }

    try {
        ensureMetricsDir()
        if (sync) {
            fs.appendFileSync(metricsFile, chunk)
        } else {
            void fs.promises.appendFile(metricsFile, chunk).catch(() => {})
        }
    } catch {}
}

function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(() => flushPending(), 250)
}

export function record(name: string, value: number, unit: string = 'ms', meta?: Record<string, string | number>): void {
    const entry: MetricEntry = { ts: nowClock(), name, value, unit, meta }
    entries.push(entry)
    pendingLines += JSON.stringify(entry) + '\n'
    scheduleFlush()
}

/** Returns elapsed ms when called */
export function timer(): () => number {
    const start = Date.now()
    return () => Date.now() - start
}

export function printSummary(): void {
    flushPending(true)
    if (entries.length === 0) return
    const line = '─'.repeat(56)
    console.log(`\n[${nowClock()}] ┌${line}`)
    console.log(`[${nowClock()}] │  METRICS SUMMARY`)
    console.log(`[${nowClock()}] ├${line}`)
    for (const e of entries) {
        const val = e.unit === 'ms'
            ? (e.value >= 60000
                ? `${(e.value / 60000).toFixed(1)}min`
                : `${(e.value / 1000).toFixed(2)}s`)
            : `${e.value} ${e.unit}`
        const meta = e.meta
            ? '  ' + Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(' ')
            : ''
        console.log(`[${nowClock()}] │  ${e.name.padEnd(34)} ${val.padStart(9)}${meta}`)
    }
    console.log(`[${nowClock()}] └${line}\n`)
}

process.once('beforeExit', () => flushPending(true))
process.once('SIGINT', () => flushPending(true))
