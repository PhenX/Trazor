import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
// oxlint-disable-next-line import/no-unassigned-import -- global stylesheet side effect
import './styles/base.css'

createApp(App).use(createPinia()).mount('#app')
