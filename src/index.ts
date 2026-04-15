import 'dotenv/config'
import path from 'path'
import { questionAnswering } from './qa'
import { menu, videoMenu, languageMenu } from './menu'
import { analyzeStream } from './Stream'
import { detectAndCreateClips } from './clipVideo'
import { nowClock } from './utils'
import { record, timer, printSummary } from './metrics'
import { runVideoPipeline } from './pipeline/videoPipeline'
import { ensureModels } from './setup/modelSetup'
import { CliProgressRenderer } from './setup/cliProgress'

const outputDir = path.resolve(__dirname, '..', 'output')
const videoPath = path.resolve(__dirname, '..', 'video.mp4')

async function main(): Promise<void> {
    const totalElapsed = timer()
    try {
        const progress = new CliProgressRenderer()
        progress.start()
        await ensureModels(
            (_msg, level) => { if (level === 'error') process.stderr.write(_msg + '\n') },
            p => progress.update(p)
        )
        progress.finish()

        const mode = await menu()

        if (mode === 'Stream') {
            await analyzeStream()
            return
        }

        // Video mode
        const videoMode = await videoMenu()
        const language = await languageMenu()

        const { embeddedEvents } = await runVideoPipeline({
            videoPath,
            outputDir,
            mode: videoMode as 'Q&A' | 'Clip Detection',
            language,
        })

        if (videoMode === 'Clip Detection') {
            const clipsDir = path.resolve(outputDir, 'clips')
            await detectAndCreateClips(embeddedEvents, videoPath, clipsDir)
        } else {
            questionAnswering(embeddedEvents)
        }

        record('total_pipeline', totalElapsed(), 'ms')
        printSummary()
        console.log(`[${nowClock()}] Done.`)
    } catch (error) {
        console.error(error)
    }
}

main()
