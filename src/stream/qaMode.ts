import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { ChildProcess } from 'child_process'
import { transcribeAudio } from '../audio'
import { getEmbedding } from '../embedding'
import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { TranscriptSegment } from '../types/TranscriptSegment'
import { FaceCaption } from '../faces'
import { ChatMonitor } from './chatMonitor'
import { startFastVLMServer, FastVLMServer } from './fastvlmVision'
import { startFrameExtraction, startAudioSegmentation } from './ffmpegExtraction'
import { nowClock } from '../utils'
import { selectQAEvents, formatQAContext, askQA } from '../qa/engine'
import { buildStreamQASystemPrompt } from '../prompts/qa'

const AUDIO_CHUNK_DURATION = 15
const CHAT_SAMPLE_EVERY = 5   // échantillonner le chat toutes les 5 itérations (~10s)
const MIN_EVENTS = 10

export interface QAModeParams {
    m3u8Url: string
    framesDir: string
    audioDir: string
    faceServer: { proc: ChildProcess; nextResult: () => Promise<FaceCaption> }
    faceNames: Record<number, string>
    globalEmbeddings: EmbeddedEvent[]
    timelineEvents: Array<Record<string, unknown>>
    language: string
    channelName: string
    contextPrompt: string
    timelinePath: string
    embeddingsPath: string
}

export async function runQAMode(params: QAModeParams): Promise<void> {
    const {
        m3u8Url, framesDir, audioDir, faceServer, faceNames,
        globalEmbeddings, timelineEvents, language, channelName,
        contextPrompt, timelinePath, embeddingsPath,
    } = params

    startFrameExtraction(m3u8Url, framesDir)
    startAudioSegmentation(m3u8Url, audioDir)

    const visionServer: FastVLMServer = startFastVLMServer()
    const qaChatMonitor: ChatMonitor | null = channelName ? new ChatMonitor(channelName) : null
    process.on('SIGINT', () => { faceServer.proc.kill(); visionServer.kill(); qaChatMonitor?.kill(); process.exit(0) })

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    let chatLoopCount = 0
    let readyNotified = false
    let timeOffset = 0

    const processedFrames = new Set<string>()
    const processedAudio = new Set<string>()

    // --- Q&A handler ---
    const streamSystemPrompt = buildStreamQASystemPrompt(contextPrompt)

    rl.on('line', async (question: string) => {
        if (!question.trim()) return
        if (globalEmbeddings.length < MIN_EVENTS) {
            console.log(`Pas encore assez de données (${globalEmbeddings.length}/${MIN_EVENTS} events), patiente quelques secondes...\n`)
            return
        }

        const events = await selectQAEvents(question, globalEmbeddings)
        const context = formatQAContext(events)
        const answer = await askQA(context, question, streamSystemPrompt)
        console.log(`\nAnswer: ${answer}\n`)
    })

    // --- Processing loop ---
    while (true) {
        await new Promise(r => setTimeout(r, 2000))

        // New frames
        const newFrames = fs.readdirSync(framesDir)
            .filter(f => f.endsWith('.png') && !processedFrames.has(f))
            .sort()

        for (const frame of newFrames) {
            processedFrames.add(frame)
            const framePath = path.join(framesDir, frame)
            const captionPromise = visionServer.caption(framePath)
            const facePromise = faceServer.nextResult()
            faceServer.proc.stdin!.write(framePath + '\n')
            try {
                const [caption, faceResult] = await Promise.all([captionPromise, facePromise])
                const frameNum = parseInt(frame.match(/(\d+)/)?.[1] ?? '1')
                const timestamp = (frameNum - 1) * 3

                let description = caption.caption
                if (faceResult.clusterIds.length > 0) {
                    const names = [...new Set(
                        faceResult.clusterIds
                            .filter((id: number) => id !== -1)
                            .map((id: number) => faceNames[id] ?? `Personne_${id}`)
                    )]
                    if (names.length > 0) description += ` [People present: ${names.join(', ')}]`
                    else description += ` [${faceResult.clusterIds.length} face(s) detected]`
                }

                const embedding = await getEmbedding(description)
                globalEmbeddings.push({ text: description, start: timestamp, type: 'visual', embedding })
                timelineEvents.push({ description, start: timestamp, path: frame })
            } catch {
                // skip frame on timeout
            } finally {
                fs.rmSync(framePath, { force: true })
            }
        }

        // Completed audio chunks
        const completedAudio = fs.readdirSync(audioDir)
            .filter(f => f.endsWith('.wav') && !processedAudio.has(f))
            .sort()
            .slice(0, -1)

        for (const chunk of completedAudio) {
            processedAudio.add(chunk)
            const chunkPath = path.join(audioDir, chunk)
            try {
                const transcript: TranscriptSegment[] = await transcribeAudio(chunkPath, language)
                for (const seg of transcript) {
                    const start = seg.start + timeOffset
                    const embedding = await getEmbedding(seg.text)
                    globalEmbeddings.push({ text: seg.text, start, type: 'audio', embedding, speaker: seg.speaker })
                    timelineEvents.push({ text: seg.text, start, end: seg.end + timeOffset, speaker: seg.speaker })
                }
                timeOffset += AUDIO_CHUNK_DURATION
            } catch {
            } finally {
                fs.rmSync(chunkPath, { force: true })
            }
        }

        // Pic de chat → événement dans le timeline pour le Q&A
        chatLoopCount++
        if (qaChatMonitor && chatLoopCount % CHAT_SAMPLE_EVERY === 0) {
            const hype = qaChatMonitor.getHype()
            if (hype.score >= 5 && hype.msgCount > 0) {
                const chatTimestamp = Math.max(0, timeOffset - 7)
                const label = hype.topEmotes.length > 0
                    ? `Chat spike: ${hype.msgCount} msgs — ${hype.topEmotes.map(e => `${e.name} (${e.label})`).join(', ')}`
                    : `Chat spike: ${hype.msgCount} msgs in 20s`
                const embedding = await getEmbedding(label)
                globalEmbeddings.push({ text: label, start: chatTimestamp, type: 'chat', embedding })
                timelineEvents.push({ text: label, start: chatTimestamp, type: 'chat' })
            }
        }

        // Persister timeline + embeddings après chaque cycle
        if (timelineEvents.length > 0) {
            const sorted = [...timelineEvents].sort((a, b) => (a.start as number) - (b.start as number))
            fs.writeFileSync(timelinePath, JSON.stringify({ videoPath: m3u8Url, events: sorted }, null, 2))
            fs.writeFileSync(embeddingsPath, JSON.stringify(globalEmbeddings, null, 2))
        }

        if (!readyNotified && globalEmbeddings.length >= MIN_EVENTS) {
            readyNotified = true
            console.log('\n--- Prêt. Pose ta question ---\n')
        } else if (!readyNotified) {
            process.stdout.write(`\rCollecte en cours... ${globalEmbeddings.length}/${MIN_EVENTS} events`)
        }
    }
}
