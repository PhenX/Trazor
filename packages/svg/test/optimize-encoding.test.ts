import type { PathCommand } from '@trazor/core'
import { mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { clampPrecision } from '../src/pathdata'
import { formatGrid, optimizePathData } from '../src/optimize'

/**
 * The decimal-string form of a grid integer: the string every value must still
 * print, whichever way {@link formatGrid} arrives at it.
 */
function referenceFormatGrid(g: number, p: number): string {
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
 * Path-data compaction by rendering every candidate form of each command and
 * keeping the shortest string. {@link optimizePathData} prices the candidates
 * instead of rendering them, and must emit exactly this, on every input.
 */
function referenceOptimizePathData(commands: readonly PathCommand[], precision: number): string {
  const p = clampPrecision(precision)
  const scale = 10 ** p
  const grid = (v: number): number => Math.round(Number(v.toFixed(p)) * scale)
  const command = (letter: string, operands: readonly number[]): string => {
    let s = letter
    for (const g of operands) {
      const token = referenceFormatGrid(g, p)
      if (token.charCodeAt(0) !== 0x2d /* '-' */) s += ' '
      s += token
    }
    return s
  }
  const arcCommand = (
    letter: string,
    rx: number,
    ry: number,
    rot: number,
    laf: number,
    sf: number,
    x: number,
    y: number,
  ): string => {
    let s = letter
    const append = (token: string): void => {
      if (token.charCodeAt(0) !== 0x2d /* '-' */) s += ' '
      s += token
    }
    append(referenceFormatGrid(rx, p))
    append(referenceFormatGrid(ry, p))
    append(referenceFormatGrid(rot, p))
    append(String(laf))
    append(String(sf))
    append(referenceFormatGrid(x, p))
    append(referenceFormatGrid(y, p))
    return s
  }
  const shorter = (a: string, b: string): string => (b.length < a.length ? b : a)

  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0
  let started = false
  let d = ''
  const emit = (token: string): void => {
    d += d === '' ? token : ` ${token}`
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        if (!started) {
          emit(command('M', [tx, ty]))
          started = true
        } else {
          emit(shorter(command('M', [tx, ty]), command('m', [tx - curX, ty - curY])))
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
        let best = shorter(command('L', [tx, ty]), command('l', [tx - curX, ty - curY]))
        if (ty === curY) {
          best = shorter(best, command('H', [tx]))
          best = shorter(best, command('h', [tx - curX]))
        }
        if (tx === curX) {
          best = shorter(best, command('V', [ty]))
          best = shorter(best, command('v', [ty - curY]))
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
            command('Q', [x1, y1, tx, ty]),
            command('q', [x1 - curX, y1 - curY, tx - curX, ty - curY]),
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
            command('C', [x1, y1, x2, y2, tx, ty]),
            command('c', [x1 - curX, y1 - curY, x2 - curX, y2 - curY, tx - curX, ty - curY]),
          ),
        )
        curX = tx
        curY = ty
        break
      }
      case 'A': {
        const rx = grid(cmd.rx)
        const ry = grid(cmd.ry)
        const rot = grid(cmd.rotation)
        const tx = grid(cmd.x)
        const ty = grid(cmd.y)
        const laf = cmd.largeArc ? 1 : 0
        const sf = cmd.sweep ? 1 : 0
        emit(
          shorter(
            arcCommand('A', rx, ry, rot, laf, sf, tx, ty),
            arcCommand('a', rx, ry, rot, laf, sf, tx - curX, ty - curY),
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

describe('formatGrid', () => {
  it('prints the decimal string of every grid integer in a small range', () => {
    const bad: string[] = []
    for (let p = 0; p <= 4; p++) {
      for (let g = -20000; g <= 20000; g++) {
        const got = formatGrid(g, p)
        const want = referenceFormatGrid(g, p)
        if (got !== want && bad.length < 10) bad.push(`p=${p} g=${g}: ${got} != ${want}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('prints trailing zeros, zero and the sign the same way', () => {
    const bad: string[] = []
    const cases: number[] = [0, -0, 1, -1]
    for (const unit of [1, 10, 100, 1000, 10000, 100000]) {
      for (const k of [1, 2, 5, 9, 10, 37, 100, 999]) {
        cases.push(unit * k, -unit * k, unit * k + 1, -(unit * k + 1))
      }
    }
    for (let p = 0; p <= 4; p++) {
      for (const g of cases) {
        const got = formatGrid(g, p)
        const want = referenceFormatGrid(g, p)
        if (got !== want && bad.length < 10) bad.push(`p=${p} g=${g}: ${got} != ${want}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('prints random grid integers of every magnitude the same way', () => {
    const rnd = mulberry32(0x5eed)
    const bad: string[] = []
    for (let i = 0; i < 200000; i++) {
      const p = i % 5
      const mag = 10 ** (1 + Math.floor(rnd() * 9))
      const g = Math.round((rnd() - 0.5) * 2 * mag)
      const got = formatGrid(g, p)
      const want = referenceFormatGrid(g, p)
      if (got !== want && bad.length < 10) bad.push(`p=${p} g=${g}: ${got} != ${want}`)
    }
    expect(bad).toEqual([])
  })
})

/** A random command list: every command kind, with coordinates that exercise the shorthands. */
function randomCommands(rnd: () => number, count: number): PathCommand[] {
  const cmds: PathCommand[] = []
  let x = (rnd() - 0.5) * 500
  let y = (rnd() - 0.5) * 500
  const coord = (from: number): number => {
    const r = rnd()
    // A spread of magnitudes, plus exact halves of a grid step, where the
    // decimal expansion decides the rounding.
    if (r < 0.15) return from
    if (r < 0.3) return Math.round(from * 2) / 2
    if (r < 0.45) return Math.round(from * 20000) / 20000 + 0.00005
    if (r < 0.6) return from + (rnd() - 0.5) * 0.02
    if (r < 0.8) return from + (rnd() - 0.5) * 40
    return (rnd() - 0.5) * 4000
  }
  cmds.push({ type: 'M', x, y })
  for (let i = 0; i < count; i++) {
    const pick = rnd()
    const nx = coord(x)
    const ny = coord(y)
    if (pick < 0.3) cmds.push({ type: 'L', x: nx, y: ny })
    else if (pick < 0.45) cmds.push({ type: 'Q', x1: coord(x), y1: coord(y), x: nx, y: ny })
    else if (pick < 0.7) {
      cmds.push({
        type: 'C',
        x1: coord(x),
        y1: coord(y),
        x2: coord(nx),
        y2: coord(ny),
        x: nx,
        y: ny,
      })
    } else if (pick < 0.8) {
      cmds.push({
        type: 'A',
        rx: rnd() * 60,
        ry: rnd() * 60,
        rotation: (rnd() - 0.5) * 180,
        largeArc: rnd() < 0.5,
        sweep: rnd() < 0.5,
        x: nx,
        y: ny,
      })
    } else if (pick < 0.9) {
      cmds.push({ type: 'Z' })
      cmds.push({ type: 'M', x: nx, y: ny })
    } else {
      // An axis-aligned step, where H/V and their relative forms compete.
      if (rnd() < 0.5) cmds.push({ type: 'L', x: nx, y })
      else cmds.push({ type: 'L', x, y: ny })
    }
    const last = cmds[cmds.length - 1]
    if (last.type !== 'Z') {
      x = last.x
      y = last.y
    }
  }
  cmds.push({ type: 'Z' })
  return cmds
}

describe('optimizePathData', () => {
  it('emits the shortest candidate form for random command lists at every precision', () => {
    const rnd = mulberry32(4242)
    let shorthands = 0
    for (let i = 0; i < 400; i++) {
      const cmds = randomCommands(rnd, 40)
      for (let p = 0; p <= 4; p++) {
        const got = optimizePathData(cmds, p)
        expect(got, `precision ${p}`).toBe(referenceOptimizePathData(cmds, p))
        if (/[HhVv]/.test(got)) shorthands++
      }
    }
    // The lists really do exercise the H/V shorthands.
    expect(shorthands).toBeGreaterThan(100)
  })

  it('matches on paths of a single command and on empty input', () => {
    for (let p = 0; p <= 4; p++) {
      expect(optimizePathData([], p)).toBe(referenceOptimizePathData([], p))
      const cmds: PathCommand[] = [{ type: 'M', x: -0.5, y: 0.05 }, { type: 'Z' }]
      expect(optimizePathData(cmds, p)).toBe(referenceOptimizePathData(cmds, p))
    }
  })
})
