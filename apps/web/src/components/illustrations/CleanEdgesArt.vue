<script setup lang="ts">
// Decorative illustration for "Cleaner edges for flat art and line art".
// Left panel: two color regions meeting at a seam with a stray third-color rim
// and speckles (the old artifact). Right panel: the same regions with a clean,
// crisp boundary. Purely visual — see illustrations/index.ts.
</script>

<template>
  <svg viewBox="0 0 240 92" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="ce-before"><rect x="8" y="14" width="100" height="64" rx="8" /></clipPath>
      <clipPath id="ce-after"><rect x="132" y="14" width="100" height="64" rx="8" /></clipPath>
    </defs>

    <!-- Before: rim halo + specks -->
    <g clip-path="url(#ce-before)">
      <polygon points="8,14 66,14 46,78 8,78" fill="#6c7bff" />
      <polygon points="66,14 108,14 108,78 46,78" fill="#ff7a66" />
      <line x1="66" y1="14" x2="46" y2="78" stroke="#ffd23f" stroke-width="4" />
      <circle cx="61" cy="28" r="2" fill="#ff4fd8" />
      <circle cx="56" cy="46" r="2.4" fill="#ffd23f" />
      <circle cx="50" cy="64" r="1.9" fill="#ff4fd8" />
      <circle cx="64" cy="20" r="1.5" fill="#ffd23f" />
    </g>
    <rect x="8" y="14" width="100" height="64" rx="8" stroke="var(--border-strong)" />

    <!-- After: clean split -->
    <g clip-path="url(#ce-after)">
      <polygon points="132,14 190,14 170,78 132,78" fill="#6c7bff" />
      <polygon points="190,14 232,14 232,78 170,78" fill="#ff7a66" />
    </g>
    <rect x="132" y="14" width="100" height="64" rx="8" stroke="var(--border-strong)" />

    <!-- Progression arrow -->
    <path
      d="M114 42l6 4-6 4"
      stroke="var(--text-3)"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
