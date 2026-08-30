import type { PathCommand } from './path'

/**
 * A structured, pre-serialization vector document — the raw geometry the engine
 * produces before it writes SVG. Consumers (SVG serializer, alternate exporters)
 * read this instead of re-parsing the SVG string, so coordinates keep full
 * precision and paint/units/layers are exact. Plain data; survives structured
 * cloning across the worker boundary.
 */

/** One drawable shape: absolute path commands plus its paint. */
export interface VectorShape {
  commands: PathCommand[]
  /** `#rrggbb`, `'none'`, or `'url(#id)'` (a gradient in {@link VectorDocument.gradients}); absent ⇒ no fill. */
  fill?: string
  fillRule?: 'nonzero' | 'evenodd'
  stroke?: string
  strokeWidth?: number
  /** Stacking layer (paint order) a shape belongs to, when grouped. */
  layerId?: number
}

/** A gradient's stops, keyed by the id a shape's `fill: 'url(#id)'` references. */
export interface VectorGradient {
  id: string
  kind: 'linear' | 'radial'
  stops: { offset: number; color: string }[]
}

/** The whole document: shapes in paint order, in user (px) coordinates, y-down. */
export interface VectorDocument {
  /** viewBox width/height in px (user units). */
  width: number
  height: number
  /** Output unit; `mm` carries a physical `widthMm`. */
  unit: 'px' | 'mm'
  /** Physical width in mm when `unit === 'mm'`. */
  widthMm?: number
  shapes: VectorShape[]
  /** Gradient paint servers referenced by `fill: 'url(#id)'`. */
  gradients?: VectorGradient[]
}
