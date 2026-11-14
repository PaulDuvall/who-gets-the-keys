# Owner queue hand-off, 2026-11-13

For the next agent session. Read this and `CLAUDE.md` first. It replaces `docs/notes/owner-queue-handoff-2026-11-11.md` as the current queue; that note's appendix still holds the land.sh simulation procedure.

## Where things stand

Updated on 2026-11-14, after step H-3 below. `main` is at `12693a8`, and the owner queue is empty. SPEC-001-R232 is confirmed on `main`: see "H-3 result".

Landed on 2026-11-12 and 2026-11-13, each verified through the GitHub connector:

| Commit | What | Backlog |
|---|---|---|
| `1d6aed9` | Owner tooling: `doctor.sh`, land.sh and aws-setup.sh fixes, SPEC-001-R218 to R225 | k7d, closed |
| `2a86484` | Progress record, README badges, factory-video end card, R226 to R229 | p9v, closed |
| `d809d3a` | Owner-step rules in `CLAUDE.md`, the `no-inner-worktree` hook, R230 | w2h, closed |
| `e706c3a` | Backlog: Pages for the factory video | v5p, open |
| `0587958` | Backlog: deploy on evidence (g4e), one push per batch (o1p) | open |
| `53b1d63` | Backlog s3p; g4e held behind it; nh9 staged in `proposals/deploy-paths/` | s3p open |
| `79f0f06` | This note, first version (H-1). `main`'s run failed sca on GHSA-mf5v-w3w3-f6cg, published after the candidate run | none |
| `a6de08a` | sca exception for GHSA-mf5v-w3w3-f6cg, signed by the owner by hand (H-2). `docs/notes/sca-mf5v.md` | none |
| `894c313` | Skip main's deploy when nothing deployable changed, SPEC-001-R232 (N-2) | nh9, closed |
| `12693a8` | This note, second version, and `docs/notes/sca-mf5v.md` (H-3). main's run skipped the deploy | none |

Every deploy since 2026-11-11 reported Terraform `No changes.`; the deploys for `a6de08a` and `894c313` applied 0 added, 0 changed, 0 destroyed.

## Owner queue, in the only order that works

Give one step at a time, in the "Owner steps" format, and read each result yourself before the next.

| Step | Command | Deploy approval |
|---|---|---|
| H-1 | Done: `main` moved to `79f0f06`; its run failed sca | none: the deploy was skipped |
| H-2 | Done: the owner's hand-signed exception `a6de08a`, then `land.sh --to-main` | approved, `No changes.` |
| N-2 | Done: `land.sh proposals/deploy-paths`, signed, `894c313` | approved, `No changes.` |
| H-3 | Done: `land.sh --to-main 12693a8… candidate/handoff-2026-11-13b`, `main` moved to `12693a8` | none: the deploy was skipped (SPEC-001-R232) |

### H-3 result

Before H-3: the candidate run 43496219925 on `12693a8` passed, no run waited for approval, and the `scenarios` run 91 on `894c313` had passed.

H-3 was docs only, so it was the first push to test SPEC-001-R232's skip. Each row was read through the GitHub connector on 2026-11-13 after the owner pasted `land.sh`'s summary (`result: landed 12693a8 on main`, `main run 43511113696 for 12693a8: success, deploy skipped`).

| R232 clause | Observed in `main`'s run 43511113696 |
|---|---|
| `deploy` is `false` only when the newest `sandbox` deployment succeeded and no deployable path changed since it | `decide whether to deploy` printed `No deploy: nothing deployable changed since 894c31326283ff11b6dbfc08cb75a21699827c7b, the last commit deployed to the sandbox.` |
| The deploy job runs only when `deploy` is `true` | `deploy to sandbox` concluded `skipped` |
| checks, build, attest and receipt still run on every push | all four `success`, so `12693a8` keeps its receipt |
| `land.sh` says there is nothing to approve | summary `success, deploy skipped`; no run waited for approval afterwards |

R232's other outcome had already happened on `main`: run 43494825218 for `894c313` printed `Deploy: a deployable path changed since a6de08a…`, because that commit changed `pipeline.yml`, and the deploy ran. sca passed again in main's checks job for `12693a8` (lesson L32 did not recur).

A skipped deploy writes no deployment, so `894c313` stays the comparison point. The next push that changes a deployable path deploys and waits for approval.

## Backlog, by what the owner asked for

| Item | State | Next |
|---|---|---|
| nh9, skip the deploy when nothing deployable changed | landed, `894c313`, closed; confirmed on H-3 | Nothing. Notes: `docs/notes/deploy-paths.md` |
| s3p, checks of record from code the candidate cannot change, and a promote App | open | Design note first. Its open question: can a repository owned by a personal account use a ruleset that requires a workflow from another repository? Read GitHub's "Available rules for rulesets" page; this session could not |
| g4e, deploy to `sandbox` with no reviewer | held behind s3p | Staged on `candidate/sandbox-gate`, not landed. Rebuild it after s3p, on nh9's landed `land.sh` (`894c313`). Drop its R221 change. Notes: `docs/notes/sandbox-gate.md` |
| o1p, land a signed batch with one push to `main` | open | Mechanical; no trust change. Changes `land.sh`, so build on nh9's landed copy (`894c313`) |
| v5p, publish the factory video to GitHub Pages | open | Not staged yet. Pins verified with `git ls-remote` on 2026-11-13: `actions/deploy-pages` v5.0.1 `368f82528645a54fb793d4d04e342629a3f51346`, `actions/upload-pages-artifact` v5.0.0 `fc324d3547104276b827a68afc52ff2a11cc49c9`. Deploy job: `pages: write`, `id-token: write`, environment `github-pages`. The newest factory-video artifact, all eight files zipped, is 68.5 MB, so the guided video fits Pages' 100 MB file limit. The owner turns on Pages, source "GitHub Actions", in the repository settings; check GitHub's docs for where before saying so |
| s7e, sca exceptions | open | Its title is stale: all 8 exceptions, GHSA-mf5v-w3w3-f6cg included, expire on 2026-12-08. When they pass, the sca check fails on `main`. Due before the others |
| r3m, alarm on refused break-glass attempts | open | Priority 1; amends R217; needs an owner apply |
| Not filed yet | from 2026-11-13 | A `land.sh --sca-exception` mode with the touch cue; clear `summary_next` when main's run fails; `openssh-client` in `cloud-session-setup.sh`. Details: `docs/notes/sca-mf5v.md`, "For the backlog" |

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
| An advisory published between H-1's candidate run and `main`'s failed `main`'s sca (lesson L32 again), in a PyPI package semgrep pins. While every run fails sca, no staged batch can reach `main` for `land.sh` to read | The owner signs a one-file exception commit by hand, from a copy the agent stages on its session branch, then runs `land.sh --to-main` (`docs/notes/sca-mf5v.md`) |
| The owner's bare signed commit printed no cue to touch the key | Never give the owner a signing command outside `land.sh` without saying to touch when the key blinks |
| A session ran on the "Coding" environment, not "WGTK Environment": Node.js 22, no `node_modules`, no `ssh-keygen`, `api.osv.dev` blocked. Ten land and signature tests failed for that reason alone | Run this repository's sessions on "WGTK Environment". Before a preflight, check `node --version` and `command -v ssh-keygen` |
| The owner restarted the Mac during H-1; that `land.sh` had pushed nothing | Before giving a step again, read `main` and the candidate branch with `git ls-remote origin` |

## Owner preferences that apply

The owner reads on macOS zsh, with Homebrew `node@24` keg-only and one YubiKey. Commands stay under 120 characters per line and carry no `#` comments. The owner wants to know at any moment whether they are waiting on the agent: say so first, plainly.
