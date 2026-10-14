/**
 * `x^a` rounded to single precision, bit for bit what `Math.fround(Math.pow(x, a))`
 * gives, at a fraction of its cost on the sRGB transfer curves' hot paths.
 *
 * Each binade `[2^e, 2^(e+1))` of a covered range is cut into 2⁸ buckets by the
 * leading mantissa bits of `x` as a single-precision value; a table holds the
 * power at each bucket's start `x₀`, and within the bucket
 * `x^a = x₀^a · (1 + d)^a`, `d = (x − x₀)/x₀ ∈ [0, 2⁻⁸)`, from the binomial
 * series to the `d⁵` term (truncation below `|C(a, 6)|·2⁻⁴⁸`). The result is
 * within a relative {@link POWER_TOLERANCE} of the true power, as is
 * `Math.pow`'s own, so when both ends of that interval round to the same single
 * — every input but a few in a million — that single is the answer; otherwise,
 * and for any `x` outside the covered binades (including NaN, infinities and
 * negatives), `Math.pow` decides.
 *
 * Method from: P. T. P. Tang (1989), Table-driven implementation of the
 * exponential function in IEEE floating-point arithmetic, ACM TOMS 15(2):144–157
 * (a table at breakpoints and a short series between them); A. Ziv (1991), Fast
 * evaluation of elementary mathematical functions with correctly rounded last
 * bit, ACM TOMS 17(3):410–423 (an approximation with a known error bound decides
 * the rounded result unless the bound straddles a rounding boundary).
 */

/** Relative error bound of the table-and-series power, and of `Math.pow`, with a wide margin (both are within a few 2⁻⁵³). */
export const POWER_TOLERANCE = 1e-13

/** Leading mantissa bits that pick a bucket. */
const BUCKET_BITS = 8

const fr = Math.fround
const F32 = new Float32Array(1)
const U32 = new Uint32Array(F32.buffer)

/** `fr(x^a)` on a table of the binades `2^eLo ..< 2^eHi`, exact to `fr(Math.pow(x, a))`. */
export class Pow32 {
  private readonly a: number
  /** `(biased exponent, leading mantissa bits)` of the first bucket, as the top bits of a single. */
  private readonly base: number
  private readonly size: number
  private readonly start: Float64Array
  private readonly inv: Float64Array
  private readonly at: Float64Array
  private readonly c1: number
  private readonly c2: number
  private readonly c3: number
  private readonly c4: number
  private readonly c5: number

  constructor(a: number, eLo: number, eHi: number) {
    this.a = a
    const per = 1 << BUCKET_BITS
    this.base = (127 + eLo) * per
    this.size = (eHi - eLo) * per
    this.start = new Float64Array(this.size)
    this.inv = new Float64Array(this.size)
    this.at = new Float64Array(this.size)
    for (let i = 0; i < this.size; i++) {
      U32[0] = (this.base + i) << (23 - BUCKET_BITS)
      const x0 = F32[0]
      this.start[i] = x0
      this.inv[i] = 1 / x0
      this.at[i] = Math.pow(x0, a)
    }
    this.c1 = a
    this.c2 = (this.c1 * (a - 1)) / 2
    this.c3 = (this.c2 * (a - 2)) / 3
    this.c4 = (this.c3 * (a - 3)) / 4
    this.c5 = (this.c4 * (a - 4)) / 5
  }

  /** `Math.fround(Math.pow(x, a))`. */
  of(x: number): number {
    F32[0] = x
    const i = (U32[0] >>> (23 - BUCKET_BITS)) - this.base
    if (i >= 0 && i < this.size) {
      const d = (x - this.start[i]) * this.inv[i]
      const y =
        this.at[i] *
        (1 + d * (this.c1 + d * (this.c2 + d * (this.c3 + d * (this.c4 + d * this.c5)))))
      const lo = fr(y * (1 - POWER_TOLERANCE))
      if (lo === fr(y * (1 + POWER_TOLERANCE))) return lo
    }
    return fr(Math.pow(x, this.a))
  }
}
