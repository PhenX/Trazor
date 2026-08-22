<script setup lang="ts">
import type { PathCommand } from '@vectorizer/core'
import type { SvgGeometry } from '@vectorizer/svg'
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
 * Everything is drawn in screen space and redrawn on any pan/zoom, so anchor
 * marks keep a constant on-screen size at every zoom level. Geometry points are
 * in viewBox units (== document px); the document is placed at
 * `translate(tx, ty) scale(scale)`, so a point maps to screen as
 * `tx + x * scale`, `ty + y * scale`.
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

// Anchor / control totals, refreshed when the geometry changes; drive the
// declutter thresholds without re-walking the commands every frame.
let nodeCount = 0
let controlCount = 0

function countGeometry(geo: SvgGeometry | null): void {
  nodeCount = 0
  controlCount = 0
  if (!geo) return
  for (const shape of geo.shapes) {
    for (const cmd of shape.commands) {
      if (cmd.type === 'Z') continue
      nodeCount++
      if (cmd.type === 'Q') controlCount += 1
      else if (cmd.type === 'C') controlCount += 2
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

function replayOutline(path: Path2D, shape: readonly PathCommand[], sx: number, sy: number): void {
  const mx = (x: number): number => props.tx + x * sx
  const my = (y: number): number => props.ty + y * sy
  for (const cmd of shape) {
    switch (cmd.type) {
      case 'M':
        path.moveTo(mx(cmd.x), my(cmd.y))
        break
      case 'L':
        path.lineTo(mx(cmd.x), my(cmd.y))
        break
      case 'Q':
        path.quadraticCurveTo(mx(cmd.x1), my(cmd.y1), mx(cmd.x), my(cmd.y))
        break
      case 'C':
        path.bezierCurveTo(mx(cmd.x1), my(cmd.y1), mx(cmd.x2), my(cmd.y2), mx(cmd.x), my(cmd.y))
        break
      case 'Z':
        path.closePath()
        break
    }
  }
}

function draw(): void {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const cssW = el.clientWidth
  const cssH = el.clientHeight
  const bw = Math.max(1, Math.round(cssW * dpr))
  const bh = Math.max(1, Math.round(cssH * dpr))
  if (el.width !== bw) el.width = bw
  if (el.height !== bh) el.height = bh
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const geo = props.geometry
  if (!geo || geo.shapes.length === 0) return

  if (props.clipX !== null) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(props.clipX, 0, Math.max(0, cssW - props.clipX), cssH)
    ctx.clip()
  }

  // viewBox → document px (usually 1:1) folded into the screen scale.
  const sx = props.scale * (props.docW > 0 ? props.docW / (geo.width || props.docW) : 1)
  const sy = props.scale * (props.docH > 0 ? props.docH / (geo.height || props.docH) : 1)
  const mx = (x: number): number => props.tx + x * sx
  const my = (y: number): number => props.ty + y * sy

  const styles = getComputedStyle(el)
  const tokenCache = new Map<string, string>()
  const tokenColor = (token: string): string => {
    let c = tokenCache.get(token)
    if (c === undefined) {
      c = styles.getPropertyValue(token).trim() || '#6c7bff'
      tokenCache.set(token, c)
    }
    return c
  }
  const halo = props.dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)'

  const showNodes = nodeCount <= NODE_LIMIT
  const showHandles = showNodes && controlCount > 0 && controlCount <= HANDLE_LIMIT

  // Group every shape into a per-color bucket keyed by its element kind, so all
  // paths, all rects, etc. can each be stroked in one pass in their own hue.
  const buckets = new Map<string, Bucket>()
  const bucketFor = (color: string): Bucket => {
    let b = buckets.get(color)
    if (b === undefined) {
      b = { outline: new Path2D(), handles: new Path2D(), dots: [], marks: new Path2D() }
      buckets.set(color, b)
    }
    return b
  }

  for (const shape of geo.shapes) {
    const b = bucketFor(tokenColor(SHAPE_KIND_TOKEN[shape.kind]))
    replayOutline(b.outline, shape.commands, sx, sy)
    if (showNodes) {
      for (const cmd of shape.commands) {
        if (cmd.type !== 'Z') addCross(b.marks, mx(cmd.x), my(cmd.y))
      }
    }
    if (showHandles) {
      let cx = 0
      let cy = 0
      for (const cmd of shape.commands) {
        if (cmd.type === 'M' || cmd.type === 'L') {
          cx = cmd.x
          cy = cmd.y
        } else if (cmd.type === 'Q') {
          addHandle(b.handles, b.dots, mx(cx), my(cy), mx(cmd.x1), my(cmd.y1))
          b.handles.moveTo(mx(cmd.x), my(cmd.y))
          b.handles.lineTo(mx(cmd.x1), my(cmd.y1))
          cx = cmd.x
          cy = cmd.y
        } else if (cmd.type === 'C') {
          addHandle(b.handles, b.dots, mx(cx), my(cy), mx(cmd.x1), my(cmd.y1))
          addHandle(b.handles, b.dots, mx(cmd.x), my(cmd.y), mx(cmd.x2), my(cmd.y2))
          cx = cmd.x
          cy = cmd.y
        }
      }
    }
  }

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Outlines (bottom layer).
  ctx.globalAlpha = 0.85
  ctx.lineWidth = OUTLINE_WIDTH
  for (const [color, b] of buckets) {
    ctx.strokeStyle = color
    ctx.stroke(b.outline)
  }

  // Bézier handles: lines to each control point, then a small square on it.
  if (showHandles) {
    const side = CONTROL_RADIUS * 2
    for (const [color, b] of buckets) {
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.4
      ctx.lineWidth = HANDLE_WIDTH
      ctx.stroke(b.handles)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.6
      for (let p = 0; p < b.dots.length; p += 2) {
        ctx.fillRect(b.dots[p] - CONTROL_RADIUS, b.dots[p + 1] - CONTROL_RADIUS, side, side)
      }
    }
  }

  // Anchor marks — small crosses on top, haloed so they read over any fill.
  if (showNodes) {
    for (const [color, b] of buckets) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = halo
      ctx.lineWidth = NODE_WIDTH + 1.5
      ctx.stroke(b.marks)
      ctx.strokeStyle = color
      ctx.lineWidth = NODE_WIDTH
      ctx.stroke(b.marks)
    }
  }

  ctx.globalAlpha = 1
  if (props.clipX !== null) ctx.restore()
}

/** Per-color accumulation of everything drawn for one element kind. */
interface Bucket {
  outline: Path2D
  handles: Path2D
  dots: number[]
  marks: Path2D
}

/** Add a handle line (anchor → control) and record the control point. */
function addHandle(
  lines: Path2D,
  dots: number[],
  ax: number,
  ay: number,
  cx: number,
  cy: number,
): void {
  lines.moveTo(ax, ay)
  lines.lineTo(cx, cy)
  dots.push(cx, cy)
}

function addCross(path: Path2D, x: number, y: number): void {
  path.moveTo(x - NODE_HALF, y - NODE_HALF)
  path.lineTo(x + NODE_HALF, y + NODE_HALF)
  path.moveTo(x - NODE_HALF, y + NODE_HALF)
  path.lineTo(x + NODE_HALF, y - NODE_HALF)
}

watch(
  () => props.geometry,
  (geo) => {
    countGeometry(geo)
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
