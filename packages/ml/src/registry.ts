export interface ModelSpec {
  id: 'u2netp' | 'slimsam-encoder' | 'slimsam-decoder'
  url: string
  approxBytes: number
  license: string
}

export const MODEL_REGISTRY: Record<ModelSpec['id'], ModelSpec> = {
  u2netp: {
    id: 'u2netp',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    approxBytes: 4_600_000,
    license: 'Apache-2.0',
  },
  'slimsam-encoder': {
    id: 'slimsam-encoder',
    url: 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder_quantized.onnx',
    approxBytes: 5_600_000,
    license: 'Apache-2.0',
  },
  'slimsam-decoder': {
    id: 'slimsam-decoder',
    url: 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder_quantized.onnx',
    approxBytes: 4_200_000,
    license: 'Apache-2.0',
  },
}

/** Point a model id at a different URL (self-hosted mirror, tests). Also changes its cache key. */
export function overrideModelUrl(id: ModelSpec['id'], url: string): void {
  MODEL_REGISTRY[id].url = url
}
