export function buildClipDetectionPrompt(context: string, chatLine: string, contextPrompt: string): string {
    return `Analyze the following live stream segments and determine if this moment is worth clipping for social media (TikTok, YouTube Shorts, Instagram Reels).

${contextPrompt ? contextPrompt + '\n\n' : ''}${context}${chatLine}

Output ONLY a valid JSON object with no markdown, no explanation:
{
  "worthy": boolean,
  "score": number,
  "category": "clash" | "arrogance" | "humor" | "confession" | "storytelling" | "shocking_reveal" | "emotional_peak" | "achievement" | "life_lesson" | "controversial" | "none",
  "arc": "starting" | "ongoing" | "climax" | "none",
  "reason": string
}

Category definitions:
- clash: argument, confrontation, heated exchange, someone getting called out
- arrogance: someone overconfident, getting humiliated, ego moment, getting owned
- humor: joke, prank, absurd reaction, unexpected fail, awkward or genuinely funny moment
- confession: streamer or guest shares something personal, intimate, or vulnerable about themselves
- storytelling: recounts an anecdote with a clear structure — setup, development, punchline
- shocking_reveal: secret exposed, unexpected truth, plot twist, announcement nobody saw coming
- emotional_peak: intense reaction — tears, overwhelming joy, heartbreak, pride, raw vulnerability
- achievement: notable win, milestone, comeback, triumph, impressive in-game or IRL moment
- life_lesson: realization, wake-up call, profound insight, perspective shift
- controversial: bold opinion, taboo topic, strong take, tension, drama, heated debate
- none: nothing noteworthy

Scoring: 1-10. Score 7+ means clip-worthy. High chat activity (many messages, hype emotes) is a strong signal.
If chat hype is high but SEEN/SAID seem neutral, look for subtle irony, an off-screen reaction, or a moment the vision model missed.
Arc: starting=topic just began, ongoing=in development, climax=peak moment/punchline, none=no arc.`
}

export const CLIP_DETECTION_SYSTEM = `You are a Twitch clip detection system. You analyze stream segments and output ONLY valid JSON with no markdown, no extra text. Use the stream context (game, title, streamer) to better judge whether a moment is clip-worthy — a reaction to a game event scores higher when the game context makes it significant.`
