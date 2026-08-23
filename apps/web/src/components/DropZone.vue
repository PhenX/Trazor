<script setup lang="ts">
import type { RasterImage } from '@trazor/core'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acceptAttr } from '../lib/decode'
import { SAMPLES } from '../lib/samples'
import { useAppStore } from '../store/appStore'

const store = useAppStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const thumbCanvases = new Map<string, HTMLCanvasElement>()
let dragDepth = 0

function setThumbRef(id: string, el: HTMLCanvasElement | null): void {
  if (el) thumbCanvases.set(id, el)
}

function drawThumb(canvas: HTMLCanvasElement, image: RasterImage): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const staging = document.createElement('canvas')
  staging.width = image.width
  staging.height = image.height
  const sctx = staging.getContext('2d')
  if (!sctx) return
  sctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  )

  const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = scale < 1
  ctx.drawImage(staging, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
}

async function renderThumbs(): Promise<void> {
  await Promise.all(
    SAMPLES.map(async (sample) => {
      const canvas = thumbCanvases.get(sample.id)
      if (!canvas) return
      try {
        drawThumb(canvas, await sample.make())
      } catch {
        // Thumbnails are decorative — ignore failures.
      }
    }),
  )
}

function openPicker(): void {
  fileInput.value?.click()
}

function onFileChosen(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void store.loadBlob(file, file.name)
  input.value = ''
}

function pickImageFile(dt: DataTransfer): File | null {
  for (const item of Array.from(dt.files)) {
    if (!item.type || item.type.startsWith('image/')) return item
  }
  return null
}

function hasFiles(dt: DataTransfer | null): boolean {
  return dt !== null && Array.from(dt.types).includes('Files')
}

function onDragEnter(event: DragEvent): void {
  if (!hasFiles(event.dataTransfer)) return
  event.preventDefault()
  dragDepth++
  dragging.value = true
}

function onDragOver(event: DragEvent): void {
  if (!hasFiles(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent): void {
  if (!hasFiles(event.dataTransfer)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDrop(event: DragEvent): void {
  if (!hasFiles(event.dataTransfer)) return
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  const file = event.dataTransfer ? pickImageFile(event.dataTransfer) : null
  if (file) {
    void store.loadBlob(file, file.name)
  } else {
    store.notify('Drop an image file (PNG, JPEG, WebP, GIF, BMP, AVIF or SVG)', 'error')
  }
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData
  if (!data) return
  // Don't hijack paste inside editable fields.
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        void store.loadBlob(file, file.name || 'pasted-image')
        return
      }
    }
  }
  const text = data.getData('text/plain')
  if (text.trimStart().startsWith('<svg')) {
    event.preventDefault()
    void store.loadBlob(new Blob([text], { type: 'image/svg+xml' }), 'pasted.svg')
  }
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('paste', onPaste)
  void renderThumbs()
})

// Thumbnails are painted imperatively onto the canvases, so they must be
// repainted every time the empty state is recreated — returning home from a
// loaded image mounts a fresh, blank set of canvases.
watch(
  () => store.hasImage,
  (hasImage) => {
    if (!hasImage) void nextTick(renderThumbs)
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('paste', onPaste)
})

defineExpose({ openPicker })
</script>

<template>
  <div class="dz-root">
    <input
      ref="fileInput"
      class="hidden-input"
      type="file"
      :accept="acceptAttr"
      aria-hidden="true"
      tabindex="-1"
      @change="onFileChosen"
    />

    <!-- Empty state -->
    <div v-if="!store.hasImage" class="empty">
      <div class="empty-inner">
        <button class="target" type="button" @click="openPicker">
          <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <path
              d="M24 32V14m0 0-7 7m7-7 7 7"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M10 34v3a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-3"
              fill="none"
              stroke="var(--text-3)"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          <span class="target-title">Drop an image, paste, or browse</span>
          <span class="target-sub">
            PNG · JPEG · WebP · GIF · BMP · AVIF · SVG — processed locally, nothing is uploaded
          </span>
          <span class="btn btn-primary browse">Browse files</span>
          <span class="target-kbd"><kbd>Ctrl</kbd>+<kbd>V</kbd> to paste</span>
        </button>

        <div class="samples">
          <span class="samples-title">or try a sample</span>
          <div class="sample-grid">
            <button
              v-for="sample in SAMPLES"
              :key="sample.id"
              class="sample-card"
              type="button"
              @click="store.loadSample(sample.id)"
            >
              <span class="thumb-wrap checker">
                <canvas
                  width="160"
                  height="160"
                  :ref="(el) => setThumbRef(sample.id, el as HTMLCanvasElement | null)"
                />
              </span>
              <span class="sample-label">{{ sample.label }}</span>
              <span class="sample-tagline">{{ sample.tagline }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Replace veil while dragging with an image loaded -->
    <div v-if="dragging" class="veil">
      <div class="veil-card">
        <span class="veil-title">{{ store.hasImage ? 'Drop to replace' : 'Drop it' }}</span>
        <span class="veil-sub">the image is decoded and traced locally</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The root renders nothing itself — overlays position against the app body. */
.dz-root {
  display: contents;
}

.hidden-input {
  display: none;
}

.empty {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  /* `safe` centers the content while it fits but pins it to the top once it's
     taller than the viewport, so the upload target stays reachable instead of
     scrolling off above the fold. Plain `center` clips the overflow equally top
     and bottom, and only the bottom is scrollable — cropping the top. */
  align-items: safe center;
  justify-content: safe center;
  background: var(--bg-0);
  overflow: auto;
}

.empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 32px;
  max-width: 620px;
  width: 100%;
}

.target {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 40px 24px 32px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-l);
  background: var(--bg-1);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.target:hover {
  border-color: var(--accent);
  background: var(--bg-2);
}

.target-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
}

.target-sub {
  font-size: 11.5px;
  color: var(--text-3);
  text-align: center;
}

.browse {
  margin-top: 10px;
  height: 30px;
  padding: 0 16px;
}

.target-kbd {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}

.samples {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.samples-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.sample-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

.sample-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--bg-1);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.sample-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.thumb-wrap {
  display: block;
  width: 100%;
  border-radius: var(--radius-s);
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 6px;
}

.thumb-wrap canvas {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
}

.sample-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
}

.sample-tagline {
  font-size: 10.5px;
  color: var(--text-3);
}

.veil {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg-0) 65%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.veil-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 36px;
  border: 1.5px dashed var(--accent);
  border-radius: var(--radius-l);
  background: var(--bg-1);
  box-shadow: var(--shadow-2);
}

.veil-title {
  font-size: 15px;
  font-weight: 600;
}

.veil-sub {
  font-size: 11.5px;
  color: var(--text-2);
}

/* Mobile: tighten spacing and drop the sample grid to two comfortable columns. */
@media (max-width: 560px) {
  .empty-inner {
    gap: 22px;
    padding: 20px;
  }

  .target {
    padding: 28px 18px 24px;
  }

  .sample-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}
</style>
