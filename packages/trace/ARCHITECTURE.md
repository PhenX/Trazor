# Tracer — architecture map

Reference for `packages/trace/`: what exists and where. The **rules** for changing it live in [`AGENTS.md`](AGENTS.md) —
read that before editing. This map describes structure and intent; `src/index.ts` and
[`../../docs/CONTRACTS.md`](../../docs/CONTRACTS.md) are the authority on exact signatures.

## Shape

```
src/
  crack.ts        mask → signed closed lattice boundary paths (turn policies, hole hierarchy)
  refine.ts       optional sub-pixel snap of ring vertices onto a signed coverage field (anti-aliased edges)
  boundary.ts     label map → seam-free region shapes (the shared boundary graph)
  closed.ts       one closed ring → PathCommand[] via the Potrace chain; also traceMask
  centerline.ts   skeleton → smooth open strokes (graph walk, junction merge, fit)
  fit.ts          Schneider cubic Bézier fitting for open polylines
  simplify.ts     Douglas-Peucker polyline simplification
  paths.ts        PathCommand helpers (reverse, cubic eval, distances)
  potrace/
    sums.ts       prefix moments; chord penalty; best-fit line; quadratic forms
    polyfit.ts    straightness analysis + optimal-polygon dynamic program
    adjust.ts     least-squares vertex adjustment (constrained to the unit square)
    smooth.ts     corner analysis (alphamax) → corners vs smooth cubic pieces
    opticurve.ts  curve-run optimization (merge adjacent cubics within tolerance)
```

## Three entry points

- **`traceMask(mask, opts)`** → `TracedShape[]`. Binary mask → filled shapes. Used by bw mode and by stacked color
  layering (one mask per layer). Holes are grouped under their smallest enclosing outer ring (evenodd). It is the two
  halves `decomposeMask` (rings) then **`shapesFromPaths(paths, curveOptions, polygons?)`** (curve chain + hole
  grouping), both exported: rings depend only on the mask, the turn policy and the area floor, so a caller that keeps
  them — the engine's `StageCache` does — re-fits them alone when only the curve settings change.
- **`traceLabelMap(labels, opts)`** → `RegionShape[]`. The seam-free cutout partition (below).
- **`traceCenterline(skeleton, opts)`** → `StrokePath[]`. Thinned skeleton → open strokes for pen plotters / engraving.

## The Potrace curve chain (per closed ring — `closed.ts` + `potrace/`)

Implemented from Selinger 2003, clean-room. For one crack ring:

1. **Decompose** (`crack.ts`, §2.1) — walk pixel "cracks" into signed closed rings; sign marks outer vs hole; turn
   policies resolve checkerboard junctions; XOR-flip the traced region so holes surface as their own rings.
2. **Straightness + optimal polygon** (`polyfit.ts`, §2.2) — the constraint-vector walk finds each vertex's furthest
   straight reach; a two-phase DP then minimizes segment count, then chord penalty (from the O(1) prefix moments in
   `sums.ts`). This always runs on the **integer** lattice ring (unit steps are load-bearing for the straightness analysis).
   - _optional sub-pixel_ (`refine.ts`): with a `coverage` field, the ring's vertices are snapped onto its zero contour
     **after** the polygon indices are chosen; the refined positions feed only the moment sums and vertex adjustment, so
     each segment's best-fit line tracks the true anti-aliased edge instead of the staircase. Hard edges and the image
     border are left on the lattice.
3. **Vertex adjustment** (`adjust.ts`, §2.3.1) — move each polygon vertex to the least-squares intersection of its two
   incident edge lines, constrained to the unit square around the (possibly refined) vertex.
4. **Corner analysis + smoothing** (`smooth.ts`, §2.3.2) — the `alphamax` parameter (from `settings.smoothing`) decides
   corner vs smooth at each vertex; smooth vertices become cubic pieces through the edge midpoints. When a
   `cornerThreshold` is supplied it refines that call to be angle- and scale-aware: a vertex whose shorter incident edge is
   sub-pixel is never a corner (staircase/aliasing jags stay smooth), a genuinely sharp interior angle is always a corner,
   and the α metric governs only the shallow middle. Omitting it is byte-identical to the pure α behavior.
5. **Curve optimization** (`opticurve.ts`, §2.4) — merge runs of adjacent cubics into one while it stays within
   `optTolerance`, keeping node counts low.

`curveMode` short-circuits this: `polygon` stops after step 3; `pixel` skips it entirely for exact rectilinear paths.

The chain is exported in two halves, split where the curve settings first matter: **`ringPolygon(ring, field?)`** runs
steps 2-3 (returning the adjusted polygon, or `null` for a ring too short to carry one) and depends on the ring and the
optional field alone, while **`polygonToCommands(ring, polygon, opts)`** runs steps 4-5 under `smoothing`,
`curveOptimize`, `optTolerance` and `cornerThreshold`. `closedPathToCommands` is the two composed; `shapesFromPaths`
takes the polygons for a whole path array as an optional argument. Holding the polygons is what lets the engine's
`StageCache` replay a smoothing change without re-running the straightness DP.

## The seam-free boundary graph (`boundary.ts`)

For an exact partition (cutout mode), tracing each region's outline independently produces hairline gaps where two
regions meet. Instead:

1. Build the label map's **crack network** (horizontal/vertical cracks between differing labels).
2. Walk it into **chains** — junction-to-junction runs plus pure loops — each recording the labels on its left and right.
3. Fit each chain **once** (the same Potrace stages for loops; an open-chain variant with **pinned junction endpoints**
   for junction-to-junction chains).
4. **Assemble** each region's rings by walking its chain instances (reversing shared chains for the neighbor), so the two
   regions on either side of a boundary emit the _same_ curve. No gaps, no overlaps — asserted anchor-for-anchor in
   `boundary.test.ts`.

The three steps are separately exported, because step 3 is the expensive one and every chain is independent of every
other: **`extractChains(labels)`** → `ChainNetwork` (steps 1-2, a function of the label map alone),
**`fitChain(network, i, opts)`** → `ChainFit` (step 3 for one chain, callable in any order or in another thread — the
engine's helper pool farms these out), and **`assembleRegions(network, fits)`** → `RegionShape[]` (step 4).
`traceLabelMap` is the three composed, and `fitChains` is `fitChain` over the whole network.

A `ChainFit` carries up to two forms of the same chain, because a region reaches a chain in one of two ways: `open` is
the forward run **without** a leading `M` (the form a ring splices in as it passes through), and a chain that returns to
its own start corner also carries `closed`, the complete `M…Z` ring a region uses when that chain **is** the whole ring.
A chain that closes on a junction can be both — its own ring for one region, one arc of a larger ring for another — so
both fits exist and the assembler picks by how it arrived. The reversed form of whichever it used is derived once and
shared, which is what makes the two neighbors' geometry identical rather than merely equal.

_Optional sub-pixel color refinement_ (`ColorField`): given the working image's per-pixel Oklab buffer and the per-label
palette Oklab, each shared chain is snapped onto the true anti-aliased edge between its two region colors before fitting —
the pairwise signed field (`refine.ts` `pairwiseField`) is zero where a pixel is the perceptual 50% mix of the two sides.
The chain is refined **once** and reused by both neighbors, and junction endpoints stay pinned to the lattice, so the
seam-free guarantee holds. Straight junction-to-junction edges (no interior polygon vertex) are unaffected; loops and
curved chains carry the refinement. Omitting the field is byte-identical to the classical lattice trace.

_Optional per-chain post-fit_ (`refineChain`): a transform applied to each shared chain's fitted commands **once** (the
engine wires `@trazor/svg`'s `fitArcs` here for cutout when path optimization is on, collapsing circular/elliptical Bézier
runs to `A` arcs). Because the neighbor's copy is derived by reversal, both inherit the identical transform, so cutout
gets the arc node-reduction without seam divergence; junction endpoints are integer lattice points, which the arc
grid-snap preserves. Full-shape primitive _elements_ (`<circle>` etc.) stay off for cutout — an element can't be shared
with a neighbor's path edge — so only the in-path arcs apply.

## Centerline (`centerline.ts`)

Skeleton (from `raster`'s Zhang-Suen thinning) → condensed 8-neighbor pixel graph (redundant diagonals suppressed) →
walk chains between nodes → prune short spurs → **merge the straightest continuations through junctions** (so a crossing
stays two continuous strokes, not four arms) → Douglas-Peucker simplify → corner-aware Schneider fit (`fit.ts`).

With an optional `distanceField` (a chamfer transform of the ink mask), each stroke also reports its own `width` — the
median of 2×distance along that chain's skeleton pixels — so a drawing with varying line weight keeps the variation
instead of collapsing to one global average. Omitted ⇒ `width` is unset and the engine falls back to the global estimate.

## Tests

`crack.test.ts` (decomposition signs/areas/turn policy), `closed.test.ts` (optimal polygon + `traceMask` corners,
circles, holes, closure, determinism, pixel mode), `boundary.test.ts` (shared anchors, 3-color junctions, hole rings,
determinism), `boundary-split.test.ts` (extract/fit/assemble reproduces `traceLabelMap`, including with the chains
fitted out of order), `centerline.test.ts` (single stroke, crossing → two strokes, spur pruning, corners, closed
rings).
