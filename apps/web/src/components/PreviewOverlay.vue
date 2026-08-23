<script setup lang="ts">
import type { PathCommand } from '@trazor/core'
import type { SvgGeometry } from '@trazor/svg'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SHAPE_KIND_TOKEN } from '../lib/overlay'

/**
 * Inspection overlay: draws the traced SVG's path outlines, on-curve anchor
 * points (small `x`) and Bézier control handles on a canvas above the preview,
 * so the density and shape of the geometry is visible at a glance. Each element
 * kind is tinted with its own color (traced paths vs. rect/circle/ellipse
 * primitives), so simplified shapes stand out. Purely a read-out — it never
 * captures pointer events.
 *
 * The scene is parsed into per-kind buckets of document-space geometry once,
 * when the geometry changes, and reused across every pan/zoom. Outlines are
 * cached as `Path2D` and stroked under the canvas transform (never rebuilt);
 * anchor marks and handles keep a constant on-screen size, so each frame maps
 * their cached coordinates to screen space. Points are in viewBox units
 * (== document px); the document is placed at `translate(tx, ty) scale(scale)`,
 * so a point maps to screen as `tx + x * scale`, `ty + y * scale`.
 */

const props = defineProps<{
  geometry: SvgGeometry | null
  scale: number
  tx: number
  ty: number
  docW: number
  docH: number
  /** Left screen edge to clip drawing from (split view); null ⇒ no clip. */
  clipX: number | null
  dark: boolean
}>()

// Constant on-screen sizing (CSS px).
const NODE_HALF = 3
const NODE_WIDTH = 1.25
const OUTLINE_WIDTH = 1
const HANDLE_WIDTH = 1
const CONTROL_RADIUS = 1.6
// Above these totals the overlay declutters: handles drop out first, then
// anchor marks, leaving the outlines that still convey overall complexity.
const HANDLE_LIMIT = 4000
const NODE_LIMIT = 60000

const canvas = ref<HTMLCanvasElement | null>(null)
let observer: ResizeObserver | null = null
let raf = 0

/**
 * Everything drawn for one element kind, in document (viewBox) coordinates, so
 * it survives pan and zoom. Outlines are stroked under the canvas transform;
 * anchor/handle coordinates are flat `[x, y, …]` runs mapped to screen space
 * each frame (they keep a constant on-screen size, so they can't be baked into
 * the transform). `handleLines` holds `[ax, ay, bx, by, …]` segments.
 */
interface Bucket {
  token: string
  outline: Path2D
  anchors: number[]
  handleLines: number[]
  dots: number[]
}

// Document-space scene, rebuilt only when the geometry changes — pan/zoom reuse
// it. The anchor/control totals drive the declutter thresholds; the viewBox
// size folds into the screen scale.
let scene: Bucket[] = []
let nodeCount = 0
let controlCount = 0
let sceneW: number | null = null
let sceneH: number | null = null

// Token → resolved color, cached across frames (getComputedStyle forces a style
// flush, so it must stay out of the draw loop). Re-resolved when the theme flips.
let resolvedColors: Map<string, string> | null = null
let resolvedDark = false

/** Rebuild the cached document-space scene from freshly parsed geometry. */
function buildScene(geo: SvgGeometry | null): void {
  scene = []
  nodeCount = 0
  controlCount = 0
  sceneW = geo?.width ?? null
  sceneH = geo?.height ?? null
  resolvedColors = null
  if (!geo || geo.shapes.length === 0) return

  const byToken = new Map<string, Bucket>()
  const bucketFor = (token: string): Bucket => {
    let b = byToken.get(token)
    if (b === undefined) {
      b = { token, outline: new Path2D(), anchors: [], handleLines: [], dots: [] }
      byToken.set(token, b)
    }
    return b
  }

  // Outlines (always drawn) plus the anchor/control tallies.
  for (const shape of geo.shapes) {
    appendOutline(bucketFor(SHAPE_KIND_TOKEN[shape.kind]).outline, shape.commands)
    for (const cmd of shape.commands) {
      if (cmd.type === 'Z') continue
      nodeCount++
      if (cmd.type === 'Q') controlCount += 1
      else if (cmd.type === 'C') controlCount += 2
    }
  }
  scene = [...byToken.values()]

  // Anchor marks and Bézier handles — only precomputed for what the declutter
  // limits will actually draw, so huge traces don't build arrays nobody sees.
  const withNodes = nodeCount <= NODE_LIMIT
  const withHandles = withNodes && controlCount > 0 && controlCount <= HANDLE_LIMIT
  if (!withNodes && !withHandles) return

  for (const shape of geo.shapes) {
    const b = bucketFor(SHAPE_KIND_TOKEN[shape.kind])
    let cx = 0
    let cy = 0
    for (const cmd of shape.commands) {
      switch (cmd.type) {
        case 'M':
        case 'L':
          if (withNodes) b.anchors.push(cmd.x, cmd.y)
          cx = cmd.x
          cy = cmd.y
          break
        case 'Q':
          if (withHandles) {
            b.handleLines.push(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, cmd.x1, cmd.y1)
            b.dots.push(cmd.x1, cmd.y1)
          }
          if (withNodes) b.anchors.push(cmd.x, cmd.y)
          cx = cmd.x
          cy = cmd.y
          break
        case 'C':
          if (withHandles) {
            b.handleLines.push(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, cmd.x2, cmd.y2)
            b.dots.push(cmd.x1, cmd.y1, cmd.x2, cmd.y2)
          }
          if (withNodes) b.anchors.push(cmd.x, cmd.y)
          cx = cmd.x
          cy = cmd.y
          break
        case 'Z':
          break
      }
    }
  }
}

/** Append a shape's outline to `path` in document coordinates. */
function appendOutline(path: Path2D, commands: readonly PathCommand[]): void {
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        path.moveTo(cmd.x, cmd.y)
        break
      case 'L':
        path.lineTo(cmd.x, cmd.y)
        break
      case 'Q':
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y)
        break
      case 'C':
        path.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
        break
      case 'Z':
        path.closePath()
        break
    }
  }
}

function schedule(): void {
  if (raf !== 0) return
  raf = requestAnimationFrame(() => {
    raf = 0
    draw()
  })
}

function draw(): void {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const bw = Math.max(1, Math.round(el.clientWidth * dpr))
  const bh = Math.max(1, Math.round(el.clientHeight * dpr))
  if (el.width !== bw) el.width = bw
  if (el.height !== bh) el.height = bh
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, bw, bh)

  if (scene.length === 0) return

  // Resolve each kind's token color once per theme; getComputedStyle is costly.
  if (!resolvedColors || resolvedDark !== props.dark) {
    const styles = getComputedStyle(el)
    const colors = new Map<string, string>()
    for (const b of scene) {
      if (!colors.has(b.token)) {
        colors.set(b.token, styles.getPropertyValue(b.token).trim() || '#6c7bff')
      }
    }
    resolvedColors = colors
    resolvedDark = props.dark
  }
  const colorOf = (token: string): string => resolvedColors?.get(token) ?? '#6c7bff'

  // Hoisted out of the hot loops — reactive prop reads per point are not free.
  const tx = props.tx
  const ty = props.ty
  // viewBox → document px (usually 1:1) folded into the screen scale.
  const sx = props.scale * (props.docW > 0 ? props.docW / (sceneW || props.docW) : 1)
  const sy = props.scale * (props.docH > 0 ? props.docH / (sceneH || props.docH) : 1)

  // Clip to the SVG side of a split. Set in device space so it holds across the
  // world/screen transform switches below.
  const clipX = props.clipX
  if (clipX !== null) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(clipX * dpr, 0, Math.max(0, bw - clipX * dpr), bh)
    ctx.clip()
  }

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Outlines (bottom layer): cached document-space paths stroked under the
  // pan/zoom transform, so they are never rebuilt on pan or zoom. The line width
  // is pre-divided by the scale to stay a constant OUTLINE_WIDTH on screen.
  ctx.setTransform(sx * dpr, 0, 0, sy * dpr, tx * dpr, ty * dpr)
  ctx.globalAlpha = 0.85
  ctx.lineWidth = OUTLINE_WIDTH / (sx || 1)
  for (const b of scene) {
    ctx.strokeStyle = colorOf(b.token)
    ctx.stroke(b.outline)
  }

  // Marks and handles keep a constant on-screen size, so they are placed in
  // screen space each frame from the cached document-space coordinates.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const showNodes = nodeCount <= NODE_LIMIT
  const showHandles = showNodes && controlCount > 0 && controlCount <= HANDLE_LIMIT

  // Bézier handles: lines to each control point, then a small square on it.
  if (showHandles) {
    const side = CONTROL_RADIUS * 2
    for (const b of scene) {
      const color = colorOf(b.token)
      const lines = new Path2D()
      const hl = b.handleLines
      for (let i = 0; i < hl.length; i += 4) {
        lines.moveTo(tx + hl[i] * sx, ty + hl[i + 1] * sy)
        lines.lineTo(tx + hl[i + 2] * sx, ty + hl[i + 3] * sy)
      }
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.4
      ctx.lineWidth = HANDLE_WIDTH
      ctx.stroke(lines)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.6
      const dots = b.dots
      for (let i = 0; i < dots.length; i += 2) {
        ctx.fillRect(
          tx + dots[i] * sx - CONTROL_RADIUS,
          ty + dots[i + 1] * sy - CONTROL_RADIUS,
          side,
          side,
        )
      }
    }
  }

  // Anchor marks — small crosses on top, haloed so they read over any fill.
  if (showNodes) {
    const halo = props.dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)'
    for (const b of scene) {
      const marks = new Path2D()
      const a = b.anchors
      for (let i = 0; i < a.length; i += 2) {
        const x = tx + a[i] * sx
        const y = ty + a[i + 1] * sy
        marks.moveTo(x - NODE_HALF, y - NODE_HALF)
        marks.lineTo(x + NODE_HALF, y + NODE_HALF)
        marks.moveTo(x - NODE_HALF, y + NODE_HALF)
        marks.lineTo(x + NODE_HALF, y - NODE_HALF)
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = halo
      ctx.lineWidth = NODE_WIDTH + 1.5
      ctx.stroke(marks)
      ctx.strokeStyle = colorOf(b.token)
      ctx.lineWidth = NODE_WIDTH
      ctx.stroke(marks)
    }
  }

  ctx.globalAlpha = 1
  if (clipX !== null) ctx.restore()
}

watch(
  () => props.geometry,
  (geo) => {
    buildScene(geo)
    schedule()
  },
  { immediate: true },
)

watch(
  () => [props.scale, props.tx, props.ty, props.docW, props.docH, props.clipX, props.dark],
  schedule,
)

onMounted(() => {
  observer = new ResizeObserver(schedule)
  if (canvas.value) observer.observe(canvas.value)
  schedule()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (raf !== 0) cancelAnimationFrame(raf)
})
</script>

<template>
  <canvas ref="canvas" class="overlay" aria-hidden="true" />
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
</style>
