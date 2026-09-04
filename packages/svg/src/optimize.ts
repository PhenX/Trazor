/**
 * Path-data compaction. Emits the shortest `d` string that reproduces the same
 * geometry as {@link buildPathData}: for every command the absolute form, a
 * relative form, and (for axis-aligned lines) `H`/`V` shorthands are measured
 * and only the shortest is rendered, so the result is never longer than the
 * plain absolute encoding.
 *
 * Coordinates are quantized to the output grid (`10^precision` units) once and
 * all relative deltas are integer differences on that grid, so a running sum of
 * deltas reconstructs each absolute position exactly — there is no accumulated
 * rounding drift along a path.
 */

import type { PathCommand } from '@trazor/core'
import { clampPrecision } from './pathdata'

/** `10 ** p` for every supported precision. */
const POW10 = [1, 10, 100, 1000, 10000]

/** Left padding for a fraction shorter than its place value, indexed by width. */
const ZEROS = ['', '0', '00', '000', '0000']

/**
 * Largest magnitude formatted by integer arithmetic. Above it (and for any
 * non-integer) the decimal expansion of the value is used instead.
 */
const MAX_EXACT_GRID = 1e15

/** Decimal digit count of a non-negative integer. */
function decimalLen(v: number): number {
  if (v < 10) return 1
  if (v < 100) return 2
  if (v < 1000) return 3
  if (v < 10000) return 4
  if (v < 100000) return 5
  if (v < 1000000) return 6
  if (v < 10000000) return 7
  let n = 8
  for (let limit = 100000000; v >= limit; limit *= 10) n++
  return n
}

/** Digits of `g` split on the `p`-th decimal place, for values outside the integer grid. */
function formatDigits(g: number, p: number): string {
  const neg = g < 0
  let digits = String(Math.abs(g))
  if (digits.length <= p) digits = '0'.repeat(p - digits.length + 1) + digits
  const cut = digits.length - p
  const intPart = digits.slice(0, cut)
  let end = digits.length
  while (end > cut && digits.charCodeAt(end - 1) === 0x30 /* '0' */) end--
  const out = end > cut ? `${intPart}.${digits.slice(cut, end)}` : intPart
  return neg && out !== '0' ? `-${out}` : out
}

/**
 * Format a grid-integer value (the real coordinate is `g / 10^p`) as the
 * shortest decimal: no trailing zeros, no trailing dot, no negative zero. A
 * leading zero is kept (`0.5`, not `.5`) so a number never merges with a
 * preceding one across a single-space or sign separator.
 */
export function formatGrid(g: number, p: number): string {
  if (p === 0) return String(g | 0)
  const a = g < 0 ? -g : g
  if (!(a <= MAX_EXACT_GRID) || !Number.isInteger(a)) return formatDigits(g, p)
  const pow = POW10[p]
  const frac = a % pow
  const int = (a - frac) / pow
  if (frac === 0) return g < 0 ? `-${int}` : `${int}`
  let f = frac
  let w = p
  while (f % 10 === 0) {
    f /= 10
    w--
  }
  const tail = `${ZEROS[w - decimalLen(f)]}${f}`
  return g < 0 ? `-${int}.${tail}` : `${int}.${tail}`
}

/**
 * Length of {@link formatGrid}'s output without its sign. An operand costs this
 * plus one character: either the separating space, or the `-` that replaces it.
 */
function gridLen(g: number, p: number): number {
  if (p === 0) {
    const t = g | 0
    return decimalLen(t < 0 ? -t : t)
  }
  const a = g < 0 ? -g : g
  if (!(a <= MAX_EXACT_GRID) || !Number.isInteger(a)) {
    const s = formatDigits(g, p)
    return s.charCodeAt(0) === 0x2d /* '-' */ ? s.length - 1 : s.length
  }
  const pow = POW10[p]
  const frac = a % pow
  const int = (a - frac) / pow
  if (frac === 0) return decimalLen(int)
  let f = frac
  let w = p
  while (f % 10 === 0) {
    f /= 10
    w--
  }
  return decimalLen(int) + 1 + w
}

/**
 * Quantize a coordinate to the output grid — the integer `formatNumber` would
 * print at this precision, scaled by `10^p`, so the optimized coordinate grid
 * is bit-for-bit the one the absolute serializer emits: the transform only
 * re-encodes, it never nudges a coordinate. `v * scale` carries a single
 * rounding of the exact product, so it selects the same integer as the decimal
 * expansion except within that error of a halfway point, where the decimal
 * expansion decides.
 */
function gridValue(v: number, p: number, scale: number): number {
  const t = v * scale
  const r = Math.round(t)
  if (Math.abs(t - r) < 0.5 - (Math.abs(t) * 2e-16 + 1e-9)) return r
  return Math.round(Number(v.toFixed(p)) * scale)
}

/**
 * Serialize commands to a compact `d` value using absolute/relative/`H`/`V`
 * selection. Semantically identical to {@link buildPathData} at the same
 * precision; only shorter. Each candidate form is priced from its operands'
 * digit counts and only the shortest is rendered; the first candidate wins a
 * tie, in the order absolute, relative, `H`, `h`, `V`, `v`.
 */
export function optimizePathData(commands: readonly PathCommand[], precision: number): string {
  const p = clampPrecision(precision)
  const scale = POW10[p]

  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0
  let started = false
  let d = ''
  // Operands of the command being priced, in absolute and in relative form.
  const abs = new Float64Array(6)
  const rel = new Float64Array(6)

  /**
   * Append one command: its letter followed by `n` operands from `ops` starting
   * at `off`. Every command token begins with a letter, so a single space
   * always separates commands; within a command the space before an operand is
   * omitted when the operand starts with `-` (the sign is itself a valid
   * separator), matching {@link buildPathData}.
   */
  const put = (letter: string, ops: Float64Array, off: number, n: number): void => {
    d += d === '' ? letter : ` ${letter}`
    for (let i = off; i < off + n; i++) {
      const token = formatGrid(ops[i], p)
      if (token.charCodeAt(0) !== 0x2d /* '-' */) d += ' '
      d += token
    }
  }

  /**
   * Append one arc command: `A`/`a` then rx ry rotation (gridded), the two flags
   * as literal `0`/`1` digits (a flag is not a coordinate — gridding a `1` at
   * precision p would emit `0.0…1`), then the endpoint (gridded).
   */
  const putArc = (letter: string, end: Float64Array, laf: number, sf: number): void => {
    put(letter, abs, 0, 3)
    d += ` ${laf} ${sf}`
    for (let i = 3; i < 5; i++) {
      const token = formatGrid(end[i], p)
      if (token.charCodeAt(0) !== 0x2d /* '-' */) d += ' '
      d += token
    }
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        const tx = gridValue(cmd.x, p, scale)
        const ty = gridValue(cmd.y, p, scale)
        abs[0] = tx
        abs[1] = ty
        if (!started) {
          put('M', abs, 0, 2)
          started = true
        } else {
          rel[0] = tx - curX
          rel[1] = ty - curY
          const absLen = gridLen(tx, p) + gridLen(ty, p)
          const relLen = gridLen(rel[0], p) + gridLen(rel[1], p)
          if (relLen < absLen) put('m', rel, 0, 2)
          else put('M', abs, 0, 2)
        }
        curX = tx
        curY = ty
        startX = tx
        startY = ty
        break
      }
      case 'L': {
        const tx = gridValue(cmd.x, p, scale)
        const ty = gridValue(cmd.y, p, scale)
        abs[0] = tx
        abs[1] = ty
        rel[0] = tx - curX
        rel[1] = ty - curY
        let letter = 'L'
        let ops = abs
        let off = 0
        let n = 2
        let best = gridLen(tx, p) + gridLen(ty, p) + 2
        const relLen = gridLen(rel[0], p) + gridLen(rel[1], p) + 2
        if (relLen < best) {
          best = relLen
          letter = 'l'
          ops = rel
        }
        if (ty === curY) {
          const hLen = gridLen(tx, p) + 1
          if (hLen < best) {
            best = hLen
            letter = 'H'
            ops = abs
            off = 0
            n = 1
          }
          const hRelLen = gridLen(rel[0], p) + 1
          if (hRelLen < best) {
            best = hRelLen
            letter = 'h'
            ops = rel
            off = 0
            n = 1
          }
        }
        if (tx === curX) {
          const vLen = gridLen(ty, p) + 1
          if (vLen < best) {
            best = vLen
            letter = 'V'
            ops = abs
            off = 1
            n = 1
          }
          const vRelLen = gridLen(rel[1], p) + 1
          if (vRelLen < best) {
            best = vRelLen
            letter = 'v'
            ops = rel
            off = 1
            n = 1
          }
        }
        put(letter, ops, off, n)
        curX = tx
        curY = ty
        break
      }
      case 'Q': {
        abs[0] = gridValue(cmd.x1, p, scale)
        abs[1] = gridValue(cmd.y1, p, scale)
        abs[2] = gridValue(cmd.x, p, scale)
        abs[3] = gridValue(cmd.y, p, scale)
        rel[0] = abs[0] - curX
        rel[1] = abs[1] - curY
        rel[2] = abs[2] - curX
        rel[3] = abs[3] - curY
        let absLen = 0
        let relLen = 0
        for (let i = 0; i < 4; i++) {
          absLen += gridLen(abs[i], p)
          relLen += gridLen(rel[i], p)
        }
        if (relLen < absLen) put('q', rel, 0, 4)
        else put('Q', abs, 0, 4)
        curX = abs[2]
        curY = abs[3]
        break
      }
      case 'C': {
        abs[0] = gridValue(cmd.x1, p, scale)
        abs[1] = gridValue(cmd.y1, p, scale)
        abs[2] = gridValue(cmd.x2, p, scale)
        abs[3] = gridValue(cmd.y2, p, scale)
        abs[4] = gridValue(cmd.x, p, scale)
        abs[5] = gridValue(cmd.y, p, scale)
        for (let i = 0; i < 6; i += 2) {
          rel[i] = abs[i] - curX
          rel[i + 1] = abs[i + 1] - curY
        }
        let absLen = 0
        let relLen = 0
        for (let i = 0; i < 6; i++) {
          absLen += gridLen(abs[i], p)
          relLen += gridLen(rel[i], p)
        }
        if (relLen < absLen) put('c', rel, 0, 6)
        else put('C', abs, 0, 6)
        curX = abs[4]
        curY = abs[5]
        break
      }
      case 'A': {
        abs[0] = gridValue(cmd.rx, p, scale)
        abs[1] = gridValue(cmd.ry, p, scale)
        abs[2] = gridValue(cmd.rotation, p, scale)
        abs[3] = gridValue(cmd.x, p, scale)
        abs[4] = gridValue(cmd.y, p, scale)
        rel[3] = abs[3] - curX
        rel[4] = abs[4] - curY
        const absLen = gridLen(abs[3], p) + gridLen(abs[4], p)
        const relLen = gridLen(rel[3], p) + gridLen(rel[4], p)
        if (relLen < absLen) putArc('a', rel, cmd.largeArc ? 1 : 0, cmd.sweep ? 1 : 0)
        else putArc('A', abs, cmd.largeArc ? 1 : 0, cmd.sweep ? 1 : 0)
        curX = abs[3]
        curY = abs[4]
        break
      }
      case 'Z': {
        d += d === '' ? 'Z' : ' Z'
        curX = startX
        curY = startY
        break
      }
    }
  }

  return d
}
