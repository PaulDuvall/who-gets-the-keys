# 0001. Walkthrough video generated from repo state

- Status: Accepted
- Date: 2026-10-20
- Requirements: SPEC-002-R1 to SPEC-002-R16
- Modeled on: an earlier private repository ADR-0018 at `469f0fda93535e0b4a40fe61d22d6e122064d309`

## Context

<!-- PAUL: one-paragraph context for why the repo generates its own walkthrough video -->

## Decisions

| # | Decision |
|---|---|
| 1 | The kit lives under `video/`; `npm run video` builds everything into `build/video/` |
| 2 | The page is generated from `practices.yaml`, `scenarios/scenarios.yaml` and live check and scenario results at the current commit; it is never hand-authored |
| 3 | The orchestrator is TypeScript; the recorder and headless check are Node.js, reused from the reference with its page contract (`window.walkthrough`, `.wrap`, caption row) |
| 4 | Piper runs as a separate program from a hash-pinned environment under `build/`; nothing imports, links or ships it |
| 5 | The build checks its own output against measured thresholds and writes `report.json`; one frame per line is a session's look (`.claude/skills/video/SKILL.md`) |
| 6 | Built on demand and on pushes that change its inputs, never on every push; the video is never committed |
| 7 | Only a `--page-only` build's page is published, never a page from a workflow artifact |
| 8 | Narration is filled from `video/narration-templates.yaml`; `video/narration/<step ID>.md` files are the owner's overrides |

## Pinned and not pinned

| Item | Pinned by | Not pinned, recorded in report |
|---|---|---|
| piper-tts 1.8.0 and dependencies | version and hash, `video/narration/requirements.txt` | |
| Voice `en_US-ljspeech-medium` | URL at tag v1.0.0 and SHA-256, `video/narration/voice.json` | |
| Playwright | version in `video/record/package-lock.json` | |
| Chromium build | | yes: installed by Playwright without a hash the kit checks |
| ffmpeg, ffprobe, Xvfb | | yes: from the machine |
| Node.js, npm, uv | | Node.js version recorded; uv pinned in CI setup |
| Fonts | | none loaded: the page uses system fonts |

## Options considered

| Option | Verdict |
|---|---|
| A. Hand-authored page with drift tests, as the reference | Rejected: generated pages cannot drift from the repo |
| B. Port the orchestrator to TypeScript, keep the Node.js recorder | **Chosen**: one language for repo code |
| C. Keep the Python orchestrator | Rejected: a second language for repo code |
| D. Full build on every push | Rejected: browser, voice download and real-time recording on every push |
| E. Commit the video | Rejected: binary history, and a committed video can go stale |
| F. Voice `en_US-joe-medium`, as the reference | Rejected: open licence question on its fine-tune lineage (reference Q29); ljspeech is trained from scratch on public-domain data |

## Sources

| Source | Checked |
|---|---|
| https://pypi.org/pypi/piper-tts/1.8.0/json | 2026-10-20 |
| https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/MODEL_CARD | 2026-10-20 |
| https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/browsers.json | 2026-10-20 |
| Reference `docs/decisions/0018-explainer-kit-in-the-repository.md` and `explainer/README.md` at `469f0fd` | 2026-10-20 |

## Consequences

| Consequence | Mitigation |
|---|---|
| An unhashed browser runs on the runner | Workflow has `contents: read` and `actions: read` only (the second fetches the B9 replay log), no secrets, no AWS, no caches; page SHA-256 recorded before the browser starts |
| GPL-3.0-or-later narration engine | Run as a separate program, never distributed |
| A check or scenario regression fails the video build | Intended: the video shows only verified runs |
