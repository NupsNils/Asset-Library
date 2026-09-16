import { shell } from 'electron'
import { access, copyFile, rename as fsRename, stat, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { ImportMode, ImportResult } from '@shared/types'

const INVALID_NAME = /[\\/:*?"<>|]/

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Liefert einen freien Zielpfad: name.ext, name (2).ext, name (3).ext … */
async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = join(dir, name)
  for (let i = 2; await exists(candidate); i++) candidate = join(dir, `${stem} (${i})${ext}`)
  return candidate
}

function sameDir(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

export async function renameFile(path: string, newName: string): Promise<string> {
  const name = newName.trim()
  if (!name || INVALID_NAME.test(name)) throw new Error('Ungültiger Dateiname')
  const target = join(dirname(path), name)
  if (resolve(target) === resolve(path)) return path
  if (await exists(target)) throw new Error(`"${name}" existiert bereits`)
  await fsRename(path, target)
  return target
}

/** rename mit Fallback auf copy+unlink (anderes Laufwerk → EXDEV). */
async function moveOne(src: string, target: string): Promise<void> {
  try {
    await fsRename(src, target)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(src, target, constants.COPYFILE_EXCL)
    await unlink(src)
  }
}

async function forEachFile(
  paths: string[],
  fn: (p: string) => Promise<void>
): Promise<ImportResult> {
  const result: ImportResult = { ok: [], failed: [] }
  for (const p of paths) {
    try {
      await fn(p)
      result.ok.push(p)
    } catch (err) {
      result.failed.push({ path: p, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

export function moveFiles(paths: string[], destDir: string): Promise<ImportResult> {
  return forEachFile(paths, async (p) => {
    if (sameDir(dirname(p), destDir)) return
    await moveOne(p, await uniquePath(destDir, basename(p)))
  })
}

export function trashFiles(paths: string[]): Promise<ImportResult> {
  return forEachFile(paths, (p) => shell.trashItem(p))
}

/** Import per Drop aus dem Explorer. Ordner werden im MVP übersprungen. */
export function importFiles(paths: string[], destDir: string, mode: ImportMode): Promise<ImportResult> {
  return forEachFile(paths, async (p) => {
    const s = await stat(p)
    if (!s.isFile()) throw new Error('Ordner werden (noch) nicht importiert')
    if (sameDir(dirname(p), destDir)) return
    const target = await uniquePath(destDir, basename(p))
    if (mode === 'move') await moveOne(p, target)
    else await copyFile(p, target, constants.COPYFILE_EXCL)
  })
}

export async function openFile(path: string): Promise<void> {
  const err = await shell.openPath(path)
  if (err) throw new Error(err)
}

export function revealFile(path: string): void {
  shell.showItemInFolder(path)
}

export async function openFolder(dir: string): Promise<void> {
  const err = await shell.openPath(dir)
  if (err) throw new Error(err)
}
