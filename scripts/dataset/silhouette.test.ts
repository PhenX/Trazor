import { describe, expect, it } from 'vitest'
// @ts-expect-error — the dataset generator is untyped .mjs, exercised here at runtime.
import { DEFAULTS } from './config.mjs'
// @ts-expect-error — untyped .mjs.
import { compositeOver, makeBackground } from './degrade.mjs'
// @ts-expect-error — untyped .mjs.
import { mulberry32 } from './random.mjs'
// @ts-expect-error — untyped .mjs.
import { renderShape } from './render.mjs'
// @ts-expect-error — untyped .mjs.
import { silhouetteItem } from './sources.mjs'
// @ts-expect-error — untyped .mjs.
import { fieldMap } from './targets.mjs'

const FAMILIES = ['glyph', 'stroke', 'blob', 'thin', 'mixed']

describe('silhouette source', () => {
  it('is fully determined by (index, seed)', () => {
    expect(silhouetteItem(7, 1).svg).toBe(silhouetteItem(7, 1).svg)
    expect(silhouetteItem(7, 1).svg).not.toBe(silhouetteItem(7, 2).svg)
    expect(silhouetteItem(7, 1).svg).not.toBe(silhouetteItem(8, 1).svg)
  })

  it('cycles the archetype families and ids by index', () => {
    for (let i = 0; i < FAMILIES.length; i++) {
      const item = silhouetteItem(i, 1)
      expect(item.family).toBe(FAMILIES[i])
      expect(item.id).toBe(`sil-${String(i).padStart(5, '0')}`)
    }
    expect(silhouetteItem(FAMILIES.length, 1).family).toBe(FAMILIES[0])
  })

  it('renders one ink on a paper ground — a paper background rect and ink marks', () => {
    for (let i = 0; i < 25; i++) {
      const { svg } = silhouetteItem(i, 3)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      // A single leading full-frame rect is the paper ground.
      expect(svg).toMatch(/^<svg[^>]*><rect width="100" height="100" fill="#[0-9a-f]{6}"\/>/)
      // At least one ink mark (fill or stroke) beyond the paper rect.
      expect(
        /(fill|stroke)="#[0-9a-f]{6}"/g.test(svg.replace(/^<svg[^>]*><rect[^>]*\/>/, '')),
      ).toBe(true)
    }
  })

  it('produces a coverage field with both paper (~0) and ink (~1) regions', () => {
    // Clean, unaugmented render → the field the tracer would consume.
    const cfg = structuredClone(DEFAULTS)
    cfg.geometric.enabled = false
    cfg.degrade.background = false
    for (const family of FAMILIES) {
      const index = FAMILIES.indexOf(family)
      const rng = mulberry32(1234 + index)
      const shape = renderShape(silhouetteItem(index, 5).svg, cfg, rng)
      const bg = makeBackground(cfg.resolution, cfg.resolution, rng, cfg.degrade.background)
      const clean = compositeOver(shape, bg)
      const field = fieldMap(clean)
      let paper = 0
      let ink = 0
      for (let p = 0; p < field.length; p++) {
        if (field[p] < 40) paper++
        else if (field[p] > 200) ink++
      }
      // Paper dominates (a silhouette is sparse ink), but real ink is present.
      expect(paper / field.length).toBeGreaterThan(0.4)
      expect(ink).toBeGreaterThan(field.length * 0.01)
    }
  })
})
