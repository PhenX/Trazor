<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  countUnseen,
  formatReleaseDate,
  RELEASE_NOTES,
  releaseId,
  type ReleaseNoteKind,
} from '../lib/releaseNotes'
import { useAppStore } from '../store/appStore'
import { RELEASE_ILLUSTRATIONS } from './illustrations'
import ReleaseFigure from './illustrations/ReleaseFigure.vue'

const store = useAppStore()
const { t } = useI18n()
const emit = defineEmits<{ close: [] }>()

// Snapshot how many notes were unseen when the panel opened, BEFORE marking
// them read below — so the "New" markers reflect the state at open time.
const newCount = countUnseen(store.lastSeenRelease)

function isNew(index: number): boolean {
  return index < newCount
}

const KIND_CLASS: Record<ReleaseNoteKind, string> = {
  feature: 'chip--accent',
  improvement: 'chip--success',
  fix: 'chip--warn',
}

function close(): void {
  emit('close')
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  // Opening the panel acknowledges every note; the header badge clears.
  store.markReleasesSeen()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="rn-backdrop" @click.self="close">
    <div class="rn-modal card" role="dialog" aria-modal="true" aria-labelledby="rn-title">
      <header class="rn-head">
        <div class="rn-head-title">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M3 6.4v3.2h2l5.2 2.6V3.8L5 6.4H3Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
            <path
              d="M5.4 9.6l.9 2.7 1.5-.5-.8-2.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M12.4 6.2a3 3 0 0 1 0 3.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
          <h2 id="rn-title" class="rn-title">{{ t('release.title') }}</h2>
        </div>
        <button
          class="btn btn-ghost btn-icon"
          type="button"
          :aria-label="t('release.close')"
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

      <div class="rn-scroll">
        <article v-for="(note, i) in RELEASE_NOTES" :key="releaseId(note)" class="rn-note">
          <div class="rn-meta">
            <div class="rn-meta-left">
              <span class="rn-ver mono">{{ releaseId(note) }}</span>
              <span class="rn-date">{{ formatReleaseDate(note.date) }}</span>
            </div>
            <div class="rn-meta-right">
              <span v-if="isNew(i)" class="rn-new">{{ t('release.new') }}</span>
              <span class="chip" :class="KIND_CLASS[note.kind]">{{
                t(`release.${note.kind}`)
              }}</span>
            </div>
          </div>
          <h3 class="rn-note-title">{{ note.title }}</h3>
          <div v-if="note.illustration" class="rn-art">
            <ReleaseFigure :figure="RELEASE_ILLUSTRATIONS[note.illustration]" />
          </div>
          <ul class="rn-items">
            <li v-for="(item, j) in note.items" :key="`${releaseId(note)}:${j}`">{{ item }}</li>
          </ul>
        </article>
      </div>

      <footer class="rn-foot">
        <span class="muted">{{ t('release.footNote') }}</span>
        <a
          class="rn-foot-link"
          href="https://github.com/PhenX/Trazor/commits/main"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('release.fullHistory') }}
        </a>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.rn-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg-0) 62%, transparent);
  backdrop-filter: blur(2px);
  animation: rn-fade 0.14s ease;
}

.rn-modal {
  display: flex;
  flex-direction: column;
  width: min(540px, 100%);
  max-height: min(640px, calc(100vh - 48px));
  box-shadow: var(--shadow-2);
  animation: rn-rise 0.16s ease;
}

.rn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 12px 14px 16px;
  border-bottom: 1px solid var(--border);
}

.rn-head-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--accent);
}

.rn-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.rn-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px;
}

.rn-note {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.rn-note:last-child {
  border-bottom: none;
}

.rn-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.rn-meta-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.rn-ver {
  font-size: 11.5px;
  color: var(--text-2);
}

.rn-date {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rn-meta-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.rn-new {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.rn-note-title {
  margin: 0 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
}

.rn-art {
  margin: 2px 0 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--bg-2);
}

.rn-items {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rn-items li {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.rn-items li::marker {
  color: var(--text-3);
}

.rn-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 16px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
}

.rn-foot-link {
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
  font-weight: 500;
}

.rn-foot-link:hover {
  text-decoration: underline;
}

@keyframes rn-fade {
  from {
    opacity: 0;
  }
}

@keyframes rn-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (max-width: 560px) {
  .rn-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .rn-modal {
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }
}
</style>
