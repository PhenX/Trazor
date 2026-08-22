#!/usr/bin/env node
// End-to-end smoke test: serves the built app, drives it with the system
// Chromium via playwright-core, runs real vectorizations on the bundled
// samples, saves the produced SVGs and a screenshot for the README.
//
// Usage: npm run build && node scripts/e2e.mjs
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const distDir = join(repoRoot, 'apps/web/dist')
const artifactsDir = join(repoRoot, 'e2e-artifacts')
const PORT = 4517

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.json': 'application/json',
}

function fail(message) {
  console.error(`\nE2E FAILED: ${message}`)
  process.exit(1)
}

if (!existsSync(join(distDir, 'index.html'))) {
  fail(`missing build output at ${distDir} — run \`npm run build\` first`)
}
mkdirSync(artifactsDir, { recursive: true })

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let filePath = normalize(join(distDir, urlPath === '/' ? 'index.html' : urlPath))
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html')
  }
  res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
})
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const executablePath = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  executablePath: existsSync(executablePath) ? executablePath : undefined,
  headless: true,
})

const consoleErrors = []
let exitCode = 0
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  async function loadSampleAndTrace(sampleIndex, name, timeoutMs = 120000) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sample-card', { timeout: 20000 })
    await page.locator('.sample-card').nth(sampleIndex).click()
    await page.waitForSelector('.layer-svg svg', { timeout: timeoutMs })
    // Let stats/fidelity settle.
    await page.waitForTimeout(1200)
    const svg = await page.locator('.layer-svg').innerHTML()
    const stats = (await page.locator('.stats').textContent()) ?? ''
    writeFileSync(join(artifactsDir, `${name}.svg`), svg.trim())
    console.log(
      `  ${name}: svg ${svg.length} bytes | stats: ${stats.replaceAll(/\s+/g, ' ').trim().slice(0, 160)}`,
    )
    return { svg, stats }
  }

  // Verify the mobile layout: a pinned result above an independently scrolling
  // command panel, plus a toggle that hides/restores the result (see the
  // ≤768px media queries in the SFCs and the toggle in App.vue).
  async function checkMobileLayout() {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    try {
      const mp = await mobile.newPage()
      await mp.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
      await mp.waitForSelector('.sample-card', { timeout: 20000 })
      await mp.locator('.sample-card').nth(0).click()
      await mp.waitForSelector('.layer-svg svg', { timeout: 120000 })
      await mp.waitForTimeout(800)

      const layout = await mp.evaluate(() => {
        const main = document.querySelector('.main')?.getBoundingClientRect()
        const panel = document.querySelector('.panel')?.getBoundingClientRect()
        const scroll = document.querySelector('.panel-scroll')
        return {
          resultVisible: !!main && main.height > 0,
          resultAbovePanel: main && panel ? main.top < panel.top : false,
          commandScrolls: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : false,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      if (!layout.resultVisible) fail('mobile: result should be visible by default')
      if (!layout.resultAbovePanel) fail('mobile: result should sit above the command panel')
      if (!layout.commandScrolls) fail('mobile: command panel should scroll independently')
      if (!layout.noHorizontalOverflow) fail('mobile: layout overflows horizontally')
      await mp.screenshot({ path: join(artifactsDir, 'mobile.png') })

      // The toggle hides the result to free space for the controls…
      await mp.locator('.result-toggle').click()
      await mp.waitForTimeout(300)
      const hidden = await mp.evaluate(
        () => (document.querySelector('.main')?.getClientRects().length ?? 0) === 0,
      )
      if (!hidden) fail('mobile: toggle should hide the result')

      // …and restores it.
      await mp.locator('.result-toggle').click()
      await mp.waitForTimeout(300)
      const restored = await mp.evaluate(
        () => (document.querySelector('.main')?.getBoundingClientRect().height ?? 0) > 0,
      )
      if (!restored) fail('mobile: toggle should restore the result')

      console.log('  mobile: result pinned ✓  above-command ✓  command-scrolls ✓  toggle ✓')
    } finally {
      await mobile.close()
    }
  }

  console.log('E2E: mobile layout — pinned result + toggle (390×844)…')
  await checkMobileLayout()

  console.log('E2E: sample "Badge" (color, stacked)…')
  const badge = await loadSampleAndTrace(0, 'badge')
  if (!badge.svg.includes('<path')) fail('badge produced no paths')
  const fills = new Set([...badge.svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]))
  if (fills.size < 3) fail(`badge should have ≥3 fill colors, got ${fills.size}`)
  if (badge.svg.length < 1500) fail('badge svg suspiciously small')

  // Screenshot for the README while the badge result is on screen.
  await page.screenshot({ path: join(repoRoot, 'docs/screenshot.png') })
  console.log('  screenshot saved to docs/screenshot.png')

  console.log('E2E: sample "Sprite" (pixel art)…')
  const sprite = await loadSampleAndTrace(2, 'sprite')
  if (!sprite.svg.includes('viewBox="0 0 24 24"')) {
    fail('sprite should trace at native 24×24 resolution')
  }

  console.log('E2E: sample "Sunset" (photo-like)…')
  const sunset = await loadSampleAndTrace(1, 'sunset', 180000)
  if (!sunset.svg.includes('<path')) fail('sunset produced no paths')

  const realErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('Cache Storage'),
  )
  if (realErrors.length > 0) {
    fail(`console errors:\n  ${realErrors.join('\n  ')}`)
  }
  console.log('\nE2E PASSED — artifacts in e2e-artifacts/, screenshot in docs/')
} catch (err) {
  exitCode = 1
  console.error('\nE2E FAILED:', err)
  if (consoleErrors.length > 0) console.error('console errors:', consoleErrors.join('\n'))
} finally {
  await browser.close()
  server.close()
}
process.exit(exitCode)
