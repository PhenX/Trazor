/**
 * Visual demo: gradient detection (the `gradients` setting). Traces smooth
 * color ramps with gradients off (posterized bands) and on (one
 * `<linearGradient>` per ramp) and writes a side-by-side HTML page next to this
 * file. A flat control mark shows that non-ramp art is left byte-identical.
 *
 * Mesh-free: only the fill changes, so the geometry is unchanged — the "on"
 * side is far fewer shapes and smaller, with no banding.
 *
 * Run:  npx tsx docs/demos/gradient-fills.ts
 * Output: docs/demos/gradient-fills.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeResult } from '@trazor/core'
import { vectorize } from '@trazor/engine'

type Rgb = [number, number, number]
const lerp = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t)
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

function build(w: number, h: number, px: (x: number, y: number) => Rgb): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) setPixel(img, x, y, ...px(x, y))
  }
  return img
}

const W = 168
const H = 120

const scenes: { name: string; note: string; image: RasterImage }[] = [
  {
    name: 'Sky',
    note: 'Vertical light-to-deep blue ramp — the classic posterization banding',
    image: build(W, H, (_x, y) => mix([173, 216, 245], [30, 82, 168], y / (H - 1))),
  },
  {
    name: 'Soft shade',
    note: 'Diagonal warm ramp (a soft-lit surface)',
    image: build(W, H, (x, y) => mix([250, 234, 200], [150, 96, 60], (x + y) / (W + H - 2))),
  },
  {
    name: 'Flat mark (control)',
    note: 'Two flat colors, hard edge — no ramp, so output is left byte-identical',
    image: build(W, H, (x, y) => {
      const cx = W / 2
      const cy = H / 2
      return Math.hypot(x - cx, y - cy) < 42 ? [214, 64, 52] : [244, 240, 232]
    }),
  },
]

const BASE = {
  mode: 'color' as const,
  paletteSize: 24,
  quantizeQuality: 6,
  layering: 'stacked' as const,
  smoothing: 0.85,
  minRegionArea: 8,
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`

function card(label: string, sub: string, res: VectorizeResult): string {
  return `<figure>
      <figcaption>${label} <span>${sub}</span></figcaption>
      <div class="art">${res.svg}</div>
      <div class="stat">${res.stats.pathCount} paths · ${res.stats.colorCount} colors · ${kb(res.stats.byteLength)}</div>
    </figure>`
}

async function main(): Promise<void> {
  const rows: string[] = []
  for (const scene of scenes) {
    const off = await vectorize(scene.image, normalizeSettings({ ...BASE, gradients: false }))
    const on = await vectorize(scene.image, normalizeSettings({ ...BASE, gradients: true }))
    const identical = off.svg === on.svg
    rows.push(`<section class="row">
      <div class="rowhead"><h2>${scene.name}</h2><p>${scene.note}${identical ? ' — <strong>identical output</strong>' : ''}</p></div>
      <div class="pair">
        ${card('gradients off', 'posterized bands', off)}
        ${card('gradients on', identical ? 'unchanged' : 'one gradient per ramp', on)}
      </div>
    </section>`)
    console.log(
      `${scene.name}: off ${off.stats.pathCount} paths / ${kb(off.stats.byteLength)} → on ${on.stats.pathCount} paths / ${kb(on.stats.byteLength)}${identical ? ' (identical)' : ''}`,
    )
  }

  const html = `<title>Gradient Fills — Before / After</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--off:#b1502f;--on:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--off:#de7c57;--on:#35b7c5;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:60rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  .rowhead h2{font-size:1.05rem;margin:0}
  .rowhead p{margin:.2rem 0 1rem;color:var(--muted);font-size:.88rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  figure{margin:0;text-align:center}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  figcaption span{display:block;text-transform:none;letter-spacing:0;font-size:.78rem;margin-top:.15rem}
  .art{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--paper)}
  .art svg{display:block;width:100%;height:auto}
  .stat{font-size:.74rem;color:var(--muted);margin-top:.45rem;font-variant-numeric:tabular-nums}
  figure:first-of-type figcaption{color:var(--off)}
  figure:last-of-type figcaption{color:var(--on)}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Gradient fills — before / after</h1>
  <p class="sub">Smooth color ramps normally posterize into a stack of flat bands. With gradient detection on, adjacent bands that lie on one Oklab ramp are merged into a single region painted with a standard <code>&lt;linearGradient&gt;</code> — mesh-free, so the geometry is unchanged: fewer shapes, smaller files, no banding. Flat art with no ramp is left exactly as before.</p>
  ${rows.join('\n')}
</div>`

  const outPath = new URL('./gradient-fills.html', import.meta.url).pathname
  writeFileSync(outPath, html)
  console.log('wrote', outPath)
}

void main()
