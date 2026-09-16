function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function e(t) {
	return t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
}
function n(e, n, o) {
	const r = t(e), a = t(n), s = t(o), l = Math.cbrt(.4122214708 * r + .5363325363 * a + .0514459929 * s), i = Math.cbrt(.2119034982 * r + .6806995451 * a + .1073969566 * s), c = Math.cbrt(.0883024619 * r + .2817188376 * a + .6299787005 * s);
	return [
		.2104542553 * l + .793617785 * i - .0040720468 * c,
		1.9779984951 * l - 2.428592205 * i + .4505937099 * c,
		.0259040371 * l + .7827717662 * i - .808675766 * c
	];
}
function o(t) {
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function r(t) {
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
function s(t, e, n) {
	return `#${a(t)}${a(e)}${a(n)}`;
}
function l(t, n, r) {
	const [a, l, i] = function(t, n, r) {
		const a = t + .3963377774 * n + .2158037573 * r, s = t - .1055613458 * n - .0638541728 * r, l = t - .0894841775 * n - 1.291485548 * r, i = a * a * a, c = s * s * s, f = l * l * l, u = -1.2684380046 * i + 2.6097574011 * c - .3413193965 * f, h = -.0041960863 * i - .7034186147 * c + 1.707614701 * f;
		return [
			o(e(4.0767416621 * i - 3.3077115913 * c + .2309699292 * f)),
			o(e(u)),
			o(e(h))
		];
	}(t, n, r);
	return s(255 * a, 255 * l, 255 * i);
}
function i(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function c(t, e, n) {
	return i(Math.round(t), e, n);
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
	precision: 1,
	optimizeSvg: !0,
	groupByColor: !1,
	unit: "px",
	widthMm: 0,
	svgTitle: "",
	detectIslands: !1
});
const f = (() => {
	const e = /* @__PURE__ */ new Float64Array(256);
	for (let n = 0; n < 256; n++) e[n] = t(n / 255);
	return e;
})();
function u(t) {
	const { width: e, height: n, data: o } = t, r = e * n, a = new Float32Array(3 * r);
	for (let s = 0, l = 0, i = 0; s < r; s++, l += 4, i += 3) {
		const t = f[o[l]], e = f[o[l + 1]], n = f[o[l + 2]], r = Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n), s = Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n), c = Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
		a[i] = .2104542553 * r + .793617785 * s - .0040720468 * c, a[i + 1] = 1.9779984951 * r - 2.428592205 * s + .4505937099 * c, a[i + 2] = .0259040371 * r + .7827717662 * s - .808675766 * c;
	}
	return a;
}
const h = .018 * .018, d = 144e-6;
function p(t, e, n, o, r, a) {
	const s = e * e + n * n;
	if (s < h) return o;
	const l = r[3 * o + 1], i = r[3 * o + 2], c = l * l + i * i;
	if (c < d) return o;
	const f = e * l + n * i;
	if (f > 0 && f * f >= .5 * s * c) return o;
	let u = -1, p = .0081;
	for (let h = 0, g = 0; h < a; h++, g += 3) {
		if (h === o) continue;
		const a = r[g + 1], l = r[g + 2], i = a * a + l * l;
		let c = i < d;
		if (!c) {
			const t = e * a + n * l;
			c = t > 0 && t * t >= .5 * s * i;
		}
		if (!c) continue;
		const f = t - r[g], M = e - a, y = n - l, w = f * f + M * M + y * y;
		w < p && (p = w, u = h);
	}
	return u >= 0 ? u : o;
}
function g(t, e, n, o, r, a, s, l, i) {
	const c = new Uint32Array(n), f = /* @__PURE__ */ new Map();
	if (null !== r) for (let u = 0, h = 0, d = 0; u < s; u++, h += 3, d += 4) {
		if (null !== a && 0 === a[u]) {
			t[u] = -1;
			continue;
		}
		const s = o[d] << 16 | o[d + 1] << 8 | o[d + 2];
		let g = f.get(s);
		if (void 0 === g) {
			const t = r[h], o = r[h + 1], a = r[h + 2];
			g = 0;
			let l = 1 / 0;
			for (let r = 0, s = 0; r < n; r++, s += 3) {
				const n = t - e[s], i = o - e[s + 1], c = a - e[s + 2], f = n * n + i * i + c * c;
				f < l && (l = f, g = r);
			}
			i && (g = p(t, o, a, g, e, n)), f.set(s, g);
		}
		if (t[u] = g, c[g]++, null !== l) {
			const t = 3 * g;
			l[t] += o[d], l[t + 1] += o[d + 1], l[t + 2] += o[d + 2];
		}
	}
	else for (let u = 0, h = 0; u < s; u++, h += 4) {
		if (null !== a && 0 === a[u]) {
			t[u] = -1;
			continue;
		}
		const r = o[h] << 16 | o[h + 1] << 8 | o[h + 2];
		let s = f.get(r);
		if (void 0 === s) {
			const t = o[h] / 255, a = o[h + 1] / 255, l = o[h + 2] / 255;
			s = 0;
			let i = 1 / 0;
			for (let o = 0, r = 0; o < n; o++, r += 3) {
				const n = t - e[r], c = a - e[r + 1], f = l - e[r + 2], u = n * n + c * c + f * f;
				u < i && (i = u, s = o);
			}
			f.set(r, s);
		}
		if (t[u] = s, c[s]++, null !== l) {
			const t = 3 * s;
			l[t] += o[h], l[t + 1] += o[h + 1], l[t + 2] += o[h + 2];
		}
	}
	return c;
}
function M(t, e) {
	const n = new Array(e);
	for (let o = 0; o < e; o++) n[o] = o;
	return n.sort((e, n) => t[n] - t[e] || e - n), n;
}
function y(t, e = function(t) {
	const { width: e, height: o, data: r } = t, a = e * o, l = Math.max(1, Math.floor(Math.sqrt(a / 262144))), c = Math.ceil(e / l), f = Math.ceil(o / l), u = /* @__PURE__ */ new Set(), h = /* @__PURE__ */ new Float64Array(4096), d = /* @__PURE__ */ new Map(), p = new Uint8Array(c * f);
	let g = !1, M = 0, y = 0, w = 0, m = 0, b = 0, A = 0, x = 0, k = 0, F = 0;
	for (let s = 0; s < f; s++) {
		const t = s * l, a = t * e;
		for (let i = 0; i < c; i++) {
			const f = i * l, S = 4 * (a + f), v = r[S], z = r[S + 1], I = r[S + 2], C = r[S + 3];
			C < 250 && (g = !0), M++, u.size < 65536 && u.add(v << 16 | z << 8 | I), h[v >> 4 << 8 | z >> 4 << 4 | I >> 4]++;
			const U = v >> 5 << 6 | z >> 5 << 3 | I >> 5;
			d.set(U, (d.get(U) ?? 0) + 1);
			const [R, q, D] = n(v / 255, z / 255, I / 255);
			x += R, k += R * R;
			const $ = Math.hypot(q, D);
			F += $, $ > .05 && A++;
			let E = 0, P = 0;
			if (f + l < e) {
				const t = 4 * (a + f + l);
				E = Math.abs(v - r[t]) + Math.abs(z - r[t + 1]) + Math.abs(I - r[t + 2]);
			}
			if (t + l < o) {
				const n = 4 * ((t + l) * e + f);
				P = Math.abs(v - r[n]) + Math.abs(z - r[n + 1]) + Math.abs(I - r[n + 2]);
			}
			if (f + l < e && t + l < o) {
				const t = Math.max(E, P);
				t > 72 ? w++ : t > 3 ? m++ : 0 === t && b++;
			}
			C >= 128 && (y++, E <= 12 && P <= 12 && (p[s * c + i] = 1));
		}
	}
	const { flat: S, ramp: v, fine: z } = function(t, e, n, o, r) {
		const { width: a, data: s } = t, l = n * o, i = new Uint8Array(l), c = new Int32Array(l), f = /* @__PURE__ */ new Int32Array(96);
		let u = 0, h = 0, d = 0;
		for (let p = 0; p < l; p++) {
			if (0 === r[p] || 1 === i[p]) continue;
			f.fill(0);
			let t = 0, l = 0;
			for (c[l++] = p, i[p] = 1; l > 0;) {
				const u = c[--l];
				t++;
				const h = u - (u / n | 0) * n, d = u / n | 0, p = 4 * (d * e * a + h * e);
				f[s[p] + s[p + 1] + s[p + 2] >> 3]++, h > 0 && 1 === r[u - 1] && 0 === i[u - 1] && (i[u - 1] = 1, c[l++] = u - 1), h + 1 < n && 1 === r[u + 1] && 0 === i[u + 1] && (i[u + 1] = 1, c[l++] = u + 1), d > 0 && 1 === r[u - n] && 0 === i[u - n] && (i[u - n] = 1, c[l++] = u - n), d + 1 < o && 1 === r[u + n] && 0 === i[u + n] && (i[u + n] = 1, c[l++] = u + n);
			}
			let g = 0, M = -1, y = 95;
			for (let e = 0; e < 96; e++) if (g += f[e], M < 0 && g >= .05 * t && (M = e), g >= .95 * t) {
				y = e;
				break;
			}
			8 * (y - M) >= 60 ? h += t : u += t, t < 16 && (d += t);
		}
		return {
			flat: u,
			ramp: h,
			fine: d
		};
	}(t, l, c, f, p);
	let I = 0;
	for (let n = 0; n < 4096; n++) {
		const t = h[n];
		if (t > 0) {
			const e = t / M;
			I -= e * Math.log2(e);
		}
	}
	const C = [...d.entries()].toSorted((t, e) => e[1] - t[1]), U = 0 === M ? 0 : ((C[0]?.[1] ?? 0) + (C[1]?.[1] ?? 0)) / M, R = C.slice(0, 6).map(([t]) => s(32 * (t >> 6 & 7) + 16, 32 * (t >> 3 & 7) + 16, 32 * (7 & t) + 16)), q = 0 === M ? 0 : x / M, D = 0 === M ? 0 : Math.max(0, k / M - q ** 2), $ = Math.sqrt(D), E = 0 === M ? 0 : F / M, P = 0 === M ? 0 : w / M, B = 0 === M ? 0 : m / M, T = 0 === M ? 0 : b / M, H = 0 === M ? 0 : A / M, W = 0 === y ? 0 : S / y, N = 0 === y ? 0 : v / y, L = 0 === y ? 0 : z / y, V = i(.45 * i(Math.log2(Math.max(1, u.size)) / 15, 0, 1) + .75 * i(2.2 * B, 0, 1), 0, 1);
	let j = 0;
	return a <= 16384 && (j += .6), u.size <= 32 && (j += .25), B < .02 && (j += .15), j = i(j, 0, 1), {
		width: e,
		height: o,
		pixels: a,
		hasAlpha: g,
		distinctColors: u.size,
		entropyBits: I,
		edgeDensity: P,
		microGradientDensity: B,
		flatDensity: T,
		flatArea: W,
		rampArea: N,
		fineArea: L,
		twoToneCoverage: U,
		photoScore: V,
		pixelArtScore: j,
		dominantHex: R,
		meanLightness: q,
		contrast: $,
		colorfulness: E,
		coloredFraction: H
	};
}(t)) {
	const o = [], a = e.distinctColors, l = (e) => function(t, e) {
		const { width: o, height: a, data: l } = t, i = o * a, f = c(e.k, 2, 64), h = c(e.quality, 1, 10), d = e.mask ? e.mask.data : null, p = "oklab" === e.colorSpace, y = new Int32Array(i), w = e.fixedPalette;
		if (null != w && w.length > 0) {
			const e = [];
			for (const t of w) {
				const n = r(t);
				null !== n && e.push(n);
			}
			if (e.length > 0) {
				const r = e.length, c = new Float32Array(3 * r), f = new Uint8Array(3 * r), h = [];
				for (let t = 0; t < r; t++) {
					const [o, r, a] = e[t];
					if (f[3 * t] = o, f[3 * t + 1] = r, f[3 * t + 2] = a, h.push(s(o, r, a)), p) {
						const [e, s, l] = n(o / 255, r / 255, a / 255);
						c[3 * t] = e, c[3 * t + 1] = s, c[3 * t + 2] = l;
					} else c[3 * t] = o / 255, c[3 * t + 1] = r / 255, c[3 * t + 2] = a / 255;
				}
				return {
					labels: {
						width: o,
						height: a,
						data: y,
						count: r
					},
					paletteHex: h,
					paletteRgb: f,
					counts: g(y, c, r, l, p ? u(t) : null, d, i, null, !1)
				};
			}
		}
		const m = /* @__PURE__ */ new Map();
		let b = 0, A = !1;
		for (let n = 0, r = 0; n < i; n++, r += 4) {
			if (null !== d) {
				if (0 === d[n]) continue;
				b++;
			}
			if (A) continue;
			const t = l[r] << 16 | l[r + 1] << 8 | l[r + 2], e = m.get(t);
			if (void 0 === e) {
				if (m.size === f) {
					if (A = !0, m.clear(), null === d) break;
					continue;
				}
				m.set(t, 1);
			} else m.set(t, e + 1);
		}
		if (null === d && (b = i), 0 === b) return y.fill(-1), {
			labels: {
				width: o,
				height: a,
				data: y,
				count: 0
			},
			paletteHex: [],
			paletteRgb: /* @__PURE__ */ new Uint8Array(0),
			counts: /* @__PURE__ */ new Uint32Array(0)
		};
		if (!A) {
			const t = m.size, e = new Int32Array(t), n = new Uint32Array(t), r = /* @__PURE__ */ new Map();
			let c = 0;
			for (const [o, a] of m) e[c] = o, n[c] = a, r.set(o, c), c++;
			const f = M(n, t), u = new Int32Array(t), h = new Uint8Array(3 * t), p = [], g = new Uint32Array(t);
			for (let o = 0; o < t; o++) {
				const t = f[o];
				u[t] = o;
				const r = e[t], a = r >> 16 & 255, l = r >> 8 & 255, i = 255 & r;
				h[3 * o] = a, h[3 * o + 1] = l, h[3 * o + 2] = i, p.push(s(a, l, i)), g[o] = n[t];
			}
			for (let o = 0, a = 0; o < i; o++, a += 4) {
				if (null !== d && 0 === d[o]) {
					y[o] = -1;
					continue;
				}
				const t = l[a] << 16 | l[a + 1] << 8 | l[a + 2];
				y[o] = u[r.get(t)];
			}
			return {
				labels: {
					width: o,
					height: a,
					data: y,
					count: t
				},
				paletteHex: p,
				paletteRgb: h,
				counts: g
			};
		}
		const x = p ? u(t) : null, k = function(t) {
			let e = t >>> 0;
			return () => {
				e = e + 1831565813 | 0;
				let t = Math.imul(e ^ e >>> 15, 1 | e);
				return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}(e.seed), F = e.sampleMask ? e.sampleMask.data : null;
		let S = null, v = b;
		if (null !== F) {
			let t = 0;
			for (let e = 0; e < i; e++) null !== d && 0 === d[e] || 0 === F[e] || t++;
			if (t >= Math.max(f, 256)) {
				const e = new Int32Array(t);
				let n = 0;
				for (let t = 0; t < i; t++) null !== d && 0 === d[t] || 0 === F[t] || (e[n++] = t);
				S = e, v = t;
			}
		}
		const z = Math.min(v, 2e4 + 2e4 * h), I = new Int32Array(z);
		if (null !== S) if (v <= z) for (let n = 0; n < v; n++) I[n] = S[n];
		else for (let n = 0; n < z; n++) I[n] = S[k() * v | 0];
		else if (b <= z) {
			let t = 0;
			for (let e = 0; e < i; e++) null !== d && 0 === d[e] || (I[t++] = e);
		} else if (null === d) for (let n = 0; n < z; n++) I[n] = k() * i | 0;
		else {
			const t = new Int32Array(b);
			let e = 0;
			for (let n = 0; n < i; n++) 0 !== d[n] && (t[e++] = n);
			for (let n = 0; n < z; n++) I[n] = t[k() * b | 0];
		}
		const C = new Float32Array(3 * z);
		if (null !== x) for (let n = 0, r = 0; n < z; n++, r += 3) {
			const t = 3 * I[n];
			C[r] = x[t], C[r + 1] = x[t + 1], C[r + 2] = x[t + 2];
		}
		else for (let n = 0, r = 0; n < z; n++, r += 3) {
			const t = 4 * I[n];
			C[r] = l[t] / 255, C[r + 1] = l[t + 1] / 255, C[r + 2] = l[t + 2] / 255;
		}
		const U = new Float32Array(3 * f), R = new Float64Array(z).fill(1 / 0), q = 3 * (k() * z | 0);
		U[0] = C[q], U[1] = C[q + 1], U[2] = C[q + 2];
		for (let n = 1; n < f; n++) {
			const t = U[3 * (n - 1)], e = U[3 * (n - 1) + 1], o = U[3 * (n - 1) + 2];
			let r = 0;
			for (let n = 0, s = 0; n < z; n++, s += 3) {
				const a = C[s] - t, l = C[s + 1] - e, i = C[s + 2] - o, c = a * a + l * l + i * i;
				c < R[n] && (R[n] = c), r += R[n];
			}
			let a = z - 1;
			if (r > 0) {
				const t = k() * r;
				let e = 0;
				for (let n = 0; n < z; n++) if (e += R[n], e >= t) {
					a = n;
					break;
				}
			} else a = k() * z | 0;
			U[3 * n] = C[3 * a], U[3 * n + 1] = C[3 * a + 1], U[3 * n + 2] = C[3 * a + 2];
		}
		const D = 8 + 3 * h, $ = new Float64Array(3 * f), E = new Uint32Array(f);
		for (let n = 0; n < D; n++) {
			$.fill(0), E.fill(0);
			for (let e = 0, n = 0; e < z; e++, n += 3) {
				const t = C[n], e = C[n + 1], o = C[n + 2];
				let r = 0, a = 1 / 0;
				for (let n = 0, l = 0; n < f; n++, l += 3) {
					const s = t - U[l], i = e - U[l + 1], c = o - U[l + 2], f = s * s + i * i + c * c;
					f < a && (a = f, r = n);
				}
				const s = 3 * r;
				$[s] += t, $[s + 1] += e, $[s + 2] += o, E[r]++;
			}
			let t = 0;
			for (let e = 0, n = 0; e < f; e++, n += 3) {
				if (0 === E[e]) continue;
				const o = 1 / E[e], r = $[n] * o, a = $[n + 1] * o, s = $[n + 2] * o, l = r - U[n], i = a - U[n + 1], c = s - U[n + 2], f = Math.sqrt(l * l + i * i + c * c);
				f > t && (t = f), U[n] = r, U[n + 1] = a, U[n + 2] = s;
			}
			if (t < 1e-4) break;
		}
		const P = new Float64Array(3 * f);
		let B = g(y, U, f, l, x, d, i, P, p), T = 0;
		const H = new Int32Array(f);
		for (let n = 0; n < f; n++) 0 !== B[n] ? (H[n] = T, U[3 * T] = U[3 * n], U[3 * T + 1] = U[3 * n + 1], U[3 * T + 2] = U[3 * n + 2], P[3 * T] = P[3 * n], P[3 * T + 1] = P[3 * n + 1], P[3 * T + 2] = P[3 * n + 2], B[T] = B[n], T++) : H[n] = -1;
		if (T < f) {
			for (let t = 0; t < i; t++) y[t] >= 0 && (y[t] = H[y[t]]);
			B = B.slice(0, T);
		}
		if (!0 === e.autoK && T > 1) {
			const t = new Float64Array(3 * T);
			for (let l = 0; l < T; l++) if (p) t[3 * l] = U[3 * l], t[3 * l + 1] = U[3 * l + 1], t[3 * l + 2] = U[3 * l + 2];
			else {
				const [e, o, r] = n(U[3 * l], U[3 * l + 1], U[3 * l + 2]);
				t[3 * l] = e, t[3 * l + 1] = o, t[3 * l + 2] = r;
			}
			const e = new Uint8Array(T).fill(1), o = new Int32Array(T);
			for (let n = 0; n < T; n++) o[n] = n;
			const r = 9e-4;
			for (;;) {
				let a = -1, s = -1, l = 1 / 0;
				for (let n = 0; n < T; n++) if (0 !== e[n]) for (let o = n + 1; o < T; o++) {
					if (0 === e[o]) continue;
					const r = t[3 * n] - t[3 * o], i = t[3 * n + 1] - t[3 * o + 1], c = t[3 * n + 2] - t[3 * o + 2], f = r * r + i * i + c * c;
					f < l && (l = f, a = n, s = o);
				}
				if (a < 0 || l >= r) break;
				const i = B[a], c = B[s], f = i + c;
				if (U[3 * a] = (U[3 * a] * i + U[3 * s] * c) / f, U[3 * a + 1] = (U[3 * a + 1] * i + U[3 * s + 1] * c) / f, U[3 * a + 2] = (U[3 * a + 2] * i + U[3 * s + 2] * c) / f, P[3 * a] += P[3 * s], P[3 * a + 1] += P[3 * s + 1], P[3 * a + 2] += P[3 * s + 2], B[a] = f, e[s] = 0, o[s] = a, p) t[3 * a] = U[3 * a], t[3 * a + 1] = U[3 * a + 1], t[3 * a + 2] = U[3 * a + 2];
				else {
					const [e, o, r] = n(U[3 * a], U[3 * a + 1], U[3 * a + 2]);
					t[3 * a] = e, t[3 * a + 1] = o, t[3 * a + 2] = r;
				}
			}
			const a = new Int32Array(T);
			let s = 0;
			for (let n = 0; n < T; n++) 0 !== e[n] && (a[n] = s, U[3 * s] = U[3 * n], U[3 * s + 1] = U[3 * n + 1], U[3 * s + 2] = U[3 * n + 2], P[3 * s] = P[3 * n], P[3 * s + 1] = P[3 * n + 1], P[3 * s + 2] = P[3 * n + 2], B[s] = B[n], s++);
			if (s < T) {
				const t = new Int32Array(T);
				for (let e = 0; e < T; e++) {
					let n = e;
					for (; o[n] !== n;) n = o[n];
					t[e] = a[n];
				}
				for (let e = 0; e < i; e++) y[e] >= 0 && (y[e] = t[y[e]]);
				B = B.slice(0, s), T = s;
			}
		}
		const W = M(B, T), N = new Int32Array(T), L = new Uint8Array(3 * T), O = [], V = new Uint32Array(T);
		for (let n = 0; n < T; n++) {
			const t = W[n];
			N[t] = n;
			const e = 1 / B[t], o = Math.round(P[3 * t] * e), r = Math.round(P[3 * t + 1] * e), a = Math.round(P[3 * t + 2] * e);
			L[3 * n] = o, L[3 * n + 1] = r, L[3 * n + 2] = a, O.push(s(o, r, a)), V[n] = B[t];
		}
		for (let n = 0; n < i; n++) y[n] >= 0 && (y[n] = N[y[n]]);
		return {
			labels: {
				width: o,
				height: a,
				data: y,
				count: T
			},
			paletteHex: O,
			paletteRgb: L,
			counts: V
		};
	}(t, {
		k: e,
		colorSpace: "oklab",
		quality: 4,
		seed: 1374496523,
		autoK: !0
	}).paletteHex;
	a >= 2 && a <= 32 && o.push({
		id: "exact",
		label: `Exact (${a})`,
		colors: l(Math.min(32, a)),
		description: "Every color the image actually uses."
	});
	const f = l(a <= 12 ? Math.max(2, Math.min(12, a)) : 12);
	if (o.push({
		id: "balanced",
		label: `Balanced (${f.length})`,
		colors: f,
		description: "Perceptual clustering at a comfortable size."
	}), a > 8) {
		const t = l(6);
		o.push({
			id: "bold",
			label: `Bold (${t.length})`,
			colors: t,
			description: "Few strong tones — poster and print friendly."
		});
	}
	if (a > 64) {
		const t = l(24);
		o.push({
			id: "rich",
			label: `Rich (${t.length})`,
			colors: t,
			description: "Wide tonal coverage for detailed art."
		});
	}
	o.push({
		id: "vivid",
		label: `Vivid (${f.length})`,
		colors: A(f.map((t) => w(t, 1.45, 0))),
		description: "The balanced palette with the saturation pushed."
	}), o.push({
		id: "muted",
		label: `Muted (${f.length})`,
		colors: A(f.map((t) => w(t, .5, .06))),
		description: "Soft, pastel take on the image colors."
	});
	const h = function(t) {
		let e = null, o = -1;
		for (const a of t) {
			const t = r(a);
			if (!t) continue;
			const [, s, l] = n(t[0] / 255, t[1] / 255, t[2] / 255), i = Math.hypot(s, l);
			i > o && (o = i, e = a);
		}
		return e;
	}(e.dominantHex) ?? "#1a1a2e";
	o.push({
		id: "duotone",
		label: "Duotone",
		colors: m(h, 4),
		description: "One ink over paper — riso / screen-print look."
	}), o.push({
		id: "mono",
		label: "Mono (6)",
		colors: b(6),
		description: "Neutral grayscale ramp."
	});
	const d = /* @__PURE__ */ new Set();
	return o.filter((t) => {
		if (t.colors.length < 2) return !1;
		const e = t.colors.join(",");
		return !d.has(e) && (d.add(e), !0);
	});
}
function w(t, e, o) {
	const a = r(t);
	if (!a) return t;
	const [s, c, f] = n(a[0] / 255, a[1] / 255, a[2] / 255);
	return l(i(s * (1 - o) + o, 0, 1), c * e, f * e);
}
function m(t, e) {
	const o = r(t) ?? [
		26,
		26,
		46
	], [a, s, i] = n(o[0] / 255, o[1] / 255, o[2] / 255), c = Math.min(a, .45), f = [];
	for (let n = 0; n < e; n++) {
		const t = n / (e - 1), o = c + (.97 - c) * t, r = 1 - .85 * t;
		f.push(l(o, s * r, i * r));
	}
	return A(f);
}
function b(t) {
	const e = [];
	for (let n = 0; n < t; n++) e.push(l(.12 + n / (t - 1) * .84, 0, 0));
	return e;
}
function A(t) {
	return [...new Set(t)];
}
const x = 1e6, k = Math.sqrt(Math.PI / 2) / 6;
function F(t) {
	const e = function(t) {
		const { data: e, width: n } = t, { x0: o, y0: r, w: a, h: s } = function(t, e) {
			if (t * e <= x) return {
				x0: 0,
				y0: 0,
				w: t,
				h: e
			};
			const n = Math.sqrt(x / (t * e)), o = Math.max(16, Math.floor(t * n)), r = Math.max(16, Math.floor(e * n));
			return {
				x0: t - o >> 1,
				y0: e - r >> 1,
				w: o,
				h: r
			};
		}(t.width, t.height), l = new Float32Array(a * s), i = /* @__PURE__ */ new Set();
		let c = 0, f = 0;
		for (let A = 0; A < s; A++) {
			const t = (r + A) * n + o, u = A * a;
			for (let o = 0; o < a; o++) {
				const r = 4 * (t + o), h = e[r], d = e[r + 1], p = e[r + 2];
				if (l[u + o] = .299 * h + .587 * d + .114 * p, i.size < 4096 && i.add(h << 16 | d << 8 | p), o + 1 < a && A + 1 < s) {
					f++;
					const t = r + 4, o = r + 4 * n;
					h === e[t] && d === e[t + 1] && p === e[t + 2] && h === e[o] && d === e[o + 1] && p === e[o + 2] && c++;
				}
			}
		}
		const u = function(t, e, n) {
			if (e < 3 || n < 3) return 0;
			let o = 0;
			for (let r = 1; r < n - 1; r++) {
				const n = (r - 1) * e, a = r * e, s = (r + 1) * e;
				for (let r = 1; r < e - 1; r++) {
					const e = t[n + r - 1] - 2 * t[n + r] + t[n + r + 1] - 2 * t[a + r - 1] + 4 * t[a + r] - 2 * t[a + r + 1] + t[s + r - 1] - 2 * t[s + r] + t[s + r + 1];
					o += Math.abs(e);
				}
			}
			return k * o / ((e - 2) * (n - 2));
		}(l, a, s), { sharpness: h, lumaVar: d } = function(t, e, n) {
			let o = 0, r = 0, a = 0;
			for (let u = 1; u < n - 1; u++) {
				const n = (u - 1) * e, s = u * e, l = (u + 1) * e;
				for (let i = 1; i < e - 1; i++) {
					const e = t[n + i] + t[l + i] + t[s + i - 1] + t[s + i + 1] - 4 * t[s + i];
					o += e, r += e * e, a++;
				}
			}
			const s = a > 0 ? Math.max(0, r / a - (o / a) ** 2) : 0;
			let l = 0, i = 0, c = 0;
			for (let u = 0; u < e * n; u++) l += t[u], i += t[u] * t[u], c++;
			const f = c > 0 ? Math.max(1, i / c - (l / c) ** 2) : 1;
			return {
				sharpness: s / f,
				lumaVar: f
			};
		}(l, a, s), { blockiness: p } = function(t, e, n) {
			const o = /* @__PURE__ */ new Float64Array(8), r = /* @__PURE__ */ new Float64Array(8);
			for (let l = 0; l < n; l++) {
				const n = l * e;
				for (let a = 1; a < e; a++) {
					const e = 7 & a;
					o[e] += Math.abs(t[n + a] - t[n + a - 1]), r[e]++;
				}
			}
			const a = /* @__PURE__ */ new Float64Array(8), s = /* @__PURE__ */ new Float64Array(8);
			for (let l = 1; l < n; l++) {
				const n = l * e, o = (l - 1) * e;
				for (let r = 0; r < e; r++) {
					const e = 7 & l;
					a[e] += Math.abs(t[n + r] - t[o + r]), s[e]++;
				}
			}
			return { blockiness: (v(o, r) + v(a, s)) / 2 };
		}(l, a, s), { edgeDensity: g, aaRimFraction: M, blurEdgeWidth: y, ringing: w } = function(t, e, n, o) {
			let r = 0, a = 0, s = 0, l = 0, i = 0, c = 0;
			const f = Math.max(4, .15 * Math.sqrt(o));
			for (let h = 0; h < n; h++) {
				const n = h * e;
				for (let o = 1; o < e - 1; o++) {
					if (Math.abs(t[n + o + 1] - t[n + o - 1]) / 2 <= 16) continue;
					r++;
					const u = Math.sign(t[n + o + 1] - t[n + o - 1]);
					let h = o;
					for (; h > 0 && Math.sign(t[n + h] - t[n + h - 1]) === u;) h--;
					let d = o;
					for (; d < e - 1 && Math.sign(t[n + d + 1] - t[n + d]) === u;) d++;
					const p = d - h;
					if (a++, s += p, p <= 2 && l++, d + 2 < e) {
						const e = t[n + d], o = t[n + d + 2];
						c++, 0 !== u && u * (o - e) < -f && i++;
					}
				}
			}
			const u = e * n;
			return {
				edgeDensity: u > 0 ? r / u : 0,
				aaRimFraction: u > 0 ? l / u : 0,
				blurEdgeWidth: a > 0 ? s / a : 0,
				ringing: c > 0 ? i / c : 0
			};
		}(l, a, s, d), m = z(l, a, s), b = function(t, e, n) {
			const o = e >> 1, r = n >> 1, a = new Float32Array(Math.max(1, o * r));
			for (let s = 0; s < r; s++) {
				const n = 2 * s * e, r = n + e, l = s * o;
				for (let e = 0; e < o; e++) {
					const o = 2 * e;
					a[l + e] = (t[n + o] + t[n + o + 1] + t[r + o] + t[r + o + 1]) / 4;
				}
			}
			return {
				plane: a,
				w: o,
				h: r
			};
		}(l, a, s);
		return {
			noiseSigma: u,
			blurEdgeWidth: y,
			sharpness: h,
			blockiness: p,
			ringing: w,
			aaRimFraction: M,
			dither: m,
			ditherCoarse: z(b.plane, b.w, b.h),
			upscaleFactor: I(l, a, s),
			edgeDensity: g,
			flatFraction: f > 0 ? c / f : 0,
			distinctColors: i.size,
			analyzedSize: Math.max(a, s)
		};
	}(t), { class: n, confidence: o } = function(t) {
		if (t.distinctColors <= 64 && t.noiseSigma < C && t.blockiness < U && (t.upscaleFactor > 1 || t.analyzedSize <= 128)) return {
			class: "pixel-art",
			confidence: .7
		};
		const e = t.noiseSigma / C, n = t.blockiness / U, o = t.blurEdgeWidth / R, r = t.dither / q, a = t.dither >= D && t.dither >= $ * t.ditherCoarse, s = Math.max(r, a ? t.dither / D : 0);
		return s >= 1 && t.distinctColors <= 512 ? {
			class: "screenshot",
			confidence: E(s, [n, o])
		} : e >= 1 && t.distinctColors > 512 && t.blockiness < U ? t.flatFraction > .12 && t.blurEdgeWidth > .7 * R ? {
			class: "scan",
			confidence: E(e, [n, o])
		} : {
			class: "noisy-photo",
			confidence: E(e, [n, r])
		} : t.distinctColors > 256 && n >= 1 ? {
			class: "compressed",
			confidence: E(n, [e, o])
		} : o >= 1 && t.sharpness < .5 ? {
			class: "blurred",
			confidence: E(o, [e, n])
		} : {
			class: "clean-vector",
			confidence: E(1, [
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
		overrides: S(n, o)
	};
}
function S(t, e) {
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
function v(t, e) {
	let n = 0, o = 0;
	for (let a = 0; a < 8; a++) {
		const r = e[a] > 0 ? t[a] / e[a] : 0;
		r > n && (n = r), o += r;
	}
	const r = o / 8;
	return (n - r) / (r + .5);
}
function z(t, e, n) {
	if (e < 3 || n < 3) return 0;
	let o = 0, r = 0;
	for (let a = 0; a < n - 1; a++) {
		const s = a * e, l = (a + 1) * e;
		for (let i = 0; i < e - 1; i++) {
			const c = Math.abs(t[s + i] - t[s + i + 1] - t[l + i] + t[l + i + 1]), f = (t[s + i] + t[s + i + 1] + t[l + i] + t[l + i + 1]) / 4, u = i + 2 < e ? Math.abs(t[s + i + 2] - f) : 0, h = a + 2 < n ? Math.abs(t[(a + 2) * e + i] - f) : 0;
			u < 24 && h < 24 && (o += c, r++);
		}
	}
	return i((r > 0 ? o / r : 0) / 24, 0, 1);
}
function I(t, e, n) {
	for (let o = 6; o >= 2; o--) {
		const r = new Float64Array(o);
		let a = 0;
		for (let l = 0; l < n; l++) {
			const n = l * e;
			for (let s = 1; s < e; s++) {
				const e = Math.abs(t[n + s] - t[n + s - 1]);
				e < 6 || (r[s % o] += e, a += e);
			}
		}
		if (a < 192) continue;
		let s = 0;
		for (let t = 0; t < o; t++) r[t] > s && (s = r[t]);
		if (s / a > .85) return o;
	}
	return 1;
}
const C = 3.2, U = .18, R = 3.2, q = .7, D = .3, $ = 1.2;
function E(t, e) {
	return i(.5 + .5 * (t - (e.length > 0 ? Math.max(...e) : 0)), .3, .98);
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
				suggestions: y(t, n.analysis)
			}) : "inputProfile" === n.type && e({
				type: "profile",
				id: n.id,
				profile: F(t)
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
