import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { record, timer } from '../metrics'
import { ScoredWindow, VALID_CATEGORIES, ValidCategory } from './constants'
import { buildClipScoringPrompt, CLIP_SCORING_SYSTEM } from '../prompts/clipScoring'

export function parseTimestamp(value: unknown): number {
    if (typeof value === 'number' && isFinite(value)) return value
    if (typeof value === 'string') {
        const parts = value.split(':').map(Number)
        if (parts.length === 2 && parts.every(isFinite)) return parts[0] * 60 + parts[1]
        const n = Number(value)
        if (isFinite(n)) return n
    }
    return NaN
}

export function buildWindowContext(events: EmbeddedEvent[], windowStart: number, windowEnd: number): string {
    const inWindow = events
        .filter(e => e.start >= windowStart && e.start < windowEnd)
        .sort((a, b) => a.start - b.start)
    if (inWindow.length === 0) return ''
    return inWindow.map(e => {
        const ts = Math.round(e.start)
        if (e.type === 'audio') return `[t=${ts}s] ${e.speaker ?? 'Someone'} SAID: "${e.text}"`
        if (e.type === 'visual') return `[t=${ts}s] SEEN: ${e.text}`
        return `[t=${ts}s] ${e.text}`
    }).join('\n')
}

export async function scoreWindow(
    context: string,
    windowStart: number,
    windowEnd: number
): Promise<ScoredWindow | null> {
    if (!context.trim()) return null

    const ollama = require('ollama').default
    const prompt = buildClipScoringPrompt(context, windowStart, windowEnd)

    try {
        const llmElapsed = timer()
        const response = await ollama.chat({
            model: 'gemma4:e4b',
            messages: [
                { role: 'system', content: CLIP_SCORING_SYSTEM },
                { role: 'user', content: prompt }
            ],
            options: { temperature: 0.3, top_p: 0.9, top_k: 40 }
        })
        record('llm_window_score', llmElapsed(), 'ms', { window_start: windowStart, window_end: windowEnd })

        const raw = response.message.content.trim()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null

        const parsed = JSON.parse(jsonMatch[0])
        const score = typeof parsed.score === 'number' ? parsed.score : parseTimestamp(parsed.score)
        const startSeconds = parseTimestamp(parsed.startSeconds)
        const endSeconds = parseTimestamp(parsed.endSeconds)

        if (!isFinite(score) || !isFinite(startSeconds) || !isFinite(endSeconds)) return null

        const rawCategory: string = parsed.category ?? 'none'
        const category: ValidCategory = (VALID_CATEGORIES as readonly string[]).includes(rawCategory)
            ? rawCategory as ValidCategory
            : 'none'

        return {
            windowStart,
            windowEnd,
            score,
            category,
            reason: parsed.reason ?? '',
            hook: parsed.hook ?? '',
            startSeconds,
            endSeconds,
        }
    } catch {
        return null
    }
}
