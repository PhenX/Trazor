/**
 * Gradient paint model. A traced region is normally filled with one flat color;
 * when gradient detection is on, a region that is really a smooth color ramp is
 * filled with one of these instead. The geometry is unchanged — only the paint
 * differs — so the tracer, the cutout seam-free partition and the stacked layer
 * build are untouched (mesh-free: standard SVG paint servers, no gradient mesh).
 *
 * Coordinates are user space (the SVG viewBox pixel space the paths live in), so
 * the serializer emits `gradientUnits="userSpaceOnUse"` and no per-shape
 * normalization is needed. Reference: Du et al., "Image Vectorization and
 * Editing via Linear Gradient Layer Decomposition", ACM TOG (SIGGRAPH) 42(4),
 * 2023 — the region-into-gradient decomposition this implements the linear case
 * of.
 */

/**
 * One gradient color stop: `offset` in [0,1] along the ramp, `color` `'#rrggbb'`,
 * and `opacity` in [0,1] (absent ⇒ 1; serialized as `stop-opacity`). A ramp
 * whose coverage fades — a source fade to transparent, or a semi-transparent
 * layer stacked over another paint — carries its opacity here.
 */
export interface GradientStop {
  offset: number
  color: string
  opacity?: number
}

/**
 * A linear gradient in user space. Colors interpolate along the vector
 * `(x1,y1) → (x2,y2)`; a pixel's color is its stop value at the point where its
 * projection onto that vector falls (clamped past the ends, SVG `pad`).
 */
export interface LinearGradientPaint {
  kind: 'linear'
  x1: number
  y1: number
  x2: number
  y2: number
  stops: GradientStop[]
}

/**
 * A radial gradient in user space. Colors interpolate outward from `(cx,cy)` to
 * radius `r`.
 */
export interface RadialGradientPaint {
  kind: 'radial'
  cx: number
  cy: number
  r: number
  stops: GradientStop[]
}

export type GradientPaint = LinearGradientPaint | RadialGradientPaint
