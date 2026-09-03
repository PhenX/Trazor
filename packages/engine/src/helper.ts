import type { BinaryMask, GrayImage, PathCommand, RasterImage } from '@trazor/core'
import { toOklabBuffer } from '@trazor/raster'
import {
  decomposeMask,
  fitChain,
  polygonToCommands,
  ringPolygon,
  shapesFromPaths,
} from '@trazor/trace'
import type {
  BoundaryChain,
  ChainNetwork,
  CrackPath,
  FlatPoints,
  TraceCurveOptions,
  TraceCutoutOptions,
} from '@trazor/trace'
import { fitArcs, shapeOut } from '@trazor/svg'
import type { ShapeOut } from '@trazor/svg'
import { flatTransferables, packCommands, runAt, runCount } from './flat'
import type {
  HelperChainsMessage,
  HelperCurveOptions,
  HelperImageMessage,
  HelperInMessage,
  HelperJobMessage,
  HelperOutMessage,
  HelperRingsMessage,
  HelperStackMessage,
  WorkerScope,
} from './protocol'

/** The working image plus the Oklab buffer cutout chain fitting reads from it. */
interface ImageState {
  image: RasterImage
  oklab?: Float32Array
}

/**
 * The stacked plan, its derived pixel buckets, the scratch buffers the layer
 * floods reuse, and the layers decomposed so far.
 */
interface StackState {
  msg: HelperStackMessage
  labels: Int32Array
  order: Int32Array
  /** Paint position of each label among the base layers (-1 = none). */
  position: Int32Array
  /** Pixel indices bucketed by label: label `l` owns `bucket[offset[l]..offset[l+1]]`. */
  offset: Int32Array
  bucket: Int32Array
  islandLabels: Int32Array
  islandPixels: Int32Array
  islandOffsets: Int32Array
  /** Running union membership (1 = still stacked) and the layer it stands for. */
  union: Uint8Array
  unionLayer: number
  mask: BinaryMask
  flood: Int32Array
  /** Per layer index: its decomposed rings and their adjusted polygons. */
  layers: Map<number, { paths: CrackPath[]; polygons?: (FlatPoints | null)[] }>
}

/** The bw mask's rings, with each one's adjusted polygon once built. */
interface RingState {
  msg: HelperRingsMessage
  /** Global ring index ⇒ local ring index. */
  local: Map<number, number>
  coverage?: GrayImage
  /** Local ring index ⇒ its adjusted polygon (`null` for a ring too short). */
  polygons: (FlatPoints | null | undefined)[]
}

/** One helper's share of the boundary chain network (cutout). */
interface ChainState {
  key: string
  network: ChainNetwork
  /** Global chain index ⇒ local chain index. */
  local: Map<number, number>
}

/**
 * Wire a helper worker to its scope. A helper is a stateful engine instance: it
 * receives the working image, the stacked plan, the bw rings or its share of
 * the cutout chain network once per key, keeps its own ring/polygon caches so a
 * warm curve tweak re-fits without re-decomposing, and answers `helper-job`
 * messages a batch of units at a time.
 *
 * The job loop yields to the event loop between batches, so a `helper-cancel`
 * interleaves with a running job exactly as `cancel` does in the coordinator,
 * and the coordinator can place results as they arrive. It holds one payload of
 * each kind, so every batch re-checks that the job's `stateKey` still names what
 * the helper is holding: a run superseded by a newer one stops rather than
 * tracing from another image's geometry.
 */
export function installHelperHandler(scope: WorkerScope): void {
  let imageState: ImageState | null = null
  let stackState: StackState | null = null
  let ringState: RingState | null = null
  let chainState: ChainState | null = null
  const cancelled = new Set<number>()

  const post = (msg: HelperOutMessage, transfer?: Transferable[]): void =>
    scope.postMessage(msg, transfer)

  scope.addEventListener('message', (ev) => {
    const msg = ev.data as HelperInMessage
    switch (msg.type) {
      case 'helper-image':
        imageState = takeImage(msg)
        return
      case 'helper-stack':
        stackState = takeStack(msg)
        return
      case 'helper-rings':
        ringState = takeRings(msg)
        return
      case 'helper-chains':
        chainState = takeChains(msg)
        return
      case 'helper-cancel':
        cancelled.add(msg.id)
        return
      case 'helper-job':
        void runJob(msg)
        return
    }
  })

  async function runJob(job: HelperJobMessage): Promise<void> {
    const size = Math.max(1, job.batch)
    const serialize = job.kind !== 'fit-chains' && job.serialize !== undefined
    try {
      // The option objects are the same for every unit of the job — a chain job
      // has hundreds of units, so they are built once, not per unit.
      const opts = jobOptions(job)
      checkState(job)
      for (let at = 0; at < job.units.length && !cancelled.has(job.id); at += size) {
        const units: number[] = []
        const counts: number[] = []
        const runs: PathCommand[][] = []
        const svg: (ShapeOut | null)[] | undefined = serialize ? [] : undefined
        for (let i = at; i < Math.min(at + size, job.units.length); i++) {
          const unit = job.units[i]
          const out = traceUnit(job, opts, unit, i)
          checkState(job)
          units.push(unit)
          counts.push(out.shapes.length)
          for (const commands of out.shapes) runs.push(commands)
          if (svg && out.svg) svg.push(...out.svg)
        }
        const commands = packCommands(runs)
        post(
          { type: 'helper-batch', id: job.id, units, counts, commands, svg },
          flatTransferables(commands),
        )
        // Yields the helper's event loop once per batch, so a cancel message can
        // land mid-job and the coordinator can place results as they arrive.
        // oxlint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      post({ type: 'helper-done', id: job.id })
    } catch (err) {
      post({
        type: 'helper-error',
        id: job.id,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      cancelled.delete(job.id)
    }
  }

  /**
   * Fail loudly if the payload the job's units index into has been replaced by a
   * newer run's — one helper holds one payload of each kind, so a superseded run
   * must stop rather than trace from the wrong image.
   */
  function checkState(job: HelperJobMessage): void {
    const held =
      job.kind === 'trace-layers'
        ? stackState?.msg.key
        : job.kind === 'trace-rings'
          ? ringState?.msg.key
          : chainState?.key
    if (held !== job.stateKey) {
      throw new Error(`helper: ${job.kind} payload ${job.stateKey} was replaced`)
    }
  }

  /** The option objects every unit of one job shares. */
  function jobOptions(job: HelperJobMessage): JobOptions {
    if (job.kind === 'fit-chains') {
      const paletteOklab = job.paletteOklab ? new Float32Array(job.paletteOklab) : undefined
      const arcPrecision = job.arcPrecision
      return {
        cutout: {
          ...curveOptions(job.curve),
          colorField: paletteOklab ? { oklab: oklabBuffer(), paletteOklab } : undefined,
          refineChain:
            arcPrecision === undefined ? undefined : (cmds) => fitArcs(cmds, arcPrecision),
        },
      }
    }
    return { curve: curveOptions(job.curve, job.kind === 'trace-rings' ? coverage() : undefined) }
  }

  /** One unit's shapes: their commands and, unless fitting only, their SVG form. */
  function traceUnit(
    job: HelperJobMessage,
    opts: JobOptions,
    unit: number,
    at: number,
  ): { shapes: PathCommand[][]; svg?: (ShapeOut | null)[] } {
    if (opts.cutout) {
      return { shapes: fitOneChain(opts.cutout, unit) }
    }
    const curve = opts.curve
    if (!curve) throw new Error(`helper: no curve options for ${job.kind}`)
    const shapes =
      job.kind === 'trace-layers' ? traceLayer(curve, unit) : traceRingUnit(curve, unit)
    const out = job.serialize
    if (!out) return { shapes }
    const meta = job.meta?.[at] ?? {}
    const svg = shapes.map((commands) =>
      shapeOut({ ...meta, commands }, out.precision, out.optimize, out.roundPrimitives),
    )
    return { shapes, svg }
  }

  /** Stacked layer `unit`: union flood mask → rings → curve chain. */
  function traceLayer(curve: TraceCurveOptions, unit: number): PathCommand[][] {
    const st = stackState
    if (!st) throw new Error('helper: no stacked plan for trace-layers')
    let entry = st.layers.get(unit)
    if (!entry) {
      entry = { paths: decomposeLayer(st, unit) }
      st.layers.set(unit, entry)
    }
    const wantPolygons = curve.curveMode !== 'pixel'
    if (wantPolygons && !entry.polygons) {
      entry.polygons = entry.paths.map((p) => ringPolygon(p.points))
    }
    const traced = shapesFromPaths(entry.paths, curve, wantPolygons ? entry.polygons : undefined)
    return traced.map((s) => s.commands)
  }

  /** One bw ring: its polygon stages (cached) followed by its curve stages. */
  function traceRingUnit(curve: TraceCurveOptions, unit: number): PathCommand[][] {
    const st = ringState
    if (!st) throw new Error('helper: no rings for trace-rings')
    const local = st.local.get(unit)
    if (local === undefined) throw new Error(`helper: ring ${unit} not held`)
    let polygon: FlatPoints | null = null
    if (curve.curveMode !== 'pixel') {
      const held = st.polygons[local]
      polygon = held === undefined ? ringPolygon(runAt(st.msg.rings, local), st.coverage) : held
      st.polygons[local] = polygon
    }
    // The lattice ring is read only where there is no polygon to fit (pixel
    // mode, or a ring too short to carry one), so decoding it stays lazy.
    const points = polygon === null ? runAt(st.msg.rings, local) : []
    return [polygonToCommands(points, polygon, curve)]
  }

  /**
   * One cutout chain, fitted once with its junction endpoints pinned: the open
   * run first, then — for a chain that closes on its own start corner — the
   * complete closed ring.
   */
  function fitOneChain(opts: TraceCutoutOptions, unit: number): PathCommand[][] {
    const st = chainState
    if (!st) throw new Error('helper: no chains for fit-chains')
    const local = st.local.get(unit)
    if (local === undefined) throw new Error(`helper: chain ${unit} not held`)
    const fit = fitChain(st.network, local, opts)
    return fit.closed ? [fit.open, fit.closed] : [fit.open]
  }

  /** The cached working image's Oklab buffer, built once. */
  function oklabBuffer(): Float32Array {
    const st = imageState
    if (!st) throw new Error('helper: no working image')
    return (st.oklab ??= toOklabBuffer(st.image))
  }

  /** The cached bw coverage field, if this helper was given one. */
  function coverage(): GrayImage | undefined {
    return ringState?.coverage
  }

  /**
   * Rings of one stacked layer. A base layer's mask is the union components its
   * own color reaches: the union for layer `i` is every labeled pixel whose
   * label paints at position `i` or above, flooded 4-connected from the layer's
   * own pixels. An island layer's mask is exactly its own pixels.
   */
  function decomposeLayer(st: StackState, layer: number): CrackPath[] {
    const { width, height, turnPolicy } = st.msg
    const floor = Math.max(1, st.msg.minArea)
    const cut = st.mask.data
    cut.fill(0)

    if (layer >= st.order.length) {
      const island = layer - st.order.length
      for (let k = st.islandOffsets[island]; k < st.islandOffsets[island + 1]; k++) {
        cut[st.islandPixels[k]] = 1
      }
      return decomposeMask(st.mask, turnPolicy, floor)
    }

    advanceUnion(st, layer)
    const label = st.order[layer]
    const union = st.union
    const flood = st.flood
    const nPix = width * height
    let sp = 0
    for (let k = st.offset[label]; k < st.offset[label + 1]; k++) {
      const p = st.bucket[k]
      if (cut[p] === 0) {
        cut[p] = 1
        flood[sp++] = p
      }
    }
    while (sp > 0) {
      const p = flood[--sp]
      const x = p - ((p / width) | 0) * width
      if (x > 0 && union[p - 1] === 1 && cut[p - 1] === 0) {
        cut[p - 1] = 1
        flood[sp++] = p - 1
      }
      if (x < width - 1 && union[p + 1] === 1 && cut[p + 1] === 0) {
        cut[p + 1] = 1
        flood[sp++] = p + 1
      }
      if (p >= width && union[p - width] === 1 && cut[p - width] === 0) {
        cut[p - width] = 1
        flood[sp++] = p - width
      }
      if (p < nPix - width && union[p + width] === 1 && cut[p + width] === 0) {
        cut[p + width] = 1
        flood[sp++] = p + width
      }
    }
    return decomposeMask(st.mask, turnPolicy, floor)
  }
}

/**
 * Bring the running union up to `layer`: peel the labels that paint below it,
 * one bucket each, so a helper walking its layers in ascending order pays O(n)
 * in total rather than O(layers · n). A layer below the current one rebuilds.
 */
function advanceUnion(st: StackState, layer: number): void {
  if (layer < st.unionLayer) {
    for (let p = 0; p < st.labels.length; p++) {
      const l = st.labels[p]
      st.union[p] = l >= 0 && st.position[l] >= layer ? 1 : 0
    }
    st.unionLayer = layer
    return
  }
  for (let i = st.unionLayer; i < layer; i++) {
    const label = st.order[i]
    for (let k = st.offset[label]; k < st.offset[label + 1]; k++) st.union[st.bucket[k]] = 0
  }
  st.unionLayer = layer
}

/** Options shared by every unit of one job: `cutout` for chain fitting, else `curve`. */
interface JobOptions {
  curve?: TraceCurveOptions
  cutout?: TraceCutoutOptions
}

/** Curve settings as the tracer's own option shape, with an optional sub-pixel field. */
function curveOptions(curve: HelperCurveOptions, coverage?: GrayImage): TraceCurveOptions {
  return { ...curve, coverage }
}

function takeImage(msg: HelperImageMessage): ImageState {
  return {
    image: { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) },
  }
}

function takeStack(msg: HelperStackMessage): StackState {
  const labels = new Int32Array(msg.stackLabels)
  const order = new Int32Array(msg.order)
  const position = new Int32Array(msg.labelCount).fill(-1)
  for (let i = 0; i < order.length; i++) position[order[i]] = i
  // Pixel indices bucketed by label in one O(n) pass, so each layer's flood
  // seeds from its own pixels (and each peel drops one label) without a rescan.
  const counts = new Uint32Array(msg.labelCount)
  const union = new Uint8Array(labels.length)
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p]
    if (l >= 0) {
      counts[l]++
      union[p] = 1
    }
  }
  const offset = new Int32Array(msg.labelCount + 1)
  for (let l = 0; l < msg.labelCount; l++) offset[l + 1] = offset[l] + counts[l]
  const bucket = new Int32Array(offset[msg.labelCount])
  const cursor = offset.slice(0, msg.labelCount)
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p]
    if (l >= 0) bucket[cursor[l]++] = p
  }
  return {
    msg,
    labels,
    order,
    position,
    offset,
    bucket,
    islandLabels: new Int32Array(msg.islandLabels),
    islandPixels: new Int32Array(msg.islandPixels),
    islandOffsets: new Int32Array(msg.islandOffsets),
    union,
    unionLayer: 0,
    mask: { width: msg.width, height: msg.height, data: new Uint8Array(labels.length) },
    flood: new Int32Array(labels.length),
    layers: new Map(),
  }
}

function takeRings(msg: HelperRingsMessage): RingState {
  const units = new Int32Array(msg.units)
  if (units.length !== runCount(msg.rings)) throw new Error('helper: ring count mismatch')
  const local = new Map<number, number>()
  for (let i = 0; i < units.length; i++) local.set(units[i], i)
  return {
    msg,
    local,
    coverage: msg.coverage
      ? { width: msg.width, height: msg.height, data: new Float32Array(msg.coverage) }
      : undefined,
    polygons: new Array(units.length),
  }
}

function takeChains(msg: HelperChainsMessage): ChainState {
  const units = new Int32Array(msg.units)
  const left = new Int32Array(msg.left)
  const right = new Int32Array(msg.right)
  const loop = new Uint8Array(msg.loop)
  if (units.length !== runCount(msg.points)) throw new Error('helper: chain count mismatch')
  const local = new Map<number, number>()
  const chains: BoundaryChain[] = []
  for (let i = 0; i < units.length; i++) {
    local.set(units[i], i)
    chains.push({
      points: runAt(msg.points, i),
      left: left[i],
      right: right[i],
      loop: loop[i] !== 0,
      // Fitting reads the points and the two side labels only; the step
      // directions and the shoelace sum drive the coordinator's ring assembly.
      firstDir: 0,
      lastDir: 0,
      shoelace: 0,
    })
  }
  return {
    key: msg.key,
    network: { width: msg.width, height: msg.height, chains, areas: new Map() },
    local,
  }
}
