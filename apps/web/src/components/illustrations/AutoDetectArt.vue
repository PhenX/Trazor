<script setup lang="ts">
// Decorative illustration for "Sharper auto-detect for clean artwork". One
// piece of flat art, split down the middle: the left half is the old mistake
// (recognized as a photo and dropped to grayscale), the right half is kept as a
// faithful color illustration. Purely visual — see illustrations/index.ts.
</script>

<template>
  <svg viewBox="0 0 240 92" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="ad-frame"><rect x="40" y="10" width="160" height="72" rx="10" /></clipPath>
      <clipPath id="ad-left"><rect x="40" y="10" width="80" height="72" /></clipPath>
      <clipPath id="ad-right"><rect x="120" y="10" width="80" height="72" /></clipPath>
    </defs>

    <rect x="40" y="10" width="160" height="72" rx="10" fill="var(--bg-2)" />

    <!-- Grayscale half (old mistake) -->
    <g clip-path="url(#ad-frame)">
      <g clip-path="url(#ad-left)">
        <rect x="40" y="60" width="160" height="22" fill="#6b7280" />
        <circle cx="86" cy="34" r="18" fill="#9aa0aa" />
        <polygon points="120,64 96,64 108,40" fill="#565b66" />
      </g>
      <!-- Color half (kept faithful) -->
      <g clip-path="url(#ad-right)">
        <rect x="40" y="60" width="160" height="22" fill="#3ecf8e" />
        <circle cx="86" cy="34" r="18" fill="#f0b03f" />
        <polygon points="120,64 96,64 108,40" fill="#6c7bff" />
        <circle cx="154" cy="30" r="12" fill="#ff7a66" />
      </g>
    </g>

    <!-- Split line -->
    <line
      x1="120"
      y1="10"
      x2="120"
      y2="82"
      stroke="var(--text-3)"
      stroke-width="1.4"
      stroke-dasharray="4 4"
    />
    <rect x="40" y="10" width="160" height="72" rx="10" stroke="var(--border-strong)" />
  </svg>
</template>
