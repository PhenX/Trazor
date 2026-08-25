import { describe, expect, it } from 'vitest'
import {
  CancelledError,
  DEFAULT_SETTINGS,
  createRaster,
  fillRaster,
  hexToRgb,
  normalizeSettings,
  setPixel,
} from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import type { StageCache } from '@trazor/engine'

function redSquareOnWhite(): RasterImage {
  const img = createRaster(60, 60)
  fillRaster(img, 255, 255, 255)
  for (let y = 15; y < 45; y++) {
    for (let x = 15; x < 45; x++) setPixel(img, x, y, 210, 30, 40)
  }
  return img
}

function donut(): RasterImage {
  const img = createRaster(50, 50)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const d = Math.hypot(x + 0.5 - 25, y + 0.5 - 25)
      if (d < 20 && d > 8) setPixel(img, x, y, 10, 10, 10)
    }
  }
  return img
}

/**
 * A ringed icon on a transparent field: a gray ring wraps a red disk (so gray
 * borders both the red and the exterior — the most shared boundary), with a
 * small solid black dot on the red (the darkest color, but tiny). Red is the
 * largest area; no single color is both largest and most-bordering, so the base
 * layer cannot be chosen by area or by darkness alone.
 */
function ringedIcon(): RasterImage {
  const img = createRaster(40, 40) // transparent background (alpha 0)
  const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
      }
    }
  }
  disk(20, 20, 16, [140, 140, 140]) // gray — becomes a ring once red covers its center
  disk(20, 20, 12, [200, 40, 40]) // red field — largest area
  for (let y = 16; y < 24; y++) {
    for (let x = 16; x < 24; x++) setPixel(img, x, y, 10, 10, 10) // black dot — darkest, tiny
  }
  return img
}

/** Palette entry nearest (RGB) to a seeded color. */
function nearestHex(palette: string[], rgb: [number, number, number]): string {
  let best = palette[0]
  let bestD = Infinity
  for (const hex of palette) {
    const c = hexToRgb(hex)
    if (!c) continue
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = hex
    }
  }
  return best
}

function thickPlus(): RasterImage {
  const img = createRaster(60, 60)
  fillRaster(img, 255, 255, 255)
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      if ((y > 27 && y < 33 && x > 6 && x < 54) || (x > 27 && x < 33 && y > 6 && y < 54)) {
        setPixel(img, x, y, 0, 0, 0)
      }
    }
  }
  return img
}

function settings(patch: Partial<VectorizeSettings>): VectorizeSettings {
  return normalizeSettings({ maxDimension: 0, minRegionArea: 2, ...patch })
}

describe('native engine pipeline', () => {
  it('vectorizes a flat two-color image in stacked color mode', async () => {
    const result = await vectorize(redSquareOnWhite(), settings({ mode: 'color', paletteSize: 4 }))
    expect(result.svg).toContain('<svg')
    expect(result.width).toBe(60)
    expect(result.height).toBe(60)
    expect(result.palette.length).toBe(2)
    expect(result.stats.pathCount).toBeGreaterThanOrEqual(2)
    expect(result.stats.nodeCount).toBeGreaterThan(0)
    expect(result.warnings.filter((w) => w.code === 'empty-result')).toHaveLength(0)
    // The red square must be present as a red-ish fill.
    expect(result.svg).toMatch(/fill="#[a-f0-9]{6}"/)
  })

  it('produces a seam-free cutout with shared boundaries', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', paletteSize: 4, layering: 'cutout', gapFill: 0 }),
    )
    expect(result.palette.length).toBe(2)
    expect(result.stats.pathCount).toBe(2)
  })

  it('is deterministic', async () => {
    const s = settings({ mode: 'color', paletteSize: 6 })
    const a = await vectorize(redSquareOnWhite(), s)
    const b = await vectorize(redSquareOnWhite(), s)
    expect(a.svg).toBe(b.svg)
  })

  it('optimizeSvg compacts path data without changing the geometry', async () => {
    const plain = await vectorize(thickPlus(), settings({ mode: 'bw', optimizeSvg: false }))
    const optimized = await vectorize(thickPlus(), settings({ mode: 'bw', optimizeSvg: true }))
    // Same shapes; never more nodes or bytes (cleanup/primitives may drop some).
    expect(optimized.stats.pathCount).toBe(plain.stats.pathCount)
    expect(optimized.stats.nodeCount).toBeLessThanOrEqual(plain.stats.nodeCount)
    expect(optimized.stats.byteLength).toBeLessThanOrEqual(plain.stats.byteLength)
    // The axis-aligned plus engages H/V shorthands the absolute encoding lacks.
    expect(/d="[^"]*[HV]/.test(optimized.svg)).toBe(true)
    expect(/d="[^"]*[HV]/.test(plain.svg)).toBe(false)
    // On by default.
    const byDefault = await vectorize(thickPlus(), settings({ mode: 'bw' }))
    expect(byDefault.svg).toBe(optimized.svg)
  })

  it('preserveDetails keeps a small high-contrast dot the flat filter removes', async () => {
    const dotImage = (): RasterImage => {
      const img = createRaster(40, 40)
      fillRaster(img, 255, 255, 255)
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 35; x++) setPixel(img, x, y, 180, 180, 180)
      }
      // A 2×2 black dot (4 px) — below minRegionArea, but maximal contrast.
      for (let y = 19; y < 21; y++) {
        for (let x = 19; x < 21; x++) setPixel(img, x, y, 0, 0, 0)
      }
      return img
    }
    const base = { mode: 'color' as const, paletteSize: 4, minRegionArea: 6 }
    const flat = await vectorize(dotImage(), settings({ ...base, preserveDetails: false }))
    const kept = await vectorize(dotImage(), settings({ ...base, preserveDetails: true }))
    expect(kept.stats.pathCount).toBeGreaterThan(flat.stats.pathCount)
    const veryDark = (p: string[]): boolean =>
      p.some((h) => Number.parseInt(h.slice(1, 7), 16) < 0x20_20_20)
    expect(veryDark(kept.palette)).toBe(true)
    expect(veryDark(flat.palette)).toBe(false)
  })

  it('warns about stencil islands on a donut in bw mode', async () => {
    const result = await vectorize(
      donut(),
      settings({ mode: 'bw', detectIslands: true, thresholdMode: 'auto' }),
    )
    expect(result.stats.pathCount).toBe(1)
    const island = result.warnings.find((w) => w.code === 'stencil-islands')
    expect(island).toBeDefined()
  })

  it('extracts centerline strokes with an estimated width', async () => {
    const result = await vectorize(thickPlus(), settings({ mode: 'centerline', pruneLength: 6 }))
    expect(result.svg).toContain('stroke=')
    expect(result.svg).toContain('stroke-linecap="round"')
    const width = /stroke-width="([\d.]+)"/.exec(result.svg)
    expect(width).not.toBeNull()
    const w = Number(width![1])
    expect(w).toBeGreaterThan(2.5)
    expect(w).toBeLessThan(9)
  })

  it('groups color output into one <g> layer per color when groupByColor is set', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', paletteSize: 4, layering: 'stacked', groupByColor: true }),
    )
    // Two colors (red + white) → two layers, balanced open/close tags.
    const layers = result.svg.match(/<g id="layer-\d+">/g) ?? []
    expect(layers.length).toBe(2)
    expect((result.svg.match(/<\/g>/g) ?? []).length).toBe(2)
    // Each used color is named by a layer <title>, and each layer is one path
    // (stacked paints a color as one contiguous run, folded by the optimizer).
    for (const hex of result.palette) expect(result.svg).toContain(`<title>${hex}</title>`)
    expect((result.svg.match(/<path /g) ?? []).length).toBe(2)
  })

  it('does not group output by default', async () => {
    const result = await vectorize(redSquareOnWhite(), settings({ mode: 'color', paletteSize: 4 }))
    expect(result.svg).not.toContain('<g ')
  })

  it('warns when centerline is run on a largely filled image, not on line art', async () => {
    const filled = (): RasterImage => {
      const img = createRaster(40, 40)
      fillRaster(img, 255, 255, 255)
      for (let y = 4; y < 36; y++) {
        for (let x = 4; x < 36; x++) setPixel(img, x, y, 0, 0, 0)
      }
      return img
    }
    const solid = await vectorize(filled(), settings({ mode: 'centerline', thresholdMode: 'auto' }))
    expect(solid.warnings.some((w) => w.code === 'centerline-input')).toBe(true)
    const lines = await vectorize(thickPlus(), settings({ mode: 'centerline', pruneLength: 6 }))
    expect(lines.warnings.some((w) => w.code === 'centerline-input')).toBe(false)
  })

  it('desaturates in grayscale mode', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'grayscale', paletteSize: 4 }),
    )
    for (const hex of result.palette) {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      expect(Math.max(Math.abs(r - g), Math.abs(g - b))).toBeLessThanOrEqual(2)
    }
  })

  it('excludes transparent pixels under background auto', async () => {
    const img = createRaster(40, 40)
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) setPixel(img, x, y, 40, 120, 220)
    }
    const result = await vectorize(img, settings({ mode: 'color', paletteSize: 4 }))
    expect(result.palette).toHaveLength(1)
    expect(result.stats.pathCount).toBe(1)
  })

  it('drops the background layer when omitBackground is set', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', paletteSize: 4, omitBackground: true }),
    )
    expect(result.palette).toHaveLength(1)
  })

  it('honors a fixed palette', async () => {
    const result = await vectorize(
      redSquareOnWhite(),
      settings({ mode: 'color', palette: ['#ff0000', '#ffffff'] }),
    )
    expect(result.palette).toContain('#ff0000')
    expect(result.palette).toContain('#ffffff')
  })

  it('downscales to maxDimension', async () => {
    const big = createRaster(200, 100)
    fillRaster(big, 250, 250, 250)
    for (let y = 20; y < 80; y++) {
      for (let x = 40; x < 160; x++) setPixel(big, x, y, 30, 30, 30)
    }
    const result = await vectorize(big, settings({ maxDimension: 100 }))
    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
  })

  it('emits mm units with physical size warnings for tiny features', async () => {
    const img = createRaster(200, 200)
    fillRaster(img, 255, 255, 255)
    for (let y = 100; y < 103; y++) {
      for (let x = 100; x < 103; x++) setPixel(img, x, y, 0, 0, 0)
    }
    // 200 px → 50 mm is 0.25 mm/px, so the 3 px square is ~0.75 mm — genuinely
    // sub-millimeter regardless of how its corners are rendered.
    const result = await vectorize(
      img,
      settings({ mode: 'bw', unit: 'mm', widthMm: 50, minRegionArea: 1 }),
    )
    expect(result.svg).toContain('mm"')
    expect(result.warnings.some((w) => w.code === 'tiny-features')).toBe(true)
  })

  it('cancels cooperatively', async () => {
    await expect(
      vectorize(redSquareOnWhite(), settings({ mode: 'color' }), { shouldCancel: () => true }),
    ).rejects.toThrow(CancelledError)
  })

  it('reports monotonic progress across stages', async () => {
    const seen: number[] = []
    await vectorize(redSquareOnWhite(), settings({ mode: 'color' }), {
      onProgress: (_stage, overall) => seen.push(overall),
    })
    expect(seen.length).toBeGreaterThan(3)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-9)
    }
    expect(seen[seen.length - 1]).toBeLessThanOrEqual(1)
  })

  it('keeps default settings intact (normalizeSettings copies)', async () => {
    const before = JSON.stringify(DEFAULT_SETTINGS)
    await vectorize(redSquareOnWhite(), settings({ mode: 'color' }))
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before)
  })

  it('an edge hint protects a small bw feature the size filter would drop', async () => {
    const speckImage = (): RasterImage => {
      const img = createRaster(60, 60)
      fillRaster(img, 255, 255, 255)
      for (let y = 15; y < 45; y++) {
        for (let x = 15; x < 45; x++) setPixel(img, x, y, 0, 0, 0)
      }
      setPixel(img, 5, 5, 0, 0, 0) // 1px speck, below minRegionArea
      return img
    }
    const s = settings({ mode: 'bw', minRegionArea: 2, thresholdMode: 'auto' })
    const none = await vectorize(speckImage(), s)
    const hint = { width: 60, height: 60, data: new Float32Array(60 * 60) }
    hint.data[5 * 60 + 5] = 1 // mark the speck as a real boundary
    const withHint = await vectorize(speckImage(), s, { edgeHint: hint })
    expect(withHint.stats.pathCount).toBe(none.stats.pathCount + 1)
    // Same hint ⇒ identical output.
    const again = await vectorize(speckImage(), s, { edgeHint: hint })
    expect(again.svg).toBe(withHint.svg)
  })

  it('an edge hint protects a small color region the merge would drop', async () => {
    const dotImage = (): RasterImage => {
      const img = createRaster(40, 40)
      fillRaster(img, 255, 255, 255)
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 35; x++) setPixel(img, x, y, 180, 180, 180)
      }
      // A 2×2 black dot (4 px) — below minRegionArea, maximal contrast.
      for (let y = 19; y < 21; y++) {
        for (let x = 19; x < 21; x++) setPixel(img, x, y, 0, 0, 0)
      }
      return img
    }
    const s = settings({ mode: 'color', paletteSize: 4, minRegionArea: 6 })
    const none = await vectorize(dotImage(), s)
    const hint = { width: 40, height: 40, data: new Float32Array(40 * 40) }
    for (let y = 19; y < 21; y++) {
      for (let x = 19; x < 21; x++) hint.data[y * 40 + x] = 1 // mark the dot as a boundary
    }
    const withHint = await vectorize(dotImage(), s, { edgeHint: hint })
    expect(withHint.stats.pathCount).toBeGreaterThan(none.stats.pathCount)
    const veryDark = (p: string[]): boolean =>
      p.some((h) => Number.parseInt(h.slice(1, 7), 16) < 0x20_20_20)
    expect(veryDark(withHint.palette)).toBe(true)
    expect(veryDark(none.palette)).toBe(false)
    // Same hint ⇒ identical output.
    const again = await vectorize(dotImage(), s, { edgeHint: hint })
    expect(again.svg).toBe(withHint.svg)
  })
})

describe('worker protocol', () => {
  it('round-trips vectorize and cancel through a fake scope', async () => {
    const { installWorkerHandler } = await import('@trazor/engine')
    type Listener = (ev: { data: unknown }) => void
    let listener: Listener | null = null
    const outbox: unknown[] = []
    const scope = {
      addEventListener: (_type: 'message', fn: Listener) => {
        listener = fn
      },
      postMessage: (msg: unknown) => {
        outbox.push(msg)
      },
    }
    installWorkerHandler(scope)
    expect(listener).not.toBeNull()

    const img = redSquareOnWhite()
    listener!({
      data: {
        type: 'vectorize',
        id: 1,
        width: img.width,
        height: img.height,
        buffer: img.data.slice().buffer,
        settings: settings({ mode: 'color', paletteSize: 4 }),
      },
    })
    // Wait for the async pipeline to finish.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const result = outbox.find((m) => (m as { type: string; id: number }).type === 'result') as
      | { result: { svg: string } }
      | undefined
    expect(result).toBeDefined()
    expect(result!.result.svg).toContain('<svg')
    const progress = outbox.filter((m) => (m as { type: string }).type === 'progress')
    expect(progress.length).toBeGreaterThan(0)
  })

  it('accepts an optional edge hint through the worker message', async () => {
    const { installWorkerHandler } = await import('@trazor/engine')
    type Listener = (ev: { data: unknown }) => void
    let listener: Listener | null = null
    const outbox: unknown[] = []
    const scope = {
      addEventListener: (_type: 'message', fn: Listener) => {
        listener = fn
      },
      postMessage: (msg: unknown) => {
        outbox.push(msg)
      },
    }
    installWorkerHandler(scope)

    const img = redSquareOnWhite()
    listener!({
      data: {
        type: 'vectorize',
        id: 7,
        width: img.width,
        height: img.height,
        buffer: img.data.slice().buffer,
        settings: settings({ mode: 'bw', thresholdMode: 'auto' }),
        edgeHint: new Float32Array(img.width * img.height).buffer,
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    const result = outbox.find((m) => (m as { type: string }).type === 'result')
    expect(result).toBeDefined()
  })
})

describe('stacked layer masks (E1)', () => {
  it('incremental peel builds the same union masks as a per-layer full rescan', () => {
    // Synthetic label map with an uneven color distribution.
    const w = 40
    const h = 30
    const lab = new Int32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let l = 0
        if ((x - 20) ** 2 + (y - 15) ** 2 < 90) l = 1
        else if (x > 30) l = 2
        else if (y < 5) l = 3
        if (x === 0 && y === 0) l = -1 // a masked pixel
        lab[y * w + x] = l
      }
    }
    const count = 4
    const counts = new Int32Array(count)
    for (const l of lab) if (l >= 0) counts[l]++
    const order: number[] = []
    for (let l = 0; l < count; l++) if (counts[l] > 0) order.push(l)
    order.sort((a, b) => counts[b] - counts[a])
    const position = new Int32Array(count).fill(-1)
    order.forEach((label, i) => (position[label] = i))

    // Reference: full rescan per layer (the pre-E1 construction).
    const reference = order.map((_, i) => {
      const m = new Uint8Array(w * h)
      for (let p = 0; p < lab.length; p++) m[p] = lab[p] >= 0 && position[lab[p]] >= i ? 1 : 0
      return m
    })

    // Incremental peel (the E1 construction).
    const offset = new Int32Array(count + 1)
    for (let l = 0; l < count; l++) offset[l + 1] = offset[l] + counts[l]
    const bucket = new Int32Array(offset[count])
    const cursor = offset.slice(0, count)
    for (let p = 0; p < lab.length; p++) if (lab[p] >= 0) bucket[cursor[lab[p]]++] = p
    const data = new Uint8Array(w * h)
    for (let p = 0; p < lab.length; p++) data[p] = lab[p] >= 0 ? 1 : 0
    for (let i = 0; i < order.length; i++) {
      expect([...data]).toEqual([...reference[i]]) // identical bits, every layer
      const label = order[i]
      for (let k = offset[label]; k < offset[label + 1]; k++) data[bucket[k]] = 0
    }
  })
})

describe('stacked base layer', () => {
  it('pins the most-bordering color as the base, not the largest or darkest', async () => {
    const base = { mode: 'color' as const, paletteSize: 6, layering: 'stacked' as const }
    const result = await vectorize(ringedIcon(), settings(base))
    expect(result.palette.length).toBeGreaterThanOrEqual(3)
    const gray = nearestHex(result.palette, [140, 140, 140]) // most bordering (the ring)
    const red = nearestHex(result.palette, [200, 40, 40]) // largest area
    const black = nearestHex(result.palette, [10, 10, 10]) // darkest, tiny
    expect(gray).not.toBe(red)
    expect(gray).not.toBe(black)
    // The base is painted first, so it is the first fill in the document: the
    // connective ring — neither the biggest field nor the darkest speck.
    const firstFill = /fill="(#[0-9a-f]{6})"/.exec(result.svg)?.[1]
    expect(firstFill).toBe(gray)
    expect(firstFill).not.toBe(red)
    expect(firstFill).not.toBe(black)
    // group-by-color names the first-painted color layer-1.
    const grouped = await vectorize(ringedIcon(), settings({ ...base, groupByColor: true }))
    const firstTitle = /<g id="layer-1"><title>(#[0-9a-f]{6})<\/title>/.exec(grouped.svg)?.[1]
    expect(firstTitle).toBe(gray)
    // Reordering never changes the rendered pixels: every color still appears.
    for (const hex of result.palette) expect(result.svg).toContain(hex)
  })
})

/**
 * An eye on a transparent field: a black-outlined blue face with a white sclera
 * and a black pupil enclosed in it. The pupil shares the outline's black, so
 * black recurs — as the full base and as an island lifted on top.
 */
function eyeIcon(): RasterImage {
  const img = createRaster(80, 80)
  const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
      }
    }
  }
  disk(40, 40, 30, [10, 10, 10]) // black outline
  disk(40, 40, 26, [40, 110, 190]) // blue face
  disk(40, 34, 12, [235, 235, 235]) // white sclera
  disk(40, 34, 5, [10, 10, 10]) // black pupil, enclosed in the sclera
  return img
}

describe('stacked islands on top', () => {
  it('lifts an enclosed pupil onto its own top layer, leaving the layers below solid', async () => {
    // Fixed palette so the pupil and outline share one exact black.
    const s = settings({
      mode: 'color',
      layering: 'stacked',
      groupByColor: true,
      preserveDetails: true,
      palette: ['#0a0a0a', '#286ebe', '#ebebeb'],
      optimizeSvg: false,
    })
    const res = await vectorize(eyeIcon(), s)
    const groups = [
      ...res.svg.matchAll(/<g id="layer-\d+"><title>(#[0-9a-f]{6})<\/title>(.*?)<\/g>/gs),
    ]
    const layers = groups.map((g) => ({ color: g[1], subpaths: (g[2].match(/M/g) ?? []).length }))
    const black = '#0a0a0a'
    // Grouped by layer, not color: four layers from three colors, because black
    // is both the base and the pupil island — one merged black layer would sink
    // the pupil to the bottom and render it wrong.
    expect(layers.length).toBe(4)
    expect(layers.filter((l) => l.color === black).length).toBe(2)
    // Base black is painted first; the pupil island is the last (top) layer.
    expect(layers[0].color).toBe(black)
    expect(layers[layers.length - 1].color).toBe(black)
    // The blue face and white sclera below the pupil stay solid — one subpath
    // each, with no floating pupil hole punched through them.
    expect(layers.find((l) => l.color === '#286ebe')?.subpaths).toBe(1)
    expect(layers.find((l) => l.color === '#ebebeb')?.subpaths).toBe(1)
    // Every color still renders; the result is deterministic.
    for (const hex of s.palette as string[]) expect(res.svg).toContain(hex)
    expect((await vectorize(eyeIcon(), s)).svg).toBe(res.svg)
  })

  it('leaves a shallow pocket (one sheet over it) as a hole rather than lifting', async () => {
    // Black outline base + a blue field + a black dot enclosed directly in the
    // blue. Only the blue sheet stacks over the dot (depth 1), so a single hole
    // aligns fine — the dot is not lifted onto its own layer.
    const dotIcon = (): RasterImage => {
      const img = createRaster(80, 80)
      const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
        for (let y = 0; y < 80; y++) {
          for (let x = 0; x < 80; x++) {
            if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
          }
        }
      }
      disk(40, 40, 30, [10, 10, 10]) // black outline (base)
      disk(40, 40, 26, [40, 110, 190]) // blue field
      disk(40, 40, 6, [10, 10, 10]) // black dot enclosed in the blue
      return img
    }
    const s = settings({
      mode: 'color',
      layering: 'stacked',
      groupByColor: true,
      preserveDetails: true,
      palette: ['#0a0a0a', '#286ebe'],
      optimizeSvg: false,
    })
    const res = await vectorize(dotIcon(), s)
    const groups = [
      ...res.svg.matchAll(/<g id="layer-\d+"><title>(#[0-9a-f]{6})<\/title>(.*?)<\/g>/gs),
    ]
    const layers = groups.map((g) => ({ color: g[1], subpaths: (g[2].match(/M/g) ?? []).length }))
    // Two layers only — black is not lifted to a second layer.
    expect(layers.length).toBe(2)
    expect(layers.filter((l) => l.color === '#0a0a0a').length).toBe(1)
    // The dot stays as a hole in the single blue sheet: field ring + dot = two subpaths.
    expect(layers.find((l) => l.color === '#286ebe')?.subpaths).toBe(2)
  })
})

/**
 * Two objects that share no color and no border, on a transparent field: a
 * gray-ringed red disk on the left and a lone green square on the right, with
 * unlabeled space between them. Nothing connects the two, so no single color
 * legitimately backs both — the base's gray must not extend a phantom sheet
 * under the square, the way "peaks" once buried a sun-disc underlay beneath the
 * water at the far side of the picture.
 */
function twoObjects(): RasterImage {
  const img = createRaster(80, 40) // transparent background (alpha 0)
  const disk = (cx: number, cy: number, r: number, rgb: [number, number, number]): void => {
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 80; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) setPixel(img, x, y, ...rgb)
      }
    }
  }
  disk(20, 20, 15, [140, 140, 140]) // gray ring — most bordering, becomes the base
  disk(20, 20, 11, [200, 40, 40]) // red field enclosed by the gray
  for (let y = 10; y < 30; y++) {
    for (let x = 52; x < 72; x++) setPixel(img, x, y, 40, 160, 60) // lone green square
  }
  return img
}

describe('stacked drops redundant underlay', () => {
  it('does not back a disconnected, fully-covered region the layer never touches', async () => {
    const s = settings({
      mode: 'color',
      layering: 'stacked',
      groupByColor: true,
      optimizeSvg: false,
      palette: ['#8c8c8c', '#c82828', '#28a03c'],
    })
    const res = await vectorize(twoObjects(), s)
    const groups = [
      ...res.svg.matchAll(/<g id="layer-\d+"><title>(#[0-9a-f]{6})<\/title>(.*?)<\/g>/gs),
    ]
    const layers = groups.map((g) => ({ color: g[1], subpaths: (g[2].match(/M/g) ?? []).length }))
    // Three colors, three layers.
    expect(layers.length).toBe(3)
    // The gray ring is the most-bordering color, so it is painted first as the
    // base — but only under the left object it actually threads. Its cut is one
    // solid disk, not a disk plus a phantom square backing the far green.
    expect(layers[0].color).toBe('#8c8c8c')
    expect(layers[0].subpaths).toBe(1)
    // Every layer is exactly its own connected blob: no layer drags in the other
    // object as buried, seam-useless underlay. Full underlay would give five.
    const totalSubpaths = layers.reduce((n, l) => n + l.subpaths, 0)
    expect(totalSubpaths).toBe(3)
    // Every color still renders, and the result is deterministic.
    for (const hex of s.palette as string[]) expect(res.svg).toContain(hex)
    expect((await vectorize(twoObjects(), s)).svg).toBe(res.svg)
  })
})

describe('stage cache (E3)', () => {
  // A colorful scene so the palette/segment stages do real work worth caching.
  function scene(): RasterImage {
    const img = createRaster(48, 48)
    fillRaster(img, 250, 248, 240)
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 22)
        if (d < 12) setPixel(img, x, y, 210, 60, 50)
        else if (x > 30 && y > 28) setPixel(img, x, y, 40, 110, 190)
        else if (x < 12 && y < 12) setPixel(img, x, y, 240, 200, 60)
      }
    }
    return img
  }

  const run = (img: RasterImage, s: Partial<VectorizeSettings>, cache?: StageCache, imageId = 1) =>
    vectorize(img, settings(s), undefined, cache ? { imageId, cache } : undefined)

  it('a trace-only change reuses the cache and stays byte-identical to a fresh run', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, paletteSize: 6, layering: 'cutout' as const }

    await run(img, { ...base, smoothing: 0.5 }, cache) // warms preprocess + palette
    const cached = await run(img, { ...base, smoothing: 0.9, optTolerance: 0.4 }, cache)
    const fresh = await run(img, { ...base, smoothing: 0.9, optTolerance: 0.4 })
    expect(cached.svg).toBe(fresh.svg)
    // The cache is populated and its palette entry was reused (a hit, not recomputed).
    expect(cache.imageId).toBe(1)
    expect(cache.palette?.size).toBeGreaterThan(0)
    expect(cache.stats?.preHits).toBeGreaterThan(0)
    expect(cache.stats?.palHits).toBeGreaterThan(0)
  })

  it('a palette change invalidates the label cache (matches a fresh run)', async () => {
    const img = scene()
    const cache: StageCache = {}
    await run(img, { mode: 'color', paletteSize: 4 }, cache)
    const cached = await run(img, { mode: 'color', paletteSize: 8 }, cache)
    const fresh = await run(img, { mode: 'color', paletteSize: 8 })
    expect(cached.svg).toBe(fresh.svg)
  })

  it('a preprocess change invalidates preprocess + palette (matches a fresh run)', async () => {
    const img = scene()
    const cache: StageCache = {}
    await run(img, { mode: 'color', paletteSize: 6, blurRadius: 0 }, cache)
    const cached = await run(img, { mode: 'color', paletteSize: 6, blurRadius: 2 }, cache)
    const fresh = await run(img, { mode: 'color', paletteSize: 6, blurRadius: 2 })
    expect(cached.svg).toBe(fresh.svg)
  })

  it('a new image id invalidates the cache (matches a fresh run)', async () => {
    const cache: StageCache = {}
    const a = scene()
    const b = redSquareOnWhite()
    await run(a, { mode: 'color', paletteSize: 6 }, cache, 1)
    const cached = await vectorize(b, settings({ mode: 'color', paletteSize: 6 }), undefined, {
      imageId: 2,
      cache,
    })
    const fresh = await run(b, { mode: 'color', paletteSize: 6 })
    expect(cached.svg).toBe(fresh.svg)
  })

  it('switching mode reuses preprocess only when compatible, staying correct', async () => {
    const img = scene()
    const cache: StageCache = {}
    await run(img, { mode: 'color', paletteSize: 6 }, cache)
    // grayscale changes the preKey (desaturation) → recompute, still correct.
    const cachedGray = await run(img, { mode: 'grayscale', paletteSize: 6 }, cache)
    const freshGray = await run(img, { mode: 'grayscale', paletteSize: 6 })
    expect(cachedGray.svg).toBe(freshGray.svg)
  })

  it('keeps several palettes warm so alternating them hits the cache (byte-identical)', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const, layering: 'cutout' as const }
    // Warm two distinct palettes, then revisit each: a single-slot cache would
    // have evicted the first, but the LRU keeps both.
    await run(img, { ...base, paletteSize: 4 }, cache)
    await run(img, { ...base, paletteSize: 8 }, cache)
    const before = { ...(cache.stats as NonNullable<StageCache['stats']>) }
    const revisit4 = await run(img, { ...base, paletteSize: 4 }, cache)
    const revisit8 = await run(img, { ...base, paletteSize: 8 }, cache)
    expect(revisit4.svg).toBe((await run(img, { ...base, paletteSize: 4 })).svg)
    expect(revisit8.svg).toBe((await run(img, { ...base, paletteSize: 8 })).svg)
    // Both revisits were palette hits (no new misses beyond the two warm-ups).
    expect(cache.palette?.size).toBe(2)
    expect((cache.stats as NonNullable<StageCache['stats']>).palHits - before.palHits).toBe(2)
  })

  it('evicts the oldest palette beyond the cache size', async () => {
    const img = scene()
    const cache: StageCache = {}
    const base = { mode: 'color' as const }
    // Five distinct palettes on one worker; the cache retains at most four.
    for (const k of [3, 4, 5, 6, 7]) await run(img, { ...base, paletteSize: k }, cache)
    expect(cache.palette && cache.palette.size).toBeLessThanOrEqual(4)
    // The oldest (paletteSize 3) was evicted, so revisiting it is a miss again,
    // but the result is still byte-identical to a fresh trace.
    const revisit3 = await run(img, { ...base, paletteSize: 3 }, cache)
    expect(revisit3.svg).toBe((await run(img, { ...base, paletteSize: 3 })).svg)
  })
})
