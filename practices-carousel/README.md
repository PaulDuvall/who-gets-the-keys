# Practices carousel

The 10-page LinkedIn carousel from the talk "Who Gets the Keys?": 36 practices for code an AI agent writes, with when each one runs, where in the factory it runs and tools to start with. Each page is 1080 × 1350 px, LinkedIn's 4:5 portrait size. This folder is its source of record ([decision 0009](../docs/decisions/0009-practices-carousel.md)).

## Edit

Edit `carousel.yaml` and nothing else. It holds every word on every page. `carousel.html` is the template and holds no content.

| Key | Page | What it holds |
|---|---|---|
| `meta` | 1, 10 | Title, thesis, subtitle (`{count}` becomes the number of rows), byline, closing line, sites |
| `windows` | 1, 3 to 8 | The four timing windows and `always` |
| `where` | 3 to 8 | The tag a row shows for where it runs. `pipeline` is empty, so a pipeline row shows no tag |
| `legend` | 3 to 8 | The legend at the foot of each section page |
| `factory` | 2 | The map. `flow` is four boxes in order: spec, agent sandbox, pipeline, production. `around` is three: factory policy, inspector, humans. Each `page` is the carousel page or pages that cover the box. The pipeline's `mark` labels it as the holder of the only deploy key |
| `sections` | 3 to 8 | One page each, in file order. Each row has `text`, `when`, `where`, `tools` and `practices`, and may have `lead`, `ref` (an OWASP LLM Top 10 ID) and `diy: true` |
| `humans` | 9 | Where humans still decide, and the day-one box |
| `close` | 10 | Three things to do tomorrow |

Every row cites the `practices.yaml` IDs it shows. A row from the deck's Q&A slides cites none and says `source: qa`, because `specs/source-of-record/slides.txt` does not hold those slides.

## Build

```bash
practices-carousel/build.sh
```

It downloads the fonts `fonts.json` pins into `fonts/`, refusing any file whose SHA-256 differs, then runs `render.mjs` and `verify.mjs`. A clean build takes about 5 s. It needs Node.js, `curl`, the root `node_modules` (`npm ci --ignore-scripts`, for `yaml`), Playwright with Chromium, and poppler (`brew install poppler` or `apt-get install poppler-utils`).

Playwright comes from `video/record`'s pinned package, through `factory-video/playwright.mjs`, so this kit adds no dependency. Outside CI, where `video/record` has no `node_modules`, it uses a Playwright the machine already has.

| Output in `out/` | What it is |
|---|---|
| `who-gets-the-keys-carousel.pdf` | The carousel to upload: 10 pages |
| `pages/p01.png` to `p10.png` | Each page as an image, 1080 × 1350 |
| `contact.png` | All ten pages on one sheet |
| `report.md` | The checks, each section page's `--k`, the practices no row cites, and what the repository demonstrates for each row |
| `render-log.json` | Every request the page made, and any error |

The `practices-carousel` workflow builds the same files in GitHub Actions on a push to `main` that changes this folder or `practices.yaml`, and on demand. It uploads `out/` as one artifact, `practices-carousel-<short SHA>-<UTC time>`, and deletes the earlier ones.

## Checks

`verify.mjs` prints one row per check and exits nonzero on any failure. `node verify.mjs --only schema,practices,phrasing` runs the three that need no browser.

| Check | Fails when |
|---|---|
| Schema | `carousel.yaml` does not parse; a row lacks `text`, `when`, `where` or `tools`; `when` or `where` names a key the file does not define; a tool URL is not `https://`; a factory box names a page outside 1 to 10 |
| Practices | A row cites an ID `practices.yaml` does not define, or cites none without `source: qa`. It also reports the IDs no row cites |
| Phrasing | Any string, key or comment, tool URLs aside, holds an em dash, `--` used as a dash, "not just", a comma followed by "not", a sentence that starts with "Not", "never", "Here's", or one of delve, unlock, harness, robust, crucial, pivotal, landscape, ecosystem, transformative, cutting-edge, game-changer, seamless. A command-line flag such as `pip --require-hashes` is not a dash |
| Pages | The PDF does not have exactly 10 pages of 810 × 1013.04 pt, which is 1080 × 1350 px as Chromium rounds it |
| Fit | A page overflows or has content in its margins, a section page's rows run into its legend, a tool line runs under its tags, or a section page's `--k` is outside 0.8 to 1.5 |
| Map | On page 2, a box overlaps another, shows the wrong pages, or has text under 26 px; the pipeline is not the largest box or lacks its mark; sandbox, pipeline and policy are not inside the factory's edge, or spec, production, humans and inspector are not outside it |
| Fonts | A font file's SHA-256 differs from `fonts.json`, a URL is not pinned to a commit, a font did not load, `pdffonts` lists a font as not embedded, Archivo, IBM Plex Sans or IBM Plex Mono is missing, or the PDF holds a font `fonts.json` does not pin |
| Offline | The page requests anything that is not `file://`, or raises or logs an error |
| Count | The cover's count differs from the number of rows |
| Text | A string `carousel.yaml` puts on a page is not in that page's PDF text |

## How a section page fits

Each section page scales its rows with the CSS variable `--k`. After the fonts load, the page raises `--k` from 0.8 in steps of 0.02 and keeps the last value at which nothing overflows, the rows end at least 6 px above the legend, and no tool line is wider than its column. It stops at 1.5. A page with fewer or shorter rows gets larger type.

## Fonts

Archivo (Omnibus-Type) and IBM Plex Sans and Mono (IBM), each under the SIL Open Font License 1.1. `fonts.json` records each file's commit-pinned URL, SHA-256 and the licence's URL. They are static instances, because Chromium writes a variable font into a PDF as unnamed Type 3 glyphs. The display face uses Archivo SemiExpanded ExtraBold, at 112.5 % width, for the design's `font-stretch: 115%`.

## Not covered

- No check opens the tool links, so a link can go stale. On 2026-11-14, 39 of the 41 distinct URLs returned 200 from a cloud session. The other two are on github.com, which refuses scripted fetches from there; `git ls-remote` found both repositories.
- The single-image poster built from the same data is a later template (decision 0009, owner decision 4).
