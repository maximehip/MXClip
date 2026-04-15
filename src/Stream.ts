import input from '@inquirer/input'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { EmbeddedEvent } from './types/EmbeddedEvent'
import { streamMenu, languageMenu } from './menu'
import { runLiveMode } from './stream/liveMode'
import { makeReel } from './stream/reelMaker'
import { fetchStreamContext, buildContextPrompt, StreamContext } from './streamContext'
import { nowClock } from './utils'
import { startFaceServer } from './stream/faceServer'
import { startLiveExtractions } from './stream/ffmpegExtraction'
import { runQAMode } from './stream/qaMode'

export { startFaceServer } from './stream/faceServer'
export { startLiveExtractions } from './stream/ffmpegExtraction'

const outputDir = path.resolve(__dirname, '..', 'output')
const streamDir = path.resolve(outputDir, 'stream')
const framesDir = path.resolve(streamDir, 'frames')
const audioDir = path.resolve(streamDir, 'audio')
const bufferDir = path.resolve(streamDir, 'buffer')
const clipsDir = path.resolve(outputDir, 'clips')

export async function analyzeStream(): Promise<void> {
    const twitchUrl = await input({ message: 'Enter the Twitch stream URL:' })
    const channelNameMatch = twitchUrl.match(/twitch\.tv\/([a-zA-Z0-9_]+)/)
    const channelName: string = channelNameMatch ? channelNameMatch[1].toLowerCase() : ''
    console.log('Resolving stream URL via streamlink...')
    const m3u8Url = execSync(`streamlink --stream-url "${twitchUrl}" best`, { encoding: 'utf-8' }).trim()
    console.log('Stream URL resolved.\n')

    const streamCtx: StreamContext | null = await fetchStreamContext(twitchUrl)
    const contextPrompt: string = buildContextPrompt(streamCtx)

    if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true })
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true })
    if (fs.existsSync(bufferDir)) fs.rmSync(bufferDir, { recursive: true })
    fs.mkdirSync(framesDir, { recursive: true })
    fs.mkdirSync(audioDir, { recursive: true })
    fs.mkdirSync(bufferDir, { recursive: true })
    fs.mkdirSync(clipsDir, { recursive: true })

    const faceServer = startFaceServer()
    const faceNames: Record<number, string> = {}
    process.on('SIGINT', () => { faceServer.proc.kill(); process.exit(0) })

    console.log('Stream analysis started \n')

    const streamSelected = await streamMenu()
    const language = await languageMenu()

    if (streamSelected === 'Live Mode') {
        startLiveExtractions(m3u8Url, framesDir, audioDir, bufferDir)

        type ClipJob = { clipName: string; segmentCount: number; startTimestamp: number }
        const clipQueue: ClipJob[] = []
        let reelProcessing = false

        const processClipQueue = async (): Promise<void> => {
            if (reelProcessing || clipQueue.length === 0) return
            reelProcessing = true
            const job = clipQueue.shift()!
            const reelPath = await makeReel(bufferDir, clipsDir, job.clipName, job.segmentCount, job.startTimestamp)
            if (reelPath) process.stdout.write(`[${nowClock()}] [reel] Saved → ${path.basename(reelPath)}\n`)
            reelProcessing = false
            processClipQueue()
        }

        const onClipDetected = (clipName: string, segmentCount: number, startTimestamp: number): void => {
            clipQueue.push({ clipName, segmentCount, startTimestamp })
            processClipQueue()
        }

        await runLiveMode(framesDir, audioDir, faceServer, faceNames, contextPrompt, onClipDetected, channelName, language)
        return
    }

    // Q&A Mode
    const globalEmbeddings: EmbeddedEvent[] = []
    const timelineEvents: Array<Record<string, unknown>> = []
    const timelinePath = path.resolve(streamDir, 'timeline.json')
    const embeddingsPath = path.resolve(streamDir, 'embeddings_cache.json')

    await runQAMode({
        m3u8Url, framesDir, audioDir,
        faceServer, faceNames,
        globalEmbeddings, timelineEvents,
        language, channelName, contextPrompt,
        timelinePath, embeddingsPath,
    })
}
