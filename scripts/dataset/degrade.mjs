// The degradation half of the pipeline: build a background, composite the shape
// over it to form a clean scene, then corrupt a copy of that scene to form the
// model input. Ground truth (the clean scene and the edge map) is derived before
// this corruption, so input and targets stay pixel-aligned. The corruptions
// follow the high-order degradation idea from Real-ESRGAN / BSRGAN.

import jpeg from 'jpeg-js'
import { createImage, resizeBilinear } from './imageops.mjs'
import { chance, gaussian, int, pick, uniform } from './random.mjs'

// Opaque procedural background so inputs are not on clean white (real uploads
// rarely are). With backgrounds disabled the scene sits on white.
export function makeBackground(width, height, rng, enabled) {
  const bg = createImage(width, height)
  const d = bg.data
  if (!enabled) {
    d.fill(255)
    return bg
  }
  const kind = pick(rng, ['solid', 'gradient', 'checker', 'noise'])
  const c1 = randColor(rng)
  const c2 = randColor(rng)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let c
      if (kind === 'solid') c = c1
      else if (kind === 'gradient') c = mix(c1, c2, x / width)
      else if (kind === 'checker') c = ((x >> 4) + (y >> 4)) & 1 ? c1 : c2
      else c = mix(c1, c2, (Math.sin(x * 0.08) + Math.cos(y * 0.08) + 2) / 4)
      d[i] = c[0]
      d[i + 1] = c[1]
      d[i + 2] = c[2]
      d[i + 3] = 255
    }
  }
  return bg
}

// Source-over composite of an RGBA shape onto an opaque background → opaque scene.
export function compositeOver(shape, bg) {
  const out = createImage(bg.width, bg.height)
  const s = shape.data
  const b = bg.data
  const o = out.data
  for (let i = 0; i < o.length; i += 4) {
    const a = s[i + 3] / 255
    o[i] = s[i] * a + b[i] * (1 - a)
    o[i + 1] = s[i + 1] * a + b[i + 1] * (1 - a)
    o[i + 2] = s[i + 2] * a + b[i + 2] * (1 - a)
    o[i + 3] = 255
  }
  return out
}

export function degrade(scene, cfg, rng) {
  const p = cfg.degrade
  let out = scene
  if (p.blurSigmaMax > 0 && chance(rng, 0.8))
    out = gaussianBlur(out, uniform(rng, 0.3, p.blurSigmaMax))
  if (p.resampleMinScale < 1 && chance(rng, 0.7))
    out = resampleRoundtrip(out, uniform(rng, p.resampleMinScale, 1))
  if (p.noiseStdMax > 0) out = addNoise(out, uniform(rng, 0, p.noiseStdMax), rng)
  if (p.posterizeLevels > 0) out = posterize(out, p.posterizeLevels)
  if (p.jpeg) out = jpegRoundtrip(out, int(rng, p.jpegQuality.min, p.jpegQuality.max))
  return out
}

// Separable Gaussian blur (RGB only; alpha is already opaque here).
function gaussianBlur(img, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + radius] = v
    sum += v
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  return convolveSeparable(img, kernel, radius)
}

function convolveSeparable(img, kernel, radius) {
  const { width: w, height: h, data } = img
  const tmp = createImage(w, h).data
  const out = createImage(w, h)
  const o = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = clampInt(x + k, 0, w - 1)
        const i = (y * w + xx) * 4
        const wk = kernel[k + radius]
        r += data[i] * wk
        g += data[i + 1] * wk
        b += data[i + 2] * wk
      }
      const ti = (y * w + x) * 4
      tmp[ti] = r
      tmp[ti + 1] = g
      tmp[ti + 2] = b
      tmp[ti + 3] = 255
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = clampInt(y + k, 0, h - 1)
        const i = (yy * w + x) * 4
        const wk = kernel[k + radius]
        r += tmp[i] * wk
        g += tmp[i + 1] * wk
        b += tmp[i + 2] * wk
      }
      const oi = (y * w + x) * 4
      o[oi] = r
      o[oi + 1] = g
      o[oi + 2] = b
      o[oi + 3] = 255
    }
  }
  return out
}

// Downscale then upscale to simulate a low-resolution source.
function resampleRoundtrip(img, scale) {
  const dw = Math.max(1, Math.round(img.width * scale))
  const dh = Math.max(1, Math.round(img.height * scale))
  return resizeBilinear(resizeBilinear(img, dw, dh), img.width, img.height)
}

function addNoise(img, std, rng) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const d = out.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] += gaussian(rng, 0, std)
    d[i + 1] += gaussian(rng, 0, std)
    d[i + 2] += gaussian(rng, 0, std)
  }
  return out
}

function posterize(img, levels) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const d = out.data
  const step = 255 / (levels - 1)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step
    d[i + 1] = Math.round(d[i + 1] / step) * step
    d[i + 2] = Math.round(d[i + 2] / step) * step
  }
  return out
}

// Encode to JPEG at the given quality and decode back, baking in block artifacts.
function jpegRoundtrip(img, quality) {
  const raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  const encoded = jpeg.encode({ data: raw, width: img.width, height: img.height }, quality)
  const decoded = jpeg.decode(encoded.data, { useTArray: true })
  return { width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data) }
}

function randColor(rng) {
  return [int(rng, 0, 255), int(rng, 0, 255), int(rng, 0, 255)]
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
