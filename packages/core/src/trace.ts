import type { StageId } from './engine'

/**
 * Opt-in pipeline tracing: a diagnostic stream of what each stage produced —
 * intermediate rasters, distributions and metrics — for a step-by-step inspector.
 * Recording is side-effect-free: a traced run returns byte-identical SVG to an
 * untraced one (timings and snapshots are observations, never inputs). All types
 * here are plain data that survives structured cloning across the worker boundary.
 */

/** What a {@link TraceRaster} carries in `data`. */
export type TraceRasterKind =
  | 'rgba' // 4·w·h Uint8ClampedArray, straight RGBA
  | 'gray' // w·h Uint8Array, 0–255 luminance
  | 'mask' // w·h Uint8Array, 0 or 1
  | 'labels' // w·h Uint16Array of label indices; colors in `palette`

/** A downscaled intermediate image captured at a step, ready to draw to a canvas. */
export interface TraceRaster {
  kind: TraceRasterKind
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array | Uint16Array
  /** For `labels`: `#rrggbb` per index (index 65535 ⇒ unlabeled/transparent). */
  palette?: string[]
  /** Short English caption for the panel. */
  caption?: string
}

/** How a {@link TraceChart} is drawn. */
export type TraceChartKind =
  | 'histogram' // `values` are bin counts spanning [min, max]
  | 'bars' // `values` are one bar each, optionally named/colored

/**
 * A small quantitative view for a step — the imaginative fallback when there is
 * no image to show (a luminance histogram, palette populations, node counts).
 */
export interface TraceChart {
  kind: TraceChartKind
  /** Title shown above the chart. */
  label: string
  values: number[]
  /** Per-bar labels (`bars`), same length as `values`. */
  barLabels?: string[]
  /** Per-bar `#rrggbb` colors (`bars`), same length as `values`. */
  colors?: string[]
  /** Value range the bins span (`histogram`). */
  min?: number
  max?: number
  /** Axis captions. */
  xLabel?: string
  yLabel?: string
  /** Draw the value axis on a log scale (long-tailed distributions). */
  log?: boolean
}

/** Which pipeline step a {@link TraceStep} records. */
export type TraceStepCode =
  | 'preprocess'
  | 'palette'
  | 'segment'
  | 'threshold'
  | 'thin'
  | 'trace'
  | 'serialize'

/** One recorded pipeline step, streamed as it completes. */
export interface TraceStep {
  /** Emission order, 0-based. */
  index: number
  code: TraceStepCode
  /** The progress stage this step belongs to. */
  stage: StageId
  /** Short English label (a UI may localize by `code`). */
  label: string
  /** Working-time window, ms on the worker clock; `endMs - startMs` is the step's cost. */
  startMs: number
  endMs: number
  /** Free-form English observations about what happened. */
  notes?: string[]
  /** Named scalar readings (counts, fractions, sizes). */
  metrics?: Record<string, number>
  /** Image snapshots to draw. */
  rasters?: TraceRaster[]
  /** Distributions / bar readings to draw. */
  charts?: TraceChart[]
}

/** Sink for {@link TraceStep}s; wired through {@link EngineContext.onTrace}. */
export type EngineTracer = (step: TraceStep) => void
