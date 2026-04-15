import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fetch from 'node-fetch'
import ollama from 'ollama'

const execFileAsync = promisify(execFile)

export type LogFn = (message: string, level?: 'info' | 'error') => void

export type ModelKey = 'whisper' | 'nomic-embed-text' | 'gemma4:e4b' | 'fastvlm'

export interface ModelProgress {
    model: ModelKey
    status: 'checking' | 'ready' | 'downloading' | 'done' | 'error'
    pct: number
    message?: string
}

export type ProgressFn = (progress: ModelProgress) => void

// ── Constants ────────────────────────────────────────────────────────────────

const WHISPER_MODEL_URL =
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
const WHISPER_MODEL_PATH = path.resolve(__dirname, '..', '..', 'models', 'ggml-small.bin')

const FASTVLM_ROOT = path.join(os.homedir(), 'ml-fastvlm')
const FASTVLM_CHECKPOINT = path.join(FASTVLM_ROOT, 'checkpoints', 'fastvlm-mlx-4bit')
const FASTVLM_STAGE3_DIR = path.join(FASTVLM_ROOT, 'checkpoints', 'llava-fastvithd_1.5b_stage3')
const FASTVLM_STAGE3_URL =
    'https://ml-site.cdn-apple.com/datasets/fastvlm/llava-fastvithd_1.5b_stage3.zip'
const FASTVLM_STAGE3_ZIP = path.join(FASTVLM_ROOT, 'checkpoints', 'llava-fastvithd_1.5b_stage3.zip')
const FASTVLM_EXPORT_SCRIPT = path.join(FASTVLM_ROOT, 'model_export', 'export_vision_encoder.py')

const VENV_PYTHON = path.resolve(__dirname, '..', '..', 'venv', 'bin', 'python3')

const OLLAMA_MODELS: ModelKey[] = ['nomic-embed-text', 'gemma4:e4b']

// ── Quick presence check (sync) ───────────────────────────────────────────────

export function checkLocalModels(): { whisper: boolean; fastvlm: boolean } {
    return {
        whisper: fs.existsSync(WHISPER_MODEL_PATH),
        fastvlm: fs.existsSync(FASTVLM_CHECKPOINT),
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function downloadWithProgress(
    url: string,
    destPath: string,
    onPct: (pct: number) => void
): Promise<void> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const total = parseInt(response.headers.get('content-length') ?? '0', 10)
    let downloaded = 0
    let lastPct = -1
    const ws = fs.createWriteStream(destPath)

    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        ws.write(chunk)
        downloaded += chunk.length
        if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100)
            if (pct !== lastPct) {
                lastPct = pct
                onPct(pct)
            }
        }
    }

    await new Promise<void>((resolve, reject) => {
        ws.end()
        ws.on('finish', resolve)
        ws.on('error', reject)
    })
}

function spawnAsync(cmd: string, args: string[], log: LogFn, prefix: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

        const onLine = (line: string): void => {
            if (line.trim()) log(`${prefix} ${line}`)
        }
        proc.stdout.on('data', (d: Buffer) => {
            d.toString().split('\n').forEach(onLine)
        })
        proc.stderr.on('data', (d: Buffer) => {
            d.toString().split('\n').forEach(onLine)
        })
        proc.on('close', (code: number | null) => {
            if (code === 0) resolve()
            else reject(new Error(`${cmd} exited with code ${code}`))
        })
    })
}

// ── Ollama models ─────────────────────────────────────────────────────────────

async function ensureOllamaModel(
    modelName: ModelKey,
    log: LogFn,
    onProgress: ProgressFn
): Promise<void> {
    onProgress({ model: modelName, status: 'checking', pct: 0 })

    try {
        const { models } = await ollama.list()
        const exists = models.some(
            m => m.name === modelName || m.name.startsWith(`${modelName}:`)
        )

        if (exists) {
            log(`[setup] ✓ ${modelName} déjà installé`)
            onProgress({ model: modelName, status: 'ready', pct: 100 })
            return
        }

        log(`[setup] Téléchargement de ${modelName}…`)
        onProgress({ model: modelName, status: 'downloading', pct: 0 })

        const stream = await ollama.pull({ model: modelName, stream: true })

        for await (const chunk of stream) {
            if (chunk.total && chunk.total > 0) {
                const pct = Math.floor(((chunk.completed ?? 0) / chunk.total) * 100)
                onProgress({
                    model: modelName,
                    status: 'downloading',
                    pct,
                    message: chunk.status,
                })
            } else if (chunk.status && chunk.status !== 'success') {
                onProgress({
                    model: modelName,
                    status: 'downloading',
                    pct: 0,
                    message: chunk.status,
                })
            }
        }

        log(`[setup] ✓ ${modelName} prêt`)
        onProgress({ model: modelName, status: 'done', pct: 100 })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`[setup] ✗ ${modelName}: ${msg}`, 'error')
        onProgress({ model: modelName, status: 'error', pct: 0, message: msg })
    }
}

// ── Whisper model ─────────────────────────────────────────────────────────────

async function ensureWhisperModel(log: LogFn, onProgress: ProgressFn): Promise<void> {
    onProgress({ model: 'whisper', status: 'checking', pct: 0 })

    if (fs.existsSync(WHISPER_MODEL_PATH)) {
        log('[setup] ✓ Modèle Whisper déjà présent')
        onProgress({ model: 'whisper', status: 'ready', pct: 100 })
        return
    }

    fs.mkdirSync(path.dirname(WHISPER_MODEL_PATH), { recursive: true })
    log('[setup] Téléchargement du modèle Whisper (ggml-small.bin, ~500 MB)…')
    onProgress({ model: 'whisper', status: 'downloading', pct: 0 })

    try {
        await downloadWithProgress(WHISPER_MODEL_URL, WHISPER_MODEL_PATH, pct => {
            onProgress({ model: 'whisper', status: 'downloading', pct })
        })
        log('[setup] ✓ Modèle Whisper prêt')
        onProgress({ model: 'whisper', status: 'done', pct: 100 })
    } catch (err) {
        fs.unlink(WHISPER_MODEL_PATH, () => undefined)
        const msg = err instanceof Error ? err.message : String(err)
        log(`[setup] ✗ Whisper: ${msg}`, 'error')
        onProgress({ model: 'whisper', status: 'error', pct: 0, message: msg })
    }
}

// ── FastVLM ───────────────────────────────────────────────────────────────────

async function ensureFastVLM(log: LogFn, onProgress: ProgressFn): Promise<void> {
    onProgress({ model: 'fastvlm', status: 'checking', pct: 0 })

    if (fs.existsSync(FASTVLM_CHECKPOINT)) {
        log('[setup] ✓ FastVLM déjà présent')
        onProgress({ model: 'fastvlm', status: 'ready', pct: 100 })
        return
    }

    log('[setup] Configuration de FastVLM (Apple)…')
    onProgress({ model: 'fastvlm', status: 'downloading', pct: 0 })

    try {
        fs.mkdirSync(path.join(FASTVLM_ROOT, 'checkpoints'), { recursive: true })

        // Step 1 — download base checkpoint
        if (!fs.existsSync(FASTVLM_STAGE3_DIR)) {
            if (!fs.existsSync(FASTVLM_STAGE3_ZIP)) {
                log('[setup] FastVLM: téléchargement (~2 GB)…')
                onProgress({ model: 'fastvlm', status: 'downloading', pct: 0, message: 'Téléchargement…' })

                await downloadWithProgress(FASTVLM_STAGE3_URL, FASTVLM_STAGE3_ZIP, pct => {
                    // Map 0-100% of download to 0-45% of overall progress
                    onProgress({
                        model: 'fastvlm',
                        status: 'downloading',
                        pct: Math.floor(pct * 0.45),
                        message: 'Téléchargement…',
                    })
                })
            }

            log('[setup] FastVLM: extraction…')
            onProgress({ model: 'fastvlm', status: 'downloading', pct: 45, message: 'Extraction…' })

            await execFileAsync('unzip', [
                '-qq', FASTVLM_STAGE3_ZIP,
                '-d', path.join(FASTVLM_ROOT, 'checkpoints'),
            ])
            fs.unlinkSync(FASTVLM_STAGE3_ZIP)
        }

        onProgress({ model: 'fastvlm', status: 'downloading', pct: 50, message: 'Extraction terminée' })

        // Step 2 — export vision encoder
        if (fs.existsSync(FASTVLM_EXPORT_SCRIPT)) {
            log('[setup] FastVLM: export du vision encoder…')
            onProgress({ model: 'fastvlm', status: 'downloading', pct: 55, message: 'Export vision encoder…' })

            await spawnAsync(
                VENV_PYTHON,
                [FASTVLM_EXPORT_SCRIPT, '--model-path', FASTVLM_STAGE3_DIR],
                log,
                '[setup] FastVLM:'
            )
        }

        onProgress({ model: 'fastvlm', status: 'downloading', pct: 70, message: 'Conversion MLX 4-bit…' })

        // Step 3 — convert to MLX 4-bit
        log('[setup] FastVLM: conversion MLX 4-bit…')
        await spawnAsync(
            VENV_PYTHON,
            [
                '-m', 'mlx_vlm.convert',
                '--hf-path', FASTVLM_STAGE3_DIR,
                '--mlx-path', FASTVLM_CHECKPOINT,
                '--only-llm',
                '-q',
                '--q-bits', '4',
            ],
            log,
            '[setup] FastVLM:'
        )

        log('[setup] ✓ FastVLM prêt')
        onProgress({ model: 'fastvlm', status: 'done', pct: 100 })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`[setup] ✗ FastVLM: ${msg}`, 'error')
        onProgress({ model: 'fastvlm', status: 'error', pct: 0, message: msg })
        log('[setup] Installation manuelle : cd ~/ml-fastvlm && bash get_models.sh', 'error')
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

const noop: ProgressFn = () => undefined

export async function ensureModels(
    log: LogFn = (m: string) => console.log(m),
    onProgress: ProgressFn = noop
): Promise<void> {
    log('[setup] Vérification des modèles requis…')

    await Promise.all([
        ...OLLAMA_MODELS.map(m => ensureOllamaModel(m, log, onProgress)),
        ensureWhisperModel(log, onProgress),
        ensureFastVLM(log, onProgress),
    ])

    log('[setup] Initialisation terminée.')
}
