/**
 * Visual demo: the palette budget is a hard cap under region growing. A cartoon
 * panel — outlined flat fills with anti-aliased edges, two shading tones and a
 * few small accents — is grown into regions at three `paletteSize` budgets,
 * with `autoPaletteSize` on. The region merge finds the fills; the budget then
 * folds the pairs whose union adds the least total squared color error (Ward):
 * a small accent recolors first (little area, little error), two large fills of
 * one hue fold next, and distinct large hues merge last. The swatches under
 * each trace are its palette.
 *
 * Run:  npx tsx docs/demos/max-colors-cap.ts
 * Output: docs/demos/max-colors-cap.html
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

const W = 288
const H = 208
const INK: Rgb = [24, 22, 30]
const PAPER: Rgb = [246, 240, 226]

/** Ellipse coverage: 1 inside, a 1.5 px anti-aliased ramp at the edge. */
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
  const r = Math.min(rx, ry)
  return Math.max(0, Math.min(1, (1 - d) * r + 0.75))
}

/** A cartoon panel: two outlined characters with cel shading on a paper ground. */
function panel(): RasterImage {
  const img = createRaster(W, H)
  // Each shape: ellipse, base fill, optional shade fill for its lower-right half.
  const shapes: { cx: number; cy: number; rx: number; ry: number; fill: Rgb; shade?: Rgb }[] = [
    { cx: 96, cy: 118, rx: 62, ry: 70, fill: [80, 160, 230], shade: [52, 118, 190] }, // body
    { cx: 96, cy: 62, rx: 40, ry: 36, fill: [80, 160, 230], shade: [52, 118, 190] }, // head
    { cx: 56, cy: 34, rx: 16, ry: 26, fill: [190, 120, 200] }, // ear
    { cx: 136, cy: 34, rx: 16, ry: 26, fill: [190, 120, 200] }, // ear
    { cx: 82, cy: 60, rx: 10, ry: 12, fill: [250, 250, 250] }, // eye
    { cx: 110, cy: 60, rx: 10, ry: 12, fill: [250, 250, 250] }, // eye
    { cx: 84, cy: 62, rx: 5, ry: 6, fill: INK }, // pupil
    { cx: 112, cy: 62, rx: 5, ry: 6, fill: INK }, // pupil
    { cx: 96, cy: 84, rx: 18, ry: 8, fill: [225, 70, 90] }, // mouth
    { cx: 214, cy: 128, rx: 52, ry: 60, fill: [250, 176, 60], shade: [214, 136, 40] }, // friend
    { cx: 214, cy: 70, rx: 30, ry: 28, fill: [250, 176, 60], shade: [214, 136, 40] },
    { cx: 204, cy: 68, rx: 7, ry: 8, fill: [250, 250, 250] },
    { cx: 224, cy: 68, rx: 7, ry: 8, fill: [250, 250, 250] },
    { cx: 205, cy: 69, rx: 3, ry: 4, fill: INK },
    { cx: 225, cy: 69, rx: 3, ry: 4, fill: INK },
    { cx: 214, cy: 128, rx: 22, ry: 22, fill: [90, 190, 110] }, // belly patch
    { cx: 214, cy: 128, rx: 6, ry: 6, fill: [225, 70, 90] }, // button
  ]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: Rgb = PAPER
      for (const s of shapes) {
        const fill = ellipse(x, y, s.cx, s.cy, s.rx - 2.5, s.ry - 2.5)
        const outline = ellipse(x, y, s.cx, s.cy, s.rx, s.ry)
        c = mix(c, INK, outline)
        const shaded = s.shade && x + y > s.cx + s.cy + 10
        c = mix(c, shaded ? s.shade! : s.fill, fill)
      }
      setPixel(img, x, y, c[0], c[1], c[2])
    }
  }
  return img
}

function swatches(res: VectorizeResult): string {
  return res.palette.map((hex) => `<i style="background:${hex}" title="${hex}"></i>`).join('')
}

function card(label: string, res: VectorizeResult): string {
  return `<figure>
      <figcaption>${label}</figcaption>
      <div class="art">${res.svg}</div>
      <div class="pal">${swatches(res)}</div>
      <div class="stat">${res.stats.colorCount} colors · ${res.stats.pathCount} paths · ${(res.stats.byteLength / 1024).toFixed(1)} kB</div>
    </figure>`
}

async function main(): Promise<void> {
  const image = panel()
  const rec = recommendSettings(analyzeImage(image))
  const base = normalizeSettings({ ...rec.patch, segmentation: 'regions', autoPaletteSize: true })
  const cards: string[] = []
  for (const paletteSize of [24, 8, 4]) {
    const res = await vectorize(image, normalizeSettings({ paletteSize }, base))
    cards.push(card(`Max colors ${paletteSize}`, res))
    console.log(
      `paletteSize ${paletteSize}: ${res.stats.colorCount} colors — ${res.palette.join(' ')}`,
    )
  }
  const html = `<title>Max colors under region growing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:64rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
  .row{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
  figure{margin:0;text-align:center;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:.8rem}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  .art{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--paper)}
  .art svg{display:block;width:100%;height:auto}
  .pal{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin-top:.5rem}
  .pal i{display:block;width:16px;height:16px;border-radius:3px;border:1px solid var(--line)}
  .stat{font-size:.74rem;color:var(--muted);margin-top:.45rem;font-variant-numeric:tabular-nums}
  @media(max-width:40rem){.row{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Max colors under region growing</h1>
  <p class="sub">The recommender routes this cartoon panel to region growing (auto pick: <b>${rec.patch.segmentation}</b>). The region merge finds its fills; <b>Max colors</b> then caps them, with Auto reduce on. Each cut folds the pair whose union adds the least total squared color error: a small accent recolors first (little area, little error), a fill and its shading tone fold next, and distinct large hues merge last — and the count never exceeds the budget.</p>
  <div class="row">${cards.join('\n')}</div>
</div>`
  const outPath = new URL('./max-colors-cap.html', import.meta.url).pathname
  writeFileSync(outPath, html)
  console.log('wrote', outPath)
}

void main()
