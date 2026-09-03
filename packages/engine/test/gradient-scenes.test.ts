import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { scenes } from './helpers/gradient-scenes'

/**
 * Gradient detection scenes, pinned. Each scene is traced end to end and the
 * gradients it yields — kind, geometry, stops, opacity, what an overlay is
 * painted over — are compared with the committed snapshot, so any change to
 * detection shows up in CI as a diff to review rather than as a silent shift.
 *
 * Update the snapshot on purpose, after looking at the new output:
 *   npx vitest run -u packages/engine/test/gradient-scenes.test.ts
 */

/** The gradients of an SVG as a stable, rounded structure (geometry in whole px, offsets and opacity to 2 decimals). */
function gradientSummary(svg: string): string[] {
  const round = (v: string): number => Math.round(Number(v))
  const two = (v: string): number => Math.round(Number(v) * 100) / 100
  const stopsOf = (body: string): string =>
    [
      ...body.matchAll(
        /offset="([\d.]+)" stop-color="(#[0-9a-f]{6})"(?: stop-opacity="([\d.]+)")?/g,
      ),
    ]
      .map((s) => `${two(s[1])}:${s[2]}${s[3] === undefined ? '' : `@${two(s[3])}`}`)
      .join(' ')
  const out: string[] = []
  for (const m of svg.matchAll(
    /<linearGradient id="(\w+)"[^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)">(.*?)<\/linearGradient>/g,
  )) {
    out.push(
      `${m[1]} linear (${round(m[2])},${round(m[3])})->(${round(m[4])},${round(m[5])}) ${stopsOf(m[6])}`,
    )
  }
  for (const m of svg.matchAll(
    /<radialGradient id="(\w+)"[^>]*cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)">(.*?)<\/radialGradient>/g,
  )) {
    out.push(`${m[1]} radial c(${round(m[2])},${round(m[3])}) r${round(m[4])} ${stopsOf(m[5])}`)
  }
  // An overlay is painted right after a shape of identical geometry carrying its base's paint.
  const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map((p) => ({
    d: /\bd="([^"]*)"/.exec(p[0])?.[1] ?? '',
    fill: /\bfill="([^"]*)"/.exec(p[0])?.[1] ?? '',
  }))
  for (let i = 1; i < paths.length; i++) {
    if (paths[i].d === paths[i - 1].d && paths[i].fill !== paths[i - 1].fill) {
      out.push(`${paths[i].fill} over ${paths[i - 1].fill}`)
    }
  }
  return out
}

describe('gradient scenes', () => {
  it.each(scenes)('$name', async (scene) => {
    const image = scene.image()
    const settings = normalizeSettings({ ...scene.settings, gradients: true })
    const res = await vectorize(image, settings)
    const again = await vectorize(scene.image(), settings)
    expect(again.svg).toBe(res.svg)
    expect({
      paths: res.stats.pathCount,
      colors: res.stats.colorCount,
      gradients: gradientSummary(res.svg),
    }).toMatchSnapshot()
  })
})
