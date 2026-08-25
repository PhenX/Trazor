<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ReleaseFigureData } from './index'

// Renders a release note's real sample imagery: either a before/after trace
// pair or a wall of candidate traces with the chosen one marked. The images are
// decorative (the note's `items` copy is the description), so each carries an
// empty `alt`; the visible captions/badge are the localized, screen-reader text.
defineProps<{ figure: ReleaseFigureData }>()
const { t } = useI18n()
</script>

<template>
  <figure v-if="figure.kind === 'compare'" class="rn-fig rn-compare">
    <div class="rn-shot">
      <img :src="figure.before" alt="" loading="lazy" decoding="async" />
      <figcaption>{{ t('release.before') }}</figcaption>
    </div>
    <div class="rn-shot">
      <img :src="figure.after" alt="" loading="lazy" decoding="async" />
      <figcaption>{{ t('release.after') }}</figcaption>
    </div>
  </figure>

  <figure v-else class="rn-fig rn-wall">
    <div
      v-for="(img, i) in figure.images"
      :key="i"
      class="rn-cand"
      :class="{ 'rn-cand--win': i === figure.winner }"
    >
      <img :src="img" alt="" loading="lazy" decoding="async" />
      <span v-if="i === figure.winner" class="rn-chosen">{{ t('release.chosen') }}</span>
    </div>
  </figure>
</template>

<style scoped>
.rn-fig {
  margin: 0;
}

/* Before / after pair */
.rn-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.rn-shot {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rn-shot img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-s);
  border: 1px solid var(--border);
}

.rn-shot figcaption {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-3);
  text-align: center;
}

/* Candidate wall */
.rn-wall {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.rn-cand {
  position: relative;
}

.rn-cand img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-s);
  border: 1px solid var(--border);
}

.rn-cand--win img {
  border: 2px solid var(--accent);
}

.rn-chosen {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
}

@media (max-width: 420px) {
  .rn-wall {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
