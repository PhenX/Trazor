/**
 * Visual demo: the dataset generator's input-degradation pipeline
 * (scripts/dataset/degrade.mjs). Shows the range of procedural backgrounds and,
 * for a few clean scenes, several degraded variants — the train/test domain gap
 * the edge / cleanup pre-pass models must close. Writes a self-contained HTML
 * page next to this file.
 *
 * Run:  npx tsx docs/demos/degradation.ts
 * Output: docs/demos/degradation.html
 */
import { writeFileSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { DEFAULTS } from '../../scripts/dataset/config.mjs'
import { compositeOver, degrade, makeBackground } from '../../scripts/dataset/degrade.mjs'
import { mulberry32, seedFor } from '../../scripts/dataset/random.mjs'
import { renderShape } from '../../scripts/dataset/render.mjs'
import { proceduralItem } from '../../scripts/dataset/sources.mjs'

interface Img {
  width: number
  height: number
  data: Uint8ClampedArray
}

const RES = 150
const cfg = {
  ...DEFAULTS,
  resolution: RES,
  supersample: 2,
  geometric: { ...DEFAULTS.geometric, enabled: false }, // hold the shape still across variants
}

// JPEG-encoded preview (q88): these are photographic, noisy previews, so JPEG
// keeps the page ~10x smaller than PNG while the visual message is unchanged.
function dataUri(img: Img): string {
  const raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  const encoded = jpeg.encode({ data: raw, width: img.width, height: img.height }, 88)
  return `data:image/jpeg;base64,${encoded.data.toString('base64')}`
}

function cell(img: Img, label: string): string {
  return `<figure><img width="${RES}" height="${RES}" src="${dataUri(img)}" alt="${label}"><figcaption>${label}</figcaption></figure>`
}

// A row of procedural backgrounds (kind is rng-chosen, so varied seeds show the range).
const backgrounds: string[] = []
for (let i = 0; i < 8; i++) {
  const bg = makeBackground(RES, RES, mulberry32(seedFor(101, i)), true)
  backgrounds.push(cell(bg, `bg ${i + 1}`))
}

// A few clean scenes, each with several degraded variants (same scene, different rng).
const scenes: string[] = []
for (let s = 0; s < 3; s++) {
  const { svg } = proceduralItem(s * 7 + 3, 42)
  const shape = renderShape(svg, cfg, mulberry32(seedFor(200, s)))
  const bg = makeBackground(RES, RES, mulberry32(seedFor(300, s)), true)
  const clean = compositeOver(shape, bg)
  const variants = [cell(clean, 'clean (target)')]
  for (let v = 0; v < 6; v++) {
    variants.push(
      cell(degrade(clean, cfg, mulberry32(seedFor(400 + s * 100, v))), `degraded ${v + 1}`),
    )
  }
  scenes.push(`<div class="row">${variants.join('')}</div>`)
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>Dataset degradation pipeline</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; background: #fff; color: #111; }
  h1 { font-size: 1.25rem; } h2 { font-size: 1rem; margin-top: 2rem; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 20px; }
  figure { margin: 0; text-align: center; }
  img { display: block; border: 1px solid #ddd; border-radius: 4px; image-rendering: auto; }
  figcaption { font-size: 11px; color: #666; margin-top: 3px; }
  p { max-width: 60ch; color: #444; }
</style>
<h1>Dataset degradation pipeline</h1>
<p>The generator composites each shape over a procedural background, then corrupts a copy to form the model input. Ground
truth (the clean scene, left) is derived before corruption, so input and targets stay pixel-aligned. Every effect is
seeded, so a given (seed, index) reproduces the sample exactly.</p>
<h2>Procedural backgrounds</h2>
<p>Real uploads rarely sit on clean white: solid, gradient, radial, checker, stripes, and fractal/texture kinds.</p>
<div class="row">${backgrounds.join('')}</div>
<h2>Degradation range (same clean scene, different draws)</h2>
<p>Blur (isotropic/anisotropic), resampling, Gaussian + shot noise, gamma/brightness/contrast drift, dither or posterize,
and single/double JPEG — applied with randomized probability and strength.</p>
${scenes.join('\n')}
`

const out = new URL('degradation.html', import.meta.url)
writeFileSync(out, html)
console.log(`wrote ${out.pathname} — 8 backgrounds + ${scenes.length} scenes × 6 degraded variants`)
