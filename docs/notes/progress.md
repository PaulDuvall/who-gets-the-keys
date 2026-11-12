# Progress batch (backlog who-gets-the-keys-p9v)

Staged in `proposals/progress/` on 2026-11-12, after the owner asked to see, without asking, what is built against the specs, in the README and the factory video. New SPEC-001-R226 to R228.

## What lands, and how

| Part | Where | Signed |
|---|---|---|
| `scripts/progress.ts`: one record of progress, and the claim statuses the factory video reports | Agent commit, before the batch | No |
| `factory-video/verify.mjs` takes claim statuses and citation checks from `scripts/progress.ts`, so the video and the README cannot disagree. It is also stricter: a claim's open backlog item must still be open | Agent commit, before the batch | No |
| Spec rows R226 to R228, traceability, the `progress` npm script, `test/progress.test.ts`, the README's picture and badges, and `docs/progress.json` and `docs/progress.svg` | `proposals/progress/` | Yes |

The batch is built on `proposals/owner-tooling/`'s spec and traceability copies, and its `LAND.txt` requires `| SPEC-001-R225 |`, so `land.sh` refuses it until owner tooling has landed.

`docs/progress.json` and `docs/progress.svg` are staged as computed for the tree after both batches land: 106 requirements approved, 164 drafted; claims 12 built, 5 partly built, 6 planned, 1 open, 2 illustrative; practices 26 of 46 shown; 22 scenarios, 19 local; backlog 26 open, 3 closed. Any commit to `main` between this staging and the landing that changes `specs/`, `docs/decisions/`, a staged `SPEC-*.md`, `factory-video/claims.json`, `practices.yaml`, `scenarios/scenarios.yaml` or `.tasks/backlog.jsonl` makes them stale, and the preflight then fails until they are restaged.

## Not in this batch

The factory video's on-screen statuses: the owner asked on 2026-11-12 that the video keep the whole target and also show what is built and what is left. How it shows that is a design choice for the owner; its requirement row comes with that change.

## Preflight

In a scratch worktree of this commit's tree with both batches' moves applied, on 2026-11-12: `tsc`, ESLint on the new and changed files, the trace, slides and secrets checks and `verify.mjs --only claims` passed, and every test passed, 22 files and 334 tests, with a `seq` that behaves as macOS's on `0`.

## Review

Pending.
