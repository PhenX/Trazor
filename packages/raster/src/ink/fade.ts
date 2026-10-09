/**
 * Fades: translucent regions whose opacity varies across them (a glow, a soft shadow, a
 * vignette, a flame's halo), written as one gradient with a color and an opacity at each stop.
 *
 * The fades stage of the transparent-image path, after the gradient-band merge and the carve and
 * before the face split; the opaque path cannot see opacity and has no counterpart. In: the label
 * map, the per-label fills and inks from the band merge, the image over white and its alpha.
 * Out: the label map with each accepted fade relabeled as one new label, that label's fill
 * rewritten as the fade seen over white, and a {@link Fade} per label for the emitter.
 *
 * Color conventions: `s` is a straight (un-premultiplied) color, `a` an opacity,
 * `P = s·a = W − (1 − a)` the premultiplied color recovered from the pixel over white `W`. An
 * opacity profile is stored as an ordinary gray fill model whose every channel holds the
 * opacity. Models are in Trazor's frame (pixel `(i, j)` centered at `(i + ½, j + ½)`); a pixel's
 * model value is read at its center.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/native/fade.rs` (`Fade`, `rim_alpha`,
 * `over_white`, `model_stops`, `restop`, `solve`, `fit_colour_stops`, `fade_chi2`,
 * `alpha_params`, `fit_opacity`, `merge_fades`) and the face-opacity rule of
 * `inkvec-trace/src/native.rs` (`trace_color`).
 */
import { FillEval, PARAMS_FLAT, isGradient, withStops } from '../fill/model'
import type { FillFit, FillModel, Rgb, Stop } from '../fill/model'
import { toFittingFrame } from '../fill/samples'
import { fitPixels } from '../fill/select'
import type { Palette } from './palette'

const fr = Math.fround

/** An opacity at or above this is paint, not a fade. */
export const OPAQUE_BAND = 0.98

/** An opacity below this is the clear ground, not a wash. */
export const WASH_MIN_ALPHA = 0.05

/** Fewest pixels a cluster of washes needs to be judged as a fade. */
export const FADE_MIN_PIXELS = 16

/** Labels stay below this (inkvec's 16-bit label range): no fade is minted past it. */
export const FADE_LABEL_LIMIT = 65535

/** Half an 8-bit level: a model this close to a pixel pays nothing for it. */
const DEAD_ZONE = 0.5 / 255

/** Pixels fainter than this cannot steer a fade's color. */
const MIN_COLOR_ALPHA = 1e-3

const F_OPAQUE_BAND = fr(OPAQUE_BAND)
const F_WASH_MIN_ALPHA = fr(WASH_MIN_ALPHA)

/**
 * A face whose opacity varies across it, written as one gradient carrying a color and an
 * opacity at each stop.
 */
export interface Fade {
  /**
   * The color profile, straight (not composited over anything), on the geometry and at the
   * stop offsets of `alpha`. Most fades change color as they fade, so this is a profile.
   */
  readonly color: FillModel
  /** The opacity profile: a fill model whose every stop is a gray equal to the opacity there. */
  readonly alpha: FillModel
}

/** One stop of a model: its offset and color. */
export interface ModelStop {
  readonly offset: number
  readonly color: Rgb
}

/** A model's stops in order: one stop at 0 for a flat fill, else `c0` at 0, the interior stops, `c1` at 1. */
export function modelStops(m: FillModel): ModelStop[] {
  if (m.kind === 'flat') return [{ offset: 0, color: m.color }]
  return [
    { offset: 0, color: m.c0 },
    ...m.mids.map((s) => ({ offset: s.offset, color: s.color })),
    { offset: 1, color: m.c1 },
  ]
}

/** `m` with its stop colors replaced in order (one per stop of {@link modelStops}); offsets and geometry kept. */
export function restop(m: FillModel, cols: readonly Rgb[]): FillModel {
  if (m.kind === 'flat') return { kind: 'flat', color: cols[0] }
  const k = m.mids.length
  const mids: Stop[] = m.mids.map((s, i) => ({ offset: s.offset, color: cols[i + 1] }))
  return withStops(m, cols[0], mids, cols[k + 1])
}

/**
 * The lowest opacity a fade reaches, at its rim where it meets the ground: the minimum over the
 * opacity model's stops, capped at 1. Between stops the profile is linear, so the minimum is
 * at a stop.
 */
export function rimAlpha(fade: Fade): number {
  const m = fade.alpha
  let lo = 1
  if (m.kind === 'flat') return Math.min(lo, m.color[0])
  lo = Math.min(lo, m.c0[0], m.c1[0])
  for (const s of m.mids) lo = Math.min(lo, s.color[0])
  return lo
}

/**
 * The fade as a fill over white, which is how every other stage sees a face: per stop of the
 * opacity model, `W = s·a + (1 − a)` with `s` the color stop at the same index (the last one,
 * or white, when the color model has fewer). Exact at the stops; between two stops whose colors
 * differ, the true `s(t)·a(t) + 1 − a(t)` is quadratic in `t` and the stop-to-stop ramp is its
 * chord.
 */
export function fadeOverWhite(fade: Fade): FillModel {
  const aStops = modelStops(fade.alpha)
  const cStops = modelStops(fade.color)
  const cols: Rgb[] = aStops.map((st, i) => {
    const g = st.color[0]
    const a = g < 0 ? 0 : g > 1 ? 1 : g
    const s: Rgb =
      i < cStops.length
        ? cStops[i].color
        : cStops.length > 0
          ? cStops[cStops.length - 1].color
          : [1, 1, 1]
    return [
      fr(fr(fr(s[0] * a) + 1) - a),
      fr(fr(fr(s[1] * a) + 1) - a),
      fr(fr(fr(s[2] * a) + 1) - a),
    ]
  })
  return restop(fade.alpha, cols)
}

/**
 * Solve `a·x = b` (`a` is `n × n`, `b` three right-hand sides per row) by Gaussian elimination
 * with partial pivoting (the last of equal pivots), or null when a pivot is below `1e-12` in
 * absolute value. `a` and `b` are overwritten. `O(n³)`, for the handful of stops in a fade.
 */
export function solveStops(a: number[][], b: number[][]): number[][] | null {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let i = col + 1; i < n; i++) {
      if (Math.abs(a[i][col]) >= Math.abs(a[piv][col])) piv = i
    }
    if (Math.abs(a[piv][col]) < 1e-12) return null
    ;[a[col], a[piv]] = [a[piv], a[col]]
    ;[b[col], b[piv]] = [b[piv], b[col]]
    for (let row = col + 1; row < n; row++) {
      const f = a[row][col] / a[col][col]
      for (let k = col; k < n; k++) a[row][k] -= f * a[col][k]
      for (let c = 0; c < 3; c++) b[row][c] -= f * b[col][c]
    }
  }
  const x: number[][] = Array.from({ length: n }, () => [0, 0, 0])
  for (let row = n - 1; row >= 0; row--) {
    for (let c = 0; c < 3; c++) {
      let s = b[row][c]
      for (let k = row + 1; k < n; k++) s -= a[row][k] * x[k][c]
      x[row][c] = s / a[row][row]
    }
  }
  return x
}

/**
 * The color profile of a fade on the geometry and stops of its opacity profile `alphaModel` (a
 * gradient). With the geometry fixed every pixel has its gradient coordinate `t`, and the color
 * is piecewise linear in `t` between the stops, so the stop colors `S_j` minimize the linear
 * least squares
 *
 * `E(S) = Σ_p (a_p s(t_p) − P_p)² + ρ Σ_j |S_j − s̄|²`
 *
 * over the pixels `px` with `a_p ≥ 1e-3`, `P_p = W_p − (1 − a_p)`: weighted by `a²`, the
 * residual in premultiplied color, so a pixel too faint to see cannot steer the color. `s̄` is
 * the opacity-weighted mean straight color (white when no pixel counts) and the light ridge
 * `ρ = 1e-6 + 1e-3 · mean(diag)` holds a stop no pixel testifies about to it. The tridiagonal
 * normal equations are solved by {@link solveStops}; a singular system gives `s̄` at every stop.
 * Stops are clamped to `[0, 1]`. A flat `alphaModel` (one stop) gives `s̄`.
 */
export function fitColorStops(
  alphaModel: FillModel,
  px: ArrayLike<number>,
  rgb: Float32Array,
  alpha: Float32Array,
  w: number,
): FillModel {
  const offs = modelStops(alphaModel).map((s) => s.offset)
  const m = offs.length
  const a: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0))
  const b: number[][] = Array.from({ length: m }, () => [0, 0, 0])
  const mean = [0, 0, 0]
  let msum = 0
  // Moved by −½ into the fitting frame, where pixel `(x, y)`'s center is at its indices.
  const ev = new FillEval(toFittingFrame(alphaModel))
  for (let i = 0; i < px.length; i++) {
    const p = px[i]
    const ap = alpha[p]
    if (ap < MIN_COLOR_ALPHA) continue
    const pm0 = rgb[p * 3] - (1 - ap)
    const pm1 = rgb[p * 3 + 1] - (1 - ap)
    const pm2 = rgb[p * 3 + 2] - (1 - ap)
    mean[0] += pm0
    mean[1] += pm1
    mean[2] += pm2
    msum += ap
    if (m < 2) continue
    // s(t) = (1 − u)·S_j + u·S_{j+1}; the residual is a·s(t) − P, so the design row is a·basis.
    const x = p % w
    const t = ev.tAt(x, (p - x) / w)
    let j = 0
    for (let k = m - 2; k >= 0; k--) {
      if (t >= offs[k]) {
        j = k
        break
      }
    }
    const span = Math.max(offs[j + 1] - offs[j], 1e-9)
    const u = Math.min(1, Math.max(0, (t - offs[j]) / span))
    const r0 = ap * (1 - u)
    const r1 = ap * u
    a[j][j] += r0 * r0
    a[j][j + 1] += r0 * r1
    a[j + 1][j] += r0 * r1
    a[j + 1][j + 1] += r1 * r1
    b[j][0] += r0 * pm0
    b[j][1] += r0 * pm1
    b[j][2] += r0 * pm2
    b[j + 1][0] += r1 * pm0
    b[j + 1][1] += r1 * pm1
    b[j + 1][2] += r1 * pm2
  }
  const sBar = msum > 1e-9 ? [mean[0] / msum, mean[1] / msum, mean[2] / msum] : [1, 1, 1]
  let diag = 0
  for (let i = 0; i < m; i++) diag += a[i][i]
  const ridge = 1e-6 + (1e-3 * diag) / m
  for (let i = 0; i < m; i++) {
    a[i][i] += ridge
    for (let k = 0; k < 3; k++) b[i][k] += ridge * sBar[k]
  }
  const x = (m < 2 ? null : solveStops(a, b)) ?? Array.from({ length: m }, () => sBar)
  const cols: Rgb[] = x.map((c) => [fr(clamp01(c[0])), fr(clamp01(c[1])), fr(clamp01(c[2]))])
  return restop(alphaModel, cols)
}

/**
 * Chi-square of a model of a region's pixels, opacity and premultiplied color each beyond the
 * half-level dead zone: `χ² = Σ_p [ρ(a_p − â_p) + Σ_c ρ(P_{p,c} − ŝ_c â_p)]` with
 * `ρ(e) = (max(|e| − 0.5/255, 0) / σ)²` and `P = W − (1 − a)`. `model(p, s)` writes the
 * modeled straight color of pixel `p` to `s` and returns its modeled opacity `â`. `sigma` is the
 * per-channel noise.
 */
export function fadeChi2(
  px: ArrayLike<number>,
  rgb: Float32Array,
  alpha: Float32Array,
  sigma: number,
  model: (p: number, s: Float64Array) => number,
): number {
  const rho = (e: number): number => {
    const v = Math.max(Math.abs(e) - DEAD_ZONE, 0) / sigma
    return v * v
  }
  const s = new Float64Array(3)
  let total = 0
  for (let i = 0; i < px.length; i++) {
    const p = px[i]
    const am = model(p, s)
    const ap = alpha[p]
    let c2 = rho(ap - am)
    for (let k = 0; k < 3; k++) {
      const pm = rgb[p * 3 + k] - (1 - ap)
      c2 += rho(pm - s[k] * am)
    }
    total += c2
  }
  return total
}

/**
 * Editable numbers in an opacity profile: the geometry, and one number per stop where a color
 * stop has three. Flat: 1. Linear: 4 + 2 + 2 per interior stop. Radial: 3 for a circle or 5
 * for an ellipse, + 2 + 2 per interior stop.
 */
export function alphaParams(m: FillModel): number {
  if (m.kind === 'flat') return 1
  if (m.kind === 'linear') return 4 + 2 + 2 * m.mids.length
  return (m.aspect === 1 ? 3 : 5) + 2 + 2 * m.mids.length
}

/**
 * An opacity profile fitted by the ordinary fill fitter on the alpha as a gray image (`gray`,
 * the alpha in three channels): the cheapest of the fitter's candidates for `pixels` (members
 * `member`) by `cost = ½ χ²/3 + λ·alphaParams`, the evidence counted once and each stop priced
 * at one number. Only flat fills and encoded-sRGB gradients qualify (stop opacity interpolates
 * linearly in opacity), and only flat fills with `flatOnly`; ties go to the earlier candidate.
 * With no candidate it returns an opacity of 1 at infinite cost.
 */
export function fitOpacity(
  gray: Float32Array,
  w: number,
  h: number,
  pixels: ArrayLike<number>,
  member: (p: number) => boolean,
  sigma: number,
  lambda: number,
  flatOnly: boolean,
): { model: FillModel; cost: number } {
  let best: { model: FillModel; cost: number } | null = null
  for (const f of fitPixels(gray, w, h, pixels, member, null, sigma, lambda)) {
    const keep = f.model.kind === 'flat' || (!flatOnly && f.model.interp === 'srgb')
    if (!keep) continue
    const cost = (0.5 * f.chi2) / 3 + lambda * alphaParams(f.model)
    if (best === null || cost < best.cost) best = { model: f.model, cost }
  }
  return best ?? { model: { kind: 'flat', color: [1, 1, 1] }, cost: Infinity }
}

/** The pixels' straight color `Σ P / Σ a` of a label's sums, clamped, or null when it has no opacity to divide by. */
function colorOf(sums: Float64Array, l: number): Rgb | null {
  const sa = sums[l * 4 + 3]
  if (!(sa > 1e-6)) return null
  return [
    fr(clamp01(sums[l * 4] / sa)),
    fr(clamp01(sums[l * 4 + 1] / sa)),
    fr(clamp01(sums[l * 4 + 2] / sa)),
  ]
}

/** A flat fill assigned rather than fitted: chi² 0, cost 0. */
function flatFill(color: Rgb): FillFit {
  return { model: { kind: 'flat', color }, chi2: 0, params: PARAMS_FLAT, cost: 0 }
}

/** The palette color of label `l` (white past the palette). */
function paletteColor(palette: Palette, l: number): Rgb {
  if (l >= palette.count) return [1, 1, 1]
  return [palette.inkRgb[l * 3], palette.inkRgb[l * 3 + 1], palette.inkRgb[l * 3 + 2]]
}

/**
 * Turn each connected run of translucent regions into one fade where one opacity profile and
 * one color profile on it cost less than the separate washes.
 *
 * The palette finds a fade as bands, one ink per opacity level, and the color merge cannot join
 * them: over white a white glow is white everywhere, and the difference is all in the alpha.
 *
 * 1. Every label's straight color `s = Σ(W − (1 − a)) / Σ a` over its pixels (exact whatever the
 *    opacities: every pixel of `s` at `a` is `W − (1 − a) = s·a`).
 * 2. *Washes*: labels whose ink has an opacity in `[0.05, 0.98)` and a defined color.
 * 3. *Clusters*: 4-connected components of wash pixels, whatever their colors, numbered in
 *    raster order.
 * 4. Each cluster of at least {@link FADE_MIN_PIXELS} pixels (while labels below
 *    {@link FADE_LABEL_LIMIT} remain): the opacity geometry from the alpha alone
 *    ({@link fitOpacity}); a flat fit ends it. Otherwise the color stops on that geometry
 *    ({@link fitColorStops}), priced `union = ½ χ²_fade + λ (alphaParams + 3 · stops)` against
 *    `separate = Σ_bands (½ χ²_band + 4λ)`, each band one color (step 1) at one opacity (the
 *    median of its pixels'). A cheaper union becomes a fresh label covering the whole cluster,
 *    with fill {@link fadeOverWhite}, the first band's ink, and its {@link Fade}.
 * 5. Washes that stay washes get the fill `s·a + (1 − a)` at their ink's opacity, so that the
 *    emitter's un-matting by `a` recovers `s` exactly.
 *
 * `labels`, `fills` (one per label id) and `labelInk` (the palette entry of each label) are
 * edited in place and padded as new ids are minted: flat palette colors (white past the
 * palette, chi² 0) and identity inks. `rgb` is the image over white, `alpha` the straight alpha,
 * `sigma` the per-channel noise, `lambda` the price of one number. Returns, per label id (new
 * ids included), the fade that label is, or null.
 */
export function mergeFades(
  labels: Int32Array,
  fills: FillFit[],
  labelInk: number[],
  rgb: Float32Array,
  alpha: Float32Array,
  w: number,
  h: number,
  palette: Palette,
  sigma: number,
  lambda: number,
): (Fade | null)[] {
  const n = w * h
  let nLabels = Math.max(fills.length, labelInk.length, palette.count)
  for (let p = 0; p < n; p++) if (labels[p] + 1 > nLabels) nLabels = labels[p] + 1
  const inkOf = (l: number): number => (l < labelInk.length ? labelInk[l] : l)
  const inkAlpha = (l: number): number => {
    const i = inkOf(l)
    return i >= 0 && i < palette.alpha.length ? palette.alpha[i] : 1
  }

  // 1. Each label's premultiplied color and opacity sums.
  const sums = new Float64Array(nLabels * 4)
  for (let p = 0; p < n; p++) {
    const a = alpha[p]
    const back = fr(1 - a)
    const o = labels[p] * 4
    sums[o] += fr(rgb[p * 3] - back)
    sums[o + 1] += fr(rgb[p * 3 + 1] - back)
    sums[o + 2] += fr(rgb[p * 3 + 2] - back)
    sums[o + 3] += a
  }

  // 2. The washes: every translucent label, whatever fill the color merge gave it.
  const wash = new Uint8Array(nLabels)
  let anyWash = false
  for (let l = 0; l < nLabels; l++) {
    const a = inkAlpha(l)
    if (a >= F_WASH_MIN_ALPHA && a < F_OPAQUE_BAND && colorOf(sums, l) !== null) {
      wash[l] = 1
      anyWash = true
    }
  }
  const fadeOf: (Fade | null)[] = new Array<Fade | null>(nLabels).fill(null)
  if (!anyWash) return fadeOf

  // 3. Connected clusters of wash pixels; color does not split them.
  const cluster = new Int32Array(n).fill(-1)
  const clusters: Int32Array[] = []
  const stack = new Int32Array(n)
  const found = new Int32Array(n)
  let top = 0
  const visit = (q: number, id: number): void => {
    if (cluster[q] === -1 && wash[labels[q]] === 1) {
      cluster[q] = id
      stack[top++] = q
    }
  }
  for (let start = 0; start < n; start++) {
    if (wash[labels[start]] === 0 || cluster[start] !== -1) continue
    const id = clusters.length
    let len = 0
    top = 0
    stack[top++] = start
    cluster[start] = id
    while (top > 0) {
      const p = stack[--top]
      found[len++] = p
      const x = p % w
      if (x > 0) visit(p - 1, id)
      if (x + 1 < w) visit(p + 1, id)
      if (p >= w) visit(p - w, id)
      if (p + w < n) visit(p + w, id)
    }
    clusters.push(found.subarray(0, len).toSorted())
  }

  // 4. Each cluster priced as one fade against its separate washes.
  const gray = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) {
    gray[p * 3] = alpha[p]
    gray[p * 3 + 1] = alpha[p]
    gray[p * 3 + 2] = alpha[p]
  }
  const pred = new Float64Array(3)
  let next = nLabels
  for (let cid = 0; cid < clusters.length; cid++) {
    const px = clusters[cid]
    if (px.length < FADE_MIN_PIXELS || next >= FADE_LABEL_LIMIT) continue
    const bands = Array.from(new Set(Array.from(px, (p) => labels[p]))).toSorted((x, y) => x - y)
    // The geometry comes from the opacity, which is what a fade is.
    const { model: alphaModel } = fitOpacity(
      gray,
      w,
      h,
      px,
      (p) => cluster[p] === cid,
      sigma,
      lambda,
      false,
    )
    if (!isGradient(alphaModel)) continue
    const colorModel = fitColorStops(alphaModel, px, rgb, alpha, w)
    const nStops = modelStops(alphaModel).length
    // Both profiles read at each pixel's center (its indices in the fitting frame).
    const colorEval = new FillEval(toFittingFrame(colorModel))
    const alphaEval = new FillEval(toFittingFrame(alphaModel))
    const unionChi2 = fadeChi2(px, rgb, alpha, sigma, (p, s) => {
      const x = p % w
      const y = (p - x) / w
      colorEval.colorAt(x, y, s, 0)
      alphaEval.colorAt(x, y, pred, 0)
      return pred[0]
    })
    const union = 0.5 * unionChi2 + lambda * (alphaParams(alphaModel) + 3 * nStops)
    // The separate washes: each band one opacity and one color of its own.
    let separate = 0
    for (const band of bands) {
      const s = colorOf(sums, band)
      if (s === null) continue
      const bp = px.filter((p) => labels[p] === band)
      const av = new Float32Array(bp.length)
      for (let i = 0; i < bp.length; i++) av[i] = alpha[bp[i]]
      const aBand = av.toSorted()[bp.length >> 1]
      const bandChi2 = fadeChi2(bp, rgb, alpha, sigma, (_p, out) => {
        out[0] = s[0]
        out[1] = s[1]
        out[2] = s[2]
        return aBand
      })
      separate += 0.5 * bandChi2 + lambda * 4
    }
    if (union >= separate) continue
    const fade: Fade = { color: colorModel, alpha: alphaModel }
    const id = next++
    const firstInk = inkOf(bands[0])
    for (let i = 0; i < px.length; i++) labels[px[i]] = id
    // Any label without a fill of its own falls back to its palette color; padding says the same.
    while (fills.length <= id) fills.push(flatFill(paletteColor(palette, fills.length)))
    fills[id] = {
      model: fadeOverWhite(fade),
      chi2: unionChi2,
      params: alphaParams(alphaModel) + 3 * nStops,
      cost: union,
    }
    while (labelInk.length <= id) labelInk.push(labelInk.length)
    labelInk[id] = firstInk
    while (fadeOf.length <= id) fadeOf.push(null)
    fadeOf[id] = fade
  }

  // 5. The washes that stay washes: their color over white at their ink's opacity.
  const present = new Uint8Array(next)
  for (let p = 0; p < n; p++) present[labels[p]] = 1
  for (let l = 0; l < nLabels; l++) {
    if (wash[l] === 0 || present[l] === 0) continue
    const s = colorOf(sums, l)
    const i = inkOf(l)
    if (s === null || i < 0 || i >= palette.alpha.length) continue
    const a = palette.alpha[i]
    while (fills.length <= l) fills.push(flatFill(paletteColor(palette, fills.length)))
    fills[l] = {
      ...fills[l],
      model: {
        kind: 'flat',
        color: [
          fr(fr(fr(s[0] * a) + 1) - a),
          fr(fr(fr(s[1] * a) + 1) - a),
          fr(fr(fr(s[2] * a) + 1) - a),
        ],
      },
    }
  }
  return fadeOf
}

/**
 * The opacity at which a face meets the ground, which places its boundary there: a fade's
 * rim ({@link rimAlpha}), else the opacity of its ink (1 for an ink without one).
 */
export function faceOpacity(fade: Fade | null, palette: Palette, ink: number): number {
  if (fade !== null) return rimAlpha(fade)
  return ink >= 0 && ink < palette.alpha.length ? palette.alpha[ink] : 1
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
