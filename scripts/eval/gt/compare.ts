/**
 * A side-by-side sheet of two gate runs, for looking at what a change did:
 * the items that moved most on one metric, each shown as the input raster, the
 * artist's file, the base trace and the candidate trace, at one size, with
 * every metric of both rows beneath. Written as one self-contained HTML page
 * (the SVGs inline as data URIs), so a browser renders the traces exactly.
 *
 *   npx tsx scripts/eval/gt/compare.ts --base base.json --cand cand.json
 *        --base-svgs <dir> --cand-svgs <dir> (--inkvec <inkvec checkout> | --images <dir>)
 *        [--metric de00] [--n 8] [--size 256] [--out sheet.html]
 *
 * The SVG folders are the gate's `--keep` folders of the two runs. An item is
 * shown only when both runs kept its trace.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { GtCorpus, GtItem } from './corpus'
import { itemKey, loadCorpus, loadImageDir, rasterPath, truthPath } from './corpus'
import type { Row } from './worker'

function arg(argv: string[], name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}

const dataUri = (type: string, bytes: Buffer): string =>
  `data:${type};base64,${bytes.toString('base64')}`

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function fmt(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.abs(v) >= 100
      ? v.toFixed(0)
      : v.toPrecision(3)
    : '–'
}

const METRICS = [
  'de00',
  'gmsd',
  'fillDe00',
  'bandDe00',
  'edgeMiss',
  'edgeExtra',
  'ratio',
  'params',
  'turning',
  'bytes',
  'ms',
] as const

function main(): void {
  const argv = process.argv.slice(2)
  const basePath = arg(argv, '--base')
  const candPath = arg(argv, '--cand')
  const baseSvgs = arg(argv, '--base-svgs')
  const candSvgs = arg(argv, '--cand-svgs')
  if (!basePath || !candPath || !baseSvgs || !candSvgs)
    throw new Error('--base, --cand, --base-svgs and --cand-svgs are required')
  const imageDir = arg(argv, '--images')
  const inkvec = arg(argv, '--inkvec')
  const corpus: GtCorpus = imageDir
    ? loadImageDir(imageDir)
    : loadCorpus(
        inkvec ??
          (() => {
            throw new Error('--inkvec or --images is required')
          })(),
      )
  const metric = arg(argv, '--metric', 'de00') as string
  const n = Number(arg(argv, '--n', '8'))
  const size = Number(arg(argv, '--size', '256'))
  const out = arg(argv, '--out', 'eval-artifacts/gt-compare.html') as string

  const base = JSON.parse(readFileSync(basePath, 'utf8')) as {
    meta: { tier: string }
    rows: Row[]
  }
  const cand = JSON.parse(readFileSync(candPath, 'utf8')) as { rows: Row[] }
  const tier = base.meta.tier
  const items = new Map<string, GtItem>()
  for (const list of Object.values(corpus.sets)) for (const it of list) items.set(itemKey(it), it)
  const candByKey = new Map(cand.rows.map((r) => [r.key, r]))
  const svgName = (r: Row): string => `${r.corpus}__${r.stem}.svg`

  const moved = base.rows
    .map((b) => ({ b, c: candByKey.get(b.key) }))
    .filter(
      (p): p is { b: Row; c: Row } =>
        p.c !== undefined &&
        existsSync(join(baseSvgs, svgName(p.b))) &&
        existsSync(join(candSvgs, svgName(p.b))) &&
        Number.isFinite(p.b[metric as keyof Row] as number) &&
        Number.isFinite(p.c[metric as keyof Row] as number),
    )
    .map(({ b, c }) => ({
      b,
      c,
      d: (c[metric as keyof Row] as number) - (b[metric as keyof Row] as number),
    }))
  const worst = moved.toSorted((a, b) => b.d - a.d).slice(0, n)
  const best = moved.toSorted((a, b) => a.d - b.d).slice(0, n)

  const cell = (title: string, src: string | undefined, pixelated = false): string =>
    `<figure><figcaption>${escape(title)}</figcaption>${
      src
        ? `<img src="${src}" width="${size}" height="${size}"${pixelated ? ' class="px"' : ''}>`
        : '<div class="none">—</div>'
    }</figure>`
  const section = (title: string, list: typeof moved): string => {
    const rows = list.map(({ b, c, d }) => {
      const it = items.get(b.key)
      const raster = it ? rasterPath(corpus, it, tier) : undefined
      const truth = it && !it.raster ? truthPath(corpus, it) : undefined
      const table = METRICS.map(
        (m) =>
          `<tr><th>${m}</th><td>${fmt(b[m as keyof Row])}</td><td>${fmt(c[m as keyof Row])}</td></tr>`,
      ).join('')
      return `<section><h3>${escape(b.key)} <small>${metric} ${d >= 0 ? '+' : ''}${fmt(d)}</small></h3><div class="row">${cell(
        'input',
        raster && existsSync(raster) ? dataUri('image/png', readFileSync(raster)) : undefined,
        true,
      )}${cell(
        'artist',
        truth && existsSync(truth) ? dataUri('image/svg+xml', readFileSync(truth)) : undefined,
      )}${cell('base', dataUri('image/svg+xml', readFileSync(join(baseSvgs, svgName(b)))))}${cell(
        'candidate',
        dataUri('image/svg+xml', readFileSync(join(candSvgs, svgName(b)))),
      )}<table><tr><th></th><th>base</th><th>cand</th></tr>${table}</table></div></section>`
    })
    return `<h2>${escape(title)}</h2>${rows.join('')}`
  }

  const html = `<!doctype html><meta charset="utf-8"><title>Gate comparison</title><style>
body{font:13px system-ui,sans-serif;margin:16px;background:#fff;color:#111}
.row{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
figure{margin:0}figcaption{color:#555}
img{background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid #ccc}
img.px{image-rendering:pixelated}.none{width:${size}px;height:${size}px;border:1px dashed #ccc}
table{border-collapse:collapse}td,th{padding:1px 6px;text-align:right}th{color:#555;font-weight:500}
</style><h1>${escape(basename(basePath))} → ${escape(basename(candPath))} (${escape(tier)})</h1>${section(
    `Worst ${metric} moves`,
    worst,
  )}${section(`Best ${metric} moves`, best)}`
  writeFileSync(out, html)
  console.log(`${out}: ${worst.length} worst, ${best.length} best of ${moved.length} paired items`)
}

main()
