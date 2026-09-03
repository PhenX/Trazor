/**
 * The gradient detection scenes pinned by `gradient-scenes.test.ts`: synthetic
 * images built pixel by pixel (exactly reproducible) with the settings each is
 * traced with. `npx tsx scripts/gradient-scenes.ts` writes them as PNGs.
 */
import { createRaster, mulberry32, setPixel } from '@trazor/core'
import type { RasterImage, VectorizeSettings } from '@trazor/core'

type Rgb = [number, number, number]
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
/** Piecewise-linear color ramp through `stops` (ascending offsets in [0, 1]). */
function rampAt(stops: readonly (readonly [number, Rgb])[], t: number): Rgb {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      return mix(
        stops[i - 1][1],
        stops[i][1],
        (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]),
      )
    }
  }
  return stops[stops.length - 1][1]
}

/** Build an image from a per-pixel color callback (alpha 255 unless a 4th channel is returned). */
function build(
  w: number,
  h: number,
  px: (x: number, y: number) => Rgb | [...Rgb, number],
): RasterImage {
  const img = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px(x, y)
      setPixel(img, x, y, Math.round(c[0]), Math.round(c[1]), Math.round(c[2]))
      if (c.length === 4) img.data[(y * w + x) * 4 + 3] = Math.round(c[3])
    }
  }
  return img
}

export interface Scene {
  name: string
  image: () => RasterImage
  settings: Partial<VectorizeSettings>
}

export const scenes: Scene[] = [
  {
    name: 'horizontal gray ramp, 8 colors',
    image: () => build(160, 60, (x) => mix([30, 30, 30], [230, 230, 230], x / 159)),
    settings: { paletteSize: 8 },
  },
  {
    name: 'horizontal gray ramp, 2 colors',
    image: () => build(160, 60, (x) => mix([30, 30, 30], [230, 230, 230], x / 159)),
    settings: { paletteSize: 2 },
  },
  {
    name: 'gentle low-contrast ramp',
    image: () => build(160, 60, (x) => mix([120, 120, 120], [160, 160, 160], x / 159)),
    settings: { paletteSize: 6 },
  },
  {
    name: 'vertical three-stop sky bending in Oklab',
    image: () =>
      build(120, 200, (_x, y) =>
        rampAt(
          [
            [0, [24, 40, 110]],
            [0.5, [146, 84, 132]],
            [1, [250, 214, 130]],
          ],
          y / 199,
        ),
      ),
    settings: { paletteSize: 16 },
  },
  {
    name: 'diagonal ramp on a wide canvas',
    image: () => build(180, 60, (x, y) => mix([30, 60, 120], [240, 220, 160], (x + y) / 238)),
    settings: { paletteSize: 10 },
  },
  {
    name: 'radial vignette',
    image: () =>
      build(160, 120, (x, y) =>
        mix([240, 240, 240], [40, 40, 40], Math.hypot(x + 0.5 - 80, y + 0.5 - 60) / 100),
      ),
    settings: { paletteSize: 8 },
  },
  {
    name: 'off-center radial disc on flat ground',
    image: () =>
      build(160, 120, (x, y) => {
        const d = Math.hypot(x + 0.5 - 60, y + 0.5 - 50)
        return d < 45 ? mix([250, 240, 200], [200, 80, 40], d / 45) : [30, 34, 44]
      }),
    settings: { paletteSize: 10 },
  },
  {
    name: 'two ramps with different axes (sky over sea)',
    image: () =>
      build(160, 120, (x, y) =>
        y < 60
          ? mix([20, 40, 120], [120, 160, 230], y / 59)
          : mix([10, 60, 90], [60, 140, 160], x / 159),
      ),
    settings: { paletteSize: 12 },
  },
  {
    name: 'ramp with a flat block inside',
    image: () =>
      build(160, 60, (x, y) => {
        if (x > 50 && x < 110 && y > 20 && y < 40) return [10, 10, 10]
        const v = 60 + (x / 159) * 180
        return [v, v * 0.8, v * 0.5]
      }),
    settings: { paletteSize: 8 },
  },
  {
    name: 'posterized source with six flat steps (no gradient)',
    image: () =>
      build(120, 40, (x) => {
        const v = 30 + Math.floor(x / 20) * 40
        return [v, v, v]
      }),
    settings: { paletteSize: 6 },
  },
  {
    name: 'flat stripes (no gradient)',
    image: () =>
      build(150, 60, (x) => {
        const c: Rgb[] = [
          [230, 40, 40],
          [40, 180, 60],
          [40, 60, 220],
          [240, 220, 40],
          [250, 250, 250],
        ]
        return c[Math.floor(x / 30)]
      }),
    settings: { paletteSize: 5 },
  },
  {
    name: 'noisy ramp',
    image: () => {
      const rnd = mulberry32(11)
      const gauss = (): number =>
        Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd())
      return build(160, 60, (x) => {
        const v = 30 + (x / 159) * 200 + gauss() * 8
        return [v, v, v]
      })
    },
    settings: { paletteSize: 8 },
  },
  {
    name: 'disc fading to transparent',
    image: () =>
      build(120, 120, (x, y) => {
        const d = Math.hypot(x + 0.5 - 60, y + 0.5 - 60)
        return [200, 30, 30, clamp01(1 - (d - 15) / 35) * 255]
      }),
    settings: { paletteSize: 8, alphaThreshold: 32 },
  },
  {
    name: 'glow over a sky ramp (stacked overlay)',
    image: () =>
      build(240, 180, (x, y) => {
        const sky = mix([20, 30, 90], [250, 140, 60], y / 179)
        return mix(sky, [255, 240, 120], clamp01(1 - Math.hypot(x - 150, y - 60) / 28))
      }),
    settings: { paletteSize: 24 },
  },
  {
    name: 'dusk landscape (studio sample, illustration settings)',
    image: () => {
      const size = 480
      const sky: (readonly [number, Rgb])[] = [
        [0, [24, 40, 110]],
        [0.5, [146, 84, 132]],
        [0.78, [240, 154, 106]],
        [1, [250, 214, 130]],
      ]
      const ridge = (u: number, base: number, amp: number, freq: number, phase: number): number =>
        base + amp * Math.sin(u * freq + phase) + amp * 0.4 * Math.sin(u * freq * 2.3 + phase * 1.7)
      const hills = [
        {
          base: 0.7,
          amp: 0.05,
          freq: 3.1,
          phase: 0.6,
          top: [122, 78, 120] as Rgb,
          bottom: [64, 42, 84] as Rgb,
        },
        {
          base: 0.86,
          amp: 0.04,
          freq: 2.6,
          phase: 3.1,
          top: [46, 34, 72] as Rgb,
          bottom: [16, 12, 34] as Rgb,
        },
      ]
      return build(size, size, (x, y) => {
        const u = x / (size - 1)
        const v = y / (size - 1)
        let c = rampAt(sky, v)
        const d = Math.hypot(x + 0.5 - size * 0.62, y + 0.5 - size * 0.42)
        if (d < size * 0.09) c = mix([255, 246, 214], [255, 190, 96], clamp01(d / (size * 0.09)))
        for (const h of hills) {
          const top = ridge(u, h.base, h.amp, h.freq, h.phase)
          const from = h.base - h.amp * 1.4
          if (v >= top) c = mix(h.top, h.bottom, clamp01((v - from) / (1 - from)))
        }
        return c
      })
    },
    settings: {
      paletteSize: 24,
      autoPaletteSize: true,
      layering: 'stacked',
      minRegionArea: 4,
      smoothing: 0.85,
    },
  },
]
