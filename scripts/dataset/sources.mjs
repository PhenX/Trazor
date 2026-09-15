// SVG sources. Two are provided: a procedural synthesizer (unlimited, exact
// control, no assets — the built-in source), and a directory walker for a real
// corpus (fonts, icon sets, clip art). Each yields { id, family, svg }; `family`
// drives the train/val/test split so no source family straddles splits.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { chance, gaussian, int, mulberry32, pick, seedFor, uniform } from './random.mjs'

const ARCHETYPES = ['geo', 'blobs', 'rings', 'stripes', 'scatter']

const PALETTES = [
  ['#1f2933', '#3e4c59', '#7b8794', '#cbd2d9', '#e4e7eb'],
  ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f', '#c81d25'],
  ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
  ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#ffffff', '#ffd166', '#06d6a0', '#118ab2', '#073b4c'],
]

/** One procedural sample by index, fully determined by (index, seed). */
export function proceduralItem(index, seed) {
  const family = ARCHETYPES[index % ARCHETYPES.length]
  const rng = mulberry32(seedFor(seed, index * 2))
  return { id: `proc-${String(index).padStart(5, '0')}`, family, svg: synthSvg(family, rng) }
}

export function* dirSource(dir, cap) {
  const files = walkSvg(dir)
  const list = cap > 0 ? files.slice(0, cap) : files
  for (const file of list) {
    const rel = relative(dir, file)
    const famDir = dirname(rel)
    yield {
      id: rel.replaceAll(sep, '/'),
      // The file's whole subdir path is the source family, so a nested corpus
      // (e.g. category/pack/bucket) splits per leaf group and no pack straddles
      // train/val/test. A file directly in `dir` is its own family (flat corpus).
      family: famDir === '.' ? rel.replaceAll(sep, '/') : famDir.replaceAll(sep, '/'),
      svg: canonicalize(readFileSync(file, 'utf8')),
    }
  }
}

// Scaffold pass-through. A production pipeline flattens transforms, resolves
// <use>, and expands shorthand into the @trazor/svg path model so targets
// match engine output; see docs/ML_STRATEGY.md.
function canonicalize(svg) {
  return svg
}

function walkSvg(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // skip .cache, .git, dotfiles
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkSvg(full))
    else if (entry.name.toLowerCase().endsWith('.svg')) out.push(full)
  }
  return out.toSorted() // stable order → stable ids and split assignment
}

function synthSvg(family, rng) {
  const S = 100
  const palette = pick(rng, PALETTES)
  const parts = [`<rect width="${S}" height="${S}" fill="${pick(rng, palette)}"/>`]
  const n = int(rng, 3, 9)
  for (let k = 0; k < n; k++) parts.push(shape(family, rng, palette, S))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">${parts.join('')}</svg>`
}

function shape(family, rng, palette, S) {
  const fill = pick(rng, palette)
  const opacity = chance(rng, 0.25) ? uniform(rng, 0.4, 0.9).toFixed(2) : '1'
  const cx = uniform(rng, 0, S)
  const cy = uniform(rng, 0, S)
  const r = Math.abs(gaussian(rng, S * 0.18, S * 0.1)) + 4
  const attr = `fill="${fill}" fill-opacity="${opacity}"`
  switch (family) {
    case 'rings':
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${fill}" stroke-width="${f(uniform(rng, 1, 6))}"/>`
    case 'stripes': {
      const w = uniform(rng, 4, 16)
      return `<rect x="${f(cx)}" y="0" width="${f(w)}" height="${S}" ${attr} transform="rotate(${f(uniform(rng, -30, 30))} ${f(cx)} ${f(S / 2)})"/>`
    }
    case 'scatter':
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(uniform(rng, 1, 5))}" ${attr}/>`
    case 'blobs':
      return blob(cx, cy, r, rng, attr)
    default: {
      const kind = int(rng, 0, 2)
      if (kind === 0) return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${attr}/>`
      if (kind === 1) {
        return `<rect x="${f(cx - r)}" y="${f(cy - r)}" width="${f(r * 2)}" height="${f(r * 1.4)}" rx="${f(uniform(rng, 0, r * 0.4))}" ${attr}/>`
      }
      return star(cx, cy, r, int(rng, 3, 7), rng, attr)
    }
  }
}

// Closed polygon around a jittered circle — an irregular organic outline.
function blob(cx, cy, r, rng, attr) {
  const n = int(rng, 6, 10)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * uniform(rng, 0.6, 1.3)
    pts.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`)
  }
  return `<polygon points="${pts.join(' ')}" ${attr}/>`
}

// ---------------------------------------------------------------------------
// Silhouette source: one ink color on a paper ground (docs/SIGNED_FIELD_PREPASS.md,
// docs/ML_STRATEGY.md — fonts and line art are the strongest silhouette signal).
// Dark ink shapes on a light paper ground, so the coverage field (1 − Oklab L of
// the clean composite) is ~1 on ink and ~0 on paper and the bw tracer's boundary
// sits on the true ink edge. Glyph-like blobs with counters, strokes of varying
// width, holes, and thin features at several scales — the silhouette content the
// procedural multi-color source never produces. Counters and holes are the paper
// color painted back over the ink, a valid two-tone silhouette (no even-odd path).

const SILHOUETTE_FAMILIES = ['glyph', 'stroke', 'blob', 'thin', 'mixed']
// Near-white papers and near-black inks: each sample is a single ink on one paper.
const PAPERS = ['#ffffff', '#fbfbf9', '#f5f2ea', '#f7f7f4', '#efece4', '#fdfaf3']
const INKS = ['#000000', '#0f0f0f', '#181818', '#1e1a17', '#101418', '#211c17']

/** One procedural silhouette sample by index, fully determined by (index, seed). */
export function silhouetteItem(index, seed) {
  const family = SILHOUETTE_FAMILIES[index % SILHOUETTE_FAMILIES.length]
  const rng = mulberry32(seedFor(seed, index * 2))
  return { id: `sil-${String(index).padStart(5, '0')}`, family, svg: synthSilhouette(family, rng) }
}

function synthSilhouette(family, rng) {
  const S = 100
  const paper = pick(rng, PAPERS)
  const ink = pick(rng, INKS)
  const parts = [`<rect width="${S}" height="${S}" fill="${paper}"/>`]
  const kinds =
    family === 'mixed' ? pickTwoDistinct(rng, ['glyph', 'stroke', 'blob', 'thin']) : [family]
  for (const kind of kinds) {
    for (const el of silhouetteParts(kind, rng, S, ink, paper)) parts.push(el)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">${parts.join('')}</svg>`
}

// Two distinct archetypes for a mixed sample (deterministic, no rejection loop).
function pickTwoDistinct(rng, arr) {
  const a = pick(rng, arr)
  let b = pick(rng, arr)
  if (b === a) b = arr[(arr.indexOf(a) + 1) % arr.length]
  return [a, b]
}

function silhouetteParts(kind, rng, S, ink, paper) {
  if (kind === 'glyph') return glyphParts(rng, S, ink, paper)
  if (kind === 'stroke') return strokeParts(rng, S, ink)
  if (kind === 'thin') return thinParts(rng, S, ink)
  return blobParts(rng, S, ink, paper)
}

// Glyph-like marks with counters (an O, a frame, an H, an E) — holes carry the
// thin-feature and enclosed-boundary structure a silhouette model must learn.
function glyphParts(rng, S, ink, paper) {
  const parts = []
  const count = int(rng, 1, 2)
  for (let g = 0; g < count; g++) {
    const cx = uniform(rng, S * 0.28, S * 0.72)
    const cy = uniform(rng, S * 0.28, S * 0.72)
    const r = Math.abs(gaussian(rng, S * 0.22, S * 0.06)) + S * 0.1
    const kind = int(rng, 0, 3)
    if (kind === 0) {
      // O — ink disc with a paper counter.
      parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${ink}"/>`)
      parts.push(
        `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * uniform(rng, 0.4, 0.66))}" fill="${paper}"/>`,
      )
    } else if (kind === 1) {
      // Frame — ink rect with a paper window.
      const w = r * 2
      const h = r * uniform(rng, 1.6, 2.2)
      parts.push(
        `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(uniform(rng, 0, r * 0.3))}" fill="${ink}"/>`,
      )
      const iw = w * uniform(rng, 0.3, 0.55)
      const ih = h * uniform(rng, 0.3, 0.7)
      parts.push(
        `<rect x="${f(cx - iw / 2)}" y="${f(cy - ih / 2)}" width="${f(iw)}" height="${f(ih)}" fill="${paper}"/>`,
      )
    } else if (kind === 2) {
      // H — two stems and a crossbar.
      const bw = r * uniform(rng, 0.28, 0.42)
      const h = r * 2
      parts.push(
        `<rect x="${f(cx - r)}" y="${f(cy - h / 2)}" width="${f(bw)}" height="${f(h)}" fill="${ink}"/>`,
      )
      parts.push(
        `<rect x="${f(cx + r - bw)}" y="${f(cy - h / 2)}" width="${f(bw)}" height="${f(h)}" fill="${ink}"/>`,
      )
      parts.push(
        `<rect x="${f(cx - r)}" y="${f(cy - bw / 2)}" width="${f(2 * r)}" height="${f(bw)}" fill="${ink}"/>`,
      )
    } else {
      // E/F — a stem with arms.
      const bw = r * uniform(rng, 0.28, 0.42)
      const h = r * 2
      parts.push(
        `<rect x="${f(cx - r)}" y="${f(cy - h / 2)}" width="${f(bw)}" height="${f(h)}" fill="${ink}"/>`,
      )
      const arms = int(rng, 2, 3)
      for (let i = 0; i < arms; i++) {
        const ay = cy - h / 2 + (i / (arms - 1)) * (h - bw)
        parts.push(
          `<rect x="${f(cx - r)}" y="${f(ay)}" width="${f(r * uniform(rng, 1.2, 1.8))}" height="${f(bw)}" fill="${ink}"/>`,
        )
      }
    }
  }
  return parts
}

// Open strokes (lines and quadratic curves) of varying width — the pen and
// engraving strokes line art is made of, some deliberately hairline-thin.
function strokeParts(rng, S, ink) {
  const parts = []
  const n = int(rng, 2, 5)
  for (let i = 0; i < n; i++) {
    const w = Math.abs(gaussian(rng, S * 0.03, S * 0.03)) + 0.6
    const cap = pick(rng, ['round', 'butt', 'square'])
    const segs = int(rng, 1, 4)
    let d = `M ${f(uniform(rng, 0, S))} ${f(uniform(rng, 0, S))}`
    for (let k = 0; k < segs; k++) {
      d += chance(rng, 0.5)
        ? ` Q ${f(uniform(rng, 0, S))} ${f(uniform(rng, 0, S))} ${f(uniform(rng, 0, S))} ${f(uniform(rng, 0, S))}`
        : ` L ${f(uniform(rng, 0, S))} ${f(uniform(rng, 0, S))}`
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${f(w)}" stroke-linecap="${cap}" stroke-linejoin="round"/>`,
    )
  }
  return parts
}

// Thin features at several scales: hairline bars at random angles, thin rings,
// and small dots — the sub-pixel structure the classical field loses on noise.
function thinParts(rng, S, ink) {
  const parts = []
  const n = int(rng, 3, 7)
  for (let i = 0; i < n; i++) {
    const kind = int(rng, 0, 2)
    if (kind === 0) {
      const cx = uniform(rng, 0, S)
      const cy = uniform(rng, 0, S)
      const len = uniform(rng, S * 0.2, S * 0.9)
      const w = uniform(rng, 0.5, 3)
      const rot = uniform(rng, 0, 180)
      parts.push(
        `<rect x="${f(cx - len / 2)}" y="${f(cy - w / 2)}" width="${f(len)}" height="${f(w)}" fill="${ink}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"/>`,
      )
    } else if (kind === 1) {
      const cx = uniform(rng, S * 0.2, S * 0.8)
      const cy = uniform(rng, S * 0.2, S * 0.8)
      const r = uniform(rng, S * 0.08, S * 0.35)
      parts.push(
        `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${ink}" stroke-width="${f(uniform(rng, 0.6, 2.5))}"/>`,
      )
    } else {
      parts.push(
        `<circle cx="${f(uniform(rng, 0, S))}" cy="${f(uniform(rng, 0, S))}" r="${f(uniform(rng, 1, 3))}" fill="${ink}"/>`,
      )
    }
  }
  return parts
}

// Filled organic silhouettes (blobs, stars, discs) at several scales, some with
// a paper counter — the solid ink regions of a stamp, logo or glyph.
function blobParts(rng, S, ink, paper) {
  const parts = []
  const n = int(rng, 2, 4)
  for (let i = 0; i < n; i++) {
    const cx = uniform(rng, S * 0.2, S * 0.8)
    const cy = uniform(rng, S * 0.2, S * 0.8)
    const r = Math.abs(gaussian(rng, S * 0.2, S * 0.08)) + S * 0.08
    const attr = `fill="${ink}"`
    const kind = int(rng, 0, 2)
    if (kind === 0) parts.push(blob(cx, cy, r, rng, attr))
    else if (kind === 1) parts.push(star(cx, cy, r, int(rng, 3, 7), rng, attr))
    else parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${attr}/>`)
    if (chance(rng, 0.35)) {
      parts.push(
        `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * uniform(rng, 0.25, 0.5))}" fill="${paper}"/>`,
      )
    }
  }
  return parts
}

// n-point star (alternating outer/inner radius).
function star(cx, cy, r, points, rng, attr) {
  const inner = r * uniform(rng, 0.35, 0.6)
  const rot = uniform(rng, 0, Math.PI)
  const pts = []
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : inner
    const a = rot + (i / (points * 2)) * Math.PI * 2
    pts.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`)
  }
  return `<polygon points="${pts.join(' ')}" ${attr}/>`
}

// Round SVG numbers to keep markup compact.
function f(x) {
  return Math.round(x * 100) / 100
}
