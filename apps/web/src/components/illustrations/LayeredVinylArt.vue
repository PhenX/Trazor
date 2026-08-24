<script setup lang="ts">
// Decorative illustration for "Cleaner layered vinyl". A fanned stack of cut
// sheets: the dominant/outline color forms the full base sheet at the bottom,
// color sheets stack above it, and a small enclosed detail lifts onto its own
// top layer. Purely visual — see illustrations/index.ts.
</script>

<template>
  <svg viewBox="0 0 240 92" fill="none" aria-hidden="true" focusable="false">
    <!-- Full base layer (dominant / outline color) — widest, at the bottom -->
    <rect
      x="46"
      y="54"
      width="150"
      height="28"
      rx="6"
      fill="#3a4568"
      stroke="var(--border-strong)"
    />
    <!-- Color sheets, fanned up and to the right -->
    <rect
      x="60"
      y="43"
      width="128"
      height="28"
      rx="6"
      fill="#ff7a66"
      stroke="var(--border-strong)"
    />
    <rect
      x="74"
      y="32"
      width="128"
      height="28"
      rx="6"
      fill="#6c7bff"
      stroke="var(--border-strong)"
    />
    <rect
      x="88"
      y="21"
      width="128"
      height="28"
      rx="6"
      fill="#3ecf8e"
      stroke="var(--border-strong)"
    />
    <!-- Enclosed detail lifted onto its own top layer -->
    <rect
      x="150"
      y="8"
      width="30"
      height="18"
      rx="5"
      fill="#f0b03f"
      stroke="var(--border-strong)"
    />
    <circle cx="165" cy="17" r="3.4" fill="var(--bg-0)" />
  </svg>
</template>
