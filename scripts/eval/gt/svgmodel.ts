/**
 * Structural reading of an SVG for the ground-truth gate: the parameter count
 * and the turning measure, read the way inkvec's benchmark reads them
 * (`bench/inkvec_bench/svgmodel.py`, `turning.py`), so a Trazor trace, an
 * inkvec trace and the artist's own file are counted alike.
 *
 * - **Parameters**: a path segment costs its numbers — a line 2 (H/V and L
 *   alike), a quadratic 4, a cubic 6, an arc 7; a close costs nothing. A
 *   primitive costs its attributes: circle 3, ellipse 4, rect 6, line 4, a
 *   polygon or polyline twice its points (at least 4).
 * - **Turning**: per subpath, the control polygon (a line's end; a quadratic's
 *   control and end; a cubic's two controls and end; an arc as its cubic
 *   approximation in pieces of at most 90°), closing vertex included; the total
 *   absolute turning over the total length. A sawtooth renders almost as well
 *   as a smooth edge but turns far more.
 *
 * Only what the tracers and the corpus write is read: `<path>`, `<rect>`,
 * `<circle>`, `<ellipse>`, `<line>`, `<polygon>`, `<polyline>`, outside
 * `<defs>`. Transforms are ignored (neither tracer writes them; the artist
 * files' own transforms scale both terms of the turning ratio).
 */

export interface SvgModel {
  /** Numbers a reader must store for the geometry. */
  params: number
  /** Anchor points (segment ends) of path outlines; primitives count none. */
  anchors: number
  /** Total absolute turning per unit length of every outline's control polygon. */
  turning: number
  /** Drawn elements. */
  elements: number
}

type Pt = [number, number]

interface Subpath {
  pts: Pt[]
  closed: boolean
}

/** The cubic control points of an elliptical arc, in pieces of at most 90°. */
function arcCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rot: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): Pt[] {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]]
  const phi = (rot * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) {
    const s = Math.sqrt(lam)
    rx *= s
    ry *= s
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let coef = den <= 0 ? 0 : Math.sqrt(Math.max(0, num) / den)
  if (large === sweep) coef = -coef
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  else if (sweep && dt < 0) dt += 2 * Math.PI
  const pieces = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const step = dt / pieces
  const k = (4 / 3) * Math.tan(step / 4)
  const at = (t: number): Pt => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ]
  const deriv = (t: number): Pt => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ]
  const out: Pt[] = []
  for (let p = 0; p < pieces; p++) {
    const a = t1 + p * step
    const b = a + step
    const pa = at(a)
    const pb = p === pieces - 1 ? ([x2, y2] as Pt) : at(b)
    const da = deriv(a)
    const db = deriv(b)
    out.push([pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb)
  }
  return out
}

interface PathRead {
  subpaths: Subpath[]
  params: number
  anchors: number
}

/** Parse path data into control-polygon subpaths and its parameter/anchor count. */
export function readPath(d: string): PathRead {
  const subpaths: Subpath[] = []
  let cur: Subpath | null = null
  let params = 0
  let anchors = 0
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let lastC: Pt | null = null // last cubic control (for S)
  let lastQ: Pt | null = null // last quadratic control (for T)
  let cmd = ''
  const buf: number[] = []
  const flush = (): void => {
    if (cur && cur.pts.length > 1) subpaths.push(cur)
    cur = null
  }
  const ensure = (): Subpath => {
    if (!cur) cur = { pts: [[x, y]], closed: false }
    return cur
  }
  const arity: Record<string, number> = {
    M: 2,
    L: 2,
    H: 1,
    V: 1,
    C: 6,
    S: 4,
    Q: 4,
    T: 2,
    A: 7,
    Z: 0,
  }
  const apply = (c: string, a: number[]): void => {
    const rel = c === c.toLowerCase()
    const C = c.toUpperCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (C) {
      case 'M':
        flush()
        x = ox + a[0]
        y = oy + a[1]
        sx = x
        sy = y
        cur = { pts: [[x, y]], closed: false }
        lastC = lastQ = null
        return
      case 'L':
      case 'H':
      case 'V': {
        const s = ensure()
        if (C === 'L') {
          x = ox + a[0]
          y = oy + a[1]
        } else if (C === 'H') x = (rel ? x : 0) + a[0]
        else y = (rel ? y : 0) + a[0]
        s.pts.push([x, y])
        params += 2
        anchors++
        lastC = lastQ = null
        return
      }
      case 'C':
      case 'S': {
        const s = ensure()
        let c1: Pt
        let i = 0
        if (C === 'C') {
          c1 = [ox + a[0], oy + a[1]]
          i = 2
        } else c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]
        const c2: Pt = [ox + a[i], oy + a[i + 1]]
        x = ox + a[i + 2]
        y = oy + a[i + 3]
        s.pts.push(c1, c2, [x, y])
        params += 6
        anchors++
        lastC = c2
        lastQ = null
        return
      }
      case 'Q':
      case 'T': {
        const s = ensure()
        let q: Pt
        let i = 0
        if (C === 'Q') {
          q = [ox + a[0], oy + a[1]]
          i = 2
        } else q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]
        x = ox + a[i]
        y = oy + a[i + 1]
        s.pts.push(q, [x, y])
        params += 4
        anchors++
        lastQ = q
        lastC = null
        return
      }
      case 'A': {
        const s = ensure()
        const nx = ox + a[5]
        const ny = oy + a[6]
        s.pts.push(...arcCubics(x, y, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, nx, ny))
        x = nx
        y = ny
        params += 7
        anchors++
        lastC = lastQ = null
        return
      }
      case 'Z': {
        if (cur) {
          cur.closed = true
          cur.pts.push([sx, sy])
          subpaths.push(cur)
        }
        cur = null
        x = sx
        y = sy
        lastC = lastQ = null
        return
      }
    }
  }
  // A scanner that knows where it is in the grammar: an arc's two flags are
  // single digits that may be glued to what follows ("a1 1 0 01 5 5").
  const n = d.length
  let i = 0
  const skip = (): void => {
    while (i < n) {
      const c = d.charCodeAt(i)
      if (c === 32 || c === 44 || c === 9 || c === 10 || c === 13) i++
      else break
    }
  }
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y
  for (;;) {
    skip()
    if (i >= n) break
    const ch = d[i]
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      cmd = ch
      i++
      buf.length = 0
      if (ch === 'Z' || ch === 'z') apply(ch, [])
      continue
    }
    if (!cmd || cmd === 'Z' || cmd === 'z') {
      i++
      continue
    }
    const C = cmd.toUpperCase()
    const need = arity[C]
    if (C === 'A' && (buf.length === 3 || buf.length === 4) && (ch === '0' || ch === '1')) {
      buf.push(ch === '1' ? 1 : 0)
      i++
    } else {
      NUM.lastIndex = i
      const m = NUM.exec(d)
      if (!m) {
        i++
        continue
      }
      buf.push(Number(m[0]))
      i = NUM.lastIndex
    }
    if (buf.length >= need) {
      apply(cmd, buf.splice(0, need))
      if (C === 'M') cmd = cmd === 'M' ? 'L' : 'l'
    }
  }
  flush()
  return { subpaths, params, anchors }
}

function turnAndLength(pts: Pt[], closed: boolean): [number, number] {
  const q: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const l = q[q.length - 1]
    if (Math.abs(p[0] - l[0]) > 1e-9 || Math.abs(p[1] - l[1]) > 1e-9) q.push(p)
  }
  if (closed && q.length > 2) {
    const a = q[0]
    const b = q[q.length - 1]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9) q.pop()
  }
  const n = q.length
  if (n < 2) return [0, 0]
  const steps: Pt[] = []
  for (let i = 0; i + 1 < n; i++) steps.push([q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]])
  if (closed && n > 2) steps.push([q[0][0] - q[n - 1][0], q[0][1] - q[n - 1][1]])
  let length = 0
  for (const s of steps) length += Math.hypot(s[0], s[1])
  let turn = 0
  const m = steps.length
  for (let i = 0; i + 1 < m; i++) {
    const [ax, ay] = steps[i]
    const [bx, by] = steps[i + 1]
    turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
  }
  if (closed && m > 2) {
    const [ax, ay] = steps[m - 1]
    const [bx, by] = steps[0]
    turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
  }
  return [turn, length]
}

const attr = (tag: string, name: string): number | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)
  if (!m) return null
  const v = Number.parseFloat(m[1])
  return Number.isFinite(v) ? v : null
}

/** Path data for a primitive, as svgelements converts it (rounded corners and ellipses as arcs). */
function primitiveD(kind: string, tag: string): string {
  if (kind === 'rect') {
    const x = attr(tag, 'x') ?? 0
    const y = attr(tag, 'y') ?? 0
    const w = attr(tag, 'width') ?? 0
    const h = attr(tag, 'height') ?? 0
    let rx = attr(tag, 'rx')
    let ry = attr(tag, 'ry')
    if (rx === null && ry !== null) rx = ry
    if (ry === null && rx !== null) ry = rx
    rx = Math.min(rx ?? 0, w / 2)
    ry = Math.min(ry ?? 0, h / 2)
    if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
    return (
      `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
      `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
      `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
    )
  }
  if (kind === 'circle' || kind === 'ellipse') {
    const cx = attr(tag, 'cx') ?? 0
    const cy = attr(tag, 'cy') ?? 0
    const rx = kind === 'circle' ? (attr(tag, 'r') ?? 0) : (attr(tag, 'rx') ?? 0)
    const ry = kind === 'circle' ? rx : (attr(tag, 'ry') ?? 0)
    return (
      `M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}` +
      `A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`
    )
  }
  if (kind === 'line') {
    return `M${attr(tag, 'x1') ?? 0} ${attr(tag, 'y1') ?? 0}L${attr(tag, 'x2') ?? 0} ${attr(tag, 'y2') ?? 0}`
  }
  const m = /\spoints\s*=\s*["']([^"']*)["']/.exec(tag)
  const nums = (m?.[1].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number)
  if (nums.length < 2) return ''
  let d = `M${nums[0]} ${nums[1]}`
  for (let i = 2; i + 1 < nums.length; i += 2) d += `L${nums[i]} ${nums[i + 1]}`
  return kind === 'polygon' ? `${d}Z` : d
}

const PRIM_PARAMS: Record<string, number> = { circle: 3, ellipse: 4, rect: 6, line: 4 }

/** Read an SVG document's parameter count, anchors and turning. */
export function readSvg(svg: string): SvgModel {
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  let params = 0
  let anchors = 0
  let elements = 0
  let turn = 0
  let length = 0
  const addSubpaths = (subs: Subpath[]): void => {
    for (const s of subs) {
      const [t, l] = turnAndLength(s.pts, s.closed)
      turn += t
      length += l
    }
  }
  for (const m of body.matchAll(/<(path|rect|circle|ellipse|line|polygon|polyline)\b[^>]*>/g)) {
    const kind = m[1]
    const tag = m[0]
    if (kind === 'path') {
      const dm = /\sd\s*=\s*"([^"]*)"|\sd\s*=\s*'([^']*)'/.exec(tag)
      const d = dm ? (dm[1] ?? dm[2] ?? '') : ''
      if (!d.trim()) continue
      const r = readPath(d)
      params += r.params
      anchors += r.anchors
      elements++
      addSubpaths(r.subpaths)
      continue
    }
    const d = primitiveD(kind, tag)
    if (!d) continue
    const r = readPath(d)
    elements++
    if (kind === 'polygon' || kind === 'polyline') {
      params += Math.max(4, (r.anchors + 1) * 2)
    } else params += PRIM_PARAMS[kind]
    addSubpaths(r.subpaths)
  }
  return { params, anchors, turning: length > 1e-9 ? turn / length : 0, elements }
}
