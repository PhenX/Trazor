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

// Projective (perspective) warp: sends the image's four corners to `corners`
// (dest positions in [0,1] for the unit-square corners (0,0),(1,0),(1,1),(0,1)),
// inverse-sampled bilinearly. Content mapped outside the source stays transparent,
// so a warped shape keeps its alpha. Simulates a photo of a screen/paper at an angle.
export function perspectiveTransform(img, corners) {
  const { width: w, height: h, data } = img
  const out = createImage(w, h)
  const o = out.data
  const hi = invert3(squareToQuad(corners))
  if (!hi) return { width: w, height: h, data: new Uint8ClampedArray(data) }
  const sw = w > 1 ? w - 1 : 1
  const sh = h > 1 ? h - 1 : 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const oi = (y * w + x) * 4
      const den = hi[6] * (x / sw) + hi[7] * (y / sh) + hi[8]
      const u = (hi[0] * (x / sw) + hi[1] * (y / sh) + hi[2]) / den
      const v = (hi[3] * (x / sw) + hi[4] * (y / sh) + hi[5]) / den
      if (u < 0 || v < 0 || u > 1 || v > 1) continue // transparent outside the source
      const sx = u * sw
      const sy = v * sh
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * w + x0) * 4
      const i01 = (y0 * w + x1) * 4
      const i10 = (y1 * w + x0) * 4
      const i11 = (y1 * w + x1) * 4
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i01 + c] * fx
        const bot = data[i10 + c] * (1 - fx) + data[i11 + c] * fx
        o[oi + c] = top * (1 - fy) + bot * fy
      }
    }
  }
  return out
}

// Radial (barrel/pincushion) lens distortion: each output pixel samples the source
// at radius r·(1 + k·r²) about the center (r normalized so the corner is 1). k = 0
// is an exact no-op; sign selects barrel vs. pincushion. Content mapped outside the
// source stays transparent. Simulates a phone-camera lens on a photographed input.
export function lensDistort(img, k) {
  const { width: w, height: h, data } = img
  if (k === 0) return { width: w, height: h, data: new Uint8ClampedArray(data) }
  const out = createImage(w, h)
  const o = out.data
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const maxR = Math.hypot(cx, cy) || 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const oi = (y * w + x) * 4
      const nx = (x - cx) / maxR
      const ny = (y - cy) / maxR
      const f = 1 + k * (nx * nx + ny * ny)
      const sx = cx + nx * f * maxR
      const sy = cy + ny * f * maxR
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * w + x0) * 4
      const i01 = (y0 * w + x1) * 4
      const i10 = (y1 * w + x0) * 4
      const i11 = (y1 * w + x1) * 4
      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i01 + c] * fx
        const bot = data[i10 + c] * (1 - fx) + data[i11 + c] * fx
        o[oi + c] = top * (1 - fy) + bot * fy
      }
    }
  }
  return out
}

// Copy the `cw`×`ch` region at (x0, y0) out of an RGBA image (assumes in-bounds).
export function cropRegion(img, x0, y0, cw, ch) {
  const { width: w, data } = img
  const out = createImage(cw, ch)
  const o = out.data
  for (let y = 0; y < ch; y++) {
    const srow = ((y0 + y) * w + x0) * 4
    const drow = y * cw * 4
    for (let i = 0; i < cw * 4; i++) o[drow + i] = data[srow + i]
  }
  return out
}

// Homography (row-major 3×3) mapping the unit square's corners to `q` (Heckbert).
function squareToQuad(q) {
  const [q0, q1, q2, q3] = q
  const dx1 = q1.x - q2.x
  const dx2 = q3.x - q2.x
  const dx3 = q0.x - q1.x + q2.x - q3.x
  const dy1 = q1.y - q2.y
  const dy2 = q3.y - q2.y
  const dy3 = q0.y - q1.y + q2.y - q3.y
  if (Math.abs(dx3) < 1e-10 && Math.abs(dy3) < 1e-10) {
    // Affine quad — no projective term.
    return [q1.x - q0.x, q3.x - q0.x, q0.x, q1.y - q0.y, q3.y - q0.y, q0.y, 0, 0, 1]
  }
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const hh = (dx1 * dy3 - dx3 * dy1) / den
  return [
    q1.x - q0.x + g * q1.x,
    q3.x - q0.x + hh * q3.x,
    q0.x,
    q1.y - q0.y + g * q1.y,
    q3.y - q0.y + hh * q3.y,
    q0.y,
    g,
    hh,
    1,
  ]
}

// Inverse of a row-major 3×3 matrix (adjugate / determinant); null if singular.
function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = c * h - b * i
  const C = b * f - c * e
  const D = f * g - d * i
  const E = a * i - c * g
  const F = c * d - a * f
  const G = d * h - e * g
  const H = b * g - a * h
  const I = a * e - b * d
  const det = a * A + b * D + c * G
  if (Math.abs(det) < 1e-12) return null
  const s = 1 / det
  return [A * s, B * s, C * s, D * s, E * s, F * s, G * s, H * s, I * s]
}

function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
