/**
 * Regex-based SVG inspection — no DOM, works in Node and workers on both our
 * own serializer output and foreign SVG text. Counts are best-effort textual
 * measures, not a full parse.
 */

export interface SvgAnalysis {
  /** Drawable shape elements: `<path>` plus `<rect>`/`<circle>`/`<ellipse>`/`<line>`/`<polyline>`/`<polygon>`. */
  pathCount: number
  /** Draw-command letters (`[MLHVQCTSAmlhvqctsa]`) across all `d` attributes — Z/z excluded. */
  nodeCount: number
  colorCount: number
  /** Distinct fills + strokes in document order, hex-normalized, without `none`/`transparent`. */
  palette: string[]
  /** UTF-8 size of the source text. */
  byteLength: number
  /** From the viewBox 3rd/4th numbers; null when absent or unparsable. */
  width: number | null
  height: number | null
}

/**
 * Lowercase a paint value and normalize hex to `#rrggbb` (expanding `#rgb`).
 * Returns null for non-colors (`none`, `transparent`, empty).
 */
function normalizeColor(raw: string): string | null {
  const c = raw.trim().toLowerCase()
  if (c === '' || c === 'none' || c === 'transparent') return null
  // A paint-server reference (a gradient) is not a flat color — its own stop
  // colors are counted separately.
  if (c.startsWith('url(')) return null
  const m = /^#([0-9a-f]{3})$/.exec(c)
  if (m !== null) {
    const hex = m[1]
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return c
}

/** Value of a `"…"` / `'…'` alternation match. */
function quoted(m: RegExpMatchArray, first: number): string {
  return m[first] ?? m[first + 1] ?? ''
}

export function analyzeSvg(svg: string): SvgAnalysis {
  const pathCount = (svg.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g) ?? [])
    .length

  let nodeCount = 0
  for (const m of svg.matchAll(/(?<![\w-])d\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    nodeCount += (quoted(m, 1).match(/[MLHVQCTSAmlhvqctsa]/g) ?? []).length
  }

  // Collect paints with their source offsets so the palette keeps document
  // order. `stop-color` is included so a gradient's colors count (its `url(...)`
  // reference on the shape is not a flat color and is dropped by normalizeColor).
  const found: { index: number; value: string }[] = []
  for (const m of svg.matchAll(
    /(?<![\w-])(?:fill|stroke|stop-color)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    found.push({ index: m.index ?? 0, value: quoted(m, 1) })
  }
  for (const m of svg.matchAll(/(?<![\w-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const style = quoted(m, 1)
    for (const decl of style.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*:\s*([^;"']+)/g)) {
      found.push({ index: (m.index ?? 0) + (decl.index ?? 0), value: decl[1] })
    }
  }
  found.sort((a, b) => a.index - b.index)
  const palette: string[] = []
  const seen = new Set<string>()
  for (const { value } of found) {
    const color = normalizeColor(value)
    if (color !== null && !seen.has(color)) {
      seen.add(color)
      palette.push(color)
    }
  }

  let width: number | null = null
  let height: number | null = null
  const vb = /(?<![\w-])viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(svg)
  if (vb !== null) {
    const parts = quoted(vb, 1)
      .trim()
      .split(/[\s,]+/)
    if (parts.length >= 4) {
      const w = Number(parts[2])
      const h = Number(parts[3])
      if (Number.isFinite(w)) width = w
      if (Number.isFinite(h)) height = h
    }
  }

  return {
    pathCount,
    nodeCount,
    colorCount: palette.length,
    palette,
    byteLength: new TextEncoder().encode(svg).length,
    width,
    height,
  }
}
