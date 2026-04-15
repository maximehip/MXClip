import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { SNAP_START_LOOK_AHEAD, SNAP_START_LOOK_BACK, SNAP_END_LOOK_BACK } from './constants'

// Snap le début : cherche le début de segment le plus proche APRÈS t.
// On ne recule que de 0.2s maximum — évite d'inclure la phrase qui précède le hook.
// Préférence pour aller en avant (penalty sur le recul).
export function snapClipStart(t: number, audioEvents: EmbeddedEvent[]): number {
    let best = t
    let bestScore = Infinity
    for (const e of audioEvents) {
        const dist = e.start - t  // positif = après t, négatif = avant t
        if (dist > SNAP_START_LOOK_AHEAD) continue
        if (dist < -SNAP_START_LOOK_BACK) continue
        // Pénalise légèrement le recul pour préférer avancer plutôt que reculer
        const score = dist < 0 ? Math.abs(dist) * 3 : Math.abs(dist)
        if (score < bestScore) { bestScore = score; best = e.start }
    }
    return best
}

// Snap la fin : cherche la fin de segment naturelle la plus proche de t.
// Stratégie : trouver le segment qui se termine juste après t (pause naturelle après le dernier mot).
// On accepte de finir jusqu'à 6s après t pour tomber sur une vraie fin de phrase.
// On ne recule jamais de plus de SNAP_END_LOOK_BACK secondes (évite de couper trop tôt).
export function snapClipEnd(t: number, audioEvents: EmbeddedEvent[]): number {
    const SNAP_END_LOOK_AHEAD = 6  // secondes max pour avancer la fin (trouver la fin de phrase)

    // Priorité 1 : fin de segment la plus proche après t (≤ 6s après)
    let bestByEnd: number | null = null
    let bestEndDist = Infinity
    for (const e of audioEvents) {
        if (!e.end) continue
        const dist = e.end - t  // positif = après t
        if (dist < -SNAP_END_LOOK_BACK || dist > SNAP_END_LOOK_AHEAD) continue
        if (dist < bestEndDist) { bestEndDist = dist; bestByEnd = e.end }
    }
    if (bestByEnd !== null) return bestByEnd

    // Priorité 2 : fallback — fin ou début de segment le plus proche autour de t
    let best = t
    let bestDist = Infinity
    for (const e of audioEvents) {
        const boundary = e.end ?? e.start
        const dist = boundary - t
        if (dist < -SNAP_END_LOOK_BACK || dist > 10) continue
        if (Math.abs(dist) < bestDist) { bestDist = Math.abs(dist); best = boundary }
    }
    return best
}
