// Rasterize an SVG to a clean, square RGBA "shape" image (with alpha). Renders at
// supersample scale for anti-aliasing, applies optional geometric augmentation,
// then area-downsamples to the target resolution. The shape keeps its alpha so
// the caller can composite it over a background and derive edge targets from the
// true outline rather than from background texture.

import { Resvg } from '@resvg/resvg-js'
import { affineTransform, fitSquare, perspectiveTransform, resizeArea } from './imageops.mjs'
import { chance, uniform } from './random.mjs'

export function renderShape(svg, cfg, rng) {
  const side = cfg.resolution * cfg.supersample
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
  if (cfg.geometric.enabled) {
    const g = cfg.geometric
    img = affineTransform(img, {
      rotateDeg: uniform(rng, -g.rotateDeg, g.rotateDeg),
      scale: 1 + uniform(rng, -g.scale, g.scale),
      tx: uniform(rng, -g.translateFrac, g.translateFrac),
      ty: uniform(rng, -g.translateFrac, g.translateFrac),
    })
    // Mild projective warp (photo of a screen/paper at an angle). Applied to the
    // shape before targets are derived, so edge/field/clean stay pixel-aligned.
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
  }
  return resizeArea(img, cfg.resolution, cfg.resolution)
}
