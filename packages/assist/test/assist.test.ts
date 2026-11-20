import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, getProfile, setPixel } from '@trazor/core'
import { analyzeImage, recommendSettings, suggestPalettes } from '@trazor/assist'
import type { ImageAnalysis } from '@trazor/assist'
import { mulberry32 } from '@trazor/core'

const lerpColor = (a: number[], b: number[], t: number) =>
  a.map((v, i) => Math.round(v + (b[i] - v) * t))

function flatLogo() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 40; y < 160; y++) {
    for (let x = 40; x < 160; x++) setPixel(img, x, y, 220, 40, 60)
  }
  for (let y = 80; y < 120; y++) {
    for (let x = 80; x < 120; x++) setPixel(img, x, y, 20, 60, 200)
  }
  return img
}

function noisyPhoto() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(7)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const base = 40 + ((x + y) / 400) * 170
      const n = () => Math.max(0, Math.min(255, base + (rnd() - 0.5) * 60))
      setPixel(img, x, y, n(), n(), n())
    }
  }
  return img
}

function sprite() {
  const img = createRaster(16, 16)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) setPixel(img, x, y, 30, 200, 90)
  }
  return img
}

type Rgb = readonly number[]

interface SheetOptions {
  /** Body colors the sprites cycle through; each brings a shade of its own. */
  hues?: number
  /** Repeats every pixel into a scale × scale block (a nearest-neighbor enlargement). */
  scale?: number
  /** The shade of a body color (by default 0.7 of it). */
  shade?: (body: Rgb) => Rgb
  /** More pixels of sprite `index`, as [x, y, color] in its 12 × 12 cell. */
  extra?: (index: number, body: Rgb) => [number, number, Rgb][]
}

const SHEET_GROUND: Rgb = [34, 30, 52]
const SHEET_OUTLINE: Rgb = [16, 12, 20]
const SHEET_EYE: Rgb = [240, 240, 240]

/**
 * A sheet of `cols` × `rows` pixel-art sprites, 14 pixels apart on a dark
 * ground, drawn on the pixel grid: a one-pixel outline, a body in two shades of
 * one of `hues` colors, an eye and a highlight pixel. Under them runs a strip
 * of eight-pixel blocks in the ground, eye and outline colors, whose edges lie
 * between flat runs long enough for the edge width to be measured.
 */
function spriteSheet(cols: number, rows: number, opts: SheetOptions = {}) {
  const hues = opts.hues ?? 9
  const scale = opts.scale ?? 1
  const cell = 14
  const img = createRaster(cols * cell * scale, (rows * cell + 8) * scale)
  fillRaster(img, SHEET_GROUND[0], SHEET_GROUND[1], SHEET_GROUND[2])
  const put = (x: number, y: number, c: Rgb) => {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++)
        setPixel(img, x * scale + dx, y * scale + dy, c[0], c[1], c[2])
    }
  }
  const inside = (x: number, y: number) => (x - 5.5) ** 2 / 30 + (y - 5.5) ** 2 / 22 <= 1
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const index = i + j * cols
      const h = index % hues
      const body = [60 + ((h * 53) % 180), 90 + ((h * 97) % 150), 120 + ((h * 31) % 120)]
      const shade = opts.shade ? opts.shade(body) : body.map((v) => Math.round(v * 0.7))
      const ox = i * cell + 1
      const oy = j * cell + 1
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          if (!inside(x, y)) continue
          const rim =
            !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
          put(ox + x, oy + y, rim ? SHEET_OUTLINE : y >= 7 ? shade : body)
        }
      }
      put(ox + 4, oy + 4, SHEET_EYE)
      put(ox + 7, oy + 3, [250, 220, 120])
      for (const [x, y, c] of opts.extra?.(index, body) ?? []) put(ox + x, oy + y, c)
    }
  }
  for (let y = rows * cell; y < rows * cell + 8; y++) {
    for (let x = 0; x < cols * cell; x++) {
      put(x, y, [SHEET_GROUND, SHEET_EYE, SHEET_OUTLINE][(x >> 3) % 3])
    }
  }
  return img
}

/** A `w` × `h` canvas of `tw` × `th` tiles, tile (i, j) painted `color(i, j)`. */
function tiles(w: number, h: number, tw: number, th: number, color: (i: number, j: number) => Rgb) {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = color(Math.floor(x / tw), Math.floor(y / th))
      setPixel(img, x, y, c[0], c[1], c[2])
    }
  }
  return img
}

/** Color `k` of a palette of 216, each at least 40 levels from the next. */
const far = (k: number): Rgb => [
  20 + 40 * (k % 6),
  20 + 40 * (Math.floor(k / 6) % 6),
  20 + 40 * (Math.floor(k / 36) % 6),
]

interface ShadedOptions {
  /** The runs the share is counted over (20 by default). */
  of?: number
  /** Rows under the pattern of single pixels checkered in two of its colors. */
  speckle?: number
  /** Rows under those of one flat field. */
  flat?: number
  /** Single pixels in colors of their own, set inside the flat blocks. */
  lone?: number
}

/**
 * Paint shaded pixel by pixel, 240 pixels wide: rows two pixels tall of runs
 * `plateau` pixels wide, dark then light, in two color families from row to
 * row. In `share` of the runs a pixel of the family's middle shade follows the
 * plateau, and the edge there is two steps wide; in the others the plateau is
 * a pixel longer and the edge one step. Under the 200 rows of the pattern,
 * every color fills a block of 8 × 16 pixels.
 */
function shaded(share: number, plateau: number, opts: ShadedOptions = {}) {
  const w = 240
  const h = 200
  const of = opts.of ?? 20
  const speckle = opts.speckle ?? 0
  const families: Rgb[][] = [
    [
      [40, 44, 90],
      [110, 120, 170],
      [190, 200, 240],
    ],
    [
      [90, 40, 44],
      [170, 110, 120],
      [240, 190, 200],
    ],
  ]
  const colors = families.flat()
  const img = createRaster(w, h + 16 + speckle + (opts.flat ?? 0))
  fillRaster(img, colors[0][0], colors[0][1], colors[0][2])
  const put = (x: number, y: number, c: Rgb) => setPixel(img, x, y, c[0], c[1], c[2])
  let run = 0
  for (let y = 0; y < h; y += 2) {
    const [dark, middle, light] = families[(y / 2) % 2]
    let x = 0
    for (let k = 0; x < w; k++) {
      const stepped = (run++ * 7) % of < share * of
      const end = Math.min(w, x + plateau + (stepped ? 0 : 1))
      for (; x < end; x++) {
        put(x, y, k % 2 === 0 ? dark : light)
        put(x, y + 1, k % 2 === 0 ? dark : light)
      }
      if (stepped && x < w) {
        put(x, y, middle)
        put(x, y + 1, middle)
        x++
      }
    }
  }
  for (let y = h; y < h + 16; y++) {
    for (let x = 0; x < w; x++) put(x, y, colors[(x >> 3) % colors.length])
  }
  for (let y = h + 16; y < h + 16 + speckle; y++) {
    for (let x = 0; x < w; x++) put(x, y, (x + y) % 2 === 0 ? colors[0] : colors[2])
  }
  for (let k = 0; k < (opts.lone ?? 0); k++) {
    const c = colors[k % colors.length]
    put(8 * k + 4, h + 8, [c[0] + 30, c[1], c[2] + (k >= colors.length ? 30 : 0)])
  }
  return img
}

/**
 * A black disk on a fully transparent canvas with an anti-aliased rim: the ink
 * color under partial alpha, the empty pixels stored as (0, 0, 0, 0).
 */
function inkOnTransparent() {
  const img = createRaster(160, 160)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const d = Math.hypot(x + 0.5 - 80, y + 0.5 - 80)
      const coverage = Math.max(0, Math.min(1, 40.5 - d))
      if (coverage > 0) setPixel(img, x, y, 0, 0, 0, Math.round(coverage * 255))
    }
  }
  return img
}

/** A dark-gray square with a black outline on a transparent canvas: three tones, not two. */
function grayFillBlackOutline() {
  const img = createRaster(160, 160)
  fillRaster(img, 0, 0, 0, 0)
  for (let y = 30; y < 130; y++) {
    for (let x = 30; x < 130; x++) {
      const edge = x < 42 || x >= 118 || y < 42 || y >= 118
      if (edge) setPixel(img, x, y, 0, 0, 0)
      else setPixel(img, x, y, 63, 63, 63)
    }
  }
  return img
}

/**
 * Thin black strokes on white with soft anti-aliased sides: across each stroke a
 * pixel of 24, three of black and one of 12, so a quarter of the darkest
 * tone's pixels are rim — still within its coarse bin, but not the ink.
 */
function thinStrokesWithSoftRims() {
  const img = createRaster(160, 160)
  fillRaster(img, 255, 255, 255)
  for (let x0 = 10; x0 + 5 <= 150; x0 += 14) {
    for (let y = 10; y < 150; y++) {
      const ramp = [24, 0, 0, 0, 12]
      for (let i = 0; i < ramp.length; i++) setPixel(img, x0 + i, y, ramp[i], ramp[i], ramp[i])
    }
  }
  return img
}

/**
 * A dark glyph with a pale gray stripe across it (twemoji's skunk: #292f33 and
 * #e1e8ed), on a transparent canvas or on white: the stripe shares the white
 * ground's coarse bin, but it is a third ink.
 */
function darkGlyphWithPaleStripe(onWhite: boolean) {
  const img = createRaster(160, 160)
  if (onWhite) fillRaster(img, 255, 255, 255)
  else fillRaster(img, 0, 0, 0, 0)
  for (let y = 30; y < 130; y++) {
    for (let x = 30; x < 130; x++) {
      if (y >= 70 && y < 90) setPixel(img, x, y, 0xe1, 0xe8, 0xed)
      else setPixel(img, x, y, 0x29, 0x2f, 0x33)
    }
  }
  return img
}

/** A black glyph on a transparent canvas casting a wide half-transparent shadow. */
function inkWithSoftShadow() {
  const img = inkOnTransparent()
  for (let y = 100; y < 150; y++) {
    for (let x = 20; x < 140; x++) {
      if (img.data[(y * 160 + x) * 4 + 3] === 0) setPixel(img, x, y, 0, 0, 0, 96)
    }
  }
  return img
}

/** Grayscale gradient with luminance noise (R=G=B) — a photographic gray scene. */
function grayPhoto() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(9)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const base = 40 + ((x + y) / 400) * 170
      const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * 50))
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

/** A shaded ink drawing on bright paper — achromatic, many gray tones (not
 *  two-tone), crisp strokes: line art a grayscale-photo rule must not catch. */
function inkDrawing() {
  const img = createRaster(200, 200)
  // Scanned paper: never perfectly flat.
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const g = 243 + ((x * 13 + y * 7 + ((x * y) % 5)) % 5)
      setPixel(img, x, y, g, g, g)
    }
  }
  for (let y = 40; y < 160; y++) {
    for (let x = 20; x < 180; x++) {
      const hatch = (x + y) % 6 < 2
      const g = hatch ? 60 + ((x * 7 + y * 3) % 120) : 245 - ((x + y) % 40)
      setPixel(img, x, y, g, g, g)
    }
  }
  for (let x = 10; x < 190; x++) {
    const y = 100 + Math.round(20 * Math.sin(x / 12))
    setPixel(img, x, y, 20, 20, 20)
    setPixel(img, x, y + 1, 20, 20, 20)
  }
  return img
}

/** Half black, half white — an achromatic high-contrast sketch. */
function inkOnWhite() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 100; x++) setPixel(img, x, y, 12, 12, 12)
  }
  return img
}

/** Half navy, half white — high contrast but clearly colored. */
function navyOnWhite() {
  const img = createRaster(200, 200)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 100; x++) setPixel(img, x, y, 20, 30, 120)
  }
  return img
}

/** Two flat color fields buried under heavy noise — a compressed/degraded flat graphic. */
function compressedFlat() {
  const img = createRaster(200, 200)
  const rnd = mulberry32(11)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const left = x < 100
      // Bin-centered base colors + noise that stays inside the coarse bin, so
      // the two flat fields still dominate (high two-tone) under heavy speckle.
      const n = () => (rnd() - 0.5) * 18
      setPixel(img, x, y, (left ? 48 : 208) + n(), (left ? 112 : 80) + n(), (left ? 176 : 48) + n())
    }
  }
  return img
}

/** Soft radial coverage of a disc at a pixel center → an anti-aliased rim. */
function discCoverage(x: number, y: number, cx: number, cy: number, rad: number, ramp: number) {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
  return Math.max(0, Math.min(1, (rad + ramp / 2 - d) / ramp))
}
function mixByte(a: number, b: number, t: number) {
  return Math.round(a * (1 - t) + b * t)
}

/** Many anti-aliased colored discs on white. Crisp flat art, but its soft rims
 *  invent thousands of colors and dense micro-gradients, so it scores as
 *  photographic — while the large disc/background interiors stay perfectly flat.
 *  This is the web-clip-art case that the photoScore heuristic alone misroutes. */
function antialiasedField() {
  const w = 320
  const h = 320
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  const cols = [
    [220, 40, 60],
    [30, 70, 200],
    [250, 210, 20],
    [40, 160, 90],
    [180, 60, 190],
  ]
  const rnd = mulberry32(12345)
  const discs: number[][] = []
  for (let i = 0; i < 280; i++) {
    discs.push([
      12 + rnd() * (w - 24),
      12 + rnd() * (h - 24),
      6 + rnd() * 9,
      (rnd() * cols.length) | 0,
    ])
  }
  const ramp = 3.5
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 255
      let g = 255
      let b = 255
      for (const [cx, cy, rad, ci] of discs) {
        if (Math.abs(x - cx) > rad + ramp || Math.abs(y - cy) > rad + ramp) continue
        const cov = discCoverage(x, y, cx, cy, rad, ramp)
        if (cov > 0) {
          const c = cols[ci]
          r = mixByte(r, c[0], cov)
          g = mixByte(g, c[1], cov)
          b = mixByte(b, c[2], cov)
        }
      }
      setPixel(img, x, y, r, g, b)
    }
  }
  return img
}

/** A vivid disc on a large black field — the mean chroma is dragged below the
 *  achromatic line by the black, but the colored pixels are unmistakable, so it
 *  must not be flattened to grayscale. */
function coloredOnBlack() {
  const img = createRaster(200, 200)
  fillRaster(img, 0, 0, 0)
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      let r = 0
      let g = 0
      let b = 0
      const cr = discCoverage(x, y, 100, 100, 42, 2)
      r = mixByte(r, 220, cr)
      g = mixByte(g, 40, cr)
      b = mixByte(b, 60, cr)
      const cb = discCoverage(x, y, 100, 100, 22, 2)
      r = mixByte(r, 30, cb)
      g = mixByte(g, 70, cb)
      b = mixByte(b, 200, cb)
      if (r || g || b) setPixel(img, x, y, r, g, b)
    }
  }
  return img
}

/**
 * A smooth red→white→blue gradient swatch centered on a large flat white field —
 * the shape of an image a user pastes to trace. The white margin makes the flat
 * interiors clear the flat-art threshold, but the swatch itself is *all* soft
 * ramp (micro-gradient density at least as high as flat density), so it is a
 * gradient, not clean flat art. It must not be routed to region growing, which
 * would flood the whole ramp into a single mean-colored region.
 */
function gradientOnFlat() {
  const w = 150
  const h = 250
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  const red = [210, 40, 40]
  const white = [255, 255, 255]
  const blue = [40, 60, 210]
  const grad = (t: number) =>
    t < 0.5 ? lerpColor(red, white, t * 2) : lerpColor(white, blue, (t - 0.5) * 2)
  const squares = [
    { x0: 18, y0: 12, x1: 132, y1: 118, vertical: false },
    { x0: 18, y0: 132, x1: 132, y1: 238, vertical: true },
  ]
  for (const s of squares) {
    const sw = s.x1 - s.x0
    const sh = s.y1 - s.y0
    const r = Math.min(sw, sh) * 0.18
    for (let y = s.y0; y < s.y1; y++) {
      for (let x = s.x0; x < s.x1; x++) {
        const lx = x - s.x0
        const ly = y - s.y0
        const cx = Math.min(Math.max(lx, r), sw - r)
        const cy = Math.min(Math.max(ly, r), sh - r)
        if (Math.hypot(lx - cx, ly - cy) > r) continue
        const t = s.vertical ? ly / (sh - 1) : lx / (sw - 1)
        const c = grad(t)
        setPixel(img, x, y, c[0], c[1], c[2])
      }
    }
  }
  return img
}

/**
 * A cartoon panel: outlined flat fills (a black contour around colored blobs on
 * a pale ground) with anti-aliased edges, then buried under JPEG-like block
 * noise (±2 levels per channel, constant inside 8×8 blocks). The fills are no
 * longer exactly flat everywhere, yet they read as flat fills to the eye — and
 * to the smooth-area statistics.
 */
function noisyCartoon() {
  const w = 320
  const h = 240
  const img = createRaster(w, h)
  const rnd = mulberry32(99)
  const blobs: [number, number, number, number[]][] = [
    [80, 90, 52, [240, 120, 60]],
    [220, 100, 60, [60, 140, 230]],
    [150, 180, 40, [90, 200, 90]],
  ]
  const noise: number[] = []
  for (let i = 0; i < ((w / 8) | 0) * ((h / 8) | 0) * 3; i++)
    noise.push(Math.round((rnd() - 0.5) * 4))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 250
      let g = 244
      let b = 232
      for (const [cx, cy, rad, col] of blobs) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        const fill = Math.max(0, Math.min(1, rad - 3 - d))
        const ink = Math.max(0, Math.min(1, rad + 1 - d)) - fill
        r = mixByte(mixByte(r, 20, ink), col[0], fill)
        g = mixByte(mixByte(g, 20, ink), col[1], fill)
        b = mixByte(mixByte(b, 20, ink), col[2], fill)
      }
      const n = (((y / 8) | 0) * ((w / 8) | 0) + ((x / 8) | 0)) * 3
      setPixel(
        img,
        x,
        y,
        Math.max(0, Math.min(255, r + noise[n])),
        Math.max(0, Math.min(255, g + noise[n + 1])),
        Math.max(0, Math.min(255, b + noise[n + 2])),
      )
    }
  }
  return img
}

/**
 * A sheet of toned paper, 240 px square, with grain (±6 levels, the same on
 * every channel) — cream, or neutral gray for `gray` — carrying:
 * - `lines`: clean brown-black pen lines with one-pixel soft rims, nothing else;
 * - `hatched`: the lines plus a block of one-pixel hatching at half coverage (a
 *   drawing's mid-tones: thin, broken by paper between the strokes);
 * - `gray`: the hatched drawing on gray paper in gray ink;
 * - `print`: the lines plus a red and a blue fill (a colored print on the paper);
 * - `photo`: a card mount around a smooth sepia picture (a ramp from the ink's
 *   brown to the mount's cream with soft bands across it) — every tone on the
 *   paper–ink line, but held in smooth areas.
 */
function tonedSheet(kind: 'lines' | 'hatched' | 'gray' | 'print' | 'photo') {
  const n = 240
  const img = createRaster(n, n)
  const rnd = mulberry32(17)
  const paper = kind === 'gray' ? [214, 214, 214] : [232, 218, 188]
  const ink = kind === 'gray' ? [40, 40, 40] : [52, 40, 30]
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let t = 0
      if (kind === 'photo') {
        if (x >= 50 && x < 190 && y >= 50 && y < 190) {
          t = 0.15 + 0.7 * ((x - 50) / 140) * (0.6 + 0.4 * Math.sin(y / 9))
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const cy = 30 + k * 36 + 8 * Math.sin(x / 15 + k)
          t = Math.max(t, Math.min(1, Math.max(0, 1.6 - Math.abs(y + 0.5 - cy))))
        }
        if ((kind === 'hatched' || kind === 'gray') && x >= 40 && x < 200 && y >= 60 && y < 160) {
          if (x % 3 === 0) t = Math.max(t, 0.55)
        }
      }
      const grain = Math.round((rnd() - 0.5) * 12)
      let c = paper.map((p, i) => mixByte(p, ink[i], t) + grain)
      if (kind === 'print' && y >= 70 && y < 110 && x >= 30 && x < 110) c = [190, 60, 50]
      if (kind === 'print' && y >= 140 && y < 180 && x >= 130 && x < 210) c = [60, 90, 170]
      setPixel(
        img,
        x,
        y,
        ...(c.map((v) => Math.max(0, Math.min(255, v))) as [number, number, number]),
      )
    }
  }
  return img
}

describe('analyzeImage', () => {
  it('measures a flat logo as non-photographic with few colors', () => {
    const a = analyzeImage(flatLogo())
    expect(a.distinctColors).toBeLessThanOrEqual(4)
    expect(a.photoScore).toBeLessThan(0.4)
    expect(a.hasAlpha).toBe(false)
  })

  it('measures a grayscale image as achromatic and a colored one as chromatic', () => {
    expect(analyzeImage(grayPhoto()).colorfulness).toBeLessThan(0.03)
    expect(analyzeImage(navyOnWhite()).colorfulness).toBeGreaterThan(0.03)
  })

  it('measures large flat interiors that anti-aliasing does not erase', () => {
    // Anti-aliased flat art keeps big exactly-flat fields; photo noise leaves none.
    expect(analyzeImage(antialiasedField()).flatDensity).toBeGreaterThan(0.3)
    expect(analyzeImage(noisyPhoto()).flatDensity).toBeLessThan(0.05)
  })

  it('measures a vivid subject on black as colored despite low mean chroma', () => {
    const a = analyzeImage(coloredOnBlack())
    expect(a.colorfulness).toBeLessThan(0.03) // mean chroma dragged down by the black field
    expect(a.coloredFraction).toBeGreaterThan(0.05) // yet a clear fraction is genuinely colored
  })

  it('measures flat fills and ramps as smooth areas, tolerating JPEG-like noise', () => {
    // Dense anti-aliased clip-art: mostly flat area (the rest is rim), no ramp.
    const flat = analyzeImage(antialiasedField())
    expect(flat.flatArea).toBeGreaterThan(0.5)
    expect(flat.rampArea).toBeLessThan(0.05)
    // A gradient swatch on a flat ground: the swatch is ramp area.
    const ramp = analyzeImage(gradientOnFlat())
    expect(ramp.rampArea).toBeGreaterThan(0.3)
    // Block noise leaves a cartoon's fills smooth and flat, not ramps.
    const noisy = analyzeImage(noisyCartoon())
    expect(noisy.flatArea).toBeGreaterThan(0.7)
    expect(noisy.rampArea).toBeLessThan(0.05)
    // Sensor noise breaks smoothness everywhere: almost no flat area.
    expect(analyzeImage(noisyPhoto()).flatArea).toBeLessThan(0.2)
  })

  it('measures noise/gradients as photographic', () => {
    const a = analyzeImage(noisyPhoto())
    expect(a.photoScore).toBeGreaterThan(0.55)
    expect(a.distinctColors).toBeGreaterThan(100)
  })

  it('flags a tiny transparent sprite as pixel art with alpha', () => {
    const a = analyzeImage(sprite())
    expect(a.pixelArtScore).toBeGreaterThanOrEqual(0.7)
    expect(a.rimColors).toBe(0)
    expect(a.hasAlpha).toBe(true)
  })

  it('does not take a small anti-aliased icon for pixel art', () => {
    // A 96-px canvas, but hundreds of rim colors: an icon, not a sprite. (Off
    // the lattice, so the rim takes many distinct coverage values.)
    const img = createRaster(96, 96)
    fillRaster(img, 0, 0, 0, 0)
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const d = Math.hypot(x + 0.5 - 48.31, y + 0.5 - 47.77)
        const coverage = Math.max(0, Math.min(1, 24.37 - d))
        if (coverage > 0) setPixel(img, x, y, 0, 0, 0, Math.round(coverage * 255))
      }
    }
    const a = analyzeImage(img)
    expect(a.pixelArtScore).toBeLessThan(0.7)
    expect(recommendSettings(a).profileId).not.toBe('pixel-art')
    // The same icon rendered small enough to hold few colors: still not a hard
    // palette, because nearly every color it has is a rim color.
    const small = createRaster(64, 64)
    fillRaster(small, 0, 0, 0, 0)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32)
        const coverage = Math.max(0, Math.min(1, 16.5 - d))
        if (coverage > 0) setPixel(small, x, y, 0, 0, 0, Math.round(coverage * 255))
      }
    }
    const b = analyzeImage(small)
    expect(b.distinctColors).toBeLessThanOrEqual(32)
    expect(b.rimColors * 2).toBeGreaterThan(b.distinctColors)
    expect(b.pixelArtScore).toBeLessThan(0.7)
  })

  it('reads a transparent canvas as the white ground it is flattened onto', () => {
    // Read raw, the empty (0, 0, 0, 0) pixels would make this a black field.
    const a = analyzeImage(inkOnTransparent())
    expect(a.hasAlpha).toBe(true)
    expect(a.meanLightness).toBeGreaterThan(0.7)
    expect(a.twoToneCoverage).toBeGreaterThan(0.9)
    expect(a.colorfulness).toBeLessThan(0.03)
    expect(a.distinctColors).toBeGreaterThan(2) // the rim's grays
    expect(a.minorTonesArea).toBe(0)
    expect(a.inkHex).toBe('#000000')
    expect(a.paperHex).toBe('#ffffff')
    expect(recommendSettings(a).profileId).toBe('bw-sketch')
  })

  it("reads a tone's color off its interior, not its anti-aliased rim", () => {
    const a = analyzeImage(thinStrokesWithSoftRims())
    expect(a.inkHex).toBe('#000000')
    expect(a.paperHex).toBe('#ffffff')
  })

  it("counts a pale ink sharing the ground's coarse bin as a third tone", () => {
    for (const onWhite of [false, true]) {
      const a = analyzeImage(darkGlyphWithPaleStripe(onWhite))
      expect(a.minorTonesArea).toBeGreaterThan(0.05)
      expect(recommendSettings(a).profileId).not.toBe('bw-sketch')
    }
  })

  it('counts a flat third tone, which anti-aliasing never produces', () => {
    const a = analyzeImage(grayFillBlackOutline())
    expect(a.minorTonesArea).toBeGreaterThan(0.02)
    expect(a.inkHex).toBe('#3f3f3f')
  })
  it('reads the ground and the mark of a drawing on toned paper off the lightness histogram', () => {
    const a = analyzeImage(tonedSheet('hatched'))
    // The paper's grain spans two coarse bins, which the dominant tones read as
    // paper and ink; the histogram's mode is the paper, its darkest third the ink.
    expect(a.groundLightness).toBeGreaterThan(0.85)
    expect(a.groundLightness).toBeLessThan(0.93)
    expect(a.groundChroma).toBeGreaterThan(0.02)
    expect(a.groundSpread).toBeLessThan(0.04)
    expect(a.groundShare).toBeGreaterThan(0.5)
    expect(a.groundLightness - a.markLightness).toBeGreaterThan(0.4)
    const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(a.groundHex.slice(i, i + 2), 16))
    expect(Math.abs(gr - 232) + Math.abs(gg - 218) + Math.abs(gb - 188)).toBeLessThan(12)
    expect(parseInt(a.markHex.slice(1, 3), 16)).toBeLessThan(110)
    // Every color is a mix of that paper and that ink.
    expect(a.toneAxisResidual).toBeLessThan(0.01)
    // Its mid-tones are hatching: plenty of them, but none in smooth areas.
    expect(a.midToneShare).toBeGreaterThan(0.07)
    expect(a.midToneArea).toBeLessThan(0.005)
  })

  it('measures off-axis color, smooth mid-tone areas and clean two-tone lines', () => {
    // A colored print strays off the paper–ink line.
    expect(analyzeImage(tonedSheet('print')).toneAxisResidual).toBeGreaterThan(0.05)
    // A mounted sepia picture keeps its tones on the line, in smooth areas.
    const photo = analyzeImage(tonedSheet('photo'))
    expect(photo.toneAxisResidual).toBeLessThan(0.01)
    expect(photo.midToneArea).toBeGreaterThan(0.05)
    // Clean pen lines: their only mid-tones are their rims.
    expect(analyzeImage(tonedSheet('lines')).midToneShare).toBeLessThan(0.05)
    // A white ground is neither toned nor darker than white.
    const white = analyzeImage(flatLogo())
    expect(white.groundLightness).toBeGreaterThan(0.97)
    expect(white.groundChroma).toBeLessThan(0.005)
  })
})

describe('recommendSettings', () => {
  it('routes flat art to a flat profile with a small palette', () => {
    const rec = recommendSettings(analyzeImage(flatLogo()))
    expect(['logo', 'illustration']).toContain(rec.profileId)
    expect(rec.patch.paletteSize).toBeLessThanOrEqual(8)
    expect(rec.rationale.length).toBeGreaterThan(0)
  })

  it('routes photos to the photo profile with denoise', () => {
    const rec = recommendSettings(analyzeImage(noisyPhoto()))
    expect(rec.profileId).toBe('photo')
  })

  it('keeps pixel art exact', () => {
    const a = analyzeImage(sprite())
    expect(a.pixelColors).toBe(2)
    expect(a.pixelCorners).toBe(4)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.patch.curveMode).toBe('pixel')
    expect(rec.patch.background).toBe('transparent')
    expect(rec.patch.paletteSize).toBe(2)
    expect(rec.rationaleKeys).toContainEqual({ code: 'pixelExact', params: { count: 2 } })
  })

  it('counts the colors and corners of a pixel-art canvas over white', () => {
    // Clear pixels that store other colors are one white, and a notch cut into
    // the square adds the two corners it turns.
    const img = sprite()
    for (let x = 0; x < 16; x += 2) setPixel(img, x, 1, 255, 0, 0, 0)
    setPixel(img, 4, 4, 0, 255, 0, 0)
    const a = analyzeImage(img)
    expect(a.pixelColors).toBe(2)
    expect(a.pixelCorners).toBe(6)
    // A pixel of the square's color touching its corner: the window where the
    // two meet is one corner more, with the three of the pixel's own.
    setPixel(img, 12, 12, 30, 200, 90)
    expect(analyzeImage(img).pixelCorners).toBe(9)
  })

  it('reads a larger sprite sheet off its pixel grid as pixel art', () => {
    // 168 × 148 pixels: past the small-canvas bound, so the grid's own tells
    // decide — a hard palette, edges a pixel sharp, paint laid in regions of a
    // few pixels.
    const a = analyzeImage(spriteSheet(12, 10))
    expect(a.pixelArtScore).toBeLessThan(0.7)
    expect(a.pixelScale).toBe(1)
    expect(a.gridColors).toBe(22)
    expect(a.blendRimShare).toBeLessThan(0.4)
    expect(a.edgeWidth).toBeLessThanOrEqual(0.8)
    expect(a.meanRegionArea).toBeLessThan(64)
    expect(a.pixelGrid).toBe(true)
    expect(a.pixelColors).toBe(22)
    expect(a.pixelCorners).toBe(3980)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.rationaleKeys).toEqual([
      { code: 'pickPixelGrid' },
      { code: 'pixelExact', params: { count: 22 } },
    ])
    expect(rec.patch.curveMode).toBe('pixel')
    expect(rec.patch.paletteSize).toBe(22)
  })

  it('reads a pixel-art enlargement at its own scale', () => {
    // A small sheet repeated 3 × 3: a 252 px canvas that is an 84 px one, a
    // small canvas in few flat colors.
    const a = analyzeImage(spriteSheet(6, 6, { scale: 3 }))
    expect(a.pixelScale).toBe(3)
    expect(a.pixelArtScore).toBeGreaterThanOrEqual(0.7)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.rationaleKeys.map((k) => k.code)).toEqual(['pickPixelArt', 'pixelExact'])
    // A larger sheet doubled stays a large canvas, read on one sample a block:
    // the same regions, and the same corners to trace.
    const sheet = analyzeImage(spriteSheet(12, 10))
    const doubled = analyzeImage(spriteSheet(12, 10, { scale: 2 }))
    expect(doubled.pixelScale).toBe(2)
    expect(doubled.gridColors).toBe(22)
    expect(doubled.meanRegionArea).toBe(sheet.meanRegionArea)
    expect(doubled.pixelCorners).toBe(sheet.pixelCorners)
    expect(recommendSettings(doubled).rationaleKeys[0].code).toBe('pickPixelGrid')
  })

  it('reads no enlargement past eight times, nor from a few runs', () => {
    const eight = analyzeImage(spriteSheet(4, 4, { scale: 8 }))
    expect(eight.pixelScale).toBe(8)
    expect(recommendSettings(eight).profileId).toBe('pixel-art')
    // Shown at 900 %, the sheet reads as flat art in large squares.
    const nine = analyzeImage(spriteSheet(4, 4, { scale: 9 }))
    expect(nine.pixelScale).toBe(1)
    expect(recommendSettings(nine).profileId).not.toBe('pixel-art')
    // One eight-pixel square: sixteen runs of eight are no evidence of a grid.
    const lone = createRaster(300, 200)
    fillRaster(lone, 255, 255, 255)
    for (let y = 67; y < 75; y++) for (let x = 101; x < 109; x++) setPixel(lone, x, y, 0, 0, 0)
    const l = analyzeImage(lone)
    expect(l.pixelScale).toBe(1)
    expect(recommendSettings(l).profileId).not.toBe('pixel-art')
  })

  it('takes a pixel grid of three to 192 colors', () => {
    // 94 hues: 188 body colors and shades with the four all sprites share.
    const most = analyzeImage(spriteSheet(12, 10, { hues: 94 }))
    expect(most.gridColors).toBe(192)
    expect(most.pixelGrid).toBe(true)
    // One pixel of one more color.
    const over = analyzeImage(
      spriteSheet(12, 10, {
        hues: 94,
        extra: (index) => (index === 0 ? [[4, 6, [255, 0, 255]]] : []),
      }),
    )
    expect(over.gridColors).toBe(193)
    expect(over.pixelGrid).toBe(false)
    expect(over.pixelColors).toBe(0)
    // Three colors in tiles of 5 × 8, then the same tiles in two.
    const three = analyzeImage(tiles(200, 160, 5, 8, (i, j) => far(((i + 2 * j) % 3) * 50)))
    expect(three.gridColors).toBe(3)
    expect(three.pixelGrid).toBe(true)
    const two = analyzeImage(tiles(200, 160, 5, 8, (i, j) => far(((i + j) % 2) * 50)))
    expect(two.gridColors).toBe(2)
    expect(two.edgeWidth).toBeLessThanOrEqual(0.8)
    expect(two.pixelGrid).toBe(false)
  })

  it('shares the closest shades of pixel art past a palette', () => {
    const a = analyzeImage(spriteSheet(12, 10, { hues: 50 }))
    expect(a.pixelColors).toBe(104)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.rationaleKeys).toEqual([
      { code: 'pickPixelGrid' },
      { code: 'pixelPalette', params: { count: 104, max: 64 } },
    ])
    expect(rec.patch.paletteSize).toBe(64)
    expect(rec.patch.autoPaletteSize).toBe(false)
  })

  it('counts every color of a pixel-art canvas, past what the sample and the crop see', () => {
    // 1260 × 1128 pixels: the analyzer samples every other pixel and reads the
    // grid on the central 1024². Forty sprites of the first cell column carry
    // one pixel each of a color of their own, on an odd pixel outside the crop.
    const sheet = spriteSheet(90, 80, {
      extra: (index) =>
        index % 90 === 0 && index < 90 * 40 ? [[4, 6, [255, 20 + 5 * (index / 90), 255]]] : [],
    })
    const a = analyzeImage(sheet)
    expect(a.pixelGrid).toBe(true)
    expect(a.distinctColors).toBe(22)
    expect(a.gridColors).toBe(22)
    expect(a.pixelColors).toBe(62)
    const rec = recommendSettings(a)
    expect(rec.patch.paletteSize).toBe(62)
    expect(rec.rationaleKeys[1]).toEqual({ code: 'pixelExact', params: { count: 62 } })
    // 4200 pixels above the crop in colors of their own: counted to one past
    // the most a count goes to.
    for (let k = 0; k < 4200; k++)
      setPixel(sheet, k % 1260, 2 * Math.floor(k / 1260), k & 255, k >> 8, 250)
    const many = analyzeImage(sheet)
    expect(many.pixelGrid).toBe(true)
    expect(many.pixelColors).toBe(4097)
    expect(recommendSettings(many).rationaleKeys[1]).toEqual({
      code: 'pixelPalette',
      params: { count: 4097, max: 64 },
    })
  })

  it('leaves pixel art past its corner or pixel budget to the other routes', () => {
    const a = analyzeImage(spriteSheet(12, 10))
    expect(recommendSettings({ ...a, pixelCorners: 400_000 }).profileId).toBe('pixel-art')
    const detailed = recommendSettings({ ...a, pixelCorners: 400_001 })
    expect(detailed.profileId).not.toBe('pixel-art')
    expect(detailed.rationaleKeys[0]).toEqual({ code: 'pixelGridLarge' })
    expect(recommendSettings({ ...a, width: 4096, height: 4096 }).profileId).toBe('pixel-art')
    const large = recommendSettings({ ...a, width: 4097, height: 4096 })
    expect(large.profileId).not.toBe('pixel-art')
    expect(large.rationaleKeys[0]).toEqual({ code: 'pixelGridLarge' })
    // The pixels are those of the canvas as it is, enlarged or not.
    const doubled = analyzeImage(spriteSheet(12, 10, { scale: 2 }))
    expect(recommendSettings({ ...doubled, width: 4096, height: 4096 }).profileId).toBe('pixel-art')
    expect(recommendSettings({ ...doubled, width: 4097, height: 4096 }).profileId).not.toBe(
      'pixel-art',
    )
    // The small-canvas rule holds the same bounds: a canvas whose crop reads
    // enlarged can be a large one.
    const small = analyzeImage(spriteSheet(6, 6, { scale: 3 }))
    expect(small.pixelGrid).toBe(true)
    expect(recommendSettings({ ...small, pixelCorners: 400_000 }).rationaleKeys[0]).toEqual({
      code: 'pickPixelArt',
    })
    for (const grid of [true, false]) {
      const past = recommendSettings({ ...small, pixelGrid: grid, pixelCorners: 400_001 })
      expect(past.profileId).not.toBe('pixel-art')
      expect(past.rationaleKeys[0]).toEqual({ code: 'pixelGridLarge' })
    }
  })

  it('counts the corners of the whole canvas, past the crop the grid is read on', () => {
    // 1302 × 1296 pixels of sprites: 282 510 corners, within the budget.
    const sheet = spriteSheet(93, 92)
    const plain = analyzeImage(sheet)
    expect(plain.pixelCorners).toBe(282_510)
    expect(recommendSettings(plain).profileId).toBe('pixel-art')
    // Around the central 1024², where the grid is read, every pixel differs
    // from its neighbors: the same grid, and 814 366 corners.
    const x0 = Math.floor((sheet.width - 1024) / 2)
    const y0 = Math.floor((sheet.height - 1024) / 2)
    const three = [SHEET_GROUND, SHEET_EYE, SHEET_OUTLINE]
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        if (x >= x0 && x < x0 + 1024 && y >= y0 && y < y0 + 1024) continue
        const c = three[(x + 2 * y) % 3]
        setPixel(sheet, x, y, c[0], c[1], c[2])
      }
    }
    const dense = analyzeImage(sheet)
    expect(dense.pixelGrid).toBe(true)
    expect(dense.meanRegionArea).toBe(plain.meanRegionArea)
    expect(dense.pixelCorners).toBe(814_366)
    const rec = recommendSettings(dense)
    expect(rec.profileId).not.toBe('pixel-art')
    expect(rec.rationaleKeys[0]).toEqual({ code: 'pixelGridLarge' })
  })

  it('claims an exact palette only on a counted canvas', () => {
    // The pixel-art goal on flat art: its colors are not counted, the palette
    // is the sampled estimate and the trace is told as no exact copy.
    const a = analyzeImage(flatLogo())
    expect(a.pixelColors).toBe(0)
    const rec = recommendSettings(a, 'pixel-art')
    expect(rec.profileId).toBe('pixel-art')
    expect(rec.patch.paletteSize).toBe(a.distinctColors)
    expect(rec.rationaleKeys.map((k) => k.code)).not.toContain('pixelExact')
  })

  it('reads the soft steps of a pixel grid: a few near shades are pixel art, shading throughout is not', () => {
    // One sprite in twelve carries two pixels a few levels off its body color.
    const few = analyzeImage(
      spriteSheet(12, 10, {
        extra: (index, body) =>
          index % 12 === 0
            ? [
                [5, 5, body.map((v) => v + 5)],
                [6, 5, body.map((v) => v + 5)],
              ]
            : [],
      }),
    )
    expect(few.softStepShare).toBeGreaterThan(0)
    expect(few.softStepShare).toBeLessThanOrEqual(0.08)
    expect(few.pixelGrid).toBe(true)
    // Every shade six levels under its body color.
    const all = analyzeImage(spriteSheet(12, 10, { shade: (body) => body.map((v) => v - 6) }))
    expect(all.softStepShare).toBeGreaterThan(0.08)
    expect(all.pixelGrid).toBe(false)
    // Eight levels under, 24 summed, each is a shade of its own; 23 summed is not.
    const apart = analyzeImage(spriteSheet(12, 10, { shade: (body) => body.map((v) => v - 8) }))
    expect(apart.softStepShare).toBe(0)
    expect(apart.pixelGrid).toBe(true)
    const near = analyzeImage(
      spriteSheet(12, 10, { shade: (body) => [body[0] - 8, body[1] - 8, body[2] - 7] }),
    )
    expect(near.softStepShare).toBeGreaterThan(0.08)
    expect(near.pixelGrid).toBe(false)
  })

  it('reads the regions of a pixel grid: a few pixels each, or enough of them that small', () => {
    const color = (i: number, j: number): Rgb => far((i * 37 + j * 91) % 40)
    // Tiles of 40 pixels, then of 100.
    const small = analyzeImage(tiles(200, 160, 5, 8, color))
    expect(small.meanRegionArea).toBe(40)
    expect(small.fineRegionShare).toBe(0)
    expect(small.pixelGrid).toBe(true)
    const large = analyzeImage(tiles(200, 160, 10, 10, color))
    expect(large.meanRegionArea).toBe(100)
    expect(large.pixelGrid).toBe(false)
    // Blobs of `side`² on a plain ground, one every `period` pixels.
    const blobs = (side: number, period: number) => {
      const img = createRaster(247, 251)
      fillRaster(img, 30, 60, 90)
      let k = 0
      for (let by = 3; by + side < 251; by += period) {
        for (let bx = 2 + (k % 3); bx + side < 247; bx += period) {
          const c = far(60 + (k++ % 30))
          for (let y = 0; y < side; y++) {
            for (let x = 0; x < side; x++) setPixel(img, bx + x, by + y, c[0], c[1], c[2])
          }
        }
      }
      return analyzeImage(img)
    }
    // Sixteen-pixel blobs over a twentieth of the ground: large regions on
    // average, yet enough of the grid in details.
    const dotted = blobs(4, 17)
    expect(dotted.pixelScale).toBe(1)
    expect(dotted.meanRegionArea).toBeGreaterThan(64)
    expect(dotted.fineRegionShare).toBeGreaterThanOrEqual(0.04)
    expect(dotted.pixelGrid).toBe(true)
    // Sparser, the same blobs are marks on flat art.
    const sparse = blobs(4, 23)
    expect(sparse.fineRegionShare).toBeLessThan(0.04)
    expect(sparse.pixelGrid).toBe(false)
    // As dense, blobs of 25 pixels are no details.
    const coarse = blobs(5, 21)
    expect(coarse.fineRegionShare).toBe(0)
    expect(coarse.pixelGrid).toBe(false)
  })

  it('reads a sheet whose center is empty', () => {
    const sheet = spriteSheet(12, 10)
    for (let y = 38; y < 102; y++) {
      for (let x = 52; x < 116; x++) {
        setPixel(sheet, x, y, SHEET_GROUND[0], SHEET_GROUND[1], SHEET_GROUND[2])
      }
    }
    expect(analyzeImage(sheet).pixelGrid).toBe(true)
  })

  it('keeps large hard-edged shapes, two-color hatching and anti-aliased art off the pixel route', () => {
    // A logo in three hard-edged colors, but painted in large regions.
    const logo = createRaster(360, 240)
    fillRaster(logo, 255, 255, 255)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 360; x++) {
        if (Math.hypot(x + 0.5 - 120, y + 0.5 - 120) <= 80) setPixel(logo, x, y, 210, 30, 40)
        else if (x >= 220 && x < 330 && y >= 60 && y < 180) setPixel(logo, x, y, 20, 60, 160)
      }
    }
    const l = analyzeImage(logo)
    expect(l.meanRegionArea).toBeGreaterThan(64)
    expect(l.pixelGrid).toBe(false)
    expect(recommendSettings(l).profileId).not.toBe('pixel-art')
    // One-pixel hatching in two colors: a scan or a threshold, not a palette.
    const hatch = createRaster(240, 240)
    fillRaster(hatch, 255, 255, 255)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) if ((x + y) % 4 === 0) setPixel(hatch, x, y, 0, 0, 0)
    }
    const hatched = analyzeImage(hatch)
    expect(hatched.pixelArtScore).toBeLessThan(0.7)
    expect(hatched.pixelGrid).toBe(false)
    // Small anti-aliased discs: every rim pixel a blend of the disc and the paper.
    const discs = createRaster(240, 240)
    fillRaster(discs, 255, 255, 255)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) {
        const d = Math.hypot((x % 12) + 0.5 - 6.13, (y % 12) + 0.5 - 5.91)
        const c = Math.max(0, Math.min(1, 4.37 - d))
        if (c > 0)
          setPixel(discs, x, y, mixByte(255, 30, c), mixByte(255, 90, c), mixByte(255, 200, c))
      }
    }
    const d = analyzeImage(discs)
    expect(d.gridRimColors * 2).toBeGreaterThan(d.gridColors)
    expect(d.blendRimShare).toBeGreaterThanOrEqual(0.4)
    expect(d.pixelArtScore).toBeLessThan(0.7)
    expect(d.pixelGrid).toBe(false)
  })

  it('keeps art picked from an anti-aliased render off the pixel route', () => {
    // Anti-aliased discs reduced without blending again: two rim pixels in
    // three took the nearer of the disc and the paper, the third kept its
    // blend. Every edge is a pixel sharp, the regions are small and the shades
    // step apart; the blends, most of the palette, tell it. One kept blend in
    // `off` is repainted a color off the line between the disc and the paper.
    const picked = (off: number) => {
      const img = createRaster(240, 240)
      fillRaster(img, 255, 255, 255)
      let rim = 0
      let kept = 0
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 240; x++) {
          const d = Math.hypot((x % 12) + 0.5 - 6.13, (y % 12) + 0.5 - 5.91)
          let c = Math.max(0, Math.min(1, 4.37 - d))
          const blend = c > 0 && c < 1
          if (blend && rim++ % 3 !== 0) c = c < 0.5 ? 0 : 1
          if (c === 0) continue
          if (blend && c < 1 && kept++ % off === 0)
            setPixel(img, x, y, mixByte(255, 30, c), 255, 60)
          else setPixel(img, x, y, mixByte(255, 30, c), mixByte(255, 90, c), mixByte(255, 200, c))
        }
      }
      return analyzeImage(img)
    }
    // A third off the line: under half of the rim pixels are blends, and it is
    // anti-aliased still.
    const a = picked(3)
    expect(a.edgeWidth).toBeLessThanOrEqual(0.8)
    expect(a.softStepShare).toBeLessThanOrEqual(0.08)
    expect(a.meanRegionArea).toBeLessThan(64)
    expect(a.gridRimColors * 2).toBeGreaterThan(a.gridColors)
    expect(a.blendRimShare).toBeGreaterThanOrEqual(0.4)
    expect(a.blendRimShare).toBeLessThan(0.5)
    expect(a.pixelGrid).toBe(false)
    // Half off the line: the rim pixels are details more than blends.
    const b = picked(2)
    expect(b.gridRimColors * 2).toBeGreaterThan(b.gridColors)
    expect(b.blendRimShare).toBeGreaterThan(0.3)
    expect(b.blendRimShare).toBeLessThan(0.4)
    expect(b.pixelGrid).toBe(true)
  })

  it('reads the details of pixel art as no anti-aliasing', () => {
    // Every sprite carries a pixel of a color of its own and, on its left rim,
    // one pixel halfway between its outline and its body: most of the palette
    // never fills a flat corner, and a third of those pixels are blends.
    const mid = (a: Rgb, b: Rgb): Rgb => a.map((v, k) => Math.round((v + b[k]) / 2))
    const detailed = analyzeImage(
      spriteSheet(12, 10, {
        extra: (index, body) => [
          [3, 6, [255, (index * 2) % 250, 255 - index]],
          [1, 5, mid(SHEET_OUTLINE, body)],
        ],
      }),
    )
    expect(detailed.gridRimColors * 2).toBeGreaterThan(detailed.gridColors)
    expect(detailed.blendRimShare).toBeGreaterThan(0.05)
    expect(detailed.blendRimShare).toBeLessThan(0.4)
    expect(detailed.pixelGrid).toBe(true)
    // Four pixels between two tiles' colors on a canvas of three colors: more
    // rim colors than flat ones, all blends, and far too few to rim its edges.
    const color = (i: number, j: number): Rgb => far(((i + 2 * j) % 3) * 50)
    const img = tiles(200, 160, 5, 8, color)
    for (const [k, [i, j]] of [
      [3, 2],
      [9, 5],
      [20, 11],
      [31, 16],
    ].entries()) {
      const a = color(i, j)
      const b = color(i + 1, j)
      const c = a.map((v, ch) => Math.round(v + ((b[ch] - v) * (k + 2)) / 7))
      setPixel(img, i * 5 + 4, j * 8 + 3, c[0], c[1], c[2])
    }
    const lone = analyzeImage(img)
    expect(lone.gridRimColors).toBe(4)
    expect(lone.gridColors).toBe(7)
    expect(lone.blendRimShare).toBeLessThan(0.4)
    expect(lone.pixelGrid).toBe(true)
    // A pixel halfway to the next tile on every tile's edge: every rim pixel a
    // blend, in three colors of a palette of six, half of it flat.
    const hue = (i: number, j: number): Rgb => far([0, 50, 7][(i + 2 * j) % 3])
    const mids = tiles(200, 160, 5, 8, hue)
    for (let j = 0; j < 20; j++) {
      for (let i = 0; i + 1 < 40; i++) {
        const c = mid(hue(i, j), hue(i + 1, j))
        setPixel(mids, i * 5 + 4, j * 8 + 3, c[0], c[1], c[2])
      }
    }
    const blended = analyzeImage(mids)
    expect(blended.gridRimColors).toBe(3)
    expect(blended.gridColors).toBe(6)
    expect(blended.blendRimShare).toBe(1)
    expect(blended.pixelGrid).toBe(true)
  })

  it('keeps art whose soft edges were cut to a few levels off the pixel route', () => {
    // Discs with a ramp three pixels wide, cut to four gray levels: a hard
    // palette in small regions, whose shades are too few to read as blends —
    // but its edges are three pixels wide.
    const img = createRaster(240, 240)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) {
        const d = Math.hypot((x % 16) + 0.5 - 8.13, (y % 16) + 0.5 - 7.91)
        const v = 255 - Math.round(Math.max(0, Math.min(1, (6.4 - d) / 3)) * 3) * 85
        setPixel(img, x, y, v, v, v)
      }
    }
    const a = analyzeImage(img)
    expect(a.gridColors).toBe(4)
    expect(a.gridRimColors * 2).toBeLessThanOrEqual(a.gridColors)
    expect(a.softStepShare).toBe(0)
    expect(a.meanRegionArea).toBeLessThan(64)
    expect(a.edgeWidth).toBeGreaterThan(0.8)
    expect(a.pixelGrid).toBe(false)
    expect(recommendSettings(a).profileId).not.toBe('pixel-art')
  })

  it('needs edges measured a pixel sharp', () => {
    // Tiles of three colors of one lightness: no edge strong enough to
    // measure, and no evidence that they are sharp.
    const level: Rgb[] = [
      [200, 80, 80],
      [70, 130, 70],
      [90, 90, 250],
    ]
    const unmeasured = analyzeImage(tiles(200, 160, 5, 8, (i, j) => level[(i + 2 * j) % 3]))
    expect(unmeasured.gridColors).toBe(3)
    expect(unmeasured.meanRegionArea).toBe(40)
    expect(unmeasured.edgeWidth).toBe(1)
    expect(unmeasured.pixelGrid).toBe(false)
    // Paint in regions of ten pixels with 49 edges in a hundred stepped over
    // two pixels, then with 50.
    const sharp = analyzeImage(shaded(0.49, 6, { of: 100 }))
    expect(sharp.meanRegionArea).toBeGreaterThan(9)
    expect(sharp.edgeWidth).toBeGreaterThan(0.79)
    expect(sharp.edgeWidth).toBeLessThanOrEqual(0.8)
    expect(sharp.pixelGrid).toBe(true)
    const wide = analyzeImage(shaded(0.5, 6, { of: 100 }))
    expect(wide.meanRegionArea).toBeGreaterThan(9)
    expect(wide.edgeWidth).toBeGreaterThan(0.8)
    expect(wide.edgeWidth).toBeLessThan(0.81)
    expect(wide.pixelGrid).toBe(false)
  })

  it('reads paint shaded pixel by pixel through its wider edges', () => {
    // Regions of seven pixels, every color flat somewhere, over half of the
    // edges stepped over two pixels.
    const portraits = analyzeImage(shaded(0.55, 4))
    expect(portraits.edgeWidth).toBeGreaterThan(0.84)
    expect(portraits.edgeWidth).toBeLessThanOrEqual(0.86)
    expect(portraits.meanRegionArea).toBeGreaterThan(6)
    expect(portraits.meanRegionArea).toBeLessThanOrEqual(8)
    expect(portraits.fineRegionShare).toBeGreaterThanOrEqual(0.3)
    expect(portraits.gridRimColors).toBe(0)
    expect(portraits.pixelGrid).toBe(true)
    expect(recommendSettings(portraits).rationaleKeys[0]).toEqual({ code: 'pickPixelGrid' })
    // More of the edges stepped: wider than shading reads.
    const soft = analyzeImage(shaded(0.6, 4))
    expect(soft.edgeWidth).toBeGreaterThan(0.86)
    expect(soft.edgeWidth).toBeLessThan(0.9)
    expect(soft.meanRegionArea).toBeLessThanOrEqual(8)
    expect(soft.pixelGrid).toBe(false)
    // Plateaus a pixel longer: regions of nearly nine pixels are no such paint.
    const coarse = analyzeImage(shaded(0.5, 5))
    expect(coarse.meanRegionArea).toBeGreaterThan(8)
    expect(coarse.meanRegionArea).toBeLessThan(9)
    expect(coarse.fineRegionShare).toBeGreaterThanOrEqual(0.3)
    expect(coarse.edgeWidth).toBeGreaterThan(0.8)
    expect(coarse.edgeWidth).toBeLessThanOrEqual(0.86)
    expect(coarse.pixelGrid).toBe(false)
    // The same paint over a large flat field, single pixels keeping the mean
    // region small: too little of the canvas is fine, then just enough.
    const field = analyzeImage(shaded(0.55, 4, { speckle: 100, flat: 708 }))
    expect(field.meanRegionArea).toBeLessThanOrEqual(8)
    expect(field.fineRegionShare).toBeLessThan(0.3)
    expect(field.fineRegionShare).toBeGreaterThan(0.25)
    expect(field.edgeWidth).toBeLessThanOrEqual(0.86)
    expect(field.pixelGrid).toBe(false)
    const less = analyzeImage(shaded(0.55, 4, { speckle: 100, flat: 600 }))
    expect(less.fineRegionShare).toBeGreaterThanOrEqual(0.3)
    expect(less.fineRegionShare).toBeLessThan(0.35)
    expect(less.pixelGrid).toBe(true)
    // Colors that never fill a flat corner: a quarter of the palette at most.
    const two = analyzeImage(shaded(0.55, 4, { lone: 2 }))
    expect(two.gridColors).toBe(8)
    expect(two.gridRimColors).toBe(2)
    expect(two.pixelGrid).toBe(true)
    const three = analyzeImage(shaded(0.55, 4, { lone: 3 }))
    expect(three.gridColors).toBe(9)
    expect(three.gridRimColors).toBe(3)
    expect(three.edgeWidth).toBe(two.edgeWidth)
    expect(three.pixelGrid).toBe(false)
  })

  it('honors an explicit goal profile', () => {
    const rec = recommendSettings(analyzeImage(flatLogo()), 'vinyl-cut')
    expect(rec.profileId).toBe('vinyl-cut')
    expect(rec.patch.unit).toBe('mm')
  })

  it('routes a grayscale photo to the photo profile in grayscale mode', () => {
    const rec = recommendSettings(analyzeImage(grayPhoto()))
    expect(rec.profileId).toBe('photo')
    expect(rec.patch.mode).toBe('grayscale')
  })

  it('routes an achromatic high-contrast sketch to B&W', () => {
    const rec = recommendSettings(analyzeImage(inkOnWhite()))
    expect(rec.profileId).toBe('bw-sketch')
    expect(rec.patch.mode).toBe('bw')
  })

  it('thresholds clean two-tone art at half coverage between its tones and paints its measured ink', () => {
    const rec = recommendSettings(analyzeImage(inkOnTransparent()))
    expect(rec.profileId).toBe('bw-sketch')
    expect(rec.patch.thresholdMode).toBe('fixed')
    // Black on white blends linearly in encoded values: half coverage is the
    // gray at encoded luma ½, lightness ≈ 0.6 — not the lightness midpoint 0.5,
    // which cuts every anti-aliased edge at 61 % coverage and insets the outline.
    expect(rec.patch.threshold).toBeGreaterThanOrEqual(150)
    expect(rec.patch.threshold).toBeLessThanOrEqual(155)
    expect(rec.patch.fillColor).toBe('#000000')
    // Its edges are measured finer than a tenth of a pixel: two decimals keep them.
    expect(rec.patch.precision).toBe(2)
    // Anti-aliased transparency: the cut sits at half coverage.
    expect(rec.patch.alphaThreshold).toBe(128)
    // Ink that is not black is painted as measured.
    expect(recommendSettings(analyzeImage(inkOnWhite())).patch.fillColor).toBe('#0c0c0c')
  })

  it('keeps art with a flat third tone out of B&W, which could keep only one ink', () => {
    const rec = recommendSettings(analyzeImage(grayFillBlackOutline()))
    expect(rec.profileId).not.toBe('bw-sketch')
    expect(rec.patch.mode).not.toBe('bw')
  })

  it('cuts at half coverage even with translucent content (kept as faces with opacity)', () => {
    // The engine emits translucent interiors as faces with opacity, so the
    // half-coverage cut serves opaque and translucent alpha alike — no guard.
    const rec = recommendSettings(analyzeImage(inkWithSoftShadow()))
    expect(rec.patch.background).toBe('transparent')
    expect(rec.patch.alphaThreshold).toBe(128)
    expect(rec.rationaleKeys.some((k) => k.code === 'alphaEdge')).toBe(true)
  })

  it('keeps a clean gray icon in its own flat inks, not grayscale tonal layers', () => {
    // A gray printer icon: an outlined body and two paper sheets in flat grays
    // with anti-aliased rims, on a transparent ground and flattened onto white.
    const icon = (opaque: boolean) => {
      const img = createRaster(128, 128)
      if (opaque) fillRaster(img, 255, 255, 255)
      else fillRaster(img, 0, 0, 0, 0)
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const box = (x0: number, y0: number, x1: number, y1: number) =>
            Math.max(
              0,
              Math.min(1, Math.min(x + 0.5 - x0, x1 - x - 0.5, y + 0.5 - y0, y1 - y - 0.5) + 0.5),
            )
          const outer = Math.max(
            box(14.3, 50.6, 113.7, 96.2),
            box(34.4, 18.3, 93.6, 51),
            box(34.4, 80.2, 93.6, 112.7),
          )
          if (outer <= 0) continue
          const inner = Math.max(
            box(17.3, 53.6, 110.7, 93.2),
            box(37.4, 21.3, 90.6, 48),
            box(37.4, 83.2, 90.6, 109.7),
          )
          const g = 70 * (1 - inner) + (y > 80 ? 235 : 160) * inner
          if (opaque) {
            const v = Math.round(g * outer + 255 * (1 - outer))
            setPixel(img, x, y, v, v, v)
          } else {
            const v = Math.round(g)
            setPixel(img, x, y, v, v, v, Math.round(outer * 255))
          }
        }
      }
      return img
    }
    for (const opaque of [false, true]) {
      const rec = recommendSettings(analyzeImage(icon(opaque)))
      expect(rec.patch.mode, `opaque ${opaque}`).not.toBe('grayscale')
    }
  })

  it('traces a shaded achromatic line drawing (not two-tone) as grayscale, not over-inked B&W', () => {
    const a = analyzeImage(inkDrawing())
    // The tell: real mid-gray (not two-tone) with no color — bw would flood its
    // hatching solid black, so it must trace as grayscale tonal layers instead.
    expect(a.twoToneCoverage).toBeLessThan(0.92)
    expect(a.colorfulness).toBeLessThan(0.03)
    const rec = recommendSettings(a)
    expect(rec.profileId).not.toBe('bw-sketch')
    expect(rec.patch.mode).toBe('grayscale')
    // A small tone count posterizes the paper texture instead of tracing it.
    expect(rec.patch.paletteSize).toBeLessThanOrEqual(6)
    expect(rec.patch.autoPaletteSize).toBe(false)
  })

  it('keeps a saturated two-tone mark in color rather than B&W', () => {
    const rec = recommendSettings(analyzeImage(navyOnWhite()))
    expect(rec.profileId).not.toBe('bw-sketch')
    expect(['logo', 'illustration']).toContain(rec.profileId)
  })

  it('scopes the grayscale ink reroute to bright-paper line art — other inputs are untouched', () => {
    // The reroute must fire only for achromatic bright-paper line art; every
    // other input keeps the exact routing (profile + mode) it had before it
    // existed, so their traced output stays byte-identical.
    const cases: [ReturnType<typeof flatLogo>, string, string][] = [
      [flatLogo(), 'logo', 'color'],
      [navyOnWhite(), 'logo', 'color'],
      [grayPhoto(), 'photo', 'grayscale'], // mid-tone gray photo, not bright paper
      [compressedFlat(), 'illustration', 'color'],
      [inkOnWhite(), 'bw-sketch', 'bw'], // genuinely bilevel — still B&W
    ]
    for (const [img, profileId, mode] of cases) {
      const rec = recommendSettings(analyzeImage(img))
      expect(rec.profileId).toBe(profileId)
      expect(rec.patch.mode).toBe(mode)
    }
  })

  it('keeps anti-aliased flat art as a color illustration, not a photo', () => {
    const a = analyzeImage(antialiasedField())
    // The adversarial condition: it scores as photographic, yet its flat
    // interiors mark it as clean art — the flat-art veto must win.
    expect(a.photoScore).toBeGreaterThan(0.6)
    expect(a.flatDensity).toBeGreaterThan(0.15)
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.mode).toBe('color')
    expect(rec.patch.denoise).not.toBe('bilateral') // crisp edges, not photo blur
    // Region growing (not global quantization) so the anti-aliased edges never
    // invent a third rim color; the profile's speck floor stands.
    expect(rec.patch.segmentation).toBe('regions')
    expect(rec.patch.minRegionArea).toBe(getProfile('illustration').patch.minRegionArea)
  })

  it('routes a block-noisy cartoon to region growing as an illustration, not a photo', () => {
    const a = analyzeImage(noisyCartoon())
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.segmentation).toBe('regions')
    expect(rec.patch.denoise).not.toBe('bilateral')
    expect(rec.patch.blurRadius ?? 0).toBe(0)
  })

  it('traces a cartoon on a 2× enlarged copy when the enlargement fits the budget', () => {
    const a = analyzeImage(noisyCartoon())
    const rec = recommendSettings(a)
    expect(rec.patch.supersample).toBe(2)
    expect(rec.rationaleKeys.map((k) => k.code)).toContain('cartoonSupersample')
    // A large poster is fitted to 1600 px first, which leaves room for the enlargement.
    const poster = recommendSettings({ ...a, width: 1680, height: 2500, pixels: 4_200_000 })
    expect(poster.patch.maxDimension).toBe(1600)
    expect(poster.patch.supersample).toBe(2)
    // Edges spread wider than a native render's carry no detail to recover.
    expect(recommendSettings({ ...a, edgeWidth: 2.1 }).patch.supersample).toBeUndefined()
  })

  it('does not route a gradient-on-flat-background to region growing (single-color collapse)', () => {
    const a = analyzeImage(gradientOnFlat())
    // The flat white margin clears the flat-art density threshold on its own...
    expect(a.flatDensity).toBeGreaterThan(0.15)
    // ...but the swatch is all soft ramp, so micro-gradient texture is not
    // dominated by the flat interiors — the tell that separates it from real
    // clean flat art (whose ramps sit only along edges).
    expect(a.microGradientDensity).toBeGreaterThanOrEqual(a.flatDensity)
    // So it must NOT be sent to region growing, which floods the ramp into one
    // region painted the mean color. Global quantization keeps the gradient's
    // colors as distinct posterized bands.
    const rec = recommendSettings(a)
    expect(rec.patch.segmentation).not.toBe('regions')
  })

  it('keeps a colored subject on a black backdrop in color, not grayscale', () => {
    const rec = recommendSettings(analyzeImage(coloredOnBlack()))
    expect(rec.patch.mode).not.toBe('grayscale')
  })

  it('cleans up a degraded flat graphic instead of posterizing it as a photo', () => {
    const rec = recommendSettings(analyzeImage(compressedFlat()))
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.denoise).toBe('bilateral')
    expect(rec.patch.autoPaletteSize).toBe(true)
    expect(rec.patch.minRegionArea).toBeGreaterThanOrEqual(24)
  })
})

describe('recommendSettings — drawings on toned paper', () => {
  it('traces a drawing on toned paper in its own paper and ink colors, unblurred', () => {
    const rec = recommendSettings(analyzeImage(tonedSheet('hatched')))
    expect(rec.profileId).toBe('illustration')
    expect(rec.rationaleKeys.some((k) => k.code === 'pickTonedInk')).toBe(true)
    expect(rec.patch.mode).toBe('color')
    expect(rec.patch.segmentation).toBe('quantize')
    // Hatching carries mid-tones, so the palette keeps every entry for them.
    expect(rec.patch.paletteSize).toBe(8)
    expect(rec.patch.autoPaletteSize).toBe(false)
    expect(rec.patch.denoise).toBe('bilateral')
    expect(rec.patch.blurRadius).toBe(0)
    expect(rec.patch.minRegionArea).toBe(4)
    // The classic chain, at native size.
    expect(rec.patch.geometry).toBeUndefined()
    expect(rec.patch.maxDimension).toBeUndefined()
  })

  it('folds the palette of clean two-tone lines on toned paper', () => {
    const rec = recommendSettings(analyzeImage(tonedSheet('lines')))
    expect(rec.rationaleKeys.some((k) => k.code === 'pickTonedInk')).toBe(true)
    expect(rec.patch.autoPaletteSize).toBe(true)
    expect(rec.rationaleKeys.some((k) => k.code === 'tonedTwoTone')).toBe(true)
  })

  it('leaves a mounted sepia picture, a colored print and gray paper to their own routes', () => {
    for (const kind of ['photo', 'print', 'gray'] as const) {
      const rec = recommendSettings(analyzeImage(tonedSheet(kind)))
      expect(rec.rationaleKeys.some((k) => k.code === 'pickTonedInk')).toBe(false)
    }
  })

  // A drawing on toned paper as measured; each override fails one test.
  const toned = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
    width: 760,
    height: 540,
    pixels: 410_400,
    hasAlpha: false,
    distinctColors: 20000,
    rimColors: 19000,
    entropyBits: 8,
    edgeDensity: 0.1,
    microGradientDensity: 0.8,
    flatDensity: 0.005,
    flatArea: 0.4,
    rampArea: 0,
    fineArea: 0.1,
    twoToneCoverage: 0.68,
    photoScore: 1,
    pixelArtScore: 0,
    pixelScale: 1,
    gridColors: 257,
    gridRimColors: 257,
    blendRimShare: 1,
    fineRegionShare: 0,
    softStepShare: 1,
    meanRegionArea: 410_400,
    pixelGrid: false,
    pixelColors: 0,
    pixelCorners: 0,
    dominantHex: ['#d0b090', '#f0d0b0'],
    meanLightness: 0.78,
    contrast: 0.16,
    colorfulness: 0.047,
    coloredFraction: 0.6,
    minorTonesArea: 0,
    inkHex: '#dab999',
    paperHex: '#e5c9ab',
    edgeWidth: 1.25,
    groundHex: '#e5c8a9',
    groundLightness: 0.85,
    groundChroma: 0.053,
    groundSpread: 0.023,
    groundShare: 0.62,
    markHex: '#39332e',
    markLightness: 0.33,
    toneAxisResidual: 0.011,
    midToneShare: 0.1,
    midToneArea: 0.003,
    ...over,
  })
  const caught = (a: ImageAnalysis) =>
    recommendSettings(a).rationaleKeys.some((k) => k.code === 'pickTonedInk')

  it('catches the measured drawing and no near variant of it', () => {
    expect(caught(toned())).toBe(true)
    // Smooth mid-tone areas: a photograph or a film still, mounted or not.
    expect(caught(toned({ midToneArea: 0.04 }))).toBe(false)
    // Broad tones around the ground: an unmounted photograph.
    expect(caught(toned({ groundSpread: 0.13 }))).toBe(false)
    // Off the paper–ink line: a colored print on the same paper.
    expect(caught(toned({ toneAxisResidual: 0.035 }))).toBe(false)
    // A white or a gray ground.
    expect(caught(toned({ groundLightness: 0.99, groundChroma: 0.02 }))).toBe(false)
    expect(caught(toned({ groundChroma: 0.004 }))).toBe(false)
    // No mark clearly darker than the paper.
    expect(caught(toned({ markLightness: 0.7 }))).toBe(false)
    // A paper peak too small to be the sheet.
    expect(caught(toned({ groundShare: 0.2 }))).toBe(false)
    // Transparency, or clean flat art.
    expect(caught(toned({ hasAlpha: true }))).toBe(false)
    expect(caught(toned({ flatDensity: 0.6, microGradientDensity: 0.2 }))).toBe(false)
  })

  it('applies only to the automatic choice', () => {
    const rec = recommendSettings(toned(), 'photo')
    expect(rec.profileId).toBe('photo')
    expect(rec.rationaleKeys.some((k) => k.code === 'tonedInk')).toBe(false)
  })
})

describe('recommendSettings — ink scans on white paper', () => {
  // A JPEG'd pen-and-ink cover (the measures of a Beardsley print): white paper
  // and black ink cover most of it, but its large solid blacks pull the mean
  // lightness under the bright-paper bound, and JPEG spreads its two tones over
  // 256 grays, so it is not cleanly bilevel.
  const inkPrint = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
    width: 501,
    height: 777,
    pixels: 389_277,
    hasAlpha: false,
    distinctColors: 256,
    rimColors: 199,
    entropyBits: 2.37,
    edgeDensity: 0.21,
    microGradientDensity: 0.45,
    flatDensity: 0.12,
    flatArea: 0.55,
    rampArea: 0,
    fineArea: 0.043,
    twoToneCoverage: 0.86,
    photoScore: 0.99,
    pixelArtScore: 0,
    pixelScale: 1,
    gridColors: 257,
    gridRimColors: 257,
    blendRimShare: 1,
    fineRegionShare: 0,
    softStepShare: 1,
    meanRegionArea: 389_277,
    pixelGrid: false,
    pixelColors: 0,
    pixelCorners: 0,
    dominantHex: ['#f0f0f0', '#101010', '#303030', '#d0d0d0'],
    meanLightness: 0.59,
    contrast: 0.37,
    colorfulness: 0,
    coloredFraction: 0,
    minorTonesArea: 0.008,
    inkHex: '#1b1b1b',
    paperHex: '#fdfdfd',
    edgeWidth: 1.07,
    groundHex: '#fdfdfd',
    groundLightness: 0.99,
    groundChroma: 0,
    groundSpread: 0.012,
    groundShare: 0.3,
    markHex: '#131313',
    markLightness: 0.18,
    toneAxisResidual: 0,
    midToneShare: 0.06,
    midToneArea: 0,
    ...over,
  })

  it('traces an ink print with large solid blacks as a tonal ink scan, not a photo', () => {
    const rec = recommendSettings(inkPrint())
    expect(rec.profileId).toBe('illustration')
    expect(rec.rationaleKeys.some((k) => k.code === 'pickInkGrayscale')).toBe(true)
    expect(rec.patch.mode).toBe('grayscale')
    expect(rec.patch.paletteSize).toBe(4)
    // Photo cleanup would blur and merge its hairlines away.
    expect(rec.patch.denoise).toBeUndefined()
  })

  it('keeps hairline fragments of a tonal ink scan: a speck floor of a few pixels', () => {
    const rec = recommendSettings(inkPrint({ meanLightness: 0.72 }))
    expect(rec.patch.mode).toBe('grayscale')
    expect(rec.patch.minRegionArea).toBe(4)
  })

  it('needs white paper, black ink and two dominant tones for a dark print to read as a scan', () => {
    // A grayscale photo spreads over many tones; a page that is mostly ink, gray
    // paper or gray ink is not a print on white paper either.
    const profiles = [
      { twoToneCoverage: 0.55 },
      { meanLightness: 0.42 },
      { paperHex: '#c8c8c8' },
      { inkHex: '#727272' },
    ].map((over: Partial<ImageAnalysis>) => recommendSettings(inkPrint(over)).profileId)
    expect(profiles).toEqual(['photo', 'photo', 'photo', 'photo'])
  })

  it('leaves a print with flat interiors to region growing', () => {
    // The same cover after a stronger JPEG pass: enough exactly-flat interior
    // for region growing to seed from, which keeps it on the cartoon route.
    const rec = recommendSettings(
      inkPrint({ flatDensity: 0.21, flatArea: 0.52, fineArea: 0.037, microGradientDensity: 0.42 }),
    )
    expect(rec.patch.segmentation).toBe('regions')
    expect(rec.patch.mode).toBe('color')
  })
})

describe('recommendSettings — printed page scans', () => {
  // A colored newsprint comic scanned from yellowed paper (the measures of a
  // Bécassine page): paper grain and JPEG leave no exactly-flat pixel and no
  // smooth ramp, its edges are busy, and its colors stray off the paper–ink
  // line, so it is neither a drawing on toned paper nor flat art.
  const printed = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
    width: 1001,
    height: 446,
    pixels: 446_446,
    hasAlpha: false,
    distinctColors: 65536,
    rimColors: 65254,
    entropyBits: 5.78,
    edgeDensity: 0.217,
    microGradientDensity: 0.745,
    flatDensity: 0.0012,
    flatArea: 0.37,
    rampArea: 0.001,
    fineArea: 0.064,
    twoToneCoverage: 0.42,
    photoScore: 1,
    pixelArtScore: 0,
    pixelScale: 1,
    gridColors: 257,
    gridRimColors: 257,
    blendRimShare: 1,
    fineRegionShare: 0,
    softStepShare: 1,
    meanRegionArea: 446_446,
    pixelGrid: false,
    pixelColors: 0,
    pixelCorners: 0,
    dominantHex: ['#d0d0b0', '#d0b0b0', '#b0b0b0', '#d0b090', '#101010', '#707050'],
    meanLightness: 0.67,
    contrast: 0.2,
    colorfulness: 0.032,
    coloredFraction: 0.098,
    minorTonesArea: 0.0008,
    inkHex: '#c9b9a6',
    paperHex: '#d6cbb6',
    edgeWidth: 1.44,
    groundHex: '#d3c9b3',
    groundLightness: 0.84,
    groundChroma: 0.033,
    groundSpread: 0.035,
    groundShare: 0.37,
    markHex: '#262720',
    markLightness: 0.27,
    toneAxisResidual: 0.032,
    midToneShare: 0.25,
    midToneArea: 0.019,
    ...over,
  })
  const codes = (a: ImageAnalysis, goal?: 'photo') =>
    recommendSettings(a, goal).rationaleKeys.map((k) => k.code)

  it('keeps the lettering and hatching of a printed page scan with a small speck floor', () => {
    const rec = recommendSettings(printed())
    expect(rec.profileId).toBe('photo')
    expect(codes(printed())).toContain('printScan')
    expect(codes(printed())).not.toContain('pickTonedInk')
    expect(rec.patch.minRegionArea).toBe(4)
    // Everything else stays the photo route's: color, denoised, posterized.
    expect(rec.patch.mode).toBe('color')
    expect(rec.patch.denoise).toBe('bilateral')
    expect(rec.patch.paletteSize).toBe(32)
    expect(rec.patch.autoPaletteSize).toBe(true)
  })

  it('needs busy edges, no flat interiors, no smooth ramp and color', () => {
    for (const over of [
      { edgeDensity: 0.1 },
      { flatDensity: 0.08 },
      { rampArea: 0.2 },
      { colorfulness: 0.01, coloredFraction: 0.01 },
    ]) {
      const rec = recommendSettings(printed(over))
      expect(rec.profileId).toBe('photo')
      expect(codes(printed(over))).not.toContain('printScan')
      // The photo profile's own speck floor.
      expect(rec.patch.minRegionArea).toBe(10)
    }
  })

  it('applies only to the automatic choice', () => {
    expect(codes(printed(), 'photo')).not.toContain('printScan')
    expect(recommendSettings(printed(), 'photo').patch.minRegionArea).toBe(10)
  })
})

describe('recommendSettings — region-growing gates', () => {
  // Clean flat art with many anti-aliased colors and no gradient — the case
  // region growing is for. Overrides flip one gate at a time.
  const flatArt = (over: Partial<ImageAnalysis> = {}): ImageAnalysis => ({
    width: 800,
    height: 600,
    pixels: 480_000,
    hasAlpha: false,
    distinctColors: 8000,
    rimColors: 7900,
    entropyBits: 9,
    edgeDensity: 0.08,
    microGradientDensity: 0.18,
    flatDensity: 0.6,
    flatArea: 0.8,
    rampArea: 0.02,
    fineArea: 0.005,
    twoToneCoverage: 0.3,
    photoScore: 0.7,
    pixelArtScore: 0,
    pixelScale: 1,
    gridColors: 257,
    gridRimColors: 257,
    blendRimShare: 1,
    fineRegionShare: 0,
    softStepShare: 1,
    meanRegionArea: 480_000,
    pixelGrid: false,
    pixelColors: 0,
    pixelCorners: 0,
    dominantHex: ['#808080'],
    meanLightness: 0.6,
    contrast: 0.2,
    colorfulness: 0.1,
    coloredFraction: 0.5,
    minorTonesArea: 0,
    inkHex: '#000000',
    paperHex: '#ffffff',
    edgeWidth: 1,
    groundHex: '#ffffff',
    groundLightness: 1,
    groundChroma: 0,
    groundSpread: 0.01,
    groundShare: 0.5,
    markHex: '#000000',
    markLightness: 0,
    toneAxisResidual: 0,
    midToneShare: 0,
    midToneArea: 0,
    ...over,
  })

  it('traces a source only slightly above the default size at its own size', () => {
    // Under the default trace size nothing changes; just above it, a mild
    // shrink would thin strokes below the segmentation's core size, so the
    // source keeps its size; well past it, the speed cap applies.
    expect(recommendSettings(flatArt()).patch.maxDimension).toBeUndefined()
    const mild = recommendSettings(flatArt({ width: 1800, height: 1120, pixels: 2_016_000 }))
    expect(mild.patch.maxDimension).toBe(1800)
    expect(mild.rationaleKeys.some((k) => k.code === 'nativeSize')).toBe(true)
    const tall = recommendSettings(flatArt({ width: 900, height: 2048, pixels: 1_843_200 }))
    expect(tall.patch.maxDimension).toBe(2048)
    const large = recommendSettings(flatArt({ width: 3000, height: 2000, pixels: 6_000_000 }))
    expect(large.patch.maxDimension).toBe(1600)
    expect(large.rationaleKeys.some((k) => k.code === 'largeSource')).toBe(true)
    expect(large.rationaleKeys.some((k) => k.code === 'nativeSize')).toBe(false)
    const wide = recommendSettings(flatArt({ width: 2600, height: 1000, pixels: 2_600_000 }))
    expect(wide.patch.maxDimension).toBeUndefined()
  })

  it('gives noise-free flat art a palette entry for every flat color it fills', () => {
    // A vector render: every fill is exact, so the colors that fill a flat run
    // are the drawing's own. A budget below their count would merge fills.
    const mosaic = flatArt({ flatDensity: 0.95, distinctColors: 900, rimColors: 860 })
    expect(recommendSettings(mosaic).patch.paletteSize).toBe(40)
    // A two-color shape's rim blends get no entries of their own either: a band
    // of them around the shape would hold its edge off the anti-aliased boundary.
    const shape = flatArt({ flatDensity: 0.97, distinctColors: 13, rimColors: 11 })
    expect(recommendSettings(shape).patch.paletteSize).toBe(2)
    // Noisy art gets no such count: its flat runs are few and meaningless.
    expect(
      recommendSettings(flatArt({ distinctColors: 900, rimColors: 860 })).patch.paletteSize,
    ).toBe(24)
  })

  it('grows regions for many-color, gradient-free flat art', () => {
    expect(recommendSettings(flatArt()).patch.segmentation).toBe('regions')
  })

  it('keeps a hard-edged pixel palette on quantization (no anti-aliased rims to protect)', () => {
    // Every pixel of a pixel-art palette already is a palette color, so
    // per-pixel quantization traces it exactly; region growing would only lose
    // its smallest features. Two tells: few distinct colors, and edges with no
    // soft rim beside them.
    expect(recommendSettings(flatArt({ distinctColors: 40 })).patch.segmentation).not.toBe(
      'regions',
    )
    expect(
      recommendSettings(flatArt({ microGradientDensity: 0.004, edgeDensity: 0.3 })).patch
        .segmentation,
    ).not.toBe('regions')
  })

  it('keeps gradient-heavy flat art on quantization (region growing floods ramps)', () => {
    // A smooth ramp has no flat interior to seed a marker, so region growing
    // floods it into one mean color. Once ramps reach half the flat area the
    // gradient is the picture, and quantization keeps it as bands.
    const a = flatArt({ flatArea: 0.45, rampArea: 0.35 })
    expect(recommendSettings(a).patch.segmentation).not.toBe('regions')
    // A minor ramp — a shaded cheek on a flat cartoon — does not change the route.
    expect(recommendSettings(flatArt({ rampArea: 0.2 })).patch.segmentation).toBe('regions')
  })

  it('keeps sprite-fine detail on quantization (fills too small for a flat core)', () => {
    // Several percent of the pixels in fills region growing would fold away.
    expect(recommendSettings(flatArt({ fineArea: 0.06 })).patch.segmentation).not.toBe('regions')
  })

  it('grows regions for a compressed cartoon and keeps it off the photo route', () => {
    // JPEG noise makes a cartoon score photographic and roughens its
    // micro-gradients past any fixed density, but its fills stay flat area.
    const a = flatArt({
      photoScore: 0.9,
      microGradientDensity: 0.3,
      flatDensity: 0.5,
      distinctColors: 30000,
    })
    const rec = recommendSettings(a)
    expect(rec.profileId).toBe('illustration')
    expect(rec.patch.segmentation).toBe('regions')
    expect(rec.patch.denoise).toBeUndefined()
  })

  it('keeps a photograph with a large smooth sky off region growing', () => {
    // Smooth, but never exactly flat: sensor noise leaves no identical neighbors.
    const a = flatArt({ flatDensity: 0.05, flatArea: 0.6, rampArea: 0.1, photoScore: 1 })
    expect(recommendSettings(a).patch.segmentation).not.toBe('regions')
  })
})

describe('recommendSettings — geometry chain', () => {
  const codes = (rec: { rationaleKeys: { code: string }[] }) => rec.rationaleKeys.map((k) => k.code)

  it('traces stacked non-cartoon color art on the planar chain with the ink front end and gradients', () => {
    const rec = recommendSettings(analyzeImage(inkWithSoftShadow()))
    expect(rec.patch.layering).toBe('stacked')
    expect(rec.patch.geometry).toBe('planar')
    expect(rec.patch.frontEnd).toBe('ink')
    expect(rec.patch.gradients).toBe(true)
    expect(codes(rec)).toContain('planarInk')
    expect(codes(rec)).not.toContain('planarCartoon')
  })

  it('traces a cartoon on the planar chain with the ink front end', () => {
    for (const img of [antialiasedField(), noisyCartoon()]) {
      const rec = recommendSettings(analyzeImage(img))
      expect(rec.patch.segmentation).toBe('regions')
      expect(rec.patch.geometry).toBe('planar')
      expect(rec.patch.frontEnd).toBe('ink')
      expect(rec.patch.gradients).toBe(true)
      expect(codes(rec)).toContain('planarCartoon')
      expect(codes(rec)).not.toContain('planarInk')
    }
  })

  it('traces ink-front-end art past the planar pixel budget at the budget size', () => {
    const a = analyzeImage(inkWithSoftShadow())
    const small = recommendSettings({ ...a, width: 640, height: 640, pixels: 409_600 })
    expect(small.patch.geometry).toBe('planar')
    expect(small.patch.maxDimension).toBeUndefined()
    for (const [width, height] of [
      [768, 538],
      [918, 643],
      [1500, 1500],
    ]) {
      const rec = recommendSettings({ ...a, width, height, pixels: width * height })
      expect(rec.patch.geometry).toBe('planar')
      expect(rec.patch.frontEnd).toBe('ink')
      expect(codes(rec)).toContain('planarInk')
      // The traced size as the engine rounds it: within the budget, give or take a row.
      const side = rec.patch.maxDimension as number
      const fit = side / Math.max(width, height)
      expect(Math.round(width * fit) * Math.round(height * fit)).toBeLessThanOrEqual(409_600 + side)
      expect(width * height * ((side + 1) / Math.max(width, height)) ** 2).toBeGreaterThan(409_600)
    }
  })

  it('keeps black & white art past the planar pixel budget on the classic chain', () => {
    const a = analyzeImage(inkOnWhite())
    const large = recommendSettings({ ...a, width: 918, height: 643, pixels: 590_274 })
    expect(large.patch.mode).toBe('bw')
    expect(large.patch.geometry).toBeUndefined()
    expect(codes(large)).not.toContain('planarBw')
  })

  it('keeps a cartoon larger than an icon on the classic chain', () => {
    const a = analyzeImage(noisyCartoon())
    expect(Math.max(a.width, a.height)).toBeLessThanOrEqual(512)
    const icon = recommendSettings({ ...a, width: 512, height: 400, pixels: 204_800 })
    expect(icon.patch.geometry).toBe('planar')
    const large = recommendSettings({ ...a, width: 750, height: 1000, pixels: 750_000 })
    expect(large.patch.segmentation).toBe('regions')
    expect(large.patch.geometry).toBeUndefined()
    expect(large.patch.frontEnd).toBeUndefined()
    expect(codes(large)).not.toContain('planarCartoon')
  })

  it('traces black & white art on the planar chain without choosing a front end', () => {
    const rec = recommendSettings(analyzeImage(inkOnWhite()))
    expect(rec.patch.mode).toBe('bw')
    expect(rec.patch.geometry).toBe('planar')
    expect(rec.patch.frontEnd).toBeUndefined()
    expect(rec.patch.gradients).toBeUndefined()
    expect(codes(rec)).toContain('planarBw')
    expect(codes(rec)).not.toContain('planarInk')
    expect(codes(rec)).not.toContain('planarCartoon')
  })

  it('keeps black & white art past the planar pixel budget on the classic chain', () => {
    const a = analyzeImage(inkOnWhite())
    const large = recommendSettings({ ...a, width: 1400, height: 980, pixels: 1_372_000 })
    expect(large.patch.mode).toBe('bw')
    expect(large.patch.geometry).toBeUndefined()
    expect(codes(large)).not.toContain('planarBw')
  })

  it('keeps photos, pixel art, nested and grayscale line art on the classic chain', () => {
    for (const img of [
      noisyPhoto(),
      grayPhoto(),
      compressedFlat(),
      sprite(),
      flatLogo(),
      inkDrawing(),
    ]) {
      const rec = recommendSettings(analyzeImage(img))
      expect(rec.patch.geometry).toBeUndefined()
      expect(rec.patch.frontEnd).toBeUndefined()
      expect(codes(rec)).not.toContain('planarInk')
      expect(codes(rec)).not.toContain('planarCartoon')
      expect(codes(rec)).not.toContain('planarBw')
    }
  })

  it('keeps output grouped by color on the classic chain', () => {
    for (const goal of ['vinyl-cut', 'poster'] as const) {
      const rec = recommendSettings(analyzeImage(inkWithSoftShadow()), goal)
      expect(rec.patch.geometry).toBeUndefined()
    }
  })
})

describe('suggestPalettes', () => {
  it('offers valid, distinct, deterministic palettes for flat art', () => {
    const img = flatLogo()
    const suggestions = suggestPalettes(img)
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    const ids = suggestions.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('exact')
    for (const s of suggestions) {
      expect(s.colors.length).toBeGreaterThanOrEqual(2)
      for (const hex of s.colors) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
    const exact = suggestions.find((s) => s.id === 'exact')!
    expect(exact.colors.length).toBe(3)
    expect(JSON.stringify(suggestPalettes(img))).toBe(JSON.stringify(suggestions))
  })

  it('offers a rich palette for photographic content', () => {
    const suggestions = suggestPalettes(noisyPhoto())
    expect(suggestions.some((s) => s.id === 'rich')).toBe(true)
    expect(suggestions.some((s) => s.id === 'mono')).toBe(true)
  })
})
