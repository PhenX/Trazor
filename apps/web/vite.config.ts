import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The web tsconfig pins `types` to ["vite/client"], so Node globals are not in
// scope here; declare the tiny slice of `process` this config reads.
declare const process: { env: Record<string, string | undefined> }

export default defineConfig({
  plugins: [vue()],
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
})
