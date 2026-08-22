export interface ModelSpec {
  id: 'u2netp' | 'slimsam-encoder' | 'slimsam-decoder' | 'edge-prepass' | 'cleanup'
  url: string
  approxBytes: number
  license: string
}

export const MODEL_REGISTRY: Record<ModelSpec['id'], ModelSpec> = {
  u2netp: {
    id: 'u2netp',
    // HF mirror of rembg's u2netp weights: unlike github.com release assets,
    // huggingface.co/resolve URLs send Access-Control-Allow-Origin, which
    // browser fetch() requires. (Canonical source:
    // github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx)
    url: 'https://huggingface.co/tomjackson2023/rembg/resolve/main/u2netp.onnx',
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
  'edge-prepass': {
    id: 'edge-prepass',
    // The project's own model, not a third-party one: it ships as a same-origin
    // static asset of the app (apps/web/public/models/), so the browser fetches
    // it from the very site it is served from — no CORS, no external host. This
    // default is relative; the app resolves it against its deploy base at startup
    // with overrideModelUrl(`${import.meta.env.BASE_URL}models/edge-prepass.onnx`).
    // No weights exist yet: train per docs/EDGE_PREPASS.md on scripts/dataset
    // output and drop the file in place. Until then create() fails soft (the
    // fetch 404s) and the app traces exactly as it does today.
    url: 'models/edge-prepass.onnx',
    approxBytes: 3_000_000,
    license: 'MIT',
  },
  cleanup: {
    id: 'cleanup',
    // The project's own model (see edge-prepass above for the same-origin
    // rationale): shipped as a static app asset, resolved against the deploy base
    // at startup with overrideModelUrl(`${import.meta.env.BASE_URL}models/cleanup.onnx`).
    // No weights exist yet: train per docs/CLEANUP_PREPASS.md (scripts/train
    // --task cleanup) and drop the file in place. Until then create() fails soft
    // (the fetch 404s) and the app leaves the image untouched.
    url: 'models/cleanup.onnx',
    approxBytes: 3_000_000,
    license: 'MIT',
  },
}

/** Point a model id at a different URL (self-hosted mirror, tests). Also changes its cache key. */
export function overrideModelUrl(id: ModelSpec['id'], url: string): void {
  MODEL_REGISTRY[id].url = url
}
