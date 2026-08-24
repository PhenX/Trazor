import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
// oxlint-disable-next-line import/no-unassigned-import -- global stylesheet side effect
import './styles/base.css'

createApp(App).use(createPinia()).use(i18n).mount('#app')

// Dev-only handle for the settings search (M1). Run `trazorAutoTune()` from the
// console after loading an image; the studio UI (M2) is not wired yet.
if (import.meta.env.DEV) {
  void import('./store/appStore').then(({ useAppStore }) => {
    ;(globalThis as unknown as Record<string, unknown>).trazorAutoTune = (
      overrides?: Parameters<ReturnType<typeof useAppStore>['autoTuneDev']>[0],
    ) => useAppStore().autoTuneDev(overrides)
    return undefined
  })
}
