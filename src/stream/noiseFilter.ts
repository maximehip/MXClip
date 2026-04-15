// Textes parasites récurrents produits par whisper (watermarks Twitch, silences, annotations)
export const WHISPER_NOISE_PATTERNS: string[] = [
    'amara.org',
    'sous-titres réalisés par la communauté',
    'subtitles by the amara',
    'sous-titres par la communauté',
]

// Balises whisper entre crochets ou astérisques : [Musique], *musique*, *Rire*, etc.
export const WHISPER_TAG_RE = /^\s*(\[[\w\s''éèêëàâùûüôîïç]+\]|\*[\w\s''éèêëàâùûüôîïç]+\*)\s*$/i

export const COMMERCIAL_BREAK_KEYWORDS: string[] = [
    'commercial break',
    'break in progress',
    'ad break',
    'publicité en cours',
]

export function isWhisperNoise(text: string): boolean {
    const lower = text.toLowerCase()
    if (WHISPER_TAG_RE.test(text)) return true
    return WHISPER_NOISE_PATTERNS.some(p => lower.includes(p))
}

export function isCommercialBreakCaption(caption: string): boolean {
    const lower = caption.toLowerCase()
    return COMMERCIAL_BREAK_KEYWORDS.some(k => lower.includes(k))
}
