<script setup lang="ts">
/**
 * A single inline-SVG preview of one layer or one contour, framed to its own
 * bounds so even a tiny shape fills the tile. Fills carry a hairline halo so
 * they stay visible whatever the paint or the checkerboard behind them; stroke
 * layers (centerline) render as their outline. Purely presentational — it fills
 * its container, so the same component serves the small row tile and the
 * enlarged hover preview.
 */
defineProps<{
  /** Path data to draw (a whole layer, or one contour). */
  d: string
  /** `viewBox` framing the drawing. */
  viewBox: string
  /** Paint color. */
  color: string
  /** Render as a stroked outline (centerline) rather than a fill. */
  stroke: boolean
}>()
</script>

<template>
  <span class="thumb checker">
    <svg :viewBox="viewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <template v-if="stroke">
        <path
          :d="d"
          fill="none"
          :stroke="color"
          stroke-width="1.4"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </template>
      <template v-else>
        <path :d="d" :fill="color" fill-rule="evenodd" />
        <!-- Hairline halo so a pale fill still reads against a pale checker. -->
        <path
          :d="d"
          fill="none"
          stroke="rgba(128, 128, 128, 0.7)"
          stroke-width="0.75"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--border);
}

.thumb svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
