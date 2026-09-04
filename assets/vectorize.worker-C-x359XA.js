function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function e(t) {
	return t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
}
function n(e, n, o) {
	const r = t(e), s = t(n), i = t(o), a = Math.cbrt(.4122214708 * r + .5363325363 * s + .0514459929 * i), l = Math.cbrt(.2119034982 * r + .6806995451 * s + .1073969566 * i), c = Math.cbrt(.0883024619 * r + .2817188376 * s + .6299787005 * i);
	return [
		.2104542553 * a + .793617785 * l - .0040720468 * c,
		1.9779984951 * a - 2.428592205 * l + .4505937099 * c,
		.0259040371 * a + .7827717662 * l - .808675766 * c
	];
}
function o(t, n, o) {
	const s = t + .3963377774 * n + .2158037573 * o, i = t - .1055613458 * n - .0638541728 * o, a = t - .0894841775 * n - 1.291485548 * o, l = s * s * s, c = i * i * i, f = a * a * a, h = -1.2684380046 * l + 2.6097574011 * c - .3413193965 * f, u = -.0041960863 * l - .7034186147 * c + 1.707614701 * f;
	return [
		r(e(4.0767416621 * l - 3.3077115913 * c + .2309699292 * f)),
		r(e(h)),
		r(e(u))
	];
}
function r(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function s(t, e, n, o, r, s) {
	const i = t - o, a = e - r, l = n - s;
	return i * i + a * a + l * l;
}
function i(t, e, n, o, r, i) {
	return Math.sqrt(s(t, e, n, o, r, i));
}
function a(t) {
	const e = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim());
	if (!e) return null;
	let n = e[1];
	return 3 === n.length && (n = n[0] + n[0] + n[1] + n[1] + n[2] + n[2]), [
		Number.parseInt(n.slice(0, 2), 16),
		Number.parseInt(n.slice(2, 4), 16),
		Number.parseInt(n.slice(4, 6), 16)
	];
}
function l(t) {
	return Math.max(0, Math.min(255, Math.round(t))).toString(16).padStart(2, "0");
}
function c(t, e, n) {
	return `#${l(t)}${l(e)}${l(n)}`;
}
function f(t, e, n) {
	const [r, s, i] = o(t, e, n);
	return c(255 * r, 255 * s, 255 * i);
}
var h = class extends Error {
	constructor() {
		super("vectorization cancelled"), this.name = "CancelledError";
	}
};
function u(t) {
	const e = t.length;
	if (e < 6) return 0;
	let n = 0, o = t[e - 2], r = t[e - 1];
	for (let s = 0; s < e; s += 2) {
		const e = t[s], i = t[s + 1];
		n += o * i - e * r, o = e, r = i;
	}
	return n / 2;
}
function d(t) {
	let e = 0;
	for (let n = 2; n < t.length; n += 2) {
		const o = t[n] - t[n - 2], r = t[n + 1] - t[n - 1];
		e += Math.hypot(o, r);
	}
	return e;
}
function p(t, e, n, o, r, s) {
	const i = r - n, a = s - o, l = i * i + a * a;
	if (0 === l) return Math.hypot(t - n, e - o);
	let c = ((t - n) * i + (e - o) * a) / l;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (n + c * i), e - (o + c * a));
}
function y(t, e, n, o, r, s) {
	const i = t - n, a = e - o, l = r - n, c = s - o, f = Math.hypot(i, a), h = Math.hypot(l, c);
	if (0 === f || 0 === h) return 180;
	let u = (i * l + a * c) / (f * h);
	return u = u < -1 ? -1 : u > 1 ? 1 : u, 180 * Math.acos(u) / Math.PI;
}
function g(t, e, n, o) {
	const r = t * n + e * o, s = Math.hypot(t, e) * Math.hypot(n, o);
	let i = Math.acos(Math.min(1, Math.max(-1, 0 === s ? 1 : r / s)));
	return t * o - e * n < 0 && (i = -i), i;
}
function m(t, e, n) {
	let o = Math.abs(n.rx), r = Math.abs(n.ry);
	if (0 === o || 0 === r) return null;
	const s = n.rotation * Math.PI / 180, i = Math.cos(s), a = Math.sin(s), l = (t - n.x) / 2, c = (e - n.y) / 2, f = i * l + a * c, h = -a * l + i * c, u = f * f / (o * o) + h * h / (r * r);
	if (u > 1) {
		const t = Math.sqrt(u);
		o *= t, r *= t;
	}
	const d = o * o * r * r - o * o * h * h - r * r * f * f, p = o * o * h * h + r * r * f * f;
	let y = p <= 0 ? 0 : Math.sqrt(Math.max(0, d) / p);
	n.largeArc === n.sweep && (y = -y);
	const m = y * (o * h) / r, w = r * f * -y / o, M = i * m - a * w + (t + n.x) / 2, x = a * m + i * w + (e + n.y) / 2, b = g(1, 0, (f - m) / o, (h - w) / r);
	let A = g((f - m) / o, (h - w) / r, (-f - m) / o, (-h - w) / r) % (2 * Math.PI);
	return !n.sweep && A > 0 && (A -= 2 * Math.PI), n.sweep && A < 0 && (A += 2 * Math.PI), {
		cx: M,
		cy: x,
		rx: o,
		ry: r,
		phi: s,
		theta1: b,
		dTheta: A
	};
}
function w(t, e) {
	return {
		width: t,
		height: e,
		data: new Uint8Array(t * e)
	};
}
function M(t) {
	return {
		width: t.width,
		height: t.height,
		data: new Uint8ClampedArray(t.data)
	};
}
function x(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function b(t, e, n) {
	return x(Math.round(t), e, n);
}
function A(t, e) {
	return t > 0 ? (void 0 !== e && e > 0 ? e : t / 96 * 25.4) / t : 0;
}
function k() {
	return "undefined" != typeof performance ? performance.now() : Date.now();
}
const v = Object.freeze({
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
function I(t, e) {
	return t < 0 ? 0 : t > e ? e : t;
}
function $(t, e) {
	const n = t / e, o = Math.ceil(n) + 1, r = new Int32Array(e), s = new Int32Array(e), i = new Float64Array(e * o);
	for (let a = 0; a < e; a++) {
		const e = a * n, l = (a + 1) * n, c = Math.floor(e), f = Math.min(t, Math.ceil(l));
		r[a] = c;
		let h = 0, u = 0;
		for (let t = c; t < f; t++) {
			const n = Math.min(t + 1, l) - Math.max(t, e), r = n > 0 ? n : 0;
			i[a * o + h] = r, u += r, h++;
		}
		if (s[a] = h, u > 0) {
			const t = 1 / u;
			for (let e = 0; e < h; e++) i[a * o + e] *= t;
		}
	}
	return {
		start: r,
		count: s,
		weight: i,
		stride: o
	};
}
function S(t, e) {
	const { width: n, height: o, data: r } = t;
	if (e <= 0 || Math.max(n, o) <= e) return t;
	const s = e / Math.max(n, o), i = Math.max(1, Math.round(n * s)), a = Math.max(1, Math.round(o * s)), l = $(n, i), c = l.start, f = l.count, h = l.weight, u = l.stride, d = new Float32Array(i * o * 4);
	for (let x = 0; x < o; x++) {
		const t = x * n * 4, e = x * i * 4;
		for (let n = 0; n < i; n++) {
			const o = n * u, s = f[n], i = t + 4 * c[n];
			let a = 0, l = 0, p = 0, y = 0;
			for (let t = 0; t < s; t++) {
				const e = h[o + t], n = i + 4 * t;
				a += r[n] * e, l += r[n + 1] * e, p += r[n + 2] * e, y += r[n + 3] * e;
			}
			const g = e + 4 * n;
			d[g] = a, d[g + 1] = l, d[g + 2] = p, d[g + 3] = y;
		}
	}
	const p = $(o, a), y = p.start, g = p.count, m = p.weight, w = p.stride, M = new Uint8ClampedArray(i * a * 4);
	for (let x = 0; x < a; x++) {
		const t = x * w, e = g[x], n = x * i * 4;
		for (let o = 0; o < i; o++) {
			const r = 4 * o;
			let s = 0, a = 0, l = 0, c = 0;
			for (let n = 0; n < e; n++) {
				const e = m[t + n], o = (y[x] + n) * i * 4 + r;
				s += d[o] * e, a += d[o + 1] * e, l += d[o + 2] * e, c += d[o + 3] * e;
			}
			const f = n + r;
			M[f] = Math.round(s), M[f + 1] = Math.round(a), M[f + 2] = Math.round(l), M[f + 3] = Math.round(c);
		}
	}
	return {
		width: i,
		height: a,
		data: M
	};
}
function F(t, e, n) {
	const { width: o, height: r, data: s } = t;
	if (e <= 0 || n <= 0) throw new RangeError("resize target must be positive");
	if (e === o && n === r) return {
		width: e,
		height: n,
		data: new Float32Array(s)
	};
	const i = new Float32Array(e * n), a = o / e, l = r / n;
	for (let c = 0; c < n; c++) {
		const t = I((c + .5) * l - .5, r - 1), n = Math.floor(t), f = Math.min(r - 1, n + 1), h = t - n;
		for (let r = 0; r < e; r++) {
			const t = I((r + .5) * a - .5, o - 1), l = Math.floor(t), u = Math.min(o - 1, l + 1), d = t - l, p = s[n * o + l] + (s[n * o + u] - s[n * o + l]) * d, y = s[f * o + l] + (s[f * o + u] - s[f * o + l]) * d;
			i[c * e + r] = p + (y - p) * h;
		}
	}
	return {
		width: e,
		height: n,
		data: i
	};
}
function C(t, e) {
	for (let n = 1; n < e; n++) {
		const e = t[n];
		let o = n - 1;
		for (; o >= 0 && t[o] > e;) t[o + 1] = t[o], o--;
		t[o + 1] = e;
	}
}
function L(t, e, n, o) {
	const { width: r, height: s, data: i } = t, a = new Uint8ClampedArray(i.length);
	for (let l = 0; l < i.length; l += 4) {
		const t = i[l + 3];
		if (255 === t) a[l] = i[l], a[l + 1] = i[l + 1], a[l + 2] = i[l + 2];
		else {
			const r = 255 - t;
			a[l] = Math.round((i[l] * t + e * r) / 255), a[l + 1] = Math.round((i[l + 1] * t + n * r) / 255), a[l + 2] = Math.round((i[l + 2] * t + o * r) / 255);
		}
		a[l + 3] = 255;
	}
	return {
		width: r,
		height: s,
		data: a
	};
}
const P = (() => {
	const e = /* @__PURE__ */ new Float64Array(256);
	for (let n = 0; n < 256; n++) e[n] = t(n / 255);
	return e;
})();
function R(t) {
	const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(3 * r);
	for (let i = 0, a = 0, l = 0; i < r; i++, a += 4, l += 3) {
		const t = P[o[a]], e = P[o[a + 1]], n = P[o[a + 2]], r = Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n), i = Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n), c = Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
		s[l] = .2104542553 * r + .793617785 * i - .0040720468 * c, s[l + 1] = 1.9779984951 * r - 2.428592205 * i + .4505937099 * c, s[l + 2] = .0259040371 * r + .7827717662 * i - .808675766 * c;
	}
	return s;
}
const z = .88, U = 1e-5, T = 32, q = .15, H = 32768;
function B(t, e) {
	const n = t[e];
	if (n < 3) return null;
	const o = 1 / n, r = t[e + 1] * o, s = t[e + 2] * o, i = t[e + 3] * o - r * r, a = t[e + 4] * o - r * s, l = t[e + 5] * o - s * s, c = i * l - a * a;
	if (c <= 1e-9) return null;
	const f = l / c, h = -a / c, u = i / c;
	let d = 0, p = 0, y = 0;
	for (let v = 0; v < 3; v++) {
		const n = t[e + 6 + v] * o, i = t[e + 12 + 2 * v] * o - r * n, a = t[e + 13 + 2 * v] * o - s * n, l = f * i + h * a, c = h * i + u * a;
		d += l * l, p += l * c, y += c * c;
	}
	const g = d + y;
	if (g <= 1e-12) return null;
	const m = d * y - p * p, w = Math.sqrt(Math.max(0, g * g / 4 - m)), M = g / 2 + w, x = M / (M + (g / 2 - w));
	let b, A;
	Math.abs(p) > 1e-12 ? (b = M - y, A = p) : d >= y ? (b = 1, A = 0) : (b = 0, A = 1);
	const k = Math.hypot(b, A);
	return k < 1e-12 ? null : (b /= k, A /= k, {
		dx: b,
		dy: A,
		directionality: x
	});
}
function j(t) {
	if (t.length < 3) return 0;
	const e = t[0], n = t[t.length - 1];
	let o = n[0] - e[0], r = n[1] - e[1], s = n[2] - e[2];
	const i = Math.hypot(o, r, s);
	if (i < 1e-6) return 1;
	o /= i, r /= i, s /= i;
	let a = 0, l = 0;
	for (let f = 1; f < t.length; f++) {
		const e = (t[f][0] - t[f - 1][0]) * o + (t[f][1] - t[f - 1][1]) * r + (t[f][2] - t[f - 1][2]) * s;
		e >= 0 ? a += e : l -= e;
	}
	const c = a + l;
	return c > 1e-9 ? l / c : 0;
}
function K(t, e, n) {
	const o = e.slice(), r = n.map((t) => t.slice());
	for (let s = 0; s < t; s++) {
		let e = s, n = Math.abs(o[s * t + s]);
		for (let r = s + 1; r < t; r++) {
			const i = Math.abs(o[r * t + s]);
			i > n && (n = i, e = r);
		}
		if (n < 1e-12) return null;
		if (e !== s) {
			for (let n = 0; n < t; n++) {
				const r = o[s * t + n];
				o[s * t + n] = o[e * t + n], o[e * t + n] = r;
			}
			for (const t of r) {
				const n = t[s];
				t[s] = t[e], t[e] = n;
			}
		}
		const i = o[s * t + s];
		for (let r = 0; r < t; r++) o[s * t + r] /= i;
		for (const t of r) t[s] /= i;
		for (let a = 0; a < t; a++) {
			if (a === s) continue;
			const e = o[a * t + s];
			if (0 !== e) {
				for (let n = 0; n < t; n++) o[a * t + n] -= e * o[s * t + n];
				for (const t of r) t[a] -= e * t[s];
			}
		}
	}
	return r;
}
function O(t, e) {
	const n = t[e];
	if (n < 6) return null;
	const o = 1 / n, r = t[e + 1], s = t[e + 2], i = t[e + 3], a = t[e + 4], l = t[e + 5], c = i + l, f = t[e + 22] + 2 * t[e + 23] + t[e + 24], h = t[e + 18] + t[e + 20], u = t[e + 19] + t[e + 21], d = [
		f,
		h,
		u,
		c,
		h,
		i,
		a,
		r,
		u,
		a,
		l,
		s,
		c,
		r,
		s,
		n
	], p = [
		[
			t[e + 25],
			t[e + 12],
			t[e + 13],
			t[e + 6]
		],
		[
			t[e + 26],
			t[e + 14],
			t[e + 15],
			t[e + 7]
		],
		[
			t[e + 27],
			t[e + 16],
			t[e + 17],
			t[e + 8]
		]
	], y = K(4, d, p);
	if (!y) return null;
	let g = 0, m = 0, w = 0, M = 0, x = 0;
	for (let S = 0; S < 3; S++) {
		const [n, r, s, i] = y[S];
		g += n * n, m += n * r, w += n * s;
		const a = p[S], l = t[e + 6 + S], c = t[e + 9 + S];
		M += Math.max(0, c - (n * a[0] + r * a[1] + s * a[2] + i * a[3])), x += c - l * l * o;
	}
	if (g < 1e-12) return null;
	if (x < 1e-9) return null;
	const b = -m / (2 * g), A = -w / (2 * g), k = r * o, v = s * o, I = Math.sqrt(Math.max(i * o - k * k, 1e-9)), $ = Math.sqrt(Math.max(l * o - v * v, 1e-9));
	return Math.abs(b - k) > 1.4 * I + 1 || Math.abs(A - v) > 1.4 * $ + 1 ? null : {
		cx: b,
		cy: A,
		misfit: M / x
	};
}
function D(t) {
	return null !== t && t.misfit <= .15;
}
function N(t, e, n) {
	n.fill(0);
	for (const o of e) {
		const e = 28 * o;
		for (let o = 0; o < 28; o++) n[o] += t[e + o];
	}
}
function Z(t, e) {
	let n = 0, o = 0;
	for (const r of e) {
		const e = 28 * r, s = t[e];
		if (!(s <= 0)) {
			o += s;
			for (let o = 0; o < 3; o++) n += Math.max(0, t[e + 9 + o] - t[e + 6 + o] * t[e + 6 + o] / s);
		}
	}
	return o > 0 ? n / o : 0;
}
function E(t, e, n) {
	for (let o = 1; o < e.length; o++) if (e[o] >= n) {
		const r = e[o] - e[o - 1], s = r > 1e-9 ? (n - e[o - 1]) / r : 0;
		return t[o - 1] + (t[o] - t[o - 1]) * s;
	}
	return t[t.length - 1];
}
function W(t, e, n) {
	let o = 0, r = 0;
	const s = [0];
	for (const a of e) o += a, a > r && (r = a), s.push(o);
	if (o <= 0 || r > .5 * o) return -1;
	if (r > .04 && r > 4 * o / e.length) return -1;
	const i = t[t.length - 1] - t[0];
	return i < 1e-9 || (E(t, s, .9 * o) - E(t, s, .1 * o)) / i < n ? -1 : o;
}
function Q(t, e, n) {
	const o = [0, t.length - 1];
	for (; o.length < 8;) {
		let r = e, s = -1, i = -1;
		for (let e = 0; e < o.length - 1; e++) {
			const a = o[e], l = o[e + 1], c = t[l] - t[a];
			for (let o = a + 1; o < l; o++) {
				const f = n(o, a, l, c > 1e-9 ? (t[o] - t[a]) / c : 0);
				f > r && (r = f, s = o, i = e + 1);
			}
		}
		if (s < 0) break;
		o.splice(i, 0, s);
	}
	return o;
}
function X(t) {
	const e = t.length, n = [], o = [];
	for (let s = 0; s < e; s++) {
		let e = t[s], r = 1;
		for (; n.length > 0 && n[n.length - 1] > e;) {
			const t = n.pop(), s = o.pop();
			e = (e * r + t * s) / (r + s), r += s;
		}
		n.push(e), o.push(r);
	}
	let r = 0;
	for (let s = 0; s < n.length; s++) for (let e = 0; e < o[s]; e++) t[r++] = n[s];
}
function Y(t) {
	const e = Math.round(1e3 * Math.min(1, Math.max(0, t))) / 1e3;
	return e >= 1 ? void 0 : e;
}
function G(t, e, n, o) {
	const r = t[n] - t[e];
	return Math.abs(r) > 1e-9 ? (o - t[e]) / r : 0;
}
function V(t, e, n) {
	let o = -1, r = -1;
	for (let c = 0; c < T; c++) {
		const s = t[c * e];
		s <= 0 || s < n || (o < 0 && (o = c), r = c);
	}
	if (o < 0) return null;
	const s = t.slice(), i = (t, n) => {
		for (let o = 0; o < e; o++) s[n * e + o] += s[t * e + o];
		s[t * e] = 0;
	};
	let a = o;
	for (; a > 0 && s[(a - 1) * e] > 0;) a--;
	let l = r;
	for (; l + 1 < T && s[(l + 1) * e] > 0;) l++;
	for (let c = 0; c < a; c++) s[c * e] = 0;
	for (let c = l + 1; c < T; c++) s[c * e] = 0;
	for (let c = a; c < o; c++) i(c, o);
	for (let c = r + 1; c <= l; c++) i(c, r);
	return {
		bins: s,
		first: o,
		last: r,
		lo: a / T,
		hi: (l + 1) / T
	};
}
function J(t, e, n, r, s) {
	let a = 0;
	for (let o = 0; o < T; o++) t[12 * o] > a && (a = t[12 * o]);
	const l = a * q, h = V(t, 12, l);
	if (!h) return null;
	const { bins: u, first: d, last: p, hi: y } = h, g = s ? 0 : h.lo, m = 1 / (y - g), w = [], M = [], x = [];
	for (let o = d; o <= p; o++) {
		const t = 12 * o, e = u[t];
		if (e < l || e <= 0) continue;
		const n = 1 / e;
		w.push((u[t + 11] * n - g) * m), M.push([
			u[t + 1] * n,
			u[t + 2] * n,
			u[t + 3] * n
		]), x.push(t);
	}
	const b = w.length;
	if (b < 3) return null;
	const A = M[0], k = M[b - 1];
	if (i(A[0], A[1], A[2], k[0], k[1], k[2]) < r) return null;
	const v = [];
	for (let o = 1; o < b; o++) {
		const t = M[o - 1], e = M[o];
		v.push(i(t[0], t[1], t[2], e[0], e[1], e[2]));
	}
	if (W(w, v, .33) < 0) return null;
	if (j(M) > n) return null;
	(function(t) {
		const e = t.length;
		if (e < 3) return;
		const n = t[0], o = t[e - 1], r = [
			o[0] - n[0],
			o[1] - n[1],
			o[2] - n[2]
		], s = Math.hypot(r[0], r[1], r[2]);
		if (s < 1e-9) return;
		r[0] /= s, r[1] /= s, r[2] /= s;
		const i = t.map((t) => (t[0] - n[0]) * r[0] + (t[1] - n[1]) * r[1] + (t[2] - n[2]) * r[2]), a = i.slice();
		X(a);
		for (let l = 0; l < e; l++) {
			const e = a[l] - i[l];
			0 !== e && (t[l] = [
				t[l][0] + e * r[0],
				t[l][1] + e * r[1],
				t[l][2] + e * r[2]
			]);
		}
	})(M);
	const I = Q(w, .01, (t, e, n, o) => {
		const r = M[e][0] + (M[n][0] - M[e][0]) * o, s = M[e][1] + (M[n][1] - M[e][1]) * o, a = M[e][2] + (M[n][2] - M[e][2]) * o;
		return i(M[t][0], M[t][1], M[t][2], r, s, a);
	});
	if (j(I.map((t) => M[t])) > n) return null;
	const $ = new Float64Array(4 * b), S = new Float64Array(4 * b);
	for (let i = 0; i < b; i++) {
		const [t, e, n] = o(M[i][0], M[i][1], M[i][2]);
		$[4 * i] = w[i], $[4 * i + 1] = M[i][0], $[4 * i + 2] = M[i][1], $[4 * i + 3] = M[i][2], S[4 * i] = w[i], S[4 * i + 1] = t, S[4 * i + 2] = e, S[4 * i + 3] = n;
	}
	const F = I.length;
	let C = !1;
	const L = [];
	for (let o = 0; o < F; o++) {
		const t = I[o], n = x[t], r = u[n];
		let s = u[n + 7], i = w[t], a = M[t][0], l = M[t][1], h = M[t][2];
		const d = 0 === o && i > 0 ? 0 : o === F - 1 && i < 1 ? 1 : -1;
		if (d >= 0 && b > 1) {
			const e = 0 === o ? t + 1 : t - 1, n = G(w, t, e, d);
			a += (M[e][0] - a) * n, l += (M[e][1] - l) * n, h += (M[e][2] - h) * n;
			const c = x[e];
			s = r * (s / r + (u[c + 7] / u[c] - s / r) * n), i = d;
		}
		const p = null === e.alpha || s >= r - 1e-9 ? void 0 : Y(s / r);
		if (void 0 === p) {
			L.push({
				offset: i,
				color: f(a, l, h)
			});
			continue;
		}
		C = !0;
		const y = u[n + 7], g = y > 1e-9 ? c(u[n + 8] / y, u[n + 9] / y, u[n + 10] / y) : f(a, l, h);
		L.push({
			offset: i,
			color: g,
			opacity: p
		});
	}
	return {
		stops: L,
		fineLab: $,
		fineRgb: S,
		translucent: C,
		lo: g,
		hi: y
	};
}
function _(t, e, n, o, r, s) {
	let a = 0;
	for (let i = 0; i < T; i++) t[6 * i] > a && (a = t[6 * i]);
	const l = a * q, c = V(t, 6, l);
	if (!c) return null;
	const { bins: f, first: h, last: u, hi: d } = c, p = s ? 0 : c.lo, y = 1 / (d - p), g = [], m = [], w = [];
	for (let i = h; i <= u; i++) {
		const t = 6 * i, e = f[t];
		e < l || e <= 0 || (g.push((f[t + 2] / e - p) * y), m.push(f[t + 1] / e), w.push([
			f[t + 3] / e,
			f[t + 4] / e,
			f[t + 5] / e
		]));
	}
	const M = g.length;
	if (M < 3) return null;
	if (Math.abs(m[M - 1] - m[0]) < o) return null;
	const x = w[0], b = w[M - 1];
	if (i(x[0], x[1], x[2], b[0], b[1], b[2]) < r) return null;
	const A = [];
	for (let i = 1; i < M; i++) A.push(Math.abs(m[i] - m[i - 1]));
	const k = W(g, A, 0);
	if (k < 0) return null;
	const v = m[M - 1] >= m[0] ? 1 : -1;
	let I = 0;
	for (let i = 1; i < M; i++) {
		const t = (m[i] - m[i - 1]) * v;
		t < 0 && (I -= t);
	}
	if (I / k > n) return null;
	if (v < 0) for (let i = 0; i < M; i++) m[i] = -m[i];
	if (X(m), v < 0) for (let i = 0; i < M; i++) m[i] = -m[i];
	const $ = Q(g, .02, (t, e, n, o) => Math.abs(m[t] - (m[e] + (m[n] - m[e]) * o))), S = $.length, F = [];
	for (let i = 0; i < S; i++) {
		const t = $[i];
		let n = g[t], o = m[t];
		const r = 0 === i && n > 0 ? 0 : i === S - 1 && n < 1 ? 1 : -1;
		if (r >= 0 && M > 1) {
			const e = 0 === i ? t + 1 : t - 1;
			o += (m[e] - o) * G(g, t, e, r), n = r;
		}
		const s = Y(o);
		F.push(void 0 === s ? {
			offset: n,
			color: e
		} : {
			offset: n,
			color: e,
			opacity: s
		});
	}
	const C = F[0], L = F[S - 1], P = (C.opacity ?? 1) <= (L.opacity ?? 1) ? C : L;
	return (P.opacity ?? 1) < .25 && (P.opacity = 0), {
		stops: F,
		lo: p,
		hi: d
	};
}
function tt(t, e, n) {
	const o = t.length / 4;
	if (e <= t[0] || 1 === o) return n[0] = t[1], n[1] = t[2], void (n[2] = t[3]);
	const r = 4 * (o - 1);
	if (e >= t[r]) return n[0] = t[r + 1], n[1] = t[r + 2], void (n[2] = t[r + 3]);
	let s = 1;
	for (; t[4 * s] < e;) s++;
	const i = 4 * (s - 1), a = 4 * s, l = t[a] - t[i], c = l > 1e-12 ? (e - t[i]) / l : 0;
	n[0] = t[i + 1] + (t[a + 1] - t[i + 1]) * c, n[1] = t[i + 2] + (t[a + 2] - t[i + 2]) * c, n[2] = t[i + 3] + (t[a + 3] - t[i + 3]) * c;
}
function et(t, e, n) {
	const o = [];
	for (let r = 0; r < T; r++) {
		const s = 6 * r;
		if (t[s] <= 0) continue;
		const i = t[s + 2] / t[s];
		i < e || i > n || o.push((i - e) / (n - e), Math.min(1, Math.max(0, t[s + 1] / t[s])));
	}
	return Float64Array.from(o);
}
function nt(t, e) {
	const n = t.length / 2;
	if (e <= t[0] || 1 === n) return t[1];
	if (e >= t[2 * (n - 1)]) return t[2 * (n - 1) + 1];
	let o = 1;
	for (; t[2 * o] < e;) o++;
	const r = 2 * (o - 1), s = t[2 * o] - t[r], i = s > 1e-12 ? (e - t[r]) / s : 0;
	return t[r + 1] + (t[2 * o + 1] - t[r + 1]) * i;
}
function ot(t, e, n) {
	let o;
	if ("linear" === t.kind) {
		const r = t.x2 - t.x1, s = t.y2 - t.y1, i = r * r + s * s;
		o = i > 1e-12 ? ((e - t.x1) * r + (n - t.y1) * s) / i : 0;
	} else o = t.r > 1e-12 ? Math.hypot(e - t.cx, n - t.cy) / t.r : 0;
	return o < 0 ? 0 : o > 1 ? 1 : o;
}
function rt(t, e, n, o) {
	const r = 12 * it(e), s = 3 * o, i = n.ok[s], a = n.ok[s + 1], l = n.ok[s + 2];
	if (t[r] += 1, t[r + 1] += i, t[r + 2] += a, t[r + 3] += l, t[r + 4] += i * i, t[r + 5] += a * a, t[r + 6] += l * l, t[r + 11] += e, null === n.alpha) return void (t[r + 7] += 1);
	const c = n.alpha[o] / 255, f = 4 * o, h = 255 * (1 - c);
	t[r + 7] += c, t[r + 8] += n.rgb[f] - h, t[r + 9] += n.rgb[f + 1] - h, t[r + 10] += n.rgb[f + 2] - h;
}
function st(t, e, n, o, r) {
	const s = 6 * it(e);
	t[s] += 1, t[s + 1] += n, t[s + 2] += e, t[s + 3] += o[r], t[s + 4] += o[r + 1], t[s + 5] += o[r + 2];
}
function it(t) {
	const e = Math.floor(t * T);
	return e < 0 ? 0 : e >= T ? 31 : e;
}
function at(e, n, o, r) {
	const s = t(e), i = t(n), a = t(o), l = Math.cbrt(.4122214708 * s + .5363325363 * i + .0514459929 * a), c = Math.cbrt(.2119034982 * s + .6806995451 * i + .1073969566 * a), f = Math.cbrt(.0883024619 * s + .2817188376 * i + .6299787005 * a);
	r[0] = .2104542553 * l + .793617785 * c - .0040720468 * f, r[1] = 1.9779984951 * l - 2.428592205 * c + .4505937099 * f, r[2] = .0259040371 * l + .7827717662 * c - .808675766 * f;
}
function lt(t, e, n) {
	const o = t[e] - n[0], r = t[e + 1] - n[1], s = t[e + 2] - n[2];
	return o * o + r * r + s * s;
}
function ct(t, e) {
	let n = Math.max(1, Math.ceil(t / H));
	for (; n > 1 && 1 !== ft(n, e);) n++;
	return n;
}
function ft(t, e) {
	return 0 === e ? t : ft(e, t % e);
}
function ht(t) {
	return {
		abs: 0,
		sse: 0,
		flatSse: 0,
		perMember: new Float64Array(t),
		perMemberFlat: new Float64Array(t),
		binN: new Float64Array(T),
		binOutliers: new Float64Array(T)
	};
}
function ut(t, e, n, o, r) {
	t.abs += Math.sqrt(o);
	const s = .0064, i = it(n);
	t.binN[i]++, o > s && t.binOutliers[i]++;
	const a = o > s ? s : o, l = r > s ? s : r;
	t.sse += a, t.flatSse += l, t.perMember[e] += a, t.perMemberFlat[e] += l;
}
function dt(t, e, n) {
	if (t.abs / e > .045) return !1;
	if (t.flatSse <= 0 || 1 - t.sse / t.flatSse < .3) return !1;
	for (let r = 0; r < n.length; r++) {
		if (n[r] <= 0) continue;
		const e = t.perMemberFlat[r] / n[r];
		if (t.perMember[r] / n[r] > e + 25e-5 + .5 * e) return !1;
	}
	let o = 0;
	for (let r = 0; r < T; r++) t.binN[r] > o && (o = t.binN[r]);
	for (let r = 0; r < T; r++) if (!(t.binN[r] < o * q) && t.binOutliers[r] > .2 * t.binN[r]) return !1;
	return !0;
}
function pt(t, e) {
	const n = new Float64Array(3 * e.length);
	return e.forEach((e, o) => {
		const r = 28 * e, s = t[r];
		if (!(s <= 0)) for (let i = 0; i < 3; i++) n[3 * o + i] = t[r + 6 + i] / s;
	}), n;
}
function yt(t, e, n, o) {
	const r = t[e] - n[3 * o], s = t[e + 1] - n[3 * o + 1], i = t[e + 2] - n[3 * o + 2];
	return r * r + s * s + i * i;
}
function gt(t, e, n) {
	const { m: o, sacc: r, offset: s, bucket: i, width: a, ok: l } = t;
	N(o, e, r);
	const c = r[0];
	if (c < 3) return null;
	if (Z(o, e) < U) return null;
	const f = B(r, 0), h = O(r, 0), u = null !== f && f.directionality >= z, d = D(h);
	if (!u && !d) return null;
	const p = u ? f.dx : 0, y = u ? f.dy : 0, g = d ? h.cx : 0, m = d ? h.cy : 0, w = ct(c, a);
	let M = 1 / 0, x = -1 / 0, b = 0;
	for (const z of e) for (let t = s[z], e = s[z + 1]; t < e; t += w) {
		const e = i[t], n = e % a + .5, o = (e - e % a) / a + .5;
		if (u) {
			const t = p * n + y * o;
			t < M && (M = t), t > x && (x = t);
		}
		if (d) {
			const t = Math.hypot(n - g, o - m);
			t > b && (b = t);
		}
	}
	const A = x - M, k = u && A > 1e-6, v = d && b > 1e-6;
	if (!k && !v) return null;
	const I = k ? /* @__PURE__ */ new Float64Array(384) : null, $ = v ? /* @__PURE__ */ new Float64Array(384) : null;
	for (const z of e) for (let e = s[z], n = s[z + 1]; e < n; e += w) {
		const n = i[e], o = n % a + .5, r = (n - n % a) / a + .5;
		I && rt(I, (p * o + y * r - M) / A, t, n), $ && rt($, Math.hypot(o - g, r - m) / b, t, n);
	}
	const S = n ? t.minColorSpan : 0, F = I ? J(I, t, t.maxBacktrack, S, !1) : null, C = $ ? J($, t, 1, S, !0) : null;
	if (!F && !C) return null;
	const L = F ? F.lo : 0, P = F ? 1 / (F.hi - F.lo) : 1, R = C ? 1 / C.hi : 1, q = t.lab, H = ht(e.length), j = ht(e.length), E = new Float64Array(e.length), W = pt(o, e);
	let Q = 0;
	const X = F ? /* @__PURE__ */ new Float64Array(544) : null, Y = 1 / c, G = r[1] * Y, V = r[2] * Y, _ = -y * G + p * V, et = r[3] * Y - G * G, nt = r[4] * Y - G * V, ot = r[5] * Y - V * V, st = Math.sqrt(Math.max(1e-9, y * y * et - 2 * p * y * nt + p * p * ot));
	for (let z = 0; z < e.length; z++) {
		const t = e[z];
		for (let e = s[t], n = s[t + 1]; e < n; e += w) {
			const t = i[e], n = t % a + .5, o = (t - t % a) / a + .5, r = 3 * t;
			E[z]++, Q++;
			const s = yt(l, r, W, z);
			if (F && X) {
				const t = Math.min(1, Math.max(0, ((p * n + y * o - M) / A - L) * P));
				tt(F.fineLab, t, q), ut(H, z, t, lt(l, r, q), s);
				const e = (-y * n + p * o - _) / st, i = 17 * it(t), a = e * e;
				X[i] += 1, X[i + 1] += e, X[i + 2] += a, X[i + 3] += a * e, X[i + 4] += a * a;
				for (let n = 0; n < 3; n++) {
					const t = l[r + n] - q[n];
					X[i + 5 + 4 * n] += t, X[i + 6 + 4 * n] += e * t, X[i + 7 + 4 * n] += a * t, X[i + 8 + 4 * n] += t * t;
				}
			}
			if (C) {
				const t = Math.min(1, Math.hypot(n - g, o - m) / b * R);
				tt(C.fineLab, t, q), ut(j, z, t, lt(l, r, q), s);
			}
		}
	}
	let at = null;
	const ft = null !== X && function(t) {
		let e = 0, n = 0, o = 0;
		for (let r = 0; r < T; r++) {
			const s = 17 * r, i = t[s];
			if (i < 12) continue;
			o += i;
			const a = [
				i,
				t[s + 1],
				t[s + 2],
				t[s + 1],
				t[s + 2],
				t[s + 3],
				t[s + 2],
				t[s + 3],
				t[s + 4]
			], l = [
				0,
				1,
				2
			].map((e) => [
				t[s + 5 + 4 * e],
				t[s + 6 + 4 * e],
				t[s + 7 + 4 * e]
			]), c = K(3, a, l);
			for (let o = 0; o < 3; o++) {
				const r = l[o];
				if (n += t[s + 8 + 4 * o], !c) continue;
				const a = c[o][0] * r[0] + c[o][1] * r[1] + c[o][2] * r[2] - r[0] * r[0] / i;
				a > 0 && (e += a);
			}
		}
		return n <= 4e-4 * o ? 0 : n > 0 ? e / n : 0;
	}(X) <= .25;
	if (F && ft && dt(H, Q, E)) {
		const t = r[1] / c, e = r[2] / c, n = p * t + y * e, o = M + F.lo * A, s = M + F.hi * A;
		at = {
			residual: H.abs / Q,
			fineLab: F.fineLab,
			fineRgb: F.fineRgb,
			translucent: F.translucent,
			paint: {
				kind: "linear",
				x1: t + (o - n) * p,
				y1: e + (o - n) * y,
				x2: t + (s - n) * p,
				y2: e + (s - n) * y,
				stops: F.stops
			}
		};
	}
	return C && dt(j, Q, E) && (null === at || j.abs < H.abs) && (at = {
		residual: j.abs / Q,
		fineLab: C.fineLab,
		fineRgb: C.fineRgb,
		translucent: C.translucent,
		paint: {
			kind: "radial",
			cx: g,
			cy: m,
			r: b * C.hi,
			stops: C.stops
		}
	}), at;
}
function mt(t, e, n, o) {
	const { m: r, sacc: s, offset: i, bucket: a, width: l, ok: f, rgb: h, lab: u, sBc: d, sPx: p, sPy: y, sAl: g } = t;
	N(r, e, s);
	const m = s[0];
	if (m < 6) return null;
	if (Z(r, e) < U) return null;
	const w = n.paint, M = ct(m, l), x = 1 / 255;
	let b = 0, A = 0, k = 0, v = 0, I = 0, $ = 0, S = 0, F = 0, C = 0, L = -1;
	const P = /* @__PURE__ */ new Float64Array(3);
	let R = 0;
	for (const c of e) for (let t = i[c], e = i[c + 1]; t < e; t += M) {
		const e = a[t], o = e % l + .5, r = (e - e % l) / l + .5;
		tt(n.fineRgb, ot(w, o, r), u), p[R] = o, y[R] = r, d[3 * R] = u[0], d[3 * R + 1] = u[1], d[3 * R + 2] = u[2], R++;
		const s = 4 * e, i = h[s] * x - u[0], c = h[s + 1] * x - u[1], f = h[s + 2] * x - u[2], g = i * i + c * c + f * f;
		g > L && (L = g, P[0] = h[s] * x, P[1] = h[s + 1] * x, P[2] = h[s + 2] * x);
		const m = g * (g - i * i), M = g * -i * c, z = g * -i * f, U = g * (g - c * c), T = g * -c * f, q = g * (g - f * f);
		b += m, A += M, k += z, v += U, I += T, $ += q, S += m * u[0] + M * u[1] + z * u[2], F += M * u[0] + U * u[1] + T * u[2], C += z * u[0] + T * u[1] + q * u[2];
	}
	if (L <= 1e-9) return null;
	const T = b + v + $;
	if (T > 1e-18) {
		const t = .01 * T / 3, e = K(3, [
			b + t,
			A,
			k,
			A,
			v + t,
			I,
			k,
			I,
			$ + t
		], [[
			S + t * P[0],
			F + t * P[1],
			C + t * P[2]
		]]);
		e && (P[0] = e[0][0], P[1] = e[0][1], P[2] = e[0][2]);
	}
	const q = (t) => {
		const e = P[0] - u[0], n = P[1] - u[1], o = P[2] - u[2], r = e * e + n * n + o * o;
		return r > 1e-9 ? ((h[t] * x - u[0]) * e + (h[t + 1] * x - u[1]) * n + (h[t + 2] * x - u[2]) * o) / r : 0;
	};
	for (let c = 0; c < 2; c++) {
		let t = 0;
		const n = [
			0,
			0,
			0
		];
		let o = 0;
		for (const r of e) for (let e = i[r], s = i[r + 1]; e < s; e += M) {
			const r = a[e];
			u[0] = d[3 * o], u[1] = d[3 * o + 1], u[2] = d[3 * o + 2], o++;
			const s = 4 * r, i = Math.min(1, Math.max(0, q(s)));
			t += i * i;
			for (let t = 0; t < 3; t++) n[t] += i * (h[s + t] * x - (1 - i) * u[t]);
		}
		if (t <= 1e-9) return null;
		for (let e = 0; e < 3; e++) P[e] = n[e] / t;
	}
	for (let c = 0; c < 3; c++) P[c] = P[c] < 0 ? 0 : P[c] > 1 ? 1 : P[c];
	const H = c(255 * P[0], 255 * P[1], 255 * P[2]), j = /* @__PURE__ */ new Float64Array(28);
	for (let c = 0; c < 6; c++) j[c] = s[c];
	for (let c = 18; c < 25; c++) j[c] = s[c];
	let E = 0;
	for (const c of e) for (let t = i[c], e = i[c + 1]; t < e; t += M) {
		const e = a[t], n = p[E], o = y[E];
		u[0] = d[3 * E], u[1] = d[3 * E + 1], u[2] = d[3 * E + 2];
		const r = q(4 * e);
		g[E] = r, E++, j[6] += r, j[9] += r * r, j[12] += r * n, j[13] += r * o, j[25] += r * (n * n + o * o);
	}
	if (M > 1) {
		const t = M;
		j[6] *= t, j[9] *= t, j[12] *= t, j[13] *= t, j[25] *= t;
	}
	const W = B(j, 0), Q = O(j, 0), X = null !== W && W.directionality >= z, Y = D(Q);
	if (!X && !Y) return null;
	const G = X ? W.dx : 0, V = X ? W.dy : 0, J = Y ? Q.cx : 0, rt = Y ? Q.cy : 0;
	let it = 1 / 0, ft = -1 / 0, gt = 0;
	for (let c = 0; c < R; c++) {
		const t = p[c], e = y[c];
		if (X) {
			const n = G * t + V * e;
			n < it && (it = n), n > ft && (ft = n);
		}
		if (Y) {
			const n = Math.hypot(t - J, e - rt);
			n > gt && (gt = n);
		}
	}
	const mt = ft - it, wt = X && mt > 1e-6, Mt = Y && gt > 1e-6;
	if (!wt && !Mt) return null;
	const xt = wt ? /* @__PURE__ */ new Float64Array(192) : null, bt = Mt ? /* @__PURE__ */ new Float64Array(192) : null;
	let At = 0;
	for (const c of e) for (let t = i[c], e = i[c + 1]; t < e; t += M) {
		const e = a[t], n = p[At], o = y[At], r = g[At];
		At++, xt && st(xt, (G * n + V * o - it) / mt, r, f, 3 * e), bt && st(bt, Math.hypot(n - J, o - rt) / gt, r, f, 3 * e);
	}
	const kt = o ? .2 : 0, vt = o ? t.minColorSpan : 0, It = xt ? _(xt, H, t.maxBacktrack, kt, vt, !1) : null, $t = bt ? _(bt, H, 1, kt, vt, !0) : null;
	if (!It && !$t) return null;
	const St = It?.stops ?? null, Ft = $t?.stops ?? null, Ct = xt && It ? et(xt, It.lo, It.hi) : null, Lt = bt && $t ? et(bt, 0, $t.hi) : null, Pt = It ? It.lo : 0, Rt = It ? 1 / (It.hi - It.lo) : 1, zt = $t ? 1 / $t.hi : 1, Ut = ht(e.length), Tt = ht(e.length), qt = new Float64Array(e.length), Ht = pt(r, e), Bt = /* @__PURE__ */ new Float64Array(3);
	let jt = 0;
	for (let c = 0; c < e.length; c++) {
		const t = e[c];
		for (let e = i[t], n = i[t + 1]; e < n; e += M) {
			const t = a[e], n = p[jt], o = y[jt];
			u[0] = d[3 * jt], u[1] = d[3 * jt + 1], u[2] = d[3 * jt + 2], jt++;
			const r = 3 * t;
			qt[c]++;
			const s = yt(f, r, Ht, c);
			if (Ct) {
				const t = Math.min(1, Math.max(0, ((G * n + V * o - it) / mt - Pt) * Rt)), e = nt(Ct, t);
				at(u[0] + e * (P[0] - u[0]), u[1] + e * (P[1] - u[1]), u[2] + e * (P[2] - u[2]), Bt), ut(Ut, c, t, lt(f, r, Bt), s);
			}
			if (Lt) {
				const t = Math.min(1, Math.hypot(n - J, o - rt) / gt * zt), e = nt(Lt, t);
				at(u[0] + e * (P[0] - u[0]), u[1] + e * (P[1] - u[1]), u[2] + e * (P[2] - u[2]), Bt), ut(Tt, c, t, lt(f, r, Bt), s);
			}
		}
	}
	const Kt = /* @__PURE__ */ new Float64Array(0);
	let Ot = null;
	if (St && It && dt(Ut, R, qt)) {
		const t = s[1] / m, e = s[2] / m, n = G * t + V * e, o = it + It.lo * mt, r = it + It.hi * mt;
		Ot = {
			residual: Ut.abs / R,
			fineLab: Kt,
			fineRgb: Kt,
			translucent: !0,
			paint: {
				kind: "linear",
				x1: t + (o - n) * G,
				y1: e + (o - n) * V,
				x2: t + (r - n) * G,
				y2: e + (r - n) * V,
				stops: St
			}
		};
	}
	return Ft && $t && dt(Tt, R, qt) && (null === Ot || Tt.abs < Ut.abs) && (Ot = {
		residual: Tt.abs / R,
		fineLab: Kt,
		fineRgb: Kt,
		translucent: !0,
		paint: {
			kind: "radial",
			cx: J,
			cy: rt,
			r: gt * $t.hi,
			stops: Ft
		}
	}), Ot;
}
var wt = class {
	s = /* @__PURE__ */ new Float64Array(64);
	a = /* @__PURE__ */ new Int32Array(64);
	b = /* @__PURE__ */ new Int32Array(64);
	n = 0;
	outScore = 0;
	outA = 0;
	outB = 0;
	get size() {
		return this.n;
	}
	less(t, e) {
		return this.s[t] !== this.s[e] ? this.s[t] < this.s[e] : this.a[t] !== this.a[e] ? this.a[t] < this.a[e] : this.b[t] < this.b[e];
	}
	swap(t, e) {
		const n = this.s[t];
		this.s[t] = this.s[e], this.s[e] = n;
		const o = this.a[t];
		this.a[t] = this.a[e], this.a[e] = o;
		const r = this.b[t];
		this.b[t] = this.b[e], this.b[e] = r;
	}
	push(t, e, n) {
		if (this.n === this.s.length) {
			const t = 2 * this.n, e = new Float64Array(t);
			e.set(this.s), this.s = e;
			const n = new Int32Array(t);
			n.set(this.a), this.a = n;
			const o = new Int32Array(t);
			o.set(this.b), this.b = o;
		}
		let o = this.n++;
		for (this.s[o] = t, this.a[o] = e, this.b[o] = n; o > 0;) {
			const t = o - 1 >> 1;
			if (!this.less(o, t)) break;
			this.swap(o, t), o = t;
		}
	}
	pop() {
		this.outScore = this.s[0], this.outA = this.a[0], this.outB = this.b[0];
		const t = --this.n;
		this.s[0] = this.s[t], this.a[0] = this.a[t], this.b[0] = this.b[t];
		let e = 0;
		for (;;) {
			const t = 2 * e + 1, n = t + 1;
			let o = e;
			if (t < this.n && this.less(t, o) && (o = t), n < this.n && this.less(n, o) && (o = n), o === e) break;
			this.swap(e, o), e = o;
		}
	}
};
function Mt(t, e, n, o, r, s, i, a) {
	const l = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map();
	for (const A of n) {
		if (o[A] >= 0) continue;
		const e = /* @__PURE__ */ new Float64Array(28);
		for (let n = 0; n < 28; n++) e[n] = t[28 * A + n];
		c.set(A, {
			members: [A],
			acc: e,
			adj: /* @__PURE__ */ new Set()
		}), l.set(A, A);
	}
	for (const [A, k] of c) for (const t of k.members) for (const n of e[t]) {
		const t = l.get(n);
		void 0 !== t && t !== A && k.adj.add(t);
	}
	const f = /* @__PURE__ */ new Float64Array(28), h = [], u = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Set(), p = /* @__PURE__ */ new Map(), y = new wt(), g = (t, e) => {
		h.length = 0;
		for (const n of t.members) h.push(n);
		for (const n of e.members) h.push(n);
	}, m = (t, e) => {
		let n = p.get(t);
		void 0 === n && (n = /* @__PURE__ */ new Set(), p.set(t, n)), n.add(e);
	}, w = (t, e) => {
		const n = c.get(t), o = c.get(e);
		for (let s = 0; s < 28; s++) f[s] = n.acc[s] + o.acc[s];
		g(n, o);
		const r = s(f, h);
		if (Number.isFinite(r)) {
			const n = t * a + e;
			u.set(n, r), m(t, n), m(e, n), y.push(r, t, e);
		}
	}, M = /* @__PURE__ */ new Set(), x = (t, e) => {
		if (e <= t) return;
		const n = t * a + e;
		M.has(n) || (M.add(n), w(t, e));
	};
	for (const [A, k] of c) {
		for (const t of k.adj) x(A, t);
		for (const t of k.adj) for (const e of c.get(t).adj) e !== A && x(A, e);
	}
	for (;;) {
		let t = -1, e = -1;
		for (; y.size > 0;) {
			y.pop();
			const n = y.outA, o = y.outB;
			if (!c.has(n) || !c.has(o)) continue;
			const r = n * a + o;
			if (d.has(r)) continue;
			const s = u.get(r);
			if (void 0 !== s && s === y.outScore) {
				if (g(c.get(n), c.get(o)), null !== i(h, !1)) {
					t = n, e = o;
					break;
				}
				d.add(r), u.delete(r);
			}
		}
		if (t < 0) break;
		const n = c.get(t), o = c.get(e), r = new Set(n.adj), s = /* @__PURE__ */ new Set(), f = p.get(t);
		if (f) for (const i of f) s.add(i);
		const m = p.get(e);
		if (m) for (const i of m) s.add(i);
		for (const i of s) u.delete(i), d.delete(i), p.get(Math.floor(i / a))?.delete(i), p.get(i % a)?.delete(i);
		p.delete(e);
		for (let i = 0; i < 28; i++) n.acc[i] += o.acc[i];
		for (const i of o.members) n.members.push(i), l.set(i, t);
		const M = [];
		n.adj.delete(e), o.adj.delete(t);
		for (const i of o.adj) {
			n.adj.has(i) || M.push(i), n.adj.add(i);
			const o = c.get(i);
			o.adj.delete(e), o.adj.add(t);
		}
		c.delete(e);
		const x = /* @__PURE__ */ new Set();
		for (const i of n.adj) {
			x.add(i);
			for (const e of c.get(i).adj) e !== t && x.add(e);
		}
		for (const i of x) w(t < i ? t : i, t < i ? i : t);
		if (M.length > 0) {
			for (const i of r) if (i !== e) for (const t of M) {
				const e = i < t ? i : t, n = i < t ? t : i, o = e * a + n;
				u.has(o) || d.has(o) || w(e, n);
			}
		}
	}
	const b = [];
	for (const [A, k] of c) {
		if (k.acc[0] < r) continue;
		const t = i(k.members, !0);
		if (t) {
			for (const t of k.members) o[t] = 1;
			b.push({
				members: k.members.slice(),
				rep: A,
				built: t
			});
		}
	}
	return b;
}
function xt(t, e, n) {
	const { width: o, height: r, count: s } = e, i = e.data;
	if (s < 1) return {
		gradients: new Array(s).fill(null),
		underlays: new Int32Array(s).fill(-1),
		labels: e,
		parentLabel: Int32Array.from({ length: s }, (t, e) => e)
	};
	const a = n?.detectMaxDimension ?? 0;
	if (a > 0 && Math.max(o, r) > a) return function(t, e, n, o) {
		const { width: r, height: s, data: i, count: a } = e, l = o / Math.max(r, s), c = Math.max(1, Math.round(r * l)), f = Math.max(1, Math.round(s * l)), h = S(t, o), u = function(t, e, n) {
			const { width: o, height: r, data: s } = t, i = new Int32Array(e * n);
			for (let a = 0; a < n; a++) {
				const t = Math.min(r - 1, a * r / n | 0);
				for (let n = 0; n < e; n++) i[a * e + n] = s[t * o + Math.min(o - 1, n * o / e | 0)];
			}
			return i;
		}(e, c, f), d = u.slice(), p = n?.alpha ? function(t, e, n, o, r) {
			const s = new Uint8Array(o * r);
			for (let i = 0; i < r; i++) {
				const a = Math.min(n - 1, i * n / r | 0);
				for (let n = 0; n < o; n++) s[i * o + n] = t[a * e + Math.min(e - 1, n * e / o | 0)];
			}
			return s;
		}(n.alpha, r, s, c, f) : void 0, y = xt(h, {
			width: c,
			height: f,
			data: u,
			count: a
		}, {
			...n,
			detectMaxDimension: 0,
			oklab: void 0,
			alpha: p
		}), g = new Int32Array(i.length), m = new Int32Array(i.length).fill(-1), w = new Int32Array(i.length), M = new Int32Array(i.length), x = /* @__PURE__ */ new Map(), b = /* @__PURE__ */ new Map();
		for (let S = 0; S < i.length; S++) {
			if (i[S] < 0) {
				g[S] = -1, m[S] = S;
				continue;
			}
			if (m[S] >= 0) continue;
			const t = i[S];
			let e = 0, n = 0;
			for (w[e++] = S, m[S] = S, x.clear(), b.clear(); e > 0;) {
				const o = w[--e];
				M[n++] = o;
				const a = o % r, l = (o - a) / r, h = Math.min(c - 1, a * c / r | 0), p = Math.min(f - 1, l * f / s | 0) * c + h, y = u[p];
				b.set(y, (b.get(y) ?? 0) + 1), d[p] === t && x.set(y, (x.get(y) ?? 0) + 1), a > 0 && i[o - 1] === t && m[o - 1] < 0 && (m[o - 1] = S, w[e++] = o - 1), a + 1 < r && i[o + 1] === t && m[o + 1] < 0 && (m[o + 1] = S, w[e++] = o + 1), o >= r && i[o - r] === t && m[o - r] < 0 && (m[o - r] = S, w[e++] = o - r), o + r < i.length && i[o + r] === t && m[o + r] < 0 && (m[o + r] = S, w[e++] = o + r);
			}
			const o = x.size > 0 ? x : b;
			let a = t, l = 0;
			for (const [r, s] of o) (s > l || s === l && r < a) && (l = s, a = r);
			for (let r = 0; r < n; r++) g[M[r]] = a;
		}
		i.set(g);
		const A = r / c, k = s / f, v = (A + k) / 2, I = y.gradients.map((t) => function(t, e, n, o) {
			return null === t ? t : "linear" === t.kind ? {
				...t,
				x1: t.x1 * e,
				y1: t.y1 * n,
				x2: t.x2 * e,
				y2: t.y2 * n
			} : {
				...t,
				cx: t.cx * e,
				cy: t.cy * n,
				r: t.r * o
			};
		}(t, A, k, v)), $ = y.labels.count;
		return {
			gradients: I,
			underlays: y.underlays,
			labels: $ === a ? e : {
				width: r,
				height: s,
				data: i,
				count: $
			},
			parentLabel: y.parentLabel
		};
	}(t, e, n, a);
	const l = n?.minArea ?? 0, c = n?.maxBacktrack ?? .15, f = n?.minColorSpan ?? .05, h = n?.oklab ?? R(t);
	let u = n?.alpha ?? null;
	if (null !== u) {
		let t = !1;
		for (let e = 0; e < i.length && !t; e++) t = i[e] >= 0 && u[e] < 255;
		t || (u = null);
	}
	const d = new Int32Array(i.length).fill(-1), p = [], y = new Int32Array(s).fill(-1), g = new Int32Array(i.length), m = new Int32Array(i.length);
	for (let S = 0; S < i.length; S++) {
		if (i[S] < 0 || d[S] >= 0) continue;
		const t = i[S], e = p.length;
		p.push(t);
		let n = 0, r = 0;
		for (g[n++] = S, d[S] = e; n > 0;) {
			const s = g[--n];
			m[r++] = s;
			const a = s % o;
			a > 0 && i[s - 1] === t && d[s - 1] < 0 && (d[s - 1] = e, g[n++] = s - 1), a + 1 < o && i[s + 1] === t && d[s + 1] < 0 && (d[s + 1] = e, g[n++] = s + 1), s >= o && i[s - o] === t && d[s - o] < 0 && (d[s - o] = e, g[n++] = s - o), s + o < i.length && i[s + o] === t && d[s + o] < 0 && (d[s + o] = e, g[n++] = s + o);
		}
		if (!(r >= 16)) if (y[t] < 0) y[t] = e;
		else {
			for (let e = 0; e < r; e++) d[m[e]] = y[t];
			p.pop();
		}
	}
	const w = p.length, M = new Float64Array(28 * w), x = new Uint32Array(w);
	for (let S = 0; S < r; S++) for (let t = 0; t < o; t++) {
		const e = S * o + t, n = d[e];
		if (n < 0) continue;
		x[n]++;
		const r = t + .5, s = S + .5, i = r * r, a = s * s, l = i + a, c = 3 * e, f = h[c], u = h[c + 1], p = h[c + 2], y = 28 * n;
		M[y] += 1, M[y + 1] += r, M[y + 2] += s, M[y + 3] += i, M[y + 4] += r * s, M[y + 5] += a, M[y + 6] += f, M[y + 7] += u, M[y + 8] += p, M[y + 9] += f * f, M[y + 10] += u * u, M[y + 11] += p * p, M[y + 12] += f * r, M[y + 13] += f * s, M[y + 14] += u * r, M[y + 15] += u * s, M[y + 16] += p * r, M[y + 17] += p * s, M[y + 18] += i * r, M[y + 19] += i * s, M[y + 20] += r * a, M[y + 21] += a * s, M[y + 22] += i * i, M[y + 23] += i * a, M[y + 24] += a * a, M[y + 25] += f * l, M[y + 26] += u * l, M[y + 27] += p * l;
	}
	const b = new Int32Array(w + 1);
	for (let S = 0; S < w; S++) b[S + 1] = b[S] + x[S];
	const A = new Int32Array(b[w]), k = b.slice(0, w);
	for (let S = 0; S < i.length; S++) {
		const t = d[S];
		t >= 0 && (A[k[t]++] = S);
	}
	const v = Array.from({ length: w }, () => /* @__PURE__ */ new Set());
	for (let S = 0; S < r; S++) for (let t = 0; t < o; t++) {
		const e = S * o + t, n = d[e];
		if (!(n < 0)) {
			if (t + 1 < o) {
				const t = d[e + 1];
				t >= 0 && t !== n && (v[n].add(t), v[t].add(n));
			}
			if (S + 1 < r) {
				const t = d[e + o];
				t >= 0 && t !== n && (v[n].add(t), v[t].add(n));
			}
		}
	}
	const I = v.map((t) => [...t].toSorted((t, e) => t - e)), $ = [];
	for (let S = 0; S < w; S++) x[S] > 0 && y[p[S]] !== S && $.push(S);
	$.sort((t, e) => x[e] - x[t] || t - e);
	const F = {
		width: o,
		ok: h,
		rgb: t.data,
		alpha: u,
		m: M,
		offset: b,
		bucket: A,
		maxBacktrack: c,
		minColorSpan: f,
		sacc: /* @__PURE__ */ new Float64Array(28),
		lab: /* @__PURE__ */ new Float64Array(3),
		sBc: new Float64Array(3 * (H + w)),
		sPx: new Float64Array(H + w),
		sPy: new Float64Array(H + w),
		sAl: new Float64Array(H + w)
	}, C = /* @__PURE__ */ new Map(), L = (t, e) => {
		if (1 !== t.length || !e) return gt(F, t, e);
		let n = C.get(t[0]);
		return void 0 === n && (n = gt(F, t, !0), C.set(t[0], n)), n;
	}, P = new Int32Array(w).fill(-1), T = new Int32Array(w).fill(-1), q = new Array(w).fill(null), K = new Int32Array(w).fill(-1), N = Mt(M, I, $, P, l, (t, e) => {
		let n = 1 / 0;
		const o = B(t, 0);
		if (null !== o && o.directionality >= z) {
			const t = function(t, e, n, o) {
				const r = [];
				for (const l of e) {
					const e = 28 * l, s = t[e];
					s <= 0 || r.push([
						n * (t[e + 1] / s) + o * (t[e + 2] / s),
						l,
						[
							t[e + 6] / s,
							t[e + 7] / s,
							t[e + 8] / s
						]
					]);
				}
				r.sort((t, e) => t[0] - e[0] || t[1] - e[1]);
				const s = r.map((t) => t[2]), i = s.length;
				let a = 0;
				if (i >= 3) {
					const t = s[0], e = s[i - 1], n = Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]);
					if (n > 1e-6) for (let o = 1; o < i - 1; o++) {
						const t = r[o - 1][0], e = r[o + 1][0], i = e - t > 1e-9 ? (r[o][0] - t) / (e - t) : .5, l = s[o - 1][0] + (s[o + 1][0] - s[o - 1][0]) * i, c = s[o - 1][1] + (s[o + 1][1] - s[o - 1][1]) * i, f = s[o - 1][2] + (s[o + 1][2] - s[o - 1][2]) * i, h = Math.hypot(s[o][0] - l, s[o][1] - c, s[o][2] - f) / n;
						h > a && (a = h);
					}
				}
				return {
					backtrack: j(s),
					outlier: a
				};
			}(M, e, o.dx, o.dy);
			t.backtrack <= c && t.outlier <= .35 && (n = t.backtrack + t.outlier);
		}
		const r = O(t, 0);
		return D(r) && r.misfit < n && (n = r.misfit), n;
	}, L, w);
	for (const S of N) {
		q[S.rep] = S.built.paint;
		for (const t of S.members) T[t] = S.rep;
	}
	if (!1 !== n?.overlays) {
		const t = (t) => {
			let e = 0;
			for (const n of t.members) e += x[n];
			return e;
		}, e = N.toSorted((e, n) => t(n) - t(e) || e.rep - n.rep), n = new Map(e.map((t) => [t.rep, t])), o = /* @__PURE__ */ new Set(), r = [];
		for (const s of e) {
			if (s.built.translucent || o.has(s)) continue;
			const i = /* @__PURE__ */ new Set(), a = [], c = /* @__PURE__ */ new Set(), f = (t) => {
				for (const e of I[t]) {
					P[e] < 0 && !i.has(e) && (i.add(e), a.push(e));
					const t = T[e];
					if (t >= 0 && t !== s.rep) {
						const e = n.get(t);
						!e || e.built.translucent || o.has(e) || c.add(e);
					}
				}
			};
			for (const t of s.members) f(t);
			for (; a.length > 0;) f(a.pop());
			const h = 0 === i.size ? [] : Mt(M, I, $.filter((t) => i.has(t)), P, l, (t, e) => Z(M, e) >= U ? 0 : 1 / 0, (t, e) => mt(F, t, s.built, e), w);
			for (const e of c) {
				if (t(e) >= t(s) || e.built.residual < .01) continue;
				const n = mt(F, e.members, s.built, !0);
				null === n || n.residual > .5 * e.built.residual || (e.built = n, h.push(e));
			}
			for (const n of h) {
				const i = new Set(n.members);
				for (let r = !0; r;) {
					r = !1;
					for (const a of e) {
						if (a === s || a === n || a.built.translucent) continue;
						if (o.has(a) || t(a) >= t(s)) continue;
						if (a.built.residual < .01) continue;
						if (!a.members.some((t) => I[t].some((t) => i.has(t)))) continue;
						const e = mt(F, n.members.concat(a.members), s.built, !0);
						if (null === e) continue;
						const l = Math.max(n.built.residual, a.built.residual);
						if (!(e.residual > l + .002)) {
							for (const t of a.members) n.members.push(t), i.add(t);
							n.built = e, q[a.rep] = null, o.add(a), r = !0;
						}
					}
				}
				q[n.rep] = n.built.paint, K[n.rep] = s.rep;
				for (const t of n.members) T[t] = n.rep;
				r.push({
					overlay: n,
					base: s
				});
			}
		}
		for (const { overlay: s, base: i } of r) {
			if (o.has(i)) continue;
			const t = new Set(s.members);
			for (const n of e) {
				if (n === i || n.built.translucent || o.has(n)) continue;
				if (!n.members.some((e) => I[e].some((e) => t.has(e)))) continue;
				const e = L(i.members.concat(n.members), !0);
				if (null === e) continue;
				i.members.push(...n.members), i.built = e, q[i.rep] = e.paint, q[n.rep] = null;
				for (const t of n.members) T[t] = i.rep;
				o.add(n);
				const r = mt(F, s.members, e, !0);
				r && (s.built = r, q[s.rep] = r.paint);
			}
		}
	}
	{
		const t = /* @__PURE__ */ new Map();
		for (const o of N) q[o.rep] && !o.built.translucent && t.set(o.rep, o);
		const e = /* @__PURE__ */ new Map();
		for (const [o, r] of t) {
			let t = 0;
			for (const e of r.members) t += x[e];
			e.set(o, t);
		}
		const n = F.lab;
		for (let r = 0; r < w; r++) {
			if (P[r] >= 0 || 0 === x[r]) continue;
			const s = /* @__PURE__ */ new Set();
			for (const e of I[r]) {
				const n = T[e];
				n >= 0 && t.has(n) && s.add(n);
			}
			const i = [...s].toSorted((t, n) => e.get(n) - e.get(t) || t - n);
			for (const a of i) {
				const s = t.get(a);
				if (x[r] > .1 * e.get(a)) continue;
				let i = 0;
				for (let t = b[r], e = b[r + 1]; t < e; t++) {
					const e = A[t], r = e % o + .5, a = (e - e % o) / o + .5;
					tt(s.built.fineLab, ot(s.built.paint, r, a), n), i += Math.sqrt(lt(h, 3 * e, n));
				}
				if (!(i / x[r] > .045)) {
					P[r] = 1, T[r] = a, s.members.push(r), e.set(a, e.get(a) + x[r]);
					break;
				}
			}
		}
	}
	const E = new Int32Array(w).fill(-1), W = new Uint8Array(s), Q = new Uint32Array(s);
	for (let S = 0; S < w; S++) y[p[S]] !== S && Q[p[S]]++;
	const X = [];
	for (let S = 0; S < w; S++) T[S] === S && q[S] && X.push(S);
	const Y = /* @__PURE__ */ new Map();
	for (let S = 0; S < w; S++) {
		const t = T[S];
		if (t < 0 || y[p[S]] === S) continue;
		let e = Y.get(t);
		e || (e = /* @__PURE__ */ new Map(), Y.set(t, e)), e.set(p[S], (e.get(p[S]) ?? 0) + 1);
	}
	const G = Array.from({ length: s }, (t, e) => e);
	for (const S of X) {
		const t = Y.get(S) ?? /* @__PURE__ */ new Map(), e = p[S], n = [...t.keys()].filter((e) => !W[e] && t.get(e) === Q[e]).toSorted((t, n) => t === e ? -1 : n === e ? 1 : t - n);
		n.length > 0 ? (E[S] = n[0], W[n[0]] = 1) : (E[S] = G.length, G.push(e));
	}
	const V = new Int32Array(w);
	let J = !1;
	for (let S = 0; S < w; S++) {
		const t = T[S], e = t >= 0 && E[t] >= 0 ? E[t] : p[S];
		V[S] = e, e !== p[S] && (J = !0);
	}
	const _ = G.length, et = new Array(_).fill(null), nt = new Int32Array(_).fill(-1);
	for (const S of X) {
		const t = E[S];
		et[t] = q[S], K[S] >= 0 && (nt[t] = E[K[S]]);
	}
	if (J) for (let S = 0; S < i.length; S++) {
		const t = d[S];
		t >= 0 && (i[S] = V[t]);
	}
	return {
		gradients: et,
		underlays: nt,
		labels: _ === s ? e : {
			width: o,
			height: r,
			data: i,
			count: _
		},
		parentLabel: Int32Array.from(G)
	};
}
const bt = .018 * .018, At = 144e-6;
function kt(t, e, n, o, r, s) {
	const i = e * e + n * n;
	if (i < bt) return o;
	const a = r[3 * o + 1], l = r[3 * o + 2], c = a * a + l * l;
	if (c < At) return o;
	const f = e * a + n * l;
	if (f > 0 && f * f >= .5 * i * c) return o;
	let h = -1, u = .0081;
	for (let d = 0, p = 0; d < s; d++, p += 3) {
		if (d === o) continue;
		const s = r[p + 1], a = r[p + 2], l = s * s + a * a;
		let c = l < At;
		if (!c) {
			const t = e * s + n * a;
			c = t > 0 && t * t >= .5 * i * l;
		}
		if (!c) continue;
		const f = t - r[p], y = e - s, g = n - a, m = f * f + y * y + g * g;
		m < u && (u = m, h = d);
	}
	return h >= 0 ? h : o;
}
function vt(t, e, n, o, r, s, i, a, l) {
	const c = new Uint32Array(n), f = /* @__PURE__ */ new Map();
	if (null !== r) for (let h = 0, u = 0, d = 0; h < i; h++, u += 3, d += 4) {
		if (null !== s && 0 === s[h]) {
			t[h] = -1;
			continue;
		}
		const i = o[d] << 16 | o[d + 1] << 8 | o[d + 2];
		let p = f.get(i);
		if (void 0 === p) {
			const t = r[u], o = r[u + 1], s = r[u + 2];
			p = 0;
			let a = 1 / 0;
			for (let r = 0, i = 0; r < n; r++, i += 3) {
				const n = t - e[i], l = o - e[i + 1], c = s - e[i + 2], f = n * n + l * l + c * c;
				f < a && (a = f, p = r);
			}
			l && (p = kt(t, o, s, p, e, n)), f.set(i, p);
		}
		if (t[h] = p, c[p]++, null !== a) {
			const t = 3 * p;
			a[t] += o[d], a[t + 1] += o[d + 1], a[t + 2] += o[d + 2];
		}
	}
	else for (let h = 0, u = 0; h < i; h++, u += 4) {
		if (null !== s && 0 === s[h]) {
			t[h] = -1;
			continue;
		}
		const r = o[u] << 16 | o[u + 1] << 8 | o[u + 2];
		let i = f.get(r);
		if (void 0 === i) {
			const t = o[u] / 255, s = o[u + 1] / 255, a = o[u + 2] / 255;
			i = 0;
			let l = 1 / 0;
			for (let o = 0, r = 0; o < n; o++, r += 3) {
				const n = t - e[r], c = s - e[r + 1], f = a - e[r + 2], h = n * n + c * c + f * f;
				h < l && (l = h, i = o);
			}
			f.set(r, i);
		}
		if (t[h] = i, c[i]++, null !== a) {
			const t = 3 * i;
			a[t] += o[u], a[t + 1] += o[u + 1], a[t + 2] += o[u + 2];
		}
	}
	return c;
}
function It(t, e) {
	const n = new Array(e);
	for (let o = 0; o < e; o++) n[o] = o;
	return n.sort((e, n) => t[n] - t[e] || e - n), n;
}
function $t(t, e, n, o, r) {
	const s = 3 * e, i = t[s] - n, a = t[s + 1] - o, l = t[s + 2] - r;
	return Math.sqrt(i * i + a * a + l * l);
}
function St(t, e = {}) {
	const { width: n, height: r } = t, s = n * r, i = e.flatThreshold ?? .02, a = e.mergeThreshold ?? .1, l = Math.min(1, Math.max(0, e.mergeSizeBias ?? 0)), f = Math.max(0, e.minRegionArea ?? 16), h = Math.max(0, e.maxRegions ?? 0), u = e.mask?.data ?? null, d = R(t), p = new Float32Array(s);
	for (let o = 0; o < r; o++) for (let t = 0; t < n; t++) {
		const e = o * n + t;
		if (t + 1 < n) {
			const t = $t(d, e, d[3 * (e + 1)], d[3 * (e + 1) + 1], d[3 * (e + 1) + 2]);
			t > p[e] && (p[e] = t), t > p[e + 1] && (p[e + 1] = t);
		}
		if (o + 1 < r) {
			const t = e + n, o = $t(d, e, d[3 * t], d[3 * t + 1], d[3 * t + 2]);
			o > p[e] && (p[e] = o), o > p[t] && (p[t] = o);
		}
	}
	const y = new Int32Array(s).fill(-1), g = new Int32Array(s);
	let m = 0, w = /* @__PURE__ */ new Float64Array(64), M = /* @__PURE__ */ new Float64Array(64), x = /* @__PURE__ */ new Float64Array(64), b = /* @__PURE__ */ new Float64Array(64);
	const A = (t) => {
		if (t < w.length) return;
		const e = 2 * w.length, n = new Float64Array(e);
		n.set(w), w = n;
		const o = new Float64Array(e);
		o.set(M), M = o;
		const r = new Float64Array(e);
		r.set(x), x = r;
		const s = new Float64Array(e);
		s.set(b), b = s;
	};
	for (let o = 0; o < s; o++) {
		if (-1 !== y[o] || null !== u && 0 === u[o] || p[o] >= i) continue;
		const t = m++;
		A(t);
		let e = 0;
		g[e++] = o, y[o] = t;
		let r = 0, a = 0, l = 0, c = 0;
		for (; e > 0;) {
			const o = g[--e];
			r += d[3 * o], a += d[3 * o + 1], l += d[3 * o + 2], c++;
			const f = o - (o / n | 0) * n;
			f > 0 && -1 === y[o - 1] && (null === u || 0 !== u[o - 1]) && p[o - 1] < i && (y[o - 1] = t, g[e++] = o - 1), f < n - 1 && -1 === y[o + 1] && (null === u || 0 !== u[o + 1]) && p[o + 1] < i && (y[o + 1] = t, g[e++] = o + 1), o >= n && -1 === y[o - n] && (null === u || 0 !== u[o - n]) && p[o - n] < i && (y[o - n] = t, g[e++] = o - n), o < s - n && -1 === y[o + n] && (null === u || 0 !== u[o + n]) && p[o + n] < i && (y[o + n] = t, g[e++] = o + n);
		}
		w[t] = r / c, M[t] = a / c, x[t] = l / c, b[t] = c;
	}
	if (0 === m) return function(t, e, n) {
		const { data: o } = t;
		let r = 0, s = 0, i = 0, a = 0;
		const l = (f = t.width, h = t.height, {
			width: f,
			height: h,
			data: new Int32Array(f * h),
			count: 1
		});
		var f, h;
		for (let c = 0; c < n; c++) null === e || 0 !== e[c] ? (l.data[c] = 0, r += o[4 * c], s += o[4 * c + 1], i += o[4 * c + 2], a++) : l.data[c] = -1;
		const u = a > 0 ? Math.round(r / a) : 0, d = a > 0 ? Math.round(s / a) : 0, p = a > 0 ? Math.round(i / a) : 0;
		return {
			labels: l,
			paletteHex: [c(u, d, p)],
			paletteRgb: new Uint8Array([
				u,
				d,
				p
			]),
			counts: new Uint32Array([a])
		};
	}(t, u, s);
	(function(t, e, n, o, r, s, i, a) {
		let l = Math.max(1024, o), c = new Float64Array(l), f = new Int32Array(l), h = new Int32Array(l), u = 0;
		const d = (t, e, n) => {
			(() => {
				if (u < l) return;
				l *= 2;
				const t = new Float64Array(l);
				t.set(c), c = t;
				const e = new Int32Array(l);
				e.set(f), f = e;
				const n = new Int32Array(l);
				n.set(h), h = n;
			})();
			let o = u++;
			for (c[o] = t, f[o] = e, h[o] = n; o > 0;) {
				const t = o - 1 >> 1;
				if (c[t] < c[o] || c[t] === c[o] && f[t] <= f[o]) break;
				p(o, t), o = t;
			}
		}, p = (t, e) => {
			const n = c[t];
			c[t] = c[e], c[e] = n;
			const o = f[t];
			f[t] = f[e], f[e] = o;
			const r = h[t];
			h[t] = h[e], h[e] = r;
		}, y = (t, e) => c[t] < c[e] || c[t] === c[e] && f[t] < f[e], g = () => {
			if (u--, u > 0) {
				c[0] = c[u], f[0] = f[u], h[0] = h[u];
				let t = 0;
				for (;;) {
					const e = 2 * t + 1, n = 2 * t + 2;
					let o = t;
					if (e < u && y(e, o) && (o = e), n < u && y(n, o) && (o = n), o === t) break;
					p(t, o), t = o;
				}
			}
		}, m = (t, e) => {
			const r = t - (t / n | 0) * n;
			r > 0 && w(t - 1, e), r < n - 1 && w(t + 1, e), t >= n && w(t - n, e), t < o - n && w(t + n, e);
		}, w = (n, o) => {
			-1 !== e[n] || null !== r && 0 === r[n] || d($t(t, n, s[o], i[o], a[o]), n, o);
		};
		for (let M = 0; M < o; M++) e[M] >= 0 && m(M, e[M]);
		for (; u > 0;) {
			const t = f[0], n = h[0];
			g(), -1 === e[t] && (e[t] = n, m(t, n));
		}
		for (let M = 0; M < o; M++) -1 !== e[M] || null !== r && 0 === r[M] || (e[M] = 0);
	})(d, y, n, s, u, w, M, x), w.fill(0, 0, m), M.fill(0, 0, m), x.fill(0, 0, m), b.fill(0, 0, m);
	for (let o = 0; o < s; o++) {
		const t = y[o];
		t < 0 || (w[t] += d[3 * o], M[t] += d[3 * o + 1], x[t] += d[3 * o + 2], b[t]++);
	}
	for (let o = 0; o < m; o++) b[o] > 0 && (w[o] /= b[o], M[o] /= b[o], x[o] /= b[o]);
	const k = function(t, e, n, o, r, s, i, a, l, c, f, h) {
		const u = new Int32Array(o);
		for (let A = 0; A < o; A++) u[A] = A;
		const d = (t) => {
			let e = t;
			for (; u[e] !== e;) e = u[e];
			for (; u[t] !== e;) {
				const n = u[t];
				u[t] = e, t = n;
			}
			return e;
		}, p = (t, e) => {
			const n = r[t] - r[e], o = s[t] - s[e], a = i[t] - i[e];
			return Math.sqrt(n * n + o * o + a * a);
		}, y = (t, e) => c <= 0 ? l : .03 + .5 * c * (1 / Math.sqrt(a[t]) + 1 / Math.sqrt(a[e])), g = (t, e) => {
			const n = a[t] >= a[e] ? t : e, o = n === t ? e : t, l = a[t] + a[e];
			l > 0 && (r[n] = (r[t] * a[t] + r[e] * a[e]) / l, s[n] = (s[t] * a[t] + s[e] * a[e]) / l, i[n] = (i[t] * a[t] + i[e] * a[e]) / l), a[n] = l, u[o] = n;
		}, m = () => {
			const r = /* @__PURE__ */ new Set(), s = [];
			for (let i = 0; i < n; i++) for (let a = 0; a < e; a++) {
				const l = i * e + a, c = t[l];
				if (c < 0) continue;
				const f = d(c);
				if (a + 1 < e) {
					const e = t[l + 1];
					if (e >= 0) {
						const t = d(e);
						if (f !== t) {
							const e = f < t ? f * o + t : t * o + f;
							r.has(e) || (r.add(e), s.push(f < t ? [f, t] : [t, f]));
						}
					}
				}
				if (i + 1 < n) {
					const n = t[l + e];
					if (n >= 0) {
						const t = d(n);
						if (f !== t) {
							const e = f < t ? f * o + t : t * o + f;
							r.has(e) || (r.add(e), s.push(f < t ? [f, t] : [t, f]));
						}
					}
				}
			}
			return s;
		};
		let w = o;
		for (let A = 0; A < 64; A++) {
			const t = m().map(([t, e]) => [
				t,
				e,
				p(t, e)
			]).toSorted((t, e) => t[2] - e[2] || t[0] - e[0] || t[1] - e[1]);
			let e = !1;
			for (const [n, o, r] of t) {
				const t = d(n), s = d(o);
				t !== s && (r < y(t, s) || a[t] < f || a[s] < f) && (g(t, s), w--, e = !0);
			}
			if (!e) break;
		}
		const M = c > 0 ? .03 : l, x = [];
		for (let A = 0; A < o; A++) d(A) === A && x.push(A);
		x.sort((t, e) => a[e] - a[t] || t - e);
		const b = [];
		for (const A of x) {
			let t = -1;
			for (const e of b) if (p(A, e) < M) {
				t = e;
				break;
			}
			-1 === t ? b.push(A) : (g(A, t), w--);
		}
		if (h > 0 && w > h) {
			const t = 2 * l;
			for (let e = 0; e < o && w > h; e++) {
				const e = [];
				for (let t = 0; t < o; t++) d(t) === t && e.push(t);
				let n = null;
				for (let t = 0; t < e.length; t++) for (let o = t + 1; o < e.length; o++) {
					const r = p(e[t], e[o]);
					(null === n || r < n[2]) && (n = [
						e[t],
						e[o],
						r
					]);
				}
				if (null === n || n[2] > t) break;
				g(n[0], n[1]), w--;
			}
		}
		for (let A = 0; A < o; A++) u[A] = d(A);
		return u;
	}(y, n, r, m, w, M, x, b, a, l, f, h), v = new Int32Array(m).fill(-1);
	let I = 0;
	const $ = new Int32Array(s);
	for (let o = 0; o < s; o++) {
		const t = y[o];
		if (t < 0) {
			$[o] = -1;
			continue;
		}
		const e = k[t];
		let n = v[e];
		-1 === n && (n = I++, v[e] = n), $[o] = n;
	}
	const S = {
		width: n,
		height: r,
		data: $,
		count: I
	}, F = new Uint8Array(3 * I), C = new Array(I), L = new Uint32Array(I);
	for (let P = 0; P < m; P++) {
		const t = v[k[P]];
		if (t < 0 || void 0 !== C[t]) continue;
		const [e, n, r] = o(w[k[P]], M[k[P]], x[k[P]]), s = Math.round(255 * e), i = Math.round(255 * n), a = Math.round(255 * r);
		F[3 * t] = s, F[3 * t + 1] = i, F[3 * t + 2] = a, C[t] = c(s, i, a);
	}
	for (let o = 0; o < s; o++) $[o] >= 0 && L[$[o]]++;
	return {
		labels: S,
		paletteHex: C,
		paletteRgb: F,
		counts: L
	};
}
function Ft(t) {
	return t <= 0 ? 0 : t >= 1 ? 255 : 256 * t | 0;
}
function Ct(t, e, n) {
	if (e <= 1) return t;
	const o = n?.keepContrast ? n.keepContrast * n.keepContrast : 0, r = n?.protect?.data ?? null, i = n?.oklab, { width: a, height: l, data: c } = t, f = a * l;
	if (0 === f) return t;
	let h = t.count;
	for (let s = 0; s < f; s++) c[s] >= h && (h = c[s] + 1);
	const u = new Int32Array(h), d = new Int32Array(h), p = new Uint8Array(f), y = new Int32Array(f), g = new Int32Array(f);
	let m = /* @__PURE__ */ new Int32Array(64), w = /* @__PURE__ */ new Int32Array(64), M = /* @__PURE__ */ new Int32Array(64), x = /* @__PURE__ */ new Int32Array(64), b = 0, A = 0, k = 0;
	const v = (t, n) => {
		const o = c[t], r = k;
		let s = r, i = t, l = 0, h = !1;
		for (y[l++] = t, p[t] = 1; l > 0;) {
			const t = y[--l];
			if (g[s++] = t, t < i && (i = t), n && s - r >= e) {
				h = !0;
				break;
			}
			const u = t - (t / a | 0) * a;
			if (u > 0) {
				const e = p[t - 1];
				if (1 !== e && c[t - 1] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t - 1] = 1, y[l++] = t - 1;
				}
			}
			if (u < a - 1) {
				const e = p[t + 1];
				if (1 !== e && c[t + 1] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t + 1] = 1, y[l++] = t + 1;
				}
			}
			if (t >= a) {
				const e = p[t - a];
				if (1 !== e && c[t - a] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t - a] = 1, y[l++] = t - a;
				}
			}
			if (t < f - a) {
				const e = p[t + a];
				if (1 !== e && c[t + a] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t + a] = 1, y[l++] = t + a;
				}
			}
		}
		if (h) {
			for (let t = r; t < s; t++) p[g[t]] = 2;
			for (let t = 0; t < l; t++) p[y[t]] = 2;
			return -1;
		}
		const u = s - r;
		return u >= e ? -1 : (k = s, b === m.length && (m = Lt(m), w = Lt(w), M = Lt(M)), m[b] = r, w[b] = u, M[b] = i, b++);
	}, I = (t) => {
		if (t < 0) return;
		A === x.length && (x = Lt(x));
		const e = M[t];
		let n = A++;
		for (; n > 0;) {
			const t = n - 1 >> 1;
			if (M[x[t]] <= e) break;
			x[n] = x[t], n = t;
		}
		x[n] = t;
	}, $ = () => {
		if (0 === A) return -1;
		const t = x[0], e = x[--A];
		if (A > 0) {
			const t = M[e];
			let n = 0;
			for (;;) {
				let e = 2 * n + 1;
				if (e >= A) break;
				if (e + 1 < A && M[x[e + 1]] < M[x[e]] && e++, M[x[e]] >= t) break;
				x[n] = x[e], n = e;
			}
			x[n] = e;
		}
		return t;
	}, S = (t) => {
		const e = m[t], n = e + w[t], l = c[g[e]];
		let h = !1, p = 0;
		for (let o = e; o < n; o++) {
			const t = g[o];
			null !== r && 0 !== r[t] && (h = !0);
			const e = t - (t / a | 0) * a;
			if (e > 0) {
				const e = c[t - 1];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (e < a - 1) {
				const e = c[t + 1];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (t >= a) {
				const e = c[t - a];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (t < f - a) {
				const e = c[t + a];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
		}
		let y = -1, M = 0;
		for (let o = 0; o < p; o++) {
			const t = d[o], e = u[t];
			u[t] = 0, (e > M || e === M && t < y) && (M = e, y = t);
		}
		if (h) return !1;
		if (-1 === y) return !1;
		if (i && function(t, e, n, o) {
			const r = 3 * e, i = 3 * n;
			return s(t[r], t[r + 1], t[r + 2], t[i], t[i + 1], t[i + 2]) >= o;
		}(i, l, y, o)) return !1;
		for (let o = e; o < n; o++) c[g[o]] = y;
		return !0;
	}, F = (t, e) => {
		if (0 !== p[t] || -1 === c[t]) return;
		const n = v(t, !0);
		n >= 0 && M[n] > e && I(n);
	}, C = Math.max(4096, f >> 3);
	let L = new Int32Array(Math.min(1024, C)), P = 0, R = !0;
	const z = (t) => {
		if (R) return;
		const e = m[t], n = w[t];
		if (P + n > C) R = !0;
		else {
			for (; P + n > L.length;) L = Lt(L);
			for (let t = e; t < e + n; t++) L[P++] = g[t];
		}
	};
	for (let s = 0; s < 8; s++) {
		p.fill(0), b = 0, A = 0, k = 0;
		const t = !R;
		if (t) for (let n = 0; n < P; n++) {
			const t = L[n], e = t - (t / a | 0) * a;
			0 === p[t] && -1 !== c[t] && I(v(t, !0)), e > 0 && 0 === p[t - 1] && -1 !== c[t - 1] && I(v(t - 1, !0)), e < a - 1 && 0 === p[t + 1] && -1 !== c[t + 1] && I(v(t + 1, !0)), t >= a && 0 === p[t - a] && -1 !== c[t - a] && I(v(t - a, !0)), t < f - a && 0 === p[t + a] && -1 !== c[t + a] && I(v(t + a, !0));
		}
		else for (let n = 0; n < f; n++) 0 === p[n] && -1 !== c[n] && v(n, !1);
		P = 0, R = !1;
		let e = !1;
		if (t) for (let n = $(); n >= 0; n = $()) {
			if (!S(n)) continue;
			e = !0, z(n);
			const t = M[n], o = m[n], r = o + w[n];
			for (let e = o; e < r; e++) {
				const n = g[e], o = n - (n / a | 0) * a;
				o > 0 && F(n - 1, t), o < a - 1 && F(n + 1, t), n >= a && F(n - a, t), n < f - a && F(n + a, t);
			}
		}
		else for (let n = 0; n < b; n++) S(n) && (e = !0, z(n));
		if (!e) break;
	}
	return t;
}
function Lt(t) {
	const e = new Int32Array(2 * t.length);
	return e.set(t), e;
}
function Pt(t, e) {
	if (e < 0) return 0;
	const { width: n, height: o, data: r } = t, s = n * o, i = new Int32Array(s);
	let a = 0;
	const l = (t) => {
		r[t] === e && (r[t] = -1, i[a++] = t);
	};
	for (let f = 0; f < n; f++) l(f), l((o - 1) * n + f);
	for (let f = 0; f < o; f++) l(f * n), l(f * n + (n - 1));
	let c = 0;
	for (; a > 0;) {
		const t = i[--a];
		c++;
		const e = t - (t / n | 0) * n;
		e > 0 && l(t - 1), e < n - 1 && l(t + 1), t >= n && l(t - n), t < s - n && l(t + n);
	}
	return c;
}
function Rt(t) {
	const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(r);
	for (let i = 0; i < r; i++) s[i] = 0 !== o[i] ? 1e9 : 0;
	for (let i = 0; i < n; i++) for (let t = 0; t < e; t++) {
		const n = i * e + t;
		let o = s[n];
		0 !== o && (t > 0 && s[n - 1] + 3 < o && (o = s[n - 1] + 3), i > 0 && (s[n - e] + 3 < o && (o = s[n - e] + 3), t > 0 && s[n - e - 1] + 4 < o && (o = s[n - e - 1] + 4), t < e - 1 && s[n - e + 1] + 4 < o && (o = s[n - e + 1] + 4)), s[n] = o);
	}
	for (let i = n - 1; i >= 0; i--) for (let t = e - 1; t >= 0; t--) {
		const o = i * e + t;
		let r = s[o];
		0 !== r && (t < e - 1 && s[o + 1] + 3 < r && (r = s[o + 1] + 3), i < n - 1 && (s[o + e] + 3 < r && (r = s[o + e] + 3), t < e - 1 && s[o + e + 1] + 4 < r && (r = s[o + e + 1] + 4), t > 0 && s[o + e - 1] + 4 < r && (r = s[o + e - 1] + 4)), s[o] = r);
	}
	for (let i = 0; i < r; i++) s[i] /= 3;
	return s;
}
const zt = 1024;
function Ut(t, e, n) {
	const o = Math.min(1, n / Math.max(t, e));
	return {
		w: Math.max(1, Math.round(t * o)),
		h: Math.max(1, Math.round(e * o))
	};
}
function Tt(t, e, n) {
	return Math.min(n - 1, Math.floor(t * n / e));
}
function qt(t, e) {
	const n = S(t, zt);
	return {
		kind: "rgba",
		width: n.width,
		height: n.height,
		data: new Uint8ClampedArray(n.data),
		caption: e
	};
}
function Ht(t, e, n) {
	const { w: o, h: r } = Ut(t.width, t.height, zt), s = new Uint16Array(o * r), { data: i, width: a, height: l } = t;
	for (let c = 0; c < r; c++) {
		const t = Tt(c, r, l);
		for (let e = 0; e < o; e++) {
			const n = i[t * a + Tt(e, o, a)];
			s[c * o + e] = n < 0 ? 65535 : n;
		}
	}
	return {
		kind: "labels",
		width: o,
		height: r,
		data: s,
		palette: e.slice(),
		caption: n
	};
}
function Bt(t, e) {
	const { w: n, h: o } = Ut(t.width, t.height, zt), r = new Uint8Array(n * o), { data: s, width: i, height: a } = t;
	for (let l = 0; l < o; l++) {
		const t = Tt(l, o, a);
		for (let e = 0; e < n; e++) r[l * n + e] = s[t * i + Tt(e, n, i)] ? 1 : 0;
	}
	return {
		kind: "mask",
		width: n,
		height: o,
		data: r,
		caption: e
	};
}
function jt(t, e = 48) {
	const n = new Array(e).fill(0), { data: o } = t;
	for (let r = 0; r < o.length; r += 4) {
		if (o[r + 3] < 8) continue;
		const t = .2126 * o[r] + .7152 * o[r + 1] + .0722 * o[r + 2];
		n[Math.min(e - 1, Math.floor(t / 256 * e))]++;
	}
	return {
		kind: "histogram",
		label: "Luminance",
		values: n,
		min: 0,
		max: 255,
		xLabel: "0–255"
	};
}
function Kt(t, e) {
	const n = [], o = [], r = [];
	for (let s = 0; s < t.length; s++) n.push(e[s] ?? 0), o.push(t[s]), r.push(t[s]);
	return {
		kind: "bars",
		label: "Palette population",
		values: n,
		colors: o,
		barLabels: r,
		yLabel: "pixels"
	};
}
function Ot(t) {
	const e = t.fill && "none" !== t.fill ? t.fill : t.stroke;
	return e && "none" !== e ? e : "#888888";
}
function Dt(t, e = 24) {
	const n = /* @__PURE__ */ new Map();
	for (const r of t) n.set(Ot(r), (n.get(Ot(r)) ?? 0) + r.commands.length);
	const o = [...n.entries()].toSorted((t, e) => e[1] - t[1]).slice(0, e);
	return {
		kind: "bars",
		label: "Nodes per color",
		values: o.map((t) => t[1]),
		colors: o.map((t) => t[0]),
		barLabels: o.map((t) => t[0]),
		yLabel: "nodes"
	};
}
function Nt(t, e = 24) {
	const n = t.map((t) => t.commands.length);
	let o = 0;
	for (const s of n) s > o && (o = s);
	o = Math.max(1, o);
	const r = new Array(e).fill(0);
	for (const s of n) r[Math.min(e - 1, Math.floor(s / (o + 1) * e))]++;
	return {
		kind: "histogram",
		label: "Nodes per shape",
		values: r,
		min: 0,
		max: o,
		xLabel: "nodes"
	};
}
function Zt(t) {
	let e = 0;
	for (const n of t) e += n.commands.length;
	return e;
}
function Et(t) {
	let e = 0;
	for (const n of t.data) n && e++;
	return t.data.length > 0 ? e / t.data.length : 0;
}
function Wt(t) {
	let e = 0;
	for (const n of t) n > 0 && e++;
	return e;
}
const Qt = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1]
];
function Xt(t, e, n) {
	const { width: o, height: r } = t, s = new Uint8Array(t.data), i = (t, e) => t >= 0 && t < o && e >= 0 && e < r ? s[e * o + t] : 0, a = [], l = new Int32Array(o * r);
	let c = /* @__PURE__ */ new Int32Array(64);
	const f = new Int32Array(r), h = new Int32Array(r);
	for (let m = 0; m < r; m++) {
		const e = m * o;
		for (let r = 0; r < o; r++) {
			if (1 !== s[e + r]) continue;
			const o = d(r, m), i = Math.abs(u(o)), c = 1 === t.data[e + r], f = i >= n, h = l[e + r];
			g(o, c ? f ? a.length + 1 : h : -1), f && a.push({
				points: o,
				area: c ? i : -i,
				interiorX: r,
				interiorY: m,
				parent: h - 1
			});
		}
	}
	return a;
	function d(t, e) {
		const n = [];
		let o = t, r = e, s = 0;
		do {
			n.push(o, r);
			const [t, e] = Qt[s], a = i(o + (t + e - 1) / 2, r + (e - t - 1) / 2), l = i(o + (t - e - 1) / 2, r + (e + t - 1) / 2);
			1 === l && 0 === a || (s = 1 === l && 1 === a ? s + 3 & 3 : 0 === l && 0 === a ? s + 1 & 3 : p(o, r, s));
			const [c, f] = Qt[s];
			o += c, r += f;
		} while (o !== t || r !== e);
		return n;
	}
	function p(t, n, o) {
		const r = o + 3 & 3, s = o + 1 & 3;
		switch (e) {
			case "left":
			case "black": return r;
			case "right":
			case "white": return s;
			case "majority": return y(t, n) ? r : s;
			case "minority": return y(t, n) ? s : r;
		}
	}
	function y(t, e) {
		for (let n = 2; n < 5; n++) {
			let o = 0;
			for (let r = 1 - n; r <= n - 1; r++) o += i(t + r, e + n - 1) ? 1 : -1, o += i(t + n - 1, e + r - 1) ? 1 : -1, o += i(t + r - 1, e - n) ? 1 : -1, o += i(t - n, e + r) ? 1 : -1;
			if (o > 0) return !0;
			if (o < 0) return !1;
		}
		return !1;
	}
	function g(t, e) {
		const n = t.length;
		let i = 0, a = r, u = -1;
		for (let o = 0; o < n; o += 2) {
			const e = t[o + 1], r = t[(o + 3) % n];
			if (r === e) continue;
			const s = r < e ? r : e;
			f[s]++, s < a && (a = s), s > u && (u = s), i++;
		}
		if (0 === i) return;
		if (i > c.length) {
			let t = c.length;
			for (; t < i;) t *= 2;
			c = new Int32Array(t);
		}
		let d = 0;
		for (let o = a; o <= u; o++) h[o] = d, d += f[o];
		for (let o = 0; o < n; o += 2) {
			const e = t[o + 1], r = t[(o + 3) % n];
			r !== e && (c[h[r < e ? r : e]++] = t[o]);
		}
		for (let r = a; r <= u; r++) {
			const t = h[r], n = t - f[r];
			f[r] = 0;
			for (let e = n + 1; e < t; e++) {
				const t = c[e];
				let o = e - 1;
				for (; o >= n && c[o] > t;) c[o + 1] = c[o], o--;
				c[o + 1] = t;
			}
			const i = r * o;
			for (let o = n; o + 1 < t; o += 2) {
				const t = c[o], n = c[o + 1];
				for (let e = t; e < n; e++) s[i + e] ^= 1;
				if (e >= 0) for (let o = t; o < n; o++) l[i + o] = e;
			}
		}
	}
}
function Yt(t) {
	const e = t.length >> 1, n = t[0], o = t[1], r = new Float64Array(e + 1), s = new Float64Array(e + 1), i = new Float64Array(e + 1), a = new Float64Array(e + 1), l = new Float64Array(e + 1);
	for (let c = 0; c < e; c++) {
		const e = t[2 * c] - n, f = t[2 * c + 1] - o;
		r[c + 1] = r[c] + e, s[c + 1] = s[c] + f, i[c + 1] = i[c] + e * e, a[c + 1] = a[c] + e * f, l[c + 1] = l[c] + f * f;
	}
	return {
		x: r,
		y: s,
		x2: i,
		xy: a,
		y2: l,
		ox: n,
		oy: o
	};
}
function Gt(t, e, n, o) {
	const { x: r, y: s, x2: i, xy: a, y2: l, ox: c, oy: f } = e, h = o + 1 - n, u = r[o + 1] - r[n], d = s[o + 1] - s[n], p = i[o + 1] - i[n], y = a[o + 1] - a[n], g = l[o + 1] - l[n], m = (t[2 * n] + t[2 * o]) / 2 - c, w = (t[2 * n + 1] + t[2 * o + 1]) / 2 - f, M = t[2 * o] - t[2 * n], x = t[2 * o + 1] - t[2 * n + 1], b = x * x * ((p - 2 * u * m) / h + m * m) - 2 * M * x * ((y - u * w - d * m) / h + m * w) + M * M * ((g - 2 * d * w) / h + w * w);
	return Math.sqrt(Math.max(0, b));
}
function Vt(t, e, n, o) {
	const { x: r, y: s, x2: i, xy: a, y2: l, ox: c, oy: f } = e, h = o + 1 - n, u = (r[o + 1] - r[n]) / h, d = (s[o + 1] - s[n]) / h, p = (i[o + 1] - i[n]) / h - u * u, y = (a[o + 1] - a[n]) / h - u * d, g = (l[o + 1] - l[n]) / h - d * d, m = (p + g + Math.sqrt((p - g) * (p - g) + 4 * y * y)) / 2;
	let w = 0, M = 0;
	Math.abs(p - m) >= Math.abs(g - m) ? (w = -y, M = p - m) : (w = g - m, M = -y);
	const x = Math.hypot(w, M);
	if (x < 1e-12) {
		w = t[2 * o] - t[2 * n], M = t[2 * o + 1] - t[2 * n + 1];
		const e = Math.hypot(w, M);
		return e < 1e-12 ? {
			cx: u + c,
			cy: d + f,
			dx: 1,
			dy: 0
		} : {
			cx: u + c,
			cy: d + f,
			dx: w / e,
			dy: M / e
		};
	}
	return {
		cx: u + c,
		cy: d + f,
		dx: w / x,
		dy: M / x
	};
}
function Jt(t, e, n, o) {
	const r = -n, s = -(o * t + r * e);
	return [
		o * o,
		o * r,
		o * s,
		o * r,
		r * r,
		r * s,
		o * s,
		r * s,
		s * s
	];
}
function _t(t, e) {
	const n = new Array(9);
	for (let o = 0; o < 9; o++) n[o] = t[o] + e[o];
	return n;
}
function te(t, e, n) {
	return t[0] * e * e + (t[1] + t[3]) * e * n + t[4] * n * n + (t[2] + t[6]) * e + (t[5] + t[7]) * n + t[8];
}
function ee(t, e, n, o) {
	const r = n.length, s = new Array(2 * r), i = r - 1, a = new Array(i);
	for (let l = 0; l < i; l++) {
		const { cx: o, cy: r, dx: s, dy: i } = Vt(t, e, n[l], n[l + 1]);
		a[l] = Jt(o, r, s, i);
	}
	for (let l = 0; l < r; l++) {
		const e = t[2 * n[l]], r = t[2 * n[l] + 1];
		let c = null, f = null;
		if (l > 0 ? c = a[l - 1] : o && (c = a[i - 1]), l < i ? f = a[l] : o && (f = a[0]), !c || !f) {
			s[2 * l] = e, s[2 * l + 1] = r;
			continue;
		}
		const [h, u] = ne(_t(c, f), e, r);
		s[2 * l] = h, s[2 * l + 1] = u;
	}
	return o && (s[2 * (r - 1)] = s[0], s[2 * (r - 1) + 1] = s[1]), s;
}
function ne(t, e, n) {
	const o = 2 * t[0], r = t[1] + t[3], s = t[2] + t[6], i = r, a = 2 * t[4], l = t[5] + t[7], c = o * a - r * i;
	if (Math.abs(c) > 1e-9) {
		const t = (-s * a + l * r) / c, f = (-o * l + s * i) / c;
		if (Math.abs(t - e) <= .5 && Math.abs(f - n) <= .5) return [t, f];
	}
	let f = e, h = n, u = te(t, e, n);
	const d = (e, n) => {
		const o = te(t, e, n);
		o < u && (u = o, f = e, h = n);
	};
	for (const p of [e - .5, e + .5]) Math.abs(a) > 1e-12 && d(p, oe((-r * p - l) / a, n - .5, n + .5)), d(p, n - .5), d(p, n + .5);
	for (const p of [n - .5, n + .5]) Math.abs(o) > 1e-12 && d(oe((-i * p - s) / o, e - .5, e + .5), p), d(e - .5, p), d(e + .5, p);
	return [f, h];
}
function oe(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function re(t) {
	const e = t.length > 0 && "Z" === t[t.length - 1].type, n = e ? t.slice(0, -1) : t.slice();
	if (0 === n.length) return [];
	const o = [], r = n[n.length - 1];
	if ("Z" === r.type || "M" !== n[0].type) throw new Error("reverseCommands: malformed subpath");
	const s = (r.type, r.x), i = (r.type, r.y);
	o.push({
		type: "M",
		x: s,
		y: i
	});
	for (let a = n.length - 1; a >= 1; a--) {
		const t = n[a], e = n[a - 1];
		switch (t.type) {
			case "L":
				o.push({
					type: "L",
					x: e.x,
					y: e.y
				});
				break;
			case "Q":
				o.push({
					type: "Q",
					x1: t.x1,
					y1: t.y1,
					x: e.x,
					y: e.y
				});
				break;
			case "C":
				o.push({
					type: "C",
					x1: t.x2,
					y1: t.y2,
					x2: t.x1,
					y2: t.y1,
					x: e.x,
					y: e.y
				});
				break;
			case "A": o.push({
				type: "A",
				rx: t.rx,
				ry: t.ry,
				rotation: t.rotation,
				largeArc: t.largeArc,
				sweep: !t.sweep,
				x: e.x,
				y: e.y
			});
		}
	}
	return e && o.push({ type: "Z" }), o;
}
function se(t, e, n, o, r, s, i, a, l) {
	const c = 1 - l, f = c * c * c, h = 3 * c * c * l, u = 3 * c * l * l, d = l * l * l;
	return [f * t + h * n + u * r + d * i, f * e + h * o + u * s + d * a];
}
function ie(t) {
	const e = 1 - t;
	return e * e * e;
}
function ae(t) {
	const e = 1 - t;
	return 3 * t * e * e;
}
function le(t) {
	return 3 * t * t * (1 - t);
}
function ce(t) {
	return t * t * t;
}
function fe(t, e, n, o, r, s, i, a) {
	const l = t[2 * e], c = t[2 * e + 1], f = t[2 * n], h = t[2 * n + 1];
	let u = 0, d = 0, p = 0, y = 0, g = 0;
	for (let A = e; A <= n; A++) {
		const n = o[A - e], m = r * ae(n), w = s * ae(n), M = i * le(n), x = a * le(n);
		u += m * m + w * w, d += m * M + w * x, p += M * M + x * x;
		const b = t[2 * A] - (ie(n) + ae(n)) * l - (le(n) + ce(n)) * f, k = t[2 * A + 1] - (ie(n) + ae(n)) * c - (le(n) + ce(n)) * h;
		y += m * b + w * k, g += M * b + x * k;
	}
	const m = u * p - d * d;
	let w = 0, M = 0;
	Math.abs(m) > 1e-12 && (w = (y * p - g * d) / m, M = (u * g - d * y) / m);
	const x = Math.hypot(f - l, h - c), b = 1e-6 * x;
	return (w < b || M < b) && (w = M = x / 3), {
		p0x: l,
		p0y: c,
		c1x: l + w * r,
		c1y: c + w * s,
		c2x: f + M * i,
		c2y: h + M * a,
		p3x: f,
		p3y: h
	};
}
function he(t, e) {
	return se(t.p0x, t.p0y, t.c1x, t.c1y, t.c2x, t.c2y, t.p3x, t.p3y, e);
}
function ue(t, e, n, o) {
	const [r, s] = he(t, o), [i, a] = function(t, e) {
		const n = 1 - e, o = 3 * (t.c1x - t.p0x), r = 3 * (t.c1y - t.p0y), s = 3 * (t.c2x - t.c1x), i = 3 * (t.c2y - t.c1y);
		return [n * n * o + 2 * n * e * s + e * e * (3 * (t.p3x - t.c2x)), n * n * r + 2 * n * e * i + e * e * (3 * (t.p3y - t.c2y))];
	}(t, o), [l, c] = function(t, e) {
		const n = 6 * (t.c2x - 2 * t.c1x + t.p0x), o = 6 * (t.c2y - 2 * t.c1y + t.p0y);
		return [(1 - e) * n + e * (6 * (t.p3x - 2 * t.c2x + t.c1x)), (1 - e) * o + e * (6 * (t.p3y - 2 * t.c2y + t.c1y))];
	}(t, o), f = r - e, h = s - n, u = f * i + h * a, d = i * i + a * a + f * l + h * c;
	if (Math.abs(d) < 1e-12) return o;
	const p = o - u / d;
	return p < 0 ? 0 : p > 1 ? 1 : p;
}
function de(t, e, n) {
	let o = 0, r = 1 / 0;
	for (let l = 0; l <= 16; l++) {
		const s = l / 16, [i, a] = he(t, s), c = (i - e) * (i - e) + (a - n) * (a - n);
		c < r && (r = c, o = s);
	}
	let s = o;
	for (let l = 0; l < 3; l++) s = ue(t, e, n, s);
	const [i, a] = he(t, s);
	return Math.min(Math.sqrt(r), Math.hypot(i - e, a - n));
}
function pe(t, e, n) {
	const o = t.length >> 1, r = [], s = [
		0,
		...n.filter((t) => t > 0 && t < o - 1),
		o - 1
	];
	for (let i = 0; i + 1 < s.length; i++) ge(t, s[i], s[i + 1], e, r);
	return r;
}
function ye(t, e) {
	const n = t[2 * (e - 1)] - t[2 * e], o = t[2 * (e - 1) + 1] - t[2 * e + 1], r = Math.hypot(n, o) || 1;
	return [n / r, o / r];
}
function ge(t, e, n, o, r) {
	const [s, i] = function(t, e) {
		const n = t[2 * (e + 1)] - t[2 * e], o = t[2 * (e + 1) + 1] - t[2 * e + 1], r = Math.hypot(n, o) || 1;
		return [n / r, o / r];
	}(t, e), [a, l] = ye(t, n);
	me(t, e, n, s, i, a, l, o, r, 0);
}
function me(t, e, n, o, r, s, i, a, l, c) {
	if (n - e === 1) return void l.push({
		type: "L",
		x: t[2 * n],
		y: t[2 * n + 1]
	});
	const f = n - e + 1, h = new Float64Array(f);
	for (let w = 1; w < f; w++) {
		const n = e + w;
		h[w] = h[w - 1] + Math.hypot(t[2 * n] - t[2 * (n - 1)], t[2 * n + 1] - t[2 * (n - 1) + 1]);
	}
	const u = h[f - 1] || 1;
	for (let w = 0; w < f; w++) h[w] /= u;
	let d = fe(t, e, n, h, o, r, s, i), { maxErr: p, splitAt: y } = we(t, e, n, d, h);
	if (p <= a) return void l.push(Me(d));
	if (p <= a * a * 16 || p <= 4 * a) for (let w = 0; w < 4; w++) {
		for (let n = 0; n < f; n++) h[n] = ue(d, t[2 * (e + n)], t[2 * (e + n) + 1], h[n]);
		let c = !0;
		for (let t = 1; t < f; t++) if (h[t] <= h[t - 1]) {
			c = !1;
			break;
		}
		if (!c) break;
		d = fe(t, e, n, h, o, r, s, i);
		const u = we(t, e, n, d, h);
		if (p = u.maxErr, y = u.splitAt, p <= a) return void l.push(Me(d));
	}
	if (c > 24) {
		for (let o = e + 1; o <= n; o++) l.push({
			type: "L",
			x: t[2 * o],
			y: t[2 * o + 1]
		});
		return;
	}
	const [g, m] = function(t, e) {
		const n = t[2 * (e - 1)] - t[2 * (e + 1)], o = t[2 * (e - 1) + 1] - t[2 * (e + 1) + 1], r = Math.hypot(n, o);
		if (r < 1e-12) {
			const [n, o] = ye(t, e);
			return [n, o];
		}
		return [n / r, o / r];
	}(t, y);
	me(t, e, y, o, r, g, m, a, l, c + 1), me(t, y, n, -g, -m, s, i, a, l, c + 1);
}
function we(t, e, n, o, r) {
	let s = 0, i = e + n >> 1;
	for (let a = e + 1; a < n; a++) {
		const [n, l] = he(o, r[a - e]), c = Math.hypot(n - t[2 * a], l - t[2 * a + 1]);
		c > s && (s = c, i = a);
	}
	return {
		maxErr: s,
		splitAt: i
	};
}
function Me(t) {
	return {
		type: "C",
		x1: t.c1x,
		y1: t.c1y,
		x2: t.c2x,
		y2: t.c2y,
		x: t.p3x,
		y: t.p3y
	};
}
function xe(t, e, n, o, r) {
	const s = [];
	let i = t, a = e, l = 0;
	for (; l < n.length;) {
		const t = n[l];
		if (t.corner) {
			s.push({
				type: "L",
				x: t.vx,
				y: t.vy
			}), s.push({
				type: "L",
				x: t.ex,
				y: t.ey
			}), i = t.ex, a = t.ey, l++;
			continue;
		}
		let e = l;
		for (; e + 1 < n.length && !n[e + 1].corner;) e++;
		Ae(n, l, e, i, a, o, r, s), i = n[e].ex, a = n[e].ey, l = e + 1;
	}
	return s;
}
const be = 24;
function Ae(t, e, n, o, r, s, i, a) {
	let l = o, c = r, f = e;
	for (; f <= n;) {
		let e = !1;
		if (s && i > 0) for (let o = Math.min(n, f + be - 1); o > f; o--) {
			const n = ke(t, f, o, l, c, i);
			if (n) {
				a.push({
					type: "C",
					x1: n.c1x,
					y1: n.c1y,
					x2: n.c2x,
					y2: n.c2y,
					x: n.p3x,
					y: n.p3y
				}), l = n.p3x, c = n.p3y, f = o + 1, e = !0;
				break;
			}
		}
		if (!e) {
			const e = t[f];
			a.push({
				type: "C",
				x1: e.c1x,
				y1: e.c1y,
				x2: e.c2x,
				y2: e.c2y,
				x: e.ex,
				y: e.ey
			}), l = e.ex, c = e.ey, f++;
		}
	}
}
function ke(t, e, n, o, r, s) {
	let i = t[e].ex - o, a = t[e].ey - r, l = 0, c = 0, f = t[e].ex, h = t[e].ey;
	for (let $ = e + 1; $ <= n; $++) {
		const e = t[$].ex - f, n = t[$].ey - h, o = i * n - a * e, r = Math.sign(o);
		if (0 !== r) {
			if (0 === l) l = r;
			else if (r !== l) return null;
		}
		const s = i * e + a * n;
		if (c += Math.abs(Math.atan2(Math.abs(o), s)), c > .994 * Math.PI) return null;
		i = e, a = n, f = t[$].ex, h = t[$].ey;
	}
	const u = [o, r];
	let d = o, p = r;
	for (let $ = e; $ <= n; $++) {
		const e = t[$];
		for (let t = 1; t <= 8; t++) {
			const [n, o] = se(d, p, e.c1x, e.c1y, e.c2x, e.c2y, e.ex, e.ey, t / 8);
			u.push(n, o);
		}
		d = e.ex, p = e.ey;
	}
	let y = t[e].c1x - o, g = t[e].c1y - r, m = Math.hypot(y, g);
	m < 1e-9 && (y = u[2] - o, g = u[3] - r, m = Math.hypot(y, g) || 1);
	const w = t[n];
	let M = w.c2x - w.ex, x = w.c2y - w.ey, b = Math.hypot(M, x);
	if (b < 1e-9) {
		const t = u.length;
		M = u[t - 4] - w.ex, x = u[t - 3] - w.ey, b = Math.hypot(M, x) || 1;
	}
	const A = u.length >> 1, k = new Float64Array(A);
	for (let $ = 1; $ < A; $++) k[$] = k[$ - 1] + Math.hypot(u[2 * $] - u[2 * ($ - 1)], u[2 * $ + 1] - u[2 * ($ - 1) + 1]);
	const v = k[A - 1] || 1;
	for (let $ = 0; $ < A; $++) k[$] /= v;
	const I = fe(u, 0, A - 1, k, y / m, g / m, M / b, x / b);
	for (let $ = 1; $ < A - 1; $ += 2) if (de(I, u[2 * $], u[2 * $ + 1]) > s) return null;
	for (let $ = e; $ <= n; $++) if (de(I, t[$].ex, t[$].ey) > s) return null;
	return I;
}
function ve(t) {
	const e = t.length >> 1;
	if (e <= 2) return 2 === e ? [0, 1] : [0];
	const n = function(t) {
		const e = t.length >> 1, n = (e) => t[2 * e], o = (e) => t[2 * e + 1], r = new Int8Array(Math.max(0, e - 1));
		for (let h = 0; h < e - 1; h++) r[h] = Ie(n(h + 1) - n(h), o(h + 1) - o(h));
		const s = new Int32Array(Math.max(0, e - 1));
		if (e >= 2) {
			s[e - 2] = e - 1;
			for (let t = e - 3; t >= 0; t--) s[t] = r[t + 1] !== r[t] ? t + 1 : s[t + 1];
		}
		const i = new Int32Array(e);
		i[e - 1] = e - 1;
		const a = /* @__PURE__ */ new Int32Array(4);
		for (let h = e - 2; h >= 0; h--) {
			a[0] = a[1] = a[2] = a[3] = 0, a[r[h]]++;
			let t = 0, l = 0, c = 0, f = 0, u = h, d = s[h], p = !1, y = !1;
			for (;;) {
				if (a[Ie(Math.sign(n(d) - n(u)), Math.sign(o(d) - o(u)))]++, 0 !== a[0] && 0 !== a[1] && 0 !== a[2] && 0 !== a[3]) {
					i[h] = u, p = !0;
					break;
				}
				const r = n(d) - n(h), g = o(d) - o(h);
				if (t * g - l * r < 0 || c * g - f * r > 0) {
					y = !0;
					break;
				}
				if (Math.abs(r) > 1 || Math.abs(g) > 1) {
					const e = r + (g >= 0 && (g > 0 || r < 0) ? 1 : -1), n = g + (r <= 0 && (r < 0 || g < 0) ? 1 : -1);
					t * n - l * e >= 0 && (t = e, l = n);
					const o = r + (g <= 0 && (g < 0 || r < 0) ? 1 : -1), s = g + (r >= 0 && (r > 0 || g < 0) ? 1 : -1);
					c * s - f * o <= 0 && (c = o, f = s);
				}
				if (u = d, u === e - 1) {
					i[h] = e - 1, p = !0;
					break;
				}
				d = s[u];
			}
			if (!p && y) {
				const r = Math.sign(n(d) - n(u)), s = Math.sign(o(d) - o(u)), a = n(u) - n(h), p = o(u) - o(h), y = t * p - l * a, g = t * s - l * r, m = c * p - f * a, w = c * s - f * r;
				let M = 1e7;
				g < 0 && (M = Math.floor(y / -g)), w > 0 && (M = Math.min(M, Math.floor(-m / w))), i[h] = Math.min(e - 1, Math.max(u, u + M));
			}
		}
		const l = new Int32Array(e);
		l[e - 1] = e - 1;
		let c = i[e - 1];
		for (let h = e - 2; h >= 0; h--) i[h] >= h + 1 && i[h] <= c && (c = i[h]), l[h] = c;
		const f = new Int32Array(e);
		for (let h = 0; h < e; h++) {
			const t = 0 === h ? l[0] : l[h - 1];
			f[h] = t >= e - 1 ? e - 1 : Math.min(e - 1, Math.max(h + 1, t - 1));
		}
		return f[e - 1] = e - 1, f;
	}(t), o = Yt(t);
	let r = 0;
	{
		let t = 0;
		for (; t < e - 1;) t = n[t], r++;
	}
	const s = new Int32Array(r + 1);
	{
		let t = 0;
		for (let e = 1; e <= r; e++) t = n[t], s[e] = t;
	}
	const i = new Int32Array(e);
	{
		let t = 0;
		for (let o = 1; o < e; o++) {
			for (; n[t] < o;) t++;
			i[o] = t;
		}
	}
	const a = new Int32Array(r + 1);
	a[r] = e - 1;
	for (let d = r - 1; d >= 0; d--) a[d] = i[a[d + 1]];
	let l = new Float64Array(e).fill(1 / 0), c = new Float64Array(e).fill(1 / 0);
	l[0] = 0;
	const f = [];
	for (let d = 1; d <= r; d++) {
		const i = a[d], h = d === r ? e - 1 : s[d], u = a[d - 1], p = s[d - 1], y = new Int32Array(h - i + 1).fill(-1);
		c.fill(1 / 0, i, h + 1);
		for (let s = Math.max(i, d === r ? e - 1 : i); s <= h; s++) {
			let e = 1 / 0, r = -1;
			const a = Math.min(p, s - 1);
			for (let i = u; i <= a; i++) {
				if (n[i] < s) continue;
				const a = l[i];
				if (a === 1 / 0) continue;
				const c = a + Gt(t, o, i, s);
				c < e && (e = c, r = i);
			}
			c[s] = e, y[s - i] = r;
		}
		f.push(y);
		const g = l;
		l = c, c = g;
	}
	const h = [e - 1];
	let u = e - 1;
	for (let d = r; d >= 1; d--) {
		const t = a[d], e = f[d - 1][u - t];
		if (e < 0) {
			h.push(0);
			break;
		}
		h.push(e), u = e;
	}
	return h.reverse(), 0 !== h[0] && h.unshift(0), h;
}
function Ie(t, e) {
	return (3 + 3 * Math.sign(t) + Math.sign(e)) / 2;
}
function $e(t, e, n, o, r, s, i, a) {
	const l = Math.abs(r - t) + Math.abs(s - e);
	let c;
	if (0 !== l) {
		const i = Math.abs((n - t) * (s - e) - (r - t) * (o - e)) / l;
		c = i > 1 ? 1 - 1 / i : 0, c /= .75;
	} else c = 4 / 3;
	const f = (t + n) / 2, h = (e + o) / 2, u = (n + r) / 2, d = (o + s) / 2;
	if (function(t, e, n, o, r, s, i, a, l) {
		return void 0 === l ? t >= e : !(Math.min(Math.hypot(n - r, o - s), Math.hypot(i - r, a - s)) < 1.5) && (y(n, o, r, s, i, a) < l || t >= e);
	}(c, i, t, e, n, o, r, s, a)) return {
		corner: !0,
		vx: n,
		vy: o,
		c1x: 0,
		c1y: 0,
		c2x: 0,
		c2y: 0,
		ex: u,
		ey: d
	};
	const p = c < .55 ? .55 : c > 1 ? 1 : c;
	return {
		corner: !1,
		vx: n,
		vy: o,
		c1x: f + p * (n - f),
		c1y: h + p * (o - h),
		c2x: u + p * (n - u),
		c2y: d + p * (o - d),
		ex: u,
		ey: d
	};
}
const Se = .75, Fe = .4999;
function Ce(t, e) {
	const n = e.width, o = e.height, r = "data" in e ? e.data : null, s = (t, s) => {
		const i = t < 0 ? 0 : t >= n ? n - 1 : t, a = s < 0 ? 0 : s >= o ? o - 1 : s;
		return null !== r ? r[a * n + i] : e.at(i, a);
	}, i = t.length >> 1, a = new Array(t.length);
	for (let l = 0; l < i; l++) {
		const e = t[2 * l], r = t[2 * l + 1];
		if (a[2 * l] = e, a[2 * l + 1] = r, e <= 0 || r <= 0 || e >= n || r >= o) continue;
		const i = s(e - 1, r - 1), c = s(e, r - 1), f = s(e - 1, r), h = s(e, r);
		if (i > 0 && c > 0 && f > 0 && h > 0 || i < 0 && c < 0 && f < 0 && h < 0) continue;
		if (Math.abs(i) >= Fe && Math.abs(c) >= Fe && Math.abs(f) >= Fe && Math.abs(h) >= Fe) continue;
		const u = (i + c + f + h) / 4, d = (c + h - i - f) / 2, p = (f + h - i - c) / 2, y = d * d + p * p;
		if (y < 1e-12) continue;
		const g = -u / y;
		let m = g * d, w = g * p;
		m = m > Se ? Se : m < -.75 ? -.75 : m, w = w > Se ? Se : w < -.75 ? -.75 : w, a[2 * l] = e + m, a[2 * l + 1] = r + w;
	}
	return a;
}
function Le(t, e, n) {
	const o = (t, o) => n ? ze(t.points, n[o], e) : Pe(t.points, e), r = [], s = new Int32Array(t.length);
	for (let a = 0; a < t.length; a++) {
		const e = t[a];
		e.area > 0 ? (s[a] = r.length, r.push({
			area: e.area,
			commands: o(e, a),
			holes: []
		})) : e.parent >= 0 && r[s[e.parent]].holes.push(o(e, a));
	}
	const i = r.map((t) => ({
		commands: t.commands.concat(...t.holes),
		area: t.area,
		holeCount: t.holes.length
	}));
	return i.sort((t, e) => e.area - t.area), i;
}
function Pe(t, e, n) {
	return "pixel" === e.curveMode ? Ue(t) : ze(t, Re(t, n ?? e.coverage), e);
}
function Re(t, e) {
	const n = t.slice();
	n.push(t[0], t[1]);
	const o = ve(n);
	if (o.length < 4) return null;
	const r = e ? Ce(n, e) : n;
	return ee(r, Yt(r), o, !0);
}
function ze(t, e, n) {
	if ("pixel" === n.curveMode || null === e) return Ue(t);
	if ("polygon" === n.curveMode) {
		const t = [{
			type: "M",
			x: e[0],
			y: e[1]
		}];
		for (let n = 1; n < (e.length >> 1) - 1; n++) t.push({
			type: "L",
			x: e[2 * n],
			y: e[2 * n + 1]
		});
		return t.push({ type: "Z" }), t;
	}
	const o = function(t, e, n) {
		const o = t.length >> 1, r = new Array(o);
		for (let s = 0; s < o; s++) {
			const i = (s + o - 1) % o, a = (s + 1) % o;
			r[s] = $e(t[2 * i], t[2 * i + 1], t[2 * s], t[2 * s + 1], t[2 * a], t[2 * a + 1], e, n);
		}
		return r;
	}(e.slice(0, e.length - 2), 4 * n.smoothing / 3, n.cornerThreshold), r = o[o.length - 1], s = [{
		type: "M",
		x: r.ex,
		y: r.ey
	}];
	return s.push(...xe(r.ex, r.ey, o, n.curveOptimize, n.optTolerance)), s.push({ type: "Z" }), s;
}
function Ue(t) {
	const e = t.length >> 1, n = [];
	for (let o = 0; o < e; o++) {
		const r = (o + e - 1) % e, s = (o + 1) % e, i = t[2 * o] - t[2 * r], a = t[2 * o + 1] - t[2 * r + 1], l = t[2 * s] - t[2 * o];
		i * (t[2 * s + 1] - t[2 * o + 1]) - a * l !== 0 && (0 === n.length ? n.push({
			type: "M",
			x: t[2 * o],
			y: t[2 * o + 1]
		}) : n.push({
			type: "L",
			x: t[2 * o],
			y: t[2 * o + 1]
		}));
	}
	return 0 === n.length && n.push({
		type: "M",
		x: t[0],
		y: t[1]
	}), n.push({ type: "Z" }), n;
}
const Te = [
	1,
	0,
	-1,
	0
], qe = [
	0,
	1,
	0,
	-1
];
function He(t) {
	const { width: e, height: n, data: o } = t, r = (t, r) => t >= 0 && t < e && r >= 0 && r < n ? o[r * e + t] : -1, s = e + 1, i = new Uint8Array(e * (n + 1)), a = new Uint8Array(s * n);
	for (let y = 0; y <= n; y++) for (let t = 0; t < e; t++) r(t, y - 1) !== r(t, y) && (i[y * e + t] = 1);
	for (let y = 0; y < n; y++) for (let t = 0; t <= e; t++) r(t - 1, y) !== r(t, y) && (a[y * s + t] = 1);
	const l = (t, o, r) => {
		switch (r) {
			case 0: return t < e ? i[o * e + t] : 0;
			case 1: return o < n ? a[o * s + t] : 0;
			case 2: return t > 0 ? i[o * e + (t - 1)] : 0;
			default: return o > 0 ? a[(o - 1) * s + t] : 0;
		}
	}, c = (t, e) => (0 !== l(t, e, 0) ? 1 : 0) + (0 !== l(t, e, 1) ? 1 : 0) + (0 !== l(t, e, 2) ? 1 : 0) + (0 !== l(t, e, 3) ? 1 : 0), f = (t, n, o) => {
		0 === o ? i[n * e + t] = 2 : 1 === o ? a[n * s + t] = 2 : 2 === o ? i[n * e + (t - 1)] = 2 : a[(n - 1) * s + t] = 2;
	}, h = (t, o, r) => 0 === r ? t < e && 1 === i[o * e + t] : 1 === r ? o < n && 1 === a[o * s + t] : 2 === r ? t > 0 && 1 === i[o * e + (t - 1)] : o > 0 && 1 === a[(o - 1) * s + t], u = [], d = (t, e, n, o) => {
		const [s, i] = ((t, e, n) => {
			switch (n) {
				case 0: return [r(t, e - 1), r(t, e)];
				case 1: return [r(t, e), r(t - 1, e)];
				case 2: return [r(t - 1, e), r(t - 1, e - 1)];
				default: return [r(t - 1, e - 1), r(t, e - 1)];
			}
		})(t, e, n), a = [t, e];
		let d = 0, p = t, y = e, g = n;
		const m = n;
		for (;;) {
			f(p, y, g);
			const n = p + Te[g], r = y + qe[g];
			if (d += p * r - n * y, a.push(n, r), p = n, y = r, p === t && y === e) break;
			if (o && c(p, y) >= 3) break;
			let s = -1;
			for (let t = 0; t < 4; t++) if (t !== (g + 2) % 4 && 0 !== l(p, y, t) && h(p, y, t)) {
				s = t;
				break;
			}
			if (-1 === s) break;
			g = s;
		}
		u.push({
			points: a,
			left: s,
			right: i,
			loop: p === t && y === e && a.length > 2,
			firstDir: m,
			lastDir: g,
			shoelace: d
		});
	};
	for (let y = 0; y <= n; y++) for (let t = 0; t <= e; t++) if (c(t, y) >= 3) for (let e = 0; e < 4; e++) h(t, y, e) && d(t, y, e, !0);
	for (let y = 0; y <= n; y++) for (let t = 0; t <= e; t++) for (let e = 0; e < 2; e++) h(t, y, e) && d(t, y, e, !1);
	const p = /* @__PURE__ */ new Map();
	for (let y = 0; y < o.length; y++) {
		const t = o[y];
		t >= 0 && p.set(t, (p.get(t) ?? 0) + 1);
	}
	return {
		width: e,
		height: n,
		chains: u,
		areas: p
	};
}
function Be(t, e, n) {
	const o = t.chains[e], r = function(t, e, n) {
		const o = n.colorField;
		if (!o || e.left < 0 || e.right < 0) return;
		const r = 3 * e.left, s = 3 * e.right;
		return function(t, e, n, o, r) {
			const s = o[0], i = o[1], a = o[2], l = r[0], c = r[1], f = r[2], h = s - l, u = i - c, d = a - f, p = Math.sqrt(h * h + u * u + d * d), y = p > 1e-6 ? .5 / p : 0;
			return {
				width: e,
				height: n,
				at(n, o) {
					const r = 3 * (o * e + n), h = t[r], u = t[r + 1], d = t[r + 2], p = h - s, g = u - i, m = d - a, w = h - l, M = u - c, x = d - f, b = (Math.sqrt(p * p + g * g + m * m) - Math.sqrt(w * w + M * M + x * x)) * y;
					return b < -.5 ? -.5 : b > .5 ? .5 : b;
				}
			};
		}(o.oklab, t.width, t.height, [
			o.paletteOklab[r],
			o.paletteOklab[r + 1],
			o.paletteOklab[r + 2]
		], [
			o.paletteOklab[s],
			o.paletteOklab[s + 1],
			o.paletteOklab[s + 2]
		]);
	}(t, o, n), s = function(t, e, n) {
		if (!n.refineChain) return t;
		const o = e.points[0], r = e.points[1];
		return Ze(n.refineChain([{
			type: "M",
			x: o,
			y: r
		}, ...t]));
	}(function(t, e, n) {
		if (t.length >> 1 < 2) return [];
		if ("pixel" === e.curveMode) return function(t) {
			const e = t.length >> 1, n = [];
			for (let o = 1; o < e - 1; o++) {
				const e = t[2 * o] - t[2 * (o - 1)], r = t[2 * o + 1] - t[2 * (o - 1) + 1], s = t[2 * (o + 1)] - t[2 * o];
				e * (t[2 * (o + 1) + 1] - t[2 * o + 1]) - r * s !== 0 && n.push({
					type: "L",
					x: t[2 * o],
					y: t[2 * o + 1]
				});
			}
			return n.push({
				type: "L",
				x: t[2 * (e - 1)],
				y: t[2 * (e - 1) + 1]
			}), n;
		}(t);
		const o = ve(t);
		let r = t;
		if (n) {
			r = Ce(t, n);
			const e = r.length;
			r[0] = t[0], r[1] = t[1], r[e - 2] = t[e - 2], r[e - 1] = t[e - 1];
		}
		const s = ee(r, Yt(r), o, !1), i = s.length >> 1;
		if ("polygon" === e.curveMode || i <= 2) {
			const t = [];
			for (let e = 1; e < i; e++) t.push({
				type: "L",
				x: s[2 * e],
				y: s[2 * e + 1]
			});
			return t;
		}
		const a = function(t, e, n) {
			const o = t.length >> 1, r = [];
			for (let s = 1; s < o - 1; s++) r.push($e(t[2 * (s - 1)], t[2 * (s - 1) + 1], t[2 * s], t[2 * s + 1], t[2 * (s + 1)], t[2 * (s + 1) + 1], e, n));
			return r;
		}(s, 4 * e.smoothing / 3, e.cornerThreshold), l = [], c = (s[0] + s[2]) / 2, f = (s[1] + s[3]) / 2;
		return l.push({
			type: "L",
			x: c,
			y: f
		}), l.push(...xe(c, f, a, e.curveOptimize, e.optTolerance)), l.push({
			type: "L",
			x: s[2 * (i - 1)],
			y: s[2 * (i - 1) + 1]
		}), l;
	}(o.points, n, r), o, n);
	if (!o.loop) return { open: s };
	const i = function(t, e, n) {
		const o = t.slice(0, t.length - 2), r = o.length >> 1;
		let s = 0;
		for (let a = 0; a < r; a++) {
			const t = (a + r - 1) % r, e = (a + 1) % r, n = o[2 * a] - o[2 * t], i = o[2 * a + 1] - o[2 * t + 1], l = o[2 * e] - o[2 * a];
			if (n * (o[2 * e + 1] - o[2 * a + 1]) - i * l !== 0) {
				s = a;
				break;
			}
		}
		const i = new Array(o.length);
		for (let a = 0; a < r; a++) {
			const t = (s + a) % r;
			i[2 * a] = o[2 * t], i[2 * a + 1] = o[2 * t + 1];
		}
		return Pe(i, e, n);
	}(o.points, n, r);
	return {
		open: s,
		closed: n.refineChain ? n.refineChain(i) : i
	};
}
function je(t, e) {
	const { chains: n, areas: o } = t, r = t.width + 1, s = new Array(n.length).fill(null), i = (t) => {
		const n = t.chain, o = e[n].closed;
		return t.forward ? o : s[n] ??= re(o);
	}, a = (t) => {
		const o = t.chain;
		return t.forward ? e[o].open : s[o] ??= Ze(re([{
			type: "M",
			x: n[o].points[0],
			y: n[o].points[1]
		}, ...e[o].open]));
	}, l = /* @__PURE__ */ new Map(), c = (t, e) => e * r + t, f = (t, e) => {
		if (t < 0) return;
		const o = n[e.chain].points, r = e.forward ? o[0] : o[o.length - 2], s = e.forward ? o[1] : o[o.length - 1];
		let i = l.get(t);
		i || (i = /* @__PURE__ */ new Map(), l.set(t, i));
		const a = c(r, s);
		let f = i.get(a);
		f || (f = [], i.set(a, f)), f.push(e);
	};
	for (let u = 0; u < n.length; u++) f(n[u].right, {
		chain: u,
		forward: !0,
		used: !1
	}), f(n[u].left, {
		chain: u,
		forward: !1,
		used: !1
	});
	const h = [];
	for (const [u, d] of l) {
		const t = [];
		let e = 0;
		for (const o of d.values()) for (const r of o) {
			if (r.used) continue;
			const o = n[r.chain];
			if (o.loop) {
				r.used = !0, (r.forward ? o.shoelace : -o.shoelace) / 2 < 0 && e++, t.push(...i(r));
				continue;
			}
			let s = 0;
			const l = [], f = o.points, h = r.forward ? f[0] : f[f.length - 2], u = r.forward ? f[1] : f[f.length - 1];
			l.push({
				type: "M",
				x: h,
				y: u
			});
			let p = r;
			for (;;) {
				p.used = !0;
				const t = n[p.chain];
				s += p.forward ? t.shoelace : -t.shoelace, l.push(...a(p));
				const [e, o] = Ne(n, p), i = Ke(n, d.get(c(e, o)), De(n, p), r);
				if (!i || i === r) break;
				p = i;
			}
			l.push({ type: "Z" }), s / 2 < 0 && e++, t.push(...l);
		}
		t.length > 0 && h.push({
			label: u,
			commands: t,
			area: o.get(u) ?? 0,
			holeCount: e
		});
	}
	return h;
}
function Ke(t, e, n, o) {
	if (!e) return null;
	for (const r of [
		1,
		0,
		3,
		2
	]) {
		const s = (n + r) % 4;
		for (const n of e) if ((n === o || !n.used) && Oe(t, n) === s) return n;
	}
	return null;
}
function Oe(t, e) {
	const n = t[e.chain];
	return e.forward ? n.firstDir : (n.lastDir + 2) % 4;
}
function De(t, e) {
	const n = t[e.chain];
	return e.forward ? n.lastDir : (n.firstDir + 2) % 4;
}
function Ne(t, e) {
	const n = t[e.chain].points;
	return e.forward ? [n[n.length - 2], n[n.length - 1]] : [n[0], n[1]];
}
function Ze(t) {
	return t.filter((t) => "M" !== t.type && "Z" !== t.type);
}
function Ee(t, e) {
	const n = t.length >> 1;
	if (n <= 2 || e <= 0) return t.slice();
	const o = new Uint8Array(n);
	o[0] = 1, o[n - 1] = 1;
	const r = [0, n - 1];
	for (; r.length > 0;) {
		const n = r.pop(), s = r.pop();
		let i = -1, a = -1;
		const l = t[2 * s], c = t[2 * s + 1], f = t[2 * n], h = t[2 * n + 1];
		for (let e = s + 1; e < n; e++) {
			const n = p(t[2 * e], t[2 * e + 1], l, c, f, h);
			n > i && (i = n, a = e);
		}
		i > e && a > 0 && (o[a] = 1, r.push(s, a, a, n));
	}
	const s = [];
	for (let i = 0; i < n; i++) o[i] && s.push(t[2 * i], t[2 * i + 1]);
	return s;
}
function We(t, e, n, o) {
	const r = t.length >> 1, s = new Float64Array(r);
	let i = 0;
	for (let c = 0; c < r; c++) {
		const r = Math.floor(t[2 * c]), a = Math.floor(t[2 * c + 1]);
		r < 0 || a < 0 || r >= n || a >= o || (s[i++] = 2 * e[a * n + r]);
	}
	if (0 === i) return;
	const a = s.subarray(0, i);
	a.sort();
	const l = i >> 1;
	return i % 2 == 1 ? a[l] : (a[l - 1] + a[l]) / 2;
}
function Qe(t, e) {
	return 3 * (e + 1) + (t + 1);
}
function Xe(t) {
	const e = t.length >> 1, n = new Array(t.length);
	for (let o = 0; o < e; o++) n[2 * o] = t[2 * (e - 1 - o)], n[2 * o + 1] = t[2 * (e - 1 - o) + 1];
	return n;
}
function Ye(t, e, n) {
	if (e <= 0) return t;
	let o = t.slice();
	const r = o.length >> 1;
	if (r < 3) return o;
	for (let s = 0; s < e; s++) {
		const t = o.slice(), e = n ? r : r - 1;
		for (let s = n ? 0 : 1; s < e; s++) {
			const e = (s + r - 1) % r, n = (s + 1) % r;
			t[2 * s] = .25 * o[2 * e] + .5 * o[2 * s] + .25 * o[2 * n], t[2 * s + 1] = .25 * o[2 * e + 1] + .5 * o[2 * s + 1] + .25 * o[2 * n + 1];
		}
		o = t;
	}
	return o;
}
function Ge(t) {
	const e = t.trim().toLowerCase();
	if ("" === e || "none" === e || "transparent" === e) return null;
	if (e.startsWith("url(")) return null;
	const n = /^#([0-9a-f]{3})$/.exec(e);
	if (null !== n) {
		const t = n[1];
		return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
	}
	return e;
}
function Ve(t, e) {
	return t[e] ?? t[e + 1] ?? "";
}
function Je(t, e) {
	const n = e.length, o = t.map((t, n) => [...t, e[n]]);
	for (let r = 0; r < n; r++) {
		let t = r;
		for (let e = r + 1; e < n; e++) Math.abs(o[e][r]) > Math.abs(o[t][r]) && (t = e);
		if (Math.abs(o[t][r]) < 1e-12) return null;
		[o[r], o[t]] = [o[t], o[r]];
		for (let e = 0; e < n; e++) {
			if (e === r) continue;
			const t = o[e][r] / o[r][r];
			for (let s = r; s <= n; s++) o[e][s] -= t * o[r][s];
		}
	}
	return o.map((t, e) => t[n] / t[e]);
}
function _e(t) {
	const e = t.length;
	if (e < 3) return null;
	let n = 0, o = 0, r = 0, s = 0, i = 0, a = 0, l = 0, c = 0;
	for (const m of t) {
		const t = m.x * m.x + m.y * m.y;
		n += m.x * m.x, o += m.x * m.y, r += m.y * m.y, s += m.x, i += m.y, a += m.x * t, l += m.y * t, c += t;
	}
	const f = Je([
		[
			n,
			o,
			s
		],
		[
			o,
			r,
			i
		],
		[
			s,
			i,
			e
		]
	], [
		-a,
		-l,
		-c
	]);
	if (!f) return null;
	const [h, u, d] = f, p = -h / 2, y = -u / 2, g = p * p + y * y - d;
	return g <= 0 ? null : {
		cx: p,
		cy: y,
		r: Math.sqrt(g)
	};
}
function tn(t) {
	const e = t.length;
	if (e < 6) return null;
	let n = 0, o = 0;
	for (const z of t) n += z.x, o += z.y;
	n /= e, o /= e;
	let r = 0;
	for (const z of t) r += (z.x - n) ** 2 + (z.y - o) ** 2;
	const s = Math.sqrt(r / e) || 1, i = Array.from({ length: 6 }, () => new Array(6).fill(0));
	for (const z of t) {
		const t = (z.x - n) / s, e = (z.y - o) / s, r = [
			t * t,
			t * e,
			e * e,
			t,
			e,
			1
		];
		for (let n = 0; n < 6; n++) for (let t = 0; t < 6; t++) i[n][t] += r[n] * r[t];
	}
	const { values: a, vectors: l } = function(t) {
		const e = t.map((t) => [...t]), n = Array.from({ length: 6 }, (t, e) => Array.from({ length: 6 }, (t, n) => e === n ? 1 : 0));
		for (let o = 0; o < 100; o++) {
			let t = 0;
			for (let n = 0; n < 6; n++) for (let o = n + 1; o < 6; o++) t += e[n][o] * e[n][o];
			if (t < 1e-20) break;
			for (let o = 0; o < 6; o++) for (let t = o + 1; t < 6; t++) {
				if (Math.abs(e[o][t]) < 1e-18) continue;
				const r = (e[t][t] - e[o][o]) / (2 * e[o][t]), s = Math.sign(r || 1) / (Math.abs(r) + Math.sqrt(r * r + 1)), i = 1 / Math.sqrt(s * s + 1), a = s * i;
				for (let n = 0; n < 6; n++) {
					const r = e[n][o], s = e[n][t];
					e[n][o] = i * r - a * s, e[n][t] = a * r + i * s;
				}
				for (let n = 0; n < 6; n++) {
					const r = e[o][n], s = e[t][n];
					e[o][n] = i * r - a * s, e[t][n] = a * r + i * s;
				}
				for (let e = 0; e < 6; e++) {
					const r = n[e][o], s = n[e][t];
					n[e][o] = i * r - a * s, n[e][t] = a * r + i * s;
				}
			}
		}
		return {
			values: e.map((t, e) => t[e]),
			vectors: n
		};
	}(i);
	let c = 0;
	for (let z = 1; z < 6; z++) a[z] < a[c] && (c = z);
	const [f, h, u, d, p, y] = l.map((t) => t[c]);
	if (h * h - 4 * f * u >= 0) return null;
	const g = Je([[2 * f, h], [h, 2 * u]], [-d, -p]);
	if (!g) return null;
	const [m, w] = g, M = f * m * m + h * m * w + u * w * w + d * m + p * w + y, x = f + u, b = f * u - h * h / 4, A = Math.sqrt(Math.max(0, x * x / 4 - b)), k = x / 2 + A, v = x / 2 - A;
	if (0 === k || 0 === v) return null;
	const I = -M / k, $ = -M / v;
	if (I <= 0 || $ <= 0) return null;
	const S = Math.sqrt(I), F = Math.sqrt($), C = Math.abs(h) < 1e-12 && Math.abs(f - k) < 1e-12 ? 0 : Math.atan2(k - f, h / 2);
	let L, P, R;
	for (S >= F ? (L = S, P = F, R = C) : (L = F, P = S, R = C + Math.PI / 2); R > Math.PI / 2;) R -= Math.PI;
	for (; R <= -Math.PI / 2;) R += Math.PI;
	return {
		cx: n + m * s,
		cy: o + w * s,
		rx: L * s,
		ry: P * s,
		angle: R
	};
}
function en(t, e) {
	let n = t.toFixed(nn(e));
	return n.includes(".") && (n = n.replace(/\.?0+$/, "")), "-0" === n && (n = "0"), n;
}
function nn(t) {
	const e = Math.round(t);
	return e < 0 ? 0 : e > 4 ? 4 : e;
}
function on(t, e, n) {
	const o = 1 - n, r = o * o * o, s = 3 * o * o * n, i = 3 * o * n * n, a = n * n * n;
	return {
		x: r * t.x + s * e.x1 + i * e.x2 + a * e.x,
		y: r * t.y + s * e.y1 + i * e.y2 + a * e.y
	};
}
function rn(t, e) {
	let n = t - e;
	for (; n > Math.PI;) n -= 2 * Math.PI;
	for (; n <= -Math.PI;) n += 2 * Math.PI;
	return n;
}
function sn(t, e, n, o) {
	const r = m(t.x, t.y, e);
	if (null === r) return !1;
	const { cx: s, cy: i, rx: a, ry: l, phi: c, theta1: f, dTheta: h } = r, u = Math.cos(c), d = Math.sin(c), p = Math.min(a, l), y = 2 * Math.PI, g = (t) => {
		let e = t - f;
		return h >= 0 ? (e = (e % y + y) % y, e <= h + 1e-6) : (e = -(-e % y + y) % y, e >= h - 1e-6);
	};
	for (const m of n) {
		const t = m.x - s, e = m.y - i, n = (t * u + e * d) / a, r = (-t * d + e * u) / l;
		if (Math.abs(Math.hypot(n, r) - 1) * p > o) return !1;
		if (!g(Math.atan2(r, n))) return !1;
	}
	return !0;
}
function an(t, e, n) {
	const o = [t];
	let r = t;
	for (const m of e) o.push(on(r, m, .25), on(r, m, .5), on(r, m, .75), {
		x: m.x,
		y: m.y
	}), r = {
		x: m.x,
		y: m.y
	};
	const s = r, i = function(t) {
		const e = _e(t);
		if (null !== e && e.r > 0) {
			const n = .6;
			if (t.every((t) => Math.abs(Math.hypot(t.x - e.cx, t.y - e.cy) - e.r) <= n)) return {
				cx: e.cx,
				cy: e.cy,
				rx: e.r,
				ry: e.r,
				angle: 0,
				tol: n
			};
		}
		const n = tn(t);
		if (null !== n && n.rx > 0 && n.ry > 0) {
			const e = .6, o = Math.cos(n.angle), r = Math.sin(n.angle);
			if (t.every((t) => {
				const s = t.x - n.cx, i = t.y - n.cy, a = (s * o + i * r) / n.rx, l = (-s * r + i * o) / n.ry;
				return Math.abs(Math.hypot(a, l) - 1) * Math.min(n.rx, n.ry) <= e;
			})) return {
				cx: n.cx,
				cy: n.cy,
				rx: n.rx,
				ry: n.ry,
				angle: n.angle,
				tol: e
			};
		}
		return null;
	}(o);
	if (null === i) return null;
	const { cx: a, cy: l, tol: c } = i, f = o.map((t) => Math.atan2(t.y - l, t.x - a));
	let h = 0, u = 0;
	for (let m = 1; m < f.length; m++) {
		const t = rn(f[m], f[m - 1]);
		if (Math.abs(t) > 1e-4) {
			const e = Math.sign(t);
			if (0 !== u && e !== u) return null;
			u = e;
		}
		h += t;
	}
	const d = Math.abs(h);
	if (d < .5 || d > 2 * Math.PI - .2) return null;
	const p = nn(n), y = (t) => Number(t.toFixed(p)), g = y(i.rx), w = y(i.ry), M = y(180 * i.angle / Math.PI), x = y(s.x), b = y(s.y);
	if (g <= 0 || w <= 0) return null;
	for (const A of [!1, !0]) for (const e of [!1, !0]) {
		const n = {
			type: "A",
			rx: g,
			ry: w,
			rotation: M,
			largeArc: A,
			sweep: e,
			x,
			y: b
		}, r = m(t.x, t.y, n);
		if (null !== r && !(Math.hypot(r.cx - a, r.cy - l) > c) && sn(t, n, o, c)) return n;
	}
	return null;
}
function ln(t, e) {
	const n = [];
	let o = 0, r = 0, s = 0, i = 0, a = null;
	const l = () => {
		if (null !== a) {
			if (a.cubics.length >= 2) for (const t of function(t, e, n) {
				const o = [];
				let r = t, s = 0;
				for (; s < e.length;) {
					let t = null, i = 0;
					for (let o = 2; s + o <= e.length; o++) {
						const a = an(r, e.slice(s, s + o), n);
						if (null === a) break;
						t = a, i = o;
					}
					if (null !== t) {
						o.push(t);
						const n = e[s + i - 1];
						r = {
							x: n.x,
							y: n.y
						}, s += i;
					} else o.push(e[s]), r = {
						x: e[s].x,
						y: e[s].y
					}, s++;
				}
				return o;
			}(a.start, a.cubics, e)) n.push(t);
			else for (const t of a.cubics) n.push(t);
			a = null;
		}
	};
	for (const c of t) if ("C" !== c.type) switch (l(), n.push(c), c.type) {
		case "M":
			o = c.x, r = c.y, s = c.x, i = c.y;
			break;
		case "L":
		case "Q":
		case "A":
			o = c.x, r = c.y;
			break;
		case "Z": o = s, r = i;
	}
	else null === a && (a = {
		start: {
			x: o,
			y: r
		},
		cubics: []
	}), a.cubics.push(c), o = c.x, r = c.y;
	return l(), n;
}
const cn = [
	1,
	10,
	100,
	1e3,
	1e4
], fn = [
	"",
	"0",
	"00",
	"000",
	"0000"
], hn = 0x38d7ea4c68000;
function un(t) {
	if (t < 10) return 1;
	if (t < 100) return 2;
	if (t < 1e3) return 3;
	if (t < 1e4) return 4;
	if (t < 1e5) return 5;
	if (t < 1e6) return 6;
	if (t < 1e7) return 7;
	let e = 8;
	for (let n = 1e8; t >= n; n *= 10) e++;
	return e;
}
function dn(t, e) {
	const n = t < 0;
	let o = String(Math.abs(t));
	o.length <= e && (o = "0".repeat(e - o.length + 1) + o);
	const r = o.length - e, s = o.slice(0, r);
	let i = o.length;
	for (; i > r && 48 === o.charCodeAt(i - 1);) i--;
	const a = i > r ? `${s}.${o.slice(r, i)}` : s;
	return n && "0" !== a ? `-${a}` : a;
}
function pn(t, e) {
	if (0 === e) return String(0 | t);
	const n = t < 0 ? -t : t;
	if (!(n <= hn && Number.isInteger(n))) return dn(t, e);
	const o = cn[e], r = n % o, s = (n - r) / o;
	if (0 === r) return t < 0 ? `-${s}` : `${s}`;
	let i = r, a = e;
	for (; i % 10 == 0;) i /= 10, a--;
	const l = `${fn[a - un(i)]}${i}`;
	return t < 0 ? `-${s}.${l}` : `${s}.${l}`;
}
function yn(t, e) {
	if (0 === e) {
		const e = 0 | t;
		return un(e < 0 ? -e : e);
	}
	const n = t < 0 ? -t : t;
	if (!(n <= hn && Number.isInteger(n))) {
		const n = dn(t, e);
		return 45 === n.charCodeAt(0) ? n.length - 1 : n.length;
	}
	const o = cn[e], r = n % o, s = (n - r) / o;
	if (0 === r) return un(s);
	let i = r, a = e;
	for (; i % 10 == 0;) i /= 10, a--;
	return un(s) + 1 + a;
}
function gn(t, e, n) {
	const o = t * n, r = Math.round(o);
	return Math.abs(o - r) < .5 - (2e-16 * Math.abs(o) + 1e-9) ? r : Math.round(Number(t.toFixed(e)) * n);
}
function mn(t) {
	return "Z" === t.type ? 0 : t.x;
}
function wn(t) {
	return "Z" === t.type ? 0 : t.y;
}
const Mn = (t) => "L" === t.type, xn = (t) => "C" === t.type, bn = (t) => "L" === t.type || "C" === t.type;
function An(t, e, n) {
	const o = 1 - n, r = o * o * o, s = 3 * o * o * n, i = 3 * o * n * n, a = n * n * n;
	return {
		x: r * t.x + s * e.x1 + i * e.x2 + a * e.x,
		y: r * t.y + s * e.y1 + i * e.y2 + a * e.y
	};
}
function kn(t, e, n, o, r, s, i) {
	const a = Math.abs(t - n) - (r - i), l = Math.abs(e - o) - (s - i), c = Math.max(a, 0), f = Math.max(l, 0);
	return (0 === f ? c : 0 === c ? f : Math.hypot(c, f)) + Math.min(Math.max(a, l), 0) - i;
}
function vn(t, e) {
	let n = t - e;
	for (; n > Math.PI;) n -= 2 * Math.PI;
	for (; n <= -Math.PI;) n += 2 * Math.PI;
	return n;
}
function In(t, e, n, o, r, s) {
	const i = r - n, a = s - o, l = i * i + a * a;
	let c = l > 0 ? ((t - n) * i + (e - o) * a) / l : 0;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (n + c * i), e - (o + c * a));
}
const $n = (t) => (t * (t - 1) >> 1) - 3;
function Sn(t, e) {
	const n = nn(e), o = (t) => Number(t.toFixed(n));
	return "polygon" === t.kind ? {
		kind: "polygon",
		points: t.points.map((t) => ({
			x: o(t.x),
			y: o(t.y)
		}))
	} : "rect" === t.kind ? {
		kind: "rect",
		x: o(t.x),
		y: o(t.y),
		width: o(t.width),
		height: o(t.height)
	} : "rrect" === t.kind ? {
		kind: "rrect",
		x: o(t.x),
		y: o(t.y),
		width: o(t.width),
		height: o(t.height),
		r: o(t.r)
	} : "circle" === t.kind ? {
		kind: "circle",
		cx: o(t.cx),
		cy: o(t.cy),
		r: o(t.r)
	} : {
		kind: "ellipse",
		cx: o(t.cx),
		cy: o(t.cy),
		rx: o(t.rx),
		ry: o(t.ry),
		...void 0 !== t.angle ? { angle: o(t.angle) } : {}
	};
}
function Fn(t, e, n) {
	const o = function(t) {
		if (t.length < 2 || "M" !== t[0].type) return null;
		const e = {
			x: t[0].x,
			y: t[0].y
		}, n = [];
		let o = !1;
		for (let r = 1; r < t.length; r++) {
			const e = t[r];
			if ("M" === e.type) return null;
			if ("Z" === e.type) {
				if (o = !0, r !== t.length - 1) return null;
				break;
			}
			n.push(e);
		}
		return o ? {
			start: e,
			ops: n
		} : null;
	}(t);
	if (!o) return null;
	const r = o.ops;
	if (r.every(Mn)) {
		const t = function(t, e, n) {
			const o = function(t, e, n) {
				const o = [t];
				for (const i of e) o.push({
					x: i.x,
					y: i.y
				});
				const r = o[0], s = o[o.length - 1];
				return o.length > 1 && Math.round(r.x * n) === Math.round(s.x * n) && Math.round(r.y * n) === Math.round(s.y * n) && o.pop(), o;
			}(t, e, n);
			if (4 !== o.length) return null;
			const r = o.map((t) => Math.round(t.x * n)), s = o.map((t) => Math.round(t.y * n)), i = Math.min(...r), a = Math.max(...r), l = Math.min(...s), c = Math.max(...s);
			if (a === i || c === l) return null;
			for (let f = 0; f < 4; f++) {
				if (r[f] !== i && r[f] !== a || s[f] !== l && s[f] !== c) return null;
				const t = (f + 1) % 4;
				if (r[f] !== r[t] && s[f] !== s[t]) return null;
			}
			return 4 !== new Set(r.map((t, e) => `${t},${s[e]}`)).size ? null : {
				kind: "rect",
				x: i / n,
				y: l / n,
				width: (a - i) / n,
				height: (c - l) / n
			};
		}(o.start, r, 10 ** nn(e));
		if (t) return t;
	}
	if (!n) return null;
	if (r.length >= 3 && r.every(xn)) {
		const t = function(t, e, n) {
			const o = [t];
			let r = t;
			for (const a of e) o.push(An(r, a, .25), An(r, a, .5), An(r, a, .75)), o.push({
				x: a.x,
				y: a.y
			}), r = {
				x: a.x,
				y: a.y
			};
			const s = _e(o);
			if (s && s.r > 0) {
				const t = .6;
				if (o.every((e) => Math.abs(Math.hypot(e.x - s.cx, e.y - s.cy) - s.r) <= t)) return Sn({
					kind: "circle",
					cx: s.cx,
					cy: s.cy,
					r: s.r
				}, n);
			}
			const i = tn(o);
			if (i && i.rx > 0 && i.ry > 0) {
				const t = .6, e = Math.cos(i.angle), r = Math.sin(i.angle);
				if (o.every((n) => {
					const o = n.x - i.cx, s = n.y - i.cy, a = (o * e + s * r) / i.rx, l = (-o * r + s * e) / i.ry;
					return Math.abs(Math.hypot(a, l) - 1) * Math.min(i.rx, i.ry) <= t;
				})) {
					const t = 180 * i.angle / Math.PI, e = Math.abs(t) < .5 ? void 0 : t;
					return Sn({
						kind: "ellipse",
						cx: i.cx,
						cy: i.cy,
						rx: i.rx,
						ry: i.ry,
						...void 0 !== e ? { angle: e } : {}
					}, n);
				}
			}
			return null;
		}(o.start, r, e);
		if (t) return t;
	}
	if (r.length >= 4 && r.some(xn) && r.every(bn)) {
		const t = function(t, e, n) {
			const o = 1 + 2 * e.length, r = new Float64Array(o), s = new Float64Array(o);
			r[0] = t.x, s[0] = t.y;
			let i = t.x, a = t.y, l = 1;
			for (const v of e) "C" === v.type ? (r[l] = .125 * i + .375 * v.x1 + .375 * v.x2 + .125 * v.x, s[l] = .125 * a + .375 * v.y1 + .375 * v.y2 + .125 * v.y) : (r[l] = (i + v.x) / 2, s[l] = (a + v.y) / 2), r[l + 1] = v.x, s[l + 1] = v.y, l += 2, i = v.x, a = v.y;
			let c = 1 / 0, f = -1 / 0, h = 1 / 0, u = -1 / 0;
			for (let v = 0; v < o; v++) c = Math.min(c, r[v]), f = Math.max(f, r[v]), h = Math.min(h, s[v]), u = Math.max(u, s[v]);
			const d = (c + f) / 2, p = (h + u) / 2, y = (f - c) / 2, g = (u - h) / 2;
			if (y <= 0 || g <= 0) return null;
			const m = Math.min(y, g), w = Math.max(.75, .03 * m), M = .3 * m + w;
			for (let v = 0; v < o; v++) if (Math.min(y - Math.abs(r[v] - d), g - Math.abs(s[v] - p)) > M) return null;
			const x = (t, e) => {
				let n = 0;
				for (let i = 0; i < o; i++) {
					const o = Math.abs(kn(r[i], s[i], d, p, y, g, t));
					if (o > n && (n = o, n >= e)) return n;
				}
				return n;
			}, b = m / 64;
			let A = b, k = 1 / 0;
			for (let v = 1; v <= 64; v++) {
				const t = x(b * v, k);
				t < k && (k = t, A = b * v);
			}
			return k - b > w ? null : (A = function(t, e, n) {
				const o = (Math.sqrt(5) - 1) / 2;
				let r = n - o * (n - e), s = e + o * (n - e), i = t(r), a = t(s);
				for (let l = 0; l < 40; l++) i < a ? (n = s, s = r, a = i, r = n - o * (n - e), i = t(r)) : (e = r, r = s, i = a, s = e + o * (n - e), a = t(s));
				return (e + n) / 2;
			}((t) => x(t, 1 / 0), Math.max(0, A - b), Math.min(m, A + b)), k = x(A, 1 / 0), k > w || A < w ? null : Sn({
				kind: "rrect",
				x: d - y,
				y: p - g,
				width: 2 * y,
				height: 2 * g,
				r: A
			}, n));
		}(o.start, r, e);
		if (t) return t;
	}
	return r.length < 3 ? null : function(t, e, n) {
		const o = [], r = [];
		(function(t, e, n, o) {
			let r = t.x, s = t.y;
			for (const i of e) if ("C" === i.type) {
				for (let t = 0; t < 8; t++) {
					const e = t / 8, a = 1 - e, l = a * a * a, c = 3 * a * a * e, f = 3 * a * e * e, h = e * e * e;
					n.push(l * r + c * i.x1 + f * i.x2 + h * i.x), o.push(l * s + c * i.y1 + f * i.y2 + h * i.y);
				}
				r = i.x, s = i.y;
			} else if ("Q" === i.type) {
				for (let t = 0; t < 8; t++) {
					const e = t / 8, a = 1 - e;
					n.push(a * a * r + 2 * a * e * i.x1 + e * e * i.x), o.push(a * a * s + 2 * a * e * i.y1 + e * e * i.y);
				}
				r = i.x, s = i.y;
			} else if ("L" === i.type) {
				const t = Math.max(1, Math.round(Math.hypot(i.x - r, i.y - s) / 2));
				for (let e = 0; e < t; e++) n.push(r + (i.x - r) * e / t), o.push(s + (i.y - s) * e / t);
				r = i.x, s = i.y;
			}
			if (Math.hypot(r - t.x, s - t.y) > 1e-6) {
				const e = Math.max(1, Math.round(Math.hypot(t.x - r, t.y - s) / 2));
				for (let i = 0; i < e; i++) n.push(r + (t.x - r) * i / e), o.push(s + (t.y - s) * i / e);
			}
		})(t, e, o, r);
		const s = o.length;
		if (s < 24) return null;
		let i = 0, a = 0;
		for (let z = 0; z < s; z++) i += o[z], a += r[z];
		const l = i / s, c = a / s, f = new Float64Array(s), h = new Float64Array(s);
		let u = -1 / 0, d = 1 / 0, p = -1 / 0, y = 1 / 0, g = -1 / 0;
		for (let z = 0; z < s; z++) f[z] = Math.hypot(o[z] - l, r[z] - c), h[z] = Math.atan2(r[z] - c, o[z] - l), u = Math.max(u, f[z]), d = Math.min(d, o[z]), p = Math.max(p, o[z]), y = Math.min(y, r[z]), g = Math.max(g, r[z]);
		if (u < 3) return null;
		const m = Math.min(4, Math.max(.8, .045 * u)), w = (t, e, n) => {
			let o = 1 / 0, r = -1 / 0, s = 1 / 0, i = -1 / 0;
			for (let l = 0; l < n; l++) t[l] < o && (o = t[l]), t[l] > r && (r = t[l]), e[l] < s && (s = e[l]), e[l] > i && (i = e[l]);
			const a = 2 * m;
			return Math.abs(o - d) <= a && Math.abs(r - p) <= a && Math.abs(s - y) <= a && Math.abs(i - g) <= a;
		}, M = (t, e, n, i, a) => {
			let l = 0;
			for (let c = 0; c < s; c++) {
				const s = h[c];
				let f = !1;
				for (let t = 0; t < i; t++) if (Math.abs(vn(s, n[t])) < a) {
					f = !0;
					break;
				}
				if (f) continue;
				let u = 1 / 0;
				for (let n = 0; n < i && u > m; n++) {
					const s = (n + 1) % i, a = In(o[c], r[c], t[n], e[n], t[s], e[s]);
					a < u && (u = a);
				}
				if (u > m) return !1;
				l++;
			}
			return l >= i;
		};
		let x = 0;
		for (let z = 1; z < s; z++) f[z] > f[x] && (x = z);
		const b = h[x], A = /* @__PURE__ */ new Float64Array(75), k = /* @__PURE__ */ new Float64Array(75), v = /* @__PURE__ */ new Uint8Array(75), I = /* @__PURE__ */ new Uint8Array(75), $ = /* @__PURE__ */ new Uint8Array(13), S = (t) => {
			if (1 === $[t]) return;
			$[t] = 1;
			const e = $n(t), n = 2 * Math.PI / t, o = n / 5;
			for (let r = 0; r < t; r++) A[e + r] = -1 / 0, k[e + r] = 1 / 0;
			for (let r = 0; r < s; r++) {
				const s = h[r], i = (s - b) / n, a = Math.floor(i), l = i - a;
				if (l < .200000001 || l > .799999999) {
					let i = (0 | (l < .5 ? a : a + 1)) % t;
					i < 0 && (i += t), Math.abs(vn(s, b + i * n)) <= o && (v[e + i] = 1, f[r] > A[e + i] && (A[e + i] = f[r]));
				} else if (l > .29999999899999996 && l < .700000001) {
					let i = (0 | a) % t;
					i < 0 && (i += t), Math.abs(vn(s, b + (i + .5) * n)) <= o && (I[e + i] = 1, f[r] < k[e + i] && (k[e + i] = f[r]));
				}
			}
		}, F = (t) => {
			const e = $n(t);
			for (let n = 0; n < t; n++) if (0 === v[e + n] || 0 === I[e + n]) return !1;
			return !0;
		}, C = /* @__PURE__ */ new Float64Array(24), L = /* @__PURE__ */ new Float64Array(24), P = /* @__PURE__ */ new Float64Array(24), R = (t) => {
			const e = [];
			for (let n = 0; n < t; n++) e.push({
				x: C[n],
				y: L[n]
			});
			return e;
		};
		for (let z = 3; z <= 12; z++) {
			if (S(z), !F(z)) continue;
			const t = $n(z), e = 2 * Math.PI / z;
			let o = 0;
			for (let n = 0; n < z; n++) o += k[t + n];
			const r = o / z / Math.cos(Math.PI / z);
			for (let n = 0; n < z; n++) {
				const t = b + n * e;
				P[n] = t, C[n] = l + r * Math.cos(t), L[n] = c + r * Math.sin(t);
			}
			if (4 === z) {
				const t = Math.atan2(Math.abs(L[1] - L[0]), Math.abs(C[1] - C[0]));
				if (t < Math.PI / 12 || t > Math.PI / 2 - Math.PI / 12) continue;
			}
			if (w(C, L, z) && M(C, L, P, z, .18 * e)) return Sn({
				kind: "polygon",
				points: R(z)
			}, n);
		}
		for (let z = 3; z <= 12; z++) {
			if (S(z), !F(z)) continue;
			const t = $n(z), e = 2 * Math.PI / z;
			let o = 0, r = 0;
			for (let n = 0; n < z; n++) o += A[t + n], r += k[t + n];
			const s = o / z, i = r / z;
			if (!(i >= s * Math.cos(Math.PI / z) - m)) {
				for (let t = 0; t < 2 * z; t++) {
					const n = b + t * e / 2;
					P[t] = n;
					const o = t % 2 == 0 ? s : i;
					C[t] = l + o * Math.cos(n), L[t] = c + o * Math.sin(n);
				}
				if (w(C, L, 2 * z) && M(C, L, P, 2 * z, .09 * e)) return Sn({
					kind: "polygon",
					points: R(2 * z)
				}, n);
			}
		}
		return null;
	}(o.start, r, e);
}
const Cn = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function Ln(t) {
	return t.replace(/[&<>"']/g, (t) => Cn[t]);
}
function Pn(t, e) {
	if (t.includes("<") || t.includes("\"")) throw new Error(`unsafe ${e} in SVG output: ${JSON.stringify(t)}`);
	return t;
}
function Rn(t, e, n) {
	let o = "";
	return o += ` fill="${void 0 === t.fill ? "none" : Pn(t.fill, "fill")}"`, n && void 0 !== t.fillRule && (o += ` fill-rule="${t.fillRule}"`), void 0 !== t.stroke && (o += ` stroke="${Pn(t.stroke, "stroke")}"`), void 0 !== t.strokeWidth && (o += ` stroke-width="${en(t.strokeWidth, e)}"`), void 0 !== t.strokeLinecap && (o += ` stroke-linecap="${t.strokeLinecap}"`), void 0 !== t.strokeLinejoin && (o += ` stroke-linejoin="${t.strokeLinejoin}"`), void 0 !== t.id && "" !== t.id && (o += ` id="${Ln(t.id)}"`), o;
}
function zn(t, e, n) {
	const o = Rn(e, n, !1), r = (t) => en(t, n);
	switch (t.kind) {
		case "rect": return `<rect x="${r(t.x)}" y="${r(t.y)}" width="${r(t.width)}" height="${r(t.height)}"${o}/>`;
		case "rrect": return `<rect x="${r(t.x)}" y="${r(t.y)}" width="${r(t.width)}" height="${r(t.height)}" rx="${r(t.r)}"${o}/>`;
		case "circle": return `<circle cx="${r(t.cx)}" cy="${r(t.cy)}" r="${r(t.r)}"${o}/>`;
		case "ellipse": {
			const e = void 0 !== t.angle && Math.abs(t.angle) > .05 ? ` transform="rotate(${r(t.angle)} ${r(t.cx)} ${r(t.cy)})"` : "";
			return `<ellipse cx="${r(t.cx)}" cy="${r(t.cy)}" rx="${r(t.rx)}" ry="${r(t.ry)}"${e}${o}/>`;
		}
		case "polygon": return `<polygon points="${t.points.map((t) => `${r(t.x)},${r(t.y)}`).join(" ")}"${o}/>`;
	}
}
function Un(t, e, n, o) {
	if (0 === t.commands.length) return null;
	if (void 0 === t.fill && void 0 === t.stroke) return null;
	if (n) {
		const n = function(t, e) {
			const n = 10 ** nn(e);
			return function(t) {
				const e = [];
				let n = null;
				for (const o of t) "M" === o.type ? (n && e.push(n), n = {
					start: {
						x: o.x,
						y: o.y
					},
					ops: [],
					closed: !1
				}) : "Z" === o.type ? n && (n.closed = !0) : n && n.ops.push(o);
				return n && e.push(n), e;
			}(t).flatMap((t) => function(t) {
				const e = [{
					type: "M",
					x: t.start.x,
					y: t.start.y
				}];
				for (const n of t.ops) e.push(n);
				return t.closed && e.push({ type: "Z" }), e;
			}(function(t, e) {
				const n = (t) => Math.round(t * e), o = [{
					x: t.start.x,
					y: t.start.y,
					edge: "M",
					op: null
				}];
				for (const i of t.ops) o.push({
					x: mn(i),
					y: wn(i),
					edge: i.type,
					op: i
				});
				const r = o.slice(0, 1);
				for (let i = 1; i < o.length; i++) {
					let t = o[i];
					for (; r.length >= 2 && "L" === r[r.length - 1].edge && "L" === t.edge;) {
						const e = r[r.length - 2], o = r[r.length - 1], s = n(e.x), i = n(e.y), a = n(o.x), l = n(o.y), c = n(t.x), f = n(t.y), h = (a - s) * (c - s) + (l - i) * (f - i);
						if (!(0 === (a - s) * (f - i) - (l - i) * (c - s) && h >= 0 && h <= (c - s) * (c - s) + (f - i) * (f - i))) break;
						r.pop(), t = {
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
					r.push(t);
				}
				const s = [];
				for (let i = 1; i < r.length; i++) s.push(r[i].op);
				return {
					start: t.start,
					ops: s,
					closed: t.closed
				};
			}(t, n)));
		}(t.commands, e), r = Fn(n, e, o);
		if (null !== r) return {
			kind: "element",
			svg: zn(r, t, e)
		};
		const s = Pn(function(t, e) {
			const n = nn(e), o = cn[n];
			let r = 0, s = 0, i = 0, a = 0, l = !1, c = "";
			const f = /* @__PURE__ */ new Float64Array(6), h = /* @__PURE__ */ new Float64Array(6), u = (t, e, o, r) => {
				c += "" === c ? t : ` ${t}`;
				for (let s = o; s < o + r; s++) {
					const t = pn(e[s], n);
					45 !== t.charCodeAt(0) && (c += " "), c += t;
				}
			}, d = (t, e, o, r) => {
				u(t, f, 0, 3), c += ` ${o} ${r}`;
				for (let s = 3; s < 5; s++) {
					const t = pn(e[s], n);
					45 !== t.charCodeAt(0) && (c += " "), c += t;
				}
			};
			for (const p of t) switch (p.type) {
				case "M": {
					const t = gn(p.x, n, o), e = gn(p.y, n, o);
					if (f[0] = t, f[1] = e, l) {
						h[0] = t - r, h[1] = e - s;
						const o = yn(t, n) + yn(e, n);
						yn(h[0], n) + yn(h[1], n) < o ? u("m", h, 0, 2) : u("M", f, 0, 2);
					} else u("M", f, 0, 2), l = !0;
					r = t, s = e, i = t, a = e;
					break;
				}
				case "L": {
					const t = gn(p.x, n, o), e = gn(p.y, n, o);
					f[0] = t, f[1] = e, h[0] = t - r, h[1] = e - s;
					let i = "L", a = f, l = 0, c = 2, d = yn(t, n) + yn(e, n) + 2;
					const y = yn(h[0], n) + yn(h[1], n) + 2;
					if (y < d && (d = y, i = "l", a = h), e === s) {
						const e = yn(t, n) + 1;
						e < d && (d = e, i = "H", a = f, l = 0, c = 1);
						const o = yn(h[0], n) + 1;
						o < d && (d = o, i = "h", a = h, l = 0, c = 1);
					}
					if (t === r) {
						const t = yn(e, n) + 1;
						t < d && (d = t, i = "V", a = f, l = 1, c = 1);
						const o = yn(h[1], n) + 1;
						o < d && (d = o, i = "v", a = h, l = 1, c = 1);
					}
					u(i, a, l, c), r = t, s = e;
					break;
				}
				case "Q": {
					f[0] = gn(p.x1, n, o), f[1] = gn(p.y1, n, o), f[2] = gn(p.x, n, o), f[3] = gn(p.y, n, o), h[0] = f[0] - r, h[1] = f[1] - s, h[2] = f[2] - r, h[3] = f[3] - s;
					let t = 0, e = 0;
					for (let o = 0; o < 4; o++) t += yn(f[o], n), e += yn(h[o], n);
					e < t ? u("q", h, 0, 4) : u("Q", f, 0, 4), r = f[2], s = f[3];
					break;
				}
				case "C": {
					f[0] = gn(p.x1, n, o), f[1] = gn(p.y1, n, o), f[2] = gn(p.x2, n, o), f[3] = gn(p.y2, n, o), f[4] = gn(p.x, n, o), f[5] = gn(p.y, n, o);
					for (let n = 0; n < 6; n += 2) h[n] = f[n] - r, h[n + 1] = f[n + 1] - s;
					let t = 0, e = 0;
					for (let o = 0; o < 6; o++) t += yn(f[o], n), e += yn(h[o], n);
					e < t ? u("c", h, 0, 6) : u("C", f, 0, 6), r = f[4], s = f[5];
					break;
				}
				case "A": {
					f[0] = gn(p.rx, n, o), f[1] = gn(p.ry, n, o), f[2] = gn(p.rotation, n, o), f[3] = gn(p.x, n, o), f[4] = gn(p.y, n, o), h[3] = f[3] - r, h[4] = f[4] - s;
					const t = yn(f[3], n) + yn(f[4], n);
					yn(h[3], n) + yn(h[4], n) < t ? d("a", h, p.largeArc ? 1 : 0, p.sweep ? 1 : 0) : d("A", f, p.largeArc ? 1 : 0, p.sweep ? 1 : 0), r = f[3], s = f[4];
					break;
				}
				case "Z": c += "" === c ? "Z" : " Z", r = i, s = a;
			}
			return c;
		}(o ? ln(n, e) : n, e), "path data");
		return "" === s ? null : {
			kind: "path",
			d: s,
			paint: Rn(t, e, !0)
		};
	}
	const r = Pn(function(t, e) {
		const n = nn(e);
		let o = "";
		const r = (t) => {
			"" !== o && 45 !== t.charCodeAt(0) && (o += " "), o += t;
		}, s = (t) => {
			r(en(t, n));
		};
		for (const i of t) switch (i.type) {
			case "M":
			case "L":
				r(i.type), s(i.x), s(i.y);
				break;
			case "Q":
				r("Q"), s(i.x1), s(i.y1), s(i.x), s(i.y);
				break;
			case "C":
				r("C"), s(i.x1), s(i.y1), s(i.x2), s(i.y2), s(i.x), s(i.y);
				break;
			case "A":
				r("A"), s(i.rx), s(i.ry), s(i.rotation), r(i.largeArc ? "1" : "0"), r(i.sweep ? "1" : "0"), s(i.x), s(i.y);
				break;
			case "Z": r("Z");
		}
		return o;
	}(t.commands, e), "path data");
	return "" === r ? null : {
		kind: "element",
		svg: `<path d="${r}"${Rn(t, e, !0)}/>`
	};
}
function Tn(t, e, n, o, r, s) {
	const i = [];
	let a = null;
	const l = () => {
		null !== a && (i.push(`<path d="${a.d}"${a.paint}/>`), a = null);
	};
	for (const c of e) {
		const e = void 0 !== s && c < s.length ? s[c] : Un(t[c], n, o, r);
		null !== e && ("element" === e.kind ? (l(), i.push(e.svg)) : !0 === t[c].unfoldable ? (l(), i.push(`<path d="${e.d}"${e.paint}/>`)) : null !== a && a.paint === e.paint ? a.d += ` ${e.d}` : (l(), a = {
			d: e.d,
			paint: e.paint
		}));
	}
	return l(), i;
}
function qn(t) {
	return void 0 !== t.fill && "none" !== t.fill ? t.fill : t.stroke ?? "";
}
function Hn(t, e, n) {
	if (!t) return null;
	const o = t.width === e && t.height === n ? t : F(t, e, n), r = new Uint8Array(e * n);
	for (let s = 0; s < r.length; s++) r[s] = o.data[s] > .5 ? 1 : 0;
	return {
		width: e,
		height: n,
		data: r
	};
}
const Bn = {
	preprocess: .12,
	palette: .2,
	segment: .08,
	trace: .48,
	fit: 0,
	svg: .12
}, jn = [
	"preprocess",
	"palette",
	"segment",
	"trace",
	"svg"
];
var Kn = class {
	ctx;
	timings = [];
	stageStart = 0;
	currentStage = null;
	stepIndex = 0;
	lastMark = 0;
	constructor(t) {
		this.ctx = t;
	}
	get tracing() {
		return void 0 !== this.ctx?.onTrace;
	}
	stage(t) {
		this.closeStage(), this.currentStage = t, this.stageStart = k(), this.lastMark = this.stageStart, this.progress(0);
	}
	emitStep(t) {
		const e = this.ctx?.onTrace;
		if (!e || !this.currentStage) return;
		const n = this.lastMark, o = k();
		this.lastMark = o;
		const r = t();
		e({
			index: this.stepIndex++,
			stage: this.currentStage,
			startMs: n,
			endMs: o,
			code: r.code,
			label: r.label,
			notes: r.notes,
			metrics: r.metrics,
			rasters: r.rasters,
			charts: r.charts
		});
	}
	progress(t) {
		if (!this.currentStage || !this.ctx?.onProgress) return;
		let e = 0;
		for (const n of jn) {
			if (n === this.currentStage) break;
			e += Bn[n];
		}
		e += Bn[this.currentStage] * Math.min(1, Math.max(0, t)), this.ctx.onProgress(this.currentStage, Math.min(1, e));
	}
	checkCancel() {
		if (this.ctx?.shouldCancel?.()) throw new h();
	}
	async tick() {
		this.checkCancel(), await new Promise((t) => setTimeout(t, 0)), this.checkCancel();
	}
	finish() {
		return this.closeStage(), this.timings;
	}
	closeStage() {
		this.currentStage && (this.timings.push({
			stage: this.currentStage,
			ms: k() - this.stageStart
		}), this.currentStage = null);
	}
};
function On(t) {
	return t.stats ??= {
		preHits: 0,
		preMisses: 0,
		palHits: 0,
		palMisses: 0,
		stackHits: 0,
		stackMisses: 0,
		ringHits: 0,
		ringMisses: 0,
		polyHits: 0,
		polyMisses: 0,
		inkHits: 0,
		inkMisses: 0
	};
}
function Dn(t, e, n) {
	const o = t.palette ??= /* @__PURE__ */ new Map();
	for (o.delete(e), o.set(e, n); o.size > 4;) {
		const t = o.keys().next().value;
		if (void 0 === t) break;
		o.delete(t);
	}
}
function Nn(t, e, n, o, r) {
	const s = e.map((t) => ({
		id: t.id,
		kind: t.kind,
		stops: t.stops.map((t) => void 0 === t.opacity ? {
			offset: t.offset,
			color: t.color
		} : {
			offset: t.offset,
			color: t.color,
			opacity: t.opacity
		})
	})), i = t.map((t) => ({
		commands: t.commands,
		fill: t.fill,
		fillRule: t.fillRule,
		stroke: t.stroke,
		strokeWidth: t.strokeWidth,
		layerId: t.layerId
	}));
	return {
		width: n,
		height: o,
		unit: r.unit,
		widthMm: "mm" === r.unit ? r.widthMm : void 0,
		shapes: i,
		gradients: s.length > 0 ? s : void 0
	};
}
let Zn = 0;
async function En(t, e, o, r) {
	const s = function(t = {}, e = v) {
		const n = {
			...e,
			...t
		};
		if (n.maxDimension = 0 === n.maxDimension ? 0 : b(n.maxDimension, 64, 8192), n.blurRadius = x(n.blurRadius, 0, 10), n.alphaThreshold = b(n.alphaThreshold, 0, 255), n.paletteSize = b(n.paletteSize, 2, 64), n.quantizeQuality = b(n.quantizeQuality, 1, 10), null !== n.palette) {
			const t = /* @__PURE__ */ new Set(), e = [];
			for (const o of n.palette) {
				if (/^#[0-9a-f]{6}$/i.test(o)) {
					const n = o.toLowerCase();
					t.has(n) || (t.add(n), e.push(n));
				}
				if (e.length >= 64) break;
			}
			n.palette = e.length > 0 ? e : null;
		}
		return n.segmentation = "regions" === n.segmentation ? "regions" : "quantize", n.minRegionArea = b(n.minRegionArea, 0, 4096), n.dissolveBands = b(n.dissolveBands, 0, 4), n.colorCoherence = x(n.colorCoherence, 0, 1), n.gradientStrength = x(n.gradientStrength, 0, 1), n.gradientMinArea = b(n.gradientMinArea, 0, 1e6), n.gradientMaxDimension = 0 === n.gradientMaxDimension ? 0 : b(n.gradientMaxDimension, 128, 4096), n.gapFill = x(n.gapFill, 0, 5), n.threshold = b(n.threshold, 0, 255), n.adaptiveRadius = b(n.adaptiveRadius, 2, 128), n.adaptiveBias = x(n.adaptiveBias, -64, 64), n.smoothing = x(n.smoothing, 0, 1), n.optTolerance = x(n.optTolerance, 0, 5), n.cornerThreshold = x(n.cornerThreshold, 0, 180), n.fitTolerance = x(n.fitTolerance, .1, 10), n.simplifyTolerance = x(n.simplifyTolerance, 0, 10), n.strokeWidth = x(n.strokeWidth, 0, 64), n.pruneLength = x(n.pruneLength, 0, 256), n.precision = b(n.precision, 0, 4), n.widthMm = x(n.widthMm, 0, 1e4), n;
	}(e), i = k(), l = new Kn(o), f = [], h = r?.cache, u = r?.imageId, p = void 0 !== h && void 0 !== u, g = void 0 !== r?.helpers && r.helpers.size > 0 ? r.helpers : void 0, m = ++Zn;
	l.stage("preprocess");
	const I = [
		($ = s).maxDimension,
		$.denoise,
		$.blurRadius,
		$.background,
		$.backgroundColor,
		$.alphaThreshold,
		"grayscale" === $.mode ? "g" : "c"
	].join("|");
	var $;
	let z, U, T;
	if (p && h.imageId === u && h.preKey === I && h.workImage) z = h.workImage, U = h.opaque ?? null, T = h.alpha ?? null, On(h).preHits++, l.progress(1);
	else {
		let e = S(t, s.maxDimension);
		l.progress(.3), "median" === s.denoise ? e = function(t) {
			const { width: e, height: n, data: o } = t, r = Math.max(1, Math.round(1)), i = 9, a = new Int32Array(i), l = new Int32Array(i), c = new Int32Array(i), f = new Uint8ClampedArray(e * n * 4);
			for (let h = 0; h < n; h++) {
				const t = h - r < 0 ? 0 : h - r, s = h + r >= n ? n - 1 : h + r;
				for (let n = 0; n < e; n++) {
					const i = n - r < 0 ? 0 : n - r, u = n + r >= e ? e - 1 : n + r;
					let d = 0;
					for (let n = t; n <= s; n++) {
						const t = n * e;
						for (let e = i; e <= u; e++) {
							const n = 4 * (t + e);
							a[d] = o[n], l[d] = o[n + 1], c[d] = o[n + 2], d++;
						}
					}
					C(a, d), C(l, d), C(c, d);
					const p = d >> 1, y = 4 * (h * e + n);
					f[y] = a[p], f[y + 1] = l[p], f[y + 2] = c[p], f[y + 3] = o[y + 3];
				}
			}
			return {
				width: e,
				height: n,
				data: f
			};
		}(e) : "bilateral" === s.denoise && (e = function(t) {
			const { width: e, height: n, data: o } = t;
			const r = Math.max(1, Math.round(2)), s = 5, i = /* @__PURE__ */ new Float64Array(25);
			for (let c = -2; c <= r; c++) for (let t = -2; t <= r; t++) i[(c + r) * s + (t + r)] = Math.exp(-(t * t + c * c) / 8);
			const a = /* @__PURE__ */ new Float64Array(256);
			for (let c = 0; c < 256; c++) a[c] = Math.exp(-c * c / 2450);
			const l = new Uint8ClampedArray(e * n * 4);
			for (let c = 0; c < n; c++) for (let t = 0; t < e; t++) {
				const f = 4 * (c * e + t), h = o[f], u = o[f + 1], d = o[f + 2];
				let p = 0, y = 0, g = 0, m = 0;
				for (let l = -2; l <= r; l++) {
					const f = c + l;
					if (f < 0 || f >= n) continue;
					const w = f * e, M = (l + r) * s;
					for (let n = -2; n <= r; n++) {
						const s = t + n;
						if (s < 0 || s >= e) continue;
						const l = 4 * (w + s), c = o[l], f = o[l + 1], x = o[l + 2], b = c - h, A = f - u, k = x - d;
						let v = Math.round(Math.sqrt(b * b + A * A + k * k));
						v > 255 && (v = 255);
						const I = i[M + (n + r)] * a[v];
						p += I, y += c * I, g += f * I, m += x * I;
					}
				}
				l[f] = Math.round(y / p), l[f + 1] = Math.round(g / p), l[f + 2] = Math.round(m / p), l[f + 3] = o[f + 3];
			}
			return {
				width: e,
				height: n,
				data: l
			};
		}(e)), s.blurRadius > 0 && (e = function(t, e) {
			const { width: n, height: o, data: r } = t;
			if (e <= 0) return M(t);
			const s = e / 2, i = Math.ceil(3 * s), a = new Float64Array(2 * i + 1);
			let l = 0;
			for (let h = -i; h <= i; h++) {
				const t = Math.exp(-h * h / (2 * s * s));
				a[h + i] = t, l += t;
			}
			for (let h = 0; h < a.length; h++) a[h] /= l;
			const c = new Float32Array(n * o * 4);
			for (let h = 0; h < o; h++) {
				const t = h * n;
				for (let e = 0; e < n; e++) {
					let o = 0, s = 0, l = 0, f = 0;
					for (let c = -i; c <= i; c++) {
						let h = e + c;
						h < 0 ? h = 0 : h >= n && (h = n - 1);
						const u = a[c + i], d = 4 * (t + h);
						o += r[d] * u, s += r[d + 1] * u, l += r[d + 2] * u, f += r[d + 3] * u;
					}
					const h = 4 * (t + e);
					c[h] = o, c[h + 1] = s, c[h + 2] = l, c[h + 3] = f;
				}
			}
			const f = new Uint8ClampedArray(n * o * 4);
			for (let h = 0; h < o; h++) for (let t = 0; t < n; t++) {
				let e = 0, r = 0, s = 0, l = 0;
				for (let f = -i; f <= i; f++) {
					let u = h + f;
					u < 0 ? u = 0 : u >= o && (u = o - 1);
					const d = a[f + i], p = 4 * (u * n + t);
					e += c[p] * d, r += c[p + 1] * d, s += c[p + 2] * d, l += c[p + 3] * d;
				}
				const u = 4 * (h * n + t);
				f[u] = Math.round(e), f[u + 1] = Math.round(r), f[u + 2] = Math.round(s), f[u + 3] = Math.round(l);
			}
			return {
				width: n,
				height: o,
				data: f
			};
		}(e, s.blurRadius)), l.progress(.7);
		const o = function(t, e) {
			const { width: n, height: o, data: r } = t, s = n * o;
			let i;
			if ("custom" === e.background) i = "custom";
			else if ("transparent" === e.background) i = "transparent";
			else {
				i = "opaque";
				for (let t = 3; t < r.length; t += 4) if (r[t] < 250) {
					i = "transparent";
					break;
				}
			}
			if ("custom" === i) {
				const n = a(e.backgroundColor) ?? [
					255,
					255,
					255
				];
				return {
					image: L(t, n[0], n[1], n[2]),
					opaque: null,
					alpha: null
				};
			}
			const l = L(t, 255, 255, 255);
			if ("opaque" === i) return {
				image: l,
				opaque: null,
				alpha: null
			};
			const c = w(n, o), f = new Uint8Array(s), h = e.alphaThreshold;
			for (let a = 0, u = 3; a < s; a++, u += 4) f[a] = r[u], c.data[a] = r[u] >= h ? 1 : 0;
			return {
				image: l,
				opaque: c,
				alpha: f
			};
		}(e, s);
		e = o.image, U = o.opaque, T = o.alpha, "grayscale" === s.mode && function(t) {
			const { data: e } = t;
			for (let o = 0; o < e.length; o += 4) {
				const t = n(e[o] / 255, e[o + 1] / 255, e[o + 2] / 255)[0], r = Math.round(255 * t);
				e[o] = r, e[o + 1] = r, e[o + 2] = r;
			}
		}(e), z = e, p && (On(h).preMisses++, h.imageId = u, h.preKey = I, h.workImage = z, h.opaque = U, h.alpha = T, h.palette = /* @__PURE__ */ new Map(), h.ink = void 0);
	}
	const { width: q, height: H } = z;
	await l.tick(), l.tracing && l.emitStep(() => {
		const e = [];
		return q === t.width && H === t.height || e.push(`Resized ${t.width}×${t.height} → ${q}×${H}.`), "none" !== s.denoise && e.push(`Denoise: ${s.denoise}.`), s.blurRadius > 0 && e.push(`Blur radius ${s.blurRadius}.`), "grayscale" === s.mode && e.push("Desaturated for grayscale tracing."), {
			code: "preprocess",
			label: "Preprocess",
			rasters: [qt(t, "Source"), qt(z, "grayscale" === s.mode ? "Working (gray)" : "Working")],
			charts: [jt(z)],
			metrics: {
				sourceWidth: t.width,
				sourceHeight: t.height,
				workWidth: q,
				workHeight: H,
				scalePercent: Math.round(q / t.width * 100)
			},
			notes: e.length > 0 ? e : void 0
		};
	});
	const B = [], j = [];
	let K = [];
	const O = [], D = s.optimizeSvg && "cutout" !== s.layering, N = {
		precision: s.precision,
		optimize: s.optimizeSvg,
		roundPrimitives: D
	}, Z = p ? `${u}|${I}` : `#${m}`;
	"color" === s.mode || "grayscale" === s.mode ? await async function(t, e, o, r, s, i, l, f, h, u, d, p, y, g) {
		t.stage("palette");
		const m = void 0 !== p && void 0 !== y && void 0 === d, w = m ? function(t) {
			return [
				t.segmentation,
				t.paletteSize,
				t.autoPaletteSize,
				t.colorSpace,
				t.quantizeQuality,
				t.palette ? t.palette.join(",") : "-",
				t.minRegionArea,
				t.preserveDetails,
				t.dissolveBands,
				t.colorCoherence,
				t.omitBackground,
				t.gradients ? "g" : "-",
				t.gradients ? t.gradientStrength : 0,
				t.gradients ? t.gradientMinArea : 0,
				t.gradients ? t.gradientMaxDimension : 0,
				"pixel" === t.curveMode ? "px" : "-"
			].join("|");
		}(s) : void 0, M = Hn(d, e.width, e.height);
		let x, k, v, I, $, S, F;
		const C = m && p && p.imageId === y && void 0 !== w ? function(t, e) {
			const n = t.palette;
			if (!n) return;
			const o = n.get(e);
			return o && (n.delete(e), n.set(e, o)), o;
		}(p, w) : void 0;
		let L = C;
		if (C) x = C.labels, k = C.paletteHex, v = C.paletteRgb, I = C.counts, $ = C.paletteClampedTo, S = C.gradients, F = C.underlays, On(p).palHits++, await t.tick(), t.stage("segment"), await t.tick();
		else if ("regions" === s.segmentation && null === s.palette) {
			m && On(p).palMisses++;
			const n = St(e, {
				mergeThreshold: .1,
				mergeSizeBias: .8,
				minRegionArea: s.minRegionArea,
				maxRegions: s.autoPaletteSize ? 0 : s.paletteSize,
				mask: o
			});
			await t.tick(), t.stage("segment"), await t.tick(), x = n.labels, k = n.paletteHex, v = n.paletteRgb, I = n.counts;
			const i = s.omitBackground ? oo(e, k) : -1;
			if (i >= 0) {
				const t = Pt(x, i);
				I[i] = Math.max(0, I[i] - t);
			}
			const a = _n(e, x, k, v, r, s);
			a && ({labels: x, paletteHex: k, paletteRgb: v} = a, S = a.gradients, F = a.underlays, I = to(x)), m && void 0 !== w && (L = {
				labels: x,
				paletteHex: k,
				paletteRgb: v,
				counts: I,
				paletteClampedTo: $,
				gradients: S,
				underlays: F
			}, Dn(p, w, L));
		} else {
			m && On(p).palMisses++;
			const i = function(t) {
				const { width: e, height: n, data: o } = t, r = new Uint8Array(e * n), s = (t, e) => Math.abs(o[t] - o[e]) + Math.abs(o[t + 1] - o[e + 1]) + Math.abs(o[t + 2] - o[e + 2]);
				for (let i = 0; i < n; i++) for (let t = 0; t < e; t++) {
					const o = i * e + t, a = 4 * o;
					let l = !1;
					(t + 1 < e && s(a, a + 4) >= 40 || t > 0 && s(a, a - 4) >= 40 || i + 1 < n && s(a, a + 4 * e) >= 40 || i > 0 && s(a, a - 4 * e) >= 40) && (l = !0), r[o] = l ? 1 : 0;
				}
				return {
					width: e,
					height: n,
					data: r
				};
			}(e), l = {
				width: e.width,
				height: e.height,
				data: new Uint8Array(e.width * e.height)
			};
			for (let t = 0; t < l.data.length; t++) l.data[t] = 0 === i.data[t] ? 1 : 0;
			const f = function(t, e) {
				const { width: o, height: r, data: s } = t, i = o * r, l = b(e.k, 2, 64), f = b(e.quality, 1, 10), h = e.mask ? e.mask.data : null, u = "oklab" === e.colorSpace, d = new Int32Array(i), p = e.fixedPalette;
				if (null != p && p.length > 0) {
					const e = [];
					for (const t of p) {
						const n = a(t);
						null !== n && e.push(n);
					}
					if (e.length > 0) {
						const a = e.length, l = new Float32Array(3 * a), f = new Uint8Array(3 * a), p = [];
						for (let t = 0; t < a; t++) {
							const [o, r, s] = e[t];
							if (f[3 * t] = o, f[3 * t + 1] = r, f[3 * t + 2] = s, p.push(c(o, r, s)), u) {
								const [e, i, a] = n(o / 255, r / 255, s / 255);
								l[3 * t] = e, l[3 * t + 1] = i, l[3 * t + 2] = a;
							} else l[3 * t] = o / 255, l[3 * t + 1] = r / 255, l[3 * t + 2] = s / 255;
						}
						return {
							labels: {
								width: o,
								height: r,
								data: d,
								count: a
							},
							paletteHex: p,
							paletteRgb: f,
							counts: vt(d, l, a, s, u ? R(t) : null, h, i, null, !1)
						};
					}
				}
				const y = /* @__PURE__ */ new Map();
				let g = 0, m = !1;
				for (let n = 0, a = 0; n < i; n++, a += 4) {
					if (null !== h) {
						if (0 === h[n]) continue;
						g++;
					}
					if (m) continue;
					const t = s[a] << 16 | s[a + 1] << 8 | s[a + 2], e = y.get(t);
					if (void 0 === e) {
						if (y.size === l) {
							if (m = !0, y.clear(), null === h) break;
							continue;
						}
						y.set(t, 1);
					} else y.set(t, e + 1);
				}
				if (null === h && (g = i), 0 === g) return d.fill(-1), {
					labels: {
						width: o,
						height: r,
						data: d,
						count: 0
					},
					paletteHex: [],
					paletteRgb: /* @__PURE__ */ new Uint8Array(0),
					counts: /* @__PURE__ */ new Uint32Array(0)
				};
				if (!m) {
					const t = y.size, e = new Int32Array(t), n = new Uint32Array(t), a = /* @__PURE__ */ new Map();
					let l = 0;
					for (const [o, r] of y) e[l] = o, n[l] = r, a.set(o, l), l++;
					const f = It(n, t), u = new Int32Array(t), p = new Uint8Array(3 * t), g = [], m = new Uint32Array(t);
					for (let o = 0; o < t; o++) {
						const t = f[o];
						u[t] = o;
						const r = e[t], s = r >> 16 & 255, i = r >> 8 & 255, a = 255 & r;
						p[3 * o] = s, p[3 * o + 1] = i, p[3 * o + 2] = a, g.push(c(s, i, a)), m[o] = n[t];
					}
					for (let o = 0, r = 0; o < i; o++, r += 4) {
						if (null !== h && 0 === h[o]) {
							d[o] = -1;
							continue;
						}
						const t = s[r] << 16 | s[r + 1] << 8 | s[r + 2];
						d[o] = u[a.get(t)];
					}
					return {
						labels: {
							width: o,
							height: r,
							data: d,
							count: t
						},
						paletteHex: g,
						paletteRgb: p,
						counts: m
					};
				}
				const w = u ? R(t) : null, M = function(t) {
					let e = t >>> 0;
					return () => {
						e = e + 1831565813 | 0;
						let t = Math.imul(e ^ e >>> 15, 1 | e);
						return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
					};
				}(e.seed), x = e.sampleMask ? e.sampleMask.data : null;
				let A = null, k = g;
				if (null !== x) {
					let t = 0;
					for (let e = 0; e < i; e++) null !== h && 0 === h[e] || 0 === x[e] || t++;
					if (t >= Math.max(l, 256)) {
						const e = new Int32Array(t);
						let n = 0;
						for (let t = 0; t < i; t++) null !== h && 0 === h[t] || 0 === x[t] || (e[n++] = t);
						A = e, k = t;
					}
				}
				const v = Math.min(k, 2e4 + 2e4 * f), I = new Int32Array(v);
				if (null !== A) if (k <= v) for (let n = 0; n < k; n++) I[n] = A[n];
				else for (let n = 0; n < v; n++) I[n] = A[M() * k | 0];
				else if (g <= v) {
					let t = 0;
					for (let e = 0; e < i; e++) null !== h && 0 === h[e] || (I[t++] = e);
				} else if (null === h) for (let n = 0; n < v; n++) I[n] = M() * i | 0;
				else {
					const t = new Int32Array(g);
					let e = 0;
					for (let n = 0; n < i; n++) 0 !== h[n] && (t[e++] = n);
					for (let n = 0; n < v; n++) I[n] = t[M() * g | 0];
				}
				const $ = new Float32Array(3 * v);
				if (null !== w) for (let n = 0, a = 0; n < v; n++, a += 3) {
					const t = 3 * I[n];
					$[a] = w[t], $[a + 1] = w[t + 1], $[a + 2] = w[t + 2];
				}
				else for (let n = 0, a = 0; n < v; n++, a += 3) {
					const t = 4 * I[n];
					$[a] = s[t] / 255, $[a + 1] = s[t + 1] / 255, $[a + 2] = s[t + 2] / 255;
				}
				const S = new Float32Array(3 * l), F = new Float64Array(v).fill(1 / 0), C = 3 * (M() * v | 0);
				S[0] = $[C], S[1] = $[C + 1], S[2] = $[C + 2];
				for (let n = 1; n < l; n++) {
					const t = S[3 * (n - 1)], e = S[3 * (n - 1) + 1], o = S[3 * (n - 1) + 2];
					let r = 0;
					for (let n = 0, i = 0; n < v; n++, i += 3) {
						const s = $[i] - t, a = $[i + 1] - e, l = $[i + 2] - o, c = s * s + a * a + l * l;
						c < F[n] && (F[n] = c), r += F[n];
					}
					let s = v - 1;
					if (r > 0) {
						const t = M() * r;
						let e = 0;
						for (let n = 0; n < v; n++) if (e += F[n], e >= t) {
							s = n;
							break;
						}
					} else s = M() * v | 0;
					S[3 * n] = $[3 * s], S[3 * n + 1] = $[3 * s + 1], S[3 * n + 2] = $[3 * s + 2];
				}
				const L = 8 + 3 * f, P = new Float64Array(3 * l), z = new Uint32Array(l);
				for (let n = 0; n < L; n++) {
					P.fill(0), z.fill(0);
					for (let e = 0, n = 0; e < v; e++, n += 3) {
						const t = $[n], e = $[n + 1], o = $[n + 2];
						let r = 0, s = 1 / 0;
						for (let n = 0, a = 0; n < l; n++, a += 3) {
							const i = t - S[a], l = e - S[a + 1], c = o - S[a + 2], f = i * i + l * l + c * c;
							f < s && (s = f, r = n);
						}
						const i = 3 * r;
						P[i] += t, P[i + 1] += e, P[i + 2] += o, z[r]++;
					}
					let t = 0;
					for (let e = 0, n = 0; e < l; e++, n += 3) {
						if (0 === z[e]) continue;
						const o = 1 / z[e], r = P[n] * o, s = P[n + 1] * o, i = P[n + 2] * o, a = r - S[n], l = s - S[n + 1], c = i - S[n + 2], f = Math.sqrt(a * a + l * l + c * c);
						f > t && (t = f), S[n] = r, S[n + 1] = s, S[n + 2] = i;
					}
					if (t < 1e-4) break;
				}
				const U = new Float64Array(3 * l);
				let T = vt(d, S, l, s, w, h, i, U, u), q = 0;
				const H = new Int32Array(l);
				for (let n = 0; n < l; n++) 0 !== T[n] ? (H[n] = q, S[3 * q] = S[3 * n], S[3 * q + 1] = S[3 * n + 1], S[3 * q + 2] = S[3 * n + 2], U[3 * q] = U[3 * n], U[3 * q + 1] = U[3 * n + 1], U[3 * q + 2] = U[3 * n + 2], T[q] = T[n], q++) : H[n] = -1;
				if (q < l) {
					for (let t = 0; t < i; t++) d[t] >= 0 && (d[t] = H[d[t]]);
					T = T.slice(0, q);
				}
				if (!0 === e.autoK && q > 1) {
					const t = new Float64Array(3 * q);
					for (let i = 0; i < q; i++) if (u) t[3 * i] = S[3 * i], t[3 * i + 1] = S[3 * i + 1], t[3 * i + 2] = S[3 * i + 2];
					else {
						const [e, o, r] = n(S[3 * i], S[3 * i + 1], S[3 * i + 2]);
						t[3 * i] = e, t[3 * i + 1] = o, t[3 * i + 2] = r;
					}
					const e = new Uint8Array(q).fill(1), o = new Int32Array(q);
					for (let n = 0; n < q; n++) o[n] = n;
					const r = 9e-4;
					for (;;) {
						let s = -1, i = -1, a = 1 / 0;
						for (let n = 0; n < q; n++) if (0 !== e[n]) for (let o = n + 1; o < q; o++) {
							if (0 === e[o]) continue;
							const r = t[3 * n] - t[3 * o], l = t[3 * n + 1] - t[3 * o + 1], c = t[3 * n + 2] - t[3 * o + 2], f = r * r + l * l + c * c;
							f < a && (a = f, s = n, i = o);
						}
						if (s < 0 || a >= r) break;
						const l = T[s], c = T[i], f = l + c;
						if (S[3 * s] = (S[3 * s] * l + S[3 * i] * c) / f, S[3 * s + 1] = (S[3 * s + 1] * l + S[3 * i + 1] * c) / f, S[3 * s + 2] = (S[3 * s + 2] * l + S[3 * i + 2] * c) / f, U[3 * s] += U[3 * i], U[3 * s + 1] += U[3 * i + 1], U[3 * s + 2] += U[3 * i + 2], T[s] = f, e[i] = 0, o[i] = s, u) t[3 * s] = S[3 * s], t[3 * s + 1] = S[3 * s + 1], t[3 * s + 2] = S[3 * s + 2];
						else {
							const [e, o, r] = n(S[3 * s], S[3 * s + 1], S[3 * s + 2]);
							t[3 * s] = e, t[3 * s + 1] = o, t[3 * s + 2] = r;
						}
					}
					const s = new Int32Array(q);
					let a = 0;
					for (let n = 0; n < q; n++) 0 !== e[n] && (s[n] = a, S[3 * a] = S[3 * n], S[3 * a + 1] = S[3 * n + 1], S[3 * a + 2] = S[3 * n + 2], U[3 * a] = U[3 * n], U[3 * a + 1] = U[3 * n + 1], U[3 * a + 2] = U[3 * n + 2], T[a] = T[n], a++);
					if (a < q) {
						const t = new Int32Array(q);
						for (let e = 0; e < q; e++) {
							let n = e;
							for (; o[n] !== n;) n = o[n];
							t[e] = s[n];
						}
						for (let e = 0; e < i; e++) d[e] >= 0 && (d[e] = t[d[e]]);
						T = T.slice(0, a), q = a;
					}
				}
				const B = It(T, q), j = new Int32Array(q), K = new Uint8Array(3 * q), O = [], D = new Uint32Array(q);
				for (let n = 0; n < q; n++) {
					const t = B[n];
					j[t] = n;
					const e = 1 / T[t], o = Math.round(U[3 * t] * e), r = Math.round(U[3 * t + 1] * e), s = Math.round(U[3 * t + 2] * e);
					K[3 * n] = o, K[3 * n + 1] = r, K[3 * n + 2] = s, O.push(c(o, r, s)), D[n] = T[t];
				}
				for (let n = 0; n < i; n++) d[n] >= 0 && (d[n] = j[d[n]]);
				return {
					labels: {
						width: o,
						height: r,
						data: d,
						count: q
					},
					paletteHex: O,
					paletteRgb: K,
					counts: D
				};
			}(e, {
				k: s.paletteSize,
				colorSpace: s.colorSpace,
				quality: s.quantizeQuality,
				seed: 49734321,
				mask: o,
				sampleMask: l,
				autoK: s.autoPaletteSize,
				fixedPalette: s.palette
			});
			if ($ = s.autoPaletteSize && f.paletteHex.length < s.paletteSize ? f.paletteHex.length : void 0, await t.tick(), t.stage("segment"), s.colorCoherence > 0 && function(t, e, n, o, r, s) {
				const { width: i, height: a, data: l } = t;
				if (o <= 0 || 0 === i * a) return t;
				const c = s?.data ?? null, f = /* @__PURE__ */ new Int32Array(8), h = /* @__PURE__ */ new Int32Array(9);
				let u = l.slice();
				for (let d = 0; d < 4; d++) {
					let t = !1;
					for (let r = 0; r < a; r++) for (let s = 0; s < i; s++) {
						const d = r * i + s, p = u[d];
						if (-1 === p || null !== c && 0 !== c[d]) continue;
						let y = 0, g = 1;
						h[0] = p;
						for (let t = -1; t <= 1; t++) {
							const e = r + t;
							if (!(e < 0 || e >= a)) for (let n = -1; n <= 1; n++) {
								if (0 === n && 0 === t) continue;
								const o = s + n;
								if (o < 0 || o >= i) continue;
								const r = u[e * i + o];
								if (-1 === r) continue;
								f[y++] = r;
								let a = !1;
								for (let t = 0; t < g; t++) if (h[t] === r) {
									a = !0;
									break;
								}
								a || (h[g++] = r);
							}
						}
						const m = 3 * d, w = e[m], M = e[m + 1], x = e[m + 2];
						let b = p, A = 1 / 0;
						for (let t = 0; t < g; t++) {
							const e = h[t], r = 3 * e, s = w - n[r], i = M - n[r + 1], a = x - n[r + 2];
							let l = 0;
							for (let t = 0; t < y; t++) f[t] === e && l++;
							const c = s * s + i * i + a * a + o * (y - l);
							c < A && (A = c, b = e);
						}
						b !== p && (l[d] = b, t = !0);
					}
					if (!t) break;
					d + 1 < 4 && (u = l.slice());
				}
			}(f.labels, R(e), no(f.paletteRgb), .03 * s.colorCoherence, 0, M ?? void 0), s.dissolveBands > 0 && function(t, e, n) {
				const { width: o, height: r, data: s } = t;
				if (e <= 0 || 0 === o * r) return t;
				const i = n?.data ?? null, a = /* @__PURE__ */ new Int32Array(8);
				let l = s.slice();
				for (let c = 0; c < e; c++) {
					let t = !1;
					for (let e = 0; e < r; e++) for (let n = 0; n < o; n++) {
						const c = e * o + n, f = l[c];
						if (-1 === f || null !== i && 0 !== i[c]) continue;
						let h = 0;
						for (let t = -1; t <= 1; t++) {
							const s = e + t;
							if (!(s < 0 || s >= r)) for (let e = -1; e <= 1; e++) {
								if (0 === e && 0 === t) continue;
								const r = n + e;
								if (r < 0 || r >= o) continue;
								const i = l[s * o + r];
								-1 !== i && (a[h++] = i);
							}
						}
						let u = 0, d = -1, p = 0;
						for (let t = 0; t < h; t++) {
							const e = a[t];
							if (e === f) {
								u++;
								continue;
							}
							let n = 0;
							for (let t = 0; t < h; t++) a[t] === e && n++;
							(n > p || n === p && (-1 === d || e < d)) && (p = n, d = e);
						}
						u <= 2 && p >= 3 && -1 !== d && (s[c] = d, t = !0);
					}
					if (!t) break;
					c + 1 < e && (l = s.slice());
				}
			}(f.labels, s.dissolveBands, M ?? void 0), s.preserveDetails) {
				const t = new Float32Array(3 * f.paletteHex.length);
				for (let e = 0; e < f.paletteHex.length; e++) {
					const [o, r, s] = n(f.paletteRgb[3 * e] / 255, f.paletteRgb[3 * e + 1] / 255, f.paletteRgb[3 * e + 2] / 255);
					t[3 * e] = o, t[3 * e + 1] = r, t[3 * e + 2] = s;
				}
				Ct(f.labels, s.minRegionArea, {
					oklab: t,
					keepContrast: .1,
					protect: M ?? void 0
				});
			} else M ? Ct(f.labels, s.minRegionArea, { protect: M }) : Ct(f.labels, s.minRegionArea);
			x = f.labels, k = f.paletteHex, v = f.paletteRgb, I = new Uint32Array(x.count);
			for (let t = 0; t < x.data.length; t++) {
				const e = x.data[t];
				e >= 0 && I[e]++;
			}
			const h = s.omitBackground ? oo(e, k) : -1;
			if (h >= 0) {
				const t = Pt(x, h);
				I[h] = Math.max(0, I[h] - t);
			}
			const u = _n(e, x, k, v, r, s);
			u && ({labels: x, paletteHex: k, paletteRgb: v} = u, S = u.gradients, F = u.underlays, I = to(x)), await t.tick(), m && void 0 !== w && (L = {
				labels: x,
				paletteHex: k,
				paletteRgb: v,
				counts: I,
				paletteClampedTo: $,
				gradients: S,
				underlays: F
			}, Dn(p, w, L));
		}
		void 0 !== $ && h.push({
			code: "palette-clamped",
			severity: "info",
			message: `Palette reduced to ${$} colors (near-duplicates merged).`,
			params: { count: $ }
		});
		const P = new Array(k.length), z = new Array(k.length);
		for (let n = 0; n < k.length; n++) {
			const t = S?.[n];
			if (t) {
				const e = `g${f.length}`;
				f.push({
					id: e,
					...t
				}), P[n] = `url(#${e})`, z[n] = t.stops.map((t) => t.color);
			} else P[n] = k[n], z[n] = [k[n]];
		}
		const U = (t) => F?.[t] ?? -1;
		t.tracing && t.emitStep(() => {
			const t = [Kt(k, I)], e = function(t, e = 24) {
				const n = [];
				for (const a of t) a > 0 && n.push(Math.log10(a));
				if (0 === n.length) return null;
				let o = n[0], r = n[0];
				for (const a of n) a < o && (o = a), a > r && (r = a);
				o = Math.floor(o), r = Math.max(o + 1, Math.ceil(r));
				const s = new Array(e).fill(0), i = r - o;
				for (const a of n) s[Math.min(e - 1, Math.floor((a - o) / i * e))]++;
				return {
					kind: "histogram",
					label: "Region sizes",
					values: s,
					min: o,
					max: r,
					xLabel: "log₁₀ pixels",
					log: !0
				};
			}(I);
			return e && t.push(e), {
				code: "segment",
				label: "Palette & regions",
				rasters: [Ht(x, k, "Label map")],
				charts: t,
				metrics: {
					colors: k.length,
					regions: Wt(I),
					gradients: S ? S.filter(Boolean).length : 0
				},
				notes: [`Segmentation: ${s.segmentation}; min region ${s.minRegionArea}px.`]
			};
		}), t.stage("trace");
		const T = {
			curveMode: s.curveMode,
			smoothing: s.smoothing,
			curveOptimize: s.curveOptimize,
			optTolerance: s.optTolerance,
			cornerThreshold: s.cornerThreshold
		}, q = s.preserveDetails || M ? 1 : Math.max(1, s.minRegionArea), H = [], B = g.helpers, j = void 0 !== w ? `${g.scope}|${w}` : `#${g.serial}`;
		if ("cutout" === s.layering) {
			const n = "pixel" !== s.curveMode && k.length > 1, o = s.optimizeSvg ? s.precision : void 0;
			let r;
			r = B ? await async function(t, e, n, o, r, s, i, a, l) {
				const c = He(n);
				r && e.setImage(a.scope, o), e.setChains(l, c);
				const f = new Array(c.chains.length);
				let h = 0;
				for await (const u of e.dispatch({
					kind: "fit-chains",
					total: c.chains.length,
					stateKey: l,
					curve: s,
					batch: Yn,
					paletteOklab: r,
					arcPrecision: i
				})) f[u.unit] = {
					open: u.shapes[0],
					closed: u.shapes[1]
				}, h++, 0 === (h & Xn) && (t.progress(h / c.chains.length), await t.tick());
				return je(c, f);
			}(t, B, x, e, n ? no(v) : void 0, T, o, g, j) : function(t, e) {
				const n = He(t);
				return je(n, function(t, e) {
					const n = new Array(t.chains.length);
					for (let o = 0; o < t.chains.length; o++) n[o] = Be(t, o, e);
					return n;
				}(n, e));
			}(x, {
				...T,
				colorField: n ? {
					oklab: R(e),
					paletteOklab: no(v)
				} : void 0,
				refineChain: void 0 === o ? void 0 : (t) => ln(t, o)
			}), r.sort((t, e) => e.area - t.area);
			const a = A(e.width, s.widthMm), l = s.gapFill <= 0 ? 0 : "mm" === s.unit ? a > 0 ? s.gapFill / a : 0 : s.gapFill;
			for (const t of r) {
				const e = U(t.label);
				for (const n of e >= 0 ? [e, t.label] : [t.label]) {
					const o = P[n];
					eo(H, z[n]), i.push({
						commands: t.commands,
						fill: o,
						fillRule: "evenodd",
						...n === e ? { unfoldable: !0 } : {},
						...l > 0 ? {
							stroke: o,
							strokeWidth: l,
							strokeLinejoin: "round"
						} : {}
					});
				}
			}
			t.progress(1);
		} else {
			const e = function(t, e) {
				return [
					t.layering,
					t.turnPolicy,
					e
				].join("|");
			}(s, q), n = L?.rings, o = void 0 !== n && n.key === e ? n.layers : void 0, r = "pixel" !== s.curveMode, a = o && r ? n?.polygons : void 0;
			let c = 0, f = 0, h = 1;
			const u = () => t.emitStep(() => ({
				code: "trace",
				label: `Trace layer ${c}/${f}`,
				metrics: {
					shapes: i.length,
					nodes: Zt(i),
					layer: c,
					layersTotal: f
				}
			})), d = (t) => {
				f = t, h = Math.max(1, Math.ceil(t / 10));
			}, y = (t, e) => {
				const n = U(t), o = {
					fill: P[t],
					fillRule: "evenodd",
					layerId: e
				};
				return n < 0 ? { own: o } : {
					own: o,
					under: {
						fill: P[n],
						fillRule: "evenodd",
						layerId: e,
						unfoldable: !0
					}
				};
			}, w = async (e, n, o) => {
				const r = U(e), s = c;
				let a = 0;
				for (const t of r >= 0 ? [r, e] : [e]) {
					n.length > 0 && eo(H, z[t]);
					for (const e of n) i.push({
						commands: e,
						fill: P[t],
						fillRule: "evenodd",
						layerId: s,
						...t === r ? { unfoldable: !0 } : {}
					}), o && l.push(o[a] ?? null), a++;
				}
				c++, t.progress(c / f), t.tracing && c < f && c % h === 0 && u(), await t.tick();
			}, M = (t, e, n) => w(t, Le(e, T, n).map((t) => t.commands), void 0);
			if (B) {
				const t = Qn(x, I, L, m ? p : void 0), n = (e) => e < t.order.length ? t.order[e] : t.islands[e - t.order.length].label, o = t.order.length + t.islands.length, r = `${j}|${e}`;
				B.setStackPlan(r, function(t, e, n, o) {
					const r = new Int32Array(e.islands.length + 1);
					for (let a = 0; a < e.islands.length; a++) r[a + 1] = r[a] + e.islands[a].pixels.length;
					const s = new Int32Array(e.islands.length), i = new Int32Array(r[e.islands.length]);
					for (let a = 0; a < e.islands.length; a++) s[a] = e.islands[a].label, i.set(e.islands[a].pixels, r[a]);
					return {
						width: t.width,
						height: t.height,
						labelCount: e.labelCount,
						stackLabels: e.stackLabels,
						order: new Int32Array(e.order),
						islandLabels: s,
						islandPixels: i,
						islandOffsets: r,
						turnPolicy: n,
						minArea: o
					};
				}(x, t, s.turnPolicy, q)), d(o);
				for await (const e of B.dispatch({
					kind: "trace-layers",
					total: o,
					stateKey: r,
					curve: T,
					meta: (t) => y(n(t), t),
					serialize: g.serialize
				})) await w(n(e.unit), e.shapes, e.svg);
			} else if (o) {
				On(p).ringHits++, r && (a ? On(p).polyHits++ : On(p).polyMisses++);
				const t = r && !a ? [] : void 0;
				d(o.length);
				for (let e = 0; e < o.length; e++) {
					const n = o[e];
					let r = a?.[e];
					t && (r = Wn(n.paths), t.push(r)), await M(n.label, n.paths, r);
				}
				t && n && (n.polygons = t);
			} else {
				m && (On(p).ringMisses++, r && On(p).polyMisses++);
				const t = m ? [] : void 0, n = t && r ? [] : void 0;
				if (await async function(t, e, n, o, r, s) {
					const i = Math.max(1, o), a = e.stackLabels, l = e.order, c = a.length, f = e.labelCount, h = new Uint32Array(f);
					for (let x = 0; x < c; x++) {
						const t = a[x];
						t >= 0 && h[t]++;
					}
					const u = new Int32Array(f + 1);
					for (let x = 0; x < f; x++) u[x + 1] = u[x] + h[x];
					const d = new Int32Array(u[f]), p = u.slice(0, f);
					for (let x = 0; x < c; x++) {
						const t = a[x];
						t >= 0 && (d[p[t]++] = x);
					}
					const y = (t.width, t.height, new Uint8Array(c));
					for (let x = 0; x < c; x++) y[x] = a[x] >= 0 ? 1 : 0;
					const g = {
						width: t.width,
						height: t.height,
						data: new Uint8Array(c)
					}, m = g.data, w = new Int32Array(c), M = t.width;
					r(l.length + e.islands.length);
					for (let x = 0; x < l.length; x++) {
						const t = l[x];
						m.fill(0);
						let e = 0;
						for (let n = u[t]; n < u[t + 1]; n++) {
							const t = d[n];
							0 === m[t] && (m[t] = 1, w[e++] = t);
						}
						for (; e > 0;) {
							const t = w[--e], n = t - (t / M | 0) * M;
							n > 0 && 1 === y[t - 1] && 0 === m[t - 1] && (m[t - 1] = 1, w[e++] = t - 1), n < M - 1 && 1 === y[t + 1] && 0 === m[t + 1] && (m[t + 1] = 1, w[e++] = t + 1), t >= M && 1 === y[t - M] && 0 === m[t - M] && (m[t - M] = 1, w[e++] = t - M), t < c - M && 1 === y[t + M] && 0 === m[t + M] && (m[t + M] = 1, w[e++] = t + M);
						}
						const o = Xt(g, n, i);
						for (let n = u[t]; n < u[t + 1]; n++) y[d[n]] = 0;
						await s(t, o);
					}
					for (const x of e.islands) {
						m.fill(0);
						for (const e of x.pixels) m[e] = 1;
						const t = Xt(g, n, i);
						await s(x.label, t);
					}
				}(x, Qn(x, I, L, m ? p : void 0), s.turnPolicy, q, d, async (e, o) => {
					const s = r ? Wn(o) : void 0;
					t?.push({
						label: e,
						paths: o
					}), n && s && n.push(s), await M(e, o, s);
				}), t && L) {
					for (const t of p.palette?.values() ?? []) t !== L && (t.rings = void 0);
					L.rings = {
						key: e,
						layers: t,
						polygons: n
					};
				}
			}
		}
		K = H, t.progress(1);
	}(l, z, U, T, s, B, O, j, f, 0, o?.edgeHint, p ? h : void 0, u, {
		helpers: g,
		scope: Z,
		serial: m,
		serialize: N
	}) : await async function(t, e, n, o, r, s, i, a, l, c, f, h) {
		t.stage("palette");
		const u = void 0 !== c && void 0 !== f && c.imageId === f && void 0 === a && void 0 === l, p = u ? function(t) {
			return [
				t.thresholdMode,
				t.threshold,
				t.adaptiveRadius,
				t.adaptiveBias,
				t.invert,
				t.minRegionArea,
				"pixel" === t.curveMode ? "px" : "-"
			].join("|");
		}(o) : void 0;
		let g = u && c.ink?.key === p ? c.ink : void 0;
		const m = Hn(a, e.width, e.height);
		let M, x;
		if (g) M = g.mask, x = g.coverage, On(c).inkHits++, await t.tick(), t.stage("segment"), await t.tick();
		else {
			u && On(c).inkMisses++;
			const r = function(t) {
				const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(r);
				for (let i = 0, a = 0; i < r; i++, a += 4) {
					const t = P[o[a]], e = P[o[a + 1]], n = P[o[a + 2]], r = .2104542553 * Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n) + .793617785 * Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n) - .0040720468 * Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
					s[i] = r < 0 ? 0 : r > 1 ? 1 : r;
				}
				return {
					width: e,
					height: n,
					data: s
				};
			}(e);
			if ("adaptive" === o.thresholdMode) M = function(t, e, n, o, r) {
				const { width: s, height: i, data: a } = t, l = r ? r.data : null, c = Math.max(1, Math.round(e)), f = o ? 1 : 0, h = s + 1, u = new Float64Array(h * (i + 1));
				for (let p = 0; p < i; p++) {
					let t = 0;
					const e = p * s, n = p * h, o = (p + 1) * h;
					for (let r = 0; r < s; r++) t += a[e + r], u[o + r + 1] = u[n + r + 1] + t;
				}
				const d = new Uint8Array(s * i);
				for (let p = 0; p < i; p++) {
					const t = p - c < 0 ? 0 : p - c, e = p + c >= i ? i - 1 : p + c, o = t * h, r = (e + 1) * h;
					for (let i = 0; i < s; i++) {
						const h = p * s + i;
						if (null !== l && 0 === l[h]) continue;
						const y = i - c < 0 ? 0 : i - c, g = i + c >= s ? s - 1 : i + c, m = (g - y + 1) * (e - t + 1), w = u[r + g + 1] - u[o + g + 1] - u[r + y] + u[o + y];
						d[h] = (a[h] < w / m - n ? 1 : 0) ^ f;
					}
				}
				return {
					width: s,
					height: i,
					data: d
				};
			}(r, o.adaptiveRadius, o.adaptiveBias / 255, o.invert, n), "pixel" !== o.curveMode && (x = function(t, e, n, o) {
				const { width: r, height: s, data: i } = t, a = Math.max(1, Math.round(e)), l = o ? -1 : 1, c = r + 1, f = new Float64Array(c * (s + 1));
				for (let u = 0; u < s; u++) {
					let t = 0;
					const e = u * r, n = u * c, o = (u + 1) * c;
					for (let s = 0; s < r; s++) t += i[e + s], f[o + s + 1] = f[n + s + 1] + t;
				}
				const h = new Float32Array(r * s);
				for (let u = 0; u < s; u++) {
					const t = u - a < 0 ? 0 : u - a, e = u + a >= s ? s - 1 : u + a, o = t * c, d = (e + 1) * c;
					for (let s = 0; s < r; s++) {
						const c = u * r + s, p = s - a < 0 ? 0 : s - a, y = s + a >= r ? r - 1 : s + a, g = (y - p + 1) * (e - t + 1), m = (f[d + y + 1] - f[o + y + 1] - f[d + p] + f[o + p]) / g - n, w = m - i[c], M = w > 0 ? .5 / Math.max(m, 1e-6) : .5 / Math.max(1 - m, 1e-6);
						h[c] = l * w * M;
					}
				}
				return {
					width: r,
					height: s,
					data: h
				};
			}(r, o.adaptiveRadius, o.adaptiveBias / 255, o.invert));
			else {
				const t = "auto" === o.thresholdMode ? function(t, e) {
					const { data: n } = t, o = e ? e.data : null, r = /* @__PURE__ */ new Float64Array(256);
					let s = 0;
					for (let u = 0; u < n.length; u++) null !== o && 0 === o[u] || (r[Ft(n[u])]++, s++);
					if (0 === s) return .5;
					let i = 0;
					for (let u = 0; u < 256; u++) i += u * r[u];
					let a = 0, l = 0, c = 0, f = -1, h = -1;
					for (let u = 0; u < 256; u++) {
						if (a += r[u], 0 === a) continue;
						const t = s - a;
						if (0 === t) break;
						l += u * r[u];
						const e = l / a - (i - l) / t, n = a * t * e * e;
						n > c ? (c = n, f = u, h = u) : n === c && f >= 0 && (h = u);
					}
					return f < 0 || 0 === c ? .5 : ((f + h) / 2 + 1) / 256;
				}(r, n) : o.threshold / 255;
				M = function(t, e, n, o) {
					const { width: r, height: s, data: i } = t, a = o ? o.data : null, l = new Uint8Array(r * s), c = n ? 1 : 0;
					for (let f = 0; f < l.length; f++) null !== a && 0 === a[f] || (l[f] = (i[f] < e ? 1 : 0) ^ c);
					return {
						width: r,
						height: s,
						data: l
					};
				}(r, t, o.invert, n), "pixel" !== o.curveMode && (x = function(t, e, n) {
					const { width: o, height: r, data: s } = t, i = new Float32Array(s.length), a = n ? -1 : 1, l = .5 / Math.max(e, 1e-6), c = .5 / Math.max(1 - e, 1e-6);
					for (let f = 0; f < s.length; f++) {
						const t = e - s[f];
						i[f] = a * t * (t > 0 ? l : c);
					}
					return {
						width: o,
						height: r,
						data: i
					};
				}(r, t, o.invert));
			}
			if (l && "pixel" !== o.curveMode) {
				const t = function(t, e, n) {
					if (!t) return null;
					const o = t.width === e && t.height === n ? t : F(t, e, n), r = new Float32Array(e * n);
					for (let s = 0; s < r.length; s++) {
						const t = o.data[s] - .5;
						r[s] = Math.round(256 * t) / 256;
					}
					return {
						width: e,
						height: n,
						data: r
					};
				}(l, e.width, e.height);
				t && (x = t);
			}
			await t.tick(), t.stage("segment"), M = function(t, e, n) {
				const { width: o, height: r, data: s } = t, i = o * r, a = w(o, r);
				if (a.data.set(s), e <= 1) return a;
				const l = n?.data ?? null, c = new Uint8Array(i), f = new Int32Array(i), h = new Int32Array(i);
				for (let u = 0; u < i; u++) {
					if (0 === s[u] || 0 !== c[u]) continue;
					let t = 0, n = 0, i = !1;
					for (f[t++] = u, c[u] = 1; t > 0;) {
						const e = f[--t];
						h[n++] = e, null !== l && 0 !== l[e] && (i = !0);
						const a = e - (e / o | 0) * o, u = e / o | 0;
						for (let n = -1; n <= 1; n++) {
							const e = u + n;
							if (!(e < 0 || e >= r)) for (let r = -1; r <= 1; r++) {
								if (0 === r && 0 === n) continue;
								const i = a + r;
								if (i < 0 || i >= o) continue;
								const l = e * o + i;
								0 === c[l] && 0 !== s[l] && (c[l] = 1, f[t++] = l);
							}
						}
					}
					if (n < e && !i) for (let e = 0; e < n; e++) a.data[h[e]] = 0;
				}
				c.fill(0);
				for (let u = 0; u < i; u++) {
					if (0 !== s[u] || 0 !== c[u]) continue;
					let t = 0, n = 0, i = !1, d = !1;
					for (f[t++] = u, c[u] = 1; t > 0;) {
						const e = f[--t];
						h[n++] = e, null !== l && 0 !== l[e] && (d = !0);
						const a = e - (e / o | 0) * o, u = e / o | 0;
						0 !== a && 0 !== u && a !== o - 1 && u !== r - 1 || (i = !0), a > 0 && 0 === c[e - 1] && 0 === s[e - 1] && (c[e - 1] = 1, f[t++] = e - 1), a < o - 1 && 0 === c[e + 1] && 0 === s[e + 1] && (c[e + 1] = 1, f[t++] = e + 1), u > 0 && 0 === c[e - o] && 0 === s[e - o] && (c[e - o] = 1, f[t++] = e - o), u < r - 1 && 0 === c[e + o] && 0 === s[e + o] && (c[e + o] = 1, f[t++] = e + o);
					}
					if (!i && n < e && !d) for (let e = 0; e < n; e++) a.data[h[e]] = 1;
				}
				return a;
			}(M, o.minRegionArea, m), await t.tick(), u && void 0 !== p && (g = {
				key: p,
				mask: M,
				coverage: x
			}, c.ink = g);
		}
		if (t.tracing && t.emitStep(() => ({
			code: "threshold",
			label: "Threshold",
			rasters: [Bt(M, "Binary mask")],
			charts: [jt(e)],
			metrics: {
				blackFraction: Math.round(1e3 * Et(M)) / 1e3,
				threshold: o.threshold
			},
			notes: [`Threshold mode: ${o.thresholdMode}${o.invert ? " (inverted)" : ""}.`]
		})), t.stage("trace"), b = [o.fillColor], K = b, "bw" === o.mode) {
			const e = m ? 1 : Math.max(1, o.minRegionArea), n = `${o.turnPolicy}|${e}`, i = "pixel" !== o.curveMode;
			let a, l;
			g?.rings && g.ringKey === n ? (a = g.rings, l = i ? g.polygons : void 0, On(c).ringHits++) : (a = Xt(M, o.turnPolicy, e), g && (g.ringKey = n, g.rings = a, g.polygons = void 0, On(c).ringMisses++));
			const f = {
				curveMode: o.curveMode,
				smoothing: o.smoothing,
				curveOptimize: o.curveOptimize,
				optTolerance: o.optTolerance,
				cornerThreshold: o.cornerThreshold
			}, u = h.helpers;
			let d;
			if (u) {
				const e = function(t) {
					const e = [], n = new Int32Array(t.length);
					for (let o = 0; o < t.length; o++) {
						const r = t[o];
						if (r.area > 0) n[o] = e.length, e.push({
							rings: [o],
							area: r.area,
							holeCount: 0
						});
						else if (r.parent >= 0) {
							const t = e[n[r.parent]];
							t.rings.push(o), t.holeCount++;
						}
					}
					return e.sort((t, e) => e.area - t.area), e;
				}(a), s = `${void 0 !== p ? `${h.scope}|${p}` : `#${h.serial}`}|${n}`;
				u.setRingUnits(s, {
					width: M.width,
					height: M.height,
					rings: a.map((t) => t.points),
					coverage: i ? x : void 0
				});
				const l = new Array(a.length);
				let c = 0;
				for await (const n of u.dispatch({
					kind: "trace-rings",
					total: a.length,
					stateKey: s,
					curve: f,
					batch: Vn
				})) l[n.unit] = n.shapes[0], c++, 0 === (c & Gn) && (t.progress(c / a.length), await t.tick());
				d = e.map((t) => {
					const e = [];
					for (const n of t.rings) e.push(...l[n]);
					return {
						commands: e,
						area: t.area,
						holeCount: t.holeCount
					};
				});
				for (const t of d) r.push({
					commands: t.commands,
					fill: o.fillColor,
					fillRule: "evenodd"
				});
			} else {
				i && (l ? On(c).polyHits++ : (l = a.map((t) => Re(t.points, x)), g && (g.polygons = l, On(c).polyMisses++))), d = Le(a, {
					...f,
					coverage: x
				}, l);
				for (const t of d) r.push({
					commands: t.commands,
					fill: o.fillColor,
					fillRule: "evenodd"
				});
			}
			o.detectIslands && function(t, e) {
				let n = 0;
				for (const o of t) n += o.holeCount;
				n > 0 && e.push({
					code: "stencil-islands",
					severity: "warning",
					message: `${n} enclosed island${1 === n ? "" : "s"} would fall out of a physical stencil — add bridges in your editor.`,
					params: { count: n }
				});
			}(d, s), t.progress(1);
		} else {
			(function(t, e) {
				const { data: n } = t;
				if (0 === n.length) return;
				let o = 0;
				for (let s = 0; s < n.length; s++) o += n[s];
				const r = o / n.length;
				r > ro && e.push({
					code: "centerline-input",
					severity: "warning",
					message: `Centerline traces the middle of thin lines, but ~${Math.round(100 * r)}% of this image is filled — expect a skeleton, not matching outlines. Use B&W or Color mode for solid shapes.`,
					params: { percent: Math.round(100 * r) }
				});
			})(M, s);
			const e = function(t) {
				const { width: e, height: n } = t, o = e * n, r = new Uint8Array(o);
				for (let a = 0; a < o; a++) r[a] = 0 !== t.data[a] ? 1 : 0;
				const s = new Int32Array(o);
				let i = !0;
				for (; i;) {
					i = !1;
					for (let t = 0; t < 2; t++) {
						let o = 0;
						for (let i = 0; i < n; i++) {
							const a = i > 0, l = i < n - 1;
							for (let n = 0; n < e; n++) {
								const c = i * e + n;
								if (0 === r[c]) continue;
								const f = n > 0, h = n < e - 1, u = a ? r[c - e] : 0, d = a && h ? r[c - e + 1] : 0, p = h ? r[c + 1] : 0, y = l && h ? r[c + e + 1] : 0, g = l ? r[c + e] : 0, m = l && f ? r[c + e - 1] : 0, w = f ? r[c - 1] : 0, M = a && f ? r[c - e - 1] : 0, x = u + d + p + y + g + m + w + M;
								if (x < 2 || x > 6) continue;
								let b = 0;
								if (0 === u && 1 === d && b++, 0 === d && 1 === p && b++, 0 === p && 1 === y && b++, 0 === y && 1 === g && b++, 0 === g && 1 === m && b++, 0 === m && 1 === w && b++, 0 === w && 1 === M && b++, 0 === M && 1 === u && b++, 1 === b) {
									if (0 === t) {
										if (u * p * g !== 0 || p * g * w !== 0) continue;
									} else if (u * p * w !== 0 || u * g * w !== 0) continue;
									s[o++] = c;
								}
							}
						}
						if (o > 0) {
							i = !0;
							for (let t = 0; t < o; t++) r[s[t]] = 0;
						}
					}
				}
				return {
					width: e,
					height: n,
					data: r
				};
			}(M);
			t.progress(.4), await t.tick(), t.tracing && t.emitStep(() => ({
				code: "thin",
				label: "Skeleton",
				rasters: [Bt(e, "Zhang–Suen skeleton")],
				metrics: { strokePixels: Math.round(Et(e) * e.data.length) }
			}));
			const n = o.strokeWidth <= 0, i = n ? Rt(M) : void 0, a = n ? function(t, e) {
				const n = Rt(t), o = e.data, r = new Float32Array(n.length);
				let s = 0;
				for (let l = 0; l < o.length; l++) 0 !== o[l] && (r[s++] = 2 * n[l]);
				if (0 === s) return 1;
				const i = r.subarray(0, s);
				i.sort();
				const a = s >> 1;
				return s % 2 == 1 ? i[a] : (i[a - 1] + i[a]) / 2;
			}(M, e) : o.strokeWidth, l = function(t, e) {
				const { width: n, height: o, data: r } = t, s = (t, e) => t >= 0 && t < n && e >= 0 && e < o ? r[e * n + t] : 0, i = (t, e, n) => {
					let o = 0;
					for (let r = -1; r <= 1; r++) for (let i = -1; i <= 1; i++) 0 === i && 0 === r || 0 !== s(t + i, e + r) && (0 === i || 0 === r || 0 === s(t + i, e) && 0 === s(t, e + r)) && (n[2 * o] = t + i, n[2 * o + 1] = e + r, o++);
					return o;
				}, a = (t, e) => e * n + t, l = new Int8Array(n * o), c = new Array(16);
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) 0 !== r[a(t, d)] && (l[a(t, d)] = i(t, d, c));
				const f = new Uint16Array(n * o), h = (t, e, n, o) => {
					f[a(t, e)] |= 1 << Qe(n - t, o - e), f[a(n, o)] |= 1 << Qe(t - n, e - o);
				}, u = (t, e, n, o) => !!(f[a(t, e)] & 1 << Qe(n - t, o - e)), p = [], g = (t, e) => 2 !== l[a(t, e)], m = (t, e, n, o) => {
					const r = [t + .5, e + .5];
					let s = t, f = e, u = n, d = o;
					for (h(s, f, u, d); r.push(u + .5, d + .5), !(g(u, d) || u === t && d === e);) {
						const t = i(u, d, c);
						let e = -1, n = -1;
						for (let o = 0; o < t; o++) {
							const t = c[2 * o], r = c[2 * o + 1];
							if (t !== s || r !== f) {
								e = t, n = r;
								break;
							}
						}
						if (-1 === e) break;
						h(u, d, e, n), s = u, f = d, u = e, d = n;
					}
					const p = u === t && d === e && r.length > 4;
					return {
						points: r,
						startKind: l[a(t, e)] >= 3 ? 1 : 0,
						endKind: p || l[a(u, d)] >= 3 ? 1 : 0,
						closed: p,
						merged: !1
					};
				};
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) {
					if (0 === r[a(t, d)] || !g(t, d)) continue;
					const e = i(t, d, c), n = c.slice(0, 2 * e);
					for (let o = 0; o < e; o++) {
						const e = n[2 * o], r = n[2 * o + 1];
						u(t, d, e, r) || p.push(m(t, d, e, r));
					}
				}
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) {
					if (0 === r[a(t, d)] || 2 !== l[a(t, d)]) continue;
					const e = i(t, d, c), n = c.slice(0, 2 * e);
					for (let o = 0; o < e; o++) {
						const e = n[2 * o], r = n[2 * o + 1];
						if (!u(t, d, e, r)) {
							const n = m(t, d, e, r);
							n.closed = !0, p.push(n);
						}
					}
				}
				const w = p.filter((t) => {
					if (t.closed) return !0;
					const n = d(t.points), o = 0 === t.startKind != (0 === t.endKind) && n < e.pruneLength, r = 0 === t.startKind && 0 === t.endKind && n < Math.min(2, e.pruneLength);
					return !o && !r;
				});
				(function(t) {
					const e = /* @__PURE__ */ new Map();
					for (const o of t) {
						if (o.closed) continue;
						const t = o.points, n = t.length >> 1;
						if (!(n < 2)) {
							if (1 === o.startKind) {
								const r = a(Math.floor(t[0]), Math.floor(t[1])), s = Math.min(3, n - 1);
								e.set(r, [...e.get(r) ?? [], {
									chain: o,
									atStart: !0,
									key: r,
									dirX: t[2 * s] - t[0],
									dirY: t[2 * s + 1] - t[1]
								}]);
							}
							if (1 === o.endKind) {
								const r = a(Math.floor(t[2 * (n - 1)]), Math.floor(t[2 * (n - 1) + 1])), s = Math.min(3, n - 1);
								e.set(r, [...e.get(r) ?? [], {
									chain: o,
									atStart: !1,
									key: r,
									dirX: t[2 * (n - 1 - s)] - t[2 * (n - 1)],
									dirY: t[2 * (n - 1 - s) + 1] - t[2 * (n - 1) + 1]
								}]);
							}
						}
					}
					const n = /* @__PURE__ */ new Set();
					for (const o of e.values()) {
						const t = o.filter((t) => !t.chain.merged && !n.has(t.chain)), e = [];
						for (let n = 0; n < t.length; n++) for (let o = n + 1; o < t.length; o++) {
							const r = t[n], s = t[o];
							if (r.chain === s.chain) continue;
							const i = Math.hypot(r.dirX, r.dirY) || 1, a = Math.hypot(s.dirX, s.dirY) || 1, l = (r.dirX * s.dirX + r.dirY * s.dirY) / (i * a);
							e.push([
								r,
								s,
								l
							]);
						}
						e.sort((t, e) => t[2] - e[2]);
						for (const [o, r, s] of e) {
							if (s > -.5) break;
							n.has(o.chain) || n.has(r.chain) || o.chain.merged || r.chain.merged || (x(o, r), n.add(o.chain), n.add(r.chain));
						}
					}
				})(w);
				const M = [];
				for (const b of w) {
					if (b.merged) continue;
					const t = e.distanceField ? We(b.points, e.distanceField, n, o) : void 0;
					let r = b.points;
					if (e.smoothing > 0 && (r = Ye(r, Math.round(2 * e.smoothing), b.closed)), e.simplifyTolerance > 0 && (r = Ee(r, e.simplifyTolerance)), r.length < 4) continue;
					const s = [], i = r.length >> 1;
					for (let n = 1; n < i - 1; n++) y(r[2 * (n - 1)], r[2 * (n - 1) + 1], r[2 * n], r[2 * n + 1], r[2 * (n + 1)], r[2 * (n + 1) + 1]) < e.cornerThreshold && s.push(n);
					const a = [{
						type: "M",
						x: r[0],
						y: r[1]
					}];
					a.push(...pe(r, e.fitTolerance, s)), b.closed && a.push({ type: "Z" }), M.push({
						commands: a,
						closed: b.closed,
						length: d(r),
						width: t
					});
				}
				return M.sort((t, e) => e.length - t.length), M;
				function x(t, e) {
					const n = t.atStart ? Xe(t.chain.points) : t.chain.points.slice(), o = e.atStart ? e.chain.points.slice() : Xe(e.chain.points), r = n.concat(o.slice(2)), s = t.chain;
					s.points = r, s.startKind = t.atStart ? t.chain.endKind : t.chain.startKind, s.endKind = e.atStart ? e.chain.endKind : e.chain.startKind, e.chain.merged = !0;
				}
			}(e, {
				pruneLength: o.pruneLength,
				cornerThreshold: o.cornerThreshold,
				fitTolerance: o.fitTolerance,
				simplifyTolerance: o.simplifyTolerance,
				smoothing: o.smoothing,
				distanceField: i
			});
			for (const t of l) {
				const e = n ? t.width ?? a : a;
				r.push({
					commands: t.commands,
					stroke: o.fillColor,
					strokeWidth: so(e),
					strokeLinecap: "round",
					strokeLinejoin: "round"
				});
			}
			t.progress(1);
		}
		var b;
	}(l, z, U, s, B, f, 0, o?.edgeHint, o?.coverageHint, p ? h : void 0, u, {
		helpers: g,
		scope: Z,
		serial: m,
		serialize: N
	}), l.tracing && l.emitStep(() => ({
		code: "trace",
		label: "Trace & fit",
		charts: [Dt(B)],
		metrics: {
			shapes: B.length,
			nodes: Zt(B),
			gradients: j.length
		},
		notes: ["centerline" === s.mode ? "Centerline strokes fitted from the skeleton." : `Layering: ${s.layering}; curves: ${s.curveMode}.`]
	})), l.stage("svg");
	const E = s.groupByColor && ("color" === s.mode || "grayscale" === s.mode), W = function(t, e, n) {
		const o = nn(e.precision), r = !0 === e.optimizePaths, s = !0 === e.roundPrimitives, i = en(t.width, o), a = en(t.height, o);
		let l, c;
		if ("mm" === t.unit) {
			const e = void 0 !== t.widthMm && t.widthMm > 0 ? t.widthMm : t.width / 96 * 25.4, n = t.width > 0 ? e * (t.height / t.width) : 0;
			l = `${en(e, 3)}mm`, c = `${en(n, 3)}mm`;
		} else l = i, c = a;
		const f = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${i} ${a}" width="${l}" height="${c}">`, h = ["<!-- Trazor: traced client-side -->"];
		if (void 0 !== t.title && "" !== t.title && h.push(`<title>${Ln(t.title)}</title>`), void 0 !== t.desc && "" !== t.desc && h.push(`<desc>${Ln(t.desc)}</desc>`), void 0 !== t.defs && t.defs.length > 0) {
			const n = t.defs.map((t) => function(t, e) {
				const n = (t) => en(t, e), o = t.stops.map((t) => {
					const e = void 0 !== t.opacity && t.opacity < 1 ? ` stop-opacity="${en(t.opacity, 3)}"` : "";
					return `<stop offset="${en(t.offset, 3)}" stop-color="${Pn(t.color, "stop-color")}"${e}/>`;
				}).join(""), r = Ln(t.id);
				return "linear" === t.kind ? `<linearGradient id="${r}" gradientUnits="userSpaceOnUse" x1="${n(t.x1)}" y1="${n(t.y1)}" x2="${n(t.x2)}" y2="${n(t.y2)}">${o}</linearGradient>` : `<radialGradient id="${r}" gradientUnits="userSpaceOnUse" cx="${n(t.cx)}" cy="${n(t.cy)}" r="${n(t.r)}">${o}</radialGradient>`;
			}(t, o));
			h.push(!0 === e.pretty ? `<defs>\n    ${n.join("\n    ")}\n  </defs>` : `<defs>${n.join("")}</defs>`);
		}
		if (!0 === e.groupByLayer || !0 === e.groupByColor) {
			const i = !0 === e.groupByLayer ? function(t) {
				const e = [];
				let n = null;
				for (let o = 0; o < t.length; o++) {
					const r = t[o].layerId;
					null === n || void 0 === r || r !== n.id ? (n = {
						indices: [o],
						id: r
					}, e.push({
						key: qn(t[o]),
						indices: n.indices
					})) : n.indices.push(o);
				}
				return e;
			}(t.shapes) : function(t) {
				const e = [], n = /* @__PURE__ */ new Map();
				for (let o = 0; o < t.length; o++) {
					const r = qn(t[o]);
					let s = n.get(r);
					void 0 === s && (s = [], n.set(r, s), e.push({
						key: r,
						indices: s
					})), s.push(o);
				}
				return e;
			}(t.shapes);
			let a = 0;
			for (const l of i) {
				const i = Tn(t.shapes, l.indices, o, r, s, n);
				if (0 === i.length) continue;
				a++;
				const c = `<g id="layer-${a}"><title>${Ln(l.key)}</title>`;
				h.push(!0 === e.pretty ? `${c}\n    ${i.join("\n    ")}\n  </g>` : `${c}${i.join("")}</g>`);
			}
		} else {
			const e = t.shapes.map((t, e) => e);
			for (const i of Tn(t.shapes, e, o, r, s, n)) h.push(i);
		}
		return !0 === e.pretty ? `${f}\n  ${h.join("\n  ")}\n</svg>\n` : `${f}${h.join("")}</svg>`;
	}({
		width: q,
		height: H,
		unit: s.unit,
		widthMm: "mm" === s.unit ? s.widthMm : void 0,
		title: s.svgTitle || void 0,
		defs: j.length > 0 ? j : void 0,
		shapes: B
	}, {
		precision: s.precision,
		optimizePaths: s.optimizeSvg,
		roundPrimitives: D,
		groupByColor: E && "cutout" === s.layering,
		groupByLayer: E && "cutout" !== s.layering
	}, O.length === B.length ? O : void 0);
	l.progress(.6);
	const Q = function(t) {
		const e = (t.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g) ?? []).length;
		let n = 0;
		for (const c of t.matchAll(/(?<![\w-])d\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) n += (Ve(c, 1).match(/[MLHVQCTSAmlhvqctsa]/g) ?? []).length;
		const o = [];
		for (const c of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o.push({
			index: c.index ?? 0,
			value: Ve(c, 1)
		});
		for (const c of t.matchAll(/(?<![\w-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			const t = Ve(c, 1);
			for (const e of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*:\s*([^;"']+)/g)) o.push({
				index: (c.index ?? 0) + (e.index ?? 0),
				value: e[1]
			});
		}
		o.sort((t, e) => t.index - e.index);
		const r = [], s = /* @__PURE__ */ new Set();
		for (const { value: c } of o) {
			const t = Ge(c);
			null === t || s.has(t) || (s.add(t), r.push(t));
		}
		let i = null, a = null;
		const l = /(?<![\w-])viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(t);
		if (null !== l) {
			const t = Ve(l, 1).trim().split(/[\s,]+/);
			if (t.length >= 4) {
				const e = Number(t[2]), n = Number(t[3]);
				Number.isFinite(e) && (i = e), Number.isFinite(n) && (a = n);
			}
		}
		return {
			pathCount: e,
			nodeCount: n,
			colorCount: r.length,
			palette: r,
			byteLength: new TextEncoder().encode(t).length,
			width: i,
			height: a
		};
	}(W);
	l.tracing && l.emitStep(() => ({
		code: "serialize",
		label: "Serialize SVG",
		charts: [Nt(B)],
		metrics: {
			paths: Q.pathCount,
			nodes: Q.nodeCount,
			colors: Q.colorCount,
			bytes: Q.byteLength
		},
		notes: [s.optimizeSvg ? "Path optimization on." : "Path optimization off."]
	})), 0 === B.length && f.push({
		code: "empty-result",
		severity: "warning",
		message: "No shapes were produced — check threshold/background settings."
	}), Q.nodeCount > 2e4 && f.push({
		code: "node-count",
		severity: "info",
		message: `${Q.nodeCount.toLocaleString()} nodes — consider more smoothing or a smaller max size for editing/cutting.`,
		params: { count: Q.nodeCount }
	}), "mm" === s.unit && function(t, e, n, o) {
		const r = A(e, n.widthMm);
		let s = 1 / 0;
		for (const i of t) {
			let t = 1 / 0, e = 1 / 0, n = -1 / 0, o = -1 / 0;
			for (const r of i.commands) "Z" !== r.type && (r.x < t && (t = r.x), r.y < e && (e = r.y), r.x > n && (n = r.x), r.y > o && (o = r.y));
			t < 1 / 0 && (s = Math.min(s, Math.min(n - t, o - e)));
		}
		s < 1 / 0 && s * r < 1 && o.push({
			code: "tiny-features",
			severity: "warning",
			message: `Smallest shape is ~${(s * r).toFixed(2)} mm — most blades/lasers cannot cut below 1 mm cleanly.`,
			params: { mm: (s * r).toFixed(2) }
		});
	}(B, q, s, f), j.length > 0 && ("mm" === s.unit || s.groupByColor) && f.push({
		code: "gradient-spot-color",
		severity: "info",
		message: `${j.length} gradient fill${1 === j.length ? "" : "s"} won't reproduce on spot-color cutters/printers — turn off gradient detection for those outputs.`,
		params: { count: j.length }
	});
	const X = l.finish();
	return {
		svg: W,
		width: q,
		height: H,
		palette: K,
		stats: {
			pathCount: Q.pathCount,
			nodeCount: Q.nodeCount,
			colorCount: Q.colorCount,
			byteLength: Q.byteLength,
			durationMs: k() - i,
			stages: X
		},
		warnings: f,
		document: r?.withDocument ? Nn(B, j, q, H, s) : void 0
	};
}
function Wn(t) {
	return t.map((t) => Re(t.points));
}
function Qn(t, e, n, o) {
	const r = n?.stack;
	if (r) return o && On(o).stackHits++, r;
	o && On(o).stackMisses++;
	const s = function(t, e) {
		const n = Jn(t, e), o = new Int32Array(e.length).fill(-1);
		n.forEach((t, e) => o[t] = e);
		const r = function(t) {
			const { width: e, height: n, data: o } = t, r = e * n, s = new Uint8Array(r), i = new Int32Array(r), a = new Int32Array(r), l = [];
			for (let c = 0; c < r; c++) {
				if (1 === s[c] || o[c] < 0) continue;
				const t = o[c];
				let n = 0, f = 0;
				i[n++] = c, s[c] = 1;
				let h = !0, u = -2;
				for (; n > 0;) {
					const l = i[--n];
					a[f++] = l;
					const c = l - (l / e | 0) * e;
					if (0 === c) h = !1;
					else {
						const e = l - 1;
						o[e] === t ? 0 === s[e] && (s[e] = 1, i[n++] = e) : o[e] < 0 ? h = !1 : -2 === u ? u = o[e] : u !== o[e] && (h = !1);
					}
					if (c === e - 1) h = !1;
					else {
						const e = l + 1;
						o[e] === t ? 0 === s[e] && (s[e] = 1, i[n++] = e) : o[e] < 0 ? h = !1 : -2 === u ? u = o[e] : u !== o[e] && (h = !1);
					}
					if (l < e) h = !1;
					else {
						const r = l - e;
						o[r] === t ? 0 === s[r] && (s[r] = 1, i[n++] = r) : o[r] < 0 ? h = !1 : -2 === u ? u = o[r] : u !== o[r] && (h = !1);
					}
					if (l >= r - e) h = !1;
					else {
						const r = l + e;
						o[r] === t ? 0 === s[r] && (s[r] = 1, i[n++] = r) : o[r] < 0 ? h = !1 : -2 === u ? u = o[r] : u !== o[r] && (h = !1);
					}
				}
				h && u >= 0 && l.push({
					label: t,
					surround: u,
					pixels: a.slice(0, f)
				});
			}
			return l;
		}(t).filter((t) => {
			const e = o[t.surround] - o[t.label];
			return o[t.label] >= 0 && o[t.surround] >= 0 && e >= 2;
		});
		let s = t.data, i = n;
		if (r.length > 0) {
			const n = new Int32Array(t.data);
			for (const t of r) for (const e of t.pixels) n[e] = t.surround;
			const o = new Uint32Array(e.length);
			for (let t = 0; t < n.length; t++) {
				const e = n[t];
				e >= 0 && o[e]++;
			}
			s = n, i = Jn({
				width: t.width,
				height: t.height,
				data: n,
				count: t.count
			}, o);
		}
		const a = /* @__PURE__ */ new Map();
		for (const c of r) {
			let t = a.get(c.label);
			void 0 === t && (t = [], a.set(c.label, t));
			for (const e of c.pixels) t.push(e);
		}
		const l = [...a.keys()].toSorted((t, e) => t - e).map((t) => ({
			label: t,
			pixels: a.get(t)
		}));
		return {
			stackLabels: s,
			labelCount: e.length,
			order: i,
			islands: l
		};
	}(t, e);
	if (n) {
		for (const t of o?.palette?.values() ?? []) t !== n && (t.stack = void 0);
		n.stack = s;
	}
	return s;
}
const Xn = 255, Yn = 256, Gn = 255, Vn = 64;
function Jn(t, e) {
	const n = [];
	for (let o = 0; o < e.length; o++) e[o] > 0 && n.push(o);
	if (n.sort((t, n) => e[n] - e[t]), n.length > 1) {
		const e = function(t) {
			const { data: e, width: n, height: o } = t, r = new Float64Array(t.count);
			for (let s = 0; s < o; s++) for (let t = 0; t < n; t++) {
				const i = s * n + t, a = e[i];
				a < 0 || ((t + 1 >= n || e[i + 1] !== a) && r[a]++, (t - 1 < 0 || e[i - 1] !== a) && r[a]++, (s + 1 >= o || e[i + n] !== a) && r[a]++, (s - 1 < 0 || e[i - n] !== a) && r[a]++);
			}
			return r;
		}(t);
		let o = n[0], r = e[o];
		for (const t of n) e[t] > r && (r = e[t], o = t);
		const s = n.indexOf(o);
		s > 0 && (n.splice(s, 1), n.unshift(o));
	}
	return n;
}
function _n(t, e, n, o, r, s) {
	if (!s.gradients || null !== s.palette || "pixel" === s.curveMode) return;
	const i = s.gradientStrength, a = xt(t, e, {
		alpha: r ?? void 0,
		minArea: s.gradientMinArea > 0 ? s.gradientMinArea : Math.max(64, s.minRegionArea),
		maxBacktrack: .06 + .18 * i,
		minColorSpan: .09 - .08 * i,
		detectMaxDimension: s.gradientMaxDimension
	});
	if (!a.gradients.some((t) => null !== t)) return;
	const l = a.labels.count, c = n.slice(), f = new Uint8Array(3 * l);
	f.set(o.subarray(0, Math.min(o.length, 3 * l)));
	for (let h = n.length; h < l; h++) {
		const t = a.parentLabel[h];
		c.push(n[t]), f[3 * h] = o[3 * t], f[3 * h + 1] = o[3 * t + 1], f[3 * h + 2] = o[3 * t + 2];
	}
	return {
		gradients: a.gradients,
		underlays: a.underlays,
		labels: a.labels,
		paletteHex: c,
		paletteRgb: f
	};
}
function to(t) {
	const e = new Uint32Array(t.count);
	for (let n = 0; n < t.data.length; n++) {
		const o = t.data[n];
		o >= 0 && e[o]++;
	}
	return e;
}
function eo(t, e) {
	for (const n of e) t.includes(n) || t.push(n);
}
function no(t) {
	const e = t.length / 3 | 0, o = new Float32Array(3 * e);
	for (let r = 0; r < e; r++) {
		const [e, s, i] = n(t[3 * r] / 255, t[3 * r + 1] / 255, t[3 * r + 2] / 255);
		o[3 * r] = e, o[3 * r + 1] = s, o[3 * r + 2] = i;
	}
	return o;
}
function oo(t, e) {
	const [o, r, i] = function(t) {
		const { width: e, height: n, data: o } = t;
		if (e <= 0 || n <= 0) return [
			255,
			255,
			255
		];
		const r = /* @__PURE__ */ new Map(), s = (t) => {
			const e = 4 * t, n = o[e] << 16 | o[e + 1] << 8 | o[e + 2];
			r.set(n, (r.get(n) ?? 0) + 1);
		};
		for (let l = 0; l < e; l++) s(l);
		if (n > 1) for (let l = 0; l < e; l++) s((n - 1) * e + l);
		for (let l = 1; l < n - 1; l++) s(l * e), e > 1 && s(l * e + e - 1);
		let i = 0, a = -1;
		for (const [l, c] of r) c > a && (a = c, i = l);
		return [
			i >> 16 & 255,
			i >> 8 & 255,
			255 & i
		];
	}(t), [l, c, f] = n(o / 255, r / 255, i / 255);
	let h = -1, u = 1 / 0;
	for (let d = 0; d < e.length; d++) {
		const t = a(e[d]);
		if (!t) continue;
		const [o, r, i] = n(t[0] / 255, t[1] / 255, t[2] / 255), p = s(o, r, i, l, c, f);
		p < u && (u = p, h = d);
	}
	return h;
}
const ro = .35;
function so(t) {
	return Math.round(100 * t) / 100;
}
function io(t) {
	return [t.data.buffer, t.offsets.buffer];
}
function ao(t) {
	const e = new Int32Array(t.length + 1);
	let n = 0;
	for (let s = 0; s < t.length; s++) n += t[s].length, e[s + 1] = n;
	const o = new Float64Array(n);
	let r = 0;
	for (const s of t) o.set(s, r), r += s.length;
	return {
		data: o,
		offsets: e
	};
}
function lo(t, e) {
	const { data: n } = t, o = t.offsets[e + 1], r = [];
	let s = t.offsets[e];
	for (; s < o;) switch (n[s]) {
		case 0:
			r.push({
				type: "M",
				x: n[s + 1],
				y: n[s + 2]
			}), s += 3;
			break;
		case 1:
			r.push({
				type: "L",
				x: n[s + 1],
				y: n[s + 2]
			}), s += 3;
			break;
		case 2:
			r.push({
				type: "Q",
				x1: n[s + 1],
				y1: n[s + 2],
				x: n[s + 3],
				y: n[s + 4]
			}), s += 5;
			break;
		case 3:
			r.push({
				type: "C",
				x1: n[s + 1],
				y1: n[s + 2],
				x2: n[s + 3],
				y2: n[s + 4],
				x: n[s + 5],
				y: n[s + 6]
			}), s += 7;
			break;
		case 4:
			r.push({
				type: "A",
				rx: n[s + 1],
				ry: n[s + 2],
				rotation: n[s + 3],
				largeArc: 0 !== n[s + 4],
				sweep: 0 !== n[s + 5],
				x: n[s + 6],
				y: n[s + 7]
			}), s += 8;
			break;
		case 5:
			r.push({ type: "Z" }), s += 1;
			break;
		default: throw new Error(`unknown path command tag ${n[s]}`);
	}
	return r;
}
var co = class {
	slots;
	jobs = /* @__PURE__ */ new Map();
	nextJobId = 1;
	constructor(t) {
		this.slots = t.map((t) => ({
			endpoint: t,
			imageKey: null,
			stackKey: null,
			ringKey: null,
			chainKey: null
		}));
		for (let e = 0; e < this.slots.length; e++) {
			const t = this.slots[e];
			t.endpoint.addEventListener("message", (t) => {
				this.handleMessage(e, t.data);
			}), t.endpoint.start?.();
		}
	}
	get size() {
		return this.slots.length;
	}
	helperOf(t) {
		return t % this.slots.length;
	}
	setImage(t, e) {
		for (const n of this.slots) {
			if (n.imageKey === t) continue;
			const o = e.data.slice().buffer;
			this.send(n, {
				type: "helper-image",
				key: t,
				width: e.width,
				height: e.height,
				buffer: o
			}, [o]), n.imageKey = t;
		}
	}
	setStackPlan(t, e) {
		for (const n of this.slots) {
			if (n.stackKey === t) continue;
			const o = e.stackLabels.slice().buffer, r = e.order.slice().buffer, s = e.islandLabels.slice().buffer, i = e.islandPixels.slice().buffer, a = e.islandOffsets.slice().buffer;
			this.send(n, {
				type: "helper-stack",
				key: t,
				width: e.width,
				height: e.height,
				labelCount: e.labelCount,
				stackLabels: o,
				order: r,
				islandLabels: s,
				islandPixels: i,
				islandOffsets: a,
				turnPolicy: e.turnPolicy,
				minArea: e.minArea
			}, [
				o,
				r,
				s,
				i,
				a
			]), n.stackKey = t;
		}
	}
	setRingUnits(t, e) {
		for (let n = 0; n < this.slots.length; n++) {
			const o = this.slots[n];
			if (o.ringKey === t) continue;
			const r = [], s = [];
			for (let t = 0; t < e.rings.length; t++) this.helperOf(t) === n && (r.push(t), s.push(e.rings[t]));
			const i = ao(s), a = new Int32Array(r).buffer, l = e.coverage ? e.coverage.data.slice().buffer : void 0;
			this.send(o, {
				type: "helper-rings",
				key: t,
				width: e.width,
				height: e.height,
				units: a,
				rings: i,
				coverage: l
			}, [
				a,
				...io(i),
				...l ? [l] : []
			]), o.ringKey = t;
		}
	}
	setChains(t, e) {
		for (let n = 0; n < this.slots.length; n++) {
			const o = this.slots[n];
			if (o.chainKey === t) continue;
			const r = [], s = [], i = [], a = [], l = [];
			for (let t = 0; t < e.chains.length; t++) {
				if (this.helperOf(t) !== n) continue;
				const o = e.chains[t];
				r.push(t), s.push(o.points), i.push(o.left), a.push(o.right), l.push(o.loop ? 1 : 0);
			}
			const c = ao(s), f = new Int32Array(r).buffer, h = new Int32Array(i).buffer, u = new Int32Array(a).buffer, d = new Uint8Array(l).buffer;
			this.send(o, {
				type: "helper-chains",
				key: t,
				width: e.width,
				height: e.height,
				units: f,
				left: h,
				right: u,
				loop: d,
				points: c
			}, [
				f,
				h,
				u,
				d,
				...io(c)
			]), o.chainKey = t;
		}
	}
	async *dispatch(t) {
		if (0 === this.slots.length) throw new Error("helper pool is empty");
		const e = this.nextJobId++, n = {
			id: e,
			pending: /* @__PURE__ */ new Set(),
			results: /* @__PURE__ */ new Map(),
			error: null,
			wake: null
		};
		this.jobs.set(e, n);
		try {
			const o = this.slots.map(() => []);
			for (let e = 0; e < t.total; e++) o[this.helperOf(e)].push(e);
			for (let r = 0; r < this.slots.length; r++) {
				const s = o[r];
				if (0 === s.length) continue;
				n.pending.add(r);
				const i = t.paletteOklab ? t.paletteOklab.slice().buffer : void 0;
				this.send(this.slots[r], {
					type: "helper-job",
					id: e,
					kind: t.kind,
					units: s,
					stateKey: t.stateKey,
					curve: t.curve,
					batch: Math.max(1, t.batch ?? 1),
					meta: t.meta ? s.map(t.meta) : void 0,
					serialize: t.serialize,
					paletteOklab: i,
					arcPrecision: t.arcPrecision
				}, i ? [i] : void 0);
			}
			for (let e = 0; e < t.total; e++) {
				for (; !n.results.has(e);) {
					if (n.error) throw n.error;
					if (0 === n.pending.size) throw new Error(`helper pool: unit ${e} was never produced`);
					await new Promise((t) => n.wake = t);
				}
				const t = n.results.get(e);
				n.results.delete(e), yield t;
			}
		} finally {
			if (this.jobs.delete(e), n.pending.size > 0) for (const t of n.pending) this.send(this.slots[t], {
				type: "helper-cancel",
				id: e
			});
		}
	}
	cancel() {
		for (const t of this.jobs.values()) {
			t.error = new h();
			for (const e of t.pending) this.send(this.slots[e], {
				type: "helper-cancel",
				id: t.id
			});
			t.wake?.(), t.wake = null;
		}
	}
	send(t, e, n) {
		t.endpoint.postMessage(e, n);
	}
	handleMessage(t, e) {
		const n = this.jobs.get(e.id);
		if (n) {
			switch (e.type) {
				case "helper-batch": {
					let t = 0, o = 0;
					for (let r = 0; r < e.units.length; r++) {
						const s = e.counts[r], i = e.svgCounts?.[r] ?? s, a = new Array(s);
						for (let n = 0; n < s; n++) a[n] = lo(e.commands, t + n);
						const l = e.svg ? e.svg.slice(o, o + i) : void 0;
						t += s, o += i, n.results.set(e.units[r], {
							unit: e.units[r],
							shapes: a,
							svg: l
						});
					}
					break;
				}
				case "helper-done":
					n.pending.delete(t);
					break;
				case "helper-error": n.pending.delete(t), n.error ??= new Error(e.message);
			}
			n.wake?.(), n.wake = null;
		}
	}
};
(function(t) {
	const e = /* @__PURE__ */ new Set();
	let n = 0;
	const o = {};
	let r;
	const s = (e, n) => t.postMessage(e, n);
	t.addEventListener("message", (t) => {
		const i = t.data;
		if ("cancel" === i.type) return void e.add(i.id);
		if ("helpers" === i.type) return void (r = i.ports.length > 0 ? new co(i.ports) : void 0);
		if ("vectorize" !== i.type) return;
		const { id: a, width: l, height: c, buffer: f, settings: u, edgeHint: d, coverageHint: p, imageId: y, trace: g } = i;
		(async function(t, i, a, l, c, f, u, d) {
			try {
				const h = await En(i, a, {
					edgeHint: l,
					coverageHint: c,
					shouldCancel: () => e.has(t),
					onProgress: (e, o) => {
						const r = Date.now();
						(o >= 1 || r - n > 40) && (n = r, s({
							type: "progress",
							id: t,
							stage: e,
							overall: o
						}));
					},
					onTrace: u ? (e) => {
						return s({
							type: "trace-step",
							id: t,
							step: e
						}, (n = e.rasters) ? n.map((t) => t.data.buffer) : []);
						var n;
					} : void 0
				}, {
					imageId: f,
					cache: o,
					withDocument: d,
					helpers: r
				});
				e.has(t) ? s({
					type: "error",
					id: t,
					message: "cancelled",
					cancelled: !0
				}) : s({
					type: "result",
					id: t,
					result: h
				});
			} catch (p) {
				const e = p instanceof h;
				s({
					type: "error",
					id: t,
					message: e ? "cancelled" : p instanceof Error ? p.message : String(p),
					cancelled: e
				});
			} finally {
				e.delete(t);
			}
		})(a, {
			width: l,
			height: c,
			data: new Uint8ClampedArray(f)
		}, u, d ? {
			width: l,
			height: c,
			data: new Float32Array(d)
		} : void 0, p ? {
			width: l,
			height: c,
			data: new Float32Array(p)
		} : void 0, y, g, i.withDocument);
	});
})(self);
