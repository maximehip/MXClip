import { VideoMetadata } from "./types/VideoMetadata";
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { record, timer } from './metrics';

let frameFps = 0.5

export function setFrameFps(fps: number): void {
    frameFps = fps
}

const framesDir = path.resolve(__dirname, '..', './output/frames');

export async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                console.error(`Error retrieving video metadata: ${err.message}`);
                return reject(err);
            }
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const result: VideoMetadata = {
                duration: metadata.format.duration || 0,
                resolution: videoStream?.width && videoStream?.height ? `${videoStream.width}x${videoStream.height}` : '1920x1080',
                frameRate: videoStream?.avg_frame_rate ? parseFloat(videoStream.avg_frame_rate) : 30,
                codec: videoStream?.codec_name || 'H.264',
                fileSize: metadata.format.size || 0,
                creationDate: new Date()
            };
            record('video_metadata', result.duration, 's', {
                resolution: result.resolution,
                fps: Math.round(result.frameRate),
                size_mb: Math.round((result.fileSize ?? 0) / 1024 / 1024)
            });
            console.log(`[video] ${result.resolution} @ ${Math.round(result.frameRate)}fps — ${Math.round(result.duration)}s — ${Math.round((result.fileSize ?? 0) / 1024 / 1024)} MB`);
            resolve(result);
        });
    });
}

export async function extractFrames(videoPath: string): Promise<void> {
    if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, { recursive: true });
    }
    fs.mkdirSync(framesDir, { recursive: true });

    const elapsed = timer();
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .on('end', () => {
                const ms = elapsed();
                const frameCount = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).length;
                record('frame_extraction', ms, 'ms', { frames: frameCount });
                console.log(`Frames extracted successfully: ${frameCount} frames (${(ms / 1000).toFixed(2)}s)`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`Error extracting frames: ${err.message}`);
                reject(err);
            })
            .outputOptions(['-vf',
                `select='gt(scene,0.4)'`,
                "-vsync",
                "vfr"])
            .saveToFile(path.join(framesDir, 'frame-%04d.png'));
    });
}

export function getFrameTimestamp(filename: string): number {
    const match = filename.match(/frame-(\d+)/);
    if (!match) return 0;
    const frameNumber = parseInt(match[1], 10);
    return Math.floor((frameNumber - 1) / frameFps);
}
