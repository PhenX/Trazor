/**
 * Visual demo: illumination flattening before tracing. A smoothly shaded scene
 * of distinct flat-color regions is traced three ways through the real engine —
 * as-is, after `flattenIllumination` with the plain-blur estimate, and after it
 * with the edge-aware (guided-filter) estimate. Shading makes the quantizer
 * slice each region into concentric tone bands (a nest of layers); dividing the
 * low-frequency Oklab-L field out collapses them. The plain blur bleeds across
 * the region boundaries and rings halos that fragment the trace *worse*; the
 * edge-aware estimate keeps the boundaries, so the trace drops to far fewer
 * colors, paths and nodes.
 *
 * The built-in scene is deterministic and synthetic (a lit sphere over a floor
 * in a vignetted field — distinct colors under strong shading, in the spirit of
 * the 3D peripheral-drift illusion this idea came from). Pass a PNG path to run
 * on a real image instead:
 *
 *   npx tsx docs/demos/flatten-shading.ts                 # synthetic scene
 *   npx tsx docs/demos/flatten-shading.ts path/to/pic.png # a real image
 *
 * Output: docs/demos/flatten-shading.html
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { createRaster, normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeResult } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { flattenIllumination, resizeToFit } from '@trazor/raster'

const YELLOW: RGB = [235, 188, 24]
const RED: RGB = [168, 40, 32]
const BLUE: RGB = [46, 58, 166]
type RGB = [number, number, number]

/** Clamp to [0, 1]. */
function sat(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Smooth 0→1 ramp across [e0, e1] (Hermite). */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = sat((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/**
 * A deterministic scene of a few *distinct* flat colors under strong smooth
 * shading — the case the edge-aware estimate is for. A lit blue sphere sits over
 * a red floor in a vignetted yellow field; each region is one color under a wide
 * lightness ramp, and the boundaries between them are real color edges. A plain
 * low-pass bleeds those edges and rings halos when divided out; the guided
 * estimate keeps them, so only the shading is removed.
 */
function shadedScene(size = 320): RasterImage {
  const img = createRaster(size, size)
  const cx = size * 0.4
  const cy = size * 0.46
  const R = size * 0.27
  const lx = -0.5
  const ly = -0.62
  const lz = 0.6
  const ln = Math.hypot(lx, ly, lz)
  const half = size * 0.5
  const maxD = Math.hypot(half, half)
  const floorY = size * 0.7
  const feather = 6

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Vignetted, diagonally-lit yellow field.
      const distC = Math.hypot(x - half, y - half) / maxD
      const bgF = (1.18 - 0.34 * ((x + y) / (2 * size))) * (0.5 + 0.7 * sat(distC * 1.5))
      let r = YELLOW[0] * bgF
      let g = YELLOW[1] * bgF
      let b = YELLOW[2] * bgF

      // Red floor with a soft top edge.
      const floorF = 1.12 - 0.55 * sat((y - floorY) / (size - floorY))
      const wFloor = smoothstep(floorY - feather, floorY + feather, y)
      r += (RED[0] * floorF - r) * wFloor
      g += (RED[1] * floorF - g) * wFloor
      b += (RED[2] * floorF - b) * wFloor

      // Lit blue sphere with a soft rim.
      const dxs = x - cx
      const dys = y - cy
      const nx = dxs / R
      const ny = dys / R
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const diff = Math.max(0.1, (nx * lx + ny * ly + nz * lz) / ln)
      const sphF = 0.28 + 1.0 * diff
      const wSph = 1 - smoothstep(R - feather, R + feather, Math.hypot(dxs, dys))
      r += (BLUE[0] * sphF - r) * wSph
      g += (BLUE[1] * sphF - g) * wSph
      b += (BLUE[2] * sphF - b) * wSph

      const p = (y * size + x) * 4
      img.data[p] = Math.max(0, Math.min(255, Math.round(r)))
      img.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)))
      img.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)))
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
const SCALE = 0.14
const plainFlat = flattenIllumination(source, { scale: SCALE, strength: 1, edgeAware: false })
const edgeFlat = flattenIllumination(source, { scale: SCALE, strength: 1, edgeAware: true })

// Same settings for every trace, so the only variable is the de-shading. The
// engine is free to pick the palette size (autoPaletteSize), so shading's true
// color cost surfaces instead of hiding under a fixed cap.
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

const shaded = await vectorize(source, settings)
const plain = await vectorize(plainFlat, settings)
const edge = await vectorize(edgeFlat, settings)

const label = arg ? `real image (${arg.split('/').pop()})` : 'synthetic shaded scene'
const pct = (a: number, base: number): string =>
  base === 0 ? '—' : `${Math.round((1 - a / base) * 100)}%`
const cls = (a: number, base: number): string => (a < base ? 'win' : a > base ? 'lose' : '')

interface Col {
  key: string
  title: string
  note: string
  img: string
  res: VectorizeResult
}
const cols: Col[] = [
  {
    key: 'shaded',
    title: 'Shaded (as-is)',
    note: 'the input',
    img: pngDataUri(source),
    res: shaded,
  },
  {
    key: 'plain',
    title: 'Plain-blur de-shade',
    note: 'halos at edges',
    img: pngDataUri(plainFlat),
    res: plain,
  },
  {
    key: 'edge',
    title: 'Edge-aware de-shade',
    note: 'guided filter',
    img: pngDataUri(edgeFlat),
    res: edge,
  },
]
const base = shaded.stats
const statRow = (name: string, get: (s: VectorizeResult['stats']) => number): string =>
  `<tr><td>${name}</td>${cols
    .map((c) => {
      const v = get(c.res.stats)
      const b = get(base)
      const change = c.key === 'shaded' ? '' : ` <span class="${cls(v, b)}">(${pct(v, b)})</span>`
      return `<td>${v.toLocaleString()}${change}</td>`
    })
    .join('')}</tr>`

const html = `<title>Flatten shading before tracing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--win:#1f8a4c;--lose:#c2410c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--win:#3ec77e;--lose:#f08a4b;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:70rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 1.6rem;font-size:.95rem;max-width:70ch}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  .row h2{font-size:1.05rem;margin:0 0 1rem}
  .triple{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem}
  figure{margin:0;text-align:center}
  figcaption{font-size:.8rem;color:var(--muted);margin-bottom:.5rem}
  figcaption b{color:var(--ink);display:block;font-weight:600}
  .frame{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:#fff;overflow:hidden}
  .frame img,.frame svg{width:100%;height:auto;display:block;max-width:320px;margin:0 auto;image-rendering:auto}
  table{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:.4rem}
  th,td{text-align:right;padding:.45rem .6rem;border-bottom:1px solid var(--line);white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  tbody tr:last-child td{border-bottom:none}
  .win{color:var(--win);font-weight:600}
  .lose{color:var(--lose);font-weight:600}
  @media(max-width:46rem){.triple{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Flatten shading before tracing</h1>
  <p class="sub">A smoothly shaded picture of distinct flat colors (${label}) traced through the engine with the same
    settings, three ways. Shading has no meaning to color quantization, so it slices each region into concentric tone
    bands. A plain low-pass illumination estimate bleeds across the color edges and rings halos that make the trace
    <em>worse</em>; the edge-aware guided-filter estimate keeps the edges and removes only the shading, so the trace
    drops to far fewer colors, paths and nodes.</p>

  <section class="row">
    <h2>Input — raster</h2>
    <div class="triple">
      ${cols
        .map(
          (c) =>
            `<figure><figcaption><b>${c.title}</b>${c.note}</figcaption><div class="frame"><img src="${c.img}" alt="${c.title}"></div></figure>`,
        )
        .join('\n      ')}
    </div>
  </section>

  <section class="row">
    <h2>Traced output</h2>
    <div class="triple">
      ${cols
        .map(
          (c) =>
            `<figure><figcaption><b>${c.title}</b>${c.note}</figcaption><div class="frame">${c.res.svg}</div></figure>`,
        )
        .join('\n      ')}
    </div>
  </section>

  <section class="row">
    <h2>The win <span style="font-weight:400;color:var(--muted);font-size:.85rem">(change vs the shaded trace)</span></h2>
    <table>
      <thead><tr><th>metric</th>${cols.map((c) => `<th>${c.title}</th>`).join('')}</tr></thead>
      <tbody>
        ${statRow('colors', (s) => s.colorCount)}
        ${statRow('paths', (s) => s.pathCount)}
        ${statRow('nodes', (s) => s.nodeCount)}
        ${statRow('SVG bytes', (s) => s.byteLength)}
      </tbody>
    </table>
  </section>
</div>`

const outPath = new URL('./flatten-shading.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(`source: ${label}, ${source.width}×${source.height}`)
for (const c of cols) {
  console.log(
    `${c.key.padEnd(7)} → ${c.res.stats.colorCount} colors, ${c.res.stats.pathCount} paths, ${c.res.stats.nodeCount} nodes, ${c.res.stats.byteLength} B`,
  )
}
