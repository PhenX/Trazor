function e(e) {
	return e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4);
}
function t(t, r, n) {
	const o = e(t), i = e(r), a = e(n), s = Math.cbrt(.4122214708 * o + .5363325363 * i + .0514459929 * a), c = Math.cbrt(.2119034982 * o + .6806995451 * i + .1073969566 * a), l = Math.cbrt(.0883024619 * o + .2817188376 * i + .6299787005 * a);
	return [
		.2104542553 * s + .793617785 * c - .0040720468 * l,
		1.9779984951 * s - 2.428592205 * c + .4505937099 * l,
		.0259040371 * s + .7827717662 * c - .808675766 * l
	];
}
function r(e, t, r, n, o, i) {
	return Math.sqrt(function(e, t, r, n, o, i) {
		const a = e - n, s = t - o, c = r - i;
		return a * a + s * s + c * c;
	}(e, t, r, n, o, i));
}
function n(e, t, r) {
	return e < t ? t : e > r ? r : e;
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
const o = 2048;
function i(e, t) {
	if (0 === t) return 0;
	const r = .95 * t;
	let n = 0;
	for (let i = 0; i < o; i++) if (n += e[i], n >= r) return (i + 1) / o;
	return 1;
}
(function(e) {
	const a = (t, r) => e.postMessage(t, r);
	let s = null;
	e.addEventListener("message", (e) => {
		const c = e.data;
		if ("set-reference" === c.type) return void (s = {
			refId: c.refId,
			width: c.width,
			height: c.height,
			data: new Uint8ClampedArray(c.reference)
		});
		if ("score" !== c.type) return;
		const { id: l, width: d, height: f, rendered: h, reference: u, refId: p, heatmap: g = !0 } = c;
		try {
			const e = new Uint8ClampedArray(h);
			let c;
			if (void 0 !== p) {
				if (!s || s.refId !== p) throw new Error("reference not set");
				if (s.width !== d || s.height !== f) throw new Error("reference size mismatch");
				c = s.data;
			} else {
				if (void 0 === u) throw new Error("no reference");
				c = new Uint8ClampedArray(u);
			}
			const { score: m, p95DeltaE: w, diff: M } = function(e, a, s, c, l = !0) {
				const d = e * a, f = Math.max(1, Math.floor(d / 2e5));
				let h = 0, u = 0;
				const p = new Uint32Array(o);
				if (!l) {
					for (let e = 0; e < d; e += f) {
						const n = 4 * e, [i, a, l] = t(s[n] / 255, s[n + 1] / 255, s[n + 2] / 255), [d, f, g] = t(c[n] / 255, c[n + 1] / 255, c[n + 2] / 255), m = r(i, a, l, d, f, g);
						h += m, u++, p[Math.min(2047, Math.floor(m * o))]++;
					}
					return {
						score: n(1 - 4 * (u > 0 ? h / u : 0), 0, 1),
						p95DeltaE: i(p, u)
					};
				}
				const g = new Uint8ClampedArray(4 * d);
				for (let i = 0; i < d; i++) {
					const e = 4 * i, [a, l, d] = t(s[e] / 255, s[e + 1] / 255, s[e + 2] / 255), [m, w, M] = t(c[e] / 255, c[e + 1] / 255, c[e + 2] / 255), y = r(a, l, d, m, w, M);
					i % f === 0 && (h += y, u++, p[Math.min(2047, Math.floor(y * o))]++);
					const v = n(y / .25, 0, 1);
					v > .02 && (g[e] = 255, g[e + 1] = 170 - 130 * v, g[e + 2] = 40 + 50 * v, g[e + 3] = 235 * Math.sqrt(v));
				}
				return {
					score: n(1 - 4 * (u > 0 ? h / u : 0), 0, 1),
					p95DeltaE: i(p, u),
					diff: g
				};
			}(d, f, e, c, g);
			M ? a({
				type: "result",
				id: l,
				score: m,
				p95DeltaE: w,
				width: d,
				height: f,
				diff: M.buffer
			}, [M.buffer]) : a({
				type: "result",
				id: l,
				score: m,
				p95DeltaE: w,
				width: d,
				height: f
			});
		} catch (m) {
			a({
				type: "error",
				id: l,
				message: m instanceof Error ? m.message : String(m)
			});
		}
	});
})(self);
