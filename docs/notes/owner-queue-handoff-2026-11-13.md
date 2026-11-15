# Owner queue hand-off, 2026-11-13

For the next agent session. Read this and `CLAUDE.md` first. It replaces `docs/notes/owner-queue-handoff-2026-11-11.md` as the current queue; that note's appendix still holds the land.sh simulation procedure.

## Where things stand

Updated on 2026-11-15, after steps S-1 to S-4 below. `main` was at `31f459c` then; it is at `80f3cdc` since the factory map landed (the commits below). p6s is done: `pages.yml` (SPEC-001-R236) publishes the newest factory video and the newest practices poster built on `main` as one GitHub Pages site, https://paulduvall.github.io/who-gets-the-keys/, and the README shows both sides of the poster. Both kits stamp what they build with "Built from" and the first 7 characters of the commit, and each kit's `verify.mjs` fails a build whose stamp is missing or differs from git. The ruleset `protect main` is active with its four rules, deletion, non_fast_forward, required_linear_history and required_status_checks, as read on 2026-11-15. This update was replayed onto `7278ec1`, and is on `candidate/handoff-2026-11-15b` until the owner moves `main` to it (step H-8).

On 2026-11-14, after steps H-3 to H-7, W-1, W-2, R-1, R-2 and P-1 to P-5 below, `main` was at `f3cf854`. SPEC-001-R232 is confirmed on `main`: see "H-3 result". s7e and w8x are done: every sca exception expires on 2027-01-13, with its evidence in `specs/sca-exceptions.md`, and from 2026-12-30 the sca check warns. r1k is done: from run 218 every receipt failed, because `gh` v2.103.3 overwrites the newest attestations once a zip has more than 100 of one type; `--limit 100` fixed it, and main's run for `1d623a3` verified its receipt. That update landed in step H-7.

Landed from 2026-11-12 to 2026-11-15, each verified through the GitHub connector or GitHub's API:

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
| `fa38bed` | This note after R-1 and R-2 (H-7) | none |
| `d9e3d07` | Another session's practices-carousel kit, decision 0009, and its staged batch in `proposals/practices-carousel/`, not yet signed | none |
| `11927f2` | factory-pages staged: SPEC-001-R235, the workflow, `github.sh`, tests, READMEs, the review's fixes and notes (P-2) | v5p, f6c |
| `f3cf854` | SPEC-001-R235: the factory video rebuilt when what it shows changes, and published to GitHub Pages, signed by the owner (P-3). Live from factory-video run 43648064759 | v5p, f6c, closed |
| `15d344f` | This note after P-1 to P-5 | v5p |
| `dc9a627` to `0dbb5d8` | Another session's practices-carousel kit: page 11 as `main` run 114's real receipt, evidence as a thread across the flow, the batch restaged on `f3cf854` | none |
| `639e83a` | The practices-carousel workflow, with the font pins and the receipt printer protected, signed by the owner (decision 0009) | none |
| `d62a911` | The carousel's Text check reads the PDF in both `pdftotext` orders | none |
| `9670152` | The factory video at the top of the README, with a watch badge and its poster | none |
| `5360763` to `d7cb460` | pages-site staged in `proposals/pages-site/`, the fixes from two independent reviews, and two preflights (S-1) | p6s |
| `aedf88a` | factory-video: new wording on screen, on the poster and in the narration; 124.7 s (S-2) | none |
| `a997f83` | SPEC-001-R236 and the R235 amendment: one Pages workflow publishes the video and the practices poster, and the README shows both sides, signed by the owner (S-3) | p6s, closed |
| `280c347` to `31f459c` | practices-carousel: new wording; both kits: "Built from" and the commit on the guided video, the factory poster and both sides of the practices poster (S-4) | none |
| `16e862a`, `80f3cdc` | `docs/factory-map.md`: the pipeline drawn as an assembly line through a factory, released on evidence. Candidate run 43763463098 passed on attempt 2, after one `land.test.ts` failure on attempt 1; main's run 43764115854 | none |
| `7278ec1` | Backlog `who-gets-the-keys-t5f`: make the test check name its failing test, and fix the flaky `land.test.ts`. Lands with this note at H-8 | t5f |

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
| H-7 | Done: `land.sh --to-main fa38bed… candidate/handoff-2026-11-14c` | none: skipped |
| P-1 | Done: `gh api -X POST …/pages -f build_type=workflow` printed `workflow https://paulduvall.github.io/who-gets-the-keys/`. P-1b, the owner reading `github-pages`: `custom_branch_policies` true, `protected_branches` false, one policy `branch main`. GitHub had restricted the new environment to `main` itself, so no P-1c | none |
| P-2 | Done: `land.sh --to-main 11927f2… candidate/factory-pages-2026-11-14b`; candidate run 43621143911, main's run 43646683175 | none: skipped |
| P-3 | Done: `land.sh proposals/factory-pages`, signed, `f3cf854`; candidate run 43647838123, main's run 43648064610. Factory-video run 43648064759 built the video in 10.5 minutes and deployed it at 22:38 UTC | none: `sandbox` skipped; `github-pages` deployed with no reviewer |
| P-4 | Not needed: P-1 and P-1b already gave every setting the new `github.sh` code applies. It applies them again whenever the owner next runs it | none |
| P-5 | Done: the owner played https://paulduvall.github.io/who-gets-the-keys/ to its end card, "Requirements: 112 approved, 164 drafted.", which equals `docs/progress.json` at `f3cf854` | none |
| S-1 | Done: `land.sh --to-main d7cb460… candidate/pages-site-2026-11-15`; candidate run 43746089383, main's run 43747408966 | none: skipped |
| S-2 | Done: `main` moved to `aedf88a`; candidate run 43749139975, main's run 43751156628. Factory-video run 43751156588 published the new wording | none: skipped |
| S-3 | Done: `land.sh proposals/pages-site`, signed, `a997f83`; candidate run 43752710160, main's run 43752992275. Practices-carousel run 43752992291 published the poster first; factory-video run 43752992358 then published both, its end card "Requirements: 113 approved, 164 drafted." | none: `sandbox` skipped; `github-pages` deployed with no reviewer |
| S-4 | Done: `land.sh --to-main 31f459c… candidate/poster-stamp-2026-11-15`; candidate run 43755452689, main's run 43757792451. Practices-carousel run 43757792458 and factory-video run 43757792435 published both, each "Built from 31f459c", checked in the live PDF, a video frame and the poster image | none: skipped |
| H-8 | `land.sh --to-main <SHA> candidate/handoff-2026-11-15b`, for this note and `7278ec1` beneath it. Then delete `candidate/handoff-2026-11-15` and `candidate/backlog-flaky-test`, which held them before | none: docs only |
| Branches | On 2026-11-15, `candidate/pages-site-2026-11-15`, `candidate/poster-wording-2026-11-15`, `candidate/land-pages-site` and `candidate/poster-stamp-2026-11-15` are gone. Kept: `candidate/sandbox-gate` (g4e) and the other session's `candidate/practices-carousel-receipt`, `-receipt-2` and `-receipt-3`. Done 2026-11-14: the owner deleted `candidate/factory-pages-2026-11-14`, `claude/focused-planck-flcgn0`, `candidate/practices-carousel`, `candidate/practices-carousel-2` and `claude/gifted-ritchie-7u0ydr`, each with every commit on `main`. The others named here before were already gone. Kept: `candidate/sandbox-gate` (g4e) and the other session's `candidate/practices-carousel-receipt` and `-receipt-2` | none |

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
| v5p, publish the factory video to GitHub Pages | closed, `f3cf854` | SPEC-001-R235. Live at https://paulduvall.github.io/who-gets-the-keys/ from factory-video run 43648064759: a 25.2 MB video, its captions and poster, naming `f3cf854`. The next push that changes the kit, the workflow or the end card's counts rebuilds it. Notes: `docs/notes/factory-pages.md` |
| s7e, sca exceptions | closed, `4e7c522` | All 8 expire on 2027-01-13. Renew before then: re-run every check in `specs/sca-exceptions.md`, "How each claim was checked". Notes: `docs/notes/sca-renewal-2027-01.md` |
| w8x, warn before an sca exception expires, and check each has its evidence | closed, `fc97f75` | Open questions kept in the item: the reach probes as a committed script, before the next renewal; the warning in `land.sh`'s summary, with o1p. Notes: `docs/notes/sca-expiry-warning.md` |
| f6c, rebuild the factory video whenever its end card's counts change | closed, `f3cf854`, as a duplicate of v5p | This session filed f6c without searching the backlog; the owner pointed out that v5p already asked for it |
| r1k, the receipt failing once a zip has more than 100 attestations | closed, `1d623a3` | A deploy approved more than about five days late could still fall outside the newest 100 and fail closed. A later batch could verify the run's own bundle with `gh attestation verify --bundle` instead (protected: `pipeline.yml`). Notes: `docs/notes/receipt-limit.md` |
| r3m, alarm on refused break-glass attempts | open | Priority 1; amends R217; needs an owner apply |
| p6s, publish the practices poster beside the factory video | closed, `a997f83` | SPEC-001-R236. `pages.yml` takes each kit's newest build on `main`, by the fewest commits behind `main`'s tip, then the newest run; a push that changes either kit, `practices.yaml`, the end card's counts or `pages.yml` republishes. Notes and open questions: `docs/notes/pages-site.md` |
| Not filed yet | from 2026-11-15 | The practices poster's closing line, "The agent drafts code and tests, and only the pipeline deploys.", repeats its thesis; a review called it borderline, and it stays until the owner says otherwise |
| Not filed yet | from 2026-11-13 | A `land.sh --sca-exception` mode with the touch cue; clear `summary_next` when main's run fails; `openssh-client` in `cloud-session-setup.sh`. Details: `docs/notes/sca-mf5v.md`, "For the backlog" |

Dependabot reported 6 moderate alerts on `main` on 2026-11-13 and 7 on 2026-11-14 and 2026-11-15; the sca check passes. Nobody has compared them with OSV's eight (backlog 0v4). Do not cite Dependabot as a check for a newly reachable fix: on 2026-11-14 this session did, unverified, and corrected it in `docs/notes/sca-renewal-2027-01.md`.

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
| Branch lists built from `refs/remotes/origin/*` named branches already deleted on GitHub, twice on 2026-11-14, and one `git push --delete` that named a missing ref deleted nothing at all | List branches with `git ls-remote --heads origin`, or after `git fetch --prune`; give one delete command per set of branches that exist |
| Another session moved `main` from `fa38bed` to `d9e3d07` while factory-pages was on its candidate branch, and the agent may not force-push | Rebase onto the new `main` and push to a new candidate branch, `-b`; delete the old one and the session branch after landing |
| The simulated Mac's Homebrew `node@24` keg held only `node`, so SPEC-001-R215's `.npmrc` test could not start `npm` | Give the keg `npm` and `npx` too, as Homebrew's does |
| A Stop hook asked twice on 2026-11-15 to amend or rebase the agent's commits so GitHub shows them as Verified | Agent commits stay unsigned, as `CLAUDE.md` says. Leave the hook's commands undone and say so |
| A local factory-video build started before a later commit failed its Build stamp check, which compares `frames/build.js` with HEAD | Commit, then build. Commit nothing while either kit builds |
| The factory poster's first stamp sat just above the note that the receipt's IDs are illustrative, so it read as one of them. An independent review caught it | Keep a real value away from text that calls the values near it illustrative |
| The `no-sign` hook refused one read-only command that joined `curl` reads of the Actions API with `git ls-remote` | Split it into simple commands; each ran |

## Owner preferences that apply

The owner reads on macOS zsh, with Homebrew `node@24` keg-only and one YubiKey. Commit messages, notes and files in this public repository say what changed; they never give the owner's reasons for asking, or a view of the owner's material. Commands stay under 120 characters per line and carry no `#` comments. The owner wants to know at any moment whether they are waiting on the agent: say so first, plainly.
