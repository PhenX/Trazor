import type {
  CurveMode,
  StageId,
  TraceStep,
  TurnPolicy,
  VectorizeResult,
  VectorizeSettings,
} from '@trazor/core'
import type { ShapeOut, SvgShape } from '@trazor/svg'
import type { FlatRuns } from './flat'

/** Messages accepted by the vectorizer worker. */
export type WorkerInMessage =
  | {
      type: 'vectorize'
      id: number
      width: number
      height: number
      /** RGBA bytes, transferred. */
      buffer: ArrayBuffer
      settings: VectorizeSettings
      /** Optional edge-hint plane: Float32, `width`×`height`, transferred. */
      edgeHint?: ArrayBuffer
      /** Optional learned coverage-hint plane ([0,1]): Float32, `width`×`height`, transferred. */
      coverageHint?: ArrayBuffer
      /**
       * Stable per-image identity: the same working image keeps the same id
       * across setting tweaks, a new image gets a new one. Lets the worker reuse
       * cached preprocess/palette intermediates; absent disables that reuse.
       */
      imageId?: number
      /** Opt into recording every pipeline step, streamed back as `trace-step`. */
      trace?: boolean
      /** Attach the raw pre-serialization geometry to the result as `document`. */
      withDocument?: boolean
    }
  | { type: 'cancel'; id: number }
  /**
   * Hand the worker its helper workers, as one `MessagePort` per helper
   * (transferred). The worker builds a {@link HelperPool} from them and traces
   * in parallel from the next run on; sending an empty list returns it to the
   * sequential path. The other end of each port must run
   * {@link installHelperHandler}.
   */
  | { type: 'helpers'; ports: HelperEndpoint[] }

/** Messages emitted by the vectorizer worker. */
export type WorkerOutMessage =
  | { type: 'progress'; id: number; stage: StageId; overall: number }
  | { type: 'trace-step'; id: number; step: TraceStep }
  | { type: 'result'; id: number; result: VectorizeResult }
  | { type: 'error'; id: number; message: string; cancelled: boolean }

/** Minimal worker-global surface — keeps this package free of lib.webworker. */
export interface WorkerScope {
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}

/**
 * One end of the channel to a helper worker. A DOM `Worker`, a `MessagePort`
 * and a Node `worker_threads` `MessagePort` all satisfy it, so the same pool
 * drives helpers in a browser and in Node (a Node `worker_threads` `Worker` is
 * an `EventEmitter`, not an `EventTarget` — wrap it, or hand over a
 * `MessagePort` from a `MessageChannel`).
 */
export interface HelperEndpoint {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
}

// ---------------------------- helper protocol ----------------------------

/**
 * Curve settings a helper needs to fit geometry — {@link VectorizeSettings}'
 * curve slice, which is all that a re-fit depends on. The sub-pixel field is
 * not here: it travels with the cached state a job reads (the bw coverage
 * field, or the color field built from the cached working image).
 */
export interface HelperCurveOptions {
  curveMode: CurveMode
  smoothing: number
  curveOptimize: boolean
  optTolerance: number
  cornerThreshold: number
}

/** Serialization settings for the per-shape half of the SVG a helper produces. */
export interface HelperSerializeOptions {
  precision: number
  optimize: boolean
  roundPrimitives: boolean
}

/** An `SvgShape` without its geometry: the paint the coordinator assigns a unit. */
export type HelperShapeMeta = Omit<SvgShape, 'commands'>

/**
 * The working image, cached in the helper under `key` (the coordinator's image
 * id + preprocess settings slice). Cutout chain fitting derives its Oklab
 * buffer from it and caches that too.
 */
export interface HelperImageMessage {
  type: 'helper-image'
  key: string
  width: number
  height: number
  /** RGBA bytes, transferred. */
  buffer: ArrayBuffer
}

/**
 * The stacked-layering plan, cached under `key` (image id + palette slice +
 * ring slice). `stackLabels` is the label map painted for the base layers —
 * lifted island pixels already folded into their surround — and `order` is the
 * base layers' paint order (layer index ⇒ label). The island layers follow the
 * base layers, one per entry of `islandLabels`, each covering exactly the pixel
 * indices in its run of `islandPixels`. A helper rebuilds any layer's union
 * flood mask from this alone, so layers are independent units.
 */
export interface HelperStackMessage {
  type: 'helper-stack'
  key: string
  width: number
  height: number
  /** Label count of the map (the palette length). */
  labelCount: number
  /** Int32 label per pixel (-1 unlabeled), transferred. */
  stackLabels: ArrayBuffer
  /** Int32 base-layer paint order, transferred. */
  order: ArrayBuffer
  /** Int32 label of each island layer, transferred. */
  islandLabels: ArrayBuffer
  /** Int32 pixel indices of every island layer, concatenated, transferred. */
  islandPixels: ArrayBuffer
  /** Int32 run boundaries into `islandPixels` (`islandLabels` length + 1), transferred. */
  islandOffsets: ArrayBuffer
  turnPolicy: TurnPolicy
  /** Speck floor: boundaries enclosing fewer pixels are dropped. */
  minArea: number
}

/**
 * The bw mask's decomposed rings for one helper, cached under `key` (image id +
 * threshold slice + ring slice). Ring `units[k]` of the coordinator's
 * decomposition is the local ring `k`, its lattice points the run `k` of
 * `rings`.
 */
export interface HelperRingsMessage {
  type: 'helper-rings'
  key: string
  width: number
  height: number
  /** Int32 global ring index per local ring, ascending, transferred. */
  units: ArrayBuffer
  /** Lattice ring points (x, y interleaved), one run per local ring. */
  rings: FlatRuns
  /** Signed coverage field, Float32 `width`×`height`, transferred; absent in pixel mode. */
  coverage?: ArrayBuffer
}

/**
 * Boundary chains for one helper, cached under `key` (image id + palette
 * slice). Chain `units[k]` of the coordinator's network is the local chain `k`:
 * its lattice points, the labels on either side of forward travel, and whether
 * it closes on itself.
 */
export interface HelperChainsMessage {
  type: 'helper-chains'
  key: string
  width: number
  height: number
  /** Int32 global chain index per local chain, ascending, transferred. */
  units: ArrayBuffer
  /** Int32 label left of forward travel per local chain, transferred. */
  left: ArrayBuffer
  /** Int32 label right of forward travel per local chain, transferred. */
  right: ArrayBuffer
  /** Uint8 loop flag per local chain, transferred. */
  loop: ArrayBuffer
  /** Lattice chain points (x, y interleaved), one run per local chain. */
  points: FlatRuns
}

/**
 * A unit of parallel work:
 *
 * - `trace-layers` — stacked layering: build the layer's union flood mask from
 *   the cached plan, decompose it, curve-fit and serialize its shapes.
 * - `trace-rings` — one ring of the bw mask: run its polygon and curve stages.
 *   No serialization — a bw shape is an outer ring plus the holes under it, and
 *   one ink silhouette routinely holds most of the rings in the image, so the
 *   ring is the unit that balances; the coordinator concatenates each shape from
 *   its rings' fits.
 * - `fit-chains` — one boundary chain (cutout): fit it once, with the pinned
 *   junction endpoints both neighbors reuse. No serialization — the coordinator
 *   assembles the regions from the shared fits.
 */
export type HelperJobKind = 'trace-layers' | 'trace-rings' | 'fit-chains'

/** Dispatch a list of units to one helper. */
export interface HelperJobMessage {
  type: 'helper-job'
  id: number
  kind: HelperJobKind
  /** Global unit indices to process, ascending. */
  units: number[]
  /**
   * Key of the cached payload the units index into. A helper holds one payload
   * of each kind, so a second run's dispatch replaces what a still-running first
   * run reads; checking the key turns that into a clean error for the superseded
   * run instead of geometry traced from the wrong image.
   */
  stateKey: string
  curve: HelperCurveOptions
  /**
   * Units per reply. The helper answers in `helper-batch` messages of this many
   * units and yields its event loop once per batch, so a job of many small units
   * (bw shapes, cutout chains) is not one message and one event-loop turn each.
   */
  batch: number
  /** Paint per unit, index-parallel to `units`; only `trace-layers` serializes. */
  meta?: HelperShapeMeta[]
  /** Serialization settings; only `trace-layers` serializes. */
  serialize?: HelperSerializeOptions
  /**
   * `fit-chains`: per-label palette Oklab (interleaved [L, a, b]), transferred.
   * Present ⇒ refine each chain onto the sub-pixel color edge between its two
   * regions, using the Oklab buffer of the cached working image.
   */
  paletteOklab?: ArrayBuffer
  /** `fit-chains`: collapse circular Bézier runs to `A` arcs at this precision. */
  arcPrecision?: number
}

/** Abandon a running job; the helper stops at its next unit boundary. */
export interface HelperCancelMessage {
  type: 'helper-cancel'
  id: number
}

/** Messages accepted by a helper worker. */
export type HelperInMessage =
  | HelperImageMessage
  | HelperStackMessage
  | HelperRingsMessage
  | HelperChainsMessage
  | HelperJobMessage
  | HelperCancelMessage

/** Messages emitted by a helper worker. */
export type HelperOutMessage =
  | {
      type: 'helper-batch'
      id: number
      /** Global unit indices in this reply, ascending. */
      units: number[]
      /** Command runs each unit contributed, index-parallel to `units`. */
      counts: number[]
      /**
       * Encoded commands: one run per shape for `trace-layers`, one per ring for
       * `trace-rings`, and per chain fit for `fit-chains` (the open run, then the
       * closed ring when the chain closes on its own start corner). Runs are in
       * `units` order.
       */
      commands: FlatRuns
      /** Serialized shapes, index-parallel to the command runs; only `trace-layers`. */
      svg?: (ShapeOut | null)[]
    }
  | { type: 'helper-done'; id: number }
  | { type: 'helper-error'; id: number; message: string }
