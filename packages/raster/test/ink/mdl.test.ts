import { inflateSync } from 'node:zlib'
import { NOISE_FLOOR, oklabToRgb, rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { DistinctImage, colorIdsOfRgb, newClaim } from '../../src/ink/distinct'
import {
  ColorView,
  extractPalette,
  extractPaletteMdl,
  frequencyModes,
  labelImage,
  mixtureTolerance,
  represented,
  unexplained,
} from '../../src/ink/mdl'
import {
  DEFAULT_MERGE_DISTANCE,
  JND_FLOOR,
  PARAMS_PER_INK,
  de00,
  nearestInk,
  paletteEvidence,
} from '../../src/ink/palette'
import type { Palette, PaletteEvidence } from '../../src/ink/palette'
import { CORPUS_REFS } from './palette-fixtures'
import { Lcg, compositeOverWhite, hsl, mixLinear, paint, stripes } from './palette-helpers'
import type { TestImage } from './palette-helpers'

const RED = [0.9, 0.1, 0.1]
const BLUE = [0.1, 0.2, 0.9]
const GREEN = [0.1, 0.8, 0.2]
const lab = (c: readonly number[]): [number, number, number] => rgbToOklab(c[0], c[1], c[2])

/** The palette of `img` with the given cap and evidence (none: the fixed merge radius alone). */
function paletteOf(img: TestImage, maxColors = 64, ev?: PaletteEvidence): Palette {
  return ev
    ? extractPaletteMdl(img.rgb, img.w, img.h, DEFAULT_MERGE_DISTANCE, maxColors, ev)
    : extractPalette(img.rgb, img.w, img.h, DEFAULT_MERGE_DISTANCE, maxColors)
}

/** How `pal` differs from exactly `inks`, each recovered within 1e-4 in OKLab: empty when it does not. */
function inkMismatch(pal: Palette, inks: (readonly number[])[]): string[] {
  const out: string[] = []
  if (pal.count !== inks.length) out.push(`${pal.count} inks, want ${inks.length}`)
  for (const ink of inks) {
    const d = nearestInk(pal, ...lab(ink))[1]
    if (!(d < 1e-4)) out.push(`[${ink.join(', ')}] recovered ${d} away`)
  }
  return out
}

/** The evidence of the inkvec tests: half a level of noise, BIC lambda, no guard, no floor. */
function measured(pixels: number, sigma = 0.5 / 255): PaletteEvidence {
  return { sigmaNoise: sigma, lambda: 0.5 * Math.log(pixels), noiseSigmas: 0, sameInkDe00: 0 }
}

/** Two grays 0.025 apart in OKLab lightness: inside the merge radius, above the JND, in different cells. */
const G1 = oklabToRgb(0.63, 0, 0)
const G2 = oklabToRgb(0.655, 0, 0)

function corpusImage(name: string): TestImage {
  const ref = CORPUS_REFS.find((c) => c.name === name)!
  return compositeOverWhite(
    new Uint8Array(inflateSync(Buffer.from(ref.rgba, 'base64'))),
    ref.w,
    ref.h,
  )
}

describe('extractPaletteMdl', () => {
  it('recovers flat inks exactly, with their areas, and caps the count most frequent first', () => {
    const inks = [
      [0.95, 0.95, 0.95],
      [0.05, 0.05, 0.08],
      [0.85, 0.15, 0.15],
      [0.15, 0.65, 0.25],
      [0.2, 0.3, 0.85],
      [0.95, 0.8, 0.1],
      [0.6, 0.2, 0.7],
      [0.1, 0.7, 0.75],
    ].map((c) => c.map(Math.fround))
    const pal = paletteOf(stripes(inks, 6, 20), 32)
    expect(inkMismatch(pal, inks)).toEqual([])
    for (let k = 0; k < pal.count; k++) expect(Math.abs(pal.weight[k] - 1 / 8)).toBeLessThan(1e-6)
    expect([...pal.alpha].every((a) => a === 1)).toBe(true)
    const one = paletteOf(stripes([inks[0], inks[0], inks[2], inks[3]], 5, 10), 1)
    expect(one.count).toBe(1)
    expect(nearestInk(one, ...lab(inks[0]))[1]).toBeLessThan(1e-4)
  })

  it('takes a one-pixel anti-aliased seam for coverage and a wide band of the same tint for an ink', () => {
    const a = [0.9, 0.1, 0.1].map(Math.fround)
    const b = [0.1, 0.2, 0.9].map(Math.fround)
    const columns: number[][] = []
    for (let k = 0; k < 8; k++) {
      const [p, q] = k % 2 === 0 ? [a, b] : [b, a]
      for (let i = 0; i < 7; i++) columns.push(p)
      columns.push(mixLinear(p, q, 0.5))
    }
    expect(
      inkMismatch(
        paletteOf(
          paint(columns.length, 24, (x) => columns[x]),
          32,
        ),
        [a, b],
      ),
    ).toEqual([])
    const m = mixLinear(a, b, 0.5).map(Math.fround)
    expect(inkMismatch(paletteOf(stripes([a, m, b, a, m, b], 6, 24), 32), [a, m, b])).toEqual([])
  })

  it('splits two close inks only when the noise says they can be told apart', () => {
    const img = stripes([G1, G2], 20, 20)
    expect(paletteOf(img, 8).count).toBe(1)
    const ev = measured(img.w * img.h)
    expect(
      inkMismatch(
        paletteOf(img, 8, ev),
        [G1, G2].map((c) => c.map(Math.fround)),
      ),
    ).toEqual([])
    // The perceptual floor overrides the evidence, and only above their CIEDE2000 separation.
    const d = de00(G1[0], G1[1], G1[2], G2[0], G2[1], G2[2])
    expect(d).toBeGreaterThan(1.5)
    expect(d).toBeLessThan(3.5)
    expect(paletteOf(img, 8, { ...ev, sameInkDe00: d + 0.05 }).count).toBe(1)
    expect(paletteOf(img, 8, { ...ev, sameInkDe00: d - 0.05 }).count).toBe(2)
    // Clean stripes have no spread, so the noise guard changes nothing.
    expect(paletteOf(img, 8, { ...ev, noiseSigmas: 3 }).count).toBe(2)
  })

  it('escapes the merge radius where half the residual outprices an ink', () => {
    const img = stripes([G1, G2], 20, 20)
    const ev = measured(img.w * img.h)
    const d = Math.hypot(...[0, 1, 2].map((k) => lab(G1)[k] - lab(G2)[k]))
    for (const [sigma, want] of [
      [0.125, 1],
      [0.08, 2],
    ]) {
      const fold = 0.5 * 400 * (d / sigma) ** 2
      expect(fold > ev.lambda * PARAMS_PER_INK).toBe(want === 2)
      expect(paletteOf(img, 8, { ...ev, sigmaNoise: sigma }).count).toBe(want)
    }
  })

  it('folds a thin color inside the merge radius into its ink, however the escape prices it', () => {
    const [w, h] = [64, 24]
    const img = paint(w, h, (x) => (x % 8 === 7 ? G2 : G1))
    const ev = measured(w * h)
    const d = Math.hypot(...[0, 1, 2].map((k) => lab(G1)[k] - lab(G2)[k]))
    expect(d).toBeLessThan(DEFAULT_MERGE_DISTANCE)
    expect(d).toBeGreaterThan(JND_FLOOR)
    expect(0.5 * ((w * h) / 8) * (d / ev.sigmaNoise) ** 2).toBeGreaterThan(
      ev.lambda * PARAMS_PER_INK,
    )
    const pal = paletteOf(img, 8, ev)
    expect(pal.count).toBe(1)
    // Refit to the mean of its members within the radius: 7 parts g1 to 1 part g2.
    expect(nearestInk(pal, ...lab(G1))[1]).toBeLessThan(d / 8 + 1e-4)
  })

  it('keeps a small ink no mixture of its neighbors explains, and drops a speck and a seam', () => {
    const pupil = paint(64, 64, (x, y) => (x >= 30 && x < 33 && y >= 30 && y < 33 ? GREEN : RED))
    expect(
      inkMismatch(
        paletteOf(pupil, 8),
        [RED, GREEN].map((c) => c.map(Math.fround)),
      ),
    ).toEqual([])
    const speck = paint(64, 64, (x, y) => (y === 30 && (x === 30 || x === 31) ? GREEN : RED))
    expect(inkMismatch(paletteOf(speck, 8), [RED.map(Math.fround)])).toEqual([])
    const mid = [0, 1, 2].map((k) => (RED[k] + BLUE[k]) / 2)
    const seam = paint(64, 64, (x, y) => (x === 32 && y < 16 ? mid : x < 32 ? RED : BLUE))
    expect(
      inkMismatch(
        paletteOf(seam, 8),
        [RED, BLUE].map((c) => c.map(Math.fround)),
      ),
    ).toEqual([])
  })

  it('does not take one rare pixel for an ink, but eight of them', () => {
    const at = new Set([820])
    const img = (): TestImage => paint(40, 40, (x, y) => (at.has(y * 40 + x) ? GREEN : RED))
    expect(inkMismatch(paletteOf(img(), 8), [RED.map(Math.fround)])).toEqual([])
    for (const p of [820, 821, 822, 823, 860, 861, 862, 863]) at.add(p)
    expect(
      inkMismatch(
        paletteOf(img(), 8),
        [RED, GREEN].map((c) => c.map(Math.fround)),
      ),
    ).toEqual([])
  })

  it('recovers ten concentric rings of ten hues as ten inks and the ground', () => {
    const img = corpusImage('synthetic/128/rings_concentric.png')
    const pal = paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, false))
    expect(pal.count).toBe(11)
    for (let k = 0; k < 10; k++) {
      const hue = hsl(36 * k, 0.62, k % 2 === 0 ? 0.5 : 0.72)
      const [i] = nearestInk(pal, ...lab(hue))
      expect(
        de00(
          hue[0],
          hue[1],
          hue[2],
          pal.inkRgb[i * 3],
          pal.inkRgb[i * 3 + 1],
          pal.inkRgb[i * 3 + 2],
        ),
      ).toBeLessThan(1)
    }
  })

  it('recovers an anti-aliased two-ink logo as exactly two inks', () => {
    const q = (v: number): number => Math.fround(Math.round(v * 255) / 255)
    const navy = [q(0.1), q(0.15), q(0.4)]
    const img = paint(96, 96, (x, y) => {
      let cover = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4
          const py = y + (sy + 0.5) / 4
          if (Math.hypot(px - 40, py - 44) < 24 || (px > 58 && px < 84 && py > 20 && py < 76))
            cover++
        }
      }
      return mixLinear([1, 1, 1], navy, cover / 16).map(q)
    })
    const pal = paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, false))
    expect(inkMismatch(pal, [[1, 1, 1], navy])).toEqual([])
    const logo = corpusImage('simple-icons/128/alchemy.png')
    expect(paletteOf(logo, 64, paletteEvidence(NOISE_FLOOR, logo.w * logo.h, false)).count).toBe(2)
  })

  it('recovers a mosaic of 36 flat cells as 36 inks', () => {
    const q = (v: number): number => Math.fround(Math.round(v * 255) / 255)
    const cells: number[][] = []
    for (const r of [0.05, 0.35, 0.65, 0.95]) {
      for (const g of [0.05, 0.35, 0.65, 0.95])
        for (const b of [0.1, 0.5, 0.9]) cells.push([q(r), q(g), q(b)])
    }
    const img = paint(120, 120, (x, y) => cells[Math.floor(y / 20) * 6 + Math.floor(x / 20)])
    const pal = paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, false))
    expect(inkMismatch(pal, cells.slice(0, 36))).toEqual([])
  })

  it('does not mint inks from noise', () => {
    const rng = new Lcg(7)
    const q = (v: number): number =>
      Math.fround(Math.round(Math.min(1, Math.max(0, v)) * 255) / 255)
    const img = paint(64, 64, (x) =>
      (x < 32 ? [0.8, 0.3, 0.2] : [0.2, 0.4, 0.7]).map((v) => q(v + (rng.below(5) - 2) / 255)),
    )
    expect(paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, false)).count).toBe(2)
    expect(paletteOf(img, 64, paletteEvidence(6 / 255, img.w * img.h, false)).count).toBe(2)
    expect(paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, true)).count).toBe(2)
  })

  it('rejects an overshoot rim around an ink', () => {
    // One gold drawn with a one-pixel rim at 1.067 times the gold: resampling overshoot.
    const gold = [176 / 255, 138 / 255, 74 / 255].map(Math.fround)
    const rim = gold.map((v) => Math.fround(Math.round(v * 1.067 * 255) / 255))
    const img = paint(96, 96, (x, y) => {
      const r = Math.hypot(x + 0.5 - 48, y + 0.5 - 48)
      return r < 30 ? gold : r < 31 ? rim : [1, 1, 1]
    })
    const pal = paletteOf(img, 64, paletteEvidence(NOISE_FLOOR, img.w * img.h, false))
    expect(pal.count).toBe(2)
    const [i] = nearestInk(pal, ...lab(rim))
    expect(nearestInk(pal, ...lab(gold))[0]).toBe(i)
  })

  it('is deterministic and labels every pixel with its nearest ink', () => {
    const img = corpusImage('noto-emoji/128/emoji_u0030.png')
    const ev = paletteEvidence(NOISE_FLOOR, img.w * img.h, false)
    const a = paletteOf(img, 64, ev)
    const b = paletteOf(img, 64, ev)
    expect([...a.inkLab]).toEqual([...b.inkLab])
    expect([...a.weight]).toEqual([...b.weight])
    const ids = colorIdsOfRgb(img.rgb)
    const shared = extractPaletteMdl(img.rgb, img.w, img.h, DEFAULT_MERGE_DISTANCE, 64, ev, ids)
    expect([...shared.inkLab]).toEqual([...a.inkLab])
    const labels = labelImage(img.rgb, a, ids)
    expect([...labels]).toEqual([...labelImage(img.rgb, b)])
    for (let p = 0; p < labels.length; p += 97) {
      const c = rgbToOklab(img.rgb[p * 3], img.rgb[p * 3 + 1], img.rgb[p * 3 + 2])
      const [, best] = nearestInk(a, ...c)
      const [, mine] = nearestInk(
        { ...a, count: 1, inkLab: a.inkLab.subarray(labels[p] * 3) },
        ...c,
      )
      expect(mine - best).toBeLessThan(1e-6)
    }
    // Weights are each ink's share of the pixels within the merge radius.
    expect([...a.weight].reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('always returns an ink: the most frequent mode, or white for an empty image', () => {
    const img = stripes([RED, BLUE, BLUE], 4, 4)
    const none = paletteOf(img, 0)
    expect(none.count).toBe(1)
    expect(nearestInk(none, ...lab(BLUE.map(Math.fround)))[1]).toBeLessThan(1e-4)
    const empty = extractPalette(new Float32Array(0), 0, 0)
    expect(empty.count).toBe(1)
    expect([...empty.inkLab]).toEqual([1, 0, 0])
    expect([...empty.weight]).toEqual([0])
  })
})

describe('frequencyModes', () => {
  it('orders occupied cells by count, ties by cell key, each the mean of its pixels', () => {
    const img = paint(6, 1, (x) => [RED, BLUE, RED, GREEN, BLUE, [0.902, 0.1, 0.1]][x])
    const view = new ColorView(img.rgb, colorIdsOfRgb(img.rgb), 6, 1)
    const modes = frequencyModes(view)
    expect(modes.count).toBe(3)
    expect([...modes.n]).toEqual([3, 2, 1])
    // Red's cell holds three pixels of two reds: its candidate is their mean, not the cell center.
    const r1 = view.lab.subarray(0, 3)
    const r2 = view.lab.subarray(9, 12)
    for (let k = 0; k < 3; k++)
      expect(modes.lab[k]).toBeCloseTo(Math.fround((2 * r1[k] + r2[k]) / 3), 7)
    // A tie in count goes to the lower cell key.
    const tie = paint(2, 1, (x) => [GREEN, BLUE][x])
    const t = frequencyModes(new ColorView(tie.rgb, colorIdsOfRgb(tie.rgb), 2, 1))
    expect(t.key[0]).toBeLessThan(t.key[1])
  })

  it('counts grays in the cells inkvec’s single-precision OKLab puts them in', () => {
    // Level 4's a is −1.5e-8 in single precision: cell 11 on the a axis; level 1's is positive: cell 12.
    const img = paint(
      2,
      1,
      (x) =>
        [
          [4 / 255, 4 / 255, 4 / 255],
          [1 / 255, 1 / 255, 1 / 255],
        ][x],
    )
    const modes = frequencyModes(new ColorView(img.rgb, colorIdsOfRgb(img.rgb), 2, 1))
    const cells = [...modes.key].map((k) => [Math.floor(k / 576), Math.floor(k / 24) % 24, k % 24])
    expect(cells.map((c) => c[1]).sort()).toEqual([11, 12])
  })
})

describe('representation', () => {
  /** The votes of every pixel of color `cand` in `img` against the accepted inks `inks` (sRGB). */
  function votesOf(img: TestImage, cand: readonly number[], inks: (readonly number[])[]): number {
    const ids = colorIdsOfRgb(img.rgb)
    const colors = new Float64Array(ids.count * 3)
    for (let d = 0; d < ids.count; d++)
      colors.set(img.rgb.subarray(ids.reps[d] * 3, ids.reps[d] * 3 + 3), d * 3)
    const claim = newClaim(ids.count)
    const nearest = new Int32Array(ids.count)
    for (let d = 0; d < ids.count; d++) {
      const c = colors.subarray(d * 3, d * 3 + 3)
      claim.claimed[d] = c.every((v, k) => v === Math.fround(cand[k])) ? 1 : 0
      let best = Infinity
      inks.forEach((ink, i) => {
        const dd = Math.hypot(c[0] - ink[0], c[1] - ink[1], c[2] - ink[2])
        if (dd < best) {
          best = dd
          nearest[d] = i
        }
      })
    }
    const img2 = new DistinctImage(ids, img.w, img.h)
    const inkArr = Float64Array.from(inks.flat())
    return unexplained(
      img2,
      claim,
      img2.claimedPixels(claim),
      nearest,
      colors,
      inkArr,
      inks.length,
      mixtureTolerance(0.5 / 255),
    )
  }

  it('counts a distinct blob’s pixels as votes and a blend between its neighbors’ as none', () => {
    const mid = [0.5, 0.15, 0.5]
    const img = paint(16, 12, (x, y) =>
      x >= 3 && x < 6 && y >= 4 && y < 7 ? GREEN : x === 8 ? mid : x < 8 ? RED : BLUE,
    )
    expect(votesOf(img, GREEN, [RED, BLUE])).toBe(9)
    expect(votesOf(img, mid, [RED, BLUE])).toBe(0)
  })

  it('needs eight pixels at 128², scaled with the image, never fewer than eight', () => {
    expect(represented(8, 128 * 128)).toBe(true)
    expect(represented(7, 128 * 128)).toBe(false)
    expect(represented(7, 40 * 40)).toBe(false)
    expect(represented(128, 512 * 512)).toBe(true)
    expect(represented(127, 512 * 512)).toBe(false)
    expect(mixtureTolerance(0)).toBeCloseTo(0.025, 12)
    expect(mixtureTolerance(0.02)).toBeCloseTo(0.06, 12)
  })
})
