// Dataset generation config: defaults, CLI parsing, and usage text. All
// randomness is seeded from `seed`, so a config fully determines the dataset.

export const DEFAULTS = {
  source: 'procedural', // 'procedural' | 'dir'
  corpus: '', // directory of .svg files when source === 'dir'
  out: 'dataset-out', // output root
  count: 64, // samples to generate (procedural) or cap for 'dir' (0 = all)
  resolution: 256, // square output tile size, px
  supersample: 2, // render scale before area-downsample, for anti-aliasing
  seed: 1,
  jobs: 0, // parallel worker threads; 0 = auto (CPU count), 1 = single-thread

  targets: ['edge', 'clean'], // ground-truth heads to emit
  split: { train: 0.8, val: 0.1, test: 0.1 }, // assigned per source family
  geometric: { enabled: true, rotateDeg: 8, scale: 0.15, translateFrac: 0.05 },
  degrade: {
    background: true, // composite the shape over a procedural background
    blurSigmaMax: 1.5,
    resampleMinScale: 0.5, // down-then-up resampling floor (1 = disabled)
    noiseStdMax: 12, // gaussian noise sigma on the 0..255 scale
    jpeg: true,
    jpegQuality: { min: 30, max: 95 },
    posterizeLevels: 0, // >0 quantizes each channel to N levels
  },
}

export function parseArgs(argv) {
  const cfg = structuredClone(DEFAULTS)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    switch (key) {
      case 'source':
        cfg.source = next
        i++
        break
      case 'corpus':
        cfg.corpus = next
        i++
        break
      case 'out':
        cfg.out = next
        i++
        break
      case 'count':
        cfg.count = Number(next)
        i++
        break
      case 'resolution':
        cfg.resolution = Number(next)
        i++
        break
      case 'supersample':
        cfg.supersample = Number(next)
        i++
        break
      case 'seed':
        cfg.seed = Number(next)
        i++
        break
      case 'jobs':
        cfg.jobs = Number(next)
        i++
        break
      case 'targets':
        cfg.targets = next.split(',').map((t) => t.trim())
        i++
        break
      case 'no-geometric':
        cfg.geometric.enabled = false
        break
      case 'no-jpeg':
        cfg.degrade.jpeg = false
        break
      case 'no-background':
        cfg.degrade.background = false
        break
      case 'help':
        cfg.help = true
        break
      default:
        throw new Error(`unknown flag --${key}`)
    }
  }
  if (cfg.source !== 'procedural' && cfg.source !== 'dir') {
    throw new Error(`--source must be 'procedural' or 'dir', got '${cfg.source}'`)
  }
  return cfg
}

export const USAGE = `dataset generator — SVG corpus → rasterize → degrade → aligned pairs

Usage: npm run dataset -- [options]

  --source <procedural|dir>  sample source (default procedural)
  --corpus <dir>             directory of .svg files (required for source=dir)
  --out <dir>                output root (default dataset-out)
  --count <n>                samples to generate, or cap for dir (default 64)
  --resolution <px>          square tile size (default 256)
  --supersample <n>          anti-aliasing render scale (default 2)
  --seed <n>                 base seed (default 1)
  --jobs <n>                 parallel worker threads (default: CPU count; 1 = single-thread)
  --targets <a,b>            ground-truth heads: edge,clean (default edge,clean)
  --no-geometric             disable rotate/scale/translate augmentation
  --no-jpeg                  disable JPEG degradation
  --no-background            render on white instead of a procedural background
  --help                     show this message
`
