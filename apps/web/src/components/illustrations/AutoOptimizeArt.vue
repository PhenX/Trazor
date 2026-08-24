<script setup lang="ts">
// Decorative illustration for "Auto-optimize your settings". A wall of traced
// candidates, each a slightly different simplification of the same motif, with
// the chosen winner ringed and check-marked. Purely visual — see
// illustrations/index.ts.

const COLS = 4
const WINNER = 2 // 0-based cell index that gets the winner ring

// Per-candidate palettes, so the wall reads as varied traces of one image.
const PALETTES: readonly [string, string, string][] = [
  ['#6c7bff', '#ff7a66', '#3ecf8e'],
  ['#5261f0', '#f0b03f', '#3ecf8e'],
  ['#6c7bff', '#ff7a66', '#f0b03f'],
  ['#8894ff', '#ff4fd8', '#3ecf8e'],
  ['#3ecf8e', '#6c7bff', '#ff7a66'],
  ['#f0b03f', '#6c7bff', '#ff7a66'],
  ['#ff7a66', '#3ecf8e', '#6c7bff'],
  ['#6c7bff', '#ff7a66', '#3ecf8e'],
]

const cells = PALETTES.map((palette, i) => ({
  palette,
  x: 15 + (i % COLS) * 54,
  y: 11 + Math.floor(i / COLS) * 38,
  winner: i === WINNER,
}))
</script>

<template>
  <svg viewBox="0 0 240 92" fill="none" aria-hidden="true" focusable="false">
    <g v-for="(cell, i) in cells" :key="i" :transform="`translate(${cell.x} ${cell.y})`">
      <rect x="0" y="0" width="48" height="32" rx="5" fill="var(--bg-1)" stroke="var(--border)" />
      <!-- Mini traced motif -->
      <circle cx="13" cy="12" r="7" :fill="cell.palette[0]" />
      <rect x="26" y="5" width="14" height="14" rx="2.5" :fill="cell.palette[1]" />
      <rect x="6" y="23" width="36" height="5" rx="2.5" :fill="cell.palette[2]" />
      <!-- Winner ring + check badge -->
      <template v-if="cell.winner">
        <rect
          x="-2"
          y="-2"
          width="52"
          height="36"
          rx="7"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2.4"
        />
        <circle cx="48" cy="0" r="7" fill="var(--accent)" />
        <path
          d="M45 0.2l2 2 3.6-3.8"
          fill="none"
          stroke="var(--accent-contrast)"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>
    </g>
  </svg>
</template>
