# Real SVG corpus fetcher

`npm run corpus` downloads known, permissively-licensed SVG collections and lays them out **by category** for the dataset
generator's real-corpus mode ([`../dataset`](../dataset/README.md)). It's the "real" half of the recommended
**~⅔ procedural + ~⅓ real** training mix ([`../../docs/ML_STRATEGY.md`](../../docs/ML_STRATEGY.md)).

Nothing here is committed — `corpus/` is git-ignored and fully reproducible from this script.

## Usage

```sh
npm run corpus                        # default: icons, brands, flags (npm) + illustrations (git)
npm run corpus -- --only icons,flags  # subset by category or pack id
npm run corpus -- --all               # also the opt-in sources: emoji + Wikimedia/openclipart
npm run corpus -- --limit-per-source 300 --buckets 16
npm run corpus -- --clean             # wipe the local cache first (fresh download)
```

Then feed it to the generator and mix with procedural data:

```sh
npm run corpus
npm run dataset -- --source dir --corpus corpus --count 20000 --out data/real
npm run dataset -- --source procedural  --count 40000 --out data/proc
python scripts/train/train.py --data data/proc data/real --epochs 80 --workers 8
```

## How it works

Each source (see [`sources.mjs`](sources.mjs)) is fetched by its `type` into a local cache (`corpus/.cache/`, ignored by
the generator), then its `.svg` files are copied to `corpus/<category>/<pack>/<bucket>/`:

- **`npm`** — install a package, copy its SVGs (the icon/brand/flag/emoji libraries). No scraping, no auth, versioned by npm.
- **`git`** — shallow-clone a repo, copy its SVGs (illustration packs). Just needs `git`.
- **`wikimedia`** — download SVGs via the Wikimedia Commons API, **filtered to PD/CC0** and capped. This is how the general
  clip-art/artwork comes in, including openclipart's CC0 library (mirrored on Commons under `Category:Openclipart`).

Files are **sharded into buckets** (default 12) by a stable hash of the name. The generator treats each leaf directory
(`<category>/<pack>/<bucket>`) as one **split family**, assigned wholesale to train/val/test — so no pack straddles
splits, and the many buckets keep the 80/10/10 split balanced. (A tiny single-source fetch can land an empty val/test —
add more sources for a balanced split.) `corpus/manifest.json` and `corpus/LICENSES.md` record what was fetched.

## Sources & licenses

Default (verified, light): **icons** — Lucide, Tabler, Feather, Bootstrap Icons, Heroicons, Material Design Icons;
**brands** — Simple Icons; **flags** — flag-icons; **illustrations** — free-gophers-pack (git, CC0).

Opt-in (`--all`): **emoji** — OpenMoji (color, CC-BY-SA); **clipart** — openclipart (CC0, via Commons);
**general** — Wikimedia Commons (PD/CC0). These are the general, complex artwork closest to real vectorizer inputs.

> **Wikimedia/openclipart caveat:** the Commons API **rate-limits shared IPs** (CI, VPNs), so run those from your own
> machine, and they trickle in slowly (the fetcher is polite and capped). Only PD/CC0 files are kept; a broad Commons
> search is license-filtered, and `Category:Openclipart` is uniformly CC0.

Everything is permissive (MIT / ISC / Apache-2.0 / CC0), except OpenMoji (CC-BY-SA-4.0). Training on them is fine; if you
**redistribute** the corpus, honor each source's terms (listed in `corpus/LICENSES.md`). Add your own by appending to
[`sources.mjs`](sources.mjs) — any npm package, git repo, or Commons category/query works. And `--source dir` on the
generator accepts any folder of SVGs you supply yourself (e.g. a manual openclipart or SVG Repo bulk download).
