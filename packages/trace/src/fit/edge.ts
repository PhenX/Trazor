/**
 * The fit stage's entry point: every edge of a planar map fitted once, so both
 * faces it separates reference the same description and no seam can open
 * between them.
 *
 * Per edge (inkvec `fit_boundaries`): the edge's own exchange rate (`λ` times
 * its scale, when the caller gives one), then the curve-or-primitive choice
 * (`./choice`, `describe`) between the dynamic program's path (`./multimodel`,
 * with the shipping post-fit passes of `./merge`) and the primitive search.
 * The image frame tries its rectangle first. An open edge runs exactly from
 * its start node's position to its end node's; a closed edge may come back as
 * a whole primitive (circle, ellipse, rectangle or rounded rectangle) with its
 * path form. An edge's points and σ are taken as they are: the caller states
 * them, and the {@link FitConfig}, in the units the fit should price (content
 * units on a supersampled image).
 *
 * The post-fit passes ({@link shippingPostFit}) run where inkvec runs
 * `post_fit_passes`: inside the program, on the centered (and, above
 * `DP_MAX_POINTS`, decimated) polyline it solved, on every free fit and every
 * pinned fit without a span cap, keeping the pins; never under a span cap. The
 * free-cubic merge and the corner sharpening ship; the research snaps do not.
 *
 * Coordinates are px, y down, lattice corners on integers.
 *
 * After inkvec (Apache-2.0): `inkvec-cli/src/pipeline.rs` (`fit_boundaries`,
 * `scaled`) and `inkvec-fit/src/multimodel.rs` (`post_fit_passes`).
 */
import type { FitConfig, FittedEdge, PlanarEdge, PlanarMap } from '../planar/types'
import { describe, liesOnFrame } from './choice'
import { Limits } from './limits'
import { runPostFitPasses } from './merge'
import { fitPolyline } from './multimodel'
import type { PostFitPass } from './multimodel'
import { polylineSize } from './objective'
import type { FitPath, Polyline } from './objective'

/**
 * The shipping post-fit passes as the program's hook: the free-cubic merge and
 * the corner sharpening (`runPostFitPasses`, research snaps off) on a copy of
 * the program's path, keeping `keep` (the pins of an uncapped, pinned refit).
 * A closed polyline is handed to the passes opened at the program's cut
 * (`vertices[0]`, which is also its last vertex), its `n + 1` points running
 * from the cut round to it again, so every run of segments the path holds is a
 * run of ascending point indices; the path is marked closed while they run, so
 * the sharpening treats it as a ring. The input path is not modified.
 */
export const shippingPostFit: PostFitPass = (path, poly, vertices, cfg, keep) => {
  const out: FitPath = {
    x0: path.x0,
    y0: path.y0,
    segments: path.segments.slice(),
    closed: poly.closed,
  }
  const last = vertices.length - 1
  if (poly.closed && last >= 1 && vertices[0] === vertices[last]) {
    const n = polylineSize(poly)
    const cut = vertices[0]
    const opened = openedAt(poly, cut)
    const verts = vertices.map((v, k) => (k === last ? n : (v - cut + n) % n))
    const kept = (keep ?? [])
      .map((f) => (f - cut + n) % n)
      .filter((f) => f > 0)
      .toSorted((a, b) => a - b)
    runPostFitPasses(out, opened, verts, cfg, { keep: kept })
  } else {
    runPostFitPasses(out, poly, vertices.slice(), cfg, { keep: keep ?? [] })
  }
  out.closed = path.closed
  return out
}

/** A closed polyline as an open run of `n + 1` points from `cut` round to `cut` again. */
function openedAt(poly: Polyline, cut: number): Polyline {
  const n = polylineSize(poly)
  const points = new Float64Array(2 * (n + 1))
  const sigma = new Float64Array(n + 1)
  for (let k = 0; k <= n; k++) {
    const i = (cut + k) % n
    points[2 * k] = poly.points[2 * i]
    points[2 * k + 1] = poly.points[2 * i + 1]
    sigma[k] = poly.sigma[i]
  }
  return { points, sigma, closed: false }
}

/** Options of {@link fitEdge}. */
export interface FitEdgeOptions {
  /**
   * Point indices of the edge that must be segment ends (the crossing repair's
   * pins). A pinned edge is fitted as a curve only: a whole primitive keeps no
   * vertex. An open edge's two ends are segment ends already.
   */
  forced?: readonly number[]
  /** This edge's multiplier on `λ`, 1 by default (inkvec's per-edge `lambda_scale`). */
  lambdaScale?: number
}

/**
 * The edge's points with its first and last at its nodes' positions: the
 * edge's own array when they are there already (or it has no nodes),
 * otherwise a copy.
 */
export function pointsAtNodes(map: PlanarMap, e: PlanarEdge): Float64Array {
  const p = e.points
  const m = p.length
  const s = map.nodes[e.start]
  const t = map.nodes[e.end]
  if (!s || !t || m < 2) return p
  if (p[0] === s.x && p[1] === s.y && p[m - 2] === t.x && p[m - 1] === t.y) return p
  const out = p.slice()
  out[0] = s.x
  out[1] = s.y
  out[m - 2] = t.x
  out[m - 1] = t.y
  return out
}

/** `cfg` with its `λ` multiplied by `scale`: one edge's own exchange rate. */
function scaled(cfg: FitConfig, scale: number): FitConfig {
  return scale === 1 ? cfg : { tau: cfg.tau, lambda: cfg.lambda * scale }
}

/**
 * Fit edge `edgeIndex` of `map`: the dynamic program's curve (with the
 * shipping post-fit passes), or the primitive search's offer when that is
 * strictly cheaper (`describe`), the image frame's rectangle tried first. An
 * open edge runs exactly from its start node's position to its end node's
 * (those positions replace its first and last points if they differ); a closed
 * edge returns to its start, or comes back as a whole primitive and its path
 * form. With `forced` the program keeps those vertices and no primitive is
 * considered.
 */
export function fitEdge(
  map: PlanarMap,
  edgeIndex: number,
  cfg: FitConfig,
  opts: FitEdgeOptions = {},
): FittedEdge {
  const e = map.edges[edgeIndex]
  const cfgK = scaled(cfg, opts.lambdaScale ?? 1)
  const points = e.closed ? e.points : pointsAtNodes(map, e)
  const forced = opts.forced ?? []
  const fit = (): FittedEdge =>
    fitPolyline(points, e.sigma, e.closed, cfgK, { forced, postFit: shippingPostFit })
  if (Limits.pinned(points.length >> 1, e.closed, Infinity, forced).forced.length > 0) {
    return fit()
  }
  const frame = e.closed && liesOnFrame(points, map.width, map.height)
  return describe(points, e.sigma, e.closed, cfgK, frame, fit)
}

/** Options of {@link fitEdges}. */
export interface FitEdgesOptions {
  /** Each edge's multiplier on `λ`, by edge index; 1 for every edge by default. */
  lambdaScales?: ArrayLike<number>
}

/** Every edge of `map` fitted by {@link fitEdge}, by edge index. */
export function fitEdges(map: PlanarMap, cfg: FitConfig, opts: FitEdgesOptions = {}): FittedEdge[] {
  const scales = opts.lambdaScales
  return map.edges.map((_, k) => fitEdge(map, k, cfg, { lambdaScale: scales ? scales[k] : 1 }))
}

/**
 * An arbitrary open run of points (interleaved, px) with per-point `sigma`
 * (px) fitted as a curve whose ends are pinned exactly at the run's first and
 * last points: the dynamic program with the shipping post-fit passes, no
 * primitive (a stacked layer's set-back edge).
 */
export function fitRun(points: Float64Array, sigma: Float64Array, cfg: FitConfig): FittedEdge {
  return fitPolyline(points, sigma, false, cfg, { postFit: shippingPostFit })
}
