import fs from 'fs'
import path from 'path'
import { extractAudioFromVideo, transcribeAudio } from '../audio'
import { getVideoMetadata, setFrameFps } from '../frame'
import { extractCandidateFrames, focusSelectFrames, FOCUS_CANDIDATE_FPS } from '../focus'
import { analyzeAllFrames } from '../vision'
import { buildTimeline } from '../timeline'
import { embedTimelineEvent, buildEventsWithoutEmbedding } from '../embedding'
import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { cropFaces, detectFaces, getFaceSummary } from '../faces'
import { FaceAnalysisResult } from '../types/FaceDetection'
import { askFaceName } from '../askFaceName'
import { nowClock } from '../utils'

export interface VideoPipelineOptions {
    videoPath: string
    outputDir: string
    mode: 'Q&A' | 'Clip Detection'
    language: string
    onLog?: (msg: string) => void
}

export interface VideoPipelineResult {
    embeddedEvents: EmbeddedEvent[]
}

export async function runVideoPipeline(options: VideoPipelineOptions): Promise<VideoPipelineResult> {
    const { videoPath, outputDir, mode, language } = options
    const log = options.onLog ?? console.log

    const audioPath = path.resolve(outputDir, 'audio.wav')
    const timelinePath = path.resolve(outputDir, 'timeline.json')
    const embeddingPath = path.resolve(outputDir, 'embeddings_cache.json')
    const facesPath = path.resolve(outputDir, 'faces.json')
    const framesDir = path.resolve(outputDir, 'frames')

    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(framesDir, { recursive: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let timeline: any
    let embeddedEvents: EmbeddedEvent[]

    if (!fs.existsSync(timelinePath)) {
        setFrameFps(FOCUS_CANDIDATE_FPS)

        log(`[${nowClock()}] Extracting audio and frames...`)
        let selectedFrames: string[] = []
        await Promise.all([
            extractAudioFromVideo(videoPath, audioPath),
            (async () => {
                await getVideoMetadata(videoPath)
                const candidates = await extractCandidateFrames(videoPath, framesDir)
                const K = Math.min(150, Math.max(30, Math.ceil(candidates.length * 0.1)))
                selectedFrames = await focusSelectFrames(candidates, K)
            })()
        ])

        log(`[${nowClock()}] Transcribing audio and analyzing frames...`)
        const [audioTranscript, frameAnalyses] = await Promise.all([
            transcribeAudio(audioPath, language),
            analyzeAllFrames(framesDir, selectedFrames)
        ])
        log(`[${nowClock()}] Transcription and frame analysis done.`)

        let faceResult: FaceAnalysisResult | undefined
        if (mode === 'Q&A') {
            if (fs.existsSync(facesPath)) {
                log(`[${nowClock()}] Loading cached face detection results...`)
                faceResult = JSON.parse(fs.readFileSync(facesPath, 'utf-8')) as FaceAnalysisResult
            } else {
                try {
                    faceResult = await detectFaces(framesDir)
                    await cropFaces(faceResult)
                    fs.writeFileSync(facesPath, JSON.stringify(faceResult, null, 2))
                    const faceNamesPath = path.resolve(outputDir, 'face_name.json')
                    if (!fs.existsSync(faceNamesPath)) {
                        log(`[${nowClock()}] Asking for face names...`)
                        await askFaceName()
                    }
                    log(`[${nowClock()}] Face summary: ${JSON.stringify(getFaceSummary(faceResult))}`)
                } catch (err) {
                    log(`[${nowClock()}] Face detection failed, continuing without faces: ${(err as Error).message}`)
                }
            }
        }

        log(`[${nowClock()}] Building timeline...`)
        timeline = buildTimeline(audioTranscript, frameAnalyses, faceResult)
        fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2))
        log(`[${nowClock()}] Timeline saved.`)
    } else {
        log(`[${nowClock()}] Loading cached timeline...`)
        timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'))
    }

    if (mode === 'Clip Detection') {
        embeddedEvents = buildEventsWithoutEmbedding(timeline)
    } else if (!fs.existsSync(embeddingPath)) {
        log(`[${nowClock()}] Embedding timeline events...`)
        embeddedEvents = await embedTimelineEvent(timeline)
        fs.writeFileSync(embeddingPath, JSON.stringify(embeddedEvents, null, 2))
        log(`[${nowClock()}] Embeddings saved.`)
    } else {
        log(`[${nowClock()}] Loading cached embeddings...`)
        embeddedEvents = JSON.parse(fs.readFileSync(embeddingPath, 'utf-8')) as EmbeddedEvent[]
    }

    return { embeddedEvents }
}
