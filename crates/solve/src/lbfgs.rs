//! The descent of the boundary solve: limited-memory BFGS with a Moré–Thuente line search
//! on the projected path, run separately on each independent part of the problem, and
//! stopped on the projected gradient and the relative decrease.
//!
//! A port of `packages/trace/src/solve/lbfgs.ts` (`lbfgsDescend` and its steps), which
//! documents the method: each point held in a disc of radius `max_total` round its start, a
//! pinned coordinate kept at its start; per part, (1) stop on the projected gradient, the
//! relative decrease, the iteration cap, a failed search or the spent budget, (2) the
//! two-loop direction projected onto the tangent cone of the active discs, (3) the step by
//! Moré–Thuente along the projected path, never moving a point more than `max_step`,
//! (4) the curvature pair stored when `yᵀs > 10⁻¹²·‖y‖·‖s‖`. Every loop runs in the
//! TypeScript's order and every expression keeps its order of operations.
//!
//! Sources: D. C. Liu, J. Nocedal (1989), "On the limited memory BFGS method for large
//! scale optimization", Math. Programming 45 (J. Nocedal, S. J. Wright 2006, "Numerical
//! Optimization", Algorithm 7.4); the stopping rule and the feasible search after R. H.
//! Byrd, P. Lu, J. Nocedal, C. Zhu (1995), "A limited memory algorithm for bound
//! constrained optimization", SIAM J. Sci. Comput. 16(5) (L-BFGS-B), for discs instead of
//! boxes.
//!
//! After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt/lbfgs.rs`.

use crate::band::Energy;
use crate::linesearch::{js_min, MoreThuente, Next};
use crate::{ld, mt, PIN_X, PIN_Y};

/// Steps remembered by the L-BFGS direction.
pub const MEMORY: usize = 3;
/// Iteration ceiling per independent part.
pub const MAX_ITERS: f64 = 64.0;
/// Stop a part once an iteration lowers the energy by less than this fraction of the whole
/// problem's changeable energy at the start.
pub const FUNC_TOL: f64 = 1e-7;
/// Stop a part once its projected gradient's largest point is at most this fraction of the
/// whole problem's largest gradient at the start.
pub const PG_TOL: f64 = 1e-6;

/// Curvature below which a pair is not stored, relative to `‖y‖·‖s‖`.
const CURVATURE_EPS: f64 = 1e-12;
/// Relative slack under which a point counts as on the edge of its disc.
const EDGE_EPS: f64 = 1e-9;
/// Largest point of a direction below which it is no direction at all.
const MIN_DIRECTION: f64 = 1e-12;

/// The descent's settings (`LbfgsOptions`, already resolved by the caller).
pub struct Options {
    pub max_total: f64,
    pub max_step: f64,
    /// Iteration cap per part, at most [`MAX_ITERS`].
    pub max_iters: f64,
    /// Iterations the whole descent may take (may be infinite).
    pub budget: f64,
    pub fixed_energy: f64,
    /// Record every accepted step (8 numbers each, as `LbfgsStep`).
    pub record: bool,
}

/// What the descent did (`LbfgsResult`, its positions in `pos`).
pub struct Outcome {
    pub before: f64,
    pub after: f64,
    pub iters: f64,
    pub evals: f64,
}

/// One remembered L-BFGS step: `s` the move, `y` the change of gradient, `rho = 1/yᵀs`.
struct Pair {
    s: Vec<f64>,
    y: Vec<f64>,
    rho: f64,
}

/// What every part's solve shares.
struct Context {
    pos: Vec<f64>,
    gfull: Vec<f64>,
    max_total: f64,
    max_step: f64,
    max_iters: f64,
    scale_f: f64,
    scale_pg: f64,
    budget: f64,
    evals: f64,
    record: bool,
}

/// The points of the part being solved and the buffers its iterations reuse.
struct Part {
    ids: Vec<u32>,
    start: Vec<f64>,
    pin: Vec<u8>,
    x: Vec<f64>,
    g: Vec<f64>,
    dir: Vec<f64>,
    trial: Vec<f64>,
    tg: Vec<f64>,
    best_x: Vec<f64>,
    best_g: Vec<f64>,
}

/// A point accepted by the line search: the energy there and the step.
struct Accepted {
    energy: f64,
    step: f64,
    trials: f64,
}

/// Minimize the band energy from `start` one independent part at a time, the solution
/// written into `pos_out`. Returns `None` when the energy did not fall or no part took a
/// step (`lbfgsDescend`). Accepted steps are appended to `steps` when recording.
pub fn descend(
    energy: &mut Energy,
    start: &[f64],
    pin: &[u8],
    opts: &Options,
    pos_out: &mut Vec<f64>,
    steps: &mut Vec<f64>,
) -> Option<Outcome> {
    let mut ctx = Context {
        pos: start.to_vec(),
        gfull: vec![0.0; start.len()],
        max_total: opts.max_total,
        max_step: opts.max_step,
        max_iters: js_min(opts.max_iters, MAX_ITERS),
        scale_f: 0.0,
        scale_pg: 0.0,
        budget: opts.budget,
        evals: 1.0,
        record: opts.record,
    };
    // The whole problem at the start, for the stopping tests' denominators.
    let e_all = energy.energy(&ctx.pos, &mut ctx.gfull, None);
    clear_pinned(&mut ctx.gfull, pin);
    let changeable = e_all - opts.fixed_energy;
    ctx.scale_f = if changeable > 1e-12 { changeable } else { 1e-12 };
    ctx.scale_pg = max_point_norm(&ctx.gfull);
    let parts = energy.parts;
    let mut before = 0.0;
    let mut after = 0.0;
    let mut iters = 0.0;
    // One part's buffers and the curvature pairs serve every part in turn.
    let most = (0..parts.count()).map(|k| parts.vars(k).len()).max().unwrap_or(0);
    let mut part = Part::with_capacity(most);
    let mut pool: Vec<Pair> = Vec::with_capacity(MEMORY + 1);
    for k in 0..parts.count() {
        part.load(parts.vars(k), start, pin, &ctx.pos);
        let (b, a, it) = solve_part(&mut ctx, energy, &mut part, k, &mut pool, steps);
        before += b;
        after += a;
        if it > iters {
            iters = it;
        }
    }
    pos_out.clear();
    pos_out.extend_from_slice(&ctx.pos);
    if after >= before || iters == 0.0 {
        return None;
    }
    Some(Outcome { before, after, iters, evals: ctx.evals })
}

impl Part {
    /// Buffers for parts of up to `most` points.
    fn with_capacity(most: usize) -> Part {
        let f = || Vec::with_capacity(2 * most);
        Part {
            ids: Vec::with_capacity(most),
            start: f(),
            pin: Vec::with_capacity(most),
            x: f(),
            g: f(),
            dir: f(),
            trial: f(),
            tg: f(),
            best_x: f(),
            best_g: f(),
        }
    }

    /// Gather the part whose points are `vars` (`lbfgs.ts`'s `Part` constructor): their
    /// starts, pins and current positions; the trial and the best trial at the current
    /// point, every gradient and the direction zero.
    fn load(&mut self, vars: &[i32], start: &[f64], pin: &[u8], pos: &[f64]) {
        let m = vars.len();
        self.ids.clear();
        self.ids.extend(vars.iter().map(|&v| v as u32));
        self.pin.clear();
        self.pin.extend(vars.iter().map(|&v| pin[v as usize]));
        for buf in [&mut self.start, &mut self.x, &mut self.g, &mut self.dir, &mut self.tg, &mut self.best_g] {
            buf.clear();
            buf.resize(2 * m, 0.0);
        }
        for (i, &v) in vars.iter().enumerate() {
            let v = v as usize;
            self.start[2 * i] = start[2 * v];
            self.start[2 * i + 1] = start[2 * v + 1];
            self.x[2 * i] = pos[2 * v];
            self.x[2 * i + 1] = pos[2 * v + 1];
        }
        self.trial.clear();
        self.trial.extend_from_slice(&self.x);
        self.best_x.clear();
        self.best_x.extend_from_slice(&self.x);
    }
}

/// A pair for a part of `len` coordinates, from `pool` when it holds one.
fn take_pair(pool: &mut Vec<Pair>, len: usize, most: usize) -> Pair {
    match pool.pop() {
        Some(mut p) => {
            p.s.resize(len, 0.0);
            p.y.resize(len, 0.0);
            p
        }
        None => {
            let mut p = Pair { s: Vec::with_capacity(most), y: Vec::with_capacity(most), rho: 0.0 };
            p.s.resize(len, 0.0);
            p.y.resize(len, 0.0);
            p
        }
    }
}

/// The energy with the part's points at `at`, with the part's share of the gradient
/// gathered into `g`, zero along a pinned coordinate (`Part.evaluate`).
fn evaluate(
    ctx: &mut Context,
    energy: &mut Energy,
    ids: &[u32],
    pin: &[u8],
    index: usize,
    at: &[f64],
    g: &mut [f64],
) -> f64 {
    for (i, &v) in ids.iter().enumerate() {
        let v = v as usize;
        *mt(&mut ctx.pos, 2 * v) = ld(at, 2 * i);
        *mt(&mut ctx.pos, 2 * v + 1) = ld(at, 2 * i + 1);
    }
    let e = energy.energy(&ctx.pos, &mut ctx.gfull, Some(index));
    ctx.evals += 1.0;
    for (i, &v) in ids.iter().enumerate() {
        let v = v as usize;
        let p = ld(pin, i);
        *mt(g, 2 * i) = if p & PIN_X != 0 { 0.0 } else { ld(&ctx.gfull, 2 * v) };
        *mt(g, 2 * i + 1) = if p & PIN_Y != 0 { 0.0 } else { ld(&ctx.gfull, 2 * v + 1) };
    }
    e
}

/// L-BFGS on one part for at most `ctx.max_iters` iterations, its solution written into
/// `ctx.pos`. Returns its energy before and after and the iterations taken.
fn solve_part(
    ctx: &mut Context,
    energy: &mut Energy,
    part: &mut Part,
    index: usize,
    pool: &mut Vec<Pair>,
    steps: &mut Vec<f64>,
) -> (f64, f64, f64) {
    let mut e = {
        let Part { ids, pin, x, g, .. } = part;
        evaluate(ctx, energy, ids, pin, index, x, g)
    };
    let e0 = e;
    let len = part.x.len();
    let most = part.x.capacity();
    let mut mem: Vec<Pair> = Vec::with_capacity(MEMORY);
    // `pool` holds the pairs no memory holds, reused before any new one is made.
    let mut spare = take_pair(pool, len, most);
    let mut done = 0.0;
    let mut it = 0.0;
    while it < ctx.max_iters {
        if ctx.budget <= 0.0 {
            break;
        }
        // Step 1: the projected gradient is (relatively) zero.
        let pg = projected_gradient_norm(&part.start, &part.x, &part.g, ctx.max_total);
        if pg <= PG_TOL * ctx.scale_pg {
            break;
        }
        // Step 2: the direction, kept inside the tangent cone of the active discs.
        let gd = descent_direction(&part.g, &mut mem, pool, &part.start, &part.x, &mut part.dir, ctx.max_total);
        let dmax = max_point_norm(&part.dir);
        if !(dmax >= MIN_DIRECTION && gd < 0.0) {
            break;
        }
        // Step 3: the unit quasi-Newton step, or on the first iteration a move of
        // max_step; never more than max_step for the furthest point.
        let amax = ctx.max_step / dmax;
        let a0 = if it == 0.0 { amax } else { js_min(amax, 1.0) };
        let found = match search(ctx, energy, part, index, e, gd, a0, amax) {
            Some(f) => f,
            None => break,
        };
        let rel = (e - found.energy) / ctx.scale_f;
        if ctx.record {
            steps.extend_from_slice(&[
                index as f64,
                it,
                found.step,
                found.trials,
                found.energy,
                rel,
                max_point_distance(&part.x, &part.trial),
                pg,
            ]);
        }
        // Step 4: the curvature pair, then the step is taken.
        let keep = curvature_pair(&part.x, &part.trial, &part.g, &part.tg, &mut spare);
        std::mem::swap(&mut part.x, &mut part.trial);
        std::mem::swap(&mut part.g, &mut part.tg);
        e = found.energy;
        done = it + 1.0;
        ctx.budget -= 1.0;
        if rel < FUNC_TOL {
            break;
        }
        if keep {
            let evicted = if mem.len() == MEMORY { Some(mem.remove(0)) } else { None };
            mem.push(spare);
            spare = match evicted {
                Some(p) => p,
                None => take_pair(pool, len, most),
            };
        }
        it += 1.0;
    }
    for (i, &v) in part.ids.iter().enumerate() {
        let v = v as usize;
        ctx.pos[2 * v] = part.x[2 * i];
        ctx.pos[2 * v + 1] = part.x[2 * i + 1];
    }
    pool.append(&mut mem);
    pool.push(spare);
    (e0, e, done)
}

/// Step 3: the Moré–Thuente search along the projected path from `x` along `dir`
/// (`Part.search`). On success `trial` and `tg` hold the accepted point and its gradient.
#[allow(clippy::too_many_arguments)]
fn search(
    ctx: &mut Context,
    energy: &mut Energy,
    part: &mut Part,
    index: usize,
    e: f64,
    gd: f64,
    a0: f64,
    amax: f64,
) -> Option<Accepted> {
    let mut ls = MoreThuente::new(e, gd, a0, amax);
    let mut best_a = f64::NAN;
    let mut a;
    let mut et;
    let mut next;
    loop {
        a = ls.stp();
        project_path(&part.start, &part.pin, &part.x, &part.dir, a, ctx.max_total, &mut part.trial);
        et = {
            let Part { ids, pin, trial, tg, .. } = &mut *part;
            evaluate(ctx, energy, ids, pin, index, trial, tg)
        };
        let slope = path_slope(&part.start, &part.x, &part.dir, a, &part.tg, ctx.max_total);
        next = ls.update(et, slope);
        if let Some(best) = ls.best() {
            if best.step == a && best_a != a {
                best_a = a;
                part.best_x.copy_from_slice(&part.trial);
                part.best_g.copy_from_slice(&part.tg);
            }
        }
        if next != Next::Eval {
            break;
        }
    }
    if next == Next::Converged {
        return Some(Accepted { energy: et, step: a, trials: ls.evals() as f64 });
    }
    let best = ls.best()?;
    if best.step != a {
        part.trial.copy_from_slice(&part.best_x);
        part.tg.copy_from_slice(&part.best_g);
    }
    Some(Accepted { energy: best.value, step: best.step, trials: ls.evals() as f64 })
}

/// Step 2: the L-BFGS direction projected onto the tangent cone of the active discs; when
/// that is not downhill, the memory is cleared (its pairs go to `pool`) and the projected
/// steepest descent taken instead. Returns `gᵀd`.
fn descent_direction(
    g: &[f64],
    mem: &mut Vec<Pair>,
    pool: &mut Vec<Pair>,
    start: &[f64],
    x: &[f64],
    dir: &mut [f64],
    max_total: f64,
) -> f64 {
    lbfgs_direction(g, mem, dir);
    tangent_cone(start, x, dir, max_total);
    let mut gd = dot(g, dir);
    if gd >= 0.0 {
        pool.append(mem);
        lbfgs_direction(g, mem, dir);
        tangent_cone(start, x, dir, max_total);
        gd = dot(g, dir);
    }
    gd
}

/// The L-BFGS two-loop recursion (Nocedal & Wright Algorithm 7.4): `dir = −H·g`, scaled
/// initially by `γ = sᵀy / yᵀy` of the newest pair; `mem` runs oldest first.
fn lbfgs_direction(g: &[f64], mem: &[Pair], dir: &mut [f64]) {
    let m = mem.len();
    let mut alphas = [0.0f64; MEMORY];
    dir.copy_from_slice(g);
    let len = dir.len();
    for i in (0..m).rev() {
        let Pair { s, y, rho } = &mem[i];
        let a = rho * dot(s, dir);
        alphas[i] = a;
        for k in 0..len {
            *mt(dir, k) -= a * ld(y, k);
        }
    }
    let mut gamma = 1.0;
    if m > 0 {
        let Pair { s, y, .. } = &mem[m - 1];
        let yy = dot(y, y);
        gamma = dot(s, y) / (if yy > 1e-300 { yy } else { 1e-300 });
    }
    for v in dir.iter_mut() {
        *v *= gamma;
    }
    for i in 0..m {
        let Pair { s, y, rho } = &mem[i];
        let b = rho * dot(y, dir);
        let c = alphas[i] - b;
        for k in 0..len {
            *mt(dir, k) += c * ld(s, k);
        }
    }
    for v in dir.iter_mut() {
        *v = -*v;
    }
}

/// Step 4: the pair of the step from `x` to `trial` into `into`; whether its curvature
/// `yᵀs` exceeds `10⁻¹²·‖y‖·‖s‖`.
fn curvature_pair(x: &[f64], trial: &[f64], g: &[f64], tg: &[f64], into: &mut Pair) -> bool {
    for k in 0..x.len() {
        *mt(&mut into.s, k) = ld(trial, k) - ld(x, k);
        *mt(&mut into.y, k) = ld(tg, k) - ld(g, k);
    }
    let ys = dot(&into.y, &into.s);
    if !(ys > CURVATURE_EPS * dot(&into.y, &into.y).sqrt() * dot(&into.s, &into.s).sqrt()) {
        return false;
    }
    into.rho = 1.0 / ys;
    true
}

/// Remove from each point's direction the outward normal component at a point on the edge
/// of its disc: the projection onto the tangent cone (Nocedal & Wright §16.7).
fn tangent_cone(start: &[f64], x: &[f64], dir: &mut [f64], max_total: f64) {
    let edge = max_total * (1.0 - EDGE_EPS);
    let mut k = 0;
    while k < x.len() {
        let dx = x[k] - start[k];
        let dy = x[k + 1] - start[k + 1];
        let r = (dx * dx + dy * dy).sqrt();
        if r >= edge {
            let ux = dx / r;
            let uy = dy / r;
            let out = ux * dir[k] + uy * dir[k + 1];
            if out > 0.0 {
                dir[k] -= out * ux;
                dir[k + 1] -= out * uy;
            }
        }
        k += 2;
    }
}

/// The largest point of the projected gradient (Byrd et al. 1995 §6, for discs).
fn projected_gradient_norm(start: &[f64], x: &[f64], g: &[f64], max_total: f64) -> f64 {
    let edge = max_total * (1.0 - EDGE_EPS);
    let mut worst = 0.0;
    let mut k = 0;
    while k < x.len() {
        let mut gx = g[k];
        let mut gy = g[k + 1];
        let dx = x[k] - start[k];
        let dy = x[k + 1] - start[k + 1];
        let r = (dx * dx + dy * dy).sqrt();
        if r >= edge {
            let ux = dx / r;
            let uy = dy / r;
            let gu = gx * ux + gy * uy;
            if gu < 0.0 {
                gx -= gu * ux;
                gy -= gu * uy;
            }
        }
        let norm = (gx * gx + gy * gy).sqrt();
        if norm > worst {
            worst = norm;
        }
        k += 2;
    }
    worst
}

/// `φ'(a)`, the slope of the objective along the projected path at `a`, from the gradient
/// `g` there: the exact one-sided derivative of the path [`project_path`] evaluates.
fn path_slope(start: &[f64], x: &[f64], dir: &[f64], a: f64, g: &[f64], max_total: f64) -> f64 {
    let mut slope = 0.0;
    let mut k = 0;
    while k < x.len() {
        let dx = x[k] + dir[k] * a - start[k];
        let dy = x[k + 1] + dir[k + 1] * a - start[k + 1];
        let r = (dx * dx + dy * dy).sqrt();
        let mut px = dir[k];
        let mut py = dir[k + 1];
        if r > max_total {
            let ux = dx / r;
            let uy = dy / r;
            let ud = ux * px + uy * py;
            let shrink = max_total / r;
            px = shrink * (px - ud * ux);
            py = shrink * (py - ud * uy);
        }
        slope += g[k] * px + g[k + 1] * py;
        k += 2;
    }
    slope
}

/// The projected path at `a`: `x + a·dir` into `out`, each point kept within `max_total`
/// of its start and at its start along a pinned coordinate.
fn project_path(start: &[f64], pin: &[u8], x: &[f64], dir: &[f64], a: f64, max_total: f64, out: &mut [f64]) {
    let mut k = 0;
    let mut v = 0;
    while k < x.len() {
        let mut qx = x[k] + dir[k] * a;
        let mut qy = x[k + 1] + dir[k + 1] * a;
        let dx = qx - start[k];
        let dy = qy - start[k + 1];
        let d = (dx * dx + dy * dy).sqrt();
        if d > max_total {
            let s = max_total / d;
            qx = start[k] + dx * s;
            qy = start[k + 1] + dy * s;
        }
        if pin[v] & PIN_X != 0 {
            qx = start[k];
        }
        if pin[v] & PIN_Y != 0 {
            qy = start[k + 1];
        }
        out[k] = qx;
        out[k + 1] = qy;
        k += 2;
        v += 1;
    }
}

/// `Σ_v a_v · b_v` over interleaved points, summed point by point (each point's two
/// products in one pair of lanes, added in order).
fn dot(a: &[f64], b: &[f64]) -> f64 {
    use core::arch::wasm32::*;
    debug_assert!(a.len() <= b.len() && a.len().is_multiple_of(2));
    let mut sum = 0.0;
    let mut k = 0;
    while k < a.len() {
        // SAFETY: `k + 1 < a.len() <= b.len()`.
        let p = unsafe {
            f64x2_mul(v128_load(a.as_ptr().add(k) as *const v128), v128_load(b.as_ptr().add(k) as *const v128))
        };
        sum += f64x2_extract_lane::<0>(p) + f64x2_extract_lane::<1>(p);
        k += 2;
    }
    sum
}

/// The largest point norm `max_v |a_v|` (0 for none; a NaN point is skipped).
fn max_point_norm(a: &[f64]) -> f64 {
    let mut worst = 0.0;
    let mut k = 0;
    while k < a.len() {
        let norm = (a[k] * a[k] + a[k + 1] * a[k + 1]).sqrt();
        if norm > worst {
            worst = norm;
        }
        k += 2;
    }
    worst
}

/// The largest distance between corresponding points of `a` and `b`.
fn max_point_distance(a: &[f64], b: &[f64]) -> f64 {
    let mut worst = 0.0;
    let mut k = 0;
    while k < a.len() {
        let dx = a[k] - b[k];
        let dy = a[k + 1] - b[k + 1];
        let d = (dx * dx + dy * dy).sqrt();
        if d > worst {
            worst = d;
        }
        k += 2;
    }
    worst
}

/// Zero the gradient along every pinned coordinate.
fn clear_pinned(g: &mut [f64], pin: &[u8]) {
    for v in 0..g.len() >> 1 {
        if pin[v] & PIN_X != 0 {
            g[2 * v] = 0.0;
        }
        if pin[v] & PIN_Y != 0 {
            g[2 * v + 1] = 0.0;
        }
    }
}
