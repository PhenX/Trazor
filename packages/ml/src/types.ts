export type MlBackend = 'webgpu' | 'wasm'

export interface MlAvailability {
  available: boolean
  backend: MlBackend | null
  reason?: string
}

export type MlProgress =
  | { phase: 'download'; id: string; loaded: number; total: number }
  | { phase: 'compile' }
  | { phase: 'run' }

export type MlProgressFn = (p: MlProgress) => void
