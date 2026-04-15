import ollama from 'ollama'
import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { searchSimilar } from '../vectorSearch'
import { formatTime } from '../utils'
import { QA_SYSTEM_PROMPT_VIDEO } from '../prompts/qa'

const GLOBAL_KEYWORDS = ['résume', 'resume', 'résumé', 'summary', 'de quoi parle', 'sujet', 'en gros', 'globalement']
const PEOPLE_KEYWORDS = ['personne', 'personnes', 'visible', 'voit', 'regarde', 'face', 'qui est', 'qui parle']

// Sélectionne les événements les plus pertinents pour une question donnée.
// - Questions globales ("résume") → tous les événements
// - Questions sur les personnes → ajoute tous les visuels
// - Sinon → top-5 par similarité, avec au moins 3 visuels
export async function selectQAEvents(
    question: string,
    embeddings: EmbeddedEvent[]
): Promise<EmbeddedEvent[]> {
    const isGlobal = GLOBAL_KEYWORDS.some(k => question.toLowerCase().includes(k))
    const isPeople = PEOPLE_KEYWORDS.some(k => question.toLowerCase().includes(k))

    const pool = isGlobal ? embeddings : await searchSimilar(question, embeddings, 5)
    const selected = await searchSimilar(question, pool, 5)

    if (isPeople) {
        selected.push(...embeddings.filter(e => e.type === 'visual'))
    } else if (!selected.some(e => e.type === 'visual')) {
        const bestVisuals = await searchSimilar(question, embeddings.filter(e => e.type === 'visual'), 3)
        selected.push(...bestVisuals)
    }

    return selected.sort((a, b) => a.start - b.start)
}

// Formate une liste d'événements en bloc contexte pour le LLM.
export function formatQAContext(events: EmbeddedEvent[]): string {
    let context = 'RELEVANT SEGMENTS:\n\n'
    for (const e of events) {
        if (e.type === 'audio') {
            context += `[${formatTime(e.start)}] ${e.speaker ?? 'Someone'} SAID: "${e.text}"\n`
        } else if (e.type === 'visual') {
            context += `[${formatTime(e.start)}] SEEN: ${e.text}\n`
        } else if (e.type === 'chat') {
            context += `[${formatTime(e.start)}] CHAT: ${e.text}\n`
        }
    }
    return context
}

// Appelle le LLM avec le contexte et la question. Retourne la réponse.
export async function askQA(
    context: string,
    question: string,
    systemPrompt: string = QA_SYSTEM_PROMPT_VIDEO
): Promise<string> {
    const answer = await ollama.chat({
        model: 'gemma4:e4b',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${context}\n\nQuestion: ${question}` },
        ],
        options: { temperature: 1.0, top_p: 0.95, top_k: 64 },
    })
    return answer.message.content
}
