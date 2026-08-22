// Output helpers: 8-bit PNG writing (via pngjs) and the JSON manifest. The
// manifest carries the full config and per-sample records but no wall-clock, so
// dataset content stays reproducible for a given (config, platform).

import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

export function writeRgbaPng(path, img) {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  writeFileSync(path, PNG.sync.write(png))
}

// Single-channel data written as a gray RGBA PNG for portability.
export function writeGrayPng(path, gray, width, height) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    const v = gray[i]
    png.data[i * 4] = v
    png.data[i * 4 + 1] = v
    png.data[i * 4 + 2] = v
    png.data[i * 4 + 3] = 255
  }
  writeFileSync(path, PNG.sync.write(png))
}

export function writeManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

// Make an id safe as a flat filename.
export function sanitize(id) {
  return id.replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
}
