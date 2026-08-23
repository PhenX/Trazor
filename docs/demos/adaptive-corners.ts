/**
 * Visual demo: closed-ring corner handling with and without an angle/scale
 * threshold (the `cornerThreshold` curve option). Traces a set of shapes both
 * ways and writes a side-by-side HTML page next to this file.
 *
 * Run:  npx tsx docs/demos/adaptive-corners.ts
 * Output: docs/demos/adaptive-corners.html
 */
import { writeFileSync } from 'node:fs'
import type { BinaryMask, PathCommand } from '@trazor/core'
import { traceMask } from '@trazor/trace'

const BASE = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
}
const WITHOUT = { ...BASE }
const WITH = { ...BASE, cornerThreshold: 100 }

function mask(w: number, h: number, fill: (x: number, y: number) => boolean): BinaryMask {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fill(x, y)) data[y * w + x] = 1
  return { width: w, height: h, data }
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

function star(size: number, points: number, rOuter: number, rInner: number): BinaryMask {
  const c = size / 2
  const verts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner
    const a = (Math.PI * i) / points - Math.PI / 2
    verts.push([c + r * Math.cos(a), c + r * Math.sin(a)])
  }
  return mask(size, size, (x, y) => pointInPoly(x + 0.5, y + 0.5, verts))
}

const shapes: { name: string; note: string; m: BinaryMask }[] = [
  {
    name: 'Small square (6 px)',
    note: 'Angle gate keeps small real corners crisp',
    m: mask(16, 16, (x, y) => x >= 5 && x < 11 && y >= 5 && y < 11),
  },
  {
    name: 'Right triangle (staircase hypotenuse)',
    note: 'Real corners sharp, staircase edge stays smooth',
    m: mask(28, 24, (x, y) => y >= 3 && y < 21 && x >= 3 && x <= 3 + (21 - y)),
  },
  {
    name: '5-point star',
    note: 'Sharp points preserved, no rounding of tips',
    m: star(40, 5, 17, 7),
  },
  {
    name: 'Low-res disc (r 9)',
    note: 'Scale gate: no false corners from pixelation',
    m: mask(24, 24, (x, y) => {
      const dx = x + 0.5 - 12
      const dy = y + 0.5 - 12
      return dx * dx + dy * dy <= 9 * 9
    }),
  },
  {
    name: 'Plus / cross',
    note: 'Twelve true 90° corners, all kept',
    m: mask(21, 21, (x, y) => (x >= 8 && x < 13) || (y >= 8 && y < 13)),
  },
  {
    name: 'Rounded blob',
    note: 'Genuinely round outline stays smooth',
    m: mask(30, 24, (x, y) => {
      const dx = (x + 0.5 - 15) / 13
      const dy = (y + 0.5 - 12) / 10
      return dx * dx + dy * dy <= 1
    }),
  },
]

const round2 = (v: number): number => Math.round(v * 100) / 100

function toD(cmds: PathCommand[]): string {
  const out: string[] = []
  for (const c of cmds) {
    if (c.type === 'M') out.push(`M${round2(c.x)} ${round2(c.y)}`)
    else if (c.type === 'L') out.push(`L${round2(c.x)} ${round2(c.y)}`)
    else if (c.type === 'C')
      out.push(
        `C${round2(c.x1)} ${round2(c.y1)} ${round2(c.x2)} ${round2(c.y2)} ${round2(c.x)} ${round2(c.y)}`,
      )
    else if (c.type === 'Q')
      out.push(`Q${round2(c.x1)} ${round2(c.y1)} ${round2(c.x)} ${round2(c.y)}`)
    else out.push('Z')
  }
  return out.join(' ')
}

function pixels(m: BinaryMask): string {
  let out = ''
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x]) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`
  return out
}

function svg(m: BinaryMask, cmds: PathCommand[], klass: string): string {
  const cell = 13
  return `<svg viewBox="0 0 ${m.width} ${m.height}" width="${m.width * cell}" height="${m.height * cell}" class="${klass}">
    <g class="px">${pixels(m)}</g>
    <path d="${toD(cmds)}" class="trace"/>
  </svg>`
}

const lines = (cmds: PathCommand[]): number => cmds.filter((c) => c.type === 'L').length
const curves = (cmds: PathCommand[]): number =>
  cmds.filter((c) => c.type === 'C' || c.type === 'Q').length

const rows = shapes
  .map((s) => {
    const off = traceMask(s.m, WITHOUT)[0]?.commands ?? []
    const on = traceMask(s.m, WITH)[0]?.commands ?? []
    return `<section class="row">
      <div class="rowhead"><h2>${s.name}</h2><p>${s.note}</p></div>
      <div class="pair">
        <figure><figcaption>α only <span>${lines(off)} lines · ${curves(off)} curves</span></figcaption>${svg(s.m, off, 'before')}</figure>
        <figure><figcaption>angle + scale <span>${lines(on)} lines · ${curves(on)} curves</span></figcaption>${svg(s.m, on, 'after')}</figure>
      </div>
    </section>`
  })
  .join('\n')

const html = `<title>Adaptive Corners — Before / After</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;
    --px:#c8d2dc;--before:#b1502f;--after:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--px:#2c3a49;--before:#de7c57;--after:#35b7c5;}}
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
  svg{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
  .px rect{fill:var(--px)}
  .trace{fill:none;stroke-width:.28;stroke-linejoin:round}
  .before .trace{stroke:var(--before)}
  .after .trace{stroke:var(--after)}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Adaptive corners — before / after</h1>
  <p class="sub">Grey = source pixels · line = traced outline. Same tracer, same smoothing; the only difference is the angle + scale-aware corner test (cornerThreshold = 100°). A corner rendered as a curve is rounded; as lines, sharp.</p>
  ${rows}
</div>`

const outPath = new URL('./adaptive-corners.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
for (const s of shapes) {
  const off = traceMask(s.m, WITHOUT)[0]?.commands ?? []
  const on = traceMask(s.m, WITH)[0]?.commands ?? []
  console.log(
    `${s.name.padEnd(38)} α ${lines(off)}L/${curves(off)}C  ->  adaptive ${lines(on)}L/${curves(on)}C`,
  )
}
