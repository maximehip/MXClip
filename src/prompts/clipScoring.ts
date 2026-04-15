export function buildClipScoringPrompt(context: string, windowStart: number, windowEnd: number): string {
    return `Analyze this video segment and score its potential as a social media clip (YouTube Short, TikTok, Instagram Reel).

${context}

A great clip can be anywhere from 10 to 90 seconds — length doesn't matter, only impact does.
Prioritize SHORT punchy moments (10-30s) if the content is self-contained and has viral potential.

A great clip must:
- Open with a strong HOOK that immediately grabs attention
- Be self-contained: a viewer with zero context must understand and feel something
- End cleanly after the punchline or conclusion — never mid-sentence
- Make people want to share, comment, or react

A clip can be just ONE strong sentence if that sentence is powerful enough.

Viral content comes in many forms — score high for ANY of these:
- CLASH / CONFLICT: argument, confrontation, heated exchange, someone getting called out
- ARROGANCE / EGO: someone being overconfident, getting humiliated, disrespecting others
- FUNNY / HUMOR: joke, prank, absurd reaction, unexpected fail, awkward moment
- LOVE / ROMANCE: confession, declaration, emotional moment between people
- FRIENDSHIP / BETRAYAL: loyalty shown or broken, surprising support or backstab
- SHOCKING REVEAL: secret exposed, unexpected truth, confession, plot twist
- EMOTIONAL PEAK: tears, overwhelming joy, heartbreak, pride, raw vulnerability
- VICTORY / ACHIEVEMENT: win, milestone, comeback, triumph against the odds
- LIFE LESSON: realization, wake-up call, perspective shift, profound insight
- CONTROVERSIAL: bold opinion, taboo topic, statement people will debate

Output ONLY valid JSON, no markdown:
{
  "score": number,
  "category": "clash" | "arrogance" | "humor" | "love" | "friendship" | "shocking_reveal" | "emotional_peak" | "achievement" | "life_lesson" | "controversial" | "none",
  "reason": string,
  "hook": string,
  "startSeconds": number,
  "endSeconds": number
}

Rules:
- score 1-10. Be strict: only score 8+ if the moment genuinely stands on its own
- "startSeconds" and "endSeconds" are integers (whole seconds from video start, NOT MM:SS)
- "startSeconds" = the t= value of the hook sentence (the first word that grabs attention)
- "endSeconds" = the t= value AFTER the last word of the conclusion/punchline
- "hook" is the exact opening sentence or phrase the viewer hears first
- Prefer tight clips: if the best moment is 15s, set a 15s window, not 60s
- If score < 8, still provide valid startSeconds=${windowStart} endSeconds=${windowEnd}`
}

export const CLIP_SCORING_SYSTEM = `You are a social media clip detection system. Output ONLY valid JSON. Timestamps must be plain integers (seconds from video start), never MM:SS strings.`
