// Rasterize an SVG to a clean, square RGBA "shape" image (with alpha). Renders at
// supersample scale for anti-aliasing, applies optional geometric augmentation,
// then area-downsamples to the target resolution. The shape keeps its alpha so
// the caller can composite it over a background and derive edge targets from the
// true outline rather than from background texture.

import { Resvg } from '@resvg/resvg-js'
import {
  affineTransform,
  cropRegion,
  fitSquare,
  lensDistort,
  perspectiveTransform,
  resizeArea,
} from './imageops.mjs'
import { chance, int, uniform } from './random.mjs'

export function renderShape(svg, cfg, rng) {
  const g = cfg.geometric
  const base = cfg.resolution * cfg.supersample
  // Multi-scale: sometimes render larger and crop a native-size window, so features
  // land at the scale the app's inference tiles see on big images (the app tiles a
  // 4096px input into 256px windows) — closing the training/inference scale gap.
  const zoom =
    g.enabled && g.crop && chance(rng, g.cropProb)
      ? uniform(rng, g.cropZoom.min, g.cropZoom.max)
      : 1
  const side = Math.round(base * zoom)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: side },
    font: { loadSystemFonts: false },
  })
  const rendered = resvg.render()
  const raw = {
    width: rendered.width,
    height: rendered.height,
    data: new Uint8ClampedArray(rendered.pixels),
  }
  let img = fitSquare(raw, side)
  if (g.enabled) {
    img = affineTransform(img, {
      rotateDeg: uniform(rng, -g.rotateDeg, g.rotateDeg),
      scale: 1 + uniform(rng, -g.scale, g.scale),
      tx: uniform(rng, -g.translateFrac, g.translateFrac),
      ty: uniform(rng, -g.translateFrac, g.translateFrac),
    })
    // Mild projective warp (photo of a screen/paper at an angle).
    if (g.perspective > 0 && chance(rng, g.perspectiveProb)) {
      const p = g.perspective
      const j = () => uniform(rng, -p, p)
      img = perspectiveTransform(img, [
        { x: j(), y: j() },
        { x: 1 + j(), y: j() },
        { x: 1 + j(), y: 1 + j() },
        { x: j(), y: 1 + j() },
      ])
    }
    // Radial lens distortion (barrel/pincushion).
    if (g.lens > 0 && chance(rng, g.lensProb)) img = lensDistort(img, uniform(rng, -g.lens, g.lens))
  }
  // All augmentation is on the shape before targets are derived, so edge/field/clean
  // stay pixel-aligned. Crop a native-size window last (from the larger render).
  if (zoom > 1) {
    const maxOff = side - base
    img = cropRegion(img, int(rng, 0, maxOff), int(rng, 0, maxOff), base, base)
  }
  return resizeArea(img, cfg.resolution, cfg.resolution)
}
