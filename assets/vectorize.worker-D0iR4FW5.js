function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function e(t) {
	return t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
}
function n(e, n, o) {
	const r = t(e), s = t(n), a = t(o), i = Math.cbrt(.4122214708 * r + .5363325363 * s + .0514459929 * a), l = Math.cbrt(.2119034982 * r + .6806995451 * s + .1073969566 * a), c = Math.cbrt(.0883024619 * r + .2817188376 * s + .6299787005 * a);
	return [
		.2104542553 * i + .793617785 * l - .0040720468 * c,
		1.9779984951 * i - 2.428592205 * l + .4505937099 * c,
		.0259040371 * i + .7827717662 * l - .808675766 * c
	];
}
function o(t, n, o) {
	const s = t + .3963377774 * n + .2158037573 * o, a = t - .1055613458 * n - .0638541728 * o, i = t - .0894841775 * n - 1.291485548 * o, l = s * s * s, c = a * a * a, f = i * i * i, h = -1.2684380046 * l + 2.6097574011 * c - .3413193965 * f, u = -.0041960863 * l - .7034186147 * c + 1.707614701 * f;
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
	const a = t - o, i = e - r, l = n - s;
	return a * a + i * i + l * l;
}
function a(t, e, n, o, r, a) {
	return Math.sqrt(s(t, e, n, o, r, a));
}
function i(t) {
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
	const [r, s, a] = o(t, e, n);
	return c(255 * r, 255 * s, 255 * a);
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
		const e = t[s], a = t[s + 1];
		n += o * a - e * r, o = e, r = a;
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
	const a = r - n, i = s - o, l = a * a + i * i;
	if (0 === l) return Math.hypot(t - n, e - o);
	let c = ((t - n) * a + (e - o) * i) / l;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (n + c * a), e - (o + c * i));
}
function y(t, e, n, o, r, s) {
	const a = t - n, i = e - o, l = r - n, c = s - o, f = Math.hypot(a, i), h = Math.hypot(l, c);
	if (0 === f || 0 === h) return 180;
	let u = (a * l + i * c) / (f * h);
	return u = u < -1 ? -1 : u > 1 ? 1 : u, 180 * Math.acos(u) / Math.PI;
}
function g(t, e, n, o) {
	const r = t * n + e * o, s = Math.hypot(t, e) * Math.hypot(n, o);
	let a = Math.acos(Math.min(1, Math.max(-1, 0 === s ? 1 : r / s)));
	return t * o - e * n < 0 && (a = -a), a;
}
function m(t, e, n) {
	let o = Math.abs(n.rx), r = Math.abs(n.ry);
	if (0 === o || 0 === r) return null;
	const s = n.rotation * Math.PI / 180, a = Math.cos(s), i = Math.sin(s), l = (t - n.x) / 2, c = (e - n.y) / 2, f = a * l + i * c, h = -i * l + a * c, u = f * f / (o * o) + h * h / (r * r);
	if (u > 1) {
		const t = Math.sqrt(u);
		o *= t, r *= t;
	}
	const d = o * o * r * r - o * o * h * h - r * r * f * f, p = o * o * h * h + r * r * f * f;
	let y = p <= 0 ? 0 : Math.sqrt(Math.max(0, d) / p);
	n.largeArc === n.sweep && (y = -y);
	const m = y * (o * h) / r, w = r * f * -y / o, M = a * m - i * w + (t + n.x) / 2, x = i * m + a * w + (e + n.y) / 2, b = g(1, 0, (f - m) / o, (h - w) / r);
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
	precision: 1,
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
	const n = t / e, o = Math.ceil(n) + 1, r = new Int32Array(e), s = new Int32Array(e), a = new Float64Array(e * o);
	for (let i = 0; i < e; i++) {
		const e = i * n, l = (i + 1) * n, c = Math.floor(e), f = Math.min(t, Math.ceil(l));
		r[i] = c;
		let h = 0, u = 0;
		for (let t = c; t < f; t++) {
			const n = Math.min(t + 1, l) - Math.max(t, e), r = n > 0 ? n : 0;
			a[i * o + h] = r, u += r, h++;
		}
		if (s[i] = h, u > 0) {
			const t = 1 / u;
			for (let e = 0; e < h; e++) a[i * o + e] *= t;
		}
	}
	return {
		start: r,
		count: s,
		weight: a,
		stride: o
	};
}
function F(t, e) {
	const { width: n, height: o, data: r } = t;
	if (e <= 0 || Math.max(n, o) <= e) return t;
	const s = e / Math.max(n, o), a = Math.max(1, Math.round(n * s)), i = Math.max(1, Math.round(o * s)), l = $(n, a), c = l.start, f = l.count, h = l.weight, u = l.stride, d = new Float32Array(a * o * 4);
	for (let x = 0; x < o; x++) {
		const t = x * n * 4, e = x * a * 4;
		for (let n = 0; n < a; n++) {
			const o = n * u, s = f[n], a = t + 4 * c[n];
			let i = 0, l = 0, p = 0, y = 0;
			for (let t = 0; t < s; t++) {
				const e = h[o + t], n = a + 4 * t;
				i += r[n] * e, l += r[n + 1] * e, p += r[n + 2] * e, y += r[n + 3] * e;
			}
			const g = e + 4 * n;
			d[g] = i, d[g + 1] = l, d[g + 2] = p, d[g + 3] = y;
		}
	}
	const p = $(o, i), y = p.start, g = p.count, m = p.weight, w = p.stride, M = new Uint8ClampedArray(a * i * 4);
	for (let x = 0; x < i; x++) {
		const t = x * w, e = g[x], n = x * a * 4;
		for (let o = 0; o < a; o++) {
			const r = 4 * o;
			let s = 0, i = 0, l = 0, c = 0;
			for (let n = 0; n < e; n++) {
				const e = m[t + n], o = (y[x] + n) * a * 4 + r;
				s += d[o] * e, i += d[o + 1] * e, l += d[o + 2] * e, c += d[o + 3] * e;
			}
			const f = n + r;
			M[f] = Math.round(s), M[f + 1] = Math.round(i), M[f + 2] = Math.round(l), M[f + 3] = Math.round(c);
		}
	}
	return {
		width: a,
		height: i,
		data: M
	};
}
function S(t, e, n) {
	const { width: o, height: r, data: s } = t;
	if (e <= 0 || n <= 0) throw new RangeError("resize target must be positive");
	if (e === o && n === r) return {
		width: e,
		height: n,
		data: new Float32Array(s)
	};
	const a = new Float32Array(e * n), i = o / e, l = r / n;
	for (let c = 0; c < n; c++) {
		const t = I((c + .5) * l - .5, r - 1), n = Math.floor(t), f = Math.min(r - 1, n + 1), h = t - n;
		for (let r = 0; r < e; r++) {
			const t = I((r + .5) * i - .5, o - 1), l = Math.floor(t), u = Math.min(o - 1, l + 1), d = t - l, p = s[n * o + l] + (s[n * o + u] - s[n * o + l]) * d, y = s[f * o + l] + (s[f * o + u] - s[f * o + l]) * d;
			a[c * e + r] = p + (y - p) * h;
		}
	}
	return {
		width: e,
		height: n,
		data: a
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
	const { width: r, height: s, data: a } = t, i = new Uint8ClampedArray(a.length);
	for (let l = 0; l < a.length; l += 4) {
		const t = a[l + 3];
		if (255 === t) i[l] = a[l], i[l + 1] = a[l + 1], i[l + 2] = a[l + 2];
		else {
			const r = 255 - t;
			i[l] = Math.round((a[l] * t + e * r) / 255), i[l + 1] = Math.round((a[l + 1] * t + n * r) / 255), i[l + 2] = Math.round((a[l + 2] * t + o * r) / 255);
		}
		i[l + 3] = 255;
	}
	return {
		width: r,
		height: s,
		data: i
	};
}
const P = (() => {
	const e = /* @__PURE__ */ new Float64Array(256);
	for (let n = 0; n < 256; n++) e[n] = t(n / 255);
	return e;
})();
function R(t) {
	const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(3 * r);
	for (let a = 0, i = 0, l = 0; a < r; a++, i += 4, l += 3) {
		const t = P[o[i]], e = P[o[i + 1]], n = P[o[i + 2]], r = Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n), a = Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n), c = Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
		s[l] = .2104542553 * r + .793617785 * a - .0040720468 * c, s[l + 1] = 1.9779984951 * r - 2.428592205 * a + .4505937099 * c, s[l + 2] = .0259040371 * r + .7827717662 * a - .808675766 * c;
	}
	return s;
}
const z = .88, U = 1e-5, T = 32, q = .15, B = 32768;
function H(t, e) {
	const n = t[e];
	if (n < 3) return null;
	const o = 1 / n, r = t[e + 1] * o, s = t[e + 2] * o, a = t[e + 3] * o - r * r, i = t[e + 4] * o - r * s, l = t[e + 5] * o - s * s, c = a * l - i * i;
	if (c <= 1e-9) return null;
	const f = l / c, h = -i / c, u = a / c;
	let d = 0, p = 0, y = 0;
	for (let v = 0; v < 3; v++) {
		const n = t[e + 6 + v] * o, a = t[e + 12 + 2 * v] * o - r * n, i = t[e + 13 + 2 * v] * o - s * n, l = f * a + h * i, c = h * a + u * i;
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
	const a = Math.hypot(o, r, s);
	if (a < 1e-6) return 1;
	o /= a, r /= a, s /= a;
	let i = 0, l = 0;
	for (let f = 1; f < t.length; f++) {
		const e = (t[f][0] - t[f - 1][0]) * o + (t[f][1] - t[f - 1][1]) * r + (t[f][2] - t[f - 1][2]) * s;
		e >= 0 ? i += e : l -= e;
	}
	const c = i + l;
	return c > 1e-9 ? l / c : 0;
}
function K(t, e, n) {
	const o = e.slice(), r = n.map((t) => t.slice());
	for (let s = 0; s < t; s++) {
		let e = s, n = Math.abs(o[s * t + s]);
		for (let r = s + 1; r < t; r++) {
			const a = Math.abs(o[r * t + s]);
			a > n && (n = a, e = r);
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
		const a = o[s * t + s];
		for (let r = 0; r < t; r++) o[s * t + r] /= a;
		for (const t of r) t[s] /= a;
		for (let i = 0; i < t; i++) {
			if (i === s) continue;
			const e = o[i * t + s];
			if (0 !== e) {
				for (let n = 0; n < t; n++) o[i * t + n] -= e * o[s * t + n];
				for (const t of r) t[i] -= e * t[s];
			}
		}
	}
	return r;
}
function O(t, e) {
	const n = t[e];
	if (n < 6) return null;
	const o = 1 / n, r = t[e + 1], s = t[e + 2], a = t[e + 3], i = t[e + 4], l = t[e + 5], c = a + l, f = t[e + 22] + 2 * t[e + 23] + t[e + 24], h = t[e + 18] + t[e + 20], u = t[e + 19] + t[e + 21], d = [
		f,
		h,
		u,
		c,
		h,
		a,
		i,
		r,
		u,
		i,
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
	for (let F = 0; F < 3; F++) {
		const [n, r, s, a] = y[F];
		g += n * n, m += n * r, w += n * s;
		const i = p[F], l = t[e + 6 + F], c = t[e + 9 + F];
		M += Math.max(0, c - (n * i[0] + r * i[1] + s * i[2] + a * i[3])), x += c - l * l * o;
	}
	if (g < 1e-12) return null;
	if (x < 1e-9) return null;
	const b = -m / (2 * g), A = -w / (2 * g), k = r * o, v = s * o, I = Math.sqrt(Math.max(a * o - k * k, 1e-9)), $ = Math.sqrt(Math.max(l * o - v * v, 1e-9));
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
	for (const i of e) o += i, i > r && (r = i), s.push(o);
	if (o <= 0 || r > .5 * o) return -1;
	if (r > .04 && r > 4 * o / e.length) return -1;
	const a = t[t.length - 1] - t[0];
	return a < 1e-9 || (E(t, s, .9 * o) - E(t, s, .1 * o)) / a < n ? -1 : o;
}
function Q(t, e, n) {
	const o = [0, t.length - 1];
	for (; o.length < 8;) {
		let r = e, s = -1, a = -1;
		for (let e = 0; e < o.length - 1; e++) {
			const i = o[e], l = o[e + 1], c = t[l] - t[i];
			for (let o = i + 1; o < l; o++) {
				const f = n(o, i, l, c > 1e-9 ? (t[o] - t[i]) / c : 0);
				f > r && (r = f, s = o, a = e + 1);
			}
		}
		if (s < 0) break;
		o.splice(a, 0, s);
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
	const s = t.slice(), a = (t, n) => {
		for (let o = 0; o < e; o++) s[n * e + o] += s[t * e + o];
		s[t * e] = 0;
	};
	let i = o;
	for (; i > 0 && s[(i - 1) * e] > 0;) i--;
	let l = r;
	for (; l + 1 < T && s[(l + 1) * e] > 0;) l++;
	for (let c = 0; c < i; c++) s[c * e] = 0;
	for (let c = l + 1; c < T; c++) s[c * e] = 0;
	for (let c = i; c < o; c++) a(c, o);
	for (let c = r + 1; c <= l; c++) a(c, r);
	return {
		bins: s,
		first: o,
		last: r,
		lo: i / T,
		hi: (l + 1) / T
	};
}
function J(t, e, n, r, s) {
	let i = 0;
	for (let o = 0; o < T; o++) t[12 * o] > i && (i = t[12 * o]);
	const l = i * q, h = V(t, 12, l);
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
	if (a(A[0], A[1], A[2], k[0], k[1], k[2]) < r) return null;
	const v = [];
	for (let o = 1; o < b; o++) {
		const t = M[o - 1], e = M[o];
		v.push(a(t[0], t[1], t[2], e[0], e[1], e[2]));
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
		const a = t.map((t) => (t[0] - n[0]) * r[0] + (t[1] - n[1]) * r[1] + (t[2] - n[2]) * r[2]), i = a.slice();
		X(i);
		for (let l = 0; l < e; l++) {
			const e = i[l] - a[l];
			0 !== e && (t[l] = [
				t[l][0] + e * r[0],
				t[l][1] + e * r[1],
				t[l][2] + e * r[2]
			]);
		}
	})(M);
	const I = Q(w, .01, (t, e, n, o) => {
		const r = M[e][0] + (M[n][0] - M[e][0]) * o, s = M[e][1] + (M[n][1] - M[e][1]) * o, i = M[e][2] + (M[n][2] - M[e][2]) * o;
		return a(M[t][0], M[t][1], M[t][2], r, s, i);
	});
	if (j(I.map((t) => M[t])) > n) return null;
	const $ = new Float64Array(4 * b), F = new Float64Array(4 * b);
	for (let a = 0; a < b; a++) {
		const [t, e, n] = o(M[a][0], M[a][1], M[a][2]);
		$[4 * a] = w[a], $[4 * a + 1] = M[a][0], $[4 * a + 2] = M[a][1], $[4 * a + 3] = M[a][2], F[4 * a] = w[a], F[4 * a + 1] = t, F[4 * a + 2] = e, F[4 * a + 3] = n;
	}
	const S = I.length;
	let C = !1;
	const L = [];
	for (let o = 0; o < S; o++) {
		const t = I[o], n = x[t], r = u[n];
		let s = u[n + 7], a = w[t], i = M[t][0], l = M[t][1], h = M[t][2];
		const d = 0 === o && a > 0 ? 0 : o === S - 1 && a < 1 ? 1 : -1;
		if (d >= 0 && b > 1) {
			const e = 0 === o ? t + 1 : t - 1, n = G(w, t, e, d);
			i += (M[e][0] - i) * n, l += (M[e][1] - l) * n, h += (M[e][2] - h) * n;
			const c = x[e];
			s = r * (s / r + (u[c + 7] / u[c] - s / r) * n), a = d;
		}
		const p = null === e.alpha || s >= r - 1e-9 ? void 0 : Y(s / r);
		if (void 0 === p) {
			L.push({
				offset: a,
				color: f(i, l, h)
			});
			continue;
		}
		C = !0;
		const y = u[n + 7], g = y > 1e-9 ? c(u[n + 8] / y, u[n + 9] / y, u[n + 10] / y) : f(i, l, h);
		L.push({
			offset: a,
			color: g,
			opacity: p
		});
	}
	return {
		stops: L,
		fineLab: $,
		fineRgb: F,
		translucent: C,
		lo: g,
		hi: y
	};
}
function _(t, e, n, o, r, s) {
	let i = 0;
	for (let a = 0; a < T; a++) t[6 * a] > i && (i = t[6 * a]);
	const l = i * q, c = V(t, 6, l);
	if (!c) return null;
	const { bins: f, first: h, last: u, hi: d } = c, p = s ? 0 : c.lo, y = 1 / (d - p), g = [], m = [], w = [];
	for (let a = h; a <= u; a++) {
		const t = 6 * a, e = f[t];
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
	if (a(x[0], x[1], x[2], b[0], b[1], b[2]) < r) return null;
	const A = [];
	for (let a = 1; a < M; a++) A.push(Math.abs(m[a] - m[a - 1]));
	const k = W(g, A, 0);
	if (k < 0) return null;
	const v = m[M - 1] >= m[0] ? 1 : -1;
	let I = 0;
	for (let a = 1; a < M; a++) {
		const t = (m[a] - m[a - 1]) * v;
		t < 0 && (I -= t);
	}
	if (I / k > n) return null;
	if (v < 0) for (let a = 0; a < M; a++) m[a] = -m[a];
	if (X(m), v < 0) for (let a = 0; a < M; a++) m[a] = -m[a];
	const $ = Q(g, .02, (t, e, n, o) => Math.abs(m[t] - (m[e] + (m[n] - m[e]) * o))), F = $.length, S = [];
	for (let a = 0; a < F; a++) {
		const t = $[a];
		let n = g[t], o = m[t];
		const r = 0 === a && n > 0 ? 0 : a === F - 1 && n < 1 ? 1 : -1;
		if (r >= 0 && M > 1) {
			const e = 0 === a ? t + 1 : t - 1;
			o += (m[e] - o) * G(g, t, e, r), n = r;
		}
		const s = Y(o);
		S.push(void 0 === s ? {
			offset: n,
			color: e
		} : {
			offset: n,
			color: e,
			opacity: s
		});
	}
	const C = S[0], L = S[F - 1], P = (C.opacity ?? 1) <= (L.opacity ?? 1) ? C : L;
	return (P.opacity ?? 1) < .25 && (P.opacity = 0), {
		stops: S,
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
	const a = 4 * (s - 1), i = 4 * s, l = t[i] - t[a], c = l > 1e-12 ? (e - t[a]) / l : 0;
	n[0] = t[a + 1] + (t[i + 1] - t[a + 1]) * c, n[1] = t[a + 2] + (t[i + 2] - t[a + 2]) * c, n[2] = t[a + 3] + (t[i + 3] - t[a + 3]) * c;
}
function et(t, e, n) {
	const o = [];
	for (let r = 0; r < T; r++) {
		const s = 6 * r;
		if (t[s] <= 0) continue;
		const a = t[s + 2] / t[s];
		a < e || a > n || o.push((a - e) / (n - e), Math.min(1, Math.max(0, t[s + 1] / t[s])));
	}
	return Float64Array.from(o);
}
function nt(t, e) {
	const n = t.length / 2;
	if (e <= t[0] || 1 === n) return t[1];
	if (e >= t[2 * (n - 1)]) return t[2 * (n - 1) + 1];
	let o = 1;
	for (; t[2 * o] < e;) o++;
	const r = 2 * (o - 1), s = t[2 * o] - t[r], a = s > 1e-12 ? (e - t[r]) / s : 0;
	return t[r + 1] + (t[2 * o + 1] - t[r + 1]) * a;
}
function ot(t, e, n) {
	let o;
	if ("linear" === t.kind) {
		const r = t.x2 - t.x1, s = t.y2 - t.y1, a = r * r + s * s;
		o = a > 1e-12 ? ((e - t.x1) * r + (n - t.y1) * s) / a : 0;
	} else o = t.r > 1e-12 ? Math.hypot(e - t.cx, n - t.cy) / t.r : 0;
	return o < 0 ? 0 : o > 1 ? 1 : o;
}
function rt(t, e, n, o) {
	const r = 12 * at(e), s = 3 * o, a = n.ok[s], i = n.ok[s + 1], l = n.ok[s + 2];
	if (t[r] += 1, t[r + 1] += a, t[r + 2] += i, t[r + 3] += l, t[r + 4] += a * a, t[r + 5] += i * i, t[r + 6] += l * l, t[r + 11] += e, null === n.alpha) return void (t[r + 7] += 1);
	const c = n.alpha[o] / 255, f = 4 * o, h = 255 * (1 - c);
	t[r + 7] += c, t[r + 8] += n.rgb[f] - h, t[r + 9] += n.rgb[f + 1] - h, t[r + 10] += n.rgb[f + 2] - h;
}
function st(t, e, n, o, r) {
	const s = 6 * at(e);
	t[s] += 1, t[s + 1] += n, t[s + 2] += e, t[s + 3] += o[r], t[s + 4] += o[r + 1], t[s + 5] += o[r + 2];
}
function at(t) {
	const e = Math.floor(t * T);
	return e < 0 ? 0 : e >= T ? 31 : e;
}
function it(e, n, o, r) {
	const s = t(e), a = t(n), i = t(o), l = Math.cbrt(.4122214708 * s + .5363325363 * a + .0514459929 * i), c = Math.cbrt(.2119034982 * s + .6806995451 * a + .1073969566 * i), f = Math.cbrt(.0883024619 * s + .2817188376 * a + .6299787005 * i);
	r[0] = .2104542553 * l + .793617785 * c - .0040720468 * f, r[1] = 1.9779984951 * l - 2.428592205 * c + .4505937099 * f, r[2] = .0259040371 * l + .7827717662 * c - .808675766 * f;
}
function lt(t, e, n) {
	const o = t[e] - n[0], r = t[e + 1] - n[1], s = t[e + 2] - n[2];
	return o * o + r * r + s * s;
}
function ct(t, e) {
	let n = Math.max(1, Math.ceil(t / B));
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
	const s = .0064, a = at(n);
	t.binN[a]++, o > s && t.binOutliers[a]++;
	const i = o > s ? s : o, l = r > s ? s : r;
	t.sse += i, t.flatSse += l, t.perMember[e] += i, t.perMemberFlat[e] += l;
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
		if (!(s <= 0)) for (let a = 0; a < 3; a++) n[3 * o + a] = t[r + 6 + a] / s;
	}), n;
}
function yt(t, e, n, o) {
	const r = t[e] - n[3 * o], s = t[e + 1] - n[3 * o + 1], a = t[e + 2] - n[3 * o + 2];
	return r * r + s * s + a * a;
}
function gt(t, e, n) {
	const { m: o, sacc: r, offset: s, bucket: a, width: i, ok: l } = t;
	N(o, e, r);
	const c = r[0];
	if (c < 3) return null;
	if (Z(o, e) < U) return null;
	const f = H(r, 0), h = O(r, 0), u = null !== f && f.directionality >= z, d = D(h);
	if (!u && !d) return null;
	const p = u ? f.dx : 0, y = u ? f.dy : 0, g = d ? h.cx : 0, m = d ? h.cy : 0, w = ct(c, i);
	let M = 1 / 0, x = -1 / 0, b = 0;
	for (const z of e) for (let t = s[z], e = s[z + 1]; t < e; t += w) {
		const e = a[t], n = e % i + .5, o = (e - e % i) / i + .5;
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
		const n = a[e], o = n % i + .5, r = (n - n % i) / i + .5;
		I && rt(I, (p * o + y * r - M) / A, t, n), $ && rt($, Math.hypot(o - g, r - m) / b, t, n);
	}
	const F = n ? t.minColorSpan : 0, S = I ? J(I, t, t.maxBacktrack, F, !1) : null, C = $ ? J($, t, 1, F, !0) : null;
	if (!S && !C) return null;
	const L = S ? S.lo : 0, P = S ? 1 / (S.hi - S.lo) : 1, R = C ? 1 / C.hi : 1, q = t.lab, B = ht(e.length), j = ht(e.length), E = new Float64Array(e.length), W = pt(o, e);
	let Q = 0;
	const X = S ? /* @__PURE__ */ new Float64Array(544) : null, Y = 1 / c, G = r[1] * Y, V = r[2] * Y, _ = -y * G + p * V, et = r[3] * Y - G * G, nt = r[4] * Y - G * V, ot = r[5] * Y - V * V, st = Math.sqrt(Math.max(1e-9, y * y * et - 2 * p * y * nt + p * p * ot));
	for (let z = 0; z < e.length; z++) {
		const t = e[z];
		for (let e = s[t], n = s[t + 1]; e < n; e += w) {
			const t = a[e], n = t % i + .5, o = (t - t % i) / i + .5, r = 3 * t;
			E[z]++, Q++;
			const s = yt(l, r, W, z);
			if (S && X) {
				const t = Math.min(1, Math.max(0, ((p * n + y * o - M) / A - L) * P));
				tt(S.fineLab, t, q), ut(B, z, t, lt(l, r, q), s);
				const e = (-y * n + p * o - _) / st, a = 17 * at(t), i = e * e;
				X[a] += 1, X[a + 1] += e, X[a + 2] += i, X[a + 3] += i * e, X[a + 4] += i * i;
				for (let n = 0; n < 3; n++) {
					const t = l[r + n] - q[n];
					X[a + 5 + 4 * n] += t, X[a + 6 + 4 * n] += e * t, X[a + 7 + 4 * n] += i * t, X[a + 8 + 4 * n] += t * t;
				}
			}
			if (C) {
				const t = Math.min(1, Math.hypot(n - g, o - m) / b * R);
				tt(C.fineLab, t, q), ut(j, z, t, lt(l, r, q), s);
			}
		}
	}
	let it = null;
	const ft = null !== X && function(t) {
		let e = 0, n = 0, o = 0;
		for (let r = 0; r < T; r++) {
			const s = 17 * r, a = t[s];
			if (a < 12) continue;
			o += a;
			const i = [
				a,
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
			]), c = K(3, i, l);
			for (let o = 0; o < 3; o++) {
				const r = l[o];
				if (n += t[s + 8 + 4 * o], !c) continue;
				const i = c[o][0] * r[0] + c[o][1] * r[1] + c[o][2] * r[2] - r[0] * r[0] / a;
				i > 0 && (e += i);
			}
		}
		return n <= 4e-4 * o ? 0 : n > 0 ? e / n : 0;
	}(X) <= .25;
	if (S && ft && dt(B, Q, E)) {
		const t = r[1] / c, e = r[2] / c, n = p * t + y * e, o = M + S.lo * A, s = M + S.hi * A;
		it = {
			residual: B.abs / Q,
			fineLab: S.fineLab,
			fineRgb: S.fineRgb,
			translucent: S.translucent,
			paint: {
				kind: "linear",
				x1: t + (o - n) * p,
				y1: e + (o - n) * y,
				x2: t + (s - n) * p,
				y2: e + (s - n) * y,
				stops: S.stops
			}
		};
	}
	return C && dt(j, Q, E) && (null === it || j.abs < B.abs) && (it = {
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
	}), it;
}
function mt(t, e, n, o) {
	const { m: r, sacc: s, offset: a, bucket: i, width: l, ok: f, rgb: h, lab: u, sBc: d, sPx: p, sPy: y, sAl: g } = t;
	N(r, e, s);
	const m = s[0];
	if (m < 6) return null;
	if (Z(r, e) < U) return null;
	const w = n.paint, M = ct(m, l), x = 1 / 255;
	let b = 0, A = 0, k = 0, v = 0, I = 0, $ = 0, F = 0, S = 0, C = 0, L = -1;
	const P = /* @__PURE__ */ new Float64Array(3);
	let R = 0;
	for (const c of e) for (let t = a[c], e = a[c + 1]; t < e; t += M) {
		const e = i[t], o = e % l + .5, r = (e - e % l) / l + .5;
		tt(n.fineRgb, ot(w, o, r), u), p[R] = o, y[R] = r, d[3 * R] = u[0], d[3 * R + 1] = u[1], d[3 * R + 2] = u[2], R++;
		const s = 4 * e, a = h[s] * x - u[0], c = h[s + 1] * x - u[1], f = h[s + 2] * x - u[2], g = a * a + c * c + f * f;
		g > L && (L = g, P[0] = h[s] * x, P[1] = h[s + 1] * x, P[2] = h[s + 2] * x);
		const m = g * (g - a * a), M = g * -a * c, z = g * -a * f, U = g * (g - c * c), T = g * -c * f, q = g * (g - f * f);
		b += m, A += M, k += z, v += U, I += T, $ += q, F += m * u[0] + M * u[1] + z * u[2], S += M * u[0] + U * u[1] + T * u[2], C += z * u[0] + T * u[1] + q * u[2];
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
			F + t * P[0],
			S + t * P[1],
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
		for (const r of e) for (let e = a[r], s = a[r + 1]; e < s; e += M) {
			const r = i[e];
			u[0] = d[3 * o], u[1] = d[3 * o + 1], u[2] = d[3 * o + 2], o++;
			const s = 4 * r, a = Math.min(1, Math.max(0, q(s)));
			t += a * a;
			for (let t = 0; t < 3; t++) n[t] += a * (h[s + t] * x - (1 - a) * u[t]);
		}
		if (t <= 1e-9) return null;
		for (let e = 0; e < 3; e++) P[e] = n[e] / t;
	}
	for (let c = 0; c < 3; c++) P[c] = P[c] < 0 ? 0 : P[c] > 1 ? 1 : P[c];
	const B = c(255 * P[0], 255 * P[1], 255 * P[2]), j = /* @__PURE__ */ new Float64Array(28);
	for (let c = 0; c < 6; c++) j[c] = s[c];
	for (let c = 18; c < 25; c++) j[c] = s[c];
	let E = 0;
	for (const c of e) for (let t = a[c], e = a[c + 1]; t < e; t += M) {
		const e = i[t], n = p[E], o = y[E];
		u[0] = d[3 * E], u[1] = d[3 * E + 1], u[2] = d[3 * E + 2];
		const r = q(4 * e);
		g[E] = r, E++, j[6] += r, j[9] += r * r, j[12] += r * n, j[13] += r * o, j[25] += r * (n * n + o * o);
	}
	if (M > 1) {
		const t = M;
		j[6] *= t, j[9] *= t, j[12] *= t, j[13] *= t, j[25] *= t;
	}
	const W = H(j, 0), Q = O(j, 0), X = null !== W && W.directionality >= z, Y = D(Q);
	if (!X && !Y) return null;
	const G = X ? W.dx : 0, V = X ? W.dy : 0, J = Y ? Q.cx : 0, rt = Y ? Q.cy : 0;
	let at = 1 / 0, ft = -1 / 0, gt = 0;
	for (let c = 0; c < R; c++) {
		const t = p[c], e = y[c];
		if (X) {
			const n = G * t + V * e;
			n < at && (at = n), n > ft && (ft = n);
		}
		if (Y) {
			const n = Math.hypot(t - J, e - rt);
			n > gt && (gt = n);
		}
	}
	const mt = ft - at, wt = X && mt > 1e-6, Mt = Y && gt > 1e-6;
	if (!wt && !Mt) return null;
	const xt = wt ? /* @__PURE__ */ new Float64Array(192) : null, bt = Mt ? /* @__PURE__ */ new Float64Array(192) : null;
	let At = 0;
	for (const c of e) for (let t = a[c], e = a[c + 1]; t < e; t += M) {
		const e = i[t], n = p[At], o = y[At], r = g[At];
		At++, xt && st(xt, (G * n + V * o - at) / mt, r, f, 3 * e), bt && st(bt, Math.hypot(n - J, o - rt) / gt, r, f, 3 * e);
	}
	const kt = o ? .2 : 0, vt = o ? t.minColorSpan : 0, It = xt ? _(xt, B, t.maxBacktrack, kt, vt, !1) : null, $t = bt ? _(bt, B, 1, kt, vt, !0) : null;
	if (!It && !$t) return null;
	const Ft = It?.stops ?? null, St = $t?.stops ?? null, Ct = xt && It ? et(xt, It.lo, It.hi) : null, Lt = bt && $t ? et(bt, 0, $t.hi) : null, Pt = It ? It.lo : 0, Rt = It ? 1 / (It.hi - It.lo) : 1, zt = $t ? 1 / $t.hi : 1, Ut = ht(e.length), Tt = ht(e.length), qt = new Float64Array(e.length), Bt = pt(r, e), Ht = /* @__PURE__ */ new Float64Array(3);
	let jt = 0;
	for (let c = 0; c < e.length; c++) {
		const t = e[c];
		for (let e = a[t], n = a[t + 1]; e < n; e += M) {
			const t = i[e], n = p[jt], o = y[jt];
			u[0] = d[3 * jt], u[1] = d[3 * jt + 1], u[2] = d[3 * jt + 2], jt++;
			const r = 3 * t;
			qt[c]++;
			const s = yt(f, r, Bt, c);
			if (Ct) {
				const t = Math.min(1, Math.max(0, ((G * n + V * o - at) / mt - Pt) * Rt)), e = nt(Ct, t);
				it(u[0] + e * (P[0] - u[0]), u[1] + e * (P[1] - u[1]), u[2] + e * (P[2] - u[2]), Ht), ut(Ut, c, t, lt(f, r, Ht), s);
			}
			if (Lt) {
				const t = Math.min(1, Math.hypot(n - J, o - rt) / gt * zt), e = nt(Lt, t);
				it(u[0] + e * (P[0] - u[0]), u[1] + e * (P[1] - u[1]), u[2] + e * (P[2] - u[2]), Ht), ut(Tt, c, t, lt(f, r, Ht), s);
			}
		}
	}
	const Kt = /* @__PURE__ */ new Float64Array(0);
	let Ot = null;
	if (Ft && It && dt(Ut, R, qt)) {
		const t = s[1] / m, e = s[2] / m, n = G * t + V * e, o = at + It.lo * mt, r = at + It.hi * mt;
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
				stops: Ft
			}
		};
	}
	return St && $t && dt(Tt, R, qt) && (null === Ot || Tt.abs < Ut.abs) && (Ot = {
		residual: Tt.abs / R,
		fineLab: Kt,
		fineRgb: Kt,
		translucent: !0,
		paint: {
			kind: "radial",
			cx: J,
			cy: rt,
			r: gt * $t.hi,
			stops: St
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
function Mt(t, e, n, o, r, s, a, i) {
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
			const n = t * i + e;
			u.set(n, r), m(t, n), m(e, n), y.push(r, t, e);
		}
	}, M = /* @__PURE__ */ new Set(), x = (t, e) => {
		if (e <= t) return;
		const n = t * i + e;
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
			const r = n * i + o;
			if (d.has(r)) continue;
			const s = u.get(r);
			if (void 0 !== s && s === y.outScore) {
				if (g(c.get(n), c.get(o)), null !== a(h, !1)) {
					t = n, e = o;
					break;
				}
				d.add(r), u.delete(r);
			}
		}
		if (t < 0) break;
		const n = c.get(t), o = c.get(e), r = new Set(n.adj), s = /* @__PURE__ */ new Set(), f = p.get(t);
		if (f) for (const a of f) s.add(a);
		const m = p.get(e);
		if (m) for (const a of m) s.add(a);
		for (const a of s) u.delete(a), d.delete(a), p.get(Math.floor(a / i))?.delete(a), p.get(a % i)?.delete(a);
		p.delete(e);
		for (let a = 0; a < 28; a++) n.acc[a] += o.acc[a];
		for (const a of o.members) n.members.push(a), l.set(a, t);
		const M = [];
		n.adj.delete(e), o.adj.delete(t);
		for (const a of o.adj) {
			n.adj.has(a) || M.push(a), n.adj.add(a);
			const o = c.get(a);
			o.adj.delete(e), o.adj.add(t);
		}
		c.delete(e);
		const x = /* @__PURE__ */ new Set();
		for (const a of n.adj) {
			x.add(a);
			for (const e of c.get(a).adj) e !== t && x.add(e);
		}
		for (const a of x) w(t < a ? t : a, t < a ? a : t);
		if (M.length > 0) {
			for (const a of r) if (a !== e) for (const t of M) {
				const e = a < t ? a : t, n = a < t ? t : a, o = e * i + n;
				u.has(o) || d.has(o) || w(e, n);
			}
		}
	}
	const b = [];
	for (const [A, k] of c) {
		if (k.acc[0] < r) continue;
		const t = a(k.members, !0);
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
	const { width: o, height: r, count: s } = e, a = e.data;
	if (s < 1) return {
		gradients: new Array(s).fill(null),
		underlays: new Int32Array(s).fill(-1),
		labels: e,
		parentLabel: Int32Array.from({ length: s }, (t, e) => e)
	};
	const i = n?.detectMaxDimension ?? 0;
	if (i > 0 && Math.max(o, r) > i) return function(t, e, n, o) {
		const { width: r, height: s, data: a, count: i } = e, l = o / Math.max(r, s), c = Math.max(1, Math.round(r * l)), f = Math.max(1, Math.round(s * l)), h = F(t, o), u = function(t, e, n) {
			const { width: o, height: r, data: s } = t, a = new Int32Array(e * n);
			for (let i = 0; i < n; i++) {
				const t = Math.min(r - 1, i * r / n | 0);
				for (let n = 0; n < e; n++) a[i * e + n] = s[t * o + Math.min(o - 1, n * o / e | 0)];
			}
			return a;
		}(e, c, f), d = u.slice(), p = n?.alpha ? function(t, e, n, o, r) {
			const s = new Uint8Array(o * r);
			for (let a = 0; a < r; a++) {
				const i = Math.min(n - 1, a * n / r | 0);
				for (let n = 0; n < o; n++) s[a * o + n] = t[i * e + Math.min(e - 1, n * e / o | 0)];
			}
			return s;
		}(n.alpha, r, s, c, f) : void 0, y = xt(h, {
			width: c,
			height: f,
			data: u,
			count: i
		}, {
			...n,
			detectMaxDimension: 0,
			oklab: void 0,
			alpha: p
		}), g = new Int32Array(a.length), m = new Int32Array(a.length).fill(-1), w = new Int32Array(a.length), M = new Int32Array(a.length), x = /* @__PURE__ */ new Map(), b = /* @__PURE__ */ new Map();
		for (let F = 0; F < a.length; F++) {
			if (a[F] < 0) {
				g[F] = -1, m[F] = F;
				continue;
			}
			if (m[F] >= 0) continue;
			const t = a[F];
			let e = 0, n = 0;
			for (w[e++] = F, m[F] = F, x.clear(), b.clear(); e > 0;) {
				const o = w[--e];
				M[n++] = o;
				const i = o % r, l = (o - i) / r, h = Math.min(c - 1, i * c / r | 0), p = Math.min(f - 1, l * f / s | 0) * c + h, y = u[p];
				b.set(y, (b.get(y) ?? 0) + 1), d[p] === t && x.set(y, (x.get(y) ?? 0) + 1), i > 0 && a[o - 1] === t && m[o - 1] < 0 && (m[o - 1] = F, w[e++] = o - 1), i + 1 < r && a[o + 1] === t && m[o + 1] < 0 && (m[o + 1] = F, w[e++] = o + 1), o >= r && a[o - r] === t && m[o - r] < 0 && (m[o - r] = F, w[e++] = o - r), o + r < a.length && a[o + r] === t && m[o + r] < 0 && (m[o + r] = F, w[e++] = o + r);
			}
			const o = x.size > 0 ? x : b;
			let i = t, l = 0;
			for (const [r, s] of o) (s > l || s === l && r < i) && (l = s, i = r);
			for (let r = 0; r < n; r++) g[M[r]] = i;
		}
		a.set(g);
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
			labels: $ === i ? e : {
				width: r,
				height: s,
				data: a,
				count: $
			},
			parentLabel: y.parentLabel
		};
	}(t, e, n, i);
	const l = n?.minArea ?? 0, c = n?.maxBacktrack ?? .15, f = n?.minColorSpan ?? .05, h = n?.oklab ?? R(t);
	let u = n?.alpha ?? null;
	if (null !== u) {
		let t = !1;
		for (let e = 0; e < a.length && !t; e++) t = a[e] >= 0 && u[e] < 255;
		t || (u = null);
	}
	const d = new Int32Array(a.length).fill(-1), p = [], y = new Int32Array(s).fill(-1), g = new Int32Array(a.length), m = new Int32Array(a.length);
	for (let F = 0; F < a.length; F++) {
		if (a[F] < 0 || d[F] >= 0) continue;
		const t = a[F], e = p.length;
		p.push(t);
		let n = 0, r = 0;
		for (g[n++] = F, d[F] = e; n > 0;) {
			const s = g[--n];
			m[r++] = s;
			const i = s % o;
			i > 0 && a[s - 1] === t && d[s - 1] < 0 && (d[s - 1] = e, g[n++] = s - 1), i + 1 < o && a[s + 1] === t && d[s + 1] < 0 && (d[s + 1] = e, g[n++] = s + 1), s >= o && a[s - o] === t && d[s - o] < 0 && (d[s - o] = e, g[n++] = s - o), s + o < a.length && a[s + o] === t && d[s + o] < 0 && (d[s + o] = e, g[n++] = s + o);
		}
		if (!(r >= 16)) if (y[t] < 0) y[t] = e;
		else {
			for (let e = 0; e < r; e++) d[m[e]] = y[t];
			p.pop();
		}
	}
	const w = p.length, M = new Float64Array(28 * w), x = new Uint32Array(w);
	for (let F = 0; F < r; F++) for (let t = 0; t < o; t++) {
		const e = F * o + t, n = d[e];
		if (n < 0) continue;
		x[n]++;
		const r = t + .5, s = F + .5, a = r * r, i = s * s, l = a + i, c = 3 * e, f = h[c], u = h[c + 1], p = h[c + 2], y = 28 * n;
		M[y] += 1, M[y + 1] += r, M[y + 2] += s, M[y + 3] += a, M[y + 4] += r * s, M[y + 5] += i, M[y + 6] += f, M[y + 7] += u, M[y + 8] += p, M[y + 9] += f * f, M[y + 10] += u * u, M[y + 11] += p * p, M[y + 12] += f * r, M[y + 13] += f * s, M[y + 14] += u * r, M[y + 15] += u * s, M[y + 16] += p * r, M[y + 17] += p * s, M[y + 18] += a * r, M[y + 19] += a * s, M[y + 20] += r * i, M[y + 21] += i * s, M[y + 22] += a * a, M[y + 23] += a * i, M[y + 24] += i * i, M[y + 25] += f * l, M[y + 26] += u * l, M[y + 27] += p * l;
	}
	const b = new Int32Array(w + 1);
	for (let F = 0; F < w; F++) b[F + 1] = b[F] + x[F];
	const A = new Int32Array(b[w]), k = b.slice(0, w);
	for (let F = 0; F < a.length; F++) {
		const t = d[F];
		t >= 0 && (A[k[t]++] = F);
	}
	const v = Array.from({ length: w }, () => /* @__PURE__ */ new Set());
	for (let F = 0; F < r; F++) for (let t = 0; t < o; t++) {
		const e = F * o + t, n = d[e];
		if (!(n < 0)) {
			if (t + 1 < o) {
				const t = d[e + 1];
				t >= 0 && t !== n && (v[n].add(t), v[t].add(n));
			}
			if (F + 1 < r) {
				const t = d[e + o];
				t >= 0 && t !== n && (v[n].add(t), v[t].add(n));
			}
		}
	}
	const I = v.map((t) => [...t].toSorted((t, e) => t - e)), $ = [];
	for (let F = 0; F < w; F++) x[F] > 0 && y[p[F]] !== F && $.push(F);
	$.sort((t, e) => x[e] - x[t] || t - e);
	const S = {
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
		sBc: new Float64Array(3 * (B + w)),
		sPx: new Float64Array(B + w),
		sPy: new Float64Array(B + w),
		sAl: new Float64Array(B + w)
	}, C = /* @__PURE__ */ new Map(), L = (t, e) => {
		if (1 !== t.length || !e) return gt(S, t, e);
		let n = C.get(t[0]);
		return void 0 === n && (n = gt(S, t, !0), C.set(t[0], n)), n;
	}, P = new Int32Array(w).fill(-1), T = new Int32Array(w).fill(-1), q = new Array(w).fill(null), K = new Int32Array(w).fill(-1), N = Mt(M, I, $, P, l, (t, e) => {
		let n = 1 / 0;
		const o = H(t, 0);
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
				const s = r.map((t) => t[2]), a = s.length;
				let i = 0;
				if (a >= 3) {
					const t = s[0], e = s[a - 1], n = Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]);
					if (n > 1e-6) for (let o = 1; o < a - 1; o++) {
						const t = r[o - 1][0], e = r[o + 1][0], a = e - t > 1e-9 ? (r[o][0] - t) / (e - t) : .5, l = s[o - 1][0] + (s[o + 1][0] - s[o - 1][0]) * a, c = s[o - 1][1] + (s[o + 1][1] - s[o - 1][1]) * a, f = s[o - 1][2] + (s[o + 1][2] - s[o - 1][2]) * a, h = Math.hypot(s[o][0] - l, s[o][1] - c, s[o][2] - f) / n;
						h > i && (i = h);
					}
				}
				return {
					backtrack: j(s),
					outlier: i
				};
			}(M, e, o.dx, o.dy);
			t.backtrack <= c && t.outlier <= .35 && (n = t.backtrack + t.outlier);
		}
		const r = O(t, 0);
		return D(r) && r.misfit < n && (n = r.misfit), n;
	}, L, w);
	for (const F of N) {
		q[F.rep] = F.built.paint;
		for (const t of F.members) T[t] = F.rep;
	}
	if (!1 !== n?.overlays) {
		const t = (t) => {
			let e = 0;
			for (const n of t.members) e += x[n];
			return e;
		}, e = N.toSorted((e, n) => t(n) - t(e) || e.rep - n.rep), n = new Map(e.map((t) => [t.rep, t])), o = /* @__PURE__ */ new Set(), r = [];
		for (const s of e) {
			if (s.built.translucent || o.has(s)) continue;
			const a = /* @__PURE__ */ new Set(), i = [], c = /* @__PURE__ */ new Set(), f = (t) => {
				for (const e of I[t]) {
					P[e] < 0 && !a.has(e) && (a.add(e), i.push(e));
					const t = T[e];
					if (t >= 0 && t !== s.rep) {
						const e = n.get(t);
						!e || e.built.translucent || o.has(e) || c.add(e);
					}
				}
			};
			for (const t of s.members) f(t);
			for (; i.length > 0;) f(i.pop());
			const h = 0 === a.size ? [] : Mt(M, I, $.filter((t) => a.has(t)), P, l, (t, e) => Z(M, e) >= U ? 0 : 1 / 0, (t, e) => mt(S, t, s.built, e), w);
			for (const e of c) {
				if (t(e) >= t(s) || e.built.residual < .01) continue;
				const n = mt(S, e.members, s.built, !0);
				null === n || n.residual > .5 * e.built.residual || (e.built = n, h.push(e));
			}
			for (const n of h) {
				const a = new Set(n.members);
				for (let r = !0; r;) {
					r = !1;
					for (const i of e) {
						if (i === s || i === n || i.built.translucent) continue;
						if (o.has(i) || t(i) >= t(s)) continue;
						if (i.built.residual < .01) continue;
						if (!i.members.some((t) => I[t].some((t) => a.has(t)))) continue;
						const e = mt(S, n.members.concat(i.members), s.built, !0);
						if (null === e) continue;
						const l = Math.max(n.built.residual, i.built.residual);
						if (!(e.residual > l + .002)) {
							for (const t of i.members) n.members.push(t), a.add(t);
							n.built = e, q[i.rep] = null, o.add(i), r = !0;
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
		for (const { overlay: s, base: a } of r) {
			if (o.has(a)) continue;
			const t = new Set(s.members);
			for (const n of e) {
				if (n === a || n.built.translucent || o.has(n)) continue;
				if (!n.members.some((e) => I[e].some((e) => t.has(e)))) continue;
				const e = L(a.members.concat(n.members), !0);
				if (null === e) continue;
				a.members.push(...n.members), a.built = e, q[a.rep] = e.paint, q[n.rep] = null;
				for (const t of n.members) T[t] = a.rep;
				o.add(n);
				const r = mt(S, s.members, e, !0);
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
		const n = S.lab;
		for (let r = 0; r < w; r++) {
			if (P[r] >= 0 || 0 === x[r]) continue;
			const s = /* @__PURE__ */ new Set();
			for (const e of I[r]) {
				const n = T[e];
				n >= 0 && t.has(n) && s.add(n);
			}
			const a = [...s].toSorted((t, n) => e.get(n) - e.get(t) || t - n);
			for (const i of a) {
				const s = t.get(i);
				if (x[r] > .1 * e.get(i)) continue;
				let a = 0;
				for (let t = b[r], e = b[r + 1]; t < e; t++) {
					const e = A[t], r = e % o + .5, i = (e - e % o) / o + .5;
					tt(s.built.fineLab, ot(s.built.paint, r, i), n), a += Math.sqrt(lt(h, 3 * e, n));
				}
				if (!(a / x[r] > .045)) {
					P[r] = 1, T[r] = i, s.members.push(r), e.set(i, e.get(i) + x[r]);
					break;
				}
			}
		}
	}
	const E = new Int32Array(w).fill(-1), W = new Uint8Array(s), Q = new Uint32Array(s);
	for (let F = 0; F < w; F++) y[p[F]] !== F && Q[p[F]]++;
	const X = [];
	for (let F = 0; F < w; F++) T[F] === F && q[F] && X.push(F);
	const Y = /* @__PURE__ */ new Map();
	for (let F = 0; F < w; F++) {
		const t = T[F];
		if (t < 0 || y[p[F]] === F) continue;
		let e = Y.get(t);
		e || (e = /* @__PURE__ */ new Map(), Y.set(t, e)), e.set(p[F], (e.get(p[F]) ?? 0) + 1);
	}
	const G = Array.from({ length: s }, (t, e) => e);
	for (const F of X) {
		const t = Y.get(F) ?? /* @__PURE__ */ new Map(), e = p[F], n = [...t.keys()].filter((e) => !W[e] && t.get(e) === Q[e]).toSorted((t, n) => t === e ? -1 : n === e ? 1 : t - n);
		n.length > 0 ? (E[F] = n[0], W[n[0]] = 1) : (E[F] = G.length, G.push(e));
	}
	const V = new Int32Array(w);
	let J = !1;
	for (let F = 0; F < w; F++) {
		const t = T[F], e = t >= 0 && E[t] >= 0 ? E[t] : p[F];
		V[F] = e, e !== p[F] && (J = !0);
	}
	const _ = G.length, et = new Array(_).fill(null), nt = new Int32Array(_).fill(-1);
	for (const F of X) {
		const t = E[F];
		et[t] = q[F], K[F] >= 0 && (nt[t] = E[K[F]]);
	}
	if (J) for (let F = 0; F < a.length; F++) {
		const t = d[F];
		t >= 0 && (a[F] = V[t]);
	}
	return {
		gradients: et,
		underlays: nt,
		labels: _ === s ? e : {
			width: o,
			height: r,
			data: a,
			count: _
		},
		parentLabel: Int32Array.from(G)
	};
}
const bt = .018 * .018, At = 144e-6;
function kt(t, e, n, o, r, s) {
	const a = e * e + n * n;
	if (a < bt) return o;
	const i = r[3 * o + 1], l = r[3 * o + 2], c = i * i + l * l;
	if (c < At) return o;
	const f = e * i + n * l;
	if (f > 0 && f * f >= .5 * a * c) return o;
	let h = -1, u = .0081;
	for (let d = 0, p = 0; d < s; d++, p += 3) {
		if (d === o) continue;
		const s = r[p + 1], i = r[p + 2], l = s * s + i * i;
		let c = l < At;
		if (!c) {
			const t = e * s + n * i;
			c = t > 0 && t * t >= .5 * a * l;
		}
		if (!c) continue;
		const f = t - r[p], y = e - s, g = n - i, m = f * f + y * y + g * g;
		m < u && (u = m, h = d);
	}
	return h >= 0 ? h : o;
}
function vt(t, e, n, o, r, s, a, i, l) {
	const c = new Uint32Array(n), f = /* @__PURE__ */ new Map();
	if (null !== r) for (let h = 0, u = 0, d = 0; h < a; h++, u += 3, d += 4) {
		if (null !== s && 0 === s[h]) {
			t[h] = -1;
			continue;
		}
		const a = o[d] << 16 | o[d + 1] << 8 | o[d + 2];
		let p = f.get(a);
		if (void 0 === p) {
			const t = r[u], o = r[u + 1], s = r[u + 2];
			p = 0;
			let i = 1 / 0;
			for (let r = 0, a = 0; r < n; r++, a += 3) {
				const n = t - e[a], l = o - e[a + 1], c = s - e[a + 2], f = n * n + l * l + c * c;
				f < i && (i = f, p = r);
			}
			l && (p = kt(t, o, s, p, e, n)), f.set(a, p);
		}
		if (t[h] = p, c[p]++, null !== i) {
			const t = 3 * p;
			i[t] += o[d], i[t + 1] += o[d + 1], i[t + 2] += o[d + 2];
		}
	}
	else for (let h = 0, u = 0; h < a; h++, u += 4) {
		if (null !== s && 0 === s[h]) {
			t[h] = -1;
			continue;
		}
		const r = o[u] << 16 | o[u + 1] << 8 | o[u + 2];
		let a = f.get(r);
		if (void 0 === a) {
			const t = o[u] / 255, s = o[u + 1] / 255, i = o[u + 2] / 255;
			a = 0;
			let l = 1 / 0;
			for (let o = 0, r = 0; o < n; o++, r += 3) {
				const n = t - e[r], c = s - e[r + 1], f = i - e[r + 2], h = n * n + c * c + f * f;
				h < l && (l = h, a = o);
			}
			f.set(r, a);
		}
		if (t[h] = a, c[a]++, null !== i) {
			const t = 3 * a;
			i[t] += o[u], i[t + 1] += o[u + 1], i[t + 2] += o[u + 2];
		}
	}
	return c;
}
function It(t, e) {
	const n = new Array(e);
	for (let o = 0; o < e; o++) n[o] = o;
	return n.sort((e, n) => t[n] - t[e] || e - n), n;
}
function $t(t, e) {
	return t >= 4 && t >= .05 * e;
}
function Ft(t, e, n, o, r) {
	const s = 3 * e, a = t[s] - n, i = t[s + 1] - o, l = t[s + 2] - r;
	return Math.sqrt(a * a + i * i + l * l);
}
function St(t, e = {}) {
	const { width: n, height: r } = t, s = n * r, a = e.flatThreshold ?? .02, i = e.mergeThreshold ?? .1, l = Math.min(1, Math.max(0, e.mergeSizeBias ?? 0)), f = Math.max(0, e.minRegionArea ?? 16), h = Math.max(0, e.maxRegions ?? 0), u = e.mask?.data ?? null, d = R(t), p = new Float32Array(s);
	for (let o = 0; o < r; o++) for (let t = 0; t < n; t++) {
		const e = o * n + t;
		if (t + 1 < n) {
			const t = Ft(d, e, d[3 * (e + 1)], d[3 * (e + 1) + 1], d[3 * (e + 1) + 2]);
			t > p[e] && (p[e] = t), t > p[e + 1] && (p[e + 1] = t);
		}
		if (o + 1 < r) {
			const t = e + n, o = Ft(d, e, d[3 * t], d[3 * t + 1], d[3 * t + 2]);
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
		if (-1 !== y[o] || null !== u && 0 === u[o] || p[o] >= a) continue;
		const t = m++;
		A(t);
		let e = 0;
		g[e++] = o, y[o] = t;
		let r = 0, i = 0, l = 0, c = 0;
		for (; e > 0;) {
			const o = g[--e];
			r += d[3 * o], i += d[3 * o + 1], l += d[3 * o + 2], c++;
			const f = o - (o / n | 0) * n;
			f > 0 && -1 === y[o - 1] && (null === u || 0 !== u[o - 1]) && p[o - 1] < a && (y[o - 1] = t, g[e++] = o - 1), f < n - 1 && -1 === y[o + 1] && (null === u || 0 !== u[o + 1]) && p[o + 1] < a && (y[o + 1] = t, g[e++] = o + 1), o >= n && -1 === y[o - n] && (null === u || 0 !== u[o - n]) && p[o - n] < a && (y[o - n] = t, g[e++] = o - n), o < s - n && -1 === y[o + n] && (null === u || 0 !== u[o + n]) && p[o + n] < a && (y[o + n] = t, g[e++] = o + n);
		}
		w[t] = r / c, M[t] = i / c, x[t] = l / c, b[t] = c;
	}
	if (0 === m) return function(t, e, n) {
		const { data: o } = t;
		let r = 0, s = 0, a = 0, i = 0;
		const l = (f = t.width, h = t.height, {
			width: f,
			height: h,
			data: new Int32Array(f * h),
			count: 1
		});
		var f, h;
		for (let c = 0; c < n; c++) null === e || 0 !== e[c] ? (l.data[c] = 0, r += o[4 * c], s += o[4 * c + 1], a += o[4 * c + 2], i++) : l.data[c] = -1;
		const u = i > 0 ? Math.round(r / i) : 0, d = i > 0 ? Math.round(s / i) : 0, p = i > 0 ? Math.round(a / i) : 0;
		return {
			labels: l,
			paletteHex: [c(u, d, p)],
			paletteRgb: new Uint8Array([
				u,
				d,
				p
			]),
			counts: new Uint32Array([i])
		};
	}(t, u, s);
	const k = function(t, e, n, o, r, s, a, i, l, c, f) {
		const h = .04000000000000001, u = new Int32Array(r).fill(-1), d = new Int32Array(r), p = new Int32Array(r);
		let y = 64, g = new Int32Array(y), m = new Int32Array(y), w = 0, M = 0;
		for (let z = 0; z < r; z++) {
			if (-1 !== u[z] || -1 !== e[z] || null !== s && 0 === s[z]) continue;
			if (w === y) {
				y *= 2;
				const t = new Int32Array(y);
				t.set(g), g = t;
				const e = new Int32Array(y);
				e.set(m), m = e;
			}
			const o = w++, a = M;
			let i = 0, l = 0, c = 0, f = 0;
			for (p[f++] = z, u[z] = o; f > 0;) {
				const y = p[--f];
				d[M++] = y, i += t[3 * y], l += t[3 * y + 1], c += t[3 * y + 2];
				const g = M - a, m = i / g, w = l / g, x = c / g, b = y - (y / n | 0) * n;
				if (b > 0) {
					const n = y - 1;
					if (-1 === u[n] && -1 === e[n] && (null === s || 0 !== s[n])) {
						const e = t[3 * n] - m, r = t[3 * n + 1] - w, s = t[3 * n + 2] - x;
						e * e + r * r + s * s < h && (u[n] = o, p[f++] = n);
					}
				}
				if (b < n - 1) {
					const n = y + 1;
					if (-1 === u[n] && -1 === e[n] && (null === s || 0 !== s[n])) {
						const e = t[3 * n] - m, r = t[3 * n + 1] - w, s = t[3 * n + 2] - x;
						e * e + r * r + s * s < h && (u[n] = o, p[f++] = n);
					}
				}
				if (y >= n) {
					const r = y - n;
					if (-1 === u[r] && -1 === e[r] && (null === s || 0 !== s[r])) {
						const e = t[3 * r] - m, n = t[3 * r + 1] - w, s = t[3 * r + 2] - x;
						e * e + n * n + s * s < h && (u[r] = o, p[f++] = r);
					}
				}
				if (y < r - n) {
					const r = y + n;
					if (-1 === u[r] && -1 === e[r] && (null === s || 0 !== s[r])) {
						const e = t[3 * r] - m, n = t[3 * r + 1] - w, s = t[3 * r + 2] - x;
						e * e + n * n + s * s < h && (u[r] = o, p[f++] = r);
					}
				}
			}
			g[o] = a, m[o] = M - a;
		}
		const x = [];
		for (let z = 0; z < w; z++) m[z] >= f && x.push(z);
		if (0 === x.length) return [];
		const b = new Float64Array(w), A = new Float64Array(w), k = new Float64Array(w);
		for (const z of x) {
			const e = g[z], n = e + m[z];
			let o = 0, r = 0, s = 0;
			for (let a = e; a < n; a++) {
				const e = 3 * d[a];
				o += t[e], r += t[e + 1], s += t[e + 2];
			}
			b[z] = o / m[z], A[z] = r / m[z], k[z] = s / m[z];
		}
		const v = (t, e, n) => t < c ? n[t] : e[t - c], I = new Float64Array(x.length), $ = new Float64Array(x.length), F = new Float64Array(x.length);
		let S = 0;
		const C = (t, r, s, a) => {
			for (let i = 1; i <= 24; i++) {
				const l = t + s * i, c = r + a * i;
				if (l < 0 || c < 0 || l >= n || c >= o) return -1;
				const f = e[c * n + l];
				if (f >= 0) return S = i, f;
			}
			return -1;
		}, L = (t) => {
			const e = g[t], o = m[t], r = b[t], s = A[t], c = k[t], f = (t) => {
				const e = v(t, I, a) - r, n = v(t, $, i) - s, o = v(t, F, l) - c;
				return Math.sqrt(e * e + n * n + o * o);
			}, h = (t, e) => {
				const n = v(t, I, a) - v(e, I, a), o = v(t, $, i) - v(e, $, i), r = v(t, F, l) - v(e, F, l);
				return Math.sqrt(n * n + o * o + r * r);
			};
			let u = 0, p = 0, y = 0;
			for (let a = 0; a < o; a++) {
				const t = d[e + a], o = t - (t / n | 0) * n, r = t / n | 0;
				let s = 0, i = 0, l = !1;
				for (let e = 0; e < 2; e++) {
					const t = 0 === e ? C(o, r, -1, 0) : C(o, r, 0, -1), n = S, a = 0 === e ? C(o, r, 1, 0) : C(o, r, 0, 1), c = S;
					if (t < 0 || a < 0) continue;
					const u = f(t), d = f(a), g = u < d ? u : d;
					p += g, y++, g < .25 ? (u <= d ? n : c) <= 3 && (l = !0) : (s++, u + d - h(t, a) >= .25 && i++);
				}
				!l && s > 0 && i === s && u++;
			}
			return {
				extreme: u / o,
				contrast: y > 0 ? p / y : 0
			};
		}, P = new Float64Array(w);
		for (const z of x) P[z] = L(z).contrast;
		x.sort((t, e) => P[e] - P[t] || t - e);
		const R = [];
		for (const z of x) {
			if (L(z).extreme < .7) continue;
			const t = c + R.length, n = g[z], o = n + m[z];
			for (let r = n; r < o; r++) e[d[r]] = t;
			I[R.length] = b[z], $[R.length] = A[z], F[R.length] = k[z], R.push({
				mL: b[z],
				mA: A[z],
				mB: k[z],
				size: m[z]
			});
		}
		return R;
	}(d, y, n, r, s, u, w, M, x, m, Math.max(1, f));
	for (const o of k) {
		const t = m++;
		A(t), w[t] = o.mL, M[t] = o.mA, x[t] = o.mB, b[t] = o.size;
	}
	(function(t, e, n, o, r, s, a, i) {
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
			-1 !== e[n] || null !== r && 0 === r[n] || d(Ft(t, n, s[o], a[o], i[o]), n, o);
		};
		for (let M = 0; M < o; M++) e[M] >= 0 && m(M, e[M]);
		for (; u > 0;) {
			const t = f[0], n = h[0];
			g(), -1 === e[t] && (e[t] = n, m(t, n));
		}
		for (let M = 0; M < o; M++) -1 !== e[M] || null !== r && 0 === r[M] || (e[M] = 0);
	})(d, y, n, s, u, w, M, x), b.fill(0, 0, m);
	const v = new Float64Array(m), I = new Float64Array(m), $ = new Float64Array(m), F = new Float64Array(m), S = new Float64Array(m), C = new Float64Array(m), L = new Int32Array(m);
	for (let o = 0; o < s; o++) {
		const t = y[o];
		t < 0 || (v[t] += d[3 * o], I[t] += d[3 * o + 1], $[t] += d[3 * o + 2], b[t]++, p[o] < a && (F[t] += d[3 * o], S[t] += d[3 * o + 1], C[t] += d[3 * o + 2], L[t]++));
	}
	for (let o = 0; o < m; o++) $t(L[o], b[o]) ? (w[o] = F[o] / L[o], M[o] = S[o] / L[o], x[o] = C[o] / L[o]) : b[o] > 0 && (w[o] = v[o] / b[o], M[o] = I[o] / b[o], x[o] = $[o] / b[o]);
	const P = function(t, e, n, o, r, s, a, i, l, c, f, h, u, d, p, y, g, m, w) {
		const M = new Int32Array(o);
		for (let L = 0; L < o; L++) M[L] = L;
		const x = (t) => {
			let e = t;
			for (; M[e] !== e;) e = M[e];
			for (; M[t] !== e;) {
				const n = M[t];
				M[t] = e, t = n;
			}
			return e;
		}, b = (t, e) => {
			const n = r[t] - r[e], o = s[t] - s[e], i = a[t] - a[e];
			return Math.sqrt(n * n + o * o + i * i);
		}, A = (t, e) => {
			const n = l[t] / i[t] - l[e] / i[e], o = c[t] / i[t] - c[e] / i[e], r = f[t] / i[t] - f[e] / i[e];
			return Math.sqrt(n * n + o * o + r * r);
		}, k = (t, e) => g <= 0 ? y : .03 + .5 * g * (1 / Math.sqrt(i[t]) + 1 / Math.sqrt(i[e])), v = (t, e) => {
			const n = i[t] >= i[e] ? t : e, o = n === t ? e : t, y = i[t] + i[e];
			l[n] += l[o], c[n] += c[o], f[n] += f[o], h[n] += h[o], u[n] += u[o], d[n] += d[o], p[n] += p[o], $t(p[n], y) ? (r[n] = h[n] / p[n], s[n] = u[n] / p[n], a[n] = d[n] / p[n]) : y > 0 && (r[n] = l[n] / y, s[n] = c[n] / y, a[n] = f[n] / y), i[n] = y, M[o] = n;
		}, I = () => {
			const r = /* @__PURE__ */ new Set(), s = [];
			for (let a = 0; a < n; a++) for (let i = 0; i < e; i++) {
				const l = a * e + i, c = t[l];
				if (c < 0) continue;
				const f = x(c);
				if (i + 1 < e) {
					const e = t[l + 1];
					if (e >= 0) {
						const t = x(e);
						if (f !== t) {
							const e = f < t ? f * o + t : t * o + f;
							r.has(e) || (r.add(e), s.push(f < t ? [f, t] : [t, f]));
						}
					}
				}
				if (a + 1 < n) {
					const n = t[l + e];
					if (n >= 0) {
						const t = x(n);
						if (f !== t) {
							const e = f < t ? f * o + t : t * o + f;
							r.has(e) || (r.add(e), s.push(f < t ? [f, t] : [t, f]));
						}
					}
				}
			}
			return s;
		};
		let $ = o;
		for (let L = 0; L < 64; L++) {
			const t = I().map(([t, e]) => [
				t,
				e,
				A(t, e)
			]).toSorted((t, e) => t[2] - e[2] || t[0] - e[0] || t[1] - e[1]);
			let e = !1;
			for (const [n, o, r] of t) {
				const t = x(n), s = x(o);
				t !== s && (r < k(t, s) || i[t] < m || i[s] < m) && (v(t, s), $--, e = !0);
			}
			if (!e) break;
		}
		const F = g > 0 ? .03 : y, S = [];
		for (let L = 0; L < o; L++) x(L) === L && S.push(L);
		S.sort((t, e) => i[e] - i[t] || t - e);
		const C = [];
		for (const L of S) {
			let t = -1;
			for (const e of C) if (b(L, e) < F) {
				t = e;
				break;
			}
			-1 === t ? C.push(L) : (v(L, t), $--);
		}
		if (w > 0 && $ > w) {
			const t = 2 * y;
			for (let e = 0; e < o && $ > w; e++) {
				const e = [];
				for (let t = 0; t < o; t++) x(t) === t && e.push(t);
				let n = null;
				for (let t = 0; t < e.length; t++) for (let o = t + 1; o < e.length; o++) {
					const r = b(e[t], e[o]);
					(null === n || r < n[2]) && (n = [
						e[t],
						e[o],
						r
					]);
				}
				if (null === n || n[2] > t) break;
				v(n[0], n[1]), $--;
			}
		}
		for (let L = 0; L < o; L++) M[L] = x(L);
		return M;
	}(y, n, r, m, w, M, x, b, v, I, $, F, S, C, L, i, l, f, h), z = new Int32Array(m).fill(-1);
	let U = 0;
	const T = new Int32Array(s);
	for (let o = 0; o < s; o++) {
		const t = y[o];
		if (t < 0) {
			T[o] = -1;
			continue;
		}
		const e = P[t];
		let n = z[e];
		-1 === n && (n = U++, z[e] = n), T[o] = n;
	}
	const q = {
		width: n,
		height: r,
		data: T,
		count: U
	}, B = new Uint8Array(3 * U), H = new Array(U), j = new Uint32Array(U);
	for (let R = 0; R < m; R++) {
		const t = z[P[R]];
		if (t < 0 || void 0 !== H[t]) continue;
		const [e, n, r] = o(w[P[R]], M[P[R]], x[P[R]]), s = Math.round(255 * e), a = Math.round(255 * n), i = Math.round(255 * r);
		B[3 * t] = s, B[3 * t + 1] = a, B[3 * t + 2] = i, H[t] = c(s, a, i);
	}
	for (let o = 0; o < s; o++) T[o] >= 0 && j[T[o]]++;
	return {
		labels: q,
		paletteHex: H,
		paletteRgb: B,
		counts: j
	};
}
function Ct(t) {
	return t <= 0 ? 0 : t >= 1 ? 255 : 256 * t | 0;
}
function Lt(t, e, n) {
	if (e <= 1) return t;
	const o = n?.keepContrast ? n.keepContrast * n.keepContrast : 0, r = n?.protect?.data ?? null, a = n?.oklab, { width: i, height: l, data: c } = t, f = i * l;
	if (0 === f) return t;
	let h = t.count;
	for (let s = 0; s < f; s++) c[s] >= h && (h = c[s] + 1);
	const u = new Int32Array(h), d = new Int32Array(h), p = new Uint8Array(f), y = new Int32Array(f), g = new Int32Array(f);
	let m = /* @__PURE__ */ new Int32Array(64), w = /* @__PURE__ */ new Int32Array(64), M = /* @__PURE__ */ new Int32Array(64), x = /* @__PURE__ */ new Int32Array(64), b = 0, A = 0, k = 0;
	const v = (t, n) => {
		const o = c[t], r = k;
		let s = r, a = t, l = 0, h = !1;
		for (y[l++] = t, p[t] = 1; l > 0;) {
			const t = y[--l];
			if (g[s++] = t, t < a && (a = t), n && s - r >= e) {
				h = !0;
				break;
			}
			const u = t - (t / i | 0) * i;
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
			if (u < i - 1) {
				const e = p[t + 1];
				if (1 !== e && c[t + 1] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t + 1] = 1, y[l++] = t + 1;
				}
			}
			if (t >= i) {
				const e = p[t - i];
				if (1 !== e && c[t - i] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t - i] = 1, y[l++] = t - i;
				}
			}
			if (t < f - i) {
				const e = p[t + i];
				if (1 !== e && c[t + i] === o) {
					if (2 === e) {
						h = !0;
						break;
					}
					p[t + i] = 1, y[l++] = t + i;
				}
			}
		}
		if (h) {
			for (let t = r; t < s; t++) p[g[t]] = 2;
			for (let t = 0; t < l; t++) p[y[t]] = 2;
			return -1;
		}
		const u = s - r;
		return u >= e ? -1 : (k = s, b === m.length && (m = Pt(m), w = Pt(w), M = Pt(M)), m[b] = r, w[b] = u, M[b] = a, b++);
	}, I = (t) => {
		if (t < 0) return;
		A === x.length && (x = Pt(x));
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
	}, F = (t) => {
		const e = m[t], n = e + w[t], l = c[g[e]];
		let h = !1, p = 0;
		for (let o = e; o < n; o++) {
			const t = g[o];
			null !== r && 0 !== r[t] && (h = !0);
			const e = t - (t / i | 0) * i;
			if (e > 0) {
				const e = c[t - 1];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (e < i - 1) {
				const e = c[t + 1];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (t >= i) {
				const e = c[t - i];
				-1 !== e && e !== l && 0 === u[e]++ && (d[p++] = e);
			}
			if (t < f - i) {
				const e = c[t + i];
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
		if (a && function(t, e, n, o) {
			const r = 3 * e, a = 3 * n;
			return s(t[r], t[r + 1], t[r + 2], t[a], t[a + 1], t[a + 2]) >= o;
		}(a, l, y, o)) return !1;
		for (let o = e; o < n; o++) c[g[o]] = y;
		return !0;
	}, S = (t, e) => {
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
			for (; P + n > L.length;) L = Pt(L);
			for (let t = e; t < e + n; t++) L[P++] = g[t];
		}
	};
	for (let s = 0; s < 8; s++) {
		p.fill(0), b = 0, A = 0, k = 0;
		const t = !R;
		if (t) for (let n = 0; n < P; n++) {
			const t = L[n], e = t - (t / i | 0) * i;
			0 === p[t] && -1 !== c[t] && I(v(t, !0)), e > 0 && 0 === p[t - 1] && -1 !== c[t - 1] && I(v(t - 1, !0)), e < i - 1 && 0 === p[t + 1] && -1 !== c[t + 1] && I(v(t + 1, !0)), t >= i && 0 === p[t - i] && -1 !== c[t - i] && I(v(t - i, !0)), t < f - i && 0 === p[t + i] && -1 !== c[t + i] && I(v(t + i, !0));
		}
		else for (let n = 0; n < f; n++) 0 === p[n] && -1 !== c[n] && v(n, !1);
		P = 0, R = !1;
		let e = !1;
		if (t) for (let n = $(); n >= 0; n = $()) {
			if (!F(n)) continue;
			e = !0, z(n);
			const t = M[n], o = m[n], r = o + w[n];
			for (let e = o; e < r; e++) {
				const n = g[e], o = n - (n / i | 0) * i;
				o > 0 && S(n - 1, t), o < i - 1 && S(n + 1, t), n >= i && S(n - i, t), n < f - i && S(n + i, t);
			}
		}
		else for (let n = 0; n < b; n++) F(n) && (e = !0, z(n));
		if (!e) break;
	}
	return t;
}
function Pt(t) {
	const e = new Int32Array(2 * t.length);
	return e.set(t), e;
}
function Rt(t, e) {
	if (e < 0) return 0;
	const { width: n, height: o, data: r } = t, s = n * o, a = new Int32Array(s);
	let i = 0;
	const l = (t) => {
		r[t] === e && (r[t] = -1, a[i++] = t);
	};
	for (let f = 0; f < n; f++) l(f), l((o - 1) * n + f);
	for (let f = 0; f < o; f++) l(f * n), l(f * n + (n - 1));
	let c = 0;
	for (; i > 0;) {
		const t = a[--i];
		c++;
		const e = t - (t / n | 0) * n;
		e > 0 && l(t - 1), e < n - 1 && l(t + 1), t >= n && l(t - n), t < s - n && l(t + n);
	}
	return c;
}
function zt(t) {
	const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(r);
	for (let a = 0; a < r; a++) s[a] = 0 !== o[a] ? 1e9 : 0;
	for (let a = 0; a < n; a++) for (let t = 0; t < e; t++) {
		const n = a * e + t;
		let o = s[n];
		0 !== o && (t > 0 && s[n - 1] + 3 < o && (o = s[n - 1] + 3), a > 0 && (s[n - e] + 3 < o && (o = s[n - e] + 3), t > 0 && s[n - e - 1] + 4 < o && (o = s[n - e - 1] + 4), t < e - 1 && s[n - e + 1] + 4 < o && (o = s[n - e + 1] + 4)), s[n] = o);
	}
	for (let a = n - 1; a >= 0; a--) for (let t = e - 1; t >= 0; t--) {
		const o = a * e + t;
		let r = s[o];
		0 !== r && (t < e - 1 && s[o + 1] + 3 < r && (r = s[o + 1] + 3), a < n - 1 && (s[o + e] + 3 < r && (r = s[o + e] + 3), t < e - 1 && s[o + e + 1] + 4 < r && (r = s[o + e + 1] + 4), t > 0 && s[o + e - 1] + 4 < r && (r = s[o + e - 1] + 4)), s[o] = r);
	}
	for (let a = 0; a < r; a++) s[a] /= 3;
	return s;
}
const Ut = 1024;
function Tt(t, e, n) {
	const o = Math.min(1, n / Math.max(t, e));
	return {
		w: Math.max(1, Math.round(t * o)),
		h: Math.max(1, Math.round(e * o))
	};
}
function qt(t, e, n) {
	return Math.min(n - 1, Math.floor(t * n / e));
}
function Bt(t, e) {
	const n = F(t, Ut);
	return {
		kind: "rgba",
		width: n.width,
		height: n.height,
		data: new Uint8ClampedArray(n.data),
		caption: e
	};
}
function Ht(t, e, n) {
	const { w: o, h: r } = Tt(t.width, t.height, Ut), s = new Uint16Array(o * r), { data: a, width: i, height: l } = t;
	for (let c = 0; c < r; c++) {
		const t = qt(c, r, l);
		for (let e = 0; e < o; e++) {
			const n = a[t * i + qt(e, o, i)];
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
function jt(t, e) {
	const { w: n, h: o } = Tt(t.width, t.height, Ut), r = new Uint8Array(n * o), { data: s, width: a, height: i } = t;
	for (let l = 0; l < o; l++) {
		const t = qt(l, o, i);
		for (let e = 0; e < n; e++) r[l * n + e] = s[t * a + qt(e, n, a)] ? 1 : 0;
	}
	return {
		kind: "mask",
		width: n,
		height: o,
		data: r,
		caption: e
	};
}
function Kt(t, e = 48) {
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
function Ot(t, e) {
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
function Dt(t) {
	const e = t.fill && "none" !== t.fill ? t.fill : t.stroke;
	return e && "none" !== e ? e : "#888888";
}
function Nt(t, e = 24) {
	const n = /* @__PURE__ */ new Map();
	for (const r of t) n.set(Dt(r), (n.get(Dt(r)) ?? 0) + r.commands.length);
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
function Zt(t, e = 24) {
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
function Et(t) {
	let e = 0;
	for (const n of t) e += n.commands.length;
	return e;
}
function Wt(t) {
	let e = 0;
	for (const n of t.data) n && e++;
	return t.data.length > 0 ? e / t.data.length : 0;
}
function Qt(t) {
	let e = 0;
	for (const n of t) n > 0 && e++;
	return e;
}
const Xt = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1]
];
function Yt(t, e, n) {
	const { width: o, height: r } = t, s = new Uint8Array(t.data), a = (t, e) => t >= 0 && t < o && e >= 0 && e < r ? s[e * o + t] : 0, i = [], l = new Int32Array(o * r);
	let c = /* @__PURE__ */ new Int32Array(64);
	const f = new Int32Array(r), h = new Int32Array(r);
	for (let m = 0; m < r; m++) {
		const e = m * o;
		for (let r = 0; r < o; r++) {
			if (1 !== s[e + r]) continue;
			const o = d(r, m), a = Math.abs(u(o)), c = 1 === t.data[e + r], f = a >= n, h = l[e + r];
			g(o, c ? f ? i.length + 1 : h : -1), f && i.push({
				points: o,
				area: c ? a : -a,
				interiorX: r,
				interiorY: m,
				parent: h - 1
			});
		}
	}
	return i;
	function d(t, e) {
		const n = [];
		let o = t, r = e, s = 0;
		do {
			n.push(o, r);
			const [t, e] = Xt[s], i = a(o + (t + e - 1) / 2, r + (e - t - 1) / 2), l = a(o + (t - e - 1) / 2, r + (e + t - 1) / 2);
			1 === l && 0 === i || (s = 1 === l && 1 === i ? s + 3 & 3 : 0 === l && 0 === i ? s + 1 & 3 : p(o, r, s));
			const [c, f] = Xt[s];
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
			for (let r = 1 - n; r <= n - 1; r++) o += a(t + r, e + n - 1) ? 1 : -1, o += a(t + n - 1, e + r - 1) ? 1 : -1, o += a(t + r - 1, e - n) ? 1 : -1, o += a(t - n, e + r) ? 1 : -1;
			if (o > 0) return !0;
			if (o < 0) return !1;
		}
		return !1;
	}
	function g(t, e) {
		const n = t.length;
		let a = 0, i = r, u = -1;
		for (let o = 0; o < n; o += 2) {
			const e = t[o + 1], r = t[(o + 3) % n];
			if (r === e) continue;
			const s = r < e ? r : e;
			f[s]++, s < i && (i = s), s > u && (u = s), a++;
		}
		if (0 === a) return;
		if (a > c.length) {
			let t = c.length;
			for (; t < a;) t *= 2;
			c = new Int32Array(t);
		}
		let d = 0;
		for (let o = i; o <= u; o++) h[o] = d, d += f[o];
		for (let o = 0; o < n; o += 2) {
			const e = t[o + 1], r = t[(o + 3) % n];
			r !== e && (c[h[r < e ? r : e]++] = t[o]);
		}
		for (let r = i; r <= u; r++) {
			const t = h[r], n = t - f[r];
			f[r] = 0;
			for (let e = n + 1; e < t; e++) {
				const t = c[e];
				let o = e - 1;
				for (; o >= n && c[o] > t;) c[o + 1] = c[o], o--;
				c[o + 1] = t;
			}
			const a = r * o;
			for (let o = n; o + 1 < t; o += 2) {
				const t = c[o], n = c[o + 1];
				for (let e = t; e < n; e++) s[a + e] ^= 1;
				if (e >= 0) for (let o = t; o < n; o++) l[a + o] = e;
			}
		}
	}
}
function Gt(t) {
	const e = t.length >> 1, n = t[0], o = t[1], r = new Float64Array(e + 1), s = new Float64Array(e + 1), a = new Float64Array(e + 1), i = new Float64Array(e + 1), l = new Float64Array(e + 1);
	for (let c = 0; c < e; c++) {
		const e = t[2 * c] - n, f = t[2 * c + 1] - o;
		r[c + 1] = r[c] + e, s[c + 1] = s[c] + f, a[c + 1] = a[c] + e * e, i[c + 1] = i[c] + e * f, l[c + 1] = l[c] + f * f;
	}
	return {
		x: r,
		y: s,
		x2: a,
		xy: i,
		y2: l,
		ox: n,
		oy: o
	};
}
function Vt(t, e, n, o) {
	const { x: r, y: s, x2: a, xy: i, y2: l, ox: c, oy: f } = e, h = o + 1 - n, u = r[o + 1] - r[n], d = s[o + 1] - s[n], p = a[o + 1] - a[n], y = i[o + 1] - i[n], g = l[o + 1] - l[n], m = (t[2 * n] + t[2 * o]) / 2 - c, w = (t[2 * n + 1] + t[2 * o + 1]) / 2 - f, M = t[2 * o] - t[2 * n], x = t[2 * o + 1] - t[2 * n + 1], b = x * x * ((p - 2 * u * m) / h + m * m) - 2 * M * x * ((y - u * w - d * m) / h + m * w) + M * M * ((g - 2 * d * w) / h + w * w);
	return Math.sqrt(Math.max(0, b));
}
function Jt(t, e, n, o) {
	const { x: r, y: s, x2: a, xy: i, y2: l, ox: c, oy: f } = e, h = o + 1 - n, u = (r[o + 1] - r[n]) / h, d = (s[o + 1] - s[n]) / h, p = (a[o + 1] - a[n]) / h - u * u, y = (i[o + 1] - i[n]) / h - u * d, g = (l[o + 1] - l[n]) / h - d * d, m = (p + g + Math.sqrt((p - g) * (p - g) + 4 * y * y)) / 2;
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
function _t(t, e, n, o) {
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
function te(t, e) {
	const n = new Array(9);
	for (let o = 0; o < 9; o++) n[o] = t[o] + e[o];
	return n;
}
function ee(t, e, n) {
	return t[0] * e * e + (t[1] + t[3]) * e * n + t[4] * n * n + (t[2] + t[6]) * e + (t[5] + t[7]) * n + t[8];
}
function ne(t, e, n, o) {
	const r = n.length, s = new Array(2 * r), a = r - 1, i = new Array(a);
	for (let l = 0; l < a; l++) {
		const { cx: o, cy: r, dx: s, dy: a } = Jt(t, e, n[l], n[l + 1]);
		i[l] = _t(o, r, s, a);
	}
	for (let l = 0; l < r; l++) {
		const e = t[2 * n[l]], r = t[2 * n[l] + 1];
		let c = null, f = null;
		if (l > 0 ? c = i[l - 1] : o && (c = i[a - 1]), l < a ? f = i[l] : o && (f = i[0]), !c || !f) {
			s[2 * l] = e, s[2 * l + 1] = r;
			continue;
		}
		const [h, u] = oe(te(c, f), e, r);
		s[2 * l] = h, s[2 * l + 1] = u;
	}
	return o && (s[2 * (r - 1)] = s[0], s[2 * (r - 1) + 1] = s[1]), s;
}
function oe(t, e, n) {
	const o = 2 * t[0], r = t[1] + t[3], s = t[2] + t[6], a = r, i = 2 * t[4], l = t[5] + t[7], c = o * i - r * a;
	if (Math.abs(c) > 1e-9) {
		const t = (-s * i + l * r) / c, f = (-o * l + s * a) / c;
		if (Math.abs(t - e) <= .5 && Math.abs(f - n) <= .5) return [t, f];
	}
	let f = e, h = n, u = ee(t, e, n);
	const d = (e, n) => {
		const o = ee(t, e, n);
		o < u && (u = o, f = e, h = n);
	};
	for (const p of [e - .5, e + .5]) Math.abs(i) > 1e-12 && d(p, re((-r * p - l) / i, n - .5, n + .5)), d(p, n - .5), d(p, n + .5);
	for (const p of [n - .5, n + .5]) Math.abs(o) > 1e-12 && d(re((-a * p - s) / o, e - .5, e + .5), p), d(e - .5, p), d(e + .5, p);
	return [f, h];
}
function re(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function se(t) {
	const e = t.length > 0 && "Z" === t[t.length - 1].type, n = e ? t.slice(0, -1) : t.slice();
	if (0 === n.length) return [];
	const o = [], r = n[n.length - 1];
	if ("Z" === r.type || "M" !== n[0].type) throw new Error("reverseCommands: malformed subpath");
	const s = (r.type, r.x), a = (r.type, r.y);
	o.push({
		type: "M",
		x: s,
		y: a
	});
	for (let i = n.length - 1; i >= 1; i--) {
		const t = n[i], e = n[i - 1];
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
function ae(t, e, n, o, r, s, a, i, l) {
	const c = 1 - l, f = c * c * c, h = 3 * c * c * l, u = 3 * c * l * l, d = l * l * l;
	return [f * t + h * n + u * r + d * a, f * e + h * o + u * s + d * i];
}
function ie(t) {
	const e = 1 - t;
	return e * e * e;
}
function le(t) {
	const e = 1 - t;
	return 3 * t * e * e;
}
function ce(t) {
	return 3 * t * t * (1 - t);
}
function fe(t) {
	return t * t * t;
}
function he(t, e, n, o, r, s, a, i) {
	const l = t[2 * e], c = t[2 * e + 1], f = t[2 * n], h = t[2 * n + 1];
	let u = 0, d = 0, p = 0, y = 0, g = 0;
	for (let A = e; A <= n; A++) {
		const n = o[A - e], m = r * le(n), w = s * le(n), M = a * ce(n), x = i * ce(n);
		u += m * m + w * w, d += m * M + w * x, p += M * M + x * x;
		const b = t[2 * A] - (ie(n) + le(n)) * l - (ce(n) + fe(n)) * f, k = t[2 * A + 1] - (ie(n) + le(n)) * c - (ce(n) + fe(n)) * h;
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
		c2x: f + M * a,
		c2y: h + M * i,
		p3x: f,
		p3y: h
	};
}
function ue(t, e) {
	return ae(t.p0x, t.p0y, t.c1x, t.c1y, t.c2x, t.c2y, t.p3x, t.p3y, e);
}
function de(t, e, n, o) {
	const [r, s] = ue(t, o), [a, i] = function(t, e) {
		const n = 1 - e, o = 3 * (t.c1x - t.p0x), r = 3 * (t.c1y - t.p0y), s = 3 * (t.c2x - t.c1x), a = 3 * (t.c2y - t.c1y);
		return [n * n * o + 2 * n * e * s + e * e * (3 * (t.p3x - t.c2x)), n * n * r + 2 * n * e * a + e * e * (3 * (t.p3y - t.c2y))];
	}(t, o), [l, c] = function(t, e) {
		const n = 6 * (t.c2x - 2 * t.c1x + t.p0x), o = 6 * (t.c2y - 2 * t.c1y + t.p0y);
		return [(1 - e) * n + e * (6 * (t.p3x - 2 * t.c2x + t.c1x)), (1 - e) * o + e * (6 * (t.p3y - 2 * t.c2y + t.c1y))];
	}(t, o), f = r - e, h = s - n, u = f * a + h * i, d = a * a + i * i + f * l + h * c;
	if (Math.abs(d) < 1e-12) return o;
	const p = o - u / d;
	return p < 0 ? 0 : p > 1 ? 1 : p;
}
function pe(t, e, n) {
	let o = 0, r = 1 / 0;
	for (let l = 0; l <= 16; l++) {
		const s = l / 16, [a, i] = ue(t, s), c = (a - e) * (a - e) + (i - n) * (i - n);
		c < r && (r = c, o = s);
	}
	let s = o;
	for (let l = 0; l < 3; l++) s = de(t, e, n, s);
	const [a, i] = ue(t, s);
	return Math.min(Math.sqrt(r), Math.hypot(a - e, i - n));
}
function ye(t, e, n) {
	const o = t.length >> 1, r = [], s = [
		0,
		...n.filter((t) => t > 0 && t < o - 1),
		o - 1
	];
	for (let a = 0; a + 1 < s.length; a++) me(t, s[a], s[a + 1], e, r);
	return r;
}
function ge(t, e) {
	const n = t[2 * (e - 1)] - t[2 * e], o = t[2 * (e - 1) + 1] - t[2 * e + 1], r = Math.hypot(n, o) || 1;
	return [n / r, o / r];
}
function me(t, e, n, o, r) {
	const [s, a] = function(t, e) {
		const n = t[2 * (e + 1)] - t[2 * e], o = t[2 * (e + 1) + 1] - t[2 * e + 1], r = Math.hypot(n, o) || 1;
		return [n / r, o / r];
	}(t, e), [i, l] = ge(t, n);
	we(t, e, n, s, a, i, l, o, r, 0);
}
function we(t, e, n, o, r, s, a, i, l, c) {
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
	let d = he(t, e, n, h, o, r, s, a), { maxErr: p, splitAt: y } = Me(t, e, n, d, h);
	if (p <= i) return void l.push(xe(d));
	if (p <= i * i * 16 || p <= 4 * i) for (let w = 0; w < 4; w++) {
		for (let n = 0; n < f; n++) h[n] = de(d, t[2 * (e + n)], t[2 * (e + n) + 1], h[n]);
		let c = !0;
		for (let t = 1; t < f; t++) if (h[t] <= h[t - 1]) {
			c = !1;
			break;
		}
		if (!c) break;
		d = he(t, e, n, h, o, r, s, a);
		const u = Me(t, e, n, d, h);
		if (p = u.maxErr, y = u.splitAt, p <= i) return void l.push(xe(d));
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
			const [n, o] = ge(t, e);
			return [n, o];
		}
		return [n / r, o / r];
	}(t, y);
	we(t, e, y, o, r, g, m, i, l, c + 1), we(t, y, n, -g, -m, s, a, i, l, c + 1);
}
function Me(t, e, n, o, r) {
	let s = 0, a = e + n >> 1;
	for (let i = e + 1; i < n; i++) {
		const [n, l] = ue(o, r[i - e]), c = Math.hypot(n - t[2 * i], l - t[2 * i + 1]);
		c > s && (s = c, a = i);
	}
	return {
		maxErr: s,
		splitAt: a
	};
}
function xe(t) {
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
function be(t, e, n, o, r) {
	const s = [];
	let a = t, i = e, l = 0;
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
			}), a = t.ex, i = t.ey, l++;
			continue;
		}
		let e = l;
		for (; e + 1 < n.length && !n[e + 1].corner;) e++;
		ke(n, l, e, a, i, o, r, s), a = n[e].ex, i = n[e].ey, l = e + 1;
	}
	return s;
}
const Ae = 24;
function ke(t, e, n, o, r, s, a, i) {
	let l = o, c = r, f = e;
	for (; f <= n;) {
		let e = !1;
		if (s && a > 0) for (let o = Math.min(n, f + Ae - 1); o > f; o--) {
			const n = ve(t, f, o, l, c, a);
			if (n) {
				i.push({
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
			i.push({
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
function ve(t, e, n, o, r, s) {
	let a = t[e].ex - o, i = t[e].ey - r, l = 0, c = 0, f = t[e].ex, h = t[e].ey;
	for (let $ = e + 1; $ <= n; $++) {
		const e = t[$].ex - f, n = t[$].ey - h, o = a * n - i * e, r = Math.sign(o);
		if (0 !== r) {
			if (0 === l) l = r;
			else if (r !== l) return null;
		}
		const s = a * e + i * n;
		if (c += Math.abs(Math.atan2(Math.abs(o), s)), c > .994 * Math.PI) return null;
		a = e, i = n, f = t[$].ex, h = t[$].ey;
	}
	const u = [o, r];
	let d = o, p = r;
	for (let $ = e; $ <= n; $++) {
		const e = t[$];
		for (let t = 1; t <= 8; t++) {
			const [n, o] = ae(d, p, e.c1x, e.c1y, e.c2x, e.c2y, e.ex, e.ey, t / 8);
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
	const I = he(u, 0, A - 1, k, y / m, g / m, M / b, x / b);
	for (let $ = 1; $ < A - 1; $ += 2) if (pe(I, u[2 * $], u[2 * $ + 1]) > s) return null;
	for (let $ = e; $ <= n; $++) if (pe(I, t[$].ex, t[$].ey) > s) return null;
	return I;
}
function Ie(t) {
	const e = t.length >> 1;
	if (e <= 2) return 2 === e ? [0, 1] : [0];
	const n = function(t) {
		const e = t.length >> 1, n = (e) => t[2 * e], o = (e) => t[2 * e + 1], r = new Int8Array(Math.max(0, e - 1));
		for (let h = 0; h < e - 1; h++) r[h] = $e(n(h + 1) - n(h), o(h + 1) - o(h));
		const s = new Int32Array(Math.max(0, e - 1));
		if (e >= 2) {
			s[e - 2] = e - 1;
			for (let t = e - 3; t >= 0; t--) s[t] = r[t + 1] !== r[t] ? t + 1 : s[t + 1];
		}
		const a = new Int32Array(e);
		a[e - 1] = e - 1;
		const i = /* @__PURE__ */ new Int32Array(4);
		for (let h = e - 2; h >= 0; h--) {
			i[0] = i[1] = i[2] = i[3] = 0, i[r[h]]++;
			let t = 0, l = 0, c = 0, f = 0, u = h, d = s[h], p = !1, y = !1;
			for (;;) {
				if (i[$e(Math.sign(n(d) - n(u)), Math.sign(o(d) - o(u)))]++, 0 !== i[0] && 0 !== i[1] && 0 !== i[2] && 0 !== i[3]) {
					a[h] = u, p = !0;
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
					a[h] = e - 1, p = !0;
					break;
				}
				d = s[u];
			}
			if (!p && y) {
				const r = Math.sign(n(d) - n(u)), s = Math.sign(o(d) - o(u)), i = n(u) - n(h), p = o(u) - o(h), y = t * p - l * i, g = t * s - l * r, m = c * p - f * i, w = c * s - f * r;
				let M = 1e7;
				g < 0 && (M = Math.floor(y / -g)), w > 0 && (M = Math.min(M, Math.floor(-m / w))), a[h] = Math.min(e - 1, Math.max(u, u + M));
			}
		}
		const l = new Int32Array(e);
		l[e - 1] = e - 1;
		let c = a[e - 1];
		for (let h = e - 2; h >= 0; h--) a[h] >= h + 1 && a[h] <= c && (c = a[h]), l[h] = c;
		const f = new Int32Array(e);
		for (let h = 0; h < e; h++) {
			const t = 0 === h ? l[0] : l[h - 1];
			f[h] = t >= e - 1 ? e - 1 : Math.min(e - 1, Math.max(h + 1, t - 1));
		}
		return f[e - 1] = e - 1, f;
	}(t), o = Gt(t);
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
	const a = new Int32Array(e);
	{
		let t = 0;
		for (let o = 1; o < e; o++) {
			for (; n[t] < o;) t++;
			a[o] = t;
		}
	}
	const i = new Int32Array(r + 1);
	i[r] = e - 1;
	for (let d = r - 1; d >= 0; d--) i[d] = a[i[d + 1]];
	let l = new Float64Array(e).fill(1 / 0), c = new Float64Array(e).fill(1 / 0);
	l[0] = 0;
	const f = [];
	for (let d = 1; d <= r; d++) {
		const a = i[d], h = d === r ? e - 1 : s[d], u = i[d - 1], p = s[d - 1], y = new Int32Array(h - a + 1).fill(-1);
		c.fill(1 / 0, a, h + 1);
		for (let s = Math.max(a, d === r ? e - 1 : a); s <= h; s++) {
			let e = 1 / 0, r = -1;
			const i = Math.min(p, s - 1);
			for (let a = u; a <= i; a++) {
				if (n[a] < s) continue;
				const i = l[a];
				if (i === 1 / 0) continue;
				const c = i + Vt(t, o, a, s);
				c < e && (e = c, r = a);
			}
			c[s] = e, y[s - a] = r;
		}
		f.push(y);
		const g = l;
		l = c, c = g;
	}
	const h = [e - 1];
	let u = e - 1;
	for (let d = r; d >= 1; d--) {
		const t = i[d], e = f[d - 1][u - t];
		if (e < 0) {
			h.push(0);
			break;
		}
		h.push(e), u = e;
	}
	return h.reverse(), 0 !== h[0] && h.unshift(0), h;
}
function $e(t, e) {
	return (3 + 3 * Math.sign(t) + Math.sign(e)) / 2;
}
function Fe(t, e, n, o, r, s, a, i) {
	const l = Math.abs(r - t) + Math.abs(s - e);
	let c;
	if (0 !== l) {
		const a = Math.abs((n - t) * (s - e) - (r - t) * (o - e)) / l;
		c = a > 1 ? 1 - 1 / a : 0, c /= .75;
	} else c = 4 / 3;
	const f = (t + n) / 2, h = (e + o) / 2, u = (n + r) / 2, d = (o + s) / 2;
	if (function(t, e, n, o, r, s, a, i, l) {
		return void 0 === l ? t >= e : !(Math.min(Math.hypot(n - r, o - s), Math.hypot(a - r, i - s)) < 1.5) && (y(n, o, r, s, a, i) < l || t >= e);
	}(c, a, t, e, n, o, r, s, i)) return {
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
const Se = .75, Ce = .4999;
function Le(t, e) {
	const n = e.width, o = e.height, r = "data" in e ? e.data : null, s = (t, s) => {
		const a = t < 0 ? 0 : t >= n ? n - 1 : t, i = s < 0 ? 0 : s >= o ? o - 1 : s;
		return null !== r ? r[i * n + a] : e.at(a, i);
	}, a = t.length >> 1, i = new Array(t.length);
	for (let l = 0; l < a; l++) {
		const e = t[2 * l], r = t[2 * l + 1];
		if (i[2 * l] = e, i[2 * l + 1] = r, e <= 0 || r <= 0 || e >= n || r >= o) continue;
		const a = s(e - 1, r - 1), c = s(e, r - 1), f = s(e - 1, r), h = s(e, r);
		if (a > 0 && c > 0 && f > 0 && h > 0 || a < 0 && c < 0 && f < 0 && h < 0) continue;
		if (Math.abs(a) >= Ce && Math.abs(c) >= Ce && Math.abs(f) >= Ce && Math.abs(h) >= Ce) continue;
		const u = (a + c + f + h) / 4, d = (c + h - a - f) / 2, p = (f + h - a - c) / 2, y = d * d + p * p;
		if (y < 1e-12) continue;
		const g = -u / y;
		let m = g * d, w = g * p;
		m = m > Se ? Se : m < -.75 ? -.75 : m, w = w > Se ? Se : w < -.75 ? -.75 : w, i[2 * l] = e + m, i[2 * l + 1] = r + w;
	}
	return i;
}
function Pe(t, e, n) {
	const o = (t, o) => n ? Ue(t.points, n[o], e) : Re(t.points, e), r = [], s = new Int32Array(t.length);
	for (let i = 0; i < t.length; i++) {
		const e = t[i];
		e.area > 0 ? (s[i] = r.length, r.push({
			area: e.area,
			commands: o(e, i),
			holes: []
		})) : e.parent >= 0 && r[s[e.parent]].holes.push(o(e, i));
	}
	const a = r.map((t) => ({
		commands: t.commands.concat(...t.holes),
		area: t.area,
		holeCount: t.holes.length
	}));
	return a.sort((t, e) => e.area - t.area), a;
}
function Re(t, e, n) {
	return "pixel" === e.curveMode ? Te(t) : Ue(t, ze(t, n ?? e.coverage), e);
}
function ze(t, e) {
	const n = t.slice();
	n.push(t[0], t[1]);
	const o = Ie(n);
	if (o.length < 4) return null;
	const r = e ? Le(n, e) : n;
	return ne(r, Gt(r), o, !0);
}
function Ue(t, e, n) {
	if ("pixel" === n.curveMode || null === e) return Te(t);
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
			const a = (s + o - 1) % o, i = (s + 1) % o;
			r[s] = Fe(t[2 * a], t[2 * a + 1], t[2 * s], t[2 * s + 1], t[2 * i], t[2 * i + 1], e, n);
		}
		return r;
	}(e.slice(0, e.length - 2), 4 * n.smoothing / 3, n.cornerThreshold), r = o[o.length - 1], s = [{
		type: "M",
		x: r.ex,
		y: r.ey
	}];
	return s.push(...be(r.ex, r.ey, o, n.curveOptimize, n.optTolerance)), s.push({ type: "Z" }), s;
}
function Te(t) {
	const e = t.length >> 1, n = [];
	for (let o = 0; o < e; o++) {
		const r = (o + e - 1) % e, s = (o + 1) % e, a = t[2 * o] - t[2 * r], i = t[2 * o + 1] - t[2 * r + 1], l = t[2 * s] - t[2 * o];
		a * (t[2 * s + 1] - t[2 * o + 1]) - i * l !== 0 && (0 === n.length ? n.push({
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
const qe = [
	1,
	0,
	-1,
	0
], Be = [
	0,
	1,
	0,
	-1
];
function He(t) {
	const { width: e, height: n, data: o } = t, r = (t, r) => t >= 0 && t < e && r >= 0 && r < n ? o[r * e + t] : -1, s = e + 1, a = new Uint8Array(e * (n + 1)), i = new Uint8Array(s * n);
	for (let y = 0; y <= n; y++) for (let t = 0; t < e; t++) r(t, y - 1) !== r(t, y) && (a[y * e + t] = 1);
	for (let y = 0; y < n; y++) for (let t = 0; t <= e; t++) r(t - 1, y) !== r(t, y) && (i[y * s + t] = 1);
	const l = (t, o, r) => {
		switch (r) {
			case 0: return t < e ? a[o * e + t] : 0;
			case 1: return o < n ? i[o * s + t] : 0;
			case 2: return t > 0 ? a[o * e + (t - 1)] : 0;
			default: return o > 0 ? i[(o - 1) * s + t] : 0;
		}
	}, c = (t, e) => (0 !== l(t, e, 0) ? 1 : 0) + (0 !== l(t, e, 1) ? 1 : 0) + (0 !== l(t, e, 2) ? 1 : 0) + (0 !== l(t, e, 3) ? 1 : 0), f = (t, n, o) => {
		0 === o ? a[n * e + t] = 2 : 1 === o ? i[n * s + t] = 2 : 2 === o ? a[n * e + (t - 1)] = 2 : i[(n - 1) * s + t] = 2;
	}, h = (t, o, r) => 0 === r ? t < e && 1 === a[o * e + t] : 1 === r ? o < n && 1 === i[o * s + t] : 2 === r ? t > 0 && 1 === a[o * e + (t - 1)] : o > 0 && 1 === i[(o - 1) * s + t], u = [], d = (t, e, n, o) => {
		const [s, a] = ((t, e, n) => {
			switch (n) {
				case 0: return [r(t, e - 1), r(t, e)];
				case 1: return [r(t, e), r(t - 1, e)];
				case 2: return [r(t - 1, e), r(t - 1, e - 1)];
				default: return [r(t - 1, e - 1), r(t, e - 1)];
			}
		})(t, e, n), i = [t, e];
		let d = 0, p = t, y = e, g = n;
		const m = n;
		for (;;) {
			f(p, y, g);
			const n = p + qe[g], r = y + Be[g];
			if (d += p * r - n * y, i.push(n, r), p = n, y = r, p === t && y === e) break;
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
			points: i,
			left: s,
			right: a,
			loop: p === t && y === e && i.length > 2,
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
function je(t, e, n) {
	const o = t.chains[e], r = function(t, e, n) {
		const o = n.colorField;
		if (!o || e.left < 0 || e.right < 0) return;
		const r = 3 * e.left, s = 3 * e.right;
		return function(t, e, n, o, r) {
			const s = o[0], a = o[1], i = o[2], l = r[0], c = r[1], f = r[2], h = s - l, u = a - c, d = i - f, p = Math.sqrt(h * h + u * u + d * d), y = p > 1e-6 ? .5 / p : 0;
			return {
				width: e,
				height: n,
				at(n, o) {
					const r = 3 * (o * e + n), h = t[r], u = t[r + 1], d = t[r + 2], p = h - s, g = u - a, m = d - i, w = h - l, M = u - c, x = d - f, b = (Math.sqrt(p * p + g * g + m * m) - Math.sqrt(w * w + M * M + x * x)) * y;
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
		return Ee(n.refineChain([{
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
		const o = Ie(t);
		let r = t;
		if (n) {
			r = Le(t, n);
			const e = r.length;
			r[0] = t[0], r[1] = t[1], r[e - 2] = t[e - 2], r[e - 1] = t[e - 1];
		}
		const s = ne(r, Gt(r), o, !1), a = s.length >> 1;
		if ("polygon" === e.curveMode || a <= 2) {
			const t = [];
			for (let e = 1; e < a; e++) t.push({
				type: "L",
				x: s[2 * e],
				y: s[2 * e + 1]
			});
			return t;
		}
		const i = function(t, e, n) {
			const o = t.length >> 1, r = [];
			for (let s = 1; s < o - 1; s++) r.push(Fe(t[2 * (s - 1)], t[2 * (s - 1) + 1], t[2 * s], t[2 * s + 1], t[2 * (s + 1)], t[2 * (s + 1) + 1], e, n));
			return r;
		}(s, 4 * e.smoothing / 3, e.cornerThreshold), l = [], c = (s[0] + s[2]) / 2, f = (s[1] + s[3]) / 2;
		return l.push({
			type: "L",
			x: c,
			y: f
		}), l.push(...be(c, f, i, e.curveOptimize, e.optTolerance)), l.push({
			type: "L",
			x: s[2 * (a - 1)],
			y: s[2 * (a - 1) + 1]
		}), l;
	}(o.points, n, r), o, n);
	if (!o.loop) return { open: s };
	const a = function(t, e, n) {
		const o = t.slice(0, t.length - 2), r = o.length >> 1;
		let s = 0;
		for (let i = 0; i < r; i++) {
			const t = (i + r - 1) % r, e = (i + 1) % r, n = o[2 * i] - o[2 * t], a = o[2 * i + 1] - o[2 * t + 1], l = o[2 * e] - o[2 * i];
			if (n * (o[2 * e + 1] - o[2 * i + 1]) - a * l !== 0) {
				s = i;
				break;
			}
		}
		const a = new Array(o.length);
		for (let i = 0; i < r; i++) {
			const t = (s + i) % r;
			a[2 * i] = o[2 * t], a[2 * i + 1] = o[2 * t + 1];
		}
		return Re(a, e, n);
	}(o.points, n, r);
	return {
		open: s,
		closed: n.refineChain ? n.refineChain(a) : a
	};
}
function Ke(t, e) {
	const { chains: n, areas: o } = t, r = t.width + 1, s = new Array(n.length).fill(null), a = (t) => {
		const n = t.chain, o = e[n].closed;
		return t.forward ? o : s[n] ??= se(o);
	}, i = (t) => {
		const o = t.chain;
		return t.forward ? e[o].open : s[o] ??= Ee(se([{
			type: "M",
			x: n[o].points[0],
			y: n[o].points[1]
		}, ...e[o].open]));
	}, l = /* @__PURE__ */ new Map(), c = (t, e) => e * r + t, f = (t, e) => {
		if (t < 0) return;
		const o = n[e.chain].points, r = e.forward ? o[0] : o[o.length - 2], s = e.forward ? o[1] : o[o.length - 1];
		let a = l.get(t);
		a || (a = /* @__PURE__ */ new Map(), l.set(t, a));
		const i = c(r, s);
		let f = a.get(i);
		f || (f = [], a.set(i, f)), f.push(e);
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
				r.used = !0, (r.forward ? o.shoelace : -o.shoelace) / 2 < 0 && e++, t.push(...a(r));
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
				s += p.forward ? t.shoelace : -t.shoelace, l.push(...i(p));
				const [e, o] = Ze(n, p), a = Oe(n, d.get(c(e, o)), Ne(n, p), r);
				if (!a || a === r) break;
				p = a;
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
function Oe(t, e, n, o) {
	if (!e) return null;
	for (const r of [
		1,
		0,
		3,
		2
	]) {
		const s = (n + r) % 4;
		for (const n of e) if ((n === o || !n.used) && De(t, n) === s) return n;
	}
	return null;
}
function De(t, e) {
	const n = t[e.chain];
	return e.forward ? n.firstDir : (n.lastDir + 2) % 4;
}
function Ne(t, e) {
	const n = t[e.chain];
	return e.forward ? n.lastDir : (n.firstDir + 2) % 4;
}
function Ze(t, e) {
	const n = t[e.chain].points;
	return e.forward ? [n[n.length - 2], n[n.length - 1]] : [n[0], n[1]];
}
function Ee(t) {
	return t.filter((t) => "M" !== t.type && "Z" !== t.type);
}
function We(t, e) {
	const n = t.length >> 1;
	if (n <= 2 || e <= 0) return t.slice();
	const o = new Uint8Array(n);
	o[0] = 1, o[n - 1] = 1;
	const r = [0, n - 1];
	for (; r.length > 0;) {
		const n = r.pop(), s = r.pop();
		let a = -1, i = -1;
		const l = t[2 * s], c = t[2 * s + 1], f = t[2 * n], h = t[2 * n + 1];
		for (let e = s + 1; e < n; e++) {
			const n = p(t[2 * e], t[2 * e + 1], l, c, f, h);
			n > a && (a = n, i = e);
		}
		a > e && i > 0 && (o[i] = 1, r.push(s, i, i, n));
	}
	const s = [];
	for (let a = 0; a < n; a++) o[a] && s.push(t[2 * a], t[2 * a + 1]);
	return s;
}
function Qe(t, e, n, o) {
	const r = t.length >> 1, s = new Float64Array(r);
	let a = 0;
	for (let c = 0; c < r; c++) {
		const r = Math.floor(t[2 * c]), i = Math.floor(t[2 * c + 1]);
		r < 0 || i < 0 || r >= n || i >= o || (s[a++] = 2 * e[i * n + r]);
	}
	if (0 === a) return;
	const i = s.subarray(0, a);
	i.sort();
	const l = a >> 1;
	return a % 2 == 1 ? i[l] : (i[l - 1] + i[l]) / 2;
}
function Xe(t, e) {
	return 3 * (e + 1) + (t + 1);
}
function Ye(t) {
	const e = t.length >> 1, n = new Array(t.length);
	for (let o = 0; o < e; o++) n[2 * o] = t[2 * (e - 1 - o)], n[2 * o + 1] = t[2 * (e - 1 - o) + 1];
	return n;
}
function Ge(t, e, n) {
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
function Ve(t) {
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
function Je(t, e) {
	return t[e] ?? t[e + 1] ?? "";
}
function _e(t, e) {
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
function tn(t) {
	const e = t.length;
	if (e < 3) return null;
	let n = 0, o = 0, r = 0, s = 0, a = 0, i = 0, l = 0, c = 0;
	for (const m of t) {
		const t = m.x * m.x + m.y * m.y;
		n += m.x * m.x, o += m.x * m.y, r += m.y * m.y, s += m.x, a += m.y, i += m.x * t, l += m.y * t, c += t;
	}
	const f = _e([
		[
			n,
			o,
			s
		],
		[
			o,
			r,
			a
		],
		[
			s,
			a,
			e
		]
	], [
		-i,
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
function en(t) {
	const e = t.length;
	if (e < 6) return null;
	let n = 0, o = 0;
	for (const z of t) n += z.x, o += z.y;
	n /= e, o /= e;
	let r = 0;
	for (const z of t) r += (z.x - n) ** 2 + (z.y - o) ** 2;
	const s = Math.sqrt(r / e) || 1, a = Array.from({ length: 6 }, () => new Array(6).fill(0));
	for (const z of t) {
		const t = (z.x - n) / s, e = (z.y - o) / s, r = [
			t * t,
			t * e,
			e * e,
			t,
			e,
			1
		];
		for (let n = 0; n < 6; n++) for (let t = 0; t < 6; t++) a[n][t] += r[n] * r[t];
	}
	const { values: i, vectors: l } = function(t) {
		const e = t.map((t) => [...t]), n = Array.from({ length: 6 }, (t, e) => Array.from({ length: 6 }, (t, n) => e === n ? 1 : 0));
		for (let o = 0; o < 100; o++) {
			let t = 0;
			for (let n = 0; n < 6; n++) for (let o = n + 1; o < 6; o++) t += e[n][o] * e[n][o];
			if (t < 1e-20) break;
			for (let o = 0; o < 6; o++) for (let t = o + 1; t < 6; t++) {
				if (Math.abs(e[o][t]) < 1e-18) continue;
				const r = (e[t][t] - e[o][o]) / (2 * e[o][t]), s = Math.sign(r || 1) / (Math.abs(r) + Math.sqrt(r * r + 1)), a = 1 / Math.sqrt(s * s + 1), i = s * a;
				for (let n = 0; n < 6; n++) {
					const r = e[n][o], s = e[n][t];
					e[n][o] = a * r - i * s, e[n][t] = i * r + a * s;
				}
				for (let n = 0; n < 6; n++) {
					const r = e[o][n], s = e[t][n];
					e[o][n] = a * r - i * s, e[t][n] = i * r + a * s;
				}
				for (let e = 0; e < 6; e++) {
					const r = n[e][o], s = n[e][t];
					n[e][o] = a * r - i * s, n[e][t] = i * r + a * s;
				}
			}
		}
		return {
			values: e.map((t, e) => t[e]),
			vectors: n
		};
	}(a);
	let c = 0;
	for (let z = 1; z < 6; z++) i[z] < i[c] && (c = z);
	const [f, h, u, d, p, y] = l.map((t) => t[c]);
	if (h * h - 4 * f * u >= 0) return null;
	const g = _e([[2 * f, h], [h, 2 * u]], [-d, -p]);
	if (!g) return null;
	const [m, w] = g, M = f * m * m + h * m * w + u * w * w + d * m + p * w + y, x = f + u, b = f * u - h * h / 4, A = Math.sqrt(Math.max(0, x * x / 4 - b)), k = x / 2 + A, v = x / 2 - A;
	if (0 === k || 0 === v) return null;
	const I = -M / k, $ = -M / v;
	if (I <= 0 || $ <= 0) return null;
	const F = Math.sqrt(I), S = Math.sqrt($), C = Math.abs(h) < 1e-12 && Math.abs(f - k) < 1e-12 ? 0 : Math.atan2(k - f, h / 2);
	let L, P, R;
	for (F >= S ? (L = F, P = S, R = C) : (L = S, P = F, R = C + Math.PI / 2); R > Math.PI / 2;) R -= Math.PI;
	for (; R <= -Math.PI / 2;) R += Math.PI;
	return {
		cx: n + m * s,
		cy: o + w * s,
		rx: L * s,
		ry: P * s,
		angle: R
	};
}
function nn(t, e) {
	let n = t.toFixed(on(e));
	return n.includes(".") && (n = n.replace(/\.?0+$/, "")), "-0" === n && (n = "0"), n;
}
function on(t) {
	const e = Math.round(t);
	return e < 0 ? 0 : e > 4 ? 4 : e;
}
function rn(t, e, n) {
	const o = 1 - n, r = o * o * o, s = 3 * o * o * n, a = 3 * o * n * n, i = n * n * n;
	return {
		x: r * t.x + s * e.x1 + a * e.x2 + i * e.x,
		y: r * t.y + s * e.y1 + a * e.y2 + i * e.y
	};
}
function sn(t, e) {
	let n = t - e;
	for (; n > Math.PI;) n -= 2 * Math.PI;
	for (; n <= -Math.PI;) n += 2 * Math.PI;
	return n;
}
function an(t, e, n, o) {
	const r = m(t.x, t.y, e);
	if (null === r) return !1;
	const { cx: s, cy: a, rx: i, ry: l, phi: c, theta1: f, dTheta: h } = r, u = Math.cos(c), d = Math.sin(c), p = Math.min(i, l), y = 2 * Math.PI, g = (t) => {
		let e = t - f;
		return h >= 0 ? (e = (e % y + y) % y, e <= h + 1e-6) : (e = -(-e % y + y) % y, e >= h - 1e-6);
	};
	for (const m of n) {
		const t = m.x - s, e = m.y - a, n = (t * u + e * d) / i, r = (-t * d + e * u) / l;
		if (Math.abs(Math.hypot(n, r) - 1) * p > o) return !1;
		if (!g(Math.atan2(r, n))) return !1;
	}
	return !0;
}
function ln(t, e, n) {
	const o = [t];
	let r = t;
	for (const m of e) o.push(rn(r, m, .25), rn(r, m, .5), rn(r, m, .75), {
		x: m.x,
		y: m.y
	}), r = {
		x: m.x,
		y: m.y
	};
	const s = r, a = function(t) {
		const e = tn(t);
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
		const n = en(t);
		if (null !== n && n.rx > 0 && n.ry > 0) {
			const e = .6, o = Math.cos(n.angle), r = Math.sin(n.angle);
			if (t.every((t) => {
				const s = t.x - n.cx, a = t.y - n.cy, i = (s * o + a * r) / n.rx, l = (-s * r + a * o) / n.ry;
				return Math.abs(Math.hypot(i, l) - 1) * Math.min(n.rx, n.ry) <= e;
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
	if (null === a) return null;
	const { cx: i, cy: l, tol: c } = a, f = o.map((t) => Math.atan2(t.y - l, t.x - i));
	let h = 0, u = 0;
	for (let m = 1; m < f.length; m++) {
		const t = sn(f[m], f[m - 1]);
		if (Math.abs(t) > 1e-4) {
			const e = Math.sign(t);
			if (0 !== u && e !== u) return null;
			u = e;
		}
		h += t;
	}
	const d = Math.abs(h);
	if (d < .5 || d > 2 * Math.PI - .2) return null;
	const p = on(n), y = (t) => Number(t.toFixed(p)), g = y(a.rx), w = y(a.ry), M = y(180 * a.angle / Math.PI), x = y(s.x), b = y(s.y);
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
		if (null !== r && !(Math.hypot(r.cx - i, r.cy - l) > c) && an(t, n, o, c)) return n;
	}
	return null;
}
function cn(t, e) {
	const n = [];
	let o = 0, r = 0, s = 0, a = 0, i = null;
	const l = () => {
		if (null !== i) {
			if (i.cubics.length >= 2) for (const t of function(t, e, n) {
				const o = [];
				let r = t, s = 0;
				for (; s < e.length;) {
					let t = null, a = 0;
					for (let o = 2; s + o <= e.length; o++) {
						const i = ln(r, e.slice(s, s + o), n);
						if (null === i) break;
						t = i, a = o;
					}
					if (null !== t) {
						o.push(t);
						const n = e[s + a - 1];
						r = {
							x: n.x,
							y: n.y
						}, s += a;
					} else o.push(e[s]), r = {
						x: e[s].x,
						y: e[s].y
					}, s++;
				}
				return o;
			}(i.start, i.cubics, e)) n.push(t);
			else for (const t of i.cubics) n.push(t);
			i = null;
		}
	};
	for (const c of t) if ("C" !== c.type) switch (l(), n.push(c), c.type) {
		case "M":
			o = c.x, r = c.y, s = c.x, a = c.y;
			break;
		case "L":
		case "Q":
		case "A":
			o = c.x, r = c.y;
			break;
		case "Z": o = s, r = a;
	}
	else null === i && (i = {
		start: {
			x: o,
			y: r
		},
		cubics: []
	}), i.cubics.push(c), o = c.x, r = c.y;
	return l(), n;
}
const fn = [
	1,
	10,
	100,
	1e3,
	1e4
], hn = [
	"",
	"0",
	"00",
	"000",
	"0000"
], un = 0x38d7ea4c68000;
function dn(t) {
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
function pn(t, e) {
	const n = t < 0;
	let o = String(Math.abs(t));
	o.length <= e && (o = "0".repeat(e - o.length + 1) + o);
	const r = o.length - e, s = o.slice(0, r);
	let a = o.length;
	for (; a > r && 48 === o.charCodeAt(a - 1);) a--;
	const i = a > r ? `${s}.${o.slice(r, a)}` : s;
	return n && "0" !== i ? `-${i}` : i;
}
function yn(t, e) {
	if (0 === e) return String(0 | t);
	const n = t < 0 ? -t : t;
	if (!(n <= un && Number.isInteger(n))) return pn(t, e);
	const o = fn[e], r = n % o, s = (n - r) / o;
	if (0 === r) return t < 0 ? `-${s}` : `${s}`;
	let a = r, i = e;
	for (; a % 10 == 0;) a /= 10, i--;
	const l = `${hn[i - dn(a)]}${a}`;
	return t < 0 ? `-${s}.${l}` : `${s}.${l}`;
}
function gn(t, e) {
	if (0 === e) {
		const e = 0 | t;
		return dn(e < 0 ? -e : e);
	}
	const n = t < 0 ? -t : t;
	if (!(n <= un && Number.isInteger(n))) {
		const n = pn(t, e);
		return 45 === n.charCodeAt(0) ? n.length - 1 : n.length;
	}
	const o = fn[e], r = n % o, s = (n - r) / o;
	if (0 === r) return dn(s);
	let a = r, i = e;
	for (; a % 10 == 0;) a /= 10, i--;
	return dn(s) + 1 + i;
}
function mn(t, e, n) {
	const o = t * n, r = Math.round(o);
	return Math.abs(o - r) < .5 - (2e-16 * Math.abs(o) + 1e-9) ? r : Math.round(Number(t.toFixed(e)) * n);
}
function wn(t) {
	return "Z" === t.type ? 0 : t.x;
}
function Mn(t) {
	return "Z" === t.type ? 0 : t.y;
}
const xn = (t) => "L" === t.type, bn = (t) => "C" === t.type, An = (t) => "L" === t.type || "C" === t.type;
function kn(t, e, n) {
	const o = 1 - n, r = o * o * o, s = 3 * o * o * n, a = 3 * o * n * n, i = n * n * n;
	return {
		x: r * t.x + s * e.x1 + a * e.x2 + i * e.x,
		y: r * t.y + s * e.y1 + a * e.y2 + i * e.y
	};
}
function vn(t, e, n, o, r, s, a) {
	const i = Math.abs(t - n) - (r - a), l = Math.abs(e - o) - (s - a), c = Math.max(i, 0), f = Math.max(l, 0);
	return (0 === f ? c : 0 === c ? f : Math.hypot(c, f)) + Math.min(Math.max(i, l), 0) - a;
}
function In(t, e) {
	let n = t - e;
	for (; n > Math.PI;) n -= 2 * Math.PI;
	for (; n <= -Math.PI;) n += 2 * Math.PI;
	return n;
}
function $n(t, e, n, o, r, s) {
	const a = r - n, i = s - o, l = a * a + i * i;
	let c = l > 0 ? ((t - n) * a + (e - o) * i) / l : 0;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (n + c * a), e - (o + c * i));
}
const Fn = (t) => (t * (t - 1) >> 1) - 3;
function Sn(t, e) {
	const n = on(e), o = (t) => Number(t.toFixed(n));
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
function Cn(t, e, n) {
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
	if (r.every(xn)) {
		const t = function(t, e, n) {
			const o = function(t, e, n) {
				const o = [t];
				for (const a of e) o.push({
					x: a.x,
					y: a.y
				});
				const r = o[0], s = o[o.length - 1];
				return o.length > 1 && Math.round(r.x * n) === Math.round(s.x * n) && Math.round(r.y * n) === Math.round(s.y * n) && o.pop(), o;
			}(t, e, n);
			if (4 !== o.length) return null;
			const r = o.map((t) => Math.round(t.x * n)), s = o.map((t) => Math.round(t.y * n)), a = Math.min(...r), i = Math.max(...r), l = Math.min(...s), c = Math.max(...s);
			if (i === a || c === l) return null;
			for (let f = 0; f < 4; f++) {
				if (r[f] !== a && r[f] !== i || s[f] !== l && s[f] !== c) return null;
				const t = (f + 1) % 4;
				if (r[f] !== r[t] && s[f] !== s[t]) return null;
			}
			return 4 !== new Set(r.map((t, e) => `${t},${s[e]}`)).size ? null : {
				kind: "rect",
				x: a / n,
				y: l / n,
				width: (i - a) / n,
				height: (c - l) / n
			};
		}(o.start, r, 10 ** on(e));
		if (t) return t;
	}
	if (!n) return null;
	if (r.length >= 3 && r.every(bn)) {
		const t = function(t, e, n) {
			const o = [t];
			let r = t;
			for (const i of e) o.push(kn(r, i, .25), kn(r, i, .5), kn(r, i, .75)), o.push({
				x: i.x,
				y: i.y
			}), r = {
				x: i.x,
				y: i.y
			};
			const s = tn(o);
			if (s && s.r > 0) {
				const t = .6;
				if (o.every((e) => Math.abs(Math.hypot(e.x - s.cx, e.y - s.cy) - s.r) <= t)) return Sn({
					kind: "circle",
					cx: s.cx,
					cy: s.cy,
					r: s.r
				}, n);
			}
			const a = en(o);
			if (a && a.rx > 0 && a.ry > 0) {
				const t = .6, e = Math.cos(a.angle), r = Math.sin(a.angle);
				if (o.every((n) => {
					const o = n.x - a.cx, s = n.y - a.cy, i = (o * e + s * r) / a.rx, l = (-o * r + s * e) / a.ry;
					return Math.abs(Math.hypot(i, l) - 1) * Math.min(a.rx, a.ry) <= t;
				})) {
					const t = 180 * a.angle / Math.PI, e = Math.abs(t) < .5 ? void 0 : t;
					return Sn({
						kind: "ellipse",
						cx: a.cx,
						cy: a.cy,
						rx: a.rx,
						ry: a.ry,
						...void 0 !== e ? { angle: e } : {}
					}, n);
				}
			}
			return null;
		}(o.start, r, e);
		if (t) return t;
	}
	if (r.length >= 4 && r.some(bn) && r.every(An)) {
		const t = function(t, e, n) {
			const o = 1 + 2 * e.length, r = new Float64Array(o), s = new Float64Array(o);
			r[0] = t.x, s[0] = t.y;
			let a = t.x, i = t.y, l = 1;
			for (const v of e) "C" === v.type ? (r[l] = .125 * a + .375 * v.x1 + .375 * v.x2 + .125 * v.x, s[l] = .125 * i + .375 * v.y1 + .375 * v.y2 + .125 * v.y) : (r[l] = (a + v.x) / 2, s[l] = (i + v.y) / 2), r[l + 1] = v.x, s[l + 1] = v.y, l += 2, a = v.x, i = v.y;
			let c = 1 / 0, f = -1 / 0, h = 1 / 0, u = -1 / 0;
			for (let v = 0; v < o; v++) c = Math.min(c, r[v]), f = Math.max(f, r[v]), h = Math.min(h, s[v]), u = Math.max(u, s[v]);
			const d = (c + f) / 2, p = (h + u) / 2, y = (f - c) / 2, g = (u - h) / 2;
			if (y <= 0 || g <= 0) return null;
			const m = Math.min(y, g), w = Math.max(.75, .03 * m), M = .3 * m + w;
			for (let v = 0; v < o; v++) if (Math.min(y - Math.abs(r[v] - d), g - Math.abs(s[v] - p)) > M) return null;
			const x = (t, e) => {
				let n = 0;
				for (let a = 0; a < o; a++) {
					const o = Math.abs(vn(r[a], s[a], d, p, y, g, t));
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
				let r = n - o * (n - e), s = e + o * (n - e), a = t(r), i = t(s);
				for (let l = 0; l < 40; l++) a < i ? (n = s, s = r, i = a, r = n - o * (n - e), a = t(r)) : (e = r, r = s, a = i, s = e + o * (n - e), i = t(s));
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
			for (const a of e) if ("C" === a.type) {
				for (let t = 0; t < 8; t++) {
					const e = t / 8, i = 1 - e, l = i * i * i, c = 3 * i * i * e, f = 3 * i * e * e, h = e * e * e;
					n.push(l * r + c * a.x1 + f * a.x2 + h * a.x), o.push(l * s + c * a.y1 + f * a.y2 + h * a.y);
				}
				r = a.x, s = a.y;
			} else if ("Q" === a.type) {
				for (let t = 0; t < 8; t++) {
					const e = t / 8, i = 1 - e;
					n.push(i * i * r + 2 * i * e * a.x1 + e * e * a.x), o.push(i * i * s + 2 * i * e * a.y1 + e * e * a.y);
				}
				r = a.x, s = a.y;
			} else if ("L" === a.type) {
				const t = Math.max(1, Math.round(Math.hypot(a.x - r, a.y - s) / 2));
				for (let e = 0; e < t; e++) n.push(r + (a.x - r) * e / t), o.push(s + (a.y - s) * e / t);
				r = a.x, s = a.y;
			}
			if (Math.hypot(r - t.x, s - t.y) > 1e-6) {
				const e = Math.max(1, Math.round(Math.hypot(t.x - r, t.y - s) / 2));
				for (let a = 0; a < e; a++) n.push(r + (t.x - r) * a / e), o.push(s + (t.y - s) * a / e);
			}
		})(t, e, o, r);
		const s = o.length;
		if (s < 24) return null;
		let a = 0, i = 0;
		for (let z = 0; z < s; z++) a += o[z], i += r[z];
		const l = a / s, c = i / s, f = new Float64Array(s), h = new Float64Array(s);
		let u = -1 / 0, d = 1 / 0, p = -1 / 0, y = 1 / 0, g = -1 / 0;
		for (let z = 0; z < s; z++) f[z] = Math.hypot(o[z] - l, r[z] - c), h[z] = Math.atan2(r[z] - c, o[z] - l), u = Math.max(u, f[z]), d = Math.min(d, o[z]), p = Math.max(p, o[z]), y = Math.min(y, r[z]), g = Math.max(g, r[z]);
		if (u < 3) return null;
		const m = Math.min(4, Math.max(.8, .045 * u)), w = (t, e, n) => {
			let o = 1 / 0, r = -1 / 0, s = 1 / 0, a = -1 / 0;
			for (let l = 0; l < n; l++) t[l] < o && (o = t[l]), t[l] > r && (r = t[l]), e[l] < s && (s = e[l]), e[l] > a && (a = e[l]);
			const i = 2 * m;
			return Math.abs(o - d) <= i && Math.abs(r - p) <= i && Math.abs(s - y) <= i && Math.abs(a - g) <= i;
		}, M = (t, e, n, a, i) => {
			let l = 0;
			for (let c = 0; c < s; c++) {
				const s = h[c];
				let f = !1;
				for (let t = 0; t < a; t++) if (Math.abs(In(s, n[t])) < i) {
					f = !0;
					break;
				}
				if (f) continue;
				let u = 1 / 0;
				for (let n = 0; n < a && u > m; n++) {
					const s = (n + 1) % a, i = $n(o[c], r[c], t[n], e[n], t[s], e[s]);
					i < u && (u = i);
				}
				if (u > m) return !1;
				l++;
			}
			return l >= a;
		};
		let x = 0;
		for (let z = 1; z < s; z++) f[z] > f[x] && (x = z);
		const b = h[x], A = /* @__PURE__ */ new Float64Array(75), k = /* @__PURE__ */ new Float64Array(75), v = /* @__PURE__ */ new Uint8Array(75), I = /* @__PURE__ */ new Uint8Array(75), $ = /* @__PURE__ */ new Uint8Array(13), F = (t) => {
			if (1 === $[t]) return;
			$[t] = 1;
			const e = Fn(t), n = 2 * Math.PI / t, o = n / 5;
			for (let r = 0; r < t; r++) A[e + r] = -1 / 0, k[e + r] = 1 / 0;
			for (let r = 0; r < s; r++) {
				const s = h[r], a = (s - b) / n, i = Math.floor(a), l = a - i;
				if (l < .200000001 || l > .799999999) {
					let a = (0 | (l < .5 ? i : i + 1)) % t;
					a < 0 && (a += t), Math.abs(In(s, b + a * n)) <= o && (v[e + a] = 1, f[r] > A[e + a] && (A[e + a] = f[r]));
				} else if (l > .29999999899999996 && l < .700000001) {
					let a = (0 | i) % t;
					a < 0 && (a += t), Math.abs(In(s, b + (a + .5) * n)) <= o && (I[e + a] = 1, f[r] < k[e + a] && (k[e + a] = f[r]));
				}
			}
		}, S = (t) => {
			const e = Fn(t);
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
			if (F(z), !S(z)) continue;
			const t = Fn(z), e = 2 * Math.PI / z;
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
			if (F(z), !S(z)) continue;
			const t = Fn(z), e = 2 * Math.PI / z;
			let o = 0, r = 0;
			for (let n = 0; n < z; n++) o += A[t + n], r += k[t + n];
			const s = o / z, a = r / z;
			if (!(a >= s * Math.cos(Math.PI / z) - m)) {
				for (let t = 0; t < 2 * z; t++) {
					const n = b + t * e / 2;
					P[t] = n;
					const o = t % 2 == 0 ? s : a;
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
const Ln = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function Pn(t) {
	return t.replace(/[&<>"']/g, (t) => Ln[t]);
}
function Rn(t, e) {
	if (t.includes("<") || t.includes("\"")) throw new Error(`unsafe ${e} in SVG output: ${JSON.stringify(t)}`);
	return t;
}
function zn(t, e, n) {
	let o = "";
	return o += ` fill="${void 0 === t.fill ? "none" : Rn(t.fill, "fill")}"`, n && void 0 !== t.fillRule && (o += ` fill-rule="${t.fillRule}"`), void 0 !== t.stroke && (o += ` stroke="${Rn(t.stroke, "stroke")}"`), void 0 !== t.strokeWidth && (o += ` stroke-width="${nn(t.strokeWidth, e)}"`), void 0 !== t.strokeLinecap && (o += ` stroke-linecap="${t.strokeLinecap}"`), void 0 !== t.strokeLinejoin && (o += ` stroke-linejoin="${t.strokeLinejoin}"`), void 0 !== t.id && "" !== t.id && (o += ` id="${Pn(t.id)}"`), o;
}
function Un(t, e, n) {
	const o = zn(e, n, !1), r = (t) => nn(t, n);
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
function Tn(t, e) {
	if ("" === t.content) return "";
	const n = (t) => nn(t, e);
	let o = `x="${n(t.x)}" y="${n(t.y)}"`;
	return void 0 !== t.angle && Math.abs(t.angle) > .05 && (o += ` transform="rotate(${n(t.angle)} ${n(t.x)} ${n(t.y)})"`), o += ` font-family="${Pn(t.fontFamily)}" font-size="${n(t.fontSize)}"`, o += ` font-weight="${nn(t.fontWeight, 0)}"`, "italic" === t.fontStyle && (o += " font-style=\"italic\""), void 0 !== t.anchor && "start" !== t.anchor && (o += ` text-anchor="${t.anchor}"`), o += ` fill="${Rn(t.fill, "text fill")}"`, `<text ${o}>${Pn(t.content)}</text>`;
}
function qn(t, e, n, o) {
	if (0 === t.commands.length) return null;
	if (void 0 === t.fill && void 0 === t.stroke) return null;
	if (n) {
		const n = function(t, e) {
			const n = 10 ** on(e);
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
				for (const a of t.ops) o.push({
					x: wn(a),
					y: Mn(a),
					edge: a.type,
					op: a
				});
				const r = o.slice(0, 1);
				for (let a = 1; a < o.length; a++) {
					let t = o[a];
					for (; r.length >= 2 && "L" === r[r.length - 1].edge && "L" === t.edge;) {
						const e = r[r.length - 2], o = r[r.length - 1], s = n(e.x), a = n(e.y), i = n(o.x), l = n(o.y), c = n(t.x), f = n(t.y), h = (i - s) * (c - s) + (l - a) * (f - a);
						if (!(0 === (i - s) * (f - a) - (l - a) * (c - s) && h >= 0 && h <= (c - s) * (c - s) + (f - a) * (f - a))) break;
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
				for (let a = 1; a < r.length; a++) s.push(r[a].op);
				return {
					start: t.start,
					ops: s,
					closed: t.closed
				};
			}(t, n)));
		}(t.commands, e), r = Cn(n, e, o);
		if (null !== r) return {
			kind: "element",
			svg: Un(r, t, e)
		};
		const s = Rn(function(t, e) {
			const n = on(e), o = fn[n];
			let r = 0, s = 0, a = 0, i = 0, l = !1, c = "";
			const f = /* @__PURE__ */ new Float64Array(6), h = /* @__PURE__ */ new Float64Array(6), u = (t, e, o, r) => {
				c += "" === c ? t : ` ${t}`;
				for (let s = o; s < o + r; s++) {
					const t = yn(e[s], n);
					45 !== t.charCodeAt(0) && (c += " "), c += t;
				}
			}, d = (t, e, o, r) => {
				u(t, f, 0, 3), c += ` ${o} ${r}`;
				for (let s = 3; s < 5; s++) {
					const t = yn(e[s], n);
					45 !== t.charCodeAt(0) && (c += " "), c += t;
				}
			};
			for (const p of t) switch (p.type) {
				case "M": {
					const t = mn(p.x, n, o), e = mn(p.y, n, o);
					if (f[0] = t, f[1] = e, l) {
						h[0] = t - r, h[1] = e - s;
						const o = gn(t, n) + gn(e, n);
						gn(h[0], n) + gn(h[1], n) < o ? u("m", h, 0, 2) : u("M", f, 0, 2);
					} else u("M", f, 0, 2), l = !0;
					r = t, s = e, a = t, i = e;
					break;
				}
				case "L": {
					const t = mn(p.x, n, o), e = mn(p.y, n, o);
					f[0] = t, f[1] = e, h[0] = t - r, h[1] = e - s;
					let a = "L", i = f, l = 0, c = 2, d = gn(t, n) + gn(e, n) + 2;
					const y = gn(h[0], n) + gn(h[1], n) + 2;
					if (y < d && (d = y, a = "l", i = h), e === s) {
						const e = gn(t, n) + 1;
						e < d && (d = e, a = "H", i = f, l = 0, c = 1);
						const o = gn(h[0], n) + 1;
						o < d && (d = o, a = "h", i = h, l = 0, c = 1);
					}
					if (t === r) {
						const t = gn(e, n) + 1;
						t < d && (d = t, a = "V", i = f, l = 1, c = 1);
						const o = gn(h[1], n) + 1;
						o < d && (d = o, a = "v", i = h, l = 1, c = 1);
					}
					u(a, i, l, c), r = t, s = e;
					break;
				}
				case "Q": {
					f[0] = mn(p.x1, n, o), f[1] = mn(p.y1, n, o), f[2] = mn(p.x, n, o), f[3] = mn(p.y, n, o), h[0] = f[0] - r, h[1] = f[1] - s, h[2] = f[2] - r, h[3] = f[3] - s;
					let t = 0, e = 0;
					for (let o = 0; o < 4; o++) t += gn(f[o], n), e += gn(h[o], n);
					e < t ? u("q", h, 0, 4) : u("Q", f, 0, 4), r = f[2], s = f[3];
					break;
				}
				case "C": {
					f[0] = mn(p.x1, n, o), f[1] = mn(p.y1, n, o), f[2] = mn(p.x2, n, o), f[3] = mn(p.y2, n, o), f[4] = mn(p.x, n, o), f[5] = mn(p.y, n, o);
					for (let n = 0; n < 6; n += 2) h[n] = f[n] - r, h[n + 1] = f[n + 1] - s;
					let t = 0, e = 0;
					for (let o = 0; o < 6; o++) t += gn(f[o], n), e += gn(h[o], n);
					e < t ? u("c", h, 0, 6) : u("C", f, 0, 6), r = f[4], s = f[5];
					break;
				}
				case "A": {
					f[0] = mn(p.rx, n, o), f[1] = mn(p.ry, n, o), f[2] = mn(p.rotation, n, o), f[3] = mn(p.x, n, o), f[4] = mn(p.y, n, o), h[3] = f[3] - r, h[4] = f[4] - s;
					const t = gn(f[3], n) + gn(f[4], n);
					gn(h[3], n) + gn(h[4], n) < t ? d("a", h, p.largeArc ? 1 : 0, p.sweep ? 1 : 0) : d("A", f, p.largeArc ? 1 : 0, p.sweep ? 1 : 0), r = f[3], s = f[4];
					break;
				}
				case "Z": c += "" === c ? "Z" : " Z", r = a, s = i;
			}
			return c;
		}(o ? cn(n, e) : n, e), "path data");
		return "" === s ? null : {
			kind: "path",
			d: s,
			paint: zn(t, e, !0)
		};
	}
	const r = Rn(function(t, e) {
		const n = on(e);
		let o = "";
		const r = (t) => {
			"" !== o && 45 !== t.charCodeAt(0) && (o += " "), o += t;
		}, s = (t) => {
			r(nn(t, n));
		};
		for (const a of t) switch (a.type) {
			case "M":
			case "L":
				r(a.type), s(a.x), s(a.y);
				break;
			case "Q":
				r("Q"), s(a.x1), s(a.y1), s(a.x), s(a.y);
				break;
			case "C":
				r("C"), s(a.x1), s(a.y1), s(a.x2), s(a.y2), s(a.x), s(a.y);
				break;
			case "A":
				r("A"), s(a.rx), s(a.ry), s(a.rotation), r(a.largeArc ? "1" : "0"), r(a.sweep ? "1" : "0"), s(a.x), s(a.y);
				break;
			case "Z": r("Z");
		}
		return o;
	}(t.commands, e), "path data");
	return "" === r ? null : {
		kind: "element",
		svg: `<path d="${r}"${zn(t, e, !0)}/>`
	};
}
function Bn(t, e, n, o, r, s) {
	const a = [];
	let i = null;
	const l = () => {
		null !== i && (a.push(`<path d="${i.d}"${i.paint}/>`), i = null);
	};
	for (const c of e) {
		const e = void 0 !== s && c < s.length ? s[c] : qn(t[c], n, o, r);
		null !== e && ("element" === e.kind ? (l(), a.push(e.svg)) : !0 === t[c].unfoldable ? (l(), a.push(`<path d="${e.d}"${e.paint}/>`)) : null !== i && i.paint === e.paint ? i.d += ` ${e.d}` : (l(), i = {
			d: e.d,
			paint: e.paint
		}));
	}
	return l(), a;
}
function Hn(t) {
	return void 0 !== t.fill && "none" !== t.fill ? t.fill : t.stroke ?? "";
}
function jn(t, e, n) {
	if (!t) return null;
	const o = t.width === e && t.height === n ? t : S(t, e, n), r = new Uint8Array(e * n);
	for (let s = 0; s < r.length; s++) r[s] = o.data[s] > .5 ? 1 : 0;
	return {
		width: e,
		height: n,
		data: r
	};
}
const Kn = {
	preprocess: .12,
	palette: .2,
	segment: .08,
	trace: .48,
	fit: 0,
	svg: .12
}, On = [
	"preprocess",
	"palette",
	"segment",
	"trace",
	"svg"
];
var Dn = class {
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
		for (const n of On) {
			if (n === this.currentStage) break;
			e += Kn[n];
		}
		e += Kn[this.currentStage] * Math.min(1, Math.max(0, t)), this.ctx.onProgress(this.currentStage, Math.min(1, e));
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
function Nn(t) {
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
function Zn(t, e, n) {
	const o = t.palette ??= /* @__PURE__ */ new Map();
	for (o.delete(e), o.set(e, n); o.size > 4;) {
		const t = o.keys().next().value;
		if (void 0 === t) break;
		o.delete(t);
	}
}
function En(t, e, n, o, r) {
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
	})), a = t.map((t) => ({
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
		shapes: a,
		gradients: s.length > 0 ? s : void 0
	};
}
let Wn = 0;
async function Qn(t, e, o, r) {
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
	}(e), a = k(), l = new Dn(o), f = [], h = r?.cache, u = r?.imageId, p = void 0 !== h && void 0 !== u, g = void 0 !== r?.helpers && r.helpers.size > 0 ? r.helpers : void 0, m = ++Wn;
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
	if (p && h.imageId === u && h.preKey === I && h.workImage) z = h.workImage, U = h.opaque ?? null, T = h.alpha ?? null, Nn(h).preHits++, l.progress(1);
	else {
		let e = F(t, s.maxDimension);
		l.progress(.3), "median" === s.denoise ? e = function(t) {
			const { width: e, height: n, data: o } = t, r = Math.max(1, Math.round(1)), a = 9, i = new Int32Array(a), l = new Int32Array(a), c = new Int32Array(a), f = new Uint8ClampedArray(e * n * 4);
			for (let h = 0; h < n; h++) {
				const t = h - r < 0 ? 0 : h - r, s = h + r >= n ? n - 1 : h + r;
				for (let n = 0; n < e; n++) {
					const a = n - r < 0 ? 0 : n - r, u = n + r >= e ? e - 1 : n + r;
					let d = 0;
					for (let n = t; n <= s; n++) {
						const t = n * e;
						for (let e = a; e <= u; e++) {
							const n = 4 * (t + e);
							i[d] = o[n], l[d] = o[n + 1], c[d] = o[n + 2], d++;
						}
					}
					C(i, d), C(l, d), C(c, d);
					const p = d >> 1, y = 4 * (h * e + n);
					f[y] = i[p], f[y + 1] = l[p], f[y + 2] = c[p], f[y + 3] = o[y + 3];
				}
			}
			return {
				width: e,
				height: n,
				data: f
			};
		}(e) : "bilateral" === s.denoise && (e = function(t) {
			const { width: e, height: n, data: o } = t;
			const r = Math.max(1, Math.round(2)), s = 5, a = /* @__PURE__ */ new Float64Array(25);
			for (let c = -2; c <= r; c++) for (let t = -2; t <= r; t++) a[(c + r) * s + (t + r)] = Math.exp(-(t * t + c * c) / 8);
			const i = /* @__PURE__ */ new Float64Array(256);
			for (let c = 0; c < 256; c++) i[c] = Math.exp(-c * c / 2450);
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
						const I = a[M + (n + r)] * i[v];
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
			const s = e / 2, a = Math.ceil(3 * s), i = new Float64Array(2 * a + 1);
			let l = 0;
			for (let h = -a; h <= a; h++) {
				const t = Math.exp(-h * h / (2 * s * s));
				i[h + a] = t, l += t;
			}
			for (let h = 0; h < i.length; h++) i[h] /= l;
			const c = new Float32Array(n * o * 4);
			for (let h = 0; h < o; h++) {
				const t = h * n;
				for (let e = 0; e < n; e++) {
					let o = 0, s = 0, l = 0, f = 0;
					for (let c = -a; c <= a; c++) {
						let h = e + c;
						h < 0 ? h = 0 : h >= n && (h = n - 1);
						const u = i[c + a], d = 4 * (t + h);
						o += r[d] * u, s += r[d + 1] * u, l += r[d + 2] * u, f += r[d + 3] * u;
					}
					const h = 4 * (t + e);
					c[h] = o, c[h + 1] = s, c[h + 2] = l, c[h + 3] = f;
				}
			}
			const f = new Uint8ClampedArray(n * o * 4);
			for (let h = 0; h < o; h++) for (let t = 0; t < n; t++) {
				let e = 0, r = 0, s = 0, l = 0;
				for (let f = -a; f <= a; f++) {
					let u = h + f;
					u < 0 ? u = 0 : u >= o && (u = o - 1);
					const d = i[f + a], p = 4 * (u * n + t);
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
			let a;
			if ("custom" === e.background) a = "custom";
			else if ("transparent" === e.background) a = "transparent";
			else {
				a = "opaque";
				for (let t = 3; t < r.length; t += 4) if (r[t] < 250) {
					a = "transparent";
					break;
				}
			}
			if ("custom" === a) {
				const n = i(e.backgroundColor) ?? [
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
			if ("opaque" === a) return {
				image: l,
				opaque: null,
				alpha: null
			};
			const c = w(n, o), f = new Uint8Array(s), h = e.alphaThreshold;
			for (let i = 0, u = 3; i < s; i++, u += 4) f[i] = r[u], c.data[i] = r[u] >= h ? 1 : 0;
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
		}(e), z = e, p && (Nn(h).preMisses++, h.imageId = u, h.preKey = I, h.workImage = z, h.opaque = U, h.alpha = T, h.palette = /* @__PURE__ */ new Map(), h.ink = void 0);
	}
	const { width: q, height: B } = z;
	await l.tick(), l.tracing && l.emitStep(() => {
		const e = [];
		return q === t.width && B === t.height || e.push(`Resized ${t.width}×${t.height} → ${q}×${B}.`), "none" !== s.denoise && e.push(`Denoise: ${s.denoise}.`), s.blurRadius > 0 && e.push(`Blur radius ${s.blurRadius}.`), "grayscale" === s.mode && e.push("Desaturated for grayscale tracing."), {
			code: "preprocess",
			label: "Preprocess",
			rasters: [Bt(t, "Source"), Bt(z, "grayscale" === s.mode ? "Working (gray)" : "Working")],
			charts: [Kt(z)],
			metrics: {
				sourceWidth: t.width,
				sourceHeight: t.height,
				workWidth: q,
				workHeight: B,
				scalePercent: Math.round(q / t.width * 100)
			},
			notes: e.length > 0 ? e : void 0
		};
	});
	const H = [], j = [];
	let K = [];
	const O = [], D = s.optimizeSvg && "cutout" !== s.layering, N = {
		precision: s.precision,
		optimize: s.optimizeSvg,
		roundPrimitives: D
	}, Z = p ? `${u}|${I}` : `#${m}`;
	"color" === s.mode || "grayscale" === s.mode ? await async function(t, e, o, r, s, a, l, f, h, u, d, p, y, g) {
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
		}(s) : void 0, M = jn(d, e.width, e.height);
		let x, k, v, I, $, F, S;
		const C = m && p && p.imageId === y && void 0 !== w ? function(t, e) {
			const n = t.palette;
			if (!n) return;
			const o = n.get(e);
			return o && (n.delete(e), n.set(e, o)), o;
		}(p, w) : void 0;
		let L = C;
		if (C) x = C.labels, k = C.paletteHex, v = C.paletteRgb, I = C.counts, $ = C.paletteClampedTo, F = C.gradients, S = C.underlays, Nn(p).palHits++, await t.tick(), t.stage("segment"), await t.tick();
		else if ("regions" === s.segmentation && null === s.palette) {
			m && Nn(p).palMisses++;
			const n = St(e, {
				mergeThreshold: .1,
				mergeSizeBias: .8,
				minRegionArea: s.minRegionArea,
				maxRegions: s.autoPaletteSize ? 0 : s.paletteSize,
				mask: o
			});
			await t.tick(), t.stage("segment"), await t.tick(), x = n.labels, k = n.paletteHex, v = n.paletteRgb, I = n.counts;
			const a = s.omitBackground ? so(e, k) : -1;
			if (a >= 0) {
				const t = Rt(x, a);
				I[a] = Math.max(0, I[a] - t);
			}
			const i = eo(e, x, k, v, r, s);
			i && ({labels: x, paletteHex: k, paletteRgb: v} = i, F = i.gradients, S = i.underlays, I = no(x)), m && void 0 !== w && (L = {
				labels: x,
				paletteHex: k,
				paletteRgb: v,
				counts: I,
				paletteClampedTo: $,
				gradients: F,
				underlays: S
			}, Zn(p, w, L));
		} else {
			m && Nn(p).palMisses++;
			const a = function(t) {
				const { width: e, height: n, data: o } = t, r = new Uint8Array(e * n), s = (t, e) => Math.abs(o[t] - o[e]) + Math.abs(o[t + 1] - o[e + 1]) + Math.abs(o[t + 2] - o[e + 2]);
				for (let a = 0; a < n; a++) for (let t = 0; t < e; t++) {
					const o = a * e + t, i = 4 * o;
					let l = !1;
					(t + 1 < e && s(i, i + 4) >= 40 || t > 0 && s(i, i - 4) >= 40 || a + 1 < n && s(i, i + 4 * e) >= 40 || a > 0 && s(i, i - 4 * e) >= 40) && (l = !0), r[o] = l ? 1 : 0;
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
			for (let t = 0; t < l.data.length; t++) l.data[t] = 0 === a.data[t] ? 1 : 0;
			const f = function(t, e) {
				const { width: o, height: r, data: s } = t, a = o * r, l = b(e.k, 2, 64), f = b(e.quality, 1, 10), h = e.mask ? e.mask.data : null, u = "oklab" === e.colorSpace, d = new Int32Array(a), p = e.fixedPalette;
				if (null != p && p.length > 0) {
					const e = [];
					for (const t of p) {
						const n = i(t);
						null !== n && e.push(n);
					}
					if (e.length > 0) {
						const i = e.length, l = new Float32Array(3 * i), f = new Uint8Array(3 * i), p = [];
						for (let t = 0; t < i; t++) {
							const [o, r, s] = e[t];
							if (f[3 * t] = o, f[3 * t + 1] = r, f[3 * t + 2] = s, p.push(c(o, r, s)), u) {
								const [e, a, i] = n(o / 255, r / 255, s / 255);
								l[3 * t] = e, l[3 * t + 1] = a, l[3 * t + 2] = i;
							} else l[3 * t] = o / 255, l[3 * t + 1] = r / 255, l[3 * t + 2] = s / 255;
						}
						return {
							labels: {
								width: o,
								height: r,
								data: d,
								count: i
							},
							paletteHex: p,
							paletteRgb: f,
							counts: vt(d, l, i, s, u ? R(t) : null, h, a, null, !1)
						};
					}
				}
				const y = /* @__PURE__ */ new Map();
				let g = 0, m = !1;
				for (let n = 0, i = 0; n < a; n++, i += 4) {
					if (null !== h) {
						if (0 === h[n]) continue;
						g++;
					}
					if (m) continue;
					const t = s[i] << 16 | s[i + 1] << 8 | s[i + 2], e = y.get(t);
					if (void 0 === e) {
						if (y.size === l) {
							if (m = !0, y.clear(), null === h) break;
							continue;
						}
						y.set(t, 1);
					} else y.set(t, e + 1);
				}
				if (null === h && (g = a), 0 === g) return d.fill(-1), {
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
					const t = y.size, e = new Int32Array(t), n = new Uint32Array(t), i = /* @__PURE__ */ new Map();
					let l = 0;
					for (const [o, r] of y) e[l] = o, n[l] = r, i.set(o, l), l++;
					const f = It(n, t), u = new Int32Array(t), p = new Uint8Array(3 * t), g = [], m = new Uint32Array(t);
					for (let o = 0; o < t; o++) {
						const t = f[o];
						u[t] = o;
						const r = e[t], s = r >> 16 & 255, a = r >> 8 & 255, i = 255 & r;
						p[3 * o] = s, p[3 * o + 1] = a, p[3 * o + 2] = i, g.push(c(s, a, i)), m[o] = n[t];
					}
					for (let o = 0, r = 0; o < a; o++, r += 4) {
						if (null !== h && 0 === h[o]) {
							d[o] = -1;
							continue;
						}
						const t = s[r] << 16 | s[r + 1] << 8 | s[r + 2];
						d[o] = u[i.get(t)];
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
					for (let e = 0; e < a; e++) null !== h && 0 === h[e] || 0 === x[e] || t++;
					if (t >= Math.max(l, 256)) {
						const e = new Int32Array(t);
						let n = 0;
						for (let t = 0; t < a; t++) null !== h && 0 === h[t] || 0 === x[t] || (e[n++] = t);
						A = e, k = t;
					}
				}
				const v = Math.min(k, 2e4 + 2e4 * f), I = new Int32Array(v);
				if (null !== A) if (k <= v) for (let n = 0; n < k; n++) I[n] = A[n];
				else for (let n = 0; n < v; n++) I[n] = A[M() * k | 0];
				else if (g <= v) {
					let t = 0;
					for (let e = 0; e < a; e++) null !== h && 0 === h[e] || (I[t++] = e);
				} else if (null === h) for (let n = 0; n < v; n++) I[n] = M() * a | 0;
				else {
					const t = new Int32Array(g);
					let e = 0;
					for (let n = 0; n < a; n++) 0 !== h[n] && (t[e++] = n);
					for (let n = 0; n < v; n++) I[n] = t[M() * g | 0];
				}
				const $ = new Float32Array(3 * v);
				if (null !== w) for (let n = 0, i = 0; n < v; n++, i += 3) {
					const t = 3 * I[n];
					$[i] = w[t], $[i + 1] = w[t + 1], $[i + 2] = w[t + 2];
				}
				else for (let n = 0, i = 0; n < v; n++, i += 3) {
					const t = 4 * I[n];
					$[i] = s[t] / 255, $[i + 1] = s[t + 1] / 255, $[i + 2] = s[t + 2] / 255;
				}
				const F = new Float32Array(3 * l), S = new Float64Array(v).fill(1 / 0), C = 3 * (M() * v | 0);
				F[0] = $[C], F[1] = $[C + 1], F[2] = $[C + 2];
				for (let n = 1; n < l; n++) {
					const t = F[3 * (n - 1)], e = F[3 * (n - 1) + 1], o = F[3 * (n - 1) + 2];
					let r = 0;
					for (let n = 0, a = 0; n < v; n++, a += 3) {
						const s = $[a] - t, i = $[a + 1] - e, l = $[a + 2] - o, c = s * s + i * i + l * l;
						c < S[n] && (S[n] = c), r += S[n];
					}
					let s = v - 1;
					if (r > 0) {
						const t = M() * r;
						let e = 0;
						for (let n = 0; n < v; n++) if (e += S[n], e >= t) {
							s = n;
							break;
						}
					} else s = M() * v | 0;
					F[3 * n] = $[3 * s], F[3 * n + 1] = $[3 * s + 1], F[3 * n + 2] = $[3 * s + 2];
				}
				const L = 8 + 3 * f, P = new Float64Array(3 * l), z = new Uint32Array(l);
				for (let n = 0; n < L; n++) {
					P.fill(0), z.fill(0);
					for (let e = 0, n = 0; e < v; e++, n += 3) {
						const t = $[n], e = $[n + 1], o = $[n + 2];
						let r = 0, s = 1 / 0;
						for (let n = 0, i = 0; n < l; n++, i += 3) {
							const a = t - F[i], l = e - F[i + 1], c = o - F[i + 2], f = a * a + l * l + c * c;
							f < s && (s = f, r = n);
						}
						const a = 3 * r;
						P[a] += t, P[a + 1] += e, P[a + 2] += o, z[r]++;
					}
					let t = 0;
					for (let e = 0, n = 0; e < l; e++, n += 3) {
						if (0 === z[e]) continue;
						const o = 1 / z[e], r = P[n] * o, s = P[n + 1] * o, a = P[n + 2] * o, i = r - F[n], l = s - F[n + 1], c = a - F[n + 2], f = Math.sqrt(i * i + l * l + c * c);
						f > t && (t = f), F[n] = r, F[n + 1] = s, F[n + 2] = a;
					}
					if (t < 1e-4) break;
				}
				const U = new Float64Array(3 * l);
				let T = vt(d, F, l, s, w, h, a, U, u), q = 0;
				const B = new Int32Array(l);
				for (let n = 0; n < l; n++) 0 !== T[n] ? (B[n] = q, F[3 * q] = F[3 * n], F[3 * q + 1] = F[3 * n + 1], F[3 * q + 2] = F[3 * n + 2], U[3 * q] = U[3 * n], U[3 * q + 1] = U[3 * n + 1], U[3 * q + 2] = U[3 * n + 2], T[q] = T[n], q++) : B[n] = -1;
				if (q < l) {
					for (let t = 0; t < a; t++) d[t] >= 0 && (d[t] = B[d[t]]);
					T = T.slice(0, q);
				}
				if (!0 === e.autoK && q > 1) {
					const t = new Float64Array(3 * q);
					for (let a = 0; a < q; a++) if (u) t[3 * a] = F[3 * a], t[3 * a + 1] = F[3 * a + 1], t[3 * a + 2] = F[3 * a + 2];
					else {
						const [e, o, r] = n(F[3 * a], F[3 * a + 1], F[3 * a + 2]);
						t[3 * a] = e, t[3 * a + 1] = o, t[3 * a + 2] = r;
					}
					const e = new Uint8Array(q).fill(1), o = new Int32Array(q);
					for (let n = 0; n < q; n++) o[n] = n;
					const r = 9e-4;
					for (;;) {
						let s = -1, a = -1, i = 1 / 0;
						for (let n = 0; n < q; n++) if (0 !== e[n]) for (let o = n + 1; o < q; o++) {
							if (0 === e[o]) continue;
							const r = t[3 * n] - t[3 * o], l = t[3 * n + 1] - t[3 * o + 1], c = t[3 * n + 2] - t[3 * o + 2], f = r * r + l * l + c * c;
							f < i && (i = f, s = n, a = o);
						}
						if (s < 0 || i >= r) break;
						const l = T[s], c = T[a], f = l + c;
						if (F[3 * s] = (F[3 * s] * l + F[3 * a] * c) / f, F[3 * s + 1] = (F[3 * s + 1] * l + F[3 * a + 1] * c) / f, F[3 * s + 2] = (F[3 * s + 2] * l + F[3 * a + 2] * c) / f, U[3 * s] += U[3 * a], U[3 * s + 1] += U[3 * a + 1], U[3 * s + 2] += U[3 * a + 2], T[s] = f, e[a] = 0, o[a] = s, u) t[3 * s] = F[3 * s], t[3 * s + 1] = F[3 * s + 1], t[3 * s + 2] = F[3 * s + 2];
						else {
							const [e, o, r] = n(F[3 * s], F[3 * s + 1], F[3 * s + 2]);
							t[3 * s] = e, t[3 * s + 1] = o, t[3 * s + 2] = r;
						}
					}
					const s = new Int32Array(q);
					let i = 0;
					for (let n = 0; n < q; n++) 0 !== e[n] && (s[n] = i, F[3 * i] = F[3 * n], F[3 * i + 1] = F[3 * n + 1], F[3 * i + 2] = F[3 * n + 2], U[3 * i] = U[3 * n], U[3 * i + 1] = U[3 * n + 1], U[3 * i + 2] = U[3 * n + 2], T[i] = T[n], i++);
					if (i < q) {
						const t = new Int32Array(q);
						for (let e = 0; e < q; e++) {
							let n = e;
							for (; o[n] !== n;) n = o[n];
							t[e] = s[n];
						}
						for (let e = 0; e < a; e++) d[e] >= 0 && (d[e] = t[d[e]]);
						T = T.slice(0, i), q = i;
					}
				}
				const H = It(T, q), j = new Int32Array(q), K = new Uint8Array(3 * q), O = [], D = new Uint32Array(q);
				for (let n = 0; n < q; n++) {
					const t = H[n];
					j[t] = n;
					const e = 1 / T[t], o = Math.round(U[3 * t] * e), r = Math.round(U[3 * t + 1] * e), s = Math.round(U[3 * t + 2] * e);
					K[3 * n] = o, K[3 * n + 1] = r, K[3 * n + 2] = s, O.push(c(o, r, s)), D[n] = T[t];
				}
				for (let n = 0; n < a; n++) d[n] >= 0 && (d[n] = j[d[n]]);
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
				const { width: a, height: i, data: l } = t;
				if (o <= 0 || 0 === a * i) return t;
				const c = s?.data ?? null, f = /* @__PURE__ */ new Int32Array(8), h = /* @__PURE__ */ new Int32Array(9);
				let u = l.slice();
				for (let d = 0; d < 4; d++) {
					let t = !1;
					for (let r = 0; r < i; r++) for (let s = 0; s < a; s++) {
						const d = r * a + s, p = u[d];
						if (-1 === p || null !== c && 0 !== c[d]) continue;
						let y = 0, g = 1;
						h[0] = p;
						for (let t = -1; t <= 1; t++) {
							const e = r + t;
							if (!(e < 0 || e >= i)) for (let n = -1; n <= 1; n++) {
								if (0 === n && 0 === t) continue;
								const o = s + n;
								if (o < 0 || o >= a) continue;
								const r = u[e * a + o];
								if (-1 === r) continue;
								f[y++] = r;
								let i = !1;
								for (let t = 0; t < g; t++) if (h[t] === r) {
									i = !0;
									break;
								}
								i || (h[g++] = r);
							}
						}
						const m = 3 * d, w = e[m], M = e[m + 1], x = e[m + 2];
						let b = p, A = 1 / 0;
						for (let t = 0; t < g; t++) {
							const e = h[t], r = 3 * e, s = w - n[r], a = M - n[r + 1], i = x - n[r + 2];
							let l = 0;
							for (let t = 0; t < y; t++) f[t] === e && l++;
							const c = s * s + a * a + i * i + o * (y - l);
							c < A && (A = c, b = e);
						}
						b !== p && (l[d] = b, t = !0);
					}
					if (!t) break;
					d + 1 < 4 && (u = l.slice());
				}
			}(f.labels, R(e), ro(f.paletteRgb), .03 * s.colorCoherence, 0, M ?? void 0), s.dissolveBands > 0 && function(t, e, n) {
				const { width: o, height: r, data: s } = t;
				if (e <= 0 || 0 === o * r) return t;
				const a = n?.data ?? null, i = /* @__PURE__ */ new Int32Array(8);
				let l = s.slice();
				for (let c = 0; c < e; c++) {
					let t = !1;
					for (let e = 0; e < r; e++) for (let n = 0; n < o; n++) {
						const c = e * o + n, f = l[c];
						if (-1 === f || null !== a && 0 !== a[c]) continue;
						let h = 0;
						for (let t = -1; t <= 1; t++) {
							const s = e + t;
							if (!(s < 0 || s >= r)) for (let e = -1; e <= 1; e++) {
								if (0 === e && 0 === t) continue;
								const r = n + e;
								if (r < 0 || r >= o) continue;
								const a = l[s * o + r];
								-1 !== a && (i[h++] = a);
							}
						}
						let u = 0, d = -1, p = 0;
						for (let t = 0; t < h; t++) {
							const e = i[t];
							if (e === f) {
								u++;
								continue;
							}
							let n = 0;
							for (let t = 0; t < h; t++) i[t] === e && n++;
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
				Lt(f.labels, s.minRegionArea, {
					oklab: t,
					keepContrast: .1,
					protect: M ?? void 0
				});
			} else M ? Lt(f.labels, s.minRegionArea, { protect: M }) : Lt(f.labels, s.minRegionArea);
			x = f.labels, k = f.paletteHex, v = f.paletteRgb, I = new Uint32Array(x.count);
			for (let t = 0; t < x.data.length; t++) {
				const e = x.data[t];
				e >= 0 && I[e]++;
			}
			const h = s.omitBackground ? so(e, k) : -1;
			if (h >= 0) {
				const t = Rt(x, h);
				I[h] = Math.max(0, I[h] - t);
			}
			const u = eo(e, x, k, v, r, s);
			u && ({labels: x, paletteHex: k, paletteRgb: v} = u, F = u.gradients, S = u.underlays, I = no(x)), await t.tick(), m && void 0 !== w && (L = {
				labels: x,
				paletteHex: k,
				paletteRgb: v,
				counts: I,
				paletteClampedTo: $,
				gradients: F,
				underlays: S
			}, Zn(p, w, L));
		}
		void 0 !== $ && h.push({
			code: "palette-clamped",
			severity: "info",
			message: `Palette reduced to ${$} colors (near-duplicates merged).`,
			params: { count: $ }
		});
		const P = new Array(k.length), z = new Array(k.length);
		for (let n = 0; n < k.length; n++) {
			const t = F?.[n];
			if (t) {
				const e = `g${f.length}`;
				f.push({
					id: e,
					...t
				}), P[n] = `url(#${e})`, z[n] = t.stops.map((t) => t.color);
			} else P[n] = k[n], z[n] = [k[n]];
		}
		const U = (t) => S?.[t] ?? -1;
		t.tracing && t.emitStep(() => {
			const t = [Ot(k, I)], e = function(t, e = 24) {
				const n = [];
				for (const i of t) i > 0 && n.push(Math.log10(i));
				if (0 === n.length) return null;
				let o = n[0], r = n[0];
				for (const i of n) i < o && (o = i), i > r && (r = i);
				o = Math.floor(o), r = Math.max(o + 1, Math.ceil(r));
				const s = new Array(e).fill(0), a = r - o;
				for (const i of n) s[Math.min(e - 1, Math.floor((i - o) / a * e))]++;
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
					regions: Qt(I),
					gradients: F ? F.filter(Boolean).length : 0
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
		}, q = s.preserveDetails || M ? 1 : Math.max(1, s.minRegionArea), B = [], H = g.helpers, j = void 0 !== w ? `${g.scope}|${w}` : `#${g.serial}`;
		if ("cutout" === s.layering) {
			const n = "pixel" !== s.curveMode && k.length > 1, o = s.optimizeSvg ? s.precision : void 0;
			let r;
			r = H ? await async function(t, e, n, o, r, s, a, i, l) {
				const c = He(n);
				r && e.setImage(i.scope, o), e.setChains(l, c);
				const f = new Array(c.chains.length);
				let h = 0;
				for await (const u of e.dispatch({
					kind: "fit-chains",
					total: c.chains.length,
					stateKey: l,
					curve: s,
					batch: Vn,
					paletteOklab: r,
					arcPrecision: a
				})) f[u.unit] = {
					open: u.shapes[0],
					closed: u.shapes[1]
				}, h++, 0 === (h & Gn) && (t.progress(h / c.chains.length), await t.tick());
				return Ke(c, f);
			}(t, H, x, e, n ? ro(v) : void 0, T, o, g, j) : function(t, e) {
				const n = He(t);
				return Ke(n, function(t, e) {
					const n = new Array(t.chains.length);
					for (let o = 0; o < t.chains.length; o++) n[o] = je(t, o, e);
					return n;
				}(n, e));
			}(x, {
				...T,
				colorField: n ? {
					oklab: R(e),
					paletteOklab: ro(v)
				} : void 0,
				refineChain: void 0 === o ? void 0 : (t) => cn(t, o)
			}), r.sort((t, e) => e.area - t.area);
			const i = A(e.width, s.widthMm), l = s.gapFill <= 0 ? 0 : "mm" === s.unit ? i > 0 ? s.gapFill / i : 0 : s.gapFill;
			for (const t of r) {
				const e = U(t.label);
				for (const n of e >= 0 ? [e, t.label] : [t.label]) {
					const o = P[n];
					oo(B, z[n]), a.push({
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
			}(s, q), n = L?.rings, o = void 0 !== n && n.key === e ? n.layers : void 0, r = "pixel" !== s.curveMode, i = o && r ? n?.polygons : void 0;
			let c = 0, f = 0, h = 1;
			const u = () => t.emitStep(() => ({
				code: "trace",
				label: `Trace layer ${c}/${f}`,
				metrics: {
					shapes: a.length,
					nodes: Et(a),
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
				let i = 0;
				for (const t of r >= 0 ? [r, e] : [e]) {
					n.length > 0 && oo(B, z[t]);
					for (const e of n) a.push({
						commands: e,
						fill: P[t],
						fillRule: "evenodd",
						layerId: s,
						...t === r ? { unfoldable: !0 } : {}
					}), o && l.push(o[i] ?? null), i++;
				}
				c++, t.progress(c / f), t.tracing && c < f && c % h === 0 && u(), await t.tick();
			}, M = (t, e, n) => w(t, Pe(e, T, n).map((t) => t.commands), void 0);
			if (H) {
				const t = Yn(x, I, L, m ? p : void 0), n = (e) => e < t.order.length ? t.order[e] : t.islands[e - t.order.length].label, o = t.order.length + t.islands.length, r = `${j}|${e}`;
				H.setStackPlan(r, function(t, e, n, o) {
					const r = new Int32Array(e.islands.length + 1);
					for (let i = 0; i < e.islands.length; i++) r[i + 1] = r[i] + e.islands[i].pixels.length;
					const s = new Int32Array(e.islands.length), a = new Int32Array(r[e.islands.length]);
					for (let i = 0; i < e.islands.length; i++) s[i] = e.islands[i].label, a.set(e.islands[i].pixels, r[i]);
					return {
						width: t.width,
						height: t.height,
						labelCount: e.labelCount,
						stackLabels: e.stackLabels,
						order: new Int32Array(e.order),
						islandLabels: s,
						islandPixels: a,
						islandOffsets: r,
						turnPolicy: n,
						minArea: o
					};
				}(x, t, s.turnPolicy, q)), d(o);
				for await (const e of H.dispatch({
					kind: "trace-layers",
					total: o,
					stateKey: r,
					curve: T,
					meta: (t) => y(n(t), t),
					serialize: g.serialize
				})) await w(n(e.unit), e.shapes, e.svg);
			} else if (o) {
				Nn(p).ringHits++, r && (i ? Nn(p).polyHits++ : Nn(p).polyMisses++);
				const t = r && !i ? [] : void 0;
				d(o.length);
				for (let e = 0; e < o.length; e++) {
					const n = o[e];
					let r = i?.[e];
					t && (r = Xn(n.paths), t.push(r)), await M(n.label, n.paths, r);
				}
				t && n && (n.polygons = t);
			} else {
				m && (Nn(p).ringMisses++, r && Nn(p).polyMisses++);
				const t = m ? [] : void 0, n = t && r ? [] : void 0;
				if (await async function(t, e, n, o, r, s) {
					const a = Math.max(1, o), i = e.stackLabels, l = e.order, c = i.length, f = e.labelCount, h = new Uint32Array(f);
					for (let x = 0; x < c; x++) {
						const t = i[x];
						t >= 0 && h[t]++;
					}
					const u = new Int32Array(f + 1);
					for (let x = 0; x < f; x++) u[x + 1] = u[x] + h[x];
					const d = new Int32Array(u[f]), p = u.slice(0, f);
					for (let x = 0; x < c; x++) {
						const t = i[x];
						t >= 0 && (d[p[t]++] = x);
					}
					const y = (t.width, t.height, new Uint8Array(c));
					for (let x = 0; x < c; x++) y[x] = i[x] >= 0 ? 1 : 0;
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
						const o = Yt(g, n, a);
						for (let n = u[t]; n < u[t + 1]; n++) y[d[n]] = 0;
						await s(t, o);
					}
					for (const x of e.islands) {
						m.fill(0);
						for (const e of x.pixels) m[e] = 1;
						const t = Yt(g, n, a);
						await s(x.label, t);
					}
				}(x, Yn(x, I, L, m ? p : void 0), s.turnPolicy, q, d, async (e, o) => {
					const s = r ? Xn(o) : void 0;
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
		K = B, t.progress(1);
	}(l, z, U, T, s, H, O, j, f, 0, o?.edgeHint, p ? h : void 0, u, {
		helpers: g,
		scope: Z,
		serial: m,
		serialize: N
	}) : await async function(t, e, n, o, r, s, a, i, l, c, f, h) {
		t.stage("palette");
		const u = void 0 !== c && void 0 !== f && c.imageId === f && void 0 === i && void 0 === l, p = u ? function(t) {
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
		const m = jn(i, e.width, e.height);
		let M, x;
		if (g) M = g.mask, x = g.coverage, Nn(c).inkHits++, await t.tick(), t.stage("segment"), await t.tick();
		else {
			u && Nn(c).inkMisses++;
			const r = function(t) {
				const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(r);
				for (let a = 0, i = 0; a < r; a++, i += 4) {
					const t = P[o[i]], e = P[o[i + 1]], n = P[o[i + 2]], r = .2104542553 * Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n) + .793617785 * Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n) - .0040720468 * Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
					s[a] = r < 0 ? 0 : r > 1 ? 1 : r;
				}
				return {
					width: e,
					height: n,
					data: s
				};
			}(e);
			if ("adaptive" === o.thresholdMode) M = function(t, e, n, o, r) {
				const { width: s, height: a, data: i } = t, l = r ? r.data : null, c = Math.max(1, Math.round(e)), f = o ? 1 : 0, h = s + 1, u = new Float64Array(h * (a + 1));
				for (let p = 0; p < a; p++) {
					let t = 0;
					const e = p * s, n = p * h, o = (p + 1) * h;
					for (let r = 0; r < s; r++) t += i[e + r], u[o + r + 1] = u[n + r + 1] + t;
				}
				const d = new Uint8Array(s * a);
				for (let p = 0; p < a; p++) {
					const t = p - c < 0 ? 0 : p - c, e = p + c >= a ? a - 1 : p + c, o = t * h, r = (e + 1) * h;
					for (let a = 0; a < s; a++) {
						const h = p * s + a;
						if (null !== l && 0 === l[h]) continue;
						const y = a - c < 0 ? 0 : a - c, g = a + c >= s ? s - 1 : a + c, m = (g - y + 1) * (e - t + 1), w = u[r + g + 1] - u[o + g + 1] - u[r + y] + u[o + y];
						d[h] = (i[h] < w / m - n ? 1 : 0) ^ f;
					}
				}
				return {
					width: s,
					height: a,
					data: d
				};
			}(r, o.adaptiveRadius, o.adaptiveBias / 255, o.invert, n), "pixel" !== o.curveMode && (x = function(t, e, n, o) {
				const { width: r, height: s, data: a } = t, i = Math.max(1, Math.round(e)), l = o ? -1 : 1, c = r + 1, f = new Float64Array(c * (s + 1));
				for (let u = 0; u < s; u++) {
					let t = 0;
					const e = u * r, n = u * c, o = (u + 1) * c;
					for (let s = 0; s < r; s++) t += a[e + s], f[o + s + 1] = f[n + s + 1] + t;
				}
				const h = new Float32Array(r * s);
				for (let u = 0; u < s; u++) {
					const t = u - i < 0 ? 0 : u - i, e = u + i >= s ? s - 1 : u + i, o = t * c, d = (e + 1) * c;
					for (let s = 0; s < r; s++) {
						const c = u * r + s, p = s - i < 0 ? 0 : s - i, y = s + i >= r ? r - 1 : s + i, g = (y - p + 1) * (e - t + 1), m = (f[d + y + 1] - f[o + y + 1] - f[d + p] + f[o + p]) / g - n, w = m - a[c], M = w > 0 ? .5 / Math.max(m, 1e-6) : .5 / Math.max(1 - m, 1e-6);
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
					for (let u = 0; u < n.length; u++) null !== o && 0 === o[u] || (r[Ct(n[u])]++, s++);
					if (0 === s) return .5;
					let a = 0;
					for (let u = 0; u < 256; u++) a += u * r[u];
					let i = 0, l = 0, c = 0, f = -1, h = -1;
					for (let u = 0; u < 256; u++) {
						if (i += r[u], 0 === i) continue;
						const t = s - i;
						if (0 === t) break;
						l += u * r[u];
						const e = l / i - (a - l) / t, n = i * t * e * e;
						n > c ? (c = n, f = u, h = u) : n === c && f >= 0 && (h = u);
					}
					return f < 0 || 0 === c ? .5 : ((f + h) / 2 + 1) / 256;
				}(r, n) : o.threshold / 255;
				M = function(t, e, n, o) {
					const { width: r, height: s, data: a } = t, i = o ? o.data : null, l = new Uint8Array(r * s), c = n ? 1 : 0;
					for (let f = 0; f < l.length; f++) null !== i && 0 === i[f] || (l[f] = (a[f] < e ? 1 : 0) ^ c);
					return {
						width: r,
						height: s,
						data: l
					};
				}(r, t, o.invert, n), "pixel" !== o.curveMode && (x = function(t, e, n) {
					const { width: o, height: r, data: s } = t, a = new Float32Array(s.length), i = n ? -1 : 1, l = .5 / Math.max(e, 1e-6), c = .5 / Math.max(1 - e, 1e-6);
					for (let f = 0; f < s.length; f++) {
						const t = e - s[f];
						a[f] = i * t * (t > 0 ? l : c);
					}
					return {
						width: o,
						height: r,
						data: a
					};
				}(r, t, o.invert));
			}
			if (l && "pixel" !== o.curveMode) {
				const t = function(t, e, n) {
					if (!t) return null;
					const o = t.width === e && t.height === n ? t : S(t, e, n), r = new Float32Array(e * n);
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
				const { width: o, height: r, data: s } = t, a = o * r, i = w(o, r);
				if (i.data.set(s), e <= 1) return i;
				const l = n?.data ?? null, c = new Uint8Array(a), f = new Int32Array(a), h = new Int32Array(a);
				for (let u = 0; u < a; u++) {
					if (0 === s[u] || 0 !== c[u]) continue;
					let t = 0, n = 0, a = !1;
					for (f[t++] = u, c[u] = 1; t > 0;) {
						const e = f[--t];
						h[n++] = e, null !== l && 0 !== l[e] && (a = !0);
						const i = e - (e / o | 0) * o, u = e / o | 0;
						for (let n = -1; n <= 1; n++) {
							const e = u + n;
							if (!(e < 0 || e >= r)) for (let r = -1; r <= 1; r++) {
								if (0 === r && 0 === n) continue;
								const a = i + r;
								if (a < 0 || a >= o) continue;
								const l = e * o + a;
								0 === c[l] && 0 !== s[l] && (c[l] = 1, f[t++] = l);
							}
						}
					}
					if (n < e && !a) for (let e = 0; e < n; e++) i.data[h[e]] = 0;
				}
				c.fill(0);
				for (let u = 0; u < a; u++) {
					if (0 !== s[u] || 0 !== c[u]) continue;
					let t = 0, n = 0, a = !1, d = !1;
					for (f[t++] = u, c[u] = 1; t > 0;) {
						const e = f[--t];
						h[n++] = e, null !== l && 0 !== l[e] && (d = !0);
						const i = e - (e / o | 0) * o, u = e / o | 0;
						0 !== i && 0 !== u && i !== o - 1 && u !== r - 1 || (a = !0), i > 0 && 0 === c[e - 1] && 0 === s[e - 1] && (c[e - 1] = 1, f[t++] = e - 1), i < o - 1 && 0 === c[e + 1] && 0 === s[e + 1] && (c[e + 1] = 1, f[t++] = e + 1), u > 0 && 0 === c[e - o] && 0 === s[e - o] && (c[e - o] = 1, f[t++] = e - o), u < r - 1 && 0 === c[e + o] && 0 === s[e + o] && (c[e + o] = 1, f[t++] = e + o);
					}
					if (!a && n < e && !d) for (let e = 0; e < n; e++) i.data[h[e]] = 1;
				}
				return i;
			}(M, o.minRegionArea, m), await t.tick(), u && void 0 !== p && (g = {
				key: p,
				mask: M,
				coverage: x
			}, c.ink = g);
		}
		if (t.tracing && t.emitStep(() => ({
			code: "threshold",
			label: "Threshold",
			rasters: [jt(M, "Binary mask")],
			charts: [Kt(e)],
			metrics: {
				blackFraction: Math.round(1e3 * Wt(M)) / 1e3,
				threshold: o.threshold
			},
			notes: [`Threshold mode: ${o.thresholdMode}${o.invert ? " (inverted)" : ""}.`]
		})), t.stage("trace"), b = [o.fillColor], K = b, "bw" === o.mode) {
			const e = m ? 1 : Math.max(1, o.minRegionArea), n = `${o.turnPolicy}|${e}`, a = "pixel" !== o.curveMode;
			let i, l;
			g?.rings && g.ringKey === n ? (i = g.rings, l = a ? g.polygons : void 0, Nn(c).ringHits++) : (i = Yt(M, o.turnPolicy, e), g && (g.ringKey = n, g.rings = i, g.polygons = void 0, Nn(c).ringMisses++));
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
				}(i), s = `${void 0 !== p ? `${h.scope}|${p}` : `#${h.serial}`}|${n}`;
				u.setRingUnits(s, {
					width: M.width,
					height: M.height,
					rings: i.map((t) => t.points),
					coverage: a ? x : void 0
				});
				const l = new Array(i.length);
				let c = 0;
				for await (const n of u.dispatch({
					kind: "trace-rings",
					total: i.length,
					stateKey: s,
					curve: f,
					batch: _n
				})) l[n.unit] = n.shapes[0], c++, 0 === (c & Jn) && (t.progress(c / i.length), await t.tick());
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
				a && (l ? Nn(c).polyHits++ : (l = i.map((t) => ze(t.points, x)), g && (g.polygons = l, Nn(c).polyMisses++))), d = Pe(i, {
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
				r > ao && e.push({
					code: "centerline-input",
					severity: "warning",
					message: `Centerline traces the middle of thin lines, but ~${Math.round(100 * r)}% of this image is filled — expect a skeleton, not matching outlines. Use B&W or Color mode for solid shapes.`,
					params: { percent: Math.round(100 * r) }
				});
			})(M, s);
			const e = function(t) {
				const { width: e, height: n } = t, o = e * n, r = new Uint8Array(o);
				for (let i = 0; i < o; i++) r[i] = 0 !== t.data[i] ? 1 : 0;
				const s = new Int32Array(o);
				let a = !0;
				for (; a;) {
					a = !1;
					for (let t = 0; t < 2; t++) {
						let o = 0;
						for (let a = 0; a < n; a++) {
							const i = a > 0, l = a < n - 1;
							for (let n = 0; n < e; n++) {
								const c = a * e + n;
								if (0 === r[c]) continue;
								const f = n > 0, h = n < e - 1, u = i ? r[c - e] : 0, d = i && h ? r[c - e + 1] : 0, p = h ? r[c + 1] : 0, y = l && h ? r[c + e + 1] : 0, g = l ? r[c + e] : 0, m = l && f ? r[c + e - 1] : 0, w = f ? r[c - 1] : 0, M = i && f ? r[c - e - 1] : 0, x = u + d + p + y + g + m + w + M;
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
							a = !0;
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
				rasters: [jt(e, "Zhang–Suen skeleton")],
				metrics: { strokePixels: Math.round(Wt(e) * e.data.length) }
			}));
			const n = o.strokeWidth <= 0, a = n ? zt(M) : void 0, i = n ? function(t, e) {
				const n = zt(t), o = e.data, r = new Float32Array(n.length);
				let s = 0;
				for (let l = 0; l < o.length; l++) 0 !== o[l] && (r[s++] = 2 * n[l]);
				if (0 === s) return 1;
				const a = r.subarray(0, s);
				a.sort();
				const i = s >> 1;
				return s % 2 == 1 ? a[i] : (a[i - 1] + a[i]) / 2;
			}(M, e) : o.strokeWidth, l = function(t, e) {
				const { width: n, height: o, data: r } = t, s = (t, e) => t >= 0 && t < n && e >= 0 && e < o ? r[e * n + t] : 0, a = (t, e, n) => {
					let o = 0;
					for (let r = -1; r <= 1; r++) for (let a = -1; a <= 1; a++) 0 === a && 0 === r || 0 !== s(t + a, e + r) && (0 === a || 0 === r || 0 === s(t + a, e) && 0 === s(t, e + r)) && (n[2 * o] = t + a, n[2 * o + 1] = e + r, o++);
					return o;
				}, i = (t, e) => e * n + t, l = new Int8Array(n * o), c = new Array(16);
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) 0 !== r[i(t, d)] && (l[i(t, d)] = a(t, d, c));
				const f = new Uint16Array(n * o), h = (t, e, n, o) => {
					f[i(t, e)] |= 1 << Xe(n - t, o - e), f[i(n, o)] |= 1 << Xe(t - n, e - o);
				}, u = (t, e, n, o) => !!(f[i(t, e)] & 1 << Xe(n - t, o - e)), p = [], g = (t, e) => 2 !== l[i(t, e)], m = (t, e, n, o) => {
					const r = [t + .5, e + .5];
					let s = t, f = e, u = n, d = o;
					for (h(s, f, u, d); r.push(u + .5, d + .5), !(g(u, d) || u === t && d === e);) {
						const t = a(u, d, c);
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
						startKind: l[i(t, e)] >= 3 ? 1 : 0,
						endKind: p || l[i(u, d)] >= 3 ? 1 : 0,
						closed: p,
						merged: !1
					};
				};
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) {
					if (0 === r[i(t, d)] || !g(t, d)) continue;
					const e = a(t, d, c), n = c.slice(0, 2 * e);
					for (let o = 0; o < e; o++) {
						const e = n[2 * o], r = n[2 * o + 1];
						u(t, d, e, r) || p.push(m(t, d, e, r));
					}
				}
				for (let d = 0; d < o; d++) for (let t = 0; t < n; t++) {
					if (0 === r[i(t, d)] || 2 !== l[i(t, d)]) continue;
					const e = a(t, d, c), n = c.slice(0, 2 * e);
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
								const r = i(Math.floor(t[0]), Math.floor(t[1])), s = Math.min(3, n - 1);
								e.set(r, [...e.get(r) ?? [], {
									chain: o,
									atStart: !0,
									key: r,
									dirX: t[2 * s] - t[0],
									dirY: t[2 * s + 1] - t[1]
								}]);
							}
							if (1 === o.endKind) {
								const r = i(Math.floor(t[2 * (n - 1)]), Math.floor(t[2 * (n - 1) + 1])), s = Math.min(3, n - 1);
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
							const a = Math.hypot(r.dirX, r.dirY) || 1, i = Math.hypot(s.dirX, s.dirY) || 1, l = (r.dirX * s.dirX + r.dirY * s.dirY) / (a * i);
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
					const t = e.distanceField ? Qe(b.points, e.distanceField, n, o) : void 0;
					let r = b.points;
					if (e.smoothing > 0 && (r = Ge(r, Math.round(2 * e.smoothing), b.closed)), e.simplifyTolerance > 0 && (r = We(r, e.simplifyTolerance)), r.length < 4) continue;
					const s = [], a = r.length >> 1;
					for (let n = 1; n < a - 1; n++) y(r[2 * (n - 1)], r[2 * (n - 1) + 1], r[2 * n], r[2 * n + 1], r[2 * (n + 1)], r[2 * (n + 1) + 1]) < e.cornerThreshold && s.push(n);
					const i = [{
						type: "M",
						x: r[0],
						y: r[1]
					}];
					i.push(...ye(r, e.fitTolerance, s)), b.closed && i.push({ type: "Z" }), M.push({
						commands: i,
						closed: b.closed,
						length: d(r),
						width: t
					});
				}
				return M.sort((t, e) => e.length - t.length), M;
				function x(t, e) {
					const n = t.atStart ? Ye(t.chain.points) : t.chain.points.slice(), o = e.atStart ? e.chain.points.slice() : Ye(e.chain.points), r = n.concat(o.slice(2)), s = t.chain;
					s.points = r, s.startKind = t.atStart ? t.chain.endKind : t.chain.startKind, s.endKind = e.atStart ? e.chain.endKind : e.chain.startKind, e.chain.merged = !0;
				}
			}(e, {
				pruneLength: o.pruneLength,
				cornerThreshold: o.cornerThreshold,
				fitTolerance: o.fitTolerance,
				simplifyTolerance: o.simplifyTolerance,
				smoothing: o.smoothing,
				distanceField: a
			});
			for (const t of l) {
				const e = n ? t.width ?? i : i;
				r.push({
					commands: t.commands,
					stroke: o.fillColor,
					strokeWidth: io(e),
					strokeLinecap: "round",
					strokeLinejoin: "round"
				});
			}
			t.progress(1);
		}
		var b;
	}(l, z, U, s, H, f, 0, o?.edgeHint, o?.coverageHint, p ? h : void 0, u, {
		helpers: g,
		scope: Z,
		serial: m,
		serialize: N
	}), l.tracing && l.emitStep(() => ({
		code: "trace",
		label: "Trace & fit",
		charts: [Nt(H)],
		metrics: {
			shapes: H.length,
			nodes: Et(H),
			gradients: j.length
		},
		notes: ["centerline" === s.mode ? "Centerline strokes fitted from the skeleton." : `Layering: ${s.layering}; curves: ${s.curveMode}.`]
	})), l.stage("svg");
	const E = s.groupByColor && ("color" === s.mode || "grayscale" === s.mode), W = function(t, e, n) {
		const o = on(e.precision), r = !0 === e.optimizePaths, s = !0 === e.roundPrimitives, a = nn(t.width, o), i = nn(t.height, o);
		let l, c;
		if ("mm" === t.unit) {
			const e = void 0 !== t.widthMm && t.widthMm > 0 ? t.widthMm : t.width / 96 * 25.4, n = t.width > 0 ? e * (t.height / t.width) : 0;
			l = `${nn(e, 3)}mm`, c = `${nn(n, 3)}mm`;
		} else l = a, c = i;
		const f = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a} ${i}" width="${l}" height="${c}">`, h = ["<!-- Trazor: traced client-side -->"];
		if (void 0 !== t.title && "" !== t.title && h.push(`<title>${Pn(t.title)}</title>`), void 0 !== t.desc && "" !== t.desc && h.push(`<desc>${Pn(t.desc)}</desc>`), void 0 !== t.defs && t.defs.length > 0) {
			const n = t.defs.map((t) => function(t, e) {
				const n = (t) => nn(t, e), o = t.stops.map((t) => {
					const e = void 0 !== t.opacity && t.opacity < 1 ? ` stop-opacity="${nn(t.opacity, 3)}"` : "";
					return `<stop offset="${nn(t.offset, 3)}" stop-color="${Rn(t.color, "stop-color")}"${e}/>`;
				}).join(""), r = Pn(t.id);
				return "linear" === t.kind ? `<linearGradient id="${r}" gradientUnits="userSpaceOnUse" x1="${n(t.x1)}" y1="${n(t.y1)}" x2="${n(t.x2)}" y2="${n(t.y2)}">${o}</linearGradient>` : `<radialGradient id="${r}" gradientUnits="userSpaceOnUse" cx="${n(t.cx)}" cy="${n(t.cy)}" r="${n(t.r)}">${o}</radialGradient>`;
			}(t, o));
			h.push(!0 === e.pretty ? `<defs>\n    ${n.join("\n    ")}\n  </defs>` : `<defs>${n.join("")}</defs>`);
		}
		if (!0 === e.groupByLayer || !0 === e.groupByColor) {
			const a = !0 === e.groupByLayer ? function(t) {
				const e = [];
				let n = null;
				for (let o = 0; o < t.length; o++) {
					const r = t[o].layerId;
					null === n || void 0 === r || r !== n.id ? (n = {
						indices: [o],
						id: r
					}, e.push({
						key: Hn(t[o]),
						indices: n.indices
					})) : n.indices.push(o);
				}
				return e;
			}(t.shapes) : function(t) {
				const e = [], n = /* @__PURE__ */ new Map();
				for (let o = 0; o < t.length; o++) {
					const r = Hn(t[o]);
					let s = n.get(r);
					void 0 === s && (s = [], n.set(r, s), e.push({
						key: r,
						indices: s
					})), s.push(o);
				}
				return e;
			}(t.shapes);
			let i = 0;
			for (const l of a) {
				const a = Bn(t.shapes, l.indices, o, r, s, n);
				if (0 === a.length) continue;
				i++;
				const c = `<g id="layer-${i}"><title>${Pn(l.key)}</title>`;
				h.push(!0 === e.pretty ? `${c}\n    ${a.join("\n    ")}\n  </g>` : `${c}${a.join("")}</g>`);
			}
		} else {
			const e = t.shapes.map((t, e) => e);
			for (const a of Bn(t.shapes, e, o, r, s, n)) h.push(a);
		}
		if (void 0 !== t.texts) for (const u of t.texts) {
			const t = Tn(u, o);
			"" !== t && h.push(t);
		}
		return !0 === e.pretty ? `${f}\n  ${h.join("\n  ")}\n</svg>\n` : `${f}${h.join("")}</svg>`;
	}({
		width: q,
		height: B,
		unit: s.unit,
		widthMm: "mm" === s.unit ? s.widthMm : void 0,
		title: s.svgTitle || void 0,
		defs: j.length > 0 ? j : void 0,
		shapes: H
	}, {
		precision: s.precision,
		optimizePaths: s.optimizeSvg,
		roundPrimitives: D,
		groupByColor: E && "cutout" === s.layering,
		groupByLayer: E && "cutout" !== s.layering
	}, O.length === H.length ? O : void 0);
	l.progress(.6);
	const Q = function(t) {
		const e = (t.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g) ?? []).length;
		let n = 0;
		for (const c of t.matchAll(/(?<![\w-])d\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) n += (Je(c, 1).match(/[MLHVQCTSAmlhvqctsa]/g) ?? []).length;
		const o = [];
		for (const c of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o.push({
			index: c.index ?? 0,
			value: Je(c, 1)
		});
		for (const c of t.matchAll(/(?<![\w-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			const t = Je(c, 1);
			for (const e of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*:\s*([^;"']+)/g)) o.push({
				index: (c.index ?? 0) + (e.index ?? 0),
				value: e[1]
			});
		}
		o.sort((t, e) => t.index - e.index);
		const r = [], s = /* @__PURE__ */ new Set();
		for (const { value: c } of o) {
			const t = Ve(c);
			null === t || s.has(t) || (s.add(t), r.push(t));
		}
		let a = null, i = null;
		const l = /(?<![\w-])viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(t);
		if (null !== l) {
			const t = Je(l, 1).trim().split(/[\s,]+/);
			if (t.length >= 4) {
				const e = Number(t[2]), n = Number(t[3]);
				Number.isFinite(e) && (a = e), Number.isFinite(n) && (i = n);
			}
		}
		return {
			pathCount: e,
			nodeCount: n,
			colorCount: r.length,
			palette: r,
			byteLength: new TextEncoder().encode(t).length,
			width: a,
			height: i
		};
	}(W);
	l.tracing && l.emitStep(() => ({
		code: "serialize",
		label: "Serialize SVG",
		charts: [Zt(H)],
		metrics: {
			paths: Q.pathCount,
			nodes: Q.nodeCount,
			colors: Q.colorCount,
			bytes: Q.byteLength
		},
		notes: [s.optimizeSvg ? "Path optimization on." : "Path optimization off."]
	})), 0 === H.length && f.push({
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
		for (const a of t) {
			let t = 1 / 0, e = 1 / 0, n = -1 / 0, o = -1 / 0;
			for (const r of a.commands) "Z" !== r.type && (r.x < t && (t = r.x), r.y < e && (e = r.y), r.x > n && (n = r.x), r.y > o && (o = r.y));
			t < 1 / 0 && (s = Math.min(s, Math.min(n - t, o - e)));
		}
		s < 1 / 0 && s * r < 1 && o.push({
			code: "tiny-features",
			severity: "warning",
			message: `Smallest shape is ~${(s * r).toFixed(2)} mm — most blades/lasers cannot cut below 1 mm cleanly.`,
			params: { mm: (s * r).toFixed(2) }
		});
	}(H, q, s, f), j.length > 0 && ("mm" === s.unit || s.groupByColor) && f.push({
		code: "gradient-spot-color",
		severity: "info",
		message: `${j.length} gradient fill${1 === j.length ? "" : "s"} won't reproduce on spot-color cutters/printers — turn off gradient detection for those outputs.`,
		params: { count: j.length }
	});
	const X = l.finish();
	return {
		svg: W,
		width: q,
		height: B,
		palette: K,
		stats: {
			pathCount: Q.pathCount,
			nodeCount: Q.nodeCount,
			colorCount: Q.colorCount,
			byteLength: Q.byteLength,
			durationMs: k() - a,
			stages: X
		},
		warnings: f,
		document: r?.withDocument ? En(H, j, q, B, s) : void 0
	};
}
function Xn(t) {
	return t.map((t) => ze(t.points));
}
function Yn(t, e, n, o) {
	const r = n?.stack;
	if (r) return o && Nn(o).stackHits++, r;
	o && Nn(o).stackMisses++;
	const s = function(t, e) {
		const n = to(t, e), o = new Int32Array(e.length).fill(-1);
		n.forEach((t, e) => o[t] = e);
		const r = function(t) {
			const { width: e, height: n, data: o } = t, r = e * n, s = new Uint8Array(r), a = new Int32Array(r), i = new Int32Array(r), l = [];
			for (let c = 0; c < r; c++) {
				if (1 === s[c] || o[c] < 0) continue;
				const t = o[c];
				let n = 0, f = 0;
				a[n++] = c, s[c] = 1;
				let h = !0, u = -2;
				for (; n > 0;) {
					const l = a[--n];
					i[f++] = l;
					const c = l - (l / e | 0) * e;
					if (0 === c) h = !1;
					else {
						const e = l - 1;
						o[e] === t ? 0 === s[e] && (s[e] = 1, a[n++] = e) : o[e] < 0 ? h = !1 : -2 === u ? u = o[e] : u !== o[e] && (h = !1);
					}
					if (c === e - 1) h = !1;
					else {
						const e = l + 1;
						o[e] === t ? 0 === s[e] && (s[e] = 1, a[n++] = e) : o[e] < 0 ? h = !1 : -2 === u ? u = o[e] : u !== o[e] && (h = !1);
					}
					if (l < e) h = !1;
					else {
						const r = l - e;
						o[r] === t ? 0 === s[r] && (s[r] = 1, a[n++] = r) : o[r] < 0 ? h = !1 : -2 === u ? u = o[r] : u !== o[r] && (h = !1);
					}
					if (l >= r - e) h = !1;
					else {
						const r = l + e;
						o[r] === t ? 0 === s[r] && (s[r] = 1, a[n++] = r) : o[r] < 0 ? h = !1 : -2 === u ? u = o[r] : u !== o[r] && (h = !1);
					}
				}
				h && u >= 0 && l.push({
					label: t,
					surround: u,
					pixels: i.slice(0, f)
				});
			}
			return l;
		}(t).filter((t) => {
			const e = o[t.surround] - o[t.label];
			return o[t.label] >= 0 && o[t.surround] >= 0 && e >= 2;
		});
		let s = t.data, a = n;
		if (r.length > 0) {
			const n = new Int32Array(t.data);
			for (const t of r) for (const e of t.pixels) n[e] = t.surround;
			const o = new Uint32Array(e.length);
			for (let t = 0; t < n.length; t++) {
				const e = n[t];
				e >= 0 && o[e]++;
			}
			s = n, a = to({
				width: t.width,
				height: t.height,
				data: n,
				count: t.count
			}, o);
		}
		const i = /* @__PURE__ */ new Map();
		for (const c of r) {
			let t = i.get(c.label);
			void 0 === t && (t = [], i.set(c.label, t));
			for (const e of c.pixels) t.push(e);
		}
		const l = [...i.keys()].toSorted((t, e) => t - e).map((t) => ({
			label: t,
			pixels: i.get(t)
		}));
		return {
			stackLabels: s,
			labelCount: e.length,
			order: a,
			islands: l
		};
	}(t, e);
	if (n) {
		for (const t of o?.palette?.values() ?? []) t !== n && (t.stack = void 0);
		n.stack = s;
	}
	return s;
}
const Gn = 255, Vn = 256, Jn = 255, _n = 64;
function to(t, e) {
	const n = [];
	for (let o = 0; o < e.length; o++) e[o] > 0 && n.push(o);
	if (n.sort((t, n) => e[n] - e[t]), n.length > 1) {
		const e = function(t) {
			const { data: e, width: n, height: o } = t, r = new Float64Array(t.count);
			for (let s = 0; s < o; s++) for (let t = 0; t < n; t++) {
				const a = s * n + t, i = e[a];
				i < 0 || ((t + 1 >= n || e[a + 1] !== i) && r[i]++, (t - 1 < 0 || e[a - 1] !== i) && r[i]++, (s + 1 >= o || e[a + n] !== i) && r[i]++, (s - 1 < 0 || e[a - n] !== i) && r[i]++);
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
function eo(t, e, n, o, r, s) {
	if (!s.gradients || null !== s.palette || "pixel" === s.curveMode) return;
	const a = s.gradientStrength, i = xt(t, e, {
		alpha: r ?? void 0,
		minArea: s.gradientMinArea > 0 ? s.gradientMinArea : Math.max(64, s.minRegionArea),
		maxBacktrack: .06 + .18 * a,
		minColorSpan: .09 - .08 * a,
		detectMaxDimension: s.gradientMaxDimension
	});
	if (!i.gradients.some((t) => null !== t)) return;
	const l = i.labels.count, c = n.slice(), f = new Uint8Array(3 * l);
	f.set(o.subarray(0, Math.min(o.length, 3 * l)));
	for (let h = n.length; h < l; h++) {
		const t = i.parentLabel[h];
		c.push(n[t]), f[3 * h] = o[3 * t], f[3 * h + 1] = o[3 * t + 1], f[3 * h + 2] = o[3 * t + 2];
	}
	return {
		gradients: i.gradients,
		underlays: i.underlays,
		labels: i.labels,
		paletteHex: c,
		paletteRgb: f
	};
}
function no(t) {
	const e = new Uint32Array(t.count);
	for (let n = 0; n < t.data.length; n++) {
		const o = t.data[n];
		o >= 0 && e[o]++;
	}
	return e;
}
function oo(t, e) {
	for (const n of e) t.includes(n) || t.push(n);
}
function ro(t) {
	const e = t.length / 3 | 0, o = new Float32Array(3 * e);
	for (let r = 0; r < e; r++) {
		const [e, s, a] = n(t[3 * r] / 255, t[3 * r + 1] / 255, t[3 * r + 2] / 255);
		o[3 * r] = e, o[3 * r + 1] = s, o[3 * r + 2] = a;
	}
	return o;
}
function so(t, e) {
	const [o, r, a] = function(t) {
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
		let a = 0, i = -1;
		for (const [l, c] of r) c > i && (i = c, a = l);
		return [
			a >> 16 & 255,
			a >> 8 & 255,
			255 & a
		];
	}(t), [l, c, f] = n(o / 255, r / 255, a / 255);
	let h = -1, u = 1 / 0;
	for (let d = 0; d < e.length; d++) {
		const t = i(e[d]);
		if (!t) continue;
		const [o, r, a] = n(t[0] / 255, t[1] / 255, t[2] / 255), p = s(o, r, a, l, c, f);
		p < u && (u = p, h = d);
	}
	return h;
}
const ao = .35;
function io(t) {
	return Math.round(100 * t) / 100;
}
function lo(t) {
	return [t.data.buffer, t.offsets.buffer];
}
function co(t) {
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
function fo(t, e) {
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
var ho = class {
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
			const o = e.stackLabels.slice().buffer, r = e.order.slice().buffer, s = e.islandLabels.slice().buffer, a = e.islandPixels.slice().buffer, i = e.islandOffsets.slice().buffer;
			this.send(n, {
				type: "helper-stack",
				key: t,
				width: e.width,
				height: e.height,
				labelCount: e.labelCount,
				stackLabels: o,
				order: r,
				islandLabels: s,
				islandPixels: a,
				islandOffsets: i,
				turnPolicy: e.turnPolicy,
				minArea: e.minArea
			}, [
				o,
				r,
				s,
				a,
				i
			]), n.stackKey = t;
		}
	}
	setRingUnits(t, e) {
		for (let n = 0; n < this.slots.length; n++) {
			const o = this.slots[n];
			if (o.ringKey === t) continue;
			const r = [], s = [];
			for (let t = 0; t < e.rings.length; t++) this.helperOf(t) === n && (r.push(t), s.push(e.rings[t]));
			const a = co(s), i = new Int32Array(r).buffer, l = e.coverage ? e.coverage.data.slice().buffer : void 0;
			this.send(o, {
				type: "helper-rings",
				key: t,
				width: e.width,
				height: e.height,
				units: i,
				rings: a,
				coverage: l
			}, [
				i,
				...lo(a),
				...l ? [l] : []
			]), o.ringKey = t;
		}
	}
	setChains(t, e) {
		for (let n = 0; n < this.slots.length; n++) {
			const o = this.slots[n];
			if (o.chainKey === t) continue;
			const r = [], s = [], a = [], i = [], l = [];
			for (let t = 0; t < e.chains.length; t++) {
				if (this.helperOf(t) !== n) continue;
				const o = e.chains[t];
				r.push(t), s.push(o.points), a.push(o.left), i.push(o.right), l.push(o.loop ? 1 : 0);
			}
			const c = co(s), f = new Int32Array(r).buffer, h = new Int32Array(a).buffer, u = new Int32Array(i).buffer, d = new Uint8Array(l).buffer;
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
				...lo(c)
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
				const a = t.paletteOklab ? t.paletteOklab.slice().buffer : void 0;
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
					paletteOklab: a,
					arcPrecision: t.arcPrecision
				}, a ? [a] : void 0);
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
						const s = e.counts[r], a = e.svgCounts?.[r] ?? s, i = new Array(s);
						for (let n = 0; n < s; n++) i[n] = fo(e.commands, t + n);
						const l = e.svg ? e.svg.slice(o, o + a) : void 0;
						t += s, o += a, n.results.set(e.units[r], {
							unit: e.units[r],
							shapes: i,
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
		const a = t.data;
		if ("cancel" === a.type) return void e.add(a.id);
		if ("helpers" === a.type) return void (r = a.ports.length > 0 ? new ho(a.ports) : void 0);
		if ("vectorize" !== a.type) return;
		const { id: i, width: l, height: c, buffer: f, settings: u, edgeHint: d, coverageHint: p, imageId: y, trace: g } = a;
		(async function(t, a, i, l, c, f, u, d) {
			try {
				const h = await Qn(a, i, {
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
		})(i, {
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
		} : void 0, y, g, a.withDocument);
	});
})(self);
