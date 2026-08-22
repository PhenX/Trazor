/**
 * Binary morphology with a square structuring element, plus despeckling.
 * Dilate/erode are separable (two sliding-window passes); pixels outside the
 * image count as background, so erosion shrinks foreground touching the
 * border (scipy `binary_erosion` semantics with border_value 0).
 */
import { createMask } from '@vectorizer/core'
import type { BinaryMask } from '@vectorizer/core'

/**
 * One sliding 1D pass: dst = 1 where the (2r+1)-window along the axis holds
 * at least `need` foreground samples (out-of-bounds samples count 0).
 * `need` = 1 gives dilation, `need` = 2r+1 gives erosion.
 */
function slidePass(
  src: Uint8Array,
  dst: Uint8Array,
  w: number,
  h: number,
  r: number,
  need: number,
  vertical: boolean,
): void {
  const len = vertical ? h : w
  const lines = vertical ? w : h
  const stepAlong = vertical ? w : 1
  const stepLine = vertical ? 1 : w
  for (let line = 0; line < lines; line++) {
    const base = line * stepLine
    let count = 0
    // Prime the window for position 0: samples [0, r].
    const prime = r < len - 1 ? r : len - 1
    for (let t = 0; t <= prime; t++) {
      if (src[base + t * stepAlong] !== 0) count++
    }
    for (let pos = 0; pos < len; pos++) {
      dst[base + pos * stepAlong] = count >= need ? 1 : 0
      const leave = pos - r
      if (leave >= 0 && src[base + leave * stepAlong] !== 0) count--
      const enter = pos + r + 1
      if (enter < len && src[base + enter * stepAlong] !== 0) count++
    }
  }
}

/** Set foreground where any pixel of the (2r+1)² square window is foreground. */
export function dilate(mask: BinaryMask, radius: number): BinaryMask {
  const { width: w, height: h, data } = mask
  if (radius <= 0) return { width: w, height: h, data: new Uint8Array(data) }
  const r = Math.max(1, Math.round(radius))
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  slidePass(data, tmp, w, h, r, 1, false)
  slidePass(tmp, out, w, h, r, 1, true)
  return { width: w, height: h, data: out }
}

/** Keep foreground only where the whole (2r+1)² square window is foreground. */
export function erode(mask: BinaryMask, radius: number): BinaryMask {
  const { width: w, height: h, data } = mask
  if (radius <= 0) return { width: w, height: h, data: new Uint8Array(data) }
  const r = Math.max(1, Math.round(radius))
  const need = 2 * r + 1
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  slidePass(data, tmp, w, h, r, need, false)
  slidePass(tmp, out, w, h, r, need, true)
  return { width: w, height: h, data: out }
}

/**
 * Remove 8-connected foreground specks smaller than `minArea` and fill
 * 4-connected background holes smaller than `minArea` (a hole is a background
 * component with no pixel on the image border). Both decisions are made on
 * the input mask; a new mask is returned.
 */
export function despeckleMask(mask: BinaryMask, minArea: number): BinaryMask {
  const { width: w, height: h, data: src } = mask
  const n = w * h
  const out = createMask(w, h)
  out.data.set(src)
  if (minArea <= 1) return out
  const visited = new Uint8Array(n)
  const stack = new Int32Array(n)
  const bag = new Int32Array(n)

  // Foreground specks, 8-connected.
  for (let i = 0; i < n; i++) {
    if (src[i] === 0 || visited[i] !== 0) continue
    let sp = 0
    let size = 0
    stack[sp++] = i
    visited[i] = 1
    while (sp > 0) {
      const p = stack[--sp]
      bag[size++] = p
      const x = p - ((p / w) | 0) * w
      const y = (p / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (visited[q] === 0 && src[q] !== 0) {
            visited[q] = 1
            stack[sp++] = q
          }
        }
      }
    }
    if (size < minArea) {
      for (let s = 0; s < size; s++) out.data[bag[s]] = 0
    }
  }

  // Background holes, 4-connected, not touching the border.
  visited.fill(0)
  for (let i = 0; i < n; i++) {
    if (src[i] !== 0 || visited[i] !== 0) continue
    let sp = 0
    let size = 0
    let touchesBorder = false
    stack[sp++] = i
    visited[i] = 1
    while (sp > 0) {
      const p = stack[--sp]
      bag[size++] = p
      const x = p - ((p / w) | 0) * w
      const y = (p / w) | 0
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true
      if (x > 0 && visited[p - 1] === 0 && src[p - 1] === 0) {
        visited[p - 1] = 1
        stack[sp++] = p - 1
      }
      if (x < w - 1 && visited[p + 1] === 0 && src[p + 1] === 0) {
        visited[p + 1] = 1
        stack[sp++] = p + 1
      }
      if (y > 0 && visited[p - w] === 0 && src[p - w] === 0) {
        visited[p - w] = 1
        stack[sp++] = p - w
      }
      if (y < h - 1 && visited[p + w] === 0 && src[p + w] === 0) {
        visited[p + w] = 1
        stack[sp++] = p + w
      }
    }
    if (!touchesBorder && size < minArea) {
      for (let s = 0; s < size; s++) out.data[bag[s]] = 1
    }
  }
  return out
}
