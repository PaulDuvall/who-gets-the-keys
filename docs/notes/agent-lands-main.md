# Batch agent-lands-main: the agent lands its own passing commits; the owner signs

Staged in `proposals/agent-lands-main/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/agent-lands-main`, because it changes `CLAUDE.md`.

## The owner's decision, 2026-11-20

Signing an SCA exception that day took the owner seven commands at the Mac, then `land.sh --to-main`. The owner said: "So again, I'm fine running the key, but all these commands … I have to continue to run in my terminal. A real, real annoyance." Then: "I'm fine. Signing the key is what I was referring to, like Yubikey."

The agent asked: "May I push to main myself, for commits that need no signature, after their candidate run passes (exact SHA, fast-forward, checked for waiting deploys first)? That removes your land.sh --to-main step for agent commits. Signed changes still need your touch." The owner chose "Yes, and make it durable".

The owner also let the agent push to `main` one commit the owner had signed and pushed. That commit was `e27db6d`; the owner's own `land.sh` landed it first. The rule makes this a standing permission for a signed commit the owner asks the agent to finish. That part is the agent's reading of the owner's aim, that the touch be the owner's only step. The owner confirms or rejects it by signing this batch or not.

## The change

| File | Change |
|---|---|
| `CLAUDE.md`, "Conventions" | Until s3p lands, the agent moves `main` itself, without asking, for the commits it made in the session and for an approver-signed commit the owner asks it to finish. Never for a producer delivery, another session's branch, or a range with an `Owner-Apply:` trailer. Before it pushes, it checks that: the SHA's own `pipeline.yml` run concluded success; `main`'s own signatures check passes at the SHA; no `main` deploy waits; and no landing run is in progress. It then pushes the exact SHA, deletes the candidate branch while it still holds that SHA, or names it for the owner, and reports main's run, with the URL first when a deploy waits |
| `CLAUDE.md`, "Questions and approvals" | Factory-log rows for approvals after the agent's own push come from the Actions API, since no `land.sh` summary exists for them |
| `CLAUDE.md`, "Unattended runs" | A push the rule allows goes to the next attended session, not into the owner's queue. An unattended run still stops before `main`; that limit is the agent's addition, not the owner's words |
| `docs/factory-map.md`, "Where the picture is not literal" | Who pushes to `main` now, in attended sessions until s3p. Such a push also publishes the GitHub Pages site, which has no reviewer. The robot cell is the runner producer, which never pushes |
| `docs/factory-map-prompt.md`, step 7 | A session following the rebuild prompt lands its commit itself, instead of handing the owner a `land.sh --to-main` step |

`factory-video/claims.json` claim C03 changes in the agent commit that stages this batch, not in the batch. It said "The agent … cannot commit, push to main, tag or sign"; its evidence (SPEC-001-R85, R88, R89, R208) covers the runner producer only, so it now says "The runner producer's agent".

## What it changes, and what it does not

- No check changes. `main` still moves only to a commit whose `checks` job passed on it (SPEC-001-R41), and every change to a protected path still needs an approver's signature (SPEC-001-R12).
- The signature test is stricter than `land.sh --to-main`'s, which checks none. On 2026-11-20 the agent ran `main`'s `scripts/checks.ts signatures`, a copy saved outside the checkout, in a scratch worktree. It passed at `main` and failed `CHECK signatures FAILED: unsigned change to CLAUDE.md` on an unsigned probe commit.
- A deploy that waits is still the owner's, in the browser (SPEC-001-R232).
- What runs only when `land.sh` moves `main` stays with `land.sh`: the R221 warning about `Owner-Apply`, and the owner's yes on a producer delivery (R210).
- What still stops a commit that rewrites its own checks: the pipeline run on its own SHA, which that commit defines. That is the gap SPEC-001 accepts under "Checks before `main`"; `main`'s signatures check, run from `main`'s code, now also catches its unsigned protected changes. The gap is not otherwise smaller or larger: today the owner runs `land.sh --to-main` without reviewing an unsigned commit.
- New in practice, not in the spec: an agent push publishes the Pages site with no person between. SPEC-001-R235 gives `github-pages` no reviewer, and `factory-video.yml` rebuilds on changes to `.tasks/backlog.jsonl` and `docs/progress.json`, whoever pushes.

## Correction

The first staging, `22a6deb`, said "the owner's only landing step is the touch that signs", in `CLAUDE.proposed.md`, `LAND.txt`, its commit message and this note's title. That was wrong: the owner still runs `land.sh` to sign, and approves a deploy that waits. The commit message stays as pushed; the staged files and this note are corrected.

## Preflight

Branch `followups-2026-11-20`, in a scratch worktree with the three moves applied, a Homebrew-style `node@24` under `/opt/homebrew/opt/` and a BSD-style `seq` first on `PATH`. The first staging passed the same steps at `d1d61b3`.

| Step | Result |
|---|---|
| `node scripts/checks.ts` trace, slides, secrets | Pass |
| Vitest | 448 of 448 passed, in 28 files |
| `factory-video/verify.mjs --only claims`, with C03 rescoped | Pass: 26 claims; 13 built, 5 partly built, 5 planned, 1 open, 2 illustrative |
| `npm run progress` | No change |
| `LAND.txt` | Plain ASCII |
| Scenario patches that touch a moved file | None |

## Independent review

A subagent got the staged copies, `main`'s versions and the owner's words, not this note. It found 1 high, 8 medium and several low findings.

| # | Finding | What changed |
|---|---|---|
| 1 | High: R221's "DO NOT APPROVE" warning prints only when `land.sh` moves `main`, so an agent push would drop it | A range with an `Owner-Apply:` trailer is left to `land.sh --to-main` |
| 2 | The rule said the touch is the owner's only step, which is untrue | Corrected; see "Correction" |
| 3 | Its scope covered producer deliveries and other sessions' branches | Only the session's own commits, or a signed commit the owner asks it to finish |
| 4 | It judged the signature from the candidate's own run, and one commit, not the range | `main`'s own signatures check, run at the SHA, over the whole range |
| 5 | A push could race the owner's `land.sh`, forcing the owner to sign again | No push while a run is in progress on `main` or a `land-`, `lockfile-` or `-owner` candidate |
| 6 | It did not say what happens when a deploy waits | The report opens with the URL to approve or reject |
| 7 | The rebuild prompt still hands the owner a `--to-main` step | `docs/factory-map-prompt.md` step 7 moves with the batch |
| 8 | The map overstated it, and an agent push publishes the Pages site | Scoped, and the Pages site is named |
| 9 | Claim C03 says the agent cannot push to `main` | Scoped to the runner producer |
| 10 | Low: "candidate run has passed" was vague; no end date; deletes the branch unconditionally; no factory-log rows; unattended hand-offs still queue the owner | Whole `pipeline.yml` run; until s3p; only while the branch holds the SHA; rows from the Actions API; the push goes to the next attended session |

Not changed:

- `LAND.txt`'s `spec: SPEC-001-R41`, found unneeded. `land.sh` refuses a manifest with no spec line (`scripts/bootstrap/land.sh` line 1039).
- `docs/decisions/0010-approval-policy.md` line 69, found contradicted. It already says the README and `CLAUDE.md` "let a session push an unprotected commit to `main` by its SHA".
- Procedures that name the owner's `--to-main`, in `docs/decisions/0004-factory-model.md` (F13), `practices-carousel/prompt.md` and `docs/notes/owner-queue-handoff-2026-11-11.md`. They record what was done; `CLAUDE.md` governs what sessions do now.
- The Pages site, published with no person between. The note and the map say so; keeping kit paths with the owner until x2r would not stop it, since the kit workflows rebuild on backlog and progress changes too.
