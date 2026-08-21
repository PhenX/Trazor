import type { BinaryMask, RasterImage } from '@vectorizer/core'
import type { InferenceSession, Tensor } from 'onnxruntime-web'
import { errorMessage } from './errors'
import {
  argmax,
  bilinearResizePlane,
  bilinearResizeRgba,
  computeLetterbox,
  cropPlane,
  mapPointToLetterbox,
  packNchw,
  planeToMask,
  SAM_MEAN,
  SAM_STD,
} from './imageops'
import type { Letterbox } from './imageops'
import type { OrtModule } from './ort'
import { MODEL_REGISTRY } from './registry'
import { releaseSession, tensorFloatData } from './session-util'
import { ModelStore } from './store'
import type { MlProgressFn } from './types'

const IMAGE_SIZE = 1024
const MASK_INPUT_SIZE = 256
const DTYPE_ERROR = /int ?64|tensor|data ?type|type mismatch|invalid input/i

interface EncodedImage {
  outputs: InferenceSession.ReturnType
  letterbox: Letterbox
  width: number
  height: number
}

/** SlimSAM click-to-segment: encode once per image, decode per point prompt. */
export class MagicSegmenter {
  private readonly ort: OrtModule
  private encoder: InferenceSession | null
  private decoder: InferenceSession | null
  private encoded: EncodedImage | null = null

  private constructor(ort: OrtModule, encoder: InferenceSession, decoder: InferenceSession) {
    this.ort = ort
    this.encoder = encoder
    this.decoder = decoder
  }

  static async create(onProgress?: MlProgressFn): Promise<MagicSegmenter> {
    const store = new ModelStore()
    const encoderBytes = await store.fetch(MODEL_REGISTRY['slimsam-encoder'], onProgress)
    const decoderBytes = await store.fetch(MODEL_REGISTRY['slimsam-decoder'], onProgress)
    const { createModelSession } = await import('./ort')
    const encoder = await createModelSession(encoderBytes, 'segmentation model', onProgress)
    const decoder = await createModelSession(decoderBytes, 'segmentation model', onProgress)
    return new MagicSegmenter(encoder.ort, encoder.session, decoder.session)
  }

  async setImage(image: RasterImage, onProgress?: MlProgressFn): Promise<void> {
    const encoder = this.encoder
    if (!encoder) throw new Error('MagicSegmenter has been disposed')
    const letterbox = computeLetterbox(image.width, image.height, IMAGE_SIZE)
    const resized = bilinearResizeRgba(image, letterbox.resizedWidth, letterbox.resizedHeight)
    const input = packNchw(resized, SAM_MEAN, SAM_STD, {
      targetWidth: IMAGE_SIZE,
      targetHeight: IMAGE_SIZE,
    })
    const feeds: InferenceSession.FeedsType = {
      [encoder.inputNames[0]]: new this.ort.Tensor('float32', input, [
        1,
        3,
        IMAGE_SIZE,
        IMAGE_SIZE,
      ]),
    }
    onProgress?.({ phase: 'run' })
    this.encoded = null
    let outputs: InferenceSession.ReturnType
    try {
      outputs = await encoder.run(feeds)
    } catch (err) {
      throw new Error(`Segmentation failed (${errorMessage(err)})`, { cause: err })
    }
    this.encoded = { outputs, letterbox, width: image.width, height: image.height }
  }

  async segment(
    points: ReadonlyArray<{ x: number; y: number; label: 0 | 1 }>,
  ): Promise<{ mask: BinaryMask; score: number }> {
    const decoder = this.decoder
    if (!decoder) throw new Error('MagicSegmenter has been disposed')
    const encoded = this.encoded
    if (!encoded) throw new Error('Call setImage() before segment()')
    if (points.length === 0) throw new Error('Segmentation needs at least one point')

    const { feeds, labelsName, labelsDims } = this.buildDecoderFeeds(decoder, encoded, points)
    const labelValues = points.map((p) => p.label)
    let outputs: InferenceSession.ReturnType
    try {
      if (labelsName) {
        const int64 = BigInt64Array.from(labelValues, (v) => BigInt(v))
        feeds[labelsName] = new this.ort.Tensor('int64', int64, labelsDims)
      }
      outputs = await decoder.run(feeds)
    } catch (firstError) {
      // Some builds/exports reject int64 feeds — retry once with float32 labels.
      if (!labelsName || !DTYPE_ERROR.test(errorMessage(firstError))) {
        throw new Error(`Segmentation failed (${errorMessage(firstError)})`, { cause: firstError })
      }
      try {
        feeds[labelsName] = new this.ort.Tensor(
          'float32',
          Float32Array.from(labelValues),
          labelsDims,
        )
        outputs = await decoder.run(feeds)
      } catch {
        throw new Error(`Segmentation failed (${errorMessage(firstError)})`, { cause: firstError })
      }
    }
    try {
      return await this.decodeMask(decoder, encoded, outputs)
    } catch (err) {
      throw new Error(`Segmentation failed (${errorMessage(err)})`, { cause: err })
    }
  }

  dispose(): void {
    releaseSession(this.encoder)
    releaseSession(this.decoder)
    this.encoder = null
    this.decoder = null
    this.encoded = null
  }

  /** Wire decoder inputs by introspected name; labels are attached later (dtype retry). */
  private buildDecoderFeeds(
    decoder: InferenceSession,
    encoded: EncodedImage,
    points: ReadonlyArray<{ x: number; y: number; label: 0 | 1 }>,
  ): { feeds: Record<string, Tensor>; labelsName: string | null; labelsDims: number[] } {
    const n = points.length
    const coords = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const p = mapPointToLetterbox(points[i].x, points[i].y, encoded.letterbox)
      coords[i * 2] = p.x
      coords[i * 2 + 1] = p.y
    }
    const feeds: Record<string, Tensor> = {}
    let labelsName: string | null = null
    let labelsDims: number[] = [1, 1, n]
    for (const name of decoder.inputNames) {
      // Order matters: several names contain shorter ones as substrings.
      if (name.includes('image_positional_embeddings')) {
        feeds[name] = this.encoderOutput(encoded, name)
      } else if (name.includes('image_embeddings')) {
        feeds[name] = this.encoderOutput(encoded, name)
      } else if (name.includes('input_points')) {
        feeds[name] = new this.ort.Tensor('float32', coords, [1, 1, n, 2])
      } else if (name.includes('point_coords')) {
        feeds[name] = new this.ort.Tensor('float32', coords, [1, n, 2])
      } else if (name.includes('input_labels')) {
        labelsName = name
        labelsDims = [1, 1, n]
      } else if (name.includes('point_labels')) {
        labelsName = name
        labelsDims = [1, n]
      } else if (name.includes('has_mask_input')) {
        feeds[name] = new this.ort.Tensor('float32', new Float32Array(1), [1])
      } else if (name.includes('mask_input')) {
        const zeros = new Float32Array(MASK_INPUT_SIZE * MASK_INPUT_SIZE)
        feeds[name] = new this.ort.Tensor('float32', zeros, [
          1,
          1,
          MASK_INPUT_SIZE,
          MASK_INPUT_SIZE,
        ])
      } else if (name.includes('orig_im_size')) {
        const size = Float32Array.from([encoded.height, encoded.width])
        feeds[name] = new this.ort.Tensor('float32', size, [2])
      } else {
        throw new Error(`This segmentation model needs an unsupported input ("${name}")`)
      }
    }
    return { feeds, labelsName, labelsDims }
  }

  /** Find the encoder output feeding decoder input `name` (exact, then substring match). */
  private encoderOutput(encoded: EncodedImage, name: string): Tensor {
    const outputs = encoded.outputs
    if (outputs[name]) return outputs[name]
    for (const key of Object.keys(outputs)) {
      if (key.includes(name) || name.includes(key)) return outputs[key]
    }
    throw new Error(
      `This segmentation model requires "${name}" from its encoder, ` +
        'but the encoder did not produce it — the model files are mismatched',
    )
  }

  private async decodeMask(
    decoder: InferenceSession,
    encoded: EncodedImage,
    outputs: InferenceSession.ReturnType,
  ): Promise<{ mask: BinaryMask; score: number }> {
    const names = decoder.outputNames
    const maskName =
      names.find((n) => n === 'pred_masks') ??
      names.find((n) => n.includes('mask') && outputs[n]?.dims.length >= 4) ??
      names.find((n) => outputs[n]?.dims.length >= 4)
    const maskTensor = maskName ? outputs[maskName] : undefined
    if (!maskTensor) throw new Error('the model returned no mask output')
    const dims = maskTensor.dims
    if (dims.length < 3) throw new Error('unexpected mask output shape')
    const channels = dims[dims.length - 3]
    const maskHeight = dims[dims.length - 2]
    const maskWidth = dims[dims.length - 1]
    const maskData = await tensorFloatData(maskTensor)

    let channel = 0
    let score = 0
    const iouName = names.find((n) => n !== maskName && (n.includes('iou') || n.includes('score')))
    const iouTensor = iouName ? outputs[iouName] : undefined
    if (iouTensor) {
      const iou = await tensorFloatData(iouTensor)
      const scores = iou.subarray(0, Math.min(iou.length, channels))
      const best = argmax(scores)
      if (best >= 0) {
        channel = best
        score = scores[best]
      }
    }

    const { letterbox, width, height } = encoded
    const planeSize = maskWidth * maskHeight
    const plane = maskData.subarray(channel * planeSize, (channel + 1) * planeSize)
    const upsampled = bilinearResizePlane(
      plane,
      maskWidth,
      maskHeight,
      letterbox.targetSize,
      letterbox.targetSize,
    )
    const content = cropPlane(
      upsampled,
      letterbox.targetSize,
      0,
      0,
      letterbox.resizedWidth,
      letterbox.resizedHeight,
    )
    const full = bilinearResizePlane(
      content,
      letterbox.resizedWidth,
      letterbox.resizedHeight,
      width,
      height,
    )
    // pred_masks holds logits: > 0 means foreground.
    return { mask: planeToMask(full, width, height, 0), score }
  }
}
