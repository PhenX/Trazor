import type { MessageSchema } from './en'

// French message catalog. Typed as `MessageSchema` so the key set stays in
// lockstep with `en` (a missing or extra key is a type error); a parity test
// guards it at runtime too. Technical terms (Oklab, RGB, SVG, WebGPU, Bézier,
// riso, dpi…) are kept as-is by convention.

export const fr: MessageSchema = {
  language: {
    label: 'Langue',
    en: 'English',
    fr: 'Français',
  },

  common: {
    apply: 'appliquer',
    cancel: 'annuler',
    dismiss: 'Ignorer',
  },

  app: {
    showPreview: 'Afficher l’aperçu',
    hidePreview: 'Masquer l’aperçu',
  },

  header: {
    tagline: 'raster → SVG, entièrement dans votre navigateur',
    home: 'Accueil',
    homeTitle: "Retour à l'écran d'accueil",
    open: 'Ouvrir',
    openTitle: 'Charger une autre image (Ctrl+O)',
    whatsNew: 'Nouveautés',
    whatsNewTitleCount: 'Nouveautés — {count} depuis votre dernière visite',
    whatsNewAriaCount: 'Nouveautés, {count} nouvelles depuis votre dernière visite',
    toLight: 'Passer au thème clair',
    toDark: 'Passer au thème sombre',
    github: 'Voir le code source sur GitHub',
  },

  dropzone: {
    title: 'Déposez une image, collez ou parcourez',
    formats: 'PNG · JPEG · WebP · GIF · BMP · AVIF · SVG — traité localement, rien n’est envoyé',
    browse: 'Parcourir les fichiers',
    toPaste: 'pour coller',
    orSample: 'ou essayez un exemple',
    dropReplace: 'Déposez pour remplacer',
    dropIt: 'Déposez',
    veilSub: 'l’image est décodée et vectorisée localement',
  },

  samples: {
    badge: { label: 'Badge', tagline: 'Logo plat · 960×960' },
    portrait: { label: 'Coucher de soleil', tagline: 'Type photo · 640×640' },
    sprite: { label: 'Sprite', tagline: 'Pixel art · 24×24' },
    peaks: { label: 'Sommets', tagline: 'Aplats · 960×960' },
    ink: { label: 'Encre', tagline: 'Noir et blanc · 960×960' },
    bloom: { label: 'Floraison', tagline: 'Illustration · 960×960' },
    mandala: { label: 'Mandala', tagline: 'N&B détaillé · 1280×1280' },
    confetti: { label: 'Confettis', tagline: 'Motif dense · 960×960' },
    degraded: { label: 'JPEG', tagline: 'Raster dégradé · 960×960' },
  },

  panel: {
    targetProfile: 'Profil cible',
    resetAll: 'Tout réinitialiser',
    resetAllTitle: 'Réinitialiser tous les réglages par défaut',
    profileModifiedStar: 'Réglages modifiés par rapport à ce profil',
    autoSettings: 'Réglages auto',
    autoSettingsTitle: 'Analyser l’image et recommander des réglages',
    applyOnLoad: 'Appliquer automatiquement au chargement',
    applyOnLoadTitle: 'Analyser et appliquer les réglages recommandés à chaque image chargée',
    why: 'Pourquoi ces réglages',
    sectionMode: 'Mode',
    sectionInput: 'Entrée',
    sectionPalette: 'Palette',
    sectionThreshold: 'Seuil',
    sectionCurves: 'Courbes',
    sectionCenterline: 'Ligne médiane',
    sectionOutput: 'Sortie',
    advanced: 'Avancé',
  },

  modes: {
    color: { label: 'Couleur', title: 'Vectorisation multicolore avec palette quantifiée' },
    grayscale: { label: 'Gris', title: 'Calques en niveaux de gris' },
    bw: { label: 'N&B', title: 'Silhouette monochrome à partir d’un seuil' },
    centerline: {
      label: 'Médiane',
      title:
        'Un trait au milieu de chaque ligne dessinée — pour le trait et les traceurs à plume, pas les formes pleines',
    },
  },

  settings: {
    maxSize: {
      label: 'Taille max',
      hint: 'Le plus grand côté est réduit à ce nombre de pixels avant vectorisation. 0 conserve la taille d’origine.',
      zero: 'origine',
    },
    denoise: {
      label: 'Débruitage',
      hint: 'Pré-filtre pour supprimer le bruit avant vectorisation',
      none: 'Aucun',
      median: 'Médian (poussières & points)',
      bilateral: 'Bilatéral (bruit photo)',
    },
    blur: {
      label: 'Flou',
      hint: 'Rayon de pré-flou gaussien (px). Aide les photos bruitées, nuit au trait net.',
    },
    background: {
      label: 'Arrière-plan',
      hint: 'Traitement des pixels transparents',
      auto: 'Détection auto',
      transparent: 'Traiter l’alpha comme vide',
      custom: 'Composer sur une couleur',
    },
    backdrop: {
      label: 'Fond',
      hint: 'L’image est d’abord composée sur cette couleur',
    },
    alphaCutoff: {
      label: 'Seuil alpha',
      hint: 'Un alpha inférieur est considéré comme vide',
    },
    segmentation: {
      label: 'Segmentation',
      hint: 'Comment les pixels deviennent des régions plates. La croissance de régions garde nets les bords anticrénelés des dessins plats ; la palette globale convient aux photos et dégradés',
      quantize: 'Palette globale',
      regions: 'Croissance de régions',
    },
    colors: {
      label: 'Couleurs',
      hint: 'Nombre de couleurs en sortie',
    },
    autoReduce: {
      label: 'Réduction auto',
      hint: 'Fusionne les couleurs quasi identiques pour réduire les calques d’un dessin simple',
    },
    quality: {
      label: 'Qualité',
      hint: 'Effort de clustering — plus élevé est plus lent et plus précis',
    },
    colorSpace: {
      label: 'Espace colorimétrique',
      hint: 'Espace de clustering — Oklab est presque toujours meilleur',
      oklab: 'Oklab (perceptuel)',
      rgb: 'RGB',
    },
    layering: {
      label: 'Calquage',
      hint: 'Comment les calques de couleur se rapportent entre eux',
      stacked: 'Empilé',
      stackedSub: 'Surimpression sans jointure',
      stackedTitle: 'Les calques sont peints d’arrière en avant et s’étendent l’un sous l’autre',
      cutout: 'Découpe',
      cutoutSub: 'Bords exacts, prêts à découper',
      cutoutTitle: 'Partition exacte aux bords partagés mathématiquement',
    },
    minRegion: {
      label: 'Région min',
      hint: 'Les régions plus petites que ce nombre de pixels sont fusionnées',
    },
    keepDetails: {
      label: 'Garder les détails',
      hint: 'Conserver les petits détails très contrastés (p. ex. un point de logo) au lieu de les fusionner',
    },
    gradients: {
      label: 'Remplissages dégradés',
      beta: 'Bêta',
      hint: 'Bêta — désactivé par défaut. Peindre les dégradés de couleur avec un seul dégradé SVG au lieu de bandes posterisées (idéal pour photos, ciels, ombrages doux). La détection reste imparfaite sur certaines images, vérifiez le résultat. Pas pour la découpe/impression en tons directs.',
    },
    gradientStrength: {
      label: 'Force des dégradés',
      hint: 'Avec quelle facilité les régions deviennent des dégradés. Plus bas ne garde que les rampes nettes et contrastées (les formes plates restent plates) ; plus haut en capte de plus subtiles — augmentez pour en avoir plus, baissez si des zones plates deviennent des dégradés par erreur.',
    },
    gradientMinArea: {
      label: 'Aire min. des dégradés',
      hint: 'Les régions plus petites que ceci (px) restent plates. Auto en dérive un seuil depuis Région min ; augmentez pour limiter les dégradés aux grandes zones lisses.',
      zero: 'auto',
    },
    gapFill: {
      label: 'Comblement',
      hint: 'Largeur du trait de compensation des jointures fines (px) pour le rendu en découpe',
      zero: 'désactivé',
    },
    omitBackground: {
      label: 'Omettre le fond',
      hint: 'Supprimer le calque correspondant à la couleur de fond détectée (autocollants, fichiers de découpe)',
    },
    groupByColor: {
      label: 'Grouper par couleur',
      hint: 'Envelopper chaque couleur dans son propre groupe de calque — une feuille/un écran sélectionnable par couleur pour la découpe ou l’impression',
    },
    method: {
      label: 'Méthode',
      hint: 'Comment le partage encre / papier est choisi',
      auto: 'Auto (Otsu)',
      fixed: 'Niveau fixe',
      adaptive: 'Adaptatif (éclairage inégal)',
    },
    level: {
      label: 'Niveau',
      hint: 'Les pixels plus sombres que ceci deviennent de l’encre',
    },
    radius: {
      label: 'Rayon',
      hint: 'Rayon de fenêtre (px) pour la moyenne locale',
    },
    bias: {
      label: 'Biais',
      hint: 'Ajouté à la moyenne locale — positif ne garde que les pixels nettement plus sombres',
    },
    invert: {
      label: 'Inverser',
      hint: 'Vectoriser un dessin clair sur fond sombre',
    },
    geometry: {
      label: 'Géométrie',
      hint: 'La spline ajuste des Béziers ; pixel conserve chaque marche d’escalier (pixel art)',
      spline: 'Splines lisses',
      polygon: 'Polygones droits',
      pixel: 'Bords de pixels exacts',
    },
    smoothing: {
      label: 'Lissage',
      hint: '0 garde chaque angle, 1 lisse fortement',
    },
    optimize: {
      label: 'Optimiser',
      hint: 'Fusionner les segments de courbe adjacents quand une seule courbe convient',
    },
    tolerance: {
      label: 'Tolérance',
      hint: 'Écart max (px) autorisé lors de la fusion des courbes',
    },
    turnPolicy: {
      label: 'Politique de virage',
      hint: 'Résolution d’ambiguïté aux jonctions en damier',
      minority: 'Minorité',
      majority: 'Majorité',
      black: 'Noir',
      white: 'Blanc',
      left: 'Gauche',
      right: 'Droite',
    },
    simplify: {
      label: 'Simplifier',
      hint: 'Epsilon de simplification de polyligne avant ajustement (px), chemins ouverts / mode polygone',
    },
    cornerAngle: {
      label: 'Angle de coin',
      hint: 'Angle intérieur (°) sous lequel un sommet de chemin ouvert est fixé comme coin (médiane)',
    },
    fitTolerance: {
      label: 'Tolérance d’ajustement',
      hint: 'Erreur d’ajustement max (px) pour l’ajustement Bézier de chemin ouvert (médiane)',
    },
    strokeWidth: {
      label: 'Largeur de trait',
      hint: 'Largeur de trait en sortie (px). 0 l’estime d’après la largeur de l’encre.',
      zero: 'auto',
    },
    prune: {
      label: 'Élaguer',
      hint: 'Les branches du squelette plus courtes que ceci (px) sont retirées comme du bruit',
    },
    inkColor: {
      label: 'Couleur d’encre',
      hint: 'Couleur de peinture pour la sortie N&B et médiane',
    },
    precision: {
      label: 'Précision',
      hint: 'Décimales des coordonnées SVG',
    },
    minify: {
      label: 'Minifier les chemins',
      hint: 'Compacter les données de chemin avec des commandes relatives et H/V — formes identiques, fichier plus petit',
    },
    units: {
      label: 'Unités',
      hint: 'px pour les écrans, mm pour les machines physiques',
    },
    widthMm: {
      label: 'Largeur (mm)',
      hint: 'Largeur physique. 0 la déduit de la taille en pixels à 96 dpi.',
      zero: '96 dpi',
    },
    title: {
      label: 'Titre',
      hint: 'Intégré comme <title> du SVG',
      placeholder: 'Sans titre',
    },
    islandCheck: {
      label: 'Vérif. des îlots',
      hint: 'Avertir des îlots enclavés qui tomberaient d’un pochoir physique',
    },
    centerlineNote:
      'Trace un seul trait au milieu de chaque ligne dessinée — pour le trait, l’écriture manuscrite et les traceurs à plume. Sur des formes pleines ou des photos, cela donne un squelette filiforme, sans contours correspondants ; utilisez N&B ou Couleur dans ce cas.',
  },

  controls: {
    resetTitle: 'Modifié — cliquez pour réinitialiser par défaut',
    resetAria: 'Réinitialiser par défaut',
    numericAria: '{label} (numérique)',
    colorPicker: 'Sélecteur de couleur {label}',
    hexValue: 'Valeur hex {label}',
  },

  palettes: {
    automatic: 'Automatique',
    automaticTitle: 'Extraire la palette de l’image avec k-means',
    automaticMeta: 'k-means · {count} couleurs',
    updating: 'mise à jour des suggestions pour cette image…',
    addColor: 'Ajouter une couleur',
    backToAuto: '× revenir à automatique',
    backToAutoTitle: 'Revenir à l’extraction automatique de la palette',
    editColor: 'Modifier la couleur de palette {index}',
    removeColor: 'Supprimer la couleur de palette {index}',
    source: 'Source de la palette',
    exact: {
      label: 'Exact ({count})',
      description: 'Toutes les couleurs réellement utilisées par l’image.',
    },
    balanced: {
      label: 'Équilibré ({count})',
      description: 'Clustering perceptuel à une taille confortable.',
    },
    bold: {
      label: 'Marqué ({count})',
      description: 'Peu de tons forts — adapté à l’affiche et l’impression.',
    },
    rich: {
      label: 'Riche ({count})',
      description: 'Large couverture tonale pour les dessins détaillés.',
    },
    vivid: {
      label: 'Vif ({count})',
      description: 'La palette équilibrée avec la saturation poussée.',
    },
    muted: {
      label: 'Adouci ({count})',
      description: 'Version douce et pastel des couleurs de l’image.',
    },
    duotone: { label: 'Duotone', description: 'Une encre sur papier — rendu riso / sérigraphie.' },
    mono: { label: 'Mono ({count})', description: 'Dégradé de gris neutre.' },
  },

  ml: {
    title: 'Outils ML locaux',
    backendDetecting: 'détection…',
    backendDetectingTitle: 'Test de la prise en charge WebGPU / WASM',
    backendIdle: 'inactif',
    backendIdleTitle: 'Backend pas encore testé',
    backendWebgpu: 'WebGPU',
    backendWebgpuTitle: 'Inférence accélérée par le matériel',
    backendWasm: 'WASM',
    backendWasmTitle: 'Inférence CPU (WebAssembly)',
    backendUnavailable: 'indisponible',
    backendUnavailableTitle: 'Le ML est indisponible',
    removeBg: 'Supprimer le fond',
    removeBgBusy: 'Suppression du fond…',
    removeBgTitle: 'Supprimer l’arrière-plan avec un modèle U²-Net local',
    cleanup: 'Nettoyer (ML)',
    cleanupBusy: 'Nettoyage…',
    cleanupTitle:
      'Nettoyage ML — débruiter / déblocer l’image avant vectorisation (tous modes ; nécessite le modèle de nettoyage)',
    cleanupNote: 'Réécrit les pixels pour le vectoriseur · nécessite le modèle de nettoyage.',
    magic: 'Sélection magique',
    magicActive: 'Sélection magique — active',
    magicTitle: 'Cliquez sur les régions à garder ou exclure (SlimSAM)',
    magicHint: 'clic = garder · alt / clic droit = exclure',
    edge: 'Pré-passe de bords (ML)',
    edgeActive: 'Pré-passe de bords — activée',
    edgeTitle:
      'Pré-passe de bords ML — protège les détails fins du débruitage sur entrée bruitée (tous modes)',
    edgeNote: 'S’applique à tous les modes · nécessite le modèle de pré-passe de bords.',
    restore: '↺ Restaurer l’original',
    restoreTitle: 'Annuler les modifications ML et revectoriser l’image d’origine',
    models: 'Modèles',
    cached: 'En cache :',
    cachedModels: 'aucun modèle | {count} modèle | {count} modèles',
    modelsNote:
      'Les modèles sont téléchargés une fois depuis leur source publique et s’exécutent entièrement sur cet appareil.',
    clearCache: 'Vider le cache',
    phaseDownloading: 'Téléchargement du modèle · {mb} Mo',
    phaseCompiling: 'Compilation du modèle',
    phaseRunning: 'Exécution',
    phasePreparing: 'Préparation',
  },

  sio: {
    title: 'Import / export',
    export: 'Exporter',
    exportTitle: 'Copier ou enregistrer les réglages actuels en JSON',
    import: 'Importer',
    importTitle: 'Charger des réglages depuis du JSON ou un fichier',
    exportedAria: 'JSON des réglages exportés',
    copyJson: 'Copier le JSON',
    copyJsonTitle: 'Copier le JSON dans le presse-papiers',
    saveFile: 'Enregistrer',
    saveFileTitle: 'Télécharger un fichier .json',
    versionNote: 'contient un champ de version (v{version})',
    importPlaceholder: 'Collez ici le JSON des réglages exportés, ou chargez un fichier…',
    importAria: 'JSON de réglages à importer',
    loadFile: 'Charger un fichier…',
    loadFileTitle: 'Charger un fichier .json de réglages',
    apply: 'Appliquer',
    applyTitle: 'Remplacer les réglages actuels par le JSON collé',
  },

  preview: {
    modeAria: 'Mode d’aperçu',
    split: 'Divisé',
    result: 'Résultat',
    original: 'Original',
    diff: 'Diff',
    viewTitle: '{label} ({key})',
    zoomOut: 'Zoom arrière',
    zoomIn: 'Zoom avant',
    fit: 'Ajuster',
    fitTitle: 'Ajuster l’image à la vue (F)',
    zoom100Title: 'Zoom à 100 % (0)',
    toggleChecker: 'Basculer le damier de transparence',
    showNodes: 'Afficher les nœuds et contours (N)',
    showNodesAria: 'Afficher les nœuds et contours des chemins',
    points: 'aucun point | {count} point | {count} points',
    errorTitle: 'Échec de la vectorisation',
    retry: 'Réessayer',
    progress: '{stage} · {percent} %',
  },

  stats: {
    noImage: 'Aucune image',
    tracedSize: 'Taille vectorisée après réduction',
    resultPalette: 'Palette du résultat',
    swatchCopy: '{hex} — cliquez pour copier',
    paths: '{count} chemins',
    pathsTitle: 'Chemins',
    nodes: '{count} nœuds',
    nodesTitle: 'Nœuds de chemin',
    colors: '{count} couleurs',
    colorsTitle: 'Couleurs',
    svgSizeTitle: 'Taille du SVG',
    totalTimeTitle: 'Temps de vectorisation total — ouvrez pour le détail par étape',
    match: 'correspondance',
    fidelityTitle: 'Fidélité perceptuelle (ΔE moyen en Oklab)',
    sourceSizeTitle: '{name} — {size}px',
  },

  layers: {
    title: 'Calques',
    show: 'Afficher les calques',
    hide: 'Masquer les calques',
    summary: '{layers} calque | {layers} calques',
    summaryShapes: '{count} forme | {count} formes',
    summaryNodes: '{count} nœuds',
    empty: 'Les calques apparaissent ici une fois l’image vectorisée.',
    toggleContours: 'Afficher les contours',
    rowTitle: 'Survoler pour mettre en évidence · cliquer pour épingler',
    shapeCount: '{count} forme | {count} formes',
    nodeCount: '{count} nœuds',
    copyColor: 'Copier {hex}',
    pinned: 'Épinglé',
    contour: 'Contour {index}',
    shapesNodes: '{shapes} formes · {nodes} nœuds',
    contourNodes: 'Contour {index} · {nodes} nœuds',
  },

  tune: {
    open: 'Optimisation auto',
    openTitle: 'Rechercher les meilleurs réglages pour cette image et vos priorités',
    title: 'Optimisation auto',
    subtitle: "Explorer l'espace des réglages pour cette image",
    close: 'Fermer',
    priorities: 'Ce qui compte pour vous',
    obj: {
      fidelity: 'Fidélité',
      simplicity: 'Simplicité',
      fileSize: 'Taille du fichier',
      colorEconomy: 'Moins de couleurs',
      cleanliness: 'Propreté',
    },
    objHint: {
      fidelity: "Fidélité du résultat par rapport à l'original",
      simplicity: 'Moins de nœuds et de chemins — plus facile à éditer et découper',
      fileSize: 'Sortie SVG plus légère',
      colorEconomy: 'Moins de couleurs — moins de passes ou de feuilles de vinyle',
      cleanliness: 'Moins d’avertissements (détails minuscules, îlots de pochoir)',
    },
    presets: 'Préréglages',
    preset: {
      maxFidelity: 'Fidélité max',
      balanced: 'Équilibré',
      smallestFile: 'Fichier minimal',
      cutReady: 'Prêt à découper',
    },
    iterations: 'Itérations',
    iterationsHint: 'Nombre de combinaisons de réglages à essayer',
    advanced: 'Avancé',
    minFidelity: 'Fidélité minimale',
    minFidelityHint: 'Rejeter tout candidat sous cette fidélité (0 = désactivé)',
    explorePreprocess: 'Explorer le prétraitement',
    explorePreprocessHint:
      'Faire aussi varier le flou et le débruitage — plus lent, recalcule chaque candidat',
    exploreStructural: 'Explorer la structure',
    exploreStructuralHint:
      'Essayer aussi polygone/spline, empilé/découpe et la méthode de segmentation',
    start: 'Lancer la recherche',
    stop: 'Arrêter',
    running: 'Recherche…',
    workers: '{count} processus',
    best: 'Meilleur',
    applyBest: 'Appliquer le meilleur',
    revert: 'Rétablir',
    reverted: 'Réglages rétablis',
    appliedToast: 'Réglages appliqués, score {score}%',
    revertedToast: 'Réglages d’origine rétablis',
    error: 'Échec de la recherche : {error}',
    convergedNote: 'Convergence anticipée — aucun gain supplémentaire trouvé.',
    sortBy: 'Trier',
    sort: {
      score: 'Score',
      fidelity: 'Fidélité',
      nodes: 'Nœuds',
      bytes: 'Taille',
      colors: 'Couleurs',
    },
    paretoOnly: 'Meilleurs compromis',
    paretoOnlyHint: 'N’afficher que les candidats non dominés',
    compareZoom: 'Zoom comparatif',
    compareZoomHint:
      'Grossir la même zone sur chaque candidat — déplacer pour naviguer, molette pour zoomer',
    source: 'Original',
    applied: 'Appliqué',
    apply: 'Appliquer ces réglages',
    baseline: 'Vos réglages',
    inspectTitle: "Comparer avec l'original",
    candidate: 'Candidat',
    prev: 'Candidat précédent',
    next: 'Candidat suivant',
    position: '{index} sur {total}',
    tileScore: '{score}%',
    tileNodes: '{count} nœuds',
    tileColors: '{count} couleurs',
    count: '{count} candidat | {count} candidats',
    emptyRunning: 'Traçage des premiers candidats…',
    emptyIdle: 'Lancez une recherche pour comparer les candidats ici.',
    showAll: 'Tout afficher ({count})',
    showFewer: 'Afficher moins',
  },

  exportBar: {
    copySvg: 'Copier le SVG',
    copySvgTitle: 'Copier le balisage SVG',
    copyDataUri: 'Copier data-URI',
    copyDataUriTitle: 'Copier comme data: URI pour img/src ou CSS',
    download: 'Télécharger le SVG',
    downloadTitle: 'Télécharger {name} (Ctrl+S)',
  },

  stages: {
    preprocess: 'Prétraitement',
    palette: 'Palette',
    segment: 'Segmentation',
    trace: 'Tracé',
    fit: 'Ajuster les courbes',
    svg: 'Écrire le SVG',
  },

  shapes: {
    path: 'chemin | chemins',
    rect: 'rect | rects',
    circle: 'cercle | cercles',
    ellipse: 'ellipse | ellipses',
    line: 'ligne | lignes',
    polyline: 'polyligne | polylignes',
    polygon: 'polygone | polygones',
  },

  release: {
    title: 'Nouveautés',
    close: 'Fermer les nouveautés',
    new: 'Nouveau',
    beta: 'Bêta',
    feature: 'Nouveauté',
    improvement: 'Amélioration',
    fix: 'Correctif',
    before: 'Avant',
    after: 'Après',
    chosen: 'Retenu',
    footNote: 'Les notes sont datées et numérotées par jour jusqu’à l’arrivée du versionnage.',
    fullHistory: 'Historique complet',
  },

  warnings: {
    stencilIslands: {
      label: 'îlots',
      message:
        '{count} îlot enclavé tomberait d’un pochoir physique — ajoutez des ponts dans votre éditeur. | {count} îlots enclavés tomberaient d’un pochoir physique — ajoutez des ponts dans votre éditeur.',
    },
    nodeCount: {
      label: 'nœuds',
      message:
        '{count} nœuds — envisagez plus de lissage ou une taille max plus petite pour l’édition/découpe.',
    },
    emptyResult: {
      label: 'vide',
      message: 'Aucune forme produite — vérifiez les réglages de seuil/arrière-plan.',
    },
    paletteClamped: {
      label: 'palette',
      message: 'Palette réduite à {count} couleurs (quasi-doublons fusionnés).',
    },
    tinyFeatures: {
      label: 'minuscule',
      message:
        'La plus petite forme fait ~{mm} mm — la plupart des lames/lasers ne coupent pas proprement sous 1 mm.',
    },
    centerlineInput: {
      label: 'médiane',
      message:
        'La médiane trace le milieu des lignes fines, mais ~{percent} % de cette image est plein — attendez-vous à un squelette, pas à des contours correspondants. Utilisez le mode N&B ou Couleur pour les formes pleines.',
    },
    gradientSpotColor: {
      label: 'dégradés',
      message:
        '{count} remplissages dégradés ne se reproduiront pas sur les découpeuses/imprimantes en tons directs — désactivez la détection de dégradés pour ces sorties.',
    },
    modeNote: {
      label: 'note',
      message: '{message}',
    },
  },

  rationale: {
    alpha: 'Pixels transparents détectés — ils ne produiront aucune forme.',
    pixelExact: 'Conservé les {count} couleurs d’origine à l’identique.',
    grayscale: 'Presque en niveaux de gris — vectorisation en calques de gris tonaux.',
    richColor: 'Contenu riche en couleurs — utilisation de {count} entrées de palette.',
    distinctColors: '≈{count} couleurs distinctes mesurées — {size} entrées de palette suffisent.',
    photoTexture: 'Texture photographique détectée — le débruitage bilatéral garde des bords nets.',
    compressed:
      'Artefacts de compression — débruitage, léger flou et fusion des points récupèrent des formes nettes.',
    largeSource:
      'Source volumineuse — vectorisation à 1600 px pour la vitesse, sans perte visible.',
    busyEdges: 'Bords chargés — filtrage des points sous 8 px².',
    pickPixelArt: 'Petit canevas avec peu de couleurs plates — traité comme du pixel art.',
    pickBwSketch:
      'Essentiellement bicolore et très contrasté — la vectorisation noir & blanc convient le mieux.',
    pickCompressedFlat:
      'Bruit de compression sur quelques couleurs plates — nettoyage en dessin plat.',
    pickPhoto: 'Contenu photographique — profil postérisé.',
    pickLogo:
      'Formes plates avec peu de couleurs — profil logo avec calques en découpe sans jointure.',
    pickFlatArt: 'Dessin plat net aux bords anticrénelés — illustration couleur fidèle.',
    pickIllustration: 'Dessin plat mixte — profil illustration.',
    flatArtRegions:
      'Dessin plat net — croissance des régions depuis les intérieurs plats (sans palette globale) pour garder les bords anticrénelés propres.',
  },

  profiles: {
    illustration: {
      label: 'Illustration',
      tagline: 'Dessin multicolore fidèle avec calques empilés et lisses',
      notes: [
        'Calques empilés : les formes s’étendent sous celles du dessus, les bords ne craquent jamais.',
        'Augmentez la taille de palette si des nuances subtiles disparaissent.',
      ],
    },
    photo: {
      label: 'Photo / Affiche',
      tagline: 'Rendu photographique postérisé',
      notes: [
        'Le débruitage bilatéral garde les bords tout en aplatissant le bruit du capteur.',
        'Attendez-vous à un résultat stylisé : une photo ne peut rester photographique en vecteur.',
      ],
    },
    logo: {
      label: 'Logo / Design plat',
      tagline: 'Peu de couleurs, géométrie nette, nœuds minimaux',
      notes: [
        'Partition en découpe sans jointure : les formes partagent des bords exacts, idéal pour l’édition.',
        'Augmentez le lissage si les coins semblent entaillés ; baissez-le pour les marques techniques.',
      ],
    },
    poster: {
      label: 'Sérigraphie',
      tagline: 'Séparation de tons directs marquée',
      notes: [
        'Chaque couleur est son propre calque <g> — un écran ou passage riso par couleur.',
        'Utilisez l’omission du fond pour laisser la couleur du papier non imprimée.',
      ],
    },
    'pixel-art': {
      label: 'Pixel art',
      tagline: 'Bords de pixels exacts, couleurs exactes',
      notes: [
        'Aucun lissage ni rééchantillonnage : chaque bord de pixel est conservé.',
        'Les couleurs restent exactes quand le sprite en compte 64 ou moins.',
      ],
    },
    'bw-sketch': {
      label: 'Croquis à l’encre',
      tagline: 'Noir et blanc avec seuil automatique',
      notes: ['Otsu choisit le seuil ; passez en adaptatif pour un éclairage inégal.'],
    },
    'vinyl-cut': {
      label: 'Découpe vinyle',
      tagline: 'Fichier de découpe en tons directs par calque, une feuille par couleur',
      notes: [
        'Multicolore : chaque calque empilé devient son propre <g> — découpez-le sur ce vinyle et empilez les feuilles.',
        'La couleur qui borde le plus forme la feuille de base pleine ; les autres s’empilent dessus et s’étendent en dessous, les recouvrements restent sans jour une fois échenillés et empilés.',
        'Les détails enfermés sous plusieurs feuilles (une pupille) remontent sur leur propre calque du dessus, pour que les feuilles en dessous restent pleines au lieu de porter chacune un trou à aligner.',
        'La réduction auto limite le nombre de feuilles ; augmentez Couleurs s’il manque une nuance.',
        'La couleur de fond est supprimée (pas de feuille de support pleine) — désactivez Omettre le fond pour la garder.',
        'Unités en millimètres à l’échelle 100 % ; augmentez Région min pour éliminer les points qu’une lame ne peut écheniller.',
      ],
    },
    'laser-engrave': {
      label: 'Gravure laser',
      tagline: 'Zones de gravure pleines aux bords nets',
      notes: [
        'Les remplissages pleins gravent ; ajoutez une passe fine séparée dans votre logiciel laser pour couper.',
        'Le seuil adaptatif sauve les photos éclairées de façon inégale.',
      ],
    },
    'pen-plotter': {
      label: 'Traceur à plume',
      tagline: 'Lignes médianes à trait unique au lieu de contours',
      notes: [
        'Les traits suivent le milieu de chaque ligne dessinée — une passe de plume par ligne.',
        'Une largeur de trait de 0 estime la largeur de plume d’après l’épaisseur des lignes source.',
        'Meilleure entrée : dessins au trait, écriture manuscrite, croquis techniques.',
      ],
    },
    stencil: {
      label: 'Pochoir',
      tagline: 'Pochoir monochrome découpable avec alertes d’îlots',
      notes: [
        'Les îlots enclavés (comme le centre d’un « O ») tombent d’un pochoir physique — le vérificateur les signale.',
        'Ajoutez des ponts dans un éditeur vectoriel là où des îlots sont signalés.',
      ],
    },
  },

  toasts: {
    couldNotLoad: 'Impossible de charger l’image : {error}',
    couldNotBuildSample: 'Impossible de créer l’exemple : {error}',
    settingsImported: 'Réglages importés',
    importFailed: 'Échec de l’import : {error}',
    autoFailed: 'Échec des réglages auto : {error}',
    bgRemoved: 'Fond supprimé — vectorisation de la découpe',
    bgRemovedFailed: 'Échec de la suppression du fond : {error}',
    cleanedUp: 'Nettoyé — vectorisation de l’image débruitée',
    cleanupFailed: 'Nettoyage indisponible : {error}',
    edgeUnavailable: 'Pré-passe de bords indisponible : {error}',
    restoredOriginal: 'Image d’origine restaurée',
    selectionApplied: 'Sélection appliquée — vectorisation de la découpe',
    magicFailed: 'Échec de la sélection magique : {error}',
    modelCacheCleared: 'Cache des modèles vidé',
    modelCacheFailed: 'Impossible de vider le cache des modèles : {error}',
    hexCopied: '{hex} copié',
    clipboardUnavailable: 'Presse-papiers indisponible',
    svgCopied: 'Balisage SVG copié',
    dataUriCopied: 'Data URI copié',
    settingsCopied: 'Réglages copiés',
    settingsFileSaved: 'Fichier de réglages enregistré',
    couldNotReadFile: 'Impossible de lire le fichier',
    dropImage: 'Déposez un fichier image (PNG, JPEG, WebP, GIF, BMP, AVIF ou SVG)',
  },
}
