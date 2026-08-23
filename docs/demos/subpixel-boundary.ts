/**
 * Visual demo: sub-pixel, anti-alias-aware boundary refinement (the `coverage`
 * trace option). Traces anti-aliased shapes with and without a signed coverage
 * field and writes a side-by-side HTML page next to this file.
 *
 * Each shape carries a centered coverage field (a 1 px anti-aliased ramp:
 * signed distance clamped to [-0.5, 0.5]) — the same shape the engine's
 * `signedThresholdField` produces in bw mode. The binary trace snaps edges to
 * the pixel lattice; the refined trace lands them on the true sub-pixel edge.
 *
 * Run:  npx tsx docs/demos/subpixel-boundary.ts
 * Output: docs/demos/subpixel-boundary.html
 */
import { writeFileSync } from 'node:fs'
import type { BinaryMask, GrayImage, PathCommand } from '@trazor/core'
import { traceMask } from '@trazor/trace'

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
}

const clampCov = (sd: number): number => (sd < -0.5 ? -0.5 : sd > 0.5 ? 0.5 : sd)

/** Build a mask + centered coverage field from a signed-distance function (positive inside). */
function fromSdf(
  w: number,
  h: number,
  sdf: (cx: number, cy: number) => number,
): {
  mask: BinaryMask
  field: GrayImage
} {
  const m = new Uint8Array(w * h)
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sd = sdf(x + 0.5, y + 0.5)
      data[y * w + x] = clampCov(sd)
      if (sd > 0) m[y * w + x] = 1
    }
  }
  return { mask: { width: w, height: h, data: m }, field: { width: w, height: h, data } }
}

const shapes: {
  name: string
  note: string
  w: number
  h: number
  sdf: (x: number, y: number) => number
}[] = [
  {
    name: 'Rectangle at a sub-pixel offset',
    note: 'True edges at x∈[5.3,18.7], y∈[4.4,14.6] — binary snaps to whole pixels',
    w: 24,
    h: 20,
    sdf: (x, y) => Math.min(x - 5.3, 18.7 - x, y - 4.4, 14.6 - y),
  },
  {
    name: 'Low-res anti-aliased disc (r 8.5)',
    note: 'Refined outline rides the grey edge instead of the lattice',
    w: 24,
    h: 24,
    sdf: (x, y) => 8.5 - Math.hypot(x - 12, y - 12),
  },
  {
    name: 'Shallow near-horizontal edge',
    note: 'Constant sub-pixel bias removed along the whole edge',
    w: 40,
    h: 16,
    sdf: (x, y) => (y - (5.6 + 0.14 * x)) / Math.hypot(1, 0.14),
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

/** Grey squares shaded by insideness (coverage + 0.5), so the anti-aliased ramp is visible. */
function pixels(field: GrayImage): string {
  const { width: w, height: h, data } = field
  let out = ''
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = data[y * w + x] + 0.5
      if (inside <= 0.001) continue
      const g = Math.round(210 - inside * 190)
      out += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${g},${g},${g})"/>`
    }
  }
  return out
}

function svg(field: GrayImage, cmds: PathCommand[], klass: string): string {
  const cell = 15
  return `<svg viewBox="0 0 ${field.width} ${field.height}" width="${field.width * cell}" height="${field.height * cell}" class="${klass}">
    <g>${pixels(field)}</g>
    <path d="${toD(cmds)}" class="trace"/>
  </svg>`
}

const rows = shapes
  .map((s) => {
    const { mask, field } = fromSdf(s.w, s.h, s.sdf)
    const binary = traceMask(mask, OPTS)[0]?.commands ?? []
    const refined = traceMask(mask, { ...OPTS, coverage: field })[0]?.commands ?? []
    return `<section class="row">
      <div class="rowhead"><h2>${s.name}</h2><p>${s.note}</p></div>
      <div class="pair">
        <figure><figcaption>binary <span>edges snap to the lattice</span></figcaption>${svg(field, binary, 'before')}</figure>
        <figure><figcaption>sub-pixel <span>edges on the true boundary</span></figcaption>${svg(field, refined, 'after')}</figure>
      </div>
    </section>`
  })
  .join('\n')

const html = `<title>Sub-pixel Boundary — Before / After</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;
    --before:#b1502f;--after:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--before:#de7c57;--after:#35b7c5;}}
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
  svg{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:var(--paper)}
  .trace{fill:none;stroke-width:.22;stroke-linejoin:round}
  .before .trace{stroke:var(--before)}
  .after .trace{stroke:var(--after)}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Sub-pixel boundary — before / after</h1>
  <p class="sub">Grey shading = anti-aliased coverage (the true edge runs through the mid-grey). The binary trace snaps the outline to whole-pixel boundaries; the sub-pixel trace refines each vertex onto the coverage field's true edge before fitting. Hard (fully black/white) edges carry no sub-pixel information and are left exactly on the lattice.</p>
  ${rows}
</div>`

const outPath = new URL('./subpixel-boundary.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
