export interface EmbeddedEvent {
    text: string
    start: number
    end?: number
    type: 'audio' | 'visual' | 'chat'
    embedding: number[]
    speaker?: string
}
