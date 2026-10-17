function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function n(t) {
	const n = t.length;
	if (n < 6) return 0;
	let e = 0, r = t[n - 2], o = t[n - 1];
	for (let s = 0; s < n; s += 2) {
		const n = t[s], i = t[s + 1];
		e += r * i - n * o, r = n, o = i;
	}
	return e / 2;
}
function e(t, n) {
	return t.map((t) => {
		switch (t.type) {
			case "M":
			case "L": return {
				type: t.type,
				x: t.x * n,
				y: t.y * n
			};
			case "Q": return {
				type: "Q",
				x1: t.x1 * n,
				y1: t.y1 * n,
				x: t.x * n,
				y: t.y * n
			};
			case "C": return {
				type: "C",
				x1: t.x1 * n,
				y1: t.y1 * n,
				x2: t.x2 * n,
				y2: t.y2 * n,
				x: t.x * n,
				y: t.y * n
			};
			case "A": return {
				...t,
				rx: t.rx * n,
				ry: t.ry * n,
				x: t.x * n,
				y: t.y * n
			};
			case "Z": return t;
		}
	});
}
function r(t, n, e, r) {
	const o = t * e + n * r, s = Math.hypot(t, n) * Math.hypot(e, r);
	let i = Math.acos(Math.min(1, Math.max(-1, 0 === s ? 1 : o / s)));
	return t * r - n * e < 0 && (i = -i), i;
}
function o(t, n, e) {
	let o = Math.abs(e.rx), s = Math.abs(e.ry);
	if (0 === o || 0 === s) return null;
	const i = e.rotation * Math.PI / 180, c = Math.cos(i), a = Math.sin(i), l = (t - e.x) / 2, h = (n - e.y) / 2, u = c * l + a * h, f = -a * l + c * h, y = u * u / (o * o) + f * f / (s * s);
	if (y > 1) {
		const t = Math.sqrt(y);
		o *= t, s *= t;
	}
	const x = o * o * s * s - o * o * f * f - s * s * u * u, p = o * o * f * f + s * s * u * u;
	let M = p <= 0 ? 0 : Math.sqrt(Math.max(0, x) / p);
	e.largeArc === e.sweep && (M = -M);
	const g = M * (o * f) / s, d = s * u * -M / o, m = c * g - a * d + (t + e.x) / 2, b = a * g + c * d + (n + e.y) / 2, w = r(1, 0, (u - g) / o, (f - d) / s);
	let A = r((u - g) / o, (f - d) / s, (-u - g) / o, (-f - d) / s) % (2 * Math.PI);
	return !e.sweep && A > 0 && (A -= 2 * Math.PI), e.sweep && A < 0 && (A += 2 * Math.PI), {
		cx: m,
		cy: b,
		rx: o,
		ry: s,
		phi: i,
		theta1: w,
		dTheta: A
	};
}
Object.freeze({
	mode: "color",
	maxDimension: 1600,
	supersample: 1,
	denoise: "none",
	blurRadius: 0,
	background: "auto",
	backgroundColor: "#ffffff",
	alphaThreshold: 8,
	segmentation: "quantize",
	paletteSize: 16,
	autoPaletteSize: !1,
	colorSpace: "oklab",
	quantizeQuality: 5,
	palette: null,
	layering: "stacked",
	geometry: "classic",
	frontEnd: "classic",
	minRegionArea: 6,
	preserveDetails: !1,
	dissolveBands: 0,
	colorCoherence: 0,
	gapFill: 0,
	omitBackground: !1,
	gradients: !1,
	gradientStrength: .5,
	gradientMinArea: 0,
	gradientMaxDimension: 384,
	threshold: 128,
	thresholdMode: "auto",
	adaptiveRadius: 16,
	adaptiveBias: 4,
	invert: !1,
	curveMode: "spline",
	turnPolicy: "minority",
	smoothing: .75,
	curveOptimize: !0,
	optTolerance: .2,
	cornerThreshold: 100,
	fitTolerance: 1.2,
	simplifyTolerance: .5,
	strokeWidth: 0,
	pruneLength: 8,
	fillColor: "#000000",
	precision: 1,
	optimizeSvg: !0,
	groupByColor: !1,
	unit: "px",
	widthMm: 0,
	svgTitle: "",
	detectIslands: !1
});
const s = .5 / 255, i = [
	4,
	-1,
	-1,
	-1,
	-1
];
(() => {
	const n = /* @__PURE__ */ new Float64Array(256);
	for (let e = 0; e < 256; e++) n[e] = t(e / 255);
})(), (() => {
	const t = [];
	for (let n = -2; n <= 2; n++) for (let e = -2; e <= 2; e++) (e || n) && t.push([e, n]);
})();
const c = Math.fround, a = /* @__PURE__ */ new Float32Array(1), l = new Uint32Array(a.buffer);
var h = class {
	a;
	base;
	size;
	start;
	inv;
	at;
	c1;
	c2;
	c3;
	c4;
	c5;
	constructor(t, n, e) {
		this.a = t, this.base = 256 * (127 + n), this.size = 256 * (e - n), this.start = new Float64Array(this.size), this.inv = new Float64Array(this.size), this.at = new Float64Array(this.size);
		for (let r = 0; r < this.size; r++) {
			l[0] = this.base + r << 15;
			const n = a[0];
			this.start[r] = n, this.inv[r] = 1 / n, this.at[r] = Math.pow(n, t);
		}
		this.c1 = t, this.c2 = this.c1 * (t - 1) / 2, this.c3 = this.c2 * (t - 2) / 3, this.c4 = this.c3 * (t - 3) / 4, this.c5 = this.c4 * (t - 4) / 5;
	}
	of(t) {
		a[0] = t;
		const n = (l[0] >>> 15) - this.base;
		if (n >= 0 && n < this.size) {
			const e = (t - this.start[n]) * this.inv[n], r = this.at[n] * (1 + e * (this.c1 + e * (this.c2 + e * (this.c3 + e * (this.c4 + e * this.c5))))), o = c(.9999999999999 * r);
			if (o === c(1.0000000000001 * r)) return o;
		}
		return c(Math.pow(t, this.a));
	}
};
const u = ["linearRgb", "srgb"], f = Math.fround, y = f(.04045), x = f(.0031308), p = f(12.92), M = f(.055), g = f(1.055), d = f(2.4), m = f(1 / d), b = new h(d, -4, 1), w = new h(m, -9, 1);
function A(t) {
	const n = Math.round(255 * t);
	return n > 0 && n <= 255 && F[n] === t ? v[n] : k(t);
}
function k(t) {
	return t <= y ? f(t / p) : b.of(f(f(t + M) / g));
}
const F = Float64Array.from({ length: 256 }, (t, n) => f(n / 255)), v = F.map(k);
function N(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function I(t) {
	return n = f(N(t, 0, 1)), f(n <= x ? n * p : f(g * w.of(n)) - M);
	var n;
}
function P(t, n) {
	return "linearRgb" === n ? function(t) {
		return [
			I(t[0]),
			I(t[1]),
			I(t[2])
		];
	}(t) : [
		f(N(t[0], 0, 1)),
		f(N(t[1], 0, 1)),
		f(N(t[2], 0, 1))
	];
}
function q(t, n, e, r) {
	const o = r[0] - e[0], s = r[1] - e[1], i = o * o + s * s;
	return i <= 0 ? 0 : N(((t - e[0]) * o + (n - e[1]) * s) / i, 0, 1);
}
function L(t, n, e, r, o, s, i) {
	if (r <= 0) return 0;
	const c = t - e[0], a = n - e[1];
	let l;
	if (1 === o) l = Math.sqrt(c * c + a * a);
	else {
		const t = c * i + a * s, n = (-c * s + a * i) * o;
		l = Math.sqrt(t * t + n * n);
	}
	return N(l / r, 0, 1);
}
var C = class {
	model;
	offsets;
	stops;
	lin;
	sn;
	cs;
	constructor(t) {
		this.model = t;
		let n = 0, e = 1;
		if ("flat" === t.kind) this.offsets = /* @__PURE__ */ new Float64Array(0), this.stops = Float64Array.from(t.color), this.lin = /* @__PURE__ */ new Float64Array(0);
		else {
			const r = t.mids.length;
			this.offsets = new Float64Array(r), this.stops = new Float64Array(3 * (r + 2)), this.stops.set(t.c0, 0);
			for (let n = 0; n < r; n++) this.offsets[n] = t.mids[n].offset, this.stops.set(t.mids[n].color, 3 * (n + 1));
			if (this.stops.set(t.c1, 3 * (r + 1)), "linearRgb" === t.interp) {
				this.lin = new Float64Array(this.stops.length);
				for (let t = 0; t < this.stops.length; t++) this.lin[t] = A(this.stops[t]);
			} else this.lin = /* @__PURE__ */ new Float64Array(0);
			"radial" === t.kind && 1 !== t.aspect && (n = Math.sin(t.angle), e = Math.cos(t.angle));
		}
		this.sn = n, this.cs = e;
	}
	tAt(t, n) {
		const e = this.model;
		return "flat" === e.kind ? 0 : "linear" === e.kind ? q(t, n, e.p0, e.p1) : L(t, n, e.c, e.r, e.aspect, this.sn, this.cs);
	}
	colorAt(t, n, e, r) {
		const o = this.model;
		if ("flat" === o.kind) return e[r] = this.stops[0], e[r + 1] = this.stops[1], void (e[r + 2] = this.stops[2]);
		const s = "linear" === o.kind ? q(t, n, o.p0, o.p1) : L(t, n, o.c, o.r, o.aspect, this.sn, this.cs);
		this.colorAtT(s, e, r);
	}
	colorAtT(t, n, e) {
		const r = this.stops;
		if ("flat" === this.model.kind) return n[e] = r[0], n[e + 1] = r[1], void (n[e + 2] = r[2]);
		const o = this.offsets;
		let s = o.length, i = t;
		if (s > 0) {
			let n = 0;
			for (let e = 0; e < o.length; e++) {
				const r = o[e];
				if (t <= r) {
					s = e, i = r > n ? (t - n) / (r - n) : 0;
					break;
				}
				n = r;
			}
			s === o.length && (i = n < 1 ? (t - n) / (1 - n) : 1);
		}
		const c = 3 * s;
		if ("linearRgb" === this.model.interp) {
			const t = this.lin;
			n[e] = I(t[c] + (t[c + 3] - t[c]) * i), n[e + 1] = I(t[c + 1] + (t[c + 4] - t[c + 1]) * i), n[e + 2] = I(t[c + 2] + (t[c + 5] - t[c + 2]) * i);
		} else {
			const t = f(i);
			n[e] = f(r[c] + f(f(r[c + 3] - r[c]) * t)), n[e + 1] = f(r[c + 1] + f(f(r[c + 4] - r[c + 1]) * t)), n[e + 2] = f(r[c + 2] + f(f(r[c + 5] - r[c + 2]) * t));
		}
	}
};
function $(t, n) {
	return {
		model: {
			kind: "flat",
			color: [
				f(t[0]),
				f(t[1]),
				f(t[2])
			]
		},
		chi2: 0,
		params: 3,
		cost: 3 * n
	};
}
function S(t) {
	return Math.max(Math.floor(t / 4096), 1);
}
function E(t, n, e, r) {
	const o = t % n, s = (t - o) / n;
	return o > 0 && o + 1 < n && s > 0 && s + 1 < e && r(t - 1) && r(t + 1) && r(t - n) && r(t + n);
}
function U(t, n, e, r, o, s, i) {
	const c = new Int32Array(r.length);
	let a = 0;
	for (let y = 0; y < r.length; y++) {
		const t = r[y];
		(null === s || s(t)) && (i && !E(t, n, e, o) || (c[a++] = t));
	}
	const l = function(t) {
		const n = t.length;
		let e = [0];
		for (let s = 1; s < n; s++) if (t[s] < t[s - 1] && (e.push(s), e.length > O)) return t.toSorted();
		let r = t.slice();
		if (1 === e.length) return r;
		let o = new Int32Array(n);
		for (; e.length > 1;) {
			const t = [];
			for (let i = 0; i < e.length; i += 2) {
				const s = e[i], c = i + 1 < e.length ? e[i + 1] : n, a = i + 2 < e.length ? e[i + 2] : n;
				let l = s, h = c, u = s;
				for (; l < c && h < a;) o[u++] = r[l] <= r[h] ? r[l++] : r[h++];
				for (; l < c;) o[u++] = r[l++];
				for (; h < a;) o[u++] = r[h++];
				t.push(s);
			}
			e = t;
			const s = r;
			r = o, o = s;
		}
		return r;
	}(c.subarray(0, a)), h = new Float64Array(a), u = new Float64Array(a), f = new Float32Array(3 * a);
	for (let y = 0; y < a; y++) {
		const e = l[y], r = e % n;
		h[y] = r, u[y] = (e - r) / n, f[3 * y] = t[3 * e], f[3 * y + 1] = t[3 * e + 1], f[3 * y + 2] = t[3 * e + 2];
	}
	return new z(l, h, u, f);
}
const O = 64;
var z = class {
	px;
	x;
	y;
	srgb;
	n;
	linear = null;
	wide = null;
	constructor(t, n, e, r) {
		this.px = t, this.x = n, this.y = e, this.srgb = r, this.n = t.length;
	}
	get lin() {
		if (null === this.linear) {
			const t = new Float64Array(this.srgb.length);
			for (let n = 0; n < t.length; n++) t[n] = A(this.srgb[n]);
			this.linear = t;
		}
		return this.linear;
	}
	get srgbWide() {
		return this.wide ??= Float64Array.from(this.srgb), this.wide;
	}
};
function T(t, n) {
	let e = 0, r = t.n - 1;
	const o = t.px;
	for (; e <= r;) {
		const t = e + r >>> 1, s = o[t];
		if (s === n) return t;
		s < n ? e = t + 1 : r = t - 1;
	}
	return -1;
}
function j(t) {
	const n = Math.max(t.n, 1);
	let e = 0, r = 0;
	for (let o = 0; o < t.n; o++) e += t.x[o];
	for (let o = 0; o < t.n; o++) r += t.y[o];
	return [e / n, r / n];
}
function X(t, n) {
	return "linearRgb" === n ? t.lin : t.srgbWide;
}
function R(t, n) {
	const e = Math.max(n, 1);
	let r = 0, o = 0, s = 0;
	for (let i = 0; i < n; i++) r += t[3 * i], o += t[3 * i + 1], s += t[3 * i + 2];
	return [
		r / e,
		o / e,
		s / e
	];
}
const Z = Math.PI / 180;
function V(t, n) {
	return t > n || Number.isNaN(n) ? t : n;
}
function Y(t, n) {
	return t < n || Number.isNaN(n) ? t : n;
}
function B(t, n, e) {
	let r = 0;
	for (let w = 0; w < e; w++) r += n[w];
	const o = r / e, s = R(t, e), [i, c, a] = s;
	let l = 0, h = 0, u = 0, f = 0, y = 0, x = 0, p = 0;
	for (let w = 0; w < e; w++) {
		const e = n[w] - o;
		l += e * e;
		const r = t[3 * w] - i, s = t[3 * w + 1] - c, M = t[3 * w + 2] - a;
		h += e * r, y += r * r, u += e * s, x += s * s, f += e * M, p += M * M;
	}
	const M = [
		h,
		u,
		f
	], g = [
		y,
		x,
		p
	], d = [
		0,
		0,
		0
	], m = [
		0,
		0,
		0
	];
	let b = 0;
	for (let w = 0; w < 3; w++) m[w] = l > 1e-12 ? M[w] / l : 0, d[w] = s[w] - m[w] * o, b += V(g[w] - m[w] * m[w] * l, 0);
	return {
		resid: b,
		a: d,
		g: m
	};
}
var D = class {
	xs;
	ys;
	cols;
	cbar;
	scc;
	t;
	constructor(t, n, e) {
		const r = n.length;
		this.cols = e, this.cbar = R(e, r);
		const o = [
			0,
			0,
			0
		];
		for (let s = 0; s < r; s++) for (let t = 0; t < 3; t++) {
			const n = e[3 * s + t] - this.cbar[t];
			o[t] += n * n;
		}
		this.scc = o, this.xs = new Float64Array(r), this.ys = new Float64Array(r);
		for (let s = 0; s < r; s++) this.xs[s] = t.x[n[s]], this.ys[s] = t.y[n[s]];
		this.t = new Float64Array(r);
	}
	radial(t, n) {
		const e = this.t;
		let r = 0;
		for (let o = 0; o < e.length; o++) {
			const s = this.xs[o] - t, i = this.ys[o] - n;
			e[o] = Math.sqrt(s * s + i * i), r += e[o];
		}
		return this.finish(r);
	}
	elliptic(t, n, e, r, o) {
		const s = this.t;
		let i = 0;
		for (let c = 0; c < s.length; c++) {
			const a = this.xs[c] - t, l = this.ys[c] - n, h = a * r + l * e, u = (-a * e + l * r) * o;
			s[c] = Math.sqrt(h * h + u * u), i += s[c];
		}
		return this.finish(i);
	}
	ellipticT(t, n, e, r, o) {
		const s = this.t;
		for (let i = 0; i < s.length; i++) {
			const c = this.xs[i] - t, a = this.ys[i] - n, l = c * r + a * e, h = (-c * e + a * r) * o;
			s[i] = Math.sqrt(l * l + h * h);
		}
	}
	finish(t) {
		const n = this.t, e = n.length, r = t / e;
		let o = 0, s = 0, i = 0, c = 0;
		const a = this.cols, [l, h, u] = this.cbar;
		for (let x = 0; x < e; x++) {
			const t = n[x] - r;
			o += t * t, s += t * (a[3 * x] - l), i += t * (a[3 * x + 1] - h), c += t * (a[3 * x + 2] - u);
		}
		const f = [
			s,
			i,
			c
		];
		let y = 0;
		for (let x = 0; x < 3; x++) {
			const t = o > 1e-12 ? f[x] / o : 0;
			y += V(this.scc[x] - t * t * o, 0);
		}
		return y;
	}
	finishSpline() {
		const t = this.scc[0] + this.scc[1] + this.scc[2], n = this.t;
		let e = Number.MAX_VALUE, r = -Number.MAX_VALUE;
		for (let p = 0; p < n.length; p++) e = Y(e, n[p]), r = V(r, n[p]);
		if (r - e <= 1e-9) return t;
		const o = (r - e) / 7, s = 7 - 1e-12, i = /* @__PURE__ */ new Float64Array(8), c = /* @__PURE__ */ new Float64Array(8), a = /* @__PURE__ */ new Float64Array(24), l = this.cols;
		for (let p = 0; p < n.length; p++) {
			const t = Y((n[p] - e) / o, s), r = t > 0 ? Math.floor(t) : 0, h = t - r, u = 1 - h, f = h;
			i[r] += u * u, i[r + 1] += f * f, c[r] += u * f;
			for (let n = 0; n < 3; n++) {
				const t = l[3 * p + n] - this.cbar[n];
				a[3 * r + n] += u * t, a[3 * (r + 1) + n] += f * t;
			}
		}
		for (let p = 0; p < 8; p++) i[p] += 1e-9;
		const h = /* @__PURE__ */ new Float64Array(8), u = /* @__PURE__ */ new Float64Array(8);
		u[0] = i[0], h[0] = c[0] / u[0];
		for (let p = 1; p < 8; p++) u[p] = i[p] - c[p - 1] * h[p - 1], h[p] = p + 1 < 8 ? c[p] / u[p] : 0;
		let f = 0;
		const y = /* @__PURE__ */ new Float64Array(8), x = /* @__PURE__ */ new Float64Array(8);
		for (let p = 0; p < 3; p++) {
			y[0] = a[p] / u[0];
			for (let t = 1; t < 8; t++) y[t] = (a[3 * t + p] - c[t - 1] * y[t - 1]) / u[t];
			x[7] = y[7];
			for (let t = 6; t >= 0; t--) x[t] = y[t] - h[t] * x[t + 1];
			for (let t = 0; t < 8; t++) f += x[t] * a[3 * t + p];
		}
		return V(t - f, 0);
	}
};
function Q(t, n) {
	const [e, r, o] = R(t, n);
	let s = 0, i = 0, c = 0, a = 0, l = 0, h = 0;
	for (let x = 0; x < n; x++) {
		const n = t[3 * x] - e, u = t[3 * x + 1] - r, f = t[3 * x + 2] - o;
		s += n * n, i += n * u, c += n * f, a += u * u, l += u * f, h += f * f;
	}
	const u = [
		[
			s,
			i,
			c
		],
		[
			i,
			a,
			l
		],
		[
			c,
			l,
			h
		]
	];
	if (u[0][0] + u[1][1] + u[2][2] <= 1e-12) return null;
	const f = 1 / Math.sqrt(3);
	let y = [
		f,
		f,
		f
	];
	for (let x = 0; x < 30; x++) {
		const t = [
			0,
			0,
			0
		];
		for (let e = 0; e < 3; e++) for (let n = 0; n < 3; n++) t[e] += u[e][n] * y[n];
		const n = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]);
		if (n <= 1e-15) return null;
		y = [
			t[0] / n,
			t[1] / n,
			t[2] / n
		];
	}
	return y;
}
function _(t, n, e) {
	const r = t.n;
	let o = 0, s = 0, i = 0, c = 0, a = 0;
	const l = S(r);
	for (let f = 0; f < r; f += l) {
		const r = t.px[f];
		if (r % e === 0 || r < e) continue;
		const l = T(t, r - 1), h = T(t, r + 1), u = T(t, r - e), y = T(t, r + e);
		if (l < 0 || h < 0 || u < 0 || y < 0) continue;
		const x = .5 * (n[h] - n[l]), p = .5 * (n[y] - n[u]), M = Math.sqrt(x * x + p * p);
		if (M <= 1e-9) continue;
		const g = -p / M, d = x / M, m = g * t.x[f] + d * t.y[f];
		o += M * g * g, s += M * g * d, i += M * d * d, c += M * g * m, a += M * d * m;
	}
	const h = o * i - s * s, u = o + i;
	return h > u * u * 1e-9 ? [(i * c - s * a) / h, (o * a - s * c) / h] : null;
}
function W(t) {
	let n = Number.MAX_VALUE, e = -Number.MAX_VALUE, r = Number.MAX_VALUE, o = -Number.MAX_VALUE;
	for (let s = 0; s < t.n; s++) n = Y(n, t.x[s]);
	for (let s = 0; s < t.n; s++) e = V(e, t.x[s]);
	for (let s = 0; s < t.n; s++) r = Y(r, t.y[s]);
	for (let s = 0; s < t.n; s++) o = V(o, t.y[s]);
	return {
		xmin: n,
		xmax: e,
		ymin: r,
		ymax: o,
		bw: V(e - n, 4),
		bh: V(o - r, 4)
	};
}
function G(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function K(t, n, e) {
	return [G(n, t.xmin - t.bw, t.xmax + t.bw), G(e, t.ymin - t.bh, t.ymax + t.bh)];
}
function H(t, n) {
	const e = Math.max(Math.floor(t / 1024), 1), r = t > 0 ? Math.ceil(t / e) : 0, o = new Int32Array(r), s = new Float64Array(3 * r);
	for (let i = 0; i < r; i++) {
		const t = i * e;
		o[i] = t, s[3 * i] = n[3 * t], s[3 * i + 1] = n[3 * t + 1], s[3 * i + 2] = n[3 * t + 2];
	}
	return {
		idx: o,
		cols: s
	};
}
function J(t, n, e) {
	const r = new Float64Array(n);
	for (let o = 0; o < n; o++) r[o] = t[3 * o] * e[0] + t[3 * o + 1] * e[1] + t[3 * o + 2] * e[2];
	return r;
}
const tt = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1]
];
function nt(t, n, e, r, o, s) {
	const i = new Float64Array(t.n);
	let c = -Number.MAX_VALUE;
	for (let a = 0; a < t.n; a++) {
		const l = t.x[a] - n, h = t.y[a] - e;
		if (1 === r) i[a] = Math.sqrt(l * l + h * h);
		else {
			const t = l * s + h * o, n = (-l * o + h * s) * r;
			i[a] = Math.sqrt(t * t + n * n);
		}
		c = V(c, i[a]);
	}
	return {
		rho: i,
		r: c
	};
}
function et(t, n, e, r, o, s, i, c) {
	const { a, g: l } = B(t, o, n);
	return {
		kind: "radial",
		c: [r[0], r[1]],
		r: s,
		c0: P(a, e),
		c1: P([
			a[0] + l[0] * s,
			a[1] + l[1] * s,
			a[2] + l[2] * s
		], e),
		interp: e,
		aspect: i,
		angle: c,
		mids: []
	};
}
function rt(t, n, e, r) {
	if ("radial" !== r.kind) return null;
	const { c: o, aspect: s, angle: i } = r, c = 1 === s ? 0 : Math.sin(i), a = 1 === s ? 1 : Math.cos(i), { rho: l, r: h } = nt(t, o[0], o[1], s, c, a);
	return h < .5 ? null : et(n, t.n, e, o, l, h, s, i);
}
const ot = [
	.01,
	.01,
	.001,
	.001
];
function st(t) {
	return {
		kind: "radial",
		c: [t[0], t[1]],
		r: 1,
		c0: [
			0,
			0,
			0
		],
		c1: [
			0,
			0,
			0
		],
		interp: "srgb",
		aspect: Math.exp(t[3]),
		angle: t[2],
		mids: []
	};
}
function it(t, n, e) {
	const r = 7 - 1e-12, o = (t - n) / e;
	return o < r ? o : r;
}
function ct(t) {
	return t > 0 ? Math.floor(t) : 0;
}
function at(t, n) {
	const e = /* @__PURE__ */ new Float64Array(8);
	e[0] = n[0] / t.m[0];
	for (let o = 1; o < 8; o++) e[o] = (n[o] - t.e[o - 1] * e[o - 1]) / t.m[o];
	const r = /* @__PURE__ */ new Float64Array(8);
	r[7] = e[7];
	for (let o = 6; o >= 0; o--) r[o] = e[o] - t.cp[o] * r[o + 1];
	return r;
}
function lt(t, n) {
	return !!Number.isNaN(t) || !Number.isNaN(n) && t >= n;
}
function ht(t, n, e) {
	const r = t.map((t) => t.slice()), o = n.slice();
	let s = 0;
	for (let c = 0; c < e; c++) s = V(s, Math.abs(r[c][c]));
	if (s <= 0 || !Number.isFinite(s)) return null;
	for (let c = 0; c < e; c++) {
		let t = c;
		for (let o = c + 1; o < e; o++) lt(Math.abs(r[o][c]), Math.abs(r[t][c])) && (t = o);
		if (Math.abs(r[t][c]) <= 1e-14 * s) return null;
		const n = r[c];
		r[c] = r[t], r[t] = n;
		const i = o[c];
		o[c] = o[t], o[t] = i;
		for (let s = c + 1; s < e; s++) {
			const t = r[s][c] / r[c][c];
			for (let n = c; n < e; n++) r[s][n] -= t * r[c][n];
			o[s] -= t * o[c];
		}
	}
	const i = [
		0,
		0,
		0,
		0
	];
	for (let c = e - 1; c >= 0; c--) {
		let t = o[c];
		for (let n = c + 1; n < e; n++) t -= r[c][n] * i[n];
		i[c] = t / r[c][c];
	}
	for (let c = 0; c < e; c++) if (!Number.isFinite(i[c])) return null;
	return i;
}
function ut(t, n) {
	return t.ellipticT(n[0], n[1], Math.sin(n[2]), Math.cos(n[2]), Math.exp(n[3])), t.finishSpline();
}
function ft(t, n, e, r, o, s, i, c) {
	const a = t.xs[n] - e[0], l = t.ys[n] - e[1], h = a * o + l * r, u = (-a * r + l * o) * s, f = Math.sqrt(h * h + u * u);
	f <= 1e-12 ? c.fill(0) : (c[0] = i > 0 ? (-h * o + u * s * r) / f : 0, c[1] = i > 1 ? (-h * r - u * s * o) / f : 0, c[2] = i > 2 ? h * u * (1 / s - s) / f : 0, c[3] = i > 3 ? u * u / f : 0);
}
function yt(t, n, e) {
	const r = function(t) {
		const n = t.t;
		let e = Number.MAX_VALUE, r = 0, o = -Number.MAX_VALUE, s = 0;
		for (let p = 0; p < n.length; p++) n[p] < e && (e = n[p], r = p), n[p] > o && (o = n[p], s = p);
		if (o - e <= 1e-9) return null;
		const i = (o - e) / 7, c = /* @__PURE__ */ new Float64Array(8), a = /* @__PURE__ */ new Float64Array(8), l = /* @__PURE__ */ new Float64Array(24), h = t.cols;
		for (let p = 0; p < n.length; p++) {
			const r = it(n[p], e, i), o = ct(r), s = r - o, u = 1 - s, f = s;
			c[o] += u * u, c[o + 1] += f * f, a[o] += u * f;
			for (let n = 0; n < 3; n++) {
				const e = h[3 * p + n] - t.cbar[n];
				l[3 * o + n] += u * e, l[3 * (o + 1) + n] += f * e;
			}
		}
		const u = /* @__PURE__ */ new Float64Array(8), f = /* @__PURE__ */ new Float64Array(8);
		u[0] = c[0] + 1e-9, f[0] = a[0] / u[0];
		for (let p = 1; p < 8; p++) u[p] = c[p] + 1e-9 - a[p - 1] * f[p - 1], f[p] = p + 1 < 8 ? a[p] / u[p] : 0;
		const y = {
			lo: e,
			loAt: r,
			hi: o,
			hiAt: s,
			h: i,
			x: /* @__PURE__ */ new Float64Array(24),
			m: u,
			cp: f,
			e: a
		}, x = /* @__PURE__ */ new Float64Array(8);
		for (let p = 0; p < 3; p++) {
			for (let n = 0; n < 8; n++) x[n] = l[3 * n + p];
			const t = at(y, x);
			for (let n = 0; n < 8; n++) y.x[3 * n + p] = t[n];
		}
		return y;
	}(t);
	if (null === r) return null;
	const o = Math.sin(n[2]), s = Math.cos(n[2]), i = Math.exp(n[3]), c = [
		0,
		0,
		0,
		0
	], a = [
		0,
		0,
		0,
		0
	], l = [
		0,
		0,
		0,
		0
	];
	ft(t, r.loAt, n, o, s, i, e, c), ft(t, r.hiAt, n, o, s, i, e, a);
	const h = [
		[
			0,
			0,
			0,
			0
		],
		[
			0,
			0,
			0,
			0
		],
		[
			0,
			0,
			0,
			0
		],
		[
			0,
			0,
			0,
			0
		]
	], u = [
		0,
		0,
		0,
		0
	], f = /* @__PURE__ */ new Float64Array(96), y = [
		0,
		0,
		0,
		0
	], x = t.t, p = t.cols, M = r.x;
	for (let g = 0; g < x.length; g++) {
		const d = it(x[g], r.lo, r.h), m = ct(d), b = d - m;
		ft(t, g, n, o, s, i, e, l);
		for (let t = 0; t < 4; t++) y[t] = (l[t] - c[t] - d * (a[t] - c[t]) / 7) / r.h;
		for (let n = 0; n < 3; n++) {
			const r = M[3 * m + n], o = M[3 * (m + 1) + n], s = o - r, i = (1 - b) * r + b * o, c = p[3 * g + n] - t.cbar[n] - i;
			for (let t = 0; t < e; t++) {
				const e = s * y[t];
				u[t] += e * c;
				const r = 8 * (4 * n + t);
				f[r + m] += (1 - b) * e, f[r + m + 1] += b * e;
				for (let n = 0; n <= t; n++) h[t][n] += e * s * y[n];
			}
		}
	}
	for (let g = 0; g < 3; g++) {
		const t = [];
		for (let n = 0; n < e; n++) t.push(at(r, f.subarray(8 * (4 * g + n), 8 * (4 * g + n + 1))));
		for (let n = 0; n < e; n++) for (let e = 0; e <= n; e++) {
			let r = 0;
			const o = 8 * (4 * g + n);
			for (let n = 0; n < 8; n++) r += f[o + n] * t[e][n];
			h[n][e] -= r;
		}
	}
	for (let g = 0; g < e; g++) for (let t = g + 1; t < e; t++) h[g][t] = h[t][g];
	return {
		a: h,
		b: u
	};
}
function xt(t, n, e, r) {
	let o = r(n), s = ut(t, o), i = 1, c = .001;
	for (; i < 60;) {
		const n = yt(t, o, e);
		if (null === n) break;
		const { a, b: l } = n;
		let h = 0;
		for (let t = 0; t < e; t++) h = V(h, a[t][t]);
		const u = 1e-12 * h;
		let f = !1;
		for (; i < 60 && c <= 1e10;) {
			const n = a.map((t) => t.slice());
			for (let t = 0; t < e; t++) n[t][t] += c * (a[t][t] + u);
			const h = ht(n, l, e);
			if (null === h) {
				c *= 4;
				continue;
			}
			const y = o.slice();
			for (let t = 0; t < e; t++) y[t] += h[t];
			const x = r(y), p = ut(t, x);
			if (i++, p < s) {
				const t = s - p;
				let n = 0;
				for (let r = 0; r < e; r++) n = V(n, Math.abs(x[r] - o[r]) / ot[r]);
				if (o = x, s = p, c = Math.max(.3 * c, 1e-12), f = !0, t <= 1e-9 * Math.max(s, 22250738585072014e-324) || n < 1) return {
					g: o,
					score: s
				};
				break;
			}
			c *= 4;
		}
		if (!f) break;
	}
	return {
		g: o,
		score: s
	};
}
const pt = .5 / 255, Mt = Math.fround, gt = 34028234663852886e22;
var dt = class {
	p;
	m;
	stride;
	constructor(t, n) {
		const e = S(n.n), r = n.n > 0 ? Math.ceil(n.n / e) : 0, o = new Float32Array(3 * r), s = new C(t);
		for (let i = 0; i < r; i++) s.colorAt(n.x[i * e], n.y[i * e], o, 3 * i);
		this.p = o, this.m = r, this.stride = e;
	}
	chi2(t, n) {
		const e = 1 / (n * n), r = this.p;
		let o = 0;
		for (let s = 0; s < this.m; s++) {
			const n = 3 * s * this.stride;
			for (let e = 0; e < 3; e++) {
				const i = Math.max(Math.abs(Mt(t.srgb[n + e] - r[3 * s + e])) - pt, 0);
				o += i * i;
			}
		}
		return 0 === this.m ? 0 : o * e * (t.n / this.m);
	}
	support(t, n) {
		const e = Mt(.25 * n), r = Mt(e * e), o = this.p;
		let s = 0;
		for (let i = 0; i < this.m; i++) {
			const n = Mt(o[3 * i] - t[0]), e = Mt(o[3 * i + 1] - t[1]), c = Mt(o[3 * i + 2] - t[2]);
			Mt(Mt(Mt(n * n) + Mt(e * e)) + Mt(c * c)) > r && s++;
		}
		return 0 === this.m ? 0 : s / this.m;
	}
	contrast() {
		const t = [
			gt,
			gt,
			gt
		], n = [
			-34028234663852886e22,
			-34028234663852886e22,
			-34028234663852886e22
		], e = this.p;
		for (let o = 0; o < this.m; o++) for (let r = 0; r < 3; r++) {
			const s = e[3 * o + r];
			s < t[r] && (t[r] = s), s > n[r] && (n[r] = s);
		}
		let r = 0;
		for (let o = 0; o < 3; o++) {
			const e = Mt(n[o] - t[o]);
			e > r && (r = e);
		}
		return r;
	}
};
const mt = 1e3;
function bt(t, n) {
	return !!Number.isNaN(t) || !Number.isNaN(n) && t >= n;
}
function wt(t, n, e) {
	const r = t.map((t) => t.slice()), o = n.map((t) => t.slice());
	for (let i = 0; i < e; i++) {
		let t = i;
		for (let o = i + 1; o < e; o++) bt(Math.abs(r[o][i]), Math.abs(r[t][i])) && (t = o);
		if (Math.abs(r[t][i]) < 1e-12) return null;
		const n = r[i];
		r[i] = r[t], r[t] = n;
		const s = o[i];
		o[i] = o[t], o[t] = s;
		const c = r[i], a = o[i];
		for (let l = i + 1; l < e; l++) {
			const t = r[l][i] / c[i];
			if (0 !== t) {
				for (let n = i; n < e; n++) r[l][n] -= t * c[n];
				for (let n = 0; n < 3; n++) o[l][n] -= t * a[n];
			}
		}
	}
	const s = [];
	for (let i = 0; i < e; i++) s.push([
		0,
		0,
		0
	]);
	for (let i = e - 1; i >= 0; i--) for (let t = 0; t < 3; t++) {
		let n = o[i][t];
		for (let o = i + 1; o < e; o++) n -= r[i][o] * s[o][t];
		s[i][t] = n / r[i][i];
	}
	return s;
}
function At(t) {
	const n = t * mt, e = n > 0 ? Math.floor(n) : 0;
	return e < 1e3 ? e : mt;
}
function kt(t) {
	return Math.min(t, mt) / mt;
}
const Ft = Float64Array.from({ length: 1002 }, (t, n) => kt(n));
var vt = class {
	prefix;
	mean;
	sysA = /* @__PURE__ */ new Float64Array(16);
	sysB = /* @__PURE__ */ new Float64Array(12);
	elimA = /* @__PURE__ */ new Float64Array(16);
	elimB = /* @__PURE__ */ new Float64Array(12);
	sol = /* @__PURE__ */ new Float64Array(12);
	nodeBuf = [
		0,
		0,
		0,
		0
	];
	coarse = new Float64Array(Math.ceil(62.5) + 2);
	priced = 0;
	constructor(t, n, e) {
		const r = t.length;
		let o = 0;
		const s = [
			0,
			0,
			0
		];
		for (let c = 0; c < r; c++) {
			const t = e[c];
			o += t;
			for (let e = 0; e < 3; e++) s[e] += t * n[3 * c + e];
		}
		this.mean = o > 0 ? [
			s[0] / o,
			s[1] / o,
			s[2] / o
		] : [
			0,
			0,
			0
		];
		const i = /* @__PURE__ */ new Float64Array(10020);
		for (let c = 0; c < r; c++) {
			const r = t[c], o = e[c], s = 10 * (At(r) + 1), a = n[3 * c] - this.mean[0], l = n[3 * c + 1] - this.mean[1], h = n[3 * c + 2] - this.mean[2];
			i[s] += o, i[s + 1] += o * r, i[s + 2] += o * r * r, i[s + 3] += o * a, i[s + 4] += o * l, i[s + 5] += o * h, i[s + 6] += o * r * a, i[s + 7] += o * r * l, i[s + 8] += o * r * h, i[s + 9] += o * (a * a + l * l + h * h);
		}
		for (let c = 10; c < i.length; c++) i[c] = i[c - 10] + i[c];
		this.prefix = i;
	}
	solve(t) {
		const n = t.length, e = this.fit(t, n);
		if (!Number.isFinite(e)) return null;
		const r = [];
		for (let o = 0; o < n; o++) r.push([
			this.sol[3 * o] + this.mean[0],
			this.sol[3 * o + 1] + this.mean[1],
			this.sol[3 * o + 2] + this.mean[2]
		]);
		return {
			sse: e,
			x: r
		};
	}
	fit(t, n) {
		const e = this.sysA, r = this.sysB, o = this.prefix;
		for (let l = 0; l < n; l++) {
			for (let t = 0; t < n; t++) e[4 * l + t] = 0;
			r[3 * l] = 0, r[3 * l + 1] = 0, r[3 * l + 2] = 0;
		}
		for (let l = 0; l < n - 1; l++) {
			const n = 10 * t[l], s = 10 * t[l + 1], i = o[s] - o[n], c = o[s + 1] - o[n + 1], a = o[s + 2] - o[n + 2], h = Ft[t[l]], u = Ft[t[l + 1]], f = u - h, y = f * f;
			e[4 * l + l] += (u * u * i - 2 * u * c + a) / y;
			const x = ((h + u) * c - h * u * i - a) / y;
			e[4 * l + l + 1] += x, e[4 * (l + 1) + l] += x, e[4 * (l + 1) + l + 1] += (h * h * i - 2 * h * c + a) / y;
			for (let t = 0; t < 3; t++) {
				const e = o[s + 3 + t] - o[n + 3 + t], i = o[s + 6 + t] - o[n + 6 + t];
				r[3 * l + t] += (u * e - i) / f, r[3 * (l + 1) + t] += (i - h * e) / f;
			}
		}
		for (let l = 0; l < n; l++) e[4 * l + l] += 1e-9;
		const s = this.elimA, i = this.elimB;
		for (let l = 0; l < n; l++) {
			for (let t = 0; t < n; t++) s[4 * l + t] = e[4 * l + t];
			i[3 * l] = r[3 * l], i[3 * l + 1] = r[3 * l + 1], i[3 * l + 2] = r[3 * l + 2];
		}
		for (let l = 0; l < n; l++) {
			let t = l;
			for (let e = l + 1; e < n; e++) bt(Math.abs(s[4 * e + l]), Math.abs(s[4 * t + l])) && (t = e);
			if (Math.abs(s[4 * t + l]) < 1e-12) return NaN;
			if (t !== l) {
				for (let e = 0; e < n; e++) {
					const n = s[4 * l + e];
					s[4 * l + e] = s[4 * t + e], s[4 * t + e] = n;
				}
				for (let n = 0; n < 3; n++) {
					const e = i[3 * l + n];
					i[3 * l + n] = i[3 * t + n], i[3 * t + n] = e;
				}
			}
			for (let e = l + 1; e < n; e++) {
				const t = s[4 * e + l] / s[4 * l + l];
				if (0 !== t) {
					for (let r = l; r < n; r++) s[4 * e + r] -= t * s[4 * l + r];
					for (let n = 0; n < 3; n++) i[3 * e + n] -= t * i[3 * l + n];
				}
			}
		}
		const c = this.sol;
		for (let l = n - 1; l >= 0; l--) for (let t = 0; t < 3; t++) {
			let e = i[3 * l + t];
			for (let r = l + 1; r < n; r++) e -= s[4 * l + r] * c[3 * r + t];
			c[3 * l + t] = e / s[4 * l + l];
		}
		let a = 0;
		for (let l = 0; l < n; l++) a += c[3 * l] * r[3 * l] + c[3 * l + 1] * r[3 * l + 1] + c[3 * l + 2] * r[3 * l + 2];
		return o[10019] - a;
	}
	scan(t, n, e) {
		const r = t.toSorted((t, n) => t - n), o = this.coarse;
		let s = 0;
		for (let h = n;; h += 16) {
			const t = Math.min(h, e);
			if (o[s++] = this.price(r, t), t === e) break;
		}
		const i = (t) => t + 1 < s ? n + 16 * t : e, c = [];
		for (let h = 0; h < s; h++) {
			const t = o[h];
			t !== 1 / 0 && (h > 0 && o[h - 1] < t || h + 1 < s && o[h + 1] < t || c.push(h));
		}
		if (0 === c.length) return this.best(r, n, e, -1, 0);
		c.sort((t, n) => o[t] - o[n] || t - n);
		let a = -1, l = 0;
		for (let h = 0; h < s; h++) o[h] !== 1 / 0 && (a < 0 || o[h] < l) && (a = i(h), l = o[h]);
		for (let h = 0; h < Math.min(c.length, 3); h++) {
			const t = c[h], o = t > 0 ? i(t - 1) + 1 : n, u = t + 1 < s ? i(t + 1) - 1 : e;
			for (let n = o; n <= u; n++) {
				const t = this.price(r, n);
				(t < l || t === l && n < a) && (a = n, l = t);
			}
		}
		return this.answer(r, a);
	}
	best(t, n, e, r, o) {
		for (let s = n; s <= e; s++) {
			const n = this.price(t, s);
			n !== 1 / 0 && (r < 0 || n < o) && (r = s, o = n);
		}
		return this.answer(t, r);
	}
	answer(t, n) {
		if (n < 0) return null;
		const e = [
			0,
			...t,
			n,
			1001
		].toSorted((t, n) => t - n), r = this.solve(e);
		return null === r ? null : {
			j: n,
			nodes: e,
			x: r.x
		};
	}
	price(t, n) {
		if (t.includes(n)) return 1 / 0;
		const e = this.nodeBuf;
		let r = 0;
		e[r++] = 0;
		let o = !1;
		for (const i of t) !o && n < i && (e[r++] = n, o = !0), e[r++] = i;
		o || (e[r++] = n), e[r++] = 1001, this.priced++;
		const s = this.fit(e, t.length + 3);
		return Number.isFinite(s) ? s : 1 / 0;
	}
};
function Nt(t, n, e, r, o) {
	const s = e.map(kt), i = s.length, c = new Float64Array(t.length);
	for (let a = 0; a < t.length; a++) {
		const e = t[a];
		let l = 0;
		for (; l < i && s[l] < e;) l++;
		l = Math.min(Math.max(l, 1), i - 1);
		const h = s[l - 1], u = s[l], f = u > h ? Math.min(Math.max((e - h) / (u - h), 0), 1) : 1;
		let y = 0;
		for (let t = 0; t < 3; t++) {
			const e = n[3 * a + t] - (r[l - 1][t] + (r[l][t] - r[l - 1][t]) * f);
			y += e * e;
		}
		const x = Math.sqrt(y);
		c[a] = x > o ? o / x : 1;
	}
	return c;
}
function It(t, n) {
	if (t.length !== n.length) return !1;
	for (let e = 0; e < t.length; e++) if (!Object.is(t[e], n[e])) return !1;
	return !0;
}
const Pt = Math.fround;
function qt(t, n, e, r) {
	const o = [
		0,
		0,
		0,
		0
	], s = [
		0,
		0,
		0,
		0
	], i = function() {
		const t = [];
		for (let n = 0; n < 4; n++) t.push([
			0,
			0,
			0
		]);
		return t;
	}();
	for (let a = 0; a < e.length; a++) {
		const r = n.j[a], c = n.u[a], l = e[a], h = 1 - c, u = c;
		o[r - 1] += l * h * h, s[r] += l * h * u, o[r] += l * u * u;
		for (let n = 0; n < 3; n++) i[r - 1][n] += l * h * t[3 * a + n], i[r][n] += l * u * t[3 * a + n];
	}
	const c = function() {
		const t = [];
		for (let n = 0; n < 4; n++) t.push([
			0,
			0,
			0,
			0
		]);
		return t;
	}();
	for (let a = 0; a < r; a++) c[a][a] = o[a] + 1e-9, a > 0 && (c[a][a - 1] = s[a]), a + 1 < r && (c[a][a + 1] = s[a + 1]);
	return {
		a: c,
		b: i
	};
}
function Lt(t, n, e, r, o) {
	let s = 0;
	for (let i = 0; i < 3; i++) {
		const c = t[3 * n + i] - (e[i] + (r[i] - e[i]) * o);
		s += c * c;
	}
	return Math.sqrt(s);
}
var Ct = class t {
	s;
	idx;
	t;
	c;
	weight;
	delta;
	span;
	kLo;
	kHi;
	scanned = /* @__PURE__ */ new Map();
	constructor(t, n, e, r, o, s, i, c, a) {
		this.s = t, this.idx = n, this.t = e, this.c = r, this.weight = o, this.delta = s, this.span = i, this.kLo = c, this.kHi = a;
	}
	static of(n, e, r, o, s) {
		const i = e.n, c = S(i), a = i > 0 ? Math.ceil(i / c) : 0;
		if (a < 64) return null;
		const l = new Int32Array(a);
		for (let t = 0; t < a; t++) l[t] = t * c;
		const h = new C(n), u = new Float64Array(a), f = new Float64Array(3 * a), y = new Float64Array(a), x = [
			0,
			0,
			0
		];
		for (let t = 0; t < a; t++) {
			const n = l[t];
			u[t] = h.tAt(e.x[n], e.y[n]), f[3 * t] = r[3 * n], f[3 * t + 1] = r[3 * n + 1], f[3 * t + 2] = r[3 * n + 2], void 0 !== s ? (x[0] = s.p[3 * t], x[1] = s.p[3 * t + 1], x[2] = s.p[3 * t + 2]) : h.colorAt(e.x[n], e.y[n], x, 0);
			let i = 0;
			for (let t = 0; t < 3; t++) {
				const e = "linearRgb" === o ? A(x[t]) : x[t], s = r[3 * n + t] - e;
				i += s * s;
			}
			y[t] = Math.sqrt(i);
		}
		const p = Math.max(4.4478 * St(y.slice(), a >> 1), 1 / 255), M = new Float64Array(a);
		for (let t = 0; t < a; t++) M[t] = y[t] > p ? p / y[t] : 1;
		const g = u.slice(), d = (t) => St(g, Math.round((a - 1) * t)), m = d(.02), b = d(.98), w = b - m;
		return w < .1 ? null : new t(e, l, u, f, M, p, w, m + .05 * w, b - .05 * w);
	}
	bestKnot(t) {
		const n = t.join(","), e = this.scanned.get(n);
		if (void 0 !== e) return e;
		const r = this.scanKnot(t);
		return this.scanned.set(n, r), r;
	}
	scanKnot(t) {
		const n = mt, e = t.map((t) => Et(Math.round(t * n))), r = Et(Math.max(Math.ceil(this.kLo * n - 1e-9), 1)), o = Math.min(Et(Math.floor(this.kHi * n + 1e-9)), 999);
		if (r > o) return null;
		const s = function(t, n, e, r, o, s, i) {
			let c = e, a = null;
			for (let l = 0; l < 3; l++) {
				const e = new vt(t, n, c).scan(o, s, i);
				if (null === e) break;
				if (a = e.j, l + 1 < 3) {
					const o = Nt(t, n, e.nodes, e.x, r);
					if (It(o, c)) break;
					c = o;
				}
			}
			return a;
		}(this.t, this.c, this.weight, this.delta, e, r, o);
		return null === s ? null : s / n;
	}
	cutsAMisfitSliver(t, n, e, r) {
		const o = this.s, s = n.indexOf(e), i = 0 === s ? -1 / 0 : n[s - 1], c = s + 1 < n.length ? n[s + 1] : 1 / 0, a = [[], []], l = new C(t), h = [
			0,
			0,
			0
		];
		for (let p = 0; p < this.idx.length; p++) {
			const t = this.t[p];
			if (t < i || t > c) continue;
			const n = this.idx[p];
			void 0 !== r ? (h[0] = r.p[3 * p], h[1] = r.p[3 * p + 1], h[2] = r.p[3 * p + 2]) : l.colorAt(o.x[n], o.y[n], h, 0);
			const s = Pt(h[0] - o.srgb[3 * n]), u = Pt(h[1] - o.srgb[3 * n + 1]), f = Pt(h[2] - o.srgb[3 * n + 2]);
			a[t >= e ? 1 : 0].push(Pt(Math.sqrt(Pt(Pt(Pt(s * s) + Pt(u * u)) + Pt(f * f)))));
		}
		const u = a[1].length < a[0].length ? 1 : 0, f = a[u].length < Math.floor(this.t.length / 10), y = $t(a[u]), x = $t(a[1 - u]);
		return f && y > 4 * Math.max(x, 1 / 255);
	}
};
function $t(t) {
	return 0 === t.length ? 0 : St(Float64Array.from(t), t.length >> 1);
}
function St(t, n) {
	for (let o = 0; o < t.length; o++) if (Number.isNaN(t[o])) return t.toSorted()[n];
	let e = 0, r = t.length - 1;
	for (; e < r;) {
		const o = t[e + r >> 1];
		let s = e, i = r;
		for (; s <= i;) {
			for (; t[s] < o;) s++;
			for (; t[i] > o;) i--;
			if (s <= i) {
				const n = t[s];
				t[s] = t[i], t[i] = n, s++, i--;
			}
		}
		if (n <= i) r = i;
		else {
			if (!(n >= s)) break;
			e = s;
		}
	}
	return t[n];
}
function Et(t) {
	return t > 0 ? t : 0;
}
var Ut = class {
	model;
	space;
	p;
	knots = [];
	ended;
	constructor(t, n, e, r, o) {
		this.model = t, this.space = r, this.p = Ct.of(t, n, e, r, o), this.ended = null === this.p;
	}
	get open() {
		return !this.ended && this.knots.length < 2;
	}
	next() {
		const t = this.p;
		if (!this.open || null === t) return null;
		const n = this.knots, e = t.bestKnot(n);
		if (null === e || n.some((n) => Math.abs(n - e) < .05 * t.span)) return this.end();
		n.push(e), n.sort((t, n) => t - n), 2 === n.length && function(t, n) {
			for (let e = 0; e < 1; e++) for (let r = 0; r < 2; r++) {
				const e = n[1 - r], o = t.bestKnot([e]);
				null !== o && (Math.abs(o - e) < .05 * t.span || (n[r] = o, n.sort((t, n) => t - n)));
			}
		}(t, n);
		const r = function(t, n, e, r, o, s) {
			const i = [
				0,
				...e,
				1
			], c = i.length, a = function(t, n) {
				const e = n.length, r = new Int32Array(t.length), o = new Float64Array(t.length);
				for (let s = 0; s < t.length; s++) {
					const i = t[s];
					let c = 0;
					for (; c < e && n[c] < i;) c++;
					c = Math.min(Math.max(c, 1), e - 1);
					const a = n[c - 1], l = n[c];
					r[s] = c, o[s] = l > a ? Math.min(Math.max((i - a) / (l - a), 0), 1) : 1;
				}
				return {
					j: r,
					u: o
				};
			}(n, i);
			let l = r, h = [];
			for (let f = 0; f <= s; f++) {
				if (f > 0) {
					l === r && (l = new Float64Array(r.length));
					for (let e = 0; e < n.length; e++) {
						const n = a.j[e], r = Lt(t, e, h[n - 1], h[n], a.u[e]);
						l[e] = r > o ? o / r : 1;
					}
				}
				const { a: e, b: s } = qt(t, a, l, c), i = wt(e, s, c);
				if (null === i) return null;
				h = i;
			}
			let u = 0;
			for (let f = 0; f < n.length; f++) {
				const n = a.j[f], e = Lt(t, f, h[n - 1], h[n], a.u[f]);
				u += e > o ? o * (2 * e - o) : e * e;
			}
			return {
				objective: u,
				x: h
			};
		}(t.c, t.t, n, t.weight, t.delta, 2);
		if (null === r) return this.end();
		const o = r.x, s = o.length, i = this.space, c = n.map((t, n) => ({
			offset: t,
			color: P(o[n + 1], i)
		})), a = function(t, n, e, r) {
			return "flat" === t.kind ? t : {
				...t,
				c0: n,
				mids: e,
				c1: r
			};
		}(this.model, P(o[0], i), c, P(o[s - 1], i)), l = 2 === n.length ? n.slice() : [e], h = new dt(a, t.s);
		return l.some((e) => t.cutsAMisfitSliver(a, n, e, h)) ? this.end() : {
			model: a,
			preds: h
		};
	}
	end() {
		return this.ended = !0, null;
	}
};
const Ot = {
	stopGeometries: 3,
	radialsPerSpace: !1
}, zt = 1.5 / 255;
function Tt(n, e, r, o, s, i = 16, c = Ot) {
	const a = o > 0 ? o : .5 / 255, l = (t, e) => {
		const r = e.chi2(n, a), o = function(t) {
			switch (t.kind) {
				case "flat": return 3;
				case "linear": return 10 + 4 * t.mids.length;
				case "radial": return (1 === t.aspect ? 9 : 11) + 4 * t.mids.length;
			}
		}(t);
		return {
			model: t,
			chi2: r,
			params: o,
			cost: .5 * r + s * o
		};
	}, h = function(t) {
		const n = t.n;
		if (0 === n) return {
			kind: "flat",
			color: [
				0,
				0,
				0
			]
		};
		const e = S(n), r = Math.ceil(n / e), o = new Float32Array(r), s = [
			0,
			0,
			0
		];
		for (let i = 0; i < 3; i++) {
			for (let n = 0; n < r; n++) o[n] = t.srgb[3 * n * e + i];
			o.sort(), s[i] = o[r >> 1];
		}
		return {
			kind: "flat",
			color: s
		};
	}(n), f = "flat" === h.kind ? h.color : [
		0,
		0,
		0
	], y = [l(h, new dt(h, n))];
	if (!r || n.n < i) return y;
	if (y[0].cost <= 9 * s) return y;
	const x = Math.max(3 * a, zt), p = (n, e) => {
		const r = e.contrast();
		return r >= x && e.support(f, r) >= .1 && !function(n) {
			if ("flat" === n.kind) return !1;
			const e = [
				n.c0,
				n.c1,
				...n.mids.map((t) => t.color)
			].map((n) => function(n, e, r) {
				const o = t(n), s = t(e), i = t(r), c = Math.cbrt(.4122214708 * o + .5363325363 * s + .0514459929 * i), a = Math.cbrt(.2119034982 * o + .6806995451 * s + .1073969566 * i), l = Math.cbrt(.0883024619 * o + .2817188376 * s + .6299787005 * i);
				return [
					.2104542553 * c + .793617785 * a - .0040720468 * l,
					1.9779984951 * c - 2.428592205 * a + .4505937099 * l,
					.0259040371 * c + .7827717662 * a - .808675766 * l
				];
			}(n[0], n[1], n[2]));
			for (let t = 0; t < e.length; t++) for (let n = t + 1; n < e.length; n++) {
				const r = e[t][0] - e[n][0], o = e[t][1] - e[n][1], s = e[t][2] - e[n][2];
				if (Math.sqrt(r * r + o * o + s * s) >= .02) return !1;
			}
			return !0;
		}(n);
	}, M = [];
	for (const { space: t, cols: k, cands: F } of function(t, n, e) {
		const r = (e, r) => {
			const o = function(t, n, e, r) {
				const o = t.n;
				if (o < 16) return null;
				const s = Q(n, o);
				if (null === s) return null;
				const i = J(n, o, s), c = W(t);
				let a = _(t, i, r) ?? j(t);
				a = K(c, a[0], a[1]);
				const l = H(o, n), h = new D(t, l.idx, l.cols);
				let u = h.radial(a[0], a[1]), f = 4, y = 0;
				for (; f > .03 && y < 600;) {
					let t = !1;
					for (const [n, e] of tt) {
						const r = K(c, a[0] + n * f, a[1] + e * f), o = h.radial(r[0], r[1]);
						if (y++, o < u - 1e-12) {
							u = o, a = r, t = !0;
							break;
						}
					}
					t || (f *= .5);
				}
				const { rho: x, r: p } = nt(t, a[0], a[1], 1, 0, 1);
				return p < .5 ? null : et(n, o, e, a, x, p, 1, 0);
			}(t, e, r, n), s = null === o ? null : function(t, n, e, r) {
				if ("radial" !== r.kind) return null;
				const o = t.n;
				if (o < 32) return null;
				const s = H(o, n), i = new D(t, s.idx, s.cols), c = W(t), a = Math.log(8), l = (t) => {
					const [n, e] = K(c, t[0], t[1]);
					return [
						n,
						e,
						t[2],
						G(t[3], 0, a)
					];
				}, h = (t) => i.elliptic(t[0], t[1], Math.sin(t[2]), Math.cos(t[2]), Math.exp(t[3]));
				let u = [
					r.c[0],
					r.c[1],
					0,
					0
				], f = h(u);
				for (let m = 0; m < 180; m += 15) for (const t of [Math.log(2), Math.log(3)]) {
					const n = l([
						u[0],
						u[1],
						m * Z,
						t
					]), e = h(n);
					e < f - 1e-12 && (f = e, u = n);
				}
				const y = [
					1,
					1,
					10 * Z,
					.25
				];
				let x = 4, p = 0;
				for (; x > .03 && p < 800;) {
					let t = !1;
					t: for (let n = 0; n < 4; n++) for (const e of [1, -1]) {
						const r = u.slice();
						r[n] += e * x * y[n];
						const o = l(r), s = h(o);
						if (p++, s < f - 1e-12) {
							f = s, u = o, t = !0;
							break t;
						}
					}
					t || (x *= .5);
				}
				const M = Math.exp(u[3]);
				if (M < 1.02) return null;
				const { rho: g, r: d } = nt(t, u[0], u[1], M, Math.sin(u[2]), Math.cos(u[2]));
				return d < .5 ? null : et(n, o, e, [u[0], u[1]], g, d, M, u[2]);
			}(t, e, r, o), i = [];
			for (const t of [o, s]) null !== t && i.push(t);
			return i;
		}, o = e ? [] : r(X(t, "linearRgb"), "linearRgb"), s = function(t, n, e) {
			const r = t.n;
			if (r < 16) return [];
			const o = Q(n, r);
			if (null === o) return [];
			const s = _(t, J(n, r, o), e) ?? j(t), i = W(t), c = Math.log(8), a = (t) => {
				const [n, e] = K(i, t[0], t[1]);
				return [
					n,
					e,
					t[2],
					t[3] < 0 ? 0 : t[3] > c ? c : t[3]
				];
			}, l = H(r, n), h = new D(t, l.idx, l.cols), u = (n) => {
				const e = Math.sin(n[2]), o = Math.cos(n[2]), s = Math.exp(n[3]);
				let i = -Number.MAX_VALUE;
				for (let c = 0; c < r; c++) {
					const r = t.x[c] - n[0], a = t.y[c] - n[1], l = r * o + a * e, h = (-r * e + a * o) * s;
					i = V(i, Math.sqrt(l * l + h * h));
				}
				return i;
			}, f = xt(h, a([
				s[0],
				s[1],
				0,
				0
			]), 2, (t) => {
				const n = a(t);
				return [
					n[0],
					n[1],
					0,
					0
				];
			}).g;
			if (u(f) < .5) return [];
			const y = [st(f)];
			if (r < 32) return y;
			let x = a(f), p = ut(h, x);
			for (let g = 0; g < 180; g += 15) for (const t of [Math.log(2), Math.log(3)]) {
				const n = a([
					x[0],
					x[1],
					g * Z,
					t
				]), e = ut(h, n);
				e < p - 1e-12 && (p = e, x = n);
			}
			const M = xt(h, x, 4, a).g;
			return Math.exp(M[3]) >= 1.02 && u(M) >= .5 && y.push(st(M)), y;
		}(t, X(t, "srgb"), n);
		return u.map((n) => {
			const i = X(t, n), c = [], a = function(t, n, e) {
				const r = t.n;
				if (r < 16) return null;
				const [o, s] = j(t), [i, c, a] = R(n, r);
				let l = 0, h = 0, u = 0, f = 0, y = 0, x = 0, p = 0, M = 0, g = 0, d = 0, m = 0, b = 0;
				for (let P = 0; P < r; P++) {
					const e = t.x[P] - o, r = t.y[P] - s;
					l += e * e, h += e * r, u += r * r;
					const w = n[3 * P] - i, A = n[3 * P + 1] - c, k = n[3 * P + 2] - a;
					f += e * w, p += r * w, d += w * w, y += e * A, M += r * A, m += A * A, x += e * k, g += r * k, b += k * k;
				}
				const w = [
					f,
					y,
					x
				], A = [
					p,
					M,
					g
				], k = [
					d,
					m,
					b
				], F = l * u - h * h, v = l + u;
				if (F <= v * v * 1e-9) return null;
				let N = 0, I = 0, q = 0;
				for (let P = 0; P < 3; P++) {
					const t = (u * w[P] - h * A[P]) / F, n = (l * A[P] - h * w[P]) / F;
					N += t * t, I += t * n, q += n * n;
				}
				const L = .5 * Math.atan2(2 * I, N - q), C = k[0] + k[1] + k[2], $ = (t) => {
					const n = Math.cos(t), e = Math.sin(t), r = n * n * l + 2 * n * e * h + e * e * u;
					if (r <= 1e-12) return Number.MAX_VALUE;
					let o = 0;
					for (let s = 0; s < 3; s++) {
						const t = n * w[s] + e * A[s];
						o += t * t / r;
					}
					return C - o;
				}, S = Z;
				let E = L, U = $(L);
				for (let P = -45; P <= 45; P++) {
					const t = L + P * S, n = $(t);
					n < U && (E = t, U = n);
				}
				let O = E - S, z = E + S;
				const T = .5 * (Math.sqrt(5) - 1);
				let X = z - T * (z - O), D = O + T * (z - O), Q = $(X), _ = $(D);
				for (let P = 0; P < 40; P++) Q < _ ? (z = D, D = X, _ = Q, X = z - T * (z - O), Q = $(X)) : (O = X, X = D, Q = _, D = O + T * (z - O), _ = $(D));
				const W = .5 * (O + z), G = Math.cos(W), K = Math.sin(W), H = new Float64Array(r);
				let J = Number.MAX_VALUE, tt = -Number.MAX_VALUE;
				for (let P = 0; P < r; P++) H[P] = (t.x[P] - o) * G + (t.y[P] - s) * K, J = Y(J, H[P]), tt = V(tt, H[P]);
				if (tt - J < 1e-6) return null;
				const nt = B(n, H, r), et = (t) => [
					nt.a[0] + nt.g[0] * t,
					nt.a[1] + nt.g[1] * t,
					nt.a[2] + nt.g[2] * t
				];
				return {
					kind: "linear",
					p0: [o + J * G, s + J * K],
					p1: [o + tt * G, s + tt * K],
					c0: P(et(J), e),
					c1: P(et(tt), e),
					interp: e,
					mids: []
				};
			}(t, i, n);
			null !== a && c.push(a), e && c.push(...r(i, n));
			for (const e of [...o, ...s]) {
				const r = "linearRgb" === n && o.includes(e) ? e : rt(t, i, n, e);
				null !== r && c.push(r);
			}
			return {
				space: n,
				cols: i,
				cands: c
			};
		});
	}(n, e, c.radialsPerSpace)) for (const e of F) {
		const r = new dt(e, n);
		if (!p(e, r)) continue;
		const o = new Ut(e, n, k, t, r), s = [l(e, r)], i = o.next();
		null !== i && p(i.model, i.preds) && s.push(l(i.model, i.preds));
		let c = s[0].cost;
		for (const t of s) c = Y(c, t.cost);
		M.push({
			i: M.length,
			fits: s,
			stops: o,
			best: c
		});
	}
	if (0 === M.length) return y;
	const g = (t) => {
		for (let n = t.stops.next(); null !== n; n = t.stops.next()) p(n.model, n.preds) && t.fits.push(l(n.model, n.preds));
	}, d = () => {
		let t = 1 / 0;
		for (const n of M) for (const e of n.fits) t = Y(t, e.chi2);
		return t;
	}, m = function(t, n) {
		const e = t.n;
		if (e < 2) return 1 / 0;
		const r = S(e), o = Math.ceil(e / r);
		if (o < 4) return 1 / 0;
		const s = new Int32Array(o);
		for (let g = 0; g < o; g++) s[g] = g * r;
		const i = t.srgb, c = [
			0,
			0,
			0
		];
		for (let g = 0; g < o; g++) for (let t = 0; t < 3; t++) c[t] += i[3 * s[g] + t];
		for (let g = 0; g < 3; g++) c[g] /= o;
		const a = function(t, n, e) {
			let r = [
				1,
				1,
				1
			];
			const o = t.srgb;
			for (let s = 0; s < 8; s++) {
				let t = 0, s = 0, i = 0;
				for (let a = 0; a < n.length; a++) {
					const c = n[a], l = o[3 * c] - e[0], h = o[3 * c + 1] - e[1], u = o[3 * c + 2] - e[2], f = l * r[0] + h * r[1] + u * r[2];
					t += f * l, s += f * h, i += f * u;
				}
				const c = Math.sqrt(t * t + s * s + i * i);
				if (c < 1e-12) return null;
				r = [
					t / c,
					s / c,
					i / c
				];
			}
			return r;
		}(t, s, c);
		if (null === a) return 1 / 0;
		const l = new Float64Array(o);
		let h = Number.MAX_VALUE, u = -Number.MAX_VALUE;
		for (let g = 0; g < o; g++) {
			const t = s[g];
			l[g] = (i[3 * t] - c[0]) * a[0] + (i[3 * t + 1] - c[1]) * a[1] + (i[3 * t + 2] - c[2]) * a[2], h = Y(h, l[g]), u = V(u, l[g]);
		}
		if (u - h < 1e-12) return 1 / 0;
		let f = .5 * (h + u);
		for (let g = 0; g < 24; g++) {
			let t = 0, n = 0, e = 0, r = 0;
			for (let s = 0; s < o; s++) l[s] < f ? (t += l[s], n++) : (e += l[s], r++);
			if (0 === n || 0 === r) return 1 / 0;
			f = .5 * (t / n + e / r);
		}
		const y = [[
			0,
			0,
			0
		], [
			0,
			0,
			0
		]], x = [0, 0];
		for (let g = 0; g < o; g++) {
			const t = l[g] < f ? 0 : 1;
			x[t]++;
			for (let n = 0; n < 3; n++) y[t][n] += i[3 * s[g] + n];
		}
		if (0 === x[0] || 0 === x[1]) return 1 / 0;
		const p = [[
			y[0][0] / x[0],
			y[0][1] / x[0],
			y[0][2] / x[0]
		], [
			y[1][0] / x[1],
			y[1][1] / x[1],
			y[1][2] / x[1]
		]];
		let M = 0;
		for (let g = 0; g < o; g++) {
			const t = l[g] < f ? 0 : 1;
			for (let n = 0; n < 3; n++) {
				const e = Math.max(Math.abs(i[3 * s[g] + n] - p[t][n]) - pt, 0);
				M += e * e;
			}
		}
		return M / (n * n) * (e / o);
	}(n, a), b = (t) => Number.isFinite(m) && Number.isFinite(t) && m < .85 * t, w = M.filter((t) => t.stops.open);
	w.sort((t, n) => t.best - n.best || t.i - n.i);
	const A = c.stopGeometries;
	for (const t of w.slice(0, A)) g(t);
	if (w.length > A && b(d())) for (const t of w.slice(A)) g(t);
	if (b(d())) return y;
	for (const t of M) y.push(...t.fits);
	return y;
}
Object.freeze({
	sigmaNoise: 0,
	lambda: 0,
	noiseSigmas: 0,
	sameInkDe00: 0
});
const jt = Math.fround, Rt = (jt(1 / (jt(.04045), jt(.0031308), jt(12.92), jt(.055), jt(1.055), jt(2.4))), [
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(jt), [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(jt), [
	.39633778,
	.21580376,
	-.105561346,
	-.06385417,
	-.08948418,
	-1.2914855
].map(jt), [
	4.0767417,
	-3.3077116,
	.23096994,
	-1.268438,
	2.6097574,
	-.34131938,
	-.004196086,
	-.7034186,
	1.7076147
].map(jt), jt(.05), jt(.15), jt(.06), jt(.02), Math.fround), Zt = (Rt(.4), Rt(.8), (0, Math.fround)(1e-12), Math.fround), Vt = (Float32Array.from({ length: 256 }, (t, n) => n / 255), Zt(.2126), Zt(.7152), Zt(.0722), Zt(2 / 255), Zt(1e-6), Zt(24 / 255), Object.freeze({
	edges: 0,
	softFraction: 0,
	width: 1,
	featureP10: 1 / 0,
	cores: 0,
	sharpFraction: 0
}), 4294967295), Yt = Math.fround, Bt = Yt(1e-9);
function Dt(t, n, e) {
	return Yt(Yt(Yt(t * t) + Yt(n * n)) + Yt(e * e));
}
const Qt = Math.fround;
[
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(Qt), [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(Qt);
const _t = /* @__PURE__ */ new Int32Array(0);
var Wt = class {
	source;
	group;
	compLabel;
	ink;
	nInk;
	nPal;
	size;
	fitter;
	buf;
	constructor(t) {
		this.source = t;
		const { labels: n, rgb: e, w: r, h: o, inkRgb: s, sigmaNoise: i, lambda: c, regionRecovery: a } = t;
		this.nInk = Math.floor(s.length / 3);
		let l = this.nInk;
		for (let M = 0; M < n.length; M++) n[M] + 1 > l && (l = n[M] + 1);
		this.nPal = l;
		const { comp: h, members: u, compLabel: f } = function(t, n, e) {
			const r = n * e, o = new Int32Array(r).fill(-1), s = new Int32Array(r), i = new Int32Array(r), c = [], a = [];
			for (let l = 0; l < r; l++) {
				if (-1 !== o[l]) continue;
				const e = c.length, h = t[l];
				let u = 0, f = 0;
				for (s[u++] = l, o[l] = e; u > 0;) {
					const c = s[--u];
					i[f++] = c;
					const a = c % n;
					a > 0 && -1 === o[c - 1] && t[c - 1] === h && (o[c - 1] = e, s[u++] = c - 1), a + 1 < n && -1 === o[c + 1] && t[c + 1] === h && (o[c + 1] = e, s[u++] = c + 1), c >= n && -1 === o[c - n] && t[c - n] === h && (o[c - n] = e, s[u++] = c - n), c + n < r && -1 === o[c + n] && t[c + n] === h && (o[c + n] = e, s[u++] = c + n);
				}
				c.push(i.slice(0, f)), a.push(h);
			}
			return {
				comp: o,
				members: c,
				compLabel: a
			};
		}(n, r, o);
		this.group = h, this.buf = u, this.size = Int32Array.from(u, (t) => t.length), this.compLabel = f, this.ink = new Float32Array(3 * l);
		for (let M = 0; M < 3 * this.nInk; M++) this.ink[M] = s[M];
		const y = function(t, n, e, r, o, s, i) {
			const c = n * e, a = Math.floor(o.length / 3), l = Float32Array.from(o), h = Yt(Math.max(3 * s * Math.sqrt(3), 2 / 255)), u = Yt(h * h), f = new Uint32Array(3 * c).fill(Vt), y = /* @__PURE__ */ new Int32Array(8), x = /* @__PURE__ */ new Uint32Array(3);
			for (let p = 0; p < c; p++) {
				const o = r[p];
				if (o < 0 || o >= a) continue;
				const s = l[3 * o], c = l[3 * o + 1], h = l[3 * o + 2], M = Yt(t[3 * p] - s), g = Yt(t[3 * p + 1] - c), d = Yt(t[3 * p + 2] - h);
				if (Dt(M, g, d) <= u) continue;
				const m = p % n, b = (p - m) / n, w = Math.max(m - 2, 0), A = Math.min(m + 2, n - 1), k = Math.max(b - 2, 0), F = Math.min(b + 2, e - 1);
				let v = 0;
				x.fill(Vt);
				let N = 0;
				t: for (let t = k; t <= F; t++) for (let e = w; e <= A; e++) {
					const f = r[t * n + e];
					if (f === o || f < 0 || f >= a) continue;
					let p = !1;
					for (let t = 0; t < v; t++) if (y[t] === f) {
						p = !0;
						break;
					}
					if (p) continue;
					v < y.length && (y[v++] = f);
					const m = Yt(l[3 * f] - s), b = Yt(l[3 * f + 1] - c), w = Yt(l[3 * f + 2] - h), A = Dt(m, b, w);
					if (A <= Bt) continue;
					const k = Yt(Yt(Yt(Yt(M * m) + Yt(g * b)) + Yt(d * w)) / A);
					if (!(k <= 0 || k >= 1) && Dt(Yt(M - Yt(k * m)), Yt(g - Yt(k * b)), Yt(d - Yt(k * w))) <= u) {
						if (3 === N) {
							x.fill(4294967294);
							break t;
						}
						if (x[N++] = t * n + e, !i) break t;
					}
				}
				f[3 * p] = x[0], f[3 * p + 1] = x[1], f[3 * p + 2] = x[2];
			}
			return f;
		}(e, r, o, n, this.ink, i, a), x = new Uint8Array(r * o);
		for (let M = 0; M < x.length; M++) x[M] = 4294967295 === y[3 * M] ? 1 : 0;
		const p = t.scale;
		this.fitter = {
			rgb: e,
			w: r,
			h: o,
			sigmaNoise: i,
			lambda: c,
			pure: x,
			partner: y,
			gradients: t.gradients,
			minPixels: 16 * p * p,
			search: t.search
		};
	}
	get count() {
		return this.buf.length;
	}
	members(t) {
		return this.buf[t].subarray(0, this.size[t]);
	}
	absorb(t, n) {
		const e = this.members(n);
		for (let o = 0; o < e.length; o++) this.group[e[o]] = t;
		const r = this.size[t] + e.length;
		if (r > this.buf[t].length) {
			const n = new Int32Array(Math.max(r, 2 * this.buf[t].length));
			n.set(this.members(t), 0), this.buf[t] = n;
		}
		this.buf[t].set(e, this.size[t]), this.size[t] = r, this.buf[n] = _t, this.size[n] = 0;
	}
	apply(t) {
		for (let n = 0; n + 1 < t.length; n += 2) this.absorb(t[n], t[n + 1]);
	}
	fit(t, n, e) {
		const { rgb: r, w: o, h: s, sigmaNoise: i, lambda: c, pure: a, partner: l, gradients: h, minPixels: u } = this.fitter, f = this.group, y = (e) => f[e] === t || f[e] === n;
		return function(t, n, e, r, o, s, i, c, a, l = !0, h = 16, u = Ot) {
			const f = r.length + o.length, y = function(t, n) {
				const e = t.length, r = e + n.length, o = r <= 65536 ? 1 : Math.floor(r / 65536), s = new Int32Array(Math.ceil(r / o));
				let i = 0;
				for (let c = 0; c < r; c += o) s[i++] = c < e ? t[c] : n[c - e];
				return s;
			}(r, o), x = function(t) {
				let n = 0;
				for (let e = 1; e < t.length; e++) t[e].cost < t[n].cost && (n = e);
				return t[n];
			}(function(t, n, e, r, o, s, i, c, a = !0, l = 16, h = Ot) {
				if (0 === r.length) return [$([
					0,
					0,
					0
				], c)];
				let u;
				const f = U(t, n, e, r, o, s, !0);
				if (f.n > 0) u = Tt(f, n, a, i, c, l, h);
				else {
					const a = U(t, n, e, r, o, s, !1);
					u = a.n > 0 ? Tt(a, n, !1, i, c) : Tt(U(t, n, e, r, o, null, !1), n, !1, i, c);
				}
				return u.map((t) => {
					return {
						model: (n = t.model, function(t, n) {
							return "flat" === t.kind ? t : "linear" === t.kind ? {
								...t,
								p0: [t.p0[0] + n, t.p0[1] + n],
								p1: [t.p1[0] + n, t.p1[1] + n]
							} : {
								...t,
								c: [t.c[0] + n, t.c[1] + n]
							};
						}(n, .5)),
						chi2: t.chi2,
						params: t.params,
						cost: t.cost
					};
					var n;
				});
			}(t, n, e, y, s, i, c, a, l, h, u));
			if (y.length >= f) return x;
			const p = f / y.length, M = x.cost - .5 * x.chi2, g = x.chi2 * p;
			return {
				model: x.model,
				params: x.params,
				chi2: g,
				cost: M + .5 * g
			};
		}(r, o, s, this.members(t), t === n ? _t : this.members(n), y, (t) => 1 === a[t] || e && function(t, n, e) {
			if (4294967294 === t[3 * n]) return !1;
			for (let r = 0; r < 3; r++) {
				const o = t[3 * n + r];
				if (4294967295 === o) break;
				if (!e(o)) return !1;
			}
			return !0;
		}(l, t, y), i, c, h, u, this.fitter.search);
	}
};
const Gt = Math.fround, Kt = (Gt(.999), Gt(.02), Gt(.5), Gt(.05), Gt(.995), Gt(.005), Gt(.5), Gt(.4), Gt(.8), Math.fround), Jt = (Kt(1 + (Kt(.02), Kt(.004), Kt(.012), Kt(1.6), Kt(.04), Kt(.12), Kt(.02), Kt(1e-9), Kt(1e-12), Kt(.15))), Math.fround), tn = (Jt(.98), Jt(.05), [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1]
]);
function nn(t, e, r) {
	const { width: o, height: s } = t, i = new Uint8Array(t.data), c = (t, n) => t >= 0 && t < o && n >= 0 && n < s ? i[n * o + t] : 0, a = [], l = new Int32Array(o * s);
	let h = /* @__PURE__ */ new Int32Array(64);
	const u = new Int32Array(s), f = new Int32Array(s);
	for (let g = 0; g < s; g++) {
		const e = g * o;
		for (let s = 0; s < o; s++) {
			if (1 !== i[e + s]) continue;
			const o = y(s, g), c = Math.abs(n(o)), h = 1 === t.data[e + s], u = c >= r, f = l[e + s];
			M(o, h ? u ? a.length + 1 : f : -1), u && a.push({
				points: o,
				area: h ? c : -c,
				interiorX: s,
				interiorY: g,
				parent: f - 1
			});
		}
	}
	return a;
	function y(t, n) {
		const e = [];
		let r = t, o = n, s = 0;
		do {
			e.push(r, o);
			const [t, n] = tn[s], i = c(r + (t + n - 1) / 2, o + (n - t - 1) / 2), a = c(r + (t - n - 1) / 2, o + (n + t - 1) / 2);
			1 === a && 0 === i || (s = 1 === a && 1 === i ? s + 3 & 3 : 0 === a && 0 === i ? s + 1 & 3 : x(r, o, s));
			const [l, h] = tn[s];
			r += l, o += h;
		} while (r !== t || o !== n);
		return e;
	}
	function x(t, n, r) {
		const o = r + 3 & 3, s = r + 1 & 3;
		switch (e) {
			case "left":
			case "black": return o;
			case "right":
			case "white": return s;
			case "majority": return p(t, n) ? o : s;
			case "minority": return p(t, n) ? s : o;
		}
	}
	function p(t, n) {
		for (let e = 2; e < 5; e++) {
			let r = 0;
			for (let o = 1 - e; o <= e - 1; o++) r += c(t + o, n + e - 1) ? 1 : -1, r += c(t + e - 1, n + o - 1) ? 1 : -1, r += c(t + o - 1, n - e) ? 1 : -1, r += c(t - e, n + o) ? 1 : -1;
			if (r > 0) return !0;
			if (r < 0) return !1;
		}
		return !1;
	}
	function M(t, n) {
		const e = t.length;
		let r = 0, c = s, a = -1;
		for (let o = 0; o < e; o += 2) {
			const n = t[o + 1], s = t[(o + 3) % e];
			if (s === n) continue;
			const i = s < n ? s : n;
			u[i]++, i < c && (c = i), i > a && (a = i), r++;
		}
		if (0 === r) return;
		if (r > h.length) {
			let t = h.length;
			for (; t < r;) t *= 2;
			h = new Int32Array(t);
		}
		let y = 0;
		for (let o = c; o <= a; o++) f[o] = y, y += u[o];
		for (let o = 0; o < e; o += 2) {
			const n = t[o + 1], r = t[(o + 3) % e];
			r !== n && (h[f[r < n ? r : n]++] = t[o]);
		}
		for (let s = c; s <= a; s++) {
			const t = f[s], e = t - u[s];
			u[s] = 0;
			for (let n = e + 1; n < t; n++) {
				const t = h[n];
				let r = n - 1;
				for (; r >= e && h[r] > t;) h[r + 1] = h[r], r--;
				h[r + 1] = t;
			}
			const r = s * o;
			for (let o = e; o + 1 < t; o += 2) {
				const t = h[o], e = h[o + 1];
				for (let n = t; n < e; n++) i[r + n] ^= 1;
				if (n >= 0) for (let o = t; o < e; o++) l[r + o] = n;
			}
		}
	}
}
function en(t) {
	const n = t.length >> 1, e = t[0], r = t[1], o = new Float64Array(n + 1), s = new Float64Array(n + 1), i = new Float64Array(n + 1), c = new Float64Array(n + 1), a = new Float64Array(n + 1);
	for (let l = 0; l < n; l++) {
		const n = t[2 * l] - e, h = t[2 * l + 1] - r;
		o[l + 1] = o[l] + n, s[l + 1] = s[l] + h, i[l + 1] = i[l] + n * n, c[l + 1] = c[l] + n * h, a[l + 1] = a[l] + h * h;
	}
	return {
		x: o,
		y: s,
		x2: i,
		xy: c,
		y2: a,
		ox: e,
		oy: r
	};
}
function rn(t, n, e, r) {
	const { x: o, y: s, x2: i, xy: c, y2: a, ox: l, oy: h } = n, u = r + 1 - e, f = o[r + 1] - o[e], y = s[r + 1] - s[e], x = i[r + 1] - i[e], p = c[r + 1] - c[e], M = a[r + 1] - a[e], g = (t[2 * e] + t[2 * r]) / 2 - l, d = (t[2 * e + 1] + t[2 * r + 1]) / 2 - h, m = t[2 * r] - t[2 * e], b = t[2 * r + 1] - t[2 * e + 1], w = b * b * ((x - 2 * f * g) / u + g * g) - 2 * m * b * ((p - f * d - y * g) / u + g * d) + m * m * ((M - 2 * y * d) / u + d * d);
	return Math.sqrt(Math.max(0, w));
}
function on(t, n, e, r) {
	const { x: o, y: s, x2: i, xy: c, y2: a, ox: l, oy: h } = n, u = r + 1 - e, f = (o[r + 1] - o[e]) / u, y = (s[r + 1] - s[e]) / u, x = (i[r + 1] - i[e]) / u - f * f, p = (c[r + 1] - c[e]) / u - f * y, M = (a[r + 1] - a[e]) / u - y * y, g = (x + M + Math.sqrt((x - M) * (x - M) + 4 * p * p)) / 2;
	let d = 0, m = 0;
	Math.abs(x - g) >= Math.abs(M - g) ? (d = -p, m = x - g) : (d = M - g, m = -p);
	const b = Math.hypot(d, m);
	if (b < 1e-12) {
		d = t[2 * r] - t[2 * e], m = t[2 * r + 1] - t[2 * e + 1];
		const n = Math.hypot(d, m);
		return n < 1e-12 ? {
			cx: f + l,
			cy: y + h,
			dx: 1,
			dy: 0
		} : {
			cx: f + l,
			cy: y + h,
			dx: d / n,
			dy: m / n
		};
	}
	return {
		cx: f + l,
		cy: y + h,
		dx: d / b,
		dy: m / b
	};
}
function sn(t, n, e, r) {
	const o = -e, s = -(r * t + o * n);
	return [
		r * r,
		r * o,
		r * s,
		r * o,
		o * o,
		o * s,
		r * s,
		o * s,
		s * s
	];
}
function cn(t, n) {
	const e = new Array(9);
	for (let r = 0; r < 9; r++) e[r] = t[r] + n[r];
	return e;
}
function an(t, n, e) {
	return t[0] * n * n + (t[1] + t[3]) * n * e + t[4] * e * e + (t[2] + t[6]) * n + (t[5] + t[7]) * e + t[8];
}
function ln(t, n, e, r) {
	const o = e.length, s = new Array(2 * o), i = o - 1, c = new Array(i);
	for (let a = 0; a < i; a++) {
		const { cx: r, cy: o, dx: s, dy: i } = on(t, n, e[a], e[a + 1]);
		c[a] = sn(r, o, s, i);
	}
	for (let a = 0; a < o; a++) {
		const n = t[2 * e[a]], o = t[2 * e[a] + 1];
		let l = null, h = null;
		if (a > 0 ? l = c[a - 1] : r && (l = c[i - 1]), a < i ? h = c[a] : r && (h = c[0]), !l || !h) {
			s[2 * a] = n, s[2 * a + 1] = o;
			continue;
		}
		const [u, f] = hn(cn(l, h), n, o);
		s[2 * a] = u, s[2 * a + 1] = f;
	}
	return r && (s[2 * (o - 1)] = s[0], s[2 * (o - 1) + 1] = s[1]), s;
}
function hn(t, n, e) {
	const r = 2 * t[0], o = t[1] + t[3], s = t[2] + t[6], i = o, c = 2 * t[4], a = t[5] + t[7], l = r * c - o * i;
	if (Math.abs(l) > 1e-9) {
		const t = (-s * c + a * o) / l, h = (-r * a + s * i) / l;
		if (Math.abs(t - n) <= .5 && Math.abs(h - e) <= .5) return [t, h];
	}
	let h = n, u = e, f = an(t, n, e);
	const y = (n, e) => {
		const r = an(t, n, e);
		r < f && (f = r, h = n, u = e);
	};
	for (const x of [n - .5, n + .5]) Math.abs(c) > 1e-12 && y(x, un((-o * x - a) / c, e - .5, e + .5)), y(x, e - .5), y(x, e + .5);
	for (const x of [e - .5, e + .5]) Math.abs(r) > 1e-12 && y(un((-i * x - s) / r, n - .5, n + .5), x), y(n - .5, x), y(n + .5, x);
	return [h, u];
}
function un(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function fn(t) {
	const n = t.length >> 1;
	if (n <= 2) return 2 === n ? [0, 1] : [0];
	const e = function(t) {
		const n = t.length >> 1, e = (n) => t[2 * n], r = (n) => t[2 * n + 1], o = new Int8Array(Math.max(0, n - 1));
		for (let u = 0; u < n - 1; u++) o[u] = yn(e(u + 1) - e(u), r(u + 1) - r(u));
		const s = new Int32Array(Math.max(0, n - 1));
		if (n >= 2) {
			s[n - 2] = n - 1;
			for (let t = n - 3; t >= 0; t--) s[t] = o[t + 1] !== o[t] ? t + 1 : s[t + 1];
		}
		const i = new Int32Array(n);
		i[n - 1] = n - 1;
		const c = /* @__PURE__ */ new Int32Array(4);
		for (let u = n - 2; u >= 0; u--) {
			c[0] = c[1] = c[2] = c[3] = 0, c[o[u]]++;
			let t = 0, a = 0, l = 0, h = 0, f = u, y = s[u], x = !1, p = !1;
			for (;;) {
				if (c[yn(Math.sign(e(y) - e(f)), Math.sign(r(y) - r(f)))]++, 0 !== c[0] && 0 !== c[1] && 0 !== c[2] && 0 !== c[3]) {
					i[u] = f, x = !0;
					break;
				}
				const o = e(y) - e(u), M = r(y) - r(u);
				if (t * M - a * o < 0 || l * M - h * o > 0) {
					p = !0;
					break;
				}
				if (Math.abs(o) > 1 || Math.abs(M) > 1) {
					const n = o + (M >= 0 && (M > 0 || o < 0) ? 1 : -1), e = M + (o <= 0 && (o < 0 || M < 0) ? 1 : -1);
					t * e - a * n >= 0 && (t = n, a = e);
					const r = o + (M <= 0 && (M < 0 || o < 0) ? 1 : -1), s = M + (o >= 0 && (o > 0 || M < 0) ? 1 : -1);
					l * s - h * r <= 0 && (l = r, h = s);
				}
				if (f = y, f === n - 1) {
					i[u] = n - 1, x = !0;
					break;
				}
				y = s[f];
			}
			if (!x && p) {
				const o = Math.sign(e(y) - e(f)), s = Math.sign(r(y) - r(f)), c = e(f) - e(u), x = r(f) - r(u), p = t * x - a * c, M = t * s - a * o, g = l * x - h * c, d = l * s - h * o;
				let m = 1e7;
				M < 0 && (m = Math.floor(p / -M)), d > 0 && (m = Math.min(m, Math.floor(-g / d))), i[u] = Math.min(n - 1, Math.max(f, f + m));
			}
		}
		const a = new Int32Array(n);
		a[n - 1] = n - 1;
		let l = i[n - 1];
		for (let u = n - 2; u >= 0; u--) i[u] >= u + 1 && i[u] <= l && (l = i[u]), a[u] = l;
		const h = new Int32Array(n);
		for (let u = 0; u < n; u++) {
			const t = 0 === u ? a[0] : a[u - 1];
			h[u] = t >= n - 1 ? n - 1 : Math.min(n - 1, Math.max(u + 1, t - 1));
		}
		return h[n - 1] = n - 1, h;
	}(t), r = en(t);
	let o = 0;
	{
		let t = 0;
		for (; t < n - 1;) t = e[t], o++;
	}
	const s = new Int32Array(o + 1);
	{
		let t = 0;
		for (let n = 1; n <= o; n++) t = e[t], s[n] = t;
	}
	const i = new Int32Array(n);
	{
		let t = 0;
		for (let r = 1; r < n; r++) {
			for (; e[t] < r;) t++;
			i[r] = t;
		}
	}
	const c = new Int32Array(o + 1);
	c[o] = n - 1;
	for (let y = o - 1; y >= 0; y--) c[y] = i[c[y + 1]];
	let a = new Float64Array(n).fill(1 / 0), l = new Float64Array(n).fill(1 / 0);
	a[0] = 0;
	const h = [];
	for (let y = 1; y <= o; y++) {
		const i = c[y], u = y === o ? n - 1 : s[y], f = c[y - 1], x = s[y - 1], p = new Int32Array(u - i + 1).fill(-1);
		l.fill(1 / 0, i, u + 1);
		for (let s = Math.max(i, y === o ? n - 1 : i); s <= u; s++) {
			let n = 1 / 0, o = -1;
			const c = Math.min(x, s - 1);
			for (let i = f; i <= c; i++) {
				if (e[i] < s) continue;
				const c = a[i];
				if (c === 1 / 0) continue;
				const l = c + rn(t, r, i, s);
				l < n && (n = l, o = i);
			}
			l[s] = n, p[s - i] = o;
		}
		h.push(p);
		const M = a;
		a = l, l = M;
	}
	const u = [n - 1];
	let f = n - 1;
	for (let y = o; y >= 1; y--) {
		const t = c[y], n = h[y - 1][f - t];
		if (n < 0) {
			u.push(0);
			break;
		}
		u.push(n), f = n;
	}
	return u.reverse(), 0 !== u[0] && u.unshift(0), u;
}
function yn(t, n) {
	return (3 + 3 * Math.sign(t) + Math.sign(n)) / 2;
}
const xn = .4999, pn = .03, Mn = .97, gn = Math.cos(Math.PI / 4), dn = 1e-6;
function mn(t, n, e, r, o) {
	const s = n.width, i = n.height, c = "data" in n ? n.data : null, a = null === c ? n : void 0, l = a?.uncertainty?.bind(a), h = a?.along?.bind(a), u = l ? {
		uncertainty: l,
		along: h,
		sigma: NaN,
		refused: !1
	} : void 0, f = (t, e) => {
		const r = t < 0 ? 0 : t >= s ? s - 1 : t, o = e < 0 ? 0 : e >= i ? i - 1 : e;
		return null !== c ? c[o * s + r] : n.at(r, o);
	}, y = (t, n) => {
		const e = t - .5, r = n - .5, o = Math.floor(e), s = Math.floor(r), i = e - o, c = r - s, a = f(o, s) * (1 - i) * (1 - c) + f(o + 1, s) * i * (1 - c) + f(o, s + 1) * (1 - i) * c + f(o + 1, s + 1) * i * c + .5;
		return a < 0 ? 0 : a > 1 ? 1 : a;
	}, x = t.length >> 1, p = x > 2 && t[0] === t[2 * (x - 1)] && t[1] === t[2 * (x - 1) + 1], M = p ? x - 1 : x, g = (t) => p ? (t % M + M) % M : t < 0 ? 0 : t >= x ? x - 1 : t, d = e && e.length >= 2 ? new Int32Array(x) : null, m = [];
	if (null !== d && e) {
		const n = e.length - 1;
		for (let r = 0; r < n; r++) {
			const n = e[r], o = e[r + 1], s = t[2 * o] - t[2 * n], i = t[2 * o + 1] - t[2 * n + 1], c = Math.hypot(s, i) || 1;
			m.push(s / c, i / c);
			for (let t = n; t < o && t < x; t++) d[t] = r;
		}
		for (let t = e[n]; t < x; t++) d[t] = n - 1;
	}
	const b = m.length >> 1, w = (t) => {
		const n = 0 === t ? p ? b - 1 : -1 : t - 1, e = t === b ? p ? 0 : -1 : t;
		if (n < 0 || e < 0) return null;
		const r = m[2 * n], o = m[2 * n + 1], s = m[2 * e], i = m[2 * e + 1];
		if (r * s + o * i < gn) return null;
		const c = r + s, a = o + i, l = Math.hypot(c, a);
		return l < 1e-12 ? null : [c / l, a / l];
	}, A = (t, n, e) => {
		const r = e[t], o = m[2 * r], s = m[2 * r + 1];
		if (b < 2) return [o, s];
		const i = n[r], c = n[r + 1], a = c > i ? (t - i) / (c - i) : 0, l = w(r) ?? [o, s], h = w(r + 1) ?? [o, s], u = Math.atan2(l[1], l[0]);
		let f = Math.atan2(h[1], h[0]) - u;
		for (; f > Math.PI;) f -= 2 * Math.PI;
		for (; f < -Math.PI;) f += 2 * Math.PI;
		const y = u + f * a;
		return [Math.cos(y), Math.sin(y)];
	}, k = new Array(t.length);
	o && (o.length = x);
	for (let F = 0; F < x; F++) {
		const n = t[2 * F], c = t[2 * F + 1];
		if (k[2 * F] = n, k[2 * F + 1] = c, o && (o[F] = NaN), n <= 0 || c <= 0 || n >= s || c >= i) continue;
		let a, l;
		if (null !== d && e) [a, l] = A(F, e, d);
		else {
			const n = g(F - 1), e = g(F + 1);
			a = t[2 * e] - t[2 * n], l = t[2 * e + 1] - t[2 * n + 1];
		}
		const h = Math.hypot(a, l);
		if (h < 1e-9) continue;
		const f = -l / h, x = a / h;
		u && (u.sigma = NaN, u.refused = !1);
		const p = wn(y, n, c, f, x, s, i, u);
		o && u && (null !== p && 0 !== p || u.refused) && (o[F] = u.sigma);
		const m = r ? r[F % M] : 0;
		if (null === p && 0 === m) continue;
		const b = (p ?? 0) + m;
		k[2 * F] = n + f * b, k[2 * F + 1] = c + x * b;
	}
	return k;
}
function bn(t, n, e) {
	const r = t >= .5 ? t : 1 - t;
	return (t >= .5 ? 1 : -1) * (r - .5 <= .5 * (n - e) / n ? (r - .5) * n : .5 * (n + e) - Math.sqrt(Math.max(0, 2 * n * e * (1 - r))));
}
function wn(t, n, e, r, o, s, i, c) {
	const a = Math.abs(r), l = Math.abs(o), h = a >= l ? a : l, u = a >= l ? l : a, f = [], y = [], x = [];
	for (const I of [
		-1,
		-.5,
		0,
		.5,
		1
	]) {
		const c = Math.round(n + r * I + dn * r * Math.sign(I) - .5), a = Math.round(e + o * I + dn * o * Math.sign(I) - .5);
		if (c < 0 || a < 0 || c >= s || a >= i) continue;
		const l = c + .5, h = a + .5, u = (l - n) * r + (h - e) * o;
		let p = !1;
		for (let t = 0; t < f.length; t++) Math.abs(f[t] - u) < 1e-9 && (p = !0);
		p || (f.push(u), y.push(t(l, h)), x.push(c, a));
	}
	const p = f.map((t, n) => n).toSorted((t, n) => f[t] - f[n]), M = p.map((t) => f[t]), g = p.map((t) => y[t]), d = M.length;
	if (d < 2) return null;
	let m = !1;
	for (const I of g) I > pn && I < Mn && (m = !0);
	if (!m) return null;
	let b = 0;
	if (M[d - 1] > M[0] && Math.abs(g[d - 1] - g[0]) > .05 && (b = Math.sign(g[d - 1] - g[0])), c && !function(t, n, e, r, o, s) {
		t.sigma = NaN;
		let i = -1, c = -1;
		for (let M = 0; M < r.length; M++) r[M] < 0 ? i = M : r[M] > 0 && c < 0 && (c = M);
		if (i < 0 || c < 0) return !0;
		const a = t.uncertainty(o[2 * s[i]], o[2 * s[i] + 1]), l = t.uncertainty(o[2 * s[c]], o[2 * s[c] + 1]);
		if (Number.isNaN(a) || Number.isNaN(l)) return !0;
		const h = Math.abs(e[c] - e[i]) / (r[c] - r[i]);
		t.sigma = Math.min(function(t, n, e = .05) {
			const r = n <= 1e-6 ? 4 : t / n;
			return Math.min(Math.max(Math.hypot(r, e), .001), 4);
		}(Math.max(a, l), h), 2);
		const u = e[i] > pn && e[i] < Mn, f = e[c] > pn && e[c] < Mn;
		if (!u || !f || (e[i] - .5) * (e[c] - .5) <= 0) return !0;
		const y = e[i] < .5 ? e[c] >= e[i] : e[c] <= e[i], x = y ? c : i;
		for (let M = y ? c + 1 : i - 1; M >= 0 && M < r.length; M += y ? 1 : -1) if (!Number.isNaN(t.uncertainty(o[2 * s[M]], o[2 * s[M] + 1])) && (e[M] - .5) * (e[x] - .5) <= 0) return !0;
		if (t.along) {
			const i = o[2 * s[x]], c = o[2 * s[x] + 1], a = r[x] + (y ? 1 : -1), l = Math.round(n.px + n.nx * a - .5), h = Math.round(n.py + n.ny * a - .5);
			if ((l !== i || h !== c) && l >= 0 && h >= 0 && l < n.w && h < n.h && (t.along(l, h, i, c) + .5 - .5) * (e[x] - .5) <= 0) return !0;
		}
		const p = Math.abs(.5 - .5 * (e[i] + e[c])) / Math.max(h, 1e-6);
		return t.sigma = Math.min(Math.hypot(p, t.sigma), 1), t.refused = !0, !1;
	}(c, {
		px: n,
		py: e,
		nx: r,
		ny: o,
		w: s,
		h: i
	}, g, M, x, p)) return null;
	const w = (t) => t > pn && t < Mn;
	let A = null;
	if (0 !== b) for (let I = 0; I < d - 1; I++) {
		const t = g[I], n = g[I + 1];
		if ((t - .5) * (n - .5) <= 0 && Math.abs(n - t) > 1e-9) {
			A = w(t) && w(n) ? M[I] + (M[I + 1] - M[I]) * (.5 - t) / (n - t) : w(t) ? M[I] - b * bn(t, h, u) : w(n) ? M[I + 1] - b * bn(n, h, u) : .5 * (M[I] + M[I + 1]);
			break;
		}
	}
	let k = !0, F = !0;
	for (let I = 1; I < d; I++) g[I] < g[I - 1] - .05 && (k = !1), g[I] > g[I - 1] + .05 && (F = !1);
	let v = 1, N = 0;
	for (const I of g) I < v && (v = I), I > N && (N = I);
	if (!(d >= 3 && (k || F) && v < .12 && N > .88)) {
		A = null;
		let s = -1, i = -1;
		for (let t = 0; t < d; t++) M[t] < 0 ? s = t : i < 0 && (i = t);
		const c = s >= 0 && i >= 0 && Math.abs(g[i] - g[s]) > .05 ? Math.sign(g[i] - g[s]) : 0, a = 9;
		let l = 0, h = 0, u = !1;
		for (let f = 0; f <= a; f++) {
			const s = 2 * f / a - 1, i = t(n + r * s, e + o * s);
			if (u && (h - .5) * (i - .5) <= 0 && Math.abs(i - h) > 1e-9 && (0 === c || Math.sign(i - h) === c)) {
				const t = l + (s - l) * (.5 - h) / (i - h);
				(null === A || Math.abs(t) < Math.abs(A)) && (A = t);
			}
			l = s, h = i, u = !0;
		}
	}
	return null === A ? null : A > 1 ? 1 : A < -1 ? -1 : A;
}
const An = /* @__PURE__ */ new WeakMap();
function kn(t, n, e, r, o) {
	const s = e[r] - e[o], i = e[r + 1] - e[o + 1], c = e[r + 2] - e[o + 2], a = s * s + i * i + c * c;
	if (a < 1) return -1;
	const l = ((t[n] - e[o]) * s + (t[n + 1] - e[o + 1]) * i + (t[n + 2] - e[o + 2]) * c) / a;
	return l < 0 ? 0 : l > 1 ? 1 : l;
}
function Fn(t) {
	if (!("data" in t)) return t;
	const { width: n, height: e, data: r } = t;
	return {
		width: n,
		height: e,
		at: (t, e) => r[e * n + t]
	};
}
const vn = 1.5;
function Nn(t, n) {
	const { x0: e, y0: r, w: o, h: s, data: i, weight: c } = n, a = n.unit ?? 1, l = [];
	let h = 0, u = 0, f = 0, y = 0;
	const x = (t, n) => {
		n !== u && l.push(h * a - e, u * a - r, t * a - e, n * a - r), h = t, u = n;
	};
	for (const d of t) if ("M" === d.type) x(f, y), h = f = d.x, u = y = d.y;
	else if ("L" === d.type || "A" === d.type) x(d.x, d.y);
	else if ("C" === d.type) {
		const t = h, n = u;
		for (let e = 1; e <= 16; e++) {
			const r = e / 16, o = 1 - r, s = o * o * o, i = 3 * o * o * r, c = 3 * o * r * r, a = r * r * r;
			x(s * t + i * d.x1 + c * d.x2 + a * d.x, s * n + i * d.y1 + c * d.y2 + a * d.y);
		}
	} else if ("Q" === d.type) {
		const t = h, n = u;
		for (let e = 1; e <= 16; e++) {
			const r = e / 16, o = 1 - r;
			x(o * o * t + 2 * o * r * d.x1 + r * r * d.x, o * o * n + 2 * o * r * d.y1 + r * r * d.y);
		}
	} else x(f, y);
	x(f, y);
	const p = new Float64Array(o * s), M = [];
	for (let d = 0; d < 16 * s; d++) {
		const t = (d + .5) / 16;
		M.length = 0;
		for (let e = 0; e < l.length; e += 4) {
			const n = l[e + 1], r = l[e + 3];
			if (n <= t != r <= t) {
				const o = l[e];
				M.push(o + (t - n) * (l[e + 2] - o) / (r - n));
			}
		}
		if (M.length < 2) continue;
		M.sort((t, n) => t - n);
		const n = Math.floor(t) * o;
		for (let e = 0; e + 1 < M.length; e += 2) {
			const t = Math.max(0, M[e]), r = Math.min(o, M[e + 1]);
			for (let e = Math.floor(t); e < r; e++) {
				const o = Math.min(r, e + 1) - Math.max(t, e);
				o > 0 && (p[n + e] += o / 16);
			}
		}
	}
	let g = 0;
	for (let d = 0; d < o * s; d++) {
		if (0 === c[d]) continue;
		const t = p[d] - i[d];
		g += t * t;
	}
	return g;
}
function In(t) {
	const n = 1 - t;
	return n * n * n;
}
function Pn(t) {
	const n = 1 - t;
	return 3 * t * n * n;
}
function qn(t) {
	return 3 * t * t * (1 - t);
}
function Ln(t) {
	return t * t * t;
}
function Cn(t, n, e, r, o, s, i, c) {
	const a = t[2 * n], l = t[2 * n + 1], h = t[2 * e], u = t[2 * e + 1];
	let f = 0, y = 0, x = 0, p = 0, M = 0;
	for (let A = n; A <= e; A++) {
		const e = r[A - n], g = o * Pn(e), d = s * Pn(e), m = i * qn(e), b = c * qn(e);
		f += g * g + d * d, y += g * m + d * b, x += m * m + b * b;
		const w = t[2 * A] - (In(e) + Pn(e)) * a - (qn(e) + Ln(e)) * h, k = t[2 * A + 1] - (In(e) + Pn(e)) * l - (qn(e) + Ln(e)) * u;
		p += g * w + d * k, M += m * w + b * k;
	}
	const g = f * x - y * y;
	let d = 0, m = 0;
	Math.abs(g) > 1e-12 && (d = (p * x - M * y) / g, m = (f * M - y * p) / g);
	const b = Math.hypot(h - a, u - l), w = 1e-6 * b;
	return (d < w || m < w) && (d = m = b / 3), {
		p0x: a,
		p0y: l,
		c1x: a + d * o,
		c1y: l + d * s,
		c2x: h + m * i,
		c2y: u + m * c,
		p3x: h,
		p3y: u
	};
}
function $n(t, n, e, r) {
	const [o, s] = function(t, n) {
		return function(t, n, e, r, o, s, i, c, a) {
			const l = 1 - a, h = l * l * l, u = 3 * l * l * a, f = 3 * l * a * a, y = a * a * a;
			return [h * t + u * e + f * o + y * i, h * n + u * r + f * s + y * c];
		}(t.p0x, t.p0y, t.c1x, t.c1y, t.c2x, t.c2y, t.p3x, t.p3y, n);
	}(t, r), [i, c] = function(t, n) {
		const e = 1 - n, r = 3 * (t.c1x - t.p0x), o = 3 * (t.c1y - t.p0y), s = 3 * (t.c2x - t.c1x), i = 3 * (t.c2y - t.c1y);
		return [e * e * r + 2 * e * n * s + n * n * (3 * (t.p3x - t.c2x)), e * e * o + 2 * e * n * i + n * n * (3 * (t.p3y - t.c2y))];
	}(t, r), [a, l] = function(t, n) {
		const e = 6 * (t.c2x - 2 * t.c1x + t.p0x), r = 6 * (t.c2y - 2 * t.c1y + t.p0y);
		return [(1 - n) * e + n * (6 * (t.p3x - 2 * t.c2x + t.c1x)), (1 - n) * r + n * (6 * (t.p3y - 2 * t.c2y + t.c1y))];
	}(t, r), h = o - n, u = s - e, f = h * i + u * c, y = i * i + c * c + h * a + u * l;
	if (Math.abs(y) < 1e-12) return r;
	const x = r - f / y;
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
function Sn(t, n, e, r, o, s, i, c) {
	const a = Math.abs(o - t) + Math.abs(s - n);
	let l;
	if (0 !== a) {
		const i = Math.abs((e - t) * (s - n) - (o - t) * (r - n)) / a;
		l = i > 1 ? 1 - 1 / i : 0, l /= .75;
	} else l = 4 / 3;
	return function(t, n, e, r, o, s, i, c, a) {
		return void 0 === a ? t >= n : !(Math.min(Math.hypot(e - o, r - s), Math.hypot(i - o, c - s)) < 1.5) && (function(t, n, e, r, o, s) {
			const i = t - e, c = n - r, a = o - e, l = s - r, h = Math.hypot(i, c), u = Math.hypot(a, l);
			if (0 === h || 0 === u) return 180;
			let f = (i * a + c * l) / (h * u);
			return f = f < -1 ? -1 : f > 1 ? 1 : f, 180 * Math.acos(f) / Math.PI;
		}(e, r, o, s, i, c) < a || t >= n);
	}(l, i, t, n, e, r, o, s, c);
}
const En = Object.freeze({
	cubicParams: 6,
	g1BreakDegrees: 10,
	arcParams: 5,
	cubicMaxTurnDegrees: 1 / 0
}), Un = Math.PI / 180;
let On = En;
function zn() {
	return On.cubicParams;
}
function Tn() {
	return On.g1BreakDegrees * Un;
}
function jn() {
	return On.arcParams;
}
function Xn() {
	return On.cubicMaxTurnDegrees * Un;
}
function Rn(t, n) {
	return n < 0 || Object.is(n, -0) ? -Math.abs(t) : Math.abs(t);
}
function Zn(t) {
	return Number.isNaN(t) ? NaN : t < 0 || Object.is(t, -0) ? -1 : 1;
}
function Vn(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t >= n ? t : n;
}
function Yn(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t <= n ? t : n;
}
function Bn(t, n, e) {
	const r = t * (1 / e), o = n * (1 / e);
	if (!Number.isFinite(r) || !Number.isFinite(o)) {
		const e = -t / n;
		return Number.isFinite(e) ? [e] : 0 === t && 0 === n ? [0] : [];
	}
	const s = o * o - 4 * r;
	let i;
	if (Number.isFinite(s)) {
		if (s < 0) return [];
		if (0 === s) return [-.5 * o];
		i = -.5 * (o + Rn(Math.sqrt(s), o));
	} else i = -o;
	const c = r / i;
	return Number.isFinite(c) ? c > i ? [i, c] : [c, i] : [i];
}
function Dn(t, n) {
	return 0 === n ? Math.abs(t) : Math.abs((t - n) / n);
}
function Qn(t, n, e, r, o, s, i) {
	return Dn(t + e, o) + Dn(n + t * e + r, s) + Dn(n * e + t * r, i);
}
function _n(t, n, e, r, o, s, i, c) {
	return Qn(t, n, e, r, o, s, i) + Dn(n * r, c);
}
function Wn(t, n, e, r, o, s, i, c, a) {
	return t * (o * a - s * c) - n * (r * a - s * i) + e * (r * c - o * i);
}
function Gn(t, n, e) {
	const r = Wn(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
	return !(Math.abs(r) < 1e-18 || (e[0] = Wn(n[0], t[1], t[2], n[1], t[4], t[5], n[2], t[7], t[8]) / r, e[1] = Wn(t[0], n[0], t[2], t[3], n[1], t[5], t[6], n[2], t[8]) / r, e[2] = Wn(t[0], t[1], n[0], t[3], t[4], n[1], t[6], t[7], n[2]) / r, 0));
}
const Kn = 2 ** -600, Hn = 2 ** 511, Jn = 2 ** -511, te = 2 ** -54;
function ne(t, n) {
	let e, r, o = Math.sqrt(t * t + n * n);
	if (o <= 2 * n) {
		const s = o - n;
		e = t * (2 * s - t), r = (s - 2 * (t - n)) * s;
	} else {
		const s = o - t;
		e = 2 * s * (t - 2 * n), r = (4 * s - n) * n + s * s;
	}
	return o -= (e + r) / (2 * o), o;
}
function ee(t, n) {
	if (!Number.isFinite(t) || !Number.isFinite(n)) return Math.abs(t) === 1 / 0 || Math.abs(n) === 1 / 0 ? 1 / 0 : t + n;
	const e = Math.abs(t), r = Math.abs(n), o = e < r ? r : e, s = e < r ? e : r;
	return o > Hn ? s <= o * te ? o + s : ne(o * Kn, s * Kn) / Kn : s < Jn ? o >= s / te ? o + s : ne(o / Kn, s / Kn) * Kn : s <= o * te ? o + s : ne(o, s);
}
var re = class {
	u = /* @__PURE__ */ new Float64Array(33);
	x = /* @__PURE__ */ new Float64Array(33);
	y = /* @__PURE__ */ new Float64Array(33);
	w = /* @__PURE__ */ new Float64Array(33);
	back = /* @__PURE__ */ new Float64Array(16);
	len = 0;
	m = /* @__PURE__ */ new Float64Array(9);
	tx = /* @__PURE__ */ new Float64Array(3);
	ty = /* @__PURE__ */ new Float64Array(3);
	cx = /* @__PURE__ */ new Float64Array(3);
	cy = /* @__PURE__ */ new Float64Array(3);
	dirX = 0;
	dirY = 0;
	resid = 0;
	push(t, n, e, r) {
		this.u[this.len] = t, this.x[this.len] = n, this.y[this.len] = e, this.w[this.len] = r, this.len++;
	}
};
function oe(t, n) {
	let e = 0, r = 0, o = 0, s = 0, i = 0, c = 0, a = 0, l = 0, h = 0, u = 0, f = 0;
	for (let d = 0; d < n; d++) {
		const n = t.u[d], y = t.w[d], x = t.x[d], p = t.y[d], M = n * n, g = M * n;
		e += y, c += y * x, h += y * p, r += y * n, a += y * n * x, u += y * n * p, o += y * M, l += y * M * x, f += y * M * p, s += y * g, i += y * (g * n);
	}
	const y = t.m;
	if (y[0] = e, y[1] = r, y[2] = o, y[3] = r, y[4] = o, y[5] = s, y[6] = o, y[7] = s, y[8] = i, t.tx[0] = c, t.tx[1] = a, t.tx[2] = l, t.ty[0] = h, t.ty[1] = u, t.ty[2] = f, !Gn(y, t.tx, t.cx)) return !1;
	if (!Gn(y, t.ty, t.cy)) return !1;
	const x = t.cx, p = t.cy;
	let M = 0;
	for (let d = 0; d < n; d++) {
		const n = t.u[d], e = t.x[d] - (x[0] + x[1] * n + x[2] * n * n), r = t.y[d] - (p[0] + p[1] * n + p[2] * n * n);
		M += t.w[d] * (e * e + r * r);
	}
	const g = Math.hypot(x[1], p[1]);
	return !(g < 1e-12 || !Number.isFinite(g) || (t.dirX = x[1] / g, t.dirY = p[1] / g, t.resid = M, 0));
}
function se(t, n) {
	if (t.edges) return t.edges[n];
	const e = t.poly.points, r = (n + 1) % t.n;
	return Math.hypot(e[2 * n] - e[2 * r], e[2 * n + 1] - e[2 * r + 1]);
}
function ie(t, n) {
	return 1 / (t.sigma[n] * t.sigma[n]);
}
function ce(t, n, e, r, o) {
	const { poly: s, n: i } = t, c = s.points, a = s.closed ? i - 1 : e ? i - 1 - n : n, l = Math.min(16, a);
	if (l < 1) return null;
	const h = (t) => e ? (n + t) % i : (n + i - t % i) % i;
	o.len = 0;
	let u = 0;
	for (let d = 0; d <= l; d++) {
		const n = h(d);
		if (d > 0) {
			const r = se(t, e ? h(d - 1) : n);
			u += e ? r : -r;
		}
		o.push(u, c[2 * n], c[2 * n + 1], ie(s, n));
	}
	const f = r.tau * r.tau;
	for (let d = l; d >= 2; d--) {
		if (!oe(o, d + 1)) continue;
		const t = Math.max(2 * (d + 1) - 6, 0);
		if (t <= 0 || o.resid <= f * t) return {
			x: o.dirX,
			y: o.dirY
		};
	}
	const y = h(1), x = c[2 * y] - c[2 * n], p = c[2 * y + 1] - c[2 * n + 1], M = Math.hypot(x, p);
	if (M < 1e-12) return null;
	const g = e ? 1 : -1;
	return {
		x: g * x / M,
		y: g * p / M
	};
}
function ae(t, n, e, r, o) {
	const { poly: s, n: i } = t, c = s.points, a = s.closed ? Math.floor((i - 1) / 2) : Math.min(n, i - 1 - n), l = Math.min(e, 16, a);
	if (l < 2) return null;
	const h = (t) => ((n + t) % i + i) % i, u = r.tau * r.tau, f = o.back;
	for (let y = l; y >= 2; y--) {
		o.len = 0;
		let e = 0;
		for (let n = 1; n <= y; n++) e -= se(t, h(-n)), f[n - 1] = e;
		for (let t = y; t >= 1; t--) {
			const n = h(-t);
			o.push(f[t - 1], c[2 * n], c[2 * n + 1], ie(s, n));
		}
		o.push(0, c[2 * n], c[2 * n + 1], ie(s, n)), e = 0;
		for (let n = 1; n <= y; n++) {
			const r = h(n);
			e += se(t, h(n - 1)), o.push(e, c[2 * r], c[2 * r + 1], ie(s, r));
		}
		if (!oe(o, o.len)) continue;
		const r = 2 * (2 * y + 1) - 6;
		if (o.resid <= u * r) return {
			x: o.dirX,
			y: o.dirY
		};
	}
	return null;
}
function le(t, n) {
	const e = t.points.length >> 1, r = t.points, o = new Float64Array(e);
	for (let l = 0; l < e; l++) {
		const t = (l + 1) % e;
		o[l] = Math.hypot(r[2 * l] - r[2 * t], r[2 * l + 1] - r[2 * t + 1]);
	}
	const s = {
		poly: t,
		n: e,
		edges: o
	}, i = new re(), c = [], a = [];
	for (let l = 0; l < e; l++) {
		const t = ae(s, l, 16, n, i);
		if (t) {
			c.push(t), a.push({
				x: t.x,
				y: t.y
			});
			continue;
		}
		const e = ce(s, l, !0, n, i), r = ce(s, l, !1, n, i), o = e ?? r ?? {
			x: 1,
			y: 0
		}, h = r ?? e ?? {
			x: 1,
			y: 0
		};
		a.push(o), c.push(h === o ? {
			x: h.x,
			y: h.y
		} : h);
	}
	return {
		incoming: c,
		outgoing: a
	};
}
function he(t, n) {
	const e = Math.hypot(t.x, t.y), r = Math.hypot(n.x, n.y);
	return e < 1e-12 || r < 1e-12 ? 0 : Math.acos(Math.min(Math.max((t.x * n.x + t.y * n.y) / (e * r), -1), 1));
}
function ue(t, n, e) {
	const r = he(t, n) / Tn();
	return e * Yn(r * r, 1);
}
function fe(t, n, e) {
	return ue(t.incoming[n], t.outgoing[n], e.lambda);
}
function ye(t, n) {
	const e = n < t.length ? t[n] : .5, r = e > .001 ? e : .001;
	return 1 / (r * r);
}
function xe(t, n) {
	const e = new Float64Array(n);
	for (let r = 0; r < n; r++) e[r] = ye(t, r);
	return e;
}
function pe(t, n, e, r) {
	for (let o = 0; o < e; o++) {
		let r = o, s = Math.abs(t[o * e + o]);
		for (let n = o + 1; n < e; n++) {
			const i = Math.abs(t[n * e + o]);
			i >= s && (s = i, r = n);
		}
		if (s < 1e-300) return !1;
		if (r !== o) {
			for (let n = 0; n < e; n++) {
				const s = t[o * e + n];
				t[o * e + n] = t[r * e + n], t[r * e + n] = s;
			}
			const s = n[o];
			n[o] = n[r], n[r] = s;
		}
		const i = t[o * e + o];
		for (let c = o + 1; c < e; c++) {
			const r = t[c * e + o] / i;
			if (0 !== r) {
				for (let n = o; n < e; n++) t[c * e + n] -= r * t[o * e + n];
				n[c] -= r * n[o];
			}
		}
	}
	for (let o = e - 1; o >= 0; o--) {
		let s = n[o];
		for (let n = o + 1; n < e; n++) s -= t[o * e + n] * r[n];
		if (r[o] = s / t[o * e + o], !Number.isFinite(r[o])) return !1;
	}
	return !0;
}
function Me(t, n, e) {
	const r = new Float64Array(e);
	for (let o = e - 1; o >= 0; o--) {
		let s = n[o];
		for (let n = o + 1; n < e; n++) s -= t[n * e + o] * r[n];
		r[o] = s / t[o * e + o];
	}
	return r;
}
function ge(t, n, e, r, o, s) {
	for (let i = 0; i < r; i++) {
		let c = n[e + i];
		for (let n = 0; n < i; n++) c -= t[i * r + n] * o[s + n];
		o[s + i] = c / t[i * r + i];
	}
}
const de = /* @__PURE__ */ new Float64Array(25), me = /* @__PURE__ */ new Float64Array(25), be = /* @__PURE__ */ new Float64Array(25), we = /* @__PURE__ */ new Float64Array(25), Ae = /* @__PURE__ */ new Float64Array(10);
function ke(t, n, e, r, o) {
	const s = t.length;
	let i = Float64Array.from(t);
	r(i);
	let c = new Float64Array(s * s), a = new Float64Array(s), l = new Float64Array(s * s), h = new Float64Array(s);
	const u = e(i, c, a);
	if (null === u) return null;
	let f = u, y = .001;
	const x = new Float64Array(s * s), p = new Float64Array(s), M = new Float64Array(s);
	let g = new Float64Array(s);
	for (let d = 0; d < n; d++) {
		x.set(c);
		for (let e = 0; e < s; e++) {
			const t = Math.abs(c[e * s + e]);
			x[e * s + e] += y * (t > 1e-12 ? t : 1e-12), p[e] = -a[e];
		}
		if (!pe(x, p, s, M)) {
			if (y *= 10, y > 0xe8d4a51000) break;
			continue;
		}
		for (let e = 0; e < s; e++) g[e] = i[e] + M[e];
		r(g);
		const t = o?.(g), n = void 0 === t || null !== t && t <= f && Number.isFinite(t) ? e(g, l, h) : null;
		if (null !== n && n <= f && Number.isFinite(n)) {
			const t = f - n;
			if ([i, g] = [g, i], [c, l] = [l, c], [a, h] = [h, a], f = n, y = Math.max(y / 3, 1e-15), t <= 1e-10 * Math.max(f, 1e-12)) break;
		} else if (y *= 4, y > 0xe8d4a51000) break;
	}
	return {
		p: i,
		chi2: f
	};
}
function Fe(t, n, e) {
	const r = Math.sin(t.angle), o = Math.cos(t.angle), s = t.rx * Math.cos(n), i = t.ry * Math.sin(n);
	e[0] = t.cx + o * s - r * i, e[1] = t.cy + r * s + o * i;
}
function ve(t, n, e, r) {
	const o = Math.sin(t.angle), s = Math.cos(t.angle), i = n - t.cx, c = e - t.cy, a = s * i + o * c, l = -o * i + s * c, h = t.rx, u = t.ry;
	let f = Math.atan2(h * l, u * a);
	const y = h * h - u * u;
	for (let b = 0; b < 12; b++) {
		const t = Math.sin(f), n = Math.cos(f), e = -h * a * t + u * l * n + y * t * n, r = -h * a * n - u * l * t + y * (n * n - t * t);
		if (Math.abs(r) < 1e-300) break;
		const o = Math.min(Math.max(e / r, -.5), .5);
		if (f -= o, Math.abs(o) < 1e-13) break;
	}
	const x = Math.sin(f), p = Math.cos(f);
	let M = u * p, g = h * x;
	const d = Math.hypot(M, g);
	d < 1e-300 ? (M = 1, g = 0) : (M /= d, g /= d);
	const m = (a - h * p) * M + (l - u * x) * g;
	return r[0] = m, r[1] = f, r[2] = M, r[3] = g, m;
}
function Ne(t) {
	let n = t;
	for (; n > Math.PI / 2;) n -= Math.PI;
	for (; n <= -Math.PI / 2;) n += Math.PI;
	return n;
}
let Ie = /* @__PURE__ */ new Float64Array(0);
function Pe(t, n) {
	const e = t.length >> 1;
	if (e < 6) return null;
	Ie.length < 6 * e && (Ie = new Float64Array(6 * e));
	const r = Ie, o = Ie.subarray(e, 6 * e);
	let s = 0, i = 0, c = 0;
	for (let S = 0; S < e; S++) {
		const e = ye(n, S);
		r[S] = e, s += e, i += t[2 * S] * e, c += t[2 * S + 1] * e;
	}
	if (!(s > 0)) return null;
	i /= s, c /= s;
	let a = 0;
	for (let S = 0; S < e; S++) {
		const n = t[2 * S] - i, e = t[2 * S + 1] - c;
		a += r[S] * (n * n + e * e);
	}
	const l = Math.sqrt(a / s);
	if (!(l > 1e-12)) return null;
	let h = 0, u = 0, f = 0, y = 0, x = 0;
	for (let S = 0; S < e; S++) {
		const n = (t[2 * S] - i) / l, e = (t[2 * S + 1] - c) / l, s = 5 * S, a = r[S], p = n * n, M = n * e, g = e * e;
		o[s] = p, o[s + 1] = M, o[s + 2] = g, o[s + 3] = n, o[s + 4] = e, h += a * p, u += a * M, f += a * g, y += a * n, x += a * e;
	}
	h /= s, u /= s, f /= s, y /= s, x /= s;
	const p = new Float64Array([
		h,
		u,
		f,
		y,
		x
	]), M = /* @__PURE__ */ new Float64Array(25);
	let g = 0, d = 0, m = 0, b = 0, w = 0, A = 0, k = 0, F = 0, v = 0, N = 0, I = 0;
	for (let S = 0; S < e; S++) {
		const t = 5 * S, n = o[t + 3], e = o[t + 4], s = o[t] - h, i = o[t + 1] - u, c = o[t + 2] - f, a = n - y, l = e - x, p = r[S], P = p * s, q = p * i, L = p * c, C = p * a, $ = p * l;
		M[0] += P * s, M[1] += P * i, M[2] += P * c, M[3] += P * a, M[4] += P * l, M[5] += q * s, M[6] += q * i, M[7] += q * c, M[8] += q * a, M[9] += q * l, M[10] += L * s, M[11] += L * i, M[12] += L * c, M[13] += L * a, M[14] += L * l, M[15] += C * s, M[16] += C * i, M[17] += C * c, M[18] += C * a, M[19] += C * l, M[20] += $ * s, M[21] += $ * i, M[22] += $ * c, M[23] += $ * a, M[24] += $ * l;
		const E = 2 * n, U = 2 * e;
		g += p * (E * E), d += p * (E * e), m += p * E, b += p * (e * e + n * n), w += p * (n * U), A += p * e, k += p * n, F += p * (U * U), v += p * U, N += p, I += p;
	}
	const P = function(t, n) {
		const e = de;
		if (!function(t, n, e) {
			for (let r = 0; r < 5; r++) for (let n = 0; n <= r; n++) {
				let o = 0;
				for (let t = 0; t < n; t++) o += e[5 * r + t] * e[5 * n + t];
				const s = t[5 * r + n] - o;
				if (r === n) {
					if (!(s > 0)) return !1;
					e[5 * r + n] = Math.sqrt(s);
				} else e[5 * r + n] = s / e[5 * n + n];
			}
			return !0;
		}(n, 0, e)) return null;
		const r = me, o = Ae;
		for (let a = 0; a < 5; a++) {
			for (let n = 0; n < 5; n++) o[n] = t[5 * n + a];
			ge(e, o, 0, 5, o, 5);
			for (let t = 0; t < 5; t++) r[5 * t + a] = o[5 + t];
		}
		const s = be;
		for (let a = 0; a < 5; a++) ge(e, r, 5 * a, 5, s, 5 * a);
		for (let a = 0; a < 5; a++) for (let t = a + 1; t < 5; t++) {
			const n = .5 * (s[5 * a + t] + s[5 * t + a]);
			s[5 * a + t] = n, s[5 * t + a] = n;
		}
		const i = we;
		(function(t, n, e) {
			e.fill(0);
			for (let r = 0; r < 5; r++) e[5 * r + r] = 1;
			for (let r = 0; r < 100; r++) {
				let n = 0;
				for (let e = 0; e < 5; e++) for (let r = e + 1; r < 5; r++) n += t[5 * e + r] * t[5 * e + r];
				if (n < 1e-30) break;
				for (let r = 0; r < 5; r++) for (let n = r + 1; n < 5; n++) {
					const o = t[5 * r + n];
					if (Math.abs(o) < 1e-300) continue;
					const s = (t[5 * n + n] - t[5 * r + r]) / (2 * o), i = 0 === s ? 1 : (s > 0 ? 1 : -1) / (Math.abs(s) + Math.sqrt(s * s + 1)), c = 1 / Math.sqrt(i * i + 1), a = i * c;
					for (let e = 0; e < 5; e++) {
						const o = t[5 * e + r], s = t[5 * e + n];
						t[5 * e + r] = c * o - a * s, t[5 * e + n] = a * o + c * s;
					}
					for (let e = 0; e < 5; e++) {
						const o = t[5 * r + e], s = t[5 * n + e];
						t[5 * r + e] = c * o - a * s, t[5 * n + e] = a * o + c * s;
					}
					for (let t = 0; t < 5; t++) {
						const o = e[5 * t + r], s = e[5 * t + n];
						e[5 * t + r] = c * o - a * s, e[5 * t + n] = a * o + c * s;
					}
				}
			}
		})(s, 0, i);
		let c = 0;
		for (let a = 1; a < 5; a++) s[5 * a + a] < s[5 * c + c] && (c = a);
		for (let a = 0; a < 5; a++) o[a] = i[5 * a + c];
		return {
			theta: Me(e, o.subarray(0, 5), 5),
			mu: s[5 * c + c]
		};
	}(M, new Float64Array([
		g,
		d,
		0,
		m,
		0,
		d,
		b,
		w,
		A,
		k,
		0,
		w,
		F,
		0,
		v,
		m,
		A,
		0,
		N,
		0,
		0,
		k,
		v,
		0,
		I
	]));
	if (null === P) return null;
	const q = P.theta;
	let L = 0;
	for (let S = 0; S < 5; S++) L += p[S] * q[S];
	const C = function(t) {
		const [n, e, r, o, s, i] = [
			t[0],
			t[1],
			t[2],
			t[3],
			t[4],
			t[5]
		];
		if (!(e * e - 4 * n * r < 0)) return null;
		const c = 4 * n * r - e * e, a = (e * s - 2 * r * o) / c, l = (e * o - 2 * n * s) / c, h = i + .5 * (o * a + s * l);
		if (0 === h) return null;
		const u = .5 * Math.atan2(e, n - r), f = Math.sin(u), y = Math.cos(u), x = -h / (n * y * y + e * y * f + r * f * f), p = -h / (n * f * f - e * y * f + r * y * y);
		return x > 0 && p > 0 ? {
			cx: a,
			cy: l,
			r1: Math.sqrt(x),
			r2: Math.sqrt(p),
			angle: u
		} : null;
	}([
		q[0],
		q[1],
		q[2],
		q[3],
		q[4],
		-L
	]);
	if (null === C) return null;
	const $ = C.r1 < C.r2;
	return {
		fit: {
			cx: i + l * C.cx,
			cy: c + l * C.cy,
			rx: ($ ? C.r2 : C.r1) * l,
			ry: ($ ? C.r1 : C.r2) * l,
			angle: Ne($ ? C.angle + Math.PI / 2 : C.angle),
			chi2: 1 / 0
		},
		residual: P.mu * l * l * s
	};
}
function qe(t, n) {
	return Pe(t, n)?.fit ?? null;
}
function Le(t) {
	t[2] = Math.max(Math.abs(t[2]), .001), t[3] = Math.max(Math.abs(t[3]), .001);
}
function Ce(t, n, e) {
	const r = t.length >> 1, o = xe(n, r), s = /* @__PURE__ */ new Float64Array(4), i = /* @__PURE__ */ new Float64Array(5), c = {
		cx: 0,
		cy: 0,
		rx: 0,
		ry: 0,
		angle: 0,
		chi2: 0
	}, a = ke([
		e.cx,
		e.cy,
		e.rx,
		e.ry,
		e.angle
	], 200, (n, e, a) => {
		c.cx = n[0], c.cy = n[1], c.rx = n[2], c.ry = n[3], c.angle = n[4];
		const l = Math.sin(c.angle), h = Math.cos(c.angle);
		e.fill(0), a.fill(0);
		let u = 0;
		for (let f = 0; f < r; f++) {
			const n = ve(c, t[2 * f], t[2 * f + 1], s);
			if (!Number.isFinite(n)) return null;
			const r = s[1], y = s[2], x = s[3], p = Math.sin(r), M = Math.cos(r), g = c.rx * M, d = c.ry * p;
			i[0] = -(h * y - l * x), i[1] = -(l * y + h * x), i[2] = -y * M, i[3] = -x * p, i[4] = y * d - x * g;
			const m = o[f];
			u += m * n * n;
			for (let t = 0; t < 5; t++) {
				a[t] += m * i[t] * n;
				for (let n = 0; n < 5; n++) e[5 * t + n] += m * i[t] * i[n];
			}
		}
		return u;
	}, Le);
	if (null === a) return null;
	const [l, h, u, f, y] = a.p, x = u < f;
	return {
		cx: l,
		cy: h,
		rx: x ? f : u,
		ry: x ? u : f,
		angle: Ne(x ? y + Math.PI / 2 : y),
		chi2: a.chi2
	};
}
function $e(t, n, e) {
	return t.length >> 1 < 6 ? null : function(t, n, e, r) {
		if (t.length >> 1 < 6) return null;
		const o = [];
		if (null !== e && o.push(e), null !== r) for (let i = 0; i < 4; i++) o.push({
			cx: r.cx,
			cy: r.cy,
			rx: 1.02 * r.r,
			ry: .98 * r.r,
			angle: i * Math.PI / 4,
			chi2: 1 / 0
		});
		let s = null;
		for (const i of o) {
			const e = Ce(t, n, i);
			null !== e && (null === s || e.chi2 < s.chi2) && (s = e);
		}
		return s;
	}(t, n, qe(t, n), e);
}
function Se(t, n, e, r, o, s, i, c = 1, a = 0) {
	const l = t - e, h = n - r, u = Math.abs(c * l + a * h) - (o - i), f = Math.abs(c * h - a * l) - (s - i), y = u > 0 ? u : 0, x = f > 0 ? f : 0;
	return Math.sqrt(y * y + x * x) + Math.min(Math.max(u, f), 0) - i;
}
function Ee(t, n, e) {
	const r = t.length >> 1, o = Math.cos(e.rotation), s = Math.sin(e.rotation);
	let i = 0;
	for (let c = 0; c < r; c++) {
		const r = Se(t[2 * c], t[2 * c + 1], e.cx, e.cy, e.hw, e.hh, e.r, o, s);
		i += ye(n, c) * r * r;
	}
	return i;
}
function Ue(t, n, e, r = 0, o = !1) {
	const s = t.length >> 1;
	if (s < 8) return null;
	const i = xe(n, s), c = Math.cos(r), a = Math.sin(r), l = new Float64Array(s), h = new Float64Array(s);
	let u = 1 / 0, f = -1 / 0, y = 1 / 0, x = -1 / 0;
	for (let j = 0; j < s; j++) {
		const n = t[2 * j], e = t[2 * j + 1];
		l[j] = c * n + a * e, h[j] = c * e - a * n, u = Math.min(u, l[j]), f = Math.max(f, l[j]), y = Math.min(y, h[j]), x = Math.max(x, h[j]);
	}
	const p = .5 * (f - u), M = .5 * (x - y);
	if (!(p >= 1e-6 && M >= 1e-6)) return null;
	const g = .5 * (u + f), d = .5 * (y + x), m = c * g - a * d, b = a * g + c * d, w = Math.min(p, M), A = function(t, n, e, r, o, s) {
		if (null !== s) return [Math.min(Math.max(s, 0), o)];
		const [i, c, a, l] = r;
		let h = 0;
		for (let p = 0; p < e.length; p++) e[p] > h && (h = e[p]);
		const u = 3 * Math.max(h, .05), f = [
			0,
			.1 * o,
			.25 * o,
			.5 * o,
			.8 * o,
			o
		], y = [], x = (t, n, e, r, o) => {
			let s = 0, i = 1 / 0, c = -1 / 0;
			for (let a = 0; a < t.length; a++) Math.abs(t[a] - n) > u || (s++, e[a] < i && (i = e[a]), e[a] > c && (c = e[a]));
			s >= 2 && y.push(i - r, o - c);
		};
		return x(n, a, t, i, c), x(n, l, t, i, c), x(t, i, n, a, l), x(t, c, n, a, l), y.length > 0 && (y.sort((t, n) => t - n), f.push(Math.min(Math.max(y[y.length >> 1], 0), o))), f;
	}(l, h, n, [
		u,
		f,
		y,
		x
	], w, e), k = null === e, F = k ? 4 : -1, v = o ? k ? 5 : 4 : -1, N = 4 + (k ? 1 : 0) + (o ? 1 : 0), I = 1e-6 * Math.max(w, 1), P = new Float64Array(7 * (2 * N + 1)), q = new Float64Array(N), L = new Float64Array(N), C = (t, n) => {
		const s = 7 * t;
		P[s] = n[0], P[s + 1] = n[1], P[s + 2] = n[2], P[s + 3] = n[3], P[s + 4] = k ? n[F] : e;
		const i = o ? n[v] : r;
		P[s + 5] = Math.cos(i), P[s + 6] = Math.sin(i);
	}, $ = new Float64Array(N), S = (n, e, r) => {
		C(0, n);
		for (let t = 0; t < N; t++) q[t] = t === v ? 1e-6 : I, $.set(n), $[t] = n[t] + q[t], C(1 + 2 * t, $), $[t] = n[t] - q[t], C(2 + 2 * t, $);
		e.fill(0), r.fill(0);
		let o = 0;
		for (let c = 0; c < s; c++) {
			const s = t[2 * c], a = t[2 * c + 1], l = Se(s, a, n[0], n[1], n[2], n[3], P[4], P[5], P[6]);
			for (let t = 0; t < N; t++) {
				const n = 7 * (1 + 2 * t), e = n + 7, r = Se(s, a, P[n], P[n + 1], P[n + 2], P[n + 3], P[n + 4], P[n + 5], P[n + 6]), o = Se(s, a, P[e], P[e + 1], P[e + 2], P[e + 3], P[e + 4], P[e + 5], P[e + 6]);
				L[t] = (r - o) / (2 * q[t]);
			}
			const h = i[c];
			o += h * l * l;
			for (let t = 0; t < N; t++) {
				r[t] += h * L[t] * l;
				for (let n = 0; n < N; n++) e[t * N + n] += h * L[t] * L[n];
			}
		}
		return o;
	}, E = (n) => {
		C(0, n);
		let e = 0;
		for (let r = 0; r < s; r++) {
			const o = Se(t[2 * r], t[2 * r + 1], n[0], n[1], n[2], n[3], P[4], P[5], P[6]);
			e += i[r] * o * o;
		}
		return e;
	}, U = (t) => {
		t[2] = Math.max(Math.abs(t[2]), .001), t[3] = Math.max(Math.abs(t[3]), .001), k && (t[F] = Math.min(Math.max(t[F], 0), Math.min(t[2], t[3])));
	};
	let O = null;
	for (const j of A) {
		const t = [
			m,
			b,
			p,
			M
		];
		k && t.push(j), o && t.push(r);
		const n = ke(t, 100, S, U, E);
		null !== n && (null === O || n.chi2 < O.chi2) && (O = n);
	}
	if (null === O) return null;
	const z = O.p, T = {
		cx: z[0],
		cy: z[1],
		hw: z[2],
		hh: z[3],
		r: k ? z[F] : e,
		rotation: o ? z[v] : r
	};
	if (o) {
		for (; T.rotation > Math.PI / 4;) T.rotation -= Math.PI / 2, [T.hw, T.hh] = [T.hh, T.hw];
		for (; T.rotation <= -Math.PI / 4;) T.rotation += Math.PI / 2, [T.hw, T.hh] = [T.hh, T.hw];
	}
	return {
		...T,
		chi2: Ee(t, n, T)
	};
}
function Oe(t) {
	const n = Math.cos(t.rotation), e = Math.sin(t.rotation), { r } = t, o = -t.w / 2, s = t.w / 2, i = -t.h / 2, c = t.h / 2, a = (r, o) => t.cx + n * r - e * o, l = (r, o) => t.cy + e * r + n * o, h = (t, n, e, r) => ({
		line: !0,
		ax: a(t, n),
		ay: l(t, n),
		bx: a(e, r),
		by: l(e, r)
	}), u = (n, e, o) => ({
		line: !1,
		cx: a(n, e),
		cy: l(n, e),
		r,
		a: o + t.rotation
	});
	return [
		h(s, i + r, s, c - r),
		u(s - r, c - r, 0),
		h(s - r, c, o + r, c),
		u(o + r, c - r, Math.PI / 2),
		h(o, c - r, o, i + r),
		u(o + r, i + r, Math.PI),
		h(o + r, i, s - r, i),
		u(s - r, i + r, 3 * Math.PI / 2)
	].filter((t) => t.line ? Math.hypot(t.bx - t.ax, t.by - t.ay) > 1e-9 : t.r * Math.PI / 2 > 1e-9);
}
function ze(t, n, e) {
	if (t.line) e[0] = t.ax + (t.bx - t.ax) * n, e[1] = t.ay + (t.by - t.ay) * n;
	else {
		const r = t.a + n * Math.PI / 2;
		e[0] = t.cx + t.r * Math.cos(r), e[1] = t.cy + t.r * Math.sin(r);
	}
}
function Te(t, n, e) {
	if (t.line) {
		const r = t.bx - t.ax, o = t.by - t.ay, s = r * r + o * o;
		return s > 0 ? Math.min(Math.max(((n - t.ax) * r + (e - t.ay) * o) / s, 0), 1) : 0;
	}
	let r = Math.atan2(e - t.cy, n - t.cx) - t.a;
	for (; r < 0;) r += 2 * Math.PI;
	for (; r >= 2 * Math.PI;) r -= 2 * Math.PI;
	return r <= Math.PI / 2 ? r / (Math.PI / 2) : r < Math.PI / 2 + 3 * Math.PI / 4 ? 1 : 0;
}
function je(t, n, e, r, o) {
	return t.line ? {
		type: "L",
		x: r,
		y: o
	} : {
		type: "A",
		rx: t.r,
		ry: t.r,
		rotation: 0,
		largeArc: !1,
		sweep: e > n,
		x: r,
		y: o
	};
}
function Xe(t, n, e) {
	const r = /* @__PURE__ */ new Float64Array(2);
	let o = 1 / 0, s = 0, i = 0;
	for (let c = 0; c < t.length; c++) {
		const a = Te(t[c], n, e);
		ze(t[c], a, r);
		const l = Math.hypot(n - r[0], e - r[1]);
		l < o && (o = l, s = c, i = a);
	}
	return [s, i];
}
const Re = Math.PI / 180 * 120, Ze = 2 * Math.PI;
function Ve(t, n, e, r, o) {
	const s = t.length >> 1;
	let i = 0;
	for (let c = 0; c < s; c++) {
		const s = Math.hypot(t[2 * c] - e, t[2 * c + 1] - r) - o;
		i += ye(n, c) * s * s;
	}
	return i;
}
function Ye(t) {
	t[2] = Math.max(Math.abs(t[2]), 1e-6);
}
function Be(t, n) {
	const e = function(t, n) {
		const e = t.length >> 1;
		if (e < 3) return null;
		const r = xe(n, e), [o, s, i] = function(t, n) {
			let e = 0, r = 0, o = 0;
			for (let s = 0; s < n.length; s++) e += n[s], r += t[2 * s] * n[s], o += t[2 * s + 1] * n[s];
			return [
				r / e,
				o / e,
				e
			];
		}(t, r);
		let c = 0, a = 0, l = 0, h = 0, u = 0, f = 0;
		for (let q = 0; q < e; q++) {
			const n = t[2 * q] - o, e = t[2 * q + 1] - s, i = n * n + e * e;
			c += r[q] * n * n, a += r[q] * e * e, l += r[q] * n * e, h += r[q] * n * i, u += r[q] * e * i, f += r[q] * i * i;
		}
		c /= i, a /= i, l /= i, h /= i, u /= i, f /= i;
		const y = c + a, x = c * a - l * l, p = f - y * y, M = 4 * y, g = -3 * y * y - f, d = p * y + 4 * x * y - h * h - u * u, m = h * (h * a - u * l) + u * (u * c - h * l) - p * x, b = g + g, w = M + M + M;
		let A = 0, k = m;
		for (let q = 0; q < 40; q++) {
			const t = d + A * (b + A * w);
			if (Math.abs(t) < 1e-300) break;
			const n = A - k / t;
			if (n === A || !Number.isFinite(n)) break;
			const e = m + n * (d + n * (g + n * M));
			if (Math.abs(e) >= Math.abs(k)) break;
			A = n, k = e;
		}
		const F = Math.max(A, 0), v = F * F - F * y + x;
		if (Math.abs(v) < 1e-300) return null;
		const N = (h * (a - F) - u * l) / v / 2, I = (u * (c - F) - h * l) / v / 2, P = Math.sqrt(N * N + I * I + y);
		return Number.isFinite(P) && P > 0 ? {
			cx: N + o,
			cy: I + s,
			r: P,
			chi2: Ve(t, n, N + o, I + s, P)
		} : null;
	}(t, n);
	if (null === e) return null;
	const r = t.length >> 1, o = xe(n, r), s = ke([
		e.cx,
		e.cy,
		e.r
	], 100, (n, e, s) => {
		e.fill(0), s.fill(0);
		let i = 0;
		for (let c = 0; c < r; c++) {
			const r = t[2 * c] - n[0], a = t[2 * c + 1] - n[1], l = Math.hypot(r, a);
			if (l < 1e-12) continue;
			const h = l - n[2], u = -r / l, f = -a / l, y = o[c];
			i += y * h * h, s[0] += y * u * h, s[1] += y * f * h, s[2] -= y * h, e[0] += y * u * u, e[1] += y * u * f, e[2] -= y * u, e[3] += y * f * u, e[4] += y * f * f, e[5] -= y * f, e[6] -= y * u, e[7] -= y * f, e[8] += y;
		}
		return i;
	}, Ye);
	if (null === s) return null;
	const i = {
		cx: s.p[0],
		cy: s.p[1],
		r: s.p[2],
		chi2: s.chi2
	};
	return i.chi2 <= e.chi2 ? i : e;
}
function De(t, n, e, r) {
	const o = t.length >> 1;
	let s = 0, i = Math.atan2(t[1] - e, t[0] - n);
	const c = r ? o : o - 1;
	for (let a = 1; a <= c; a++) {
		const r = a % o, c = Math.atan2(t[2 * r + 1] - e, t[2 * r] - n);
		let l = c - i;
		l > Math.PI ? l -= Ze : l < -Math.PI && (l += Ze), s += l, i = c;
	}
	return s;
}
function Qe(t, n, e, r, o, s, i) {
	const c = Math.ceil(Math.abs(o) / Re - 1e-9), a = c >= 1 ? c : 1, l = o > 0, h = Math.abs(o) / a > Math.PI, u = [];
	for (let f = 1; f <= a; f++) {
		const c = r + o * f / a, y = f === a ? s : t + e * Math.cos(c), x = f === a ? i : n + e * Math.sin(c);
		u.push({
			type: "A",
			rx: e,
			ry: e,
			rotation: 0,
			largeArc: h,
			sweep: l,
			x: y,
			y: x
		});
	}
	return u;
}
function _e(t) {
	let n = 0;
	for (let e = 1; e < t.length >> 1; e++) n = Math.max(n, Math.hypot(t[2 * e] - t[0], t[2 * e + 1] - t[1]));
	return n;
}
function We(t) {
	return {
		cx: t.cx,
		cy: t.cy,
		rx: t.rx,
		ry: t.ry,
		angle: t.rotation,
		chi2: 0
	};
}
function Ge(t, n, e, r) {
	switch (t.kind) {
		case "circle": {
			const o = Math.atan2(e - t.cy, n - t.cx);
			return Qe(t.cx, t.cy, t.r, o, r ? Ze : -Ze, n, e);
		}
		case "ellipse": return function(t, n, e, r) {
			const o = We(t), s = /* @__PURE__ */ new Float64Array(4);
			ve(o, n, e, s);
			const i = s[1], c = r ? Ze : -Ze, a = Math.ceil(Ze / Re - 1e-9), l = 180 * t.rotation / Math.PI, h = [];
			for (let u = 1; u <= a; u++) {
				let f = n, y = e;
				u < a && (Fe(o, i + c * u / a, s), f = s[0], y = s[1]), h.push({
					type: "A",
					rx: t.rx,
					ry: t.ry,
					rotation: l,
					largeArc: !1,
					sweep: r,
					x: f,
					y
				});
			}
			return h;
		}(t, n, e, r);
		case "rect": return function(t, n, e, r) {
			const o = Oe(t), s = o.length;
			if (0 === s) return [];
			const [i, c] = Xe(o, n, e), a = /* @__PURE__ */ new Float64Array(2), l = [], h = r ? 1 : 0, u = r ? 0 : 1;
			Math.abs(c - h) > 1e-9 && (ze(o[i], h, a), l.push(je(o[i], c, h, a[0], a[1])));
			for (let p = 1; p < s; p++) {
				const t = r ? (i + p) % s : (i + s - p) % s;
				ze(o[t], r ? 1 : 0, a), l.push(je(o[t], r ? 0 : 1, r ? 1 : 0, a[0], a[1]));
			}
			var f, y, x;
			return l.push(je(o[i], u, c, n, e)), Math.abs(c - u) <= 1e-9 && l.length > 1 && (l.pop(), l[l.length - 1] = (y = n, x = e, "Z" === (f = l[l.length - 1]).type ? f : {
				...f,
				x: y,
				y: x
			})), l;
		}(t, n, e, r);
	}
}
function Ke(t, n, e, r, o, s, i, c, a) {
	let l = Math.abs(e), h = Math.abs(r);
	const u = .5 * (t - c), f = .5 * (n - a);
	if (u * u + f * f <= 1e-24 || l <= 1e-12 || h <= 1e-12) return {
		cx: t - l,
		cy: n,
		rx: l,
		ry: h,
		phi: o,
		theta1: 0,
		delta: 0
	};
	const y = Math.sin(o), x = Math.cos(o), p = x * u + y * f, M = -y * u + x * f, g = p * p / (l * l) + M * M / (h * h);
	if (g > 1) {
		const t = Math.sqrt(g);
		l *= t, h *= t;
	}
	const d = Math.max(l * l * h * h - l * l * M * M - h * h * p * p, 0), m = l * l * M * M + h * h * p * p;
	let b = m > 0 ? Math.sqrt(d / m) : 0;
	s === i && (b = -b);
	const w = b * l * M / h, A = -b * h * p / l, k = x * w - y * A + .5 * (t + c), F = y * w + x * A + .5 * (n + a), v = Math.atan2((M - A) / h, (p - w) / l);
	let N = Math.atan2((-M - A) / h, (-p - w) / l) - v;
	return !i && N > 0 ? N -= Ze : i && N < 0 && (N += Ze), {
		cx: k,
		cy: F,
		rx: l,
		ry: h,
		phi: o,
		theta1: v,
		delta: N
	};
}
function He(t, n, e) {
	const r = Math.ceil(t);
	return r >= n ? Math.min(r, e) : n;
}
function Je(t, n, e, r, o, s) {
	const i = o - e, c = s - r, a = i * i + c * c;
	if (a <= 1e-24) return Math.hypot(t - e, n - r);
	const l = Math.min(Math.max(((t - e) * i + (n - r) * c) / a, 0), 1);
	return Math.hypot(t - e - i * l, n - r - c * l);
}
function tr(t, n, e) {
	const r = n.length;
	if (r < 2) return 0;
	const o = new Float64Array(r + 1), s = new Float64Array(r + 1), i = new Float64Array(r + 1), c = new Float64Array(r + 1), a = new Float64Array(r + 1), l = new Float64Array(r + 1);
	for (let f = 0; f < r; f++) {
		const e = t[2 * f] - t[0], r = t[2 * f + 1] - t[1], h = n[f];
		o[f + 1] = o[f] + h, s[f + 1] = s[f] + e * h, i[f + 1] = i[f] + r * h, c[f + 1] = c[f] + e * e * h, a[f + 1] = a[f] + r * r * h, l[f + 1] = l[f] + e * r * h;
	}
	const h = (t, n) => {
		const e = n + 1, r = o[e] - o[t];
		if (!(r > 0)) return 0;
		const h = s[e] - s[t], u = i[e] - i[t], f = c[e] - c[t] - h * h / r, y = a[e] - a[t] - u * u / r, x = l[e] - l[t] - h * u / r, p = f - y, M = Math.sqrt(Math.max(p * p + 4 * x * x, 0));
		return Math.max(.5 * (f + y - M), 0);
	}, u = new Float64Array(r).fill(1 / 0);
	u[0] = 0;
	for (let f = 0; f < r - 1; f++) if (Number.isFinite(u[f])) for (let t = f + 1; t < r; t++) {
		const n = h(f, t), r = u[f] + .5 * n + 2 * e;
		if (r < u[t] && (u[t] = r), .5 * n > 4 * e * 2 * (t - f)) break;
	}
	return u[r - 1];
}
var nr = class {
	loX;
	loY;
	hiX;
	hiY;
	slack;
	best = null;
	constructor(t) {
		let n = 1 / 0, e = 1 / 0, r = -1 / 0, o = -1 / 0;
		for (let s = 0; s < t.length; s += 2) n = Math.min(n, t[s]), e = Math.min(e, t[s + 1]), r = Math.max(r, t[s]), o = Math.max(o, t[s + 1]);
		this.loX = n, this.loY = e, this.hiX = r, this.hiY = o, this.slack = 8 * Math.max(r - n, o - e, 1);
	}
	inBounds(t, n) {
		return Number.isFinite(t) && Number.isFinite(n) && t >= this.loX - this.slack && t <= this.hiX + this.slack && n >= this.loY - this.slack && n <= this.hiY + this.slack;
	}
	consider(t) {
		if (0 !== t.segments.length && Number.isFinite(t.cost) && this.inBounds(t.x0, t.y0)) {
			for (const n of t.segments) if ("Z" !== n.type) {
				if (!this.inBounds(n.x, n.y)) return;
				if (("C" === n.type || "Q" === n.type) && !this.inBounds(n.x1, n.y1)) return;
				if ("C" === n.type && !this.inBounds(n.x2, n.y2)) return;
				if ("A" === n.type && !(Math.max(n.rx, n.ry) <= this.slack && Number.isFinite(n.rx + n.ry))) return;
			}
			(null === this.best || t.cost < this.best.cost) && (this.best = t);
		}
	}
};
function er(t, n, e) {
	const r = Math.abs(De(t, n, e, !0));
	return r > 1.9 * Math.PI && r < 3 * Math.PI;
}
function rr(t, n, e, r, o) {
	const [s, i] = function(t, n, e) {
		switch (t.kind) {
			case "circle": {
				const r = Math.hypot(n - t.cx, e - t.cy);
				return r > 0 ? [t.cx + t.r * (n - t.cx) / r, t.cy + t.r * (e - t.cy) / r] : [t.cx + t.r, t.cy];
			}
			case "ellipse": {
				const r = We(t), o = /* @__PURE__ */ new Float64Array(4);
				return ve(r, n, e, o), Fe(r, o[1], o), [o[0], o[1]];
			}
			case "rect": return function(t, n, e) {
				const r = Oe(t);
				if (0 === r.length) return [t.cx, t.cy];
				const [o, s] = Xe(r, n, e), i = /* @__PURE__ */ new Float64Array(2);
				return ze(r[o], s, i), [i[0], i[1]];
			}(t, n, e);
		}
	}(n, t.pts[0], t.pts[1]);
	return {
		x0: s,
		y0: i,
		segments: Ge(n, s, i, o),
		closed: !0,
		params: r,
		chi2: e,
		primitive: n,
		cost: .5 * e + t.lambda * r
	};
}
function or(t, n, e) {
	if (null === n) return;
	const { pts: r } = t, o = function(t, n, e) {
		const r = t.length >> 1;
		if (e.chi2 > 4 * r) return null;
		if (!(Number.isFinite(e.r) && e.r <= 1e3 * Math.max(_e(t), 1))) return null;
		const o = De(t, e.cx, e.cy, n);
		if (Math.abs(o) < .001) return null;
		const s = Math.atan2(t[1] - e.cy, t[0] - e.cx), i = n ? t[0] : t[2 * r - 2], c = n ? t[1] : t[2 * r - 1];
		return Qe(e.cx, e.cy, e.r, s, o, i, c);
	}(r, t.closed, n);
	if (null === o) return;
	if (!t.closed) {
		const n = function(t, n, e, r, o) {
			if (0 === o.length) return 1 / 0;
			const s = function(t, n) {
				const e = t.length >> 1, r = n.length >> 1, o = new Float64Array(e);
				if (0 === r) return o.fill(1 / 0);
				const s = Math.min(Math.max(Math.floor(r / 8), 16), 512);
				let i = 0;
				for (let c = 0; c < e; c++) {
					const a = t[2 * c], l = t[2 * c + 1], h = e > 1 ? Math.floor(c * (r - 1) / (e - 1)) : 0, u = Math.max(h, Math.max(i - Math.floor(s / 2), 0)), f = Math.max(u - s, 0), y = Math.min(u + s, r - 1);
					let x = 1 / 0, p = i;
					for (let t = f; t <= y; t++) {
						const e = Math.hypot(a - n[2 * t], l - n[2 * t + 1]);
						e < x && (x = e, p = t);
					}
					i = p;
					let M = x;
					const g = n[2 * p], d = n[2 * p + 1];
					p > 0 && (M = Math.min(M, Je(a, l, n[2 * p - 2], n[2 * p - 1], g, d))), p + 1 < r && (M = Math.min(M, Je(a, l, g, d, n[2 * p + 2], n[2 * p + 3]))), o[c] = M;
				}
				return o;
			}(t, function(t, n, e, r) {
				const o = [t, n];
				let s = t, i = n;
				for (const c of e) {
					if ("L" === c.type) {
						const t = He(Math.hypot(c.x - s, c.y - i) / r, 1, 4096);
						for (let n = 1; n <= t; n++) o.push(s + (c.x - s) * n / t, i + (c.y - i) * n / t);
					} else if ("C" === c.type || "Q" === c.type) {
						const t = "C" === c.type ? c.x1 : s + 2 / 3 * (c.x1 - s), n = "C" === c.type ? c.y1 : i + 2 / 3 * (c.y1 - i), e = "C" === c.type ? c.x2 : c.x + 2 / 3 * (c.x1 - c.x), a = "C" === c.type ? c.y2 : c.y + 2 / 3 * (c.y1 - c.y), l = He((Math.hypot(t - s, n - i) + Math.hypot(e - t, a - n) + Math.hypot(c.x - e, c.y - a)) / r, 4, 4096);
						for (let r = 1; r <= l; r++) {
							const h = r / l, u = 1 - h, f = u * u * u, y = 3 * u * u * h, x = 3 * u * h * h, p = h * h * h;
							o.push(f * s + y * t + x * e + p * c.x, f * i + y * n + x * a + p * c.y);
						}
					} else {
						if ("A" !== c.type) continue;
						{
							const t = Ke(s, i, c.rx, c.ry, c.rotation * Math.PI / 180, c.largeArc, c.sweep, c.x, c.y), n = He(Math.abs(Math.max(t.rx, t.ry) * t.delta) / r, 2, 4096), e = Math.sin(t.phi), a = Math.cos(t.phi);
							for (let r = 1; r < n; r++) {
								const s = t.theta1 + t.delta * r / n, i = t.rx * Math.cos(s), c = t.ry * Math.sin(s);
								o.push(t.cx + a * i - e * c, t.cy + e * i + a * c);
							}
							o.push(c.x, c.y);
						}
					}
					s = c.x, i = c.y;
				}
				return o;
			}(e, r, o, .25));
			let i = 0;
			for (let c = 0; c < s.length; c++) i += s[c] * s[c] * ye(n, c);
			return i;
		}(r, t.sigma, r[0], r[1], o), s = 5 * o.length;
		e.consider({
			x0: r[0],
			y0: r[1],
			segments: o,
			closed: !1,
			params: s,
			chi2: n,
			cost: .5 * n + t.lambda * s
		});
		return;
	}
	if (n.chi2 > t.gate || !er(r, n.cx, n.cy)) return;
	const s = De(r, n.cx, n.cy, !0), i = {
		kind: "circle",
		cx: n.cx,
		cy: n.cy,
		r: n.r
	};
	e.consider(rr(t, i, n.chi2, 3, s > 0));
}
function sr(t, n, e, r) {
	const o = t.length >> 1;
	if (o < 4 || n.length < o) return null;
	const s = {
		pts: t.length === 2 * o ? t : t.subarray(0, 2 * o),
		sigma: n.length === o ? n : n.subarray(0, o),
		closed: e,
		lambda: r.lambda,
		gate: r.tau * r.tau * o
	}, i = Be(s.pts, s.sigma), c = new nr(s.pts);
	if (or(s, i, c), e) {
		const t = function(t) {
			const n = t.length >> 1;
			let e = 0;
			for (let r = 0; r < n; r++) {
				const o = (r + 1) % n;
				e += t[2 * r] * t[2 * o + 1] - t[2 * o] * t[2 * r + 1];
			}
			return .5 * e;
		}(s.pts) >= 0;
		(function(t, n, e, r) {
			const { pts: o } = t, s = Math.max(_e(o), 1), i = function(t, n, e, r) {
				if (t.length >> 1 < 6) return null;
				const o = Pe(t, n);
				return null === o ? $e(t, n, e) : .25 * o.residual > r ? null : Ce(t, n, o.fit) ?? $e(t, n, e);
			}(o, t.sigma, n, t.gate);
			if (null === i) return;
			if (!(Number.isFinite(i.rx) && Number.isFinite(i.ry) && Number.isFinite(i.cx) && Number.isFinite(i.cy) && Math.max(i.rx, i.ry) <= 1e3 * s && i.chi2 <= t.gate && er(o, i.cx, i.cy))) return;
			const c = {
				kind: "ellipse",
				cx: i.cx,
				cy: i.cy,
				rx: i.rx,
				ry: i.ry,
				rotation: i.angle
			};
			r.consider(rr(t, c, i.chi2, 5, e));
		})(s, i, t, c), function(t, n, e) {
			const { pts: r, sigma: o } = t, s = [[Ue(r, o, null), 6], [Ue(r, o, 0), 4]], i = function(t) {
				const n = function(t) {
					const n = t.length >> 1, e = Array.from({ length: n }, (t, n) => n);
					e.sort((n, e) => t[2 * n] - t[2 * e] || t[2 * n + 1] - t[2 * e + 1]);
					const r = new Int32Array(2 * n + 1);
					let o = 0;
					const s = (n, e, r) => (t[2 * e] - t[2 * n]) * (t[2 * r + 1] - t[2 * n + 1]) - (t[2 * e + 1] - t[2 * n + 1]) * (t[2 * r] - t[2 * n]);
					for (let l = 0; l < n; l++) {
						for (; o >= 2 && s(r[o - 2], r[o - 1], e[l]) <= 0;) o--;
						r[o++] = e[l];
					}
					const i = o + 1;
					for (let l = n - 2; l >= 0; l--) {
						for (; o >= i && s(r[o - 2], r[o - 1], e[l]) <= 0;) o--;
						r[o++] = e[l];
					}
					const c = Math.max(o - 1, 0), a = new Float64Array(2 * c);
					for (let l = 0; l < c; l++) a[2 * l] = t[2 * r[l]], a[2 * l + 1] = t[2 * r[l] + 1];
					return a;
				}(t), e = n.length >> 1;
				if (e < 3) return 0;
				const r = (t, r, o) => n[t % e * 2] * r + n[t % e * 2 + 1] * o;
				let o = 0, s = 0, i = 0, c = 1 / 0, a = 0;
				for (let l = 0; l < e; l++) {
					const t = n[(l + 1) % e * 2] - n[2 * l], h = n[(l + 1) % e * 2 + 1] - n[2 * l + 1], u = Math.hypot(t, h), f = t / u, y = h / u;
					if (0 === l) for (let n = 1; n < e; n++) r(n, f, y) > r(o, f, y) && (o = n), r(n, f, y) < r(s, f, y) && (s = n), r(n, -y, f) > r(i, -y, f) && (i = n);
					else {
						for (let t = 0; t < e && r(o + 1, f, y) > r(o, f, y); t++) o++;
						for (let t = 0; t < e && r(s + 1, f, y) < r(s, f, y); t++) s++;
						for (let t = 0; t < e && r(i + 1, -y, f) > r(i, -y, f); t++) i++;
					}
					const x = (r(o, f, y) - r(s, f, y)) * (r(i, -y, f) - r(l, -y, f));
					x < c && (c = x, a = Math.atan2(h, t));
				}
				for (; a > Math.PI / 4;) a -= Math.PI / 2;
				for (; a <= -Math.PI / 4;) a += Math.PI / 2;
				return a;
			}(r);
			0 !== i && s.push([Ue(r, o, null, i, !0), 6], [Ue(r, o, 0, i, !0), 4]);
			for (const [c, a] of s) {
				if (!(null !== c && c.chi2 <= t.gate && c.hw > 0 && c.hh > 0)) continue;
				const r = {
					kind: "rect",
					cx: c.cx,
					cy: c.cy,
					w: 2 * c.hw,
					h: 2 * c.hh,
					r: c.r,
					rotation: c.rotation
				}, o = a + (0 === c.rotation ? 0 : 1);
				e.consider(rr(t, r, c.chi2, o, n));
			}
		}(s, t, c);
	}
	if (null === c.best) return null;
	const a = function(t, n, e, r) {
		const o = t.length >> 1;
		if (!e || o < 2) return tr(t, xe(n, o), r);
		let s = 0, i = 0;
		for (let u = 0; u < o; u++) s += t[2 * u], i += t[2 * u + 1];
		s /= o, i /= o;
		let c = 0, a = -1 / 0;
		for (let u = 0; u < o; u++) {
			const n = Math.hypot(t[2 * u] - s, t[2 * u + 1] - i);
			n >= a && (a = n, c = u);
		}
		const l = new Float64Array(2 * (o + 1)), h = new Float64Array(o + 1);
		for (let u = 0; u <= o; u++) {
			const e = (c + u) % o;
			l[2 * u] = t[2 * e], l[2 * u + 1] = t[2 * e + 1], h[u] = ye(n, e);
		}
		return tr(l, h, r);
	}(s.pts, s.sigma, e, r.lambda);
	return c.best.cost < a ? c.best : null;
}
const ir = .5;
function cr(t) {
	return t.alphamax <= .6666666676666666;
}
function ar(t, n) {
	return cr(n) ? t : t.map((t) => t < .2 ? .2 : t);
}
function lr(t) {
	return t > 0 ? Math.max(1, Math.log(t / .1)) : 8.5;
}
function hr(t, n, e, r, o, s) {
	const i = n.length >> 1, c = new Uint8Array(i);
	if (e && r) for (let h = 0; h + 1 < r.length; h++) {
		const n = r[h], e = r[h + 1];
		if (t[2 * n] === t[2 * e] || t[2 * n + 1] === t[2 * e + 1]) for (let t = n; t <= e && t < i; t++) c[t] = 1;
	}
	const a = new Array(i), l = i > 2 && n[0] === n[2 * (i - 1)] && n[1] === n[2 * (i - 1) + 1] ? i - 1 : i;
	for (let h = 0; h < i; h++) {
		const r = e && (n[2 * h] !== t[2 * h] || n[2 * h + 1] !== t[2 * h + 1]);
		let i = s ? s[h] : NaN;
		if (r && s && Number.isNaN(i)) {
			const t = s[(h - 1 + l) % l], n = s[(h + 1) % l];
			i = Math.max(t >= 0 ? t : 0, n >= 0 ? n : 0);
		}
		a[h] = r ? i > .1 ? i : .1 : i >= 0 ? i > ir ? i : ir : c[h] ? .06 : ir, o && 0 !== o[h % o.length] && (a[h] = ir);
	}
	return a;
}
function ur(t) {
	return t ? 32 : 4;
}
function fr(t) {
	const n = t.extent ?? 0;
	if (n <= 700) return t;
	const e = 700 / n, r = Math.round(t.reach * e * e), o = r < 6 ? 6 : r > t.reach ? t.reach : r;
	return o === t.reach ? t : {
		...t,
		reach: o
	};
}
function yr(t) {
	return t ? 8 : 3;
}
function xr(t) {
	return Math.max(0, t);
}
function pr(t, n, e, r, o) {
	let s = -1;
	for (const { prim: i } of Hr(n, e, r, o)) {
		const e = [];
		if (Mr(e, i, n), e.push({ type: "Z" }), !r.coverage) return e;
		if (s < 0 && (s = Nn(t, r.coverage)), Nn(e, r.coverage) <= s) return e;
	}
	return t;
}
function Mr(t, n, e) {
	if ("ellipse" === n.kind) return void function(t, n, e) {
		const r = (e.length >> 1) - 1, o = Math.cos(n.angle), s = Math.sin(n.angle), i = ((t) => {
			const r = e[2 * t] - n.cx, i = e[2 * t + 1] - n.cy;
			return Math.atan2((-r * s + i * o) / n.ry, (r * o + i * s) / n.rx);
		})(0), c = (to(n, e, r) >= 0 ? 1 : -1) * Math.PI / 2, a = 4 / 3 * Math.tan(c / 4), [l, h] = no(n, i);
		t.push({
			type: "M",
			x: l,
			y: h
		});
		for (let u = 0; u < 4; u++) {
			const [e, r, o, s] = no(n, i + u * c), [f, y, x, p] = no(n, i + (u + 1) * c), M = 3 === u;
			t.push({
				type: "C",
				x1: e + a * o,
				y1: r + a * s,
				x2: f - a * x,
				y2: y - a * p,
				x: M ? l : f,
				y: M ? h : y
			});
		}
	}(t, n.ellipse, e);
	const [r, o] = oo(n.circle, e[0], e[1]);
	t.push({
		type: "M",
		x: r,
		y: o
	}), function(t, n, e, r, o) {
		const s = Math.atan2(e - r.cy, n - r.cx), i = o.length >> 1 >> 2;
		let c = Math.atan2(o[2 * i + 1] - r.cy, o[2 * i] - r.cx) - s;
		for (; c <= -Math.PI;) c += 2 * Math.PI;
		for (; c > Math.PI;) c -= 2 * Math.PI;
		Yr(t, r, s, c >= 0 ? 2 * Math.PI : -2 * Math.PI, n, e, n, e);
	}(t, r, o, n.circle, e);
}
const gr = 45;
function dr(t, n, e, r, o, s, i) {
	const c = (o - r + e) % e + 1;
	if (c < 4) return null;
	const a = new Float64Array(2 * c), l = new Float64Array(c);
	for (let p = 0; p < c; p++) {
		const o = (r + p) % e;
		a[2 * p] = t[2 * o], a[2 * p + 1] = t[2 * o + 1], l[p] = n[o];
	}
	const h = Be(a, l);
	if (null === h || h.chi2 > i * i * (c - 3)) return null;
	let u = h.cy - t[2 * s + 1], f = t[2 * s] - h.cx;
	const y = Math.hypot(u, f);
	if (y < 1e-12) return null;
	const x = u * (a[2 * c - 2] - a[0]) + f * (a[2 * c - 1] - a[1]) < 0 ? -1 : 1;
	return u *= x / y, f *= x / y, {
		x: u,
		y: f
	};
}
function mr(t, n, e, r, o, s) {
	const i = e - t, c = r - n, a = o - e, l = s - r;
	return 180 * Math.atan2(Math.abs(i * l - c * a), i * a + c * l) / Math.PI;
}
const br = 1, wr = Math.PI / 6;
function Ar(t, n, e, r, o) {
	const s = t[2 * e], i = t[2 * e + 1], c = t[2 * r], a = t[2 * r + 1], l = (r - e + o) % o, h = (n) => {
		const r = [];
		for (let h = 0; h <= l; h++) {
			const l = (e + h) % o, u = t[2 * l], f = t[2 * l + 1];
			n && (Math.hypot(u - s, f - i) <= br || Math.hypot(u - c, f - a) <= br) || r.push(l);
		}
		return r;
	};
	let u = h(!0);
	if (u.length < 3 && (u = h(!1)), u.length < 2) return null;
	let f = 0, y = 0, x = 0;
	for (const w of u) {
		const e = 1 / (n[w] * n[w]);
		f += e, y += e * t[2 * w], x += e * t[2 * w + 1];
	}
	y /= f, x /= f;
	let p = 0, M = 0, g = 0;
	for (const w of u) {
		const e = 1 / (n[w] * n[w]), r = t[2 * w] - y, o = t[2 * w + 1] - x;
		p += e * r * r, M += e * r * o, g += e * o * o;
	}
	const d = .5 * Math.atan2(2 * M, p - g);
	let m = Math.cos(d), b = Math.sin(d);
	return m * (c - s) + b * (a - i) < 0 && (m = -m, b = -b), {
		cx: y,
		cy: x,
		dx: m,
		dy: b
	};
}
function kr(t, n, e, r, o, s, i) {
	const c = s[i], a = s[(i + 1) % s.length];
	if (a !== (c + 1) % o) return null;
	const l = e[c], h = e[a], u = t[2 * l], f = t[2 * l + 1], y = t[2 * h], x = t[2 * h + 1];
	if (Math.hypot(y - u, x - f) > mo) return null;
	const p = Ar(t, n, e[(c - 1 + o) % o], l, r), M = Ar(t, n, h, e[(a + 1) % o], r);
	if (!p || !M) return null;
	const g = y - u, d = x - f;
	if ((p.dx * d - p.dy * g) * (g * M.dy - d * M.dx) <= 0) return null;
	const m = p.dx * M.dy - p.dy * M.dx;
	if (Math.abs(m) < 1e-6) return null;
	const b = ((M.cx - p.cx) * M.dy - (M.cy - p.cy) * M.dx) / m, w = p.cx + p.dx * b, A = p.cy + p.dy * b, k = Math.atan2(Math.abs(m), p.dx * M.dx + p.dy * M.dy), F = .5 + Math.min(3, br / Math.max(.2, Math.sin(.5 * (Math.PI - k)))), v = (u + y) / 2, N = (f + x) / 2;
	return Math.hypot(w - v, A - N) <= F ? [w, A] : null;
}
function Fr(t, n, e, r, o, s, i) {
	const c = e[s], a = e[(s - 1 + o) % o], l = e[(s + 1) % o], h = Ar(t, n, a, c, r), u = Ar(t, n, c, l, r);
	if (!h || !u) return i;
	const f = h.dx * u.dy - h.dy * u.dx;
	if (Math.abs(f) < 1e-6) return i;
	const y = ((u.cx - h.cx) * u.dy - (u.cy - h.cy) * u.dx) / f, x = h.cx + h.dx * y, p = h.cy + h.dy * y, M = Math.atan2(Math.abs(f), h.dx * u.dx + h.dy * u.dy), g = M >= wr ? .5 + Math.min(3, br / Math.max(.2, Math.sin(.5 * (Math.PI - M)))) : .5;
	return Math.hypot(x - t[2 * c], p - t[2 * c + 1]) <= g ? [x, p] : i;
}
function vr(t, n, e, r, o, s, i) {
	const { pts: c, sig: a } = vo(t, n, e[s], e[i], r), l = [];
	for (let h = (s + 1) % o; h !== i; h = (h + 1) % o) l.push((e[h] - e[s] + r) % r);
	return {
		pts: c,
		sig: a,
		splits: l
	};
}
function Nr(t, n, e, r, o, s, i, c) {
	const a = (n.length >> 1) - 1;
	if (a <= 0) return;
	if (1 === a) return t.push({
		type: "L",
		x: n[2],
		y: n[3]
	}), void (c && (c[0] += 2 * i.lambda));
	const l = [0];
	for (const h of Ir(n, e, r, o, s, i, l)) Or(t, n, h);
	c && (c[0] += l[0]);
}
function Ir(t, n, e, r, o, s, i, c = !1) {
	const a = (t.length >> 1) - 1;
	if (a <= 1) return 1 === a ? [{
		a: 0,
		b: 1,
		kind: "line"
	}] : [];
	const l = function(t, n, e, r) {
		const o = new Uint8Array(e + 1);
		o[0] = 1, o[e] = 1;
		for (const a of n) a > 0 && a < e && (o[a] = 1);
		const s = [];
		for (let a = 0; a <= e; a++) o[a] && s.push(a);
		const i = function(t, n) {
			const e = [];
			if (n < 3) return e;
			let r = 0;
			for (let o = 1; o < n; o++) {
				const n = t[2 * o] - t[2 * (o - 1)], s = t[2 * o + 1] - t[2 * (o - 1) + 1], i = t[2 * (o + 1)] - t[2 * o], c = n * (t[2 * (o + 1) + 1] - t[2 * o + 1]) - s * i, a = c > 1e-9 ? 1 : c < -1e-9 ? -1 : 0;
				0 !== a && 0 !== r && a !== r && e.push(o), 0 !== a && (r = a);
			}
			return e;
		}(t, e);
		for (let a = 0; a + 1 < s.length; a++) {
			const t = s[a], n = s[a + 1];
			if (!(n - t < r)) {
				for (const e of i) e > t && e < n && (o[e] = 1);
				for (let e = t + r; e < n; e += r) o[e] = 1;
			}
		}
		let c = [];
		for (let a = 0; a <= e; a++) o[a] && c.push(a);
		if (c.length > 256) {
			const t = Math.max(2, 256), n = (c.length - 1) / 255, r = [];
			for (let e = 0; e < t; e++) r.push(c[Math.round(e * n)]);
			r[0] = 0, r[r.length - 1] = e, c = function(t) {
				t.sort((t, n) => t - n);
				const n = [];
				for (const e of t) 0 !== n.length && n[n.length - 1] === e || n.push(e);
				return n;
			}(r);
		}
		return c;
	}(t, e, a, s.stride), h = l.length - 1, u = new Array(h + 1);
	u[0] = r, u[h] = o;
	for (let M = 1; M < h; M++) u[M] = wo(t, l[M]);
	const f = new Float64Array(h + 1).fill(1 / 0);
	f[0] = 0;
	const y = new Int32Array(h + 1).fill(-1), x = new Array(h + 1).fill(null);
	for (let M = 0; M < h; M++) {
		if (f[M] === 1 / 0) continue;
		const e = u[M];
		let r = 0;
		const o = Math.min(h, M + s.reach);
		for (let i = M + 1; i <= o; i++) {
			const o = Sr(t, n, l[M], l[i], e, u[i], s, i === M + 1);
			if (o < qr) {
				const t = f[M] + o;
				t < f[i] && (f[i] = t, y[i] = M, x[i] = "arc" === $r ? {
					a: l[M],
					b: l[i],
					kind: "arc",
					circle: Lr
				} : "cubic" === $r ? {
					a: l[M],
					b: l[i],
					kind: "cubic",
					cubic: Cr
				} : {
					a: l[M],
					b: l[i],
					kind: "line"
				}), r = 0;
			} else if (++r >= Pr) break;
		}
	}
	const p = [];
	for (let M = h; M > 0; M = y[M]) {
		const t = x[M];
		if (null === t || y[M] < 0) break;
		p.push(t);
	}
	if (p.reverse(), i && (i[0] = f[h]), function(t, n, e, r) {
		for (let o = 0; o < Er; o++) {
			let o = !1, s = 0;
			for (; s < e.length - 1;) {
				const i = e[s], c = e[s + 1];
				if ("line" !== i.kind && "line" !== c.kind) {
					const a = Ao(t, i.a), l = ko(t, c.b), h = Rr(t, i.a, c.b, a, l), u = Xr(t, n, i.a, c.b, h, r), f = (i.kind, 6 + (c.kind, 6)), y = Ur(t, n, i, r) + Ur(t, n, c, r), x = .5 * u.chi2 + 6 * r.lambda, p = .5 * y + r.lambda * f;
					if (u.worst <= 1 && x < p) {
						e.splice(s, 2, {
							a: i.a,
							b: c.b,
							kind: "cubic",
							cubic: h
						}), o = !0;
						continue;
					}
				}
				s++;
			}
			if (!o) break;
		}
	}(t, n, p, s), !cr(s) && p.length > 1) {
		const e = function(t, n, e, r) {
			const o = n.map((t) => t >= ir ? 1 / 0 : t);
			let s = 0, i = 0;
			for (const c of e) {
				s += Ur(t, o, c, r);
				for (let t = c.a + 1; t < c.b; t++) n[t] < ir && i++;
			}
			return i < Eo ? r.tau : r.tau * Math.max(So, Math.min(1, $o * Math.sqrt(s / i)));
		}(t, n, p, s), r = function(t, n, e, r, o) {
			const s = e.length;
			if (s < 2) return null;
			const i = o.lambda, c = function(t) {
				const n = t.length >> 1, e = new Float64Array(n);
				for (let r = 1; r < n; r++) {
					const n = t[2 * r] - t[2 * (r - 1)], o = t[2 * r + 1] - t[2 * (r - 1) + 1];
					e[r] = e[r - 1] + Math.sqrt(n * n + o * o);
				}
				return e;
			}(t), a = [e[0].a];
			for (const R of e) a.push(R.b);
			const l = a.slice(), h = [], u = [];
			for (let R = 0; R <= s; R++) {
				const n = R > 0 ? Qo(t, e[R - 1]) : r ? Qo(t, e[s - 1]) : null, o = (R < s ? Do(t, e[R]) : r ? Do(t, e[0]) : null) ?? n, i = n ?? o, c = r || R > 0 && R < s, a = Bo(o[0] + i[0], o[1] + i[1]) ?? o;
				h.push(c ? a : i), u.push(c ? a : o);
			}
			const f = new Array(a.length).fill(0);
			r || (f[0] = 1, f[s] = 1);
			const y = (t) => {
				f[t] = 1, !r || 0 !== t && t !== a.length - 1 || (f[0] = 1, f[a.length - 1] = 1);
			}, x = (n, e) => {
				const r = Math.hypot(t[2 * e] - t[2 * n], t[2 * e + 1] - t[2 * n + 1]);
				return {
					kind: "cubic",
					cubic: Go(t, n, e),
					u: Ho(c, n, e),
					armS: r / 3,
					armE: r / 3,
					chi2: 1 / 0,
					worst: 1 / 0,
					touched: !0
				};
			};
			let p = [];
			for (let R = 0; R < s; R++) p.push(x(a[R], a[R + 1]));
			const M = (n) => Bo(t[2 * n.b] - t[2 * n.a], t[2 * n.b + 1] - t[2 * n.a + 1]), g = Math.cos(zo * Math.PI / 180), d = (e, r) => {
				if (!e) return !1;
				if ("arc" === e.kind && e.circle) return jr(t, n, r.a, r.b, e.circle, o).worst <= 1;
				if ("line" !== e.kind || 3 * (e.b - e.a) < r.b - r.a) return !1;
				const s = M(e), i = M(r);
				return !s || !i || s[0] * i[0] + s[1] * i[1] < g;
			};
			for (let R = 0; R < s; R++) {
				const i = e[R];
				if ("arc" === i.kind && i.circle) {
					if (jr(t, n, i.a, i.b, i.circle, o).worst > 1) continue;
					p[R].kind = "arc", p[R].seg = i;
					continue;
				}
				if ("line" !== i.kind || i.b - i.a < 2) continue;
				if (Tr(t, n, i.a, i.b, o).worst > 1) continue;
				const c = R > 0 ? e[R - 1] : r ? e[s - 1] : void 0, a = R + 1 < s ? e[R + 1] : r ? e[0] : void 0;
				if (d(c, i) || d(a, i)) continue;
				const l = Zr(t, i.a, i.b), h = Tr(t, n, i.a, i.b, o).chi2;
				l && h > i.b - i.a - 1 && 4 * jr(t, n, i.a, i.b, l, o).chi2 < h || (p[R].kind = "line");
			}
			const m = (n) => "line" === p[n].kind ? M(e[n]) : Do(t, e[n]), b = (n) => "line" === p[n].kind ? M(e[n]) : Qo(t, e[n]), w = (t, n) => !t || !n || t[0] * n[0] + t[1] * n[1] < g;
			for (let R = 0; R < s; R++) {
				if ("arc" !== p[R].kind) continue;
				const n = R > 0 ? R - 1 : r ? s - 1 : -1, o = R + 1 < s ? R + 1 : r ? 0 : -1, i = n >= 0 && n !== R && "cubic" !== p[n].kind && w(b(n), Do(t, e[R])), c = o >= 0 && o !== R && "cubic" !== p[o].kind && w(Qo(t, e[R]), m(o));
				(i || c) && (p[R].kind = "cubic", p[R].seg = void 0);
			}
			const A = [];
			for (let R = 0; R < s; R++) "arc" === e[R].kind && e[R].circle && "cubic" === p[R].kind && A.push(R);
			for (let R = A.length - 1; R >= 0; R--) {
				const n = A[R], r = e[n].circle;
				if (!r) continue;
				const o = a[n], s = a[n + 1], i = [];
				let c = 0, l = Math.atan2(t[2 * o + 1] - r.cy, t[2 * o] - r.cx);
				for (let e = o; e <= s; e++) {
					const n = Math.atan2(t[2 * e + 1] - r.cy, t[2 * e] - r.cx);
					let s = n - l;
					s > Math.PI && (s -= 2 * Math.PI), s < -Math.PI && (s += 2 * Math.PI), c += e > o ? s : 0, i.push(c), l = n;
				}
				const y = Math.ceil(Math.abs(c) / Ro - 1e-9);
				let M = n;
				for (let e = 1; e < y; e++) {
					const n = c * e / y;
					let l = o + 1;
					for (; l < s - 1 && Math.abs(i[l - o]) < Math.abs(n);) l++;
					if (l <= a[M] || l >= s) continue;
					const g = Bo(-(t[2 * l + 1] - r.cy), t[2 * l] - r.cx) ?? wo(t, l), d = wo(t, l), m = g[0] * d[0] + g[1] * d[1] < 0 ? [-g[0], -g[1]] : g;
					a.splice(M + 1, 0, l), f.splice(M + 1, 0, 0), h.splice(M + 1, 0, m), u.splice(M + 1, 0, m), p.splice(M, 1, x(a[M], l), x(l, a[M + 2])), M++;
				}
			}
			const k = () => {
				const t = p.length;
				for (let n = 1; n < t; n++) "cubic" !== p[n - 1].kind && "cubic" !== p[n].kind && y(n);
				r && t > 1 && "cubic" !== p[0].kind && "cubic" !== p[t - 1].kind && y(0);
			};
			k();
			const F = (e) => {
				const r = p[e];
				if ("cubic" !== r.kind) return;
				const o = u[e], s = h[e + 1], i = Ko(t, n, a[e], a[e + 1], r.u, o, s);
				r.cubic = i, r.armS = Math.hypot(i.c1x - i.p0x, i.c1y - i.p0y), r.armE = Math.hypot(i.c2x - i.p3x, i.c2y - i.p3y);
			}, v = (n) => {
				const e = p[n];
				if ("cubic" !== e.kind || e.u.length <= 2) return;
				const r = Jo(t, a[n], e.cubic, e.u);
				r && (e.u = r);
			}, N = (e) => {
				const r = p[e], s = a[e], i = a[e + 1];
				if ("fixed" === r.kind) return r.chi2 = r.seg ? Ur(t, n, r.seg, o) : 0, void (r.worst = 0);
				const c = "line" === r.kind ? Tr(t, n, s, i, o) : "arc" === r.kind && r.seg?.circle ? jr(t, n, s, i, r.seg.circle, o) : Xr(t, n, s, i, r.cubic, o);
				r.chi2 = c.chi2, r.worst = c.worst, "cubic" !== r.kind || ns(t, n, s, i, r.cubic, r.u, o) || (r.worst = 1 / 0);
			}, I = (e, o) => {
				const s = p.length, i = new Int32Array(s), c = new Int32Array(s);
				let l = 0;
				for (let t = e; t <= o; t++) t > e && f[t] && l++, i[t] = l, l++, c[t] = l;
				let y = l + 1;
				const x = 0 === e && o === s - 1;
				let M = !1;
				if (x && r && !f[0] && (c[s - 1] = 0, y = l, M = !0), M && y < 2) return;
				const g = new Float64Array(y), d = new Float64Array(y);
				for (let t = e; t <= o; t++) g[i[t]] = u[t][0], d[i[t]] = u[t][1], g[c[t]] = h[t + 1][0], d[c[t]] = h[t + 1][1];
				const m = new Float64Array(y), b = new Float64Array(y), w = new Float64Array(y), A = new Float64Array(y), k = new Float64Array(y), F = new Float64Array(y), v = new Float64Array(y);
				let N, I = 0;
				if (!x) {
					const t = (t) => !f[t] && (r || t > 0 && t < s);
					t(e) && (k[i[e]] += 1, F[i[e]] += u[e][0], v[i[e]] += u[e][1]), t(o + 1) && (k[c[o]] += 1, F[c[o]] += h[o + 1][0], v[c[o]] += h[o + 1][1]);
				}
				for (let r = e; r <= o; r++) {
					const e = p[r], o = a[r], s = a[r + 1], l = i[r], f = c[r];
					if ("cubic" !== e.kind) {
						const n = "line" === e.kind ? Bo(t[2 * s] - t[2 * o], t[2 * s + 1] - t[2 * o + 1]) : "arc" === e.kind && e.seg ? Do(t, e.seg) : u[r], i = "line" === e.kind ? n : "arc" === e.kind && e.seg ? Qo(t, e.seg) : h[r + 1];
						n && i && (k[l] += 1, F[l] += n[0], v[l] += n[1], k[f] += 1, F[f] += i[0], v[f] += i[1]);
						continue;
					}
					const y = t[2 * o], x = t[2 * o + 1], M = t[2 * s], g = t[2 * s + 1];
					let d = 0, N = 0, P = 0, q = 0, L = 0, C = 0, $ = 0;
					for (let r = o + 1; r < s; r++) {
						const s = e.u[r - o], i = 1 - s, c = i * i * i, a = 3 * i * i * s, l = 3 * i * s * s, h = s * s * s, u = 1 / (n[r] * n[r]), f = t[2 * r] - (c + a) * y - (l + h) * M, p = t[2 * r + 1] - (c + a) * x - (l + h) * g, m = a * e.armS, b = -l * e.armE;
						d += u * m * m, N += u * b * b, P += u * m * b, q += u * m * f, L += u * m * p, C += u * b * f, $ += u * b * p;
					}
					m[l] += d, m[f] += N, w[l] += q, A[l] += L, w[f] += C, A[f] += $, f === l + 1 ? b[l] += P : I += P;
				}
				for (let t = 0; t < y; t++) if (k[t] > 0) {
					const n = Oo * (m[t] + 1);
					g[t] = F[t] / k[t], d[t] = v[t] / k[t], m[t] += n, w[t] += n * g[t], A[t] += n * d[t];
				} else {
					const n = Uo * m[t] + 1e-9;
					m[t] += n, w[t] += n * g[t], A[t] += n * d[t];
				}
				if (M) if (2 === y) {
					const t = b[0] + I, n = m[0] * m[1] - t * t;
					N = Math.abs(n) > 1e-300 ? [Float64Array.of((w[0] * m[1] - t * w[1]) / n, (m[0] * w[1] - t * w[0]) / n), Float64Array.of((A[0] * m[1] - t * A[1]) / n, (m[0] * A[1] - t * A[0]) / n)] : null;
				} else N = function(t, n, e, r, o) {
					const s = t.length, i = -t[0], c = Float64Array.from(t);
					c[0] = t[0] - i, c[s - 1] = t[s - 1] - e * e / i;
					const a = ts(c, n, r, o), l = new Float64Array(s);
					l[0] = i, l[s - 1] = e;
					const h = ts(c, n, l, l);
					if (!a || !h) return null;
					const u = h[0], f = 1 + u[0] + e * u[s - 1] / i;
					if (!(Math.abs(f) > 1e-300)) return null;
					const y = (a[0][0] + e * a[0][s - 1] / i) / f, x = (a[1][0] + e * a[1][s - 1] / i) / f;
					for (let p = 0; p < s; p++) a[0][p] -= y * u[p], a[1][p] -= x * u[p];
					return a;
				}(m, b, I, w, A);
				else N = ts(m, b, w, A);
				if (!N) return;
				const P = new Array(y), q = new Float64Array(y);
				for (let t = 0; t < y; t++) {
					const n = N[0][t], e = N[1][t], r = Math.hypot(n, e);
					r > 1e-9 && Number.isFinite(r) && n * g[t] + e * d[t] > 0 ? (P[t] = [n / r, e / r], q[t] = k[t] > 0 ? 1 : r) : (P[t] = Bo(g[t], d[t]) ?? [1, 0], q[t] = 1);
				}
				for (let t = e; t <= o; t++) u[t] = P[i[t]], h[t + 1] = P[c[t]], p[t].armS *= q[i[t]], p[t].armE *= q[c[t]];
				M && (h[0] = u[0], u[s] = h[s]);
			}, P = (t, n) => {
				for (let e = 0; e < No; e++) {
					I(t, n);
					for (let e = t; e <= n; e++) F(e);
					for (let e = t; e <= n; e++) v(e);
					for (let e = t; e <= n; e++) F(e);
				}
				for (let e = t; e <= n; e++) N(e), p[e].touched = !1;
			}, q = () => P(0, p.length - 1), L = () => {
				const t = p.length;
				let n = 0;
				for (; n < t;) {
					if (!p[n].touched) {
						n++;
						continue;
					}
					const e = Math.max(0, n - Io);
					let r = Math.min(t - 1, n + Io);
					for (let o = n + 1; o < t && o <= r + Io; o++) p[o].touched && (r = Math.min(t - 1, o + Io));
					P(e, r), n = r + 1;
				}
			}, C = () => p.some((t) => t.worst > 1), $ = (e, r = 2) => {
				const s = p[e], i = a[e], c = a[e + 1];
				let l = -1, h = -1;
				for (let a = i + r; a <= c - r; a++) {
					const [e, r] = Wo(s.cubic, s.u[a - i]), c = Math.hypot(e - t[2 * a], r - t[2 * a + 1]) / zr(n, a, o);
					c > h && (h = c, l = a);
				}
				return l;
			}, S = (n, e) => {
				const r = p[n], o = _o(r.cubic, r.u[e - a[n]]) ?? wo(t, e);
				a.splice(n + 1, 0, e), f.splice(n + 1, 0, 0), h.splice(n + 1, 0, o), u.splice(n + 1, 0, o), p.splice(n, 1, x(a[n], e), x(e, a[n + 2]));
			}, E = (e, r, s) => {
				const i = s.map((e) => ({
					...x(e.a, e.b),
					kind: "fixed",
					seg: e,
					chi2: Ur(t, n, e, o),
					worst: 0
				})), c = s.slice(0, -1).map((t) => t.b);
				a.splice(e + 1, r - e - 1, ...c), f.splice(e + 1, r - e - 1, ...c.map(() => 1)), h.splice(e + 1, r - e - 1, ...s.slice(0, -1).map((n) => Qo(t, n))), u.splice(e + 1, r - e - 1, ...s.slice(1).map((n) => Do(t, n))), p.splice(e, r - e, ...i), y(e), y(e + s.length), u[e] = Do(t, s[0]), h[e + s.length] = Qo(t, s[s.length - 1]);
			}, U = (t) => {
				const n = a[t], r = a[t + 1];
				let o = n, s = r;
				for (const e of l) if (e <= n && (o = e), e >= r) {
					s = e;
					break;
				}
				const i = a.indexOf(o), c = a.indexOf(s, i), h = e.filter((t) => t.a >= o && t.b <= s);
				return i < 0 || c <= i || 0 === h.length ? -1 : (E(i, c, h), i);
			};
			q();
			for (let R = 0; R < Po && C(); R++) {
				let t = !1;
				for (let n = p.length - 1; n >= 0; n--) {
					const e = p[n];
					if (e.worst <= 1 || "cubic" !== e.kind || a[n + 1] - a[n] < Xo) continue;
					const r = $(n);
					r < 0 || (S(n, r), t = !0);
				}
				if (!t) break;
				L();
			}
			for (let R = 0; R < qo && C(); R++) {
				let e = !1;
				for (let r = p.length - 1; r >= 0; r--) {
					const s = p[r];
					if (s.worst <= 1 || "cubic" !== s.kind) continue;
					e = !0;
					const i = a[r], c = a[r + 1], l = c - i < Xo && (n[i] >= ir || n[c] >= ir), M = r > 0 && !f[r] && "cubic" === p[r - 1].kind, g = r + 1 < p.length && !f[r + 1] && "cubic" === p[r + 1].kind;
					if (l && (M || g)) {
						const t = M && (!g || a[r] - a[r - 1] >= a[r + 2] - a[r + 1]) ? r : r + 1;
						a.splice(t, 1), f.splice(t, 1), h.splice(t, 1), u.splice(t, 1), p.splice(t - 1, 2, {
							...x(a[t - 1], a[t]),
							worst: 0
						});
					} else if (c - i >= Yo) S(r, $(r, Xo));
					else if ((!l || f[r] && f[r + 1]) && Tr(t, n, i, c, o).worst <= 1) s.kind = "line", s.cubic = Go(t, i, c), s.touched = !0;
					else if (!(c - i >= Xo) || f[r] && f[r + 1]) {
						const t = [];
						for (let n = i; n < c; n++) t.push({
							a: n,
							b: n + 1,
							kind: "line"
						});
						E(r, r + 1, t);
					} else y(r), y(r + 1), s.touched = !0;
				}
				if (!e) break;
				k(), L();
			}
			let O = !1;
			for (let R = p.length - 1; R >= 0 && C(); R--) {
				if (p[R].worst <= 1) continue;
				const t = U(R);
				t >= 0 && (R = t, O = !0);
			}
			if (C()) return null;
			const z = (t) => "line" === ("cubic" === t.kind ? "cubic" : "line" === t.kind ? "line" : t.seg?.kind ?? "line") ? 2 : 6, T = (e, r, s, i) => {
				let a = Ho(c, e, r), l = Ko(t, n, e, r, a, s, i);
				for (let o = 0; o < Co; o++) {
					const o = Jo(t, e, l, a);
					if (!o) break;
					a = o, l = Ko(t, n, e, r, a, s, i);
				}
				const h = Xr(t, n, e, r, l, o);
				return {
					kind: "cubic",
					cubic: l,
					u: a,
					armS: Math.hypot(l.c1x - l.p0x, l.c1y - l.p0y),
					armE: Math.hypot(l.c2x - l.p3x, l.c2y - l.p3y),
					chi2: h.chi2,
					worst: ns(t, n, e, r, l, a, o) ? h.worst : 1 / 0,
					touched: !1
				};
			}, j = new Array(a.length).fill(1);
			for (let R = 0; R < Lo; R++) {
				let e = !1, r = 1;
				for (; r < p.length;) {
					const o = p[r - 1], s = p[r];
					if (!j[r] || f[r] || "cubic" !== o.kind || "cubic" !== s.kind) {
						r++;
						continue;
					}
					const l = a[r - 1], y = a[r + 1], x = .5 * (o.chi2 + s.chi2) + i * (z(o) + z(s));
					let M = u[r - 1], g = h[r + 1], d = T(l, y, M, g), m = null, b = null, w = d.worst <= 1 && .5 * d.chi2 + 6 * i <= x;
					if (!w && y - l >= 3) {
						const e = es(t, n, c, l, y), o = Bo(e.c1x - e.p0x, e.c1y - e.p0y) ?? Bo(e.c2x - e.p0x, e.c2y - e.p0y), s = Bo(e.p3x - e.c2x, e.p3y - e.c2y) ?? Bo(e.p3x - e.c1x, e.p3y - e.c1y), A = !f[r - 1] && r - 2 >= 0, k = !f[r + 1] && r + 1 < p.length, F = 1 === f[r - 1] || A && "cubic" === p[r - 2].kind, v = 1 === f[r + 1] || k && "cubic" === p[r + 1].kind;
						if (o && s && (F || v)) {
							F && (M = o), v && (g = s), d = T(l, y, M, g);
							let t = .5 * d.chi2 + 6 * i, n = x, e = d.worst <= 1;
							e && F && A && (m = T(a[r - 2], l, u[r - 2], M), e = m.worst <= 1, t += .5 * m.chi2, n += .5 * p[r - 2].chi2), e && v && k && (b = T(y, a[r + 2], g, h[r + 2]), e = b.worst <= 1, t += .5 * b.chi2, n += .5 * p[r + 1].chi2), w = e && t <= n;
						}
					}
					if (w) {
						O = !0, m && (p[r - 2] = m), b && (p[r + 1] = b), u[r - 1] = M, h[r + 1] = g, f[r - 1] || (h[r - 1] = M), f[r + 1] || (u[r + 1] = g), p.splice(r - 1, 2, d), a.splice(r, 1), f.splice(r, 1), h.splice(r, 1), u.splice(r, 1), j.splice(r, 1);
						for (let t = Math.max(0, r - 3); t <= Math.min(j.length - 1, r + 2); t++) j[t] = 1;
						e = !0;
					} else j[r] = 0, r++;
				}
				if (!e) break;
			}
			if (O) {
				const t = p.map((t) => ({
					...t,
					cubic: { ...t.cubic },
					u: Float64Array.from(t.u)
				})), n = h.map((t) => [t[0], t[1]]), e = u.map((t) => [t[0], t[1]]), r = t.reduce((t, n) => t + n.chi2, 0);
				if (q(), C() || p.reduce((t, n) => t + n.chi2, 0) > r) {
					p = t;
					for (let t = 0; t < n.length; t++) h[t] = n[t], u[t] = e[t];
				}
			}
			const X = [];
			for (let R = 0; R < p.length; R++) {
				const t = p[R], n = a[R], e = a[R + 1];
				"fixed" !== t.kind && "arc" !== t.kind || !t.seg ? "line" === t.kind || "fixed" === t.kind ? X.push({
					a: n,
					b: e,
					kind: "line"
				}) : X.push({
					a: n,
					b: e,
					kind: "cubic",
					cubic: t.cubic
				}) : X.push(t.seg);
			}
			return X;
		}(t, n, p, c, e < s.tau ? {
			...s,
			tau: e
		} : s);
		if (r) return r;
	}
	return p;
}
const Pr = 6, qr = 1 / 0;
let Lr, Cr, $r = "line";
function Sr(t, n, e, r, o, s, i, c) {
	if (r - e <= 1) return $r = "line", 2 * i.lambda;
	const a = i.lambda, l = Tr(t, n, e, r, i);
	let h, u, f = qr, y = null;
	const x = l.worst <= 1;
	if (x && (f = .5 * l.chi2 + 2 * a, y = "line"), !x || .5 * l.chi2 > 4 * a) {
		const c = Zr(t, e, r);
		let l = !1;
		if (c && function(t, n, e, r) {
			let o = Math.atan2(t[2 * n + 1] - r.cy, t[2 * n] - r.cx), s = 0, i = 0;
			for (let c = n + 1; c <= e; c++) {
				const n = Math.atan2(t[2 * c + 1] - r.cy, t[2 * c] - r.cx);
				let e = n - o;
				for (; e > Math.PI;) e -= 2 * Math.PI;
				for (; e < -Math.PI;) e += 2 * Math.PI;
				if (Math.abs(e) > 1e-9) {
					const t = e > 0 ? 1 : -1;
					if (0 === s) s = t;
					else if (t !== s) return !1;
					i += e;
				}
				o = n;
			}
			return Math.abs(i) < 11 / 6 * Math.PI;
		}(t, e, r, c)) {
			const o = jr(t, n, e, r, c, i);
			if (o.worst <= 1) {
				l = !0;
				const t = .5 * o.chi2 + 6 * a;
				t < f && (f = t, y = "arc", h = c);
			}
		}
		if (!l) {
			const c = Rr(t, e, r, o, s), l = Xr(t, n, e, r, c, i);
			if (l.worst <= 1) {
				const t = .5 * l.chi2 + 6 * a;
				t < f && (f = t, y = "cubic", u = c);
			}
		}
	}
	if (null !== y) return $r = y, Lr = h, Cr = u, f;
	if (!c) return qr;
	const p = Rr(t, e, r, o, s), M = Xr(t, n, e, r, p, i);
	return l.worst <= M.worst ? ($r = "line", .5 * l.chi2 + 2 * a) : ($r = "cubic", Cr = p, .5 * M.chi2 + 6 * a);
}
const Er = 6;
function Ur(t, n, e, r) {
	return "arc" === e.kind && e.circle ? jr(t, n, e.a, e.b, e.circle, r).chi2 : "cubic" === e.kind && e.cubic ? Xr(t, n, e.a, e.b, e.cubic, r).chi2 : Tr(t, n, e.a, e.b, r).chi2;
}
function Or(t, n, e) {
	const r = n[2 * e.b], o = n[2 * e.b + 1];
	if ("line" === e.kind) t.push({
		type: "L",
		x: r,
		y: o
	});
	else if ("arc" === e.kind && e.circle) (function(t, n, e, r, o, s, i, c, a) {
		const l = Math.atan2(e - s.cy, n - s.cx), h = c + a >> 1;
		Yr(t, s, l, function(t, n, e) {
			const r = Vr(n - t);
			return Vr(e - t) <= r ? r : r - 2 * Math.PI;
		}(l, Math.atan2(o - s.cy, r - s.cx), Math.atan2(i[2 * h + 1] - s.cy, i[2 * h] - s.cx)), n, e, r, o);
	})(t, n[2 * e.a], n[2 * e.a + 1], r, o, e.circle, n, e.a, e.b);
	else if ("cubic" === e.kind && e.cubic) {
		const n = e.cubic;
		t.push({
			type: "C",
			x1: n.c1x,
			y1: n.c1y,
			x2: n.c2x,
			y2: n.c2y,
			x: r,
			y: o
		});
	} else t.push({
		type: "L",
		x: r,
		y: o
	});
}
function zr(t, n, e) {
	const r = e.tau * t[n];
	return r > e.band ? r : e.band;
}
function Tr(t, n, e, r, o) {
	const s = t[2 * e], i = t[2 * e + 1];
	let c = t[2 * r] - s, a = t[2 * r + 1] - i;
	const l = Math.hypot(c, a), h = l >= 1e-12;
	h && (c /= l, a /= l);
	let u = 0, f = 0;
	for (let y = e + 1; y < r; y++) {
		const e = h ? Math.abs((t[2 * y] - s) * a - (t[2 * y + 1] - i) * c) : Math.hypot(t[2 * y] - s, t[2 * y + 1] - i), r = n[y];
		f += e * e / (r * r);
		const l = e / zr(n, y, o);
		l > u && (u = l);
	}
	return {
		chi2: f,
		worst: u
	};
}
function jr(t, n, e, r, o, s) {
	let i = 0, c = 0;
	for (let a = e + 1; a < r; a++) {
		const e = Math.abs(Math.hypot(t[2 * a] - o.cx, t[2 * a + 1] - o.cy) - o.r), r = n[a];
		c += e * e / (r * r);
		const l = e / zr(n, a, s);
		l > i && (i = l);
	}
	return {
		chi2: c,
		worst: i
	};
}
function Xr(t, n, e, r, o, s) {
	const i = r - e + 1;
	let c = 0, a = t[2 * e], l = t[2 * e + 1], h = 0, u = 0, f = 0;
	for (let x = 1; x < i; x++) {
		const n = e + x;
		f += Math.hypot(t[2 * n] - t[2 * (n - 1)], t[2 * n + 1] - t[2 * (n - 1) + 1]);
	}
	const y = f > 1e-12 ? f : 1;
	for (let x = e + 1; x < r; x++) {
		c += Math.hypot(t[2 * x] - a, t[2 * x + 1] - l), a = t[2 * x], l = t[2 * x + 1];
		const e = t[2 * x], r = t[2 * x + 1], i = $n(o, e, r, c / y), f = 1 - i, p = f * f * f * o.p0x + 3 * f * f * i * o.c1x + 3 * f * i * i * o.c2x + i * i * i * o.p3x, M = f * f * f * o.p0y + 3 * f * f * i * o.c1y + 3 * f * i * i * o.c2y + i * i * i * o.p3y, g = Math.hypot(p - e, M - r), d = n[x];
		u += g * g / (d * d);
		const m = g / zr(n, x, s);
		m > h && (h = m);
	}
	return {
		chi2: u,
		worst: h
	};
}
function Rr(t, n, e, r, o) {
	const s = e - n + 1, i = new Float64Array(s);
	for (let l = 1; l < s; l++) {
		const e = n + l;
		i[l] = i[l - 1] + Math.hypot(t[2 * e] - t[2 * (e - 1)], t[2 * e + 1] - t[2 * (e - 1) + 1]);
	}
	const c = i[s - 1] || 1;
	for (let l = 0; l < s; l++) i[l] /= c;
	let a = Cn(t, n, e, i, r[0], r[1], -o[0], -o[1]);
	for (let l = 0; l < 1; l++) {
		let c = !0, l = -1;
		for (let e = 0; e < s; e++) {
			const r = $n(a, t[2 * (n + e)], t[2 * (n + e) + 1], i[e]);
			if (r <= l) {
				c = !1;
				break;
			}
			i[e] = r, l = r;
		}
		if (!c) break;
		a = Cn(t, n, e, i, r[0], r[1], -o[0], -o[1]);
	}
	return a;
}
function Zr(t, n, e) {
	if (e - n < 2) return null;
	const r = t[2 * n], o = t[2 * n + 1], s = t[2 * e], i = t[2 * e + 1], c = (r + s) / 2, a = (o + i) / 2;
	let l = s - r, h = i - o;
	const u = Math.hypot(l, h);
	if (u < 1e-9) return null;
	l /= u, h /= u;
	const f = -h, y = l, x = u * u / 4;
	let p = 0, M = 0;
	for (let m = n; m <= e; m++) {
		const n = t[2 * m] - c, e = t[2 * m + 1] - a, r = n * f + e * y;
		p += (n * n + e * e - x) * r, M += r * r;
	}
	if (M < 1e-9) return null;
	const g = p / (2 * M), d = Math.hypot(g, u / 2);
	return !isFinite(d) || d < 1e-6 || d > 1e7 ? null : {
		cx: c + g * f,
		cy: a + g * y,
		r: d
	};
}
function Vr(t) {
	let n = t;
	for (; n < 0;) n += 2 * Math.PI;
	for (; n >= 2 * Math.PI;) n -= 2 * Math.PI;
	return n;
}
function Yr(t, n, e, r, o, s, i, c) {
	const a = Math.max(1, Math.ceil(Math.abs(r) / (Math.PI / 2))), l = r / a, h = 4 / 3 * Math.tan(l / 4), { cx: u, cy: f, r: y } = n;
	let x = e, p = o, M = s;
	for (let g = 0; g < a; g++) {
		const n = g === a - 1 ? e + r : x + l, o = u + y * Math.cos(n), s = f + y * Math.sin(n), d = p - h * y * Math.sin(x), m = M + h * y * Math.cos(x), b = o + h * y * Math.sin(n), w = s - h * y * Math.cos(n), A = g === a - 1 ? i : o, k = g === a - 1 ? c : s;
		t.push({
			type: "C",
			x1: d,
			y1: m,
			x2: b,
			y2: w,
			x: A,
			y: k
		}), x = n, p = o, M = s;
	}
}
function Br(t, n, e, r, o) {
	const s = [];
	for (let u = e; u <= r; u++) o(u) || s.push(u);
	if (s.length < 3) return null;
	const i = [];
	for (const u of s) i.push(t[2 * u], t[2 * u + 1]);
	const c = function(t, n, e) {
		const r = e - 0 + 1;
		if (r < 3) return null;
		let o = 0, s = 0;
		for (let k = 0; k <= e; k++) o += t[2 * k], s += t[2 * k + 1];
		const i = o / r, c = s / r;
		let a = 0, l = 0, h = 0, u = 0, f = 0, y = 0, x = 0;
		for (let k = 0; k <= e; k++) {
			const n = t[2 * k] - i, e = t[2 * k + 1] - c;
			a += n * n, l += n * e, h += e * e, u += n * n * n, f += e * e * e, y += n * e * e, x += e * n * n;
		}
		const p = a * h - l * l;
		if (Math.abs(p) < 1e-9) return null;
		const M = (u + y) / 2, g = (f + x) / 2, d = (M * h - g * l) / p, m = (g * a - M * l) / p, b = d + i, w = m + c, A = Math.sqrt(Math.max(0, d * d + m * m + (a + h) / r));
		return !isFinite(A) || A < 1e-6 || A > 1e7 ? null : {
			cx: b,
			cy: w,
			r: A
		};
	}(i, 0, s.length - 1);
	if (!c) return null;
	let { cx: a, cy: l, r: h } = c;
	for (let u = 0; u < 6; u++) {
		const e = [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		], r = [
			0,
			0,
			0
		];
		for (const i of s) {
			const o = t[2 * i] - a, s = t[2 * i + 1] - l, c = Math.hypot(o, s);
			if (c < 1e-9) continue;
			const u = 1 / (n[i] * n[i]), f = c - h, y = [
				-o / c,
				-s / c,
				-1
			];
			for (let t = 0; t < 3; t++) {
				r[t] += u * y[t] * f;
				for (let n = 0; n < 3; n++) e[3 * t + n] += u * y[t] * y[n];
			}
		}
		const o = eo(e, r);
		if (!o) break;
		if (a -= o[0], l -= o[1], h -= o[2], Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) < 1e-7) break;
	}
	return !isFinite(h) || h < 1e-6 || h > 1e7 ? null : {
		cx: a,
		cy: l,
		r: h
	};
}
const Dr = 3, Qr = 5;
function _r(t, n, e) {
	const r = Math.cos(t.angle), o = Math.sin(t.angle), s = n - t.cx, i = e - t.cy;
	let c = Math.abs(s * r + i * o), a = Math.abs(-s * o + i * r), l = t.rx, h = t.ry;
	if (l < h && ([l, h] = [h, l], [c, a] = [a, c]), a > 0) {
		if (c > 0) {
			const t = c / l, n = a / h, e = t * t + n * n - 1;
			if (0 === e) return 0;
			const r = l / h * (l / h), o = r * t;
			let s = n - 1, i = e < 0 ? 0 : Math.hypot(o, n) - 1, u = 0;
			for (let c = 0; c < 128 && (u = (s + i) / 2, u !== s && u !== i); c++) {
				const t = o / (u + r), e = n / (u + 1), c = t * t + e * e - 1;
				if (c > 0) s = u;
				else {
					if (!(c < 0)) break;
					i = u;
				}
			}
			const f = r * c / (u + r), y = a / (u + 1);
			return Math.hypot(f - c, y - a);
		}
		return Math.abs(a - h);
	}
	const u = l * c, f = l * l - h * h;
	if (u < f) {
		const t = u / f;
		return Math.hypot(l * t - c, h * Math.sqrt(1 - t * t));
	}
	return Math.abs(c - l);
}
function Wr(t, n) {
	const e = n.length;
	for (let o = 0; o < e; o++) {
		let r = o;
		for (let n = o + 1; n < e; n++) Math.abs(t[n][o]) > Math.abs(t[r][o]) && (r = n);
		if (Math.abs(t[r][o]) < 1e-300) return null;
		[t[o], t[r]] = [t[r], t[o]], [n[o], n[r]] = [n[r], n[o]];
		for (let s = o + 1; s < e; s++) {
			const r = t[s][o] / t[o][o];
			for (let n = o; n < e; n++) t[s][n] -= r * t[o][n];
			n[s] -= r * n[o];
		}
	}
	const r = new Array(e).fill(0);
	for (let o = e - 1; o >= 0; o--) {
		let s = n[o];
		for (let n = o + 1; n < e; n++) s -= t[o][n] * r[n];
		r[o] = s / t[o][o];
	}
	return r.every(Number.isFinite) ? r : null;
}
const Gr = 256, Kr = .4;
function Hr(t, n, e, r) {
	const o = t.length >> 1;
	if (o < 5) return [];
	const s = o - 1, i = [];
	let c = 1 / 0, a = 1 / 0, l = -1 / 0, h = -1 / 0;
	for (let y = 0; y < s; y++) c = Math.min(c, t[2 * y]), l = Math.max(l, t[2 * y]), a = Math.min(a, t[2 * y + 1]), h = Math.max(h, t[2 * y + 1]);
	const u = Math.hypot(l - c, h - a), f = Br(t, n, 0, o - 2, () => !1);
	if (f && 2 * f.r <= u) {
		let o = 0;
		for (let e = 0; e < s; e++) {
			const r = Math.hypot(t[2 * e] - f.cx, t[2 * e + 1] - f.cy) - f.r;
			o += r * r / (n[e] * n[e]);
		}
		const c = .5 * o + e.lambda * Dr;
		o <= e.tau * e.tau * Math.max(1, s - Dr) && c <= r && Math.abs(to({
			...f,
			rx: f.r,
			ry: f.r,
			angle: 0
		}, t, s)) > 1.9 * Math.PI && i.push({
			prim: {
				kind: "circle",
				circle: f
			},
			cost: c
		});
	}
	if (!cr(e) && Jr(n, s)) {
		const o = function(t, n, e) {
			if (e < 6) return null;
			let r = 0, o = 0;
			for (let N = 0; N < e; N++) r += t[2 * N], o += t[2 * N + 1];
			const s = r / e, i = o / e;
			let c = 0, a = 0, l = 0;
			for (let N = 0; N < e; N++) {
				const n = t[2 * N] - s, e = t[2 * N + 1] - i;
				c += n * n, a += e * e, l += n * e;
			}
			c /= e, a /= e, l /= e;
			const h = (c + a) / 2, u = Math.sqrt(Math.max(0, ((c - a) / 2) ** 2 + l * l)), f = h + u, y = h - u;
			if (!(y > 1e-6)) return null;
			const x = Math.min(e, Gr), p = new Int32Array(x);
			for (let N = 0; N < x; N++) p[N] = Math.floor(N * e / x);
			let M = [
				s,
				i,
				Math.log(Math.sqrt(2 * f)),
				Math.log(Math.sqrt(2 * y)),
				.5 * Math.atan2(2 * l, c - a)
			];
			const g = (e, r) => {
				const o = Math.exp(e[2]), s = Math.exp(e[3]), i = Math.cos(e[4]), c = Math.sin(e[4]);
				let a = 0;
				for (let l = 0; l < x; l++) {
					const h = p[l], u = t[2 * h] - e[0], f = t[2 * h + 1] - e[1], y = u * i + f * c, x = -u * c + f * i, M = y * y / (o * o) + x * x / (s * s) - 1, g = 2 * Math.hypot(y / (o * o), x / (s * s)), d = g > 1e-12 ? M / g / n[h] : 0;
					r[l] = d, a += d * d;
				}
				return a;
			}, d = new Float64Array(x), m = new Float64Array(x), b = Array.from({ length: 5 }, () => new Float64Array(x));
			let w = g(M, d), A = .001;
			const k = Math.sqrt(f), F = [
				1e-6 * k,
				1e-6 * k,
				1e-7,
				1e-7,
				1e-7
			];
			for (let N = 0; N < 40; N++) {
				for (let r = 0; r < 5; r++) {
					const t = M.slice();
					t[r] += F[r], g(t, b[r]);
					for (let n = 0; n < x; n++) b[r][n] = (b[r][n] - d[n]) / F[r];
				}
				const t = Array.from({ length: 5 }, () => new Array(5).fill(0)), n = new Array(5).fill(0);
				for (let r = 0; r < 5; r++) {
					for (let n = r; n < 5; n++) {
						let e = 0;
						for (let t = 0; t < x; t++) e += b[r][t] * b[n][t];
						t[r][n] = e, t[n][r] = e;
					}
					let e = 0;
					for (let t = 0; t < x; t++) e += b[r][t] * d[t];
					n[r] = -e;
				}
				let e = !1;
				for (let r = 0; r < 8 && !e; r++) {
					const r = Wr(t.map((t, n) => t.map((t, e) => n === e ? t * (1 + A) + 1e-12 : t)), n.slice());
					if (!r) {
						A *= 10;
						continue;
					}
					const o = M.map((t, n) => t + r[n]), s = g(o, m);
					if (s < w) {
						const t = w - s;
						M = o, d.set(m), w = s, A = Math.max(1e-9, A / 10), e = !0, t <= 1e-10 * Math.max(1, w) && (N = 40);
					} else A *= 10;
				}
				if (!e) break;
			}
			const v = {
				cx: M[0],
				cy: M[1],
				rx: Math.exp(M[2]),
				ry: Math.exp(M[3]),
				angle: M[4]
			};
			return Number.isFinite(v.cx + v.cy + v.rx + v.ry + v.angle + w) ? {
				ellipse: v,
				spread: w / x
			} : null;
		}(t, n, s), c = o && o.spread <= 4 * e.tau * e.tau ? o.ellipse : null;
		if (c && Math.min(c.rx, c.ry) >= Kr && 2 * Math.max(c.rx, c.ry) <= u) {
			let o = 0;
			for (let e = 0; e < s; e++) {
				const r = _r(c, t[2 * e], t[2 * e + 1]);
				o += r * r / (n[e] * n[e]);
			}
			const a = .5 * o + e.lambda * Qr;
			o <= e.tau * e.tau * Math.max(1, s - Qr) && a < r && Math.abs(to(c, t, s)) > 1.9 * Math.PI && i.push({
				prim: {
					kind: "ellipse",
					ellipse: c
				},
				cost: a
			});
		}
	}
	return 2 === i.length && i[1].cost < i[0].cost && i.reverse(), i;
}
function Jr(t, n) {
	let e = 0;
	for (let r = 0; r < n; r++) t[r] < ir && e++;
	return 2 * e >= n;
}
function to(t, n, e) {
	const r = Math.cos(t.angle), o = Math.sin(t.angle), s = (e) => {
		const s = n[2 * e] - t.cx, i = n[2 * e + 1] - t.cy;
		return Math.atan2((-s * o + i * r) / t.ry, (s * r + i * o) / t.rx);
	};
	let i = 0, c = s(0);
	for (let a = 1; a <= e; a++) {
		const t = s(a % e);
		let n = t - c;
		n > Math.PI && (n -= 2 * Math.PI), n < -Math.PI && (n += 2 * Math.PI), i += n, c = t;
	}
	return i;
}
function no(t, n) {
	const e = Math.cos(t.angle), r = Math.sin(t.angle), o = t.rx * Math.cos(n), s = t.ry * Math.sin(n), i = -t.rx * Math.sin(n), c = t.ry * Math.cos(n);
	return [
		t.cx + o * e - s * r,
		t.cy + o * r + s * e,
		i * e - c * r,
		i * r + c * e
	];
}
function eo(t, n) {
	const [e, r, o, s, i, c, a, l, h] = t, u = e * (i * h - c * l) - r * (s * h - c * a) + o * (s * l - i * a);
	return Math.abs(u) < 1e-12 ? null : [
		(n[0] * (i * h - c * l) - r * (n[1] * h - c * n[2]) + o * (n[1] * l - i * n[2])) / u,
		(e * (n[1] * h - c * n[2]) - n[0] * (s * h - c * a) + o * (s * n[2] - n[1] * a)) / u,
		(e * (i * n[2] - n[1] * l) - r * (s * n[2] - n[1] * a) + n[0] * (s * l - i * a)) / u
	];
}
function ro(t, n, e) {
	const r = (n - t.cx) * t.dx + (e - t.cy) * t.dy;
	return [t.cx + r * t.dx, t.cy + r * t.dy];
}
function oo(t, n, e) {
	const r = n - t.cx, o = e - t.cy, s = Math.hypot(r, o);
	return s < 1e-12 ? [n, e] : [t.cx + r * t.r / s, t.cy + o * t.r / s];
}
function so(t, n) {
	const e = t.dx * n.dy - t.dy * n.dx;
	if (Math.abs(e) < 1e-9) return null;
	const r = ((n.cx - t.cx) * n.dy - (n.cy - t.cy) * n.dx) / e;
	return [t.cx + t.dx * r, t.cy + t.dy * r];
}
function io(t, n, e, r) {
	const o = t.cx - n.cx, s = t.cy - n.cy, i = o * t.dx + s * t.dy, c = i * i - (o * o + s * s - n.r * n.r);
	if (c < 0) return null;
	const a = Math.sqrt(c), l = [t.cx + t.dx * (-i - a), t.cy + t.dy * (-i - a)], h = [t.cx + t.dx * (-i + a), t.cy + t.dy * (-i + a)];
	return Math.hypot(l[0] - e, l[1] - r) <= Math.hypot(h[0] - e, h[1] - r) ? l : h;
}
const co = 1;
function ao(t, n, e, r) {
	const o = (t, n) => null !== t && Math.hypot(t[0] - e, t[1] - r) <= n;
	if (n.cornerStart) {
		const e = n.apexX, r = n.apexY;
		let o = null, s = co;
		if ("line" === t.kind && "line" === n.kind && t.line && n.line) {
			o = so(t.line, n.line);
			const i = t.line.dx * n.line.dy - t.line.dy * n.line.dx, c = Math.atan2(Math.abs(i), t.line.dx * n.line.dx + t.line.dy * n.line.dy);
			return s = c >= wr ? .5 + Math.min(3, br / Math.max(.2, Math.sin(.5 * (Math.PI - c)))) : .5, o && Math.hypot(o[0] - n.vertX, o[1] - n.vertY) <= s ? o : [e, r];
		}
		return t.line && n.circle ? o = io(t.line, n.circle, e, r) : t.circle && n.line ? o = io(n.line, t.circle, e, r) : t.circle && n.circle && (o = function(t, n, e, r) {
			const o = n.cx - t.cx, s = n.cy - t.cy, i = Math.hypot(o, s);
			if (i < 1e-9 || i > t.r + n.r || i < Math.abs(t.r - n.r)) return null;
			const c = (t.r * t.r - n.r * n.r + i * i) / (2 * i), a = Math.sqrt(Math.max(0, t.r * t.r - c * c)), l = t.cx + c * o / i, h = t.cy + c * s / i, u = [l + a * s / i, h - a * o / i], f = [l - a * s / i, h + a * o / i];
			return Math.hypot(u[0] - e, u[1] - r) <= Math.hypot(f[0] - e, f[1] - r) ? u : f;
		}(t.circle, n.circle, e, r)), o && Math.hypot(o[0] - e, o[1] - r) <= 1.5 ? o : [e, r];
	}
	if (t.line && n.line) {
		const s = so(t.line, n.line);
		return o(s, co) ? s : [e, r];
	}
	if (t.line && n.circle) {
		const s = ro(t.line, n.circle.cx, n.circle.cy);
		return o(s, co) ? s : ro(t.line, e, r);
	}
	if (t.circle && n.line) {
		const s = ro(n.line, t.circle.cx, t.circle.cy);
		return o(s, co) ? s : ro(n.line, e, r);
	}
	return t.circle && n.circle ? [e, r] : t.line ? ro(t.line, e, r) : n.line ? ro(n.line, e, r) : t.circle ? oo(t.circle, e, r) : n.circle ? oo(n.circle, e, r) : [e, r];
}
function lo(t, n, e, r, o, s, i) {
	let c, a;
	if (t.line) c = t.line.dx, a = t.line.dy;
	else {
		if (!t.circle) return null;
		{
			c = -(e - t.circle.cy), a = n - t.circle.cx;
			const r = Math.hypot(c, a);
			if (r < 1e-12) return null;
			c /= r, a /= r;
		}
	}
	return c * (s - r) + a * (i - o) < 0 && (c = -c, a = -a), [c, a];
}
function ho(t, n, e) {
	let r = 0;
	for (let o = n + 1; o <= e; o++) r += Math.hypot(t[2 * o] - t[2 * (o - 1)], t[2 * o + 1] - t[2 * (o - 1) + 1]);
	return r;
}
function uo(t, n, e, r, o, s) {
	let i = 0, c = Math.atan2(n[2 * e + 1] - t.cy, n[2 * e] - t.cx);
	for (let h = e + 1; h <= r; h++) {
		const e = Math.atan2(n[2 * h + 1] - t.cy, n[2 * h] - t.cx);
		let r = e - c;
		for (; r > Math.PI;) r -= 2 * Math.PI;
		for (; r <= -Math.PI;) r += 2 * Math.PI;
		i += r, c = e;
	}
	const a = Vr(s - o), l = a - 2 * Math.PI;
	return Math.abs(a - i) <= Math.abs(l - i) ? a : l;
}
function fo(t, n, e, r) {
	let o = 1 / 0, s = 1 / 0, i = -1 / 0, c = -1 / 0;
	for (let h = e; h <= r; h++) {
		const t = n[2 * h], e = n[2 * h + 1];
		t < o && (o = t), t > i && (i = t), e < s && (s = e), e > c && (c = e);
	}
	const a = Math.max(4, Math.hypot(i - o, c - s)), l = (t, n) => t >= o - a && t <= i + a && n >= s - a && n <= c + a;
	return l(t.c1x, t.c1y) && l(t.c2x, t.c2y);
}
const yo = 1, xo = 64;
function po(t, n, e, r) {
	const o = /* @__PURE__ */ new Float64Array(65), s = /* @__PURE__ */ new Float64Array(65);
	for (let c = 0; c <= xo; c++) {
		const n = c / xo, e = 1 - n;
		o[c] = e * e * e * t.p0x + 3 * e * e * n * t.c1x + 3 * e * n * n * t.c2x + n * n * n * t.p3x, s[c] = e * e * e * t.p0y + 3 * e * e * n * t.c1y + 3 * e * n * n * t.c2y + n * n * n * t.p3y;
	}
	let i = 0;
	for (let c = e + 1; c < r; c++) {
		const t = n[2 * c], e = n[2 * c + 1];
		let r = 1 / 0;
		for (let n = 0; n < xo; n++) {
			const i = o[n + 1] - o[n], c = s[n + 1] - s[n], a = i * i + c * c;
			let l = a > 0 ? ((t - o[n]) * i + (e - s[n]) * c) / a : 0;
			l = l < 0 ? 0 : l > 1 ? 1 : l;
			const h = Math.hypot(t - o[n] - l * i, e - s[n] - l * c);
			h < r && (r = h);
		}
		r > i && (i = r);
	}
	return i;
}
const Mo = 1e3;
function go(t, n, e, r) {
	const o = n[r], s = n[(r - 1 + e) % e], i = n[(r + 1) % e], c = mr(t[2 * s], t[2 * s + 1], t[2 * o], t[2 * o + 1], t[2 * i], t[2 * i + 1]) * Math.PI / 180, a = .5 * (Math.PI - c);
	return Math.min(3, Math.max(br, br / Math.max(.2, Math.sin(a))));
}
const mo = 2.5;
function bo(t, n, e, r, o, s, i, c, a) {
	const l = (t.length >> 1) - 1, h = t[0], u = t[1], f = t[2 * l], y = t[2 * l + 1], x = (e) => {
		if (!o) return !1;
		if (0 === e || e === l) return !0;
		if (n[e] >= Mo) return !0;
		const r = t[2 * e], s = t[2 * e + 1];
		return Math.hypot(r - h, s - u) <= br || Math.hypot(r - f, s - y) <= br;
	}, p = {
		kind: e.kind,
		pts: t,
		sig: n,
		a: e.a,
		b: e.b,
		cornerStart: r,
		apexX: s,
		apexY: i,
		vertX: c,
		vertY: a,
		skip: x
	};
	if ("line" === e.kind) {
		const r = function(t, n, e, r, o) {
			let s = 0, i = 0, c = 0, a = 0;
			for (let p = e; p <= r; p++) {
				if (o(p)) continue;
				const e = 1 / (n[p] * n[p]);
				s += e, i += e * t[2 * p], c += e * t[2 * p + 1], a++;
			}
			if (a < 2 || s <= 0) return null;
			i /= s, c /= s;
			let l = 0, h = 0, u = 0;
			for (let p = e; p <= r; p++) {
				if (o(p)) continue;
				const e = 1 / (n[p] * n[p]), r = t[2 * p] - i, s = t[2 * p + 1] - c;
				l += e * r * r, h += e * r * s, u += e * s * s;
			}
			const f = .5 * Math.atan2(2 * h, l - u);
			let y = Math.cos(f), x = Math.sin(f);
			return y * (t[2 * r] - t[2 * e]) + x * (t[2 * r + 1] - t[2 * e + 1]) < 0 && (y = -y, x = -x), {
				cx: i,
				cy: c,
				dx: y,
				dy: x
			};
		}(t, n, e.a, e.b, x);
		r ? p.line = r : p.kind = "line";
	} else if ("arc" === e.kind) {
		const r = Br(t, n, e.a, e.b, x) ?? e.circle;
		r && (p.circle = r);
	}
	return p;
}
function wo(t, n) {
	const e = t.length >> 1, r = Math.max(0, n - 1), o = Math.min(e - 1, n + 1);
	let s = t[2 * o] - t[2 * r], i = t[2 * o + 1] - t[2 * r + 1];
	const c = Math.hypot(s, i);
	return c < 1e-12 ? Ao(t, n) : (s /= c, i /= c, [s, i]);
}
function Ao(t, n) {
	const e = t.length >> 1, r = n + 1 < e ? n + 1 : n, o = n + 1 < e ? n : n - 1;
	let s = t[2 * r] - t[2 * o], i = t[2 * r + 1] - t[2 * o + 1];
	const c = Math.hypot(s, i);
	return c < 1e-12 ? [1, 0] : (s /= c, i /= c, [s, i]);
}
function ko(t, n) {
	const e = n - 1 >= 0 ? n - 1 : n, r = n - 1 >= 0 ? n : n + 1;
	let o = t[2 * e] - t[2 * r], s = t[2 * e + 1] - t[2 * r + 1];
	const i = Math.hypot(o, s);
	return i < 1e-12 ? [-1, 0] : (o /= i, s /= i, [o, s]);
}
function Fo(t, n, e, r) {
	const o = new Array(2 * (r - e + 1)), s = new Array(r - e + 1);
	for (let i = e; i <= r; i++) o[2 * (i - e)] = t[2 * i], o[2 * (i - e) + 1] = t[2 * i + 1], s[i - e] = n[i];
	return {
		pts: o,
		sig: s
	};
}
function vo(t, n, e, r, o) {
	const s = e === r ? o : (r - e + o) % o, i = new Array(2 * (s + 1)), c = new Array(s + 1);
	for (let a = 0; a <= s; a++) {
		const r = (e + a) % o;
		i[2 * a] = t[2 * r], i[2 * a + 1] = t[2 * r + 1], c[a] = n[r];
	}
	return {
		pts: i,
		sig: c
	};
}
const No = 3, Io = 2, Po = 4, qo = 8, Lo = 6, Co = 2, $o = 2, So = .5, Eo = 8, Uo = .001, Oo = 1e8, zo = 3, To = 1, jo = .02, Xo = 4, Ro = Math.PI / 2, Zo = 2, Vo = 3, Yo = 8;
function Bo(t, n) {
	const e = Math.hypot(t, n);
	return e > 1e-12 && Number.isFinite(e) ? [t / e, n / e] : null;
}
function Do(t, n) {
	const e = t[2 * n.a], r = t[2 * n.a + 1];
	if ("cubic" === n.kind && n.cubic) {
		const t = n.cubic, e = Bo(t.c1x - t.p0x, t.c1y - t.p0y) ?? Bo(t.c2x - t.p0x, t.c2y - t.p0y);
		if (e) return e;
	} else if ("arc" === n.kind && n.circle) {
		const o = n.circle;
		let s = -(r - o.cy), i = e - o.cx;
		s * (t[2 * (n.a + 1)] - e) + i * (t[2 * (n.a + 1) + 1] - r) < 0 && (s = -s, i = -i);
		const c = Bo(s, i);
		if (c) return c;
	}
	return Bo(t[2 * n.b] - e, t[2 * n.b + 1] - r) ?? [1, 0];
}
function Qo(t, n) {
	const e = t[2 * n.b], r = t[2 * n.b + 1];
	if ("cubic" === n.kind && n.cubic) {
		const t = n.cubic, e = Bo(t.p3x - t.c2x, t.p3y - t.c2y) ?? Bo(t.p3x - t.c1x, t.p3y - t.c1y);
		if (e) return e;
	} else if ("arc" === n.kind && n.circle) {
		const o = n.circle;
		let s = -(r - o.cy), i = e - o.cx;
		s * (e - t[2 * (n.b - 1)]) + i * (r - t[2 * (n.b - 1) + 1]) < 0 && (s = -s, i = -i);
		const c = Bo(s, i);
		if (c) return c;
	}
	return Bo(e - t[2 * n.a], r - t[2 * n.a + 1]) ?? [1, 0];
}
function _o(t, n) {
	const e = 1 - n;
	return Bo(3 * e * e * (t.c1x - t.p0x) + 6 * e * n * (t.c2x - t.c1x) + 3 * n * n * (t.p3x - t.c2x), 3 * e * e * (t.c1y - t.p0y) + 6 * e * n * (t.c2y - t.c1y) + 3 * n * n * (t.p3y - t.c2y));
}
function Wo(t, n) {
	const e = 1 - n, r = e * e * e, o = 3 * e * e * n, s = 3 * e * n * n, i = n * n * n;
	return [r * t.p0x + o * t.c1x + s * t.c2x + i * t.p3x, r * t.p0y + o * t.c1y + s * t.c2y + i * t.p3y];
}
function Go(t, n, e) {
	const r = t[2 * n], o = t[2 * n + 1], s = t[2 * e], i = t[2 * e + 1];
	return {
		p0x: r,
		p0y: o,
		c1x: r + (s - r) / 3,
		c1y: o + (i - o) / 3,
		c2x: r + 2 * (s - r) / 3,
		c2y: o + 2 * (i - o) / 3,
		p3x: s,
		p3y: i
	};
}
function Ko(t, n, e, r, o, s, i) {
	const c = t[2 * e], a = t[2 * e + 1], l = t[2 * r], h = t[2 * r + 1];
	let u = 0, f = 0, y = 0, x = 0, p = 0;
	for (let w = e + 1; w < r; w++) {
		const r = o[w - e], M = 1 - r, g = M * M * M, d = 3 * M * M * r, m = 3 * M * r * r, b = r * r * r, A = 1 / (n[w] * n[w]), k = d * s[0], F = d * s[1], v = -m * i[0], N = -m * i[1], I = t[2 * w] - (g + d) * c - (m + b) * l, P = t[2 * w + 1] - (g + d) * a - (m + b) * h;
		u += A * (k * k + F * F), f += A * (k * v + F * N), y += A * (v * v + N * N), x += A * (k * I + F * P), p += A * (v * I + N * P);
	}
	const M = Math.hypot(l - c, h - a), g = jo * M, d = To * M;
	let m = M / 3, b = M / 3;
	if (u > 0 && y > 0) {
		const t = (t) => t < g ? g : t > d ? d : t, n = (t, n) => u * t * t + 2 * f * t * n + y * n * n - 2 * (x * t + p * n), e = u * y - f * f, r = (x * y - p * f) / e, o = (u * p - f * x) / e;
		if (e > 1e-12 * u * y && r >= g && r <= d && o >= g && o <= d) m = r, b = o;
		else {
			let e = 1 / 0;
			for (const r of [g, d]) {
				const o = t((p - f * r) / y), s = t((x - f * r) / u), i = n(r, o), c = n(s, r);
				i < e && (e = i, m = r, b = o), c < e && (e = c, m = s, b = r);
			}
		}
	}
	return {
		p0x: c,
		p0y: a,
		c1x: c + m * s[0],
		c1y: a + m * s[1],
		c2x: l - b * i[0],
		c2y: h - b * i[1],
		p3x: l,
		p3y: h
	};
}
function Ho(t, n, e) {
	const r = new Float64Array(e - n + 1), o = t[e] - t[n] || 1;
	for (let s = n + 1; s < e; s++) r[s - n] = (t[s] - t[n]) / o;
	return r[e - n] = 1, r;
}
function Jo(t, n, e, r) {
	const o = r.length, s = new Float64Array(o);
	s[o - 1] = 1;
	let i = 0;
	for (let c = 1; c < o - 1; c++) {
		const o = $n(e, t[2 * (n + c)], t[2 * (n + c) + 1], r[c]);
		if (o <= i || o >= 1) return null;
		s[c] = o, i = o;
	}
	return s;
}
function ts(t, n, e, r) {
	const o = t.length, s = new Float64Array(o), i = new Float64Array(o), c = new Float64Array(o);
	let a = t[0];
	if (!(Math.abs(a) > 1e-300)) return null;
	s[0] = o > 1 ? n[0] / a : 0, i[0] = e[0] / a, c[0] = r[0] / a;
	for (let l = 1; l < o; l++) {
		if (a = t[l] - n[l - 1] * s[l - 1], !(Math.abs(a) > 1e-300)) return null;
		s[l] = l < o - 1 ? n[l] / a : 0, i[l] = (e[l] - n[l - 1] * i[l - 1]) / a, c[l] = (r[l] - n[l - 1] * c[l - 1]) / a;
	}
	for (let l = o - 2; l >= 0; l--) i[l] -= s[l] * i[l + 1], c[l] -= s[l] * c[l + 1];
	return [i, c];
}
function ns(t, n, e, r, o, s, i) {
	const c = To * Math.hypot(o.p3x - o.p0x, o.p3y - o.p0y) + 1e-9;
	if (Math.hypot(o.c1x - o.p0x, o.c1y - o.p0y) > c || Math.hypot(o.c2x - o.p3x, o.c2y - o.p3y) > c) return !1;
	const a = _o(o, 0), l = _o(o, 1);
	if (a && l && a[0] * l[0] + a[1] * l[1] < Math.cos(Ro)) return !1;
	const h = (e, r, o) => {
		const s = t[2 * o], c = t[2 * o + 1], a = t[2 * (o + 1)] - s, l = t[2 * (o + 1) + 1] - c, h = a * a + l * l, u = h < 1e-18 ? 0 : Math.max(0, Math.min(1, ((e - s) * a + (r - c) * l) / h)), f = Math.max(zr(n, o, i), zr(n, o + 1, i));
		return Math.hypot(e - s - u * a, r - c - u * l) <= Zo * f;
	};
	for (let u = e; u < r; u++) {
		const [t, n] = Wo(o, .5 * (s[u - e] + s[u + 1 - e]));
		if (h(t, n, u)) continue;
		let i = !1;
		const c = Math.max(e, u - Vo), a = Math.min(r - 1, u + Vo);
		for (let e = c; e <= a && !i; e++) i = e !== u && h(t, n, e);
		if (!i) return !1;
	}
	return !0;
}
function es(t, n, e, r, o) {
	let s = Ho(e, r, o);
	const i = t[2 * r], c = t[2 * r + 1], a = t[2 * o], l = t[2 * o + 1], h = () => {
		let e = 0, h = 0, u = 0, f = 0, y = 0, x = 0, p = 0;
		for (let o = 0; o < s.length; o++) {
			const M = s[o], g = 1 - M, d = g * g * g, m = 3 * g * g * M, b = 3 * g * M * M, w = M * M * M, A = 1 / (n[r + o] * n[r + o]), k = t[2 * (r + o)] - d * i - w * a, F = t[2 * (r + o) + 1] - d * c - w * l;
			e += A * m * m, h += A * m * b, u += A * b * b, f += A * m * k, y += A * b * k, x += A * m * F, p += A * b * F;
		}
		const M = e * u - h * h;
		return Math.abs(M) < 1e-12 ? Go(t, r, o) : {
			p0x: i,
			p0y: c,
			c1x: (f * u - y * h) / M,
			c1y: (x * u - p * h) / M,
			c2x: (y * e - f * h) / M,
			c2y: (p * e - x * h) / M,
			p3x: a,
			p3y: l
		};
	};
	let u = h();
	for (let f = 0; f < 3; f++) {
		const n = Jo(t, r, u, s);
		if (!n) break;
		s = n, u = h();
	}
	return u;
}
function rs(t, n, e) {
	return "pixel" === n.curveMode ? cs(t) : is(t, ss(t, e ?? n.coverage), n);
}
const os = .75;
function ss(t, e, r) {
	const o = t.slice();
	o.push(t[0], t[1]);
	const s = fn(o);
	if (s.length < 4) return null;
	const i = [], c = e ? mn(o, e, s, r, i) : o, a = ln(c, en(c), s, !0), l = Math.min(Math.abs(n(t)), Math.abs(n(c)));
	if (Math.abs(n(a)) < os * l) return null;
	const h = {
		polygon: a,
		geom: c,
		vertices: s,
		sigma: hr(o, c, void 0 !== e, s, r, i),
		refined: void 0 !== e,
		extent: e ? Math.max(e.width, e.height) : 0
	}, u = e ? function(t, n, e) {
		const r = Fn(e), o = t.length >> 1;
		if (o < 4) return;
		let s = 1 / 0, i = 1 / 0, c = -1 / 0, a = -1 / 0, l = 0;
		for (let A = 0; A < o; A++) {
			const n = t[2 * A], e = t[2 * A + 1];
			s = Math.min(s, n), c = Math.max(c, n), i = Math.min(i, e), a = Math.max(a, e);
			const r = (A + 1) % o;
			l += n * t[2 * r + 1] - t[2 * r] * e;
		}
		const h = Math.max(0, s - 2), u = Math.max(0, i - 2), f = Math.min(r.width, c + 2) - h, y = Math.min(r.height, a + 2) - u;
		if (f <= 0 || y <= 0 || f > 64 || y > 64) return;
		const x = (t, n) => r.at(t < 0 ? 0 : t >= r.width ? r.width - 1 : t, n < 0 ? 0 : n >= r.height ? r.height - 1 : n), p = l > 0;
		let M = 0;
		for (let A = 0; A < o; A++) {
			const n = t[2 * A], e = t[2 * A + 1], r = (A + 1) % o, s = Math.sign(t[2 * r] - n), i = Math.sign(t[2 * r + 1] - e), c = Math.abs(t[2 * r] - n) + Math.abs(t[2 * r + 1] - e);
			for (let t = 0; t < c; t++) {
				const r = n + s * t, o = e + i * t;
				let c, a, l, h;
				[c, a, l, h] = s > 0 ? [
					r,
					o,
					r,
					o - 1
				] : s < 0 ? [
					r - 1,
					o - 1,
					r - 1,
					o
				] : i > 0 ? [
					r - 1,
					o,
					r,
					o
				] : [
					r,
					o - 1,
					r - 1,
					o - 1
				];
				const u = x(c, a) - x(l, h);
				M += p ? u : -u;
			}
		}
		const g = M < 0 ? -1 : 1, d = new Float32Array(f * y);
		for (let A = 0; A < y; A++) for (let t = 0; t < f; t++) {
			const n = .5 + g * x(h + t, u + A);
			d[A * f + t] = n < 0 ? 0 : n > 1 ? 1 : n;
		}
		const m = new Uint8Array(f * y);
		let b = !1;
		const w = Math.min(o, n.length >> 1);
		for (let A = 0; A < w; A++) {
			const e = n[2 * A], r = n[2 * A + 1];
			if (e === t[2 * A] && r === t[2 * A + 1]) continue;
			b = !0;
			const o = Math.max(0, Math.ceil(e - vn - .5) - h), s = Math.min(f - 1, Math.floor(e + vn - .5) - h), i = Math.max(0, Math.ceil(r - vn - .5) - u), c = Math.min(y - 1, Math.floor(r + vn - .5) - u);
			for (let t = i; t <= c; t++) for (let n = o; n <= s; n++) Math.hypot(h + n + .5 - e, u + t + .5 - r) <= vn && (m[t * f + n] = 1);
		}
		return b ? {
			x0: h,
			y0: u,
			w: f,
			h: y,
			data: d,
			weight: m
		} : void 0;
	}(o, function(t, n, e) {
		if (!e) return n;
		const r = e.length, o = n.slice();
		for (let s = 0; s < o.length >> 1; s++) 0 !== e[s % r] && (o[2 * s] = t[2 * s], o[2 * s + 1] = t[2 * s + 1]);
		return o;
	}(o, c, r), e) : void 0;
	return u && (h.coverage = u), h;
}
function is(t, n, r) {
	if ("pixel" === r.curveMode || null === n) return cs(t);
	const o = n.polygon;
	if ("polygon" === r.curveMode) {
		const t = [{
			type: "M",
			x: o[0],
			y: o[1]
		}];
		for (let n = 1; n < (o.length >> 1) - 1; n++) t.push({
			type: "L",
			x: o[2 * n],
			y: o[2 * n + 1]
		});
		return t.push({ type: "Z" }), t;
	}
	const s = r.scale ?? 1, i = (t) => t / s, c = function(t, n, e, r, o) {
		const s = (t.length >> 1) - 1, i = (r.length >> 1) - 1;
		if (s < 3 || i < 3) return null;
		o = fr(o), n = ar(n, o);
		const c = (n) => t[2 * e[n]], a = (n) => t[2 * e[n] + 1], l = (t, n, e, r, s, i) => mr(t, n, e, r, s, i) >= gr && Sn(t, n, e, r, s, i, o.alphamax, o.cornerThreshold), h = new Uint8Array(i), u = new Uint8Array(i);
		for (let k = 0; k < i; k++) {
			const t = (k + i - 1) % i, n = (k + 1) % i;
			l(c(t), a(t), c(k), a(k), c(n), a(n)) && (h[k] = 1);
			const e = (k + 2) % i;
			if (i > 3 && Math.hypot(c(n) - c(k), a(n) - a(k)) <= mo) {
				const r = (c(k) + c(n)) / 2, o = (a(k) + a(n)) / 2;
				l(c(t), a(t), r, o, c(e), a(e)) && (u[k] = 1);
			}
		}
		const f = {
			points: Float64Array.from(t.slice(0, 2 * s)),
			sigma: Float64Array.from(n.slice(0, s)),
			closed: !0
		}, y = {
			tau: o.tau,
			lambda: o.lambda
		}, x = (e, r, i) => {
			const c = function(t, n, e) {
				const r = {
					poly: t,
					n: t.points.length >> 1,
					edges: null
				}, o = new re();
				return {
					incoming: ce(r, n, !1, e, o),
					outgoing: ce(r, n, !0, e, o)
				};
			}(f, e, y), a = Math.min((e - r + s) % s, 16), l = Math.min((i - e + s) % s, 16), h = dr(t, n, s, (e - a + s) % s, (e - 1 + s) % s, e, o.tau), u = dr(t, n, s, (e + 1) % s, (e + l) % s, e, o.tau), x = h ?? c.incoming, p = u ?? c.outgoing;
			return !x || !p || x.x * p.x + x.y * p.y <= Math.cos(gr * Math.PI / 180);
		}, p = new Uint8Array(i);
		for (let k = 0; k < i; k++) {
			const t = e[(k + i - 1) % i];
			if (h[k] && x(e[k], t, e[(k + 1) % i]) && (p[k] = 1), !u[k]) continue;
			const n = (k + 1) % i;
			x((e[k] + ((e[n] - e[k] + s) % s >> 1)) % s, t, e[(k + 2) % i]) && (p[k] = 1, p[n] = 1);
		}
		const M = [];
		for (let k = 0; k < i; k++) p[k] && M.push(k);
		if (cr(o)) {
			const c = function(t, n, e, r, o, s, i, c) {
				const a = [];
				if (0 === o.length) {
					const { pts: r, sig: o } = vo(t, n, 0, 0, s), l = [];
					for (let t = 1; t < i; t++) l.push(e[t]);
					const h = wo(r, 0), u = [1 / 0], f = Ir(r, o, l, [h[0], h[1]], [h[0], h[1]], c, u), y = function(t, n, e, r) {
						const [o] = Hr(t, n, e, r);
						return o ? o.prim : null;
					}(r, o, c, u[0]);
					if (y) {
						const t = [];
						return Mr(t, y, r), t.push({ type: "Z" }), t;
					}
					for (const t of f) a.push(bo(r, o, t, !1, !1, 0, 0, 0, 0));
				} else {
					const l = /* @__PURE__ */ new Map(), h = (o) => {
						const c = l.get(o);
						if (c) return c;
						const a = Fr(t, n, e, s, i, o, [r[2 * o], r[2 * o + 1]]);
						return l.set(o, a), a;
					};
					for (let r = 0; r < o.length; r++) {
						const l = o[r], u = o[(r + 1) % o.length], { pts: f, sig: y, splits: x } = vr(t, n, e, s, i, l, u), [p, M] = h(l), [g, d] = h(u), m = f[0], b = f[1], w = (f.length >> 1) - 1, A = f[2 * w], k = f[2 * w + 1];
						f[0] = p, f[1] = M, f[f.length - 2] = g, f[f.length - 1] = d;
						const F = go(t, e, i, l), v = go(t, e, i, u);
						for (let t = 1; t < w; t++) {
							const n = f[2 * t], e = f[2 * t + 1], r = Math.min(Math.hypot(n - m, e - b), Math.hypot(n - p, e - M)) <= F, o = Math.min(Math.hypot(n - A, e - k), Math.hypot(n - g, e - d)) <= v;
							(r || o) && (y[t] = Mo);
						}
						Ir(f, y, x, Ao(f, 0), Ao(f, f.length / 2 - 1), c).forEach((t, n) => a.push(bo(f, y, t, 0 === n, !0, p, M, m, b)));
					}
				}
				(function(t) {
					for (let n = 0; n < t.length && t.length > 3; n++) {
						let n = -1;
						for (let o = 0; o < t.length; o++) {
							const e = t[o], r = t[(o + 1) % t.length];
							if (!e.cornerStart || !r.cornerStart) continue;
							const s = e.pts[2 * e.a], i = e.pts[2 * e.a + 1], c = e.pts[2 * e.b], a = e.pts[2 * e.b + 1];
							if (Math.hypot(c - s, a - i) > mo) continue;
							const l = t[(o - 1 + t.length) % t.length];
							if ((l.line || l.circle) && (r.line || r.circle)) {
								n = o;
								break;
							}
						}
						if (n < 0) return;
						const e = t[n], r = t[(n + 1) % t.length];
						r.apexX = (e.pts[2 * e.a] + e.pts[2 * e.b]) / 2, r.apexY = (e.pts[2 * e.a + 1] + e.pts[2 * e.b + 1]) / 2, r.vertX = r.apexX, r.vertY = r.apexY, t.splice(n, 1);
					}
				})(a);
				const l = a.length;
				if (0 === l) return null;
				const h = new Array(l);
				for (let f = 0; f < l; f++) {
					const t = a[(f - 1 + l) % l], n = a[f], e = n.pts[2 * n.a], r = n.pts[2 * n.a + 1];
					h[f] = 1 === l ? [e, r] : ao(t, n, e, r);
				}
				const u = [{
					type: "M",
					x: h[0][0],
					y: h[0][1]
				}];
				for (let f = 0; f < l; f++) {
					const t = a[f], [n, e] = h[f], [r, o] = h[(f + 1) % l];
					if ("line" === t.kind || !t.circle && "arc" === t.kind) u.push({
						type: "L",
						x: r,
						y: o
					});
					else if ("arc" === t.kind && t.circle) {
						const s = t.circle, i = Math.atan2(e - s.cy, n - s.cx), c = uo(s, t.pts, t.a, t.b, i, Math.atan2(o - s.cy, r - s.cx));
						if (s.r * Math.abs(c) > 2 * ho(t.pts, t.a, t.b) + 3) return null;
						Yr(u, s, i, c, n, e, r, o);
					} else {
						const s = t.pts.slice();
						s[2 * t.a] = n, s[2 * t.a + 1] = e, s[2 * t.b] = r, s[2 * t.b + 1] = o;
						const i = a[(f - 1 + l) % l], h = a[(f + 1) % l];
						let y = Ao(s, t.a), x = Ao(s, t.b - 1);
						t.cornerStart || (y = lo(i, n, e, n, e, r, o) ?? wo(s, t.a)), h.cornerStart || (x = lo(h, r, o, n, e, r, o) ?? wo(s, t.b));
						let p = Rr(s, t.a, t.b, y, x);
						if (t.b - t.a >= 2) {
							const n = Xr(s, t.sig, t.a, t.b, p, c);
							if (n.worst > 1) {
								const e = Rr(s, t.a, t.b, Ao(s, t.a), Ao(s, t.b - 1));
								if (Xr(s, t.sig, t.a, t.b, e, c).chi2 < n.chi2 && (p = e), po(p, s, t.a, t.b) > yo) return null;
							}
						}
						if (!fo(p, t.pts, t.a, t.b)) return null;
						u.push({
							type: "C",
							x1: p.c1x,
							y1: p.c1y,
							x2: p.c2x,
							y2: p.c2y,
							x: r,
							y: o
						});
					}
				}
				return u.push({ type: "Z" }), u;
			}(t, n, e, r, M, s, i, o);
			if (c) return c;
		}
		const g = [];
		if (0 === M.length) {
			const { pts: r, sig: c } = vo(t, n, 0, 0, s), a = [];
			for (let t = 1; t < i; t++) a.push(e[t]);
			const l = wo(r, 0), h = [1 / 0], u = Ir(r, c, a, [l[0], l[1]], [l[0], l[1]], o, h, !0);
			g.push({
				type: "M",
				x: t[0],
				y: t[1]
			});
			for (const t of u) Or(g, r, t);
			return g.push({ type: "Z" }), pr(g, r, c, o, h[0]);
		}
		const d = /* @__PURE__ */ new Map();
		for (let k = 0; k < M.length && M.length > 2; k++) {
			const r = kr(t, n, e, s, i, M, k);
			r && (d.set(M[k], r), d.set(M[(k + 1) % M.length], r));
		}
		const m = (o) => {
			const c = d.get(o);
			if (c) return c;
			const a = [r[2 * o], r[2 * o + 1]], l = Fr(t, n, e, s, i, o, a);
			return d.set(o, l), l;
		}, [b, w] = m(M[0]);
		g.push({
			type: "M",
			x: b,
			y: w
		});
		const A = [0];
		for (let k = 0; k < M.length; k++) {
			const r = M[k], c = M[(k + 1) % M.length], [a, l] = m(r), [h, u] = m(c);
			if (a === h && l === u && M.length > 1) continue;
			const { pts: f, sig: y, splits: x } = vr(t, n, e, s, i, r, c);
			f[0] = a, f[1] = l, f[f.length - 2] = h, f[f.length - 1] = u, Nr(g, f, y, x, Ao(f, 0), Ao(f, f.length / 2 - 1), o, A);
		}
		if (g.push({ type: "Z" }), !cr(o) && Jr(n, s)) {
			const e = vo(t, n, 0, 0, s);
			return pr(g, e.pts, e.sig, o, A[0]);
		}
		return g;
	}(1 === s ? n.geom : n.geom.map(i), n.sigma, n.vertices, 1 === s ? o : o.map(i), {
		alphamax: 4 * r.smoothing / 3,
		cornerThreshold: r.cornerThreshold,
		lambda: lr(n.extent / s),
		tau: 2,
		band: xr(r.optTolerance),
		reach: ur(r.curveOptimize),
		stride: Math.round(yr(r.curveOptimize) * s),
		extent: n.extent / s,
		coverage: n.coverage && 1 !== s ? {
			...n.coverage,
			unit: s
		} : n.coverage
	});
	return c ? 1 === s ? c : e(c, s) : cs(t);
}
function cs(t) {
	const n = t.length >> 1, e = [];
	for (let r = 0; r < n; r++) {
		const o = (r + n - 1) % n, s = (r + 1) % n, i = t[2 * r] - t[2 * o], c = t[2 * r + 1] - t[2 * o + 1], a = t[2 * s] - t[2 * r];
		i * (t[2 * s + 1] - t[2 * r + 1]) - c * a !== 0 && (0 === e.length ? e.push({
			type: "M",
			x: t[2 * r],
			y: t[2 * r + 1]
		}) : e.push({
			type: "L",
			x: t[2 * r],
			y: t[2 * r + 1]
		}));
	}
	return 0 === e.length && e.push({
		type: "M",
		x: t[0],
		y: t[1]
	}), e.push({ type: "Z" }), e;
}
const as = 180 / Math.PI, ls = Math.PI / 180;
function hs(t, n) {
	return {
		type: "L",
		x: t,
		y: n
	};
}
function us(t, n, e, r, o, s) {
	return {
		type: "C",
		x1: t,
		y1: n,
		x2: e,
		y2: r,
		x: o,
		y: s
	};
}
function fs(t, n, e, r, o, s, i) {
	return {
		type: "A",
		rx: t,
		ry: n,
		rotation: e * as,
		largeArc: r,
		sweep: o,
		x: s,
		y: i
	};
}
function ys(t) {
	switch (t.type) {
		case "L": return 2;
		case "C": return zn();
		case "A": return function(t) {
			return "A" !== t.type || Math.abs(t.rx - t.ry) <= 1e-9 * Math.max(Math.abs(t.rx), 1) && 0 === t.rotation;
		}(t) ? jn() : 7;
	}
}
function xs(t, n, e) {
	return {
		...t,
		x: n,
		y: e
	};
}
function ps(t, n) {
	const e = Math.hypot(t, n);
	return e < 1e-12 || !Number.isFinite(e) ? null : {
		x: t / e,
		y: n / e
	};
}
function Ms(t) {
	const n = -t.x0 + 3 * t.x1 - 3 * t.x2 + t.x3, e = -t.y0 + 3 * t.y1 - 3 * t.y2 + t.y3, r = 3 * (t.x0 - 2 * t.x1 + t.x2), o = 3 * (t.y0 - 2 * t.y1 + t.y2), s = 3 * (t.x1 - t.x0), i = 3 * (t.y1 - t.y0), c = n * o - e * r;
	if (Math.abs(c) < 1e-12) return !1;
	const a = (n * -i - e * -s) / c, l = a * a - 4 * (a * a - (-s * o + i * r) / c);
	if (l <= 0) return !1;
	const h = Math.sqrt(l), u = .5 * (a - h), f = .5 * (a + h), y = 1e-9;
	return u > y && u < .999999999 && f > y && f < .999999999 && Math.abs(f - u) > y;
}
function gs(t, n, e) {
	const r = Math.sin(t.phi), o = Math.cos(t.phi), s = t.rx * Math.cos(n), i = t.ry * Math.sin(n);
	return e.x = t.cx + o * s - r * i, e.y = t.cy + r * s + o * i, e;
}
function ds(t) {
	return Math.abs(Math.max(Math.abs(t.rx), Math.abs(t.ry)) * t.delta);
}
function ms(t, n, e, r, o, s, i, c, a) {
	let l = Math.abs(e), h = Math.abs(r);
	const u = .5 * (t + c), f = .5 * (n + a), y = .5 * (t - c), x = .5 * (n - a);
	if (y * y + x * x <= 1e-24 || l <= 1e-12 || h <= 1e-12) return {
		cx: t - l,
		cy: n,
		rx: l,
		ry: h,
		phi: o,
		theta1: 0,
		delta: 0
	};
	const p = Math.sin(o), M = Math.cos(o), g = M * y + p * x, d = -p * y + M * x, m = g * g / (l * l) + d * d / (h * h);
	if (m > 1) {
		const t = Math.sqrt(m);
		l *= t, h *= t;
	}
	const b = Math.max(l * l * h * h - l * l * d * d - h * h * g * g, 0), w = l * l * d * d + h * h * g * g;
	let A = w > 0 ? Math.sqrt(b / w) : 0;
	s === i && (A = -A);
	const k = A * l * d / h, F = -A * h * g / l, v = M * k - p * F + u, N = p * k + M * F + f, I = Math.atan2((d - F) / h, (g - k) / l);
	let P = Math.atan2((-d - F) / h, (-g - k) / l) - I;
	return !i && P > 0 ? P -= 2 * Math.PI : i && P < 0 && (P += 2 * Math.PI), {
		cx: v,
		cy: N,
		rx: l,
		ry: h,
		phi: o,
		theta1: I,
		delta: P
	};
}
function bs(t, n, e) {
	return ms(t, n, e.rx, e.ry, function(t) {
		return t.rotation * ls;
	}(e), e.largeArc, e.sweep, e.x, e.y);
}
function ws(t, n, e) {
	const r = Math.ceil(t);
	return Number.isNaN(r) ? n : Math.min(Math.max(r, n), e);
}
function As(t, n, e, r) {
	const o = [], s = [];
	let i = 1, c = t, a = n;
	for (const f of e) {
		let t, n = null;
		"L" === f.type ? t = ws(Math.hypot(f.x - c, f.y - a) / r, 1, 4096) : "C" === f.type ? t = ws((Math.hypot(f.x1 - c, f.y1 - a) + Math.hypot(f.x2 - f.x1, f.y2 - f.y1) + Math.hypot(f.x - f.x2, f.y - f.y2)) / r, 4, 4096) : (n = bs(c, a, f), t = ws(ds(n) / r, 2, 4096)), o.push(n), s.push(t), i += t, c = f.x, a = f.y;
	}
	const l = new Float64Array(2 * i);
	l[0] = t, l[1] = n;
	let h = 2;
	c = t, a = n;
	const u = {
		x: 0,
		y: 0
	};
	for (let f = 0; f < e.length; f++) {
		const t = e[f], n = s[f];
		if ("L" === t.type) for (let e = 1; e <= n; e++) {
			const r = e / n;
			l[h++] = c + (t.x - c) * r, l[h++] = a + (t.y - a) * r;
		}
		else if ("C" === t.type) for (let e = 1; e <= n; e++) {
			const r = e / n, o = 1 - r, s = o * o * o, i = 3 * o * o * r, u = 3 * o * r * r, f = r * r * r;
			l[h++] = s * c + i * t.x1 + u * t.x2 + f * t.x, l[h++] = s * a + i * t.y1 + u * t.y2 + f * t.y;
		}
		else {
			const e = o[f];
			for (let t = 1; t < n; t++) gs(e, e.theta1 + e.delta * t / n, u), l[h++] = u.x, l[h++] = u.y;
			l[h++] = t.x, l[h++] = t.y;
		}
		c = t.x, a = t.y;
	}
	return l;
}
function ks(t, n, e, r, o, s) {
	const i = o - e, c = s - r, a = i * i + c * c;
	if (a <= 1e-24) return Math.hypot(t - e, n - r);
	const l = Math.min(Math.max(((t - e) * i + (n - r) * c) / a, 0), 1);
	return Math.hypot(t - (e + i * l), n - (r + c * l));
}
function Fs(t, n, e, r, o) {
	if (0 === o.length) return 1 / 0;
	const s = function(t, n) {
		const e = t.length >> 1, r = n.length >> 1, o = new Float64Array(e);
		if (0 === r) return o.fill(1 / 0);
		let s = 0;
		const i = Math.min(Math.max(r >> 3, 16), 512);
		for (let c = 0; c < e; c++) {
			const a = t[2 * c], l = t[2 * c + 1], h = e > 1 ? Math.floor(c * (r - 1) / (e - 1)) : 0, u = Math.max(h, Math.max(s - (i >> 1), 0)), f = Math.max(u - i, 0), y = Math.min(u + i, r - 1);
			let x = 1 / 0, p = s;
			for (let t = f; t <= y; t++) {
				const e = a - n[2 * t], r = l - n[2 * t + 1], o = e * e + r * r;
				o < x && (x = o, p = t);
			}
			s = p;
			let M = Math.sqrt(x);
			const g = n[2 * p], d = n[2 * p + 1];
			p > 0 && (M = Yn(M, ks(a, l, n[2 * p - 2], n[2 * p - 1], g, d))), p + 1 < r && (M = Yn(M, ks(a, l, g, d, n[2 * p + 2], n[2 * p + 3]))), o[c] = M;
		}
		return o;
	}(t, As(e, r, o, .25));
	let i = 0;
	for (let c = 0; c < s.length; c++) {
		const t = Vn(c < n.length ? n[c] : .5, .001);
		i += s[c] / t * (s[c] / t);
	}
	return i;
}
const vs = 10;
var Ns = class {
	m;
	win = new Float64Array(vs);
	mat = /* @__PURE__ */ new Float64Array(9);
	rhs = /* @__PURE__ */ new Float64Array(3);
	sol = /* @__PURE__ */ new Float64Array(3);
	constructor(t, n) {
		const e = t.length >> 1;
		this.m = new Float64Array(vs * (e + 1));
		const r = new Float64Array(vs);
		for (let o = 0; o < e; o++) {
			const e = Vn(o < n.length ? n[o] : .5, .001), s = 1 / (e * e), i = t[2 * o], c = t[2 * o + 1], a = i * i + c * c;
			r[0] += s, r[1] += s * i, r[2] += s * c, r[3] += s * a, r[4] += s * i * i, r[5] += s * i * c, r[6] += s * c * c, r[7] += s * i * a, r[8] += s * c * a, r[9] += s * a * a, this.m.set(r, vs * (o + 1));
		}
	}
	window(t, n) {
		const e = vs * t, r = vs * (n + 1);
		for (let o = 0; o < vs; o++) this.win[o] = this.m[r + o] - this.m[e + o];
		return this.win;
	}
	scale(t, n) {
		const e = this.window(t, n), r = e[0];
		if (r <= 0) return 1;
		const o = Math.max(e[4] - e[1] * e[1] / r, 0) / r, s = Math.max(e[6] - e[2] * e[2] / r, 0) / r;
		return Math.max(Math.sqrt(o + s), 1);
	}
	residualAbout(t, n, e, r, o) {
		if (o <= 1e-12) return 1 / 0;
		const s = this.window(t, n), i = -2 * e, c = -2 * r, a = e * e + r * r - o * o;
		return Math.max(Is(s, i, c, a), 0) / (4 * o * o);
	}
	fit(t, n) {
		const e = this.window(t, n);
		if (e[0] <= 0) return null;
		const r = this.mat;
		if (r[0] = e[4], r[1] = e[5], r[2] = e[1], r[3] = e[5], r[4] = e[6], r[5] = e[2], r[6] = e[1], r[7] = e[2], r[8] = e[0], this.rhs[0] = -e[7], this.rhs[1] = -e[8], this.rhs[2] = -e[3], !Gn(r, this.rhs, this.sol)) return null;
		const o = this.sol[0], s = this.sol[1], i = this.sol[2], c = .25 * (o * o + s * s) - i;
		if (!(Number.isFinite(c) && c > 1e-12)) return null;
		const a = Is(e, o, s, i);
		return {
			cx: -.5 * o,
			cy: -.5 * s,
			r: Math.sqrt(c),
			chi2: Math.max(a, 0) / (4 * c)
		};
	}
};
function Is(t, n, e, r) {
	return t[9] + n * n * t[4] + e * e * t[6] + r * r * t[0] + 2 * (n * t[7] + e * t[8] + r * t[3] + n * e * t[5] + n * r * t[1] + e * r * t[2]);
}
function Ps(t, n, e, r, o) {
	const s = e - t, i = r - n;
	o[0] = s * (n + .5 * i), o[1] = s * (t * n + .5 * (t * i + n * s) + s * i / 3), o[2] = s * (n * n + n * i + i * i / 3);
}
function qs(t) {
	const n = t * (1 / Math.PI) * .5;
	return 2 * Math.PI * (n - ((e = n) < 0 ? -Math.round(-e) : Math.round(e)));
	var e;
}
function Ls(t, n, e, r, o, s, i) {
	const c = e - t, a = r - n, l = c * c + a * a;
	if (l < 1e-18 || !Number.isFinite(l)) return null;
	const h = Math.atan2(a, c), u = qs(Math.atan2(o.y, o.x) - h), f = qs(h - Math.atan2(s.y, s.x));
	let y = i[0], x = i[1], p = i[2];
	y -= c * (n + .5 * a);
	const M = a / 3;
	x -= c * (t * n + .5 * (t * a + n * c) + M * c), p -= c * (n * n + n * a + M * a), x -= t * y, p = .5 * p - n * y;
	const g = 1 / l;
	return {
		th0: u,
		th1: f,
		area: y * g,
		mx: (c * x + a * p) * g * g,
		chord: Math.sqrt(l)
	};
}
function Cs(t, n) {
	t.length < 4 && t.push(n);
}
function $s(t, n, e, r) {
	const o = Math.sin(t), s = Math.cos(t), i = Math.sin(n), c = Math.cos(n), a = -9 * s * (((2 * i * c * s + o * (2 * c * c - 1)) * s - 2 * i * c) * s - c * c * o), l = 12 * ((((c * (30 * e * c - i) - 15 * e) * s + 2 * o - c * o * (c + 30 * e * i)) * s + c * (i - 15 * e * c)) * s - o * c * c), h = 12 * ((((70 * r + 15 * e) * i * i + c * (9 * i - 70 * c * r - 5 * c * e)) * s - 5 * o * i * (3 * i - 4 * c * (7 * r + e))) * s - c * (9 * i - 70 * c * r - 5 * c * e)), u = 16 * (((12 * o - 5 * s * (42 * r - 17 * e)) * i - 70 * c * (3 * r - e) * o - 75 * s * c * e * e) * i - 75 * c * c * e * e * o), f = 80 * i * (42 * i * r - 25 * e * (i - c * e)), y = [], x = 1e-12;
	if (Math.abs(a) > x) {
		const t = function(t, n, e, r, o) {
			const s = 9 * t * t - 24 * n, i = s >= 0 ? -2 * n / (3 * t + Rn(Math.sqrt(s), t)) : -.25 * t, c = t + 4 * i, a = n + 3 * i * (t + 2 * i), l = e + i * (2 * n + i * (3 * t + 4 * i)), h = r + i * (e + i * (n + i * (t + i)));
			let u, f;
			const y = 349e100;
			if (o) {
				const t = c / y, n = a / y, e = l / y, r = h / y;
				u = t * e - 4 / y * r - 1 / 3 * (n * n), f = 1 / 3 * (t * e + 8 / y * r - 2 / 9 * (n * n)) * n - e * (e / y) - t * t * r;
			} else u = c * l - 4 * h - 1 / 3 * (a * a), f = 1 / 3 * (c * l + 8 * h - 2 / 9 * (a * a)) * a - l * l - c * c * h;
			if (!Number.isFinite(u) || !Number.isFinite(f)) return null;
			let x = function(t, n) {
				const e = -1 / 3 * t, r = .5 * n;
				let o, s;
				if (o = Math.abs(e) < 1e102 && Math.abs(r) < 1e154 ? null : Math.abs(e) < Math.abs(r) ? 1 - e * (e / r * (e / r)) : Zn(e) * (r / e * (r / e) / e - 1), null !== o && 0 === r) s = t > 0 ? 0 : Math.sqrt(-t);
				else if (null !== o ? o < 0 : r * r < e * e * e) {
					const t = null !== o ? r / e / Math.sqrt(e) : r / Math.sqrt(e * e * e);
					s = -2 * Math.sqrt(e) * Rn(Math.cos(Math.acos(Math.abs(t)) * (1 / 3)), t);
				} else {
					let t;
					t = null !== o ? Math.abs(e) < Math.abs(r) ? -r * (1 + Math.sqrt(o)) : -r - Rn(Math.sqrt(Math.abs(e)) * e * Math.sqrt(o), r) : -r - Rn(Math.sqrt(r * r - e * e * e), r);
					const n = Math.cbrt(t);
					s = n + (0 === n ? 0 : e / n);
				}
				let i = s, c = (i * i + t) * i + n;
				if (Math.abs(c) < 222045e-21 * Vn(Vn(i * i * i, t * i), n)) return i;
				for (let a = 0; a < 8; a++) {
					const e = 3 * i * i + t;
					if (0 === e) break;
					const r = i - c / e, o = (r * r + t) * r + n;
					if (0 === o) return r;
					if (Math.abs(o) >= Math.abs(c)) break;
					i = r, c = o;
				}
				return i;
			}(u, f);
			o && (x *= y);
			const p = .5 * t, M = 1 / 6 * n + .5 * x, g = e - t * M, d = 2 / 3 * n - x - p * p, m = 2 * (r - M * M) / g, b = [
				[d, .5 * g / d],
				[.5 * g / m, m],
				[d, m]
			];
			let w, A, k, F, v = 0, N = 0, I = 0;
			for (let q = 0; q < 3; q++) {
				const [t, o] = b[q], s = Dn(t + p * p + 2 * M, n) + Dn(2 * (t * o + p * M), e) + Dn(t * o * o + M * M, r);
				(0 === q || s < I) && (v = t, N = o, I = s);
			}
			if (v < 0) {
				const o = Math.sqrt(-v);
				if (w = p + o, A = M + o * N, k = p - o, F = M - o * N, Math.abs(F) < Math.abs(A) ? F = r / A : Math.abs(F) > Math.abs(A) && (A = r / F), Math.abs(w) !== Math.abs(k)) {
					let r;
					r = Math.abs(w) < Math.abs(k) ? [
						[t - k, k],
						[(e - A * k) / F, k],
						[(n - F - A) / k, k]
					] : [
						[w, t - w],
						[w, (e - w * F) / A],
						[w, (n - F - A) / w]
					];
					let o = 0;
					for (let s = 0; s < 3; s++) {
						const [i, c] = r[s];
						if (Number.isFinite(i) && Number.isFinite(c)) {
							const r = Qn(i, A, c, F, t, n, e);
							(0 === s || r < o) && (w = i, k = c, o = r);
						}
					}
				}
			} else {
				if (0 !== v) return null;
				{
					const t = r - M * M;
					w = p, A = M + Math.sqrt(-t), k = p, F = M - Math.sqrt(-t), Math.abs(A) > Math.abs(F) ? F = r / A : Math.abs(F) > Math.abs(A) && (A = r / F);
				}
			}
			let P = _n(w, A, k, F, t, n, e, r);
			for (let q = 0; q < 8 && 0 !== P; q++) {
				const o = A * F - r, s = A * k + w * F - e, i = A + w * k + F - n, c = w + k - t, a = w - k, l = A * A - A * (k * a + 2 * F) + F * (w * a + F);
				if (0 === l) break;
				const h = 1 / l, u = F - A, f = A * k - w * F, y = w - h * (a * o + u * s + f * i - (A * u + w * f) * c), x = A - h * ((w * a + u) * o - A * a * s - A * u * i - A * f * c), p = k - h * (-a * o - u * s - f * i + (k * f + F * u) * c), M = F - h * (-(k * a + u) * o + F * a * s + F * u * i + F * f * c), g = _n(y, x, p, M, t, n, e, r);
				if (!(g < P)) break;
				w = y, A = x, k = p, F = M, P = g;
			}
			return [
				w,
				A,
				k,
				F
			];
		}(l / a, h / a, u / a, f / a, !1);
		if (t) for (let n = 0; n < 2; n++) {
			const e = t[2 * n], r = Bn(t[2 * n + 1], e, 1);
			if (0 === r.length) Cs(y, -.5 * e);
			else for (const t of r) Cs(y, t);
		}
	} else if (Math.abs(l) > x) for (const g of function(t, n, e, r) {
		const o = 1 / r, s = 1 / 3, i = e * (s * o), c = n * (s * o), a = t * o;
		if (!(Number.isFinite(a) && Number.isFinite(c) && Number.isFinite(i))) return Bn(t, n, e);
		const l = -i * i + c, h = -c * i + a, u = 4 * l * (i * a - c * c) - h * h, f = -2 * i * l + h;
		if (u < 0) {
			const t = Math.sqrt(-.25 * u), n = -.5 * f;
			return [Math.cbrt(n + t) + Math.cbrt(n - t) - i];
		}
		if (0 === u) {
			const t = Rn(Math.sqrt(-l), f);
			return [t - i, -2 * t - i];
		}
		const y = Math.atan2(Math.sqrt(u), -f) * s, x = Math.sin(y), p = Math.cos(y), M = x * Math.sqrt(3), g = .5 * (-p + M), d = .5 * (-p - M), m = 2 * Math.sqrt(-l);
		return [
			m * p - i,
			m * g - i,
			m * d - i
		];
	}(f, u, h, l)) Cs(y, g);
	else {
		if (!(Math.abs(h) > x || Math.abs(u) > x || Math.abs(f) > x)) return [1 / 3, 1 / 3];
		for (const t of Bn(f, u, h)) Cs(y, t);
	}
	const p = [], M = o * c + i * s;
	for (const g of y) {
		let t, n;
		if (g > 0) {
			const r = (g * o - e * (10 / 3)) / (.5 * g * M - i);
			r > 0 ? (t = g, n = r) : (t = i / M, n = 0);
		} else t = 0, n = o / M;
		t >= 0 && n >= 0 && Number.isFinite(t) && Number.isFinite(n) && p.length < 8 && p.push(t, n);
	}
	return p;
}
function Ss(t, n, e, r, o, s, i, c, a) {
	return {
		x0: t,
		y0: n,
		x1: t + o.x * c * i,
		y1: n + o.y * c * i,
		x2: e - s.x * a * i,
		y2: r - s.y * a * i,
		x3: e,
		y3: r
	};
}
function Es(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function Us(t, n, e, r) {
	let o = Es(r);
	for (let f = 0; f < 3; f++) {
		const r = 1 - o, s = r * r * r, i = 3 * r * r * o, c = 3 * r * o * o, a = o * o * o, l = s * t.x0 + i * t.x1 + c * t.x2 + a * t.x3 - n, h = s * t.y0 + i * t.y1 + c * t.y2 + a * t.y3 - e, u = 3 * r * r, f = 6 * r * o, y = 3 * o * o, x = u * (t.x1 - t.x0) + f * (t.x2 - t.x1) + y * (t.x3 - t.x2), p = u * (t.y1 - t.y0) + f * (t.y2 - t.y1) + y * (t.y3 - t.y2), M = x * x + p * p;
		if (M < 1e-18) break;
		const g = Es(o - (l * x + h * p) / M);
		if (g === o) break;
		o = g;
	}
	const s = 1 - o, i = s * s * s, c = 3 * s * s * o, a = 3 * s * o * o, l = o * o * o, h = i * t.x0 + c * t.x1 + a * t.x2 + l * t.x3 - n, u = i * t.y0 + c * t.y1 + a * t.y2 + l * t.y3 - e;
	return h * h + u * u;
}
function Os(t, n, e, r, o) {
	return Math.min(t + 1 + Math.floor((e + .5) * r / o), n - 1);
}
var zs = class t {
	px = /* @__PURE__ */ new Float64Array(32);
	py = /* @__PURE__ */ new Float64Array(32);
	t = /* @__PURE__ */ new Float64Array(32);
	s2 = /* @__PURE__ */ new Float64Array(32);
	len = 0;
	weight = 1;
	static of(n, e, r, o, s) {
		const i = new t();
		return i.fill(n, e, r, o, s) ? i : null;
	}
	fill(t, n, e, r, o) {
		const s = Math.max(o - r - 1, 0);
		if (0 === s) return !1;
		const i = Math.min(s, 32), c = Math.max(e[o] - e[r], 1e-12);
		this.len = i, this.weight = s / i;
		for (let a = 0; a < i; a++) {
			const l = Os(r, o, a, s, i), h = Vn(n[l], 1e-6);
			this.px[a] = t[2 * l], this.py[a] = t[2 * l + 1], this.t[a] = (e[l] - e[r]) / c, this.s2[a] = h * h;
		}
		return !0;
	}
	chi2(t, n) {
		let e = 0;
		for (let r = 0; r < this.len; r++) if (e += this.weight * Us(t, this.px[r], this.py[r], this.t[r]) / this.s2[r], e >= n) return e;
		return e;
	}
};
function Ts(t, n, e, r, o, s, i) {
	const c = Math.max(o - r - 1, 0);
	if (0 === c) return 0;
	const a = i ? Math.min(c, 32) : c, l = c / a, h = Math.max(e[o] - e[r], 1e-12);
	let u = 0;
	for (let f = 0; f < a; f++) {
		const i = Os(r, o, f, c, a), y = Vn(n[i], 1e-6);
		u += l * Us(s, t[2 * i], t[2 * i + 1], (e[i] - e[r]) / h) / (y * y);
	}
	return u;
}
const js = new zs();
function Xs(t, n, e, r, o, s, i, c, a) {
	const l = t[2 * r], h = t[2 * r + 1], u = t[2 * o], f = t[2 * o + 1], y = Ls(l, h, u, f, s, i, c);
	if (!y) return null;
	const x = a && js.fill(t, n, e, r, o) ? js : null, p = $s(y.th0, y.th1, y.area, y.mx);
	let M = null;
	for (let g = 0; g < p.length; g += 2) {
		const c = p[g], d = p[g + 1];
		if (c > 1 || d > 1) continue;
		const m = Ss(l, h, u, f, s, i, y.chord, c, d), b = M ? M.chi2 : 1 / 0, w = x ? x.chi2(m, b) : Ts(t, n, e, r, o, m, a);
		(null === M || w < M.chi2) && (M = {
			chi2: w,
			d0: c,
			d1: d
		});
	}
	return M;
}
function Rs(t) {
	return t < .001 ? .001 : t > 1.5 ? 1.5 : t;
}
function Zs(t, n, e, r, o, s, i, c, a) {
	const l = t[2 * r], h = t[2 * r + 1], u = t[2 * o], f = t[2 * o + 1], y = Math.hypot(l - u, h - f), x = (c, a) => Ts(t, n, e, r, o, Ss(l, h, u, f, s, i, y, c, a), !1);
	let p = Rs(c), M = Rs(a), g = x(p, M);
	const d = .001;
	for (let m = 0; m < 12; m++) {
		const t = x(p + d, M), n = x(p - d, M), e = x(p, M + d), r = x(p, M - d), o = (t - n) / (2 * d), s = (e - r) / (2 * d), i = (t - 2 * g + n) / (d * d), c = (e - 2 * g + r) / (d * d), a = (x(p + d, M + d) - t - e + g) / (d * d), l = i * c - a * a;
		let h, u;
		if (i > 0 && l > 0) h = -(c * o - a * s) / l, u = -(i * s - a * o) / l;
		else {
			const t = Vn(Math.hypot(o, s), 1e-12);
			h = -.05 * o / t, u = -.05 * s / t;
		}
		let f = 1, y = !1;
		for (; f > 1e-4;) {
			const t = Rs(p + f * h), n = Rs(M + f * u), e = x(t, n);
			if (e < g) {
				const r = g - e;
				p = t, M = n, g = e, y = r > 1e-9 * Vn(g, 1);
				break;
			}
			f *= .5;
		}
		if (!y) break;
	}
	return {
		chi2: g,
		d0: p,
		d1: M
	};
}
const Vs = Math.PI / 180;
function Ys(t, n, e, r, o, s, i, c) {
	let a = 0;
	return (e > 0 || c) && (a += ue(t.outgoing[e], o, i)), (r + 1 < n || c) && (a += ue(s, t.incoming[r], i)), a;
}
const Bs = {
	x: 0,
	y: 0
};
function Ds(t, n) {
	let e = t - n;
	return e > Math.PI ? e -= 2 * Math.PI : e < -Math.PI && (e += 2 * Math.PI), e;
}
var Qs = class {
	n;
	offset = 0;
	fits = /* @__PURE__ */ new Map();
	constructor(t) {
		this.n = t;
	}
	fit(t, n, e, r) {
		const o = (this.offset + e) % this.n * (this.n + 1) + (r - e);
		let s = this.fits.get(o);
		return void 0 === s && (s = qe(t, n), this.fits.set(o, s)), s;
	}
};
var _s = class t {
	base = 0;
	best = 1 / 0;
	cubicFloor = 0;
	gate = 0;
	overFloor = -1 / 0;
	trigger = 1 / 0;
	static NONE = Object.freeze(new t());
	reset(t, n, e, r, o) {
		if (this.base = t, this.best = n, this.cubicFloor = e, this.gate = r, this.overFloor = o, n === 1 / 0) this.trigger = 1 / 0;
		else {
			const s = Vn(Vn(2 * (n - t - e), r), 2 * o);
			this.trigger = s - 1e-9 * Math.abs(s);
		}
		return this;
	}
	overOnly(t) {
		return this.base = 0, this.best = -1 / 0, this.cubicFloor = 0, this.gate = 0, this.overFloor = t, this.trigger = 2 * t, this;
	}
	dead(t) {
		return this.base + .5 * t + this.cubicFloor >= this.best;
	}
	drops(t) {
		return this.dead(t) && t >= this.gate && .5 * t > this.overFloor;
	}
};
const Ws = Object.freeze({ kind: "untried" }), Gs = Object.freeze({
	kind: "dead",
	over: !0
}), Ks = Object.freeze({
	kind: "dead",
	over: !1
}), Hs = new zs();
let Js = 0;
function ti(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function ni(t, n, e, r) {
	const { x0: o, y0: s, x1: i, y1: c, x2: a, y2: l, x3: h, y3: u } = n, f = i - o, y = c - s, x = a - i, p = l - c, M = h - a, g = u - l, { px: d, py: m, t: b, s2: w, weight: A } = t;
	let k = 0;
	for (let F = 0; F < t.len; F++) {
		const t = d[F], n = m[F];
		let v = ti(b[F]);
		for (let e = 0; e < 3; e++) {
			const e = 1 - v, r = e * e * e, d = 3 * e * e * v, m = 3 * e * v * v, b = v * v * v, w = r * o + d * i + m * a + b * h - t, A = r * s + d * c + m * l + b * u - n, k = 3 * e * e, F = 6 * e * v, N = 3 * v * v, I = k * f + F * x + N * M, P = k * y + F * p + N * g, q = I * I + P * P;
			if (q < 1e-18) break;
			const L = ti(v - (w * I + A * P) / q);
			if (L === v) break;
			v = L;
		}
		const N = 1 - v, I = N * N * N, P = 3 * N * N * v, q = 3 * N * v * v, L = v * v * v, C = I * o + P * i + q * a + L * h - t, $ = I * s + P * c + q * l + L * u - n;
		if (k += A * (C * C + $ * $) / w[F], k >= e) return Js = 1, k;
		if (k >= r.trigger && r.drops(k)) return Js = 2, k;
	}
	return Js = 0, k;
}
function ei(t, n, e, r, o, s, i, c) {
	const a = Xs(t, n, e, r, o, s, i, c, !0);
	return a ? {
		kind: "exact",
		chi2: a.chi2,
		d0: a.d0,
		d1: a.d1
	} : Ws;
}
function ri(t, n, e, r, o, s, i, c, a) {
	const l = t[2 * r], h = t[2 * r + 1], u = t[2 * o], f = t[2 * o + 1], y = Ls(l, h, u, f, s, i, c);
	if (!y) return Ws;
	if (!Hs.fill(t, n, e, r, o)) return ei(t, n, e, r, o, s, i, c);
	const x = Hs;
	let p = !1, M = 1 / 0, g = 0, d = 0, m = !1, b = !1, w = !0;
	const A = $s(y.th0, y.th1, y.area, y.mx);
	for (let k = 0; k < A.length; k += 2) {
		const F = A[k], v = A[k + 1];
		if (F > 1 || v > 1) continue;
		m = !0;
		const N = ni(x, Ss(l, h, u, f, s, i, y.chord, F, v), p ? M : 1 / 0, a);
		if (0 === Js) {
			if (!Number.isFinite(N)) return ei(t, n, e, r, o, s, i, c);
			if ((!p || N < M) && (p = !0, M = N, g = F, d = v), .5 * N <= a.overFloor && (w = !1, a.best === -1 / 0)) return Ks;
		} else 2 === Js && (b = !0);
	}
	return m ? !p || b && a.dead(M) ? p && M < a.gate ? ei(t, n, e, r, o, s, i, c) : w ? Gs : Ks : {
		kind: "exact",
		chi2: M,
		d0: g,
		d1: d
	} : Ws;
}
var oi = class t {
	maxSpan;
	forced;
	constructor(t, n) {
		this.maxSpan = t, this.forced = n;
	}
	static FREE = new t(1 / 0, []);
	static capped(n) {
		return new t(n, []);
	}
	static pinned(n, e, r, o) {
		const s = [...new Set(o.filter((t) => t >= 0 && t < n))].toSorted((t, n) => t - n), i = e ? s : s.filter((t) => t > 0 && t + 1 < n);
		return new t(r >= n ? 1 / 0 : Math.max(r, 1), i);
	}
	get free() {
		return this.maxSpan === 1 / 0 && 0 === this.forced.length;
	}
	allows(t, n) {
		if (n - t > this.maxSpan) return !1;
		for (const e of this.forced) if (e > t && e < n) return !1;
		return !0;
	}
	wallAfter(t) {
		for (const n of this.forced) if (n > t) return n;
		return 1 / 0;
	}
};
const si = Math.PI / 6;
function ii(t) {
	return t.points.length >> 1;
}
var ci = class {
	w;
	x;
	y;
	xx;
	yy;
	xy;
	ga;
	gx;
	gy;
	s;
	constructor(t, n) {
		const e = t.length >> 1;
		this.w = new Float64Array(e + 1), this.x = new Float64Array(e + 1), this.y = new Float64Array(e + 1), this.xx = new Float64Array(e + 1), this.yy = new Float64Array(e + 1), this.xy = new Float64Array(e + 1), this.ga = new Float64Array(e), this.gx = new Float64Array(e), this.gy = new Float64Array(e), this.s = function(t) {
			const n = t.length >> 1, e = new Float64Array(n);
			let r = 0;
			for (let o = 1; o < n; o++) r += Math.hypot(t[2 * o] - t[2 * o - 2], t[2 * o + 1] - t[2 * o - 1]), e[o] = r;
			return e;
		}(t);
		const r = /* @__PURE__ */ new Float64Array(3);
		for (let o = 0; o < e; o++) {
			const s = t[2 * o], i = t[2 * o + 1], c = 1 / (n[o] * n[o]);
			this.w[o + 1] = this.w[o] + c, this.x[o + 1] = this.x[o] + s * c, this.y[o + 1] = this.y[o] + i * c, this.xx[o + 1] = this.xx[o] + s * s * c, this.yy[o + 1] = this.yy[o] + i * i * c, this.xy[o + 1] = this.xy[o] + s * i * c, o + 1 < e && (Ps(s, i, t[2 * o + 2], t[2 * o + 3], r), this.ga[o + 1] = this.ga[o] + r[0], this.gx[o + 1] = this.gx[o] + r[1], this.gy[o + 1] = this.gy[o] + r[2]);
		}
	}
	chi2Line(t, n) {
		if (n <= t) return 0;
		const e = t, r = n + 1, o = this.w[r] - this.w[e];
		return o <= 0 ? 0 : function(t, n, e, r, o, s) {
			const i = r - n * n / t, c = o - e * e / t, a = s - n * e / t, l = i + c, h = i - c, u = Math.sqrt(Math.max(h * h + 4 * a * a, 0));
			return Math.max(.5 * (l - u), 0);
		}(o, this.x[r] - this.x[e], this.y[r] - this.y[e], this.xx[r] - this.xx[e], this.yy[r] - this.yy[e], this.xy[r] - this.xy[e]);
	}
	rawMoments(t, n, e) {
		return e[0] = this.ga[n] - this.ga[t], e[1] = this.gx[n] - this.gx[t], e[2] = this.gy[n] - this.gy[t], e;
	}
};
function ai(t, n) {
	if (!t.closed || n.length < 2) return !1;
	if (n[0] === n[n.length - 1]) return !0;
	const e = ii(t), r = t.points;
	return 0 === n[0] && n[n.length - 1] === e - 1 && Math.hypot(r[0] - r[2 * e - 2], r[1] - r[2 * e - 1]) < 1e-9;
}
function li(t, n, e) {
	let r = 0;
	for (const x of e) r += x;
	if (t.length < 2 || r <= 0) return null;
	let o = 0, s = 0;
	for (let x = 0; x < t.length; x++) o += t[x] * e[x];
	for (let x = 0; x < t.length; x++) s += n[x] * e[x];
	o /= r, s /= r;
	let i = 0, c = 0, a = 0;
	for (let x = 0; x < t.length; x++) {
		const r = t[x] - o, l = n[x] - s;
		i += e[x] * r * r, c += e[x] * l * l, a += e[x] * r * l;
	}
	const l = i - c, h = .5 * (i + c + Math.sqrt(Math.max(l * l + 4 * a * a, 0)));
	let u, f;
	Math.abs(a) > 1e-12 ? (u = h - c, f = a) : i >= c ? (u = 1, f = 0) : (u = 0, f = 1);
	const y = Math.hypot(u, f);
	return y <= 1e-12 ? null : {
		px: o,
		py: s,
		dx: u / y,
		dy: f / y
	};
}
function hi(t, n, e) {
	const r = ii(t), o = t.points, s = o[2 * n], i = o[2 * n + 1], c = o[2 * e], a = o[2 * e + 1], l = [], h = [], u = [];
	let f = n;
	for (; !(l.push(o[2 * f]), h.push(o[2 * f + 1]), u.push(1 / (t.sigma[f] * t.sigma[f])), f === e || (f = (f + 1) % r, l.length > r)););
	const y = [], x = [], p = [];
	for (let M = 0; M < l.length; M++) {
		const t = Math.hypot(l[M] - s, h[M] - i), n = Math.hypot(l[M] - c, h[M] - a);
		t > 1 && n > 1 && (y.push(l[M]), x.push(h[M]), p.push(u[M]));
	}
	return y.length >= 3 ? li(y, x, p) : li(l, h, u);
}
function ui(t) {
	let n = 0;
	for (const e of t.segments) n += ys(e);
	return 2 + n;
}
function fi(t, n, e) {
	const r = t.segments.map((t) => "C" === t.type ? {
		...t,
		x1: t.x1 + n,
		y1: t.y1 + e,
		x2: t.x2 + n,
		y2: t.y2 + e,
		x: t.x + n,
		y: t.y + e
	} : {
		...t,
		x: t.x + n,
		y: t.y + e
	});
	return {
		x0: t.x0 + n,
		y0: t.y0 + e,
		segments: r,
		closed: t.closed
	};
}
var yi = class {
	best;
	from;
	kind;
	arms;
	tans;
	arcs;
	constructor(t) {
		this.best = new Float64Array(t).fill(1 / 0), this.best[0] = 0, this.from = new Int32Array(t).fill(-1), this.kind = new Array(t).fill("line"), this.arms = new Float64Array(2 * t).fill(NaN), this.tans = new Array(t).fill(null), this.arcs = new Array(t).fill(null);
	}
	offer(t, n, e) {
		e.cost < this.best[n] && (this.best[n] = e.cost, this.from[n] = t, this.kind[n] = e.kind, this.arms[2 * n] = e.d0, this.arms[2 * n + 1] = e.d1, this.tans[n] = e.tans, this.arcs[n] = e.arc);
	}
}, xi = class {
	cost = 1 / 0;
	kind = "line";
	d0 = NaN;
	d1 = NaN;
	tans = null;
	arc = null;
}, pi = class {
	lastNo;
	pending = /* @__PURE__ */ new Int32Array(8);
	len = 0;
	constructor(t) {
		this.lastNo = t;
	}
	push(t, n, e, r) {
		if (0 === n ? (this.lastNo = t, this.len = 0) : 2 === n && (this.pending[this.len++] = t), t - this.lastNo < 8) return !1;
		for (; this.len > 0;) {
			this.len--;
			const t = this.pending[this.len];
			if (!e.cubicOver(r, t)) return this.lastNo = t, this.len = 0, !1;
		}
		return !0;
	}
};
const Mi = /* @__PURE__ */ new Float64Array(1), gi = new Uint32Array(Mi.buffer), di = 1 === new Uint8Array(new Uint16Array([1]).buffer)[0] ? 0 : 1, mi = 1 - di;
function bi(t) {
	return Number.isNaN(t) || t === 1 / 0 ? t : 0 === t ? Number.MIN_VALUE : (Mi[0] = t, t > 0 ? (gi[di] += 1, 0 === gi[di] && (gi[mi] += 1)) : (0 === gi[di] && (gi[mi] -= 1), gi[di] -= 1), Mi[0]);
}
var wi = class t {
	pts;
	sigma;
	tan;
	pre;
	cfg;
	joinsAtEnds;
	ellipses;
	bounds = !0;
	n;
	circles;
	cubicFloor;
	arcFloor;
	ellipseFloor;
	line = 0;
	circle = null;
	hasG1 = !1;
	g1Chi2 = 0;
	g1Wobble = 0;
	g1Turn = 0;
	g1D0 = 0;
	g1D1 = 0;
	over = 0;
	raw = /* @__PURE__ */ new Float64Array(3);
	abandon = new _s();
	abandonOver = new _s();
	winner = new xi();
	rival = new xi();
	constructor(t, n, e, r, o, s, i) {
		this.pts = t, this.sigma = n, this.tan = e, this.pre = r, this.cfg = o, this.joinsAtEnds = s, this.ellipses = i, this.n = t.length >> 1, this.circles = new Ns(t, n), this.cubicFloor = o.lambda * zn(), this.arcFloor = o.lambda * jn(), this.ellipseFloor = 7 * o.lambda;
	}
	static ellipseAsked(t, n, e) {
		return !(null !== e && e.chi2 <= 4 * (n - t)) && n >= t + 2;
	}
	cutoffFloor(t, n) {
		return 4 * this.cfg.lambda * 2 * (n - t);
	}
	terms(t, n, e, r) {
		const { pts: o, tan: s, cfg: i } = this, c = this.pre.chi2Line(t, n), a = function(t, n, e, r, o, s, i) {
			Bs.x = t[2 * r] - t[2 * e], Bs.y = t[2 * r + 1] - t[2 * e + 1];
			const c = Ys(n, t.length >> 1, e, r, Bs, Bs, s.lambda, i);
			return .5 * o + 2 * s.lambda + c;
		}(o, s, t, n, c, i, this.joinsAtEnds);
		let l = null;
		!(e + this.arcFloor >= r && e + a >= r) && n >= t + 2 && (a > this.arcFloor || c > n - t) && (l = function(t, n, e, r, o, s, i) {
			const c = function(t, n, e, r) {
				if (r < e + 2) return null;
				const o = n.fit(e, r);
				if (!o) return null;
				const { cx: s, cy: i, r: c } = o;
				if (!Number.isFinite(c) || c <= 1e-6) return null;
				if (c > 1e3 * Math.max(n.scale(e, r), 1)) return null;
				const a = Math.max(Math.floor((r - e) / 8), 1), l = t[2 * e], h = t[2 * e + 1], u = t[2 * r], f = t[2 * r + 1];
				let y = 0, x = l - s, p = h - i, M = e;
				for (; M < r;) {
					M = Math.min(M + a, r);
					const n = t[2 * M] - s, e = t[2 * M + 1] - i, o = x * e - p * n;
					if (Math.abs(o) > 1e-12) {
						if (0 === y) y = Zn(o);
						else if (Zn(o) !== y) return null;
					}
					x = n, p = e;
				}
				if (0 === y) return null;
				const g = l - s, d = h - i, m = u - s, b = f - i;
				let w = Math.atan2(g * b - d * m, g * m + d * b);
				if (0 === w || Zn(w) !== y) return null;
				if (w = Math.abs(w), !(w >= .001 && w <= Math.PI / 180 * 120)) return null;
				const A = y > 0, k = A ? ps(-d, g) : ps(d, -g), F = A ? ps(-b, m) : ps(b, -m);
				if (!k || !F) return null;
				const v = w > Math.PI, N = .5 * (Math.hypot(l - s, h - i) + Math.hypot(u - s, f - i)), I = function(t, n, e, r, o, s, i) {
					const c = ms(t, n, e, e, 0, r, o, s, i);
					return {
						cx: c.cx,
						cy: c.cy,
						r: c.rx,
						theta1: c.theta1,
						delta: c.delta
					};
				}(l, h, N, v, A, u, f);
				return {
					chi2: n.residualAbout(e, r, I.cx, I.cy, I.r),
					radius: N,
					largeArc: v,
					sweep: A,
					t0: k,
					t1: F
				};
			}(t, e, r, o);
			if (!c) return null;
			const a = Ys(n, t.length >> 1, r, o, c.t0, c.t1, s.lambda, i);
			return {
				cost: .5 * c.chi2 + s.lambda * jn() + a,
				chi2: c.chi2,
				radius: c.radius,
				largeArc: c.largeArc,
				sweep: c.sweep,
				t0: c.t0,
				t1: c.t1
			};
		}(o, s, this.circles, t, n, i, this.joinsAtEnds));
		const h = a + (l ? (u = c, 4 * l.chi2 < u ? (n - t) * Math.LN2 : 0) : 0);
		var u;
		const f = this.cutoffFloor(t, n), y = .5 * c > f;
		this.line = h, this.circle = l, this.hasG1 = !1, this.over = 0, n >= t + 2 && h > this.cubicFloor && this.cubicTerms(t, n, e, r, y, f);
	}
	cubicTerms(t, n, e, r, o, s) {
		const { pts: i, tan: c, cfg: a } = this;
		if (e + this.cubicFloor >= r) return void (o && (this.over = 2));
		const l = e + this.ellipseFloor >= r ? 0 : 2 * (this.ellipseFloor - this.cubicFloor + 1e-9 * (Math.abs(r) + a.lambda)), h = r === 1 / 0 ? _s.NONE : this.abandon.reset(e, r, this.cubicFloor, l, o ? s : -1 / 0), u = c.outgoing[t], f = c.incoming[n], y = this.pre.rawMoments(t, n, this.raw), x = ri(i, this.sigma, this.pre.s, t, n, u, f, y, h);
		if ("exact" === x.kind) {
			const e = i[2 * t], r = i[2 * t + 1], c = i[2 * n], l = i[2 * n + 1], h = Ss(e, r, c, l, u, f, Math.hypot(c - e, l - r), x.d0, x.d1);
			this.hasG1 = !0, this.g1Chi2 = x.chi2, this.g1Wobble = function(t, n) {
				let e = 0;
				(function(t) {
					const n = t.x1 - t.x0, e = t.y1 - t.y0, r = t.x2 - t.x1, o = t.y2 - t.y1, s = t.x3 - t.x2, i = n * o - e * r, c = r * (t.y3 - t.y2) - o * s, a = (t.x3 - t.x0) ** 2 + (t.y3 - t.y0) ** 2;
					return i * c < -1e-6 * Math.max(a, 1);
				})(t) && (e += 2 * n * 1);
				const r = function(t) {
					const n = (t.x3 - t.x0) ** 2 + (t.y3 - t.y0) ** 2;
					if (n <= 1e-12) return 0;
					const e = t.x2 - 2 * t.x1 + t.x0, r = t.y2 - 2 * t.y1 + t.y0, o = t.x3 - 2 * t.x2 + t.x1, s = t.y3 - 2 * t.y2 + t.y1;
					return 12 * (e * e + r * r + (e * o + r * s) + (o * o + s * s)) / n;
				}(t);
				return r > 2.5 && (e += Math.min(r - 2.5, 10) * n * 1 * .5), e;
			}(h, a.lambda), this.g1Turn = a.lambda * function(t, n) {
				const e = Xn();
				return Number.isFinite(e) && he(t, n) > e ? zn() : 0;
			}(u, f), this.g1D0 = x.d0, this.g1D1 = x.d1, o && .5 * x.chi2 > s && (this.over = 1);
		} else "dead" === x.kind && o && x.over && (this.over = 1);
	}
	cubicOver(t, n) {
		const e = this.cutoffFloor(t, n), r = ri(this.pts, this.sigma, this.pre.s, t, n, this.tan.outgoing[t], this.tan.incoming[n], this.pre.rawMoments(t, n, this.raw), this.abandonOver.overOnly(e));
		return "exact" === r.kind ? .5 * r.chi2 > e : "dead" === r.kind && r.over;
	}
	resolve(n, e, r, o, s) {
		const i = this.cubicFloor;
		let c = r + this.line, a = "line", l = NaN, h = NaN, u = null, f = null;
		if (this.hasG1) {
			const t = r + .5 * this.g1Chi2 + i + this.g1Wobble + this.g1Turn;
			t < c && (c = t, a = "cubic", l = this.g1D0, h = this.g1D1);
		}
		const y = this.circle;
		if (y) {
			const t = r + y.cost;
			t < c && (c = t, a = "arc", l = NaN, h = NaN, u = {
				t0: y.t0,
				t1: y.t1
			}, f = {
				rx: y.radius,
				ry: y.radius,
				phi: 0,
				largeArc: y.largeArc,
				sweep: y.sweep
			});
		}
		if (t.ellipseAsked(n, e, y) && c - r > this.ellipseFloor && !(this.bounds && r + this.ellipseFloor >= o)) {
			const t = function(t, n, e, r, o, s, i, c) {
				if (o < r + 24 || (o - r) % 16 != 0) return null;
				const a = t.subarray(2 * r, 2 * o + 2), l = n.subarray(r, o + 1), h = c ? c.fit(a, l, r, o) : qe(a, l);
				if (!h) return null;
				if (!Number.isFinite(h.rx) || !Number.isFinite(h.ry) || h.rx <= 1e-6 || h.ry <= 1e-6) return null;
				const u = Vn(h.rx, h.ry);
				if (u / Yn(h.rx, h.ry) > 12) return null;
				const f = a.length >> 1;
				let y = 0;
				for (let L = 0; L < f; L++) y = Vn(y, Math.hypot(a[2 * L] - a[0], a[2 * L + 1] - a[1]));
				if (u > 1e3 * Vn(y, 1)) return null;
				const x = function(t, n) {
					const e = Math.sin(n.angle), r = Math.cos(n.angle), o = (o) => {
						const s = t[2 * o] - n.cx, i = t[2 * o + 1] - n.cy, c = r * s + e * i, a = -e * s + r * i;
						return Math.atan2(a / n.ry, c / n.rx);
					}, s = t.length >> 1;
					let i = o(0);
					const c = Ds(o(1), i) > 0;
					let a = 0;
					for (let h = 1; h < s; h++) {
						const t = o(h), n = Ds(t, i);
						if (c && n < -.001 || !c && n > .001) return null;
						a += n, i = t;
					}
					const l = Math.abs(a);
					return l >= .001 && l <= 120 * Vs ? {
						turn: l,
						ccw: c
					} : null;
				}(a, h);
				if (!x) return null;
				const p = Math.sin(h.angle), M = Math.cos(h.angle), g = (t, n) => {
					const e = t - h.cx, r = n - h.cy, o = -p * e + M * r, s = (M * e + p * r) / h.rx, i = o / h.ry;
					return Math.sqrt(s * s + i * i);
				}, d = a[0], m = a[1], b = a[2 * f - 2], w = a[2 * f - 1], A = .5 * (g(d, m) + g(b, w));
				if (!(A >= .5 && A <= 2)) return null;
				const k = x.turn > Math.PI, F = ms(d, m, h.rx * A, h.ry * A, h.angle, k, x.ccw, b, w);
				if (Math.abs(F.delta) <= 1e-6) return null;
				const v = function(t, n, e, r, o, s, i) {
					const c = Math.sin(i), a = Math.cos(i), l = 1 / (o * o), h = 1 / (s * s), u = t.length >> 1;
					let f = 0;
					for (let y = 0; y < u; y++) {
						const o = t[2 * y] - e, s = t[2 * y + 1] - r, i = a * o + c * s, u = -c * o + a * s, x = i * i * l + u * u * h - 1, p = Math.sqrt(4 * i * i * l * l + 4 * u * u * h * h);
						if (p < 1e-12) return 1 / 0;
						const M = x / p, g = Vn(y < n.length ? n[y] : .5, .001);
						f += M / g * (M / g);
					}
					return f;
				}(a, l, F.cx, F.cy, F.rx, F.ry, F.phi);
				if (!Number.isFinite(v)) return null;
				const N = function(t) {
					const n = Math.sin(t.phi), e = Math.cos(t.phi), r = (r) => {
						const o = -t.rx * Math.sin(r), s = t.ry * Math.cos(r);
						let i = e * o - n * s, c = n * o + e * s;
						return t.delta > 0 || (i = -i, c = -c), ps(i, c);
					}, o = r(t.theta1);
					if (!o) return null;
					const s = r(t.theta1 + t.delta);
					return s ? [o, s] : null;
				}(F);
				if (!N) return null;
				const [I, P] = N, q = Ys(e, t.length >> 1, r, o, I, P, s.lambda, i);
				return {
					cost: .5 * v + 7 * s.lambda + q,
					rx: F.rx,
					ry: F.ry,
					phi: F.phi,
					largeArc: k,
					sweep: x.ccw,
					t0: I,
					t1: P
				};
			}(this.pts, this.sigma, this.tan, n, e, this.cfg, this.joinsAtEnds, this.ellipses);
			if (t) {
				const n = r + t.cost;
				n < c && (c = n, a = "arc", l = NaN, h = NaN, u = {
					t0: t.t0,
					t1: t.t1
				}, f = {
					rx: t.rx,
					ry: t.ry,
					phi: t.phi,
					largeArc: t.largeArc,
					sweep: t.sweep
				});
			}
		}
		s.cost = c, s.kind = a, s.d0 = l, s.d1 = h, s.tans = u, s.arc = f;
	}
	get lastOver() {
		return this.over;
	}
	score(t, n, e, r) {
		this.bounds ? this.terms(t.i, n, t.base, e) : this.terms(t.i, n, 0, 1 / 0);
		const o = this.over;
		this.resolve(t.i, n, t.base, e, r), t.stopped = t.cut.push(n, o, this, t.i);
	}
	fillTable(t) {
		if (!this.bounds) return this.fillPush(t);
		const n = this.n, e = new yi(n), r = [];
		for (let o = 1; o < n; o++) this.admit(e, r, o), Ai(r, (n) => t.allows(n.i, o)), 0 !== r.length && (this.endpoint(e, r, o), Ai(r, (t) => !t.stopped));
		return e;
	}
	admit(t, n, e) {
		const r = e - 1;
		if (!Number.isFinite(t.best[r])) return;
		const o = t.best[r] + (r > 0 ? fe(this.tan, r, this.cfg) : 0);
		n.push({
			i: r,
			base: o,
			cut: new pi(r),
			stopped: !1
		});
	}
	endpoint(t, n, e) {
		let r = n.length - 1;
		const o = t.from[e - 1];
		for (let a = 0; a < n.length; a++) if (n[a].i === o) {
			r = a;
			break;
		}
		let s = this.winner, i = this.rival;
		this.score(n[r], e, 1 / 0, s);
		let c = n[r].i;
		for (let a = 0; a < n.length; a++) {
			if (a === r) continue;
			const t = n[a], o = t.i < c ? bi(s.cost) : s.cost;
			if (this.score(t, e, o, i), i.cost < s.cost || i.cost === s.cost && t.i < c) {
				const n = s;
				s = i, i = n, c = t.i;
			}
		}
		t.offer(c, e, s);
	}
	fillPush(t) {
		const n = this.n, e = new yi(n), r = this.winner;
		for (let o = 0; o < n - 1; o++) {
			if (!Number.isFinite(e.best[o])) continue;
			const s = e.best[o] + (o > 0 ? fe(this.tan, o, this.cfg) : 0), i = new pi(o), c = Math.min(o + t.maxSpan + 1, t.wallAfter(o) + 1, n);
			for (let t = o + 1; t < c; t++) {
				this.terms(o, t, 0, 1 / 0);
				const n = this.over;
				if (this.resolve(o, t, s, 1 / 0, r), e.offer(o, t, r), i.push(t, n, this, o)) break;
			}
		}
		return e;
	}
};
function Ai(t, n) {
	let e = 0;
	for (let r = 0; r < t.length; r++) n(t[r]) && (t[e++] = t[r]);
	t.length = e;
}
function ki(t, n, e, r, o = {}) {
	const s = function(t, n, e) {
		if (2 * n.length !== t.length) throw new Error("sigma must be per-point");
		const r = new Float64Array(n.length);
		for (let o = 0; o < r.length; o++) r[o] = Vn(n[o], 1e-6);
		return {
			points: Float64Array.from(t),
			sigma: r,
			closed: e
		};
	}(t, n, e), i = ii(s);
	return function(t, n) {
		const e = ii(t), r = t.points, o = n.path.segments.slice();
		let s = n.path.x0, i = n.path.y0;
		if (o.length > 0) {
			const n = o.length - 1;
			t.closed ? e >= 3 && (o[n] = xs(o[n], s, i)) : (s = r[0], i = r[1], o[n] = xs(o[n], r[2 * e - 2], r[2 * e - 1]));
		}
		const c = {
			x0: s,
			y0: i,
			segments: o,
			closed: t.closed
		};
		let a = 0;
		if (o.length > 0) if (t.closed && n.vertices.length > 0 && 0 !== n.vertices[0]) {
			const c = n.vertices[0], l = new Float64Array(2 * e), h = new Float64Array(e);
			for (let n = 0; n < e; n++) {
				const o = (c + n) % e;
				l[2 * n] = r[2 * o], l[2 * n + 1] = r[2 * o + 1], h[n] = t.sigma[o];
			}
			a = Fs(l, h, s, i, o);
		} else a = Fs(r, t.sigma, s, i, o);
		return {
			x0: s,
			y0: i,
			segments: o,
			closed: t.closed,
			params: ui(c),
			chi2: a
		};
	}(s, vi(s, r, oi.pinned(i, e, o.maxSpan ?? 1 / 0, o.forced ?? []), o));
}
const Fi = /* @__PURE__ */ new WeakMap();
function vi(t, n, e, r) {
	const o = ii(t);
	if (o < 2) return {
		path: {
			x0: o > 0 ? t.points[0] : 0,
			y0: o > 0 ? t.points[1] : 0,
			segments: [],
			closed: t.closed
		},
		vertices: Array.from({ length: o }, (t, n) => n),
		kinds: [],
		cost: 0
	};
	const s = Math.max(r.maxPoints ?? 768, 16);
	if (e.free && o > s) return function(t, n, e, r, o) {
		const s = function(t, n, e) {
			const r = ii(t), o = t.points, s = t.sigma;
			let i = Math.max(Math.ceil(r / e), 1);
			const c = [], a = [];
			for (;;) {
				const o = new Uint8Array(r);
				for (const e of Ni(t, i, n)) e >= 0 && (o[e] = 1);
				t.closed || (o[0] = 1, o[r - 1] = 1), c.length = 0, a.length = 0;
				let s = 0;
				const l = (t) => {
					const n = t - s;
					if (n <= 0) return;
					const e = Math.ceil(n / i);
					for (let r = 0; r < e; r++) c.push(s + Math.floor(r * n / e)), a.push(s + Math.floor((r + 1) * n / e));
				};
				for (let t = 0; t < r; t++) 0 !== o[t] && (l(t), c.push(t), a.push(t + 1), s = t + 1);
				if (l(r), c.length <= e || i >= r) break;
				i++;
			}
			const l = c.length, h = new Float64Array(2 * l), u = new Float64Array(l), f = [];
			for (let y = 0; y < l; y++) {
				let t = 0, n = 0, e = 0;
				for (let i = c[y]; i < a[y]; i++) {
					const r = Vn(s[i], 1e-6), c = 1 / (r * r);
					t += c, n += c * o[2 * i], e += c * o[2 * i + 1];
				}
				const r = a[y] - c[y] === 1;
				h[2 * y] = r ? o[2 * c[y]] : n / t, h[2 * y + 1] = r ? o[2 * c[y] + 1] : e / t, u[y] = r ? s[c[y]] : 1 / Math.sqrt(t), f.push(c[y] + a[y] - 1 >> 1);
			}
			return {
				points: h,
				sigma: u,
				index: f
			};
		}(t, n, o), i = vi({
			points: s.points,
			sigma: s.sigma,
			closed: t.closed
		}, n, e, { maxPoints: o });
		if (i.vertices = i.vertices.map((t) => s.index[t]), r.postFit) {
			const { cx: e, cy: o, shifted: s } = Ii(t);
			i.path = fi(r.postFit(fi(i.path, -e, -o), s, i.vertices, n, null), e, o);
		}
		return i;
	}(t, n, e, r, s);
	const { cx: i, cy: c, shifted: a } = Ii(t);
	let l, h = Fi.get(t);
	if (void 0 === h && (h = new Qs(o), Fi.set(t, h)), t.closed && o >= 3) l = function(t, n, e, r) {
		const o = ii(t), s = le(t, n), i = (e, i) => {
			const c = function(t, n, e) {
				const r = ii(t), o = new Float64Array(2 * (r + 1)), s = new Float64Array(r + 1), i = [], c = [];
				for (let a = 0; a <= r; a++) {
					const l = (e + a) % r;
					o[2 * a] = t.points[2 * l], o[2 * a + 1] = t.points[2 * l + 1], s[a] = t.sigma[l], i.push(n.incoming[l]), c.push(n.outgoing[l]);
				}
				return {
					poly: {
						points: o,
						sigma: s,
						closed: !0
					},
					tan: {
						incoming: i,
						outgoing: c
					}
				};
			}(t, s, e);
			r.offset = e;
			const { sol: a, path: l } = Li(c.poly, c.tan, n, !0, i, r);
			return {
				path: l,
				vertices: a.vertices.map((t) => (e + t) % o),
				kinds: a.kinds,
				cost: a.cost + fe(s, e, n)
			};
		};
		if (e.forced.length > 0) {
			const t = e.forced[0], n = e.forced.map((n) => (n + o - t) % o).filter((t) => t > 0).toSorted((t, n) => t - n);
			return i(t, new oi(e.maxSpan, n));
		}
		let c = 0, a = -1 / 0;
		for (let x = 0; x < o; x++) {
			const t = he(s.incoming[x], s.outgoing[x]);
			(t >= a || Number.isNaN(t)) && (a = t, c = x);
		}
		const l = a >= Tn() ? c : function(t) {
			const n = t.length >> 1;
			let e = 0, r = 0;
			for (let a = 0; a < n; a++) e += t[2 * a];
			for (let a = 0; a < n; a++) r += t[2 * a + 1];
			const o = e / n, s = r / n;
			let i = 0, c = -1 / 0;
			for (let a = 0; a < n; a++) {
				const n = Math.hypot(t[2 * a] - o, t[2 * a + 1] - s);
				(n >= c || Number.isNaN(n)) && (c = n, i = a);
			}
			return i;
		}(t.points), h = i(l, e);
		let u = l, f = -1;
		for (const x of h.vertices) {
			const t = (x + o - l) % o, n = Math.min(t, o - t);
			n >= f && (f = n, u = x);
		}
		if (u === l) return h;
		const y = i(u, e);
		return y.cost < h.cost ? y : h;
	}(a, n, e, h);
	else {
		const t = le(a, n);
		h.offset = 0;
		const { sol: r, path: o } = Li(a, t, n, !1, e, h);
		l = {
			path: o,
			vertices: r.vertices,
			kinds: r.kinds,
			cost: r.cost
		};
	}
	return r.postFit && (e.free ? l.path = r.postFit(l.path, a, l.vertices, n, null) : e.maxSpan === 1 / 0 && (l.path = r.postFit(l.path, a, l.vertices, n, e.forced))), l.path = fi(l.path, i, c), l;
}
function Ni(t, n, e) {
	const r = ii(t), o = t.points, s = [];
	for (let h = 0; h < r; h += n) s.push(h);
	t.closed || s[s.length - 1] === r - 1 || s.push(r - 1);
	const i = s.map(() => -1), c = s.length, a = (t) => (t % r + r) % r, l = Tn();
	for (let h = 0; h < c; h++) {
		if (!t.closed && (0 === h || h + 1 === c)) continue;
		const n = s[h], u = 0 === h ? s[c - 1] - r : s[h - 1], f = h + 1 === c ? r : s[h + 1], y = a(u), x = a(f), p = o[2 * y], M = o[2 * y + 1], g = o[2 * x] - p, d = o[2 * x + 1] - M, m = g * g + d * d;
		if (m < 1e-12) continue;
		let b = e.tau * e.tau;
		const w = Math.floor((u + n + 1) / 2), A = Math.floor((n + f + 1) / 2);
		for (let e = w; e < A; e++) {
			const n = a(e), r = o[2 * n] - p, s = o[2 * n + 1] - M, c = o[2 * x] - o[2 * n], u = o[2 * x + 1] - o[2 * n + 1], f = Math.hypot(r, s) * Math.hypot(c, u);
			if (f < 1e-12) continue;
			const y = Math.min(Math.max((r * c + s * u) / f, -1), 1);
			if (Math.acos(y) < l) continue;
			const w = r * d - s * g, A = w * w / (m * Vn(t.sigma[n] * t.sigma[n], 1e-12));
			A > b && (b = A, i[h] = n);
		}
	}
	return i;
}
function Ii(t) {
	const n = ii(t), e = t.points;
	let r = 1 / 0, o = 1 / 0, s = -1 / 0, i = -1 / 0;
	for (let h = 0; h < n; h++) r = Yn(r, e[2 * h]), o = Yn(o, e[2 * h + 1]), s = Vn(s, e[2 * h]), i = Vn(i, e[2 * h + 1]);
	const c = .5 * (r + s), a = .5 * (o + i), l = new Float64Array(2 * n);
	for (let h = 0; h < n; h++) l[2 * h] = e[2 * h] - c, l[2 * h + 1] = e[2 * h + 1] - a;
	return {
		cx: c,
		cy: a,
		shifted: {
			points: l,
			sigma: t.sigma,
			closed: t.closed
		}
	};
}
function Pi(t, n, e, r, o) {
	const s = r.vertices, i = s.length, c = ai(t, s), a = t.closed && i >= 2 && s[0] === s[i - 1], l = function(t, n, e) {
		const r = n.vertices.length, o = r - 1, s = n.kinds;
		let i = 0;
		for (let c = 0; c < t.sigma.length; c++) i = Vn(i, t.sigma[c]);
		return function(t, n, e, r) {
			const o = n, s = t.points, i = new Float64Array(2 * o.length);
			for (let f = 0; f < o.length; f++) i[2 * f] = s[2 * o[f]], i[2 * f + 1] = s[2 * o[f] + 1];
			if (o.length < 3) return i;
			const c = ai(t, o), a = o.length, l = a - 1, h = [];
			for (let f = 0; f < l; f++) h.push(hi(t, o[f], o[f + 1]));
			const u = c ? l : a - 1;
			for (let f = c ? 0 : 1; f < u; f++) {
				if (!r(f)) continue;
				const t = c ? f % l : f, n = h[c ? (f + l - 1) % l : f - 1], o = h[t];
				if (!n || !o) continue;
				const s = n.dx * o.dy - n.dy * o.dx;
				if (Math.abs(s) < 1e-6) continue;
				const a = ((o.px - n.px) * o.dy - (o.py - n.py) * o.dx) / s, u = n.px + n.dx * a, y = n.py + n.dy * a, x = Math.atan2(Math.abs(s), n.dx * o.dx + n.dy * o.dy);
				let p = e;
				if (x >= si) {
					const t = .5 * (Math.PI - x);
					p = e + Yn(1 / Vn(Math.sin(t), .2), 3);
				}
				Math.hypot(u - i[2 * f], y - i[2 * f + 1]) <= p && (i[2 * f] = u, i[2 * f + 1] = y);
			}
			return c && (i[2 * a - 2] = i[0], i[2 * a - 1] = i[1]), i;
		}(t, n.vertices, 3 * Vn(i, .25), (t) => {
			let n, i;
			if (e) n = (t + o - 1) % o, i = t % o;
			else {
				if (0 === t || t >= r - 1) return !1;
				n = t - 1, i = t;
			}
			return "line" === s[n] && "line" === s[i];
		});
	}(t, r, c), h = function(t, n, e, r) {
		const o = r.vertices, s = o.length - 1, i = [], c = [], a = [], l = [];
		for (let h = 0; h < s; h++) {
			const s = r.tans[h];
			i.push(s ? s.t0 : n.outgoing[o[h]]), c.push(s ? s.t1 : n.incoming[o[h + 1]]);
			const u = r.arms[h];
			if (u) {
				const n = Zs(t.points, t.sigma, e.s, o[h], o[h + 1], i[h], c[h], u.d0, u.d1);
				a.push({
					d0: n.d0,
					d1: n.d1
				}), l.push(n.chi2);
			} else a.push(null), l.push(0);
		}
		return {
			tStart: i,
			tEnd: c,
			arms: a,
			chi2: l
		};
	}(t, n, e, r);
	return function(t, n, e, r, o, s, i) {
		const c = t.points, a = e.vertices, l = e.kinds, h = a.length - 1, u = /* @__PURE__ */ new Float64Array(3), f = (t) => ps(r[2 * t + 2] - r[2 * t], r[2 * t + 3] - r[2 * t + 1]), y = (e, r, o) => {
			const s = a[e], i = a[e + 1], l = Xs(c, t.sigma, n.s, s, i, r, o, n.rawMoments(s, i, u), !1);
			return l ? Zs(c, t.sigma, n.s, s, i, r, o, l.d0, l.d1) : null;
		};
		for (let x = o ? 0 : 1; x < h; x++) {
			const n = o ? (x + h - 1) % h : x - 1, r = o ? x % h : x;
			if (n === r) continue;
			const c = "line" === l[n] ? f(n) : i.tEnd[n], a = "line" === l[r] ? f(r) : i.tStart[r];
			if (!c || !a) continue;
			const u = qi(t, e, n, r, x, c, a, s);
			if (!u) continue;
			const p = ue(c, a, s.lambda);
			let M = null, g = null, d = 0, m = 0;
			if ("cubic" === l[n]) {
				if (M = y(n, i.tStart[n], u), !M) continue;
				d += i.chi2[n], m += M.chi2;
			}
			if ("cubic" === l[r]) {
				if (g = y(r, u, i.tEnd[r]), !g) continue;
				d += i.chi2[r], m += g.chi2;
			}
			.5 * m <= .5 * d + p && (M && (i.tEnd[n] = u, i.arms[n] = {
				d0: M.d0,
				d1: M.d1
			}, i.chi2[n] = M.chi2), g && (i.tStart[r] = u, i.arms[r] = {
				d0: g.d0,
				d1: g.d1
			}, i.chi2[r] = g.chi2));
		}
	}(t, e, r, l, c, o, h), function(t, n, e, r, o) {
		const s = t.points, i = n.vertices, c = i.length - 1, a = [];
		for (let l = 0; l < c; l++) {
			const t = e[2 * l + 2], o = e[2 * l + 3], c = n.kinds[l], h = n.arcs[l], u = r.arms[l];
			if ("arc" === c && h) a.push(fs(h.rx, h.ry, h.phi, h.largeArc, h.sweep, t, o));
			else if ("cubic" === c && u) {
				const n = i[l], e = i[l + 1], c = s[2 * n], h = s[2 * n + 1], f = s[2 * e], y = s[2 * e + 1], x = Math.hypot(c - f, h - y), p = Ss(c, h, f, y, r.tStart[l], r.tEnd[l], x, u.d0, u.d1);
				a.push(us(p.x1, p.y1, p.x2, p.y2, t, o));
			} else a.push(hs(t, o));
		}
		return {
			x0: e[0],
			y0: e[1],
			segments: a,
			closed: o
		};
	}(t, r, l, h, a);
}
function qi(t, n, e, r, o, s, i, c) {
	const a = n.vertices, l = n.kinds;
	if (he(s, i) >= Tn()) return null;
	if ("arc" === l[e] || "arc" === l[r]) return null;
	if ("line" === l[e] && "line" === l[r]) return null;
	if ("line" === l[e]) return s;
	if ("line" === l[r]) return i;
	const h = Math.max(Math.min(Math.floor((a[e + 1] - a[e]) / 2), Math.floor((a[r + 1] - a[r]) / 2)), 1);
	return function(t, n, e, r) {
		return ae({
			poly: t,
			n: t.points.length >> 1,
			edges: null
		}, n, e, r, new re());
	}(t, a[o % a.length], h, c) ?? ps(s.x + i.x, s.y + i.y) ?? s;
}
function Li(t, n, e, r, o, s) {
	const i = new ci(t.points, t.sigma), c = function(t, n, e, r, o, s, i) {
		const c = ii(t), a = new wi(t.points, t.sigma, n, e, r, o, i).fillTable(s), l = [], h = [], u = [], f = [], y = [];
		let x = c - 1;
		for (; -1 !== x && (l.push(x), 0 !== x);) {
			h.push(a.kind[x]);
			const t = a.arms[2 * x];
			u.push(Number.isNaN(t) ? null : {
				d0: t,
				d1: a.arms[2 * x + 1]
			}), f.push(a.tans[x]), y.push(a.arcs[x]), x = a.from[x];
		}
		return l.reverse(), h.reverse(), u.reverse(), f.reverse(), y.reverse(), {
			vertices: l,
			kinds: h,
			arms: u,
			tans: f,
			arcs: y,
			cost: a.best[c - 1]
		};
	}(t, n, i, e, r, o, s);
	return {
		sol: c,
		path: Pi(t, n, i, c, e)
	};
}
const Ci = Math.PI / 180, $i = Object.freeze({
	scale: 100,
	x0: 0,
	y0: 0
});
function Si(t, n, e, r, o) {
	const s = o.x - r.x, i = o.y - r.y, c = Math.sqrt(s * s + i * i);
	if (c < 1e-12) return 1 / 0;
	const a = -i / c, l = s / c, h = t.points, u = Math.min(e, (h.length >> 1) - 1);
	let f = 0;
	for (let y = n; y <= u; y++) {
		const n = (h[2 * y] - r.x) * a + (h[2 * y + 1] - r.y) * l;
		f = Vn(f, Math.abs(n / Vn(t.sigma[y], 1e-6)));
	}
	return f;
}
function Ei(t, n, e, r, o) {
	const s = o.x - r.x, i = o.y - r.y, c = Math.sqrt(s * s + i * i);
	if (c < 1e-12) return 1 / 0;
	const a = -i / c, l = s / c, h = t.points, u = Math.min(e, (h.length >> 1) - 1);
	let f = 0;
	for (let y = n; y <= u; y++) {
		const n = (h[2 * y] - r.x) * a + (h[2 * y + 1] - r.y) * l, e = Vn(t.sigma[y], 1e-6);
		f += n / e * (n / e);
	}
	return f;
}
const Ui = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
};
function Oi(t, n, e, r, o, s, i) {
	return Ui.x0 = r.x, Ui.y0 = r.y, Ui.x1 = o.x, Ui.y1 = o.y, Ui.x2 = s.x, Ui.y2 = s.y, Ui.x3 = i.x, Ui.y3 = i.y, Ts(t.poly.points, t.poly.sigma, t.s, n, e, Ui, !0);
}
function zi(t) {
	const n = t.length >> 1, e = new Float64Array(n);
	let r = 0;
	for (let o = 1; o < n; o++) r += ee(t[2 * o - 2] - t[2 * o], t[2 * o - 1] - t[2 * o + 1]), e[o] = r;
	return e;
}
function Ti(t, n) {
	const e = ee(t.x, t.y), r = ee(n.x, n.y);
	if (e < 1e-9 || r < 1e-9) return null;
	let o = (Math.atan2(t.y, t.x) - Math.atan2(n.y, n.x) + Math.PI) % (2 * Math.PI);
	return o < 0 && (o += 2 * Math.PI), o -= Math.PI, Math.abs(o) > 20 * Ci ? null : [e, r];
}
function ji(t, n, e, r) {
	let o = n, s = r(t);
	const i = new Float64Array(t.length);
	for (let c = 0; c < 12; c++) {
		let n = !1;
		for (let c = 0; c < t.length; c++) for (let a = -1; a <= 1; a += 2) {
			if (i.set(t), i[c] += a * o, !e(c, i)) continue;
			const l = r(i);
			l < s - 1e-9 && (s = l, t.set(i), n = !0);
		}
		if (!n && (o *= .5, o < 1e-4)) break;
	}
	return s;
}
function Xi(t, n, e) {
	const r = (t - n) * e, o = Math.round(r);
	if (Math.abs(r - o) < .5 - (2e-16 * Math.abs(r) + 1e-9)) return o;
	const s = Math.round(Math.log10(e));
	return 0 === n && s >= 0 && s <= 20 && 10 ** s === e ? Math.round(Number(t.toFixed(s)) * e) : o;
}
function Ri(t, n, e) {
	return n + t / e;
}
function Zi(t, n, e, r) {
	const { q0: o, q1: s } = n, i = {
		x: e.x1,
		y: e.y1
	}, c = {
		x: e.x2,
		y: e.y2
	}, a = {
		x: e.x,
		y: e.y
	}, l = {
		x: r.x1,
		y: r.y1
	}, h = {
		x: r.x2,
		y: r.y2
	}, u = {
		x: r.x,
		y: r.y
	};
	if (!Ti({
		x: a.x - c.x,
		y: a.y - c.y
	}, {
		x: l.x - s.x,
		y: l.y - s.y
	})) return null;
	const f = (e, r, c) => Oi(t, n.a0, n.b0, o, i, e, a) + Oi(t, n.a1, n.b1, s, r, c, u), y = f(c, l, h), x = (t) => ({
		x: 2 * s.x - t.x,
		y: 2 * s.y - t.y
	}), p = Float64Array.of(c.x, c.y, h.x, h.y);
	let M = ji(p, Vn(.25, .05 * ee(s.x - u.x, s.y - u.y)), () => !0, (t) => {
		const n = {
			x: t[0],
			y: t[1]
		};
		return f(n, x(n), {
			x: t[2],
			y: t[3]
		});
	}), g = {
		x: p[0],
		y: p[1]
	}, d = x(g);
	const m = {
		x: p[2],
		y: p[3]
	}, b = t.grid;
	if (b) {
		const t = Xi(g.x, b.x0, b.scale), n = Xi(g.y, b.y0, b.scale), e = Xi(s.x, b.x0, b.scale), r = Xi(s.y, b.y0, b.scale);
		g = {
			x: Ri(t, b.x0, b.scale),
			y: Ri(n, b.y0, b.scale)
		}, d = {
			x: Ri(2 * e - t, b.x0, b.scale),
			y: Ri(2 * r - n, b.y0, b.scale)
		}, M = f(g, d, m);
	}
	return M - y < t.budget ? [us(i.x, i.y, g.x, g.y, a.x, a.y), us(d.x, d.y, m.x, m.y, u.x, u.y)] : null;
}
function Vi(t, n, e) {
	const { q0: r, q1: o } = n, s = {
		x: e.x1,
		y: e.y1
	}, i = {
		x: e.x2,
		y: e.y2
	}, c = {
		x: e.x,
		y: e.y
	}, a = {
		x: o.x - r.x,
		y: o.y - r.y
	}, l = Ti(a, {
		x: s.x - o.x,
		y: s.y - o.y
	});
	if (!l) return null;
	const h = a.x / l[0], u = a.y / l[0], f = Oi(t, n.a1, n.b1, o, s, i, c), y = Float64Array.of(l[1], i.x, i.y);
	return ji(y, Vn(.25, .05 * ee(o.x - c.x, o.y - c.y)), (t, n) => !(0 === t && n[0] < 1e-4), (e) => Oi(t, n.a1, n.b1, o, {
		x: o.x + h * e[0],
		y: o.y + u * e[0]
	}, {
		x: e[1],
		y: e[2]
	}, c)) - f < t.lambda ? us(o.x + h * y[0], o.y + u * y[0], y[1], y[2], c.x, c.y) : null;
}
function Yi(t, n, e, r) {
	const { q0: o, q1: s } = n, i = {
		x: e.x1,
		y: e.y1
	}, c = {
		x: e.x2,
		y: e.y2
	}, a = {
		x: e.x,
		y: e.y
	}, l = {
		x: r.x - s.x,
		y: r.y - s.y
	}, h = Ti({
		x: a.x - c.x,
		y: a.y - c.y
	}, l);
	if (!h) return null;
	const u = l.x / h[1], f = l.y / h[1], y = Oi(t, n.a0, n.b0, o, i, c, a), x = Float64Array.of(i.x, i.y, h[0]);
	return ji(x, Vn(.25, .05 * ee(o.x - s.x, o.y - s.y)), (t, n) => !(2 === t && n[2] < 1e-4), (e) => Oi(t, n.a0, n.b0, o, {
		x: e[0],
		y: e[1]
	}, {
		x: s.x - u * e[2],
		y: s.y - f * e[2]
	}, s)) - y < t.lambda ? us(x[0], x[1], s.x - u * x[2], s.y - f * x[2], a.x, a.y) : null;
}
const Bi = [
	-90,
	-65,
	-45,
	-22,
	0,
	22,
	45,
	65,
	90
], Di = [
	.15,
	.3,
	.45,
	.6,
	.8
], Qi = .02, _i = si, Wi = 1 - 1e-12, Gi = 1 + 1e-12, Ki = Math.PI / 180, Hi = /* @__PURE__ */ new Float64Array(194), Ji = /* @__PURE__ */ new Uint8Array(97);
function tc(t, n, e) {
	for (let r = 0; r <= n; r++) {
		const o = r / n, s = 1 - o, i = s * s * s, c = 3 * s * s * o, a = 3 * s * o * o, l = o * o * o;
		e[2 * r] = i * t.x0 + c * t.x1 + a * t.x2 + l * t.x3, e[2 * r + 1] = i * t.y0 + c * t.y1 + a * t.y2 + l * t.y3;
	}
}
function nc(t, n, e, r) {
	let o = 1 / 0, s = 0;
	for (let i = 0; i < r; i++) {
		const r = t - e[2 * i], c = n - e[2 * i + 1], a = r * r + c * c;
		a < o && (o = a, s = i);
	}
	return s;
}
function ec(t, n, e, r, o) {
	const s = ee(t - r, n - o), i = e >= 1e-6 ? e : 1e-6;
	return s / i * (s / i);
}
function rc(t, n) {
	const e = n >= 1e-6 ? n : 1e-6, r = t / (e * e);
	return r >= 1e-290 && r <= 1e300 ? r * Wi : 0;
}
function oc(t, n, e, r, o, s) {
	let i = 0;
	for (let c = o; c <= s; c++) {
		const o = e[2 * c], s = e[2 * c + 1], a = nc(o, s, t, n);
		i += ec(o, s, r[c], t[2 * a], t[2 * a + 1]);
	}
	return i;
}
function sc(t, n, e, r, o, s, i) {
	if (Number.isNaN(i) || i === 1 / 0) return oc(t, n, e, r, o, s);
	const c = s + 1 - o;
	if (c > 97 || i < 1e-250) {
		let c = 0;
		for (let a = o; a <= s; a++) {
			const o = e[2 * a], s = e[2 * a + 1], l = nc(o, s, t, n);
			if (c += ec(o, s, r[a], t[2 * l], t[2 * l + 1]), c >= i) return 1 / 0;
		}
		return c;
	}
	const a = i * Gi, l = c - 1 >> 1, h = 2 * n;
	let u = 0;
	for (let y = 0; y < c; y++) {
		const n = y + 1 >> 1, s = 1 & ~y ? l - n : l + n, i = o + s, c = e[2 * i], f = e[2 * i + 1];
		let x = 1 / 0, p = 0;
		for (let e = 0; e < h; e += 2) {
			const n = c - t[e], r = f - t[e + 1], o = n * n + r * r;
			o < x && (x = o, p = e);
		}
		if (Ji[s] = p >> 1, u += rc(x, r[i]), u >= a) return 1 / 0;
	}
	let f = 0;
	for (let y = 0; y < c; y++) {
		const n = o + y, s = Ji[y];
		f += ec(e[2 * n], e[2 * n + 1], r[n], t[2 * s], t[2 * s + 1]);
	}
	return f;
}
function ic(t, n, e, r, o = 96) {
	const s = Math.min(Math.max(Math.floor(o), 1), 96);
	return tc(t, s, Hi), oc(Hi, s + 1, n.points, n.sigma, e, r);
}
const cc = 25, ac = Bi.length * Di.length, lc = (() => {
	const t = /* @__PURE__ */ new Float64Array(100);
	for (let n = 0; n < cc; n++) {
		const e = n / 24, r = 1 - e;
		t[4 * n] = r * r * r, t[4 * n + 1] = 3 * r * r * e, t[4 * n + 2] = 3 * r * e * e, t[4 * n + 3] = e * e * e;
	}
	return t;
})(), hc = ((Bi.indexOf(0) * Bi.length + Bi.indexOf(0)) * Di.length + Di.indexOf(.3)) * Di.length + Di.indexOf(.3), uc = Di.map((t) => t >= Qi && t <= 1), fc = new Float64Array(ac * cc), yc = new Float64Array(ac * cc), xc = new Float64Array(ac * cc), pc = new Float64Array(ac * cc), Mc = new Float64Array(cc), gc = new Float64Array(cc), dc = new Float64Array(ac), mc = new Float64Array(ac), bc = new Float64Array(ac), wc = new Float64Array(ac), Ac = /* @__PURE__ */ new Float64Array(50), kc = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
}, Fc = {
	x: 0,
	y: 0
};
function vc(t, n, e, r) {
	const o = e * Ki, s = Math.sin(o), i = Math.cos(o);
	return r.x = t * i - n * s, r.y = t * s + n * i, r;
}
var Nc = class {
	pts;
	sigma;
	a;
	b;
	p0x;
	p0y;
	p3x;
	p3y;
	chord;
	base0x;
	base0y;
	base1x;
	base1y;
	constructor(t, n, e, r, o, s, i, c, a, l, h, u, f) {
		this.pts = t, this.sigma = n, this.a = e, this.b = r, this.p0x = o, this.p0y = s, this.p3x = i, this.p3y = c, this.chord = a, this.base0x = l, this.base0y = h, this.base1x = u, this.base1y = f;
	}
	build(t, n, e, r, o) {
		const s = this.chord;
		vc(this.base0x, this.base0y, t, Fc);
		const i = Fc.x, c = Fc.y;
		return vc(this.base1x, this.base1y, n, Fc), o.x0 = this.p0x, o.y0 = this.p0y, o.x1 = this.p0x + i * e * s, o.y1 = this.p0y + c * e * s, o.x2 = this.p3x - Fc.x * r * s, o.y2 = this.p3y - Fc.y * r * s, o.x3 = this.p3x, o.y3 = this.p3y, o;
	}
	score(t, n, e, r, o) {
		if (!(e >= Qi && e <= 1 && r >= Qi && r <= 1)) return 1 / 0;
		if (Math.abs(t) > 100 || Math.abs(n) > 100) return 1 / 0;
		const s = this.build(t, n, e, r, kc);
		return Ms(s) ? 1 / 0 : (tc(s, 96, Hi), sc(Hi, 97, this.pts, this.sigma, this.a, this.b, o));
	}
	grid(t) {
		const { p0x: n, p0y: e, p3x: r, p3y: o, chord: s } = this, i = Di.length;
		for (let h = 0; h < Bi.length; h++) {
			vc(this.base0x, this.base0y, Bi[h], Fc);
			const t = Fc.x, c = Fc.y;
			vc(this.base1x, this.base1y, Bi[h], Fc);
			const a = Fc.x, l = Fc.y;
			for (let u = 0; u < i; u++) {
				const f = h * i + u, y = Di[u];
				dc[f] = n + t * y * s, mc[f] = e + c * y * s, bc[f] = r - a * y * s, wc[f] = o - l * y * s;
			}
		}
		for (let h = 0; h < ac; h++) {
			const t = dc[h], r = mc[h], o = bc[h], s = wc[h];
			for (let i = 0; i < cc; i++) {
				const c = 4 * i;
				fc[h * cc + i] = lc[c] * n + lc[c + 1] * t, yc[h * cc + i] = lc[c] * e + lc[c + 1] * r, xc[h * cc + i] = lc[c + 2] * o, pc[h * cc + i] = lc[c + 2] * s;
			}
		}
		for (let h = 0; h < cc; h++) Mc[h] = lc[4 * h + 3] * r, gc[h] = lc[4 * h + 3] * o;
		let c = 1 / 0, a = -1;
		t[0] = 0, t[1] = 0, t[2] = .35, t[3] = .35;
		const l = Bi.length * Bi.length * i * i;
		for (let h = -1; h < l; h++) {
			const n = h < 0 ? hc : h;
			if (h >= 0 && n === hc) continue;
			const e = n % i, r = Math.floor(n / i) % i, o = Math.floor(n / (i * i)) % Bi.length, s = Math.floor(n / (i * i * Bi.length));
			if (!uc[r] || !uc[e]) continue;
			const l = s * i + r, u = o * i + e, f = l * cc, y = u * cc;
			for (let t = 0; t < cc; t++) Ac[2 * t] = fc[f + t] + xc[y + t] + Mc[t], Ac[2 * t + 1] = yc[f + t] + pc[y + t] + gc[t];
			const x = sc(Ac, cc, this.pts, this.sigma, this.a, this.b, bi(c));
			(x < c || x === c && n < a) && !this.crosses(l, u) && (c = x, a = n, t[0] = Bi[s], t[1] = Bi[o], t[2] = Di[r], t[3] = Di[e]);
		}
		return Number.isFinite(c);
	}
	crosses(t, n) {
		return kc.x0 = this.p0x, kc.y0 = this.p0y, kc.x1 = dc[t], kc.y1 = mc[t], kc.x2 = bc[n], kc.y2 = wc[n], kc.x3 = this.p3x, kc.y3 = this.p3y, Ms(kc);
	}
	refine(t) {
		let n = this.score(t[0], t[1], t[2], t[3], 1 / 0);
		const e = [
			10,
			10,
			.1,
			.1
		], r = /* @__PURE__ */ new Float64Array(4), o = [
			t[0],
			t[1],
			t[2],
			t[3],
			n
		];
		for (let s = 0; s < 6; s++) {
			let s = !0;
			for (; s;) {
				s = !1;
				for (let i = 0; i < 4; i++) for (let c = -1; c <= 1; c += 2) {
					r.set(t), r[i] += c * e[i];
					let a = NaN, l = !1;
					for (let t = 0; t < o.length; t += 5) if (o[t] === r[0] && o[t + 1] === r[1] && o[t + 2] === r[2] && o[t + 3] === r[3]) {
						a = o[t + 4], l = !0;
						break;
					}
					l || (a = this.score(r[0], r[1], r[2], r[3], n), o.push(r[0], r[1], r[2], r[3], a)), a < n && (n = a, t.set(r), s = !0);
				}
			}
			for (let t = 0; t < 4; t++) e[t] *= .5;
		}
		return n;
	}
};
function Ic(t, n, e, r, o, s, i) {
	const c = t.points, a = ee(r - s, o - i);
	if (a <= 1e-9 || e <= n + 1) return null;
	const l = Math.min(n + 2, e), h = c[2 * l] - r, u = c[2 * l + 1] - o, f = Math.max(e >= 2 ? e - 2 : 0, n), y = s - c[2 * f], x = i - c[2 * f + 1], p = ee(h, u), M = ee(y, x);
	if (p <= 1e-9 || M <= 1e-9) return null;
	let g = 0;
	for (let w = n; w < e; w++) g += ee(c[2 * w] - c[2 * w + 2], c[2 * w + 1] - c[2 * w + 3]);
	if (g <= 1e-9) return null;
	const d = new Nc(c, t.sigma, n, e, r, o, s, i, a, h / p, u / p, y / M, x / M), m = /* @__PURE__ */ new Float64Array(4);
	if (!d.grid(m)) return null;
	const b = d.refine(m);
	return Number.isFinite(b) ? {
		cubic: d.build(m[0], m[1], m[2], m[3], {
			x0: 0,
			y0: 0,
			x1: 0,
			y1: 0,
			x2: 0,
			y2: 0,
			x3: 0,
			y3: 0
		}),
		chi2: b
	} : null;
}
function Pc(t, n, e, r, o, s, i, c) {
	const a = Xn();
	return Number.isFinite(a) && he(ee(e - t, r - n) > 1e-12 ? {
		x: e - t,
		y: r - n
	} : {
		x: o - t,
		y: s - n
	}, ee(i - o, c - s) > 1e-12 ? {
		x: i - o,
		y: c - s
	} : {
		x: i - e,
		y: c - r
	}) > a ? zn() : 0;
}
const qc = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
};
function Lc(t, n, e, r, o, s) {
	const i = t.segments;
	let c = 0, a = 0;
	for (; a + 1 < i.length;) {
		let l = 0, h = null;
		for (let c = Math.min(4, i.length - a); c >= 2; c--) {
			if (a + c >= e.length) continue;
			const u = e[a], f = e[a + c];
			if (f <= u + 3 || f - u > 96) continue;
			if (s) {
				let t = !1;
				for (let n = a + 1; n < a + c; n++) s.has(e[n]) && (t = !0);
				if (t) continue;
			}
			let y = !1;
			for (let t = a; t < a + c; t++) "A" === i[t].type && (y = !0);
			if (y) continue;
			const x = e.slice(a, a + c + 1).join(",");
			if (o.has(x)) continue;
			let p = 0, M = 0, g = 0 === a ? t.x0 : i[a - 1].x, d = 0 === a ? t.y0 : i[a - 1].y;
			for (let t = a; t < a + c; t++) {
				const r = i[t];
				M += ys(r), qc.x0 = g, qc.y0 = d, "C" === r.type ? (M += Pc(g, d, r.x1, r.y1, r.x2, r.y2, r.x, r.y), qc.x1 = r.x1, qc.y1 = r.y1, qc.x2 = r.x2, qc.y2 = r.y2) : (qc.x1 = g, qc.y1 = d, qc.x2 = r.x, qc.y2 = r.y), qc.x3 = r.x, qc.y3 = r.y, p += ic(qc, n, e[t], e[t + 1]), g = r.x, d = r.y;
			}
			const m = .5 * p + r.lambda * M + 0 * r.lambda, b = r.lambda * (zn() + 2);
			if (b >= m) {
				o.add(x);
				continue;
			}
			const w = 0 === a ? t.x0 : i[a - 1].x, A = 0 === a ? t.y0 : i[a - 1].y, k = i[a + c - 1], F = Ic(n, u, f, w, A, k.x, k.y);
			if (!F || Ms(F.cubic)) {
				o.add(x);
				continue;
			}
			const v = F.cubic;
			if (.5 * F.chi2 + b + r.lambda * Pc(v.x0, v.y0, v.x1, v.y1, v.x2, v.y2, v.x3, v.y3) < m) {
				l = c, h = v;
				break;
			}
			o.add(x);
		}
		if (h) {
			const t = h;
			i.splice(a, l, us(t.x1, t.y1, t.x2, t.y2, t.x3, t.y3)), e.splice(a + 1, l - 1), c++;
		}
		a++;
	}
	return c;
}
function Cc(t, n) {
	const e = ee(t, n);
	return e > 1e-12 ? {
		x: t / e,
		y: n / e
	} : null;
}
function $c(t, n, e, r, o, s) {
	const i = n.x * o.y - n.y * o.x, c = Math.atan2(Math.abs(i), n.x * o.x + n.y * o.y);
	if (c < _i || Math.abs(i) <= 1e-9) return null;
	const a = ((r.x - t.x) * o.y - (r.y - t.y) * o.x) / i, l = {
		x: t.x + n.x * a,
		y: t.y + n.y * a
	}, h = .5 * (Math.PI - c), u = Yn(1 / Vn(Math.sin(h), .2), 3) + .5, f = (l.x - e.x) * n.x + (l.y - e.y) * n.y >= -u, y = (s.x - l.x) * o.x + (s.y - l.y) * o.y >= -u;
	return f && y && ee(l.x - e.x, l.y - e.y) <= u && ee(l.x - s.x, l.y - s.y) <= u ? l : null;
}
function Sc(t, n, e, r, o) {
	if (r < 0 || o < 0) return null;
	if ("L" !== t[r].type || "L" !== t[o].type) return null;
	const s = n[r], i = {
		x: t[o].x,
		y: t[o].y
	}, c = n[e], a = t[e], l = ee(c.x - a.x, c.y - a.y);
	if ("C" === a.type && l <= 8) {
		const t = Cc(c.x - s.x, c.y - s.y);
		if (!t) return null;
		const n = Cc(i.x - a.x, i.y - a.y);
		return n ? function(t, n, e, r, o) {
			const s = {
				x: t.x0,
				y: t.y0
			}, i = {
				x: t.x3,
				y: t.y3
			}, c = .125, a = .375, l = {
				x: c * t.x0 + a * t.x1 + a * t.x2 + c * t.x3,
				y: c * t.y0 + a * t.y1 + a * t.y2 + c * t.y3
			}, h = 3 * (.25 * (t.x1 - t.x0) + .5 * (t.x2 - t.x1) + .25 * (t.x3 - t.x2)), u = 3 * (.25 * (t.y1 - t.y0) + .5 * (t.y2 - t.y1) + .25 * (t.y3 - t.y2));
			if (ee(s.x - i.x, s.y - i.y) <= 2.5) {
				const t = $c(n, e, s, r, o, i);
				if (t) return {
					h1: t,
					h2: null
				};
			}
			const f = Cc(h, u);
			if (!f) return null;
			const y = $c(n, e, s, l, f, s), x = $c(l, f, i, r, o, i);
			if (y && x) {
				const t = ee(y.x - x.x, y.y - x.y);
				if (t >= 1 && t <= 8) return {
					h1: y,
					h2: x
				};
			}
			return null;
		}({
			x0: c.x,
			y0: c.y,
			x1: a.x1,
			y1: a.y1,
			x2: a.x2,
			y2: a.y2,
			x3: a.x,
			y3: a.y
		}, s, t, i, n) : null;
	}
	if ("L" === a.type && l <= 2.5) {
		const t = Cc(c.x - s.x, c.y - s.y);
		if (!t) return null;
		const n = Cc(i.x - a.x, i.y - a.y);
		if (!n) return null;
		const e = $c(s, t, c, i, n, {
			x: a.x,
			y: a.y
		});
		return e ? {
			h1: e,
			h2: null
		} : null;
	}
	return null;
}
function Ec(t, n) {
	const e = t[t.length - 1];
	return !(!e || "L" !== e.type || (t[t.length - 1] = hs(n.x, n.y), 0));
}
function Uc(t, n, e, r) {
	let o = 1 / 0, s = e;
	for (let i = e; i <= r; i++) {
		const e = t[2 * i] - n.x, r = t[2 * i + 1] - n.y, c = e * e + r * r;
		c < o && (o = c, s = i);
	}
	return s;
}
function Oc(t, n, e) {
	const r = As(t, n, e, .05), o = r.length >> 1;
	let s = 0;
	for (let i = 0; i < o; i++) {
		const t = i + 1 === o ? 0 : i + 1;
		s += r[2 * i] * r[2 * t + 1] - r[2 * t] * r[2 * i + 1];
	}
	return s / 2;
}
function zc(t, n, e, r, o = {}) {
	const s = o.keep ?? [], i = {
		merged: 0,
		sharpened: 0,
		axisSnapped: 0,
		smoothSnapped: 0
	};
	if (i.merged = function(t, n, e, r, o = []) {
		if (t.segments.length < 2 || e.length !== t.segments.length + 1) return 0;
		const s = o.length > 0 ? new Set(o) : null, i = /* @__PURE__ */ new Set();
		let c = 0;
		for (let a = 0; a < 6; a++) {
			const o = Lc(t, n, e, r, i, s);
			if (c += o, 0 === o) break;
		}
		return c;
	}(t, n, e, r, s), i.sharpened = function(t, n) {
		const e = t.segments, r = e.length;
		if (r < 3) return 0;
		const o = n && n.vertices.length === r + 1 ? n.vertices : null, s = n ? n.poly.points : /* @__PURE__ */ new Float64Array(0), i = n?.keep && n.keep.length > 0 ? new Set(n.keep) : null, c = [];
		let a = t.x0, l = t.y0;
		for (const g of e) c.push({
			x: a,
			y: l
		}), a = g.x, l = g.y;
		const h = t.closed && ee(a - t.x0, l - t.y0) < 1e-9, u = [], f = o ? [o[0]] : [];
		let y = t.x0, x = t.y0, p = null, M = 0;
		for (let g = 0; g < r; g++) {
			const t = g >= 1 ? g - 1 : h ? r - 1 : -1, n = g + 1 < r ? g + 1 : h ? 0 : -1, a = null !== o && null !== i && (i.has(o[g]) || i.has(o[g + 1])) ? null : Sc(e, c, g, t, n);
			if (!a) {
				u.push(e[g]), o && f.push(o[g + 1]);
				continue;
			}
			const { h1: l, h2: d } = a, m = g === r - 1 && h, b = d ? o && o[g + 1] - 1 : o && o[g + 1];
			if (0 === g ? (p = l, y = l.x, x = l.y) : Ec(u, l) && o && null !== b && (f[f.length - 1] = m && !d ? o[g + 1] : Uc(s, l, o[g], b)), m && (y = (d ?? l).x, x = (d ?? l).y), d) {
				if (u.push(hs(d.x, d.y)), o) {
					const t = Math.min(f[f.length - 1] + 1, o[g + 1]);
					f.push(m ? o[g + 1] : Uc(s, d, t, o[g + 1]));
				}
				M++;
			}
			M++;
		}
		if (0 === M) return 0;
		if (u.length < (h ? 3 : 1)) return 0;
		if (p && (Ec(u, p), y = p.x, x = p.y), h) {
			const n = Math.abs(Oc(t.x0, t.y0, e));
			if (Math.abs(Oc(y, x, u)) < .5 * n) return 0;
		}
		return t.x0 = y, t.y0 = x, t.segments = u, o && o.splice(0, o.length, ...f), M;
	}(t, {
		vertices: e,
		poly: n,
		keep: s
	}), 0 === s.length && (o.axisLines && (i.axisSnapped = function(t, n, e, r) {
		const o = t.segments;
		if (0 === o.length || e.length !== o.length + 1) return 0;
		const s = n.points.length >> 1, i = 2 * r.lambda * 1;
		let c = 0, a = {
			x: t.x0,
			y: t.y0
		};
		for (let l = 0; l < o.length; l++) {
			const t = o[l], r = {
				x: t.x,
				y: t.y
			};
			if ("L" !== t.type) {
				a = r;
				continue;
			}
			const h = r.x - a.x, u = r.y - a.y;
			if (0 === h && 0 === u) {
				a = r;
				continue;
			}
			const f = Math.abs(u) <= Math.abs(h) ? {
				x: r.x,
				y: a.y
			} : {
				x: a.x,
				y: r.y
			}, y = ee(f.x - r.x, f.y - r.y), x = l + 1 < o.length && "L" === o[l + 1].type, p = e[l], M = e[l + 1];
			if (y < 1e-12 || !x || M <= p || M >= s) {
				a = r;
				continue;
			}
			if (y > Vn(n.sigma[M], 1e-6)) {
				a = r;
				continue;
			}
			if (Si(n, p, M, a, f) > 3) {
				a = r;
				continue;
			}
			const g = Ei(n, p, M, a, r);
			Ei(n, p, M, a, f) - g < i ? (o[l] = hs(f.x, f.y), c++, a = f) : a = r;
		}
		return c;
	}(t, n, e, r)), o.smoothJoins)) i.smoothSnapped = function(t, n, e, r, o = $i) {
		const s = t.segments;
		if (s.length < 2 || e.length !== s.length + 1) return 0;
		const i = n.points.length >> 1, c = {
			poly: n,
			s: zi(n.points),
			budget: 2 * r.lambda * (zn() - 4),
			lambda: r.lambda,
			grid: o
		}, a = [];
		let l = t.x0, h = t.y0;
		for (const f of s) a.push({
			x: l,
			y: h
		}), l = f.x, h = f.y;
		let u = 0;
		for (let f = 1; f < s.length; f++) {
			const t = {
				a0: e[f - 1],
				b0: e[f],
				a1: e[f],
				b1: e[f + 1],
				q0: a[f - 1],
				q1: a[f]
			};
			if (t.b0 <= t.a0 || t.b1 <= t.a1 || t.b1 >= i) continue;
			const n = s[f - 1], r = s[f];
			if ("C" === n.type && "C" === r.type) {
				const e = Zi(c, t, n, r);
				e && (s[f - 1] = e[0], s[f] = e[1], u++);
			} else if ("L" === n.type && "C" === r.type) {
				const n = Vi(c, t, r);
				n && (s[f] = n, u++);
			} else if ("C" === n.type && "L" === r.type) {
				const e = Yi(c, t, n, {
					x: r.x,
					y: r.y
				});
				e && (s[f - 1] = e, u++);
			}
		}
		return u;
	}(t, n, e, r, void 0 === o.grid ? $i : o.grid);
	return i;
}
function Tc(t) {
	const n = {
		x0: t.x0,
		y0: t.y0,
		segments: t.segments,
		closed: t.closed,
		params: t.params,
		chi2: t.chi2
	};
	return t.primitive && (n.primitive = t.primitive), n;
}
function jc(t, n, e, r, o, s) {
	const i = function(t, n, e, r) {
		const o = sr(t, n, e, r);
		return null === o || o.primitive ? o : {
			...o,
			params: o.params + 2,
			cost: o.cost + 2 * r.lambda
		};
	}(t, n, e, r);
	return o && null !== i && i.cost < function(t, n, e) {
		const r = e.lambda;
		if (Number.isNaN(r) || r < 0) return -1 / 0;
		const o = 6 * r, s = r * (2 + zn()), i = .5 * function(t, n) {
			const e = t.length >> 1, r = (t) => {
				const e = Math.max(t < n.length ? n[t] : .5, .001);
				return 1 / (e * e);
			};
			let o = 0, s = 0, i = 0, c = 0;
			for (let p = 0; p < e; p++) {
				const n = r(p), e = t[2 * p], a = t[2 * p + 1];
				o += n, s += n * e, i += n * a, c = Math.max(c, Math.abs(e), Math.abs(a));
			}
			if (Number.isNaN(o) || o <= 0) return 0;
			const a = s / o, l = i / o;
			let h = 0, u = 0, f = 0;
			for (let p = 0; p < e; p++) {
				const n = r(p), e = t[2 * p] - a, o = t[2 * p + 1] - l;
				h += n * e * e, u += n * e * o, f += n * o * o;
			}
			const y = .5 * (h - f), x = .5 * (.5 * (h + f) - Math.sqrt(y * y + u * u)) - 1e-9 * (h + f + o * c * c);
			return x > 0 && Number.isFinite(x) ? x : 0;
		}(t, n) + 4 * r;
		return Math.min(o, s, i);
	}(t, n, r) ? Tc(i) : function(t, n, e) {
		return null !== n && n.cost < function(t, n) {
			return 0 !== t.segments.length || t.primitive ? .5 * t.chi2 + n.lambda * t.params : 1 / 0;
		}(t, e) ? Tc(n) : t;
	}(s(), i, r);
}
const Xc = (t, n, e, r, o) => {
	const s = {
		x0: t.x0,
		y0: t.y0,
		segments: t.segments.slice(),
		closed: n.closed
	}, i = e.length - 1;
	if (n.closed && i >= 1 && e[0] === e[i]) {
		const t = ii(n), c = e[0];
		zc(s, function(t, n) {
			const e = ii(t), r = new Float64Array(2 * (e + 1)), o = new Float64Array(e + 1);
			for (let s = 0; s <= e; s++) {
				const i = (n + s) % e;
				r[2 * s] = t.points[2 * i], r[2 * s + 1] = t.points[2 * i + 1], o[s] = t.sigma[i];
			}
			return {
				points: r,
				sigma: o,
				closed: !1
			};
		}(n, c), e.map((n, e) => e === i ? t : (n - c + t) % t), r, { keep: (o ?? []).flatMap((n) => {
			const e = (n - c + t) % t;
			return 0 === e ? [0, t] : [e];
		}).toSorted((t, n) => t - n) });
	} else zc(s, n, e.slice(), r, { keep: o ?? [] });
	return s.closed = t.closed, s;
};
function Rc(t, n) {
	const e = n.length, r = t.map((t, e) => [...t, n[e]]);
	for (let o = 0; o < e; o++) {
		let t = o;
		for (let n = o + 1; n < e; n++) Math.abs(r[n][o]) > Math.abs(r[t][o]) && (t = n);
		if (Math.abs(r[t][o]) < 1e-12) return null;
		[r[o], r[t]] = [r[t], r[o]];
		for (let n = 0; n < e; n++) {
			if (n === o) continue;
			const t = r[n][o] / r[o][o];
			for (let s = o; s <= e; s++) r[n][s] -= t * r[o][s];
		}
	}
	return r.map((t, n) => t[e] / t[n]);
}
function Zc(t) {
	const n = t.length;
	if (n < 3) return null;
	let e = 0, r = 0, o = 0, s = 0, i = 0, c = 0, a = 0, l = 0;
	for (const g of t) {
		const t = g.x * g.x + g.y * g.y;
		e += g.x * g.x, r += g.x * g.y, o += g.y * g.y, s += g.x, i += g.y, c += g.x * t, a += g.y * t, l += t;
	}
	const h = Rc([
		[
			e,
			r,
			s
		],
		[
			r,
			o,
			i
		],
		[
			s,
			i,
			n
		]
	], [
		-c,
		-a,
		-l
	]);
	if (!h) return null;
	const [u, f, y] = h, x = -u / 2, p = -f / 2, M = x * x + p * p - y;
	return M <= 0 ? null : {
		cx: x,
		cy: p,
		r: Math.sqrt(M)
	};
}
function Vc(t) {
	const n = t.length;
	if (n < 6) return null;
	let e = 0, r = 0;
	for (const S of t) e += S.x, r += S.y;
	e /= n, r /= n;
	let o = 0;
	for (const S of t) o += (S.x - e) ** 2 + (S.y - r) ** 2;
	const s = Math.sqrt(o / n) || 1, i = Array.from({ length: 6 }, () => new Array(6).fill(0));
	for (const S of t) {
		const t = (S.x - e) / s, n = (S.y - r) / s, o = [
			t * t,
			t * n,
			n * n,
			t,
			n,
			1
		];
		for (let e = 0; e < 6; e++) for (let t = 0; t < 6; t++) i[e][t] += o[e] * o[t];
	}
	const { values: c, vectors: a } = function(t) {
		const n = t.map((t) => [...t]), e = Array.from({ length: 6 }, (t, n) => Array.from({ length: 6 }, (t, e) => n === e ? 1 : 0));
		for (let r = 0; r < 100; r++) {
			let t = 0;
			for (let e = 0; e < 6; e++) for (let r = e + 1; r < 6; r++) t += n[e][r] * n[e][r];
			if (t < 1e-20) break;
			for (let r = 0; r < 6; r++) for (let t = r + 1; t < 6; t++) {
				if (Math.abs(n[r][t]) < 1e-18) continue;
				const o = (n[t][t] - n[r][r]) / (2 * n[r][t]), s = Math.sign(o || 1) / (Math.abs(o) + Math.sqrt(o * o + 1)), i = 1 / Math.sqrt(s * s + 1), c = s * i;
				for (let e = 0; e < 6; e++) {
					const o = n[e][r], s = n[e][t];
					n[e][r] = i * o - c * s, n[e][t] = c * o + i * s;
				}
				for (let e = 0; e < 6; e++) {
					const o = n[r][e], s = n[t][e];
					n[r][e] = i * o - c * s, n[t][e] = c * o + i * s;
				}
				for (let n = 0; n < 6; n++) {
					const o = e[n][r], s = e[n][t];
					e[n][r] = i * o - c * s, e[n][t] = c * o + i * s;
				}
			}
		}
		return {
			values: n.map((t, n) => t[n]),
			vectors: e
		};
	}(i);
	let l = 0;
	for (let S = 1; S < 6; S++) c[S] < c[l] && (l = S);
	const [h, u, f, y, x, p] = a.map((t) => t[l]);
	if (u * u - 4 * h * f >= 0) return null;
	const M = Rc([[2 * h, u], [u, 2 * f]], [-y, -x]);
	if (!M) return null;
	const [g, d] = M, m = h * g * g + u * g * d + f * d * d + y * g + x * d + p, b = h + f, w = h * f - u * u / 4, A = Math.sqrt(Math.max(0, b * b / 4 - w)), k = b / 2 + A, F = b / 2 - A;
	if (0 === k || 0 === F) return null;
	const v = -m / k, N = -m / F;
	if (v <= 0 || N <= 0) return null;
	const I = Math.sqrt(v), P = Math.sqrt(N), q = Math.abs(u) < 1e-12 && Math.abs(h - k) < 1e-12 ? 0 : Math.atan2(k - h, u / 2);
	let L, C, $;
	for (I >= P ? (L = I, C = P, $ = q) : (L = P, C = I, $ = q + Math.PI / 2); $ > Math.PI / 2;) $ -= Math.PI;
	for (; $ <= -Math.PI / 2;) $ += Math.PI;
	return {
		cx: e + g * s,
		cy: r + d * s,
		rx: L * s,
		ry: C * s,
		angle: $
	};
}
function Yc(t, n, e, r, o, s, i) {
	const c = Math.abs(t - e) - (o - i), a = Math.abs(n - r) - (s - i), l = Math.max(c, 0), h = Math.max(a, 0);
	return (0 === h ? l : 0 === l ? h : Math.hypot(l, h)) + Math.min(Math.max(c, a), 0) - i;
}
function Bc(t) {
	const n = Math.max(t.hx, 0), e = Math.max(t.hy, 0);
	return {
		cx: t.cx,
		cy: t.cy,
		hx: n,
		hy: e,
		r: Math.min(Math.max(t.r, 0), n, e)
	};
}
function Dc(t, n, e) {
	let r = 0;
	for (let o = 0; o < t.length; o++) {
		const s = Yc(t[o], n[o], e.cx, e.cy, e.hx, e.hy, e.r);
		r += s * s;
	}
	return r;
}
function Qc(t, n) {
	let e = t.toFixed(_c(n));
	return e.includes(".") && (e = e.replace(/\.?0+$/, "")), "-0" === e && (e = "0"), e;
}
function _c(t) {
	const n = Math.round(t);
	return n < 0 ? 0 : n > 4 ? 4 : n;
}
function Wc(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, i = 3 * r * e * e, c = e * e * e;
	return {
		x: o * t.x + s * n.x1 + i * n.x2 + c * n.x,
		y: o * t.y + s * n.y1 + i * n.y2 + c * n.y
	};
}
function Gc(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function Kc(t, n, e, r, o, s) {
	const i = t * o + n * s, c = -t * s + n * o, a = i * i / (e * e) + c * c / (r * r) - 1, l = 2 * Math.hypot(i / (e * e), c / (r * r));
	return l > 0 ? Math.abs(a) / l : 1 / 0;
}
function Hc(t, n, e, r) {
	const s = o(t.x, t.y, n);
	if (null === s) return !1;
	const { cx: i, cy: c, rx: a, ry: l, phi: h, theta1: u, dTheta: f } = s, y = Math.cos(h), x = Math.sin(h), p = Math.min(a, l), M = 2 * Math.PI, g = r / p, d = (t) => {
		let n = t - u;
		return f >= 0 ? (n = (n % M + M) % M, n <= f + g || n >= M - g) : (n = -(-n % M + M) % M, n >= f - g || n <= -M + g);
	}, m = (t) => Math.hypot(a * Math.sin(t), l * Math.cos(t));
	let b = u, w = t;
	for (const o of e) {
		const t = o.x - i, n = o.y - c;
		if (Kc(t, n, a, l, y, x) > r) return !1;
		const e = (t * y + n * x) / a, s = (-t * x + n * y) / l, h = Math.atan2(s, e);
		if (!d(h)) return !1;
		let u = h - b;
		if (u = f >= 0 ? (u % M + M) % M : -(-u % M + M) % M, u > Math.PI && (u -= M), u < -Math.PI && (u += M), Math.abs(u) * m(b + u / 2) > Jc * Math.hypot(o.x - w.x, o.y - w.y) + 2 * r) return !1;
		b = h, w = o;
	}
	return !0;
}
const Jc = 1.5;
function ta(t, n, e) {
	const r = [t];
	let s = t;
	for (const o of n) {
		const t = Math.hypot(o.x1 - s.x, o.y1 - s.y) + Math.hypot(o.x2 - o.x1, o.y2 - o.y1) + Math.hypot(o.x - o.x2, o.y - o.y2), n = Math.max(4, Math.ceil(t / 1));
		for (let e = 1; e < n; e++) r.push(Wc(s, o, e / n));
		r.push({
			x: o.x,
			y: o.y
		}), s = {
			x: o.x,
			y: o.y
		};
	}
	const i = s, c = function(t) {
		const n = Zc(t);
		if (null !== n && n.r > 0) {
			const e = .15;
			if (t.every((t) => Math.abs(Math.hypot(t.x - n.cx, t.y - n.cy) - n.r) <= e)) return {
				cx: n.cx,
				cy: n.cy,
				rx: n.r,
				ry: n.r,
				angle: 0,
				tol: e
			};
		}
		const e = Vc(t);
		if (null !== e && e.rx > 0 && e.ry > 0) {
			const n = .15, r = Math.cos(e.angle), o = Math.sin(e.angle);
			if (t.every((t) => Kc(t.x - e.cx, t.y - e.cy, e.rx, e.ry, r, o) <= n)) return {
				cx: e.cx,
				cy: e.cy,
				rx: e.rx,
				ry: e.ry,
				angle: e.angle,
				tol: n
			};
		}
		return null;
	}(r);
	if (null === c) return na;
	const { cx: a, cy: l, tol: h } = c, u = r.map((t) => Math.atan2(t.y - l, t.x - a));
	let f = 0, y = 0;
	for (let o = 1; o < u.length; o++) {
		const t = Gc(u[o], u[o - 1]);
		if (Math.abs(t) > 1e-4) {
			const n = Math.sign(t);
			if (0 !== y && n !== y) return na;
			y = n;
		}
		f += t;
	}
	const x = Math.abs(f);
	if (x < .5 || x > 2 * Math.PI - .2) return na;
	const p = _c(e), M = (t) => Number(t.toFixed(p)), g = 10 ** -p, d = M(180 * c.angle / Math.PI), m = M(i.x), b = M(i.y), w = {
		x: M(t.x),
		y: M(t.y)
	};
	if (M(c.rx) <= 0 || M(c.ry) <= 0) return na;
	const A = [];
	for (let k = -ra; k <= ra; k++) {
		const t = M(c.rx + k * g), n = M(t * (c.ry / c.rx));
		if (!(t <= 0 || n <= 0)) for (const e of [!1, !0]) for (const r of [!1, !0]) {
			const s = {
				type: "A",
				rx: t,
				ry: n,
				rotation: d,
				largeArc: e,
				sweep: r,
				x: m,
				y: b
			}, i = o(w.x, w.y, s);
			null !== i && A.push({
				arc: s,
				miss: Math.hypot(i.cx - a, i.cy - l),
				step: k
			});
		}
	}
	for (const { arc: o } of A.toSorted(oa)) if (Hc(w, o, r, h)) return o;
	return ea;
}
const na = 0, ea = 1, ra = 4;
function oa(t, n) {
	return Math.round(1e3 * t.miss) - Math.round(1e3 * n.miss) || Math.abs(t.step) - Math.abs(n.step);
}
function sa(t, n) {
	const e = [];
	let r = 0, o = 0, s = 0, i = 0, c = null;
	const a = () => {
		if (null !== c) {
			if (c.cubics.length >= 2) for (const t of function(t, n, e) {
				const r = [];
				let o = t, s = 0;
				for (; s < n.length;) {
					let t = null, i = 0;
					for (let r = 2; s + r <= n.length; r++) {
						const c = ta(o, n.slice(s, s + r), e);
						if (c === na) break;
						c !== ea && (t = c, i = r);
					}
					if (null !== t) {
						r.push(t);
						const e = n[s + i - 1];
						o = {
							x: e.x,
							y: e.y
						}, s += i;
					} else r.push(n[s]), o = {
						x: n[s].x,
						y: n[s].y
					}, s++;
				}
				return r;
			}(c.start, c.cubics, n)) e.push(t);
			else for (const t of c.cubics) e.push(t);
			c = null;
		}
	};
	for (const l of t) if ("C" !== l.type) switch (a(), e.push(l), l.type) {
		case "M":
			r = l.x, o = l.y, s = l.x, i = l.y;
			break;
		case "L":
		case "Q":
		case "A":
			r = l.x, o = l.y;
			break;
		case "Z": r = s, o = i;
	}
	else null === c && (c = {
		start: {
			x: r,
			y: o
		},
		cubics: []
	}), c.cubics.push(l), r = l.x, o = l.y;
	return a(), e;
}
const ia = [
	1,
	10,
	100,
	1e3,
	1e4
], ca = [
	"",
	"0",
	"00",
	"000",
	"0000"
], aa = 0x38d7ea4c68000;
function la(t) {
	if (t < 10) return 1;
	if (t < 100) return 2;
	if (t < 1e3) return 3;
	if (t < 1e4) return 4;
	if (t < 1e5) return 5;
	if (t < 1e6) return 6;
	if (t < 1e7) return 7;
	let n = 8;
	for (let e = 1e8; t >= e; e *= 10) n++;
	return n;
}
function ha(t, n) {
	const e = t < 0;
	let r = String(Math.abs(t));
	r.length <= n && (r = "0".repeat(n - r.length + 1) + r);
	const o = r.length - n, s = r.slice(0, o);
	let i = r.length;
	for (; i > o && 48 === r.charCodeAt(i - 1);) i--;
	const c = i > o ? `${s}.${r.slice(o, i)}` : s;
	return e && "0" !== c ? `-${c}` : c;
}
function ua(t, n) {
	if (0 === n) return String(0 | t);
	const e = t < 0 ? -t : t;
	if (!(e <= aa && Number.isInteger(e))) return ha(t, n);
	const r = ia[n], o = e % r, s = (e - o) / r;
	if (0 === o) return t < 0 ? `-${s}` : `${s}`;
	let i = o, c = n;
	for (; i % 10 == 0;) i /= 10, c--;
	const a = `${ca[c - la(i)]}${i}`;
	return t < 0 ? `-${s}.${a}` : `${s}.${a}`;
}
function fa(t, n) {
	if (0 === n) {
		const n = 0 | t;
		return la(n < 0 ? -n : n);
	}
	const e = t < 0 ? -t : t;
	if (!(e <= aa && Number.isInteger(e))) {
		const e = ha(t, n);
		return 45 === e.charCodeAt(0) ? e.length - 1 : e.length;
	}
	const r = ia[n], o = e % r, s = (e - o) / r;
	if (0 === o) return la(s);
	let i = o, c = n;
	for (; i % 10 == 0;) i /= 10, c--;
	return la(s) + 1 + c;
}
function ya(t, n, e) {
	const r = t * e, o = Math.round(r);
	return Math.abs(r - o) < .5 - (2e-16 * Math.abs(r) + 1e-9) ? o : Math.round(Number(t.toFixed(n)) * e);
}
function xa(t, n) {
	const e = ua(t, n);
	return e.startsWith("0.") ? e.slice(1) : e.startsWith("-0.") ? `-${e.slice(2)}` : e;
}
function pa(t) {
	return "Z" === t.type ? 0 : t.x;
}
function Ma(t) {
	return "Z" === t.type ? 0 : t.y;
}
const ga = (t) => "L" === t.type, da = (t) => "C" === t.type, ma = (t) => "L" === t.type || "C" === t.type;
function ba(t, n, e) {
	return Math.abs(t - n) * Math.abs(Math.sin(e * Math.PI / 180)) <= .0375;
}
function wa(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, i = 3 * r * e * e, c = e * e * e;
	return {
		x: o * t.x + s * n.x1 + i * n.x2 + c * n.x,
		y: o * t.y + s * n.y1 + i * n.y2 + c * n.y
	};
}
function Aa(t, n, e, r) {
	const o = t.length;
	let s = 0;
	for (let c = 0; c < o; c++) {
		const e = c + 1 === o ? 0 : c + 1;
		s += t[c] * n[e] - t[e] * n[c];
	}
	const i = 4 * e * r - Math.abs(s) / 2;
	return Math.min(Math.sqrt(Math.max(i, 0) / (4 - Math.PI)), e, r);
}
function ka(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function Fa(t, n, e, r, o, s) {
	const i = o - e, c = s - r, a = i * i + c * c;
	let l = a > 0 ? ((t - e) * i + (n - r) * c) / a : 0;
	return l = l < 0 ? 0 : l > 1 ? 1 : l, Math.hypot(t - (e + l * i), n - (r + l * c));
}
const va = (t) => (t * (t - 1) >> 1) - 3;
function Na(t, n) {
	const e = _c(n), r = (t) => Number(t.toFixed(e));
	return "polygon" === t.kind ? {
		kind: "polygon",
		points: t.points.map((t) => ({
			x: r(t.x),
			y: r(t.y)
		}))
	} : "rect" === t.kind ? {
		kind: "rect",
		x: r(t.x),
		y: r(t.y),
		width: r(t.width),
		height: r(t.height)
	} : "rrect" === t.kind ? {
		kind: "rrect",
		x: r(t.x),
		y: r(t.y),
		width: r(t.width),
		height: r(t.height),
		r: r(t.r)
	} : "circle" === t.kind ? {
		kind: "circle",
		cx: r(t.cx),
		cy: r(t.cy),
		r: r(t.r)
	} : {
		kind: "ellipse",
		cx: r(t.cx),
		cy: r(t.cy),
		rx: r(t.rx),
		ry: r(t.ry),
		...void 0 !== t.angle ? { angle: r(t.angle) } : {}
	};
}
function Ia(t, n, e) {
	const r = function(t) {
		if (t.length < 2 || "M" !== t[0].type) return null;
		const n = {
			x: t[0].x,
			y: t[0].y
		}, e = [];
		let r = !1;
		for (let o = 1; o < t.length; o++) {
			const n = t[o];
			if ("M" === n.type) return null;
			if ("Z" === n.type) {
				if (r = !0, o !== t.length - 1) return null;
				break;
			}
			e.push(n);
		}
		return r ? {
			start: n,
			ops: e
		} : null;
	}(t);
	if (!r) return null;
	const s = r.ops;
	if (s.every(ga)) {
		const t = function(t, n, e) {
			const r = function(t, n, e) {
				const r = [t];
				for (const i of n) r.push({
					x: i.x,
					y: i.y
				});
				const o = r[0], s = r[r.length - 1];
				return r.length > 1 && Math.round(o.x * e) === Math.round(s.x * e) && Math.round(o.y * e) === Math.round(s.y * e) && r.pop(), r;
			}(t, n, e);
			if (4 !== r.length) return null;
			const o = r.map((t) => Math.round(t.x * e)), s = r.map((t) => Math.round(t.y * e)), i = Math.min(...o), c = Math.max(...o), a = Math.min(...s), l = Math.max(...s);
			if (c === i || l === a) return null;
			for (let h = 0; h < 4; h++) {
				if (o[h] !== i && o[h] !== c || s[h] !== a && s[h] !== l) return null;
				const t = (h + 1) % 4;
				if (o[h] !== o[t] && s[h] !== s[t]) return null;
			}
			return 4 !== new Set(o.map((t, n) => `${t},${s[n]}`)).size ? null : {
				kind: "rect",
				x: i / e,
				y: a / e,
				width: (c - i) / e,
				height: (l - a) / e
			};
		}(r.start, s, 10 ** _c(n));
		if (t) return t;
	}
	if (!e) return null;
	if (s.length >= 3 && s.every(da)) {
		const t = function(t, n, e) {
			const r = [t];
			let o = t;
			for (const c of n) {
				const t = Math.hypot(c.x1 - o.x, c.y1 - o.y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2), n = Math.max(4, Math.ceil(t / 1));
				for (let e = 1; e < n; e++) r.push(wa(o, c, e / n));
				r.push({
					x: c.x,
					y: c.y
				}), o = {
					x: c.x,
					y: c.y
				};
			}
			const s = Zc(r);
			if (s && s.r > 0) {
				const t = .15;
				if (r.every((n) => Math.abs(Math.hypot(n.x - s.cx, n.y - s.cy) - s.r) <= t)) return Na({
					kind: "circle",
					cx: s.cx,
					cy: s.cy,
					r: s.r
				}, e);
			}
			const i = Vc(r);
			if (i && i.rx > 0 && i.ry > 0) {
				const t = Math.cos(i.angle), n = Math.sin(i.angle);
				if (r.every((e) => Kc(e.x - i.cx, e.y - i.cy, i.rx, i.ry, t, n) <= .15)) {
					const t = 180 * i.angle / Math.PI, n = ba(i.rx, i.ry, t) ? void 0 : t;
					return Na({
						kind: "ellipse",
						cx: i.cx,
						cy: i.cy,
						rx: i.rx,
						ry: i.ry,
						...void 0 !== n ? { angle: n } : {}
					}, e);
				}
			}
			return null;
		}(r.start, s, n);
		if (t) return t;
	}
	if (s.length >= 4 && s.some(da) && s.every(ma)) {
		const t = function(t, n, e) {
			const { sx: r, sy: o } = function(t, n) {
				const e = [t.x], r = [t.y], o = (t, n, o, s) => {
					const i = Math.max(2, Math.ceil(Math.hypot(o - t, s - n) / 1));
					for (let c = 1; c <= i; c++) e.push(t + (o - t) * c / i), r.push(n + (s - n) * c / i);
				};
				let s = t;
				for (const i of n) {
					if ("C" === i.type) {
						const t = Math.hypot(i.x1 - s.x, i.y1 - s.y) + Math.hypot(i.x2 - i.x1, i.y2 - i.y1) + Math.hypot(i.x - i.x2, i.y - i.y2), n = Math.max(4, Math.ceil(t / 1));
						for (let o = 1; o < n; o++) {
							const t = wa(s, i, o / n);
							e.push(t.x), r.push(t.y);
						}
						e.push(i.x), r.push(i.y);
					} else o(s.x, s.y, i.x, i.y);
					s = {
						x: i.x,
						y: i.y
					};
				}
				return s.x === t.x && s.y === t.y || (o(s.x, s.y, t.x, t.y), e.pop(), r.pop()), {
					sx: Float64Array.from(e),
					sy: Float64Array.from(r)
				};
			}(t, n), s = r.length;
			let i = 1 / 0, c = -1 / 0, a = 1 / 0, l = -1 / 0;
			for (let g = 0; g < s; g++) r[g] < i && (i = r[g]), r[g] > c && (c = r[g]), o[g] < a && (a = o[g]), o[g] > l && (l = o[g]);
			const h = (i + c) / 2, u = (a + l) / 2, f = (c - i) / 2, y = (l - a) / 2;
			if (f <= 0 || y <= 0) return null;
			const x = .3, p = .3 * (Math.min(f, y) + x) + .6;
			for (let g = 0; g < s; g++) if (Math.min(f - Math.abs(r[g] - h), y - Math.abs(o[g] - u)) > p) return null;
			const M = function(t, n, e) {
				let r = Bc(e), o = Dc(t, n, r), s = .001;
				const i = Array.from({ length: 5 }, () => new Array(5).fill(0)), c = new Array(5).fill(0), a = new Array(5).fill(0);
				for (let l = 0; l < 50 && o > 0; l++) {
					for (let t = 0; t < 5; t++) c[t] = 0, i[t].fill(0);
					for (let o = 0; o < t.length; o++) {
						const e = t[o] - r.cx, s = n[o] - r.cy, l = e >= 0 ? 1 : -1, h = s >= 0 ? 1 : -1, u = Math.abs(e) - (r.hx - r.r), f = Math.abs(s) - (r.hy - r.r);
						let y;
						if (a.fill(0), u > 0 && f > 0) {
							const t = Math.hypot(u, f), n = u / t, e = f / t;
							y = t - r.r, a[0] = -l * n, a[1] = -h * e, a[2] = -n, a[3] = -e, a[4] = n + e - 1;
						} else u >= f ? (y = Math.abs(e) - r.hx, a[0] = -l, a[2] = -1) : (y = Math.abs(s) - r.hy, a[1] = -h, a[3] = -1);
						for (let t = 0; t < 5; t++) if (0 !== a[t]) {
							c[t] += a[t] * y;
							for (let n = 0; n < 5; n++) i[t][n] += a[t] * a[n];
						}
					}
					let e = 0;
					for (let t = 0; t < 5; t++) e += i[t][t];
					const l = 1e-9 * e + 1e-12;
					let h = !1;
					for (; s < 0xe8d4a51000;) {
						const e = Rc(i.map((t, n) => t.map((t, e) => n === e ? t + s * Math.max(t, l) : t)), c.map((t) => -t));
						if (e) {
							const i = Bc({
								cx: r.cx + e[0],
								cy: r.cy + e[1],
								hx: r.hx + e[2],
								hy: r.hy + e[3],
								r: r.r + e[4]
							}), c = Dc(t, n, i);
							if (c < o) {
								h = !0;
								const t = o - c;
								if (r = i, o = c, s = Math.max(s / 10, 1e-12), t <= 1e-12 * (o + t)) return r;
								break;
							}
						}
						s *= 10;
					}
					if (!h) break;
				}
				return r;
			}(r, o, {
				cx: h,
				cy: u,
				hx: f,
				hy: y,
				r: Aa(r, o, f, y)
			});
			for (let g = 0; g < s; g++) if (Math.abs(Yc(r[g], o[g], M.cx, M.cy, M.hx, M.hy, M.r)) > x) return null;
			return M.r < x ? null : function(t, n, e, r, o, s, i) {
				const c = t.length;
				let a = 0;
				const l = (e, r) => {
					for (let o = 0; o < c; o++) {
						const s = ((a + (o % 2 == 1 ? (o + 1) / 2 : -o / 2)) % c + c) % c, i = s + 1 === c ? 0 : s + 1;
						if (Fa(e, r, t[s], n[s], t[i], n[i]) <= .3) return a = s, !0;
					}
					return !1;
				}, h = o - i, u = s - i, f = [
					[
						e + h,
						r - u,
						-Math.PI / 2
					],
					[
						e + h,
						r + u,
						0
					],
					[
						e - h,
						r + u,
						Math.PI / 2
					],
					[
						e - h,
						r - u,
						Math.PI
					]
				], y = Math.max(2, Math.ceil(.5 * Math.PI * i / .5));
				for (let x = 0; x < 4; x++) {
					const [t, n, e] = f[x];
					for (let f = 0; f < y; f++) {
						const r = e + .5 * Math.PI * f / y;
						if (!l(t + i * Math.cos(r), n + i * Math.sin(r))) return !1;
					}
					const r = e + .5 * Math.PI, o = t + i * Math.cos(r), s = n + i * Math.sin(r), [c, a, h] = f[(x + 1) % 4], u = c + i * Math.cos(h), p = a + i * Math.sin(h), M = Math.max(1, Math.ceil(Math.hypot(u - o, p - s) / .5));
					for (let i = 0; i < M; i++) if (!l(o + (u - o) * i / M, s + (p - s) * i / M)) return !1;
				}
				return !0;
			}(r, o, M.cx, M.cy, M.hx, M.hy, M.r) ? Na({
				kind: "rrect",
				x: M.cx - M.hx,
				y: M.cy - M.hy,
				width: 2 * M.hx,
				height: 2 * M.hy,
				r: M.r
			}, e) : null;
		}(r.start, s, n);
		if (t) return t;
	}
	return s.length < 3 ? null : function(t, n, e) {
		const r = [], s = [];
		(function(t, n, e, r) {
			let s = t.x, i = t.y;
			for (const c of n) {
				if ("A" === c.type) {
					const t = o(s, i, c);
					if (null === t) e.push(s), r.push(i);
					else {
						const n = Math.cos(t.phi), o = Math.sin(t.phi), s = Math.abs(t.dTheta) * Math.max(t.rx, t.ry), i = Math.max(2, Math.ceil(s / 1));
						for (let c = 0; c < i; c++) {
							const s = t.theta1 + t.dTheta * c / i, a = t.rx * Math.cos(s), l = t.ry * Math.sin(s);
							e.push(t.cx + n * a - o * l), r.push(t.cy + o * a + n * l);
						}
					}
					s = c.x, i = c.y;
					continue;
				}
				if ("C" === c.type) {
					for (let t = 0; t < 8; t++) {
						const n = t / 8, o = 1 - n, a = o * o * o, l = 3 * o * o * n, h = 3 * o * n * n, u = n * n * n;
						e.push(a * s + l * c.x1 + h * c.x2 + u * c.x), r.push(a * i + l * c.y1 + h * c.y2 + u * c.y);
					}
					s = c.x, i = c.y;
				} else if ("Q" === c.type) {
					for (let t = 0; t < 8; t++) {
						const n = t / 8, o = 1 - n;
						e.push(o * o * s + 2 * o * n * c.x1 + n * n * c.x), r.push(o * o * i + 2 * o * n * c.y1 + n * n * c.y);
					}
					s = c.x, i = c.y;
				} else if ("L" === c.type) {
					const t = Math.max(1, Math.round(Math.hypot(c.x - s, c.y - i) / 2));
					for (let n = 0; n < t; n++) e.push(s + (c.x - s) * n / t), r.push(i + (c.y - i) * n / t);
					s = c.x, i = c.y;
				}
			}
			if (Math.hypot(s - t.x, i - t.y) > 1e-6) {
				const n = Math.max(1, Math.round(Math.hypot(t.x - s, t.y - i) / 2));
				for (let o = 0; o < n; o++) e.push(s + (t.x - s) * o / n), r.push(i + (t.y - i) * o / n);
			}
		})(t, n, r, s);
		const i = r.length;
		if (i < 24) return null;
		let c = 0, a = 0, l = 0, h = 0, u = 0;
		for (let o = 0; o < i; o++) {
			const t = o + 1 < i ? o + 1 : 0, n = r[o] * s[t] - r[t] * s[o];
			l += n, h += (r[o] + r[t]) * n, u += (s[o] + s[t]) * n, c += r[o], a += s[o];
		}
		const f = Math.abs(l) < 1e-6, y = f ? c / i : h / (3 * l), x = f ? a / i : u / (3 * l), p = new Float64Array(i), M = new Float64Array(i);
		let g = -1 / 0, d = 1 / 0, m = -1 / 0, b = 1 / 0, w = -1 / 0;
		for (let o = 0; o < i; o++) p[o] = Math.hypot(r[o] - y, s[o] - x), M[o] = Math.atan2(s[o] - x, r[o] - y), g = Math.max(g, p[o]), d = Math.min(d, r[o]), m = Math.max(m, r[o]), b = Math.min(b, s[o]), w = Math.max(w, s[o]);
		if (g < 3) return null;
		const A = (t, n, e) => {
			let r = 1 / 0, o = -1 / 0, s = 1 / 0, i = -1 / 0;
			for (let a = 0; a < e; a++) t[a] < r && (r = t[a]), t[a] > o && (o = t[a]), n[a] < s && (s = n[a]), n[a] > i && (i = n[a]);
			const c = .6;
			return Math.abs(r - d) <= c && Math.abs(o - m) <= c && Math.abs(s - b) <= c && Math.abs(i - w) <= c;
		}, k = (t, n, e, o, c) => {
			let a = 0;
			for (let l = 0; l < i; l++) {
				const i = M[l];
				let h = !1;
				for (let t = 0; t < o; t++) if (Math.abs(ka(i, e[t])) < c) {
					h = !0;
					break;
				}
				if (h) continue;
				let u = 1 / 0;
				for (let e = 0; e < o && u > .3; e++) {
					const i = (e + 1) % o, c = Fa(r[l], s[l], t[e], n[e], t[i], n[i]);
					c < u && (u = c);
				}
				if (u > .3) return !1;
				a++;
			}
			return a >= o;
		};
		let F = 0;
		for (let o = 1; o < i; o++) p[o] > p[F] && (F = o);
		const v = M[F], N = /* @__PURE__ */ new Float64Array(75), I = /* @__PURE__ */ new Float64Array(75), P = /* @__PURE__ */ new Uint8Array(75), q = /* @__PURE__ */ new Uint8Array(75), L = /* @__PURE__ */ new Uint8Array(13), C = (t) => {
			if (1 === L[t]) return;
			L[t] = 1;
			const n = va(t), e = 2 * Math.PI / t, r = e / 5;
			for (let o = 0; o < t; o++) N[n + o] = -1 / 0, I[n + o] = 1 / 0;
			for (let o = 0; o < i; o++) {
				const s = M[o], i = (s - v) / e, c = Math.floor(i), a = i - c;
				if (a < .200000001 || a > .799999999) {
					let i = (0 | (a < .5 ? c : c + 1)) % t;
					i < 0 && (i += t), Math.abs(ka(s, v + i * e)) <= r && (P[n + i] = 1, p[o] > N[n + i] && (N[n + i] = p[o]));
				} else if (a > .29999999899999996 && a < .700000001) {
					let i = (0 | c) % t;
					i < 0 && (i += t), Math.abs(ka(s, v + (i + .5) * e)) <= r && (q[n + i] = 1, p[o] < I[n + i] && (I[n + i] = p[o]));
				}
			}
		}, $ = (t) => {
			const n = va(t);
			for (let e = 0; e < t; e++) if (0 === P[n + e] || 0 === q[n + e]) return !1;
			return !0;
		}, S = /* @__PURE__ */ new Float64Array(24), E = /* @__PURE__ */ new Float64Array(24), U = /* @__PURE__ */ new Float64Array(24), O = (t) => {
			const n = [];
			for (let e = 0; e < t; e++) n.push({
				x: S[e],
				y: E[e]
			});
			return n;
		};
		for (let o = 3; o <= 12; o++) {
			if (C(o), !$(o)) continue;
			const t = va(o), n = 2 * Math.PI / o;
			let r = 0;
			for (let e = 0; e < o; e++) r += I[t + e];
			const s = r / o / Math.cos(Math.PI / o);
			for (let e = 0; e < o; e++) {
				const t = v + e * n;
				U[e] = t, S[e] = y + s * Math.cos(t), E[e] = x + s * Math.sin(t);
			}
			if (4 === o) {
				const t = Math.atan2(Math.abs(E[1] - E[0]), Math.abs(S[1] - S[0]));
				if (t < Math.PI / 12 || t > Math.PI / 2 - Math.PI / 12) continue;
			}
			if (A(S, E, o) && k(S, E, U, o, .18 * n)) return Na({
				kind: "polygon",
				points: O(o)
			}, e);
		}
		for (let o = 3; o <= 12; o++) {
			if (C(o), !$(o)) continue;
			const t = va(o), n = 2 * Math.PI / o;
			let r = 0, s = 0;
			for (let e = 0; e < o; e++) r += N[t + e], s += I[t + e];
			const i = r / o, c = s / o;
			if (!(c >= i * Math.cos(Math.PI / o) - .3)) {
				for (let t = 0; t < 2 * o; t++) {
					const e = v + t * n / 2;
					U[t] = e;
					const r = t % 2 == 0 ? i : c;
					S[t] = y + r * Math.cos(e), E[t] = x + r * Math.sin(e);
				}
				if (A(S, E, 2 * o) && k(S, E, U, 2 * o, .09 * n)) return Na({
					kind: "polygon",
					points: O(2 * o)
				}, e);
			}
		}
		return null;
	}(r.start, s, n);
}
const Pa = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function qa(t, n) {
	if (t.includes("<") || t.includes("\"")) throw new Error(`unsafe ${n} in SVG output: ${JSON.stringify(t)}`);
	return t;
}
function La(t, n, e) {
	let r = "";
	var o;
	return r += ` fill="${void 0 === t.fill ? "none" : qa(t.fill, "fill")}"`, void 0 !== t.fillOpacity && t.fillOpacity < 1 && (r += ` fill-opacity="${Qc(t.fillOpacity, 3)}"`), e && void 0 !== t.fillRule && (r += ` fill-rule="${t.fillRule}"`), void 0 !== t.stroke && (r += ` stroke="${qa(t.stroke, "stroke")}"`), void 0 !== t.strokeWidth && (r += ` stroke-width="${Qc(t.strokeWidth, n)}"`), void 0 !== t.strokeLinecap && (r += ` stroke-linecap="${t.strokeLinecap}"`), void 0 !== t.strokeLinejoin && (r += ` stroke-linejoin="${t.strokeLinejoin}"`), void 0 !== t.id && "" !== t.id && (r += ` id="${o = t.id, o.replace(/[&<>"']/g, (t) => Pa[t])}"`), r;
}
function Ca(t, n, e, r, o) {
	const s = (t) => Number(Qc(t, o)), i = s(t), c = s(n);
	return [
		Qc(i, o),
		Qc(c, o),
		Qc(s(t + e) - i, o),
		Qc(s(n + r) - c, o)
	];
}
function $a(t, n, e) {
	const r = La(n, e, !1), o = (t) => Qc(t, e);
	switch (t.kind) {
		case "rect": {
			const [n, o, s, i] = Ca(t.x, t.y, t.width, t.height, e);
			return `<rect x="${n}" y="${o}" width="${s}" height="${i}"${r}/>`;
		}
		case "rrect": {
			const [n, s, i, c] = Ca(t.x, t.y, t.width, t.height, e);
			return `<rect x="${n}" y="${s}" width="${i}" height="${c}" rx="${o(t.r)}"${r}/>`;
		}
		case "circle": return `<circle cx="${o(t.cx)}" cy="${o(t.cy)}" r="${o(t.r)}"${r}/>`;
		case "ellipse": {
			const n = void 0 === t.angle || ba(t.rx, t.ry, t.angle) ? "" : ` transform="rotate(${o(t.angle)} ${o(t.cx)} ${o(t.cy)})"`;
			return `<ellipse cx="${o(t.cx)}" cy="${o(t.cy)}" rx="${o(t.rx)}" ry="${o(t.ry)}"${n}${r}/>`;
		}
		case "polygon": return `<polygon points="${t.points.map((t) => `${o(t.x)},${o(t.y)}`).join(" ")}"${r}/>`;
	}
}
function Sa(t, n, e, r, o = !1) {
	if (0 === t.commands.length) return null;
	if (void 0 === t.fill && void 0 === t.stroke) return null;
	if (e) {
		const e = t.strokedPrimitive;
		if (void 0 !== e && void 0 === t.stroke && void 0 !== t.fill && t.fill.startsWith("#") && (void 0 === t.fillOpacity || t.fillOpacity >= 1)) {
			const r = {
				commands: t.commands,
				fill: "none",
				stroke: t.fill,
				strokeWidth: e.width,
				...void 0 !== t.id ? { id: t.id } : {}
			};
			return {
				kind: "element",
				svg: $a(e.primitive, r, n)
			};
		}
		if (void 0 !== t.primitive && void 0 === t.stroke) return {
			kind: "element",
			svg: $a(t.primitive, t, n)
		};
		const s = function(t, n) {
			const e = 10 ** _c(n);
			return function(t) {
				const n = [];
				let e = null;
				for (const r of t) "M" === r.type ? (e && n.push(e), e = {
					start: {
						x: r.x,
						y: r.y
					},
					ops: [],
					closed: !1
				}) : "Z" === r.type ? e && (e.closed = !0) : e && e.ops.push(r);
				return e && n.push(e), n;
			}(t).flatMap((t) => function(t) {
				const n = [{
					type: "M",
					x: t.start.x,
					y: t.start.y
				}];
				for (const e of t.ops) n.push(e);
				return t.closed && n.push({ type: "Z" }), n;
			}(function(t, n) {
				const e = (t) => Math.round(t * n), r = [{
					x: t.start.x,
					y: t.start.y,
					edge: "M",
					op: null
				}];
				for (const i of t.ops) r.push({
					x: pa(i),
					y: Ma(i),
					edge: i.type,
					op: i
				});
				const o = r.slice(0, 1);
				for (let i = 1; i < r.length; i++) {
					let t = r[i];
					for (; o.length >= 2 && "L" === o[o.length - 1].edge && "L" === t.edge;) {
						const n = o[o.length - 2], r = o[o.length - 1], s = e(n.x), i = e(n.y), c = e(r.x), a = e(r.y), l = e(t.x), h = e(t.y), u = (c - s) * (l - s) + (a - i) * (h - i);
						if (!(0 === (c - s) * (h - i) - (a - i) * (l - s) && u >= 0 && u <= (l - s) * (l - s) + (h - i) * (h - i))) break;
						o.pop(), t = {
							x: t.x,
							y: t.y,
							edge: "L",
							op: {
								type: "L",
								x: t.x,
								y: t.y
							}
						};
					}
					o.push(t);
				}
				const s = [];
				for (let i = 1; i < o.length; i++) s.push(o[i].op);
				return {
					start: t.start,
					ops: s,
					closed: t.closed
				};
			}(t, e)));
		}(t.commands, n), i = Ia(s, n, r);
		if (null !== i) return {
			kind: "element",
			svg: $a(i, t, n)
		};
		const c = qa(function(t, n, e = !1) {
			const r = _c(n), o = ia[r], s = e ? xa : ua, i = e ? (t, n) => fa(t, n) - (0 !== t && t > -o && t < o ? 1 : 0) : fa;
			let c = 0, a = 0, l = 0, h = 0, u = !1, f = "";
			const y = /* @__PURE__ */ new Float64Array(6), x = /* @__PURE__ */ new Float64Array(6);
			let p = "", M = !1;
			const g = (t, n) => {
				const r = t.charCodeAt(0);
				e ? (n || 45 === r || 46 === r && M || (f += " "), M = t.includes(".")) : 45 !== r && (f += " "), f += t;
			}, d = (t, n, o, i) => {
				let c = !0;
				e ? t === p && "M" !== t && "m" !== t ? c = !1 : f += t : f += "" === f ? t : ` ${t}`, p = t;
				for (let e = o; e < o + i; e++) g(s(n[e], r), c), c = !1;
			}, m = (t, n, e, o) => {
				d(t, y, 0, 3), f += ` ${e} ${o}`, M = !1;
				for (let i = 3; i < 5; i++) {
					const t = s(n[i], r);
					45 !== t.charCodeAt(0) && (f += " "), f += t, M = t.includes(".");
				}
			};
			for (const b of t) switch (b.type) {
				case "M": {
					const t = ya(b.x, r, o), n = ya(b.y, r, o);
					if (y[0] = t, y[1] = n, u) {
						x[0] = t - c, x[1] = n - a;
						const e = i(t, r) + i(n, r);
						i(x[0], r) + i(x[1], r) < e ? d("m", x, 0, 2) : d("M", y, 0, 2);
					} else d("M", y, 0, 2), u = !0;
					c = t, a = n, l = t, h = n;
					break;
				}
				case "L": {
					const t = ya(b.x, r, o), n = ya(b.y, r, o);
					y[0] = t, y[1] = n, x[0] = t - c, x[1] = n - a;
					let e = "L", s = y, l = 0, h = 2, u = i(t, r) + i(n, r) + 2;
					const f = i(x[0], r) + i(x[1], r) + 2;
					if (f < u && (u = f, e = "l", s = x), n === a) {
						const n = i(t, r) + 1;
						n < u && (u = n, e = "H", s = y, l = 0, h = 1);
						const o = i(x[0], r) + 1;
						o < u && (u = o, e = "h", s = x, l = 0, h = 1);
					}
					if (t === c) {
						const t = i(n, r) + 1;
						t < u && (u = t, e = "V", s = y, l = 1, h = 1);
						const o = i(x[1], r) + 1;
						o < u && (u = o, e = "v", s = x, l = 1, h = 1);
					}
					d(e, s, l, h), c = t, a = n;
					break;
				}
				case "Q": {
					y[0] = ya(b.x1, r, o), y[1] = ya(b.y1, r, o), y[2] = ya(b.x, r, o), y[3] = ya(b.y, r, o), x[0] = y[0] - c, x[1] = y[1] - a, x[2] = y[2] - c, x[3] = y[3] - a;
					let t = 0, n = 0;
					for (let e = 0; e < 4; e++) t += i(y[e], r), n += i(x[e], r);
					n < t ? d("q", x, 0, 4) : d("Q", y, 0, 4), c = y[2], a = y[3];
					break;
				}
				case "C": {
					y[0] = ya(b.x1, r, o), y[1] = ya(b.y1, r, o), y[2] = ya(b.x2, r, o), y[3] = ya(b.y2, r, o), y[4] = ya(b.x, r, o), y[5] = ya(b.y, r, o);
					for (let e = 0; e < 6; e += 2) x[e] = y[e] - c, x[e + 1] = y[e + 1] - a;
					let t = 0, n = 0;
					for (let e = 0; e < 6; e++) t += i(y[e], r), n += i(x[e], r);
					n < t ? d("c", x, 0, 6) : d("C", y, 0, 6), c = y[4], a = y[5];
					break;
				}
				case "A": {
					y[0] = ya(b.rx, r, o), y[1] = ya(b.ry, r, o), y[2] = ya(b.rotation, r, o), y[3] = ya(b.x, r, o), y[4] = ya(b.y, r, o), x[3] = y[3] - c, x[4] = y[4] - a;
					const t = i(y[3], r) + i(y[4], r);
					i(x[3], r) + i(x[4], r) < t ? m("a", x, b.largeArc ? 1 : 0, b.sweep ? 1 : 0) : m("A", y, b.largeArc ? 1 : 0, b.sweep ? 1 : 0), c = y[3], a = y[4];
					break;
				}
				case "Z": f += e || "" === f ? "Z" : " Z", p = "Z", M = !1, c = l, a = h;
			}
			return f;
		}(r ? sa(s, n) : s, n, o), "path data");
		return "" === c ? null : {
			kind: "path",
			d: c,
			paint: La(t, n, !0)
		};
	}
	const s = qa(function(t, n) {
		const e = _c(n);
		let r = "";
		const o = (t) => {
			"" !== r && 45 !== t.charCodeAt(0) && (r += " "), r += t;
		}, s = (t) => {
			o(Qc(t, e));
		};
		for (const i of t) switch (i.type) {
			case "M":
			case "L":
				o(i.type), s(i.x), s(i.y);
				break;
			case "Q":
				o("Q"), s(i.x1), s(i.y1), s(i.x), s(i.y);
				break;
			case "C":
				o("C"), s(i.x1), s(i.y1), s(i.x2), s(i.y2), s(i.x), s(i.y);
				break;
			case "A":
				o("A"), s(i.rx), s(i.ry), s(i.rotation), o(i.largeArc ? "1" : "0"), o(i.sweep ? "1" : "0"), s(i.x), s(i.y);
				break;
			case "Z": o("Z");
		}
		return r;
	}(t.commands, n), "path data");
	return "" === s ? null : {
		kind: "element",
		svg: `<path d="${s}"${La(t, n, !0)}/>`
	};
}
function Ea(t) {
	return [t.data.buffer, t.offsets.buffer];
}
function Ua(t, n) {
	const e = t.offsets[n], r = t.offsets[n + 1], o = new Array(r - e);
	for (let s = e; s < r; s++) o[s - e] = t.data[s];
	return o;
}
function Oa(t) {
	return t.offsets.length - 1;
}
function za(t) {
	switch (t.type) {
		case "M":
		case "L": return 3;
		case "Q": return 5;
		case "C": return 7;
		case "A": return 8;
		case "Z": return 1;
	}
}
function Ta(t, n, e) {
	switch (e.type) {
		case "M": return t[n] = 0, t[n + 1] = e.x, t[n + 2] = e.y, n + 3;
		case "L": return t[n] = 1, t[n + 1] = e.x, t[n + 2] = e.y, n + 3;
		case "Q": return t[n] = 2, t[n + 1] = e.x1, t[n + 2] = e.y1, t[n + 3] = e.x, t[n + 4] = e.y, n + 5;
		case "C": return t[n] = 3, t[n + 1] = e.x1, t[n + 2] = e.y1, t[n + 3] = e.x2, t[n + 4] = e.y2, t[n + 5] = e.x, t[n + 6] = e.y, n + 7;
		case "A": return t[n] = 4, t[n + 1] = e.rx, t[n + 2] = e.ry, t[n + 3] = e.rotation, t[n + 4] = e.largeArc ? 1 : 0, t[n + 5] = e.sweep ? 1 : 0, t[n + 6] = e.x, t[n + 7] = e.y, n + 8;
		case "Z": return t[n] = 5, n + 1;
	}
}
function ja(t) {
	const n = new Int32Array(t.length + 1);
	let e = 0;
	for (let s = 0; s < t.length; s++) {
		for (const n of t[s]) e += za(n);
		n[s + 1] = e;
	}
	const r = new Float64Array(e);
	let o = 0;
	for (const s of t) for (const t of s) o = Ta(r, o, t);
	return {
		data: r,
		offsets: n
	};
}
function Xa(t) {
	const n = new Float64Array(12 * t.length);
	for (let e = 0; e < t.length; e++) {
		const r = t[e], o = 12 * e;
		n[o] = r.x0, n[o + 1] = r.y0, n[o + 2] = r.closed ? 1 : 0, n[o + 3] = r.params, n[o + 4] = r.chi2;
		const s = r.primitive;
		if (void 0 !== s) switch (s.kind) {
			case "circle":
				n.set([
					1,
					s.cx,
					s.cy,
					s.r
				], o + 5);
				break;
			case "ellipse":
				n.set([
					2,
					s.cx,
					s.cy,
					s.rx,
					s.ry,
					s.rotation
				], o + 5);
				break;
			case "rect": n.set([
				3,
				s.cx,
				s.cy,
				s.w,
				s.h,
				s.r,
				s.rotation
			], o + 5);
		}
	}
	return {
		commands: ja(t.map((t) => t.segments)),
		records: n
	};
}
function Ra(t, n, e) {
	const r = t.length;
	let o = -1;
	for (let c = 0; c < r; c++) if (t[c] !== n) {
		o = c;
		break;
	}
	if (o < 0) return;
	const s = 1 === n ? 0 : 1;
	let i = 0;
	for (; i < r;) {
		const c = (o + i) % r;
		if (t[c] !== n) {
			i++;
			continue;
		}
		let a = 0;
		for (; a < r && t[(c + a) % r] === n;) a++;
		if (a < e) for (let n = 0; n < a; n++) t[(c + n) % r] = s;
		i += a;
	}
}
function Za(t) {
	let n = null, r = null, o = null, c = null, a = null, l = null;
	const h = /* @__PURE__ */ new Set(), u = (n, e) => t.postMessage(n, e);
	function f(t) {
		if (("trace-layers" === t.kind ? r?.msg.key : "trace-rings" === t.kind ? o?.msg.key : "fit-edges" === t.kind ? a?.key : "fit-bands" === t.kind ? l?.batch?.key : c?.key) !== t.stateKey) throw new Error(`helper: ${t.kind} payload ${t.stateKey} was replaced`);
	}
	function y(t, e, c, a) {
		if (e.cutout) return { shapes: x(e.cutout, c) };
		const l = e.curve;
		if (!l) throw new Error(`helper: no curve options for ${t.kind}`);
		const h = !0 === t.meta?.[a]?.translucent, u = "trace-layers" === t.kind ? function(t, e, o, c) {
			const a = r;
			if (!a) throw new Error("helper: no stacked plan for trace-layers");
			const l = "pixel" !== t.curveMode;
			let h = a.layers.get(e);
			if (!h || l && !h.polygons) {
				const r = function(t, n) {
					const { width: e, height: r, turnPolicy: o } = t.msg, s = Math.max(1, t.msg.minArea), i = t.mask.data;
					if (i.fill(0), n >= t.order.length) {
						const e = n - t.order.length;
						for (let n = t.islandOffsets[e]; n < t.islandOffsets[e + 1]; n++) i[t.islandPixels[n]] = 1;
						return nn(t.mask, o, s);
					}
					(function(t, n) {
						if (n < t.unionLayer) {
							for (let e = 0; e < t.labels.length; e++) {
								const r = t.labels[e];
								t.union[e] = r >= 0 && t.position[r] >= n ? 1 : 0;
							}
							t.unionLayer = n;
						} else {
							for (let e = t.unionLayer; e < n; e++) {
								const n = t.order[e];
								for (let e = t.offset[n]; e < t.offset[n + 1]; e++) t.union[t.bucket[e]] = 0;
							}
							t.unionLayer = n;
						}
					})(t, n);
					const c = t.order[n], a = t.union, l = t.flood, h = e * r;
					let u = 0;
					for (let f = t.offset[c]; f < t.offset[c + 1]; f++) {
						const n = t.bucket[f];
						0 === i[n] && (i[n] = 1, l[u++] = n);
					}
					for (; u > 0;) {
						const t = l[--u], n = t - (t / e | 0) * e;
						n > 0 && 1 === a[t - 1] && 0 === i[t - 1] && (i[t - 1] = 1, l[u++] = t - 1), n < e - 1 && 1 === a[t + 1] && 0 === i[t + 1] && (i[t + 1] = 1, l[u++] = t + 1), t >= e && 1 === a[t - e] && 0 === i[t - e] && (i[t - e] = 1, l[u++] = t - e), t < h - e && 1 === a[t + e] && 0 === i[t + e] && (i[t + e] = 1, l[u++] = t + e);
					}
					return nn(t.mask, o, s);
				}(a, e);
				if (h = { paths: r }, l) {
					const l = o ? function(t, e, r, o) {
						const c = e - t.order.length, a = n;
						if (!a) throw new Error("helper: no working image");
						return function(t) {
							const { width: n, height: e, mask: r, labels: o, pixels: c, paletteRgb: a, label: l, alpha: h } = t, u = h?.data, f = (t, n, e, r) => {
								const o = kn(c, 4 * t, a, 3 * n, 3 * e);
								return o < 0 ? r : o - .5;
							}, y = (t, n) => {
								if (void 0 === u) return n;
								const e = u[t];
								return e < xn ? e : n;
							}, x = (t, o, s, i) => o > 0 && r[t - 1] === i ? t - 1 : o < n - 1 && r[t + 1] === i ? t + 1 : s > 0 && r[t - n] === i ? t - n : s < e - 1 && r[t + n] === i ? t + n : -1;
							let p = -1;
							const M = () => (p < 0 && (p = function(t, n, e) {
								let r = An.get(t);
								if (void 0 === r) {
									const o = new Float32Array(n * e);
									for (let n = 0, e = 0; n < o.length; n++, e += 4) {
										const r = t[e + 3] / 255, s = (.2126 * t[e] + .7152 * t[e + 1] + .0722 * t[e + 2]) / 255;
										o[n] = s * r + 1 - r;
									}
									r = function(t, n, e) {
										if (n < 3 || e < 3 || t.length < n * e) return 1 / 255;
										const r = new Float32Array((n - 2) * (e - 2));
										let o = 0;
										for (let s = 1; s < e - 1; s++) for (let e = 1; e < n - 1; e++) {
											const i = s * n + e;
											r[o++] = Math.abs(4 * t[i] - t[i - 1] - t[i + 1] - t[i - n] - t[i + n]);
										}
										const c = function(t, n) {
											let e = 0, r = t.length - 1;
											for (; e < r;) {
												const o = t[e], s = t[e + r >>> 1], i = t[r], c = o < s ? s < i ? s : o < i ? i : o : o < i ? o : s < i ? i : s;
												let a = e, l = r;
												for (; a <= l;) {
													for (; t[a] < c;) a++;
													for (; t[l] > c;) l--;
													if (a <= l) {
														const n = t[a];
														t[a] = t[l], t[l] = n, a++, l--;
													}
												}
												if (n <= l) r = l;
												else {
													if (!(n >= a)) return t[n];
													e = a;
												}
											}
											return t[n];
										}(r, Math.floor(.1 * r.length));
										let a = 0;
										for (const s of i) a += s * s;
										return Math.max(c / .12566 / Math.sqrt(a), s);
									}(o, n, e), An.set(t, r);
								}
								return r;
							}(c, n, e)), p), g = (t, n) => {
								const e = a[3 * t] - a[3 * n], r = a[3 * t + 1] - a[3 * n + 1], o = a[3 * t + 2] - a[3 * n + 2], s = e * e + r * r + o * o;
								return s < 1 ? NaN : 255 * M() / Math.sqrt(s);
							}, d = (t) => void 0 !== u && u[t] < xn ? M() : NaN;
							return {
								width: n,
								height: e,
								at(t, e) {
									const s = e * n + t, i = o[s];
									if (0 !== r[s]) {
										const n = x(s, t, e, 0);
										if (n >= 0 && o[n] >= 0) {
											const t = l >= 0 ? l : i;
											return t < 0 ? .5 : f(s, t, o[n], .5);
										}
										return y(s, .5);
									}
									if (i < 0) return y(s, -.5);
									const c = x(s, t, e, 1);
									if (c < 0) return -.5;
									const a = l >= 0 ? l : o[c];
									return a < 0 ? -.5 : f(s, a, i, -.5);
								},
								along(t, e, s, i) {
									const h = i * n + s, u = o[h];
									let f, y;
									if (0 !== r[h]) {
										const t = x(h, s, i, 0);
										if (t < 0 || o[t] < 0) return NaN;
										f = l >= 0 ? l : u, y = o[t];
									} else {
										if (u < 0) return NaN;
										const t = x(h, s, i, 1);
										if (t < 0) return NaN;
										f = l >= 0 ? l : o[t], y = u;
									}
									if (f < 0) return NaN;
									const p = kn(c, 4 * (e * n + t), a, 3 * f, 3 * y);
									return p < 0 ? NaN : p - .5;
								},
								uncertainty(t, e) {
									const s = e * n + t, i = o[s];
									if (0 !== r[s]) {
										const n = x(s, t, e, 0);
										if (n >= 0 && o[n] >= 0) {
											const t = l >= 0 ? l : i;
											return t < 0 ? NaN : g(t, o[n]);
										}
										return d(s);
									}
									if (i < 0) return d(s);
									const c = x(s, t, e, 1);
									if (c < 0) return NaN;
									const a = l >= 0 ? l : o[c];
									return a < 0 ? NaN : g(a, i);
								}
							};
						}({
							width: t.msg.width,
							height: t.msg.height,
							mask: t.mask.data,
							labels: t.labels,
							pixels: a.image.data,
							paletteRgb: r.paletteRgb,
							label: c >= 0 ? t.islandLabels[c] : -1,
							alpha: o ? void 0 : r.alpha
						});
					}(a, e, o, c) : void 0, u = void 0 !== l && e < a.order.length;
					h.polygons = r.map((n) => ss(n.points, l, u ? function(t, n, e, r, o, s, i, c = 1) {
						const a = t.length >> 1, l = 1 * c, h = Math.max(1, Math.round(3 * c)), u = Math.max(1, Math.round(4 * c)), f = Math.max(1, Math.round(2 * c) - 1), y = new Uint8Array(a), x = new Int8Array(a);
						let p = !1;
						const M = (t, n) => t >= 0 && n >= 0 && t < s && n < i;
						for (let d = 0; d < a; d++) {
							const i = d + 1 < a ? d + 1 : 0, c = t[2 * d], l = t[2 * d + 1], h = t[2 * i] - c, u = t[2 * i + 1] - l;
							let g, m, b, w;
							if (h > 0 ? (g = c, m = l, b = c, w = l - 1) : h < 0 ? (g = c - 1, m = l - 1, b = c - 1, w = l) : u > 0 ? (g = c - 1, m = l, b = c, w = l) : (g = c, m = l - 1, b = c - 1, w = l - 1), !M(g, m) || !M(b, w)) continue;
							const A = m * s + g, k = w * s + b, F = 0 !== n[A];
							if (F === (0 !== n[k])) continue;
							x[d] = F ? 1 : -1;
							const v = e[F ? A : k];
							if (v < 0 || r[v] <= o) continue;
							const N = F ? g + f * (g - b) : b + f * (b - g), I = F ? m + f * (m - w) : w + f * (w - m);
							M(N, I) && e[I * s + N] === v && (y[d] = 1, p = !0);
						}
						if (!p) return;
						Ra(y, 0, u), Ra(y, 1, u);
						const g = new Float64Array(a);
						p = !1;
						for (let d = 0; d < a; d++) {
							let t = 0;
							for (; t < h && 1 === y[(d - 1 - t + a * h) % a] && 1 === y[(d + t) % a];) t++;
							0 !== t && 0 !== x[d] && (g[d] = x[d] * l * t / h, p = !0);
						}
						return p ? g : void 0;
					}(n.points, a.mask.data, a.labels, a.position, e, a.msg.width, a.msg.height, t.scale) : void 0));
				}
				a.layers.set(e, h);
			}
			return function(t, n, e) {
				const r = (t, r) => e ? is(t.points, e[r], n) : rs(t.points, n), o = [], s = new Int32Array(t.length);
				for (let c = 0; c < t.length; c++) {
					const n = t[c];
					n.area > 0 ? (s[c] = o.length, o.push({
						area: n.area,
						commands: r(n, c),
						holes: []
					})) : n.parent >= 0 && o[s[n.parent]].holes.push(r(n, c));
				}
				const i = o.map((t) => ({
					commands: t.commands.concat(...t.holes),
					area: t.area,
					holeCount: t.holes.length
				}));
				return i.sort((t, n) => n.area - t.area), i;
			}(h.paths, t, l ? h.polygons : void 0).map((t) => t.commands);
		}(l, c, e.layer, h) : function(t, n) {
			const e = o;
			if (!e) throw new Error("helper: no rings for trace-rings");
			const r = e.local.get(n);
			if (void 0 === r) throw new Error(`helper: ring ${n} not held`);
			let s = null;
			if ("pixel" !== t.curveMode) {
				const t = e.polygons[r];
				s = void 0 === t ? ss(Ua(e.msg.rings, r), e.coverage) : t, e.polygons[r] = s;
			}
			return [is(null === s ? Ua(e.msg.rings, r) : [], s, t)];
		}(l, c), f = t.serialize;
		if (!f) return { shapes: u };
		const y = t.meta?.[a], p = y?.under ? [y.under, y.own] : [y?.own ?? {}], M = [], g = 1 === f.scale && 0 === f.offset ? u : u.map((t) => {
			return n = t, e = f.scale, r = f.offset, o = f.offset, n.map((t) => {
				switch (t.type) {
					case "M":
					case "L": return {
						type: t.type,
						x: t.x * e + r,
						y: t.y * e + o
					};
					case "Q": return {
						type: "Q",
						x1: t.x1 * e + r,
						y1: t.y1 * e + o,
						x: t.x * e + r,
						y: t.y * e + o
					};
					case "C": return {
						type: "C",
						x1: t.x1 * e + r,
						y1: t.y1 * e + o,
						x2: t.x2 * e + r,
						y2: t.y2 * e + o,
						x: t.x * e + r,
						y: t.y * e + o
					};
					case "A": return {
						...t,
						rx: t.rx * e,
						ry: t.ry * e,
						x: t.x * e + r,
						y: t.y * e + o
					};
					case "Z": return t;
				}
			});
			var n, e, r, o;
		});
		for (const n of p) for (const t of g) M.push(Sa({
			...n,
			commands: t
		}, f.precision, f.optimize, f.roundPrimitives, f.compact));
		return {
			shapes: u,
			svg: M
		};
	}
	function x(t, n) {
		const r = c;
		if (!r) throw new Error("helper: no chains for fit-chains");
		const o = r.local.get(n);
		if (void 0 === o) throw new Error(`helper: chain ${n} not held`);
		const s = function(t, n, r) {
			const o = t.chains[n], s = function(t, n, e) {
				const r = e.colorField;
				if (r) {
					if (n.left < 0 || n.right < 0) {
						if (!r.alpha || n.left < 0 && n.right < 0) return;
						return n.right >= 0 ? Fn(r.alpha) : function(t) {
							const n = Fn(t);
							return {
								width: n.width,
								height: n.height,
								at: (t, e) => -n.at(t, e)
							};
						}(r.alpha);
					}
					return function(t, n, e, r, o, s) {
						const i = 3 * o, c = 3 * s;
						return {
							width: e,
							height: r,
							at(r, o) {
								const s = kn(t, 4 * (o * e + r), n, c, i);
								return s < 0 ? 0 : s - .5;
							}
						};
					}(r.pixels, r.paletteRgb, t.width, t.height, n.left, n.right);
				}
			}(t, o, r), i = function(t, n, e) {
				if (!e.refineChain) return t;
				const r = n.points[0], o = n.points[1];
				return e.refineChain([{
					type: "M",
					x: r,
					y: o
				}, ...t]).filter((t) => "M" !== t.type && "Z" !== t.type);
			}(function(t, n, r) {
				const o = t.length >> 1;
				if (o < 2) return [];
				if ("pixel" === n.curveMode) return function(t) {
					const n = t.length >> 1, e = [];
					for (let r = 1; r < n - 1; r++) {
						const n = t[2 * r] - t[2 * (r - 1)], o = t[2 * r + 1] - t[2 * (r - 1) + 1], s = t[2 * (r + 1)] - t[2 * r];
						n * (t[2 * (r + 1) + 1] - t[2 * r + 1]) - o * s !== 0 && e.push({
							type: "L",
							x: t[2 * r],
							y: t[2 * r + 1]
						});
					}
					return e.push({
						type: "L",
						x: t[2 * (n - 1)],
						y: t[2 * (n - 1) + 1]
					}), e;
				}(t);
				const s = fn(t);
				let i = t;
				if (r) {
					i = mn(t, r, s);
					const n = i.length;
					i[0] = t[0], i[1] = t[1], i[n - 2] = t[n - 2], i[n - 1] = t[n - 1];
				}
				if ("polygon" === n.curveMode || s.length <= 2) {
					const t = ln(i, en(i), s, !1), n = t.length >> 1, e = [];
					for (let r = 1; r < n; r++) e.push({
						type: "L",
						x: t[2 * r],
						y: t[2 * r + 1]
					});
					return e;
				}
				const c = hr(t, i, void 0 !== r), a = r ? Math.max(r.width, r.height) : 0, l = n.scale ?? 1, h = function(t, n, e, r) {
					const o = t.length >> 1;
					if (o < 2) return [];
					if (2 === o) return [{
						type: "L",
						x: t[2],
						y: t[3]
					}];
					n = ar(n, r = fr(r));
					const s = e.length, i = [0];
					for (let a = 1; a < s - 1; a++) {
						const n = e[a - 1], o = e[a], s = e[a + 1];
						Sn(t[2 * n], t[2 * n + 1], t[2 * o], t[2 * o + 1], t[2 * s], t[2 * s + 1], r.alphamax, r.cornerThreshold) && i.push(a);
					}
					i.push(s - 1);
					const c = [];
					for (let a = 0; a + 1 < i.length; a++) {
						const o = i[a], s = i[a + 1], l = e[o], h = e[s], { pts: u, sig: f } = Fo(t, n, l, h), y = [];
						for (let t = o + 1; t < s; t++) y.push(e[t] - l);
						Nr(c, u, f, y, Ao(u, 0), Ao(u, u.length / 2 - 1), r);
					}
					return c;
				}(1 === l ? i : i.map((t) => t / l), c, s, {
					alphamax: 4 * n.smoothing / 3,
					cornerThreshold: n.cornerThreshold,
					lambda: lr(a / l),
					tau: 2,
					band: xr(n.optTolerance),
					reach: ur(n.curveOptimize),
					stride: Math.round(yr(n.curveOptimize) * l),
					extent: a / l
				});
				if (1 === l || 0 === h.length) return h;
				const u = e(h, l), f = u[u.length - 1];
				return "Z" !== f.type && (u[u.length - 1] = {
					...f,
					x: t[2 * o - 2],
					y: t[2 * o - 1]
				}), u;
			}(o.points, r, s), o, r);
			if (!o.loop) return { open: i };
			const c = function(t, n, e) {
				const r = t.slice(0, t.length - 2), o = r.length >> 1;
				let s = 0;
				for (let c = 0; c < o; c++) {
					const t = (c + o - 1) % o, n = (c + 1) % o, e = r[2 * c] - r[2 * t], i = r[2 * c + 1] - r[2 * t + 1], a = r[2 * n] - r[2 * c];
					if (e * (r[2 * n + 1] - r[2 * c + 1]) - i * a !== 0) {
						s = c;
						break;
					}
				}
				const i = new Array(r.length);
				for (let c = 0; c < o; c++) {
					const t = (s + c) % o;
					i[2 * c] = r[2 * t], i[2 * c + 1] = r[2 * t + 1];
				}
				return rs(i, n, e);
			}(o.points, r, s);
			return {
				open: i,
				closed: r.refineChain ? r.refineChain(c) : c
			};
		}(r.network, o, t);
		return s.closed ? [s.open, s.closed] : [s.open];
	}
	function p(t) {
		const n = a;
		if (!n) throw new Error("helper: no edges for fit-edges");
		const e = n.local.get(t);
		if (void 0 === e) throw new Error(`helper: edge ${t} not held`);
		return function(t, n, e, r = {}) {
			const { points: o, sigma: s, closed: i } = t, c = function(t, n) {
				return 1 === n ? t : {
					tau: t.tau,
					lambda: t.lambda * n
				};
			}(e, r.lambdaScale ?? 1), a = r.forced ?? [], l = () => ki(o, s, i, c, {
				forced: a,
				postFit: Xc
			});
			if (oi.pinned(o.length >> 1, i, 1 / 0, a).forced.length > 0) return l();
			return jc(o, s, i, c, i && function(t, n, e) {
				const r = t.length >> 1;
				if (0 === r) return !1;
				for (let o = 0; o < r; o++) {
					const r = t[2 * o], s = t[2 * o + 1];
					if (0 !== r && 0 !== s && r !== n && s !== e) return !1;
				}
				return !0;
			}(o, n.width, n.height), l);
		}(n.edges[e], n.frame, n.cfg);
	}
	function M(t) {
		const n = l, e = n?.batch;
		if (!n || !e) throw new Error("helper: no band batch for fit-bands");
		return n.fits.fit(e.a[t], e.b[t], 1 === e.inner[t]);
	}
	function g() {
		const t = n;
		if (!t) throw new Error("helper: no working image");
		return t.image.data;
	}
	function d(t) {
		const e = n;
		if (void 0 !== t && e?.alpha) return void 0 !== e.alphaField && e.alphaLevel === t || (e.alphaField = function(t, n, e, r) {
			const o = Math.min(255, Math.max(0, r)) / 255, s = .5 / Math.max(1 - o, 1e-6), i = .5 / Math.max(o, 1e-6), c = new Float32Array(t.length);
			for (let a = 0; a < t.length; a++) {
				const n = t[a] / 255 - o;
				c[a] = n * (n > 0 ? s : i);
			}
			return {
				width: n,
				height: e,
				data: c
			};
		}(e.alpha, e.image.width, e.image.height, t), e.alphaLevel = t), e.alphaField;
	}
	t.addEventListener("message", (t) => {
		const e = t.data;
		switch (e.type) {
			case "helper-image":
				n = function(t) {
					return {
						image: {
							width: t.width,
							height: t.height,
							data: new Uint8ClampedArray(t.buffer)
						},
						alpha: t.alpha ? new Uint8Array(t.alpha) : void 0
					};
				}(e);
				return;
			case "helper-stack":
				r = function(t) {
					const n = new Int32Array(t.stackLabels), e = new Int32Array(t.order), r = new Int32Array(t.labelCount).fill(-1);
					for (let l = 0; l < e.length; l++) r[e[l]] = l;
					const o = new Uint32Array(t.labelCount), s = new Uint8Array(n.length);
					for (let l = 0; l < n.length; l++) {
						const t = n[l];
						t >= 0 && (o[t]++, s[l] = 1);
					}
					const i = new Int32Array(t.labelCount + 1);
					for (let l = 0; l < t.labelCount; l++) i[l + 1] = i[l] + o[l];
					const c = new Int32Array(i[t.labelCount]), a = i.slice(0, t.labelCount);
					for (let l = 0; l < n.length; l++) {
						const t = n[l];
						t >= 0 && (c[a[t]++] = l);
					}
					return {
						msg: t,
						labels: n,
						order: e,
						position: r,
						offset: i,
						bucket: c,
						islandLabels: new Int32Array(t.islandLabels),
						islandPixels: new Int32Array(t.islandPixels),
						islandOffsets: new Int32Array(t.islandOffsets),
						union: s,
						unionLayer: 0,
						mask: {
							width: t.width,
							height: t.height,
							data: new Uint8Array(n.length)
						},
						flood: new Int32Array(n.length),
						layers: /* @__PURE__ */ new Map()
					};
				}(e);
				return;
			case "helper-rings":
				o = function(t) {
					const n = new Int32Array(t.units);
					if (n.length !== Oa(t.rings)) throw new Error("helper: ring count mismatch");
					const e = /* @__PURE__ */ new Map();
					for (let r = 0; r < n.length; r++) e.set(n[r], r);
					return {
						msg: t,
						local: e,
						coverage: t.coverage ? {
							width: t.width,
							height: t.height,
							data: new Float32Array(t.coverage)
						} : void 0,
						polygons: new Array(n.length)
					};
				}(e);
				return;
			case "helper-chains":
				c = function(t) {
					const n = new Int32Array(t.units), e = new Int32Array(t.left), r = new Int32Array(t.right), o = new Uint8Array(t.loop);
					if (n.length !== Oa(t.points)) throw new Error("helper: chain count mismatch");
					const s = /* @__PURE__ */ new Map(), i = [];
					for (let c = 0; c < n.length; c++) s.set(n[c], c), i.push({
						points: Ua(t.points, c),
						left: e[c],
						right: r[c],
						loop: 0 !== o[c],
						firstDir: 0,
						lastDir: 0,
						shoelace: 0
					});
					return {
						key: t.key,
						network: {
							width: t.width,
							height: t.height,
							chains: i,
							areas: /* @__PURE__ */ new Map()
						},
						local: s
					};
				}(e);
				return;
			case "helper-edges":
				a = function(t) {
					const n = new Int32Array(t.units), e = new Uint8Array(t.closed), r = n.length;
					if (r !== Oa(t.points) || r !== Oa(t.sigma)) throw new Error("helper: edge count mismatch");
					const o = /* @__PURE__ */ new Map(), s = [];
					for (let i = 0; i < r; i++) o.set(n[i], i), s.push({
						points: t.points.data.subarray(t.points.offsets[i], t.points.offsets[i + 1]),
						sigma: t.sigma.data.subarray(t.sigma.offsets[i], t.sigma.offsets[i + 1]),
						closed: 0 !== e[i]
					});
					return {
						key: t.key,
						frame: {
							width: t.width,
							height: t.height
						},
						cfg: {
							tau: t.tau,
							lambda: t.lambda
						},
						local: o,
						edges: s
					};
				}(e);
				return;
			case "helper-bands":
				l = {
					key: e.key,
					fits: new Wt(Ya(e)),
					batch: null
				};
				return;
			case "helper-band-batch":
				(function(t) {
					const n = l;
					n && n.key === t.bands && (n.fits.apply(new Int32Array(t.merges)), n.batch = {
						key: t.key,
						a: new Int32Array(t.a),
						b: new Int32Array(t.b),
						inner: new Uint8Array(t.inner)
					});
				})(e);
				return;
			case "helper-cancel":
				h.add(e.id);
				return;
			case "helper-job":
				(async function(t) {
					const n = Math.max(1, t.batch), e = "fit-chains" !== t.kind && "fit-edges" !== t.kind && "fit-bands" !== t.kind && void 0 !== t.serialize, r = "fit-edges" === t.kind, s = "fit-bands" === t.kind;
					try {
						const i = function(t) {
							if ("fit-edges" === t.kind || "fit-bands" === t.kind) return {};
							const n = t.paletteRgb ? new Uint8Array(t.paletteRgb) : void 0;
							if ("fit-chains" === t.kind) {
								const e = t.arcPrecision;
								return { cutout: {
									...Va(t.curve),
									colorField: n ? {
										pixels: g(),
										paletteRgb: n,
										alpha: d(t.alphaThreshold)
									} : void 0,
									refineChain: void 0 === e ? void 0 : (t) => sa(t, e)
								} };
							}
							return "trace-layers" === t.kind ? {
								curve: Va(t.curve),
								layer: n ? {
									paletteRgb: n,
									alpha: d(t.alphaThreshold)
								} : void 0
							} : { curve: Va(t.curve, o?.coverage) };
						}(t);
						f(t);
						for (let o = 0; o < t.units.length && !h.has(t.id); o += n) {
							const c = [], a = [], l = e ? [] : void 0, h = [], x = [], g = [], d = e ? [] : void 0;
							for (let e = o; e < Math.min(o + n, t.units.length); e++) {
								const n = t.units[e];
								if (s) {
									g.push(M(n)), f(t), c.push(n), a.push(0);
									continue;
								}
								if (r) {
									x.push(p(n)), f(t), c.push(n), a.push(1);
									continue;
								}
								const o = y(t, i, n, e);
								f(t), c.push(n), a.push(o.shapes.length);
								for (const t of o.shapes) h.push(t);
								d && o.svg && (d.push(...o.svg), l?.push(o.svg.length));
							}
							const { commands: m, records: b } = r ? Xa(x) : {
								commands: ja(h),
								records: null
							};
							u({
								type: "helper-batch",
								id: t.id,
								units: c,
								counts: a,
								svgCounts: l,
								commands: m,
								svg: d,
								fits: b ? b.buffer : void 0,
								fills: s ? g : void 0
							}, b ? [...Ea(m), b.buffer] : Ea(m)), await new Promise((t) => setTimeout(t, 0));
						}
						u({
							type: "helper-done",
							id: t.id
						});
					} catch (i) {
						u({
							type: "helper-error",
							id: t.id,
							message: i instanceof Error ? i.message : String(i)
						});
					} finally {
						h.delete(t.id);
					}
				})(e);
				return;
		}
	});
}
function Va(t, n) {
	if (!t) throw new Error("helper: job carries no curve settings");
	return {
		...t,
		coverage: n
	};
}
function Ya(t) {
	return {
		labels: new Int32Array(t.labels),
		rgb: new Float32Array(t.rgb),
		w: t.width,
		h: t.height,
		inkRgb: new Float64Array(t.inkRgb),
		sigmaNoise: t.sigmaNoise,
		lambda: t.lambda,
		regionRecovery: t.regionRecovery,
		gradients: t.gradients,
		scale: t.scale,
		search: {
			stopGeometries: t.stopGeometries,
			radialsPerSpace: t.radialsPerSpace
		}
	};
}
self.addEventListener("message", (t) => {
	const { port: n } = t.data;
	Za(n), n.start();
}, { once: !0 });
