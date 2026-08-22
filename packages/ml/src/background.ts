import type { GrayImage, RasterImage } from '@vectorizer/core'
import type { InferenceSession } from 'onnxruntime-web'
import { errorMessage } from './errors'
import {
  applyAlphaMatte,
  bilinearResizePlane,
  bilinearResizeRgba,
  IMAGENET_MEAN,
  IMAGENET_STD,
  minMaxNormalize,
  packNchw,
} from './imageops'
import type { OrtModule } from './ort'
import { MODEL_REGISTRY } from './registry'
import { releaseSession, tensorFloatData } from './session-util'
import { ModelStore } from './store'
import type { MlProgressFn } from './types'

const INPUT_SIZE = 320

/** u2netp salient-object matting → alpha cutout. */
export class BackgroundRemover {
  private readonly ort: OrtModule
  private session: InferenceSession | null

  private constructor(ort: OrtModule, session: InferenceSession) {
    this.ort = ort
    this.session = session
  }

  static async create(onProgress?: MlProgressFn): Promise<BackgroundRemover> {
    const buffer = await new ModelStore().fetch(MODEL_REGISTRY.u2netp, onProgress)
    const { createModelSession } = await import('./ort')
    const { ort, session } = await createModelSession(
      buffer,
      'background-removal model',
      onProgress,
    )
    return new BackgroundRemover(ort, session)
  }

  async run(
    image: RasterImage,
    opts?: { threshold?: number; feather?: number; onProgress?: MlProgressFn },
  ): Promise<{ image: RasterImage; matte: GrayImage }> {
    const session = this.session
    if (!session) throw new Error('BackgroundRemover has been disposed')
    const threshold = opts?.threshold ?? 0.5
    const feather = opts?.feather ?? 0.05
    opts?.onProgress?.({ phase: 'run' })

    const resized = bilinearResizeRgba(image, INPUT_SIZE, INPUT_SIZE)
    // rembg convention: /255, divide by the global max sample, then ImageNet mean/std.
    const input = packNchw(resized, IMAGENET_MEAN, IMAGENET_STD, {
      scale: 1 / 255,
      divideByMax: true,
    })
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
      throw new Error(`Background removal failed (${errorMessage(err)})`, { cause: err })
    }

    // d0 is the fused full-resolution saliency map; fall back to the first output.
    const outputName = session.outputNames.includes('d0') ? 'd0' : session.outputNames[0]
    const tensor = outputs[outputName]
    if (!tensor) throw new Error('Background removal failed (the model returned no output)')
    let raw: Float32Array
    try {
      raw = await tensorFloatData(tensor)
    } catch (err) {
      throw new Error(`Background removal failed (${errorMessage(err)})`, { cause: err })
    }
    const dims = tensor.dims
    const mapHeight = dims.length >= 2 ? dims[dims.length - 2] : INPUT_SIZE
    const mapWidth = dims.length >= 1 ? dims[dims.length - 1] : INPUT_SIZE
    const normalized = minMaxNormalize(raw.subarray(0, mapWidth * mapHeight))
    const matte: GrayImage = {
      width: image.width,
      height: image.height,
      data: bilinearResizePlane(normalized, mapWidth, mapHeight, image.width, image.height),
    }
    return { image: applyAlphaMatte(image, matte, threshold, feather), matte }
  }

  dispose(): void {
    releaseSession(this.session)
    this.session = null
  }
}
