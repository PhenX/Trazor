// RGBA image helpers on flat Uint8ClampedArray buffers (length w*h*4, y-down),
// mirroring the pixel conventions of @trazor/raster. Dependency-free and
// allocation-conscious; an image is { width, height, data }.

export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

// Bilinear resample to an arbitrary size.
export function resizeBilinear(img, outW, outH) {
  const { width: w, height: h, data } = img
  const out = createImage(outW, outH)
  const o = out.data
  const sx = w / outW
  const sy = h / outH
  for (let y = 0; y < outH; y++) {
    const fy = (y + 0.5) * sy - 0.5
    const y0 = Math.floor(fy)
    const wy = fy - y0
    const y0c = clampInt(y0, 0, h - 1)
    const y1c = clampInt(y0 + 1, 0, h - 1)
    for (let x = 0; x < outW; x++) {
      const fx = (x + 0.5) * sx - 0.5
      const x0 = Math.floor(fx)
      const wx = fx - x0
      const x0c = clampInt(x0, 0, w - 1)
      const x1c = clampInt(x0 + 1, 0, w - 1)
      const i00 = (y0c * w + x0c) * 4
      const i01 = (y0c * w + x1c) * 4
      const i10 = (y1c * w + x0c) * 4
      const i11 = (y1c * w + x1c) * 4
      const oi = (y * outW + x) * 4
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - wx) + data[i01 + c] * wx
        const bot = data[i10 + c] * (1 - wx) + data[i11 + c] * wx
        o[oi + c] = top * (1 - wy) + bot * wy
      }
    }
  }
  return out
}

// Area-average downsample (box filter over the covered source rectangle) — the
// anti-aliasing step for a supersampled render. Falls back to bilinear on upscale.
export function resizeArea(img, outW, outH) {
  const { width: w, height: h, data } = img
  if (outW >= w && outH >= h) return resizeBilinear(img, outW, outH)
  const out = createImage(outW, outH)
  const o = out.data
  const sx = w / outW
  const sy = h / outH
  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.min(h, Math.ceil((y + 1) * sy))
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.min(w, Math.ceil((x + 1) * sx))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          n++
        }
      }
      const oi = (y * outW + x) * 4
      o[oi] = r / n
      o[oi + 1] = g / n
      o[oi + 2] = b / n
      o[oi + 3] = a / n
    }
  }
  return out
}

// Inverse-mapped affine transform about the image center (rotate degrees, uniform
// scale, fractional translate), bilinear sampled; samples outside the source stay
// transparent.
export function affineTransform(img, { rotateDeg = 0, scale = 1, tx = 0, ty = 0 }) {
  const { width: w, height: h, data } = img
  const out = createImage(w, h)
  const o = out.data
  const rad = (rotateDeg * Math.PI) / 180
  const cos = Math.cos(rad) / scale
  const sin = Math.sin(rad) / scale
  const cx = w / 2
  const cy = h / 2
  const dx = tx * w
  const dy = ty * h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rx = x - cx - dx
      const ry = y - cy - dy
      const sxp = cos * rx + sin * ry + cx
      const syp = -sin * rx + cos * ry + cy
      const oi = (y * w + x) * 4
      if (sxp < 0 || syp < 0 || sxp > w - 1 || syp > h - 1) continue
      const x0 = Math.floor(sxp)
      const y0 = Math.floor(syp)
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const wx = sxp - x0
      const wy = syp - y0
      const i00 = (y0 * w + x0) * 4
      const i01 = (y0 * w + x1) * 4
      const i10 = (y1 * w + x0) * 4
      const i11 = (y1 * w + x1) * 4
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - wx) + data[i01 + c] * wx
        const bot = data[i10 + c] * (1 - wx) + data[i11 + c] * wx
        o[oi + c] = top * (1 - wy) + bot * wy
      }
    }
  }
  return out
}

// Fit an image into a square `side`×`side` canvas, longest edge scaled to `side`
// and centered on transparent (letterbox) — the input convention U²-Net and
// SlimSAM already use in @trazor/ml.
export function fitSquare(img, side) {
  const s = Math.min(side / img.width, side / img.height)
  const rw = Math.max(1, Math.round(img.width * s))
  const rh = Math.max(1, Math.round(img.height * s))
  const resized = rw === img.width && rh === img.height ? img : resizeBilinear(img, rw, rh)
  const out = createImage(side, side)
  const ox = ((side - rw) / 2) | 0
  const oy = ((side - rh) / 2) | 0
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const si = (y * rw + x) * 4
      const di = ((y + oy) * side + (x + ox)) * 4
      out.data[di] = resized.data[si]
      out.data[di + 1] = resized.data[si + 1]
      out.data[di + 2] = resized.data[si + 2]
      out.data[di + 3] = resized.data[si + 3]
    }
  }
  return out
}

function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
