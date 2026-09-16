// node scripts/test-blend-thumb.mts  – prüft den .blend-Thumbnail-Parser gegen samples/
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { extractBlendThumbnail } from '../src/main/blendThumb.ts'

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.toLowerCase().endsWith('.blend')) yield p
  }
}

let failed = 0
for (const file of walk(join(process.cwd(), 'samples'))) {
  const magic = readFileSync(file).readUInt32LE(0)
  const kind = magic === 0xfd2fb528 ? 'zstd' : 'plain'
  const t0 = Date.now()
  const t = await extractBlendThumbnail(file)
  if (!t) {
    console.log(`ERR  ${file} (${kind}) → kein Thumbnail`)
    failed++
    continue
  }
  // PPM (P6) zum Anschauen, Alpha weglassen
  const rgb = Buffer.alloc(t.width * t.height * 3)
  for (let i = 0, j = 0; i < t.rgba.length; i += 4, j += 3) {
    rgb[j] = t.rgba[i]
    rgb[j + 1] = t.rgba[i + 1]
    rgb[j + 2] = t.rgba[i + 2]
  }
  const out = join(tmpdir(), file.split(/[\\/]/).pop()!.replace(/\.blend$/i, '.ppm'))
  writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${t.width} ${t.height}\n255\n`), rgb]))
  console.log(`OK   ${file.replace(process.cwd(), '.')} (${kind}, ${(statSync(file).size / 1024).toFixed(0)} KB) → ${t.width}x${t.height} in ${Date.now() - t0} ms → ${out}`)
}
process.exit(failed ? 1 : 0)
