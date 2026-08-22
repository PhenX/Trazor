import type { GrayImage, RasterImage } from './raster'
import type { VectorizeMode, VectorizeSettings } from './settings'

/** Pipeline stages, in execution order, used for progress reporting. */
export const STAGE_IDS = ['preprocess', 'palette', 'segment', 'trace', 'fit', 'svg'] as const
export type StageId = (typeof STAGE_IDS)[number]

export type WarningCode =
  | 'stencil-islands'
  | 'node-count'
  | 'empty-result'
  | 'palette-clamped'
  | 'tiny-features'
  | 'mode-note'

export interface VectorizeWarning {
  code: WarningCode
  severity: 'info' | 'warning'
  message: string
}

export interface StageTiming {
  stage: StageId
  ms: number
}

export interface VectorizeStats {
  pathCount: number
  nodeCount: number
  colorCount: number
  byteLength: number
  durationMs: number
  stages: StageTiming[]
}

export interface VectorizeResult {
  svg: string
  /** Traced raster size in px (after optional downscale). */
  width: number
  height: number
  /** Hex colors actually used, in paint order. */
  palette: string[]
  stats: VectorizeStats
  warnings: VectorizeWarning[]
}

export interface EngineContext {
  /** Called with the stage being worked on and overall progress in [0, 1]. */
  onProgress?: (stage: StageId, overall: number) => void
  /** Polled between work chunks; return true to abort with CancelledError. */
  shouldCancel?: () => boolean
  /**
   * Optional boundary probability map (e.g. from @vectorizer/ml's EdgeEnhancer)
   * at the source-image resolution. When present, the pipeline discretizes it and
   * uses it as a Tier-2 hint to protect thin features; absent, tracing is
   * byte-identical to the classical path.
   */
  edgeHint?: GrayImage
}

/** Thrown (and rejected with) when `shouldCancel` interrupts a run. */
export class CancelledError extends Error {
  constructor() {
    super('vectorization cancelled')
    this.name = 'CancelledError'
  }
}

export interface VectorizerEngine {
  readonly id: string
  readonly label: string
  readonly modes: readonly VectorizeMode[]
  vectorize(
    image: RasterImage,
    settings: VectorizeSettings,
    ctx?: EngineContext,
  ): Promise<VectorizeResult>
}
