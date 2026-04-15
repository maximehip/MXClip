import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { getFrameTimestamp } from './frame'
import { DetectedFace, FaceAnalysisResult, FrameFaceData } from './types/FaceDetection'
import { record, timer } from './metrics'

const SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'face_detect.py')
const MAX_BUFFER = 50 * 1024 * 1024 // 50 MB

export interface FaceCaption { 
    frame: string; 
    clusterIds: number[]; 
    totalClusters: number 
}

export function detectFaces(framesDir: string): Promise<FaceAnalysisResult> {
    const elapsed = timer()
    return new Promise((resolve, reject) => {
        console.log('Starting face detection...')
        execFile(
            'python3',
            [SCRIPT_PATH, framesDir],
            { maxBuffer: MAX_BUFFER },
            (error, stdout, stderr) => {
                if (stderr) {
                    // Python logs go to stderr, print them
                    stderr.split('\n').forEach(line => {
                        if (line.trim()) console.log(`[face_detect] ${line}`)
                    })
                }
                if (error) {
                    return reject(new Error(`Face detection failed: ${error.message}`))
                }
                try {
                    const raw = JSON.parse(stdout)
                    // Enrich with timestamps
                    const frames: FrameFaceData[] = raw.frames.map((f: { framePath: string; faces: DetectedFace[] }) => ({
                        framePath: f.framePath,
                        timestamp: getFrameTimestamp(f.framePath),
                        faces: f.faces,
                    }))
                    const result: FaceAnalysisResult = {
                        totalFaces: raw.totalFaces,
                        totalClusters: raw.totalClusters,
                        frames,
                    }
                    const ms = elapsed()
                    record('face_detection', ms, 'ms', { faces: result.totalFaces, clusters: result.totalClusters })
                    console.log(`Face detection complete: ${result.totalFaces} faces, ${result.totalClusters} clusters (${(ms / 1000).toFixed(2)}s)`)
                    resolve(result)
                } catch (err) {
                    reject(new Error(`Failed to parse face detection output: ${err}`))
                }
            }
        )
    })
}

export function getFaceSummary(result: FaceAnalysisResult): Record<number, { appearances: number; firstSeen: number; lastSeen: number, name?: string }> {
    const summary: Record<number, { appearances: number; firstSeen: number; lastSeen: number, name?: string }> = {}
    const namePath = path.resolve(__dirname, '..', 'output/face_name.json')
    const faceNames = fs.existsSync(namePath) ? JSON.parse(fs.readFileSync(namePath, 'utf-8')) : []
    
    for (const frame of result.frames) {
        for (const face of frame.faces) {
            if (face.clusterId === -1) continue
            if (!summary[face.clusterId]) {
                summary[face.clusterId] = {
                    appearances: 0,
                    firstSeen: frame.timestamp,
                    lastSeen: frame.timestamp,
                    name: faceNames.find((entry: { clusterId: string, name: string }) => entry.clusterId === String(face.clusterId))?.name
                }
            }
            summary[face.clusterId].appearances++
            if (frame.timestamp < summary[face.clusterId].firstSeen) {
                summary[face.clusterId].firstSeen = frame.timestamp
            }
            if (frame.timestamp > summary[face.clusterId].lastSeen) {
                summary[face.clusterId].lastSeen = frame.timestamp
            }
        }
    }

    return summary
}

function getBestFacePerCluster(result: FaceAnalysisResult): Record<number, { face: DetectedFace; framePath: string; timestamp: number }> {
    const bestFaces: Record<number, { face: DetectedFace; framePath: string; timestamp: number }> = {}

    for (const frame of result.frames) {
        for (const face of frame.faces) {
            if (face.clusterId === -1) continue
            if (!bestFaces[face.clusterId] || face.confidence > bestFaces[face.clusterId].face.confidence) {
                bestFaces[face.clusterId] = {
                    face,
                    framePath: frame.framePath,
                    timestamp: frame.timestamp,
                }
            }
        }
    }
    return bestFaces
}

export async function cropFaces(result: FaceAnalysisResult): Promise<void> {
    let faces = getBestFacePerCluster(result)
     const outputDir = path.resolve(__dirname, '..', 'output/face_crop')
     const frameDir = path.resolve(__dirname, '..', 'output/frames')
     if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }
    for (const clusterId in faces) {
        const { face, framePath } = faces[clusterId]
        const outputPath = path.resolve(outputDir, `cluster_${clusterId}.jpg`)
        const [x, y, x2, y2] = face.bbox
        const w = Math.round(x2 - x)
        const h = Math.round(y2 - y)
        await sharp(path.join(frameDir, framePath))
            .extract({ left: Math.round(x), top: Math.round(y), width: w, height: h })
            .toFile(outputPath)
            .catch(err => {
                console.error(`Failed to crop face for cluster ${clusterId}:`, err)
            })
    }
}