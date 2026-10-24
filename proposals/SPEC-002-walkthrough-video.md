# SPEC-002: Walkthrough video

<!-- PAUL: one-line description of the intent behind this spec -->

Status: approved by signed commit. Adapted from an earlier private repository at commit `469f0fda93535e0b4a40fe61d22d6e122064d309`, `specs/requirements.md`. "Source" names the reference requirement each one came from; "prompt" means the build prompt.

| Term | Meaning |
|---|---|
| video kit | `video/` and the `npm run video` command |
| build | one run of `npm run video`, writing `build/video/` |
| timeline | per tour line: `start`, `voice_at` and clip length, plus `total` |
| video time zero | the first timeline entry's `start` |

## Requirements

| ID | Source | Requirement |
|---|---|---|
| SPEC-002-R1 | REQ-DEMO-003 | WHEN a build starts, THE video kit SHALL refuse to run if the working tree is dirty, or if node, npm, ffmpeg, ffprobe, Xvfb or uv is missing, before fetching anything, and SHALL then remove the previous build's page, video, captions and report. |
| SPEC-002-R2 | REQ-DEMO-003 | THE video kit SHALL give each build step a time limit. IF a step fails or runs past its limit, THEN THE video kit SHALL stop its process group with SIGTERM and, after a grace period, SIGKILL, SHALL exit with status 1, and SHALL name the step in the report's `problems`. IF the build receives SIGINT, SIGTERM or SIGHUP while a step runs, THEN it SHALL stop that step's process group the same way and SHALL exit with 128 plus the signal number. |
| SPEC-002-R3 | prompt | WHEN a build runs, THE video kit SHALL run `npm run gates` and the scenario harness and capture every result before generating the page. |
| SPEC-002-R4 | REQ-DEMO-003, prompt | THE video kit SHALL generate the page from `practices.yaml`, `scenarios/scenarios.yaml` and the captured results at the current commit, and SHALL record the page's SHA-256 and the commit SHA in the report before any browser starts. |
| SPEC-002-R5 | prompt | THE page's tour SHALL have an opening step with the repo name, commit SHA, commit date and the captured pass line of every gate on that commit; one step per scenario, headed by the practice it maps to, showing the scenario's change (its commit message and the patch's changed lines under their file names, or its fixture) and its captured output up to and including its expected line, revealed line by line; one step per practice with coverage `good-only`, showing the captured pass line of each gate that enforces it; and a closing step listing every `partial` and `not-shown` practice with its reason. IF a `good+bad` practice maps to no scenario, or a scenario's captured line differs from its `expect`, THEN the build SHALL fail. |
| SPEC-002-R6 | prompt | WHERE a scenario requires GitHub Actions or the sandbox account, THE page SHALL show its lines from the log passed with `--on-demand-log`, or, without one, SHALL state that the scenario needs GitHub Actions or the sandbox account and was not recorded. WHERE a log is passed, THE report SHALL record its SHA-256. |
| SPEC-002-R7 | REQ-DEMO-003 | WHEN a build fetches the voice files, THE video kit SHALL verify each against its pinned SHA-256. IF one differs, THEN the build SHALL exit with status 1 before narrating and SHALL write no video. |
| SPEC-002-R8 | REQ-DEMO-003, REQ-DEMO-005 | THE video kit SHALL install `piper-tts` from hash-pinned requirements into an environment under `build/` and SHALL run it only as a separate program. No file in the repository SHALL import, link or ship it. |
| SPEC-002-R9 | prompt | THE video kit SHALL fill each tour line from the template for its step type in `video/narration-templates.yaml`, unless `video/narration/<step ID>.md` exists, which SHALL replace it. Spoken audio SHALL use the spoken-forms table; the screen and captions SHALL show the written form. |
| SPEC-002-R10 | REQ-DEMO-003 | WHEN a build records, THE video kit SHALL check the page headlessly at 1280 and 400 px, SHALL record the tour under Xvfb on the narration timeline at 1920x1080 and 30 frames per second, and SHALL place each frame at its wall-clock time less the recorder's time zero. |
| SPEC-002-R11 | REQ-DEMO-004 | WHEN the video is written, THE video kit SHALL check that each line's voice starts within 50 ms of its `voice_at` plus its clip's lead-in silence, that each line after the first changes slide within 0.25 s of its `start` (the largest scene-change score of at least 0.03 within 1 s), that the video has one H.264 and one AAC stream at 1920x1080 and 30 fps, and that its length is within 0.5 s of `total`. IF a check fails, THEN the build SHALL exit with status 1 and the report SHALL name each failed check. |
| SPEC-002-R12 | REQ-DEMO-003, REQ-DEMO-004, prompt | THE video SHALL carry one chapter marker per tour step, and THE build SHALL write `captions.srt` with one caption per tour line and `report.json` with the versions of ffmpeg, Node.js and the browser. |
| SPEC-002-R13 | REQ-DEMO-003 | WHERE `--page-only` is given, THE video kit SHALL write only the page and SHALL run no browser. |
| SPEC-002-R14 | prompt | WHERE `--still <scenario ID>` is given, THE video kit SHALL write one PNG frame of that scenario's step, 0.5 s after its voice starts. |
| SPEC-002-R15 | REQ-DEMO-006 | WHEN the video workflow is started by hand, or by a push to `main` changing `video/**`, `practices.yaml`, `scenarios/**` or the workflow, THE video kit SHALL run the build on a GitHub-hosted runner with only `contents: read` and `actions: read`, no persisted credentials, no secrets, no AWS access, no caches and every action pinned to a SHA. THE workflow SHALL pass the build, with `--on-demand-log`, the B9 replay log uploaded by the `scenarios.yml` run for the same commit, waiting up to 20 minutes for that run, and SHALL build without it, printing why, if that run does not succeed in time. THE workflow SHALL upload the video, page, captions and report as one artifact even when the build fails. |
| SPEC-002-R16 | REQ-DEMO-005 | THE video kit SHALL stay outside the product: none of its files SHALL be packaged into the Lambda artifact, and none of its code SHALL import an AWS SDK. |
