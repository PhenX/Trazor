<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// The maker's Buy Me a Coffee page. A single external link, opened in a new tab.
const COFFEE_URL = 'https://buymeacoffee.com/phenxdesign'

// `button` is a compact pill (settings footer, dialogs); `banner` is a wide,
// full-width strip that also carries a short pitch (top of the landing screen).
withDefaults(defineProps<{ variant?: 'button' | 'banner' }>(), { variant: 'button' })

const { t } = useI18n()
</script>

<template>
  <a
    class="bmc"
    :class="`bmc--${variant}`"
    :href="COFFEE_URL"
    target="_blank"
    rel="noopener noreferrer"
    :title="t('support.coffeeTitle')"
  >
    <span v-if="variant === 'banner'" class="bmc-pitch">{{ t('support.pitch') }}</span>
    <span class="bmc-cta">
      <svg class="bmc-cup" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path
          d="M3.5 8.5h13v4.5a4.5 4.5 0 0 1-4.5 4.5h-4a4.5 4.5 0 0 1-4.5-4.5V8.5Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
        <path
          d="M16.5 9.5h1.8a2.6 2.6 0 0 1 0 5.2h-1.3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M6.5 2.5c-.7.9-.7 1.8 0 2.7M10 2c-.7.9-.7 1.8 0 2.7M13.5 2.5c-.7.9-.7 1.8 0 2.7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
      <span class="bmc-label">{{ t('support.coffee') }}</span>
    </span>
  </a>
</template>

<style scoped>
/* Buy Me a Coffee brand yellow with near-black ink — a deliberately fixed brand
   color (not a theme token) so the button reads the same in light and dark. */
.bmc {
  --bmc-yellow: #ffdd00;
  --bmc-ink: #1a1a1a;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  cursor: pointer;
}

.bmc-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  padding: 0 15px;
  border-radius: 999px;
  background: var(--bmc-yellow);
  color: var(--bmc-ink);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  box-shadow: var(--shadow-1);
  transition:
    filter 0.12s ease,
    transform 0.12s ease;
}

.bmc:hover .bmc-cta {
  filter: brightness(1.05);
}

.bmc:active .bmc-cta {
  transform: translateY(0.5px);
}

.bmc:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 999px;
}

.bmc-cup {
  flex: 0 0 auto;
}

/* Banner: a full-width strip pairing a short pitch with the button. */
.bmc--banner {
  width: 100%;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--bmc-yellow) 14%, var(--bg-1)),
    var(--bg-1)
  );
}

.bmc-pitch {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
  line-height: 1.4;
}

@media (max-width: 480px) {
  .bmc--banner {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    gap: 10px;
  }

  .bmc--banner .bmc-cta {
    width: 100%;
  }
}
</style>
