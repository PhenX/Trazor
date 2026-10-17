//! The boundary solve's descent for `@trazor/trace`, compiled to WebAssembly: the band
//! energy and its gradient (`band`), L-BFGS on each independent part (`lbfgs`) and the
//! Moré–Thuente line search (`linesearch`), ported from `packages/trace/src/solve/` so that
//! a solve whose descent runs here computes the same positions as the TypeScript's.
//!
//! The TypeScript side (`packages/trace/src/solve/kernel.ts`) builds the problem exactly as
//! the TypeScript solve does (the unknowns, the band and its tables, the independent parts,
//! the prior weights), copies it into this module's linear memory, runs [`problem_solve`],
//! and reads the solved positions back. The boundary between the two is plain C ABI over
//! the shared memory, no generated bindings:
//!
//! 1. Write the sizes into [`io`]`[0 .. SIZES]` (see [`Size`]) and call [`problem_new`]: it
//!    allocates every input array and writes their addresses into
//!    `io[SIZES .. SIZES + ARRAYS]` (see [`Array`]).
//! 2. Fill the arrays through views on the memory (taken after the call, which may have
//!    grown it).
//! 3. Call [`problem_solve`]; read [`problem_x`] (the positions) and [`problem_stats`].
//! 4. Call [`problem_free`], or drop the instance with its memory.
//!
//! The module imports its memory (`env.memory`), which the caller creates for each solve
//! large enough for everything the solve allocates (see the allocator below).
//!
//! After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt.rs`,
//! `inkvec-trace/src/boundary_opt/{band,lbfgs,linesearch}.rs`, as ported to TypeScript in
//! `packages/trace/src/solve/`.

// Comparisons keep the TypeScript's form, which also fixes what a NaN does.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::nonminimal_bool)]

mod band;
mod lbfgs;
mod linesearch;

use band::{Band, Energy, Geometry, Parts};

/// `v[i]` without a bounds check, for the hot loops: every index there is in range by
/// construction (each array was sized by `problem_new` from the counts the TypeScript built
/// its tables with, and every offset into them is one of those tables' own).
#[inline(always)]
pub(crate) fn ld<T: Copy>(v: &[T], i: usize) -> T {
    debug_assert!(i < v.len());
    // SAFETY: in range by construction (above).
    unsafe { *v.get_unchecked(i) }
}

/// `&mut v[i]` without a bounds check (see [`ld`]).
#[inline(always)]
pub(crate) fn mt<T>(v: &mut [T], i: usize) -> &mut T {
    debug_assert!(i < v.len());
    // SAFETY: in range by construction (see `ld`).
    unsafe { v.get_unchecked_mut(i) }
}

/// The allocator: a bump allocator over the memory the caller sized for the solve. Each
/// solve runs in a fresh instance over a fresh memory sized from an upper bound of what it
/// allocates, so nothing is ever freed and the memory never has to grow; it grows only
/// past that bound. A memory that grows detaches its old `ArrayBuffer` on the JavaScript
/// side, which in V8 slows every typed-array access of the thread from then on.
struct Bump;

/// The next free byte (0 until the first allocation, which starts at `__heap_base`).
static mut NEXT: usize = 0;

extern "C" {
    /// The first byte past the module's data and stack (the linker's symbol).
    static __heap_base: u8;
}

const PAGE: usize = 65536;

// SAFETY: single-threaded; every block lies in the memory, below `NEXT`, and is never
// handed out twice.
unsafe impl core::alloc::GlobalAlloc for Bump {
    unsafe fn alloc(&self, layout: core::alloc::Layout) -> *mut u8 {
        // SAFETY: the module is single-threaded.
        let next = unsafe {
            match NEXT {
                0 => core::ptr::addr_of!(__heap_base) as usize,
                n => n,
            }
        };
        let start = (next + layout.align() - 1) & !(layout.align() - 1);
        let end = start + layout.size();
        let have = core::arch::wasm32::memory_size(0) * PAGE;
        if end > have && core::arch::wasm32::memory_grow(0, (end - have).div_ceil(PAGE)) == usize::MAX {
            return core::ptr::null_mut();
        }
        // SAFETY: as above.
        unsafe { NEXT = end };
        start as *mut u8
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: core::alloc::Layout) {}

    unsafe fn realloc(&self, ptr: *mut u8, layout: core::alloc::Layout, new_size: usize) -> *mut u8 {
        // The last block grows in place; any other moves.
        // SAFETY: as above.
        let next = unsafe { NEXT };
        if ptr as usize + layout.size() == next {
            let end = ptr as usize + new_size;
            let have = core::arch::wasm32::memory_size(0) * PAGE;
            if end > have && core::arch::wasm32::memory_grow(0, (end - have).div_ceil(PAGE)) == usize::MAX {
                return core::ptr::null_mut();
            }
            // SAFETY: as above.
            unsafe { NEXT = end };
            return ptr;
        }
        // SAFETY: `layout` is valid with the new size (its alignment is unchanged).
        let new = unsafe { self.alloc(core::alloc::Layout::from_size_align_unchecked(new_size, layout.align())) };
        if !new.is_null() {
            // SAFETY: both blocks are live and do not overlap.
            unsafe { core::ptr::copy_nonoverlapping(ptr, new, layout.size().min(new_size)) };
        }
        new
    }
}

#[global_allocator]
static ALLOCATOR: Bump = Bump;

/// Pin bit: the point's x stays at its start (`lbfgs.ts` `PIN_X`).
pub const PIN_X: u8 = 1;
/// Pin bit: the point's y stays at its start (`lbfgs.ts` `PIN_Y`).
pub const PIN_Y: u8 = 2;

/// The sizes [`problem_new`] reads from `io[0 ..]`, in this order.
#[repr(u32)]
pub enum Size {
    Width,
    Height,
    Unknowns,
    Edges,
    Ids,
    Runs,
    Faces,
    Colour,
    Prefix,
    Cells,
    Parts,
    PartEdges,
    PartRuns,
    PartVars,
    MaxNf,
    MaxLen,
    /// Most pieces one evaluation cuts (the scratch is reserved for them).
    Pieces,
}
/// Number of [`Size`] entries.
pub const SIZES: usize = 17;

/// The arrays whose addresses [`problem_new`] writes into `io[SIZES ..]`, in this order,
/// with their element type and length.
#[repr(u32)]
pub enum Array {
    /// f64 × 2·unknowns
    Start,
    /// u8 × unknowns
    Pin,
    /// u8 × unknowns
    Junction,
    /// i32 × edges
    Left,
    /// i32 × edges
    Right,
    /// u8 × edges
    Closed,
    /// i32 × (edges + 1)
    Off,
    /// i32 × ids
    Ids,
    /// i32 × runs, each of the eight run arrays
    RunY,
    RunX0,
    RunX1,
    RunFirst,
    RunFstart,
    RunNf,
    RunCstart,
    RunPstart,
    /// i32 × faces
    Faces,
    /// f64 × colour
    Colour,
    /// f64 × prefix
    Prefix,
    /// f64 × cells
    Weight,
    /// f32 × 4·cells
    Target,
    /// u8 × width·height
    InBand,
    /// i32 × (parts + 1), then i32 × part edges
    PartEoff,
    PartEdges,
    /// i32 × (parts + 1), then i32 × part runs
    PartRoff,
    PartRuns,
    /// i32 × (parts + 1), then i32 × part vars
    PartVoff,
    PartVars,
}
/// Number of [`Array`] entries.
pub const ARRAYS: usize = 28;

/// The exchange area: sizes in, array addresses out.
static mut IO: [u32; SIZES + ARRAYS] = [0; SIZES + ARRAYS];

/// One solve's inputs and results.
pub struct Problem {
    geo: Geometry,
    band: Band,
    parts: Parts,
    max_pieces: usize,
    x: Vec<f64>,
    /// `[before, after, iters, evals, steps]`.
    stats: [f64; 5],
    steps: Vec<f64>,
}

/// The address of the exchange area (`SIZES + ARRAYS` u32).
#[no_mangle]
pub extern "C" fn io() -> *mut u32 {
    core::ptr::addr_of_mut!(IO) as *mut u32
}

/// Allocate a problem of the sizes in `io[0 .. SIZES]` and write its arrays' addresses into
/// `io[SIZES ..]`. Returns the problem's handle.
#[no_mangle]
pub extern "C" fn problem_new() -> *mut Problem {
    // SAFETY: the module is single-threaded and the caller does not touch the area while
    // this runs.
    let io = unsafe { &mut *core::ptr::addr_of_mut!(IO) };
    let s = |k: Size| io[k as usize] as usize;
    let (w, h, n, ne) = (s(Size::Width), s(Size::Height), s(Size::Unknowns), s(Size::Edges));
    let (nr, np) = (s(Size::Runs), s(Size::Parts));
    let mut p = Box::new(Problem {
        geo: Geometry {
            width: w,
            height: h,
            start: vec![0.0; 2 * n],
            pin: vec![0; n],
            junction: vec![0; n],
            left: vec![0; ne],
            right: vec![0; ne],
            closed: vec![0; ne],
            off: vec![0; ne + 1],
            ids: vec![0; s(Size::Ids)],
        },
        band: Band {
            y: vec![0; nr],
            x0: vec![0; nr],
            x1: vec![0; nr],
            first: vec![0; nr],
            fstart: vec![0; nr],
            nf: vec![0; nr],
            cstart: vec![0; nr],
            pstart: vec![0; nr],
            faces: vec![0; s(Size::Faces)],
            colour: vec![0.0; s(Size::Colour)],
            prefix: vec![0.0; s(Size::Prefix)],
            weight: vec![0.0; s(Size::Cells)],
            target: vec![0.0; 4 * s(Size::Cells)],
            in_band: vec![0; w * h],
            max_nf: s(Size::MaxNf).max(1),
            max_len: s(Size::MaxLen).max(1),
        },
        parts: Parts {
            eoff: vec![0; np + 1],
            edges: vec![0; s(Size::PartEdges)],
            roff: vec![0; np + 1],
            runs: vec![0; s(Size::PartRuns)],
            voff: vec![0; np + 1],
            vars: vec![0; s(Size::PartVars)],
        },
        max_pieces: s(Size::Pieces),
        x: Vec::new(),
        stats: [0.0; 5],
        steps: Vec::new(),
    });
    let g = &mut p.geo;
    let b = &mut p.band;
    let q = &mut p.parts;
    let addrs: [u32; ARRAYS] = [
        g.start.as_mut_ptr() as u32,
        g.pin.as_mut_ptr() as u32,
        g.junction.as_mut_ptr() as u32,
        g.left.as_mut_ptr() as u32,
        g.right.as_mut_ptr() as u32,
        g.closed.as_mut_ptr() as u32,
        g.off.as_mut_ptr() as u32,
        g.ids.as_mut_ptr() as u32,
        b.y.as_mut_ptr() as u32,
        b.x0.as_mut_ptr() as u32,
        b.x1.as_mut_ptr() as u32,
        b.first.as_mut_ptr() as u32,
        b.fstart.as_mut_ptr() as u32,
        b.nf.as_mut_ptr() as u32,
        b.cstart.as_mut_ptr() as u32,
        b.pstart.as_mut_ptr() as u32,
        b.faces.as_mut_ptr() as u32,
        b.colour.as_mut_ptr() as u32,
        b.prefix.as_mut_ptr() as u32,
        b.weight.as_mut_ptr() as u32,
        b.target.as_mut_ptr() as u32,
        b.in_band.as_mut_ptr() as u32,
        q.eoff.as_mut_ptr() as u32,
        q.edges.as_mut_ptr() as u32,
        q.roff.as_mut_ptr() as u32,
        q.runs.as_mut_ptr() as u32,
        q.voff.as_mut_ptr() as u32,
        q.vars.as_mut_ptr() as u32,
    ];
    io[SIZES..SIZES + ARRAYS].copy_from_slice(&addrs);
    Box::into_raw(p)
}

/// Run the descent on problem `p` with the prior weights and the descent's settings
/// (`budget` may be infinite; `record` non-zero keeps every accepted step). Returns 1 when
/// the energy fell (the positions are then [`problem_x`]), 0 otherwise.
///
/// # Safety
///
/// `p` is a handle [`problem_new`] returned and [`problem_free`] has not released, its
/// arrays filled consistently with the sizes it was made with.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn problem_solve(
    p: *mut Problem,
    w_kink: f64,
    w_anchor: f64,
    max_step: f64,
    max_total: f64,
    max_iters: f64,
    budget: f64,
    fixed_energy: f64,
    record: i32,
) -> i32 {
    // SAFETY: `p` came from `problem_new` and was not freed.
    let p = unsafe { &mut *p };
    let Problem { geo, band, parts, max_pieces, x, stats, steps } = p;
    let mut energy = Energy::new(geo, band, parts, w_kink, w_anchor, *max_pieces);
    let opts = lbfgs::Options { max_total, max_step, max_iters, budget, fixed_energy, record: record != 0 };
    steps.clear();
    let out = lbfgs::descend(&mut energy, &geo.start, &geo.pin, &opts, x, steps);
    let n_steps = (steps.len() / 8) as f64;
    match out {
        Some(o) => {
            *stats = [o.before, o.after, o.iters, o.evals, n_steps];
            1
        }
        None => {
            *stats = [0.0, 0.0, 0.0, 0.0, n_steps];
            0
        }
    }
}

/// The solved positions of problem `p` (f64 × 2·unknowns).
///
/// # Safety
///
/// `p` is a live handle (see [`problem_solve`]).
#[no_mangle]
pub unsafe extern "C" fn problem_x(p: *const Problem) -> *const f64 {
    // SAFETY: `p` came from `problem_new` and was not freed.
    unsafe { (*p).x.as_ptr() }
}

/// `[before, after, iters, evals, steps]` of problem `p`'s last solve.
///
/// # Safety
///
/// `p` is a live handle (see [`problem_solve`]).
#[no_mangle]
pub unsafe extern "C" fn problem_stats(p: *const Problem) -> *const f64 {
    // SAFETY: as above.
    unsafe { (*p).stats.as_ptr() }
}

/// The recorded steps of problem `p`'s last solve, 8 numbers each (`LbfgsStep`'s `part,
/// iter, step, trials, energy, rel, moved, pg`).
///
/// # Safety
///
/// `p` is a live handle (see [`problem_solve`]).
#[no_mangle]
pub unsafe extern "C" fn problem_steps(p: *const Problem) -> *const f64 {
    // SAFETY: as above.
    unsafe { (*p).steps.as_ptr() }
}

/// Free problem `p`.
///
/// # Safety
///
/// `p` is null or a live handle, freed once.
#[no_mangle]
pub unsafe extern "C" fn problem_free(p: *mut Problem) {
    if !p.is_null() {
        // SAFETY: `p` came from `problem_new` and is freed once.
        drop(unsafe { Box::from_raw(p) });
    }
}
