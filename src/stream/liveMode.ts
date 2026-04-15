import fs from 'fs'
import path from 'path'
import { ChildProcess } from 'child_process'
import { TranscriptSegment } from '../types/TranscriptSegment'
import { startFastVLMServer, FastVLMServer } from './fastvlmVision'
import { startAudioServer, AudioServer } from './audioServer'
import { ChatMonitor, ChatHype } from './chatMonitor'
import { formatTime, nowClock } from '../utils'
import { record, timer } from '../metrics'
import { computeFrameHash, hammingDistance } from './frameHash'
import { isWhisperNoise, isCommercialBreakCaption } from './noiseFilter'
import { buildStreamSummarySystem } from '../prompts/streamSummary'
import { buildClipDetectionPrompt, CLIP_DETECTION_SYSTEM } from '../prompts/clipDetection'

// ─── Constants & types ────────────────────────────────────────────────────────

const SUMMARY_DEBOUNCE_MS = 2000      // délai après le dernier event avant de déclencher le résumé
const SUMMARY_MIN_COOLDOWN_MS = 20000 // intervalle minimum entre deux résumés
const CLIP_DETECTION_INTERVAL_MS = 15000
const AUDIO_CHUNK_DURATION = 15
const NARRATIVE_BUFFER_SIZE = 4
const FRAME_BATCH_SIZE = 1  // FastVLM traite 1 frame à la fois mais très rapidement

// Seuil de similarité perceptuelle : 0-64 (distance de Hamming sur hash 8x8)
// < 18 = face cam normale (gestes, expressions, mouvements de tête) → skip
// 18-35 = changement modéré → skip sauf chat très actif
// > 35 = vrai changement visuel (screen share, objet montré, personne qui entre) → analyser
const FRAME_HASH_SKIP_THRESHOLD = 18
const FRAME_HASH_MINOR_THRESHOLD = 35
const FRAME_FORCE_INTERVAL_S = 20  // analyser au moins une frame toutes les 20s pour voir le gameplay

const CHAT_STREAM_DELAY_S = 7      // délai HLS Twitch (~5s) + réaction humaine (~2s)
const CHAT_SKIP_THRESHOLD = 4      // en dessous : skip LLM clip detection (sauf fallback events)
const CHAT_FORCE_THRESHOLD = 9     // au-dessus : clip forcé sans LLM (si arc actif, ≥2 cycles)
const FORCE_CLIP_COOLDOWN_MS = 60000

interface FaceResult {
    clusterIds: number[]
}

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

interface OllamaResponse {
    message: { content: string }
}

interface ClipDetectionResult {
    worthy: boolean
    score: number
    category: 'clash' | 'arrogance' | 'humor' | 'confession' | 'storytelling' | 'shocking_reveal' | 'emotional_peak' | 'achievement' | 'life_lesson' | 'controversial' | 'none'
    arc: 'starting' | 'ongoing' | 'climax' | 'none'
    reason: string
}

interface ActiveArc {
    category: string
    cycles: number
    lastReason: string
}

interface FrameEntry { path: string; timestamp: number; file: string }

export interface LiveModeCallbacks {
    onVisual?: (caption: string, timestamp: number, faceCount: number) => void
    onSummary?: (text: string, timestamp: number) => void
    onAudio?: (text: string, timestamp: number, speaker?: string) => void
    signal?: AbortSignal
}

function parseEarliestTimestamp(cycles: string[][]): number {
    let earliest = Infinity
    for (const cycle of cycles) {
        for (const event of cycle) {
            const m = event.match(/^\[(\d{2}):(\d{2})\]/)
            if (m) {
                const t = parseInt(m[1]) * 60 + parseInt(m[2])
                if (t < earliest) earliest = t
            }
        }
    }
    return earliest === Infinity ? 0 : earliest
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runLiveMode(
    framesDir: string,
    audioDir: string,
    faceServer: { proc: ChildProcess; nextResult: () => Promise<FaceResult> },
    faceNames: Record<number, string>,
    contextPrompt: string = '',
    onClipDetected: (clipName: string, segmentCount: number, startTimestamp: number) => void,
    channelName: string = '',
    language: string = 'auto',
    liveModeCallbacks?: LiveModeCallbacks
): Promise<void> {
    let visionServer: FastVLMServer = startFastVLMServer()
    let audioServer: AudioServer = startAudioServer('medium', language)
    const chatMonitor: ChatMonitor | null = channelName
        ? new ChatMonitor(channelName)
        : null

    // ─── State initialization ─────────────────────────────────────────────────

    let summaryDebounceTimer: NodeJS.Timeout | null = null
    let audioLoopTimer: NodeJS.Timeout | null = null
    let visionLoopTimer: NodeJS.Timeout | null = null
    let clipDetectionInterval: NodeJS.Timeout | null = null

    const shutdown = (): void => {
        if (summaryDebounceTimer) clearTimeout(summaryDebounceTimer)
        if (clipDetectionInterval) clearInterval(clipDetectionInterval)
        if (audioLoopTimer) clearTimeout(audioLoopTimer)
        if (visionLoopTimer) clearTimeout(visionLoopTimer)
        visionServer.kill()
        audioServer.kill()
        chatMonitor?.kill()
    }
    const sigintHandler = (): void => shutdown()
    process.on('SIGINT', sigintHandler)

    const processedFrames = new Set<string>()
    const processedAudio = new Set<string>()
    const frameBatch: FrameEntry[] = []
    let recentEvents: string[] = []
    let lastFrameHash: Buffer | null = null
    let currentTimestamp = 0
    let lastAnalyzedAt = 0
    let clipBuffer: string[] = []
    const narrativeBuffer: string[][] = []
    let timeOffset = 0
    let currentArc: ActiveArc | null = null
    let lastForcedClipAt = 0
    let inCommercialBreak = false
    let eventsSinceLastClipCheck = 0
    const streamStartWallMs = Date.now()
    let lastChatSampledWallMs = Date.now()
    const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []

    console.log('\n LIVE — Analyse en temps réel\n')

    const systemContent: string = buildStreamSummarySystem(language, contextPrompt)

    let lastSummaryAt = 0

    // ─── Summary engine ───────────────────────────────────────────────────────

    const runSummary = async (): Promise<void> => {
        if (recentEvents.length === 0) return
        const context = recentEvents.splice(0).join('\n')
        lastSummaryAt = Date.now()

        const ollama = require('ollama').default
        try {
            conversationHistory.push({ role: 'user', content: context })
            const messages: OllamaMessage[] = [
                { role: 'system', content: systemContent },
                ...conversationHistory
            ]
            const llmElapsed = timer()
            const answer: OllamaResponse = await ollama.chat({
                model: 'gemma4:e4b',
                messages,
                options: { temperature: 1.0, top_p: 0.95, top_k: 64 }
            })
            record('llm_summary', llmElapsed(), 'ms')
            const summary: string = answer.message.content
            conversationHistory.push({ role: 'assistant', content: summary })
            if (conversationHistory.length > 20) conversationHistory.splice(0, 2)

            console.log(`\n[${nowClock()}] ${'─'.repeat(44)}`)
            console.log(`   ${summary}`)
            console.log(`${'─'.repeat(50)}\n`)
            liveModeCallbacks?.onSummary?.(summary, currentTimestamp)
        } catch {}
    }

    const triggerSummary = (): void => {
        if (summaryDebounceTimer) clearTimeout(summaryDebounceTimer)
        summaryDebounceTimer = setTimeout(async (): Promise<void> => {
            summaryDebounceTimer = null
            if (recentEvents.length === 0) return

            const now = Date.now()
            const elapsed = now - lastSummaryAt
            if (elapsed < SUMMARY_MIN_COOLDOWN_MS) {
                summaryDebounceTimer = setTimeout(async (): Promise<void> => {
                    summaryDebounceTimer = null
                    if (recentEvents.length === 0) return
                    await runSummary()
                }, SUMMARY_MIN_COOLDOWN_MS - elapsed)
                return
            }
            await runSummary()
        }, SUMMARY_DEBOUNCE_MS)
    }

    // ─── Clip detection ───────────────────────────────────────────────────────

    clipDetectionInterval = setInterval(async (): Promise<void> => {
        if (clipBuffer.length === 0) return

        const currentCycle: string[] = clipBuffer.splice(0)
        narrativeBuffer.push(currentCycle)
        if (narrativeBuffer.length > NARRATIVE_BUFFER_SIZE) narrativeBuffer.shift()

        const chatHype: ChatHype | null = chatMonitor ? chatMonitor.getHype() : null
        const chatScore: number = chatHype?.score ?? 0
        const pendingEvents = eventsSinceLastClipCheck
        eventsSinceLastClipCheck = 0

        // Pre-flight : chat dormant ET pas assez d'events → économiser le GPU
        if (chatScore < CHAT_SKIP_THRESHOLD && pendingEvents < 3) return

        const now: number = Date.now()

        // Clip forcé : chat explose + arc narratif actif + cooldown respecté
        if (chatScore >= CHAT_FORCE_THRESHOLD && currentArc !== null && currentArc.cycles >= 2 && now - lastForcedClipAt >= FORCE_CLIP_COOLDOWN_MS) {
            lastForcedClipAt = now
            const clipName = `clip_${Date.now()}`
            const cycles: number = currentArc.cycles
            const segmentCount: number = Math.min(12, Math.max(4, cycles * 2 + 2))
            const startCycleIdx: number = Math.max(0, narrativeBuffer.length - cycles)
            const rawTimestamp: number = parseEarliestTimestamp(narrativeBuffer.slice(startCycleIdx))
            const startTimestamp: number = Math.max(0, rawTimestamp - CHAT_STREAM_DELAY_S)
            const estimatedDuration: number = segmentCount * 10 + 10

            const header = `CLIP FORCÉ — chat×${chatHype!.msgCount}`
            const pad = '═'.repeat(Math.max(0, 36 - header.length))
            console.log(`\n[${nowClock()}] ╔══════════ ${header} ${pad}╗`)
            console.log(`║  Chat score: ${chatScore.toFixed(1)}/10  |  Arc: ${currentArc.category}  |  Cycles: ${cycles}`)
            console.log(`║  Durée visée : ~${estimatedDuration}s  |  Depuis: ${formatTime(startTimestamp)} (−${CHAT_STREAM_DELAY_S}s délai)`)
            console.log(`╚${'═'.repeat(50)}╝\n`)

            onClipDetected(clipName, segmentCount, startTimestamp)
            return
        }

        // Analyse LLM normale
        const context: string = narrativeBuffer
            .map((cycle: string[], i: number) => `--- Cycle ${i + 1} ---\n${cycle.join('\n')}`)
            .join('\n\n')

        const chatLine: string = chatHype && chatHype.msgCount > 0
            ? `\n[CHAT ACTIVITY: ${chatHype.msgCount} msg/20s${chatHype.topEmotes.length > 0 ? ' — ' + chatHype.topEmotes.map(e => `${e.name} (${e.label})×${e.count}`).join(', ') : ''}]`
            : ''

        const detectionPrompt = buildClipDetectionPrompt(context, chatLine, contextPrompt)

        try {
            const ollama = require('ollama').default
            const llmElapsed = timer()
            const response: OllamaResponse = await ollama.chat({
                model: 'gemma4:e4b',
                messages: [
                    { role: 'system', content: CLIP_DETECTION_SYSTEM },
                    { role: 'user', content: detectionPrompt }
                ],
                options: { temperature: 0.8, top_p: 0.95, top_k: 64 }
            })

            const raw: string = response.message.content.trim()
            const jsonMatch: RegExpMatchArray | null = raw.match(/\{[\s\S]*\}/)
            if (!jsonMatch) return

            const result: ClipDetectionResult = JSON.parse(jsonMatch[0]) as ClipDetectionResult
            record('llm_clip_detection', llmElapsed(), 'ms', { score: result.score, worthy: result.worthy ? 1 : 0, category: result.category })

            if (result.worthy && result.category !== 'none') {
                if (currentArc?.category === result.category) {
                    currentArc.cycles++
                    currentArc.lastReason = result.reason
                } else {
                    currentArc = { category: result.category, cycles: 1, lastReason: result.reason }
                }
            } else {
                currentArc = null
            }

            const chatBoost: boolean = chatScore >= 7
            const scoreThreshold: number = chatBoost ? 6 : 8

            const shouldAlert: boolean =
                result.score >= scoreThreshold &&
                result.worthy &&
                result.category !== 'none' &&
                currentArc !== null &&
                currentArc.cycles >= 2

            if (shouldAlert) {
                const clipName = `clip_${Date.now()}`
                const cycles: number = currentArc?.cycles ?? 1
                const segmentCount: number = Math.min(12, Math.max(2, cycles * 2 + 1))
                const estimatedDuration: number = segmentCount * 10 + 10
                const startCycleIdx: number = Math.max(0, narrativeBuffer.length - cycles)
                const rawTimestamp: number = parseEarliestTimestamp(narrativeBuffer.slice(startCycleIdx))
                const startTimestamp: number = chatBoost
                    ? Math.max(0, rawTimestamp - CHAT_STREAM_DELAY_S)
                    : rawTimestamp

                const chatTag: string = chatBoost ? ` 💬 chat×${chatHype!.msgCount}` : ''
                const header = `CLIP — ${result.category}${chatTag}`
                const pad = '═'.repeat(Math.max(0, 36 - header.length))
                console.log(`\n[${nowClock()}] ╔══════════ ${header} ${pad}╗`)
                console.log(`║  Score: ${result.score}/10  |  Arc: ${result.arc}  |  Cycles: ${cycles}`)
                console.log(`║  Durée visée : ~${estimatedDuration}s  |  Depuis: ${formatTime(startTimestamp)}${chatBoost ? ` (−${CHAT_STREAM_DELAY_S}s délai)` : ''}`)
                console.log(`║  "${result.reason}"`)
                console.log(`╚${'═'.repeat(50)}╝\n`)

                onClipDetected(clipName, segmentCount, startTimestamp)
            }
        } catch {
            // ignore les erreurs de parsing JSON ou de LLM
        }
    }, CLIP_DETECTION_INTERVAL_MS)

    // ─── Audio loop ───────────────────────────────────────────────────────────

    let audioChunksProcessed = 0
    let audioProcessing = false

    const runAudioLoop = async (): Promise<void> => {
        if (audioProcessing) return
        if (liveModeCallbacks?.signal?.aborted) return

        const allChunks: string[] = fs.readdirSync(audioDir)
            .filter((f: string) => f.endsWith('.wav'))
            .sort()

        // Tous sauf le dernier (ffmpeg écrit encore dedans)
        const readyChunks = allChunks.slice(0, -1).filter(f => !processedAudio.has(f))
        if (readyChunks.length === 0) return

        audioProcessing = true
        for (const chunk of readyChunks) {
            processedAudio.add(chunk)
            const chunkPath = path.join(audioDir, chunk)
            if (!fs.existsSync(chunkPath)) continue
            const sizeKb = Math.round(fs.statSync(chunkPath).size / 1024)
            if (sizeKb === 0) { process.stdout.write(`[${nowClock()}] [audio] skip ${chunk} (0 KB)\n`); continue }

            process.stdout.write(`[${nowClock()}] [audio] transcribing ${chunk} (${sizeKb} KB, offset=${timeOffset}s)...\n`)
            try {
                const audioElapsed = timer()
                const transcript: TranscriptSegment[] = await audioServer.transcribe(chunkPath)
                const ms = audioElapsed()
                audioChunksProcessed++
                process.stdout.write(`[${nowClock()}] [audio] done in ${(ms/1000).toFixed(1)}s — ${transcript.length} segments (chunk #${audioChunksProcessed})\n`)
                record('audio_chunk_transcription', ms, 'ms', { segments: transcript.length })
                let usefulSegments = 0
                for (const seg of transcript) {
                    if (isWhisperNoise(seg.text)) {
                        process.stdout.write(`[${nowClock()}] [audio] skip noise: "${seg.text}"\n`)
                        continue
                    }
                    if (inCommercialBreak) {
                        process.stdout.write(`[${nowClock()}] [audio] skip (pub): "${seg.text}"\n`)
                        continue
                    }
                    const start: number = seg.start + timeOffset
                    currentTimestamp = Math.max(currentTimestamp, start)
                    const event: string = `[${formatTime(start)}] SAID: "${seg.text}"`
                    recentEvents.push(event)
                    clipBuffer.push(event)
                    eventsSinceLastClipCheck++
                    usefulSegments++
                    process.stdout.write(`[${nowClock()}] [audio] → ${event}\n`)
                    liveModeCallbacks?.onAudio?.(seg.text, start, seg.speaker)
                }
                // Injecter les messages chat reçus pendant ce chunk
                if (chatMonitor && !inCommercialBreak) {
                    const chatMsgs = chatMonitor.getMessagesSince(lastChatSampledWallMs)
                    lastChatSampledWallMs = Date.now()
                    for (const msg of chatMsgs) {
                        const msgStreamTime = Math.max(0, (msg.wallMs - streamStartWallMs) / 1000 - CHAT_STREAM_DELAY_S)
                        const event = `[${formatTime(msgStreamTime)}] CHAT: "${msg.text}"`
                        recentEvents.push(event)
                        clipBuffer.push(event)
                        process.stdout.write(`[${nowClock()}] [chat] → ${event}\n`)
                    }
                    if (chatMsgs.length > 0) eventsSinceLastClipCheck += chatMsgs.length
                }

                if (usefulSegments > 0) triggerSummary()
                timeOffset += AUDIO_CHUNK_DURATION
            } catch (err) {
                process.stdout.write(`[${nowClock()}] [audio] ERROR on ${chunk}: ${(err as Error).message}\n`)
            } finally {
                try { fs.rmSync(chunkPath, { force: true }) } catch {}
            }
        }
        audioProcessing = false
    }

    const scheduleAudioLoop = (): void => {
        if (liveModeCallbacks?.signal?.aborted) return
        audioLoopTimer = setTimeout(async () => {
            try {
                await runAudioLoop()
            } finally {
                scheduleAudioLoop()
            }
        }, 2000)
    }
    scheduleAudioLoop()

    // ─── Vision loop ──────────────────────────────────────────────────────────

    const VISION_INTERVAL_MS = 2000
    const MAX_PENDING = FRAME_BATCH_SIZE * 2
    let visionBusy = false
    let visionFramesAnalyzed = 0
    let visionConsecutiveTimeouts = 0
    const VISION_MAX_CONSECUTIVE_TIMEOUTS = 2

    const runVisionLoop = (): void => {
        if (visionBusy) return
        if (liveModeCallbacks?.signal?.aborted) return

        const allPending: string[] = fs.readdirSync(framesDir)
            .filter((f: string) => f.endsWith('.png') && !processedFrames.has(f))
            .sort()

        // Backlog : garder seulement les dernières frames
        if (allPending.length > MAX_PENDING) {
            const dropped = allPending.length - MAX_PENDING
            allPending.slice(0, dropped).forEach((f: string) => {
                processedFrames.add(f)
                try { fs.rmSync(path.join(framesDir, f), { force: true }) } catch {}
            })
            process.stdout.write(`[${nowClock()}] [vision] dropped ${dropped} backlog frame(s)\n`)
        }

        for (const f of allPending.slice(-MAX_PENDING)) {
            if (!processedFrames.has(f)) {
                processedFrames.add(f)
                const frameNum: number = parseInt(f.match(/(\d+)/)?.[1] ?? '1')
                frameBatch.push({ path: path.join(framesDir, f), timestamp: (frameNum - 1) * 2, file: f })
            }
        }

        if (frameBatch.length === 0) return

        const entry: FrameEntry = frameBatch.shift()!
        visionBusy = true

        const analyzeFrame = async (): Promise<void> => {
            let shouldAnalyze = false
            let skipReason = ''
            try {
                if (!fs.existsSync(entry.path)) { skipReason = 'file missing'; return }
                const stat = fs.statSync(entry.path)
                if (stat.size < 1024) { skipReason = 'still writing'; return }

                const hash = await computeFrameHash(entry.path)
                const secondsSinceLastAnalysis = entry.timestamp - lastAnalyzedAt

                if (lastFrameHash === null) {
                    shouldAnalyze = true
                } else {
                    const dist = hammingDistance(hash, lastFrameHash)
                    if (dist >= FRAME_HASH_MINOR_THRESHOLD) {
                        shouldAnalyze = true
                    } else if (dist >= FRAME_HASH_SKIP_THRESHOLD) {
                        const chatActive = (chatMonitor?.getHype().score ?? 0) >= CHAT_SKIP_THRESHOLD
                        shouldAnalyze = chatActive || secondsSinceLastAnalysis >= FRAME_FORCE_INTERVAL_S / 2
                        if (!shouldAnalyze) skipReason = `minor change (dist=${dist}, chat inactive, ${Math.round(secondsSinceLastAnalysis)}s ago)`
                    } else {
                        shouldAnalyze = secondsSinceLastAnalysis >= FRAME_FORCE_INTERVAL_S
                        if (!shouldAnalyze) skipReason = `face cam (dist=${dist}, force in ${Math.round(FRAME_FORCE_INTERVAL_S - secondsSinceLastAnalysis)}s)`
                    }
                }
                if (shouldAnalyze) lastFrameHash = hash
            } catch (err) {
                skipReason = `hash error: ${(err as Error).message}`
                shouldAnalyze = false
            }

            if (!shouldAnalyze) {
                process.stdout.write(`[${nowClock()}] [vision] skip ${entry.file} — ${skipReason}\n`)
                record('vision_frame_skipped', 1, 'count')
                try { fs.rmSync(entry.path, { force: true }) } catch {}
                return
            }

            process.stdout.write(`[${nowClock()}] [vision] analyzing ${entry.file} (t=${entry.timestamp}s)...\n`)
            const visionElapsed = timer()
            try {
                const captionPromise = visionServer.caption(entry.path)
                const facePromise: Promise<FaceResult> = faceServer.nextResult()
                faceServer.proc.stdin!.write(entry.path + '\n')

                const [caption, faceResult] = await Promise.all([captionPromise, facePromise])
                const ms = visionElapsed()
                visionFramesAnalyzed++
                record('vision_frame_latency', ms, 'ms')
                lastAnalyzedAt = entry.timestamp
                process.stdout.write(`[${nowClock()}] [vision] done in ${(ms/1000).toFixed(1)}s (frame #${visionFramesAnalyzed})\n`)

                let description: string = caption.caption
                if (faceResult.clusterIds.length > 0) {
                    const names: string[] = [...new Set(
                        faceResult.clusterIds
                            .filter((id: number) => id !== -1)
                            .map((id: number) => faceNames[id] ?? `Personne_${id}`)
                    )]
                    if (names.length > 0) description += ` [${names.join(', ')}]`
                }

                // Détection coupure pub
                if (isCommercialBreakCaption(description)) {
                    if (!inCommercialBreak) {
                        inCommercialBreak = true
                        process.stdout.write(`[${nowClock()}] [pub] Coupure publicitaire détectée — analyse suspendue\n`)
                    }
                    return
                }
                if (inCommercialBreak) {
                    inCommercialBreak = false
                    process.stdout.write(`[${nowClock()}] [pub] Fin de la coupure publicitaire — reprise\n`)
                }

                currentTimestamp = entry.timestamp
                const event: string = `[${formatTime(entry.timestamp)}] SEEN: ${description}`
                recentEvents.push(event)
                clipBuffer.push(event)
                eventsSinceLastClipCheck++
                process.stdout.write(`[${nowClock()}] [vision] → ${event}\n`)
                triggerSummary()
                liveModeCallbacks?.onVisual?.(
                    caption.caption,
                    entry.timestamp,
                    faceResult.clusterIds.filter((id: number) => id !== -1).length
                )
                visionConsecutiveTimeouts = 0
            } catch (err) {
                const msg = (err as Error).message
                process.stdout.write(`[${nowClock()}] [vision] ERROR on ${entry.file}: ${msg}\n`)

                if (msg.includes('timeout')) {
                    visionConsecutiveTimeouts++
                    if (visionConsecutiveTimeouts >= VISION_MAX_CONSECUTIVE_TIMEOUTS) {
                        visionConsecutiveTimeouts = 0
                        process.stdout.write(`[${nowClock()}] [vision] ${VISION_MAX_CONSECUTIVE_TIMEOUTS} timeouts consécutifs — redémarrage FastVLM...\n`)
                        visionServer.kill()
                        visionServer = startFastVLMServer()
                        await visionServer.ready
                        process.stdout.write(`[${nowClock()}] [vision] FastVLM redémarré\n`)
                    }
                }
            } finally {
                try { fs.rmSync(entry.path, { force: true }) } catch {}
            }
        }

        analyzeFrame().finally(() => { visionBusy = false })
    }

    const scheduleVisionLoop = (): void => {
        if (liveModeCallbacks?.signal?.aborted) return
        visionLoopTimer = setTimeout(() => {
            try {
                runVisionLoop()
            } finally {
                scheduleVisionLoop()
            }
        }, VISION_INTERVAL_MS)
    }
    scheduleVisionLoop()

    // Garder runLiveMode actif ; résoudre uniquement si un abort signal est fourni (mode Electron)
    await new Promise<void>((resolve) => {
        if (liveModeCallbacks?.signal) {
            liveModeCallbacks.signal.addEventListener('abort', () => {
                shutdown()
                process.off('SIGINT', sigintHandler)
                resolve()
            }, { once: true })
        }
        // CLI : pas de signal → ne résout jamais (comportement original)
    })
}
