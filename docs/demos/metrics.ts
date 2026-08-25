/**
 * Visual demo: the four evaluation metrics. One synthetic scene is compared
 * against itself and against three imperfect reconstructions — shifted, blurred
 * and posterized — and each pair is scored with mean Oklab dE (color accuracy),
 * SSIM (structure), symmetric Hausdorff distance (edge positions) and boundary
 * IoU (edge agreement), the metrics the eval harnesses and the tune scorer use.
 *
 * Run:  npx tsx docs/demos/metrics.ts
 * Output: docs/demos/metrics.html
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { deltaEOk, rgbToOklab } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { boundaryIoU, gaussianBlur, hausdorff, quantize, ssim } from '@trazor/raster'

const W = 160
const H = 160

/** The reference scene: teal disc + amber square on white, kept apart. */
function scene(): RasterImage {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let [r, g, b] = [255, 255, 255]
      const inDisc = (x - 54) ** 2 + (y - 54) ** 2 <= 30 * 30
      const inSquare = x >= 96 && x <= 144 && y >= 96 && y <= 144
      if (inDisc) [r, g, b] = [20, 127, 140]
      else if (inSquare) [r, g, b] = [230, 150, 40]
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width: W, height: H, data }
}

/** The scene translated by (dx, dy), clamped — a pure shift, no frame artifacts. */
function shifted(img: RasterImage, dx: number, dy: number): RasterImage {
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx))
      const sy = Math.min(H - 1, Math.max(0, y - dy))
      const i = (y * W + x) * 4
      const s = (sy * W + sx) * 4
      out[i] = img.data[s]
      out[i + 1] = img.data[s + 1]
      out[i + 2] = img.data[s + 2]
      out[i + 3] = 255
    }
  }
  return { width: W, height: H, data: out }
}

/**
 * Recolor with a fixed two-entry palette (the disc and square share one entry)
 * and rebuild — a pure palette error: every boundary stays exactly in place.
 */
function posterized(img: RasterImage, palette: string[]): RasterImage {
  const q = quantize(img, {
    k: palette.length,
    colorSpace: 'oklab',
    quality: 5,
    seed: 7,
    fixedPalette: palette,
  })
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = q.labels.data[y * W + x]
      if (l < 0) continue
      const i = (y * W + x) * 4
      out[i] = q.paletteRgb[l * 3]
      out[i + 1] = q.paletteRgb[l * 3 + 1]
      out[i + 2] = q.paletteRgb[l * 3 + 2]
      out[i + 3] = 255
    }
  }
  return { width: W, height: H, data: out }
}

/** Mean Oklab dE between two equally-sized rasters. */
function meanDE(a: RasterImage, b: RasterImage): number {
  let sum = 0
  const n = a.data.length >> 2
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const [l1, a1, b1] = rgbToOklab(a.data[i] / 255, a.data[i + 1] / 255, a.data[i + 2] / 255)
    const [l2, a2, b2] = rgbToOklab(b.data[i] / 255, b.data[i + 1] / 255, b.data[i + 2] / 255)
    sum += deltaEOk(l1, a1, b1, l2, a2, b2)
  }
  return n > 0 ? sum / n : 0
}

function pngUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

const ref = scene()
const cases: { name: string; note: string; img: RasterImage }[] = [
  { name: 'Identical', note: 'the reconstruction is the source', img: scene() },
  {
    name: 'Shifted 2 px',
    note: 'a sub-pixel tracing error: colors fine, edges off',
    img: shifted(ref, 2, 1),
  },
  {
    name: 'Blurred',
    note: 'soft anti-aliased edges: edges near, structure softened',
    img: gaussianBlur(ref, 2),
  },
  {
    name: 'Recolored (disc → amber)',
    note: 'a pure palette error: colors off, every edge exactly in place',
    img: posterized(ref, ['#ffffff', '#e69628']),
  },
]

const fmt = (v: number, d = 3): string => (Number.isFinite(v) ? v.toFixed(d) : '∞')

const cards = cases
  .map((c) => {
    const de = meanDE(c.img, ref)
    const s = ssim(c.img, ref)
    const hd = hausdorff(c.img, ref)
    const io = boundaryIoU(c.img, ref)
    return `<section class="card">
    <figure><img src="${pngUri(c.img)}" alt="${c.name}"><figcaption>${c.name}</figcaption></figure>
    <p class="note">${c.note}</p>
    <table>
      <tr><td>mean dE</td><td class="v">${fmt(de, 4)}</td><td class="d">color accuracy, lower better</td></tr>
      <tr><td>SSIM</td><td class="v">${fmt(s)}</td><td class="d">structure, 1 = identical</td></tr>
      <tr><td>Hausdorff</td><td class="v">${fmt(hd, 2)}</td><td class="d">worst edge gap in px</td></tr>
      <tr><td>boundary IoU</td><td class="v">${fmt(io)}</td><td class="d">edge agreement at 2 px, 1 = same</td></tr>
    </table>
  </section>`
  })
  .join('\n')

const html = `<title>Evaluation Metrics — dE vs SSIM vs Hausdorff vs boundary IoU</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--accent:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--accent:#35b7c5;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:62rem;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 1.6rem;font-size:.95rem;max-width:52rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}
  .card{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1rem}
  figure{margin:0;text-align:center}
  img{width:9rem;height:9rem;image-rendering:pixelated;border:1px solid var(--line);border-radius:8px;background:#fff}
  figcaption{font-weight:600;margin-top:.4rem;font-size:.9rem}
  .note{color:var(--muted);font-size:.8rem;margin:.4rem 0 .8rem;min-height:2.2em}
  table{width:100%;border-collapse:collapse;font-size:.78rem}
  td{padding:.28rem .2rem;border-top:1px solid var(--line)}
  td:first-child{font-weight:600}
  td.v{text-align:right;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600;white-space:nowrap}
  td.d{color:var(--muted);padding-left:.5rem}
</style>
<div class="wrap">
  <h1>One scene, four metrics</h1>
  <p class="sub">The same synthetic source (a teal disc and an amber square) is compared against four reconstructions. Each metric answers a different question: <strong>mean dE</strong> asks "are the colors right?", <strong>SSIM</strong> asks "does the structure match?", <strong>Hausdorff</strong> asks "how far is the worst-placed edge?", and <strong>boundary IoU</strong> asks "do the edges agree within a small tolerance?". A shifted image is nearly perfect on dE but bad on Hausdorff; a posterized image is exactly the reverse — which is why the eval harnesses and the tune scorer report all of them, not one.</p>
  <div class="grid">
    ${cards}
  </div>
</div>`

const outPath = fileURLToPath(new URL('./metrics.html', import.meta.url))
writeFileSync(outPath, html)
console.log('wrote', outPath)
for (const c of cases) {
  console.log(
    `${c.name.padEnd(18)} dE ${fmt(meanDE(c.img, ref), 4)}  SSIM ${fmt(ssim(c.img, ref))}  HD ${fmt(hausdorff(c.img, ref), 2)}  bIoU ${fmt(boundaryIoU(c.img, ref))}`,
  )
}
