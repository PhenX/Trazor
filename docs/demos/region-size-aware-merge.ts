/**
 * Visual demo: size-aware region merging (SRM; Nock & Nielsen 2004) on the
 * region-growing front-end for flat art. One flat "sunset" — a coral sun over a
 * pink sky and a deeper horizon band, three colors only a little apart, plus a
 * few small specks — is segmented through the real `segmentRegions` twice, with
 * everything else held equal.
 *
 * The point: a single flat merge threshold cannot serve both scales. Set high
 * enough to fold anti-alias slivers, it also averages the sun, sky and horizon
 * into one washed-out mean (the "they lack colors" failure). The size-aware
 * predicate decays the tolerance as regions grow, so the three large fields stay
 * distinct while the small specks still fold — no single fixed threshold does
 * both.
 *
 * Run:  npx tsx docs/demos/region-size-aware-merge.ts
 * Output: docs/demos/region-size-aware-merge.html
 */
import { writeFileSync } from 'node:fs'
import { createRaster, oklabToRgb, setPixel } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { segmentRegions } from '@trazor/raster'
import { PNG } from 'pngjs'

/** An Oklab color as an 8-bit RGB triple. */
function ok(L: number, a: number, b: number): [number, number, number] {
  const [r, g, bl] = oklabToRgb(L, a, b)
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [c(r), c(g), c(bl)]
}

// Three close Oklab fields (pairwise ΔE ≈ 0.05–0.09) — merged by a flat 0.1
// threshold, kept apart by the near-duplicate floor of size-aware merging.
const SKY = ok(0.72, 0.06, 0.02)
const HORIZON = ok(0.64, 0.1, 0.035)
const SUN = ok(0.7, 0.13, 0.06)
const SPECK = ok(0.5, 0.11, 0.05)

/** Coral sun over a pink sky and a deeper horizon band, with a few small specks. */
function scene(): RasterImage {
  const W = 260
  const H = 170
  const img = createRaster(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      setPixel(img, x, y, ...(y > 120 ? HORIZON : SKY))
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x + 0.5 - 130, y + 0.5 - 78) <= 42) setPixel(img, x, y, ...SUN)
    }
  }
  // Small specks (birds) — below the size where a distinct color earns its own region.
  for (const [cx, cy] of [
    [60, 46],
    [72, 52],
    [196, 40],
  ]) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) setPixel(img, cx + dx, cy + dy, ...SPECK)
    }
  }
  return img
}

/** Paint a segmentation's label map back to a flat-color image (region → its mean). */
function paint(img: RasterImage, seg: ReturnType<typeof segmentRegions>): RasterImage {
  const out = createRaster(img.width, img.height)
  const { data: labels } = seg.labels
  const pal = seg.paletteRgb
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    const o = i * 4
    if (l < 0) {
      out.data[o] = out.data[o + 1] = out.data[o + 2] = 255
      out.data[o + 3] = 255
      continue
    }
    out.data[o] = pal[l * 3]
    out.data[o + 1] = pal[l * 3 + 1]
    out.data[o + 2] = pal[l * 3 + 2]
    out.data[o + 3] = 255
  }
  return out
}

/** RasterImage → a `data:image/png` URI (pixels are exact; no resampling). */
function dataUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64')
}

const img = scene()
const off = segmentRegions(img, { mergeThreshold: 0.1, mergeSizeBias: 0 })
const on = segmentRegions(img, { mergeThreshold: 0.1, mergeSizeBias: 0.8 })

const swatches = (seg: ReturnType<typeof segmentRegions>): string =>
  seg.paletteHex
    .map((c) => `<span class="sw" style="background:${c}" title="${c}"></span>`)
    .join('')

const html = `<title>Size-aware region merge</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:56rem;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
  .pair{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
  figure{margin:0;text-align:center;background:var(--paper);border:1px solid var(--line);
    border-radius:12px;padding:1rem}
  figcaption{font-size:.8rem;color:var(--muted);margin-bottom:.6rem}
  figcaption b{color:var(--ink)}
  img{width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line);border-radius:6px}
  .sws{margin-top:.6rem;display:flex;gap:4px;justify-content:center;flex-wrap:wrap}
  .sw{width:16px;height:16px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
  .count{font-variant-numeric:tabular-nums}
  @media(max-width:40rem){.pair{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Size-aware region merge (SRM)</h1>
  <p class="sub">A flat sunset — sun, sky and horizon only a little apart in color — segmented through the real
    <code>segmentRegions</code> with everything held equal but the merge rule. A flat threshold high enough to fold the
    small specks also averages the three large fields into one; the size-aware predicate keeps them apart while the
    specks still fold.</p>
  <div class="pair">
    <figure>
      <figcaption><b>Source</b><br>flat scene</figcaption>
      <img src="${dataUri(img)}" alt="source">
    </figure>
    <figure>
      <figcaption><b>Flat threshold</b><br><span class="count">${off.labels.count} colors</span> — washed out</figcaption>
      <img src="${dataUri(paint(img, off))}" alt="flat merge">
      <div class="sws">${swatches(off)}</div>
    </figure>
    <figure>
      <figcaption><b>Size-aware (SRM)</b><br><span class="count">${on.labels.count} colors</span> — kept apart</figcaption>
      <img src="${dataUri(paint(img, on))}" alt="size-aware merge">
      <div class="sws">${swatches(on)}</div>
    </figure>
  </div>
</div>`

const outPath = new URL('./region-size-aware-merge.html', import.meta.url).pathname
writeFileSync(outPath, html)
console.log('wrote', outPath)
console.log(`flat merge:  ${off.labels.count} colors`)
console.log(`size-aware:  ${on.labels.count} colors`)
