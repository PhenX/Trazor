/**
 * Visual demo: illumination flattening before tracing. A smoothly shaded,
 * flat-color scene is traced twice through the real engine — once as-is, once
 * after `flattenIllumination` divides the low-frequency lightness gradient out
 * of the Oklab L channel. Shading makes the quantizer slice each flat region
 * into concentric tone bands (a nest of vector layers); flattening collapses
 * them back, so the same picture traces to far fewer colors, paths and nodes.
 *
 * The built-in scene is deterministic and synthetic (flat saturated tiles under
 * a lit "sphere" and a darkening "tunnel", echoing the 3D peripheral-drift
 * illusion this idea came from). Pass a PNG path to run on a real image instead:
 *
 *   npx tsx docs/demos/flatten-shading.ts                 # synthetic scene
 *   npx tsx docs/demos/flatten-shading.ts path/to/pic.png # a real image
 *
 * Output: docs/demos/flatten-shading.html
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { createRaster, normalizeSettings } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { flattenIllumination, resizeToFit } from '@trazor/raster'

const YELLOW: RGB = [235, 188, 24]
type RGB = [number, number, number]

/** Clamp to [0, 1]. */
function sat(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * A deterministic single-color field under strong, smooth shading — the case
 * this pass is for: a flat fill a designer wants back as *one* color, buried
 * under a soft-box highlight, a diagonal ramp and a vignette (a rendered
 * backdrop, an uneven scan, a gradient a tool baked in). There are no internal
 * color edges, so nothing rings a halo; the only thing varying is lightness. A
 * quantizer has to slice that smooth ramp into concentric tone bands — the
 * topographic-contour artifact — where the flattened field collapses to a
 * couple of colors.
 */
function shadedScene(size = 320): RasterImage {
  const img = createRaster(size, size)
  const half = size * 0.5
  const maxD = Math.hypot(half, half)
  // A soft off-center highlight ("studio softbox").
  const hx = size * 0.34
  const hy = size * 0.32

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distC = Math.hypot(x - half, y - half) / maxD
      const vignette = 0.5 + 0.62 * sat(distC * 1.5) // dark toward center
      const diagonal = 1.16 - 0.3 * ((x + y) / (2 * size)) // top-left → bottom-right
      const distH = Math.hypot(x - hx, y - hy) / maxD
      const highlight = 0.82 + 0.5 * sat(1 - distH * 1.7) // bright blob top-left
      const f = diagonal * vignette * highlight

      const p = (y * size + x) * 4
      img.data[p] = Math.max(0, Math.min(255, Math.round(YELLOW[0] * f)))
      img.data[p + 1] = Math.max(0, Math.min(255, Math.round(YELLOW[1] * f)))
      img.data[p + 2] = Math.max(0, Math.min(255, Math.round(YELLOW[2] * f)))
      img.data[p + 3] = 255
    }
  }
  return img
}

/** Load a PNG into a RasterImage, capped to `cap` px on the long side. */
function loadPng(path: string, cap: number): RasterImage {
  const png = PNG.sync.read(readFileSync(path))
  const img: RasterImage = {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  }
  return Math.max(img.width, img.height) > cap ? resizeToFit(img, cap) : img
}

function pngDataUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

// ---- build the scene (synthetic, or a real PNG passed on the CLI) ----
const arg = process.argv[2]
const source = arg ? loadPng(arg, 512) : shadedScene()
const flat = flattenIllumination(source, { scale: 0.09, strength: 1 })

// Same settings for both traces, so the only variable is the de-shading. A
// modest fixed palette is where shading hurts most: every slot the quantizer
// spends banding a gradient is one it can't spend on a real color.
const settings = normalizeSettings({
  mode: 'color',
  paletteSize: 32,
  autoPaletteSize: true,
  colorSpace: 'oklab',
  quantizeQuality: 6,
  layering: 'stacked',
  minRegionArea: 20,
  smoothing: 0.85,
  curveOptimize: true,
  maxDimension: 0,
  unit: 'px',
  precision: 2,
})
const before = await vectorize(source, settings)
const after = await vectorize(flat, settings)

const label = arg ? `real image (${arg.split('/').pop()})` : 'synthetic shaded scene'
const pct = (a: number, b: number): string =>
  b === 0 ? '—' : `${Math.round((1 - a / b) * 100)}% fewer`

const html = `<title>Flatten shading before tracing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:62rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 1.6rem;font-size:.95rem;max-width:64ch}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  .row h2{font-size:1.05rem;margin:0 0 1rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  figure{margin:0;text-align:center}
  figcaption{font-size:.78rem;letter-spacing:.02em;color:var(--muted);margin-bottom:.5rem}
  .frame{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:#fff;overflow:hidden}
  .frame img,.frame svg{width:100%;height:auto;display:block;max-width:360px;margin:0 auto;image-rendering:auto}
  table{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:.4rem}
  th,td{text-align:right;padding:.45rem .6rem;border-bottom:1px solid var(--line)}
  th:first-child,td:first-child{text-align:left}
  tbody tr:last-child td{border-bottom:none}
  .win{color:#1f8a4c;font-weight:600}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Flatten shading before tracing</h1>
  <p class="sub">A smoothly shaded, flat-color picture (${label}) traced through the engine with the same
    <em>illustration</em> settings, before and after <code>flattenIllumination</code>. Shading has no meaning to color
    quantization, so it slices each flat region into concentric tone bands; dividing the low-frequency lightness field
    out of the Oklab L channel collapses them, and the trace drops to far fewer colors, paths and nodes.</p>

  <section class="row">
    <h2>Input — raster, before vs after de-shading</h2>
    <div class="pair">
      <figure><figcaption>Original (shaded)</figcaption><div class="frame"><img src="${pngDataUri(source)}" alt="shaded"></div></figure>
      <figure><figcaption>flattenIllumination</figcaption><div class="frame"><img src="${pngDataUri(flat)}" alt="flattened"></div></figure>
    </div>
  </section>

  <section class="row">
    <h2>Traced output</h2>
    <div class="pair">
      <figure><figcaption>Trace of the shaded input</figcaption><div class="frame">${before.svg}</div></figure>
      <figure><figcaption>Trace of the de-shaded input</figcaption><div class="frame">${after.svg}</div></figure>
    </div>
  </section>

  <section class="row">
    <h2>The win</h2>
    <table>
      <thead><tr><th>metric</th><th>shaded</th><th>de-shaded</th><th>change</th></tr></thead>
      <tbody>
        <tr><td>colors</td><td>${before.stats.colorCount}</td><td>${after.stats.colorCount}</td><td class="win">${pct(after.stats.colorCount, before.stats.colorCount)}</td></tr>
        <tr><td>paths</td><td>${before.stats.pathCount}</td><td>${after.stats.pathCount}</td><td class="win">${pct(after.stats.pathCount, before.stats.pathCount)}</td></tr>
        <tr><td>nodes</td><td>${before.stats.nodeCount}</td><td>${after.stats.nodeCount}</td><td class="win">${pct(after.stats.nodeCount, before.stats.nodeCount)}</td></tr>
        <tr><td>SVG bytes</td><td>${before.stats.byteLength}</td><td>${after.stats.byteLength}</td><td class="win">${pct(after.stats.byteLength, before.stats.byteLength)}</td></tr>
      </tbody>
    </table>
  </section>
</div>`

const outPath = new URL('./flatten-shading.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(`source: ${label}, ${source.width}×${source.height}`)
console.log(
  `shaded   → ${before.stats.colorCount} colors, ${before.stats.pathCount} paths, ${before.stats.nodeCount} nodes, ${before.stats.byteLength} B`,
)
console.log(
  `deshaded → ${after.stats.colorCount} colors, ${after.stats.pathCount} paths, ${after.stats.nodeCount} nodes, ${after.stats.byteLength} B`,
)
