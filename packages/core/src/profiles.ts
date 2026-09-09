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
      layering: 'solid-base',
      smoothing: 0.8,
      minRegionArea: 4,
      colorCoherence: 0.5,
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
      layering: 'solid-base',
      smoothing: 0.85,
      minRegionArea: 10,
      colorCoherence: 0.5,
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
      layering: 'knockout',
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
      'Each color is its own <g> layer — one screen or riso pass per color.',
      'A 0.2 mm trap overlaps neighbouring colors at their shared seams, so slight screen misregistration never leaves a gap of bare substrate. Dial it to your press.',
      'Omit-background leaves the substrate color unprinted.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 6,
      layering: 'trap',
      groupByColor: true,
      smoothing: 0.85,
      minRegionArea: 24,
      omitBackground: true,
      gapFill: 0.2,
      unit: 'mm',
      precision: 3,
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
      layering: 'knockout',
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
    tagline: 'Knockout spot-color cut file, one sheet per color',
    notes: [
      'Knockout build: each color is its own <g> — cut it on that color of vinyl. The colors butt at one height, so the piece stays thin and every sheet bonds straight to the garment (the pro way to layer HTV).',
      'A 0.5 mm overlap (trap) at each seam means a slight misalignment never shows the substrate. Dial it to your press, or set it to 0 for a pure butt joint.',
      'Enclosed details are cut as their own regions — no buried sheets to weed or line up.',
      'For a solid cartoon build, set Layering to Solid base and Base color to Darkest: the black becomes a full backing sheet the other colors stack onto.',
      'Auto-reduce keeps the sheet count low; raise Colors if a shade you need is missing.',
      'The backdrop color is dropped — turn off Omit background to keep it.',
      'Millimeter units at 100% scale; raise Min region to drop specks a blade cannot weed.',
    ],
    patch: {
      mode: 'color',
      paletteSize: 6,
      autoPaletteSize: true,
      layering: 'trap',
      groupByColor: true,
      gapFill: 0.5,
      minRegionArea: 16,
      preserveDetails: true,
      omitBackground: true,
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
      layering: 'knockout',
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
