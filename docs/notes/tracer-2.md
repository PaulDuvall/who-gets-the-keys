# Tracer 2: a locked-down runner first

Status: T1 done 2026-11-07: `f6044ef` landed, candidate run 42378752588, `main` run 42379109850 deployed, evidence in `docs/verification.md` (Receipt: E2E-R1). T2 landed as `4812f27` (`main` run 42388493889 deployed); the producer role, environment and variables exist. The first egress probe, producer run 42389828816, answered neither question 1 nor 2: Bedrock refused the model before the agent ran a tool. Fixes are staged in `proposals/producer-fixes/` (Sonnet 4.6, dontAsk enforced, `is_error` checked). Design, review fixes, probe findings and owner steps are in `docs/notes/tracer-2-t2-producer.md`. T3 and T4 not started. Owner decisions recorded 2026-11-07.

## Why

- A Claude Code cloud session is not the locked-down producer. Its egress, variables and setup script live in claude.ai settings. The owner can change them at any time, they are not versioned, and the receipt cannot record them. Decision 0004 already says so: the AUTHOR line reads "environment not recorded".
- The runner producer of decision 0004 Phase D is the locked-down one. Its egress comes from `.github/egress/allowlist.json` and its model access from one pinned OIDC role. Both are protected paths, so changing either needs an approver-signed commit.
- Building every phase at full breadth was estimated at 6 to 10 weeks. The owner rejected that. A tracer keeps the whole path from spec to receipt and cuts breadth instead.
- Target: about 2 weeks elapsed and 12 to 15 hours of owner time, including thin versions of phases 4, 6 and 7. This is an estimate with medium-low confidence; the owner's landing cadence is the pacing item.

## Owner decisions, 2026-11-07

| Decision | Choice |
|---|---|
| Order | T1 first: the owner lands Phase 1 slice 1. The agent builds T2 in parallel and stages it under `proposals/`. |
| Cloud session setup | Fold into T3: move the setup script recorded in the README ("Cloud session environment") into the repo as `scripts/bootstrap/cloud-session-setup.sh`, a protected path, under a new SPEC-001 requirement in T3's spec amendment. The claude.ai setup script then only calls it. Until then the README copy can drift from claude.ai unnoticed |
| T4 feature | Duplicate column names get a 400. Draft: "IF an export request's `columns` array names the same column more than once, THEN THE export service SHALL respond with status 400 and no CSV body." The owner writes the final text as SPEC-014-R7 and signs it. |

## Slices

| Slice | What lands | Done when | Owner time |
|---|---|---|---|
| T1 | Phase 1 slice 1, already staged in `proposals/phase-1/`: a signed receipt with seven lines | The steps in decision 0002, "Phase 1 owner steps", pass. `main`'s run summary shows COMMIT, FILES, AGENT, MODEL, SPEC, SIGNED and VERIFIED. Checked by reading the run summary | About 1 h |
| T2 | A thin runner producer, `producer.yml`, started only by the owner with `workflow_dispatch`. Job 1 installs dependencies from the lockfile. Job 2 runs Claude Code headless on Bedrock through a new invoke-only OIDC role, inside Claude Code's sandbox, with egress limited to the allowlist and no GitHub token. Its output is a patch. Job 3 pushes `candidate/<task ID>` with a token job 2 never held | One dispatch produces a candidate branch whose checks pass. A bad-path run, where the agent tries a host not on the allowlist, shows the request blocked in job 2's log. Checked by reading both runs' logs | About 2 h: land it, rerun `aws-setup.sh` for the new role |
| T3 | A signed task file under a protected `tasks/` path, a thin scope check, and receipt lines INTENT, TASK, AUTHOR and MODEL. MODEL becomes real because the runner pins the inference profile | A runner change shows all four lines. A change outside the task's paths fails the scope check with one failure line. A fresh cloud session runs `cloud-session-setup.sh` through the one-line pointer and can run `npm run check:typecheck`. Checked by reading the receipt and the failing run | About 1 h |
| T4 | One real feature end to end: SPEC-014-R7, duplicate columns | The owner signs R7, dispatches the runner, the checks pass, the owner pushes to `main`, and the deploy succeeds. The receipt traces SPEC-014-R7, the task, the run ID, the model, the checks and the signature. Checked by reading `main`'s run summary | About 2 h |

Deferred to thin slices after T4, about 3 to 4 more days: phase 4 (signer out of reach), phase 6 (promote) and phase 7 (deploy by tier). Until phase 4, the SIGNED line still says "editable by the agent". The runner's agent cannot push, because job 3 does the pushing.

## What the tracer must answer

1. Does Claude Code's sandbox hold egress for an agent with Bash enabled? It is a process sandbox, not a firewall for the whole runner. Not yet answered: in run 42389828816 no tool ran, and the probe check correctly printed `BOUNDARY CHECK INVALID: egress probe did not run`.
2. Does an invoke-only Bedrock role pinned to one inference profile work? Decision 0004 lists this as not yet verified. Not yet answered: run 42389828816 assumed the role, but Bedrock refused Sonnet 5.5 for the whole account (`is not available for this account`), an admin role included, so IAM was never the deciding layer. The account's quota for Sonnet 5.5 is 0 tokens per minute (`docs/verification.md`, "Bedrock quota").
3. Does a patch-only agent with a separate publish job satisfy the trace check and the `Spec:` and `Agent:` trailers?
4. Do the attestation store's lookup limits bite? Phase 1 slice 1 tests this.
5. Do the task, run ID and model survive the handoff from the runner to the pipeline and reach the receipt?

## Open questions

- Answered 2026-11-07: `infra/org` lists the producer role in the SCP's identity-write deny, applied by `aws-setup.sh`. Only the break-glass role can now change the role, so any change to the producer's model is a break-glass apply.
- Answered 2026-11-07: model access was not granted. Listing inference profiles did not prove access, and neither did an accepted agreement: the account's quota is 0 tokens per minute for every Claude 4.7 and 5.x model. The tracer moves to Sonnet 4.6, and a Sonnet 5.5 quota increase is requested separately. Until one is granted, triage, whose `TRIAGE_MODEL` was Sonnet 5.5, cannot call its model either.
- Whether job 1 should also cache nothing and pin every action by SHA, as `pipeline.yml` does. Expected yes; the workflows check will enforce it.

## Related

- Decision 0002, "Plan" and "Phase 1 owner steps"
- Decision 0004, "Cloud sessions as the producer" and Phase D
- Roadmap page shared on 2026-11-07, which still shows the full-breadth estimate
