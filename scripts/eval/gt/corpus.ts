/**
 * The ground-truth corpus: inkvec's committed benchmark data (`bench/data` of an
 * inkvec checkout — rasters rendered from the artists' SVGs at several tiers,
 * and the SVGs themselves), read through its stratified set file
 * (`bench/devset_v2.json`). Sets follow inkvec's own split so numbers line up
 * with its regression gate:
 *
 * - `screen`: every fourth icon of each family of `full` (246 icons), the set
 *   inkvec gates on;
 * - `dev`, `held_a`, `held_b`, `full`: the stratified splits (≈1k icons).
 *
 * Tiers: `128ss`, `256ss`, `512ss`, `1024ss` (8× supersampled renders at that
 * size, transparent background) and `<tier>op` (the same flattened onto white:
 * an opaque logo).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface GtItem {
  /** Family (`lucide`, `noto-emoji`, …). */
  corpus: string
  stem: string
  /** Parameters of the artist's own file (inkvec's count); 0 when there is none. */
  gtParams: number
  /** An image without an artist file: its raster, judged against itself. */
  raster?: string
}

export interface GtCorpus {
  /** `<inkvec>/bench/data`. */
  dataDir: string
  sets: Record<string, GtItem[]>
}

export function loadCorpus(inkvecDir: string): GtCorpus {
  const devset = join(inkvecDir, 'bench', 'devset_v2.json')
  if (!existsSync(devset)) throw new Error(`no ${devset}: pass --inkvec <inkvec checkout>`)
  const raw = JSON.parse(readFileSync(devset, 'utf8')) as Record<
    string,
    { corpus: string; stem: string; gt_params: number }[]
  >
  const conv = (xs: { corpus: string; stem: string; gt_params: number }[]): GtItem[] =>
    xs.map((x) => ({ corpus: x.corpus, stem: x.stem, gtParams: x.gt_params }))
  const sets: Record<string, GtItem[]> = {}
  for (const k of ['dev', 'held_a', 'held_b', 'full']) if (raw[k]) sets[k] = conv(raw[k])
  const byFam = new Map<string, GtItem[]>()
  for (const it of sets.full) {
    const list = byFam.get(it.corpus) ?? []
    list.push(it)
    byFam.set(it.corpus, list)
  }
  const screen: GtItem[] = []
  for (const fam of [...byFam.keys()].toSorted()) {
    const list = byFam.get(fam) ?? []
    for (let i = 0; i < list.length; i += 4) screen.push(list[i])
  }
  sets.screen = screen
  return { dataDir: join(inkvecDir, 'bench', 'data'), sets }
}

/** Base tier (without the opaque suffix) and whether the raster is flattened onto white. */
export function parseTier(tier: string): { base: string; opaque: boolean } {
  const opaque = tier.endsWith('op')
  return { base: opaque ? tier.slice(0, -2) : tier, opaque }
}

/**
 * A folder of images with no artist file (the user's own art): every PNG is an
 * item, its family read from the folder's `families.json` when present. Such an
 * item is judged against its own raster, at its own size.
 */
export function loadImageDir(dir: string): GtCorpus {
  const famPath = join(dir, 'families.json')
  const fams = existsSync(famPath)
    ? (JSON.parse(readFileSync(famPath, 'utf8')) as Record<string, string>)
    : {}
  const items: GtItem[] = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .toSorted()
    .map((f) => ({
      corpus: fams[f] ?? 'images',
      stem: f.slice(0, -4),
      gtParams: 0,
      raster: join(dir, f),
    }))
  return { dataDir: dir, sets: { images: items } }
}

export function rasterPath(c: GtCorpus, it: GtItem, tier: string): string {
  if (it.raster) return it.raster
  return join(c.dataDir, 'corpus_raster', it.corpus, parseTier(tier).base, `${it.stem}.png`)
}

export function truthPath(c: GtCorpus, it: GtItem): string {
  return join(c.dataDir, 'corpus_svg', it.corpus, `${it.stem}.svg`)
}

export const itemKey = (it: GtItem): string => `${it.corpus}/${it.stem}`
