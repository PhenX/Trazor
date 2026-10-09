/**
 * Fill models of the raster front end: one region's paint as a flat color, a
 * linear gradient or a radial gradient (circular or elliptical), each with up to
 * two interior stops, interpolated in encoded sRGB or in linear light, and its
 * evaluation at a point.
 *
 * Coordinates are Trazor's: pixel `(i, j)` covers `[i, i+1] × [j, j+1]` and its
 * center is `(i + ½, j + ½)`. inkvec puts that center at `(i, j)`; every position
 * in a fill model the fitters return is inkvec's plus ½ in both axes (they fit in
 * inkvec's frame and move the result, see `samples.ts`).
 *
 * Single precision: inkvec keeps stop colors as `f32` and evaluates a fill's
 * prediction in `f32` (the sRGB transfer curves, the sRGB lerp and the stored
 * result). Model selection compares residuals against a half-LSB dead zone and
 * the geometric searches compare residuals to 1e-12, so these helpers keep that
 * arithmetic (`Math.fround` after each `f32` operation): the predictions, and
 * every decision made on them, are inkvec's to the bit. Colors are plain numbers
 * whose values are single-precision.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient.rs` (`Interp`, `FillModel`,
 * `FillFit`, the `PARAMS_*` constants, `params`, `kind`, `is_gradient`, `color_at`,
 * `representative`, `to_lin`, `to_srgb`, `from_space`, `lerp_stops`, `eval_stops`,
 * `linear_t`, `radial_t`, `flat_only`, `unmix_pair`), `gradient/eval.rs` (`FillEval`,
 * `radial_t_rot`, `lerp_lin`, `segment`) and `gradient/stops.rs` (`t_at`,
 * `with_stops`), and `color.rs` (`srgb_to_linear`, `linear_to_srgb`).
 */

/** An encoded sRGB color, components in `[0, 1]` (single-precision values). */
export type Rgb = readonly [number, number, number]

/** A position in pixel coordinates (pixel `(i, j)` centered at `(i + ½, j + ½)`). */
export type Point = readonly [number, number]

/**
 * The space a gradient interpolates its stops in: `linearRgb` (physical
 * compositing, SVG `color-interpolation="linearRGB"`) or `srgb` (SVG's default).
 * The two differ visibly across a wide ramp, so the space is a model parameter.
 */
export type Interp = 'linearRgb' | 'srgb'

/** Both interpolation spaces, in the order candidates are fitted (ties go to the first). */
export const INTERPS: readonly Interp[] = ['linearRgb', 'srgb']

/** An interior stop: `offset` in `(0, 1)` and its color. */
export interface Stop {
  readonly offset: number
  readonly color: Rgb
}

/** One color everywhere. */
export interface FlatFill {
  readonly kind: 'flat'
  readonly color: Rgb
}

/**
 * `c0` at `p0`, `c1` at `p1`, interior stops `mids` (offsets ascending) between,
 * piecewise linear in `interp` along the axis and padded beyond it.
 */
export interface LinearFill {
  readonly kind: 'linear'
  readonly p0: Point
  readonly p1: Point
  readonly c0: Rgb
  readonly c1: Rgb
  readonly interp: Interp
  readonly mids: readonly Stop[]
}

/**
 * `c0` at the center `c`, `c1` on the ellipse of semi-axis `r` along the
 * direction `angle` (radians, from +x towards +y) and `r / aspect` across it,
 * padded beyond. `aspect === 1` is the circular gradient; the elliptical fitters
 * produce aspects in `[1.02, 8]`.
 */
export interface RadialFill {
  readonly kind: 'radial'
  readonly c: Point
  readonly r: number
  readonly c0: Rgb
  readonly c1: Rgb
  readonly interp: Interp
  readonly aspect: number
  readonly angle: number
  readonly mids: readonly Stop[]
}

/** The fill model chosen for one region. */
export type FillModel = FlatFill | LinearFill | RadialFill

/** A gradient fill model. */
export type GradientFill = LinearFill | RadialFill

/** A fitted model with the numbers its selection was made on. */
export interface FillFit {
  readonly model: FillModel
  /**
   * `Σ (residual / σ)²` over the scored samples and channels, residual in sRGB
   * beyond the half-LSB dead zone, scaled to the full sample count.
   */
  readonly chi2: number
  /** Description length in editable numbers ({@link fillParams}). */
  readonly params: number
  /** `0.5·chi2 + λ·params`. */
  readonly cost: number
}

/** Description length of a flat fill, in editable numbers: one color. */
export const PARAMS_FLAT = 3
/** A linear gradient: two axis points and two stop colors. */
export const PARAMS_LINEAR = 10
/** A circular radial gradient: center, radius and two stop colors. */
export const PARAMS_RADIAL = 9
/** An elliptical radial gradient: the circular one plus an aspect and an angle. */
export const PARAMS_RADIAL_ELLIPTIC = 11
/** Each interior stop: an offset and a color. */
export const PARAMS_STOP = 4
/**
 * Most interior stops a gradient is given. Of the 79 multi-stop gradients in
 * inkvec's corpus 58 have one interior stop and 8 have two.
 */
export const MAX_MID_STOPS = 2
/** Fewer samples than this and a gradient cannot be told from noise. */
export const MIN_GRADIENT_PIXELS = 16

const fr = Math.fround
const F_SRGB_KNEE = fr(0.04045)
const F_LIN_KNEE = fr(0.0031308)
const F_12_92 = fr(12.92)
const F_0_055 = fr(0.055)
const F_1_055 = fr(1.055)
const F_GAMMA = fr(2.4)
const F_INV_GAMMA = fr(1 / F_GAMMA)

/**
 * The sRGB decoding curve in single precision (IEC 61966-2-1): `c / 12.92` up to
 * 0.04045, `((c + 0.055) / 1.055)^2.4` above. Not clamped.
 */
export function srgbToLinear32(c: number): number {
  return c <= F_SRGB_KNEE ? fr(c / F_12_92) : fr(Math.pow(fr(fr(c + F_0_055) / F_1_055), F_GAMMA))
}

/**
 * The sRGB encoding curve in single precision, inverse of
 * {@link srgbToLinear32}: `12.92·c` up to 0.0031308, `1.055·c^(1/2.4) − 0.055`
 * above. Not clamped.
 */
export function linearToSrgb32(c: number): number {
  return c <= F_LIN_KNEE
    ? fr(c * F_12_92)
    : fr(fr(F_1_055 * fr(Math.pow(c, F_INV_GAMMA))) - F_0_055)
}

/** `v` clamped to `[lo, hi]`; NaN stays NaN. */
export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** A linear-light channel back to an encoded sRGB stop value: clamped to `[0, 1]`, then encoded. */
export function toSrgbChannel(v: number): number {
  return linearToSrgb32(fr(clampNum(v, 0, 1)))
}

/** A color in linear light (from single-precision sRGB). */
export function toLin(c: Rgb): [number, number, number] {
  return [srgbToLinear32(c[0]), srgbToLinear32(c[1]), srgbToLinear32(c[2])]
}

/** A linear-light color as an sRGB stop, each channel clamped to `[0, 1]` first. */
export function toSrgb(c: ArrayLike<number>): Rgb {
  return [toSrgbChannel(c[0]), toSrgbChannel(c[1]), toSrgbChannel(c[2])]
}

/**
 * A color in the fitting space `space` as an sRGB stop: encoded from linear light
 * for `linearRgb`, taken as is for `srgb`; clamped to `[0, 1]` either way, since
 * fitted stops may overshoot.
 */
export function fromSpace(c: ArrayLike<number>, space: Interp): Rgb {
  if (space === 'linearRgb') return toSrgb(c)
  return [fr(clampNum(c[0], 0, 1)), fr(clampNum(c[1], 0, 1)), fr(clampNum(c[2], 0, 1))]
}

/** Description length in editable numbers: the family's base count plus {@link PARAMS_STOP} per interior stop. */
export function fillParams(model: FillModel): number {
  switch (model.kind) {
    case 'flat':
      return PARAMS_FLAT
    case 'linear':
      return PARAMS_LINEAR + PARAMS_STOP * model.mids.length
    case 'radial':
      return (
        (model.aspect === 1 ? PARAMS_RADIAL : PARAMS_RADIAL_ELLIPTIC) +
        PARAMS_STOP * model.mids.length
      )
  }
}

/** A short name for diagnostics: `flat`, `linear/srgb`, `radial/lin`, `ellipse/srgb`, …. */
export function fillKind(model: FillModel): string {
  if (model.kind === 'flat') return 'flat'
  const space = model.interp === 'srgb' ? 'srgb' : 'lin'
  if (model.kind === 'linear') return `linear/${space}`
  return `${model.aspect === 1 ? 'radial' : 'ellipse'}/${space}`
}

/** Whether `model` is a gradient (linear or radial) rather than flat. */
export function isGradient(model: FillModel): model is GradientFill {
  return model.kind !== 'flat'
}

/**
 * Normalized axial coordinate of `(x, y)`: the projection onto the axis as a
 * fraction of its length, `clamp(((P − p0)·d) / |d|², 0, 1)` with `d = p1 − p0`
 * (SVG `spreadMethod="pad"`). A degenerate axis gives 0, the first stop.
 */
export function linearT(x: number, y: number, p0: Point, p1: Point): number {
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const dd = dx * dx + dy * dy
  if (dd <= 0) return 0
  return clampNum(((x - p0[0]) * dx + (y - p0[1]) * dy) / dd, 0, 1)
}

/**
 * Normalized elliptical radius of `(x, y)` about `c`, with the rotation's
 * `sin θ`, `cos θ` given: `u = dx·cos θ + dy·sin θ`, `v = (−dx·sin θ + dy·cos θ)·aspect`,
 * `t = clamp(√(u² + v²) / r, 0, 1)`; for `aspect === 1` the plain distance over
 * `r`. A non-positive radius gives 0 (the center color).
 */
export function radialTRot(
  x: number,
  y: number,
  c: Point,
  r: number,
  aspect: number,
  sn: number,
  cs: number,
): number {
  if (r <= 0) return 0
  const dx = x - c[0]
  const dy = y - c[1]
  let rho: number
  if (aspect === 1) {
    rho = Math.sqrt(dx * dx + dy * dy)
  } else {
    const u = dx * cs + dy * sn
    const v = (-dx * sn + dy * cs) * aspect
    rho = Math.sqrt(u * u + v * v)
  }
  return clampNum(rho / r, 0, 1)
}

/** {@link radialTRot} with the rotation taken from `angle` (not read for a circle). */
export function radialT(
  x: number,
  y: number,
  c: Point,
  r: number,
  aspect: number,
  angle: number,
): number {
  if (r <= 0 || aspect === 1) return radialTRot(x, y, c, r, aspect, 0, 1)
  return radialTRot(x, y, c, r, aspect, Math.sin(angle), Math.cos(angle))
}

/** The gradient coordinate of a position: 0 at the first stop, 1 at the last; 0 for a flat fill. */
export function fillT(model: FillModel, x: number, y: number): number {
  if (model.kind === 'flat') return 0
  if (model.kind === 'linear') return linearT(x, y, model.p0, model.p1)
  return radialT(x, y, model.c, model.r, model.aspect, model.angle)
}

/**
 * A fill model prepared for evaluation at many positions: the stop offsets, the
 * stop colors (and for `linearRgb` their linear-light values) and an ellipse's
 * rotation are worked out once. Its {@link FillEval.colorAt} is the model's
 * color at a point, bit for bit.
 */
export class FillEval {
  readonly model: FillModel
  /** Interior stop offsets, ascending. */
  private readonly offsets: Float64Array
  /** Every stop's sRGB color, first to last, three per stop. */
  private readonly stops: Float64Array
  /** Every stop in linear light (only for `linearRgb`), three per stop. */
  private readonly lin: Float64Array
  private readonly sn: number
  private readonly cs: number

  constructor(model: FillModel) {
    this.model = model
    let sn = 0
    let cs = 1
    if (model.kind === 'flat') {
      this.offsets = new Float64Array(0)
      this.stops = Float64Array.from(model.color)
      this.lin = new Float64Array(0)
    } else {
      const m = model.mids.length
      this.offsets = new Float64Array(m)
      this.stops = new Float64Array(3 * (m + 2))
      this.stops.set(model.c0, 0)
      for (let i = 0; i < m; i++) {
        this.offsets[i] = model.mids[i].offset
        this.stops.set(model.mids[i].color, 3 * (i + 1))
      }
      this.stops.set(model.c1, 3 * (m + 1))
      if (model.interp === 'linearRgb') {
        this.lin = new Float64Array(this.stops.length)
        for (let i = 0; i < this.stops.length; i++) this.lin[i] = srgbToLinear32(this.stops[i])
      } else {
        this.lin = new Float64Array(0)
      }
      if (model.kind === 'radial' && model.aspect !== 1) {
        sn = Math.sin(model.angle)
        cs = Math.cos(model.angle)
      }
    }
    this.sn = sn
    this.cs = cs
  }

  /** The gradient coordinate at a position ({@link fillT}). */
  tAt(x: number, y: number): number {
    const m = this.model
    if (m.kind === 'flat') return 0
    if (m.kind === 'linear') return linearT(x, y, m.p0, m.p1)
    return radialTRot(x, y, m.c, m.r, m.aspect, this.sn, this.cs)
  }

  /**
   * The fill's sRGB color at a position, written to `out[o..o+3]`.
   *
   * The stop profile is piecewise linear: the piece is the first whose upper
   * offset is at or above `t`, at `u = (t − lo) / (hi − lo)` along it (a
   * zero-length piece gives its lower stop, a last stop at 1 gives `u = 1`); the
   * two stops bounding it are lerped at `u` in the model's space.
   */
  colorAt(x: number, y: number, out: { [i: number]: number }, o: number): void {
    const m = this.model
    if (m.kind === 'flat') {
      out[o] = this.stops[0]
      out[o + 1] = this.stops[1]
      out[o + 2] = this.stops[2]
      return
    }
    const t =
      m.kind === 'linear'
        ? linearT(x, y, m.p0, m.p1)
        : radialTRot(x, y, m.c, m.r, m.aspect, this.sn, this.cs)
    this.colorAtT(t, out, o)
  }

  /** The stop profile's sRGB color at gradient coordinate `t ∈ [0, 1]`, written to `out[o..o+3]`. */
  colorAtT(t: number, out: { [i: number]: number }, o: number): void {
    const s = this.stops
    if (this.model.kind === 'flat') {
      out[o] = s[0]
      out[o + 1] = s[1]
      out[o + 2] = s[2]
      return
    }
    // The piece `k` that `t` falls in and the position `u` along it.
    const offs = this.offsets
    let k = offs.length
    let u = t
    if (k > 0) {
      let lo = 0
      for (let i = 0; i < offs.length; i++) {
        const off = offs[i]
        if (t <= off) {
          k = i
          u = off > lo ? (t - lo) / (off - lo) : 0
          break
        }
        lo = off
      }
      if (k === offs.length) u = lo < 1 ? (t - lo) / (1 - lo) : 1
    }
    const a = 3 * k
    if (this.model.interp === 'linearRgb') {
      const l = this.lin
      out[o] = toSrgbChannel(l[a] + (l[a + 3] - l[a]) * u)
      out[o + 1] = toSrgbChannel(l[a + 1] + (l[a + 4] - l[a + 1]) * u)
      out[o + 2] = toSrgbChannel(l[a + 2] + (l[a + 5] - l[a + 2]) * u)
    } else {
      const u32 = fr(u)
      out[o] = fr(s[a] + fr(fr(s[a + 3] - s[a]) * u32))
      out[o + 1] = fr(s[a + 1] + fr(fr(s[a + 4] - s[a + 1]) * u32))
      out[o + 2] = fr(s[a + 2] + fr(fr(s[a + 5] - s[a + 2]) * u32))
    }
  }
}

/** The fill's sRGB color at a position (one-off; use {@link FillEval} for many). */
export function colorAt(model: FillModel, x: number, y: number): Rgb {
  const out: [number, number, number] = [0, 0, 0]
  new FillEval(model).colorAt(x, y, out, 0)
  return out
}

/**
 * One color standing in for the whole fill: the flat color, or the midpoint of a
 * gradient's end stops. Used where a region only needs to be told apart from a
 * neighbor, not rendered.
 */
export function representative(model: FillModel): Rgb {
  if (model.kind === 'flat') return model.color
  const { c0, c1 } = model
  return [
    fr(fr(0.5) * fr(c0[0] + c1[0])),
    fr(fr(0.5) * fr(c0[1] + c1[1])),
    fr(fr(0.5) * fr(c0[2] + c1[2])),
  ]
}

/** The same geometry with the color profile replaced (sRGB stops, `mids` ascending); a flat fill unchanged. */
export function withStops(model: FillModel, c0: Rgb, mids: readonly Stop[], c1: Rgb): FillModel {
  if (model.kind === 'flat') return model
  return { ...model, c0, mids, c1 }
}

/**
 * A flat fill of `color` scored as if it fitted perfectly: chi² 0, cost
 * `λ·PARAMS_FLAT`. For a fill that is assigned rather than fitted.
 */
export function flatOnly(color: Rgb, lambda: number): FillFit {
  return {
    model: { kind: 'flat', color: [fr(color[0]), fr(color[1]), fr(color[2])] },
    chi2: 0,
    params: PARAMS_FLAT,
    cost: lambda * PARAMS_FLAT,
  }
}

/**
 * The pair of colors to unmix a boundary pixel at `(x, y)` between fills `a` and
 * `b` against, and their separation (sRGB, Euclidean): what each fill predicts at
 * the point, or one representative per fill, whichever separates the two more
 * (two flats: their colors). A real edge wants the local pair; a quantization
 * seam inside one ramp, where the two fits agree at the seam, wants the
 * representatives.
 */
export function unmixPair(
  a: FillModel,
  b: FillModel,
  x: number,
  y: number,
): { a: Rgb; b: Rgb; separation: number } {
  const la = colorAt(a, x, y)
  const lb = colorAt(b, x, y)
  const local = separation(la, lb)
  if (!isGradient(a) && !isGradient(b)) return { a: la, b: lb, separation: local }
  const ra = representative(a)
  const rb = representative(b)
  const rep = separation(ra, rb)
  return local >= rep ? { a: la, b: lb, separation: local } : { a: ra, b: rb, separation: rep }
}

function separation(p: Rgb, q: Rgb): number {
  const d0 = fr(p[0] - q[0])
  const d1 = fr(p[1] - q[1])
  const d2 = fr(p[2] - q[2])
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
}
