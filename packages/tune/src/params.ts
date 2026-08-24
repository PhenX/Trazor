import { normalizeSettings } from '@trazor/core'
import type { VectorizeMode, VectorizeSettings } from '@trazor/core'

/**
 * A tunable field of `VectorizeSettings`, described by metadata so the search
 * generates and steps candidates without hardcoded per-parameter loops.
 *
 * Numeric ranges mirror `normalizeSettings`' clamps exactly (asserted by a test):
 * a generated candidate is always already normalized, so the dedup key is
 * canonical and no probe is silently clamped into a duplicate.
 */
export interface ParamSpec {
  key: TunableKey
  kind: 'number' | 'int' | 'bool' | 'enum'
  /** Inclusive bounds for `number`/`int`. */
  min?: number
  max?: number
  /** Arithmetic domain for stepping (`log` needs `min` > 0). Default `linear`. */
  scale?: 'linear' | 'log'
  /** Choices for `enum`. */
  values?: readonly string[]
  /** Modes this parameter affects; absent ⇒ every mode. */
  modes?: readonly VectorizeMode[]
  /** Which pipeline cost tier a change invalidates (mirrors the engine cache keys). */
  group: 'preprocess' | 'palette' | 'binarize' | 'curve' | 'output'
  /** Only meaningful under these settings (e.g. `adaptiveRadius` needs adaptive thresholding). */
  when?: (s: VectorizeSettings) => boolean
  /** Excluded from the default free set — a structural or cosmetic move the user opts into. */
  optIn?: boolean
}

/** Keys of `VectorizeSettings` the search is allowed to touch. */
export type TunableKey = Exclude<
  keyof VectorizeSettings,
  // Never searched: identity of the output, or cosmetic/physical fields the
  // objectives can't legitimately trade (see docs/AUTO_TUNE_PLAN.md).
  | 'mode'
  | 'maxDimension'
  | 'background'
  | 'backgroundColor'
  | 'alphaThreshold'
  | 'colorSpace'
  | 'palette'
  | 'gapFill'
  | 'fillColor'
  | 'unit'
  | 'widthMm'
  | 'svgTitle'
  | 'groupByColor'
  | 'detectIslands'
>

const COLOR_MODES = ['color', 'grayscale'] as const
const INK_MODES = ['bw', 'centerline'] as const

/** Palette parameters are ignored while a fixed palette is pinned. */
const autoPalette = (s: VectorizeSettings): boolean => s.palette === null

/**
 * The tunable parameter space. `optIn` entries are held unless the caller lists
 * them in `TuneOptions.free`; everything else is searched by default.
 */
export const TUNABLE_PARAMS: readonly ParamSpec[] = [
  // ---- preprocess (opt-in: a full-pipeline recompute per probe) ----
  { key: 'blurRadius', kind: 'number', min: 0, max: 10, group: 'preprocess', optIn: true },
  {
    key: 'denoise',
    kind: 'enum',
    values: ['none', 'median', 'bilateral'],
    group: 'preprocess',
    optIn: true,
  },

  // ---- palette (color / grayscale) ----
  {
    key: 'paletteSize',
    kind: 'int',
    min: 2,
    max: 64,
    scale: 'log',
    modes: COLOR_MODES,
    group: 'palette',
    when: autoPalette,
  },
  {
    key: 'autoPaletteSize',
    kind: 'bool',
    modes: COLOR_MODES,
    group: 'palette',
    when: autoPalette,
  },
  {
    key: 'quantizeQuality',
    kind: 'int',
    min: 1,
    max: 10,
    modes: COLOR_MODES,
    group: 'palette',
    when: autoPalette,
  },
  { key: 'minRegionArea', kind: 'int', min: 0, max: 128, modes: COLOR_MODES, group: 'palette' },
  { key: 'preserveDetails', kind: 'bool', modes: COLOR_MODES, group: 'palette' },
  { key: 'dissolveBands', kind: 'int', min: 0, max: 4, modes: COLOR_MODES, group: 'palette' },
  { key: 'colorCoherence', kind: 'number', min: 0, max: 1, modes: COLOR_MODES, group: 'palette' },
  { key: 'omitBackground', kind: 'bool', modes: COLOR_MODES, group: 'palette', optIn: true },

  // ---- binarize (bw / centerline) ----
  {
    key: 'thresholdMode',
    kind: 'enum',
    values: ['auto', 'fixed', 'adaptive'],
    modes: INK_MODES,
    group: 'binarize',
  },
  {
    key: 'threshold',
    kind: 'int',
    min: 0,
    max: 255,
    modes: INK_MODES,
    group: 'binarize',
    when: (s) => s.thresholdMode === 'fixed',
  },
  {
    key: 'adaptiveRadius',
    kind: 'int',
    min: 2,
    max: 128,
    scale: 'log',
    modes: INK_MODES,
    group: 'binarize',
    when: (s) => s.thresholdMode === 'adaptive',
  },
  {
    key: 'adaptiveBias',
    kind: 'number',
    min: -64,
    max: 64,
    modes: INK_MODES,
    group: 'binarize',
    when: (s) => s.thresholdMode === 'adaptive',
  },
  { key: 'invert', kind: 'bool', modes: INK_MODES, group: 'binarize', optIn: true },

  // ---- curve (trace onward; preprocess + palette caches stay warm) ----
  { key: 'smoothing', kind: 'number', min: 0, max: 1, group: 'curve' },
  { key: 'curveOptimize', kind: 'bool', group: 'curve' },
  {
    key: 'optTolerance',
    kind: 'number',
    min: 0,
    max: 5,
    group: 'curve',
    when: (s) => s.curveOptimize,
  },
  { key: 'cornerThreshold', kind: 'number', min: 0, max: 180, group: 'curve' },
  { key: 'simplifyTolerance', kind: 'number', min: 0, max: 10, group: 'curve' },
  {
    key: 'turnPolicy',
    kind: 'enum',
    values: ['minority', 'majority', 'black', 'white', 'left', 'right'],
    group: 'curve',
  },
  {
    key: 'curveMode',
    kind: 'enum',
    values: ['spline', 'polygon', 'pixel'],
    group: 'curve',
    optIn: true,
  },
  {
    key: 'layering',
    kind: 'enum',
    values: ['stacked', 'cutout'],
    modes: COLOR_MODES,
    group: 'curve',
    optIn: true,
  },
  {
    key: 'fitTolerance',
    kind: 'number',
    min: 0.1,
    max: 10,
    scale: 'log',
    modes: ['centerline'],
    group: 'curve',
  },
  {
    key: 'pruneLength',
    kind: 'number',
    min: 0,
    max: 256,
    modes: ['centerline'],
    group: 'curve',
  },
  {
    key: 'strokeWidth',
    kind: 'number',
    min: 0,
    max: 64,
    modes: ['centerline'],
    group: 'curve',
  },

  // ---- output ----
  { key: 'precision', kind: 'int', min: 0, max: 4, group: 'output' },
  { key: 'optimizeSvg', kind: 'bool', group: 'output' },
]

/** Keys searched unless the caller overrides `TuneOptions.free`. */
export const DEFAULT_FREE: readonly TunableKey[] = TUNABLE_PARAMS.filter((p) => !p.optIn).map(
  (p) => p.key,
)

const SPEC_BY_KEY = new Map<TunableKey, ParamSpec>(TUNABLE_PARAMS.map((p) => [p.key, p]))

export function specFor(key: TunableKey): ParamSpec {
  const spec = SPEC_BY_KEY.get(key)
  if (!spec) throw new Error(`no tunable spec for ${key}`)
  return spec
}

/** Parameters that apply to `mode` and whose `when` guard holds for `settings`. */
export function applicableParams(
  keys: readonly TunableKey[],
  mode: VectorizeMode,
  settings: VectorizeSettings,
): ParamSpec[] {
  const out: ParamSpec[] = []
  for (const key of keys) {
    const spec = SPEC_BY_KEY.get(key)
    if (!spec) continue
    if (spec.modes && !spec.modes.includes(mode)) continue
    if (spec.when && !spec.when(settings)) continue
    out.push(spec)
  }
  return out
}

/** Map a parameter value to its [0,1] search coordinate (linear or log domain). */
export function toUnit(spec: ParamSpec, value: number): number {
  const min = spec.min ?? 0
  const max = spec.max ?? 1
  if (max <= min) return 0
  if (spec.scale === 'log') {
    const lo = Math.log(min)
    const hi = Math.log(max)
    return (Math.log(clampTo(value, min, max)) - lo) / (hi - lo)
  }
  return (clampTo(value, min, max) - min) / (max - min)
}

/** Inverse of {@link toUnit}: a [0,1] coordinate back to a valid parameter value. */
export function fromUnit(spec: ParamSpec, unit: number): number {
  const min = spec.min ?? 0
  const max = spec.max ?? 1
  const u = clampTo(unit, 0, 1)
  let value: number
  if (spec.scale === 'log') {
    value = Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min)))
  } else {
    value = min + u * (max - min)
  }
  if (spec.kind === 'int') value = Math.round(value)
  return clampTo(value, min, max)
}

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * A canonical string key for a settings object, for deduping candidates. Keys
 * are sorted so two equal settings always hash identically; the input is
 * normalized first so clamped/rounded fields collapse.
 */
export function settingsKey(settings: VectorizeSettings): string {
  const s = normalizeSettings(settings)
  const keys = Object.keys(s).toSorted()
  const parts: string[] = []
  for (const k of keys) {
    const v = (s as unknown as Record<string, unknown>)[k]
    parts.push(`${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
  }
  return parts.join('|')
}
