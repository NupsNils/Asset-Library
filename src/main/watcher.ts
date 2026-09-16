import chokidar, { type FSWatcher } from 'chokidar'

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null

/**
 * Beobachtet die Library-Pfade des aktiven Projekts und ruft `onChange`
 * gebündelt (debounced) auf, damit ein Blender-Export mit mehreren Dateien
 * nur einen Rescan auslöst.
 */
export async function watchLibraries(paths: string[], onChange: () => void): Promise<void> {
  await stopWatching()
  if (!paths.length) return
  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    ignored: (p) => /[\\/](\.git|node_modules|Library|Temp)([\\/]|$)/.test(p),
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    ignorePermissionErrors: true
  })
  const trigger = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 300)
  }
  watcher.on('all', trigger).on('error', (err) => console.warn('[watcher]', err))
}

export async function stopWatching(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  if (watcher) {
    const w = watcher
    watcher = null
    await w.close()
  }
}
