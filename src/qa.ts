import { EmbeddedEvent } from './types/EmbeddedEvent'
import { selectQAEvents, formatQAContext, askQA } from './qa/engine'

const readline = require('node:readline/promises')

export async function questionAnswering(embeddedEvents: EmbeddedEvent[]): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    while (true) {
        const question: string = await rl.question('What do you want to know about the video? ')
        if (!question) {
            console.log('No question provided. Exiting.')
            rl.close()
            return
        }

        const events = await selectQAEvents(question, embeddedEvents)
        const context = formatQAContext(events)
        const answer = await askQA(context, question)
        console.log('Answer:', answer)
    }
}
