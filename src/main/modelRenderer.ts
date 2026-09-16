import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { is } from './env'

/**
 * Verstecktes Renderer-Fenster mit three.js, das 3D-Dateien (fbx/obj/glb/gltf)
 * zu einem PNG-Thumbnail rendert. Jobs laufen nacheinander (eine WebGL-Instanz).
 */
interface Job {
  id: number
  path: string
  size: number
  resolve: (png: Buffer) => void
  reject: (err: Error) => void
  timer?: NodeJS.Timeout
}

const JOB_TIMEOUT_MS = 30_000
let win: BrowserWindow | null = null
let ready: Promise<void> | null = null
let nextId = 1
const queue: Job[] = []
let current: Job | null = null
let shuttingDown = false

function ensureWindow(): Promise<void> {
  if (ready) return ready
  ready = new Promise<void>((resolve, reject) => {
    win = new BrowserWindow({
      show: false,
      width: 512,
      height: 512,
      webPreferences: {
        preload: join(__dirname, '../preload/thumb.js'),
        sandbox: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    win.on('closed', () => {
      win = null
      ready = null
      failCurrent(new Error('Thumbnail-Renderer geschlossen'))
      // Wartende Jobs bekommen ein frisches Fenster (außer beim Beenden der App)
      if (!shuttingDown) pump()
    })
    ipcMain.once('thumb:ready', () => resolve())
    win.webContents.on('did-fail-load', (_e, code, desc) => reject(new Error(`thumb worker load failed: ${code} ${desc}`)))
    // Konsole des Worker-Fensters nach stdout durchreichen (Diagnose)
    win.webContents.on('console-message', (ev) => {
      if (ev.level === 'error' || ev.level === 'warning') console.warn('[thumb-worker]', ev.message)
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/thumb.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/thumb.html'))
    }
  })
  return ready
}

ipcMain.on('thumb:result', (_e, payload: { id: number; dataUrl?: string; error?: string }) => {
  if (!current || current.id !== payload.id) return
  const job = current
  if (job.timer) clearTimeout(job.timer)
  current = null
  if (payload.dataUrl) {
    const base64 = payload.dataUrl.replace(/^data:image\/png;base64,/, '')
    job.resolve(Buffer.from(base64, 'base64'))
  } else {
    job.reject(new Error(payload.error ?? 'Render fehlgeschlagen'))
  }
  pump()
})

function failCurrent(err: Error): void {
  if (!current) return
  const job = current
  current = null
  if (job.timer) clearTimeout(job.timer)
  job.reject(err)
}

function pump(): void {
  if (current || !queue.length) return
  const job = queue.shift()!
  current = job
  ensureWindow()
    .then(() => {
      if (!win) throw new Error('kein Renderer-Fenster')
      job.timer = setTimeout(() => {
        failCurrent(new Error('Timeout beim Rendern'))
        // Worker hängt vermutlich → neu starten ('closed' ruft pump())
        win?.destroy()
      }, JOB_TIMEOUT_MS)
      win.webContents.send('thumb:job', { id: job.id, url: toAssetUrl(job.path), size: job.size })
    })
    .catch((err: Error) => {
      failCurrent(err)
      pump()
    })
}

/** asset://local/C:/pfad/zur/datei.fbx – wird in index.ts per protocol.handle bedient. */
export function toAssetUrl(filePath: string): string {
  const posix = filePath.replace(/\\/g, '/')
  return 'asset://local/' + posix.split('/').map(encodeURIComponent).join('/')
}

export function renderModelThumbnail(path: string, size: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    queue.push({ id: nextId++, path, size, resolve, reject })
    pump()
  })
}

export function destroyModelRenderer(): void {
  shuttingDown = true
  const err = new Error('App wird beendet')
  for (const j of queue.splice(0)) j.reject(err)
  win?.destroy()
}
