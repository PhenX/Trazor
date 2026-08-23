// The degradation half of the pipeline: build a background, composite the shape
// over it to form a clean scene, then corrupt a copy of that scene to form the
// model input. Ground truth (the clean scene and the edge map) is derived before
// this corruption, so input and targets stay pixel-aligned. The corruptions
// follow the high-order degradation idea from Real-ESRGAN / BSRGAN: many effects,
// each applied with a randomized probability and strength drawn from the seeded
// rng, so the model sees a wide, realistic domain rather than clean renders.

import jpeg from 'jpeg-js'
import { createImage, resizeBilinear } from './imageops.mjs'
import { chance, gaussian, int, pick, uniform } from './random.mjs'

// Opaque procedural background so inputs are not on clean white (real uploads
// rarely are). Kinds range from flat to fractal texture — a stand-in for the
// photographic/textured backgrounds real inputs sit on. Disabled ⇒ white.
export function makeBackground(width, height, rng, enabled) {
  const bg = createImage(width, height)
  const d = bg.data
  if (!enabled) {
    d.fill(255)
    return bg
  }
  const kind = pick(rng, [
    'solid',
    'gradient',
    'radial',
    'checker',
    'stripes',
    'fractal',
    'texture',
  ])
  const c1 = randColor(rng)
  const c2 = randColor(rng)
  // All shape parameters are drawn up-front so the fill loop is a pure function
  // of (x, y) — keeping the whole background reproducible from the rng state.
  const angle = uniform(rng, 0, Math.PI)
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const gInv = 1 / (Math.abs(ca) * width + Math.abs(sa) * height + 1e-6)
  const cx = uniform(rng, 0.2, 0.8) * width
  const cy = uniform(rng, 0.2, 0.8) * height
  const maxR = Math.hypot(width, height) * uniform(rng, 0.4, 0.7)
  const period = uniform(rng, 6, 22)
  const cell = int(rng, 8, 24)
  const noise = kind === 'fractal' || kind === 'texture' ? makeValueNoise(rng) : null
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let c
      if (kind === 'solid') c = c1
      else if (kind === 'gradient') c = mix(c1, c2, clamp01((ca * x + sa * y) * gInv + 0.5))
      else if (kind === 'radial') c = mix(c1, c2, clamp01(Math.hypot(x - cx, y - cy) / maxR))
      else if (kind === 'checker') c = (((x / cell) | 0) + ((y / cell) | 0)) & 1 ? c1 : c2
      else if (kind === 'stripes') c = mix(c1, c2, (Math.sin((ca * x + sa * y) / period) + 1) / 2)
      else if (kind === 'fractal') c = mix(c1, c2, noise(x, y))
      else {
        // texture: a base color modulated in luminance by fractal noise (grain).
        const t = (noise(x, y) - 0.5) * 130
        c = [c1[0] + t, c1[1] + t, c1[2] + t]
      }
      d[i] = c[0]
      d[i + 1] = c[1]
      d[i + 2] = c[2]
      d[i + 3] = 255
    }
  }
  return bg
}

// Matting error: a thin colored rim just outside the shape's silhouette — the
// halo an imperfect cutout (e.g. the app's own background removal) leaves behind.
// Applied to a copy of the shape used only for the INPUT composite, so the clean
// target and the edge/field targets stay halo-free and pixel-aligned. Two seeded
// draws (rim color + alpha) drive it, so it stays deterministic.
export function matteHalo(shape, rng, strengthMax) {
  const { width: w, height: h, data } = shape
  const out = { width: w, height: h, data: new Uint8ClampedArray(data) }
  const o = out.data
  const [fr, fg, fb] = randColor(rng)
  const rim = Math.round(255 * uniform(rng, 0.35, strengthMax))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] >= 40) continue // keep the shape and its anti-aliased edge
      // Fill a transparent pixel that abuts the (near-)opaque silhouette.
      let nearShape = false
      for (let dy = -1; dy <= 1 && !nearShape; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          if (data[(ny * w + nx) * 4 + 3] > 100) {
            nearShape = true
            break
          }
        }
      }
      if (nearShape) {
        o[i] = fr
        o[i + 1] = fg
        o[i + 2] = fb
        o[i + 3] = rim
      }
    }
  }
  return out
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
  // Tone: gamma + brightness/contrast drift (scans, screens, color profiles).
  if (p.tone && chance(rng, p.toneProb)) {
    out = applyTone(
      out,
      uniform(rng, p.gammaMin, p.gammaMax),
      uniform(rng, -p.brightnessMax, p.brightnessMax),
      uniform(rng, 1 - p.contrastMax, 1 + p.contrastMax),
    )
  }
  // Blur: isotropic, sometimes anisotropic (motion / directional defocus).
  if (p.blurSigmaMax > 0 && chance(rng, 0.8)) {
    const sx = uniform(rng, 0.3, p.blurSigmaMax)
    const sy = chance(rng, p.blurAnisoProb) ? uniform(rng, 0.3, p.blurSigmaMax) : sx
    out = gaussianBlur(out, sx, sy)
  }
  // Low-resolution source: down- then up-sample.
  if (p.resampleMinScale < 1 && chance(rng, 0.7))
    out = resampleRoundtrip(out, uniform(rng, p.resampleMinScale, 1))
  // Sensor noise: Gaussian read noise + optional intensity-dependent shot noise.
  if (p.noiseStdMax > 0) out = addNoise(out, uniform(rng, 0, p.noiseStdMax), rng)
  if (p.poissonProb > 0 && chance(rng, p.poissonProb))
    out = addPoissonNoise(out, uniform(rng, 0.3, p.poissonStrengthMax), rng)
  // Palette reduction: hard posterize or Floyd–Steinberg dither (GIF-style).
  if (p.dither && chance(rng, p.ditherProb))
    out = ditherReduce(out, int(rng, p.ditherLevels.min, p.ditherLevels.max))
  else if (p.posterizeLevels > 0) out = posterize(out, p.posterizeLevels)
  // JPEG blocks, sometimes re-encoded a second time (double compression).
  if (p.jpeg) {
    out = jpegRoundtrip(out, int(rng, p.jpegQuality.min, p.jpegQuality.max))
    if (p.doubleJpegProb > 0 && chance(rng, p.doubleJpegProb))
      out = jpegRoundtrip(out, int(rng, p.jpegQuality.min, p.jpegQuality.max))
  }
  return out
}

// Gamma, then contrast about mid-gray, then a brightness offset (all in [0,1]).
function applyTone(img, gamma, brightness, contrast) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const d = out.data
  const invG = 1 / gamma
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = d[i + c] / 255
      v = Math.pow(v, invG)
      v = (v - 0.5) * contrast + 0.5 + brightness
      d[i + c] = v * 255 // Uint8ClampedArray clamps on store
    }
  }
  return out
}

// Fractal (multi-octave) value noise in [0,1], seeded once from the rng. Integer-
// lattice hash, smoothstep-interpolated, four octaves — a cheap organic texture.
function makeValueNoise(rng) {
  const seed = (rng() * 4294967296) >>> 0
  const hash = (ix, iy) => {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + seed) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const noise2 = (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = smoothstep01(x - x0)
    const fy = smoothstep01(y - y0)
    const n00 = hash(x0, y0)
    const n10 = hash(x0 + 1, y0)
    const n01 = hash(x0, y0 + 1)
    const n11 = hash(x0 + 1, y0 + 1)
    const nx0 = n00 + (n10 - n00) * fx
    const nx1 = n01 + (n11 - n01) * fx
    return nx0 + (nx1 - nx0) * fy
  }
  return (x, y) => {
    let sum = 0
    let amp = 0.5
    let freq = 1 / 24
    for (let o = 0; o < 4; o++) {
      sum += amp * noise2(x * freq, y * freq)
      amp *= 0.5
      freq *= 2
    }
    return clamp01(sum)
  }
}

// Separable Gaussian blur with independent horizontal/vertical sigma (RGB only;
// alpha is already opaque here). Equal sigma ⇒ isotropic.
function gaussianBlur(img, sigmaX, sigmaY = sigmaX) {
  const x = makeKernel(sigmaX)
  const y = makeKernel(sigmaY)
  return convolveSeparable(img, x.kernel, x.radius, y.kernel, y.radius)
}

function makeKernel(sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + radius] = v
    sum += v
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum
  return { kernel, radius }
}

function convolveSeparable(img, kernelX, radiusX, kernelY, radiusY) {
  const { width: w, height: h, data } = img
  const tmp = createImage(w, h).data
  const out = createImage(w, h)
  const o = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let k = -radiusX; k <= radiusX; k++) {
        const xx = clampInt(x + k, 0, w - 1)
        const i = (y * w + xx) * 4
        const wk = kernelX[k + radiusX]
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
      for (let k = -radiusY; k <= radiusY; k++) {
        const yy = clampInt(y + k, 0, h - 1)
        const i = (yy * w + x) * 4
        const wk = kernelY[k + radiusY]
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

// Shot noise: per-channel Gaussian whose sigma grows with the square root of
// intensity (a Gaussian approximation of Poisson photon noise).
function addPoissonNoise(img, strength, rng) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const d = out.data
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c]
      d[i + c] = v + gaussian(rng, 0, strength * Math.sqrt(v))
    }
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

// Floyd–Steinberg error-diffusion to `levels` per channel (GIF-style banding
// with dithered gradients). Deterministic: no rng, the error carries the pattern.
function ditherReduce(img, levels) {
  const { width: w, height: h } = img
  const out = { width: w, height: h, data: new Uint8ClampedArray(img.data) }
  const d = out.data
  const step = 255 / (levels - 1)
  const buf = new Float32Array(w * h * 3)
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    buf[j] = d[i]
    buf[j + 1] = d[i + 1]
    buf[j + 2] = d[i + 2]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 3
      for (let c = 0; c < 3; c++) {
        const old = buf[j + c]
        const q = Math.round(old / step) * step
        const err = old - q
        buf[j + c] = q
        if (x + 1 < w) buf[j + 3 + c] += (err * 7) / 16
        if (y + 1 < h) {
          if (x > 0) buf[j + (w - 1) * 3 + c] += (err * 3) / 16
          buf[j + w * 3 + c] += (err * 5) / 16
          if (x + 1 < w) buf[j + (w + 1) * 3 + c] += (err * 1) / 16
        }
      }
    }
  }
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    d[i] = buf[j]
    d[i + 1] = buf[j + 1]
    d[i + 2] = buf[j + 2]
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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// Hermite smoothstep on [0,1]; the interpolation weight for value noise.
function smoothstep01(t) {
  return t * t * (3 - 2 * t)
}
