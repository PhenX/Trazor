/**
 * Visual demo: hybrid output. A scene with flat shapes (a sun, a card, a disc)
 * over a smooth noisy gradient sky is traced twice: pure vector (the gradient
 * posterizes into color bands) and hybrid (`hybridEmbed` — flat areas stay
 * vectorized, the source raster is embedded underneath, so the gradient
 * renders exactly while the shapes stay crisp vectors).
 *
 * Run:  npx tsx docs/demos/hybrid.ts
 * Output: docs/demos/hybrid.html
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'
import { mulberry32, normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'

const W = 220
const H = 140

function scene(): RasterImage {
  const rng = mulberry32(5)
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1)
    const r = 255 + (122 - 255) * t
    const g = 217 + (184 - 217) * t
    const b = 160 + (232 - 160) * t
    for (let x = 0; x < W; x++) {
      const n = (rng() - 0.5) * 10
      const i = (y * W + x) * 4
      data[i] = Math.round(r + n)
      data[i + 1] = Math.round(g + n)
      data[i + 2] = Math.round(b + n)
      data[i + 3] = 255
    }
  }
  const put = (x: number, y: number, [r, g, b]: number[]): void => {
    const i = (y * W + x) * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
  // Flat hills silhouette along the bottom.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ridge = 96 + 12 * Math.sin(x / 21) + 6 * Math.sin(x / 7.3)
      if (y > ridge) put(x, y, [47, 109, 79])
    }
  }
  // Flat sun disc.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - 55) ** 2 + (y - 38) ** 2 <= 15 * 15) put(x, y, [255, 179, 71])
    }
  }
  // Flat white card with a teal disc.
  for (let y = 22; y < 62; y++) {
    for (let x = 148; x < 210; x++) put(x, y, [255, 255, 255])
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - 179) ** 2 + (y - 42) ** 2 <= 11 * 11) put(x, y, [14, 127, 140])
    }
  }
  return { width: W, height: H, data }
}

function settings(hybridEmbed: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    paletteSize: 6,
    autoPaletteSize: true,
    layering: 'stacked',
    minRegionArea: 4,
    hybridEmbed,
    dissolveBands: 0,
    colorCoherence: 0,
    curveMode: 'spline',
    optimizeSvg: true,
    precision: 2,
  })
}

const img = scene()
const off = await vectorize(img, settings(false))
const on = await vectorize(img, settings(true))

function render(svg: string): string {
  const r = new Resvg(svg, { background: 'rgba(255,255,255,1)' }).render()
  const png = new PNG({ width: r.width, height: r.height })
  png.data = Buffer.from(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

const aOff = analyzeSvg(off.svg)
const aOn = analyzeSvg(on.svg)
const kb = (n: number): string => (n / 1024).toFixed(0)

const html = `<title>Hybrid output — pure vector vs vector + embedded raster</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--accent:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--accent:#35b7c5;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:56rem;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 1.6rem;font-size:.95rem;max-width:52rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}
  figure{margin:0;text-align:center}
  figcaption{font-weight:600;font-size:.9rem;margin-bottom:.3rem}
  img{width:100%;border:1px solid var(--line);border-radius:8px;background:#fff}
  small{display:block;color:var(--muted);margin-top:.4rem;font-size:.78rem}
  @media(max-width:40rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Hybrid output</h1>
  <p class="sub">A scene with flat shapes over a smooth noisy gradient. Pure vector output posterizes the gradient into color bands — the price of flat fills. The <strong>Hybrid vector + photo</strong> toggle keeps the flat shapes as crisp vectors (the sun, the card, the disc, the hills) and embeds the source raster underneath, so the gradient and noise render exactly. Flat areas stay editable vectors; only the genuinely non-flat regions come from the image. The embed is an uncompressed PNG, so the file grows — the trade for exact gradients.</p>
  <div class="pair">
    <figure>
      <figcaption>Pure vector</figcaption>
      <img src="${render(off.svg)}" alt="pure vector">
      <small>${aOff.nodeCount.toLocaleString()} nodes · ${aOff.colorCount} colors · ${kb(off.svg.length)} KB</small>
    </figure>
    <figure>
      <figcaption>Hybrid — vector + embedded raster</figcaption>
      <img src="${render(on.svg)}" alt="hybrid">
      <small>${aOn.nodeCount.toLocaleString()} nodes · ${aOn.colorCount} colors · ${kb(on.svg.length)} KB</small>
    </figure>
  </div>
</div>`

const outPath = fileURLToPath(new URL('./hybrid.html', import.meta.url))
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(
  `off ${aOff.nodeCount}n ${aOff.colorCount}c ${kb(off.svg.length)}KB | on ${aOn.nodeCount}n ${aOn.colorCount}c ${kb(on.svg.length)}KB`,
)
