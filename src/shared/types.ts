// Gemeinsame Typen für Main, Preload und Renderer.

export interface Project {
  id: string
  name: string
  /** Absolute Ordnerpfade, aus denen Assets gezogen werden. */
  libraryPaths: string[]
}

export interface Settings {
  /** Kleingeschriebene Extensions inkl. Punkt, z.B. ".fbx" */
  extensions: string[]
  /** Kantenlänge der gerenderten Thumbnails in Pixeln */
  thumbnailSize: number
  /** Fenster über Unity/Blender halten */
  alwaysOnTop: boolean
}

export interface AppConfig {
  version: 1
  projects: Project[]
  activeProjectId: string | null
  settings: Settings
  /** Eingeklappte Kategorien, Key = Category.id */
  collapsed: Record<string, boolean>
}

export interface AssetFile {
  path: string
  name: string
  /** kleingeschrieben inkl. Punkt */
  ext: string
  size: number
  mtimeMs: number
}

export interface Category {
  /** stabil über Scans hinweg: normalisierter dirPath */
  id: string
  /** z.B. "Blender/Items" */
  label: string
  dirPath: string
  libraryPath: string
  files: AssetFile[]
}

export type ThumbKind = 'image' | 'model' | 'blend' | 'none'

export interface ThumbResult {
  /** thumb://cache/<key>.png oder null wenn kein Thumbnail möglich */
  url: string | null
  kind: ThumbKind
}

export type FileMenuAction = 'open' | 'reveal' | 'rename' | 'move' | 'trash'

export interface FileMenuEvent {
  action: FileMenuAction
  paths: string[]
}

export type ImportMode = 'copy' | 'move'

export interface ImportResult {
  ok: string[]
  failed: { path: string; error: string }[]
}

export interface Api {
  // Config / Projekte
  getConfig(): Promise<AppConfig>
  createProject(name: string): Promise<AppConfig>
  renameProject(id: string, name: string): Promise<AppConfig>
  deleteProject(id: string): Promise<AppConfig>
  setActiveProject(id: string | null): Promise<AppConfig>
  addLibraryPath(projectId: string): Promise<AppConfig>
  removeLibraryPath(projectId: string, path: string): Promise<AppConfig>
  setCollapsed(categoryId: string, collapsed: boolean): Promise<void>
  updateSettings(settings: Settings): Promise<AppConfig>
  setAlwaysOnTop(on: boolean): Promise<AppConfig>
  clearThumbCache(): Promise<void>

  // Library
  scan(): Promise<Category[]>
  getThumbnail(file: AssetFile): Promise<ThumbResult>
  onLibraryChanged(cb: () => void): () => void

  // Dateioperationen
  /** Natives Drag-Out (CF_HDROP). thumbUrl = Drag-Icon, falls vorhanden. */
  startDrag(paths: string[], thumbUrl?: string | null): void
  openFile(path: string): Promise<void>
  revealFile(path: string): Promise<void>
  renameFile(path: string, newName: string): Promise<string>
  moveFiles(paths: string[], destDir: string): Promise<ImportResult>
  trashFiles(paths: string[]): Promise<ImportResult>
  importFiles(paths: string[], destDir: string, mode: ImportMode): Promise<ImportResult>
  openCategoryFolder(dirPath: string): Promise<void>
  /** Absolute Pfade für File-Objekte aus einem Drop-Event (webUtils) */
  getPathsForFiles(files: File[]): string[]

  // Kontextmenü (nativ, Ergebnis kommt über onFileMenuAction)
  showFileMenu(paths: string[]): void
  onFileMenuAction(cb: (e: FileMenuEvent) => void): () => void
}

export const DEFAULT_EXTENSIONS = ['.fbx', '.obj', '.glb', '.gltf', '.blend', '.png', '.jpg', '.jpeg', '.psd']
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.psd', '.bmp', '.gif', '.webp', '.tif', '.tiff'])
export const MODEL_EXTENSIONS = new Set(['.fbx', '.obj', '.glb', '.gltf'])

export function thumbKindFor(ext: string): ThumbKind {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (MODEL_EXTENSIONS.has(ext)) return 'model'
  if (ext === '.blend') return 'blend'
  return 'none'
}
