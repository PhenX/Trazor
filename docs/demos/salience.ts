/**
 * Visual demo: salience-aware simplification (`preserveSalient`). Thin,
 * low-contrast features — a pale hairline on white, a 1px ink hairline — sit on
 * strong color edges but are too faint to survive the size merge by contrast
 * alone. With the toggle on, the image's own boundaries act as a salience mask
 * that protects them; without it they merge away. The same protection is what
 * the learned edge pre-pass provides when the on-device model is loaded — this
 * is the classical, model-free fallback.
 *
 * Run:  npx tsx docs/demos/salience.ts
 * Output: docs/demos/salience.html
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'

/** Draw a 1px line (Bresenham), `off` repeated to thicken. */
function drawLine(
  img: RasterImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
  off = 0,
): void {
  for (let o = 0; o <= off; o++) {
    let x = x0
    let y = y0
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      for (let i = 0; i < 4; i++) {
        // Thickening shifts along x so the extra column stays 4-connected to
        // the line (the region merge walks 4-neighbors).
        const idx = (y * img.width + (x + o)) * 4
        img.data[idx] = rgb[0]
        img.data[idx + 1] = rgb[1]
        img.data[idx + 2] = rgb[2]
        img.data[idx + 3] = 255
      }
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x += sx
      }
      if (e2 <= dx) {
        err += dx
        y += sy
      }
    }
  }
}

function blank(w: number, h: number): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = 255
  }
  return { width: w, height: h, data }
}

/**
 * Color scene: a big mid-gray blob, a darker 2px stroke (survives either way —
 * the reference detail), and a pale 1px hairline whose contrast alone is too
 * weak to survive the merge.
 */
function colorScene(): RasterImage {
  const img = blank(220, 140)
  for (let y = 0; y < 140; y++) {
    for (let x = 0; x < 220; x++) {
      if ((x - 70) ** 2 + (y - 70) ** 2 <= 34 * 34) {
        const i = (y * 220 + x) * 4
        img.data[i] = 185
        img.data[i + 1] = 190
        img.data[i + 2] = 199
      }
    }
  }
  drawLine(img, 130, 15, 130, 125, [90, 100, 112], 1) // darker 2px stroke
  drawLine(img, 30, 110, 105, 30, [236, 236, 236]) // pale 1px hairline
  return img
}

/** Ink scene: a thick bar (survives either way) plus two 1px hairlines. */
function inkScene(): RasterImage {
  const img = blank(200, 60)
  for (let y = 10; y <= 50; y++) {
    for (let x = 10; x <= 24; x++) {
      const i = (y * 200 + x) * 4
      img.data[i] = 26
      img.data[i + 1] = 26
      img.data[i + 2] = 26
    }
  }
  drawLine(img, 60, 10, 60, 50, [90, 90, 90])
  drawLine(img, 90, 15, 170, 45, [90, 90, 90])
  return img
}

function colorSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    palette: ['#ffffff', '#b9bec7', '#5a6470', '#ececec'],
    layering: 'stacked',
    minRegionArea: 150,
    preserveSalient,
    dissolveBands: 0,
    colorCoherence: 0,
    curveMode: 'spline',
    optimizeSvg: true,
    precision: 2,
  })
}

function inkSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'bw',
    maxDimension: 0,
    thresholdMode: 'fixed',
    threshold: 128,
    minRegionArea: 60,
    preserveSalient,
    curveMode: 'spline',
    optimizeSvg: true,
    precision: 2,
  })
}

/**
 * Rescue scene: blob + a 1px hairline (#d9d9d9 — close enough to white that a
 * k=2 palette drops its color). The hairline is all boundary pixels, which the
 * clustering sample excludes, so without the toggle it is painted as the
 * background and disappears; with it, its own color is rescued into the palette.
 */
function rescueScene(): RasterImage {
  const img = blank(220, 140)
  for (let y = 0; y < 140; y++) {
    for (let x = 0; x < 220; x++) {
      if ((x - 70) ** 2 + (y - 70) ** 2 <= 34 * 34) {
        const i = (y * 220 + x) * 4
        img.data[i] = 58
        img.data[i + 1] = 68
        img.data[i + 2] = 80
      }
    }
  }
  drawLine(img, 30, 110, 105, 30, [217, 217, 217])
  return img
}

function rescueSettings(preserveSalient: boolean): VectorizeSettings {
  return normalizeSettings({
    mode: 'color',
    maxDimension: 0,
    segmentation: 'quantize',
    palette: null,
    paletteSize: 2,
    autoPaletteSize: false,
    layering: 'stacked',
    minRegionArea: 0,
    preserveSalient,
    dissolveBands: 0,
    colorCoherence: 0,
    curveMode: 'spline',
    optimizeSvg: true,
    precision: 2,
  })
}

const { svg: colorOff } = await vectorize(colorScene(), colorSettings(false))
const { svg: colorOn } = await vectorize(colorScene(), colorSettings(true))
const { svg: inkOff } = await vectorize(inkScene(), inkSettings(false))
const { svg: inkOn } = await vectorize(inkScene(), inkSettings(true))
const rescueOff = await vectorize(rescueScene(), rescueSettings(false))
const rescueOn = await vectorize(rescueScene(), rescueSettings(true))

function pane(title: string, svg: string): string {
  return `<figure><figcaption>${title}</figcaption><div class="frame">${svg}</div>
  <small>${analyzeSvg(svg).nodeCount.toLocaleString()} nodes · ${analyzeSvg(svg).pathCount} path(s)</small></figure>`
}

const html = `<title>Salience-aware simplification — keep fine edges</title>
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
  h1{font-size:1.5rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 1.6rem;font-size:.95rem;max-width:52rem}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem;margin-bottom:1.2rem}
  h2{font-size:1.05rem;margin:0 0 .3rem}
  .row p{margin:.2rem 0 1rem;color:var(--muted);font-size:.88rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  figure{margin:0;text-align:center}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  .frame{border:1px solid var(--line);border-radius:8px;padding:.5rem;background:var(--paper)}
  .frame svg{width:100%;height:auto}
  small{display:block;color:var(--muted);margin-top:.4rem;font-size:.78rem}
  @media(max-width:34rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Salience-aware simplification</h1>
  <p class="sub">Small regions normally merge into their surroundings during cleanup — which quietly erases thin strokes, hairlines and fine lettering, because they are too faint to pass the contrast test. The <strong>Keep fine edges</strong> toggle protects small regions that sit on the image's own strong color boundaries, using those boundaries as a salience mask: no ML model required. The pale 1px hairline below is a strong RGB edge but a weak color difference — the exact case contrast alone cannot save. The same protection is what the learned edge pre-pass provides when the on-device model is loaded; this is the classical, model-free fallback that always works.</p>

  <section class="row">
    <h2>Color: pale hairline on white</h2>
    <p>The big blob and the darker 2px stroke survive either way. The pale 1px hairline (rgb 236 on 255 — below the contrast bar, above the edge threshold) only survives with the toggle on.</p>
    <div class="pair">
      ${pane('Keep fine edges — off', colorOff)}
      ${pane('Keep fine edges — on', colorOn)}
    </div>
  </section>

  <section class="row">
    <h2>Ink: 1px hairlines</h2>
    <p>The same mechanism in black-and-white mode: the size-based despeckle drops the 1px hairlines unless their own edges protect them.</p>
    <div class="pair">
      ${pane('Keep fine edges — off', inkOff)}
      ${pane('Keep fine edges — on', inkOn)}
    </div>
  </section>

  <section class="row">
    <h2>Color rescue: when the palette drops the hairline's color</h2>
    <p>With a tiny palette (k = 2) the hairline's gray never earns a palette entry — a thin stroke is nothing but boundary pixels, which clustering excludes. Without the toggle it is painted as the background and vanishes; with it, the engine rescues the hairline's own color into the palette, then protects the region.</p>
    <div class="pair">
      ${pane('Keep fine edges — off · 2 colors', rescueOff.svg)}
      ${pane('Keep fine edges — on · ' + rescueOn.palette.length + ' colors', rescueOn.svg)}
    </div>
  </section>
</div>`

const outPath = fileURLToPath(new URL('./salience.html', import.meta.url))
writeFileSync(outPath, html)
console.log('wrote', outPath)
const cOff = analyzeSvg(colorOff)
const cOn = analyzeSvg(colorOn)
const iOff = analyzeSvg(inkOff)
const iOn = analyzeSvg(inkOn)
console.log(
  `color off ${cOff.nodeCount}n/${cOff.pathCount}p  on ${cOn.nodeCount}n/${cOn.pathCount}p`,
)
console.log(
  `ink   off ${iOff.nodeCount}n/${iOff.pathCount}p  on ${iOn.nodeCount}n/${iOn.pathCount}p`,
)
const rOff = analyzeSvg(rescueOff.svg)
const rOn = analyzeSvg(rescueOn.svg)
console.log(
  `rescue off ${rOff.nodeCount}n/${rOff.pathCount}p (${rescueOff.palette.length} colors)  on ${rOn.nodeCount}n/${rOn.pathCount}p (${rescueOn.palette.length} colors)`,
)
