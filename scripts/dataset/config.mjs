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

  targets: ['edge', 'clean', 'field'], // ground-truth heads to emit
  split: { train: 0.8, val: 0.1, test: 0.1 }, // assigned per source family
  geometric: {
    enabled: true,
    rotateDeg: 8,
    scale: 0.15,
    translateFrac: 0.05,
    perspective: 0.12, // max corner-jitter fraction for the projective warp (0 = off)
    perspectiveProb: 0.4, // chance a sample gets the projective warp
    lens: 0.12, // max |k| radial (barrel/pincushion) lens distortion (0 = off)
    lensProb: 0.35, // chance a sample gets lens distortion
    crop: true, // multi-scale: render larger and crop a native-size window
    cropProb: 0.3, // chance a sample is a multi-scale crop
    cropZoom: { min: 1.5, max: 3 }, // how much larger to render before cropping
  },
  degrade: {
    background: true, // composite the shape over a procedural background
    matteProb: 0.3, // chance of a matting-halo rim on the input (imperfect-cutout artifact)
    matteStrengthMax: 0.8, // max rim alpha fraction
    blurSigmaMax: 2, // max gaussian blur sigma
    blurAnisoProb: 0.5, // chance a blur uses a different vertical sigma (directional)
    ringingProb: 0.2, // chance of windowed-sinc ringing (edge overshoot; 0 = off)
    ringingRadius: 3, // sinc kernel radius
    resampleMinScale: 0.5, // down-then-up resampling floor (1 = disabled)
    noiseStdMax: 18, // gaussian read-noise sigma on the 0..255 scale
    poissonProb: 0.4, // chance of intensity-dependent shot noise (0 = off)
    poissonStrengthMax: 1.5, // shot-noise scale (sigma = strength * sqrt(value))
    jpeg: true,
    jpegQuality: { min: 20, max: 95 },
    doubleJpegProb: 0.25, // chance of a second JPEG re-encode (0 = off)
    posterizeLevels: 0, // >0 quantizes each channel to N levels (hard bands)
    dither: true, // Floyd–Steinberg palette reduction (GIF-style)
    ditherProb: 0.2,
    ditherLevels: { min: 3, max: 6 }, // per-channel levels when dithering
    tone: true, // gamma + brightness/contrast drift
    toneProb: 0.5,
    gammaMin: 0.7,
    gammaMax: 1.4,
    brightnessMax: 0.12, // ± brightness offset in [0,1] units
    contrastMax: 0.3, // ± contrast about mid-gray
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
      case 'no-tone':
        cfg.degrade.tone = false
        break
      case 'no-dither':
        cfg.degrade.dither = false
        break
      case 'no-poisson':
        cfg.degrade.poissonProb = 0
        break
      case 'no-matte':
        cfg.degrade.matteProb = 0
        break
      case 'no-ringing':
        cfg.degrade.ringingProb = 0
        break
      case 'no-double-jpeg':
        cfg.degrade.doubleJpegProb = 0
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
  --targets <a,b,c>          ground-truth heads: edge,clean,field (default all three)
  --no-geometric             disable rotate/scale/translate augmentation
  --no-jpeg                  disable JPEG degradation
  --no-background            render on white instead of a procedural background
  --no-tone                  disable gamma / brightness / contrast drift
  --no-dither                disable Floyd–Steinberg palette reduction
  --no-poisson               disable intensity-dependent shot noise
  --no-double-jpeg           never re-encode JPEG a second time
  --no-matte                 disable the matting-halo rim on inputs
  --no-ringing               disable windowed-sinc edge ringing
  --help                     show this message
`
