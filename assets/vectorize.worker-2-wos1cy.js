function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function n(t) {
	return t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
}
function e(n, e, r) {
	const o = t(n), s = t(e), i = t(r), a = Math.cbrt(.4122214708 * o + .5363325363 * s + .0514459929 * i), l = Math.cbrt(.2119034982 * o + .6806995451 * s + .1073969566 * i), c = Math.cbrt(.0883024619 * o + .2817188376 * s + .6299787005 * i);
	return [
		.2104542553 * a + .793617785 * l - .0040720468 * c,
		1.9779984951 * a - 2.428592205 * l + .4505937099 * c,
		.0259040371 * a + .7827717662 * l - .808675766 * c
	];
}
function r(t, e, r) {
	const s = t + .3963377774 * e + .2158037573 * r, i = t - .1055613458 * e - .0638541728 * r, a = t - .0894841775 * e - 1.291485548 * r, l = s * s * s, c = i * i * i, h = a * a * a, f = -1.2684380046 * l + 2.6097574011 * c - .3413193965 * h, u = -.0041960863 * l - .7034186147 * c + 1.707614701 * h;
	return [
		o(n(4.0767416621 * l - 3.3077115913 * c + .2309699292 * h)),
		o(n(f)),
		o(n(u))
	];
}
function o(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function s(t, n, e, r, o, s) {
	const i = t - r, a = n - o, l = e - s;
	return i * i + a * a + l * l;
}
function i(t, n, e, r, o, i) {
	return Math.sqrt(s(t, n, e, r, o, i));
}
function a(t) {
	const n = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim());
	if (!n) return null;
	let e = n[1];
	return 3 === e.length && (e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]), [
		Number.parseInt(e.slice(0, 2), 16),
		Number.parseInt(e.slice(2, 4), 16),
		Number.parseInt(e.slice(4, 6), 16)
	];
}
function l(t) {
	return Math.max(0, Math.min(255, Math.round(t))).toString(16).padStart(2, "0");
}
function c(t, n, e) {
	return `#${l(t)}${l(n)}${l(e)}`;
}
function h(t, n, e) {
	const [o, s, i] = r(t, n, e);
	return c(255 * o, 255 * s, 255 * i);
}
function f(t) {
	return t > 216 / 24389 ? Math.cbrt(t) : 841 / 108 * t + 4 / 29;
}
function u(n, e, r) {
	const o = t(n), s = t(e), i = t(r), a = .2126729 * o + .7151522 * s + .072175 * i, l = (.0193339 * o + .119192 * s + .9503041 * i) / 1.08883, c = f((.4124564 * o + .3575761 * s + .1804375 * i) / .95047), h = f(a);
	return [
		116 * h - 16,
		500 * (c - h),
		200 * (h - f(l))
	];
}
const y = Math.PI / 180;
function d(t, n, e, r, o, s) {
	const i = ((Math.hypot(n, e) + Math.hypot(o, s)) / 2) ** 7, a = .5 * (1 - Math.sqrt(i / (i + 25 ** 7))), l = n * (1 + a), c = o * (1 + a), h = Math.hypot(l, e), f = Math.hypot(c, s), u = (t, n) => {
		if (0 === t && 0 === n) return 0;
		const e = Math.atan2(n, t) / y;
		return e < 0 ? e + 360 : e;
	}, d = u(l, e), p = u(c, s), g = r - t, m = f - h;
	let x = 0;
	h * f !== 0 && (x = p - d, x > 180 ? x -= 360 : x < -180 && (x += 360));
	const M = 2 * Math.sqrt(h * f) * Math.sin(x / 2 * y), w = (t + r) / 2, b = (h + f) / 2;
	let A = d + p;
	h * f !== 0 && (Math.abs(d - p) > 180 && (A += d + p < 360 ? 360 : -360), A /= 2);
	const k = 1 - .17 * Math.cos((A - 30) * y) + .24 * Math.cos(2 * A * y) + .32 * Math.cos((3 * A + 6) * y) - .2 * Math.cos((4 * A - 63) * y), v = 30 * Math.exp(-(((A - 275) / 25) ** 2)), F = b ** 7, I = 2 * Math.sqrt(F / (F + 25 ** 7)), N = 1 + .015 * (w - 50) ** 2 / Math.sqrt(20 + (w - 50) ** 2), S = 1 + .045 * b, P = 1 + .015 * b * k, C = -Math.sin(2 * v * y) * I, U = g / N, L = m / S, $ = M / P;
	return Math.sqrt(U * U + L * L + $ * $ + C * L * $);
}
var p = class extends Error {
	constructor() {
		super("vectorization cancelled"), this.name = "CancelledError";
	}
};
function g(t) {
	const n = t.length;
	if (n < 6) return 0;
	let e = 0, r = t[n - 2], o = t[n - 1];
	for (let s = 0; s < n; s += 2) {
		const n = t[s], i = t[s + 1];
		e += r * i - n * o, r = n, o = i;
	}
	return e / 2;
}
function m(t) {
	let n = 0;
	for (let e = 2; e < t.length; e += 2) {
		const r = t[e] - t[e - 2], o = t[e + 1] - t[e - 1];
		n += Math.hypot(r, o);
	}
	return n;
}
function x(t, n, e, r, o, s) {
	const i = o - e, a = s - r, l = i * i + a * a;
	if (0 === l) return Math.hypot(t - e, n - r);
	let c = ((t - e) * i + (n - r) * a) / l;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (e + c * i), n - (r + c * a));
}
function M(t, n, e, r, o, s) {
	const i = t - e, a = n - r, l = o - e, c = s - r, h = Math.hypot(i, a), f = Math.hypot(l, c);
	if (0 === h || 0 === f) return 180;
	let u = (i * l + a * c) / (h * f);
	return u = u < -1 ? -1 : u > 1 ? 1 : u, 180 * Math.acos(u) / Math.PI;
}
function w(t, n) {
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
function b(t, n, e, r) {
	return t.map((t) => {
		switch (t.type) {
			case "M":
			case "L": return {
				type: t.type,
				x: t.x * n + e,
				y: t.y * n + r
			};
			case "Q": return {
				type: "Q",
				x1: t.x1 * n + e,
				y1: t.y1 * n + r,
				x: t.x * n + e,
				y: t.y * n + r
			};
			case "C": return {
				type: "C",
				x1: t.x1 * n + e,
				y1: t.y1 * n + r,
				x2: t.x2 * n + e,
				y2: t.y2 * n + r,
				x: t.x * n + e,
				y: t.y * n + r
			};
			case "A": return {
				...t,
				rx: t.rx * n,
				ry: t.ry * n,
				x: t.x * n + e,
				y: t.y * n + r
			};
			case "Z": return t;
		}
	});
}
function A(t, n, e, r) {
	const o = t * e + n * r, s = Math.hypot(t, n) * Math.hypot(e, r);
	let i = Math.acos(Math.min(1, Math.max(-1, 0 === s ? 1 : o / s)));
	return t * r - n * e < 0 && (i = -i), i;
}
function k(t, n, e) {
	let r = Math.abs(e.rx), o = Math.abs(e.ry);
	if (0 === r || 0 === o) return null;
	const s = e.rotation * Math.PI / 180, i = Math.cos(s), a = Math.sin(s), l = (t - e.x) / 2, c = (n - e.y) / 2, h = i * l + a * c, f = -a * l + i * c, u = h * h / (r * r) + f * f / (o * o);
	if (u > 1) {
		const t = Math.sqrt(u);
		r *= t, o *= t;
	}
	const y = r * r * o * o - r * r * f * f - o * o * h * h, d = r * r * f * f + o * o * h * h;
	let p = d <= 0 ? 0 : Math.sqrt(Math.max(0, y) / d);
	e.largeArc === e.sweep && (p = -p);
	const g = p * (r * f) / o, m = o * h * -p / r, x = i * g - a * m + (t + e.x) / 2, M = a * g + i * m + (n + e.y) / 2, w = A(1, 0, (h - g) / r, (f - m) / o);
	let b = A((h - g) / r, (f - m) / o, (-h - g) / r, (-f - m) / o) % (2 * Math.PI);
	return !e.sweep && b > 0 && (b -= 2 * Math.PI), e.sweep && b < 0 && (b += 2 * Math.PI), {
		cx: x,
		cy: M,
		rx: r,
		ry: o,
		phi: s,
		theta1: w,
		dTheta: b
	};
}
function v(t, n) {
	return {
		width: t,
		height: n,
		data: new Uint8Array(t * n)
	};
}
function F(t) {
	return {
		width: t.width,
		height: t.height,
		data: new Uint8ClampedArray(t.data)
	};
}
function I(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function N(t, n, e) {
	return I(Math.round(t), n, e);
}
function S(t, n) {
	return t > 0 ? (void 0 !== n && n > 0 ? n : t / 96 * 25.4) / t : 0;
}
function P() {
	return "undefined" != typeof performance ? performance.now() : Date.now();
}
const C = Object.freeze({
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
}), U = .5 / 255, L = [
	4,
	-1,
	-1,
	-1,
	-1
];
function $(t, n, e) {
	if (n < 3 || e < 3 || t.length < n * e) return 1 / 255;
	const r = new Float32Array((n - 2) * (e - 2));
	let o = 0;
	for (let a = 1; a < e - 1; a++) for (let e = 1; e < n - 1; e++) {
		const s = a * n + e;
		r[o++] = Math.abs(4 * t[s] - t[s - 1] - t[s + 1] - t[s - n] - t[s + n]);
	}
	const s = function(t, n) {
		let e = 0, r = t.length - 1;
		for (; e < r;) {
			const o = t[e], s = t[e + r >>> 1], i = t[r], a = o < s ? s < i ? s : o < i ? i : o : o < i ? o : s < i ? i : s;
			let l = e, c = r;
			for (; l <= c;) {
				for (; t[l] < a;) l++;
				for (; t[c] > a;) c--;
				if (l <= c) {
					const n = t[l];
					t[l] = t[c], t[c] = n, l++, c--;
				}
			}
			if (n <= c) r = c;
			else {
				if (!(n >= l)) return t[n];
				e = l;
			}
		}
		return t[n];
	}(r, Math.floor(.1 * r.length));
	let i = 0;
	for (const a of L) i += a * a;
	return Math.max(s / .12566 / Math.sqrt(i), U);
}
function q(t, n) {
	return t < 0 ? 0 : t > n ? n : t;
}
function R(t, n) {
	const e = t / n, r = Math.ceil(e) + 1, o = new Int32Array(n), s = new Int32Array(n), i = new Float64Array(n * r);
	for (let a = 0; a < n; a++) {
		const n = a * e, l = (a + 1) * e, c = Math.floor(n), h = Math.min(t, Math.ceil(l));
		o[a] = c;
		let f = 0, u = 0;
		for (let t = c; t < h; t++) {
			const e = Math.min(t + 1, l) - Math.max(t, n), o = e > 0 ? e : 0;
			i[a * r + f] = o, u += o, f++;
		}
		if (s[a] = f, u > 0) {
			const t = 1 / u;
			for (let n = 0; n < f; n++) i[a * r + n] *= t;
		}
	}
	return {
		start: o,
		count: s,
		weight: i,
		stride: r
	};
}
function z(t, n) {
	const { width: e, height: r, data: o } = t;
	if (n <= 0 || Math.max(e, r) <= n) return t;
	const s = n / Math.max(e, r), i = Math.max(1, Math.round(e * s)), a = Math.max(1, Math.round(r * s)), l = R(e, i), c = l.start, h = l.count, f = l.weight, u = l.stride, y = new Float32Array(i * r * 4);
	for (let w = 0; w < r; w++) {
		const t = w * e * 4, n = w * i * 4;
		for (let e = 0; e < i; e++) {
			const r = e * u, s = h[e], i = t + 4 * c[e];
			let a = 0, l = 0, d = 0, p = 0;
			for (let t = 0; t < s; t++) {
				const n = f[r + t], e = i + 4 * t;
				a += o[e] * n, l += o[e + 1] * n, d += o[e + 2] * n, p += o[e + 3] * n;
			}
			const g = n + 4 * e;
			y[g] = a, y[g + 1] = l, y[g + 2] = d, y[g + 3] = p;
		}
	}
	const d = R(r, a), p = d.start, g = d.count, m = d.weight, x = d.stride, M = new Uint8ClampedArray(i * a * 4);
	for (let w = 0; w < a; w++) {
		const t = w * x, n = g[w], e = w * i * 4;
		for (let r = 0; r < i; r++) {
			const o = 4 * r;
			let s = 0, a = 0, l = 0, c = 0;
			for (let e = 0; e < n; e++) {
				const n = m[t + e], r = (p[w] + e) * i * 4 + o;
				s += y[r] * n, a += y[r + 1] * n, l += y[r + 2] * n, c += y[r + 3] * n;
			}
			const h = e + o;
			M[h] = Math.round(s), M[h + 1] = Math.round(a), M[h + 2] = Math.round(l), M[h + 3] = Math.round(c);
		}
	}
	return {
		width: i,
		height: a,
		data: M
	};
}
function T(t) {
	const n = t * t, e = n * t;
	return [
		(2 * n - e - t) / 2,
		(3 * e - 5 * n + 2) / 2,
		(-3 * e + 4 * n + t) / 2,
		(e - n) / 2
	];
}
function E(t, n) {
	for (let e = 1; e < n; e++) {
		const n = t[e];
		let r = e - 1;
		for (; r >= 0 && t[r] > n;) t[r + 1] = t[r], r--;
		t[r + 1] = n;
	}
}
function j(t, n, e, r) {
	const { width: o, height: s, data: i } = t, a = new Uint8ClampedArray(i.length);
	for (let l = 0; l < i.length; l += 4) {
		const t = i[l + 3];
		if (255 === t) a[l] = i[l], a[l + 1] = i[l + 1], a[l + 2] = i[l + 2];
		else {
			const o = 255 - t;
			a[l] = Math.round((i[l] * t + n * o) / 255), a[l + 1] = Math.round((i[l + 1] * t + e * o) / 255), a[l + 2] = Math.round((i[l + 2] * t + r * o) / 255);
		}
		a[l + 3] = 255;
	}
	return {
		width: o,
		height: s,
		data: a
	};
}
function B(t, n, e = 1) {
	const { width: r, height: o, data: s } = t, i = r * o;
	let l;
	if ("custom" === n.background) l = "custom";
	else if ("transparent" === n.background) l = "transparent";
	else {
		l = "opaque";
		for (let t = 3; t < s.length; t += 4) if (s[t] < 250) {
			l = "transparent";
			break;
		}
	}
	if ("custom" === l) {
		const e = a(n.backgroundColor) ?? [
			255,
			255,
			255
		];
		return {
			image: j(t, e[0], e[1], e[2]),
			opaque: null,
			alpha: null
		};
	}
	const c = j(t, 255, 255, 255);
	if ("opaque" === l) return {
		image: c,
		opaque: null,
		alpha: null
	};
	const h = v(r, o), f = new Uint8Array(i), u = n.alphaThreshold;
	for (let a = 0, g = 3; a < i; a++, g += 4) f[a] = s[g];
	const y = function(t, n, e, r) {
		const o = new Uint8Array(t.length), s = (t, n) => n >= 8 && n < 250 && Math.abs(t - n) <= O, i = (t, n, e) => n >= t + O && e <= t - O || e >= t + O && n <= t - O, a = r * n;
		for (let l = 0; l < e; l++) {
			const c = l * n;
			for (let h = 0; h < n; h++) {
				const f = c + h, u = t[f];
				if (u < 8 || u >= 250) continue;
				const y = h >= r, d = h < n - r, p = l >= r, g = l < e - r, m = y && s(u, t[f - r]) || d && s(u, t[f + r]), x = p && s(u, t[f - a]) || g && s(u, t[f + a]), M = y && d && i(u, t[f - r], t[f + r]), w = p && g && i(u, t[f - a], t[f + a]);
				(m && !w || x && !M) && (o[f] = 1);
			}
		}
		return o;
	}(f, r, o, Math.max(1, Math.round(e)));
	let d = 0;
	for (let a = 0; a < i; a++) d += y[a];
	const p = d >= i * K;
	for (let a = 0; a < i; a++) h.data[a] = f[a] >= u || p && 1 === y[a] ? 1 : 0;
	return {
		image: c,
		opaque: h,
		alpha: f
	};
}
const O = 24, K = .05, D = (() => {
	const n = /* @__PURE__ */ new Float64Array(256);
	for (let e = 0; e < 256; e++) n[e] = t(e / 255);
	return n;
})();
function H(t) {
	const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(3 * o);
	for (let i = 0, a = 0, l = 0; i < o; i++, a += 4, l += 3) {
		const t = D[r[a]], n = D[r[a + 1]], e = D[r[a + 2]], o = Math.cbrt(.4122214708 * t + .5363325363 * n + .0514459929 * e), i = Math.cbrt(.2119034982 * t + .6806995451 * n + .1073969566 * e), c = Math.cbrt(.0883024619 * t + .2817188376 * n + .6299787005 * e);
		s[l] = .2104542553 * o + .793617785 * i - .0040720468 * c, s[l + 1] = 1.9779984951 * o - 2.428592205 * i + .4505937099 * c, s[l + 2] = .0259040371 * o + .7827717662 * i - .808675766 * c;
	}
	return s;
}
const X = .88, W = 1e-5, G = 32, Z = .15, Q = 32768;
function Y(t, n) {
	const e = t[n];
	if (e < 3) return null;
	const r = 1 / e, o = t[n + 1] * r, s = t[n + 2] * r, i = t[n + 3] * r - o * o, a = t[n + 4] * r - o * s, l = t[n + 5] * r - s * s, c = i * l - a * a;
	if (c <= 1e-9) return null;
	const h = l / c, f = -a / c, u = i / c;
	let y = 0, d = 0, p = 0;
	for (let v = 0; v < 3; v++) {
		const e = t[n + 6 + v] * r, i = t[n + 12 + 2 * v] * r - o * e, a = t[n + 13 + 2 * v] * r - s * e, l = h * i + f * a, c = f * i + u * a;
		y += l * l, d += l * c, p += c * c;
	}
	const g = y + p;
	if (g <= 1e-12) return null;
	const m = y * p - d * d, x = Math.sqrt(Math.max(0, g * g / 4 - m)), M = g / 2 + x, w = M / (M + (g / 2 - x));
	let b, A;
	Math.abs(d) > 1e-12 ? (b = M - p, A = d) : y >= p ? (b = 1, A = 0) : (b = 0, A = 1);
	const k = Math.hypot(b, A);
	return k < 1e-12 ? null : (b /= k, A /= k, {
		dx: b,
		dy: A,
		directionality: w
	});
}
function _(t) {
	if (t.length < 3) return 0;
	const n = t[0], e = t[t.length - 1];
	let r = e[0] - n[0], o = e[1] - n[1], s = e[2] - n[2];
	const i = Math.hypot(r, o, s);
	if (i < 1e-6) return 1;
	r /= i, o /= i, s /= i;
	let a = 0, l = 0;
	for (let h = 1; h < t.length; h++) {
		const n = (t[h][0] - t[h - 1][0]) * r + (t[h][1] - t[h - 1][1]) * o + (t[h][2] - t[h - 1][2]) * s;
		n >= 0 ? a += n : l -= n;
	}
	const c = a + l;
	return c > 1e-9 ? l / c : 0;
}
function V(t, n, e) {
	const r = n.slice(), o = e.map((t) => t.slice());
	for (let s = 0; s < t; s++) {
		let n = s, e = Math.abs(r[s * t + s]);
		for (let o = s + 1; o < t; o++) {
			const i = Math.abs(r[o * t + s]);
			i > e && (e = i, n = o);
		}
		if (e < 1e-12) return null;
		if (n !== s) {
			for (let e = 0; e < t; e++) {
				const o = r[s * t + e];
				r[s * t + e] = r[n * t + e], r[n * t + e] = o;
			}
			for (const t of o) {
				const e = t[s];
				t[s] = t[n], t[n] = e;
			}
		}
		const i = r[s * t + s];
		for (let o = 0; o < t; o++) r[s * t + o] /= i;
		for (const t of o) t[s] /= i;
		for (let a = 0; a < t; a++) {
			if (a === s) continue;
			const n = r[a * t + s];
			if (0 !== n) {
				for (let e = 0; e < t; e++) r[a * t + e] -= n * r[s * t + e];
				for (const t of o) t[a] -= n * t[s];
			}
		}
	}
	return o;
}
function J(t, n) {
	const e = t[n];
	if (e < 6) return null;
	const r = 1 / e, o = t[n + 1], s = t[n + 2], i = t[n + 3], a = t[n + 4], l = t[n + 5], c = i + l, h = t[n + 22] + 2 * t[n + 23] + t[n + 24], f = t[n + 18] + t[n + 20], u = t[n + 19] + t[n + 21], y = [
		h,
		f,
		u,
		c,
		f,
		i,
		a,
		o,
		u,
		a,
		l,
		s,
		c,
		o,
		s,
		e
	], d = [
		[
			t[n + 25],
			t[n + 12],
			t[n + 13],
			t[n + 6]
		],
		[
			t[n + 26],
			t[n + 14],
			t[n + 15],
			t[n + 7]
		],
		[
			t[n + 27],
			t[n + 16],
			t[n + 17],
			t[n + 8]
		]
	], p = V(4, y, d);
	if (!p) return null;
	let g = 0, m = 0, x = 0, M = 0, w = 0;
	for (let N = 0; N < 3; N++) {
		const [e, o, s, i] = p[N];
		g += e * e, m += e * o, x += e * s;
		const a = d[N], l = t[n + 6 + N], c = t[n + 9 + N];
		M += Math.max(0, c - (e * a[0] + o * a[1] + s * a[2] + i * a[3])), w += c - l * l * r;
	}
	if (g < 1e-12) return null;
	if (w < 1e-9) return null;
	const b = -m / (2 * g), A = -x / (2 * g), k = o * r, v = s * r, F = Math.sqrt(Math.max(i * r - k * k, 1e-9)), I = Math.sqrt(Math.max(l * r - v * v, 1e-9));
	return Math.abs(b - k) > 1.4 * F + 1 || Math.abs(A - v) > 1.4 * I + 1 ? null : {
		cx: b,
		cy: A,
		misfit: M / w
	};
}
function tt(t) {
	return null !== t && t.misfit <= .15;
}
function nt(t, n, e) {
	e.fill(0);
	for (const r of n) {
		const n = 28 * r;
		for (let r = 0; r < 28; r++) e[r] += t[n + r];
	}
}
function et(t, n) {
	let e = 0, r = 0;
	for (const o of n) {
		const n = 28 * o, s = t[n];
		if (!(s <= 0)) {
			r += s;
			for (let r = 0; r < 3; r++) e += Math.max(0, t[n + 9 + r] - t[n + 6 + r] * t[n + 6 + r] / s);
		}
	}
	return r > 0 ? e / r : 0;
}
function rt(t, n, e) {
	for (let r = 1; r < n.length; r++) if (n[r] >= e) {
		const o = n[r] - n[r - 1], s = o > 1e-9 ? (e - n[r - 1]) / o : 0;
		return t[r - 1] + (t[r] - t[r - 1]) * s;
	}
	return t[t.length - 1];
}
function ot(t, n, e) {
	let r = 0, o = 0;
	const s = [0];
	for (const a of n) r += a, a > o && (o = a), s.push(r);
	if (r <= 0 || o > .5 * r) return -1;
	if (o > .04 && o > 4 * r / n.length) return -1;
	const i = t[t.length - 1] - t[0];
	return i < 1e-9 || (rt(t, s, .9 * r) - rt(t, s, .1 * r)) / i < e ? -1 : r;
}
function st(t, n, e) {
	const r = [0, t.length - 1];
	for (; r.length < 8;) {
		let o = n, s = -1, i = -1;
		for (let n = 0; n < r.length - 1; n++) {
			const a = r[n], l = r[n + 1], c = t[l] - t[a];
			for (let r = a + 1; r < l; r++) {
				const h = e(r, a, l, c > 1e-9 ? (t[r] - t[a]) / c : 0);
				h > o && (o = h, s = r, i = n + 1);
			}
		}
		if (s < 0) break;
		r.splice(i, 0, s);
	}
	return r;
}
function it(t) {
	const n = t.length, e = [], r = [];
	for (let s = 0; s < n; s++) {
		let n = t[s], o = 1;
		for (; e.length > 0 && e[e.length - 1] > n;) {
			const t = e.pop(), s = r.pop();
			n = (n * o + t * s) / (o + s), o += s;
		}
		e.push(n), r.push(o);
	}
	let o = 0;
	for (let s = 0; s < e.length; s++) for (let n = 0; n < r[s]; n++) t[o++] = e[s];
}
function at(t) {
	const n = Math.round(1e3 * Math.min(1, Math.max(0, t))) / 1e3;
	return n >= 1 ? void 0 : n;
}
function lt(t, n, e, r) {
	const o = t[e] - t[n];
	return Math.abs(o) > 1e-9 ? (r - t[n]) / o : 0;
}
function ct(t, n, e) {
	let r = -1, o = -1;
	for (let c = 0; c < G; c++) {
		const s = t[c * n];
		s <= 0 || s < e || (r < 0 && (r = c), o = c);
	}
	if (r < 0) return null;
	const s = t.slice(), i = (t, e) => {
		for (let r = 0; r < n; r++) s[e * n + r] += s[t * n + r];
		s[t * n] = 0;
	};
	let a = r;
	for (; a > 0 && s[(a - 1) * n] > 0;) a--;
	let l = o;
	for (; l + 1 < G && s[(l + 1) * n] > 0;) l++;
	for (let c = 0; c < a; c++) s[c * n] = 0;
	for (let c = l + 1; c < G; c++) s[c * n] = 0;
	for (let c = a; c < r; c++) i(c, r);
	for (let c = o + 1; c <= l; c++) i(c, o);
	return {
		bins: s,
		first: r,
		last: o,
		lo: a / G,
		hi: (l + 1) / G
	};
}
function ht(t, n, e, o, s) {
	let a = 0;
	for (let r = 0; r < G; r++) t[12 * r] > a && (a = t[12 * r]);
	const l = a * Z, f = ct(t, 12, l);
	if (!f) return null;
	const { bins: u, first: y, last: d, hi: p } = f, g = s ? 0 : f.lo, m = 1 / (p - g), x = [], M = [], w = [];
	for (let r = y; r <= d; r++) {
		const t = 12 * r, n = u[t];
		if (n < l || n <= 0) continue;
		const e = 1 / n;
		x.push((u[t + 11] * e - g) * m), M.push([
			u[t + 1] * e,
			u[t + 2] * e,
			u[t + 3] * e
		]), w.push(t);
	}
	const b = x.length;
	if (b < 3) return null;
	const A = M[0], k = M[b - 1];
	if (i(A[0], A[1], A[2], k[0], k[1], k[2]) < o) return null;
	const v = [];
	for (let r = 1; r < b; r++) {
		const t = M[r - 1], n = M[r];
		v.push(i(t[0], t[1], t[2], n[0], n[1], n[2]));
	}
	if (ot(x, v, .33) < 0) return null;
	if (_(M) > e) return null;
	(function(t) {
		const n = t.length;
		if (n < 3) return;
		const e = t[0], r = t[n - 1], o = [
			r[0] - e[0],
			r[1] - e[1],
			r[2] - e[2]
		], s = Math.hypot(o[0], o[1], o[2]);
		if (s < 1e-9) return;
		o[0] /= s, o[1] /= s, o[2] /= s;
		const i = t.map((t) => (t[0] - e[0]) * o[0] + (t[1] - e[1]) * o[1] + (t[2] - e[2]) * o[2]), a = i.slice();
		it(a);
		for (let l = 0; l < n; l++) {
			const n = a[l] - i[l];
			0 !== n && (t[l] = [
				t[l][0] + n * o[0],
				t[l][1] + n * o[1],
				t[l][2] + n * o[2]
			]);
		}
	})(M);
	const F = st(x, .01, (t, n, e, r) => {
		const o = M[n][0] + (M[e][0] - M[n][0]) * r, s = M[n][1] + (M[e][1] - M[n][1]) * r, a = M[n][2] + (M[e][2] - M[n][2]) * r;
		return i(M[t][0], M[t][1], M[t][2], o, s, a);
	});
	if (_(F.map((t) => M[t])) > e) return null;
	const I = new Float64Array(4 * b), N = new Float64Array(4 * b);
	for (let i = 0; i < b; i++) {
		const [t, n, e] = r(M[i][0], M[i][1], M[i][2]);
		I[4 * i] = x[i], I[4 * i + 1] = M[i][0], I[4 * i + 2] = M[i][1], I[4 * i + 3] = M[i][2], N[4 * i] = x[i], N[4 * i + 1] = t, N[4 * i + 2] = n, N[4 * i + 3] = e;
	}
	const S = F.length;
	let P = !1;
	const C = [];
	for (let r = 0; r < S; r++) {
		const t = F[r], e = w[t], o = u[e];
		let s = u[e + 7], i = x[t], a = M[t][0], l = M[t][1], f = M[t][2];
		const y = 0 === r && i > 0 ? 0 : r === S - 1 && i < 1 ? 1 : -1;
		if (y >= 0 && b > 1) {
			const n = 0 === r ? t + 1 : t - 1, e = lt(x, t, n, y);
			a += (M[n][0] - a) * e, l += (M[n][1] - l) * e, f += (M[n][2] - f) * e;
			const c = w[n];
			s = o * (s / o + (u[c + 7] / u[c] - s / o) * e), i = y;
		}
		const d = null === n.alpha || s >= o - 1e-9 ? void 0 : at(s / o);
		if (void 0 === d) {
			C.push({
				offset: i,
				color: h(a, l, f)
			});
			continue;
		}
		P = !0;
		const p = u[e + 7], g = p > 1e-9 ? c(u[e + 8] / p, u[e + 9] / p, u[e + 10] / p) : h(a, l, f);
		C.push({
			offset: i,
			color: g,
			opacity: d
		});
	}
	return {
		stops: C,
		fineLab: I,
		fineRgb: N,
		translucent: P,
		lo: g,
		hi: p
	};
}
function ft(t, n, e, r, o, s) {
	let a = 0;
	for (let i = 0; i < G; i++) t[6 * i] > a && (a = t[6 * i]);
	const l = a * Z, c = ct(t, 6, l);
	if (!c) return null;
	const { bins: h, first: f, last: u, hi: y } = c, d = s ? 0 : c.lo, p = 1 / (y - d), g = [], m = [], x = [];
	for (let i = f; i <= u; i++) {
		const t = 6 * i, n = h[t];
		n < l || n <= 0 || (g.push((h[t + 2] / n - d) * p), m.push(h[t + 1] / n), x.push([
			h[t + 3] / n,
			h[t + 4] / n,
			h[t + 5] / n
		]));
	}
	const M = g.length;
	if (M < 3) return null;
	if (Math.abs(m[M - 1] - m[0]) < r) return null;
	const w = x[0], b = x[M - 1];
	if (i(w[0], w[1], w[2], b[0], b[1], b[2]) < o) return null;
	const A = [];
	for (let i = 1; i < M; i++) A.push(Math.abs(m[i] - m[i - 1]));
	const k = ot(g, A, 0);
	if (k < 0) return null;
	const v = m[M - 1] >= m[0] ? 1 : -1;
	let F = 0;
	for (let i = 1; i < M; i++) {
		const t = (m[i] - m[i - 1]) * v;
		t < 0 && (F -= t);
	}
	if (F / k > e) return null;
	if (v < 0) for (let i = 0; i < M; i++) m[i] = -m[i];
	if (it(m), v < 0) for (let i = 0; i < M; i++) m[i] = -m[i];
	const I = st(g, .02, (t, n, e, r) => Math.abs(m[t] - (m[n] + (m[e] - m[n]) * r))), N = I.length, S = [];
	for (let i = 0; i < N; i++) {
		const t = I[i];
		let e = g[t], r = m[t];
		const o = 0 === i && e > 0 ? 0 : i === N - 1 && e < 1 ? 1 : -1;
		if (o >= 0 && M > 1) {
			const n = 0 === i ? t + 1 : t - 1;
			r += (m[n] - r) * lt(g, t, n, o), e = o;
		}
		const s = at(r);
		S.push(void 0 === s ? {
			offset: e,
			color: n
		} : {
			offset: e,
			color: n,
			opacity: s
		});
	}
	const P = S[0], C = S[N - 1], U = (P.opacity ?? 1) <= (C.opacity ?? 1) ? P : C;
	return (U.opacity ?? 1) < .25 && (U.opacity = 0), {
		stops: S,
		lo: d,
		hi: y
	};
}
function ut(t, n, e) {
	const r = t.length / 4;
	if (n <= t[0] || 1 === r) return e[0] = t[1], e[1] = t[2], void (e[2] = t[3]);
	const o = 4 * (r - 1);
	if (n >= t[o]) return e[0] = t[o + 1], e[1] = t[o + 2], void (e[2] = t[o + 3]);
	let s = 1;
	for (; t[4 * s] < n;) s++;
	const i = 4 * (s - 1), a = 4 * s, l = t[a] - t[i], c = l > 1e-12 ? (n - t[i]) / l : 0;
	e[0] = t[i + 1] + (t[a + 1] - t[i + 1]) * c, e[1] = t[i + 2] + (t[a + 2] - t[i + 2]) * c, e[2] = t[i + 3] + (t[a + 3] - t[i + 3]) * c;
}
function yt(t, n, e) {
	const r = [];
	for (let o = 0; o < G; o++) {
		const s = 6 * o;
		if (t[s] <= 0) continue;
		const i = t[s + 2] / t[s];
		i < n || i > e || r.push((i - n) / (e - n), Math.min(1, Math.max(0, t[s + 1] / t[s])));
	}
	return Float64Array.from(r);
}
function dt(t, n) {
	const e = t.length / 2;
	if (n <= t[0] || 1 === e) return t[1];
	if (n >= t[2 * (e - 1)]) return t[2 * (e - 1) + 1];
	let r = 1;
	for (; t[2 * r] < n;) r++;
	const o = 2 * (r - 1), s = t[2 * r] - t[o], i = s > 1e-12 ? (n - t[o]) / s : 0;
	return t[o + 1] + (t[2 * r + 1] - t[o + 1]) * i;
}
function pt(t, n, e) {
	let r;
	if ("linear" === t.kind) {
		const o = t.x2 - t.x1, s = t.y2 - t.y1, i = o * o + s * s;
		r = i > 1e-12 ? ((n - t.x1) * o + (e - t.y1) * s) / i : 0;
	} else r = t.r > 1e-12 ? Math.hypot(n - t.cx, e - t.cy) / t.r : 0;
	return r < 0 ? 0 : r > 1 ? 1 : r;
}
function gt(t, n, e, r) {
	const o = 12 * xt(n), s = 3 * r, i = e.ok[s], a = e.ok[s + 1], l = e.ok[s + 2];
	if (t[o] += 1, t[o + 1] += i, t[o + 2] += a, t[o + 3] += l, t[o + 4] += i * i, t[o + 5] += a * a, t[o + 6] += l * l, t[o + 11] += n, null === e.alpha) return void (t[o + 7] += 1);
	const c = e.alpha[r] / 255, h = 4 * r, f = 255 * (1 - c);
	t[o + 7] += c, t[o + 8] += e.rgb[h] - f, t[o + 9] += e.rgb[h + 1] - f, t[o + 10] += e.rgb[h + 2] - f;
}
function mt(t, n, e, r, o) {
	const s = 6 * xt(n);
	t[s] += 1, t[s + 1] += e, t[s + 2] += n, t[s + 3] += r[o], t[s + 4] += r[o + 1], t[s + 5] += r[o + 2];
}
function xt(t) {
	const n = Math.floor(t * G);
	return n < 0 ? 0 : n >= G ? 31 : n;
}
function Mt(n, e, r, o) {
	const s = t(n), i = t(e), a = t(r), l = Math.cbrt(.4122214708 * s + .5363325363 * i + .0514459929 * a), c = Math.cbrt(.2119034982 * s + .6806995451 * i + .1073969566 * a), h = Math.cbrt(.0883024619 * s + .2817188376 * i + .6299787005 * a);
	o[0] = .2104542553 * l + .793617785 * c - .0040720468 * h, o[1] = 1.9779984951 * l - 2.428592205 * c + .4505937099 * h, o[2] = .0259040371 * l + .7827717662 * c - .808675766 * h;
}
function wt(t, n, e) {
	const r = t[n] - e[0], o = t[n + 1] - e[1], s = t[n + 2] - e[2];
	return r * r + o * o + s * s;
}
function bt(t, n) {
	let e = Math.max(1, Math.ceil(t / Q));
	for (; e > 1 && 1 !== At(e, n);) e++;
	return e;
}
function At(t, n) {
	return 0 === n ? t : At(n, t % n);
}
function kt(t) {
	return {
		abs: 0,
		sse: 0,
		flatSse: 0,
		perMember: new Float64Array(t),
		perMemberFlat: new Float64Array(t),
		binN: new Float64Array(G),
		binOutliers: new Float64Array(G)
	};
}
function vt(t, n, e, r, o) {
	t.abs += Math.sqrt(r);
	const s = .0064, i = xt(e);
	t.binN[i]++, r > s && t.binOutliers[i]++;
	const a = r > s ? s : r, l = o > s ? s : o;
	t.sse += a, t.flatSse += l, t.perMember[n] += a, t.perMemberFlat[n] += l;
}
function Ft(t, n, e) {
	if (t.abs / n > .045) return !1;
	if (t.flatSse <= 0 || 1 - t.sse / t.flatSse < .3) return !1;
	for (let o = 0; o < e.length; o++) {
		if (e[o] <= 0) continue;
		const n = t.perMemberFlat[o] / e[o];
		if (t.perMember[o] / e[o] > n + 25e-5 + .5 * n) return !1;
	}
	let r = 0;
	for (let o = 0; o < G; o++) t.binN[o] > r && (r = t.binN[o]);
	for (let o = 0; o < G; o++) if (!(t.binN[o] < r * Z) && t.binOutliers[o] > .2 * t.binN[o]) return !1;
	return !0;
}
function It(t, n) {
	const e = new Float64Array(3 * n.length);
	return n.forEach((n, r) => {
		const o = 28 * n, s = t[o];
		if (!(s <= 0)) for (let i = 0; i < 3; i++) e[3 * r + i] = t[o + 6 + i] / s;
	}), e;
}
function Nt(t, n, e, r) {
	const o = t[n] - e[3 * r], s = t[n + 1] - e[3 * r + 1], i = t[n + 2] - e[3 * r + 2];
	return o * o + s * s + i * i;
}
function St(t, n, e) {
	const { m: r, sacc: o, offset: s, bucket: i, width: a, ok: l } = t;
	nt(r, n, o);
	const c = o[0];
	if (c < 3) return null;
	if (et(r, n) < W) return null;
	const h = Y(o, 0), f = J(o, 0), u = null !== h && h.directionality >= X, y = tt(f);
	if (!u && !y) return null;
	const d = u ? h.dx : 0, p = u ? h.dy : 0, g = y ? f.cx : 0, m = y ? f.cy : 0, x = bt(c, a);
	let M = 1 / 0, w = -1 / 0, b = 0;
	for (const X of n) for (let t = s[X], n = s[X + 1]; t < n; t += x) {
		const n = i[t], e = n % a + .5, r = (n - n % a) / a + .5;
		if (u) {
			const t = d * e + p * r;
			t < M && (M = t), t > w && (w = t);
		}
		if (y) {
			const t = Math.hypot(e - g, r - m);
			t > b && (b = t);
		}
	}
	const A = w - M, k = u && A > 1e-6, v = y && b > 1e-6;
	if (!k && !v) return null;
	const F = k ? /* @__PURE__ */ new Float64Array(384) : null, I = v ? /* @__PURE__ */ new Float64Array(384) : null;
	for (const X of n) for (let n = s[X], e = s[X + 1]; n < e; n += x) {
		const e = i[n], r = e % a + .5, o = (e - e % a) / a + .5;
		F && gt(F, (d * r + p * o - M) / A, t, e), I && gt(I, Math.hypot(r - g, o - m) / b, t, e);
	}
	const N = e ? t.minColorSpan : 0, S = F ? ht(F, t, t.maxBacktrack, N, !1) : null, P = I ? ht(I, t, 1, N, !0) : null;
	if (!S && !P) return null;
	const C = S ? S.lo : 0, U = S ? 1 / (S.hi - S.lo) : 1, L = P ? 1 / P.hi : 1, $ = t.lab, q = kt(n.length), R = kt(n.length), z = new Float64Array(n.length), T = It(r, n);
	let E = 0;
	const j = S ? /* @__PURE__ */ new Float64Array(544) : null, B = 1 / c, O = o[1] * B, K = o[2] * B, D = -p * O + d * K, H = o[3] * B - O * O, Z = o[4] * B - O * K, Q = o[5] * B - K * K, _ = Math.sqrt(Math.max(1e-9, p * p * H - 2 * d * p * Z + d * d * Q));
	for (let X = 0; X < n.length; X++) {
		const t = n[X];
		for (let n = s[t], e = s[t + 1]; n < e; n += x) {
			const t = i[n], e = t % a + .5, r = (t - t % a) / a + .5, o = 3 * t;
			z[X]++, E++;
			const s = Nt(l, o, T, X);
			if (S && j) {
				const t = Math.min(1, Math.max(0, ((d * e + p * r - M) / A - C) * U));
				ut(S.fineLab, t, $), vt(q, X, t, wt(l, o, $), s);
				const n = (-p * e + d * r - D) / _, i = 17 * xt(t), a = n * n;
				j[i] += 1, j[i + 1] += n, j[i + 2] += a, j[i + 3] += a * n, j[i + 4] += a * a;
				for (let e = 0; e < 3; e++) {
					const t = l[o + e] - $[e];
					j[i + 5 + 4 * e] += t, j[i + 6 + 4 * e] += n * t, j[i + 7 + 4 * e] += a * t, j[i + 8 + 4 * e] += t * t;
				}
			}
			if (P) {
				const t = Math.min(1, Math.hypot(e - g, r - m) / b * L);
				ut(P.fineLab, t, $), vt(R, X, t, wt(l, o, $), s);
			}
		}
	}
	let rt = null;
	const ot = null !== j && function(t) {
		let n = 0, e = 0, r = 0;
		for (let o = 0; o < G; o++) {
			const s = 17 * o, i = t[s];
			if (i < 12) continue;
			r += i;
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
			].map((n) => [
				t[s + 5 + 4 * n],
				t[s + 6 + 4 * n],
				t[s + 7 + 4 * n]
			]), c = V(3, a, l);
			for (let r = 0; r < 3; r++) {
				const o = l[r];
				if (e += t[s + 8 + 4 * r], !c) continue;
				const a = c[r][0] * o[0] + c[r][1] * o[1] + c[r][2] * o[2] - o[0] * o[0] / i;
				a > 0 && (n += a);
			}
		}
		return e <= 4e-4 * r ? 0 : e > 0 ? n / e : 0;
	}(j) <= .25;
	if (S && ot && Ft(q, E, z)) {
		const t = o[1] / c, n = o[2] / c, e = d * t + p * n, r = M + S.lo * A, s = M + S.hi * A;
		rt = {
			residual: q.abs / E,
			fineLab: S.fineLab,
			fineRgb: S.fineRgb,
			translucent: S.translucent,
			paint: {
				kind: "linear",
				x1: t + (r - e) * d,
				y1: n + (r - e) * p,
				x2: t + (s - e) * d,
				y2: n + (s - e) * p,
				stops: S.stops
			}
		};
	}
	return P && Ft(R, E, z) && (null === rt || R.abs < q.abs) && (rt = {
		residual: R.abs / E,
		fineLab: P.fineLab,
		fineRgb: P.fineRgb,
		translucent: P.translucent,
		paint: {
			kind: "radial",
			cx: g,
			cy: m,
			r: b * P.hi,
			stops: P.stops
		}
	}), rt;
}
function Pt(t, n, e, r) {
	const { m: o, sacc: s, offset: i, bucket: a, width: l, ok: h, rgb: f, lab: u, sBc: y, sPx: d, sPy: p, sAl: g } = t;
	nt(o, n, s);
	const m = s[0];
	if (m < 6) return null;
	if (et(o, n) < W) return null;
	const x = e.paint, M = bt(m, l), w = 1 / 255;
	let b = 0, A = 0, k = 0, v = 0, F = 0, I = 0, N = 0, S = 0, P = 0, C = -1;
	const U = /* @__PURE__ */ new Float64Array(3);
	let L = 0;
	for (const c of n) for (let t = i[c], n = i[c + 1]; t < n; t += M) {
		const n = a[t], r = n % l + .5, o = (n - n % l) / l + .5;
		ut(e.fineRgb, pt(x, r, o), u), d[L] = r, p[L] = o, y[3 * L] = u[0], y[3 * L + 1] = u[1], y[3 * L + 2] = u[2], L++;
		const s = 4 * n, i = f[s] * w - u[0], c = f[s + 1] * w - u[1], h = f[s + 2] * w - u[2], g = i * i + c * c + h * h;
		g > C && (C = g, U[0] = f[s] * w, U[1] = f[s + 1] * w, U[2] = f[s + 2] * w);
		const m = g * (g - i * i), M = g * -i * c, $ = g * -i * h, q = g * (g - c * c), R = g * -c * h, z = g * (g - h * h);
		b += m, A += M, k += $, v += q, F += R, I += z, N += m * u[0] + M * u[1] + $ * u[2], S += M * u[0] + q * u[1] + R * u[2], P += $ * u[0] + R * u[1] + z * u[2];
	}
	if (C <= 1e-9) return null;
	const $ = b + v + I;
	if ($ > 1e-18) {
		const t = .01 * $ / 3, n = V(3, [
			b + t,
			A,
			k,
			A,
			v + t,
			F,
			k,
			F,
			I + t
		], [[
			N + t * U[0],
			S + t * U[1],
			P + t * U[2]
		]]);
		n && (U[0] = n[0][0], U[1] = n[0][1], U[2] = n[0][2]);
	}
	const q = (t) => {
		const n = U[0] - u[0], e = U[1] - u[1], r = U[2] - u[2], o = n * n + e * e + r * r;
		return o > 1e-9 ? ((f[t] * w - u[0]) * n + (f[t + 1] * w - u[1]) * e + (f[t + 2] * w - u[2]) * r) / o : 0;
	};
	for (let c = 0; c < 2; c++) {
		let t = 0;
		const e = [
			0,
			0,
			0
		];
		let r = 0;
		for (const o of n) for (let n = i[o], s = i[o + 1]; n < s; n += M) {
			const o = a[n];
			u[0] = y[3 * r], u[1] = y[3 * r + 1], u[2] = y[3 * r + 2], r++;
			const s = 4 * o, i = Math.min(1, Math.max(0, q(s)));
			t += i * i;
			for (let t = 0; t < 3; t++) e[t] += i * (f[s + t] * w - (1 - i) * u[t]);
		}
		if (t <= 1e-9) return null;
		for (let n = 0; n < 3; n++) U[n] = e[n] / t;
	}
	for (let c = 0; c < 3; c++) U[c] = U[c] < 0 ? 0 : U[c] > 1 ? 1 : U[c];
	const R = c(255 * U[0], 255 * U[1], 255 * U[2]), z = /* @__PURE__ */ new Float64Array(28);
	for (let c = 0; c < 6; c++) z[c] = s[c];
	for (let c = 18; c < 25; c++) z[c] = s[c];
	let T = 0;
	for (const c of n) for (let t = i[c], n = i[c + 1]; t < n; t += M) {
		const n = a[t], e = d[T], r = p[T];
		u[0] = y[3 * T], u[1] = y[3 * T + 1], u[2] = y[3 * T + 2];
		const o = q(4 * n);
		g[T] = o, T++, z[6] += o, z[9] += o * o, z[12] += o * e, z[13] += o * r, z[25] += o * (e * e + r * r);
	}
	if (M > 1) {
		const t = M;
		z[6] *= t, z[9] *= t, z[12] *= t, z[13] *= t, z[25] *= t;
	}
	const E = Y(z, 0), j = J(z, 0), B = null !== E && E.directionality >= X, O = tt(j);
	if (!B && !O) return null;
	const K = B ? E.dx : 0, D = B ? E.dy : 0, H = O ? j.cx : 0, G = O ? j.cy : 0;
	let Z = 1 / 0, Q = -1 / 0, _ = 0;
	for (let c = 0; c < L; c++) {
		const t = d[c], n = p[c];
		if (B) {
			const e = K * t + D * n;
			e < Z && (Z = e), e > Q && (Q = e);
		}
		if (O) {
			const e = Math.hypot(t - H, n - G);
			e > _ && (_ = e);
		}
	}
	const rt = Q - Z, ot = B && rt > 1e-6, st = O && _ > 1e-6;
	if (!ot && !st) return null;
	const it = ot ? /* @__PURE__ */ new Float64Array(192) : null, at = st ? /* @__PURE__ */ new Float64Array(192) : null;
	let lt = 0;
	for (const c of n) for (let t = i[c], n = i[c + 1]; t < n; t += M) {
		const n = a[t], e = d[lt], r = p[lt], o = g[lt];
		lt++, it && mt(it, (K * e + D * r - Z) / rt, o, h, 3 * n), at && mt(at, Math.hypot(e - H, r - G) / _, o, h, 3 * n);
	}
	const ct = r ? .2 : 0, ht = r ? t.minColorSpan : 0, gt = it ? ft(it, R, t.maxBacktrack, ct, ht, !1) : null, xt = at ? ft(at, R, 1, ct, ht, !0) : null;
	if (!gt && !xt) return null;
	const At = gt?.stops ?? null, St = xt?.stops ?? null, Pt = it && gt ? yt(it, gt.lo, gt.hi) : null, Ct = at && xt ? yt(at, 0, xt.hi) : null, Ut = gt ? gt.lo : 0, Lt = gt ? 1 / (gt.hi - gt.lo) : 1, $t = xt ? 1 / xt.hi : 1, qt = kt(n.length), Rt = kt(n.length), zt = new Float64Array(n.length), Tt = It(o, n), Et = /* @__PURE__ */ new Float64Array(3);
	let jt = 0;
	for (let c = 0; c < n.length; c++) {
		const t = n[c];
		for (let n = i[t], e = i[t + 1]; n < e; n += M) {
			const t = a[n], e = d[jt], r = p[jt];
			u[0] = y[3 * jt], u[1] = y[3 * jt + 1], u[2] = y[3 * jt + 2], jt++;
			const o = 3 * t;
			zt[c]++;
			const s = Nt(h, o, Tt, c);
			if (Pt) {
				const t = Math.min(1, Math.max(0, ((K * e + D * r - Z) / rt - Ut) * Lt)), n = dt(Pt, t);
				Mt(u[0] + n * (U[0] - u[0]), u[1] + n * (U[1] - u[1]), u[2] + n * (U[2] - u[2]), Et), vt(qt, c, t, wt(h, o, Et), s);
			}
			if (Ct) {
				const t = Math.min(1, Math.hypot(e - H, r - G) / _ * $t), n = dt(Ct, t);
				Mt(u[0] + n * (U[0] - u[0]), u[1] + n * (U[1] - u[1]), u[2] + n * (U[2] - u[2]), Et), vt(Rt, c, t, wt(h, o, Et), s);
			}
		}
	}
	const Bt = /* @__PURE__ */ new Float64Array(0);
	let Ot = null;
	if (At && gt && Ft(qt, L, zt)) {
		const t = s[1] / m, n = s[2] / m, e = K * t + D * n, r = Z + gt.lo * rt, o = Z + gt.hi * rt;
		Ot = {
			residual: qt.abs / L,
			fineLab: Bt,
			fineRgb: Bt,
			translucent: !0,
			paint: {
				kind: "linear",
				x1: t + (r - e) * K,
				y1: n + (r - e) * D,
				x2: t + (o - e) * K,
				y2: n + (o - e) * D,
				stops: At
			}
		};
	}
	return St && xt && Ft(Rt, L, zt) && (null === Ot || Rt.abs < qt.abs) && (Ot = {
		residual: Rt.abs / L,
		fineLab: Bt,
		fineRgb: Bt,
		translucent: !0,
		paint: {
			kind: "radial",
			cx: H,
			cy: G,
			r: _ * xt.hi,
			stops: St
		}
	}), Ot;
}
var Ct = class {
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
	less(t, n) {
		return this.s[t] !== this.s[n] ? this.s[t] < this.s[n] : this.a[t] !== this.a[n] ? this.a[t] < this.a[n] : this.b[t] < this.b[n];
	}
	swap(t, n) {
		const e = this.s[t];
		this.s[t] = this.s[n], this.s[n] = e;
		const r = this.a[t];
		this.a[t] = this.a[n], this.a[n] = r;
		const o = this.b[t];
		this.b[t] = this.b[n], this.b[n] = o;
	}
	push(t, n, e) {
		if (this.n === this.s.length) {
			const t = 2 * this.n, n = new Float64Array(t);
			n.set(this.s), this.s = n;
			const e = new Int32Array(t);
			e.set(this.a), this.a = e;
			const r = new Int32Array(t);
			r.set(this.b), this.b = r;
		}
		let r = this.n++;
		for (this.s[r] = t, this.a[r] = n, this.b[r] = e; r > 0;) {
			const t = r - 1 >> 1;
			if (!this.less(r, t)) break;
			this.swap(r, t), r = t;
		}
	}
	pop() {
		this.outScore = this.s[0], this.outA = this.a[0], this.outB = this.b[0];
		const t = --this.n;
		this.s[0] = this.s[t], this.a[0] = this.a[t], this.b[0] = this.b[t];
		let n = 0;
		for (;;) {
			const t = 2 * n + 1, e = t + 1;
			let r = n;
			if (t < this.n && this.less(t, r) && (r = t), e < this.n && this.less(e, r) && (r = e), r === n) break;
			this.swap(n, r), n = r;
		}
	}
};
function Ut(t, n, e, r, o, s, i, a) {
	const l = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map();
	for (const A of e) {
		if (r[A] >= 0) continue;
		const n = /* @__PURE__ */ new Float64Array(28);
		for (let e = 0; e < 28; e++) n[e] = t[28 * A + e];
		c.set(A, {
			members: [A],
			acc: n,
			adj: /* @__PURE__ */ new Set()
		}), l.set(A, A);
	}
	for (const [A, k] of c) for (const t of k.members) for (const e of n[t]) {
		const t = l.get(e);
		void 0 !== t && t !== A && k.adj.add(t);
	}
	const h = /* @__PURE__ */ new Float64Array(28), f = [], u = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set(), d = /* @__PURE__ */ new Map(), p = new Ct(), g = (t, n) => {
		f.length = 0;
		for (const e of t.members) f.push(e);
		for (const e of n.members) f.push(e);
	}, m = (t, n) => {
		let e = d.get(t);
		void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(t, e)), e.add(n);
	}, x = (t, n) => {
		const e = c.get(t), r = c.get(n);
		for (let s = 0; s < 28; s++) h[s] = e.acc[s] + r.acc[s];
		g(e, r);
		const o = s(h, f);
		if (Number.isFinite(o)) {
			const e = t * a + n;
			u.set(e, o), m(t, e), m(n, e), p.push(o, t, n);
		}
	}, M = /* @__PURE__ */ new Set(), w = (t, n) => {
		if (n <= t) return;
		const e = t * a + n;
		M.has(e) || (M.add(e), x(t, n));
	};
	for (const [A, k] of c) {
		for (const t of k.adj) w(A, t);
		for (const t of k.adj) for (const n of c.get(t).adj) n !== A && w(A, n);
	}
	for (;;) {
		let t = -1, n = -1;
		for (; p.size > 0;) {
			p.pop();
			const e = p.outA, r = p.outB;
			if (!c.has(e) || !c.has(r)) continue;
			const o = e * a + r;
			if (y.has(o)) continue;
			const s = u.get(o);
			if (void 0 !== s && s === p.outScore) {
				if (g(c.get(e), c.get(r)), null !== i(f, !1)) {
					t = e, n = r;
					break;
				}
				y.add(o), u.delete(o);
			}
		}
		if (t < 0) break;
		const e = c.get(t), r = c.get(n), o = new Set(e.adj), s = /* @__PURE__ */ new Set(), h = d.get(t);
		if (h) for (const i of h) s.add(i);
		const m = d.get(n);
		if (m) for (const i of m) s.add(i);
		for (const i of s) u.delete(i), y.delete(i), d.get(Math.floor(i / a))?.delete(i), d.get(i % a)?.delete(i);
		d.delete(n);
		for (let i = 0; i < 28; i++) e.acc[i] += r.acc[i];
		for (const i of r.members) e.members.push(i), l.set(i, t);
		const M = [];
		e.adj.delete(n), r.adj.delete(t);
		for (const i of r.adj) {
			e.adj.has(i) || M.push(i), e.adj.add(i);
			const r = c.get(i);
			r.adj.delete(n), r.adj.add(t);
		}
		c.delete(n);
		const w = /* @__PURE__ */ new Set();
		for (const i of e.adj) {
			w.add(i);
			for (const n of c.get(i).adj) n !== t && w.add(n);
		}
		for (const i of w) x(t < i ? t : i, t < i ? i : t);
		if (M.length > 0) {
			for (const i of o) if (i !== n) for (const t of M) {
				const n = i < t ? i : t, e = i < t ? t : i, r = n * a + e;
				u.has(r) || y.has(r) || x(n, e);
			}
		}
	}
	const b = [];
	for (const [A, k] of c) {
		if (k.acc[0] < o) continue;
		const t = i(k.members, !0);
		if (t) {
			for (const t of k.members) r[t] = 1;
			b.push({
				members: k.members.slice(),
				rep: A,
				built: t
			});
		}
	}
	return b;
}
function Lt(t, n, e) {
	const { width: r, height: o, count: s } = n, i = n.data;
	if (s < 1) return {
		gradients: new Array(s).fill(null),
		underlays: new Int32Array(s).fill(-1),
		labels: n,
		parentLabel: Int32Array.from({ length: s }, (t, n) => n)
	};
	const a = e?.detectMaxDimension ?? 0;
	if (a > 0 && Math.max(r, o) > a) return function(t, n, e, r) {
		const { width: o, height: s, data: i, count: a } = n, l = r / Math.max(o, s), c = Math.max(1, Math.round(o * l)), h = Math.max(1, Math.round(s * l)), f = z(t, r), u = function(t, n, e) {
			const { width: r, height: o, data: s } = t, i = new Int32Array(n * e);
			for (let a = 0; a < e; a++) {
				const t = Math.min(o - 1, a * o / e | 0);
				for (let e = 0; e < n; e++) i[a * n + e] = s[t * r + Math.min(r - 1, e * r / n | 0)];
			}
			return i;
		}(n, c, h), y = u.slice(), d = e?.alpha ? function(t, n, e, r, o) {
			const s = new Uint8Array(r * o);
			for (let i = 0; i < o; i++) {
				const a = Math.min(e - 1, i * e / o | 0);
				for (let e = 0; e < r; e++) s[i * r + e] = t[a * n + Math.min(n - 1, e * n / r | 0)];
			}
			return s;
		}(e.alpha, o, s, c, h) : void 0, p = Lt(f, {
			width: c,
			height: h,
			data: u,
			count: a
		}, {
			...e,
			detectMaxDimension: 0,
			oklab: void 0,
			alpha: d
		}), g = new Int32Array(i.length), m = new Int32Array(i.length).fill(-1), x = new Int32Array(i.length), M = new Int32Array(i.length), w = /* @__PURE__ */ new Map(), b = /* @__PURE__ */ new Map();
		for (let N = 0; N < i.length; N++) {
			if (i[N] < 0) {
				g[N] = -1, m[N] = N;
				continue;
			}
			if (m[N] >= 0) continue;
			const t = i[N];
			let n = 0, e = 0;
			for (x[n++] = N, m[N] = N, w.clear(), b.clear(); n > 0;) {
				const r = x[--n];
				M[e++] = r;
				const a = r % o, l = (r - a) / o, f = Math.min(c - 1, a * c / o | 0), d = Math.min(h - 1, l * h / s | 0) * c + f, p = u[d];
				b.set(p, (b.get(p) ?? 0) + 1), y[d] === t && w.set(p, (w.get(p) ?? 0) + 1), a > 0 && i[r - 1] === t && m[r - 1] < 0 && (m[r - 1] = N, x[n++] = r - 1), a + 1 < o && i[r + 1] === t && m[r + 1] < 0 && (m[r + 1] = N, x[n++] = r + 1), r >= o && i[r - o] === t && m[r - o] < 0 && (m[r - o] = N, x[n++] = r - o), r + o < i.length && i[r + o] === t && m[r + o] < 0 && (m[r + o] = N, x[n++] = r + o);
			}
			const r = w.size > 0 ? w : b;
			let a = t, l = 0;
			for (const [o, s] of r) (s > l || s === l && o < a) && (l = s, a = o);
			for (let o = 0; o < e; o++) g[M[o]] = a;
		}
		i.set(g);
		const A = o / c, k = s / h, v = (A + k) / 2, F = p.gradients.map((t) => function(t, n, e, r) {
			return null === t ? t : "linear" === t.kind ? {
				...t,
				x1: t.x1 * n,
				y1: t.y1 * e,
				x2: t.x2 * n,
				y2: t.y2 * e
			} : {
				...t,
				cx: t.cx * n,
				cy: t.cy * e,
				r: t.r * r
			};
		}(t, A, k, v)), I = p.labels.count;
		return {
			gradients: F,
			underlays: p.underlays,
			labels: I === a ? n : {
				width: o,
				height: s,
				data: i,
				count: I
			},
			parentLabel: p.parentLabel
		};
	}(t, n, e, a);
	const l = e?.minArea ?? 0, c = e?.maxBacktrack ?? .15, h = e?.minColorSpan ?? .05, f = e?.oklab ?? H(t);
	let u = e?.alpha ?? null;
	if (null !== u) {
		let t = !1;
		for (let n = 0; n < i.length && !t; n++) t = i[n] >= 0 && u[n] < 255;
		t || (u = null);
	}
	const y = new Int32Array(i.length).fill(-1), d = [], p = new Int32Array(s).fill(-1), g = new Int32Array(i.length), m = new Int32Array(i.length);
	for (let z = 0; z < i.length; z++) {
		if (i[z] < 0 || y[z] >= 0) continue;
		const t = i[z], n = d.length;
		d.push(t);
		let e = 0, o = 0;
		for (g[e++] = z, y[z] = n; e > 0;) {
			const s = g[--e];
			m[o++] = s;
			const a = s % r;
			a > 0 && i[s - 1] === t && y[s - 1] < 0 && (y[s - 1] = n, g[e++] = s - 1), a + 1 < r && i[s + 1] === t && y[s + 1] < 0 && (y[s + 1] = n, g[e++] = s + 1), s >= r && i[s - r] === t && y[s - r] < 0 && (y[s - r] = n, g[e++] = s - r), s + r < i.length && i[s + r] === t && y[s + r] < 0 && (y[s + r] = n, g[e++] = s + r);
		}
		if (!(o >= 16)) if (p[t] < 0) p[t] = n;
		else {
			for (let n = 0; n < o; n++) y[m[n]] = p[t];
			d.pop();
		}
	}
	const x = d.length, M = new Float64Array(28 * x), w = new Uint32Array(x);
	for (let z = 0; z < o; z++) for (let t = 0; t < r; t++) {
		const n = z * r + t, e = y[n];
		if (e < 0) continue;
		w[e]++;
		const o = t + .5, s = z + .5, i = o * o, a = s * s, l = i + a, c = 3 * n, h = f[c], u = f[c + 1], d = f[c + 2], p = 28 * e;
		M[p] += 1, M[p + 1] += o, M[p + 2] += s, M[p + 3] += i, M[p + 4] += o * s, M[p + 5] += a, M[p + 6] += h, M[p + 7] += u, M[p + 8] += d, M[p + 9] += h * h, M[p + 10] += u * u, M[p + 11] += d * d, M[p + 12] += h * o, M[p + 13] += h * s, M[p + 14] += u * o, M[p + 15] += u * s, M[p + 16] += d * o, M[p + 17] += d * s, M[p + 18] += i * o, M[p + 19] += i * s, M[p + 20] += o * a, M[p + 21] += a * s, M[p + 22] += i * i, M[p + 23] += i * a, M[p + 24] += a * a, M[p + 25] += h * l, M[p + 26] += u * l, M[p + 27] += d * l;
	}
	const b = new Int32Array(x + 1);
	for (let z = 0; z < x; z++) b[z + 1] = b[z] + w[z];
	const A = new Int32Array(b[x]), k = b.slice(0, x);
	for (let z = 0; z < i.length; z++) {
		const t = y[z];
		t >= 0 && (A[k[t]++] = z);
	}
	const v = Array.from({ length: x }, () => /* @__PURE__ */ new Set());
	for (let z = 0; z < o; z++) for (let t = 0; t < r; t++) {
		const n = z * r + t, e = y[n];
		if (!(e < 0)) {
			if (t + 1 < r) {
				const t = y[n + 1];
				t >= 0 && t !== e && (v[e].add(t), v[t].add(e));
			}
			if (z + 1 < o) {
				const t = y[n + r];
				t >= 0 && t !== e && (v[e].add(t), v[t].add(e));
			}
		}
	}
	const F = v.map((t) => [...t].toSorted((t, n) => t - n)), I = [];
	for (let z = 0; z < x; z++) w[z] > 0 && p[d[z]] !== z && I.push(z);
	I.sort((t, n) => w[n] - w[t] || t - n);
	const N = {
		width: r,
		ok: f,
		rgb: t.data,
		alpha: u,
		m: M,
		offset: b,
		bucket: A,
		maxBacktrack: c,
		minColorSpan: h,
		sacc: /* @__PURE__ */ new Float64Array(28),
		lab: /* @__PURE__ */ new Float64Array(3),
		sBc: new Float64Array(3 * (Q + x)),
		sPx: new Float64Array(Q + x),
		sPy: new Float64Array(Q + x),
		sAl: new Float64Array(Q + x)
	}, S = /* @__PURE__ */ new Map(), P = (t, n) => {
		if (1 !== t.length || !n) return St(N, t, n);
		let e = S.get(t[0]);
		return void 0 === e && (e = St(N, t, !0), S.set(t[0], e)), e;
	}, C = new Int32Array(x).fill(-1), U = new Int32Array(x).fill(-1), L = new Array(x).fill(null), $ = new Int32Array(x).fill(-1), q = Ut(M, F, I, C, l, (t, n) => {
		let e = 1 / 0;
		const r = Y(t, 0);
		if (null !== r && r.directionality >= X) {
			const t = function(t, n, e, r) {
				const o = [];
				for (const l of n) {
					const n = 28 * l, s = t[n];
					s <= 0 || o.push([
						e * (t[n + 1] / s) + r * (t[n + 2] / s),
						l,
						[
							t[n + 6] / s,
							t[n + 7] / s,
							t[n + 8] / s
						]
					]);
				}
				o.sort((t, n) => t[0] - n[0] || t[1] - n[1]);
				const s = o.map((t) => t[2]), i = s.length;
				let a = 0;
				if (i >= 3) {
					const t = s[0], n = s[i - 1], e = Math.hypot(n[0] - t[0], n[1] - t[1], n[2] - t[2]);
					if (e > 1e-6) for (let r = 1; r < i - 1; r++) {
						const t = o[r - 1][0], n = o[r + 1][0], i = n - t > 1e-9 ? (o[r][0] - t) / (n - t) : .5, l = s[r - 1][0] + (s[r + 1][0] - s[r - 1][0]) * i, c = s[r - 1][1] + (s[r + 1][1] - s[r - 1][1]) * i, h = s[r - 1][2] + (s[r + 1][2] - s[r - 1][2]) * i, f = Math.hypot(s[r][0] - l, s[r][1] - c, s[r][2] - h) / e;
						f > a && (a = f);
					}
				}
				return {
					backtrack: _(s),
					outlier: a
				};
			}(M, n, r.dx, r.dy);
			t.backtrack <= c && t.outlier <= .35 && (e = t.backtrack + t.outlier);
		}
		const o = J(t, 0);
		return tt(o) && o.misfit < e && (e = o.misfit), e;
	}, P, x);
	for (const z of q) {
		L[z.rep] = z.built.paint;
		for (const t of z.members) U[t] = z.rep;
	}
	if (!1 !== e?.overlays) {
		const t = (t) => {
			let n = 0;
			for (const e of t.members) n += w[e];
			return n;
		}, n = q.toSorted((n, e) => t(e) - t(n) || n.rep - e.rep), e = new Map(n.map((t) => [t.rep, t])), r = /* @__PURE__ */ new Set(), o = [];
		for (const s of n) {
			if (s.built.translucent || r.has(s)) continue;
			const i = /* @__PURE__ */ new Set(), a = [], c = /* @__PURE__ */ new Set(), h = (t) => {
				for (const n of F[t]) {
					C[n] < 0 && !i.has(n) && (i.add(n), a.push(n));
					const t = U[n];
					if (t >= 0 && t !== s.rep) {
						const n = e.get(t);
						!n || n.built.translucent || r.has(n) || c.add(n);
					}
				}
			};
			for (const t of s.members) h(t);
			for (; a.length > 0;) h(a.pop());
			const f = 0 === i.size ? [] : Ut(M, F, I.filter((t) => i.has(t)), C, l, (t, n) => et(M, n) >= W ? 0 : 1 / 0, (t, n) => Pt(N, t, s.built, n), x);
			for (const n of c) {
				if (t(n) >= t(s) || n.built.residual < .01) continue;
				const e = Pt(N, n.members, s.built, !0);
				null === e || e.residual > .5 * n.built.residual || (n.built = e, f.push(n));
			}
			for (const e of f) {
				const i = new Set(e.members);
				for (let o = !0; o;) {
					o = !1;
					for (const a of n) {
						if (a === s || a === e || a.built.translucent) continue;
						if (r.has(a) || t(a) >= t(s)) continue;
						if (a.built.residual < .01) continue;
						if (!a.members.some((t) => F[t].some((t) => i.has(t)))) continue;
						const n = Pt(N, e.members.concat(a.members), s.built, !0);
						if (null === n) continue;
						const l = Math.max(e.built.residual, a.built.residual);
						if (!(n.residual > l + .002)) {
							for (const t of a.members) e.members.push(t), i.add(t);
							e.built = n, L[a.rep] = null, r.add(a), o = !0;
						}
					}
				}
				L[e.rep] = e.built.paint, $[e.rep] = s.rep;
				for (const t of e.members) U[t] = e.rep;
				o.push({
					overlay: e,
					base: s
				});
			}
		}
		for (const { overlay: s, base: i } of o) {
			if (r.has(i)) continue;
			const t = new Set(s.members);
			for (const e of n) {
				if (e === i || e.built.translucent || r.has(e)) continue;
				if (!e.members.some((n) => F[n].some((n) => t.has(n)))) continue;
				const n = P(i.members.concat(e.members), !0);
				if (null === n) continue;
				i.members.push(...e.members), i.built = n, L[i.rep] = n.paint, L[e.rep] = null;
				for (const t of e.members) U[t] = i.rep;
				r.add(e);
				const o = Pt(N, s.members, n, !0);
				o && (s.built = o, L[s.rep] = o.paint);
			}
		}
	}
	{
		const t = /* @__PURE__ */ new Map();
		for (const r of q) L[r.rep] && !r.built.translucent && t.set(r.rep, r);
		const n = /* @__PURE__ */ new Map();
		for (const [r, o] of t) {
			let t = 0;
			for (const n of o.members) t += w[n];
			n.set(r, t);
		}
		const e = N.lab;
		for (let o = 0; o < x; o++) {
			if (C[o] >= 0 || 0 === w[o]) continue;
			const s = /* @__PURE__ */ new Set();
			for (const n of F[o]) {
				const e = U[n];
				e >= 0 && t.has(e) && s.add(e);
			}
			const i = [...s].toSorted((t, e) => n.get(e) - n.get(t) || t - e);
			for (const a of i) {
				const s = t.get(a);
				if (w[o] > .1 * n.get(a)) continue;
				let i = 0;
				for (let t = b[o], n = b[o + 1]; t < n; t++) {
					const n = A[t], o = n % r + .5, a = (n - n % r) / r + .5;
					ut(s.built.fineLab, pt(s.built.paint, o, a), e), i += Math.sqrt(wt(f, 3 * n, e));
				}
				if (!(i / w[o] > .045)) {
					C[o] = 1, U[o] = a, s.members.push(o), n.set(a, n.get(a) + w[o]);
					break;
				}
			}
		}
	}
	const R = new Int32Array(x).fill(-1), T = new Uint8Array(s), E = new Uint32Array(s);
	for (let z = 0; z < x; z++) p[d[z]] !== z && E[d[z]]++;
	const j = [];
	for (let z = 0; z < x; z++) U[z] === z && L[z] && j.push(z);
	const B = /* @__PURE__ */ new Map();
	for (let z = 0; z < x; z++) {
		const t = U[z];
		if (t < 0 || p[d[z]] === z) continue;
		let n = B.get(t);
		n || (n = /* @__PURE__ */ new Map(), B.set(t, n)), n.set(d[z], (n.get(d[z]) ?? 0) + 1);
	}
	const O = Array.from({ length: s }, (t, n) => n);
	for (const z of j) {
		const t = B.get(z) ?? /* @__PURE__ */ new Map(), n = d[z], e = [...t.keys()].filter((n) => !T[n] && t.get(n) === E[n]).toSorted((t, e) => t === n ? -1 : e === n ? 1 : t - e);
		e.length > 0 ? (R[z] = e[0], T[e[0]] = 1) : (R[z] = O.length, O.push(n));
	}
	const K = new Int32Array(x);
	let D = !1;
	for (let z = 0; z < x; z++) {
		const t = U[z], n = t >= 0 && R[t] >= 0 ? R[t] : d[z];
		K[z] = n, n !== d[z] && (D = !0);
	}
	const G = O.length, Z = new Array(G).fill(null), V = new Int32Array(G).fill(-1);
	for (const z of j) {
		const t = R[z];
		Z[t] = L[z], $[z] >= 0 && (V[t] = R[$[z]]);
	}
	if (D) for (let z = 0; z < i.length; z++) {
		const t = y[z];
		t >= 0 && (i[z] = K[t]);
	}
	return {
		gradients: Z,
		underlays: V,
		labels: G === s ? n : {
			width: r,
			height: o,
			data: i,
			count: G
		},
		parentLabel: Int32Array.from(O)
	};
}
const $t = .1;
function qt(t, n, e, r, o, s, i, a, l) {
	const c = r - i, h = o - a, f = s - l, u = c * c + h * h + f * f;
	if (u < 1) return {
		t: -1,
		resid2: 1 / 0
	};
	let y = ((t - i) * c + (n - a) * h + (e - l) * f) / u;
	y < 0 ? y = 0 : y > 1 && (y = 1);
	const d = t - (i + y * c), p = n - (a + y * h), g = e - (l + y * f);
	return {
		t: y,
		resid2: d * d + p * p + g * g
	};
}
function Rt(t, n, e, r, o, s) {
	const { width: i, height: a, data: l } = n, c = n.count, h = i * a;
	if (c < 3 || 0 === h) return 0;
	const f = t.data, u = new Uint8Array(h), y = new Int32Array(h), d = new Float64Array(h), p = new Int32Array(h).fill(-1), g = new Uint32Array(c), m = new Int32Array(c), x = Math.max(1, Math.round(s)), M = 6 * s, w = (t, n) => {
		const e = t % i, r = (t - e) / i;
		for (let o = -x; o <= x; o++) {
			const t = r + o;
			if (!(t < 0 || t >= a)) for (let r = -x; r <= x; r++) {
				const o = e + r;
				if (o >= 0 && o < i && l[t * i + o] !== n) return !1;
			}
		}
		return !0;
	};
	for (let A = 0; A < h; A++) {
		const t = l[A];
		if (t < 0 || 0 !== u[A]) continue;
		let n = 0, s = 0;
		y[n++] = A, u[A] = 1;
		let a = 0, c = 0;
		for (; s < n;) {
			const e = y[s++], r = e % i;
			for (let o = 0; o < 4; o++) {
				let s;
				if (s = 0 === o ? r > 0 ? e - 1 : -1 : 1 === o ? r < i - 1 ? e + 1 : -1 : 2 === o ? e >= i ? e - i : -1 : e < h - i ? e + i : -1, s >= 0 && l[s] === t) {
					0 === u[s] && (u[s] = 1, y[n++] = s);
					continue;
				}
				a++;
				const f = s >= 0 ? l[s] : -1;
				f < 0 || (0 === g[f] && (m[c++] = f), g[f]++);
			}
		}
		let x = -1, b = -1, k = 0;
		for (let e = 0; e < c; e++) {
			const t = m[e], n = g[t];
			k += n, x < 0 || n > g[x] || n === g[x] && t < x ? (b = x, x = t) : (b < 0 || n > g[b] || n === g[b] && t < b) && (b = t);
		}
		const v = x >= 0 ? g[x] : 0, F = b >= 0 ? g[b] : 0;
		for (let e = 0; e < c; e++) g[m[e]] = 0;
		if (2 * n > M * a || b < 0) continue;
		if (v + F < .7 * k || F < .25 * (v + F)) continue;
		const I = e[3 * x], N = e[3 * x + 1], S = e[3 * x + 2], P = e[3 * b], C = e[3 * b + 1], U = e[3 * b + 2];
		let L = 0, $ = 0, q = 0;
		for (let e = 0; e < n; e++) {
			const t = 4 * y[e];
			L += f[t], $ += f[t + 1], q += f[t + 2];
		}
		const R = qt(L / n, $ / n, q / n, I, N, S, P, C, U);
		if (R.t < $t || R.t > .9 || R.resid2 > 400) continue;
		const z = I - P, T = N - C, E = S - U, j = Math.max(144, .2 * .2 * (z * z + T * T + E * E));
		let B = 0, O = 0, K = !0;
		for (let e = 0; e < n; e++) {
			const n = y[e], s = 4 * n, { t: i, resid2: a } = qt(f[s], f[s + 1], f[s + 2], I, N, S, P, C, U);
			d[e] = i, a <= j && i >= $t && i <= .9 && B++, r[n] < o && O++, K && w(n, t) && (K = !1);
		}
		if (!(B < .7 * n)) {
			if (!K) {
				if (O > .05 * n) continue;
				const t = d.subarray(0, n).toSorted();
				if (t[Math.floor(.8 * (n - 1))] - t[Math.floor(.2 * (n - 1))] < .2) continue;
			}
			for (let t = 0; t < n; t++) p[y[t]] = d[t] >= .5 ? x : b;
		}
	}
	let b = 0;
	for (let A = 0; A < h; A++) p[A] < 0 || (l[A] = p[A], b++);
	return b;
}
const zt = .018 * .018, Tt = 144e-6;
function Et(t, n, e, r, o, s) {
	const i = n * n + e * e;
	if (i < zt) return r;
	const a = o[3 * r + 1], l = o[3 * r + 2], c = a * a + l * l;
	if (c < Tt) return r;
	const h = n * a + e * l;
	if (h > 0 && h * h >= .5 * i * c) return r;
	let f = -1, u = .0081;
	for (let y = 0, d = 0; y < s; y++, d += 3) {
		if (y === r) continue;
		const s = o[d + 1], a = o[d + 2], l = s * s + a * a;
		let c = l < Tt;
		if (!c) {
			const t = n * s + e * a;
			c = t > 0 && t * t >= .5 * i * l;
		}
		if (!c) continue;
		const h = t - o[d], p = n - s, g = e - a, m = h * h + p * p + g * g;
		m < u && (u = m, f = y);
	}
	return f >= 0 ? f : r;
}
function jt(t, n, e, r, o, s, i, a, l) {
	const c = new Uint32Array(e), h = /* @__PURE__ */ new Map();
	if (null !== o) for (let f = 0, u = 0, y = 0; f < i; f++, u += 3, y += 4) {
		if (null !== s && 0 === s[f]) {
			t[f] = -1;
			continue;
		}
		const i = r[y] << 16 | r[y + 1] << 8 | r[y + 2];
		let d = h.get(i);
		if (void 0 === d) {
			const t = o[u], r = o[u + 1], s = o[u + 2];
			d = 0;
			let a = 1 / 0;
			for (let o = 0, i = 0; o < e; o++, i += 3) {
				const e = t - n[i], l = r - n[i + 1], c = s - n[i + 2], h = e * e + l * l + c * c;
				h < a && (a = h, d = o);
			}
			l && (d = Et(t, r, s, d, n, e)), h.set(i, d);
		}
		if (t[f] = d, c[d]++, null !== a) {
			const t = 3 * d;
			a[t] += r[y], a[t + 1] += r[y + 1], a[t + 2] += r[y + 2];
		}
	}
	else for (let f = 0, u = 0; f < i; f++, u += 4) {
		if (null !== s && 0 === s[f]) {
			t[f] = -1;
			continue;
		}
		const o = r[u] << 16 | r[u + 1] << 8 | r[u + 2];
		let i = h.get(o);
		if (void 0 === i) {
			const t = r[u] / 255, s = r[u + 1] / 255, a = r[u + 2] / 255;
			i = 0;
			let l = 1 / 0;
			for (let r = 0, o = 0; r < e; r++, o += 3) {
				const e = t - n[o], c = s - n[o + 1], h = a - n[o + 2], f = e * e + c * c + h * h;
				f < l && (l = f, i = r);
			}
			h.set(o, i);
		}
		if (t[f] = i, c[i]++, null !== a) {
			const t = 3 * i;
			a[t] += r[u], a[t + 1] += r[u + 1], a[t + 2] += r[u + 2];
		}
	}
	return c;
}
function Bt(t, n) {
	const e = new Array(n);
	for (let r = 0; r < n; r++) e[r] = r;
	return e.sort((n, e) => t[e] - t[n] || n - e), e;
}
const Ot = 8 / 16384, Kt = .025;
function Dt(t, n, e) {
	let r = 1 / 0;
	for (let o = 0; o < e; o++) for (let s = o + 1; s < e; s++) {
		let e = 0, i = 0;
		for (let r = 0; r < 3; r++) {
			const a = n[3 * s + r] - n[3 * o + r];
			e += a * a, i += (t[r] - n[3 * o + r]) * a;
		}
		if (e < 1e-12) continue;
		const a = Math.min(1, Math.max(0, i / e));
		let l = 0;
		for (let r = 0; r < 3; r++) {
			const e = n[3 * o + r] + (n[3 * s + r] - n[3 * o + r]) * a;
			l += (t[r] - e) * (t[r] - e);
		}
		l < r && (r = l);
	}
	for (let o = 0; o < e; o++) for (let s = o + 1; s < e; s++) for (let i = s + 1; i < e; i++) {
		let e = 0, a = 0, l = 0, c = 0, h = 0;
		for (let r = 0; r < 3; r++) {
			const f = n[3 * o + r], u = n[3 * s + r] - f, y = n[3 * i + r] - f, d = t[r] - f;
			e += u * u, a += y * y, l += u * y, c += d * u, h += d * y;
		}
		const f = e * a - l * l;
		if (Math.abs(f) < 1e-12) continue;
		const u = (a * c - l * h) / f, y = (e * h - l * c) / f;
		if (u < 0 || y < 0 || u + y > 1) continue;
		let d = 0;
		for (let r = 0; r < 3; r++) {
			const e = n[3 * o + r], a = e + (n[3 * s + r] - e) * u + (n[3 * i + r] - e) * y;
			d += (t[r] - a) * (t[r] - a);
		}
		d < r && (r = d);
	}
	return Math.sqrt(r);
}
function Ht(t, n, e) {
	let r = 1 / 0;
	for (let o = 0; o < e; o++) for (let s = o + 1; s < e; s++) {
		let e = 0, i = 0;
		for (let r = 0; r < 3; r++) {
			const a = n[3 * s + r] - n[3 * o + r];
			e += a * a, i += (t[r] - n[3 * o + r]) * a;
		}
		if (e < 1e-12) continue;
		const a = Math.min(1.15, Math.max(-.15, i / e));
		let l = 0;
		for (let r = 0; r < 3; r++) {
			const e = n[3 * o + r] + (n[3 * s + r] - n[3 * o + r]) * a;
			l += (t[r] - e) * (t[r] - e);
		}
		l < r && (r = l);
	}
	for (let o = 0; o < e; o++) {
		let e = 0, s = 0;
		for (let r = 0; r < 3; r++) e += n[3 * o + r] * n[3 * o + r], s += t[r] * n[3 * o + r];
		if (e < 1e-12) continue;
		const i = Math.min(1.15, Math.max(1, s / e));
		let a = 0;
		for (let r = 0; r < 3; r++) {
			const e = n[3 * o + r] * i;
			a += (t[r] - e) * (t[r] - e);
		}
		a < r && (r = a);
	}
	return Math.sqrt(r);
}
const Xt = (() => {
	const t = [];
	for (let n = -2; n <= 2; n++) for (let e = -2; e <= 2; e++) (e || n) && t.push([e, n]);
	return t;
})(), Wt = [
	[
		1,
		0,
		1
	],
	[
		-1,
		0,
		1
	],
	[
		0,
		1,
		1
	],
	[
		0,
		-1,
		1
	],
	[
		1,
		1,
		Math.SQRT2
	],
	[
		-1,
		1,
		Math.SQRT2
	],
	[
		1,
		-1,
		Math.SQRT2
	],
	[
		-1,
		-1,
		Math.SQRT2
	]
];
function Gt(t, n) {
	return Math.hypot(t[0] - n[0], t[1] - n[1], t[2] - n[2]);
}
const Zt = 1.5;
function Qt(t, n, e) {
	return t >= 4 * e && t >= .05 * n;
}
const Yt = [
	{
		coherence: .1,
		diagonal: !1
	},
	{
		coherence: .2,
		diagonal: !1
	},
	{
		coherence: .2,
		diagonal: !0
	}
];
function _t(t, n, e, r, o) {
	const s = 3 * n, i = t[s] - e, a = t[s + 1] - r, l = t[s + 2] - o;
	return Math.sqrt(i * i + a * a + l * l);
}
function Vt(t, n, e, r, o, s, i, a) {
	let l = Math.max(1024, r), c = new Float64Array(l), h = new Int32Array(l), f = new Int32Array(l), u = 0;
	const y = (t, n) => {
		const e = c[t];
		c[t] = c[n], c[n] = e;
		const r = h[t];
		h[t] = h[n], h[n] = r;
		const o = f[t];
		f[t] = f[n], f[n] = o;
	}, d = (t, n) => c[t] < c[n] || c[t] === c[n] && h[t] < h[n], p = () => {
		if (u--, u > 0) {
			c[0] = c[u], h[0] = h[u], f[0] = f[u];
			let t = 0;
			for (;;) {
				const n = 2 * t + 1, e = 2 * t + 2;
				let r = t;
				if (n < u && d(n, r) && (r = n), e < u && d(e, r) && (r = e), r === t) break;
				y(t, r), t = r;
			}
		}
	}, g = (t, n) => {
		const o = t - (t / e | 0) * e;
		o > 0 && m(t - 1, n), o < e - 1 && m(t + 1, n), t >= e && m(t - e, n), t < r - e && m(t + e, n);
	}, m = (e, r) => {
		-1 !== n[e] || null !== o && 0 === o[e] || ((t, n, e) => {
			(() => {
				if (u < l) return;
				l *= 2;
				const t = new Float64Array(l);
				t.set(c), c = t;
				const n = new Int32Array(l);
				n.set(h), h = n;
				const e = new Int32Array(l);
				e.set(f), f = e;
			})();
			let r = u++;
			for (c[r] = t, h[r] = n, f[r] = e; r > 0;) {
				const t = r - 1 >> 1;
				if (c[t] < c[r] || c[t] === c[r] && h[t] <= h[r]) break;
				y(r, t), r = t;
			}
		})(_t(t, e, s[r], i[r], a[r]), e, r);
	};
	for (let x = 0; x < r; x++) n[x] >= 0 && g(x, n[x]);
	for (; u > 0;) {
		const t = h[0], e = f[0];
		p(), -1 === n[t] && (n[t] = e, g(t, e));
	}
	for (let x = 0; x < r; x++) -1 !== n[x] || null !== o && 0 === o[x] || (n[x] = 0);
}
function Jt(t, n, e, r, o, s, i, a, l, c, h, f, u, y) {
	const d = f * f, p = Math.round(24 * y), g = Math.round(3 * y), m = new Int32Array(o).fill(-1), x = (e, r, o, i) => {
		if (-1 !== m[e] || -1 !== n[e] || null !== s && 0 === s[e]) return !1;
		const a = t[3 * e] - r, l = t[3 * e + 1] - o, c = t[3 * e + 2] - i;
		return a * a + l * l + c * c < d;
	}, M = new Int32Array(o), w = new Int32Array(o);
	let b = 64, A = new Int32Array(b), k = new Int32Array(b), v = 0, F = 0;
	for (let j = 0; j < o; j++) {
		if (-1 !== m[j] || -1 !== n[j] || null !== s && 0 === s[j]) continue;
		if (v === b) {
			b *= 2;
			const t = new Int32Array(b);
			t.set(A), A = t;
			const n = new Int32Array(b);
			n.set(k), k = n;
		}
		const r = v++, i = F;
		let a = 0, l = 0, c = 0, h = 0;
		for (w[h++] = j, m[j] = r; h > 0;) {
			const n = w[--h];
			M[F++] = n, a += t[3 * n], l += t[3 * n + 1], c += t[3 * n + 2];
			const s = F - i, f = a / s, y = l / s, d = c / s, p = n - (n / e | 0) * e;
			if (p > 0 && x(n - 1, f, y, d) && (m[n - 1] = r, w[h++] = n - 1), p < e - 1 && x(n + 1, f, y, d) && (m[n + 1] = r, w[h++] = n + 1), n >= e && x(n - e, f, y, d) && (m[n - e] = r, w[h++] = n - e), n < o - e && x(n + e, f, y, d) && (m[n + e] = r, w[h++] = n + e), u) {
				const t = n >= e, s = n < o - e, i = p > 0, a = p < e - 1;
				t && i && x(n - e - 1, f, y, d) && (m[n - e - 1] = r, w[h++] = n - e - 1), t && a && x(n - e + 1, f, y, d) && (m[n - e + 1] = r, w[h++] = n - e + 1), s && i && x(n + e - 1, f, y, d) && (m[n + e - 1] = r, w[h++] = n + e - 1), s && a && x(n + e + 1, f, y, d) && (m[n + e + 1] = r, w[h++] = n + e + 1);
			}
		}
		A[r] = i, k[r] = F - i;
	}
	const I = [];
	for (let j = 0; j < v; j++) k[j] >= h && I.push(j);
	if (0 === I.length) return [];
	const N = new Float64Array(v), S = new Float64Array(v), P = new Float64Array(v);
	for (const j of I) {
		const n = A[j], e = n + k[j];
		let r = 0, o = 0, s = 0;
		for (let i = n; i < e; i++) {
			const n = 3 * M[i];
			r += t[n], o += t[n + 1], s += t[n + 2];
		}
		N[j] = r / k[j], S[j] = o / k[j], P[j] = s / k[j];
	}
	const C = (t, n, e) => t < c ? e[t] : n[t - c], U = new Float64Array(I.length), L = new Float64Array(I.length), $ = new Float64Array(I.length);
	let q = 0;
	const R = (t, o, s, i) => {
		for (let a = 1; a <= p; a++) {
			const l = t + s * a, c = o + i * a;
			if (l < 0 || c < 0 || l >= e || c >= r) return -1;
			const h = n[c * e + l];
			if (h >= 0) return q = a, h;
		}
		return -1;
	}, z = (t) => {
		const n = A[t], r = k[t], o = N[t], s = S[t], c = P[t], h = (t) => {
			const n = C(t, U, i) - o, e = C(t, L, a) - s, r = C(t, $, l) - c;
			return Math.sqrt(n * n + e * e + r * r);
		}, f = (t, n) => {
			const e = C(t, U, i) - C(n, U, i), r = C(t, L, a) - C(n, L, a), o = C(t, $, l) - C(n, $, l);
			return Math.sqrt(e * e + r * r + o * o);
		};
		let u = 0, y = 0, d = 0;
		for (let i = 0; i < r; i++) {
			const t = M[n + i], r = t - (t / e | 0) * e, o = t / e | 0;
			let s = 0, a = 0, l = !1;
			for (let n = 0; n < 2; n++) {
				const t = 0 === n ? R(r, o, -1, 0) : R(r, o, 0, -1), e = q, i = 0 === n ? R(r, o, 1, 0) : R(r, o, 0, 1), c = q;
				if (t < 0 || i < 0) continue;
				const u = h(t), p = h(i), m = u < p ? u : p;
				y += m, d++;
				const x = f(t, i);
				m < (x < .1 ? .125 : .25) ? (u <= p ? e : c) <= g && (l = !0) : (s++, u + p - x >= .25 && a++);
			}
			!l && s > 0 && a === s && u++;
		}
		return {
			extreme: u / r,
			contrast: d > 0 ? y / d : 0
		};
	}, T = new Float64Array(v);
	for (const j of I) T[j] = z(j).contrast;
	I.sort((t, n) => T[n] - T[t] || t - n);
	const E = [];
	for (const j of I) {
		if (z(j).extreme < .7) continue;
		const t = c + E.length, e = A[j], r = e + k[j];
		for (let o = e; o < r; o++) n[M[o]] = t;
		U[E.length] = N[j], L[E.length] = S[j], $[E.length] = P[j], E.push({
			mL: N[j],
			mA: S[j],
			mB: P[j],
			size: k[j]
		});
	}
	return E;
}
function tn(t, n, e, o, s, i) {
	const [a, l, c] = r(t, n, e), [h, f, y] = r(o, s, i), [p, g, m] = u(a, l, c), [x, M, w] = u(h, f, y);
	return d(p, g, m, x, M, w);
}
function nn(t) {
	return t <= 0 ? 0 : t >= 1 ? 255 : 256 * t | 0;
}
function en(t, n, e) {
	if (n <= 1) return t;
	const r = e?.keepContrast ? e.keepContrast * e.keepContrast : 0, o = e?.protect?.data ?? null, i = e?.oklab, { width: a, height: l, data: c } = t, h = a * l;
	if (0 === h) return t;
	let f = t.count;
	for (let s = 0; s < h; s++) c[s] >= f && (f = c[s] + 1);
	const u = new Int32Array(f), y = new Int32Array(f), d = new Uint8Array(h), p = new Int32Array(h), g = new Int32Array(h);
	let m = /* @__PURE__ */ new Int32Array(64), x = /* @__PURE__ */ new Int32Array(64), M = /* @__PURE__ */ new Int32Array(64), w = /* @__PURE__ */ new Int32Array(64), b = 0, A = 0, k = 0;
	const v = (t, e) => {
		const r = c[t], o = k;
		let s = o, i = t, l = 0, f = !1;
		for (p[l++] = t, d[t] = 1; l > 0;) {
			const t = p[--l];
			if (g[s++] = t, t < i && (i = t), e && s - o >= n) {
				f = !0;
				break;
			}
			const u = t - (t / a | 0) * a;
			if (u > 0) {
				const n = d[t - 1];
				if (1 !== n && c[t - 1] === r) {
					if (2 === n) {
						f = !0;
						break;
					}
					d[t - 1] = 1, p[l++] = t - 1;
				}
			}
			if (u < a - 1) {
				const n = d[t + 1];
				if (1 !== n && c[t + 1] === r) {
					if (2 === n) {
						f = !0;
						break;
					}
					d[t + 1] = 1, p[l++] = t + 1;
				}
			}
			if (t >= a) {
				const n = d[t - a];
				if (1 !== n && c[t - a] === r) {
					if (2 === n) {
						f = !0;
						break;
					}
					d[t - a] = 1, p[l++] = t - a;
				}
			}
			if (t < h - a) {
				const n = d[t + a];
				if (1 !== n && c[t + a] === r) {
					if (2 === n) {
						f = !0;
						break;
					}
					d[t + a] = 1, p[l++] = t + a;
				}
			}
		}
		if (f) {
			for (let t = o; t < s; t++) d[g[t]] = 2;
			for (let t = 0; t < l; t++) d[p[t]] = 2;
			return -1;
		}
		const u = s - o;
		return u >= n ? -1 : (k = s, b === m.length && (m = rn(m), x = rn(x), M = rn(M)), m[b] = o, x[b] = u, M[b] = i, b++);
	}, F = (t) => {
		if (t < 0) return;
		A === w.length && (w = rn(w));
		const n = M[t];
		let e = A++;
		for (; e > 0;) {
			const t = e - 1 >> 1;
			if (M[w[t]] <= n) break;
			w[e] = w[t], e = t;
		}
		w[e] = t;
	}, I = () => {
		if (0 === A) return -1;
		const t = w[0], n = w[--A];
		if (A > 0) {
			const t = M[n];
			let e = 0;
			for (;;) {
				let n = 2 * e + 1;
				if (n >= A) break;
				if (n + 1 < A && M[w[n + 1]] < M[w[n]] && n++, M[w[n]] >= t) break;
				w[e] = w[n], e = n;
			}
			w[e] = n;
		}
		return t;
	}, N = (t) => {
		const n = m[t], e = n + x[t], l = c[g[n]];
		let f = !1, d = 0;
		for (let r = n; r < e; r++) {
			const t = g[r];
			null !== o && 0 !== o[t] && (f = !0);
			const n = t - (t / a | 0) * a;
			if (n > 0) {
				const n = c[t - 1];
				-1 !== n && n !== l && 0 === u[n]++ && (y[d++] = n);
			}
			if (n < a - 1) {
				const n = c[t + 1];
				-1 !== n && n !== l && 0 === u[n]++ && (y[d++] = n);
			}
			if (t >= a) {
				const n = c[t - a];
				-1 !== n && n !== l && 0 === u[n]++ && (y[d++] = n);
			}
			if (t < h - a) {
				const n = c[t + a];
				-1 !== n && n !== l && 0 === u[n]++ && (y[d++] = n);
			}
		}
		let p = -1, M = 0;
		for (let r = 0; r < d; r++) {
			const t = y[r], n = u[t];
			u[t] = 0, (n > M || n === M && t < p) && (M = n, p = t);
		}
		if (f) return !1;
		if (-1 === p) return !1;
		if (i && function(t, n, e, r) {
			const o = 3 * n, i = 3 * e;
			return s(t[o], t[o + 1], t[o + 2], t[i], t[i + 1], t[i + 2]) >= r;
		}(i, l, p, r)) return !1;
		for (let r = n; r < e; r++) c[g[r]] = p;
		return !0;
	}, S = (t, n) => {
		if (0 !== d[t] || -1 === c[t]) return;
		const e = v(t, !0);
		e >= 0 && M[e] > n && F(e);
	}, P = Math.max(4096, h >> 3);
	let C = new Int32Array(Math.min(1024, P)), U = 0, L = !0;
	const $ = (t) => {
		if (L) return;
		const n = m[t], e = x[t];
		if (U + e > P) L = !0;
		else {
			for (; U + e > C.length;) C = rn(C);
			for (let t = n; t < n + e; t++) C[U++] = g[t];
		}
	};
	for (let s = 0; s < 8; s++) {
		d.fill(0), b = 0, A = 0, k = 0;
		const t = !L;
		if (t) for (let e = 0; e < U; e++) {
			const t = C[e], n = t - (t / a | 0) * a;
			0 === d[t] && -1 !== c[t] && F(v(t, !0)), n > 0 && 0 === d[t - 1] && -1 !== c[t - 1] && F(v(t - 1, !0)), n < a - 1 && 0 === d[t + 1] && -1 !== c[t + 1] && F(v(t + 1, !0)), t >= a && 0 === d[t - a] && -1 !== c[t - a] && F(v(t - a, !0)), t < h - a && 0 === d[t + a] && -1 !== c[t + a] && F(v(t + a, !0));
		}
		else for (let e = 0; e < h; e++) 0 === d[e] && -1 !== c[e] && v(e, !1);
		U = 0, L = !1;
		let n = !1;
		if (t) for (let e = I(); e >= 0; e = I()) {
			if (!N(e)) continue;
			n = !0, $(e);
			const t = M[e], r = m[e], o = r + x[e];
			for (let n = r; n < o; n++) {
				const e = g[n], r = e - (e / a | 0) * a;
				r > 0 && S(e - 1, t), r < a - 1 && S(e + 1, t), e >= a && S(e - a, t), e < h - a && S(e + a, t);
			}
		}
		else for (let e = 0; e < b; e++) N(e) && (n = !0, $(e));
		if (!n) break;
	}
	return t;
}
function rn(t) {
	const n = new Int32Array(2 * t.length);
	return n.set(t), n;
}
function on(t, n) {
	if (n < 0) return 0;
	const { width: e, height: r, data: o } = t, s = e * r, i = new Int32Array(s);
	let a = 0;
	const l = (t) => {
		o[t] === n && (o[t] = -1, i[a++] = t);
	};
	for (let h = 0; h < e; h++) l(h), l((r - 1) * e + h);
	for (let h = 0; h < r; h++) l(h * e), l(h * e + (e - 1));
	let c = 0;
	for (; a > 0;) {
		const t = i[--a];
		c++;
		const n = t - (t / e | 0) * e;
		n > 0 && l(t - 1), n < e - 1 && l(t + 1), t >= e && l(t - e), t < s - e && l(t + e);
	}
	return c;
}
function sn(t) {
	const { width: n, height: e, data: r } = t, o = n * e, s = new Uint8Array(o), i = new Int32Array(o), a = new Int32Array(o), l = [];
	for (let c = 0; c < o; c++) {
		if (1 === s[c] || r[c] < 0) continue;
		const t = r[c];
		let e = 0, h = 0;
		i[e++] = c, s[c] = 1;
		let f = !0, u = -2;
		for (; e > 0;) {
			const l = i[--e];
			a[h++] = l;
			const c = l - (l / n | 0) * n;
			if (0 === c) f = !1;
			else {
				const n = l - 1;
				r[n] === t ? 0 === s[n] && (s[n] = 1, i[e++] = n) : r[n] < 0 ? f = !1 : -2 === u ? u = r[n] : u !== r[n] && (f = !1);
			}
			if (c === n - 1) f = !1;
			else {
				const n = l + 1;
				r[n] === t ? 0 === s[n] && (s[n] = 1, i[e++] = n) : r[n] < 0 ? f = !1 : -2 === u ? u = r[n] : u !== r[n] && (f = !1);
			}
			if (l < n) f = !1;
			else {
				const o = l - n;
				r[o] === t ? 0 === s[o] && (s[o] = 1, i[e++] = o) : r[o] < 0 ? f = !1 : -2 === u ? u = r[o] : u !== r[o] && (f = !1);
			}
			if (l >= o - n) f = !1;
			else {
				const o = l + n;
				r[o] === t ? 0 === s[o] && (s[o] = 1, i[e++] = o) : r[o] < 0 ? f = !1 : -2 === u ? u = r[o] : u !== r[o] && (f = !1);
			}
		}
		f && u >= 0 && l.push({
			label: t,
			surround: u,
			pixels: a.slice(0, h)
		});
	}
	return l;
}
function an(t) {
	const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(o);
	for (let i = 0; i < o; i++) s[i] = 0 !== r[i] ? 1e9 : 0;
	for (let i = 0; i < e; i++) for (let t = 0; t < n; t++) {
		const e = i * n + t;
		let r = s[e];
		0 !== r && (t > 0 && s[e - 1] + 3 < r && (r = s[e - 1] + 3), i > 0 && (s[e - n] + 3 < r && (r = s[e - n] + 3), t > 0 && s[e - n - 1] + 4 < r && (r = s[e - n - 1] + 4), t < n - 1 && s[e - n + 1] + 4 < r && (r = s[e - n + 1] + 4)), s[e] = r);
	}
	for (let i = e - 1; i >= 0; i--) for (let t = n - 1; t >= 0; t--) {
		const r = i * n + t;
		let o = s[r];
		0 !== o && (t < n - 1 && s[r + 1] + 3 < o && (o = s[r + 1] + 3), i < e - 1 && (s[r + n] + 3 < o && (o = s[r + n] + 3), t < n - 1 && s[r + n + 1] + 4 < o && (o = s[r + n + 1] + 4), t > 0 && s[r + n - 1] + 4 < o && (o = s[r + n - 1] + 4)), s[r] = o);
	}
	for (let i = 0; i < o; i++) s[i] /= 3;
	return s;
}
const ln = Math.fround, cn = /* @__PURE__ */ new Float32Array(1), hn = new Uint32Array(cn.buffer);
var fn = class {
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
			hn[0] = this.base + r << 15;
			const n = cn[0];
			this.start[r] = n, this.inv[r] = 1 / n, this.at[r] = Math.pow(n, t);
		}
		this.c1 = t, this.c2 = this.c1 * (t - 1) / 2, this.c3 = this.c2 * (t - 2) / 3, this.c4 = this.c3 * (t - 3) / 4, this.c5 = this.c4 * (t - 4) / 5;
	}
	of(t) {
		cn[0] = t;
		const n = (hn[0] >>> 15) - this.base;
		if (n >= 0 && n < this.size) {
			const e = (t - this.start[n]) * this.inv[n], r = this.at[n] * (1 + e * (this.c1 + e * (this.c2 + e * (this.c3 + e * (this.c4 + e * this.c5))))), o = ln(.9999999999999 * r);
			if (o === ln(1.0000000000001 * r)) return o;
		}
		return ln(Math.pow(t, this.a));
	}
};
const un = ["linearRgb", "srgb"], yn = Math.fround, dn = yn(.04045), pn = yn(.0031308), gn = yn(12.92), mn = yn(.055), xn = yn(1.055), Mn = yn(2.4), wn = yn(1 / Mn), bn = new fn(Mn, -4, 1), An = new fn(wn, -9, 1);
function kn(t) {
	const n = Math.round(255 * t);
	return n > 0 && n <= 255 && Fn[n] === t ? In[n] : vn(t);
}
function vn(t) {
	return t <= dn ? yn(t / gn) : bn.of(yn(yn(t + mn) / xn));
}
const Fn = Float64Array.from({ length: 256 }, (t, n) => yn(n / 255)), In = Fn.map(vn);
function Nn(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function Sn(t) {
	return n = yn(Nn(t, 0, 1)), yn(n <= pn ? n * gn : yn(xn * An.of(n)) - mn);
	var n;
}
function Pn(t, n) {
	return "linearRgb" === n ? function(t) {
		return [
			Sn(t[0]),
			Sn(t[1]),
			Sn(t[2])
		];
	}(t) : [
		yn(Nn(t[0], 0, 1)),
		yn(Nn(t[1], 0, 1)),
		yn(Nn(t[2], 0, 1))
	];
}
function Cn(t) {
	return "flat" !== t.kind;
}
function Un(t, n, e, r) {
	const o = r[0] - e[0], s = r[1] - e[1], i = o * o + s * s;
	return i <= 0 ? 0 : Nn(((t - e[0]) * o + (n - e[1]) * s) / i, 0, 1);
}
function Ln(t, n, e, r, o, s, i) {
	if (r <= 0) return 0;
	const a = t - e[0], l = n - e[1];
	let c;
	if (1 === o) c = Math.sqrt(a * a + l * l);
	else {
		const t = a * i + l * s, n = (-a * s + l * i) * o;
		c = Math.sqrt(t * t + n * n);
	}
	return Nn(c / r, 0, 1);
}
var $n = class {
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
				for (let t = 0; t < this.stops.length; t++) this.lin[t] = kn(this.stops[t]);
			} else this.lin = /* @__PURE__ */ new Float64Array(0);
			"radial" === t.kind && 1 !== t.aspect && (n = Math.sin(t.angle), e = Math.cos(t.angle));
		}
		this.sn = n, this.cs = e;
	}
	tAt(t, n) {
		const e = this.model;
		return "flat" === e.kind ? 0 : "linear" === e.kind ? Un(t, n, e.p0, e.p1) : Ln(t, n, e.c, e.r, e.aspect, this.sn, this.cs);
	}
	colorAt(t, n, e, r) {
		const o = this.model;
		if ("flat" === o.kind) return e[r] = this.stops[0], e[r + 1] = this.stops[1], void (e[r + 2] = this.stops[2]);
		const s = "linear" === o.kind ? Un(t, n, o.p0, o.p1) : Ln(t, n, o.c, o.r, o.aspect, this.sn, this.cs);
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
		const a = 3 * s;
		if ("linearRgb" === this.model.interp) {
			const t = this.lin;
			n[e] = Sn(t[a] + (t[a + 3] - t[a]) * i), n[e + 1] = Sn(t[a + 1] + (t[a + 4] - t[a + 1]) * i), n[e + 2] = Sn(t[a + 2] + (t[a + 5] - t[a + 2]) * i);
		} else {
			const t = yn(i);
			n[e] = yn(r[a] + yn(yn(r[a + 3] - r[a]) * t)), n[e + 1] = yn(r[a + 1] + yn(yn(r[a + 4] - r[a + 1]) * t)), n[e + 2] = yn(r[a + 2] + yn(yn(r[a + 5] - r[a + 2]) * t));
		}
	}
};
function qn(t) {
	if ("flat" === t.kind) return t.color;
	const { c0: n, c1: e } = t;
	return [
		yn(yn(.5) * yn(n[0] + e[0])),
		yn(yn(.5) * yn(n[1] + e[1])),
		yn(yn(.5) * yn(n[2] + e[2]))
	];
}
function Rn(t, n, e, r) {
	return "flat" === t.kind ? t : {
		...t,
		c0: n,
		mids: e,
		c1: r
	};
}
function zn(t, n) {
	return {
		model: {
			kind: "flat",
			color: [
				yn(t[0]),
				yn(t[1]),
				yn(t[2])
			]
		},
		chi2: 0,
		params: 3,
		cost: 3 * n
	};
}
function Tn(t) {
	return En(t, -.5);
}
function En(t, n) {
	return "flat" === t.kind ? t : "linear" === t.kind ? {
		...t,
		p0: [t.p0[0] + n, t.p0[1] + n],
		p1: [t.p1[0] + n, t.p1[1] + n]
	} : {
		...t,
		c: [t.c[0] + n, t.c[1] + n]
	};
}
const jn = 4096;
function Bn(t) {
	return Math.max(Math.floor(t / jn), 1);
}
function On(t, n, e, r) {
	const o = t % n, s = (t - o) / n;
	return o > 0 && o + 1 < n && s > 0 && s + 1 < e && r(t - 1) && r(t + 1) && r(t - n) && r(t + n);
}
function Kn(t, n, e, r) {
	let o = 0;
	for (let s = 0; s < t.length; s++) On(t[s], n, e, r) && o++;
	return o;
}
function Dn(t, n, e, r, o, s, i) {
	const a = new Int32Array(r.length);
	let l = 0;
	for (let y = 0; y < r.length; y++) {
		const t = r[y];
		(null === s || s(t)) && (i && !On(t, n, e, o) || (a[l++] = t));
	}
	const c = function(t) {
		const n = t.length;
		let e = [0];
		for (let s = 1; s < n; s++) if (t[s] < t[s - 1] && (e.push(s), e.length > Hn)) return t.toSorted();
		let r = t.slice();
		if (1 === e.length) return r;
		let o = new Int32Array(n);
		for (; e.length > 1;) {
			const t = [];
			for (let i = 0; i < e.length; i += 2) {
				const s = e[i], a = i + 1 < e.length ? e[i + 1] : n, l = i + 2 < e.length ? e[i + 2] : n;
				let c = s, h = a, f = s;
				for (; c < a && h < l;) o[f++] = r[c] <= r[h] ? r[c++] : r[h++];
				for (; c < a;) o[f++] = r[c++];
				for (; h < l;) o[f++] = r[h++];
				t.push(s);
			}
			e = t;
			const s = r;
			r = o, o = s;
		}
		return r;
	}(a.subarray(0, l)), h = new Float64Array(l), f = new Float64Array(l), u = new Float32Array(3 * l);
	for (let y = 0; y < l; y++) {
		const e = c[y], r = e % n;
		h[y] = r, f[y] = (e - r) / n, u[3 * y] = t[3 * e], u[3 * y + 1] = t[3 * e + 1], u[3 * y + 2] = t[3 * e + 2];
	}
	return new Xn(c, h, f, u);
}
const Hn = 64;
var Xn = class {
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
			for (let n = 0; n < t.length; n++) t[n] = kn(this.srgb[n]);
			this.linear = t;
		}
		return this.linear;
	}
	get srgbWide() {
		return this.wide ??= Float64Array.from(this.srgb), this.wide;
	}
};
function Wn(t, n) {
	let e = 0, r = t.n - 1;
	const o = t.px;
	for (; e <= r;) {
		const t = e + r >>> 1, s = o[t];
		if (s === n) return t;
		s < n ? e = t + 1 : r = t - 1;
	}
	return -1;
}
function Gn(t) {
	const n = Math.max(t.n, 1);
	let e = 0, r = 0;
	for (let o = 0; o < t.n; o++) e += t.x[o];
	for (let o = 0; o < t.n; o++) r += t.y[o];
	return [e / n, r / n];
}
function Zn(t, n) {
	return "linearRgb" === n ? t.lin : t.srgbWide;
}
function Qn(t, n) {
	const e = Math.max(n, 1);
	let r = 0, o = 0, s = 0;
	for (let i = 0; i < n; i++) r += t[3 * i], o += t[3 * i + 1], s += t[3 * i + 2];
	return [
		r / e,
		o / e,
		s / e
	];
}
const Yn = Math.PI / 180;
function _n(t, n) {
	return t > n || Number.isNaN(n) ? t : n;
}
function Vn(t, n) {
	return t < n || Number.isNaN(n) ? t : n;
}
function Jn(t, n, e) {
	let r = 0;
	for (let b = 0; b < e; b++) r += n[b];
	const o = r / e, s = Qn(t, e), [i, a, l] = s;
	let c = 0, h = 0, f = 0, u = 0, y = 0, d = 0, p = 0;
	for (let b = 0; b < e; b++) {
		const e = n[b] - o;
		c += e * e;
		const r = t[3 * b] - i, s = t[3 * b + 1] - a, g = t[3 * b + 2] - l;
		h += e * r, y += r * r, f += e * s, d += s * s, u += e * g, p += g * g;
	}
	const g = [
		h,
		f,
		u
	], m = [
		y,
		d,
		p
	], x = [
		0,
		0,
		0
	], M = [
		0,
		0,
		0
	];
	let w = 0;
	for (let b = 0; b < 3; b++) M[b] = c > 1e-12 ? g[b] / c : 0, x[b] = s[b] - M[b] * o, w += _n(m[b] - M[b] * M[b] * c, 0);
	return {
		resid: w,
		a: x,
		g: M
	};
}
var te = class {
	xs;
	ys;
	cols;
	cbar;
	scc;
	t;
	constructor(t, n, e) {
		const r = n.length;
		this.cols = e, this.cbar = Qn(e, r);
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
		for (let a = 0; a < s.length; a++) {
			const l = this.xs[a] - t, c = this.ys[a] - n, h = l * r + c * e, f = (-l * e + c * r) * o;
			s[a] = Math.sqrt(h * h + f * f), i += s[a];
		}
		return this.finish(i);
	}
	ellipticT(t, n, e, r, o) {
		const s = this.t;
		for (let i = 0; i < s.length; i++) {
			const a = this.xs[i] - t, l = this.ys[i] - n, c = a * r + l * e, h = (-a * e + l * r) * o;
			s[i] = Math.sqrt(c * c + h * h);
		}
	}
	finish(t) {
		const n = this.t, e = n.length, r = t / e;
		let o = 0, s = 0, i = 0, a = 0;
		const l = this.cols, [c, h, f] = this.cbar;
		for (let d = 0; d < e; d++) {
			const t = n[d] - r;
			o += t * t, s += t * (l[3 * d] - c), i += t * (l[3 * d + 1] - h), a += t * (l[3 * d + 2] - f);
		}
		const u = [
			s,
			i,
			a
		];
		let y = 0;
		for (let d = 0; d < 3; d++) {
			const t = o > 1e-12 ? u[d] / o : 0;
			y += _n(this.scc[d] - t * t * o, 0);
		}
		return y;
	}
	finishSpline() {
		const t = this.scc[0] + this.scc[1] + this.scc[2], n = this.t;
		let e = Number.MAX_VALUE, r = -Number.MAX_VALUE;
		for (let p = 0; p < n.length; p++) e = Vn(e, n[p]), r = _n(r, n[p]);
		if (r - e <= 1e-9) return t;
		const o = (r - e) / 7, s = 7 - 1e-12, i = /* @__PURE__ */ new Float64Array(8), a = /* @__PURE__ */ new Float64Array(8), l = /* @__PURE__ */ new Float64Array(24), c = this.cols;
		for (let p = 0; p < n.length; p++) {
			const t = Vn((n[p] - e) / o, s), r = t > 0 ? Math.floor(t) : 0, h = t - r, f = 1 - h, u = h;
			i[r] += f * f, i[r + 1] += u * u, a[r] += f * u;
			for (let n = 0; n < 3; n++) {
				const t = c[3 * p + n] - this.cbar[n];
				l[3 * r + n] += f * t, l[3 * (r + 1) + n] += u * t;
			}
		}
		for (let p = 0; p < 8; p++) i[p] += 1e-9;
		const h = /* @__PURE__ */ new Float64Array(8), f = /* @__PURE__ */ new Float64Array(8);
		f[0] = i[0], h[0] = a[0] / f[0];
		for (let p = 1; p < 8; p++) f[p] = i[p] - a[p - 1] * h[p - 1], h[p] = p + 1 < 8 ? a[p] / f[p] : 0;
		let u = 0;
		const y = /* @__PURE__ */ new Float64Array(8), d = /* @__PURE__ */ new Float64Array(8);
		for (let p = 0; p < 3; p++) {
			y[0] = l[p] / f[0];
			for (let t = 1; t < 8; t++) y[t] = (l[3 * t + p] - a[t - 1] * y[t - 1]) / f[t];
			d[7] = y[7];
			for (let t = 6; t >= 0; t--) d[t] = y[t] - h[t] * d[t + 1];
			for (let t = 0; t < 8; t++) u += d[t] * l[3 * t + p];
		}
		return _n(t - u, 0);
	}
};
function ne(t, n) {
	const [e, r, o] = Qn(t, n);
	let s = 0, i = 0, a = 0, l = 0, c = 0, h = 0;
	for (let d = 0; d < n; d++) {
		const n = t[3 * d] - e, f = t[3 * d + 1] - r, u = t[3 * d + 2] - o;
		s += n * n, i += n * f, a += n * u, l += f * f, c += f * u, h += u * u;
	}
	const f = [
		[
			s,
			i,
			a
		],
		[
			i,
			l,
			c
		],
		[
			a,
			c,
			h
		]
	];
	if (f[0][0] + f[1][1] + f[2][2] <= 1e-12) return null;
	const u = 1 / Math.sqrt(3);
	let y = [
		u,
		u,
		u
	];
	for (let d = 0; d < 30; d++) {
		const t = [
			0,
			0,
			0
		];
		for (let e = 0; e < 3; e++) for (let n = 0; n < 3; n++) t[e] += f[e][n] * y[n];
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
function ee(t, n, e) {
	const r = t.n;
	let o = 0, s = 0, i = 0, a = 0, l = 0;
	const c = Bn(r);
	for (let u = 0; u < r; u += c) {
		const r = t.px[u];
		if (r % e === 0 || r < e) continue;
		const c = Wn(t, r - 1), h = Wn(t, r + 1), f = Wn(t, r - e), y = Wn(t, r + e);
		if (c < 0 || h < 0 || f < 0 || y < 0) continue;
		const d = .5 * (n[h] - n[c]), p = .5 * (n[y] - n[f]), g = Math.sqrt(d * d + p * p);
		if (g <= 1e-9) continue;
		const m = -p / g, x = d / g, M = m * t.x[u] + x * t.y[u];
		o += g * m * m, s += g * m * x, i += g * x * x, a += g * m * M, l += g * x * M;
	}
	const h = o * i - s * s, f = o + i;
	return h > f * f * 1e-9 ? [(i * a - s * l) / h, (o * l - s * a) / h] : null;
}
function re(t) {
	let n = Number.MAX_VALUE, e = -Number.MAX_VALUE, r = Number.MAX_VALUE, o = -Number.MAX_VALUE;
	for (let s = 0; s < t.n; s++) n = Vn(n, t.x[s]);
	for (let s = 0; s < t.n; s++) e = _n(e, t.x[s]);
	for (let s = 0; s < t.n; s++) r = Vn(r, t.y[s]);
	for (let s = 0; s < t.n; s++) o = _n(o, t.y[s]);
	return {
		xmin: n,
		xmax: e,
		ymin: r,
		ymax: o,
		bw: _n(e - n, 4),
		bh: _n(o - r, 4)
	};
}
function oe(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function se(t, n, e) {
	return [oe(n, t.xmin - t.bw, t.xmax + t.bw), oe(e, t.ymin - t.bh, t.ymax + t.bh)];
}
function ie(t, n) {
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
function ae(t, n, e) {
	const r = new Float64Array(n);
	for (let o = 0; o < n; o++) r[o] = t[3 * o] * e[0] + t[3 * o + 1] * e[1] + t[3 * o + 2] * e[2];
	return r;
}
const le = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1]
];
function ce(t, n, e, r, o, s) {
	const i = new Float64Array(t.n);
	let a = -Number.MAX_VALUE;
	for (let l = 0; l < t.n; l++) {
		const c = t.x[l] - n, h = t.y[l] - e;
		if (1 === r) i[l] = Math.sqrt(c * c + h * h);
		else {
			const t = c * s + h * o, n = (-c * o + h * s) * r;
			i[l] = Math.sqrt(t * t + n * n);
		}
		a = _n(a, i[l]);
	}
	return {
		rho: i,
		r: a
	};
}
function he(t, n, e, r, o, s, i, a) {
	const { a: l, g: c } = Jn(t, o, n);
	return {
		kind: "radial",
		c: [r[0], r[1]],
		r: s,
		c0: Pn(l, e),
		c1: Pn([
			l[0] + c[0] * s,
			l[1] + c[1] * s,
			l[2] + c[2] * s
		], e),
		interp: e,
		aspect: i,
		angle: a,
		mids: []
	};
}
function fe(t, n, e, r) {
	if ("radial" !== r.kind) return null;
	const { c: o, aspect: s, angle: i } = r, a = 1 === s ? 0 : Math.sin(i), l = 1 === s ? 1 : Math.cos(i), { rho: c, r: h } = ce(t, o[0], o[1], s, a, l);
	return h < .5 ? null : he(n, t.n, e, o, c, h, s, i);
}
const ue = [
	.01,
	.01,
	.001,
	.001
];
function ye(t) {
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
function de(t, n, e) {
	const r = 7 - 1e-12, o = (t - n) / e;
	return o < r ? o : r;
}
function pe(t) {
	return t > 0 ? Math.floor(t) : 0;
}
function ge(t, n) {
	const e = /* @__PURE__ */ new Float64Array(8);
	e[0] = n[0] / t.m[0];
	for (let o = 1; o < 8; o++) e[o] = (n[o] - t.e[o - 1] * e[o - 1]) / t.m[o];
	const r = /* @__PURE__ */ new Float64Array(8);
	r[7] = e[7];
	for (let o = 6; o >= 0; o--) r[o] = e[o] - t.cp[o] * r[o + 1];
	return r;
}
function me(t, n) {
	return !!Number.isNaN(t) || !Number.isNaN(n) && t >= n;
}
function xe(t, n, e) {
	const r = t.map((t) => t.slice()), o = n.slice();
	let s = 0;
	for (let a = 0; a < e; a++) s = _n(s, Math.abs(r[a][a]));
	if (s <= 0 || !Number.isFinite(s)) return null;
	for (let a = 0; a < e; a++) {
		let t = a;
		for (let o = a + 1; o < e; o++) me(Math.abs(r[o][a]), Math.abs(r[t][a])) && (t = o);
		if (Math.abs(r[t][a]) <= 1e-14 * s) return null;
		const n = r[a];
		r[a] = r[t], r[t] = n;
		const i = o[a];
		o[a] = o[t], o[t] = i;
		for (let s = a + 1; s < e; s++) {
			const t = r[s][a] / r[a][a];
			for (let n = a; n < e; n++) r[s][n] -= t * r[a][n];
			o[s] -= t * o[a];
		}
	}
	const i = [
		0,
		0,
		0,
		0
	];
	for (let a = e - 1; a >= 0; a--) {
		let t = o[a];
		for (let n = a + 1; n < e; n++) t -= r[a][n] * i[n];
		i[a] = t / r[a][a];
	}
	for (let a = 0; a < e; a++) if (!Number.isFinite(i[a])) return null;
	return i;
}
function Me(t, n) {
	return t.ellipticT(n[0], n[1], Math.sin(n[2]), Math.cos(n[2]), Math.exp(n[3])), t.finishSpline();
}
function we(t, n, e, r, o, s, i, a) {
	const l = t.xs[n] - e[0], c = t.ys[n] - e[1], h = l * o + c * r, f = (-l * r + c * o) * s, u = Math.sqrt(h * h + f * f);
	u <= 1e-12 ? a.fill(0) : (a[0] = i > 0 ? (-h * o + f * s * r) / u : 0, a[1] = i > 1 ? (-h * r - f * s * o) / u : 0, a[2] = i > 2 ? h * f * (1 / s - s) / u : 0, a[3] = i > 3 ? f * f / u : 0);
}
function be(t, n, e) {
	const r = function(t) {
		const n = t.t;
		let e = Number.MAX_VALUE, r = 0, o = -Number.MAX_VALUE, s = 0;
		for (let p = 0; p < n.length; p++) n[p] < e && (e = n[p], r = p), n[p] > o && (o = n[p], s = p);
		if (o - e <= 1e-9) return null;
		const i = (o - e) / 7, a = /* @__PURE__ */ new Float64Array(8), l = /* @__PURE__ */ new Float64Array(8), c = /* @__PURE__ */ new Float64Array(24), h = t.cols;
		for (let p = 0; p < n.length; p++) {
			const r = de(n[p], e, i), o = pe(r), s = r - o, f = 1 - s, u = s;
			a[o] += f * f, a[o + 1] += u * u, l[o] += f * u;
			for (let n = 0; n < 3; n++) {
				const e = h[3 * p + n] - t.cbar[n];
				c[3 * o + n] += f * e, c[3 * (o + 1) + n] += u * e;
			}
		}
		const f = /* @__PURE__ */ new Float64Array(8), u = /* @__PURE__ */ new Float64Array(8);
		f[0] = a[0] + 1e-9, u[0] = l[0] / f[0];
		for (let p = 1; p < 8; p++) f[p] = a[p] + 1e-9 - l[p - 1] * u[p - 1], u[p] = p + 1 < 8 ? l[p] / f[p] : 0;
		const y = {
			lo: e,
			loAt: r,
			hi: o,
			hiAt: s,
			h: i,
			x: /* @__PURE__ */ new Float64Array(24),
			m: f,
			cp: u,
			e: l
		}, d = /* @__PURE__ */ new Float64Array(8);
		for (let p = 0; p < 3; p++) {
			for (let n = 0; n < 8; n++) d[n] = c[3 * n + p];
			const t = ge(y, d);
			for (let n = 0; n < 8; n++) y.x[3 * n + p] = t[n];
		}
		return y;
	}(t);
	if (null === r) return null;
	const o = Math.sin(n[2]), s = Math.cos(n[2]), i = Math.exp(n[3]), a = [
		0,
		0,
		0,
		0
	], l = [
		0,
		0,
		0,
		0
	], c = [
		0,
		0,
		0,
		0
	];
	we(t, r.loAt, n, o, s, i, e, a), we(t, r.hiAt, n, o, s, i, e, l);
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
	], f = [
		0,
		0,
		0,
		0
	], u = /* @__PURE__ */ new Float64Array(96), y = [
		0,
		0,
		0,
		0
	], d = t.t, p = t.cols, g = r.x;
	for (let m = 0; m < d.length; m++) {
		const x = de(d[m], r.lo, r.h), M = pe(x), w = x - M;
		we(t, m, n, o, s, i, e, c);
		for (let t = 0; t < 4; t++) y[t] = (c[t] - a[t] - x * (l[t] - a[t]) / 7) / r.h;
		for (let n = 0; n < 3; n++) {
			const r = g[3 * M + n], o = g[3 * (M + 1) + n], s = o - r, i = (1 - w) * r + w * o, a = p[3 * m + n] - t.cbar[n] - i;
			for (let t = 0; t < e; t++) {
				const e = s * y[t];
				f[t] += e * a;
				const r = 8 * (4 * n + t);
				u[r + M] += (1 - w) * e, u[r + M + 1] += w * e;
				for (let n = 0; n <= t; n++) h[t][n] += e * s * y[n];
			}
		}
	}
	for (let m = 0; m < 3; m++) {
		const t = [];
		for (let n = 0; n < e; n++) t.push(ge(r, u.subarray(8 * (4 * m + n), 8 * (4 * m + n + 1))));
		for (let n = 0; n < e; n++) for (let e = 0; e <= n; e++) {
			let r = 0;
			const o = 8 * (4 * m + n);
			for (let n = 0; n < 8; n++) r += u[o + n] * t[e][n];
			h[n][e] -= r;
		}
	}
	for (let m = 0; m < e; m++) for (let t = m + 1; t < e; t++) h[m][t] = h[t][m];
	return {
		a: h,
		b: f
	};
}
function Ae(t, n, e, r) {
	let o = r(n), s = Me(t, o), i = 1, a = .001;
	for (; i < 60;) {
		const n = be(t, o, e);
		if (null === n) break;
		const { a: l, b: c } = n;
		let h = 0;
		for (let t = 0; t < e; t++) h = _n(h, l[t][t]);
		const f = 1e-12 * h;
		let u = !1;
		for (; i < 60 && a <= 1e10;) {
			const n = l.map((t) => t.slice());
			for (let t = 0; t < e; t++) n[t][t] += a * (l[t][t] + f);
			const h = xe(n, c, e);
			if (null === h) {
				a *= 4;
				continue;
			}
			const y = o.slice();
			for (let t = 0; t < e; t++) y[t] += h[t];
			const d = r(y), p = Me(t, d);
			if (i++, p < s) {
				const t = s - p;
				let n = 0;
				for (let r = 0; r < e; r++) n = _n(n, Math.abs(d[r] - o[r]) / ue[r]);
				if (o = d, s = p, a = Math.max(.3 * a, 1e-12), u = !0, t <= 1e-9 * Math.max(s, 22250738585072014e-324) || n < 1) return {
					g: o,
					score: s
				};
				break;
			}
			a *= 4;
		}
		if (!u) break;
	}
	return {
		g: o,
		score: s
	};
}
const ke = .5 / 255, ve = Math.fround, Fe = 34028234663852886e22;
var Ie = class {
	p;
	m;
	stride;
	constructor(t, n) {
		const e = Bn(n.n), r = n.n > 0 ? Math.ceil(n.n / e) : 0, o = new Float32Array(3 * r), s = new $n(t);
		for (let i = 0; i < r; i++) s.colorAt(n.x[i * e], n.y[i * e], o, 3 * i);
		this.p = o, this.m = r, this.stride = e;
	}
	chi2(t, n) {
		const e = 1 / (n * n), r = this.p;
		let o = 0;
		for (let s = 0; s < this.m; s++) {
			const n = 3 * s * this.stride;
			for (let e = 0; e < 3; e++) {
				const i = Math.max(Math.abs(ve(t.srgb[n + e] - r[3 * s + e])) - ke, 0);
				o += i * i;
			}
		}
		return 0 === this.m ? 0 : o * e * (t.n / this.m);
	}
	support(t, n) {
		const e = ve(.25 * n), r = ve(e * e), o = this.p;
		let s = 0;
		for (let i = 0; i < this.m; i++) {
			const n = ve(o[3 * i] - t[0]), e = ve(o[3 * i + 1] - t[1]), a = ve(o[3 * i + 2] - t[2]);
			ve(ve(ve(n * n) + ve(e * e)) + ve(a * a)) > r && s++;
		}
		return 0 === this.m ? 0 : s / this.m;
	}
	contrast() {
		const t = [
			Fe,
			Fe,
			Fe
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
			const e = ve(n[o] - t[o]);
			e > r && (r = e);
		}
		return r;
	}
};
const Ne = 1e3;
function Se(t, n) {
	return !!Number.isNaN(t) || !Number.isNaN(n) && t >= n;
}
function Pe(t, n, e) {
	const r = t.map((t) => t.slice()), o = n.map((t) => t.slice());
	for (let i = 0; i < e; i++) {
		let t = i;
		for (let o = i + 1; o < e; o++) Se(Math.abs(r[o][i]), Math.abs(r[t][i])) && (t = o);
		if (Math.abs(r[t][i]) < 1e-12) return null;
		const n = r[i];
		r[i] = r[t], r[t] = n;
		const s = o[i];
		o[i] = o[t], o[t] = s;
		const a = r[i], l = o[i];
		for (let c = i + 1; c < e; c++) {
			const t = r[c][i] / a[i];
			if (0 !== t) {
				for (let n = i; n < e; n++) r[c][n] -= t * a[n];
				for (let n = 0; n < 3; n++) o[c][n] -= t * l[n];
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
function Ce(t) {
	const n = t * Ne, e = n > 0 ? Math.floor(n) : 0;
	return e < 1e3 ? e : Ne;
}
function Ue(t) {
	return Math.min(t, Ne) / Ne;
}
const Le = Float64Array.from({ length: 1002 }, (t, n) => Ue(n));
var $e = class {
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
		for (let a = 0; a < r; a++) {
			const t = e[a];
			o += t;
			for (let e = 0; e < 3; e++) s[e] += t * n[3 * a + e];
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
		for (let a = 0; a < r; a++) {
			const r = t[a], o = e[a], s = 10 * (Ce(r) + 1), l = n[3 * a] - this.mean[0], c = n[3 * a + 1] - this.mean[1], h = n[3 * a + 2] - this.mean[2];
			i[s] += o, i[s + 1] += o * r, i[s + 2] += o * r * r, i[s + 3] += o * l, i[s + 4] += o * c, i[s + 5] += o * h, i[s + 6] += o * r * l, i[s + 7] += o * r * c, i[s + 8] += o * r * h, i[s + 9] += o * (l * l + c * c + h * h);
		}
		for (let a = 10; a < i.length; a++) i[a] = i[a - 10] + i[a];
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
		for (let c = 0; c < n; c++) {
			for (let t = 0; t < n; t++) e[4 * c + t] = 0;
			r[3 * c] = 0, r[3 * c + 1] = 0, r[3 * c + 2] = 0;
		}
		for (let c = 0; c < n - 1; c++) {
			const n = 10 * t[c], s = 10 * t[c + 1], i = o[s] - o[n], a = o[s + 1] - o[n + 1], l = o[s + 2] - o[n + 2], h = Le[t[c]], f = Le[t[c + 1]], u = f - h, y = u * u;
			e[4 * c + c] += (f * f * i - 2 * f * a + l) / y;
			const d = ((h + f) * a - h * f * i - l) / y;
			e[4 * c + c + 1] += d, e[4 * (c + 1) + c] += d, e[4 * (c + 1) + c + 1] += (h * h * i - 2 * h * a + l) / y;
			for (let t = 0; t < 3; t++) {
				const e = o[s + 3 + t] - o[n + 3 + t], i = o[s + 6 + t] - o[n + 6 + t];
				r[3 * c + t] += (f * e - i) / u, r[3 * (c + 1) + t] += (i - h * e) / u;
			}
		}
		for (let c = 0; c < n; c++) e[4 * c + c] += 1e-9;
		const s = this.elimA, i = this.elimB;
		for (let c = 0; c < n; c++) {
			for (let t = 0; t < n; t++) s[4 * c + t] = e[4 * c + t];
			i[3 * c] = r[3 * c], i[3 * c + 1] = r[3 * c + 1], i[3 * c + 2] = r[3 * c + 2];
		}
		for (let c = 0; c < n; c++) {
			let t = c;
			for (let e = c + 1; e < n; e++) Se(Math.abs(s[4 * e + c]), Math.abs(s[4 * t + c])) && (t = e);
			if (Math.abs(s[4 * t + c]) < 1e-12) return NaN;
			if (t !== c) {
				for (let e = 0; e < n; e++) {
					const n = s[4 * c + e];
					s[4 * c + e] = s[4 * t + e], s[4 * t + e] = n;
				}
				for (let n = 0; n < 3; n++) {
					const e = i[3 * c + n];
					i[3 * c + n] = i[3 * t + n], i[3 * t + n] = e;
				}
			}
			for (let e = c + 1; e < n; e++) {
				const t = s[4 * e + c] / s[4 * c + c];
				if (0 !== t) {
					for (let r = c; r < n; r++) s[4 * e + r] -= t * s[4 * c + r];
					for (let n = 0; n < 3; n++) i[3 * e + n] -= t * i[3 * c + n];
				}
			}
		}
		const a = this.sol;
		for (let c = n - 1; c >= 0; c--) for (let t = 0; t < 3; t++) {
			let e = i[3 * c + t];
			for (let r = c + 1; r < n; r++) e -= s[4 * c + r] * a[3 * r + t];
			a[3 * c + t] = e / s[4 * c + c];
		}
		let l = 0;
		for (let c = 0; c < n; c++) l += a[3 * c] * r[3 * c] + a[3 * c + 1] * r[3 * c + 1] + a[3 * c + 2] * r[3 * c + 2];
		return o[10019] - l;
	}
	scan(t, n, e) {
		const r = t.toSorted((t, n) => t - n), o = this.coarse;
		let s = 0;
		for (let h = n;; h += 16) {
			const t = Math.min(h, e);
			if (o[s++] = this.price(r, t), t === e) break;
		}
		const i = (t) => t + 1 < s ? n + 16 * t : e, a = [];
		for (let h = 0; h < s; h++) {
			const t = o[h];
			t !== 1 / 0 && (h > 0 && o[h - 1] < t || h + 1 < s && o[h + 1] < t || a.push(h));
		}
		if (0 === a.length) return this.best(r, n, e, -1, 0);
		a.sort((t, n) => o[t] - o[n] || t - n);
		let l = -1, c = 0;
		for (let h = 0; h < s; h++) o[h] !== 1 / 0 && (l < 0 || o[h] < c) && (l = i(h), c = o[h]);
		for (let h = 0; h < Math.min(a.length, 3); h++) {
			const t = a[h], o = t > 0 ? i(t - 1) + 1 : n, f = t + 1 < s ? i(t + 1) - 1 : e;
			for (let n = o; n <= f; n++) {
				const t = this.price(r, n);
				(t < c || t === c && n < l) && (l = n, c = t);
			}
		}
		return this.answer(r, l);
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
function qe(t, n, e, r, o) {
	const s = e.map(Ue), i = s.length, a = new Float64Array(t.length);
	for (let l = 0; l < t.length; l++) {
		const e = t[l];
		let c = 0;
		for (; c < i && s[c] < e;) c++;
		c = Math.min(Math.max(c, 1), i - 1);
		const h = s[c - 1], f = s[c], u = f > h ? Math.min(Math.max((e - h) / (f - h), 0), 1) : 1;
		let y = 0;
		for (let t = 0; t < 3; t++) {
			const e = n[3 * l + t] - (r[c - 1][t] + (r[c][t] - r[c - 1][t]) * u);
			y += e * e;
		}
		const d = Math.sqrt(y);
		a[l] = d > o ? o / d : 1;
	}
	return a;
}
function Re(t, n) {
	if (t.length !== n.length) return !1;
	for (let e = 0; e < t.length; e++) if (!Object.is(t[e], n[e])) return !1;
	return !0;
}
const ze = Math.fround;
function Te(t, n, e, r) {
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
	for (let l = 0; l < e.length; l++) {
		const r = n.j[l], a = n.u[l], c = e[l], h = 1 - a, f = a;
		o[r - 1] += c * h * h, s[r] += c * h * f, o[r] += c * f * f;
		for (let n = 0; n < 3; n++) i[r - 1][n] += c * h * t[3 * l + n], i[r][n] += c * f * t[3 * l + n];
	}
	const a = function() {
		const t = [];
		for (let n = 0; n < 4; n++) t.push([
			0,
			0,
			0,
			0
		]);
		return t;
	}();
	for (let l = 0; l < r; l++) a[l][l] = o[l] + 1e-9, l > 0 && (a[l][l - 1] = s[l]), l + 1 < r && (a[l][l + 1] = s[l + 1]);
	return {
		a,
		b: i
	};
}
function Ee(t, n, e, r, o) {
	let s = 0;
	for (let i = 0; i < 3; i++) {
		const a = t[3 * n + i] - (e[i] + (r[i] - e[i]) * o);
		s += a * a;
	}
	return Math.sqrt(s);
}
var je = class t {
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
	constructor(t, n, e, r, o, s, i, a, l) {
		this.s = t, this.idx = n, this.t = e, this.c = r, this.weight = o, this.delta = s, this.span = i, this.kLo = a, this.kHi = l;
	}
	static of(n, e, r, o, s) {
		const i = e.n, a = Bn(i), l = i > 0 ? Math.ceil(i / a) : 0;
		if (l < 64) return null;
		const c = new Int32Array(l);
		for (let t = 0; t < l; t++) c[t] = t * a;
		const h = new $n(n), f = new Float64Array(l), u = new Float64Array(3 * l), y = new Float64Array(l), d = [
			0,
			0,
			0
		];
		for (let t = 0; t < l; t++) {
			const n = c[t];
			f[t] = h.tAt(e.x[n], e.y[n]), u[3 * t] = r[3 * n], u[3 * t + 1] = r[3 * n + 1], u[3 * t + 2] = r[3 * n + 2], void 0 !== s ? (d[0] = s.p[3 * t], d[1] = s.p[3 * t + 1], d[2] = s.p[3 * t + 2]) : h.colorAt(e.x[n], e.y[n], d, 0);
			let i = 0;
			for (let t = 0; t < 3; t++) {
				const e = "linearRgb" === o ? kn(d[t]) : d[t], s = r[3 * n + t] - e;
				i += s * s;
			}
			y[t] = Math.sqrt(i);
		}
		const p = Math.max(4.4478 * Oe(y.slice(), l >> 1), 1 / 255), g = new Float64Array(l);
		for (let t = 0; t < l; t++) g[t] = y[t] > p ? p / y[t] : 1;
		const m = f.slice(), x = (t) => Oe(m, Math.round((l - 1) * t)), M = x(.02), w = x(.98), b = w - M;
		return b < .1 ? null : new t(e, c, f, u, g, p, b, M + .05 * b, w - .05 * b);
	}
	bestKnot(t) {
		const n = t.join(","), e = this.scanned.get(n);
		if (void 0 !== e) return e;
		const r = this.scanKnot(t);
		return this.scanned.set(n, r), r;
	}
	scanKnot(t) {
		const n = Ne, e = t.map((t) => Ke(Math.round(t * n))), r = Ke(Math.max(Math.ceil(this.kLo * n - 1e-9), 1)), o = Math.min(Ke(Math.floor(this.kHi * n + 1e-9)), 999);
		if (r > o) return null;
		const s = function(t, n, e, r, o, s, i) {
			let a = e, l = null;
			for (let c = 0; c < 3; c++) {
				const e = new $e(t, n, a).scan(o, s, i);
				if (null === e) break;
				if (l = e.j, c + 1 < 3) {
					const o = qe(t, n, e.nodes, e.x, r);
					if (Re(o, a)) break;
					a = o;
				}
			}
			return l;
		}(this.t, this.c, this.weight, this.delta, e, r, o);
		return null === s ? null : s / n;
	}
	cutsAMisfitSliver(t, n, e, r) {
		const o = this.s, s = n.indexOf(e), i = 0 === s ? -1 / 0 : n[s - 1], a = s + 1 < n.length ? n[s + 1] : 1 / 0, l = [[], []], c = new $n(t), h = [
			0,
			0,
			0
		];
		for (let p = 0; p < this.idx.length; p++) {
			const t = this.t[p];
			if (t < i || t > a) continue;
			const n = this.idx[p];
			void 0 !== r ? (h[0] = r.p[3 * p], h[1] = r.p[3 * p + 1], h[2] = r.p[3 * p + 2]) : c.colorAt(o.x[n], o.y[n], h, 0);
			const s = ze(h[0] - o.srgb[3 * n]), f = ze(h[1] - o.srgb[3 * n + 1]), u = ze(h[2] - o.srgb[3 * n + 2]);
			l[t >= e ? 1 : 0].push(ze(Math.sqrt(ze(ze(ze(s * s) + ze(f * f)) + ze(u * u)))));
		}
		const f = l[1].length < l[0].length ? 1 : 0, u = l[f].length < Math.floor(this.t.length / 10), y = Be(l[f]), d = Be(l[1 - f]);
		return u && y > 4 * Math.max(d, 1 / 255);
	}
};
function Be(t) {
	return 0 === t.length ? 0 : Oe(Float64Array.from(t), t.length >> 1);
}
function Oe(t, n) {
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
function Ke(t) {
	return t > 0 ? t : 0;
}
var De = class {
	model;
	space;
	p;
	knots = [];
	ended;
	constructor(t, n, e, r, o) {
		this.model = t, this.space = r, this.p = je.of(t, n, e, r, o), this.ended = null === this.p;
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
			], a = i.length, l = function(t, n) {
				const e = n.length, r = new Int32Array(t.length), o = new Float64Array(t.length);
				for (let s = 0; s < t.length; s++) {
					const i = t[s];
					let a = 0;
					for (; a < e && n[a] < i;) a++;
					a = Math.min(Math.max(a, 1), e - 1);
					const l = n[a - 1], c = n[a];
					r[s] = a, o[s] = c > l ? Math.min(Math.max((i - l) / (c - l), 0), 1) : 1;
				}
				return {
					j: r,
					u: o
				};
			}(n, i);
			let c = r, h = [];
			for (let u = 0; u <= s; u++) {
				if (u > 0) {
					c === r && (c = new Float64Array(r.length));
					for (let e = 0; e < n.length; e++) {
						const n = l.j[e], r = Ee(t, e, h[n - 1], h[n], l.u[e]);
						c[e] = r > o ? o / r : 1;
					}
				}
				const { a: e, b: s } = Te(t, l, c, a), i = Pe(e, s, a);
				if (null === i) return null;
				h = i;
			}
			let f = 0;
			for (let u = 0; u < n.length; u++) {
				const n = l.j[u], e = Ee(t, u, h[n - 1], h[n], l.u[u]);
				f += e > o ? o * (2 * e - o) : e * e;
			}
			return {
				objective: f,
				x: h
			};
		}(t.c, t.t, n, t.weight, t.delta, 2);
		if (null === r) return this.end();
		const o = r.x, s = o.length, i = this.space, a = n.map((t, n) => ({
			offset: t,
			color: Pn(o[n + 1], i)
		})), l = Rn(this.model, Pn(o[0], i), a, Pn(o[s - 1], i)), c = 2 === n.length ? n.slice() : [e], h = new Ie(l, t.s);
		return c.some((e) => t.cutsAMisfitSliver(l, n, e, h)) ? this.end() : {
			model: l,
			preds: h
		};
	}
	end() {
		return this.ended = !0, null;
	}
};
const He = {
	stopGeometries: 3,
	radialsPerSpace: !1
}, Xe = 1.5 / 255;
function We(t, n = 1) {
	const e = n * n;
	return .5 * e * Math.log(Math.max(t / e, 2));
}
function Ge(t, n, r, o, s, i = 16, a = He) {
	const l = o > 0 ? o : .5 / 255, c = (n, e) => {
		const r = e.chi2(t, l), o = function(t) {
			switch (t.kind) {
				case "flat": return 3;
				case "linear": return 10 + 4 * t.mids.length;
				case "radial": return (1 === t.aspect ? 9 : 11) + 4 * t.mids.length;
			}
		}(n);
		return {
			model: n,
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
		const e = Bn(n), r = Math.ceil(n / e), o = new Float32Array(r), s = [
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
	}(t), f = "flat" === h.kind ? h.color : [
		0,
		0,
		0
	], u = [c(h, new Ie(h, t))];
	if (!r || t.n < i) return u;
	if (u[0].cost <= 9 * s) return u;
	const y = Math.max(3 * l, Xe), d = (t, n) => {
		const r = n.contrast();
		return r >= y && n.support(f, r) >= .1 && !function(t) {
			if ("flat" === t.kind) return !1;
			const n = [
				t.c0,
				t.c1,
				...t.mids.map((t) => t.color)
			].map((t) => e(t[0], t[1], t[2]));
			for (let e = 0; e < n.length; e++) for (let t = e + 1; t < n.length; t++) {
				const r = n[e][0] - n[t][0], o = n[e][1] - n[t][1], s = n[e][2] - n[t][2];
				if (Math.sqrt(r * r + o * o + s * s) >= .02) return !1;
			}
			return !0;
		}(t);
	}, p = [];
	for (const { space: e, cols: A, cands: k } of function(t, n, e) {
		const r = (e, r) => {
			const o = function(t, n, e, r) {
				const o = t.n;
				if (o < 16) return null;
				const s = ne(n, o);
				if (null === s) return null;
				const i = ae(n, o, s), a = re(t);
				let l = ee(t, i, r) ?? Gn(t);
				l = se(a, l[0], l[1]);
				const c = ie(o, n), h = new te(t, c.idx, c.cols);
				let f = h.radial(l[0], l[1]), u = 4, y = 0;
				for (; u > .03 && y < 600;) {
					let t = !1;
					for (const [n, e] of le) {
						const r = se(a, l[0] + n * u, l[1] + e * u), o = h.radial(r[0], r[1]);
						if (y++, o < f - 1e-12) {
							f = o, l = r, t = !0;
							break;
						}
					}
					t || (u *= .5);
				}
				const { rho: d, r: p } = ce(t, l[0], l[1], 1, 0, 1);
				return p < .5 ? null : he(n, o, e, l, d, p, 1, 0);
			}(t, e, r, n), s = null === o ? null : function(t, n, e, r) {
				if ("radial" !== r.kind) return null;
				const o = t.n;
				if (o < 32) return null;
				const s = ie(o, n), i = new te(t, s.idx, s.cols), a = re(t), l = Math.log(8), c = (t) => {
					const [n, e] = se(a, t[0], t[1]);
					return [
						n,
						e,
						t[2],
						oe(t[3], 0, l)
					];
				}, h = (t) => i.elliptic(t[0], t[1], Math.sin(t[2]), Math.cos(t[2]), Math.exp(t[3]));
				let f = [
					r.c[0],
					r.c[1],
					0,
					0
				], u = h(f);
				for (let M = 0; M < 180; M += 15) for (const t of [Math.log(2), Math.log(3)]) {
					const n = c([
						f[0],
						f[1],
						M * Yn,
						t
					]), e = h(n);
					e < u - 1e-12 && (u = e, f = n);
				}
				const y = [
					1,
					1,
					10 * Yn,
					.25
				];
				let d = 4, p = 0;
				for (; d > .03 && p < 800;) {
					let t = !1;
					t: for (let n = 0; n < 4; n++) for (const e of [1, -1]) {
						const r = f.slice();
						r[n] += e * d * y[n];
						const o = c(r), s = h(o);
						if (p++, s < u - 1e-12) {
							u = s, f = o, t = !0;
							break t;
						}
					}
					t || (d *= .5);
				}
				const g = Math.exp(f[3]);
				if (g < 1.02) return null;
				const { rho: m, r: x } = ce(t, f[0], f[1], g, Math.sin(f[2]), Math.cos(f[2]));
				return x < .5 ? null : he(n, o, e, [f[0], f[1]], m, x, g, f[2]);
			}(t, e, r, o), i = [];
			for (const t of [o, s]) null !== t && i.push(t);
			return i;
		}, o = e ? [] : r(Zn(t, "linearRgb"), "linearRgb"), s = function(t, n, e) {
			const r = t.n;
			if (r < 16) return [];
			const o = ne(n, r);
			if (null === o) return [];
			const s = ee(t, ae(n, r, o), e) ?? Gn(t), i = re(t), a = Math.log(8), l = (t) => {
				const [n, e] = se(i, t[0], t[1]);
				return [
					n,
					e,
					t[2],
					t[3] < 0 ? 0 : t[3] > a ? a : t[3]
				];
			}, c = ie(r, n), h = new te(t, c.idx, c.cols), f = (n) => {
				const e = Math.sin(n[2]), o = Math.cos(n[2]), s = Math.exp(n[3]);
				let i = -Number.MAX_VALUE;
				for (let a = 0; a < r; a++) {
					const r = t.x[a] - n[0], l = t.y[a] - n[1], c = r * o + l * e, h = (-r * e + l * o) * s;
					i = _n(i, Math.sqrt(c * c + h * h));
				}
				return i;
			}, u = Ae(h, l([
				s[0],
				s[1],
				0,
				0
			]), 2, (t) => {
				const n = l(t);
				return [
					n[0],
					n[1],
					0,
					0
				];
			}).g;
			if (f(u) < .5) return [];
			const y = [ye(u)];
			if (r < 32) return y;
			let d = l(u), p = Me(h, d);
			for (let m = 0; m < 180; m += 15) for (const t of [Math.log(2), Math.log(3)]) {
				const n = l([
					d[0],
					d[1],
					m * Yn,
					t
				]), e = Me(h, n);
				e < p - 1e-12 && (p = e, d = n);
			}
			const g = Ae(h, d, 4, l).g;
			return Math.exp(g[3]) >= 1.02 && f(g) >= .5 && y.push(ye(g)), y;
		}(t, Zn(t, "srgb"), n);
		return un.map((n) => {
			const i = Zn(t, n), a = [], l = function(t, n, e) {
				const r = t.n;
				if (r < 16) return null;
				const [o, s] = Gn(t), [i, a, l] = Qn(n, r);
				let c = 0, h = 0, f = 0, u = 0, y = 0, d = 0, p = 0, g = 0, m = 0, x = 0, M = 0, w = 0;
				for (let Y = 0; Y < r; Y++) {
					const e = t.x[Y] - o, r = t.y[Y] - s;
					c += e * e, h += e * r, f += r * r;
					const b = n[3 * Y] - i, A = n[3 * Y + 1] - a, k = n[3 * Y + 2] - l;
					u += e * b, p += r * b, x += b * b, y += e * A, g += r * A, M += A * A, d += e * k, m += r * k, w += k * k;
				}
				const b = [
					u,
					y,
					d
				], A = [
					p,
					g,
					m
				], k = [
					x,
					M,
					w
				], v = c * f - h * h, F = c + f;
				if (v <= F * F * 1e-9) return null;
				let I = 0, N = 0, S = 0;
				for (let Y = 0; Y < 3; Y++) {
					const t = (f * b[Y] - h * A[Y]) / v, n = (c * A[Y] - h * b[Y]) / v;
					I += t * t, N += t * n, S += n * n;
				}
				const P = .5 * Math.atan2(2 * N, I - S), C = k[0] + k[1] + k[2], U = (t) => {
					const n = Math.cos(t), e = Math.sin(t), r = n * n * c + 2 * n * e * h + e * e * f;
					if (r <= 1e-12) return Number.MAX_VALUE;
					let o = 0;
					for (let s = 0; s < 3; s++) {
						const t = n * b[s] + e * A[s];
						o += t * t / r;
					}
					return C - o;
				}, L = Yn;
				let $ = P, q = U(P);
				for (let Y = -45; Y <= 45; Y++) {
					const t = P + Y * L, n = U(t);
					n < q && ($ = t, q = n);
				}
				let R = $ - L, z = $ + L;
				const T = .5 * (Math.sqrt(5) - 1);
				let E = z - T * (z - R), j = R + T * (z - R), B = U(E), O = U(j);
				for (let Y = 0; Y < 40; Y++) B < O ? (z = j, j = E, O = B, E = z - T * (z - R), B = U(E)) : (R = E, E = j, B = O, j = R + T * (z - R), O = U(j));
				const K = .5 * (R + z), D = Math.cos(K), H = Math.sin(K), X = new Float64Array(r);
				let W = Number.MAX_VALUE, G = -Number.MAX_VALUE;
				for (let Y = 0; Y < r; Y++) X[Y] = (t.x[Y] - o) * D + (t.y[Y] - s) * H, W = Vn(W, X[Y]), G = _n(G, X[Y]);
				if (G - W < 1e-6) return null;
				const Z = Jn(n, X, r), Q = (t) => [
					Z.a[0] + Z.g[0] * t,
					Z.a[1] + Z.g[1] * t,
					Z.a[2] + Z.g[2] * t
				];
				return {
					kind: "linear",
					p0: [o + W * D, s + W * H],
					p1: [o + G * D, s + G * H],
					c0: Pn(Q(W), e),
					c1: Pn(Q(G), e),
					interp: e,
					mids: []
				};
			}(t, i, n);
			null !== l && a.push(l), e && a.push(...r(i, n));
			for (const e of [...o, ...s]) {
				const r = "linearRgb" === n && o.includes(e) ? e : fe(t, i, n, e);
				null !== r && a.push(r);
			}
			return {
				space: n,
				cols: i,
				cands: a
			};
		});
	}(t, n, a.radialsPerSpace)) for (const n of k) {
		const r = new Ie(n, t);
		if (!d(n, r)) continue;
		const o = new De(n, t, A, e, r), s = [c(n, r)], i = o.next();
		null !== i && d(i.model, i.preds) && s.push(c(i.model, i.preds));
		let a = s[0].cost;
		for (const t of s) a = Vn(a, t.cost);
		p.push({
			i: p.length,
			fits: s,
			stops: o,
			best: a
		});
	}
	if (0 === p.length) return u;
	const g = (t) => {
		for (let n = t.stops.next(); null !== n; n = t.stops.next()) d(n.model, n.preds) && t.fits.push(c(n.model, n.preds));
	}, m = () => {
		let t = 1 / 0;
		for (const n of p) for (const e of n.fits) t = Vn(t, e.chi2);
		return t;
	}, x = function(t, n) {
		const e = t.n;
		if (e < 2) return 1 / 0;
		const r = Bn(e), o = Math.ceil(e / r);
		if (o < 4) return 1 / 0;
		const s = new Int32Array(o);
		for (let m = 0; m < o; m++) s[m] = m * r;
		const i = t.srgb, a = [
			0,
			0,
			0
		];
		for (let m = 0; m < o; m++) for (let t = 0; t < 3; t++) a[t] += i[3 * s[m] + t];
		for (let m = 0; m < 3; m++) a[m] /= o;
		const l = function(t, n, e) {
			let r = [
				1,
				1,
				1
			];
			const o = t.srgb;
			for (let s = 0; s < 8; s++) {
				let t = 0, s = 0, i = 0;
				for (let l = 0; l < n.length; l++) {
					const a = n[l], c = o[3 * a] - e[0], h = o[3 * a + 1] - e[1], f = o[3 * a + 2] - e[2], u = c * r[0] + h * r[1] + f * r[2];
					t += u * c, s += u * h, i += u * f;
				}
				const a = Math.sqrt(t * t + s * s + i * i);
				if (a < 1e-12) return null;
				r = [
					t / a,
					s / a,
					i / a
				];
			}
			return r;
		}(t, s, a);
		if (null === l) return 1 / 0;
		const c = new Float64Array(o);
		let h = Number.MAX_VALUE, f = -Number.MAX_VALUE;
		for (let m = 0; m < o; m++) {
			const t = s[m];
			c[m] = (i[3 * t] - a[0]) * l[0] + (i[3 * t + 1] - a[1]) * l[1] + (i[3 * t + 2] - a[2]) * l[2], h = Vn(h, c[m]), f = _n(f, c[m]);
		}
		if (f - h < 1e-12) return 1 / 0;
		let u = .5 * (h + f);
		for (let m = 0; m < 24; m++) {
			let t = 0, n = 0, e = 0, r = 0;
			for (let s = 0; s < o; s++) c[s] < u ? (t += c[s], n++) : (e += c[s], r++);
			if (0 === n || 0 === r) return 1 / 0;
			u = .5 * (t / n + e / r);
		}
		const y = [[
			0,
			0,
			0
		], [
			0,
			0,
			0
		]], d = [0, 0];
		for (let m = 0; m < o; m++) {
			const t = c[m] < u ? 0 : 1;
			d[t]++;
			for (let n = 0; n < 3; n++) y[t][n] += i[3 * s[m] + n];
		}
		if (0 === d[0] || 0 === d[1]) return 1 / 0;
		const p = [[
			y[0][0] / d[0],
			y[0][1] / d[0],
			y[0][2] / d[0]
		], [
			y[1][0] / d[1],
			y[1][1] / d[1],
			y[1][2] / d[1]
		]];
		let g = 0;
		for (let m = 0; m < o; m++) {
			const t = c[m] < u ? 0 : 1;
			for (let n = 0; n < 3; n++) {
				const e = Math.max(Math.abs(i[3 * s[m] + n] - p[t][n]) - ke, 0);
				g += e * e;
			}
		}
		return g / (n * n) * (e / o);
	}(t, l), M = (t) => Number.isFinite(x) && Number.isFinite(t) && x < .85 * t, w = p.filter((t) => t.stops.open);
	w.sort((t, n) => t.best - n.best || t.i - n.i);
	const b = a.stopGeometries;
	for (const e of w.slice(0, b)) g(e);
	if (w.length > b && M(m())) for (const e of w.slice(b)) g(e);
	if (M(m())) return u;
	for (const e of p) u.push(...e.fits);
	return u;
}
function Ze(t) {
	let n = 0;
	for (let e = 1; e < t.length; e++) t[e].cost < t[n].cost && (n = e);
	return t[n];
}
function Qe(t, n, e, r, o, s, i, a, l = !0, c = 16, h = He) {
	if (0 === r.length) return [zn([
		0,
		0,
		0
	], a)];
	let f;
	const u = Dn(t, n, e, r, o, s, !0);
	if (u.n > 0) f = Ge(u, n, l, i, a, c, h);
	else {
		const l = Dn(t, n, e, r, o, s, !1);
		f = l.n > 0 ? Ge(l, n, !1, i, a) : Ge(Dn(t, n, e, r, o, null, !1), n, !1, i, a);
	}
	return f.map((t) => {
		return {
			model: (n = t.model, En(n, .5)),
			chi2: t.chi2,
			params: t.params,
			cost: t.cost
		};
		var n;
	});
}
function Ye(t, n) {
	let e = 0;
	for (let s = 0; s < t.length; s++) t[s] === n && e++;
	const r = new Int32Array(e);
	let o = 0;
	for (let s = 0; s < t.length; s++) t[s] === n && (r[o++] = s);
	return r;
}
const _e = .12, Ve = Object.freeze({
	sigmaNoise: 0,
	lambda: 0,
	noiseSigmas: 0,
	sameInkDe00: 0
});
function Je(t, n, e, r = 1) {
	return {
		sigmaNoise: t,
		lambda: We(n, r),
		noiseSigmas: e ? 3 : 0,
		sameInkDe00: e ? 5 : 1.5
	};
}
const tr = Math.fround, nr = tr(.04045), er = tr(.0031308), rr = tr(12.92), or = tr(.055), sr = tr(1.055), ir = tr(2.4), ar = tr(1 / ir), lr = [
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(tr), cr = [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(tr), hr = [
	.39633778,
	.21580376,
	-.105561346,
	-.06385417,
	-.08948418,
	-1.2914855
].map(tr), fr = [
	4.0767417,
	-3.3077116,
	.23096994,
	-1.268438,
	2.6097574,
	-.34131938,
	-.004196086,
	-.7034186,
	1.7076147
].map(tr);
function ur(t) {
	return tr(t <= nr ? t / rr : Math.pow(tr(tr(t + or) / sr), ir));
}
function yr(t) {
	return tr(t <= er ? t * rr : tr(sr * tr(Math.pow(t, ar))) - or);
}
function dr(t, n, e, r, o) {
	return tr(tr(tr(t[n] * e) + tr(t[n + 1] * r)) + tr(t[n + 2] * o));
}
function pr(t, n, e) {
	const r = ur(tr(t)), o = ur(tr(n)), s = ur(tr(e)), i = tr(Math.cbrt(dr(lr, 0, r, o, s))), a = tr(Math.cbrt(dr(lr, 3, r, o, s))), l = tr(Math.cbrt(dr(lr, 6, r, o, s)));
	return [
		dr(cr, 0, i, a, l),
		dr(cr, 3, i, a, l),
		dr(cr, 6, i, a, l)
	];
}
function gr(t, n, e) {
	const r = tr(t), o = tr(n), s = tr(e), i = tr(tr(r + tr(hr[0] * o)) + tr(hr[1] * s)), a = tr(tr(r - tr(-hr[2] * o)) - tr(-hr[3] * s)), l = tr(tr(r - tr(-hr[4] * o)) - tr(-hr[5] * s)), c = tr(tr(i * i) * i), h = tr(tr(a * a) * a), f = tr(tr(l * l) * l);
	return [
		vr(yr(dr(fr, 0, c, h, f))),
		vr(yr(dr(fr, 3, c, h, f))),
		vr(yr(dr(fr, 6, c, h, f)))
	];
}
function mr(t, n, e, r, o, s) {
	const i = t - r, a = n - o, l = e - s;
	return Math.sqrt(i * i + a * a + l * l);
}
function xr(t, n, e, r, o, s) {
	const i = tr(t - r), a = tr(n - o), l = tr(e - s);
	return tr(Math.sqrt(tr(tr(tr(i * i) + tr(a * a)) + tr(l * l))));
}
function Mr(t, n, e, r) {
	const o = t.inkLab;
	let s = 0, i = 1 / 0;
	for (let a = 0; a < t.count; a++) {
		const t = xr(o[3 * a], o[3 * a + 1], o[3 * a + 2], n, e, r);
		t < i && (s = a, i = t);
	}
	return [s, i];
}
function wr(t, n, e, r, o, s) {
	const [i, a, l] = u(t, n, e), [c, h, f] = u(r, o, s), y = d(i, a, l, c, h, f);
	return Number.isNaN(y) ? 0 : y;
}
function br(t, n, e) {
	return t && !n && e < .25;
}
function Ar(t, n, e) {
	return [
		ur(t),
		ur(n),
		ur(e)
	];
}
var kr = class t {
	lin = [];
	srgb = [];
	get count() {
		return this.srgb.length / 3;
	}
	push(t, n, e) {
		const r = gr(t, n, e);
		this.srgb.push(r[0], r[1], r[2]), this.lin.push(...Ar(r[0], r[1], r[2]));
	}
	static of(n) {
		const e = new t();
		for (let t = 0; t + 2 < n.length; t += 3) e.push(n[t], n[t + 1], n[t + 2]);
		return e;
	}
};
function vr(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function Fr(t, n) {
	for (; 0 !== n;) {
		const e = t % n;
		t = n, n = e;
	}
	return t;
}
function Ir(t, n, e, r) {
	let o = Math.imul(2654435769 ^ t, 2246822507);
	return o = Math.imul(o ^ o >>> 15 ^ n, 3266489909), o = Math.imul(o ^ o >>> 13 ^ e, 668265263), o ^= o >>> 16, o & r;
}
function Nr(t) {
	const n = Math.floor(t.length / 3), e = new Uint32Array(t.buffer, t.byteOffset, 3 * n), r = new Int32Array(n);
	let o = 1024, s = o - 1, i = new Int32Array(o).fill(-1), a = new Uint32Array(3 * o), l = new Int32Array(o), c = 0, h = -1;
	for (let f = 0; f < n; f++) {
		const t = e[3 * f], n = e[3 * f + 1], u = e[3 * f + 2];
		if (h >= 0 && a[3 * h] === t && a[3 * h + 1] === n && a[3 * h + 2] === u) {
			r[f] = h;
			continue;
		}
		let y = Ir(t, n, u, s), d = i[y];
		for (; d >= 0 && (a[3 * d] !== t || a[3 * d + 1] !== n || a[3 * d + 2] !== u);) y = y + 1 & s, d = i[y];
		if (d < 0) {
			if (d = c++, d >= l.length) {
				const t = new Uint32Array(2 * a.length);
				t.set(a), a = t;
				const n = new Int32Array(2 * l.length);
				n.set(l), l = n;
			}
			if (a[3 * d] = t, a[3 * d + 1] = n, a[3 * d + 2] = u, l[d] = f, i[y] = d, 2 * c > o) {
				o *= 2, s = o - 1, i = new Int32Array(o).fill(-1);
				for (let t = 0; t < c; t++) {
					let n = Ir(a[3 * t], a[3 * t + 1], a[3 * t + 2], s);
					for (; i[n] >= 0;) n = n + 1 & s;
					i[n] = t;
				}
			}
		}
		r[f] = d, h = d;
	}
	return {
		cid: r,
		reps: l.slice(0, c),
		count: c
	};
}
function Sr(t) {
	return {
		claimed: new Uint8Array(t),
		dist: new Float64Array(t)
	};
}
tr(.05), tr(.15), tr(.06), tr(.02);
var Pr = class {
	ids;
	colors;
	outside;
	geometry;
	constructor(t, n, e, r) {
		this.ids = t, this.colors = n, this.outside = e, this.geometry = r;
	}
	straddle(t, n) {
		const e = this.ids.length / 9;
		if (0 === e) return 1;
		for (let s = 0; s < this.colors.length; s++) n[this.colors[s]] = t(this.colors[s]);
		n[this.outside] = 0;
		const r = this.ids;
		let o = 0;
		for (let s = 0; s < r.length; s += 9) {
			let t = 0;
			for (let e = 0; e < 9; e++) t |= n[r[s + e]];
			3 === t && o++;
		}
		return o / e;
	}
}, Cr = class {
	cid;
	width;
	height;
	n;
	stride;
	count;
	off;
	px;
	spreadCount;
	constructor(t, n, e, r) {
		const o = t.cid.length, s = Math.max(1, r ?? function(t, n) {
			if (t <= 65536 || 0 === n) return 1;
			let e = Math.ceil(t / 65536);
			for (; e > 1 && 1 !== Fr(e, n);) e++;
			return e;
		}(o, n)), i = t.count, a = Math.max(1, Math.floor(o / 8192)), l = new Int32Array(i), c = new Int32Array(i);
		for (let y = 0; y < o; y += s) {
			const n = t.cid[y];
			l[n]++, y % a === 0 && c[n]++;
		}
		const h = new Int32Array(i + 1);
		for (let y = 0; y < i; y++) h[y + 1] = h[y] + l[y];
		const f = h.slice(0, i), u = new Int32Array(h[i]);
		for (let y = 0; y < o; y += s) u[f[t.cid[y]]++] = y;
		this.cid = t.cid, this.width = n, this.height = e, this.n = o, this.stride = s, this.count = l, this.off = h, this.px = u, this.spreadCount = c;
	}
	get colors() {
		return this.count.length;
	}
	hasGeometry() {
		return 0 !== this.width && 0 !== this.height && this.n >= this.width * this.height;
	}
	claim(t, n, e, r, o, s) {
		let i = 0;
		for (let a = 0; a < this.count.length; a++) {
			const l = e[3 * a] - r, c = e[3 * a + 1] - o, h = e[3 * a + 2] - s, f = Math.sqrt(l * l + c * c + h * h);
			t.dist[a] = f;
			const u = f < n[a];
			t.claimed[a] = u ? 1 : 0, u && (i += this.count[a]);
		}
		return i * this.stride;
	}
	spread(t, n) {
		const e = [], r = [];
		for (let o = 0; o < this.count.length; o++) t.claimed[o] && t.dist[o] < n && this.spreadCount[o] > 0 && (e.push(t.dist[o]), r.push(this.spreadCount[o]));
		return function(t, n) {
			let e = 0;
			for (let i = 0; i < n.length; i++) e += n[i];
			if (0 === e) return 0;
			const r = Array.from({ length: t.length }, (t, n) => n);
			r.sort((n, e) => t[n] - t[e]);
			const o = Math.floor(e / 2);
			let s = 0;
			for (const i of r) if (s += n[i], s > o) return t[i];
			return t[r[r.length - 1]];
		}(e, r);
	}
	claimedPixels(t) {
		if (!this.hasGeometry()) return /* @__PURE__ */ new Int32Array(0);
		const n = this.width * this.height;
		let e = 0;
		for (let s = 0; s < this.count.length; s++) t.claimed[s] && (e += this.count[s]);
		const r = new Int32Array(e);
		let o = 0;
		for (let s = 0; s < this.count.length; s++) if (t.claimed[s]) for (let t = this.off[s]; t < this.off[s + 1]; t++) {
			const e = this.px[t];
			if (e >= n) break;
			r[o++] = e;
		}
		return o === e ? r : r.subarray(0, o);
	}
	interior(t, n) {
		if (!this.hasGeometry()) return 1;
		const e = this.width, r = this.height, o = this.cid, s = t.claimed;
		let i = 0;
		for (let a = 0; a < n.length; a++) {
			const t = n[a], l = t / e | 0, c = t - l * e;
			0 !== c && !s[o[t - 1]] || c + 1 !== e && !s[o[t + 1]] || 0 !== l && !s[o[t - e]] || l + 1 !== r && !s[o[t + e]] || i++;
		}
		return 0 === n.length ? 0 : i / n.length;
	}
	neighborhoods(t) {
		const n = this.count.length;
		if (!this.hasGeometry()) return new Pr(/* @__PURE__ */ new Int32Array(0), /* @__PURE__ */ new Int32Array(0), n, !1);
		const e = this.width, r = this.height, o = new Int32Array(9 * t.length), s = new Uint8Array(n + 1);
		s[n] = 1;
		const i = [];
		let a = 0;
		for (let l = 0; l < t.length; l++) {
			const c = t[l], h = c / e | 0, f = c - h * e;
			for (let t = h - 1; t <= h + 1; t++) for (let l = f - 1; l <= f + 1; l++) {
				const c = l >= 0 && t >= 0 && l < e && t < r ? this.cid[t * e + l] : n;
				s[c] || (s[c] = 1, i.push(c)), o[a++] = c;
			}
		}
		return new Pr(o, Int32Array.from(i), n, !0);
	}
}, Ur = class {
	img;
	lab;
	srgb;
	lin;
	constructor(t, n, e, r) {
		const o = n.count;
		this.lab = new Float64Array(3 * o), this.srgb = new Float64Array(3 * o), this.lin = new Float64Array(3 * o);
		for (let s = 0; s < o; s++) {
			const e = 3 * n.reps[s], r = pr(t[e], t[e + 1], t[e + 2]), o = gr(r[0], r[1], r[2]);
			for (let t = 0; t < 3; t++) this.lab[3 * s + t] = r[t], this.srgb[3 * s + t] = o[t], this.lin[3 * s + t] = ur(o[t]);
		}
		this.img = new Cr(n, e, r);
	}
};
const Lr = Math.fround, $r = Lr(.4), qr = Lr(.8);
function Rr(t, n) {
	const e = 0 === n ? t : Lr(Lr(t + n) / qr);
	return Math.min(Math.round(Lr(23 * ((r = e) < 0 ? 0 : r > 1 ? 1 : r))), 23);
	var r;
}
function zr(t, n) {
	return t >= Math.max(8, Ot * n);
}
const Tr = [
	-1,
	-1,
	0,
	-1,
	1,
	-1,
	-1,
	0,
	1,
	0,
	-1,
	1,
	0,
	1,
	1,
	1
];
function Er(t, n, e, r, o, s, i, a) {
	if (!n.geometry) return 0;
	const l = i.linear ? s.lin : s.srgb, c = l[3 * i.i], h = l[3 * i.i + 1], f = l[3 * i.i + 2], u = l[3 * i.j] - c, y = l[3 * i.j + 1] - h, d = l[3 * i.j + 2] - f, p = u * u + y * y + d * d;
	if (p < 1e-9) return 0;
	const g = gr(e, r, o);
	i.linear && (g[0] = ur(g[0]), g[1] = ur(g[1]), g[2] = ur(g[2]));
	const m = ((g[0] - c) * u + (g[1] - h) * y + (g[2] - f) * d) / p, x = Math.max(Math.min(_e, .5 * m), .02), M = Math.max(Math.min(_e, .5 * (1 - m)), .02), w = m - x, b = m + M, A = i.linear ? t.lin : t.srgb;
	return n.straddle((t) => function(t, n, e) {
		return (t < n ? 1 : 0) | (t > e ? 2 : 0);
	}(((A[3 * t] - c) * u + (A[3 * t + 1] - h) * y + (A[3 * t + 2] - f) * d) / p, w, b), a);
}
var jr = class {
	view;
	ev;
	mergeDistance;
	inks = [];
	axes = new kr();
	nearest;
	nearestInk;
	claim;
	scratch;
	totalPx;
	constructor(t, n, e) {
		this.view = t, this.ev = n, this.mergeDistance = e;
		const r = t.img.colors;
		this.nearest = new Float64Array(r).fill(1 / 0), this.nearestInk = new Int32Array(r).fill(-1), this.claim = Sr(r), this.scratch = new Uint8Array(r + 1), this.totalPx = Math.max(t.img.n, 1);
	}
	get count() {
		return this.inks.length / 3;
	}
	accepts(t, n, e) {
		const { sigmaNoise: r, lambda: o, noiseSigmas: s, sameInkDe00: i } = this.ev, a = this.view, l = a.img.claim(this.claim, this.nearest, a.lab, t, n, e), c = 0 === s ? 0 : a.img.spread(this.claim, this.mergeDistance), h = l / this.totalPx < .004 && this.count > 0;
		let f = 1 / 0;
		for (let x = 0; x < this.count; x++) {
			const r = mr(this.inks[3 * x], this.inks[3 * x + 1], this.inks[3 * x + 2], t, n, e);
			r < f && (f = r);
		}
		const u = s * c;
		if (function(t, n, e, r, o, s) {
			if (0 === o) return !1;
			let i = 0, a = 1 / 0;
			for (let h = 0; h < o; h++) {
				const o = mr(r[3 * h], r[3 * h + 1], r[3 * h + 2], t, n, e);
				o < a && (i = h, a = o);
			}
			const l = gr(t, n, e), c = gr(r[3 * i], r[3 * i + 1], r[3 * i + 2]);
			return wr(l[0], l[1], l[2], c[0], c[1], c[2]) < s;
		}(t, n, e, this.inks, this.count, i)) return !1;
		const y = f <= Math.max(this.mergeDistance, u);
		if (y && !(r > 0 && f > .012 && f > u && .5 * l * (f / r) ** 2 > 3 * o)) return !1;
		let d = null;
		const p = () => d ??= a.img.claimedPixels(this.claim);
		if (h && !zr(function(t, n, e, r, o, s, i, a) {
			const l = t.width, c = t.height, h = t.cid, f = /* @__PURE__ */ new Int32Array(8), u = /* @__PURE__ */ new Int32Array(8), y = /* @__PURE__ */ new Float64Array(12), d = /* @__PURE__ */ new Float64Array(3);
			let p = 0;
			for (let g = 0; g < e.length; g++) {
				const t = e[g], m = t / l | 0, x = t - m * l;
				let M = 0;
				for (let e = 0; e < 16; e += 2) {
					const t = x + Tr[e], o = m + Tr[e + 1];
					if (t < 0 || o < 0 || t >= l || o >= c) continue;
					const s = h[o * l + t];
					if (n.claimed[s]) continue;
					const a = r[s];
					if (a < 0 || a >= i) continue;
					let y = 0;
					for (; y < M && f[y] !== a;) y++;
					y < M ? u[y]++ : (f[M] = a, u[M] = 1, M++);
				}
				for (let n = 1; n < M; n++) {
					const t = f[n], e = u[n];
					let r = n - 1;
					for (; r >= 0 && (u[r] < e || u[r] === e && f[r] > t);) f[r + 1] = f[r], u[r + 1] = u[r], r--;
					f[r + 1] = t, u[r + 1] = e;
				}
				const w = Math.min(M, 4);
				for (let n = 0; n < w; n++) {
					const t = f[n];
					y[3 * n] = s[3 * t], y[3 * n + 1] = s[3 * t + 1], y[3 * n + 2] = s[3 * t + 2];
				}
				const b = h[t];
				let A;
				d[0] = o[3 * b], d[1] = o[3 * b + 1], d[2] = o[3 * b + 2], A = 0 === w ? 1 / 0 : 1 === w ? mr(d[0], d[1], d[2], y[0], y[1], y[2]) : Dt(d, y, w), A > a && Ht(d, y, w) > a && p++;
			}
			return p * t.stride;
		}(a.img, this.claim, p(), this.nearestInk, a.srgb, this.axes.srgb, this.count, function(t) {
			return Math.max(3 * t, Kt);
		}(r)), this.totalPx)) return !1;
		const g = this.measure(t, n, e, y, p), m = g.blend && g.interior < .25 && g.straddle >= .5;
		return !br(g.escaped, g.blend, g.interior) && !m;
	}
	measure(t, n, e, r, o) {
		const s = function(t, n, e, r, o) {
			const s = [], i = r.count;
			if (i < 2) return s;
			const a = gr(t, n, e);
			for (let l = 0; l < 2; l++) {
				const c = 0 === l, h = c ? r.lin : r.srgb, f = c ? Ar(a[0], a[1], a[2]) : a;
				for (let r = 0; r < i; r++) for (let a = r + 1; a < i; a++) {
					const i = h[3 * r], l = h[3 * r + 1], u = h[3 * r + 2], y = h[3 * a] - i, d = h[3 * a + 1] - l, p = h[3 * a + 2] - u, g = y * y + d * d + p * p;
					if (g < 1e-9) continue;
					const m = ((f[0] - i) * y + (f[1] - l) * d + (f[2] - u) * p) / g;
					if (!(m >= .04 && m <= .96)) continue;
					const x = vr(i + y * m), M = vr(l + d * m), w = vr(u + p * m), b = c ? pr(yr(x), yr(M), yr(w)) : pr(x, M, w), A = mr(t, n, e, b[0], b[1], b[2]);
					A <= o && s.push({
						i: r,
						j: a,
						linear: c,
						off: A
					});
				}
			}
			return s;
		}(t, n, e, this.axes, 1.6 * this.mergeDistance), i = s.length > 0, a = this.view.img, l = i || r ? a.interior(this.claim, o()) : 1;
		let c = 0;
		if (i && l < .25) {
			const r = a.neighborhoods(o());
			for (const o of s) c = Math.max(c, Er(this.view, r, t, n, e, this.axes, o, this.scratch));
		}
		return {
			blend: i,
			escaped: r,
			interior: l,
			straddle: c
		};
	}
	accept(t, n, e) {
		const r = this.view.lab, o = this.count;
		for (let s = 0; s < this.nearest.length; s++) {
			const i = mr(r[3 * s], r[3 * s + 1], r[3 * s + 2], t, n, e);
			i < this.nearest[s] && (this.nearest[s] = i, this.nearestInk[s] = o);
		}
		this.axes.push(t, n, e), this.inks.push(t, n, e);
	}
};
function Br(t, n, e, r = .035, o = 64, s = Ve, i = Nr(t)) {
	const a = new Ur(t, i, n, e), l = function(t) {
		const n = t.img.colors, e = t.lab, r = new Int32Array(n);
		for (let u = 0; u < n; u++) r[u] = 24 * Rr(e[3 * u], 0) * 24 + 24 * Rr(e[3 * u + 1], $r) + Rr(e[3 * u + 2], $r);
		const o = /* @__PURE__ */ new Int32Array(13824), s = /* @__PURE__ */ new Float64Array(41472), i = t.img.cid;
		for (let u = 0; u < i.length; u++) {
			const t = i[u], n = r[t];
			o[n]++, s[3 * n] += e[3 * t], s[3 * n + 1] += e[3 * t + 1], s[3 * n + 2] += e[3 * t + 2];
		}
		const a = [];
		for (let u = 0; u < 13824; u++) o[u] > 0 && a.push(u);
		a.sort((t, n) => o[n] - o[t] || t - n);
		const l = a.length, c = new Int32Array(l), h = new Int32Array(l), f = new Float64Array(3 * l);
		for (let u = 0; u < l; u++) {
			const t = a[u];
			c[u] = o[t], h[u] = t, f[3 * u] = Lr(s[3 * t] / o[t]), f[3 * u + 1] = Lr(s[3 * t + 1] / o[t]), f[3 * u + 2] = Lr(s[3 * t + 2] / o[t]);
		}
		return {
			count: l,
			n: c,
			key: h,
			lab: f
		};
	}(a), c = new jr(a, s, r);
	for (let p = 0; p < l.count && !(c.count >= o); p++) {
		const t = l.lab[3 * p], n = l.lab[3 * p + 1], e = l.lab[3 * p + 2];
		c.accepts(t, n, e) && c.accept(t, n, e);
	}
	let h = c.inks;
	0 === h.length && (h = l.count > 0 ? [
		l.lab[0],
		l.lab[1],
		l.lab[2]
	] : [
		1,
		0,
		0
	]);
	const f = h.length / 3, u = Float64Array.from(h), y = function(t, n, e, r, o) {
		const s = t.img.colors, i = t.lab, a = new Int32Array(s);
		for (let u = 0; u < s; u++) {
			let t = 0, o = 1 / 0;
			for (let r = 0; r < e; r++) {
				const e = mr(i[3 * u], i[3 * u + 1], i[3 * u + 2], n[3 * r], n[3 * r + 1], n[3 * r + 2]);
				e < o && (t = r, o = e);
			}
			a[u] = o <= r ? t : -1;
		}
		const l = new Float64Array(3 * e), c = new Float64Array(e), h = t.img.cid;
		for (let u = 0; u < h.length; u++) {
			const t = h[u], n = a[t];
			n < 0 || (l[3 * n] += i[3 * t], l[3 * n + 1] += i[3 * t + 1], l[3 * n + 2] += i[3 * t + 2], c[n]++);
		}
		const f = new Float64Array(e);
		for (let u = 0; u < e; u++) c[u] > 0 && (n[3 * u] = Lr(l[3 * u] / c[u]), n[3 * u + 1] = Lr(l[3 * u + 1] / c[u]), n[3 * u + 2] = Lr(l[3 * u + 2] / c[u])), f[u] = c[u] / o;
		return f;
	}(a, u, f, r, c.totalPx), d = new Float64Array(3 * f);
	for (let p = 0; p < f; p++) {
		const t = gr(u[3 * p], u[3 * p + 1], u[3 * p + 2]);
		d[3 * p] = t[0], d[3 * p + 1] = t[1], d[3 * p + 2] = t[2];
	}
	return {
		count: f,
		inkLab: u,
		inkRgb: d,
		weight: y,
		alpha: new Float64Array(f).fill(1)
	};
}
function Or(t, n, e = Nr(t)) {
	const r = new Int32Array(e.count);
	for (let s = 0; s < e.count; s++) {
		const o = 3 * e.reps[s], i = pr(t[o], t[o + 1], t[o + 2]);
		r[s] = Mr(n, i[0], i[1], i[2])[0];
	}
	const o = new Int32Array(e.cid.length);
	for (let s = 0; s < o.length; s++) o[s] = r[e.cid[s]];
	return o;
}
function Kr(t, n) {
	for (; t[n] !== n;) {
		const e = t[n];
		t[n] = t[e], n = e;
	}
	return n;
}
function Dr(t, n, e) {
	const r = n * e;
	let o = 0;
	if (n > 0) for (let p = 0; p < e; p++) {
		const e = p * n;
		o++;
		for (let r = 1; r < n; r++) t[e + r] !== t[e + r - 1] && o++;
	}
	const s = new Int32Array(o), i = new Int32Array(o), a = new Int32Array(o), l = new Int32Array(o);
	let c = 0, h = 0, f = 0;
	for (let p = 0; p < e; p++) {
		const e = p * n, r = e - n, o = c;
		let a = h, u = 0;
		for (; u < n;) {
			const o = t[e + u], h = u;
			for (; u < n && t[e + u] === o;) u++;
			for (l[c] = c; a < f && s[a] - r + i[a] <= h;) a++;
			for (let n = a; n < f && s[n] - r < u; n++) {
				if (t[s[n]] !== o) continue;
				const e = Kr(l, c), r = Kr(l, n);
				e < r ? l[r] = e : l[e] = r;
			}
			s[c] = e + h, i[c] = u - h, c++;
		}
		h = o, f = c;
	}
	let u = 0;
	for (let p = 0; p < o; p++) a[p] = l[p] === p ? u++ : a[l[p]];
	const y = new Int32Array(r), d = new Int32Array(u);
	for (let p = 0; p < o; p++) {
		const t = a[p];
		y.fill(t, s[p], s[p] + i[p]), d[t] += i[p];
	}
	return {
		comp: y,
		size: d,
		count: u,
		runStart: s,
		runLength: i,
		runComp: a
	};
}
function Hr(t, n, e, r, o, s) {
	const i = o * n + r, a = t[i];
	for (let l = 1; l <= s; l++) {
		if (r - l >= 0 && t[i - l] !== a) return !1;
		if (r + l < n && t[i + l] !== a) return !1;
		if (o - l >= 0 && t[i - l * n] !== a) return !1;
		if (o + l < e && t[i + l * n] !== a) return !1;
	}
	return !0;
}
function Xr(t, n) {
	const e = new Int32Array(t.count + 1);
	for (let s = 0; s < t.count; s++) e[s + 1] = e[s] + (n(s) ? t.size[s] : 0);
	const r = e.slice(0, t.count), o = new Int32Array(e[t.count]);
	for (let s = 0; s < t.runStart.length; s++) {
		const n = t.runComp[s];
		if (e[n + 1] === e[n]) continue;
		const i = t.runStart[s], a = t.runLength[s], l = r[n];
		for (let t = 0; t < a; t++) o[l + t] = i + t;
		r[n] = l + a;
	}
	return {
		offset: e,
		pixels: o
	};
}
const Wr = 65535, Gr = [
	1,
	1,
	1
], Zr = Math.fround, Qr = Zr(1e-12);
function Yr(t) {
	return Zr(Math.max(3 * t, Kt));
}
function _r(t, n, e, r, o, s) {
	if (r < 2) return !1;
	let i = 1 / 0, a = -1;
	for (let l = 0; l < r; l++) for (let s = l + 1; s < r; s++) {
		const r = l * o, c = s * o;
		let h = 0, f = 0;
		for (let s = 0; s < o; s++) {
			const o = Zr(e[r + s]), i = Zr(Zr(e[c + s]) - o);
			h = Zr(h + Zr(i * i)), f = Zr(f + Zr(Zr(t[n + s] - o) * i));
		}
		if (h < Qr) continue;
		const u = Math.min(1, Math.max(0, Zr(f / h)));
		let y = 0;
		for (let s = 0; s < o; s++) {
			const o = Zr(e[r + s]), i = Zr(Zr(e[c + s]) - o), a = Zr(t[n + s] - Zr(o + Zr(i * u)));
			y = Zr(y + Zr(a * a));
		}
		(a < 0 || y < i) && (i = y, a = u < .5 ? l : s);
	}
	for (let l = 0; l < r; l++) for (let s = l + 1; s < r; s++) for (let c = s + 1; c < r; c++) {
		const r = l * o, h = s * o, f = c * o;
		let u = 0, y = 0, d = 0, p = 0, g = 0;
		for (let s = 0; s < o; s++) {
			const o = Zr(e[r + s]), i = Zr(Zr(e[h + s]) - o), a = Zr(Zr(e[f + s]) - o), l = Zr(t[n + s] - o);
			u = Zr(u + Zr(i * i)), y = Zr(y + Zr(a * a)), d = Zr(d + Zr(i * a)), p = Zr(p + Zr(l * i)), g = Zr(g + Zr(l * a));
		}
		const m = Zr(Zr(u * y) - Zr(d * d));
		if (Math.abs(m) < Qr) continue;
		const x = Zr(Zr(Zr(y * p) - Zr(d * g)) / m), M = Zr(Zr(Zr(u * g) - Zr(d * p)) / m);
		if (x < 0 || M < 0 || Zr(x + M) > 1) continue;
		let w = 0;
		for (let s = 0; s < o; s++) {
			const i = Zr(e[r + s]), a = Zr(Zr(Zr(e[h + s]) - i) * x), l = Zr(Zr(Zr(e[f + s]) - i) * M), c = Zr(3 === o ? Zr(i + a) + l : i + Zr(a + l)), u = Zr(t[n + s] - c);
			w = Zr(w + Zr(u * u));
		}
		if (a < 0 || w < i) {
			i = w;
			const t = Zr(Zr(1 - x) - M);
			a = t >= x && t >= M ? l : x >= M ? s : c;
		}
	}
	return !(a < 0 || (s.r = Zr(Math.sqrt(i)), s.who = a, 0));
}
var Vr = class {
	count;
	touched;
	size = 0;
	constructor(t) {
		this.count = new Int32Array(t), this.touched = new Int32Array(t);
	}
	add(t) {
		0 === this.count[t]++ && (this.touched[this.size++] = t);
	}
	clear() {
		for (let t = 0; t < this.size; t++) this.count[this.touched[t]] = 0;
		this.size = 0;
	}
	commonest() {
		let t = -1;
		for (let n = 0; n < this.size; n++) {
			const e = this.touched[n], r = this.count[e];
			(t < 0 || r > this.count[t] || r === this.count[t] && e < t) && (t = e);
		}
		return t;
	}
	top(t, n) {
		let e = 0;
		for (let r = 0; r < this.size; r++) {
			const o = this.touched[r], s = this.count[o];
			let i = e < t ? e : t;
			for (; i > 0;) {
				const e = n[i - 1], r = this.count[e];
				if (r > s || r === s && e < o) break;
				i < t && (n[i] = e), i--;
			}
			i < t && (n[i] = o), e < t && e++;
		}
		return e;
	}
};
function Jr(t, n) {
	let e = -1;
	for (let r = 0; r < t.length; r++) t[r] > e && (e = t[r]);
	return Math.max(e + 1, n, 1);
}
function to(t, n, e, r, o, s, i, a, l) {
	l.clear();
	let c = 0, h = 0;
	for (let f = n; f < e; f++) {
		const n = t[f], e = n / i | 0, u = n - e * i;
		let y = !0;
		u > 0 && o[n - 1] !== r && (y = !1, l.add(s[n - 1]), h++), u + 1 < i && o[n + 1] !== r && (y = !1, l.add(s[n + 1]), h++), e > 0 && o[n - i] !== r && (y = !1, l.add(s[n - i]), h++), e + 1 < a && o[n + i] !== r && (y = !1, l.add(s[n + i]), h++), y && c++;
	}
	return {
		interior: c,
		foreign: h
	};
}
function no(t, n, e, r = 1) {
	const o = Dr(t, n, e), { interior: s, foreign: i } = function(t, n, e, r = 1) {
		const o = new Int32Array(t.count), s = new Int32Array(t.count), i = t.comp;
		for (let a = 0; a < e; a++) for (let t = 0; t < n; t++) {
			const l = a * n + t, c = i[l];
			let h = 0;
			t > 0 && i[l - 1] !== c && h++, t + 1 < n && i[l + 1] !== c && h++, a > 0 && i[l - n] !== c && h++, a + 1 < e && i[l + n] !== c && h++, s[c] += h, 0 === h && (r <= 1 || Hr(i, n, e, t, a, r)) && o[c]++;
		}
		return {
			interior: o,
			foreign: s
		};
	}(o, n, e, r);
	return {
		comps: o,
		thin: Xr(o, (t) => 5 * s[t] < o.size[t] && i[t] > 0)
	};
}
function eo(t, n, e, r, o, s, i) {
	let a = 0;
	for (let l = n; l < e; l++) {
		const n = t[l], e = n / o | 0;
		Hr(r, o, s, n - e * o, e, i) && a++;
	}
	return a;
}
function ro(t, n, e, r, o, s) {
	const i = r - e;
	if (0 === i) return !1;
	const a = to(n, e, r, o[n[e]], o, s, t.w, t.h, t.tally), { foreign: l } = a;
	if (5 * (t.reach > 1 ? eo(n, e, r, o, t.w, t.h, t.reach) : a.interior) >= i || 0 === l) return !1;
	const c = t.tally.top(3, t.top);
	let h = 0;
	for (let w = 0; w < c; w++) h += t.tally.count[t.top[w]];
	if (5 * h < 4 * l) return !1;
	for (let w = 0; w < c; w++) if (t.top[w] >= t.inkCount) return !1;
	if (c < 2) return !1;
	const { cols: f, inkRgb: u } = t;
	let y = !1;
	for (let w = 0; w < c; w++) {
		const n = t.top[w];
		f[3 * w] = Zr(u[3 * n]), f[3 * w + 1] = Zr(u[3 * n + 1]), f[3 * w + 2] = Zr(u[3 * n + 2]), f[3 * w] === Gr[0] && f[3 * w + 1] === Gr[1] && f[3 * w + 2] === Gr[2] && (y = !0);
	}
	let d = c, p = -1;
	if (!y && null !== t.alpha) {
		let o = !1;
		for (let s = e; s < r; s++) if (t.alpha[n[s]] < .99) {
			o = !0;
			break;
		}
		o && (f[3 * d] = Gr[0], f[3 * d + 1] = Gr[1], f[3 * d + 2] = Gr[2], p = d++);
	}
	const { mix: g, dest: m, rgb: x } = t;
	let M = 0;
	for (let w = e; w < r; w++) {
		const r = n[w];
		_r(x, 3 * r, f, d, 3, g) ? (g.r <= t.tol && M++, g.who !== p ? m[w - e] = t.top[g.who] : m[w - e] = _r(x, 3 * r, f, d - 1, 3, g) ? t.top[g.who] : t.top[0]) : m[w - e] = s[r];
	}
	if (5 * M < 4 * i) return !1;
	for (let w = e; w < r; w++) s[n[w]] = m[w - e];
	return !0;
}
function oo(t, n, e, r, o) {
	const s = n * e, i = new Int32Array(s), a = new Int32Array(s);
	let l = null, c = 0, h = null, f = 0;
	for (let u = 0; u < r; u++) {
		let y = 0;
		const d = null === l ? s : c;
		for (let n = 0; n < d; n++) {
			const e = null === l ? n : l[n], r = o(t, e);
			r < 0 || (i[y] = e, a[y] = r, y++);
		}
		if (0 === y) break;
		for (let n = 0; n < y; n++) t[i[n]] = a[n];
		if (f += y, u + 1 < r) {
			null === h && (h = new Int32Array(s).fill(-1)), null === l && (l = new Int32Array(s)), c = 0;
			for (let t = 0; t < y; t++) {
				const r = i[t], o = r / n | 0, s = r - o * n;
				for (let t = Math.max(o - 1, 0); t < Math.min(o + 2, e); t++) for (let e = Math.max(s - 1, 0); e < Math.min(s + 2, n); e++) {
					const r = t * n + e;
					h[r] !== u && (h[r] = u, l[c++] = r);
				}
			}
		}
	}
	return f;
}
const so = [
	-1,
	0,
	1,
	-1,
	1,
	-1,
	0,
	1
], io = [
	-1,
	-1,
	-1,
	0,
	0,
	1,
	1,
	1
];
function ao(t, n, e, r, o) {
	const s = n / e | 0, i = n - s * e;
	o[0] = t[n];
	let a = 1;
	for (let l = 0; l < 8; l++) {
		const n = i + so[l], c = s + io[l];
		if (n < 0 || c < 0 || n >= e || c >= r) continue;
		const h = t[c * e + n];
		let f = !1;
		for (let t = 0; t < a; t++) o[t] === h && (f = !0);
		!f && a < 4 && (o[a++] = h);
	}
	return a;
}
function lo(t, n, e, r, o = null) {
	if (r <= 1) return;
	const s = Dr(t, n, e), i = Xr(s, (t) => s.size[t] < r), a = Jr(t, 0), l = new Vr(a), c = null === o ? null : new co(o, a);
	for (let h = 0; h < s.count; h++) {
		const r = i.offset[h], o = i.offset[h + 1];
		if (r === o) continue;
		const a = null === c ? ho(i.pixels, r, o, h, s.comp, t, n, e, l) : c.target(i.pixels, r, o, h, s.comp, t, n, e, l);
		if (!(a < 0)) for (let n = r; n < o; n++) t[i.pixels[n]] = a;
	}
}
var co = class {
	px;
	inks;
	channels;
	inkCount;
	weight;
	mean;
	constructor(t, n) {
		this.px = t.px, this.inks = t.inks, this.channels = t.channels, this.inkCount = Math.floor(t.inks.length / t.channels), this.weight = new Float64Array(n), this.mean = new Float64Array(t.channels);
	}
	target(t, n, e, r, o, s, i, a, l) {
		if (to(t, n, e, r, o, s, i, a, l), 0 === l.size) return -1;
		const { px: c, channels: h, weight: f, mean: u } = this;
		for (let g = 0; g < l.size; g++) f[l.touched[g]] = 0;
		u.fill(0);
		for (let g = n; g < e; g++) {
			const n = t[g];
			for (let t = 0; t < h; t++) u[t] += c[n * h + t];
			const e = n / i | 0, l = n - e * i;
			l > 0 && o[n - 1] !== r && this.contact(n, n - 1, s), l + 1 < i && o[n + 1] !== r && this.contact(n, n + 1, s), e > 0 && o[n - i] !== r && this.contact(n, n - i, s), e + 1 < a && o[n + i] !== r && this.contact(n, n + i, s);
		}
		const y = e - n;
		for (let g = 0; g < h; g++) u[g] /= y;
		let d = -1, p = 1 / 0;
		for (let g = 0; g < l.size; g++) {
			const t = l.touched[g];
			if (t >= this.inkCount) continue;
			let n = 0;
			for (let r = 0; r < h; r++) {
				const e = u[r] - this.inks[t * h + r];
				n += e * e;
			}
			const e = y * n - .5 * f[t];
			(e < p || e === p && t < d) && (d = t, p = e);
		}
		return d >= 0 ? d : l.commonest();
	}
	contact(t, n, e) {
		const { px: r, channels: o } = this;
		let s = 0;
		for (let i = 0; i < o; i++) {
			const e = r[t * o + i] - r[n * o + i];
			s += e * e;
		}
		this.weight[e[n]] += Math.exp(-s);
	}
};
function ho(t, n, e, r, o, s, i, a, l) {
	return to(t, n, e, r, o, s, i, a, l), l.commonest();
}
function fo(t, n, e, r) {
	const o = Math.max(r, 1);
	let s = 0;
	for (;;) {
		const r = Dr(t, n, e), i = r.count;
		if (i <= o) return s;
		const a = r.size, l = new Int32Array(i);
		for (let t = 0; t < i; t++) l[t] = t;
		l.sort((t, n) => a[t] - a[n] || t - n);
		const c = i - o, h = new Uint8Array(i);
		for (let t = 0; t < c; t++) h[l[t]] = 1;
		const f = Xr(r, (t) => 1 === h[t]), u = r.comp, y = new Vr(Jr(t, 0)), d = new Uint8Array(i);
		let p = 0;
		for (let o = 0; o < c; o++) {
			const r = l[o];
			if (0 !== d[r]) continue;
			const s = f.offset[r], i = f.offset[r + 1];
			y.clear();
			let a = !1;
			for (let o = s; o < i && !a; o++) {
				const s = f.pixels[o], i = s / n | 0, l = s - i * n;
				for (let o = 0; o < 4; o++) {
					const c = uo(s, l, i, n, e, o);
					if (c < 0) continue;
					const h = u[c];
					if (h !== r) {
						if (1 === d[h]) {
							a = !0;
							break;
						}
						y.add(t[c]);
					}
				}
			}
			const c = y.commonest();
			if (!(a || c < 0)) {
				for (let n = s; n < i; n++) t[f.pixels[n]] = c;
				d[r] = 1;
				for (let o = s; o < i; o++) {
					const s = f.pixels[o], i = s / n | 0, a = s - i * n;
					for (let o = 0; o < 4; o++) {
						const l = uo(s, a, i, n, e, o);
						if (l < 0) continue;
						const h = u[l];
						h !== r && t[l] === c && 0 === d[h] && (d[h] = 2);
					}
				}
				p++;
			}
		}
		if (s += p, 0 === p) return s;
	}
}
function uo(t, n, e, r, o, s) {
	return 0 === s ? n > 0 ? t - 1 : -1 : 1 === s ? n + 1 < r ? t + 1 : -1 : 2 === s ? e > 0 ? t - r : -1 : e + 1 < o ? t + r : -1;
}
const yo = 8 / 255;
function po(t) {
	const n = Float64Array.from(t).toSorted();
	return n[n.length >> 1];
}
function go(t, n, e, r, o) {
	if (e < 3 || r < 3) return U;
	const { interior: s, boundary: i } = mo(t, n, e, r, o), a = s.length >= 32 ? po(s) : U, l = i.length >= 32 ? po(i) : U;
	return Math.min(Math.max(a, l, U), yo);
}
function mo(t, n, e, r, o) {
	const s = [], i = [], a = .5 / 255 * (.5 / 255), l = /* @__PURE__ */ new Int32Array(4);
	for (let c = 1; c < r - 1; c++) for (let r = 1; r < e - 1; r++) {
		const h = c * e + r, f = n[h], u = t[3 * h] - o[3 * f], y = t[3 * h + 1] - o[3 * f + 1], d = t[3 * h + 2] - o[3 * f + 2];
		if (l[0] = h - 1, l[1] = h + 1, l[2] = h - e, l[3] = h + e, n[h - 1] === f && n[h + 1] === f && n[h - e] === f && n[h + e] === f) {
			const t = (u * u + y * y + d * d) / 3;
			t > a && s.push(Math.sqrt(t));
			continue;
		}
		let p = 1 / 0;
		for (let t = 0; t < 4; t++) {
			const e = n[l[t]];
			if (e === f) continue;
			const r = o[3 * e] - o[3 * f], s = o[3 * e + 1] - o[3 * f + 1], i = o[3 * e + 2] - o[3 * f + 2], a = r * r + s * s + i * i;
			if (a < 1e-8) continue;
			const c = Math.min(1, Math.max(0, (u * r + y * s + d * i) / a)), h = u - c * r, g = y - c * s, m = d - c * i;
			p = Math.min(p, Math.sqrt((h * h + g * g + m * m) / 2));
		}
		Number.isFinite(p) && i.push(p);
	}
	return {
		interior: s,
		boundary: i
	};
}
const xo = Math.fround, Mo = Float32Array.from({ length: 256 }, (t, n) => n / 255);
function wo(t) {
	const n = t.width * t.height, e = t.data, r = new Float32Array(3 * n);
	for (let o = 0; o < n; o++) {
		const t = e[4 * o + 3];
		if (1 === t) {
			r[3 * o] = e[4 * o], r[3 * o + 1] = e[4 * o + 1], r[3 * o + 2] = e[4 * o + 2];
			continue;
		}
		const n = xo(1 - t);
		r[3 * o] = xo(e[4 * o] * t) + n, r[3 * o + 1] = xo(e[4 * o + 1] * t) + n, r[3 * o + 2] = xo(e[4 * o + 2] * t) + n;
	}
	return r;
}
function bo(t) {
	const n = function(t) {
		const n = t.width * t.height * 4, e = new Float32Array(n);
		for (let r = 0; r < n; r++) e[r] = Mo[t.data[r]];
		return {
			width: t.width,
			height: t.height,
			data: e
		};
	}(t), e = t.width * t.height;
	let r = !0;
	for (let s = 0; s < e; s++) if (255 !== t.data[4 * s + 3]) {
		r = !1;
		break;
	}
	let o = null;
	if (!r) {
		o = new Float32Array(e);
		for (let t = 0; t < e; t++) o[t] = n.data[4 * t + 3];
	}
	return {
		rgb: wo(n),
		alpha: o
	};
}
const Ao = xo(.2126), ko = xo(.7152), vo = xo(.0722);
function Fo(t, n) {
	let e = 0, r = t.length - 1;
	for (; e < r;) {
		const o = t[e], s = t[e + r >>> 1], i = t[r], a = o < s ? s < i ? s : o < i ? i : o : o < i ? o : s < i ? i : s;
		let l = e, c = r;
		for (; l <= c;) {
			for (; t[l] < a;) l++;
			for (; t[c] > a;) c--;
			if (l <= c) {
				const n = t[l];
				t[l] = t[c], t[c] = n, l++, c--;
			}
		}
		if (n <= c) r = c;
		else {
			if (!(n >= l)) return t[n];
			e = l;
		}
	}
	return t[n];
}
const Io = xo(2 / 255), No = xo(1e-6);
function So(t, n, e, r, o) {
	const s = xo(n - t), i = xo(e - n), a = Math.max(Math.abs(s), Math.abs(i)), l = Math.abs(xo(i - s));
	if (a > Io && l > No) {
		const t = xo(a / l);
		if (Number.isFinite(t)) return r[o] = t < .25 ? .25 : t > 64 ? 64 : t, o + 1;
	}
	return o;
}
const Po = xo(24 / 255);
function Co(t, n) {
	return Math.round((t - 1) * n);
}
function Uo(t, n, e) {
	return xo(xo(xo(xo(4 * t[n] - t[n - 1]) - t[n + 1]) - t[n - e]) - t[n + e]);
}
function Lo(t, n, e, r) {
	const o = function(t) {
		const n = Math.floor(t.length / 3), e = new Float32Array(n);
		for (let r = 0; r < n; r++) e[r] = xo(xo(Ao * t[3 * r]) + xo(ko * t[3 * r + 1])) + xo(vo * t[3 * r + 2]);
		return e;
	}(t), s = $(o, n, e), i = function(t, n, e) {
		if (n < 3 || e < 3 || t.length < n * e * 3) return 1;
		const r = n * e, o = new Float32Array(r);
		for (let a = 0; a < r; a++) o[a] = xo(xo(xo(t[3 * a] + t[3 * a + 1]) + t[3 * a + 2]) / 3);
		const s = new Float32Array(e * (n - 2) + n * (e - 2));
		let i = 0;
		for (let a = 0; a < e; a++) for (let t = 0; t + 2 < n; t++) {
			const e = a * n + t;
			i = So(o[e], o[e + 1], o[e + 2], s, i);
		}
		for (let a = 0; a + 2 < e; a++) for (let t = 0; t < n; t++) {
			const e = a * n + t;
			i = So(o[e], o[e + n], o[e + 2 * n], s, i);
		}
		return i < 16 ? 1 : Math.max(Fo(s.subarray(0, i), i >>> 1), 1);
	}(t, n, e), a = function(t, n, e) {
		if (n < 9 || e < 9 || t.length < n * e) return 0;
		const r = function(t, n, e) {
			const r = new Uint16Array(n * e).fill(32767);
			let o = !1;
			for (let s = 1; s < e - 1; s++) for (let e = 1; e < n - 1; e++) {
				const i = s * n + e, a = xo(t[i + 1] - t[i - 1]), l = xo(t[i + n] - t[i - n]);
				xo(Math.sqrt(xo(xo(a * a) + xo(l * l)))) > Po && (r[i] = 0, o = !0);
			}
			if (!o) return null;
			for (let s = 0; s < e; s++) for (let t = 0; t < n; t++) {
				const e = s * n + t;
				let o = r[e];
				s > 0 && (o = Math.min(o, r[e - n] + 3), t > 0 && (o = Math.min(o, r[e - n - 1] + 4)), t + 1 < n && (o = Math.min(o, r[e - n + 1] + 4))), t > 0 && (o = Math.min(o, r[e - 1] + 3)), r[e] = o;
			}
			for (let s = e - 1; s >= 0; s--) for (let t = n - 1; t >= 0; t--) {
				const o = s * n + t;
				let i = r[o];
				s + 1 < e && (i = Math.min(i, r[o + n] + 3), t > 0 && (i = Math.min(i, r[o + n - 1] + 4)), t + 1 < n && (i = Math.min(i, r[o + n + 1] + 4))), t + 1 < n && (i = Math.min(i, r[o + 1] + 3)), r[o] = i;
			}
			return r;
		}(t, n, e);
		if (null === r) return 0;
		let o = 0, s = 0;
		for (let M = 1; M < e - 1; M++) for (let t = 1; t < n - 1; t++) {
			const e = r[M * n + t];
			e <= 3 ? o++ : e > 9 && e <= 21 && s++;
		}
		if (o < 64 || s < 64) return 0;
		const i = new Float32Array(o), a = new Float32Array(s), l = new Int32Array(s);
		let c = 0, h = 0;
		for (let M = 1; M < e - 1; M++) for (let e = 1; e < n - 1; e++) {
			const o = M * n + e, s = r[o];
			s <= 3 ? i[c++] = Math.abs(Uo(t, o, n)) : s > 9 && s <= 21 && (a[h] = Math.abs(Uo(t, o, n)), l[h++] = o);
		}
		const f = Math.max(Fo(i, Co(o, .5)), 1e-9), u = a.slice(), y = Fo(u, Co(s, .9)), d = Math.max(Fo(u, Co(s, .6)), 1e-9), p = y / f;
		if (p <= 0) return 0;
		const g = new Uint8Array(n * e);
		for (let M = 0; M < s; M++) a[M] > d && (g[l[M]] = 1);
		let m = 0, x = 0;
		for (let M = 0; M < s; M++) {
			const e = l[M];
			if (0 === g[e]) continue;
			const r = Uo(t, e, n), o = e + 1, s = e + n;
			1 === g[o] && (x++, xo(r * Uo(t, o, n)) < 0 && m++), 1 === g[s] && (x++, xo(r * Uo(t, s, n)) < 0 && m++);
		}
		return x < 64 ? 0 : p * (m / x);
	}(o, n, e), l = Math.min(n, e) >= 256 ? .05 : .12, c = function(t, n, e, r, o) {
		return t > 1.75 || e || n > (Math.min(r, o) >= 256 ? .05 : .12);
	}(i, a, r, n, e);
	return {
		sigmaNoise: s,
		edgeWidth: i,
		ringing: a,
		ringingGate: l,
		lossy: r,
		soft: c,
		noiseSigmas: c ? 3 : 0,
		sameInkDe00: c ? 5 : 1.5
	};
}
Object.freeze({
	edges: 0,
	softFraction: 0,
	width: 1,
	featureP10: 1 / 0,
	cores: 0,
	sharpFraction: 0
});
const $o = 4294967295, qo = Math.fround, Ro = qo(1e-9);
function zo(t, n, e) {
	return qo(qo(qo(t * t) + qo(n * n)) + qo(e * e));
}
function To(t, n, e, r, o, s, i) {
	const a = n * e, l = Math.floor(o.length / 3), c = Float32Array.from(o), h = qo(Math.max(3 * s * Math.sqrt(3), 2 / 255)), f = qo(h * h), u = new Uint32Array(3 * a).fill($o), y = /* @__PURE__ */ new Int32Array(8), d = /* @__PURE__ */ new Uint32Array(3);
	for (let p = 0; p < a; p++) {
		const o = r[p];
		if (o < 0 || o >= l) continue;
		const s = c[3 * o], a = c[3 * o + 1], h = c[3 * o + 2], g = qo(t[3 * p] - s), m = qo(t[3 * p + 1] - a), x = qo(t[3 * p + 2] - h);
		if (zo(g, m, x) <= f) continue;
		const M = p % n, w = (p - M) / n, b = Math.max(M - 2, 0), A = Math.min(M + 2, n - 1), k = Math.max(w - 2, 0), v = Math.min(w + 2, e - 1);
		let F = 0;
		d.fill($o);
		let I = 0;
		t: for (let t = k; t <= v; t++) for (let e = b; e <= A; e++) {
			const u = r[t * n + e];
			if (u === o || u < 0 || u >= l) continue;
			let p = !1;
			for (let t = 0; t < F; t++) if (y[t] === u) {
				p = !0;
				break;
			}
			if (p) continue;
			F < y.length && (y[F++] = u);
			const M = qo(c[3 * u] - s), w = qo(c[3 * u + 1] - a), b = qo(c[3 * u + 2] - h), A = zo(M, w, b);
			if (A <= Ro) continue;
			const k = qo(qo(qo(qo(g * M) + qo(m * w)) + qo(x * b)) / A);
			if (!(k <= 0 || k >= 1) && zo(qo(g - qo(k * M)), qo(m - qo(k * w)), qo(x - qo(k * b))) <= f) {
				if (3 === I) {
					d.fill(4294967294);
					break t;
				}
				if (d[I++] = t * n + e, !i) break t;
			}
		}
		u[3 * p] = d[0], u[3 * p + 1] = d[1], u[3 * p + 2] = d[2];
	}
	return u;
}
function Eo(t, n, e, r, o, s) {
	const i = To(t, n, e, r, o, s, !1), a = new Uint8Array(n * e);
	for (let l = 0; l < a.length; l++) a[l] = 4294967295 === i[3 * l] ? 1 : 0;
	return a;
}
function jo(t, n, e) {
	if (4294967294 === t[3 * n]) return !1;
	for (let r = 0; r < 3; r++) {
		const o = t[3 * n + r];
		if (4294967295 === o) break;
		if (!e(o)) return !1;
	}
	return !0;
}
const Bo = Math.fround, Oo = [
	.41222147,
	.53633255,
	.051445995,
	.2119035,
	.6806995,
	.10739696,
	.08830246,
	.28171885,
	.6299787
].map(Bo), Ko = [
	.21045426,
	.7936178,
	-.004072047,
	1.9779985,
	-2.4285922,
	.4505937,
	.025904037,
	.78277177,
	-.80867577
].map(Bo);
function Do(t, n, e, r, o) {
	return Bo(Bo(Bo(t[n] * e) + Bo(t[n + 1] * r)) + Bo(t[n + 2] * o));
}
function Ho(t, n, e, r) {
	const o = kn(Bo(t)), s = kn(Bo(n)), i = kn(Bo(e)), a = Bo(Math.cbrt(Do(Oo, 0, o, s, i))), l = Bo(Math.cbrt(Do(Oo, 3, o, s, i))), c = Bo(Math.cbrt(Do(Oo, 6, o, s, i)));
	r[0] = Do(Ko, 0, a, l, c), r[1] = Do(Ko, 3, a, l, c), r[2] = Do(Ko, 6, a, l, c);
}
function Xo(t) {
	return t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
function Wo(t, n, e, r) {
	const o = kn(Bo(t)), s = kn(Bo(n)), i = kn(Bo(e)), a = .2126729 * o + .7151522 * s + .072175 * i, l = (.0193339 * o + .119192 * s + .9503041 * i) / 1.08883, c = Xo((.4124564 * o + .3575761 * s + .1804375 * i) / .95047), h = Xo(a), f = Xo(l);
	r[0] = Bo(116 * h - 16), r[1] = Bo(500 * (c - h)), r[2] = Bo(200 * (h - f));
}
const Go = /* @__PURE__ */ new Float64Array(3), Zo = /* @__PURE__ */ new Float64Array(3);
function Qo(t) {
	const n = Bo(Bo(Go[0] * t) - Bo(Zo[0] * t)), e = Bo(Bo(Go[1] * t) - Bo(Zo[1] * t)), r = Bo(Bo(Go[2] * t) - Bo(Zo[2] * t));
	return Bo(Bo(Bo(n * n) + Bo(e * e)) + Bo(r * r));
}
function Yo(t, n, e) {
	const r = [...t[e]].toSorted((t, n) => t[0] - n[0]);
	t[e] = /* @__PURE__ */ new Map();
	for (const [o, s] of r) {
		if (o === n) continue;
		t[n].set(o, (t[n].get(o) ?? 0) + s);
		const r = t[o];
		r.delete(e), r.set(n, (r.get(n) ?? 0) + s);
	}
	t[n].delete(e);
}
function _o(t) {
	let n = t;
	if (t > 65536) {
		const e = Math.floor(t / 65536), r = t % e;
		n = (t - r) / e + (r > 0 ? 1 : 0);
	}
	return n + 13 * Math.min(n, jn);
}
function Vo(t) {
	return t + Math.min(t, jn);
}
var Jo = class {
	cap;
	spent = 0;
	stopped = !1;
	constructor(t, n, e) {
		this.cap = e ?? function(t, n, e = 16777216) {
			return Math.max(e, 32 * t * n);
		}(t, n);
	}
	charge(t) {
		const n = this.spent + t;
		return n > this.cap ? (this.stopped = !0, !1) : (this.spent = n, !0);
	}
};
const ts = /* @__PURE__ */ new Int32Array(0);
var ns = class {
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
		const { labels: n, rgb: e, w: r, h: o, inkRgb: s, sigmaNoise: i, lambda: a, regionRecovery: l } = t;
		this.nInk = Math.floor(s.length / 3);
		let c = this.nInk;
		for (let g = 0; g < n.length; g++) n[g] + 1 > c && (c = n[g] + 1);
		this.nPal = c;
		const { comp: h, members: f, compLabel: u } = function(t, n, e) {
			const r = n * e, o = new Int32Array(r).fill(-1), s = new Int32Array(r), i = new Int32Array(r), a = [], l = [];
			for (let c = 0; c < r; c++) {
				if (-1 !== o[c]) continue;
				const e = a.length, h = t[c];
				let f = 0, u = 0;
				for (s[f++] = c, o[c] = e; f > 0;) {
					const a = s[--f];
					i[u++] = a;
					const l = a % n;
					l > 0 && -1 === o[a - 1] && t[a - 1] === h && (o[a - 1] = e, s[f++] = a - 1), l + 1 < n && -1 === o[a + 1] && t[a + 1] === h && (o[a + 1] = e, s[f++] = a + 1), a >= n && -1 === o[a - n] && t[a - n] === h && (o[a - n] = e, s[f++] = a - n), a + n < r && -1 === o[a + n] && t[a + n] === h && (o[a + n] = e, s[f++] = a + n);
				}
				a.push(i.slice(0, u)), l.push(h);
			}
			return {
				comp: o,
				members: a,
				compLabel: l
			};
		}(n, r, o);
		this.group = h, this.buf = f, this.size = Int32Array.from(f, (t) => t.length), this.compLabel = u, this.ink = new Float32Array(3 * c);
		for (let g = 0; g < 3 * this.nInk; g++) this.ink[g] = s[g];
		const y = To(e, r, o, n, this.ink, i, l), d = new Uint8Array(r * o);
		for (let g = 0; g < d.length; g++) d[g] = 4294967295 === y[3 * g] ? 1 : 0;
		const p = t.scale;
		this.fitter = {
			rgb: e,
			w: r,
			h: o,
			sigmaNoise: i,
			lambda: a,
			pure: d,
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
		this.buf[t].set(e, this.size[t]), this.size[t] = r, this.buf[n] = ts, this.size[n] = 0;
	}
	apply(t) {
		for (let n = 0; n + 1 < t.length; n += 2) this.absorb(t[n], t[n + 1]);
	}
	fit(t, n, e) {
		const { rgb: r, w: o, h: s, sigmaNoise: i, lambda: a, pure: l, partner: c, gradients: h, minPixels: f } = this.fitter, u = this.group, y = (e) => u[e] === t || u[e] === n;
		return function(t, n, e, r, o, s, i, a, l, c = !0, h = 16, f = He) {
			const u = r.length + o.length, y = function(t, n) {
				const e = t.length, r = e + n.length, o = r <= 65536 ? 1 : Math.floor(r / 65536), s = new Int32Array(Math.ceil(r / o));
				let i = 0;
				for (let a = 0; a < r; a += o) s[i++] = a < e ? t[a] : n[a - e];
				return s;
			}(r, o), d = Ze(Qe(t, n, e, y, s, i, a, l, c, h, f));
			if (y.length >= u) return d;
			const p = u / y.length, g = d.cost - .5 * d.chi2, m = d.chi2 * p;
			return {
				model: d.model,
				params: d.params,
				chi2: m,
				cost: g + .5 * m
			};
		}(r, o, s, this.members(t), t === n ? ts : this.members(n), y, (t) => 1 === l[t] || e && jo(c, t, y), i, a, h, f, this.fitter.search);
	}
};
function es(t, n, e) {
	t[n].set(e, (t[n].get(e) ?? 0) + 1), t[e].set(n, (t[e].get(n) ?? 0) + 1);
}
var rs = class {
	parts;
	adj;
	smooth;
	sharp;
	innerBlends;
	budget;
	minShared;
	nComp;
	size;
	group;
	compLabel;
	ink;
	fits = [];
	alive;
	cache = /* @__PURE__ */ new Map();
	gains = /* @__PURE__ */ new Map();
	rampSteps = /* @__PURE__ */ new Map();
	merged = [];
	constructor(t, n, e, r, o, s, i) {
		this.parts = t, this.adj = n, this.smooth = e, this.sharp = r, this.innerBlends = o, this.budget = s, this.minShared = i, this.nComp = t.count, this.size = t.size, this.group = t.group, this.compLabel = t.compLabel, this.ink = t.ink, this.alive = new Uint8Array(this.nComp).fill(1);
	}
	members(t) {
		return this.parts.members(t);
	}
	batch(t, n, e) {
		const r = this.parts, o = Int32Array.from(t), s = Int32Array.from(n), i = Uint8Array.from(e, (t) => t ? 1 : 0), a = new Float64Array(o.length);
		for (let c = 0; c < o.length; c++) a[c] = _o(this.size[o[c]] + (s[c] === o[c] ? 0 : this.size[s[c]]));
		const l = Int32Array.from(this.merged);
		return this.merged = [], {
			source: r.source,
			merges: l,
			a: o,
			b: s,
			inner: i,
			work: a,
			fit: (t) => r.fit(o[t], s[t], 1 === i[t])
		};
	}
	*fitComponents() {
		const t = Array.from({ length: this.nComp }, (t, n) => n);
		this.fits = yield this.batch(t, t, t.map(() => this.innerBlends));
	}
	key(t, n) {
		return t * this.nComp + n;
	}
	smoothPair(t, n) {
		return this.innerBlends && function(t, n, e, r) {
			const o = t[e].get(r) ?? 0, s = n[e].get(r) ?? 0;
			return o > 0 && s >= .5 * o;
		}(this.adj, this.smooth, t, n);
	}
	rampStep(t, n) {
		if (!this.smoothPair(t, n)) return !1;
		const e = this.compLabel[t], r = this.compLabel[n], o = e * (this.ink.length / 3) + r;
		let s = this.rampSteps.get(o);
		if (void 0 === s) {
			const t = this.ink, n = 3 * e, i = 3 * r;
			s = function(t, n, e, r, o, s) {
				Wo(t, n, e, Go), Wo(r, o, s, Zo);
				const i = d(Go[0], Go[1], Go[2], Zo[0], Zo[1], Zo[2]);
				return Number.isNaN(i) ? 0 : Bo(i);
			}(t[n], t[n + 1], t[n + 2], t[i], t[i + 1], t[i + 2]) < 15, this.rampSteps.set(o, s);
		}
		return s;
	}
	worthAUnion(t, n) {
		return (Cn(this.fits[t].model) || Cn(this.fits[n].model) || this.rampStep(t, n)) && !this.acrossEdge(t, n);
	}
	acrossEdge(t, n) {
		const { minPixels: e } = this.parts.fitter;
		return this.size[t] >= e && this.size[n] >= e && function(t, n, e, r) {
			const o = t[e].get(r) ?? 0;
			return 2 * (n[e].get(r) ?? 0) > o;
		}(this.adj, this.sharp, t, n);
	}
	*run() {
		for (;;) {
			const t = this.missingUnions();
			if (t.length > 0) {
				let n = 0;
				for (const e of t) {
					const t = Math.floor(e / this.nComp);
					n += _o(this.size[t] + this.size[e - t * this.nComp]);
				}
				if (!this.budget.charge(n)) break;
				yield* this.fitWave(t);
			}
			const n = yield* this.pickMerge();
			if (null === n) break;
			this.applyMerge(n.a, n.b);
		}
	}
	missingUnions() {
		const t = [];
		for (let n = 0; n < this.nComp; n++) if (0 !== this.alive[n]) for (const [e, r] of this.adj[n]) {
			if (e <= n || r < this.minShared) continue;
			if (!this.worthAUnion(n, e)) continue;
			const o = this.key(n, e);
			this.cache.has(o) || t.push(o);
		}
		return t.toSorted((t, n) => t - n);
	}
	*fitWave(t) {
		const n = t.map((t) => Math.floor(t / this.nComp)), e = t.map((t, e) => t - n[e] * this.nComp), r = yield this.batch(n, e, n.map((t, n) => this.smoothPair(t, e[n])));
		for (let o = 0; o < t.length; o++) {
			const s = t[o];
			this.gains.delete(s), this.cache.set(s, {
				a: n[o],
				b: e[o],
				fit: r[o],
				stale: !1
			});
		}
	}
	*pickMerge() {
		for (;;) {
			if (!this.budget.charge(this.pendingGainWork())) return null;
			const t = this.bestGain();
			if (null === t) return null;
			const { a: n, b: e } = t, r = this.key(n, e);
			if (!this.cache.get(r).stale) return t;
			if (!this.budget.charge(_o(this.size[n] + this.size[e]))) return null;
			const [o] = yield this.batch([n], [e], [this.smoothPair(n, e)]);
			this.cache.set(r, {
				a: n,
				b: e,
				fit: o,
				stale: !1
			}), this.gains.delete(r);
		}
	}
	pendingGainWork() {
		let t = 0;
		for (let n = 0; n < this.nComp; n++) if (0 !== this.alive[n]) for (const [e, r] of this.adj[n]) {
			if (e <= n || r < this.minShared) continue;
			const o = this.key(n, e);
			if (!this.worthAUnion(n, e) || this.gains.has(o)) continue;
			const s = this.cache.get(o);
			void 0 !== s && Cn(s.fit.model) && this.smoothPair(n, e) && (t += Vo(this.size[n] + this.size[e]));
		}
		return t;
	}
	bestGain() {
		let t = null;
		for (let n = 0; n < this.nComp; n++) if (0 !== this.alive[n]) for (const [e, r] of this.adj[n]) {
			if (e <= n || r < this.minShared) continue;
			if (!this.worthAUnion(n, e)) continue;
			const o = this.pairGain(n, e);
			null !== o && (null === t ? o > 0 : o > t.gain || o === t.gain && (n < t.a || n === t.a && e < t.b)) && (t = {
				gain: o,
				a: n,
				b: e
			});
		}
		return t;
	}
	pairGain(t, n) {
		const e = this.key(t, n), r = this.cache.get(e);
		if (void 0 === r) return null;
		const o = r.fit;
		if (!Cn(o.model)) return null;
		if (!this.smoothPair(t, n)) return this.fits[t].cost + this.fits[n].cost - o.cost;
		const s = this.gains.get(e);
		if (void 0 !== s) return s;
		const { rgb: i, w: a, h: l, sigmaNoise: c, lambda: h, pure: f, partner: u } = this.parts.fitter, y = this.group, d = this.members(t), p = new Int32Array(d.length + this.size[n]);
		p.set(d, 0), p.set(this.members(n), d.length);
		const g = (e) => y[e] === t || y[e] === n, m = function(t, n, e, r, o, s, i, a, l, c, h, f) {
			const u = Dn(t, n, e, r, o, i, !0);
			if (0 === u.n) return null;
			const y = Bn(u.n), d = new $n(Tn(a.model)), p = new $n(Tn(l.model)), g = new $n(Tn(c.model)), m = /* @__PURE__ */ new Float32Array(3), x = /* @__PURE__ */ new Float32Array(3);
			let M = 0, w = 0;
			for (let A = 0; A < u.n; A += y) {
				(s(u.px[A]) ? d : p).colorAt(u.x[A], u.y[A], m, 0), g.colorAt(u.x[A], u.y[A], x, 0);
				for (let t = 0; t < 3; t++) {
					const n = u.srgb[3 * A + t], e = Math.max(Math.abs(Math.fround(n - m[t])) - ke, 0), r = Math.max(Math.abs(Math.fround(n - x[t])) - ke, 0);
					M += e * e - r * r;
				}
				w++;
			}
			const b = .5 * M / (h * h) * u.n / w + f * (a.params + l.params - c.params);
			return Number.isFinite(b) ? b : null;
		}(i, a, l, p, g, (n) => y[n] === t, (t) => 1 === f[t] || jo(u, t, g), this.fits[t], this.fits[n], o, c, h) ?? -1 / 0;
		return this.gains.set(e, m), m;
	}
	applyMerge(t, n) {
		const e = this.key(t, n);
		this.fits[t] = this.cache.get(e).fit, this.cache.delete(e), this.parts.absorb(t, n), this.merged.push(t, n), this.alive[n] = 0, Yo(this.adj, t, n), Yo(this.smooth, t, n), Yo(this.sharp, t, n);
		for (const r of this.gains.keys()) {
			const e = Math.floor(r / this.nComp), o = r - e * this.nComp;
			e !== t && o !== t && e !== n && o !== n || this.gains.delete(r);
		}
		for (const [r, o] of this.cache) {
			const { a: e, b: s } = o, i = e === t || s === t;
			e === n || s === n || !Cn(o.fit.model) && i || this.innerBlends && i ? this.cache.delete(r) : i && (o.stale = !0);
		}
	}
	writeBack(t, n, e) {
		const { rgb: r, w: o, h: s, sigmaNoise: i, lambda: a, pure: l, minPixels: c } = this.parts.fitter, h = this.group, f = [], u = [];
		for (let g = 0; g < e; g++) {
			const t = 3 * g, e = g < n ? [
				this.ink[t],
				this.ink[t + 1],
				this.ink[t + 2]
			] : [
				0,
				0,
				0
			];
			f.push(zn(e, a)), u.push(g);
		}
		const y = Array.from({ length: e }, () => []), d = new Uint8Array(e);
		for (let g = 0; g < this.nComp; g++) {
			if (0 === this.alive[g]) continue;
			const n = this.members(g), e = Cn(this.fits[g].model), r = f.length < Wr, i = !e && r && Kn(n, o, s, (t) => h[t] === g) >= c, a = r && (e || i);
			if (a) {
				const e = f.length;
				for (let r = 0; r < n.length; r++) t[n[r]] = e;
				f.push(this.fits[g]), u.push(this.compLabel[g]);
			} else d[this.compLabel[g]] = 1;
			e && a || y[this.compLabel[g]].push(g);
		}
		const p = new Int32Array(o * s).fill(-1);
		for (let g = 0; g < e; g++) {
			if (0 === d[g]) continue;
			let t = 0;
			for (const e of y[g]) t += this.size[e];
			const n = new Int32Array(t);
			t = 0;
			for (const e of y[g]) {
				const r = this.members(e);
				for (let t = 0; t < r.length; t++) p[r[t]] = g;
				n.set(r, t), t += r.length;
			}
			f[g] = Qe(r, o, s, n, (t) => p[t] === g, (t) => 1 === l[t], i, a)[0];
		}
		return {
			fills: f,
			inks: u
		};
	}
};
const os = Math.fround;
function ss(t, n) {
	const e = Math.floor(t.length / 3), r = new Float64Array(3 * n.length);
	for (let o = 0; o < n.length; o++) {
		const s = o < e ? [
			t[3 * o],
			t[3 * o + 1],
			t[3 * o + 2]
		] : qn(n[o].model);
		r[3 * o] = s[0], r[3 * o + 1] = s[1], r[3 * o + 2] = s[2];
	}
	return r;
}
function is(t, n, e, r) {
	const o = t[r], s = r % n;
	return s > 0 && s + 1 < n && r >= n && r + n < n * e && t[r - 1] === o && t[r + 1] === o && t[r - n] === o && t[r + n] === o;
}
function as(t, n, e, r, o, s) {
	if (r < 3 || o < 3 || r + 3 >= n || o + 3 >= e) return !1;
	for (let i = o - 3; i <= o + 3; i++) for (let e = r - 3; e <= r + 3; e++) if (t[i * n + e] !== s) return !1;
	return !0;
}
function ls(t, n, e, r, o, s, i, a) {
	const l = e[s], c = r * o;
	let h = 0, f = 0;
	i[h++] = s, n[s] = 1;
	const u = (r) => {
		1 === t[r] && 0 === n[r] && e[r] === l && (n[r] = 1, i[h++] = r);
	};
	for (; h > 0;) {
		const t = i[--h];
		a[f++] = t;
		const n = t % r;
		n > 0 && u(t - 1), n + 1 < r && u(t + 1), t >= r && u(t - r), t + r < c && u(t + r);
	}
	return f;
}
function cs(t, n) {
	const e = new Float32Array(n.length), r = [
		0,
		0,
		0
	];
	for (let o = 0; o < 3; o++) {
		for (let r = 0; r < n.length; r++) e[r] = t[3 * n[r] + o];
		e.sort(), r[o] = e[n.length >> 1];
	}
	return r;
}
function hs(t, n, e) {
	let r = e, o = 1 / 0;
	for (let s = 0; 3 * s < t.length; s++) {
		const e = os(t[3 * s] - n[0]), i = os(t[3 * s + 1] - n[1]), a = os(t[3 * s + 2] - n[2]), l = os(os(os(e * e) + os(i * i)) + os(a * a));
		l < o && (r = s, o = l);
	}
	return r;
}
const fs = Math.fround;
function us(t) {
	let n = "#";
	for (let e = 0; e < 3; e++) n += Math.min(Math.max(Math.round(fs(255 * t[e])), 0), 255).toString(16).padStart(2, "0");
	return n;
}
function ys(t) {
	return "flat" === t.kind ? [t.color] : [
		t.c0,
		...t.mids.map((t) => t.color),
		t.c1
	];
}
const ds = 1 / 255;
function ps(t, n = ds) {
	if ("flat" === t.kind) return null;
	const e = [
		0,
		...t.mids.map((t) => t.offset),
		1
	], r = ys(t), o = [{
		offset: 0,
		color: us(r[0])
	}], s = new $n(t), i = (t, e) => {
		const r = Math.round((t + e) / 2 * 1e3) / 1e3;
		r <= t || r >= e || function(t, n, e) {
			const r = ms(t, n), o = ms(t, e);
			let s = 0;
			for (let i = 1; i < 8; i++) {
				const a = i / 8, l = ms(t, n + (e - n) * a);
				for (let t = 0; t < 3; t++) s = Math.max(s, Math.abs(r[t] + (o[t] - r[t]) * a - l[t]));
			}
			return s;
		}(s, t, e) <= n || (i(t, r), o.push({
			offset: r,
			color: us(ms(s, r))
		}), i(r, e));
	};
	for (let l = 0; l + 1 < e.length; l++) "linearRgb" === t.interp && i(e[l], e[l + 1]), o.push({
		offset: e[l + 1],
		color: us(r[l + 1])
	});
	if ("linear" === t.kind) return {
		kind: "linear",
		x1: t.p0[0],
		y1: t.p0[1],
		x2: t.p1[0],
		y2: t.p1[1],
		stops: o
	};
	const a = {
		kind: "radial",
		cx: t.c[0],
		cy: t.c[1],
		r: t.r,
		stops: o
	};
	return 1 === t.aspect ? a : {
		...a,
		aspect: t.aspect,
		angle: t.angle
	};
}
function gs(t, n, e = ds) {
	if (!Cn(t)) return null;
	const r = ps("flat" === n.kind ? {
		...t,
		interp: "srgb",
		c0: n.color,
		c1: n.color,
		mids: t.mids.map((t) => ({
			offset: t.offset,
			color: n.color
		}))
	} : n, e);
	if (null === r) return null;
	const o = [
		0,
		...t.mids.map((t) => t.offset),
		1
	], s = ys(t).map((t) => Math.min(Math.max(t[0], 0), 1)), i = r.stops.map((t) => {
		const n = Math.round(1e3 * ((t) => {
			for (let n = 1; n < o.length; n++) if (t <= o[n] || n === o.length - 1) {
				const e = o[n] - o[n - 1], r = e > 0 ? Math.min(Math.max((t - o[n - 1]) / e, 0), 1) : 1;
				return s[n - 1] + (s[n] - s[n - 1]) * r;
			}
			return s[0];
		})(t.offset)) / 1e3;
		return n < 1 ? {
			...t,
			opacity: n
		} : t;
	});
	return {
		...r,
		stops: i
	};
}
function ms(t, n) {
	const e = [
		0,
		0,
		0
	];
	return t.colorAtT(n, e, 0), e;
}
const xs = Math.fround, Ms = xs(.999), ws = xs(.02), bs = xs(.5), As = xs(.05), ks = xs(.995), vs = xs(.005), Fs = xs(.5), Is = xs(.4), Ns = xs(.8);
function Ss(t, n, e, r, o, s) {
	const i = xs(xs(1 - (r < 0 ? 0 : r > 1 ? 1 : r)) * Fs);
	o[s] = Math.max(xs(t - i), 0), o[s + 1] = Math.max(xs(n - i), 0), o[s + 2] = Math.max(xs(e - i), 0);
}
function Ps(t, n, e, r, o, s) {
	const i = pr(t, n, e);
	if (o[s] = i[0], o[s + 1] = i[1], o[s + 2] = i[2], r >= Ms) return o[s + 3] = i[0], o[s + 4] = i[1], void (o[s + 5] = i[2]);
	const a = [
		0,
		0,
		0
	];
	Ss(t, n, e, r, a, 0);
	const l = pr(a[0], a[1], a[2]);
	o[s + 3] = l[0], o[s + 4] = l[1], o[s + 5] = l[2];
}
function Cs(t) {
	const n = new Float64Array(6 * t.count), e = [
		0,
		0,
		0
	];
	for (let r = 0; r < t.count; r++) {
		const o = 6 * r, s = r < t.alpha.length ? t.alpha[r] : 1;
		if (n[o] = t.inkLab[3 * r], n[o + 1] = t.inkLab[3 * r + 1], n[o + 2] = t.inkLab[3 * r + 2], s >= Ms) {
			n[o + 3] = n[o], n[o + 4] = n[o + 1], n[o + 5] = n[o + 2];
			continue;
		}
		Ss(t.inkRgb[3 * r], t.inkRgb[3 * r + 1], t.inkRgb[3 * r + 2], s, e, 0);
		const i = pr(e[0], e[1], e[2]);
		n[o + 3] = i[0], n[o + 4] = i[1], n[o + 5] = i[2];
	}
	return n;
}
function Us(t, n, e, r) {
	const o = Ls(t, n, e, r), s = Ls(t, n + 3, e, r + 3);
	return s > o ? s : o;
}
function Ls(t, n, e, r) {
	const o = xs(t[n] - e[r]), s = xs(t[n + 1] - e[r + 1]), i = xs(t[n + 2] - e[r + 2]);
	return xs(Math.sqrt(xs(xs(xs(o * o) + xs(s * s)) + xs(i * i))));
}
function $s(t, n) {
	const e = gr(t[n], t[n + 1], t[n + 2]), r = gr(t[n + 3], t[n + 4], t[n + 5]), o = xs(xs(xs(xs(e[0] - r[0]) + xs(e[1] - r[1])) + xs(e[2] - r[2])) / 3);
	return function(t) {
		const n = t < 0 ? 0 : t > 1 ? 1 : t;
		return n > ks ? 1 : n < vs ? 0 : xs(n);
	}(xs(1 - xs(o / Fs)));
}
function qs(t, n, e) {
	return 24 * Math.min(Math.round(xs(23 * Bs(t))), 23) * 24 + 24 * Math.round(xs(23 * Bs(xs(xs(n + Is) / Ns)))) + Math.round(xs(23 * Bs(xs(xs(e + Is) / Ns))));
}
function Rs(t, n, e, r, o) {
	const s = gr(t[n], t[n + 1], t[n + 2]), i = gr(t[n + 3], t[n + 4], t[n + 5]);
	e ? (r[o] = ur(s[0]), r[o + 1] = ur(s[1]), r[o + 2] = ur(s[2]), r[o + 3] = ur(i[0]), r[o + 4] = ur(i[1]), r[o + 5] = ur(i[2])) : (r[o] = s[0], r[o + 1] = s[1], r[o + 2] = s[2], r[o + 3] = i[0], r[o + 4] = i[1], r[o + 5] = i[2]);
}
function zs(t, n, e, r, o) {
	const s = (t) => {
		const n = t < 0 ? 0 : t > 1 ? 1 : t;
		return e ? yr(n) : n;
	}, i = pr(s(t[n]), s(t[n + 1]), s(t[n + 2])), a = pr(s(t[n + 3]), s(t[n + 4]), s(t[n + 5]));
	r[o] = i[0], r[o + 1] = i[1], r[o + 2] = i[2], r[o + 3] = a[0], r[o + 4] = a[1], r[o + 5] = a[2];
}
function Ts(t) {
	const n = t.alpha;
	return (t, e) => {
		const r = t >= 0 && t < n.length ? n[t] : 1, o = e >= 0 && e < n.length ? n[e] : 1;
		return Math.abs(xs(r - o)) < As;
	};
}
function Es(t, n, e, r, o) {
	let s = Math.imul(2654435769 ^ t, 2246822507);
	return s = Math.imul(s ^ s >>> 15 ^ n, 3266489909), s = Math.imul(s ^ s >>> 13 ^ e, 668265263), s = Math.imul(s ^ s >>> 16 ^ r, 374761393), s ^= s >>> 15, s & o;
}
function js(t, n) {
	const e = Math.min(Math.floor(t.length / 3), n.length), r = new Uint32Array(t.buffer, t.byteOffset, 3 * Math.floor(t.length / 3)), o = new Uint32Array(n.buffer, n.byteOffset, n.length), s = new Int32Array(e);
	let i = 1024, a = i - 1, l = new Int32Array(i).fill(-1), c = new Uint32Array(4 * i), h = new Int32Array(i), f = 0, u = -1;
	for (let y = 0; y < e; y++) {
		const t = r[3 * y], n = r[3 * y + 1], e = r[3 * y + 2], d = o[y];
		if (u >= 0 && c[4 * u] === t && c[4 * u + 1] === n && c[4 * u + 2] === e && c[4 * u + 3] === d) {
			s[y] = u;
			continue;
		}
		let p = Es(t, n, e, d, a), g = l[p];
		for (; g >= 0 && (c[4 * g] !== t || c[4 * g + 1] !== n || c[4 * g + 2] !== e || c[4 * g + 3] !== d);) p = p + 1 & a, g = l[p];
		if (g < 0) {
			if (g = f++, g >= h.length) {
				const t = new Uint32Array(2 * c.length);
				t.set(c), c = t;
				const n = new Int32Array(2 * h.length);
				n.set(h), h = n;
			}
			if (c[4 * g] = t, c[4 * g + 1] = n, c[4 * g + 2] = e, c[4 * g + 3] = d, h[g] = y, l[p] = g, 2 * f > i) {
				i *= 2, a = i - 1, l = new Int32Array(i).fill(-1);
				for (let t = 0; t < f; t++) {
					let n = Es(c[4 * t], c[4 * t + 1], c[4 * t + 2], c[4 * t + 3], a);
					for (; l[n] >= 0;) n = n + 1 & a;
					l[n] = t;
				}
			}
		}
		s[y] = g, u = g;
	}
	return {
		cid: s,
		reps: h.slice(0, f),
		count: f
	};
}
function Bs(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
const Os = Math.fround, Ks = [
	1,
	1,
	1,
	0
];
function Ds(t, n, e, r) {
	for (let o = 0; o < 4; o++) t[4 * n + o] = Os(e[4 * r + o]);
}
const Hs = Math.fround, Xs = Hs(.02), Ws = Hs(.004), Gs = Hs(.012), Zs = Hs(1.6), Qs = Hs(.04), Ys = Hs(_e), _s = Hs(.02), Vs = Hs(1e-9), Js = Hs(1e-12), ti = Hs(.15), ni = Hs(1 + ti), ei = 34028234663852886e22, ri = [
	1,
	1,
	1,
	.5,
	.5,
	.5
];
var oi = class {
	img;
	pts;
	sixSrgb;
	sixLin;
	constructor(t, n, e, r, o) {
		const s = e.count;
		this.pts = new Float64Array(6 * s), this.sixSrgb = new Float64Array(6 * s), this.sixLin = new Float64Array(6 * s);
		for (let i = 0; i < s; i++) {
			const r = e.reps[i], o = 6 * i;
			Ps(t[3 * r], t[3 * r + 1], t[3 * r + 2], n[r], this.pts, o), Rs(this.pts, o, !1, this.sixSrgb, o), Rs(this.pts, o, !0, this.sixLin, o);
		}
		this.img = new Cr(e, r, o);
	}
	get points() {
		return this.img.colors;
	}
}, si = class t {
	srgb = [];
	lin = [];
	scratch = /* @__PURE__ */ new Float64Array(6);
	get count() {
		return this.srgb.length / 6;
	}
	push(t, n) {
		const e = this.scratch;
		Rs(t, n, !1, e, 0);
		for (let r = 0; r < 6; r++) this.srgb.push(e[r]);
		Rs(t, n, !0, e, 0);
		for (let r = 0; r < 6; r++) this.lin.push(e[r]);
	}
	static of(n) {
		const e = new t();
		for (let t = 0; t + 6 <= n.length; t += 6) e.push(n, t);
		return e;
	}
};
function ii(t, n, e, r) {
	let o = 0;
	for (let s = 0; s < 6; s++) {
		const i = Hs(t[n + s] - e[r + s]);
		o = Hs(o + Hs(i * i));
	}
	return Hs(Math.sqrt(o));
}
function ai(t, n, e, r, o) {
	let s = 1 / 0;
	for (let i = 0; i < r; i++) for (let a = i + 1; a < r; a++) {
		const r = 6 * i, l = 6 * a;
		let c = 0, h = 0;
		for (let o = 0; o < 6; o++) {
			const s = Hs(e[l + o] - e[r + o]);
			c = Hs(c + Hs(s * s)), h = Hs(h + Hs(Hs(t[n + o] - e[r + o]) * s));
		}
		if (c < Js) continue;
		const f = Math.min(ni, Math.max(-ti, Hs(h / c)));
		for (let t = 0; t < 6; t++) o[t] = Hs(e[r + t] + Hs(Hs(e[l + t] - e[r + t]) * f));
		s = Math.min(s, ii(t, n, o, 0));
	}
	for (let i = 0; i < r - 1; i++) {
		const r = 6 * i;
		let a = 0, l = 0;
		for (let o = 0; o < 6; o++) a = Hs(a + Hs(e[r + o] * e[r + o])), l = Hs(l + Hs(t[n + o] * e[r + o]));
		if (a < Js) continue;
		const c = Math.min(ni, Math.max(1, Hs(l / a)));
		for (let t = 0; t < 6; t++) o[t] = Hs(e[r + t] * c);
		s = Math.min(s, ii(t, n, o, 0));
	}
	return s;
}
const li = [
	-1,
	-1,
	0,
	-1,
	1,
	-1,
	-1,
	0,
	1,
	0,
	-1,
	1,
	0,
	1,
	1,
	1
];
function ci(t, n, e, r, o, s) {
	let i = 0;
	for (let a = 0; a < 6; a++) i = Hs(i + Hs(Hs(t[n + a] - e[r + a]) * o[a]));
	return Hs(i / s);
}
function hi(t, n, e, r, o, s, i, a, l) {
	if (!n.geometry) return !1;
	const c = a ? i.lin : i.srgb, h = 6 * o, f = 6 * s, u = /* @__PURE__ */ new Float64Array(6);
	let y = 0;
	for (let F = 0; F < 6; F++) u[F] = Hs(c[f + F] - c[h + F]), y = Hs(y + Hs(u[F] * u[F]));
	if (y < Vs) return !1;
	const d = /* @__PURE__ */ new Float64Array(6);
	Rs(e, r, a, d, 0);
	const p = ci(d, 0, c, h, u, y), g = Math.max(Math.min(Ys, Hs(.5 * p)), _s), m = Math.max(Math.min(Ys, Hs(.5 * Hs(1 - p))), _s), x = Hs(p - g), M = Hs(p + m), w = a ? t.sixLin : t.sixSrgb, b = n.colors;
	for (let F = 0; F < b.length; F++) {
		const t = ci(w, 6 * b[F], c, h, u, y);
		l[b[F]] = (t < x ? 1 : 0) | (t > M ? 2 : 0);
	}
	l[n.outside] = 0;
	const A = n.ids, k = A.length / 9 * .5;
	let v = 0;
	for (let F = 0; F < A.length; F += 9) {
		let t = 0;
		for (let n = 0; n < 9; n++) t |= l[A[F + n]];
		if (3 === t && v++, v >= k) return !0;
		if (v + (A.length - F - 9) / 9 < k) return !1;
	}
	return v >= k;
}
var fi = class {
	view;
	ev;
	inks = [];
	clear = [];
	six = new si();
	nearest;
	nearestInk;
	claim;
	scratch;
	totalPx;
	merge;
	constructor(t, n, e) {
		this.view = t, this.ev = n;
		const r = t.points;
		this.nearest = new Float64Array(r).fill(1 / 0), this.nearestInk = new Int32Array(r).fill(-1), this.claim = Sr(r), this.scratch = new Uint8Array(r + 1), this.totalPx = Math.max(t.img.n, 1), this.merge = Hs(e);
	}
	get count() {
		return this.clear.length;
	}
	visibleCount() {
		let t = 0;
		for (const n of this.clear) n || t++;
		return t;
	}
	claimOf(t, n) {
		const e = this.view.img, r = this.view.pts, o = this.claim;
		let s = 0;
		for (let i = 0; i < e.colors; i++) {
			const a = Us(r, 6 * i, t, n);
			o.dist[i] = a;
			const l = a < this.nearest[i];
			o.claimed[i] = l ? 1 : 0, l && (s += e.count[i]);
		}
		return s * e.stride;
	}
	accepts(t, n, e) {
		const { sigmaNoise: r, lambda: o, noiseSigmas: s, sameInkDe00: i } = this.ev, a = this.view, l = this.claimOf(t, n), c = 0 === s ? 0 : a.img.spread(this.claim, this.merge), h = Hs(Hs(l) / Hs(this.totalPx)) < Ws && !function(t, n) {
			if (0 === t.length) return !0;
			if (n) return !1;
			for (const e of t) if (!e) return !1;
			return !0;
		}(this.clear, e);
		let f = 1 / 0;
		for (let x = 0; x < this.count; x++) {
			const e = Us(this.inks, 6 * x, t, n);
			e < f && (f = e);
		}
		const u = Hs(Hs(s) * c);
		if (function(t, n, e, r, o) {
			if (0 === r) return !1;
			let s = 0, i = Us(e, 0, t, n);
			for (let a = 1; a < r; a++) {
				const r = Us(e, 6 * a, t, n);
				r < i && (s = a, i = r);
			}
			return function(t, n, e, r) {
				const o = gr(t[n], t[n + 1], t[n + 2]), s = gr(e[r], e[r + 1], e[r + 2]), i = gr(t[n + 3], t[n + 4], t[n + 5]), a = gr(e[r + 3], e[r + 4], e[r + 5]);
				return Math.max(wr(o[0], o[1], o[2], s[0], s[1], s[2]), wr(i[0], i[1], i[2], a[0], a[1], a[2]));
			}(t, n, e, 6 * s) < o;
		}(t, n, this.inks, this.count, i)) return !1;
		const y = f <= Math.max(this.merge, u);
		if (y) {
			const t = f / r;
			if (!(r > 0 && f > Gs && f > u && .5 * l * (t * t) > 3 * o)) return !1;
		}
		let d = null;
		const p = () => d ??= a.img.claimedPixels(this.claim);
		if (h) {
			if (!zr(function(t, n, e, r, o, s, i) {
				const a = t.img, l = a.width, c = a.height, h = a.cid, f = /* @__PURE__ */ new Int32Array(8), u = /* @__PURE__ */ new Int32Array(8), y = /* @__PURE__ */ new Float64Array(30), d = /* @__PURE__ */ new Float64Array(6), p = {
					r: 0,
					who: -1
				}, g = t.sixSrgb;
				let m = 0;
				for (let x = 0; x < e.length; x++) {
					const t = e[x], a = t / l | 0, M = t - a * l;
					let w = 0;
					for (let e = 0; e < 16; e += 2) {
						const t = M + li[e], o = a + li[e + 1];
						if (t < 0 || o < 0 || t >= l || o >= c) continue;
						const i = h[o * l + t];
						if (n.claimed[i]) continue;
						const y = r[i];
						if (y < 0 || y >= s) continue;
						let d = 0;
						for (; d < w && f[d] !== y;) d++;
						d < w ? u[d]++ : (f[w] = y, u[w] = 1, w++);
					}
					for (let n = 1; n < w; n++) {
						const t = f[n], e = u[n];
						let r = n - 1;
						for (; r >= 0 && (u[r] < e || u[r] === e && f[r] > t);) f[r + 1] = f[r], u[r + 1] = u[r], r--;
						f[r + 1] = t, u[r + 1] = e;
					}
					const b = Math.min(w, 4);
					for (let n = 0; n < b; n++) for (let t = 0; t < 6; t++) y[6 * n + t] = o[6 * f[n] + t];
					for (let n = 0; n < 6; n++) y[6 * b + n] = ri[n];
					const A = b + 1, k = 6 * h[t];
					let v;
					v = 1 === A ? ii(g, k, y, 0) : _r(g, k, y, A, 6, p) ? p.r : 1 / 0, v > i && ai(g, k, y, A, d) > i && m++;
				}
				return m * a.stride;
			}(a, this.claim, p(), this.nearestInk, this.six.srgb, this.count, Yr(r)), this.totalPx)) return !1;
		}
		const g = this.measure(t, n, y, p);
		if (null === g) return !1;
		const m = g.blend && g.interior < .25 && g.straddles;
		return !br(g.escaped, g.blend, g.interior) && !m;
	}
	measure(t, n, e, r) {
		const o = function(t, n, e, r, o) {
			const s = [], i = e.count;
			if (i < 2) return s;
			const a = /* @__PURE__ */ new Float64Array(6), l = /* @__PURE__ */ new Float64Array(6), c = /* @__PURE__ */ new Float64Array(6), h = Hs(1 - o);
			for (let f = 0; f < 2; f++) {
				const u = 0 === f;
				Rs(t, n, u, a, 0);
				const y = u ? e.lin : e.srgb;
				for (let e = 0; e < i; e++) for (let f = e + 1; f < i; f++) {
					const i = 6 * e, d = 6 * f;
					let p = 0, g = 0;
					for (let t = 0; t < 6; t++) {
						const n = Hs(y[d + t] - y[i + t]);
						p = Hs(p + Hs(n * n)), g = Hs(g + Hs(Hs(a[t] - y[i + t]) * n));
					}
					if (p < Vs) continue;
					const m = Hs(g / p);
					if (!(m >= o && m <= h)) continue;
					for (let t = 0; t < 6; t++) l[t] = Hs(y[i + t] + Hs(Hs(y[d + t] - y[i + t]) * m));
					zs(l, 0, u, c, 0);
					const x = Us(t, n, c, 0);
					x <= r && s.push({
						i: e,
						j: f,
						linear: u,
						off: x
					});
				}
			}
			return s;
		}(t, n, this.six, Hs(this.merge * Zs), Qs), s = o.length > 0, i = $s(t, n), a = i > 0 && i < 1, l = this.view.img, c = s || a || e ? l.interior(this.claim, r()) : 1;
		if (a && !s && c < .25) return null;
		let h = !1;
		if (s && c < .25) {
			const e = l.neighborhoods(r());
			for (const r of o) {
				const { i: o, j: s, linear: i } = r;
				if (h = hi(this.view, e, t, n, o, s, this.six, i, this.scratch), h) break;
			}
		}
		return {
			blend: s,
			escaped: e,
			interior: c,
			straddles: h
		};
	}
	accept(t, n, e) {
		const r = this.view.pts, o = this.count;
		for (let s = 0; s < this.nearest.length; s++) {
			const e = Us(r, 6 * s, t, n);
			e < this.nearest[s] && (this.nearest[s] = e, this.nearestInk[s] = o);
		}
		this.six.push(t, n);
		for (let s = 0; s < 6; s++) this.inks.push(t[n + s]);
		this.clear.push(e);
	}
};
function ui(t, n, e, r, o, s = {}) {
	const i = s.mergeDistance ?? .035, a = s.maxColors ?? 64, l = s.minRegion ?? 2, c = s.scale ?? 1, h = e * r, f = Je(o.sigmaNoise, h, o.soft, c), u = js(t, n), y = function(t, n, e, r, o = .035, s = 64, i = Ve, a = js(t, n)) {
		const l = new oi(t, n, a, e, r), c = function(t) {
			const n = t.points, e = t.pts, r = /* @__PURE__ */ new Map(), o = [], s = new Int32Array(n);
			for (let d = 0; d < n; d++) {
				const t = 6 * d, n = 13824 * qs(e[t], e[t + 1], e[t + 2]) + qs(e[t + 3], e[t + 4], e[t + 5]);
				let i = r.get(n);
				void 0 === i && (i = o.length, o.push(n), r.set(n, i)), s[d] = i;
			}
			const i = new Int32Array(o.length), a = new Float64Array(6 * o.length), l = t.img.cid;
			for (let d = 0; d < l.length; d++) {
				const t = l[d], n = s[t];
				i[n]++;
				for (let r = 0; r < 6; r++) a[6 * n + r] += e[6 * t + r];
			}
			const c = Array.from({ length: o.length }, (t, n) => n).toSorted((t, n) => i[n] - i[t] || o[t] - o[n]), h = c.length, f = new Int32Array(h), u = new Float64Array(h), y = new Float64Array(6 * h);
			for (let d = 0; d < h; d++) {
				const t = c[d];
				f[d] = i[t], u[d] = o[t];
				for (let n = 0; n < 6; n++) y[6 * d + n] = Hs(a[6 * t + n] / i[t]);
			}
			return {
				count: h,
				n: f,
				key: u,
				pts: y
			};
		}(l), h = new fi(l, i, o);
		let f = !1;
		for (let M = 0; M < c.count; M++) {
			const t = 6 * M, n = $s(c.pts, t) <= Xs, e = h.visibleCount() >= s;
			if (e && f) break;
			e && !n || h.accepts(c.pts, t, n) && (h.accept(c.pts, t, n), n && (f = !0));
		}
		let u = h.inks;
		0 === u.length && (u = c.count > 0 ? Array.from(c.pts.subarray(0, 6)) : [
			1,
			0,
			0,
			1,
			0,
			0
		]);
		const y = u.length / 6, d = Float64Array.from(u), p = function(t, n, e, r) {
			const o = t.points, s = t.pts, i = Hs(r), a = new Int32Array(o);
			for (let y = 0; y < o; y++) {
				let t = 0, r = ei;
				for (let o = 0; o < e; o++) {
					const e = Us(s, 6 * y, n, 6 * o);
					e < r && (t = o, r = e);
				}
				a[y] = r <= i ? t : -1;
			}
			const l = new Float64Array(6 * e), c = new Float64Array(e), h = t.img.cid;
			for (let y = 0; y < h.length; y++) {
				const t = h[y], n = a[t];
				if (!(n < 0)) {
					for (let e = 0; e < 6; e++) l[6 * n + e] += s[6 * t + e];
					c[n]++;
				}
			}
			const f = Hs(Math.max(t.img.n, 1)), u = new Float64Array(e);
			for (let y = 0; y < e; y++) {
				if (c[y] > 0) for (let t = 0; t < 6; t++) n[6 * y + t] = Hs(l[6 * y + t] / c[y]);
				u[y] = Hs(Hs(c[y]) / f);
			}
			return u;
		}(l, d, y, o), g = new Float64Array(3 * y), m = new Float64Array(3 * y), x = new Float64Array(y);
		for (let M = 0; M < y; M++) {
			const t = 6 * M;
			g[3 * M] = d[t], g[3 * M + 1] = d[t + 1], g[3 * M + 2] = d[t + 2];
			const n = gr(d[t], d[t + 1], d[t + 2]);
			m[3 * M] = n[0], m[3 * M + 1] = n[1], m[3 * M + 2] = n[2], x[M] = $s(d, t);
		}
		return {
			count: y,
			inkLab: g,
			inkRgb: m,
			weight: p,
			alpha: x
		};
	}(t, n, e, r, i, a, f, u), d = function(t, n, e, r = js(t, n)) {
		const o = Cs(e), s = /* @__PURE__ */ new Float64Array(6), i = new Int32Array(r.count);
		for (let l = 0; l < r.count; l++) {
			const a = r.reps[l];
			Ps(t[3 * a], t[3 * a + 1], t[3 * a + 2], n[a], s, 0);
			let c = 0, h = ei;
			for (let t = 0; t < e.count; t++) {
				const n = Us(s, 0, o, 6 * t);
				n < h && (c = t, h = n);
			}
			i[l] = c;
		}
		const a = new Int32Array(r.cid.length);
		for (let l = 0; l < a.length; l++) a[l] = i[r.cid[l]];
		return a;
	}(t, n, y, u);
	let p = o.sigmaNoise;
	if (o.soft) {
		const s = o.edgeNoise ?? Math.min(1 * go(t, d, e, r, y.inkRgb), 8 / 255);
		p = Math.max(p, s);
	}
	const g = function(t, n, e) {
		const r = new Float32Array(4 * e);
		for (let o = 0; o < e; o++) r[4 * o] = t[3 * o], r[4 * o + 1] = t[3 * o + 1], r[4 * o + 2] = t[3 * o + 2], r[4 * o + 3] = null === n ? 1 : Math.min(1, Math.max(0, n[o]));
		return r;
	}(t, n, h), m = function(t, n) {
		const e = Math.floor(t.length / 3), r = new Float64Array(4 * e);
		for (let o = 0; o < e; o++) r[4 * o] = t[3 * o], r[4 * o + 1] = t[3 * o + 1], r[4 * o + 2] = t[3 * o + 2], r[4 * o + 3] = null !== n && o < n.length ? n[o] : 1;
		return r;
	}(y.inkRgb, y.alpha), x = s.colorFold ?? !0 ? {
		px: g,
		inks: m,
		channels: 4
	} : null;
	lo(d, e, r, l, x);
	let M = 0, w = 0;
	return (s.absorbBlends ?? !0) && (M = function(t, n, e, r, o, s, i = 1) {
		const a = Math.max(1, Math.round(i)), l = Math.floor(o.length / 4), c = Yr(s), h = /* @__PURE__ */ new Int32Array(3), f = /* @__PURE__ */ new Float64Array(16), u = new Int32Array(e * r), y = {
			r: 0,
			who: -1
		};
		let d = 0;
		for (let p = 0; p < 2; p++) {
			const { comps: s, thin: i } = no(t, e, r, a), p = new Vr(Jr(t, l));
			let g = 0;
			for (let d = 0; d < s.count; d++) {
				const m = i.offset[d], x = i.offset[d + 1];
				if (m === x) continue;
				const M = i.pixels, w = x - m, b = to(M, m, x, d, s.comp, t, e, r, p), { foreign: A } = b;
				if (5 * (a > 1 ? eo(M, m, x, s.comp, e, r, a) : b.interior) >= w || 0 === A) continue;
				const k = p.top(3, h);
				let v = 0;
				for (let t = 0; t < k; t++) v += p.count[h[t]];
				if (5 * v < 4 * A) continue;
				let F = k >= 2;
				for (let t = 0; t < k; t++) h[t] >= l && (F = !1);
				if (!F) continue;
				let I = !1;
				for (let t = 0; t < k; t++) Ds(f, t, o, h[t]), f[4 * t + 3] < Os(.005) && (I = !0);
				let N = k, S = -1;
				if (!I) {
					let t = !1;
					for (let e = m; e < x; e++) if (n[4 * M[e] + 3] < .99) {
						t = !0;
						break;
					}
					t && (Ds(f, N, Ks, 0), S = N++);
				}
				let P = 0;
				for (let e = m; e < x; e++) {
					const r = M[e];
					_r(n, 4 * r, f, N, 4, y) ? (y.r <= c && P++, u[e - m] = y.who !== S || _r(n, 4 * r, f, N - 1, 4, y) ? h[y.who] : h[0]) : u[e - m] = t[r];
				}
				if (!(5 * P < 4 * w)) {
					for (let n = m; n < x; n++) t[M[n]] = u[n - m];
					g++;
				}
			}
			if (d += g, 0 === g) break;
		}
		return d;
	}(d, g, e, r, m, p, c), w = function(t, n, e, r, o, s) {
		const i = Math.floor(o.length / 4), a = Yr(s), l = /* @__PURE__ */ new Int32Array(4), c = /* @__PURE__ */ new Int32Array(5), h = /* @__PURE__ */ new Float64Array(20), f = {
			r: 0,
			who: -1
		};
		return oo(t, e, r, 4, (t, s) => {
			const u = t[s], y = ao(t, s, e, r, l);
			if (y < 2 || u >= i) return -1;
			const d = 4 * s;
			let p = 0;
			for (let e = 0; e < 4; e++) {
				const t = Os(n[d + e] - Os(o[4 * u + e]));
				p = Os(p + Os(t * t));
			}
			const g = Os(Math.sqrt(p));
			let m = 0, x = !1;
			for (let n = 0; n < y; n++) {
				const t = l[n];
				t >= i || (Ds(h, m, o, t), h[4 * m + 3] < Os(.005) && (x = !0), c[m++] = t);
			}
			if (n[d + 3] < .99 && !x && (Ds(h, m, Ks, 0), c[m++] = -1), !_r(n, d, h, m, 4, f)) return -1;
			const M = f.r;
			let w = c[f.who];
			if (w < 0) {
				if (!_r(n, d, h, m - 1, 4, f)) return -1;
				w = c[f.who];
			}
			return w !== u && M <= a && M < .5 * g ? w : -1;
		});
	}(d, g, e, r, m, p), (M > 0 || w > 0) && lo(d, e, r, l, x)), {
		palette: y,
		labels: d,
		sigmaNoise: p,
		lambda: f.lambda,
		sameClass: Ts(y),
		absorbed: M,
		moved: w
	};
}
const yi = Math.fround, di = .5 / 255, pi = yi(.98), gi = yi(.05);
function mi(t) {
	return "flat" === t.kind ? [{
		offset: 0,
		color: t.color
	}] : [
		{
			offset: 0,
			color: t.c0
		},
		...t.mids.map((t) => ({
			offset: t.offset,
			color: t.color
		})),
		{
			offset: 1,
			color: t.c1
		}
	];
}
function xi(t, n) {
	if ("flat" === t.kind) return {
		kind: "flat",
		color: n[0]
	};
	const e = t.mids.length, r = t.mids.map((t, e) => ({
		offset: t.offset,
		color: n[e + 1]
	}));
	return Rn(t, n[0], r, n[e + 1]);
}
function Mi(t) {
	const n = mi(t.alpha), e = mi(t.color), r = n.map((t, n) => {
		const r = t.color[0], o = r < 0 ? 0 : r > 1 ? 1 : r, s = n < e.length ? e[n].color : e.length > 0 ? e[e.length - 1].color : [
			1,
			1,
			1
		];
		return [
			yi(yi(yi(s[0] * o) + 1) - o),
			yi(yi(yi(s[1] * o) + 1) - o),
			yi(yi(yi(s[2] * o) + 1) - o)
		];
	});
	return xi(t.alpha, r);
}
function wi(t, n, e, r, o) {
	const s = mi(t).map((t) => t.offset), i = s.length, a = Array.from({ length: i }, () => new Array(i).fill(0)), l = Array.from({ length: i }, () => [
		0,
		0,
		0
	]), c = [
		0,
		0,
		0
	];
	let h = 0;
	const f = new $n(Tn(t));
	for (let p = 0; p < n.length; p++) {
		const t = n[p], u = r[t];
		if (u < .001) continue;
		const y = e[3 * t] - (1 - u), d = e[3 * t + 1] - (1 - u), g = e[3 * t + 2] - (1 - u);
		if (c[0] += y, c[1] += d, c[2] += g, h += u, i < 2) continue;
		const m = t % o, x = f.tAt(m, (t - m) / o);
		let M = 0;
		for (let n = i - 2; n >= 0; n--) if (x >= s[n]) {
			M = n;
			break;
		}
		const w = Math.max(s[M + 1] - s[M], 1e-9), b = Math.min(1, Math.max(0, (x - s[M]) / w)), A = u * (1 - b), k = u * b;
		a[M][M] += A * A, a[M][M + 1] += A * k, a[M + 1][M] += A * k, a[M + 1][M + 1] += k * k, l[M][0] += A * y, l[M][1] += A * d, l[M][2] += A * g, l[M + 1][0] += k * y, l[M + 1][1] += k * d, l[M + 1][2] += k * g;
	}
	const u = h > 1e-9 ? [
		c[0] / h,
		c[1] / h,
		c[2] / h
	] : [
		1,
		1,
		1
	];
	let y = 0;
	for (let p = 0; p < i; p++) y += a[p][p];
	const d = 1e-6 + .001 * y / i;
	for (let p = 0; p < i; p++) {
		a[p][p] += d;
		for (let t = 0; t < 3; t++) l[p][t] += d * u[t];
	}
	return xi(t, ((i < 2 ? null : function(t, n) {
		const e = n.length;
		for (let o = 0; o < e; o++) {
			let r = o;
			for (let n = o + 1; n < e; n++) Math.abs(t[n][o]) >= Math.abs(t[r][o]) && (r = n);
			if (Math.abs(t[r][o]) < 1e-12) return null;
			[t[o], t[r]] = [t[r], t[o]], [n[o], n[r]] = [n[r], n[o]];
			for (let s = o + 1; s < e; s++) {
				const r = t[s][o] / t[o][o];
				for (let n = o; n < e; n++) t[s][n] -= r * t[o][n];
				for (let t = 0; t < 3; t++) n[s][t] -= r * n[o][t];
			}
		}
		const r = Array.from({ length: e }, () => [
			0,
			0,
			0
		]);
		for (let o = e - 1; o >= 0; o--) for (let s = 0; s < 3; s++) {
			let i = n[o][s];
			for (let n = o + 1; n < e; n++) i -= t[o][n] * r[n][s];
			r[o][s] = i / t[o][o];
		}
		return r;
	}(a, l)) ?? Array.from({ length: i }, () => u)).map((t) => [
		yi(Ni(t[0])),
		yi(Ni(t[1])),
		yi(Ni(t[2]))
	]));
}
function bi(t, n, e, r, o) {
	const s = (t) => {
		const n = Math.max(Math.abs(t) - di, 0) / r;
		return n * n;
	}, i = /* @__PURE__ */ new Float64Array(3);
	let a = 0;
	for (let l = 0; l < t.length; l++) {
		const r = t[l], c = o(r, i), h = e[r];
		let f = s(h - c);
		for (let t = 0; t < 3; t++) f += s(n[3 * r + t] - (1 - h) - i[t] * c);
		a += f;
	}
	return a;
}
function Ai(t) {
	return "flat" === t.kind ? 1 : "linear" === t.kind ? 6 + 2 * t.mids.length : 2 + (1 === t.aspect ? 3 : 5) + 2 * t.mids.length;
}
function ki(t, n, e, r, o, s, i, a) {
	let l = null;
	for (const c of Qe(t, n, e, r, o, null, s, i)) {
		if ("flat" !== c.model.kind && (a || "srgb" !== c.model.interp)) continue;
		const t = .5 * c.chi2 / 3 + i * Ai(c.model);
		(null === l || t < l.cost) && (l = {
			model: c.model,
			cost: t
		});
	}
	return l ?? {
		model: {
			kind: "flat",
			color: [
				1,
				1,
				1
			]
		},
		cost: 1 / 0
	};
}
function vi(t, n) {
	const e = t[4 * n + 3];
	return e > 1e-6 ? [
		yi(Ni(t[4 * n] / e)),
		yi(Ni(t[4 * n + 1] / e)),
		yi(Ni(t[4 * n + 2] / e))
	] : null;
}
function Fi(t) {
	return {
		model: {
			kind: "flat",
			color: t
		},
		chi2: 0,
		params: 3,
		cost: 0
	};
}
function Ii(t, n) {
	return n >= t.count ? [
		1,
		1,
		1
	] : [
		t.inkRgb[3 * n],
		t.inkRgb[3 * n + 1],
		t.inkRgb[3 * n + 2]
	];
}
function Ni(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
const Si = 1024;
function Pi(t, n, e) {
	const r = Math.min(1, e / Math.max(t, n));
	return {
		w: Math.max(1, Math.round(t * r)),
		h: Math.max(1, Math.round(n * r))
	};
}
function Ci(t, n, e) {
	return Math.min(e - 1, Math.floor(t * e / n));
}
function Ui(t, n) {
	const e = z(t, Si);
	return {
		kind: "rgba",
		width: e.width,
		height: e.height,
		data: new Uint8ClampedArray(e.data),
		caption: n
	};
}
function Li(t, n, e) {
	const { w: r, h: o } = Pi(t.width, t.height, Si), s = new Uint16Array(r * o), { data: i, width: a, height: l } = t;
	for (let c = 0; c < o; c++) {
		const t = Ci(c, o, l);
		for (let n = 0; n < r; n++) {
			const e = i[t * a + Ci(n, r, a)];
			s[c * r + n] = e < 0 ? 65535 : e;
		}
	}
	return {
		kind: "labels",
		width: r,
		height: o,
		data: s,
		palette: n.slice(),
		caption: e
	};
}
function $i(t, n) {
	const { w: e, h: r } = Pi(t.width, t.height, Si), o = new Uint8Array(e * r), { data: s, width: i, height: a } = t;
	for (let l = 0; l < r; l++) {
		const t = Ci(l, r, a);
		for (let n = 0; n < e; n++) o[l * e + n] = s[t * i + Ci(n, e, i)] ? 1 : 0;
	}
	return {
		kind: "mask",
		width: e,
		height: r,
		data: o,
		caption: n
	};
}
function qi(t, n = 48) {
	const e = new Array(n).fill(0), { data: r } = t;
	for (let o = 0; o < r.length; o += 4) {
		if (r[o + 3] < 8) continue;
		const t = .2126 * r[o] + .7152 * r[o + 1] + .0722 * r[o + 2];
		e[Math.min(n - 1, Math.floor(t / 256 * n))]++;
	}
	return {
		kind: "histogram",
		label: "Luminance",
		values: e,
		min: 0,
		max: 255,
		xLabel: "0–255"
	};
}
function Ri(t, n) {
	const e = [], r = [], o = [];
	for (let s = 0; s < t.length; s++) e.push(n[s] ?? 0), r.push(t[s]), o.push(t[s]);
	return {
		kind: "bars",
		label: "Palette population",
		values: e,
		colors: r,
		barLabels: o,
		yLabel: "pixels"
	};
}
function zi(t) {
	const n = t.fill && "none" !== t.fill ? t.fill : t.stroke;
	return n && "none" !== n ? n : "#888888";
}
function Ti(t, n = 24) {
	const e = /* @__PURE__ */ new Map();
	for (const o of t) e.set(zi(o), (e.get(zi(o)) ?? 0) + o.commands.length);
	const r = [...e.entries()].toSorted((t, n) => n[1] - t[1]).slice(0, n);
	return {
		kind: "bars",
		label: "Nodes per color",
		values: r.map((t) => t[1]),
		colors: r.map((t) => t[0]),
		barLabels: r.map((t) => t[0]),
		yLabel: "nodes"
	};
}
function Ei(t, n = 24) {
	const e = t.map((t) => t.commands.length);
	let r = 0;
	for (const s of e) s > r && (r = s);
	r = Math.max(1, r);
	const o = new Array(n).fill(0);
	for (const s of e) o[Math.min(n - 1, Math.floor(s / (r + 1) * n))]++;
	return {
		kind: "histogram",
		label: "Nodes per shape",
		values: o,
		min: 0,
		max: r,
		xLabel: "nodes"
	};
}
function ji(t) {
	let n = 0;
	for (const e of t) n += e.commands.length;
	return n;
}
function Bi(t) {
	let n = 0;
	for (const e of t.data) e && n++;
	return t.data.length > 0 ? n / t.data.length : 0;
}
function Oi(t) {
	let n = 0;
	for (const e of t) e > 0 && n++;
	return n;
}
const Ki = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1]
];
function Di(t, n, e) {
	const { width: r, height: o } = t, s = new Uint8Array(t.data), i = (t, n) => t >= 0 && t < r && n >= 0 && n < o ? s[n * r + t] : 0, a = [], l = new Int32Array(r * o);
	let c = /* @__PURE__ */ new Int32Array(64);
	const h = new Int32Array(o), f = new Int32Array(o);
	for (let m = 0; m < o; m++) {
		const n = m * r;
		for (let o = 0; o < r; o++) {
			if (1 !== s[n + o]) continue;
			const r = u(o, m), i = Math.abs(g(r)), c = 1 === t.data[n + o], h = i >= e, f = l[n + o];
			p(r, c ? h ? a.length + 1 : f : -1), h && a.push({
				points: r,
				area: c ? i : -i,
				interiorX: o,
				interiorY: m,
				parent: f - 1
			});
		}
	}
	return a;
	function u(t, n) {
		const e = [];
		let r = t, o = n, s = 0;
		do {
			e.push(r, o);
			const [t, n] = Ki[s], a = i(r + (t + n - 1) / 2, o + (n - t - 1) / 2), l = i(r + (t - n - 1) / 2, o + (n + t - 1) / 2);
			1 === l && 0 === a || (s = 1 === l && 1 === a ? s + 3 & 3 : 0 === l && 0 === a ? s + 1 & 3 : y(r, o, s));
			const [c, h] = Ki[s];
			r += c, o += h;
		} while (r !== t || o !== n);
		return e;
	}
	function y(t, e, r) {
		const o = r + 3 & 3, s = r + 1 & 3;
		switch (n) {
			case "left":
			case "black": return o;
			case "right":
			case "white": return s;
			case "majority": return d(t, e) ? o : s;
			case "minority": return d(t, e) ? s : o;
		}
	}
	function d(t, n) {
		for (let e = 2; e < 5; e++) {
			let r = 0;
			for (let o = 1 - e; o <= e - 1; o++) r += i(t + o, n + e - 1) ? 1 : -1, r += i(t + e - 1, n + o - 1) ? 1 : -1, r += i(t + o - 1, n - e) ? 1 : -1, r += i(t - e, n + o) ? 1 : -1;
			if (r > 0) return !0;
			if (r < 0) return !1;
		}
		return !1;
	}
	function p(t, n) {
		const e = t.length;
		let i = 0, a = o, u = -1;
		for (let r = 0; r < e; r += 2) {
			const n = t[r + 1], o = t[(r + 3) % e];
			if (o === n) continue;
			const s = o < n ? o : n;
			h[s]++, s < a && (a = s), s > u && (u = s), i++;
		}
		if (0 === i) return;
		if (i > c.length) {
			let t = c.length;
			for (; t < i;) t *= 2;
			c = new Int32Array(t);
		}
		let y = 0;
		for (let r = a; r <= u; r++) f[r] = y, y += h[r];
		for (let r = 0; r < e; r += 2) {
			const n = t[r + 1], o = t[(r + 3) % e];
			o !== n && (c[f[o < n ? o : n]++] = t[r]);
		}
		for (let o = a; o <= u; o++) {
			const t = f[o], e = t - h[o];
			h[o] = 0;
			for (let n = e + 1; n < t; n++) {
				const t = c[n];
				let r = n - 1;
				for (; r >= e && c[r] > t;) c[r + 1] = c[r], r--;
				c[r + 1] = t;
			}
			const i = o * r;
			for (let r = e; r + 1 < t; r += 2) {
				const t = c[r], e = c[r + 1];
				for (let n = t; n < e; n++) s[i + n] ^= 1;
				if (n >= 0) for (let r = t; r < e; r++) l[i + r] = n;
			}
		}
	}
}
function Hi(t) {
	const n = t.length >> 1, e = t[0], r = t[1], o = new Float64Array(n + 1), s = new Float64Array(n + 1), i = new Float64Array(n + 1), a = new Float64Array(n + 1), l = new Float64Array(n + 1);
	for (let c = 0; c < n; c++) {
		const n = t[2 * c] - e, h = t[2 * c + 1] - r;
		o[c + 1] = o[c] + n, s[c + 1] = s[c] + h, i[c + 1] = i[c] + n * n, a[c + 1] = a[c] + n * h, l[c + 1] = l[c] + h * h;
	}
	return {
		x: o,
		y: s,
		x2: i,
		xy: a,
		y2: l,
		ox: e,
		oy: r
	};
}
function Xi(t, n, e, r) {
	const { x: o, y: s, x2: i, xy: a, y2: l, ox: c, oy: h } = n, f = r + 1 - e, u = o[r + 1] - o[e], y = s[r + 1] - s[e], d = i[r + 1] - i[e], p = a[r + 1] - a[e], g = l[r + 1] - l[e], m = (t[2 * e] + t[2 * r]) / 2 - c, x = (t[2 * e + 1] + t[2 * r + 1]) / 2 - h, M = t[2 * r] - t[2 * e], w = t[2 * r + 1] - t[2 * e + 1], b = w * w * ((d - 2 * u * m) / f + m * m) - 2 * M * w * ((p - u * x - y * m) / f + m * x) + M * M * ((g - 2 * y * x) / f + x * x);
	return Math.sqrt(Math.max(0, b));
}
function Wi(t, n, e, r) {
	const { x: o, y: s, x2: i, xy: a, y2: l, ox: c, oy: h } = n, f = r + 1 - e, u = (o[r + 1] - o[e]) / f, y = (s[r + 1] - s[e]) / f, d = (i[r + 1] - i[e]) / f - u * u, p = (a[r + 1] - a[e]) / f - u * y, g = (l[r + 1] - l[e]) / f - y * y, m = (d + g + Math.sqrt((d - g) * (d - g) + 4 * p * p)) / 2;
	let x = 0, M = 0;
	Math.abs(d - m) >= Math.abs(g - m) ? (x = -p, M = d - m) : (x = g - m, M = -p);
	const w = Math.hypot(x, M);
	if (w < 1e-12) {
		x = t[2 * r] - t[2 * e], M = t[2 * r + 1] - t[2 * e + 1];
		const n = Math.hypot(x, M);
		return n < 1e-12 ? {
			cx: u + c,
			cy: y + h,
			dx: 1,
			dy: 0
		} : {
			cx: u + c,
			cy: y + h,
			dx: x / n,
			dy: M / n
		};
	}
	return {
		cx: u + c,
		cy: y + h,
		dx: x / w,
		dy: M / w
	};
}
function Gi(t, n, e, r) {
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
function Zi(t, n) {
	const e = new Array(9);
	for (let r = 0; r < 9; r++) e[r] = t[r] + n[r];
	return e;
}
function Qi(t, n, e) {
	return t[0] * n * n + (t[1] + t[3]) * n * e + t[4] * e * e + (t[2] + t[6]) * n + (t[5] + t[7]) * e + t[8];
}
function Yi(t, n, e, r) {
	const o = e.length, s = new Array(2 * o), i = o - 1, a = new Array(i);
	for (let l = 0; l < i; l++) {
		const { cx: r, cy: o, dx: s, dy: i } = Wi(t, n, e[l], e[l + 1]);
		a[l] = Gi(r, o, s, i);
	}
	for (let l = 0; l < o; l++) {
		const n = t[2 * e[l]], o = t[2 * e[l] + 1];
		let c = null, h = null;
		if (l > 0 ? c = a[l - 1] : r && (c = a[i - 1]), l < i ? h = a[l] : r && (h = a[0]), !c || !h) {
			s[2 * l] = n, s[2 * l + 1] = o;
			continue;
		}
		const [f, u] = _i(Zi(c, h), n, o);
		s[2 * l] = f, s[2 * l + 1] = u;
	}
	return r && (s[2 * (o - 1)] = s[0], s[2 * (o - 1) + 1] = s[1]), s;
}
function _i(t, n, e) {
	const r = 2 * t[0], o = t[1] + t[3], s = t[2] + t[6], i = o, a = 2 * t[4], l = t[5] + t[7], c = r * a - o * i;
	if (Math.abs(c) > 1e-9) {
		const t = (-s * a + l * o) / c, h = (-r * l + s * i) / c;
		if (Math.abs(t - n) <= .5 && Math.abs(h - e) <= .5) return [t, h];
	}
	let h = n, f = e, u = Qi(t, n, e);
	const y = (n, e) => {
		const r = Qi(t, n, e);
		r < u && (u = r, h = n, f = e);
	};
	for (const d of [n - .5, n + .5]) Math.abs(a) > 1e-12 && y(d, Vi((-o * d - l) / a, e - .5, e + .5)), y(d, e - .5), y(d, e + .5);
	for (const d of [e - .5, e + .5]) Math.abs(r) > 1e-12 && y(Vi((-i * d - s) / r, n - .5, n + .5), d), y(n - .5, d), y(n + .5, d);
	return [h, f];
}
function Vi(t, n, e) {
	return t < n ? n : t > e ? e : t;
}
function Ji(t) {
	const n = t.length >> 1;
	if (n <= 2) return 2 === n ? [0, 1] : [0];
	const e = function(t) {
		const n = t.length >> 1, e = (n) => t[2 * n], r = (n) => t[2 * n + 1], o = new Int8Array(Math.max(0, n - 1));
		for (let f = 0; f < n - 1; f++) o[f] = ta(e(f + 1) - e(f), r(f + 1) - r(f));
		const s = new Int32Array(Math.max(0, n - 1));
		if (n >= 2) {
			s[n - 2] = n - 1;
			for (let t = n - 3; t >= 0; t--) s[t] = o[t + 1] !== o[t] ? t + 1 : s[t + 1];
		}
		const i = new Int32Array(n);
		i[n - 1] = n - 1;
		const a = /* @__PURE__ */ new Int32Array(4);
		for (let f = n - 2; f >= 0; f--) {
			a[0] = a[1] = a[2] = a[3] = 0, a[o[f]]++;
			let t = 0, l = 0, c = 0, h = 0, u = f, y = s[f], d = !1, p = !1;
			for (;;) {
				if (a[ta(Math.sign(e(y) - e(u)), Math.sign(r(y) - r(u)))]++, 0 !== a[0] && 0 !== a[1] && 0 !== a[2] && 0 !== a[3]) {
					i[f] = u, d = !0;
					break;
				}
				const o = e(y) - e(f), g = r(y) - r(f);
				if (t * g - l * o < 0 || c * g - h * o > 0) {
					p = !0;
					break;
				}
				if (Math.abs(o) > 1 || Math.abs(g) > 1) {
					const n = o + (g >= 0 && (g > 0 || o < 0) ? 1 : -1), e = g + (o <= 0 && (o < 0 || g < 0) ? 1 : -1);
					t * e - l * n >= 0 && (t = n, l = e);
					const r = o + (g <= 0 && (g < 0 || o < 0) ? 1 : -1), s = g + (o >= 0 && (o > 0 || g < 0) ? 1 : -1);
					c * s - h * r <= 0 && (c = r, h = s);
				}
				if (u = y, u === n - 1) {
					i[f] = n - 1, d = !0;
					break;
				}
				y = s[u];
			}
			if (!d && p) {
				const o = Math.sign(e(y) - e(u)), s = Math.sign(r(y) - r(u)), a = e(u) - e(f), d = r(u) - r(f), p = t * d - l * a, g = t * s - l * o, m = c * d - h * a, x = c * s - h * o;
				let M = 1e7;
				g < 0 && (M = Math.floor(p / -g)), x > 0 && (M = Math.min(M, Math.floor(-m / x))), i[f] = Math.min(n - 1, Math.max(u, u + M));
			}
		}
		const l = new Int32Array(n);
		l[n - 1] = n - 1;
		let c = i[n - 1];
		for (let f = n - 2; f >= 0; f--) i[f] >= f + 1 && i[f] <= c && (c = i[f]), l[f] = c;
		const h = new Int32Array(n);
		for (let f = 0; f < n; f++) {
			const t = 0 === f ? l[0] : l[f - 1];
			h[f] = t >= n - 1 ? n - 1 : Math.min(n - 1, Math.max(f + 1, t - 1));
		}
		return h[n - 1] = n - 1, h;
	}(t), r = Hi(t);
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
	const a = new Int32Array(o + 1);
	a[o] = n - 1;
	for (let y = o - 1; y >= 0; y--) a[y] = i[a[y + 1]];
	let l = new Float64Array(n).fill(1 / 0), c = new Float64Array(n).fill(1 / 0);
	l[0] = 0;
	const h = [];
	for (let y = 1; y <= o; y++) {
		const i = a[y], f = y === o ? n - 1 : s[y], u = a[y - 1], d = s[y - 1], p = new Int32Array(f - i + 1).fill(-1);
		c.fill(1 / 0, i, f + 1);
		for (let s = Math.max(i, y === o ? n - 1 : i); s <= f; s++) {
			let n = 1 / 0, o = -1;
			const a = Math.min(d, s - 1);
			for (let i = u; i <= a; i++) {
				if (e[i] < s) continue;
				const a = l[i];
				if (a === 1 / 0) continue;
				const c = a + Xi(t, r, i, s);
				c < n && (n = c, o = i);
			}
			c[s] = n, p[s - i] = o;
		}
		h.push(p);
		const g = l;
		l = c, c = g;
	}
	const f = [n - 1];
	let u = n - 1;
	for (let y = o; y >= 1; y--) {
		const t = a[y], n = h[y - 1][u - t];
		if (n < 0) {
			f.push(0);
			break;
		}
		f.push(n), u = n;
	}
	return f.reverse(), 0 !== f[0] && f.unshift(0), f;
}
function ta(t, n) {
	return (3 + 3 * Math.sign(t) + Math.sign(n)) / 2;
}
function na(t) {
	for (const n of t.edges) {
		if (n.closed) continue;
		const e = n.points.length, r = t.nodes[n.start], o = t.nodes[n.end];
		n.points[0] = r.x, n.points[1] = r.y, n.points[e - 2] = o.x, n.points[e - 1] = o.y;
	}
}
const ea = [
	-1,
	-.5,
	0,
	.5,
	1
];
function ra(t, n, e) {
	const r = t >= .5, o = r ? t : 1 - t, s = o - .5 <= .5 * (n - e) / n ? (o - .5) * n : .5 * (n + e) - Math.sqrt(Math.max(2 * n * e * (1 - o), 0));
	return r ? s : -s;
}
function oa(t, n, e, r) {
	const o = t + n;
	return r ? (o % e + e) % e : o < 0 ? 0 : o >= e ? e - 1 : o;
}
function sa(t, n, e, r) {
	const o = t.length >> 1;
	if (o < 9) return e;
	let s = 0, i = 0;
	for (let M = -3; M <= 3; M++) {
		const e = oa(n, M, o, r);
		s += t[2 * e], i += t[2 * e + 1];
	}
	s /= 7, i /= 7;
	let a = 0, l = 0, c = 0;
	for (let M = -3; M <= 3; M++) {
		const e = oa(n, M, o, r), h = t[2 * e] - s, f = t[2 * e + 1] - i;
		a += h * h, l += f * f, c += h * f;
	}
	const h = a - l, f = .5 * (a + l + Math.sqrt(Math.max(h * h + 4 * c * c, 0)));
	let u, y;
	Math.abs(c) > 1e-12 ? (u = f - l, y = c) : a >= l ? (u = 1, y = 0) : (u = 0, y = 1);
	const d = Math.hypot(u, y);
	if (d <= 1e-12) return e;
	u /= d, y /= d;
	const p = Math.abs((t[2 * n] - s) * y - (t[2 * n + 1] - i) * u);
	let g = 0, m = 0;
	for (let M = -2; M <= 2; M++) {
		const e = oa(n, M - 1, o, r), s = oa(n, M, o, r), i = oa(n, M + 1, o, r), a = t[2 * s], l = t[2 * s + 1], c = (a - t[2 * e]) * (t[2 * i + 1] - l) - (l - t[2 * e + 1]) * (t[2 * i] - a);
		g += c, m += Math.abs(c);
	}
	const x = p * (1 - (m > 1e-12 ? Math.min(Math.max(Math.abs(g) / m, 0), 1) : 0));
	return Math.hypot(e, Math.min(.35 * x, .354));
}
function ia(t, n) {
	const e = t[0] - n[0], r = t[1] - n[1], o = t[2] - n[2], s = t[3] - n[3];
	return Math.sqrt(e * e + r * r + o * o + s * s);
}
function aa(t, n, e, r) {
	void 0 === t.at ? la(t, r) : t.at(n, e, r);
}
function la(t, n) {
	n[0] = t.r, n[1] = t.g, n[2] = t.b, n[3] = t.a;
}
function ca(t) {
	return t < 0 ? -Math.round(-t) : Math.round(t);
}
var ha = class {
	w;
	h;
	data;
	sigmaNoise;
	minContrast;
	simplifyFaint;
	ca = /* @__PURE__ */ new Float64Array(4);
	cb = /* @__PURE__ */ new Float64Array(4);
	ra = /* @__PURE__ */ new Float64Array(4);
	rb = /* @__PURE__ */ new Float64Array(4);
	d = /* @__PURE__ */ new Float64Array(4);
	dd = 0;
	contrast = 0;
	probeS = new Float64Array(ea.length);
	probeA = new Float64Array(ea.length);
	probeCount = 0;
	outX = 0;
	outY = 0;
	outSigma = 0;
	constructor(t, n, e) {
		this.w = t.width, this.h = t.height, this.data = t.data, this.sigmaNoise = n, this.minContrast = Math.max(3 * n, .02), this.simplifyFaint = e;
	}
	axisAt(t, n, e, r) {
		const { ca: o, cb: s, d: i } = this;
		aa(t, e, r, o), aa(n, e, r, s);
		let a = ia(o, s);
		if (void 0 !== t.at || void 0 !== n.at) {
			const { ra: e, rb: r } = this;
			la(t, e), la(n, r);
			const i = ia(e, r);
			i > a && (o.set(e), s.set(r), a = i);
		}
		i[0] = o[0] - s[0], i[1] = o[1] - s[1], i[2] = o[2] - s[2], i[3] = o[3] - s[3], this.dd = i[0] * i[0] + i[1] * i[1] + i[2] * i[2] + i[3] * i[3], this.contrast = a;
	}
	project(t, n, e, r) {
		const { cb: o, d: s } = this, i = ((t - o[0]) * s[0] + (n - o[1]) * s[1] + (e - o[2]) * s[2] + (r - o[3]) * s[3]) / this.dd;
		return i < 0 ? 0 : i > 1 ? 1 : i;
	}
	pixelCoverage(t, n) {
		const e = 4 * (n * this.w + t), r = this.data;
		return this.project(r[e], r[e + 1], r[e + 2], r[e + 3]);
	}
	coverageAt(t, n) {
		const e = t - .5, r = n - .5, o = Math.floor(e), s = Math.floor(r), i = e - o, a = r - s, { w: l, h: c, data: h } = this;
		let f = 0, u = 0, y = 0, d = 0, p = 0;
		for (let g = 0; g < 4; g++) {
			const t = 1 & g, n = g >> 1, e = o + t, r = s + n;
			if (e < 0 || r < 0 || e >= l || r >= c) continue;
			const m = (1 === t ? i : 1 - i) * (1 === n ? a : 1 - a), x = 4 * (r * l + e);
			f += h[x] * m, u += h[x + 1] * m, y += h[x + 2] * m, d += h[x + 3] * m, p += m;
		}
		return p <= 1e-6 ? -1 : this.project(f / p, u / p, y / p, d / p);
	}
	probe(t, n, e, r) {
		const { probeS: o, probeA: s, w: i, h: a } = this;
		let l = 0;
		for (const c of ea) {
			const h = ca(t + e * c - .5), f = ca(n + r * c - .5);
			if (h < 0 || f < 0 || h >= i || f >= a) continue;
			const u = (h + .5 - t) * e + (f + .5 - n) * r;
			let y = !1;
			for (let t = 0; t < l; t++) if (Math.abs(o[t] - u) < 1e-9) {
				y = !0;
				break;
			}
			if (y) continue;
			const d = this.pixelCoverage(h, f);
			let p = l;
			for (; p > 0 && o[p - 1] > u;) o[p] = o[p - 1], s[p] = s[p - 1], p--;
			o[p] = u, s[p] = d, l++;
		}
		this.probeCount = l;
	}
	invertStep(t, n, e) {
		const r = Math.abs(n), o = Math.abs(e), s = r >= o ? r : o, i = r >= o ? o : r, { probeS: a, probeA: l, probeCount: c } = this;
		let h = -1;
		if (0 !== t) {
			for (let y = 0; y + 1 < c; y++) if ((l[y] - .5) * (l[y + 1] - .5) <= 0 && Math.abs(l[y + 1] - l[y]) > 1e-9) {
				h = y;
				break;
			}
		}
		let f = 0, u = 0;
		if (h >= 0) {
			const n = a[h], e = l[h], r = a[h + 1], o = l[h + 1], c = e > .03 && e < .97, y = o > .03 && o < .97;
			f = c && y ? n + (r - n) * (.5 - e) / (o - e) : c ? n - t * ra(e, s, i) : y ? r - t * ra(o, s, i) : .5 * (n + r), u = 1;
		} else if (0 !== t) for (let y = 0; y < c; y++) {
			const n = l[y];
			if (n > .03 && n < .97) {
				const e = 1 - 2 * Math.abs(n - .5);
				f += e * (a[y] - t * ra(n, s, i)), u += e;
			}
		}
		return u > 1e-9 ? f / u : NaN;
	}
	isStepLike(t, n) {
		const { probeA: e, probeCount: r } = this;
		let o = !0, s = !0, i = 1, a = 0;
		for (let l = 0; l < r; l++) l > 0 && (e[l] >= e[l - 1] - .05 || (o = !1), e[l] <= e[l - 1] + .05 || (s = !1)), i = Math.min(i, e[l]), a = Math.max(a, e[l]);
		return !t && r >= 3 && n && (o || s) && i < .12 && a > .88 && this.contrast >= 2 * this.minContrast;
	}
	rootFindHalf(t, n, e, r) {
		let o = !1, s = 0, i = 0;
		for (let a = 0; a <= 9; a++) {
			const l = 2 * a / 9 - 1, c = this.coverageAt(t + e * l, n + r * l);
			if (-1 !== c) {
				if (o && (i - .5) * (c - .5) <= 0 && Math.abs(c - i) > 1e-9) return s + (l - s) * (.5 - i) / (c - i);
				s = l, i = c, o = !0;
			}
		}
		return NaN;
	}
	vertexSigma(t, n, e, r) {
		let o = this.coverageAt(t - .5 * e, n - .5 * r);
		-1 === o && (o = 0);
		let s = this.coverageAt(t + .5 * e, n + .5 * r);
		-1 === s && (s = 1);
		const i = Math.max(Math.abs(s - o), .001), a = this.contrast, l = this.sigmaNoise / a / i, c = this.simplifyFaint ? Math.min(Math.max(.25 / Math.max(a, 1e-6), 1), 4) : 1;
		let h = Math.hypot(l, .05) * c;
		return h >= 0 || (h = 0), Math.min(Math.max(h, .02), 2);
	}
	measurePoint(t, n, e, r, o) {
		const s = t[2 * e], i = t[2 * e + 1];
		let a = Math.max(e - 1, 0), l = Math.min(e + 1, n - 1);
		const c = t[2 * l] - t[2 * a], h = t[2 * l + 1] - t[2 * a + 1], f = Math.hypot(c, h);
		if (this.axisAt(r, o, s, i), f < 1e-9 || this.contrast < this.minContrast) return this.outX = s, this.outY = i, void (this.outSigma = .5);
		const u = -h / f, y = c / f;
		this.probe(s, i, u, y);
		const d = this.probeCount;
		let p = 0;
		if (d > 0) {
			const t = this.probeA[0], n = this.probeA[d - 1];
			this.probeS[d - 1] > this.probeS[0] && Math.abs(n - t) > .05 && (p = n > t ? 1 : -1);
		}
		let g = this.invertStep(p, u, y);
		const m = void 0 === r.at && void 0 === o.at;
		this.isStepLike(!1, m) || (g = this.rootFindHalf(s, i, u, y));
		const x = Number.isNaN(g) ? 0 : Math.min(Math.max(g, -1), 1);
		this.outX = s + u * x, this.outY = i + y * x, this.outSigma = this.vertexSigma(s, i, u, y);
	}
	measureEdge(t, n, e) {
		const r = t.points, o = r.length >> 1, s = new Float64Array(2 * o), i = new Float64Array(o);
		for (let l = 0; l < o; l++) this.measurePoint(r, o, l, n, e), s[2 * l] = this.outX, s[2 * l + 1] = this.outY, i[l] = this.outSigma;
		const a = new Float64Array(o);
		for (let l = 0; l < o; l++) a[l] = sa(s, l, i[l], t.closed);
		for (let l = 0; l < o; l++) 0 !== t.fixed[l] && (s[2 * l] = r[2 * l], s[2 * l + 1] = r[2 * l + 1], a[l] = t.sigma[l]);
		return {
			points: s,
			sigma: a
		};
	}
};
function fa(t, n, e, r = {}) {
	(function(t, n) {
		const { edges: e } = n;
		if (e.length !== t.edges.length) throw new Error("applySubpixel: the measurement is not of this map");
		for (let r = 0; r < e.length; r++) {
			const n = e[r];
			if (null === n) continue;
			const o = t.edges[r];
			o.points = n.points, o.sigma = n.sigma;
		}
	})(t, function(t, n, e, r = {}) {
		if (n.width !== t.width || n.height !== t.height) throw new Error("measureSubpixel: the image is not the size of the map");
		const s = new ha(n, r.sigmaNoise ?? function(t) {
			const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(o);
			for (let i = 0, a = 0; i < o; i++, a += 4) {
				const t = 1 - r[a + 3];
				s[i] = .2126 * (r[a] + t) + .7152 * (r[a + 1] + t) + .0722 * (r[a + 2] + t);
			}
			return $(s, n, e);
		}(n), r.simplifyFaint ?? !1), i = [];
		for (const a of t.edges) {
			const t = -1 === a.left ? void 0 : e[a.left], n = -1 === a.right ? void 0 : e[a.right];
			i.push(void 0 === t || void 0 === n ? null : s.measureEdge(a, t, n));
		}
		return { edges: i };
	}(t, n, e, r));
}
const ua = .4999, ya = .03, da = .97, pa = Math.cos(Math.PI / 4), ga = 1e-6;
function ma(t, n, e, r, o) {
	const s = n.width, i = n.height, a = "data" in n ? n.data : null, l = null === a ? n : void 0, c = l?.uncertainty?.bind(l), h = l?.along?.bind(l), f = c ? {
		uncertainty: c,
		along: h,
		sigma: NaN,
		refused: !1
	} : void 0, u = (t, e) => {
		const r = t < 0 ? 0 : t >= s ? s - 1 : t, o = e < 0 ? 0 : e >= i ? i - 1 : e;
		return null !== a ? a[o * s + r] : n.at(r, o);
	}, y = (t, n) => {
		const e = t - .5, r = n - .5, o = Math.floor(e), s = Math.floor(r), i = e - o, a = r - s, l = u(o, s) * (1 - i) * (1 - a) + u(o + 1, s) * i * (1 - a) + u(o, s + 1) * (1 - i) * a + u(o + 1, s + 1) * i * a + .5;
		return l < 0 ? 0 : l > 1 ? 1 : l;
	}, d = t.length >> 1, p = d > 2 && t[0] === t[2 * (d - 1)] && t[1] === t[2 * (d - 1) + 1], g = p ? d - 1 : d, m = (t) => p ? (t % g + g) % g : t < 0 ? 0 : t >= d ? d - 1 : t, x = e && e.length >= 2 ? new Int32Array(d) : null, M = [];
	if (null !== x && e) {
		const n = e.length - 1;
		for (let r = 0; r < n; r++) {
			const n = e[r], o = e[r + 1], s = t[2 * o] - t[2 * n], i = t[2 * o + 1] - t[2 * n + 1], a = Math.hypot(s, i) || 1;
			M.push(s / a, i / a);
			for (let t = n; t < o && t < d; t++) x[t] = r;
		}
		for (let t = e[n]; t < d; t++) x[t] = n - 1;
	}
	const w = M.length >> 1, b = (t) => {
		const n = 0 === t ? p ? w - 1 : -1 : t - 1, e = t === w ? p ? 0 : -1 : t;
		if (n < 0 || e < 0) return null;
		const r = M[2 * n], o = M[2 * n + 1], s = M[2 * e], i = M[2 * e + 1];
		if (r * s + o * i < pa) return null;
		const a = r + s, l = o + i, c = Math.hypot(a, l);
		return c < 1e-12 ? null : [a / c, l / c];
	}, A = (t, n, e) => {
		const r = e[t], o = M[2 * r], s = M[2 * r + 1];
		if (w < 2) return [o, s];
		const i = n[r], a = n[r + 1], l = a > i ? (t - i) / (a - i) : 0, c = b(r) ?? [o, s], h = b(r + 1) ?? [o, s], f = Math.atan2(c[1], c[0]);
		let u = Math.atan2(h[1], h[0]) - f;
		for (; u > Math.PI;) u -= 2 * Math.PI;
		for (; u < -Math.PI;) u += 2 * Math.PI;
		const y = f + u * l;
		return [Math.cos(y), Math.sin(y)];
	}, k = new Array(t.length);
	o && (o.length = d);
	for (let v = 0; v < d; v++) {
		const n = t[2 * v], a = t[2 * v + 1];
		if (k[2 * v] = n, k[2 * v + 1] = a, o && (o[v] = NaN), n <= 0 || a <= 0 || n >= s || a >= i) continue;
		let l, c;
		if (null !== x && e) [l, c] = A(v, e, x);
		else {
			const n = m(v - 1), e = m(v + 1);
			l = t[2 * e] - t[2 * n], c = t[2 * e + 1] - t[2 * n + 1];
		}
		const h = Math.hypot(l, c);
		if (h < 1e-9) continue;
		const u = -c / h, d = l / h;
		f && (f.sigma = NaN, f.refused = !1);
		const p = Ma(y, n, a, u, d, s, i, f);
		o && f && (null !== p && 0 !== p || f.refused) && (o[v] = f.sigma);
		const M = r ? r[v % g] : 0;
		if (null === p && 0 === M) continue;
		const w = (p ?? 0) + M;
		k[2 * v] = n + u * w, k[2 * v + 1] = a + d * w;
	}
	return k;
}
function xa(t, n, e) {
	const r = t >= .5 ? t : 1 - t;
	return (t >= .5 ? 1 : -1) * (r - .5 <= .5 * (n - e) / n ? (r - .5) * n : .5 * (n + e) - Math.sqrt(Math.max(0, 2 * n * e * (1 - r))));
}
function Ma(t, n, e, r, o, s, i, a) {
	const l = Math.abs(r), c = Math.abs(o), h = l >= c ? l : c, f = l >= c ? c : l, u = [], y = [], d = [];
	for (const N of [
		-1,
		-.5,
		0,
		.5,
		1
	]) {
		const a = Math.round(n + r * N + ga * r * Math.sign(N) - .5), l = Math.round(e + o * N + ga * o * Math.sign(N) - .5);
		if (a < 0 || l < 0 || a >= s || l >= i) continue;
		const c = a + .5, h = l + .5, f = (c - n) * r + (h - e) * o;
		let p = !1;
		for (let t = 0; t < u.length; t++) Math.abs(u[t] - f) < 1e-9 && (p = !0);
		p || (u.push(f), y.push(t(c, h)), d.push(a, l));
	}
	const p = u.map((t, n) => n).toSorted((t, n) => u[t] - u[n]), g = p.map((t) => u[t]), m = p.map((t) => y[t]), x = g.length;
	if (x < 2) return null;
	let M = !1;
	for (const N of m) N > ya && N < da && (M = !0);
	if (!M) return null;
	let w = 0;
	if (g[x - 1] > g[0] && Math.abs(m[x - 1] - m[0]) > .05 && (w = Math.sign(m[x - 1] - m[0])), a && !function(t, n, e, r, o, s) {
		t.sigma = NaN;
		let i = -1, a = -1;
		for (let g = 0; g < r.length; g++) r[g] < 0 ? i = g : r[g] > 0 && a < 0 && (a = g);
		if (i < 0 || a < 0) return !0;
		const l = t.uncertainty(o[2 * s[i]], o[2 * s[i] + 1]), c = t.uncertainty(o[2 * s[a]], o[2 * s[a] + 1]);
		if (Number.isNaN(l) || Number.isNaN(c)) return !0;
		const h = Math.abs(e[a] - e[i]) / (r[a] - r[i]);
		t.sigma = Math.min(function(t, n, e = .05) {
			const r = n <= 1e-6 ? 4 : t / n;
			return Math.min(Math.max(Math.hypot(r, e), .001), 4);
		}(Math.max(l, c), h), 2);
		const f = e[i] > ya && e[i] < da, u = e[a] > ya && e[a] < da;
		if (!f || !u || (e[i] - .5) * (e[a] - .5) <= 0) return !0;
		const y = e[i] < .5 ? e[a] >= e[i] : e[a] <= e[i], d = y ? a : i;
		for (let g = y ? a + 1 : i - 1; g >= 0 && g < r.length; g += y ? 1 : -1) if (!Number.isNaN(t.uncertainty(o[2 * s[g]], o[2 * s[g] + 1])) && (e[g] - .5) * (e[d] - .5) <= 0) return !0;
		if (t.along) {
			const i = o[2 * s[d]], a = o[2 * s[d] + 1], l = r[d] + (y ? 1 : -1), c = Math.round(n.px + n.nx * l - .5), h = Math.round(n.py + n.ny * l - .5);
			if ((c !== i || h !== a) && c >= 0 && h >= 0 && c < n.w && h < n.h && (t.along(c, h, i, a) + .5 - .5) * (e[d] - .5) <= 0) return !0;
		}
		const p = Math.abs(.5 - .5 * (e[i] + e[a])) / Math.max(h, 1e-6);
		return t.sigma = Math.min(Math.hypot(p, t.sigma), 1), t.refused = !0, !1;
	}(a, {
		px: n,
		py: e,
		nx: r,
		ny: o,
		w: s,
		h: i
	}, m, g, d, p)) return null;
	const b = (t) => t > ya && t < da;
	let A = null;
	if (0 !== w) for (let N = 0; N < x - 1; N++) {
		const t = m[N], n = m[N + 1];
		if ((t - .5) * (n - .5) <= 0 && Math.abs(n - t) > 1e-9) {
			A = b(t) && b(n) ? g[N] + (g[N + 1] - g[N]) * (.5 - t) / (n - t) : b(t) ? g[N] - w * xa(t, h, f) : b(n) ? g[N + 1] - w * xa(n, h, f) : .5 * (g[N] + g[N + 1]);
			break;
		}
	}
	let k = !0, v = !0;
	for (let N = 1; N < x; N++) m[N] < m[N - 1] - .05 && (k = !1), m[N] > m[N - 1] + .05 && (v = !1);
	let F = 1, I = 0;
	for (const N of m) N < F && (F = N), N > I && (I = N);
	if (!(x >= 3 && (k || v) && F < .12 && I > .88)) {
		A = null;
		let s = -1, i = -1;
		for (let t = 0; t < x; t++) g[t] < 0 ? s = t : i < 0 && (i = t);
		const a = s >= 0 && i >= 0 && Math.abs(m[i] - m[s]) > .05 ? Math.sign(m[i] - m[s]) : 0, l = 9;
		let c = 0, h = 0, f = !1;
		for (let u = 0; u <= l; u++) {
			const s = 2 * u / l - 1, i = t(n + r * s, e + o * s);
			if (f && (h - .5) * (i - .5) <= 0 && Math.abs(i - h) > 1e-9 && (0 === a || Math.sign(i - h) === a)) {
				const t = c + (s - c) * (.5 - h) / (i - h);
				(null === A || Math.abs(t) < Math.abs(A)) && (A = t);
			}
			c = s, h = i, f = !0;
		}
	}
	return null === A ? null : A > 1 ? 1 : A < -1 ? -1 : A;
}
const wa = /* @__PURE__ */ new WeakMap();
function ba(t, n, e, r, o) {
	const s = e[r] - e[o], i = e[r + 1] - e[o + 1], a = e[r + 2] - e[o + 2], l = s * s + i * i + a * a;
	if (l < 1) return -1;
	const c = ((t[n] - e[o]) * s + (t[n + 1] - e[o + 1]) * i + (t[n + 2] - e[o + 2]) * a) / l;
	return c < 0 ? 0 : c > 1 ? 1 : c;
}
function Aa(t) {
	if (!("data" in t)) return t;
	const { width: n, height: e, data: r } = t;
	return {
		width: n,
		height: e,
		at: (t, e) => r[e * n + t]
	};
}
const ka = 1.5;
function va(t, n) {
	const { x0: e, y0: r, w: o, h: s, data: i, weight: a } = n, l = n.unit ?? 1, c = [];
	let h = 0, f = 0, u = 0, y = 0;
	const d = (t, n) => {
		n !== f && c.push(h * l - e, f * l - r, t * l - e, n * l - r), h = t, f = n;
	};
	for (const x of t) if ("M" === x.type) d(u, y), h = u = x.x, f = y = x.y;
	else if ("L" === x.type || "A" === x.type) d(x.x, x.y);
	else if ("C" === x.type) {
		const t = h, n = f;
		for (let e = 1; e <= 16; e++) {
			const r = e / 16, o = 1 - r, s = o * o * o, i = 3 * o * o * r, a = 3 * o * r * r, l = r * r * r;
			d(s * t + i * x.x1 + a * x.x2 + l * x.x, s * n + i * x.y1 + a * x.y2 + l * x.y);
		}
	} else if ("Q" === x.type) {
		const t = h, n = f;
		for (let e = 1; e <= 16; e++) {
			const r = e / 16, o = 1 - r;
			d(o * o * t + 2 * o * r * x.x1 + r * r * x.x, o * o * n + 2 * o * r * x.y1 + r * r * x.y);
		}
	} else d(u, y);
	d(u, y);
	const p = new Float64Array(o * s), g = [];
	for (let x = 0; x < 16 * s; x++) {
		const t = (x + .5) / 16;
		g.length = 0;
		for (let e = 0; e < c.length; e += 4) {
			const n = c[e + 1], r = c[e + 3];
			if (n <= t != r <= t) {
				const o = c[e];
				g.push(o + (t - n) * (c[e + 2] - o) / (r - n));
			}
		}
		if (g.length < 2) continue;
		g.sort((t, n) => t - n);
		const n = Math.floor(t) * o;
		for (let e = 0; e + 1 < g.length; e += 2) {
			const t = Math.max(0, g[e]), r = Math.min(o, g[e + 1]);
			for (let e = Math.floor(t); e < r; e++) {
				const o = Math.min(r, e + 1) - Math.max(t, e);
				o > 0 && (p[n + e] += o / 16);
			}
		}
	}
	let m = 0;
	for (let x = 0; x < o * s; x++) {
		if (0 === a[x]) continue;
		const t = p[x] - i[x];
		m += t * t;
	}
	return m;
}
function Fa(t) {
	const n = t.length > 0 && "Z" === t[t.length - 1].type, e = n ? t.slice(0, -1) : t.slice();
	if (0 === e.length) return [];
	const r = [], o = e[e.length - 1];
	if ("Z" === o.type || "M" !== e[0].type) throw new Error("reverseCommands: malformed subpath");
	const s = (o.type, o.x), i = (o.type, o.y);
	r.push({
		type: "M",
		x: s,
		y: i
	});
	for (let a = e.length - 1; a >= 1; a--) {
		const t = e[a], n = e[a - 1];
		switch (t.type) {
			case "L":
				r.push({
					type: "L",
					x: n.x,
					y: n.y
				});
				break;
			case "Q":
				r.push({
					type: "Q",
					x1: t.x1,
					y1: t.y1,
					x: n.x,
					y: n.y
				});
				break;
			case "C":
				r.push({
					type: "C",
					x1: t.x2,
					y1: t.y2,
					x2: t.x1,
					y2: t.y1,
					x: n.x,
					y: n.y
				});
				break;
			case "A": r.push({
				type: "A",
				rx: t.rx,
				ry: t.ry,
				rotation: t.rotation,
				largeArc: t.largeArc,
				sweep: !t.sweep,
				x: n.x,
				y: n.y
			});
		}
	}
	return n && r.push({ type: "Z" }), r;
}
function Ia(t, n, e, r, o, s, i, a, l) {
	const c = 1 - l, h = c * c * c, f = 3 * c * c * l, u = 3 * c * l * l, y = l * l * l;
	return [h * t + f * e + u * o + y * i, h * n + f * r + u * s + y * a];
}
function Na(t) {
	const n = 1 - t;
	return n * n * n;
}
function Sa(t) {
	const n = 1 - t;
	return 3 * t * n * n;
}
function Pa(t) {
	return 3 * t * t * (1 - t);
}
function Ca(t) {
	return t * t * t;
}
function Ua(t, n, e, r, o, s, i, a) {
	const l = t[2 * n], c = t[2 * n + 1], h = t[2 * e], f = t[2 * e + 1];
	let u = 0, y = 0, d = 0, p = 0, g = 0;
	for (let A = n; A <= e; A++) {
		const e = r[A - n], m = o * Sa(e), x = s * Sa(e), M = i * Pa(e), w = a * Pa(e);
		u += m * m + x * x, y += m * M + x * w, d += M * M + w * w;
		const b = t[2 * A] - (Na(e) + Sa(e)) * l - (Pa(e) + Ca(e)) * h, k = t[2 * A + 1] - (Na(e) + Sa(e)) * c - (Pa(e) + Ca(e)) * f;
		p += m * b + x * k, g += M * b + w * k;
	}
	const m = u * d - y * y;
	let x = 0, M = 0;
	Math.abs(m) > 1e-12 && (x = (p * d - g * y) / m, M = (u * g - y * p) / m);
	const w = Math.hypot(h - l, f - c), b = 1e-6 * w;
	return (x < b || M < b) && (x = M = w / 3), {
		p0x: l,
		p0y: c,
		c1x: l + x * o,
		c1y: c + x * s,
		c2x: h + M * i,
		c2y: f + M * a,
		p3x: h,
		p3y: f
	};
}
function La(t, n) {
	return Ia(t.p0x, t.p0y, t.c1x, t.c1y, t.c2x, t.c2y, t.p3x, t.p3y, n);
}
function $a(t, n, e, r) {
	const [o, s] = La(t, r), [i, a] = function(t, n) {
		const e = 1 - n, r = 3 * (t.c1x - t.p0x), o = 3 * (t.c1y - t.p0y), s = 3 * (t.c2x - t.c1x), i = 3 * (t.c2y - t.c1y);
		return [e * e * r + 2 * e * n * s + n * n * (3 * (t.p3x - t.c2x)), e * e * o + 2 * e * n * i + n * n * (3 * (t.p3y - t.c2y))];
	}(t, r), [l, c] = function(t, n) {
		const e = 6 * (t.c2x - 2 * t.c1x + t.p0x), r = 6 * (t.c2y - 2 * t.c1y + t.p0y);
		return [(1 - n) * e + n * (6 * (t.p3x - 2 * t.c2x + t.c1x)), (1 - n) * r + n * (6 * (t.p3y - 2 * t.c2y + t.c1y))];
	}(t, r), h = o - n, f = s - e, u = h * i + f * a, y = i * i + a * a + h * l + f * c;
	if (Math.abs(y) < 1e-12) return r;
	const d = r - u / y;
	return d < 0 ? 0 : d > 1 ? 1 : d;
}
function qa(t, n, e) {
	const r = t.length >> 1, o = [], s = [
		0,
		...e.filter((t) => t > 0 && t < r - 1),
		r - 1
	];
	for (let i = 0; i + 1 < s.length; i++) za(t, s[i], s[i + 1], n, o);
	return o;
}
function Ra(t, n) {
	const e = t[2 * (n - 1)] - t[2 * n], r = t[2 * (n - 1) + 1] - t[2 * n + 1], o = Math.hypot(e, r) || 1;
	return [e / o, r / o];
}
function za(t, n, e, r, o) {
	const [s, i] = function(t, n) {
		const e = t[2 * (n + 1)] - t[2 * n], r = t[2 * (n + 1) + 1] - t[2 * n + 1], o = Math.hypot(e, r) || 1;
		return [e / o, r / o];
	}(t, n), [a, l] = Ra(t, e);
	Ta(t, n, e, s, i, a, l, r, o, 0);
}
function Ta(t, n, e, r, o, s, i, a, l, c) {
	if (e - n === 1) return void l.push({
		type: "L",
		x: t[2 * e],
		y: t[2 * e + 1]
	});
	const h = e - n + 1, f = new Float64Array(h);
	for (let x = 1; x < h; x++) {
		const e = n + x;
		f[x] = f[x - 1] + Math.hypot(t[2 * e] - t[2 * (e - 1)], t[2 * e + 1] - t[2 * (e - 1) + 1]);
	}
	const u = f[h - 1] || 1;
	for (let x = 0; x < h; x++) f[x] /= u;
	let y = Ua(t, n, e, f, r, o, s, i), { maxErr: d, splitAt: p } = Ea(t, n, e, y, f);
	if (d <= a) return void l.push(ja(y));
	if (d <= a * a * 16 || d <= 4 * a) for (let x = 0; x < 4; x++) {
		for (let e = 0; e < h; e++) f[e] = $a(y, t[2 * (n + e)], t[2 * (n + e) + 1], f[e]);
		let c = !0;
		for (let t = 1; t < h; t++) if (f[t] <= f[t - 1]) {
			c = !1;
			break;
		}
		if (!c) break;
		y = Ua(t, n, e, f, r, o, s, i);
		const u = Ea(t, n, e, y, f);
		if (d = u.maxErr, p = u.splitAt, d <= a) return void l.push(ja(y));
	}
	if (c > 24) {
		for (let r = n + 1; r <= e; r++) l.push({
			type: "L",
			x: t[2 * r],
			y: t[2 * r + 1]
		});
		return;
	}
	const [g, m] = function(t, n) {
		const e = t[2 * (n - 1)] - t[2 * (n + 1)], r = t[2 * (n - 1) + 1] - t[2 * (n + 1) + 1], o = Math.hypot(e, r);
		if (o < 1e-12) {
			const [e, r] = Ra(t, n);
			return [e, r];
		}
		return [e / o, r / o];
	}(t, p);
	Ta(t, n, p, r, o, g, m, a, l, c + 1), Ta(t, p, e, -g, -m, s, i, a, l, c + 1);
}
function Ea(t, n, e, r, o) {
	let s = 0, i = n + e >> 1;
	for (let a = n + 1; a < e; a++) {
		const [e, l] = La(r, o[a - n]), c = Math.hypot(e - t[2 * a], l - t[2 * a + 1]);
		c > s && (s = c, i = a);
	}
	return {
		maxErr: s,
		splitAt: i
	};
}
function ja(t) {
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
function Ba(t, n, e, r, o, s, i, a) {
	const l = Math.abs(o - t) + Math.abs(s - n);
	let c;
	if (0 !== l) {
		const i = Math.abs((e - t) * (s - n) - (o - t) * (r - n)) / l;
		c = i > 1 ? 1 - 1 / i : 0, c /= .75;
	} else c = 4 / 3;
	return function(t, n, e, r, o, s, i, a, l) {
		return void 0 === l ? t >= n : !(Math.min(Math.hypot(e - o, r - s), Math.hypot(i - o, a - s)) < 1.5) && (M(e, r, o, s, i, a) < l || t >= n);
	}(c, i, t, n, e, r, o, s, a);
}
const Oa = Object.freeze({
	cubicParams: 6,
	g1BreakDegrees: 10,
	arcParams: 5,
	cubicMaxTurnDegrees: 1 / 0
}), Ka = Math.PI / 180;
let Da = Oa;
function Ha() {
	return Da.cubicParams;
}
function Xa() {
	return Da.g1BreakDegrees * Ka;
}
function Wa() {
	return Da.arcParams;
}
function Ga() {
	return Da.cubicMaxTurnDegrees * Ka;
}
function Za(t, n) {
	return n < 0 || Object.is(n, -0) ? -Math.abs(t) : Math.abs(t);
}
function Qa(t) {
	return Number.isNaN(t) ? NaN : t < 0 || Object.is(t, -0) ? -1 : 1;
}
function Ya(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t >= n ? t : n;
}
function _a(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t <= n ? t : n;
}
function Va(t, n, e) {
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
		i = -.5 * (o + Za(Math.sqrt(s), o));
	} else i = -o;
	const a = r / i;
	return Number.isFinite(a) ? a > i ? [i, a] : [a, i] : [i];
}
function Ja(t, n) {
	return 0 === n ? Math.abs(t) : Math.abs((t - n) / n);
}
function tl(t, n, e, r, o, s, i) {
	return Ja(t + e, o) + Ja(n + t * e + r, s) + Ja(n * e + t * r, i);
}
function nl(t, n, e, r, o, s, i, a) {
	return tl(t, n, e, r, o, s, i) + Ja(n * r, a);
}
function el(t, n, e, r, o, s, i, a, l) {
	return t * (o * l - s * a) - n * (r * l - s * i) + e * (r * a - o * i);
}
function rl(t, n, e) {
	const r = el(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
	return !(Math.abs(r) < 1e-18 || (e[0] = el(n[0], t[1], t[2], n[1], t[4], t[5], n[2], t[7], t[8]) / r, e[1] = el(t[0], n[0], t[2], t[3], n[1], t[5], t[6], n[2], t[8]) / r, e[2] = el(t[0], t[1], n[0], t[3], t[4], n[1], t[6], t[7], n[2]) / r, 0));
}
const ol = 2 ** -600, sl = 2 ** 511, il = 2 ** -511, al = 2 ** -54;
function ll(t, n) {
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
function cl(t, n) {
	if (!Number.isFinite(t) || !Number.isFinite(n)) return Math.abs(t) === 1 / 0 || Math.abs(n) === 1 / 0 ? 1 / 0 : t + n;
	const e = Math.abs(t), r = Math.abs(n), o = e < r ? r : e, s = e < r ? e : r;
	return o > sl ? s <= o * al ? o + s : ll(o * ol, s * ol) / ol : s < il ? o >= s / al ? o + s : ll(o / ol, s / ol) * ol : s <= o * al ? o + s : ll(o, s);
}
var hl = class {
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
function fl(t, n) {
	let e = 0, r = 0, o = 0, s = 0, i = 0, a = 0, l = 0, c = 0, h = 0, f = 0, u = 0;
	for (let x = 0; x < n; x++) {
		const n = t.u[x], y = t.w[x], d = t.x[x], p = t.y[x], g = n * n, m = g * n;
		e += y, a += y * d, h += y * p, r += y * n, l += y * n * d, f += y * n * p, o += y * g, c += y * g * d, u += y * g * p, s += y * m, i += y * (m * n);
	}
	const y = t.m;
	if (y[0] = e, y[1] = r, y[2] = o, y[3] = r, y[4] = o, y[5] = s, y[6] = o, y[7] = s, y[8] = i, t.tx[0] = a, t.tx[1] = l, t.tx[2] = c, t.ty[0] = h, t.ty[1] = f, t.ty[2] = u, !rl(y, t.tx, t.cx)) return !1;
	if (!rl(y, t.ty, t.cy)) return !1;
	const d = t.cx, p = t.cy;
	let g = 0;
	for (let x = 0; x < n; x++) {
		const n = t.u[x], e = t.x[x] - (d[0] + d[1] * n + d[2] * n * n), r = t.y[x] - (p[0] + p[1] * n + p[2] * n * n);
		g += t.w[x] * (e * e + r * r);
	}
	const m = Math.hypot(d[1], p[1]);
	return !(m < 1e-12 || !Number.isFinite(m) || (t.dirX = d[1] / m, t.dirY = p[1] / m, t.resid = g, 0));
}
function ul(t, n) {
	if (t.edges) return t.edges[n];
	const e = t.poly.points, r = (n + 1) % t.n;
	return Math.hypot(e[2 * n] - e[2 * r], e[2 * n + 1] - e[2 * r + 1]);
}
function yl(t, n) {
	return 1 / (t.sigma[n] * t.sigma[n]);
}
function dl(t, n, e, r, o) {
	const { poly: s, n: i } = t, a = s.points, l = s.closed ? i - 1 : e ? i - 1 - n : n, c = Math.min(16, l);
	if (c < 1) return null;
	const h = (t) => e ? (n + t) % i : (n + i - t % i) % i;
	o.len = 0;
	let f = 0;
	for (let x = 0; x <= c; x++) {
		const n = h(x);
		if (x > 0) {
			const r = ul(t, e ? h(x - 1) : n);
			f += e ? r : -r;
		}
		o.push(f, a[2 * n], a[2 * n + 1], yl(s, n));
	}
	const u = r.tau * r.tau;
	for (let x = c; x >= 2; x--) {
		if (!fl(o, x + 1)) continue;
		const t = Math.max(2 * (x + 1) - 6, 0);
		if (t <= 0 || o.resid <= u * t) return {
			x: o.dirX,
			y: o.dirY
		};
	}
	const y = h(1), d = a[2 * y] - a[2 * n], p = a[2 * y + 1] - a[2 * n + 1], g = Math.hypot(d, p);
	if (g < 1e-12) return null;
	const m = e ? 1 : -1;
	return {
		x: m * d / g,
		y: m * p / g
	};
}
function pl(t, n, e, r, o) {
	const { poly: s, n: i } = t, a = s.points, l = s.closed ? Math.floor((i - 1) / 2) : Math.min(n, i - 1 - n), c = Math.min(e, 16, l);
	if (c < 2) return null;
	const h = (t) => ((n + t) % i + i) % i, f = r.tau * r.tau, u = o.back;
	for (let y = c; y >= 2; y--) {
		o.len = 0;
		let e = 0;
		for (let n = 1; n <= y; n++) e -= ul(t, h(-n)), u[n - 1] = e;
		for (let t = y; t >= 1; t--) {
			const n = h(-t);
			o.push(u[t - 1], a[2 * n], a[2 * n + 1], yl(s, n));
		}
		o.push(0, a[2 * n], a[2 * n + 1], yl(s, n)), e = 0;
		for (let n = 1; n <= y; n++) {
			const r = h(n);
			e += ul(t, h(n - 1)), o.push(e, a[2 * r], a[2 * r + 1], yl(s, r));
		}
		if (!fl(o, o.len)) continue;
		const r = 2 * (2 * y + 1) - 6;
		if (o.resid <= f * r) return {
			x: o.dirX,
			y: o.dirY
		};
	}
	return null;
}
function gl(t, n) {
	const e = t.points.length >> 1, r = t.points, o = new Float64Array(e);
	for (let c = 0; c < e; c++) {
		const t = (c + 1) % e;
		o[c] = Math.hypot(r[2 * c] - r[2 * t], r[2 * c + 1] - r[2 * t + 1]);
	}
	const s = {
		poly: t,
		n: e,
		edges: o
	}, i = new hl(), a = [], l = [];
	for (let c = 0; c < e; c++) {
		const t = pl(s, c, 16, n, i);
		if (t) {
			a.push(t), l.push({
				x: t.x,
				y: t.y
			});
			continue;
		}
		const e = dl(s, c, !0, n, i), r = dl(s, c, !1, n, i), o = e ?? r ?? {
			x: 1,
			y: 0
		}, h = r ?? e ?? {
			x: 1,
			y: 0
		};
		l.push(o), a.push(h === o ? {
			x: h.x,
			y: h.y
		} : h);
	}
	return {
		incoming: a,
		outgoing: l
	};
}
function ml(t, n) {
	const e = Math.hypot(t.x, t.y), r = Math.hypot(n.x, n.y);
	return e < 1e-12 || r < 1e-12 ? 0 : Math.acos(Math.min(Math.max((t.x * n.x + t.y * n.y) / (e * r), -1), 1));
}
function xl(t, n, e) {
	const r = ml(t, n) / Xa();
	return e * _a(r * r, 1);
}
function Ml(t, n, e) {
	return xl(t.incoming[n], t.outgoing[n], e.lambda);
}
function wl(t, n) {
	const e = n < t.length ? t[n] : .5, r = e > .001 ? e : .001;
	return 1 / (r * r);
}
function bl(t, n) {
	const e = new Float64Array(n);
	for (let r = 0; r < n; r++) e[r] = wl(t, r);
	return e;
}
function Al(t, n, e, r) {
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
		for (let a = o + 1; a < e; a++) {
			const r = t[a * e + o] / i;
			if (0 !== r) {
				for (let n = o; n < e; n++) t[a * e + n] -= r * t[o * e + n];
				n[a] -= r * n[o];
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
function kl(t, n, e) {
	const r = new Float64Array(e);
	for (let o = e - 1; o >= 0; o--) {
		let s = n[o];
		for (let n = o + 1; n < e; n++) s -= t[n * e + o] * r[n];
		r[o] = s / t[o * e + o];
	}
	return r;
}
function vl(t, n, e, r, o, s) {
	for (let i = 0; i < r; i++) {
		let a = n[e + i];
		for (let n = 0; n < i; n++) a -= t[i * r + n] * o[s + n];
		o[s + i] = a / t[i * r + i];
	}
}
const Fl = /* @__PURE__ */ new Float64Array(25), Il = /* @__PURE__ */ new Float64Array(25), Nl = /* @__PURE__ */ new Float64Array(25), Sl = /* @__PURE__ */ new Float64Array(25), Pl = /* @__PURE__ */ new Float64Array(10);
function Cl(t, n, e, r, o) {
	const s = t.length;
	let i = Float64Array.from(t);
	r(i);
	let a = new Float64Array(s * s), l = new Float64Array(s), c = new Float64Array(s * s), h = new Float64Array(s);
	const f = e(i, a, l);
	if (null === f) return null;
	let u = f, y = .001;
	const d = new Float64Array(s * s), p = new Float64Array(s), g = new Float64Array(s);
	let m = new Float64Array(s);
	for (let x = 0; x < n; x++) {
		d.set(a);
		for (let e = 0; e < s; e++) {
			const t = Math.abs(a[e * s + e]);
			d[e * s + e] += y * (t > 1e-12 ? t : 1e-12), p[e] = -l[e];
		}
		if (!Al(d, p, s, g)) {
			if (y *= 10, y > 0xe8d4a51000) break;
			continue;
		}
		for (let e = 0; e < s; e++) m[e] = i[e] + g[e];
		r(m);
		const t = o?.(m), n = void 0 === t || null !== t && t <= u && Number.isFinite(t) ? e(m, c, h) : null;
		if (null !== n && n <= u && Number.isFinite(n)) {
			const t = u - n;
			if ([i, m] = [m, i], [a, c] = [c, a], [l, h] = [h, l], u = n, y = Math.max(y / 3, 1e-15), t <= 1e-10 * Math.max(u, 1e-12)) break;
		} else if (y *= 4, y > 0xe8d4a51000) break;
	}
	return {
		p: i,
		chi2: u
	};
}
function Ul(t, n, e) {
	const r = Math.sin(t.angle), o = Math.cos(t.angle), s = t.rx * Math.cos(n), i = t.ry * Math.sin(n);
	e[0] = t.cx + o * s - r * i, e[1] = t.cy + r * s + o * i;
}
function Ll(t, n, e, r) {
	const o = Math.sin(t.angle), s = Math.cos(t.angle), i = n - t.cx, a = e - t.cy, l = s * i + o * a, c = -o * i + s * a, h = t.rx, f = t.ry;
	let u = Math.atan2(h * c, f * l);
	const y = h * h - f * f;
	for (let w = 0; w < 12; w++) {
		const t = Math.sin(u), n = Math.cos(u), e = -h * l * t + f * c * n + y * t * n, r = -h * l * n - f * c * t + y * (n * n - t * t);
		if (Math.abs(r) < 1e-300) break;
		const o = Math.min(Math.max(e / r, -.5), .5);
		if (u -= o, Math.abs(o) < 1e-13) break;
	}
	const d = Math.sin(u), p = Math.cos(u);
	let g = f * p, m = h * d;
	const x = Math.hypot(g, m);
	x < 1e-300 ? (g = 1, m = 0) : (g /= x, m /= x);
	const M = (l - h * p) * g + (c - f * d) * m;
	return r[0] = M, r[1] = u, r[2] = g, r[3] = m, M;
}
function $l(t) {
	let n = t;
	for (; n > Math.PI / 2;) n -= Math.PI;
	for (; n <= -Math.PI / 2;) n += Math.PI;
	return n;
}
let ql = /* @__PURE__ */ new Float64Array(0);
function Rl(t, n) {
	const e = t.length >> 1;
	if (e < 6) return null;
	ql.length < 6 * e && (ql = new Float64Array(6 * e));
	const r = ql, o = ql.subarray(e, 6 * e);
	let s = 0, i = 0, a = 0;
	for (let $ = 0; $ < e; $++) {
		const e = wl(n, $);
		r[$] = e, s += e, i += t[2 * $] * e, a += t[2 * $ + 1] * e;
	}
	if (!(s > 0)) return null;
	i /= s, a /= s;
	let l = 0;
	for (let $ = 0; $ < e; $++) {
		const n = t[2 * $] - i, e = t[2 * $ + 1] - a;
		l += r[$] * (n * n + e * e);
	}
	const c = Math.sqrt(l / s);
	if (!(c > 1e-12)) return null;
	let h = 0, f = 0, u = 0, y = 0, d = 0;
	for (let $ = 0; $ < e; $++) {
		const n = (t[2 * $] - i) / c, e = (t[2 * $ + 1] - a) / c, s = 5 * $, l = r[$], p = n * n, g = n * e, m = e * e;
		o[s] = p, o[s + 1] = g, o[s + 2] = m, o[s + 3] = n, o[s + 4] = e, h += l * p, f += l * g, u += l * m, y += l * n, d += l * e;
	}
	h /= s, f /= s, u /= s, y /= s, d /= s;
	const p = new Float64Array([
		h,
		f,
		u,
		y,
		d
	]), g = /* @__PURE__ */ new Float64Array(25);
	let m = 0, x = 0, M = 0, w = 0, b = 0, A = 0, k = 0, v = 0, F = 0, I = 0, N = 0;
	for (let $ = 0; $ < e; $++) {
		const t = 5 * $, n = o[t + 3], e = o[t + 4], s = o[t] - h, i = o[t + 1] - f, a = o[t + 2] - u, l = n - y, c = e - d, p = r[$], S = p * s, P = p * i, C = p * a, U = p * l, L = p * c;
		g[0] += S * s, g[1] += S * i, g[2] += S * a, g[3] += S * l, g[4] += S * c, g[5] += P * s, g[6] += P * i, g[7] += P * a, g[8] += P * l, g[9] += P * c, g[10] += C * s, g[11] += C * i, g[12] += C * a, g[13] += C * l, g[14] += C * c, g[15] += U * s, g[16] += U * i, g[17] += U * a, g[18] += U * l, g[19] += U * c, g[20] += L * s, g[21] += L * i, g[22] += L * a, g[23] += L * l, g[24] += L * c;
		const q = 2 * n, R = 2 * e;
		m += p * (q * q), x += p * (q * e), M += p * q, w += p * (e * e + n * n), b += p * (n * R), A += p * e, k += p * n, v += p * (R * R), F += p * R, I += p, N += p;
	}
	const S = function(t, n) {
		const e = Fl;
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
		const r = Il, o = Pl;
		for (let l = 0; l < 5; l++) {
			for (let n = 0; n < 5; n++) o[n] = t[5 * n + l];
			vl(e, o, 0, 5, o, 5);
			for (let t = 0; t < 5; t++) r[5 * t + l] = o[5 + t];
		}
		const s = Nl;
		for (let l = 0; l < 5; l++) vl(e, r, 5 * l, 5, s, 5 * l);
		for (let l = 0; l < 5; l++) for (let t = l + 1; t < 5; t++) {
			const n = .5 * (s[5 * l + t] + s[5 * t + l]);
			s[5 * l + t] = n, s[5 * t + l] = n;
		}
		const i = Sl;
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
					const s = (t[5 * n + n] - t[5 * r + r]) / (2 * o), i = 0 === s ? 1 : (s > 0 ? 1 : -1) / (Math.abs(s) + Math.sqrt(s * s + 1)), a = 1 / Math.sqrt(i * i + 1), l = i * a;
					for (let e = 0; e < 5; e++) {
						const o = t[5 * e + r], s = t[5 * e + n];
						t[5 * e + r] = a * o - l * s, t[5 * e + n] = l * o + a * s;
					}
					for (let e = 0; e < 5; e++) {
						const o = t[5 * r + e], s = t[5 * n + e];
						t[5 * r + e] = a * o - l * s, t[5 * n + e] = l * o + a * s;
					}
					for (let t = 0; t < 5; t++) {
						const o = e[5 * t + r], s = e[5 * t + n];
						e[5 * t + r] = a * o - l * s, e[5 * t + n] = l * o + a * s;
					}
				}
			}
		})(s, 0, i);
		let a = 0;
		for (let l = 1; l < 5; l++) s[5 * l + l] < s[5 * a + a] && (a = l);
		for (let l = 0; l < 5; l++) o[l] = i[5 * l + a];
		return {
			theta: kl(e, o.subarray(0, 5), 5),
			mu: s[5 * a + a]
		};
	}(g, new Float64Array([
		m,
		x,
		0,
		M,
		0,
		x,
		w,
		b,
		A,
		k,
		0,
		b,
		v,
		0,
		F,
		M,
		A,
		0,
		I,
		0,
		0,
		k,
		F,
		0,
		N
	]));
	if (null === S) return null;
	const P = S.theta;
	let C = 0;
	for (let $ = 0; $ < 5; $++) C += p[$] * P[$];
	const U = function(t) {
		const [n, e, r, o, s, i] = [
			t[0],
			t[1],
			t[2],
			t[3],
			t[4],
			t[5]
		];
		if (!(e * e - 4 * n * r < 0)) return null;
		const a = 4 * n * r - e * e, l = (e * s - 2 * r * o) / a, c = (e * o - 2 * n * s) / a, h = i + .5 * (o * l + s * c);
		if (0 === h) return null;
		const f = .5 * Math.atan2(e, n - r), u = Math.sin(f), y = Math.cos(f), d = -h / (n * y * y + e * y * u + r * u * u), p = -h / (n * u * u - e * y * u + r * y * y);
		return d > 0 && p > 0 ? {
			cx: l,
			cy: c,
			r1: Math.sqrt(d),
			r2: Math.sqrt(p),
			angle: f
		} : null;
	}([
		P[0],
		P[1],
		P[2],
		P[3],
		P[4],
		-C
	]);
	if (null === U) return null;
	const L = U.r1 < U.r2;
	return {
		fit: {
			cx: i + c * U.cx,
			cy: a + c * U.cy,
			rx: (L ? U.r2 : U.r1) * c,
			ry: (L ? U.r1 : U.r2) * c,
			angle: $l(L ? U.angle + Math.PI / 2 : U.angle),
			chi2: 1 / 0
		},
		residual: S.mu * c * c * s
	};
}
function zl(t, n) {
	return Rl(t, n)?.fit ?? null;
}
function Tl(t) {
	t[2] = Math.max(Math.abs(t[2]), .001), t[3] = Math.max(Math.abs(t[3]), .001);
}
function El(t, n, e) {
	const r = t.length >> 1, o = bl(n, r), s = /* @__PURE__ */ new Float64Array(4), i = /* @__PURE__ */ new Float64Array(5), a = {
		cx: 0,
		cy: 0,
		rx: 0,
		ry: 0,
		angle: 0,
		chi2: 0
	}, l = Cl([
		e.cx,
		e.cy,
		e.rx,
		e.ry,
		e.angle
	], 200, (n, e, l) => {
		a.cx = n[0], a.cy = n[1], a.rx = n[2], a.ry = n[3], a.angle = n[4];
		const c = Math.sin(a.angle), h = Math.cos(a.angle);
		e.fill(0), l.fill(0);
		let f = 0;
		for (let u = 0; u < r; u++) {
			const n = Ll(a, t[2 * u], t[2 * u + 1], s);
			if (!Number.isFinite(n)) return null;
			const r = s[1], y = s[2], d = s[3], p = Math.sin(r), g = Math.cos(r), m = a.rx * g, x = a.ry * p;
			i[0] = -(h * y - c * d), i[1] = -(c * y + h * d), i[2] = -y * g, i[3] = -d * p, i[4] = y * x - d * m;
			const M = o[u];
			f += M * n * n;
			for (let t = 0; t < 5; t++) {
				l[t] += M * i[t] * n;
				for (let n = 0; n < 5; n++) e[5 * t + n] += M * i[t] * i[n];
			}
		}
		return f;
	}, Tl);
	if (null === l) return null;
	const [c, h, f, u, y] = l.p, d = f < u;
	return {
		cx: c,
		cy: h,
		rx: d ? u : f,
		ry: d ? f : u,
		angle: $l(d ? y + Math.PI / 2 : y),
		chi2: l.chi2
	};
}
function jl(t, n, e) {
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
			const e = El(t, n, i);
			null !== e && (null === s || e.chi2 < s.chi2) && (s = e);
		}
		return s;
	}(t, n, zl(t, n), e);
}
function Bl(t, n, e, r, o, s, i, a = 1, l = 0) {
	const c = t - e, h = n - r, f = Math.abs(a * c + l * h) - (o - i), u = Math.abs(a * h - l * c) - (s - i), y = f > 0 ? f : 0, d = u > 0 ? u : 0;
	return Math.sqrt(y * y + d * d) + Math.min(Math.max(f, u), 0) - i;
}
function Ol(t, n, e) {
	const r = t.length >> 1, o = Math.cos(e.rotation), s = Math.sin(e.rotation);
	let i = 0;
	for (let a = 0; a < r; a++) {
		const r = Bl(t[2 * a], t[2 * a + 1], e.cx, e.cy, e.hw, e.hh, e.r, o, s);
		i += wl(n, a) * r * r;
	}
	return i;
}
function Kl(t, n, e, r = 0, o = !1) {
	const s = t.length >> 1;
	if (s < 8) return null;
	const i = bl(n, s), a = Math.cos(r), l = Math.sin(r), c = new Float64Array(s), h = new Float64Array(s);
	let f = 1 / 0, u = -1 / 0, y = 1 / 0, d = -1 / 0;
	for (let j = 0; j < s; j++) {
		const n = t[2 * j], e = t[2 * j + 1];
		c[j] = a * n + l * e, h[j] = a * e - l * n, f = Math.min(f, c[j]), u = Math.max(u, c[j]), y = Math.min(y, h[j]), d = Math.max(d, h[j]);
	}
	const p = .5 * (u - f), g = .5 * (d - y);
	if (!(p >= 1e-6 && g >= 1e-6)) return null;
	const m = .5 * (f + u), x = .5 * (y + d), M = a * m - l * x, w = l * m + a * x, b = Math.min(p, g), A = function(t, n, e, r, o, s) {
		if (null !== s) return [Math.min(Math.max(s, 0), o)];
		const [i, a, l, c] = r;
		let h = 0;
		for (let p = 0; p < e.length; p++) e[p] > h && (h = e[p]);
		const f = 3 * Math.max(h, .05), u = [
			0,
			.1 * o,
			.25 * o,
			.5 * o,
			.8 * o,
			o
		], y = [], d = (t, n, e, r, o) => {
			let s = 0, i = 1 / 0, a = -1 / 0;
			for (let l = 0; l < t.length; l++) Math.abs(t[l] - n) > f || (s++, e[l] < i && (i = e[l]), e[l] > a && (a = e[l]));
			s >= 2 && y.push(i - r, o - a);
		};
		return d(n, l, t, i, a), d(n, c, t, i, a), d(t, i, n, l, c), d(t, a, n, l, c), y.length > 0 && (y.sort((t, n) => t - n), u.push(Math.min(Math.max(y[y.length >> 1], 0), o))), u;
	}(c, h, n, [
		f,
		u,
		y,
		d
	], b, e), k = null === e, v = k ? 4 : -1, F = o ? k ? 5 : 4 : -1, I = 4 + (k ? 1 : 0) + (o ? 1 : 0), N = 1e-6 * Math.max(b, 1), S = new Float64Array(7 * (2 * I + 1)), P = new Float64Array(I), C = new Float64Array(I), U = (t, n) => {
		const s = 7 * t;
		S[s] = n[0], S[s + 1] = n[1], S[s + 2] = n[2], S[s + 3] = n[3], S[s + 4] = k ? n[v] : e;
		const i = o ? n[F] : r;
		S[s + 5] = Math.cos(i), S[s + 6] = Math.sin(i);
	}, L = new Float64Array(I), $ = (n, e, r) => {
		U(0, n);
		for (let t = 0; t < I; t++) P[t] = t === F ? 1e-6 : N, L.set(n), L[t] = n[t] + P[t], U(1 + 2 * t, L), L[t] = n[t] - P[t], U(2 + 2 * t, L);
		e.fill(0), r.fill(0);
		let o = 0;
		for (let a = 0; a < s; a++) {
			const s = t[2 * a], l = t[2 * a + 1], c = Bl(s, l, n[0], n[1], n[2], n[3], S[4], S[5], S[6]);
			for (let t = 0; t < I; t++) {
				const n = 7 * (1 + 2 * t), e = n + 7, r = Bl(s, l, S[n], S[n + 1], S[n + 2], S[n + 3], S[n + 4], S[n + 5], S[n + 6]), o = Bl(s, l, S[e], S[e + 1], S[e + 2], S[e + 3], S[e + 4], S[e + 5], S[e + 6]);
				C[t] = (r - o) / (2 * P[t]);
			}
			const h = i[a];
			o += h * c * c;
			for (let t = 0; t < I; t++) {
				r[t] += h * C[t] * c;
				for (let n = 0; n < I; n++) e[t * I + n] += h * C[t] * C[n];
			}
		}
		return o;
	}, q = (n) => {
		U(0, n);
		let e = 0;
		for (let r = 0; r < s; r++) {
			const o = Bl(t[2 * r], t[2 * r + 1], n[0], n[1], n[2], n[3], S[4], S[5], S[6]);
			e += i[r] * o * o;
		}
		return e;
	}, R = (t) => {
		t[2] = Math.max(Math.abs(t[2]), .001), t[3] = Math.max(Math.abs(t[3]), .001), k && (t[v] = Math.min(Math.max(t[v], 0), Math.min(t[2], t[3])));
	};
	let z = null;
	for (const j of A) {
		const t = [
			M,
			w,
			p,
			g
		];
		k && t.push(j), o && t.push(r);
		const n = Cl(t, 100, $, R, q);
		null !== n && (null === z || n.chi2 < z.chi2) && (z = n);
	}
	if (null === z) return null;
	const T = z.p, E = {
		cx: T[0],
		cy: T[1],
		hw: T[2],
		hh: T[3],
		r: k ? T[v] : e,
		rotation: o ? T[F] : r
	};
	if (o) {
		for (; E.rotation > Math.PI / 4;) E.rotation -= Math.PI / 2, [E.hw, E.hh] = [E.hh, E.hw];
		for (; E.rotation <= -Math.PI / 4;) E.rotation += Math.PI / 2, [E.hw, E.hh] = [E.hh, E.hw];
	}
	return {
		...E,
		chi2: Ol(t, n, E)
	};
}
function Dl(t) {
	const n = Math.cos(t.rotation), e = Math.sin(t.rotation), { r } = t, o = -t.w / 2, s = t.w / 2, i = -t.h / 2, a = t.h / 2, l = (r, o) => t.cx + n * r - e * o, c = (r, o) => t.cy + e * r + n * o, h = (t, n, e, r) => ({
		line: !0,
		ax: l(t, n),
		ay: c(t, n),
		bx: l(e, r),
		by: c(e, r)
	}), f = (n, e, o) => ({
		line: !1,
		cx: l(n, e),
		cy: c(n, e),
		r,
		a: o + t.rotation
	});
	return [
		h(s, i + r, s, a - r),
		f(s - r, a - r, 0),
		h(s - r, a, o + r, a),
		f(o + r, a - r, Math.PI / 2),
		h(o, a - r, o, i + r),
		f(o + r, i + r, Math.PI),
		h(o + r, i, s - r, i),
		f(s - r, i + r, 3 * Math.PI / 2)
	].filter((t) => t.line ? Math.hypot(t.bx - t.ax, t.by - t.ay) > 1e-9 : t.r * Math.PI / 2 > 1e-9);
}
function Hl(t, n, e) {
	if (t.line) e[0] = t.ax + (t.bx - t.ax) * n, e[1] = t.ay + (t.by - t.ay) * n;
	else {
		const r = t.a + n * Math.PI / 2;
		e[0] = t.cx + t.r * Math.cos(r), e[1] = t.cy + t.r * Math.sin(r);
	}
}
function Xl(t, n, e) {
	if (t.line) {
		const r = t.bx - t.ax, o = t.by - t.ay, s = r * r + o * o;
		return s > 0 ? Math.min(Math.max(((n - t.ax) * r + (e - t.ay) * o) / s, 0), 1) : 0;
	}
	let r = Math.atan2(e - t.cy, n - t.cx) - t.a;
	for (; r < 0;) r += 2 * Math.PI;
	for (; r >= 2 * Math.PI;) r -= 2 * Math.PI;
	return r <= Math.PI / 2 ? r / (Math.PI / 2) : r < Math.PI / 2 + 3 * Math.PI / 4 ? 1 : 0;
}
function Wl(t, n, e, r, o) {
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
function Gl(t, n, e) {
	const r = /* @__PURE__ */ new Float64Array(2);
	let o = 1 / 0, s = 0, i = 0;
	for (let a = 0; a < t.length; a++) {
		const l = Xl(t[a], n, e);
		Hl(t[a], l, r);
		const c = Math.hypot(n - r[0], e - r[1]);
		c < o && (o = c, s = a, i = l);
	}
	return [s, i];
}
const Zl = Math.PI / 180 * 120, Ql = 2 * Math.PI;
function Yl(t, n, e, r, o) {
	const s = t.length >> 1;
	let i = 0;
	for (let a = 0; a < s; a++) {
		const s = Math.hypot(t[2 * a] - e, t[2 * a + 1] - r) - o;
		i += wl(n, a) * s * s;
	}
	return i;
}
function _l(t) {
	t[2] = Math.max(Math.abs(t[2]), 1e-6);
}
function Vl(t, n) {
	const e = function(t, n) {
		const e = t.length >> 1;
		if (e < 3) return null;
		const r = bl(n, e), [o, s, i] = function(t, n) {
			let e = 0, r = 0, o = 0;
			for (let s = 0; s < n.length; s++) e += n[s], r += t[2 * s] * n[s], o += t[2 * s + 1] * n[s];
			return [
				r / e,
				o / e,
				e
			];
		}(t, r);
		let a = 0, l = 0, c = 0, h = 0, f = 0, u = 0;
		for (let P = 0; P < e; P++) {
			const n = t[2 * P] - o, e = t[2 * P + 1] - s, i = n * n + e * e;
			a += r[P] * n * n, l += r[P] * e * e, c += r[P] * n * e, h += r[P] * n * i, f += r[P] * e * i, u += r[P] * i * i;
		}
		a /= i, l /= i, c /= i, h /= i, f /= i, u /= i;
		const y = a + l, d = a * l - c * c, p = u - y * y, g = 4 * y, m = -3 * y * y - u, x = p * y + 4 * d * y - h * h - f * f, M = h * (h * l - f * c) + f * (f * a - h * c) - p * d, w = m + m, b = g + g + g;
		let A = 0, k = M;
		for (let P = 0; P < 40; P++) {
			const t = x + A * (w + A * b);
			if (Math.abs(t) < 1e-300) break;
			const n = A - k / t;
			if (n === A || !Number.isFinite(n)) break;
			const e = M + n * (x + n * (m + n * g));
			if (Math.abs(e) >= Math.abs(k)) break;
			A = n, k = e;
		}
		const v = Math.max(A, 0), F = v * v - v * y + d;
		if (Math.abs(F) < 1e-300) return null;
		const I = (h * (l - v) - f * c) / F / 2, N = (f * (a - v) - h * c) / F / 2, S = Math.sqrt(I * I + N * N + y);
		return Number.isFinite(S) && S > 0 ? {
			cx: I + o,
			cy: N + s,
			r: S,
			chi2: Yl(t, n, I + o, N + s, S)
		} : null;
	}(t, n);
	if (null === e) return null;
	const r = t.length >> 1, o = bl(n, r), s = Cl([
		e.cx,
		e.cy,
		e.r
	], 100, (n, e, s) => {
		e.fill(0), s.fill(0);
		let i = 0;
		for (let a = 0; a < r; a++) {
			const r = t[2 * a] - n[0], l = t[2 * a + 1] - n[1], c = Math.hypot(r, l);
			if (c < 1e-12) continue;
			const h = c - n[2], f = -r / c, u = -l / c, y = o[a];
			i += y * h * h, s[0] += y * f * h, s[1] += y * u * h, s[2] -= y * h, e[0] += y * f * f, e[1] += y * f * u, e[2] -= y * f, e[3] += y * u * f, e[4] += y * u * u, e[5] -= y * u, e[6] -= y * f, e[7] -= y * u, e[8] += y;
		}
		return i;
	}, _l);
	if (null === s) return null;
	const i = {
		cx: s.p[0],
		cy: s.p[1],
		r: s.p[2],
		chi2: s.chi2
	};
	return i.chi2 <= e.chi2 ? i : e;
}
function Jl(t, n, e, r) {
	const o = t.length >> 1;
	let s = 0, i = Math.atan2(t[1] - e, t[0] - n);
	const a = r ? o : o - 1;
	for (let l = 1; l <= a; l++) {
		const r = l % o, a = Math.atan2(t[2 * r + 1] - e, t[2 * r] - n);
		let c = a - i;
		c > Math.PI ? c -= Ql : c < -Math.PI && (c += Ql), s += c, i = a;
	}
	return s;
}
function tc(t, n, e, r, o, s, i) {
	const a = Math.ceil(Math.abs(o) / Zl - 1e-9), l = a >= 1 ? a : 1, c = o > 0, h = Math.abs(o) / l > Math.PI, f = [];
	for (let u = 1; u <= l; u++) {
		const a = r + o * u / l, y = u === l ? s : t + e * Math.cos(a), d = u === l ? i : n + e * Math.sin(a);
		f.push({
			type: "A",
			rx: e,
			ry: e,
			rotation: 0,
			largeArc: h,
			sweep: c,
			x: y,
			y: d
		});
	}
	return f;
}
function nc(t) {
	let n = 0;
	for (let e = 1; e < t.length >> 1; e++) n = Math.max(n, Math.hypot(t[2 * e] - t[0], t[2 * e + 1] - t[1]));
	return n;
}
function ec(t) {
	return {
		cx: t.cx,
		cy: t.cy,
		rx: t.rx,
		ry: t.ry,
		angle: t.rotation,
		chi2: 0
	};
}
function rc(t, n, e, r) {
	switch (t.kind) {
		case "circle": {
			const o = Math.atan2(e - t.cy, n - t.cx);
			return tc(t.cx, t.cy, t.r, o, r ? Ql : -Ql, n, e);
		}
		case "ellipse": return function(t, n, e, r) {
			const o = ec(t), s = /* @__PURE__ */ new Float64Array(4);
			Ll(o, n, e, s);
			const i = s[1], a = r ? Ql : -Ql, l = Math.ceil(Ql / Zl - 1e-9), c = 180 * t.rotation / Math.PI, h = [];
			for (let f = 1; f <= l; f++) {
				let u = n, y = e;
				f < l && (Ul(o, i + a * f / l, s), u = s[0], y = s[1]), h.push({
					type: "A",
					rx: t.rx,
					ry: t.ry,
					rotation: c,
					largeArc: !1,
					sweep: r,
					x: u,
					y
				});
			}
			return h;
		}(t, n, e, r);
		case "rect": return function(t, n, e, r) {
			const o = Dl(t), s = o.length;
			if (0 === s) return [];
			const [i, a] = Gl(o, n, e), l = /* @__PURE__ */ new Float64Array(2), c = [], h = r ? 1 : 0, f = r ? 0 : 1;
			Math.abs(a - h) > 1e-9 && (Hl(o[i], h, l), c.push(Wl(o[i], a, h, l[0], l[1])));
			for (let p = 1; p < s; p++) {
				const t = r ? (i + p) % s : (i + s - p) % s;
				Hl(o[t], r ? 1 : 0, l), c.push(Wl(o[t], r ? 0 : 1, r ? 1 : 0, l[0], l[1]));
			}
			var u, y, d;
			return c.push(Wl(o[i], f, a, n, e)), Math.abs(a - f) <= 1e-9 && c.length > 1 && (c.pop(), c[c.length - 1] = (y = n, d = e, "Z" === (u = c[c.length - 1]).type ? u : {
				...u,
				x: y,
				y: d
			})), c;
		}(t, n, e, r);
	}
}
function oc(t, n, e, r, o, s, i, a, l) {
	let c = Math.abs(e), h = Math.abs(r);
	const f = .5 * (t - a), u = .5 * (n - l);
	if (f * f + u * u <= 1e-24 || c <= 1e-12 || h <= 1e-12) return {
		cx: t - c,
		cy: n,
		rx: c,
		ry: h,
		phi: o,
		theta1: 0,
		delta: 0
	};
	const y = Math.sin(o), d = Math.cos(o), p = d * f + y * u, g = -y * f + d * u, m = p * p / (c * c) + g * g / (h * h);
	if (m > 1) {
		const t = Math.sqrt(m);
		c *= t, h *= t;
	}
	const x = Math.max(c * c * h * h - c * c * g * g - h * h * p * p, 0), M = c * c * g * g + h * h * p * p;
	let w = M > 0 ? Math.sqrt(x / M) : 0;
	s === i && (w = -w);
	const b = w * c * g / h, A = -w * h * p / c, k = d * b - y * A + .5 * (t + a), v = y * b + d * A + .5 * (n + l), F = Math.atan2((g - A) / h, (p - b) / c);
	let I = Math.atan2((-g - A) / h, (-p - b) / c) - F;
	return !i && I > 0 ? I -= Ql : i && I < 0 && (I += Ql), {
		cx: k,
		cy: v,
		rx: c,
		ry: h,
		phi: o,
		theta1: F,
		delta: I
	};
}
function sc(t, n, e) {
	const r = Math.ceil(t);
	return r >= n ? Math.min(r, e) : n;
}
function ic(t, n, e, r, o, s) {
	const i = o - e, a = s - r, l = i * i + a * a;
	if (l <= 1e-24) return Math.hypot(t - e, n - r);
	const c = Math.min(Math.max(((t - e) * i + (n - r) * a) / l, 0), 1);
	return Math.hypot(t - e - i * c, n - r - a * c);
}
function ac(t, n, e) {
	const r = n.length;
	if (r < 2) return 0;
	const o = new Float64Array(r + 1), s = new Float64Array(r + 1), i = new Float64Array(r + 1), a = new Float64Array(r + 1), l = new Float64Array(r + 1), c = new Float64Array(r + 1);
	for (let u = 0; u < r; u++) {
		const e = t[2 * u] - t[0], r = t[2 * u + 1] - t[1], h = n[u];
		o[u + 1] = o[u] + h, s[u + 1] = s[u] + e * h, i[u + 1] = i[u] + r * h, a[u + 1] = a[u] + e * e * h, l[u + 1] = l[u] + r * r * h, c[u + 1] = c[u] + e * r * h;
	}
	const h = (t, n) => {
		const e = n + 1, r = o[e] - o[t];
		if (!(r > 0)) return 0;
		const h = s[e] - s[t], f = i[e] - i[t], u = a[e] - a[t] - h * h / r, y = l[e] - l[t] - f * f / r, d = c[e] - c[t] - h * f / r, p = u - y, g = Math.sqrt(Math.max(p * p + 4 * d * d, 0));
		return Math.max(.5 * (u + y - g), 0);
	}, f = new Float64Array(r).fill(1 / 0);
	f[0] = 0;
	for (let u = 0; u < r - 1; u++) if (Number.isFinite(f[u])) for (let t = u + 1; t < r; t++) {
		const n = h(u, t), r = f[u] + .5 * n + 2 * e;
		if (r < f[t] && (f[t] = r), .5 * n > 4 * e * 2 * (t - u)) break;
	}
	return f[r - 1];
}
var lc = class {
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
function cc(t, n, e) {
	const r = Math.abs(Jl(t, n, e, !0));
	return r > 1.9 * Math.PI && r < 3 * Math.PI;
}
function hc(t, n, e, r, o) {
	const [s, i] = function(t, n, e) {
		switch (t.kind) {
			case "circle": {
				const r = Math.hypot(n - t.cx, e - t.cy);
				return r > 0 ? [t.cx + t.r * (n - t.cx) / r, t.cy + t.r * (e - t.cy) / r] : [t.cx + t.r, t.cy];
			}
			case "ellipse": {
				const r = ec(t), o = /* @__PURE__ */ new Float64Array(4);
				return Ll(r, n, e, o), Ul(r, o[1], o), [o[0], o[1]];
			}
			case "rect": return function(t, n, e) {
				const r = Dl(t);
				if (0 === r.length) return [t.cx, t.cy];
				const [o, s] = Gl(r, n, e), i = /* @__PURE__ */ new Float64Array(2);
				return Hl(r[o], s, i), [i[0], i[1]];
			}(t, n, e);
		}
	}(n, t.pts[0], t.pts[1]);
	return {
		x0: s,
		y0: i,
		segments: rc(n, s, i, o),
		closed: !0,
		params: r,
		chi2: e,
		primitive: n,
		cost: .5 * e + t.lambda * r
	};
}
function fc(t, n, e) {
	if (null === n) return;
	const { pts: r } = t, o = function(t, n, e) {
		const r = t.length >> 1;
		if (e.chi2 > 4 * r) return null;
		if (!(Number.isFinite(e.r) && e.r <= 1e3 * Math.max(nc(t), 1))) return null;
		const o = Jl(t, e.cx, e.cy, n);
		if (Math.abs(o) < .001) return null;
		const s = Math.atan2(t[1] - e.cy, t[0] - e.cx), i = n ? t[0] : t[2 * r - 2], a = n ? t[1] : t[2 * r - 1];
		return tc(e.cx, e.cy, e.r, s, o, i, a);
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
				for (let a = 0; a < e; a++) {
					const l = t[2 * a], c = t[2 * a + 1], h = e > 1 ? Math.floor(a * (r - 1) / (e - 1)) : 0, f = Math.max(h, Math.max(i - Math.floor(s / 2), 0)), u = Math.max(f - s, 0), y = Math.min(f + s, r - 1);
					let d = 1 / 0, p = i;
					for (let t = u; t <= y; t++) {
						const e = Math.hypot(l - n[2 * t], c - n[2 * t + 1]);
						e < d && (d = e, p = t);
					}
					i = p;
					let g = d;
					const m = n[2 * p], x = n[2 * p + 1];
					p > 0 && (g = Math.min(g, ic(l, c, n[2 * p - 2], n[2 * p - 1], m, x))), p + 1 < r && (g = Math.min(g, ic(l, c, m, x, n[2 * p + 2], n[2 * p + 3]))), o[a] = g;
				}
				return o;
			}(t, function(t, n, e, r) {
				const o = [t, n];
				let s = t, i = n;
				for (const a of e) {
					if ("L" === a.type) {
						const t = sc(Math.hypot(a.x - s, a.y - i) / r, 1, 4096);
						for (let n = 1; n <= t; n++) o.push(s + (a.x - s) * n / t, i + (a.y - i) * n / t);
					} else if ("C" === a.type || "Q" === a.type) {
						const t = "C" === a.type ? a.x1 : s + 2 / 3 * (a.x1 - s), n = "C" === a.type ? a.y1 : i + 2 / 3 * (a.y1 - i), e = "C" === a.type ? a.x2 : a.x + 2 / 3 * (a.x1 - a.x), l = "C" === a.type ? a.y2 : a.y + 2 / 3 * (a.y1 - a.y), c = sc((Math.hypot(t - s, n - i) + Math.hypot(e - t, l - n) + Math.hypot(a.x - e, a.y - l)) / r, 4, 4096);
						for (let r = 1; r <= c; r++) {
							const h = r / c, f = 1 - h, u = f * f * f, y = 3 * f * f * h, d = 3 * f * h * h, p = h * h * h;
							o.push(u * s + y * t + d * e + p * a.x, u * i + y * n + d * l + p * a.y);
						}
					} else {
						if ("A" !== a.type) continue;
						{
							const t = oc(s, i, a.rx, a.ry, a.rotation * Math.PI / 180, a.largeArc, a.sweep, a.x, a.y), n = sc(Math.abs(Math.max(t.rx, t.ry) * t.delta) / r, 2, 4096), e = Math.sin(t.phi), l = Math.cos(t.phi);
							for (let r = 1; r < n; r++) {
								const s = t.theta1 + t.delta * r / n, i = t.rx * Math.cos(s), a = t.ry * Math.sin(s);
								o.push(t.cx + l * i - e * a, t.cy + e * i + l * a);
							}
							o.push(a.x, a.y);
						}
					}
					s = a.x, i = a.y;
				}
				return o;
			}(e, r, o, .25));
			let i = 0;
			for (let a = 0; a < s.length; a++) i += s[a] * s[a] * wl(n, a);
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
	if (n.chi2 > t.gate || !cc(r, n.cx, n.cy)) return;
	const s = Jl(r, n.cx, n.cy, !0), i = {
		kind: "circle",
		cx: n.cx,
		cy: n.cy,
		r: n.r
	};
	e.consider(hc(t, i, n.chi2, 3, s > 0));
}
function uc(t, n, e, r) {
	const o = t.length >> 1;
	if (o < 4 || n.length < o) return null;
	const s = {
		pts: t.length === 2 * o ? t : t.subarray(0, 2 * o),
		sigma: n.length === o ? n : n.subarray(0, o),
		closed: e,
		lambda: r.lambda,
		gate: r.tau * r.tau * o
	}, i = Vl(s.pts, s.sigma), a = new lc(s.pts);
	if (fc(s, i, a), e) {
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
			const { pts: o } = t, s = Math.max(nc(o), 1), i = function(t, n, e, r) {
				if (t.length >> 1 < 6) return null;
				const o = Rl(t, n);
				return null === o ? jl(t, n, e) : .25 * o.residual > r ? null : El(t, n, o.fit) ?? jl(t, n, e);
			}(o, t.sigma, n, t.gate);
			if (null === i) return;
			if (!(Number.isFinite(i.rx) && Number.isFinite(i.ry) && Number.isFinite(i.cx) && Number.isFinite(i.cy) && Math.max(i.rx, i.ry) <= 1e3 * s && i.chi2 <= t.gate && cc(o, i.cx, i.cy))) return;
			const a = {
				kind: "ellipse",
				cx: i.cx,
				cy: i.cy,
				rx: i.rx,
				ry: i.ry,
				rotation: i.angle
			};
			r.consider(hc(t, a, i.chi2, 5, e));
		})(s, i, t, a), function(t, n, e) {
			const { pts: r, sigma: o } = t, s = [[Kl(r, o, null), 6], [Kl(r, o, 0), 4]], i = function(t) {
				const n = function(t) {
					const n = t.length >> 1, e = Array.from({ length: n }, (t, n) => n);
					e.sort((n, e) => t[2 * n] - t[2 * e] || t[2 * n + 1] - t[2 * e + 1]);
					const r = new Int32Array(2 * n + 1);
					let o = 0;
					const s = (n, e, r) => (t[2 * e] - t[2 * n]) * (t[2 * r + 1] - t[2 * n + 1]) - (t[2 * e + 1] - t[2 * n + 1]) * (t[2 * r] - t[2 * n]);
					for (let c = 0; c < n; c++) {
						for (; o >= 2 && s(r[o - 2], r[o - 1], e[c]) <= 0;) o--;
						r[o++] = e[c];
					}
					const i = o + 1;
					for (let c = n - 2; c >= 0; c--) {
						for (; o >= i && s(r[o - 2], r[o - 1], e[c]) <= 0;) o--;
						r[o++] = e[c];
					}
					const a = Math.max(o - 1, 0), l = new Float64Array(2 * a);
					for (let c = 0; c < a; c++) l[2 * c] = t[2 * r[c]], l[2 * c + 1] = t[2 * r[c] + 1];
					return l;
				}(t), e = n.length >> 1;
				if (e < 3) return 0;
				const r = (t, r, o) => n[t % e * 2] * r + n[t % e * 2 + 1] * o;
				let o = 0, s = 0, i = 0, a = 1 / 0, l = 0;
				for (let c = 0; c < e; c++) {
					const t = n[(c + 1) % e * 2] - n[2 * c], h = n[(c + 1) % e * 2 + 1] - n[2 * c + 1], f = Math.hypot(t, h), u = t / f, y = h / f;
					if (0 === c) for (let n = 1; n < e; n++) r(n, u, y) > r(o, u, y) && (o = n), r(n, u, y) < r(s, u, y) && (s = n), r(n, -y, u) > r(i, -y, u) && (i = n);
					else {
						for (let t = 0; t < e && r(o + 1, u, y) > r(o, u, y); t++) o++;
						for (let t = 0; t < e && r(s + 1, u, y) < r(s, u, y); t++) s++;
						for (let t = 0; t < e && r(i + 1, -y, u) > r(i, -y, u); t++) i++;
					}
					const d = (r(o, u, y) - r(s, u, y)) * (r(i, -y, u) - r(c, -y, u));
					d < a && (a = d, l = Math.atan2(h, t));
				}
				for (; l > Math.PI / 4;) l -= Math.PI / 2;
				for (; l <= -Math.PI / 4;) l += Math.PI / 2;
				return l;
			}(r);
			0 !== i && s.push([Kl(r, o, null, i, !0), 6], [Kl(r, o, 0, i, !0), 4]);
			for (const [a, l] of s) {
				if (!(null !== a && a.chi2 <= t.gate && a.hw > 0 && a.hh > 0)) continue;
				const r = {
					kind: "rect",
					cx: a.cx,
					cy: a.cy,
					w: 2 * a.hw,
					h: 2 * a.hh,
					r: a.r,
					rotation: a.rotation
				}, o = l + (0 === a.rotation ? 0 : 1);
				e.consider(hc(t, r, a.chi2, o, n));
			}
		}(s, t, a);
	}
	if (null === a.best) return null;
	const l = function(t, n, e, r) {
		const o = t.length >> 1;
		if (!e || o < 2) return ac(t, bl(n, o), r);
		let s = 0, i = 0;
		for (let f = 0; f < o; f++) s += t[2 * f], i += t[2 * f + 1];
		s /= o, i /= o;
		let a = 0, l = -1 / 0;
		for (let f = 0; f < o; f++) {
			const n = Math.hypot(t[2 * f] - s, t[2 * f + 1] - i);
			n >= l && (l = n, a = f);
		}
		const c = new Float64Array(2 * (o + 1)), h = new Float64Array(o + 1);
		for (let f = 0; f <= o; f++) {
			const e = (a + f) % o;
			c[2 * f] = t[2 * e], c[2 * f + 1] = t[2 * e + 1], h[f] = wl(n, e);
		}
		return ac(c, h, r);
	}(s.pts, s.sigma, e, r.lambda);
	return a.best.cost < l ? a.best : null;
}
const yc = .5;
function dc(t) {
	return t.alphamax <= .6666666676666666;
}
function pc(t, n) {
	return dc(n) ? t : t.map((t) => t < .2 ? .2 : t);
}
function gc(t) {
	return t > 0 ? Math.max(1, Math.log(t / .1)) : 8.5;
}
function mc(t, n, e, r, o, s) {
	const i = n.length >> 1, a = new Uint8Array(i);
	if (e && r) for (let h = 0; h + 1 < r.length; h++) {
		const n = r[h], e = r[h + 1];
		if (t[2 * n] === t[2 * e] || t[2 * n + 1] === t[2 * e + 1]) for (let t = n; t <= e && t < i; t++) a[t] = 1;
	}
	const l = new Array(i), c = i > 2 && n[0] === n[2 * (i - 1)] && n[1] === n[2 * (i - 1) + 1] ? i - 1 : i;
	for (let h = 0; h < i; h++) {
		const r = e && (n[2 * h] !== t[2 * h] || n[2 * h + 1] !== t[2 * h + 1]);
		let i = s ? s[h] : NaN;
		if (r && s && Number.isNaN(i)) {
			const t = s[(h - 1 + c) % c], n = s[(h + 1) % c];
			i = Math.max(t >= 0 ? t : 0, n >= 0 ? n : 0);
		}
		l[h] = r ? i > .1 ? i : .1 : i >= 0 ? i > yc ? i : yc : a[h] ? .06 : yc, o && 0 !== o[h % o.length] && (l[h] = yc);
	}
	return l;
}
function xc(t) {
	return t ? 32 : 4;
}
function Mc(t) {
	const n = t.extent ?? 0;
	if (n <= 700) return t;
	const e = 700 / n, r = Math.round(t.reach * e * e), o = r < 6 ? 6 : r > t.reach ? t.reach : r;
	return o === t.reach ? t : {
		...t,
		reach: o
	};
}
function wc(t) {
	return t ? 8 : 3;
}
function bc(t) {
	return Math.max(0, t);
}
function Ac(t, n, e, r, o) {
	let s = -1;
	for (const { prim: i } of sh(n, e, r, o)) {
		const e = [];
		if (kc(e, i, n), e.push({ type: "Z" }), !r.coverage) return e;
		if (s < 0 && (s = va(t, r.coverage)), va(e, r.coverage) <= s) return e;
	}
	return t;
}
function kc(t, n, e) {
	if ("ellipse" === n.kind) return void function(t, n, e) {
		const r = (e.length >> 1) - 1, o = Math.cos(n.angle), s = Math.sin(n.angle), i = ((t) => {
			const r = e[2 * t] - n.cx, i = e[2 * t + 1] - n.cy;
			return Math.atan2((-r * s + i * o) / n.ry, (r * o + i * s) / n.rx);
		})(0), a = (ah(n, e, r) >= 0 ? 1 : -1) * Math.PI / 2, l = 4 / 3 * Math.tan(a / 4), [c, h] = lh(n, i);
		t.push({
			type: "M",
			x: c,
			y: h
		});
		for (let f = 0; f < 4; f++) {
			const [e, r, o, s] = lh(n, i + f * a), [u, y, d, p] = lh(n, i + (f + 1) * a), g = 3 === f;
			t.push({
				type: "C",
				x1: e + l * o,
				y1: r + l * s,
				x2: u - l * d,
				y2: y - l * p,
				x: g ? c : u,
				y: g ? h : y
			});
		}
	}(t, n.ellipse, e);
	const [r, o] = fh(n.circle, e[0], e[1]);
	t.push({
		type: "M",
		x: r,
		y: o
	}), function(t, n, e, r, o) {
		const s = Math.atan2(e - r.cy, n - r.cx), i = o.length >> 1 >> 2;
		let a = Math.atan2(o[2 * i + 1] - r.cy, o[2 * i] - r.cx) - s;
		for (; a <= -Math.PI;) a += 2 * Math.PI;
		for (; a > Math.PI;) a -= 2 * Math.PI;
		_c(t, r, s, a >= 0 ? 2 * Math.PI : -2 * Math.PI, n, e, n, e);
	}(t, r, o, n.circle, e);
}
const vc = 45;
function Fc(t, n, e, r, o, s, i) {
	const a = (o - r + e) % e + 1;
	if (a < 4) return null;
	const l = new Float64Array(2 * a), c = new Float64Array(a);
	for (let p = 0; p < a; p++) {
		const o = (r + p) % e;
		l[2 * p] = t[2 * o], l[2 * p + 1] = t[2 * o + 1], c[p] = n[o];
	}
	const h = Vl(l, c);
	if (null === h || h.chi2 > i * i * (a - 3)) return null;
	let f = h.cy - t[2 * s + 1], u = t[2 * s] - h.cx;
	const y = Math.hypot(f, u);
	if (y < 1e-12) return null;
	const d = f * (l[2 * a - 2] - l[0]) + u * (l[2 * a - 1] - l[1]) < 0 ? -1 : 1;
	return f *= d / y, u *= d / y, {
		x: f,
		y: u
	};
}
function Ic(t, n, e, r, o, s) {
	const i = e - t, a = r - n, l = o - e, c = s - r;
	return 180 * Math.atan2(Math.abs(i * c - a * l), i * l + a * c) / Math.PI;
}
const Nc = 1, Sc = Math.PI / 6;
function Pc(t, n, e, r, o) {
	const s = t[2 * e], i = t[2 * e + 1], a = t[2 * r], l = t[2 * r + 1], c = (r - e + o) % o, h = (n) => {
		const r = [];
		for (let h = 0; h <= c; h++) {
			const c = (e + h) % o, f = t[2 * c], u = t[2 * c + 1];
			n && (Math.hypot(f - s, u - i) <= Nc || Math.hypot(f - a, u - l) <= Nc) || r.push(c);
		}
		return r;
	};
	let f = h(!0);
	if (f.length < 3 && (f = h(!1)), f.length < 2) return null;
	let u = 0, y = 0, d = 0;
	for (const b of f) {
		const e = 1 / (n[b] * n[b]);
		u += e, y += e * t[2 * b], d += e * t[2 * b + 1];
	}
	y /= u, d /= u;
	let p = 0, g = 0, m = 0;
	for (const b of f) {
		const e = 1 / (n[b] * n[b]), r = t[2 * b] - y, o = t[2 * b + 1] - d;
		p += e * r * r, g += e * r * o, m += e * o * o;
	}
	const x = .5 * Math.atan2(2 * g, p - m);
	let M = Math.cos(x), w = Math.sin(x);
	return M * (a - s) + w * (l - i) < 0 && (M = -M, w = -w), {
		cx: y,
		cy: d,
		dx: M,
		dy: w
	};
}
function Cc(t, n, e, r, o, s, i) {
	const a = s[i], l = s[(i + 1) % s.length];
	if (l !== (a + 1) % o) return null;
	const c = e[a], h = e[l], f = t[2 * c], u = t[2 * c + 1], y = t[2 * h], d = t[2 * h + 1];
	if (Math.hypot(y - f, d - u) > Fh) return null;
	const p = Pc(t, n, e[(a - 1 + o) % o], c, r), g = Pc(t, n, h, e[(l + 1) % o], r);
	if (!p || !g) return null;
	const m = y - f, x = d - u;
	if ((p.dx * x - p.dy * m) * (m * g.dy - x * g.dx) <= 0) return null;
	const M = p.dx * g.dy - p.dy * g.dx;
	if (Math.abs(M) < 1e-6) return null;
	const w = ((g.cx - p.cx) * g.dy - (g.cy - p.cy) * g.dx) / M, b = p.cx + p.dx * w, A = p.cy + p.dy * w, k = Math.atan2(Math.abs(M), p.dx * g.dx + p.dy * g.dy), v = .5 + Math.min(3, Nc / Math.max(.2, Math.sin(.5 * (Math.PI - k)))), F = (f + y) / 2, I = (u + d) / 2;
	return Math.hypot(b - F, A - I) <= v ? [b, A] : null;
}
function Uc(t, n, e, r, o, s, i) {
	const a = e[s], l = e[(s - 1 + o) % o], c = e[(s + 1) % o], h = Pc(t, n, l, a, r), f = Pc(t, n, a, c, r);
	if (!h || !f) return i;
	const u = h.dx * f.dy - h.dy * f.dx;
	if (Math.abs(u) < 1e-6) return i;
	const y = ((f.cx - h.cx) * f.dy - (f.cy - h.cy) * f.dx) / u, d = h.cx + h.dx * y, p = h.cy + h.dy * y, g = Math.atan2(Math.abs(u), h.dx * f.dx + h.dy * f.dy), m = g >= Sc ? .5 + Math.min(3, Nc / Math.max(.2, Math.sin(.5 * (Math.PI - g)))) : .5;
	return Math.hypot(d - t[2 * a], p - t[2 * a + 1]) <= m ? [d, p] : i;
}
function Lc(t, n, e, r, o, s, i) {
	const { pts: a, sig: l } = Uh(t, n, e[s], e[i], r), c = [];
	for (let h = (s + 1) % o; h !== i; h = (h + 1) % o) c.push((e[h] - e[s] + r) % r);
	return {
		pts: a,
		sig: l,
		splits: c
	};
}
function $c(t, n, e, r, o, s, i, a) {
	const l = (n.length >> 1) - 1;
	if (l <= 0) return;
	if (1 === l) return t.push({
		type: "L",
		x: n[2],
		y: n[3]
	}), void (a && (a[0] += 2 * i.lambda));
	const c = [0];
	for (const h of qc(n, e, r, o, s, i, c)) Dc(t, n, h);
	a && (a[0] += c[0]);
}
function qc(t, n, e, r, o, s, i, a = !1) {
	const l = (t.length >> 1) - 1;
	if (l <= 1) return 1 === l ? [{
		a: 0,
		b: 1,
		kind: "line"
	}] : [];
	const c = function(t, n, e, r) {
		const o = new Uint8Array(e + 1);
		o[0] = 1, o[e] = 1;
		for (const l of n) l > 0 && l < e && (o[l] = 1);
		const s = [];
		for (let l = 0; l <= e; l++) o[l] && s.push(l);
		const i = function(t, n) {
			const e = [];
			if (n < 3) return e;
			let r = 0;
			for (let o = 1; o < n; o++) {
				const n = t[2 * o] - t[2 * (o - 1)], s = t[2 * o + 1] - t[2 * (o - 1) + 1], i = t[2 * (o + 1)] - t[2 * o], a = n * (t[2 * (o + 1) + 1] - t[2 * o + 1]) - s * i, l = a > 1e-9 ? 1 : a < -1e-9 ? -1 : 0;
				0 !== l && 0 !== r && l !== r && e.push(o), 0 !== l && (r = l);
			}
			return e;
		}(t, e);
		for (let l = 0; l + 1 < s.length; l++) {
			const t = s[l], n = s[l + 1];
			if (!(n - t < r)) {
				for (const e of i) e > t && e < n && (o[e] = 1);
				for (let e = t + r; e < n; e += r) o[e] = 1;
			}
		}
		let a = [];
		for (let l = 0; l <= e; l++) o[l] && a.push(l);
		if (a.length > 256) {
			const t = Math.max(2, 256), n = (a.length - 1) / 255, r = [];
			for (let e = 0; e < t; e++) r.push(a[Math.round(e * n)]);
			r[0] = 0, r[r.length - 1] = e, a = function(t) {
				t.sort((t, n) => t - n);
				const n = [];
				for (const e of t) 0 !== n.length && n[n.length - 1] === e || n.push(e);
				return n;
			}(r);
		}
		return a;
	}(t, e, l, s.stride), h = c.length - 1, f = new Array(h + 1);
	f[0] = r, f[h] = o;
	for (let g = 1; g < h; g++) f[g] = Nh(t, c[g]);
	const u = new Float64Array(h + 1).fill(1 / 0);
	u[0] = 0;
	const y = new Int32Array(h + 1).fill(-1), d = new Array(h + 1).fill(null);
	for (let g = 0; g < h; g++) {
		if (u[g] === 1 / 0) continue;
		const e = f[g];
		let r = 0;
		const o = Math.min(h, g + s.reach);
		for (let i = g + 1; i <= o; i++) {
			const o = Bc(t, n, c[g], c[i], e, f[i], s, i === g + 1);
			if (o < zc) {
				const t = u[g] + o;
				t < u[i] && (u[i] = t, y[i] = g, d[i] = "arc" === jc ? {
					a: c[g],
					b: c[i],
					kind: "arc",
					circle: Tc
				} : "cubic" === jc ? {
					a: c[g],
					b: c[i],
					kind: "cubic",
					cubic: Ec
				} : {
					a: c[g],
					b: c[i],
					kind: "line"
				}), r = 0;
			} else if (++r >= Rc) break;
		}
	}
	const p = [];
	for (let g = h; g > 0; g = y[g]) {
		const t = d[g];
		if (null === t || y[g] < 0) break;
		p.push(t);
	}
	if (p.reverse(), i && (i[0] = u[h]), function(t, n, e, r) {
		for (let o = 0; o < Oc; o++) {
			let o = !1, s = 0;
			for (; s < e.length - 1;) {
				const i = e[s], a = e[s + 1];
				if ("line" !== i.kind && "line" !== a.kind) {
					const l = Sh(t, i.a), c = Ph(t, a.b), h = Zc(t, i.a, a.b, l, c), f = Gc(t, n, i.a, a.b, h, r), u = (i.kind, 6 + (a.kind, 6)), y = Kc(t, n, i, r) + Kc(t, n, a, r), d = .5 * f.chi2 + 6 * r.lambda, p = .5 * y + r.lambda * u;
					if (f.worst <= 1 && d < p) {
						e.splice(s, 2, {
							a: i.a,
							b: a.b,
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
	}(t, n, p, s), !dc(s) && p.length > 1) {
		const e = function(t, n, e, r) {
			const o = n.map((t) => t >= yc ? 1 / 0 : t);
			let s = 0, i = 0;
			for (const a of e) {
				s += Kc(t, o, a, r);
				for (let t = a.a + 1; t < a.b; t++) n[t] < yc && i++;
			}
			return i < Bh ? r.tau : r.tau * Math.max(jh, Math.min(1, Eh * Math.sqrt(s / i)));
		}(t, n, p, s), r = function(t, n, e, r, o) {
			const s = e.length;
			if (s < 2) return null;
			const i = o.lambda, a = function(t) {
				const n = t.length >> 1, e = new Float64Array(n);
				for (let r = 1; r < n; r++) {
					const n = t[2 * r] - t[2 * (r - 1)], o = t[2 * r + 1] - t[2 * (r - 1) + 1];
					e[r] = e[r - 1] + Math.sqrt(n * n + o * o);
				}
				return e;
			}(t), l = [e[0].a];
			for (const O of e) l.push(O.b);
			const c = l.slice(), h = [], f = [];
			for (let O = 0; O <= s; O++) {
				const n = O > 0 ? Jh(t, e[O - 1]) : r ? Jh(t, e[s - 1]) : null, o = (O < s ? Vh(t, e[O]) : r ? Vh(t, e[0]) : null) ?? n, i = n ?? o, a = r || O > 0 && O < s, l = _h(o[0] + i[0], o[1] + i[1]) ?? o;
				h.push(a ? l : i), f.push(a ? l : o);
			}
			const u = new Array(l.length).fill(0);
			r || (u[0] = 1, u[s] = 1);
			const y = (t) => {
				u[t] = 1, !r || 0 !== t && t !== l.length - 1 || (u[0] = 1, u[l.length - 1] = 1);
			}, d = (n, e) => {
				const r = Math.hypot(t[2 * e] - t[2 * n], t[2 * e + 1] - t[2 * n + 1]);
				return {
					kind: "cubic",
					cubic: ef(t, n, e),
					u: of(a, n, e),
					armS: r / 3,
					armE: r / 3,
					chi2: 1 / 0,
					worst: 1 / 0,
					touched: !0
				};
			};
			let p = [];
			for (let O = 0; O < s; O++) p.push(d(l[O], l[O + 1]));
			const g = (n) => _h(t[2 * n.b] - t[2 * n.a], t[2 * n.b + 1] - t[2 * n.a + 1]), m = Math.cos(Dh * Math.PI / 180), x = (e, r) => {
				if (!e) return !1;
				if ("arc" === e.kind && e.circle) return Wc(t, n, r.a, r.b, e.circle, o).worst <= 1;
				if ("line" !== e.kind || 3 * (e.b - e.a) < r.b - r.a) return !1;
				const s = g(e), i = g(r);
				return !s || !i || s[0] * i[0] + s[1] * i[1] < m;
			};
			for (let O = 0; O < s; O++) {
				const i = e[O];
				if ("arc" === i.kind && i.circle) {
					if (Wc(t, n, i.a, i.b, i.circle, o).worst > 1) continue;
					p[O].kind = "arc", p[O].seg = i;
					continue;
				}
				if ("line" !== i.kind || i.b - i.a < 2) continue;
				if (Xc(t, n, i.a, i.b, o).worst > 1) continue;
				const a = O > 0 ? e[O - 1] : r ? e[s - 1] : void 0, l = O + 1 < s ? e[O + 1] : r ? e[0] : void 0;
				if (x(a, i) || x(l, i)) continue;
				const c = Qc(t, i.a, i.b), h = Xc(t, n, i.a, i.b, o).chi2;
				c && h > i.b - i.a - 1 && 4 * Wc(t, n, i.a, i.b, c, o).chi2 < h || (p[O].kind = "line");
			}
			const M = (n) => "line" === p[n].kind ? g(e[n]) : Vh(t, e[n]), w = (n) => "line" === p[n].kind ? g(e[n]) : Jh(t, e[n]), b = (t, n) => !t || !n || t[0] * n[0] + t[1] * n[1] < m;
			for (let O = 0; O < s; O++) {
				if ("arc" !== p[O].kind) continue;
				const n = O > 0 ? O - 1 : r ? s - 1 : -1, o = O + 1 < s ? O + 1 : r ? 0 : -1, i = n >= 0 && n !== O && "cubic" !== p[n].kind && b(w(n), Vh(t, e[O])), a = o >= 0 && o !== O && "cubic" !== p[o].kind && b(Jh(t, e[O]), M(o));
				(i || a) && (p[O].kind = "cubic", p[O].seg = void 0);
			}
			const A = [];
			for (let O = 0; O < s; O++) "arc" === e[O].kind && e[O].circle && "cubic" === p[O].kind && A.push(O);
			for (let O = A.length - 1; O >= 0; O--) {
				const n = A[O], r = e[n].circle;
				if (!r) continue;
				const o = l[n], s = l[n + 1], i = [];
				let a = 0, c = Math.atan2(t[2 * o + 1] - r.cy, t[2 * o] - r.cx);
				for (let e = o; e <= s; e++) {
					const n = Math.atan2(t[2 * e + 1] - r.cy, t[2 * e] - r.cx);
					let s = n - c;
					s > Math.PI && (s -= 2 * Math.PI), s < -Math.PI && (s += 2 * Math.PI), a += e > o ? s : 0, i.push(a), c = n;
				}
				const y = Math.ceil(Math.abs(a) / Gh - 1e-9);
				let g = n;
				for (let e = 1; e < y; e++) {
					const n = a * e / y;
					let c = o + 1;
					for (; c < s - 1 && Math.abs(i[c - o]) < Math.abs(n);) c++;
					if (c <= l[g] || c >= s) continue;
					const m = _h(-(t[2 * c + 1] - r.cy), t[2 * c] - r.cx) ?? Nh(t, c), x = Nh(t, c), M = m[0] * x[0] + m[1] * x[1] < 0 ? [-m[0], -m[1]] : m;
					l.splice(g + 1, 0, c), u.splice(g + 1, 0, 0), h.splice(g + 1, 0, M), f.splice(g + 1, 0, M), p.splice(g, 1, d(l[g], c), d(c, l[g + 2])), g++;
				}
			}
			const k = () => {
				const t = p.length;
				for (let n = 1; n < t; n++) "cubic" !== p[n - 1].kind && "cubic" !== p[n].kind && y(n);
				r && t > 1 && "cubic" !== p[0].kind && "cubic" !== p[t - 1].kind && y(0);
			};
			k();
			const v = (e) => {
				const r = p[e];
				if ("cubic" !== r.kind) return;
				const o = f[e], s = h[e + 1], i = rf(t, n, l[e], l[e + 1], r.u, o, s);
				r.cubic = i, r.armS = Math.hypot(i.c1x - i.p0x, i.c1y - i.p0y), r.armE = Math.hypot(i.c2x - i.p3x, i.c2y - i.p3y);
			}, F = (n) => {
				const e = p[n];
				if ("cubic" !== e.kind || e.u.length <= 2) return;
				const r = sf(t, l[n], e.cubic, e.u);
				r && (e.u = r);
			}, I = (e) => {
				const r = p[e], s = l[e], i = l[e + 1];
				if ("fixed" === r.kind) return r.chi2 = r.seg ? Kc(t, n, r.seg, o) : 0, void (r.worst = 0);
				const a = "line" === r.kind ? Xc(t, n, s, i, o) : "arc" === r.kind && r.seg?.circle ? Wc(t, n, s, i, r.seg.circle, o) : Gc(t, n, s, i, r.cubic, o);
				r.chi2 = a.chi2, r.worst = a.worst, "cubic" !== r.kind || lf(t, n, s, i, r.cubic, r.u, o) || (r.worst = 1 / 0);
			}, N = (e, o) => {
				const s = p.length, i = new Int32Array(s), a = new Int32Array(s);
				let c = 0;
				for (let t = e; t <= o; t++) t > e && u[t] && c++, i[t] = c, c++, a[t] = c;
				let y = c + 1;
				const d = 0 === e && o === s - 1;
				let g = !1;
				if (d && r && !u[0] && (a[s - 1] = 0, y = c, g = !0), g && y < 2) return;
				const m = new Float64Array(y), x = new Float64Array(y);
				for (let t = e; t <= o; t++) m[i[t]] = f[t][0], x[i[t]] = f[t][1], m[a[t]] = h[t + 1][0], x[a[t]] = h[t + 1][1];
				const M = new Float64Array(y), w = new Float64Array(y), b = new Float64Array(y), A = new Float64Array(y), k = new Float64Array(y), v = new Float64Array(y), F = new Float64Array(y);
				let I, N = 0;
				if (!d) {
					const t = (t) => !u[t] && (r || t > 0 && t < s);
					t(e) && (k[i[e]] += 1, v[i[e]] += f[e][0], F[i[e]] += f[e][1]), t(o + 1) && (k[a[o]] += 1, v[a[o]] += h[o + 1][0], F[a[o]] += h[o + 1][1]);
				}
				for (let r = e; r <= o; r++) {
					const e = p[r], o = l[r], s = l[r + 1], c = i[r], u = a[r];
					if ("cubic" !== e.kind) {
						const n = "line" === e.kind ? _h(t[2 * s] - t[2 * o], t[2 * s + 1] - t[2 * o + 1]) : "arc" === e.kind && e.seg ? Vh(t, e.seg) : f[r], i = "line" === e.kind ? n : "arc" === e.kind && e.seg ? Jh(t, e.seg) : h[r + 1];
						n && i && (k[c] += 1, v[c] += n[0], F[c] += n[1], k[u] += 1, v[u] += i[0], F[u] += i[1]);
						continue;
					}
					const y = t[2 * o], d = t[2 * o + 1], g = t[2 * s], m = t[2 * s + 1];
					let x = 0, I = 0, S = 0, P = 0, C = 0, U = 0, L = 0;
					for (let r = o + 1; r < s; r++) {
						const s = e.u[r - o], i = 1 - s, a = i * i * i, l = 3 * i * i * s, c = 3 * i * s * s, h = s * s * s, f = 1 / (n[r] * n[r]), u = t[2 * r] - (a + l) * y - (c + h) * g, p = t[2 * r + 1] - (a + l) * d - (c + h) * m, M = l * e.armS, w = -c * e.armE;
						x += f * M * M, I += f * w * w, S += f * M * w, P += f * M * u, C += f * M * p, U += f * w * u, L += f * w * p;
					}
					M[c] += x, M[u] += I, b[c] += P, A[c] += C, b[u] += U, A[u] += L, u === c + 1 ? w[c] += S : N += S;
				}
				for (let t = 0; t < y; t++) if (k[t] > 0) {
					const n = Kh * (M[t] + 1);
					m[t] = v[t] / k[t], x[t] = F[t] / k[t], M[t] += n, b[t] += n * m[t], A[t] += n * x[t];
				} else {
					const n = Oh * M[t] + 1e-9;
					M[t] += n, b[t] += n * m[t], A[t] += n * x[t];
				}
				if (g) if (2 === y) {
					const t = w[0] + N, n = M[0] * M[1] - t * t;
					I = Math.abs(n) > 1e-300 ? [Float64Array.of((b[0] * M[1] - t * b[1]) / n, (M[0] * b[1] - t * b[0]) / n), Float64Array.of((A[0] * M[1] - t * A[1]) / n, (M[0] * A[1] - t * A[0]) / n)] : null;
				} else I = function(t, n, e, r, o) {
					const s = t.length, i = -t[0], a = Float64Array.from(t);
					a[0] = t[0] - i, a[s - 1] = t[s - 1] - e * e / i;
					const l = af(a, n, r, o), c = new Float64Array(s);
					c[0] = i, c[s - 1] = e;
					const h = af(a, n, c, c);
					if (!l || !h) return null;
					const f = h[0], u = 1 + f[0] + e * f[s - 1] / i;
					if (!(Math.abs(u) > 1e-300)) return null;
					const y = (l[0][0] + e * l[0][s - 1] / i) / u, d = (l[1][0] + e * l[1][s - 1] / i) / u;
					for (let p = 0; p < s; p++) l[0][p] -= y * f[p], l[1][p] -= d * f[p];
					return l;
				}(M, w, N, b, A);
				else I = af(M, w, b, A);
				if (!I) return;
				const S = new Array(y), P = new Float64Array(y);
				for (let t = 0; t < y; t++) {
					const n = I[0][t], e = I[1][t], r = Math.hypot(n, e);
					r > 1e-9 && Number.isFinite(r) && n * m[t] + e * x[t] > 0 ? (S[t] = [n / r, e / r], P[t] = k[t] > 0 ? 1 : r) : (S[t] = _h(m[t], x[t]) ?? [1, 0], P[t] = 1);
				}
				for (let t = e; t <= o; t++) f[t] = S[i[t]], h[t + 1] = S[a[t]], p[t].armS *= P[i[t]], p[t].armE *= P[a[t]];
				g && (h[0] = f[0], f[s] = h[s]);
			}, S = (t, n) => {
				for (let e = 0; e < Lh; e++) {
					N(t, n);
					for (let e = t; e <= n; e++) v(e);
					for (let e = t; e <= n; e++) F(e);
					for (let e = t; e <= n; e++) v(e);
				}
				for (let e = t; e <= n; e++) I(e), p[e].touched = !1;
			}, P = () => S(0, p.length - 1), C = () => {
				const t = p.length;
				let n = 0;
				for (; n < t;) {
					if (!p[n].touched) {
						n++;
						continue;
					}
					const e = Math.max(0, n - $h);
					let r = Math.min(t - 1, n + $h);
					for (let o = n + 1; o < t && o <= r + $h; o++) p[o].touched && (r = Math.min(t - 1, o + $h));
					S(e, r), n = r + 1;
				}
			}, U = () => p.some((t) => t.worst > 1), L = (e, r = 2) => {
				const s = p[e], i = l[e], a = l[e + 1];
				let c = -1, h = -1;
				for (let l = i + r; l <= a - r; l++) {
					const [e, r] = nf(s.cubic, s.u[l - i]), a = Math.hypot(e - t[2 * l], r - t[2 * l + 1]) / Hc(n, l, o);
					a > h && (h = a, c = l);
				}
				return c;
			}, $ = (n, e) => {
				const r = p[n], o = tf(r.cubic, r.u[e - l[n]]) ?? Nh(t, e);
				l.splice(n + 1, 0, e), u.splice(n + 1, 0, 0), h.splice(n + 1, 0, o), f.splice(n + 1, 0, o), p.splice(n, 1, d(l[n], e), d(e, l[n + 2]));
			}, q = (e, r, s) => {
				const i = s.map((e) => ({
					...d(e.a, e.b),
					kind: "fixed",
					seg: e,
					chi2: Kc(t, n, e, o),
					worst: 0
				})), a = s.slice(0, -1).map((t) => t.b);
				l.splice(e + 1, r - e - 1, ...a), u.splice(e + 1, r - e - 1, ...a.map(() => 1)), h.splice(e + 1, r - e - 1, ...s.slice(0, -1).map((n) => Jh(t, n))), f.splice(e + 1, r - e - 1, ...s.slice(1).map((n) => Vh(t, n))), p.splice(e, r - e, ...i), y(e), y(e + s.length), f[e] = Vh(t, s[0]), h[e + s.length] = Jh(t, s[s.length - 1]);
			}, R = (t) => {
				const n = l[t], r = l[t + 1];
				let o = n, s = r;
				for (const e of c) if (e <= n && (o = e), e >= r) {
					s = e;
					break;
				}
				const i = l.indexOf(o), a = l.indexOf(s, i), h = e.filter((t) => t.a >= o && t.b <= s);
				return i < 0 || a <= i || 0 === h.length ? -1 : (q(i, a, h), i);
			};
			P();
			for (let O = 0; O < qh && U(); O++) {
				let t = !1;
				for (let n = p.length - 1; n >= 0; n--) {
					const e = p[n];
					if (e.worst <= 1 || "cubic" !== e.kind || l[n + 1] - l[n] < Wh) continue;
					const r = L(n);
					r < 0 || ($(n, r), t = !0);
				}
				if (!t) break;
				C();
			}
			for (let O = 0; O < Rh && U(); O++) {
				let e = !1;
				for (let r = p.length - 1; r >= 0; r--) {
					const s = p[r];
					if (s.worst <= 1 || "cubic" !== s.kind) continue;
					e = !0;
					const i = l[r], a = l[r + 1], c = a - i < Wh && (n[i] >= yc || n[a] >= yc), g = r > 0 && !u[r] && "cubic" === p[r - 1].kind, m = r + 1 < p.length && !u[r + 1] && "cubic" === p[r + 1].kind;
					if (c && (g || m)) {
						const t = g && (!m || l[r] - l[r - 1] >= l[r + 2] - l[r + 1]) ? r : r + 1;
						l.splice(t, 1), u.splice(t, 1), h.splice(t, 1), f.splice(t, 1), p.splice(t - 1, 2, {
							...d(l[t - 1], l[t]),
							worst: 0
						});
					} else if (a - i >= Yh) $(r, L(r, Wh));
					else if ((!c || u[r] && u[r + 1]) && Xc(t, n, i, a, o).worst <= 1) s.kind = "line", s.cubic = ef(t, i, a), s.touched = !0;
					else if (!(a - i >= Wh) || u[r] && u[r + 1]) {
						const t = [];
						for (let n = i; n < a; n++) t.push({
							a: n,
							b: n + 1,
							kind: "line"
						});
						q(r, r + 1, t);
					} else y(r), y(r + 1), s.touched = !0;
				}
				if (!e) break;
				k(), C();
			}
			let z = !1;
			for (let O = p.length - 1; O >= 0 && U(); O--) {
				if (p[O].worst <= 1) continue;
				const t = R(O);
				t >= 0 && (O = t, z = !0);
			}
			if (U()) return null;
			const T = (t) => "line" === ("cubic" === t.kind ? "cubic" : "line" === t.kind ? "line" : t.seg?.kind ?? "line") ? 2 : 6, E = (e, r, s, i) => {
				let l = of(a, e, r), c = rf(t, n, e, r, l, s, i);
				for (let o = 0; o < Th; o++) {
					const o = sf(t, e, c, l);
					if (!o) break;
					l = o, c = rf(t, n, e, r, l, s, i);
				}
				const h = Gc(t, n, e, r, c, o);
				return {
					kind: "cubic",
					cubic: c,
					u: l,
					armS: Math.hypot(c.c1x - c.p0x, c.c1y - c.p0y),
					armE: Math.hypot(c.c2x - c.p3x, c.c2y - c.p3y),
					chi2: h.chi2,
					worst: lf(t, n, e, r, c, l, o) ? h.worst : 1 / 0,
					touched: !1
				};
			}, j = new Array(l.length).fill(1);
			for (let O = 0; O < zh; O++) {
				let e = !1, r = 1;
				for (; r < p.length;) {
					const o = p[r - 1], s = p[r];
					if (!j[r] || u[r] || "cubic" !== o.kind || "cubic" !== s.kind) {
						r++;
						continue;
					}
					const c = l[r - 1], y = l[r + 1], d = .5 * (o.chi2 + s.chi2) + i * (T(o) + T(s));
					let g = f[r - 1], m = h[r + 1], x = E(c, y, g, m), M = null, w = null, b = x.worst <= 1 && .5 * x.chi2 + 6 * i <= d;
					if (!b && y - c >= 3) {
						const e = cf(t, n, a, c, y), o = _h(e.c1x - e.p0x, e.c1y - e.p0y) ?? _h(e.c2x - e.p0x, e.c2y - e.p0y), s = _h(e.p3x - e.c2x, e.p3y - e.c2y) ?? _h(e.p3x - e.c1x, e.p3y - e.c1y), A = !u[r - 1] && r - 2 >= 0, k = !u[r + 1] && r + 1 < p.length, v = 1 === u[r - 1] || A && "cubic" === p[r - 2].kind, F = 1 === u[r + 1] || k && "cubic" === p[r + 1].kind;
						if (o && s && (v || F)) {
							v && (g = o), F && (m = s), x = E(c, y, g, m);
							let t = .5 * x.chi2 + 6 * i, n = d, e = x.worst <= 1;
							e && v && A && (M = E(l[r - 2], c, f[r - 2], g), e = M.worst <= 1, t += .5 * M.chi2, n += .5 * p[r - 2].chi2), e && F && k && (w = E(y, l[r + 2], m, h[r + 2]), e = w.worst <= 1, t += .5 * w.chi2, n += .5 * p[r + 1].chi2), b = e && t <= n;
						}
					}
					if (b) {
						z = !0, M && (p[r - 2] = M), w && (p[r + 1] = w), f[r - 1] = g, h[r + 1] = m, u[r - 1] || (h[r - 1] = g), u[r + 1] || (f[r + 1] = m), p.splice(r - 1, 2, x), l.splice(r, 1), u.splice(r, 1), h.splice(r, 1), f.splice(r, 1), j.splice(r, 1);
						for (let t = Math.max(0, r - 3); t <= Math.min(j.length - 1, r + 2); t++) j[t] = 1;
						e = !0;
					} else j[r] = 0, r++;
				}
				if (!e) break;
			}
			if (z) {
				const t = p.map((t) => ({
					...t,
					cubic: { ...t.cubic },
					u: Float64Array.from(t.u)
				})), n = h.map((t) => [t[0], t[1]]), e = f.map((t) => [t[0], t[1]]), r = t.reduce((t, n) => t + n.chi2, 0);
				if (P(), U() || p.reduce((t, n) => t + n.chi2, 0) > r) {
					p = t;
					for (let t = 0; t < n.length; t++) h[t] = n[t], f[t] = e[t];
				}
			}
			const B = [];
			for (let O = 0; O < p.length; O++) {
				const t = p[O], n = l[O], e = l[O + 1];
				"fixed" !== t.kind && "arc" !== t.kind || !t.seg ? "line" === t.kind || "fixed" === t.kind ? B.push({
					a: n,
					b: e,
					kind: "line"
				}) : B.push({
					a: n,
					b: e,
					kind: "cubic",
					cubic: t.cubic
				}) : B.push(t.seg);
			}
			return B;
		}(t, n, p, a, e < s.tau ? {
			...s,
			tau: e
		} : s);
		if (r) return r;
	}
	return p;
}
const Rc = 6, zc = 1 / 0;
let Tc, Ec, jc = "line";
function Bc(t, n, e, r, o, s, i, a) {
	if (r - e <= 1) return jc = "line", 2 * i.lambda;
	const l = i.lambda, c = Xc(t, n, e, r, i);
	let h, f, u = zc, y = null;
	const d = c.worst <= 1;
	if (d && (u = .5 * c.chi2 + 2 * l, y = "line"), !d || .5 * c.chi2 > 4 * l) {
		const a = Qc(t, e, r);
		let c = !1;
		if (a && function(t, n, e, r) {
			let o = Math.atan2(t[2 * n + 1] - r.cy, t[2 * n] - r.cx), s = 0, i = 0;
			for (let a = n + 1; a <= e; a++) {
				const n = Math.atan2(t[2 * a + 1] - r.cy, t[2 * a] - r.cx);
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
		}(t, e, r, a)) {
			const o = Wc(t, n, e, r, a, i);
			if (o.worst <= 1) {
				c = !0;
				const t = .5 * o.chi2 + 6 * l;
				t < u && (u = t, y = "arc", h = a);
			}
		}
		if (!c) {
			const a = Zc(t, e, r, o, s), c = Gc(t, n, e, r, a, i);
			if (c.worst <= 1) {
				const t = .5 * c.chi2 + 6 * l;
				t < u && (u = t, y = "cubic", f = a);
			}
		}
	}
	if (null !== y) return jc = y, Tc = h, Ec = f, u;
	if (!a) return zc;
	const p = Zc(t, e, r, o, s), g = Gc(t, n, e, r, p, i);
	return c.worst <= g.worst ? (jc = "line", .5 * c.chi2 + 2 * l) : (jc = "cubic", Ec = p, .5 * g.chi2 + 6 * l);
}
const Oc = 6;
function Kc(t, n, e, r) {
	return "arc" === e.kind && e.circle ? Wc(t, n, e.a, e.b, e.circle, r).chi2 : "cubic" === e.kind && e.cubic ? Gc(t, n, e.a, e.b, e.cubic, r).chi2 : Xc(t, n, e.a, e.b, r).chi2;
}
function Dc(t, n, e) {
	const r = n[2 * e.b], o = n[2 * e.b + 1];
	if ("line" === e.kind) t.push({
		type: "L",
		x: r,
		y: o
	});
	else if ("arc" === e.kind && e.circle) (function(t, n, e, r, o, s, i, a, l) {
		const c = Math.atan2(e - s.cy, n - s.cx), h = a + l >> 1;
		_c(t, s, c, function(t, n, e) {
			const r = Yc(n - t);
			return Yc(e - t) <= r ? r : r - 2 * Math.PI;
		}(c, Math.atan2(o - s.cy, r - s.cx), Math.atan2(i[2 * h + 1] - s.cy, i[2 * h] - s.cx)), n, e, r, o);
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
function Hc(t, n, e) {
	const r = e.tau * t[n];
	return r > e.band ? r : e.band;
}
function Xc(t, n, e, r, o) {
	const s = t[2 * e], i = t[2 * e + 1];
	let a = t[2 * r] - s, l = t[2 * r + 1] - i;
	const c = Math.hypot(a, l), h = c >= 1e-12;
	h && (a /= c, l /= c);
	let f = 0, u = 0;
	for (let y = e + 1; y < r; y++) {
		const e = h ? Math.abs((t[2 * y] - s) * l - (t[2 * y + 1] - i) * a) : Math.hypot(t[2 * y] - s, t[2 * y + 1] - i), r = n[y];
		u += e * e / (r * r);
		const c = e / Hc(n, y, o);
		c > f && (f = c);
	}
	return {
		chi2: u,
		worst: f
	};
}
function Wc(t, n, e, r, o, s) {
	let i = 0, a = 0;
	for (let l = e + 1; l < r; l++) {
		const e = Math.abs(Math.hypot(t[2 * l] - o.cx, t[2 * l + 1] - o.cy) - o.r), r = n[l];
		a += e * e / (r * r);
		const c = e / Hc(n, l, s);
		c > i && (i = c);
	}
	return {
		chi2: a,
		worst: i
	};
}
function Gc(t, n, e, r, o, s) {
	const i = r - e + 1;
	let a = 0, l = t[2 * e], c = t[2 * e + 1], h = 0, f = 0, u = 0;
	for (let d = 1; d < i; d++) {
		const n = e + d;
		u += Math.hypot(t[2 * n] - t[2 * (n - 1)], t[2 * n + 1] - t[2 * (n - 1) + 1]);
	}
	const y = u > 1e-12 ? u : 1;
	for (let d = e + 1; d < r; d++) {
		a += Math.hypot(t[2 * d] - l, t[2 * d + 1] - c), l = t[2 * d], c = t[2 * d + 1];
		const e = t[2 * d], r = t[2 * d + 1], i = $a(o, e, r, a / y), u = 1 - i, p = u * u * u * o.p0x + 3 * u * u * i * o.c1x + 3 * u * i * i * o.c2x + i * i * i * o.p3x, g = u * u * u * o.p0y + 3 * u * u * i * o.c1y + 3 * u * i * i * o.c2y + i * i * i * o.p3y, m = Math.hypot(p - e, g - r), x = n[d];
		f += m * m / (x * x);
		const M = m / Hc(n, d, s);
		M > h && (h = M);
	}
	return {
		chi2: f,
		worst: h
	};
}
function Zc(t, n, e, r, o) {
	const s = e - n + 1, i = new Float64Array(s);
	for (let c = 1; c < s; c++) {
		const e = n + c;
		i[c] = i[c - 1] + Math.hypot(t[2 * e] - t[2 * (e - 1)], t[2 * e + 1] - t[2 * (e - 1) + 1]);
	}
	const a = i[s - 1] || 1;
	for (let c = 0; c < s; c++) i[c] /= a;
	let l = Ua(t, n, e, i, r[0], r[1], -o[0], -o[1]);
	for (let c = 0; c < 1; c++) {
		let a = !0, c = -1;
		for (let e = 0; e < s; e++) {
			const r = $a(l, t[2 * (n + e)], t[2 * (n + e) + 1], i[e]);
			if (r <= c) {
				a = !1;
				break;
			}
			i[e] = r, c = r;
		}
		if (!a) break;
		l = Ua(t, n, e, i, r[0], r[1], -o[0], -o[1]);
	}
	return l;
}
function Qc(t, n, e) {
	if (e - n < 2) return null;
	const r = t[2 * n], o = t[2 * n + 1], s = t[2 * e], i = t[2 * e + 1], a = (r + s) / 2, l = (o + i) / 2;
	let c = s - r, h = i - o;
	const f = Math.hypot(c, h);
	if (f < 1e-9) return null;
	c /= f, h /= f;
	const u = -h, y = c, d = f * f / 4;
	let p = 0, g = 0;
	for (let M = n; M <= e; M++) {
		const n = t[2 * M] - a, e = t[2 * M + 1] - l, r = n * u + e * y;
		p += (n * n + e * e - d) * r, g += r * r;
	}
	if (g < 1e-9) return null;
	const m = p / (2 * g), x = Math.hypot(m, f / 2);
	return !isFinite(x) || x < 1e-6 || x > 1e7 ? null : {
		cx: a + m * u,
		cy: l + m * y,
		r: x
	};
}
function Yc(t) {
	let n = t;
	for (; n < 0;) n += 2 * Math.PI;
	for (; n >= 2 * Math.PI;) n -= 2 * Math.PI;
	return n;
}
function _c(t, n, e, r, o, s, i, a) {
	const l = Math.max(1, Math.ceil(Math.abs(r) / (Math.PI / 2))), c = r / l, h = 4 / 3 * Math.tan(c / 4), { cx: f, cy: u, r: y } = n;
	let d = e, p = o, g = s;
	for (let m = 0; m < l; m++) {
		const n = m === l - 1 ? e + r : d + c, o = f + y * Math.cos(n), s = u + y * Math.sin(n), x = p - h * y * Math.sin(d), M = g + h * y * Math.cos(d), w = o + h * y * Math.sin(n), b = s - h * y * Math.cos(n), A = m === l - 1 ? i : o, k = m === l - 1 ? a : s;
		t.push({
			type: "C",
			x1: x,
			y1: M,
			x2: w,
			y2: b,
			x: A,
			y: k
		}), d = n, p = o, g = s;
	}
}
function Vc(t, n, e, r, o) {
	const s = [];
	for (let f = e; f <= r; f++) o(f) || s.push(f);
	if (s.length < 3) return null;
	const i = [];
	for (const f of s) i.push(t[2 * f], t[2 * f + 1]);
	const a = function(t, n, e) {
		const r = e - 0 + 1;
		if (r < 3) return null;
		let o = 0, s = 0;
		for (let k = 0; k <= e; k++) o += t[2 * k], s += t[2 * k + 1];
		const i = o / r, a = s / r;
		let l = 0, c = 0, h = 0, f = 0, u = 0, y = 0, d = 0;
		for (let k = 0; k <= e; k++) {
			const n = t[2 * k] - i, e = t[2 * k + 1] - a;
			l += n * n, c += n * e, h += e * e, f += n * n * n, u += e * e * e, y += n * e * e, d += e * n * n;
		}
		const p = l * h - c * c;
		if (Math.abs(p) < 1e-9) return null;
		const g = (f + y) / 2, m = (u + d) / 2, x = (g * h - m * c) / p, M = (m * l - g * c) / p, w = x + i, b = M + a, A = Math.sqrt(Math.max(0, x * x + M * M + (l + h) / r));
		return !isFinite(A) || A < 1e-6 || A > 1e7 ? null : {
			cx: w,
			cy: b,
			r: A
		};
	}(i, 0, s.length - 1);
	if (!a) return null;
	let { cx: l, cy: c, r: h } = a;
	for (let f = 0; f < 6; f++) {
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
			const o = t[2 * i] - l, s = t[2 * i + 1] - c, a = Math.hypot(o, s);
			if (a < 1e-9) continue;
			const f = 1 / (n[i] * n[i]), u = a - h, y = [
				-o / a,
				-s / a,
				-1
			];
			for (let t = 0; t < 3; t++) {
				r[t] += f * y[t] * u;
				for (let n = 0; n < 3; n++) e[3 * t + n] += f * y[t] * y[n];
			}
		}
		const o = ch(e, r);
		if (!o) break;
		if (l -= o[0], c -= o[1], h -= o[2], Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) < 1e-7) break;
	}
	return !isFinite(h) || h < 1e-6 || h > 1e7 ? null : {
		cx: l,
		cy: c,
		r: h
	};
}
const Jc = 3, th = 5;
function nh(t, n, e) {
	const r = Math.cos(t.angle), o = Math.sin(t.angle), s = n - t.cx, i = e - t.cy;
	let a = Math.abs(s * r + i * o), l = Math.abs(-s * o + i * r), c = t.rx, h = t.ry;
	if (c < h && ([c, h] = [h, c], [a, l] = [l, a]), l > 0) {
		if (a > 0) {
			const t = a / c, n = l / h, e = t * t + n * n - 1;
			if (0 === e) return 0;
			const r = c / h * (c / h), o = r * t;
			let s = n - 1, i = e < 0 ? 0 : Math.hypot(o, n) - 1, f = 0;
			for (let a = 0; a < 128 && (f = (s + i) / 2, f !== s && f !== i); a++) {
				const t = o / (f + r), e = n / (f + 1), a = t * t + e * e - 1;
				if (a > 0) s = f;
				else {
					if (!(a < 0)) break;
					i = f;
				}
			}
			const u = r * a / (f + r), y = l / (f + 1);
			return Math.hypot(u - a, y - l);
		}
		return Math.abs(l - h);
	}
	const f = c * a, u = c * c - h * h;
	if (f < u) {
		const t = f / u;
		return Math.hypot(c * t - a, h * Math.sqrt(1 - t * t));
	}
	return Math.abs(a - c);
}
function eh(t, n) {
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
const rh = 256, oh = .4;
function sh(t, n, e, r) {
	const o = t.length >> 1;
	if (o < 5) return [];
	const s = o - 1, i = [];
	let a = 1 / 0, l = 1 / 0, c = -1 / 0, h = -1 / 0;
	for (let y = 0; y < s; y++) a = Math.min(a, t[2 * y]), c = Math.max(c, t[2 * y]), l = Math.min(l, t[2 * y + 1]), h = Math.max(h, t[2 * y + 1]);
	const f = Math.hypot(c - a, h - l), u = Vc(t, n, 0, o - 2, () => !1);
	if (u && 2 * u.r <= f) {
		let o = 0;
		for (let e = 0; e < s; e++) {
			const r = Math.hypot(t[2 * e] - u.cx, t[2 * e + 1] - u.cy) - u.r;
			o += r * r / (n[e] * n[e]);
		}
		const a = .5 * o + e.lambda * Jc;
		o <= e.tau * e.tau * Math.max(1, s - Jc) && a <= r && Math.abs(ah({
			...u,
			rx: u.r,
			ry: u.r,
			angle: 0
		}, t, s)) > 1.9 * Math.PI && i.push({
			prim: {
				kind: "circle",
				circle: u
			},
			cost: a
		});
	}
	if (!dc(e) && ih(n, s)) {
		const o = function(t, n, e) {
			if (e < 6) return null;
			let r = 0, o = 0;
			for (let I = 0; I < e; I++) r += t[2 * I], o += t[2 * I + 1];
			const s = r / e, i = o / e;
			let a = 0, l = 0, c = 0;
			for (let I = 0; I < e; I++) {
				const n = t[2 * I] - s, e = t[2 * I + 1] - i;
				a += n * n, l += e * e, c += n * e;
			}
			a /= e, l /= e, c /= e;
			const h = (a + l) / 2, f = Math.sqrt(Math.max(0, ((a - l) / 2) ** 2 + c * c)), u = h + f, y = h - f;
			if (!(y > 1e-6)) return null;
			const d = Math.min(e, rh), p = new Int32Array(d);
			for (let I = 0; I < d; I++) p[I] = Math.floor(I * e / d);
			let g = [
				s,
				i,
				Math.log(Math.sqrt(2 * u)),
				Math.log(Math.sqrt(2 * y)),
				.5 * Math.atan2(2 * c, a - l)
			];
			const m = (e, r) => {
				const o = Math.exp(e[2]), s = Math.exp(e[3]), i = Math.cos(e[4]), a = Math.sin(e[4]);
				let l = 0;
				for (let c = 0; c < d; c++) {
					const h = p[c], f = t[2 * h] - e[0], u = t[2 * h + 1] - e[1], y = f * i + u * a, d = -f * a + u * i, g = y * y / (o * o) + d * d / (s * s) - 1, m = 2 * Math.hypot(y / (o * o), d / (s * s)), x = m > 1e-12 ? g / m / n[h] : 0;
					r[c] = x, l += x * x;
				}
				return l;
			}, x = new Float64Array(d), M = new Float64Array(d), w = Array.from({ length: 5 }, () => new Float64Array(d));
			let b = m(g, x), A = .001;
			const k = Math.sqrt(u), v = [
				1e-6 * k,
				1e-6 * k,
				1e-7,
				1e-7,
				1e-7
			];
			for (let I = 0; I < 40; I++) {
				for (let r = 0; r < 5; r++) {
					const t = g.slice();
					t[r] += v[r], m(t, w[r]);
					for (let n = 0; n < d; n++) w[r][n] = (w[r][n] - x[n]) / v[r];
				}
				const t = Array.from({ length: 5 }, () => new Array(5).fill(0)), n = new Array(5).fill(0);
				for (let r = 0; r < 5; r++) {
					for (let n = r; n < 5; n++) {
						let e = 0;
						for (let t = 0; t < d; t++) e += w[r][t] * w[n][t];
						t[r][n] = e, t[n][r] = e;
					}
					let e = 0;
					for (let t = 0; t < d; t++) e += w[r][t] * x[t];
					n[r] = -e;
				}
				let e = !1;
				for (let r = 0; r < 8 && !e; r++) {
					const r = eh(t.map((t, n) => t.map((t, e) => n === e ? t * (1 + A) + 1e-12 : t)), n.slice());
					if (!r) {
						A *= 10;
						continue;
					}
					const o = g.map((t, n) => t + r[n]), s = m(o, M);
					if (s < b) {
						const t = b - s;
						g = o, x.set(M), b = s, A = Math.max(1e-9, A / 10), e = !0, t <= 1e-10 * Math.max(1, b) && (I = 40);
					} else A *= 10;
				}
				if (!e) break;
			}
			const F = {
				cx: g[0],
				cy: g[1],
				rx: Math.exp(g[2]),
				ry: Math.exp(g[3]),
				angle: g[4]
			};
			return Number.isFinite(F.cx + F.cy + F.rx + F.ry + F.angle + b) ? {
				ellipse: F,
				spread: b / d
			} : null;
		}(t, n, s), a = o && o.spread <= 4 * e.tau * e.tau ? o.ellipse : null;
		if (a && Math.min(a.rx, a.ry) >= oh && 2 * Math.max(a.rx, a.ry) <= f) {
			let o = 0;
			for (let e = 0; e < s; e++) {
				const r = nh(a, t[2 * e], t[2 * e + 1]);
				o += r * r / (n[e] * n[e]);
			}
			const l = .5 * o + e.lambda * th;
			o <= e.tau * e.tau * Math.max(1, s - th) && l < r && Math.abs(ah(a, t, s)) > 1.9 * Math.PI && i.push({
				prim: {
					kind: "ellipse",
					ellipse: a
				},
				cost: l
			});
		}
	}
	return 2 === i.length && i[1].cost < i[0].cost && i.reverse(), i;
}
function ih(t, n) {
	let e = 0;
	for (let r = 0; r < n; r++) t[r] < yc && e++;
	return 2 * e >= n;
}
function ah(t, n, e) {
	const r = Math.cos(t.angle), o = Math.sin(t.angle), s = (e) => {
		const s = n[2 * e] - t.cx, i = n[2 * e + 1] - t.cy;
		return Math.atan2((-s * o + i * r) / t.ry, (s * r + i * o) / t.rx);
	};
	let i = 0, a = s(0);
	for (let l = 1; l <= e; l++) {
		const t = s(l % e);
		let n = t - a;
		n > Math.PI && (n -= 2 * Math.PI), n < -Math.PI && (n += 2 * Math.PI), i += n, a = t;
	}
	return i;
}
function lh(t, n) {
	const e = Math.cos(t.angle), r = Math.sin(t.angle), o = t.rx * Math.cos(n), s = t.ry * Math.sin(n), i = -t.rx * Math.sin(n), a = t.ry * Math.cos(n);
	return [
		t.cx + o * e - s * r,
		t.cy + o * r + s * e,
		i * e - a * r,
		i * r + a * e
	];
}
function ch(t, n) {
	const [e, r, o, s, i, a, l, c, h] = t, f = e * (i * h - a * c) - r * (s * h - a * l) + o * (s * c - i * l);
	return Math.abs(f) < 1e-12 ? null : [
		(n[0] * (i * h - a * c) - r * (n[1] * h - a * n[2]) + o * (n[1] * c - i * n[2])) / f,
		(e * (n[1] * h - a * n[2]) - n[0] * (s * h - a * l) + o * (s * n[2] - n[1] * l)) / f,
		(e * (i * n[2] - n[1] * c) - r * (s * n[2] - n[1] * l) + n[0] * (s * c - i * l)) / f
	];
}
function hh(t, n, e) {
	const r = (n - t.cx) * t.dx + (e - t.cy) * t.dy;
	return [t.cx + r * t.dx, t.cy + r * t.dy];
}
function fh(t, n, e) {
	const r = n - t.cx, o = e - t.cy, s = Math.hypot(r, o);
	return s < 1e-12 ? [n, e] : [t.cx + r * t.r / s, t.cy + o * t.r / s];
}
function uh(t, n) {
	const e = t.dx * n.dy - t.dy * n.dx;
	if (Math.abs(e) < 1e-9) return null;
	const r = ((n.cx - t.cx) * n.dy - (n.cy - t.cy) * n.dx) / e;
	return [t.cx + t.dx * r, t.cy + t.dy * r];
}
function yh(t, n, e, r) {
	const o = t.cx - n.cx, s = t.cy - n.cy, i = o * t.dx + s * t.dy, a = i * i - (o * o + s * s - n.r * n.r);
	if (a < 0) return null;
	const l = Math.sqrt(a), c = [t.cx + t.dx * (-i - l), t.cy + t.dy * (-i - l)], h = [t.cx + t.dx * (-i + l), t.cy + t.dy * (-i + l)];
	return Math.hypot(c[0] - e, c[1] - r) <= Math.hypot(h[0] - e, h[1] - r) ? c : h;
}
const dh = 1;
function ph(t, n, e, r) {
	const o = (t, n) => null !== t && Math.hypot(t[0] - e, t[1] - r) <= n;
	if (n.cornerStart) {
		const e = n.apexX, r = n.apexY;
		let o = null, s = dh;
		if ("line" === t.kind && "line" === n.kind && t.line && n.line) {
			o = uh(t.line, n.line);
			const i = t.line.dx * n.line.dy - t.line.dy * n.line.dx, a = Math.atan2(Math.abs(i), t.line.dx * n.line.dx + t.line.dy * n.line.dy);
			return s = a >= Sc ? .5 + Math.min(3, Nc / Math.max(.2, Math.sin(.5 * (Math.PI - a)))) : .5, o && Math.hypot(o[0] - n.vertX, o[1] - n.vertY) <= s ? o : [e, r];
		}
		return t.line && n.circle ? o = yh(t.line, n.circle, e, r) : t.circle && n.line ? o = yh(n.line, t.circle, e, r) : t.circle && n.circle && (o = function(t, n, e, r) {
			const o = n.cx - t.cx, s = n.cy - t.cy, i = Math.hypot(o, s);
			if (i < 1e-9 || i > t.r + n.r || i < Math.abs(t.r - n.r)) return null;
			const a = (t.r * t.r - n.r * n.r + i * i) / (2 * i), l = Math.sqrt(Math.max(0, t.r * t.r - a * a)), c = t.cx + a * o / i, h = t.cy + a * s / i, f = [c + l * s / i, h - l * o / i], u = [c - l * s / i, h + l * o / i];
			return Math.hypot(f[0] - e, f[1] - r) <= Math.hypot(u[0] - e, u[1] - r) ? f : u;
		}(t.circle, n.circle, e, r)), o && Math.hypot(o[0] - e, o[1] - r) <= 1.5 ? o : [e, r];
	}
	if (t.line && n.line) {
		const s = uh(t.line, n.line);
		return o(s, dh) ? s : [e, r];
	}
	if (t.line && n.circle) {
		const s = hh(t.line, n.circle.cx, n.circle.cy);
		return o(s, dh) ? s : hh(t.line, e, r);
	}
	if (t.circle && n.line) {
		const s = hh(n.line, t.circle.cx, t.circle.cy);
		return o(s, dh) ? s : hh(n.line, e, r);
	}
	return t.circle && n.circle ? [e, r] : t.line ? hh(t.line, e, r) : n.line ? hh(n.line, e, r) : t.circle ? fh(t.circle, e, r) : n.circle ? fh(n.circle, e, r) : [e, r];
}
function gh(t, n, e, r, o, s, i) {
	let a, l;
	if (t.line) a = t.line.dx, l = t.line.dy;
	else {
		if (!t.circle) return null;
		{
			a = -(e - t.circle.cy), l = n - t.circle.cx;
			const r = Math.hypot(a, l);
			if (r < 1e-12) return null;
			a /= r, l /= r;
		}
	}
	return a * (s - r) + l * (i - o) < 0 && (a = -a, l = -l), [a, l];
}
function mh(t, n, e) {
	let r = 0;
	for (let o = n + 1; o <= e; o++) r += Math.hypot(t[2 * o] - t[2 * (o - 1)], t[2 * o + 1] - t[2 * (o - 1) + 1]);
	return r;
}
function xh(t, n, e, r, o, s) {
	let i = 0, a = Math.atan2(n[2 * e + 1] - t.cy, n[2 * e] - t.cx);
	for (let h = e + 1; h <= r; h++) {
		const e = Math.atan2(n[2 * h + 1] - t.cy, n[2 * h] - t.cx);
		let r = e - a;
		for (; r > Math.PI;) r -= 2 * Math.PI;
		for (; r <= -Math.PI;) r += 2 * Math.PI;
		i += r, a = e;
	}
	const l = Yc(s - o), c = l - 2 * Math.PI;
	return Math.abs(l - i) <= Math.abs(c - i) ? l : c;
}
function Mh(t, n, e, r) {
	let o = 1 / 0, s = 1 / 0, i = -1 / 0, a = -1 / 0;
	for (let h = e; h <= r; h++) {
		const t = n[2 * h], e = n[2 * h + 1];
		t < o && (o = t), t > i && (i = t), e < s && (s = e), e > a && (a = e);
	}
	const l = Math.max(4, Math.hypot(i - o, a - s)), c = (t, n) => t >= o - l && t <= i + l && n >= s - l && n <= a + l;
	return c(t.c1x, t.c1y) && c(t.c2x, t.c2y);
}
const wh = 1, bh = 64;
function Ah(t, n, e, r) {
	const o = /* @__PURE__ */ new Float64Array(65), s = /* @__PURE__ */ new Float64Array(65);
	for (let a = 0; a <= bh; a++) {
		const n = a / bh, e = 1 - n;
		o[a] = e * e * e * t.p0x + 3 * e * e * n * t.c1x + 3 * e * n * n * t.c2x + n * n * n * t.p3x, s[a] = e * e * e * t.p0y + 3 * e * e * n * t.c1y + 3 * e * n * n * t.c2y + n * n * n * t.p3y;
	}
	let i = 0;
	for (let a = e + 1; a < r; a++) {
		const t = n[2 * a], e = n[2 * a + 1];
		let r = 1 / 0;
		for (let n = 0; n < bh; n++) {
			const i = o[n + 1] - o[n], a = s[n + 1] - s[n], l = i * i + a * a;
			let c = l > 0 ? ((t - o[n]) * i + (e - s[n]) * a) / l : 0;
			c = c < 0 ? 0 : c > 1 ? 1 : c;
			const h = Math.hypot(t - o[n] - c * i, e - s[n] - c * a);
			h < r && (r = h);
		}
		r > i && (i = r);
	}
	return i;
}
const kh = 1e3;
function vh(t, n, e, r) {
	const o = n[r], s = n[(r - 1 + e) % e], i = n[(r + 1) % e], a = Ic(t[2 * s], t[2 * s + 1], t[2 * o], t[2 * o + 1], t[2 * i], t[2 * i + 1]) * Math.PI / 180, l = .5 * (Math.PI - a);
	return Math.min(3, Math.max(Nc, Nc / Math.max(.2, Math.sin(l))));
}
const Fh = 2.5;
function Ih(t, n, e, r, o, s, i, a, l) {
	const c = (t.length >> 1) - 1, h = t[0], f = t[1], u = t[2 * c], y = t[2 * c + 1], d = (e) => {
		if (!o) return !1;
		if (0 === e || e === c) return !0;
		if (n[e] >= kh) return !0;
		const r = t[2 * e], s = t[2 * e + 1];
		return Math.hypot(r - h, s - f) <= Nc || Math.hypot(r - u, s - y) <= Nc;
	}, p = {
		kind: e.kind,
		pts: t,
		sig: n,
		a: e.a,
		b: e.b,
		cornerStart: r,
		apexX: s,
		apexY: i,
		vertX: a,
		vertY: l,
		skip: d
	};
	if ("line" === e.kind) {
		const r = function(t, n, e, r, o) {
			let s = 0, i = 0, a = 0, l = 0;
			for (let p = e; p <= r; p++) {
				if (o(p)) continue;
				const e = 1 / (n[p] * n[p]);
				s += e, i += e * t[2 * p], a += e * t[2 * p + 1], l++;
			}
			if (l < 2 || s <= 0) return null;
			i /= s, a /= s;
			let c = 0, h = 0, f = 0;
			for (let p = e; p <= r; p++) {
				if (o(p)) continue;
				const e = 1 / (n[p] * n[p]), r = t[2 * p] - i, s = t[2 * p + 1] - a;
				c += e * r * r, h += e * r * s, f += e * s * s;
			}
			const u = .5 * Math.atan2(2 * h, c - f);
			let y = Math.cos(u), d = Math.sin(u);
			return y * (t[2 * r] - t[2 * e]) + d * (t[2 * r + 1] - t[2 * e + 1]) < 0 && (y = -y, d = -d), {
				cx: i,
				cy: a,
				dx: y,
				dy: d
			};
		}(t, n, e.a, e.b, d);
		r ? p.line = r : p.kind = "line";
	} else if ("arc" === e.kind) {
		const r = Vc(t, n, e.a, e.b, d) ?? e.circle;
		r && (p.circle = r);
	}
	return p;
}
function Nh(t, n) {
	const e = t.length >> 1, r = Math.max(0, n - 1), o = Math.min(e - 1, n + 1);
	let s = t[2 * o] - t[2 * r], i = t[2 * o + 1] - t[2 * r + 1];
	const a = Math.hypot(s, i);
	return a < 1e-12 ? Sh(t, n) : (s /= a, i /= a, [s, i]);
}
function Sh(t, n) {
	const e = t.length >> 1, r = n + 1 < e ? n + 1 : n, o = n + 1 < e ? n : n - 1;
	let s = t[2 * r] - t[2 * o], i = t[2 * r + 1] - t[2 * o + 1];
	const a = Math.hypot(s, i);
	return a < 1e-12 ? [1, 0] : (s /= a, i /= a, [s, i]);
}
function Ph(t, n) {
	const e = n - 1 >= 0 ? n - 1 : n, r = n - 1 >= 0 ? n : n + 1;
	let o = t[2 * e] - t[2 * r], s = t[2 * e + 1] - t[2 * r + 1];
	const i = Math.hypot(o, s);
	return i < 1e-12 ? [-1, 0] : (o /= i, s /= i, [o, s]);
}
function Ch(t, n, e, r) {
	const o = new Array(2 * (r - e + 1)), s = new Array(r - e + 1);
	for (let i = e; i <= r; i++) o[2 * (i - e)] = t[2 * i], o[2 * (i - e) + 1] = t[2 * i + 1], s[i - e] = n[i];
	return {
		pts: o,
		sig: s
	};
}
function Uh(t, n, e, r, o) {
	const s = e === r ? o : (r - e + o) % o, i = new Array(2 * (s + 1)), a = new Array(s + 1);
	for (let l = 0; l <= s; l++) {
		const r = (e + l) % o;
		i[2 * l] = t[2 * r], i[2 * l + 1] = t[2 * r + 1], a[l] = n[r];
	}
	return {
		pts: i,
		sig: a
	};
}
const Lh = 3, $h = 2, qh = 4, Rh = 8, zh = 6, Th = 2, Eh = 2, jh = .5, Bh = 8, Oh = .001, Kh = 1e8, Dh = 3, Hh = 1, Xh = .02, Wh = 4, Gh = Math.PI / 2, Zh = 2, Qh = 3, Yh = 8;
function _h(t, n) {
	const e = Math.hypot(t, n);
	return e > 1e-12 && Number.isFinite(e) ? [t / e, n / e] : null;
}
function Vh(t, n) {
	const e = t[2 * n.a], r = t[2 * n.a + 1];
	if ("cubic" === n.kind && n.cubic) {
		const t = n.cubic, e = _h(t.c1x - t.p0x, t.c1y - t.p0y) ?? _h(t.c2x - t.p0x, t.c2y - t.p0y);
		if (e) return e;
	} else if ("arc" === n.kind && n.circle) {
		const o = n.circle;
		let s = -(r - o.cy), i = e - o.cx;
		s * (t[2 * (n.a + 1)] - e) + i * (t[2 * (n.a + 1) + 1] - r) < 0 && (s = -s, i = -i);
		const a = _h(s, i);
		if (a) return a;
	}
	return _h(t[2 * n.b] - e, t[2 * n.b + 1] - r) ?? [1, 0];
}
function Jh(t, n) {
	const e = t[2 * n.b], r = t[2 * n.b + 1];
	if ("cubic" === n.kind && n.cubic) {
		const t = n.cubic, e = _h(t.p3x - t.c2x, t.p3y - t.c2y) ?? _h(t.p3x - t.c1x, t.p3y - t.c1y);
		if (e) return e;
	} else if ("arc" === n.kind && n.circle) {
		const o = n.circle;
		let s = -(r - o.cy), i = e - o.cx;
		s * (e - t[2 * (n.b - 1)]) + i * (r - t[2 * (n.b - 1) + 1]) < 0 && (s = -s, i = -i);
		const a = _h(s, i);
		if (a) return a;
	}
	return _h(e - t[2 * n.a], r - t[2 * n.a + 1]) ?? [1, 0];
}
function tf(t, n) {
	const e = 1 - n;
	return _h(3 * e * e * (t.c1x - t.p0x) + 6 * e * n * (t.c2x - t.c1x) + 3 * n * n * (t.p3x - t.c2x), 3 * e * e * (t.c1y - t.p0y) + 6 * e * n * (t.c2y - t.c1y) + 3 * n * n * (t.p3y - t.c2y));
}
function nf(t, n) {
	const e = 1 - n, r = e * e * e, o = 3 * e * e * n, s = 3 * e * n * n, i = n * n * n;
	return [r * t.p0x + o * t.c1x + s * t.c2x + i * t.p3x, r * t.p0y + o * t.c1y + s * t.c2y + i * t.p3y];
}
function ef(t, n, e) {
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
function rf(t, n, e, r, o, s, i) {
	const a = t[2 * e], l = t[2 * e + 1], c = t[2 * r], h = t[2 * r + 1];
	let f = 0, u = 0, y = 0, d = 0, p = 0;
	for (let b = e + 1; b < r; b++) {
		const r = o[b - e], g = 1 - r, m = g * g * g, x = 3 * g * g * r, M = 3 * g * r * r, w = r * r * r, A = 1 / (n[b] * n[b]), k = x * s[0], v = x * s[1], F = -M * i[0], I = -M * i[1], N = t[2 * b] - (m + x) * a - (M + w) * c, S = t[2 * b + 1] - (m + x) * l - (M + w) * h;
		f += A * (k * k + v * v), u += A * (k * F + v * I), y += A * (F * F + I * I), d += A * (k * N + v * S), p += A * (F * N + I * S);
	}
	const g = Math.hypot(c - a, h - l), m = Xh * g, x = Hh * g;
	let M = g / 3, w = g / 3;
	if (f > 0 && y > 0) {
		const t = (t) => t < m ? m : t > x ? x : t, n = (t, n) => f * t * t + 2 * u * t * n + y * n * n - 2 * (d * t + p * n), e = f * y - u * u, r = (d * y - p * u) / e, o = (f * p - u * d) / e;
		if (e > 1e-12 * f * y && r >= m && r <= x && o >= m && o <= x) M = r, w = o;
		else {
			let e = 1 / 0;
			for (const r of [m, x]) {
				const o = t((p - u * r) / y), s = t((d - u * r) / f), i = n(r, o), a = n(s, r);
				i < e && (e = i, M = r, w = o), a < e && (e = a, M = s, w = r);
			}
		}
	}
	return {
		p0x: a,
		p0y: l,
		c1x: a + M * s[0],
		c1y: l + M * s[1],
		c2x: c - w * i[0],
		c2y: h - w * i[1],
		p3x: c,
		p3y: h
	};
}
function of(t, n, e) {
	const r = new Float64Array(e - n + 1), o = t[e] - t[n] || 1;
	for (let s = n + 1; s < e; s++) r[s - n] = (t[s] - t[n]) / o;
	return r[e - n] = 1, r;
}
function sf(t, n, e, r) {
	const o = r.length, s = new Float64Array(o);
	s[o - 1] = 1;
	let i = 0;
	for (let a = 1; a < o - 1; a++) {
		const o = $a(e, t[2 * (n + a)], t[2 * (n + a) + 1], r[a]);
		if (o <= i || o >= 1) return null;
		s[a] = o, i = o;
	}
	return s;
}
function af(t, n, e, r) {
	const o = t.length, s = new Float64Array(o), i = new Float64Array(o), a = new Float64Array(o);
	let l = t[0];
	if (!(Math.abs(l) > 1e-300)) return null;
	s[0] = o > 1 ? n[0] / l : 0, i[0] = e[0] / l, a[0] = r[0] / l;
	for (let c = 1; c < o; c++) {
		if (l = t[c] - n[c - 1] * s[c - 1], !(Math.abs(l) > 1e-300)) return null;
		s[c] = c < o - 1 ? n[c] / l : 0, i[c] = (e[c] - n[c - 1] * i[c - 1]) / l, a[c] = (r[c] - n[c - 1] * a[c - 1]) / l;
	}
	for (let c = o - 2; c >= 0; c--) i[c] -= s[c] * i[c + 1], a[c] -= s[c] * a[c + 1];
	return [i, a];
}
function lf(t, n, e, r, o, s, i) {
	const a = Hh * Math.hypot(o.p3x - o.p0x, o.p3y - o.p0y) + 1e-9;
	if (Math.hypot(o.c1x - o.p0x, o.c1y - o.p0y) > a || Math.hypot(o.c2x - o.p3x, o.c2y - o.p3y) > a) return !1;
	const l = tf(o, 0), c = tf(o, 1);
	if (l && c && l[0] * c[0] + l[1] * c[1] < Math.cos(Gh)) return !1;
	const h = (e, r, o) => {
		const s = t[2 * o], a = t[2 * o + 1], l = t[2 * (o + 1)] - s, c = t[2 * (o + 1) + 1] - a, h = l * l + c * c, f = h < 1e-18 ? 0 : Math.max(0, Math.min(1, ((e - s) * l + (r - a) * c) / h)), u = Math.max(Hc(n, o, i), Hc(n, o + 1, i));
		return Math.hypot(e - s - f * l, r - a - f * c) <= Zh * u;
	};
	for (let f = e; f < r; f++) {
		const [t, n] = nf(o, .5 * (s[f - e] + s[f + 1 - e]));
		if (h(t, n, f)) continue;
		let i = !1;
		const a = Math.max(e, f - Qh), l = Math.min(r - 1, f + Qh);
		for (let e = a; e <= l && !i; e++) i = e !== f && h(t, n, e);
		if (!i) return !1;
	}
	return !0;
}
function cf(t, n, e, r, o) {
	let s = of(e, r, o);
	const i = t[2 * r], a = t[2 * r + 1], l = t[2 * o], c = t[2 * o + 1], h = () => {
		let e = 0, h = 0, f = 0, u = 0, y = 0, d = 0, p = 0;
		for (let o = 0; o < s.length; o++) {
			const g = s[o], m = 1 - g, x = m * m * m, M = 3 * m * m * g, w = 3 * m * g * g, b = g * g * g, A = 1 / (n[r + o] * n[r + o]), k = t[2 * (r + o)] - x * i - b * l, v = t[2 * (r + o) + 1] - x * a - b * c;
			e += A * M * M, h += A * M * w, f += A * w * w, u += A * M * k, y += A * w * k, d += A * M * v, p += A * w * v;
		}
		const g = e * f - h * h;
		return Math.abs(g) < 1e-12 ? ef(t, r, o) : {
			p0x: i,
			p0y: a,
			c1x: (u * f - y * h) / g,
			c1y: (d * f - p * h) / g,
			c2x: (y * e - u * h) / g,
			c2y: (p * e - d * h) / g,
			p3x: l,
			p3y: c
		};
	};
	let f = h();
	for (let u = 0; u < 3; u++) {
		const n = sf(t, r, f, s);
		if (!n) break;
		s = n, f = h();
	}
	return f;
}
function hf(t, n, e) {
	const r = (t, r) => e ? df(t.points, e[r], n) : ff(t.points, n), o = [], s = new Int32Array(t.length);
	for (let a = 0; a < t.length; a++) {
		const n = t[a];
		n.area > 0 ? (s[a] = o.length, o.push({
			area: n.area,
			commands: r(n, a),
			holes: []
		})) : n.parent >= 0 && o[s[n.parent]].holes.push(r(n, a));
	}
	const i = o.map((t) => ({
		commands: t.commands.concat(...t.holes),
		area: t.area,
		holeCount: t.holes.length
	}));
	return i.sort((t, n) => n.area - t.area), i;
}
function ff(t, n, e) {
	return "pixel" === n.curveMode ? pf(t) : df(t, yf(t, e ?? n.coverage), n);
}
const uf = .75;
function yf(t, n, e) {
	const r = t.slice();
	r.push(t[0], t[1]);
	const o = Ji(r);
	if (o.length < 4) return null;
	const s = [], i = n ? ma(r, n, o, e, s) : r, a = Yi(i, Hi(i), o, !0), l = Math.min(Math.abs(g(t)), Math.abs(g(i)));
	if (Math.abs(g(a)) < uf * l) return null;
	const c = {
		polygon: a,
		geom: i,
		vertices: o,
		sigma: mc(r, i, void 0 !== n, o, e, s),
		refined: void 0 !== n,
		extent: n ? Math.max(n.width, n.height) : 0
	}, h = n ? function(t, n, e) {
		const r = Aa(e), o = t.length >> 1;
		if (o < 4) return;
		let s = 1 / 0, i = 1 / 0, a = -1 / 0, l = -1 / 0, c = 0;
		for (let A = 0; A < o; A++) {
			const n = t[2 * A], e = t[2 * A + 1];
			s = Math.min(s, n), a = Math.max(a, n), i = Math.min(i, e), l = Math.max(l, e);
			const r = (A + 1) % o;
			c += n * t[2 * r + 1] - t[2 * r] * e;
		}
		const h = Math.max(0, s - 2), f = Math.max(0, i - 2), u = Math.min(r.width, a + 2) - h, y = Math.min(r.height, l + 2) - f;
		if (u <= 0 || y <= 0 || u > 64 || y > 64) return;
		const d = (t, n) => r.at(t < 0 ? 0 : t >= r.width ? r.width - 1 : t, n < 0 ? 0 : n >= r.height ? r.height - 1 : n), p = c > 0;
		let g = 0;
		for (let A = 0; A < o; A++) {
			const n = t[2 * A], e = t[2 * A + 1], r = (A + 1) % o, s = Math.sign(t[2 * r] - n), i = Math.sign(t[2 * r + 1] - e), a = Math.abs(t[2 * r] - n) + Math.abs(t[2 * r + 1] - e);
			for (let t = 0; t < a; t++) {
				const r = n + s * t, o = e + i * t;
				let a, l, c, h;
				[a, l, c, h] = s > 0 ? [
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
				const f = d(a, l) - d(c, h);
				g += p ? f : -f;
			}
		}
		const m = g < 0 ? -1 : 1, x = new Float32Array(u * y);
		for (let A = 0; A < y; A++) for (let t = 0; t < u; t++) {
			const n = .5 + m * d(h + t, f + A);
			x[A * u + t] = n < 0 ? 0 : n > 1 ? 1 : n;
		}
		const M = new Uint8Array(u * y);
		let w = !1;
		const b = Math.min(o, n.length >> 1);
		for (let A = 0; A < b; A++) {
			const e = n[2 * A], r = n[2 * A + 1];
			if (e === t[2 * A] && r === t[2 * A + 1]) continue;
			w = !0;
			const o = Math.max(0, Math.ceil(e - ka - .5) - h), s = Math.min(u - 1, Math.floor(e + ka - .5) - h), i = Math.max(0, Math.ceil(r - ka - .5) - f), a = Math.min(y - 1, Math.floor(r + ka - .5) - f);
			for (let t = i; t <= a; t++) for (let n = o; n <= s; n++) Math.hypot(h + n + .5 - e, f + t + .5 - r) <= ka && (M[t * u + n] = 1);
		}
		return w ? {
			x0: h,
			y0: f,
			w: u,
			h: y,
			data: x,
			weight: M
		} : void 0;
	}(r, function(t, n, e) {
		if (!e) return n;
		const r = e.length, o = n.slice();
		for (let s = 0; s < o.length >> 1; s++) 0 !== e[s % r] && (o[2 * s] = t[2 * s], o[2 * s + 1] = t[2 * s + 1]);
		return o;
	}(r, i, e), n) : void 0;
	return h && (c.coverage = h), c;
}
function df(t, n, e) {
	if ("pixel" === e.curveMode || null === n) return pf(t);
	const r = n.polygon;
	if ("polygon" === e.curveMode) {
		const t = [{
			type: "M",
			x: r[0],
			y: r[1]
		}];
		for (let n = 1; n < (r.length >> 1) - 1; n++) t.push({
			type: "L",
			x: r[2 * n],
			y: r[2 * n + 1]
		});
		return t.push({ type: "Z" }), t;
	}
	const o = e.scale ?? 1, s = (t) => t / o, i = function(t, n, e, r, o) {
		const s = (t.length >> 1) - 1, i = (r.length >> 1) - 1;
		if (s < 3 || i < 3) return null;
		o = Mc(o), n = pc(n, o);
		const a = (n) => t[2 * e[n]], l = (n) => t[2 * e[n] + 1], c = (t, n, e, r, s, i) => Ic(t, n, e, r, s, i) >= vc && Ba(t, n, e, r, s, i, o.alphamax, o.cornerThreshold), h = new Uint8Array(i), f = new Uint8Array(i);
		for (let k = 0; k < i; k++) {
			const t = (k + i - 1) % i, n = (k + 1) % i;
			c(a(t), l(t), a(k), l(k), a(n), l(n)) && (h[k] = 1);
			const e = (k + 2) % i;
			if (i > 3 && Math.hypot(a(n) - a(k), l(n) - l(k)) <= Fh) {
				const r = (a(k) + a(n)) / 2, o = (l(k) + l(n)) / 2;
				c(a(t), l(t), r, o, a(e), l(e)) && (f[k] = 1);
			}
		}
		const u = {
			points: Float64Array.from(t.slice(0, 2 * s)),
			sigma: Float64Array.from(n.slice(0, s)),
			closed: !0
		}, y = {
			tau: o.tau,
			lambda: o.lambda
		}, d = (e, r, i) => {
			const a = function(t, n, e) {
				const r = {
					poly: t,
					n: t.points.length >> 1,
					edges: null
				}, o = new hl();
				return {
					incoming: dl(r, n, !1, e, o),
					outgoing: dl(r, n, !0, e, o)
				};
			}(u, e, y), l = Math.min((e - r + s) % s, 16), c = Math.min((i - e + s) % s, 16), h = Fc(t, n, s, (e - l + s) % s, (e - 1 + s) % s, e, o.tau), f = Fc(t, n, s, (e + 1) % s, (e + c) % s, e, o.tau), d = h ?? a.incoming, p = f ?? a.outgoing;
			return !d || !p || d.x * p.x + d.y * p.y <= Math.cos(vc * Math.PI / 180);
		}, p = new Uint8Array(i);
		for (let k = 0; k < i; k++) {
			const t = e[(k + i - 1) % i];
			if (h[k] && d(e[k], t, e[(k + 1) % i]) && (p[k] = 1), !f[k]) continue;
			const n = (k + 1) % i;
			d((e[k] + ((e[n] - e[k] + s) % s >> 1)) % s, t, e[(k + 2) % i]) && (p[k] = 1, p[n] = 1);
		}
		const g = [];
		for (let k = 0; k < i; k++) p[k] && g.push(k);
		if (dc(o)) {
			const a = function(t, n, e, r, o, s, i, a) {
				const l = [];
				if (0 === o.length) {
					const { pts: r, sig: o } = Uh(t, n, 0, 0, s), c = [];
					for (let t = 1; t < i; t++) c.push(e[t]);
					const h = Nh(r, 0), f = [1 / 0], u = qc(r, o, c, [h[0], h[1]], [h[0], h[1]], a, f), y = function(t, n, e, r) {
						const [o] = sh(t, n, e, r);
						return o ? o.prim : null;
					}(r, o, a, f[0]);
					if (y) {
						const t = [];
						return kc(t, y, r), t.push({ type: "Z" }), t;
					}
					for (const t of u) l.push(Ih(r, o, t, !1, !1, 0, 0, 0, 0));
				} else {
					const c = /* @__PURE__ */ new Map(), h = (o) => {
						const a = c.get(o);
						if (a) return a;
						const l = Uc(t, n, e, s, i, o, [r[2 * o], r[2 * o + 1]]);
						return c.set(o, l), l;
					};
					for (let r = 0; r < o.length; r++) {
						const c = o[r], f = o[(r + 1) % o.length], { pts: u, sig: y, splits: d } = Lc(t, n, e, s, i, c, f), [p, g] = h(c), [m, x] = h(f), M = u[0], w = u[1], b = (u.length >> 1) - 1, A = u[2 * b], k = u[2 * b + 1];
						u[0] = p, u[1] = g, u[u.length - 2] = m, u[u.length - 1] = x;
						const v = vh(t, e, i, c), F = vh(t, e, i, f);
						for (let t = 1; t < b; t++) {
							const n = u[2 * t], e = u[2 * t + 1], r = Math.min(Math.hypot(n - M, e - w), Math.hypot(n - p, e - g)) <= v, o = Math.min(Math.hypot(n - A, e - k), Math.hypot(n - m, e - x)) <= F;
							(r || o) && (y[t] = kh);
						}
						qc(u, y, d, Sh(u, 0), Sh(u, u.length / 2 - 1), a).forEach((t, n) => l.push(Ih(u, y, t, 0 === n, !0, p, g, M, w)));
					}
				}
				(function(t) {
					for (let n = 0; n < t.length && t.length > 3; n++) {
						let n = -1;
						for (let o = 0; o < t.length; o++) {
							const e = t[o], r = t[(o + 1) % t.length];
							if (!e.cornerStart || !r.cornerStart) continue;
							const s = e.pts[2 * e.a], i = e.pts[2 * e.a + 1], a = e.pts[2 * e.b], l = e.pts[2 * e.b + 1];
							if (Math.hypot(a - s, l - i) > Fh) continue;
							const c = t[(o - 1 + t.length) % t.length];
							if ((c.line || c.circle) && (r.line || r.circle)) {
								n = o;
								break;
							}
						}
						if (n < 0) return;
						const e = t[n], r = t[(n + 1) % t.length];
						r.apexX = (e.pts[2 * e.a] + e.pts[2 * e.b]) / 2, r.apexY = (e.pts[2 * e.a + 1] + e.pts[2 * e.b + 1]) / 2, r.vertX = r.apexX, r.vertY = r.apexY, t.splice(n, 1);
					}
				})(l);
				const c = l.length;
				if (0 === c) return null;
				const h = new Array(c);
				for (let u = 0; u < c; u++) {
					const t = l[(u - 1 + c) % c], n = l[u], e = n.pts[2 * n.a], r = n.pts[2 * n.a + 1];
					h[u] = 1 === c ? [e, r] : ph(t, n, e, r);
				}
				const f = [{
					type: "M",
					x: h[0][0],
					y: h[0][1]
				}];
				for (let u = 0; u < c; u++) {
					const t = l[u], [n, e] = h[u], [r, o] = h[(u + 1) % c];
					if ("line" === t.kind || !t.circle && "arc" === t.kind) f.push({
						type: "L",
						x: r,
						y: o
					});
					else if ("arc" === t.kind && t.circle) {
						const s = t.circle, i = Math.atan2(e - s.cy, n - s.cx), a = xh(s, t.pts, t.a, t.b, i, Math.atan2(o - s.cy, r - s.cx));
						if (s.r * Math.abs(a) > 2 * mh(t.pts, t.a, t.b) + 3) return null;
						_c(f, s, i, a, n, e, r, o);
					} else {
						const s = t.pts.slice();
						s[2 * t.a] = n, s[2 * t.a + 1] = e, s[2 * t.b] = r, s[2 * t.b + 1] = o;
						const i = l[(u - 1 + c) % c], h = l[(u + 1) % c];
						let y = Sh(s, t.a), d = Sh(s, t.b - 1);
						t.cornerStart || (y = gh(i, n, e, n, e, r, o) ?? Nh(s, t.a)), h.cornerStart || (d = gh(h, r, o, n, e, r, o) ?? Nh(s, t.b));
						let p = Zc(s, t.a, t.b, y, d);
						if (t.b - t.a >= 2) {
							const n = Gc(s, t.sig, t.a, t.b, p, a);
							if (n.worst > 1) {
								const e = Zc(s, t.a, t.b, Sh(s, t.a), Sh(s, t.b - 1));
								if (Gc(s, t.sig, t.a, t.b, e, a).chi2 < n.chi2 && (p = e), Ah(p, s, t.a, t.b) > wh) return null;
							}
						}
						if (!Mh(p, t.pts, t.a, t.b)) return null;
						f.push({
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
				return f.push({ type: "Z" }), f;
			}(t, n, e, r, g, s, i, o);
			if (a) return a;
		}
		const m = [];
		if (0 === g.length) {
			const { pts: r, sig: a } = Uh(t, n, 0, 0, s), l = [];
			for (let t = 1; t < i; t++) l.push(e[t]);
			const c = Nh(r, 0), h = [1 / 0], f = qc(r, a, l, [c[0], c[1]], [c[0], c[1]], o, h, !0);
			m.push({
				type: "M",
				x: t[0],
				y: t[1]
			});
			for (const t of f) Dc(m, r, t);
			return m.push({ type: "Z" }), Ac(m, r, a, o, h[0]);
		}
		const x = /* @__PURE__ */ new Map();
		for (let k = 0; k < g.length && g.length > 2; k++) {
			const r = Cc(t, n, e, s, i, g, k);
			r && (x.set(g[k], r), x.set(g[(k + 1) % g.length], r));
		}
		const M = (o) => {
			const a = x.get(o);
			if (a) return a;
			const l = [r[2 * o], r[2 * o + 1]], c = Uc(t, n, e, s, i, o, l);
			return x.set(o, c), c;
		}, [w, b] = M(g[0]);
		m.push({
			type: "M",
			x: w,
			y: b
		});
		const A = [0];
		for (let k = 0; k < g.length; k++) {
			const r = g[k], a = g[(k + 1) % g.length], [l, c] = M(r), [h, f] = M(a);
			if (l === h && c === f && g.length > 1) continue;
			const { pts: u, sig: y, splits: d } = Lc(t, n, e, s, i, r, a);
			u[0] = l, u[1] = c, u[u.length - 2] = h, u[u.length - 1] = f, $c(m, u, y, d, Sh(u, 0), Sh(u, u.length / 2 - 1), o, A);
		}
		if (m.push({ type: "Z" }), !dc(o) && ih(n, s)) {
			const e = Uh(t, n, 0, 0, s);
			return Ac(m, e.pts, e.sig, o, A[0]);
		}
		return m;
	}(1 === o ? n.geom : n.geom.map(s), n.sigma, n.vertices, 1 === o ? r : r.map(s), {
		alphamax: 4 * e.smoothing / 3,
		cornerThreshold: e.cornerThreshold,
		lambda: gc(n.extent / o),
		tau: 2,
		band: bc(e.optTolerance),
		reach: xc(e.curveOptimize),
		stride: Math.round(wc(e.curveOptimize) * o),
		extent: n.extent / o,
		coverage: n.coverage && 1 !== o ? {
			...n.coverage,
			unit: o
		} : n.coverage
	});
	return i ? 1 === o ? i : w(i, o) : pf(t);
}
function pf(t) {
	const n = t.length >> 1, e = [];
	for (let r = 0; r < n; r++) {
		const o = (r + n - 1) % n, s = (r + 1) % n, i = t[2 * r] - t[2 * o], a = t[2 * r + 1] - t[2 * o + 1], l = t[2 * s] - t[2 * r];
		i * (t[2 * s + 1] - t[2 * r + 1]) - a * l !== 0 && (0 === e.length ? e.push({
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
const gf = [
	1,
	0,
	-1,
	0
], mf = [
	0,
	1,
	0,
	-1
];
function xf(t) {
	const { width: n, height: e, data: r } = t, o = (t, o) => t >= 0 && t < n && o >= 0 && o < e ? r[o * n + t] : -1, s = n + 1, i = new Uint8Array(n * (e + 1)), a = new Uint8Array(s * e);
	for (let p = 0; p <= e; p++) for (let t = 0; t < n; t++) o(t, p - 1) !== o(t, p) && (i[p * n + t] = 1);
	for (let p = 0; p < e; p++) for (let t = 0; t <= n; t++) o(t - 1, p) !== o(t, p) && (a[p * s + t] = 1);
	const l = (t, r, o) => {
		switch (o) {
			case 0: return t < n ? i[r * n + t] : 0;
			case 1: return r < e ? a[r * s + t] : 0;
			case 2: return t > 0 ? i[r * n + (t - 1)] : 0;
			default: return r > 0 ? a[(r - 1) * s + t] : 0;
		}
	}, c = (t, n) => (0 !== l(t, n, 0) ? 1 : 0) + (0 !== l(t, n, 1) ? 1 : 0) + (0 !== l(t, n, 2) ? 1 : 0) + (0 !== l(t, n, 3) ? 1 : 0), h = (t, e, r) => {
		0 === r ? i[e * n + t] = 2 : 1 === r ? a[e * s + t] = 2 : 2 === r ? i[e * n + (t - 1)] = 2 : a[(e - 1) * s + t] = 2;
	}, f = (t, r, o) => 0 === o ? t < n && 1 === i[r * n + t] : 1 === o ? r < e && 1 === a[r * s + t] : 2 === o ? t > 0 && 1 === i[r * n + (t - 1)] : r > 0 && 1 === a[(r - 1) * s + t], u = [], y = (t, n, e, r) => {
		const [s, i] = ((t, n, e) => {
			switch (e) {
				case 0: return [o(t, n - 1), o(t, n)];
				case 1: return [o(t, n), o(t - 1, n)];
				case 2: return [o(t - 1, n), o(t - 1, n - 1)];
				default: return [o(t - 1, n - 1), o(t, n - 1)];
			}
		})(t, n, e), a = [t, n];
		let y = 0, d = t, p = n, g = e;
		const m = e;
		for (;;) {
			h(d, p, g);
			const e = d + gf[g], o = p + mf[g];
			if (y += d * o - e * p, a.push(e, o), d = e, p = o, d === t && p === n) break;
			if (r && c(d, p) >= 3) break;
			let s = -1;
			for (let t = 0; t < 4; t++) if (t !== (g + 2) % 4 && 0 !== l(d, p, t) && f(d, p, t)) {
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
			loop: d === t && p === n && a.length > 2,
			firstDir: m,
			lastDir: g,
			shoelace: y
		});
	};
	for (let p = 0; p <= e; p++) for (let t = 0; t <= n; t++) if (c(t, p) >= 3) for (let n = 0; n < 4; n++) f(t, p, n) && y(t, p, n, !0);
	for (let p = 0; p <= e; p++) for (let t = 0; t <= n; t++) for (let n = 0; n < 2; n++) f(t, p, n) && y(t, p, n, !1);
	const d = /* @__PURE__ */ new Map();
	for (let p = 0; p < r.length; p++) {
		const t = r[p];
		t >= 0 && d.set(t, (d.get(t) ?? 0) + 1);
	}
	return {
		width: n,
		height: e,
		chains: u,
		areas: d
	};
}
function Mf(t, n, e) {
	const r = t.chains[n], o = function(t, n, e) {
		const r = e.colorField;
		if (r) {
			if (n.left < 0 || n.right < 0) {
				if (!r.alpha || n.left < 0 && n.right < 0) return;
				return n.right >= 0 ? Aa(r.alpha) : function(t) {
					const n = Aa(t);
					return {
						width: n.width,
						height: n.height,
						at: (t, e) => -n.at(t, e)
					};
				}(r.alpha);
			}
			return function(t, n, e, r, o, s) {
				const i = 3 * o, a = 3 * s;
				return {
					width: e,
					height: r,
					at(r, o) {
						const s = ba(t, 4 * (o * e + r), n, a, i);
						return s < 0 ? 0 : s - .5;
					}
				};
			}(r.pixels, r.paletteRgb, t.width, t.height, n.left, n.right);
		}
	}(t, r, e), s = function(t, n, e) {
		if (!e.refineChain) return t;
		const r = n.points[0], o = n.points[1];
		return Pf(e.refineChain([{
			type: "M",
			x: r,
			y: o
		}, ...t]));
	}(function(t, n, e) {
		const r = t.length >> 1;
		if (r < 2) return [];
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
		const o = Ji(t);
		let s = t;
		if (e) {
			s = ma(t, e, o);
			const n = s.length;
			s[0] = t[0], s[1] = t[1], s[n - 2] = t[n - 2], s[n - 1] = t[n - 1];
		}
		if ("polygon" === n.curveMode || o.length <= 2) {
			const t = Yi(s, Hi(s), o, !1), n = t.length >> 1, e = [];
			for (let r = 1; r < n; r++) e.push({
				type: "L",
				x: t[2 * r],
				y: t[2 * r + 1]
			});
			return e;
		}
		const i = mc(t, s, void 0 !== e), a = e ? Math.max(e.width, e.height) : 0, l = n.scale ?? 1, c = function(t, n, e, r) {
			const o = t.length >> 1;
			if (o < 2) return [];
			if (2 === o) return [{
				type: "L",
				x: t[2],
				y: t[3]
			}];
			n = pc(n, r = Mc(r));
			const s = e.length, i = [0];
			for (let l = 1; l < s - 1; l++) {
				const n = e[l - 1], o = e[l], s = e[l + 1];
				Ba(t[2 * n], t[2 * n + 1], t[2 * o], t[2 * o + 1], t[2 * s], t[2 * s + 1], r.alphamax, r.cornerThreshold) && i.push(l);
			}
			i.push(s - 1);
			const a = [];
			for (let l = 0; l + 1 < i.length; l++) {
				const o = i[l], s = i[l + 1], c = e[o], h = e[s], { pts: f, sig: u } = Ch(t, n, c, h), y = [];
				for (let t = o + 1; t < s; t++) y.push(e[t] - c);
				$c(a, f, u, y, Sh(f, 0), Sh(f, f.length / 2 - 1), r);
			}
			return a;
		}(1 === l ? s : s.map((t) => t / l), i, o, {
			alphamax: 4 * n.smoothing / 3,
			cornerThreshold: n.cornerThreshold,
			lambda: gc(a / l),
			tau: 2,
			band: bc(n.optTolerance),
			reach: xc(n.curveOptimize),
			stride: Math.round(wc(n.curveOptimize) * l),
			extent: a / l
		});
		if (1 === l || 0 === c.length) return c;
		const h = w(c, l), f = h[h.length - 1];
		return "Z" !== f.type && (h[h.length - 1] = {
			...f,
			x: t[2 * r - 2],
			y: t[2 * r - 1]
		}), h;
	}(r.points, e, o), r, e);
	if (!r.loop) return { open: s };
	const i = function(t, n, e) {
		const r = t.slice(0, t.length - 2), o = r.length >> 1;
		let s = 0;
		for (let a = 0; a < o; a++) {
			const t = (a + o - 1) % o, n = (a + 1) % o, e = r[2 * a] - r[2 * t], i = r[2 * a + 1] - r[2 * t + 1], l = r[2 * n] - r[2 * a];
			if (e * (r[2 * n + 1] - r[2 * a + 1]) - i * l !== 0) {
				s = a;
				break;
			}
		}
		const i = new Array(r.length);
		for (let a = 0; a < o; a++) {
			const t = (s + a) % o;
			i[2 * a] = r[2 * t], i[2 * a + 1] = r[2 * t + 1];
		}
		return ff(i, n, e);
	}(r.points, e, o);
	return {
		open: s,
		closed: e.refineChain ? e.refineChain(i) : i
	};
}
function wf(t, n) {
	return Math.abs(function(t) {
		let n = 0, e = 0, r = 0, o = 0, s = 0;
		const i = (t, e) => {
			n += o * e - t * s, o = t, s = e;
		};
		for (const a of t) switch (a.type) {
			case "M":
				e = o = a.x, r = s = a.y;
				break;
			case "L":
				i(a.x, a.y);
				break;
			case "Q": {
				const t = o, n = s;
				for (let e = 1; e <= 8; e++) {
					const r = e / 8, o = 1 - r;
					i(o * o * t + 2 * o * r * a.x1 + r * r * a.x, o * o * n + 2 * o * r * a.y1 + r * r * a.y);
				}
				break;
			}
			case "C": {
				const t = o, n = s;
				for (let e = 1; e <= 8; e++) {
					const [r, o] = Ia(t, n, a.x1, a.y1, a.x2, a.y2, a.x, a.y, e / 8);
					i(r, o);
				}
				break;
			}
			case "A": {
				const t = k(o, s, a);
				if (t) {
					const n = Math.cos(t.phi), e = Math.sin(t.phi);
					for (let r = 1; r < 8; r++) {
						const o = t.theta1 + t.dTheta * r / 8, s = t.rx * Math.cos(o), a = t.ry * Math.sin(o);
						i(t.cx + n * s - e * a, t.cy + e * s + n * a);
					}
				}
				i(a.x, a.y);
				break;
			}
			case "Z": i(e, r);
		}
		return n / 2;
	}(t)) < .5 * Math.abs(n);
}
function bf(t, n, e, r) {
	const o = t[n.chain].points, s = o.length >> 1;
	if (n.forward) for (let i = r ? 1 : 0; i < s; i++) e.push(o[2 * i], o[2 * i + 1]);
	else for (let i = s - 1 - (r ? 1 : 0); i >= 0; i--) e.push(o[2 * i], o[2 * i + 1]);
}
function Af(t, n) {
	const e = [];
	return n.forEach((n, r) => bf(t, n, e, r > 0)), e.length >= 2 && (e.length -= 2), pf(e);
}
function kf(t, n, e) {
	switch (e) {
		case 0: return [t + .5, n + .5];
		case 1: return [t - .5, n + .5];
		case 2: return [t - .5, n - .5];
		default: return [t + .5, n - .5];
	}
}
function vf(t, n, e) {
	switch (e) {
		case 0: return [t + .5, n - .5];
		case 1: return [t + .5, n + .5];
		case 2: return [t - .5, n + .5];
		default: return [t - .5, n - .5];
	}
}
function Ff(t, n, e, r) {
	if (!n) return null;
	for (const o of [
		1,
		0,
		3,
		2
	]) {
		const s = (e + o) % 4;
		for (const e of n) if ((e === r || !e.used) && If(t, e) === s) return e;
	}
	return null;
}
function If(t, n) {
	const e = t[n.chain];
	return n.forward ? e.firstDir : (e.lastDir + 2) % 4;
}
function Nf(t, n) {
	const e = t[n.chain];
	return n.forward ? e.lastDir : (e.firstDir + 2) % 4;
}
function Sf(t, n) {
	const e = t[n.chain].points;
	return n.forward ? [e[e.length - 2], e[e.length - 1]] : [e[0], e[1]];
}
function Pf(t) {
	return t.filter((t) => "M" !== t.type && "Z" !== t.type);
}
function Cf(t, n) {
	const e = t.length >> 1;
	if (e <= 2 || n <= 0) return t.slice();
	const r = new Uint8Array(e);
	r[0] = 1, r[e - 1] = 1;
	const o = [0, e - 1];
	for (; o.length > 0;) {
		const e = o.pop(), s = o.pop();
		let i = -1, a = -1;
		const l = t[2 * s], c = t[2 * s + 1], h = t[2 * e], f = t[2 * e + 1];
		for (let n = s + 1; n < e; n++) {
			const e = x(t[2 * n], t[2 * n + 1], l, c, h, f);
			e > i && (i = e, a = n);
		}
		i > n && a > 0 && (r[a] = 1, o.push(s, a, a, e));
	}
	const s = [];
	for (let i = 0; i < e; i++) r[i] && s.push(t[2 * i], t[2 * i + 1]);
	return s;
}
function Uf(t, n, e, r) {
	const o = t.length >> 1, s = new Float64Array(o);
	let i = 0;
	for (let c = 0; c < o; c++) {
		const o = Math.floor(t[2 * c]), a = Math.floor(t[2 * c + 1]);
		o < 0 || a < 0 || o >= e || a >= r || (s[i++] = 2 * n[a * e + o]);
	}
	if (0 === i) return;
	const a = s.subarray(0, i);
	a.sort();
	const l = i >> 1;
	return i % 2 == 1 ? a[l] : (a[l - 1] + a[l]) / 2;
}
function Lf(t, n) {
	return 3 * (n + 1) + (t + 1);
}
function $f(t) {
	const n = t.length >> 1, e = new Array(t.length);
	for (let r = 0; r < n; r++) e[2 * r] = t[2 * (n - 1 - r)], e[2 * r + 1] = t[2 * (n - 1 - r) + 1];
	return e;
}
function qf(t, n, e) {
	if (n <= 0) return t;
	let r = t.slice();
	const o = r.length >> 1;
	if (o < 3) return r;
	for (let s = 0; s < n; s++) {
		const t = r.slice(), n = e ? o : o - 1;
		for (let s = e ? 0 : 1; s < n; s++) {
			const n = (s + o - 1) % o, e = (s + 1) % o;
			t[2 * s] = .25 * r[2 * n] + .5 * r[2 * s] + .25 * r[2 * e], t[2 * s + 1] = .25 * r[2 * n + 1] + .5 * r[2 * s + 1] + .25 * r[2 * e + 1];
		}
		r = t;
	}
	return r;
}
function Rf(t, n) {
	for (; t[n] !== n;) {
		const e = t[n];
		t[n] = t[e], n = e;
	}
	return n;
}
var zf = class {
	data;
	length = 0;
	constructor(t) {
		this.data = new Int32Array(Math.max(16, t));
	}
	push(t) {
		this.length === this.data.length && this.grow(), this.data[this.length++] = t;
	}
	pushSegment(t, n, e, r) {
		this.length + 4 > this.data.length && this.grow();
		const o = this.data, s = this.length;
		o[s] = t, o[s + 1] = n, o[s + 2] = e, o[s + 3] = r, this.length = s + 4;
	}
	grow() {
		const t = new Int32Array(2 * this.data.length);
		t.set(this.data), this.data = t;
	}
};
function Tf(t, n, e) {
	return n * (e + 1) + t;
}
function Ef(t, n, e, r, o) {
	return r < 0 || o < 0 || r >= n || o >= e ? -1 : t[o * n + r];
}
function jf(t, n) {
	const e = 2 * n, r = new Int32Array(e), o = new Int32Array(e);
	for (let u = 0; u < n; u++) r[2 * u] = t[4 * u], o[2 * u] = 2 * u, r[2 * u + 1] = t[4 * u + 1], o[2 * u + 1] = 2 * u + 1;
	const [s, i] = function(t, n) {
		const e = t.length;
		let r = 0;
		for (let h = 0; h < e; h++) t[h] > r && (r = t[h]);
		const o = 32 - Math.clz32(r);
		let s = t, i = n, a = new Int32Array(e), l = new Int32Array(e);
		const c = /* @__PURE__ */ new Int32Array(2048);
		for (let h = 0; h < o; h += 11) {
			c.fill(0);
			for (let n = 0; n < e; n++) c[s[n] >>> h & 2047]++;
			let t = 0;
			for (let n = 0; n < c.length; n++) {
				const e = c[n];
				c[n] = t, t += e;
			}
			for (let n = 0; n < e; n++) {
				const t = c[s[n] >>> h & 2047]++;
				a[t] = s[n], l[t] = i[n];
			}
			[s, a] = [a, s], [i, l] = [l, i];
		}
		return [s, i];
	}(r, o), a = new Int32Array(e), l = new Int32Array(e + 1), c = new Int32Array(e), h = new Int32Array(e);
	let f = 0;
	for (let u = 0; u < e; u++) 0 !== f && a[f - 1] === s[u] || (a[f] = s[u], l[f] = u, f++), h[i[u]] = f - 1, c[u] = i[u] >> 1;
	return l[f] = e, {
		count: f,
		nodes: a,
		start: l,
		list: c,
		nodeOf: h
	};
}
function Bf(t, n) {
	return t.start[n + 1] - t.start[n] !== 2;
}
var Of = class {
	ids = new zf(1024);
	offset = new zf(64);
	left = new zf(64);
	right = new zf(64);
	from = new zf(64);
	to = new zf(64);
	constructor() {
		this.offset.push(0);
	}
	get count() {
		return this.left.length;
	}
	finish(t, n, e, r) {
		this.offset.push(this.ids.length), this.left.push(t), this.right.push(n), this.from.push(e), this.to.push(r);
	}
	discard() {
		this.ids.length = this.offset.data[this.offset.length - 1];
	}
};
function Kf(t, n) {
	return t > 0 ? 0 : n < 0 ? 1 : t < 0 ? 2 : 3;
}
function Df(t, n) {
	const e = t.edges[n >> 1];
	return 1 & n ? e.left : e.right;
}
function Hf(t, n, e, r, o, s, i, a) {
	const { edges: l, nodes: c } = t, h = l[e >> 1], f = 1 & e ? h.start : h.end, u = c[f].ends, y = u.indexOf(1 ^ e);
	if (y >= 0) {
		const t = u[(y + u.length - 1) % u.length], e = l[t >> 1];
		if ((1 & t ? e.right : e.left) === n && (t === r || !a[t])) return t;
	}
	for (let p = s; p < i; p++) {
		const t = o[p], n = l[t >> 1];
		if (!n.closed && (1 & t ? n.end : n.start) === f && !a[t]) return t;
	}
	const d = l[r >> 1];
	return (1 & r ? d.end : d.start) === f ? r : -1;
}
function Xf(t, n, e) {
	for (let r = 0; r < n.length; r++) {
		const o = n[r];
		for (let n = 0; n < o.edges.length; n++) if (Df(t, 2 * o.edges[n] + (o.reversed[n] ? 1 : 0)) === e) return r;
	}
	return -1;
}
function Wf(t) {
	const { faces: n, edges: e } = t, r = n.count, { start: o, sides: s } = function(t) {
		const n = t.faces.count, e = new Int32Array(n + 1), r = t.edges;
		for (const i of r) i.left >= 0 && i.left < n && e[i.left + 1]++, i.right >= 0 && i.right < n && e[i.right + 1]++;
		for (let i = 0; i < n; i++) e[i + 1] += e[i];
		const o = e.slice(0, n), s = new Int32Array(e[n]);
		for (let i = 0; i < r.length; i++) {
			const t = r[i];
			t.left >= 0 && t.left < n && (s[o[t.left]++] = 2 * i), t.right >= 0 && t.right < n && (s[o[t.right]++] = 2 * i + 1);
		}
		return {
			start: e,
			sides: s
		};
	}(t), i = new Uint8Array(2 * e.length), a = [];
	for (let f = 0; f < r; f++) {
		const n = [], r = o[f], l = o[f + 1];
		for (let o = r; o < l; o++) {
			const a = s[o];
			if (i[a]) continue;
			const c = {
				edges: [],
				reversed: [],
				outer: !1
			};
			let h = a;
			for (let n = l - r + 4; n > 0 && (i[h] = 1, c.edges.push(h >> 1), c.reversed.push(!(1 & ~h)), !e[h >> 1].closed); n--) {
				const n = Hf(t, f, h, a, s, r, l, i);
				if (n === a || n < 0) break;
				h = n;
			}
			n.push(c);
		}
		a.push(n);
	}
	const { width: l, ids: c } = n, h = new Uint8Array(r);
	for (let f = 0; f < c.length; f++) {
		const n = c[f];
		if (h[n]) continue;
		h[n] = 1;
		const e = f >= l ? c[f - l] : -1, r = a[n];
		let o = Xf(t, r, e);
		if (o < 0) {
			let n = 0;
			for (let e = 0; e < r.length; e++) {
				const s = Qf(Zf(t, r[e]));
				s < n && (n = s, o = e);
			}
		}
		o < 0 || (r[o].outer = !0, o > 0 && r.unshift(...r.splice(o, 1)));
	}
	return a;
}
function Gf(t, n) {
	const { faces: e, edges: r } = t, { count: o, width: s, ids: i } = e, a = new Int32Array(2 * r.length).fill(-1);
	for (let f = 0; f < o; f++) {
		const t = n[f];
		for (let n = 0; n < t.length; n++) {
			const e = t[n];
			for (let t = 0; t < e.edges.length; t++) a[2 * e.edges[t] + (e.reversed[t] ? 1 : 0)] = n;
		}
	}
	const l = new Int32Array(o).fill(-1), c = new Int32Array(o), h = new Uint8Array(o);
	for (let f = 0; f < i.length; f++) {
		const e = i[f];
		if (h[e]) continue;
		h[e] = 1;
		const r = f >= s ? i[f - s] : -1;
		if (-1 === r) continue;
		const o = n[e], u = Xf(t, o, r);
		if (u < 0) continue;
		let y = -1;
		for (let n = 0; n < o[u].edges.length && y < 0; n++) {
			const e = 2 * o[u].edges[n] + (o[u].reversed[n] ? 1 : 0);
			Df(t, e) === r && (y = 1 ^ e);
		}
		const d = a[y];
		l[e] = d >= 0 && !n[r][d].outer ? r : l[r], c[e] = l[e] < 0 ? 0 : c[l[e]] + 1;
	}
	return {
		parent: l,
		depth: c,
		ringDepth: n.map((t, n) => Int32Array.from(t, (t) => 2 * c[n] + (t.outer ? 0 : 1)))
	};
}
function Zf(t, n) {
	let e = 0;
	for (const s of n.edges) {
		const n = t.edges[s];
		e += n.points.length / 2 - (n.closed ? 0 : 1);
	}
	const r = new Float64Array(2 * e);
	let o = 0;
	for (let s = 0; s < n.edges.length; s++) {
		const e = t.edges[n.edges[s]], i = e.points, a = i.length / 2, l = e.closed ? a : a - 1;
		for (let t = 0; t < l; t++) {
			const l = n.reversed[s] ? e.closed ? (a - t) % a : a - 1 - t : t;
			r[o++] = i[2 * l], r[o++] = i[2 * l + 1];
		}
	}
	return r;
}
function Qf(t) {
	const n = t.length >> 1;
	if (n < 3) return 0;
	let e = 0, r = t[2 * n - 2], o = t[2 * n - 1];
	for (let s = 0; s < n; s++) {
		const n = t[2 * s], i = t[2 * s + 1];
		e += r * i - n * o, r = n, o = i;
	}
	return .5 * e;
}
function Yf(t, n) {
	const e = t.edges[n >> 1];
	return 1 & n ? e.right : e.left;
}
function _f(t, n) {
	const e = t.edges[n >> 1];
	return 1 & n ? e.left : e.right;
}
function Vf(t, n) {
	const { edges: e, nodes: r } = t, o = (t) => t >= 0 && t < n.length && 1 === n[t], s = (n) => o(Yf(t, n)) && !o(_f(t, n)), i = new Uint8Array(2 * e.length), a = [];
	for (let l = 0; l < 2 * e.length; l++) {
		if (i[l] || !s(l)) continue;
		const n = {
			edges: [],
			reversed: [],
			outer: !1
		};
		let c = l;
		for (let s = 2 * e.length + 4; s > 0; s--) {
			i[c] = 1, n.edges.push(c >> 1), n.reversed.push(!(1 & ~c));
			const s = e[c >> 1];
			if (s.closed) break;
			const a = r[1 & c ? s.start : s.end].ends;
			let h = a.indexOf(1 ^ c), f = -1;
			for (let n = 0; n < a.length && h >= 0; n++) {
				h = (h + a.length - 1) % a.length;
				const n = a[h];
				if (!o(Yf(t, n))) break;
				if (!o(_f(t, n))) {
					f = n;
					break;
				}
			}
			if (f < 0 || f === l || i[f]) break;
			c = f;
		}
		a.push(n);
	}
	return a;
}
function Jf(t, n) {
	return n.edges.map((e, r) => {
		const o = t.edges[e];
		return n.reversed[r] ? o.right : o.left;
	});
}
const tu = 2e3;
function nu(t, n, e, r, o, s, i) {
	const a = r + 1, l = /* @__PURE__ */ new Float64Array(9), c = /* @__PURE__ */ new Float64Array(3), h = /* @__PURE__ */ new Float64Array(5);
	for (let p = 0; p < o; p++) {
		const r = t[p], o = n[p], s = e[p];
		h[0] = 1, h[1] = r, h[2] = r * r, h[3] = r * r * r, h[4] = r * r * r * r;
		for (let t = 0; t < a; t++) {
			for (let n = 0; n < a; n++) l[3 * t + n] += s * h[t + n];
			c[t] += s * h[t] * o;
		}
	}
	const f = function(t, n) {
		const e = Float64Array.from(t), r = /* @__PURE__ */ new Float64Array(9);
		for (let s = 0; s < n; s++) r[4 * s] = 1;
		let o = 0;
		for (let s = 0; s < n; s++) o = Math.max(o, Math.abs(e[4 * s]));
		for (let s = 0; s < n; s++) {
			let t = s;
			for (let r = s + 1; r < n; r++) Math.abs(e[3 * r + s]) >= Math.abs(e[3 * t + s]) && (t = r);
			if (Math.abs(e[3 * t + s]) <= 1e-12 * o) return null;
			if (t !== s) for (let n = 0; n < 3; n++) {
				let o = e[3 * s + n];
				e[3 * s + n] = e[3 * t + n], e[3 * t + n] = o, o = r[3 * s + n], r[3 * s + n] = r[3 * t + n], r[3 * t + n] = o;
			}
			const i = e[3 * s + s];
			for (let o = 0; o < n; o++) e[3 * s + o] /= i, r[3 * s + o] /= i;
			for (let o = 0; o < n; o++) {
				if (o === s) continue;
				const t = e[3 * o + s];
				if (0 !== t) for (let i = 0; i < n; i++) e[3 * o + i] -= t * e[3 * s + i], r[3 * o + i] -= t * r[3 * s + i];
			}
		}
		return r;
	}(l, a);
	if (null === f) return !1;
	s.fill(0);
	for (let p = 0; p < a; p++) for (let t = 0; t < a; t++) s[p] += f[3 * p + t] * c[t];
	let u = 0;
	for (let p = 0; p < o; p++) {
		const r = t[p], o = n[p] - (s[0] + s[1] * r + s[2] * r * r);
		u += e[p] * o * o;
	}
	const y = Math.max(o - a, 0), d = y > 0 ? Math.max(u / y, 1) : 1;
	return i[0] = f[0] * d, i[1] = f[4] * d, i[2] = f[8] * d, !0;
}
function eu(t, n, e, r) {
	const o = t.points, s = o.length >> 1;
	if (s < 2) return null;
	if (-1 === t.left || -1 === t.right) {
		const t = n ? 0 : s - 1, e = n ? 1 : s - 2, r = o[2 * e] - o[2 * t], i = o[2 * e + 1] - o[2 * t + 1], a = Math.hypot(r, i);
		if (a < 1e-9) return null;
		const l = -i / a, c = r / a;
		return {
			nx: l,
			ny: c,
			c: l * o[2 * t] + c * o[2 * t + 1],
			variance: 1e-6
		};
	}
	const i = [];
	if (n) for (let q = 2; q < s - 1 && i.length < 16; q++) i.push(q);
	else for (let q = s - 2 - 1; q >= 1 && i.length < 16; q--) i.push(q);
	const a = i.length;
	if (a < 2) return null;
	const l = new Float64Array(a);
	let c = 0, h = 0, f = 0;
	for (let q = 0; q < a; q++) {
		const n = Math.max(t.sigma[i[q]], .001), e = 1 / (n * n);
		l[q] = e, c += e;
	}
	for (let q = 0; q < a; q++) h += l[q] * o[2 * i[q]], f += l[q] * o[2 * i[q] + 1];
	h /= c, f /= c;
	let u = 0, y = 0, d = 0;
	for (let q = 0; q < a; q++) {
		const t = o[2 * i[q]] - h, n = o[2 * i[q] + 1] - f;
		u += l[q] * t * t, y += l[q] * n * n, d += l[q] * t * n;
	}
	const p = .5 * Math.atan2(2 * d, u - y), g = Math.cos(p), m = Math.sin(p), x = -m, M = g, w = new Float64Array(a), b = new Float64Array(a);
	for (let q = 0; q < a; q++) {
		const t = o[2 * i[q]] - e, n = o[2 * i[q] + 1] - r;
		w[q] = t * g + n * m, b[q] = t * x + n * M;
	}
	const A = function(t, n, e) {
		const r = t.length, o = Math.min(6, r), s = /* @__PURE__ */ new Float64Array(3), i = /* @__PURE__ */ new Float64Array(3);
		if (!nu(t, n, e, 1, o, s, i)) return null;
		const a = [
			s[0],
			s[1],
			i[0]
		];
		return r >= 5 && o >= 5 && nu(t, n, e, 2, r, s, i) && Math.abs(s[2]) > 3 * Math.sqrt(Math.max(i[2], 0)) ? o < r && !nu(t, n, e, 2, o, s, i) ? null : [
			s[0],
			s[1],
			i[0]
		] : a;
	}(w, b, l);
	if (null === A) return null;
	const [k, v, F] = A, I = g + v * x, N = m + v * M, S = Math.hypot(I, N), P = -N / S, C = I / S, U = e + k * x, L = r + k * M, $ = Math.max(Math.abs(P * x + C * M), .001);
	return {
		nx: P,
		ny: C,
		c: P * U + C * L,
		variance: Math.max(F * $ * $, 1e-6)
	};
}
function ru(t, n, e) {
	const r = .5 * (t + e), o = Math.sqrt(.25 * (t - e) * (t - e) + n * n);
	return [r - o, r + o];
}
function ou(t, n, e) {
	if (t.length < 2) return null;
	let r = 0, o = 0, s = 0;
	for (const m of t) r += m.nx * m.nx, o += m.nx * m.ny, s += m.ny * m.ny;
	const [i, a] = ru(r, o, s);
	if (a <= 0 || i / a < .02) return null;
	let l = 0, c = 0, h = 0, f = 0, u = 0;
	for (const m of t) {
		const t = 1 / m.variance;
		l += t * m.nx * m.nx, c += t * m.nx * m.ny, h += t * m.ny * m.ny, f += t * m.nx * m.c, u += t * m.ny * m.c;
	}
	const y = l * h - c * c;
	if (y <= 1e-12 * (l + h) * (l + h)) return null;
	const d = (h * f - c * u) / y, p = (l * u - c * f) / y;
	if (!Number.isFinite(d) || !Number.isFinite(p) || Math.hypot(d - n, p - e) > 1.5) return null;
	const [g] = ru(l, c, h);
	return {
		x: d,
		y: p,
		sigma: Math.min(Math.max(Math.sqrt(1 / Math.max(g, 1e-12)), .02), 2)
	};
}
function su(t, n) {
	return t.points[2 * n];
}
function iu(t, n) {
	return t.points[2 * n + 1];
}
function au(t) {
	const n = t.points;
	let e = 0;
	for (let r = 2; r < n.length; r += 2) e += Math.hypot(n[r] - n[r - 2], n[r + 1] - n[r - 1]);
	return e;
}
function lu(t, n, e, r) {
	return Math.abs(Math.atan2(t * r - n * e, t * e + n * r));
}
function cu(t, n, e, r) {
	if (n.length < 3) return null;
	const o = [], s = [], i = [];
	for (const A of n) {
		const n = t.edges[A >> 1], e = !(1 & A), r = n.points.length >> 1;
		if (r < 2) continue;
		const a = Math.min(3, r - 1), l = e ? 0 : r - 1, c = e ? a : r - 1 - a, h = su(n, c) - su(n, l), f = iu(n, c) - iu(n, l), u = Math.hypot(h, f);
		u > 1e-9 && (o.push(A), s.push(h / u), i.push(f / u));
	}
	const a = o.length;
	if (a < 3) return null;
	let l = 0, c = 0, h = 1;
	for (let A = 0; A < a; A++) for (let t = A + 1; t < a; t++) {
		const n = lu(s[A], i[A], s[t], i[t]);
		n > l && (l = n, c = A, h = t);
	}
	const f = s[c], u = i[c];
	let y = -1;
	for (let A = 0; A < a; A++) {
		if (A === c || A === h) continue;
		const t = lu(f, u, s[A], i[A]) * (180 / Math.PI);
		Math.min(t, 180 - t) <= 55 && (y = o[A]);
	}
	if (y < 0) return null;
	const d = -u, p = f, g = t.edges[y >> 1], m = g.points.length >> 1, x = new Float64Array(2 * m);
	for (let A = 0; A < m; A++) {
		const t = su(g, A) - e, n = iu(g, A) - r;
		x[2 * A] = t * f + n * u, x[2 * A + 1] = Math.abs(t * d + n * p);
	}
	const M = function(t) {
		const n = [], e = [];
		for (let M = 0; M + 1 < t.length; M += 2) {
			const r = t[M + 1];
			r > .05 && r < 6 && (n.push(t[M]), e.push(r));
		}
		const r = n.length;
		if (r < 4) return null;
		let o = 0;
		const s = (t) => {
			let s = 0, i = 0;
			for (let o = 0; o < r; o++) {
				const r = n[o] - t, a = e[o];
				s += (r * r + a * a) * a, i += a * a;
			}
			const a = s / (2 * i);
			let l = 0;
			for (let o = 0; o < r; o++) {
				const r = e[o], s = (n[o] - t) * (n[o] - t) + r * r - 2 * a * r;
				l += s * s;
			}
			return o = a, l;
		};
		let i = Number.MAX_VALUE, a = -Number.MAX_VALUE;
		for (let M = 0; M < r; M++) i = Math.min(i, n[M]), a = Math.max(a, n[M]);
		const l = Math.max(a - i, 1), c = i - 3 * l, h = a + 3 * l;
		let f = Number.MAX_VALUE, u = c, y = 0;
		for (let M = 0; M <= tu; M++) {
			const t = c + M / tu * (h - c), n = s(t);
			Number.isFinite(n) && n < f && (f = n, u = t, y = o);
		}
		let d = (h - c) / tu;
		for (let M = 0; M < 50; M++) {
			d *= .5;
			const t = u - d, n = u + d;
			for (const e of [t, n]) {
				const t = s(e);
				Number.isFinite(t) && t < f && (f = t, u = e, y = o);
			}
		}
		if (!Number.isFinite(u) || !Number.isFinite(y) || y <= .5) return null;
		const p = Math.sqrt(f / r) / (2 * y);
		if (p > .15) return null;
		const g = Math.max(.001 * l, 1e-4), m = (s(u + g) - 2 * f + s(u - g)) / (g * g), x = f / Math.max(r - 2, 1);
		return {
			vanish: u,
			sigma: m > 1e-12 ? Math.sqrt(2 * x / m) : Number.POSITIVE_INFINITY,
			impliedRadius: y,
			used: r,
			tangencyDefect: p
		};
	}(x);
	if (null === M) return null;
	let w = Number.POSITIVE_INFINITY;
	for (const A of n) w = Math.min(w, au(t.edges[A >> 1]));
	const b = Math.abs(M.vanish);
	return b > 8 || M.sigma > 1 || b > .35 * w ? null : {
		x: e + f * M.vanish,
		y: r + u * M.vanish,
		sigma: Math.min(Math.max(M.sigma, .05), 1)
	};
}
function hu(t, n, e) {
	const r = (t.points.length >> 1) - (e - n), o = new Float64Array(2 * r), s = new Float64Array(r), i = new Uint8Array(r);
	o.set(t.points.subarray(0, 2 * n)), o.set(t.points.subarray(2 * e), 2 * n), s.set(t.sigma.subarray(0, n)), s.set(t.sigma.subarray(e), n), i.set(t.fixed.subarray(0, n)), i.set(t.fixed.subarray(e), n), t.points = o, t.sigma = s, t.fixed = i;
}
function fu(t, n, e, r, o, s) {
	const i = Math.hypot(o - e, s - r);
	if (i < 1e-9) return;
	const a = (o - e) / i, l = (s - r) / i;
	for (const c of n) {
		const n = t.edges[c >> 1], e = !(1 & c), r = n.points.length >> 1;
		if (r < 4) continue;
		const i = Math.min(3, r - 1), h = e ? i : r - 1 - i, f = e ? 0 : r - 1;
		if ((su(n, h) - su(n, f)) * a + (iu(n, h) - iu(n, f)) * l <= 0) continue;
		let u = 0;
		for (; r - u > 4;) {
			const t = e ? u + 1 : r - 2 - u;
			if (!((su(n, t) - o) * a + (iu(n, t) - s) * l < 0)) break;
			u++;
		}
		0 !== u && (e ? hu(n, 1, 1 + u) : hu(n, r - 1 - u, r - 1));
	}
}
function uu(t, n, e, r) {
	const { width: o, height: s } = t, i = 0 === n || n === o ? n : r.x, a = 0 === e || e === s ? e : r.y;
	return i < 0 || i > o || a < 0 || a > s ? null : {
		x: i,
		y: a,
		sigma: r.sigma
	};
}
var yu = class {
	next;
	finit;
	ginit;
	gtest;
	stage1 = !0;
	iv;
	stmin = 0;
	stmax;
	width;
	width1;
	stpmin = 0;
	stpmax;
	count = 0;
	bestTrial = void 0;
	constructor(t, n, e, r) {
		const o = gu(mu(e, r), 0);
		this.next = o, this.finit = t, this.ginit = n, this.gtest = 1e-4 * n, this.iv = {
			stx: 0,
			fx: t,
			dx: n,
			sty: 0,
			fy: t,
			dy: n,
			brackt: !1
		}, this.stmax = o + 4 * o, this.width = r, this.width1 = 2 * r, this.stpmax = r;
	}
	get stp() {
		return this.next;
	}
	get best() {
		return this.bestTrial;
	}
	get evals() {
		return this.count;
	}
	update(t, n) {
		this.count++;
		const e = this.next, r = this.finit + e * this.gtest;
		Number.isFinite(t) || (t = 1 / 0), Number.isFinite(n) || (n = 0), t <= r && (void 0 === this.bestTrial || t < this.bestTrial.value) && (this.bestTrial = {
			step: e,
			value: t
		}), this.stage1 && t <= r && n >= 0 && (this.stage1 = !1);
		const o = this.iv;
		if (o.brackt && (e <= this.stmin || e >= this.stmax)) return "stop";
		if (o.brackt && this.stmax - this.stmin <= .1 * this.stmax) return "stop";
		if (e >= this.stpmax && t <= r && n <= this.gtest) return "stop";
		if (e <= this.stpmin && (t > r || n >= this.gtest)) return "stop";
		if (t <= r && Math.abs(n) <= .9 * -this.ginit) return "converged";
		if (this.count >= 10) return "stop";
		let s;
		if (this.stage1 && t <= o.fx && t > r) {
			const r = this.gtest;
			o.fx -= o.stx * r, o.fy -= o.sty * r, o.dx -= r, o.dy -= r, s = du(o, e, t - e * r, n - r, this.stmin, this.stmax), o.fx += o.stx * r, o.fy += o.sty * r, o.dx += r, o.dy += r;
		} else s = du(o, e, t, n, this.stmin, this.stmax);
		return o.brackt && (Math.abs(o.sty - o.stx) >= .66 * this.width1 && (s = o.stx + .5 * (o.sty - o.stx)), this.width1 = this.width, this.width = Math.abs(o.sty - o.stx)), o.brackt ? (this.stmin = Math.min(o.stx, o.sty), this.stmax = Math.max(o.stx, o.sty)) : (this.stmin = s + 1.1 * (s - o.stx), this.stmax = s + 4 * (s - o.stx)), s = mu(gu(s, this.stpmin), this.stpmax), this.next = s, o.brackt && (s <= this.stmin || s >= this.stmax) || o.brackt && this.stmax - this.stmin <= .1 * this.stmax ? "stop" : "eval";
	}
};
function du(t, n, e, r, o, s) {
	const { stx: i, fx: a, dx: l } = t, c = r * (l / Math.abs(l));
	let h = function(t, n, e, r, o, s) {
		const { stx: i, fx: a, dx: l, sty: c, fy: h, dy: f, brackt: u } = t, y = r * (l / Math.abs(l));
		if (e > a) {
			const t = 3 * (a - e) / (n - i) + l + r, o = pu(t, l, r), s = n < i ? -o : o, c = i + (s - l + t) / (s - l + s + r) * (n - i), h = i + l / ((a - e) / (n - i) + l) / 2 * (n - i);
			return Math.abs(c - i) < Math.abs(h - i) ? c : c + (h - c) / 2;
		}
		if (y < 0) {
			const t = 3 * (a - e) / (n - i) + l + r, o = pu(t, l, r), s = n > i ? -o : o, c = n + (s - r + t) / (s - r + s + l) * (i - n), h = n + r / (r - l) * (i - n);
			return Math.abs(c - n) > Math.abs(h - n) ? c : h;
		}
		if (Math.abs(r) < Math.abs(l)) {
			const t = 3 * (a - e) / (n - i) + l + r, h = pu(t, l, r), f = n > i ? -h : h, y = (f - r + t) / (f + (l - r) + f);
			let d;
			d = y < 0 && 0 !== f ? n + y * (i - n) : n > i ? s : o;
			const p = n + r / (r - l) * (i - n);
			if (u) {
				const t = Math.abs(d - n) < Math.abs(p - n) ? d : p, e = n + .66 * (c - n);
				return n > i ? mu(t, e) : gu(t, e);
			}
			return gu(mu(Math.abs(d - n) > Math.abs(p - n) ? d : p, s), o);
		}
		if (u) {
			const t = 3 * (e - h) / (c - n) + r + f, o = pu(t, r, f), s = n > c ? -o : o;
			return n + (s - r + t) / (s - r + s + f) * (c - n);
		}
		return n > i ? s : o;
	}(t, n, e, r, o, s);
	const f = t.brackt || e > a || c < 0;
	return e > a ? (t.sty = n, t.fy = e, t.dy = r) : (c < 0 && (t.sty = i, t.fy = a, t.dy = l), t.stx = n, t.fx = e, t.dx = r), t.brackt = f, Number.isFinite(h) || (h = f ? .5 * (t.stx + t.sty) : s), h;
}
function pu(t, n, e) {
	const r = gu(gu(Math.abs(t), Math.abs(n)), Math.abs(e)), o = t / r, s = o * o - n / r * (e / r);
	return r * Math.sqrt(s > 0 ? s : 0);
}
function gu(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t > n ? t : n;
}
function mu(t, n) {
	return Number.isNaN(t) ? n : Number.isNaN(n) || t < n ? t : n;
}
function xu(t, n, e) {
	let r = n.evaluate(t, e, n.x, n.g);
	const o = r, s = [];
	let i = Uu(n.x.length), a = 0;
	for (let l = 0; l < t.maxIters && !(t.budget <= 0); l++) {
		const o = vu(n.start, n.x, n.g, t.maxTotal);
		if (o <= 1e-6 * t.scalePg) break;
		const c = wu(n.g, s, n.start, n.x, n.dir, t.maxTotal), h = Su(n.dir);
		if (!(h >= 1e-12 && c < 0)) break;
		const f = t.maxStep / h, u = 0 === l ? f : Math.min(f, 1), y = n.search(t, e, r, c, u, f);
		if (void 0 === y) break;
		const d = (r - y.energy) / t.scaleF;
		void 0 !== t.onStep && t.onStep({
			part: e,
			iter: l,
			step: y.step,
			trials: y.trials,
			energy: y.energy,
			rel: d,
			moved: Pu(n.x, n.trial),
			pg: o
		});
		const p = Au(n.x, n.trial, n.g, n.tg, i);
		if (n.accept(), r = y.energy, a = l + 1, t.budget--, d < 1e-7) break;
		if (p) {
			const t = 3 === s.length ? s.shift() : void 0;
			s.push(i), i = t ?? Uu(n.x.length);
		}
	}
	return n.scatter(t.pos), {
		before: o,
		after: r,
		iters: a
	};
}
var Mu = class {
	ids;
	start;
	pin;
	x;
	g;
	dir;
	trial;
	tg;
	bestX;
	bestG;
	constructor(t, n, e, r) {
		const o = t.length;
		this.ids = t, this.start = new Float64Array(2 * o), this.pin = new Uint8Array(o), this.x = new Float64Array(2 * o);
		for (let s = 0; s < o; s++) {
			const o = t[s];
			this.start[2 * s] = n[2 * o], this.start[2 * s + 1] = n[2 * o + 1], this.x[2 * s] = r[2 * o], this.x[2 * s + 1] = r[2 * o + 1], this.pin[s] = e[o];
		}
		this.g = new Float64Array(2 * o), this.dir = new Float64Array(2 * o), this.trial = this.x.slice(), this.tg = new Float64Array(2 * o), this.bestX = this.x.slice(), this.bestG = new Float64Array(2 * o);
	}
	evaluate(t, n, e, r) {
		const { ids: o, pin: s } = this, { pos: i, gfull: a } = t;
		for (let c = 0; c < o.length; c++) {
			const t = o[c];
			i[2 * t] = e[2 * c], i[2 * t + 1] = e[2 * c + 1];
		}
		const l = t.objective(i, a, n);
		t.evals++;
		for (let c = 0; c < o.length; c++) {
			const t = o[c];
			r[2 * c] = 1 & s[c] ? 0 : a[2 * t], r[2 * c + 1] = 2 & s[c] ? 0 : a[2 * t + 1];
		}
		return l;
	}
	search(t, n, e, r, o, s) {
		const i = new yu(e, r, o, s);
		let a, l, c, h = NaN;
		do {
			a = i.stp, Iu(this.start, this.pin, this.x, this.dir, a, t.maxTotal, this.trial), l = this.evaluate(t, n, this.trial, this.tg);
			const e = Fu(this.start, this.x, this.dir, a, this.tg, t.maxTotal);
			c = i.update(l, e);
			const r = i.best;
			void 0 !== r && r.step === a && h !== a && (h = a, this.bestX.set(this.trial), this.bestG.set(this.tg));
		} while ("eval" === c);
		if ("converged" === c) return {
			energy: l,
			step: a,
			trials: i.evals
		};
		const f = i.best;
		return void 0 !== f ? (f.step !== a && (this.trial.set(this.bestX), this.tg.set(this.bestG)), {
			energy: f.value,
			step: f.step,
			trials: i.evals
		}) : void 0;
	}
	accept() {
		const t = this.x;
		this.x = this.trial, this.trial = t;
		const n = this.g;
		this.g = this.tg, this.tg = n;
	}
	scatter(t) {
		const { ids: n, x: e } = this;
		for (let r = 0; r < n.length; r++) {
			const o = n[r];
			t[2 * o] = e[2 * r], t[2 * o + 1] = e[2 * r + 1];
		}
	}
};
function wu(t, n, e, r, o, s) {
	bu(t, n, o), ku(e, r, o, s);
	let i = Nu(t, o);
	return i >= 0 && (n.length = 0, bu(t, n, o), ku(e, r, o, s), i = Nu(t, o)), i;
}
function bu(t, n, e) {
	const r = n.length, o = t.length, s = new Float64Array(r);
	e.set(t);
	for (let a = r - 1; a >= 0; a--) {
		const { s: t, y: r, rho: i } = n[a], l = i * Nu(t, e);
		s[a] = l;
		for (let n = 0; n < o; n++) e[n] -= l * r[n];
	}
	let i = 1;
	if (r > 0) {
		const { s: t, y: e } = n[r - 1], o = Nu(e, e);
		i = Nu(t, e) / (o > 1e-300 ? o : 1e-300);
	}
	for (let a = 0; a < o; a++) e[a] *= i;
	for (let a = 0; a < r; a++) {
		const { s: t, y: r, rho: i } = n[a], l = i * Nu(r, e), c = s[a] - l;
		for (let n = 0; n < o; n++) e[n] += c * t[n];
	}
	for (let a = 0; a < o; a++) e[a] = -e[a];
}
function Au(t, n, e, r, o) {
	const { s, y: i } = o;
	for (let l = 0; l < t.length; l++) s[l] = n[l] - t[l], i[l] = r[l] - e[l];
	const a = Nu(i, s);
	return a > 1e-12 * Math.sqrt(Nu(i, i)) * Math.sqrt(Nu(s, s)) && (o.rho = 1 / a, !0);
}
function ku(t, n, e, r) {
	const o = .999999999 * r;
	for (let s = 0; s < n.length; s += 2) {
		const r = n[s] - t[s], i = n[s + 1] - t[s + 1], a = Math.sqrt(r * r + i * i);
		if (a < o) continue;
		const l = r / a, c = i / a, h = l * e[s] + c * e[s + 1];
		h > 0 && (e[s] -= h * l, e[s + 1] -= h * c);
	}
}
function vu(t, n, e, r) {
	const o = .999999999 * r;
	let s = 0;
	for (let i = 0; i < n.length; i += 2) {
		let r = e[i], a = e[i + 1];
		const l = n[i] - t[i], c = n[i + 1] - t[i + 1], h = Math.sqrt(l * l + c * c);
		if (h >= o) {
			const t = l / h, n = c / h, e = r * t + a * n;
			e < 0 && (r -= e * t, a -= e * n);
		}
		const f = Math.sqrt(r * r + a * a);
		f > s && (s = f);
	}
	return s;
}
function Fu(t, n, e, r, o, s) {
	let i = 0;
	for (let a = 0; a < n.length; a += 2) {
		const l = n[a] + e[a] * r - t[a], c = n[a + 1] + e[a + 1] * r - t[a + 1], h = Math.sqrt(l * l + c * c);
		let f = e[a], u = e[a + 1];
		if (h > s) {
			const t = l / h, n = c / h, e = t * f + n * u, r = s / h;
			f = r * (f - e * t), u = r * (u - e * n);
		}
		i += o[a] * f + o[a + 1] * u;
	}
	return i;
}
function Iu(t, n, e, r, o, s, i) {
	for (let a = 0, l = 0; a < e.length; a += 2, l++) {
		let c = e[a] + r[a] * o, h = e[a + 1] + r[a + 1] * o;
		const f = c - t[a], u = h - t[a + 1], y = Math.sqrt(f * f + u * u);
		if (y > s) {
			const n = s / y;
			c = t[a] + f * n, h = t[a + 1] + u * n;
		}
		1 & n[l] && (c = t[a]), 2 & n[l] && (h = t[a + 1]), i[a] = c, i[a + 1] = h;
	}
}
function Nu(t, n) {
	let e = 0;
	for (let r = 0; r < t.length; r += 2) e += t[r] * n[r] + t[r + 1] * n[r + 1];
	return e;
}
function Su(t) {
	let n = 0;
	for (let e = 0; e < t.length; e += 2) {
		const r = Math.sqrt(t[e] * t[e] + t[e + 1] * t[e + 1]);
		r > n && (n = r);
	}
	return n;
}
function Pu(t, n) {
	let e = 0;
	for (let r = 0; r < t.length; r += 2) {
		const o = t[r] - n[r], s = t[r + 1] - n[r + 1], i = Math.sqrt(o * o + s * s);
		i > e && (e = i);
	}
	return e;
}
function Cu(t) {
	const n = new Uint32Array(t);
	for (let e = 0; e < t; e++) n[e] = e;
	return n;
}
function Uu(t) {
	return {
		s: new Float64Array(t),
		y: new Float64Array(t),
		rho: 0
	};
}
function Lu(t) {
	return t >= .5 ? Math.floor(t) : 0 - Math.floor(1 - t);
}
var $u = class {
	count = 0;
	t = /* @__PURE__ */ new Float64Array(16);
	kind = /* @__PURE__ */ new Uint8Array(16);
	line = /* @__PURE__ */ new Float64Array(16);
	vt = /* @__PURE__ */ new Float64Array(8);
	vl = /* @__PURE__ */ new Float64Array(8);
	ht = /* @__PURE__ */ new Float64Array(8);
	hl = /* @__PURE__ */ new Float64Array(8);
	reserve(t) {
		if (t <= this.vt.length) return;
		let n = this.vt.length;
		for (; n < t;) n *= 2;
		this.vt = new Float64Array(n), this.vl = new Float64Array(n), this.ht = new Float64Array(n), this.hl = new Float64Array(n), this.t = new Float64Array(2 * n), this.kind = new Uint8Array(2 * n), this.line = new Float64Array(2 * n);
	}
};
function qu(t, n) {
	return Math.abs(n - t) > 1e-12 && (e = Math.min(t, n), r = Math.max(t, n), e > -1e9 && r < 1e9 && r - e < 1048576);
	var e, r;
}
function Ru(t, n) {
	return qu(t, n) ? Math.ceil(Math.abs(n - t)) : 0;
}
function zu(t, n, e, r) {
	if (!qu(t, n)) return 0;
	const o = n - t, s = t < n ? t : n, i = t < n ? n : t;
	let a = 0;
	for (let l = Math.ceil(s); l < i; l += 1) {
		const n = (l - t) / o;
		n > 1e-9 && n < 1 - 1e-9 && (e[a] = n, r[a] = l, a++);
	}
	return a;
}
function Tu(t, n) {
	return Math.max(33554432, 4 * t * n);
}
function Eu(t, n) {
	return 4 * n * t + (t + 1) * (n * (n + 1) / 2 + n + 1);
}
var ju = class {
	count = 0;
	edge = /* @__PURE__ */ new Int32Array(0);
	left = /* @__PURE__ */ new Int32Array(0);
	right = /* @__PURE__ */ new Int32Array(0);
	va = /* @__PURE__ */ new Int32Array(0);
	vb = /* @__PURE__ */ new Int32Array(0);
	fx = /* @__PURE__ */ new Float64Array(0);
	fy = /* @__PURE__ */ new Float64Array(0);
	tx = /* @__PURE__ */ new Float64Array(0);
	ty = /* @__PURE__ */ new Float64Array(0);
	fkind = /* @__PURE__ */ new Uint8Array(0);
	tkind = /* @__PURE__ */ new Uint8Array(0);
	fline = /* @__PURE__ */ new Float64Array(0);
	tline = /* @__PURE__ */ new Float64Array(0);
	next = /* @__PURE__ */ new Int32Array(0);
	constructor(t) {
		this.grow(t);
	}
	grow(t) {
		const n = this.count, e = (e) => {
			const r = new Int32Array(t);
			return r.set(e.subarray(0, n)), r;
		}, r = (e) => {
			const r = new Float64Array(t);
			return r.set(e.subarray(0, n)), r;
		}, o = (e) => {
			const r = new Uint8Array(t);
			return r.set(e.subarray(0, n)), r;
		};
		this.edge = e(this.edge), this.left = e(this.left), this.right = e(this.right), this.va = e(this.va), this.vb = e(this.vb), this.fx = r(this.fx), this.fy = r(this.fy), this.tx = r(this.tx), this.ty = r(this.ty), this.fkind = o(this.fkind), this.tkind = o(this.tkind), this.fline = r(this.fline), this.tline = r(this.tline), this.next = e(this.next);
	}
}, Bu = class {
	map;
	unknowns;
	image;
	fills;
	width;
	height;
	wKink = 1;
	wAnchor = 0;
	band = null;
	cutResidual = 0;
	restResidual = 0;
	active = null;
	pieces = new ju(4096);
	head;
	vhead;
	touched = /* @__PURE__ */ new Int32Array(1024);
	touchedCount = 0;
	vrows;
	vrowCount = 0;
	cross = new $u();
	carry = /* @__PURE__ */ new Float64Array(0);
	cov = /* @__PURE__ */ new Float64Array(0);
	suf = /* @__PURE__ */ new Float64Array(0);
	g = /* @__PURE__ */ new Float64Array(0);
	kap = /* @__PURE__ */ new Float64Array(0);
	segs = /* @__PURE__ */ new Int32Array(0);
	pieceG = /* @__PURE__ */ new Float64Array(0);
	runCut = 0;
	constructor(t, n, e, r) {
		const o = t.width, s = t.height;
		if (e.width !== o || e.height !== s || e.data.length < 4 * o * s) throw new RangeError("BandProblem: the image must have the map size and four channels");
		for (const i of t.edges) if (i.left >= r.length || i.right >= r.length) throw new RangeError("BandProblem: a face of the map has no fill");
		this.map = t, this.unknowns = n, this.image = e, this.fills = r, this.width = o, this.height = s, this.head = new Int32Array(o * s).fill(-1), this.vhead = new Int32Array(s).fill(-1), this.vrows = new Int32Array(s);
	}
	bucket(t) {
		const { head: n, vhead: e } = this;
		for (let i = 0; i < this.touchedCount; i++) n[this.touched[i]] = -1;
		this.touchedCount = 0;
		for (let i = 0; i < this.vrowCount; i++) e[this.vrows[i]] = -1;
		this.vrowCount = 0, this.pieces.count = 0;
		const r = this.map.edges, o = this.active, s = null === o ? r.length : o.edges.length;
		for (let i = 0; i < s; i++) {
			const n = null === o ? i : o.edges[i], e = r[n], s = this.unknowns.of[n], a = s.length;
			if (a < 2) continue;
			const l = e.closed ? a : a - 1;
			for (let r = 0; r < l; r++) this.cutSegment(n, s[r], r + 1 === a ? s[0] : s[r + 1], e.left, e.right, t);
		}
		this.touched.subarray(0, this.touchedCount).sort(), this.vrows.subarray(0, this.vrowCount).sort();
	}
	cutSegment(t, n, e, r, o, s) {
		const i = s[2 * n], a = s[2 * n + 1], l = s[2 * e], c = s[2 * e + 1], h = this.cross, f = function(t, n, e, r, o) {
			o.reserve(Math.max(Ru(t, e), Ru(n, r)) + 2);
			const { vt: s, vl: i, ht: a, hl: l } = o, c = zu(t, e, s, i), h = zu(n, r, a, l), f = e - t > 0, u = r - n > 0;
			let y = 0, d = 0, p = 0;
			for (; y < c || d < h;) {
				const t = f ? y : c - 1 - y, n = u ? d : h - 1 - d;
				d >= h || y < c && s[t] <= a[n] ? (o.t[p] = s[t], o.kind[p] = 1, o.line[p] = i[t], y++) : (o.t[p] = a[n], o.kind[p] = 2, o.line[p] = l[n], d++), p++;
			}
			return o.count = p, p;
		}(i, a, l, c, h);
		let u = 0, y = i, d = a, p = 0, g = 0;
		for (let m = 0; m <= f; m++) {
			let s, x, M, w, b;
			if (m === f ? (s = 1, x = l, M = c, w = 0, b = 0) : (s = h.t[m], w = h.kind[m], b = h.line[m], 1 === w ? (x = b, M = a + (c - a) * s) : (x = i + (l - i) * s, M = b)), s - u > 1e-9) {
				const h = .5 * (u + s), f = Lu(i + (l - i) * h), m = Lu(a + (c - a) * h);
				this.file(t, n, e, r, o, y, d, x, M, p, g, w, b, f, m);
			}
			u = s, y = x, d = M, p = w, g = b;
		}
	}
	file(t, n, e, r, o, s, i, a, l, c, h, f, u, y, d) {
		const p = this.width;
		if (d < 0 || d >= this.height || y >= p) return;
		const g = d, m = this.pieces;
		m.count === m.edge.length && m.grow(2 * m.edge.length);
		const x = m.count++;
		if (m.edge[x] = t, m.left[x] = r, m.right[x] = o, m.va[x] = n, m.vb[x] = e, m.fx[x] = s, m.fy[x] = i, m.tx[x] = a, m.ty[x] = l, m.fkind[x] = c, m.fline[x] = h, m.tkind[x] = f, m.tline[x] = u, y < 0) return this.vhead[g] < 0 && (this.vrows[this.vrowCount++] = g), m.next[x] = this.vhead[g], void (this.vhead[g] = x);
		const M = g * p + (null === this.band ? y : this.nearestInBand(g, y));
		if (this.head[M] < 0) {
			if (this.touchedCount === this.touched.length) {
				const t = new Int32Array(2 * this.touched.length);
				t.set(this.touched), this.touched = t;
			}
			this.touched[this.touchedCount++] = M;
		}
		m.next[x] = this.head[M], this.head[M] = x;
	}
	nearestInBand(t, n) {
		const e = this.band.inBand, r = this.width, o = t * r;
		if (e[o + n]) return n;
		for (let s = 1; s < 4; s++) {
			if (n >= s && e[o + n - s]) return n - s;
			if (n + s < r && e[o + n + s]) return n + s;
		}
		return n;
	}
	energy(t, n) {
		this.bucket(t);
		const e = this.active;
		if (null !== n) if (null === e) n.fill(0, 0, 2 * this.unknowns.count);
		else for (let o = 0; o < e.vars.length; o++) {
			const t = e.vars[o];
			n[2 * t] = 0, n[2 * t + 1] = 0;
		}
		const r = this.bandData(t, n) + this.priors(t, n);
		if (null !== n) {
			const t = this.unknowns.pin, r = null === e ? this.unknowns.count : e.vars.length;
			for (let o = 0; o < r; o++) {
				const r = null === e ? o : e.vars[o];
				1 & t[r] && (n[2 * r] = 0), 2 & t[r] && (n[2 * r + 1] = 0);
			}
		}
		return r;
	}
	priors(t, n) {
		const e = this.active, { of: r, start: o, junction: s } = this.unknowns, i = this.map.edges, a = this.wKink;
		let l = 0;
		const c = null === e ? i.length : e.edges.length;
		for (let f = 0; f < c; f++) {
			const o = null === e ? f : e.edges[f], s = r[o], c = s.length;
			if (c < 3) continue;
			const h = i[o].closed, u = h ? c : c - 1;
			for (let e = h ? 0 : 1; e < u; e++) {
				const r = s[(e + c - 1) % c], o = s[e], i = s[(e + 1) % c], h = t[2 * r] - 2 * t[2 * o] + t[2 * i], f = t[2 * r + 1] - 2 * t[2 * o + 1] + t[2 * i + 1], u = Math.sqrt(h * h + f * f + 1e-4);
				if (l += a * u, null !== n) {
					const t = a / u;
					n[2 * r] += t * h, n[2 * r + 1] += t * f, n[2 * o] -= 2 * t * h, n[2 * o + 1] -= 2 * t * f, n[2 * i] += t * h, n[2 * i + 1] += t * f;
				}
			}
		}
		const h = null === e ? this.unknowns.count : e.vars.length;
		for (let f = 0; f < h; f++) {
			const r = null === e ? f : e.vars[f], i = s[r] ? 4 * this.wAnchor : this.wAnchor, a = t[2 * r] - o[2 * r], c = t[2 * r + 1] - o[2 * r + 1];
			l += i * (a * a + c * c), null !== n && (n[2 * r] += 2 * i * a, n[2 * r + 1] += 2 * i * c);
		}
		return l;
	}
	bandData(t, n) {
		return this.bandDataWith(t, n, !1);
	}
	bandDataCells(t, n) {
		return this.bandDataWith(t, n, !0);
	}
	bandDataWith(t, n, e) {
		const r = this.band, o = this.active, s = null !== n;
		if (s) {
			const t = 4 * this.pieces.count;
			this.pieceG.length < t && (this.pieceG = new Float64Array(Math.max(t, 2 * this.pieceG.length))), this.pieceG.fill(0, 0, t);
		}
		let i = 0;
		const a = null === o ? r.runCount : o.runs.length;
		for (let l = 0; l < a; l++) {
			const t = null === o ? l : o.runs[l];
			i += e ? this.runEnergyCells(t, s) : this.runEnergy(t, s);
		}
		return null !== n && this.scatterAll(t, n), i;
	}
	scatterAll(t, n) {
		for (let e = 0; e < this.vrowCount; e++) for (let r = this.vhead[this.vrows[e]]; r >= 0; r = this.pieces.next[r]) this.scatterPiece(r, t, n);
		for (let e = 0; e < this.touchedCount; e++) for (let r = this.head[this.touched[e]]; r >= 0; r = this.pieces.next[r]) this.scatterPiece(r, t, n);
	}
	scatterPiece(t, n, e) {
		const r = this.pieceG, o = this.pieces, s = 4 * t;
		0 === r[s] && 0 === r[s + 1] || Ku(o.fkind[t], o.fline[t], o.va[t], o.vb[t], o.va[t], r[s], r[s + 1], n, e), 0 === r[s + 2] && 0 === r[s + 3] || Ku(o.tkind[t], o.tline[t], o.va[t], o.vb[t], o.vb[t], r[s + 2], r[s + 3], n, e);
	}
	slot(t, n, e) {
		const r = this.band.faces;
		for (let o = 0; o < n; o++) if (r[t + o] === e) return o;
		return 0;
	}
	startRun(t) {
		const n = this.band, e = n.nf[t], r = n.fstart[t], o = this.carry;
		o.fill(0, 0, e), o[0] = 1, this.runCut = 0;
		const s = 0 === n.x0[t] ? this.vhead[n.y[t]] : -1, i = this.pieces;
		for (let a = s; a >= 0; a = i.next[a]) {
			const t = i.ty[a] - i.fy[a];
			o[this.slot(r, e, i.left[a])] += t, o[this.slot(r, e, i.right[a])] -= t;
		}
		return s;
	}
	deposit(t, n, e, r) {
		const { carry: o, cov: s } = this, i = this.pieces;
		for (let a = 0; a < n; a++) s[a] = o[a];
		for (let a = this.head[e]; a >= 0; a = i.next[a]) {
			const e = i.ty[a] - i.fy[a], l = e * (r - .5 * (i.fx[a] + i.tx[a])), c = this.slot(t, n, i.left[a]), h = this.slot(t, n, i.right[a]);
			s[c] += l, s[h] -= l, o[c] += e, o[h] -= e;
		}
	}
	pixelEnergy(t, n, e, r) {
		const o = this.band, s = o.nf[t], i = o.weight[o.first[t] + n];
		if (0 === i) return null !== e && e.fill(0, r, r + s), 0;
		const a = 4 * (o.y[t] * this.width + o.x0[t] + n), l = this.image.data, c = o.colour, h = o.cstart[t] + 4 * n * s, f = this.cov;
		let u = -l[a], y = -l[a + 1], d = -l[a + 2], p = -l[a + 3];
		for (let m = 0; m < s; m++) {
			const t = f[m], n = h + 4 * m;
			u += t * c[n], y += t * c[n + 1], d += t * c[n + 2], p += t * c[n + 3];
		}
		const g = u * u + y * y + d * d + p * p;
		if (null !== e) for (let m = 0; m < s; m++) {
			const t = h + 4 * m, n = u * c[t] + y * c[t + 1] + d * c[t + 2] + p * c[t + 3];
			e[r + m] = 2 * i * n;
		}
		return i * g;
	}
	pieceGrads(t, n, e, r, o, s, i, a) {
		const l = this.pieces, c = this.pieceG;
		for (let h = this.head[e]; h >= 0; h = l.next[h]) {
			const e = this.slot(t, n, l.left[h]), f = this.slot(t, n, l.right[h]), u = o[s + e] - o[s + f], y = i[a + e] - i[a + f], d = l.ty[h] - l.fy[h], p = r - .5 * (l.fx[h] + l.tx[h]), g = -.5 * d * u, m = 4 * h;
			c[m] = g, c[m + 1] = -p * u - y, c[m + 2] = g, c[m + 3] = p * u + y;
		}
	}
	virtualGrads(t, n, e, r, o) {
		const s = this.pieces, i = this.pieceG;
		for (let a = e; a >= 0; a = s.next[a]) {
			const e = r[o + this.slot(t, n, s.left[a])] - r[o + this.slot(t, n, s.right[a])], l = 4 * a;
			i[l] = 0, i[l + 1] = -e, i[l + 2] = 0, i[l + 3] = e;
		}
	}
	runEnergy(t, n) {
		const e = this.band, r = e.x0[t], o = e.x1[t] - r + 1, s = e.nf[t], i = e.fstart[t], a = s * (s + 1) / 2 + s + 1, l = e.pstart[t], c = e.prefix, h = this.startRun(t), f = e.y[t] * this.width + r, u = this.head, { carry: y, segs: d, kap: p, g } = this;
		let m = 0, x = 0, M = 0, w = 0, b = 0;
		for (; b < o;) {
			if (u[f + b] < 0) {
				let t = b + 1;
				for (; t < o && u[f + t] < 0;) t++;
				if (m += Du(c, l + b * a, l + t * a, y, s), n) {
					d[3 * x] = b, d[3 * x + 1] = t, d[3 * x + 2] = w, x++;
					for (let t = 0; t < s; t++) p[w + t] = y[t];
					w += s;
				}
				b = t;
				continue;
			}
			this.deposit(i, s, f + b, r + b + 1), n && (d[3 * x] = b, d[3 * x + 1] = -1, d[3 * x + 2] = M, x++);
			const e = this.pixelEnergy(t, b, n ? g : null, M);
			n && (M += s), m += e, this.runCut += e, b++;
		}
		if (!n) return m;
		const A = this.suf;
		A.fill(0, 0, s);
		for (let k = x - 1; k >= 0; k--) {
			const t = d[3 * k], n = d[3 * k + 1], e = d[3 * k + 2];
			if (n >= 0) Hu(c, l + t * a, l + n * a, p, e, s, A);
			else {
				this.pieceGrads(i, s, f + t, r + t + 1, g, e, A, 0);
				for (let t = 0; t < s; t++) A[t] += g[e + t];
			}
		}
		return this.virtualGrads(i, s, h, A, 0), m;
	}
	runEnergyCells(t, n) {
		const e = this.band, r = e.x0[t], o = e.x1[t] - r + 1, s = e.nf[t], i = e.fstart[t], a = this.startRun(t), l = e.y[t] * this.width + r, c = new Float64Array(o * s);
		let h = 0;
		for (let u = 0; u < o; u++) this.deposit(i, s, l + u, r + u + 1), h += this.pixelEnergy(t, u, n ? c : null, u * s);
		if (!n) return h;
		const f = new Float64Array((o + 1) * s);
		for (let u = o - 1; u >= 0; u--) for (let t = 0; t < s; t++) f[u * s + t] = f[(u + 1) * s + t] + c[u * s + t];
		this.virtualGrads(i, s, a, f, 0);
		for (let u = 0; u < o; u++) this.pieceGrads(i, s, l + u, r + u + 1, c, u * s, f, (u + 1) * s);
		return h;
	}
	setup(t = Tu(this.width, this.height)) {
		const n = this.unknowns.start;
		this.band = null, this.active = null, this.bucket(n);
		const e = this.build(t);
		if (null === e) return !1;
		this.band = e, this.carry = new Float64Array(e.maxNf), this.cov = new Float64Array(e.maxNf), this.suf = new Float64Array(e.maxNf), this.g = new Float64Array(e.maxLen * e.maxNf), this.kap = new Float64Array(e.maxLen * e.maxNf), this.segs = new Int32Array(3 * e.maxLen);
		let r = 0, o = 0;
		for (let s = 0; s < e.runCount; s++) {
			const t = this.runEnergy(s, !1);
			r += this.runCut, o += t - this.runCut;
		}
		return this.cutResidual = r, this.restResidual = o, !0;
	}
	build(t) {
		const n = this.width, e = this.height, r = this.bandPixels(), o = [], s = [], i = [], a = [], l = [], c = [], h = [], f = [], u = [];
		let y = 0, d = 0, p = 0, g = 1, m = 1;
		const x = [], M = [];
		for (let A = 0; A < e; A++) {
			const e = this.rowSeed(A);
			x.length = 0, M.length = 0, x.push(e ?? -1), M.push(1), this.carryList(this.vhead[A], x, M);
			let w = 0;
			for (; w < n;) {
				if (!r[A * n + w]) {
					w++;
					continue;
				}
				const b = w;
				for (; w < n && r[A * n + w];) w++;
				const k = w - 1;
				let v, F;
				if (0 === b) v = e ?? -1, F = null !== e;
				else {
					let t = -1;
					for (let n = 0; n < M.length; n++) (t < 0 || M[n] >= M[t]) && (t = n);
					v = t < 0 ? -1 : x[t], F = t >= 0 && -1 !== x[t] && Math.abs(M[t] - 1) < 1e-6;
					for (let n = 0; F && n < M.length; n++) F = x[n] === x[t] || Math.abs(M[n]) < 1e-6;
				}
				const I = f.length;
				f.push(v), this.runFaces(A, b, k, f, I);
				const N = f.length - I, S = k - b + 1;
				if (N > g && (g = N), S > m && (m = S), p += Eu(S, N), p > t) return null;
				0 !== b && (x.length = 0, M.length = 0, x.push(v), M.push(1));
				for (let t = b; t <= k; t++) this.carryList(this.head[A * n + t], x, M);
				o.push(A), s.push(b), i.push(k), a.push(y), l.push(I), c.push(N), h.push(d), y += S, d += 4 * S * N;
				for (let t = 0; t < S; t++) u.push(F ? 1 : 0);
			}
		}
		const w = o.length, b = {
			runCount: w,
			y: Int32Array.from(o),
			x0: Int32Array.from(s),
			x1: Int32Array.from(i),
			first: Int32Array.from(a),
			fstart: Int32Array.from(l),
			nf: Int32Array.from(c),
			cstart: Int32Array.from(h),
			pstart: new Int32Array(w),
			faces: Int32Array.from(f),
			colour: new Float64Array(d),
			prefix: /* @__PURE__ */ new Float64Array(0),
			weight: Float64Array.from(u),
			cells: y,
			inBand: r,
			entries: p,
			maxNf: g,
			maxLen: m
		};
		return this.fillColours(b), {
			...b,
			prefix: this.fillPrefix(b)
		};
	}
	bandPixels() {
		const t = this.width, n = this.height, e = new Uint8Array(t * n), r = (r, o) => {
			const s = Math.max(o - 1, 0), i = Math.min(o + 1, n - 1), a = Math.max(r - 1, 0), l = Math.min(r + 1, t - 1);
			for (let n = s; n <= i; n++) for (let r = a; r <= l; r++) e[n * t + r] = 1;
		};
		for (let o = 0; o < this.touchedCount; o++) {
			const n = this.touched[o];
			r(n % t, Math.floor(n / t));
		}
		for (let o = 0; o < n; o++) this.vhead[o] >= 0 && r(-1, o);
		return e;
	}
	rowSeed(t) {
		const n = this.pieces;
		let e = !1, r = -1, o = 0;
		for (let s = this.vhead[t]; s >= 0; s = n.next[s]) {
			if (-1 === n.left[s] || -1 === n.right[s]) return -1;
			const t = n.ty[s] - n.fy[s];
			if (0 === t) continue;
			const i = .5 * (n.fx[s] + n.tx[s]);
			(!e || i < o) && (r = t > 0 ? n.right[s] : n.left[s], o = i, e = !0);
		}
		for (let s = 0; s < this.width; s++) {
			for (let i = this.head[t * this.width + s]; i >= 0; i = n.next[i]) {
				const t = n.ty[i] - n.fy[i];
				if (0 === t) continue;
				const s = .5 * (n.fx[i] + n.tx[i]);
				(!e || s < o) && (r = t > 0 ? n.right[i] : n.left[i], o = s, e = !0);
			}
			if (e) break;
		}
		return e ? r : null;
	}
	carryList(t, n, e) {
		const r = this.pieces;
		for (let o = t; o >= 0; o = r.next[o]) {
			const t = r.ty[o] - r.fy[o];
			Ou(n, e, r.left[o], t), Ou(n, e, r.right[o], -t);
		}
	}
	runFaces(t, n, e, r, o) {
		const s = this.width, i = this.pieces, a = (t) => {
			for (let n = t; n >= 0; n = i.next[n]) for (const t of [i.left[n], i.right[n]]) {
				let n = !1;
				for (let e = o; e < r.length && !n; e++) n = r[e] === t;
				n || r.push(t);
			}
		}, l = Math.max(t - 1, 0), c = Math.min(t + 1, this.height - 1);
		for (let h = l; h <= c; h++) {
			0 === n && a(this.vhead[h]);
			const t = Math.max(n - 1, 0), r = Math.min(e + 1, s - 1);
			for (let n = t; n <= r; n++) a(this.head[h * s + n]);
		}
	}
	fillColours(t) {
		const n = this.width, e = this.image.data, r = /* @__PURE__ */ new Float64Array(4), o = t.colour;
		let s = 0;
		for (let i = 0; i < t.runCount; i++) {
			const a = t.nf[i], l = t.fstart[i], c = t.y[i];
			for (let h = t.x0[i]; h <= t.x1[i]; h++) {
				const i = 4 * (c * n + h);
				for (let n = 0; n < a; n++) {
					const a = t.faces[l + n];
					if (a < 0) o[s] = e[i], o[s + 1] = e[i + 1], o[s + 2] = e[i + 2], o[s + 3] = e[i + 3];
					else {
						const t = this.fills[a];
						void 0 !== t.at ? (t.at(h + .5, c + .5, r), o[s] = r[0], o[s + 1] = r[1], o[s + 2] = r[2], o[s + 3] = r[3]) : (o[s] = t.r, o[s + 1] = t.g, o[s + 2] = t.b, o[s + 3] = t.a);
					}
					s += 4;
				}
			}
		}
	}
	fillPrefix(t) {
		let n = 0;
		for (let l = 0; l < t.runCount; l++) {
			const e = t.nf[l], r = e * (e + 1) / 2 + e + 1;
			n += (t.x1[l] - t.x0[l] + 2) * r;
		}
		const e = new Float64Array(n), r = this.image.data, o = t.colour, s = this.width, i = new Float64Array(t.maxNf * (t.maxNf + 1) / 2 + t.maxNf + 1);
		let a = 0;
		for (let l = 0; l < t.runCount; l++) {
			const n = t.nf[l], c = n * (n + 1) / 2 + n + 1;
			t.pstart[l] = a, i.fill(0, 0, c), a += c;
			const h = t.x1[l] - t.x0[l] + 1;
			for (let f = 0; f < h; f++) {
				const h = t.weight[t.first[l] + f], u = t.cstart[l] + 4 * f * n, y = 4 * (t.y[l] * s + t.x0[l] + f), d = r[y], p = r[y + 1], g = r[y + 2], m = r[y + 3];
				let x = 0;
				for (let t = 0; t < n; t++) {
					const e = u + 4 * t;
					for (let r = t; r < n; r++) {
						const t = u + 4 * r, n = o[e] * o[t] + o[e + 1] * o[t + 1] + o[e + 2] * o[t + 2] + o[e + 3] * o[t + 3];
						i[x] += h * n, x++;
					}
				}
				for (let t = 0; t < n; t++) {
					const n = u + 4 * t, e = o[n] * d + o[n + 1] * p + o[n + 2] * g + o[n + 3] * m;
					i[x + t] += h * e;
				}
				i[c - 1] += h * (d * d + p * p + g * g + m * m), e.set(i.subarray(0, c), a), a += c;
			}
		}
		return e;
	}
	components() {
		const t = this.band, n = this.width, e = this.height, r = this.map.edges.length, o = t.runCount, s = new Int32Array(r + o);
		for (let m = 0; m < s.length; m++) s[m] = m;
		const i = (t) => {
			for (; s[t] !== t;) s[t] = s[s[t]], t = s[t];
			return t;
		}, a = (t, n) => {
			const e = i(t), r = i(n);
			e !== r && (s[Math.max(e, r)] = Math.min(e, r));
		}, { of: l, count: c } = this.unknowns, h = new Int32Array(c).fill(-1);
		for (let m = 0; m < r; m++) {
			const t = l[m];
			for (let n = 0; n < t.length; n++) {
				const e = t[n];
				h[e] < 0 ? h[e] = m : a(h[e], m);
			}
		}
		const f = this.pieces;
		for (let m = 0; m < o; m++) {
			const o = r + m, s = t.y[m], i = Math.max(s - 1, 0), l = Math.min(s + 1, e - 1), c = Math.max(t.x0[m] - 1, 0), h = Math.min(t.x1[m] + 1, n - 1);
			for (let e = i; e <= l; e++) {
				if (0 === t.x0[m]) for (let t = this.vhead[e]; t >= 0; t = f.next[t]) a(o, f.edge[t]);
				for (let t = c; t <= h; t++) for (let r = this.head[e * n + t]; r >= 0; r = f.next[r]) a(o, f.edge[r]);
			}
		}
		const u = new Int32Array(r + o).fill(-1), y = [], d = [];
		for (let m = 0; m < r; m++) {
			const t = i(m);
			u[t] < 0 && (u[t] = y.length, y.push([]), d.push([])), y[u[t]].push(m);
		}
		for (let m = 0; m < o; m++) {
			const t = i(r + m);
			u[t] < 0 || d[u[t]].push(m);
		}
		const p = new Uint8Array(c), g = [];
		for (let m = 0; m < y.length; m++) {
			const t = [];
			for (const n of y[m]) {
				const e = l[n];
				for (let n = 0; n < e.length; n++) p[e[n]] || (p[e[n]] = 1, t.push(e[n]));
			}
			0 !== d[m].length && g.push({
				edges: Int32Array.from(y[m]),
				runs: Int32Array.from(d[m]),
				vars: Int32Array.from(t)
			});
		}
		return g;
	}
};
function Ou(t, n, e, r) {
	for (let o = 0; o < t.length; o++) if (t[o] === e) return void (n[o] += r);
	t.push(e), n.push(r);
}
function Ku(t, n, e, r, o, s, i, a, l) {
	if (0 === t) return l[2 * o] += s, void (l[2 * o + 1] += i);
	const c = a[2 * e], h = a[2 * e + 1], f = a[2 * r], u = a[2 * r + 1];
	if (1 === t) {
		const t = f - c;
		if (Math.abs(t) < 1e-9) return;
		const o = u - h, s = (n - c) / t;
		l[2 * e + 1] += i * (1 - s), l[2 * r + 1] += i * s, l[2 * e] += i * o * (s - 1) / t, l[2 * r] -= i * o * s / t;
		return;
	}
	const y = u - h;
	if (Math.abs(y) < 1e-9) return;
	const d = f - c, p = (n - h) / y;
	l[2 * e] += s * (1 - p), l[2 * r] += s * p, l[2 * e + 1] += s * d * (p - 1) / y, l[2 * r + 1] -= s * d * p / y;
}
function Du(t, n, e, r, o) {
	const s = o * (o + 1) / 2 + o + 1;
	let i = t[e + s - 1] - t[n + s - 1], a = 0;
	for (let l = 0; l < o; l++) for (let s = l; s < o; s++) i += (l === s ? 1 : 2) * r[l] * r[s] * (t[e + a] - t[n + a]), a++;
	for (let l = 0; l < o; l++) i -= 2 * r[l] * (t[e + a + l] - t[n + a + l]);
	return i;
}
function Hu(t, n, e, r, o, s, i) {
	let a = 0;
	for (let l = 0; l < s; l++) for (let c = l; c < s; c++) {
		const s = t[e + a] - t[n + a];
		i[l] += 2 * s * r[o + c], l !== c && (i[c] += 2 * s * r[o + l]), a++;
	}
	for (let l = 0; l < s; l++) i[l] -= 2 * (t[e + a + l] - t[n + a + l]);
}
const Xu = 16, Wu = 2 ** -53, Gu = 2 ** 27 + 1, Zu = (3 + 8 * Wu) * Wu, Qu = /* @__PURE__ */ new Float64Array(4), Yu = /* @__PURE__ */ new Float64Array(4), _u = /* @__PURE__ */ new Float64Array(8), Vu = /* @__PURE__ */ new Float64Array(12), Ju = /* @__PURE__ */ new Float64Array(16);
function ty(t, n, e) {
	const r = e - t;
	return t - (e - r) + (n - r);
}
function ny(t, n, e) {
	const r = t - e;
	return t - (e + r) + (r - n);
}
function ey(t, n, e) {
	let r = Gu * t, o = r - t;
	const s = r - o, i = t - s;
	r = Gu * n, o = r - n;
	const a = r - o, l = n - a;
	return i * l - (e - s * a - i * a - s * l);
}
function ry(t, n, e, r, o) {
	let s = n - r;
	o[0] = ny(n, r, s);
	const i = t + s, a = ty(t, s, i);
	s = a - e, o[1] = ny(a, e, s);
	const l = i + s;
	o[2] = ty(i, s, l), o[3] = l;
}
function oy(t, n, e, r, o) {
	let s, i, a, l = n[0], c = r[0], h = 0, f = 0;
	c > l == c > -l ? (s = l, l = ++h < t ? n[h] : 0) : (s = c, c = ++f < e ? r[f] : 0);
	let u = 0;
	if (h < t && f < e) for (c > l == c > -l ? (i = l + s, a = s - (i - l), l = ++h < t ? n[h] : 0) : (i = c + s, a = s - (i - c), c = ++f < e ? r[f] : 0), s = i, 0 !== a && (o[u++] = a); h < t && f < e;) c > l == c > -l ? (i = s + l, a = ty(s, l, i), l = ++h < t ? n[h] : 0) : (i = s + c, a = ty(s, c, i), c = ++f < e ? r[f] : 0), s = i, 0 !== a && (o[u++] = a);
	for (; h < t;) i = s + l, a = ty(s, l, i), l = ++h < t ? n[h] : 0, s = i, 0 !== a && (o[u++] = a);
	for (; f < e;) i = s + c, a = ty(s, c, i), c = ++f < e ? r[f] : 0, s = i, 0 !== a && (o[u++] = a);
	return 0 === s && 0 !== u || (o[u++] = s), u;
}
function sy(t, n, e, r, o, s) {
	const i = (t - o) * (r - s), a = (n - s) * (e - o), l = i - a;
	let c;
	if (i > 0) {
		if (a <= 0) return l;
		c = i + a;
	} else {
		if (!(i < 0)) return l;
		if (a >= 0) return l;
		c = -i - a;
	}
	const h = 33306690738754716e-32 * c;
	return l >= h || -l >= h ? l : function(t, n, e, r, o, s, i) {
		const a = t - o, l = e - o, c = n - s, h = r - s;
		let f = a * h, u = ey(a, h, f), y = c * l, d = ey(c, l, y);
		ry(f, u, y, d, Qu);
		let p = Qu[0] + Qu[1] + Qu[2] + Qu[3], g = 22204460492503146e-32 * i;
		if (p >= g || -p >= g) return p;
		const m = ny(t, o, a), x = ny(e, o, l), M = ny(n, s, c), w = ny(r, s, h);
		if (0 === m && 0 === M && 0 === x && 0 === w) return p;
		if (g = 11093356479670487e-47 * i + Zu * Math.abs(p), p += a * w + h * m - (c * x + l * M), p >= g || -p >= g) return p;
		f = m * h, u = ey(m, h, f), y = M * l, d = ey(M, l, y), ry(f, u, y, d, Yu);
		const b = oy(4, Qu, 4, Yu, _u);
		f = a * w, u = ey(a, w, f), y = c * x, d = ey(c, x, y), ry(f, u, y, d, Yu);
		const A = oy(b, _u, 4, Yu, Vu);
		f = m * w, u = ey(m, w, f), y = M * x, d = ey(M, x, y), ry(f, u, y, d, Yu);
		const k = oy(A, Vu, 4, Yu, Ju);
		return Ju[k - 1];
	}(t, n, e, r, o, s, c);
}
function iy(t, n, e, r, o, s) {
	return o >= Math.min(t, e) && o <= Math.max(t, e) && s >= Math.min(n, r) && s <= Math.max(n, r);
}
function ay(t, n, e, r, o, s, i, a) {
	const l = sy(o, s, i, a, t, n), c = sy(o, s, i, a, e, r), h = sy(t, n, e, r, o, s), f = sy(t, n, e, r, i, a);
	return !(l > 0 == c > 0 && l < 0 == c < 0 || h > 0 == f > 0 && h < 0 == f < 0) || 0 === l && iy(o, s, i, a, t, n) || 0 === c && iy(o, s, i, a, e, r) || 0 === h && iy(t, n, e, r, o, s) || 0 === f && iy(t, n, e, r, i, a);
}
function ly(t, n, e, r, o, s, i, a) {
	const l = 3 * e - t - 3 * o + i, c = 3 * r - n - 3 * s + a, h = 3 * (t - 2 * e + o), f = 3 * (n - 2 * r + s), u = 3 * (e - t), y = 3 * (r - n), d = l * f - c * h;
	if (Math.abs(d) < 1e-12) return !1;
	const p = (l * -y - c * -u) / d, g = p * p - 4 * (p * p - (-u * f + y * h) / d);
	if (g <= 0) return !1;
	const m = Math.sqrt(g), x = .5 * (p - m), M = .5 * (p + m), w = 1e-9;
	return x > w && x < .999999999 && M > w && M < .999999999 && Math.abs(M - x) > w;
}
function cy(t, n, e, r, o, s, i, a, l) {
	for (let c = 1; c < 16; c++) {
		const h = c / 16, f = 1 - h, u = f * f * f, y = 3 * f * f * h, d = 3 * f * h * h, p = h * h * h;
		t.push(u * n + y * r + d * s + p * a, u * e + y * o + d * i + p * l);
	}
	t.push(a, l);
}
function hy(t, n, e, r) {
	const o = k(n, e, r);
	if (null !== o && 0 !== o.dTheta) {
		const n = Math.max(16, Math.ceil(16 * Math.abs(o.dTheta) / (Math.PI / 2))), e = Math.cos(o.phi), r = Math.sin(o.phi);
		for (let s = 1; s < n; s++) {
			const i = o.theta1 + o.dTheta * s / n, a = o.rx * Math.cos(i), l = o.ry * Math.sin(i);
			t.push(o.cx + e * a - r * l, o.cy + r * a + e * l);
		}
	}
	t.push(r.x, r.y);
}
function fy(t) {
	const n = [], e = [], r = [], o = [];
	let s = t.x0, i = t.y0;
	for (const f of t.segments) {
		e.push(n.length / 2), n.push(s, i);
		let t = 0, a = 0, l = 0;
		switch (f.type) {
			case "L":
				n.push(f.x, f.y);
				break;
			case "Q":
			case "C": {
				const e = "C" === f.type ? f.x1 : s + 2 / 3 * (f.x1 - s), r = "C" === f.type ? f.y1 : i + 2 / 3 * (f.y1 - i), o = "C" === f.type ? f.x2 : f.x + 2 / 3 * (f.x1 - f.x), c = "C" === f.type ? f.y2 : f.y + 2 / 3 * (f.y1 - f.y);
				cy(n, s, i, e, r, o, c, f.x, f.y), ly(s, i, e, r, o, c, f.x, f.y) && (t = 1, a = .125 * s + .375 * e + .375 * o + .125 * f.x, l = .125 * i + .375 * r + .375 * c + .125 * f.y);
				break;
			}
			case "A":
				hy(n, s, i, f);
				break;
			case "M":
			case "Z": throw new Error(`a fitted edge holds L, C and A commands, not ${f.type}`);
		}
		r.push(t), o.push(a, l), s = f.x, i = f.y;
	}
	e.push(n.length / 2);
	const a = t.segments.length, l = Float64Array.from(n), c = Int32Array.from(e), h = new Float64Array(4 * a);
	for (let f = 0; f < a; f++) uy(l, c[f], c[f + 1] - 1, h, 4 * f);
	return {
		count: a,
		xy: l,
		offsets: c,
		boxes: h,
		loops: Uint8Array.from(r),
		loopAt: Float64Array.from(o)
	};
}
function uy(t, n, e, r, o) {
	let s = 1 / 0, i = 1 / 0, a = -1 / 0, l = -1 / 0;
	for (let c = n; c <= e; c++) {
		const n = t[2 * c], e = t[2 * c + 1];
		n < s && (s = n), n > a && (a = n), e < i && (i = e), e > l && (l = e);
	}
	r[o] = s, r[o + 1] = i, r[o + 2] = a, r[o + 3] = l;
}
function yy(t, n, e) {
	const r = 4 * n, o = 4 * e;
	return t[r] <= t[o + 2] && t[o] <= t[r + 2] && t[r + 1] <= t[o + 3] && t[o + 1] <= t[r + 3];
}
const dy = /* @__PURE__ */ new Int32Array(8);
let py = 0, gy = 0, my = 0, xy = /* @__PURE__ */ new Float64Array(16);
const My = /* @__PURE__ */ new Float64Array(4);
function wy(t, n, e, r) {
	return Math.abs(t - e) < 1e-6 && Math.abs(n - r) < 1e-6;
}
function by(t, n) {
	dy[2 * py] = t, dy[2 * py + 1] = n, py++;
}
function Ay(t, n) {
	for (let e = 0; e < py; e++) if (dy[2 * e] === t && dy[2 * e + 1] === n) return !0;
	return !1;
}
function ky(t, n, e, r, o) {
	const s = Math.ceil(o / Xu);
	xy.length < 4 * s && (xy = new Float64Array(4 * s));
	for (let i = 0; i < s; i++) uy(t, r + i * Xu, r + Math.min(i * Xu + Xu, o), xy, 4 * i);
	for (let i = 0; i < e; i += Xu) {
		const a = Math.min(i + Xu, e);
		uy(t, n + i, n + a, My, 0);
		for (let e = 0; e < s; e++) {
			if (My[0] > xy[4 * e + 2] || xy[4 * e] > My[2] || My[1] > xy[4 * e + 3] || xy[4 * e + 1] > My[3]) continue;
			const s = e * Xu, l = Math.min(s + Xu, o);
			for (let e = i; e < a; e++) {
				const o = 2 * (n + e), i = t[o], a = t[o + 1], c = t[o + 2], h = t[o + 3];
				for (let n = s; n < l; n++) {
					if (py > 0 && Ay(e, n)) continue;
					const o = 2 * (r + n), s = t[o], l = t[o + 1], f = t[o + 2], u = t[o + 3];
					if (!(Math.max(i, c) < Math.min(s, f) || Math.max(s, f) < Math.min(i, c) || Math.max(a, h) < Math.min(l, u) || Math.max(l, u) < Math.min(a, h)) && ay(i, a, c, h, s, l, f, u)) return gy = e, my = n, !0;
				}
			}
		}
	}
	return !1;
}
function vy(t, n, e, r, o, s, i, a) {
	const l = e - t, c = r - n, h = i - o, f = a - s, u = l * f - c * h;
	if (Math.abs(u) > 1e-18) {
		const e = Math.min(1, Math.max(0, ((o - t) * f - (s - n) * h) / u));
		return [t + e * l, n + e * c];
	}
	const y = [
		t,
		e,
		o,
		i
	], d = [
		n,
		r,
		s,
		a
	], p = y.map((t, n) => t * l + d[n] * c), g = [
		0,
		1,
		2,
		3
	].toSorted((t, n) => p[t] < p[n] ? -1 : p[t] > p[n] ? 1 : 0);
	return [.5 * (y[g[1]] + y[g[2]]), .5 * (d[g[1]] + d[g[2]])];
}
function Fy(t, n, e = {}) {
	const r = function(t, n) {
		let e = 0, r = 0;
		for (const y of t.edges) {
			const t = n[y];
			e += t.count, r += t.offsets[t.count];
		}
		const o = new Float64Array(2 * r), s = new Int32Array(e + 1), i = new Float64Array(4 * e), a = new Uint8Array(e), l = new Float64Array(2 * e), c = new Int32Array(e), h = new Int32Array(e);
		let f = 0, u = 0;
		for (let y = 0; y < t.edges.length; y++) {
			const e = t.edges[y], r = n[e], d = t.reversed[y], p = r.count;
			for (let t = 0; t < p; t++) {
				const n = d ? p - 1 - t : t, y = r.offsets[n], g = r.offsets[n + 1];
				if (s[f] = u, d) for (let t = g - 1; t >= y; t--) o[2 * u] = r.xy[2 * t], o[2 * u + 1] = r.xy[2 * t + 1], u++;
				else o.set(r.xy.subarray(2 * y, 2 * g), 2 * u), u += g - y;
				i.set(r.boxes.subarray(4 * n, 4 * n + 4), 4 * f), a[f] = r.loops[n], l[2 * f] = r.loopAt[2 * n], l[2 * f + 1] = r.loopAt[2 * n + 1], c[f] = e, h[f] = n, f++;
			}
		}
		return s[e] = u, {
			count: e,
			xy: o,
			offsets: s,
			boxes: i,
			loops: a,
			loopAt: l,
			edge: c,
			segment: h
		};
	}(t, n), o = e.touching, s = void 0 === o ? void 0 : (t, n) => r.edge[t] === o || r.edge[n] === o;
	return function(t, n = 32, e) {
		const r = [], o = t.count;
		if (0 === o || n <= 0) return r;
		const { xy: s, offsets: i } = t, a = function(t, n) {
			let e = 1 / 0, r = 1 / 0, o = -1 / 0, s = -1 / 0, i = 0;
			for (let w = 0; w < n; w++) {
				const n = t[4 * w], a = t[4 * w + 1], l = t[4 * w + 2], c = t[4 * w + 3];
				n < e && (e = n), a < r && (r = a), l > o && (o = l), c > s && (s = c), i += Math.max(l - n, c - a);
			}
			const a = o - e, l = s - r;
			if (n <= 24 || !Number.isFinite(a) || !Number.isFinite(l) || !Number.isFinite(i)) {
				const e = [];
				for (let r = 0; r < n; r++) for (let o = r + 1; o < n; o++) yy(t, r, o) && e.push(r, o);
				return Int32Array.from(e);
			}
			let c = Math.max(i / n, Math.sqrt(a * l / n));
			c > 0 || (c = Math.max(a, l, 1));
			let h = Math.floor(a / c) + 1, f = Math.floor(l / c) + 1;
			for (; h * f > 4 * n + 64;) c *= 2, h = Math.floor(a / c) + 1, f = Math.floor(l / c) + 1;
			const u = (t) => Math.min(h - 1, Math.floor((t - e) / c)), y = (t) => Math.min(f - 1, Math.floor((t - r) / c)), d = new Int32Array(h * f + 1);
			for (let w = 0; w < n; w++) {
				const n = u(t[4 * w]), e = u(t[4 * w + 2]), r = y(t[4 * w + 3]);
				for (let o = y(t[4 * w + 1]); o <= r; o++) for (let t = n; t <= e; t++) d[o * h + t + 1]++;
			}
			for (let w = 0; w < h * f; w++) d[w + 1] += d[w];
			const p = new Int32Array(d[h * f]), g = d.slice(0, h * f);
			for (let w = 0; w < n; w++) {
				const n = u(t[4 * w]), e = u(t[4 * w + 2]), r = y(t[4 * w + 3]);
				for (let o = y(t[4 * w + 1]); o <= r; o++) for (let t = n; t <= e; t++) p[g[o * h + t]++] = w;
			}
			const m = [];
			for (let w = 0; w < f; w++) for (let e = 0; e < h; e++) {
				const r = d[w * h + e], o = d[w * h + e + 1];
				for (let s = r; s < o; s++) {
					const r = p[s];
					for (let i = s + 1; i < o; i++) {
						const o = p[i];
						if (!yy(t, r, o)) continue;
						const s = Math.max(t[4 * r], t[4 * o]), a = Math.max(t[4 * r + 1], t[4 * o + 1]);
						u(s) === e && y(a) === w && m.push(r * n + o);
					}
				}
			}
			const x = Float64Array.from(m).toSorted(), M = new Int32Array(2 * x.length);
			for (let w = 0; w < x.length; w++) {
				const t = Math.floor(x[w] / n);
				M[2 * w] = t, M[2 * w + 1] = x[w] - t * n;
			}
			return M;
		}(t.boxes, o);
		let l = 0;
		for (let c = 0; c < o; c++) {
			if (1 === t.loops[c] && (void 0 === e || e(c, c)) && (r.push({
				i: c,
				j: c,
				x: t.loopAt[2 * c],
				y: t.loopAt[2 * c + 1]
			}), r.length >= n)) return r;
			for (; l < a.length && a[l] === c; l += 2) {
				const t = a[l + 1];
				if (void 0 !== e && !e(c, t)) continue;
				const o = i[c], h = i[c + 1] - o - 1, f = i[t], u = i[t + 1] - f - 1, y = 2 * o, d = 2 * (o + h), p = 2 * f, g = 2 * (f + u);
				py = 0, wy(s[d], s[d + 1], s[p], s[p + 1]) && by(h - 1, 0), wy(s[g], s[g + 1], s[y], s[y + 1]) && by(0, u - 1), wy(s[y], s[y + 1], s[p], s[p + 1]) && by(0, 0), wy(s[d], s[d + 1], s[g], s[g + 1]) && by(h - 1, u - 1);
				const m = ky(s, o, h, f, u);
				if (py = 0, !m) continue;
				const x = 2 * (o + gy), M = 2 * (f + my), [w, b] = vy(s[x], s[x + 1], s[x + 2], s[x + 3], s[M], s[M + 1], s[M + 2], s[M + 3]);
				if (r.push({
					i: c,
					j: t,
					x: w,
					y: b
				}), r.length >= n) return r;
			}
		}
		return r;
	}(r, e.limit ?? 32, s).map((t) => ({
		i: t.i,
		j: t.j,
		x: t.x,
		y: t.y,
		edgeI: r.edge[t.i],
		segmentI: r.segment[t.i],
		edgeJ: r.edge[t.j],
		segmentJ: r.segment[t.j]
	}));
}
function Iy(t, n, e = {}) {
	const { changed: r } = e, o = [];
	for (const s of t) if (void 0 === r || s.edges.some((t) => r.has(t))) for (const t of Fy(s, n, e)) o.push({
		edge: t.edgeI,
		segment: t.segmentI,
		x: t.x,
		y: t.y
	}), o.push({
		edge: t.edgeJ,
		segment: t.segmentJ,
		x: t.x,
		y: t.y
	});
	return o.toSorted((t, n) => t.edge - n.edge || t.segment - n.segment || t.x - n.x);
}
function Ny(t, n, e, r, o, s) {
	return o >= Math.min(t, e) - 1e-12 && o <= Math.max(t, e) + 1e-12 && s >= Math.min(n, r) - 1e-12 && s <= Math.max(n, r) + 1e-12;
}
function Sy(t, n, e, r) {
	const o = t.a[n], s = t.b[n], i = e[2 * o], a = e[2 * o + 1], l = e[2 * s], c = e[2 * s + 1];
	r[4 * n] = Math.floor(Math.min(i, l)) - 1, r[4 * n + 1] = Math.ceil(Math.max(i, l)), r[4 * n + 2] = Math.floor(Math.min(a, c)) - 1, r[4 * n + 3] = Math.ceil(Math.max(a, c));
}
function Py(t, n, e, r) {
	return t[4 * n] <= e[4 * r + 1] && e[4 * r] <= t[4 * n + 1] && t[4 * n + 2] <= e[4 * r + 3] && e[4 * r + 2] <= t[4 * n + 3];
}
var Cy = class {
	segments;
	cand;
	r0;
	r1;
	ok0;
	ok1;
	constructor(t, n, e, r) {
		const o = function(t, n) {
			let e = 0;
			for (let a = 0; a < t.edges.length; a++) {
				const r = n.of[a].length;
				r >= 2 && (e += t.edges[a].closed ? r : r - 1);
			}
			const r = new Int32Array(e), o = new Int32Array(e), s = new Int32Array(e);
			let i = 0;
			for (let a = 0; a < t.edges.length; a++) {
				const e = n.of[a], l = e.length;
				if (l < 2) continue;
				const c = t.edges[a].closed ? l : l - 1;
				for (let t = 0; t < c; t++) r[i] = e[t], o[i] = t + 1 === l ? e[0] : e[t + 1], s[i] = a, i++;
			}
			return {
				count: e,
				a: r,
				b: o,
				edge: s
			};
		}(t, n);
		this.segments = o;
		const s = o.count, i = new Float64Array(4 * s), a = new Float64Array(4 * s), l = new Float64Array(4 * s);
		for (let c = 0; c < s; c++) Sy(o, c, e, i), Sy(o, c, r, a), l[4 * c] = Math.min(i[4 * c], a[4 * c]) - 1, l[4 * c + 1] = Math.max(i[4 * c + 1], a[4 * c + 1]) + 1, l[4 * c + 2] = Math.min(i[4 * c + 2], a[4 * c + 2]) - 1, l[4 * c + 3] = Math.max(i[4 * c + 3], a[4 * c + 3]) + 1;
		this.cand = function(t, n) {
			const e = t.count, r = (n, e) => {
				const r = t.a[n], o = t.b[n], s = t.a[e], i = t.b[e];
				return r === s || r === i || o === s || o === i;
			}, o = new Float64Array(4 * e);
			for (let u = 0; u < 4 * e; u++) o[u] = Math.floor(n[u] / 4);
			const s = [], i = [];
			let a = 1 / 0, l = -1 / 0, c = 1 / 0, h = -1 / 0;
			for (let u = 0; u < e; u++) {
				const t = (o[4 * u + 1] - o[4 * u] + 1) * (o[4 * u + 3] - o[4 * u + 2] + 1);
				t > 0 && t <= 64 ? (i.push(u), a = Math.min(a, o[4 * u]), l = Math.max(l, o[4 * u + 1]), c = Math.min(c, o[4 * u + 2]), h = Math.max(h, o[4 * u + 3])) : s.push(u);
			}
			const f = [];
			if (i.length > 0) {
				const t = l - a + 1, e = h - c + 1, s = new Int32Array(t * e + 1);
				for (const n of i) for (let e = o[4 * n + 2]; e <= o[4 * n + 3]; e++) for (let r = o[4 * n]; r <= o[4 * n + 1]; r++) s[(e - c) * t + (r - a) + 1]++;
				for (let n = 0; n < t * e; n++) s[n + 1] += s[n];
				const u = s.slice(), y = new Int32Array(s[t * e]);
				for (const n of i) for (let e = o[4 * n + 2]; e <= o[4 * n + 3]; e++) for (let r = o[4 * n]; r <= o[4 * n + 1]; r++) y[u[(e - c) * t + (r - a)]++] = n;
				for (let i = c; i <= h; i++) for (let e = a; e <= l; e++) {
					const l = (i - c) * t + (e - a);
					for (let t = s[l]; t < s[l + 1]; t++) {
						const a = y[t];
						for (let c = t + 1; c < s[l + 1]; c++) {
							const t = y[c];
							Math.max(o[4 * a], o[4 * t]) === e && Math.max(o[4 * a + 2], o[4 * t + 2]) === i && Py(n, a, n, t) && !r(a, t) && f.push(Math.min(a, t), Math.max(a, t));
						}
					}
				}
			}
			for (let u = 0; u < s.length; u++) {
				const t = s[u];
				for (const e of i) Py(n, t, n, e) && !r(t, e) && f.push(Math.min(t, e), Math.max(t, e));
				for (let e = u + 1; e < s.length; e++) {
					const o = s[e];
					Py(n, t, n, o) && !r(t, o) && f.push(Math.min(t, o), Math.max(t, o));
				}
			}
			return Int32Array.from(f);
		}(o, l), this.r0 = new Float64Array(4 * s), this.r1 = new Float64Array(4 * s), this.ok0 = new Uint8Array(s), this.ok1 = new Uint8Array(s);
	}
	count(t) {
		this.ranges(t, this.r1, this.ok1);
		let n = 0;
		const e = this.cand;
		for (let r = 0; r < e.length; r += 2) this.counted(this.r1, this.ok1, t, e[r], e[r + 1]) && n++;
		return n;
	}
	newCrossings(t, n) {
		this.ranges(t, this.r0, this.ok0), this.ranges(n, this.r1, this.ok1);
		const e = this.cand, r = [];
		for (let o = 0; o < e.length; o += 2) {
			const s = e[o], i = e[o + 1];
			this.counted(this.r1, this.ok1, n, s, i) && !this.counted(this.r0, this.ok0, t, s, i) && r.push(s, i);
		}
		return Int32Array.from(r);
	}
	ranges(t, n, e) {
		for (let r = 0; r < this.segments.count; r++) {
			Sy(this.segments, r, t, n);
			const o = (n[4 * r + 1] - n[4 * r]) * (n[4 * r + 3] - n[4 * r + 2]);
			e[r] = o <= 64 ? 1 : 0;
		}
	}
	counted(t, n, e, r, o) {
		if (!n[r] || !n[o] || !Py(t, r, t, o)) return !1;
		const s = this.segments, i = s.a[r], a = s.b[r], l = s.a[o], c = s.b[o];
		return function(t, n, e, r, o, s, i, a) {
			const l = sy(t, n, e, r, o, s), c = sy(t, n, e, r, i, a), h = sy(o, s, i, a, t, n), f = sy(o, s, i, a, e, r);
			return l > 0 != c > 0 && h > 0 != f > 0 && 0 !== l && 0 !== c && 0 !== h && 0 !== f || 0 === l && Ny(t, n, e, r, o, s) || 0 === c && Ny(t, n, e, r, i, a) || 0 === h && Ny(o, s, i, a, t, n) || 0 === f && Ny(o, s, i, a, e, r);
		}(e[2 * i], e[2 * i + 1], e[2 * a], e[2 * a + 1], e[2 * l], e[2 * l + 1], e[2 * c], e[2 * c + 1]);
	}
};
function Uy(t, n, e, r) {
	let o = 0;
	for (let s = 0; s < n.edges.length; s++) {
		const i = n.edges[s], a = e[i], l = a.length, c = n.reversed[s], h = t.edges[i].closed ? l : l - 1;
		for (let t = 0; t < h; t++) {
			const n = a[c ? l - 1 - t : t], e = a[c ? (2 * l - 2 - t) % l : (t + 1) % l];
			o += r[2 * n] * r[2 * e + 1] - r[2 * e] * r[2 * n + 1];
		}
	}
	return o;
}
function Ly(t, n, e, r, o) {
	const s = {
		outcome: "degenerate",
		before: 0,
		after: 0,
		iters: 0,
		moved: 0,
		scale: 1,
		parts: 0,
		evals: 0
	};
	if (0 === t.width || 0 === t.height || 0 === t.edges.length) return s;
	const i = function(t) {
		const { edges: n, nodes: e } = t, r = new Int32Array(e.length).fill(-1);
		let o = 0;
		for (const h of n) o += h.points.length >> 1;
		const s = new Float64Array(2 * o), i = new Uint8Array(o), a = new Int32Array(o).fill(-1), l = [];
		let c = 0;
		for (const h of n) {
			const t = h.points.length >> 1, n = new Int32Array(t);
			for (let o = 0; o < t; o++) {
				const l = h.closed ? -1 : 0 === o ? h.start : o === t - 1 ? h.end : -1;
				if (l >= 0) {
					if (l >= e.length) throw new RangeError("buildUnknowns: edge ends at a missing node");
					r[l] < 0 && (r[l] = c, s[2 * c] = e[l].x, s[2 * c + 1] = e[l].y, i[c] = 1, a[c] = l, c++), n[o] = r[l];
				} else s[2 * c] = h.points[2 * o], s[2 * c + 1] = h.points[2 * o + 1], n[o] = c++;
			}
			l.push(n);
		}
		return {
			count: c,
			of: l,
			start: s.subarray(0, 2 * c),
			junction: i.subarray(0, c),
			node: a.subarray(0, c),
			pin: new Uint8Array(c)
		};
	}(t);
	(function(t, n) {
		const e = t.width, r = t.height, { start: o, pin: s } = n;
		for (let i = 0; i < t.edges.length; i++) {
			const a = t.edges[i];
			if (-1 !== a.left && -1 !== a.right) continue;
			const l = n.of[i];
			for (let t = 0; t < l.length; t++) {
				const n = l[t];
				for (const t of [0, e]) Math.abs(o[2 * n] - t) < .001 && (o[2 * n] = t, s[n] |= 1);
				for (const t of [0, r]) Math.abs(o[2 * n + 1] - t) < .001 && (o[2 * n + 1] = t, s[n] |= 2);
			}
		}
	})(t, i);
	const a = i.count;
	if (a < 3) return s;
	const l = new Bu(t, i, n, e);
	if (!l.setup(r.tableBudget ?? Tu(t.width, t.height))) return s.outcome = "over-budget", s;
	const c = l.cutResidual;
	l.wKink = 1, l.wAnchor = 0;
	const h = l.priors(i.start, null);
	if (!(c > 0)) return s.outcome = "no-residual", s;
	if (!(h > 0)) return s;
	l.wKink = .05 * c / h, l.wAnchor = .1 * c * o * o / a;
	const f = l.components(), u = {
		maxStep: .35 / o,
		maxTotal: 1 / o,
		maxIters: r.maxIterations,
		iterationBudget: r.iterationBudget,
		fixedEnergy: l.restResidual,
		onStep: r.onStep
	}, y = void 0 !== r.kernel ? r.kernel.descend(l, f, u) : null, d = null !== y ? y : function(t, n, e = {}) {
		if (n.length % 2 != 0) throw new RangeError("lbfgsDescend: start must hold x, y pairs");
		const r = n.length >> 1, o = e.maxTotal ?? 1, s = e.maxStep ?? .35;
		if (!(o > 0)) throw new RangeError("lbfgsDescend: maxTotal must be positive");
		if (!(s > 0 && Number.isFinite(s))) throw new RangeError("lbfgsDescend: maxStep must be positive and finite");
		const i = e.pin ?? new Uint8Array(r);
		if (i.length < r) throw new RangeError("lbfgsDescend: pin must have one entry per point");
		const a = n.slice(), l = new Float64Array(n.length), c = t(a, l, -1);
		(function(t, n) {
			for (let e = 0; e < t.length >> 1; e++) 1 & n[e] && (t[2 * e] = 0), 2 & n[e] && (t[2 * e + 1] = 0);
		})(l, i);
		const h = c - (e.fixedEnergy ?? 0), f = {
			objective: t,
			pos: a,
			gfull: l,
			maxTotal: o,
			maxStep: s,
			maxIters: Math.min(e.maxIters ?? 64, 64),
			scaleF: h > 1e-12 ? h : 1e-12,
			scalePg: Su(l),
			onStep: e.onStep,
			budget: e.iterationBudget ?? 1 / 0,
			evals: 1
		}, u = e.parts;
		let y = 0, d = 0, p = 0;
		const g = void 0 === u ? 1 : u.length;
		for (let m = 0; m < g; m++) {
			const e = xu(f, new Mu(void 0 === u ? Cu(r) : Uint32Array.from(u[m]), n, i, a), void 0 === u ? -1 : m);
			y += e.before, d += e.after, e.iters > p && (p = e.iters);
		}
		if (!(d >= y || 0 === p)) return {
			x: a,
			before: y,
			after: d,
			iters: p,
			evals: f.evals
		};
	}((t, n, e) => (l.active = e < 0 ? null : f[e], l.energy(t, n)), i.start, {
		...u,
		parts: f.map((t) => t.vars),
		pin: i.pin
	});
	if (l.active = null, void 0 === d) return s.outcome = "no-gain", s.parts = f.length, s;
	const p = function(t, n, e) {
		const r = n.count, o = n.start, s = new Cy(t, n, o, e), i = s.segments.edge, a = t.edges.length, l = new Float64Array(a).fill(1), c = new Uint8Array(a), h = new Float64Array(r), f = e.slice(), u = Wf(t).flat(), y = u.map((e) => Uy(t, e, n.of, o));
		let d = 0;
		for (;;) {
			const p = s.newCrossings(o, f);
			c.fill(0);
			for (let t = 0; t < p.length; t++) c[i[p[t]]] = 1;
			let g = !1;
			for (let e = 0; e < u.length; e++) if (!(0 === y[e] || y[e] * Uy(t, u[e], n.of, f) > 0)) {
				g = !0;
				for (const t of u[e].edges) c[t] = 1;
			}
			if (0 === p.length && !g) break;
			d++;
			for (let t = 0; t < a; t++) c[t] && (l[t] = l[t] > 1 / 16 ? .5 * l[t] : 0);
			h.fill(1);
			for (let t = 0; t < a; t++) {
				const e = n.of[t];
				for (let n = 0; n < e.length; n++) h[e[n]] = Math.min(h[e[n]], l[t]);
			}
			for (let t = 0; t < r; t++) f[2 * t] = o[2 * t] + (e[2 * t] - o[2 * t]) * h[t], f[2 * t + 1] = o[2 * t + 1] + (e[2 * t + 1] - o[2 * t + 1]) * h[t];
		}
		let p = 0, g = 0;
		for (let x = 0; x < r; x++) g += Math.hypot(e[2 * x] - o[2 * x], e[2 * x + 1] - o[2 * x + 1]), p += Math.hypot(f[2 * x] - o[2 * x], f[2 * x + 1] - o[2 * x + 1]);
		let m = 0;
		for (let x = 0; x < a; x++) l[x] < 1 && m++;
		return {
			pos: f,
			scale: g > 0 ? p / g : 1,
			rounds: d,
			backedOff: m
		};
	}(t, i, d.x);
	return s.outcome = "solved", s.before = d.before, s.after = d.after, s.iters = d.iters, s.scale = p.scale, s.parts = f.length, s.evals = d.evals, s.moved = function(t, n, e, r) {
		let o = 0;
		for (let s = 0; s < t.edges.length; s++) {
			const e = t.edges[s].points, i = n[s];
			for (let t = 0; t < i.length; t++) {
				const n = r[2 * i[t]], s = r[2 * i[t] + 1];
				Math.hypot(e[2 * t] - n, e[2 * t + 1] - s) > 1e-6 && o++, e[2 * t] = n, e[2 * t + 1] = s;
			}
		}
		for (let s = 0; s < e.length; s++) e[s] < 0 || (t.nodes[e[s]].x = r[2 * s], t.nodes[e[s]].y = r[2 * s + 1]);
		return na(t), o;
	}(t, i.of, i.node, p.pos), s;
}
function $y(t, n) {
	const { of: e, start: r } = t.unknowns, o = t.map.edges, s = 2 * (Number.isFinite(n) ? n : Math.max(t.width, t.height));
	let i = 0;
	for (let a = 0; a < o.length; a++) {
		const t = e[a], n = t.length;
		if (n < 2) continue;
		const l = o[a].closed ? n : n - 1;
		for (let e = 0; e < l; e++) {
			const o = t[e], a = t[e + 1 === n ? 0 : e + 1], l = Math.abs(r[2 * a] - r[2 * o]), c = Math.abs(r[2 * a + 1] - r[2 * o + 1]);
			i += 1 + Math.ceil(l + s) + Math.ceil(c + s);
		}
	}
	return i;
}
var qy = class {
	module;
	heapBase;
	measure = !1;
	timings = {
		instantiate: 0,
		copyIn: 0,
		solve: 0,
		copyOut: 0,
		bytes: 0,
		grown: 0
	};
	constructor(t, n) {
		this.module = t, this.heapBase = n;
	}
	descend(t, n, e = {}) {
		if (null === t.band) throw new Error("BandKernel: the problem is not set up");
		const r = e.maxTotal ?? 1, o = e.maxStep ?? .35;
		if (!(r > 0)) throw new RangeError("BandKernel: maxTotal must be positive");
		if (!(o > 0 && Number.isFinite(o))) throw new RangeError("BandKernel: maxStep must be positive and finite");
		try {
			return this.run(t, n, e);
		} catch (s) {
			if (s instanceof RangeError || s instanceof WebAssembly.RuntimeError) return null;
			throw s;
		}
	}
	run(t, n, e) {
		const r = t.band, o = t.unknowns, s = o.count, i = e.maxTotal ?? 1, a = e.maxStep ?? .35, l = this.measure, c = l ? performance.now() : 0, h = t.map.edges, f = h.length;
		let u = 0;
		for (const G of o.of) u += G.length;
		let y = 0, d = 0, p = 0;
		for (const G of n) y += G.edges.length, d += G.runs.length, p += G.vars.length;
		const g = void 0 !== e.onStep, m = {
			n: s,
			ne: f,
			nids: u,
			pe: y,
			pr: d,
			pv: p,
			pieces: $y(t, i)
		}, x = Math.ceil((this.heapBase + function(t, n, e, r) {
			const o = t.band, s = t.width, i = t.height, a = o.runCount, l = n.length, c = 16 * e.n + 2 * e.n + 9 * e.ne + 4 * (e.ne + 1) + 4 * e.nids + 32 * a + 4 * o.faces.length + 8 * o.colour.length + 8 * o.prefix.length + 24 * o.cells + s * i + 12 * (l + 1) + 4 * (e.pe + e.pr + e.pv), h = 156 * e.pieces + 8 * s * i + 12 * i + 24 * o.maxNf + 16 * o.maxLen * o.maxNf + 12 * o.maxLen;
			let f = 0;
			for (const u of n) f = Math.max(f, u.vars.length);
			return c + h + (48 * e.n + 261 * f + 64 * l + (r ? 16384 * l : 0)) + 2048 + 65536;
		}(t, n, m, g)) / 65536), M = new WebAssembly.Memory({ initial: x }), w = new WebAssembly.Instance(this.module, { env: { memory: M } }).exports, b = l ? performance.now() : 0;
		new Uint32Array(M.buffer, w.io(), 17).set([
			t.width,
			t.height,
			s,
			f,
			u,
			r.runCount,
			r.faces.length,
			r.colour.length,
			r.prefix.length,
			r.cells,
			n.length,
			y,
			d,
			p,
			r.maxNf,
			r.maxLen,
			m.pieces
		]);
		const A = w.problem_new(), k = M.buffer, v = new Uint32Array(k, w.io() + 68, 28);
		let F = 0;
		const I = (t) => new Float64Array(k, v[F++], t), N = (t) => new Int32Array(k, v[F++], t), S = (t) => new Uint8Array(k, v[F++], t);
		I(2 * s).set(o.start), S(s).set(o.pin), S(s).set(o.junction);
		const P = N(f), C = N(f), U = S(f), L = N(f + 1), $ = N(u);
		let q = 0;
		for (let G = 0; G < f; G++) {
			const t = h[G];
			P[G] = t.left, C[G] = t.right, U[G] = t.closed ? 1 : 0, L[G] = q, $.set(o.of[G], q), q += o.of[G].length;
		}
		L[f] = q;
		const R = r.runCount;
		N(R).set(r.y), N(R).set(r.x0), N(R).set(r.x1), N(R).set(r.first), N(R).set(r.fstart), N(R).set(r.nf), N(R).set(r.cstart), N(R).set(r.pstart), N(r.faces.length).set(r.faces), I(r.colour.length).set(r.colour), I(r.prefix.length).set(r.prefix), I(r.cells).set(r.weight);
		const z = (T = 4 * r.cells, new Float32Array(k, v[F++], T));
		var T;
		const E = t.image.data, j = t.width;
		for (let G = 0; G < R; G++) {
			const t = 4 * (r.y[G] * j + r.x0[G]), n = r.x1[G] - r.x0[G] + 1;
			z.set(E.subarray(t, t + 4 * n), 4 * r.first[G]);
		}
		S(r.inBand.length).set(r.inBand);
		const B = (t, e) => {
			const r = N(n.length + 1), o = N(e);
			let s = 0;
			for (let i = 0; i < n.length; i++) {
				const e = t(n[i]);
				r[i] = s, o.set(e, s), s += e.length;
			}
			r[n.length] = s;
		};
		B((t) => t.edges, y), B((t) => t.runs, d), B((t) => t.vars, p);
		const O = l ? performance.now() : 0, K = w.problem_solve(A, t.wKink, t.wAnchor, a, i, Math.min(e.maxIters ?? 64, 64), e.iterationBudget ?? 1 / 0, e.fixedEnergy ?? 0, g ? 1 : 0), D = l ? performance.now() : 0, H = M.buffer, X = new Float64Array(H, w.problem_stats(A), 5);
		if (void 0 !== e.onStep && X[4] > 0) {
			const t = new Float64Array(H, w.problem_steps(A), 8 * X[4]);
			for (let n = 0; n < t.length; n += 8) e.onStep({
				part: t[n],
				iter: t[n + 1],
				step: t[n + 2],
				trials: t[n + 3],
				energy: t[n + 4],
				rel: t[n + 5],
				moved: t[n + 6],
				pg: t[n + 7]
			});
		}
		const W = 1 === K ? {
			x: new Float64Array(H, w.problem_x(A), 2 * s).slice(),
			before: X[0],
			after: X[1],
			iters: X[2],
			evals: X[3]
		} : void 0;
		if (l) {
			const t = this.timings;
			t.instantiate = b - c, t.copyIn = O - b, t.solve = D - O, t.copyOut = performance.now() - D, t.bytes = 8 * (2 * s + r.colour.length + r.prefix.length + r.cells) + 4 * (3 * f + u + 8 * R + r.faces.length + 4 * r.cells + y + d + p) + 2 * s + f + r.inBand.length, t.grown = H.byteLength - 65536 * x;
		}
		return W;
	}
};
const Ry = 180 / Math.PI, zy = Math.PI / 180;
function Ty(t, n) {
	return {
		type: "L",
		x: t,
		y: n
	};
}
function Ey(t, n, e, r, o, s) {
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
function jy(t, n, e, r, o, s, i) {
	return {
		type: "A",
		rx: t,
		ry: n,
		rotation: e * Ry,
		largeArc: r,
		sweep: o,
		x: s,
		y: i
	};
}
function By(t) {
	switch (t.type) {
		case "L": return 2;
		case "C": return Ha();
		case "A": return function(t) {
			return "A" !== t.type || Math.abs(t.rx - t.ry) <= 1e-9 * Math.max(Math.abs(t.rx), 1) && 0 === t.rotation;
		}(t) ? Wa() : 7;
	}
}
function Oy(t, n, e) {
	return {
		...t,
		x: n,
		y: e
	};
}
function Ky(t, n) {
	const e = Math.hypot(t, n);
	return e < 1e-12 || !Number.isFinite(e) ? null : {
		x: t / e,
		y: n / e
	};
}
function Dy(t) {
	const n = -t.x0 + 3 * t.x1 - 3 * t.x2 + t.x3, e = -t.y0 + 3 * t.y1 - 3 * t.y2 + t.y3, r = 3 * (t.x0 - 2 * t.x1 + t.x2), o = 3 * (t.y0 - 2 * t.y1 + t.y2), s = 3 * (t.x1 - t.x0), i = 3 * (t.y1 - t.y0), a = n * o - e * r;
	if (Math.abs(a) < 1e-12) return !1;
	const l = (n * -i - e * -s) / a, c = l * l - 4 * (l * l - (-s * o + i * r) / a);
	if (c <= 0) return !1;
	const h = Math.sqrt(c), f = .5 * (l - h), u = .5 * (l + h), y = 1e-9;
	return f > y && f < .999999999 && u > y && u < .999999999 && Math.abs(u - f) > y;
}
function Hy(t, n, e) {
	const r = Math.sin(t.phi), o = Math.cos(t.phi), s = t.rx * Math.cos(n), i = t.ry * Math.sin(n);
	return e.x = t.cx + o * s - r * i, e.y = t.cy + r * s + o * i, e;
}
function Xy(t) {
	return Math.abs(Math.max(Math.abs(t.rx), Math.abs(t.ry)) * t.delta);
}
function Wy(t, n, e, r, o, s, i, a, l) {
	let c = Math.abs(e), h = Math.abs(r);
	const f = .5 * (t + a), u = .5 * (n + l), y = .5 * (t - a), d = .5 * (n - l);
	if (y * y + d * d <= 1e-24 || c <= 1e-12 || h <= 1e-12) return {
		cx: t - c,
		cy: n,
		rx: c,
		ry: h,
		phi: o,
		theta1: 0,
		delta: 0
	};
	const p = Math.sin(o), g = Math.cos(o), m = g * y + p * d, x = -p * y + g * d, M = m * m / (c * c) + x * x / (h * h);
	if (M > 1) {
		const t = Math.sqrt(M);
		c *= t, h *= t;
	}
	const w = Math.max(c * c * h * h - c * c * x * x - h * h * m * m, 0), b = c * c * x * x + h * h * m * m;
	let A = b > 0 ? Math.sqrt(w / b) : 0;
	s === i && (A = -A);
	const k = A * c * x / h, v = -A * h * m / c, F = g * k - p * v + f, I = p * k + g * v + u, N = Math.atan2((x - v) / h, (m - k) / c);
	let S = Math.atan2((-x - v) / h, (-m - k) / c) - N;
	return !i && S > 0 ? S -= 2 * Math.PI : i && S < 0 && (S += 2 * Math.PI), {
		cx: F,
		cy: I,
		rx: c,
		ry: h,
		phi: o,
		theta1: N,
		delta: S
	};
}
function Gy(t, n, e) {
	return Wy(t, n, e.rx, e.ry, function(t) {
		return t.rotation * zy;
	}(e), e.largeArc, e.sweep, e.x, e.y);
}
function Zy(t, n, e) {
	const r = Math.ceil(t);
	return Number.isNaN(r) ? n : Math.min(Math.max(r, n), e);
}
function Qy(t, n, e, r) {
	const o = [], s = [];
	let i = 1, a = t, l = n;
	for (const u of e) {
		let t, n = null;
		"L" === u.type ? t = Zy(Math.hypot(u.x - a, u.y - l) / r, 1, 4096) : "C" === u.type ? t = Zy((Math.hypot(u.x1 - a, u.y1 - l) + Math.hypot(u.x2 - u.x1, u.y2 - u.y1) + Math.hypot(u.x - u.x2, u.y - u.y2)) / r, 4, 4096) : (n = Gy(a, l, u), t = Zy(Xy(n) / r, 2, 4096)), o.push(n), s.push(t), i += t, a = u.x, l = u.y;
	}
	const c = new Float64Array(2 * i);
	c[0] = t, c[1] = n;
	let h = 2;
	a = t, l = n;
	const f = {
		x: 0,
		y: 0
	};
	for (let u = 0; u < e.length; u++) {
		const t = e[u], n = s[u];
		if ("L" === t.type) for (let e = 1; e <= n; e++) {
			const r = e / n;
			c[h++] = a + (t.x - a) * r, c[h++] = l + (t.y - l) * r;
		}
		else if ("C" === t.type) for (let e = 1; e <= n; e++) {
			const r = e / n, o = 1 - r, s = o * o * o, i = 3 * o * o * r, f = 3 * o * r * r, u = r * r * r;
			c[h++] = s * a + i * t.x1 + f * t.x2 + u * t.x, c[h++] = s * l + i * t.y1 + f * t.y2 + u * t.y;
		}
		else {
			const e = o[u];
			for (let t = 1; t < n; t++) Hy(e, e.theta1 + e.delta * t / n, f), c[h++] = f.x, c[h++] = f.y;
			c[h++] = t.x, c[h++] = t.y;
		}
		a = t.x, l = t.y;
	}
	return c;
}
function Yy(t, n, e, r, o, s) {
	const i = o - e, a = s - r, l = i * i + a * a;
	if (l <= 1e-24) return Math.hypot(t - e, n - r);
	const c = Math.min(Math.max(((t - e) * i + (n - r) * a) / l, 0), 1);
	return Math.hypot(t - (e + i * c), n - (r + a * c));
}
function _y(t, n, e, r, o) {
	if (0 === o.length) return 1 / 0;
	const s = function(t, n) {
		const e = t.length >> 1, r = n.length >> 1, o = new Float64Array(e);
		if (0 === r) return o.fill(1 / 0);
		let s = 0;
		const i = Math.min(Math.max(r >> 3, 16), 512);
		for (let a = 0; a < e; a++) {
			const l = t[2 * a], c = t[2 * a + 1], h = e > 1 ? Math.floor(a * (r - 1) / (e - 1)) : 0, f = Math.max(h, Math.max(s - (i >> 1), 0)), u = Math.max(f - i, 0), y = Math.min(f + i, r - 1);
			let d = 1 / 0, p = s;
			for (let t = u; t <= y; t++) {
				const e = l - n[2 * t], r = c - n[2 * t + 1], o = e * e + r * r;
				o < d && (d = o, p = t);
			}
			s = p;
			let g = Math.sqrt(d);
			const m = n[2 * p], x = n[2 * p + 1];
			p > 0 && (g = _a(g, Yy(l, c, n[2 * p - 2], n[2 * p - 1], m, x))), p + 1 < r && (g = _a(g, Yy(l, c, m, x, n[2 * p + 2], n[2 * p + 3]))), o[a] = g;
		}
		return o;
	}(t, Qy(e, r, o, .25));
	let i = 0;
	for (let a = 0; a < s.length; a++) {
		const t = Ya(a < n.length ? n[a] : .5, .001);
		i += s[a] / t * (s[a] / t);
	}
	return i;
}
const Vy = 10;
var Jy = class {
	m;
	win = new Float64Array(Vy);
	mat = /* @__PURE__ */ new Float64Array(9);
	rhs = /* @__PURE__ */ new Float64Array(3);
	sol = /* @__PURE__ */ new Float64Array(3);
	constructor(t, n) {
		const e = t.length >> 1;
		this.m = new Float64Array(Vy * (e + 1));
		const r = new Float64Array(Vy);
		for (let o = 0; o < e; o++) {
			const e = Ya(o < n.length ? n[o] : .5, .001), s = 1 / (e * e), i = t[2 * o], a = t[2 * o + 1], l = i * i + a * a;
			r[0] += s, r[1] += s * i, r[2] += s * a, r[3] += s * l, r[4] += s * i * i, r[5] += s * i * a, r[6] += s * a * a, r[7] += s * i * l, r[8] += s * a * l, r[9] += s * l * l, this.m.set(r, Vy * (o + 1));
		}
	}
	window(t, n) {
		const e = Vy * t, r = Vy * (n + 1);
		for (let o = 0; o < Vy; o++) this.win[o] = this.m[r + o] - this.m[e + o];
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
		const s = this.window(t, n), i = -2 * e, a = -2 * r, l = e * e + r * r - o * o;
		return Math.max(td(s, i, a, l), 0) / (4 * o * o);
	}
	fit(t, n) {
		const e = this.window(t, n);
		if (e[0] <= 0) return null;
		const r = this.mat;
		if (r[0] = e[4], r[1] = e[5], r[2] = e[1], r[3] = e[5], r[4] = e[6], r[5] = e[2], r[6] = e[1], r[7] = e[2], r[8] = e[0], this.rhs[0] = -e[7], this.rhs[1] = -e[8], this.rhs[2] = -e[3], !rl(r, this.rhs, this.sol)) return null;
		const o = this.sol[0], s = this.sol[1], i = this.sol[2], a = .25 * (o * o + s * s) - i;
		if (!(Number.isFinite(a) && a > 1e-12)) return null;
		const l = td(e, o, s, i);
		return {
			cx: -.5 * o,
			cy: -.5 * s,
			r: Math.sqrt(a),
			chi2: Math.max(l, 0) / (4 * a)
		};
	}
};
function td(t, n, e, r) {
	return t[9] + n * n * t[4] + e * e * t[6] + r * r * t[0] + 2 * (n * t[7] + e * t[8] + r * t[3] + n * e * t[5] + n * r * t[1] + e * r * t[2]);
}
function nd(t, n, e, r, o) {
	const s = e - t, i = r - n;
	o[0] = s * (n + .5 * i), o[1] = s * (t * n + .5 * (t * i + n * s) + s * i / 3), o[2] = s * (n * n + n * i + i * i / 3);
}
function ed(t) {
	const n = t * (1 / Math.PI) * .5;
	return 2 * Math.PI * (n - ((e = n) < 0 ? -Math.round(-e) : Math.round(e)));
	var e;
}
function rd(t, n, e, r, o, s, i) {
	const a = e - t, l = r - n, c = a * a + l * l;
	if (c < 1e-18 || !Number.isFinite(c)) return null;
	const h = Math.atan2(l, a), f = ed(Math.atan2(o.y, o.x) - h), u = ed(h - Math.atan2(s.y, s.x));
	let y = i[0], d = i[1], p = i[2];
	y -= a * (n + .5 * l);
	const g = l / 3;
	d -= a * (t * n + .5 * (t * l + n * a) + g * a), p -= a * (n * n + n * l + g * l), d -= t * y, p = .5 * p - n * y;
	const m = 1 / c;
	return {
		th0: f,
		th1: u,
		area: y * m,
		mx: (a * d + l * p) * m * m,
		chord: Math.sqrt(c)
	};
}
function od(t, n) {
	t.length < 4 && t.push(n);
}
function sd(t, n, e, r) {
	const o = Math.sin(t), s = Math.cos(t), i = Math.sin(n), a = Math.cos(n), l = -9 * s * (((2 * i * a * s + o * (2 * a * a - 1)) * s - 2 * i * a) * s - a * a * o), c = 12 * ((((a * (30 * e * a - i) - 15 * e) * s + 2 * o - a * o * (a + 30 * e * i)) * s + a * (i - 15 * e * a)) * s - o * a * a), h = 12 * ((((70 * r + 15 * e) * i * i + a * (9 * i - 70 * a * r - 5 * a * e)) * s - 5 * o * i * (3 * i - 4 * a * (7 * r + e))) * s - a * (9 * i - 70 * a * r - 5 * a * e)), f = 16 * (((12 * o - 5 * s * (42 * r - 17 * e)) * i - 70 * a * (3 * r - e) * o - 75 * s * a * e * e) * i - 75 * a * a * e * e * o), u = 80 * i * (42 * i * r - 25 * e * (i - a * e)), y = [], d = 1e-12;
	if (Math.abs(l) > d) {
		const t = function(t, n, e, r, o) {
			const s = 9 * t * t - 24 * n, i = s >= 0 ? -2 * n / (3 * t + Za(Math.sqrt(s), t)) : -.25 * t, a = t + 4 * i, l = n + 3 * i * (t + 2 * i), c = e + i * (2 * n + i * (3 * t + 4 * i)), h = r + i * (e + i * (n + i * (t + i)));
			let f, u;
			const y = 349e100;
			if (o) {
				const t = a / y, n = l / y, e = c / y, r = h / y;
				f = t * e - 4 / y * r - 1 / 3 * (n * n), u = 1 / 3 * (t * e + 8 / y * r - 2 / 9 * (n * n)) * n - e * (e / y) - t * t * r;
			} else f = a * c - 4 * h - 1 / 3 * (l * l), u = 1 / 3 * (a * c + 8 * h - 2 / 9 * (l * l)) * l - c * c - a * a * h;
			if (!Number.isFinite(f) || !Number.isFinite(u)) return null;
			let d = function(t, n) {
				const e = -1 / 3 * t, r = .5 * n;
				let o, s;
				if (o = Math.abs(e) < 1e102 && Math.abs(r) < 1e154 ? null : Math.abs(e) < Math.abs(r) ? 1 - e * (e / r * (e / r)) : Qa(e) * (r / e * (r / e) / e - 1), null !== o && 0 === r) s = t > 0 ? 0 : Math.sqrt(-t);
				else if (null !== o ? o < 0 : r * r < e * e * e) {
					const t = null !== o ? r / e / Math.sqrt(e) : r / Math.sqrt(e * e * e);
					s = -2 * Math.sqrt(e) * Za(Math.cos(Math.acos(Math.abs(t)) * (1 / 3)), t);
				} else {
					let t;
					t = null !== o ? Math.abs(e) < Math.abs(r) ? -r * (1 + Math.sqrt(o)) : -r - Za(Math.sqrt(Math.abs(e)) * e * Math.sqrt(o), r) : -r - Za(Math.sqrt(r * r - e * e * e), r);
					const n = Math.cbrt(t);
					s = n + (0 === n ? 0 : e / n);
				}
				let i = s, a = (i * i + t) * i + n;
				if (Math.abs(a) < 222045e-21 * Ya(Ya(i * i * i, t * i), n)) return i;
				for (let l = 0; l < 8; l++) {
					const e = 3 * i * i + t;
					if (0 === e) break;
					const r = i - a / e, o = (r * r + t) * r + n;
					if (0 === o) return r;
					if (Math.abs(o) >= Math.abs(a)) break;
					i = r, a = o;
				}
				return i;
			}(f, u);
			o && (d *= y);
			const p = .5 * t, g = 1 / 6 * n + .5 * d, m = e - t * g, x = 2 / 3 * n - d - p * p, M = 2 * (r - g * g) / m, w = [
				[x, .5 * m / x],
				[.5 * m / M, M],
				[x, M]
			];
			let b, A, k, v, F = 0, I = 0, N = 0;
			for (let P = 0; P < 3; P++) {
				const [t, o] = w[P], s = Ja(t + p * p + 2 * g, n) + Ja(2 * (t * o + p * g), e) + Ja(t * o * o + g * g, r);
				(0 === P || s < N) && (F = t, I = o, N = s);
			}
			if (F < 0) {
				const o = Math.sqrt(-F);
				if (b = p + o, A = g + o * I, k = p - o, v = g - o * I, Math.abs(v) < Math.abs(A) ? v = r / A : Math.abs(v) > Math.abs(A) && (A = r / v), Math.abs(b) !== Math.abs(k)) {
					let r;
					r = Math.abs(b) < Math.abs(k) ? [
						[t - k, k],
						[(e - A * k) / v, k],
						[(n - v - A) / k, k]
					] : [
						[b, t - b],
						[b, (e - b * v) / A],
						[b, (n - v - A) / b]
					];
					let o = 0;
					for (let s = 0; s < 3; s++) {
						const [i, a] = r[s];
						if (Number.isFinite(i) && Number.isFinite(a)) {
							const r = tl(i, A, a, v, t, n, e);
							(0 === s || r < o) && (b = i, k = a, o = r);
						}
					}
				}
			} else {
				if (0 !== F) return null;
				{
					const t = r - g * g;
					b = p, A = g + Math.sqrt(-t), k = p, v = g - Math.sqrt(-t), Math.abs(A) > Math.abs(v) ? v = r / A : Math.abs(v) > Math.abs(A) && (A = r / v);
				}
			}
			let S = nl(b, A, k, v, t, n, e, r);
			for (let P = 0; P < 8 && 0 !== S; P++) {
				const o = A * v - r, s = A * k + b * v - e, i = A + b * k + v - n, a = b + k - t, l = b - k, c = A * A - A * (k * l + 2 * v) + v * (b * l + v);
				if (0 === c) break;
				const h = 1 / c, f = v - A, u = A * k - b * v, y = b - h * (l * o + f * s + u * i - (A * f + b * u) * a), d = A - h * ((b * l + f) * o - A * l * s - A * f * i - A * u * a), p = k - h * (-l * o - f * s - u * i + (k * u + v * f) * a), g = v - h * (-(k * l + f) * o + v * l * s + v * f * i + v * u * a), m = nl(y, d, p, g, t, n, e, r);
				if (!(m < S)) break;
				b = y, A = d, k = p, v = g, S = m;
			}
			return [
				b,
				A,
				k,
				v
			];
		}(c / l, h / l, f / l, u / l, !1);
		if (t) for (let n = 0; n < 2; n++) {
			const e = t[2 * n], r = Va(t[2 * n + 1], e, 1);
			if (0 === r.length) od(y, -.5 * e);
			else for (const t of r) od(y, t);
		}
	} else if (Math.abs(c) > d) for (const m of function(t, n, e, r) {
		const o = 1 / r, s = 1 / 3, i = e * (s * o), a = n * (s * o), l = t * o;
		if (!(Number.isFinite(l) && Number.isFinite(a) && Number.isFinite(i))) return Va(t, n, e);
		const c = -i * i + a, h = -a * i + l, f = 4 * c * (i * l - a * a) - h * h, u = -2 * i * c + h;
		if (f < 0) {
			const t = Math.sqrt(-.25 * f), n = -.5 * u;
			return [Math.cbrt(n + t) + Math.cbrt(n - t) - i];
		}
		if (0 === f) {
			const t = Za(Math.sqrt(-c), u);
			return [t - i, -2 * t - i];
		}
		const y = Math.atan2(Math.sqrt(f), -u) * s, d = Math.sin(y), p = Math.cos(y), g = d * Math.sqrt(3), m = .5 * (-p + g), x = .5 * (-p - g), M = 2 * Math.sqrt(-c);
		return [
			M * p - i,
			M * m - i,
			M * x - i
		];
	}(u, f, h, c)) od(y, m);
	else {
		if (!(Math.abs(h) > d || Math.abs(f) > d || Math.abs(u) > d)) return [1 / 3, 1 / 3];
		for (const t of Va(u, f, h)) od(y, t);
	}
	const p = [], g = o * a + i * s;
	for (const m of y) {
		let t, n;
		if (m > 0) {
			const r = (m * o - e * (10 / 3)) / (.5 * m * g - i);
			r > 0 ? (t = m, n = r) : (t = i / g, n = 0);
		} else t = 0, n = o / g;
		t >= 0 && n >= 0 && Number.isFinite(t) && Number.isFinite(n) && p.length < 8 && p.push(t, n);
	}
	return p;
}
function id(t, n, e, r, o, s, i, a, l) {
	return {
		x0: t,
		y0: n,
		x1: t + o.x * a * i,
		y1: n + o.y * a * i,
		x2: e - s.x * l * i,
		y2: r - s.y * l * i,
		x3: e,
		y3: r
	};
}
function ad(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function ld(t, n, e, r) {
	let o = ad(r);
	for (let u = 0; u < 3; u++) {
		const r = 1 - o, s = r * r * r, i = 3 * r * r * o, a = 3 * r * o * o, l = o * o * o, c = s * t.x0 + i * t.x1 + a * t.x2 + l * t.x3 - n, h = s * t.y0 + i * t.y1 + a * t.y2 + l * t.y3 - e, f = 3 * r * r, u = 6 * r * o, y = 3 * o * o, d = f * (t.x1 - t.x0) + u * (t.x2 - t.x1) + y * (t.x3 - t.x2), p = f * (t.y1 - t.y0) + u * (t.y2 - t.y1) + y * (t.y3 - t.y2), g = d * d + p * p;
		if (g < 1e-18) break;
		const m = ad(o - (c * d + h * p) / g);
		if (m === o) break;
		o = m;
	}
	const s = 1 - o, i = s * s * s, a = 3 * s * s * o, l = 3 * s * o * o, c = o * o * o, h = i * t.x0 + a * t.x1 + l * t.x2 + c * t.x3 - n, f = i * t.y0 + a * t.y1 + l * t.y2 + c * t.y3 - e;
	return h * h + f * f;
}
function cd(t, n, e, r, o) {
	return Math.min(t + 1 + Math.floor((e + .5) * r / o), n - 1);
}
var hd = class t {
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
		const i = Math.min(s, 32), a = Math.max(e[o] - e[r], 1e-12);
		this.len = i, this.weight = s / i;
		for (let l = 0; l < i; l++) {
			const c = cd(r, o, l, s, i), h = Ya(n[c], 1e-6);
			this.px[l] = t[2 * c], this.py[l] = t[2 * c + 1], this.t[l] = (e[c] - e[r]) / a, this.s2[l] = h * h;
		}
		return !0;
	}
	chi2(t, n) {
		let e = 0;
		for (let r = 0; r < this.len; r++) if (e += this.weight * ld(t, this.px[r], this.py[r], this.t[r]) / this.s2[r], e >= n) return e;
		return e;
	}
};
function fd(t, n, e, r, o, s, i) {
	const a = Math.max(o - r - 1, 0);
	if (0 === a) return 0;
	const l = i ? Math.min(a, 32) : a, c = a / l, h = Math.max(e[o] - e[r], 1e-12);
	let f = 0;
	for (let u = 0; u < l; u++) {
		const i = cd(r, o, u, a, l), y = Ya(n[i], 1e-6);
		f += c * ld(s, t[2 * i], t[2 * i + 1], (e[i] - e[r]) / h) / (y * y);
	}
	return f;
}
const ud = new hd();
function yd(t, n, e, r, o, s, i, a, l) {
	const c = t[2 * r], h = t[2 * r + 1], f = t[2 * o], u = t[2 * o + 1], y = rd(c, h, f, u, s, i, a);
	if (!y) return null;
	const d = l && ud.fill(t, n, e, r, o) ? ud : null, p = sd(y.th0, y.th1, y.area, y.mx);
	let g = null;
	for (let m = 0; m < p.length; m += 2) {
		const a = p[m], x = p[m + 1];
		if (a > 1 || x > 1) continue;
		const M = id(c, h, f, u, s, i, y.chord, a, x), w = g ? g.chi2 : 1 / 0, b = d ? d.chi2(M, w) : fd(t, n, e, r, o, M, l);
		(null === g || b < g.chi2) && (g = {
			chi2: b,
			d0: a,
			d1: x
		});
	}
	return g;
}
function dd(t) {
	return t < .001 ? .001 : t > 1.5 ? 1.5 : t;
}
function pd(t, n, e, r, o, s, i, a, l) {
	const c = t[2 * r], h = t[2 * r + 1], f = t[2 * o], u = t[2 * o + 1], y = Math.hypot(c - f, h - u), d = (a, l) => fd(t, n, e, r, o, id(c, h, f, u, s, i, y, a, l), !1);
	let p = dd(a), g = dd(l), m = d(p, g);
	const x = .001;
	for (let M = 0; M < 12; M++) {
		const t = d(p + x, g), n = d(p - x, g), e = d(p, g + x), r = d(p, g - x), o = (t - n) / (2 * x), s = (e - r) / (2 * x), i = (t - 2 * m + n) / (x * x), a = (e - 2 * m + r) / (x * x), l = (d(p + x, g + x) - t - e + m) / (x * x), c = i * a - l * l;
		let h, f;
		if (i > 0 && c > 0) h = -(a * o - l * s) / c, f = -(i * s - l * o) / c;
		else {
			const t = Ya(Math.hypot(o, s), 1e-12);
			h = -.05 * o / t, f = -.05 * s / t;
		}
		let u = 1, y = !1;
		for (; u > 1e-4;) {
			const t = dd(p + u * h), n = dd(g + u * f), e = d(t, n);
			if (e < m) {
				const r = m - e;
				p = t, g = n, m = e, y = r > 1e-9 * Ya(m, 1);
				break;
			}
			u *= .5;
		}
		if (!y) break;
	}
	return {
		chi2: m,
		d0: p,
		d1: g
	};
}
const gd = Math.PI / 180;
function md(t, n, e, r, o, s, i, a) {
	let l = 0;
	return (e > 0 || a) && (l += xl(t.outgoing[e], o, i)), (r + 1 < n || a) && (l += xl(s, t.incoming[r], i)), l;
}
const xd = {
	x: 0,
	y: 0
};
function Md(t, n) {
	let e = t - n;
	return e > Math.PI ? e -= 2 * Math.PI : e < -Math.PI && (e += 2 * Math.PI), e;
}
var wd = class {
	n;
	offset = 0;
	fits = /* @__PURE__ */ new Map();
	constructor(t) {
		this.n = t;
	}
	fit(t, n, e, r) {
		const o = (this.offset + e) % this.n * (this.n + 1) + (r - e);
		let s = this.fits.get(o);
		return void 0 === s && (s = zl(t, n), this.fits.set(o, s)), s;
	}
};
var bd = class t {
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
			const s = Ya(Ya(2 * (n - t - e), r), 2 * o);
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
const Ad = Object.freeze({ kind: "untried" }), kd = Object.freeze({
	kind: "dead",
	over: !0
}), vd = Object.freeze({
	kind: "dead",
	over: !1
}), Fd = new hd();
let Id = 0;
function Nd(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function Sd(t, n, e, r) {
	const { x0: o, y0: s, x1: i, y1: a, x2: l, y2: c, x3: h, y3: f } = n, u = i - o, y = a - s, d = l - i, p = c - a, g = h - l, m = f - c, { px: x, py: M, t: w, s2: b, weight: A } = t;
	let k = 0;
	for (let v = 0; v < t.len; v++) {
		const t = x[v], n = M[v];
		let F = Nd(w[v]);
		for (let e = 0; e < 3; e++) {
			const e = 1 - F, r = e * e * e, x = 3 * e * e * F, M = 3 * e * F * F, w = F * F * F, b = r * o + x * i + M * l + w * h - t, A = r * s + x * a + M * c + w * f - n, k = 3 * e * e, v = 6 * e * F, I = 3 * F * F, N = k * u + v * d + I * g, S = k * y + v * p + I * m, P = N * N + S * S;
			if (P < 1e-18) break;
			const C = Nd(F - (b * N + A * S) / P);
			if (C === F) break;
			F = C;
		}
		const I = 1 - F, N = I * I * I, S = 3 * I * I * F, P = 3 * I * F * F, C = F * F * F, U = N * o + S * i + P * l + C * h - t, L = N * s + S * a + P * c + C * f - n;
		if (k += A * (U * U + L * L) / b[v], k >= e) return Id = 1, k;
		if (k >= r.trigger && r.drops(k)) return Id = 2, k;
	}
	return Id = 0, k;
}
function Pd(t, n, e, r, o, s, i, a) {
	const l = yd(t, n, e, r, o, s, i, a, !0);
	return l ? {
		kind: "exact",
		chi2: l.chi2,
		d0: l.d0,
		d1: l.d1
	} : Ad;
}
function Cd(t, n, e, r, o, s, i, a, l) {
	const c = t[2 * r], h = t[2 * r + 1], f = t[2 * o], u = t[2 * o + 1], y = rd(c, h, f, u, s, i, a);
	if (!y) return Ad;
	if (!Fd.fill(t, n, e, r, o)) return Pd(t, n, e, r, o, s, i, a);
	const d = Fd;
	let p = !1, g = 1 / 0, m = 0, x = 0, M = !1, w = !1, b = !0;
	const A = sd(y.th0, y.th1, y.area, y.mx);
	for (let k = 0; k < A.length; k += 2) {
		const v = A[k], F = A[k + 1];
		if (v > 1 || F > 1) continue;
		M = !0;
		const I = Sd(d, id(c, h, f, u, s, i, y.chord, v, F), p ? g : 1 / 0, l);
		if (0 === Id) {
			if (!Number.isFinite(I)) return Pd(t, n, e, r, o, s, i, a);
			if ((!p || I < g) && (p = !0, g = I, m = v, x = F), .5 * I <= l.overFloor && (b = !1, l.best === -1 / 0)) return vd;
		} else 2 === Id && (w = !0);
	}
	return M ? !p || w && l.dead(g) ? p && g < l.gate ? Pd(t, n, e, r, o, s, i, a) : b ? kd : vd : {
		kind: "exact",
		chi2: g,
		d0: m,
		d1: x
	} : Ad;
}
var Ud = class t {
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
const Ld = Math.PI / 6;
function $d(t, n, e) {
	if (2 * n.length !== t.length) throw new Error("sigma must be per-point");
	const r = new Float64Array(n.length);
	for (let o = 0; o < r.length; o++) r[o] = Ya(n[o], 1e-6);
	return {
		points: Float64Array.from(t),
		sigma: r,
		closed: e
	};
}
function qd(t) {
	return t.points.length >> 1;
}
var Rd = class {
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
			const s = t[2 * o], i = t[2 * o + 1], a = 1 / (n[o] * n[o]);
			this.w[o + 1] = this.w[o] + a, this.x[o + 1] = this.x[o] + s * a, this.y[o + 1] = this.y[o] + i * a, this.xx[o + 1] = this.xx[o] + s * s * a, this.yy[o + 1] = this.yy[o] + i * i * a, this.xy[o + 1] = this.xy[o] + s * i * a, o + 1 < e && (nd(s, i, t[2 * o + 2], t[2 * o + 3], r), this.ga[o + 1] = this.ga[o] + r[0], this.gx[o + 1] = this.gx[o] + r[1], this.gy[o + 1] = this.gy[o] + r[2]);
		}
	}
	chi2Line(t, n) {
		if (n <= t) return 0;
		const e = t, r = n + 1, o = this.w[r] - this.w[e];
		return o <= 0 ? 0 : function(t, n, e, r, o, s) {
			const i = r - n * n / t, a = o - e * e / t, l = s - n * e / t, c = i + a, h = i - a, f = Math.sqrt(Math.max(h * h + 4 * l * l, 0));
			return Math.max(.5 * (c - f), 0);
		}(o, this.x[r] - this.x[e], this.y[r] - this.y[e], this.xx[r] - this.xx[e], this.yy[r] - this.yy[e], this.xy[r] - this.xy[e]);
	}
	rawMoments(t, n, e) {
		return e[0] = this.ga[n] - this.ga[t], e[1] = this.gx[n] - this.gx[t], e[2] = this.gy[n] - this.gy[t], e;
	}
};
function zd(t, n) {
	if (!t.closed || n.length < 2) return !1;
	if (n[0] === n[n.length - 1]) return !0;
	const e = qd(t), r = t.points;
	return 0 === n[0] && n[n.length - 1] === e - 1 && Math.hypot(r[0] - r[2 * e - 2], r[1] - r[2 * e - 1]) < 1e-9;
}
function Td(t, n, e) {
	let r = 0;
	for (const d of e) r += d;
	if (t.length < 2 || r <= 0) return null;
	let o = 0, s = 0;
	for (let d = 0; d < t.length; d++) o += t[d] * e[d];
	for (let d = 0; d < t.length; d++) s += n[d] * e[d];
	o /= r, s /= r;
	let i = 0, a = 0, l = 0;
	for (let d = 0; d < t.length; d++) {
		const r = t[d] - o, c = n[d] - s;
		i += e[d] * r * r, a += e[d] * c * c, l += e[d] * r * c;
	}
	const c = i - a, h = .5 * (i + a + Math.sqrt(Math.max(c * c + 4 * l * l, 0)));
	let f, u;
	Math.abs(l) > 1e-12 ? (f = h - a, u = l) : i >= a ? (f = 1, u = 0) : (f = 0, u = 1);
	const y = Math.hypot(f, u);
	return y <= 1e-12 ? null : {
		px: o,
		py: s,
		dx: f / y,
		dy: u / y
	};
}
function Ed(t, n, e) {
	const r = qd(t), o = t.points, s = o[2 * n], i = o[2 * n + 1], a = o[2 * e], l = o[2 * e + 1], c = [], h = [], f = [];
	let u = n;
	for (; !(c.push(o[2 * u]), h.push(o[2 * u + 1]), f.push(1 / (t.sigma[u] * t.sigma[u])), u === e || (u = (u + 1) % r, c.length > r)););
	const y = [], d = [], p = [];
	for (let g = 0; g < c.length; g++) {
		const t = Math.hypot(c[g] - s, h[g] - i), n = Math.hypot(c[g] - a, h[g] - l);
		t > 1 && n > 1 && (y.push(c[g]), d.push(h[g]), p.push(f[g]));
	}
	return y.length >= 3 ? Td(y, d, p) : Td(c, h, f);
}
function jd(t) {
	let n = 0;
	for (const e of t.segments) n += By(e);
	return 2 + n;
}
function Bd(t, n, e) {
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
var Od = class {
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
}, Kd = class {
	cost = 1 / 0;
	kind = "line";
	d0 = NaN;
	d1 = NaN;
	tans = null;
	arc = null;
}, Dd = class {
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
const Hd = /* @__PURE__ */ new Float64Array(1), Xd = new Uint32Array(Hd.buffer), Wd = 1 === new Uint8Array(new Uint16Array([1]).buffer)[0] ? 0 : 1, Gd = 1 - Wd;
function Zd(t) {
	return Number.isNaN(t) || t === 1 / 0 ? t : 0 === t ? Number.MIN_VALUE : (Hd[0] = t, t > 0 ? (Xd[Wd] += 1, 0 === Xd[Wd] && (Xd[Gd] += 1)) : (0 === Xd[Wd] && (Xd[Gd] -= 1), Xd[Wd] -= 1), Hd[0]);
}
var Qd = class t {
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
	abandon = new bd();
	abandonOver = new bd();
	winner = new Kd();
	rival = new Kd();
	constructor(t, n, e, r, o, s, i) {
		this.pts = t, this.sigma = n, this.tan = e, this.pre = r, this.cfg = o, this.joinsAtEnds = s, this.ellipses = i, this.n = t.length >> 1, this.circles = new Jy(t, n), this.cubicFloor = o.lambda * Ha(), this.arcFloor = o.lambda * Wa(), this.ellipseFloor = 7 * o.lambda;
	}
	static ellipseAsked(t, n, e) {
		return !(null !== e && e.chi2 <= 4 * (n - t)) && n >= t + 2;
	}
	cutoffFloor(t, n) {
		return 4 * this.cfg.lambda * 2 * (n - t);
	}
	terms(t, n, e, r) {
		const { pts: o, tan: s, cfg: i } = this, a = this.pre.chi2Line(t, n), l = function(t, n, e, r, o, s, i) {
			xd.x = t[2 * r] - t[2 * e], xd.y = t[2 * r + 1] - t[2 * e + 1];
			const a = md(n, t.length >> 1, e, r, xd, xd, s.lambda, i);
			return .5 * o + 2 * s.lambda + a;
		}(o, s, t, n, a, i, this.joinsAtEnds);
		let c = null;
		!(e + this.arcFloor >= r && e + l >= r) && n >= t + 2 && (l > this.arcFloor || a > n - t) && (c = function(t, n, e, r, o, s, i) {
			const a = function(t, n, e, r) {
				if (r < e + 2) return null;
				const o = n.fit(e, r);
				if (!o) return null;
				const { cx: s, cy: i, r: a } = o;
				if (!Number.isFinite(a) || a <= 1e-6) return null;
				if (a > 1e3 * Math.max(n.scale(e, r), 1)) return null;
				const l = Math.max(Math.floor((r - e) / 8), 1), c = t[2 * e], h = t[2 * e + 1], f = t[2 * r], u = t[2 * r + 1];
				let y = 0, d = c - s, p = h - i, g = e;
				for (; g < r;) {
					g = Math.min(g + l, r);
					const n = t[2 * g] - s, e = t[2 * g + 1] - i, o = d * e - p * n;
					if (Math.abs(o) > 1e-12) {
						if (0 === y) y = Qa(o);
						else if (Qa(o) !== y) return null;
					}
					d = n, p = e;
				}
				if (0 === y) return null;
				const m = c - s, x = h - i, M = f - s, w = u - i;
				let b = Math.atan2(m * w - x * M, m * M + x * w);
				if (0 === b || Qa(b) !== y) return null;
				if (b = Math.abs(b), !(b >= .001 && b <= Math.PI / 180 * 120)) return null;
				const A = y > 0, k = A ? Ky(-x, m) : Ky(x, -m), v = A ? Ky(-w, M) : Ky(w, -M);
				if (!k || !v) return null;
				const F = b > Math.PI, I = .5 * (Math.hypot(c - s, h - i) + Math.hypot(f - s, u - i)), N = function(t, n, e, r, o, s, i) {
					const a = Wy(t, n, e, e, 0, r, o, s, i);
					return {
						cx: a.cx,
						cy: a.cy,
						r: a.rx,
						theta1: a.theta1,
						delta: a.delta
					};
				}(c, h, I, F, A, f, u);
				return {
					chi2: n.residualAbout(e, r, N.cx, N.cy, N.r),
					radius: I,
					largeArc: F,
					sweep: A,
					t0: k,
					t1: v
				};
			}(t, e, r, o);
			if (!a) return null;
			const l = md(n, t.length >> 1, r, o, a.t0, a.t1, s.lambda, i);
			return {
				cost: .5 * a.chi2 + s.lambda * Wa() + l,
				chi2: a.chi2,
				radius: a.radius,
				largeArc: a.largeArc,
				sweep: a.sweep,
				t0: a.t0,
				t1: a.t1
			};
		}(o, s, this.circles, t, n, i, this.joinsAtEnds));
		const h = l + (c ? (f = a, 4 * c.chi2 < f ? (n - t) * Math.LN2 : 0) : 0);
		var f;
		const u = this.cutoffFloor(t, n), y = .5 * a > u;
		this.line = h, this.circle = c, this.hasG1 = !1, this.over = 0, n >= t + 2 && h > this.cubicFloor && this.cubicTerms(t, n, e, r, y, u);
	}
	cubicTerms(t, n, e, r, o, s) {
		const { pts: i, tan: a, cfg: l } = this;
		if (e + this.cubicFloor >= r) return void (o && (this.over = 2));
		const c = e + this.ellipseFloor >= r ? 0 : 2 * (this.ellipseFloor - this.cubicFloor + 1e-9 * (Math.abs(r) + l.lambda)), h = r === 1 / 0 ? bd.NONE : this.abandon.reset(e, r, this.cubicFloor, c, o ? s : -1 / 0), f = a.outgoing[t], u = a.incoming[n], y = this.pre.rawMoments(t, n, this.raw), d = Cd(i, this.sigma, this.pre.s, t, n, f, u, y, h);
		if ("exact" === d.kind) {
			const e = i[2 * t], r = i[2 * t + 1], a = i[2 * n], c = i[2 * n + 1], h = id(e, r, a, c, f, u, Math.hypot(a - e, c - r), d.d0, d.d1);
			this.hasG1 = !0, this.g1Chi2 = d.chi2, this.g1Wobble = function(t, n) {
				let e = 0;
				(function(t) {
					const n = t.x1 - t.x0, e = t.y1 - t.y0, r = t.x2 - t.x1, o = t.y2 - t.y1, s = t.x3 - t.x2, i = n * o - e * r, a = r * (t.y3 - t.y2) - o * s, l = (t.x3 - t.x0) ** 2 + (t.y3 - t.y0) ** 2;
					return i * a < -1e-6 * Math.max(l, 1);
				})(t) && (e += 2 * n * 1);
				const r = function(t) {
					const n = (t.x3 - t.x0) ** 2 + (t.y3 - t.y0) ** 2;
					if (n <= 1e-12) return 0;
					const e = t.x2 - 2 * t.x1 + t.x0, r = t.y2 - 2 * t.y1 + t.y0, o = t.x3 - 2 * t.x2 + t.x1, s = t.y3 - 2 * t.y2 + t.y1;
					return 12 * (e * e + r * r + (e * o + r * s) + (o * o + s * s)) / n;
				}(t);
				return r > 2.5 && (e += Math.min(r - 2.5, 10) * n * 1 * .5), e;
			}(h, l.lambda), this.g1Turn = l.lambda * function(t, n) {
				const e = Ga();
				return Number.isFinite(e) && ml(t, n) > e ? Ha() : 0;
			}(f, u), this.g1D0 = d.d0, this.g1D1 = d.d1, o && .5 * d.chi2 > s && (this.over = 1);
		} else "dead" === d.kind && o && d.over && (this.over = 1);
	}
	cubicOver(t, n) {
		const e = this.cutoffFloor(t, n), r = Cd(this.pts, this.sigma, this.pre.s, t, n, this.tan.outgoing[t], this.tan.incoming[n], this.pre.rawMoments(t, n, this.raw), this.abandonOver.overOnly(e));
		return "exact" === r.kind ? .5 * r.chi2 > e : "dead" === r.kind && r.over;
	}
	resolve(n, e, r, o, s) {
		const i = this.cubicFloor;
		let a = r + this.line, l = "line", c = NaN, h = NaN, f = null, u = null;
		if (this.hasG1) {
			const t = r + .5 * this.g1Chi2 + i + this.g1Wobble + this.g1Turn;
			t < a && (a = t, l = "cubic", c = this.g1D0, h = this.g1D1);
		}
		const y = this.circle;
		if (y) {
			const t = r + y.cost;
			t < a && (a = t, l = "arc", c = NaN, h = NaN, f = {
				t0: y.t0,
				t1: y.t1
			}, u = {
				rx: y.radius,
				ry: y.radius,
				phi: 0,
				largeArc: y.largeArc,
				sweep: y.sweep
			});
		}
		if (t.ellipseAsked(n, e, y) && a - r > this.ellipseFloor && !(this.bounds && r + this.ellipseFloor >= o)) {
			const t = function(t, n, e, r, o, s, i, a) {
				if (o < r + 24 || (o - r) % 16 != 0) return null;
				const l = t.subarray(2 * r, 2 * o + 2), c = n.subarray(r, o + 1), h = a ? a.fit(l, c, r, o) : zl(l, c);
				if (!h) return null;
				if (!Number.isFinite(h.rx) || !Number.isFinite(h.ry) || h.rx <= 1e-6 || h.ry <= 1e-6) return null;
				const f = Ya(h.rx, h.ry);
				if (f / _a(h.rx, h.ry) > 12) return null;
				const u = l.length >> 1;
				let y = 0;
				for (let C = 0; C < u; C++) y = Ya(y, Math.hypot(l[2 * C] - l[0], l[2 * C + 1] - l[1]));
				if (f > 1e3 * Ya(y, 1)) return null;
				const d = function(t, n) {
					const e = Math.sin(n.angle), r = Math.cos(n.angle), o = (o) => {
						const s = t[2 * o] - n.cx, i = t[2 * o + 1] - n.cy, a = r * s + e * i, l = -e * s + r * i;
						return Math.atan2(l / n.ry, a / n.rx);
					}, s = t.length >> 1;
					let i = o(0);
					const a = Md(o(1), i) > 0;
					let l = 0;
					for (let h = 1; h < s; h++) {
						const t = o(h), n = Md(t, i);
						if (a && n < -.001 || !a && n > .001) return null;
						l += n, i = t;
					}
					const c = Math.abs(l);
					return c >= .001 && c <= 120 * gd ? {
						turn: c,
						ccw: a
					} : null;
				}(l, h);
				if (!d) return null;
				const p = Math.sin(h.angle), g = Math.cos(h.angle), m = (t, n) => {
					const e = t - h.cx, r = n - h.cy, o = -p * e + g * r, s = (g * e + p * r) / h.rx, i = o / h.ry;
					return Math.sqrt(s * s + i * i);
				}, x = l[0], M = l[1], w = l[2 * u - 2], b = l[2 * u - 1], A = .5 * (m(x, M) + m(w, b));
				if (!(A >= .5 && A <= 2)) return null;
				const k = d.turn > Math.PI, v = Wy(x, M, h.rx * A, h.ry * A, h.angle, k, d.ccw, w, b);
				if (Math.abs(v.delta) <= 1e-6) return null;
				const F = function(t, n, e, r, o, s, i) {
					const a = Math.sin(i), l = Math.cos(i), c = 1 / (o * o), h = 1 / (s * s), f = t.length >> 1;
					let u = 0;
					for (let y = 0; y < f; y++) {
						const o = t[2 * y] - e, s = t[2 * y + 1] - r, i = l * o + a * s, f = -a * o + l * s, d = i * i * c + f * f * h - 1, p = Math.sqrt(4 * i * i * c * c + 4 * f * f * h * h);
						if (p < 1e-12) return 1 / 0;
						const g = d / p, m = Ya(y < n.length ? n[y] : .5, .001);
						u += g / m * (g / m);
					}
					return u;
				}(l, c, v.cx, v.cy, v.rx, v.ry, v.phi);
				if (!Number.isFinite(F)) return null;
				const I = function(t) {
					const n = Math.sin(t.phi), e = Math.cos(t.phi), r = (r) => {
						const o = -t.rx * Math.sin(r), s = t.ry * Math.cos(r);
						let i = e * o - n * s, a = n * o + e * s;
						return t.delta > 0 || (i = -i, a = -a), Ky(i, a);
					}, o = r(t.theta1);
					if (!o) return null;
					const s = r(t.theta1 + t.delta);
					return s ? [o, s] : null;
				}(v);
				if (!I) return null;
				const [N, S] = I, P = md(e, t.length >> 1, r, o, N, S, s.lambda, i);
				return {
					cost: .5 * F + 7 * s.lambda + P,
					rx: v.rx,
					ry: v.ry,
					phi: v.phi,
					largeArc: k,
					sweep: d.ccw,
					t0: N,
					t1: S
				};
			}(this.pts, this.sigma, this.tan, n, e, this.cfg, this.joinsAtEnds, this.ellipses);
			if (t) {
				const n = r + t.cost;
				n < a && (a = n, l = "arc", c = NaN, h = NaN, f = {
					t0: t.t0,
					t1: t.t1
				}, u = {
					rx: t.rx,
					ry: t.ry,
					phi: t.phi,
					largeArc: t.largeArc,
					sweep: t.sweep
				});
			}
		}
		s.cost = a, s.kind = l, s.d0 = c, s.d1 = h, s.tans = f, s.arc = u;
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
		const n = this.n, e = new Od(n), r = [];
		for (let o = 1; o < n; o++) this.admit(e, r, o), Yd(r, (n) => t.allows(n.i, o)), 0 !== r.length && (this.endpoint(e, r, o), Yd(r, (t) => !t.stopped));
		return e;
	}
	admit(t, n, e) {
		const r = e - 1;
		if (!Number.isFinite(t.best[r])) return;
		const o = t.best[r] + (r > 0 ? Ml(this.tan, r, this.cfg) : 0);
		n.push({
			i: r,
			base: o,
			cut: new Dd(r),
			stopped: !1
		});
	}
	endpoint(t, n, e) {
		let r = n.length - 1;
		const o = t.from[e - 1];
		for (let l = 0; l < n.length; l++) if (n[l].i === o) {
			r = l;
			break;
		}
		let s = this.winner, i = this.rival;
		this.score(n[r], e, 1 / 0, s);
		let a = n[r].i;
		for (let l = 0; l < n.length; l++) {
			if (l === r) continue;
			const t = n[l], o = t.i < a ? Zd(s.cost) : s.cost;
			if (this.score(t, e, o, i), i.cost < s.cost || i.cost === s.cost && t.i < a) {
				const n = s;
				s = i, i = n, a = t.i;
			}
		}
		t.offer(a, e, s);
	}
	fillPush(t) {
		const n = this.n, e = new Od(n), r = this.winner;
		for (let o = 0; o < n - 1; o++) {
			if (!Number.isFinite(e.best[o])) continue;
			const s = e.best[o] + (o > 0 ? Ml(this.tan, o, this.cfg) : 0), i = new Dd(o), a = Math.min(o + t.maxSpan + 1, t.wallAfter(o) + 1, n);
			for (let t = o + 1; t < a; t++) {
				this.terms(o, t, 0, 1 / 0);
				const n = this.over;
				if (this.resolve(o, t, s, 1 / 0, r), e.offer(o, t, r), i.push(t, n, this, o)) break;
			}
		}
		return e;
	}
};
function Yd(t, n) {
	let e = 0;
	for (let r = 0; r < t.length; r++) n(t[r]) && (t[e++] = t[r]);
	t.length = e;
}
function _d(t, n, e, r, o = {}) {
	const s = $d(t, n, e), i = qd(s);
	return Vd(s, tp(s, r, Ud.pinned(i, e, o.maxSpan ?? 1 / 0, o.forced ?? []), o));
}
function Vd(t, n) {
	const e = qd(t), r = t.points, o = n.path.segments.slice();
	let s = n.path.x0, i = n.path.y0;
	if (o.length > 0) {
		const n = o.length - 1;
		t.closed ? e >= 3 && (o[n] = Oy(o[n], s, i)) : (s = r[0], i = r[1], o[n] = Oy(o[n], r[2 * e - 2], r[2 * e - 1]));
	}
	const a = {
		x0: s,
		y0: i,
		segments: o,
		closed: t.closed
	};
	let l = 0;
	if (o.length > 0) if (t.closed && n.vertices.length > 0 && 0 !== n.vertices[0]) {
		const a = n.vertices[0], c = new Float64Array(2 * e), h = new Float64Array(e);
		for (let n = 0; n < e; n++) {
			const o = (a + n) % e;
			c[2 * n] = r[2 * o], c[2 * n + 1] = r[2 * o + 1], h[n] = t.sigma[o];
		}
		l = _y(c, h, s, i, o);
	} else l = _y(r, t.sigma, s, i, o);
	return {
		x0: s,
		y0: i,
		segments: o,
		closed: t.closed,
		params: jd(a),
		chi2: l
	};
}
const Jd = /* @__PURE__ */ new WeakMap();
function tp(t, n, e, r) {
	const o = qd(t);
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
			const r = qd(t), o = t.points, s = t.sigma;
			let i = Math.max(Math.ceil(r / e), 1);
			const a = [], l = [];
			for (;;) {
				const o = new Uint8Array(r);
				for (const e of np(t, i, n)) e >= 0 && (o[e] = 1);
				t.closed || (o[0] = 1, o[r - 1] = 1), a.length = 0, l.length = 0;
				let s = 0;
				const c = (t) => {
					const n = t - s;
					if (n <= 0) return;
					const e = Math.ceil(n / i);
					for (let r = 0; r < e; r++) a.push(s + Math.floor(r * n / e)), l.push(s + Math.floor((r + 1) * n / e));
				};
				for (let t = 0; t < r; t++) 0 !== o[t] && (c(t), a.push(t), l.push(t + 1), s = t + 1);
				if (c(r), a.length <= e || i >= r) break;
				i++;
			}
			const c = a.length, h = new Float64Array(2 * c), f = new Float64Array(c), u = [];
			for (let y = 0; y < c; y++) {
				let t = 0, n = 0, e = 0;
				for (let i = a[y]; i < l[y]; i++) {
					const r = Ya(s[i], 1e-6), a = 1 / (r * r);
					t += a, n += a * o[2 * i], e += a * o[2 * i + 1];
				}
				const r = l[y] - a[y] === 1;
				h[2 * y] = r ? o[2 * a[y]] : n / t, h[2 * y + 1] = r ? o[2 * a[y] + 1] : e / t, f[y] = r ? s[a[y]] : 1 / Math.sqrt(t), u.push(a[y] + l[y] - 1 >> 1);
			}
			return {
				points: h,
				sigma: f,
				index: u
			};
		}(t, n, o), i = tp({
			points: s.points,
			sigma: s.sigma,
			closed: t.closed
		}, n, e, { maxPoints: o });
		if (i.vertices = i.vertices.map((t) => s.index[t]), r.postFit) {
			const { cx: e, cy: o, shifted: s } = ep(t);
			i.path = Bd(r.postFit(Bd(i.path, -e, -o), s, i.vertices, n, null), e, o);
		}
		return i;
	}(t, n, e, r, s);
	const { cx: i, cy: a, shifted: l } = ep(t);
	let c, h = Jd.get(t);
	if (void 0 === h && (h = new wd(o), Jd.set(t, h)), t.closed && o >= 3) c = function(t, n, e, r) {
		const o = qd(t), s = gl(t, n), i = (e, i) => {
			const a = function(t, n, e) {
				const r = qd(t), o = new Float64Array(2 * (r + 1)), s = new Float64Array(r + 1), i = [], a = [];
				for (let l = 0; l <= r; l++) {
					const c = (e + l) % r;
					o[2 * l] = t.points[2 * c], o[2 * l + 1] = t.points[2 * c + 1], s[l] = t.sigma[c], i.push(n.incoming[c]), a.push(n.outgoing[c]);
				}
				return {
					poly: {
						points: o,
						sigma: s,
						closed: !0
					},
					tan: {
						incoming: i,
						outgoing: a
					}
				};
			}(t, s, e);
			r.offset = e;
			const { sol: l, path: c } = sp(a.poly, a.tan, n, !0, i, r);
			return {
				path: c,
				vertices: l.vertices.map((t) => (e + t) % o),
				kinds: l.kinds,
				cost: l.cost + Ml(s, e, n)
			};
		};
		if (e.forced.length > 0) {
			const t = e.forced[0], n = e.forced.map((n) => (n + o - t) % o).filter((t) => t > 0).toSorted((t, n) => t - n);
			return i(t, new Ud(e.maxSpan, n));
		}
		let a = 0, l = -1 / 0;
		for (let d = 0; d < o; d++) {
			const t = ml(s.incoming[d], s.outgoing[d]);
			(t >= l || Number.isNaN(t)) && (l = t, a = d);
		}
		const c = l >= Xa() ? a : function(t) {
			const n = t.length >> 1;
			let e = 0, r = 0;
			for (let l = 0; l < n; l++) e += t[2 * l];
			for (let l = 0; l < n; l++) r += t[2 * l + 1];
			const o = e / n, s = r / n;
			let i = 0, a = -1 / 0;
			for (let l = 0; l < n; l++) {
				const n = Math.hypot(t[2 * l] - o, t[2 * l + 1] - s);
				(n >= a || Number.isNaN(n)) && (a = n, i = l);
			}
			return i;
		}(t.points), h = i(c, e);
		let f = c, u = -1;
		for (const d of h.vertices) {
			const t = (d + o - c) % o, n = Math.min(t, o - t);
			n >= u && (u = n, f = d);
		}
		if (f === c) return h;
		const y = i(f, e);
		return y.cost < h.cost ? y : h;
	}(l, n, e, h);
	else {
		const t = gl(l, n);
		h.offset = 0;
		const { sol: r, path: o } = sp(l, t, n, !1, e, h);
		c = {
			path: o,
			vertices: r.vertices,
			kinds: r.kinds,
			cost: r.cost
		};
	}
	return r.postFit && (e.free ? c.path = r.postFit(c.path, l, c.vertices, n, null) : e.maxSpan === 1 / 0 && (c.path = r.postFit(c.path, l, c.vertices, n, e.forced))), c.path = Bd(c.path, i, a), c;
}
function np(t, n, e) {
	const r = qd(t), o = t.points, s = [];
	for (let h = 0; h < r; h += n) s.push(h);
	t.closed || s[s.length - 1] === r - 1 || s.push(r - 1);
	const i = s.map(() => -1), a = s.length, l = (t) => (t % r + r) % r, c = Xa();
	for (let h = 0; h < a; h++) {
		if (!t.closed && (0 === h || h + 1 === a)) continue;
		const n = s[h], f = 0 === h ? s[a - 1] - r : s[h - 1], u = h + 1 === a ? r : s[h + 1], y = l(f), d = l(u), p = o[2 * y], g = o[2 * y + 1], m = o[2 * d] - p, x = o[2 * d + 1] - g, M = m * m + x * x;
		if (M < 1e-12) continue;
		let w = e.tau * e.tau;
		const b = Math.floor((f + n + 1) / 2), A = Math.floor((n + u + 1) / 2);
		for (let e = b; e < A; e++) {
			const n = l(e), r = o[2 * n] - p, s = o[2 * n + 1] - g, a = o[2 * d] - o[2 * n], f = o[2 * d + 1] - o[2 * n + 1], u = Math.hypot(r, s) * Math.hypot(a, f);
			if (u < 1e-12) continue;
			const y = Math.min(Math.max((r * a + s * f) / u, -1), 1);
			if (Math.acos(y) < c) continue;
			const b = r * x - s * m, A = b * b / (M * Ya(t.sigma[n] * t.sigma[n], 1e-12));
			A > w && (w = A, i[h] = n);
		}
	}
	return i;
}
function ep(t) {
	const n = qd(t), e = t.points;
	let r = 1 / 0, o = 1 / 0, s = -1 / 0, i = -1 / 0;
	for (let h = 0; h < n; h++) r = _a(r, e[2 * h]), o = _a(o, e[2 * h + 1]), s = Ya(s, e[2 * h]), i = Ya(i, e[2 * h + 1]);
	const a = .5 * (r + s), l = .5 * (o + i), c = new Float64Array(2 * n);
	for (let h = 0; h < n; h++) c[2 * h] = e[2 * h] - a, c[2 * h + 1] = e[2 * h + 1] - l;
	return {
		cx: a,
		cy: l,
		shifted: {
			points: c,
			sigma: t.sigma,
			closed: t.closed
		}
	};
}
function rp(t, n, e, r, o) {
	const s = r.vertices, i = s.length, a = zd(t, s), l = t.closed && i >= 2 && s[0] === s[i - 1], c = function(t, n, e) {
		const r = n.vertices.length, o = r - 1, s = n.kinds;
		let i = 0;
		for (let a = 0; a < t.sigma.length; a++) i = Ya(i, t.sigma[a]);
		return function(t, n, e, r) {
			const o = n, s = t.points, i = new Float64Array(2 * o.length);
			for (let u = 0; u < o.length; u++) i[2 * u] = s[2 * o[u]], i[2 * u + 1] = s[2 * o[u] + 1];
			if (o.length < 3) return i;
			const a = zd(t, o), l = o.length, c = l - 1, h = [];
			for (let u = 0; u < c; u++) h.push(Ed(t, o[u], o[u + 1]));
			const f = a ? c : l - 1;
			for (let u = a ? 0 : 1; u < f; u++) {
				if (!r(u)) continue;
				const t = a ? u % c : u, n = h[a ? (u + c - 1) % c : u - 1], o = h[t];
				if (!n || !o) continue;
				const s = n.dx * o.dy - n.dy * o.dx;
				if (Math.abs(s) < 1e-6) continue;
				const l = ((o.px - n.px) * o.dy - (o.py - n.py) * o.dx) / s, f = n.px + n.dx * l, y = n.py + n.dy * l, d = Math.atan2(Math.abs(s), n.dx * o.dx + n.dy * o.dy);
				let p = e;
				if (d >= Ld) {
					const t = .5 * (Math.PI - d);
					p = e + _a(1 / Ya(Math.sin(t), .2), 3);
				}
				Math.hypot(f - i[2 * u], y - i[2 * u + 1]) <= p && (i[2 * u] = f, i[2 * u + 1] = y);
			}
			return a && (i[2 * l - 2] = i[0], i[2 * l - 1] = i[1]), i;
		}(t, n.vertices, 3 * Ya(i, .25), (t) => {
			let n, i;
			if (e) n = (t + o - 1) % o, i = t % o;
			else {
				if (0 === t || t >= r - 1) return !1;
				n = t - 1, i = t;
			}
			return "line" === s[n] && "line" === s[i];
		});
	}(t, r, a), h = function(t, n, e, r) {
		const o = r.vertices, s = o.length - 1, i = [], a = [], l = [], c = [];
		for (let h = 0; h < s; h++) {
			const s = r.tans[h];
			i.push(s ? s.t0 : n.outgoing[o[h]]), a.push(s ? s.t1 : n.incoming[o[h + 1]]);
			const f = r.arms[h];
			if (f) {
				const n = pd(t.points, t.sigma, e.s, o[h], o[h + 1], i[h], a[h], f.d0, f.d1);
				l.push({
					d0: n.d0,
					d1: n.d1
				}), c.push(n.chi2);
			} else l.push(null), c.push(0);
		}
		return {
			tStart: i,
			tEnd: a,
			arms: l,
			chi2: c
		};
	}(t, n, e, r);
	return function(t, n, e, r, o, s, i) {
		const a = t.points, l = e.vertices, c = e.kinds, h = l.length - 1, f = /* @__PURE__ */ new Float64Array(3), u = (t) => Ky(r[2 * t + 2] - r[2 * t], r[2 * t + 3] - r[2 * t + 1]), y = (e, r, o) => {
			const s = l[e], i = l[e + 1], c = yd(a, t.sigma, n.s, s, i, r, o, n.rawMoments(s, i, f), !1);
			return c ? pd(a, t.sigma, n.s, s, i, r, o, c.d0, c.d1) : null;
		};
		for (let d = o ? 0 : 1; d < h; d++) {
			const n = o ? (d + h - 1) % h : d - 1, r = o ? d % h : d;
			if (n === r) continue;
			const a = "line" === c[n] ? u(n) : i.tEnd[n], l = "line" === c[r] ? u(r) : i.tStart[r];
			if (!a || !l) continue;
			const f = op(t, e, n, r, d, a, l, s);
			if (!f) continue;
			const p = xl(a, l, s.lambda);
			let g = null, m = null, x = 0, M = 0;
			if ("cubic" === c[n]) {
				if (g = y(n, i.tStart[n], f), !g) continue;
				x += i.chi2[n], M += g.chi2;
			}
			if ("cubic" === c[r]) {
				if (m = y(r, f, i.tEnd[r]), !m) continue;
				x += i.chi2[r], M += m.chi2;
			}
			.5 * M <= .5 * x + p && (g && (i.tEnd[n] = f, i.arms[n] = {
				d0: g.d0,
				d1: g.d1
			}, i.chi2[n] = g.chi2), m && (i.tStart[r] = f, i.arms[r] = {
				d0: m.d0,
				d1: m.d1
			}, i.chi2[r] = m.chi2));
		}
	}(t, e, r, c, a, o, h), function(t, n, e, r, o) {
		const s = t.points, i = n.vertices, a = i.length - 1, l = [];
		for (let c = 0; c < a; c++) {
			const t = e[2 * c + 2], o = e[2 * c + 3], a = n.kinds[c], h = n.arcs[c], f = r.arms[c];
			if ("arc" === a && h) l.push(jy(h.rx, h.ry, h.phi, h.largeArc, h.sweep, t, o));
			else if ("cubic" === a && f) {
				const n = i[c], e = i[c + 1], a = s[2 * n], h = s[2 * n + 1], u = s[2 * e], y = s[2 * e + 1], d = Math.hypot(a - u, h - y), p = id(a, h, u, y, r.tStart[c], r.tEnd[c], d, f.d0, f.d1);
				l.push(Ey(p.x1, p.y1, p.x2, p.y2, t, o));
			} else l.push(Ty(t, o));
		}
		return {
			x0: e[0],
			y0: e[1],
			segments: l,
			closed: o
		};
	}(t, r, c, h, l);
}
function op(t, n, e, r, o, s, i, a) {
	const l = n.vertices, c = n.kinds;
	if (ml(s, i) >= Xa()) return null;
	if ("arc" === c[e] || "arc" === c[r]) return null;
	if ("line" === c[e] && "line" === c[r]) return null;
	if ("line" === c[e]) return s;
	if ("line" === c[r]) return i;
	const h = Math.max(Math.min(Math.floor((l[e + 1] - l[e]) / 2), Math.floor((l[r + 1] - l[r]) / 2)), 1);
	return function(t, n, e, r) {
		return pl({
			poly: t,
			n: t.points.length >> 1,
			edges: null
		}, n, e, r, new hl());
	}(t, l[o % l.length], h, a) ?? Ky(s.x + i.x, s.y + i.y) ?? s;
}
function sp(t, n, e, r, o, s) {
	const i = new Rd(t.points, t.sigma), a = function(t, n, e, r, o, s, i) {
		const a = qd(t), l = new Qd(t.points, t.sigma, n, e, r, o, i).fillTable(s), c = [], h = [], f = [], u = [], y = [];
		let d = a - 1;
		for (; -1 !== d && (c.push(d), 0 !== d);) {
			h.push(l.kind[d]);
			const t = l.arms[2 * d];
			f.push(Number.isNaN(t) ? null : {
				d0: t,
				d1: l.arms[2 * d + 1]
			}), u.push(l.tans[d]), y.push(l.arcs[d]), d = l.from[d];
		}
		return c.reverse(), h.reverse(), f.reverse(), u.reverse(), y.reverse(), {
			vertices: c,
			kinds: h,
			arms: f,
			tans: u,
			arcs: y,
			cost: l.best[a - 1]
		};
	}(t, n, i, e, r, o, s);
	return {
		sol: a,
		path: rp(t, n, i, a, e)
	};
}
const ip = Math.PI / 180, ap = Object.freeze({
	scale: 100,
	x0: 0,
	y0: 0
});
function lp(t, n, e, r, o) {
	const s = o.x - r.x, i = o.y - r.y, a = Math.sqrt(s * s + i * i);
	if (a < 1e-12) return 1 / 0;
	const l = -i / a, c = s / a, h = t.points, f = Math.min(e, (h.length >> 1) - 1);
	let u = 0;
	for (let y = n; y <= f; y++) {
		const n = (h[2 * y] - r.x) * l + (h[2 * y + 1] - r.y) * c;
		u = Ya(u, Math.abs(n / Ya(t.sigma[y], 1e-6)));
	}
	return u;
}
function cp(t, n, e, r, o) {
	const s = o.x - r.x, i = o.y - r.y, a = Math.sqrt(s * s + i * i);
	if (a < 1e-12) return 1 / 0;
	const l = -i / a, c = s / a, h = t.points, f = Math.min(e, (h.length >> 1) - 1);
	let u = 0;
	for (let y = n; y <= f; y++) {
		const n = (h[2 * y] - r.x) * l + (h[2 * y + 1] - r.y) * c, e = Ya(t.sigma[y], 1e-6);
		u += n / e * (n / e);
	}
	return u;
}
const hp = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
};
function fp(t, n, e, r, o, s, i) {
	return hp.x0 = r.x, hp.y0 = r.y, hp.x1 = o.x, hp.y1 = o.y, hp.x2 = s.x, hp.y2 = s.y, hp.x3 = i.x, hp.y3 = i.y, fd(t.poly.points, t.poly.sigma, t.s, n, e, hp, !0);
}
function up(t) {
	const n = t.length >> 1, e = new Float64Array(n);
	let r = 0;
	for (let o = 1; o < n; o++) r += cl(t[2 * o - 2] - t[2 * o], t[2 * o - 1] - t[2 * o + 1]), e[o] = r;
	return e;
}
function yp(t, n) {
	const e = cl(t.x, t.y), r = cl(n.x, n.y);
	if (e < 1e-9 || r < 1e-9) return null;
	let o = (Math.atan2(t.y, t.x) - Math.atan2(n.y, n.x) + Math.PI) % (2 * Math.PI);
	return o < 0 && (o += 2 * Math.PI), o -= Math.PI, Math.abs(o) > 20 * ip ? null : [e, r];
}
function dp(t, n, e, r) {
	let o = n, s = r(t);
	const i = new Float64Array(t.length);
	for (let a = 0; a < 12; a++) {
		let n = !1;
		for (let a = 0; a < t.length; a++) for (let l = -1; l <= 1; l += 2) {
			if (i.set(t), i[a] += l * o, !e(a, i)) continue;
			const c = r(i);
			c < s - 1e-9 && (s = c, t.set(i), n = !0);
		}
		if (!n && (o *= .5, o < 1e-4)) break;
	}
	return s;
}
function pp(t, n, e) {
	const r = (t - n) * e, o = Math.round(r);
	if (Math.abs(r - o) < .5 - (2e-16 * Math.abs(r) + 1e-9)) return o;
	const s = Math.round(Math.log10(e));
	return 0 === n && s >= 0 && s <= 20 && 10 ** s === e ? Math.round(Number(t.toFixed(s)) * e) : o;
}
function gp(t, n, e) {
	return n + t / e;
}
function mp(t, n, e, r) {
	const { q0: o, q1: s } = n, i = {
		x: e.x1,
		y: e.y1
	}, a = {
		x: e.x2,
		y: e.y2
	}, l = {
		x: e.x,
		y: e.y
	}, c = {
		x: r.x1,
		y: r.y1
	}, h = {
		x: r.x2,
		y: r.y2
	}, f = {
		x: r.x,
		y: r.y
	};
	if (!yp({
		x: l.x - a.x,
		y: l.y - a.y
	}, {
		x: c.x - s.x,
		y: c.y - s.y
	})) return null;
	const u = (e, r, a) => fp(t, n.a0, n.b0, o, i, e, l) + fp(t, n.a1, n.b1, s, r, a, f), y = u(a, c, h), d = (t) => ({
		x: 2 * s.x - t.x,
		y: 2 * s.y - t.y
	}), p = Float64Array.of(a.x, a.y, h.x, h.y);
	let g = dp(p, Ya(.25, .05 * cl(s.x - f.x, s.y - f.y)), () => !0, (t) => {
		const n = {
			x: t[0],
			y: t[1]
		};
		return u(n, d(n), {
			x: t[2],
			y: t[3]
		});
	}), m = {
		x: p[0],
		y: p[1]
	}, x = d(m);
	const M = {
		x: p[2],
		y: p[3]
	}, w = t.grid;
	if (w) {
		const t = pp(m.x, w.x0, w.scale), n = pp(m.y, w.y0, w.scale), e = pp(s.x, w.x0, w.scale), r = pp(s.y, w.y0, w.scale);
		m = {
			x: gp(t, w.x0, w.scale),
			y: gp(n, w.y0, w.scale)
		}, x = {
			x: gp(2 * e - t, w.x0, w.scale),
			y: gp(2 * r - n, w.y0, w.scale)
		}, g = u(m, x, M);
	}
	return g - y < t.budget ? [Ey(i.x, i.y, m.x, m.y, l.x, l.y), Ey(x.x, x.y, M.x, M.y, f.x, f.y)] : null;
}
function xp(t, n, e) {
	const { q0: r, q1: o } = n, s = {
		x: e.x1,
		y: e.y1
	}, i = {
		x: e.x2,
		y: e.y2
	}, a = {
		x: e.x,
		y: e.y
	}, l = {
		x: o.x - r.x,
		y: o.y - r.y
	}, c = yp(l, {
		x: s.x - o.x,
		y: s.y - o.y
	});
	if (!c) return null;
	const h = l.x / c[0], f = l.y / c[0], u = fp(t, n.a1, n.b1, o, s, i, a), y = Float64Array.of(c[1], i.x, i.y);
	return dp(y, Ya(.25, .05 * cl(o.x - a.x, o.y - a.y)), (t, n) => !(0 === t && n[0] < 1e-4), (e) => fp(t, n.a1, n.b1, o, {
		x: o.x + h * e[0],
		y: o.y + f * e[0]
	}, {
		x: e[1],
		y: e[2]
	}, a)) - u < t.lambda ? Ey(o.x + h * y[0], o.y + f * y[0], y[1], y[2], a.x, a.y) : null;
}
function Mp(t, n, e, r) {
	const { q0: o, q1: s } = n, i = {
		x: e.x1,
		y: e.y1
	}, a = {
		x: e.x2,
		y: e.y2
	}, l = {
		x: e.x,
		y: e.y
	}, c = {
		x: r.x - s.x,
		y: r.y - s.y
	}, h = yp({
		x: l.x - a.x,
		y: l.y - a.y
	}, c);
	if (!h) return null;
	const f = c.x / h[1], u = c.y / h[1], y = fp(t, n.a0, n.b0, o, i, a, l), d = Float64Array.of(i.x, i.y, h[0]);
	return dp(d, Ya(.25, .05 * cl(o.x - s.x, o.y - s.y)), (t, n) => !(2 === t && n[2] < 1e-4), (e) => fp(t, n.a0, n.b0, o, {
		x: e[0],
		y: e[1]
	}, {
		x: s.x - f * e[2],
		y: s.y - u * e[2]
	}, s)) - y < t.lambda ? Ey(d[0], d[1], s.x - f * d[2], s.y - u * d[2], l.x, l.y) : null;
}
const wp = [
	-90,
	-65,
	-45,
	-22,
	0,
	22,
	45,
	65,
	90
], bp = [
	.15,
	.3,
	.45,
	.6,
	.8
], Ap = .02, kp = Ld, vp = 1 - 1e-12, Fp = 1 + 1e-12, Ip = Math.PI / 180, Np = /* @__PURE__ */ new Float64Array(194), Sp = /* @__PURE__ */ new Uint8Array(97);
function Pp(t, n, e) {
	for (let r = 0; r <= n; r++) {
		const o = r / n, s = 1 - o, i = s * s * s, a = 3 * s * s * o, l = 3 * s * o * o, c = o * o * o;
		e[2 * r] = i * t.x0 + a * t.x1 + l * t.x2 + c * t.x3, e[2 * r + 1] = i * t.y0 + a * t.y1 + l * t.y2 + c * t.y3;
	}
}
function Cp(t, n, e, r) {
	let o = 1 / 0, s = 0;
	for (let i = 0; i < r; i++) {
		const r = t - e[2 * i], a = n - e[2 * i + 1], l = r * r + a * a;
		l < o && (o = l, s = i);
	}
	return s;
}
function Up(t, n, e, r, o) {
	const s = cl(t - r, n - o), i = e >= 1e-6 ? e : 1e-6;
	return s / i * (s / i);
}
function Lp(t, n) {
	const e = n >= 1e-6 ? n : 1e-6, r = t / (e * e);
	return r >= 1e-290 && r <= 1e300 ? r * vp : 0;
}
function $p(t, n, e, r, o, s) {
	let i = 0;
	for (let a = o; a <= s; a++) {
		const o = e[2 * a], s = e[2 * a + 1], l = Cp(o, s, t, n);
		i += Up(o, s, r[a], t[2 * l], t[2 * l + 1]);
	}
	return i;
}
function qp(t, n, e, r, o, s, i) {
	if (Number.isNaN(i) || i === 1 / 0) return $p(t, n, e, r, o, s);
	const a = s + 1 - o;
	if (a > 97 || i < 1e-250) {
		let a = 0;
		for (let l = o; l <= s; l++) {
			const o = e[2 * l], s = e[2 * l + 1], c = Cp(o, s, t, n);
			if (a += Up(o, s, r[l], t[2 * c], t[2 * c + 1]), a >= i) return 1 / 0;
		}
		return a;
	}
	const l = i * Fp, c = a - 1 >> 1, h = 2 * n;
	let f = 0;
	for (let y = 0; y < a; y++) {
		const n = y + 1 >> 1, s = 1 & ~y ? c - n : c + n, i = o + s, a = e[2 * i], u = e[2 * i + 1];
		let d = 1 / 0, p = 0;
		for (let e = 0; e < h; e += 2) {
			const n = a - t[e], r = u - t[e + 1], o = n * n + r * r;
			o < d && (d = o, p = e);
		}
		if (Sp[s] = p >> 1, f += Lp(d, r[i]), f >= l) return 1 / 0;
	}
	let u = 0;
	for (let y = 0; y < a; y++) {
		const n = o + y, s = Sp[y];
		u += Up(e[2 * n], e[2 * n + 1], r[n], t[2 * s], t[2 * s + 1]);
	}
	return u;
}
function Rp(t, n, e, r, o = 96) {
	const s = Math.min(Math.max(Math.floor(o), 1), 96);
	return Pp(t, s, Np), $p(Np, s + 1, n.points, n.sigma, e, r);
}
const zp = 25, Tp = wp.length * bp.length, Ep = (() => {
	const t = /* @__PURE__ */ new Float64Array(100);
	for (let n = 0; n < zp; n++) {
		const e = n / 24, r = 1 - e;
		t[4 * n] = r * r * r, t[4 * n + 1] = 3 * r * r * e, t[4 * n + 2] = 3 * r * e * e, t[4 * n + 3] = e * e * e;
	}
	return t;
})(), jp = ((wp.indexOf(0) * wp.length + wp.indexOf(0)) * bp.length + bp.indexOf(.3)) * bp.length + bp.indexOf(.3), Bp = bp.map((t) => t >= Ap && t <= 1), Op = new Float64Array(Tp * zp), Kp = new Float64Array(Tp * zp), Dp = new Float64Array(Tp * zp), Hp = new Float64Array(Tp * zp), Xp = new Float64Array(zp), Wp = new Float64Array(zp), Gp = new Float64Array(Tp), Zp = new Float64Array(Tp), Qp = new Float64Array(Tp), Yp = new Float64Array(Tp), _p = /* @__PURE__ */ new Float64Array(50), Vp = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
}, Jp = {
	x: 0,
	y: 0
};
function tg(t, n, e, r) {
	const o = e * Ip, s = Math.sin(o), i = Math.cos(o);
	return r.x = t * i - n * s, r.y = t * s + n * i, r;
}
var ng = class {
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
	constructor(t, n, e, r, o, s, i, a, l, c, h, f, u) {
		this.pts = t, this.sigma = n, this.a = e, this.b = r, this.p0x = o, this.p0y = s, this.p3x = i, this.p3y = a, this.chord = l, this.base0x = c, this.base0y = h, this.base1x = f, this.base1y = u;
	}
	build(t, n, e, r, o) {
		const s = this.chord;
		tg(this.base0x, this.base0y, t, Jp);
		const i = Jp.x, a = Jp.y;
		return tg(this.base1x, this.base1y, n, Jp), o.x0 = this.p0x, o.y0 = this.p0y, o.x1 = this.p0x + i * e * s, o.y1 = this.p0y + a * e * s, o.x2 = this.p3x - Jp.x * r * s, o.y2 = this.p3y - Jp.y * r * s, o.x3 = this.p3x, o.y3 = this.p3y, o;
	}
	score(t, n, e, r, o) {
		if (!(e >= Ap && e <= 1 && r >= Ap && r <= 1)) return 1 / 0;
		if (Math.abs(t) > 100 || Math.abs(n) > 100) return 1 / 0;
		const s = this.build(t, n, e, r, Vp);
		return Dy(s) ? 1 / 0 : (Pp(s, 96, Np), qp(Np, 97, this.pts, this.sigma, this.a, this.b, o));
	}
	grid(t) {
		const { p0x: n, p0y: e, p3x: r, p3y: o, chord: s } = this, i = bp.length;
		for (let h = 0; h < wp.length; h++) {
			tg(this.base0x, this.base0y, wp[h], Jp);
			const t = Jp.x, a = Jp.y;
			tg(this.base1x, this.base1y, wp[h], Jp);
			const l = Jp.x, c = Jp.y;
			for (let f = 0; f < i; f++) {
				const u = h * i + f, y = bp[f];
				Gp[u] = n + t * y * s, Zp[u] = e + a * y * s, Qp[u] = r - l * y * s, Yp[u] = o - c * y * s;
			}
		}
		for (let h = 0; h < Tp; h++) {
			const t = Gp[h], r = Zp[h], o = Qp[h], s = Yp[h];
			for (let i = 0; i < zp; i++) {
				const a = 4 * i;
				Op[h * zp + i] = Ep[a] * n + Ep[a + 1] * t, Kp[h * zp + i] = Ep[a] * e + Ep[a + 1] * r, Dp[h * zp + i] = Ep[a + 2] * o, Hp[h * zp + i] = Ep[a + 2] * s;
			}
		}
		for (let h = 0; h < zp; h++) Xp[h] = Ep[4 * h + 3] * r, Wp[h] = Ep[4 * h + 3] * o;
		let a = 1 / 0, l = -1;
		t[0] = 0, t[1] = 0, t[2] = .35, t[3] = .35;
		const c = wp.length * wp.length * i * i;
		for (let h = -1; h < c; h++) {
			const n = h < 0 ? jp : h;
			if (h >= 0 && n === jp) continue;
			const e = n % i, r = Math.floor(n / i) % i, o = Math.floor(n / (i * i)) % wp.length, s = Math.floor(n / (i * i * wp.length));
			if (!Bp[r] || !Bp[e]) continue;
			const c = s * i + r, f = o * i + e, u = c * zp, y = f * zp;
			for (let t = 0; t < zp; t++) _p[2 * t] = Op[u + t] + Dp[y + t] + Xp[t], _p[2 * t + 1] = Kp[u + t] + Hp[y + t] + Wp[t];
			const d = qp(_p, zp, this.pts, this.sigma, this.a, this.b, Zd(a));
			(d < a || d === a && n < l) && !this.crosses(c, f) && (a = d, l = n, t[0] = wp[s], t[1] = wp[o], t[2] = bp[r], t[3] = bp[e]);
		}
		return Number.isFinite(a);
	}
	crosses(t, n) {
		return Vp.x0 = this.p0x, Vp.y0 = this.p0y, Vp.x1 = Gp[t], Vp.y1 = Zp[t], Vp.x2 = Qp[n], Vp.y2 = Yp[n], Vp.x3 = this.p3x, Vp.y3 = this.p3y, Dy(Vp);
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
				for (let i = 0; i < 4; i++) for (let a = -1; a <= 1; a += 2) {
					r.set(t), r[i] += a * e[i];
					let l = NaN, c = !1;
					for (let t = 0; t < o.length; t += 5) if (o[t] === r[0] && o[t + 1] === r[1] && o[t + 2] === r[2] && o[t + 3] === r[3]) {
						l = o[t + 4], c = !0;
						break;
					}
					c || (l = this.score(r[0], r[1], r[2], r[3], n), o.push(r[0], r[1], r[2], r[3], l)), l < n && (n = l, t.set(r), s = !0);
				}
			}
			for (let t = 0; t < 4; t++) e[t] *= .5;
		}
		return n;
	}
};
function eg(t, n, e, r, o, s, i) {
	const a = t.points, l = cl(r - s, o - i);
	if (l <= 1e-9 || e <= n + 1) return null;
	const c = Math.min(n + 2, e), h = a[2 * c] - r, f = a[2 * c + 1] - o, u = Math.max(e >= 2 ? e - 2 : 0, n), y = s - a[2 * u], d = i - a[2 * u + 1], p = cl(h, f), g = cl(y, d);
	if (p <= 1e-9 || g <= 1e-9) return null;
	let m = 0;
	for (let b = n; b < e; b++) m += cl(a[2 * b] - a[2 * b + 2], a[2 * b + 1] - a[2 * b + 3]);
	if (m <= 1e-9) return null;
	const x = new ng(a, t.sigma, n, e, r, o, s, i, l, h / p, f / p, y / g, d / g), M = /* @__PURE__ */ new Float64Array(4);
	if (!x.grid(M)) return null;
	const w = x.refine(M);
	return Number.isFinite(w) ? {
		cubic: x.build(M[0], M[1], M[2], M[3], {
			x0: 0,
			y0: 0,
			x1: 0,
			y1: 0,
			x2: 0,
			y2: 0,
			x3: 0,
			y3: 0
		}),
		chi2: w
	} : null;
}
function rg(t, n, e, r, o, s, i, a) {
	const l = Ga();
	return Number.isFinite(l) && ml(cl(e - t, r - n) > 1e-12 ? {
		x: e - t,
		y: r - n
	} : {
		x: o - t,
		y: s - n
	}, cl(i - o, a - s) > 1e-12 ? {
		x: i - o,
		y: a - s
	} : {
		x: i - e,
		y: a - r
	}) > l ? Ha() : 0;
}
const og = {
	x0: 0,
	y0: 0,
	x1: 0,
	y1: 0,
	x2: 0,
	y2: 0,
	x3: 0,
	y3: 0
};
function sg(t, n, e, r, o, s) {
	const i = t.segments;
	let a = 0, l = 0;
	for (; l + 1 < i.length;) {
		let c = 0, h = null;
		for (let a = Math.min(4, i.length - l); a >= 2; a--) {
			if (l + a >= e.length) continue;
			const f = e[l], u = e[l + a];
			if (u <= f + 3 || u - f > 96) continue;
			if (s) {
				let t = !1;
				for (let n = l + 1; n < l + a; n++) s.has(e[n]) && (t = !0);
				if (t) continue;
			}
			let y = !1;
			for (let t = l; t < l + a; t++) "A" === i[t].type && (y = !0);
			if (y) continue;
			const d = e.slice(l, l + a + 1).join(",");
			if (o.has(d)) continue;
			let p = 0, g = 0, m = 0 === l ? t.x0 : i[l - 1].x, x = 0 === l ? t.y0 : i[l - 1].y;
			for (let t = l; t < l + a; t++) {
				const r = i[t];
				g += By(r), og.x0 = m, og.y0 = x, "C" === r.type ? (g += rg(m, x, r.x1, r.y1, r.x2, r.y2, r.x, r.y), og.x1 = r.x1, og.y1 = r.y1, og.x2 = r.x2, og.y2 = r.y2) : (og.x1 = m, og.y1 = x, og.x2 = r.x, og.y2 = r.y), og.x3 = r.x, og.y3 = r.y, p += Rp(og, n, e[t], e[t + 1]), m = r.x, x = r.y;
			}
			const M = .5 * p + r.lambda * g + 0 * r.lambda, w = r.lambda * (Ha() + 2);
			if (w >= M) {
				o.add(d);
				continue;
			}
			const b = 0 === l ? t.x0 : i[l - 1].x, A = 0 === l ? t.y0 : i[l - 1].y, k = i[l + a - 1], v = eg(n, f, u, b, A, k.x, k.y);
			if (!v || Dy(v.cubic)) {
				o.add(d);
				continue;
			}
			const F = v.cubic;
			if (.5 * v.chi2 + w + r.lambda * rg(F.x0, F.y0, F.x1, F.y1, F.x2, F.y2, F.x3, F.y3) < M) {
				c = a, h = F;
				break;
			}
			o.add(d);
		}
		if (h) {
			const t = h;
			i.splice(l, c, Ey(t.x1, t.y1, t.x2, t.y2, t.x3, t.y3)), e.splice(l + 1, c - 1), a++;
		}
		l++;
	}
	return a;
}
function ig(t, n) {
	const e = cl(t, n);
	return e > 1e-12 ? {
		x: t / e,
		y: n / e
	} : null;
}
function ag(t, n, e, r, o, s) {
	const i = n.x * o.y - n.y * o.x, a = Math.atan2(Math.abs(i), n.x * o.x + n.y * o.y);
	if (a < kp || Math.abs(i) <= 1e-9) return null;
	const l = ((r.x - t.x) * o.y - (r.y - t.y) * o.x) / i, c = {
		x: t.x + n.x * l,
		y: t.y + n.y * l
	}, h = .5 * (Math.PI - a), f = _a(1 / Ya(Math.sin(h), .2), 3) + .5, u = (c.x - e.x) * n.x + (c.y - e.y) * n.y >= -f, y = (s.x - c.x) * o.x + (s.y - c.y) * o.y >= -f;
	return u && y && cl(c.x - e.x, c.y - e.y) <= f && cl(c.x - s.x, c.y - s.y) <= f ? c : null;
}
function lg(t, n, e, r, o) {
	if (r < 0 || o < 0) return null;
	if ("L" !== t[r].type || "L" !== t[o].type) return null;
	const s = n[r], i = {
		x: t[o].x,
		y: t[o].y
	}, a = n[e], l = t[e], c = cl(a.x - l.x, a.y - l.y);
	if ("C" === l.type && c <= 8) {
		const t = ig(a.x - s.x, a.y - s.y);
		if (!t) return null;
		const n = ig(i.x - l.x, i.y - l.y);
		return n ? function(t, n, e, r, o) {
			const s = {
				x: t.x0,
				y: t.y0
			}, i = {
				x: t.x3,
				y: t.y3
			}, a = .125, l = .375, c = {
				x: a * t.x0 + l * t.x1 + l * t.x2 + a * t.x3,
				y: a * t.y0 + l * t.y1 + l * t.y2 + a * t.y3
			}, h = 3 * (.25 * (t.x1 - t.x0) + .5 * (t.x2 - t.x1) + .25 * (t.x3 - t.x2)), f = 3 * (.25 * (t.y1 - t.y0) + .5 * (t.y2 - t.y1) + .25 * (t.y3 - t.y2));
			if (cl(s.x - i.x, s.y - i.y) <= 2.5) {
				const t = ag(n, e, s, r, o, i);
				if (t) return {
					h1: t,
					h2: null
				};
			}
			const u = ig(h, f);
			if (!u) return null;
			const y = ag(n, e, s, c, u, s), d = ag(c, u, i, r, o, i);
			if (y && d) {
				const t = cl(y.x - d.x, y.y - d.y);
				if (t >= 1 && t <= 8) return {
					h1: y,
					h2: d
				};
			}
			return null;
		}({
			x0: a.x,
			y0: a.y,
			x1: l.x1,
			y1: l.y1,
			x2: l.x2,
			y2: l.y2,
			x3: l.x,
			y3: l.y
		}, s, t, i, n) : null;
	}
	if ("L" === l.type && c <= 2.5) {
		const t = ig(a.x - s.x, a.y - s.y);
		if (!t) return null;
		const n = ig(i.x - l.x, i.y - l.y);
		if (!n) return null;
		const e = ag(s, t, a, i, n, {
			x: l.x,
			y: l.y
		});
		return e ? {
			h1: e,
			h2: null
		} : null;
	}
	return null;
}
function cg(t, n) {
	const e = t[t.length - 1];
	return !(!e || "L" !== e.type || (t[t.length - 1] = Ty(n.x, n.y), 0));
}
function hg(t, n, e, r) {
	let o = 1 / 0, s = e;
	for (let i = e; i <= r; i++) {
		const e = t[2 * i] - n.x, r = t[2 * i + 1] - n.y, a = e * e + r * r;
		a < o && (o = a, s = i);
	}
	return s;
}
function fg(t, n, e) {
	const r = Qy(t, n, e, .05), o = r.length >> 1;
	let s = 0;
	for (let i = 0; i < o; i++) {
		const t = i + 1 === o ? 0 : i + 1;
		s += r[2 * i] * r[2 * t + 1] - r[2 * t] * r[2 * i + 1];
	}
	return s / 2;
}
function ug(t, n, e, r, o = {}) {
	const s = o.keep ?? [], i = {
		merged: 0,
		sharpened: 0,
		axisSnapped: 0,
		smoothSnapped: 0
	};
	if (i.merged = function(t, n, e, r, o = []) {
		if (t.segments.length < 2 || e.length !== t.segments.length + 1) return 0;
		const s = o.length > 0 ? new Set(o) : null, i = /* @__PURE__ */ new Set();
		let a = 0;
		for (let l = 0; l < 6; l++) {
			const o = sg(t, n, e, r, i, s);
			if (a += o, 0 === o) break;
		}
		return a;
	}(t, n, e, r, s), i.sharpened = function(t, n) {
		const e = t.segments, r = e.length;
		if (r < 3) return 0;
		const o = n && n.vertices.length === r + 1 ? n.vertices : null, s = n ? n.poly.points : /* @__PURE__ */ new Float64Array(0), i = n?.keep && n.keep.length > 0 ? new Set(n.keep) : null, a = [];
		let l = t.x0, c = t.y0;
		for (const m of e) a.push({
			x: l,
			y: c
		}), l = m.x, c = m.y;
		const h = t.closed && cl(l - t.x0, c - t.y0) < 1e-9, f = [], u = o ? [o[0]] : [];
		let y = t.x0, d = t.y0, p = null, g = 0;
		for (let m = 0; m < r; m++) {
			const t = m >= 1 ? m - 1 : h ? r - 1 : -1, n = m + 1 < r ? m + 1 : h ? 0 : -1, l = null !== o && null !== i && (i.has(o[m]) || i.has(o[m + 1])) ? null : lg(e, a, m, t, n);
			if (!l) {
				f.push(e[m]), o && u.push(o[m + 1]);
				continue;
			}
			const { h1: c, h2: x } = l, M = m === r - 1 && h, w = x ? o && o[m + 1] - 1 : o && o[m + 1];
			if (0 === m ? (p = c, y = c.x, d = c.y) : cg(f, c) && o && null !== w && (u[u.length - 1] = M && !x ? o[m + 1] : hg(s, c, o[m], w)), M && (y = (x ?? c).x, d = (x ?? c).y), x) {
				if (f.push(Ty(x.x, x.y)), o) {
					const t = Math.min(u[u.length - 1] + 1, o[m + 1]);
					u.push(M ? o[m + 1] : hg(s, x, t, o[m + 1]));
				}
				g++;
			}
			g++;
		}
		if (0 === g) return 0;
		if (f.length < (h ? 3 : 1)) return 0;
		if (p && (cg(f, p), y = p.x, d = p.y), h) {
			const n = Math.abs(fg(t.x0, t.y0, e));
			if (Math.abs(fg(y, d, f)) < .5 * n) return 0;
		}
		return t.x0 = y, t.y0 = d, t.segments = f, o && o.splice(0, o.length, ...u), g;
	}(t, {
		vertices: e,
		poly: n,
		keep: s
	}), 0 === s.length && (o.axisLines && (i.axisSnapped = function(t, n, e, r) {
		const o = t.segments;
		if (0 === o.length || e.length !== o.length + 1) return 0;
		const s = n.points.length >> 1, i = 2 * r.lambda * 1;
		let a = 0, l = {
			x: t.x0,
			y: t.y0
		};
		for (let c = 0; c < o.length; c++) {
			const t = o[c], r = {
				x: t.x,
				y: t.y
			};
			if ("L" !== t.type) {
				l = r;
				continue;
			}
			const h = r.x - l.x, f = r.y - l.y;
			if (0 === h && 0 === f) {
				l = r;
				continue;
			}
			const u = Math.abs(f) <= Math.abs(h) ? {
				x: r.x,
				y: l.y
			} : {
				x: l.x,
				y: r.y
			}, y = cl(u.x - r.x, u.y - r.y), d = c + 1 < o.length && "L" === o[c + 1].type, p = e[c], g = e[c + 1];
			if (y < 1e-12 || !d || g <= p || g >= s) {
				l = r;
				continue;
			}
			if (y > Ya(n.sigma[g], 1e-6)) {
				l = r;
				continue;
			}
			if (lp(n, p, g, l, u) > 3) {
				l = r;
				continue;
			}
			const m = cp(n, p, g, l, r);
			cp(n, p, g, l, u) - m < i ? (o[c] = Ty(u.x, u.y), a++, l = u) : l = r;
		}
		return a;
	}(t, n, e, r)), o.smoothJoins)) i.smoothSnapped = function(t, n, e, r, o = ap) {
		const s = t.segments;
		if (s.length < 2 || e.length !== s.length + 1) return 0;
		const i = n.points.length >> 1, a = {
			poly: n,
			s: up(n.points),
			budget: 2 * r.lambda * (Ha() - 4),
			lambda: r.lambda,
			grid: o
		}, l = [];
		let c = t.x0, h = t.y0;
		for (const u of s) l.push({
			x: c,
			y: h
		}), c = u.x, h = u.y;
		let f = 0;
		for (let u = 1; u < s.length; u++) {
			const t = {
				a0: e[u - 1],
				b0: e[u],
				a1: e[u],
				b1: e[u + 1],
				q0: l[u - 1],
				q1: l[u]
			};
			if (t.b0 <= t.a0 || t.b1 <= t.a1 || t.b1 >= i) continue;
			const n = s[u - 1], r = s[u];
			if ("C" === n.type && "C" === r.type) {
				const e = mp(a, t, n, r);
				e && (s[u - 1] = e[0], s[u] = e[1], f++);
			} else if ("L" === n.type && "C" === r.type) {
				const n = xp(a, t, r);
				n && (s[u] = n, f++);
			} else if ("C" === n.type && "L" === r.type) {
				const e = Mp(a, t, n, {
					x: r.x,
					y: r.y
				});
				e && (s[u - 1] = e, f++);
			}
		}
		return f;
	}(t, n, e, r, void 0 === o.grid ? ap : o.grid);
	return i;
}
function yg(t) {
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
function dg(t, n, e, r, o, s) {
	const i = function(t, n, e, r) {
		const o = uc(t, n, e, r);
		return null === o || o.primitive ? o : {
			...o,
			params: o.params + 2,
			cost: o.cost + 2 * r.lambda
		};
	}(t, n, e, r);
	return o && null !== i && i.cost < function(t, n, e) {
		const r = e.lambda;
		if (Number.isNaN(r) || r < 0) return -1 / 0;
		const o = 6 * r, s = r * (2 + Ha()), i = .5 * function(t, n) {
			const e = t.length >> 1, r = (t) => {
				const e = Math.max(t < n.length ? n[t] : .5, .001);
				return 1 / (e * e);
			};
			let o = 0, s = 0, i = 0, a = 0;
			for (let p = 0; p < e; p++) {
				const n = r(p), e = t[2 * p], l = t[2 * p + 1];
				o += n, s += n * e, i += n * l, a = Math.max(a, Math.abs(e), Math.abs(l));
			}
			if (Number.isNaN(o) || o <= 0) return 0;
			const l = s / o, c = i / o;
			let h = 0, f = 0, u = 0;
			for (let p = 0; p < e; p++) {
				const n = r(p), e = t[2 * p] - l, o = t[2 * p + 1] - c;
				h += n * e * e, f += n * e * o, u += n * o * o;
			}
			const y = .5 * (h - u), d = .5 * (.5 * (h + u) - Math.sqrt(y * y + f * f)) - 1e-9 * (h + u + o * a * a);
			return d > 0 && Number.isFinite(d) ? d : 0;
		}(t, n) + 4 * r;
		return Math.min(o, s, i);
	}(t, n, r) ? yg(i) : function(t, n, e) {
		return null !== n && n.cost < function(t, n) {
			return 0 !== t.segments.length || t.primitive ? .5 * t.chi2 + n.lambda * t.params : 1 / 0;
		}(t, e) ? yg(n) : t;
	}(s(), i, r);
}
const pg = (t, n, e, r, o) => {
	const s = {
		x0: t.x0,
		y0: t.y0,
		segments: t.segments.slice(),
		closed: n.closed
	}, i = e.length - 1;
	if (n.closed && i >= 1 && e[0] === e[i]) {
		const t = qd(n), a = e[0];
		ug(s, function(t, n) {
			const e = qd(t), r = new Float64Array(2 * (e + 1)), o = new Float64Array(e + 1);
			for (let s = 0; s <= e; s++) {
				const i = (n + s) % e;
				r[2 * s] = t.points[2 * i], r[2 * s + 1] = t.points[2 * i + 1], o[s] = t.sigma[i];
			}
			return {
				points: r,
				sigma: o,
				closed: !1
			};
		}(n, a), e.map((n, e) => e === i ? t : (n - a + t) % t), r, { keep: (o ?? []).flatMap((n) => {
			const e = (n - a + t) % t;
			return 0 === e ? [0, t] : [e];
		}).toSorted((t, n) => t - n) });
	} else ug(s, n, e.slice(), r, { keep: o ?? [] });
	return s.closed = t.closed, s;
};
function gg(t, n) {
	const e = n.points, r = e.length, o = t.nodes[n.start], s = t.nodes[n.end];
	if (!o || !s || r < 2) return e;
	if (e[0] === o.x && e[1] === o.y && e[r - 2] === s.x && e[r - 1] === s.y) return e;
	const i = e.slice();
	return i[0] = o.x, i[1] = o.y, i[r - 2] = s.x, i[r - 1] = s.y, i;
}
function mg(t, n) {
	const e = t.edges[n];
	return {
		points: e.closed ? e.points : gg(t, e),
		sigma: e.sigma,
		closed: e.closed
	};
}
function xg(t, n, e, r = {}) {
	const { points: o, sigma: s, closed: i } = t, a = function(t, n) {
		return 1 === n ? t : {
			tau: t.tau,
			lambda: t.lambda * n
		};
	}(e, r.lambdaScale ?? 1), l = r.forced ?? [], c = () => _d(o, s, i, a, {
		forced: l,
		postFit: pg
	});
	if (Ud.pinned(o.length >> 1, i, 1 / 0, l).forced.length > 0) return c();
	return dg(o, s, i, a, i && function(t, n, e) {
		const r = t.length >> 1;
		if (0 === r) return !1;
		for (let o = 0; o < r; o++) {
			const r = t[2 * o], s = t[2 * o + 1];
			if (0 !== r && 0 !== s && r !== n && s !== e) return !1;
		}
		return !0;
	}(o, n.width, n.height), c);
}
function Mg(t, n, e, r, o, s) {
	let i = 1 / 0;
	for (let a = o; a <= s; a++) {
		const o = a % n, s = cl(t[2 * o] - e, t[2 * o + 1] - r);
		s < i && (i = s);
	}
	for (let a = o; a <= s; a++) {
		const o = a % n;
		if (cl(t[2 * o] - e, t[2 * o + 1] - r) <= i + 1e-6) return a;
	}
	return o;
}
function wg(t, n, e, r) {
	const o = function(t, n) {
		const e = qd(n), r = t.segments;
		if (e < 2 || 0 === r.length) return null;
		const o = n.points, s = Mg(o, e, t.x0, t.y0, 0, e - 1), i = n.closed ? s + e : e - 1, a = [];
		let l = s;
		for (let c = 0; c < r.length; c++) {
			let t;
			if (n.closed && c + 1 === r.length) t = i;
			else {
				if (l + 1 > i) return null;
				t = Mg(o, e, r[c].x, r[c].y, l + 1, i);
			}
			a.push([l, t]), l = t;
		}
		return a;
	}(t, n);
	if (!o) return 0;
	const s = qd(n), i = n.points;
	let a = 0;
	for (const l of e) {
		const t = o[l.segment];
		if (!t) continue;
		const [n, e] = t;
		let c = -1, h = 1 / 0;
		for (let r = n + 1; r < e; r++) {
			const t = r % s, n = cl(i[2 * t] - l.x, i[2 * t + 1] - l.y);
			(c < 0 || n < h) && (c = t, h = n);
		}
		if (c < 0) continue;
		let f = 0, u = r.length;
		for (; f < u;) {
			const t = f + u >> 1;
			r[t] < c ? f = t + 1 : u = t;
		}
		r[f] !== c && (r.splice(f, 0, c), a++);
	}
	return a;
}
function bg(t, n, e, r) {
	return 0 === r.length ? function(t, n, e, r = {}) {
		return tp(t, n, Ud.capped(e), r);
	}(t, n, e) : function(t, n, e, r, o = {}) {
		return tp(t, n, Ud.pinned(qd(t), t.closed, e, r), o);
	}(t, n, e, r, { postFit: pg });
}
function Ag(t, n) {
	const e = n.segments;
	return t.x0 === n.x0 && t.y0 === n.y0 && t.segments.length === e.length && t.segments.every((t, n) => t === e[n]);
}
function kg(t) {
	const n = t.trim().toLowerCase();
	if ("" === n || "none" === n || "transparent" === n) return null;
	if (n.startsWith("url(")) return null;
	const e = /^#([0-9a-f]{3})$/.exec(n);
	if (null !== e) {
		const t = e[1];
		return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
	}
	return n;
}
function vg(t, n) {
	return t[n] ?? t[n + 1] ?? "";
}
function Fg(t, n) {
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
function Ig(t) {
	const n = t.length;
	if (n < 3) return null;
	let e = 0, r = 0, o = 0, s = 0, i = 0, a = 0, l = 0, c = 0;
	for (const m of t) {
		const t = m.x * m.x + m.y * m.y;
		e += m.x * m.x, r += m.x * m.y, o += m.y * m.y, s += m.x, i += m.y, a += m.x * t, l += m.y * t, c += t;
	}
	const h = Fg([
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
		-a,
		-l,
		-c
	]);
	if (!h) return null;
	const [f, u, y] = h, d = -f / 2, p = -u / 2, g = d * d + p * p - y;
	return g <= 0 ? null : {
		cx: d,
		cy: p,
		r: Math.sqrt(g)
	};
}
function Ng(t) {
	const n = t.length;
	if (n < 6) return null;
	let e = 0, r = 0;
	for (const $ of t) e += $.x, r += $.y;
	e /= n, r /= n;
	let o = 0;
	for (const $ of t) o += ($.x - e) ** 2 + ($.y - r) ** 2;
	const s = Math.sqrt(o / n) || 1, i = Array.from({ length: 6 }, () => new Array(6).fill(0));
	for (const $ of t) {
		const t = ($.x - e) / s, n = ($.y - r) / s, o = [
			t * t,
			t * n,
			n * n,
			t,
			n,
			1
		];
		for (let e = 0; e < 6; e++) for (let t = 0; t < 6; t++) i[e][t] += o[e] * o[t];
	}
	const { values: a, vectors: l } = function(t) {
		const n = t.map((t) => [...t]), e = Array.from({ length: 6 }, (t, n) => Array.from({ length: 6 }, (t, e) => n === e ? 1 : 0));
		for (let r = 0; r < 100; r++) {
			let t = 0;
			for (let e = 0; e < 6; e++) for (let r = e + 1; r < 6; r++) t += n[e][r] * n[e][r];
			if (t < 1e-20) break;
			for (let r = 0; r < 6; r++) for (let t = r + 1; t < 6; t++) {
				if (Math.abs(n[r][t]) < 1e-18) continue;
				const o = (n[t][t] - n[r][r]) / (2 * n[r][t]), s = Math.sign(o || 1) / (Math.abs(o) + Math.sqrt(o * o + 1)), i = 1 / Math.sqrt(s * s + 1), a = s * i;
				for (let e = 0; e < 6; e++) {
					const o = n[e][r], s = n[e][t];
					n[e][r] = i * o - a * s, n[e][t] = a * o + i * s;
				}
				for (let e = 0; e < 6; e++) {
					const o = n[r][e], s = n[t][e];
					n[r][e] = i * o - a * s, n[t][e] = a * o + i * s;
				}
				for (let n = 0; n < 6; n++) {
					const o = e[n][r], s = e[n][t];
					e[n][r] = i * o - a * s, e[n][t] = a * o + i * s;
				}
			}
		}
		return {
			values: n.map((t, n) => t[n]),
			vectors: e
		};
	}(i);
	let c = 0;
	for (let $ = 1; $ < 6; $++) a[$] < a[c] && (c = $);
	const [h, f, u, y, d, p] = l.map((t) => t[c]);
	if (f * f - 4 * h * u >= 0) return null;
	const g = Fg([[2 * h, f], [f, 2 * u]], [-y, -d]);
	if (!g) return null;
	const [m, x] = g, M = h * m * m + f * m * x + u * x * x + y * m + d * x + p, w = h + u, b = h * u - f * f / 4, A = Math.sqrt(Math.max(0, w * w / 4 - b)), k = w / 2 + A, v = w / 2 - A;
	if (0 === k || 0 === v) return null;
	const F = -M / k, I = -M / v;
	if (F <= 0 || I <= 0) return null;
	const N = Math.sqrt(F), S = Math.sqrt(I), P = Math.abs(f) < 1e-12 && Math.abs(h - k) < 1e-12 ? 0 : Math.atan2(k - h, f / 2);
	let C, U, L;
	for (N >= S ? (C = N, U = S, L = P) : (C = S, U = N, L = P + Math.PI / 2); L > Math.PI / 2;) L -= Math.PI;
	for (; L <= -Math.PI / 2;) L += Math.PI;
	return {
		cx: e + m * s,
		cy: r + x * s,
		rx: C * s,
		ry: U * s,
		angle: L
	};
}
function Sg(t, n, e, r, o, s, i) {
	const a = Math.abs(t - e) - (o - i), l = Math.abs(n - r) - (s - i), c = Math.max(a, 0), h = Math.max(l, 0);
	return (0 === h ? c : 0 === c ? h : Math.hypot(c, h)) + Math.min(Math.max(a, l), 0) - i;
}
function Pg(t) {
	const n = Math.max(t.hx, 0), e = Math.max(t.hy, 0);
	return {
		cx: t.cx,
		cy: t.cy,
		hx: n,
		hy: e,
		r: Math.min(Math.max(t.r, 0), n, e)
	};
}
function Cg(t, n, e) {
	let r = 0;
	for (let o = 0; o < t.length; o++) {
		const s = Sg(t[o], n[o], e.cx, e.cy, e.hx, e.hy, e.r);
		r += s * s;
	}
	return r;
}
function Ug(t, n) {
	let e = t.toFixed(Lg(n));
	return e.includes(".") && (e = e.replace(/\.?0+$/, "")), "-0" === e && (e = "0"), e;
}
function Lg(t) {
	const n = Math.round(t);
	return n < 0 ? 0 : n > 4 ? 4 : n;
}
function $g(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, i = 3 * r * e * e, a = e * e * e;
	return {
		x: o * t.x + s * n.x1 + i * n.x2 + a * n.x,
		y: o * t.y + s * n.y1 + i * n.y2 + a * n.y
	};
}
function qg(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function Rg(t, n, e, r, o, s) {
	const i = t * o + n * s, a = -t * s + n * o, l = i * i / (e * e) + a * a / (r * r) - 1, c = 2 * Math.hypot(i / (e * e), a / (r * r));
	return c > 0 ? Math.abs(l) / c : 1 / 0;
}
function zg(t, n, e, r) {
	const o = k(t.x, t.y, n);
	if (null === o) return !1;
	const { cx: s, cy: i, rx: a, ry: l, phi: c, theta1: h, dTheta: f } = o, u = Math.cos(c), y = Math.sin(c), d = Math.min(a, l), p = 2 * Math.PI, g = r / d, m = (t) => {
		let n = t - h;
		return f >= 0 ? (n = (n % p + p) % p, n <= f + g || n >= p - g) : (n = -(-n % p + p) % p, n >= f - g || n <= -p + g);
	}, x = (t) => Math.hypot(a * Math.sin(t), l * Math.cos(t));
	let M = h, w = t;
	for (const b of e) {
		const t = b.x - s, n = b.y - i;
		if (Rg(t, n, a, l, u, y) > r) return !1;
		const e = (t * u + n * y) / a, o = (-t * y + n * u) / l, c = Math.atan2(o, e);
		if (!m(c)) return !1;
		let h = c - M;
		if (h = f >= 0 ? (h % p + p) % p : -(-h % p + p) % p, h > Math.PI && (h -= p), h < -Math.PI && (h += p), Math.abs(h) * x(M + h / 2) > Tg * Math.hypot(b.x - w.x, b.y - w.y) + 2 * r) return !1;
		M = c, w = b;
	}
	return !0;
}
const Tg = 1.5;
function Eg(t, n, e) {
	const r = [t];
	let o = t;
	for (const A of n) {
		const t = Math.hypot(A.x1 - o.x, A.y1 - o.y) + Math.hypot(A.x2 - A.x1, A.y2 - A.y1) + Math.hypot(A.x - A.x2, A.y - A.y2), n = Math.max(4, Math.ceil(t / 1));
		for (let e = 1; e < n; e++) r.push($g(o, A, e / n));
		r.push({
			x: A.x,
			y: A.y
		}), o = {
			x: A.x,
			y: A.y
		};
	}
	const s = o, i = function(t) {
		const n = Ig(t);
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
		const e = Ng(t);
		if (null !== e && e.rx > 0 && e.ry > 0) {
			const n = .15, r = Math.cos(e.angle), o = Math.sin(e.angle);
			if (t.every((t) => Rg(t.x - e.cx, t.y - e.cy, e.rx, e.ry, r, o) <= n)) return {
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
	if (null === i) return jg;
	const { cx: a, cy: l, tol: c } = i, h = r.map((t) => Math.atan2(t.y - l, t.x - a));
	let f = 0, u = 0;
	for (let A = 1; A < h.length; A++) {
		const t = qg(h[A], h[A - 1]);
		if (Math.abs(t) > 1e-4) {
			const n = Math.sign(t);
			if (0 !== u && n !== u) return jg;
			u = n;
		}
		f += t;
	}
	const y = Math.abs(f);
	if (y < .5 || y > 2 * Math.PI - .2) return jg;
	const d = Lg(e), p = (t) => Number(t.toFixed(d)), g = 10 ** -d, m = p(180 * i.angle / Math.PI), x = p(s.x), M = p(s.y), w = {
		x: p(t.x),
		y: p(t.y)
	};
	if (p(i.rx) <= 0 || p(i.ry) <= 0) return jg;
	const b = [];
	for (let A = -Og; A <= Og; A++) {
		const t = p(i.rx + A * g), n = p(t * (i.ry / i.rx));
		if (!(t <= 0 || n <= 0)) for (const e of [!1, !0]) for (const r of [!1, !0]) {
			const o = {
				type: "A",
				rx: t,
				ry: n,
				rotation: m,
				largeArc: e,
				sweep: r,
				x,
				y: M
			}, s = k(w.x, w.y, o);
			null !== s && b.push({
				arc: o,
				miss: Math.hypot(s.cx - a, s.cy - l),
				step: A
			});
		}
	}
	for (const { arc: A } of b.toSorted(Kg)) if (zg(w, A, r, c)) return A;
	return Bg;
}
const jg = 0, Bg = 1, Og = 4;
function Kg(t, n) {
	return Math.round(1e3 * t.miss) - Math.round(1e3 * n.miss) || Math.abs(t.step) - Math.abs(n.step);
}
function Dg(t, n) {
	const e = [];
	let r = 0, o = 0, s = 0, i = 0, a = null;
	const l = () => {
		if (null !== a) {
			if (a.cubics.length >= 2) for (const t of function(t, n, e) {
				const r = [];
				let o = t, s = 0;
				for (; s < n.length;) {
					let t = null, i = 0;
					for (let r = 2; s + r <= n.length; r++) {
						const a = Eg(o, n.slice(s, s + r), e);
						if (a === jg) break;
						a !== Bg && (t = a, i = r);
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
			}(a.start, a.cubics, n)) e.push(t);
			else for (const t of a.cubics) e.push(t);
			a = null;
		}
	};
	for (const c of t) if ("C" !== c.type) switch (l(), e.push(c), c.type) {
		case "M":
			r = c.x, o = c.y, s = c.x, i = c.y;
			break;
		case "L":
		case "Q":
		case "A":
			r = c.x, o = c.y;
			break;
		case "Z": r = s, o = i;
	}
	else null === a && (a = {
		start: {
			x: r,
			y: o
		},
		cubics: []
	}), a.cubics.push(c), r = c.x, o = c.y;
	return l(), e;
}
const Hg = [
	1,
	10,
	100,
	1e3,
	1e4
], Xg = [
	"",
	"0",
	"00",
	"000",
	"0000"
], Wg = 0x38d7ea4c68000;
function Gg(t) {
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
function Zg(t, n) {
	const e = t < 0;
	let r = String(Math.abs(t));
	r.length <= n && (r = "0".repeat(n - r.length + 1) + r);
	const o = r.length - n, s = r.slice(0, o);
	let i = r.length;
	for (; i > o && 48 === r.charCodeAt(i - 1);) i--;
	const a = i > o ? `${s}.${r.slice(o, i)}` : s;
	return e && "0" !== a ? `-${a}` : a;
}
function Qg(t, n) {
	if (0 === n) return String(0 | t);
	const e = t < 0 ? -t : t;
	if (!(e <= Wg && Number.isInteger(e))) return Zg(t, n);
	const r = Hg[n], o = e % r, s = (e - o) / r;
	if (0 === o) return t < 0 ? `-${s}` : `${s}`;
	let i = o, a = n;
	for (; i % 10 == 0;) i /= 10, a--;
	const l = `${Xg[a - Gg(i)]}${i}`;
	return t < 0 ? `-${s}.${l}` : `${s}.${l}`;
}
function Yg(t, n) {
	if (0 === n) {
		const n = 0 | t;
		return Gg(n < 0 ? -n : n);
	}
	const e = t < 0 ? -t : t;
	if (!(e <= Wg && Number.isInteger(e))) {
		const e = Zg(t, n);
		return 45 === e.charCodeAt(0) ? e.length - 1 : e.length;
	}
	const r = Hg[n], o = e % r, s = (e - o) / r;
	if (0 === o) return Gg(s);
	let i = o, a = n;
	for (; i % 10 == 0;) i /= 10, a--;
	return Gg(s) + 1 + a;
}
function _g(t, n, e) {
	const r = t * e, o = Math.round(r);
	return Math.abs(r - o) < .5 - (2e-16 * Math.abs(r) + 1e-9) ? o : Math.round(Number(t.toFixed(n)) * e);
}
function Vg(t, n) {
	const e = Qg(t, n);
	return e.startsWith("0.") ? e.slice(1) : e.startsWith("-0.") ? `-${e.slice(2)}` : e;
}
function Jg(t) {
	return "Z" === t.type ? 0 : t.x;
}
function tm(t) {
	return "Z" === t.type ? 0 : t.y;
}
const nm = (t) => "L" === t.type, em = (t) => "C" === t.type, rm = (t) => "L" === t.type || "C" === t.type;
function om(t, n, e) {
	return Math.abs(t - n) * Math.abs(Math.sin(e * Math.PI / 180)) <= .0375;
}
function sm(t, n, e) {
	const r = 1 - e, o = r * r * r, s = 3 * r * r * e, i = 3 * r * e * e, a = e * e * e;
	return {
		x: o * t.x + s * n.x1 + i * n.x2 + a * n.x,
		y: o * t.y + s * n.y1 + i * n.y2 + a * n.y
	};
}
function im(t, n, e, r) {
	const o = t.length;
	let s = 0;
	for (let a = 0; a < o; a++) {
		const e = a + 1 === o ? 0 : a + 1;
		s += t[a] * n[e] - t[e] * n[a];
	}
	const i = 4 * e * r - Math.abs(s) / 2;
	return Math.min(Math.sqrt(Math.max(i, 0) / (4 - Math.PI)), e, r);
}
function am(t, n) {
	let e = t - n;
	for (; e > Math.PI;) e -= 2 * Math.PI;
	for (; e <= -Math.PI;) e += 2 * Math.PI;
	return e;
}
function lm(t, n, e, r, o, s) {
	const i = o - e, a = s - r, l = i * i + a * a;
	let c = l > 0 ? ((t - e) * i + (n - r) * a) / l : 0;
	return c = c < 0 ? 0 : c > 1 ? 1 : c, Math.hypot(t - (e + c * i), n - (r + c * a));
}
const cm = (t) => (t * (t - 1) >> 1) - 3;
function hm(t, n) {
	const e = Lg(n), r = (t) => Number(t.toFixed(e));
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
function fm(t, n, e) {
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
	if (o.every(nm)) {
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
			const o = r.map((t) => Math.round(t.x * e)), s = r.map((t) => Math.round(t.y * e)), i = Math.min(...o), a = Math.max(...o), l = Math.min(...s), c = Math.max(...s);
			if (a === i || c === l) return null;
			for (let h = 0; h < 4; h++) {
				if (o[h] !== i && o[h] !== a || s[h] !== l && s[h] !== c) return null;
				const t = (h + 1) % 4;
				if (o[h] !== o[t] && s[h] !== s[t]) return null;
			}
			return 4 !== new Set(o.map((t, n) => `${t},${s[n]}`)).size ? null : {
				kind: "rect",
				x: i / e,
				y: l / e,
				width: (a - i) / e,
				height: (c - l) / e
			};
		}(r.start, o, 10 ** Lg(n));
		if (t) return t;
	}
	if (!e) return null;
	if (o.length >= 3 && o.every(em)) {
		const t = function(t, n, e) {
			const r = [t];
			let o = t;
			for (const a of n) {
				const t = Math.hypot(a.x1 - o.x, a.y1 - o.y) + Math.hypot(a.x2 - a.x1, a.y2 - a.y1) + Math.hypot(a.x - a.x2, a.y - a.y2), n = Math.max(4, Math.ceil(t / 1));
				for (let e = 1; e < n; e++) r.push(sm(o, a, e / n));
				r.push({
					x: a.x,
					y: a.y
				}), o = {
					x: a.x,
					y: a.y
				};
			}
			const s = Ig(r);
			if (s && s.r > 0) {
				const t = .15;
				if (r.every((n) => Math.abs(Math.hypot(n.x - s.cx, n.y - s.cy) - s.r) <= t)) return hm({
					kind: "circle",
					cx: s.cx,
					cy: s.cy,
					r: s.r
				}, e);
			}
			const i = Ng(r);
			if (i && i.rx > 0 && i.ry > 0) {
				const t = Math.cos(i.angle), n = Math.sin(i.angle);
				if (r.every((e) => Rg(e.x - i.cx, e.y - i.cy, i.rx, i.ry, t, n) <= .15)) {
					const t = 180 * i.angle / Math.PI, n = om(i.rx, i.ry, t) ? void 0 : t;
					return hm({
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
		}(r.start, o, n);
		if (t) return t;
	}
	if (o.length >= 4 && o.some(em) && o.every(rm)) {
		const t = function(t, n, e) {
			const { sx: r, sy: o } = function(t, n) {
				const e = [t.x], r = [t.y], o = (t, n, o, s) => {
					const i = Math.max(2, Math.ceil(Math.hypot(o - t, s - n) / 1));
					for (let a = 1; a <= i; a++) e.push(t + (o - t) * a / i), r.push(n + (s - n) * a / i);
				};
				let s = t;
				for (const i of n) {
					if ("C" === i.type) {
						const t = Math.hypot(i.x1 - s.x, i.y1 - s.y) + Math.hypot(i.x2 - i.x1, i.y2 - i.y1) + Math.hypot(i.x - i.x2, i.y - i.y2), n = Math.max(4, Math.ceil(t / 1));
						for (let o = 1; o < n; o++) {
							const t = sm(s, i, o / n);
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
			let i = 1 / 0, a = -1 / 0, l = 1 / 0, c = -1 / 0;
			for (let m = 0; m < s; m++) r[m] < i && (i = r[m]), r[m] > a && (a = r[m]), o[m] < l && (l = o[m]), o[m] > c && (c = o[m]);
			const h = (i + a) / 2, f = (l + c) / 2, u = (a - i) / 2, y = (c - l) / 2;
			if (u <= 0 || y <= 0) return null;
			const d = .3, p = .3 * (Math.min(u, y) + d) + .6;
			for (let m = 0; m < s; m++) if (Math.min(u - Math.abs(r[m] - h), y - Math.abs(o[m] - f)) > p) return null;
			const g = function(t, n, e) {
				let r = Pg(e), o = Cg(t, n, r), s = .001;
				const i = Array.from({ length: 5 }, () => new Array(5).fill(0)), a = new Array(5).fill(0), l = new Array(5).fill(0);
				for (let c = 0; c < 50 && o > 0; c++) {
					for (let t = 0; t < 5; t++) a[t] = 0, i[t].fill(0);
					for (let o = 0; o < t.length; o++) {
						const e = t[o] - r.cx, s = n[o] - r.cy, c = e >= 0 ? 1 : -1, h = s >= 0 ? 1 : -1, f = Math.abs(e) - (r.hx - r.r), u = Math.abs(s) - (r.hy - r.r);
						let y;
						if (l.fill(0), f > 0 && u > 0) {
							const t = Math.hypot(f, u), n = f / t, e = u / t;
							y = t - r.r, l[0] = -c * n, l[1] = -h * e, l[2] = -n, l[3] = -e, l[4] = n + e - 1;
						} else f >= u ? (y = Math.abs(e) - r.hx, l[0] = -c, l[2] = -1) : (y = Math.abs(s) - r.hy, l[1] = -h, l[3] = -1);
						for (let t = 0; t < 5; t++) if (0 !== l[t]) {
							a[t] += l[t] * y;
							for (let n = 0; n < 5; n++) i[t][n] += l[t] * l[n];
						}
					}
					let e = 0;
					for (let t = 0; t < 5; t++) e += i[t][t];
					const c = 1e-9 * e + 1e-12;
					let h = !1;
					for (; s < 0xe8d4a51000;) {
						const e = Fg(i.map((t, n) => t.map((t, e) => n === e ? t + s * Math.max(t, c) : t)), a.map((t) => -t));
						if (e) {
							const i = Pg({
								cx: r.cx + e[0],
								cy: r.cy + e[1],
								hx: r.hx + e[2],
								hy: r.hy + e[3],
								r: r.r + e[4]
							}), a = Cg(t, n, i);
							if (a < o) {
								h = !0;
								const t = o - a;
								if (r = i, o = a, s = Math.max(s / 10, 1e-12), t <= 1e-12 * (o + t)) return r;
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
				cy: f,
				hx: u,
				hy: y,
				r: im(r, o, u, y)
			});
			for (let m = 0; m < s; m++) if (Math.abs(Sg(r[m], o[m], g.cx, g.cy, g.hx, g.hy, g.r)) > d) return null;
			return g.r < d ? null : function(t, n, e, r, o, s, i) {
				const a = t.length;
				let l = 0;
				const c = (e, r) => {
					for (let o = 0; o < a; o++) {
						const s = ((l + (o % 2 == 1 ? (o + 1) / 2 : -o / 2)) % a + a) % a, i = s + 1 === a ? 0 : s + 1;
						if (lm(e, r, t[s], n[s], t[i], n[i]) <= .3) return l = s, !0;
					}
					return !1;
				}, h = o - i, f = s - i, u = [
					[
						e + h,
						r - f,
						-Math.PI / 2
					],
					[
						e + h,
						r + f,
						0
					],
					[
						e - h,
						r + f,
						Math.PI / 2
					],
					[
						e - h,
						r - f,
						Math.PI
					]
				], y = Math.max(2, Math.ceil(.5 * Math.PI * i / .5));
				for (let d = 0; d < 4; d++) {
					const [t, n, e] = u[d];
					for (let u = 0; u < y; u++) {
						const r = e + .5 * Math.PI * u / y;
						if (!c(t + i * Math.cos(r), n + i * Math.sin(r))) return !1;
					}
					const r = e + .5 * Math.PI, o = t + i * Math.cos(r), s = n + i * Math.sin(r), [a, l, h] = u[(d + 1) % 4], f = a + i * Math.cos(h), p = l + i * Math.sin(h), g = Math.max(1, Math.ceil(Math.hypot(f - o, p - s) / .5));
					for (let i = 0; i < g; i++) if (!c(o + (f - o) * i / g, s + (p - s) * i / g)) return !1;
				}
				return !0;
			}(r, o, g.cx, g.cy, g.hx, g.hy, g.r) ? hm({
				kind: "rrect",
				x: g.cx - g.hx,
				y: g.cy - g.hy,
				width: 2 * g.hx,
				height: 2 * g.hy,
				r: g.r
			}, e) : null;
		}(r.start, o, n);
		if (t) return t;
	}
	return o.length < 3 ? null : function(t, n, e) {
		const r = [], o = [];
		(function(t, n, e, r) {
			let o = t.x, s = t.y;
			for (const i of n) {
				if ("A" === i.type) {
					const t = k(o, s, i);
					if (null === t) e.push(o), r.push(s);
					else {
						const n = Math.cos(t.phi), o = Math.sin(t.phi), s = Math.abs(t.dTheta) * Math.max(t.rx, t.ry), i = Math.max(2, Math.ceil(s / 1));
						for (let a = 0; a < i; a++) {
							const s = t.theta1 + t.dTheta * a / i, l = t.rx * Math.cos(s), c = t.ry * Math.sin(s);
							e.push(t.cx + n * l - o * c), r.push(t.cy + o * l + n * c);
						}
					}
					o = i.x, s = i.y;
					continue;
				}
				if ("C" === i.type) {
					for (let t = 0; t < 8; t++) {
						const n = t / 8, a = 1 - n, l = a * a * a, c = 3 * a * a * n, h = 3 * a * n * n, f = n * n * n;
						e.push(l * o + c * i.x1 + h * i.x2 + f * i.x), r.push(l * s + c * i.y1 + h * i.y2 + f * i.y);
					}
					o = i.x, s = i.y;
				} else if ("Q" === i.type) {
					for (let t = 0; t < 8; t++) {
						const n = t / 8, a = 1 - n;
						e.push(a * a * o + 2 * a * n * i.x1 + n * n * i.x), r.push(a * a * s + 2 * a * n * i.y1 + n * n * i.y);
					}
					o = i.x, s = i.y;
				} else if ("L" === i.type) {
					const t = Math.max(1, Math.round(Math.hypot(i.x - o, i.y - s) / 2));
					for (let n = 0; n < t; n++) e.push(o + (i.x - o) * n / t), r.push(s + (i.y - s) * n / t);
					o = i.x, s = i.y;
				}
			}
			if (Math.hypot(o - t.x, s - t.y) > 1e-6) {
				const n = Math.max(1, Math.round(Math.hypot(t.x - o, t.y - s) / 2));
				for (let i = 0; i < n; i++) e.push(o + (t.x - o) * i / n), r.push(s + (t.y - s) * i / n);
			}
		})(t, n, r, o);
		const s = r.length;
		if (s < 24) return null;
		let i = 0, a = 0, l = 0, c = 0, h = 0;
		for (let k = 0; k < s; k++) {
			const t = k + 1 < s ? k + 1 : 0, n = r[k] * o[t] - r[t] * o[k];
			l += n, c += (r[k] + r[t]) * n, h += (o[k] + o[t]) * n, i += r[k], a += o[k];
		}
		const f = Math.abs(l) < 1e-6, u = f ? i / s : c / (3 * l), y = f ? a / s : h / (3 * l), d = new Float64Array(s), p = new Float64Array(s);
		let g = -1 / 0, m = 1 / 0, x = -1 / 0, M = 1 / 0, w = -1 / 0;
		for (let k = 0; k < s; k++) d[k] = Math.hypot(r[k] - u, o[k] - y), p[k] = Math.atan2(o[k] - y, r[k] - u), g = Math.max(g, d[k]), m = Math.min(m, r[k]), x = Math.max(x, r[k]), M = Math.min(M, o[k]), w = Math.max(w, o[k]);
		if (g < 3) return null;
		const b = (t, n, e) => {
			let r = 1 / 0, o = -1 / 0, s = 1 / 0, i = -1 / 0;
			for (let l = 0; l < e; l++) t[l] < r && (r = t[l]), t[l] > o && (o = t[l]), n[l] < s && (s = n[l]), n[l] > i && (i = n[l]);
			const a = .6;
			return Math.abs(r - m) <= a && Math.abs(o - x) <= a && Math.abs(s - M) <= a && Math.abs(i - w) <= a;
		}, A = (t, n, e, i, a) => {
			let l = 0;
			for (let c = 0; c < s; c++) {
				const s = p[c];
				let h = !1;
				for (let t = 0; t < i; t++) if (Math.abs(am(s, e[t])) < a) {
					h = !0;
					break;
				}
				if (h) continue;
				let f = 1 / 0;
				for (let e = 0; e < i && f > .3; e++) {
					const s = (e + 1) % i, a = lm(r[c], o[c], t[e], n[e], t[s], n[s]);
					a < f && (f = a);
				}
				if (f > .3) return !1;
				l++;
			}
			return l >= i;
		};
		let v = 0;
		for (let k = 1; k < s; k++) d[k] > d[v] && (v = k);
		const F = p[v], I = /* @__PURE__ */ new Float64Array(75), N = /* @__PURE__ */ new Float64Array(75), S = /* @__PURE__ */ new Uint8Array(75), P = /* @__PURE__ */ new Uint8Array(75), C = /* @__PURE__ */ new Uint8Array(13), U = (t) => {
			if (1 === C[t]) return;
			C[t] = 1;
			const n = cm(t), e = 2 * Math.PI / t, r = e / 5;
			for (let o = 0; o < t; o++) I[n + o] = -1 / 0, N[n + o] = 1 / 0;
			for (let o = 0; o < s; o++) {
				const s = p[o], i = (s - F) / e, a = Math.floor(i), l = i - a;
				if (l < .200000001 || l > .799999999) {
					let i = (0 | (l < .5 ? a : a + 1)) % t;
					i < 0 && (i += t), Math.abs(am(s, F + i * e)) <= r && (S[n + i] = 1, d[o] > I[n + i] && (I[n + i] = d[o]));
				} else if (l > .29999999899999996 && l < .700000001) {
					let i = (0 | a) % t;
					i < 0 && (i += t), Math.abs(am(s, F + (i + .5) * e)) <= r && (P[n + i] = 1, d[o] < N[n + i] && (N[n + i] = d[o]));
				}
			}
		}, L = (t) => {
			const n = cm(t);
			for (let e = 0; e < t; e++) if (0 === S[n + e] || 0 === P[n + e]) return !1;
			return !0;
		}, $ = /* @__PURE__ */ new Float64Array(24), q = /* @__PURE__ */ new Float64Array(24), R = /* @__PURE__ */ new Float64Array(24), z = (t) => {
			const n = [];
			for (let e = 0; e < t; e++) n.push({
				x: $[e],
				y: q[e]
			});
			return n;
		};
		for (let k = 3; k <= 12; k++) {
			if (U(k), !L(k)) continue;
			const t = cm(k), n = 2 * Math.PI / k;
			let r = 0;
			for (let e = 0; e < k; e++) r += N[t + e];
			const o = r / k / Math.cos(Math.PI / k);
			for (let e = 0; e < k; e++) {
				const t = F + e * n;
				R[e] = t, $[e] = u + o * Math.cos(t), q[e] = y + o * Math.sin(t);
			}
			if (4 === k) {
				const t = Math.atan2(Math.abs(q[1] - q[0]), Math.abs($[1] - $[0]));
				if (t < Math.PI / 12 || t > Math.PI / 2 - Math.PI / 12) continue;
			}
			if (b($, q, k) && A($, q, R, k, .18 * n)) return hm({
				kind: "polygon",
				points: z(k)
			}, e);
		}
		for (let k = 3; k <= 12; k++) {
			if (U(k), !L(k)) continue;
			const t = cm(k), n = 2 * Math.PI / k;
			let r = 0, o = 0;
			for (let e = 0; e < k; e++) r += I[t + e], o += N[t + e];
			const s = r / k, i = o / k;
			if (!(i >= s * Math.cos(Math.PI / k) - .3)) {
				for (let t = 0; t < 2 * k; t++) {
					const e = F + t * n / 2;
					R[t] = e;
					const r = t % 2 == 0 ? s : i;
					$[t] = u + r * Math.cos(e), q[t] = y + r * Math.sin(e);
				}
				if (b($, q, 2 * k) && A($, q, R, 2 * k, .09 * n)) return hm({
					kind: "polygon",
					points: z(2 * k)
				}, e);
			}
		}
		return null;
	}(r.start, o, n);
}
function um(t, n, e = .1) {
	if ("circle" === t.kind && "circle" === n.kind) {
		const r = t.r - n.r;
		return r <= 0 || Math.hypot(t.cx - n.cx, t.cy - n.cy) / 2 > e ? null : {
			primitive: {
				kind: "circle",
				cx: (t.cx + n.cx) / 2,
				cy: (t.cy + n.cy) / 2,
				r: (t.r + n.r) / 2
			},
			width: r
		};
	}
	const r = ym(t), o = ym(n);
	if (null === r || null === o) return null;
	const s = [
		o.x - r.x,
		o.y - r.y,
		r.x + r.width - (o.x + o.width),
		r.y + r.height - (o.y + o.height)
	];
	if (s.some((t) => t <= 0)) return null;
	const i = (s[0] + s[1] + s[2] + s[3]) / 4;
	let a = Math.max(...s.map((t) => Math.abs(t - i) / 2));
	const l = Math.SQRT2 - 1, c = Math.max(r.r, 0), h = Math.max(o.r, 0);
	let f = 0;
	if (c < e / l && h < e / l) a = Math.max(a, Math.max(c, h) * l);
	else {
		if (f = h > e / l ? (c + h) / 2 : c - i / 2, f <= 0) return null;
		const t = f + i / 2, n = Math.max(f - i / 2, 0);
		a = Math.max(a, Math.max(Math.abs(t - c), Math.abs(n - h)) * l);
	}
	const u = (r.x + o.x) / 2, y = (r.y + o.y) / 2, d = (r.x + r.width + o.x + o.width) / 2, p = (r.y + r.height + o.y + o.height) / 2;
	if (a > e || 2 * f > Math.min(d - u, p - y)) return null;
	const g = {
		x: u,
		y,
		width: d - u,
		height: p - y
	};
	return {
		primitive: f > 0 ? {
			kind: "rrect",
			...g,
			r: f
		} : {
			kind: "rect",
			...g
		},
		width: i
	};
}
function ym(t) {
	return "rect" === t.kind ? {
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
		r: 0
	} : "rrect" === t.kind ? {
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
		r: t.r
	} : null;
}
const dm = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function pm(t) {
	return t.replace(/[&<>"']/g, (t) => dm[t]);
}
function gm(t, n) {
	if (t.includes("<") || t.includes("\"")) throw new Error(`unsafe ${n} in SVG output: ${JSON.stringify(t)}`);
	return t;
}
function mm(t, n, e) {
	let r = "";
	return r += ` fill="${void 0 === t.fill ? "none" : gm(t.fill, "fill")}"`, void 0 !== t.fillOpacity && t.fillOpacity < 1 && (r += ` fill-opacity="${Ug(t.fillOpacity, 3)}"`), e && void 0 !== t.fillRule && (r += ` fill-rule="${t.fillRule}"`), void 0 !== t.stroke && (r += ` stroke="${gm(t.stroke, "stroke")}"`), void 0 !== t.strokeWidth && (r += ` stroke-width="${Ug(t.strokeWidth, n)}"`), void 0 !== t.strokeLinecap && (r += ` stroke-linecap="${t.strokeLinecap}"`), void 0 !== t.strokeLinejoin && (r += ` stroke-linejoin="${t.strokeLinejoin}"`), void 0 !== t.id && "" !== t.id && (r += ` id="${pm(t.id)}"`), r;
}
function xm(t, n, e, r, o) {
	const s = (t) => Number(Ug(t, o)), i = s(t), a = s(n);
	return [
		Ug(i, o),
		Ug(a, o),
		Ug(s(t + e) - i, o),
		Ug(s(n + r) - a, o)
	];
}
function Mm(t, n, e) {
	const r = mm(n, e, !1), o = (t) => Ug(t, e);
	switch (t.kind) {
		case "rect": {
			const [n, o, s, i] = xm(t.x, t.y, t.width, t.height, e);
			return `<rect x="${n}" y="${o}" width="${s}" height="${i}"${r}/>`;
		}
		case "rrect": {
			const [n, s, i, a] = xm(t.x, t.y, t.width, t.height, e);
			return `<rect x="${n}" y="${s}" width="${i}" height="${a}" rx="${o(t.r)}"${r}/>`;
		}
		case "circle": return `<circle cx="${o(t.cx)}" cy="${o(t.cy)}" r="${o(t.r)}"${r}/>`;
		case "ellipse": {
			const n = void 0 === t.angle || om(t.rx, t.ry, t.angle) ? "" : ` transform="rotate(${o(t.angle)} ${o(t.cx)} ${o(t.cy)})"`;
			return `<ellipse cx="${o(t.cx)}" cy="${o(t.cy)}" rx="${o(t.rx)}" ry="${o(t.ry)}"${n}${r}/>`;
		}
		case "polygon": return `<polygon points="${t.points.map((t) => `${o(t.x)},${o(t.y)}`).join(" ")}"${r}/>`;
	}
}
function wm(t, n) {
	if ("" === t.content) return "";
	const e = (t) => Ug(t, n);
	let r = `x="${e(t.x)}" y="${e(t.y)}"`;
	return void 0 !== t.angle && Math.abs(t.angle) > .05 && (r += ` transform="rotate(${e(t.angle)} ${e(t.x)} ${e(t.y)})"`), r += ` font-family="${pm(t.fontFamily)}" font-size="${e(t.fontSize)}"`, r += ` font-weight="${Ug(t.fontWeight, 0)}"`, "italic" === t.fontStyle && (r += " font-style=\"italic\""), void 0 !== t.anchor && "start" !== t.anchor && (r += ` text-anchor="${t.anchor}"`), r += ` fill="${gm(t.fill, "text fill")}"`, `<text ${r}>${pm(t.content)}</text>`;
}
function bm(t, n, e, r, o = !1) {
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
				svg: Mm(e.primitive, r, n)
			};
		}
		if (void 0 !== t.primitive && void 0 === t.stroke) return {
			kind: "element",
			svg: Mm(t.primitive, t, n)
		};
		const s = function(t, n) {
			const e = 10 ** Lg(n);
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
					x: Jg(i),
					y: tm(i),
					edge: i.type,
					op: i
				});
				const o = r.slice(0, 1);
				for (let i = 1; i < r.length; i++) {
					let t = r[i];
					for (; o.length >= 2 && "L" === o[o.length - 1].edge && "L" === t.edge;) {
						const n = o[o.length - 2], r = o[o.length - 1], s = e(n.x), i = e(n.y), a = e(r.x), l = e(r.y), c = e(t.x), h = e(t.y), f = (a - s) * (c - s) + (l - i) * (h - i);
						if (!(0 === (a - s) * (h - i) - (l - i) * (c - s) && f >= 0 && f <= (c - s) * (c - s) + (h - i) * (h - i))) break;
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
		}(t.commands, n), i = fm(s, n, r);
		if (null !== i) return {
			kind: "element",
			svg: Mm(i, t, n)
		};
		const a = gm(function(t, n, e = !1) {
			const r = Lg(n), o = Hg[r], s = e ? Vg : Qg, i = e ? (t, n) => Yg(t, n) - (0 !== t && t > -o && t < o ? 1 : 0) : Yg;
			let a = 0, l = 0, c = 0, h = 0, f = !1, u = "";
			const y = /* @__PURE__ */ new Float64Array(6), d = /* @__PURE__ */ new Float64Array(6);
			let p = "", g = !1;
			const m = (t, n) => {
				const r = t.charCodeAt(0);
				e ? (n || 45 === r || 46 === r && g || (u += " "), g = t.includes(".")) : 45 !== r && (u += " "), u += t;
			}, x = (t, n, o, i) => {
				let a = !0;
				e ? t === p && "M" !== t && "m" !== t ? a = !1 : u += t : u += "" === u ? t : ` ${t}`, p = t;
				for (let e = o; e < o + i; e++) m(s(n[e], r), a), a = !1;
			}, M = (t, n, e, o) => {
				x(t, y, 0, 3), u += ` ${e} ${o}`, g = !1;
				for (let i = 3; i < 5; i++) {
					const t = s(n[i], r);
					45 !== t.charCodeAt(0) && (u += " "), u += t, g = t.includes(".");
				}
			};
			for (const w of t) switch (w.type) {
				case "M": {
					const t = _g(w.x, r, o), n = _g(w.y, r, o);
					if (y[0] = t, y[1] = n, f) {
						d[0] = t - a, d[1] = n - l;
						const e = i(t, r) + i(n, r);
						i(d[0], r) + i(d[1], r) < e ? x("m", d, 0, 2) : x("M", y, 0, 2);
					} else x("M", y, 0, 2), f = !0;
					a = t, l = n, c = t, h = n;
					break;
				}
				case "L": {
					const t = _g(w.x, r, o), n = _g(w.y, r, o);
					y[0] = t, y[1] = n, d[0] = t - a, d[1] = n - l;
					let e = "L", s = y, c = 0, h = 2, f = i(t, r) + i(n, r) + 2;
					const u = i(d[0], r) + i(d[1], r) + 2;
					if (u < f && (f = u, e = "l", s = d), n === l) {
						const n = i(t, r) + 1;
						n < f && (f = n, e = "H", s = y, c = 0, h = 1);
						const o = i(d[0], r) + 1;
						o < f && (f = o, e = "h", s = d, c = 0, h = 1);
					}
					if (t === a) {
						const t = i(n, r) + 1;
						t < f && (f = t, e = "V", s = y, c = 1, h = 1);
						const o = i(d[1], r) + 1;
						o < f && (f = o, e = "v", s = d, c = 1, h = 1);
					}
					x(e, s, c, h), a = t, l = n;
					break;
				}
				case "Q": {
					y[0] = _g(w.x1, r, o), y[1] = _g(w.y1, r, o), y[2] = _g(w.x, r, o), y[3] = _g(w.y, r, o), d[0] = y[0] - a, d[1] = y[1] - l, d[2] = y[2] - a, d[3] = y[3] - l;
					let t = 0, n = 0;
					for (let e = 0; e < 4; e++) t += i(y[e], r), n += i(d[e], r);
					n < t ? x("q", d, 0, 4) : x("Q", y, 0, 4), a = y[2], l = y[3];
					break;
				}
				case "C": {
					y[0] = _g(w.x1, r, o), y[1] = _g(w.y1, r, o), y[2] = _g(w.x2, r, o), y[3] = _g(w.y2, r, o), y[4] = _g(w.x, r, o), y[5] = _g(w.y, r, o);
					for (let e = 0; e < 6; e += 2) d[e] = y[e] - a, d[e + 1] = y[e + 1] - l;
					let t = 0, n = 0;
					for (let e = 0; e < 6; e++) t += i(y[e], r), n += i(d[e], r);
					n < t ? x("c", d, 0, 6) : x("C", y, 0, 6), a = y[4], l = y[5];
					break;
				}
				case "A": {
					y[0] = _g(w.rx, r, o), y[1] = _g(w.ry, r, o), y[2] = _g(w.rotation, r, o), y[3] = _g(w.x, r, o), y[4] = _g(w.y, r, o), d[3] = y[3] - a, d[4] = y[4] - l;
					const t = i(y[3], r) + i(y[4], r);
					i(d[3], r) + i(d[4], r) < t ? M("a", d, w.largeArc ? 1 : 0, w.sweep ? 1 : 0) : M("A", y, w.largeArc ? 1 : 0, w.sweep ? 1 : 0), a = y[3], l = y[4];
					break;
				}
				case "Z": u += e || "" === u ? "Z" : " Z", p = "Z", g = !1, a = c, l = h;
			}
			return u;
		}(r ? Dg(s, n) : s, n, o), "path data");
		return "" === a ? null : {
			kind: "path",
			d: a,
			paint: mm(t, n, !0)
		};
	}
	const s = gm(function(t, n) {
		const e = Lg(n);
		let r = "";
		const o = (t) => {
			"" !== r && 45 !== t.charCodeAt(0) && (r += " "), r += t;
		}, s = (t) => {
			o(Ug(t, e));
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
		svg: `<path d="${s}"${mm(t, n, !0)}/>`
	};
}
function Am(t, n, e, r, o, s, i) {
	const a = [];
	let l = null;
	const c = () => {
		null !== l && (a.push(`<path d="${l.d}"${l.paint}/>`), l = null);
	};
	for (const h of n) {
		const n = void 0 !== i && h < i.length ? i[h] : bm(t[h], e, r, o, s);
		null !== n && ("element" === n.kind ? (c(), a.push(n.svg)) : !0 === t[h].unfoldable ? (c(), a.push(`<path d="${n.d}"${n.paint}/>`)) : null !== l && l.paint === n.paint ? l.d += s ? n.d : ` ${n.d}` : (c(), l = {
			d: n.d,
			paint: n.paint
		}));
	}
	return c(), a;
}
function km(t) {
	return void 0 !== t.fill && "none" !== t.fill ? t.fill : t.stroke ?? "";
}
function vm(t) {
	return [t.data.buffer, t.offsets.buffer];
}
function Fm(t) {
	const n = new Int32Array(t.length + 1);
	let e = 0;
	for (let s = 0; s < t.length; s++) e += t[s].length, n[s + 1] = e;
	const r = new Float64Array(e);
	let o = 0;
	for (const s of t) r.set(s, o), o += s.length;
	return {
		data: r,
		offsets: n
	};
}
function Im(t, n) {
	const { data: e } = t, r = t.offsets[n + 1], o = [];
	let s = t.offsets[n];
	for (; s < r;) switch (e[s]) {
		case 0:
			o.push({
				type: "M",
				x: e[s + 1],
				y: e[s + 2]
			}), s += 3;
			break;
		case 1:
			o.push({
				type: "L",
				x: e[s + 1],
				y: e[s + 2]
			}), s += 3;
			break;
		case 2:
			o.push({
				type: "Q",
				x1: e[s + 1],
				y1: e[s + 2],
				x: e[s + 3],
				y: e[s + 4]
			}), s += 5;
			break;
		case 3:
			o.push({
				type: "C",
				x1: e[s + 1],
				y1: e[s + 2],
				x2: e[s + 3],
				y2: e[s + 4],
				x: e[s + 5],
				y: e[s + 6]
			}), s += 7;
			break;
		case 4:
			o.push({
				type: "A",
				rx: e[s + 1],
				ry: e[s + 2],
				rotation: e[s + 3],
				largeArc: 0 !== e[s + 4],
				sweep: 0 !== e[s + 5],
				x: e[s + 6],
				y: e[s + 7]
			}), s += 8;
			break;
		case 5:
			o.push({ type: "Z" }), s += 1;
			break;
		default: throw new Error(`unknown path command tag ${e[s]}`);
	}
	return o;
}
function Nm(t, n, e) {
	const r = n.subarray(12 * e, 12 * (e + 1)), o = {
		x0: r[0],
		y0: r[1],
		segments: Im(t, e),
		closed: 0 !== r[2],
		params: r[3],
		chi2: r[4]
	}, s = function(t) {
		switch (t[5]) {
			case 1: return {
				kind: "circle",
				cx: t[6],
				cy: t[7],
				r: t[8]
			};
			case 2: return {
				kind: "ellipse",
				cx: t[6],
				cy: t[7],
				rx: t[8],
				ry: t[9],
				rotation: t[10]
			};
			case 3: return {
				kind: "rect",
				cx: t[6],
				cy: t[7],
				w: t[8],
				h: t[9],
				r: t[10],
				rotation: t[11]
			};
			default: return null;
		}
	}(r);
	return null !== s && (o.primitive = s), o;
}
function Sm(t, n) {
	const e = new Int32Array(t.length);
	if (n <= 1) return e;
	const r = t.map((t, n) => n).toSorted((n, e) => t[e] - t[n] || n - e), o = new Float64Array(n);
	for (const s of r) {
		let r = 0;
		for (let t = 1; t < n; t++) o[t] < o[r] && (r = t);
		e[s] = r, o[r] += t[s];
	}
	return e;
}
var Pm = class {
	slots;
	jobs = /* @__PURE__ */ new Map();
	nextJobId = 1;
	constructor(t) {
		this.slots = t.map((t) => ({
			endpoint: t,
			imageKey: null,
			stackKey: null,
			ringKey: null,
			chainKey: null,
			edgeKey: null,
			bandKey: null
		}));
		for (let n = 0; n < this.slots.length; n++) {
			const t = this.slots[n];
			t.endpoint.addEventListener("message", (t) => {
				this.handleMessage(n, t.data);
			}), t.endpoint.start?.();
		}
	}
	get size() {
		return this.slots.length;
	}
	helperOf(t) {
		return t % this.slots.length;
	}
	setImage(t, n, e) {
		for (const r of this.slots) {
			if (r.imageKey === t) continue;
			const o = n.data.slice().buffer, s = e ? e.slice().buffer : void 0;
			this.send(r, {
				type: "helper-image",
				key: t,
				width: n.width,
				height: n.height,
				buffer: o,
				alpha: s
			}, s ? [o, s] : [o]), r.imageKey = t;
		}
	}
	setStackPlan(t, n) {
		for (const e of this.slots) {
			if (e.stackKey === t) continue;
			const r = n.stackLabels.slice().buffer, o = n.order.slice().buffer, s = n.islandLabels.slice().buffer, i = n.islandPixels.slice().buffer, a = n.islandOffsets.slice().buffer;
			this.send(e, {
				type: "helper-stack",
				key: t,
				width: n.width,
				height: n.height,
				labelCount: n.labelCount,
				stackLabels: r,
				order: o,
				islandLabels: s,
				islandPixels: i,
				islandOffsets: a,
				turnPolicy: n.turnPolicy,
				minArea: n.minArea
			}, [
				r,
				o,
				s,
				i,
				a
			]), e.stackKey = t;
		}
	}
	setRingUnits(t, n) {
		for (let e = 0; e < this.slots.length; e++) {
			const r = this.slots[e];
			if (r.ringKey === t) continue;
			const o = [], s = [];
			for (let t = 0; t < n.rings.length; t++) this.helperOf(t) === e && (o.push(t), s.push(n.rings[t]));
			const i = Fm(s), a = new Int32Array(o).buffer, l = n.coverage ? n.coverage.data.slice().buffer : void 0;
			this.send(r, {
				type: "helper-rings",
				key: t,
				width: n.width,
				height: n.height,
				units: a,
				rings: i,
				coverage: l
			}, [
				a,
				...vm(i),
				...l ? [l] : []
			]), r.ringKey = t;
		}
	}
	setChains(t, n) {
		for (let e = 0; e < this.slots.length; e++) {
			const r = this.slots[e];
			if (r.chainKey === t) continue;
			const o = [], s = [], i = [], a = [], l = [];
			for (let t = 0; t < n.chains.length; t++) {
				if (this.helperOf(t) !== e) continue;
				const r = n.chains[t];
				o.push(t), s.push(r.points), i.push(r.left), a.push(r.right), l.push(r.loop ? 1 : 0);
			}
			const c = Fm(s), h = new Int32Array(o).buffer, f = new Int32Array(i).buffer, u = new Int32Array(a).buffer, y = new Uint8Array(l).buffer;
			this.send(r, {
				type: "helper-chains",
				key: t,
				width: n.width,
				height: n.height,
				units: h,
				left: f,
				right: u,
				loop: y,
				points: c
			}, [
				h,
				f,
				u,
				y,
				...vm(c)
			]), r.chainKey = t;
		}
	}
	setEdges(t, n, e) {
		for (let r = 0; r < this.slots.length; r++) {
			const o = this.slots[r];
			if (o.edgeKey === t) continue;
			const s = [], i = [], a = [], l = [];
			for (let t = 0; t < n.edges.length; t++) {
				if (e[t] !== r) continue;
				const o = n.edges[t];
				s.push(t), i.push(o.closed ? 1 : 0), a.push(o.points), l.push(o.sigma);
			}
			const c = Fm(a), h = Fm(l), f = new Int32Array(s).buffer, u = new Uint8Array(i).buffer;
			this.send(o, {
				type: "helper-edges",
				key: t,
				width: n.width,
				height: n.height,
				tau: n.cfg.tau,
				lambda: n.cfg.lambda,
				units: f,
				closed: u,
				points: c,
				sigma: h
			}, [
				f,
				u,
				...vm(c),
				...vm(h)
			]), o.edgeKey = t;
		}
	}
	setBands(t, n) {
		for (const e of this.slots) {
			if (e.bandKey === t) continue;
			const r = n.labels.slice().buffer, o = n.rgb.slice().buffer, s = n.inkRgb.slice().buffer;
			this.send(e, {
				type: "helper-bands",
				key: t,
				width: n.w,
				height: n.h,
				labels: r,
				rgb: o,
				inkRgb: s,
				sigmaNoise: n.sigmaNoise,
				lambda: n.lambda,
				regionRecovery: n.regionRecovery,
				gradients: n.gradients,
				scale: n.scale,
				stopGeometries: n.search.stopGeometries,
				radialsPerSpace: n.search.radialsPerSpace
			}, [
				r,
				o,
				s
			]), e.bandKey = t;
		}
	}
	setBandBatch(t, n, e) {
		for (const r of this.slots) {
			const o = e.merges.slice().buffer, s = e.a.slice().buffer, i = e.b.slice().buffer, a = e.inner.slice().buffer;
			this.send(r, {
				type: "helper-band-batch",
				bands: t,
				key: n,
				merges: o,
				a: s,
				b: i,
				inner: a
			}, [
				o,
				s,
				i,
				a
			]);
		}
	}
	async *dispatch(t) {
		if (0 === this.slots.length) throw new Error("helper pool is empty");
		const n = this.nextJobId++, e = {
			id: n,
			pending: /* @__PURE__ */ new Set(),
			results: /* @__PURE__ */ new Map(),
			error: null,
			wake: null
		};
		this.jobs.set(n, e);
		const r = () => this.abort(e);
		t.signal?.addEventListener("abort", r);
		try {
			const r = this.slots.map(() => []), o = t.owners, s = (t) => !o || o[t] < this.slots.length;
			for (let n = 0; n < t.total; n++) s(n) && r[o ? o[n] : this.helperOf(n)].push(n);
			for (let i = 0; i < this.slots.length; i++) {
				const o = r[i];
				if (0 === o.length) continue;
				e.pending.add(i);
				const s = t.paletteRgb ? t.paletteRgb.slice().buffer : void 0;
				this.send(this.slots[i], {
					type: "helper-job",
					id: n,
					kind: t.kind,
					units: o,
					stateKey: t.stateKey,
					curve: t.curve,
					batch: Math.max(1, t.batch ?? 1),
					meta: t.meta ? o.map(t.meta) : void 0,
					serialize: t.serialize,
					paletteRgb: s,
					alphaThreshold: t.alphaThreshold,
					arcPrecision: t.arcPrecision
				}, s ? [s] : []);
			}
			for (let n = 0; n < t.total; n++) {
				if (!s(n)) continue;
				for (; !e.results.has(n);) {
					if (e.error) throw e.error;
					if (0 === e.pending.size) throw new Error(`helper pool: unit ${n} was never produced`);
					await new Promise((t) => e.wake = t);
				}
				const t = e.results.get(n);
				e.results.delete(n), yield t;
			}
		} finally {
			if (t.signal?.removeEventListener("abort", r), this.jobs.delete(n), e.pending.size > 0) for (const t of e.pending) this.send(this.slots[t], {
				type: "helper-cancel",
				id: n
			});
		}
	}
	cancel() {
		for (const t of this.jobs.values()) this.abort(t);
	}
	abort(t) {
		t.error = new p();
		for (const n of t.pending) this.send(this.slots[n], {
			type: "helper-cancel",
			id: t.id
		});
		t.wake?.(), t.wake = null;
	}
	send(t, n, e) {
		t.endpoint.postMessage(n, e);
	}
	handleMessage(t, n) {
		const e = this.jobs.get(n.id);
		if (e) {
			switch (n.type) {
				case "helper-batch": {
					const t = n.fits ? new Float64Array(n.fits) : void 0;
					let r = 0, o = 0;
					for (let s = 0; s < n.units.length; s++) {
						const i = n.counts[s], a = n.svgCounts?.[s] ?? i, l = t ? Nm(n.commands, t, r) : void 0, c = new Array(i);
						for (let t = 0; t < i; t++) c[t] = l && 0 === t ? l.segments : Im(n.commands, r + t);
						const h = n.svg ? n.svg.slice(o, o + a) : void 0;
						r += i, o += a;
						const f = n.fills?.[s];
						e.results.set(n.units[s], {
							unit: n.units[s],
							shapes: c,
							svg: h,
							fit: l,
							fill: f
						});
					}
					break;
				}
				case "helper-done":
					e.pending.delete(t);
					break;
				case "helper-error": e.pending.delete(t), e.error ??= new Error(n.message);
			}
			e.wake?.(), e.wake = null;
		}
	}
};
function Cm(t, n, e) {
	const r = t.length;
	let o = -1;
	for (let a = 0; a < r; a++) if (t[a] !== n) {
		o = a;
		break;
	}
	if (o < 0) return;
	const s = 1 === n ? 0 : 1;
	let i = 0;
	for (; i < r;) {
		const a = (o + i) % r;
		if (t[a] !== n) {
			i++;
			continue;
		}
		let l = 0;
		for (; l < r && t[(a + l) % r] === n;) l++;
		if (l < e) for (let n = 0; n < l; n++) t[(a + n) % r] = s;
		i += l;
	}
}
function Um(t, n) {
	const { width: e, height: r, data: o } = t, s = e * r, i = new Float32Array(4 * s);
	for (let a = 0, l = 0; a < s; a++, l += 4) {
		const t = null === n ? 1 : n[a] / 255, e = 1 - t;
		i[l] = Math.max(0, o[l] / 255 - e), i[l + 1] = Math.max(0, o[l + 1] / 255 - e), i[l + 2] = Math.max(0, o[l + 2] / 255 - e), i[l + 3] = t;
	}
	return {
		width: e,
		height: r,
		data: i
	};
}
function Lm(t) {
	const n = a(t) ?? [
		255,
		255,
		255
	];
	return [
		n[0] / 255,
		n[1] / 255,
		n[2] / 255
	];
}
function $m(t) {
	const n = t.segments, e = [];
	for (let r = n.length - 1; r >= 0; r--) {
		const o = n[r], s = r > 0 ? n[r - 1] : {
			x: t.x0,
			y: t.y0
		};
		switch (o.type) {
			case "L":
				e.push({
					type: "L",
					x: s.x,
					y: s.y
				});
				break;
			case "Q":
				e.push({
					type: "Q",
					x1: o.x1,
					y1: o.y1,
					x: s.x,
					y: s.y
				});
				break;
			case "C":
				e.push({
					type: "C",
					x1: o.x2,
					y1: o.y2,
					x2: o.x1,
					y2: o.y1,
					x: s.x,
					y: s.y
				});
				break;
			case "A": e.push({
				type: "A",
				rx: o.rx,
				ry: o.ry,
				rotation: o.rotation,
				largeArc: o.largeArc,
				sweep: !o.sweep,
				x: s.x,
				y: s.y
			});
		}
	}
	return e;
}
function qm(t, n) {
	const e = [];
	for (let r = 0; r < t.edges.length; r++) {
		const o = n[t.edges[r]], s = t.reversed[r];
		if (0 === r) if (s) {
			const t = o.segments[o.segments.length - 1];
			e.push({
				type: "M",
				x: t?.x ?? o.x0,
				y: t?.y ?? o.y0
			});
		} else e.push({
			type: "M",
			x: o.x0,
			y: o.y0
		});
		for (const t of s ? $m(o) : o.segments) e.push(t);
	}
	return e.push({ type: "Z" }), e;
}
function Rm(t, n, e) {
	switch (t.kind) {
		case "circle": return {
			kind: "circle",
			cx: t.cx * n + e,
			cy: t.cy * n + e,
			r: t.r * n
		};
		case "ellipse": return {
			...t,
			cx: t.cx * n + e,
			cy: t.cy * n + e,
			rx: t.rx * n,
			ry: t.ry * n
		};
		case "rect": return {
			kind: "rect",
			x: t.x * n + e,
			y: t.y * n + e,
			width: t.width * n,
			height: t.height * n
		};
		case "rrect": return {
			...t,
			x: t.x * n + e,
			y: t.y * n + e,
			width: t.width * n,
			height: t.height * n,
			r: t.r * n
		};
		case "polygon": return {
			kind: "polygon",
			points: t.points.map((t) => ({
				x: t.x * n + e,
				y: t.y * n + e
			}))
		};
	}
}
function zm(t, n) {
	if (1 !== t.edges.length) return null;
	const e = n[t.edges[0]].primitive;
	return void 0 === e ? null : function(t) {
		switch (t.kind) {
			case "circle": return {
				kind: "circle",
				cx: t.cx,
				cy: t.cy,
				r: t.r
			};
			case "ellipse": {
				const n = 180 * t.rotation / Math.PI;
				return {
					kind: "ellipse",
					cx: t.cx,
					cy: t.cy,
					rx: t.rx,
					ry: t.ry,
					...0 !== n ? { angle: n } : {}
				};
			}
			case "rect": {
				const n = t.rotation / (Math.PI / 2), e = Math.round(n);
				if (Math.abs(n - e) > 1e-9) return null;
				const [r, o] = e % 2 == 0 ? [t.w, t.h] : [t.h, t.w], s = {
					x: t.cx - r / 2,
					y: t.cy - o / 2,
					width: r,
					height: o
				};
				return t.r > 0 ? {
					kind: "rrect",
					...s,
					r: t.r
				} : {
					kind: "rect",
					...s
				};
			}
		}
	}(e);
}
function Tm(t, n, e) {
	const r = zm(t, e), o = null === r ? null : zm(n, e);
	return null === r || null === o ? null : um(r, o);
}
function Em(t, n, e) {
	const r = Om(t, n, e), o = .25 * e, s = /* @__PURE__ */ new Map(), i = (t) => {
		const n = t.length >> 1;
		if (n <= 3) {
			const e = [];
			for (let r = 1; r < n; r++) e.push({
				type: "L",
				x: t[2 * r],
				y: t[2 * r + 1]
			});
			return e;
		}
		const a = function(t) {
			const n = new Uint16Array(t.buffer, t.byteOffset, 4 * t.length);
			let e = "";
			for (let r = 0; r < n.length; r += 4096) e += String.fromCharCode(...n.subarray(r, r + 4096));
			return e;
		}(t), l = s.get(a);
		if (void 0 !== l) return l.slice();
		const c = function(t, n, e) {
			return _d(t, n, !1, e, { postFit: pg });
		}(t, new Float64Array(n).fill(o), r).segments, h = n >> 1, f = function(t, n, e) {
			const r = t.length >> 1, o = _m({
				x0: t[0],
				y0: t[1],
				segments: [...n],
				closed: !1,
				params: 0,
				chi2: 0
			}, e / 2).points, s = o.length >> 1;
			if (s < 2) return r < 2;
			const i = Math.max(8, Math.ceil(.15 * s)), a = (n, r, i) => {
				const a = t[2 * n], l = t[2 * n + 1];
				for (let t = Math.max(0, r); t < Math.min(s - 1, i); t++) {
					const n = o[2 * t], r = o[2 * t + 1], s = o[2 * t + 2] - n, i = o[2 * t + 3] - r, c = s * s + i * i, h = c > 0 ? Math.max(0, Math.min(1, ((a - n) * s + (l - r) * i) / c)) : 0;
					if (Math.hypot(a - n - h * s, l - r - h * i) <= e) return !0;
				}
				return !1;
			};
			for (let l = 0; l < r; l++) {
				const t = Math.round(l / Math.max(1, r - 1) * (s - 1));
				if (!a(l, t - i, t + i) && !a(l, 0, s - 1)) return !1;
			}
			return !0;
		}(t, c, e) ? c : [...i(t.subarray(0, 2 * (h + 1))), ...i(t.subarray(2 * h))];
		return s.set(a, f.slice()), f;
	};
	return i;
}
function jm(t) {
	const n = function(t) {
		const { width: n, height: e, ids: r } = t, o = (n + 1) * (e + 1), { segs: s, count: i } = function(t, n, e) {
			const r = new zf(4 * (2 * t.face.length + 2 * n + 2 * e)), { x0: o, x1: s, face: i, start: a, sameAsAbove: l } = t;
			if (n > 0 && e > 0) {
				for (let t = 0; t < e; t++) {
					const e = a[t], s = a[t + 1];
					r.pushSegment(Tf(0, t, n), Tf(0, t + 1, n), i[e], -1);
					for (let a = e + 1; a < s; a++) r.pushSegment(Tf(o[a], t, n), Tf(o[a], t + 1, n), i[a], i[a - 1]);
					r.pushSegment(Tf(n, t, n), Tf(n, t + 1, n), -1, i[s - 1]);
				}
				for (let t = a[0]; t < a[1]; t++) for (let e = o[t]; e < s[t]; e++) r.pushSegment(Tf(e, 0, n), Tf(e + 1, 0, n), -1, i[t]);
				for (let t = 1; t < e; t++) {
					if (l[t]) continue;
					let e = a[t - 1], c = a[t];
					const h = a[t], f = a[t + 1];
					for (; e < h && c < f;) {
						const a = Math.max(o[e], o[c]), l = Math.min(s[e], s[c]);
						if (l > a && i[e] !== i[c]) for (let o = a; o < l; o++) r.pushSegment(Tf(o, t, n), Tf(o + 1, t, n), i[e], i[c]);
						s[e] <= s[c] ? e++ : c++;
					}
				}
				for (let t = a[e - 1]; t < a[e]; t++) for (let a = o[t]; a < s[t]; a++) r.pushSegment(Tf(a, e, n), Tf(a + 1, e, n), i[t], -1);
			}
			return {
				segs: r.data,
				count: r.length >> 2
			};
		}(function(t, n, e) {
			let r = 0;
			if (n > 0) for (let h = 0; h < e; h++) {
				const e = h * n;
				r++;
				for (let o = 1; o < n; o++) t[e + o] !== t[e + o - 1] && r++;
			}
			const o = new Int32Array(r), s = new Int32Array(r), i = new Int32Array(r), a = new Int32Array(e + 1), l = new Uint8Array(e);
			let c = 0;
			for (let h = 0; h < e; h++) {
				const e = h * n;
				a[h] = c;
				let r = 0;
				for (; r < n;) {
					const a = t[e + r], l = r;
					for (r++; r < n && t[e + r] === a;) r++;
					o[c] = l, s[c] = r, i[c] = a, c++;
				}
				if (h > 0) {
					const t = a[h - 1], n = c - a[h];
					let e = n === a[h] - t;
					for (let r = 0; e && r < n; r++) e = s[t + r] === s[a[h] + r] && i[t + r] === i[a[h] + r];
					l[h] = e ? 1 : 0;
				}
			}
			return a[e] = c, {
				x0: o,
				x1: s,
				face: i,
				start: a,
				sameAsAbove: l
			};
		}(r, n, e), n, e);
		(function(t, n, e, r, o) {
			const s = (r + 1) * (o + 1), i = jf(t, n);
			for (let a = 0; a < i.count; a++) {
				const n = i.start[a];
				if (i.start[a + 1] - n !== 4) continue;
				const l = i.nodes[a], c = l % (r + 1), h = (l - c) / (r + 1), f = Ef(e, r, o, c - 1, h - 1), u = Ef(e, r, o, c, h - 1), y = Ef(e, r, o, c - 1, h);
				if (f === Ef(e, r, o, c, h) == (u === y)) continue;
				let d = -1, p = -1, g = -1;
				for (let e = n; e < n + 4; e++) {
					const n = i.list[e], o = t[4 * n], a = (o === l ? t[4 * n + 1] : o) % s, f = a % (r + 1), u = (a - f) / (r + 1);
					u === h && f > c ? p = n : u === h && f < c ? d = n : f === c && u > h && (g = n);
				}
				const m = u === y ? p : d;
				if (!(m < 0 || g < 0)) for (const e of [m, g]) t[4 * e] === l ? t[4 * e] += s : t[4 * e + 1] += s;
			}
		})(s, i, r, n, e);
		const a = jf(s, i), l = new Uint8Array(i), c = new Of();
		(function(t, n, e, r) {
			for (let o = 0; o < n.count; o++) {
				if (!Bf(n, o)) continue;
				const s = n.nodes[o];
				for (let i = n.start[o]; i < n.start[o + 1]; i++) {
					const a = n.list[i];
					if (e[a]) continue;
					r.ids.push(s);
					const l = t[4 * a] === s, c = l ? t[4 * a + 2] : t[4 * a + 3], h = l ? t[4 * a + 3] : t[4 * a + 2];
					let f = a, u = s, y = o;
					for (;;) {
						e[f] = 1;
						const o = t[4 * f] === u, s = o ? t[4 * f + 1] : t[4 * f];
						if (r.ids.push(s), u = s, y = n.nodeOf[2 * f + (o ? 1 : 0)], Bf(n, y)) break;
						let i = -1;
						for (let t = n.start[y]; t < n.start[y + 1]; t++) {
							const r = n.list[t];
							if (r !== f && !e[r]) {
								i = r;
								break;
							}
						}
						if (i < 0) break;
						f = i;
					}
					r.finish(c, h, o, y);
				}
			}
		})(s, a, l, c), function(t, n, e, r, o) {
			for (let s = 0; s < n; s++) {
				if (r[s]) continue;
				const n = t[4 * s], i = o.ids.length;
				o.ids.push(n);
				let a = s, l = n;
				for (;;) {
					r[a] = 1;
					const s = t[4 * a] === l, i = s ? t[4 * a + 1] : t[4 * a];
					if (i === n) break;
					o.ids.push(i);
					const c = e.nodeOf[2 * a + (s ? 1 : 0)];
					let h = -1;
					for (let t = e.start[c]; t < e.start[c + 1]; t++) {
						const n = e.list[t];
						if (n !== a && !r[n]) {
							h = n;
							break;
						}
					}
					if (h < 0) break;
					a = h, l = i;
				}
				o.ids.length - i >= 3 ? o.finish(t[4 * s + 2], t[4 * s + 3], -1, -1) : o.discard();
			}
		}(s, i, a, l, c);
		const { ids: h, offset: f, left: u, right: y, from: d, to: p } = c, g = h.data, m = c.count, x = new Int32Array(a.count).fill(-1);
		for (let A = 0; A < m; A++) d.data[A] < 0 || (x[d.data[A]] = 0, x[p.data[A]] = 0);
		const M = [];
		for (let A = 0; A < a.count; A++) {
			if (x[A] < 0) continue;
			x[A] = M.length;
			const t = a.nodes[A] % o, e = t % (n + 1);
			M.push({
				x: e,
				y: (t - e) / (n + 1),
				ends: []
			});
		}
		const w = [], b = new Int32Array(4 * M.length).fill(-1);
		for (let A = 0; A < m; A++) {
			const t = f.data[A], r = f.data[A + 1] - t, s = new Float64Array(2 * r), i = new Uint8Array(r);
			for (let h = 0; h < r; h++) {
				const r = g[t + h] % o, a = r % (n + 1), l = (r - a) / (n + 1);
				s[2 * h] = a, s[2 * h + 1] = l, 0 !== a && a !== n && 0 !== l && l !== e || (i[h] = 1);
			}
			const a = d.data[A] < 0;
			let l = -1, c = -1;
			if (!a) {
				l = x[d.data[A]], c = x[p.data[A]], i[0] = 1, i[r - 1] = 1;
				const t = 2 * r;
				b[4 * l + Kf(s[2] - s[0], s[3] - s[1])] = 2 * A, b[4 * c + Kf(s[t - 4] - s[t - 2], s[t - 3] - s[t - 1])] = 2 * A + 1;
			}
			w.push({
				points: s,
				sigma: new Float64Array(r).fill(.5),
				fixed: i,
				left: u.data[A],
				right: y.data[A],
				start: l,
				end: c,
				closed: a
			});
		}
		for (let A = 0; A < M.length; A++) for (let t = 0; t < 4; t++) b[4 * A + t] >= 0 && M[A].ends.push(b[4 * A + t]);
		return {
			width: n,
			height: e,
			faces: t,
			edges: w,
			nodes: M
		};
	}(function(t) {
		const { width: n, height: e, data: r } = t, o = n * e;
		let s = 0;
		if (n > 0) for (let p = 0; p < e; p++) {
			const t = p * n;
			s++;
			for (let e = 1; e < n; e++) r[t + e] !== r[t + e - 1] && s++;
		}
		const i = new Int32Array(s), a = new Int32Array(s);
		let l = 0, c = 0, h = 0;
		for (let p = 0; p < e; p++) {
			const t = p * n, e = t - n, o = l;
			let s = c, f = 0;
			for (; f < n;) {
				const o = r[t + f], c = f;
				for (f++; f < n && r[t + f] === o;) f++;
				for (i[l] = t + c, a[l] = l; s < h && i[s + 1] - e <= c;) s++;
				for (let t = s; t < h && i[t] - e < f; t++) {
					if (r[i[t]] !== o) continue;
					const n = Rf(a, l), e = Rf(a, t);
					n < e ? a[e] = n : e < n && (a[n] = e);
				}
				l++;
			}
			c = o, h = l;
		}
		let f = 0;
		for (let p = 0; p < s; p++) a[p] = a[p] === p ? f++ : a[a[p]];
		const u = new Int32Array(o), y = new Int32Array(f), d = new Uint32Array(f);
		for (let p = 0; p < s; p++) {
			const t = a[p], n = i[p], e = p + 1 < s ? i[p + 1] : o;
			u.fill(t, n, e), d[t] += e - n, y[t] = r[n];
		}
		return {
			width: n,
			height: e,
			ids: u,
			count: f,
			label: y,
			area: d
		};
	}(t)), e = Wf(n);
	return {
		map: n,
		rings: e,
		nesting: Gf(n, e)
	};
}
const Bm = .1;
function Om(t, n, e) {
	const r = function(t, n = .1, e = 2) {
		return {
			tau: e,
			lambda: Math.log(Math.max(Math.E, t / Math.max(n, 1e-300)))
		};
	}(Math.max(t, n), Bm * e);
	return {
		tau: r.tau,
		lambda: r.lambda * e
	};
}
async function Km(t) {
	const n = jm(t.labels), { map: e } = n;
	t.onStage?.("lattice", e);
	const r = Um(t.image, t.alpha), o = function(t, n) {
		const e = n.map((t) => {
			if (t.gradient) {
				const n = t.gradient, e = void 0 !== t.under ? Lm(t.under) : null, r = (t, r, o) => {
					if (function(t, n, e, r) {
						let o;
						if ("linear" === t.kind) {
							const r = t.x2 - t.x1, s = t.y2 - t.y1, i = r * r + s * s;
							o = i > 0 ? ((n - t.x1) * r + (e - t.y1) * s) / i : 0;
						} else if (t.r <= 0) o = 0;
						else if (void 0 === t.aspect || 1 === t.aspect) o = Math.hypot(n - t.cx, e - t.cy) / t.r;
						else {
							const r = Math.cos(t.angle ?? 0), s = Math.sin(t.angle ?? 0), i = n - t.cx, a = e - t.cy;
							o = Math.hypot(i * r + a * s, (a * r - i * s) * t.aspect) / t.r;
						}
						const s = t.stops;
						let i = s[0], a = s[s.length - 1], l = 0;
						if (o <= i.offset) a = i;
						else if (o >= a.offset) i = a;
						else for (let y = 1; y < s.length; y++) if (o <= s[y].offset) {
							i = s[y - 1], a = s[y];
							const t = a.offset - i.offset;
							l = t > 0 ? (o - i.offset) / t : 0;
							break;
						}
						const c = Lm(i.color), h = Lm(a.color), f = i.opacity ?? 1, u = f + ((a.opacity ?? 1) - f) * l;
						r[0] = (c[0] + (h[0] - c[0]) * l) * u, r[1] = (c[1] + (h[1] - c[1]) * l) * u, r[2] = (c[2] + (h[2] - c[2]) * l) * u, r[3] = u;
					}(n, t, r, o), null !== e) {
						const t = 1 - o[3];
						o[0] += e[0] * t, o[1] += e[1] * t, o[2] += e[2] * t, o[3] = 1;
					}
				}, [o, s, i] = Lm(t.hex);
				return {
					r: o,
					g: s,
					b: i,
					a: 1,
					at: r
				};
			}
			if (void 0 !== t.opacity && void 0 !== t.ink) {
				const [n, e, r] = Lm(t.ink);
				return {
					r: n * t.opacity,
					g: e * t.opacity,
					b: r * t.opacity,
					a: t.opacity
				};
			}
			const [n, e, r] = Lm(t.hex);
			return {
				r: n,
				g: e,
				b: r,
				a: 1
			};
		}), r = {
			r: 0,
			g: 0,
			b: 0,
			a: 0
		}, o = new Array(t.length);
		for (let s = 0; s < t.length; s++) {
			const n = t[s];
			o[s] = n >= 0 && n < e.length ? e[n] : r;
		}
		return o;
	}(e.faces.label, t.paints), s = t.scale ?? 1, i = s > 1 && void 0 !== t.source ? {
		image: Um(t.source.image, t.source.alpha),
		scale: s
	} : void 0;
	if (fa(e, r, o, void 0 !== t.sigmaNoise ? { sigmaNoise: t.sigmaNoise } : {}), t.onStage?.("subpixel", e), function(t) {
		const { edges: n, nodes: e } = t, r = e.map(() => []);
		for (let o = 0; o < n.length; o++) {
			const t = n[o];
			t.closed || t.points.length < 4 || (r[t.start].push(2 * o), r[t.end].push(2 * o + 1));
		}
		for (let o = 0; o < e.length; o++) {
			const s = r[o];
			if (s.length < 2) continue;
			const i = e[o], a = i.x, l = i.y, c = [];
			for (const t of s) {
				const e = eu(n[t >> 1], !(1 & t), a, l);
				null !== e && c.push(e);
			}
			const h = ou(c, a, l), f = null === h ? null : uu(t, a, l, h);
			let u = null;
			if (null === f) {
				const n = cu(t, s, a, l);
				u = null === n ? null : uu(t, a, l, n);
			}
			const y = u ?? f ?? {
				x: a,
				y: l,
				sigma: .5
			};
			null !== u && fu(t, s, a, l, y.x, y.y);
			for (const t of s) {
				const e = n[t >> 1], r = 1 & t ? (e.points.length >> 1) - 1 : 0;
				e.points[2 * r] = y.x, e.points[2 * r + 1] = y.y, e.sigma[r] = y.sigma;
			}
			i.x = y.x, i.y = y.y;
		}
		na(t);
	}(e), t.onStage?.("junctions", e), function(t, n, e, r = {}) {
		const o = r.source;
		if (void 0 === o || 1 === o.scale) return Ly(t, n, e, r, 1);
		const s = o.scale;
		if (!(Number.isInteger(s) && s > 1) || o.image.width * s !== t.width || o.image.height * s !== t.height) throw new Error("solveBoundaries: the source is not the map divided by its scale");
		const i = function(t, n) {
			return {
				width: t.width * n,
				height: t.height * n,
				faces: t.faces,
				edges: t.edges.map((t) => ({
					...t,
					points: t.points.map((t) => t * n)
				})),
				nodes: t.nodes.map((t) => ({
					x: t.x * n,
					y: t.y * n,
					ends: t.ends
				}))
			};
		}(t, 1 / s), a = e.map((t) => {
			const n = t.at;
			return void 0 === n ? t : {
				r: t.r,
				g: t.g,
				b: t.b,
				a: t.a,
				at: (t, e, r) => n(t * s, e * s, r)
			};
		}), l = Ly(i, o.image, a, r, s);
		if ("solved" !== l.outcome) return l;
		for (let c = 0; c < t.edges.length; c++) {
			const n = i.edges[c].points, e = t.edges[c].points;
			for (let t = 0; t < e.length; t++) e[t] = n[t] * s;
		}
		for (let c = 0; c < t.nodes.length; c++) t.nodes[c].x = i.nodes[c].x * s, t.nodes[c].y = i.nodes[c].y * s;
		na(t);
	}(e, r, o, {
		...void 0 !== i ? { source: i } : {},
		...void 0 !== t.solveKernel ? { kernel: t.solveKernel } : {}
	}), t.onStage?.("solve", e), 1 !== s) for (const h of e.edges) h.sigma = h.sigma.map((t) => t * s);
	const a = Om(e.width, e.height, s), l = t.fitEdges ? await t.fitEdges(e, a) : function(t, n, e = {}) {
		const r = e.lambdaScales;
		return t.edges.map((e, o) => function(t, n, e, r = {}) {
			return xg(mg(t, n), t, e, r);
		}(t, o, n, { lambdaScale: r ? r[o] : 1 }));
	}(e, a);
	t.onStage?.("fit", e, l);
	const { fits: c } = function(t, n, e, r) {
		if (e.length !== t.edges.length) throw new Error("one fit per edge of the map");
		const o = n.flat(), s = e.length, i = e.slice(), a = e.slice(), l = i.map(fy), c = l.slice(), h = new Array(s), f = Int32Array.from(t.edges, (t) => Math.max(t.points.length >> 1, 2)), u = Array.from({ length: s }, () => []), y = new Int32Array(s), d = /* @__PURE__ */ new Map(), p = /* @__PURE__ */ new Map(), g = (n) => {
			let e = h[n];
			if (!e) {
				const r = t.edges[n];
				e = $d(r.closed ? r.points : gg(t, r), r.sigma, r.closed), h[n] = e;
			}
			return e;
		}, m = {
			refits: 0,
			pinned: 0,
			halved: 0,
			rounds: 0,
			edges: [],
			crossing: 0
		};
		let x;
		for (let I = 0; I < 10; I++) {
			const t = Iy(o, l, {
				changed: x,
				limit: 32
			}), n = /* @__PURE__ */ new Map();
			for (const r of t) {
				if (f[r.edge] <= 1) continue;
				const t = n.get(r.edge);
				t ? t[t.length - 1].segment !== r.segment && t.push(r) : n.set(r.edge, [r]);
			}
			if (0 === n.size) break;
			const e = [...n.keys()].toSorted((t, n) => t - n);
			m.rounds++;
			const s = /* @__PURE__ */ new Map();
			for (const r of e) {
				if (y[r] >= 4) continue;
				const t = u[r].slice();
				wg(i[r], g(r), n.get(r) ?? [], t) > 0 && (d.set(r, t), s.set(r, t));
			}
			for (const o of e) {
				const t = g(o), n = bg(t, r, Math.max(f[o] >> 1, 1), u[o]), e = s.get(o), a = e ? bg(t, r, f[o], e) : null;
				let c;
				!e || !a || n.cost < a.cost ? (c = n, f[o] = Math.max(f[o] >> 1, 1), m.halved++) : (c = a, u[o] = e, y[o]++, m.pinned++), i[o] = Vd(t, c), l[o] = fy(i[o]), p.set(o, c.vertices), m.refits++;
			}
			x = new Set(e);
		}
		if (0 === p.size) return {
			fits: i,
			report: m
		};
		const M = /* @__PURE__ */ new Map();
		for (const I of p.keys()) M.set(I, []);
		o.forEach((t, n) => {
			for (const e of new Set(t.edges)) M.get(e)?.push(n);
		});
		const w = [...p.keys()].toSorted((t, n) => t - n), b = /* @__PURE__ */ new Set();
		let A = 0;
		const k = w.toSorted((t, n) => i[t].segments.length - i[n].segments.length || t - n);
		for (const I of k) {
			const t = i[I].segments.length;
			t <= 96 && A + t <= 384 && (A += t, b.add(I));
		}
		const v = (t) => (M.get(t) ?? []).every((n) => 0 === Fy(o[n], l, {
			touching: t,
			limit: 1
		}).length);
		for (const I of w) {
			const t = i[I], n = l[I], e = t.segments.length;
			if (e > 32 && e > 4 * Math.max(a[I].segments.length, 1)) {
				i[I] = a[I], l[I] = c[I], m.edges.push({
					edge: I,
					kept: "exploded",
					pinned: y[I],
					cap: f[I],
					pins: []
				});
				continue;
			}
			const o = g(I), s = p.get(I) ?? [], h = d.get(I) ?? u[I], x = h.length > 0 && f[I] < Math.max(qd(o), 2), M = [
				["full", () => a[I]],
				["pins", () => x ? Vd(o, bg(o, r, 1 / 0, h)) : null],
				["smoothed", () => {
					if (!b.has(I)) return null;
					const n = pg({
						x0: (e = t).x0,
						y0: e.y0,
						segments: e.segments.slice(),
						closed: e.closed
					}, o, s, r, null);
					var e;
					return Ag(n, t) ? null : Vd(o, {
						path: n,
						vertices: s
					});
				}]
			];
			let w = "refit";
			for (const [r, a] of M) {
				const e = a();
				if (e) {
					if (i[I] = e, l[I] = "full" === r ? c[I] : fy(e), v(I)) {
						w = r;
						break;
					}
					i[I] = t, l[I] = n;
				}
			}
			const A = "pins" === w ? h : "refit" === w ? u[I] : [];
			m.edges.push({
				edge: I,
				kept: w,
				pinned: y[I],
				cap: f[I],
				pins: A
			});
		}
		const F = /* @__PURE__ */ new Set();
		for (const I of w) for (const t of M.get(I) ?? []) F.add(t);
		for (const I of F) Fy(o[I], l, { limit: 1 }).length > 0 && m.crossing++;
		return {
			fits: i,
			report: m
		};
	}(e, n.rings, l, a);
	return t.onStage?.("repair", e, c), {
		geo: n,
		fits: c
	};
}
function Dm(t) {
	let n = 0;
	for (let e = 0, r = t.length - 2; e < t.length; r = e, e += 2) n += t[r] * t[e + 1] - t[e] * t[r + 1];
	return n;
}
function Hm(t, n, e) {
	const { edges: r, faces: o } = t.map;
	for (let s = 0; s < n.edges.length; s++) {
		const t = r[n.edges[s]], i = n.reversed[s] ? t.left : t.right;
		if (i < 0) continue;
		const a = o.label[i];
		if (a < 0 || void 0 !== e && e(a)) return !0;
	}
	return !1;
}
function Xm(t, n, e) {
	let r = !1;
	for (let o = 0, s = e.length - 2; o < e.length; s = o, o += 2) {
		const i = e[o + 1], a = e[s + 1];
		i > n != a > n && t < (e[s] - e[o]) * (n - i) / (a - i) + e[o] && (r = !r);
	}
	return r;
}
function Wm(t) {
	return Math.abs(function(t) {
		let n = 0, e = 0, r = 0, o = 0, s = 0;
		for (const i of t) switch (i.type) {
			case "M":
				e = o = i.x, r = s = i.y;
				break;
			case "Z":
				n += e * s - o * r, e = o, r = s;
				break;
			case "L":
				n += e * i.y - i.x * r, e = i.x, r = i.y;
				break;
			case "Q":
			case "C": {
				const t = "Q" === i.type ? [
					e,
					i.x1,
					i.x
				] : [
					e,
					i.x1,
					i.x2,
					i.x
				], o = "Q" === i.type ? [
					r,
					i.y1,
					i.y
				] : [
					r,
					i.y1,
					i.y2,
					i.y
				], s = t.length - 1;
				for (let e = 0; e < 3; e++) {
					const r = Gm[e];
					let i = t.slice(), a = o.slice(), l = 0, c = 0;
					for (let t = s; t > 0; t--) {
						1 === t && (l = s * (i[1] - i[0]), c = s * (a[1] - a[0]));
						for (let n = 0; n < t; n++) i[n] += (i[n + 1] - i[n]) * r, a[n] += (a[n + 1] - a[n]) * r;
						i = i.slice(0, t), a = a.slice(0, t);
					}
					n += Zm[e] * (i[0] * c - a[0] * l);
				}
				e = i.x, r = i.y;
				break;
			}
			case "A": {
				const t = k(e, r, i);
				if (null === t) n += e * i.y - i.x * r;
				else {
					const e = Math.cos(t.phi), r = Math.sin(t.phi), o = 32, s = t.dTheta / o;
					for (let i = 0; i <= o; i++) {
						const a = t.theta1 + i * s, l = t.rx * Math.cos(a), c = t.ry * Math.sin(a), h = t.cx + e * l - r * c, f = t.cy + r * l + e * c, u = -e * t.rx * Math.sin(a) - r * t.ry * Math.cos(a);
						n += (0 === i || i === o ? 1 : i % 2 == 1 ? 4 : 2) * s / 3 * (h * (-r * t.rx * Math.sin(a) + e * t.ry * Math.cos(a)) - f * u);
					}
				}
				e = i.x, r = i.y;
				break;
			}
		}
		return n / 2;
	}(t)) >= 1e-6;
}
const Gm = [
	.5 - Math.sqrt(15) / 10,
	.5,
	.5 + Math.sqrt(15) / 10
], Zm = [
	5 / 18,
	8 / 18,
	5 / 18
];
function Qm(t) {
	const n = t.filter((t) => Wm(t.commands)), e = n.map((t) => Dm(t.poly)), r = [];
	for (let i = 0; i < n.length; i++) e[i] < 0 && r.push(i);
	const o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
	for (const i of r) o.set(i, [...n[i].commands]), s.set(i, []);
	for (let i = 0; i < n.length; i++) {
		if (e[i] < 0) continue;
		const t = n[i].poly[0], a = n[i].poly[1];
		let l = -1;
		for (const o of r) Xm(t, a, n[o].poly) && (l < 0 || -e[o] < -e[l]) && (l = o);
		if (!(l < 0)) {
			for (const t of n[i].commands) o.get(l)?.push(t);
			s.get(l)?.push(i);
		}
	}
	return r.map((t) => {
		const e = s.get(t), r = n[t].primitive, i = 1 === e.length ? n[e[0]].primitive : null;
		return {
			commands: o.get(t),
			primitive: 0 === e.length ? r : null,
			stroked: null !== r && null !== i ? um(r, i) : null
		};
	});
}
function Ym(t, n, e) {
	const r = Math.floor(n), o = Math.floor(e);
	return r < 0 || o < 0 || r >= t.width || o >= t.height ? -1 : t.faceIds[o * t.width + r];
}
function _m(t, n) {
	const e = [t.x0, t.y0], r = new Int32Array(t.segments.length);
	let o = t.x0, s = t.y0;
	for (let i = 0; i < t.segments.length; i++) {
		const a = t.segments[i];
		if ("M" !== a.type && "Z" !== a.type) {
			if ("C" === a.type || "Q" === a.type) {
				const t = "C" === a.type ? a.x1 : o + 2 / 3 * (a.x1 - o), r = "C" === a.type ? a.y1 : s + 2 / 3 * (a.y1 - s), i = "C" === a.type ? a.x2 : a.x + 2 / 3 * (a.x1 - a.x), l = "C" === a.type ? a.y2 : a.y + 2 / 3 * (a.y1 - a.y), c = Math.hypot(t - o, r - s) + Math.hypot(i - t, l - r) + Math.hypot(a.x - i, a.y - l), h = Math.max(1, Math.ceil(c / n));
				for (let n = 1; n < h; n++) {
					const c = n / h, f = 1 - c;
					e.push(f * f * f * o + 3 * f * f * c * t + 3 * f * c * c * i + c * c * c * a.x, f * f * f * s + 3 * f * f * c * r + 3 * f * c * c * l + c * c * c * a.y);
				}
			} else if ("A" === a.type) {
				const t = k(o, s, a);
				if (null !== t) {
					const r = Math.max(1, Math.ceil(Math.abs(t.dTheta) * Math.max(t.rx, t.ry) / n)), o = Math.cos(t.phi), s = Math.sin(t.phi);
					for (let n = 1; n < r; n++) {
						const i = t.theta1 + t.dTheta * n / r, a = t.rx * Math.cos(i), l = t.ry * Math.sin(i);
						e.push(t.cx + o * a - s * l, t.cy + s * a + o * l);
					}
				}
			} else {
				const t = Math.max(1, Math.ceil(Math.hypot(a.x - o, a.y - s) / n));
				for (let n = 1; n < t; n++) e.push(o + (a.x - o) * n / t, s + (a.y - s) * n / t);
			}
			e.push(a.x, a.y), r[i] = e.length / 2 - 1, o = a.x, s = a.y;
		} else r[i] = e.length / 2 - 1;
	}
	return t.closed && e.length > 2 && (e.length -= 2), {
		points: Float64Array.from(e),
		ends: r
	};
}
function Vm(t, n, e, r, o) {
	const s = t.points.length >> 1, i = Float64Array.from(t.points), a = new Float64Array(s);
	for (let b = 1; b < s; b++) a[b] = a[b - 1] + Math.hypot(i[2 * b] - i[2 * b - 2], i[2 * b + 1] - i[2 * b - 1]);
	const l = t.closed ? a[s - 1] + Math.hypot(i[0] - i[2 * s - 2], i[1] - i[2 * s - 1]) : 0, c = new Float64Array(2 * s), h = new Uint8Array(s), f = 2 * o.distance, u = t.closed ? s - 1 >> 1 : s, y = (t) => {
		const n = t + 1 < s ? t + 1 : 0;
		return Math.hypot(i[2 * n] - i[2 * t], i[2 * n + 1] - i[2 * t + 1]);
	}, d = o.distance + .5;
	for (let b = 0; b < s; b++) {
		let e = b, r = 0;
		for (let n = 0; n < u && r < f && (t.closed || 0 !== e); n++) {
			const t = 0 === e ? s - 1 : e - 1;
			r += y(t), e = t;
		}
		let a = b, l = 0;
		for (let n = 0; n < u && l < f && (t.closed || a !== s - 1); n++) l += y(a), a = a + 1 < s ? a + 1 : 0;
		const p = i[2 * a] - i[2 * e], g = i[2 * a + 1] - i[2 * e + 1], m = Math.hypot(p, g);
		if (0 === m) {
			h[b] = 1;
			continue;
		}
		const x = g / m, M = -p / m;
		c[2 * b] = x, c[2 * b + 1] = M;
		const w = i[2 * b], A = i[2 * b + 1];
		Ym(o, w + o.distance * x, A + o.distance * M) === n && Ym(o, w + d * x, A + d * M) === n || (h[b] = 1);
	}
	const p = new Float64Array(s).fill(1 / 0), g = t.closed ? 2 : 1;
	let m = -1 / 0;
	for (let b = 0; b < g * s; b++) {
		const t = b % s, n = a[t] + Math.floor(b / s) * l;
		h[t] && (m = n), p[t] = Math.min(p[t], n - m);
	}
	let x = 1 / 0;
	for (let b = g * s - 1; b >= 0; b--) {
		const t = b % s, n = a[t] + Math.floor(b / s) * l;
		h[t] && (x = n), p[t] = Math.min(p[t], x - n);
	}
	const M = a[s - 1], w = new Float64Array(2 * s);
	for (let b = 0; b < s; b++) {
		let n = 1 / 0;
		!t.closed && e && (n = a[b]), !t.closed && r && (n = Math.min(n, M - a[b]));
		const s = o.distance * Math.min(1, p[b] / Math.max(o.distance, 1e-9), n / o.ramp);
		w[2 * b] = i[2 * b] + s * c[2 * b], w[2 * b + 1] = i[2 * b + 1] + s * c[2 * b + 1];
	}
	return w;
}
const Jm = 10 * Math.PI / 180;
function tx(t, n, e) {
	switch (e.type) {
		case "C": {
			const [r, o] = e.x1 !== t || e.y1 !== n ? [e.x1, e.y1] : [e.x2, e.y2], [s, i] = e.x2 !== e.x || e.y2 !== e.y ? [e.x2, e.y2] : [e.x1, e.y1];
			return [
				r - t,
				o - n,
				e.x - s,
				e.y - i
			];
		}
		case "Q": return [
			e.x1 - t,
			e.y1 - n,
			e.x - e.x1,
			e.y - e.y1
		];
		case "A": {
			const r = k(t, n, e);
			if (null !== r && 0 !== r.dTheta) {
				const t = (t) => {
					const n = -r.rx * Math.sin(t) * Math.sign(r.dTheta), e = r.ry * Math.cos(t) * Math.sign(r.dTheta);
					return [Math.cos(r.phi) * n - Math.sin(r.phi) * e, Math.sin(r.phi) * n + Math.cos(r.phi) * e];
				};
				return [...t(r.theta1), ...t(r.theta1 + r.dTheta)];
			}
			return [
				e.x - t,
				e.y - n,
				e.x - t,
				e.y - n
			];
		}
		case "L": return [
			e.x - t,
			e.y - n,
			e.x - t,
			e.y - n
		];
		default: return [
			0,
			0,
			0,
			0
		];
	}
}
function nx(t) {
	const n = t.segments, e = new Float64Array(4 * n.length);
	let r = t.x0, o = t.y0;
	for (let i = 0; i < n.length; i++) {
		const t = n[i];
		e.set(tx(r, o, t), 4 * i), "Z" !== t.type && (r = t.x, o = t.y);
	}
	const s = new Float64Array(n.length);
	for (let i = 0; i + 1 < n.length; i++) {
		const t = e[4 * i + 2], n = e[4 * i + 3], r = e[4 * i + 4], o = e[4 * i + 5];
		s[i] = Math.abs(Math.atan2(t * o - n * r, t * r + n * o));
	}
	return s;
}
function ex(t, n, e, r, o) {
	const s = n.edges.length, i = n.edges.map((e, r) => n.reversed[r] ? t.edges[e].right : t.edges[e].left), a = i.map((e, o) => {
		const s = t.edges[n.edges[o]], i = n.reversed[o] ? s.left : s.right;
		return e >= 0 && -1 !== i && r(e);
	}), l = [];
	let c = NaN, h = NaN;
	const f = (t, n) => {
		0 === l.length ? l.push({
			type: "M",
			x: t,
			y: n
		}) : t === c && n === h || l.push({
			type: "L",
			x: t,
			y: n
		}), c = t, h = n;
	}, u = (t) => {
		for (const n of t) l.push(n), "Z" !== n.type && "M" !== n.type && (c = n.x, h = n.y);
	}, y = n.edges.map((r, l) => {
		const c = e[r], h = c.segments[c.segments.length - 1], f = n.reversed[l] ? {
			...c,
			x0: h?.x ?? c.x0,
			y0: h?.y ?? c.y0,
			segments: $m(c)
		} : c;
		if (!a[l]) return {
			walk: f,
			points: null,
			ends: null,
			back: null
		};
		const { points: u, ends: y } = _m(f, 1);
		return {
			walk: f,
			points: u,
			ends: y,
			back: Vm({
				points: u,
				closed: t.edges[r].closed
			}, i[l], !a[(l + s - 1) % s], !a[(l + 1) % s], o)
		};
	});
	for (let d = 0; d < s; d++) {
		const t = y[d].back, n = y[(d + 1) % s].back;
		if (1 === s || null === t || null === n) continue;
		const e = t.length - 2, r = (t[e] + n[0]) / 2, o = (t[e + 1] + n[1]) / 2;
		t[e] = n[0] = r, t[e + 1] = n[1] = o;
	}
	for (let d = 0; d < s; d++) {
		const { walk: t, points: n, ends: e, back: r } = y[d];
		if (null === n || null === e || null === r) {
			f(t.x0, t.y0), u(t.segments);
			continue;
		}
		const s = n.length >> 1, i = (t, e) => {
			for (let o = t; o <= e; o++) {
				const t = o % s * 2;
				if (r[t] !== n[t] || r[t + 1] !== n[t + 1]) return !0;
			}
			return !1;
		}, a = t.segments, l = nx(t);
		f(r[0], r[1]);
		for (let c = 0; c < a.length;) {
			const t = 0 === c ? 0 : e[c - 1];
			if (!i(t, e[c])) {
				u([a[c]]), c++;
				continue;
			}
			let n = c;
			for (; n + 1 < a.length && l[n] <= Jm && i(e[n], e[n + 1]);) n++;
			const h = e[n], f = new Float64Array(2 * (h - t + 1));
			for (let e = t; e <= h; e++) f[2 * (e - t)] = r[e % s * 2], f[2 * (e - t) + 1] = r[e % s * 2 + 1];
			u(o.fit(f)), c = n + 1;
		}
	}
	return l.push({ type: "Z" }), l;
}
function rx(t) {
	const { width: n, height: e } = t, r = n * e, { rgb: o } = bo(t), s = new Float32Array(r);
	for (let l = 0; l < r; l++) s[l] = .2126 * o[3 * l] + .7152 * o[3 * l + 1] + .0722 * o[3 * l + 2];
	const i = Nr(o), a = Br(o, n, e, .035, 64, Je($(s, n, e), r, !1), i);
	return {
		width: n,
		height: e,
		rgb: o,
		palette: a,
		labels: Or(o, a, i)
	};
}
function ox(t, n, e) {
	const { width: r, height: o, data: s } = t, i = r * o, a = e.length / 3, l = new Float32Array(3 * i), c = new Float32Array(i), h = new Int32Array(i);
	for (let y = 0; y < i; y++) {
		const t = Math.fround(s[4 * y] / 255), e = Math.fround(s[4 * y + 1] / 255), r = Math.fround(s[4 * y + 2] / 255);
		l[3 * y] = t, l[3 * y + 1] = e, l[3 * y + 2] = r, c[y] = .2126 * t + .7152 * e + .0722 * r;
		const o = n.data[y];
		h[y] = o >= 0 && o < a ? o : a;
	}
	const f = new Float64Array(3 * (a + 1)).fill(1);
	for (let y = 0; y < 3 * a; y++) f[y] = e[y] / 255;
	const u = Math.min(1 * go(l, h, r, o, f), 8 / 255);
	return Math.max($(c, r, o), u);
}
function* sx(t, n, e, r, o, s, i, a, l, c) {
	const h = We(e * r, a), { fills: f, ink: u } = yield* function* (t, n, e, r, o, s, i, a = {}) {
		const l = a.regionRecovery ?? !0, c = a.sameClass ?? null, h = a.gradients ?? !0, f = a.scale ?? 1, u = a.budget ?? new Jo(e, r), y = a.search ?? He, d = new ns({
			labels: t.slice(),
			rgb: n,
			w: e,
			h: r,
			inkRgb: Float64Array.from(o),
			sigmaNoise: s,
			lambda: i,
			regionRecovery: l,
			gradients: h,
			scale: f,
			search: y
		}), { adj: p, smooth: g, sharp: m } = function(t, n, e, r, o, s, i) {
			const a = n.length, l = [], c = [], h = [];
			for (let u = 0; u < a; u++) l.push(/* @__PURE__ */ new Map()), c.push(/* @__PURE__ */ new Map()), h.push(/* @__PURE__ */ new Map());
			const f = (r, o) => {
				const a = t[r], f = t[o];
				a === f || null !== s && !s(n[a], n[f]) || (es(l, a, f), i && function(t, n, e) {
					return Wo(t[3 * n], t[3 * n + 1], t[3 * n + 2], Go), Wo(t[3 * e], t[3 * e + 1], t[3 * e + 2], Zo), Qo(1) < 9;
				}(e, r, o) && es(c, a, f), function(t, n, e) {
					return Ho(t[3 * n], t[3 * n + 1], t[3 * n + 2], Go), Ho(t[3 * e], t[3 * e + 1], t[3 * e + 2], Zo), Qo(100) > 36;
				}(e, r, o) && es(h, a, f));
			};
			for (let u = 0; u < o; u++) for (let n = 0; n < r; n++) {
				const e = u * r + n;
				n + 1 < r && t[e] !== t[e + 1] && f(e, e + 1), u + 1 < o && t[e] !== t[e + r] && f(e, e + r);
			}
			return {
				adj: l,
				smooth: c,
				sharp: h
			};
		}(d.group, d.compLabel, n, e, r, c, l), x = new rs(d, p, g, m, l, u, 3 * f);
		yield* x.fitComponents(), h && (yield* x.run());
		const { fills: M, inks: w } = x.writeBack(t, d.nInk, d.nPal);
		return {
			fills: M,
			ink: w,
			budget: u
		};
	}(t, n, e, r, o.inkRgb, s, h, {
		gradients: l,
		sameClass: c?.sameClass ?? null,
		scale: a
	}), y = f.length;
	(function(t, n, e, r, o, s, i, a, l, c, h = null, f = !0, u = 1) {
		const y = e * r;
		if (0 === s.length || 0 === y) return 0;
		const d = Float32Array.from(o), p = function(t, n, e, r, o, s, i, a) {
			const l = e * r, c = s.length, h = os(Math.max(8 * i, .06)), f = null === a ? 0 : os(Math.max(8 * a, .06)), u = Eo(n, e, r, t, ss(o, s), i), y = new Int32Array(c);
			for (let m = 0; m < l; m++) {
				const n = t[m];
				n >= 0 && n < c && 1 === u[m] && is(t, e, r, m) && y[n]++;
			}
			const d = Array.from({ length: c }, () => null), p = /* @__PURE__ */ new Float64Array(3), g = new Uint8Array(l);
			for (let m = 0; m < l; m++) {
				const o = t[m];
				if (o < 0 || o >= c || y[o] < 8) continue;
				if (!is(t, e, r, m) || 0 === u[m]) continue;
				const i = m % e, l = (m - i) / e;
				let x = d[o];
				null === x && (x = new $n(Tn(s[o].model)), d[o] = x), x.colorAt(i, l, p, 0);
				let M = 0;
				for (let t = 0; t < 3; t++) {
					const e = Math.abs(os(n[3 * m + t] - p[t]));
					e > M && (M = e);
				}
				M > (null !== a && as(t, e, r, i, l, o) ? f : h) && (g[m] = 1);
			}
			return g;
		}(t, n, e, r, d, s, a, h), g = [];
		0 === function(t, n, e, r, o, s, i, a, l, c, h) {
			const f = e * r, u = new Uint8Array(f), y = new Int32Array(f), d = new Int32Array(f), p = Math.max(l, 4);
			let g = 0;
			for (let m = 0; m < f; m++) {
				if (0 === a[m] || 1 === u[m]) continue;
				const l = t[m], f = ls(a, u, t, e, r, m, y, d);
				if (f < p || g >= 64) continue;
				const x = d.subarray(0, f), M = cs(n, x), w = s.length;
				if (w >= 65535) break;
				for (let n = 0; n < f; n++) t[x[n]] = w;
				s.push(zn(M, c)), i.push(hs(o, M, l)), h.includes(l) || h.push(l), g++;
			}
			return g;
		}(t, n, e, r, d, s, i, p, c, l, g) || function(t, n, e, r, o, s, i, a, l, c, h) {
			const f = Eo(n, e, r, t, ss(o, s), a);
			for (const u of i) s[u] = Ze(Qe(n, e, r, Ye(t, u), (n) => t[n] === u, (t) => 1 === f[t], a, l, c, h));
		}(t, n, e, r, d, s, g, a, l, f, 16 * u * u);
	})(t, n, e, r, o.inkRgb, f, u, s, h, Math.max(i, 2), null, l, a);
	let d = [];
	null !== c && (function(t, n, e, r, o, s) {
		const i = (t) => t < 0 || t >= r.alpha.length || r.alpha[t] <= ws, a = [];
		for (let p = s; p < o.length; p++) i(o[p]) && a.push(p);
		const l = [];
		for (let p = 0; p < r.count; p++) i(p) || l.push(p);
		if (0 === a.length || 0 === l.length) return;
		const c = new Int32Array(o.length - s).fill(-1);
		for (let p = 0; p < a.length; p++) c[a[p] - s] = p;
		const h = new Float64Array(3 * a.length), f = new Float64Array(a.length), u = new Float64Array(a.length);
		for (let p = 0; p < t.length; p++) {
			const r = t[p];
			if (r < s || r >= o.length) continue;
			const i = c[r - s];
			i < 0 || (h[3 * i] += n[3 * p], h[3 * i + 1] += n[3 * p + 1], h[3 * i + 2] += n[3 * p + 2], f[i] += e[p], u[i]++);
		}
		const y = Cs(r), d = /* @__PURE__ */ new Float64Array(6);
		for (let p = 0; p < a.length; p++) {
			const t = u[p];
			if (0 === t) continue;
			const n = xs(f[p] / t);
			if (n < bs) continue;
			Ps(xs(h[3 * p] / t), xs(h[3 * p + 1] / t), xs(h[3 * p + 2] / t), n, d, 0);
			let e = l[0], r = Us(d, 0, y, 6 * e);
			for (let o = 1; o < l.length; o++) {
				const t = Us(d, 0, y, 6 * l[o]);
				t < r && (e = l[o], r = t);
			}
			o[a[p]] = e;
		}
	}(t, n, c.alpha, o, u, y), l && (d = function(t, n, e, r, o, s, i, a, l, c) {
		const h = s * i;
		let f = Math.max(n.length, e.length, a.count);
		for (let S = 0; S < h; S++) t[S] + 1 > f && (f = t[S] + 1);
		const u = (t) => t < e.length ? e[t] : t, y = (t) => {
			const n = u(t);
			return n >= 0 && n < a.alpha.length ? a.alpha[n] : 1;
		}, d = new Float64Array(4 * f);
		for (let S = 0; S < h; S++) {
			const n = o[S], e = yi(1 - n), s = 4 * t[S];
			d[s] += yi(r[3 * S] - e), d[s + 1] += yi(r[3 * S + 1] - e), d[s + 2] += yi(r[3 * S + 2] - e), d[s + 3] += n;
		}
		const p = new Uint8Array(f);
		let g = !1;
		for (let S = 0; S < f; S++) {
			const t = y(S);
			t >= gi && t < pi && null !== vi(d, S) && (p[S] = 1, g = !0);
		}
		const m = new Array(f).fill(null);
		if (!g) return m;
		const x = new Int32Array(h).fill(-1), M = [], w = new Int32Array(h), b = new Int32Array(h);
		let A = 0;
		const k = (n, e) => {
			-1 === x[n] && 1 === p[t[n]] && (x[n] = e, w[A++] = n);
		};
		for (let S = 0; S < h; S++) {
			if (0 === p[t[S]] || -1 !== x[S]) continue;
			const n = M.length;
			let e = 0;
			for (A = 0, w[A++] = S, x[S] = n; A > 0;) {
				const t = w[--A];
				b[e++] = t;
				const r = t % s;
				r > 0 && k(t - 1, n), r + 1 < s && k(t + 1, n), t >= s && k(t - s, n), t + s < h && k(t + s, n);
			}
			M.push(b.subarray(0, e).toSorted());
		}
		const v = new Float32Array(3 * h);
		for (let S = 0; S < h; S++) v[3 * S] = o[S], v[3 * S + 1] = o[S], v[3 * S + 2] = o[S];
		const F = /* @__PURE__ */ new Float64Array(3);
		let I = f;
		for (let S = 0; S < M.length; S++) {
			const h = M[S];
			if (h.length < 16 || I >= 65535) continue;
			const f = Array.from(new Set(Array.from(h, (n) => t[n]))).toSorted((t, n) => t - n), { model: y } = ki(v, s, i, h, (t) => x[t] === S, l, c, !1);
			if (!Cn(y)) continue;
			const p = wi(y, h, r, o, s), g = mi(y).length, w = new $n(Tn(p)), b = new $n(Tn(y)), A = bi(h, r, o, l, (t, n) => {
				const e = t % s, r = (t - e) / s;
				return w.colorAt(e, r, n, 0), b.colorAt(e, r, F, 0), F[0];
			}), k = .5 * A + c * (Ai(y) + 3 * g);
			let N = 0;
			for (const n of f) {
				const e = vi(d, n);
				if (null === e) continue;
				const s = h.filter((e) => t[e] === n), i = new Float32Array(s.length);
				for (let t = 0; t < s.length; t++) i[t] = o[s[t]];
				const a = i.toSorted()[s.length >> 1];
				N += .5 * bi(s, r, o, l, (t, n) => (n[0] = e[0], n[1] = e[1], n[2] = e[2], a)) + 4 * c;
			}
			if (k >= N) continue;
			const P = {
				color: p,
				alpha: y
			}, C = I++, U = u(f[0]);
			for (let n = 0; n < h.length; n++) t[h[n]] = C;
			for (; n.length <= C;) n.push(Fi(Ii(a, n.length)));
			for (n[C] = {
				model: Mi(P),
				chi2: A,
				params: Ai(y) + 3 * g,
				cost: k
			}; e.length <= C;) e.push(e.length);
			for (e[C] = U; m.length <= C;) m.push(null);
			m[C] = P;
		}
		const N = new Uint8Array(I);
		for (let S = 0; S < h; S++) N[t[S]] = 1;
		for (let S = 0; S < f; S++) {
			if (0 === p[S] || 0 === N[S]) continue;
			const t = vi(d, S), e = u(S);
			if (null === t || e < 0 || e >= a.alpha.length) continue;
			const r = a.alpha[e];
			for (; n.length <= S;) n.push(Fi(Ii(a, n.length)));
			n[S] = {
				...n[S],
				model: {
					kind: "flat",
					color: [
						yi(yi(yi(t[0] * r) + 1) - r),
						yi(yi(yi(t[1] * r) + 1) - r),
						yi(yi(yi(t[2] * r) + 1) - r)
					]
				}
			};
		}
		return m;
	}(t, f, u, n, c.alpha, e, r, o, s, h)));
	const { faces: p, faceLabel: g, count: m } = function(t, n, e) {
		let r = t, o = Dr(r, n, e);
		o.count > 65535 && (r = t.slice(0, n * e), fo(r, n, e, Wr), o = Dr(r, n, e));
		const s = new Int32Array(o.count);
		for (let i = 0; i < o.runStart.length; i++) s[o.runComp[i]] = r[o.runStart[i]];
		return {
			faces: o.comp,
			faceLabel: s,
			count: o.count
		};
	}(t, e, r), x = [], M = [];
	for (let A = 0; A < m; A++) {
		const t = g[A];
		x.push(f[t] ?? ix(o, t, null !== c)), M.push(u[t] ?? t);
	}
	(function(t, n, e, r, o, s, i = () => !1) {
		const a = Math.min(r.length, o.length);
		if (0 === a || 0 === s.count) return 0;
		const l = function(t, n, e, r) {
			const o = new Int32Array(r);
			if (n < 3 || e < 3 || t.length < n * e) return o;
			for (let s = 1; s < e - 1; s++) {
				const e = s * n;
				for (let s = 1; s < n - 1; s++) {
					const i = e + s, a = t[i];
					a >= 0 && a < r && t[i - 1] === a && t[i + 1] === a && t[i - n] === a && t[i + n] === a && o[a]++;
				}
			}
			return o;
		}(t, n, e, a), c = s.inkRgb, h = (t) => {
			const n = r[t].model, e = o[t];
			return "flat" === n.kind && e >= 0 && e < s.count && !i(t) ? n.color : null;
		}, f = new Int32Array(s.count).fill(-1), u = Array.from({ length: s.count }, () => null);
		for (let d = 0; d < a; d++) {
			const t = h(d);
			if (null === t) continue;
			const n = o[d];
			0 !== l[d] && (wr(t[0], t[1], t[2], c[3 * n], c[3 * n + 1], c[3 * n + 2]) >= 1.5 || (null === u[n] || l[d] > f[n]) && (f[n] = l[d], u[n] = t));
		}
		let y = 0;
		for (let d = 0; d < a; d++) {
			const t = h(d);
			if (null === t) continue;
			const n = u[o[d]];
			null !== n && (t[0] !== n[0] || t[1] !== n[1] || t[2] !== n[2]) && wr(t[0], t[1], t[2], n[0], n[1], n[2]) < .5 && (r[d] = {
				...r[d],
				model: {
					kind: "flat",
					color: n
				}
			}, y++);
		}
	})(p, e, r, x, M, o, (t) => null !== (d[g[t]] ?? null));
	const w = f.map((t) => t.model);
	for (let A = 0; A < m; A++) w[g[A]] = x[A].model;
	const b = [];
	for (let A = 0; A < w.length; A++) b.push(u[A] ?? A);
	return {
		models: w,
		inks: b,
		fades: d
	};
}
function ix(t, n, e) {
	const r = n < t.count ? 3 * n : -1, o = e ? 1 : 0;
	return {
		model: {
			kind: "flat",
			color: r >= 0 ? [
				t.inkRgb[r],
				t.inkRgb[r + 1],
				t.inkRgb[r + 2]
			] : [
				o,
				o,
				o
			]
		},
		chi2: 0,
		params: 3,
		cost: 0
	};
}
function ax(t) {
	const n = a(t) ?? [
		0,
		0,
		0
	];
	return [
		n[0] / 255,
		n[1] / 255,
		n[2] / 255
	];
}
function lx(t) {
	return Math.round(255 * Math.min(1, Math.max(0, t)));
}
function cx(t) {
	return [
		lx(t[0]),
		lx(t[1]),
		lx(t[2])
	];
}
function hx(t, n) {
	return [
		0,
		1,
		2
	].map((e) => Math.min(1, Math.max(0, (t[e] - 1 + n) / n)));
}
function fx(t, n, e, r, o, s, i, a) {
	const l = n * e;
	let h = Math.max(r.count, o.models.length);
	for (let c = 0; c < l; c++) t[c] + 1 > h && (h = t[c] + 1);
	const f = new Uint32Array(h);
	for (let c = 0; c < l; c++) f[t[c]]++;
	const u = new Int32Array(h).fill(-1), y = /* @__PURE__ */ new Map(), d = [], p = [], g = [], m = [], x = [], M = [];
	let w = !1;
	for (let A = 0; A < h; A++) {
		if (0 === f[A]) continue;
		const t = o.models[A] ?? ix(r, A, a).model, n = o.inks[A] ?? A, e = o.fades[A] ?? null, s = n >= 0 && n < r.alpha.length ? r.alpha[n] : 1;
		if (null === e && a && s <= .02) continue;
		let i, l = 1, h = null;
		null !== e ? (i = gs(e.alpha, e.color), null === i && (l = Math.min(1, Math.max(0, qn(e.alpha)[0])), h = [...qn(e.color)])) : (l = s >= .999 ? 1 : s, i = ps(t), null !== i && l < 1 && (i = {
			...i,
			stops: i.stops.map((t) => {
				const n = hx(ax(t.color), l);
				return {
					...t,
					color: us(n),
					opacity: Math.round(1e3 * l) / 1e3
				};
			})
		}), null === i && l < 1 && (h = hx(qn(t), l)));
		const b = cx(qn(t)), k = c(b[0], b[1], b[2]), v = null === i ? `${k}|${l}` : null, F = null !== v ? y.get(v) : void 0;
		if (void 0 !== F) {
			u[A] = F, g[F] += f[A];
			continue;
		}
		u[A] = d.length, null !== v && y.set(v, d.length), d.push(k), p.push(b[0], b[1], b[2]), g.push(f[A]), m.push(i);
		const I = null === i && l < 1;
		I && (w = !0), x.push(I ? Math.round(1e3 * l) / 1e3 : void 0);
		const N = I && null !== h ? cx(h) : null;
		M.push(null !== N ? c(N[0], N[1], N[2]) : void 0);
	}
	const b = new Int32Array(l);
	for (let c = 0; c < l; c++) b[c] = u[t[c]];
	return {
		labels: {
			width: n,
			height: e,
			data: b,
			count: d.length
		},
		paletteHex: d,
		paletteRgb: Uint8Array.from(p),
		counts: Uint32Array.from(g),
		sigmaNoise: s,
		gradients: i ? m : void 0,
		...w ? {
			fillOpacity: x,
			inkHex: M
		} : {}
	};
}
function ux(t) {
	const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(3 * o), i = new Float32Array(o);
	for (let a = 0; a < o; a++) {
		const t = Math.fround(r[4 * a] / 255), n = Math.fround(r[4 * a + 1] / 255), e = Math.fround(r[4 * a + 2] / 255);
		s[3 * a] = t, s[3 * a + 1] = n, s[3 * a + 2] = e, i[a] = .2126 * t + .7152 * n + .0722 * e;
	}
	return {
		rgb: s,
		lum: i
	};
}
function yx(t, n) {
	return {
		fill: t.fill,
		fillRule: "evenodd",
		layerId: n,
		...t.unfoldable ? { unfoldable: !0 } : {}
	};
}
function dx(t, n, e) {
	if (!t) return null;
	const r = t.width === n && t.height === e ? t : function(t, n, e) {
		const { width: r, height: o, data: s } = t;
		if (n <= 0 || e <= 0) throw new RangeError("resize target must be positive");
		if (n === r && e === o) return {
			width: n,
			height: e,
			data: new Float32Array(s)
		};
		const i = new Float32Array(n * e), a = r / n, l = o / e;
		for (let c = 0; c < e; c++) {
			const t = q((c + .5) * l - .5, o - 1), e = Math.floor(t), h = Math.min(o - 1, e + 1), f = t - e;
			for (let o = 0; o < n; o++) {
				const t = q((o + .5) * a - .5, r - 1), l = Math.floor(t), u = Math.min(r - 1, l + 1), y = t - l, d = s[e * r + l] + (s[e * r + u] - s[e * r + l]) * y, p = s[h * r + l] + (s[h * r + u] - s[h * r + l]) * y;
				i[c * n + o] = d + (p - d) * f;
			}
		}
		return {
			width: n,
			height: e,
			data: i
		};
	}(t, n, e), o = new Uint8Array(n * e);
	for (let s = 0; s < o.length; s++) o[s] = r.data[s] > .5 ? 1 : 0;
	return {
		width: n,
		height: e,
		data: o
	};
}
const px = {
	preprocess: .12,
	palette: .2,
	segment: .08,
	trace: .48,
	fit: 0,
	svg: .12
}, gx = [
	"preprocess",
	"palette",
	"segment",
	"trace",
	"svg"
];
var mx = class {
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
		this.closeStage(), this.currentStage = t, this.stageStart = P(), this.lastMark = this.stageStart, this.progress(0);
	}
	emitStep(t) {
		const n = this.ctx?.onTrace;
		if (!n || !this.currentStage) return;
		const e = this.lastMark, r = P();
		this.lastMark = r;
		const o = t();
		n({
			index: this.stepIndex++,
			stage: this.currentStage,
			startMs: e,
			endMs: r,
			code: o.code,
			label: o.label,
			notes: o.notes,
			metrics: o.metrics,
			rasters: o.rasters,
			charts: o.charts
		});
	}
	progress(t) {
		if (!this.currentStage || !this.ctx?.onProgress) return;
		let n = 0;
		for (const e of gx) {
			if (e === this.currentStage) break;
			n += px[e];
		}
		n += px[this.currentStage] * Math.min(1, Math.max(0, t)), this.ctx.onProgress(this.currentStage, Math.min(1, n));
	}
	checkCancel() {
		if (this.ctx?.shouldCancel?.()) throw new p();
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
			ms: P() - this.stageStart
		}), this.currentStage = null);
	}
};
function xx(t) {
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
function Mx(t, n, e) {
	const r = t.palette ??= /* @__PURE__ */ new Map();
	for (r.delete(n), r.set(n, e); r.size > 4;) {
		const t = r.keys().next().value;
		if (void 0 === t) break;
		r.delete(t);
	}
}
function wx(t, n, e, r, o) {
	const s = n.map((t) => ({
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
		fillOpacity: t.fillOpacity,
		stroke: t.stroke,
		strokeWidth: t.strokeWidth,
		layerId: t.layerId
	}));
	return {
		width: e,
		height: r,
		unit: o.unit,
		widthMm: "mm" === o.unit ? o.widthMm : void 0,
		shapes: i,
		gradients: s.length > 0 ? s : void 0
	};
}
function bx(t, n, e) {
	return "linear" === t.kind ? {
		...t,
		x1: t.x1 * n + e,
		y1: t.y1 * n + e,
		x2: t.x2 * n + e,
		y2: t.y2 * n + e
	} : {
		...t,
		cx: t.cx * n + e,
		cy: t.cy * n + e,
		r: t.r * n
	};
}
function Ax(t) {
	return t.optimizeSvg && "px" === t.unit;
}
let kx = 0;
async function vx(t, o, s, i) {
	const l = function(t = {}, n = C) {
		const e = {
			...n,
			...t
		};
		if (e.maxDimension = 0 === e.maxDimension ? 0 : N(e.maxDimension, 64, 8192), e.supersample = N(e.supersample, 1, 4), e.blurRadius = I(e.blurRadius, 0, 10), e.alphaThreshold = N(e.alphaThreshold, 0, 255), e.paletteSize = N(e.paletteSize, 2, 64), e.quantizeQuality = N(e.quantizeQuality, 1, 10), null !== e.palette) {
			const t = /* @__PURE__ */ new Set(), n = [];
			for (const r of e.palette) {
				if (/^#[0-9a-f]{6}$/i.test(r)) {
					const e = r.toLowerCase();
					t.has(e) || (t.add(e), n.push(e));
				}
				if (n.length >= 64) break;
			}
			e.palette = n.length > 0 ? n : null;
		}
		return e.segmentation = "regions" === e.segmentation ? "regions" : "quantize", e.geometry = "planar" === e.geometry ? "planar" : "classic", e.frontEnd = "ink" === e.frontEnd ? "ink" : "classic", e.minRegionArea = N(e.minRegionArea, 0, 4096), e.dissolveBands = N(e.dissolveBands, 0, 4), e.colorCoherence = I(e.colorCoherence, 0, 1), e.gradientStrength = I(e.gradientStrength, 0, 1), e.gradientMinArea = N(e.gradientMinArea, 0, 1e6), e.gradientMaxDimension = 0 === e.gradientMaxDimension ? 0 : N(e.gradientMaxDimension, 128, 4096), e.gapFill = I(e.gapFill, 0, 5), e.threshold = N(e.threshold, 0, 255), e.adaptiveRadius = N(e.adaptiveRadius, 2, 128), e.adaptiveBias = I(e.adaptiveBias, -64, 64), e.smoothing = I(e.smoothing, 0, 1), e.optTolerance = I(e.optTolerance, 0, 5), e.cornerThreshold = I(e.cornerThreshold, 0, 180), e.fitTolerance = I(e.fitTolerance, .1, 10), e.simplifyTolerance = I(e.simplifyTolerance, 0, 10), e.strokeWidth = I(e.strokeWidth, 0, 64), e.pruneLength = I(e.pruneLength, 0, 256), e.precision = N(e.precision, 0, 4), e.widthMm = I(e.widthMm, 0, 1e4), e;
	}(o), h = function(t, n) {
		return function(t, n, e, r) {
			const o = Math.max(t, n), s = e > 0 && o > e ? e / o : 1, i = Math.max(1, Math.round(t * s)) * Math.max(1, Math.round(n * s));
			let a = r;
			for (; a > 1 && i * a * a > 16777216;) a--;
			return a;
		}(t.width, t.height, n.maxDimension, n.supersample);
	}(t, l), f = h === l.supersample ? l : {
		...l,
		supersample: h
	}, y = 1 === h ? f : function(t, n) {
		const e = n * n;
		return {
			...t,
			minRegionArea: t.minRegionArea * e,
			gradientMinArea: t.gradientMinArea * e,
			adaptiveRadius: t.adaptiveRadius * n,
			pruneLength: t.pruneLength * n,
			fitTolerance: t.fitTolerance * n,
			simplifyTolerance: t.simplifyTolerance * n,
			strokeWidth: t.strokeWidth * n
		};
	}(f, h), p = i?.geometry ?? y.geometry, g = "planar" === p ? i?.frontEnd ?? y.frontEnd : "classic", x = P(), w = new mx(s), A = [];
	h < l.supersample && A.push({
		code: "supersample-limited",
		severity: "info",
		message: `Supersampled ${h}× instead of ${l.supersample}×: the enlarged image would pass 4096² pixels.`,
		params: {
			requested: l.supersample,
			applied: h,
			side: 4096
		}
	});
	const k = i?.cache, U = i?.imageId, L = void 0 !== k && void 0 !== U, R = void 0 !== i?.helpers && i.helpers.size > 0 ? i.helpers : void 0, j = ++kx;
	w.stage("preprocess");
	const O = "planar" === p && "custom" !== y.background && !y.omitBackground && void 0 === s?.edgeHint && function(t) {
		const { width: n, height: e, data: r } = t;
		if (0 === n || 0 === e) return !1;
		let o = !1;
		for (let s = 3; s < r.length; s += 4) if (r[s] < 255) {
			o = !0;
			break;
		}
		if (!o) return !1;
		for (let s = 0; s < n; s++) if (r[4 * s + 3] > 0 || r[4 * ((e - 1) * n + s) + 3] > 0) return !0;
		for (let s = 0; s < e; s++) if (r[s * n * 4 + 3] > 0 || r[4 * (s * n + n - 1) + 3] > 0) return !0;
		return !1;
	}(t) ? 2 : 0, K = `${X = y, [
		X.maxDimension,
		X.supersample,
		X.denoise,
		X.blurRadius,
		X.background,
		X.backgroundColor,
		X.alphaThreshold,
		"grayscale" === X.mode ? "g" : X.supersample > 1 && "color" !== X.mode ? "i" : "c"
	].join("|")}|${O}|${p}|${g}`;
	var X;
	let W, G, Z, Q, Y, _, V = !1;
	if (L && k.imageId === U && k.preKey === K && k.workImage) W = k.workImage, G = k.opaque ?? null, Z = k.alpha ?? null, V = k.intakeSoft ?? !1, Q = k.intakeEdgeNoise, Y = k.intakeClean, _ = k.planarSource, xx(k).preHits++, w.progress(1);
	else {
		let n = z(t, y.maxDimension);
		if (O > 0 && (n = function(t, n) {
			const { width: e, height: r, data: o } = t, s = e + 2 * n, i = r + 2 * n, a = new Uint8ClampedArray(s * i * 4);
			for (let l = 0; l < r; l++) a.set(o.subarray(l * e * 4, (l + 1) * e * 4), 4 * ((l + n) * s + n));
			return {
				width: s,
				height: i,
				data: a
			};
		}(n, O)), "planar" === p && (V = function(t) {
			const { rgb: n } = bo(t);
			return Lo(n, t.width, t.height, !1).soft;
		}(n), !V && "ink" === g && "color" === y.mode)) {
			const t = rx(n);
			Q = function(t, n = rx(t)) {
				const { width: e, height: r, rgb: o, palette: s, labels: i } = n, { level: a, samples: l } = function(t, n, e, r, o) {
					if (e < 3 || r < 3) return {
						level: 0,
						samples: 0
					};
					const { boundary: s } = mo(t, n, e, r, o);
					return {
						level: s.length > 0 ? po(s) : 0,
						samples: s.length
					};
				}(o, i, e, r, s.inkRgb);
				if (!(l < 256 || a < .013725490196078431)) return Math.min(a, 8 / 255);
			}(n, t), V = void 0 !== Q, V || 1 !== h || (Y = t);
		}
		w.progress(.3), "median" === y.denoise ? n = function(t) {
			const { width: n, height: e, data: r } = t, o = Math.max(1, Math.round(1)), i = 9, a = new Int32Array(i), l = new Int32Array(i), c = new Int32Array(i), h = new Uint8ClampedArray(n * e * 4);
			for (let f = 0; f < e; f++) {
				const t = f - o < 0 ? 0 : f - o, s = f + o >= e ? e - 1 : f + o;
				for (let e = 0; e < n; e++) {
					const i = e - o < 0 ? 0 : e - o, u = e + o >= n ? n - 1 : e + o;
					let y = 0;
					for (let e = t; e <= s; e++) {
						const t = e * n;
						for (let n = i; n <= u; n++) {
							const e = 4 * (t + n);
							a[y] = r[e], l[y] = r[e + 1], c[y] = r[e + 2], y++;
						}
					}
					E(a, y), E(l, y), E(c, y);
					const d = y >> 1, p = 4 * (f * n + e);
					h[p] = a[d], h[p + 1] = l[d], h[p + 2] = c[d], h[p + 3] = r[p + 3];
				}
			}
			return {
				width: n,
				height: e,
				data: h
			};
		}(n) : "bilateral" === y.denoise && (n = function(t) {
			const { width: n, height: e, data: r } = t;
			const o = Math.max(1, Math.round(2)), s = 5, i = /* @__PURE__ */ new Float64Array(25);
			for (let c = -2; c <= o; c++) for (let t = -2; t <= o; t++) i[(c + o) * s + (t + o)] = Math.exp(-(t * t + c * c) / 8);
			const a = /* @__PURE__ */ new Float64Array(256);
			for (let c = 0; c < 256; c++) a[c] = Math.exp(-c * c / 2450);
			const l = new Uint8ClampedArray(n * e * 4);
			for (let c = 0; c < e; c++) for (let t = 0; t < n; t++) {
				const h = 4 * (c * n + t), f = r[h], u = r[h + 1], y = r[h + 2];
				let d = 0, p = 0, g = 0, m = 0;
				for (let l = -2; l <= o; l++) {
					const h = c + l;
					if (h < 0 || h >= e) continue;
					const x = h * n, M = (l + o) * s;
					for (let e = -2; e <= o; e++) {
						const s = t + e;
						if (s < 0 || s >= n) continue;
						const l = 4 * (x + s), c = r[l], h = r[l + 1], w = r[l + 2], b = c - f, A = h - u, k = w - y;
						let v = Math.round(Math.sqrt(b * b + A * A + k * k));
						v > 255 && (v = 255);
						const F = i[M + (e + o)] * a[v];
						d += F, p += c * F, g += h * F, m += w * F;
					}
				}
				l[h] = Math.round(p / d), l[h + 1] = Math.round(g / d), l[h + 2] = Math.round(m / d), l[h + 3] = r[h + 3];
			}
			return {
				width: n,
				height: e,
				data: l
			};
		}(n)), y.blurRadius > 0 && (n = function(t, n) {
			const { width: e, height: r, data: o } = t;
			if (n <= 0) return F(t);
			const s = n / 2, i = Math.ceil(3 * s), a = new Float64Array(2 * i + 1);
			let l = 0;
			for (let f = -i; f <= i; f++) {
				const t = Math.exp(-f * f / (2 * s * s));
				a[f + i] = t, l += t;
			}
			for (let f = 0; f < a.length; f++) a[f] /= l;
			const c = new Float32Array(e * r * 4);
			for (let f = 0; f < r; f++) {
				const t = f * e;
				for (let n = 0; n < e; n++) {
					let r = 0, s = 0, l = 0, h = 0;
					for (let c = -i; c <= i; c++) {
						let f = n + c;
						f < 0 ? f = 0 : f >= e && (f = e - 1);
						const u = a[c + i], y = 4 * (t + f);
						r += o[y] * u, s += o[y + 1] * u, l += o[y + 2] * u, h += o[y + 3] * u;
					}
					const f = 4 * (t + n);
					c[f] = r, c[f + 1] = s, c[f + 2] = l, c[f + 3] = h;
				}
			}
			const h = new Uint8ClampedArray(e * r * 4);
			for (let f = 0; f < r; f++) for (let t = 0; t < e; t++) {
				let n = 0, o = 0, s = 0, l = 0;
				for (let h = -i; h <= i; h++) {
					let u = f + h;
					u < 0 ? u = 0 : u >= r && (u = r - 1);
					const y = a[h + i], d = 4 * (u * e + t);
					n += c[d] * y, o += c[d + 1] * y, s += c[d + 2] * y, l += c[d + 3] * y;
				}
				const u = 4 * (f * e + t);
				h[u] = Math.round(n), h[u + 1] = Math.round(o), h[u + 2] = Math.round(s), h[u + 3] = Math.round(l);
			}
			return {
				width: e,
				height: r,
				data: h
			};
		}(n, y.blurRadius));
		const e = n;
		h > 1 && (n = function(t, n, e = !0) {
			const r = Math.round(n);
			if (r <= 1) return t;
			const { width: o, height: s, data: i } = t, a = o * r, l = s * r, c = [], h = [];
			for (let x = 0; x < r; x++) {
				const t = (x + .5) / r - .5, n = Math.floor(t);
				h.push(n), c.push(T(t - n));
			}
			const f = new Float32Array(o * s * 4);
			for (let x = 0, M = 0; x < o * s; x++, M += 4) {
				const t = i[M + 3] / 255;
				f[M] = i[M] * t, f[M + 1] = i[M + 1] * t, f[M + 2] = i[M + 2] * t, f[M + 3] = i[M + 3];
			}
			const u = /* @__PURE__ */ new Float64Array(4), y = (t, n, r, o, s, i) => {
				for (let a = 0; a < 4; a++) {
					const l = t[r + a], c = t[o + a], h = t[n + a] * i[0] + l * i[1] + c * i[2] + t[s + a] * i[3];
					if (!e) {
						u[a] = h;
						continue;
					}
					const f = l < c ? l : c, y = l < c ? c : l;
					u[a] = h < f ? f : h > y ? y : h;
				}
			}, d = new Float32Array(a * s * 4), p = (t) => t < 0 ? 0 : t >= o ? o - 1 : t;
			for (let x = 0; x < s; x++) {
				const t = x * o, n = x * a;
				for (let e = 0; e < a; e++) {
					const o = Math.floor(e / r), s = e - o * r, i = o + h[s] - 1;
					y(f, 4 * (t + p(i)), 4 * (t + p(i + 1)), 4 * (t + p(i + 2)), 4 * (t + p(i + 3)), c[s]);
					const a = 4 * (n + e);
					d[a] = u[0], d[a + 1] = u[1], d[a + 2] = u[2], d[a + 3] = u[3];
				}
			}
			const g = new Uint8ClampedArray(a * l * 4), m = (t) => (t < 0 ? 0 : t >= s ? s - 1 : t) * a;
			for (let x = 0; x < l; x++) {
				const t = Math.floor(x / r), n = x - t * r, e = t + h[n] - 1, o = m(e), s = m(e + 1), i = m(e + 2), l = m(e + 3);
				for (let r = 0; r < a; r++) {
					y(d, 4 * (o + r), 4 * (s + r), 4 * (i + r), 4 * (l + r), c[n]);
					const t = 4 * (x * a + r), e = u[3];
					if (g[t + 3] = Math.round(q(e, 255)), e <= 0) continue;
					const h = 255 / e;
					g[t] = Math.round(q(u[0] * h, 255)), g[t + 1] = Math.round(q(u[1] * h, 255)), g[t + 2] = Math.round(q(u[2] * h, 255));
				}
			}
			return {
				width: a,
				height: l,
				data: g
			};
		}(n, h, "color" === y.mode || "grayscale" === y.mode)), w.progress(.7);
		const r = B(n, y, h);
		if (n = r.image, G = r.opaque, Z = r.alpha, null !== Z && (Y = void 0), "grayscale" === y.mode && Wx(n), W = n, "planar" === p && h > 1) {
			const t = B(e, y, 1);
			"grayscale" === y.mode && Wx(t.image), _ = {
				image: t.image,
				alpha: null === Z ? null : t.alpha ?? new Uint8Array(t.image.width * t.image.height).fill(255)
			};
		}
		L && (xx(k).preMisses++, k.imageId = U, k.preKey = K, k.workImage = W, k.opaque = G, k.alpha = Z, k.intakeSoft = V, k.intakeEdgeNoise = Q, k.intakeClean = Y, k.planarSource = _, k.palette = /* @__PURE__ */ new Map(), k.ink = void 0);
	}
	const { width: J, height: tt } = W, nt = J / h - 2 * O, et = tt / h - 2 * O;
	await w.tick(), w.tracing && w.emitStep(() => {
		const n = [];
		return J === t.width && tt === t.height || n.push(`Resized ${t.width}×${t.height} → ${J}×${tt}.`), "none" !== y.denoise && n.push(`Denoise: ${y.denoise}.`), y.blurRadius > 0 && n.push(`Blur radius ${y.blurRadius}.`), h > 1 && n.push(`Supersampled ×${h} (bicubic) for tracing.`), "grayscale" === y.mode && n.push("Desaturated for grayscale tracing."), {
			code: "preprocess",
			label: "Preprocess",
			rasters: [Ui(t, "Source"), Ui(W, "grayscale" === y.mode ? "Working (gray)" : "Working")],
			charts: [qi(W)],
			metrics: {
				sourceWidth: t.width,
				sourceHeight: t.height,
				workWidth: J,
				workHeight: tt,
				scalePercent: Math.round(J / t.width * 100)
			},
			notes: n.length > 0 ? n : void 0
		};
	});
	const rt = [], ot = [];
	let st = [];
	const it = [], at = y.optimizeSvg && "stacked" === y.layering, lt = y.optimizeSvg && "px" === y.unit, ct = {
		precision: y.precision,
		optimize: y.optimizeSvg,
		roundPrimitives: at,
		compact: lt,
		scale: 1 / h,
		offset: -O
	}, ht = L ? `${U}|${K}` : `#${j}`;
	if ("color" === y.mode || "grayscale" === y.mode ? await async function(t, n, o, s, i, l, h, f, y, p, g, m, x, M, w) {
		t.stage("palette");
		const b = void 0 !== m && void 0 !== x && void 0 === g, A = "ink" === w?.frontEnd && "color" === i.mode, k = b ? `${function(t) {
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
		}(i)}${A ? "|ink" : ""}` : void 0, v = dx(g, n.width, n.height);
		let F, I, P, C, U, L, q, R, z, T;
		const E = b && m && m.imageId === x && void 0 !== k ? function(t, n) {
			const e = t.palette;
			if (!e) return;
			const r = e.get(n);
			return r && (e.delete(n), e.set(n, r)), r;
		}(m, k) : void 0;
		let j = E;
		if (E) F = E.labels, I = E.paletteHex, P = E.paletteRgb, C = E.counts, U = E.paletteClampedTo, L = E.gradients, q = E.underlays, R = E.fillOpacity, z = E.inkHex, T = E.sigmaNoise, xx(m).palHits++, await t.tick(), t.stage("segment"), await t.tick();
		else if (A) {
			b && xx(m).palMisses++;
			const e = w?.soft ?? !1, r = w?.edgeNoise, o = null !== s ? function* (t, n, e, r, o, s) {
				const { width: i, height: a } = t, l = i * a, { rgb: c, lum: h } = ux(t), f = new Float32Array(l);
				for (let g = 0; g < l; g++) f[g] = Math.fround(n[g] / 255);
				const u = 2 * e * e, y = ui(c, f, i, a, {
					sigmaNoise: $(h, i, a),
					soft: r,
					edgeNoise: s
				}, {
					minRegion: u,
					scale: e
				}), d = y.labels;
				Dr(d, i, a).count > 65535 && fo(d, i, a, Wr);
				const p = yield* sx(d, c, i, a, y.palette, y.sigmaNoise, u, e, o, {
					alpha: f,
					sameClass: y.sameClass
				});
				return fx(d, i, a, y.palette, p, y.sigmaNoise, o, !0);
			}(n, s, i.supersample, e, i.gradients, r) : function* (t, n, e, r, o, s) {
				const { width: i, height: a } = t, l = i * a, { rgb: c, lum: h } = ux(t);
				let f, u, y = $(h, i, a);
				if (void 0 !== s && !e && 1 === n && function(t, n, e, r) {
					if (t.width !== e || t.height !== r || t.rgb.length !== n.length) return !1;
					const o = new Uint32Array(t.rgb.buffer, t.rgb.byteOffset, t.rgb.length), s = new Uint32Array(n.buffer, n.byteOffset, n.length);
					for (let i = 0; i < o.length; i++) if (o[i] !== s[i]) return !1;
					return !0;
				}(s, c, i, a)) f = s.palette, u = s.labels.slice();
				else {
					const t = Nr(c);
					f = Br(c, i, a, .035, 64, Je(y, l, e, n), t), u = Or(c, f, t);
				}
				if (e) {
					const t = o ?? Math.min(1 * go(c, u, i, a, f.inkRgb), 8 / 255);
					y = Math.max(y, t);
				}
				const d = 2 * n * n, p = {
					px: c,
					inks: f.inkRgb,
					channels: 3
				};
				lo(u, i, a, d, p);
				const g = function(t, n, e, r, o, s, i, a = 1) {
					const l = Math.floor(s.length / 3), c = r * o, h = {
						rgb: n,
						alpha: e,
						w: r,
						h: o,
						inkRgb: s,
						inkCount: l,
						tol: Yr(i),
						reach: Math.max(1, Math.round(a)),
						tally: new Vr(1),
						top: /* @__PURE__ */ new Int32Array(3),
						cols: /* @__PURE__ */ new Float64Array(12),
						dest: new Int32Array(c),
						mix: {
							r: 0,
							who: -1
						}
					};
					let f = 0;
					for (let u = 0; u < 2; u++) {
						const { comps: n, thin: e } = no(t, r, o, h.reach);
						h.tally = new Vr(Jr(t, l));
						let s = 0;
						for (let r = 0; r < n.count; r++) {
							const o = e.offset[r], i = e.offset[r + 1];
							o !== i && ro(h, e.pixels, o, i, n.comp, t) && s++;
						}
						if (f += s, 0 === s) break;
					}
					return f;
				}(u, c, null, i, a, f.inkRgb, y, n), m = function(t, n, e, r, o, s, i) {
					const a = Math.floor(s.length / 3), l = Yr(i), c = /* @__PURE__ */ new Int32Array(4), h = /* @__PURE__ */ new Int32Array(5), f = /* @__PURE__ */ new Float64Array(15), u = {
						r: 0,
						who: -1
					};
					return oo(t, r, o, 4, (t, e) => {
						const i = t[e], y = ao(t, e, r, o, c);
						if (y < 2 || i >= a) return -1;
						const d = 3 * e, p = Zr(n[d] - Zr(s[3 * i])), g = Zr(n[d + 1] - Zr(s[3 * i + 1])), m = Zr(n[d + 2] - Zr(s[3 * i + 2])), x = Zr(Math.sqrt(Zr(Zr(Zr(p * p) + Zr(g * g)) + Zr(m * m))));
						let M = 0;
						for (let n = 0; n < y; n++) {
							const t = c[n];
							t >= a || (f[3 * M] = Zr(s[3 * t]), f[3 * M + 1] = Zr(s[3 * t + 1]), f[3 * M + 2] = Zr(s[3 * t + 2]), f[3 * M] === Gr[0] && f[3 * M + 1] === Gr[1] && (f[3 * M + 2], Gr[2]), h[M++] = t);
						}
						if (!_r(n, d, f, M, 3, u)) return -1;
						const b = u.r;
						let A = h[u.who];
						if (A < 0) {
							if (!_r(n, d, f, M - 1, 3, u)) return -1;
							A = h[u.who];
						}
						return A !== i && b <= l && b < .5 * x ? A : -1;
					});
				}(u, c, 0, i, a, f.inkRgb, y);
				return (g > 0 || m > 0) && lo(u, i, a, d, p), Dr(u, i, a).count > 65535 && fo(u, i, a, Wr), fx(u, i, a, f, yield* sx(u, c, i, a, f, y, d, n, r, null), y, r, !1);
			}(n, i.supersample, e, i.gradients, r, w?.clean), a = M.helpers ? await async function(t, n, e, r) {
				const o = /* @__PURE__ */ new Map();
				let s = 0;
				for (let i = r.next();;) {
					if (i.done) return i.value;
					const a = i.value;
					let l = o.get(a.source);
					void 0 === l && (l = `#${e}|bands${o.size}`, o.set(a.source, l), n.setBands(l, a.source));
					const c = `${l}#${s++}`;
					n.setBandBatch(l, c, a);
					const h = a.a.length, f = n.size, u = Sm(Array.from(a.work), f + 1).map((t) => 0 === t ? f : t - 1), y = new Array(h);
					await $x(t, n, {
						kind: "fit-bands",
						total: h,
						stateKey: c,
						owners: u,
						batch: jx
					}, (t) => y[t] = a.fit(t), (t) => y[t.unit] = t.fill, a.work, Bx), i = r.next(y);
				}
			}(t, M.helpers, M.serial, o) : function(t) {
				for (let n = t.next();;) {
					if (n.done) return n.value;
					const e = n.value, r = [];
					for (let t = 0; t < e.a.length; t++) r.push(e.fit(t));
					n = t.next(r);
				}
			}(o);
			({labels: F, paletteHex: I, paletteRgb: P, counts: C, sigmaNoise: T, gradients: L} = a), R = a.fillOpacity, z = a.inkHex, await t.tick(), t.stage("segment"), await t.tick(), b && void 0 !== k && (j = {
				labels: F,
				paletteHex: I,
				paletteRgb: P,
				counts: C,
				sigmaNoise: T,
				gradients: L,
				fillOpacity: R,
				inkHex: z
			}, Mx(m, k, j));
		} else if ("regions" === i.segmentation && null === i.palette) {
			b && xx(m).palMisses++;
			const a = function(t, n = {}) {
				const { width: o, height: s } = t, i = o * s, a = n.flatThreshold ?? .02, l = Math.max(1, n.scale ?? 1), h = n.mergeThreshold ?? .1, f = Math.min(1, Math.max(0, n.mergeSizeBias ?? 0)), y = Math.max(0, n.minRegionArea ?? 16), p = Math.max(0, n.maxRegions ?? 0), g = !0 === n.keepVisibleColors, m = n.mask?.data ?? null, x = H(t), M = Math.max(1, Math.round(l)), w = new Float32Array(i);
				for (let e = 0; e < s; e++) for (let t = 0; t < o; t++) {
					const n = e * o + t;
					if (t + M < o) {
						const t = n + M, e = _t(x, n, x[3 * t], x[3 * t + 1], x[3 * t + 2]);
						e > w[n] && (w[n] = e), e > w[t] && (w[t] = e);
					}
					if (e + M < s) {
						const t = n + M * o, e = _t(x, n, x[3 * t], x[3 * t + 1], x[3 * t + 2]);
						e > w[n] && (w[n] = e), e > w[t] && (w[t] = e);
					}
				}
				let b = 0, A = 0;
				for (let e = 0; e < i; e++) null !== m && 0 === m[e] || (b++, 0 === w[e] && A++);
				const k = b > 0 && A >= .85 * b ? .005 : .03, v = new Int32Array(i).fill(-1), F = new Int32Array(i);
				let I = 0, N = /* @__PURE__ */ new Float64Array(64), S = /* @__PURE__ */ new Float64Array(64), P = /* @__PURE__ */ new Float64Array(64), C = /* @__PURE__ */ new Float64Array(64);
				const U = (t) => {
					if (t < N.length) return;
					const n = 2 * N.length, e = new Float64Array(n);
					e.set(N), N = e;
					const r = new Float64Array(n);
					r.set(S), S = r;
					const o = new Float64Array(n);
					o.set(P), P = o;
					const s = new Float64Array(n);
					s.set(C), C = s;
				};
				for (let e = 0; e < i; e++) {
					if (-1 !== v[e] || null !== m && 0 === m[e] || w[e] >= a) continue;
					const t = I++;
					U(t);
					let n = 0;
					F[n++] = e, v[e] = t;
					let r = 0, s = 0, l = 0, c = 0;
					for (; n > 0;) {
						const e = F[--n];
						r += x[3 * e], s += x[3 * e + 1], l += x[3 * e + 2], c++;
						const h = e - (e / o | 0) * o;
						h > 0 && -1 === v[e - 1] && (null === m || 0 !== m[e - 1]) && w[e - 1] < a && (v[e - 1] = t, F[n++] = e - 1), h < o - 1 && -1 === v[e + 1] && (null === m || 0 !== m[e + 1]) && w[e + 1] < a && (v[e + 1] = t, F[n++] = e + 1), e >= o && -1 === v[e - o] && (null === m || 0 !== m[e - o]) && w[e - o] < a && (v[e - o] = t, F[n++] = e - o), e < i - o && -1 === v[e + o] && (null === m || 0 !== m[e + o]) && w[e + o] < a && (v[e + o] = t, F[n++] = e + o);
					}
					N[t] = r / c, S[t] = s / c, P[t] = l / c, C[t] = c;
				}
				if (0 === I) return function(t, n, e) {
					const { data: r } = t;
					let o = 0, s = 0, i = 0, a = 0;
					const l = {
						width: h = t.width,
						height: f = t.height,
						data: new Int32Array(h * f),
						count: 1
					};
					var h, f;
					for (let c = 0; c < e; c++) null === n || 0 !== n[c] ? (l.data[c] = 0, o += r[4 * c], s += r[4 * c + 1], i += r[4 * c + 2], a++) : l.data[c] = -1;
					const u = a > 0 ? Math.round(o / a) : 0, y = a > 0 ? Math.round(s / a) : 0, d = a > 0 ? Math.round(i / a) : 0;
					return {
						labels: l,
						paletteHex: [c(u, y, d)],
						paletteRgb: new Uint8Array([
							u,
							y,
							d
						]),
						counts: new Uint32Array([a])
					};
				}(t, m, i);
				for (const { coherence: e, diagonal: r } of Yt) {
					const t = Jt(x, v, o, s, i, m, N, S, P, I, Math.max(1, y), e, r, l);
					for (const n of t) {
						const t = I++;
						U(t), N[t] = n.mL, S[t] = n.mA, P[t] = n.mB, C[t] = n.size;
					}
				}
				Vt(x, v, o, i, m, N, S, P);
				const L = new Float64Array(I), $ = new Float64Array(I), q = new Float64Array(I), R = new Float64Array(I), z = new Float64Array(I), T = new Float64Array(I), E = new Int32Array(I), j = () => {
					C.fill(0, 0, I), L.fill(0), $.fill(0), q.fill(0), R.fill(0), z.fill(0), T.fill(0), E.fill(0);
					for (let t = 0; t < i; t++) {
						const n = v[t];
						n < 0 || (L[n] += x[3 * t], $[n] += x[3 * t + 1], q[n] += x[3 * t + 2], C[n]++, w[t] < a && (R[n] += x[3 * t], z[n] += x[3 * t + 1], T[n] += x[3 * t + 2], E[n]++));
					}
				};
				j();
				const B = new Uint8Array(I);
				for (let e = 0; e < I; e++) Qt(E[e], C[e], l * l) ? (N[e] = R[e] / E[e], S[e] = z[e] / E[e], P[e] = T[e] / E[e]) : C[e] > 0 && (N[e] = L[e] / C[e], S[e] = $[e] / C[e], P[e] = q[e] / C[e], B[e] = 1);
				const O = function(t, n, o, s, i, a, l, c, h, f, u) {
					const y = o * s, d = new Float64Array(3 * i), p = new Uint8Array(i), g = new Uint8Array(i), m = new Float64Array(i);
					for (let e = 0; e < y; e++) {
						const t = n[e];
						if (t < 0 || 0 === a[t]) continue;
						const r = e % o;
						0 !== r && n[e - 1] === t || m[t]++, r !== o - 1 && n[e + 1] === t || m[t]++, (e < o || n[e - o] !== t) && m[t]++, (e >= y - o || n[e + o] !== t) && m[t]++;
					}
					const x = new Uint8Array(i);
					let M = !1;
					for (let e = 0; e < i; e++) 0 !== a[e] && 0 !== l[e] && 2 * l[e] <= 6 * u * m[e] && (x[e] = 1, M = !0);
					if (!M) return {
						ink: d,
						unmixed: p,
						band: g
					};
					const w = new Int32Array(i + 1);
					for (let e = 0; e < y; e++) {
						const t = n[e];
						t >= 0 && 1 === x[t] && w[t + 1]++;
					}
					for (let e = 0; e < i; e++) w[e + 1] += w[e];
					const b = new Int32Array(w[i]), A = w.slice(0, i);
					for (let e = 0; e < y; e++) {
						const t = n[e];
						t >= 0 && 1 === x[t] && (b[A[t]++] = e);
					}
					const k = new Float64Array(3 * i);
					for (let e = 0; e < i; e++) {
						const [t, n, o] = r(c[e], h[e], f[e]);
						k[3 * e] = t, k[3 * e + 1] = n, k[3 * e + 2] = o;
					}
					const v = /* @__PURE__ */ new Float64Array(3), F = (t, n) => {
						n[0] = -2 === t ? 1 : k[3 * t], n[1] = -2 === t ? 1 : k[3 * t + 1], n[2] = -2 === t ? 1 : k[3 * t + 2];
					}, I = (t, n) => {
						const e = k[3 * t] - k[3 * n], r = k[3 * t + 1] - k[3 * n + 1], o = k[3 * t + 2] - k[3 * n + 2];
						return e * e + r * r + o * o < .1 * .1;
					}, N = Math.max(1, Math.round(6 * u)), S = new Int32Array(b.length), P = () => {
						for (let t = 0; t < i; t++) if (0 !== x[t]) for (let e = w[t]; e < w[t + 1]; e++) {
							const r = b[e], i = r % o, a = (r - i) / o;
							let l = 1 / 0, c = -1;
							for (const [e, h, f] of Wt) for (let r = 1; r <= N && r * f < l; r++) {
								const u = i + e * r, y = a + h * r;
								if (u < 0 || y < 0 || u >= o || y >= s) break;
								const d = n[y * o + u];
								if (!(d === t || d >= 0 && I(d, t))) {
									l = r * f, c = d < 0 ? -2 : d;
									break;
								}
							}
							S[e] = c;
						}
					}, C = new Float64Array(b.length), U = new Float64Array(b.length), L = /* @__PURE__ */ new Float64Array(7), $ = (n) => {
						const e = w[n], r = w[n + 1];
						let o = k[3 * n], s = k[3 * n + 1], i = k[3 * n + 2], a = 0;
						for (let f = 0; f < 3; f++) {
							let n = 0;
							for (let a = e; a < r; a++) {
								if (C[a] = NaN, -1 === S[a]) continue;
								F(S[a], v);
								const e = o - v[0], r = s - v[1], l = i - v[2], c = e * e + r * r + l * l;
								if (c < 1e-9) continue;
								const h = 4 * b[a];
								C[a] = ((t[h] / 255 - v[0]) * e + (t[h + 1] / 255 - v[1]) * r + (t[h + 2] / 255 - v[2]) * l) / c, U[n++] = C[a];
							}
							if (0 === n) return !1;
							const l = U.subarray(0, n).toSorted()[Math.min(n - 1, Math.floor(.75 * n))];
							a = l;
							let c = 0, h = 0, f = 0, u = 0;
							for (let o = e; o < r; o++) {
								if (!(C[o] >= l)) continue;
								const n = 4 * b[o];
								c += t[n], h += t[n + 1], f += t[n + 2], u++;
							}
							o = c / u / 255, s = h / u / 255, i = f / u / 255;
						}
						let l = 0, c = 0, h = 0;
						for (let f = e; f < r; f++) {
							if (-1 === S[f]) continue;
							F(S[f], v);
							const n = o - v[0], e = s - v[1], r = i - v[2], a = n * n + e * e + r * r;
							c += a;
							const u = 4 * b[f], y = t[u] / 255 - v[0], d = t[u + 1] / 255 - v[1], p = t[u + 2] / 255 - v[2], g = a < 1e-9 ? 0 : Math.min(1, Math.max(0, (y * n + d * e + p * r) / a)), m = y - g * n, x = d - g * e, M = p - g * r;
							l += m * m + x * x + M * M, U[h++] = g;
						}
						return L[0] = o, L[1] = s, L[2] = i, L[3] = Math.sqrt(l / h), L[4] = Math.sqrt(c / h), L[5] = U.subarray(0, h).toSorted()[h - 1 >> 1], L[6] = a, !0;
					};
					P();
					const q = new Float64Array(3 * i), R = new Uint8Array(i);
					for (let e = 0; e < i; e++) 0 !== x[e] && $(e) && (q[3 * e] = L[0], q[3 * e + 1] = L[1], q[3 * e + 2] = L[2], R[e] = 1);
					for (let e = 0; e < i; e++) 0 !== R[e] && (k[3 * e] = q[3 * e], k[3 * e + 1] = q[3 * e + 1], k[3 * e + 2] = q[3 * e + 2]);
					P();
					const z = new Float64Array(b.length), T = (n, e, r) => {
						const o = e[0];
						let s = 1;
						for (; s < e.length && I(e[s], o);) s++;
						if (s === e.length) return !1;
						const i = e[s];
						let a = 0, l = 0;
						for (let t = 0; t < e.length; t++) I(e[t], o) ? a += r[t] : I(e[t], i) && (l += r[t]);
						if (Math.min(a, l) < .25 * (a + l)) return !1;
						const c = k[3 * o], h = k[3 * o + 1], f = k[3 * o + 2], u = k[3 * i] - c, y = k[3 * i + 1] - h, d = k[3 * i + 2] - f, p = u * u + y * y + d * d, g = .2 * .2 * p, m = w[n], x = w[n + 1];
						let M = 0;
						for (let w = m; w < x; w++) {
							const n = 4 * b[w], e = t[n] / 255 - c, r = t[n + 1] / 255 - h, o = t[n + 2] / 255 - f, s = (e * u + r * y + o * d) / p;
							z[w - m] = s;
							const i = e - s * u, a = r - s * y, l = o - s * d;
							s >= 0 && s <= 1 && i * i + a * a + l * l <= g && M++;
						}
						const A = x - m;
						if (M < .7 * A) return !1;
						const v = z.subarray(0, A).toSorted(), F = v[Math.floor(.5 * (A - 1))], N = v[Math.floor(.8 * (A - 1))] - v[Math.floor(.2 * (A - 1))];
						return F >= .1 && F <= .9 && N >= .2;
					}, E = (t, n, r, o) => {
						const s = Math.max(r.length > 0 ? r[0] : 0, o), i = [];
						for (let h = 0; h < Math.min(n.length, 4) && !(r[h] < .25 * s); h++) {
							const t = n[h];
							i.push(e(k[3 * t], k[3 * t + 1], k[3 * t + 2]));
						}
						if (o >= .25 * s && i.push(e(1, 1, 1)), 0 === i.length) return !0;
						let a = !0;
						for (let e = 0; e < i.length && a; e++) for (let t = e + 1; t < i.length; t++) if (Gt(i[e], i[t]) >= .1) {
							a = !1;
							break;
						}
						const l = a ? .125 : .25, c = e(t[0], t[1], t[2]);
						for (const e of i) if (Gt(c, e) < l) return !1;
						return !0;
					}, j = /* @__PURE__ */ new Float64Array(15), B = (t, n) => Math.min(1 === n ? Math.hypot(t[0] - j[0], t[1] - j[1], t[2] - j[2]) : Dt(t, j, n), Ht(t, j, n)), O = /* @__PURE__ */ new Float64Array(3), K = (n, e) => {
						let r = 0, o = 0, s = 0;
						for (let a = w[n]; a < w[n + 1]; a++) {
							if (!(C[a] >= L[6])) continue;
							const n = 4 * b[a];
							O[0] = t[n] / 255, O[1] = t[n + 1] / 255, O[2] = t[n + 2] / 255;
							const i = B(O, e);
							r += i, o += i * i, s++;
						}
						const i = r / s;
						return Math.sqrt(Math.max(0, o / s - i * i) / s);
					}, D = new Int32Array(i), H = new Int32Array(i), X = /* @__PURE__ */ new Float64Array(3);
					for (let r = 0; r < i; r++) {
						if (0 === x[r]) continue;
						const t = $(r) && L[3] <= .1 * L[4];
						let n = 0, o = !1, s = 0;
						for (let e = w[r]; e < w[r + 1]; e++) {
							const t = S[e];
							-1 !== t && (-2 !== t ? 0 === D[t]++ && (H[n++] = t) : (o = !0, s++));
						}
						const i = Array.from(H.subarray(0, n)).toSorted((t, n) => D[n] - D[t] || t - n), a = i.map((t) => D[t]);
						for (let e = 0; e < n; e++) D[H[e]] = 0;
						let l = !1;
						if (t) {
							let t = 0;
							for (let r = 0; r < Math.min(n, 4); r++) j[3 * t] = k[3 * i[r]], j[3 * t + 1] = k[3 * i[r] + 1], j[3 * t + 2] = k[3 * i[r] + 2], t++;
							o && (j[3 * t] = 1, j[3 * t + 1] = 1, j[3 * t + 2] = 1, t++), X[0] = L[0], X[1] = L[1], X[2] = L[2];
							const e = B(X, t);
							l = e > Kt, l && e < 1 / 0 && L[5] < .5 && (l = e - Kt > K(r, t)), l && (l = E(L, i, a, s));
						}
						if (l) {
							const [t, n, o] = e(L[0], L[1], L[2]);
							d[3 * r] = t, d[3 * r + 1] = n, d[3 * r + 2] = o, p[r] = 1;
						} else n >= 2 && T(r, i, a) && (g[r] = 1);
					}
					return {
						ink: d,
						unmixed: p,
						band: g
					};
				}(t.data, v, o, s, I, B, C, N, S, P, l);
				for (let e = 0; e < I; e++) 0 !== O.unmixed[e] && (N[e] = O.ink[3 * e], S[e] = O.ink[3 * e + 1], P[e] = O.ink[3 * e + 2]);
				let K = !1;
				for (let e = 0; e < i; e++) {
					const t = v[e];
					t >= 0 && 1 === O.band[t] && (v[e] = -1, K = !0);
				}
				K && (Vt(x, v, o, i, m, N, S, P), j());
				const D = Float64Array.from(L), X = Float64Array.from($), W = Float64Array.from(q), G = new Uint8Array(I);
				for (let e = 0; e < I; e++) 0 !== C[e] && (Qt(E[e], C[e], l * l) ? (N[e] = R[e] / E[e], S[e] = z[e] / E[e], P[e] = T[e] / E[e]) : 1 === O.unmixed[e] ? (N[e] = O.ink[3 * e], S[e] = O.ink[3 * e + 1], P[e] = O.ink[3 * e + 2], D[e] = N[e] * C[e], X[e] = S[e] * C[e], W[e] = P[e] * C[e]) : (N[e] = L[e] / C[e], S[e] = $[e] / C[e], P[e] = q[e] / C[e], G[e] = 1));
				const Z = new Uint8Array(I), Q = new Float64Array(3 * I);
				if (f > 0) {
					const n = (.5 * f * l / k) ** 2, e = new Uint8Array(I);
					let i = !1;
					for (let t = 0; t < I; t++) C[t] >= Math.max(1, y) && C[t] <= n && (e[t] = 1, i = !0);
					if (i) {
						const n = new Float64Array(3 * I);
						for (let t = 0; t < I; t++) {
							const [e, o, s] = r(N[t], S[t], P[t]);
							n[3 * t] = e, n[3 * t + 1] = o, n[3 * t + 2] = s;
						}
						const i = function(t, n, e, r, o, s, i) {
							const a = e * r, l = s.length, c = new Float64Array(l), h = new Float64Array(l), f = new Float64Array(3 * l), u = new Int32Array(Xt.length), y = new Int32Array(Xt.length), d = /* @__PURE__ */ new Float64Array(15), p = /* @__PURE__ */ new Float64Array(3);
							for (let x = 0; x < a; x++) {
								const i = n[x];
								if (i < 0 || 0 === s[i]) continue;
								h[i]++;
								const a = t[4 * x] / 255 - o[3 * i], l = t[4 * x + 1] / 255 - o[3 * i + 1], g = t[4 * x + 2] / 255 - o[3 * i + 2];
								if (a * a + l * l + g * g > .05 * .05) continue;
								const m = x / e | 0, M = x - m * e;
								let w = 0, b = !1;
								for (const [t, o] of Xt) {
									const s = M + t, a = m + o;
									if (s < 0 || a < 0 || s >= e || a >= r) continue;
									const l = n[a * e + s];
									if (l === i) continue;
									if (l < 0) {
										b = !0;
										continue;
									}
									let c = !1;
									for (let t = 0; t < w; t++) if (u[t] === l) {
										y[t]++, c = !0;
										break;
									}
									c || (u[w] = l, y[w] = 1, w++);
								}
								for (let t = 1; t < w; t++) {
									const n = u[t], e = y[t];
									let r = t - 1;
									for (; r >= 0 && (y[r] < e || y[r] === e && u[r] > n);) u[r + 1] = u[r], y[r + 1] = y[r], r--;
									u[r + 1] = n, y[r + 1] = e;
								}
								const A = Math.min(w, 4);
								for (let t = 0; t < A; t++) d[3 * t] = o[3 * u[t]], d[3 * t + 1] = o[3 * u[t] + 1], d[3 * t + 2] = o[3 * u[t] + 2];
								let k, v = A;
								b && (d[3 * v] = 1, d[3 * v + 1] = 1, d[3 * v + 2] = 1, v++), p[0] = t[4 * x] / 255, p[1] = t[4 * x + 1] / 255, p[2] = t[4 * x + 2] / 255, k = 0 === v ? 1 / 0 : 1 === v ? Math.hypot(p[0] - d[0], p[1] - d[1], p[2] - d[2]) : Dt(p, d, v), k > .025 && Ht(p, d, v) > .025 && (c[i]++, f[3 * i] += p[0], f[3 * i + 1] += p[1], f[3 * i + 2] += p[2]);
							}
							const g = i * i, m = new Uint8Array(l);
							for (let x = 0; x < l; x++) {
								c[x] > 0 && (f[3 * x] /= c[x], f[3 * x + 1] /= c[x], f[3 * x + 2] /= c[x]);
								const t = c[x] / g;
								t >= Math.max(8, .00048828125 * a / g) ? m[x] = 1 : t >= Math.max(8, .5 * h[x] / g) && (m[x] = 2);
							}
							return {
								represented: m,
								evidence: f
							};
						}(t.data, v, o, s, n, e, l);
						Z.set(i.represented);
						for (let t = 0; t < I; t++) {
							if (0 === Z[t]) continue;
							const [n, e, r] = u(i.evidence[3 * t], i.evidence[3 * t + 1], i.evidence[3 * t + 2]);
							Q[3 * t] = n, Q[3 * t + 1] = e, Q[3 * t + 2] = r;
						}
					}
				}
				const Y = function(t, n, e, o, s, i, a, l, c, h, f, y, p, g, m, x, M, w, b, A, k, v, F, I, N, S, P, C) {
					const U = new Int32Array(o);
					for (let r = 0; r < o; r++) U[r] = r;
					const L = (t) => {
						let n = t;
						for (; U[n] !== n;) n = U[n];
						for (; U[t] !== n;) {
							const e = U[t];
							U[t] = n, t = e;
						}
						return n;
					}, $ = (t, n) => {
						const e = s[t] - s[n], r = i[t] - i[n], o = a[t] - a[n];
						return Math.sqrt(e * e + r * r + o * o);
					}, q = (t, n) => {
						const e = 0 === y[t] && 0 === y[n], r = e ? c[t] / l[t] - c[n] / l[n] : p[t] / l[t] - p[n] / l[n], o = e ? h[t] / l[t] - h[n] / l[n] : g[t] / l[t] - g[n] / l[n], s = e ? f[t] / l[t] - f[n] / l[n] : m[t] / l[t] - m[n] / l[n];
						return Math.sqrt(r * r + o * o + s * s);
					}, R = (t, n) => F <= 0 ? v : I + .5 * F * C * (1 / Math.sqrt(l[t]) + 1 / Math.sqrt(l[n])), z = /* @__PURE__ */ new Float64Array(3), T = (t, n) => {
						const e = l[t] + l[n], r = b[t] + b[n];
						Qt(r, e, C * C) ? (z[0] = (x[t] + x[n]) / r, z[1] = (M[t] + M[n]) / r, z[2] = (w[t] + w[n]) / r) : (z[0] = (c[t] + c[n]) / e, z[1] = (h[t] + h[n]) / e, z[2] = (f[t] + f[n]) / e);
					}, E = (t, n) => {
						const e = l[t] >= l[n] ? t : n;
						return T(t, n), tn(s[e], i[e], a[e], z[0], z[1], z[2]) >= Zt;
					}, j = (t, n) => {
						const e = l[t] >= l[n] ? t : n, r = e === t ? n : t, o = l[t] + l[n];
						o > 0 && (T(e, r), s[e] = z[0], i[e] = z[1], a[e] = z[2]), p[e] += p[r], g[e] += g[r], m[e] += m[r], c[e] += c[r], h[e] += h[r], f[e] += f[r], y[e] &= y[r], x[e] += x[r], M[e] += M[r], w[e] += w[r], b[e] += b[r], l[e] = o, U[r] = e, A[r] > 0 && (0 === A[e] || A[r] < A[e]) && (A[e] = A[r], k[3 * e] = k[3 * r], k[3 * e + 1] = k[3 * r + 1], k[3 * e + 2] = k[3 * r + 2]);
					}, B = (t, n) => tn(s[t], i[t], a[t], s[n], i[n], a[n]), O = (t, n) => {
						const [e, o, l] = r(s[n], i[n], a[n]), [c, h, f] = u(e, o, l);
						return d(k[3 * t], k[3 * t + 1], k[3 * t + 2], c, h, f);
					}, K = (t, n, e) => {
						const r = l[t] <= l[n] ? t : n, o = r === t ? n : t;
						return A[r] > 0 && l[t] >= N && l[n] >= N && e >= I && O(r, o) >= (1 === A[r] ? Zt : 10);
					}, D = () => {
						const r = /* @__PURE__ */ new Set(), s = [];
						for (let i = 0; i < e; i++) for (let a = 0; a < n; a++) {
							const l = i * n + a, c = t[l];
							if (c < 0) continue;
							const h = L(c);
							if (a + 1 < n) {
								const n = t[l + 1];
								if (n >= 0) {
									const t = L(n);
									if (h !== t) {
										const n = h < t ? h * o + t : t * o + h;
										r.has(n) || (r.add(n), s.push(h < t ? [h, t] : [t, h]));
									}
								}
							}
							if (i + 1 < e) {
								const e = t[l + n];
								if (e >= 0) {
									const t = L(e);
									if (h !== t) {
										const n = h < t ? h * o + t : t * o + h;
										r.has(n) || (r.add(n), s.push(h < t ? [h, t] : [t, h]));
									}
								}
							}
						}
						return s;
					};
					let H = 0;
					for (let r = 0; r < o; r++) l[r] > 0 && H++;
					for (let r = 0; r < 64; r++) {
						const t = D().map(([t, n]) => [
							t,
							n,
							q(t, n)
						]).toSorted((t, n) => t[2] - n[2] || t[0] - n[0] || t[1] - n[1]);
						let n = !1;
						for (const [e, r, o] of t) {
							const t = L(e), s = L(r);
							if (t === s) continue;
							const i = R(t, s), a = l[t] < N || l[s] < N;
							(o < i || a) && !K(t, s, o) && (!a && q(t, s) >= i && E(t, s) || (j(t, s), H--, n = !0));
						}
						if (!n) break;
					}
					const X = F > 0 ? I : v, W = [];
					for (let r = 0; r < o; r++) L(r) === r && l[r] > 0 && W.push(r);
					W.sort((t, n) => l[n] - l[t] || t - n);
					const G = [];
					for (const r of W) {
						let t = -1;
						for (const n of G) if ($(r, n) < X || B(r, n) < Zt || A[r] > 0 && O(r, n) < Zt) {
							t = n;
							break;
						}
						-1 === t ? G.push(r) : (j(t, r), H--);
					}
					if (S > 0 && H > S) {
						const t = [];
						for (let h = 0; h < o; h++) L(h) === h && l[h] > 0 && t.push(h);
						const n = new Uint8Array(o);
						for (const o of t) n[o] = 1;
						const e = new Int32Array(o).fill(-1), r = new Float64Array(o).fill(1 / 0), s = 16 * C * C, i = Math.max(S, Math.min(2 * S, 64)), a = (t, n) => {
							const e = $(t, n);
							return l[t] * l[n] / (l[t] + l[n]) * e * e;
						}, c = (o) => {
							let s = -1, i = 1 / 0;
							for (const e of t) {
								if (e === o || 0 === n[e]) continue;
								const t = a(o, e);
								(t < i || t === i && e < s) && (i = t, s = e);
							}
							e[o] = s, r[o] = i;
						};
						for (const o of t) c(o);
						for (; H > S;) {
							let o = -1;
							for (const s of t) 0 === n[s] || e[s] < 0 || (-1 === o || r[s] < r[o]) && (o = s);
							if (-1 === o) break;
							const h = e[o];
							if (P && H <= i && l[o] >= s && l[h] >= s && B(o, h) >= 10) break;
							j(o, h), H--;
							const f = L(o), u = f === o ? h : o;
							n[u] = 0, c(f);
							for (const s of t) if (0 !== n[s] && s !== f) if (e[s] === f || e[s] === u) c(s);
							else {
								const t = a(s, f);
								(t < r[s] || t === r[s] && f < e[s]) && (e[s] = f, r[s] = t);
							}
						}
					}
					for (let r = 0; r < o; r++) U[r] = L(r);
					return U;
				}(v, o, s, I, N, S, P, C, D, X, W, G, L, $, q, R, z, T, E, Z, Q, h, f, k, y, p, g, l), _ = new Int32Array(I).fill(-1);
				let V = 0;
				const J = new Int32Array(i);
				for (let e = 0; e < i; e++) {
					const t = v[e];
					if (t < 0) {
						J[e] = -1;
						continue;
					}
					const n = Y[t];
					let r = _[n];
					-1 === r && (r = V++, _[n] = r), J[e] = r;
				}
				const tt = {
					width: o,
					height: s,
					data: J,
					count: V
				}, nt = new Uint8Array(3 * V), et = new Array(V), rt = new Uint32Array(V);
				for (let e = 0; e < I; e++) {
					const t = _[Y[e]];
					if (t < 0 || void 0 !== et[t]) continue;
					const [n, o, s] = r(N[Y[e]], S[Y[e]], P[Y[e]]), i = Math.round(255 * n), a = Math.round(255 * o), l = Math.round(255 * s);
					nt[3 * t] = i, nt[3 * t + 1] = a, nt[3 * t + 2] = l, et[t] = c(i, a, l);
				}
				(function(t, n, e, r = 1) {
					const { width: o, height: s, data: i } = n, a = o * s;
					if (n.count < 3 || 0 === a) return 0;
					const l = t.data, c = Math.max(2, Math.round(2 * r)), h = new Int32Array(a).fill(-1), f = new Float64Array(c), u = (t, n, r, o) => {
						const s = 4 * t, { t: i, resid2: a } = qt(l[s], l[s + 1], l[s + 2], e[3 * n], e[3 * n + 1], e[3 * n + 2], e[3 * r], e[3 * r + 1], e[3 * r + 2]);
						if (i < $t || i > .9 || a > 144) return -1;
						const c = l[s] - e[3 * o], h = l[s + 1] - e[3 * o + 1], f = l[s + 2] - e[3 * o + 2];
						return c * c + h * h + f * f >= 1296 ? i : -1;
					}, y = (t, n, r) => qt(e[3 * r], e[3 * r + 1], e[3 * r + 2], e[3 * t], e[3 * t + 1], e[3 * t + 2], e[3 * n], e[3 * n + 1], e[3 * n + 2]).resid2 >= 1296;
					for (const [d, p, g] of [[
						1,
						o,
						s
					], [
						o,
						s,
						o
					]]) for (let t = 0; t < g; t++) {
						const n = 1 === d ? t * o : t;
						for (let t = 1; t + 1 < p; t++) {
							const e = n + t * d, r = i[e], o = i[e - d];
							if (!(r < 0 || o < 0 || o === r)) for (let n = 1; n <= c && t + n < p; n++) {
								const t = e + (n - 1) * d;
								if (i[t] !== r) break;
								const s = i[t + d];
								if (s === r) continue;
								if (s < 0 || s === o || !y(o, s, r)) break;
								let a = !0;
								for (let i = 0; i < n && a; i++) f[i] = u(e + i * d, o, s, r), a = f[i] >= 0;
								if (!a) break;
								let l = 0;
								for (let e = 0; e < n; e++) l += f[e];
								const c = Math.round(l);
								for (let r = 0; r < n; r++) {
									const t = e + r * d;
									h[t] < 0 && (h[t] = r < c ? o : s);
								}
								break;
							}
						}
					}
					for (let d = 0; d < a; d++) h[d] < 0 || (i[d] = h[d]);
				})(t, tt, nt, l), function(t, n, e, r, o, s = 1) {
					let i = 0;
					for (let a = 0; a < 2; a++) {
						const a = Rt(t, n, e, r, o, s);
						if (0 === a) break;
						i += a;
					}
				}(t, tt, nt, w, a, l);
				for (let e = 0; e < i; e++) J[e] >= 0 && rt[J[e]]++;
				return function(t) {
					const { labels: n, paletteHex: e, paletteRgb: r, counts: o } = t;
					if (!o.includes(0)) return t;
					const s = new Int32Array(n.count).fill(-1);
					let i = 0;
					for (let f = 0; f < n.count; f++) o[f] > 0 && (s[f] = i++);
					const a = n.data;
					for (let f = 0; f < a.length; f++) a[f] >= 0 && (a[f] = s[a[f]]);
					const l = new Array(i), c = new Uint8Array(3 * i), h = new Uint32Array(i);
					for (let f = 0; f < n.count; f++) {
						const t = s[f];
						t < 0 || (l[t] = e[f], c.set(r.subarray(3 * f, 3 * f + 3), 3 * t), h[t] = o[f]);
					}
					return {
						labels: {
							width: n.width,
							height: n.height,
							data: a,
							count: i
						},
						paletteHex: l,
						paletteRgb: c,
						counts: h
					};
				}({
					labels: tt,
					paletteHex: et,
					paletteRgb: nt,
					counts: rt
				});
			}(n, {
				mergeThreshold: .1,
				mergeSizeBias: .8,
				minRegionArea: i.minRegionArea,
				maxRegions: i.paletteSize,
				keepVisibleColors: i.autoPaletteSize && "stacked" === i.layering && !i.groupByColor,
				mask: o,
				scale: i.supersample
			});
			await t.tick(), t.stage("segment"), await t.tick(), F = a.labels, I = a.paletteHex, P = a.paletteRgb, C = a.counts;
			const l = i.omitBackground ? nM(n, I) : -1;
			if (l >= 0) {
				const t = on(F, l);
				C[l] = Math.max(0, C[l] - t);
			}
			const h = Qx(n, F, I, P, s, i);
			h && ({labels: F, paletteHex: I, paletteRgb: P} = h, L = h.gradients, q = h.underlays, C = Yx(F));
			{
				const t = Jx(n, F, s, I.length, L, i.supersample ** 2);
				R = t?.opacity, z = t?.inkHex;
			}
			b && void 0 !== k && (j = {
				labels: F,
				paletteHex: I,
				paletteRgb: P,
				counts: C,
				paletteClampedTo: U,
				gradients: L,
				underlays: q,
				fillOpacity: R,
				inkHex: z
			}, Mx(m, k, j));
		} else {
			b && xx(m).palMisses++;
			const l = function(t, n, e = 1) {
				const { width: r, height: o, data: s } = t, i = new Uint8Array(r * o), a = (t, n) => Math.abs(s[t] - s[n]) + Math.abs(s[t + 1] - s[n + 1]) + Math.abs(s[t + 2] - s[n + 2]), l = 4 * e, c = e * r * 4;
				for (let h = 0; h < o; h++) for (let t = 0; t < r; t++) {
					const s = h * r + t, f = 4 * s;
					let u = !1;
					(t + e < r && a(f, f + l) >= n || t >= e && a(f, f - l) >= n || h + e < o && a(f, f + c) >= n || h >= e && a(f, f - c) >= n) && (u = !0), i[s] = u ? 1 : 0;
				}
				return {
					width: r,
					height: o,
					data: i
				};
			}(n, 40, i.supersample), h = {
				width: n.width,
				height: n.height,
				data: new Uint8Array(n.width * n.height)
			};
			for (let t = 0; t < h.data.length; t++) h.data[t] = 0 === l.data[t] ? 1 : 0;
			const y = function(t, n) {
				const { width: o, height: s, data: i } = t, l = o * s, h = N(n.k, 2, 64), f = N(n.quality, 1, 10), y = n.mask ? n.mask.data : null, p = "oklab" === n.colorSpace, g = new Int32Array(l), m = n.fixedPalette;
				if (null != m && m.length > 0) {
					const n = [];
					for (const t of m) {
						const e = a(t);
						null !== e && n.push(e);
					}
					if (n.length > 0) {
						const r = n.length, a = new Float32Array(3 * r), h = new Uint8Array(3 * r), f = [];
						for (let t = 0; t < r; t++) {
							const [r, o, s] = n[t];
							if (h[3 * t] = r, h[3 * t + 1] = o, h[3 * t + 2] = s, f.push(c(r, o, s)), p) {
								const [n, i, l] = e(r / 255, o / 255, s / 255);
								a[3 * t] = n, a[3 * t + 1] = i, a[3 * t + 2] = l;
							} else a[3 * t] = r / 255, a[3 * t + 1] = o / 255, a[3 * t + 2] = s / 255;
						}
						return {
							labels: {
								width: o,
								height: s,
								data: g,
								count: r
							},
							paletteHex: f,
							paletteRgb: h,
							counts: jt(g, a, r, i, p ? H(t) : null, y, l, null, !1)
						};
					}
				}
				const x = /* @__PURE__ */ new Map();
				let M = 0, w = !1;
				for (let e = 0, r = 0; e < l; e++, r += 4) {
					if (null !== y) {
						if (0 === y[e]) continue;
						M++;
					}
					if (w) continue;
					const t = i[r] << 16 | i[r + 1] << 8 | i[r + 2], n = x.get(t);
					if (void 0 === n) {
						if (x.size === h) {
							if (w = !0, x.clear(), null === y) break;
							continue;
						}
						x.set(t, 1);
					} else x.set(t, n + 1);
				}
				if (null === y && (M = l), 0 === M) return g.fill(-1), {
					labels: {
						width: o,
						height: s,
						data: g,
						count: 0
					},
					paletteHex: [],
					paletteRgb: /* @__PURE__ */ new Uint8Array(0),
					counts: /* @__PURE__ */ new Uint32Array(0)
				};
				if (!w) {
					const t = x.size, n = new Int32Array(t), e = new Uint32Array(t), r = /* @__PURE__ */ new Map();
					let a = 0;
					for (const [o, s] of x) n[a] = o, e[a] = s, r.set(o, a), a++;
					const h = Bt(e, t), f = new Int32Array(t), u = new Uint8Array(3 * t), d = [], p = new Uint32Array(t);
					for (let o = 0; o < t; o++) {
						const t = h[o];
						f[t] = o;
						const r = n[t], s = r >> 16 & 255, i = r >> 8 & 255, a = 255 & r;
						u[3 * o] = s, u[3 * o + 1] = i, u[3 * o + 2] = a, d.push(c(s, i, a)), p[o] = e[t];
					}
					for (let o = 0, s = 0; o < l; o++, s += 4) {
						if (null !== y && 0 === y[o]) {
							g[o] = -1;
							continue;
						}
						const t = i[s] << 16 | i[s + 1] << 8 | i[s + 2];
						g[o] = f[r.get(t)];
					}
					return {
						labels: {
							width: o,
							height: s,
							data: g,
							count: t
						},
						paletteHex: d,
						paletteRgb: u,
						counts: p
					};
				}
				const b = p ? H(t) : null, A = function(t) {
					let n = t >>> 0;
					return () => {
						n = n + 1831565813 | 0;
						let t = Math.imul(n ^ n >>> 15, 1 | n);
						return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
					};
				}(n.seed), k = n.sampleMask ? n.sampleMask.data : null;
				let v = null, F = M;
				if (null !== k) {
					let t = 0;
					for (let n = 0; n < l; n++) null !== y && 0 === y[n] || 0 === k[n] || t++;
					if (t >= Math.max(h, 256)) {
						const n = new Int32Array(t);
						let e = 0;
						for (let t = 0; t < l; t++) null !== y && 0 === y[t] || 0 === k[t] || (n[e++] = t);
						v = n, F = t;
					}
				}
				const I = Math.min(F, 2e4 + 2e4 * f), S = new Int32Array(I);
				if (null !== v) if (F <= I) for (let e = 0; e < F; e++) S[e] = v[e];
				else for (let e = 0; e < I; e++) S[e] = v[A() * F | 0];
				else if (M <= I) {
					let t = 0;
					for (let n = 0; n < l; n++) null !== y && 0 === y[n] || (S[t++] = n);
				} else if (null === y) for (let e = 0; e < I; e++) S[e] = A() * l | 0;
				else {
					const t = new Int32Array(M);
					let n = 0;
					for (let e = 0; e < l; e++) 0 !== y[e] && (t[n++] = e);
					for (let e = 0; e < I; e++) S[e] = t[A() * M | 0];
				}
				const P = new Float32Array(3 * I);
				if (null !== b) for (let e = 0, r = 0; e < I; e++, r += 3) {
					const t = 3 * S[e];
					P[r] = b[t], P[r + 1] = b[t + 1], P[r + 2] = b[t + 2];
				}
				else for (let e = 0, r = 0; e < I; e++, r += 3) {
					const t = 4 * S[e];
					P[r] = i[t] / 255, P[r + 1] = i[t + 1] / 255, P[r + 2] = i[t + 2] / 255;
				}
				const C = new Float32Array(3 * h), U = new Float64Array(I).fill(1 / 0), L = 3 * (A() * I | 0);
				C[0] = P[L], C[1] = P[L + 1], C[2] = P[L + 2];
				for (let e = 1; e < h; e++) {
					const t = C[3 * (e - 1)], n = C[3 * (e - 1) + 1], r = C[3 * (e - 1) + 2];
					let o = 0;
					for (let e = 0, i = 0; e < I; e++, i += 3) {
						const s = P[i] - t, a = P[i + 1] - n, l = P[i + 2] - r, c = s * s + a * a + l * l;
						c < U[e] && (U[e] = c), o += U[e];
					}
					let s = I - 1;
					if (o > 0) {
						const t = A() * o;
						let n = 0;
						for (let e = 0; e < I; e++) if (n += U[e], n >= t) {
							s = e;
							break;
						}
					} else s = A() * I | 0;
					C[3 * e] = P[3 * s], C[3 * e + 1] = P[3 * s + 1], C[3 * e + 2] = P[3 * s + 2];
				}
				const $ = 8 + 3 * f, q = new Float64Array(3 * h), R = new Uint32Array(h);
				for (let e = 0; e < $; e++) {
					q.fill(0), R.fill(0);
					for (let n = 0, e = 0; n < I; n++, e += 3) {
						const t = P[e], n = P[e + 1], r = P[e + 2];
						let o = 0, s = 1 / 0;
						for (let e = 0, a = 0; e < h; e++, a += 3) {
							const i = t - C[a], l = n - C[a + 1], c = r - C[a + 2], h = i * i + l * l + c * c;
							h < s && (s = h, o = e);
						}
						const i = 3 * o;
						q[i] += t, q[i + 1] += n, q[i + 2] += r, R[o]++;
					}
					let t = 0;
					for (let n = 0, e = 0; n < h; n++, e += 3) {
						if (0 === R[n]) continue;
						const r = 1 / R[n], o = q[e] * r, s = q[e + 1] * r, i = q[e + 2] * r, a = o - C[e], l = s - C[e + 1], c = i - C[e + 2], h = Math.sqrt(a * a + l * l + c * c);
						h > t && (t = h), C[e] = o, C[e + 1] = s, C[e + 2] = i;
					}
					if (t < 1e-4) break;
				}
				null !== v && null !== k && function(t, n, e, o, s, i, a, l) {
					let c = 0;
					for (let r = 0; r < l; r++) null !== i && 0 === i[r] || c++;
					const h = Math.max(16, .001 * c), f = (t, n) => {
						null !== s ? (n[0] = s[3 * t], n[1] = s[3 * t + 1], n[2] = s[3 * t + 2]) : (n[0] = o[4 * t] / 255, n[1] = o[4 * t + 1] / 255, n[2] = o[4 * t + 2] / 255);
					}, u = /* @__PURE__ */ new Float64Array(3), y = new Uint8Array(n);
					for (let r = 0; r < n; r++) y[r] = e[r] > 0 ? 1 : 0;
					let d = 0;
					const p = [
						0,
						0,
						0
					];
					if (null !== i) for (let r = 0; r < l; r++) 0 === i[r] && (p[0] += o[4 * r], p[1] += o[4 * r + 1], p[2] += o[4 * r + 2], d++);
					for (let g = 0; g < 4; g++) {
						const c = new Float64Array(3 * n);
						for (let e = 0; e < n; e++) if (null !== s) {
							const [n, o, s] = r(t[3 * e], t[3 * e + 1], t[3 * e + 2]);
							c[3 * e] = n, c[3 * e + 1] = o, c[3 * e + 2] = s;
						} else c[3 * e] = t[3 * e], c[3 * e + 1] = t[3 * e + 1], c[3 * e + 2] = t[3 * e + 2];
						const g = [];
						for (let t = 0; t < n; t++) y[t] && g.push(t);
						const m = [];
						for (const t of g) m.push(c[3 * t], c[3 * t + 1], c[3 * t + 2]);
						d > 0 && m.push(p[0] / d / 255, p[1] / d / 255, p[2] / d / 255);
						const x = m.length / 3, M = [], w = [];
						for (let n = 0; n < l; n++) {
							if (0 !== a[n] || null !== i && 0 === i[n]) continue;
							f(n, u);
							let e = 1 / 0;
							for (const n of g) {
								const r = u[0] - t[3 * n], o = u[1] - t[3 * n + 1], s = u[2] - t[3 * n + 2], i = r * r + o * o + s * s;
								i < e && (e = i);
							}
							if (e <= .0225) continue;
							const r = o[4 * n] / 255, s = o[4 * n + 1] / 255, l = o[4 * n + 2] / 255;
							let c = !1;
							for (let t = 0; t < x && !c; t++) for (let n = t + 1; n < x; n++) {
								const e = m[3 * n] - m[3 * t], o = m[3 * n + 1] - m[3 * t + 1], i = m[3 * n + 2] - m[3 * t + 2], a = e * e + o * o + i * i;
								if (a < 1e-9) continue;
								let h = ((r - m[3 * t]) * e + (s - m[3 * t + 1]) * o + (l - m[3 * t + 2]) * i) / a;
								h = h < 0 ? 0 : h > 1 ? 1 : h;
								const f = r - m[3 * t] - h * e, u = s - m[3 * t + 1] - h * o, y = l - m[3 * t + 2] - h * i;
								if (f * f + u * u + y * y < .0036) {
									c = !0;
									break;
								}
							}
							c || (M.push(n), w.push(e));
						}
						if (M.length < h) return;
						let b = -1;
						for (let t = 0; t < n; t++) if (!y[t]) {
							b = t;
							break;
						}
						if (b < 0) {
							let n = .0036;
							for (let r = 0; r < g.length; r++) for (let o = r + 1; o < g.length; o++) {
								const s = g[r], i = g[o], a = t[3 * s] - t[3 * i], l = t[3 * s + 1] - t[3 * i + 1], c = t[3 * s + 2] - t[3 * i + 2], h = a * a + l * l + c * c;
								h < n && (n = h, b = e[s] < e[i] ? s : i);
							}
						}
						if (b < 0) return;
						const A = M.map((t, n) => n).toSorted((t, n) => w[n] - w[t] || M[t] - M[n]), k = Math.max(1, A.length >> 2);
						let v = 0, F = 0, I = 0;
						for (let t = 0; t < k; t++) f(M[A[t]], u), v += u[0], F += u[1], I += u[2];
						t[3 * b] = v / k, t[3 * b + 1] = F / k, t[3 * b + 2] = I / k, y[b] = 1, e[b] = k;
					}
				}(C, h, R, i, b, y, k, l);
				const z = new Float64Array(3 * h);
				let T = jt(g, C, h, i, b, y, l, z, p), E = 0;
				const j = new Int32Array(h);
				for (let e = 0; e < h; e++) 0 !== T[e] ? (j[e] = E, C[3 * E] = C[3 * e], C[3 * E + 1] = C[3 * e + 1], C[3 * E + 2] = C[3 * e + 2], z[3 * E] = z[3 * e], z[3 * E + 1] = z[3 * e + 1], z[3 * E + 2] = z[3 * e + 2], T[E] = T[e], E++) : j[e] = -1;
				if (E < h) {
					for (let t = 0; t < l; t++) g[t] >= 0 && (g[t] = j[g[t]]);
					T = T.slice(0, E);
				}
				if (!0 === n.autoK && E > 1) {
					const t = new Float64Array(3 * E), n = new Float64Array(3 * E), r = (n) => {
						if (p) t[3 * n] = C[3 * n], t[3 * n + 1] = C[3 * n + 1], t[3 * n + 2] = C[3 * n + 2];
						else {
							const [r, o, s] = e(C[3 * n], C[3 * n + 1], C[3 * n + 2]);
							t[3 * n] = r, t[3 * n + 1] = o, t[3 * n + 2] = s;
						}
					}, o = (t) => {
						const e = 1 / T[t], [r, o, s] = u(z[3 * t] * e / 255, z[3 * t + 1] * e / 255, z[3 * t + 2] * e / 255);
						n[3 * t] = r, n[3 * t + 1] = o, n[3 * t + 2] = s;
					};
					for (let e = 0; e < E; e++) r(e), o(e);
					const s = new Uint8Array(E).fill(1), i = new Int32Array(E);
					for (let e = 0; e < E; e++) i[e] = e;
					const a = 9e-4, c = (t, n) => {
						const e = T[t], a = T[n], l = e + a;
						C[3 * t] = (C[3 * t] * e + C[3 * n] * a) / l, C[3 * t + 1] = (C[3 * t + 1] * e + C[3 * n + 1] * a) / l, C[3 * t + 2] = (C[3 * t + 2] * e + C[3 * n + 2] * a) / l, z[3 * t] += z[3 * n], z[3 * t + 1] += z[3 * n + 1], z[3 * t + 2] += z[3 * n + 2], T[t] = l, s[n] = 0, i[n] = t, r(t), o(t);
					};
					for (;;) {
						let n = -1, e = -1, r = 1 / 0;
						for (let o = 0; o < E; o++) if (0 !== s[o]) for (let i = o + 1; i < E; i++) {
							if (0 === s[i]) continue;
							const a = t[3 * o] - t[3 * i], l = t[3 * o + 1] - t[3 * i + 1], c = t[3 * o + 2] - t[3 * i + 2], h = a * a + l * l + c * c;
							h < r && (r = h, n = o, e = i);
						}
						if (n < 0 || r >= a) break;
						c(n, e);
					}
					for (;;) {
						let t = -1, e = -1, r = 1 / 0;
						for (let o = 0; o < E; o++) if (0 !== s[o]) for (let i = o + 1; i < E; i++) {
							if (0 === s[i]) continue;
							const a = d(n[3 * o], n[3 * o + 1], n[3 * o + 2], n[3 * i], n[3 * i + 1], n[3 * i + 2]);
							a < r && (r = a, t = o, e = i);
						}
						if (t < 0 || r >= 1.5) break;
						c(t, e);
					}
					const h = new Int32Array(E);
					let f = 0;
					for (let e = 0; e < E; e++) 0 !== s[e] && (h[e] = f, C[3 * f] = C[3 * e], C[3 * f + 1] = C[3 * e + 1], C[3 * f + 2] = C[3 * e + 2], z[3 * f] = z[3 * e], z[3 * f + 1] = z[3 * e + 1], z[3 * f + 2] = z[3 * e + 2], T[f] = T[e], f++);
					if (f < E) {
						const t = new Int32Array(E);
						for (let n = 0; n < E; n++) {
							let e = n;
							for (; i[e] !== e;) e = i[e];
							t[n] = h[e];
						}
						for (let n = 0; n < l; n++) g[n] >= 0 && (g[n] = t[g[n]]);
						T = T.slice(0, f), E = f;
					}
				}
				const B = Bt(T, E), O = new Int32Array(E), K = new Uint8Array(3 * E), D = [], X = new Uint32Array(E);
				for (let e = 0; e < E; e++) {
					const t = B[e];
					O[t] = e;
					const n = 1 / T[t], r = Math.round(z[3 * t] * n), o = Math.round(z[3 * t + 1] * n), s = Math.round(z[3 * t + 2] * n);
					K[3 * e] = r, K[3 * e + 1] = o, K[3 * e + 2] = s, D.push(c(r, o, s)), X[e] = T[t];
				}
				for (let e = 0; e < l; e++) g[e] >= 0 && (g[e] = O[g[e]]);
				return {
					labels: {
						width: o,
						height: s,
						data: g,
						count: E
					},
					paletteHex: D,
					paletteRgb: K,
					counts: X
				};
			}(n, {
				k: i.paletteSize,
				colorSpace: i.colorSpace,
				quality: i.quantizeQuality,
				seed: 49734321,
				mask: o,
				sampleMask: h,
				autoK: i.autoPaletteSize,
				fixedPalette: i.palette
			});
			if (U = i.autoPaletteSize && y.paletteHex.length < i.paletteSize ? y.paletteHex.length : void 0, await t.tick(), t.stage("segment"), i.colorCoherence > 0 && function(t, n, e, r, o, s) {
				const { width: i, height: a, data: l } = t;
				if (r <= 0 || 0 === i * a) return t;
				const c = s?.data ?? null, h = /* @__PURE__ */ new Int32Array(8), f = /* @__PURE__ */ new Int32Array(9);
				let u = l.slice();
				for (let y = 0; y < 4; y++) {
					let t = !1;
					for (let o = 0; o < a; o++) for (let s = 0; s < i; s++) {
						const y = o * i + s, d = u[y];
						if (-1 === d || null !== c && 0 !== c[y]) continue;
						let p = 0, g = 1;
						f[0] = d;
						for (let t = -1; t <= 1; t++) {
							const n = o + t;
							if (!(n < 0 || n >= a)) for (let e = -1; e <= 1; e++) {
								if (0 === e && 0 === t) continue;
								const r = s + e;
								if (r < 0 || r >= i) continue;
								const o = u[n * i + r];
								if (-1 === o) continue;
								h[p++] = o;
								let a = !1;
								for (let t = 0; t < g; t++) if (f[t] === o) {
									a = !0;
									break;
								}
								a || (f[g++] = o);
							}
						}
						const m = 3 * y, x = n[m], M = n[m + 1], w = n[m + 2];
						let b = d, A = 1 / 0;
						for (let t = 0; t < g; t++) {
							const n = f[t], o = 3 * n, s = x - e[o], i = M - e[o + 1], a = w - e[o + 2];
							let l = 0;
							for (let t = 0; t < p; t++) h[t] === n && l++;
							const c = s * s + i * i + a * a + r * (p - l);
							c < A && (A = c, b = n);
						}
						b !== d && (l[y] = b, t = !0);
					}
					if (!t) break;
					y + 1 < 4 && (u = l.slice());
				}
			}(y.labels, H(n), function(t) {
				const n = t.length / 3 | 0, r = new Float32Array(3 * n);
				for (let o = 0; o < n; o++) {
					const [n, s, i] = e(t[3 * o] / 255, t[3 * o + 1] / 255, t[3 * o + 2] / 255);
					r[3 * o] = n, r[3 * o + 1] = s, r[3 * o + 2] = i;
				}
				return r;
			}(y.paletteRgb), .03 * i.colorCoherence, 0, v ?? void 0), i.dissolveBands > 0 && function(t, n, e) {
				const { width: r, height: o, data: s } = t;
				if (n <= 0 || 0 === r * o) return t;
				const i = e?.data ?? null, a = /* @__PURE__ */ new Int32Array(8);
				let l = s.slice();
				for (let c = 0; c < n; c++) {
					let t = !1;
					for (let n = 0; n < o; n++) for (let e = 0; e < r; e++) {
						const c = n * r + e, h = l[c];
						if (-1 === h || null !== i && 0 !== i[c]) continue;
						let f = 0;
						for (let t = -1; t <= 1; t++) {
							const s = n + t;
							if (!(s < 0 || s >= o)) for (let n = -1; n <= 1; n++) {
								if (0 === n && 0 === t) continue;
								const o = e + n;
								if (o < 0 || o >= r) continue;
								const i = l[s * r + o];
								-1 !== i && (a[f++] = i);
							}
						}
						let u = 0, y = -1, d = 0;
						for (let t = 0; t < f; t++) {
							const n = a[t];
							if (n === h) {
								u++;
								continue;
							}
							let e = 0;
							for (let t = 0; t < f; t++) a[t] === n && e++;
							(e > d || e === d && (-1 === y || n < y)) && (d = e, y = n);
						}
						u <= 2 && d >= 3 && -1 !== y && (s[c] = y, t = !0);
					}
					if (!t) break;
					c + 1 < n && (l = s.slice());
				}
			}(y.labels, i.dissolveBands, v ?? void 0), "color" !== i.mode || null !== i.palette || "pixel" === i.curveMode || null !== v || i.gradients || function(t, n, e) {
				const { width: r, height: o, data: s } = n, i = n.count, a = r * o;
				if (i < 3 || 0 === a) return n;
				const l = t.data, c = new Uint32Array(i), h = new Uint32Array(i), f = new Uint32Array(i * i);
				for (let m = 0; m < o; m++) {
					const t = m * r;
					for (let n = 0; n < r; n++) {
						const e = t + n, a = s[e];
						if (a < 0 || a >= i) continue;
						c[a]++;
						let l = !0;
						const u = a * i;
						if (n > 0) {
							const t = s[e - 1];
							t !== a && (l = !1, t >= 0 && t < i && f[u + t]++);
						}
						if (n < r - 1) {
							const t = s[e + 1];
							t !== a && (l = !1, t >= 0 && t < i && f[u + t]++);
						}
						if (m > 0) {
							const t = s[e - r];
							t !== a && (l = !1, t >= 0 && t < i && f[u + t]++);
						}
						if (m < o - 1) {
							const t = s[e + r];
							t !== a && (l = !1, t >= 0 && t < i && f[u + t]++);
						}
						l && h[a]++;
					}
				}
				const u = new Int32Array(i).fill(-1), y = new Int32Array(i).fill(-1);
				for (let m = 0; m < i; m++) {
					if (c[m] < 8) continue;
					if (h[m] >= .5 * c[m]) continue;
					const t = m * i;
					let n = -1, e = -1, r = 0, o = 0, s = 0;
					for (let a = 0; a < i; a++) {
						const i = f[t + a];
						0 !== i && (s += i, i > r || i === r && a < n ? (e = n, o = r, n = a, r = i) : (i > o || i === o && a < e) && (e = a, o = i));
					}
					n < 0 || e < 0 || 0 === s || r + o < .7 * s || (u[m] = n, y[m] = e);
				}
				const d = new Uint32Array(i);
				for (let m = 0; m < a; m++) {
					const t = s[m];
					if (t < 0 || t >= i || u[t] < 0) continue;
					const n = u[t], r = y[t], o = 4 * m, { t: a, resid2: c } = qt(l[o], l[o + 1], l[o + 2], e[3 * n], e[3 * n + 1], e[3 * n + 2], e[3 * r], e[3 * r + 1], e[3 * r + 2]);
					a < 0 || c <= 144 && a >= $t && a <= .9 && d[t]++;
				}
				const p = new Uint8Array(i);
				let g = !1;
				for (let m = 0; m < i; m++) u[m] < 0 || d[m] < .8 * c[m] || (p[m] = 1, g = !0);
				if (!g) return n;
				for (let m = 0; m < a; m++) {
					const t = s[m];
					if (t < 0 || t >= i || 0 === p[t]) continue;
					const n = u[t], r = y[t], o = 4 * m, { t: a } = qt(l[o], l[o + 1], l[o + 2], e[3 * n], e[3 * n + 1], e[3 * n + 2], e[3 * r], e[3 * r + 1], e[3 * r + 2]);
					s[m] = a >= .5 ? n : r;
				}
			}(n, y.labels, y.paletteRgb), i.preserveDetails) {
				const t = new Float32Array(3 * y.paletteHex.length);
				for (let n = 0; n < y.paletteHex.length; n++) {
					const [r, o, s] = e(y.paletteRgb[3 * n] / 255, y.paletteRgb[3 * n + 1] / 255, y.paletteRgb[3 * n + 2] / 255);
					t[3 * n] = r, t[3 * n + 1] = o, t[3 * n + 2] = s;
				}
				en(y.labels, i.minRegionArea, {
					oklab: t,
					keepContrast: .1,
					protect: v ?? void 0
				});
			} else v ? en(y.labels, i.minRegionArea, { protect: v }) : en(y.labels, i.minRegionArea);
			if (F = y.labels, null === i.palette) {
				const t = function(t, n, e) {
					const { width: r, height: o, data: s } = n, i = t.data, a = n.count, l = new Uint32Array(768 * a), h = new Uint32Array(768 * a), f = new Uint32Array(a), u = new Uint32Array(a);
					for (let c = 0; c < o; c++) {
						const t = c * r;
						for (let n = 0; n < r; n++) {
							const e = t + n, y = s[e];
							if (y < 0 || y >= a) continue;
							const d = 4 * e, p = 768 * y;
							h[p + i[d]]++, h[p + 256 + i[d + 1]]++, h[p + 512 + i[d + 2]]++, u[y]++, n > 0 && n < r - 1 && c > 0 && c < o - 1 && s[e - 1] === y && s[e + 1] === y && s[e - r] === y && s[e + r] === y && (l[p + i[d]]++, l[p + 256 + i[d + 1]]++, l[p + 512 + i[d + 2]]++, f[y]++);
						}
					}
					const y = new Uint8Array(3 * a);
					y.set(e.subarray(0, Math.min(e.length, 3 * a)));
					const d = new Array(a);
					for (let p = 0; p < a; p++) {
						const t = f[p] >= 16, n = t ? l : h, e = t ? f[p] : u[p];
						if (e > 0) {
							const t = 768 * p;
							for (let r = 0; r < 3; r++) {
								const o = e + 1 >> 1;
								let s = 0, i = 0;
								for (; i < 255 && (s += n[t + 256 * r + i], !(s >= o)); i++);
								y[3 * p + r] = i;
							}
						}
						d[p] = c(y[3 * p], y[3 * p + 1], y[3 * p + 2]);
					}
					return {
						paletteRgb: y,
						paletteHex: d
					};
				}(n, F, y.paletteRgb);
				I = t.paletteHex, P = t.paletteRgb;
			} else I = y.paletteHex, P = y.paletteRgb;
			C = new Uint32Array(F.count);
			for (let t = 0; t < F.data.length; t++) {
				const n = F.data[t];
				n >= 0 && C[n]++;
			}
			const p = i.omitBackground ? nM(n, I) : -1;
			if (p >= 0) {
				const t = on(F, p);
				C[p] = Math.max(0, C[p] - t);
			}
			const g = Qx(n, F, I, P, s, i);
			if (g && ({labels: F, paletteHex: I, paletteRgb: P} = g, L = g.gradients, q = g.underlays, C = Yx(F)), null === i.palette) {
				const t = Jx(n, F, s, I.length, L, i.supersample ** 2);
				R = t?.opacity, z = t?.inkHex;
			}
			await t.tick(), b && void 0 !== k && (j = {
				labels: F,
				paletteHex: I,
				paletteRgb: P,
				counts: C,
				paletteClampedTo: U,
				gradients: L,
				underlays: q,
				fillOpacity: R,
				inkHex: z
			}, Mx(m, k, j));
		}
		void 0 !== U && y.push({
			code: "palette-clamped",
			severity: "info",
			message: `Palette reduced to ${U} colors (near-duplicates merged).`,
			params: { count: U }
		});
		const B = new Array(I.length), O = new Array(I.length);
		for (let e = 0; e < I.length; e++) {
			const t = L?.[e];
			if (t) {
				const n = `g${f.length}`;
				f.push({
					id: n,
					...t
				}), B[e] = `url(#${n})`, O[e] = t.stops.map((t) => t.color);
			} else B[e] = I[e], O[e] = [I[e]];
		}
		const K = (t) => q?.[t] ?? -1, D = (t) => R?.[t], X = (t) => z?.[t], W = (t) => {
			const n = {
				fill: B[t],
				colors: O[t]
			}, e = K(t);
			return e >= 0 ? [{
				fill: B[e],
				unfoldable: !0,
				colors: O[e]
			}, n] : [n];
		}, G = (t) => void 0 !== D(t) || (L?.[t]?.stops.some((t) => (t.opacity ?? 1) < 1) ?? !1), Z = (t) => {
			const n = D(t), e = X(t);
			return void 0 !== n && void 0 !== e ? [{
				fill: e,
				colors: [e],
				opacity: n
			}] : W(t);
		};
		t.tracing && t.emitStep(() => {
			const t = [Ri(I, C)], n = function(t, n = 24) {
				const e = [];
				for (const a of t) a > 0 && e.push(Math.log10(a));
				if (0 === e.length) return null;
				let r = e[0], o = e[0];
				for (const a of e) a < r && (r = a), a > o && (o = a);
				r = Math.floor(r), o = Math.max(r + 1, Math.ceil(o));
				const s = new Array(n).fill(0), i = o - r;
				for (const a of e) s[Math.min(n - 1, Math.floor((a - r) / i * n))]++;
				return {
					kind: "histogram",
					label: "Region sizes",
					values: s,
					min: r,
					max: o,
					xLabel: "log₁₀ pixels",
					log: !0
				};
			}(C);
			return n && t.push(n), {
				code: "segment",
				label: "Palette & regions",
				rasters: [Li(F, I, "Label map")],
				charts: t,
				metrics: {
					colors: I.length,
					regions: Oi(C),
					gradients: L ? L.filter(Boolean).length : 0
				},
				notes: [`Segmentation: ${i.segmentation}; min region ${i.minRegionArea}px.`]
			};
		}), t.stage("trace");
		const Q = {
			curveMode: i.curveMode,
			smoothing: i.smoothing,
			curveOptimize: i.curveOptimize,
			optTolerance: i.optTolerance,
			cornerThreshold: i.cornerThreshold,
			scale: i.supersample
		}, Y = i.preserveDetails || v ? 1 : Math.max(1, i.minRegionArea), _ = [], V = M.helpers, J = void 0 !== k ? `${M.scope}|${k}` : `#${M.serial}`, tt = "pixel" !== i.curveMode, nt = tt && null !== s && i.alphaThreshold > 0 ? function(t, n, e, r) {
			const o = Math.min(255, Math.max(0, r)) / 255, s = .5 / Math.max(1 - o, 1e-6), i = .5 / Math.max(o, 1e-6), a = new Float32Array(t.length);
			for (let l = 0; l < t.length; l++) {
				const n = t[l] / 255 - o;
				a[l] = n * (n > 0 ? s : i);
			}
			return {
				width: n,
				height: e,
				data: a
			};
		}(s, n.width, n.height, i.alphaThreshold) : void 0, et = tt && (I.length > 1 || void 0 !== nt), rt = void 0 !== nt ? i.alphaThreshold : void 0, ot = w && "pixel" !== i.curveMode ? await Km({
			labels: F,
			image: n,
			alpha: s,
			paints: I.map((t, n) => ({
				hex: t,
				gradient: L?.[n] ?? void 0,
				under: K(n) >= 0 ? I[K(n)] : void 0,
				opacity: D(n),
				ink: X(n)
			})),
			scale: i.supersample,
			source: w.source,
			sigmaNoise: T ?? (w.soft ? ox(n, F, P) : void 0),
			onStage: w.onStage,
			solveKernel: w.solveKernel,
			fitEdges: Lx(t, M)
		}) : void 0, it = ot?.geo, at = ot?.fits;
		if ("cutout" === i.layering || "nested" === i.layering) {
			const e = i.optimizeSvg ? i.precision : void 0, r = et ? {
				pixels: n.data,
				paletteRgb: P,
				alpha: nt
			} : void 0, o = {
				...Q,
				colorField: r,
				refineChain: void 0 === e ? void 0 : (t) => Dg(t, e)
			};
			let a, c;
			if (it || (V ? {network: a, fits: c} = await async function(t, n, e, r, o, s, i, a, l, c, h) {
				const f = xf(e);
				s && n.setImage(c.scope, r, o), n.setChains(h, f);
				const u = new Array(f.chains.length);
				let y = 0;
				for await (const d of n.dispatch({
					kind: "fit-chains",
					total: f.chains.length,
					stateKey: h,
					curve: a,
					batch: Dx,
					paletteRgb: s,
					alphaThreshold: i,
					arcPrecision: l
				})) u[d.unit] = {
					open: d.shapes[0],
					closed: d.shapes[1]
				}, y++, 0 === (y & Kx) && (t.progress(y / f.chains.length), await t.tick());
				return {
					network: f,
					fits: u
				};
			}(t, V, F, n, s, et ? P : void 0, rt, Q, e, M, J) : (a = xf(F), c = function(t, n) {
				const e = new Array(t.chains.length);
				for (let r = 0; r < t.chains.length; r++) e[r] = Mf(t, r, n);
				return e;
			}(a, o))), "nested" === i.layering) (function(t, n, e, r, o, s, i) {
				const a = t.map(() => []), l = [];
				for (let y = 0; y < t.length; y++) t[y].parent >= 0 ? a[t[y].parent].push(y) : l.push(y);
				const c = (n, e) => t[e].area - t[n].area || n - e;
				l.sort(c);
				for (const y of a) y.sort(c);
				const h = (n) => {
					const e = i?.(t[n].label);
					return void 0 !== e && 1 === e.length && void 0 !== e[0].opacity ? e[0] : void 0;
				}, f = (e) => r(t[e].label) < 0 && n[t[e].label].startsWith("#") && void 0 === h(e), u = (i) => {
					const l = new Uint8Array(i.length);
					for (let c = 0; c < i.length; c++) {
						if (l[c]) continue;
						l[c] = 1;
						const y = i[c], d = t[y].label, p = r(d);
						if (!f(y)) {
							const r = Ox(t[y]), i = h(y);
							for (const a of p >= 0 ? [p, d] : [d]) {
								const l = a === d && void 0 !== i;
								tM(o, l ? i.colors : e[a]), s.push({
									commands: t[y].commands,
									fill: l ? i.fill : n[a],
									fillRule: "evenodd",
									...l ? { fillOpacity: i.opacity } : {},
									...r ? { primitive: r } : {},
									...a === p ? { unfoldable: !0 } : {}
								});
							}
							u(a[y]);
							continue;
						}
						const g = [y];
						for (let e = c + 1; e < i.length; e++) {
							if (l[e]) continue;
							const r = i[e];
							f(r) && n[t[r].label] === n[d] && (l[e] = 1, g.push(r));
						}
						const m = [];
						for (const n of g) m.push(...t[n].commands);
						tM(o, e[d]);
						const x = 1 === g.length ? Ox(t[y]) : null;
						s.push({
							commands: m,
							fill: n[d],
							fillRule: "evenodd",
							...x ? { primitive: x } : {}
						});
						for (const t of g) u(a[t]);
					}
				};
				u(l);
			})(it && at ? function(t, n, e) {
				const { faces: r } = t.map, o = new Int32Array(r.count).fill(-1), s = [];
				for (let i = 0; i < r.count; i++) {
					const a = r.label[i];
					if (a < 0) continue;
					o[i] = s.length;
					const l = [], c = [];
					let h = 0;
					for (const r of t.rings[i]) {
						if (!r.outer && !Hm(t, r, e)) continue;
						const o = qm(r, n);
						if (Wm(o)) {
							r.outer && (h = Math.abs(Dm(Zf(t.map, r))) / 2);
							for (const t of o) l.push(t);
							c.push(r);
						}
					}
					const f = 1 === c.length ? zm(c[0], n) : null;
					s.push({
						label: a,
						commands: l,
						area: h,
						parent: -1,
						primitive: f
					});
				}
				for (let i = 0; i < r.count; i++) {
					if (o[i] < 0) continue;
					let n = t.nesting.parent[i];
					for (; n >= 0 && o[n] < 0;) n = t.nesting.parent[n];
					s[o[i]].parent = n >= 0 ? o[n] : -1;
				}
				return s;
			}(it, at, G) : function(t, n) {
				const { chains: e } = t, r = t.width + 1, o = new Array(e.length).fill(null), s = (t) => {
					const e = t.chain, r = n[e].closed;
					return t.forward ? r : o[e] ??= Fa(r);
				}, i = (t) => {
					const r = t.chain;
					return t.forward ? n[r].open : o[r] ??= Pf(Fa([{
						type: "M",
						x: e[r].points[0],
						y: e[r].points[1]
					}, ...n[r].open]));
				}, a = /* @__PURE__ */ new Map(), l = (t, n) => n * r + t, c = (t, n) => {
					if (t < 0) return;
					const r = e[n.chain].points, o = n.forward ? r[0] : r[r.length - 2], s = n.forward ? r[1] : r[r.length - 1];
					let i = a.get(t);
					i || (i = /* @__PURE__ */ new Map(), a.set(t, i));
					const c = l(o, s);
					let h = i.get(c);
					h || (h = [], i.set(c, h)), h.push(n);
				};
				for (let m = 0; m < e.length; m++) c(e[m].right, {
					chain: m,
					forward: !0,
					used: !1
				}), c(e[m].left, {
					chain: m,
					forward: !1,
					used: !1
				});
				const h = [];
				for (const [m, x] of a) for (const t of x.values()) for (const n of t) {
					if (n.used) continue;
					const t = e[n.chain], r = t.points, o = n.forward ? r[0] : r[r.length - 2], a = n.forward ? r[1] : r[r.length - 1], c = If(e, n), [f, u] = kf(o, a, c), [y, d] = vf(o, a, c);
					if (t.loop) {
						n.used = !0;
						const r = (n.forward ? t.shoelace : -t.shoelace) / 2, o = [];
						bf(e, n, o, !1), o.length >= 2 && (o.length -= 2);
						const i = n.forward ? t.left : t.right, a = s(n);
						h.push({
							label: m,
							commands: wf(a, r) ? pf(o) : a,
							area: r,
							poly: o,
							probeX: f,
							probeY: u,
							holeX: y,
							holeY: d,
							touchesTransparent: i < 0
						});
						continue;
					}
					let p = 0;
					const g = [], M = [];
					g.push({
						type: "M",
						x: o,
						y: a
					});
					let w = !1, b = n, A = !0;
					for (;;) {
						b.used = !0;
						const t = e[b.chain];
						p += b.forward ? t.shoelace : -t.shoelace, (b.forward ? t.left : t.right) < 0 && (w = !0), g.push(...i(b)), bf(e, b, M, !A), A = !1;
						const [r, o] = Sf(e, b), s = Ff(e, x.get(l(r, o)), Nf(e, b), n);
						if (!s || s === n) break;
						b = s;
					}
					g.push({ type: "Z" }), M.length >= 2 && (M.length -= 2), h.push({
						label: m,
						commands: wf(g, p / 2) ? pf(M) : g,
						area: p / 2,
						poly: M,
						probeX: f,
						probeY: u,
						holeX: y,
						holeY: d,
						touchesTransparent: w
					});
				}
				const f = h.length, u = new Float64Array(4 * f);
				for (let m = 0; m < f; m++) {
					let t = 1 / 0, n = 1 / 0, e = -1 / 0, r = -1 / 0;
					const o = h[m].poly;
					for (let s = 0; s < o.length; s += 2) o[s] < t && (t = o[s]), o[s] > e && (e = o[s]), o[s + 1] < n && (n = o[s + 1]), o[s + 1] > r && (r = o[s + 1]);
					u[4 * m] = t, u[4 * m + 1] = n, u[4 * m + 2] = e, u[4 * m + 3] = r;
				}
				const y = (t, n, e) => n >= u[4 * t] && n <= u[4 * t + 2] && e >= u[4 * t + 1] && e <= u[4 * t + 3] && function(t, n, e) {
					let r = !1;
					const o = e.length >> 1;
					for (let s = 0, i = o - 1; s < o; i = s++) {
						const o = e[2 * s + 1], a = e[2 * i + 1];
						if (o > n != a > n) {
							const l = e[2 * s];
							t < l + (n - o) / (a - o) * (e[2 * i] - l) && (r = !r);
						}
					}
					return r;
				}(n, e, h[t].poly), d = new Int32Array(f).fill(-1), p = [];
				for (let m = 0; m < f; m++) h[m].area > 0 && (d[m] = p.length, p.push({
					label: h[m].label,
					commands: h[m].commands,
					area: h[m].area,
					parent: -1
				}));
				const g = [];
				for (let m = 0; m < f; m++) h[m].area < 0 && h[m].touchesTransparent && g.push(m);
				for (const m of g) {
					const t = h[m].holeX, n = h[m].holeY, e = -h[m].area;
					let r = 1 / 0;
					for (const o of g) {
						if (o === m) continue;
						const s = -h[o].area;
						s > e && s < r && y(o, t, n) && (r = s);
					}
					for (let o = 0; o < f; o++) d[o] < 0 || h[o].area < e || h[o].area >= r || y(o, t, n) && p[d[o]].commands.push(...h[m].commands);
				}
				for (let m = 0; m < f; m++) {
					const t = d[m];
					if (t < 0) continue;
					let n = -1, e = 1 / 0;
					for (let r = 0; r < f; r++) r === m || d[r] < 0 || h[r].area < h[m].area || h[r].area >= e || y(r, h[m].probeX, h[m].probeY) && (n = d[r], e = h[r].area);
					p[t].parent = n;
				}
				return p;
			}(a, c), B, O, K, _, l, it && at ? Z : void 0);
			else {
				const t = it && at ? function(t, n) {
					const { faces: e } = t.map, r = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
					for (let s = 0; s < e.count; s++) {
						const i = e.label[s];
						if (i < 0) continue;
						let a = r.get(i);
						void 0 === a && (a = {
							label: i,
							commands: [],
							area: 0,
							holeCount: 0,
							primitive: null
						}, r.set(i, a));
						const l = t.rings[s], c = (o.get(i) ?? 0) + 1;
						o.set(i, c), a.primitive = 1 === c && 1 === l.length ? zm(l[0], n) : null, a.area += e.area[s];
						for (const t of l) {
							const e = qm(t, n);
							if (Wm(e)) {
								for (const t of e) a.commands.push(t);
								t.outer || a.holeCount++;
							}
						}
					}
					return [...r.values()].toSorted((t, n) => t.label - n.label);
				}(it, at) : function(t, n) {
					const { chains: e, areas: r } = t, o = t.width + 1, s = new Array(e.length).fill(null), i = (t) => {
						const e = t.chain, r = n[e].closed;
						return t.forward ? r : s[e] ??= Fa(r);
					}, a = (t) => {
						const r = t.chain;
						return t.forward ? n[r].open : s[r] ??= Pf(Fa([{
							type: "M",
							x: e[r].points[0],
							y: e[r].points[1]
						}, ...n[r].open]));
					}, l = /* @__PURE__ */ new Map(), c = (t, n) => n * o + t, h = (t, n) => {
						if (t < 0) return;
						const r = e[n.chain].points, o = n.forward ? r[0] : r[r.length - 2], s = n.forward ? r[1] : r[r.length - 1];
						let i = l.get(t);
						i || (i = /* @__PURE__ */ new Map(), l.set(t, i));
						const a = c(o, s);
						let h = i.get(a);
						h || (h = [], i.set(a, h)), h.push(n);
					};
					for (let u = 0; u < e.length; u++) h(e[u].right, {
						chain: u,
						forward: !0,
						used: !1
					}), h(e[u].left, {
						chain: u,
						forward: !1,
						used: !1
					});
					const f = [];
					for (const [u, y] of l) {
						const t = [];
						let n = 0;
						for (const r of y.values()) for (const o of r) {
							if (o.used) continue;
							const r = e[o.chain];
							if (r.loop) {
								o.used = !0;
								const s = (o.forward ? r.shoelace : -r.shoelace) / 2;
								s < 0 && n++;
								const a = i(o);
								t.push(...wf(a, s) ? Af(e, [o]) : a);
								continue;
							}
							let s = 0;
							const l = [], h = r.points, f = o.forward ? h[0] : h[h.length - 2], u = o.forward ? h[1] : h[h.length - 1];
							l.push({
								type: "M",
								x: f,
								y: u
							});
							const d = [];
							let p = o;
							for (;;) {
								p.used = !0, d.push(p);
								const t = e[p.chain];
								s += p.forward ? t.shoelace : -t.shoelace, l.push(...a(p));
								const [n, r] = Sf(e, p), i = Ff(e, y.get(c(n, r)), Nf(e, p), o);
								if (!i || i === o) break;
								p = i;
							}
							l.push({ type: "Z" }), s / 2 < 0 && n++, t.push(...wf(l, s / 2) ? Af(e, d) : l);
						}
						t.length > 0 && f.push({
							label: u,
							commands: t,
							area: r.get(u) ?? 0,
							holeCount: n
						});
					}
					return f;
				}(a, c);
				t.sort((t, n) => n.area - t.area);
				const e = i.supersample, r = S(n.width / e + 2 * M.serialize.offset, i.widthMm), o = i.gapFill <= 0 ? 0 : "mm" === i.unit ? r > 0 ? i.gapFill / r * e : 0 : i.gapFill * e;
				for (const n of t) {
					const t = K(n.label);
					for (const e of t >= 0 ? [t, n.label] : [n.label]) {
						const r = e === t ? void 0 : D(e), s = void 0 !== r ? X(e) : void 0, i = s ?? B[e];
						tM(_, void 0 !== r && void 0 !== s ? [s] : O[e]);
						const a = "primitive" in n ? n.primitive : null;
						l.push({
							commands: n.commands,
							fill: i,
							fillRule: "evenodd",
							...a ? { primitive: a } : {},
							...void 0 !== r ? { fillOpacity: r } : {},
							...e === t ? { unfoldable: !0 } : {},
							...o > 0 ? {
								stroke: i,
								strokeWidth: o,
								strokeLinejoin: "round"
							} : {}
						});
					}
				}
			}
			t.progress(1);
		} else {
			const e = function(t, n) {
				return [
					t.layering,
					t.turnPolicy,
					n
				].join("|");
			}(i, Y), r = j?.rings, o = "pixel" !== i.curveMode, a = void 0 === r || r.key !== e || o && et && void 0 === r.polygons ? void 0 : r.layers, c = a && o ? r?.polygons : void 0, f = (t, e, r, o) => et ? function(t) {
				const { width: n, height: e, mask: r, labels: o, pixels: s, paletteRgb: i, label: a, alpha: l } = t, c = l?.data, h = (t, n, e, r) => {
					const o = ba(s, 4 * t, i, 3 * n, 3 * e);
					return o < 0 ? r : o - .5;
				}, f = (t, n) => {
					if (void 0 === c) return n;
					const e = c[t];
					return e < ua ? e : n;
				}, u = (t, o, s, i) => o > 0 && r[t - 1] === i ? t - 1 : o < n - 1 && r[t + 1] === i ? t + 1 : s > 0 && r[t - n] === i ? t - n : s < e - 1 && r[t + n] === i ? t + n : -1;
				let y = -1;
				const d = () => (y < 0 && (y = function(t, n, e) {
					let r = wa.get(t);
					if (void 0 === r) {
						const o = new Float32Array(n * e);
						for (let n = 0, e = 0; n < o.length; n++, e += 4) {
							const r = t[e + 3] / 255, s = (.2126 * t[e] + .7152 * t[e + 1] + .0722 * t[e + 2]) / 255;
							o[n] = s * r + 1 - r;
						}
						r = $(o, n, e), wa.set(t, r);
					}
					return r;
				}(s, n, e)), y), p = (t, n) => {
					const e = i[3 * t] - i[3 * n], r = i[3 * t + 1] - i[3 * n + 1], o = i[3 * t + 2] - i[3 * n + 2], s = e * e + r * r + o * o;
					return s < 1 ? NaN : 255 * d() / Math.sqrt(s);
				}, g = (t) => void 0 !== c && c[t] < ua ? d() : NaN;
				return {
					width: n,
					height: e,
					at(t, e) {
						const s = e * n + t, i = o[s];
						if (0 !== r[s]) {
							const n = u(s, t, e, 0);
							if (n >= 0 && o[n] >= 0) {
								const t = a >= 0 ? a : i;
								return t < 0 ? .5 : h(s, t, o[n], .5);
							}
							return f(s, .5);
						}
						if (i < 0) return f(s, -.5);
						const l = u(s, t, e, 1);
						if (l < 0) return -.5;
						const c = a >= 0 ? a : o[l];
						return c < 0 ? -.5 : h(s, c, i, -.5);
					},
					along(t, e, l, c) {
						const h = c * n + l, f = o[h];
						let y, d;
						if (0 !== r[h]) {
							const t = u(h, l, c, 0);
							if (t < 0 || o[t] < 0) return NaN;
							y = a >= 0 ? a : f, d = o[t];
						} else {
							if (f < 0) return NaN;
							const t = u(h, l, c, 1);
							if (t < 0) return NaN;
							y = a >= 0 ? a : o[t], d = f;
						}
						if (y < 0) return NaN;
						const p = ba(s, 4 * (e * n + t), i, 3 * y, 3 * d);
						return p < 0 ? NaN : p - .5;
					},
					uncertainty(t, e) {
						const s = e * n + t, i = o[s];
						if (0 !== r[s]) {
							const n = u(s, t, e, 0);
							if (n >= 0 && o[n] >= 0) {
								const t = a >= 0 ? a : i;
								return t < 0 ? NaN : p(t, o[n]);
							}
							return g(s);
						}
						if (i < 0) return g(s);
						const l = u(s, t, e, 1);
						if (l < 0) return NaN;
						const c = a >= 0 ? a : o[l];
						return c < 0 ? NaN : p(c, i);
					}
				};
			}({
				width: n.width,
				height: n.height,
				mask: t,
				labels: e,
				pixels: n.data,
				paletteRgb: P,
				label: r,
				alpha: o ? void 0 : nt
			}) : void 0;
			let u = 0, y = 0, d = 1;
			const p = () => t.emitStep(() => ({
				code: "trace",
				label: `Trace layer ${u}/${y}`,
				metrics: {
					shapes: l.length,
					nodes: ji(l),
					layer: u,
					layersTotal: y
				}
			})), g = (t) => {
				y = t, d = Math.max(1, Math.ceil(t / 10));
			}, x = (t, n) => {
				const e = W(t), r = void 0 !== D(t);
				return 2 === e.length ? {
					under: yx(e[0], n),
					own: yx(e[1], n),
					translucent: r
				} : {
					own: yx(e[0], n),
					translucent: r
				};
			}, w = void 0 !== it && void 0 !== at, A = async (n, e, r, o, s) => {
				const a = u;
				let c = 0;
				for (const t of w ? Z(n) : W(n)) {
					e.length > 0 && tM(_, t.colors);
					for (let n = 0; n < e.length; n++) {
						const f = o?.[n] ?? null, u = Ax(i) ? s?.[n] ?? null : null;
						l.push({
							commands: e[n],
							fill: t.fill,
							fillRule: "evenodd",
							layerId: a,
							...void 0 !== t.opacity ? { fillOpacity: t.opacity } : {},
							...t.unfoldable ? { unfoldable: !0 } : {},
							...null !== f ? { primitive: f } : {},
							...null !== u ? { strokedPrimitive: u } : {}
						}), r && h.push(r[c] ?? null), c++;
					}
				}
				u++, t.progress(u / y), t.tracing && u < y && u % d === 0 && p(), await t.tick();
			}, k = (t, n, e) => A(t, hf(n, Q, e).map((t) => t.commands), void 0);
			if (it && at) {
				const t = Ux(F, C, j, b ? m : void 0), { faces: n } = it.map, e = new Int32Array(n.count).fill(-1);
				for (let i = 0; i < n.ids.length; i++) {
					const r = n.ids[i];
					e[r] < 0 && (e[r] = t.stackLabels[i]);
				}
				const r = t.islands.map((t) => {
					const e = /* @__PURE__ */ new Set();
					for (const r of t.pixels) e.add(n.ids[r]);
					return {
						label: t.label,
						faces: [...e].toSorted((t, n) => t - n)
					};
				}), o = i.supersample, s = function(t, n, e, r, o, s, i) {
					const { map: a } = t, { faces: l, edges: c } = a, h = new Int32Array(Math.max(1, ...r.map((t) => t + 1))).fill(-1);
					r.forEach((t, n) => h[t] = n);
					const f = (t) => {
						const n = e[t];
						return n >= 0 && n < h.length ? h[n] : -1;
					}, u = new Uint8Array(l.count);
					if (i) for (let b = 0; b < l.count; b++) e[b] >= 0 && i(e[b]) && (u[b] = 1);
					const y = new Int32Array(l.count + 1);
					for (const b of c) b.left >= 0 && b.right >= 0 && (y[b.left + 1]++, y[b.right + 1]++);
					for (let b = 0; b < l.count; b++) y[b + 1] += y[b];
					const d = new Int32Array(y[l.count]), p = y.slice(0, l.count);
					for (const b of c) b.left >= 0 && b.right >= 0 && (d[p[b.left]++] = b.right, d[p[b.right]++] = b.left);
					const g = new Uint8Array(l.count);
					for (const b of c) b.left < 0 && b.right >= 0 && (g[b.right] = 1), b.right < 0 && b.left >= 0 && (g[b.left] = 1);
					const m = [], x = new Uint8Array(l.count), M = new Uint8Array(l.count), w = [];
					for (let b = 0; b < r.length; b++) {
						const t = (t) => {
							for (let n = y[t]; n < y[t + 1]; n++) if (f(d[n]) < b) return !0;
							return !1;
						};
						x.fill(0);
						for (let n = 0; n < l.count; n++) f(n) === b && (x[n] = 1, w.push(n));
						for (; w.length > 0;) {
							const n = w.pop();
							if (f(n) === b || !t(n)) for (let t = y[n]; t < y[n + 1]; t++) {
								const n = d[t];
								0 === x[n] && f(n) > b && 0 === u[n] && (x[n] = 1, w.push(n));
							}
						}
						M.fill(0);
						for (let n = 0; n < l.count; n++) {
							if (1 === x[n] || 1 === M[n]) continue;
							const t = [n];
							M[n] = 1;
							let e = !0;
							for (let n = 0; n < t.length; n++) {
								const r = t[n];
								(f(r) <= b || 1 === u[r] || 1 === g[r]) && (e = !1);
								for (let n = y[r]; n < y[r + 1]; n++) {
									const e = d[n];
									0 === x[e] && 0 === M[e] && (M[e] = 1, t.push(e));
								}
							}
							if (e) for (const n of t) x[n] = 1;
						}
						const o = r[b], i = Vf(a, x).map((t) => ({
							commands: s ? ex(a, t, n, (t) => e[t] !== o, s) : qm(t, n),
							poly: Zf(a, t),
							primitive: s && e[Jf(a, t)[0]] !== o ? null : zm(t, n)
						}));
						m.push({
							label: o,
							shapes: Qm(i)
						});
					}
					for (const b of o) {
						x.fill(0);
						for (const n of b.faces) x[n] = 1;
						const t = Vf(a, x).map((t) => ({
							commands: qm(t, n),
							poly: Zf(a, t),
							primitive: zm(t, n)
						}));
						m.push({
							label: b.label,
							shapes: Qm(t)
						});
					}
					return m;
				}(it, at, e, t.order, r, {
					faceIds: n.ids,
					width: n.width,
					height: n.height,
					distance: o,
					ramp: 3 * o,
					fit: Em(n.width, n.height, o)
				}, G);
				g(s.length);
				for (const i of s) await A(i.label, i.shapes.map((t) => t.commands), void 0, i.shapes.map((t) => t.primitive), i.shapes.map((t) => t.stroked));
			} else if (V) {
				const t = Ux(F, C, j, b ? m : void 0), r = (n) => n < t.order.length ? t.order[n] : t.islands[n - t.order.length].label, o = t.order.length + t.islands.length, a = `${J}|${e}`;
				et && V.setImage(M.scope, n, s), V.setStackPlan(a, function(t, n, e, r) {
					const o = new Int32Array(n.islands.length + 1);
					for (let a = 0; a < n.islands.length; a++) o[a + 1] = o[a] + n.islands[a].pixels.length;
					const s = new Int32Array(n.islands.length), i = new Int32Array(o[n.islands.length]);
					for (let a = 0; a < n.islands.length; a++) s[a] = n.islands[a].label, i.set(n.islands[a].pixels, o[a]);
					return {
						width: t.width,
						height: t.height,
						labelCount: n.labelCount,
						stackLabels: n.stackLabels,
						order: new Int32Array(n.order),
						islandLabels: s,
						islandPixels: i,
						islandOffsets: o,
						turnPolicy: e,
						minArea: r
					};
				}(F, t, i.turnPolicy, Y)), g(o);
				for await (const n of V.dispatch({
					kind: "trace-layers",
					total: o,
					stateKey: a,
					curve: Q,
					meta: (t) => x(r(t), t),
					serialize: M.serialize,
					paletteRgb: et ? P : void 0,
					alphaThreshold: rt
				})) await A(r(n.unit), n.shapes, n.svg);
			} else if (a) {
				xx(m).ringHits++, o && (c ? xx(m).polyHits++ : xx(m).polyMisses++);
				const t = o && !c ? [] : void 0;
				g(a.length);
				for (let n = 0; n < a.length; n++) {
					const e = a[n];
					let r = c?.[n];
					t && (r = Fx(e.paths), t.push(r)), await k(e.label, e.paths, r);
				}
				t && r && (r.polygons = t);
			} else {
				b && (xx(m).ringMisses++, o && xx(m).polyMisses++);
				const t = b ? [] : void 0, r = t && o ? [] : void 0, s = Ux(F, C, j, b ? m : void 0), a = function(t) {
					const n = new Int32Array(t.labelCount).fill(-1);
					for (let e = 0; e < t.order.length; e++) n[t.order[e]] = e;
					return n;
				}(s);
				if (await async function(t, n, e, r, o, s) {
					const i = Math.max(1, r), a = n.stackLabels, l = n.order, c = a.length, h = n.labelCount, f = new Uint32Array(h);
					for (let w = 0; w < c; w++) {
						const t = a[w];
						t >= 0 && f[t]++;
					}
					const u = new Int32Array(h + 1);
					for (let w = 0; w < h; w++) u[w + 1] = u[w] + f[w];
					const y = new Int32Array(u[h]), d = u.slice(0, h);
					for (let w = 0; w < c; w++) {
						const t = a[w];
						t >= 0 && (y[d[t]++] = w);
					}
					const p = (t.width, t.height, new Uint8Array(c));
					for (let w = 0; w < c; w++) p[w] = a[w] >= 0 ? 1 : 0;
					const g = {
						width: t.width,
						height: t.height,
						data: new Uint8Array(c)
					}, m = g.data, x = new Int32Array(c), M = t.width;
					o(l.length + n.islands.length);
					for (let w = 0; w < l.length; w++) {
						const t = l[w];
						m.fill(0);
						let n = 0;
						for (let e = u[t]; e < u[t + 1]; e++) {
							const t = y[e];
							0 === m[t] && (m[t] = 1, x[n++] = t);
						}
						for (; n > 0;) {
							const t = x[--n], e = t - (t / M | 0) * M;
							e > 0 && 1 === p[t - 1] && 0 === m[t - 1] && (m[t - 1] = 1, x[n++] = t - 1), e < M - 1 && 1 === p[t + 1] && 0 === m[t + 1] && (m[t + 1] = 1, x[n++] = t + 1), t >= M && 1 === p[t - M] && 0 === m[t - M] && (m[t - M] = 1, x[n++] = t - M), t < c - M && 1 === p[t + M] && 0 === m[t + M] && (m[t + M] = 1, x[n++] = t + M);
						}
						const r = Di(g, e, i);
						for (let e = u[t]; e < u[t + 1]; e++) p[y[e]] = 0;
						await s(t, r, m, !1);
					}
					for (const w of n.islands) {
						m.fill(0);
						for (const n of w.pixels) m[n] = 1;
						const t = Di(g, e, i);
						await s(w.label, t, m, !0);
					}
				}(F, s, i.turnPolicy, Y, g, async (e, l, c, h) => {
					const u = f(c, s.stackLabels, h ? e : -1, void 0 !== D(e)), y = u && !h ? {
						mask: c,
						labels: s.stackLabels,
						position: a,
						layer: a[e],
						width: n.width,
						height: n.height,
						scale: i.supersample
					} : void 0, d = o ? Fx(l, u, y) : void 0;
					t?.push({
						label: e,
						paths: l
					}), r && d && r.push(d), await k(e, l, d);
				}), t && j) {
					for (const t of m.palette?.values() ?? []) t !== j && (t.rings = void 0);
					j.rings = {
						key: e,
						layers: t,
						polygons: r
					};
				}
			}
		}
		st = _, t.progress(1);
	}(w, W, G, Z, y, rt, it, ot, A, 0, s?.edgeHint, L ? k : void 0, U, {
		helpers: R,
		scope: ht,
		serial: j,
		serialize: ct
	}, "planar" === p ? {
		onStage: i?.onPlanarStage,
		solveKernel: i?.solveKernel,
		frontEnd: g,
		soft: V,
		edgeNoise: Q,
		clean: Y,
		source: _
	} : void 0) : await async function(t, e, r, o, s, i, l, h, f, u, y, d, p) {
		t.stage("palette");
		const g = void 0 !== f && void 0 !== u && f.imageId === u && void 0 === h, x = g ? function(t) {
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
		let w = g && f.ink?.key === x ? f.ink : void 0;
		const b = dx(h, e.width, e.height);
		let A, k;
		if (w) A = w.mask, k = w.coverage, xx(f).inkHits++, await t.tick(), t.stage("segment"), await t.tick();
		else {
			g && xx(f).inkMisses++;
			const s = function(t) {
				const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(o);
				for (let i = 0, a = 0; i < o; i++, a += 4) {
					const t = D[r[a]], n = D[r[a + 1]], e = D[r[a + 2]], o = .2104542553 * Math.cbrt(.4122214708 * t + .5363325363 * n + .0514459929 * e) + .793617785 * Math.cbrt(.2119034982 * t + .6806995451 * n + .1073969566 * e) - .0040720468 * Math.cbrt(.0883024619 * t + .2817188376 * n + .6299787005 * e);
					s[i] = o < 0 ? 0 : o > 1 ? 1 : o;
				}
				return {
					width: n,
					height: e,
					data: s
				};
			}(e);
			if ("adaptive" === o.thresholdMode) A = function(t, n, e, r, o) {
				const { width: s, height: i, data: a } = t, l = o ? o.data : null, c = Math.max(1, Math.round(n)), h = r ? 1 : 0, f = s + 1, u = new Float64Array(f * (i + 1));
				for (let d = 0; d < i; d++) {
					let t = 0;
					const n = d * s, e = d * f, r = (d + 1) * f;
					for (let o = 0; o < s; o++) t += a[n + o], u[r + o + 1] = u[e + o + 1] + t;
				}
				const y = new Uint8Array(s * i);
				for (let d = 0; d < i; d++) {
					const t = d - c < 0 ? 0 : d - c, n = d + c >= i ? i - 1 : d + c, r = t * f, o = (n + 1) * f;
					for (let i = 0; i < s; i++) {
						const f = d * s + i;
						if (null !== l && 0 === l[f]) continue;
						const p = i - c < 0 ? 0 : i - c, g = i + c >= s ? s - 1 : i + c, m = (g - p + 1) * (n - t + 1), x = u[o + g + 1] - u[r + g + 1] - u[o + p] + u[r + p];
						y[f] = (a[f] < x / m - e ? 1 : 0) ^ h;
					}
				}
				return {
					width: s,
					height: i,
					data: y
				};
			}(s, o.adaptiveRadius, o.adaptiveBias / 255, o.invert, r), "pixel" !== o.curveMode && (k = function(t, n, e, r) {
				const { width: o, height: s, data: i } = t, a = Math.max(1, Math.round(n)), l = r ? -1 : 1, c = o + 1, h = new Float64Array(c * (s + 1));
				for (let u = 0; u < s; u++) {
					let t = 0;
					const n = u * o, e = u * c, r = (u + 1) * c;
					for (let s = 0; s < o; s++) t += i[n + s], h[r + s + 1] = h[e + s + 1] + t;
				}
				const f = new Float32Array(o * s);
				for (let u = 0; u < s; u++) {
					const t = u - a < 0 ? 0 : u - a, n = u + a >= s ? s - 1 : u + a, r = t * c, y = (n + 1) * c;
					for (let s = 0; s < o; s++) {
						const c = u * o + s, d = s - a < 0 ? 0 : s - a, p = s + a >= o ? o - 1 : s + a, g = (p - d + 1) * (n - t + 1), m = (h[y + p + 1] - h[r + p + 1] - h[y + d] + h[r + d]) / g - e, x = m - i[c], M = x > 0 ? .5 / Math.max(m, 1e-6) : .5 / Math.max(1 - m, 1e-6);
						f[c] = l * x * M;
					}
				}
				return {
					width: o,
					height: s,
					data: f
				};
			}(s, o.adaptiveRadius, o.adaptiveBias / 255, o.invert));
			else {
				const t = "auto" === o.thresholdMode ? function(t, n) {
					const { data: e } = t, r = n ? n.data : null, o = /* @__PURE__ */ new Float64Array(256);
					let s = 0;
					for (let u = 0; u < e.length; u++) null !== r && 0 === r[u] || (o[nn(e[u])]++, s++);
					if (0 === s) return .5;
					let i = 0;
					for (let u = 0; u < 256; u++) i += u * o[u];
					let a = 0, l = 0, c = 0, h = -1, f = -1;
					for (let u = 0; u < 256; u++) {
						if (a += o[u], 0 === a) continue;
						const t = s - a;
						if (0 === t) break;
						l += u * o[u];
						const n = l / a - (i - l) / t, e = a * t * n * n;
						e > c ? (c = e, h = u, f = u) : e === c && h >= 0 && (f = u);
					}
					return h < 0 || 0 === c ? .5 : ((h + f) / 2 + 1) / 256;
				}(s, r) : o.threshold / 255, i = function(t) {
					const { width: n, height: e, data: r } = t, o = n * e, s = new Float32Array(o);
					for (let i = 0, a = 0; i < o; i++, a += 4) s[i] = (.2126 * r[a] + .7152 * r[a + 1] + .0722 * r[a + 2]) / 255;
					return {
						width: n,
						height: e,
						data: s
					};
				}(e), a = function(t) {
					const e = t < 0 ? 0 : t > 1 ? 1 : t;
					return n(e * e * e);
				}(t);
				A = function(t, n, e, r) {
					const { width: o, height: s, data: i } = t, a = r ? r.data : null, l = new Uint8Array(o * s), c = e ? 1 : 0;
					for (let h = 0; h < l.length; h++) null !== a && 0 === a[h] || (l[h] = (i[h] < n ? 1 : 0) ^ c);
					return {
						width: o,
						height: s,
						data: l
					};
				}(i, a, o.invert, r), "pixel" !== o.curveMode && (k = function(t, n, e) {
					const { width: r, height: o, data: s } = t, i = new Float32Array(s.length), a = e ? -1 : 1, l = .5 / Math.max(n, 1e-6), c = .5 / Math.max(1 - n, 1e-6);
					for (let h = 0; h < s.length; h++) {
						const t = n - s[h];
						i[h] = a * t * (t > 0 ? l : c);
					}
					return {
						width: r,
						height: o,
						data: i
					};
				}(i, a, o.invert));
			}
			await t.tick(), t.stage("segment"), A = function(t, n, e) {
				const { width: r, height: o, data: s } = t, i = r * o, a = v(r, o);
				if (a.data.set(s), n <= 1) return a;
				const l = e?.data ?? null, c = new Uint8Array(i), h = new Int32Array(i), f = new Int32Array(i);
				for (let u = 0; u < i; u++) {
					if (0 === s[u] || 0 !== c[u]) continue;
					let t = 0, e = 0, i = !1;
					for (h[t++] = u, c[u] = 1; t > 0;) {
						const n = h[--t];
						f[e++] = n, null !== l && 0 !== l[n] && (i = !0);
						const a = n - (n / r | 0) * r, u = n / r | 0;
						for (let e = -1; e <= 1; e++) {
							const n = u + e;
							if (!(n < 0 || n >= o)) for (let o = -1; o <= 1; o++) {
								if (0 === o && 0 === e) continue;
								const i = a + o;
								if (i < 0 || i >= r) continue;
								const l = n * r + i;
								0 === c[l] && 0 !== s[l] && (c[l] = 1, h[t++] = l);
							}
						}
					}
					if (e < n && !i) for (let n = 0; n < e; n++) a.data[f[n]] = 0;
				}
				c.fill(0);
				for (let u = 0; u < i; u++) {
					if (0 !== s[u] || 0 !== c[u]) continue;
					let t = 0, e = 0, i = !1, y = !1;
					for (h[t++] = u, c[u] = 1; t > 0;) {
						const n = h[--t];
						f[e++] = n, null !== l && 0 !== l[n] && (y = !0);
						const a = n - (n / r | 0) * r, u = n / r | 0;
						0 !== a && 0 !== u && a !== r - 1 && u !== o - 1 || (i = !0), a > 0 && 0 === c[n - 1] && 0 === s[n - 1] && (c[n - 1] = 1, h[t++] = n - 1), a < r - 1 && 0 === c[n + 1] && 0 === s[n + 1] && (c[n + 1] = 1, h[t++] = n + 1), u > 0 && 0 === c[n - r] && 0 === s[n - r] && (c[n - r] = 1, h[t++] = n - r), u < o - 1 && 0 === c[n + r] && 0 === s[n + r] && (c[n + r] = 1, h[t++] = n + r);
					}
					if (!i && e < n && !y) for (let n = 0; n < e; n++) a.data[f[n]] = 1;
				}
				return a;
			}(A, o.minRegionArea, b), await t.tick(), g && void 0 !== x && (w = {
				key: x,
				mask: A,
				coverage: k
			}, f.ink = w);
		}
		if (t.tracing && t.emitStep(() => ({
			code: "threshold",
			label: "Threshold",
			rasters: [$i(A, "Binary mask")],
			charts: [qi(e)],
			metrics: {
				blackFraction: Math.round(1e3 * Bi(A)) / 1e3,
				threshold: o.threshold
			},
			notes: [`Threshold mode: ${o.thresholdMode}${o.invert ? " (inverted)" : ""}.`]
		})), t.stage("trace"), F = [o.fillColor], st = F, "bw" === o.mode && d && "pixel" !== o.curveMode) {
			const { width: n, height: i } = A, l = new Int32Array(n * i);
			for (let t = 0; t < l.length; t++) l[t] = A.data[t] ? 0 : null !== r && 0 === r.data[t] ? -1 : 1;
			const h = {
				width: n,
				height: i,
				data: l,
				count: 2
			}, f = function(t, n) {
				const { width: e, height: r, data: o } = t, s = /* @__PURE__ */ new Float64Array(8), i = /* @__PURE__ */ new Float64Array(8);
				for (let l = 0; l < r; l++) for (let t = 0; t < e; t++) {
					const a = l * e + t, c = n[a];
					c < 0 || c >= 2 || (i[4 * c] += o[4 * a], i[4 * c + 1] += o[4 * a + 1], i[4 * c + 2] += o[4 * a + 2], i[4 * c + 3]++, 0 !== t && n[a - 1] !== c || t !== e - 1 && n[a + 1] !== c || 0 !== l && n[a - e] !== c || l !== r - 1 && n[a + e] !== c || (s[4 * c] += o[4 * a], s[4 * c + 1] += o[4 * a + 1], s[4 * c + 2] += o[4 * a + 2], s[4 * c + 3]++));
				}
				const a = [];
				for (let l = 0; l < 2; l++) {
					const t = s[4 * l + 3] > 0 ? s : i, n = Math.max(1, t[4 * l + 3]);
					a.push(c(Math.round(t[4 * l] / n), Math.round(t[4 * l + 1] / n), Math.round(t[4 * l + 2] / n)));
				}
				return a;
			}(e, l), u = Uint8Array.from(f.flatMap((t) => a(t) ?? [
				255,
				255,
				255
			])), { geo: g, fits: m } = await Km({
				labels: h,
				image: e,
				alpha: p,
				paints: f.map((t) => ({ hex: t })),
				scale: o.supersample,
				source: d.source,
				sigmaNoise: d.soft ? ox(e, h, u) : void 0,
				onStage: d.onStage,
				solveKernel: d.solveKernel,
				fitEdges: Lx(t, y)
			}), { faces: x } = g.map, M = [];
			for (let t = 0; t < x.count; t++) 0 === x.label[t] && M.push(t);
			M.sort((t, n) => x.area[n] - x.area[t] || t - n);
			for (const t of M) {
				const n = [], e = g.rings[t].filter((t) => {
					const e = qm(t, m);
					return !!Wm(e) && (n.push(...e), !0);
				}), r = 1 === e.length ? zm(e[0], m) : null, i = Ax(o) && 2 === e.length ? Tm(e[0], e[1], m) : null;
				s.push({
					commands: n,
					fill: o.fillColor,
					fillRule: "evenodd",
					...null !== r ? { primitive: r } : {},
					...null !== i ? { strokedPrimitive: i } : {}
				});
			}
			t.progress(1);
		} else if ("bw" === o.mode) {
			const n = b ? 1 : Math.max(1, o.minRegionArea), e = `${o.turnPolicy}|${n}`, r = "pixel" !== o.curveMode;
			let a, l;
			w?.rings && w.ringKey === e ? (a = w.rings, l = r ? w.polygons : void 0, xx(f).ringHits++) : (a = Di(A, o.turnPolicy, n), w && (w.ringKey = e, w.rings = a, w.polygons = void 0, xx(f).ringMisses++));
			const c = {
				curveMode: o.curveMode,
				smoothing: o.smoothing,
				curveOptimize: o.curveOptimize,
				optTolerance: o.optTolerance,
				cornerThreshold: o.cornerThreshold,
				scale: o.supersample
			}, h = y.helpers;
			let u;
			if (h) {
				const n = function(t) {
					const n = [], e = new Int32Array(t.length);
					for (let r = 0; r < t.length; r++) {
						const o = t[r];
						if (o.area > 0) e[r] = n.length, n.push({
							rings: [r],
							area: o.area,
							holeCount: 0
						});
						else if (o.parent >= 0) {
							const t = n[e[o.parent]];
							t.rings.push(r), t.holeCount++;
						}
					}
					return n.sort((t, n) => n.area - t.area), n;
				}(a), i = `${void 0 !== x ? `${y.scope}|${x}` : `#${y.serial}`}|${e}`;
				h.setRingUnits(i, {
					width: A.width,
					height: A.height,
					rings: a.map((t) => t.points),
					coverage: r ? k : void 0
				});
				const l = new Array(a.length);
				let f = 0;
				for await (const e of h.dispatch({
					kind: "trace-rings",
					total: a.length,
					stateKey: i,
					curve: c,
					batch: Xx
				})) l[e.unit] = e.shapes[0], f++, 0 === (f & Hx) && (t.progress(f / a.length), await t.tick());
				u = n.map((t) => {
					const n = [];
					for (const e of t.rings) n.push(...l[e]);
					return {
						commands: n,
						area: t.area,
						holeCount: t.holeCount
					};
				});
				for (const t of u) s.push({
					commands: t.commands,
					fill: o.fillColor,
					fillRule: "evenodd"
				});
			} else {
				r && (l ? xx(f).polyHits++ : (l = a.map((t) => yf(t.points, k)), w && (w.polygons = l, xx(f).polyMisses++))), u = hf(a, {
					...c,
					coverage: k
				}, l);
				for (const t of u) s.push({
					commands: t.commands,
					fill: o.fillColor,
					fillRule: "evenodd"
				});
			}
			o.detectIslands && function(t, n) {
				let e = 0;
				for (const r of t) e += r.holeCount;
				e > 0 && n.push({
					code: "stencil-islands",
					severity: "warning",
					message: `${e} enclosed island${1 === e ? "" : "s"} would fall out of a physical stencil — add bridges in your editor.`,
					params: { count: e }
				});
			}(u, i), t.progress(1);
		} else {
			(function(t, n) {
				const { data: e } = t;
				if (0 === e.length) return;
				let r = 0;
				for (let s = 0; s < e.length; s++) r += e[s];
				const o = r / e.length;
				o > eM && n.push({
					code: "centerline-input",
					severity: "warning",
					message: `Centerline traces the middle of thin lines, but ~${Math.round(100 * o)}% of this image is filled — expect a skeleton, not matching outlines. Use B&W or Color mode for solid shapes.`,
					params: { percent: Math.round(100 * o) }
				});
			})(A, i);
			const n = function(t) {
				const { width: n, height: e } = t, r = n * e, o = new Uint8Array(r);
				for (let a = 0; a < r; a++) o[a] = 0 !== t.data[a] ? 1 : 0;
				const s = new Int32Array(r);
				let i = !0;
				for (; i;) {
					i = !1;
					for (let t = 0; t < 2; t++) {
						let r = 0;
						for (let i = 0; i < e; i++) {
							const a = i > 0, l = i < e - 1;
							for (let e = 0; e < n; e++) {
								const c = i * n + e;
								if (0 === o[c]) continue;
								const h = e > 0, f = e < n - 1, u = a ? o[c - n] : 0, y = a && f ? o[c - n + 1] : 0, d = f ? o[c + 1] : 0, p = l && f ? o[c + n + 1] : 0, g = l ? o[c + n] : 0, m = l && h ? o[c + n - 1] : 0, x = h ? o[c - 1] : 0, M = a && h ? o[c - n - 1] : 0, w = u + y + d + p + g + m + x + M;
								if (w < 2 || w > 6) continue;
								let b = 0;
								if (0 === u && 1 === y && b++, 0 === y && 1 === d && b++, 0 === d && 1 === p && b++, 0 === p && 1 === g && b++, 0 === g && 1 === m && b++, 0 === m && 1 === x && b++, 0 === x && 1 === M && b++, 0 === M && 1 === u && b++, 1 === b) {
									if (0 === t) {
										if (u * d * g !== 0 || d * g * x !== 0) continue;
									} else if (u * d * x !== 0 || u * g * x !== 0) continue;
									s[r++] = c;
								}
							}
						}
						if (r > 0) {
							i = !0;
							for (let t = 0; t < r; t++) o[s[t]] = 0;
						}
					}
				}
				return {
					width: n,
					height: e,
					data: o
				};
			}(A);
			t.progress(.4), await t.tick(), t.tracing && t.emitStep(() => ({
				code: "thin",
				label: "Skeleton",
				rasters: [$i(n, "Zhang–Suen skeleton")],
				metrics: { strokePixels: Math.round(Bi(n) * n.data.length) }
			}));
			const e = o.strokeWidth <= 0, r = e ? an(A) : void 0, a = e ? function(t, n) {
				const e = an(t), r = n.data, o = new Float32Array(e.length);
				let s = 0;
				for (let l = 0; l < r.length; l++) 0 !== r[l] && (o[s++] = 2 * e[l]);
				if (0 === s) return 1;
				const i = o.subarray(0, s);
				i.sort();
				const a = s >> 1;
				return s % 2 == 1 ? i[a] : (i[a - 1] + i[a]) / 2;
			}(A, n) : o.strokeWidth, l = function(t, n) {
				const { width: e, height: r, data: o } = t, s = (t, n) => t >= 0 && t < e && n >= 0 && n < r ? o[n * e + t] : 0, i = (t, n, e) => {
					let r = 0;
					for (let o = -1; o <= 1; o++) for (let i = -1; i <= 1; i++) 0 === i && 0 === o || 0 !== s(t + i, n + o) && (0 === i || 0 === o || 0 === s(t + i, n) && 0 === s(t, n + o)) && (e[2 * r] = t + i, e[2 * r + 1] = n + o, r++);
					return r;
				}, a = (t, n) => n * e + t, l = new Int8Array(e * r), c = new Array(16);
				for (let m = 0; m < r; m++) for (let t = 0; t < e; t++) 0 !== o[a(t, m)] && (l[a(t, m)] = i(t, m, c));
				const h = new Uint16Array(e * r), f = (t, n, e, r) => {
					h[a(t, n)] |= 1 << Lf(e - t, r - n), h[a(e, r)] |= 1 << Lf(t - e, n - r);
				}, u = (t, n, e, r) => !!(h[a(t, n)] & 1 << Lf(e - t, r - n)), y = [], d = (t, n) => 2 !== l[a(t, n)], p = (t, n, e, r) => {
					const o = [t + .5, n + .5];
					let s = t, h = n, u = e, y = r;
					for (f(s, h, u, y); o.push(u + .5, y + .5), !(d(u, y) || u === t && y === n);) {
						const t = i(u, y, c);
						let n = -1, e = -1;
						for (let r = 0; r < t; r++) {
							const t = c[2 * r], o = c[2 * r + 1];
							if (t !== s || o !== h) {
								n = t, e = o;
								break;
							}
						}
						if (-1 === n) break;
						f(u, y, n, e), s = u, h = y, u = n, y = e;
					}
					const p = u === t && y === n && o.length > 4;
					return {
						points: o,
						startKind: l[a(t, n)] >= 3 ? 1 : 0,
						endKind: p || l[a(u, y)] >= 3 ? 1 : 0,
						closed: p,
						merged: !1
					};
				};
				for (let m = 0; m < r; m++) for (let t = 0; t < e; t++) {
					if (0 === o[a(t, m)] || !d(t, m)) continue;
					const n = i(t, m, c), e = c.slice(0, 2 * n);
					for (let r = 0; r < n; r++) {
						const n = e[2 * r], o = e[2 * r + 1];
						u(t, m, n, o) || y.push(p(t, m, n, o));
					}
				}
				for (let m = 0; m < r; m++) for (let t = 0; t < e; t++) {
					if (0 === o[a(t, m)] || 2 !== l[a(t, m)]) continue;
					const n = i(t, m, c), e = c.slice(0, 2 * n);
					for (let r = 0; r < n; r++) {
						const n = e[2 * r], o = e[2 * r + 1];
						if (!u(t, m, n, o)) {
							const e = p(t, m, n, o);
							e.closed = !0, y.push(e);
						}
					}
				}
				const g = y.filter((t) => {
					if (t.closed) return !0;
					const e = m(t.points), r = 0 === t.startKind != (0 === t.endKind) && e < n.pruneLength, o = 0 === t.startKind && 0 === t.endKind && e < Math.min(2, n.pruneLength);
					return !r && !o;
				});
				(function(t) {
					const n = /* @__PURE__ */ new Map();
					for (const r of t) {
						if (r.closed) continue;
						const t = r.points, e = t.length >> 1;
						if (!(e < 2)) {
							if (1 === r.startKind) {
								const o = a(Math.floor(t[0]), Math.floor(t[1])), s = Math.min(3, e - 1);
								n.set(o, [...n.get(o) ?? [], {
									chain: r,
									atStart: !0,
									key: o,
									dirX: t[2 * s] - t[0],
									dirY: t[2 * s + 1] - t[1]
								}]);
							}
							if (1 === r.endKind) {
								const o = a(Math.floor(t[2 * (e - 1)]), Math.floor(t[2 * (e - 1) + 1])), s = Math.min(3, e - 1);
								n.set(o, [...n.get(o) ?? [], {
									chain: r,
									atStart: !1,
									key: o,
									dirX: t[2 * (e - 1 - s)] - t[2 * (e - 1)],
									dirY: t[2 * (e - 1 - s) + 1] - t[2 * (e - 1) + 1]
								}]);
							}
						}
					}
					const e = /* @__PURE__ */ new Set();
					for (const r of n.values()) {
						const t = r.filter((t) => !t.chain.merged && !e.has(t.chain)), n = [];
						for (let e = 0; e < t.length; e++) for (let r = e + 1; r < t.length; r++) {
							const o = t[e], s = t[r];
							if (o.chain === s.chain) continue;
							const i = Math.hypot(o.dirX, o.dirY) || 1, a = Math.hypot(s.dirX, s.dirY) || 1, l = (o.dirX * s.dirX + o.dirY * s.dirY) / (i * a);
							n.push([
								o,
								s,
								l
							]);
						}
						n.sort((t, n) => t[2] - n[2]);
						for (const [r, o, s] of n) {
							if (s > -.5) break;
							e.has(r.chain) || e.has(o.chain) || r.chain.merged || o.chain.merged || (w(r, o), e.add(r.chain), e.add(o.chain));
						}
					}
				})(g);
				const x = [];
				for (const b of g) {
					if (b.merged) continue;
					const t = n.distanceField ? Uf(b.points, n.distanceField, e, r) : void 0;
					let o = b.points;
					if (n.smoothing > 0 && (o = qf(o, Math.round(2 * n.smoothing), b.closed)), n.simplifyTolerance > 0 && (o = Cf(o, n.simplifyTolerance)), o.length < 4) continue;
					const s = [], i = o.length >> 1;
					for (let e = 1; e < i - 1; e++) M(o[2 * (e - 1)], o[2 * (e - 1) + 1], o[2 * e], o[2 * e + 1], o[2 * (e + 1)], o[2 * (e + 1) + 1]) < n.cornerThreshold && s.push(e);
					const a = [{
						type: "M",
						x: o[0],
						y: o[1]
					}];
					a.push(...qa(o, n.fitTolerance, s)), b.closed && a.push({ type: "Z" }), x.push({
						commands: a,
						closed: b.closed,
						length: m(o),
						width: t
					});
				}
				return x.sort((t, n) => n.length - t.length), x;
				function w(t, n) {
					const e = t.atStart ? $f(t.chain.points) : t.chain.points.slice(), r = n.atStart ? n.chain.points.slice() : $f(n.chain.points), o = e.concat(r.slice(2)), s = t.chain;
					s.points = o, s.startKind = t.atStart ? t.chain.endKind : t.chain.startKind, s.endKind = n.atStart ? n.chain.endKind : n.chain.startKind, n.chain.merged = !0;
				}
			}(n, {
				pruneLength: o.pruneLength,
				cornerThreshold: o.cornerThreshold,
				fitTolerance: o.fitTolerance,
				simplifyTolerance: o.simplifyTolerance,
				smoothing: o.smoothing,
				distanceField: r
			});
			for (const t of l) {
				const n = e ? t.width ?? a : a;
				s.push({
					commands: t.commands,
					stroke: o.fillColor,
					strokeWidth: rM(n),
					strokeLinecap: "round",
					strokeLinejoin: "round"
				});
			}
			t.progress(1);
		}
		var F;
	}(w, W, G, y, rt, A, 0, s?.edgeHint, L ? k : void 0, U, {
		helpers: R,
		scope: ht,
		serial: j,
		serialize: ct
	}, "planar" === p ? {
		onStage: i?.onPlanarStage,
		solveKernel: i?.solveKernel,
		frontEnd: g,
		soft: V,
		edgeNoise: Q,
		clean: Y,
		source: _
	} : void 0, Z), h > 1 || O > 0) {
		const t = 1 / h;
		for (let n = 0; n < rt.length; n++) {
			const e = rt[n];
			rt[n] = {
				...e,
				commands: b(e.commands, t, -O, -O),
				...void 0 !== e.strokeWidth ? { strokeWidth: e.strokeWidth * t } : {},
				...void 0 !== e.primitive ? { primitive: Rm(e.primitive, t, -O) } : {},
				...void 0 !== e.strokedPrimitive ? { strokedPrimitive: {
					primitive: Rm(e.strokedPrimitive.primitive, t, -O),
					width: e.strokedPrimitive.width * t
				} } : {}
			};
		}
		for (let n = 0; n < ot.length; n++) ot[n] = bx(ot[n], t, -O);
	}
	w.tracing && w.emitStep(() => ({
		code: "trace",
		label: "Trace & fit",
		charts: [Ti(rt)],
		metrics: {
			shapes: rt.length,
			nodes: ji(rt),
			gradients: ot.length
		},
		notes: ["centerline" === y.mode ? "Centerline strokes fitted from the skeleton." : `Layering: ${y.layering}; curves: ${y.curveMode}.`]
	})), w.stage("svg");
	const ft = y.groupByColor && ("color" === y.mode || "grayscale" === y.mode), ut = function(t, n, e) {
		const r = Lg(n.precision), o = !0 === n.optimizePaths, s = !0 === n.roundPrimitives, i = o && !0 === n.compactPaths, a = Ug(t.width, r), l = Ug(t.height, r);
		let c, h;
		if ("mm" === t.unit) {
			const n = void 0 !== t.widthMm && t.widthMm > 0 ? t.widthMm : t.width / 96 * 25.4, e = t.width > 0 ? n * (t.height / t.width) : 0;
			c = `${Ug(n, 3)}mm`, h = `${Ug(e, 3)}mm`;
		} else c = a, h = l;
		const f = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a} ${l}" width="${c}" height="${h}">`, u = ["<!-- Trazor: traced client-side -->"];
		if (void 0 !== t.title && "" !== t.title && u.push(`<title>${pm(t.title)}</title>`), void 0 !== t.desc && "" !== t.desc && u.push(`<desc>${pm(t.desc)}</desc>`), void 0 !== t.defs && t.defs.length > 0) {
			const e = t.defs.map((t) => function(t, n) {
				const e = (t) => Ug(t, n), r = t.stops.map((t) => {
					const n = void 0 !== t.opacity && t.opacity < 1 ? ` stop-opacity="${Ug(t.opacity, 3)}"` : "";
					return `<stop offset="${Ug(t.offset, 3)}" stop-color="${gm(t.color, "stop-color")}"${n}/>`;
				}).join(""), o = pm(t.id);
				return "linear" === t.kind ? `<linearGradient id="${o}" gradientUnits="userSpaceOnUse" x1="${e(t.x1)}" y1="${e(t.y1)}" x2="${e(t.x2)}" y2="${e(t.y2)}">${r}</linearGradient>` : `<radialGradient id="${o}" gradientUnits="userSpaceOnUse"${void 0 !== t.aspect && 1 !== t.aspect ? ` gradientTransform="translate(${e(t.cx)} ${e(t.cy)}) rotate(${Ug(180 * (t.angle ?? 0) / Math.PI, 2)}) scale(1 ${Ug(1 / t.aspect, 4)}) translate(${e(-t.cx)} ${e(-t.cy)})"` : ""} cx="${e(t.cx)}" cy="${e(t.cy)}" r="${e(t.r)}">${r}</radialGradient>`;
			}(t, r));
			u.push(!0 === n.pretty ? `<defs>\n    ${e.join("\n    ")}\n  </defs>` : `<defs>${e.join("")}</defs>`);
		}
		if (!0 === n.groupByLayer || !0 === n.groupByColor) {
			const a = !0 === n.groupByLayer ? function(t) {
				const n = [];
				let e = null;
				for (let r = 0; r < t.length; r++) {
					const o = t[r].layerId;
					null === e || void 0 === o || o !== e.id ? (e = {
						indices: [r],
						id: o
					}, n.push({
						key: km(t[r]),
						indices: e.indices
					})) : e.indices.push(r);
				}
				return n;
			}(t.shapes) : function(t) {
				const n = [], e = /* @__PURE__ */ new Map();
				for (let r = 0; r < t.length; r++) {
					const o = km(t[r]);
					let s = e.get(o);
					void 0 === s && (s = [], e.set(o, s), n.push({
						key: o,
						indices: s
					})), s.push(r);
				}
				return n;
			}(t.shapes);
			let l = 0;
			for (const c of a) {
				const a = Am(t.shapes, c.indices, r, o, s, i, e);
				if (0 === a.length) continue;
				l++;
				const h = `<g id="layer-${l}"><title>${pm(c.key)}</title>`;
				u.push(!0 === n.pretty ? `${h}\n    ${a.join("\n    ")}\n  </g>` : `${h}${a.join("")}</g>`);
			}
		} else {
			const n = t.shapes.map((t, n) => n);
			for (const a of Am(t.shapes, n, r, o, s, i, e)) u.push(a);
		}
		if (void 0 !== t.texts) for (const y of t.texts) {
			const t = wm(y, r);
			"" !== t && u.push(t);
		}
		return !0 === n.pretty ? `${f}\n  ${u.join("\n  ")}\n</svg>\n` : `${f}${u.join("")}</svg>`;
	}({
		width: nt,
		height: et,
		unit: y.unit,
		widthMm: "mm" === y.unit ? y.widthMm : void 0,
		title: y.svgTitle || void 0,
		defs: ot.length > 0 ? ot : void 0,
		shapes: rt
	}, {
		precision: y.precision,
		optimizePaths: y.optimizeSvg,
		compactPaths: lt,
		roundPrimitives: at,
		groupByColor: ft && "cutout" === y.layering,
		groupByLayer: ft && "cutout" !== y.layering
	}, it.length === rt.length ? it : void 0);
	w.progress(.6);
	const yt = function(t) {
		const n = (t.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g) ?? []).length;
		let e = 0;
		for (const c of t.matchAll(/(?<![\w-])d\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) e += (vg(c, 1).match(/[MLHVQCTSAmlhvqctsa]/g) ?? []).length;
		const r = [];
		for (const c of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) r.push({
			index: c.index ?? 0,
			value: vg(c, 1)
		});
		for (const c of t.matchAll(/(?<![\w-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			const t = vg(c, 1);
			for (const n of t.matchAll(/(?<![\w-])(?:fill|stroke|stop-color)\s*:\s*([^;"']+)/g)) r.push({
				index: (c.index ?? 0) + (n.index ?? 0),
				value: n[1]
			});
		}
		r.sort((t, n) => t.index - n.index);
		const o = [], s = /* @__PURE__ */ new Set();
		for (const { value: c } of r) {
			const t = kg(c);
			null === t || s.has(t) || (s.add(t), o.push(t));
		}
		let i = null, a = null;
		const l = /(?<![\w-])viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(t);
		if (null !== l) {
			const t = vg(l, 1).trim().split(/[\s,]+/);
			if (t.length >= 4) {
				const n = Number(t[2]), e = Number(t[3]);
				Number.isFinite(n) && (i = n), Number.isFinite(e) && (a = e);
			}
		}
		return {
			pathCount: n,
			nodeCount: e,
			colorCount: o.length,
			palette: o,
			byteLength: new TextEncoder().encode(t).length,
			width: i,
			height: a
		};
	}(ut);
	w.tracing && w.emitStep(() => ({
		code: "serialize",
		label: "Serialize SVG",
		charts: [Ei(rt)],
		metrics: {
			paths: yt.pathCount,
			nodes: yt.nodeCount,
			colors: yt.colorCount,
			bytes: yt.byteLength
		},
		notes: [y.optimizeSvg ? "Path optimization on." : "Path optimization off."]
	})), 0 === rt.length && A.push({
		code: "empty-result",
		severity: "warning",
		message: "No shapes were produced — check threshold/background settings."
	}), yt.nodeCount > 2e4 && A.push({
		code: "node-count",
		severity: "info",
		message: `${yt.nodeCount.toLocaleString()} nodes — consider more smoothing or a smaller max size for editing/cutting.`,
		params: { count: yt.nodeCount }
	}), "mm" === y.unit && function(t, n, e, r) {
		const o = S(n, e.widthMm);
		let s = 1 / 0;
		for (const i of t) {
			let t = 1 / 0, n = 1 / 0, e = -1 / 0, r = -1 / 0;
			for (const o of i.commands) "Z" !== o.type && (o.x < t && (t = o.x), o.y < n && (n = o.y), o.x > e && (e = o.x), o.y > r && (r = o.y));
			t < 1 / 0 && (s = Math.min(s, Math.min(e - t, r - n)));
		}
		s < 1 / 0 && s * o < 1 && r.push({
			code: "tiny-features",
			severity: "warning",
			message: `Smallest shape is ~${(s * o).toFixed(2)} mm — most blades/lasers cannot cut below 1 mm cleanly.`,
			params: { mm: (s * o).toFixed(2) }
		});
	}(rt, nt, y, A), ot.length > 0 && ("mm" === y.unit || y.groupByColor) && A.push({
		code: "gradient-spot-color",
		severity: "info",
		message: `${ot.length} gradient fill${1 === ot.length ? "" : "s"} won't reproduce on spot-color cutters/printers — turn off gradient detection for those outputs.`,
		params: { count: ot.length }
	});
	const dt = w.finish();
	return {
		svg: ut,
		width: nt,
		height: et,
		palette: st,
		stats: {
			pathCount: yt.pathCount,
			nodeCount: yt.nodeCount,
			colorCount: yt.colorCount,
			byteLength: yt.byteLength,
			durationMs: P() - x,
			stages: dt
		},
		warnings: A,
		document: i?.withDocument ? wx(rt, ot, nt, et, y) : void 0
	};
}
function Fx(t, n, e) {
	return t.map((t) => yf(t.points, n, e ? function(t, n, e, r, o, s, i, a = 1) {
		const l = t.length >> 1, c = 1 * a, h = Math.max(1, Math.round(3 * a)), f = Math.max(1, Math.round(4 * a)), u = Math.max(1, Math.round(2 * a) - 1), y = new Uint8Array(l), d = new Int8Array(l);
		let p = !1;
		const g = (t, n) => t >= 0 && n >= 0 && t < s && n < i;
		for (let x = 0; x < l; x++) {
			const i = x + 1 < l ? x + 1 : 0, a = t[2 * x], c = t[2 * x + 1], h = t[2 * i] - a, f = t[2 * i + 1] - c;
			let m, M, w, b;
			if (h > 0 ? (m = a, M = c, w = a, b = c - 1) : h < 0 ? (m = a - 1, M = c - 1, w = a - 1, b = c) : f > 0 ? (m = a - 1, M = c, w = a, b = c) : (m = a, M = c - 1, w = a - 1, b = c - 1), !g(m, M) || !g(w, b)) continue;
			const A = M * s + m, k = b * s + w, v = 0 !== n[A];
			if (v === (0 !== n[k])) continue;
			d[x] = v ? 1 : -1;
			const F = e[v ? A : k];
			if (F < 0 || r[F] <= o) continue;
			const I = v ? m + u * (m - w) : w + u * (w - m), N = v ? M + u * (M - b) : b + u * (b - M);
			g(I, N) && e[N * s + I] === F && (y[x] = 1, p = !0);
		}
		if (!p) return;
		Cm(y, 0, f), Cm(y, 1, f);
		const m = new Float64Array(l);
		p = !1;
		for (let x = 0; x < l; x++) {
			let t = 0;
			for (; t < h && 1 === y[(x - 1 - t + l * h) % l] && 1 === y[(x + t) % l];) t++;
			0 !== t && 0 !== d[x] && (m[x] = d[x] * c * t / h, p = !0);
		}
		return p ? m : void 0;
	}(t.points, e.mask, e.labels, e.position, e.layer, e.width, e.height, e.scale) : void 0));
}
function Ix(t, n, e, r) {
	const o = r(t, n), s = new Int32Array(n.length).fill(-1);
	o.forEach((t, n) => s[t] = n);
	const i = e.filter((t) => {
		const n = s[t.surround] - s[t.label];
		return s[t.label] >= 0 && s[t.surround] >= 0 && n >= 2;
	});
	let a = t.data, l = o;
	if (i.length > 0) {
		const e = new Int32Array(t.data);
		for (const t of i) for (const n of t.pixels) e[n] = t.surround;
		const o = new Uint32Array(n.length);
		for (let t = 0; t < e.length; t++) {
			const n = e[t];
			n >= 0 && o[n]++;
		}
		a = e, l = r({
			width: t.width,
			height: t.height,
			data: e,
			count: t.count
		}, o);
	}
	const c = /* @__PURE__ */ new Map();
	for (const f of i) {
		let t = c.get(f.label);
		void 0 === t && (t = [], c.set(f.label, t));
		for (const n of f.pixels) t.push(n);
	}
	const h = [...c.keys()].toSorted((t, n) => t - n).map((t) => ({
		label: t,
		pixels: c.get(t)
	}));
	return {
		stackLabels: a,
		labelCount: n.length,
		order: l,
		islands: h
	};
}
const Nx = .8, Sx = 3;
function Px(t, n, e, r = sn(t)) {
	return Ix(t, n, r, (t, n) => function(t, n) {
		const e = [];
		for (let r = 0; r < t.length; r++) t[r] > 0 && r !== n && e.push(r);
		return e.sort((n, e) => t[e] - t[n]), e.unshift(n), e;
	}(n, e));
}
function Cx(t, n) {
	const e = t.stackLabels, r = e.length, { order: o } = t, s = new Int32Array(t.labelCount + 1);
	for (let p = 0; p < r; p++) e[p] >= 0 && s[e[p] + 1]++;
	for (let p = 0; p < t.labelCount; p++) s[p + 1] += s[p];
	const i = new Int32Array(s[t.labelCount]), a = s.slice(0, t.labelCount);
	for (let p = 0; p < r; p++) e[p] >= 0 && (i[a[e[p]]++] = p);
	const l = new Int32Array(r).fill(-1), c = new Int32Array(r), h = new Int32Array(r).fill(-1), f = (t) => {
		let n = t;
		for (; l[n] !== n;) n = l[n];
		for (; l[t] !== n;) {
			const e = l[t];
			l[t] = n, t = e;
		}
		return n;
	}, u = (t, n) => {
		const e = f(t), r = f(n);
		if (e === r) return void (c[e] -= 2);
		const o = e < r ? e : r, s = e < r ? r : e;
		l[s] = o, c[o] += c[s] - 2;
	};
	let y = 0;
	for (let p = o.length - 1; p >= 0; p--) {
		const t = o[p];
		for (let e = s[t]; e < s[t + 1]; e++) {
			const t = i[e];
			l[t] = t, c[t] = 4;
			const o = t - (t / n | 0) * n;
			o > 0 && l[t - 1] >= 0 && u(t, t - 1), o < n - 1 && l[t + 1] >= 0 && u(t, t + 1), t >= n && l[t - n] >= 0 && u(t, t - n), t < r - n && l[t + n] >= 0 && u(t, t + n);
		}
		for (let n = s[t]; n < s[t + 1]; n++) {
			const t = f(i[n]);
			h[t] !== p && (h[t] = p, y += c[t]);
		}
	}
	const d = new Uint8Array(r);
	for (const p of t.islands) {
		for (const t of p.pixels) d[t] = 1;
		for (const t of p.pixels) {
			const e = t - (t / n | 0) * n;
			0 !== e && 0 !== d[t - 1] || y++, e !== n - 1 && 0 !== d[t + 1] || y++, (t < n || 0 === d[t - n]) && y++, (t >= r - n || 0 === d[t + n]) && y++;
		}
		for (const t of p.pixels) d[t] = 0;
	}
	return y;
}
function Ux(t, n, e, r) {
	const o = e?.stack;
	if (o) return r && xx(r).stackHits++, o;
	r && xx(r).stackMisses++;
	const s = function(t, n) {
		const e = Gx(t), r = sn(t), o = function(t, n) {
			const e = [];
			for (let o = 0; o < n.length; o++) n[o] > 0 && e.push(o);
			if (e.sort((e, r) => t[r] - t[e] || n[r] - n[e] || e - r), 0 === e.length) return [];
			const r = Nx * t[e[0]];
			return e.filter((n) => t[n] >= r).slice(0, Sx);
		}(e, n);
		if (o.length < 2) return Ix(t, n, r, Zx);
		let s, i = 1 / 0;
		for (const a of o) {
			const e = Px(t, n, a, r), o = Cx(e, t.width);
			o < i && (i = o, s = e);
		}
		return s;
	}(t, n);
	if (e) {
		for (const t of r?.palette?.values() ?? []) t !== e && (t.stack = void 0);
		e.stack = s;
	}
	return s;
}
function Lx(t, n) {
	const e = n.helpers;
	if (!e) return;
	const r = `#${n.serial}|edges`;
	return async (n, o) => {
		const s = n.edges.length, i = n.edges.map((t, e) => mg(n, e)), a = n.edges.map(qx), l = Sm(a, e.size + 1);
		e.setEdges(r, {
			width: n.width,
			height: n.height,
			cfg: o,
			edges: i
		}, l);
		const c = new Array(s);
		return await $x(t, e, {
			kind: "fit-edges",
			total: s,
			stateKey: r,
			owners: l,
			batch: Ex
		}, (t) => c[t] = xg(i[t], n, o), (t) => c[t.unit] = t.fit, a, Tx), c;
	};
}
async function $x(t, n, e, r, o, s, i) {
	const a = n.size, l = new AbortController(), c = async function(t, n, e) {
		let r = 0;
		for await (const o of n) e(o), r++, 0 === (r & zx) && await t.tick();
	}(t, n.dispatch({
		...e,
		signal: l.signal
	}), o);
	c.catch(() => {});
	try {
		let n = 0;
		for (let o = 0; o < e.total; o++) e.owners[o] === a && (r(o), n += s[o], n >= i && (n = 0, await t.tick()));
	} catch (h) {
		throw l.abort(), h;
	}
	await c;
}
function qx(t) {
	const n = t.points.length >> 1;
	return -1 === t.left || -1 === t.right ? 2 * n : n * Math.min(n, Rx) * (t.closed ? 2 : 1);
}
const Rx = 32, zx = 63, Tx = 6e3, Ex = 16, jx = 16, Bx = 5e4;
function Ox(t) {
	return "primitive" in t ? t.primitive : null;
}
const Kx = 255, Dx = 256, Hx = 255, Xx = 64;
function Wx(t) {
	const { data: r } = t;
	for (let o = 0; o < r.length; o += 4) {
		const t = e(r[o] / 255, r[o + 1] / 255, r[o + 2] / 255)[0], s = Math.round(255 * n(Math.min(1, Math.max(0, t * t * t))));
		r[o] = s, r[o + 1] = s, r[o + 2] = s;
	}
}
function Gx(t) {
	const { data: n, width: e, height: r } = t, o = new Float64Array(t.count);
	for (let s = 0; s < r; s++) for (let t = 0; t < e; t++) {
		const i = s * e + t, a = n[i];
		a < 0 || ((t + 1 >= e || n[i + 1] !== a) && o[a]++, (t - 1 < 0 || n[i - 1] !== a) && o[a]++, (s + 1 >= r || n[i + e] !== a) && o[a]++, (s - 1 < 0 || n[i - e] !== a) && o[a]++);
	}
	return o;
}
function Zx(t, n) {
	const e = [];
	for (let r = 0; r < n.length; r++) n[r] > 0 && e.push(r);
	if (e.sort((t, e) => n[e] - n[t]), e.length > 1) {
		const n = Gx(t);
		let r = e[0], o = n[r];
		for (const t of e) n[t] > o && (o = n[t], r = t);
		const s = e.indexOf(r);
		s > 0 && (e.splice(s, 1), e.unshift(r));
	}
	return e;
}
function Qx(t, n, e, r, o, s) {
	if (!s.gradients || null !== s.palette || "pixel" === s.curveMode) return;
	const i = s.gradientStrength, a = Lt(t, n, {
		alpha: o ?? void 0,
		minArea: s.gradientMinArea > 0 ? s.gradientMinArea : Math.max(64 * s.supersample ** 2, s.minRegionArea),
		maxBacktrack: .06 + .18 * i,
		minColorSpan: .09 - .08 * i,
		detectMaxDimension: s.gradientMaxDimension
	});
	if (!a.gradients.some((t) => null !== t)) return;
	const l = a.labels.count, c = e.slice(), h = new Uint8Array(3 * l);
	h.set(r.subarray(0, Math.min(r.length, 3 * l)));
	for (let f = e.length; f < l; f++) {
		const t = a.parentLabel[f];
		c.push(e[t]), h[3 * f] = r[3 * t], h[3 * f + 1] = r[3 * t + 1], h[3 * f + 2] = r[3 * t + 2];
	}
	return {
		gradients: a.gradients,
		underlays: a.underlays,
		labels: a.labels,
		paletteHex: c,
		paletteRgb: h
	};
}
function Yx(t) {
	const n = new Uint32Array(t.count);
	for (let e = 0; e < t.data.length; e++) {
		const r = t.data[e];
		r >= 0 && n[r]++;
	}
	return n;
}
const _x = 16;
function Vx(t, n, e) {
	const r = e + 1 >> 1;
	let o = 0, s = 0;
	for (; s < 255 && (o += t[n + s], !(o >= r)); s++);
	return s;
}
function Jx(t, n, e, r, o, s) {
	if (null === e) return;
	const i = n.data, a = t.data, l = new Uint32Array(r), h = new Uint32Array(r), f = new Uint32Array(256 * r), u = new Uint32Array(768 * r);
	for (let c = 0; c < i.length; c++) {
		const t = i[c];
		if (t < 0 || t >= r) continue;
		h[t]++;
		const n = e[c];
		if (n < 8 || n >= 250) continue;
		l[t]++, f[256 * t + n]++;
		const o = 4 * c, s = 255 / n;
		let y = Math.round((a[o] - 255) * s + 255), d = Math.round((a[o + 1] - 255) * s + 255), p = Math.round((a[o + 2] - 255) * s + 255);
		y = y < 0 ? 0 : y > 255 ? 255 : y, d = d < 0 ? 0 : d > 255 ? 255 : d, p = p < 0 ? 0 : p > 255 ? 255 : p;
		const g = 768 * t;
		u[g + y]++, u[g + 256 + d]++, u[g + 512 + p]++;
	}
	let y, d;
	for (let p = 0; p < r; p++) {
		if (o?.[p]) continue;
		if (l[p] < _x * s || 2 * l[p] < h[p]) continue;
		const t = Vx(f, 256 * p, l[p]);
		if (t < 8 || t >= 250) continue;
		const n = Vx(u, 768 * p, l[p]), e = Vx(u, 768 * p + 256, l[p]), i = Vx(u, 768 * p + 512, l[p]);
		(y ??= new Array(r))[p] = Math.round(t / 255 * 1e3) / 1e3, (d ??= new Array(r))[p] = c(n, e, i);
	}
	return y && d ? {
		opacity: y,
		inkHex: d
	} : void 0;
}
function tM(t, n) {
	for (const e of n) t.includes(e) || t.push(e);
}
function nM(t, n) {
	const [r, o, i] = function(t) {
		const { width: n, height: e, data: r } = t;
		if (n <= 0 || e <= 0) return [
			255,
			255,
			255
		];
		const o = /* @__PURE__ */ new Map(), s = (t) => {
			const n = 4 * t, e = r[n] << 16 | r[n + 1] << 8 | r[n + 2];
			o.set(e, (o.get(e) ?? 0) + 1);
		};
		for (let l = 0; l < n; l++) s(l);
		if (e > 1) for (let l = 0; l < n; l++) s((e - 1) * n + l);
		for (let l = 1; l < e - 1; l++) s(l * n), n > 1 && s(l * n + n - 1);
		let i = 0, a = -1;
		for (const [l, c] of o) c > a && (a = c, i = l);
		return [
			i >> 16 & 255,
			i >> 8 & 255,
			255 & i
		];
	}(t), [l, c, h] = e(r / 255, o / 255, i / 255);
	let f = -1, u = 1 / 0;
	for (let y = 0; y < n.length; y++) {
		const t = a(n[y]);
		if (!t) continue;
		const [r, o, i] = e(t[0] / 255, t[1] / 255, t[2] / 255), d = s(r, o, i, l, c, h);
		d < u && (u = d, f = y);
	}
	return f;
}
const eM = .35;
function rM(t) {
	return Math.round(100 * t) / 100;
}
(function(t) {
	const n = /* @__PURE__ */ new Set();
	let e = 0;
	const r = {};
	let o, s, i;
	const a = (n, e) => t.postMessage(n, e);
	t.addEventListener("message", (t) => {
		const l = t.data;
		if ("cancel" === l.type) return void n.add(l.id);
		if ("helpers" === l.type) return void (o = l.ports.length > 0 ? new Pm(l.ports) : void 0);
		if ("solve-kernel" === l.type) {
			const t = l.module, n = i;
			i = (async () => {
				await n, s = null === t ? void 0 : await async function(t) {
					const n = t instanceof WebAssembly.Module ? t : await WebAssembly.compile(t), e = (await WebAssembly.instantiate(n, { env: { memory: new WebAssembly.Memory({ initial: 256 }) } })).exports.__heap_base.value;
					return new qy(n, e);
				}(t).catch(() => {});
			})();
			return;
		}
		if ("vectorize" !== l.type) return;
		const { id: c, width: h, height: f, buffer: u, settings: y, edgeHint: d, imageId: g, trace: m } = l;
		(async function(t, l, c, h, f, u, y) {
			try {
				void 0 !== i && await i;
				const d = await vx(l, c, {
					edgeHint: h,
					shouldCancel: () => n.has(t),
					onProgress: (n, r) => {
						const o = Date.now();
						(r >= 1 || o - e > 40) && (e = o, a({
							type: "progress",
							id: t,
							stage: n,
							overall: r
						}));
					},
					onTrace: u ? (n) => {
						return a({
							type: "trace-step",
							id: t,
							step: n
						}, (e = n.rasters) ? e.map((t) => t.data.buffer) : []);
						var e;
					} : void 0
				}, {
					imageId: f,
					cache: r,
					withDocument: y,
					helpers: o,
					solveKernel: s
				});
				n.has(t) ? a({
					type: "error",
					id: t,
					message: "cancelled",
					cancelled: !0
				}) : a({
					type: "result",
					id: t,
					result: d
				});
			} catch (d) {
				const n = d instanceof p;
				a({
					type: "error",
					id: t,
					message: n ? "cancelled" : d instanceof Error ? d.message : String(d),
					cancelled: n
				});
			} finally {
				n.delete(t);
			}
		})(c, {
			width: h,
			height: f,
			data: new Uint8ClampedArray(u)
		}, y, d ? {
			width: h,
			height: f,
			data: new Float32Array(d)
		} : void 0, g, m, l.withDocument);
	});
})(self);
