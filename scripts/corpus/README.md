# Real SVG corpus fetcher

`npm run corpus` downloads known, permissively-licensed SVG collections and lays them out **by category** for the dataset
generator's real-corpus mode ([`../dataset`](../dataset/README.md)). It's the "real" half of the recommended
**~⅔ procedural + ~⅓ real** training mix ([`../../docs/ML_STRATEGY.md`](../../docs/ML_STRATEGY.md)).

Nothing here is committed — `corpus/` is git-ignored and fully reproducible from this script.

## Usage

```sh
npm run corpus                        # default sources (icons, brands, flags; emoji excluded)
npm run corpus -- --only icons,flags  # subset by category or pack id
npm run corpus -- --all               # include optional/large sources (emoji)
npm run corpus -- --limit-per-source 300 --buckets 16
npm run corpus -- --clean             # wipe the npm cache first (fresh download)
```

Then feed it to the generator and mix with procedural data:

```sh
npm run corpus
npm run dataset -- --source dir --corpus corpus --count 20000 --out data/real
npm run dataset -- --source procedural  --count 40000 --out data/proc
python scripts/train/train.py --data data/proc data/real --epochs 80 --workers 8
```

## How it works

- Each source is an **npm package** (see [`sources.mjs`](sources.mjs)), installed into a local cache
  (`corpus/.cache/`, ignored by the generator) — no scraping, no auth, versions resolved by npm, cross-platform.
- Its `.svg` files are copied to `corpus/<category>/<pack>/<bucket>/`. Files are **sharded into buckets** (default 12) by
  a stable hash of the name.
- The generator treats each leaf directory (`<category>/<pack>/<bucket>`) as one **split family**, assigned wholesale to
  train/val/test — so no pack straddles splits, and the many buckets keep the 80/10/10 split balanced. (A tiny
  single-pack fetch can land an empty val/test — add more sources for a balanced split.)
- `corpus/manifest.json` and `corpus/LICENSES.md` record what was fetched, the resolved versions, counts, and licenses.

## Sources & licenses

All permissive (MIT / ISC / Apache-2.0 / CC0), except OpenMoji (CC-BY-SA-4.0, opt-in via `--all`). Training on them is
fine; if you **redistribute** the corpus, honor each pack's terms — they're listed in the generated `corpus/LICENSES.md`.
Default set: Lucide, Tabler, Feather, Bootstrap Icons, Heroicons, Material Design Icons (icons); Simple Icons (brands);
flag-icons (flags). Add your own by appending to [`sources.mjs`](sources.mjs) — any npm package with `.svg` files works.
