# Owner queue hand-off, 2026-11-13

For the next agent session. Read this and `CLAUDE.md` first. It replaces `docs/notes/owner-queue-handoff-2026-11-11.md` as the current queue; that note's appendix still holds the land.sh simulation procedure.

## Where things stand

`main` is at `53b1d63`. The commit holding this note, and the two before it, are on `candidate/handoff-2026-11-13` until the owner moves `main` to it (step H-1).

Landed on 2026-11-12 and 2026-11-13, each verified through the GitHub connector:

| Commit | What | Backlog |
|---|---|---|
| `1d6aed9` | Owner tooling: `doctor.sh`, land.sh and aws-setup.sh fixes, SPEC-001-R218 to R225 | k7d, closed |
| `2a86484` | Progress record, README badges, factory-video end card, R226 to R229 | p9v, closed |
| `d809d3a` | Owner-step rules in `CLAUDE.md`, the `no-inner-worktree` hook, R230 | w2h, closed |
| `e706c3a` | Backlog: Pages for the factory video | v5p, open |
| `0587958` | Backlog: deploy on evidence (g4e), one push per batch (o1p) | open |
| `53b1d63` | Backlog s3p; g4e held behind it; nh9 staged in `proposals/deploy-paths/` | s3p, nh9 open |

Every deploy since 2026-11-11 reported Terraform `No changes.`

## Owner queue, in the only order that works

Give one step at a time, in the "Owner steps" format, and read each result yourself before the next.

| Step | Command | Deploy approval |
|---|---|---|
| H-1 | `scripts/bootstrap/land.sh --to-main <tip of candidate/handoff-2026-11-13> candidate/handoff-2026-11-13` | yes, expect `No changes.` |
| N-2 | `scripts/bootstrap/land.sh proposals/deploy-paths`, signed | yes: it changes `pipeline.yml`, which is deployable |

Before N-2, simulate it on the new `main`: 12 moves, and no "Changed since by" warning is expected. After N-2, a push that changes nothing deployable since the last deploy that succeeded skips the deploy (SPEC-001-R232), so backlog, docs and `proposals/` pushes stop asking the owner. Confirm that on the first such push: the deploy job is `skipped`, and `land.sh` prints "Nothing deployable changed since the last deploy".

## Backlog, by what the owner asked for

| Item | State | Next |
|---|---|---|
| nh9, skip the deploy when nothing deployable changed | staged, reviewed, preflighted | N-2 above. Notes: `docs/notes/deploy-paths.md` |
| s3p, checks of record from code the candidate cannot change, and a promote App | open | Design note first. Its open question: can a repository owned by a personal account use a ruleset that requires a workflow from another repository? Read GitHub's "Available rules for rulesets" page; this session could not |
| g4e, deploy to `sandbox` with no reviewer | held behind s3p | Staged on `candidate/sandbox-gate`, not landed. Rebuild it after s3p and after nh9, which also changes `land.sh`. Drop its R221 change. Notes: `docs/notes/sandbox-gate.md` |
| o1p, land a signed batch with one push to `main` | open | Mechanical; no trust change. Changes `land.sh`, so build on nh9's landed copy |
| v5p, publish the factory video to GitHub Pages | open | Not staged yet. Pins verified with `git ls-remote` on 2026-11-13: `actions/deploy-pages` v5.0.1 `368f82528645a54fb793d4d04e342629a3f51346`, `actions/upload-pages-artifact` v5.0.0 `fc324d3547104276b827a68afc52ff2a11cc49c9`. Deploy job: `pages: write`, `id-token: write`, environment `github-pages`. The newest factory-video artifact, all eight files zipped, is 68.5 MB, so the guided video fits Pages' 100 MB file limit. The owner turns on Pages, source "GitHub Actions", in the repository settings; check GitHub's docs for where before saying so |
| s7e, sca exceptions | open | Its title names expiries on 2026-11-22 and 2026-11-30. When one passes, the sca check fails on `main`. Due before the others |
| r3m, alarm on refused break-glass attempts | open | Priority 1; amends R217; needs an owner apply |

Dependabot reports 6 moderate alerts on `main`; the sca check passes. Compare them with OSV when s7e is done.

## What this session learned

| Lesson | Rule |
|---|---|
| The g4e batch removed the only human step between a commit that rewrites its own checks and AWS. The commit defines the workflow and `scripts/checks.ts` that check it | Before removing a human gate, list what still stops an unsigned commit that edits `scripts/checks.ts` and `pipeline.yml` together. Running R109 inside this repository does not close that |
| The candidate run failed twice on `test/progress.test.ts`: a staged `SPEC-*.md` copy drafts requirements, and the branch's own record did not count them | Run `npx vitest run test/progress.test.ts` on the branch as pushed, not only on the landed tree |
| `land.sh` dates a staged copy by the commit that added it. Regenerating the live progress record after staging drew a "Changed since by" warning, which `CLAUDE.md` says to answer no to | Stage `docs/progress.*` last, after every live regeneration, or drop and re-add them in two commits, as done here |
| A staged `land.sh` copy written with python was mode 644; the land test caught it | `chmod 755` every staged script before `git add`, then `git ls-files -s` |
| `aws-setup.sh` runs `github.sh`; a change to `github.sh` broke `test/aws-setup.test.ts`, which the author had not run | Run the full suite before calling a batch preflighted |
| A batch that changes `pipeline.yml` can break a scenario patch (B10) | `git apply --check` every scenario patch on the landed tree, and run the scenarios that touch a moved file |
| The owner's pastes twice came from terminal scrollback of an earlier landing | Ask for the summary block, and check its `mode:` and commit before acting on it |
| A deploy waited for approval for 16 hours after the owner's `land.sh` stopped watching | Before giving a step, list `main`'s runs with status `waiting`; if one exists, the step is to approve or reject it |

## Owner preferences that apply

The owner reads on macOS zsh, with Homebrew `node@24` keg-only and one YubiKey. Commands stay under 120 characters per line and carry no `#` comments. The owner wants to know at any moment whether they are waiting on the agent: say so first, plainly.
