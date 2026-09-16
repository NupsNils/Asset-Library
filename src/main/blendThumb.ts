/**
 * Extracts the preview image Blender embeds in every .blend file.
 *
 * Blender writes the thumbnail into a file block with code "TEST" (kept for
 * backwards compatibility) right after the "REND" block(s). Its payload is
 *   int32 width, int32 height, then width*height*4 bytes RGBA (straight alpha),
 * stored bottom-up (OpenGL convention). This module returns it top-down.
 *
 * Supported containers (verified against Blender's blenloader_core sources and
 * scripts/modules/_blendfile_header.py):
 *
 *  - Legacy 12-byte header:  "BLENDER" | ptr-size '_'(4) or '-'(8) | endian 'v'(LE) or 'V'(BE) | "305" (version)
 *      block header BHead4      (20 B): code[4] int32 len  uint32 old  int32 SDNAnr int32 nr
 *      block header SmallBHead8 (24 B): code[4] int32 len  uint64 old  int32 SDNAnr int32 nr
 *  - Large-file 17-byte header (Blender 4.5+/5.x, "file format version 1"):
 *      "BLENDER" | "17" (header size) | '-' (8-byte ptrs) | "01" (format version) | 'v' (LE) | "0502" (version)
 *      block header LargeBHead8 (32 B): code[4] int32 SDNAnr uint64 old  int64 len  int64 nr
 *  - zstd-compressed files (Blender 3.0+): several concatenated zstd frames followed by a
 *    skippable seek-table frame. Node's zstdDecompressSync only inflates the first frame,
 *    so frames are walked manually and inflated lazily, only as far as the reader needs.
 *  - gzip-compressed files (Blender < 3.0 "Compress" option).
 *
 * Pure Node, no Electron imports. Uncompressed files are never loaded fully: only the
 * file header and the block headers up to the thumbnail are read.
 */
import { open, readFile } from 'node:fs/promises';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';

export interface BlendThumbnail {
  width: number;
  height: number;
  /** Top-down rows, RGBA, straight (unpremultiplied) alpha, exactly width*height*4 bytes. */
  rgba: Buffer;
}

/** Byte-range reader; returns fewer bytes than requested at end of data. */
interface ByteSource {
  read(position: number, length: number): Promise<Buffer>;
  close(): Promise<void>;
}

/** Describes how block headers are laid out for a given .blend header. */
interface BlockLayout {
  headerSize: number; // 12 (legacy) or 17 (large-file format)
  bheadSize: number; // 20 | 24 | 32
  large: boolean; // LargeBHead8 field order with 64-bit len/nr
  ptrSize: 4 | 8;
  littleEndian: boolean;
}

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MASK = 0xfffffff0;
const ZSTD_SKIPPABLE_MAGIC = 0x184d2a50; // 0x184D2A50..0x184D2A5F, Blender's seek table uses ..5E
const MAX_THUMB_DIM = 8192;
const MAX_BLOCKS_SCANNED = 256;

/** Lazily inflates a multi-frame zstd stream, one frame at a time, as reads demand it. */
class ZstdSource implements ByteSource {
  private readonly compressed: Buffer;
  private inflated: Buffer = Buffer.alloc(0);
  private inPos = 0;

  constructor(compressed: Buffer) {
    this.compressed = compressed;
  }

  async read(position: number, length: number): Promise<Buffer> {
    while (this.inflated.length < position + length && this.inflateNextFrame()) {
      /* keep inflating frames until the range is covered or input is exhausted */
    }
    return this.inflated.subarray(position, position + length);
  }

  async close(): Promise<void> {
    /* nothing to release */
  }

  /** Inflates one frame (or skips a skippable one). Returns false when no frame is left. */
  private inflateNextFrame(): boolean {
    const src = this.compressed;
    if (this.inPos + 8 > src.length) return false;
    const magic = src.readUInt32LE(this.inPos);
    if ((magic & ZSTD_SKIPPABLE_MASK) === ZSTD_SKIPPABLE_MAGIC) {
      this.inPos += 8 + src.readUInt32LE(this.inPos + 4);
      return true;
    }
    if (magic !== ZSTD_MAGIC) return false;
    // `info: true` returns the engine so we learn how many input bytes the frame consumed.
    const result = zstdDecompressSync(src.subarray(this.inPos), { info: true }) as unknown as {
      buffer: Buffer;
      engine: { bytesWritten: number };
    };
    if (result.engine.bytesWritten <= 0) return false;
    this.inPos += result.engine.bytesWritten;
    this.inflated = Buffer.concat([this.inflated, result.buffer]);
    return true;
  }
}

/** In-memory source for already inflated data (gzip). */
class BufferSource implements ByteSource {
  private readonly data: Buffer;
  constructor(data: Buffer) {
    this.data = data;
  }
  async read(position: number, length: number): Promise<Buffer> {
    return this.data.subarray(position, position + length);
  }
  async close(): Promise<void> {
    /* nothing to release */
  }
}

/** Opens the file and picks a reader based on the first bytes (zstd / gzip / plain). */
async function openSource(filePath: string): Promise<ByteSource> {
  const fh = await open(filePath, 'r');
  const probe = Buffer.alloc(4);
  const { bytesRead } = await fh.read(probe, 0, 4, 0);
  if (bytesRead === 4 && probe.readUInt32LE(0) === ZSTD_MAGIC) {
    await fh.close();
    return new ZstdSource(await readFile(filePath));
  }
  if (bytesRead >= 2 && probe[0] === 0x1f && probe[1] === 0x8b) {
    await fh.close();
    return new BufferSource(gunzipSync(await readFile(filePath)));
  }
  return {
    async read(position, length) {
      const buf = Buffer.alloc(length);
      const res = await fh.read(buf, 0, length, position);
      return buf.subarray(0, res.bytesRead);
    },
    close: () => fh.close(),
  };
}

const isDigit = (b: number): boolean => b >= 0x30 && b <= 0x39;

/** Parses the 12- or 17-byte file header; null when it is not a supported .blend file. */
function parseHeader(h: Buffer): BlockLayout | null {
  if (h.length < 12 || h.toString('latin1', 0, 7) !== 'BLENDER') return null;
  const b7 = h[7];
  if (b7 === 0x5f /* '_' */ || b7 === 0x2d /* '-' */) {
    // Legacy header: byte 8 endianness, bytes 9-11 version digits.
    const b8 = h[8];
    if (b8 !== 0x76 /* 'v' */ && b8 !== 0x56 /* 'V' */) return null;
    const ptrSize = b7 === 0x5f ? 4 : 8;
    return { headerSize: 12, bheadSize: 16 + ptrSize, large: false, ptrSize, littleEndian: b8 === 0x76 };
  }
  // Large-file header: bytes 7-8 header size, 9 '-', 10-11 format version, 12 'v', 13-16 version.
  if (h.length < 17 || !isDigit(b7) || !isDigit(h[8])) return null;
  const headerSize = (b7 - 0x30) * 10 + (h[8] - 0x30);
  const formatVersion = h.toString('latin1', 10, 12);
  if (headerSize !== 17 || h[9] !== 0x2d || formatVersion !== '01' || h[12] !== 0x76) return null;
  return { headerSize: 17, bheadSize: 32, large: true, ptrSize: 8, littleEndian: true };
}

/** Reads one block header. Returns code + payload length (payload starts right after the header). */
function parseBlockHeader(b: Buffer, layout: BlockLayout): { code: string; len: number } {
  const code = b.toString('latin1', 0, 4).replace(/\0+$/, '');
  const le = layout.littleEndian;
  if (layout.large) {
    // code[4] int32 SDNAnr uint64 old int64 len int64 nr
    return { code, len: Number(le ? b.readBigInt64LE(16) : b.readBigInt64BE(16)) };
  }
  // code[4] int32 len ptr old int32 SDNAnr int32 nr
  return { code, len: le ? b.readInt32LE(4) : b.readInt32BE(4) };
}

/**
 * Returns the embedded thumbnail of a .blend file, or null when the file has none
 * (e.g. saved without previews / by a library write) or is not a supported .blend file.
 */
export async function extractBlendThumbnail(filePath: string): Promise<BlendThumbnail | null> {
  let src: ByteSource | null = null;
  try {
    src = await openSource(filePath);
    const layout = parseHeader(await src.read(0, 17));
    if (!layout) return null;

    let pos = layout.headerSize;
    for (let i = 0; i < MAX_BLOCKS_SCANNED; i++) {
      const raw = await src.read(pos, layout.bheadSize);
      if (raw.length < layout.bheadSize) return null;
      const { code, len } = parseBlockHeader(raw, layout);
      if (len < 0) return null;
      const dataPos = pos + layout.bheadSize;

      if (code === 'TEST') {
        if (len < 8) return null;
        const dims = await src.read(dataPos, 8);
        if (dims.length < 8) return null;
        const width = layout.littleEndian ? dims.readInt32LE(0) : dims.readInt32BE(0);
        const height = layout.littleEndian ? dims.readInt32LE(4) : dims.readInt32BE(4);
        if (width <= 0 || height <= 0 || width > MAX_THUMB_DIM || height > MAX_THUMB_DIM) return null;
        const stride = width * 4;
        if (len < 8 + stride * height) return null;
        const bottomUp = await src.read(dataPos + 8, stride * height);
        if (bottomUp.length < stride * height) return null;
        // Flip rows: Blender stores the image bottom-up, callers expect top-down.
        const rgba = Buffer.allocUnsafe(stride * height);
        for (let y = 0; y < height; y++) {
          bottomUp.copy(rgba, y * stride, (height - 1 - y) * stride, (height - y) * stride);
        }
        return { width, height, rgba };
      }
      // Blender itself stops looking once a block other than REND/TEST shows up
      // (the thumbnail is always written directly after the render info).
      if (code !== 'REND') return null;
      pos = dataPos + len;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (src) await src.close().catch(() => undefined);
  }
}
