//! The boundary solve's energy: the exact rendering error of the planar map over the fixed
//! narrow band of pixels, plus the kink and anchor priors, with its analytic gradient.
//!
//! ```text
//! E = Σ_{p ∈ B} w_p · ‖ Σ_f cov_f(p)·c_f(p) − t_p ‖²
//!   + w_kink   · Σ over points sqrt(|p_{i−1} − 2p_i + p_{i+1}|² + 10⁻⁴)
//!   + w_anchor · Σ over points |p_i − p_i⁰|²        (×4 at a junction)
//! ```
//!
//! A port of the evaluation half of `packages/trace/src/solve/band.ts` (`BandProblem`'s
//! `bucket`, `energy`, `priors` and the stretch-summed `runEnergy`), which documents the
//! model: the Chan–Vese region term (T. F. Chan, L. A. Vese 2001) over a narrow band
//! (D. Adalsteinsson, J. A. Sethian 1995), exact box coverage by signed-area accumulation
//! with one carry per face (libart, R. Levien's font-rs; J. Manson, S. Schaefer 2011), the
//! gradient by suffix sums, and a stretch without pieces summed at once from per-run
//! prefix sums. The band itself (its runs, faces, colors, weights and prefix sums) is built
//! once by the TypeScript and copied in; nothing here changes it. Every sum runs over its
//! terms in the TypeScript's order and every expression keeps its order of operations, so
//! both compute the same values.
//!
//! Coordinates are Trazor's: pixel `(i, j)` covers `[i, i+1] × [j, j+1]`.
//!
//! After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt.rs` (`crossings`, `scatter`,
//! `Problem::priors`, `Problem::energy`) and `inkvec-trace/src/boundary_opt/band.rs`.

use crate::{ld, mt, PIN_X, PIN_Y};

/// Anchor multiplier at a junction.
pub const JUNCTION_ANCHOR: f64 = 4.0;
/// Floor inside the kink term's square root.
pub const KINK_EPS: f64 = 1e-4;
/// Largest coordinate whose gridlines [`grid_crossings`] walks.
pub const GRID_LIMIT: f64 = 1e9;
/// Most gridlines [`grid_crossings`] walks along one axis of one segment (2²⁰).
pub const GRID_MAX_SPAN: f64 = 1_048_576.0;

/// Crossings per axis the crossing lists hold before they grow.
const CROSSINGS: usize = 64;

/// A piece end that is a boundary point.
const VERTEX: u8 = 0;
/// A piece end where its segment crosses a vertical gridline.
const CROSS_V: u8 = 1;
/// A piece end where its segment crosses a horizontal gridline.
const CROSS_H: u8 = 2;

/// The map's unknowns and edges, fixed for the solve.
pub struct Geometry {
    pub width: usize,
    pub height: usize,
    /// Unknowns: starting positions (interleaved), frame pins, junction flags.
    pub start: Vec<f64>,
    pub pin: Vec<u8>,
    pub junction: Vec<u8>,
    /// Per edge: its two faces, whether it is closed, and its unknowns
    /// `ids[off[k] .. off[k + 1]]`.
    pub left: Vec<i32>,
    pub right: Vec<i32>,
    pub closed: Vec<u8>,
    pub off: Vec<i32>,
    pub ids: Vec<i32>,
}

/// The fixed band (`band.ts`'s `Band`), with each band pixel's observed value.
pub struct Band {
    pub y: Vec<i32>,
    pub x0: Vec<i32>,
    pub x1: Vec<i32>,
    pub first: Vec<i32>,
    pub fstart: Vec<i32>,
    pub nf: Vec<i32>,
    pub cstart: Vec<i32>,
    pub pstart: Vec<i32>,
    pub faces: Vec<i32>,
    pub colour: Vec<f64>,
    pub prefix: Vec<f64>,
    pub weight: Vec<f64>,
    /// The observed pixel of every band pixel, four channels, in band-pixel order.
    pub target: Vec<f32>,
    pub in_band: Vec<u8>,
    pub max_nf: usize,
    pub max_len: usize,
}

/// The independent parts: part `p`'s edges are `edges[eoff[p] .. eoff[p + 1]]`, likewise
/// its runs and its unknowns.
pub struct Parts {
    pub eoff: Vec<i32>,
    pub edges: Vec<i32>,
    pub roff: Vec<i32>,
    pub runs: Vec<i32>,
    pub voff: Vec<i32>,
    pub vars: Vec<i32>,
}

impl Parts {
    pub fn count(&self) -> usize {
        self.eoff.len() - 1
    }
    pub fn edges(&self, p: usize) -> &[i32] {
        &self.edges[self.eoff[p] as usize..self.eoff[p + 1] as usize]
    }
    pub fn runs(&self, p: usize) -> &[i32] {
        &self.runs[self.roff[p] as usize..self.roff[p + 1] as usize]
    }
    pub fn vars(&self, p: usize) -> &[i32] {
        &self.vars[self.voff[p] as usize..self.voff[p + 1] as usize]
    }
}

/// One fragment of one segment inside one pixel, as filed: its height `s = to.y − from.y`
/// and the midpoint of its x extent `xm = (from.x + to.x)/2` (the two numbers the coverage
/// reads, computed as `band.ts` computes them where it reads them), its faces, and how its
/// two ends move.
#[derive(Clone, Copy)]
struct Piece {
    s: f64,
    xm: f64,
    /// The gridline each end lies on, for a crossing end.
    fline: f64,
    tline: f64,
    left: i32,
    right: i32,
    /// The segment's unknowns: a vertex at `from` is `va`, a vertex at `to` is `vb`.
    va: i32,
    vb: i32,
    /// Next piece in the same pixel's list, or -1.
    next: i32,
    /// How each end moves: VERTEX, CROSS_V or CROSS_H.
    fkind: u8,
    tkind: u8,
}

/// What the coverage reads of a piece, gathered in the order the band reads them, with its
/// two faces' slots in the run that reads it (set when the run reads it).
#[derive(Clone, Copy, Default)]
struct Hot {
    s: f64,
    xm: f64,
    left: i32,
    right: i32,
    sl: u32,
    sr: u32,
}

/// What the gradient's scatter reads of a piece, in the same order.
#[derive(Clone, Copy, Default)]
struct Cold {
    fline: f64,
    tline: f64,
    va: i32,
    vb: i32,
    fkind: u8,
    tkind: u8,
}

/// Each axis's gridline crossings of one segment, parameter and line, in the order they
/// were walked (reused across calls).
#[derive(Default)]
struct Crossings {
    vt: Vec<f64>,
    vl: Vec<f64>,
    ht: Vec<f64>,
    hl: Vec<f64>,
}

/// The energy's evaluation state: the problem it reads and the scratch of one evaluation.
///
/// The pieces are filed into per-pixel lists as `band.ts` files them, then gathered once
/// per evaluation into the order every later pass reads them (the rows' pieces left of the
/// image, then the pixels ascending, each list in its own order), so those passes walk
/// memory in order; the order of every sum is the TypeScript's.
pub struct Energy<'a> {
    pub geo: &'a Geometry,
    pub band: &'a Band,
    pub parts: &'a Parts,
    pub w_kink: f64,
    pub w_anchor: f64,
    pieces: Vec<Piece>,
    /// Per pixel, the first of its pieces (-1 for none) while filing; after the gather, the
    /// index of its first gathered piece.
    head: Vec<i32>,
    /// Per pixel, its number of gathered pieces (read only where `head` is set).
    count: Vec<u32>,
    /// Per row, the first of the pieces left of the image, likewise, and their number.
    vhead: Vec<i32>,
    vcount: Vec<u32>,
    touched: Vec<i32>,
    vrows: Vec<i32>,
    hot: Vec<Hot>,
    cold: Vec<Cold>,
    cross: Crossings,
    carry: Vec<f64>,
    cov: Vec<f64>,
    suf: Vec<f64>,
    g: Vec<f64>,
    kap: Vec<f64>,
    segs: Vec<i32>,
    /// Each gathered piece's gradient at its two ends: `[from.x, from.y, to.x, to.y]`.
    piece_g: Vec<f64>,
}

/// The pixel index inkvec's rounding of a midpoint coordinate gives (`band.ts` `cellOf`).
#[inline]
fn cell_of(v: f64) -> f64 {
    if v >= 0.5 {
        v.floor()
    } else {
        0.0 - (1.0 - v).floor()
    }
}

#[inline]
fn walkable(lo: f64, hi: f64) -> bool {
    lo > -GRID_LIMIT && hi < GRID_LIMIT && hi - lo < GRID_MAX_SPAN
}

#[inline]
fn walked(a: f64, b: f64) -> bool {
    (b - a).abs() > 1e-12 && walkable(if a < b { a } else { b }, if a < b { b } else { a })
}

/// One axis of [`grid_crossings`], appended to `ts`, `ls`.
fn axis_crossings(a: f64, b: f64, ts: &mut Vec<f64>, ls: &mut Vec<f64>) {
    ts.clear();
    ls.clear();
    if !walked(a, b) {
        return;
    }
    let d = b - a;
    let lo = if a < b { a } else { b };
    let hi = if a < b { b } else { a };
    let mut m = lo.ceil();
    while m < hi {
        let t = (m - a) / d;
        if t > 1e-9 && t < 1.0 - 1e-9 {
            ts.push(t);
            ls.push(m);
        }
        m += 1.0;
    }
}

impl<'a> Energy<'a> {
    /// The evaluation state of a problem whose evaluations cut at most `max_pieces` pieces,
    /// its scratch reserved once.
    pub fn new(
        geo: &'a Geometry,
        band: &'a Band,
        parts: &'a Parts,
        w_kink: f64,
        w_anchor: f64,
        max_pieces: usize,
    ) -> Energy<'a> {
        let w = geo.width;
        let h = geo.height;
        let nf = band.max_nf;
        let len = band.max_len;
        Energy {
            geo,
            band,
            parts,
            w_kink,
            w_anchor,
            pieces: Vec::with_capacity(max_pieces),
            head: vec![-1; w * h],
            count: vec![0; w * h],
            vhead: vec![-1; h],
            vcount: vec![0; h],
            touched: Vec::with_capacity(max_pieces),
            vrows: Vec::with_capacity(h),
            hot: Vec::with_capacity(max_pieces),
            cold: Vec::with_capacity(max_pieces),
            cross: Crossings {
                vt: Vec::with_capacity(CROSSINGS),
                vl: Vec::with_capacity(CROSSINGS),
                ht: Vec::with_capacity(CROSSINGS),
                hl: Vec::with_capacity(CROSSINGS),
            },
            carry: vec![0.0; nf],
            cov: vec![0.0; nf],
            suf: vec![0.0; nf],
            g: vec![0.0; len * nf],
            kap: vec![0.0; len * nf],
            segs: vec![0; 3 * len],
            piece_g: Vec::with_capacity(4 * max_pieces),
        }
    }

    // -----------------------------------------------------------------------------------
    // Pieces
    // -----------------------------------------------------------------------------------

    /// Cut every segment of every edge of `part` (every edge for `None`) at its gridline
    /// crossings and file each piece under the band pixel of its row nearest the pixel
    /// holding its midpoint; a piece left of the image goes into its row's list, one
    /// above, below or right of the image nowhere.
    fn bucket(&mut self, pos: &[f64], part: Option<usize>) {
        for k in 0..self.touched.len() {
            let c = self.touched[k] as usize;
            self.head[c] = -1;
        }
        self.touched.clear();
        for k in 0..self.vrows.len() {
            let y = self.vrows[k] as usize;
            self.vhead[y] = -1;
        }
        self.vrows.clear();
        self.pieces.clear();
        let geo = self.geo;
        let parts = self.parts;
        let count = match part {
            None => geo.left.len(),
            Some(p) => parts.edges(p).len(),
        };
        for idx in 0..count {
            let k = match part {
                None => idx,
                Some(p) => parts.edges(p)[idx] as usize,
            };
            let ids = &geo.ids[geo.off[k] as usize..geo.off[k + 1] as usize];
            let n = ids.len();
            if n < 2 {
                continue;
            }
            let last = if geo.closed[k] != 0 { n } else { n - 1 };
            let (left, right) = (geo.left[k], geo.right[k]);
            for i in 0..last {
                let vb = if i + 1 == n { ids[0] } else { ids[i + 1] };
                self.cut_segment(ids[i], vb, left, right, pos);
            }
        }
        self.touched.sort_unstable();
        self.vrows.sort_unstable();
        self.gather();
    }

    /// Gather the filed pieces into the order the band reads them: each row's pieces left of
    /// the image (rows ascending), then each pixel's (pixels ascending), every list in its
    /// own order; `head`, `vhead` then index the gathered pieces.
    fn gather(&mut self) {
        self.hot.clear();
        self.cold.clear();
        for k in 0..self.vrows.len() {
            let y = ld(&self.vrows, k) as usize;
            let first = self.hot.len();
            let mut id = ld(&self.vhead, y);
            while id >= 0 {
                let p = ld(&self.pieces, id as usize);
                self.push_gathered(&p);
                id = p.next;
            }
            *mt(&mut self.vhead, y) = first as i32;
            *mt(&mut self.vcount, y) = (self.hot.len() - first) as u32;
        }
        for k in 0..self.touched.len() {
            let c = ld(&self.touched, k) as usize;
            let first = self.hot.len();
            let mut id = ld(&self.head, c);
            while id >= 0 {
                let p = ld(&self.pieces, id as usize);
                self.push_gathered(&p);
                id = p.next;
            }
            *mt(&mut self.head, c) = first as i32;
            *mt(&mut self.count, c) = (self.hot.len() - first) as u32;
        }
    }

    #[inline(always)]
    fn push_gathered(&mut self, p: &Piece) {
        self.hot.push(Hot { s: p.s, xm: p.xm, left: p.left, right: p.right, sl: 0, sr: 0 });
        self.cold.push(Cold { fline: p.fline, tline: p.tline, va: p.va, vb: p.vb, fkind: p.fkind, tkind: p.tkind });
    }

    /// Cut the segment from unknown `va` to `vb` into pieces at its gridline crossings and
    /// file them (`band.ts` `cutSegment` over `gridCrossings`): each integer `x = m` strictly
    /// between the ends crosses at `t = (m − a.x)/(b.x − a.x)`, likewise in `y`, kept when
    /// `t ∈ (10⁻⁹, 1 − 10⁻⁹)` on an axis walked at all; the two axes merged by ascending
    /// `t`, a vertical crossing first on a tie.
    fn cut_segment(&mut self, va: i32, vb: i32, left: i32, right: i32, pos: &[f64]) {
        let ax = ld(pos, 2 * va as usize);
        let ay = ld(pos, 2 * va as usize + 1);
        let bx = ld(pos, 2 * vb as usize);
        let by = ld(pos, 2 * vb as usize + 1);
        let mut cr = core::mem::take(&mut self.cross);
        axis_crossings(ax, bx, &mut cr.vt, &mut cr.vl);
        axis_crossings(ay, by, &mut cr.ht, &mut cr.hl);
        let nv = cr.vt.len();
        let nh = cr.ht.len();
        // Each axis walks its gridlines in increasing `m`, so its parameters run ascending
        // when the segment moves forwards along that axis and descending otherwise.
        let v_forward = bx - ax > 0.0;
        let h_forward = by - ay > 0.0;
        let mut i = 0;
        let mut j = 0;
        let mut t0 = 0.0;
        let mut fx = ax;
        let mut fy = ay;
        let mut fkind = VERTEX;
        let mut fline = 0.0;
        loop {
            let last = i >= nv && j >= nh;
            let t1;
            let tx;
            let ty;
            let tkind;
            let tline;
            if last {
                t1 = 1.0;
                tx = bx;
                ty = by;
                tkind = VERTEX;
                tline = 0.0;
            } else {
                let iv = if v_forward { i } else { nv.wrapping_sub(1 + i) };
                let jh = if h_forward { j } else { nh.wrapping_sub(1 + j) };
                let take_v = j >= nh || (i < nv && ld(&cr.vt, iv) <= ld(&cr.ht, jh));
                if take_v {
                    t1 = ld(&cr.vt, iv);
                    tline = ld(&cr.vl, iv);
                    tkind = CROSS_V;
                    tx = tline;
                    ty = ay + (by - ay) * t1;
                    i += 1;
                } else {
                    t1 = ld(&cr.ht, jh);
                    tline = ld(&cr.hl, jh);
                    tkind = CROSS_H;
                    tx = ax + (bx - ax) * t1;
                    ty = tline;
                    j += 1;
                }
            }
            if t1 - t0 > 1e-9 {
                let tm = 0.5 * (t0 + t1);
                let px = cell_of(ax + (bx - ax) * tm);
                let py = cell_of(ay + (by - ay) * tm);
                let piece = Piece {
                    s: ty - fy,
                    xm: 0.5 * (fx + tx),
                    fline,
                    tline,
                    left,
                    right,
                    va,
                    vb,
                    next: -1,
                    fkind,
                    tkind,
                };
                self.file(piece, px, py);
            }
            if last {
                break;
            }
            t0 = t1;
            fx = tx;
            fy = ty;
            fkind = tkind;
            fline = tline;
        }
        self.cross = cr;
    }

    /// File one piece under pixel `(px, py)` (see [`Energy::bucket`]).
    fn file(&mut self, mut piece: Piece, px: f64, py: f64) {
        let w = self.geo.width;
        if !(py >= 0.0 && py < self.geo.height as f64 && px < w as f64) {
            return;
        }
        let y = py as usize;
        let id = self.pieces.len() as i32;
        if px < 0.0 {
            let v = mt(&mut self.vhead, y);
            if *v < 0 {
                self.vrows.push(y as i32);
            }
            piece.next = *v;
            *v = id;
            self.pieces.push(piece);
            return;
        }
        let x = self.nearest_in_band(y, px as usize);
        let cell = y * w + x;
        let h = mt(&mut self.head, cell);
        if *h < 0 {
            self.touched.push(cell as i32);
        }
        piece.next = *h;
        *h = id;
        self.pieces.push(piece);
    }

    /// The band pixel of row `y` nearest column `x` (`x` itself when in the band).
    fn nearest_in_band(&self, y: usize, x: usize) -> usize {
        let inb = &self.band.in_band;
        let w = self.geo.width;
        let row = y * w;
        if ld(inb, row + x) != 0 {
            return x;
        }
        for d in 1..4 {
            if x >= d && ld(inb, row + x - d) != 0 {
                return x - d;
            }
            if x + d < w && ld(inb, row + x + d) != 0 {
                return x + d;
            }
        }
        x
    }

    // -----------------------------------------------------------------------------------
    // The energy
    // -----------------------------------------------------------------------------------

    /// The whole objective at `pos` over `part` (the whole problem for `None`), with the
    /// part's unknowns' entries of `grad` zeroed and then filled with its gradient, zero
    /// along a coordinate pinned to the frame (`BandProblem.energy`).
    pub fn energy(&mut self, pos: &[f64], grad: &mut [f64], part: Option<usize>) -> f64 {
        self.bucket(pos, part);
        let geo = self.geo;
        let parts = self.parts;
        match part {
            None => {
                for v in grad[..2 * geo.pin.len()].iter_mut() {
                    *v = 0.0;
                }
            }
            Some(p) => {
                for &v in parts.vars(p) {
                    grad[2 * v as usize] = 0.0;
                    grad[2 * v as usize + 1] = 0.0;
                }
            }
        }
        let data = self.band_data(pos, grad, part);
        let d = data + self.priors(pos, grad, part);
        let pin = &geo.pin;
        let count = match part {
            None => pin.len(),
            Some(p) => parts.vars(p).len(),
        };
        for i in 0..count {
            let v = match part {
                None => i,
                Some(p) => parts.vars(p)[i] as usize,
            };
            if pin[v] & PIN_X != 0 {
                grad[2 * v] = 0.0;
            }
            if pin[v] & PIN_Y != 0 {
                grad[2 * v + 1] = 0.0;
            }
        }
        d
    }

    /// The kink and anchor priors at `pos`, their gradient added into `grad`.
    fn priors(&self, pos: &[f64], grad: &mut [f64], part: Option<usize>) -> f64 {
        let geo = self.geo;
        let parts = self.parts;
        let w_kink = self.w_kink;
        let mut total = 0.0;
        let ne = match part {
            None => geo.left.len(),
            Some(p) => parts.edges(p).len(),
        };
        for idx in 0..ne {
            let k = match part {
                None => idx,
                Some(p) => parts.edges(p)[idx] as usize,
            };
            let ids = &geo.ids[geo.off[k] as usize..geo.off[k + 1] as usize];
            let n = ids.len();
            if n < 3 {
                continue;
            }
            let closed = geo.closed[k] != 0;
            let lo = if closed { 0 } else { 1 };
            let hi = if closed { n } else { n - 1 };
            for i in lo..hi {
                let ia = ld(ids, if i == 0 { n - 1 } else { i - 1 }) as usize;
                let ib = ld(ids, i) as usize;
                let ic = ld(ids, if i + 1 == n { 0 } else { i + 1 }) as usize;
                let dx = ld(pos, 2 * ia) - 2.0 * ld(pos, 2 * ib) + ld(pos, 2 * ic);
                let dy = ld(pos, 2 * ia + 1) - 2.0 * ld(pos, 2 * ib + 1) + ld(pos, 2 * ic + 1);
                let m = (dx * dx + dy * dy + KINK_EPS).sqrt();
                total += w_kink * m;
                let s = w_kink / m;
                *mt(grad, 2 * ia) += s * dx;
                *mt(grad, 2 * ia + 1) += s * dy;
                *mt(grad, 2 * ib) -= 2.0 * s * dx;
                *mt(grad, 2 * ib + 1) -= 2.0 * s * dy;
                *mt(grad, 2 * ic) += s * dx;
                *mt(grad, 2 * ic + 1) += s * dy;
            }
        }
        let nv = match part {
            None => geo.pin.len(),
            Some(p) => parts.vars(p).len(),
        };
        for i in 0..nv {
            let v = match part {
                None => i,
                Some(p) => parts.vars(p)[i] as usize,
            };
            let w = if ld(&geo.junction, v) != 0 { self.w_anchor * JUNCTION_ANCHOR } else { self.w_anchor };
            let dx = ld(pos, 2 * v) - ld(&geo.start, 2 * v);
            let dy = ld(pos, 2 * v + 1) - ld(&geo.start, 2 * v + 1);
            total += w * (dx * dx + dy * dy);
            *mt(grad, 2 * v) += 2.0 * w * dx;
            *mt(grad, 2 * v + 1) += 2.0 * w * dy;
        }
        total
    }

    /// The band term at `pos` (after [`Energy::bucket`] on the same `pos`) over the part's
    /// runs, each run's energy summed in run order, each piece's gradient kept apart and
    /// pushed onto the unknowns in pixel order.
    fn band_data(&mut self, pos: &[f64], grad: &mut [f64], part: Option<usize>) -> f64 {
        let need = 4 * self.hot.len();
        if self.piece_g.len() < need {
            self.piece_g.resize(need, 0.0);
        }
        for v in self.piece_g[..need].iter_mut() {
            *v = 0.0;
        }
        let mut total = 0.0;
        let band = self.band;
        let parts = self.parts;
        match part {
            None => {
                for r in 0..band.y.len() {
                    total += self.run_energy(r);
                }
            }
            Some(p) => {
                for &r in parts.runs(p) {
                    total += self.run_energy(r as usize);
                }
            }
        }
        self.scatter_all(pos, grad);
        total
    }

    /// Push every piece's gradient onto its unknowns, in pixel order (the gathered order).
    fn scatter_all(&self, pos: &[f64], grad: &mut [f64]) {
        let pg = &self.piece_g;
        for (id, c) in self.cold.iter().enumerate() {
            let o = 4 * id;
            let (g0, g1, g2, g3) = (ld(pg, o), ld(pg, o + 1), ld(pg, o + 2), ld(pg, o + 3));
            if g0 != 0.0 || g1 != 0.0 {
                scatter(c.fkind, c.fline, c.va, c.vb, c.va, g0, g1, pos, grad);
            }
            if g2 != 0.0 || g3 != 0.0 {
                scatter(c.tkind, c.tline, c.va, c.vb, c.vb, g2, g3, pos, grad);
            }
        }
    }

    /// The slot of face `f` among a run's faces (slot 0 for a face it does not hold).
    #[inline(always)]
    fn slot(&self, fstart: usize, nf: usize, f: i32) -> u32 {
        let faces = &self.band.faces;
        for j in 0..nf {
            if ld(faces, fstart + j) == f {
                return j as u32;
            }
        }
        0
    }

    /// Start run `r`: the carry is its seed face (slot 0), plus the heights of the pieces
    /// left of the image for a run at column 0, whose slots it caches. Returns the range of
    /// those pieces.
    fn start_run(&mut self, r: usize) -> (usize, usize) {
        let band = self.band;
        let nf = ld(&band.nf, r) as usize;
        let fstart = ld(&band.fstart, r) as usize;
        for v in self.carry[..nf].iter_mut() {
            *v = 0.0;
        }
        self.carry[0] = 1.0;
        let y = ld(&band.y, r) as usize;
        if ld(&band.x0, r) != 0 || ld(&self.vhead, y) < 0 {
            return (0, 0);
        }
        let first = ld(&self.vhead, y) as usize;
        let end = first + ld(&self.vcount, y) as usize;
        for id in first..end {
            let p = ld(&self.hot, id);
            let s = p.s;
            let sl = self.slot(fstart, nf, p.left);
            *mt(&mut self.carry, sl as usize) += s;
            let sr = self.slot(fstart, nf, p.right);
            *mt(&mut self.carry, sr as usize) -= s;
            let q = mt(&mut self.hot, id);
            q.sl = sl;
            q.sr = sr;
        }
        (first, end)
    }

    /// The coverage of pixel `cell` (right side at `xr`) into `cov`: the carry plus the
    /// area each of its pieces deposits; then each piece's height joins the carry. Caches
    /// each piece's slots.
    #[inline(always)]
    fn deposit(&mut self, fstart: usize, nf: usize, cell: usize, xr: f64) {
        for j in 0..nf {
            *mt(&mut self.cov, j) = ld(&self.carry, j);
        }
        let first = ld(&self.head, cell) as usize;
        let end = first + ld(&self.count, cell) as usize;
        for id in first..end {
            let p = ld(&self.hot, id);
            let s = p.s;
            let a = s * (xr - p.xm);
            let sl = self.slot(fstart, nf, p.left);
            let sr = self.slot(fstart, nf, p.right);
            *mt(&mut self.cov, sl as usize) += a;
            *mt(&mut self.cov, sr as usize) -= a;
            *mt(&mut self.carry, sl as usize) += s;
            *mt(&mut self.carry, sr as usize) -= s;
            let q = mt(&mut self.hot, id);
            q.sl = sl;
            q.sr = sr;
        }
    }

    /// The weighted residual of pixel `i` of run `r` at the coverage in `cov`, and into
    /// `g[at ..]` the derivative `2·w·(r·c_f)` per face slot. The four channels run as two
    /// pairs of lanes, each lane the scalar sequence of operations; the sums across
    /// channels stay in channel order.
    #[inline(always)]
    fn pixel_energy(&mut self, r: usize, i: usize, at: usize) -> f64 {
        use core::arch::wasm32::*;
        let band = self.band;
        let nf = ld(&band.nf, r) as usize;
        let cell = ld(&band.first, r) as usize + i;
        let wgt = ld(&band.weight, cell);
        if wgt == 0.0 {
            for j in 0..nf {
                *mt(&mut self.g, at + j) = 0.0;
            }
            return 0.0;
        }
        let t = &band.target;
        let col = band.colour.as_ptr();
        let c0 = ld(&band.cstart, r) as usize + 4 * i * nf;
        debug_assert!(c0 + 4 * nf <= band.colour.len() && 4 * cell + 4 <= t.len());
        let cov = &self.cov;
        let mut r01 = f64x2(-(ld(t, 4 * cell) as f64), -(ld(t, 4 * cell + 1) as f64));
        let mut r23 = f64x2(-(ld(t, 4 * cell + 2) as f64), -(ld(t, 4 * cell + 3) as f64));
        for j in 0..nf {
            let cv = f64x2_splat(ld(cov, j));
            let o = c0 + 4 * j;
            // SAFETY: `o + 4 <= colour.len()` (the run's colors are `4·nf` per pixel).
            let (c01, c23) =
                unsafe { (v128_load(col.add(o) as *const v128), v128_load(col.add(o + 2) as *const v128)) };
            r01 = f64x2_add(r01, f64x2_mul(cv, c01));
            r23 = f64x2_add(r23, f64x2_mul(cv, c23));
        }
        let q01 = f64x2_mul(r01, r01);
        let q23 = f64x2_mul(r23, r23);
        let e = f64x2_extract_lane::<0>(q01)
            + f64x2_extract_lane::<1>(q01)
            + f64x2_extract_lane::<0>(q23)
            + f64x2_extract_lane::<1>(q23);
        let w2 = 2.0 * wgt;
        for j in 0..nf {
            let o = c0 + 4 * j;
            // SAFETY: as above.
            let (c01, c23) =
                unsafe { (v128_load(col.add(o) as *const v128), v128_load(col.add(o + 2) as *const v128)) };
            let p01 = f64x2_mul(r01, c01);
            let p23 = f64x2_mul(r23, c23);
            let d = f64x2_extract_lane::<0>(p01)
                + f64x2_extract_lane::<1>(p01)
                + f64x2_extract_lane::<0>(p23)
                + f64x2_extract_lane::<1>(p23);
            *mt(&mut self.g, at + j) = w2 * d;
        }
        wgt * e
    }

    /// The gradient at both ends of each piece of pixel `cell` (`band.ts` `pieceGrads`),
    /// from the slots [`Energy::deposit`] cached.
    #[inline(always)]
    fn piece_grads(&mut self, cell: usize, xr: f64, g_at: usize) {
        let first = ld(&self.head, cell) as usize;
        let end = first + ld(&self.count, cell) as usize;
        for id in first..end {
            let p = ld(&self.hot, id);
            let (sl, sr) = (p.sl as usize, p.sr as usize);
            let da = ld(&self.g, g_at + sl) - ld(&self.g, g_at + sr);
            let ds = ld(&self.suf, sl) - ld(&self.suf, sr);
            let s = p.s;
            let off = xr - p.xm;
            let gx = -0.5 * s * da;
            let o = 4 * id;
            let pg = &mut self.piece_g;
            *mt(pg, o) = gx;
            *mt(pg, o + 1) = -off * da - ds;
            *mt(pg, o + 2) = gx;
            *mt(pg, o + 3) = off * da + ds;
        }
    }

    /// The gradient of the pieces left of the image: their height reaches every pixel.
    fn virtual_grads(&mut self, first: usize, end: usize) {
        for id in first..end {
            let p = ld(&self.hot, id);
            let ds = ld(&self.suf, p.sl as usize) - ld(&self.suf, p.sr as usize);
            let o = 4 * id;
            let pg = &mut self.piece_g;
            *mt(pg, o) = 0.0;
            *mt(pg, o + 1) = -ds;
            *mt(pg, o + 2) = 0.0;
            *mt(pg, o + 3) = ds;
        }
    }

    /// One run of the band term with the gradient at both ends of each of its pieces: the
    /// pixels holding pieces rendered one by one, a stretch without pieces summed at once
    /// from the prefix sums (`band.ts` `runEnergy`).
    fn run_energy(&mut self, r: usize) -> f64 {
        let band = self.band;
        let x0 = ld(&band.x0, r) as usize;
        let len = (ld(&band.x1, r) - ld(&band.x0, r) + 1) as usize;
        let nf = ld(&band.nf, r) as usize;
        let fstart = ld(&band.fstart, r) as usize;
        let kk = (nf * (nf + 1)) / 2 + nf + 1;
        let pre = ld(&band.pstart, r) as usize;
        let prefix = &band.prefix;
        let vstart = self.start_run(r);
        let row = ld(&band.y, r) as usize * self.geo.width + x0;
        let mut total = 0.0;
        let mut nseg = 0;
        let mut g_len = 0;
        let mut kap_len = 0;
        let mut i = 0;
        while i < len {
            if ld(&self.head, row + i) < 0 {
                let mut j = i + 1;
                while j < len && ld(&self.head, row + j) < 0 {
                    j += 1;
                }
                total += stretch_energy(prefix, pre + i * kk, pre + j * kk, &self.carry, nf);
                *mt(&mut self.segs, 3 * nseg) = i as i32;
                *mt(&mut self.segs, 3 * nseg + 1) = j as i32;
                *mt(&mut self.segs, 3 * nseg + 2) = kap_len as i32;
                nseg += 1;
                for a in 0..nf {
                    *mt(&mut self.kap, kap_len + a) = ld(&self.carry, a);
                }
                kap_len += nf;
                i = j;
                continue;
            }
            self.deposit(fstart, nf, row + i, (x0 + i + 1) as f64);
            *mt(&mut self.segs, 3 * nseg) = i as i32;
            *mt(&mut self.segs, 3 * nseg + 1) = -1;
            *mt(&mut self.segs, 3 * nseg + 2) = g_len as i32;
            nseg += 1;
            let e = self.pixel_energy(r, i, g_len);
            g_len += nf;
            total += e;
            i += 1;
        }
        // Backwards: `suf` is each face's `g` summed over everything after the current
        // segment; a stretch adds `2((ΣA)κ − Σb)`, a pixel its own `g`.
        for v in self.suf[..nf].iter_mut() {
            *v = 0.0;
        }
        for k in (0..nseg).rev() {
            let si = ld(&self.segs, 3 * k) as usize;
            let sj = ld(&self.segs, 3 * k + 1);
            let at = ld(&self.segs, 3 * k + 2) as usize;
            if sj >= 0 {
                stretch_grad(prefix, pre + si * kk, pre + sj as usize * kk, &self.kap, at, nf, &mut self.suf);
                continue;
            }
            self.piece_grads(row + si, (x0 + si + 1) as f64, at);
            for a in 0..nf {
                *mt(&mut self.suf, a) += ld(&self.g, at + a);
            }
        }
        self.virtual_grads(vstart.0, vstart.1);
        total
    }
}

/// Push the gradient `(gx, gy)` with respect to one end of a piece back onto the unknowns
/// it depends on (`band.ts` `scatter`): a vertex is its own unknown `v`; a gridline
/// crossing moves with both ends of its segment, in proportion to where it lies.
#[allow(clippy::too_many_arguments)]
#[inline]
fn scatter(kind: u8, line: f64, a: i32, b: i32, v: i32, gx: f64, gy: f64, pos: &[f64], grad: &mut [f64]) {
    if kind == VERTEX {
        *mt(grad, 2 * v as usize) += gx;
        *mt(grad, 2 * v as usize + 1) += gy;
        return;
    }
    let (a, b) = (a as usize, b as usize);
    let pax = ld(pos, 2 * a);
    let pay = ld(pos, 2 * a + 1);
    let pbx = ld(pos, 2 * b);
    let pby = ld(pos, 2 * b + 1);
    if kind == CROSS_V {
        let dx = pbx - pax;
        if dx.abs() < 1e-9 {
            return;
        }
        let dy = pby - pay;
        let t = (line - pax) / dx;
        *mt(grad, 2 * a + 1) += gy * (1.0 - t);
        *mt(grad, 2 * b + 1) += gy * t;
        *mt(grad, 2 * a) += (gy * dy * (t - 1.0)) / dx;
        *mt(grad, 2 * b) -= (gy * dy * t) / dx;
        return;
    }
    let dy = pby - pay;
    if dy.abs() < 1e-9 {
        return;
    }
    let dx = pbx - pax;
    let t = (line - pay) / dy;
    *mt(grad, 2 * a) += gx * (1.0 - t);
    *mt(grad, 2 * b) += gx * t;
    *mt(grad, 2 * a + 1) += (gx * dx * (t - 1.0)) / dy;
    *mt(grad, 2 * b + 1) -= (gx * dx * t) / dy;
}

/// The energy of a stretch with the constant coverage `kap`: `κᵀ(ΣA)κ − 2κᵀ(Σb) + Σc`.
#[inline(always)]
fn stretch_energy(p: &[f64], o0: usize, o1: usize, kap: &[f64], nf: usize) -> f64 {
    let kk = (nf * (nf + 1)) / 2 + nf + 1;
    let mut e = ld(p, o1 + kk - 1) - ld(p, o0 + kk - 1);
    let mut t = 0;
    for a in 0..nf {
        let ka = ld(kap, a);
        for b in a..nf {
            let f = if a == b { 1.0 } else { 2.0 };
            e += f * ka * ld(kap, b) * (ld(p, o1 + t) - ld(p, o0 + t));
            t += 1;
        }
    }
    for a in 0..nf {
        e -= 2.0 * ld(kap, a) * (ld(p, o1 + t + a) - ld(p, o0 + t + a));
    }
    e
}

/// Add a stretch's share of each face's suffix sum, `2((ΣA)κ − Σb)`, to `suf`.
#[inline(always)]
fn stretch_grad(p: &[f64], o0: usize, o1: usize, kap: &[f64], at: usize, nf: usize, suf: &mut [f64]) {
    let mut t = 0;
    for a in 0..nf {
        for b in a..nf {
            let dab = ld(p, o1 + t) - ld(p, o0 + t);
            *mt(suf, a) += 2.0 * dab * ld(kap, at + b);
            if a != b {
                *mt(suf, b) += 2.0 * dab * ld(kap, at + a);
            }
            t += 1;
        }
    }
    for a in 0..nf {
        *mt(suf, a) -= 2.0 * (ld(p, o1 + t + a) - ld(p, o0 + t + a));
    }
}
