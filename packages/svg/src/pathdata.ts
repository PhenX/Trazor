/**
 * Number formatting and SVG path-data construction. All output is absolute
 * commands (M/L/Q/C/A/Z) with the shortest token stream that still parses:
 * tokens are joined with single spaces, and the space before a token starting
 * with `-` is omitted (the sign is a valid separator in path data).
 */

import type { PathCommand } from '@trazor/core'

/**
 * Format a coordinate at `precision` decimals (0..4): `toFixed`, then strip
 * trailing zeros and a trailing dot, and normalize `-0` to `0`.
 */
export function formatNumber(v: number, precision: number): string {
  let s = v.toFixed(clampPrecision(precision))
  if (s.includes('.')) s = s.replace(/\.?0+$/, '')
  if (s === '-0') s = '0'
  return s
}

/** Precision is validated settings territory (0..4); guard `toFixed` anyway. */
export function clampPrecision(precision: number): number {
  const p = Math.round(precision)
  return p < 0 ? 0 : p > 4 ? 4 : p
}

/**
 * Serialize commands to a `d` attribute value. Command letters are always
 * emitted (no run coalescing); coordinates are absolute.
 */
export function buildPathData(commands: readonly PathCommand[], precision: number): string {
  const p = clampPrecision(precision)
  let d = ''
  const push = (token: string): void => {
    if (d !== '' && token.charCodeAt(0) !== 0x2d /* '-' */) d += ' '
    d += token
  }
  const num = (v: number): void => {
    push(formatNumber(v, p))
  }
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        push(cmd.type)
        num(cmd.x)
        num(cmd.y)
        break
      case 'Q':
        push('Q')
        num(cmd.x1)
        num(cmd.y1)
        num(cmd.x)
        num(cmd.y)
        break
      case 'C':
        push('C')
        num(cmd.x1)
        num(cmd.y1)
        num(cmd.x2)
        num(cmd.y2)
        num(cmd.x)
        num(cmd.y)
        break
      case 'A':
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y. Flags are literal
        // 0/1 digits, not coordinates, so they bypass number formatting.
        push('A')
        num(cmd.rx)
        num(cmd.ry)
        num(cmd.rotation)
        push(cmd.largeArc ? '1' : '0')
        push(cmd.sweep ? '1' : '0')
        num(cmd.x)
        num(cmd.y)
        break
      case 'Z':
        push('Z')
        break
    }
  }
  return d
}
