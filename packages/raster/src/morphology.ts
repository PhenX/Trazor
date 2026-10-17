/**
 * Despeckling of a binary mask: small foreground specks removed, small
 * background holes filled, optionally sparing what a protect mask covers.
 */
import { createMask } from '@trazor/core'
import type { BinaryMask } from '@trazor/core'

/**
 * Remove 8-connected foreground specks smaller than `minArea` and fill
 * 4-connected background holes smaller than `minArea` (a hole is a background
 * component with no pixel on the image border). Both decisions are made on the
 * input mask; a new mask is returned. A component is left untouched when any of
 * its pixels overlaps `protect` (1 = protected; `null` for none), even when it
 * is below `minArea` — so a boundary map (e.g. EdgeEnhancer's, thresholded to a
 * mask) keeps thin real features a size filter would otherwise erase. `protect`
 * must match the mask dimensions.
 */
export function despeckleMaskGuided(
  mask: BinaryMask,
  minArea: number,
  protect: BinaryMask | null,
): BinaryMask {
  const { width: w, height: h, data: src } = mask
  const n = w * h
  const out = createMask(w, h)
  out.data.set(src)
  if (minArea <= 1) return out
  const prot = protect?.data ?? null
  const visited = new Uint8Array(n)
  const stack = new Int32Array(n)
  const bag = new Int32Array(n)

  // Foreground specks, 8-connected.
  for (let i = 0; i < n; i++) {
    if (src[i] === 0 || visited[i] !== 0) continue
    let sp = 0
    let size = 0
    let guarded = false
    stack[sp++] = i
    visited[i] = 1
    while (sp > 0) {
      const p = stack[--sp]
      bag[size++] = p
      if (prot !== null && prot[p] !== 0) guarded = true
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
    if (size < minArea && !guarded) {
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
    let guarded = false
    stack[sp++] = i
    visited[i] = 1
    while (sp > 0) {
      const p = stack[--sp]
      bag[size++] = p
      if (prot !== null && prot[p] !== 0) guarded = true
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
    if (!touchesBorder && size < minArea && !guarded) {
      for (let s = 0; s < size; s++) out.data[bag[s]] = 1
    }
  }
  return out
}
