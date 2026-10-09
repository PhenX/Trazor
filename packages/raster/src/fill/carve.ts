/**
 * Residual feature carving: features the palette quantized away get regions of
 * their own.
 *
 * The palette sees colors, not features: a two-pixel white seam through a black
 * shape, a pair of dots, the end of a thin stroke all quantize to the ink around
 * them. The fill fitter then sees a region with a cluster of pixels no fill
 * explains, and its only tool is a gradient. This pass, run after the band merge
 * and before the face split, finds those clusters and mints a flat region for
 * each, in three stages:
 *
 * 1. **Mask.** A pixel is a candidate when it is strictly interior to its label,
 *    pure (not a blend of nearby inks, so the anti-aliasing of a gap between two
 *    strokes is not drawn), its label has at least eight pure interior pixels (a
 *    region with fewer has no reliable color of its own and is left alone), and
 *    its residual against the label's chosen fill, `max_ch |c − f(x, y)|` in sRGB,
 *    exceeds `max(8σ, CARVE_RESIDUAL)`. Where a separate interior noise is given
 *    and the pixel's 7 × 7 neighborhood is all one label, that noise sets the
 *    threshold instead.
 * 2. **Mint.** The 4-connected clusters of the mask within one label, in raster
 *    order of their first pixel: one of at least `max(minSize, 4)` pixels, while
 *    fewer than {@link CARVE_MAX} were minted and the label space has room, gets
 *    the next label, a flat fill of its per-channel median color, and as its ink
 *    the palette entry nearest that color (squared sRGB distance, ties to the
 *    lower index).
 * 3. **Refit.** The evidence is recomputed on the new labels (the features are
 *    inks of their own) and every label that lost pixels is refitted by full model
 *    selection over what is left.
 *
 * `fills` and `ink` are indexed by label (as {@link mergeGradientBands} returns
 * them) and grow by one entry per minted region; `labels` is rewritten in place.
 * Each label's ink color is its palette color, or for a label minted past the
 * palette its fill's representative color. Fill models are in Trazor's pixel frame.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/carve.rs` (`CARVE_RESIDUAL`,
 * `CARVE_MAX`, `carve_residual_features`, `carve_residual_features_with_detail_noise`,
 * `CarveImage::inks`, `interior4`, `residual_mask`, `region_flat_colours`,
 * `flood_cluster`, `median_colour`, `mint_features`, `refit_parents`).
 */

import { fillEvidence } from './evidence'
import { FillEval, flatOnly, representative } from './model'
import type { FillFit, Rgb } from './model'
import { toFittingFrame } from './samples'
import { fitPixels, pixelsOf, select } from './select'

/**
 * Residual (sRGB, per channel) beyond which an interior pixel is not explained by
 * its region's fill: the floor of `max(8σ, CARVE_RESIDUAL)`, about 15 levels. An
 * anti-aliasing fringe the evidence test let through sits below it; a seam, a dot
 * or a stroke the palette quantized away sits far above.
 */
export const CARVE_RESIDUAL = 0.06

/** Most features carved from one image, a guard against a textured region shattering. */
export const CARVE_MAX = 64

/** Pure interior pixels a label needs before its pixels can be carved. */
const MIN_FLAT_SAMPLES = 8

/** The label space: ids below 65535 (inkvec's `u16`, the top value reserved). */
const LABEL_LIMIT = 65535

const fr = Math.fround

/**
 * Give clustered residual pixels their own flat regions; returns how many were
 * minted. Nothing is minted for an empty image or an empty `fills`.
 *
 * `rgb` is the image composited over white (encoded sRGB, three per pixel),
 * `inkRgb` the palette (three encoded sRGB values per ink), `sigmaNoise` the
 * per-channel sRGB noise, `lambda` the price of one editable number, `minSize` the
 * least cluster (raised to 4), and `detailSigma`, when not null, the noise for a
 * pixel whose 7 × 7 neighborhood is all its own label. Without `gradients` a
 * parent is refitted flat.
 */
export function carveResidualFeatures(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  inkRgb: ArrayLike<number>,
  fills: FillFit[],
  ink: number[],
  sigmaNoise: number,
  lambda: number,
  minSize: number,
  detailSigma: number | null = null,
  gradients = true,
): number {
  const n = w * h
  if (fills.length === 0 || n === 0) return 0
  const palette = Float32Array.from(inkRgb)
  const mask = residualMask(labels, rgb, w, h, palette, fills, sigmaNoise, detailSigma)
  const parents: number[] = []
  const minted = mintFeatures(
    labels,
    rgb,
    w,
    h,
    palette,
    fills,
    ink,
    mask,
    minSize,
    lambda,
    parents,
  )
  if (minted === 0) return 0
  refitParents(labels, rgb, w, h, palette, fills, parents, sigmaNoise, lambda, gradients)
  return minted
}

/** The ink color of every label: the palette color for palette labels, the fill's representative past the palette. */
function inksOf(palette: Float32Array, fills: readonly FillFit[]): Float64Array {
  const nPal = Math.floor(palette.length / 3)
  const out = new Float64Array(3 * fills.length)
  for (let l = 0; l < fills.length; l++) {
    const c: Rgb =
      l < nPal
        ? [palette[3 * l], palette[3 * l + 1], palette[3 * l + 2]]
        : representative(fills[l].model)
    out[3 * l] = c[0]
    out[3 * l + 1] = c[1]
    out[3 * l + 2] = c[2]
  }
  return out
}

/** Whether pixel `p` is strictly inside its label: off the picture edge, all four neighbors the same label. */
function interior4(labels: Int32Array, w: number, h: number, p: number): boolean {
  const l = labels[p]
  const x = p % w
  return (
    x > 0 &&
    x + 1 < w &&
    p >= w &&
    p + w < w * h &&
    labels[p - 1] === l &&
    labels[p + 1] === l &&
    labels[p - w] === l &&
    labels[p + w] === l
  )
}

/** Whether every pixel of the 7 × 7 neighborhood of `(x, y)` carries label `l` (false within 3 px of the edge). */
function wholeNeighborhood(
  labels: Int32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  l: number,
): boolean {
  if (x < 3 || y < 3 || x + 3 >= w || y + 3 >= h) return false
  for (let yy = y - 3; yy <= y + 3; yy++) {
    for (let xx = x - 3; xx <= x + 3; xx++) if (labels[yy * w + xx] !== l) return false
  }
  return true
}

/**
 * Stage 1: per pixel, 1 when the chosen fill does not explain it (see the module
 * comment). The residual is tested against the fill the fitter chose, and the
 * label's pure interior count only gates.
 */
function residualMask(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Float32Array,
  fills: readonly FillFit[],
  sigmaNoise: number,
  detailSigma: number | null,
): Uint8Array {
  const n = w * h
  const nLabels = fills.length
  const thr = fr(Math.max(8 * sigmaNoise, CARVE_RESIDUAL))
  const detailThr = detailSigma === null ? 0 : fr(Math.max(8 * detailSigma, CARVE_RESIDUAL))
  const pure = fillEvidence(rgb, w, h, labels, inksOf(palette, fills), sigmaNoise)
  const flatSamples = new Int32Array(nLabels)
  for (let p = 0; p < n; p++) {
    const l = labels[p]
    if (l >= 0 && l < nLabels && pure[p] === 1 && interior4(labels, w, h, p)) flatSamples[l]++
  }
  const evals: (FillEval | null)[] = Array.from({ length: nLabels }, () => null)
  const pred = new Float64Array(3)
  const mask = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const l = labels[p]
    if (l < 0 || l >= nLabels || flatSamples[l] < MIN_FLAT_SAMPLES) continue
    if (!interior4(labels, w, h, p) || pure[p] === 0) continue
    const x = p % w
    const y = (p - x) / w
    let ev = evals[l]
    if (ev === null) {
      ev = new FillEval(toFittingFrame(fills[l].model))
      evals[l] = ev
    }
    ev.colorAt(x, y, pred, 0)
    let r = 0
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(fr(rgb[3 * p + k] - pred[k]))
      if (d > r) r = d
    }
    const t = detailSigma !== null && wholeNeighborhood(labels, w, h, x, y, l) ? detailThr : thr
    if (r > t) mask[p] = 1
  }
  return mask
}

/**
 * The 4-connected cluster of masked pixels `start` belongs to, within its label, by
 * depth-first flood fill into `out`; returns its size. Visited pixels are marked in
 * `seen`, so every pixel joins at most one cluster.
 */
function floodCluster(
  mask: Uint8Array,
  seen: Uint8Array,
  labels: Int32Array,
  w: number,
  h: number,
  start: number,
  stack: Int32Array,
  out: Int32Array,
): number {
  const l = labels[start]
  const n = w * h
  let top = 0
  let len = 0
  stack[top++] = start
  seen[start] = 1
  const visit = (q: number): void => {
    if (mask[q] === 1 && seen[q] === 0 && labels[q] === l) {
      seen[q] = 1
      stack[top++] = q
    }
  }
  while (top > 0) {
    const p = stack[--top]
    out[len++] = p
    const x = p % w
    if (x > 0) visit(p - 1)
    if (x + 1 < w) visit(p + 1)
    if (p >= w) visit(p - w)
    if (p + w < n) visit(p + w)
  }
  return len
}

/** Per-channel sRGB median of the pixels `group` (the upper median for an even count); `group` not empty. */
function medianColor(rgb: Float32Array, group: Int32Array): Rgb {
  const v = new Float32Array(group.length)
  const out: [number, number, number] = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < group.length; i++) v[i] = rgb[3 * group[i] + k]
    v.sort()
    out[k] = v[group.length >> 1]
  }
  return out
}

/** Index of the palette entry nearest `color` (squared sRGB distance in single precision), ties to the lower; `fallback` for an empty palette. */
function nearestInk(palette: Float32Array, color: Rgb, fallback: number): number {
  let best = fallback
  let bestD = Infinity
  for (let i = 0; 3 * i < palette.length; i++) {
    const d0 = fr(palette[3 * i] - color[0])
    const d1 = fr(palette[3 * i + 1] - color[1])
    const d2 = fr(palette[3 * i + 2] - color[2])
    const d = fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2))
    if (d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/**
 * Stage 2: give every large enough cluster of `mask` its own label and flat fill
 * (see the module comment). Appends the labels the features were cut from to
 * `parents`, in first-cut order; returns how many were minted.
 */
function mintFeatures(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Float32Array,
  fills: FillFit[],
  ink: number[],
  mask: Uint8Array,
  minSize: number,
  lambda: number,
  parents: number[],
): number {
  const n = w * h
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const cluster = new Int32Array(n)
  const least = Math.max(minSize, 4)
  let minted = 0
  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue
    const l = labels[start]
    const size = floodCluster(mask, seen, labels, w, h, start, stack, cluster)
    if (size < least || minted >= CARVE_MAX) continue
    const group = cluster.subarray(0, size)
    const color = medianColor(rgb, group)
    const label = fills.length
    if (label >= LABEL_LIMIT) break
    for (let i = 0; i < size; i++) labels[group[i]] = label
    fills.push(flatOnly(color, lambda))
    ink.push(nearestInk(palette, color, l))
    if (!parents.includes(l)) parents.push(l)
    minted++
  }
  return minted
}

/**
 * Stage 3: refit every parent without the pixels that were never its own, by full
 * model selection over its remaining pixels (flat only without `gradients`), with
 * the evidence recomputed on the new labels.
 */
function refitParents(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  palette: Float32Array,
  fills: FillFit[],
  parents: readonly number[],
  sigmaNoise: number,
  lambda: number,
  gradients: boolean,
): void {
  const pure = fillEvidence(rgb, w, h, labels, inksOf(palette, fills), sigmaNoise)
  for (const l of parents) {
    fills[l] = select(
      fitPixels(
        rgb,
        w,
        h,
        pixelsOf(labels, l),
        (p) => labels[p] === l,
        (p) => pure[p] === 1,
        sigmaNoise,
        lambda,
        gradients,
      ),
    )
  }
}
