/**
 * Path-data compaction. Emits the shortest `d` string that reproduces the same
 * geometry as {@link buildPathData}: for every command the absolute form, a
 * relative form, and (for axis-aligned lines) `H`/`V` shorthands are rendered
 * and the shortest is kept, so the result is never longer than the plain
 * absolute encoding.
 *
 * Coordinates are quantized to the output grid (`10^precision` units) once and
 * all relative deltas are integer differences on that grid, so a running sum of
 * deltas reconstructs each absolute position exactly — there is no accumulated
 * rounding drift along a path.
 */

import type { PathCommand } from '@trazor/core'
import { clampPrecision } from './pathdata'

/**
 * Format a grid-integer value (the real coordinate is `g / 10^p`) as the
 * shortest decimal: no trailing zeros, no trailing dot, no negative zero. A
 * leading zero is kept (`0.5`, not `.5`) so a number never merges with a
 * preceding one across a single-space or sign separator.
 */
export function formatGrid(g: number, p: number): string {
  if (p === 0) return String(g | 0)
  const neg = g < 0
  let digits = String(Math.abs(g))
  if (digits.length <= p) digits = '0'.repeat(p - digits.length + 1) + digits
  const cut = digits.length - p
  const intPart = digits.slice(0, cut)
  const frac = digits.slice(cut).replace(/0+$/, '')
  const out = frac.length > 0 ? `${intPart}.${frac}` : intPart
  return neg && out !== '0' ? `-${out}` : out
}

/**
 * Render one command: its letter followed by the grid-integer operands. The
 * space before an operand is omitted when the operand starts with `-` (the sign
 * is itself a valid separator), matching {@link buildPathData}.
 */
function command(letter: string, operands: readonly number[], p: number): string {
  let s = letter
  for (const g of operands) {
    const token = formatGrid(g, p)
    if (token.charCodeAt(0) !== 0x2d /* '-' */) s += ' '
    s += token
  }
  return s
}

/** Shortest string, first argument winning ties (keeps output deterministic). */
function shorter(a: string, b: string): string {
  return b.length < a.length ? b : a
}

/**
 * Serialize commands to a compact `d` value using absolute/relative/`H`/`V`
 * selection. Semantically identical to {@link buildPathData} at the same
 * precision; only shorter.
 */
export function optimizePathData(commands: readonly PathCommand[], precision: number): string {
  const p = clampPrecision(precision)
  const scale = 10 ** p
  // Round exactly as `formatNumber` (via `toFixed`) so the optimized coordinate
  // grid is bit-for-bit the one the absolute serializer would emit — the
  // transform only re-encodes, it never nudges a coordinate.
  const grid = (v: number): number => Math.round(Number(v.toFixed(p)) * scale)

  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0
  let started = false
  let d = ''
  // Every command token begins with a letter, so a single space always
  // separates commands (the sign-separator shortcut only applies within a
  // command, between its operands).
  const emit = (token: string): void => {
    d += d === '' ? token : ` ${token}`
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        if (!started) {
          emit(command('M', [tx, ty], p))
          started = true
        } else {
          emit(shorter(command('M', [tx, ty], p), command('m', [tx - curX, ty - curY], p)))
        }
        curX = tx
        curY = ty
        startX = tx
        startY = ty
        break
      }
      case 'L': {
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        let best = shorter(command('L', [tx, ty], p), command('l', [tx - curX, ty - curY], p))
        if (ty === curY) {
          best = shorter(best, command('H', [tx], p))
          best = shorter(best, command('h', [tx - curX], p))
        }
        if (tx === curX) {
          best = shorter(best, command('V', [ty], p))
          best = shorter(best, command('v', [ty - curY], p))
        }
        emit(best)
        curX = tx
        curY = ty
        break
      }
      case 'Q': {
        const x1 = grid(cmd.x1)
        const y1 = grid(cmd.y1)
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        emit(
          shorter(
            command('Q', [x1, y1, tx, ty], p),
            command('q', [x1 - curX, y1 - curY, tx - curX, ty - curY], p),
          ),
        )
        curX = tx
        curY = ty
        break
      }
      case 'C': {
        const x1 = grid(cmd.x1)
        const y1 = grid(cmd.y1)
        const x2 = grid(cmd.x2)
        const y2 = grid(cmd.y2)
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        emit(
          shorter(
            command('C', [x1, y1, x2, y2, tx, ty], p),
            command('c', [x1 - curX, y1 - curY, x2 - curX, y2 - curY, tx - curX, ty - curY], p),
          ),
        )
        curX = tx
        curY = ty
        break
      }
      case 'Z': {
        emit('Z')
        curX = startX
        curY = startY
        break
      }
    }
  }

  return d
}
