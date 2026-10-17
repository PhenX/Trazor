//! The step length of one L-BFGS iteration: the Moré–Thuente line search, which finds a
//! step satisfying the strong Wolfe conditions by safeguarded cubic and quadratic
//! interpolation.
//!
//! A line-for-line port of `packages/trace/src/solve/linesearch.ts`, which documents the
//! method and its adaptations to the boundary solve (the trial cap, the largest step, the
//! piecewise-smooth objective, no extra evaluation at the end); every expression keeps the
//! TypeScript's order of operations, so both compute the same steps.
//!
//! Method: J. J. Moré, D. J. Thuente (1994), "Line search algorithms with guaranteed
//! sufficient decrease", ACM TOMS 20(3):286–307, Algorithm 1 with the safeguarded step of
//! §4, as in their MINPACK-2 routines `dcsrch` and `dcstep`.
//!
//! After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt/linesearch.rs`.

/// The sufficient-decrease constant `μ`.
pub const FTOL: f64 = 1e-4;
/// The curvature constant `η`.
pub const GTOL: f64 = 0.9;
/// Relative width of the interval of uncertainty below which the search stops.
pub const XTOL: f64 = 0.1;
/// Most trials one search may take.
pub const MAX_EVALS: u32 = 10;
/// Extrapolation window before a bracket exists.
pub const XTRAPL: f64 = 1.1;
pub const XTRAPU: f64 = 4.0;
/// Required shrink of a bracketing interval over two trials, else bisect.
pub const SHRINK: f64 = 0.66;

/// What [`MoreThuente::update`] asks for next.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Next {
    Eval,
    Converged,
    Stop,
}

/// A step of sufficient decrease and the value `φ` there.
#[derive(Clone, Copy)]
pub struct Best {
    pub step: f64,
    pub value: f64,
}

/// The interval of uncertainty [`cstep`] updates in place.
struct Interval {
    stx: f64,
    fx: f64,
    dx: f64,
    sty: f64,
    fy: f64,
    dy: f64,
    brackt: bool,
}

/// One Moré–Thuente search (the saved state of MINPACK-2's `dcsrch`).
pub struct MoreThuente {
    next: f64,
    finit: f64,
    ginit: f64,
    gtest: f64,
    stage1: bool,
    iv: Interval,
    stmin: f64,
    stmax: f64,
    width: f64,
    width1: f64,
    stpmin: f64,
    stpmax: f64,
    count: u32,
    best: Option<Best>,
}

impl MoreThuente {
    /// A search from `φ(0) = f0` with slope `φ'(0) = g0 < 0`, first trying `stp`, never
    /// stepping beyond `stpmax`; `stp` is clamped into `[0, stpmax]`.
    pub fn new(f0: f64, g0: f64, stp: f64, stpmax: f64) -> MoreThuente {
        let first = max_num(min_num(stp, stpmax), 0.0);
        MoreThuente {
            next: first,
            finit: f0,
            ginit: g0,
            gtest: FTOL * g0,
            stage1: true,
            iv: Interval { stx: 0.0, fx: f0, dx: g0, sty: 0.0, fy: f0, dy: g0, brackt: false },
            stmin: 0.0,
            stmax: first + XTRAPU * first,
            width: stpmax,
            width1: 2.0 * stpmax,
            stpmin: 0.0,
            stpmax,
            count: 0,
            best: None,
        }
    }

    /// The trial step to evaluate.
    pub fn stp(&self) -> f64 {
        self.next
    }

    /// The best step evaluated that satisfies sufficient decrease, and `φ` there.
    pub fn best(&self) -> Option<Best> {
        self.best
    }

    /// Trials evaluated so far.
    pub fn evals(&self) -> u32 {
        self.count
    }

    /// Hand in `φ(stp) = f` and `φ'(stp) = g` for the step last asked for, and get what to
    /// do next: `dcsrch`'s body between two evaluations.
    pub fn update(&mut self, f: f64, g: f64) -> Next {
        self.count += 1;
        let stp = self.next;
        let ftest = self.finit + stp * self.gtest;
        let f = if f.is_finite() { f } else { f64::INFINITY };
        let g = if g.is_finite() { g } else { 0.0 };
        if f <= ftest && self.best.is_none_or(|b| f < b.value) {
            self.best = Some(Best { step: stp, value: f });
        }
        if self.stage1 && f <= ftest && g >= 0.0 {
            self.stage1 = false;
        }
        if self.iv.brackt && (stp <= self.stmin || stp >= self.stmax) {
            return Next::Stop;
        }
        if self.iv.brackt && self.stmax - self.stmin <= XTOL * self.stmax {
            return Next::Stop;
        }
        if stp >= self.stpmax && f <= ftest && g <= self.gtest {
            return Next::Stop;
        }
        if stp <= self.stpmin && (f > ftest || g >= self.gtest) {
            return Next::Stop;
        }
        if f <= ftest && g.abs() <= GTOL * -self.ginit {
            return Next::Converged;
        }
        if self.count >= MAX_EVALS {
            return Next::Stop;
        }
        let mut next;
        if self.stage1 && f <= self.iv.fx && f > ftest {
            let gt = self.gtest;
            let iv = &mut self.iv;
            iv.fx -= iv.stx * gt;
            iv.fy -= iv.sty * gt;
            iv.dx -= gt;
            iv.dy -= gt;
            next = cstep(iv, stp, f - stp * gt, g - gt, self.stmin, self.stmax);
            iv.fx += iv.stx * gt;
            iv.fy += iv.sty * gt;
            iv.dx += gt;
            iv.dy += gt;
        } else {
            next = cstep(&mut self.iv, stp, f, g, self.stmin, self.stmax);
        }
        let iv = &self.iv;
        if iv.brackt {
            if (iv.sty - iv.stx).abs() >= SHRINK * self.width1 {
                next = iv.stx + 0.5 * (iv.sty - iv.stx);
            }
            self.width1 = self.width;
            self.width = (iv.sty - iv.stx).abs();
        }
        if iv.brackt {
            self.stmin = js_min(iv.stx, iv.sty);
            self.stmax = js_max(iv.stx, iv.sty);
        } else {
            self.stmin = next + XTRAPL * (next - iv.stx);
            self.stmax = next + XTRAPU * (next - iv.stx);
        }
        next = min_num(max_num(next, self.stpmin), self.stpmax);
        self.next = next;
        if (iv.brackt && (next <= self.stmin || next >= self.stmax))
            || (iv.brackt && self.stmax - self.stmin <= XTOL * self.stmax)
        {
            return Next::Stop;
        }
        Next::Eval
    }
}

/// The safeguarded step of Moré & Thuente §4 (MINPACK-2 `dcstep`): choose the next trial
/// and update the interval in place. Returns the next trial, kept finite.
fn cstep(iv: &mut Interval, stp: f64, fp: f64, dp: f64, stpmin: f64, stpmax: f64) -> f64 {
    let (stx, fx, dx) = (iv.stx, iv.fx, iv.dx);
    let sgnd = dp * (dx / dx.abs());
    let mut stpf = next_trial(iv, stp, fp, dp, stpmin, stpmax);
    let brackt = iv.brackt || fp > fx || sgnd < 0.0;
    if fp > fx {
        iv.sty = stp;
        iv.fy = fp;
        iv.dy = dp;
    } else {
        if sgnd < 0.0 {
            iv.sty = stx;
            iv.fy = fx;
            iv.dy = dx;
        }
        iv.stx = stp;
        iv.fx = fp;
        iv.dx = dp;
    }
    iv.brackt = brackt;
    if !stpf.is_finite() {
        stpf = if brackt { 0.5 * (iv.stx + iv.sty) } else { stpmax };
    }
    stpf
}

/// The next trial of [`cstep`], from the interval before its update (the four cases of
/// `linesearch.ts`'s `nextTrial`).
fn next_trial(iv: &Interval, stp: f64, fp: f64, dp: f64, stpmin: f64, stpmax: f64) -> f64 {
    let (stx, fx, dx, sty, fy, dy, brackt) = (iv.stx, iv.fx, iv.dx, iv.sty, iv.fy, iv.dy, iv.brackt);
    let sgnd = dp * (dx / dx.abs());
    if fp > fx {
        // Case 1.
        let theta = (3.0 * (fx - fp)) / (stp - stx) + dx + dp;
        let g = cubic_gamma(theta, dx, dp);
        let gamma = if stp < stx { -g } else { g };
        let r = (gamma - dx + theta) / (gamma - dx + gamma + dp);
        let stpc = stx + r * (stp - stx);
        let stpq = stx + (dx / ((fx - fp) / (stp - stx) + dx) / 2.0) * (stp - stx);
        return if (stpc - stx).abs() < (stpq - stx).abs() { stpc } else { stpc + (stpq - stpc) / 2.0 };
    }
    if sgnd < 0.0 {
        // Case 2.
        let theta = (3.0 * (fx - fp)) / (stp - stx) + dx + dp;
        let g = cubic_gamma(theta, dx, dp);
        let gamma = if stp > stx { -g } else { g };
        let r = (gamma - dp + theta) / (gamma - dp + gamma + dx);
        let stpc = stp + r * (stx - stp);
        let stpq = stp + (dp / (dp - dx)) * (stx - stp);
        return if (stpc - stp).abs() > (stpq - stp).abs() { stpc } else { stpq };
    }
    if dp.abs() < dx.abs() {
        // Case 3.
        let theta = (3.0 * (fx - fp)) / (stp - stx) + dx + dp;
        let g = cubic_gamma(theta, dx, dp);
        let gamma = if stp > stx { -g } else { g };
        let r = (gamma - dp + theta) / (gamma + (dx - dp) + gamma);
        let stpc = if r < 0.0 && gamma != 0.0 {
            stp + r * (stx - stp)
        } else if stp > stx {
            stpmax
        } else {
            stpmin
        };
        let stpq = stp + (dp / (dp - dx)) * (stx - stp);
        if brackt {
            let pick = if (stpc - stp).abs() < (stpq - stp).abs() { stpc } else { stpq };
            let limit = stp + SHRINK * (sty - stp);
            return if stp > stx { min_num(pick, limit) } else { max_num(pick, limit) };
        }
        let pick = if (stpc - stp).abs() > (stpq - stp).abs() { stpc } else { stpq };
        return max_num(min_num(pick, stpmax), stpmin);
    }
    if brackt {
        // Case 4, bracketed.
        let theta = (3.0 * (fp - fy)) / (sty - stp) + dp + dy;
        let g = cubic_gamma(theta, dp, dy);
        let gamma = if stp > sty { -g } else { g };
        let r = (gamma - dp + theta) / (gamma - dp + gamma + dy);
        return stp + r * (sty - stp);
    }
    // Case 4, not bracketed.
    if stp > stx {
        stpmax
    } else {
        stpmin
    }
}

/// `|γ| = sqrt(θ² − da·db)` scaled against overflow, the radicand clamped at zero.
fn cubic_gamma(theta: f64, da: f64, db: f64) -> f64 {
    let s = max_num(max_num(theta.abs(), da.abs()), db.abs());
    let t = theta / s;
    let rad = t * t - (da / s) * (db / s);
    s * (if rad > 0.0 { rad } else { 0.0 }).sqrt()
}

/// The larger of two numbers, ignoring a NaN (IEEE 754 `maxNum`, as `linesearch.ts`).
pub fn max_num(a: f64, b: f64) -> f64 {
    if a.is_nan() {
        return b;
    }
    if b.is_nan() {
        return a;
    }
    if a > b {
        a
    } else {
        b
    }
}

/// The smaller of two numbers, ignoring a NaN (IEEE 754 `minNum`, as `linesearch.ts`).
pub fn min_num(a: f64, b: f64) -> f64 {
    if a.is_nan() {
        return b;
    }
    if b.is_nan() {
        return a;
    }
    if a < b {
        a
    } else {
        b
    }
}

/// ECMAScript `Math.min` of two numbers: NaN when either is, −0 below +0.
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a < b {
        return a;
    }
    if b < a {
        return b;
    }
    if a.is_sign_negative() {
        a
    } else {
        b
    }
}

/// ECMAScript `Math.max` of two numbers: NaN when either is, +0 above −0.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a > b {
        return a;
    }
    if b > a {
        return b;
    }
    if a.is_sign_negative() {
        b
    } else {
        a
    }
}
