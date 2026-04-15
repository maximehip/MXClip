import 'dotenv/config'
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import os from 'os'
import { execSync, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
import ollama from 'ollama'

import { ensureModels, ModelProgress } from '../setup/modelSetup'
import { getEmbedding } from '../embedding'
import { EmbeddedEvent } from '../types/EmbeddedEvent'
import { detectAndCreateClips, ClipResult } from '../clipVideo'
import { fetchStreamContext, buildContextPrompt } from '../streamContext'
import { startFaceServer, startLiveExtractions } from '../Stream'
import { runLiveMode, LiveModeCallbacks } from '../stream/liveMode'
import { nowClock } from '../utils'
import { runVideoPipeline } from '../pipeline/videoPipeline'
import { selectQAEvents, formatQAContext, askQA } from '../qa/engine'

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserSettings {
  username: string
  uiLanguage: 'fr' | 'en'
  saveDir: string
}

interface VideoStartParams {
  videoPath: string
  mode: 'Q&A' | 'Clip Detection'
  language: string
}

interface StreamStartParams {
  url: string
  mode: 'Q&A Mode'
  language: string
}

export interface StreamEventPayload {
  type: 'visual' | 'summary'
  text: string
  start: number
  faceCount?: number
}

// ── State ────────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..', '..')
const ICON_PATH = path.resolve(projectRoot, 'assets', 'icon.png')
let mainWindow: BrowserWindow | null = null
let currentEmbeddings: EmbeddedEvent[] = []
let cachedSettings: UserSettings | null = null

// ── Settings ─────────────────────────────────────────────────────────────────

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings(): UserSettings {
  if (cachedSettings) return cachedSettings
  try {
    const p = getSettingsPath()
    if (fs.existsSync(p)) {
      cachedSettings = JSON.parse(fs.readFileSync(p, 'utf-8')) as UserSettings
      return cachedSettings
    }
  } catch { /* use defaults */ }
  cachedSettings = {
    username: os.userInfo().username,
    uiLanguage: 'fr',
    saveDir: path.resolve(projectRoot, 'output'),
  }
  return cachedSettings
}

function getOutputBase(): string {
  const { saveDir } = loadSettings()
  return saveDir || path.resolve(projectRoot, 'output')
}

// ── Logging ──────────────────────────────────────────────────────────────────

function sendLog(message: string, level: 'info' | 'error' = 'info'): void {
  mainWindow?.webContents.send('log', { message, level })
}

let _origLog: ((...args: unknown[]) => void) | null = null
let _origError: ((...args: unknown[]) => void) | null = null

function patchConsole(): void {
  _origLog = console.log as (...args: unknown[]) => void
  _origError = console.error as (...args: unknown[]) => void

  console.log = (...args: unknown[]): void => {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    _origLog!(...args)
    sendLog(msg, 'info')
  }
  console.error = (...args: unknown[]): void => {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    _origError!(...args)
    sendLog(msg, 'error')
  }
}

function restoreConsole(): void {
  if (_origLog) console.log = _origLog as typeof console.log
  if (_origError) console.error = _origError as typeof console.error
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(ICON_PATH)
  }

  mainWindow.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createWindow()
  mainWindow!.webContents.once('did-finish-load', () => {
    void ensureModels(sendLog, (p: ModelProgress) => {
      mainWindow?.webContents.send('setup:progress', p)
    }).then(() => {
      mainWindow?.webContents.send('setup:done')
    })
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: file dialog ─────────────────────────────────────────────────────────

ipcMain.handle('settings:get', (): UserSettings => loadSettings())

ipcMain.handle('settings:set', (_e, s: UserSettings): void => {
  cachedSettings = s
  fs.writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2))
})

ipcMain.handle('settings:selectDir', async (): Promise<string> => {
  const result = await dialog.showOpenDialog({
    title: 'Choisir le répertoire de sauvegarde',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.filePaths[0] ?? ''
})

ipcMain.handle('file:select', async (): Promise<string> => {
  const result = await dialog.showOpenDialog({
    title: 'Select video file',
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }],
    properties: ['openFile'],
  })
  return result.filePaths[0] ?? ''
})

ipcMain.handle('shell:openPath', async (_e, filePath: string): Promise<void> => {
  await shell.openPath(filePath)
})

// ── IPC: Video Analysis ──────────────────────────────────────────────────────

ipcMain.handle('video:start', async (_e, params: VideoStartParams): Promise<ClipResult[]> => {
  const { videoPath, mode, language } = params

  const videoHash = crypto.createHash('md5').update(videoPath).digest('hex').slice(0, 8)
  const outputDir = path.resolve(getOutputBase(), videoHash)
  const clipsDir = path.resolve(outputDir, 'clips')

  patchConsole()
  try {
    const { embeddedEvents } = await runVideoPipeline({
      videoPath,
      outputDir,
      mode,
      language,
      onLog: sendLog,
    })

    if (mode === 'Clip Detection') {
      const clips = await detectAndCreateClips(embeddedEvents, videoPath, clipsDir)
      return clips
    } else {
      currentEmbeddings = embeddedEvents
      return []
    }
  } finally {
    restoreConsole()
  }
})

// ── IPC: Q&A ─────────────────────────────────────────────────────────────────

ipcMain.handle('qa:ask', async (_e, question: string): Promise<string> => {
  if (currentEmbeddings.length === 0) {
    return 'No analysis data available. Please run analysis first.'
  }

  const events = await selectQAEvents(question, currentEmbeddings)
  const context = formatQAContext(events)
  return askQA(context, question)
})

// ── IPC: Stream Analysis (Q&A Mode) ──────────────────────────────────────────

// ── IPC: Stream Analysis ─────────────────────────────────────────────────────

const MIN_STREAM_EVENTS = 10

let streamFaceServer: ReturnType<typeof startFaceServer> | null = null
let streamExtractions: { stop: () => void } | null = null
let streamAbortController: AbortController | null = null

function stopActiveStream(): void {
  streamAbortController?.abort()
  streamFaceServer?.proc.kill()
  streamExtractions?.stop()
  streamAbortController = null
  streamFaceServer = null
  streamExtractions = null
}

ipcMain.handle('stream:start', async (_e, params: StreamStartParams): Promise<void> => {
  const { url, language } = params
  stopActiveStream()

  sendLog(`[${nowClock()}] Resolving stream URL...`)
  const m3u8Url = execSync(`streamlink --stream-url "${url}" best`, { encoding: 'utf-8' }).trim()
  sendLog(`[${nowClock()}] Stream URL resolved.`)

  const streamCtx = await fetchStreamContext(url)
  const contextPrompt = buildContextPrompt(streamCtx)

  const streamDir = path.resolve(getOutputBase(), 'stream')
  const framesDir = path.resolve(streamDir, 'frames')
  const audioDir = path.resolve(streamDir, 'audio')
  const bufferDir = path.resolve(streamDir, 'buffer')

  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true })
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true })
  if (fs.existsSync(bufferDir)) fs.rmSync(bufferDir, { recursive: true })
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(audioDir, { recursive: true })
  fs.mkdirSync(bufferDir, { recursive: true })

  currentEmbeddings = []
  streamAbortController = new AbortController()
  streamFaceServer = startFaceServer()
  streamExtractions = startLiveExtractions(m3u8Url, framesDir, audioDir, bufferDir)

  let readyNotified = false

  const callbacks: LiveModeCallbacks = {
    signal: streamAbortController.signal,

    onVisual: (caption, timestamp, faceCount) => {
      // Envoie au feed en direct
      const evt: StreamEventPayload = { type: 'visual', text: caption, start: timestamp, faceCount }
      mainWindow?.webContents.send('stream:event', evt)

      // Embedding pour le Q&A (non-bloquant)
      void getEmbedding(caption).then(embedding => {
        currentEmbeddings.push({ text: caption, start: timestamp, type: 'visual', embedding })
        if (!readyNotified && currentEmbeddings.length >= MIN_STREAM_EVENTS) {
          readyNotified = true
          mainWindow?.webContents.send('stream:ready')
        }
      }).catch(() => { /* skip */ })
    },

    onAudio: (text, timestamp, speaker) => {
      // Audio : uniquement pour le Q&A, pas dans le feed
      void getEmbedding(text).then(embedding => {
        currentEmbeddings.push({ text, start: timestamp, type: 'audio', embedding, speaker })
        if (!readyNotified && currentEmbeddings.length >= MIN_STREAM_EVENTS) {
          readyNotified = true
          mainWindow?.webContents.send('stream:ready')
        }
      }).catch(() => { /* skip */ })
    },

    onSummary: (text, timestamp) => {
      const evt: StreamEventPayload = { type: 'summary', text, start: timestamp }
      mainWindow?.webContents.send('stream:event', evt)
    },
  }

  void runLiveMode(
    framesDir, audioDir,
    streamFaceServer, {},
    contextPrompt,
    () => { /* clip auto-detection désactivée en mode Electron — clips créés manuellement */ },
    '', language,
    callbacks
  ).finally(() => {
    stopActiveStream()
  })
})

ipcMain.on('stream:stop', () => {
  stopActiveStream()
})

// ── IPC: Stream Clip Creation ─────────────────────────────────────────────────

ipcMain.handle('stream:createClips', async (): Promise<ClipResult[]> => {
  if (currentEmbeddings.length === 0) {
    throw new Error('Pas encore assez de données stream pour créer des clips.')
  }

  const streamDir = path.resolve(getOutputBase(), 'stream')
  const bufferDir = path.resolve(streamDir, 'buffer')
  const clipsDir = path.resolve(streamDir, 'clips')
  const streamVideoPath = path.resolve(streamDir, 'stream_recording.mp4')
  const concatMetaPath = path.resolve(streamDir, 'stream_recording.meta.json')

  const segs = fs.existsSync(bufferDir)
    ? fs.readdirSync(bufferDir).filter((f: string) => f.endsWith('.ts')).sort()
    : []

  if (segs.length === 0) {
    throw new Error('Aucun segment vidéo enregistré. Attends quelques minutes.')
  }

  const currentSignature = JSON.stringify(segs)
  let cachedSignature = ''

  if (fs.existsSync(concatMetaPath)) {
    try {
      cachedSignature = JSON.parse(fs.readFileSync(concatMetaPath, 'utf-8')).signature ?? ''
    } catch {
      cachedSignature = ''
    }
  }

  if (!fs.existsSync(streamVideoPath) || cachedSignature !== currentSignature) {
    sendLog(`[${nowClock()}] Assemblage de ${segs.length} segments…`)
    const concatFile = path.resolve(streamDir, 'concat.txt')
    fs.writeFileSync(concatFile, segs.map((f: string) => `file '${path.join(bufferDir, f)}'`).join('\n'))
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${streamVideoPath}"`)
    fs.writeFileSync(concatMetaPath, JSON.stringify({ signature: currentSignature, segmentCount: segs.length }, null, 2))
    sendLog(`[${nowClock()}] Vidéo assemblée. Lancement de la détection…`)
  } else {
    sendLog(`[${nowClock()}] Réutilisation de la vidéo stream déjà assemblée (${segs.length} segments).`)
  }

  patchConsole()
  try {
    const clips = await detectAndCreateClips(currentEmbeddings, streamVideoPath, clipsDir)
    return clips
  } finally {
    restoreConsole()
  }
})
