# Owner queue hand-off, 2026-11-13

For the next agent session. Read this and `CLAUDE.md` first. It replaces `docs/notes/owner-queue-handoff-2026-11-11.md` as the current queue; that note's appendix still holds the land.sh simulation procedure.

## Where things stand

Updated on 2026-11-14, after steps H-3 to H-6, W-1, W-2, R-1 and R-2 below. `main` is at `1d623a3`. SPEC-001-R232 is confirmed on `main`: see "H-3 result". s7e and w8x are done: every sca exception expires on 2027-01-13, with its evidence in `specs/sca-exceptions.md`, and from 2026-12-30 the sca check warns. r1k is done: from run 218 every receipt failed, because `gh` v2.103.3 overwrites the newest attestations once a zip has more than 100 of one type; `--limit 100` fixed it, and main's run for `1d623a3` verified its receipt. This update is on `candidate/handoff-2026-11-14c` until the owner moves `main` to it (step H-7).

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
| `039d0e4` | H-3's record, the staged sca renewal, the backlog's s7e correction and w8x, and the batch notes (H-4) | s7e, w8x |
| `4e7c522` | sca exceptions renewed to 2027-01-13 with `specs/sca-exceptions.md`, the evidence log, signed by the owner (N-3) | s7e, closed |
| `0e2acac` | s7e closed; this note's queue after the renewal (H-6) | s7e |
| `659aba5` | Backlog f6c (rebuild the factory video when its counts change); w8x staged in `proposals/sca-expiry-warning/` with its notes (W-1) | f6c, w8x |
| `fc97f75` | SPEC-001-R233 and R234: the sca expiry warning and the exceptions' shape check, signed by the owner (W-2) | w8x, closed |
| `7816615` | README `progress updated` badge; r1k filed and staged; this note's W steps (R-1, pushed by hand because every receipt failed) | r1k |
| `1d623a3` | SPEC-001-R50 amended: `gh attestation verify --limit 100`, signed by the owner (R-2). The first receipt to pass since run 217 | r1k, closed |

Every deploy since 2026-11-11 reported Terraform `No changes.`; the deploys for `a6de08a` and `894c313` applied 0 added, 0 changed, 0 destroyed.

## Owner queue, in the only order that works

Give one step at a time, in the "Owner steps" format, and read each result yourself before the next.

| Step | Command | Deploy approval |
|---|---|---|
| H-1 | Done: `main` moved to `79f0f06`; its run failed sca | none: the deploy was skipped |
| H-2 | Done: the owner's hand-signed exception `a6de08a`, then `land.sh --to-main` | approved, `No changes.` |
| N-2 | Done: `land.sh proposals/deploy-paths`, signed, `894c313` | approved, `No changes.` |
| H-3 | Done: `land.sh --to-main 12693a8… candidate/handoff-2026-11-13b`, `main` moved to `12693a8` | none: the deploy was skipped (SPEC-001-R232) |
| H-4 | Done: `land.sh --to-main 039d0e4… candidate/s7e-2026-11-14`; main's run 43550653581 | none: skipped |
| N-3 | Done: `land.sh proposals/sca-renewal-2027-01`, signed, `4e7c522`; candidate run 43551717934, main's run 43551920052 | none: skipped |
| H-5 | Done: `candidate/handoff-2026-11-14` deleted by the owner | none |
| H-6 | Done: `land.sh --to-main 0e2acac… candidate/handoff-2026-11-14b`; main's run 43602038493 | none: skipped |
| W-1 | Done: `land.sh --to-main 659aba5… candidate/w8x-2026-11-14`; main's run 43608373314 | none: skipped |
| W-2 | Done: `land.sh proposals/sca-expiry-warning`, signed, `fc97f75`; candidate run 43609229158, main's run 43609511156 | none: skipped |
| W-3 | Superseded: the badge landed in R-1 | none |
| R-1 | Done: `git push origin 7816615…:refs/heads/main` by hand, since `land.sh --to-main` needs a passing receipt; the ruleset counts only `checks`, which passed | none: the receipt failed, nothing deployed |
| R-2 | Done: `land.sh proposals/receipt-limit`, signed, `1d623a3`; candidate run 43614472354, main's run 43614734023, both receipts passed | none: skipped |
| H-7 | `scripts/bootstrap/land.sh --to-main <tip of candidate/handoff-2026-11-14c> candidate/handoff-2026-11-14c` | none expected |
| Any time | `git push origin --delete claude/wizardly-johnson-hfuk4e claude/relaxed-hypatia-hp356k candidate/progress-badge-2026-11-14`: the first two are superseded on `main` (`git cherry` and the sca-mf5v note); the third's tip `7816615` is on `main`. Keep `candidate/sandbox-gate` for g4e | none |

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
| s7e, sca exceptions | closed, `4e7c522` | All 8 expire on 2027-01-13. Renew before then: re-run every check in `specs/sca-exceptions.md`, "How each claim was checked". Notes: `docs/notes/sca-renewal-2027-01.md` |
| w8x, warn before an sca exception expires, and check each has its evidence | closed, `fc97f75` | Open questions kept in the item: the reach probes as a committed script, before the next renewal; the warning in `land.sh`'s summary, with o1p. Notes: `docs/notes/sca-expiry-warning.md` |
| f6c, rebuild the factory video whenever its end card's counts change | open, filed 2026-11-14 | The newest video, built at `8dce7fe`, counts 103 approved requirements; `main` has 111. Changes `factory-video.yml`, so a signed batch. Do it with v5p, which publishes the video: today neither video has a public link |
| r1k, the receipt failing once a zip has more than 100 attestations | closed, `1d623a3` | A deploy approved more than about five days late could still fall outside the newest 100 and fail closed. A later batch could verify the run's own bundle with `gh attestation verify --bundle` instead (protected: `pipeline.yml`). Notes: `docs/notes/receipt-limit.md` |
| r3m, alarm on refused break-glass attempts | open | Priority 1; amends R217; needs an owner apply |
| Not filed yet | from 2026-11-13 | A `land.sh --sca-exception` mode with the touch cue; clear `summary_next` when main's run fails; `openssh-client` in `cloud-session-setup.sh`. Details: `docs/notes/sca-mf5v.md`, "For the backlog" |

Dependabot reported 6 moderate alerts on `main` on 2026-11-13 and 7 on 2026-11-14; the sca check passes. Nobody has compared them with OSV's eight (backlog 0v4). Do not cite Dependabot as a check for a newly reachable fix: on 2026-11-14 this session did, unverified, and corrected it in `docs/notes/sca-renewal-2027-01.md`.

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
| A preflight worktree linked the checkout's `node_modules`, and the install check's `npm ci` emptied the checkout through the link (2026-11-14) | Never link `node_modules` into a worktree that runs the checks; use a hard-linked copy (`cp -al`) |
| `GIT_LITERAL_PATHSPECS=1`, exported for `git mv`, made the checks read `specs/*.md` and `*package-lock.json` as literal names, so trace and one test failed | Run the checks in a shell without it |
| The cloud clone was shallow, 54 commits: the trace check failed on the cut-off commit, and `git log -S` named the wrong first commit | `git fetch --unshallow origin` before any check or history lookup |
| Every receipt failed from run 218, though no commit touched the receipt: `gh` v2.103.3 decodes each page of attestations into one response, and the reproducible zip had passed 100 attestations | When a check fails for every commit at once, look for data that grows with each run before suspecting the commit; a Go replay of the tool's loop against the real API settled it |
| The appendix's `simulate-land.sh` reported `requires:` texts missing that were present: it pipes `git show` into `grep -q` under `pipefail`, so a large file's early match kills `git show` with SIGPIPE | Confirm a reported miss with `git show <rev>:<file> \| grep -cF`; `land.sh` reads the file directly and is not affected |
| Another Claude session worked in this repository at the same time (`claude/gifted-ritchie-7u0ydr`, `candidate/practices-carousel*`, decision 0009) | List remote branches at the start of a session; a push to `main` by either session makes the other's `--to-main` refuse |

## Owner preferences that apply

The owner reads on macOS zsh, with Homebrew `node@24` keg-only and one YubiKey. Commands stay under 120 characters per line and carry no `#` comments. The owner wants to know at any moment whether they are waiting on the agent: say so first, plainly.
