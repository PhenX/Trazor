/**
 * Minimal deterministic PNG encoder (RGBA, 8-bit), with stored (uncompressed)
 * deflate blocks: PNG per the W3C specification, zlib wrapper per RFC 1950,
 * CRC-32 per the PNG chunk format. No compression on purpose — a ~120-line
 * encoder is trivially auditable, DOM-free (runs in the worker and in Node)
 * and bit-identical everywhere, at the price of a larger file than a
 * compressed encoder would produce. Used by the hybrid output mode, which
 * embeds the working raster under the vector shapes.
 */
import type { RasterImage } from '@trazor/core'

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** One PNG chunk: 4-byte big-endian length, ASCII type, data, CRC-32 of type+data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const len = data.length
  out[0] = (len >>> 24) & 0xff
  out[1] = (len >>> 16) & 0xff
  out[2] = (len >>> 8) & 0xff
  out[3] = len & 0xff
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  const body = out.subarray(4, 8 + data.length)
  const crc = crc32(body)
  const at = 8 + data.length
  out[at] = (crc >>> 24) & 0xff
  out[at + 1] = (crc >>> 16) & 0xff
  out[at + 2] = (crc >>> 8) & 0xff
  out[at + 3] = crc & 0xff
  return out
}

/** Concatenate several byte arrays. */
function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Base64 (RFC 4648) built manually: no btoa, so no environment dependence and
 * no per-chunk padding pitfalls. Padding appears only at the very end, where
 * decoders expect it.
 */
function toBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}

/**
 * Encode an RGBA image as a PNG data URI. Every scanline gets filter type 0
 * (none); the IDAT payload is a zlib stream of stored deflate blocks. Same
 * input ⇒ same bytes, on every platform.
 */
export function encodePngDataUri(image: RasterImage): string {
  const w = image.width
  const h = image.height
  const stride = w * 4 + 1
  const raw = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0
    raw.set(image.data.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1)
  }

  // zlib stream: header, stored blocks of at most 65535 payload bytes, adler32.
  const blocks: number[] = [0x78, 0x01]
  let off = 0
  while (off < raw.length) {
    const len = Math.min(65535, raw.length - off)
    const final = off + len >= raw.length ? 1 : 0
    blocks.push(final, len & 0xff, (len >> 8) & 0xff, (~len) & 0xff, ((~len) >> 8) & 0xff)
    for (let i = 0; i < len; i++) blocks.push(raw[off + i])
    off += len
  }
  const checksum = adler32(raw)
  blocks.push((checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff)
  const zlib = new Uint8Array(blocks)

  const ihdr = new Uint8Array(13)
  ihdr[0] = (w >>> 24) & 0xff
  ihdr[1] = (w >>> 16) & 0xff
  ihdr[2] = (w >>> 8) & 0xff
  ihdr[3] = w & 0xff
  ihdr[4] = (h >>> 24) & 0xff
  ihdr[5] = (h >>> 16) & 0xff
  ihdr[6] = (h >>> 8) & 0xff
  ihdr[7] = h & 0xff
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // bytes 10-12: compression, filter, interlace — all zero.

  const png = concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib),
    chunk('IEND', new Uint8Array(0)),
  ])
  return `data:image/png;base64,${toBase64(png)}`
}
