export interface DetectedFace {
    bbox: [number, number, number, number]
    confidence: number
    clusterId: number
    embedding: number[]
}

export interface FrameFaceData {
    framePath: string
    timestamp: number
    faces: DetectedFace[]
    personCount: number
}

export interface FaceAnalysisResult {
    totalFaces: number
    totalClusters: number
    frames: FrameFaceData[]
}