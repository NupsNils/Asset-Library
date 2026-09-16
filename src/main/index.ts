import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { is } from './env'
import { activeProject, getConfig, loadConfig } from './config'
import { registerIpc } from './ipc'
import { cacheDir } from './thumbnails'
import { destroyModelRenderer } from './modelRenderer'
import { stopWatching, watchLibraries } from './watcher'
import { runSmokeTest } from './smoke'

// Eigene Protokolle: thumb:// liefert Thumbnails aus dem Cache, asset:// liefert
// Modell-Dateien an den versteckten three.js-Renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true }
  }
])

// Gleicher Config-/Cache-Ordner für Dev (npm run dev) und gepackte EXE (productName "Asset Library")
app.setPath('userData', join(app.getPath('appData'), 'asset-library'))

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 560,
    minHeight: 400,
    title: 'Asset Library',
    backgroundColor: '#2b2b2b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  mainWindow.setAlwaysOnTop(getConfig().settings.alwaysOnTop)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Entwicklungs-Helfer: ASSET_LIBRARY_SCREENSHOT=<datei.png> → Fenster nach 4 s abfotografieren und beenden
  const shot = process.env['ASSET_LIBRARY_SCREENSHOT']
  if (shot) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await mainWindow?.webContents.capturePage()
        if (img) await writeFile(shot, img.toPNG())
        app.exit(0)
      }, 4000)
    })
  }
  mainWindow.on('closed', () => {
    mainWindow = null
    // Das versteckte Thumbnail-Fenster würde 'window-all-closed' sonst verhindern.
    destroyModelRenderer()
    void stopWatching()
    app.quit()
  })
  if (is.dev) {
    // Renderer-Fehler im Terminal sichtbar machen
    mainWindow.webContents.on('console-message', (ev) => {
      if (ev.level === 'error' || ev.level === 'warning') console.warn('[renderer]', ev.message)
    })
  }
  // Externe Links im Browser statt in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** asset:// darf nur Dateien innerhalb der Library-Pfade des aktiven Projekts liefern. */
function isInsideLibrary(filePath: string): boolean {
  const p = activeProject()
  if (!p) return false
  const norm = resolve(filePath).toLowerCase()
  return p.libraryPaths.some((lib) => {
    const root = resolve(lib).toLowerCase()
    const prefix = root.endsWith('\\') ? root : root + '\\'
    return norm === root || norm.startsWith(prefix)
  })
}

function registerProtocols(): void {
  protocol.handle('thumb', (req) => {
    const m = new URL(req.url).pathname.match(/^\/([a-f0-9]{40}\.png)$/)
    if (!m) return new Response('bad request', { status: 400 })
    return net.fetch(pathToFileURL(join(cacheDir(), m[1])).toString())
  })
  protocol.handle('asset', (req) => {
    // asset://local/C:/pfad/datei.fbx  ->  C:\pfad\datei.fbx
    const pathname = decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '')
    const filePath = resolve(pathname)
    if (!isInsideLibrary(filePath)) {
      console.warn('[asset] verweigert (nicht im Library-Pfad):', filePath)
      return new Response('forbidden', { status: 403 })
    }
    // Das Worker-Fenster läuft unter file:// bzw. http://localhost → CORS-Header nötig
    return net
      .fetch(pathToFileURL(filePath).toString())
      .then(
        (res) =>
          new Response(res.body, {
            status: res.status,
            headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }
          })
      )
      .catch((err: Error) => {
        console.warn('[asset] fetch fehlgeschlagen:', filePath, err.message)
        return new Response(String(err), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
      })
  })
}

function refreshWatcher(): void {
  const p = activeProject()
  void watchLibraries(p?.libraryPaths ?? [], () => mainWindow?.webContents.send('library:changed'))
}

void app.whenReady().then(async () => {
  await loadConfig()
  registerProtocols()
  const smokeDir = process.env['ASSET_LIBRARY_SMOKE']
  if (smokeDir) {
    await runSmokeTest(smokeDir)
    return
  }
  registerIpc({ onLibrariesChanged: refreshWatcher })
  refreshWatcher()
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  destroyModelRenderer()
  void stopWatching()
  app.quit()
})
