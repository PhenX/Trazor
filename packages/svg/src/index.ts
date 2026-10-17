export { analyzeSvg } from './analyze'
export type { SvgAnalysis } from './analyze'
export { extractGeometry } from './geometry'
export type { SvgElementKind, SvgGeometry, SvgGeometryShape } from './geometry'
export { buildPathData, formatNumber } from './pathdata'
export { optimizePathData } from './optimize'
export { cleanCommands } from './clean'
export { arcToCubics, fitArcs } from './arc'
export { annulusStroke, detectPrimitive, STROKE_TOL } from './primitive'
export type { Primitive, StrokedPrimitive } from './primitive'
export { serializeSvg, shapeOut } from './serialize'
export type {
  SerializeOptions,
  ShapeOut,
  SvgDocument,
  SvgGradient,
  SvgShape,
  SvgText,
} from './serialize'
