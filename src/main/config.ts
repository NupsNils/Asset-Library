import { app } from 'electron'
import { access, mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_EXTENSIONS, type AppConfig, type Project, type Settings } from '@shared/types'

// Config liegt in %APPDATA%/asset-library/config.json (app.getPath('userData')).
const configPath = (): string => join(app.getPath('userData'), 'config.json')

function defaults(): AppConfig {
  return {
    version: 1,
    projects: [],
    activeProjectId: null,
    settings: { extensions: [...DEFAULT_EXTENSIONS], thumbnailSize: 256, alwaysOnTop: false },
    collapsed: {}
  }
}

let cache: AppConfig | null = null
let writeChain: Promise<void> = Promise.resolve()

export async function loadConfig(): Promise<AppConfig> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<AppConfig>
    const d = defaults()
    cache = {
      version: 1,
      projects: Array.isArray(raw.projects) ? raw.projects : d.projects,
      activeProjectId: raw.activeProjectId ?? null,
      settings: { ...d.settings, ...(raw.settings ?? {}) },
      collapsed: raw.collapsed ?? {}
    }
  } catch {
    cache = defaults()
    await seedDemoProject(cache)
  }
  return cache
}

/** Erststart: Demo-Projekt auf die mitgelieferte Beispiel-Library (nur wenn vorhanden, z.B. im Dev-Checkout). */
async function seedDemoProject(c: AppConfig): Promise<void> {
  const root = join(app.getAppPath(), 'samples', 'DemoProject')
  const paths: string[] = []
  for (const sub of ['Blender', 'Photoshop']) {
    try {
      await access(join(root, sub), constants.R_OK)
      paths.push(join(root, sub))
    } catch {
      /* nicht vorhanden */
    }
  }
  if (!paths.length) return
  const demo: Project = { id: randomUUID(), name: 'Demo', libraryPaths: paths }
  c.projects.push(demo)
  c.activeProjectId = demo.id
}

export function getConfig(): AppConfig {
  if (!cache) throw new Error('Config not loaded')
  return cache
}

/** Schreibt atomar (tmp + rename), Schreibvorgänge werden serialisiert. */
async function persist(): Promise<void> {
  const data = JSON.stringify(getConfig(), null, 2)
  writeChain = writeChain.then(async () => {
    const target = configPath()
    await mkdir(join(target, '..'), { recursive: true })
    const tmp = target + '.tmp'
    await writeFile(tmp, data, 'utf8')
    await rename(tmp, target)
  })
  return writeChain
}

export async function updateConfig(mutate: (c: AppConfig) => void): Promise<AppConfig> {
  const c = getConfig()
  mutate(c)
  await persist()
  return c
}

export function activeProject(): Project | null {
  const c = getConfig()
  return c.projects.find((p) => p.id === c.activeProjectId) ?? null
}

export const projects = {
  create: (name: string) =>
    updateConfig((c) => {
      const p: Project = { id: randomUUID(), name: name.trim() || 'New project', libraryPaths: [] }
      c.projects.push(p)
      c.activeProjectId = p.id
    }),
  rename: (id: string, name: string) =>
    updateConfig((c) => {
      const p = c.projects.find((x) => x.id === id)
      if (p && name.trim()) p.name = name.trim()
    }),
  remove: (id: string) =>
    updateConfig((c) => {
      c.projects = c.projects.filter((x) => x.id !== id)
      if (c.activeProjectId === id) c.activeProjectId = c.projects[0]?.id ?? null
    }),
  setActive: (id: string | null) =>
    updateConfig((c) => {
      c.activeProjectId = id && c.projects.some((p) => p.id === id) ? id : null
    }),
  addLibraryPath: (id: string, dir: string) =>
    updateConfig((c) => {
      const p = c.projects.find((x) => x.id === id)
      if (p && !p.libraryPaths.some((x) => x.toLowerCase() === dir.toLowerCase())) p.libraryPaths.push(dir)
    }),
  removeLibraryPath: (id: string, dir: string) =>
    updateConfig((c) => {
      const p = c.projects.find((x) => x.id === id)
      if (p) p.libraryPaths = p.libraryPaths.filter((x) => x !== dir)
    }),
  setCollapsed: (categoryId: string, collapsed: boolean) =>
    updateConfig((c) => {
      if (collapsed) c.collapsed[categoryId] = true
      else delete c.collapsed[categoryId]
    }),
  updateSettings: (s: Settings) =>
    updateConfig((c) => {
      const exts = s.extensions
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .map((e) => (e.startsWith('.') ? e : '.' + e))
      c.settings = {
        extensions: [...new Set(exts)],
        thumbnailSize: Math.min(1024, Math.max(64, Math.round(s.thumbnailSize) || 256)),
        alwaysOnTop: s.alwaysOnTop ?? c.settings.alwaysOnTop
      }
    }),
  setAlwaysOnTop: (on: boolean) =>
    updateConfig((c) => {
      c.settings.alwaysOnTop = on
    })
}
