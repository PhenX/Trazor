import type { BinaryMask } from '@trazor/core'
import { oklabToRgb } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { segmentRegions, upscaleImage } from '../src/index'
import { linkTones } from '../src/segment'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

const BLACK: Rgba = [0, 0, 0, 255]
const SKIN: Rgba = [230, 180, 140, 255]

/** An Oklab color as an 8-bit clamped RGBA pixel. */
function okPixel(L: number, a: number, b: number): Rgba {
  const [r, g, bl] = oklabToRgb(L, a, b)
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [c(r), c(g), c(bl), 255]
}

// A close-but-distinct Oklab pair (ΔE ≈ 0.07): merged by the flat `mergeThreshold`
// (0.1) yet above the near-duplicate floor (`SRM_FLOOR` ≈ 0.03) — a coral sun
// against a pink sky, the colors size-aware merging must keep apart at scale.
const CORAL = okPixel(0.6, 0.05, 0.02)
const PINK = okPixel(0.6, 0.12, 0.02)

/** Two flat colors joined by a 4px anti-aliased ramp (a black outline meeting skin). */
function rampImage(w = 40, h = 20): ReturnType<typeof rasterOf> {
  const edge = w / 2
  return rasterOf(w, h, (x) => {
    const t = Math.min(1, Math.max(0, (x - (edge - 2)) / 4))
    const mix = (a: number, b: number): number => Math.round(a * (1 - t) + b * t)
    return [mix(BLACK[0], SKIN[0]), mix(BLACK[1], SKIN[1]), mix(BLACK[2], SKIN[2]), 255] as Rgba
  })
}

/**
 * A `w`×`h` image of two dark blues 0.04 apart in Oklab: each pixel the mean,
 * over an 8×8 grid of points in it, of the first blended toward the second by
 * `share` (0 to 1) at that point.
 */
function twoBlues(
  w: number,
  h: number,
  share: (x: number, y: number) => number,
): ReturnType<typeof rasterOf> {
  const night = [22, 31, 63]
  const dusk = [21, 26, 82]
  return rasterOf(w, h, (x, y) => {
    let t = 0
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) t += share(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8)
    }
    t /= 64
    return [...night.map((c, k) => Math.round(c * (1 - t) + dusk[k] * t)), 255] as Rgba
  })
}

/** The share of {@link twoBlues} that parts the two blues along an arc: the first inside it. */
const arc = (x: number, y: number): number => (Math.hypot(x - 2.875, y - 2) > 20 ? 1 : 0)

const MAROON = [46, 6, 8]
const BRICK = [70, 6, 8]

/** Paints the rectangle from (`x0`, `y0`) to (`x1`, `y1`), end excluded, one color. */
function paint(
  image: ReturnType<typeof rasterOf>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  [r, g, b]: number[],
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * image.width + x) * 4
      image.data[p] = r
      image.data[p + 1] = g
      image.data[p + 2] = b
    }
  }
}

// Two blues 0.045 apart in Oklab, and what the scenes that pin the split of a
// marker into its fills are painted with.
const PALE = [60, 90, 150]
const DEEP = [60, 104, 163]
const SPLIT = { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24, keepVisibleColors: true }
const clamp = (v: number, low: number, high: number): number => Math.min(high, Math.max(low, v))
const clamp01 = (t: number): number => clamp(t, 0, 1)
const blend = (a: readonly number[], b: readonly number[], t: number): number[] =>
  a.map((v, k) => v + (b[k] - v) * t)

/** A `w`×`h` image of `color(x, y)`, rounded to bytes. */
function painted(
  w: number,
  h: number,
  color: (x: number, y: number) => readonly number[],
): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (x, y) => {
    const c = color(x, y)
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255]
  })
}

/** {@link painted}, each pixel the mean of `color` over a `grid` × `grid` of points in it. */
function rendered(
  w: number,
  h: number,
  color: (x: number, y: number) => readonly number[],
  grid = 4,
): ReturnType<typeof rasterOf> {
  return painted(w, h, (x, y) => {
    const sum = [0, 0, 0]
    for (let sy = 0; sy < grid; sy++) {
      for (let sx = 0; sx < grid; sx++) {
        const c = color(x + (sx + 0.5) / grid, y + (sy + 0.5) / grid)
        for (let k = 0; k < 3; k++) sum[k] += c[k]
      }
    }
    return sum.map((v) => v / (grid * grid))
  })
}

/**
 * A `w`×`h` image of the two blues of {@link twoBlues} side by side, the
 * first on the left, blended across `ramp(y)` pixels around column `w / 2` in
 * row `y` (an even count; none is a hard edge).
 */
function blueSeam(w: number, h: number, ramp: (y: number) => number): ReturnType<typeof rasterOf> {
  const night = [22, 31, 63]
  const dusk = [21, 26, 82]
  return rasterOf(w, h, (x, y) => {
    const r = ramp(y)
    const t =
      r === 0 ? (x < w / 2 ? 0 : 1) : Math.min(1, Math.max(0, (x + 0.5 - (w / 2 - r / 2)) / r))
    return [...night.map((c, k) => Math.round(c * (1 - t) + dusk[k] * t)), 255] as Rgba
  })
}

describe('segmentRegions — region growing', () => {
  it('never invents a third color on an anti-aliased edge', () => {
    // Global quantization would map the mid-ramp mixture to a nearest third
    // color; region growing splits it between the two real neighbors.
    const seg = segmentRegions(rampImage())
    expect(seg.labels.count).toBe(2)
    expect(seg.paletteHex).toHaveLength(2)
    for (const v of seg.labels.data) expect(v === 0 || v === 1).toBe(true)
  })

  it('is deterministic', () => {
    const img = rampImage()
    const a = segmentRegions(img)
    const b = segmentRegions(img)
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })

  it('leaves no band of blend colors along a soft edge', () => {
    // An orange field meets a blue one across a ten-pixel ramp, as a blurred or
    // downscaled outline leaves it. One pixel in the ramp is flat (its row
    // repeats its column's color on either side), so it seeds a marker the flood
    // grows the length of the ramp — a rosy band between the two fills. The
    // band is no area of the drawing: it goes back to the two fills, split
    // where the ramp crosses half coverage.
    const w = 60
    const h = 100
    const orange = [224, 87, 41]
    const blue = [91, 126, 172]
    const coverage = (x: number, y: number): number => {
      const c = y === 50 && (x === 29 || x === 31) ? 30 : x
      return Math.min(1, Math.max(0, 1 - (c - 24.5) / 10))
    }
    const image = rasterOf(w, h, (x, y) => {
      const t = coverage(x, y)
      return [...orange.map((o, k) => Math.round(o * t + blue[k] * (1 - t))), 255] as Rgba
    })
    const seg = segmentRegions(image)
    expect(seg.labels.count).toBe(2)
    expect(seg.paletteHex).toHaveLength(2)
    const fromOrange = seg.labels.data[0]
    const fromBlue = seg.labels.data[w - 1]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(seg.labels.data[y * w + x]).toBe(coverage(x, y) >= 0.5 ? fromOrange : fromBlue)
      }
    }
  })

  it('segments an enlarged soft edge as at the source size (supersampling)', () => {
    // An orange field meets a blue one across a fourteen-pixel ramp. At the
    // source size every ramp pixel steps ≈0.03 from its neighbor, no interior;
    // enlarged 2× each step halves, and read a working pixel apart the whole
    // ramp would pass as flat — one marker spanning both fields, painting them
    // their mean. Read a source pixel apart (`scale`), it splits where the
    // source splits, into the same two colors.
    const w = 60
    const h = 40
    const orange = [235, 140, 40]
    const blue = [40, 90, 200]
    const image = rasterOf(w, h, (x) => {
      const t = Math.min(1, Math.max(0, (x + 0.5 - 25) / 14))
      return [...orange.map((o, k) => Math.round(o * (1 - t) + blue[k] * t)), 255] as Rgba
    })
    const opts = { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24 }
    const source = segmentRegions(image, opts)
    expect(source.labels.count).toBe(2)
    const enlarged = segmentRegions(upscaleImage(image, 2), {
      ...opts,
      minRegionArea: 16,
      scale: 2,
    })
    expect(enlarged.paletteHex).toEqual(source.paletteHex)
    for (let y = 0; y < 2 * h; y++) {
      for (let x = 0; x < 2 * w; x++) {
        const at = source.labels.data[(y >> 1) * w + (x >> 1)]
        expect(enlarged.labels.data[y * 2 * w + x]).toBe(at)
      }
    }
  })

  it('keeps two fills of close colors apart across their anti-aliased seam', () => {
    // Two dark blues 0.04 apart meet along an arc, anti-aliased by coverage.
    // Enlarged 2×, the seam's ramp steps under the flat threshold from one
    // source pixel to the next where the arc runs diagonally, so the flat
    // pixels of one fill reach the other's and both seed one marker, painted
    // their mean. The marker holds two exact fills that meet across a seam a
    // pixel wide: it is split into them.
    const image = twoBlues(32, 32, arc)
    const opts = { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24 }
    const source = segmentRegions(image, opts)
    expect(source.paletteHex.toSorted()).toEqual(['#151a52', '#161f3f'])
    const enlarged = segmentRegions(upscaleImage(image, 2), {
      ...opts,
      minRegionArea: 16,
      scale: 2,
    })
    expect(enlarged.paletteHex.toSorted()).toEqual(['#151a52', '#161f3f'])
    // The seam's pixels go to the fill each is nearer to.
    const dusk = enlarged.paletteHex.indexOf('#151a52')
    expect(enlarged.labels.data[0]).not.toBe(dusk)
    expect(enlarged.labels.data[63 * 64 + 63]).toBe(dusk)
  })

  it('spends no budget of its own on the fills a split marker held', () => {
    // The two blues again, enlarged 2× so that they seed one marker, with a
    // black bar that carries a maroon patch: four colors under a budget of
    // three the engine spends for itself. The split's second blue is the
    // drawing's own and takes no place in that budget, so nothing folds.
    const image = twoBlues(96, 96, arc)
    paint(image, 30, 60, 70, 70, [0, 0, 0])
    paint(image, 40, 62, 52, 68, MAROON)
    const opts = { mergeSizeBias: 0.8, minRegionArea: 16, maxRegions: 3, scale: 2 }
    const seg = segmentRegions(upscaleImage(image, 2), { ...opts, keepVisibleColors: true })
    expect(seg.paletteHex.toSorted()).toEqual(['#000000', '#151a52', '#161f3f', '#2e0608'])
    // A budget the caller holds to stays the count.
    const hard = segmentRegions(upscaleImage(image, 2), opts)
    expect(hard.paletteHex).toHaveLength(3)
  })

  it('counts the fills two split markers share once', () => {
    // Two skies of the two blues, parted by a black bar that carries two reds
    // a shade apart. Each sky seeds one marker and is split, and their four
    // fills are two colors: one more than the two markers held unsplit. The
    // budget of three becomes four, and the cap folds the two reds.
    const image = twoBlues(96, 200, (x, y) => arc(x, y >= 104 ? y - 104 : y))
    paint(image, 0, 92, 96, 104, [0, 0, 0])
    paint(image, 20, 95, 36, 101, MAROON)
    paint(image, 56, 95, 72, 101, BRICK)
    const seg = segmentRegions(upscaleImage(image, 2), {
      mergeSizeBias: 0.8,
      minRegionArea: 16,
      maxRegions: 3,
      scale: 2,
      keepVisibleColors: true,
    })
    expect(seg.paletteHex.toSorted()).toEqual(['#000000', '#151a52', '#161f3f', '#3a0608'])
  })

  it('raises the budget by nothing for fills the merge joined again', () => {
    // On an image this small the edges take too many pixels for the floor of
    // noise-free art, and the two blues, split apart, merge back as
    // near-duplicates of their size. The budget stays three: the two reds fold.
    const image = twoBlues(48, 48, arc)
    paint(image, 4, 36, 44, 46, [0, 0, 0])
    paint(image, 8, 38, 20, 44, MAROON)
    paint(image, 28, 38, 40, 44, BRICK)
    const seg = segmentRegions(upscaleImage(image, 2), {
      mergeSizeBias: 0.8,
      minRegionArea: 16,
      maxRegions: 3,
      scale: 2,
      keepVisibleColors: true,
    })
    expect(seg.paletteHex.toSorted()).toEqual(['#000000', '#151b4e', '#3a0608'])
  })

  it('leaves a soft shape of a close color in the field around it', () => {
    // The same two blues, the second a disc that fades into the first over
    // twelve pixels: its flat center and the field are two exact fills of one
    // marker, large enough to stay apart once split, but they meet across a
    // ramp, not a seam, and stay one marker.
    const image = twoBlues(160, 160, (x, y) =>
      Math.min(1, Math.max(0, (36 - Math.hypot(x - 80, y - 80)) / 12)),
    )
    const seg = segmentRegions(upscaleImage(image, 2), {
      mergeSizeBias: 0.8,
      minRegionArea: 16,
      maxRegions: 24,
      scale: 2,
    })
    expect(seg.labels.count).toBe(1)
  })

  it('reads a seam off the width its two fills meet across in most places', () => {
    // Working pixels at 2×: the blues blend over 6 pixels, 10 between their
    // exact pixels, a seam; over 12, 16 between, a ramp. The limit is 12.
    const opts = { mergeSizeBias: 0.8, minRegionArea: 16, maxRegions: 24, scale: 2 }
    const colors = (ramp: (y: number) => number): string[] =>
      segmentRegions(blueSeam(480, 240, ramp), opts).paletteHex.toSorted()
    expect(colors(() => 6)).toEqual(['#151a52', '#161f3f'])
    expect(colors(() => 12)).toHaveLength(1)
    // A seam along 25 rows in 30, a ramp of 40 pixels along the other five: a seam.
    expect(colors((y) => (y % 30 < 5 ? 40 : 6))).toEqual(['#151a52', '#161f3f'])
    // The reverse: one marker.
    expect(colors((y) => (y % 30 < 5 ? 6 : 40))).toHaveLength(1)
  })

  it('counts no crossing through a third tone', () => {
    // Two blues 0.033 apart with a band of their middle shade between them,
    // five pixels wide and a pixel of blend on either side: 11 pixels from one
    // blue's exact pixels to the other's, but the band's own lie between.
    const night = [22, 31, 63]
    const dusk = [21, 27, 79]
    const levels = [0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.75]
    const image = rasterOf(240, 240, (x) => {
      const k = x - 116
      const t = k < 0 ? 0 : k >= levels.length ? 1 : levels[k]
      return [...night.map((c, i) => Math.round(c * (1 - t) + dusk[i] * t)), 255] as Rgba
    })
    const seg = segmentRegions(image, {
      mergeSizeBias: 0.8,
      minRegionArea: 16,
      maxRegions: 24,
      scale: 2,
    })
    expect(seg.labels.count).toBe(1)
  })

  it('leaves two fills closer than the flat threshold in one marker', () => {
    // Two blues 0.014 apart on a hard edge: every pixel is flat, and the two
    // tones of the marker are too close to be read as fills.
    const image = rasterOf(240, 120, (x) => (x < 120 ? [22, 31, 63, 255] : [22, 30, 70, 255]))
    const seg = segmentRegions(image, { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24 })
    expect(seg.labels.count).toBe(1)
  })

  it('keeps the bands of a gradient in one marker', () => {
    // A slow ramp between the two blues, a level every eight pixels or so:
    // the bands that stand apart as fills lie several bands from each other,
    // with the exact pixels of those between, and meet nowhere.
    const image = twoBlues(200, 96, (x) => Math.min(1, Math.max(0, (x - 5) / 190)))
    const seg = segmentRegions(image, { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24 })
    expect(seg.labels.count).toBe(1)
  })

  it('reads a tone as a fill from 64 source pixels of it', () => {
    // A block of the deep blue in a field of the pale one, its border fading
    // into the field over two pixels. A block of 10 × 10 holds 64 pixels equal
    // to their four neighbors and is a fill; one of 9 × 11 holds 63 and stays
    // the field's. Enlarged 2×, the count is in source pixels still.
    const block = (bw: number, bh: number): ReturnType<typeof rasterOf> =>
      painted(90, 70, (x, y) => {
        const dx = x < 30 ? 30 - x : x >= 30 + bw ? x - (30 + bw - 1) : 0
        const dy = y < 20 ? 20 - y : y >= 20 + bh ? y - (20 + bh - 1) : 0
        const d = Math.max(dx, dy)
        return d > 2 ? PALE : blend(DEEP, PALE, d / 3)
      })
    expect(segmentRegions(block(10, 10), SPLIT).paletteHex).toEqual(['#3c5a96', '#3c66a2'])
    expect(segmentRegions(block(9, 11), SPLIT).paletteHex).toEqual(['#3c5a96'])
    const twice = { ...SPLIT, minRegionArea: 16, scale: 2 }
    expect(segmentRegions(upscaleImage(block(12, 12), 2), twice).labels.count).toBe(2)
    expect(segmentRegions(upscaleImage(block(10, 10), 2), twice).labels.count).toBe(1)
  })

  it('reads a seam up to six pixels between the exact pixels of its two fills', () => {
    // The two blues across a linear ramp: four pixels of it leave six between
    // the exact pixels on its two sides, five leave seven.
    const ramp = (r: number): ReturnType<typeof rasterOf> =>
      painted(120, 80, (x) => blend(PALE, DEEP, clamp01((x - 59 + r) / (r + 1))))
    expect(segmentRegions(ramp(4), SPLIT).paletteHex).toEqual(['#3c5a96', '#3c68a3'])
    expect(segmentRegions(ramp(5), SPLIT).labels.count).toBe(1)
  })

  it('takes the wider width where two fills meet in as many wide places as narrow', () => {
    // The blues on either side of a black bar, joined through it by two
    // bridges five rows high: one a seam, the other a ramp of nine pixels.
    const image = painted(140, 100, (x, y) => {
      const r = y >= 20 && y < 25 ? 3 : y >= 70 && y < 75 ? 9 : -1
      if (x < 52 || x >= 82) return x >= 70 ? DEEP : PALE
      return r < 0 ? [0, 0, 0] : blend(PALE, DEEP, clamp01((x - 66 + r / 2) / (r + 1)))
    })
    expect(segmentRegions(image, SPLIT).paletteHex).toEqual(['#3c619d', '#000000'])
  })

  it('reads no fill in a tone that stands under the flat threshold from another', () => {
    // Three light blues, each 0.017 from the next (ΔE00 2): the first and the
    // third are fills, and the middle one, apart from neither, is not.
    const tones = [
      [150, 170, 200],
      [150, 176, 206],
      [150, 182, 212],
    ]
    const image = painted(160, 110, (x, y) => {
      const dx = x < 70 ? 70 - x : x >= 114 ? x - 113 : 0
      const dy = y < 35 ? 35 - y : y >= 75 ? y - 74 : 0
      const d = Math.max(dx, dy)
      if (d === 0) return tones[2]
      if (d === 1) return blend(tones[2], tones[0], 0.5)
      return x >= 90 ? tones[1] : tones[0]
    })
    expect(segmentRegions(image, SPLIT).paletteHex).toEqual(['#96aac8', '#96b1cf'])
  })

  it('splits two fills that differ in chroma alone, or in one channel', () => {
    const across = (a: number[], b: number[]): string[] =>
      segmentRegions(
        painted(160, 100, (x) => blend(a, b, clamp01((x - 78) / 3))),
        SPLIT,
      ).paletteHex
    expect(across([140, 120, 160], [124, 127, 160])).toEqual(['#8c78a0', '#7c7fa0'])
    expect(across([60, 90, 150], [60, 90, 168])).toEqual(['#3c5a96', '#3c5aa8'])
  })

  it('counts the exact pixels of the last rows', () => {
    // The deep blue fills the image's last three rows only.
    const image = painted(100, 60, (_x, y) => blend(PALE, DEEP, clamp01((y - 54) / 3)))
    expect(segmentRegions(image, SPLIT).labels.count).toBe(2)
  })

  it('reads a marker of up to 512 exact colors', () => {
    // The blues across their seam, and in the pale one a mosaic of 3 × 3
    // blocks, each a level from the next: 484 colors more are read, 529 are
    // continuous tone and the marker stays one.
    const mosaic = (side: number): ReturnType<typeof rasterOf> =>
      painted(200, 110, (x, y) => {
        const i = Math.floor((x - 6) / 3)
        const j = Math.floor((y - 6) / 3)
        if (x >= 6 && y >= 6 && i < side && j < side) return [PALE[0], PALE[1] - i, PALE[2] - j - 1]
        return blend(PALE, DEEP, clamp01((x - 148) / 3))
      })
    expect(segmentRegions(mosaic(22), SPLIT).labels.count).toBe(2)
    expect(segmentRegions(mosaic(23), SPLIT).labels.count).toBe(1)
  })

  it('reads a fill in patches of colors a level or two apart', () => {
    // Each blue in 6 × 6 patches, no two alike within two levels a channel:
    // no color has 64 exact pixels, and together they are the fill.
    const side = 72
    const image = rasterOf(2 * side + 3, side, (x, y) => {
      const t = x < side ? 0 : x >= side + 3 ? 1 : (x - side + 1) / 4
      const k =
        x >= side && x < side + 3
          ? 62
          : Math.floor(y / 6) * (side / 6) + Math.floor((x < side ? x : x - side - 3) / 6)
      const base = blend(PALE, DEEP, t).map(Math.round)
      return [
        base[0] + (k % 5) - 2,
        base[1] + (Math.floor(k / 5) % 5) - 2,
        base[2] + (Math.floor(k / 25) % 5) - 2,
        255,
      ]
    })
    expect(segmentRegions(image, SPLIT).paletteHex).toEqual(['#3c5a96', '#3c68a3'])
  })

  it('leaves a marker mostly of other tones as it is', () => {
    // The blues across their seam, and a slow ramp on from the deep one, a
    // level every three columns. Over 120 columns of 200 it is most of the
    // marker, which stays one; over 60 the blues are split.
    const faded = (fade: number): ReturnType<typeof rasterOf> =>
      painted(200, 100, (x) => {
        const k = x - (200 - fade)
        if (k < 0) return blend(PALE, DEEP, clamp01((x - (200 - fade) / 2 + 1) / 3))
        return [DEEP[0], DEEP[1] + 4 + Math.floor(k / 3), DEEP[2] + 2 + Math.floor(k / 3)]
      })
    expect(segmentRegions(faded(120), SPLIT).labels.count).toBe(1)
    expect(segmentRegions(faded(60), SPLIT).paletteHex.slice(0, 2)).toEqual(['#3c5a96', '#3c69a3'])
  })

  it('holds the count to twice the budget, the fills of split markers included', () => {
    // Four squares on black, each of two shades across a seam: four markers,
    // split into eight fills. A budget of four is raised by the three colors
    // that stay apart beyond one a marker, a budget of two only to its double.
    const pairs = [
      [PALE, DEEP],
      [
        [150, 90, 60],
        [163, 104, 60],
      ],
      [
        [60, 150, 90],
        [60, 163, 104],
      ],
      [
        [150, 60, 150],
        [163, 60, 163],
      ],
    ]
    const image = painted(200, 200, (x, y) => {
      const k = (x >= 100 ? 1 : 0) + (y >= 100 ? 2 : 0)
      const x0 = (k % 2) * 100 + 4
      const y0 = (k >> 1) * 100 + 4
      if (x < x0 || x >= x0 + 92 || y < y0 || y >= y0 + 92) return [0, 0, 0]
      return blend(pairs[k][0], pairs[k][1], clamp01((x - x0 - 44) / 3))
    })
    const colors = (maxRegions: number): string[] =>
      segmentRegions(image, { ...SPLIT, maxRegions }).paletteHex
    expect(colors(4)).toEqual([
      '#000000',
      '#3c5a96',
      '#3c68a3',
      '#965a3c',
      '#a3683c',
      '#3c965a',
      '#3ca368',
      '#9c3c9c',
    ])
    // A budget of three is raised to its double: the first pair folds.
    expect(colors(3)).toEqual(['#000000', '#3c619c', '#965a3c', '#a3683c', '#3c9c61', '#9c3c9c'])
    expect(colors(2)).toHaveLength(4)
    // Seven bands of one marker, six of them fills that stay apart.
    const shades = Array.from({ length: 7 }, (_, k) => [30 + k * 3.2, 40 + k * 5.6, 90 + k * 8])
    const bands = upscaleImage(
      rendered(
        300,
        280,
        (x, y) => shades[clamp(Math.floor((y + 6 * Math.sin(x / 25)) / 40), 0, 6)],
      ),
      2,
    )
    const twice = { ...SPLIT, minRegionArea: 16, scale: 2 }
    expect(segmentRegions(bands, twice).paletteHex).toEqual([
      '#1e285a',
      '#212e62',
      '#24336a',
      '#2a3c76',
      '#2e4482',
      '#314a8a',
    ])
    expect(segmentRegions(bands, { ...twice, maxRegions: 2 }).labels.count).toBe(4)
  })

  it('numbers up to 255 fills in a marker', () => {
    // 272 bands, each 0.03 in Oklab from the last along a lattice: one marker.
    // The 255 largest tones are its fills; the bands of the others go to those
    // beside them.
    const lattice: number[][] = []
    for (let k = 0; k < 17; k++) {
      for (let jj = 0; jj < 4; jj++) {
        for (let ii = 0; ii < 4; ii++) {
          const j = k % 2 === 0 ? jj : 3 - jj
          const i = (k * 4 + jj) % 2 === 0 ? ii : 3 - ii
          lattice.push(
            oklabToRgb(0.3 + k * 0.03, -0.05 + i * 0.03, -0.05 + j * 0.03).map((v) =>
              clamp(Math.round(v * 255), 0, 255),
            ),
          )
        }
      }
    }
    const image = rendered(
      lattice.length * 24,
      48,
      (x) => {
        return lattice[clamp(Math.floor((x - 0.5) / 24), 0, lattice.length - 1)]
      },
      2,
    )
    const seg = segmentRegions(image, { mergeSizeBias: 0.8, minRegionArea: 4 })
    expect(seg.labels.count).toBe(255)
  })

  it('makes room for the markers a split adds', () => {
    // 63 squares of their own colors over the two blues: 64 markers, and the
    // split's second blue a 65th.
    const image = painted(320, 200, (x, y) => {
      const i = Math.floor((x - 8) / 16)
      const j = Math.floor((y - 8) / 16)
      if (x >= 8 && y >= 8 && (x - 8) % 16 < 8 && (y - 8) % 16 < 8 && i < 9 && j < 7) {
        const k = j * 9 + i
        return [(k * 37 + 200) % 256, (k * 91 + 40) % 256, (k * 53 + 20) % 200]
      }
      return blend(PALE, DEEP, clamp01((x - 158) / 3))
    })
    const seg = segmentRegions(image, { mergeSizeBias: 0.8, minRegionArea: 4 })
    expect(seg.paletteHex[seg.labels.data[190 * 320 + 4]]).toBe('#3c5a96')
    expect(seg.paletteHex[seg.labels.data[190 * 320 + 316]]).toBe('#3c68a3')
  })

  it('rescues a downscaled glyph stem that has no flat core', () => {
    // A grey stem three pixels wide on paper, as a downscale leaves it: its
    // columns carry 85 %, 100 % and 85 % of the ink and a 40 % rim column sits
    // on each side, so no pixel is flat and step 2 seeds no marker in it. The
    // rescue pass has to carve the stem's own pixels out of the rim web: a blob
    // that also takes the rim columns in reads as too close to the paper on
    // its across-axis, fails the enclosure test, and the flood then hands the
    // whole stem to the paper.
    const paper: Rgba = [247, 245, 242, 255]
    const ink = [134, 142, 150]
    const mix = (t: number): Rgba => [
      Math.round(ink[0] * t + paper[0] * (1 - t)),
      Math.round(ink[1] * t + paper[1] * (1 - t)),
      Math.round(ink[2] * t + paper[2] * (1 - t)),
      255,
    ]
    const cover = [0.4, 0.85, 1, 0.85, 0.4]
    const w = 48
    const img = rasterOf(w, 60, (x, y) => {
      if (y < 10 || y >= 50) return paper
      const k = x - 18
      return k >= 0 && k < cover.length ? mix(cover[k]) : paper
    })
    const seg = segmentRegions(img, { minRegionArea: 4 })
    const paperLabel = seg.labels.data[30 * w + 4]
    const stem = seg.labels.data[30 * w + 20]
    expect(stem).not.toBe(paperLabel)
    for (let y = 10; y < 50; y++) {
      for (const x of [19, 20, 21]) expect(seg.labels.data[y * w + x]).toBe(stem)
    }
    // The region's color is the stroke's, not a mixture drawn toward the paper.
    const red = parseInt(seg.paletteHex[stem].slice(1, 3), 16)
    expect(red).toBeLessThan(160)
  })

  it('rescues hairlines a pixel wide as well as stems', () => {
    // Black ink on paper, anti-aliased by exact pixel coverage, as a clock face's
    // numerals are drawn: a "0" a pixel wide and a slanted stroke a little
    // wider. Their ink spreads over 20–95 % coverage, so almost no pixel is the
    // stroke's own color and the tight rescue pass breaks them into specks under
    // the minimum area; at a shallow slope the stroke's darkest runs meet only
    // at their corners. The second pass has to carve each whole, or the flood
    // hands it to the paper.
    const paper = 250
    const ink = 15
    const hairline = (w: number, h: number, inside: (x: number, y: number) => boolean) => {
      const cover = new Float64Array(w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let c = 0
          for (let sy = 0; sy < 8; sy++) {
            for (let sx = 0; sx < 8; sx++) if (inside(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8)) c++
          }
          cover[y * w + x] = c / 64
        }
      }
      const img = rasterOf(w, h, (x, y) => {
        const v = Math.round(ink * cover[y * w + x] + paper * (1 - cover[y * w + x]))
        return [v, v, v, 255]
      })
      const seg = segmentRegions(img, { minRegionArea: 4 })
      let dark = 0
      let kept = 0
      for (let p = 0; p < w * h; p++) {
        if (cover[p] < 0.5) continue
        dark++
        if (seg.labels.data[p] !== seg.labels.data[0]) kept++
      }
      return kept / dark
    }
    const ring = hairline(40, 40, (x, y) => Math.abs(Math.hypot(x - 20.3, y - 19.6) - 7) <= 0.5)
    expect(ring).toBeGreaterThan(0.9)
    const [ax, ay, bx, by] = [5, 10, 55, 25]
    const len = Math.hypot(bx - ax, by - ay)
    const stroke = hairline(60, 40, (x, y) => {
      const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len)
      return t >= 0 && t <= 1 && Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / len <= 0.65
    })
    expect(stroke).toBeGreaterThan(0.9)
  })

  it('separates distinct flat blocks and keeps every color', () => {
    const img = rasterOf(40, 40, (x, y) => {
      if (y < 20 && x < 20) return [220, 30, 30, 255]
      if (y < 20) return [30, 180, 60, 255]
      if (x < 20) return [40, 60, 220, 255]
      return [235, 220, 60, 255]
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(4)
  })

  it('folds near-duplicate regions into one color', () => {
    const img = rasterOf(40, 20, (x) => (x < 20 ? [200, 50, 50, 255] : [202, 52, 51, 255]))
    const seg = segmentRegions(img, { mergeThreshold: 0.1 })
    expect(seg.labels.count).toBe(1)
  })

  it('keeps two exact fills a drawing made apart, and folds them when noise could have split them', () => {
    // Two greens of a mosaic (ΔE ≈ 0.03, the noise floor SRM_FLOOR): rendered
    // exactly they are two colors, with sensor-like jitter they are one.
    const A: Rgba = [0x45, 0xd3, 0x68, 255]
    const B: Rgba = [0x58, 0xd3, 0x45, 255]
    const exact = rasterOf(160, 40, (x) => (x < 80 ? A : B))
    expect(segmentRegions(exact, { mergeSizeBias: 0.8 }).labels.count).toBe(2)
    let seed = 11
    const jitter = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed % 5) - 2
    }
    const noisy = rasterOf(160, 40, (x) => {
      const c = x < 80 ? A : B
      return [c[0] + jitter(), c[1] + jitter(), c[2] + jitter(), 255] as Rgba
    })
    expect(segmentRegions(noisy, { mergeSizeBias: 0.8 }).labels.count).toBe(1)
  })

  it('never exceeds the region cap, however distinct the remaining hues', () => {
    // Six vivid fields: every cap below six is met exactly, down to one color.
    const cols: Rgba[] = [
      [220, 30, 30, 255],
      [30, 180, 60, 255],
      [40, 60, 220, 255],
      [235, 220, 60, 255],
      [200, 60, 200, 255],
      [40, 200, 210, 255],
    ]
    const img = rasterOf(90, 60, (x, y) => cols[((x / 30) | 0) + 3 * ((y / 30) | 0)])
    expect(segmentRegions(img).labels.count).toBe(6)
    for (const cap of [5, 3, 2, 1]) {
      const seg = segmentRegions(img, { maxRegions: cap })
      expect(seg.labels.count).toBe(cap)
      expect(seg.paletteHex).toHaveLength(cap)
    }
  })

  it('keeps visibly different fills past a cap that stops before a visible fold, up to twice it', () => {
    // The same six vivid fields: folding any two would paint one of them a color
    // it is not, so the cap stops before its first fold and the budget is unmet
    // — within twice the cap, past which it folds as a hard cap does.
    const cols: Rgba[] = [
      [220, 30, 30, 255],
      [30, 180, 60, 255],
      [40, 60, 220, 255],
      [235, 220, 60, 255],
      [200, 60, 200, 255],
      [40, 200, 210, 255],
    ]
    const img = rasterOf(90, 60, (x, y) => cols[((x / 30) | 0) + 3 * ((y / 30) | 0)])
    for (const cap of [5, 3]) {
      expect(segmentRegions(img, { maxRegions: cap, keepVisibleColors: true }).labels.count).toBe(6)
    }
    for (const cap of [2, 1]) {
      expect(segmentRegions(img, { maxRegions: cap, keepVisibleColors: true }).labels.count).toBe(
        2 * cap,
      )
    }
  })

  it('still folds shades no eye tells apart, and specks of any color, to meet the budget', () => {
    // Six flat greys a few ΔE00 apart, each large enough for size-aware merging
    // to keep: the budget folds neighboring shades until it is met.
    const greys = rasterOf(360, 60, (x) => okPixel(0.5 + 0.03 * ((x / 60) | 0), 0, 0))
    const opts = { mergeSizeBias: 0.8, keepVisibleColors: true }
    expect(segmentRegions(greys, opts).labels.count).toBe(6)
    for (const cap of [5, 3, 2]) {
      expect(segmentRegions(greys, { ...opts, maxRegions: cap }).labels.count).toBe(cap)
    }
    // Two vivid fields and two 3×3 dots of other vivid colors: the dots are
    // specks, so the budget folds them together whatever their colors.
    const dots = rasterOf(80, 40, (x, y) => {
      if (x >= 10 && x < 13 && y >= 10 && y < 13) return [40, 60, 220, 255]
      if (x >= 60 && x < 63 && y >= 25 && y < 28) return [235, 220, 60, 255]
      return x < 40 ? [220, 30, 30, 255] : [30, 180, 60, 255]
    })
    const speckOpts = { ...opts, minRegionArea: 4 }
    expect(segmentRegions(dots, speckOpts).labels.count).toBe(4)
    expect(segmentRegions(dots, { ...speckOpts, maxRegions: 3 }).labels.count).toBe(3)
    // A speck is measured in source pixels: on a 2× working copy the dots are
    // still specks.
    const twice = upscaleImage(dots, 2)
    const scaled = { ...speckOpts, minRegionArea: 16, scale: 2 }
    expect(segmentRegions(twice, scaled).labels.count).toBe(4)
    expect(segmentRegions(twice, { ...scaled, maxRegions: 3 }).labels.count).toBe(3)
  })

  it('stops at the first fold that would show, folding nothing the hard cap would not', () => {
    // Two large greys a few ΔE00 apart and a 5×5 red block: the hard cap folds
    // the cheap red block first and repaints it grey; stopping there keeps all
    // three, rather than going on to fold the greys the hard cap never touched.
    const img = rasterOf(120, 60, (x, y) => {
      if (x >= 20 && x < 25 && y >= 20 && y < 25) return okPixel(0.6, 0.2, 0.1)
      return okPixel(x < 60 ? 0.5 : 0.54, 0, 0)
    })
    const opts = { mergeSizeBias: 0.8, minRegionArea: 4 }
    expect(segmentRegions(img, opts).labels.count).toBe(3)
    const hard = segmentRegions(img, { ...opts, maxRegions: 2 })
    expect(hard.labels.count).toBe(2)
    const greys = [hard.labels.data[10 * 120 + 10], hard.labels.data[10 * 120 + 100]]
    expect(greys[0]).not.toBe(greys[1])
    expect(greys).toContain(hard.labels.data[22 * 120 + 22])
    const kept = segmentRegions(img, { ...opts, maxRegions: 2, keepVisibleColors: true })
    expect(kept.labels.count).toBe(3)
    // A cap of one leaves no room for the block past twice the cap: it folds,
    // then the greys, as under the hard cap.
    const one = segmentRegions(img, { ...opts, maxRegions: 1, keepVisibleColors: true })
    expect(one.labels.count).toBe(1)
  })

  it('leaves the result untouched when the cap is not reached', () => {
    const img = rasterOf(40, 40, (x, y) => {
      if (y < 20 && x < 20) return [220, 30, 30, 255]
      if (y < 20) return [30, 180, 60, 255]
      if (x < 20) return [40, 60, 220, 255]
      return [235, 220, 60, 255]
    })
    const free = segmentRegions(img)
    const capped = segmentRegions(img, { maxRegions: 4 })
    expect(capped.labels.count).toBe(4)
    expect(Array.from(capped.labels.data)).toEqual(Array.from(free.labels.data))
    expect(capped.paletteHex).toEqual(free.paletteHex)
  })

  it('spends the cap on the merge that adds the least squared color error', () => {
    // Two large fields of close colors (kept apart by size-aware merging) and
    // one small far-off blue mark. Recoloring the mark costs 144 px × a large ΔE²;
    // folding the fields costs 3200 px × a tiny ΔE², so the fields fold and the
    // blue survives — a closest-pair merge would do the opposite.
    const w = 160
    const h = 40
    const BLUE: Rgba = [30, 60, 220, 255]
    const img = rasterOf(w, h, (x, y) => {
      if (x >= 20 && x < 32 && y >= 14 && y < 26) return BLUE
      return x < w / 2 ? CORAL : PINK
    })
    const free = segmentRegions(img, { mergeSizeBias: 0.8, minRegionArea: 1 })
    expect(free.labels.count).toBe(3)
    const seg = segmentRegions(img, { mergeSizeBias: 0.8, minRegionArea: 1, maxRegions: 2 })
    expect(seg.labels.count).toBe(2)
    const mark = seg.labels.data[20 * w + 24]
    const field = seg.labels.data[20 * w + 100]
    expect(mark).not.toBe(field)
    expect(seg.paletteRgb[mark * 3 + 2]).toBeGreaterThan(seg.paletteRgb[mark * 3]) // still blue
  })

  it('marks masked-out pixels as -1 and segments only the rest', () => {
    const img = rasterOf(20, 20, (x) => (x < 10 ? [10, 10, 10, 255] : [200, 200, 200, 255]))
    const mask: BinaryMask = { width: 20, height: 20, data: new Uint8Array(400) }
    for (let i = 0; i < 400; i++) mask.data[i] = i % 20 < 10 ? 1 : 0
    const seg = segmentRegions(img, { mask })
    let masked = 0
    for (const v of seg.labels.data) if (v === -1) masked++
    expect(masked).toBe(200)
    expect(seg.labels.count).toBe(1)
  })

  it('palette length matches the label count', () => {
    const seg = segmentRegions(rampImage())
    expect(seg.paletteHex).toHaveLength(seg.labels.count)
    expect(seg.paletteRgb).toHaveLength(seg.labels.count * 3)
    expect(seg.counts).toHaveLength(seg.labels.count)
  })
})

const WHITE: Rgba = [255, 255, 255, 255]

/** Perceptual lightness (Oklab L) of a palette entry, from its RGB bytes. */
function paletteL(seg: ReturnType<typeof segmentRegions>, label: number): number {
  const r = seg.paletteRgb[label * 3] / 255
  const g = seg.paletteRgb[label * 3 + 1] / 255
  const b = seg.paletteRgb[label * 3 + 2] / 255
  // Rec. 601 luma is enough to tell "dark" from "light" here.
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('segmentRegions — rescuing marker-less thin features', () => {
  // A 2px black bar across a white field: too thin to hold a flat core, so it
  // gets no marker of its own. Without the rescue pass the flood dissolves it
  // into the white on either side and it vanishes (one region); the rescue pass
  // seeds it as its own marker so it survives as a distinct dark region.
  function thinBarImage(w = 40, h = 40): ReturnType<typeof rasterOf> {
    const mid = h >> 1
    return rasterOf(w, h, (_x, y) => (y === mid || y === mid + 1 ? BLACK : WHITE))
  }

  it('keeps a thin coreless bar instead of dissolving it into the field', () => {
    const w = 40
    const h = 40
    const seg = segmentRegions(thinBarImage(w, h))
    expect(seg.labels.count).toBe(2)
    const corner = seg.labels.data[0]
    const bar = seg.labels.data[(h >> 1) * w + (w >> 1)]
    expect(bar).not.toBe(corner) // the bar is not painted with the background
    expect(paletteL(seg, bar)).toBeLessThan(0.2) // and it stays dark
    expect(paletteL(seg, corner)).toBeGreaterThan(0.8)
  })

  it('rescues the feature as one region (deterministically)', () => {
    const img = thinBarImage()
    const a = segmentRegions(img)
    const b = segmentRegions(img)
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })

  it('does not invent a third color on a genuine black↔white ramp', () => {
    // The mirror case: a two-sided ramp borders two different colors and must
    // still split between them — the rescue pass must not seed the mid-gray band
    // as its own region. Checked across ramp widths (a wide, hard edge is the
    // case whose near-endpoint sliver most tempts the rescue).
    for (const width of [2, 4, 6, 8]) {
      const w = 60
      const ramp = rasterOf(w, 20, (x) => {
        const t = Math.min(1, Math.max(0, (x - (w / 2 - width / 2)) / width))
        const v = Math.round(t * 255)
        return [v, v, v, 255] as Rgba
      })
      expect(segmentRegions(ramp).labels.count).toBe(2)
    }
  })

  it('rescues thin line-art on a colored field despite its soft rim (fur, facial strokes)', () => {
    // A 2px navy stroke on a mid-blue field, wrapped in an anti-aliased rim: the
    // rim is a chain of small color steps that joins the stroke to the field's
    // edge web, and navy-on-blue is far below black-on-white contrast. The stroke
    // must still come out as its own dark region, with the field on both sides.
    const FIELD: Rgba = [70, 150, 200, 255]
    const STROKE: Rgba = [20, 40, 70, 255]
    const RIM: Rgba = [58, 122, 168, 255] // 25% stroke / 75% field
    const w = 40
    const h = 40
    const mid = h >> 1
    const img = rasterOf(w, h, (_x, y) => {
      if (y === mid || y === mid + 1) return STROKE
      if (y === mid - 1 || y === mid + 2) return RIM
      return FIELD
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(2)
    const corner = seg.labels.data[0]
    const stroke = seg.labels.data[mid * w + (w >> 1)]
    expect(stroke).not.toBe(corner)
    expect(paletteL(seg, stroke)).toBeLessThan(0.3) // navy, not a rim-diluted teal
    expect(paletteL(seg, corner)).toBeGreaterThan(0.45)
  })

  it('keeps a dark contour line between two different colors', () => {
    // A 2px black line where a red field meets a blue one — a cartoon outline,
    // a tooth separator. It is not a mixture of its two sides (it is farther from
    // both than they are from each other), so it must survive as its own dark
    // region instead of being split between red and blue and vanishing.
    const RED: Rgba = [220, 30, 30, 255]
    const BLUE: Rgba = [40, 60, 220, 255]
    const w = 40
    const img = rasterOf(w, 40, (x) => (x === 19 || x === 20 ? BLACK : x < 19 ? RED : BLUE))
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(3)
    const line = seg.labels.data[20 * w + 19]
    expect(line).not.toBe(seg.labels.data[0])
    expect(line).not.toBe(seg.labels.data[w - 1])
    expect(paletteL(seg, line)).toBeLessThan(0.2)
  })

  it('rescues a faint crease within one field (a wrinkle a shade darker than its skin)', () => {
    // The profile of a forehead wrinkle on a cartoon poster, row by row across
    // it: blue skin, a soft rim, a dark-blue core two pixels wide, a rim, skin.
    // At ΔE ≈ 0.2 from the skin it is under the bar for a line between two
    // colors, but both its sides are one field, so no rim can pass for it: it
    // must come out as its own dark region.
    const FIELD: Rgba = [91, 126, 174, 255]
    const rows: Rgba[] = [
      [76, 99, 120, 255],
      [57, 71, 89, 255],
      [48, 56, 73, 255],
      [62, 67, 86, 255],
      [79, 89, 113, 255],
    ]
    const w = 48
    const h = 40
    const top = 18
    const img = rasterOf(w, h, (_x, y) =>
      y >= top && y < top + rows.length ? rows[y - top] : FIELD,
    )
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(2)
    const skin = seg.labels.data[0]
    const crease = seg.labels.data[(top + 2) * w + (w >> 1)]
    expect(crease).not.toBe(skin)
    expect(paletteL(seg, crease)).toBeLessThan(paletteL(seg, skin) - 0.15)
  })

  it('rescues a grey glyph whose paper is too noisy to be flat, below a dark rim', () => {
    // A clock numeral under the dial's rim: a 2px grey stroke on white, a black
    // band above it, and between the two a strip of paper whose compression
    // noise keeps it from flat. A walk up from the stroke crosses that paper to
    // the black band, but the paper is the stroke's side there: it is a grey
    // glyph on white, not a rim between black and white, and survives as its
    // own region.
    const w = 40
    const img = rasterOf(w, 40, (x, y) => {
      if (y >= 4 && y < 10) return BLACK
      if (y >= 10 && y < 16) return (x + y) % 2 === 0 ? WHITE : [243, 243, 243, 255]
      if ((y === 16 || y === 17) && x >= 15 && x < 25) return [112, 112, 112, 255]
      return WHITE
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(3)
    const stroke = seg.labels.data[16 * w + 20]
    expect(stroke).not.toBe(seg.labels.data[30 * w + 5])
    expect(stroke).not.toBe(seg.labels.data[6 * w + 5])
    expect(paletteL(seg, stroke)).toBeGreaterThan(0.4)
    expect(paletteL(seg, stroke)).toBeLessThan(0.7)
  })

  it('leaves a low-contrast thin feature to the flood (only high-contrast is rescued)', () => {
    // A faint bar (ΔE well under the rescue contrast gate) is one the flood
    // renders acceptably; it must not be seeded as its own region.
    const w = 40
    const h = 40
    const mid = h >> 1
    const faint = rasterOf(w, h, (_x, y) =>
      y === mid || y === mid + 1 ? [232, 232, 232, 255] : WHITE,
    )
    expect(segmentRegions(faint).labels.count).toBe(1)
  })
})

describe('segmentRegions — palette colors come from flat interiors', () => {
  it('does not let an absorbed rim tint a region toward its neighbor', () => {
    // A white square on black with a 1px anti-aliased rim (the 50% mixture every
    // rim pixel of a real edge is). The rim has no flat interior, so the flood
    // hands it to the nearer region (white) — correct, no third color — but the
    // square's palette entry must stay white, taken from its flat interior, not
    // a rim-darkened grey.
    const GREY: Rgba = [128, 128, 128, 255]
    const w = 60
    const img = rasterOf(w, 60, (x, y) => {
      const inSquare = x >= 20 && x < 40 && y >= 20 && y < 40
      const inRim = x >= 19 && x < 41 && y >= 19 && y < 41
      return inSquare ? WHITE : inRim ? GREY : BLACK
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(2)
    const square = seg.labels.data[30 * w + 30]
    expect(paletteL(seg, square)).toBeGreaterThan(0.98)
    expect(paletteL(seg, seg.labels.data[0])).toBeLessThan(0.02)
  })
})

/** Two flat blocks of the close pair, left | right. */
function twoBlocks(w: number, h: number): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (x) => (x < w / 2 ? CORAL : PINK))
}

describe('segmentRegions — size-aware merge (SRM)', () => {
  it('is byte-identical to the flat threshold when off (default and explicit 0)', () => {
    const img = twoBlocks(160, 80)
    const dflt = segmentRegions(img)
    const off = segmentRegions(img, { mergeSizeBias: 0 })
    expect(off.labels.count).toBe(dflt.labels.count)
    expect(Array.from(off.labels.data)).toEqual(Array.from(dflt.labels.data))
    expect(off.paletteHex).toEqual(dflt.paletteHex)
  })

  it('keeps close-but-distinct large colors apart that the flat threshold washes together', () => {
    const img = twoBlocks(160, 80)
    // Flat 0.1 merges the pair into one mean color (the wash-out); size-aware
    // merging keeps the two large regions distinct.
    expect(segmentRegions(img).labels.count).toBe(1)
    expect(segmentRegions(img, { mergeSizeBias: 0.8 }).labels.count).toBe(2)
  })

  it('keeps a small ink no mixture of its neighbors explains (a pupil, a star)', () => {
    // A 4×4 pink spot on coral: the size term alone would fold it, but its pixels
    // are a color the coral around it cannot make, so it is an ink of its own.
    const img = rasterOf(40, 40, (x, y) => (x >= 18 && x < 22 && y >= 18 && y < 22 ? PINK : CORAL))
    const seg = segmentRegions(img, { mergeSizeBias: 0.8 })
    expect(seg.labels.count).toBe(2)
    expect(seg.labels.data[20 * 40 + 20]).not.toBe(seg.labels.data[0])
    // A spot of the same ink (within 1.5 ΔE00) still folds.
    const near = okPixel(0.6, 0.055, 0.02)
    const same = rasterOf(40, 40, (x, y) => (x >= 18 && x < 22 && y >= 18 && y < 22 ? near : CORAL))
    expect(segmentRegions(same, { mergeSizeBias: 0.8 }).labels.count).toBe(1)
  })

  it('is deterministic with size-aware merging on', () => {
    const img = twoBlocks(160, 80)
    const a = segmentRegions(img, { mergeSizeBias: 0.8 })
    const b = segmentRegions(img, { mergeSizeBias: 0.8 })
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })

  it('never repaints a dark line the color of a fill a fragment of it sat beside', () => {
    // A dark brown hose four pixels wide loops over a dark teal field and a
    // slightly greener band, enlarged 2× (supersampling). A fragment of its
    // anti-aliased rim sits beside a fragment of teal, close enough in color to
    // be queued as a pair; by the time the pair is reached the rim fragment has
    // joined the line, and the teal fragment's larger flat core would paint
    // their union teal. The line keeps its own dark color along its length.
    const w = 60
    const h = 60
    const ink = [35, 27, 24]
    const teal = [4, 51, 69]
    const band = [19, 62, 64]
    const img = coverageImage(
      w,
      h,
      (x, y) =>
        Math.abs(y - (h / 2 + 0.3 * h * Math.sin((x / w) * Math.PI * 2))) < 2 ||
        Math.abs(x - (w / 2 + 0.3 * w * Math.sin((y / h) * Math.PI * 3))) < 2,
      ink,
      (_x, y) => (y < 20 ? band : teal),
    )
    const seg = segmentRegions(upscaleImage(img, 2), {
      ...ENGINE,
      minRegionArea: 16,
      keepVisibleColors: true,
      scale: 2,
    })
    let core = 0
    let dark = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        if (img.data[o] !== ink[0] || img.data[o + 1] !== ink[1] || img.data[o + 2] !== ink[2])
          continue
        core++
        const label = seg.labels.data[2 * y * 2 * w + 2 * x]
        const [r, g, b] = [0, 1, 2].map((k) => seg.paletteRgb[label * 3 + k])
        if (Math.abs(r - ink[0]) + Math.abs(g - ink[1]) + Math.abs(b - ink[2]) < 24) dark++
      }
    }
    expect(core).toBeGreaterThan(200)
    expect(dark).toBe(core)
  })
})

/** Pixel coverage (8×8 samples) of a shape, as a blend of `ink` over `paper` per channel. */
function coverageImage(
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  ink: readonly number[],
  paper: (x: number, y: number) => readonly number[],
): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (x, y) => {
    let c = 0
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) if (inside(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8)) c++
    }
    const t = c / 64
    const p = paper(x, y)
    return [
      Math.round(ink[0] * t + p[0] * (1 - t)),
      Math.round(ink[1] * t + p[1] * (1 - t)),
      Math.round(ink[2] * t + p[2] * (1 - t)),
      255,
    ]
  })
}

/** The engine's region-growing options. */
const ENGINE = { mergeSizeBias: 0.8, minRegionArea: 4, maxRegions: 24 }

describe('segmentRegions — thin features take their unmixed ink', () => {
  it('paints a thin anti-aliased ring its ink, not the mean of its rim', () => {
    // A black ring two pixels wide on white: no pixel of it is flat, so its mean
    // over every pixel is a dark grey; the ink its rim blends toward is black.
    const img = coverageImage(
      48,
      48,
      (x, y) => Math.abs(Math.hypot(x - 24.3, y - 23.6) - 14) <= 1,
      [0, 0, 0],
      () => [255, 255, 255],
    )
    const seg = segmentRegions(img, ENGINE)
    const ring = seg.labels.data[Math.round(23.6) * 48 + Math.round(24.3 + 14)]
    expect(ring).not.toBe(seg.labels.data[0])
    expect(paletteL(seg, ring)).toBeLessThan(0.03)
  })

  it('paints a small counter inside a dark shape white, not grey', () => {
    // A white hole three pixels across in a black disc (a glyph's counter).
    const img = coverageImage(
      40,
      40,
      (x, y) => {
        const r = Math.hypot(x - 20.3, y - 19.6)
        return r <= 12 && r > 1.5
      },
      [0, 0, 0],
      () => [255, 255, 255],
    )
    const seg = segmentRegions(img, ENGINE)
    const hole = seg.labels.data[20 * 40 + 20]
    expect(hole).not.toBe(seg.labels.data[20 * 40 + 27])
    expect(paletteL(seg, hole)).toBeGreaterThan(0.97)
  })

  it('keeps a small dark pad inside its black outline apart from the outline', () => {
    // Navy claws ringed by a black outline on a blue field, none of them with a
    // flat core: their rims blend the means of pad and outline toward each
    // other until the merge folds them into one dark blue, while their inks
    // are two colors.
    const BLUE = [71, 121, 170]
    const NAVY = [39, 42, 82]
    const pads = [
      [14.3, 16.2],
      [30.6, 16.7],
      [22.4, 30.1],
    ]
    const inPad = (x: number, y: number): boolean =>
      pads.some(([cx, cy]) => Math.hypot((x - cx) / 2.2, (y - cy) / 1.6) <= 1)
    const inRing = (x: number, y: number): boolean =>
      pads.some(([cx, cy]) => Math.hypot((x - cx) / 3.8, (y - cy) / 3.2) <= 1 && !inPad(x, y))
    const padded = coverageImage(44, 44, inPad, NAVY, () => BLUE)
    const img = coverageImage(44, 44, inRing, [0, 0, 0], (x, y) => {
      const o = (y * 44 + x) * 4
      return [padded.data[o], padded.data[o + 1], padded.data[o + 2]]
    })
    const seg = segmentRegions(img, ENGINE)
    const pad = seg.labels.data[16 * 44 + 14]
    const ring = seg.labels.data[16 * 44 + 17]
    expect(pad).not.toBe(ring)
    expect(paletteL(seg, ring)).toBeLessThan(0.03)
    expect(paletteL(seg, pad)).toBeGreaterThan(0.1)
  })

  it('floods a stripe of blend colors seeded inside a ramp back into its two sides', () => {
    // A soft edge between orange and blue, fourteen pixels wide, where a few
    // pixels of the ramp hold one blend flat: the marker they seed grows along
    // the whole ramp as a stripe of the blend, enlarged twice. Its pixels are
    // blends of the two sides, so the edge splits between them.
    const A = [224, 87, 41]
    const B = [91, 126, 172]
    const img = rasterOf(60, 40, (x, y) => {
      const x0 = 23 + Math.round(3 * Math.sin(y / 6))
      let t = Math.min(1, Math.max(0, (x - x0) / 14))
      if (y >= 18 && y < 21 && Math.abs(x - x0 - 7) < 2) t = 0.5
      return [
        Math.round(A[0] * (1 - t) + B[0] * t),
        Math.round(A[1] * (1 - t) + B[1] * t),
        Math.round(A[2] * (1 - t) + B[2] * t),
        255,
      ]
    })
    const seg = segmentRegions(upscaleImage(img, 2, true), {
      ...ENGINE,
      minRegionArea: 16,
      scale: 2,
    })
    expect(seg.labels.count).toBe(2)
  })

  it('folds the overshoot seam between two fills of nearly one color', () => {
    // Two magenta tiles a few units apart, meeting along a row a resampler
    // pushed off both (greener than either): a seam, not a feature.
    const img = rasterOf(240, 240, (_x, y) =>
      y < 120 ? [211, 69, 211, 255] : y === 120 ? [213, 80, 204, 255] : [211, 69, 188, 255],
    )
    const seg = segmentRegions(upscaleImage(img, 2, true), {
      ...ENGINE,
      minRegionArea: 16,
      scale: 2,
    })
    expect(seg.labels.count).toBe(2)
  })

  it('folds a compression-tinted rim along an edge into the edge', () => {
    // Black against orange with a one-pixel dark red rim between them — the
    // chroma a compressed edge smears across it. The rim is no mixture of the
    // two, yet it sits within a rim's reach of the black: no third color.
    const img = rasterOf(60, 30, (x) =>
      x < 30 ? [13, 3, 4, 255] : x === 30 ? [42, 8, 5, 255] : [236, 144, 62, 255],
    )
    const seg = segmentRegions(img, ENGINE)
    expect(seg.labels.count).toBe(2)
  })
})

describe('segmentRegions — near-duplicate consolidation', () => {
  it('folds separate fills no eye tells apart into one color, however dark', () => {
    // A black field and, past a white bar, a dithered one (#010101 and #020202
    // alternating, as compression leaves a black): their colors lie 0.07 apart
    // in Oklab, which spreads the darkest values, above the near-duplicate
    // floor, while CIEDE2000 puts them under half a unit apart.
    const ONE: Rgba = [1, 1, 1, 255]
    const TWO: Rgba = [2, 2, 2, 255]
    const w = 100
    const img = rasterOf(w, 60, (x, y) =>
      x < 45 ? BLACK : x < 55 ? WHITE : (x + y) % 2 === 1 ? ONE : TWO,
    )
    const seg = segmentRegions(img, { mergeSizeBias: 0.8 })
    expect(seg.labels.count).toBe(2)
    expect(seg.labels.data[30 * w + 10]).toBe(seg.labels.data[30 * w + 90])
  })

  it('folds repeated shapes of one size into one color, and meets a fixed budget', () => {
    // Twenty identical white squares on blue over eight vivid stripes: ten
    // colors. Every square is as large as the first, so each joins that one's
    // color however the ties between them fall, and a budget of four is met.
    const stripes: Rgba[] = [
      [220, 30, 30, 255],
      [30, 180, 60, 255],
      [235, 220, 60, 255],
      [200, 60, 200, 255],
      [40, 200, 210, 255],
      [250, 140, 20, 255],
      [120, 70, 20, 255],
      [20, 20, 20, 255],
    ]
    const img = rasterOf(200, 100, (x, y) => {
      if (y >= 80) return stripes[(x / 25) | 0]
      const inSquare = x % 20 >= 7 && x % 20 < 13 && y % 20 >= 7 && y % 20 < 13
      return inSquare ? WHITE : [40, 60, 220, 255]
    })
    expect(segmentRegions(img, { mergeSizeBias: 0.8 }).labels.count).toBe(10)
    expect(segmentRegions(img, { mergeSizeBias: 0.8, maxRegions: 4 }).labels.count).toBe(4)
  })

  // Two pinks a drawing shades a skirt with (ΔE00 6.9), each a fill of its own
  // past a white gap, and a fold line of the darker one, 3 × 16 pixels, inside
  // the lighter; `k` enlarges the scene.
  const LIGHT_PINK: Rgba = [236, 78, 155, 255]
  const DARK_PINK: Rgba = [239, 44, 123, 255]
  const skirt = (k: number): ReturnType<typeof rasterOf> =>
    rasterOf(512 * k, 256 * k, (px, py) => {
      const x = Math.floor(px / k)
      const y = Math.floor(py / k)
      if (x >= 20 && x < 220 && y >= 20 && y < 220) return DARK_PINK
      if (x >= 260 && x < 410 && y >= 40 && y < 190) {
        return x >= 330 && x < 333 && y >= 100 && y < 116 ? DARK_PINK : LIGHT_PINK
      }
      return WHITE
    })

  it.each([1, 2])(
    "leaves a fill its own color when a line of another fill's tone runs inside it (%i×)",
    (k) => {
      // The line is too small to stand against the panel around it and folds into
      // it, votes for its ink included; the panel is still its own pink.
      const w = 512 * k
      const seg = segmentRegions(skirt(k), { ...ENGINE, keepVisibleColors: true, scale: k })
      const at = (x: number, y: number): number[] => {
        const label = seg.labels.data[y * k * w + x * k]
        return [0, 1, 2].map((c) => seg.paletteRgb[label * 3 + c])
      }
      expect(seg.labels.count).toBe(3)
      expect(at(100, 100)).toEqual(DARK_PINK.slice(0, 3))
      expect(at(280, 60)).toEqual(LIGHT_PINK.slice(0, 3))
      expect(at(400, 180)).toEqual(LIGHT_PINK.slice(0, 3))
    },
  )

  // A near-black line two pixels wide on red, every third row of it lighter (a
  // compressed outline: no pixel of it is flat), `rows` long, and a black fill
  // it does not touch; `k` enlarges the scene, and `knot` paints working pixels
  // of the line's own tone over it.
  const roughLine = (
    k: number,
    rows: number,
    knot: (px: number, py: number) => boolean,
  ): ReturnType<typeof rasterOf> =>
    rasterOf(200 * k, 100 * k, (px, py) => {
      const x = Math.floor(px / k)
      const y = Math.floor(py / k)
      if (x >= 120 && x < 180 && y >= 20 && y < 80) return BLACK
      if (knot(px, py)) return [6, 6, 6, 255]
      if (x >= 40 && x < 42 && y >= 50 - rows / 2 && y < 50 + rows / 2) {
        return y % 3 === 0 ? [40, 40, 40, 255] : [6, 6, 6, 255]
      }
      return [200, 60, 40, 255]
    })

  it('joins a rough line to the fill of its ink by its votes', () => {
    // The line's mean is a dark gray 2.6 ΔE00 and more from the black; the pixels
    // that vote for it are its darkest, and they are that black.
    const w = 200
    const seg = segmentRegions(
      roughLine(1, 40, () => false),
      { ...ENGINE, keepVisibleColors: true },
    )
    const line = seg.labels.data[50 * w + 40]
    expect(seg.labels.count).toBe(2)
    expect(line).toBe(seg.labels.data[50 * w + 150])
    expect([0, 1, 2].map((c) => seg.paletteRgb[line * 3 + c])).toEqual([0, 0, 0])
  })

  it('joins it too when a knot gives it a few flat pixels that do not speak for it, enlarged 2×', () => {
    // A knot of 5 × 9 working pixels on a line of 14 rows: flat pixels, fewer
    // than a core needs at 2× (`CORE_MIN_PIXELS` source pixels).
    const w = 400
    const seg = segmentRegions(
      roughLine(2, 14, (px, py) => px >= 80 && px < 85 && py >= 96 && py < 105),
      { ...ENGINE, keepVisibleColors: true, scale: 2 },
    )
    expect(seg.labels.count).toBe(2)
    expect(seg.labels.data[100 * w + 82]).toBe(seg.labels.data[100 * w + 300])
  })

  it('keeps two dark fills apart that differ at a glance', () => {
    const DARK_GREY: Rgba = [40, 40, 40, 255]
    const w = 100
    const img = rasterOf(w, 60, (x) => (x < 45 ? BLACK : x < 55 ? WHITE : DARK_GREY))
    const seg = segmentRegions(img, { mergeSizeBias: 0.8 })
    expect(seg.labels.count).toBe(3)
  })
})

describe('linkTones', () => {
  // Every pair compared, a tone numbered by its first color.
  const pairwise = (lab: Float64Array, link: number): number[] => {
    const count = lab.length / 3
    const tone = Array.from({ length: count }, (_, i) => i)
    const find = (x: number): number => (tone[x] === x ? x : (tone[x] = find(tone[x])))
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const d = Math.hypot(
          lab[i * 3] - lab[j * 3],
          lab[i * 3 + 1] - lab[j * 3 + 1],
          lab[i * 3 + 2] - lab[j * 3 + 2],
        )
        const a = find(i)
        const b = find(j)
        if (d < link && a !== b) tone[Math.max(a, b)] = Math.min(a, b)
      }
    }
    return tone.map((_, i) => find(i))
  }

  it('links what a comparison of every pair links, whatever the order of the colors', () => {
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let round = 0; round < 200; round++) {
      // Colors in a box a few links across: chains, lone colors and several tones.
      const count = 2 + Math.floor(random() * 40)
      const span = 0.01 + random() * 0.08
      const lab = new Float64Array(count * 3)
      for (let i = 0; i < lab.length; i++) lab[i] = random() * span
      expect(Array.from(linkTones(lab, 0.01))).toEqual(pairwise(lab, 0.01))
    }
  })

  it('chains colors each within the link of the next into one tone', () => {
    // Lightness out of order: the middle color comes last.
    const lab = Float64Array.of(0.5, 0, 0, 0.516, 0, 0, 0.508, 0, 0, 0.6, 0, 0)
    expect(Array.from(linkTones(lab, 0.01))).toEqual([0, 0, 0, 3])
  })
})
