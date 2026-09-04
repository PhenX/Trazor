function t(t) {
	return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
}
function e(t) {
	return t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
}
function n(e, n, o) {
	const r = t(e), l = t(n), a = t(o), i = Math.cbrt(.4122214708 * r + .5363325363 * l + .0514459929 * a), s = Math.cbrt(.2119034982 * r + .6806995451 * l + .1073969566 * a), c = Math.cbrt(.0883024619 * r + .2817188376 * l + .6299787005 * a);
	return [
		.2104542553 * i + .793617785 * s - .0040720468 * c,
		1.9779984951 * i - 2.428592205 * s + .4505937099 * c,
		.0259040371 * i + .7827717662 * s - .808675766 * c
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
function l(t) {
	return Math.max(0, Math.min(255, Math.round(t))).toString(16).padStart(2, "0");
}
function a(t, e, n) {
	return `#${l(t)}${l(e)}${l(n)}`;
}
function i(t, n, r) {
	const [l, i, s] = function(t, n, r) {
		const l = t + .3963377774 * n + .2158037573 * r, a = t - .1055613458 * n - .0638541728 * r, i = t - .0894841775 * n - 1.291485548 * r, s = l * l * l, c = a * a * a, u = i * i * i, f = -1.2684380046 * s + 2.6097574011 * c - .3413193965 * u, h = -.0041960863 * s - .7034186147 * c + 1.707614701 * u;
		return [
			o(e(4.0767416621 * s - 3.3077115913 * c + .2309699292 * u)),
			o(e(f)),
			o(e(h))
		];
	}(t, n, r);
	return a(255 * l, 255 * i, 255 * s);
}
function s(t, e, n) {
	return t < e ? e : t > n ? n : t;
}
function c(t, e, n) {
	return s(Math.round(t), e, n);
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
const u = (() => {
	const e = /* @__PURE__ */ new Float64Array(256);
	for (let n = 0; n < 256; n++) e[n] = t(n / 255);
	return e;
})();
function f(t) {
	const { width: e, height: n, data: o } = t, r = e * n, l = new Float32Array(3 * r);
	for (let a = 0, i = 0, s = 0; a < r; a++, i += 4, s += 3) {
		const t = u[o[i]], e = u[o[i + 1]], n = u[o[i + 2]], r = Math.cbrt(.4122214708 * t + .5363325363 * e + .0514459929 * n), a = Math.cbrt(.2119034982 * t + .6806995451 * e + .1073969566 * n), c = Math.cbrt(.0883024619 * t + .2817188376 * e + .6299787005 * n);
		l[s] = .2104542553 * r + .793617785 * a - .0040720468 * c, l[s + 1] = 1.9779984951 * r - 2.428592205 * a + .4505937099 * c, l[s + 2] = .0259040371 * r + .7827717662 * a - .808675766 * c;
	}
	return l;
}
const h = .018 * .018, d = 144e-6;
function p(t, e, n, o, r, l) {
	const a = e * e + n * n;
	if (a < h) return o;
	const i = r[3 * o + 1], s = r[3 * o + 2], c = i * i + s * s;
	if (c < d) return o;
	const u = e * i + n * s;
	if (u > 0 && u * u >= .5 * a * c) return o;
	let f = -1, p = .0081;
	for (let h = 0, g = 0; h < l; h++, g += 3) {
		if (h === o) continue;
		const l = r[g + 1], i = r[g + 2], s = l * l + i * i;
		let c = s < d;
		if (!c) {
			const t = e * l + n * i;
			c = t > 0 && t * t >= .5 * a * s;
		}
		if (!c) continue;
		const u = t - r[g], w = e - l, y = n - i, M = u * u + w * w + y * y;
		M < p && (p = M, f = h);
	}
	return f >= 0 ? f : o;
}
function g(t, e, n, o, r, l, a, i, s) {
	const c = new Uint32Array(n), u = /* @__PURE__ */ new Map();
	if (null !== r) for (let f = 0, h = 0, d = 0; f < a; f++, h += 3, d += 4) {
		if (null !== l && 0 === l[f]) {
			t[f] = -1;
			continue;
		}
		const a = o[d] << 16 | o[d + 1] << 8 | o[d + 2];
		let g = u.get(a);
		if (void 0 === g) {
			const t = r[h], o = r[h + 1], l = r[h + 2];
			g = 0;
			let i = 1 / 0;
			for (let r = 0, a = 0; r < n; r++, a += 3) {
				const n = t - e[a], s = o - e[a + 1], c = l - e[a + 2], u = n * n + s * s + c * c;
				u < i && (i = u, g = r);
			}
			s && (g = p(t, o, l, g, e, n)), u.set(a, g);
		}
		if (t[f] = g, c[g]++, null !== i) {
			const t = 3 * g;
			i[t] += o[d], i[t + 1] += o[d + 1], i[t + 2] += o[d + 2];
		}
	}
	else for (let f = 0, h = 0; f < a; f++, h += 4) {
		if (null !== l && 0 === l[f]) {
			t[f] = -1;
			continue;
		}
		const r = o[h] << 16 | o[h + 1] << 8 | o[h + 2];
		let a = u.get(r);
		if (void 0 === a) {
			const t = o[h] / 255, l = o[h + 1] / 255, i = o[h + 2] / 255;
			a = 0;
			let s = 1 / 0;
			for (let o = 0, r = 0; o < n; o++, r += 3) {
				const n = t - e[r], c = l - e[r + 1], u = i - e[r + 2], f = n * n + c * c + u * u;
				f < s && (s = f, a = o);
			}
			u.set(r, a);
		}
		if (t[f] = a, c[a]++, null !== i) {
			const t = 3 * a;
			i[t] += o[h], i[t + 1] += o[h + 1], i[t + 2] += o[h + 2];
		}
	}
	return c;
}
function w(t, e) {
	const n = new Array(e);
	for (let o = 0; o < e; o++) n[o] = o;
	return n.sort((e, n) => t[n] - t[e] || e - n), n;
}
function y(t, e = function(t) {
	const { width: e, height: o, data: r } = t, l = e * o, i = Math.max(1, Math.floor(Math.sqrt(l / 262144))), c = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Float64Array(4096), f = /* @__PURE__ */ new Map();
	let h = !1, d = 0, p = 0, g = 0, w = 0, y = 0, M = 0, m = 0, b = 0;
	for (let a = 0; a < o; a += i) {
		const t = a * e;
		for (let l = 0; l < e; l += i) {
			const s = 4 * (t + l), A = r[s], x = r[s + 1], k = r[s + 2];
			r[s + 3] < 250 && (h = !0), d++, c.size < 65536 && c.add(A << 16 | x << 8 | k), u[A >> 4 << 8 | x >> 4 << 4 | k >> 4]++;
			const v = A >> 5 << 6 | x >> 5 << 3 | k >> 5;
			f.set(v, (f.get(v) ?? 0) + 1);
			const [S, I, z] = n(A / 255, x / 255, k / 255);
			M += S, m += S * S;
			const F = Math.hypot(I, z);
			if (b += F, F > .05 && y++, l + i < e && a + i < o) {
				const n = 4 * (t + l + i), o = 4 * ((a + i) * e + l), s = Math.abs(A - r[n]) + Math.abs(x - r[n + 1]) + Math.abs(k - r[n + 2]), c = Math.abs(A - r[o]) + Math.abs(x - r[o + 1]) + Math.abs(k - r[o + 2]), u = Math.max(s, c);
				u > 72 ? p++ : u > 3 ? g++ : 0 === u && w++;
			}
		}
	}
	let A = 0;
	for (let n = 0; n < 4096; n++) {
		const t = u[n];
		if (t > 0) {
			const e = t / d;
			A -= e * Math.log2(e);
		}
	}
	const x = [...f.entries()].toSorted((t, e) => e[1] - t[1]), k = 0 === d ? 0 : ((x[0]?.[1] ?? 0) + (x[1]?.[1] ?? 0)) / d, v = x.slice(0, 6).map(([t]) => a(32 * (t >> 6 & 7) + 16, 32 * (t >> 3 & 7) + 16, 32 * (7 & t) + 16)), S = 0 === d ? 0 : M / d, I = 0 === d ? 0 : Math.max(0, m / d - S ** 2), z = Math.sqrt(I), F = 0 === d ? 0 : b / d, U = 0 === d ? 0 : p / d, $ = 0 === d ? 0 : g / d, C = 0 === d ? 0 : w / d, R = 0 === d ? 0 : y / d, q = s(.45 * s(Math.log2(Math.max(1, c.size)) / 15, 0, 1) + .75 * s(2.2 * $, 0, 1), 0, 1);
	let B = 0;
	return l <= 16384 && (B += .6), c.size <= 32 && (B += .25), $ < .02 && (B += .15), B = s(B, 0, 1), {
		width: e,
		height: o,
		pixels: l,
		hasAlpha: h,
		distinctColors: c.size,
		entropyBits: A,
		edgeDensity: U,
		microGradientDensity: $,
		flatDensity: C,
		twoToneCoverage: k,
		photoScore: q,
		pixelArtScore: B,
		dominantHex: v,
		meanLightness: S,
		contrast: z,
		colorfulness: F,
		coloredFraction: R
	};
}(t)) {
	const o = [], l = e.distinctColors, i = (e) => function(t, e) {
		const { width: o, height: l, data: i } = t, s = o * l, u = c(e.k, 2, 64), h = c(e.quality, 1, 10), d = e.mask ? e.mask.data : null, p = "oklab" === e.colorSpace, y = new Int32Array(s), M = e.fixedPalette;
		if (null != M && M.length > 0) {
			const e = [];
			for (const t of M) {
				const n = r(t);
				null !== n && e.push(n);
			}
			if (e.length > 0) {
				const r = e.length, c = new Float32Array(3 * r), u = new Uint8Array(3 * r), h = [];
				for (let t = 0; t < r; t++) {
					const [o, r, l] = e[t];
					if (u[3 * t] = o, u[3 * t + 1] = r, u[3 * t + 2] = l, h.push(a(o, r, l)), p) {
						const [e, a, i] = n(o / 255, r / 255, l / 255);
						c[3 * t] = e, c[3 * t + 1] = a, c[3 * t + 2] = i;
					} else c[3 * t] = o / 255, c[3 * t + 1] = r / 255, c[3 * t + 2] = l / 255;
				}
				return {
					labels: {
						width: o,
						height: l,
						data: y,
						count: r
					},
					paletteHex: h,
					paletteRgb: u,
					counts: g(y, c, r, i, p ? f(t) : null, d, s, null, !1)
				};
			}
		}
		const m = /* @__PURE__ */ new Map();
		let b = 0, A = !1;
		for (let n = 0, r = 0; n < s; n++, r += 4) {
			if (null !== d) {
				if (0 === d[n]) continue;
				b++;
			}
			if (A) continue;
			const t = i[r] << 16 | i[r + 1] << 8 | i[r + 2], e = m.get(t);
			if (void 0 === e) {
				if (m.size === u) {
					if (A = !0, m.clear(), null === d) break;
					continue;
				}
				m.set(t, 1);
			} else m.set(t, e + 1);
		}
		if (null === d && (b = s), 0 === b) return y.fill(-1), {
			labels: {
				width: o,
				height: l,
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
			for (const [o, l] of m) e[c] = o, n[c] = l, r.set(o, c), c++;
			const u = w(n, t), f = new Int32Array(t), h = new Uint8Array(3 * t), p = [], g = new Uint32Array(t);
			for (let o = 0; o < t; o++) {
				const t = u[o];
				f[t] = o;
				const r = e[t], l = r >> 16 & 255, i = r >> 8 & 255, s = 255 & r;
				h[3 * o] = l, h[3 * o + 1] = i, h[3 * o + 2] = s, p.push(a(l, i, s)), g[o] = n[t];
			}
			for (let o = 0, l = 0; o < s; o++, l += 4) {
				if (null !== d && 0 === d[o]) {
					y[o] = -1;
					continue;
				}
				const t = i[l] << 16 | i[l + 1] << 8 | i[l + 2];
				y[o] = f[r.get(t)];
			}
			return {
				labels: {
					width: o,
					height: l,
					data: y,
					count: t
				},
				paletteHex: p,
				paletteRgb: h,
				counts: g
			};
		}
		const x = p ? f(t) : null, k = function(t) {
			let e = t >>> 0;
			return () => {
				e = e + 1831565813 | 0;
				let t = Math.imul(e ^ e >>> 15, 1 | e);
				return t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t, ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}(e.seed), v = e.sampleMask ? e.sampleMask.data : null;
		let S = null, I = b;
		if (null !== v) {
			let t = 0;
			for (let e = 0; e < s; e++) null !== d && 0 === d[e] || 0 === v[e] || t++;
			if (t >= Math.max(u, 256)) {
				const e = new Int32Array(t);
				let n = 0;
				for (let t = 0; t < s; t++) null !== d && 0 === d[t] || 0 === v[t] || (e[n++] = t);
				S = e, I = t;
			}
		}
		const z = Math.min(I, 2e4 + 2e4 * h), F = new Int32Array(z);
		if (null !== S) if (I <= z) for (let n = 0; n < I; n++) F[n] = S[n];
		else for (let n = 0; n < z; n++) F[n] = S[k() * I | 0];
		else if (b <= z) {
			let t = 0;
			for (let e = 0; e < s; e++) null !== d && 0 === d[e] || (F[t++] = e);
		} else if (null === d) for (let n = 0; n < z; n++) F[n] = k() * s | 0;
		else {
			const t = new Int32Array(b);
			let e = 0;
			for (let n = 0; n < s; n++) 0 !== d[n] && (t[e++] = n);
			for (let n = 0; n < z; n++) F[n] = t[k() * b | 0];
		}
		const U = new Float32Array(3 * z);
		if (null !== x) for (let n = 0, r = 0; n < z; n++, r += 3) {
			const t = 3 * F[n];
			U[r] = x[t], U[r + 1] = x[t + 1], U[r + 2] = x[t + 2];
		}
		else for (let n = 0, r = 0; n < z; n++, r += 3) {
			const t = 4 * F[n];
			U[r] = i[t] / 255, U[r + 1] = i[t + 1] / 255, U[r + 2] = i[t + 2] / 255;
		}
		const $ = new Float32Array(3 * u), C = new Float64Array(z).fill(1 / 0), R = 3 * (k() * z | 0);
		$[0] = U[R], $[1] = U[R + 1], $[2] = U[R + 2];
		for (let n = 1; n < u; n++) {
			const t = $[3 * (n - 1)], e = $[3 * (n - 1) + 1], o = $[3 * (n - 1) + 2];
			let r = 0;
			for (let n = 0, a = 0; n < z; n++, a += 3) {
				const l = U[a] - t, i = U[a + 1] - e, s = U[a + 2] - o, c = l * l + i * i + s * s;
				c < C[n] && (C[n] = c), r += C[n];
			}
			let l = z - 1;
			if (r > 0) {
				const t = k() * r;
				let e = 0;
				for (let n = 0; n < z; n++) if (e += C[n], e >= t) {
					l = n;
					break;
				}
			} else l = k() * z | 0;
			$[3 * n] = U[3 * l], $[3 * n + 1] = U[3 * l + 1], $[3 * n + 2] = U[3 * l + 2];
		}
		const T = 8 + 3 * h, q = new Float64Array(3 * u), B = new Uint32Array(u);
		for (let n = 0; n < T; n++) {
			q.fill(0), B.fill(0);
			for (let e = 0, n = 0; e < z; e++, n += 3) {
				const t = U[n], e = U[n + 1], o = U[n + 2];
				let r = 0, l = 1 / 0;
				for (let n = 0, i = 0; n < u; n++, i += 3) {
					const a = t - $[i], s = e - $[i + 1], c = o - $[i + 2], u = a * a + s * s + c * c;
					u < l && (l = u, r = n);
				}
				const a = 3 * r;
				q[a] += t, q[a + 1] += e, q[a + 2] += o, B[r]++;
			}
			let t = 0;
			for (let e = 0, n = 0; e < u; e++, n += 3) {
				if (0 === B[e]) continue;
				const o = 1 / B[e], r = q[n] * o, l = q[n + 1] * o, a = q[n + 2] * o, i = r - $[n], s = l - $[n + 1], c = a - $[n + 2], u = Math.sqrt(i * i + s * s + c * c);
				u > t && (t = u), $[n] = r, $[n + 1] = l, $[n + 2] = a;
			}
			if (t < 1e-4) break;
		}
		const D = new Float64Array(3 * u);
		let H = g(y, $, u, i, x, d, s, D, p), P = 0;
		const E = new Int32Array(u);
		for (let n = 0; n < u; n++) 0 !== H[n] ? (E[n] = P, $[3 * P] = $[3 * n], $[3 * P + 1] = $[3 * n + 1], $[3 * P + 2] = $[3 * n + 2], D[3 * P] = D[3 * n], D[3 * P + 1] = D[3 * n + 1], D[3 * P + 2] = D[3 * n + 2], H[P] = H[n], P++) : E[n] = -1;
		if (P < u) {
			for (let t = 0; t < s; t++) y[t] >= 0 && (y[t] = E[y[t]]);
			H = H.slice(0, P);
		}
		if (!0 === e.autoK && P > 1) {
			const t = new Float64Array(3 * P);
			for (let i = 0; i < P; i++) if (p) t[3 * i] = $[3 * i], t[3 * i + 1] = $[3 * i + 1], t[3 * i + 2] = $[3 * i + 2];
			else {
				const [e, o, r] = n($[3 * i], $[3 * i + 1], $[3 * i + 2]);
				t[3 * i] = e, t[3 * i + 1] = o, t[3 * i + 2] = r;
			}
			const e = new Uint8Array(P).fill(1), o = new Int32Array(P);
			for (let n = 0; n < P; n++) o[n] = n;
			const r = 9e-4;
			for (;;) {
				let l = -1, a = -1, i = 1 / 0;
				for (let n = 0; n < P; n++) if (0 !== e[n]) for (let o = n + 1; o < P; o++) {
					if (0 === e[o]) continue;
					const r = t[3 * n] - t[3 * o], s = t[3 * n + 1] - t[3 * o + 1], c = t[3 * n + 2] - t[3 * o + 2], u = r * r + s * s + c * c;
					u < i && (i = u, l = n, a = o);
				}
				if (l < 0 || i >= r) break;
				const s = H[l], c = H[a], u = s + c;
				if ($[3 * l] = ($[3 * l] * s + $[3 * a] * c) / u, $[3 * l + 1] = ($[3 * l + 1] * s + $[3 * a + 1] * c) / u, $[3 * l + 2] = ($[3 * l + 2] * s + $[3 * a + 2] * c) / u, D[3 * l] += D[3 * a], D[3 * l + 1] += D[3 * a + 1], D[3 * l + 2] += D[3 * a + 2], H[l] = u, e[a] = 0, o[a] = l, p) t[3 * l] = $[3 * l], t[3 * l + 1] = $[3 * l + 1], t[3 * l + 2] = $[3 * l + 2];
				else {
					const [e, o, r] = n($[3 * l], $[3 * l + 1], $[3 * l + 2]);
					t[3 * l] = e, t[3 * l + 1] = o, t[3 * l + 2] = r;
				}
			}
			const l = new Int32Array(P);
			let a = 0;
			for (let n = 0; n < P; n++) 0 !== e[n] && (l[n] = a, $[3 * a] = $[3 * n], $[3 * a + 1] = $[3 * n + 1], $[3 * a + 2] = $[3 * n + 2], D[3 * a] = D[3 * n], D[3 * a + 1] = D[3 * n + 1], D[3 * a + 2] = D[3 * n + 2], H[a] = H[n], a++);
			if (a < P) {
				const t = new Int32Array(P);
				for (let e = 0; e < P; e++) {
					let n = e;
					for (; o[n] !== n;) n = o[n];
					t[e] = l[n];
				}
				for (let e = 0; e < s; e++) y[e] >= 0 && (y[e] = t[y[e]]);
				H = H.slice(0, a), P = a;
			}
		}
		const N = w(H, P), L = new Int32Array(P), O = new Uint8Array(3 * P), j = [], K = new Uint32Array(P);
		for (let n = 0; n < P; n++) {
			const t = N[n];
			L[t] = n;
			const e = 1 / H[t], o = Math.round(D[3 * t] * e), r = Math.round(D[3 * t + 1] * e), l = Math.round(D[3 * t + 2] * e);
			O[3 * n] = o, O[3 * n + 1] = r, O[3 * n + 2] = l, j.push(a(o, r, l)), K[n] = H[t];
		}
		for (let n = 0; n < s; n++) y[n] >= 0 && (y[n] = L[y[n]]);
		return {
			labels: {
				width: o,
				height: l,
				data: y,
				count: P
			},
			paletteHex: j,
			paletteRgb: O,
			counts: K
		};
	}(t, {
		k: e,
		colorSpace: "oklab",
		quality: 4,
		seed: 1374496523,
		autoK: !0
	}).paletteHex;
	l >= 2 && l <= 32 && o.push({
		id: "exact",
		label: `Exact (${l})`,
		colors: i(Math.min(32, l)),
		description: "Every color the image actually uses."
	});
	const u = i(l <= 12 ? Math.max(2, Math.min(12, l)) : 12);
	if (o.push({
		id: "balanced",
		label: `Balanced (${u.length})`,
		colors: u,
		description: "Perceptual clustering at a comfortable size."
	}), l > 8) {
		const t = i(6);
		o.push({
			id: "bold",
			label: `Bold (${t.length})`,
			colors: t,
			description: "Few strong tones — poster and print friendly."
		});
	}
	if (l > 64) {
		const t = i(24);
		o.push({
			id: "rich",
			label: `Rich (${t.length})`,
			colors: t,
			description: "Wide tonal coverage for detailed art."
		});
	}
	o.push({
		id: "vivid",
		label: `Vivid (${u.length})`,
		colors: A(u.map((t) => M(t, 1.45, 0))),
		description: "The balanced palette with the saturation pushed."
	}), o.push({
		id: "muted",
		label: `Muted (${u.length})`,
		colors: A(u.map((t) => M(t, .5, .06))),
		description: "Soft, pastel take on the image colors."
	});
	const h = function(t) {
		let e = null, o = -1;
		for (const l of t) {
			const t = r(l);
			if (!t) continue;
			const [, a, i] = n(t[0] / 255, t[1] / 255, t[2] / 255), s = Math.hypot(a, i);
			s > o && (o = s, e = l);
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
function M(t, e, o) {
	const l = r(t);
	if (!l) return t;
	const [a, c, u] = n(l[0] / 255, l[1] / 255, l[2] / 255);
	return i(s(a * (1 - o) + o, 0, 1), c * e, u * e);
}
function m(t, e) {
	const o = r(t) ?? [
		26,
		26,
		46
	], [l, a, s] = n(o[0] / 255, o[1] / 255, o[2] / 255), c = Math.min(l, .45), u = [];
	for (let n = 0; n < e; n++) {
		const t = n / (e - 1), o = c + (.97 - c) * t, r = 1 - .85 * t;
		u.push(i(o, a * r, s * r));
	}
	return A(u);
}
function b(t) {
	const e = [];
	for (let n = 0; n < t; n++) e.push(i(.12 + n / (t - 1) * .84, 0, 0));
	return e;
}
function A(t) {
	return [...new Set(t)];
}
(function(t) {
	const e = (e, n) => t.postMessage(e, n);
	t.addEventListener("message", (t) => {
		const n = t.data;
		if ("suggestPalettes" !== n.type) return;
		const { id: o, width: r, height: l, buffer: a, analysis: i } = n;
		try {
			const t = y({
				width: r,
				height: l,
				data: new Uint8ClampedArray(a)
			}, i);
			e({
				type: "palettes",
				id: o,
				suggestions: t
			});
		} catch (s) {
			e({
				type: "error",
				id: o,
				message: s instanceof Error ? s.message : String(s)
			});
		}
	});
})(self);
