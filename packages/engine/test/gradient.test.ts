import { describe, expect, it } from 'vitest'
import { createRaster, fillRaster, normalizeSettings, setPixel } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { vectorize } from '@trazor/engine'
import { analyzeSvg } from '@trazor/svg'

/** A smooth horizontal grayscale ramp, dark left to light right. */
function rampImage(w = 96, h = 48): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(30 + (x / (w - 1)) * 200)
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

/** A concentric grayscale ramp (dark center → light edge). */
function radialImage(w = 96, h = 96): RasterImage {
  const img = createRaster(w, h)
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.hypot(cx, cy)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(30 + (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / maxR) * 200)
      setPixel(img, x, y, v, v, v)
    }
  }
  return img
}

/** A vertical sky ramp with a soft radial glow of one color composited over it. */
function glowImage(w = 240, h = 180): RasterImage {
  const img = createRaster(w, h)
  const lerp = (a: number, b: number, t: number): number =>
    a + (b - a) * Math.min(1, Math.max(0, t))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / (h - 1)
      const a = Math.max(0, 1 - Math.hypot(x - 150, y - 60) / 28)
      setPixel(
        img,
        x,
        y,
        Math.round(lerp(lerp(20, 250, t), 255, a)),
        Math.round(lerp(lerp(30, 140, t), 240, a)),
        Math.round(lerp(lerp(90, 60, t), 120, a)),
      )
    }
  }
  return img
}

/** A red disc whose alpha fades from 1 at the center to 0 at the rim, on a transparent canvas. */
function fadeImage(w = 120, h = 120): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2)
      const a = Math.max(0, Math.min(1, 1 - (d - 15) / 35))
      const p = (y * w + x) * 4
      img.data[p] = 200
      img.data[p + 1] = 30
      img.data[p + 2] = 30
      img.data[p + 3] = Math.round(a * 255)
    }
  }
  return img
}

/** Every `<path>`'s `d` and `fill`, in document order. */
function pathsOf(svg: string): { d: string; fill: string }[] {
  return [...svg.matchAll(/<path\b[^>]*>/g)].map((m) => ({
    d: /\bd="([^"]*)"/.exec(m[0])?.[1] ?? '',
    fill: /\bfill="([^"]*)"/.exec(m[0])?.[1] ?? '',
  }))
}

/** A hard-edged red square on white — two flat colors, no ramp. */
function flatImage(w = 60, h = 60): RasterImage {
  const img = createRaster(w, h)
  fillRaster(img, 255, 255, 255)
  for (let y = 15; y < 45; y++) {
    for (let x = 15; x < 45; x++) setPixel(img, x, y, 210, 30, 40)
  }
  return img
}

describe('gradient detection — engine', () => {
  it('is byte-identical when no ramp is present', async () => {
    const img = flatImage()
    const off = await vectorize(img, normalizeSettings({ gradients: false }))
    const on = await vectorize(img, normalizeSettings({ gradients: true }))
    expect(on.svg).toBe(off.svg)
  })

  it('paints a ramp with one gradient instead of many bands', async () => {
    const img = rampImage()
    const off = await vectorize(img, normalizeSettings({ paletteSize: 16, gradients: false }))
    const on = await vectorize(img, normalizeSettings({ paletteSize: 16, gradients: true }))

    expect(off.svg).not.toContain('<linearGradient')
    expect(on.svg).toContain('<linearGradient')
    // The merged ramp is far fewer shapes than the posterized bands.
    expect(on.stats.pathCount).toBeLessThan(off.stats.pathCount)
    // The palette still reports real swatches (the gradient's stop colors).
    expect(on.palette.length).toBeGreaterThan(0)
    // Output is still valid, analyzable SVG.
    expect(analyzeSvg(on.svg).width).toBe(img.width)
  })

  it('paints a concentric ramp with a radial gradient', async () => {
    const on = await vectorize(
      radialImage(),
      normalizeSettings({ paletteSize: 16, gradients: true }),
    )
    expect(on.svg).toContain('<radialGradient')
    expect(on.svg).toContain('gradientUnits="userSpaceOnUse"')
  })

  it('gradientMinArea and low gradientStrength suppress detection', async () => {
    const img = rampImage()
    const on = await vectorize(img, normalizeSettings({ paletteSize: 16, gradients: true }))
    expect(on.svg).toContain('<linearGradient')
    // A min area larger than the image keeps every region flat.
    const bigArea = await vectorize(
      img,
      normalizeSettings({ paletteSize: 16, gradients: true, gradientMinArea: 1_000_000 }),
    )
    expect(bigArea.svg).not.toContain('<linearGradient')
    // The strength knob is a valid, distinct cache/behaviour axis.
    const weak = await vectorize(
      img,
      normalizeSettings({ paletteSize: 16, gradients: true, gradientStrength: 0 }),
    )
    expect(weak.stats.pathCount).toBeGreaterThanOrEqual(on.stats.pathCount)
  })

  it('is ignored in pixel mode (exact lattice)', async () => {
    const img = rampImage()
    const px = await vectorize(img, normalizeSettings({ curveMode: 'pixel', gradients: true }))
    expect(px.svg).not.toContain('<linearGradient')
  })

  it('warns when gradients meet a spot-color (mm) target', async () => {
    const img = rampImage()
    const res = await vectorize(img, normalizeSettings({ gradients: true, unit: 'mm' }))
    expect(res.svg).toContain('<linearGradient')
    expect(res.warnings.some((w) => w.code === 'gradient-spot-color')).toBe(true)
  })

  it('emits a fade of a transparent source as one gradient with opacity stops', async () => {
    const res = await vectorize(
      fadeImage(),
      normalizeSettings({ paletteSize: 8, gradients: true, alphaThreshold: 32 }),
    )
    expect(res.svg).toContain('<radialGradient')
    expect(res.svg).toContain('stop-opacity=')
    // Every stop is the disc's own color: the white the source was flattened
    // onto never reaches the output.
    const stops = [...res.svg.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1])
    expect(stops.length).toBeGreaterThanOrEqual(2)
    expect(new Set(stops).size).toBe(1)
    expect(res.stats.pathCount).toBe(1)
  })

  for (const layering of ['cutout', 'stacked'] as const) {
    it(`paints a glow over a sky as an opacity overlay above an underlay (${layering})`, async () => {
      const res = await vectorize(
        glowImage(),
        normalizeSettings({ paletteSize: 24, gradients: true, layering }),
      )
      expect(res.svg).toContain('stop-opacity=')
      // The overlay shape is painted right after a shape of identical geometry
      // carrying its base's paint, so the two paint servers composite.
      const paths = pathsOf(res.svg)
      const overlaid = paths.some(
        (p, i) =>
          i > 0 &&
          paths[i - 1].d === p.d &&
          paths[i - 1].fill !== p.fill &&
          p.fill.startsWith('url(#'),
      )
      expect(overlaid).toBe(true)
      // The sky behind the glow is one gradient, not pieces around it.
      expect(res.svg.match(/<linearGradient/g)).toHaveLength(1)
      expect(analyzeSvg(res.svg).width).toBe(240)
    })
  }
})
