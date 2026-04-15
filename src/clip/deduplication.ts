import { ScoredWindow } from './constants'

// Non-Maximum Suppression : parmi des fenêtres qui se chevauchent, garde seulement la meilleure
export function applyNMS(windows: ScoredWindow[], minGap: number): ScoredWindow[] {
    const sorted = [...windows].sort((a, b) => b.score - a.score)
    const kept: ScoredWindow[] = []

    for (const w of sorted) {
        const tooClose = kept.some(k => {
            const overlapStart = Math.max(w.startSeconds, k.startSeconds)
            const overlapEnd = Math.min(w.endSeconds, k.endSeconds)
            const hasOverlap = overlapEnd > overlapStart
            const tooNear = Math.abs(w.startSeconds - k.startSeconds) < minGap
            return hasOverlap || tooNear
        })
        if (!tooClose) kept.push(w)
    }

    return kept.sort((a, b) => a.startSeconds - b.startSeconds)
}
