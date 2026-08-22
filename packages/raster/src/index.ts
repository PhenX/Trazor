/**
 * @vectorizer/raster — classical raster operations consumed by the
 * vectorization engine: downscaling, denoising, background flattening,
 * color-space conversion, quantization, thresholding, region cleanup,
 * morphology and skeletonization.
 */
export { resizeToFit } from './resize'
export { bilateralFilter, gaussianBlur, medianFilter } from './filters'
export { borderDominantColor, flattenImage } from './background'
export type { FlattenResult } from './background'
export { toGrayscale, toOklabBuffer } from './convert'
export { quantize } from './quantize'
export type { QuantizeOptions, QuantizeResult } from './quantize'
export { adaptiveBinarize, binarize, otsuThreshold } from './threshold'
export { extractLabelMask, maskArea, mergeSmallRegions } from './regions'
export type { MergeOptions } from './regions'
export { despeckleMask, dilate, erode } from './morphology'
export { chamferDistance, estimateStrokeWidth, zhangSuenThin } from './thin'
