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
// <use>, and expands shorthand into the @vectorizer/svg path model so targets
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
