#!/usr/bin/env node
/**
 * Fetch a small set of public-domain scanned line drawings — engravings, patent
 * and technical drawings, botanical/anatomical plates — into a local,
 * git-ignored corpus, so the tracer comparison covers the line-art family on
 * more than one image (AGENTS.md: "one image proves nothing"). These are the
 * inputs where a bw threshold over-inks a faint tonal scan.
 *
 * Each file is a direct Wikimedia Commons upload URL (public domain or CC0),
 * pinned by sha256 so the corpus is reproducible and a changed upstream file is
 * caught rather than silently traced. Nothing is committed — the images are
 * third-party and fetched on demand for local benchmarking only; respect each
 * source's terms.
 *
 * Usage:  node scripts/eval/fetch-lineart-samples.mjs [--out scripts/eval/corpus-lineart]
 * Then:   npm run eval:tracers -- --data scripts/eval/corpus-lineart --montage
 *         npm run eval:ab      -- --data scripts/eval/corpus-lineart
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * name → { url, sha256, family, license }. Family tags mirror the vtracer
 * corpus (`lineart`); license records the public-domain / CC0 status of each
 * source file on Wikimedia Commons.
 */
const SAMPLES = {
  'crank_axle.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Locomotive_crank_axle_%28drawing%29.jpg',
    sha256: '8fb632881f3ecf6a9221409862abf6787ce08bb64ae6ff06a37bb978b72bb75c',
    family: 'lineart',
    license: 'CC0',
  },
  'marine_steam_plant.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Small_boat_marine_steam_plant_%28Rankin_Kennedy%2C_Modern_Engines%2C_Vol_VI%29.jpg',
    sha256: '47b61811d4e7c68618001a06dc7553f5a1b7cfb8fd8883f40ee034f31d0d8ef9',
    family: 'lineart',
    license: 'PD',
  },
  'double_acting_engine.png': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Double-acting_engine_at_Albion_Mills.png',
    sha256: 'a815ac2539acc74b951742b91316eb281c11f0a20621be33b00bcbf27b3a3b0b',
    family: 'lineart',
    license: 'PD',
  },
  'fowler_4f.png': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/89/LMS_Fowler_Class_4F_0-6-0_Freight_Engine_Nos_43835%E2%80%9344606_technical_drawing.png',
    sha256: 'b45fb989b99989f8522a58e0f9753effa1c5e41db6ea66b380003eb9cd260a99',
    family: 'lineart',
    license: 'PD',
  },
  'walton_chimney_patent.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Patent_Drawing_for_M._E._Walton%27s_Locomotive_and_Other_Chimneys_-_NARA_-_12007670.jpg',
    sha256: '2448e403abbe618774050a43a5d987645e1156ed2125e2fb3fdc07a23c38625e',
    family: 'lineart',
    license: 'PD',
  },
  'jones_locomotive_patent.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/A.C._Jones%27_Patent_Drawing_for_Improvement_in_Locomotive_engines%2C_Cars%2C_and_Carriages_used_on_Railroads_-_DPLA_-_12919b57994e720a726c2190ccee92c5.jpg',
    sha256: 'e9d5da6aeea50889cb79fbe957052ca751292bfb5c24d9663292be3b80a37f70',
    family: 'lineart',
    license: 'PD',
  },
  'kimber_patent.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Emmor_Kimber%27s_Patent_Drawing_for_Locomotive_Carriages_and_Rails_-_DPLA_-_97b3b05c528de8b8cbad0cb14a3b0f59.jpg',
    sha256: '4b262863bb848f78dc5a4e74fa33dba110e735ce171da3ed471fb9f86ea4ffdb',
    family: 'lineart',
    license: 'PD',
  },
  'camper_anatomy.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/35/The_Works_of_the_late_Professor_Camper%2C_on_The_Connexion_-sic-_between_the_Science_of_Anatomy_and_The_Arts_of_Drawing%2C_Painting%2C_Statuary_%26c._%26c._MET_DP102041.jpg',
    sha256: '5b41811c4c491c943257264e5f29d0bf2277d0c83ef52f730b6c0e67e40515a3',
    family: 'lineart',
    license: 'CC0',
  },
  'viola_tricolor.jpg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Botanical_illustration-_Viola_tricolor_MET_DP875311.jpg',
    sha256: 'e4af89e9c9dba5121b1bfef4e8b987b26ad18a9a37a890a41b5d8a52a4c6727b',
    family: 'lineart',
    license: 'CC0',
  },
}

function outArg(argv) {
  const i = argv.indexOf('--out')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'scripts/eval/corpus-lineart'
}

async function main() {
  const out = outArg(process.argv.slice(2))
  mkdirSync(out, { recursive: true })

  const families = {}
  let failures = 0
  // oxlint-disable no-await-in-loop -- sequential downloads: polite to the CDN, bounded memory
  for (const [name, spec] of Object.entries(SAMPLES)) {
    const r = await fetch(spec.url)
    if (!r.ok) {
      console.error(`  ! skip ${name}: HTTP ${r.status}`)
      failures++
      continue
    }
    const buf = Buffer.from(await r.arrayBuffer())
    const sha = createHash('sha256').update(buf).digest('hex')
    if (sha !== spec.sha256) {
      console.error(`  ! skip ${name}: sha256 mismatch (got ${sha.slice(0, 16)}…)`)
      failures++
      continue
    }
    writeFileSync(join(out, name), buf)
    families[name] = spec.family
    console.log(
      `  ${spec.family.padEnd(10)} ${spec.license.padEnd(3)} ${name}  (${Math.round(buf.length / 1024)} KB)`,
    )
  }
  // oxlint-enable no-await-in-loop
  writeFileSync(join(out, 'families.json'), `${JSON.stringify(families, null, 2)}\n`)
  console.log(`\n  ${Object.keys(families).length} images + families.json → ${out}`)
  if (failures > 0) {
    console.error(`\n  ${failures} file(s) failed — the corpus is incomplete.`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(`fetch failed: ${e.message}`)
  process.exit(1)
})
