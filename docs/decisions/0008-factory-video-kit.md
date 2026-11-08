# 0008. The software-factory video kit lives here

- Status: Proposed
- Date: 2026-11-08
- Requirements: none of its own. The kit is talk material, outside the export service, like the walkthrough kit in decision 0001. Its claims ledger cites requirements in `specs/`, drafts in decisions 0004 to 0006, and backlog items
- Moves: `talks/who-gets-the-keys/video/factory/` and `.github/workflows/factory-assets.yml` from PaulDuvall/paulmduvallcom, as of its `main` at `32279b9` (revision 19 of the scene)
- Needs an approver's signature for: the batch `proposals/factory-video/`, landed with `scripts/bootstrap/land.sh proposals/factory-video`
- Staged on: `main` at `c708a0e`. `claude/hopeful-sagan-ae220j` also changes `specs/protected-paths.txt`, so whichever of the two lands second restages its copy

## Context

The talk's software-factory scene is an SVG animation with a narrated, captioned guided video, a GIF for the deck and a poster. It was built in PaulDuvall/paulmduvallcom by a workflow that deleted and recreated one GitHub release on every build, so only the newest files were kept. That workflow needed `contents: write` to manage the release and its tag.

The scene depicts this repository: decisions 0004 to 0006 and the specs they draft. Building it here keeps the picture next to the code it describes.

## The video is the target; the ledger is the check

The owner's direction of 2026-11-08: the video shows what the repository should look like and do, not what it does today. It is a way to check the implementation against the ideal. That keeps decision 0006's direction, in which the specs catch up with the video.

An earlier instruction the same day asked for the opposite: every on-screen claim backed by a requirement on `main`, and anything else labelled planned or cut. That would have reversed 0006. The owner's later direction superseded it. Its mechanism survives as the check below, which reports gaps instead of cutting them.

`factory-video/claims.json` assigns every on-screen label and every narration line to a claim. Each claim cites what exists:

| Status | Evidence | Where it must exist at the build commit |
|---|---|---|
| built | Requirement IDs, or a file that must contain a given string | `specs/`, or the file |
| planned | Draft requirement IDs | `docs/decisions/` or `proposals/` |
| open | Backlog IDs | `.tasks/backlog.jsonl` |
| partly built | Built evidence plus planned or open items | Both |
| illustrative | Example values such as SPEC-118, which claim nothing | None |

`verify.mjs` fails the build if a label or line has no claim, a cited ID or string is missing, or a planned ID has since reached `specs/` and should move to built. A gap does not fail. Each build writes `out/claims-report.md`, which the artifact carries.

At revision 20 the ledger holds 26 claims: 11 built, 6 partly built, 6 planned, 1 open (DAST: decision 0006 G3 recommends dropping it, and backlog `who-gets-the-keys-wum` holds the owner decision) and 2 illustrative.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The kit lives in a new top-level `factory-video/` | `video/**` triggers the walkthrough's 120-minute build. `tsconfig.json` includes `video` but not `factory-video`, so the kit's browser scripts stay out of the typecheck |
| 2 | GitHub Actions builds it with `.github/workflows/factory-video.yml`, on a push to `main` that touches the kit or the workflow, and on demand | Generated files are never committed |
| 3 | Each build uploads one artifact, `factory-video-<short SHA>-<UTC time>`. A separate `prune` job deletes every earlier `factory-video-` artifact | One file of each type is kept: the newest. It is the walkthrough's pattern (SPEC-002-R15) |
| 4 | The build job has `contents: read` only; the prune job `actions: write` only | No job can push, tag or release |
| 5 | Artifacts expire after 30 days. A run on demand rebuilds the newest | Storage stays ephemeral |
| 6 | Playwright comes from `video/record`'s pinned package, through `factory-video/playwright.mjs` | No npm dependency is added, so no new `package.json` or lockfile |
| 7 | Kokoro is pinned in `factory-video/narration/`: `requirements.in` (`kokoro-onnx==0.6.1`), the hash-pinned `requirements.txt`, and the model files' SHA-256 in `models.json`. CI installs it with `pip install --require-hashes` | The same pinning as SPEC-002-R8's `piper-tts`. The `sca` check already scans `**/requirements.txt` |
| 8 | The batch adds `kokoro-onnx` to `allowed-deps.txt`, and `factory-video/narration/`, `factory-video/package.json` and `factory-video/package-lock.json` to `specs/protected-paths.txt` | CLAUDE.md forbids the agent from adding dependencies. Every manifest or lockfile the kit has, or ever gets, needs an approver's signature. SPEC-001-R3 reads only `package.json` files, so the `allowed-deps.txt` line records the approval rather than being checked |
| 9 | The agent does not push to `main` | A push to `main` starts a deploy, and backlog `who-gets-the-keys-nh9` (deploy only when deployable paths change) is not done |

## Landing

1. The agent's commits sit on `candidate/factory-video`, whose pipeline run must pass.
2. The owner moves that commit to `main`. `land.sh` starts only from `origin/main`, so the batch has to be there first.
3. The owner runs `scripts/bootstrap/land.sh proposals/factory-video`. It moves three files in one signed commit with `Spec: SPEC-001-R12` and `Spec: SPEC-001-R3`:

| In the batch | Lands at | Change |
|---|---|---|
| `github-workflows/factory-video.yml` | `.github/workflows/factory-video.yml` | New workflow |
| `protected-paths.txt` | `specs/protected-paths.txt` | Adds `factory-video/narration/`, `factory-video/package.json`, `factory-video/package-lock.json` |
| `allowed-deps.txt` | `allowed-deps.txt` | Adds `kokoro-onnx` |

Landing that commit starts the workflow's first build, because it touches the workflow.

## Changes made for this repository

- `render.js` became `render.mjs`: the root `package.json` sets `"type": "module"`, and the lint config forbids `require()`.
- `loop.js` parses each frame's SVG with `DOMParser` and swaps the nodes in, rather than assigning `innerHTML`. It also lost an unused constant, which failed the lint check's first run (`@typescript-eslint/no-unused-vars`).
- `narration.js` names each line's SHA-256 `digest`, not `key`, so gitleaks's generic API-key rule has nothing to match. The values are unchanged.
- The model files' SHA-256 moved from `narrate.py` into `narration/models.json`, so every pin sits in one protected folder.

## Decisions for the owner

| Question | Options | Recommendation |
|---|---|---|
| Kokoro runs in-process | (a) Keep: `narrate.py` imports `kokoro_onnx`, which loads phonemizer and espeak-ng. (b) Run it only as a separate program from a venv under `build/`, as SPEC-002-R8 does for Piper, so no repository file imports it. (c) Use the walkthrough's Piper voice and add no dependency | (b) if R8's rule should hold for every voice. Licences, my reading at medium confidence: phonemizer and espeak-ng are GPL-3.0, kokoro-onnx is MIT |
| Should the allowlist check read Python requirements too? | (a) No: the line in `allowed-deps.txt` records approval. (b) Amend SPEC-001-R3 to read every `requirements.in` | (b) makes the approval a check, not a convention |

## Consequences

- PaulDuvall/paulmduvallcom's copy, its `factory-assets.yml` and its `factory-latest` release are removed once this repository's workflow has run green.
- The scene's checks (`factory-video/verify.mjs`, 36 with the claims ledger) run inside the build job, not in `npm run checks`, as the walkthrough's do.
- The kit's files face this repository's pipeline checks: secrets, lint, SAST and SCA.

## Not yet verified

- `zizmor` has not audited the proposed workflow. The agent cannot install it, and the `workflows` check audits only `.github/workflows/`. It runs on the signed commit that lands the file.
- That `npx --no-install playwright install chromium` in `video/record` reaches its download host from the runner. The walkthrough's build runs the same command.

## Options considered

| Option | Why not |
|---|---|
| Keep the release, deleted and recreated each build | Needs `contents: write`, which can push code and create tags |
| Artifacts with no prune job | One artifact per run until each expires: several copies at once |
| The kit under `video/factory/` | Triggers the walkthrough's build on every change |
| A new npm package for the kit's Playwright | A dependency, a lockfile and an `allowed-deps.txt` entry for something `video/record` already pins |
| Cut every claim not on `main` | Superseded by the owner: the video is the target, and the ledger reports the gap |
