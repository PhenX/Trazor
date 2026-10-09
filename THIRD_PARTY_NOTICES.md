# Third-party notices

Trazor is MIT-licensed (see [`LICENSE`](LICENSE)). Parts of it are derived from the following
works, under their own licenses.

## inkvec

> Inkvec
> Copyright 2026 LogoLabs and Stefan-Lucian Deleanu
>
> This product includes software developed by LogoLabs and licensed under the Apache License,
> Version 2.0.

<https://github.com/logolabs/inkvec>, licensed under the Apache License, Version 2.0 (a copy is in
[`licenses/inkvec-Apache-2.0.txt`](licenses/inkvec-Apache-2.0.txt)).

Files derived from inkvec's source are modified ports to TypeScript; each says so in its header
(“After inkvec (Apache-2.0): …”), naming the inkvec files it follows. They are, at the time of
writing:

- the planar-map geometry core: `packages/trace/src/planar/*`, `packages/trace/src/solve/*` and
  the curve fitter under `packages/trace/src/fit/*`;
- parts of the classic tracer that follow inkvec's stages and name them in their comments:
  `packages/trace/src/potrace/runfit.ts`, `packages/trace/src/refine.ts`,
  `packages/trace/src/coverage.ts`;
- the rare-ink evidence of the region merge: `packages/raster/src/represent.ts`;
- the ink front end: `packages/raster/src/ink/*`, `packages/raster/src/fill/*` and
  `packages/raster/src/intake/*`;
- the ground-truth evaluation tools' SVG registration: `scripts/eval/gt/truth.ts`.

`docs/REFERENCES.md` lists, per algorithm, the inkvec stage it follows and the published work
behind it.

## Test fixtures

`packages/raster/test/ink/palette-fixtures.ts` embeds, compressed, one 128 px raster rendering
from each of these icon sets (with the expected output of inkvec's palette on it), used only to
test the palette port against inkvec:

- `noto-emoji/emoji_u0030` — Noto Emoji, Copyright Google LLC, Apache License 2.0
  (<https://github.com/googlefonts/noto-emoji>).
- `material-icons/10k` — Material Icons, Copyright Google LLC, Apache License 2.0
  (<https://github.com/google/material-design-icons>).
- `simple-icons/alchemy` — Simple Icons, CC0 1.0 (<https://github.com/simple-icons/simple-icons>);
  the brand it depicts may be a trademark of its owner.
- `lucide/banknote-arrow-up` — Lucide, ISC License: Copyright (c) for portions of Lucide are held
  by Cole Bemis 2013-2022 as part of Feather (MIT); all other copyright (c) for Lucide are held by
  Lucide Contributors 2022 (<https://github.com/lucide-icons/lucide>).
- `fluent-emoji/Inbox_tray` — Fluent Emoji, Copyright (c) Microsoft Corporation, MIT License
  (<https://github.com/microsoft/fluentui-emoji>).
- three of inkvec's synthetic benchmark images, Apache License 2.0 (above).

`packages/raster/test/ink/native-fixtures.ts` embeds, compressed, five 128 px raster renderings
with transparency (with the expected output of inkvec's transparent-image front end on them), used
only to test the port against inkvec:

- `lucide/app-window-mac`, `lucide/arrow-left-to-line` — Lucide, ISC License (above).
- `noto-emoji/emoji_u23f8`, `emoji_u1f56f`, `emoji_u1f469_200d_1f9bd` — Noto Emoji, Copyright
  Google LLC, Apache License 2.0 (<https://github.com/googlefonts/noto-emoji>).

`packages/raster/test/fill/bands-fixtures.ts` embeds, compressed, 128 px raster renderings
(whole or cropped) with the expected output of inkvec's band merge and carve on them, used only
to test the port against inkvec:

- five Noto Emoji images (`u1f36a`, `u1f351`, `u1f469_1f3fb_200d_2708`,
  `u1f468_1f3ff_200d_2764_200d_1f468_1f3fb`, `u1f3c4_1f3fd_200d_2642`) — Noto Emoji, Copyright
  Google LLC, Apache License 2.0 (<https://github.com/googlefonts/noto-emoji>).
- `twemoji/1f1f3-1f1e8` — Twemoji, Copyright 2020 Twitter, Inc and other contributors, graphics
  licensed under CC-BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>,
  <https://github.com/twitter/twemoji>); cropped and rasterized.
- three of inkvec's synthetic benchmark images, Apache License 2.0 (above).

The ISC and MIT licenses permit use, copying, modification and distribution provided the
copyright notice above and the permission notice are included: “Permission to use, copy, modify,
and/or distribute this software for any purpose with or without fee is hereby granted, provided
that the above copyright notice and this permission notice appear in all copies.” (ISC) and
“Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files … The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.” (MIT); both are provided “as is”,
without warranty of any kind.
