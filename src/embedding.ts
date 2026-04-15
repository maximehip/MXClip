import ollama from 'ollama'
import { EmbeddedEvent } from './types/EmbeddedEvent'
import { VideoTimeline } from './types/VideoTimeline'
import { TranscriptSegment } from './types/TranscriptSegment'
import { VisualDescription } from './types/VisualDescription'
import { nowClock } from './utils'
import { record, timer } from './metrics'

export async function getEmbedding(text: string): Promise<number[]> {
    const response = await ollama.embed({ model: 'nomic-embed-text', input: text })
    return response.embeddings[0]
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const response = await ollama.embed({ model: 'nomic-embed-text', input: texts })
    return response.embeddings
}

export async function embedTimelineEvent(events: VideoTimeline): Promise<EmbeddedEvent[]> {
    const elapsed = timer()
    const items = events.events.map(event => {
        const isAudio = 'text' in event
        const text = isAudio ? (event as TranscriptSegment).text : (event as VisualDescription).description
        return {
            event,
            text,
            type: isAudio ? 'audio' : 'visual' as 'audio' | 'visual',
            speaker: isAudio ? (event as TranscriptSegment).speaker : undefined
        }
    })

    const BATCH_SIZE = 32
    const allEmbeddings: number[][] = []
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE)
        process.stdout.write(`\r[${nowClock()}] Embedding ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}...`)
        const embeddings = await getEmbeddingsBatch(batch.map(b => b.text))
        allEmbeddings.push(...embeddings)
    }
    process.stdout.write('\n')
    const ms = elapsed()
    const avgMs = items.length > 0 ? Math.round(ms / items.length) : 0
    record('embedding', ms, 'ms', { events: items.length, avg_ms_per_event: avgMs })
    console.log(`[${nowClock()}] Embedding done: ${items.length} events (${(ms / 1000).toFixed(2)}s, avg ${avgMs}ms/event)`)

    const embeddedEvents: EmbeddedEvent[] = items.map((item, i) => ({
        ...item.event,
        embedding: allEmbeddings[i],
        text: item.text,
        type: item.type,
        speaker: item.speaker
    }))

    return embeddedEvents
}

export function buildEventsWithoutEmbedding(events: VideoTimeline): EmbeddedEvent[] {
    return events.events.map(event => {
        const isAudio = 'text' in event
        const text = isAudio ? (event as TranscriptSegment).text : (event as VisualDescription).description
        return {
            ...event,
            embedding: [] as number[],
            text,
            type: isAudio ? 'audio' : 'visual' as 'audio' | 'visual',
            speaker: isAudio ? (event as TranscriptSegment).speaker : undefined
        }
    })
}
