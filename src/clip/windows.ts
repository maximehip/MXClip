import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { nowClock } from '../utils'
import { DENSITY_BUCKET_SIZE, WINDOW_DURATION, WINDOW_STEP, WindowWithContext } from './constants'

export function buildAdaptiveWindows(
    events: EmbeddedEvent[],
    maxTime: number
): Array<{ start: number; end: number }> {
    const numBuckets = Math.ceil(maxTime / DENSITY_BUCKET_SIZE)

    // Densité pondérée : nb de mots par bucket (audio > visuel)
    const density = new Float64Array(numBuckets)
    for (const e of events) {
        const bucket = Math.floor(e.start / DENSITY_BUCKET_SIZE)
        if (bucket >= numBuckets) continue
        density[bucket] += e.type === 'audio'
            ? (e.text?.split(/\s+/).length ?? 1)
            : 0.5
    }

    // Lissage (moyenne mobile sur 3 buckets)
    const smoothed = new Float64Array(numBuckets)
    for (let i = 0; i < numBuckets; i++) {
        let sum = 0, count = 0
        for (let j = Math.max(0, i - 1); j <= Math.min(numBuckets - 1, i + 1); j++) {
            sum += density[j]; count++
        }
        smoothed[i] = sum / count
    }

    // Trouver tous les maxima locaux
    const peaks: Array<{ time: number; score: number }> = []
    for (let i = 1; i < numBuckets - 1; i++) {
        if (smoothed[i] >= smoothed[i - 1] && smoothed[i] >= smoothed[i + 1] && smoothed[i] > 0) {
            peaks.push({ time: i * DENSITY_BUCKET_SIZE, score: smoothed[i] })
        }
    }

    // Sélection greedy avec gap minimum (comme NMS sur les pics)
    peaks.sort((a, b) => b.score - a.score)
    const selected: number[] = []
    for (const { time } of peaks) {
        if (selected.every(t => Math.abs(t - time) >= WINDOW_STEP)) {
            selected.push(time)
        }
    }
    selected.sort((a, b) => a - b)

    // Convertir en fenêtres centrées sur les pics
    const windows = selected.map(t => ({
        start: Math.max(0, t - WINDOW_DURATION / 2),
        end: Math.min(maxTime, t + WINDOW_DURATION / 2)
    }))

    // Combler les zones sans couverture (gap > WINDOW_DURATION)
    const covered = new Set(windows.flatMap(w => {
        const result: number[] = []
        for (let t = Math.floor(w.start / WINDOW_STEP); t * WINDOW_STEP < w.end; t++) {
            result.push(t)
        }
        return result
    }))
    for (let t = 0; t < maxTime; t += WINDOW_STEP) {
        const slot = Math.floor(t / WINDOW_STEP)
        if (!covered.has(slot)) {
            windows.push({ start: t, end: Math.min(maxTime, t + WINDOW_DURATION) })
        }
    }

    windows.sort((a, b) => a.start - b.start)
    console.log(`[${nowClock()}] [windows] ${windows.length} adaptive window(s) built (density-based)`)
    return windows
}

export function lowerBound(events: EmbeddedEvent[], target: number): number {
    let lo = 0
    let hi = events.length
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (events[mid].start < target) lo = mid + 1
        else hi = mid
    }
    return lo
}

export function buildWindowCandidates(
    events: EmbeddedEvent[],
    windows: Array<{ start: number; end: number }>
): WindowWithContext[] {
    const sortedEvents = [...events].sort((a, b) => a.start - b.start)
    const audioPrefix = new Array(sortedEvents.length + 1).fill(0)

    for (let i = 0; i < sortedEvents.length; i++) {
        audioPrefix[i + 1] = audioPrefix[i] + (sortedEvents[i].type === 'audio' ? 1 : 0)
    }

    return windows.map((window) => {
        const startIdx = lowerBound(sortedEvents, window.start)
        const endIdx = lowerBound(sortedEvents, window.end)
        const context = sortedEvents
            .slice(startIdx, endIdx)
            .map((e) => {
                const ts = Math.round(e.start)
                if (e.type === 'audio') return `[t=${ts}s] ${e.speaker ?? 'Someone'} SAID: "${e.text}"`
                if (e.type === 'visual') return `[t=${ts}s] SEEN: ${e.text}`
                return `[t=${ts}s] ${e.text}`
            })
            .join('\n')

        return {
            ...window,
            context,
            audioCount: audioPrefix[endIdx] - audioPrefix[startIdx],
        }
    })
}
