import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RasterImage } from '@trazor/core'
import { mulberry32, rgbToOklab } from '@trazor/core'
import {
  detectEdges,
  mergeSmallRegions,
  quantize,
  toGrayscale,
  toOklabBuffer,
} from '@trazor/raster'
import { traceLabelMap } from '@trazor/trace'
import { analyzeSvg } from '@trazor/svg'
import { describe, expect, it } from 'vitest'
import { vectorize } from '../src/native'

/** Per-label palette colors as an interleaved Oklab buffer. */
function paletteOklabOf(paletteRgb: Uint8Array): Float32Array {
  const m = (paletteRgb.length / 3) | 0
  const out = new Float32Array(m * 3)
  for (let i = 0; i < m; i++) {
    const [L, a, b] = rgbToOklab(
      paletteRgb[i * 3] / 255,
      paletteRgb[i * 3 + 1] / 255,
      paletteRgb[i * 3 + 2] / 255,
    )
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = b
  }
  return out
}

/**
 * Opt-in pipeline profiling over a synthetic anti-aliased illustration:
 * per-mode stage timings, node/byte counts, palette purity against the known
 * source colors, and cutout label-map diagnostics (command mix, fragmentation).
 *
 *   AUDIT_BENCH=1 npx vitest run packages/engine/test/audit-bench
 *
 * Writes e2e-artifacts/audit-bench.txt.
 */

const SIZE = 1536
const OUT_DIR = join(process.cwd(), 'e2e-artifacts')

/** The distinct colors painted into the synthetic scene. */
const TRUE_COLORS: [number, number, number][] = [
  [244, 240, 230],
  [40, 44, 52],
  [220, 70, 60],
  [60, 130, 200],
  [250, 200, 60],
  [90, 170, 90],
  [150, 90, 170],
  [240, 140, 40],
  [30, 90, 90],
  [200, 200, 210],
]

/** Anti-aliased blobs over a two-tone background (deterministic, 1px AA rim). */
function makeIllustration(size: number): RasterImage {
  const rng = mulberry32(42)
  const data = new Uint8ClampedArray(size * size * 4)
  interface Blob {
    cx: number
    cy: number
    r: number
    color: [number, number, number]
  }
  const blobs: Blob[] = []
  for (let i = 0; i < 60; i++) {
    blobs.push({
      cx: rng() * size,
      cy: rng() * size,
      r: 20 + rng() * (size / 8),
      color: TRUE_COLORS[1 + ((rng() * (TRUE_COLORS.length - 1)) | 0)],
    })
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = x + y < size ? TRUE_COLORS[0] : TRUE_COLORS[9]
      for (let b = blobs.length - 1; b >= 0; b--) {
        const d = Math.hypot(x - blobs[b].cx, y - blobs[b].cy) - blobs[b].r
        if (d < 0.5) {
          if (d > -0.5) {
            const t = 0.5 - d
            c = [
              c[0] + (blobs[b].color[0] - c[0]) * t,
              c[1] + (blobs[b].color[1] - c[1]) * t,
              c[2] + (blobs[b].color[2] - c[2]) * t,
            ] as [number, number, number]
          } else {
            c = blobs[b].color
          }
          break
        }
      }
      const i = (y * size + x) * 4
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

describe('audit bench', () => {
  it.skipIf(!process.env.AUDIT_BENCH)('profiles the pipeline', { timeout: 600000 }, async () => {
    const image = makeIllustration(SIZE)
    const rows: string[] = []

    const run = async (label: string, patch: Record<string, unknown>): Promise<void> => {
      const res = await vectorize(image, patch as never)
      const a = analyzeSvg(res.svg)
      const stages = res.stats.stages.map((s) => `${s.stage}=${s.ms.toFixed(0)}ms`).join(' ')
      rows.push(
        `${label.padEnd(26)} total=${res.stats.durationMs.toFixed(0).padStart(6)}ms  ` +
          `paths=${String(a.pathCount).padStart(4)} nodes=${String(a.nodeCount).padStart(6)} ` +
          `bytes=${String(a.byteLength).padStart(8)}  | ${stages}`,
      )
    }

    await run('color stacked k16', { mode: 'color', paletteSize: 16 })
    await run('color cutout k16', { mode: 'color', paletteSize: 16, layering: 'cutout' })
    await run('color cutout k10 (pure)', { mode: 'color', paletteSize: 10, layering: 'cutout' })
    await run('color stacked k10 (pure)', { mode: 'color', paletteSize: 10 })
    await run('color stacked k32', { mode: 'color', paletteSize: 32 })
    await run('bw auto', { mode: 'bw' })
    await run('centerline', { mode: 'centerline' })

    // Stage micro-timings outside the engine.
    let t0 = performance.now()
    const q16 = quantize(image, { k: 16, colorSpace: 'oklab', quality: 5, seed: 0x02f6e2b1 })
    const tq = performance.now() - t0
    t0 = performance.now()
    mergeSmallRegions(q16.labels, 6)
    const tm = performance.now() - t0
    t0 = performance.now()
    toGrayscale(image)
    const tg = performance.now() - t0
    rows.push(
      `micro: quantize=${tq.toFixed(0)}ms mergeSmallRegions=${tm.toFixed(0)}ms toGrayscale=${tg.toFixed(0)}ms`,
    )

    // Palette purity: entries matching a painted color (L1 RGB ≤ 12) vs.
    // anti-alias rim mixtures occupying palette slots. Compared plain vs. the
    // edge-aware sampleMask the engine now uses.
    const edges = detectEdges(image, 40)
    const interior = {
      width: image.width,
      height: image.height,
      data: new Uint8Array(image.width * image.height),
    }
    for (let i = 0; i < interior.data.length; i++) interior.data[i] = edges.data[i] === 0 ? 1 : 0
    const purity = (paletteHex: string[], paletteRgb: Uint8Array): number => {
      let pure = 0
      for (let c = 0; c < paletteHex.length; c++) {
        const r = paletteRgb[c * 3]
        const g = paletteRgb[c * 3 + 1]
        const b = paletteRgb[c * 3 + 2]
        if (
          TRUE_COLORS.some(
            (t) => Math.abs(t[0] - r) + Math.abs(t[1] - g) + Math.abs(t[2] - b) <= 12,
          )
        )
          pure++
      }
      return pure
    }
    for (const kk of [10, 16]) {
      const plain = quantize(image, { k: kk, colorSpace: 'oklab', quality: 5, seed: 0x02f6e2b1 })
      const edgeAware = quantize(image, {
        k: kk,
        colorSpace: 'oklab',
        quality: 5,
        seed: 0x02f6e2b1,
        sampleMask: interior,
      })
      rows.push(
        `palette purity k=${kk}: plain ${purity(plain.paletteHex, plain.paletteRgb)}/${plain.paletteHex.length}` +
          ` → edge-aware ${purity(edgeAware.paletteHex, edgeAware.paletteRgb)}/${edgeAware.paletteHex.length}` +
          ` (${TRUE_COLORS.length} painted)  [${edgeAware.paletteHex.join(' ')}]`,
      )
    }

    // Cutout diagnostics at k=10: command mix (line-dominated output signals
    // chain fragmentation) and label components vs. painted regions.
    {
      const qq = quantize(image, {
        k: 10,
        colorSpace: 'oklab',
        quality: 5,
        seed: 0x02f6e2b1,
        sampleMask: interior,
      })
      mergeSmallRegions(qq.labels, 6)
      const regions = traceLabelMap(qq.labels, {
        curveMode: 'spline',
        smoothing: 0.75,
        curveOptimize: true,
        optTolerance: 0.2,
        cornerThreshold: 100,
        colorField: { oklab: toOklabBuffer(image), paletteOklab: paletteOklabOf(qq.paletteRgb) },
      })
      let l = 0
      let c = 0
      let m = 0
      for (const r of regions) {
        for (const cmd of r.commands) {
          if (cmd.type === 'L') l++
          else if (cmd.type === 'C') c++
          else if (cmd.type === 'M') m++
        }
      }
      rows.push(`cutout k10 command mix: rings=${m} L=${l} C=${c}`)

      const { width: lw, data: ld } = qq.labels
      const seen = new Uint8Array(ld.length)
      const st: number[] = []
      let comps = 0
      let small = 0
      for (let i = 0; i < ld.length; i++) {
        if (ld[i] < 0 || seen[i] !== 0) continue
        comps++
        let size = 0
        st.push(i)
        seen[i] = 1
        while (st.length > 0) {
          const p = st.pop() as number
          size++
          const x = p % lw
          if (x > 0 && seen[p - 1] === 0 && ld[p - 1] === ld[i]) {
            seen[p - 1] = 1
            st.push(p - 1)
          }
          if (x < lw - 1 && seen[p + 1] === 0 && ld[p + 1] === ld[i]) {
            seen[p + 1] = 1
            st.push(p + 1)
          }
          if (p >= lw && seen[p - lw] === 0 && ld[p - lw] === ld[i]) {
            seen[p - lw] = 1
            st.push(p - lw)
          }
          if (p + lw < ld.length && seen[p + lw] === 0 && ld[p + lw] === ld[i]) {
            seen[p + lw] = 1
            st.push(p + lw)
          }
        }
        if (size < 200) small++
      }
      rows.push(`cutout k10 fragmentation: components=${comps} (<200px: ${small})`)
    }

    mkdirSync(OUT_DIR, { recursive: true })
    const report = `audit bench @ ${SIZE}×${SIZE}\n${rows.join('\n')}\n`
    writeFileSync(join(OUT_DIR, 'audit-bench.txt'), report)
    expect(rows.length).toBeGreaterThan(0)
  })
})
