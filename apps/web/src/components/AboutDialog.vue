<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../store/appStore'
import BuyMeCoffee from './BuyMeCoffee.vue'

const store = useAppStore()
const { t, tm, rt } = useI18n()

function close(): void {
  store.closeAbout()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="ab-backdrop" @click.self="close">
    <div class="ab-modal card" role="dialog" aria-modal="true" aria-labelledby="ab-title">
      <header class="ab-head">
        <div class="ab-head-title">
          <svg class="ab-glyph" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
            <path
              d="M7 24C12 8 20 8 25 24"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <path d="M7 24 12 13M25 24 20 13" stroke="var(--text-3)" stroke-width="1.4" />
            <circle cx="12" cy="13" r="1.8" fill="var(--text-2)" />
            <circle cx="20" cy="13" r="1.8" fill="var(--text-2)" />
            <rect x="4.8" y="21.8" width="4.4" height="4.4" rx="1" fill="var(--text-1)" />
            <rect x="22.8" y="21.8" width="4.4" height="4.4" rx="1" fill="var(--text-1)" />
          </svg>
          <h2 id="ab-title" class="ab-title">{{ t('about.title') }}</h2>
        </div>
        <button
          class="btn btn-ghost btn-icon"
          type="button"
          :aria-label="t('about.close')"
          @click="close"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </header>

      <div class="ab-scroll">
        <!-- Intro -->
        <section class="ab-hero">
          <p class="ab-lede">{{ t('about.intro') }}</p>
          <div class="ab-tags">
            <span class="chip chip--accent">{{ t('about.privacyTag') }}</span>
            <span class="chip chip--success">{{ t('about.openSourceTag') }}</span>
          </div>
        </section>

        <!-- How it works -->
        <section class="ab-section">
          <h3 class="ab-section-title">{{ t('about.howTitle') }}</h3>
          <ol class="ab-steps">
            <li v-for="(step, i) in tm('about.howSteps')" :key="i">{{ rt(step) }}</li>
          </ol>
        </section>

        <!-- What makes it different -->
        <section class="ab-section">
          <h3 class="ab-section-title">{{ t('about.featuresTitle') }}</h3>
          <ul class="ab-features">
            <li v-for="(feature, i) in tm('about.features')" :key="i">
              <svg class="ab-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M3 8.5l3 3 7-7.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>{{ rt(feature) }}</span>
            </li>
          </ul>
        </section>

        <!-- The maker -->
        <section class="ab-section ab-maker">
          <h3 class="ab-section-title">{{ t('about.makerTitle') }}</h3>
          <p class="ab-maker-body">{{ t('about.makerBody') }}</p>
          <div class="ab-actions">
            <a
              class="btn"
              href="https://github.com/PhenX/Trazor"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
                fill="currentColor"
              >
                <path
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                />
              </svg>
              {{ t('about.viewSource') }}
            </a>
            <BuyMeCoffee variant="button" />
          </div>
        </section>
      </div>

      <footer class="ab-foot">
        <span class="muted">{{ t('about.thanks') }}</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ab-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg-0) 62%, transparent);
  backdrop-filter: blur(2px);
  animation: ab-fade 0.14s ease;
}

.ab-modal {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  box-shadow: var(--shadow-2);
  animation: ab-rise 0.16s ease;
}

.ab-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 12px 14px 16px;
  border-bottom: 1px solid var(--border);
}

.ab-head-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.ab-glyph {
  flex: 0 0 auto;
}

.ab-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.ab-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* Hero */
.ab-lede {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-1);
}

.ab-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.ab-section-title {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* How it works */
.ab-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ab-steps li {
  counter-increment: step;
  position: relative;
  padding-left: 34px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
}

.ab-steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: -1px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Features */
.ab-features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ab-features li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
}

.ab-check {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--success);
}

/* Maker */
.ab-maker {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--bg-2);
}

.ab-maker-body {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.ab-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.ab-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 11px 16px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
}

@keyframes ab-fade {
  from {
    opacity: 0;
  }
}

@keyframes ab-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (max-width: 560px) {
  .ab-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .ab-modal {
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .ab-scroll {
    padding: 16px 16px 8px;
  }
}
</style>
