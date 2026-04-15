import { contextBridge, ipcRenderer } from 'electron'
import { ClipResult } from '../clipVideo'
import { StreamEventPayload, UserSettings } from './main'
import { ModelProgress } from '../setup/modelSetup'

interface LogPayload {
  message: string
  level: 'info' | 'error'
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: (): Promise<UserSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: UserSettings): Promise<void> => ipcRenderer.invoke('settings:set', s),
  selectDir: (): Promise<string> => ipcRenderer.invoke('settings:selectDir'),

  // File dialog
  selectFile: (): Promise<string> => ipcRenderer.invoke('file:select'),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', filePath),

  // Video analysis
  startVideoAnalysis: (params: {
    videoPath: string
    mode: 'Q&A' | 'Clip Detection'
    language: string
  }): Promise<ClipResult[]> => ipcRenderer.invoke('video:start', params),

  // Stream analysis
  startStreamAnalysis: (params: {
    url: string
    mode: 'Q&A Mode'
    language: string
  }): Promise<void> => ipcRenderer.invoke('stream:start', params),
  stopStream: (): void => ipcRenderer.send('stream:stop'),
  createStreamClips: (): Promise<ClipResult[]> => ipcRenderer.invoke('stream:createClips'),

  // Q&A
  askQuestion: (question: string): Promise<string> => ipcRenderer.invoke('qa:ask', question),

  // Event listeners
  onLog: (cb: (payload: LogPayload) => void): void => {
    ipcRenderer.on('log', (_e, payload: LogPayload) => cb(payload))
  },
  onStreamReady: (cb: () => void): void => {
    ipcRenderer.on('stream:ready', () => cb())
  },
  onStreamEvent: (cb: (event: StreamEventPayload) => void): void => {
    ipcRenderer.on('stream:event', (_e, event: StreamEventPayload) => cb(event))
  },
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  },

  // Model setup
  onSetupProgress: (cb: (p: ModelProgress) => void): void => {
    ipcRenderer.on('setup:progress', (_e, p: ModelProgress) => cb(p))
  },
  onSetupDone: (cb: () => void): void => {
    ipcRenderer.on('setup:done', () => cb())
  },
})
