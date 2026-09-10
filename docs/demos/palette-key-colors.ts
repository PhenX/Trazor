/**
 * Visual demo: the global-palette path on compressed flat art, with the
 * flat-region seeds and the thin-variant merge off vs. on. A small cartoon
 * (black outlines, a few flat fills, one small distinct detail) is rendered
 * anti-aliased, then JPEG-encoded with the chroma subsampling real encoders
 * use, so the black outlines come back tinted by the color beside them. The
 * page shows the clean scene, the compressed input, and each variant's label
 * map with its palette, scored against the clean scene with the harness's
 * key-color and boundary indicators. Writes a self-contained HTML page next to
 * this file.
 *
 * Run:  npx tsx docs/demos/palette-key-colors.ts
 * Output: docs/demos/palette-key-colors.html
 */
import { writeFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import type { RasterImage } from '@trazor/core'
import { detectEdges, quantize } from '@trazor/raster'
import type { QuantizeOptions } from '@trazor/raster'
import { qualityStats } from '../../scripts/eval/lib'

const W = 320
const H = 240
const SS = 3 // supersampling factor for anti-aliased edges

type Rgb = [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [12, 8, 8]
const ORANGE: Rgb = [236, 144, 61]
const PURPLE: Rgb = [105, 82, 161]
const BLUE: Rgb = [117, 203, 220]
const PINK: Rgb = [218, 174, 148]
const TEAL: Rgb = [4, 180, 170]

/** The scene at supersampled coordinates: outlines a few pixels wide, one small tongue and one small dot. */
function sceneAt(x: number, y: number): Rgb {
  const px = x / SS
  const py = y / SS
  const d = (cx: number, cy: number): number => Math.hypot(px - cx, py - cy)
  // A purple rounded body, shaded darker toward the bottom, with a black outline.
  const body = Math.abs(px - 110) < 60 && Math.abs(py - 130) < 70 ? 1 : 0
  const bodyEdge = Math.abs(px - 110) < 63 && Math.abs(py - 130) < 73 ? 1 : 0
  const shade = Math.max(0, Math.min(1, (py - 100) / 100))
  // An orange head with an outline, a blue eye and a pink tongue.
  const head = d(110, 70)
  const teal = d(250, 60)
  if (teal < 7) return TEAL
  if (teal < 9.5) return BLACK
  if (head < 40) {
    if (d(96, 62) < 9) return BLUE
    if (d(96, 62) < 11.5) return BLACK
    if (Math.abs(px - 118) < 7 && Math.abs(py - 92) < 4) return PINK
    if (Math.abs(px - 118) < 9 && Math.abs(py - 92) < 6) return BLACK
    return ORANGE
  }
  if (head < 43) return BLACK
  if (body)
    return [
      PURPLE[0] * (1 - 0.45 * shade),
      PURPLE[1] * (1 - 0.45 * shade),
      PURPLE[2] * (1 - 0.35 * shade),
    ]
  if (bodyEdge) return BLACK
  // A thin black stroke on white.
  if (Math.abs(py - (0.35 * px + 120)) < 1.2 && px > 180 && px < 300) return BLACK
  return WHITE
}

/** Box-downsampled anti-aliased render of the scene. */
function renderScene(): RasterImage {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sceneAt(x * SS + sx, y * SS + sy)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const i = (y * W + x) * 4
      data[i] = Math.round(r / (SS * SS))
      data[i + 1] = Math.round(g / (SS * SS))
      data[i + 2] = Math.round(b / (SS * SS))
      data[i + 3] = 255
    }
  }
  return { width: W, height: H, data }
}

/**
 * JPEG round trip with 4:2:0 chroma subsampling: the chroma of each 2×2 block is
 * averaged before encoding, as most encoders do, so a color bleeds into the
 * dark outline beside it.
 */
function compress(img: RasterImage, quality: number): RasterImage {
  const { width, height, data } = img
  const sub = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      let cb = 0
      let cr = 0
      let n = 0
      for (let dy = 0; dy < 2 && y + dy < height; dy++) {
        for (let dx = 0; dx < 2 && x + dx < width; dx++) {
          const i = ((y + dy) * width + x + dx) * 4
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
          cb += -0.1687 * r - 0.3313 * g + 0.5 * b
          cr += 0.5 * r - 0.4187 * g - 0.0813 * b
          n++
        }
      }
      cb /= n
      cr /= n
      for (let dy = 0; dy < 2 && y + dy < height; dy++) {
        for (let dx = 0; dx < 2 && x + dx < width; dx++) {
          const i = ((y + dy) * width + x + dx) * 4
          const yy = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          sub[i] = yy + 1.402 * cr
          sub[i + 1] = yy - 0.344136 * cb - 0.714136 * cr
          sub[i + 2] = yy + 1.772 * cb
        }
      }
    }
  }
  const encoded = jpeg.encode({ data: Buffer.from(sub.buffer), width, height }, quality)
  const decoded = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true })
  return { width, height, data: new Uint8ClampedArray(decoded.data) }
}

/** Quantize with the engine's own front-end options; returns the label map painted with its palette. */
function labelRender(
  img: RasterImage,
  variant: Partial<QuantizeOptions>,
): { render: RasterImage; palette: string[] } {
  const edges = detectEdges(img, 40)
  const sampleMask = {
    width: img.width,
    height: img.height,
    data: new Uint8Array(img.width * img.height),
  }
  for (let i = 0; i < sampleMask.data.length; i++) sampleMask.data[i] = edges.data[i] === 0 ? 1 : 0
  const q = quantize(img, {
    k: 12,
    colorSpace: 'oklab',
    quality: 7,
    seed: 0x02f6e2b1,
    sampleMask,
    autoK: true,
    ...variant,
  })
  const data = new Uint8ClampedArray(img.width * img.height * 4)
  for (let i = 0; i < img.width * img.height; i++) {
    const l = q.labels.data[i]
    data[i * 4] = q.paletteRgb[l * 3]
    data[i * 4 + 1] = q.paletteRgb[l * 3 + 1]
    data[i * 4 + 2] = q.paletteRgb[l * 3 + 2]
    data[i * 4 + 3] = 255
  }
  return { render: { width: img.width, height: img.height, data }, palette: q.paletteHex }
}

function dataUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

function swatches(palette: string[]): string {
  return `<div class="pal">${palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}<small>${palette.length} colors</small></div>`
}

const clean = renderScene()
const input = compress(clean, 55)
const variants = [
  { label: 'off: plain k-means++ seeds, every centroid kept', opts: {} },
  {
    label: 'on: flat-region seeds + thin-variant merge',
    opts: { regionSeeds: true, mergeThinVariants: true },
  },
]
const cells = variants.map(({ label, opts }) => {
  const { render, palette } = labelRender(input, opts)
  const q = qualityStats(render, clean)
  return `<figure><img src="${dataUri(render)}" width="${W}" height="${H}" alt="${label}"><figcaption>${label}</figcaption>${swatches(palette)}<small>key ΔE ${q.keyDE.toFixed(4)} (${q.keyMissed}/${q.keyCount} lost) · boundary F ${q.bf.toFixed(3)} (P ${q.bfPrecision.toFixed(3)}, R ${q.bfRecall.toFixed(3)}) · ΔE ${q.mean.toFixed(4)}</small></figure>`
})

const html = `<!doctype html><meta charset="utf8"><title>Global palette on compressed flat art</title>
<style>
  :root{color-scheme:light dark}
  body{font:14px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:20px} p{max-width:70ch}
  .row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
  figure{margin:0} img{width:100%;height:auto;image-rendering:pixelated;border:1px solid #8884;border-radius:6px}
  figcaption{font-weight:600;margin:6px 0 4px} small{display:block;color:#8a8a8a}
  .pal{display:flex;gap:3px;align-items:center;margin:4px 0} .pal span{width:18px;height:18px;border-radius:3px;border:1px solid #8886;display:inline-block}
</style>
<h1>The global palette on compressed flat art</h1>
<p>A cartoon with black outlines, flat fills, a shaded body and one small teal dot, JPEG-encoded at quality 55 with 4:2:0 chroma
subsampling — so each outline comes back tinted by the color beside it — then quantized to at most 12 colors with the
engine's front-end options, at JPEG quality 55 and at most 12 colors. Plain seeding spends palette entries on the tinted outline variants and the outline breaks
into pieces where it crosses from one fill to another; seeding from the flat regions and folding stroke-only variants
back into the ink keeps one black and gives the small dot its own color. Scored against the clean scene.</p>
<div class="row">
  <figure><img src="${dataUri(clean)}" width="${W}" height="${H}" alt="clean scene"><figcaption>clean scene (the reference)</figcaption></figure>
  <figure><img src="${dataUri(input)}" width="${W}" height="${H}" alt="compressed input"><figcaption>JPEG q70 input, chroma subsampled (what is traced)</figcaption></figure>
  ${cells.join('\n  ')}
</div>`
writeFileSync(new URL('./palette-key-colors.html', import.meta.url), html)
console.log('wrote docs/demos/palette-key-colors.html')
