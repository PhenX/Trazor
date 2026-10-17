import { describe, expect, it } from 'vitest'
import { linearToSrgb32, srgbToLinear32 } from '../../src/fill/model'
import { Pow32 } from '../../src/fill/power'

const fr = Math.fround
const F32 = new Float32Array(1)
const U32 = new Uint32Array(F32.buffer)

/** The single with bit pattern `b`. */
function single(b: number): number {
  U32[0] = b
  return F32[0]
}

const ENCODE = fr(1 / fr(2.4))
const DECODE = fr(2.4)

describe('Pow32', () => {
  for (const [name, a, eLo, eHi] of [
    ['the encoding power', ENCODE, -9, 1],
    ['the decoding power', DECODE, -4, 1],
  ] as const) {
    it(`is fr(Math.pow) bit for bit on ${name}, every 61st single of its binades`, () => {
      const p = new Pow32(a, eLo, eHi)
      let bad = 0
      for (let b = (127 + eLo) << 23; b < (127 + eHi) << 23; b += 61) {
        const x = single(b)
        if (!Object.is(p.of(x), fr(Math.pow(x, a)))) bad++
      }
      expect(bad).toBe(0)
    })

    it(`is fr(Math.pow) at every bucket edge of ${name}`, () => {
      const p = new Pow32(a, eLo, eHi)
      for (let b = (127 + eLo) << 23; b < (127 + eHi) << 23; b += 1 << 15) {
        for (const x of [single(b - 1), single(b), single(b + 1)]) {
          expect(p.of(x)).toBe(fr(Math.pow(x, a)))
        }
      }
    })
  }

  it('hands inputs outside its binades to Math.pow', () => {
    const p = new Pow32(ENCODE, -9, 1)
    for (const x of [0, -0, -0.5, 1e-6, 2, 3.5, 1e9, Infinity, -Infinity]) {
      expect(Object.is(p.of(x), fr(Math.pow(x, ENCODE)))).toBe(true)
    }
    expect(p.of(NaN)).toBeNaN()
  })

  it('agrees with Math.pow on doubles that are not singles', () => {
    const p = new Pow32(DECODE, -4, 1)
    for (let i = 0; i < 4096; i++) {
      const x = 0.07 + (0.93 * (i + 0.3183098861837907)) / 4096
      expect(p.of(x)).toBe(fr(Math.pow(x, DECODE)))
    }
  })
})

describe('the single-precision sRGB curves', () => {
  it('encode and decode as the IEC 61966-2-1 formulas in single precision', () => {
    for (let b = (127 - 10) << 23; b <= 127 << 23; b += 4099) {
      const c = single(b)
      const enc =
        c <= fr(0.0031308)
          ? fr(c * fr(12.92))
          : fr(fr(fr(1.055) * fr(Math.pow(c, ENCODE))) - fr(0.055))
      expect(linearToSrgb32(c)).toBe(enc)
      const dec =
        c <= fr(0.04045)
          ? fr(c / fr(12.92))
          : fr(Math.pow(fr(fr(c + fr(0.055)) / fr(1.055)), DECODE))
      expect(srgbToLinear32(c)).toBe(dec)
    }
  })
})
