/**
 * Write the gradient scene images (`packages/engine/test/helpers/gradient-scenes.ts`)
 * as PNG files, to try them in the studio or any tracer.
 *
 * Run:  npx tsx scripts/gradient-scenes.ts [outDir]     (default: e2e-artifacts/gradient-scenes)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import type { RasterImage } from '@trazor/core'
import { scenes } from '../packages/engine/test/helpers/gradient-scenes'

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(Buffer.from(type, 'ascii'), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}
/** Encode an RGBA raster as an 8-bit PNG (filter 0 on every scanline). */
export function encodePng(image: RasterImage): Uint8Array {
  const { width, height, data } = image
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width)
  v.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]
  return Buffer.concat(parts)
}

const outDir = process.argv[2] ?? join('e2e-artifacts', 'gradient-scenes')
mkdirSync(outDir, { recursive: true })
for (const scene of scenes) {
  const file = join(
    outDir,
    `${scene.name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()}.png`,
  )
  writeFileSync(file, encodePng(scene.image()))
  console.log(file, JSON.stringify(scene.settings))
}
