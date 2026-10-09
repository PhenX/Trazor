export {
  traceMask,
  shapesFromPaths,
  closedPathToCommands,
  ringPolygon,
  polygonToCommands,
  pixelCommands,
} from './closed'
export type { RingFit, TraceCurveOptions, TraceMaskOptions, TracedShape } from './closed'
export type { CoveragePatch } from './coverage'
export {
  assembleFaces,
  assembleRegions,
  extractChains,
  fitChain,
  fitChains,
  traceLabelMap,
} from './boundary'
export type {
  BoundaryChain,
  ChainFit,
  ChainNetwork,
  ColorField,
  FaceShape,
  RegionShape,
  TraceCutoutOptions,
} from './boundary'
export { traceCenterline } from './centerline'
export type { CenterlineOptions, StrokePath } from './centerline'
export { decomposeMask } from './crack'
export type { CrackPath } from './crack'
export { simplifyOpen } from './simplify'
export { fitOpenPolyline, fitCubicSegment } from './fit'
export type { Cubic } from './fit'
export { optimalPolyline, straightReach } from './potrace/polyfit'
export {
  refineRingToField,
  pairwiseField,
  layerField,
  coverageOf,
  signedFieldOf,
  negatedField,
} from './refine'
export type { SignedField, LayerFieldSource } from './refine'
export { reverseCommands } from './paths'
export type { FlatPoints } from './paths'
export { OUTSIDE, CLEAR, fitConfig, syncNodes } from './planar/types'
export type {
  EdgePrimitive,
  FaceFill,
  FaceRing,
  Faces,
  FitConfig,
  FittedEdge,
  PlanarEdge,
  PlanarMap,
  PlanarNode,
} from './planar/types'
export { splitFaces } from './planar/faces'
export { buildPlanarMap } from './planar/map'
export { faceRings, faceNesting, ringPolygon as faceRingPolygon } from './planar/rings'
export type { FaceNesting } from './planar/rings'
export { regionRings, innerFaces } from './planar/regions'
