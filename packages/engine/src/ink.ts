/**
 * The planar chain's ink front end: inkvec's (ported in `@trazor/raster`'s
 * `ink`), in inkvec's order — the pixel noise, the image's inks chosen by
 * description length, each pixel labelled with its nearest ink, the noise
 * raised to the labels' residual on a soft intake, then speckles folded into
 * their commonest neighbour and anti-aliased blend slivers and pixels handed
 * back to the inks they blend. Then each region's fill: with gradients the
 * bands of one ramp merged into one gradient region; the features a fill
 * swallowed carved back out; each region's color its own pixels', and near-equal
 * flat colors of one ink snapped to one. Each label is one paint (a flat color,
 * or a gradient).
 *
 * A transparent raster runs the same stages over two grounds
 * (`nativeInkFrontEnd`): an ink is a color and an opacity and the clear ground
 * is an ink, the band merge never joins inks of different opacity, carved paint
 * is named by a visible ink, and a glow or a soft shadow becomes one fade (a
 * gradient whose stops carry opacities). A label of the clear ink is
 * transparent (−1); a wash paints its straight color at its opacity.
 */
import type { GradientPaint, LabelMap, RasterImage } from '@trazor/core'
import { estimateNoise, hexToRgb, rgbToHex } from '@trazor/core'
import { ink } from '@trazor/raster'

/** What the ink front end hands the planar chain. */
export interface InkFrontEnd {
  /** One ink per label, every label in use. */
  labels: LabelMap
  paletteHex: string[]
  /** Encoded sRGB bytes, three per label. */
  paletteRgb: Uint8Array
  counts: Uint32Array
  /** The pixel noise the geometry divides by, per channel, in encoded sRGB units. */
  sigmaNoise: number
  /** Per label, its gradient (null: flat); absent without gradients. */
  gradients?: (GradientPaint | null)[]
  /**
   * Per label, the opacity a translucent flat label paints at (undefined:
   * opaque), and the straight color it paints; both absent when every flat
   * label is opaque. `paletteHex` keeps each label's color over white.
   */
  fillOpacity?: (number | undefined)[]
  inkHex?: (string | undefined)[]
}

/**
 * Whether a raster is a soft intake (inkvec `lib.rs`): its edges wider than a
 * native render's, compression ringing, or a lossy container (unknown here, so
 * not counted). Read on the raster as it arrives, before any enlargement.
 */
export function intakeIsSoft(image: RasterImage): boolean {
  const { rgb } = ink.intakePixels(image)
  return ink.intakeEvidence(rgb, image.width, image.height, false).soft
}

/**
 * The pixel noise of a soft intake, per channel in encoded sRGB units: the
 * Laplacian estimate raised to the residual against the labels (capped at 8
 * levels), as inkvec measures it once there are labels — the estimate reads a
 * recompressed poster's flats as clean while its edges carry 5–8 levels of
 * damage. `paletteRgb` holds each label's color as bytes; a transparent pixel
 * (label −1) is read against white, the ground it was composited over.
 */
export function softNoise(image: RasterImage, labels: LabelMap, paletteRgb: Uint8Array): number {
  const { width: w, height: h, data } = image
  const n = w * h
  const count = paletteRgb.length / 3
  const rgb = new Float32Array(n * 3)
  const lum = new Float32Array(n)
  const lab = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const r = Math.fround(data[4 * i] / 255)
    const g = Math.fround(data[4 * i + 1] / 255)
    const b = Math.fround(data[4 * i + 2] / 255)
    rgb[3 * i] = r
    rgb[3 * i + 1] = g
    rgb[3 * i + 2] = b
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const l = labels.data[i]
    lab[i] = l >= 0 && l < count ? l : count
  }
  const inks = new Float64Array((count + 1) * 3).fill(1)
  for (let k = 0; k < count * 3; k++) inks[k] = paletteRgb[k] / 255
  const measured = Math.min(
    ink.residualSigma(rgb, lab, w, h, inks) * ink.MEASURED_SIGMA_SCALE,
    ink.MEASURED_SIGMA_CAP / 255,
  )
  return Math.max(estimateNoise(lum, w, h), measured)
}

/** Smallest region kept as itself, in source pixels (inkvec's `min_region`). */
const MIN_REGION = 2

/** Each label's fill, the palette entry it came from, and its fade (transparent rasters). */
interface LabelFills {
  models: ink.FillModel[]
  inks: number[]
  fades: (ink.Fade | null)[]
}

/** The transparent raster a fill stage reads: its alpha and the merge's opacity gate. */
interface TwoGround {
  alpha: Float32Array
  sameClass: (a: number, b: number) => boolean
}

/**
 * Each label's fill after the band merge and the carve, in inkvec's order:
 * the merge rewrites `labels` (a gradient region, or a flat region with an
 * interior of its own, gets a fresh label past the palette), the carve cuts
 * swallowed features out as further labels, and every flat face whose color is
 * within sight of its ink's best-evidenced face is painted that face's color
 * (`snapFlatFills`, over the 4-connected faces). Every face of a label carries
 * the label's fill and ink, so a snap decides for the whole label. The price of
 * a parameter is the BIC's over the working image's pixels. Without
 * `gradients` every fill is flat and nothing merges, but each region still
 * takes its color from its own pixels and the carve still runs: the palette
 * names a region's ink, it does not color it (a dark gray handle labelled with
 * the nearest ink in OKLab, a blue, is still painted its own gray). On a
 * transparent raster (`two`) the merge keeps inks of different opacity apart,
 * carved paint is renamed from the clear ink to a visible one, and (with
 * gradients) the fades are fitted; a fade keeps its fill through the snap.
 */
function labelFills(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  pal: ink.Palette,
  sigma: number,
  minRegion: number,
  gradients: boolean,
  two: TwoGround | null,
): LabelFills {
  const lambda = ink.bicLambda(w * h)
  const { fills, ink: labelInk } = ink.mergeGradientBands(
    labels,
    rgb,
    w,
    h,
    pal.inkRgb,
    sigma,
    lambda,
    { gradients, sameClass: two?.sameClass ?? null },
  )
  const from = fills.length
  ink.carveResidualFeatures(
    labels,
    rgb,
    w,
    h,
    pal.inkRgb,
    fills,
    labelInk,
    sigma,
    lambda,
    Math.max(minRegion, 2),
    null,
    gradients,
  )
  let fades: (ink.Fade | null)[] = []
  if (two !== null) {
    ink.nameCarvedPaint(labels, rgb, two.alpha, pal, labelInk, from)
    if (gradients) {
      fades = ink.mergeFades(labels, fills, labelInk, rgb, two.alpha, w, h, pal, sigma, lambda)
    }
  }
  const { faces, faceLabel, count } = ink.splitComponents(labels, w, h)
  const faceFill: ink.FillFit[] = []
  const faceInk: number[] = []
  for (let f = 0; f < count; f++) {
    const l = faceLabel[f]
    faceFill.push(fills[l] ?? flatFit(pal, l, two !== null))
    faceInk.push(labelInk[l] ?? l)
  }
  ink.snapFlatFills(
    faces,
    w,
    h,
    faceFill,
    faceInk,
    pal,
    (f) => (fades[faceLabel[f]] ?? null) !== null,
  )
  const models: ink.FillModel[] = fills.map((f) => f.model)
  for (let f = 0; f < count; f++) models[faceLabel[f]] = faceFill[f].model
  const inks: number[] = []
  for (let l = 0; l < models.length; l++) inks.push(labelInk[l] ?? l)
  return { models, inks, fades }
}

/** A label's flat palette color as a fill (past the palette black, or white over two grounds). */
function flatFit(pal: ink.Palette, l: number, twoGround: boolean): ink.FillFit {
  const k = l < pal.count ? 3 * l : -1
  const past = twoGround ? 1 : 0
  const color: [number, number, number] =
    k >= 0 ? [pal.inkRgb[k], pal.inkRgb[k + 1], pal.inkRgb[k + 2]] : [past, past, past]
  return { model: { kind: 'flat', color }, chi2: 0, params: 3, cost: 0 }
}

/** A `#rrggbb` color in [0, 1] (black when unreadable). */
function rgb01(hex: string): [number, number, number] {
  const c = hexToRgb(hex) ?? [0, 0, 0]
  return [c[0] / 255, c[1] / 255, c[2] / 255]
}

/** A channel in [0, 1] as a byte. */
function byteOf(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

/** A color in [0, 1] as bytes. */
function bytesOf(c: ArrayLike<number>): [number, number, number] {
  return [byteOf(c[0]), byteOf(c[1]), byteOf(c[2])]
}

/** The straight color a wash of opacity `a` paints, from its color over white `w`: `(w − 1 + a) / a`. */
function unmatte(w: ArrayLike<number>, a: number): [number, number, number] {
  return [0, 1, 2].map((k) => Math.min(1, Math.max(0, (w[k] - 1 + a) / a))) as [
    number,
    number,
    number,
  ]
}

/**
 * The labels renumbered densely by paint, in label order: one label per
 * gradient or fade, one per distinct flat color (at one opacity); a label of
 * the clear ink (two grounds) is transparent, −1. A translucent label's
 * gradient carries its opacity on every stop, a flat one its opacity and
 * straight color beside its color over white.
 */
function paintLabels(
  raw: Int32Array,
  w: number,
  h: number,
  pal: ink.Palette,
  lf: LabelFills,
  sigma: number,
  gradients: boolean,
  twoGround: boolean,
): InkFrontEnd {
  const n = w * h
  let labelCount = Math.max(pal.count, lf.models.length)
  for (let i = 0; i < n; i++) if (raw[i] + 1 > labelCount) labelCount = raw[i] + 1
  const used = new Uint32Array(labelCount)
  for (let i = 0; i < n; i++) used[raw[i]]++
  const remap = new Int32Array(labelCount).fill(-1)
  const flatOf = new Map<string, number>()
  const paletteHex: string[] = []
  const bytes: number[] = []
  const counts: number[] = []
  const paints: (GradientPaint | null)[] = []
  const opacity: (number | undefined)[] = []
  const straight: (string | undefined)[] = []
  let translucent = false
  for (let l = 0; l < labelCount; l++) {
    if (used[l] === 0) continue
    const model = lf.models[l] ?? flatFit(pal, l, twoGround).model
    const k = lf.inks[l] ?? l
    const fade = lf.fades[l] ?? null
    const inkAlpha = k >= 0 && k < pal.alpha.length ? pal.alpha[k] : 1
    if (fade === null && twoGround && inkAlpha <= ink.CLEAR_INK_ALPHA) continue
    let paint: GradientPaint | null
    let a = 1
    let flat: [number, number, number] | null = null
    if (fade !== null) {
      paint = ink.fadeToPaint(fade.alpha, fade.color)
      if (paint === null) {
        a = Math.min(1, Math.max(0, ink.representative(fade.alpha)[0]))
        flat = [...ink.representative(fade.color)] as [number, number, number]
      }
    } else {
      a = inkAlpha >= ink.OPAQUE ? 1 : inkAlpha
      paint = ink.fillToPaint(model)
      if (paint !== null && a < 1) {
        // A translucent gradient: each stop's straight color at the ink's opacity.
        paint = {
          ...paint,
          stops: paint.stops.map((st) => {
            const c = unmatte(rgb01(st.color), a)
            return { ...st, color: ink.toHex(c), opacity: Math.round(a * 1000) / 1000 }
          }),
        }
      }
      if (paint === null && a < 1) flat = unmatte(ink.representative(model), a)
    }
    const c = bytesOf(ink.representative(model))
    const hex = rgbToHex(c[0], c[1], c[2])
    const key = paint === null ? `${hex}|${a}` : null
    const same = key !== null ? flatOf.get(key) : undefined
    if (same !== undefined) {
      remap[l] = same
      counts[same] += used[l]
      continue
    }
    remap[l] = paletteHex.length
    if (key !== null) flatOf.set(key, paletteHex.length)
    paletteHex.push(hex)
    bytes.push(c[0], c[1], c[2])
    counts.push(used[l])
    paints.push(paint)
    const wash = paint === null && a < 1
    if (wash) translucent = true
    opacity.push(wash ? Math.round(a * 1000) / 1000 : undefined)
    const s = wash && flat !== null ? bytesOf(flat) : null
    straight.push(s !== null ? rgbToHex(s[0], s[1], s[2]) : undefined)
  }
  const out = new Int32Array(n)
  for (let i = 0; i < n; i++) out[i] = remap[raw[i]]
  return {
    labels: { width: w, height: h, data: out, count: paletteHex.length },
    paletteHex,
    paletteRgb: Uint8Array.from(bytes),
    counts: Uint32Array.from(counts),
    sigmaNoise: sigma,
    gradients: gradients ? paints : undefined,
    ...(translucent ? { fillOpacity: opacity, inkHex: straight } : {}),
  }
}

/**
 * The ink front end of an opaque working image (already over white) traced
 * `scale` working pixels per source pixel; `soft` is the intake's verdict
 * (wide edges, ringing, a lossy container), which loosens the palette's guards
 * and lets the noise rise to the residual against the labels; `gradients` lets
 * a region take a gradient (and the bands of one ramp merge into one).
 */
export function inkFrontEnd(
  image: RasterImage,
  scale: number,
  soft: boolean,
  gradients: boolean,
): InkFrontEnd {
  const { width: w, height: h } = image
  const n = w * h
  const { rgb, lum } = overWhite(image)
  let sigma = estimateNoise(lum, w, h)
  const ids = ink.colorIdsOfRgb(rgb)
  const pal = ink.extractPaletteMdl(
    rgb,
    w,
    h,
    ink.DEFAULT_MERGE_DISTANCE,
    ink.DEFAULT_MAX_COLORS,
    ink.paletteEvidence(sigma, n, soft),
    ids,
  )
  const raw = ink.labelImage(rgb, pal, ids)
  if (soft) {
    const measured = Math.min(
      ink.residualSigma(rgb, raw, w, h, pal.inkRgb) * ink.MEASURED_SIGMA_SCALE,
      ink.MEASURED_SIGMA_CAP / 255,
    )
    sigma = Math.max(sigma, measured)
  }
  const minRegion = MIN_REGION * scale * scale
  ink.despeckle(raw, w, h, minRegion)
  const absorbed = ink.absorbBlendSlivers(raw, rgb, null, w, h, pal.inkRgb, sigma)
  const moved = ink.reassignBlendPixels(raw, rgb, null, w, h, pal.inkRgb, sigma)
  if (absorbed > 0 || moved > 0) ink.despeckle(raw, w, h, minRegion)
  if (ink.findComponents(raw, w, h).count > ink.MAX_FACES)
    ink.capComponents(raw, w, h, ink.MAX_FACES)
  const lf = labelFills(raw, rgb, w, h, pal, sigma, minRegion, gradients, null)
  return paintLabels(raw, w, h, pal, lf, sigma, gradients, false)
}

/**
 * The ink front end of a transparent working image: `image` composited over
 * white and `alpha` its straight alpha (bytes), traced `scale` working pixels
 * per source pixel, over two grounds (inkvec `native.rs`).
 */
export function nativeInkFrontEnd(
  image: RasterImage,
  alpha: Uint8Array,
  scale: number,
  soft: boolean,
  gradients: boolean,
): InkFrontEnd {
  const { width: w, height: h } = image
  const n = w * h
  const { rgb, lum } = overWhite(image)
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.fround(alpha[i] / 255)
  const minRegion = MIN_REGION * scale * scale
  const fe = ink.nativeFrontEnd(
    rgb,
    a,
    w,
    h,
    { sigmaNoise: estimateNoise(lum, w, h), soft },
    { minRegion },
  )
  const raw = fe.labels
  if (ink.findComponents(raw, w, h).count > ink.MAX_FACES)
    ink.capComponents(raw, w, h, ink.MAX_FACES)
  const lf = labelFills(raw, rgb, w, h, fe.palette, fe.sigmaNoise, minRegion, gradients, {
    alpha: a,
    sameClass: fe.sameClass,
  })
  return paintLabels(raw, w, h, fe.palette, lf, fe.sigmaNoise, gradients, true)
}

/** The image's pixels as encoded sRGB in single precision, and their luma. */
function overWhite(image: RasterImage): { rgb: Float32Array; lum: Float32Array } {
  const { width: w, height: h, data } = image
  const n = w * h
  const rgb = new Float32Array(n * 3)
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = Math.fround(data[4 * i] / 255)
    const g = Math.fround(data[4 * i + 1] / 255)
    const b = Math.fround(data[4 * i + 2] / 255)
    rgb[3 * i] = r
    rgb[3 * i + 1] = g
    rgb[3 * i + 2] = b
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return { rgb, lum }
}
