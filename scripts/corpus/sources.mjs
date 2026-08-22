// Known, permissively-licensed SVG collections for the real-corpus half of the
// training data (docs/ML_STRATEGY.md: mix procedural + real). Each is published
// to npm, so the fetcher installs it into a cache and copies its .svg files out —
// no scraping, no auth, version pinned by npm, cross-platform.
//
// `dir` is the subdirectory under the installed package that holds the .svg files
// (''  = search the whole package). The fetcher falls back to a recursive search
// if `dir` yields nothing, so a layout change across versions won't break a run.
//
// LICENSES — training on these is fine; if you redistribute the corpus, keep each
// pack's terms. CC0/MIT/ISC/Apache are permissive; OFL is for fonts; OpenMoji is
// CC-BY-SA (share-alike). Attribution lives in the generated corpus/LICENSES.md.

/**
 * @typedef {{ category: string, id: string, pkg: string, version: string,
 *   dir: string, license: string, home: string, optional?: boolean }} Source
 */

/** @type {Source[]} */
export const SOURCES = [
  // Outline + filled icon sets — the bulk: clean, single-color, huge variety.
  {
    category: 'icons',
    id: 'lucide',
    pkg: 'lucide-static',
    version: 'latest',
    dir: 'icons',
    license: 'ISC',
    home: 'https://lucide.dev',
  },
  {
    category: 'icons',
    id: 'tabler',
    pkg: '@tabler/icons',
    version: 'latest',
    dir: 'icons',
    license: 'MIT',
    home: 'https://tabler.io/icons',
  },
  {
    category: 'icons',
    id: 'feather',
    pkg: 'feather-icons',
    version: 'latest',
    dir: 'dist/icons',
    license: 'MIT',
    home: 'https://feathericons.com',
  },
  {
    category: 'icons',
    id: 'bootstrap',
    pkg: 'bootstrap-icons',
    version: 'latest',
    dir: 'icons',
    license: 'MIT',
    home: 'https://icons.getbootstrap.com',
  },
  {
    category: 'icons',
    id: 'heroicons',
    pkg: 'heroicons',
    version: 'latest',
    dir: '',
    license: 'MIT',
    home: 'https://heroicons.com',
  },
  // Material Design Icons — very large (~7k). Great variety; heavy download.
  {
    category: 'icons',
    id: 'mdi',
    pkg: '@mdi/svg',
    version: 'latest',
    dir: 'svg',
    license: 'Apache-2.0',
    home: 'https://pictogrammers.com/library/mdi',
    heavy: true,
  },

  // Brand marks — flat, geometric, distinctive silhouettes.
  {
    category: 'brands',
    id: 'simple-icons',
    pkg: 'simple-icons',
    version: 'latest',
    dir: 'icons',
    license: 'CC0-1.0',
    home: 'https://simpleicons.org',
  },

  // Country flags — multi-color, gradients, stripes: good for color/cleanup.
  {
    category: 'flags',
    id: 'flag-icons',
    pkg: 'flag-icons',
    version: 'latest',
    dir: 'flags/4x3',
    license: 'MIT',
    home: 'https://flagicons.lipis.dev',
  },

  // Emoji — colorful, complex paths. Large + CC-BY-SA, so off by default (--all).
  {
    category: 'emoji',
    id: 'openmoji',
    pkg: 'openmoji',
    version: 'latest',
    dir: '',
    license: 'CC-BY-SA-4.0',
    home: 'https://openmoji.org',
    optional: true,
  },
]
