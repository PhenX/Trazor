// English message catalog — the source-of-truth schema every other locale
// mirrors (`fr` is typed as `MessageSchema`, and a parity test asserts the key
// sets match). Interpolations use vue-i18n named syntax (`{count}`); a `a | b`
// value is a pluralized message chosen by the count passed to `t`.

export const en = {
  language: {
    label: 'Language',
    /** Endonyms — each language names itself. */
    en: 'English',
    fr: 'Français',
  },

  common: {
    apply: 'apply',
    cancel: 'cancel',
    dismiss: 'Dismiss',
  },

  app: {
    showPreview: 'Show preview',
    hidePreview: 'Hide preview',
  },

  header: {
    tagline: 'raster → SVG, entirely in your browser',
    home: 'Home',
    homeTitle: 'Back to the landing screen',
    open: 'Open',
    openTitle: 'Load another image (Ctrl+O)',
    whatsNew: "What's new",
    whatsNewTitleCount: "What's new — {count} since your last visit",
    whatsNewAriaCount: "What's new, {count} new since your last visit",
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
    github: 'View source on GitHub',
  },

  dropzone: {
    title: 'Drop an image, paste, or browse',
    formats: 'PNG · JPEG · WebP · GIF · BMP · AVIF · SVG — processed locally, nothing is uploaded',
    browse: 'Browse files',
    toPaste: 'to paste',
    orSample: 'or try a sample',
    dropReplace: 'Drop to replace',
    dropIt: 'Drop it',
    veilSub: 'the image is decoded and traced locally',
  },

  samples: {
    badge: { label: 'Badge', tagline: 'Flat logo · 960×960' },
    portrait: { label: 'Sunset', tagline: 'Photo-like · 640×640' },
    sprite: { label: 'Sprite', tagline: 'Pixel art · 24×24' },
    peaks: { label: 'Peaks', tagline: 'Flat color · 960×960' },
    ink: { label: 'Ink', tagline: 'Black & white · 960×960' },
    bloom: { label: 'Bloom', tagline: 'Illustration · 960×960' },
    mandala: { label: 'Mandala', tagline: 'Detailed B&W · 1280×1280' },
    degraded: { label: 'JPEG', tagline: 'Degraded raster · 960×960' },
  },

  panel: {
    targetProfile: 'Target profile',
    resetAll: 'Reset all',
    resetAllTitle: 'Reset every setting to its default',
    profileModifiedStar: 'Settings modified from this profile',
    autoSettings: 'Auto settings',
    autoSettingsTitle: 'Analyze the image and recommend settings',
    applyOnLoad: 'Apply automatically on load',
    applyOnLoadTitle: 'Analyze and apply recommended settings to each image as it loads',
    why: 'Why these settings',
    sectionMode: 'Mode',
    sectionInput: 'Input',
    sectionPalette: 'Palette',
    sectionThreshold: 'Threshold',
    sectionCurves: 'Curves',
    sectionCenterline: 'Centerline',
    sectionOutput: 'Output',
    advanced: 'Advanced',
  },

  modes: {
    color: { label: 'Color', title: 'Multi-color tracing with a quantized palette' },
    grayscale: { label: 'Gray', title: 'Grayscale layers' },
    bw: { label: 'B&W', title: 'Single-color silhouette from a threshold' },
    centerline: {
      label: 'Centerline',
      title:
        'One stroke down the middle of each drawn line — for line art & pen plotters, not filled shapes',
    },
  },

  settings: {
    maxSize: {
      label: 'Max size',
      hint: 'Longest side is downscaled to this many pixels before tracing. 0 keeps the original size.',
      zero: 'original',
    },
    denoise: {
      label: 'Denoise',
      hint: 'Pre-filter to remove noise before tracing',
      none: 'None',
      median: 'Median (dust & specks)',
      bilateral: 'Bilateral (photo noise)',
    },
    blur: {
      label: 'Blur',
      hint: 'Gaussian pre-blur radius (px). Helps noisy photos, hurts crisp art.',
    },
    background: {
      label: 'Background',
      hint: 'How transparent pixels are handled',
      auto: 'Auto detect',
      transparent: 'Treat alpha as empty',
      custom: 'Composite over color',
    },
    backdrop: {
      label: 'Backdrop',
      hint: 'The image is composited over this color first',
    },
    alphaCutoff: {
      label: 'Alpha cutoff',
      hint: 'Alpha below this counts as empty',
    },
    colors: {
      label: 'Colors',
      hint: 'Number of output colors',
    },
    autoReduce: {
      label: 'Auto reduce',
      hint: 'Merge near-duplicate colors so simple art gets fewer layers',
    },
    quality: {
      label: 'Quality',
      hint: 'Clustering effort — higher is slower and more accurate',
    },
    colorSpace: {
      label: 'Color space',
      hint: 'Clustering space — Oklab is almost always better',
      oklab: 'Oklab (perceptual)',
      rgb: 'RGB',
    },
    layering: {
      label: 'Layering',
      hint: 'How color layers relate to each other',
      stacked: 'Stacked',
      stackedSub: 'Seam-proof overdraw',
      stackedTitle: 'Layers are painted back-to-front and extend under each other',
      cutout: 'Cutout',
      cutoutSub: 'Exact edges, cut-ready',
      cutoutTitle: 'Exact partition with mathematically shared edges',
    },
    minRegion: {
      label: 'Min region',
      hint: 'Regions smaller than this many pixels are merged away',
    },
    keepDetails: {
      label: 'Keep details',
      hint: 'Keep small high-contrast features (e.g. a logo dot) instead of merging them away',
    },
    gapFill: {
      label: 'Gap fill',
      hint: 'Hairline-seam compensation stroke width (px) for cutout rendering',
      zero: 'off',
    },
    omitBackground: {
      label: 'Omit background',
      hint: 'Drop the layer matching the detected background color (stickers, cut files)',
    },
    groupByColor: {
      label: 'Group by color',
      hint: 'Wrap each color in its own layer group — one selectable sheet/screen per color for cutting or printing',
    },
    method: {
      label: 'Method',
      hint: 'How the ink / paper split is chosen',
      auto: 'Auto (Otsu)',
      fixed: 'Fixed level',
      adaptive: 'Adaptive (uneven light)',
    },
    level: {
      label: 'Level',
      hint: 'Pixels darker than this become ink',
    },
    radius: {
      label: 'Radius',
      hint: 'Window radius (px) for the local mean',
    },
    bias: {
      label: 'Bias',
      hint: 'Added to the local mean — positive keeps only clearly darker pixels',
    },
    invert: {
      label: 'Invert',
      hint: 'Trace light-on-dark artwork',
    },
    geometry: {
      label: 'Geometry',
      hint: 'Spline fits Béziers; pixel keeps every stair-step (pixel art)',
      spline: 'Smooth splines',
      polygon: 'Straight polygons',
      pixel: 'Exact pixel edges',
    },
    smoothing: {
      label: 'Smoothing',
      hint: '0 keeps every corner, 1 smooths aggressively',
    },
    optimize: {
      label: 'Optimize',
      hint: 'Merge adjacent curve segments when a single curve fits',
    },
    tolerance: {
      label: 'Tolerance',
      hint: 'Max deviation (px) allowed when merging curves',
    },
    turnPolicy: {
      label: 'Turn policy',
      hint: 'Ambiguity resolution at checkerboard junctions',
      minority: 'Minority',
      majority: 'Majority',
      black: 'Black',
      white: 'White',
      left: 'Left',
      right: 'Right',
    },
    simplify: {
      label: 'Simplify',
      hint: 'Pre-fit polyline simplification epsilon (px), open paths / polygon mode',
    },
    cornerAngle: {
      label: 'Corner angle',
      hint: 'Interior angle (°) below which an open-path vertex is pinned as a corner (centerline)',
    },
    fitTolerance: {
      label: 'Fit tolerance',
      hint: 'Max fitting error (px) for open-path Bézier fitting (centerline)',
    },
    strokeWidth: {
      label: 'Stroke width',
      hint: 'Output stroke width (px). 0 estimates it from the ink width.',
      zero: 'auto',
    },
    prune: {
      label: 'Prune',
      hint: 'Skeleton branches shorter than this (px) are removed as noise',
    },
    inkColor: {
      label: 'Ink color',
      hint: 'Paint color for B&W and centerline output',
    },
    precision: {
      label: 'Precision',
      hint: 'Decimal places for SVG coordinates',
    },
    minify: {
      label: 'Minify paths',
      hint: 'Compact path data with relative and H/V commands — identical shapes, smaller file',
    },
    units: {
      label: 'Units',
      hint: 'px for screens, mm for physical machines',
    },
    widthMm: {
      label: 'Width (mm)',
      hint: 'Physical width. 0 derives it from the pixel size at 96 dpi.',
      zero: '96 dpi',
    },
    title: {
      label: 'Title',
      hint: 'Embedded as the SVG <title>',
      placeholder: 'Untitled',
    },
    islandCheck: {
      label: 'Island check',
      hint: 'Warn about enclosed islands that would fall out of a physical stencil',
    },
    centerlineNote:
      'Traces one stroke down the middle of each drawn line — for line art, handwriting and pen plotters. On filled shapes or photos it returns a spidery skeleton, not matching outlines; use B&W or Color there.',
  },

  controls: {
    resetTitle: 'Modified — click to reset to default',
    resetAria: 'Reset to default',
    numericAria: '{label} (numeric)',
    colorPicker: '{label} color picker',
    hexValue: '{label} hex value',
  },

  palettes: {
    automatic: 'Automatic',
    automaticTitle: 'Extract the palette from the image with k-means',
    automaticMeta: 'k-means · {count} colors',
    updating: 'updating suggestions for this image…',
    addColor: 'Add a color',
    backToAuto: '× back to automatic',
    backToAutoTitle: 'Return to automatic palette extraction',
    editColor: 'Edit palette color {index}',
    removeColor: 'Remove palette color {index}',
    source: 'Palette source',
    exact: { label: 'Exact ({count})', description: 'Every color the image actually uses.' },
    balanced: {
      label: 'Balanced ({count})',
      description: 'Perceptual clustering at a comfortable size.',
    },
    bold: { label: 'Bold ({count})', description: 'Few strong tones — poster and print friendly.' },
    rich: { label: 'Rich ({count})', description: 'Wide tonal coverage for detailed art.' },
    vivid: {
      label: 'Vivid ({count})',
      description: 'The balanced palette with the saturation pushed.',
    },
    muted: { label: 'Muted ({count})', description: 'Soft, pastel take on the image colors.' },
    duotone: { label: 'Duotone', description: 'One ink over paper — riso / screen-print look.' },
    mono: { label: 'Mono ({count})', description: 'Neutral grayscale ramp.' },
  },

  ml: {
    title: 'Local ML tools',
    backendDetecting: 'detecting…',
    backendDetectingTitle: 'Probing WebGPU / WASM support',
    backendIdle: 'idle',
    backendIdleTitle: 'Backend not probed yet',
    backendWebgpu: 'WebGPU',
    backendWebgpuTitle: 'Hardware-accelerated inference',
    backendWasm: 'WASM',
    backendWasmTitle: 'CPU (WebAssembly) inference',
    backendUnavailable: 'unavailable',
    backendUnavailableTitle: 'ML is unavailable',
    removeBg: 'Remove background',
    removeBgBusy: 'Removing background…',
    removeBgTitle: 'Remove the background with a local U²-Net model',
    cleanup: 'Clean up (ML)',
    cleanupBusy: 'Cleaning up…',
    cleanupTitle:
      'ML cleanup — denoise / deblock the image before tracing (all modes; needs the cleanup model)',
    cleanupNote: 'Rewrites pixels for the tracer · needs the cleanup model.',
    magic: 'Magic select',
    magicActive: 'Magic select — active',
    magicTitle: 'Click regions to keep or exclude (SlimSAM)',
    magicHint: 'click = keep · alt / right-click = exclude',
    edge: 'Edge pre-pass (ML)',
    edgeActive: 'Edge pre-pass — on',
    edgeTitle:
      'ML edge pre-pass — protects thin features from despeckling on noisy input (all modes)',
    edgeNote: 'Applies to every mode · needs the edge-prepass model.',
    restore: '↺ Restore original',
    restoreTitle: 'Discard ML edits and trace the original image again',
    models: 'Models',
    cached: 'Cached:',
    cachedModels: 'no models | {count} model | {count} models',
    modelsNote: 'Models download once from their public source and run entirely on this device.',
    clearCache: 'Clear cache',
    phaseDownloading: 'Downloading model · {mb} MB',
    phaseCompiling: 'Compiling model',
    phaseRunning: 'Running',
    phasePreparing: 'Preparing',
  },

  sio: {
    title: 'Import / export',
    export: 'Export',
    exportTitle: 'Copy or save the current settings as JSON',
    import: 'Import',
    importTitle: 'Load settings from JSON or a file',
    exportedAria: 'Exported settings JSON',
    copyJson: 'Copy JSON',
    copyJsonTitle: 'Copy the JSON to the clipboard',
    saveFile: 'Save file',
    saveFileTitle: 'Download a .json file',
    versionNote: 'carries a version field (v{version})',
    importPlaceholder: 'Paste exported settings JSON here, or load a file…',
    importAria: 'Settings JSON to import',
    loadFile: 'Load file…',
    loadFileTitle: 'Load a settings .json file',
    apply: 'Apply',
    applyTitle: 'Replace the current settings with the pasted JSON',
  },

  preview: {
    modeAria: 'Preview mode',
    split: 'Split',
    result: 'Result',
    original: 'Original',
    diff: 'Diff',
    viewTitle: '{label} ({key})',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    fit: 'Fit',
    fitTitle: 'Fit image to view (F)',
    zoom100Title: 'Zoom to 100% (0)',
    toggleChecker: 'Toggle transparency checkerboard',
    showNodes: 'Show path nodes & outlines (N)',
    showNodesAria: 'Show path nodes and outlines',
    points: 'no points | {count} point | {count} points',
    errorTitle: 'Vectorization failed',
    retry: 'Retry',
    progress: '{stage} · {percent}%',
  },

  stats: {
    noImage: 'No image',
    tracedSize: 'Traced size after downscale',
    resultPalette: 'Result palette',
    swatchCopy: '{hex} — click to copy',
    paths: '{count} paths',
    pathsTitle: 'Paths',
    nodes: '{count} nodes',
    nodesTitle: 'Path nodes',
    colors: '{count} colors',
    colorsTitle: 'Colors',
    svgSizeTitle: 'SVG size',
    totalTimeTitle: 'Total tracing time — open for per-stage timings',
    match: 'match',
    fidelityTitle: 'Perceptual fidelity (mean ΔE in Oklab)',
    sourceSizeTitle: '{name} — {size}px',
  },

  layers: {
    title: 'Layers',
    show: 'Show layers',
    hide: 'Hide layers',
    summary: '{layers} layer | {layers} layers',
    summaryShapes: '{count} shape | {count} shapes',
    summaryNodes: '{count} nodes',
    empty: 'Layers appear here once the image is traced.',
    toggleContours: 'Show contours',
    rowTitle: 'Hover to highlight · click to pin',
    shapeCount: '{count} shape | {count} shapes',
    nodeCount: '{count} nodes',
    copyColor: 'Copy {hex}',
    pinned: 'Pinned',
    contour: 'Contour {index}',
    shapesNodes: '{shapes} shapes · {nodes} nodes',
    contourNodes: 'Contour {index} · {nodes} nodes',
  },

  exportBar: {
    copySvg: 'Copy SVG',
    copySvgTitle: 'Copy the SVG markup',
    copyDataUri: 'Copy data-URI',
    copyDataUriTitle: 'Copy as data: URI for img/src or CSS',
    download: 'Download SVG',
    downloadTitle: 'Download {name} (Ctrl+S)',
  },

  stages: {
    preprocess: 'Preprocess',
    palette: 'Palette',
    segment: 'Segment',
    trace: 'Trace',
    fit: 'Fit curves',
    svg: 'Write SVG',
  },

  shapes: {
    path: 'path | paths',
    rect: 'rect | rects',
    circle: 'circle | circles',
    ellipse: 'ellipse | ellipses',
    line: 'line | lines',
    polyline: 'polyline | polylines',
    polygon: 'polygon | polygons',
  },

  release: {
    title: "What's new",
    close: "Close what's new",
    new: 'New',
    feature: 'New feature',
    improvement: 'Improvement',
    fix: 'Fix',
    footNote: 'Notes are dated and numbered per day until versioning lands.',
    fullHistory: 'Full history',
  },

  warnings: {
    stencilIslands: {
      label: 'islands',
      message:
        '{count} enclosed island would fall out of a physical stencil — add bridges in your editor. | {count} enclosed islands would fall out of a physical stencil — add bridges in your editor.',
    },
    nodeCount: {
      label: 'nodes',
      message: '{count} nodes — consider more smoothing or a smaller max size for editing/cutting.',
    },
    emptyResult: {
      label: 'empty',
      message: 'No shapes were produced — check threshold/background settings.',
    },
    paletteClamped: {
      label: 'palette',
      message: 'Palette reduced to {count} colors (near-duplicates merged).',
    },
    tinyFeatures: {
      label: 'tiny',
      message: 'Smallest shape is ~{mm} mm — most blades/lasers cannot cut below 1 mm cleanly.',
    },
    centerlineInput: {
      label: 'centerline',
      message:
        'Centerline traces the middle of thin lines, but ~{percent}% of this image is filled — expect a skeleton, not matching outlines. Use B&W or Color mode for solid shapes.',
    },
    modeNote: {
      label: 'note',
      message: '{message}',
    },
  },

  rationale: {
    alpha: 'Transparent pixels found — they will produce no shapes.',
    pixelExact: 'Kept the {count} original colors exactly.',
    grayscale: 'Nearly grayscale — tracing as tonal grayscale layers.',
    richColor: 'Rich color content — using {count} palette entries.',
    distinctColors: '≈{count} distinct colors measured — {size} palette entries cover it.',
    photoTexture: 'Photographic texture detected — bilateral denoise keeps edges clean.',
    compressed:
      'Compression artifacts — denoise, light blur and speckle merge recover clean shapes.',
    largeSource: 'Large source — tracing at 1600 px for speed with no visible loss.',
    busyEdges: 'Busy edges — filtering specks below 8 px².',
    pickPixelArt: 'Small canvas with few flat colors — treating as pixel art.',
    pickBwSketch: 'Essentially two-tone with high contrast — black & white tracing fits best.',
    pickCompressedFlat: 'Compression noise over a few flat colors — cleaning up as flat art.',
    pickPhoto: 'Photographic content — posterized profile.',
    pickLogo: 'Flat shapes with few colors — logo profile with seam-free cutout layers.',
    pickIllustration: 'Mixed flat artwork — illustration profile.',
  },

  profiles: {
    illustration: {
      label: 'Illustration',
      tagline: 'Faithful multi-color art with smooth stacked layers',
      notes: [
        'Stacked layers: shapes extend under the ones above, so edges never crack.',
        'Raise the palette size if subtle shades disappear.',
      ],
    },
    photo: {
      label: 'Photo / Poster art',
      tagline: 'Posterized photographic look',
      notes: [
        'Bilateral denoise keeps edges while flattening sensor noise.',
        'Expect a stylized result: photographs cannot stay photographic as vectors.',
      ],
    },
    logo: {
      label: 'Logo / Flat design',
      tagline: 'Few colors, clean geometry, minimal nodes',
      notes: [
        'Seam-free cutout partition: shapes share exact boundaries, ideal for editing.',
        'Increase smoothing if corners look nicked; lower it for technical marks.',
      ],
    },
    poster: {
      label: 'Screen print',
      tagline: 'Bold spot-color separation',
      notes: [
        'Each color is its own <g> layer — one screen or riso pass per color.',
        'Use omit-background to leave paper color unprinted.',
      ],
    },
    'pixel-art': {
      label: 'Pixel art',
      tagline: 'Exact pixel boundaries, exact colors',
      notes: [
        'No smoothing and no resampling: every pixel edge is preserved.',
        'Colors are kept exact when the sprite has 64 or fewer.',
      ],
    },
    'bw-sketch': {
      label: 'Ink sketch',
      tagline: 'Black & white with automatic threshold',
      notes: ['Otsu picks the threshold; switch to adaptive for uneven lighting.'],
    },
    'vinyl-cut': {
      label: 'Vinyl cutter',
      tagline: 'Layered spot-color cut file, one sheet per color',
      notes: [
        'Multi-color: each stacked layer becomes its own <g> — cut it on that color of vinyl and stack the sheets.',
        'The most-outlining color is the full base sheet; the rest stack on it and extend underneath, so overlaps stay gap-free once weeded and layered.',
        'Enclosed details (an eye pupil) lift onto their own top layer, so the sheets beneath stay whole instead of carrying a hole.',
        'Auto-reduce keeps the sheet count low; raise Colors if a shade you need is missing.',
        'The backdrop color is dropped (no full backing sheet) — turn off Omit background to keep it.',
        'Millimeter units at 100% scale; raise Min region to drop specks a blade cannot weed.',
      ],
    },
    'laser-engrave': {
      label: 'Laser engrave',
      tagline: 'Filled engraving areas with crisp edges',
      notes: [
        'Solid fills engrave; add a separate hairline pass in your laser software to cut.',
        'Adaptive threshold rescues unevenly lit photos.',
      ],
    },
    'pen-plotter': {
      label: 'Pen plotter',
      tagline: 'Single-stroke centerlines instead of outlines',
      notes: [
        'Strokes follow the middle of each drawn line — one pen pass per line.',
        'Stroke width 0 estimates the pen width from the source line thickness.',
        'Best input: line drawings, handwriting, technical sketches.',
      ],
    },
    stencil: {
      label: 'Stencil',
      tagline: 'Cuttable single-color stencil with island warnings',
      notes: [
        'Enclosed islands (like the middle of an "O") fall out of a physical stencil — the checker flags them.',
        'Add bridges in a vector editor where islands are reported.',
      ],
    },
  },

  toasts: {
    couldNotLoad: 'Could not load image: {error}',
    couldNotBuildSample: 'Could not build sample: {error}',
    settingsImported: 'Settings imported',
    importFailed: 'Import failed: {error}',
    autoFailed: 'Auto settings failed: {error}',
    bgRemoved: 'Background removed — tracing the cutout',
    bgRemovedFailed: 'Background removal failed: {error}',
    cleanedUp: 'Cleaned up — tracing the denoised image',
    cleanupFailed: 'Cleanup unavailable: {error}',
    edgeUnavailable: 'Edge pre-pass unavailable: {error}',
    restoredOriginal: 'Restored the original image',
    selectionApplied: 'Selection applied — tracing the cutout',
    magicFailed: 'Magic select failed: {error}',
    modelCacheCleared: 'Model cache cleared',
    modelCacheFailed: 'Could not clear the model cache: {error}',
    hexCopied: '{hex} copied',
    clipboardUnavailable: 'Clipboard unavailable',
    svgCopied: 'SVG markup copied',
    dataUriCopied: 'Data URI copied',
    settingsCopied: 'Settings copied',
    settingsFileSaved: 'Settings file saved',
    couldNotReadFile: 'Could not read the file',
    dropImage: 'Drop an image file (PNG, JPEG, WebP, GIF, BMP, AVIF or SVG)',
  },
}

export type MessageSchema = typeof en
