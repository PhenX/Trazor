/**
 * Build the icon corpus the inkvec comparison (`eval:inkvec`) is measured on,
 * from a checkout of inkvec's own benchmark data, so every measurement runs on
 * the same 88 images: 38 at 512 px (Lucide, Material, Simple Icons, Noto,
 * Twemoji, OpenMoji, two synthetics) and 50 at 128 px (the same sets plus
 * Fluent and eight synthetics). An icon's raster is inkvec's own render when
 * its data carries that tier (every set has a 128 px tier), else the source
 * SVG rendered with resvg at the tier's width; the source SVG is the truth.
 *
 *   node scripts/eval/inkvec-corpus.mjs --inkvec <inkvec checkout> [--out eval-artifacts/corpus-inkvec]
 *
 * Writes `<out>/512` and `<out>/128`, each with `<set>__<name>.png`, a
 * `families.json` tag map and `truth/<set>__<name>.svg` — the layout
 * `inkvec-compare.ts --data` reads. Nothing is committed: the sets' licenses
 * vary (see inkvec's `bench/data/manifest.csv`).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const CORPUS = {
  512: [
    'lucide__badge-russian-ruble',
    'lucide__bell',
    'lucide__cooking-pot',
    'lucide__messages-square',
    'lucide__navigation-2-off',
    'lucide__panel-right',
    'material-icons__admin_panel_settings',
    'material-icons__crop_landscape',
    'material-icons__rule_folder',
    'material-icons__sms_failed',
    'material-icons__table_rows',
    'material-icons__transfer_within_a_station',
    'noto-emoji__emoji_u1f468_1f3ff_200d_1f393',
    'noto-emoji__emoji_u1f90d',
    'noto-emoji__emoji_u1f932',
    'noto-emoji__emoji_u1f9d6_1f3fe_200d_2642',
    'noto-emoji__emoji_u1f9ed',
    'noto-emoji__emoji_u1faf1_1f3fc_200d_1faf2_1f3ff',
    'openmoji__1F361',
    'openmoji__1F481-1F3FB-200D-2642-FE0F',
    'openmoji__1F646-1F3FC',
    'openmoji__1F938-1F3FB',
    'openmoji__1F9B3',
    'openmoji__25FC',
    'simple-icons__fluxer',
    'simple-icons__microeditor',
    'simple-icons__redsys',
    'simple-icons__sparkar',
    'simple-icons__stmicroelectronics',
    'simple-icons__wxt',
    'synthetic__gradient_linear',
    'synthetic__prim_star5',
    'twemoji__1f325',
    'twemoji__1f369',
    'twemoji__1f468-1f3fe-200d-2764-fe0f-200d-1f48b-200d-1f468-1f3ff',
    'twemoji__1f646-1f3fb-200d-2640-fe0f',
    'twemoji__1f6d6',
    'twemoji__1f9d1-1f3fd-200d-1f9af-200d-27a1-fe0f',
  ],
  128: [
    'fluent-emoji__Chestnut_Color_chestnut_color',
    'fluent-emoji__Coat_Color_coat_color',
    'fluent-emoji__Hundred_points_Color_hundred_points_color',
    'fluent-emoji__Man_in_steamy_room_Light_Color_man_in_steamy_room_color_light',
    'fluent-emoji__Man_mechanic_Dark_Color_man_mechanic_color_dark',
    'fluent-emoji__Man_singer_Medium-Light_Color_man_singer_color_medium-light',
    'lucide__church',
    'lucide__cloud-drizzle',
    'lucide__cooking-pot',
    'lucide__feather',
    'lucide__globe',
    'lucide__messages-square',
    'material-icons__apps_outage',
    'material-icons__backspace',
    'material-icons__mode_fan_off',
    'material-icons__subtitles_off',
    'material-icons__text_rotate_up',
    'material-icons__view_compact_alt',
    'noto-emoji__emoji_u1f469_1f3fb_200d_1f430_200d_1f469_1f3fe',
    'noto-emoji__emoji_u1f478_1f3fd',
    'noto-emoji__emoji_u1f926_1f3fb_200d_2640',
    'noto-emoji__emoji_u1f933_1f3fd',
    'noto-emoji__emoji_u1f9d6_1f3fe_200d_2642',
    'noto-emoji__emoji_u1f9ed',
    'openmoji__1F3C4-1F3FF-200D-2640-FE0F',
    'openmoji__1F469-1F3FE-200D-2764-FE0F-200D-1F469-1F3FB',
    'openmoji__1F64E-200D-2642-FE0F',
    'openmoji__1F964',
    'openmoji__1F9B8-1F3FF',
    'openmoji__1F9D1-1F3FC-200D-1F91D-200D-1F9D1-1F3FC',
    'simple-icons__beijingsubway',
    'simple-icons__bulma',
    'simple-icons__openbao',
    'simple-icons__protocolsdotio',
    'simple-icons__redsys',
    'simple-icons__v2ex',
    'synthetic__gradient_linear',
    'synthetic__gradient_radial',
    'synthetic__logo_like',
    'synthetic__mosaic_pie6',
    'synthetic__prim_circle',
    'synthetic__prim_roundrect',
    'synthetic__prim_star5',
    'synthetic__thin_features',
    'twemoji__1f574-1f3fd-200d-2642-fe0f',
    'twemoji__1f93e-1f3fd',
    'twemoji__1f93e-1f3ff',
    'twemoji__1f9b8-1f3ff-200d-2640-fe0f',
    'twemoji__1f9d1-1f3fc-200d-1f430-200d-1f9d1-1f3ff',
    'twemoji__1fabc',
  ],
}

function parseArgs(argv) {
  const a = { inkvec: '', out: 'eval-artifacts/corpus-inkvec' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--inkvec') a.inkvec = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
  }
  if (!a.inkvec) {
    console.error(
      'usage: node scripts/eval/inkvec-corpus.mjs --inkvec <inkvec checkout> [--out <dir>]',
    )
    process.exit(2)
  }
  return a
}

const args = parseArgs(process.argv.slice(2))
const data = resolve(args.inkvec, 'bench', 'data')
if (!existsSync(join(data, 'corpus_svg'))) {
  console.error(`no benchmark data under ${data} — pass the root of an inkvec checkout`)
  process.exit(2)
}

for (const [tier, names] of Object.entries(CORPUS)) {
  const out = resolve(args.out, tier)
  mkdirSync(join(out, 'truth'), { recursive: true })
  const families = {}
  let copied = 0
  let rendered = 0
  for (const name of names) {
    const at = name.indexOf('__')
    const family = name.slice(0, at)
    const base = name.slice(at + 2)
    const svg = join(data, 'corpus_svg', family, `${base}.svg`)
    if (!existsSync(svg)) throw new Error(`missing source: ${svg}`)
    copyFileSync(svg, join(out, 'truth', `${name}.svg`))
    const raster = join(data, 'corpus_raster', family, tier, `${base}.png`)
    const png = join(out, `${name}.png`)
    if (existsSync(raster)) {
      copyFileSync(raster, png)
      copied++
    } else {
      const r = new Resvg(readFileSync(svg, 'utf8'), {
        fitTo: { mode: 'width', value: Number(tier) },
      })
      writeFileSync(png, r.render().asPng())
      rendered++
    }
    families[`${name}.png`] = family
  }
  writeFileSync(join(out, 'families.json'), `${JSON.stringify(families, null, 1)}\n`)
  console.log(
    `${tier} px: ${names.length} icons → ${out} (${copied} copied from inkvec, ${rendered} rendered)`,
  )
}
