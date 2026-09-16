import { create } from 'zustand'
import type { AppConfig, AssetFile, Category, ImportResult, Settings, ThumbResult } from '@shared/types'

export type Modal =
  | { type: 'settings' }
  | { type: 'project'; id: string | null }
  | { type: 'move'; paths: string[] }
  | { type: 'confirm'; title: string; message: string; onConfirm: () => void }
  | { type: 'help' }

interface State {
  config: AppConfig | null
  categories: Category[]
  /** Thumbnail-Ergebnisse, Key = thumbKey(file) */
  thumbs: Record<string, ThumbResult>
  selected: string[]
  renaming: string | null
  loading: boolean
  toast: string | null
  modal: Modal | null

  init(): Promise<void>
  refresh(): Promise<void>
  applyConfig(c: AppConfig): void
  requestThumb(file: AssetFile): void
  invalidateThumb(file: AssetFile): void
  toggleCollapsed(categoryId: string): void
  select(paths: string[]): void
  setRenaming(path: string | null): void
  openModal(m: Modal | null): void
  showToast(msg: string): void
  reportResult(r: ImportResult, verb: string): void
  saveSettings(s: Settings): Promise<void>
}

export const thumbKey = (f: AssetFile): string => `${f.path}|${f.mtimeMs}|${f.size}`

let toastTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false
const pendingThumbs = new Set<string>()

export const useStore = create<State>((set, get) => ({
  config: null,
  categories: [],
  thumbs: {},
  selected: [],
  renaming: null,
  loading: false,
  toast: null,
  modal: null,

  async init() {
    if (initialized) return // React StrictMode ruft Effekte doppelt auf
    initialized = true
    const config = await window.api.getConfig()
    set({ config })
    await get().refresh()
    window.api.onLibraryChanged(() => void get().refresh())
  },

  async refresh() {
    set({ loading: true })
    try {
      const categories = await window.api.scan()
      const existing = new Set(categories.flatMap((c) => c.files.map((f) => f.path)))
      set((s) => ({
        categories,
        selected: s.selected.filter((p) => existing.has(p)),
        renaming: s.renaming && existing.has(s.renaming) ? s.renaming : null
      }))
    } finally {
      set({ loading: false })
    }
  },

  applyConfig(config) {
    set({ config })
  },

  requestThumb(file) {
    const key = thumbKey(file)
    if (get().thumbs[key] || pendingThumbs.has(key)) return
    pendingThumbs.add(key)
    window.api
      .getThumbnail(file)
      .then((res) => set((s) => ({ thumbs: { ...s.thumbs, [key]: res } })))
      .catch(() => set((s) => ({ thumbs: { ...s.thumbs, [key]: { url: null, kind: 'none' } } })))
      .finally(() => pendingThumbs.delete(key))
  },

  invalidateThumb(file) {
    const key = thumbKey(file)
    set((s) => {
      const thumbs = { ...s.thumbs }
      delete thumbs[key]
      return { thumbs }
    })
  },

  toggleCollapsed(categoryId) {
    const c = get().config
    if (!c) return
    const collapsed = !c.collapsed[categoryId]
    const next = { ...c.collapsed }
    if (collapsed) next[categoryId] = true
    else delete next[categoryId]
    set({ config: { ...c, collapsed: next } })
    void window.api.setCollapsed(categoryId, collapsed)
  },

  select(paths) {
    set({ selected: paths })
  },

  setRenaming(path) {
    set({ renaming: path })
  },

  openModal(modal) {
    set({ modal })
  },

  showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 4000)
  },

  reportResult(r, verb) {
    if (r.failed.length) {
      const first = r.failed[0]
      const name = first.path.split(/[\\/]/).pop()
      get().showToast(
        `${r.failed.length} file(s) not ${verb}: ${name} – ${first.error}`
      )
    } else if (r.ok.length > 1) {
      get().showToast(`${r.ok.length} files ${verb}`)
    }
  },

  async saveSettings(s) {
    const config = await window.api.updateSettings(s)
    set({ config, thumbs: {} })
    await get().refresh()
  }
}))

/** Alle Dateien des aktiven Projekts in Anzeige-Reihenfolge (für Shift-Auswahl). */
export function orderedPaths(categories: Category[]): string[] {
  return categories.flatMap((c) => c.files.map((f) => f.path))
}
