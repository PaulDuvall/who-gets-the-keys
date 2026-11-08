# 0007. The software-factory video kit lives here

- Status: Proposed
- Date: 2026-11-08
- Requirements: none. The kit is talk material, not part of the export service, like the walkthrough kit in decision 0001
- Moves: `talks/who-gets-the-keys/video/factory/` and `.github/workflows/factory-assets.yml` from PaulDuvall/paulmduvallcom, as of its `main` at `32279b9` (revision 19 of the scene)
- Needs an approver's signature for: the batch `proposals/factory-video/`, landed with `scripts/bootstrap/land.sh proposals/factory-video`

## Context

The talk's software-factory scene is an SVG animation with a narrated, captioned guided video, a GIF for the deck and a poster. It was built in PaulDuvall/paulmduvallcom by a workflow that deleted and recreated one GitHub release on every build, so only the newest files were kept. That workflow needed `contents: write` to manage the release and its tag.

The scene depicts this repository's model, decisions 0004 to 0006. Building it here keeps the picture next to the specs it shows, so a change to either is seen in one place.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The kit lives in a new top-level `factory-video/` | `video/**` triggers the walkthrough's 120-minute build, so a kit under `video/` would start it on every change. `tsconfig.json` includes `video` but not `factory-video`, so the kit's browser scripts stay out of the typecheck |
| 2 | GitHub Actions builds it with `.github/workflows/factory-video.yml`, on a push to `main` that touches the kit or the workflow, and on demand | Generated files are never committed |
| 3 | Each build uploads one artifact, `factory-video-<short SHA>-<UTC time>`. A separate `prune` job then deletes every earlier `factory-video-` artifact | One file of each type is kept: the newest. This is the walkthrough's pattern (`video.yml`'s `prune` job) |
| 4 | The build job has `contents: read` only. The prune job has `actions: write` only, to delete artifacts | No job can push, tag or release. The old release approach needed `contents: write` |
| 5 | Artifacts expire after 30 days. A run on demand rebuilds the newest | Storage stays ephemeral. Nothing outlives a month unless the kit changes or someone asks |
| 6 | Playwright comes from `video/record`'s pinned package, through `factory-video/playwright.mjs` | The kit adds no npm dependency, so `allowed-deps.txt` and both lockfiles are unchanged |
| 7 | The voice's pins live in `factory-video/narration/`: hash-pinned Kokoro requirements and the model files' SHA-256 in `models.json`. That folder joins `specs/protected-paths.txt` | Like `video/narration/`, changing a pin needs an approver's signature. The `sca` check already scans `**/requirements.txt` |

## What the approver signs

One batch, `proposals/factory-video/`, landed with `scripts/bootstrap/land.sh proposals/factory-video`. It moves two files in one signed commit, with the trailer `Spec: SPEC-001-R12`:

| Proposal | Lands at | Change |
|---|---|---|
| `github-workflows/factory-video.yml` | `.github/workflows/factory-video.yml` | New workflow |
| `protected-paths.txt` | `specs/protected-paths.txt` | Adds `factory-video/narration/` |

The workflow's first run is on that commit, because it touches the workflow file.

## Changes made for this repository

- `render.js` became `render.mjs`: the root `package.json` sets `"type": "module"`, and the lint config forbids `require()`.
- `loop.js` parses each frame's SVG with `DOMParser` and swaps the nodes in, rather than assigning `innerHTML`.
- `narration.js` names each line's SHA-256 `digest`, not `key`. The value is unchanged. A `"key": "<hex>"` pair is what gitleaks's generic API-key rule looks for.

## Consequences

- PaulDuvall/paulmduvallcom's copy, its `factory-assets.yml` and its `factory-latest` release are removed once this repository's workflow has run green.
- The scene's checks (`factory-video/verify.mjs`, 35 of them) run inside the build job. They are not part of `npm run checks` or the pipeline, the same as the walkthrough's.
- The kit's own files face this repository's pipeline checks: secrets, lint, SAST and SCA.

## Not yet verified

- `zizmor` has not audited the proposed workflow. The agent cannot install it, and the `workflows` check audits only `.github/workflows/`. It runs on the signed commit that lands the file.
- Whether `npx --no-install playwright install chromium` in `video/record` needs a host that the runner cannot reach. The walkthrough's build runs the same command, so it is expected to work.

## Options considered

| Option | Why not |
|---|---|
| Keep the release, deleted and recreated each build | Needs `contents: write`, which can push code and create tags |
| Artifacts with no prune job | One artifact per run until each expires: several copies at once |
| The kit under `video/factory/` | Triggers the walkthrough's build on every change |
| A new npm package for the kit's Playwright | Adds a dependency, a lockfile and an `allowed-deps.txt` entry for something `video/record` already pins |
