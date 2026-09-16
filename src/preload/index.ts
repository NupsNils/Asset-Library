import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, AssetFile, FileMenuEvent, ImportMode, Settings } from '@shared/types'

const api: Api = {
  // Config / Projekte
  getConfig: () => ipcRenderer.invoke('config:get'),
  createProject: (name) => ipcRenderer.invoke('project:create', name),
  renameProject: (id, name) => ipcRenderer.invoke('project:rename', id, name),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  setActiveProject: (id) => ipcRenderer.invoke('project:setActive', id),
  addLibraryPath: (projectId) => ipcRenderer.invoke('project:addLibraryPath', projectId),
  removeLibraryPath: (projectId, path) => ipcRenderer.invoke('project:removeLibraryPath', projectId, path),
  setCollapsed: (categoryId, collapsed) => ipcRenderer.invoke('config:setCollapsed', categoryId, collapsed),
  updateSettings: (settings: Settings) => ipcRenderer.invoke('config:updateSettings', settings),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('window:alwaysOnTop', on),
  clearThumbCache: () => ipcRenderer.invoke('thumb:clearCache'),

  // Library
  scan: () => ipcRenderer.invoke('library:scan'),
  getThumbnail: (file: AssetFile) => ipcRenderer.invoke('thumb:get', file),
  onLibraryChanged: (cb) => {
    const handler = (): void => cb()
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },

  // Dateioperationen
  startDrag: (paths, thumbUrl = null) => ipcRenderer.send('drag:start', paths, thumbUrl),
  openFile: (path) => ipcRenderer.invoke('file:open', path),
  revealFile: (path) => ipcRenderer.invoke('file:reveal', path),
  renameFile: (path, newName) => ipcRenderer.invoke('file:rename', path, newName),
  moveFiles: (paths, destDir) => ipcRenderer.invoke('file:move', paths, destDir),
  trashFiles: (paths) => ipcRenderer.invoke('file:trash', paths),
  importFiles: (paths, destDir, mode: ImportMode) => ipcRenderer.invoke('file:import', paths, destDir, mode),
  openCategoryFolder: (dirPath) => ipcRenderer.invoke('folder:open', dirPath),
  getPathsForFiles: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),

  // Kontextmenü
  showFileMenu: (paths) => ipcRenderer.send('menu:file', paths),
  onFileMenuAction: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, ev: FileMenuEvent): void => cb(ev)
    ipcRenderer.on('menu:file-action', handler)
    return () => ipcRenderer.removeListener('menu:file-action', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
