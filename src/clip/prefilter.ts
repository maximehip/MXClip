import { nowClock } from '../utils'
import { record, timer } from '../metrics'
import { getEmbeddingsBatch } from '../embedding'
import { VIRAL_ANCHORS, EMBED_KEEP_RATIO, WindowWithContext } from './constants'

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom > 0 ? dot / denom : 0
}

export async function preFilterByEmbedding(windows: WindowWithContext[]): Promise<WindowWithContext[]> {
    if (windows.length <= 3) return windows

    const elapsed = timer()
    const texts = [
        ...VIRAL_ANCHORS,
        ...windows.map(w => w.context.slice(0, 800)),
    ]
    const embeddings = await getEmbeddingsBatch(texts)
    const anchorEmbeds = embeddings.slice(0, VIRAL_ANCHORS.length)
    const windowEmbeds = embeddings.slice(VIRAL_ANCHORS.length)

    const scored = windows.map((w, i) => ({
        ...w,
        viralScore: Math.max(...anchorEmbeds.map(a => cosineSimilarity(windowEmbeds[i], a)))
    }))

    const keepN = Math.ceil(windows.length * EMBED_KEEP_RATIO)
    const kept = [...scored]
        .sort((a, b) => b.viralScore - a.viralScore)
        .slice(0, keepN)
        .sort((a, b) => a.start - b.start)

    const eliminated = windows.length - kept.length
    record('embed_prefilter', elapsed(), 'ms', { total: windows.length, kept: kept.length, eliminated })
    console.log(`[${nowClock()}] [embed filter] ${kept.length}/${windows.length} windows kept (${eliminated} eliminated, ${(elapsed() / 1000).toFixed(2)}s)`)
    return kept
}
