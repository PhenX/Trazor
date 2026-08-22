import type { GrayImage, RasterImage } from '@vectorizer/core'
import type { InferenceSession } from 'onnxruntime-web'
import { errorMessage } from './errors'
import {
  bilinearResizePlane,
  bilinearResizeRgba,
  clampPlane01,
  cropRgba,
  IMAGENET_MEAN,
  IMAGENET_STD,
  packNchw,
  planTiles,
  stitchPlane,
} from './imageops'
import type { OrtModule } from './ort'
import { MODEL_REGISTRY } from './registry'
import { releaseSession, tensorFloatData } from './session-util'
import { ModelStore } from './store'
import type { MlBackend, MlProgressFn } from './types'

const INPUT_SIZE = 256
const TILE_OVERLAP = 32

/**
 * Learned edge / boundary pre-pass (docs/EDGE_PREPASS.md): predicts a clean
 * boundary probability map from a possibly-degraded raster, for the trace stage
 * to consume as a discretized hint. A Tier-2 conditioning stage — it never writes
 * geometry itself. Fails soft: until weights are published (see registry.ts),
 * `create()` rejects at fetch time and the app traces classically.
 */
export class EdgeEnhancer {
  private readonly ort: OrtModule
  private session: InferenceSession | null

  private constructor(ort: OrtModule, session: InferenceSession) {
    this.ort = ort
    this.session = session
  }

  static async create(opts?: {
    // 'wasm' pins the deterministic backend (reproducible mode); default prefers WebGPU.
    preferBackend?: MlBackend
    onProgress?: MlProgressFn
  }): Promise<EdgeEnhancer> {
    const buffer = await new ModelStore().fetch(MODEL_REGISTRY['edge-prepass'], opts?.onProgress)
    const { createModelSession } = await import('./ort')
    const { ort, session } = await createModelSession(
      buffer,
      'edge pre-pass model',
      opts?.onProgress,
      opts?.preferBackend,
    )
    return new EdgeEnhancer(ort, session)
  }

  /** Boundary probability map ([0,1] GrayImage) at the input image's resolution. */
  async run(
    image: RasterImage,
    opts?: { onProgress?: MlProgressFn },
  ): Promise<{ edges: GrayImage }> {
    if (!this.session) throw new Error('EdgeEnhancer has been disposed')
    opts?.onProgress?.({ phase: 'run' })

    const { width, height } = image
    // Images larger than the model input are swept in overlapping tiles and
    // stitched; smaller ones run in a single pass (resized to the model input).
    const tileW = Math.min(INPUT_SIZE, width)
    const tileH = Math.min(INPUT_SIZE, height)
    const placements = planTiles(width, height, tileW, tileH, TILE_OVERLAP)

    let data: Float32Array
    if (placements.length === 1) {
      data = await this.inferTile(image, tileW, tileH)
    } else {
      const planes: Float32Array[] = []
      for (const { x, y } of placements) {
        // A single ORT session is not safe to run concurrently — sweep in order.
        // oxlint-disable-next-line no-await-in-loop
        planes.push(await this.inferTile(cropRgba(image, x, y, tileW, tileH), tileW, tileH))
      }
      data = stitchPlane(width, height, tileW, tileH, placements, planes)
    }
    return { edges: { width, height, data } }
  }

  /**
   * One tile: resize to the model input, run, resize the boundary output back to
   * the tile size, clamped to [0,1]. Assumes the exported model applies its own
   * sigmoid; preprocessing is ImageNet-normalized RGB (weights must match).
   */
  private async inferTile(tile: RasterImage, tileW: number, tileH: number): Promise<Float32Array> {
    const session = this.session
    if (!session) throw new Error('EdgeEnhancer has been disposed')
    const resized = bilinearResizeRgba(tile, INPUT_SIZE, INPUT_SIZE)
    const input = packNchw(resized, IMAGENET_MEAN, IMAGENET_STD, { scale: 1 / 255 })
    const feeds: InferenceSession.FeedsType = {
      [session.inputNames[0]]: new this.ort.Tensor('float32', input, [
        1,
        3,
        INPUT_SIZE,
        INPUT_SIZE,
      ]),
    }
    let outputs: InferenceSession.ReturnType
    try {
      outputs = await session.run(feeds)
    } catch (err) {
      throw new Error(`Edge pre-pass failed (${errorMessage(err)})`, { cause: err })
    }
    const tensor = outputs[session.outputNames[0]]
    if (!tensor) throw new Error('Edge pre-pass failed (the model returned no output)')
    let raw: Float32Array
    try {
      raw = await tensorFloatData(tensor)
    } catch (err) {
      throw new Error(`Edge pre-pass failed (${errorMessage(err)})`, { cause: err })
    }
    const dims = tensor.dims
    const mapHeight = dims.length >= 2 ? dims[dims.length - 2] : INPUT_SIZE
    const mapWidth = dims.length >= 1 ? dims[dims.length - 1] : INPUT_SIZE
    const clamped = clampPlane01(raw.subarray(0, mapWidth * mapHeight))
    return bilinearResizePlane(clamped, mapWidth, mapHeight, tileW, tileH)
  }

  dispose(): void {
    releaseSession(this.session)
    this.session = null
  }
}
