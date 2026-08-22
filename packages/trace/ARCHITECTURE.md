# Tracer — architecture map

Reference for `packages/trace/`: what exists and where. The **rules** for changing it live in [`AGENTS.md`](AGENTS.md) —
read that before editing. This map describes structure and intent; `src/index.ts` and
[`../../docs/CONTRACTS.md`](../../docs/CONTRACTS.md) are the authority on exact signatures.

## Shape

```
src/
  crack.ts        mask → signed closed lattice boundary paths (turn policies, hole hierarchy)
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
  layering (one mask per layer). Holes are grouped under their smallest enclosing outer ring (evenodd).
- **`traceLabelMap(labels, opts)`** → `RegionShape[]`. The seam-free cutout partition (below).
- **`traceCenterline(skeleton, opts)`** → `StrokePath[]`. Thinned skeleton → open strokes for pen plotters / engraving.

## The Potrace curve chain (per closed ring — `closed.ts` + `potrace/`)

Implemented from Selinger 2003, clean-room. For one crack ring:

1. **Decompose** (`crack.ts`, §2.1) — walk pixel "cracks" into signed closed rings; sign marks outer vs hole; turn
   policies resolve checkerboard junctions; XOR-flip the traced region so holes surface as their own rings.
2. **Straightness + optimal polygon** (`polyfit.ts`, §2.2) — the constraint-vector walk finds each vertex's furthest
   straight reach; a two-phase DP then minimizes segment count, then chord penalty (from the O(1) prefix moments in
   `sums.ts`).
3. **Vertex adjustment** (`adjust.ts`, §2.3.1) — move each polygon vertex to the least-squares intersection of its two
   incident edge lines, constrained to the unit square around the lattice vertex.
4. **Corner analysis + smoothing** (`smooth.ts`, §2.3.2) — the `alphamax` parameter (from `settings.smoothing`) decides
   corner vs smooth at each vertex; smooth vertices become cubic pieces through the edge midpoints.
5. **Curve optimization** (`opticurve.ts`, §2.4) — merge runs of adjacent cubics into one while it stays within
   `optTolerance`, keeping node counts low.

`curveMode` short-circuits this: `polygon` stops after step 3; `pixel` skips it entirely for exact rectilinear paths.

## The seam-free boundary graph (`boundary.ts`)

For an exact partition (cutout mode), tracing each region's outline independently produces hairline gaps where two
regions meet. Instead:

1. Build the label map's **crack network** (horizontal/vertical cracks between differing labels).
2. Walk it into **chains** — junction-to-junction runs plus pure loops — each recording the labels on its left and right.
3. Fit each chain **once** (the same Potrace stages for loops; an open-chain variant with **pinned junction endpoints**
   for junction-to-junction chains), memoized forward and reversed.
4. **Assemble** each region's rings by walking its chain instances (reversing shared chains for the neighbor), so the two
   regions on either side of a boundary emit the _same_ curve. No gaps, no overlaps — asserted anchor-for-anchor in
   `boundary.test.ts`.

## Centerline (`centerline.ts`)

Skeleton (from `raster`'s Zhang-Suen thinning) → condensed 8-neighbor pixel graph (redundant diagonals suppressed) →
walk chains between nodes → prune short spurs → **merge the straightest continuations through junctions** (so a crossing
stays two continuous strokes, not four arms) → Douglas-Peucker simplify → corner-aware Schneider fit (`fit.ts`).

## Tests

`crack.test.ts` (decomposition signs/areas/turn policy), `closed.test.ts` (optimal polygon + `traceMask` corners,
circles, holes, closure, determinism, pixel mode), `boundary.test.ts` (shared anchors, 3-color junctions, hole rings,
determinism), `centerline.test.ts` (single stroke, crossing → two strokes, spur pruning, corners, closed rings).
