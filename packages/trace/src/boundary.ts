import type { LabelMap, PathCommand } from '@trazor/core'
import type { TraceCurveOptions } from './closed'
import { closedPathToCommands } from './closed'
import { adjustVertices } from './potrace/adjust'
import { assemblePieces } from './potrace/opticurve'
import { optimalPolyline } from './potrace/polyfit'
import { smoothOpen } from './potrace/smooth'
import { computeSums } from './potrace/sums'
import type { FlatPoints } from './paths'
import { reverseCommands } from './paths'
import { pairwiseField, refineRingToField } from './refine'
import type { SignedField } from './refine'

/**
 * Per-pixel Oklab buffer (interleaved [L, a, b], matching the label map's
 * dimensions) plus per-label palette Oklab (interleaved, indexed by label). When
 * present, each shared boundary chain is refined onto the sub-pixel color edge
 * between its two regions — the anti-aliased boundary position, not the pixel
 * staircase. The chain is fitted once and reused by both neighbors, so the
 * seam-free guarantee is preserved; junction endpoints stay pinned.
 */
export interface ColorField {
  oklab: Float32Array
  paletteOklab: Float32Array
}

export interface TraceCutoutOptions extends TraceCurveOptions {
  colorField?: ColorField
  /**
   * Optional post-fit transform applied to each shared boundary chain ONCE
   * (e.g. arc fitting). Because the reverse instance is derived from the same
   * fitted commands, both neighbours inherit an identical transform, so the
   * seam-free guarantee is preserved. Must keep the chain's terminal endpoints
   * (junction corners) exactly, or adjacent chains would no longer meet.
   */
  refineChain?: (commands: PathCommand[]) => PathCommand[]
}

export interface RegionShape {
  label: number
  /** All boundary rings of the region (outer + holes), evenodd semantics. */
  commands: PathCommand[]
  /** Pixel count of the region. */
  area: number
  holeCount: number
}

/**
 * One walked edge of the label map's boundary network: junction → junction, or
 * a pure loop. Lattice `points` are integer pixel corners; `left`/`right` are
 * the labels on either side of forward travel (`-1` outside the image or on an
 * unlabeled pixel).
 */
export interface BoundaryChain {
  points: FlatPoints
  left: number
  right: number
  loop: boolean
  /** First/last step direction when traveling forward (0 = +x, 1 = +y, 2 = −x, 3 = −y). */
  firstDir: number
  lastDir: number
  /** Open shoelace sum Σ (x_i·y_{i+1} − x_{i+1}·y_i) along forward travel. */
  shoelace: number
}

/**
 * One chain's fitted geometry. `open` is the forward run WITHOUT a leading M,
 * starting at the chain's first point — the form a ring splices in as it passes
 * through. A chain that returns to its own start corner also carries `closed`,
 * the complete closed ring (M…Z) that a region uses when the chain is the whole
 * ring; reached instead as a continuation of a larger ring, that same chain
 * contributes its `open` run.
 */
export interface ChainFit {
  open: PathCommand[]
  closed?: PathCommand[]
}

/**
 * The label map's complete boundary network: every crack walked exactly once
 * into chains, plus each label's pixel count. Plain data — a chain can be
 * fitted anywhere ({@link fitChain}) and the regions assembled from the fits
 * ({@link assembleRegions}).
 */
export interface ChainNetwork {
  width: number
  height: number
  chains: BoundaryChain[]
  /** Pixel count per label, for `RegionShape.area`. */
  areas: Map<number, number>
}

// Directions: 0 = +x, 1 = +y, 2 = −x, 3 = −y (screen y-down, clockwise order).
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

/**
 * Seam-free partition tracing. The label map's boundary network is walked once
 * into chains (junction → junction, or pure loops), each chain is fitted ONCE
 * with pinned junction endpoints, and every region assembles its rings from
 * the same fitted chains (reversed where needed) — adjacent regions therefore
 * share mathematically identical boundaries: no gaps, no overlaps.
 */
export function traceLabelMap(labels: LabelMap, opts: TraceCutoutOptions): RegionShape[] {
  const network = extractChains(labels)
  return assembleRegions(network, fitChains(network, opts))
}

/**
 * Walk the label map's crack network into chains (Selinger-style crack
 * boundaries between differing labels): a chain runs junction → junction, or
 * closes on itself as a pure loop. Depends on the label map alone, so a caller
 * may extract once and re-fit many times through {@link fitChain}.
 */
export function extractChains(labels: LabelMap): ChainNetwork {
  const { width: w, height: h, data } = labels
  const labelAt = (x: number, y: number): number =>
    x >= 0 && x < w && y >= 0 && y < h ? data[y * w + x] : -1

  // ---- crack presence ----
  const cw = w + 1
  const hCrack = new Uint8Array(w * (h + 1)) // H(x,y): corner (x,y)→(x+1,y), x in [0,w)
  const vCrack = new Uint8Array(cw * h) // V(x,y): corner (x,y)→(x,y+1), y in [0,h)
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      if (labelAt(x, y - 1) !== labelAt(x, y)) hCrack[y * w + x] = 1
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      if (labelAt(x - 1, y) !== labelAt(x, y)) vCrack[y * cw + x] = 1
    }
  }

  // Crack leaving corner (x,y) in direction d (1 = present, 0 = absent/out of range).
  const crackAt = (x: number, y: number, d: number): number => {
    switch (d) {
      case 0:
        return x < w ? hCrack[y * w + x] : 0
      case 1:
        return y < h ? vCrack[y * cw + x] : 0
      case 2:
        return x > 0 ? hCrack[y * w + (x - 1)] : 0
      default:
        return y > 0 ? vCrack[(y - 1) * cw + x] : 0
    }
  }
  // Count PRESENT cracks (visited or not), never the marker value: visitCrack
  // stamps a walked crack as 2, so summing crackAt directly would inflate a
  // plain degree-2 corner to 3 once one side is walked — a phantom junction that
  // shatters the rest of the seam into unsmoothable single-edge chains.
  const degree = (x: number, y: number): number =>
    (crackAt(x, y, 0) !== 0 ? 1 : 0) +
    (crackAt(x, y, 1) !== 0 ? 1 : 0) +
    (crackAt(x, y, 2) !== 0 ? 1 : 0) +
    (crackAt(x, y, 3) !== 0 ? 1 : 0)

  const visitCrack = (x: number, y: number, d: number): void => {
    // Mark the undirected crack (canonicalize direction 2→0, 3→1).
    if (d === 0) hCrack[y * w + x] = 2
    else if (d === 1) vCrack[y * cw + x] = 2
    else if (d === 2) hCrack[y * w + (x - 1)] = 2
    else vCrack[(y - 1) * cw + x] = 2
  }
  const crackUnvisited = (x: number, y: number, d: number): boolean => {
    if (d === 0) return x < w && hCrack[y * w + x] === 1
    if (d === 1) return y < h && vCrack[y * cw + x] === 1
    if (d === 2) return x > 0 && hCrack[y * w + (x - 1)] === 1
    return y > 0 && vCrack[(y - 1) * cw + x] === 1
  }

  // Labels left/right of travel from corner (x,y) toward direction d.
  const sideLabels = (x: number, y: number, d: number): [number, number] => {
    switch (d) {
      case 0:
        return [labelAt(x, y - 1), labelAt(x, y)]
      case 1:
        return [labelAt(x, y), labelAt(x - 1, y)]
      case 2:
        return [labelAt(x - 1, y), labelAt(x - 1, y - 1)]
      default:
        return [labelAt(x - 1, y - 1), labelAt(x, y - 1)]
    }
  }

  // ---- chain extraction ----
  const chains: BoundaryChain[] = []

  const walkChain = (sx: number, sy: number, sd: number, stopAtJunction: boolean): void => {
    const [left, right] = sideLabels(sx, sy, sd)
    const points: FlatPoints = [sx, sy]
    let shoelace = 0
    let x = sx
    let y = sy
    let d = sd
    const firstDir = sd
    for (;;) {
      visitCrack(x, y, d)
      const nx = x + DX[d]
      const ny = y + DY[d]
      shoelace += x * ny - nx * y
      points.push(nx, ny)
      x = nx
      y = ny
      if (x === sx && y === sy) break // closed loop
      if (stopAtJunction && degree(x, y) >= 3) break
      // Degree-2 continuation: the unique other crack at this corner.
      let next = -1
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue
        if (crackAt(x, y, nd) !== 0 && crackUnvisited(x, y, nd)) {
          next = nd
          break
        }
      }
      if (next === -1) break // dead end (shouldn't happen on closed boundaries)
      d = next
    }
    chains.push({
      points,
      left,
      right,
      loop: x === sx && y === sy && points.length > 2,
      firstDir,
      lastDir: d,
      shoelace,
    })
  }

  // Junction-to-junction chains first.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (degree(x, y) >= 3) {
        for (let d = 0; d < 4; d++) {
          if (crackUnvisited(x, y, d)) walkChain(x, y, d, true)
        }
      }
    }
  }
  // Remaining cracks are pure loops.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (let d = 0; d < 2; d++) {
        if (crackUnvisited(x, y, d)) walkChain(x, y, d, false)
      }
    }
  }

  // ---- region pixel counts ----
  const areas = new Map<number, number>()
  for (let i = 0; i < data.length; i++) {
    const l = data[i]
    if (l >= 0) areas.set(l, (areas.get(l) ?? 0) + 1)
  }

  return { width: w, height: h, chains, areas }
}

/**
 * Fit one chain of the network under the curve settings. Junction endpoints are
 * exact lattice corners, so the two regions that share the chain still meet;
 * every chain is independent, so a caller may fit them in any order or in
 * parallel, and both neighbors reuse the one fit (reversed on the assembly
 * side) — which is what makes the partition seam-free.
 */
export function fitChain(network: ChainNetwork, index: number, opts: TraceCutoutOptions): ChainFit {
  const chain = network.chains[index]
  const field = chainField(network, chain, opts)
  const open = withRefine(fitOpenChain(chain.points, opts, field), chain, opts)
  if (!chain.loop) return { open }
  const loop = fitLoop(chain.points, opts, field)
  return { open, closed: opts.refineChain ? opts.refineChain(loop) : loop }
}

/** Fit every chain of the network, parallel to `network.chains`. */
export function fitChains(network: ChainNetwork, opts: TraceCutoutOptions): ChainFit[] {
  const fits: ChainFit[] = new Array(network.chains.length)
  for (let i = 0; i < network.chains.length; i++) fits[i] = fitChain(network, i, opts)
  return fits
}

/**
 * Apply the chain refinement (arc fitting) once, with the leading M so an arc
 * knows its start point, then strip the M back off. Both instances share this
 * fit, so the reverse inherits the identical (reversed) transform — the seam
 * stays exact.
 */
function withRefine(
  open: PathCommand[],
  chain: BoundaryChain,
  opts: TraceCutoutOptions,
): PathCommand[] {
  if (!opts.refineChain) return open
  const sx = chain.points[0]
  const sy = chain.points[1]
  return stripM(opts.refineChain([{ type: 'M', x: sx, y: sy }, ...open]))
}

/**
 * Assemble the regions of a partition from the fitted chains: each region walks
 * the chain instances around every one of its rings, reusing the identical fit
 * (reversed for the left-hand instance). `fits` must be parallel to
 * `network.chains` — the output of {@link fitChain} per index.
 */
export function assembleRegions(network: ChainNetwork, fits: readonly ChainFit[]): RegionShape[] {
  const { chains, areas } = network
  const cw = network.width + 1
  // Reversed fit per chain, built on first use and shared by every ring that
  // travels the chain backwards.
  const reversed: (PathCommand[] | null)[] = new Array(chains.length).fill(null)

  /** The whole closed ring of a chain that is a region's entire ring. */
  const ringCommandsOf = (inst: Instance): PathCommand[] => {
    const i = inst.chain
    const closed = fits[i].closed as PathCommand[]
    if (inst.forward) return closed
    return (reversed[i] ??= reverseCommands(closed))
  }

  /** The open run of a chain the ring passes through. */
  const runCommandsOf = (inst: Instance): PathCommand[] => {
    const i = inst.chain
    if (inst.forward) return fits[i].open
    return (reversed[i] ??= stripM(
      reverseCommands([
        { type: 'M', x: chains[i].points[0], y: chains[i].points[1] },
        ...fits[i].open,
      ]),
    ))
  }

  // ---- per-region instance index ----
  const regionInstances = new Map<number, Map<number, Instance[]>>()
  const cornerKey = (x: number, y: number): number => y * cw + x
  const addInstance = (label: number, inst: Instance): void => {
    if (label < 0) return
    const p = chains[inst.chain].points
    const sx = inst.forward ? p[0] : p[p.length - 2]
    const sy = inst.forward ? p[1] : p[p.length - 1]
    let byCorner = regionInstances.get(label)
    if (!byCorner) {
      byCorner = new Map()
      regionInstances.set(label, byCorner)
    }
    const key = cornerKey(sx, sy)
    let list = byCorner.get(key)
    if (!list) {
      list = []
      byCorner.set(key, list)
    }
    list.push(inst)
  }
  for (let i = 0; i < chains.length; i++) {
    addInstance(chains[i].right, { chain: i, forward: true, used: false })
    addInstance(chains[i].left, { chain: i, forward: false, used: false })
  }

  const shapes: RegionShape[] = []
  for (const [label, byCorner] of regionInstances) {
    const commands: PathCommand[] = []
    let holeCount = 0
    for (const list of byCorner.values()) {
      for (const start of list) {
        if (start.used) continue
        const startChain = chains[start.chain]

        if (startChain.loop) {
          // The chain closes on its own start corner, so its fitted commands are
          // already this region's complete ring.
          start.used = true
          const area = (start.forward ? startChain.shoelace : -startChain.shoelace) / 2
          if (area < 0) holeCount++
          commands.push(...ringCommandsOf(start))
          continue
        }

        // Follow chain instances until the cycle returns to the start instance.
        let ringArea = 0
        const ringCmds: PathCommand[] = []
        const p = startChain.points
        const sx = start.forward ? p[0] : p[p.length - 2]
        const sy = start.forward ? p[1] : p[p.length - 1]
        ringCmds.push({ type: 'M', x: sx, y: sy })
        let inst = start
        for (;;) {
          inst.used = true
          const c = chains[inst.chain]
          ringArea += inst.forward ? c.shoelace : -c.shoelace
          ringCmds.push(...runCommandsOf(inst))
          const [ex, ey] = instEnd(chains, inst)
          const nextList = byCorner.get(cornerKey(ex, ey))
          const next = pickContinuation(chains, nextList, instLastDir(chains, inst), start)
          if (!next || next === start) break
          inst = next
        }
        ringCmds.push({ type: 'Z' })
        if (ringArea / 2 < 0) holeCount++
        commands.push(...ringCmds)
      }
    }
    if (commands.length > 0) {
      shapes.push({ label, commands, area: areas.get(label) ?? 0, holeCount })
    }
  }
  return shapes
}

/** Sub-pixel color-boundary field for a chain, from its two region colors. */
function chainField(
  network: ChainNetwork,
  chain: BoundaryChain,
  opts: TraceCutoutOptions,
): SignedField | undefined {
  const cf = opts.colorField
  if (!cf || chain.left < 0 || chain.right < 0) return undefined
  const li = chain.left * 3
  const ri = chain.right * 3
  return pairwiseField(
    cf.oklab,
    network.width,
    network.height,
    [cf.paletteOklab[li], cf.paletteOklab[li + 1], cf.paletteOklab[li + 2]],
    [cf.paletteOklab[ri], cf.paletteOklab[ri + 1], cf.paletteOklab[ri + 2]],
  )
}

/** One directed traversal of a chain by one of the two regions that share it. */
interface Instance {
  /** Index into `ChainNetwork.chains`. */
  chain: number
  forward: boolean
  used: boolean
}

function pickContinuation(
  chains: readonly BoundaryChain[],
  list: Instance[] | undefined,
  incoming: number,
  start: Instance,
): Instance | null {
  if (!list) return null
  // Prefer the sharpest right turn: right, straight, left, u-turn. The start
  // instance stays eligible (though marked used) — reaching it closes the ring.
  for (const turn of [1, 0, 3, 2]) {
    const want = (incoming + turn) % 4
    for (const inst of list) {
      if ((inst === start || !inst.used) && instFirstDir(chains, inst) === want) return inst
    }
  }
  return null
}

function instFirstDir(chains: readonly BoundaryChain[], inst: Instance): number {
  const c = chains[inst.chain]
  return inst.forward ? c.firstDir : (c.lastDir + 2) % 4
}

function instLastDir(chains: readonly BoundaryChain[], inst: Instance): number {
  const c = chains[inst.chain]
  return inst.forward ? c.lastDir : (c.firstDir + 2) % 4
}

function instEnd(chains: readonly BoundaryChain[], inst: Instance): [number, number] {
  const p = chains[inst.chain].points
  return inst.forward ? [p[p.length - 2], p[p.length - 1]] : [p[0], p[1]]
}

function stripM(commands: PathCommand[]): PathCommand[] {
  return commands.filter((c) => c.type !== 'M' && c.type !== 'Z')
}

/** Closed loop chain: rotate to a corner, then run the full closed chain. */
function fitLoop(points: FlatPoints, opts: TraceCurveOptions, field?: SignedField): PathCommand[] {
  // points[last] === points[0]; drop the duplicate for ring form.
  const ring = points.slice(0, points.length - 2)
  const n = ring.length >> 1
  let start = 0
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n
    const next = (i + 1) % n
    const dx1 = ring[i * 2] - ring[prev * 2]
    const dy1 = ring[i * 2 + 1] - ring[prev * 2 + 1]
    const dx2 = ring[next * 2] - ring[i * 2]
    const dy2 = ring[next * 2 + 1] - ring[i * 2 + 1]
    if (dx1 * dy2 - dy1 * dx2 !== 0) {
      start = i
      break
    }
  }
  const rotated: FlatPoints = new Array(ring.length)
  for (let i = 0; i < n; i++) {
    const src = (start + i) % n
    rotated[i * 2] = ring[src * 2]
    rotated[i * 2 + 1] = ring[src * 2 + 1]
  }
  return closedPathToCommands(rotated, opts, field)
}

/**
 * Open chain fitting with pinned endpoints (junction corners are exact and
 * shared, so adjacent regions connect perfectly). Returns commands WITHOUT the
 * leading M, starting from the chain's first point.
 */
function fitOpenChain(
  points: FlatPoints,
  opts: TraceCurveOptions,
  field?: SignedField,
): PathCommand[] {
  const n = points.length >> 1
  if (n < 2) return []
  if (opts.curveMode === 'pixel') {
    return openPixelCommands(points)
  }

  // The optimal polygon needs the integer lattice (unit-step straightness);
  // sub-pixel refinement then feeds only the sums + vertex adjustment. Junction
  // endpoints stay exactly on the lattice so adjacent chains still connect.
  const vertexIdx = optimalPolyline(points)
  let geom = points
  if (field) {
    geom = refineRingToField(points, field)
    const last = geom.length
    geom[0] = points[0]
    geom[1] = points[1]
    geom[last - 2] = points[last - 2]
    geom[last - 1] = points[last - 1]
  }
  const sums = computeSums(geom)
  const adjusted = adjustVertices(geom, sums, vertexIdx, false)
  const m = adjusted.length >> 1

  if (opts.curveMode === 'polygon' || m <= 2) {
    const out: PathCommand[] = []
    for (let i = 1; i < m; i++) {
      out.push({ type: 'L', x: adjusted[i * 2], y: adjusted[i * 2 + 1] })
    }
    return out
  }

  const alphamax = (opts.smoothing * 4) / 3
  const pieces = smoothOpen(adjusted, alphamax, opts.cornerThreshold)
  const out: PathCommand[] = []
  const mid0x = (adjusted[0] + adjusted[2]) / 2
  const mid0y = (adjusted[1] + adjusted[3]) / 2
  out.push({ type: 'L', x: mid0x, y: mid0y })
  out.push(...assemblePieces(mid0x, mid0y, pieces, opts.curveOptimize, opts.optTolerance))
  out.push({ type: 'L', x: adjusted[(m - 1) * 2], y: adjusted[(m - 1) * 2 + 1] })
  return out
}

/** Rectilinear open chain: direction-change lattice points only. */
function openPixelCommands(points: FlatPoints): PathCommand[] {
  const n = points.length >> 1
  const out: PathCommand[] = []
  for (let i = 1; i < n - 1; i++) {
    const dx1 = points[i * 2] - points[(i - 1) * 2]
    const dy1 = points[i * 2 + 1] - points[(i - 1) * 2 + 1]
    const dx2 = points[(i + 1) * 2] - points[i * 2]
    const dy2 = points[(i + 1) * 2 + 1] - points[i * 2 + 1]
    if (dx1 * dy2 - dy1 * dx2 !== 0) {
      out.push({ type: 'L', x: points[i * 2], y: points[i * 2 + 1] })
    }
  }
  out.push({ type: 'L', x: points[(n - 1) * 2], y: points[(n - 1) * 2 + 1] })
  return out
}
