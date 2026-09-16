import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import type { AssetFile, Category } from '@shared/types'

// Ordner, die beim Scannen übersprungen werden (Unity-/VCS-Müll).
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', 'Library', 'Temp', 'obj'])

export function categoryIdFor(dirPath: string): string {
  return resolve(dirPath).replace(/\\/g, '/').toLowerCase()
}

/**
 * Durchsucht alle Library-Pfade rekursiv. Jeder Ordner, der mindestens eine Datei
 * mit passender Extension enthält, wird eine Kategorie mit Label
 * "<LibraryOrdnername>/<relativer Pfad>" (bzw. nur "<LibraryOrdnername>" für die Wurzel).
 */
export async function scanLibraries(libraryPaths: string[], extensions: string[]): Promise<Category[]> {
  const exts = new Set(extensions.map((e) => e.toLowerCase()))
  const categories: Category[] = []

  for (const lib of libraryPaths) {
    const root = resolve(lib)
    const rootName = basename(root) || root
    await walk(root, root, rootName, exts, categories)
  }
  categories.sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }))
  return categories
}

async function walk(
  dir: string,
  root: string,
  rootName: string,
  exts: Set<string>,
  out: Category[]
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // nicht lesbar / gelöscht
  }
  const files: AssetFile[] = []
  const subdirs: string[] = []
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) subdirs.push(join(dir, e.name))
      continue
    }
    if (!e.isFile()) continue
    const ext = extname(e.name).toLowerCase()
    if (!exts.has(ext)) continue
    try {
      const s = await stat(join(dir, e.name))
      files.push({ path: join(dir, e.name), name: e.name, ext, size: s.size, mtimeMs: s.mtimeMs })
    } catch {
      /* Datei zwischenzeitlich weg */
    }
  }
  if (files.length) {
    files.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
    const rel = relative(root, dir).replace(/\\/g, '/')
    out.push({
      id: categoryIdFor(dir),
      label: rel ? `${rootName}/${rel}` : rootName,
      dirPath: dir,
      libraryPath: root,
      files
    })
  }
  for (const sub of subdirs) await walk(sub, root, rootName, exts, out)
}
