function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function n(t) {
	const n = t.length;
	if (n < 6) return 0;
	let e = 0, r = t[n - 2], o = t[n - 1];
	for (let s = 0; s < n; s += 2) {
		const n = t[s], c = t[s + 1];
		e += r * c - n * o, r = n, o = c;
	}
	return e / 2;
}
function e(t, n, e, r) {
	const o = t * e + n * r, s = Math.hypot(t, n) * Math.hypot(e, r);
	let c = Math.acos(Math.min(1, Math.max(-1, 0 === s ? 1 : o / s)));
	return t * r - n * e < 0 && (c = -c), c;
}
function r(t, n, r) {
	let o = Math.abs(r.rx), s = Math.abs(r.ry);
	if (0 === o || 0 === s) return null;
	const c = r.rotation * Math.PI / 180, a = Math.cos(c), l = Math.sin(c), i = (t - r.x) / 2, u = (n - r.y) / 2, h = a * i + l * u, f = -l * i + a * u, y = h * h / (o * o) + f * f / (s * s);
	if (y > 1) {
		const t = Math.sqrt(y);
		o *= t, s *= t;
	}
	const p = o * o * s * s - o * o * f * f - s * s * h * h, x = o * o * f * f + s * s * h * h;
	let M = x <= 0 ? 0 : Math.sqrt(Math.max(0, p) / x);
	r.largeArc === r.sweep && (M = -M);
	const d = M * (o * f) / s, g = s * h * -M / o, w = a * d - l * g + (t + r.x) / 2, m = l * d + a * g + (n + r.y) / 2, b = e(1, 0, (h - d) / o, (f - g) / s);
	let k = e((h - d) / o, (f - g) / s, (-h - d) / o, (-f - g) / s) % (2 * Math.PI);
	return !r.sweep && k > 0 && (k -= 2 * Math.PI), r.sweep && k < 0 && (k += 2 * Math.PI), {
		cx: w,
		cy: m,
		rx: o,
		ry: s,
		phi: c,
		theta1: b,
		dTheta: k
	};
}
Object.freeze({
	mode: "color",
	maxDimension: 1600,
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
	precision: 2,
	optimizeSvg: !0,
	groupByColor: !1,
	unit: "px",
	widthMm: 0,
	svgTitle: "",
	detectIslands: !1
});
const o = (() => {
	const n = /* @__PURE__ */ new Float64Array(256);
	for (let e = 0; e < 256; e++) n[e] = t(e / 255);
	return n;
})(), s = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1]
];
function c(t, e, r) {
	const { width: o, height: c } = t, a = new Uint8Array(t.data), l = (t, n) => t >= 0 && t < o && n >= 0 && n < c ? a[n * o + t] : 0, i = [], u = new Int32Array(o * c);
	let h = /* @__PURE__ */ new Int32Array(64);
	const f = new Int32Array(c), y = new Int32Array(c);
	for (let s = 0; s < c; s++) {
		const e = s * o;
		for (let c = 0; c < o; c++) {
			if (1 !== a[e + c]) continue;
			const o = p(c, s), l = Math.abs(n(o)), h = 1 === t.data[e + c], f = l >= r, y = u[e + c];
			d(o, h ? f ? i.length + 1 : y : -1), f && i.push({
				points: o,
				area: h ? l : -l,
				interiorX: c,
				interiorY: s,
				parent: y - 1
			});
		}
	}
	return i;
	function p(t, n) {
		const e = [];
		let r = t, o = n, c = 0;
		do {
			e.push(r, o);
			const [t, n] = s[c], a = l(r + (t + n - 1) / 2, o + (n - t - 1) / 2), i = l(r + (t - n - 1) / 2, o + (n + t - 1) / 2);
			1 === i && 0 === a || (c = 1 === i && 1 === a ? c + 3 & 3 : 0 === i && 0 === a ? c + 1 & 3 : x(r, o, c));
			const [u, h] = s[c];
			r += u, o += h;
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
			case "majority": return M(t, n) ? o : s;
			case "minority": return M(t, n) ? s : o;
		}
	}
	function M(t, n) {
		for (let e = 2; e < 5; e++) {
			let r = 0;
			for (let o = 1 - e; o <= e - 1; o++) r += l(t + o, n + e - 1) ? 1 : -1, r += l(t + e - 1, n + o - 1) ? 1 : -1, r += l(t + o - 1, n - e) ? 1 : -1, r += l(t - e, n + o) ? 1 : -1;
			if (r > 0) return !0;
			if (r < 0) return !1;
		}
		return !1;
	}
	function d(t, n) {
		const e = t.length;
		let r = 0, s = c, l = -1;
		for (let o = 0; o < e; o += 2) {
			const n = t[o + 1], c = t[(o + 3) % e];
			if (c === n) continue;
			const a = c < n ? c : n;
			f[a]++, a < s && (s = a), a > l && (l = a), r++;
		}
		if (0 === r) return;
		if (r > h.length) {
			let t = h.length;
			for (; t < r;) t *= 2;
			h = new Int32Array(t);
		}
		let i = 0;
		for (let o = s; o <= l; o++) y[o] = i, i += f[o];
		for (let o = 0; o < e; o += 2) {
			const n = t[o + 1], r = t[(o + 3) % e];
			r !== n && (h[y[r < n ? r : n]++] = t[o]);
		}
		for (let c = s; c <= l; c++) {
			const t = y[c], e = t - f[c];
			f[c] = 0;
			for (let n = e + 1; n < t; n++) {
				const t = h[n];
				let r = n - 1;
				for (; r >= e && h[r] > t;) h[r + 1] = h[r], r--;
				h[r + 1] = t;
			}
			const r = c * o;
			for (let o = e; o + 1 < t; o += 2) {
				const t = h[o], e = h[o + 1];
				for (let n = t; n < e; n++) a[r + n] ^= 1;
				if (n >= 0) for (let o = t; o < e; o++) u[r + o] = n;
			}
		}
	}
}
function a(t) {
	const n = t.length >> 1, e = t[0], r = t[1], o = new Float64Array(n + 1), s = new Float64Array(n + 1), c = new Float64Array(n + 1), a = new Float64Array(n + 1), l = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) {
		const n = t[2 * i] - e, u = t[2 * i + 1] - r;
		o[i + 1] = o[i] + n, s[i + 1] = s[i] + u, c[i + 1] = c[i] + n * n, a[i + 1] = a[i] + n * u, l[i + 1] = l[i] + u * u;
	}
	return {
		x: o,
		y: s,
		x2: c,
		xy: a,
		y2: l,
		ox: e,
		oy: r
	};
}
function l(t, n, e, r) {
	const { x: o, y: s, x2: c, xy: a, y2: l, ox: i, oy: u } = n, h = r + 1 - e, f = o[r + 1] - o[e], y = s[r + 1] - s[e], p = c[r + 1] - c[e], x = a[r + 1] - a[e], M = l[r + 1] - l[e], d = (t[2 * e] + t[2 * r]) / 2 - i, g = (t[2 * e + 1] + t[2 * r + 1]) / 2 - u, w = t[2 * r] - t[2 * e], m = t[2 * r + 1] - t[2 * e + 1], b = m * m * ((p - 2 * f * d) / h + d * d) - 2 * w * m * ((x - f * g - y * d) / h + d * g) + w * w * ((M - 2 * y * g) / h + g * g);
	return Math.sqrt(Math.max(0, b));
}
function i(t, n, e, r) {
	const { x: o, y: s, x2: c, xy: a, y2: l, ox: i, oy: u } = n, h = r + 1 - e, f = (o[r + 1] - o[e]) / h, y = (s[r + 1] - s[e]) / h, p = (c[r + 1] - c[e]) / h - f * f, x = (a[r + 1] - a[e]) / h - f * y, M = (l[r + 1] - l[e]) / h - y * y, d = (p + M + Math.sqrt((p - M) * (p - M) + 4 * x * x)) / 2;
	let g = 0, w = 0;
	Math.abs(p - d) >= Math.abs(M - d) ? (g = -x, w = p - d) : (g = M - d, w = -x);
	const m = Math.hypot(g, w);
	if (m < 1e-12) {
		g = t[2 * r] - t[2 * e], w = t[2 * r + 1] - t[2 * e + 1];
		const n = Math.hypot(g, w);
		return n < 1e-12 ? {
			cx: f + i,
			cy: y + u,
			dx: 1,
			dy: 0
		} : {
			cx: f + i,
			cy: y + u,
			dx: g / n,
			dy: w / n
		};
	}
	return {
		cx: f + i,
		cy: y + u,
		dx: g / m,
		dy: w / m
	};
}
function u(t, n, e, r) {
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
function h(t, n) {
	const e = new Array(9);
	for (let r = 0; r < 9; r++) e[r] = t[r] + n[r];
	return e;
}
function f(t, n, e) {
	return t[0] * n * n + (t[1] + t[3]) * n * e + t[4] * e * e + (t[2] + t[6]) * n + (t[5] + t[7]) * e + t[8];
}
function y(t, n, e, r) {
	const o = e.length, s = new Array(2 * o), c = o - 1, a = new Array(c);
	for (let l = 0; l < c; l++) {
		const { cx: r, cy: o, dx: s, dy: c } = i(t, n, e[l], e[l + 1]);
		a[l] = u(r, o, s, c);
	}
	for (let l = 0; l < o; l++) {
		const n = t[2 * e[l]], o = t[2 * e[l] + 1];
		let i = null, u = null;
		if (l > 0 ? i = a[l - 1] : r && (i = a[c - 1]), l < c ? u = a[l] : r && (u = a[0]), !i || !u) {
			s[2 * l] = n, s[2 * l + 1] = o;
			continue;
		}
		const [f, y] = p(h(i, u), n, o);
		s[2 * l] = f, s[2 * l + 1] = y;
	}
	return r && (s[2 * (o - 1)] = s[0], s[2 * (o - 1) + 1] = s[1]), s;
}
function p(t, n, e) {
	const r = 2 * t[0], o = t[1] + t[3], s = t[2] + t[6], c = o, a = 2 * t[4], l = t[5] + t[7], i = r * a - o * c;
	if (Math.abs(i) > 1e-9) {
		const t = (-s * a + l * o) / i, u = (-r * l + s * c) / i;
		if (Math.abs(t - n) <= .5 && Math.abs(u - e) <= .5) return [t, u];
	}
	let u = n, h = e, y = f(t, n, e);
	const p = (n, e) => {
		const r = f(t, n, e);
		r < y && (y = r, u = n, h = e);
	};
	for (const f of [n - .5, n + .5]) Math.abs(a) > 1e-12 && p(f, x((-o * f - l) / a, e - .5, e + .5)), p(f, e - .5), p(f, e + .5);
	for (const f of [e - .5, e + .5]) Math.abs(r) > 1e-12 && p(x((-c * f - s) / r, n - .5, n + .5), f), p(n - .5, f), p(n + .5, f);
	return [u, h];
}
function x(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function M(t, n, e, r, o, s, c, a, l) {
	const i = 1 - l, u = i * i * i, h = 3 * i * i * l, f = 3 * i * l * l, y = l * l * l;
	return [u * t + h * e + f * o + y * c, u * n + h * r + f * s + y * a];
}
function d(t) {
	const n = 1 - t;
	return n * n * n;
}
function g(t) {
	const n = 1 - t;
	return 3 * t * n * n;
}
function w(t) {
	return 3 * t * t * (1 - t);
}
function m(t) {
	return t * t * t;
}
function b(t, n) {
	return M(t.p0x, t.p0y, t.c1x, t.c1y, t.c2x, t.c2y, t.p3x, t.p3y, n);
}
function k(t, n, e, r) {
	const [o, s] = b(t, r), [c, a] = function(t, n) {
		const e = 1 - n, r = 3 * (t.c1x - t.p0x), o = 3 * (t.c1y - t.p0y), s = 3 * (t.c2x - t.c1x), c = 3 * (t.c2y - t.c1y);
		return [e * e * r + 2 * e * n * s + n * n * (3 * (t.p3x - t.c2x)), e * e * o + 2 * e * n * c + n * n * (3 * (t.p3y - t.c2y))];
	}(t, r), [l, i] = function(t, n) {
		const e = 6 * (t.c2x - 2 * t.c1x + t.p0x), r = 6 * (t.c2y - 2 * t.c1y + t.p0y);
		return [(1 - n) * e + n * (6 * (t.p3x - 2 * t.c2x + t.c1x)), (1 - n) * r + n * (6 * (t.p3y - 2 * t.c2y + t.c1y))];
	}(t, r), u = o - n, h = s - e, f = u * c + h * a, y = c * c + a * a + u * l + h * i;
	if (Math.abs(y) < 1e-12) return r;
	const p = r - f / y;
	return p < 0 ? 0 : p > 1 ? 1 : p;
}
function A(t, n, e) {
	let r = 0, o = 1 / 0;
	for (let l = 0; l <= 16; l++) {
		const s = l / 16, [c, a] = b(t, s), i = (c - n) * (c - n) + (a - e) * (a - e);
		i < o && (o = i, r = s);
	}
	let s = r;
	for (let l = 0; l < 3; l++) s = k(t, n, e, s);
	const [c, a] = b(t, s);
	return Math.min(Math.sqrt(o), Math.hypot(c - n, a - e));
}
function v(t, n, e, r, o) {
	const s = [];
	let c = t, a = n, l = 0;
	for (; l < e.length;) {
		const t = e[l];
		if (t.corner) {
			s.push({
				type: "L",
				x: t.vx,
				y: t.vy
			}), s.push({
				type: "L",
				x: t.ex,
				y: t.ey
			}), c = t.ex, a = t.ey, l++;
			continue;
		}
		let n = l;
		for (; n + 1 < e.length && !e[n + 1].corner;) n++;
		$(e, l, n, c, a, r, o, s), c = e[n].ex, a = e[n].ey, l = n + 1;
	}
	return s;
}
const I = 24;
function $(t, n, e, r, o, s, c, a) {
	let l = r, i = o, u = n;
	for (; u <= e;) {
		let n = !1;
		if (s && c > 0) for (let r = Math.min(e, u + I - 1); r > u; r--) {
			const e = P(t, u, r, l, i, c);
			if (e) {
				a.push({
					type: "C",
					x1: e.c1x,
					y1: e.c1y,
					x2: e.c2x,
					y2: e.c2y,
					x: e.p3x,
					y: e.p3y
				}), l = e.p3x, i = e.p3y, u = r + 1, n = !0;
				break;
			}
		}
		if (!n) {
			const n = t[u];
			a.push({
				type: "C",
				x1: n.c1x,
				y1: n.c1y,
				x2: n.c2x,
				y2: n.c2y,
				x: n.ex,
				y: n.ey
			}), l = n.ex, i = n.ey, u++;
		}
	}
}
function P(t, n, e, r, o, s) {
	let c = t[n].ex - r, a = t[n].ey - o, l = 0, i = 0, u = t[n].ex, h = t[n].ey;
	for (let M = n + 1; M <= e; M++) {
		const n = t[M].ex - u, e = t[M].ey - h, r = c * e - a * n, o = Math.sign(r);
		if (0 !== o) {
			if (0 === l) l = o;
			else if (o !== l) return null;
		}
		const s = c * n + a * e;
		if (i += Math.abs(Math.atan2(Math.abs(r), s)), i > .994 * Math.PI) return null;
		c = n, a = e, u = t[M].ex, h = t[M].ey;
	}
	const f = [r, o];
	let y = r, p = o;
	for (let d = n; d <= e; d++) {
		const n = t[d];
		for (let t = 1; t <= 8; t++) {
			const [e, r] = M(y, p, n.c1x, n.c1y, n.c2x, n.c2y, n.ex, n.ey, t / 8);
			f.push(e, r);
		}
		y = n.ex, p = n.ey;
	}
	let x = t[n].c1x - r, b = t[n].c1y - o, k = Math.hypot(x, b);
	k < 1e-9 && (x = f[2] - r, b = f[3] - o, k = Math.hypot(x, b) || 1);
	const v = t[e];
	let I = v.c2x - v.ex, $ = v.c2y - v.ey, P = Math.hypot(I, $);
	if (P < 1e-9) {
		const t = f.length;
		I = f[t - 4] - v.ex, $ = f[t - 3] - v.ey, P = Math.hypot(I, $) || 1;
	}
	const L = f.length >> 1, C = new Float64Array(L);
	for (let M = 1; M < L; M++) C[M] = C[M - 1] + Math.hypot(f[2 * M] - f[2 * (M - 1)], f[2 * M + 1] - f[2 * (M - 1) + 1]);
	const F = C[L - 1] || 1;
	for (let M = 0; M < L; M++) C[M] /= F;
	const q = function(t, n, e, r, o, s, c, a) {
		const l = t[0], i = t[1], u = t[2 * e], h = t[2 * e + 1];
		let f = 0, y = 0, p = 0, x = 0, M = 0;
		for (let $ = 0; $ <= e; $++) {
			const n = r[$ - 0], e = o * g(n), b = s * g(n), k = c * w(n), A = a * w(n);
			f += e * e + b * b, y += e * k + b * A, p += k * k + A * A;
			const v = t[2 * $] - (d(n) + g(n)) * l - (w(n) + m(n)) * u, I = t[2 * $ + 1] - (d(n) + g(n)) * i - (w(n) + m(n)) * h;
			x += e * v + b * I, M += k * v + A * I;
		}
		const b = f * p - y * y;
		let k = 0, A = 0;
		Math.abs(b) > 1e-12 && (k = (x * p - M * y) / b, A = (f * M - y * x) / b);
		const v = Math.hypot(u - l, h - i), I = 1e-6 * v;
		return (k < I || A < I) && (k = A = v / 3), {
			p0x: l,
			p0y: i,
			c1x: l + k * o,
			c1y: i + k * s,
			c2x: u + A * c,
			c2y: h + A * a,
			p3x: u,
			p3y: h
		};
	}(f, 0, L - 1, C, x / k, b / k, I / P, $ / P);
	for (let M = 1; M < L - 1; M += 2) if (A(q, f[2 * M], f[2 * M + 1]) > s) return null;
	for (let M = n; M <= e; M++) if (A(q, t[M].ex, t[M].ey) > s) return null;
	return q;
}
function L(t) {
	const n = t.length >> 1;
	if (n <= 2) return 2 === n ? [0, 1] : [0];
	const e = function(t) {
		const n = t.length >> 1, e = (n) => t[2 * n], r = (n) => t[2 * n + 1], o = new Int8Array(Math.max(0, n - 1));
		for (let h = 0; h < n - 1; h++) o[h] = C(e(h + 1) - e(h), r(h + 1) - r(h));
		const s = new Int32Array(Math.max(0, n - 1));
		if (n >= 2) {
			s[n - 2] = n - 1;
			for (let t = n - 3; t >= 0; t--) s[t] = o[t + 1] !== o[t] ? t + 1 : s[t + 1];
		}
		const c = new Int32Array(n);
		c[n - 1] = n - 1;
		const a = /* @__PURE__ */ new Int32Array(4);
		for (let h = n - 2; h >= 0; h--) {
			a[0] = a[1] = a[2] = a[3] = 0, a[o[h]]++;
			let t = 0, l = 0, i = 0, u = 0, f = h, y = s[h], p = !1, x = !1;
			for (;;) {
				if (a[C(Math.sign(e(y) - e(f)), Math.sign(r(y) - r(f)))]++, 0 !== a[0] && 0 !== a[1] && 0 !== a[2] && 0 !== a[3]) {
					c[h] = f, p = !0;
					break;
				}
				const o = e(y) - e(h), M = r(y) - r(h);
				if (t * M - l * o < 0 || i * M - u * o > 0) {
					x = !0;
					break;
				}
				if (Math.abs(o) > 1 || Math.abs(M) > 1) {
					const n = o + (M >= 0 && (M > 0 || o < 0) ? 1 : -1), e = M + (o <= 0 && (o < 0 || M < 0) ? 1 : -1);
					t * e - l * n >= 0 && (t = n, l = e);
					const r = o + (M <= 0 && (M < 0 || o < 0) ? 1 : -1), s = M + (o >= 0 && (o > 0 || M < 0) ? 1 : -1);
					i * s - u * r <= 0 && (i = r, u = s);
				}
				if (f = y, f === n - 1) {
					c[h] = n - 1, p = !0;
					break;
				}
				y = s[f];
			}
			if (!p && x) {
				const o = Math.sign(e(y) - e(f)), s = Math.sign(r(y) - r(f)), a = e(f) - e(h), p = r(f) - r(h), x = t * p - l * a, M = t * s - l * o, d = i * p - u * a, g = i * s - u * o;
				let w = 1e7;
				M < 0 && (w = Math.floor(x / -M)), g > 0 && (w = Math.min(w, Math.floor(-d / g))), c[h] = Math.min(n - 1, Math.max(f, f + w));
			}
		}
		const l = new Int32Array(n);
		l[n - 1] = n - 1;
		let i = c[n - 1];
		for (let h = n - 2; h >= 0; h--) c[h] >= h + 1 && c[h] <= i && (i = c[h]), l[h] = i;
		const u = new Int32Array(n);
		for (let h = 0; h < n; h++) {
			const t = 0 === h ? l[0] : l[h - 1];
			u[h] = t >= n - 1 ? n - 1 : Math.min(n - 1, Math.max(h + 1, t - 1));
		}
		return u[n - 1] = n - 1, u;
	}(t), r = a(t);
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
	const c = new Int32Array(n);
	{
		let t = 0;
		for (let r = 1; r < n; r++) {
			for (; e[t] < r;) t++;
			c[r] = t;
		}
	}
	const i = new Int32Array(o + 1);
	i[o] = n - 1;
	for (let a = o - 1; a >= 0; a--) i[a] = c[i[a + 1]];
	let u = new Float64Array(n).fill(1 / 0), h = new Float64Array(n).fill(1 / 0);
	u[0] = 0;
	const f = [];
	for (let a = 1; a <= o; a++) {
		const c = i[a], y = a === o ? n - 1 : s[a], p = i[a - 1], x = s[a - 1], M = new Int32Array(y - c + 1).fill(-1);
		h.fill(1 / 0, c, y + 1);
		for (let s = Math.max(c, a === o ? n - 1 : c); s <= y; s++) {
			let n = 1 / 0, o = -1;
			const a = Math.min(x, s - 1);
			for (let c = p; c <= a; c++) {
				if (e[c] < s) continue;
				const a = u[c];
				if (a === 1 / 0) continue;
				const i = a + l(t, r, c, s);
				i < n && (n = i, o = c);
			}
			h[s] = n, M[s - c] = o;
		}
		f.push(M);
		const d = u;
		u = h, h = d;
	}
	const y = [n - 1];
	let p = n - 1;
	for (let a = o; a >= 1; a--) {
		const t = i[a], n = f[a - 1][p - t];
		if (n < 0) {
			y.push(0);
			break;
		}
		y.push(n), p = n;
	}
	return y.reverse(), 0 !== y[0] && y.unshift(0), y;
}
function C(t, n) {
	return (3 + 3 * Math.sign(t) + Math.sign(n)) / 2;
}
function F(t, n, e, r, o, s, c, a) {
	const l = Math.abs(o - t) + Math.abs(s - n);
	let i;
	if (0 !== l) {
		const c = Math.abs((e - t) * (s - n) - (o - t) * (r - n)) / l;
		i = c > 1 ? 1 - 1 / c : 0, i /= .75;
	} else i = 4 / 3;
	const u = (t + e) / 2, h = (n + r) / 2, f = (e + o) / 2, y = (r + s) / 2;
	if (function(t, n, e, r, o, s, c, a, l) {
		return void 0 === l ? t >= n : !(Math.min(Math.hypot(e - o, r - s), Math.hypot(c - o, a - s)) < 1.5) && (function(t, n, e, r, o, s) {
			const c = t - e, a = n - r, l = o - e, i = s - r, u = Math.hypot(c, a), h = Math.hypot(l, i);
			if (0 === u || 0 === h) return 180;
			let f = (c * l + a * i) / (u * h);
			return f = f < -1 ? -1 : f > 1 ? 1 : f, 180 * Math.acos(f) / Math.PI;
		}(e, r, o, s, c, a) < l || t >= n);
	}(i, c, t, n, e, r, o, s, a)) return {
		corner: !0,
		vx: e,
		vy: r,
		c1x: 0,
		c1y: 0,
		c2x: 0,
		c2y: 0,
		ex: f,
		ey: y
	};
	const p = i < .55 ? .55 : i > 1 ? 1 : i;
	return {
		corner: !1,
		vx: e,
		vy: r,
		c1x: u + p * (e - u),
		c1y: h + p * (r - h),
		c2x: f + p * (e - f),
		c2y: y + p * (r - y),
		ex: f,
		ey: y
	};
}
const q = .75, O = .4999;
function Z(t, n) {
	const e = n.width, r = n.height, o = "data" in n ? n.data : null, s = (t, s) => {
		const c = t < 0 ? 0 : t >= e ? e - 1 : t, a = s < 0 ? 0 : s >= r ? r - 1 : s;
		return null !== o ? o[a * e + c] : n.at(c, a);
	}, c = t.length >> 1, a = new Array(t.length);
	for (let l = 0; l < c; l++) {
		const n = t[2 * l], o = t[2 * l + 1];
		if (a[2 * l] = n, a[2 * l + 1] = o, n <= 0 || o <= 0 || n >= e || o >= r) continue;
		const c = s(n - 1, o - 1), i = s(n, o - 1), u = s(n - 1, o), h = s(n, o);
		if (c > 0 && i > 0 && u > 0 && h > 0 || c < 0 && i < 0 && u < 0 && h < 0) continue;
		if (Math.abs(c) >= O && Math.abs(i) >= O && Math.abs(u) >= O && Math.abs(h) >= O) continue;
		const f = (c + i + u + h) / 4, y = (i + h - c - u) / 2, p = (u + h - c - i) / 2, x = y * y + p * p;
		if (x < 1e-12) continue;
		const M = -f / x;
		let d = M * y, g = M * p;
		d = d > q ? q : d < -.75 ? -.75 : d, g = g > q ? q : g < -.75 ? -.75 : g, a[2 * l] = n + d, a[2 * l + 1] = o + g;
	}
	return a;
}
function E(t, n, e) {
	return "pixel" === n.curveMode ? S(t) : T(t, z(t, e ?? n.coverage), n);
}
function z(t, n) {
	const e = t.slice();
	e.push(t[0], t[1]);
	const r = L(e);
	if (r.length < 4) return null;
	const o = n ? Z(e, n) : e;
	return y(o, a(o), r, !0);
}
function T(t, n, e) {
	if ("pixel" === e.curveMode || null === n) return S(t);
	if ("polygon" === e.curveMode) {
		const t = [{
			type: "M",
			x: n[0],
			y: n[1]
		}];
		for (let e = 1; e < (n.length >> 1) - 1; e++) t.push({
			type: "L",
			x: n[2 * e],
			y: n[2 * e + 1]
		});
		return t.push({ type: "Z" }), t;
	}
	const r = function(t, n, e) {
		const r = t.length >> 1, o = new Array(r);
		for (let s = 0; s < r; s++) {
			const c = (s + r - 1) % r, a = (s + 1) % r;
			o[s] = F(t[2 * c], t[2 * c + 1], t[2 * s], t[2 * s + 1], t[2 * a], t[2 * a + 1], n, e);
		}
		return o;
	}(n.slice(0, n.length - 2), 4 * e.smoothing / 3, e.cornerThreshold), o = r[r.length - 1], s = [{
		type: "M",
		x: o.ex,
		y: o.ey
	}];
	return s.push(...v(o.ex, o.ey, r, e.curveOptimize, e.optTolerance)), s.push({ type: "Z" }), s;
}
function S(t) {
	const n = t.length >> 1, e = [];
	for (let r = 0; r < n; r++) {
		const o = (r + n - 1) % n, s = (r + 1) % n, c = t[2 * r] - t[2 * o], a = t[2 * r + 1] - t[2 * o + 1], l = t[2 * s] - t[2 * r];
		c * (t[2 * s + 1] - t[2 * r + 1]) - a * l !== 0 && (0 === e.length ? e.push({
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
function Q(t, n) {
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
function U(t) {
	const n = t.length;
	if (n < 3) return null;
	let e = 0, r = 0, o = 0, s = 0, c = 0, a = 0, l = 0, i = 0;
	for (const d of t) {
		const t = d.x * d.x + d.y * d.y;
		e += d.x * d.x, r += d.x * d.y, o += d.y * d.y, s += d.x, c += d.y, a += d.x * t, l += d.y * t, i += t;
	}
	const u = Q([
		[
			e,
			r,
			s
		],
		[
			r,
			o,
			c
		],
		[
			s,
			c,
			n
		]
	], [
		-a,
		-l,
		-i
	]);
	if (!u) return null;
	const [h, f, y] = u, p = -h / 2, x = -f / 2, M = p * p + x * x - y;
	return M <= 0 ? null : {
		cx: p,
		cy: x,
		r: Math.sqrt(M)
	};
}
function j(t) {
	const n = t.length;
	if (n < 6) return null;
	let e = 0, r = 0;
	for (const Z of t) e += Z.x, r += Z.y;
	e /= n, r /= n;
	let o = 0;
	for (const Z of t) o += (Z.x - e) ** 2 + (Z.y - r) ** 2;
	const s = Math.sqrt(o / n) || 1, c = Array.from({ length: 6 }, () => new Array(6).fill(0));
	for (const Z of t) {
		const t = (Z.x - e) / s, n = (Z.y - r) / s, o = [
			t * t,
			t * n,
			n * n,
			t,
			n,
			1
		];
		for (let e = 0; e < 6; e++) for (let t = 0; t < 6; t++) c[e][t] += o[e] * o[t];
	}
	const { values: a, vectors: l } = function(t) {
		const n = t.map((t) => [...t]), e = Array.from({ length: 6 }, (t, n) => Array.from({ length: 6 }, (t, e) => n === e ? 1 : 0));
		for (let r = 0; r < 100; r++) {
			let t = 0;
			for (let e = 0; e < 6; e++) for (let r = e + 1; r < 6; r++) t += n[e][r] * n[e][r];
			if (t < 1e-20) break;
			for (let r = 0; r < 6; r++) for (let t = r + 1; t < 6; t++) {
				if (Math.abs(n[r][t]) < 1e-18) continue;
				const o = (n[t][t] - n[r][r]) / (2 * n[r][t]), s = Math.sign(o || 1) / (Math.abs(o) + Math.sqrt(o * o + 1)), c = 1 / Math.sqrt(s * s + 1), a = s * c;
				for (let e = 0; e < 6; e++) {
					const o = n[e][r], s = n[e][t];
					n[e][r] = c * o - a * s, n[e][t] = a * o + c * s;
				}
				for (let e = 0; e < 6; e++) {
					const o = n[r][e], s = n[t][e];
					n[r][e] = c * o - a * s, n[t][e] = a * o + c * s;
				}
				for (let n = 0; n < 6; n++) {
					const o = e[n][r], s = e[n][t];
					e[n][r] = c * o - a * s, e[n][t] = a * o + c * s;
				}
			}
		}
		return {
			values: n.map((t, n) => t[n]),
			vectors: e
		};
	}(c);
	let i = 0;
	for (let Z = 1; Z < 6; Z++) a[Z] < a[i] && (i = Z);
	const [u, h, f, y, p, x] = l.map((t) => t[i]);
	if (h * h - 4 * u * f >= 0) return null;
	const M = Q([[2 * u, h], [h, 2 * f]], [-y, -p]);
	if (!M) return null;
	const [d, g] = M, w = u * d * d + h * d * g + f * g * g + y * d + p * g + x, m = u + f, b = u * f - h * h / 4, k = Math.sqrt(Math.max(0, m * m / 4 - b)), A = m / 2 + k, v = m / 2 - k;
	if (0 === A || 0 === v) return null;
	const I = -w / A, $ = -w / v;
	if (I <= 0 || $ <= 0) return null;
	const P = Math.sqrt(I), L = Math.sqrt($), C = Math.abs(h) < 1e-12 && Math.abs(u - A) < 1e-12 ? 0 : Math.atan2(A - u, h / 2);
	let F, q, O;
	for (P >= L ? (F = P, q = L, O = C) : (F = L, q = P, O = C + Math.PI / 2); O > Math.PI / 2;) O -= Math.PI;
	for (; O <= -Math.PI / 2;) O += Math.PI;
	return {
		cx: e + d * s,
		cy: r + g * s,
		rx: F * s,
		ry: q * s,
		angle: O
	};
}
function N(t, n) {
	let e = t.toFixed(D(n));
	return e.includes(".") && (e = e.replace(/\.?0+$/, "")), "-0" === e && (e = "0"), e;
}
function D(t) {
	const n = Math.round(t);
	return n < 0 ? 0 : n > 4 ? 4 : n;
}
function R(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, c = 3 * r * e * e, a = e * e * e;
	return {
		x: o * t.x + s * n.x1 + c * n.x2 + a * n.x,
		y: o * t.y + s * n.y1 + c * n.y2 + a * n.y
	};
}
function B(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function W(t, n, e, o) {
	const s = r(t.x, t.y, n);
	if (null === s) return !1;
	const { cx: c, cy: a, rx: l, ry: i, phi: u, theta1: h, dTheta: f } = s, y = Math.cos(u), p = Math.sin(u), x = Math.min(l, i), M = 2 * Math.PI, d = (t) => {
		let n = t - h;
		return f >= 0 ? (n = (n % M + M) % M, n <= f + 1e-6) : (n = -(-n % M + M) % M, n >= f - 1e-6);
	};
	for (const r of e) {
		const t = r.x - c, n = r.y - a, e = (t * y + n * p) / l, s = (-t * p + n * y) / i;
		if (Math.abs(Math.hypot(e, s) - 1) * x > o) return !1;
		if (!d(Math.atan2(s, e))) return !1;
	}
	return !0;
}
function K(t, n, e) {
	const o = [t];
	let s = t;
	for (const r of n) o.push(R(s, r, .25), R(s, r, .5), R(s, r, .75), {
		x: r.x,
		y: r.y
	}), s = {
		x: r.x,
		y: r.y
	};
	const c = s, a = function(t) {
		const n = U(t);
		if (null !== n && n.r > 0) {
			const e = .6;
			if (t.every((t) => Math.abs(Math.hypot(t.x - n.cx, t.y - n.cy) - n.r) <= e)) return {
				cx: n.cx,
				cy: n.cy,
				rx: n.r,
				ry: n.r,
				angle: 0,
				tol: e
			};
		}
		const e = j(t);
		if (null !== e && e.rx > 0 && e.ry > 0) {
			const n = .6, r = Math.cos(e.angle), o = Math.sin(e.angle);
			if (t.every((t) => {
				const s = t.x - e.cx, c = t.y - e.cy, a = (s * r + c * o) / e.rx, l = (-s * o + c * r) / e.ry;
				return Math.abs(Math.hypot(a, l) - 1) * Math.min(e.rx, e.ry) <= n;
			})) return {
				cx: e.cx,
				cy: e.cy,
				rx: e.rx,
				ry: e.ry,
				angle: e.angle,
				tol: n
			};
		}
		return null;
	}(o);
	if (null === a) return null;
	const { cx: l, cy: i, tol: u } = a, h = o.map((t) => Math.atan2(t.y - i, t.x - l));
	let f = 0, y = 0;
	for (let r = 1; r < h.length; r++) {
		const t = B(h[r], h[r - 1]);
		if (Math.abs(t) > 1e-4) {
			const n = Math.sign(t);
			if (0 !== y && n !== y) return null;
			y = n;
		}
		f += t;
	}
	const p = Math.abs(f);
	if (p < .5 || p > 2 * Math.PI - .2) return null;
	const x = D(e), M = (t) => Number(t.toFixed(x)), d = M(a.rx), g = M(a.ry), w = M(180 * a.angle / Math.PI), m = M(c.x), b = M(c.y);
	if (d <= 0 || g <= 0) return null;
	for (const k of [!1, !0]) for (const n of [!1, !0]) {
		const e = {
			type: "A",
			rx: d,
			ry: g,
			rotation: w,
			largeArc: k,
			sweep: n,
			x: m,
			y: b
		}, s = r(t.x, t.y, e);
		if (null !== s && !(Math.hypot(s.cx - l, s.cy - i) > u) && W(t, e, o, u)) return e;
	}
	return null;
}
function V(t, n) {
	const e = [];
	let r = 0, o = 0, s = 0, c = 0, a = null;
	const l = () => {
		if (null !== a) {
			if (a.cubics.length >= 2) for (const t of function(t, n, e) {
				const r = [];
				let o = t, s = 0;
				for (; s < n.length;) {
					let t = null, c = 0;
					for (let r = 2; s + r <= n.length; r++) {
						const a = K(o, n.slice(s, s + r), e);
						if (null === a) break;
						t = a, c = r;
					}
					if (null !== t) {
						r.push(t);
						const e = n[s + c - 1];
						o = {
							x: e.x,
							y: e.y
						}, s += c;
					} else r.push(n[s]), o = {
						x: n[s].x,
						y: n[s].y
					}, s++;
				}
				return r;
			}(a.start, a.cubics, n)) e.push(t);
			else for (const t of a.cubics) e.push(t);
			a = null;
		}
	};
	for (const i of t) if ("C" !== i.type) switch (l(), e.push(i), i.type) {
		case "M":
			r = i.x, o = i.y, s = i.x, c = i.y;
			break;
		case "L":
		case "Q":
		case "A":
			r = i.x, o = i.y;
			break;
		case "Z": r = s, o = c;
	}
	else null === a && (a = {
		start: {
			x: r,
			y: o
		},
		cubics: []
	}), a.cubics.push(i), r = i.x, o = i.y;
	return l(), e;
}
const G = [
	1,
	10,
	100,
	1e3,
	1e4
], H = [
	"",
	"0",
	"00",
	"000",
	"0000"
], J = 0x38d7ea4c68000;
function X(t) {
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
function Y(t, n) {
	const e = t < 0;
	let r = String(Math.abs(t));
	r.length <= n && (r = "0".repeat(n - r.length + 1) + r);
	const o = r.length - n, s = r.slice(0, o);
	let c = r.length;
	for (; c > o && 48 === r.charCodeAt(c - 1);) c--;
	const a = c > o ? `${s}.${r.slice(o, c)}` : s;
	return e && "0" !== a ? `-${a}` : a;
}
function _(t, n) {
	if (0 === n) return String(0 | t);
	const e = t < 0 ? -t : t;
	if (!(e <= J && Number.isInteger(e))) return Y(t, n);
	const r = G[n], o = e % r, s = (e - o) / r;
	if (0 === o) return t < 0 ? `-${s}` : `${s}`;
	let c = o, a = n;
	for (; c % 10 == 0;) c /= 10, a--;
	const l = `${H[a - X(c)]}${c}`;
	return t < 0 ? `-${s}.${l}` : `${s}.${l}`;
}
function tt(t, n) {
	if (0 === n) {
		const n = 0 | t;
		return X(n < 0 ? -n : n);
	}
	const e = t < 0 ? -t : t;
	if (!(e <= J && Number.isInteger(e))) {
		const e = Y(t, n);
		return 45 === e.charCodeAt(0) ? e.length - 1 : e.length;
	}
	const r = G[n], o = e % r, s = (e - o) / r;
	if (0 === o) return X(s);
	let c = o, a = n;
	for (; c % 10 == 0;) c /= 10, a--;
	return X(s) + 1 + a;
}
function nt(t, n, e) {
	const r = t * e, o = Math.round(r);
	return Math.abs(r - o) < .5 - (2e-16 * Math.abs(r) + 1e-9) ? o : Math.round(Number(t.toFixed(n)) * e);
}
function et(t) {
	return "Z" === t.type ? 0 : t.x;
}
function rt(t) {
	return "Z" === t.type ? 0 : t.y;
}
const ot = (t) => "L" === t.type, st = (t) => "C" === t.type, ct = (t) => "L" === t.type || "C" === t.type;
function at(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, c = 3 * r * e * e, a = e * e * e;
	return {
		x: o * t.x + s * n.x1 + c * n.x2 + a * n.x,
		y: o * t.y + s * n.y1 + c * n.y2 + a * n.y
	};
}
function lt(t, n, e, r, o, s, c) {
	const a = Math.abs(t - e) - (o - c), l = Math.abs(n - r) - (s - c), i = Math.max(a, 0), u = Math.max(l, 0);
	return (0 === u ? i : 0 === i ? u : Math.hypot(i, u)) + Math.min(Math.max(a, l), 0) - c;
}
function it(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function ut(t, n, e, r, o, s) {
	const c = o - e, a = s - r, l = c * c + a * a;
	let i = l > 0 ? ((t - e) * c + (n - r) * a) / l : 0;
	return i = i < 0 ? 0 : i > 1 ? 1 : i, Math.hypot(t - (e + i * c), n - (r + i * a));
}
const ht = (t) => (t * (t - 1) >> 1) - 3;
function ft(t, n) {
	const e = D(n), r = (t) => Number(t.toFixed(e));
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
function yt(t, n, e) {
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
	const o = r.ops;
	if (o.every(ot)) {
		const t = function(t, n, e) {
			const r = function(t, n, e) {
				const r = [t];
				for (const c of n) r.push({
					x: c.x,
					y: c.y
				});
				const o = r[0], s = r[r.length - 1];
				return r.length > 1 && Math.round(o.x * e) === Math.round(s.x * e) && Math.round(o.y * e) === Math.round(s.y * e) && r.pop(), r;
			}(t, n, e);
			if (4 !== r.length) return null;
			const o = r.map((t) => Math.round(t.x * e)), s = r.map((t) => Math.round(t.y * e)), c = Math.min(...o), a = Math.max(...o), l = Math.min(...s), i = Math.max(...s);
			if (a === c || i === l) return null;
			for (let u = 0; u < 4; u++) {
				if (o[u] !== c && o[u] !== a || s[u] !== l && s[u] !== i) return null;
				const t = (u + 1) % 4;
				if (o[u] !== o[t] && s[u] !== s[t]) return null;
			}
			return 4 !== new Set(o.map((t, n) => `${t},${s[n]}`)).size ? null : {
				kind: "rect",
				x: c / e,
				y: l / e,
				width: (a - c) / e,
				height: (i - l) / e
			};
		}(r.start, o, 10 ** D(n));
		if (t) return t;
	}
	if (!e) return null;
	if (o.length >= 3 && o.every(st)) {
		const t = function(t, n, e) {
			const r = [t];
			let o = t;
			for (const a of n) r.push(at(o, a, .25), at(o, a, .5), at(o, a, .75)), r.push({
				x: a.x,
				y: a.y
			}), o = {
				x: a.x,
				y: a.y
			};
			const s = U(r);
			if (s && s.r > 0) {
				const t = .6;
				if (r.every((n) => Math.abs(Math.hypot(n.x - s.cx, n.y - s.cy) - s.r) <= t)) return ft({
					kind: "circle",
					cx: s.cx,
					cy: s.cy,
					r: s.r
				}, e);
			}
			const c = j(r);
			if (c && c.rx > 0 && c.ry > 0) {
				const t = .6, n = Math.cos(c.angle), o = Math.sin(c.angle);
				if (r.every((e) => {
					const r = e.x - c.cx, s = e.y - c.cy, a = (r * n + s * o) / c.rx, l = (-r * o + s * n) / c.ry;
					return Math.abs(Math.hypot(a, l) - 1) * Math.min(c.rx, c.ry) <= t;
				})) {
					const t = 180 * c.angle / Math.PI, n = Math.abs(t) < .5 ? void 0 : t;
					return ft({
						kind: "ellipse",
						cx: c.cx,
						cy: c.cy,
						rx: c.rx,
						ry: c.ry,
						...void 0 !== n ? { angle: n } : {}
					}, e);
				}
			}
			return null;
		}(r.start, o, n);
		if (t) return t;
	}
	if (o.length >= 4 && o.some(st) && o.every(ct)) {
		const t = function(t, n, e) {
			const r = 1 + 2 * n.length, o = new Float64Array(r), s = new Float64Array(r);
			o[0] = t.x, s[0] = t.y;
			let c = t.x, a = t.y, l = 1;
			for (const v of n) "C" === v.type ? (o[l] = .125 * c + .375 * v.x1 + .375 * v.x2 + .125 * v.x, s[l] = .125 * a + .375 * v.y1 + .375 * v.y2 + .125 * v.y) : (o[l] = (c + v.x) / 2, s[l] = (a + v.y) / 2), o[l + 1] = v.x, s[l + 1] = v.y, l += 2, c = v.x, a = v.y;
			let i = 1 / 0, u = -1 / 0, h = 1 / 0, f = -1 / 0;
			for (let v = 0; v < r; v++) i = Math.min(i, o[v]), u = Math.max(u, o[v]), h = Math.min(h, s[v]), f = Math.max(f, s[v]);
			const y = (i + u) / 2, p = (h + f) / 2, x = (u - i) / 2, M = (f - h) / 2;
			if (x <= 0 || M <= 0) return null;
			const d = Math.min(x, M), g = Math.max(.75, .03 * d), w = .3 * d + g;
			for (let v = 0; v < r; v++) if (Math.min(x - Math.abs(o[v] - y), M - Math.abs(s[v] - p)) > w) return null;
			const m = (t, n) => {
				let e = 0;
				for (let c = 0; c < r; c++) {
					const r = Math.abs(lt(o[c], s[c], y, p, x, M, t));
					if (r > e && (e = r, e >= n)) return e;
				}
				return e;
			}, b = d / 64;
			let k = b, A = 1 / 0;
			for (let v = 1; v <= 64; v++) {
				const t = m(b * v, A);
				t < A && (A = t, k = b * v);
			}
			return A - b > g ? null : (k = function(t, n, e) {
				const r = (Math.sqrt(5) - 1) / 2;
				let o = e - r * (e - n), s = n + r * (e - n), c = t(o), a = t(s);
				for (let l = 0; l < 40; l++) c < a ? (e = s, s = o, a = c, o = e - r * (e - n), c = t(o)) : (n = o, o = s, c = a, s = n + r * (e - n), a = t(s));
				return (n + e) / 2;
			}((t) => m(t, 1 / 0), Math.max(0, k - b), Math.min(d, k + b)), A = m(k, 1 / 0), A > g || k < g ? null : ft({
				kind: "rrect",
				x: y - x,
				y: p - M,
				width: 2 * x,
				height: 2 * M,
				r: k
			}, e));
		}(r.start, o, n);
		if (t) return t;
	}
	return o.length < 3 ? null : function(t, n, e) {
		const r = [], o = [];
		(function(t, n, e, r) {
			let o = t.x, s = t.y;
			for (const c of n) if ("C" === c.type) {
				for (let t = 0; t < 8; t++) {
					const n = t / 8, a = 1 - n, l = a * a * a, i = 3 * a * a * n, u = 3 * a * n * n, h = n * n * n;
					e.push(l * o + i * c.x1 + u * c.x2 + h * c.x), r.push(l * s + i * c.y1 + u * c.y2 + h * c.y);
				}
				o = c.x, s = c.y;
			} else if ("Q" === c.type) {
				for (let t = 0; t < 8; t++) {
					const n = t / 8, a = 1 - n;
					e.push(a * a * o + 2 * a * n * c.x1 + n * n * c.x), r.push(a * a * s + 2 * a * n * c.y1 + n * n * c.y);
				}
				o = c.x, s = c.y;
			} else if ("L" === c.type) {
				const t = Math.max(1, Math.round(Math.hypot(c.x - o, c.y - s) / 2));
				for (let n = 0; n < t; n++) e.push(o + (c.x - o) * n / t), r.push(s + (c.y - s) * n / t);
				o = c.x, s = c.y;
			}
			if (Math.hypot(o - t.x, s - t.y) > 1e-6) {
				const n = Math.max(1, Math.round(Math.hypot(t.x - o, t.y - s) / 2));
				for (let c = 0; c < n; c++) e.push(o + (t.x - o) * c / n), r.push(s + (t.y - s) * c / n);
			}
		})(t, n, r, o);
		const s = r.length;
		if (s < 24) return null;
		let c = 0, a = 0;
		for (let Z = 0; Z < s; Z++) c += r[Z], a += o[Z];
		const l = c / s, i = a / s, u = new Float64Array(s), h = new Float64Array(s);
		let f = -1 / 0, y = 1 / 0, p = -1 / 0, x = 1 / 0, M = -1 / 0;
		for (let Z = 0; Z < s; Z++) u[Z] = Math.hypot(r[Z] - l, o[Z] - i), h[Z] = Math.atan2(o[Z] - i, r[Z] - l), f = Math.max(f, u[Z]), y = Math.min(y, r[Z]), p = Math.max(p, r[Z]), x = Math.min(x, o[Z]), M = Math.max(M, o[Z]);
		if (f < 3) return null;
		const d = Math.min(4, Math.max(.8, .045 * f)), g = (t, n, e) => {
			let r = 1 / 0, o = -1 / 0, s = 1 / 0, c = -1 / 0;
			for (let l = 0; l < e; l++) t[l] < r && (r = t[l]), t[l] > o && (o = t[l]), n[l] < s && (s = n[l]), n[l] > c && (c = n[l]);
			const a = 2 * d;
			return Math.abs(r - y) <= a && Math.abs(o - p) <= a && Math.abs(s - x) <= a && Math.abs(c - M) <= a;
		}, w = (t, n, e, c, a) => {
			let l = 0;
			for (let i = 0; i < s; i++) {
				const s = h[i];
				let u = !1;
				for (let t = 0; t < c; t++) if (Math.abs(it(s, e[t])) < a) {
					u = !0;
					break;
				}
				if (u) continue;
				let f = 1 / 0;
				for (let e = 0; e < c && f > d; e++) {
					const s = (e + 1) % c, a = ut(r[i], o[i], t[e], n[e], t[s], n[s]);
					a < f && (f = a);
				}
				if (f > d) return !1;
				l++;
			}
			return l >= c;
		};
		let m = 0;
		for (let Z = 1; Z < s; Z++) u[Z] > u[m] && (m = Z);
		const b = h[m], k = /* @__PURE__ */ new Float64Array(75), A = /* @__PURE__ */ new Float64Array(75), v = /* @__PURE__ */ new Uint8Array(75), I = /* @__PURE__ */ new Uint8Array(75), $ = /* @__PURE__ */ new Uint8Array(13), P = (t) => {
			if (1 === $[t]) return;
			$[t] = 1;
			const n = ht(t), e = 2 * Math.PI / t, r = e / 5;
			for (let o = 0; o < t; o++) k[n + o] = -1 / 0, A[n + o] = 1 / 0;
			for (let o = 0; o < s; o++) {
				const s = h[o], c = (s - b) / e, a = Math.floor(c), l = c - a;
				if (l < .200000001 || l > .799999999) {
					let c = (0 | (l < .5 ? a : a + 1)) % t;
					c < 0 && (c += t), Math.abs(it(s, b + c * e)) <= r && (v[n + c] = 1, u[o] > k[n + c] && (k[n + c] = u[o]));
				} else if (l > .29999999899999996 && l < .700000001) {
					let c = (0 | a) % t;
					c < 0 && (c += t), Math.abs(it(s, b + (c + .5) * e)) <= r && (I[n + c] = 1, u[o] < A[n + c] && (A[n + c] = u[o]));
				}
			}
		}, L = (t) => {
			const n = ht(t);
			for (let e = 0; e < t; e++) if (0 === v[n + e] || 0 === I[n + e]) return !1;
			return !0;
		}, C = /* @__PURE__ */ new Float64Array(24), F = /* @__PURE__ */ new Float64Array(24), q = /* @__PURE__ */ new Float64Array(24), O = (t) => {
			const n = [];
			for (let e = 0; e < t; e++) n.push({
				x: C[e],
				y: F[e]
			});
			return n;
		};
		for (let Z = 3; Z <= 12; Z++) {
			if (P(Z), !L(Z)) continue;
			const t = ht(Z), n = 2 * Math.PI / Z;
			let r = 0;
			for (let e = 0; e < Z; e++) r += A[t + e];
			const o = r / Z / Math.cos(Math.PI / Z);
			for (let e = 0; e < Z; e++) {
				const t = b + e * n;
				q[e] = t, C[e] = l + o * Math.cos(t), F[e] = i + o * Math.sin(t);
			}
			if (4 === Z) {
				const t = Math.atan2(Math.abs(F[1] - F[0]), Math.abs(C[1] - C[0]));
				if (t < Math.PI / 12 || t > Math.PI / 2 - Math.PI / 12) continue;
			}
			if (g(C, F, Z) && w(C, F, q, Z, .18 * n)) return ft({
				kind: "polygon",
				points: O(Z)
			}, e);
		}
		for (let Z = 3; Z <= 12; Z++) {
			if (P(Z), !L(Z)) continue;
			const t = ht(Z), n = 2 * Math.PI / Z;
			let r = 0, o = 0;
			for (let e = 0; e < Z; e++) r += k[t + e], o += A[t + e];
			const s = r / Z, c = o / Z;
			if (!(c >= s * Math.cos(Math.PI / Z) - d)) {
				for (let t = 0; t < 2 * Z; t++) {
					const e = b + t * n / 2;
					q[t] = e;
					const r = t % 2 == 0 ? s : c;
					C[t] = l + r * Math.cos(e), F[t] = i + r * Math.sin(e);
				}
				if (g(C, F, 2 * Z) && w(C, F, q, 2 * Z, .09 * n)) return ft({
					kind: "polygon",
					points: O(2 * Z)
				}, e);
			}
		}
		return null;
	}(r.start, o, n);
}
const pt = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function xt(t, n) {
	if (t.includes("<") || t.includes("\"")) throw new Error(`unsafe ${n} in SVG output: ${JSON.stringify(t)}`);
	return t;
}
function Mt(t, n, e) {
	let r = "";
	var o;
	return r += ` fill="${void 0 === t.fill ? "none" : xt(t.fill, "fill")}"`, e && void 0 !== t.fillRule && (r += ` fill-rule="${t.fillRule}"`), void 0 !== t.stroke && (r += ` stroke="${xt(t.stroke, "stroke")}"`), void 0 !== t.strokeWidth && (r += ` stroke-width="${N(t.strokeWidth, n)}"`), void 0 !== t.strokeLinecap && (r += ` stroke-linecap="${t.strokeLinecap}"`), void 0 !== t.strokeLinejoin && (r += ` stroke-linejoin="${t.strokeLinejoin}"`), void 0 !== t.id && "" !== t.id && (r += ` id="${o = t.id, o.replace(/[&<>"']/g, (t) => pt[t])}"`), r;
}
function dt(t, n, e) {
	const r = Mt(n, e, !1), o = (t) => N(t, e);
	switch (t.kind) {
		case "rect": return `<rect x="${o(t.x)}" y="${o(t.y)}" width="${o(t.width)}" height="${o(t.height)}"${r}/>`;
		case "rrect": return `<rect x="${o(t.x)}" y="${o(t.y)}" width="${o(t.width)}" height="${o(t.height)}" rx="${o(t.r)}"${r}/>`;
		case "circle": return `<circle cx="${o(t.cx)}" cy="${o(t.cy)}" r="${o(t.r)}"${r}/>`;
		case "ellipse": {
			const n = void 0 !== t.angle && Math.abs(t.angle) > .05 ? ` transform="rotate(${o(t.angle)} ${o(t.cx)} ${o(t.cy)})"` : "";
			return `<ellipse cx="${o(t.cx)}" cy="${o(t.cy)}" rx="${o(t.rx)}" ry="${o(t.ry)}"${n}${r}/>`;
		}
		case "polygon": return `<polygon points="${t.points.map((t) => `${o(t.x)},${o(t.y)}`).join(" ")}"${r}/>`;
	}
}
function gt(t, n, e, r) {
	if (0 === t.commands.length) return null;
	if (void 0 === t.fill && void 0 === t.stroke) return null;
	if (e) {
		const e = function(t, n) {
			const e = 10 ** D(n);
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
				for (const c of t.ops) r.push({
					x: et(c),
					y: rt(c),
					edge: c.type,
					op: c
				});
				const o = r.slice(0, 1);
				for (let c = 1; c < r.length; c++) {
					let t = r[c];
					for (; o.length >= 2 && "L" === o[o.length - 1].edge && "L" === t.edge;) {
						const n = o[o.length - 2], r = o[o.length - 1], s = e(n.x), c = e(n.y), a = e(r.x), l = e(r.y), i = e(t.x), u = e(t.y), h = (a - s) * (i - s) + (l - c) * (u - c);
						if (!(0 === (a - s) * (u - c) - (l - c) * (i - s) && h >= 0 && h <= (i - s) * (i - s) + (u - c) * (u - c))) break;
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
				for (let c = 1; c < o.length; c++) s.push(o[c].op);
				return {
					start: t.start,
					ops: s,
					closed: t.closed
				};
			}(t, e)));
		}(t.commands, n), o = yt(e, n, r);
		if (null !== o) return {
			kind: "element",
			svg: dt(o, t, n)
		};
		const s = xt(function(t, n) {
			const e = D(n), r = G[e];
			let o = 0, s = 0, c = 0, a = 0, l = !1, i = "";
			const u = /* @__PURE__ */ new Float64Array(6), h = /* @__PURE__ */ new Float64Array(6), f = (t, n, r, o) => {
				i += "" === i ? t : ` ${t}`;
				for (let s = r; s < r + o; s++) {
					const t = _(n[s], e);
					45 !== t.charCodeAt(0) && (i += " "), i += t;
				}
			}, y = (t, n, r, o) => {
				f(t, u, 0, 3), i += ` ${r} ${o}`;
				for (let s = 3; s < 5; s++) {
					const t = _(n[s], e);
					45 !== t.charCodeAt(0) && (i += " "), i += t;
				}
			};
			for (const p of t) switch (p.type) {
				case "M": {
					const t = nt(p.x, e, r), n = nt(p.y, e, r);
					if (u[0] = t, u[1] = n, l) {
						h[0] = t - o, h[1] = n - s;
						const r = tt(t, e) + tt(n, e);
						tt(h[0], e) + tt(h[1], e) < r ? f("m", h, 0, 2) : f("M", u, 0, 2);
					} else f("M", u, 0, 2), l = !0;
					o = t, s = n, c = t, a = n;
					break;
				}
				case "L": {
					const t = nt(p.x, e, r), n = nt(p.y, e, r);
					u[0] = t, u[1] = n, h[0] = t - o, h[1] = n - s;
					let c = "L", a = u, l = 0, i = 2, y = tt(t, e) + tt(n, e) + 2;
					const x = tt(h[0], e) + tt(h[1], e) + 2;
					if (x < y && (y = x, c = "l", a = h), n === s) {
						const n = tt(t, e) + 1;
						n < y && (y = n, c = "H", a = u, l = 0, i = 1);
						const r = tt(h[0], e) + 1;
						r < y && (y = r, c = "h", a = h, l = 0, i = 1);
					}
					if (t === o) {
						const t = tt(n, e) + 1;
						t < y && (y = t, c = "V", a = u, l = 1, i = 1);
						const r = tt(h[1], e) + 1;
						r < y && (y = r, c = "v", a = h, l = 1, i = 1);
					}
					f(c, a, l, i), o = t, s = n;
					break;
				}
				case "Q": {
					u[0] = nt(p.x1, e, r), u[1] = nt(p.y1, e, r), u[2] = nt(p.x, e, r), u[3] = nt(p.y, e, r), h[0] = u[0] - o, h[1] = u[1] - s, h[2] = u[2] - o, h[3] = u[3] - s;
					let t = 0, n = 0;
					for (let r = 0; r < 4; r++) t += tt(u[r], e), n += tt(h[r], e);
					n < t ? f("q", h, 0, 4) : f("Q", u, 0, 4), o = u[2], s = u[3];
					break;
				}
				case "C": {
					u[0] = nt(p.x1, e, r), u[1] = nt(p.y1, e, r), u[2] = nt(p.x2, e, r), u[3] = nt(p.y2, e, r), u[4] = nt(p.x, e, r), u[5] = nt(p.y, e, r);
					for (let e = 0; e < 6; e += 2) h[e] = u[e] - o, h[e + 1] = u[e + 1] - s;
					let t = 0, n = 0;
					for (let r = 0; r < 6; r++) t += tt(u[r], e), n += tt(h[r], e);
					n < t ? f("c", h, 0, 6) : f("C", u, 0, 6), o = u[4], s = u[5];
					break;
				}
				case "A": {
					u[0] = nt(p.rx, e, r), u[1] = nt(p.ry, e, r), u[2] = nt(p.rotation, e, r), u[3] = nt(p.x, e, r), u[4] = nt(p.y, e, r), h[3] = u[3] - o, h[4] = u[4] - s;
					const t = tt(u[3], e) + tt(u[4], e);
					tt(h[3], e) + tt(h[4], e) < t ? y("a", h, p.largeArc ? 1 : 0, p.sweep ? 1 : 0) : y("A", u, p.largeArc ? 1 : 0, p.sweep ? 1 : 0), o = u[3], s = u[4];
					break;
				}
				case "Z": i += "" === i ? "Z" : " Z", o = c, s = a;
			}
			return i;
		}(r ? V(e, n) : e, n), "path data");
		return "" === s ? null : {
			kind: "path",
			d: s,
			paint: Mt(t, n, !0)
		};
	}
	const o = xt(function(t, n) {
		const e = D(n);
		let r = "";
		const o = (t) => {
			"" !== r && 45 !== t.charCodeAt(0) && (r += " "), r += t;
		}, s = (t) => {
			o(N(t, e));
		};
		for (const c of t) switch (c.type) {
			case "M":
			case "L":
				o(c.type), s(c.x), s(c.y);
				break;
			case "Q":
				o("Q"), s(c.x1), s(c.y1), s(c.x), s(c.y);
				break;
			case "C":
				o("C"), s(c.x1), s(c.y1), s(c.x2), s(c.y2), s(c.x), s(c.y);
				break;
			case "A":
				o("A"), s(c.rx), s(c.ry), s(c.rotation), o(c.largeArc ? "1" : "0"), o(c.sweep ? "1" : "0"), s(c.x), s(c.y);
				break;
			case "Z": o("Z");
		}
		return r;
	}(t.commands, n), "path data");
	return "" === o ? null : {
		kind: "element",
		svg: `<path d="${o}"${Mt(t, n, !0)}/>`
	};
}
function wt(t) {
	return [t.data.buffer, t.offsets.buffer];
}
function mt(t, n) {
	const e = t.offsets[n], r = t.offsets[n + 1], o = new Array(r - e);
	for (let s = e; s < r; s++) o[s - e] = t.data[s];
	return o;
}
function bt(t) {
	return t.offsets.length - 1;
}
function kt(t) {
	switch (t.type) {
		case "M":
		case "L": return 3;
		case "Q": return 5;
		case "C": return 7;
		case "A": return 8;
		case "Z": return 1;
	}
}
function At(t, n, e) {
	switch (e.type) {
		case "M": return t[n] = 0, t[n + 1] = e.x, t[n + 2] = e.y, n + 3;
		case "L": return t[n] = 1, t[n + 1] = e.x, t[n + 2] = e.y, n + 3;
		case "Q": return t[n] = 2, t[n + 1] = e.x1, t[n + 2] = e.y1, t[n + 3] = e.x, t[n + 4] = e.y, n + 5;
		case "C": return t[n] = 3, t[n + 1] = e.x1, t[n + 2] = e.y1, t[n + 3] = e.x2, t[n + 4] = e.y2, t[n + 5] = e.x, t[n + 6] = e.y, n + 7;
		case "A": return t[n] = 4, t[n + 1] = e.rx, t[n + 2] = e.ry, t[n + 3] = e.rotation, t[n + 4] = e.largeArc ? 1 : 0, t[n + 5] = e.sweep ? 1 : 0, t[n + 6] = e.x, t[n + 7] = e.y, n + 8;
		case "Z": return t[n] = 5, n + 1;
	}
}
function vt(t) {
	const n = new Int32Array(t.length + 1);
	let e = 0;
	for (let s = 0; s < t.length; s++) {
		for (const n of t[s]) e += kt(n);
		n[s + 1] = e;
	}
	const r = new Float64Array(e);
	let o = 0;
	for (const s of t) for (const t of s) o = At(r, o, t);
	return {
		data: r,
		offsets: n
	};
}
function It(t) {
	let n = null, e = null, r = null, s = null;
	const l = /* @__PURE__ */ new Set(), i = (n, e) => t.postMessage(n, e);
	function u(t) {
		if (("trace-layers" === t.kind ? e?.msg.key : "trace-rings" === t.kind ? r?.msg.key : s?.key) !== t.stateKey) throw new Error(`helper: ${t.kind} payload ${t.stateKey} was replaced`);
	}
	function h(t, n, o, s) {
		if (n.cutout) return { shapes: f(n.cutout, o) };
		const c = n.curve;
		if (!c) throw new Error(`helper: no curve options for ${t.kind}`);
		const a = "trace-layers" === t.kind ? function(t, n) {
			const r = e;
			if (!r) throw new Error("helper: no stacked plan for trace-layers");
			let o = r.layers.get(n);
			o || (o = { paths: x(r, n) }, r.layers.set(n, o));
			const s = "pixel" !== t.curveMode;
			return s && !o.polygons && (o.polygons = o.paths.map((t) => z(t.points))), function(t, n, e) {
				const r = (t, r) => e ? T(t.points, e[r], n) : E(t.points, n), o = [], s = new Int32Array(t.length);
				for (let a = 0; a < t.length; a++) {
					const n = t[a];
					n.area > 0 ? (s[a] = o.length, o.push({
						area: n.area,
						commands: r(n, a),
						holes: []
					})) : n.parent >= 0 && o[s[n.parent]].holes.push(r(n, a));
				}
				const c = o.map((t) => ({
					commands: t.commands.concat(...t.holes),
					area: t.area,
					holeCount: t.holes.length
				}));
				return c.sort((t, n) => n.area - t.area), c;
			}(o.paths, t, s ? o.polygons : void 0).map((t) => t.commands);
		}(c, o) : function(t, n) {
			const e = r;
			if (!e) throw new Error("helper: no rings for trace-rings");
			const o = e.local.get(n);
			if (void 0 === o) throw new Error(`helper: ring ${n} not held`);
			let s = null;
			if ("pixel" !== t.curveMode) {
				const t = e.polygons[o];
				s = void 0 === t ? z(mt(e.msg.rings, o), e.coverage) : t, e.polygons[o] = s;
			}
			return [T(null === s ? mt(e.msg.rings, o) : [], s, t)];
		}(c, o), l = t.serialize;
		if (!l) return { shapes: a };
		const i = t.meta?.[s], u = i?.under ? [i.under, i.own] : [i?.own ?? {}], h = [];
		for (const e of u) for (const t of a) h.push(gt({
			...e,
			commands: t
		}, l.precision, l.optimize, l.roundPrimitives));
		return {
			shapes: a,
			svg: h
		};
	}
	function f(t, n) {
		const e = s;
		if (!e) throw new Error("helper: no chains for fit-chains");
		const r = e.local.get(n);
		if (void 0 === r) throw new Error(`helper: chain ${n} not held`);
		const o = function(t, n, e) {
			const r = t.chains[n], o = function(t, n, e) {
				const r = e.colorField;
				if (!r || n.left < 0 || n.right < 0) return;
				const o = 3 * n.left, s = 3 * n.right;
				return function(t, n, e, r, o) {
					const s = r[0], c = r[1], a = r[2], l = o[0], i = o[1], u = o[2], h = s - l, f = c - i, y = a - u, p = Math.sqrt(h * h + f * f + y * y), x = p > 1e-6 ? .5 / p : 0;
					return {
						width: n,
						height: e,
						at(e, r) {
							const o = 3 * (r * n + e), h = t[o], f = t[o + 1], y = t[o + 2], p = h - s, M = f - c, d = y - a, g = h - l, w = f - i, m = y - u, b = (Math.sqrt(p * p + M * M + d * d) - Math.sqrt(g * g + w * w + m * m)) * x;
							return b < -.5 ? -.5 : b > .5 ? .5 : b;
						}
					};
				}(r.oklab, t.width, t.height, [
					r.paletteOklab[o],
					r.paletteOklab[o + 1],
					r.paletteOklab[o + 2]
				], [
					r.paletteOklab[s],
					r.paletteOklab[s + 1],
					r.paletteOklab[s + 2]
				]);
			}(t, r, e), s = function(t, n, e) {
				if (!e.refineChain) return t;
				const r = n.points[0], o = n.points[1];
				return e.refineChain([{
					type: "M",
					x: r,
					y: o
				}, ...t]).filter((t) => "M" !== t.type && "Z" !== t.type);
			}(function(t, n, e) {
				if (t.length >> 1 < 2) return [];
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
				const r = L(t);
				let o = t;
				if (e) {
					o = Z(t, e);
					const n = o.length;
					o[0] = t[0], o[1] = t[1], o[n - 2] = t[n - 2], o[n - 1] = t[n - 1];
				}
				const s = y(o, a(o), r, !1), c = s.length >> 1;
				if ("polygon" === n.curveMode || c <= 2) {
					const t = [];
					for (let n = 1; n < c; n++) t.push({
						type: "L",
						x: s[2 * n],
						y: s[2 * n + 1]
					});
					return t;
				}
				const l = function(t, n, e) {
					const r = t.length >> 1, o = [];
					for (let s = 1; s < r - 1; s++) o.push(F(t[2 * (s - 1)], t[2 * (s - 1) + 1], t[2 * s], t[2 * s + 1], t[2 * (s + 1)], t[2 * (s + 1) + 1], n, e));
					return o;
				}(s, 4 * n.smoothing / 3, n.cornerThreshold), i = [], u = (s[0] + s[2]) / 2, h = (s[1] + s[3]) / 2;
				return i.push({
					type: "L",
					x: u,
					y: h
				}), i.push(...v(u, h, l, n.curveOptimize, n.optTolerance)), i.push({
					type: "L",
					x: s[2 * (c - 1)],
					y: s[2 * (c - 1) + 1]
				}), i;
			}(r.points, e, o), r, e);
			if (!r.loop) return { open: s };
			const c = function(t, n, e) {
				const r = t.slice(0, t.length - 2), o = r.length >> 1;
				let s = 0;
				for (let a = 0; a < o; a++) {
					const t = (a + o - 1) % o, n = (a + 1) % o, e = r[2 * a] - r[2 * t], c = r[2 * a + 1] - r[2 * t + 1], l = r[2 * n] - r[2 * a];
					if (e * (r[2 * n + 1] - r[2 * a + 1]) - c * l !== 0) {
						s = a;
						break;
					}
				}
				const c = new Array(r.length);
				for (let a = 0; a < o; a++) {
					const t = (s + a) % o;
					c[2 * a] = r[2 * t], c[2 * a + 1] = r[2 * t + 1];
				}
				return E(c, n, e);
			}(r.points, e, o);
			return {
				open: s,
				closed: e.refineChain ? e.refineChain(c) : c
			};
		}(e.network, r, t);
		return o.closed ? [o.open, o.closed] : [o.open];
	}
	function p() {
		const t = n;
		if (!t) throw new Error("helper: no working image");
		return t.oklab ??= function(t) {
			const { width: n, height: e, data: r } = t, s = n * e, c = new Float32Array(3 * s);
			for (let a = 0, l = 0, i = 0; a < s; a++, l += 4, i += 3) {
				const t = o[r[l]], n = o[r[l + 1]], e = o[r[l + 2]], s = Math.cbrt(.4122214708 * t + .5363325363 * n + .0514459929 * e), a = Math.cbrt(.2119034982 * t + .6806995451 * n + .1073969566 * e), u = Math.cbrt(.0883024619 * t + .2817188376 * n + .6299787005 * e);
				c[i] = .2104542553 * s + .793617785 * a - .0040720468 * u, c[i + 1] = 1.9779984951 * s - 2.428592205 * a + .4505937099 * u, c[i + 2] = .0259040371 * s + .7827717662 * a - .808675766 * u;
			}
			return c;
		}(t.image);
	}
	function x(t, n) {
		const { width: e, height: r, turnPolicy: o } = t.msg, s = Math.max(1, t.msg.minArea), a = t.mask.data;
		if (a.fill(0), n >= t.order.length) {
			const e = n - t.order.length;
			for (let n = t.islandOffsets[e]; n < t.islandOffsets[e + 1]; n++) a[t.islandPixels[n]] = 1;
			return c(t.mask, o, s);
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
		const l = t.order[n], i = t.union, u = t.flood, h = e * r;
		let f = 0;
		for (let c = t.offset[l]; c < t.offset[l + 1]; c++) {
			const n = t.bucket[c];
			0 === a[n] && (a[n] = 1, u[f++] = n);
		}
		for (; f > 0;) {
			const t = u[--f], n = t - (t / e | 0) * e;
			n > 0 && 1 === i[t - 1] && 0 === a[t - 1] && (a[t - 1] = 1, u[f++] = t - 1), n < e - 1 && 1 === i[t + 1] && 0 === a[t + 1] && (a[t + 1] = 1, u[f++] = t + 1), t >= e && 1 === i[t - e] && 0 === a[t - e] && (a[t - e] = 1, u[f++] = t - e), t < h - e && 1 === i[t + e] && 0 === a[t + e] && (a[t + e] = 1, u[f++] = t + e);
		}
		return c(t.mask, o, s);
	}
	t.addEventListener("message", (t) => {
		const o = t.data;
		switch (o.type) {
			case "helper-image":
				n = function(t) {
					return { image: {
						width: t.width,
						height: t.height,
						data: new Uint8ClampedArray(t.buffer)
					} };
				}(o);
				return;
			case "helper-stack":
				e = function(t) {
					const n = new Int32Array(t.stackLabels), e = new Int32Array(t.order), r = new Int32Array(t.labelCount).fill(-1);
					for (let i = 0; i < e.length; i++) r[e[i]] = i;
					const o = new Uint32Array(t.labelCount), s = new Uint8Array(n.length);
					for (let i = 0; i < n.length; i++) {
						const t = n[i];
						t >= 0 && (o[t]++, s[i] = 1);
					}
					const c = new Int32Array(t.labelCount + 1);
					for (let i = 0; i < t.labelCount; i++) c[i + 1] = c[i] + o[i];
					const a = new Int32Array(c[t.labelCount]), l = c.slice(0, t.labelCount);
					for (let i = 0; i < n.length; i++) {
						const t = n[i];
						t >= 0 && (a[l[t]++] = i);
					}
					return {
						msg: t,
						labels: n,
						order: e,
						position: r,
						offset: c,
						bucket: a,
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
				}(o);
				return;
			case "helper-rings":
				r = function(t) {
					const n = new Int32Array(t.units);
					if (n.length !== bt(t.rings)) throw new Error("helper: ring count mismatch");
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
				}(o);
				return;
			case "helper-chains":
				s = function(t) {
					const n = new Int32Array(t.units), e = new Int32Array(t.left), r = new Int32Array(t.right), o = new Uint8Array(t.loop);
					if (n.length !== bt(t.points)) throw new Error("helper: chain count mismatch");
					const s = /* @__PURE__ */ new Map(), c = [];
					for (let a = 0; a < n.length; a++) s.set(n[a], a), c.push({
						points: mt(t.points, a),
						left: e[a],
						right: r[a],
						loop: 0 !== o[a],
						firstDir: 0,
						lastDir: 0,
						shoelace: 0
					});
					return {
						key: t.key,
						network: {
							width: t.width,
							height: t.height,
							chains: c,
							areas: /* @__PURE__ */ new Map()
						},
						local: s
					};
				}(o);
				return;
			case "helper-cancel":
				l.add(o.id);
				return;
			case "helper-job":
				(async function(t) {
					const n = Math.max(1, t.batch), e = "fit-chains" !== t.kind && void 0 !== t.serialize;
					try {
						const o = function(t) {
							if ("fit-chains" === t.kind) {
								const n = t.paletteOklab ? new Float32Array(t.paletteOklab) : void 0, e = t.arcPrecision;
								return { cutout: {
									...$t(t.curve),
									colorField: n ? {
										oklab: p(),
										paletteOklab: n
									} : void 0,
									refineChain: void 0 === e ? void 0 : (t) => V(t, e)
								} };
							}
							return { curve: $t(t.curve, "trace-rings" === t.kind ? r?.coverage : void 0) };
						}(t);
						u(t);
						for (let r = 0; r < t.units.length && !l.has(t.id); r += n) {
							const s = [], c = [], a = e ? [] : void 0, l = [], f = e ? [] : void 0;
							for (let e = r; e < Math.min(r + n, t.units.length); e++) {
								const n = t.units[e], r = h(t, o, n, e);
								u(t), s.push(n), c.push(r.shapes.length);
								for (const t of r.shapes) l.push(t);
								f && r.svg && (f.push(...r.svg), a?.push(r.svg.length));
							}
							const y = vt(l);
							i({
								type: "helper-batch",
								id: t.id,
								units: s,
								counts: c,
								svgCounts: a,
								commands: y,
								svg: f
							}, wt(y)), await new Promise((t) => setTimeout(t, 0));
						}
						i({
							type: "helper-done",
							id: t.id
						});
					} catch (o) {
						i({
							type: "helper-error",
							id: t.id,
							message: o instanceof Error ? o.message : String(o)
						});
					} finally {
						l.delete(t.id);
					}
				})(o);
				return;
		}
	});
}
function $t(t, n) {
	return {
		...t,
		coverage: n
	};
}
self.addEventListener("message", (t) => {
	const { port: n } = t.data;
	It(n), n.start();
}, { once: !0 });
