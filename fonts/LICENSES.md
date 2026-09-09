# Bundled fonts (OCR text-layer matching)

These Latin-subset webfonts are shipped **same-origin** so the OCR text layer can render candidate glyphs deterministically
on every OS (see `apps/web/src/lib/fontMatch.ts`). They are small (~140 KB total) and committed, unlike the ML weights and
`traineddata`. Each is redistributed under its upstream open license.

| File(s)                                  | Family      | License                   | Source                                            |
| ---------------------------------------- | ----------- | ------------------------- | ------------------------------------------------- |
| `sans-400`, `sans-700`, `sans-italic`    | Roboto      | Apache License 2.0        | https://github.com/googlefonts/roboto             |
| `serif-400`, `serif-700`, `serif-italic` | Noto Serif  | SIL Open Font License 1.1 | https://github.com/notofonts/latin-greek-cyrillic |
| `mono-400`                               | Roboto Mono | Apache License 2.0        | https://github.com/googlefonts/RobotoMono         |

Full license texts: Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0>, OFL-1.1 <https://openfontlicense.org>.
The files are the `latin` subsets published by Fontsource (<https://fontsource.org>).
