import net from 'net'

const IRC_HOST = 'irc.chat.twitch.tv'
const IRC_PORT = 6667

const EMOTE_LABELS: Record<string, string> = {
    'PogChamp': 'Hype/Surprise', 'Pog': 'Hype/Surprise', 'PogU': 'Hype/Surprise',
    'POGGERS': 'Hype/Surprise', 'PogO': 'Hype/Surprise',
    'KEKW': 'Laughter', 'LUL': 'Laughter', 'LULW': 'Laughter', 'OMEGALUL': 'Laughter',
    'pepeLaugh': 'Laughter', 'LMAO': 'Laughter', 'xdd': 'Laughter', 'xqcL': 'Laughter',
    'monkaS': 'Anxiety/Tension', 'monkaW': 'Anxiety/Tension',
    'PauseChamp': 'Anticipation',
    'AYAYA': 'Cute/Excitement', 'HYPERS': 'Hype',
    'Clap': 'Applause',
    'EZ': 'Easy win',
    'GIGACHAD': 'Admiration', 'BASED': 'Agreement/Respect',
    'catJAM': 'Vibing',
    'OMGScoots': 'Shock', 'WutFace': 'Confusion/Shock',
    'FeelsGoodMan': 'Satisfaction',
    '5Head': 'Smart play',
    'BibleThump': 'Sadness'
}

// Exported so liveMode can use it for the prompt
export const HYPE_EMOTES = new Set(Object.keys(EMOTE_LABELS))

const WINDOW_MS = 20000

// Emojis et patterns typiques des messages système Twitch (sub, giftsub, raid, etc.)
const TWITCH_SYSTEM_RE = /[⭐🎁🎉🎊]|NEW SUB|vient d'offrir|a offert|gifted|subscribed|raided|bits/i

function isMeaningfulChatMessage(text: string): boolean {
    const trimmed = text.trim()
    // Exclure les messages système Twitch (subs, gift subs, raids...)
    if (TWITCH_SYSTEM_RE.test(trimmed)) return false
    // Exclure les @mentions pures (réponses à quelqu'un sans contenu propre)
    if (trimmed.startsWith('@') && trimmed.split(/\s+/).length <= 2) return false
    // Exclure les commandes !
    if (trimmed.startsWith('!')) return false
    const tokens = trimmed.split(/\s+/)
    // Au moins 3 mots réels (hors emotes, hors @pseudo)
    const realWords = tokens.filter(t => !HYPE_EMOTES.has(t) && !t.startsWith('@') && !t.startsWith('!')).length
    return realWords >= 3
}

interface ChatMessage {
    wallMs: number
    text: string
    hypeCount: number
}

export interface ChatHype {
    msgCount: number
    msgPerSec: number
    score: number                        // 0–10
    topEmotes: Array<{ name: string; count: number; label: string }>
    recentMessages: string[]             // derniers messages textuels (sans emote-spam)
}

export class ChatMonitor {
    private client: net.Socket
    private messages: ChatMessage[] = []
    private emoteCounts: Map<string, number> = new Map()
    private connected = false

    constructor(channelName: string) {
        this.client = new net.Socket()

        this.client.connect(IRC_PORT, IRC_HOST, () => {
            this.connected = true
            const nick = `justinfan${Math.floor(Math.random() * 99999)}`
            this.client.write(`PASS SCHMOOPIIE\r\n`)
            this.client.write(`NICK ${nick}\r\n`)
            this.client.write(`JOIN #${channelName.toLowerCase()}\r\n`)
        })

        this.client.on('error', () => { /* chat optionnel, on ignore silencieusement */ })

        let buffer = ''
        this.client.on('data', (data: Buffer) => {
            buffer += data.toString()
            const lines = buffer.split('\r\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                if (line.startsWith('PING')) {
                    this.client.write('PONG :tmi.twitch.tv\r\n')
                    continue
                }
                const match = line.match(/PRIVMSG #\w+ :(.+)/)
                if (!match) continue

                const text = match[1].trim()
                const tokens = text.split(/\s+/)
                let hypeCount = 0

                for (const token of tokens) {
                    if (HYPE_EMOTES.has(token)) {
                        hypeCount++
                        this.emoteCounts.set(token, (this.emoteCounts.get(token) ?? 0) + 1)
                    }
                }

                this.messages.push({ wallMs: Date.now(), text, hypeCount })
            }
        })
    }

    /** Messages avec du vrai texte arrivés après wallMs, pour injection dans la timeline stream */
    getMessagesSince(wallMs: number): Array<{ text: string; wallMs: number }> {
        return this.messages
            .filter(m => m.wallMs > wallMs && isMeaningfulChatMessage(m.text))
            .map(m => ({ text: m.text, wallMs: m.wallMs }))
    }

    getHype(): ChatHype {
        const now = Date.now()
        this.messages = this.messages.filter(m => now - m.wallMs <= WINDOW_MS)

        const msgCount = this.messages.filter(m => now - m.wallMs <= WINDOW_MS).length
        const msgPerSec = msgCount / (WINDOW_MS / 1000)

        const totalTokens = this.messages.reduce((acc, m) => acc + m.text.split(/\s+/).length, 0)
        const totalHype = this.messages.reduce((acc, m) => acc + m.hypeCount, 0)
        const emoteRate = totalTokens > 0 ? totalHype / totalTokens : 0

        // Score : 60% débit + 40% densité d'emotes
        const rateScore = Math.min(10, (msgPerSec / 5) * 10)
        const emoteScore = Math.min(10, (emoteRate / 0.25) * 10)
        const score = rateScore * 0.6 + emoteScore * 0.4

        const topEmotes = [...this.emoteCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name, count]) => ({ name, count, label: EMOTE_LABELS[name] ?? 'Reaction' }))

        // Garder les messages avec du vrai texte (pas que des emotes/commandes/@replies)
        const recentMessages = this.messages
            .filter(m => isMeaningfulChatMessage(m.text))
            .slice(-8)
            .map(m => m.text)

        return { msgCount, msgPerSec, score, topEmotes, recentMessages }
    }

    isConnected(): boolean {
        return this.connected
    }

    kill(): void {
        this.client.destroy()
    }
}
