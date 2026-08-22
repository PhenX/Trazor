#!/usr/bin/env node
// oxlint-disable no-await-in-loop -- one shared browser page; samples run in sequence
// Render-equivalence check: proves the SVG output optimizations (relative/H-V
// path data, collinear removal, <rect>/<circle> detection) do not change what
// the browser actually draws. Traces the bundled real samples, then renders the
// optimized SVG and the un-optimized baseline in a real browser and compares
// pixels.
//
// Usage: npm run build && node scripts/svg-render-check.mjs
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const distDir = join(repoRoot, 'apps/web/dist')
const PORT = 4519

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.json': 'application/json',
}

function fail(message) {
  console.error(`\nRENDER CHECK FAILED: ${message}`)
  process.exit(1)
}

if (!existsSync(join(distDir, 'index.html'))) {
  fail(`missing build output at ${distDir} — run \`npm run build\` first`)
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let filePath = normalize(join(distDir, urlPath === '/' ? 'index.html' : urlPath))
  if (!filePath.startsWith(distDir)) return void res.writeHead(403).end()
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

// Rasterize two SVG strings at a common size and compare pixels. Runs in-page so
// it uses the browser's own SVG renderer.
async function comparePixels(page, svgA, svgB) {
  return page.evaluate(
    async ([a, b]) => {
      const sizeOf = (svg) => {
        const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
        return vb ? [Number(vb[1]), Number(vb[2])] : [256, 256]
      }
      const [w0, h0] = sizeOf(a)
      const scale = Math.min(1, 600 / Math.max(w0, h0))
      const w = Math.max(1, Math.round(w0 * scale))
      const h = Math.max(1, Math.round(h0 * scale))
      const raster = (svg) =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
          const img = new Image()
          img.addEventListener('load', () => {
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w, h)
            ctx.drawImage(img, 0, 0, w, h)
            URL.revokeObjectURL(url)
            resolve(ctx.getImageData(0, 0, w, h).data)
          })
          img.addEventListener('error', () => {
            URL.revokeObjectURL(url)
            reject(new Error('SVG failed to decode'))
          })
          img.src = url
        })
      const da = await raster(a)
      const db = await raster(b)
      let maxDiff = 0
      let sumDiff = 0
      let over8 = 0
      for (let i = 0; i < da.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(da[i + c] - db[i + c])
          if (d > maxDiff) maxDiff = d
          sumDiff += d
          if (d > 8) over8++
        }
      }
      const samples = (da.length / 4) * 3
      return { w, h, maxDiff, meanDiff: sumDiff / samples, diffFraction: over8 / samples }
    },
    [svgA, svgB],
  )
}

// Read `.layer-svg` until it holds steady (the trace runs async and re-renders
// a few times), optionally requiring it to differ from a previous capture.
async function stableSvg(page, timeoutMs, differentFrom = null) {
  const deadline = Date.now() + timeoutMs
  let last = null
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    const cur = (
      await page
        .locator('.layer-svg')
        .innerHTML()
        .catch(() => '')
    ).trim()
    const usable = cur.includes('<svg') && (differentFrom === null || cur !== differentFrom)
    if (usable && cur === last) {
      if (Date.now() - stableSince >= 1000) return cur
    } else {
      last = cur
      stableSince = Date.now()
    }
    await page.waitForTimeout(200)
  }
  throw new Error('SVG did not stabilize within the timeout')
}

// samples: [cardIndex, name, exact?, traceTimeoutMs]
const SAMPLES = [
  [2, 'sprite (pixel art)', true, 60000],
  [0, 'badge (color)', false, 120000],
]

let exitCode = 0
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  for (const [index, name, exact, timeout] of SAMPLES) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sample-card', { timeout: 20000 })
    await page.locator('.sample-card').nth(index).click()
    await page.waitForSelector('.layer-svg svg', { timeout })

    const toggle = page.getByRole('switch', { name: 'Minify paths' })
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
    const optimized = await stableSvg(page, timeout)

    // Turn minification off and wait for the re-traced baseline to replace it.
    await toggle.click()
    const baseline = await stableSvg(page, timeout, optimized)

    const optBytes = Buffer.byteLength(optimized, 'utf8')
    const baseBytes = Buffer.byteLength(baseline, 'utf8')
    const { w, h, maxDiff, meanDiff, diffFraction } = await comparePixels(page, optimized, baseline)

    const saved = (100 * (1 - optBytes / baseBytes)).toFixed(1)
    console.log(
      `  ${name.padEnd(18)} ${w}×${h}  ${baseBytes}→${optBytes} bytes (${saved}%)  ` +
        `maxΔ=${maxDiff} meanΔ=${meanDiff.toFixed(3)} diff=${(diffFraction * 100).toFixed(3)}%`,
    )

    if (optBytes > baseBytes) fail(`${name}: optimized SVG is larger than the baseline`)
    if (exact) {
      if (maxDiff !== 0) fail(`${name}: expected bit-identical rendering, got maxΔ=${maxDiff}`)
    } else {
      if (meanDiff > 0.6 || diffFraction > 0.01) {
        fail(`${name}: rendering diverged (meanΔ=${meanDiff.toFixed(3)}, diff=${diffFraction})`)
      }
    }
  }

  const realErrors = consoleErrors.filter((e) => !e.includes('favicon') && !e.includes('Cache'))
  if (realErrors.length > 0) fail(`console errors:\n  ${realErrors.join('\n  ')}`)
  console.log('\nRENDER CHECK PASSED — optimized SVGs render identically to the baseline')
} catch (err) {
  exitCode = 1
  console.error('\nRENDER CHECK FAILED:', err)
} finally {
  await browser.close()
  server.close()
}
process.exit(exitCode)
