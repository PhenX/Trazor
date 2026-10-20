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
function s(t) {
	const e = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim());
	if (!e) return null;
	let n = e[1];
	return 3 === n.length && (n = n[0] + n[0] + n[1] + n[1] + n[2] + n[2]), [
		Number.parseInt(n.slice(0, 2), 16),
		Number.parseInt(n.slice(2, 4), 16),
		Number.parseInt(n.slice(4, 6), 16)
	];
}
function a(t) {
	return Math.max(0, Math.min(255, Math.round(t))).toString(16).padStart(2, "0");
}
function i(t, e, n) {
	return `#${a(t)}${a(e)}${a(n)}`;
}
function l(t, e, n) {
	const [r, s, a] = o(t, e, n);
	return i(255 * r, 255 * s, 255 * a);
}
function c(t) {
	return t > 216 / 24389 ? Math.cbrt(t) : 841 / 108 * t + 4 / 29;
}
function f(e, n, o) {
	const r = t(e), s = t(n), a = t(o), i = .2126729 * r + .7151522 * s + .072175 * a, l = (.0193339 * r + .119192 * s + .9503041 * a) / 1.08883, f = c((.4124564 * r + .3575761 * s + .1804375 * a) / .95047), h = c(i);
	return [
		116 * h - 16,
		500 * (f - h),
		200 * (h - c(l))
	];
}
const h = Math.PI / 180;
function u(t, e, n, o, r, s) {
	const a = ((Math.hypot(e, n) + Math.hypot(r, s)) / 2) ** 7, i = .5 * (1 - Math.sqrt(a / (a + 25 ** 7))), l = e * (1 + i), c = r * (1 + i), f = Math.hypot(l, n), u = Math.hypot(c, s), d = (t, e) => {
		if (0 === t && 0 === e) return 0;
		const n = Math.atan2(e, t) / h;
		return n < 0 ? n + 360 : n;
	}, p = d(l, n), M = d(c, s), g = o - t, w = u - f;
	let y = 0;
	f * u !== 0 && (y = M - p, y > 180 ? y -= 360 : y < -180 && (y += 360));
	const m = 2 * Math.sqrt(f * u) * Math.sin(y / 2 * h), b = (t + o) / 2, A = (f + u) / 2;
	let F = p + M;
	f * u !== 0 && (Math.abs(p - M) > 180 && (F += p + M < 360 ? 360 : -360), F /= 2);
	const x = 1 - .17 * Math.cos((F - 30) * h) + .24 * Math.cos(2 * F * h) + .32 * Math.cos((3 * F + 6) * h) - .2 * Math.cos((4 * F - 63) * h), z = 30 * Math.exp(-(((F - 275) / 25) ** 2)), v = A ** 7, k = 2 * Math.sqrt(v / (v + 25 ** 7)), S = 1 + .015 * (b - 50) ** 2 / Math.sqrt(20 + (b - 50) ** 2), I = 1 + .045 * A, U = 1 + .015 * A * x, q = -Math.sin(2 * z * h) * k, C = g / S, P = w / I, R = m / U;
	return Math.sqrt(C * C + P * P + R * R + q * P * R);
}
function d(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function p(t, e, n) {
	return d(Math.round(t), e, n);
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
const M = (() => {
	const e = /* @__PURE__ */ new Float64Array(256);
	for (let n = 0; n < 256; n++) e[n] = t(n / 255);
	return e;
})();
function g(t) {
	const { width: e, height: n, data: o } = t, r = e * n, s = new Float32Array(3 * r);
	for (let a = 0, i = 0, l = 0; a < r; a++, i += 4, l += 3) {
		const t = M[o[i]], e = M[o[i + 1]], n = M[o[i + 2]], r = Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n), a = Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n), c = Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
		s[l] = .2104542553 * r + .793617785 * a - .0040720468 * c, s[l + 1] = 1.9779984951 * r - 2.428592205 * a + .4505937099 * c, s[l + 2] = .0259040371 * r + .7827717662 * a - .808675766 * c;
	}
	return s;
}
const w = .018 * .018, y = 144e-6;
function m(t, e, n, o, r, s) {
	const a = e * e + n * n;
	if (a < w) return o;
	const i = r[3 * o + 1], l = r[3 * o + 2], c = i * i + l * l;
	if (c < y) return o;
	const f = e * i + n * l;
	if (f > 0 && f * f >= .5 * a * c) return o;
	let h = -1, u = .0081;
	for (let d = 0, p = 0; d < s; d++, p += 3) {
		if (d === o) continue;
		const s = r[p + 1], i = r[p + 2], l = s * s + i * i;
		let c = l < y;
		if (!c) {
			const t = e * s + n * i;
			c = t > 0 && t * t >= .5 * a * l;
		}
		if (!c) continue;
		const f = t - r[p], M = e - s, g = n - i, w = f * f + M * M + g * g;
		w < u && (u = w, h = d);
	}
	return h >= 0 ? h : o;
}
function b(t, e, n, o, r, s, a, i, l) {
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
			l && (p = m(t, o, s, p, e, n)), f.set(a, p);
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
function A(t, e) {
	const n = new Array(e);
	for (let o = 0; o < e; o++) n[o] = o;
	return n.sort((e, n) => t[n] - t[e] || e - n), n;
}
(() => {
	const t = [];
	for (let e = -2; e <= 2; e++) for (let n = -2; n <= 2; n++) (n || e) && t.push([n, e]);
})();
const F = Math.fround, x = /* @__PURE__ */ new Float32Array(1), z = new Uint32Array(x.buffer);
var v = class {
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
	constructor(t, e, n) {
		this.a = t, this.base = 256 * (127 + e), this.size = 256 * (n - e), this.start = new Float64Array(this.size), this.inv = new Float64Array(this.size), this.at = new Float64Array(this.size);
		for (let o = 0; o < this.size; o++) {
			z[0] = this.base + o << 15;
			const e = x[0];
			this.start[o] = e, this.inv[o] = 1 / e, this.at[o] = Math.pow(e, t);
		}
		this.c1 = t, this.c2 = this.c1 * (t - 1) / 2, this.c3 = this.c2 * (t - 2) / 3, this.c4 = this.c3 * (t - 3) / 4, this.c5 = this.c4 * (t - 4) / 5;
	}
	of(t) {
		x[0] = t;
		const e = (z[0] >>> 15) - this.base;
		if (e >= 0 && e < this.size) {
			const n = (t - this.start[e]) * this.inv[e], o = this.at[e] * (1 + n * (this.c1 + n * (this.c2 + n * (this.c3 + n * (this.c4 + n * this.c5))))), r = F(.9999999999999 * o);
			if (r === F(1.0000000000001 * o)) return r;
		}
		return F(Math.pow(t, this.a));
	}
};
const k = Math.fround, S = k(.04045), I = (k(.0031308), k(12.92)), U = k(.055), q = k(1.055), C = k(2.4), P = k(1 / C), R = new v(C, -4, 1);
new v(P, -9, 1), Float64Array.from({ length: 256 }, (t, e) => k(e / 255)).map(function(t) {
	return t <= S ? k(t / I) : R.of(k(k(t + U) / q));
}), Float64Array.from({ length: 1002 }, (t, e) => function(t) {
	return Math.min(t, 1e3) / 1e3;
}(e)), Object.freeze({
	sigmaNoise: 0,
	lambda: 0,
	noiseSigmas: 0,
	sameInkDe00: 0
});
const D = Math.fround, $ = (D(1 / (D(.04045), D(.0031308), D(12.92), D(.055), D(1.055), D(2.4))), [
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(D), [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(D), [
	.39633778,
	.21580376,
	-.105561346,
	-.06385417,
	-.08948418,
	-1.2914855
].map(D), [
	4.0767417,
	-3.3077116,
	.23096994,
	-1.268438,
	2.6097574,
	-.34131938,
	-.004196086,
	-.7034186,
	1.7076147
].map(D), D(.05), D(.15), D(.06), D(.02), Math.fround), H = ($(.4), $(.8), (0, Math.fround)(1e-12), Math.fround), N = Float32Array.from({ length: 256 }, (t, e) => e / 255);
function T(t) {
	const e = t.width * t.height, n = t.data, o = new Float32Array(3 * e);
	for (let r = 0; r < e; r++) {
		const t = n[4 * r + 3];
		if (1 === t) {
			o[3 * r] = n[4 * r], o[3 * r + 1] = n[4 * r + 1], o[3 * r + 2] = n[4 * r + 2];
			continue;
		}
		const e = H(1 - t);
		o[3 * r] = H(n[4 * r] * t) + e, o[3 * r + 1] = H(n[4 * r + 1] * t) + e, o[3 * r + 2] = H(n[4 * r + 2] * t) + e;
	}
	return o;
}
H(.2126), H(.7152), H(.0722), H(2 / 255), H(1e-6), H(24 / 255);
const B = 2 / 255, W = Object.freeze({
	edges: 0,
	softFraction: 0,
	width: 1,
	featureP10: 1 / 0,
	cores: 0,
	sharpFraction: 0
}), O = 2 ** -600, j = 2 ** 511, L = 2 ** -511, V = 2 ** -54;
function K(t, e) {
	let n, o, r = Math.sqrt(t * t + e * e);
	if (r <= 2 * e) {
		const s = r - e;
		n = t * (2 * s - t), o = (s - 2 * (t - e)) * s;
	} else {
		const s = r - t;
		n = 2 * s * (t - 2 * e), o = (4 * s - e) * e + s * s;
	}
	return r -= (n + o) / (2 * r), r;
}
function G(t, e, n, o, r, s) {
	if (o < 1 || r < 1 || o + 1 >= e || r + 1 >= n) return -1;
	const a = (r - 1) * e, i = r * e, l = (r + 1) * e, c = t[a + o + 1] + 2 * t[i + o + 1] + t[l + o + 1] - (t[a + o - 1] + 2 * t[i + o - 1] + t[l + o - 1]), f = t[l + o - 1] + 2 * t[l + o] + t[l + o + 1] - (t[a + o - 1] + 2 * t[a + o] + t[a + o + 1]), h = function(t, e) {
		if (!Number.isFinite(t) || !Number.isFinite(e)) return Math.abs(t) === 1 / 0 || Math.abs(e) === 1 / 0 ? 1 / 0 : NaN;
		const n = Math.abs(t), o = Math.abs(e), r = n < o ? o : n, s = n < o ? n : o;
		return r > j ? s <= r * V ? r + s : K(r * O, s * O) / O : s < L ? r >= s / V ? r + s : K(r / O, s / O) * O : s <= r * V ? r + s : K(r, s);
	}(c, f);
	if (h < 1e-9) return -1;
	const u = Math.abs(s ? c : f) / h;
	return u >= .92 ? u : -1;
}
function Q(t, e, n, o, r, s, a) {
	const i = Math.max(t.length - 1, 0);
	let l = 0, c = 0, f = 0;
	for (; f < i;) {
		if (Math.abs(t[f + 1] - t[f]) <= B) {
			f++;
			continue;
		}
		const h = t[f + 1] - t[f] > 0 ? 1 : -1, u = f;
		for (; f < i && (t[f + 1] - t[f]) * h > B;) f++;
		const d = f;
		let p = 0;
		for (let e = u; e < d; e++) p += (t[e + 1] - t[e]) * h;
		if (p < .2) continue;
		let M = 0;
		for (let e = u; e < d; e++) M += (t[e + 1] - t[e]) * h / p * e;
		0 !== c && c !== h && a.spacings.push(M - l), l = M, c = h;
		const g = (u + d >>> 1) + 1, w = r ? G(e, n, o, g, s, !0) : G(e, n, o, s, g, !1);
		if (w < 0) continue;
		if (a.cores.push(J(t, u, d, h) * w * w), u < 3 || d + 3 > i) continue;
		const y = Math.abs(t[u] - t[u - 3]), m = Math.abs(t[d + 3] - t[d]);
		if (y > .12 * p || m > .12 * p) continue;
		let b = 0;
		for (let e = u; e < d; e++) {
			const n = e - M;
			b += (t[e + 1] - t[e]) * h / p * (n * n);
		}
		a.spreads.push(b * w * w);
	}
}
function J(t, e, n, o) {
	let r = e;
	for (let h = e; h < n; h++) (t[h + 1] - t[h]) * o > (t[r + 1] - t[r]) * o && (r = h);
	const s = .25 * (t[r + 1] - t[r]) * o;
	let a = r;
	for (; a > e && (t[a] - t[a - 1]) * o >= s;) a--;
	let i = r + 1;
	for (; i < n && (t[i + 1] - t[i]) * o >= s;) i++;
	let l = 0;
	for (let h = a; h < i; h++) l += (t[h + 1] - t[h]) * o;
	let c = 0;
	for (let h = a; h < i; h++) c += (t[h + 1] - t[h]) * o / l * h;
	let f = 0;
	for (let h = a; h < i; h++) {
		const e = h - c;
		f += (t[h + 1] - t[h]) * o / l * (e * e);
	}
	return f;
}
(0, Math.fround)(1e-9);
const X = Math.fround, Y = ([
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(X), [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(X), Math.fround), Z = (Y(.999), Y(.02), Y(.5), Y(.05), Y(.995), Y(.005), Y(.5), Y(.4), Y(.8), Math.fround), tt = (Z(1 + (Z(.02), Z(.004), Z(.012), Z(1.6), Z(.04), Z(.12), Z(.02), Z(1e-9), Z(1e-12), Z(.15))), Math.fround), et = (tt(.98), tt(.05), 512);
function nt(t, e) {
	return 255 === e ? t : Math.round((t * e + 255 * (255 - e)) / 255);
}
function ot(t) {
	return t >> 21 << 6 | (t >> 13 & 7) << 3 | t >> 5 & 7;
}
function rt(t) {
	return f((t >> 16 & 255) / 255, (t >> 8 & 255) / 255, (255 & t) / 255);
}
function st(t, e) {
	if (void 0 === e) return 0;
	let n = -1, o = 0;
	for (const [a, i] of t) ot(a) === e && (i > o || i === o && a < n) && (n = a, o = i);
	if (n < 0) return 0;
	const r = rt(n);
	let s = 0;
	for (const [a, i] of t) {
		if (ot(a) !== e || a === n) continue;
		const t = rt(a);
		u(r[0], r[1], r[2], t[0], t[1], t[2]) > 1.5 && (s += i);
	}
	return s;
}
const at = 1024;
function it(t) {
	const { width: e, height: n, data: o } = t, r = Math.min(e, at), s = Math.min(n, at);
	let a = t;
	if (r < e || s < n) {
		const t = Math.floor((e - r) / 2), i = Math.floor((n - s) / 2), l = new Uint8ClampedArray(r * s * 4);
		for (let n = 0; n < s; n++) {
			const s = 4 * ((i + n) * e + t);
			l.set(o.subarray(s, s + 4 * r), n * r * 4);
		}
		a = {
			width: r,
			height: s,
			data: l
		};
	}
	return function(t, e, n) {
		if (e < 10 || n < 10 || t.length < e * n * 3) return { ...W };
		const o = function(t, e) {
			const n = new Float64Array(e);
			for (let o = 0; o < e; o++) n[o] = .2126 * t[3 * o] + .7152 * t[3 * o + 1] + .0722 * t[3 * o + 2];
			return n;
		}(t, e * n), r = {
			spreads: [],
			cores: [],
			spacings: []
		};
		for (let a = 0; a < n; a++) Q(o.subarray(a * e, (a + 1) * e), o, e, n, !0, a, r);
		const s = new Float64Array(n);
		for (let a = 0; a < e; a++) {
			for (let t = 0; t < n; t++) s[t] = o[t * e + a];
			Q(s, o, e, n, !1, a, r);
		}
		return function(t) {
			const e = t.cores.length;
			let n = 0;
			for (const h of t.cores) h <= .25 && n++;
			const o = 0 === e ? 0 : n / e, r = t.spreads.length;
			if (r < 16) return {
				...W,
				edges: r,
				cores: e,
				sharpFraction: o
			};
			let s = 1 / 0;
			if (t.spacings.length >= 16) {
				const e = Float64Array.from(t.spacings).toSorted();
				s = e[Math.floor(e.length / 10)];
			}
			let a = 0;
			for (const h of t.spreads) h > .3 && a++;
			const i = Float64Array.from(t.spreads).toSorted(), l = Math.min(Math.max(Math.ceil(.8 * r), 1), r);
			let c = 0;
			for (let h = 0; h < l; h++) c += i[h];
			const f = c / l;
			return {
				edges: r,
				softFraction: a / r,
				width: Math.sqrt((12 * f + 1) / 3),
				featureP10: s,
				cores: e,
				sharpFraction: o
			};
		}(r);
	}(function(t) {
		const e = function(t) {
			const e = t.width * t.height * 4, n = new Float32Array(e);
			for (let o = 0; o < e; o++) n[o] = N[t.data[o]];
			return {
				width: t.width,
				height: t.height,
				data: n
			};
		}(t), n = t.width * t.height;
		let o = !0;
		for (let s = 0; s < n; s++) if (255 !== t.data[4 * s + 3]) {
			o = !1;
			break;
		}
		let r = null;
		if (!o) {
			r = new Float32Array(n);
			for (let t = 0; t < n; t++) r[t] = e.data[4 * t + 3];
		}
		return {
			rgb: T(e),
			alpha: r
		};
	}(a).rgb, r, s).width;
}
function lt(t, e = function(t) {
	const { width: e, height: o, data: r } = t, s = e * o, a = Math.max(1, Math.floor(Math.sqrt(s / 262144))), l = Math.ceil(e / a), c = Math.ceil(o / a), f = /* @__PURE__ */ new Set(), h = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Float64Array(4096), p = new Uint32Array(et), M = /* @__PURE__ */ new Float64Array(2048), g = new Uint32Array(et), w = /* @__PURE__ */ new Float64Array(1536), y = /* @__PURE__ */ new Map(), m = [], b = new Uint8Array(l * c);
	let A = !1, F = 0, x = 0, z = 0, v = 0, k = 0, S = 0, I = 0, U = 0, q = 0;
	for (let i = 0; i < c; i++) {
		const t = i * a, s = t * e;
		for (let c = 0; c < l; c++) {
			const d = c * a, C = 4 * (s + d), P = r[C + 3], R = nt(r[C], P), D = nt(r[C + 1], P), E = nt(r[C + 2], P);
			P < 250 && (A = !0), F++;
			const $ = R << 16 | D << 8 | E;
			f.size < 65536 && f.add($), u[R >> 4 << 8 | D >> 4 << 4 | E >> 4]++;
			const [H, N, T] = n(R / 255, D / 255, E / 255), B = R >> 5 << 6 | D >> 5 << 3 | E >> 5;
			0 === p[B] && m.push(B), p[B]++, M[4 * B] += R, M[4 * B + 1] += D, M[4 * B + 2] += E, M[4 * B + 3] += H, I += H, U += H * H;
			const W = Math.hypot(N, T);
			q += W, W > .05 && S++;
			let O = 0, j = 0;
			if (d + a < e) {
				const t = 4 * (s + d + a), e = r[t + 3];
				O = Math.abs(R - nt(r[t], e)) + Math.abs(D - nt(r[t + 1], e)) + Math.abs(E - nt(r[t + 2], e));
			}
			if (t + a < o) {
				const n = 4 * ((t + a) * e + d), o = r[n + 3];
				j = Math.abs(R - nt(r[n], o)) + Math.abs(D - nt(r[n + 1], o)) + Math.abs(E - nt(r[n + 2], o));
			}
			if (d + a < e && t + a < o) {
				const t = Math.max(O, j);
				if (t > 72) z++;
				else if (t > 3) v++;
				else if (0 === t) {
					k++, g[B]++, w[3 * B] += R, w[3 * B + 1] += D, w[3 * B + 2] += E;
					const t = y.get($);
					void 0 !== t ? y.set($, t + 1) : y.size < 65536 && y.set($, 1), h.size < 65536 && h.add($);
				}
			}
			P >= 128 && (x++, O <= 12 && j <= 12 && (b[i * l + c] = 1));
		}
	}
	const { flat: C, ramp: P, fine: R } = function(t, e, n, o, r) {
		const { width: s, data: a } = t, i = n * o, l = new Uint8Array(i), c = new Int32Array(i), f = /* @__PURE__ */ new Int32Array(96);
		let h = 0, u = 0, d = 0;
		for (let p = 0; p < i; p++) {
			if (0 === r[p] || 1 === l[p]) continue;
			f.fill(0);
			let t = 0, i = 0;
			for (c[i++] = p, l[p] = 1; i > 0;) {
				const h = c[--i];
				t++;
				const u = h - (h / n | 0) * n, d = h / n | 0, p = 4 * (d * e * s + u * e), M = a[p + 3];
				f[nt(a[p], M) + nt(a[p + 1], M) + nt(a[p + 2], M) >> 3]++, u > 0 && 1 === r[h - 1] && 0 === l[h - 1] && (l[h - 1] = 1, c[i++] = h - 1), u + 1 < n && 1 === r[h + 1] && 0 === l[h + 1] && (l[h + 1] = 1, c[i++] = h + 1), d > 0 && 1 === r[h - n] && 0 === l[h - n] && (l[h - n] = 1, c[i++] = h - n), d + 1 < o && 1 === r[h + n] && 0 === l[h + n] && (l[h + n] = 1, c[i++] = h + n);
			}
			let M = 0, g = -1, w = 95;
			for (let e = 0; e < 96; e++) if (M += f[e], g < 0 && M >= .05 * t && (g = e), M >= .95 * t) {
				w = e;
				break;
			}
			8 * (w - g) >= 60 ? u += t : h += t, t < 16 && (d += t);
		}
		return {
			flat: h,
			ramp: u,
			fine: d
		};
	}(t, a, l, c, b);
	let D = 0;
	for (let n = 0; n < 4096; n++) {
		const t = u[n];
		if (t > 0) {
			const e = t / F;
			D -= e * Math.log2(e);
		}
	}
	const E = m.toSorted((t, e) => p[e] - p[t]), $ = E[0], H = E[1], N = (t) => void 0 === t ? 0 : p[t], T = 0 === F ? 0 : (N($) + N(H)) / F, B = E.slice(0, 6).map((t) => i(32 * (t >> 6 & 7) + 16, 32 * (t >> 3 & 7) + 16, 32 * (7 & t) + 16)), W = (t) => void 0 === t ? 0 : g[t], O = 0 === F ? 0 : (k - W($) - W(H) + st(y, $) + st(y, H)) / F, j = (t) => {
		const e = p[t], n = 4 * t, o = g[t], r = 3 * t;
		return {
			hex: o > 0 ? i(Math.round(w[r] / o), Math.round(w[r + 1] / o), Math.round(w[r + 2] / o)) : i(Math.round(M[n] / e), Math.round(M[n + 1] / e), Math.round(M[n + 2] / e)),
			lightness: M[n + 3] / e
		};
	}, L = void 0 === $ ? {
		hex: "#000000",
		lightness: 0
	} : j($), V = void 0 === H ? L : j(H), [K, G] = L.lightness <= V.lightness ? [L, V] : [V, L], Q = 0 === F ? 0 : I / F, J = 0 === F ? 0 : Math.max(0, U / F - Q ** 2), X = Math.sqrt(J), Y = 0 === F ? 0 : q / F, Z = 0 === F ? 0 : z / F, _ = 0 === F ? 0 : v / F, tt = 0 === F ? 0 : k / F, ot = 0 === F ? 0 : S / F, rt = 0 === x ? 0 : C / x, at = 0 === x ? 0 : P / x, lt = 0 === x ? 0 : R / x, ft = d(.45 * d(Math.log2(Math.max(1, f.size)) / 15, 0, 1) + .75 * d(2.2 * _, 0, 1), 0, 1), ht = Math.max(0, f.size - h.size);
	let ut = 0;
	return s <= 16384 && (ut += .45), f.size <= 32 && 2 * ht <= f.size && (ut += .4), _ < .02 && (ut += .15), ut = d(ut, 0, 1), {
		width: e,
		height: o,
		pixels: s,
		hasAlpha: A,
		distinctColors: f.size,
		rimColors: ht,
		entropyBits: D,
		edgeDensity: Z,
		microGradientDensity: _,
		flatDensity: tt,
		flatArea: rt,
		rampArea: at,
		fineArea: lt,
		twoToneCoverage: T,
		photoScore: ft,
		pixelArtScore: ut,
		dominantHex: B,
		meanLightness: Q,
		contrast: X,
		colorfulness: Y,
		coloredFraction: ot,
		minorTonesArea: O,
		inkHex: K.hex,
		paperHex: G.hex,
		edgeWidth: it(t)
	};
}(t)) {
	const r = [], a = e.distinctColors, l = (e) => function(t, e) {
		const { width: r, height: a, data: l } = t, c = r * a, h = p(e.k, 2, 64), d = p(e.quality, 1, 10), M = e.mask ? e.mask.data : null, w = "oklab" === e.colorSpace, y = new Int32Array(c), m = e.fixedPalette;
		if (null != m && m.length > 0) {
			const e = [];
			for (const t of m) {
				const n = s(t);
				null !== n && e.push(n);
			}
			if (e.length > 0) {
				const o = e.length, s = new Float32Array(3 * o), f = new Uint8Array(3 * o), h = [];
				for (let t = 0; t < o; t++) {
					const [o, r, a] = e[t];
					if (f[3 * t] = o, f[3 * t + 1] = r, f[3 * t + 2] = a, h.push(i(o, r, a)), w) {
						const [e, i, l] = n(o / 255, r / 255, a / 255);
						s[3 * t] = e, s[3 * t + 1] = i, s[3 * t + 2] = l;
					} else s[3 * t] = o / 255, s[3 * t + 1] = r / 255, s[3 * t + 2] = a / 255;
				}
				return {
					labels: {
						width: r,
						height: a,
						data: y,
						count: o
					},
					paletteHex: h,
					paletteRgb: f,
					counts: b(y, s, o, l, w ? g(t) : null, M, c, null, !1)
				};
			}
		}
		const F = /* @__PURE__ */ new Map();
		let x = 0, z = !1;
		for (let n = 0, o = 0; n < c; n++, o += 4) {
			if (null !== M) {
				if (0 === M[n]) continue;
				x++;
			}
			if (z) continue;
			const t = l[o] << 16 | l[o + 1] << 8 | l[o + 2], e = F.get(t);
			if (void 0 === e) {
				if (F.size === h) {
					if (z = !0, F.clear(), null === M) break;
					continue;
				}
				F.set(t, 1);
			} else F.set(t, e + 1);
		}
		if (null === M && (x = c), 0 === x) return y.fill(-1), {
			labels: {
				width: r,
				height: a,
				data: y,
				count: 0
			},
			paletteHex: [],
			paletteRgb: /* @__PURE__ */ new Uint8Array(0),
			counts: /* @__PURE__ */ new Uint32Array(0)
		};
		if (!z) {
			const t = F.size, e = new Int32Array(t), n = new Uint32Array(t), o = /* @__PURE__ */ new Map();
			let s = 0;
			for (const [r, a] of F) e[s] = r, n[s] = a, o.set(r, s), s++;
			const f = A(n, t), h = new Int32Array(t), u = new Uint8Array(3 * t), d = [], p = new Uint32Array(t);
			for (let r = 0; r < t; r++) {
				const t = f[r];
				h[t] = r;
				const o = e[t], s = o >> 16 & 255, a = o >> 8 & 255, l = 255 & o;
				u[3 * r] = s, u[3 * r + 1] = a, u[3 * r + 2] = l, d.push(i(s, a, l)), p[r] = n[t];
			}
			for (let r = 0, a = 0; r < c; r++, a += 4) {
				if (null !== M && 0 === M[r]) {
					y[r] = -1;
					continue;
				}
				const t = l[a] << 16 | l[a + 1] << 8 | l[a + 2];
				y[r] = h[o.get(t)];
			}
			return {
				labels: {
					width: r,
					height: a,
					data: y,
					count: t
				},
				paletteHex: d,
				paletteRgb: u,
				counts: p
			};
		}
		const v = w ? g(t) : null, k = function(t) {
			let e = t >>> 0;
			return () => {
				e = e + 1831565813 | 0;
				let t = Math.imul(e ^ e >>> 15, 1 | e);
				return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}(e.seed), S = e.sampleMask ? e.sampleMask.data : null;
		let I = null, U = x;
		if (null !== S) {
			let t = 0;
			for (let e = 0; e < c; e++) null !== M && 0 === M[e] || 0 === S[e] || t++;
			if (t >= Math.max(h, 256)) {
				const e = new Int32Array(t);
				let n = 0;
				for (let t = 0; t < c; t++) null !== M && 0 === M[t] || 0 === S[t] || (e[n++] = t);
				I = e, U = t;
			}
		}
		const q = Math.min(U, 2e4 + 2e4 * d), C = new Int32Array(q);
		if (null !== I) if (U <= q) for (let n = 0; n < U; n++) C[n] = I[n];
		else for (let n = 0; n < q; n++) C[n] = I[k() * U | 0];
		else if (x <= q) {
			let t = 0;
			for (let e = 0; e < c; e++) null !== M && 0 === M[e] || (C[t++] = e);
		} else if (null === M) for (let n = 0; n < q; n++) C[n] = k() * c | 0;
		else {
			const t = new Int32Array(x);
			let e = 0;
			for (let n = 0; n < c; n++) 0 !== M[n] && (t[e++] = n);
			for (let n = 0; n < q; n++) C[n] = t[k() * x | 0];
		}
		const P = new Float32Array(3 * q);
		if (null !== v) for (let n = 0, o = 0; n < q; n++, o += 3) {
			const t = 3 * C[n];
			P[o] = v[t], P[o + 1] = v[t + 1], P[o + 2] = v[t + 2];
		}
		else for (let n = 0, o = 0; n < q; n++, o += 3) {
			const t = 4 * C[n];
			P[o] = l[t] / 255, P[o + 1] = l[t + 1] / 255, P[o + 2] = l[t + 2] / 255;
		}
		const R = new Float32Array(3 * h), D = new Float64Array(q).fill(1 / 0), E = 3 * (k() * q | 0);
		R[0] = P[E], R[1] = P[E + 1], R[2] = P[E + 2];
		for (let n = 1; n < h; n++) {
			const t = R[3 * (n - 1)], e = R[3 * (n - 1) + 1], o = R[3 * (n - 1) + 2];
			let r = 0;
			for (let n = 0, a = 0; n < q; n++, a += 3) {
				const s = P[a] - t, i = P[a + 1] - e, l = P[a + 2] - o, c = s * s + i * i + l * l;
				c < D[n] && (D[n] = c), r += D[n];
			}
			let s = q - 1;
			if (r > 0) {
				const t = k() * r;
				let e = 0;
				for (let n = 0; n < q; n++) if (e += D[n], e >= t) {
					s = n;
					break;
				}
			} else s = k() * q | 0;
			R[3 * n] = P[3 * s], R[3 * n + 1] = P[3 * s + 1], R[3 * n + 2] = P[3 * s + 2];
		}
		const $ = 8 + 3 * d, H = new Float64Array(3 * h), N = new Uint32Array(h);
		for (let n = 0; n < $; n++) {
			H.fill(0), N.fill(0);
			for (let e = 0, n = 0; e < q; e++, n += 3) {
				const t = P[n], e = P[n + 1], o = P[n + 2];
				let r = 0, s = 1 / 0;
				for (let n = 0, i = 0; n < h; n++, i += 3) {
					const a = t - R[i], l = e - R[i + 1], c = o - R[i + 2], f = a * a + l * l + c * c;
					f < s && (s = f, r = n);
				}
				const a = 3 * r;
				H[a] += t, H[a + 1] += e, H[a + 2] += o, N[r]++;
			}
			let t = 0;
			for (let e = 0, n = 0; e < h; e++, n += 3) {
				if (0 === N[e]) continue;
				const o = 1 / N[e], r = H[n] * o, s = H[n + 1] * o, a = H[n + 2] * o, i = r - R[n], l = s - R[n + 1], c = a - R[n + 2], f = Math.sqrt(i * i + l * l + c * c);
				f > t && (t = f), R[n] = r, R[n + 1] = s, R[n + 2] = a;
			}
			if (t < 1e-4) break;
		}
		null !== I && null !== S && function(t, e, n, r, s, a, i, l) {
			let c = 0;
			for (let o = 0; o < l; o++) null !== a && 0 === a[o] || c++;
			const f = Math.max(16, .001 * c), h = (t, e) => {
				null !== s ? (e[0] = s[3 * t], e[1] = s[3 * t + 1], e[2] = s[3 * t + 2]) : (e[0] = r[4 * t] / 255, e[1] = r[4 * t + 1] / 255, e[2] = r[4 * t + 2] / 255);
			}, u = /* @__PURE__ */ new Float64Array(3), d = new Uint8Array(e);
			for (let o = 0; o < e; o++) d[o] = n[o] > 0 ? 1 : 0;
			let p = 0;
			const M = [
				0,
				0,
				0
			];
			if (null !== a) for (let o = 0; o < l; o++) 0 === a[o] && (M[0] += r[4 * o], M[1] += r[4 * o + 1], M[2] += r[4 * o + 2], p++);
			for (let g = 0; g < 4; g++) {
				const c = new Float64Array(3 * e);
				for (let n = 0; n < e; n++) if (null !== s) {
					const [e, r, s] = o(t[3 * n], t[3 * n + 1], t[3 * n + 2]);
					c[3 * n] = e, c[3 * n + 1] = r, c[3 * n + 2] = s;
				} else c[3 * n] = t[3 * n], c[3 * n + 1] = t[3 * n + 1], c[3 * n + 2] = t[3 * n + 2];
				const g = [];
				for (let t = 0; t < e; t++) d[t] && g.push(t);
				const w = [];
				for (const t of g) w.push(c[3 * t], c[3 * t + 1], c[3 * t + 2]);
				p > 0 && w.push(M[0] / p / 255, M[1] / p / 255, M[2] / p / 255);
				const y = w.length / 3, m = [], b = [];
				for (let e = 0; e < l; e++) {
					if (0 !== i[e] || null !== a && 0 === a[e]) continue;
					h(e, u);
					let n = 1 / 0;
					for (const e of g) {
						const o = u[0] - t[3 * e], r = u[1] - t[3 * e + 1], s = u[2] - t[3 * e + 2], a = o * o + r * r + s * s;
						a < n && (n = a);
					}
					if (n <= .0225) continue;
					const o = r[4 * e] / 255, s = r[4 * e + 1] / 255, l = r[4 * e + 2] / 255;
					let c = !1;
					for (let t = 0; t < y && !c; t++) for (let e = t + 1; e < y; e++) {
						const n = w[3 * e] - w[3 * t], r = w[3 * e + 1] - w[3 * t + 1], a = w[3 * e + 2] - w[3 * t + 2], i = n * n + r * r + a * a;
						if (i < 1e-9) continue;
						let f = ((o - w[3 * t]) * n + (s - w[3 * t + 1]) * r + (l - w[3 * t + 2]) * a) / i;
						f = f < 0 ? 0 : f > 1 ? 1 : f;
						const h = o - w[3 * t] - f * n, u = s - w[3 * t + 1] - f * r, d = l - w[3 * t + 2] - f * a;
						if (h * h + u * u + d * d < .0036) {
							c = !0;
							break;
						}
					}
					c || (m.push(e), b.push(n));
				}
				if (m.length < f) return;
				let A = -1;
				for (let t = 0; t < e; t++) if (!d[t]) {
					A = t;
					break;
				}
				if (A < 0) {
					let e = .0036;
					for (let o = 0; o < g.length; o++) for (let r = o + 1; r < g.length; r++) {
						const s = g[o], a = g[r], i = t[3 * s] - t[3 * a], l = t[3 * s + 1] - t[3 * a + 1], c = t[3 * s + 2] - t[3 * a + 2], f = i * i + l * l + c * c;
						f < e && (e = f, A = n[s] < n[a] ? s : a);
					}
				}
				if (A < 0) return;
				const F = m.map((t, e) => e).toSorted((t, e) => b[e] - b[t] || m[t] - m[e]), x = Math.max(1, F.length >> 2);
				let z = 0, v = 0, k = 0;
				for (let t = 0; t < x; t++) h(m[F[t]], u), z += u[0], v += u[1], k += u[2];
				t[3 * A] = z / x, t[3 * A + 1] = v / x, t[3 * A + 2] = k / x, d[A] = 1, n[A] = x;
			}
		}(R, h, N, l, v, M, S, c);
		const T = new Float64Array(3 * h);
		let B = b(y, R, h, l, v, M, c, T, w), W = 0;
		const O = new Int32Array(h);
		for (let n = 0; n < h; n++) 0 !== B[n] ? (O[n] = W, R[3 * W] = R[3 * n], R[3 * W + 1] = R[3 * n + 1], R[3 * W + 2] = R[3 * n + 2], T[3 * W] = T[3 * n], T[3 * W + 1] = T[3 * n + 1], T[3 * W + 2] = T[3 * n + 2], B[W] = B[n], W++) : O[n] = -1;
		if (W < h) {
			for (let t = 0; t < c; t++) y[t] >= 0 && (y[t] = O[y[t]]);
			B = B.slice(0, W);
		}
		if (!0 === e.autoK && W > 1) {
			const t = new Float64Array(3 * W), e = new Float64Array(3 * W), o = (e) => {
				if (w) t[3 * e] = R[3 * e], t[3 * e + 1] = R[3 * e + 1], t[3 * e + 2] = R[3 * e + 2];
				else {
					const [o, r, s] = n(R[3 * e], R[3 * e + 1], R[3 * e + 2]);
					t[3 * e] = o, t[3 * e + 1] = r, t[3 * e + 2] = s;
				}
			}, r = (t) => {
				const n = 1 / B[t], [o, r, s] = f(T[3 * t] * n / 255, T[3 * t + 1] * n / 255, T[3 * t + 2] * n / 255);
				e[3 * t] = o, e[3 * t + 1] = r, e[3 * t + 2] = s;
			};
			for (let n = 0; n < W; n++) o(n), r(n);
			const s = new Uint8Array(W).fill(1), a = new Int32Array(W);
			for (let n = 0; n < W; n++) a[n] = n;
			const i = 9e-4, l = (t, e) => {
				const n = B[t], i = B[e], l = n + i;
				R[3 * t] = (R[3 * t] * n + R[3 * e] * i) / l, R[3 * t + 1] = (R[3 * t + 1] * n + R[3 * e + 1] * i) / l, R[3 * t + 2] = (R[3 * t + 2] * n + R[3 * e + 2] * i) / l, T[3 * t] += T[3 * e], T[3 * t + 1] += T[3 * e + 1], T[3 * t + 2] += T[3 * e + 2], B[t] = l, s[e] = 0, a[e] = t, o(t), r(t);
			};
			for (;;) {
				let e = -1, n = -1, o = 1 / 0;
				for (let r = 0; r < W; r++) if (0 !== s[r]) for (let a = r + 1; a < W; a++) {
					if (0 === s[a]) continue;
					const i = t[3 * r] - t[3 * a], l = t[3 * r + 1] - t[3 * a + 1], c = t[3 * r + 2] - t[3 * a + 2], f = i * i + l * l + c * c;
					f < o && (o = f, e = r, n = a);
				}
				if (e < 0 || o >= i) break;
				l(e, n);
			}
			for (;;) {
				let t = -1, n = -1, o = 1 / 0;
				for (let r = 0; r < W; r++) if (0 !== s[r]) for (let a = r + 1; a < W; a++) {
					if (0 === s[a]) continue;
					const i = u(e[3 * r], e[3 * r + 1], e[3 * r + 2], e[3 * a], e[3 * a + 1], e[3 * a + 2]);
					i < o && (o = i, t = r, n = a);
				}
				if (t < 0 || o >= 1.5) break;
				l(t, n);
			}
			const h = new Int32Array(W);
			let d = 0;
			for (let n = 0; n < W; n++) 0 !== s[n] && (h[n] = d, R[3 * d] = R[3 * n], R[3 * d + 1] = R[3 * n + 1], R[3 * d + 2] = R[3 * n + 2], T[3 * d] = T[3 * n], T[3 * d + 1] = T[3 * n + 1], T[3 * d + 2] = T[3 * n + 2], B[d] = B[n], d++);
			if (d < W) {
				const t = new Int32Array(W);
				for (let e = 0; e < W; e++) {
					let n = e;
					for (; a[n] !== n;) n = a[n];
					t[e] = h[n];
				}
				for (let e = 0; e < c; e++) y[e] >= 0 && (y[e] = t[y[e]]);
				B = B.slice(0, d), W = d;
			}
		}
		const j = A(B, W), L = new Int32Array(W), V = new Uint8Array(3 * W), K = [], G = new Uint32Array(W);
		for (let n = 0; n < W; n++) {
			const t = j[n];
			L[t] = n;
			const e = 1 / B[t], o = Math.round(T[3 * t] * e), r = Math.round(T[3 * t + 1] * e), s = Math.round(T[3 * t + 2] * e);
			V[3 * n] = o, V[3 * n + 1] = r, V[3 * n + 2] = s, K.push(i(o, r, s)), G[n] = B[t];
		}
		for (let n = 0; n < c; n++) y[n] >= 0 && (y[n] = L[y[n]]);
		return {
			labels: {
				width: r,
				height: a,
				data: y,
				count: W
			},
			paletteHex: K,
			paletteRgb: V,
			counts: G
		};
	}(t, {
		k: e,
		colorSpace: "oklab",
		quality: 4,
		seed: 1374496523,
		autoK: !0
	}).paletteHex;
	a >= 2 && a <= 32 && r.push({
		id: "exact",
		label: `Exact (${a})`,
		colors: l(Math.min(32, a)),
		description: "Every color the image actually uses."
	});
	const c = l(a <= 12 ? Math.max(2, Math.min(12, a)) : 12);
	if (r.push({
		id: "balanced",
		label: `Balanced (${c.length})`,
		colors: c,
		description: "Perceptual clustering at a comfortable size."
	}), a > 8) {
		const t = l(6);
		r.push({
			id: "bold",
			label: `Bold (${t.length})`,
			colors: t,
			description: "Few strong tones — poster and print friendly."
		});
	}
	if (a > 64) {
		const t = l(24);
		r.push({
			id: "rich",
			label: `Rich (${t.length})`,
			colors: t,
			description: "Wide tonal coverage for detailed art."
		});
	}
	r.push({
		id: "vivid",
		label: `Vivid (${c.length})`,
		colors: ut(c.map((t) => ct(t, 1.45, 0))),
		description: "The balanced palette with the saturation pushed."
	}), r.push({
		id: "muted",
		label: `Muted (${c.length})`,
		colors: ut(c.map((t) => ct(t, .5, .06))),
		description: "Soft, pastel take on the image colors."
	});
	const h = function(t) {
		let e = null, o = -1;
		for (const r of t) {
			const t = s(r);
			if (!t) continue;
			const [, a, i] = n(t[0] / 255, t[1] / 255, t[2] / 255), l = Math.hypot(a, i);
			l > o && (o = l, e = r);
		}
		return e;
	}(e.dominantHex) ?? "#1a1a2e";
	r.push({
		id: "duotone",
		label: "Duotone",
		colors: ft(h, 4),
		description: "One ink over paper — riso / screen-print look."
	}), r.push({
		id: "mono",
		label: "Mono (6)",
		colors: ht(6),
		description: "Neutral grayscale ramp."
	});
	const M = /* @__PURE__ */ new Set();
	return r.filter((t) => {
		if (t.colors.length < 2) return !1;
		const e = t.colors.join(",");
		return !M.has(e) && (M.add(e), !0);
	});
}
function ct(t, e, o) {
	const r = s(t);
	if (!r) return t;
	const [a, i, c] = n(r[0] / 255, r[1] / 255, r[2] / 255);
	return l(d(a * (1 - o) + o, 0, 1), i * e, c * e);
}
function ft(t, e) {
	const o = s(t) ?? [
		26,
		26,
		46
	], [r, a, i] = n(o[0] / 255, o[1] / 255, o[2] / 255), c = Math.min(r, .45), f = [];
	for (let n = 0; n < e; n++) {
		const t = n / (e - 1), o = c + (.97 - c) * t, r = 1 - .85 * t;
		f.push(l(o, a * r, i * r));
	}
	return ut(f);
}
function ht(t) {
	const e = [];
	for (let n = 0; n < t; n++) e.push(l(.12 + n / (t - 1) * .84, 0, 0));
	return e;
}
function ut(t) {
	return [...new Set(t)];
}
const dt = 1e6, pt = Math.sqrt(Math.PI / 2) / 6;
function Mt(t) {
	const e = function(t) {
		const { data: e, width: n } = t, { x0: o, y0: r, w: s, h: a } = function(t, e) {
			if (t * e <= dt) return {
				x0: 0,
				y0: 0,
				w: t,
				h: e
			};
			const n = Math.sqrt(dt / (t * e)), o = Math.max(16, Math.floor(t * n)), r = Math.max(16, Math.floor(e * n));
			return {
				x0: t - o >> 1,
				y0: e - r >> 1,
				w: o,
				h: r
			};
		}(t.width, t.height), i = new Float32Array(s * a), l = /* @__PURE__ */ new Set();
		let c = 0, f = 0;
		for (let A = 0; A < a; A++) {
			const t = (r + A) * n + o, h = A * s;
			for (let o = 0; o < s; o++) {
				const r = 4 * (t + o), u = e[r], d = e[r + 1], p = e[r + 2];
				if (i[h + o] = .299 * u + .587 * d + .114 * p, l.size < 4096 && l.add(u << 16 | d << 8 | p), o + 1 < s && A + 1 < a) {
					f++;
					const t = r + 4, o = r + 4 * n;
					u === e[t] && d === e[t + 1] && p === e[t + 2] && u === e[o] && d === e[o + 1] && p === e[o + 2] && c++;
				}
			}
		}
		const h = function(t, e, n) {
			if (e < 3 || n < 3) return 0;
			let o = 0;
			for (let r = 1; r < n - 1; r++) {
				const n = (r - 1) * e, s = r * e, a = (r + 1) * e;
				for (let r = 1; r < e - 1; r++) {
					const e = t[n + r - 1] - 2 * t[n + r] + t[n + r + 1] - 2 * t[s + r - 1] + 4 * t[s + r] - 2 * t[s + r + 1] + t[a + r - 1] - 2 * t[a + r] + t[a + r + 1];
					o += Math.abs(e);
				}
			}
			return pt * o / ((e - 2) * (n - 2));
		}(i, s, a), { sharpness: u, lumaVar: d } = function(t, e, n) {
			let o = 0, r = 0, s = 0;
			for (let h = 1; h < n - 1; h++) {
				const n = (h - 1) * e, a = h * e, i = (h + 1) * e;
				for (let l = 1; l < e - 1; l++) {
					const e = t[n + l] + t[i + l] + t[a + l - 1] + t[a + l + 1] - 4 * t[a + l];
					o += e, r += e * e, s++;
				}
			}
			const a = s > 0 ? Math.max(0, r / s - (o / s) ** 2) : 0;
			let i = 0, l = 0, c = 0;
			for (let h = 0; h < e * n; h++) i += t[h], l += t[h] * t[h], c++;
			const f = c > 0 ? Math.max(1, l / c - (i / c) ** 2) : 1;
			return {
				sharpness: a / f,
				lumaVar: f
			};
		}(i, s, a), { blockiness: p } = function(t, e, n) {
			const o = /* @__PURE__ */ new Float64Array(8), r = /* @__PURE__ */ new Float64Array(8);
			for (let i = 0; i < n; i++) {
				const n = i * e;
				for (let s = 1; s < e; s++) {
					const e = 7 & s;
					o[e] += Math.abs(t[n + s] - t[n + s - 1]), r[e]++;
				}
			}
			const s = /* @__PURE__ */ new Float64Array(8), a = /* @__PURE__ */ new Float64Array(8);
			for (let i = 1; i < n; i++) {
				const n = i * e, o = (i - 1) * e;
				for (let r = 0; r < e; r++) {
					const e = 7 & i;
					s[e] += Math.abs(t[n + r] - t[o + r]), a[e]++;
				}
			}
			return { blockiness: (wt(o, r) + wt(s, a)) / 2 };
		}(i, s, a), { edgeDensity: M, aaRimFraction: g, blurEdgeWidth: w, ringing: y } = function(t, e, n, o) {
			let r = 0, s = 0, a = 0, i = 0, l = 0, c = 0;
			const f = Math.max(4, .15 * Math.sqrt(o));
			for (let u = 0; u < n; u++) {
				const n = u * e;
				for (let o = 1; o < e - 1; o++) {
					if (Math.abs(t[n + o + 1] - t[n + o - 1]) / 2 <= 16) continue;
					r++;
					const h = Math.sign(t[n + o + 1] - t[n + o - 1]);
					let u = o;
					for (; u > 0 && Math.sign(t[n + u] - t[n + u - 1]) === h;) u--;
					let d = o;
					for (; d < e - 1 && Math.sign(t[n + d + 1] - t[n + d]) === h;) d++;
					const p = d - u;
					if (s++, a += p, p <= 2 && i++, d + 2 < e) {
						const e = t[n + d], o = t[n + d + 2];
						c++, 0 !== h && h * (o - e) < -f && l++;
					}
				}
			}
			const h = e * n;
			return {
				edgeDensity: h > 0 ? r / h : 0,
				aaRimFraction: h > 0 ? i / h : 0,
				blurEdgeWidth: s > 0 ? a / s : 0,
				ringing: c > 0 ? l / c : 0
			};
		}(i, s, a, d), m = yt(i, s, a), b = function(t, e, n) {
			const o = e >> 1, r = n >> 1, s = new Float32Array(Math.max(1, o * r));
			for (let a = 0; a < r; a++) {
				const n = 2 * a * e, r = n + e, i = a * o;
				for (let e = 0; e < o; e++) {
					const o = 2 * e;
					s[i + e] = (t[n + o] + t[n + o + 1] + t[r + o] + t[r + o + 1]) / 4;
				}
			}
			return {
				plane: s,
				w: o,
				h: r
			};
		}(i, s, a);
		return {
			noiseSigma: h,
			blurEdgeWidth: w,
			sharpness: u,
			blockiness: p,
			ringing: y,
			aaRimFraction: g,
			dither: m,
			ditherCoarse: yt(b.plane, b.w, b.h),
			upscaleFactor: mt(i, s, a),
			edgeDensity: M,
			flatFraction: f > 0 ? c / f : 0,
			distinctColors: l.size,
			analyzedSize: Math.max(s, a)
		};
	}(t), { class: n, confidence: o } = function(t) {
		if (t.distinctColors <= 64 && t.noiseSigma < bt && t.blockiness < At && (t.upscaleFactor > 1 || t.analyzedSize <= 128)) return {
			class: "pixel-art",
			confidence: .7
		};
		const e = t.noiseSigma / bt, n = t.blockiness / At, o = t.blurEdgeWidth / Ft, r = t.dither / xt, s = t.dither >= zt && t.dither >= vt * t.ditherCoarse, a = Math.max(r, s ? t.dither / zt : 0);
		return a >= 1 && t.distinctColors <= 512 ? {
			class: "screenshot",
			confidence: kt(a, [n, o])
		} : e >= 1 && t.distinctColors > 512 && t.blockiness < At ? t.flatFraction > .12 && t.blurEdgeWidth > .7 * Ft ? {
			class: "scan",
			confidence: kt(e, [n, o])
		} : {
			class: "noisy-photo",
			confidence: kt(e, [n, r])
		} : t.distinctColors > 256 && n >= 1 ? {
			class: "compressed",
			confidence: kt(n, [e, o])
		} : o >= 1 && t.sharpness < .5 ? {
			class: "blurred",
			confidence: kt(o, [e, n])
		} : {
			class: "clean-vector",
			confidence: kt(1, [
				e,
				n,
				o,
				r
			])
		};
	}(e);
	return {
		estimates: e,
		class: n,
		confidence: o,
		overrides: gt(n, o)
	};
}
function gt(t, e) {
	return e >= .6 ? function(t) {
		switch (t) {
			case "compressed": return {
				denoise: "bilateral",
				autoPaletteSize: !0
			};
			case "screenshot": return {
				dissolveBands: 1,
				minRegionArea: 8,
				autoPaletteSize: !0
			};
			case "noisy-photo":
			case "blurred":
			case "scan":
			case "clean-vector":
			case "pixel-art": return {};
		}
	}(t) : {};
}
function wt(t, e) {
	let n = 0, o = 0;
	for (let s = 0; s < 8; s++) {
		const r = e[s] > 0 ? t[s] / e[s] : 0;
		r > n && (n = r), o += r;
	}
	const r = o / 8;
	return (n - r) / (r + .5);
}
function yt(t, e, n) {
	if (e < 3 || n < 3) return 0;
	let o = 0, r = 0;
	for (let s = 0; s < n - 1; s++) {
		const a = s * e, i = (s + 1) * e;
		for (let l = 0; l < e - 1; l++) {
			const c = Math.abs(t[a + l] - t[a + l + 1] - t[i + l] + t[i + l + 1]), f = (t[a + l] + t[a + l + 1] + t[i + l] + t[i + l + 1]) / 4, h = l + 2 < e ? Math.abs(t[a + l + 2] - f) : 0, u = s + 2 < n ? Math.abs(t[(s + 2) * e + l] - f) : 0;
			h < 24 && u < 24 && (o += c, r++);
		}
	}
	return d((r > 0 ? o / r : 0) / 24, 0, 1);
}
function mt(t, e, n) {
	for (let o = 6; o >= 2; o--) {
		const r = new Float64Array(o);
		let s = 0;
		for (let i = 0; i < n; i++) {
			const n = i * e;
			for (let a = 1; a < e; a++) {
				const e = Math.abs(t[n + a] - t[n + a - 1]);
				e < 6 || (r[a % o] += e, s += e);
			}
		}
		if (s < 192) continue;
		let a = 0;
		for (let t = 0; t < o; t++) r[t] > a && (a = r[t]);
		if (a / s > .85) return o;
	}
	return 1;
}
const bt = 3.2, At = .18, Ft = 3.2, xt = .7, zt = .3, vt = 1.2;
function kt(t, e) {
	return d(.5 + .5 * (t - (e.length > 0 ? Math.max(...e) : 0)), .3, .98);
}
(function(t) {
	const e = (e, n) => t.postMessage(e, n);
	t.addEventListener("message", (t) => {
		const n = t.data;
		try {
			const t = {
				width: n.width,
				height: n.height,
				data: new Uint8ClampedArray(n.buffer)
			};
			"suggestPalettes" === n.type ? e({
				type: "palettes",
				id: n.id,
				suggestions: lt(t, n.analysis)
			}) : "inputProfile" === n.type && e({
				type: "profile",
				id: n.id,
				profile: Mt(t)
			});
		} catch (o) {
			e({
				type: "error",
				id: n.id,
				message: o instanceof Error ? o.message : String(o)
			});
		}
	});
})(self);
