# Progress batch (backlog who-gets-the-keys-p9v)

Staged in `proposals/progress/` on 2026-11-12, after the owner asked to see, without asking, what is built against the specs, in the README and the factory video. New SPEC-001-R226 to R229.

## What lands, and how

| Part | Where | Signed |
|---|---|---|
| `scripts/progress.ts`: one record of progress, and the claim statuses the factory video reports | Agent commit, before the batch | No |
| `factory-video/verify.mjs` takes claim statuses and citation checks from `scripts/progress.ts`, so the video and the README cannot disagree. It is also stricter: a claim's open backlog item must still be open | Agent commit, before the batch | No |
| Spec rows R226 to R229, traceability, the `progress` npm script, `test/progress.test.ts`, the README's picture and badges, and `docs/progress.json` and `docs/progress.svg` | `proposals/progress/` | Yes |

The batch is built on `proposals/owner-tooling/`'s spec and traceability copies, and its `LAND.txt` requires `| SPEC-001-R225 |`, so `land.sh` refuses it until owner tooling has landed.

`docs/progress.json` and `docs/progress.svg` are staged as computed for the tree after both batches land: 107 requirements approved, 164 drafted; claims 12 built, 5 partly built, 6 planned, 1 open, 2 illustrative; practices 26 of 46 shown; 22 scenarios, 19 local; backlog 26 open, 3 closed. Any commit to `main` between this staging and the landing that changes `specs/`, `docs/decisions/`, a staged `SPEC-*.md`, `factory-video/claims.json`, `practices.yaml`, `scenarios/scenarios.yaml` or `.tasks/backlog.jsonl` makes them stale, and the preflight then fails until they are restaged.

## The factory video's end card (SPEC-001-R229)

The owner chose an end card on 2026-11-12: the video keeps showing the whole target, then a silent 6 s card holds the closing overview frame and shows what is built and what is left. The guided video grows from 118.8 s to 124.8 s. Two layouts were rendered and rejected before this one: text tags beside each label covered neighbouring boxes, and tags above each label covered the checks grid. Outlines cover no text: amber for planned, red for open, purple for partly built, because the video keeps blue for the places a human decides. A planned or open label is also faded. The caption gives the counts.

`build.sh` writes `frames/progress.js` with `node scripts/progress.ts --video-data` before it renders. That path uses no package, because the video's build job installs none at the repository root; it was run with `node_modules` moved away. `verify.mjs` now checks that the story's first frame equals its last frame before the end card, and that the end card outlines at least one label and captions the counts. In the container, every guided check passed except the two that need the voice and the rendered MP4, which only the `factory-video` workflow has. That workflow builds the whole video on the push to `main` that lands these files.

## Preflight

In a scratch worktree of this commit's tree with both batches' moves applied, on 2026-11-12: `tsc`, ESLint on the new and changed files, the trace, slides and secrets checks and `verify.mjs --only claims` passed, and every test passed, 22 files and 334 tests, with a `seq` that behaves as macOS's on `0`.

## Review

An independent subagent reviewed `9f57f56` against R226 to R228 and backlog p9v. It confirmed the staged `docs/progress.json` and `docs/progress.svg` byte for byte against a tree with both batches landed, every test passing, and `verify.mjs --only claims` passing with no `node_modules`.

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | A backlog status other than open counted as closed | medium | Fixed: only `closed` counts as closed, and any other status throws. Tested |
| 2 | Untracked or ignored markdown counted, against "committed files only" | medium | Fixed: files come from `git ls-files`. Tested with an untracked spec copy |
| 3 | The main-module guard failed for a path with a space, so `npm run progress` could exit 0 and write nothing | medium | Fixed with `pathToFileURL` |
| 4 | An unknown coverage or `requires` value counted in no bar | low | Fixed: it throws. Tested |
| 5 | verify.mjs now takes drafts under `proposals/` only from `SPEC-*.md` copies | low | Kept: R226 says so. A planned ID held only in a staged decision copy now fails the ledger until the decision lands |
| 6 | Every spec landing and backlog status change makes the record stale, so every batch must stage a regenerated record, built on the batch before it | medium | Kept, by design: that staleness is what the owner asked to see. The rule belongs in `CLAUDE.md`'s batch conventions, with batch D (backlog w2h) |
| 7 | Tests missed file evidence, an undrafted planned ID, a draft in a staged spec copy, and the counting and throw paths of `progress()` | medium | Fixed: a fixture repository covers each |
| 8 | The no-time check matched only ISO date-times | low | Fixed: also dates and clock times |
| 9 | SVG: 4.16:1 text on dark, no legend swatches, two greens, no `<title>`, alt text with no numbers, "1 need" | low to medium | Fixed: dark-theme text colour, swatches, distinct hues, a `<title>` with every count, alt text that names `docs/progress.json`, reworded labels. Checked by rendering both themes |

After the fixes and the end card, the preflight ran again on a tree with both batches landed: `tsc`, ESLint, the trace, slides and claims checks passed, and every test passed, 22 files and 337 tests, with macOS-style `seq`.
