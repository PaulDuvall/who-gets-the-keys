# Practices carousel

The 11-page LinkedIn carousel from the talk "Who Gets the Keys?": 42 practices for code an AI agent writes, with when each one runs, where in the factory it runs and an example of the kind of tool that does it. Each page is 1080 × 1350 px, LinkedIn's 4:5 portrait size. Page 11 is a real receipt: the seven lines `main` run 114 printed when it deployed the runner producer's delivery `9f959a3`, and the evidence behind each line from that run's logs. A two-sided poster reads the same file. Its front, the factory view, shows every row with the title, the windows, the closing pages and the flow's ends; it leaves out each section's blurb, the cover's subtitle, page 9's notes and most of the map's text. Its back is a checklist: every practice with a box to tick, section by section. This folder is the source of record for both ([decision 0009](../docs/decisions/0009-practices-carousel.md)).

`prompt.md` keeps the owner's prompt that started the kit, with its appendices, and each instruction the owner gave while it was built.

## Edit

Edit `carousel.yaml` and nothing else. It holds every word on every page and on the poster. `carousel.html` and `poster.html` are the templates and hold no content.

| Key | Page | What it holds |
|---|---|---|
| `meta` | 1, 10, poster | Title, thesis, subtitle (`{count}` becomes the number of rows), byline, closing line, sites |
| `poster` | poster | The front's and the back's names beside the title, and their count lines (`{count}` again) |
| `windows` | 1, 3 to 8, poster | The four timing windows and `always` |
| `where` | 3 to 8 | The tag a row shows for where it runs. `pipeline` is empty, so a pipeline row shows no tag |
| `legend` | 3 to 8 | The legend at the foot of each section page, and the poster's |
| `labels` | 2 to 8, poster | The DIY tag, the prefix before an OWASP ID, and the words before the map's page numbers |
| `factory` | 2, poster | The map. `flow` is four boxes in order: spec, agent sandbox, pipeline, production. `around` is three: factory policy, inspector, humans. Each `page` is the carousel page or pages that cover the box. The pipeline's `mark` labels it as the holder of the only deploy key, and `account` labels the frame around the inspector: the security account the pipeline cannot reach |
| `sections` | 3 to 8 | Six, one page each, in file order. Each row has `text`, `when`, `where`, `tools` and `practices`, and may have `lead`, `ref` (an OWASP LLM Top 10 ID) and `diy: true`. A row's tools are examples of the kind of tool to use; `tools: []` shows none. On the poster the first three are columns under the flow, and the last three are bands |
| `humans` | 9, poster | Where humans still decide, and the day-one box |
| `close` | 10, poster | Three things to do tomorrow |
| `receipt` | 11 | One real receipt. `printed` is the receipt job's seven lines, exactly as the `record` file keeps them after `record_after`. `commit` and `spec_commit` are the delivery and the signed commit that approved its requirement and task. `backs` is the evidence behind the lines: each names, in `shows`, the rows it covers in full and, in `partly`, the rows it covers in part. `gaps` lists what the receipt does not show yet, and `stub` a scenario that got no receipt. Every digest, short SHA and run ID on the page must be in `record` or `evidence`, the batch notes that quote the logs |

Every row cites the `practices.yaml` IDs it shows, or cites none and names its source: `source: qa` for the deck's Q&A slides, which `specs/source-of-record/slides.txt` does not hold, or `source: dpra` for a stage of the [AWS Deployment Pipeline Reference Architecture](https://aws-samples.github.io/aws-deployment-pipeline-reference-architecture/application-pipeline/index.html)'s application pipeline, which the deck takes as given: tests, infrastructure scans, the SBOM and progressive release; or `source: pipeline-view` for a practice from the owner's "Pipeline view" poster of 43 practices that the deck snapshot does not hold.

## Build

```bash
practices-carousel/build.sh
```

It downloads the fonts `fonts.json` pins into `fonts/`, refusing any file whose SHA-256 differs, then runs `render.mjs` and `verify.mjs`. A clean build takes about 5 s. It needs Node.js, `curl`, the root `node_modules` (`npm ci --ignore-scripts`, for `yaml`), Playwright with Chromium, and poppler (`brew install poppler` or `apt-get install poppler-utils`).

Playwright comes from `video/record`'s pinned package, through `factory-video/playwright.mjs`, so this kit adds no dependency. Outside CI, where `video/record` has no `node_modules`, it uses a Playwright the machine already has.

| Output in `out/` | What it is |
|---|---|
| `who-gets-the-keys-carousel.pdf` | The carousel to upload: 11 pages |
| `pages/p01.png` to `p11.png` | Each page as an image, 1080 × 1350 |
| `contact.png` | All eleven pages on one sheet |
| `poster.png`, `poster-back.png`, `poster.pdf` | The poster's front and back, each 2400 × 2200 px, the PNGs at 2× for zooming in, and both as a two-page PDF |
| `report.md` | The checks, each section page's and the receipt's `--k`, the practices no row cites, and what the repository demonstrates for each row |
| `render-log.json` | Every request the page made, and any error |

The `practices-carousel` workflow builds the same files in GitHub Actions on a push to `main` that changes this folder or `practices.yaml`, and on demand. It uploads `out/` as one artifact, `practices-carousel-<short SHA>-<UTC time>`, and deletes the earlier ones.

## Checks

`verify.mjs` prints one row per check and exits nonzero on any failure. `node verify.mjs --only schema,practices,phrasing,receipt` runs the four that need no browser. Receipt reads git, so it needs the commits page 11 names: a clone with the history, which the workflow fetches.

| Check | Fails when |
|---|---|
| Schema | `carousel.yaml` does not parse; a row lacks `text`, `when`, `where` or `tools`; `when` or `where` names a key the file does not define; a tool URL is not `https://`; a factory box names a page the carousel does not have; the receipt lacks a field, or a `backs` line names no row or text that is no row's |
| Practices | A row cites an ID `practices.yaml` does not define, cites none without `source: qa`, `source: dpra` or `source: pipeline-view`, or cites some and also names a source. It also reports the IDs no row cites |
| Phrasing | Any string, key or comment, tool URLs aside, holds an em dash, `--`, "patch", "not just", a comma followed by "not", a sentence that starts with "Not", "never", "Here's", or one of delve, unlock, harness, robust, crucial, pivotal, landscape, ecosystem, transformative, cutting-edge, game-changer, seamless. Only a tool's name may hold a command-line flag such as `pip --require-hashes`, and only a tool's `url` is skipped |
| Pages | The PDF does not have exactly 11 pages of 810 × 1013.04 pt, which is 1080 × 1350 px as Chromium rounds it |
| Fit | A page or the poster overflows, or has an element or a line of text in its margins (the poster's are 64 px at each side); a line of text is wider than its own box, as a long word in a heading or an arrow would be; a section page's rows run into its legend, or the poster's last row into its footer; a tool line runs under its tags; a section page's `--k` is outside 0.8 to 1.5, the receipt's `--k` outside 0.8 to 1.3, or the poster's `--pk` outside 0.8 to 1.3 |
| Map | On page 2, a box overlaps another, shows the wrong pages, or has text under 26 px; the flow does not run spec, sandbox, pipeline, production from top to bottom; policy is not beside the pipeline or humans beside the spec; the pipeline is not the largest box or lacks its mark; a box other than the inspector's, or none, is framed as the security account |
| Poster | The poster PDF is not two 2400 × 2200 px pages; the back does not list every row once, in order, under its section, each with a box to tick; a row is missing, repeated, outside its section's column or band, or its card lacks one of its words; a column is not under its own arrow, factory policy is not under the columns, or the bands do not run inspector, routing humans, pages 9 and 10, footer from top to bottom; the flow does not run left to right; a band other than the inspector's, or none, is framed as the security account |
| Fonts | A font file's SHA-256 differs from `fonts.json`, a URL is not pinned to a commit, a font did not load, or, in either PDF, `pdffonts` lists a font as not embedded, Archivo, IBM Plex Sans or IBM Plex Mono is missing, or a font is not one of the pinned files, by its PostScript name |
| Offline | The carousel or the poster requests anything that is not `file://`, or raises or logs an error |
| Count | The rows pages 3 to 8 show, counted in the page, the poster's cards, the cover's number and the poster's number differ, or a PDF does not print the number where the subtitle or the poster's count line puts it, or page 11 does not print the receipt's count of rows covered in full and in part |
| Receipt | Page 11's printed lines differ from the block its `record` keeps, or COMMIT, AGENT or SPEC differ from the commit's own hash and trailers; the spec commit is missing, is not an ancestor, has no SSH signature by a security key (`sk-`), changes nothing under `specs/` or does not add the task file the SPEC line names; a digest, short SHA or run ID on the page is in neither `record` nor `evidence`; the stub's line does not start with its scenario's `expect` in `scenarios/scenarios.yaml` |
| Text | A string `carousel.yaml` puts on a page or the poster is not in that PDF's text |

A check that throws is reported as a FAIL with the error, so the table always prints. `--only` with a name it does not know exits 2.

## How a section page fits

Each section page scales its rows with the CSS variable `--k`. After the fonts load, the page raises `--k` from 0.8 in steps of 0.02 and keeps the last value at which nothing overflows down or across, the rows end at least 6 px above the legend, and no tool line is wider than its column. It stops at 1.5. A page with fewer or shorter rows gets larger type. A word too long for a row's line breaks rather than running across the margin; one too long for a heading or an arrow fails Fit, so the words get shorter. The poster does the same with `--pk` on its front, from 0.8 to 1.3, and `--bk` on its back, from 0.8 to 1.5, keeping each body above its footer. The receipt scales with `--k` from 0.8 to 1.3, keeping the last value at which nothing overflows and no line of the slip is wider than its box.

## Fonts

Archivo (Omnibus-Type) and IBM Plex Sans and Mono (IBM), each under the SIL Open Font License 1.1. `fonts.json` records each file's commit-pinned URL, SHA-256 and the licence's URL. They are static instances, because Chromium writes a variable font into a PDF as unnamed Type 3 glyphs. The display face uses Archivo SemiExpanded ExtraBold, at 112.5 % width, for the design's `font-stretch: 115%`.

## Not covered

- No check opens the tool links, so a link can go stale. On 2026-11-14, 39 of the 41 distinct URLs returned 200 from a cloud session. The other two are on github.com, which refuses scripted fetches from there; `git ls-remote` found both repositories.
