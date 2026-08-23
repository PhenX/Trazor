/**
 * Visual demo: region shape matching. Traces filled shapes, then serializes each
 * twice — as an optimized path, and with primitive recognition on — to show
 * where a many-node curve collapses to one clean element (including the new
 * rotated `<ellipse transform="rotate(...)">`).
 *
 * Run:  npx tsx docs/demos/shape-matching.ts
 * Output: docs/demos/shape-matching.html
 */
import { writeFileSync } from 'node:fs'
import type { BinaryMask } from '@vectorizer/core'
import { traceMask } from '@vectorizer/trace'
import { analyzeSvg, serializeSvg } from '@vectorizer/svg'
import type { SvgDocument } from '@vectorizer/svg'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
  cornerThreshold: 100,
}

function mask(w: number, h: number, inside: (x: number, y: number) => boolean): BinaryMask {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) data[y * w + x] = 1
  return { width: w, height: h, data }
}

function rotatedEllipse(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const a = (deg * Math.PI) / 180
  const co = Math.cos(a)
  const si = Math.sin(a)
  return (x: number, y: number): boolean => {
    const dx = x - cx
    const dy = y - cy
    const u = (dx * co + dy * si) / rx
    const v = (-dx * si + dy * co) / ry
    return u * u + v * v <= 1
  }
}

function pointInPoly(px: number, py: number, v: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i]
    const [xj, yj] = v[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function regularPolygon(cx: number, cy: number, r: number, n: number, rotDeg: number) {
  const verts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (rotDeg * Math.PI) / 180 + (i * 2 * Math.PI) / n
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return (x: number, y: number): boolean => pointInPoly(x, y, verts)
}

function regularStar(cx: number, cy: number, rOut: number, rIn: number, n: number, rotDeg: number) {
  const verts: [number, number][] = []
  for (let i = 0; i < 2 * n; i++) {
    const a = (rotDeg * Math.PI) / 180 + (i * Math.PI) / n
    const r = i % 2 === 0 ? rOut : rIn
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return (x: number, y: number): boolean => pointInPoly(x, y, verts)
}

const S = 72
const shapes: { name: string; note: string; m: BinaryMask }[] = [
  {
    name: 'Rotated ellipse (30°)',
    note: 'Previously a many-node path; now one <ellipse> + rotate',
    m: mask(S, S, rotatedEllipse(36, 36, 22, 11, 30)),
  },
  {
    name: 'Axis-aligned ellipse',
    note: 'Recognized as <ellipse> (no transform)',
    m: mask(S, S, rotatedEllipse(36, 36, 22, 12, 0)),
  },
  {
    name: 'Circle',
    note: 'Recognized as <circle>',
    m: mask(S, S, (x, y) => Math.hypot(x - 36, y - 36) <= 18),
  },
  {
    name: 'Regular pentagon (rotated)',
    note: 'Regularized to a perfect <polygon>',
    m: mask(S, S, regularPolygon(36, 36, 22, 5, -80)),
  },
  {
    name: 'Five-point star',
    note: 'Regularized to a 10-point <polygon>',
    m: mask(S, S, regularStar(36, 36, 30, 9, 5, -90)),
  },
  {
    name: 'Diamond (rotated square)',
    note: 'Diagonal edges, so a <polygon> not a <rect>',
    m: mask(S, S, regularPolygon(36, 36, 22, 4, 0)),
  },
  {
    name: 'Irregular blob',
    note: 'Not a primitive — stays an editable path',
    m: mask(S, S, (x, y) => {
      const dx = x - 36
      const dy = y - 36
      const r = 16 + 5 * Math.sin(3 * Math.atan2(dy, dx))
      return Math.hypot(dx, dy) <= r
    }),
  },
]

function doc(m: BinaryMask): SvgDocument {
  const commands = traceMask(m, OPTS)[0]?.commands ?? []
  return {
    width: S,
    height: S,
    unit: 'px',
    shapes: [{ commands, fill: '#0e7f8c', fillRule: 'evenodd' }],
  }
}

function render(
  d: SvgDocument,
  roundPrimitives: boolean,
): { svg: string; nodes: number; kind: string } {
  const svg = serializeSvg(d, { precision: 2, optimizePaths: true, roundPrimitives })
  const el = /<(path|ellipse|circle|rect|polygon)\b/.exec(svg)
  return { svg, nodes: analyzeSvg(svg).nodeCount, kind: el ? el[1] : 'path' }
}

const rows = shapes
  .map((s) => {
    const d = doc(s.m)
    const path = render(d, false)
    const prim = render(d, true)
    return `<section class="row">
      <div class="rowhead"><h2>${s.name}</h2><p>${s.note}</p></div>
      <div class="pair">
        <figure><figcaption>optimized path <span>&lt;${path.kind}&gt; · ${path.nodes} nodes</span></figcaption><div class="frame">${path.svg}</div></figure>
        <figure><figcaption>shape matching <span>&lt;${prim.kind}&gt; · ${prim.nodes} nodes</span></figcaption><div class="frame">${prim.svg}</div></figure>
      </div>
    </section>`
  })
  .join('\n')

const html = `<title>Shape Matching — Path vs Primitive</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--accent:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--accent:#35b7c5;}}
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
  .frame{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:var(--paper)}
  .frame svg{width:100%;height:auto;max-width:220px}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Shape matching — path vs primitive</h1>
  <p class="sub">Each shape is traced once, then serialized as an optimized path and with primitive recognition on. A shape that really is a circle, (rotated) ellipse, rectangle, regular polygon, or star collapses to one clean, editable element with far fewer nodes — a near-regular polygon or star snaps to a perfect one; anything else stays a path. Recognition is disabled in cutout mode, where a neighbor still traces the shared Bézier edge.</p>
  ${rows}
</div>`

const outPath = new URL('./shape-matching.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
for (const s of shapes) {
  const d = doc(s.m)
  console.log(
    `${s.name.padEnd(24)} path ${render(d, false).nodes}n -> ${render(d, true).kind} ${render(d, true).nodes}n`,
  )
}
