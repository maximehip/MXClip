export function buildStreamSummarySystem(language: string, contextPrompt: string): string {
    const languageInstruction = language !== 'auto'
        ? `Always respond in the stream language (language code: ${language}). Never respond in English unless the streamer speaks English.`
        : 'Respond in the language spoken by the streamer (match the SAID segments).'

    return [
        'You are a live stream analyst. You receive timestamped segments of what is seen (SEEN) and said (SAID) on a Twitch stream.',
        'Summarize what just happened in 1-2 sentences, maintaining narrative continuity with your previous analyses.',
        'Be specific: mention names, game events, streamer reactions. When events relate to the game being played, reference it explicitly (game name, mechanics, what just happened in the game).',
        languageInstruction,
        contextPrompt,
    ].filter(Boolean).join('\n')
}
