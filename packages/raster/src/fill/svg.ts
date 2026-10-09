/**
 * Fill models as SVG paint: the `<defs>` fragment and `fill` value of a fill
 * (and of a fade, an opacity profile with a color profile on the same
 * geometry), and the conversion to Trazor's `GradientPaint`.
 *
 * Coordinates are written as the model holds them, in Trazor's user space
 * (`viewBox="0 0 w h"`, pixel `(i, j)` centered at `(i + ½, j + ½)`); inkvec writes
 * the same points less ½ into its `-0.5 -0.5 w h` viewBox. Coordinates, stop
 * offsets and opacities carry three decimals, the ellipse squash four, the
 * rotation two.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/svg.rs` (`fill_to_svg`,
 * `fade_to_svg`, `interp_attr`) and `color.rs` (`to_hex`).
 */

import type { GradientPaint, GradientStop } from '@trazor/core'
import { FillEval, isGradient } from './model'
import type { FillModel, Rgb } from './model'

const fr = Math.fround

/** `#rrggbb` of an sRGB color in `[0, 1]`: each channel `round(255·c)`, clamped. */
export function toHex(c: Rgb): string {
  let out = '#'
  for (let k = 0; k < 3; k++) {
    const v = Math.min(Math.max(Math.round(fr(c[k] * 255)), 0), 255)
    out += v.toString(16).padStart(2, '0')
  }
  return out
}

/** The `color-interpolation` attribute a gradient needs: none for sRGB, `linearRGB` for a linear-light fit. */
function interpAttr(model: FillModel): string {
  return model.kind !== 'flat' && model.interp === 'linearRgb'
    ? ' color-interpolation="linearRGB"'
    : ''
}

/** The model's stop colors, first to last (one for a flat fill). */
function stopColors(model: FillModel): Rgb[] {
  if (model.kind === 'flat') return [model.color]
  return [model.c0, ...model.mids.map((m) => m.color), model.c1]
}

/**
 * A fill as SVG: the `<defs>` fragment it needs (empty for a flat color) and the
 * `fill` attribute value referencing it. Gradients are `userSpaceOnUse`; a
 * linear-light gradient carries `color-interpolation="linearRGB"`; an ellipse is
 * a circle in a frame moved to the center, squashed by `1/aspect` across its
 * major axis and rotated by `angle` (`gradientTransform`).
 */
export function fillToSvg(model: FillModel, id: string): { defs: string; fill: string } {
  if (model.kind === 'flat') return { defs: '', fill: toHex(model.color) }
  let stops = `<stop offset="0" stop-color="${toHex(model.c0)}"/>`
  for (const m of model.mids)
    stops += `<stop offset="${m.offset.toFixed(3)}" stop-color="${toHex(m.color)}"/>`
  stops += `<stop offset="1" stop-color="${toHex(model.c1)}"/>`
  const fill = `url(#${id})`
  if (model.kind === 'linear') {
    const [x1, y1] = model.p0
    const [x2, y2] = model.p1
    return {
      defs:
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"${interpAttr(model)}` +
        ` x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}">${stops}</linearGradient>`,
      fill,
    }
  }
  const [cx, cy] = model.c
  const transform =
    model.aspect === 1
      ? ''
      : ` gradientTransform="translate(${cx.toFixed(3)} ${cy.toFixed(3)}) rotate(${(model.angle * (180 / Math.PI)).toFixed(2)})` +
        ` scale(1 ${(1 / model.aspect).toFixed(4)}) translate(${(-cx).toFixed(3)} ${(-cy).toFixed(3)})"`
  return {
    defs:
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"${interpAttr(model)}${transform}` +
      ` cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${model.r.toFixed(3)}">${stops}</radialGradient>`,
    fill,
  }
}

/**
 * A fade as SVG: the opacity profile `alpha` (stops are grays equal to the
 * opacity) and the color profile `color` on the same geometry and offsets, as
 * one gradient carrying `stop-color` and `stop-opacity` at each stop. A flat
 * opacity profile is a plain color (the caller writes its `fill-opacity`).
 */
export function fadeToSvg(
  alpha: FillModel,
  color: FillModel,
  id: string,
): { defs: string; fill: string } {
  const alphas = stopColors(alpha)
  const colors = stopColors(color)
  if (!isGradient(alpha)) return { defs: '', fill: toHex(colors[0]) }
  const { defs, fill } = fillToSvg(alpha, id)
  const marker = 'stop-color="#'
  let out = ''
  let rest = defs
  let k = 0
  for (let i = rest.indexOf(marker); i >= 0; i = rest.indexOf(marker)) {
    out += rest.slice(0, i)
    const a = Math.min(Math.max(k < alphas.length ? alphas[k][0] : 1, 0), 1)
    const c =
      k < colors.length
        ? colors[k]
        : colors.length > 0
          ? colors[colors.length - 1]
          : ([1, 1, 1] as Rgb)
    out += `stop-color="${toHex(c)}" stop-opacity="${a.toFixed(3)}"`
    rest = rest.slice(i + 'stop-color="#rrggbb"'.length)
    k++
  }
  return { defs: out + rest, fill }
}

/** Default largest per-channel sRGB error of {@link fillToPaint}'s sRGB stops against a linear-light profile. */
export const PAINT_TOLERANCE = 1 / 255

/**
 * A fill as Trazor's {@link GradientPaint}, which interpolates its stops in
 * encoded sRGB and has no gradient transform: null for a flat fill and for an
 * elliptical radial (`aspect ≠ 1`), which it cannot express (write those with
 * {@link fillToSvg}). A linear-light profile is drawn by sRGB stops: each stop
 * interval is bisected (at offsets on the 1/1000 grid the serializer writes)
 * until the sRGB chord of every piece stays within `tolerance` of the profile.
 */
export function fillToPaint(model: FillModel, tolerance = PAINT_TOLERANCE): GradientPaint | null {
  if (model.kind === 'flat') return null
  if (model.kind === 'radial' && model.aspect !== 1) return null
  const offsets = [0, ...model.mids.map((m) => m.offset), 1]
  const colors = stopColors(model)
  const stops: GradientStop[] = [{ offset: 0, color: toHex(colors[0]) }]
  const ev = new FillEval(model)
  const refine = (lo: number, hi: number): void => {
    const mid = Math.round(((lo + hi) / 2) * 1000) / 1000
    if (mid <= lo || mid >= hi || chordError(ev, lo, hi) <= tolerance) return
    refine(lo, mid)
    stops.push({ offset: mid, color: toHex(profileAt(ev, mid)) })
    refine(mid, hi)
  }
  for (let i = 0; i + 1 < offsets.length; i++) {
    if (model.interp === 'linearRgb') refine(offsets[i], offsets[i + 1])
    stops.push({ offset: offsets[i + 1], color: toHex(colors[i + 1]) })
  }
  if (model.kind === 'linear') {
    return {
      kind: 'linear',
      x1: model.p0[0],
      y1: model.p0[1],
      x2: model.p1[0],
      y2: model.p1[1],
      stops,
    }
  }
  return { kind: 'radial', cx: model.c[0], cy: model.c[1], r: model.r, stops }
}

/** The profile's sRGB color at gradient coordinate `t`. */
function profileAt(ev: FillEval, t: number): Rgb {
  const out: [number, number, number] = [0, 0, 0]
  ev.colorAtT(t, out, 0)
  return out
}

/** Largest per-channel gap between the profile and its sRGB chord over `[lo, hi]`, sampled at eighths. */
function chordError(ev: FillEval, lo: number, hi: number): number {
  const a = profileAt(ev, lo)
  const b = profileAt(ev, hi)
  let worst = 0
  for (let q = 1; q < 8; q++) {
    const u = q / 8
    const c = profileAt(ev, lo + (hi - lo) * u)
    for (let ch = 0; ch < 3; ch++)
      worst = Math.max(worst, Math.abs(a[ch] + (b[ch] - a[ch]) * u - c[ch]))
  }
  return worst
}
