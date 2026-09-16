import { BrowserWindow, Menu, dialog, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import type { AssetFile, FileMenuAction, FileMenuEvent, ImportMode, Settings } from '@shared/types'
import { activeProject, getConfig, projects } from './config'
import { scanLibraries } from './scanner'
import { cacheDir, clearThumbCache, getThumbnail } from './thumbnails'
import * as fileops from './fileops'

/** Wird von index.ts gesetzt: nach Projekt-/Pfadänderungen Watcher neu aufsetzen. */
let onLibrariesChanged: () => void = () => {}

export function registerIpc(hooks: { onLibrariesChanged: () => void }): void {
  onLibrariesChanged = hooks.onLibrariesChanged

  // ---- Config / Projekte -------------------------------------------------
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('project:create', async (_e, name: string) => afterLibChange(await projects.create(name)))
  ipcMain.handle('project:rename', (_e, id: string, name: string) => projects.rename(id, name))
  ipcMain.handle('project:delete', async (_e, id: string) => afterLibChange(await projects.remove(id)))
  ipcMain.handle('project:setActive', async (_e, id: string | null) =>
    afterLibChange(await projects.setActive(id))
  )
  ipcMain.handle('project:addLibraryPath', async (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Library-Ordner auswählen',
      properties: ['openDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return getConfig()
    return afterLibChange(await projects.addLibraryPath(id, res.filePaths[0]))
  })
  ipcMain.handle('project:removeLibraryPath', async (_e, id: string, dir: string) =>
    afterLibChange(await projects.removeLibraryPath(id, dir))
  )
  ipcMain.handle('config:setCollapsed', (_e, catId: string, collapsed: boolean) => {
    void projects.setCollapsed(catId, collapsed)
  })
  ipcMain.handle('config:updateSettings', async (_e, s: Settings) =>
    afterLibChange(await projects.updateSettings(s))
  )
  ipcMain.handle('window:alwaysOnTop', (e, on: boolean) => {
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(on)
    return projects.setAlwaysOnTop(on)
  })
  ipcMain.handle('thumb:clearCache', () => clearThumbCache())

  // ---- Library -----------------------------------------------------------
  ipcMain.handle('library:scan', () => {
    const p = activeProject()
    if (!p) return []
    return scanLibraries(p.libraryPaths, getConfig().settings.extensions)
  })
  ipcMain.handle('thumb:get', (_e, file: AssetFile) => getThumbnail(file, getConfig().settings.thumbnailSize))

  // ---- Dateioperationen --------------------------------------------------
  ipcMain.on('drag:start', (e, paths: string[], thumbUrl: string | null) => {
    if (!paths.length) return
    e.sender.startDrag({ file: paths[0], files: paths, icon: dragIcon(thumbUrl) })
  })
  ipcMain.handle('file:open', (_e, p: string) => fileops.openFile(p))
  ipcMain.handle('file:reveal', (_e, p: string) => fileops.revealFile(p))
  ipcMain.handle('file:rename', (_e, p: string, name: string) => fileops.renameFile(p, name))
  ipcMain.handle('file:move', (_e, paths: string[], dest: string) => fileops.moveFiles(paths, dest))
  ipcMain.handle('file:trash', (_e, paths: string[]) => fileops.trashFiles(paths))
  ipcMain.handle('file:import', (_e, paths: string[], dest: string, mode: ImportMode) =>
    fileops.importFiles(paths, dest, mode)
  )
  ipcMain.handle('folder:open', (_e, dir: string) => fileops.openFolder(dir))

  // ---- Natives Kontextmenü ----------------------------------------------
  ipcMain.on('menu:file', (e, paths: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) showFileMenu(win, paths)
  })
}

function afterLibChange<T>(v: T): T {
  onLibrariesChanged()
  return v
}

function showFileMenu(win: BrowserWindow, paths: string[]): void {
  if (!paths.length) return
  const many = paths.length > 1
  const send = (action: FileMenuAction): void => {
    const ev: FileMenuEvent = { action, paths }
    win.webContents.send('menu:file-action', ev)
  }
  const menu = Menu.buildFromTemplate([
    { label: many ? `${paths.length} Dateien öffnen` : 'Öffnen', click: () => send('open') },
    { label: 'Im Explorer anzeigen', click: () => send('reveal'), enabled: !many },
    { type: 'separator' },
    { label: 'Umbenennen', accelerator: 'F2', click: () => send('rename'), enabled: !many },
    { label: 'Verschieben nach…', click: () => send('move') },
    { type: 'separator' },
    {
      label: many ? `${paths.length} Dateien in den Papierkorb` : 'In den Papierkorb',
      accelerator: 'Delete',
      click: () => send('trash')
    }
  ])
  menu.popup({ window: win })
}

/** Drag-Icon: gecachtes Thumbnail, sonst neutrales graues Quadrat (Electron braucht ein nicht-leeres Icon). */
function dragIcon(thumbUrl: string | null): Electron.NativeImage {
  const m = thumbUrl?.match(/^thumb:\/\/cache\/([a-f0-9]{40}\.png)$/)
  if (m) {
    const img = nativeImage.createFromPath(join(cacheDir(), m[1]))
    if (!img.isEmpty()) return img.resize({ width: 96, height: 96 })
  }
  const size = 64
  const bgra = Buffer.alloc(size * size * 4)
  for (let i = 0; i < bgra.length; i += 4) {
    bgra[i] = 0xa0
    bgra[i + 1] = 0xa0
    bgra[i + 2] = 0xa0
    bgra[i + 3] = 0xff
  }
  return nativeImage.createFromBitmap(bgra, { width: size, height: size })
}
