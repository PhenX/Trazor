import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
// oxlint-disable-next-line import/no-unassigned-import -- global stylesheet side effect
import './styles/base.css'

createApp(App).use(createPinia()).use(i18n).mount('#app')
