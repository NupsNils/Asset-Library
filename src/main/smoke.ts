import { app } from 'electron'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DEFAULT_EXTENSIONS, type Category } from '@shared/types'
import { importFiles, moveFiles, renameFile, trashFiles } from './fileops'
import { scanLibraries } from './scanner'
import { cacheDir, getThumbnail } from './thumbnails'
import { destroyModelRenderer } from './modelRenderer'
import { updateConfig } from './config'

/**
 * Headless-Selbsttest ohne UI:  ASSET_LIBRARY_SMOKE=<library-ordner> npm run preview
 * Scannt den Ordner, erzeugt für jede Datei ein Thumbnail und beendet die App.
 */
export async function runSmokeTest(libraryDir: string): Promise<void> {
  // asset:// erlaubt nur Pfade innerhalb des aktiven Projekts → temporäres Projekt
  await updateConfig((c) => {
    c.projects = c.projects.filter((p) => p.name !== '__smoke__')
    c.projects.push({ id: 'smoke', name: '__smoke__', libraryPaths: [libraryDir] })
    c.activeProjectId = 'smoke'
  })
  const started = Date.now()
  const cats = await scanLibraries([libraryDir], DEFAULT_EXTENSIONS)
  console.log(`[smoke] ${cats.length} categories in ${Date.now() - started} ms`)
  let ok = 0
  let fail = 0
  for (const c of cats) {
    console.log(`[smoke] ${c.label} (${c.files.length})`)
    for (const f of c.files) {
      const t0 = Date.now()
      const r = await getThumbnail(f, 256)
      let size = 0
      if (r.url) size = (await stat(join(cacheDir(), r.url.split('/').pop()!))).size
      const status = r.url ? 'OK ' : (r.kind === 'none' ? '-- ' : 'ERR')
      if (r.url) ok++
      else if (r.kind !== 'none') fail++
      console.log(`[smoke]   ${status} ${f.name.padEnd(24)} ${r.kind.padEnd(6)} ${String(Date.now() - t0).padStart(5)} ms ${size ? `${(size / 1024).toFixed(1)} KB` : ''}`)
    }
  }
  await updateConfig((c) => {
    c.projects = c.projects.filter((p) => p.id !== 'smoke')
    c.activeProjectId = c.projects[0]?.id ?? null
  })
  console.log(`[smoke] done: ${ok} thumbnails OK, ${fail} failed`)
  fail += await smokeFileOps(cats)
  destroyModelRenderer()
  app.exit(fail ? 1 : 0)
}

/** Import → Umbenennen → Verschieben → Papierkorb in einem Temp-Ordner durchspielen. */
async function smokeFileOps(cats: Category[]): Promise<number> {
  const src = cats.flatMap((c) => c.files)[0]
  if (!src) return 0
  const tmp = await mkdtemp(join(tmpdir(), 'asset-library-smoke-'))
  const a = join(tmp, 'A')
  const b = join(tmp, 'B')
  await mkdir(a)
  await mkdir(b)
  let failures = 0
  const check = (label: string, cond: boolean): void => {
    console.log(`[smoke]   ${cond ? 'OK ' : 'ERR'} ${label}`)
    if (!cond) failures++
  }
  try {
    const imp = await importFiles([src.path], a, 'copy')
    check('import (copy)', imp.ok.length === 1 && imp.failed.length === 0)
    const imp2 = await importFiles([src.path], a, 'copy')
    const names = await readdir(a)
    check('import collision → " (2)" suffix', imp2.ok.length === 1 && names.length === 2 && names.some((n) => n.includes(' (2)')))
    const renamed = await renameFile(join(a, src.name), 'renamed' + src.ext)
    check('rename', basename(renamed) === 'renamed' + src.ext)
    let threw = false
    try {
      await renameFile(renamed, 'bad/name' + src.ext)
    } catch {
      threw = true
    }
    check('rename with invalid name throws', threw)
    const mv = await moveFiles([renamed], b)
    check('move to another category', mv.ok.length === 1 && (await readdir(b)).length === 1)
    const tr = await trashFiles([join(b, 'renamed' + src.ext)])
    check('trash (Recycle Bin)', tr.ok.length === 1 && (await readdir(b)).length === 0)
  } catch (err) {
    console.log('[smoke]   ERR fileops:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
  console.log(`[smoke] fileops: ${failures} failures`)
  return failures
}
