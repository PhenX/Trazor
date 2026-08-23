#!/usr/bin/env node
/**
 * Fetch VTracer's own showcase sample images (docs/assets/samples in the
 * visioncortex/vtracer repo) into a local, git-ignored corpus, so the tracer
 * comparison can run on the very inputs VTracer is demoed on — the fairest test
 * of "is VTracer better?", on its home turf, not on images picked to suit us.
 *
 * Served through the jsDelivr CDN + data API (the GitHub API, tree HTML and
 * tarball are commonly gated behind auth/allow-lists; jsDelivr is not). Nothing
 * is committed — these are third-party images (some are stock art) pulled on
 * demand for local benchmarking only; respect each source's terms.
 *
 * Usage:  node scripts/eval/fetch-vtracer-samples.mjs [--out scripts/eval/corpus-vtracer]
 * Then:   npm run eval:tracers -- --data scripts/eval/corpus-vtracer --montage
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const REPO = 'visioncortex/vtracer@master'
const DIR = 'docs/assets/samples'
const LIST = `https://data.jsdelivr.com/v1/packages/gh/${REPO}?structure=flat`
const cdn = (p) => `https://cdn.jsdelivr.net/gh/${REPO}${encodeURI(p)}`

function outArg(argv) {
  const i = argv.indexOf('--out')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'scripts/eval/corpus-vtracer'
}

/** Best-effort family tag from the filename — edit families.json to taste. */
function family(name) {
  const n = name.toLowerCase()
  if (n.includes('unsplash') || n.includes('photo') || n.includes('scan')) return 'photo'
  if (n.includes('drawing') || n.includes('sketch')) return 'lineart'
  return 'illustration'
}

async function main() {
  const out = outArg(process.argv.slice(2))
  mkdirSync(out, { recursive: true })

  const res = await fetch(LIST)
  if (!res.ok) throw new Error(`jsDelivr listing failed: HTTP ${res.status}`)
  const tree = await res.json()
  const files = (tree.files ?? [])
    .map((f) => f.name)
    .filter((p) => typeof p === 'string' && p.startsWith(`/${DIR}/`))
    .filter((p) => /\.(png|jpe?g)$/i.test(p))
    .filter((p) => !/-s\.(png|jpe?g)$/i.test(p)) // skip the small thumbnail duplicates
  if (files.length === 0) throw new Error('no sample images found in the jsDelivr listing')

  const families = {}
  // oxlint-disable no-await-in-loop -- sequential downloads: polite to the CDN, bounded memory
  for (const p of files) {
    const name = basename(p)
    const r = await fetch(cdn(p))
    if (!r.ok) {
      console.error(`  ! skip ${name}: HTTP ${r.status}`)
      continue
    }
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(join(out, name), buf)
    families[name] = family(name)
    console.log(`  ${families[name].padEnd(12)} ${name}  (${Math.round(buf.length / 1024)} KB)`)
  }
  // oxlint-enable no-await-in-loop
  writeFileSync(join(out, 'families.json'), `${JSON.stringify(families, null, 2)}\n`)
  console.log(`\n  ${Object.keys(families).length} images + families.json → ${out}`)
}

main().catch((e) => {
  console.error(`fetch failed: ${e.message}`)
  process.exit(1)
})
