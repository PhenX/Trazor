/**
 * Visual demo: a faint tonal line scan traced as black & white over-inks, and
 * the recommender now traces it as grayscale instead. A scanned ink drawing,
 * engraving or technical drawing carries real gray tone — faint construction
 * lines, mid-gray hatching, JPEG halos around each stroke. A bw threshold turns
 * all of that solid black: thin lines thicken and hatched areas flood into black
 * masses. `@trazor/assist` routes an achromatic line-art scan that is not cleanly
 * two-tone to grayscale tonal layers, which keep each stroke at its true
 * darkness. The synthetic scan below reproduces the effect; each is traced both
 * ways and the recommender's auto pick is outlined.
 *
 * Run:  npx tsx docs/demos/lineart-overink.ts
 * Output: docs/demos/lineart-overink.html
 */
import { writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { createRaster, normalizeSettings, getProfile, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeImage, recommendSettings } from '@trazor/assist'

const W = 300
const H = 200

/** Deterministic value noise in [-1, 1] — stands in for faint scanner grain. */
function grain(x: number, y: number): number {
  let s = (x * 374761393 + y * 668265263) & 0x7fffffff
  s = (s ^ (s >> 13)) * 1274126177
  return (((s ^ (s >> 16)) & 0xffff) / 0xffff) * 2 - 1
}

/** Smooth coverage of a soft stroke: 1 at the centerline, ramping to 0 over ~1px
 *  past its half-width — a thin anti-aliased line, not a hard-edged one. */
function stroke(dist: number, half: number): number {
  return Math.max(0, Math.min(1, half + 0.75 - dist))
}

/** Distance from (x,y) to the segment (ax,ay)-(bx,by). */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)))
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy))
}

/**
 * A faint technical-drawing scan on bright paper. Every mark is drawn as a thin,
 * anti-aliased, *gray* stroke — faint pencil ink, not solid black — over a
 * lightly grained paper ground: an outer frame and a strong outline (darker
 * gray), inner construction lines and a dimension rule (fainter gray), a circle,
 * and a panel of fine diagonal hatching. Neutral (R=G=B), bright and edgy but
 * carrying real mid-gray a bw threshold thickens and floods to solid black.
 */
function tonalScan(): RasterImage {
  const img = createRaster(W, H)
  // ink darkness (Oklab-ish luminance target) by role, all mid/dark gray, none black.
  const PAPER = 246
  const INK_STRONG = 96 // main outline
  const INK_FAINT = 150 // construction lines, hatching, dimension rule
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ink = 0 // 0..1 coverage of the darkest contribution
      let inkLevel = PAPER
      const add = (cov: number, level: number): void => {
        if (cov > ink) {
          ink = cov
          inkLevel = level
        }
      }
      // Strong outline: an inner rectangle.
      add(stroke(segDist(x, y, 44, 58, 256, 58), 0.7), INK_STRONG)
      add(stroke(segDist(x, y, 44, 150, 256, 150), 0.7), INK_STRONG)
      add(stroke(segDist(x, y, 44, 58, 44, 150), 0.7), INK_STRONG)
      add(stroke(segDist(x, y, 256, 58, 256, 150), 0.7), INK_STRONG)
      // A circle (flange), same strong ink.
      add(stroke(Math.abs(Math.hypot(x - 96, y - 104) - 30), 0.6), INK_STRONG)
      // Faint construction grid + a dashed dimension rule below.
      if (x % 36 === 0) add(stroke(segDist(x, y, x, 20, x, 184), 0.4), INK_FAINT)
      if (y % 32 === 0) add(stroke(segDist(x, y, 20, y, 280, y), 0.4), INK_FAINT)
      if (Math.floor(x / 6) % 2 === 0) add(stroke(Math.abs(y - 176), 0.4), INK_FAINT)
      // Fine diagonal hatching inside the right panel — faint, closely spaced.
      if (x > 176 && x < 252 && y > 70 && y < 140) {
        add(stroke(Math.abs(((x + y) % 7) - 1) * 0.9, 0.4), INK_FAINT)
      }
      const g = Math.round(PAPER + (inkLevel - PAPER) * ink + grain(x, y) * 2.5)
      const v = Math.max(0, Math.min(255, g))
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`

/** Encode a RasterImage as a base64 PNG data URI (dev-only, for the source pane). */
function dataUri(img: RasterImage): string {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

function card(label: string, auto: boolean, res: VectorizeResult): string {
  return `<figure class="${auto ? 'auto' : ''}">
      <figcaption>${label}${auto ? ' <b>· auto pick</b>' : ''}</figcaption>
      <div class="art">${res.svg}</div>
      <div class="stat">${res.stats.pathCount} paths · ${res.stats.nodeCount} nodes · ${kb(res.stats.byteLength)}</div>
    </figure>`
}

async function main(): Promise<void> {
  const image = tonalScan()
  const rec = recommendSettings(analyzeImage(image))
  const autoIsGrayscale = rec.patch.mode === 'grayscale'

  // The two routes: the old black & white (bw-sketch profile) and the new
  // grayscale tonal trace (the recommender's actual auto settings).
  const bw = await vectorize(image, normalizeSettings(getProfile('bw-sketch').patch))
  const auto = await vectorize(
    image,
    normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch } as VectorizeSettings),
  )

  console.log(
    `auto: profile=${rec.profileId} mode=${rec.patch.mode} paletteSize=${rec.patch.paletteSize}`,
  )
  console.log(`  bw       ${bw.stats.pathCount} paths / ${bw.stats.nodeCount} nodes`)
  console.log(`  grayscale ${auto.stats.pathCount} paths / ${auto.stats.nodeCount} nodes`)

  const html = `<title>Line-art scan: over-inked B&W vs. grayscale</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
  :root{--bg:#eceff3;--paper:#fff;--ink:#16202b;--muted:#55636f;--line:#dde3ea;--pick:#0e7f8c;}
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d131a;--paper:#151d26;
    --ink:#e6ebf1;--muted:#9aa8b4;--line:#223040;--pick:#35b7c5;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.5;padding:2rem 1rem 4rem}
  .wrap{max-width:60rem;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .3rem}
  .sub{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
  .row{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:1.2rem}
  .trio{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
  figure{margin:0;text-align:center;border:2px solid transparent;border-radius:10px;padding:.5rem}
  figure.auto{border-color:var(--pick)}
  figcaption{font-size:.72rem;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
  figcaption b{color:var(--pick)}
  .art{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
  .art svg,.art img{display:block;width:100%;height:auto;image-rendering:auto}
  .stat{font-size:.74rem;color:var(--muted);margin-top:.45rem;font-variant-numeric:tabular-nums}
  @media(max-width:40rem){.trio{grid-template-columns:1fr}}
</style>
<div class="wrap">
  <h1>Line-art scan: over-inked B&amp;W vs. grayscale</h1>
  <p class="sub">A faint technical-drawing scan carries real gray tone — light construction lines, mid-gray hatching, halos around each stroke. Traced as <b>black &amp; white</b> a threshold turns all of it solid ink: thin lines thicken and the hatched panel floods to a black mass. The recommender routes an achromatic line-art scan that is not cleanly two-tone to <b>grayscale</b> tonal layers, which keep each stroke at its true darkness. Measured over a corpus of real scanned drawings, this cuts mean Oklab ΔE ≈ 19% and spurious-hue ≈ 59%. The <b>auto pick</b> is outlined.</p>
  <section class="row">
    <div class="trio">
      <figure>
        <figcaption>source scan</figcaption>
        <div class="art"><img src="${dataUri(image)}" alt="source scan" width="${W}" height="${H}"></div>
        <div class="stat">faint neutral tones on bright paper</div>
      </figure>
      ${card('black &amp; white', !autoIsGrayscale, bw)}
      ${card('grayscale', autoIsGrayscale, auto)}
    </div>
  </section>
</div>`

  const outPath = new URL('./lineart-overink.html', import.meta.url).pathname
  writeFileSync(outPath, html)
  console.log('wrote', outPath)
}

void main()
