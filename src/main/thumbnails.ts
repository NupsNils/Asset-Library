import { app, nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { thumbKindFor, type AssetFile, type ThumbResult } from '@shared/types'
import { renderModelThumbnail } from './modelRenderer'
import { extractBlendThumbnail } from './blendThumb'

export const cacheDir = (): string => join(app.getPath('userData'), 'thumbs')

const inflight = new Map<string, Promise<ThumbResult>>()

function cacheKey(file: AssetFile): string {
  return createHash('sha1').update(`${file.path.toLowerCase()}|${file.mtimeMs}|${file.size}`).digest('hex')
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function getThumbnail(file: AssetFile, size: number): Promise<ThumbResult> {
  const kind = thumbKindFor(file.ext)
  if (kind === 'none') return { url: null, kind }
  const key = cacheKey(file)
  const url = `thumb://cache/${key}.png`
  const target = join(cacheDir(), `${key}.png`)
  if (await exists(target)) return { url, kind }

  const pending = inflight.get(key)
  if (pending) return pending
  const job = (async (): Promise<ThumbResult> => {
    try {
      const png = await render(file, kind, size)
      if (!png) return { url: null, kind }
      await mkdir(cacheDir(), { recursive: true })
      await writeFile(target, png)
      return { url, kind }
    } catch (err) {
      console.warn('[thumb]', file.path, err instanceof Error ? err.message : err)
      return { url: null, kind }
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, job)
  return job
}

async function render(file: AssetFile, kind: ThumbResult['kind'], size: number): Promise<Buffer | null> {
  switch (kind) {
    case 'image': {
      // Windows-Shell-Thumbnail: sieht aus wie im Explorer (inkl. PSD, wenn ein Handler installiert ist)
      const img = await nativeImage.createThumbnailFromPath(file.path, { width: size, height: size })
      return img.isEmpty() ? null : img.toPNG()
    }
    case 'model':
      return renderModelThumbnail(file.path, size)
    case 'blend': {
      const t = await extractBlendThumbnail(file.path)
      if (!t) return null
      // createFromBitmap erwartet BGRA, top-down
      const bgra = Buffer.from(t.rgba)
      for (let i = 0; i < bgra.length; i += 4) {
        const r = bgra[i]
        bgra[i] = bgra[i + 2]
        bgra[i + 2] = r
      }
      const img = nativeImage.createFromBitmap(bgra, { width: t.width, height: t.height })
      return img.isEmpty() ? null : img.toPNG()
    }
    default:
      return null
  }
}

export async function clearThumbCache(): Promise<void> {
  const dir = cacheDir()
  try {
    for (const f of await readdir(dir)) await rm(join(dir, f), { force: true })
  } catch {
    /* Cache existiert noch nicht */
  }
}
