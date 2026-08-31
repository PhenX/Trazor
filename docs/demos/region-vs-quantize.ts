/**
 * Visual demo: when flat art should be grown into regions and when it should be
 * quantized. Region growing seeds each region from a flat interior, so it keeps
 * anti-aliased edges from inventing a third rim color — but a smooth gradient
 * has no flat interior to seed from, so it gets flooded into one mean color, and
 * a palette of close hues over-merges. The recommender (`@trazor/assist`) now
 * routes gradient-bearing or few-color flat art to quantization instead, and
 * keeps region growing for the many-color, gradient-free clip-art it is meant
 * for. Each scene is traced both ways; the recommender's auto pick is marked.
 *
 * Run:  npx tsx docs/demos/region-vs-quantize.ts
 * Output: docs/demos/region-vs-quantize.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeResult } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeImage, recommendSettings } from '@trazor/assist'

type Rgb = [number, number, number]
const lerp = (a: number, b: number, t: number): number =>
  Math.round(a + (b - a) * Math.min(1, Math.max(0, t)))
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

const W = 224
const H = 168

/** Sunset skyline: a graded sky (no flat interior to seed) behind flat towers in
 *  close warm tones and a pale sun — the gradient floods and the towers merge. */
function skyline(): RasterImage {
  const sky: [number, Rgb][] = [
    [0, [250, 214, 150]],
    [0.55, [244, 158, 116]],
    [1, [176, 96, 120]],
  ]
  const skyAt = (t: number): Rgb => {
    for (let i = 1; i < sky.length; i++) {
      if (t <= sky[i][0])
        return mix(sky[i - 1][1], sky[i][1], (t - sky[i - 1][0]) / (sky[i][0] - sky[i - 1][0]))
    }
    return sky[sky.length - 1][1]
  }
  const towers: [number, number, number, Rgb][] = [
    [12, 96, 40, [150, 78, 96]],
    [40, 70, 46, [214, 132, 108]],
    [78, 60, 52, [176, 96, 110]],
    [122, 84, 40, [232, 158, 120]],
    [150, 66, 60, [150, 78, 96]],
    [186, 100, 30, [214, 132, 108]],
  ]
  return build(W, H, (x, y) => {
    // Pale sun low on the right.
    if (Math.hypot(x - 168, y - 104) < 34) return [252, 232, 190]
    for (const [tx, ty, tw, col] of towers) {
      if (x >= tx && x < tx + tw && y >= ty) return col
    }
    return skyAt(y / (H - 1))
  })
}

/** A flat subject on a shaded backdrop: the whole background is one smooth ramp,
 *  so region growing paints it a single mean color. */
function shadedBackdrop(): RasterImage {
  return build(W, H, (x, y) => {
    const cx = W / 2
    const cy = H / 2
    if (Math.abs(x - cx) < 34 && Math.abs(y - cy) < 46) return [232, 96, 72] // flat slab
    if (Math.hypot(x - cx, y - cy + 70) < 26) return [246, 208, 96] // flat disc
    const t = (x + y) / (W + H - 2)
    return mix([60, 150, 150], [30, 78, 108], t) // graded backdrop
  })
}

/** Many small anti-aliased colored discs on white — no gradient, well-separated
 *  colors: exactly what region growing is for (the recommender keeps it there). */
function clipArt(): RasterImage {
  const cols: Rgb[] = [
    [220, 40, 60],
    [30, 90, 200],
    [250, 200, 20],
    [40, 165, 95],
    [180, 60, 190],
  ]
  // Deterministic jittered grid of discs.
  const discs: [number, number, number, Rgb][] = []
  let seed = 0
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      discs.push([
        14 + gx * 27 + (rnd() - 0.5) * 10,
        14 + gy * 27 + (rnd() - 0.5) * 10,
        7 + rnd() * 5,
        cols[(rnd() * cols.length) | 0],
      ])
    }
  }
  return build(W, H, (x, y) => {
    let best: Rgb = [255, 255, 255]
    let bestCov = 0
    for (const [cx, cy, rad, col] of discs) {
      const cov = Math.max(0, Math.min(1, rad + 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
      if (cov > bestCov) {
        bestCov = cov
        best = mix([255, 255, 255], col, cov)
      }
    }
    return best
  })
}

const scenes: { name: string; note: string; image: RasterImage }[] = [
  {
    name: 'Sunset skyline',
    note: 'graded sky behind flat towers in close warm tones',
    image: skyline(),
  },
  {
    name: 'Shaded backdrop',
    note: 'a flat subject over one smooth background ramp',
    image: shadedBackdrop(),
  },
  {
    name: 'Clip-art field',
    note: 'many separated colors, no gradient — region growing’s home turf',
    image: clipArt(),
  },
]

const BASE = {
  mode: 'color' as const,
  paletteSize: 24,
  autoPaletteSize: true,
  quantizeQuality: 7,
  layering: 'stacked' as const,
  smoothing: 0.8,
  colorCoherence: 0.5,
  minRegionArea: 16,
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`

function card(label: string, auto: boolean, res: VectorizeResult): string {
  return `<figure class="${auto ? 'auto' : ''}">
      <figcaption>${label}${auto ? ' <b>· auto pick</b>' : ''}</figcaption>
      <div class="art">${res.svg}</div>
      <div class="stat">${res.stats.colorCount} colors · ${res.stats.pathCount} paths · ${kb(res.stats.byteLength)}</div>
    </figure>`
}

async function main(): Promise<void> {
  const rows: string[] = []
  for (const scene of scenes) {
    const pick = recommendSettings(analyzeImage(scene.image)).patch.segmentation ?? 'quantize'
    const regions = await vectorize(
      scene.image,
      normalizeSettings({ ...BASE, segmentation: 'regions' }),
    )
    const quant = await vectorize(
      scene.image,
      normalizeSettings({ ...BASE, segmentation: 'quantize' }),
    )
    rows.push(`<section class="row">
      <div class="rowhead"><h2>${scene.name}</h2><p>${scene.note}</p></div>
      <div class="pair">
        ${card('region growing', pick === 'regions', regions)}
        ${card('quantization', pick !== 'regions', quant)}
      </div>
    </section>`)
    console.log(
      `${scene.name}: auto=${pick}  regions ${regions.stats.colorCount}c/${kb(regions.stats.byteLength)}  quantize ${quant.stats.colorCount}c/${kb(quant.stats.byteLength)}`,
    )
  }

  const html = `<title>Region growing vs. quantization</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--pick:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--pick:#35b7c5;}}
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
  figure{margin:0;text-align:center;border:2px solid transparent;border-radius:10px;padding:.5rem}
  figure.auto{border-color:var(--pick)}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  figcaption b{color:var(--pick)}
  .art{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--paper)}
  .art svg{display:block;width:100%;height:auto}
  .stat{font-size:.74rem;color:var(--muted);margin-top:.45rem;font-variant-numeric:tabular-nums}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Region growing vs. quantization</h1>
  <p class="sub">Region growing keeps anti-aliased edges from inventing a third rim color, but a smooth gradient has no flat interior to seed a region from — so it floods into one mean color, and a palette of close hues over-merges. The recommender routes gradient-bearing or few-color flat art to quantization (which posterizes a ramp into faithful bands) and keeps region growing for the many-color, gradient-free clip-art it is meant for. The <b>auto pick</b> is outlined.</p>
  ${rows.join('\n')}
</div>`

  const outPath = new URL('./region-vs-quantize.html', import.meta.url).pathname
  writeFileSync(outPath, html)
  console.log('wrote', outPath)
}

void main()
