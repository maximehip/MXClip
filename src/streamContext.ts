import fetch from 'node-fetch'

export interface StreamContext {
    streamerName: string
    streamTitle: string
    gameName: string
    streamerDescription: string
    tags: string[]
}

interface TwitchTokenResponse {
    access_token: string
    expires_in: number
    token_type: string
}

interface TwitchStream {
    user_name: string
    title: string
    game_name: string
    tags: string[]
}

interface TwitchUser {
    description: string
}

interface TwitchApiResponse<T> {
    data: T[]
}

async function getTwitchAppToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: 'POST' }
    )
    const data = await res.json() as TwitchTokenResponse
    return data.access_token
}

function parseChannelName(twitchUrl: string): string {
    const match = twitchUrl.match(/twitch\.tv\/([a-zA-Z0-9_]+)/)
    if (!match) throw new Error(`Cannot parse channel name from URL: ${twitchUrl}`)
    return match[1].toLowerCase()
}

export async function fetchStreamContext(twitchUrl: string): Promise<StreamContext | null> {
    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        console.log('[context] TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set, skipping stream context.')
        return null
    }

    const channelName = parseChannelName(twitchUrl)

    try {
        const token = await getTwitchAppToken(clientId, clientSecret)
        const headers: Record<string, string> = {
            'Client-Id': clientId,
            'Authorization': `Bearer ${token}`
        }

        const [streamRes, userRes] = await Promise.all([
            fetch(`https://api.twitch.tv/helix/streams?user_login=${channelName}`, { headers }),
            fetch(`https://api.twitch.tv/helix/users?login=${channelName}`, { headers })
        ])

        const streamData = await streamRes.json() as TwitchApiResponse<TwitchStream>
        const userData = await userRes.json() as TwitchApiResponse<TwitchUser>

        const stream = streamData.data[0]
        const user = userData.data[0]

        if (!stream) {
            console.log(`[context] Stream for "${channelName}" not found or offline.`)
            return null
        }

        console.log(`[context] Stream context loaded: "${stream.title}" — ${stream.game_name}`)

        return {
            streamerName: stream.user_name ?? channelName,
            streamTitle: stream.title ?? '',
            gameName: stream.game_name ?? 'Unknown',
            streamerDescription: user?.description ?? '',
            tags: stream.tags ?? []
        }
    } catch (err) {
        console.warn('[context] Failed to fetch stream context:', err)
        return null
    }
}

export function buildContextPrompt(ctx: StreamContext | null): string {
    if (!ctx) return ''

    const lines: string[] = [
        `STREAM CONTEXT:`,
        `- Streamer: ${ctx.streamerName}`,
        `- Title: "${ctx.streamTitle}"`,
        `- Game/Category: ${ctx.gameName}`,
    ]

    if (ctx.tags.length > 0) lines.push(`- Tags: ${ctx.tags.join(', ')}`)
    if (ctx.streamerDescription) lines.push(`- Streamer bio: ${ctx.streamerDescription}`)

    return lines.join('\n')
}
