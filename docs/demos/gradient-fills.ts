/**
 * Visual demo: gradient detection (the `gradients` setting). Traces shapes with
 * smooth color ramps with gradients off (posterized bands) and on (one
 * `<linearGradient>` / `<radialGradient>` per ramp) and writes a side-by-side
 * HTML page next to this file. A flat control shape shows that non-ramp art is
 * left byte-identical; a glow over a sky shows a semi-transparent layer painted
 * as an opacity gradient stacked over the sky's gradient; a disc fading to
 * transparent keeps its transparency as opacity stops.
 *
 * Mesh-free: only the fill changes, so the geometry is unchanged — the "on"
 * side is far fewer shapes and smaller, with no banding.
 *
 * Run:  npx tsx docs/demos/gradient-fills.ts
 * Output: docs/demos/gradient-fills.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

type Rgb = [number, number, number]
type Rgba = [number, number, number, number]
const lerp = (a: number, b: number, t: number): number =>
  Math.round(a + (b - a) * Math.min(1, Math.max(0, t)))
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

function build(w: number, h: number, px: (x: number, y: number) => Rgb | Rgba): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      setPixel(img, x, y, r, g, b)
      if (a !== undefined) img.data[(y * w + x) * 4 + 3] = a
    }
  }
  return img
}

const W = 176
const H = 132
const M = 16 // shape inset from the frame
const BG: Rgb = [26, 30, 38] // dark, high-contrast against every shape (no low-contrast merges)

const scenes: {
  name: string
  note: string
  image: RasterImage
  settings?: Partial<VectorizeSettings>
}[] = [
  {
    name: 'Sky panel',
    note: 'A bounded panel with a vertical light-to-deep blue ramp',
    image: build(W, H, (x, y) => {
      const inside = x >= M && x < W - M && y >= M && y < H - M
      return inside ? mix([173, 216, 245], [30, 82, 168], (y - M) / (H - 2 * M - 1)) : BG
    }),
  },
  {
    name: 'Sphere',
    note: 'A disc with a diagonal warm ramp (lit top-left) — the ramp direction is obvious',
    image: build(W, H, (x, y) => {
      const cx = W / 2
      const cy = H / 2
      const r = Math.min(W, H) / 2 - M
      if (Math.hypot(x - cx, y - cy) > r) return BG
      return mix([252, 236, 205], [138, 74, 40], (x - cx + (y - cy) + 2 * r) / (4 * r))
    }),
  },
  {
    name: 'Sunset',
    note: 'A warm vertical sweep that bends through Oklab — one gradient, several stops',
    image: build(W, H, (x, y) => {
      const inside = x >= M && x < W - M && y >= M && y < H - M
      if (!inside) return BG
      const t = (y - M) / (H - 2 * M - 1)
      const top: Rgb = [252, 226, 150]
      const mid: Rgb = [236, 138, 74]
      const bot: Rgb = [150, 42, 66]
      return t < 0.5 ? mix(top, mid, t * 2) : mix(mid, bot, (t - 0.5) * 2)
    }),
  },
  {
    name: 'Orb',
    note: 'A disc shaded outward from a bright center — detected as a radial gradient',
    image: build(W, H, (x, y) => {
      const r = Math.min(W, H) / 2 - M
      const d = Math.hypot(x - W / 2, y - H / 2)
      return d > r ? BG : mix([228, 244, 236], [22, 96, 88], d / r)
    }),
  },
  {
    name: 'Sun glow (stacked)',
    note: 'A warm glow of one color fading over a vertical sky ramp — the sky is one gradient, the glow an opacity gradient composited over it',
    image: build(W, H, (x, y) => {
      const inside = x >= M && x < W - M && y >= M && y < H - M
      if (!inside) return BG
      const sky = mix([24, 34, 96], [250, 140, 60], (y - M) / (H - 2 * M - 1))
      const a = Math.max(0, 1 - Math.hypot(x - W * 0.6, y - H * 0.4) / 26)
      return mix(sky, [255, 240, 120], a)
    }),
  },
  {
    name: 'Fade to transparent',
    note: 'A disc whose alpha fades to 0 on a transparent canvas — one gradient of the disc color with opacity stops, no backdrop baked in',
    image: build(W, H, (x, y) => {
      const d = Math.hypot(x - W / 2, y - H / 2)
      const a = Math.max(0, Math.min(1, 1 - (d - 20) / 30))
      return [40, 120, 220, Math.round(a * 255)]
    }),
    settings: { alphaThreshold: 24 },
  },
  {
    name: 'Flat badge (control)',
    note: 'A flat disc, no ramp — output is left byte-identical',
    image: build(W, H, (x, y) =>
      Math.hypot(x - W / 2, y - H / 2) <= Math.min(W, H) / 2 - M ? [214, 64, 52] : BG,
    ),
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

/**
 * Namespace a traced SVG's gradient ids so several inlined on one HTML page do
 * not collide (SVG paint-server ids are document-global). A standalone SVG file
 * needs none of this — it is only for embedding many in one DOM, as here.
 */
function namespaceIds(svg: string, prefix: string): string {
  return svg
    .replace(/id="(g\d+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#(g\d+)\)/g, `url(#${prefix}$1)`)
}

function card(label: string, sub: string, res: VectorizeResult, prefix: string): string {
  return `<figure>
      <figcaption>${label} <span>${sub}</span></figcaption>
      <div class="art">${namespaceIds(res.svg, prefix)}</div>
      <div class="stat">${res.stats.pathCount} paths · ${res.stats.colorCount} colors · ${kb(res.stats.byteLength)}</div>
    </figure>`
}

async function main(): Promise<void> {
  const rows: string[] = []
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const base = { ...BASE, ...scene.settings }
    const off = await vectorize(scene.image, normalizeSettings({ ...base, gradients: false }))
    const on = await vectorize(scene.image, normalizeSettings({ ...base, gradients: true }))
    const identical = off.svg === on.svg
    rows.push(`<section class="row">
      <div class="rowhead"><h2>${scene.name}</h2><p>${scene.note}${identical ? ' — <strong>identical output</strong>' : ''}</p></div>
      <div class="pair">
        ${card('gradients off', 'posterized bands', off, `r${i}a-`)}
        ${card('gradients on', identical ? 'unchanged' : 'one gradient per ramp', on, `r${i}b-`)}
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
  <p class="sub">Smooth color ramps normally posterize into a stack of flat bands. With gradient detection on, adjacent bands that lie on one Oklab ramp — linear or radial — are merged into a single region painted with a standard <code>&lt;linearGradient&gt;</code> or <code>&lt;radialGradient&gt;</code> — mesh-free, so the geometry is unchanged: fewer shapes, smaller files, no banding. Flat art with no ramp is left exactly as before.</p>
  ${rows.join('\n')}
</div>`

  const outPath = new URL('./gradient-fills.html', import.meta.url).pathname
  writeFileSync(outPath, html)
  console.log('wrote', outPath)
}

void main()
