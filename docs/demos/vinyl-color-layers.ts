/**
 * Visual demo: vinyl cutter — B&W silhouette vs. layered spot color. Traces a
 * small flat graphic three ways through the real engine: the old black & white
 * vinyl profile (every color flattened to one silhouette), the new color +
 * stacked profile grouped into cut layers, and the same result peeled into
 * those layers — one vinyl sheet each, the most-bordering color (the outline)
 * the full base sheet, every lower layer extending under the ones above so
 * weeded stacks stay gap-free, and the enclosed pupil lifted onto its own top
 * layer (so black appears twice: base and pupil).
 *
 * Run:  npx tsx docs/demos/vinyl-color-layers.ts
 * Output: docs/demos/vinyl-color-layers.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, fillRaster, getProfile, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'

/** A small flat badge: black-outlined spot colors, plus an eye with a pupil. */
function badge(): RasterImage {
  const S = 100
  const img = createRaster(S, S)
  fillRaster(img, 255, 255, 255)
  const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
      }
    }
  }
  // Each color is drawn over a slightly larger black disk, so black is the
  // outline threading between every region: the body edge, and a rim around the
  // red and yellow features. It is far from the largest area, but it borders the
  // most, so it becomes the full base layer the others stack onto.
  disk(50, 50, 38, [20, 20, 20]) // black outline
  disk(50, 50, 34, [40, 110, 190]) // blue field
  disk(38, 46, 18, [20, 20, 20]) // black outline
  disk(38, 46, 14, [210, 60, 50]) // red
  disk(64, 56, 16, [20, 20, 20]) // black outline
  disk(64, 56, 12, [240, 200, 60]) // yellow
  // An eye: a white sclera with a black pupil enclosed in it. The pupil shares
  // the outline's black but is fully surrounded by white, so it lifts onto its
  // own top layer — the blue and white sheets below it stay whole.
  disk(52, 34, 9, [235, 235, 235]) // white sclera
  disk(52, 34, 4, [20, 20, 20]) // black pupil (enclosed)
  return img
}

const BEFORE = normalizeSettings({
  mode: 'bw',
  thresholdMode: 'auto',
  layering: 'cutout',
  minRegionArea: 48,
  smoothing: 0.7,
  curveOptimize: true,
  unit: 'mm',
  precision: 3,
  maxDimension: 0,
})

// The live vinyl-cut profile (color, stacked, grouped, omit-background), full size.
const AFTER = normalizeSettings({ ...getProfile('vinyl-cut').patch, maxDimension: 0 })

/** Split a grouped SVG into one standalone tile per <g> color layer. */
function peelLayers(svg: string, w: number, h: number): { color: string; svg: string }[] {
  const tiles: { color: string; svg: string }[] = []
  for (const m of svg.matchAll(/<g id="layer-\d+"><title>([^<]*)<\/title>(.*?)<\/g>/gs)) {
    tiles.push({
      color: m[1],
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${m[2]}</svg>`,
    })
  }
  return tiles
}

const img = badge()
const before = await vectorize(img, BEFORE)
const after = await vectorize(img, AFTER)
const layers = peelLayers(after.svg, after.width, after.height)

const tiles = layers
  .map(
    (l) => `<figure class="tile">
      <figcaption><span class="sw" style="background:${l.color}"></span>${l.color}</figcaption>
      <div class="frame">${l.svg}</div>
    </figure>`,
  )
  .join('\n')

const html = `<title>Vinyl — Color Layers</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:60rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  .row h2{font-size:1.05rem;margin:0}
  .row p{margin:.2rem 0 1rem;color:var(--muted);font-size:.88rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  figure{margin:0;text-align:center}
  figcaption{font-size:.75rem;letter-spacing:.03em;color:var(--muted);margin-bottom:.5rem;
    display:flex;align-items:center;justify-content:center;gap:.4rem}
  .sw{width:12px;height:12px;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
  .frame{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:#fff}
  .frame svg{width:100%;height:auto;max-width:220px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.8rem}
  .tile .frame svg{max-width:150px}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Vinyl cutter — from one silhouette to layered spot color</h1>
  <p class="sub">The same flat graphic traced through the engine. The old profile was black &amp; white, so every color
    became a single silhouette. The new profile keeps the colors, stacks them (each lower layer extends under the ones
    above, so weeded sheets stack without gaps), and wraps each stacking level in its own <code>&lt;g&gt;</code> cut
    layer. An enclosed detail buried under two sheets — the eye pupil, beneath the blue face and the white sclera —
    lifts onto its own top layer instead of punching a hole through both, so its black shows up as a second black layer
    separate from the base outline. The backdrop color is dropped, so there is no full backing sheet to weed.</p>

  <section class="row">
    <h2>Before vs after</h2>
    <p>B&amp;W profile: ${before.palette.length} color, ${before.stats.pathCount} paths. Color profile:
      ${after.palette.length} colors, ${after.stats.pathCount} paths, ${layers.length} layers.</p>
    <div class="pair">
      <figure><figcaption>Before · B&amp;W profile</figcaption><div class="frame">${before.svg}</div></figure>
      <figure><figcaption>After · color, stacked, grouped</figcaption><div class="frame">${after.svg}</div></figure>
    </div>
  </section>

  <section class="row">
    <h2>Cut layers — one vinyl sheet per layer</h2>
    <p>Each <code>&lt;g&gt;</code> layer peeled out on its own, base first. The most-bordering color — the black
      outline here — is the full base sheet, so it reads through as the outline between the colors stacked on it; every
      lower layer extends under the ones above, so cutting each on its vinyl and stacking them reproduces the graphic
      with no seams. The last tile is the eye pupil, lifted onto its own layer on top — the same black as the base, but
      a separate sheet.</p>
    <div class="tiles">${tiles}</div>
  </section>
</div>`

const outPath = new URL('./vinyl-color-layers.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(`before: ${before.palette.length} color(s), ${before.stats.pathCount} paths`)
console.log(`after:  ${after.palette.length} colors, ${layers.length} layers`)
for (const l of layers) console.log(`  layer ${l.color}`)
