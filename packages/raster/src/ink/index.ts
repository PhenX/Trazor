/**
 * The ink front end, ported from inkvec: the intake measurements, the MDL
 * palette and its labels, the region passes, the residual noise, and each
 * region's fill (the band merge, the carve, the flat-fill snap) — what the
 * planar chain traces in place of the classic segmentation. Exported as one
 * namespace (`ink`) so its names stay clear of the classic front end's.
 */
export {
  DEFAULT_MAX_COLORS,
  DEFAULT_MERGE_DISTANCE,
  isSoftIntake,
  MEASURED_SIGMA_CAP,
  MEASURED_SIGMA_SCALE,
  paletteEvidence,
  splitAlphaInks,
} from './palette'
export type { Palette, PaletteEvidence } from './palette'
export { extractPaletteMdl, labelImage } from './mdl'
export { colorIdsOfRgb } from './distinct'
export type { ColorIds } from './distinct'
export {
  absorbBlendSlivers,
  capComponents,
  despeckle,
  MAX_FACES,
  reassignBlendPixels,
  splitComponents,
} from './regions'
export { findComponents } from './components'
export { residualSigma } from './regularize'
export { intakeEvidence, intakePixels } from '../intake/coverage'
export type { IntakeEvidence, IntakePixels } from '../intake/coverage'
export { snapFlatFills } from './snap'
export { mergeGradientBands } from '../fill/bands'
export type { BandMerge } from '../fill/bands'
export { carveResidualFeatures } from '../fill/carve'
export { bicLambda } from '../fill/select'
export { representative } from '../fill/model'
export type { FillFit, FillModel } from '../fill/model'
export { fillToPaint, toHex } from '../fill/svg'
