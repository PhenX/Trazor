import { mulberry32 } from '@vectorizer/core'
import type { RasterImage } from '@vectorizer/core'
import { create2dCanvas } from './decode'

export interface SampleDef {
  id: 'badge' | 'portrait' | 'sprite' | 'peaks' | 'ink' | 'bloom'
  label: string
  tagline: string
  make(): Promise<RasterImage> | RasterImage
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function starPath(ctx: Ctx2D, cx: number, cy: number, outer: number, inner: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Flat, saturated vector-style badge — ideal for the logo/cutout profiles. */
function makeBadge(): RasterImage {
  const size = 640
  const { ctx } = create2dCanvas(size, size)
  const cx = size / 2
  const cy = size / 2

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  // Outer ring
  ctx.fillStyle = '#23408e'
  ctx.beginPath()
  ctx.arc(cx, cy, 292, 0, Math.PI * 2)
  ctx.fill()

  // Two-tone rays inside the ring
  const rayColors = ['#f78c1f', '#ffc84a']
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = rayColors[i % 2]
    const a0 = (i * Math.PI) / 8
    const a1 = ((i + 1) * Math.PI) / 8
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, 268, a0, a1)
    ctx.closePath()
    ctx.fill()
  }

  // Inner disc + accent ring
  ctx.fillStyle = '#e23b4e'
  ctx.beginPath()
  ctx.arc(cx, cy, 176, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0f9d8f'
  ctx.beginPath()
  ctx.arc(cx, cy, 150, 0, Math.PI * 2)
  ctx.fill()

  // Star
  starPath(ctx, cx, cy - 8, 108, 44)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  starPath(ctx, cx, cy - 8, 70, 28)
  ctx.fillStyle = '#ffc84a'
  ctx.fill()

  // Banner
  ctx.fillStyle = '#23408e'
  ctx.beginPath()
  ctx.roundRect(cx - 190, 452, 380, 74, 37)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(cx - 40 + i * 40, 489, 11, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f78c1f'
  ctx.beginPath()
  ctx.roundRect(cx - 168, 481, 84, 16, 8)
  ctx.fill()

  return ctx.getImageData(0, 0, size, size)
}

/** Soft, photo-like scene (gradients + noise) — exercises the photo profile. */
function makePortrait(): RasterImage {
  const size = 640
  const { ctx } = create2dCanvas(size, size)

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, size)
  sky.addColorStop(0, '#20326e')
  sky.addColorStop(0.45, '#b45a83')
  sky.addColorStop(0.68, '#f0996a')
  sky.addColorStop(0.8, '#f7c877')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, size, size)

  // Sun glow + disc
  const glow = ctx.createRadialGradient(410, 330, 10, 410, 330, 200)
  glow.addColorStop(0, 'rgba(255, 240, 200, 0.95)')
  glow.addColorStop(0.35, 'rgba(255, 200, 120, 0.55)')
  glow.addColorStop(1, 'rgba(255, 200, 120, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)
  const sun = ctx.createRadialGradient(410, 330, 6, 410, 330, 64)
  sun.addColorStop(0, '#fff6d8')
  sun.addColorStop(1, '#ffce7a')
  ctx.fillStyle = sun
  ctx.beginPath()
  ctx.arc(410, 330, 64, 0, Math.PI * 2)
  ctx.fill()

  // Haze band at the horizon
  const haze = ctx.createLinearGradient(0, 330, 0, 430)
  haze.addColorStop(0, 'rgba(247, 200, 119, 0)')
  haze.addColorStop(1, 'rgba(247, 200, 119, 0.5)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 330, size, 100)

  // Hills, back to front
  const hills: Array<{ top: string; bottom: string; y: number; wobble: number }> = [
    { top: '#7c4a72', bottom: '#5d3a62', y: 420, wobble: 36 },
    { top: '#4a3260', bottom: '#33254a', y: 480, wobble: 52 },
    { top: '#241d38', bottom: '#171227', y: 552, wobble: 40 },
  ]
  for (const hill of hills) {
    const grad = ctx.createLinearGradient(0, hill.y - hill.wobble, 0, size)
    grad.addColorStop(0, hill.top)
    grad.addColorStop(1, hill.bottom)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(0, size)
    ctx.lineTo(0, hill.y)
    ctx.bezierCurveTo(
      size * 0.22,
      hill.y - hill.wobble,
      size * 0.34,
      hill.y + hill.wobble * 0.6,
      size * 0.52,
      hill.y - hill.wobble * 0.2,
    )
    ctx.bezierCurveTo(
      size * 0.7,
      hill.y - hill.wobble,
      size * 0.85,
      hill.y + hill.wobble * 0.4,
      size,
      hill.y - hill.wobble * 0.5,
    )
    ctx.lineTo(size, size)
    ctx.closePath()
    ctx.fill()
  }

  // Subtle sensor-like noise (deterministic)
  const image = ctx.getImageData(0, 0, size, size)
  const rand = mulberry32(0xc0ffee)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 10
    data[i] += n
    data[i + 1] += n
    data[i + 2] += n
  }
  return image
}

const SPRITE_ROWS = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...##..............##...',
  '.....##..........##.....',
  '...##################...',
  '...##################...',
  '.####..##########..####.',
  '.####..##########..####.',
  '########################',
  '########################',
  '##..################..##',
  '##..################..##',
  '##..##............##..##',
  '##..##............##..##',
  '......####....####......',
  '......####....####......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
] as const

/** Genuine 24×24 pixel-art invader, drawn pixel by pixel. Not upscaled. */
function makeSprite(): RasterImage {
  const size = 24
  const { ctx } = create2dCanvas(size, size)
  // Background stays fully transparent — exercises alpha handling + pixel mode.
  for (let y = 0; y < size; y++) {
    const row = SPRITE_ROWS[y]
    for (let x = 0; x < size; x++) {
      if (row[x] !== '#') continue
      // Two exact colors: body green, darker green feet.
      ctx.fillStyle = y >= 16 ? '#1c8f45' : '#3ddc68'
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return ctx.getImageData(0, 0, size, size)
}

/** Draw a solid silhouette from a baseline up over a ridge of [x, y] points. */
function ridge(ctx: Ctx2D, base: number, pts: ReadonlyArray<readonly [number, number]>): void {
  const w = ctx.canvas.width
  ctx.beginPath()
  ctx.moveTo(0, base)
  for (const [x, y] of pts) ctx.lineTo(x, y)
  ctx.lineTo(w, base)
  ctx.lineTo(w, w)
  ctx.lineTo(0, w)
  ctx.closePath()
  ctx.fill()
}

/** Flat, poster-style landscape — bold solid colors, no gradients or noise. */
function makePeaks(): RasterImage {
  const size = 640
  const { ctx } = create2dCanvas(size, size)

  // Two flat sky bands (deliberately no gradient — this stays crisp as vectors).
  ctx.fillStyle = '#ffd27a'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#ffb066'
  ctx.fillRect(0, 300, size, size - 300)

  // Flat sun disc.
  ctx.fillStyle = '#fff4dc'
  ctx.beginPath()
  ctx.arc(320, 236, 96, 0, Math.PI * 2)
  ctx.fill()

  // Mountain ranges, back to front — each a single solid tone.
  ctx.fillStyle = '#e8825c'
  ridge(ctx, 372, [
    [0, 330],
    [150, 250],
    [286, 360],
    [420, 250],
    [560, 356],
    [640, 300],
  ])
  ctx.fillStyle = '#c85f4e'
  ridge(ctx, 470, [
    [0, 452],
    [120, 392],
    [268, 470],
    [408, 372],
    [548, 468],
    [640, 424],
  ])
  ctx.fillStyle = '#7a4a63'
  ridge(ctx, 540, [
    [0, 520],
    [180, 470],
    [360, 540],
    [520, 476],
    [640, 528],
  ])

  // Foreground water.
  ctx.fillStyle = '#2f3b57'
  ctx.fillRect(0, 556, size, size - 556)
  // Sun reflection stripes on the water.
  ctx.fillStyle = '#3f5170'
  for (let i = 0; i < 4; i++) {
    const w = 150 - i * 26
    ctx.fillRect(320 - w / 2, 574 + i * 18, w, 8)
  }

  return ctx.getImageData(0, 0, size, size)
}

/** Bold single-ink scene — high-contrast black on white for B&W / stencil tracing. */
function makeInk(): RasterImage {
  const size = 640
  const { ctx } = create2dCanvas(size, size)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#000000'

  // Ink sun disc.
  ctx.beginPath()
  ctx.arc(414, 196, 92, 0, Math.PI * 2)
  ctx.fill()

  // Solid mountain silhouette.
  ridge(ctx, 460, [
    [0, 452],
    [128, 372],
    [244, 470],
    [360, 300],
    [470, 430],
    [548, 356],
    [640, 452],
  ])

  // A small flock — each bird a soft double stroke.
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  const birds: ReadonlyArray<readonly [number, number, number]> = [
    [150, 150, 1],
    [212, 178, 0.82],
    [252, 138, 0.7],
  ]
  for (const [bx, by, s] of birds) {
    const wing = 22 * s
    ctx.beginPath()
    ctx.moveTo(bx - wing, by)
    ctx.quadraticCurveTo(bx - wing * 0.3, by - wing * 0.7, bx, by)
    ctx.quadraticCurveTo(bx + wing * 0.3, by - wing * 0.7, bx + wing, by)
    ctx.stroke()
  }

  return ctx.getImageData(0, 0, size, size)
}

/** Draw one ring of `count` almond petals radiating from a center. */
function petalRing(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  count: number,
  r0: number,
  r1: number,
  width: number,
  color: string,
  phase = 0,
): void {
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const px = -dy * width
    const py = dx * width
    const b: [number, number] = [cx + dx * r0, cy + dy * r0]
    const tip: [number, number] = [cx + dx * r1, cy + dy * r1]
    const m: [number, number] = [cx + dx * (r0 + r1) * 0.5, cy + dy * (r0 + r1) * 0.5]
    ctx.beginPath()
    ctx.moveTo(b[0], b[1])
    ctx.quadraticCurveTo(m[0] + px, m[1] + py, tip[0], tip[1])
    ctx.quadraticCurveTo(m[0] - px, m[1] - py, b[0], b[1])
    ctx.closePath()
    ctx.fill()
  }
}

/** Symmetric flat mandala — several solid colors, clean geometry for illustration tracing. */
function makeBloom(): RasterImage {
  const size = 640
  const { ctx } = create2dCanvas(size, size)
  const cx = size / 2
  const cy = size / 2

  ctx.fillStyle = '#fbf6ec'
  ctx.fillRect(0, 0, size, size)

  petalRing(ctx, cx, cy, 12, 96, 288, 40, '#e76f51')
  petalRing(ctx, cx, cy, 12, 84, 230, 46, '#f4a261', Math.PI / 12)
  petalRing(ctx, cx, cy, 10, 64, 176, 42, '#2a9d8f')
  petalRing(ctx, cx, cy, 10, 48, 128, 34, '#8ab17d', Math.PI / 10)

  // Layered center.
  const discs: ReadonlyArray<readonly [number, string]> = [
    [84, '#e9c46a'],
    [56, '#264653'],
    [30, '#e76f51'],
  ]
  for (const [r, color] of discs) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return ctx.getImageData(0, 0, size, size)
}

export const SAMPLES: readonly SampleDef[] = [
  {
    id: 'badge',
    label: 'Badge',
    tagline: 'Flat logo · 640×640',
    make: makeBadge,
  },
  {
    id: 'portrait',
    label: 'Sunset',
    tagline: 'Photo-like · 640×640',
    make: makePortrait,
  },
  {
    id: 'sprite',
    label: 'Sprite',
    tagline: 'Pixel art · 24×24',
    make: makeSprite,
  },
  {
    id: 'peaks',
    label: 'Peaks',
    tagline: 'Flat color · 640×640',
    make: makePeaks,
  },
  {
    id: 'ink',
    label: 'Ink',
    tagline: 'Black & white · 640×640',
    make: makeInk,
  },
  {
    id: 'bloom',
    label: 'Bloom',
    tagline: 'Illustration · 640×640',
    make: makeBloom,
  },
]

export function getSample(id: string): SampleDef | undefined {
  return SAMPLES.find((s) => s.id === id)
}
