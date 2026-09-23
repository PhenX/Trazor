import type { GrayImage, LabelMap, PathCommand } from '@trazor/core'
import { arcToCenter } from '@trazor/core'
import type { TraceCurveOptions } from './closed'
import { closedPathToCommands, pixelCommands } from './closed'
import { adjustVertices } from './potrace/adjust'
import { optimalPolyline } from './potrace/polyfit'
import {
  candidateStride,
  descriptionLambda,
  fitOpenRuns,
  mergeReach,
  ringSigmas,
  runBand,
  runTau,
} from './potrace/runfit'
import { computeSums } from './potrace/sums'
import type { FlatPoints } from './paths'
import { cubicAt, reverseCommands } from './paths'
import { negatedField, pairwiseField, refineRingToField, signedFieldOf } from './refine'
import type { SignedField } from './refine'

/**
 * The working image's RGBA bytes (matching the label map's dimensions) plus
 * per-label palette RGB (interleaved, indexed by label). When present, each
 * shared boundary chain is refined onto the sub-pixel color edge between its two
 * regions — the anti-aliased boundary position recovered by inverting the sRGB
 * blend the rasterizer produced (`pairwiseField` → `coverageOf`), not the pixel
 * staircase. The chain is fitted once and reused by both neighbors, so the
 * seam-free guarantee is preserved; junction endpoints stay pinned.
 */
export interface ColorField {
  pixels: Uint8ClampedArray
  paletteRgb: Uint8Array
  /**
   * Signed transparency coverage (`alphaCoverageField`), positive on the
   * labeled side. Present, a chain with an unlabeled (transparent) side is
   * refined onto the coverage's zero contour — the true outline of an
   * anti-aliased edge against transparency; absent, such a chain stays on the
   * lattice.
   */
  alpha?: GrayImage
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
 * Share of a ring's lattice area under which its fitted outline has collapsed
 * and the ring keeps its exact lattice outline instead. Every chain is fitted
 * on its own between the junction corners it shares, so a region no wider than
 * a pixel — a hairline stem, the one-pixel sliver of a rim between two fills —
 * has each chain around it fitted onto the same chord and closes to no area at
 * all, whichever way its neighbours are drawn. Any other fit stays within a
 * pixel of its lattice (the straightness tube), which cannot cost a ring half
 * its area, so nothing else reaches the floor.
 */
const RING_AREA_FLOOR = 0.5

/** Samples per curve when a fitted ring's area is measured. */
const AREA_CURVE_SAMPLES = 8

/**
 * Signed area enclosed by one fitted ring (`M … Z`), its curves sampled at
 * AREA_CURVE_SAMPLES points; the lattice shoelace's sign convention.
 */
function fittedRingArea(commands: readonly PathCommand[]): number {
  let twice = 0
  let sx = 0
  let sy = 0
  let px = 0
  let py = 0
  const to = (x: number, y: number): void => {
    twice += px * y - x * py
    px = x
    py = y
  }
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        sx = px = c.x
        sy = py = c.y
        break
      case 'L':
        to(c.x, c.y)
        break
      case 'Q': {
        const x0 = px
        const y0 = py
        for (let k = 1; k <= AREA_CURVE_SAMPLES; k++) {
          const t = k / AREA_CURVE_SAMPLES
          const u = 1 - t
          to(
            u * u * x0 + 2 * u * t * c.x1 + t * t * c.x,
            u * u * y0 + 2 * u * t * c.y1 + t * t * c.y,
          )
        }
        break
      }
      case 'C': {
        const x0 = px
        const y0 = py
        for (let k = 1; k <= AREA_CURVE_SAMPLES; k++) {
          const [x, y] = cubicAt(x0, y0, c.x1, c.y1, c.x2, c.y2, c.x, c.y, k / AREA_CURVE_SAMPLES)
          to(x, y)
        }
        break
      }
      case 'A': {
        const arc = arcToCenter(px, py, c)
        if (arc) {
          const cos = Math.cos(arc.phi)
          const sin = Math.sin(arc.phi)
          for (let k = 1; k < AREA_CURVE_SAMPLES; k++) {
            const a = arc.theta1 + (arc.dTheta * k) / AREA_CURVE_SAMPLES
            const ex = arc.rx * Math.cos(a)
            const ey = arc.ry * Math.sin(a)
            to(arc.cx + cos * ex - sin * ey, arc.cy + sin * ex + cos * ey)
          }
        }
        to(c.x, c.y)
        break
      }
      case 'Z':
        to(sx, sy)
        break
    }
  }
  return twice / 2
}

/** Whether a fitted ring lost most of the area its lattice ring encloses. */
function collapsed(commands: readonly PathCommand[], latticeArea: number): boolean {
  return Math.abs(fittedRingArea(commands)) < RING_AREA_FLOOR * Math.abs(latticeArea)
}

/** A chain instance's lattice points in travel order, appended to `into` (the first pair skipped when continuing a ring). */
function appendLattice(
  chains: readonly BoundaryChain[],
  inst: Instance,
  into: number[],
  skipFirst: boolean,
): void {
  const p = chains[inst.chain].points
  const n = p.length >> 1
  if (inst.forward) {
    for (let k = skipFirst ? 1 : 0; k < n; k++) into.push(p[k * 2], p[k * 2 + 1])
  } else {
    for (let k = n - 1 - (skipFirst ? 1 : 0); k >= 0; k--) into.push(p[k * 2], p[k * 2 + 1])
  }
}

/** The exact lattice ring the instances walk, collinear points collapsed. */
function latticeRing(chains: readonly BoundaryChain[], insts: readonly Instance[]): PathCommand[] {
  const poly: number[] = []
  insts.forEach((inst, k) => appendLattice(chains, inst, poly, k > 0))
  if (poly.length >= 2) poly.length -= 2 // the closing point repeats the start
  return pixelCommands(poly)
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
          const fitted = ringCommandsOf(start)
          commands.push(...(collapsed(fitted, area) ? latticeRing(chains, [start]) : fitted))
          continue
        }

        // Follow chain instances until the cycle returns to the start instance.
        let ringArea = 0
        const ringCmds: PathCommand[] = []
        const p = startChain.points
        const sx = start.forward ? p[0] : p[p.length - 2]
        const sy = start.forward ? p[1] : p[p.length - 1]
        ringCmds.push({ type: 'M', x: sx, y: sy })
        const insts: Instance[] = []
        let inst = start
        for (;;) {
          inst.used = true
          insts.push(inst)
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
        commands.push(
          ...(collapsed(ringCmds, ringArea / 2) ? latticeRing(chains, insts) : ringCmds),
        )
      }
    }
    if (commands.length > 0) {
      shapes.push({ label, commands, area: areas.get(label) ?? 0, holeCount })
    }
  }
  return shapes
}

/**
 * One planar face of a partition: a single connected region of one label,
 * written as its outer ring alone. Its holes are dropped — in a partition every
 * hole is another face's outer boundary, which is painted later and on top of
 * this one, so the shared curve is drawn once (as the child's outline) instead
 * of twice. `parent` indexes the face that geometrically contains this one (the
 * next-larger face whose outline encloses it), or −1 for a root.
 */
export interface FaceShape {
  label: number
  /** The face's outer ring (a single `M…Z` subpath). */
  commands: PathCommand[]
  /** Enclosed area of the outer ring, in px². */
  area: number
  /** Index into the returned array of the containing face, or −1 for a root. */
  parent: number
}

/**
 * Assemble the planar faces of a partition from the fitted chains, for `nested`
 * layering. Each connected region contributes one {@link FaceShape} per outer
 * ring, carrying only that ring (holes are dropped — see {@link FaceShape}), and
 * every face records the face that contains it. Painted in containment order
 * (parents first) with each child drawn over its parent, the faces tile exactly:
 * a boundary between a face and the face nested inside it is drawn once, as the
 * child's outline, and because that curve is the identical fit the parent would
 * have drawn, no seam appears.
 *
 * `fits` must be parallel to `network.chains` — the output of {@link fitChain}
 * per index, exactly as {@link assembleRegions} consumes. Containment is decided
 * geometrically: each face carries a probe point that is a genuine interior
 * pixel of its own region, and a face is inside another when that other face's
 * lattice outline encloses the probe; the smallest such enclosing face is the
 * parent. The probe is an actual region pixel, so it never lands in a hole, and
 * the test is exact on the integer lattice.
 */
export function assembleFaces(network: ChainNetwork, fits: readonly ChainFit[]): FaceShape[] {
  const { chains } = network
  const cw = network.width + 1
  const reversed: (PathCommand[] | null)[] = new Array(chains.length).fill(null)

  const ringCommandsOf = (inst: Instance): PathCommand[] => {
    const i = inst.chain
    const closed = fits[i].closed as PathCommand[]
    if (inst.forward) return closed
    return (reversed[i] ??= reverseCommands(closed))
  }
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
  // Per-region instance index, identical to assembleRegions: a chain is walked
  // forward by the region on its right, reversed by the region on its left.
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

  /**
   * One walked boundary ring: an outer ring (positive area) is a face, a hole
   * (negative area) is dropped when a labeled child paints over it but KEPT (as
   * an even-odd hole in its own face) when it borders transparency, which no face
   * covers. `probeX/Y` is a genuine interior pixel of the face on the ring's own
   * side; `holeX/Y` is a pixel across the ring, used to reattach a kept hole to
   * the face that surrounds it.
   */
  interface RawRing {
    label: number
    commands: PathCommand[]
    area: number
    poly: number[]
    probeX: number
    probeY: number
    holeX: number
    holeY: number
    touchesTransparent: boolean
  }
  const raw: RawRing[] = []

  for (const [label, byCorner] of regionInstances) {
    for (const list of byCorner.values()) {
      for (const start of list) {
        if (start.used) continue
        const startChain = chains[start.chain]
        const p = startChain.points
        const sx = start.forward ? p[0] : p[p.length - 2]
        const sy = start.forward ? p[1] : p[p.length - 1]
        const startDir = instFirstDir(chains, start)
        const [probeX, probeY] = rightProbe(sx, sy, startDir)
        const [holeX, holeY] = leftProbe(sx, sy, startDir)

        if (startChain.loop) {
          start.used = true
          const area = (start.forward ? startChain.shoelace : -startChain.shoelace) / 2
          const poly: number[] = []
          appendLattice(chains, start, poly, false)
          if (poly.length >= 2) poly.length -= 2 // drop the duplicated closing point
          const outside = start.forward ? startChain.left : startChain.right
          const fitted = ringCommandsOf(start)
          raw.push({
            label,
            commands: collapsed(fitted, area) ? pixelCommands(poly) : fitted,
            area,
            poly,
            probeX,
            probeY,
            holeX,
            holeY,
            touchesTransparent: outside < 0,
          })
          continue
        }

        let ringArea = 0
        const ringCmds: PathCommand[] = []
        const poly: number[] = []
        ringCmds.push({ type: 'M', x: sx, y: sy })
        let touchesTransparent = false
        let inst = start
        let firstInst = true
        for (;;) {
          inst.used = true
          const c = chains[inst.chain]
          ringArea += inst.forward ? c.shoelace : -c.shoelace
          if ((inst.forward ? c.left : c.right) < 0) touchesTransparent = true
          ringCmds.push(...runCommandsOf(inst))
          appendLattice(chains, inst, poly, !firstInst)
          firstInst = false
          const [ex, ey] = instEnd(chains, inst)
          const nextList = byCorner.get(cornerKey(ex, ey))
          const next = pickContinuation(chains, nextList, instLastDir(chains, inst), start)
          if (!next || next === start) break
          inst = next
        }
        ringCmds.push({ type: 'Z' })
        if (poly.length >= 2) poly.length -= 2 // drop the closing point (equals the start)
        raw.push({
          label,
          commands: collapsed(ringCmds, ringArea / 2) ? pixelCommands(poly) : ringCmds,
          area: ringArea / 2,
          poly,
          probeX,
          probeY,
          holeX,
          holeY,
          touchesTransparent,
        })
      }
    }
  }

  const n = raw.length
  const bbox = new Float64Array(n * 4)
  for (let i = 0; i < n; i++) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const poly = raw[i].poly
    for (let k = 0; k < poly.length; k += 2) {
      if (poly[k] < minX) minX = poly[k]
      if (poly[k] > maxX) maxX = poly[k]
      if (poly[k + 1] < minY) minY = poly[k + 1]
      if (poly[k + 1] > maxY) maxY = poly[k + 1]
    }
    bbox[i * 4] = minX
    bbox[i * 4 + 1] = minY
    bbox[i * 4 + 2] = maxX
    bbox[i * 4 + 3] = maxY
  }
  const encloses = (j: number, px: number, py: number): boolean =>
    px >= bbox[j * 4] &&
    px <= bbox[j * 4 + 2] &&
    py >= bbox[j * 4 + 1] &&
    py <= bbox[j * 4 + 3] &&
    pointInPolygon(px, py, raw[j].poly)

  // Outer rings (positive area) are the faces; index them so a kept hole can be
  // reattached to the faces it lies in.
  const faceOfRaw = new Int32Array(n).fill(-1)
  const faces: FaceShape[] = []
  for (let i = 0; i < n; i++) {
    if (raw[i].area > 0) {
      faceOfRaw[i] = faces.length
      faces.push({ label: raw[i].label, commands: raw[i].commands, area: raw[i].area, parent: -1 })
    }
  }

  // A hole that borders transparency bounds a transparent region no face paints:
  // it must be punched, under even-odd, out of every face drawn solid over it —
  // the whole containment chain up to the first enclosing transparent region,
  // which already cut this area (inkvec `emit_color`: punch a clear face out of
  // its painted ancestors up to the first transparent ancestor; going further
  // re-fills it, since a ring inside an even-odd hole flips parity back). A hole
  // enclosed only by labeled regions is dropped — those child faces, drawn on
  // top in containment order, repaint exactly its area.
  const transparent: number[] = []
  for (let i = 0; i < n; i++) if (raw[i].area < 0 && raw[i].touchesTransparent) transparent.push(i)
  for (const i of transparent) {
    const hx = raw[i].holeX
    const hy = raw[i].holeY
    const size = -raw[i].area
    // The smallest transparent region strictly enclosing this one bounds how far
    // up the chain to punch; faces at least that large are cut by it instead.
    let enclosing = Infinity
    for (const k of transparent) {
      if (k === i) continue
      const kSize = -raw[k].area
      if (kSize > size && kSize < enclosing && encloses(k, hx, hy)) enclosing = kSize
    }
    for (let j = 0; j < n; j++) {
      // Only a face that would paint over the whole region cuts it: it must
      // enclose the region, so its outline is larger than the region and holds a
      // pixel inside it. A rim sliver beside the region is smaller and is skipped
      // — punching the region's ring into it would flood the sliver's color.
      if (faceOfRaw[j] < 0 || raw[j].area < size || raw[j].area >= enclosing) continue
      if (!encloses(j, hx, hy)) continue
      // The hole ring carries its own M…Z, so it splices in as another even-odd
      // subpath of each face it cuts.
      faces[faceOfRaw[j]].commands.push(...raw[i].commands)
    }
  }

  // Containment across faces (any label): a face sits inside another when that
  // face's outline encloses its interior probe. The probe is a real pixel of the
  // face, so only the face and its ancestors enclose it; the smallest such
  // ancestor is the parent, which sets the paint order (parents first).
  for (let i = 0; i < n; i++) {
    const fi = faceOfRaw[i]
    if (fi < 0) continue
    let parent = -1
    let parentArea = Infinity
    for (let j = 0; j < n; j++) {
      if (j === i || faceOfRaw[j] < 0 || raw[j].area < raw[i].area || raw[j].area >= parentArea) {
        continue
      }
      if (!encloses(j, raw[i].probeX, raw[i].probeY)) continue
      parent = faceOfRaw[j]
      parentArea = raw[j].area
    }
    faces[fi].parent = parent
  }
  return faces
}

/** The pixel center on the right of travel (the face's own side) leaving corner (sx, sy) toward `dir`. */
function rightProbe(sx: number, sy: number, dir: number): [number, number] {
  switch (dir) {
    case 0:
      return [sx + 0.5, sy + 0.5]
    case 1:
      return [sx - 0.5, sy + 0.5]
    case 2:
      return [sx - 0.5, sy - 0.5]
    default:
      return [sx + 0.5, sy - 0.5]
  }
}

/** The pixel center on the left of travel (across the ring) leaving corner (sx, sy) toward `dir`. */
function leftProbe(sx: number, sy: number, dir: number): [number, number] {
  switch (dir) {
    case 0:
      return [sx + 0.5, sy - 0.5]
    case 1:
      return [sx + 0.5, sy + 0.5]
    case 2:
      return [sx - 0.5, sy + 0.5]
    default:
      return [sx - 0.5, sy - 0.5]
  }
}

/** Crossing-number test: is (px, py) inside the closed lattice polygon `poly` (interleaved x, y)? */
function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  let inside = false
  const m = poly.length >> 1
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const yi = poly[i * 2 + 1]
    const yj = poly[j * 2 + 1]
    if (yi > py !== yj > py) {
      const xi = poly[i * 2]
      const xj = poly[j * 2]
      const xCross = xi + ((py - yi) / (yj - yi)) * (xj - xi)
      if (px < xCross) inside = !inside
    }
  }
  return inside
}

/**
 * Sub-pixel boundary field for a chain: the color field between its two region
 * colors, or, on an exterior chain (one side unlabeled), the transparency
 * coverage — which is positive on the labeled side, while a chain's field must
 * be positive on its right.
 */
function chainField(
  network: ChainNetwork,
  chain: BoundaryChain,
  opts: TraceCutoutOptions,
): SignedField | undefined {
  const cf = opts.colorField
  if (!cf) return undefined
  if (chain.left < 0 || chain.right < 0) {
    if (!cf.alpha || (chain.left < 0 && chain.right < 0)) return undefined
    return chain.right >= 0 ? signedFieldOf(cf.alpha) : negatedField(cf.alpha)
  }
  return pairwiseField(
    cf.pixels,
    cf.paletteRgb,
    network.width,
    network.height,
    chain.left,
    chain.right,
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
  // sub-pixel refinement then feeds the run fitter's samples. Junction endpoints
  // stay exactly on the lattice so adjacent chains still connect.
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

  if (opts.curveMode === 'polygon' || vertexIdx.length <= 2) {
    // Polygon mode emits the least-squares adjusted vertices (Selinger §2.3.1).
    const adjusted = adjustVertices(geom, computeSums(geom), vertexIdx, false)
    const m = adjusted.length >> 1
    const out: PathCommand[] = []
    for (let i = 1; i < m; i++) {
      out.push({ type: 'L', x: adjusted[i * 2], y: adjusted[i * 2 + 1] })
    }
    return out
  }

  // Each smooth run between two corners is fitted directly to the refined chain
  // samples by the bounded DP (line / arc / G1 cubic), the pinned junction
  // endpoints keeping the partition seam-free.
  const sigma = ringSigmas(points, geom, field !== undefined)
  const extent = field ? Math.max(field.width, field.height) : 0
  return fitOpenRuns(geom, sigma, vertexIdx, {
    alphamax: (opts.smoothing * 4) / 3,
    cornerThreshold: opts.cornerThreshold,
    lambda: descriptionLambda(extent),
    tau: runTau(),
    band: runBand(opts.optTolerance),
    reach: mergeReach(opts.curveOptimize),
    stride: candidateStride(opts.curveOptimize),
  })
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
