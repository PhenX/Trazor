/**
 * Visual demo: the two color-layering backends on one flat graphic — stacked
 * vs. seam-free cutout. The same scene of overlapping shapes is traced both
 * ways through the real engine with everything else held equal, then each
 * layered SVG is peeled into its per-color `<g>` layers.
 *
 * The point: the two modes now produce the SAME smooth shapes and differ only
 * in SVG structure — stacked floods every lower layer under the ones above (the
 * most-bordering color is the full base sheet), while cutout is an exact
 * partition whose regions share mathematically identical boundaries (one
 * watertight tile per color, ideal for spot-color screens). Curved seams that
 * cross a junction stay smooth in both — the cutout tracer no longer shatters
 * them into a pixel staircase.
 *
 * Run:  npx tsx docs/demos/stacked-vs-cutout.ts
 * Output: docs/demos/stacked-vs-cutout.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'

/** Three overlapping flat disks on a light ground: curved seams that cross at
 *  junctions — the case that exercises the shared-boundary partition. */
function scene(): RasterImage {
  const S = 240
  const img = createRaster(S, S)
  fillRaster(img, 244, 242, 236)
  const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
      }
    }
  }
  disk(96, 96, 66, [214, 69, 65]) // red, drawn first
  disk(144, 96, 66, [42, 157, 143]) // teal
  disk(120, 140, 66, [38, 92, 189]) // blue, on top
  return img
}

const BASE: Partial<VectorizeSettings> = {
  mode: 'color',
  paletteSize: 6,
  autoPaletteSize: true,
  smoothing: 0.85,
  minRegionArea: 8,
  curveOptimize: true,
  groupByColor: true,
  maxDimension: 0,
}
const STACKED = normalizeSettings({ ...BASE, layering: 'stacked' })
const CUTOUT = normalizeSettings({ ...BASE, layering: 'cutout' })

/** Split a grouped SVG into one standalone tile per `<g>` layer, in paint order. */
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

/** Count straight (L/H/V) vs. curve (C/S/Q) vs. arc (A) commands in the path data. */
function commandMix(svg: string): { straight: number; curved: number } {
  let straight = 0
  let curved = 0
  for (const m of svg.matchAll(/ d="([^"]*)"/g)) {
    for (const ch of m[1]) {
      if ('LHVlhv'.includes(ch)) straight++
      else if ('CSQAcsqa'.includes(ch)) curved++
    }
  }
  return { straight, curved }
}

const img = scene()
const stacked = await vectorize(img, STACKED)
const cutout = await vectorize(img, CUTOUT)
const stackedLayers = peelLayers(stacked.svg, stacked.width, stacked.height)
const cutoutLayers = peelLayers(cutout.svg, cutout.width, cutout.height)
const sMix = commandMix(stacked.svg)
const cMix = commandMix(cutout.svg)

const tilesOf = (layers: { color: string; svg: string }[]): string =>
  layers
    .map(
      (l) => `<figure class="tile">
      <figcaption><span class="sw" style="background:${l.color}"></span>${l.color}</figcaption>
      <div class="frame">${l.svg}</div>
    </figure>`,
    )
    .join('\n')

const html = `<title>Stacked vs Cutout</title>
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
  .frame svg{width:100%;height:auto;max-width:240px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.8rem}
  .tile .frame svg{max-width:140px}
  .stat{font-variant-numeric:tabular-nums}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Color layering — stacked vs. seam-free cutout</h1>
  <p class="sub">One flat graphic, traced both ways through the engine with everything else held equal
    (${stacked.palette.length} colors, smoothing ${STACKED.smoothing}). The rendered result is the same smooth artwork;
    only the SVG structure differs. Curved seams here cross three-color junctions — the cutout tracer walks them as a
    shared boundary graph and keeps them smooth, instead of shattering them into a pixel staircase.</p>

  <section class="row">
    <h2>Same shapes, both smooth</h2>
    <p class="stat">Stacked: ${stacked.stats.nodeCount} nodes, ${stacked.stats.pathCount} paths, ${stackedLayers.length} layers
      (${sMix.straight} straight / ${sMix.curved} curve+arc segments). &nbsp;•&nbsp;
      Cutout: ${cutout.stats.nodeCount} nodes, ${cutout.stats.pathCount} paths, ${cutoutLayers.length} layers
      (${cMix.straight} straight / ${cMix.curved} curve+arc segments).</p>
    <div class="pair">
      <figure><figcaption>Stacked</figcaption><div class="frame">${stacked.svg}</div></figure>
      <figure><figcaption>Cutout (seam-free)</figcaption><div class="frame">${cutout.svg}</div></figure>
    </div>
  </section>

  <section class="row">
    <h2>Stacked layers — sheets that flood under each other</h2>
    <p>Each <code>&lt;g&gt;</code> peeled out, base first. Every lower layer extends <em>under</em> the ones above, so
      the shapes overlap and the topmost layer at each pixel wins — forgiving of registration, with overdraw. The
      most-bordering color anchors the base.</p>
    <div class="tiles">${tilesOf(stackedLayers)}</div>
  </section>

  <section class="row">
    <h2>Cutout layers — an exact partition</h2>
    <p>The same graphic as a watertight mosaic: every pixel belongs to exactly one region, and adjacent regions share
      mathematically identical boundaries — no gaps, no overlaps. Each tile is one self-contained spot color (a screen,
      a cut sheet). Enclosed regions appear as holes in the tile beneath them.</p>
    <div class="tiles">${tilesOf(cutoutLayers)}</div>
  </section>
</div>`

const outPath = new URL('./stacked-vs-cutout.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(
  `stacked: ${stacked.stats.nodeCount} nodes, ${stackedLayers.length} layers, ${sMix.straight} straight / ${sMix.curved} curve+arc`,
)
console.log(
  `cutout:  ${cutout.stats.nodeCount} nodes, ${cutoutLayers.length} layers, ${cMix.straight} straight / ${cMix.curved} curve+arc`,
)
