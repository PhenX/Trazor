#!/usr/bin/env node
/**
 * Generate a small, deterministic raster corpus for the tracer comparison
 * (scripts/eval/tracer-compare.ts). Browser-free (plain typed arrays + pngjs),
 * so it runs anywhere `npm run eval:*` does — no canvas, no network.
 *
 * The set spans the families where the two tracers trade places: flat / logo /
 * illustration / line-art / pixel (Trazor's curve chain + arc fitting) and
 * photo / gradient (vtracer's gradient layering). It is a signal generator, not
 * a benchmark of record — drop your own PNGs in a folder and point
 * `tracer-compare --data` at it for real inputs.
 *
 * Usage:  node scripts/eval/make-corpus.mjs [--out scripts/eval/corpus]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

function parseOut(argv) {
  const i = argv.indexOf('--out')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'scripts/eval/corpus'
}

/** Deterministic PRNG (same family as @trazor/core mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A mutable RGBA canvas backed by a flat byte array. */
function canvas(w, h, bg = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0]
    data[i + 1] = bg[1]
    data[i + 2] = bg[2]
    data[i + 3] = bg[3]
  }
  return { w, h, data }
}

function px(img, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return
  const i = (y * img.w + x) * 4
  const ia = a / 255
  img.data[i] = img.data[i] * (1 - ia) + r * ia
  img.data[i + 1] = img.data[i + 1] * (1 - ia) + g * ia
  img.data[i + 2] = img.data[i + 2] * (1 - ia) + b * ia
  img.data[i + 3] = Math.max(img.data[i + 3], a)
}

function rect(img, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(img.h, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(img.w, x1 | 0); x++) px(img, x, y, color)
}

function disc(img, cx, cy, r, color) {
  const r2 = r * r
  for (let y = Math.max(0, (cy - r) | 0); y <= Math.min(img.h - 1, (cy + r) | 0); y++)
    for (let x = Math.max(0, (cx - r) | 0); x <= Math.min(img.w - 1, (cx + r) | 0); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) px(img, x, y, color)
    }
}

/** Even-odd fill of a polygon given as [[x,y],...], via per-row ray casting. */
function polygon(img, pts, color) {
  let minY = img.h
  let maxY = 0
  for (const [, y] of pts) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (let y = Math.max(0, minY | 0); y <= Math.min(img.h - 1, maxY | 0); y++) {
    const xs = []
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, xs[k] | 0); x < Math.min(img.w, xs[k + 1] | 0); x++)
        px(img, x, y, color)
  }
}

const lerp = (a, b, t) => a + (b - a) * t
function mix(c0, c1, t) {
  return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t), 255]
}

/** Vertical multi-stop gradient. stops = [[t, [r,g,b]], ...] with t in [0,1]. */
function vGradient(img, stops) {
  for (let y = 0; y < img.h; y++) {
    const t = y / (img.h - 1)
    let a = stops[0]
    let b = stops[stops.length - 1]
    for (let i = 0; i + 1 < stops.length; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i]
        b = stops[i + 1]
        break
      }
    }
    const lt = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0])
    const color = mix(a[1], b[1], lt)
    for (let x = 0; x < img.w; x++) px(img, x, y, color)
  }
}

/** Additive radial glow toward `color`, fading to zero at `r`. */
function glow(img, cx, cy, r, color) {
  for (let y = Math.max(0, (cy - r) | 0); y <= Math.min(img.h - 1, (cy + r) | 0); y++)
    for (let x = Math.max(0, (cx - r) | 0); x <= Math.min(img.w - 1, (cx + r) | 0); x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d >= r) continue
      const w = 1 - d / r
      const i = (y * img.w + x) * 4
      img.data[i] = Math.min(255, img.data[i] + (color[0] - img.data[i]) * w)
      img.data[i + 1] = Math.min(255, img.data[i + 1] + (color[1] - img.data[i + 1]) * w)
      img.data[i + 2] = Math.min(255, img.data[i + 2] + (color[2] - img.data[i + 2]) * w)
    }
}

function addNoise(img, amp, seed) {
  const rnd = mulberry32(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue
    const n = (rnd() - 0.5) * amp
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
}

function star(cx, cy, outer, inner) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

// ---- Family generators (mirror apps/web/src/lib/samples.ts in spirit) --------

/** Flat, saturated badge — nested flat discs + a star. Curved edges → arc fitting. */
function badge() {
  const img = canvas(512, 512)
  const c = 256
  disc(img, c, c, 232, [35, 64, 142])
  disc(img, c, c, 140, [226, 59, 78])
  disc(img, c, c, 118, [15, 157, 143])
  polygon(img, star(c, c - 6, 92, 38), [255, 255, 255])
  polygon(img, star(c, c - 6, 58, 24), [255, 200, 74])
  return img
}

/** Flat poster landscape — solid sky bands, sun, mountain silhouettes, water. */
function peaks() {
  const img = canvas(512, 512, [255, 210, 122, 255])
  rect(img, 0, 240, 512, 512, [255, 176, 102])
  disc(img, 256, 190, 78, [255, 244, 220])
  polygon(
    img,
    [
      [0, 300],
      [120, 210],
      [230, 300],
      [336, 210],
      [448, 300],
      [512, 250],
      [512, 320],
      [0, 320],
    ],
    [232, 130, 92],
  )
  polygon(
    img,
    [
      [0, 392],
      [96, 320],
      [214, 392],
      [326, 300],
      [438, 392],
      [512, 350],
      [512, 430],
      [0, 430],
    ],
    [200, 95, 78],
  )
  rect(img, 0, 430, 512, 512, [47, 59, 87])
  return img
}

/** Photo-like sunset — smooth gradients + a glowing sun + mild sensor noise. */
function sunset() {
  const img = canvas(512, 512)
  vGradient(img, [
    [0, [32, 50, 110]],
    [0.45, [180, 90, 131]],
    [0.68, [240, 153, 106]],
    [0.82, [247, 200, 119]],
    [1, [250, 220, 150]],
  ])
  glow(img, 320, 300, 200, [255, 240, 200])
  disc(img, 320, 300, 52, [255, 246, 216])
  // Back-to-front hills as darker translucent bands keep soft gradient edges.
  polygon(
    img,
    [
      [0, 360],
      [160, 330],
      [330, 372],
      [512, 340],
      [512, 420],
      [0, 420],
    ],
    [110, 74, 100, 235],
  )
  polygon(
    img,
    [
      [0, 430],
      [200, 402],
      [420, 440],
      [512, 415],
      [512, 512],
      [0, 512],
    ],
    [40, 30, 56, 245],
  )
  addNoise(img, 8, 0xc0ffee)
  return img
}

/** High-contrast black on white — line-art / B&W tracing. */
function ink() {
  const img = canvas(512, 512)
  disc(img, 330, 150, 74, [0, 0, 0])
  polygon(
    img,
    [
      [0, 380],
      [110, 300],
      [210, 388],
      [312, 250],
      [400, 360],
      [470, 300],
      [512, 380],
      [512, 470],
      [0, 470],
    ],
    [0, 0, 0],
  )
  for (const [bx, by, s] of [
    [120, 130, 1],
    [180, 158, 0.82],
    [220, 120, 0.7],
  ]) {
    const wng = 26 * s
    polygon(
      img,
      [
        [bx - wng, by],
        [bx, by - wng * 0.5],
        [bx + wng, by],
        [bx, by - wng * 0.2],
      ],
      [0, 0, 0],
    )
  }
  return img
}

const SPRITE = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...##..............##...',
  '.....##..........##.....',
  '...##################...',
  '...##################...',
  '.####..##########..####.',
  '.####..##########..####.',
  '########################',
  '########################',
  '##..################..##',
  '##..################..##',
  '##..##............##..##',
  '##..##............##..##',
  '......####....####......',
  '......####....####......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
]

/** Genuine 24×24 pixel-art invader on transparent — pixel mode + alpha. */
function sprite() {
  const img = canvas(24, 24, [0, 0, 0, 0])
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (SPRITE[y][x] === '#') px(img, x, y, y >= 16 ? [28, 143, 69] : [61, 220, 104])
  return img
}

/** Multi-color flat mandala of petal-discs — illustration family. */
function bloom() {
  const img = canvas(512, 512, [251, 246, 236, 255])
  const c = 256
  const rings = [
    { n: 12, r: 190, dot: 30, color: [231, 111, 81], phase: 0 },
    { n: 12, r: 150, dot: 26, color: [244, 162, 97], phase: Math.PI / 12 },
    { n: 10, r: 112, dot: 24, color: [42, 157, 143], phase: 0 },
    { n: 10, r: 78, dot: 20, color: [138, 177, 125], phase: Math.PI / 10 },
  ]
  for (const ring of rings)
    for (let i = 0; i < ring.n; i++) {
      const a = ring.phase + (i / ring.n) * Math.PI * 2
      disc(img, c + Math.cos(a) * ring.r, c + Math.sin(a) * ring.r, ring.dot, ring.color)
    }
  for (const [r, col] of [
    [54, [233, 196, 106]],
    [34, [38, 70, 83]],
    [18, [231, 111, 81]],
  ])
    disc(img, c, c, r, col)
  return img
}

const CORPUS = [
  { name: 'badge.png', family: 'flat', make: badge },
  { name: 'peaks.png', family: 'flat', make: peaks },
  { name: 'bloom.png', family: 'illustration', make: bloom },
  { name: 'sunset.png', family: 'photo', make: sunset },
  { name: 'ink.png', family: 'lineart', make: ink },
  { name: 'sprite.png', family: 'pixel', make: sprite },
]

function savePng(path, img) {
  const png = new PNG({ width: img.w, height: img.h })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  writeFileSync(path, PNG.sync.write(png))
}

function main() {
  const out = parseOut(process.argv.slice(2))
  mkdirSync(out, { recursive: true })
  const families = {}
  for (const item of CORPUS) {
    savePng(join(out, item.name), item.make())
    families[item.name] = item.family
    console.log(`  ${item.family.padEnd(12)} ${item.name}`)
  }
  writeFileSync(join(out, 'families.json'), `${JSON.stringify(families, null, 2)}\n`)
  console.log(`\n  ${CORPUS.length} images + families.json → ${out}`)
}

main()
