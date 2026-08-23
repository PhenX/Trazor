<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../store/appStore'

const store = useAppStore()

const emit = defineEmits<{ openFile: []; openReleaseNotes: [] }>()

// Compact "since last visit" badge; caps large counts so it stays little.
const unseenBadge = computed(() =>
  store.unseenReleaseCount > 9 ? '9+' : String(store.unseenReleaseCount),
)
</script>

<template>
  <header class="header">
    <div class="brand">
      <svg class="glyph" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
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
      <span class="wordmark">Trazor</span>
      <span class="tagline">raster → SVG, entirely in your browser</span>
    </div>

    <div class="actions">
      <template v-if="store.hasImage">
        <button
          class="btn btn-ghost btn-sm hdr-action"
          title="Back to the landing screen"
          @click="store.clearImage()"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M2.5 7.5 8 2.8l5.5 4.7M4 6.6V13h8V6.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="hdr-label">Home</span>
        </button>
        <button
          class="btn btn-ghost btn-sm hdr-action"
          title="Load another image (Ctrl+O)"
          @click="emit('openFile')"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M8 10.5V3m0 0L5.3 5.7M8 3l2.7 2.7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M3 10v2.2A1.3 1.3 0 0 0 4.3 13.5h7.4A1.3 1.3 0 0 0 13 12.2V10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
          <span class="hdr-label">Open</span>
        </button>
        <span class="hdr-sep" aria-hidden="true" />
      </template>
      <button
        class="btn btn-ghost btn-icon whatsnew"
        :title="
          store.unseenReleaseCount > 0
            ? `What's new — ${store.unseenReleaseCount} since your last visit`
            : `What's new`
        "
        :aria-label="
          store.unseenReleaseCount > 0
            ? `What's new, ${store.unseenReleaseCount} new since your last visit`
            : `What's new`
        "
        @click="emit('openReleaseNotes')"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
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
        <span v-if="store.unseenReleaseCount > 0" class="whatsnew-badge" aria-hidden="true">
          {{ unseenBadge }}
        </span>
      </button>
      <button
        class="btn btn-ghost btn-icon"
        :title="store.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        :aria-label="store.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="store.toggleTheme()"
      >
        <svg
          v-if="store.theme === 'dark'"
          viewBox="0 0 16 16"
          width="15"
          height="15"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4" />
          <path
            d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M13.5 9.7A5.6 5.6 0 0 1 6.3 2.5a5.6 5.6 0 1 0 7.2 7.2Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <a
        class="btn btn-ghost btn-icon"
        href="https://github.com/PhenX/Trazor"
        target="_blank"
        rel="noopener noreferrer"
        title="View source on GitHub"
        aria-label="View source on GitHub"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="currentColor">
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
      </a>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 12px 0 14px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
}

.glyph {
  align-self: center;
  flex: 0 0 auto;
}

.wordmark {
  font-size: 14.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.tagline {
  color: var(--text-3);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 900px) {
  .tagline {
    display: none;
  }
}

.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hdr-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hdr-sep {
  width: 1px;
  height: 20px;
  margin: 0 3px;
  background: var(--border);
}

/* "What's new" trigger + its since-last-visit badge. */
.whatsnew {
  position: relative;
  overflow: visible;
}

.whatsnew-badge {
  position: absolute;
  top: -1px;
  right: -2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  border: 1.5px solid var(--bg-1);
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* Collapse the action labels to icons on narrow screens. */
@media (max-width: 560px) {
  .hdr-label {
    display: none;
  }

  .hdr-action {
    gap: 0;
  }
}
</style>
