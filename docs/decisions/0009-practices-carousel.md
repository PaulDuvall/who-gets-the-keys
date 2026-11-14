# 0009. The practices carousel lives here

- Status: Proposed
- Date: 2026-11-14
- Requirements: none of its own. Like the factory video kit (decision 0008), the carousel is talk material outside the export service. Each of its rows cites the `practices.yaml` IDs it shows
- Moves: the 10-page LinkedIn carousel of 36 practices, built outside this repository until now, and a workflow that builds it
- Needs an approver's signature for: the batch `proposals/practices-carousel/`, landed with `scripts/bootstrap/land.sh proposals/practices-carousel`
- Staged on: `main` at `0e2acac`. On 2026-11-14 no unlanded branch changes `specs/protected-paths.txt` or adds a workflow. If one lands first, this batch restages its copy on top of that one

## Context

The owner posts a LinkedIn carousel built from the talk "Who Gets the Keys?". It has ten pages of 1080 × 1350 px, LinkedIn's 4:5 portrait size. It lists 36 practices for code an AI agent writes, and for each one shows when it runs, where in the factory it runs and example tools. It was built outside this repository, so nothing checked its words against `practices.yaml` or its pages against its own layout rules.

This decision makes the repository its source of record: a content file the owner edits, a kit that renders it to a PDF, checks that keep it honest, and a workflow that builds it in GitHub Actions and keeps only the newest copy.

## The model the carousel shows

The owner's corrections of 2026-11-14, which win where older material differs:

| Correction | Where the carousel shows it |
|---|---|
| A factory view. The factory is everything that turns a signed spec into a deployed change. The pipeline is its main workflow and holds the only deploy key. Factory policy guards the keys. An inspector watches the pipeline and production from a security account outside the factory. Humans decide intent, irreversible actions and security events | Page 2, the factory map, built from decision 0004's definition and the factory video's frame at revision 19. The sandbox, pipeline and policy sit inside a dashed line marking the factory's edge. The spec, production, humans and the inspector sit outside it. The Map check holds that layout |
| The agent runs in the cloud. Each task gets its own sandbox on a cloud runner, as the runner producer does (SPEC-001-R83 to R89, R207 to R210) | No page names desktop tooling or local hooks; the producer sets `disableAllHooks` (SPEC-001-R87). "Seconds" reads "Seconds, in the agent's sandbox", the checks inside the sandbox before its patch leaves |

## The carousel is the target; the report shows the gap

As with the factory video (decision 0008), the carousel shows what the repository should do. `verify.mjs` reports, for each row, the coverage `practices.yaml` records for its IDs. A gap does not fail the build. At `0e2acac` the 36 rows are:

| Rows | Coverage of the practices each cites |
|---|---|
| 18 | Shown: every cited practice is `good+bad` or `good-only` |
| 7 | Partly shown: at least one is `partial` or `not-shown` |
| 10 | Not shown: every cited practice is `not-shown` |
| 1 | From the deck's Q&A only, `source: qa` |

P01 and P10 appear on no row. P01, "controls are machine-checkable", is the "Check" step on page 10. P10, coverage as evidence, was dropped from the carousel.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The kit lives in a new top-level `practices-carousel/` | `video/**` triggers the walkthrough's 120-minute build, and `factory-video/**` the factory video's 45-minute one. `tsconfig.json` does not include the folder, so its browser code stays out of the typecheck, as `factory-video/` does |
| 2 | `carousel.yaml` holds every word on every page. `carousel.html` is a template that holds no content | The owner edits one file. `render.mjs` injects it into the page, which builds every element with `textContent`, so no text is parsed as markup |
| 3 | GitHub Actions builds it with `.github/workflows/practices-carousel.yml`: on a push to `main` that touches the kit, `practices.yaml` or the workflow, and on demand | Rows cite `practices.yaml` IDs, so an edit there reruns the checks. Generated files are never committed |
| 4 | Each build uploads `out/` as one artifact, `practices-carousel-<short SHA>-<UTC time>`, for 30 days. A `prune` job then deletes every earlier one | One copy is kept: the newest. It is the walkthrough's and the factory video's pattern |
| 5 | The workflow sets `permissions: {}` and `cache-mode: none`. The build job holds `contents: read` only, the prune job `actions: write` only. Every action is pinned by the SHA `factory-video.yml` uses | No job can push, tag or release, and none reads a secret |
| 6 | `yaml` comes from the root `node_modules`, a devDependency already. Playwright comes from `video/record` through `factory-video/playwright.mjs` | No dependency is added |
| 7 | Fonts are static TTF files, pinned in `fonts.json` by a commit-pinned URL and SHA-256, and downloaded by `build.sh` into an ignored folder | The page fetches nothing over the network. Chromium writes a variable font into a PDF as unnamed Type 3 glyphs, so the Fonts check could not name it |
| 8 | The batch adds `practices-carousel/fonts.json` to `specs/protected-paths.txt` | Chromium parses each font file, so the pins decide what runs. It matches `factory-video/narration/`. Owner decision 2 below |
| 9 | The checks run in the build job, outside `npm run checks` | As for the walkthrough and the factory video. The kit's files still face the pipeline's secrets, lint and SAST checks |
| 10 | The agent does not push to `main` | `main` moves only by the owner's `land.sh` |

## The checks

`verify.mjs` prints one PASS or FAIL row per check and exits nonzero on any FAIL. The first eight are the ones the task asked for. Map and Text were added so that page 2's layout rules and "the PDF's text matches `carousel.yaml`" are checks, not a reading of the pages.

| Check | Fails when |
|---|---|
| Schema | `carousel.yaml` does not parse; a row lacks `text`, `when`, `where` or `tools`; `when` or `where` names an undefined key; a tool URL is not `https://`; a factory box names a page outside 1 to 10 |
| Practices | A row cites an ID that is not in `practices.yaml`, or cites none without `source: qa`. It reports the IDs no row cites |
| Phrasing | Any string, key or comment, tool URLs aside, matches a pattern the owner rejects (`practices-carousel/README.md` lists them) |
| Pages | The PDF does not have exactly 10 pages of 810 × 1013.04 pt |
| Fit | A page overflows or puts content in its margins, rows run into the legend, a tool line runs under its tags, or a section page's `--k` is outside 0.8 to 1.5 |
| Map | Page 2's boxes overlap or show the wrong pages, its text is under 26 px, the pipeline is not the largest box or lacks its mark, or a box is on the wrong side of the factory's edge |
| Fonts | A font file's SHA-256 differs from `fonts.json`, `pdffonts` lists a font as not embedded, Archivo, IBM Plex Sans or IBM Plex Mono is missing, or the PDF holds a font `fonts.json` does not pin |
| Offline | The page requests anything that is not `file://`, or raises or logs an error |
| Count | The cover's count differs from the number of rows |
| Text | A string `carousel.yaml` puts on a page is not in that page's PDF text, as `pdftotext` reads it |

Each check was made to fail once on purpose before the kit was committed: a banned phrase in a row and in a comment, an undefined `when` and `where`, an `http://` link, page 11, a row with no tools, an unknown practice ID, a seventh section, which made 11 pages, five extra rows, an unbreakable tool name, a wrong font pin, a remote stylesheet, a subtitle with no `{count}`, the inspector moved inside the edge, 22 px map text, and a blurb left off the page.

## Changes from the task's appendices

| Change | Why |
|---|---|
| `carousel.yaml` gains `factory.edge` ("The factory's edge") and the pipeline box's `mark` ("Holds the only deploy key") | The task asked for a line marking the factory's edge and a pipeline marked "holds the only deploy key". Both labels go in the content file, so the template holds no text of its own |
| The Phrasing check fails on `--` used as a dash, and lets a command-line flag pass | Appendix A's tool name `pip --require-hashes` would otherwise fail the owner's own content. "a -- b" and "a--b" still fail |
| The display face is Archivo SemiExpanded ExtraBold, at 112.5 % width | The design asks for `font-stretch: 115%` of a variable Archivo. No static instance is 115 %, and a variable font becomes Type 3 glyphs in the PDF. CSS matching picks the 112.5 % face for 115 % |
| `@page` and a named `@page dark` carry the page colours | Chromium rounds each page to 1013.04 pt, 0.72 px taller than a slide, and nothing on the slide paints that strip. Without this, every page ended in a white line, visible under the dark cover and close |
| The cover's top line holds the byline. A row's `ref` shows as "OWASP LLM01". `text-wrap: pretty` and `nowrap` on a few lines | The byline appears once, where carousels usually put it. The prefix names the list the ID comes from. The others stop one-word last lines |
| The workflow is staged at `proposals/practices-carousel/github-workflows/`, not `proposals/github-workflows/` | CLAUDE.md's batch layout, which `land.sh` reads |
| CLAUDE.md's file map is unchanged | It does not list `factory-video/` either, and the unlanded `sandbox-gate` batch stages `CLAUDE.md`, so a second copy would make one of the two restage. The kit's README explains it |
| No backlog item | Three unlanded batches (`sandbox-gate`, `sca-expiry-warning`, `deploy-paths`) stage copies of `.tasks/backlog.jsonl`. A new line on `main` would make each copy stale |

## Landing

1. The agent's kit commit sits on `candidate/practices-carousel`, whose pipeline run must pass. It touches no protected path and no deployable path, so `main`'s run deploys nothing (SPEC-001-R232).
2. The owner moves that commit to `main` with `land.sh --to-main`. The batch's `requires:` lines refuse it until the kit is there.
3. The owner runs `scripts/bootstrap/land.sh proposals/practices-carousel`. It moves two files in one signed commit with `Spec: SPEC-001-R12` and `Spec: SPEC-001-R4`. R12 because both destinations are protected paths and one widens the list; R4 because the workflows check audits the new file.

| In the batch | Lands at | Change |
|---|---|---|
| `github-workflows/practices-carousel.yml` | `.github/workflows/practices-carousel.yml` | New workflow |
| `protected-paths.txt` | `specs/protected-paths.txt` | Adds `practices-carousel/fonts.json` |

Landing that commit starts the workflow's first build, because it adds the workflow. It changes no deployable path either.

## Decisions for the owner

| # | Question | Options | Recommendation | Staged as |
|---|---|---|---|---|
| 1 | Where the kit lives | (a) `practices-carousel/`. (b) Inside `factory-video/` | (a). Any change under `factory-video/` triggers a 45-minute build | (a) |
| 2 | Whether `fonts.json` is a protected path | (a) Yes, like `factory-video/narration/`. (b) No | (a). Chromium parses the font files, so the pins decide what runs | (a). For (b), remove `protected-paths.txt` and its `move:` line from the batch in a commit of their own before landing |
| 3 | Rows that come from the deck's Q&A slides | (a) Mark them `source: qa` until the snapshot holds the Q&A. (b) Refresh the snapshot with `scripts/bootstrap/refresh-slides.sh` first | (a) now, then (b). The snapshot is file `19RnjfRh…`, exported 2026-11-02. The talk's current deck, file `1Zq6B8Ag…` modified 2026-11-03, adds four Q&A slides. Which file is the source of record is the owner's call | (a): one row and the day-one box |
| 4 | The single-image poster built from the same data | (a) A second template later. (b) Now | (a). This task is the PDF | (a) |
| 5 | Archivo's width | (a) Keep the static 112.5 % face. (b) Pin a 115 % instance cut from the variable font | (a). (b) needs a font tool the kit does not have and a new pinned file; the two faces differ by 2.5 points of width | (a) |

## Not yet verified

- The workflow has never run. Its first run is on the commit that lands it.
- zizmor 1.31.1, the version `scripts/ci/requirements.txt` pins, audited the staged workflow offline in the cloud session beside `factory-video.yml` and reported no findings. The workflows check audits it again once it lands.
- That `npx --no-install playwright install chromium` in `video/record` reaches its download host. `factory-video.yml` runs the same command.
- The tool links. On 2026-11-14, 39 of the 41 distinct URLs returned 200 from the cloud session. The other two are on github.com, which refuses scripted fetches from there; `git ls-remote` found both repositories. No check re-tests links, so they can go stale.
- A build on the owner's Mac. Outside CI, `factory-video/playwright.mjs` falls back to a Playwright the machine already has.

## Options considered

| Option | Why not |
|---|---|
| The kit under `factory-video/` or `video/` | Triggers a 45- or 120-minute build on every edit |
| Commit the font files | 1.6 MB of binaries in the history. The commit-pinned URL and SHA-256 give the same guarantee |
| Google Fonts' variable Archivo and IBM Plex Sans | Type 3 glyphs with no font name in the PDF |
| IBM Plex from npm | The packages ship only WOFF and WOFF2. The GitHub source at the same release tag holds TTF, so both families come from one kind of source: a commit on GitHub |
| Upload the artifact when a check fails | The task and `factory-video.yml` upload only a build that passed. The job log keeps the check table |
