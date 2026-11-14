# 0009. The practices carousel lives here

- Status: Proposed
- Date: 2026-11-14
- Requirements: none of its own. Like the factory video kit (decision 0008), the carousel is talk material outside the export service. Each of its rows cites the `practices.yaml` IDs it shows
- Moves: the 10-page LinkedIn carousel of 36 practices, built outside this repository until now, a one-page poster of the same content, and a workflow that builds both. The owner then added an 11th page, a real receipt (owner question 11)
- Needs an approver's signature for: the batch `proposals/practices-carousel/`, landed with `scripts/bootstrap/land.sh proposals/practices-carousel`
- Staged on: `main` at `fa38bed`, first drafted on `0e2acac`. On 2026-11-14 no unlanded branch changes `specs/protected-paths.txt` or adds a workflow. If one lands first, this batch restages its copy on top of that one

## Context

The owner posts a LinkedIn carousel built from the talk "Who Gets the Keys?". It has ten pages of 1080 × 1350 px, LinkedIn's 4:5 portrait size. It lists 36 practices for code an AI agent writes, and for each one shows when it runs, where in the factory it runs and example tools. It was built outside this repository, so nothing checked its words against `practices.yaml` or its pages against its own layout rules.

This decision makes the repository its source of record: a content file the owner edits, a kit that renders it to a PDF and a one-page poster, checks that keep both honest, and a workflow that builds them in GitHub Actions and keeps only the newest copy.

## The model the carousel shows

The owner's corrections of 2026-11-14, which win where older material differs:

| Correction | Where the carousel shows it |
|---|---|
| A factory view. The factory is everything that turns a signed spec into a deployed change, and watches it. The pipeline is its main workflow and holds the only deploy key. Factory policy guards the keys. An inspector watches the pipeline and production from a security account the pipeline cannot reach. Humans decide intent, irreversible actions and security events. The task first put the inspector outside the factory; the owner corrected that on 2026-11-14: everything is the factory, and the inspector watches the pipeline from outside the pipeline | Page 2, the factory map, built from decision 0004's definition and the factory video's frame at revision 19. A dashed frame labelled "Security account" surrounds the inspector alone, the line the pipeline cannot cross; nothing on the page is outside the factory. The poster frames the inspector's band the same way. The Map and Poster checks hold it |
| The agent runs in the cloud. Each task gets its own sandbox on a cloud runner, as the runner producer does (SPEC-001-R83 to R89, R207 to R210) | No page names desktop tooling or local hooks; the producer sets `disableAllHooks` (SPEC-001-R87). "Seconds" reads "Seconds, in the agent's sandbox", the checks inside the sandbox before its proposed change leaves. The carousel says "proposed change" where the specs say "patch", which a reader outside git takes for a bug fix (owner, 2026-11-14) |
| Tools are examples. A row's tools show the kind of tool that does the practice, so the reader can start; the practice is the point | The cover's subtitle says "an example of the kind of tool that does it", and every legend adds "Tools: examples of the kind of tool to use" (owner, 2026-11-14). Six rows name no tool, because the practice is a rule you write (the DIY tag) |

## The carousel is the target; the report shows the gap

As with the factory video (decision 0008), the carousel shows what the repository should do. `verify.mjs` reports, for each row, the coverage `practices.yaml` records for its IDs. A gap does not fail the build. At `fc97f75` the 40 rows are:

| Rows | Coverage of the practices each cites |
|---|---|
| 18 | Shown: every cited practice is `good+bad` or `good-only` |
| 7 | Partly shown: at least one is `partial` or `not-shown` |
| 10 | Not shown: every cited practice is `not-shown` |
| 4 | From the AWS Deployment Pipeline Reference Architecture, `source: dpra`, which `practices.yaml` does not list |
| 1 | From the deck's Q&A only, `source: qa` |

P01 and P10 appear on no row. P01, "controls are machine-checkable", is the "Check" step on page 10. P10, coverage as evidence, was dropped from the carousel.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The kit lives in a new top-level `practices-carousel/` | `video/**` triggers the walkthrough's 120-minute build, and `factory-video/**` the factory video's 45-minute one. `tsconfig.json` does not include the folder, so its browser code stays out of the typecheck, as `factory-video/` does |
| 2 | `carousel.yaml` holds every word on every page and on the poster, the DIY tag, the OWASP prefix and the map's page labels included. `carousel.html` and `poster.html` are templates that hold no content | The owner edits one file, and the Phrasing check reads every word that reaches a page. `render.mjs` injects it into each page, which builds every element with `textContent`, so no text is parsed as markup |
| 2a | The poster has two sides of 2400 × 2200 px. Its back is a checklist of every practice, section by section, with a box to tick (owner, 2026-11-14). Its front is a view of the same file laid out as the factory. It shows every row, the title and windows, the closing pages and the flow's ends, and leaves out each section's blurb, the cover's subtitle, page 9's notes and most of the map's text: the signed spec, the first three sections as columns under the flow, production; factory policy under the columns; the inspector as a band framed by its security account, then routing humans; pages 9 and 10 and the closing line at the foot | The owner asked on 2026-11-14 for a one-pager of the carousel, like the earlier "pipeline view" poster but as the factory view. It reads the same file, so the two cannot drift. The Poster check holds its layout |
| 3 | GitHub Actions builds it with `.github/workflows/practices-carousel.yml`: on a push to `main` that touches the kit, `practices.yaml` or the workflow, and on demand | Rows cite `practices.yaml` IDs, so an edit there reruns the checks. Generated files are never committed |
| 4 | Each build uploads `out/` as one artifact, `practices-carousel-<short SHA>-<UTC time>`, for 30 days. A `prune` job then deletes every earlier one | One copy is kept: the newest. It is the walkthrough's and the factory video's pattern |
| 5 | The workflow sets `permissions: {}` and `cache-mode: none`. The build job holds `contents: read` only, the prune job `actions: write` only. Every action is pinned by the SHA `factory-video.yml` uses | No job can push, tag or release, and none reads a secret |
| 6 | `yaml` comes from the root `node_modules`, a devDependency already. Playwright comes from `video/record` through `factory-video/playwright.mjs` | No dependency is added |
| 7 | Fonts are static TTF files, pinned in `fonts.json` by a commit-pinned URL and SHA-256, and downloaded by `build.sh` into an ignored folder | The page fetches nothing over the network. Chromium writes a variable font into a PDF as unnamed Type 3 glyphs, so the Fonts check could not name it |
| 8 | The batch adds `practices-carousel/fonts.json` and `practices-carousel/evidence/sigstore-trusted-root.json` to `specs/protected-paths.txt` | Chromium parses each font file, and the trusted root decides which signatures page 11's check accepts. An unsigned change to either then fails the signatures check. It matches `factory-video/narration/`. It is not a complete control: `build.sh`, `lib.mjs` and the templates decide which files are downloaded and loaded, and they stay unprotected, as `narrate.py` does beside `factory-video/narration/`. Owner decisions 2 and 6 below |
| 9 | The checks run in the build job, outside `npm run checks` | As for the walkthrough and the factory video. The kit's files still face the pipeline's secrets, lint and SAST checks |
| 10 | The agent does not push to `main` | `main` moves only by the owner's `land.sh` |

## The checks

`verify.mjs` prints one PASS or FAIL row per check and exits nonzero on any FAIL. Eight are the ones the task asked for. Map and Text turn page 2's layout rules and "the PDF's text matches `carousel.yaml`" into checks. Poster checks the poster's layout, and Receipt holds page 11 to what git and the runs' logs record. A check that throws is a FAIL, and `--only` with a name it does not know exits 2.

| Check | Fails when |
|---|---|
| Schema | `carousel.yaml` does not parse; a row lacks `text`, `when`, `where` or `tools`; `when` or `where` names an undefined key; a tool URL is not `https://`; a factory box names a page the carousel does not have; the receipt lacks a field, or names text that is no row's |
| Practices | A row cites an ID that is not in `practices.yaml`, cites none without `source: qa` or `source: dpra`, or cites some and also names a source. It reports the IDs no row cites |
| Phrasing | Any string, key or comment matches a pattern the owner rejects, "patch" among them, (`practices-carousel/README.md` lists them). Only a tool's `url` is skipped, and only a tool's name may hold a command-line flag |
| Pages | The PDF does not have exactly 11 pages of 810 × 1013.04 pt |
| Fit | A page or the poster overflows, or puts an element or a line of text in its margins (the poster's are 64 px at each side); a line of text is wider than its own box; rows run into the legend or the footer; a tool line runs under its tags; `--k` is outside 0.8 to 1.5, the receipt's outside 0.8 to 1.3, or the poster's `--pk` outside 0.8 to 1.3 |
| Map | Page 2's boxes overlap or show the wrong pages, its text is under 26 px, the flow is out of order, policy is not beside the pipeline or humans beside the spec, the pipeline is not the largest box or lacks its mark, or a box other than the inspector's, or none, is framed as the security account |
| Poster | The poster is not two 2400 × 2200 px pages, the back does not list every row once in order with a box to tick, a row is missing, repeated, in another section's place or without one of its words on its card, a column is not under its own arrow, the bands are out of order, the flow is out of order, or a band other than the inspector's, or none, is framed as the security account |
| Fonts | A font file's SHA-256 differs from `fonts.json`, or in either PDF `pdffonts` lists a font as not embedded, Archivo, IBM Plex Sans or IBM Plex Mono is missing, or a font is not one of the pinned files, by its PostScript name |
| Offline | The carousel or the poster requests anything that is not `file://`, or raises or logs an error |
| Count | The rows pages 3 to 8 show, counted in the page, differ from the poster's cards, the cover's number, the poster's number or `carousel.yaml`'s rows, or a PDF does not print the number where its template puts it, page 11's count of rows covered included |
| Receipt | A signature behind page 11 does not verify offline: the approver's SSH signature on the spec commit, the two DSSE signatures, their Fulcio chains, or the Rekor timestamps, inclusion proofs and checkpoints. A hash or signature on the page is not one `receipt-proof.mjs` derived for that line. A number is in neither that proof nor the line's quotes |
| Text | A string `carousel.yaml` puts on a page or the poster is not in that PDF's text, as `pdftotext` reads it |

Each check was made to fail once on purpose before the kit was committed: a banned phrase in a row and in a comment, an undefined `when` and `where`, an `http://` link, page 11, a row with no tools, an unknown practice ID, a seventh section, which made 11 pages, five extra rows, an unbreakable tool name, a wrong font pin, a remote stylesheet, a subtitle with no `{count}`, the inspector moved inside the old factory edge (since replaced by the security account's frame), 22 px map text, and a blurb left off the page. After the independent review: a word too long for its line with wrapping turned off, the spec and production swapped, `--` in a row's text, a `url` key outside a tools list, the poster's columns relabelled, one row left off its page, an unknown `--only` name, and a file with no `factory`. After the second review: the poster's columns swapped on the grid, the poster's side margins removed, "Specifications" in the spec's arrow, "patch" in a row, the cards' where tags dropped, and a system serif in the poster's footer. After page 11 became a real receipt: a MODEL value, a digest, the spec commit, the stub's line and the SPEC line, each changed. After its review, the eleven false values that had passed together, and two more, each failed alone. With signatures verified: a statement byte, a DSSE signature, an inclusion-proof hash, the Rekor key, a page hash, a page signature, an unsigned spec commit and a turn count.

## Changes from the task's appendices

| Change | Why |
|---|---|
| `carousel.yaml` gains `factory.account` ("Security account") and the pipeline box's `mark` ("Holds the only deploy key") | The task asked for a line marking the factory's edge and a pipeline marked "holds the only deploy key". The edge became the security account's frame when the owner said everything is the factory. Both labels go in the content file, so the template holds no text of its own |
| The Phrasing check lets a command-line flag pass in a tool's name, and only there | Appendix A's tool name `pip --require-hashes` would otherwise fail the owner's own content. `--` anywhere else fails |
| Three lines of copy changed at the owner's request: "It returns a patch" became "It hands back a proposed change and nothing else", the sandbox blurb ends "its only output is a proposed change", and a row reads "before the change leaves the sandbox". The subtitle ends "an example of the kind of tool that does it", not "tools to start with". `legend.tools`, `labels`, `poster` and "Always on" in the legend are new | "Patch" reads as a bug fix to a reader outside git. The tools are examples of a kind of tool. The rest keep the templates free of text and explain the all-dark bar |
| The display face is Archivo SemiExpanded ExtraBold, at 112.5 % width | The design asks for `font-stretch: 115%` of a variable Archivo. No static instance is 115 %, and a variable font becomes Type 3 glyphs in the PDF. CSS matching picks the 112.5 % face for 115 % |
| `@page` and a named `@page dark` carry the page colours | Chromium rounds each page to 1013.04 pt, 0.72 px taller than a slide, and nothing on the slide paints that strip. Without this, every page ended in a white line, visible under the dark cover and close |
| The cover's top line holds the byline. A row's `ref` shows as "OWASP LLM01". `text-wrap: pretty` and `nowrap` on a few lines, and `overflow-wrap: anywhere` on row text | The byline appears once, where carousels usually put it. The prefix names the list the ID comes from. The others stop one-word last lines and keep a long word inside its margin |
| The workflow is staged at `proposals/practices-carousel/github-workflows/`, not `proposals/github-workflows/` | CLAUDE.md's batch layout, which `land.sh` reads |
| CLAUDE.md's file map is unchanged | It does not list `factory-video/` either, and the unlanded `sandbox-gate` batch stages `CLAUDE.md`, so a second copy would make one of the two restage. The kit's README explains it |
| No backlog item | Three unlanded batches (`sandbox-gate`, `sca-expiry-warning`, `deploy-paths`) stage copies of `.tasks/backlog.jsonl`. A new line on `main` would make each copy stale |

## Landing

1. The agent's commits sit in one chain on a `candidate/` branch, whose pipeline run must pass on its tip. The chain holds the kit, this decision, the batch and its notes. It touches no protected path and no deployable path, so `main`'s run deploys nothing (SPEC-001-R232).
2. The owner moves that tip to `main` with `land.sh --to-main`, which pushes the whole chain. The batch needs no `requires:` line: it reaches `main` in the same push as the kit, so the kit is always there first.
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
| 4 | The single-image poster built from the same data | (a) A second template later. (b) Now | The owner chose (b) on 2026-11-14: a one-pager of the current carousel, as the factory view | (b): `poster.html` |
| 5 | Archivo's width | (a) Keep the static 112.5 % face. (b) Pin a 115 % instance cut from the variable font | (a). (b) needs a font tool the kit does not have and a new pinned file; the two faces differ by 2.5 points of width | (a) |
| 6 | Whether to protect more of the kit than `fonts.json` | (a) No: the pins record the approved files, as for the factory video. (b) Also `practices-carousel/build.sh`, `lib.mjs` and both templates, which decide what is downloaded and loaded | (a). (b) puts every layout edit behind a signature, for a kit with no credentials whose output only the owner posts | (a) |
| 8 | Whether the carousel accounts for the AWS Deployment Pipeline Reference Architecture's application pipeline ([the page](https://aws-samples.github.io/aws-deployment-pipeline-reference-architecture/application-pipeline/index.html), read 2026-11-14) | Appendix A kept its secrets, SAST, SCA and DAST checks and dropped its unit, integration, acceptance, performance and resilience tests, infrastructure scans, SBOM, build-once artifact and progressive release. (a) Four grouped rows, `source: dpra`. (b) One "keep every stage" row. (c) A line naming it as the baseline | The owner chose (a) on 2026-11-14 | Four rows: "Unit tests and code-quality checks on every change" and "Scan infrastructure code and publish an SBOM" on page 4; "Integration, acceptance, load and resilience tests in a staging environment" on page 5; "Release progressively, and roll back when alarms or synthetic tests fail" on page 7, the page that watches production, because page 5 overflowed with it. The attestations row now reads "Build the artifact once and sign its attestations, and deploy verifies them first". Not added: database deploys, as the talk's service has none, and the DPRA's metrics, beside the revert rate on page 8 |
| 9 | What to take from the owner's "Pipeline view" poster of 43 practices, shared on 2026-11-14 for additions and changes | Its three practices the carousel lacked, and its fuller tool examples | Added, at the owner's request: "Cap turns and spend on every agent run" (LLM06, page 3), "Record a hash of every agent input: instructions, skills, MCP config and model" (LLM08, page 5) and "Allowlist MCP servers by exact command or URL" (LLM04, page 6), each `source: pipeline-view`. Specs are written in EARS, Gherkin and Markdown, as the owner said; secrets add TruffleHog, SCA Trivy, DAST Nuclei. 43 rows. To fit, the staging-tests row moved to page 4, each section's summary widened from 42 to 52 characters, and the legend's tools line shortened to "Tools are examples", which keeps every legend to two lines; the cover's subtitle still says "an example of the kind of tool that does it" | Done. The owner then judged "Flag agent tests that assert nothing" covered by the mutation check, so that row went, and "Run unit tests and code-quality checks in the sandbox and again in the pipeline" (page 3) cites its practice, P11, as the ESLint rule that flags such a test is a code-quality check. 42 rows; no section page is at the 0.80 floor |
| 10 | Which OWASP list the `ref` IDs name | The OWASP Top 10 for LLM Applications 2026, as the pipeline view says. Correction: an earlier version of this row said the list was the 2025 edition and that three IDs did not match it. That came from OWASP's web page, which on 2026-11-14 still showed the 2025 list; the owner showed the 2026 document's contents, against which every ID matches (LLM01 Prompt Injection, LLM03 Excessive Agency, LLM04 Supply Chain, LLM05 Data and Model Poisoning, LLM06 Unbounded Consumption, LLM08 Hidden Context Exposure) | Name the list | `legend.owasp`, "OWASP IDs: Top 10 for LLM Applications 2026", on the cover and in both of the poster's legends. The section pages' legends have no room for a third line |
| 7 | Two of Appendix A's rows, as the review read them | "Gate on mutation score" calls an automated check a gate, a word this repository keeps for human approvals. "Observes: read telemetry redacted" is tagged sandbox in the hours window, which the legend calls production, while the sandbox has no network | The first could read "Fail a change whose mutation score drops, on changed code only". The second could move to the inspector, or keep the sandbox tag if the agent reads an exported, redacted copy | The owner chose on 2026-11-14: the first reads as suggested, and "Observes" moved to the inspector section, tagged inspector |
| 11 | A receipt page | On 2026-11-14 the owner asked whether a sample receipt could show "No evidence, no deploy" and many of the 42 practices, then asked for it as page 11. The first version invented its values; the owner called it marketing. The second showed run 114's printed lines and log quotes; the owner said it needs actual hashes and digital signatures | Show the delivery `main` run 114 deployed with every hash and signature in full, from git and Sigstore's public log, each verified offline (SPEC-001-R45, R48, R50, R55, R56) | Done. The approver's SSH signature, two DSSE signatures, two Fulcio chains and two Rekor entries verify with `node:crypto`. Anyone can look up both entries at search.sigstore.dev. The page covers 10 rows in full and 12 in part. `docs/notes/practices-carousel.md`, "Page 11: a real receipt", records how |

## Not yet verified

- The workflow has never run. Its first run is on the commit that lands it. Its checkout fetches the whole history, so the Receipt check can read commits `9f959a3` and `c7c6b4d`.
- Run 114's logs expire under GitHub's retention period. The Receipt check reads only the repository's copies of the few values that only a log holds, quoted in the batch notes on 2026-11-14. Every hash and signature it verifies from git and `evidence/`, which do not expire.
- The trusted root's TUF metadata. `evidence/sigstore-trusted-root.json` is the file Sigstore's TUF CDN served under the SHA-256 `targets.json` names. The check does not verify TUF's signatures back to a root of trust.
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
