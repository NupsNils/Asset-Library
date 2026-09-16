// Erzeugt build/icon.png (256x256) ohne externe Abhängigkeiten – electron-builder macht daraus die .ico.
// node scripts/make-icon.js
const { deflateSync } = require('node:zlib')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 256
const px = Buffer.alloc(SIZE * SIZE * 4)

const BG = [0x2b, 0x2b, 0x2b, 0xff]
const TILE = [0xe6, 0xe6, 0xe6, 0xff]
const ACCENT = [0x4a, 0x9e, 0xff, 0xff]
const TRANSPARENT = [0, 0, 0, 0]

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false
  const cx = Math.max(x0 + r, Math.min(x, x1 - 1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - 1 - r))
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let c = TRANSPARENT
    if (inRoundedRect(x, y, 8, 8, 248, 248, 44)) {
      c = BG
      // 2x2 Kacheln, rechts unten in Akzentfarbe
      const tiles = [
        [40, 40, 120, 120, TILE],
        [136, 40, 216, 120, TILE],
        [40, 136, 120, 216, TILE],
        [136, 136, 216, 216, ACCENT]
      ]
      for (const [x0, y0, x1, y1, col] of tiles) if (inRoundedRect(x, y, x0, y0, x1, y1, 12)) c = col
    }
    px.set(c, (y * SIZE + x) * 4)
  }
}

// --- minimaler PNG-Encoder ---------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // Filter: none
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync(join(__dirname, '..', 'build'), { recursive: true })
writeFileSync(join(__dirname, '..', 'build', 'icon.png'), png)
console.log('build/icon.png geschrieben', png.length, 'bytes')
