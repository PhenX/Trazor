import type { SvgElementKind } from '@vectorizer/svg'

/**
 * Color the complexity overlay tints each SVG element kind with, as a design
 * token name (resolved to a real color by the canvas, used directly as
 * `var(--…)` by the legend). Traced `<path>` geometry keeps the accent; compact
 * primitives each get a distinct hue so they stand out from the traced bulk.
 */
export const SHAPE_KIND_TOKEN: Record<SvgElementKind, string> = {
  path: '--accent',
  line: '--accent',
  polyline: '--accent',
  rect: '--success',
  polygon: '--success',
  circle: '--warn',
  ellipse: '--danger',
}

/** Singular display label per element kind (pluralized with a trailing `s`). */
export const SHAPE_KIND_LABEL: Record<SvgElementKind, string> = {
  path: 'path',
  rect: 'rect',
  circle: 'circle',
  ellipse: 'ellipse',
  line: 'line',
  polyline: 'polyline',
  polygon: 'polygon',
}
