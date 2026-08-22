import type { RasterImage } from '@vectorizer/core'
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
  rgbPlanesToImage,
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
 * Learned cleanup pre-pass (docs/CLEANUP_PREPASS.md): predicts a clean RGB image
 * from a possibly-degraded raster (JPEG blocks, resampling ringing, sensor
 * noise), for the classical tracer to run on in *any* mode. Unlike the edge
 * pre-pass this rewrites the pixels the tracer sees, so it applies as a one-shot
 * that replaces the working image rather than a per-run hint. A Tier-2 stage: its
 * 8-bit output is the discretization boundary, and the classical path downstream
 * stays byte-identical (reproducible mode pins the WASM backend). Fails soft:
 * until weights are published (see registry.ts), `create()` rejects at fetch time
 * and the app leaves the image untouched.
 */
export class CleanupEnhancer {
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
  }): Promise<CleanupEnhancer> {
    const buffer = await new ModelStore().fetch(MODEL_REGISTRY.cleanup, opts?.onProgress)
    const { createModelSession } = await import('./ort')
    const { ort, session } = await createModelSession(
      buffer,
      'cleanup model',
      opts?.onProgress,
      opts?.preferBackend,
    )
    return new CleanupEnhancer(ort, session)
  }

  /** Cleaned RGB image at the input's resolution; the source alpha is preserved. */
  async run(
    image: RasterImage,
    opts?: { onProgress?: MlProgressFn },
  ): Promise<{ image: RasterImage }> {
    if (!this.session) throw new Error('CleanupEnhancer has been disposed')
    opts?.onProgress?.({ phase: 'run' })

    const { width, height } = image
    // Images larger than the model input are swept in overlapping tiles and
    // stitched per channel; smaller ones run in a single resized pass.
    const tileW = Math.min(INPUT_SIZE, width)
    const tileH = Math.min(INPUT_SIZE, height)
    const placements = planTiles(width, height, tileW, tileH, TILE_OVERLAP)

    let planes: [Float32Array, Float32Array, Float32Array]
    if (placements.length === 1) {
      planes = await this.inferTile(image, tileW, tileH)
    } else {
      const r: Float32Array[] = []
      const g: Float32Array[] = []
      const b: Float32Array[] = []
      for (const { x, y } of placements) {
        // A single ORT session is not safe to run concurrently — sweep in order.
        // oxlint-disable-next-line no-await-in-loop
        const [tr, tg, tb] = await this.inferTile(cropRgba(image, x, y, tileW, tileH), tileW, tileH)
        r.push(tr)
        g.push(tg)
        b.push(tb)
      }
      planes = [
        stitchPlane(width, height, tileW, tileH, placements, r),
        stitchPlane(width, height, tileW, tileH, placements, g),
        stitchPlane(width, height, tileW, tileH, placements, b),
      ]
    }
    const cleaned = rgbPlanesToImage(planes[0], planes[1], planes[2], width, height, image.data)
    return { image: cleaned }
  }

  /**
   * One tile: resize to the model input, run, split the `[1,3,h,w]` output into
   * three [0,1] channel planes resized back to the tile size. Preprocessing is
   * ImageNet-normalized RGB and the export applies its own sigmoid (weights must
   * match — see scripts/train).
   */
  private async inferTile(
    tile: RasterImage,
    tileW: number,
    tileH: number,
  ): Promise<[Float32Array, Float32Array, Float32Array]> {
    const session = this.session
    if (!session) throw new Error('CleanupEnhancer has been disposed')
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
      throw new Error(`Cleanup failed (${errorMessage(err)})`, { cause: err })
    }
    const tensor = outputs[session.outputNames[0]]
    if (!tensor) throw new Error('Cleanup failed (the model returned no output)')
    let raw: Float32Array
    try {
      raw = await tensorFloatData(tensor)
    } catch (err) {
      throw new Error(`Cleanup failed (${errorMessage(err)})`, { cause: err })
    }
    const dims = tensor.dims
    const mapHeight = dims.length >= 2 ? dims[dims.length - 2] : INPUT_SIZE
    const mapWidth = dims.length >= 1 ? dims[dims.length - 1] : INPUT_SIZE
    const plane = mapWidth * mapHeight
    if (raw.length < 3 * plane) throw new Error('Cleanup failed (output smaller than 3 channels)')
    const channel = (c: number): Float32Array =>
      bilinearResizePlane(
        clampPlane01(raw.subarray(c * plane, (c + 1) * plane)),
        mapWidth,
        mapHeight,
        tileW,
        tileH,
      )
    return [channel(0), channel(1), channel(2)]
  }

  dispose(): void {
    releaseSession(this.session)
    this.session = null
  }
}
