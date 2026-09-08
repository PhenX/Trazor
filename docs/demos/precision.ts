/**
 * Visual demo: SVG coordinate precision — the default of one decimal against
 * two. Every scene is traced twice with otherwise identical settings (the
 * studio's auto recommendation) and the page shows, per scene, the two renders
 * at 1×, a magnified crop of the region where the two outputs differ most, the
 * difference between those crops amplified, both outlines overlaid, one path
 * command spelled out at each precision, and the byte / gzip / node counts.
 *
 * Run:  npx tsx docs/demos/precision.ts                         # built-in scenes → docs/demos/precision.html
 *       npx tsx docs/demos/precision.ts --data <dir> --out <file>  # a folder of PNG/JPEG images instead
 * Output: docs/demos/precision.html (or --out)
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import { getProfile, normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { resizeToFit } from '@trazor/raster'
import { analyzeSvg } from '@trazor/svg'
import {
  flattenOverWhite,
  pngDataUri,
  qualityStats,
  rasterizeSvg,
  readRgba,
  resampleNearest,
} from '../../scripts/eval/lib'

/** Source pixels of the crop shown magnified, and the magnification. */
const CROP = 64
const ZOOM = 6
/** Longest side of the 1× thumbnails. */
const THUMB = 240
/** Inline outline overlays are skipped above this size, so the page stays small. */
const OVERLAY_MAX_BYTES = 400_000
/** Amplification of the crop difference before it is painted. */
const DIFF_GAIN = 8

// ---------------------------------------------------------------------------
// Built-in scenes: anti-aliased flat art drawn with 4×4 supersampling.
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number]

function canvas(w: number, h: number, bg: Rgb): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0]
    data[i + 1] = bg[1]
    data[i + 2] = bg[2]
    data[i + 3] = 255
  }
  return { width: w, height: h, data }
}

/** Composite `color` wherever `inside` holds, with 4×4 supersampled coverage. */
function paint(img: RasterImage, inside: (x: number, y: number) => boolean, color: Rgb): void {
  const { width: w, height: h, data } = img
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hit++
        }
      }
      if (hit === 0) continue
      const a = hit / 16
      const i = (y * w + x) * 4
      data[i] = data[i] * (1 - a) + color[0] * a
      data[i + 1] = data[i + 1] * (1 - a) + color[1] * a
      data[i + 2] = data[i + 2] * (1 - a) + color[2] * a
    }
  }
}

/** Even-odd point-in-polygon. */
function inPolygon(pts: number[], x: number, y: number): boolean {
  let inside = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]
    const yi = pts[i * 2 + 1]
    const xj = pts[j * 2]
    const yj = pts[j * 2 + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function star(cx: number, cy: number, outer: number, inner: number, points: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return pts
}

/** Distance from (x, y) to a polyline. */
function distToPolyline(pts: number[], x: number, y: number): number {
  let best = Infinity
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i]
    const ay = pts[i + 1]
    const bx = pts[i + 2]
    const by = pts[i + 3]
    const dx = bx - ax
    const dy = by - ay
    const len = dx * dx + dy * dy
    let t = len > 0 ? ((x - ax) * dx + (y - ay) * dy) / len : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

/** A cubic Bézier sampled as a polyline. */
function cubic(p: number[], steps: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push(
      u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
    )
  }
  return out
}

interface Scene {
  name: string
  note: string
  image: () => RasterImage
}

const SCENES: Scene[] = [
  {
    name: 'Badge',
    note: 'A disc, a ring, a five-point star and a dot — curved and straight edges at every angle.',
    image: () => {
      const img = canvas(240, 240, [255, 255, 255])
      paint(img, (x, y) => Math.hypot(x - 120, y - 120) < 104, [31, 58, 110])
      paint(
        img,
        (x, y) => {
          const d = Math.hypot(x - 120, y - 120)
          return d > 84 && d < 92
        },
        [255, 255, 255],
      )
      const s = star(120, 124, 62, 27, 5)
      paint(img, (x, y) => inPolygon(s, x, y), [240, 190, 60])
      paint(img, (x, y) => Math.hypot(x - 168, y - 72) < 11, [214, 60, 50])
      return img
    },
  },
  {
    name: 'Shaded disc',
    note: 'A radial ramp the tracer posterizes into concentric bands — many long curved boundaries.',
    image: () => {
      const img = canvas(240, 240, [244, 246, 248])
      const { data } = img
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 240; x++) {
          const d = Math.hypot(x - 106, y - 100)
          if (d >= 96) continue
          const t = d / 96
          const i = (y * 240 + x) * 4
          data[i] = 250 - 170 * t
          data[i + 1] = 160 - 120 * t
          data[i + 2] = 70 + 40 * t
        }
      }
      return img
    },
  },
  {
    name: 'Ink stroke',
    note: 'A thick brush curve with a thin tail — the anti-aliased edge of a single-color shape.',
    image: () => {
      const img = canvas(280, 180, [255, 255, 255])
      const spine = cubic([24, 140, 70, 10, 150, 200, 256, 40], 64)
      const tail = cubic([180, 150, 220, 165, 240, 120, 262, 96], 32)
      paint(
        img,
        (x, y) => {
          const d = distToPolyline(spine, x, y)
          return d < 6 + 3 * Math.sin((x / 280) * Math.PI)
        },
        [24, 24, 28],
      )
      paint(img, (x, y) => distToPolyline(tail, x, y) < 1.6, [24, 24, 28])
      return img
    },
  },
]

// ---------------------------------------------------------------------------
// Tracing and measurement
// ---------------------------------------------------------------------------

interface Trace {
  precision: number
  svg: string
  bytes: number
  gzip: number
  nodes: number
  /** `<circle>`, `<ellipse>` and `<rect>` elements the serializer recognized. */
  primitives: number
  /** `A` arc commands in the path data. */
  arcs: number
  dE: number
  render: RasterImage
}

async function traceAt(
  image: RasterImage,
  base: VectorizeSettings,
  precision: number,
): Promise<Trace> {
  const res = await vectorize(image, { ...base, precision })
  const render = rasterizeSvg(res.svg, image.width)
  const q = qualityStats(
    resampleNearest(render, image.width, image.height),
    flattenOverWhite(image),
  )
  return {
    precision,
    svg: res.svg,
    bytes: Buffer.byteLength(res.svg),
    gzip: gzipSync(Buffer.from(res.svg)).length,
    nodes: analyzeSvg(res.svg).nodeCount,
    primitives: (res.svg.match(/<(?:circle|ellipse|rect)\b/g) ?? []).length,
    arcs: (res.svg.match(/[Aa]\s*[\d.]/g) ?? []).length,
    dE: q.mean,
    render,
  }
}

/** The engine's root element, re-framed onto a crop box and a display size. */
function reframe(svg: string, x: number, y: number, size: number, px: number): string {
  return svg.replace(
    /<svg([^>]*?)\sviewBox="[^"]*"\swidth="[^"]*"\sheight="[^"]*"/,
    `<svg$1 viewBox="${x} ${y} ${size} ${size}" width="${px}" height="${px}"`,
  )
}

/** Top-left corner (source px) of the CROP×CROP window where two renders differ most. */
function worstWindow(a: RasterImage, b: RasterImage): { x: number; y: number } {
  const { width: w, height: h } = a
  const win = Math.min(CROP, w, h)
  // Integral image of the per-pixel channel difference.
  const W1 = w + 1
  const sum = new Float64Array(W1 * (h + 1))
  for (let y = 1; y <= h; y++) {
    let row = 0
    for (let x = 1; x <= w; x++) {
      const i = ((y - 1) * w + (x - 1)) * 4
      row +=
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])
      sum[y * W1 + x] = sum[(y - 1) * W1 + x] + row
    }
  }
  let best = -1
  let bx = 0
  let by = 0
  for (let y = 0; y + win <= h; y += 2) {
    for (let x = 0; x + win <= w; x += 2) {
      const s =
        sum[(y + win) * W1 + x + win] -
        sum[y * W1 + x + win] -
        sum[(y + win) * W1 + x] +
        sum[y * W1 + x]
      if (s > best) {
        best = s
        bx = x
        by = y
      }
    }
  }
  return { x: bx, y: by }
}

/** |a − b| per pixel, amplified, painted as the accent over white. */
function diffImage(
  a: RasterImage,
  b: RasterImage,
): { image: RasterImage; maxDiff: number; psnr: number } {
  const { width: w, height: h } = a
  const data = new Uint8ClampedArray(w * h * 4)
  let maxDiff = 0
  let sq = 0
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    let d = 0
    for (let c = 0; c < 3; c++) {
      const e = Math.abs(a.data[i + c] - b.data[i + c])
      if (e > d) d = e
      sq += e * e
    }
    if (d > maxDiff) maxDiff = d
    const t = Math.min(1, (d * DIFF_GAIN) / 255)
    data[i] = 255 * (1 - t) + 14 * t
    data[i + 1] = 255 * (1 - t) + 127 * t
    data[i + 2] = 255 * (1 - t) + 140 * t
    data[i + 3] = 255
  }
  const mse = sq / (w * h * 3)
  return {
    image: { width: w, height: h, data },
    maxDiff,
    psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse),
  }
}

/** The first `d` that is not the background sheet, cut to one command run. */
function excerpt(svg: string): string {
  const ds = [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1])
  const d = ds[1] ?? ds[0] ?? ''
  return d.length > 110 ? `${d.slice(0, 110)}…` : d
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`
const pct = (a: number, b: number): string => `${(((b - a) / a) * 100).toFixed(0)} %`

interface Row {
  name: string
  note: string
  width: number
  height: number
  settings: string
  p2: Trace
  p1: Trace
  crop: { x: number; y: number }
  psnr: number
  maxDiff: number
  html: string
}

async function study(name: string, note: string, image: RasterImage): Promise<Row> {
  const rec = recommendSettings(analyzeImage(image))
  const base: VectorizeSettings = {
    ...normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch }),
    maxDimension: 0,
  }
  const p2 = await traceAt(image, base, 2)
  const p1 = await traceAt(image, base, 1)
  const crop = worstWindow(p2.render, p1.render)
  const size = Math.min(CROP, image.width, image.height)
  const px = size * ZOOM
  const crop2 = rasterizeSvg(reframe(p2.svg, crop.x, crop.y, size, px), px)
  const crop1 = rasterizeSvg(reframe(p1.svg, crop.x, crop.y, size, px), px)
  const diff = diffImage(crop2, crop1)
  const thumb = (img: RasterImage): string => pngDataUri(resizeToFit(img, THUMB))
  const source = flattenOverWhite(image)
  const overlay =
    p2.bytes <= OVERLAY_MAX_BYTES && p1.bytes <= OVERLAY_MAX_BYTES
      ? `<figure><figcaption>outlines overlaid <span>two decimals over one, ${ZOOM * 2}×</span></figcaption>
        <div class="overlay"><img src="${pngDataUri(resizeNearest(crop1, px * 2))}" alt="">
        ${reframe(p1.svg, crop.x, crop.y, size, px * 2).replace('<svg', '<svg class="outline after"')}
        ${reframe(p2.svg, crop.x, crop.y, size, px * 2).replace('<svg', '<svg class="outline before"')}</div></figure>`
      : `<p class="muted">Outline overlay skipped: the SVGs are over ${kb(OVERLAY_MAX_BYTES)} each.</p>`
  const desc =
    base.mode === 'color' || base.mode === 'grayscale'
      ? `${rec.profileId} · ${base.segmentation} · ${base.layering} · ${base.paletteSize} colors${base.autoPaletteSize ? ' (auto)' : ''}`
      : `${rec.profileId} · ${base.mode}`
  const html = `<section class="row">
    <div class="rowhead"><h2>${esc(name)}</h2><p>${esc(note)} <span class="settings">${esc(desc)}, ${image.width}×${image.height}</span></p></div>
    <div class="trio">
      <figure><figcaption>source</figcaption><img src="${thumb(source)}" alt="source"></figure>
      <figure><figcaption>two decimals <span>${kb(p2.bytes)} · ${kb(p2.gzip)} gzipped · ${p2.nodes} nodes</span></figcaption><img src="${thumb(p2.render)}" alt="precision 2"></figure>
      <figure><figcaption>one decimal <span>${kb(p1.bytes)} · ${kb(p1.gzip)} gzipped · ${p1.nodes} nodes</span></figcaption><img src="${thumb(p1.render)}" alt="precision 1"></figure>
    </div>
    <div class="trio crops">
      <figure><figcaption>two decimals, ${ZOOM}× <span>crop at (${crop.x}, ${crop.y}), ${size} px</span></figcaption><img src="${pngDataUri(crop2)}" alt=""></figure>
      <figure><figcaption>one decimal, ${ZOOM}×</figcaption><img src="${pngDataUri(crop1)}" alt=""></figure>
      <figure><figcaption>difference × ${DIFF_GAIN} <span>largest channel step ${diff.maxDiff} / 255 · ${Number.isFinite(diff.psnr) ? `${diff.psnr.toFixed(1)} dB` : 'identical'} between the two crops</span></figcaption><img src="${pngDataUri(diff.image)}" alt=""></figure>
    </div>
    ${overlay}
    <div class="pathdata">
      <div><span class="tag before">two decimals</span><code>${esc(excerpt(p2.svg))}</code></div>
      <div><span class="tag after">one decimal</span><code>${esc(excerpt(p1.svg))}</code></div>
    </div>
  </section>`
  return {
    name,
    note,
    width: image.width,
    height: image.height,
    settings: desc,
    p2,
    p1,
    crop,
    psnr: diff.psnr,
    maxDiff: diff.maxDiff,
    html,
  }
}

/** Integer upscale by pixel replication, for a crisp magnified backdrop. */
function resizeNearest(img: RasterImage, width: number): RasterImage {
  const f = width / img.width
  return resampleNearest(img, width, Math.round(img.height * f))
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function page(rows: Row[], title: string): string {
  const table = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td class="num">${r.width}×${r.height}</td><td class="num">${r.p2.nodes} → ${r.p1.nodes}</td>` +
        `<td class="num">${r.p2.primitives} · ${r.p2.arcs} → ${r.p1.primitives} · ${r.p1.arcs}</td>` +
        `<td class="num">${kb(r.p2.bytes)} → ${kb(r.p1.bytes)} <em>${pct(r.p2.bytes, r.p1.bytes)}</em></td>` +
        `<td class="num">${kb(r.p2.gzip)} → ${kb(r.p1.gzip)} <em>${pct(r.p2.gzip, r.p1.gzip)}</em></td>` +
        `<td class="num">${r.p2.dE.toFixed(4)} → ${r.p1.dE.toFixed(4)}</td>` +
        `<td class="num">${Number.isFinite(r.psnr) ? `${r.psnr.toFixed(1)} dB` : 'identical'}</td></tr>`,
    )
    .join('\n')
  return `<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--code:#f3f6f9;
    --before:#b1502f;--after:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--code:#0f161d;--before:#de7c57;--after:#35b7c5;}}
  :root[data-theme=dark]{--bg:#0d131a;--paper:#151d26;--ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--code:#0f161d;
    --before:#de7c57;--after:#35b7c5;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:64rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem;text-wrap:balance}
  .sub{color:var(--muted);margin:0 0 1.5rem;font-size:.95rem;max-width:65ch}
  .summary{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line);border-radius:12px;
    overflow:hidden;margin-bottom:1.5rem;font-size:.88rem}
  .summary th,.summary td{padding:.55rem .8rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  .summary th{font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .summary tr:last-child td{border-bottom:0}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .num em{font-style:normal;color:var(--after);font-weight:600;margin-left:.3rem}
  .tablewrap{overflow-x:auto;margin-bottom:1.5rem}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  .rowhead h2{font-size:1.05rem;margin:0}
  .rowhead p{margin:.2rem 0 1rem;color:var(--muted);font-size:.88rem;max-width:70ch}
  .settings{display:block;font-size:.78rem;margin-top:.15rem}
  .trio{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1rem}
  figure{margin:0;text-align:center;min-width:0}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  figcaption span{display:block;text-transform:none;letter-spacing:0;font-size:.78rem;margin-top:.15rem;font-variant-numeric:tabular-nums}
  img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff;image-rendering:auto}
  .crops img{image-rendering:pixelated}
  .overlay{position:relative;display:inline-block;max-width:100%;line-height:0;overflow:hidden;border:1px solid var(--line);border-radius:8px}
  .overlay img{display:block;image-rendering:pixelated;opacity:.35;border:0;border-radius:0}
  .overlay .outline{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
  .overlay .outline *{fill:none !important;stroke-width:0.16;stroke-linejoin:round}
  .overlay .before *{stroke:var(--before) !important}
  .overlay .after *{stroke:var(--after) !important}
  .pathdata{display:grid;gap:.4rem;margin-top:1rem}
  .pathdata div{display:flex;gap:.6rem;align-items:baseline;min-width:0}
  .pathdata code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.76rem;background:var(--code);
    padding:.3rem .5rem;border-radius:6px;overflow-x:auto;white-space:nowrap;flex:1;min-width:0}
  .tag{font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;font-weight:600;white-space:nowrap;width:7rem}
  .tag.before{color:var(--before)}.tag.after{color:var(--after)}
  .muted{color:var(--muted);font-size:.85rem}
  @media(max-width:40rem){.trio{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <p class="sub">Every scene is traced twice with the studio's auto-recommended settings; only <code>precision</code> differs — two decimals in the path data on the left, one (the default) on the right. Rounding to one decimal moves a coordinate by at most 0.05 px, which no renderer resolves at 1× and which the crops below show at ${ZOOM}×; what changes is the file. Primitives are the <code>&lt;circle&gt;</code>, <code>&lt;ellipse&gt;</code> and <code>&lt;rect&gt;</code> elements recognized, arcs the <code>A</code> commands; both are fitted on the precision grid, so a coarser grid can change how many arcs a boundary keeps. The difference panel paints |two − one| amplified ×${DIFF_GAIN}, and the outlines overlay both paths (rust: two decimals, teal: one) on the one-decimal render.</p>
  <div class="tablewrap"><table class="summary">
    <thead><tr><th>Scene</th><th>Size</th><th>Nodes</th><th>Primitives · arcs</th><th>Bytes</th><th>Gzipped</th><th>Mean ΔE vs source</th><th>Two vs one, ${ZOOM}× crop</th></tr></thead>
    <tbody>${table}</tbody>
  </table></div>
  ${rows.map((r) => r.html).join('\n')}
</div>`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dataAt = argv.indexOf('--data')
  const outAt = argv.indexOf('--out')
  const data = dataAt >= 0 ? argv[dataAt + 1] : null
  const out = outAt >= 0 ? argv[outAt + 1] : new URL('./precision.html', import.meta.url).pathname
  const rows: Row[] = []
  if (data) {
    for (const f of readdirSync(data).toSorted()) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue
      const name = basename(f).replace(/\.(png|jpe?g)$/i, '')
      const image = readRgba(join(data, f))
      rows.push(await study(name, '', image))
      console.log(`${name}: ${rows.at(-1)?.p2.bytes} → ${rows.at(-1)?.p1.bytes} bytes`)
    }
  } else {
    for (const s of SCENES) {
      rows.push(await study(s.name, s.note, s.image()))
      console.log(`${s.name}: ${rows.at(-1)?.p2.bytes} → ${rows.at(-1)?.p1.bytes} bytes`)
    }
  }
  writeFileSync(
    out,
    page(
      rows,
      data ? 'Coordinate Precision on Real Images' : 'Coordinate Precision — One Decimal vs Two',
    ),
  )
  console.log('wrote', out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
