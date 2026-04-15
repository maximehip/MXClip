import { VideoTimeline } from "./types/VideoTimeline";
import { TranscriptSegment } from "./types/TranscriptSegment";
import { getFrameTimestamp } from "./frame";
import { FaceAnalysisResult } from "./types/FaceDetection";
import { FrameCaption } from "./vision";
import path from 'path'
import fs from 'fs'


function findClosestFrame(timestamp: number, frames: FaceAnalysisResult['frames']) {
    let closest = frames[0]
    let minDist = Math.abs(closest.timestamp - timestamp)
    for (const frame of frames) {
        const dist = Math.abs(frame.timestamp - timestamp)
        if (dist < minDist) {
            minDist = dist
            closest = frame
        }
    }
    return closest
}

function buildSpeakerMap(audioTranscript: TranscriptSegment[], faceResult: FaceAnalysisResult, faceNames: { clusterId: string, name: string }[]): Record<string, string> {
    const speakerMap: Record<string, string> = {}
    if (faceResult.frames.length === 0) return speakerMap

    // Group audio segments by speaker
    const speakerSegments: Record<string, TranscriptSegment[]> = {}
    for (const seg of audioTranscript) {
        if (!seg.speaker) continue
        if (!speakerSegments[seg.speaker]) speakerSegments[seg.speaker] = []
        speakerSegments[seg.speaker].push(seg)
    }

    for (const [speaker, segments] of Object.entries(speakerSegments)) {
        // Count how often each known name appears on the closest frame
        const nameCounts: Record<string, number> = {}

        for (const seg of segments.slice(0, 3)) {
            const midpoint = (seg.start + seg.end) / 2
            const frame = findClosestFrame(midpoint, faceResult.frames)

            for (const face of frame.faces) {
                if (face.clusterId === -1) continue
                const entry = faceNames.find(e => e.clusterId === String(face.clusterId))
                if (entry) {
                    nameCounts[entry.name] = (nameCounts[entry.name] || 0) + 1
                }
            }
        }
        const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])
        if (sorted.length === 1) {
            speakerMap[speaker] = sorted[0][0]
        } else if (sorted.length > 1 && sorted[0][1] > sorted[1][1] * 2) {
            // The most seen person appears at least 2x more than the second
            speakerMap[speaker] = sorted[0][0]
        }
    }

    console.log('Speaker mapping:', speakerMap)
    return speakerMap
}

export function buildTimeline(audioTranscript: TranscriptSegment[], transcriptions: FrameCaption[], faceResult?: FaceAnalysisResult): VideoTimeline {
    const frames = transcriptions.map(t => `frames/${t.file}`)
    const namePath = path.resolve(__dirname, '..', 'output/face_name.json')
    const faceNames = fs.existsSync(namePath) ? JSON.parse(fs.readFileSync(namePath, 'utf-8')) : []

    const speakerMap = faceResult ? buildSpeakerMap(audioTranscript, faceResult, faceNames) : {}

    for (const seg of audioTranscript) {
        if (seg.speaker && speakerMap[seg.speaker]) {
            seg.speaker = speakerMap[seg.speaker]
        }
    }

    const timeline: VideoTimeline = {
        videoPath: '',
        events: []
    }

    const visualDescriptions = transcriptions.map((t, index) => {
        let description = t.caption
        const framePath = frames[index]

        if (faceResult) {
            const frameData = faceResult.frames.find(f => f.framePath === framePath.replace('frames/', ''))
            if (frameData && frameData.faces.length > 0) {
                const clusterIds = [...new Set(
                    frameData.faces
                        .filter(f => f.clusterId !== -1)
                        .map(f => f.clusterId)
                )]
                if (clusterIds.length > 0) {
                    const names = [...new Set(clusterIds.map(id => {
                        const faceNameEntry = faceNames.find((entry: { clusterId: string, name: string }) => entry.clusterId === String(id))
                        return faceNameEntry ? faceNameEntry.name : `Person_${id}`
                    }))]
                    description += ` [People present: ${names.join(', ')}]`
                }
                const personCount = frameData.personCount ?? 0
                const identifiedCount = frameData.faces.filter(f => f.clusterId !== -1).length
                const unidentified = personCount - identifiedCount
                if (unidentified > 0) {
                    description += ` [+ ${unidentified} personne(s) non identifiée(s)]`
                }
            }
        }

        return {
            description,
            start: getFrameTimestamp(framePath),
            path: framePath
        }
    })

    timeline.videoPath = frames[0].replace(/frame-\d+\.png/, 'video.mp4')

    timeline.events.push(...audioTranscript, ...visualDescriptions)

    timeline.events.sort((a, b) => a.start - b.start);

    console.log('Timeline built with ' + timeline.events.length + ' events.')

    return timeline;
}
