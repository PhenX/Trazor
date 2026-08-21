import type { VectorizeSettings } from './settings'

export type ProfileId =
  | 'illustration'
  | 'photo'
  | 'logo'
  | 'poster'
  | 'pixel-art'
  | 'bw-sketch'
  | 'vinyl-cut'
  | 'laser-engrave'
  | 'pen-plotter'
  | 'stencil'

export interface TargetProfile {
  id: ProfileId
  label: string
  tagline: string
  /** Practical notes shown in the UI (machine hints, expectations). */
  notes: readonly string[]
  patch: Partial<VectorizeSettings>
}

/**
 * Curated starting points per output target. Profiles are patches over the
 * defaults; the user can tweak anything afterwards.
 */
export const TARGET_PROFILES: readonly TargetProfile[] = [
  {
    id: 'illustration',
    label: 'Illustration',
    tagline: 'Faithful multi-color art with smooth stacked layers',
    notes: [
      'Stacked layers: shapes extend under the ones above, so edges never crack.',
      'Raise the palette size if subtle shades disappear.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 24,
      quantizeQuality: 7,
      layering: 'stacked',
      smoothing: 0.8,
      minRegionArea: 4,
    },
  },
  {
    id: 'photo',
    label: 'Photo / Poster art',
    tagline: 'Posterized photographic look',
    notes: [
      'Bilateral denoise keeps edges while flattening sensor noise.',
      'Expect a stylized result: photographs cannot stay photographic as vectors.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 32,
      quantizeQuality: 8,
      denoise: 'bilateral',
      layering: 'stacked',
      smoothing: 0.85,
      minRegionArea: 10,
      maxDimension: 1200,
    },
  },
  {
    id: 'logo',
    label: 'Logo / Flat design',
    tagline: 'Few colors, clean geometry, minimal nodes',
    notes: [
      'Seam-free cutout partition: shapes share exact boundaries, ideal for editing.',
      'Increase smoothing if corners look nicked; lower it for technical marks.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 8,
      autoPaletteSize: true,
      layering: 'cutout',
      smoothing: 0.8,
      minRegionArea: 12,
      curveOptimize: true,
      optTolerance: 0.4,
    },
  },
  {
    id: 'poster',
    label: 'Screen print',
    tagline: 'Bold spot-color separation',
    notes: [
      'Each color is a separable layer for screen or riso printing.',
      'Use omit-background to leave paper color unprinted.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 6,
      layering: 'cutout',
      smoothing: 0.85,
      minRegionArea: 24,
      omitBackground: true,
    },
  },
  {
    id: 'pixel-art',
    label: 'Pixel art',
    tagline: 'Exact pixel boundaries, exact colors',
    notes: [
      'No smoothing and no resampling: every pixel edge is preserved.',
      'Colors are kept exact when the sprite has 64 or fewer.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 64,
      autoPaletteSize: true,
      maxDimension: 0,
      curveMode: 'pixel',
      layering: 'cutout',
      minRegionArea: 0,
      denoise: 'none',
      blurRadius: 0,
      precision: 0,
    },
  },
  {
    id: 'bw-sketch',
    label: 'Ink sketch',
    tagline: 'Black & white with automatic threshold',
    notes: ['Otsu picks the threshold; switch to adaptive for uneven lighting.'],
    patch: {
      mode: 'bw',
      thresholdMode: 'auto',
      smoothing: 0.75,
      minRegionArea: 8,
    },
  },
  {
    id: 'vinyl-cut',
    label: 'Vinyl cutter',
    tagline: 'Cricut / Silhouette ready cut file',
    notes: [
      'Millimeter units and generous speckle filtering: blades hate micro-shapes.',
      'Weeding is easier with fewer, larger regions — raise the minimum region size if needed.',
      'Import the SVG at 100% scale; the document carries its physical size.',
    ],
    patch: {
      mode: 'bw',
      thresholdMode: 'auto',
      layering: 'cutout',
      minRegionArea: 48,
      smoothing: 0.7,
      curveOptimize: true,
      unit: 'mm',
      precision: 3,
      detectIslands: false,
    },
  },
  {
    id: 'laser-engrave',
    label: 'Laser engrave',
    tagline: 'Filled engraving areas with crisp edges',
    notes: [
      'Solid fills engrave; add a separate hairline pass in your laser software to cut.',
      'Adaptive threshold rescues unevenly lit photos.',
    ],
    patch: {
      mode: 'bw',
      thresholdMode: 'auto',
      minRegionArea: 4,
      smoothing: 0.6,
      unit: 'mm',
      precision: 3,
    },
  },
  {
    id: 'pen-plotter',
    label: 'Pen plotter',
    tagline: 'Single-stroke centerlines instead of outlines',
    notes: [
      'Strokes follow the middle of each drawn line — one pen pass per line.',
      'Stroke width 0 estimates the pen width from the source line thickness.',
      'Best input: line drawings, handwriting, technical sketches.',
    ],
    patch: {
      mode: 'centerline',
      thresholdMode: 'auto',
      pruneLength: 12,
      smoothing: 0.8,
      fitTolerance: 1.6,
      unit: 'mm',
      precision: 3,
    },
  },
  {
    id: 'stencil',
    label: 'Stencil',
    tagline: 'Cuttable single-color stencil with island warnings',
    notes: [
      'Enclosed islands (like the middle of an "O") fall out of a physical stencil — the checker flags them.',
      'Add bridges in a vector editor where islands are reported.',
    ],
    patch: {
      mode: 'bw',
      thresholdMode: 'auto',
      minRegionArea: 64,
      smoothing: 0.8,
      layering: 'cutout',
      detectIslands: true,
      unit: 'mm',
      precision: 3,
    },
  },
]

export function getProfile(id: ProfileId): TargetProfile {
  const profile = TARGET_PROFILES.find((p) => p.id === id)
  if (!profile) throw new Error(`unknown profile: ${id}`)
  return profile
}
