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
- the ground-truth evaluation tools' SVG registration: `scripts/eval/gt/truth.ts`.

`docs/REFERENCES.md` lists, per algorithm, the inkvec stage it follows and the published work
behind it.
