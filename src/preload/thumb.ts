import { contextBridge, ipcRenderer } from 'electron'

export interface ThumbJob {
  id: number
  url: string
  size: number
}

// Minimale Brücke für das versteckte three.js-Renderfenster.
contextBridge.exposeInMainWorld('thumbBridge', {
  ready: (): void => ipcRenderer.send('thumb:ready'),
  onJob: (cb: (job: ThumbJob) => void): void => {
    ipcRenderer.on('thumb:job', (_e, job: ThumbJob) => cb(job))
  },
  sendResult: (id: number, dataUrl: string | null, error?: string): void =>
    ipcRenderer.send('thumb:result', { id, dataUrl: dataUrl ?? undefined, error })
})
