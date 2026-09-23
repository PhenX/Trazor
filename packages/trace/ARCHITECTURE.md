# Tracer — architecture map

Reference for `packages/trace/`: what exists and where. The **rules** for changing it live in [`AGENTS.md`](AGENTS.md) —
read that before editing. This map describes structure and intent; `src/index.ts` and
[`../../docs/CONTRACTS.md`](../../docs/CONTRACTS.md) are the authority on exact signatures.

## Shape

```
src/
  crack.ts        mask → signed closed lattice boundary paths (turn policies, hole hierarchy)
  refine.ts       optional sub-pixel snap of boundary points onto a signed coverage field's ½ level (normal search)
  solve.ts        boundary solve: move a chain's points at once to match exact rendered coverage (off the default path)
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
    smooth.ts     corner analysis (alphamax) → corners vs smooth vertices
    runfit.ts     multi-model run fit: a bounded dynamic program over candidate breakpoints picks
                  the segmentation and the per-span model (line / circular arc / G1 cubic) by MDL;
                  the structural refit (geometric mode) or the G1 spline refit (illustration mode)
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
   - _optional sub-pixel_ (`refine.ts`): with a `coverage` field, each ring point is moved onto the field's coverage = ½
     level set **after** the polygon indices are chosen — inkvec stage 07 (`refine_subpixel`, `docs/REFERENCES.md`): the
     local tangent is the direction of the optimal-polygon edge the point lies on (lattice neighbours only point along
     axes and diagonals, so a slanted edge searched across at their angle inverts through the wrong profile), turning
     towards each end vertex's direction — the bisector of a gentle vertex (< 45°), the edge's own next to a corner — since
     on an arc a chord is the tangent only at its middle. The normal is perpendicular, and coverage is probed at the pixel
     centres along the normal (a probe on a pixel boundary taking the pixel beyond it, so a face towards −x or −y reads
     like one towards +x or +y); the two probes bracketing ½ locate the edge, a clean step inverting through the exact
     half-plane coverage of a unit square (no bias towards the ½ grid, where a bilinear root-find leaves a slanted edge
     ~0.15 px fat) and a ridge or soft profile falling back to a root-find. The refined positions feed the moment sums,
     the vertex adjustment and the run fitter's samples, so each segment tracks the true anti-aliased edge instead of the
     staircase. Hard edges (no partial pixel) and the image border are left on the lattice.
3. **Vertex adjustment** (`adjust.ts`, §2.3.1) — move each polygon vertex to the least-squares intersection of its two
   incident edge lines, constrained to the unit square around the (possibly refined) vertex.
4. **Corner analysis** (`smooth.ts`, §2.3.2) — the `alphamax` parameter (from `settings.smoothing`) decides corner vs
   smooth at each vertex. When a `cornerThreshold` is supplied it refines that call to be angle- and scale-aware: a vertex
   whose shorter incident edge is sub-pixel is never a corner (staircase/aliasing jags stay smooth), a genuinely sharp
   interior angle is always a corner, and the α metric governs only the shallow middle. Omitting it is byte-identical to
   the pure α behavior. (`cornerAt` exposes this decision to the run fitter.)
5. **Multi-model run fitting** (`runfit.ts`) — a bounded dynamic program fits each smooth run between two corners
   directly to the refined ring points (not the polygon's chords, so none of Selinger's circumscribe-at-vertices /
   inscribe-at-curves bias). This ports inkvec's stage 11 (`crates/inkvec-fit/{multimodel,curves,merge}.rs`) in a
   browser-fast form: rather than inkvec's DP over every point, the DP runs over a bounded candidate set — the
   optimal-polygon vertices (Selinger §2.2) as breakpoints, the discrete-curvature sign changes and a coarse stride inside
   a long polygon edge — and over the O(k²) spans of that candidate graph picks the segmentation and the per-span model
   (line / circular arc / G1 cubic) jointly under `0.5·χ² + λ·params` (χ² weighted by per-point `1/σ²`, `λ = ln(extent /
precision) ≈ 8.5` at 512 px, a span admissible only when every sample lies within `τ·σ`, `τ = 2` — inkvec's objective).
   `σ` is 0.1 px where a sample was snapped onto the sub-pixel edge, 0.06 px on an axis-aligned stretch of a refined
   ring's polygon that stayed on the lattice (a hard edge the drawing put on the grid, or the image border), ½ px
   elsewhere on the lattice. A corner is a polygon vertex (read on the unadjusted polygon) turning at least 45° (inkvec
   `CORNER_DEGREES`) that `cornerAt` also calls a corner, so `smoothing` keeps its say; two vertices a chamfer stub apart
   (≤ 2.5 px, the anti-aliasing's cut across one sharp corner, each turning part of the way) are judged as one vertex at
   the stub's middle. A corner is a forced breakpoint, a non-corner join keeps the shared data tangent so it stays G1. A
   rounded corner the polygon split
   into chords becomes one arc; a long arc becomes one arc rather than cubics with line stubs; a jittery straight run one
   line. After the DP a single pass merges adjacent curves one cubic explains (inkvec `merge_free_cubics`), and a
   wholly-smooth ring is one circle when that is the better description: a geometric circle fit whose reduced χ² stays
   within τ² and whose `0.5·χ² + 3λ` undercuts the DP's cost (inkvec's whole-primitive rule — a few 2.5σ samples do not
   veto a true circle, a real notch keeps its segments). Circular runs are emitted as circle-exact cubics that
   `@trazor/svg`'s `fitArcs` recovers as `A` arcs. `curveOptimize` sets the DP reach and candidate stride (off ⇒ shorter,
   greedier pieces).

   **Geometric mode** (`smoothing ≤ 0.5` — the flat-ink profile's sharp icons and glyphs trace at 0.25, the illustration
   profiles at 0.6 and up) asks for the drawing's own lines, rounds and corners, and a closed ring gets a **structural
   refit** after the DP: every line and arc the DP chose is refitted freely to its samples (a σ-weighted total-least-
   squares line; a geometric circle, Kåsa start and Gauss–Newton polish) instead of pinned to two of them, and each join
   is placed where the models meet — two edges' intersection at a corner, within the chamfer allowance; the tangent
   point of a line and a round; the sample itself where two lines or two rounds fail to meet near it (one of them is a
   short transition whose model says little). The samples on a corner's anti-aliasing chamfer (`CORNER_CHAMFER`,
   reaching further along sharper corners) carry no weight, and a chamfer stub between two corners collapses into one
   corner (inkvec `adjust_vertices_at`, `sharpen_corners`). A cubic keeps its fit, re-pinned to the joins with its
   neighbours' tangents. The refit falls back to the pinned DP fit where it would draw worse than it measured — an arc
   sweeping far longer than its samples, a cubic whose controls leave them.

   **Illustration mode** (`smoothing > 0.5`) reads refined samples at `σ ≥ 0.2`, so higher smoothing simplifies (a
   hand-drawn outline's wobble spanned by one model), and makes every join inside a span smooth. The DP prices a chord
   at two parameters and a curve at six, so it paves a gently curving outline with chords that meet at kinks the
   per-sample residual never sees — the polygon look of a traced cartoon. After the DP the span's breakpoints become the
   knots of a **G1 cubic spline** (Plass & Stone 1983): each knot carries one direction shared by the two pieces meeting
   there, solved by linear least squares over all the span's samples (a symmetric tridiagonal system in the knot
   tangents, cyclic on a smooth loop), alternated with each piece's two arm lengths and a Newton reparameterization. The
   arms are fit by σ-weighted least squares with the directions fixed and held to 0.02–1 chord (inkvec's admissible
   arms): a piece of a sample or two cannot place two arms by itself, and its free fit — a negative arm, or one several
   chords long — would otherwise swing the shared directions. The spline is held to the mode's band, narrowed on a clean
   edge: the refined samples' RMS residual about the DP's fit measures the edge's noise, and below half σ the band
   narrows with it, to half. A DP line that is a straight edge of the drawing — inside that band, no line beside it
   turning away, no neighbouring arc whose circle runs through its samples, no bow above the noise — stays a line, and a
   DP arc inside the band keeps its circle unless it meets such a line or another kept arc at a turn; both pin their
   knots' directions, so their neighbours meet them smoothly. An arc that gives up its circle becomes one cubic piece
   per quarter turn. A piece the spline cannot keep inside the band — or that throws a loop between two samples, carries
   an arm longer than its chord or turns past a quarter circle — is split at its worst sample, then climbs a fallback
   ladder: a lattice staircase step merges into a smooth neighbour, a long piece splits again (clear of its ends, so the
   step rule cannot merge the new knot back), then a pinned chord, free directions at its knots (a turn the corner rule
   let through becomes a corner), the chords through its samples; whatever still fails keeps the DP's own segments.
   Each repair is re-solved only within two pieces of it: the knot directions couple neighbours, and a solve reaching
   further moves admissible pieces out of the band for the next round to repair. Knots are then removed wherever the
   merged piece stays inside the band and the description length does not grow — the outer directions kept, or
   re-chosen by a free fit with the smooth neighbours refit to meet them — and the whole span is solved once more, kept
   when every piece stays inside the band and χ² does not grow. A cutout chain is refit once, like any span, so an edge
   two regions share stays one fit.

   The DP is kept browser-fast without changing what it draws. A span prices an
   arc or a cubic only when a curve could actually beat the pinned line — inkvec's
   O(1) description-length floor, `0.5·χ²_line > (params_cubic − params_line)·λ`
   — so a straight-enough run pays for no fit, and the cubic (a span's only
   point-to-curve scan) is fit only where no admissible arc already covers the
   run. A cubic's residual is read at each sample's chord-length parameter (its
   least-squares fit residual, a conservative bound on the true point-to-curve
   distance), not by a dense nearest-point scan. Because the DP scores `O(k²)`
   spans per ring and a high-resolution illustration carries far more boundary
   samples than an icon, the reach falls off with the image extent (full below
   700 px, then `∝ (700/extent)²` down to a floor): a large canvas is fit with a
   shorter window — the merge pass re-joins any run it split — while an icon keeps
   the full reach and its output is byte-for-byte unchanged.

`curveMode` short-circuits this: `polygon` stops after step 3 (emitting the adjusted polygon); `pixel` skips it entirely
for exact rectilinear paths.

The chain is exported in two halves, split where the curve settings first matter: **`ringPolygon(ring, field?)`** runs
steps 2-3 and returns a **`RingFit`** (the adjusted polygon for `polygon` mode and corner detection, the refined ring
geometry the run fitter samples with its per-point σ, and the segmentation vertex indices), or `null` for a ring too
short to carry one, or a pixel wide — its two sides lie inside the straightness tube of the same lines and the
least-squares vertices would draw them together, so a polygon enclosing under three quarters of the ring's lattice
area is refused and the ring is emitted as its exact lattice outline; it
depends on the ring and the optional field alone, while **`polygonToCommands(ring, fit, opts)`** runs steps 4-5 under
`smoothing`, `curveOptimize`, `optTolerance` and `cornerThreshold`. `closedPathToCommands` is the two composed;
`shapesFromPaths` takes the `RingFit`s for a whole path array as an optional argument. Holding them is what lets the
engine's `StageCache` replay a smoothing change without re-running the straightness DP.

## The boundary solve (`solve.ts`) — implemented, off the default path

`refineRingToField` decides each point on its own normal. A pixel's value is the coverage of _every_ boundary point
that touches it, so a point's neighbours change what that pixel should read, and a pixel says nothing about motion
_along_ the boundary — neither of which a per-point normal search can see. **`solveBoundary`** (inkvec stage 08
`boundary_opt::optimise`, `docs/REFERENCES.md`) solves a whole chain at once: the data term is the exact rendered
coverage the geometry would paint (each pixel clipped by the chain and closed along its border, a shoelace with an
analytic Jacobian through the gridline crossings), plus a kink term on second differences and an anchor to the refined
positions, minimized by Fletcher–Reeves conjugate gradient with a leashed line search and a self-crossing (fold) guard.
It runs per chain — the free points its only unknowns, pinned endpoints (cutout junctions) keeping the partition
seam-free by construction, a closed ring cyclic with the anchor holding it tangentially — so it is a pure, deterministic
function (fixed iteration cap, no clock) and a helper-parallel run stays byte-identical.

It is **verified correct** (a raw lattice disk ring solves onto the true circle to std 0.04 px, `solve.test.ts`) but is
**not on the default trace path**: measured on the inkvec corpus behind `refineRingToField`, it is net-neutral on GMSD
overall (0.0407 → ~0.041 at 512 px) while _regressing_ the angular mono families (Lucide, Material) and raising spurious
hue — the coverage-area objective is many-to-one, so on a straight or thin-stroke boundary it wanders the null space
into a sawtooth that renders almost identically and looks nothing like the shape (inkvec `boundary_opt.rs` documents the
same, and that a single global regularizer cannot serve both the smooth and the angular case). Separating the cases needs
either recommender routing or a thin-face centreline-plus-width model (inkvec LOG-44), both out of this change's scope.
`solveBoundary` is exported so it can be wired where that routing exists.

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
`traceLabelMap` is the three composed, and `fitChains` is `fitChain` over the whole network. A region no wider than a
pixel — a hairline stem, a one-pixel sliver of a rim between two fills — has every chain around it fitted onto the same
chord between the junction corners they share, so its fitted ring closes to no area; the assembly (regions and faces
alike) measures each ring against its lattice area and emits the exact lattice ring for one that keeps under half of
it, overlapping its neighbours' fits by the pixel it is wide rather than vanishing.

A `ChainFit` carries up to two forms of the same chain, because a region reaches a chain in one of two ways: `open` is
the forward run **without** a leading `M` (the form a ring splices in as it passes through), and a chain that returns to
its own start corner also carries `closed`, the complete `M…Z` ring a region uses when that chain **is** the whole ring.
A chain that closes on a junction can be both — its own ring for one region, one arc of a larger ring for another — so
both fits exist and the assembler picks by how it arrived. The reversed form of whichever it used is derived once and
shared, which is what makes the two neighbors' geometry identical rather than merely equal.

_Optional sub-pixel color refinement_ (`ColorField`): given the working image's RGBA bytes and the per-label palette RGB,
each shared chain is snapped onto the true anti-aliased edge between its two region colors before fitting — the pairwise
signed field (`refine.ts` `pairwiseField`) is zero where a pixel is the 50% mix of the two sides, the mix inverted in
encoded sRGB (`coverageOf`, the space a rasterizer blends in) rather than a perceptual space that would bend the mixing
line. The chain is refined **once** and reused by both neighbors, and junction endpoints stay pinned to the lattice, so
the seam-free guarantee holds. Straight junction-to-junction edges (no interior polygon vertex) are unaffected; loops and
curved chains carry the refinement. Omitting the field is byte-identical to the classical lattice trace.

_Nested faces_ (`assembleFaces`, for `nested` layering): the same network and chain fits, assembled into planar faces
instead of per-label regions. Each connected region contributes one face per **outer** ring; a labeled hole is dropped
(the child face painted over it in containment order repaints its area), while a hole bordering transparency is kept as
an even-odd cut. Faces record the face that contains them (geometric point-in-lattice-polygon), so the engine paints them
parents-first with children on top. A boundary between nested faces is therefore drawn **once** — as the child's outline
— and because that curve is the identical fit the parent would have drawn, the overpaint leaves no seam; same-color
sibling faces then merge into one even-odd path at emission (inkvec `emit_color`).

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
