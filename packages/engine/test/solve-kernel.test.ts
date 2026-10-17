import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { installWorkerHandler, vectorize } from '@trazor/engine'
import { loadBandKernel } from '@trazor/trace'
import type { BandKernel } from '@trazor/trace'

const WASM = readFileSync(new URL('../../trace/wasm/solve.wasm', import.meta.url))

/** Two overlapping soft discs and a ramp band on a flat ground. */
function art(): RasterImage {
  const w = 72
  const h = 56
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t1 = Math.min(1, Math.max(0, 0.5 - (Math.hypot(x + 0.5 - 24, y + 0.5 - 22) - 13)))
      const t2 = Math.min(1, Math.max(0, 0.5 - (Math.hypot(x + 0.5 - 44, y + 0.5 - 26) - 9.5)))
      let c = [245, 240, 230]
      if (y >= 44) {
        const s = x / (w - 1)
        c = [Math.round(40 + 180 * s), Math.round(90 + 60 * s), Math.round(200 - 150 * s)]
      }
      const a = [200, 40, 50]
      const b = [30, 60, 160]
      const px = c.map((v, i) => Math.round((v + (a[i] - v) * t1) * (1 - t2) + b[i] * t2))
      data.set([...px, 255], 4 * (y * w + x))
    }
  return { width: w, height: h, data }
}

const settings = (patch: Partial<VectorizeSettings>): VectorizeSettings =>
  normalizeSettings({ mode: 'color', paletteSize: 8, geometry: 'planar', ...patch })

let kernel: BandKernel

beforeAll(async () => {
  kernel = await loadBandKernel(WASM)
})

describe('the planar chain with the WebAssembly solve kernel', () => {
  it('traces the same SVG as the TypeScript descent, and runs the descent in the kernel', async () => {
    const img = art()
    for (const patch of [
      { frontEnd: 'ink' as const, gradients: true },
      { frontEnd: 'classic' as const },
      { mode: 'bw' as const },
      { supersample: 2 },
    ]) {
      let calls = 0
      const counted = {
        descend: (...args: Parameters<BandKernel['descend']>) => {
          calls++
          return kernel.descend(...args)
        },
      } as unknown as BandKernel
      const ts = await vectorize(img, settings(patch))
      const wasm = await vectorize(img, settings(patch), undefined, { solveKernel: counted })
      expect({ patch, calls }).toEqual({ patch, calls: 1 })
      expect(wasm.svg).toBe(ts.svg)
    }
  })

  it('takes the kernel as a compiled module through the worker protocol', async () => {
    type Listener = (ev: { data: unknown }) => void
    let listener: Listener | null = null
    const outbox: { type: string; result?: { svg: string } }[] = []
    installWorkerHandler({
      addEventListener: (_type: 'message', fn: Listener) => {
        listener = fn
      },
      postMessage: (msg: unknown) => {
        outbox.push(msg as { type: string })
      },
    })
    const img = art()
    const s = settings({ frontEnd: 'ink', gradients: true })
    const send = (id: number) =>
      listener!({
        data: {
          type: 'vectorize',
          id,
          width: img.width,
          height: img.height,
          buffer: img.data.slice().buffer,
          settings: s,
        },
      })
    listener!({ data: { type: 'solve-kernel', module: await WebAssembly.compile(WASM) } })
    send(1)
    // A module that cannot be instantiated (it imports a function) leaves the TypeScript descent.
    const importing = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 2, 7, 1, 1, 109, 1, 102, 0, 0,
    ])
    listener!({ data: { type: 'solve-kernel', module: await WebAssembly.compile(importing) } })
    send(2)
    const expected = (await vectorize(img, s)).svg
    await expect
      .poll(() => outbox.filter((m) => m.type === 'result').length, { timeout: 20000 })
      .toBe(2)
    for (const m of outbox.filter((o) => o.type === 'result')) expect(m.result!.svg).toBe(expected)
    expect(outbox.some((m) => m.type === 'error')).toBe(false)
  })
})
