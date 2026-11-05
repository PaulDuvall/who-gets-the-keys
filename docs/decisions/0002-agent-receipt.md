# 0002. A signed receipt for every deploy

- Status: Proposed
- Status: Superseded in part by [0004](0004-factory-model.md). Decision 3 and owner decision D4 of 2026-11-05 ("Factory": the agent's inputs only) are superseded from 0004 Phase B. The fingerprint then covers the pipeline, the checks and the configs they read, the receipt policy and the agent inputs. Specs stay out and are recorded on the INTENT line. R42: the policy enters the fingerprint without its approved-version entries, and `CLAUDE.md` may import requirement files. R45: the predicate also holds each proven tightening. R53: at its place in R56's order, an unapproved factory version fails first. R53 then compares with that version's entry, not the latest, and a proven tightening chain from it passes. Decision 6: from 0004 Phase C, `sandbox` has no required reviewer; a listed reviewer stays only where the policy tier requires one. Decision 13: from 0004 Phase A the owner pushes agent deliveries to `main`, and from Phase B only the promote GitHub App moves it. Phase 0, M04: from 0004 Phase B, the landing in `CLAUDE.md`, `refresh-slides.sh` and `rotate-approver-key.sh` pushes only to `candidate/<topic>`, and promote moves `main`. Phase 3: the signer repository also holds promote and its App key. Its required check first runs signatures, task and scope with `main`'s check code, and its deploy workflow runs the tier check for every environment. R55 and R63: the receipt gains TASK, AUTHOR and DEPLOY lines, and FACTORY shows proven tightenings. INTENT shows the approving commit and gains its signature flags. Owner question "Ruleset bypass": `protect main` keeps no bypass actors, and a second ruleset lists only the promote App. Decision 15 stands.
- Date: 2026-11-04; owner decisions recorded 2026-11-05
- Requirements: proposed SPEC-001-R40 to SPEC-001-R63, of which R54 and R62 are withdrawn and their IDs reserved. None is in the signed spec yet. R40 and R41 are the checks before `main`, which land first; R42 to R63 are the receipt. Renumbered on 2026-11-04 (from R39) and on 2026-11-05 (checks before `main` first), because decision 0003 proposes SPEC-001-R39
- Modeled on: Daniel Meppiel, [Agent Contracts and Receipts](https://theainativemind.com/blog/agent-contracts-and-receipts/) (2026-11-04), and its [format draft 0.1](https://github.com/danielmeppiel/agent-contracts)

## Context

A talk slide shows one receipt for an agent-built change, backed by four open standards:

| Receipt line | Standard | Need it answers |
|---|---|---|
| FACTORY version and fingerprint, AGENT and MODEL, FILES sha256-bound | SLSA provenance | Traceability |
| One PASS per check, TOTAL n/n PASSED | in-toto test results | Verification |
| SKILL pinned | CycloneDX bill of materials of the agent's inputs (the "ABOM") | Enforcement |
| SIGNED by a trusted signer | Sigstore | Security |

This repo already signs two statements over `dist/function.zip` in the attest job of `pipeline.yml`. One is SLSA provenance. The other is a custom predicate holding commit, spec IDs, agent and model. The deploy job verifies the SLSA one before any AWS call (SPEC-001-R17).

The repo has been public since 2026-11-02. On commit `13be9b2` (run 41548920455) the attest job succeeded and the deploy job waits for the `sandbox` reviewer. Run 41549035939 on `a744cb3` also attested. Its deploy did not queue behind that one: GitHub cancelled it when a newer run queued in the `pipeline-deploy` concurrency group. The same cancellation was observed on runs 41885364164, 41892838679 and 41897017660. Deviation D06 (the deploy job fails closed because attestations need a public repo on this plan) therefore no longer blocks, and a receipt can run end to end today.

Today a commit is on `main` before the pipeline runs, so the first thing a failed check can still block is the deploy. GitHub can hold a direct push until checks pass, with no pull request: "After all required status checks pass, any commits must either be pushed to another branch and then merged or pushed directly to the protected branch" (GitHub, About protected branches). This decision therefore runs the checks before `main`: `main` only moves to a commit on which the checks passed. A push of several commits runs the pipeline on its tip only. The commits below the tip are covered only by the checks that read history: trace, ratchet and signatures. The scenarios still run after landing, because `scenarios.yml` runs on pushes to `main` only. The deploy-time checks stay as a second line of defence.

## What the receipt would and would not prove here

| It would prove | It would not prove |
|---|---|
| Which agent inputs were in the tree at the deployed commit, by SHA-256 | That the agent loaded or followed them, or what user-level `~/.claude` settings, plugins or connectors the session had |
| Which checks passed, recomputed by a job with no agent | Anything a failing run would show: build needs checks, so every signed receipt says 15/15 |
| That the zip was not changed between build and deploy | That the code is right. Green is as good as the checks |
| What each commit says about its agent | Which model ran. The receipt shows the model as not recorded (deviation D05). Trailers are written by the agent and nothing attests them |
| That `main` only moved to commits on which the checks passed, and from Phase 2 the receipt check | That each commit below the tip of a multi-commit push passed them: only trace, ratchet and signatures cover those. Nor that nobody can bypass the ruleset. Today it has no bypass actors; anyone later added to that list could push around it |
| That GitHub Actions reported a check named `checks` as passed on the commit | That `pipeline.yml` reported it. Any workflow in the repo can report a check named `checks`, so the required check can pass without `pipeline.yml` running. R41 forbids it, but the pushed commit defines its own workflows. Accepted and documented until Phase 3 makes a reusable workflow or a dedicated GitHub App the check's source |
| Where `pipeline.yml` reported it, that its `checks` job passed on the commit | That it ran the real checks. The job is defined in the pushed commit's own `pipeline.yml`, so a commit that also edits that file can make `checks` pass without running them. The `signatures` check flags an unsigned workflow change only in a run that still runs it. Phase 3 closes this |
| That `pipeline.yml` on `main` signed it | That the signer was out of the agent's reach. The agent can push to `pipeline.yml`; the `signatures` check catches an unsigned edit only afterwards, inside the same pipeline (Phase 3 closes this) |

## Today, line by line

| Receipt line | Today | Gap |
|---|---|---|
| FACTORY and fingerprint | Nothing. `specs/protected-paths.txt` lists the paths but computes no digest | An approver-signed list of agent inputs and a digest over them |
| AGENT and MODEL | Partial. The attest job's `Write the provenance predicate` step in `pipeline.yml` (lines 94-100 on `main`, 95-101 once Phase 0 lands) reads trailers with `git log -1`. So a push of several commits records only one. The model is empty for agent commits (deviation D05: they carry no `Model:` trailer). `attestationArgs` passes no `--predicate-type`, so the custom predicate is signed but never verified | Every commit since the last receipt, labelled as reported. The model is not recorded (owner decision on D05, 2026-11-05) |
| FILES | Partial. One subject, the zip, built reproducibly (`pipeline.yml:60-67`) | Zip members and the push's changed files, each with SHA-256, inside the predicate |
| Each check PASS, TOTAL | Nothing. `checks.ts` prints pass lines to standard error and keeps no record | A results file from the checks job, signed as an in-toto test result |
| SKILL pinned | Nothing | A CycloneDX bill of materials of the factory files (decision 3) and any MCP servers |
| SIGNED | Yes, through `actions/attest` and Sigstore's public-good instance | No new signer for Phases 1 and 2 |
| Policy evaluation | Signature and signer only | `specs/receipt-policy.json` and a `receipt` check |

## Decisions (proposed)

| # | Decision |
|---|---|
| 1 | Emit the receipt natively with the already-pinned `actions/attest` and the runner image's preinstalled `gh`, which nothing pins today. Do not adopt apmx, the agent-contracts author's tool that runs agents from Markdown contracts and writes receipts (see Options) |
| 2 | `dist/function.zip` stays the only subject of every statement until the Agent Contracts alignment (see Later use cases). Member and changed-file digests go inside the predicates. GitHub advises signing manifests of hashes, not individual files |
| 3 | The factory is the agent's inputs: `CLAUDE.md` and every nested `CLAUDE.md`, the specs `CLAUDE.md` imports, `.claude/**` and `.mcp.json`. Check definitions are recorded separately, in the test result's `configuration` |
| 4 | The fingerprint is the SHA-256 of canonical JSON (sorted keys, compact separators, non-ASCII escaped as `\uXXXX`, final LF) of the path-sorted list of `{path, sha256}`. Each file is hashed as raw bytes |
| 5 | Repository code never runs in a job that can sign. The checks and build jobs compute the predicates; the attest job only signs them with pinned actions |
| 6 | A new `receipt` job runs after attest, with no environment, and writes the receipt to the run summary. The deploy job needs it, so the review request appears only after the receipt exists. The `sandbox` reviewer approves before the deploy job's first step, so this is the only place the reviewer can read it in time |
| 7 | `receipt` is a check outside the ordered fifteen, like `attestation` and `irreversible`. It prints one line, `CHECK receipt FAILED: <identifier>`. The build and checks jobs print the same prefix for the R42 and R44 failures |
| 8 | Policy lives in `specs/receipt-policy.json`, so the existing `signatures` check already requires an approver's signature on every change to it |
| 9 | The receipt check verifies each required predicate type once, with `--limit 1000`: `gh` takes one type per call and keeps only the first `--limit` results, newest first. It uses the exact pins `attestationArgs` applies for SPEC-001-R17. Those are `pipeline.yml` at the ref as signer identity and source ref, a GitHub-hosted runner, and the commit as source and signer digest. A candidate run pins its own ref, `refs/heads/candidate/<topic>`, because its attestations carry it. The deploy job always pins `refs/heads/main`. `gh` trusts the store's type filter, so the check matches the type, the zip digest, the commit and the ref itself. The list API refuses the VSA type as a filter |
| 10 | Commit records run from the last receipted commit to `GITHUB_SHA`, not from `github.event.before`. A newer queued run cancels a pending one (observed, see Context), and the first push to a new repo has no `before` |
| 11 | No SLSA Verification Summary Attestation (VSA) in Phases 1 and 2. If one is added later, use the in-toto Simple Verification Result or a VSA with `SLSA_BUILD_LEVEL_UNEVALUATED`, signed by the job that ran the verification |
| 12 | Borrow two conventions from agent-contracts draft 0.1: canonical-JSON hashing and one shared subject set. The digests are not comparable with apmx's, which hash a contract graph |
| 13 | Check before `main`, without a pull request. Every author, agent or human, pushes a commit to a short-lived `candidate/` branch first. From Phase 1 slice 1, the pipeline runs checks, build, attest and the receipt check on that commit (SPEC-001-R40 as amended). The `protect main` ruleset requires the `checks` status check, with GitHub Actions as the expected source. From a later slice (T16 and the R41 amendment), it also requires `receipt`. So `main` accepts the same commit as a fast-forward only after they pass. The author then pushes it to `main`. Pull requests are for review only. `github.sh` turns off squash and rebase merges (`allow_squash_merge=false`, `allow_rebase_merge=false`, `allow_merge_commit=true`). If GitHub accepts that, the ruleset's required linear history then blocks every merge-button merge (M06). If it refuses, pull requests must still not be merged in GitHub. Every change lands by the fast-forward push. Both blocked methods write commits the checks never ran on. GitHub's rebase merge adds commits "without commit signature verification" and its squash merge signs with GitHub's own key, so either drops the approver's signature |
| 14 | The push to `main` runs the pipeline again, as today, and only that run deploys. Its attestations carry `refs/heads/main`, so the SPEC-001-R17 pins stay on `refs/heads/main`. They become the exact pins of the builder the receipt check shares (decision 9). These are `pipeline.yml` on `refs/heads/main` as signer identity and source ref, the commit as source and signer digest, the SLSA predicate type and `--limit 1000`. The zip is reproducible, so the candidate run and the `main` run attest the same digest. The receipt check also runs again in the deploy job (R56), as a second line of defence |
| 15 | No workflow pushes to `main`. A job that fast-forwards `main` after green would hold a write token inside a workflow the agent can edit |

## Plan

Four phases. Phase 0, the checks before `main`, needs no receipt code and can land first. Phase 1 is built in tracer slices, each one thin path through the deploy job on GitHub Actions in this repo. Slice 1 replaces the split into "emit and show" and "evaluate": it signs one record, verifies it in the receipt and deploy jobs, and shows it to the reviewer. The Phase 1 and 2 rows and tasks below are the backlog that later slices draw on. Slices widen it in this order: approved factory (R42, R49, R53, T08), then check results (R43, R46, R51), then the receipt required before `main` (T16). Intent and detail (R63, R44, R47, R52) come next, then scenarios (R57 to R61). It starts with the two known doubts. One is the attestation store: `gh attestation verify` with extra predicate types, and the 30-result lookup limit. The other is the candidate signer pin (decision 9). Phase 1 drafting starts now; it lands after decision 0003 and Phase 0. Each phase lands as one push whose last commit is approver-signed and carries a `Spec:` trailer. The agent's unprotected files land in earlier commits of the same push, because the slides, trace and test checks fail on any half of the change. The test check includes `test/video.test.ts`.

| Phase | Delivers | Protected files (through `proposals/`) | Unprotected files |
|---|---|---|---|
| 0. Checks before main | `main` only moves to a commit on which the 15 checks passed | `specs/SPEC-001-delivery-pipeline.md`, `.github/workflows/pipeline.yml`, `scripts/bootstrap/github.sh`, `scripts/bootstrap/refresh-slides.sh`, `scripts/bootstrap/rotate-approver-key.sh`, `CLAUDE.md` | `test/checks-before-main.test.ts`, `traceability.md`, the B10 patch, `docs/` |
| 1. Emit and show | Three new signed statements and the receipt in the run summary | `specs/SPEC-001-delivery-pipeline.md`, `specs/receipt-policy.json`, `specs/protected-paths.txt`, `scripts/checks.ts`, `.github/workflows/pipeline.yml` | `scripts/receipt.ts`, `test/receipt.test.ts`, `test/checks.test.ts`, `docs/` |
| 2. Evaluate | The `receipt` check, in the receipt and deploy jobs, and scenarios B19 to B22 | the same spec, policy, `checks.ts` and `pipeline.yml`, plus `scripts/receipt.ts` (protected by T08), `scenarios/run.ts` and `CLAUDE.md` | tests, the rest of `scenarios/`, `practices.yaml`, `video/explanations.yaml`, `docs/` |
| 3. Signer out of reach | Build, attest and deploy run in a reusable workflow in a repository the agent cannot push to. That workflow or a dedicated GitHub App becomes the required check's source | `pipeline.yml`, `scripts/checks.ts`, `infra/sandbox/iam.tf` | `test/checks.test.ts`, `docs/` |

### Tasks

| ID | Phase | Task | Files | Protected | Verified by |
|---|---|---|---|---|---|
| M01 | 0 | Spec amendment: a "Checks before `main`" section with R40 and R41 | `proposals/phase-0/SPEC-001-delivery-pipeline.md` | yes | trace passes: M02's tests name both |
| M02 | 0 | `pipeline.yml`: also run on pushes to `candidate/**`; the attest and deploy jobs run only for `refs/heads/main`. Tests for R40 and R41 | `proposals/phase-0/github-workflows/pipeline.yml`, `proposals/phase-0/test/checks-before-main.test.ts` | yes, except the test | `npm run check:workflows`; `test/checks-before-main.test.ts` |
| M03 | 0 | `github.sh`: a `required_status_checks` rule for `checks`, naming the GitHub Actions app ID read from `main`'s `checks` run. The ruleset is updated with `PUT` when it exists, where today the script skips it. Squash and rebase merges are turned off (`allow_squash_merge=false`, `allow_rebase_merge=false`, `allow_merge_commit=true`) after the environments and secret scanning. The script reads them back, and reports a refusal without skipping the ruleset | `proposals/phase-0/scripts/bootstrap/github.sh` | yes | the R41 tests run `github.sh` against a stub `gh` on PATH and parse the ruleset body it sends on PUT and POST. A refused or ignored merge-method change still applies the rest and exits 1 |
| M04 | 0 | `CLAUDE.md`: push to `candidate/<topic>`, then the same commit to `main`; pull requests for review only; every change lands by fast-forward push. `refresh-slides.sh` and `rotate-approver-key.sh` print that landing in place of a direct push to `main` | `proposals/phase-0/CLAUDE.proposed.md`, `proposals/phase-0/scripts/bootstrap/refresh-slides.sh`, `proposals/phase-0/scripts/bootstrap/rotate-approver-key.sh` | yes | approver review; `bash -n` on both scripts |
| M05 | 0 | Rebase the B10 patch, whose context includes the deploy job's `if:`; add R40 and R41 to traceability | `proposals/phase-0/scenarios/B10-unattested-artifact.patch`, `proposals/phase-0/traceability.md` | no | B10 still prints `CHECK attestation FAILED: dist/function.zip` |
| M06 | 0 | Approver lands Phase 0, runs `github.sh`, and proves the required check (owner steps below) | M01 to M05, then `docs/verification.md` | yes, except `docs/verification.md` | a direct push of an unchecked commit is refused. A push of two commits, the lower one never checked, settles whether GitHub checks only the tip. Reading the `allow_*` values back settles whether GitHub accepts squash and rebase merges off |
| T01 | 1 | Spec amendment R42 to R48, R55 and R63; R40 amended so candidate runs attest again | `proposals/SPEC-001-delivery-pipeline.md` | yes | approver review; trace passes once T02 to T09 name each of R42 to R48, R55 and R63 in a test title |
| T02 | 1 | Policy file with factory patterns and version | `proposals/receipt-policy.json` | yes | `test/receipt.test.ts` R42 |
| T03 | 1 | `receipt.ts`: canonical JSON, raw-byte SHA-256, fingerprint, `@`-import check | `scripts/receipt.ts`, `test/receipt.test.ts` | no, until T08 | unit tests: order-independent, one-byte change detected, untracked files excluded |
| T04 | 1 | `receipt.ts`: commit records, changed files (deletions without digest), zip members from `dist/function/`, one intent record per cited requirement (R63) | same | no | git fixture with two commits and a first-push case; an R63 test with an approver-signed spec commit |
| T05 | 1 | `receipt.ts`: in-toto test result and CycloneDX 1.7 builders | same | no | byte-identical output for fixed fixtures |
| T06 | 1 | `receipt.ts`: run-summary renderer, with one `INTENT` line per R63 record | same | no | snapshot test of the rendered receipt |
| T07 | 1 | `checks.ts`: results writer when `CHECK_RESULTS` is set; order and lines unchanged | `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes | existing R1 order test still passes; new R43 test |
| T08 | 1 | Protect `scripts/receipt.ts`, and `.mcp.json` and nested `CLAUDE.md` if the owner agrees | `proposals/protected-paths.txt`, `proposals/scripts/checks.ts` | yes | `guardedBy` test |
| T09 | 1 | `pipeline.yml`: checks job uploads results and config digests; build job checks out with `fetch-depth: 0` and writes predicates. The attest job signs three more and runs on candidate runs again (decision 9). The `receipt` job renders, and deploy needs it. Rebase the B10 and B18 patches, whose context this changes | `proposals/github-workflows/pipeline.yml`, `scenarios/B10-unattested-artifact.patch`, `scenarios/B18-unsigned-pipeline-change.patch` | yes, except the patches | `npm run check:workflows`; R44 and R48 tests; scenarios B8a, B8b, B10 and B18 still fail with their recorded lines |
| T10 | 1 | Publish the predicate schema; update D06; record deviations for decisions 2 and 12 | `docs/predicates/provenance-v2.md`, `docs/deviations.md` | no | review |
| T11 | 1 | Approver lands Phase 1; owner records the first receipt | T01 to T10, then `docs/verification.md` | yes, except `docs/verification.md` | run summary shows the receipt; `gh attestation verify` passes per predicate type, with the `main` pin on `main` and the candidate pin on a candidate run |
| T12 | 2 | Spec amendment R49 to R53 and R56 to R61. R54 and R62 are withdrawn; their IDs stay reserved | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes after T19 |
| T13 | 2 | `receipt.ts`: policy evaluator, one function per requirement R49 to R53, run in that order (R54 withdrawn) | `proposals/scripts/receipt.ts`, `test/receipt.test.ts` | yes, after T08 | one test per requirement asserting the exact identifier |
| T14 | 2 | `checks.ts`: `receipt` check entry with R17 pins, the candidate ref pin on candidate runs, and its own pass line | `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes | pin test mirroring `test/checks.test.ts:208-215`, failing if either ref pin is removed |
| T15 | 2 | Policy: approved factory entries (version, fingerprint, and each file's path and SHA-256), required checks and predicate types, revoked inputs | `proposals/receipt-policy.json` | yes | R49 and R51 to R53 tests |
| T16 | 2 | `pipeline.yml`: `receipt` job runs the check; deploy runs it after `attestation`; the receipt and deploy jobs both check out with `fetch-depth: 0`. R41 is amended so `github.sh` also requires `receipt` | `proposals/github-workflows/pipeline.yml`, `proposals/scripts/bootstrap/github.sh` | yes | `npm run check:workflows`; an R41 test for `receipt` |
| T17 | 2 | `run.ts`: receipt-only mode, a scenario with no patch, a `results:` field separate from `fixture` | `proposals/scenarios/run.ts`, `test/scenarios.test.ts` | yes | scenario table test |
| T18 | 2 | Scenarios B19 to B22 (B25 withdrawn, ID reserved); fixtures under `scenarios/fixtures/`; a negative control | `scenarios/` | no | `npm run scenarios` after landing |
| T19 | 2 | Scenario table rows R58 to R61 (R62 withdrawn); `receipt` treated as a local check, needing no GitHub Actions or sandbox account | `test/scenarios.test.ts` | no | trace and test checks |
| T20 | 2 | Plain words for `receipt` and B19 to B22. Map them to practices P20 (deploy verifies attestations first) and P21 (provenance records commit, spec ID, agent and model). Regenerate the practices table | `video/explanations.yaml`, `practices.yaml`, `docs/practices.md` | no | test and slides checks |
| T21 | 2 | `CLAUDE.md`: file map, scenario count, the `receipt` check | `proposals/CLAUDE.proposed.md` | yes | approver review |
| T22 | 2 | Approver lands Phase 2 | T12 to T21 | yes | `npm run checks` and `npm run scenarios` pass on `main` |
| T23 | 3 | Owner creates the signer repository and its reusable workflow | new repository | owner only | `gh attestation verify --signer-workflow <signer repo>/.github/workflows/<file>` |
| T24 | 3 | `pipeline.yml` calls it by SHA; `iam.tf` trusts only its `job_workflow_ref`; `attestationArgs` pins it | `proposals/github-workflows/pipeline.yml`, `proposals/infra/sandbox/iam.tf`, `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes, except the test | deploy assumes the role only from the signer workflow |

Agent notes:

- The agent cannot sign, so it cannot run the scenarios against the proposed batch before it lands. T22 verifies them on `main`.
- `proposals/package.json` is blocked by `Edit(**/package.json)`. No dependency change is needed, because `receipt.ts` uses Node.js built-ins only. SPEC-001 defines a check as an npm script `check:<name>`, so a `check:receipt` script, like `check:irreversible`, goes to the approver as `proposals/package.proposed.json`. `attestation` has no script today.
- The PostToolUse hook runs ESLint's `vitest/expect-expect` on any staged `proposals/test/*.test.ts` file and reports a false failure there.

### Phase 0 owner steps

Phase 0 is built on top of decision 0003's batch, and its staged files replace whole files. Land 0003 first. Pull, then run the precondition. It prints a confirmation only when 0003 is in place: R39 is in the spec and `approvers.txt` holds a security-key (`sk-`) key. Stop if it prints nothing.

```bash
git pull --ff-only origin main
```

```bash
grep -q SPEC-001-R39 specs/SPEC-001-delivery-pipeline.md && grep -q '^[^#].* sk-' approvers.txt && echo "decision 0003 is in place"
```

```bash
git mv -f proposals/phase-0/SPEC-001-delivery-pipeline.md specs/SPEC-001-delivery-pipeline.md
```

```bash
git mv -f proposals/phase-0/github-workflows/pipeline.yml .github/workflows/pipeline.yml
```

```bash
git mv -f proposals/phase-0/scripts/bootstrap/github.sh scripts/bootstrap/github.sh
```

```bash
git mv -f proposals/phase-0/scripts/bootstrap/refresh-slides.sh scripts/bootstrap/refresh-slides.sh
```

```bash
git mv -f proposals/phase-0/scripts/bootstrap/rotate-approver-key.sh scripts/bootstrap/rotate-approver-key.sh
```

```bash
git mv -f proposals/phase-0/CLAUDE.proposed.md CLAUDE.md
```

```bash
git mv proposals/phase-0/test/checks-before-main.test.ts test/checks-before-main.test.ts
```

```bash
git mv -f proposals/phase-0/traceability.md traceability.md
```

```bash
git mv -f proposals/phase-0/scenarios/B10-unattested-artifact.patch scenarios/B10-unattested-artifact.patch
```

Review the staged changes before you sign. The spec diff should only add the "Checks before `main`" section with R40 and R41. `CLAUDE.md` should only change the push and pull request lines, and `traceability.md` should only add the R40 and R41 rows. Both scripts should only add `print_landing` and replace each `git push` line with the candidate-branch landing command. `refresh-slides.sh` also moves the `practices.yaml` reconciliation into the signed snapshot commit. `rotate-approver-key.sh` also prints the commit commands for a backup key, and its step 1 becomes a plain rotation commit with the R12 trailer only. If the diff removes anything else decision 0003 added, stop: the staged copy is stale.

```bash
git diff --cached --stat
```

```bash
git diff --cached -- specs/SPEC-001-delivery-pipeline.md CLAUDE.md traceability.md scripts/bootstrap/refresh-slides.sh scripts/bootstrap/rotate-approver-key.sh
```

```bash
git commit -S -m "spec: checks before main, no pull requests needed (SPEC-001-R40, R41)" --trailer "Spec: SPEC-001-R40" --trailer "Spec: SPEC-001-R41"
```

```bash
npm run checks
```

```bash
git push origin HEAD:main
```

Wait for that push's pipeline `checks` job to pass, then apply the ruleset. The script reads the GitHub Actions app ID from that run. This command prints nothing until the run starts. Run it again until it prints `completed success`:

```bash
gh api "repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs?check_name=checks" --jq '.check_runs[] | select(.app.slug == "github-actions") | "\(.status) \(.conclusion)"'
```

```bash
scripts/bootstrap/github.sh
```

Then read the merge methods back. Record the result in the "Phase 0: merge methods" row of `docs/verification.md`, in the first M06 commit below. If `github.sh` printed "GitHub refused squash and rebase merges off", the ruleset still applied, but squash and rebase merges stay on. Do not merge pull requests in GitHub, and take the merge-methods decision under Decisions for the owner.

```bash
gh api repos/PaulDuvall/who-gets-the-keys --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
```

Prove the required check with the next real change. In `docs/verification.md`, in the row "Phase 0: direct pushes held by required checks", replace `pending owner verification (M06)` with `M06 in progress`. Commit that placeholder, then try `main` directly. GitHub should refuse the push:

```bash
git commit -m "docs: M06 placeholder for the direct-push refusal" -- docs/verification.md
```

```bash
git push origin HEAD:main
```

If GitHub accepts this push, stop: the ruleset is not in force.

Copy the refusal into that row in place of "The refusal text for an unchecked push is not documented", and replace `M06 in progress` with the date. Then commit it on top:

```bash
git commit -m "docs: M06 direct-push refusal" -- docs/verification.md
```

The next push then carries two commits, and only the upper one gets a `checks` run. Push both to a candidate branch:

```bash
git push origin HEAD:candidate/verify-checks-before-main
```

Wait for the run on the upper commit. The wait stops with a message if no run starts within 5 minutes:

```bash
upper="$(git rev-parse HEAD)"
```

```bash
run=""; for attempt in $(seq 60); do run="$(gh run list --workflow pipeline.yml --branch candidate/verify-checks-before-main --commit "$upper" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"; [ -n "$run" ] && break; sleep 5; done; { [ -n "$run" ] || { echo "No pipeline run for ${upper} after 5 minutes."; false; }; } && gh run watch "$run" --exit-status
```

When it passes, push both commits to `main`:

```bash
git push origin HEAD:main
```

If GitHub accepts the push, it checks only the pushed tip. Skip to the last block. If it refuses, it checks every new commit. Check the lower commit on its own candidate branch, then push again:

```bash
lower="$(git rev-parse HEAD~1)"
```

```bash
git push origin "${lower}:refs/heads/candidate/verify-lower-commit"
```

```bash
run=""; for attempt in $(seq 60); do run="$(gh run list --workflow pipeline.yml --branch candidate/verify-lower-commit --commit "$lower" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"; [ -n "$run" ] && break; sleep 5; done; { [ -n "$run" ] || { echo "No pipeline run for ${lower} after 5 minutes."; false; }; } && gh run watch "$run" --exit-status
```

```bash
git push origin HEAD:main
```

```bash
git push origin --delete candidate/verify-lower-commit
```

Last, delete the first candidate branch:

```bash
git push origin --delete candidate/verify-checks-before-main
```

Record the outcome with the next change. In the "Phase 0: push of several commits" row of `docs/verification.md`, write whether GitHub checked only the tip or every new commit. In that same change, replace "pending owner verification (M06)" in each other "Phase 0:" row with the date of the run.

### Phase 1 owner steps: slice 1 and E2E-R1

Land 0003 and Phase 0 first. Stop unless `git pull --ff-only origin main && grep -q SPEC-001-R41 specs/SPEC-001-delivery-pipeline.md && grep -q 'candidate/' .github/workflows/pipeline.yml && echo "Phase 0 is in place"` prints its confirmation. Then define `waitrun`, stage slice 1, and check that the spec diff only amends R40 and adds the "Receipt" section. `waitrun` waits for the pipeline run of `HEAD` on a branch, and stops with a message if none starts within 5 minutes:

```bash
waitrun(){ run=""; for attempt in $(seq 60); do run="$(gh run list --workflow pipeline.yml --branch "$1" --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"; [ -n "$run" ] && break; sleep 5; done; [ -n "$run" ] || { echo "No pipeline run on $1 for $(git rev-parse --short HEAD) after 5 minutes."; return 1; }; gh run watch "$run" --exit-status; }
git mv -f proposals/phase-1/SPEC-001-delivery-pipeline.md specs/ && git mv -f proposals/phase-1/github-workflows/pipeline.yml .github/workflows/
for f in scripts/checks.ts scripts/receipt.ts test/receipt.test.ts test/checks.test.ts test/checks-before-main.test.ts scenarios/B10-unattested-artifact.patch traceability.md; do git mv -f "proposals/phase-1/$f" "$f"; done
git diff --cached -- specs/SPEC-001-delivery-pipeline.md traceability.md
```

1. Sign with `git commit -S -m "spec: receipt tracer bullet, slice 1" --trailer "Spec: SPEC-001-R40" --trailer "Spec: SPEC-001-R45" --trailer "Spec: SPEC-001-R48" --trailer "Spec: SPEC-001-R50" --trailer "Spec: SPEC-001-R55" --trailer "Spec: SPEC-001-R56"`.
2. Run `git push origin HEAD:candidate/receipt-tracer && waitrun candidate/receipt-tracer`. Checks, build, attest and receipt pass and deploy is skipped. The summary shows `AGENT none reported`, `SIGNED pipeline.yml@refs/heads/candidate/receipt-tracer (editable by the agent)` and `VERIFIED 2/2 predicate types`. The receipt job log shows `gh --version`, then one `receipt: verified` line per type whose `buildSignerDigest` is the commit.
3. Run `rm -rf dist && gh run download "$run" --name function --dir dist`. Then `GITHUB_SHA="$(git rev-parse HEAD)" node scripts/checks.ts receipt dist/function.zip deploy` must print `CHECK receipt FAILED: missing https://slsa.dev/provenance/v1`.
4. Run `git push origin HEAD:main && waitrun main`. A new run for the same commit must start within 5 minutes. Do step 5 while it waits.
5. Read that run's receipt. It shows `SIGNED pipeline.yml@refs/heads/main (editable by the agent)` and `VERIFIED 2/2 predicate types`, and its log shows `buildSignerDigest` equal to the commit. Then approve the `sandbox` deployment (the gate). The deploy log shows the attestation check, the receipt check, `configure-aws-credentials`, plan, the irreversible check and apply, in that order. The deploy succeeds.
6. Run `git push origin --delete candidate/receipt-tracer`. Then `npm run scenario -- B10` must print `CHECK attestation FAILED: dist/function.zip`.
7. Have the agent record both run IDs and what steps 3 and 6 printed in `docs/verification.md`, replacing "pending owner verification (E2E-R1)" with the run date. That commit is round 2: land it through `candidate/` and `main` as in steps 2 and 4. Its receipt must show `AGENT Claude Code (as reported by the commit)` and `MODEL not recorded`. Record its run ID with the next change.

## Draft requirements

| ID | Requirement |
|---|---|
| SPEC-001-R40 | WHEN a commit is pushed to a branch matching `candidate/**`, THE pipeline SHALL run only the checks and build jobs on that commit. THE attest and deploy jobs SHALL run only for `refs/heads/main`. |
| SPEC-001-R41 | THE `protect main` ruleset that `scripts/bootstrap/github.sh` applies SHALL have no bypass actors and SHALL require the status check `checks` from the GitHub Actions app. Then `main` only moves to a commit on which `checks` passed. `scripts/bootstrap/github.sh` SHALL also allow merge commits and turn off squash and rebase merges, so that with linear history required no pull request merges in GitHub. No workflow other than `pipeline.yml` SHALL define a job named `checks`, and no workflow SHALL grant `checks: write` or `statuses: write`. |
| SPEC-001-R42 | WHEN the build job runs, THE pipeline SHALL compute the factory fingerprint over every tracked file matching a factory pattern in `specs/receipt-policy.json`, excluding that file. The fingerprint SHALL be the SHA-256 of canonical JSON (sorted keys, compact separators, non-ASCII escaped, final LF) of the path-sorted `{path, sha256}` list, each file hashed as raw bytes. IF `CLAUDE.md` imports a file outside the patterns, THEN the build job SHALL print `CHECK receipt FAILED: import outside factory <path>`. |
| SPEC-001-R43 | WHERE `CHECK_RESULTS` names a file, WHEN `npm run checks` runs, THE pipeline SHALL append `{check, status}` to it after each check exits. It SHALL leave the order, pass lines and failure line unchanged. |
| SPEC-001-R44 | WHEN the checks job has passed, THE pipeline SHALL hash `scripts/checks.ts` and each config file the checks read, and compare each with its committed blob. IF one differs, THEN the checks job SHALL print `CHECK receipt FAILED: <path> changed during checks`. |
| SPEC-001-R45 | WHEN the build job runs, THE pipeline SHALL write the predicate `https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2`. It SHALL hold the fingerprint, the policy's factory version and one record per commit since the last receipted commit. It SHALL also hold each changed file's and each zip member's path and SHA-256. Each commit record SHALL hold the agent, labelled as reported by the commit. Its model SHALL be `not recorded`, whatever trailer the commit carries (deviation D05). |
| SPEC-001-R46 | WHEN the build job runs, THE pipeline SHALL write an `https://in-toto.io/attestation/test-result/v0.1` predicate with `passedTests` in check order. Its `configuration` SHALL hold the R44 digests and the commit and tree SHA, and its `url` SHALL name the run. |
| SPEC-001-R47 | WHEN the build job runs, THE pipeline SHALL write a CycloneDX 1.7 document with one `file` component per factory file and MCP servers under `services`. Each component SHALL have a SHA-256 hash and a `pkg:github` purl with the path as subpath. The document SHALL have no `serialNumber` and no timestamp. |
| SPEC-001-R48 | WHEN the attest job runs, THE pipeline SHALL sign the R45, R46 and R47 predicates over `dist/function.zip` with `actions/attest`, and SHALL run no repository code. |
| SPEC-001-R49 | WHEN the receipt check runs, THE pipeline SHALL read `specs/receipt-policy.json` with full history. IF it is unreadable, THEN the identifier SHALL be `policy unreadable`. IF its last change is not signed by an approver, THEN it SHALL be `policy not approver-signed`. |
| SPEC-001-R50 | WHEN the receipt check runs, THE pipeline SHALL verify each predicate type the policy requires once, with `--limit 1000` and the SPEC-001-R17 pins. It SHALL then match the type, the zip digest, the commit and the ref itself. On a candidate run, the run's own `refs/heads/candidate/<topic>` SHALL replace `refs/heads/main` in those pins. IF one is missing or fails, THEN the identifier SHALL be `missing <predicate type>`. |
| SPEC-001-R51 | IF the verified test result lacks a check the policy requires, THEN the identifier SHALL be `missing check result <name>`, naming the first in policy order. |
| SPEC-001-R52 | IF a verified bill-of-materials component matches a revoked entry on path and SHA-256, THEN the identifier SHALL be `revoked <path>`. |
| SPEC-001-R53 | IF the verified fingerprint is not approved, THEN the identifier SHALL be `factory file <path> not approved`, naming the first path that differs from the latest approved entry. |
| SPEC-001-R54 | Withdrawn on 2026-11-05: the model is not recorded (owner decision, deviation D05). The ID stays reserved. It read: WHERE the policy sets `require_model`, IF a recorded commit has an `Agent` trailer and no `Model` trailer, THEN the identifier SHALL be `agent commit has no model`. |
| SPEC-001-R55 | WHEN the receipt job runs, THE pipeline SHALL write the receipt to the run summary. It SHALL show factory version and fingerprint, agent per commit with the model as `not recorded`, file count, each check with PASS and `TOTAL <n>/<n> PASSED`. It SHALL then show each factory file and the signer workflow and ref, labelled editable by the agent while the signer is `pipeline.yml` in this repository. |
| SPEC-001-R56 | THE receipt check SHALL evaluate R49 to R53 in order and print only the first failure as `CHECK receipt FAILED: <identifier>`. It SHALL run again in the deploy job before any AWS call. |
| SPEC-001-R57 | WHEN a scenario has `run: receipt-verify`, THE harness SHALL evaluate R49 and R51 to R53 on the patched tree, without R50. It SHALL take check results from the scenario's `results` fixture when it names one. |
| SPEC-001-R58 | B19 root `.mcp.json` declaring an MCP server: `CHECK receipt FAILED: factory file .mcp.json not approved` |
| SPEC-001-R59 | B20 check results without mutation: `CHECK receipt FAILED: missing check result mutation` |
| SPEC-001-R60 | B21 video skill restored to a revoked version: `CHECK receipt FAILED: revoked .claude/skills/video/SKILL.md` |
| SPEC-001-R61 | B22 unsigned policy edit approving a new fingerprint: `CHECK receipt FAILED: policy not approver-signed` |
| SPEC-001-R62 | Withdrawn on 2026-11-05 with R54; scenario B25 is withdrawn too. Both IDs stay reserved. It read: B25, only WHERE `require_model` is set: `CHECK receipt FAILED: agent commit has no model` |
| SPEC-001-R63 | WHEN the build job runs, THE pipeline SHALL add to the R45 predicate one intent record per requirement ID cited in a `Spec:` trailer of the recorded commits. Each record SHALL hold the ID and the path and SHA-256 of the spec file that defines it at that commit. It SHALL also hold the last commit that changed that file and the fingerprint of the approver key that signed it. THE receipt that R55 writes SHALL show one `INTENT` line per record. |

B19 to B22 run in receipt-only mode (`run: receipt-verify`), because `npm run checks` does not run the receipt check. B10 likewise runs only the attestation check (`run: deploy-verify`). B21 and B22 also change protected paths, so a full run would stop first at `signatures`. A negative control runs the same mode on the unpatched tree and expects a pass.

Where every factory file is protected, the receipt check repeats part of `signatures`. What it adds is explicit factory versions: an approver-signed change still fails until its fingerprint is approved, and an approved input can later be revoked.

## Decided by the owner, 2026-11-05

| Topic | Decision | Effect here |
|---|---|---|
| Tracer bullet | The receipt is the tracer-bullet target, on GitHub Actions in this repo through the deploy job | Phase 1 is built as a tracer bullet, starting with the attestation store and the candidate signer pin (Plan). Drafting starts now; it lands after decision 0003 and Phase 0 |
| Agent Contracts draft 0.1 | Zip now, align later | The first slices attest `dist/function.zip` only (decision 2). Alignment is a later use case (see Later use cases) |
| Model (D05) | "Not recorded" | SPEC-001-R54, SPEC-001-R62 and scenario B25 are withdrawn. Their IDs stay reserved and are not reused. The receipt shows the model as not recorded (R55) |
| Factory | The agent's inputs only | Decision 3 stands |
| Intent | Yes | SPEC-001-R63 records each cited requirement's spec file and its approval, and the receipt shows an `INTENT` line per requirement (T01, T04, T06) |
| Check source | Any workflow in the repo can report a check named `checks` | Accepted and documented until Phase 3 (see What the receipt would and would not prove) |
| Merge methods | Squash and rebase merges off, merge commits allowed | If GitHub accepts it, required linear history then blocks every merge-button merge (M06). Pull requests are review-only, and every change lands by fast-forward push (decision 13, M03, M04) |
| Candidate signer pin | A candidate run's receipt check pins its own ref; the deploy job keeps the `refs/heads/main` pin | Phase 0 drops attestation on candidate runs, and T09 adds it back with that pin (decision 9, R40, R50, T14) |
| R41 wording | "`main` only moves to a commit on which the checks passed" | GitHub's handling of a push of several commits is settled in M06 by pushing two commits at once (see Not yet verified) |
| Receipt slice 1 | Build slice 1 first. Deploy needs `[build, attest, receipt]` with the default success condition, so `always()` is dropped. Attest signs only SLSA provenance and `provenance/v2`, with no checkout and no repository code. `provenance/v1` is retired. The receipt renders in protected `scripts/checks.ts`, and R17 uses the same exact pin builder. No `gh` output is captured first: the test fixture is derived from gh v2.103.2 source | R40 (amended), R45, R48, R50, R55 and R56 land in tracer form (Plan). Slice 1, not T09 as the Candidate signer pin row says, adds candidate attestation back with that pin. Later slices add receipt lines to the `checks.ts` renderer, not to `receipt.ts` as T06 says. The next widening is the approved factory |

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Protect `.mcp.json` and nested `CLAUDE.md` | Add them to `protected-paths.txt`; or leave them to the receipt check alone | Protect them. B19 then changes a protected path like B21 and B22, so a full run would stop first at `CHECK signatures FAILED: unsigned change to .mcp.json`. Nested `CLAUDE.md` needs basename matching in `guardedBy`, which today matches exact paths and `/` prefixes only |
| Factory version | An integer the approver bumps in the policy; or the SHA of the last signed commit touching the set | Integer: readable on the receipt |
| Signer out of reach | Phase 3 reusable workflow; a custom deployment protection rule (a GitHub App); accept and label the gap | Phase 3. Until then the receipt says "signed by `pipeline.yml@refs/heads/main`, editable by the agent" |
| What goes public | Predicates are readable through GitHub's attestation API for a public repo. The signing certificate in Rekor, Sigstore's public transparency log, keeps repo, workflow, ref, commit and run URL forever | Commit trailers, file paths, digests and check names are acceptable; no file contents |
| Scenario count | The purpose line says "19 deliberately bad changes" | Update it with Phase 2 |
| Revoked skill for B21 | Which earlier `SKILL.md` digest to revoke | One of its 2 earlier versions, from commits `ebe586c` and `124eca2` |
| Candidate branch names | `candidate/**`; or reuse each cloud session's `claude/**` branch | `candidate/**`: one pattern for agents and humans |
| Ruleset bypass | No bypass actors, as today; or let the owner bypass | None. Approver commits take the same path, which is the talk's "the human's fix runs the same pipeline". AWS break-glass is unaffected |
| Merge methods if GitHub refuses | Accept that pull requests stay mergeable in GitHub but must not be merged, and record a deviation; or find another control | None yet. Decide once M06 shows whether GitHub keeps squash or rebase merges on while linear history is required |

## Options considered

| Option | Verdict |
|---|---|
| A. Adopt apmx and the APM agent package manager it bundles, as-is | Rejected. apmx runs only Copilot CLI or OpenCode 1.2.24, and runs the agent itself outside a Git checkout. Its `apmx audit` check runs on pull requests, and its docs recommend `pull_request_target`, which zizmor's offline `dangerous-triggers` audit flags. Its documented `audit.yml` example also pins actions by tag. Its release is an "EXPERIMENTAL prerelease" |
| B. Native emission with `actions/attest`, `gh` and `scripts/receipt.ts` | **Chosen**. Pinned actions only, no new dependencies, fits the check and signature model |
| C. B plus an agent-contracts `receipt.intoto.jsonl` export and a VSA | Deferred: the alignment with draft 0.1 is a later use case (see Later use cases) |
| D. Extend only the existing custom predicate | Rejected. No per-check evidence and no bill of materials |

## Agent Contracts & Receipts

| Fact | Source |
|---|---|
| Draft 0.1: "Nothing here is stable". No format version field and no conformance classes | `spec/README.md` |
| Two commits, both on 2026-11-04 UTC; no tags or releases | `git log` and `git ls-remote`, 2026-11-04 |
| Spec text CC-BY-4.0; schemas and examples Apache-2.0 | repository page |
| Its bill of materials is CycloneDX 1.5 with packages and no hashes; skill digests sit in the provenance | `spec/receipt.md` |
| Its own open questions include model attestation, harness portability and where skills belong in CycloneDX | `spec/open-questions.md` |

The format is a useful reference, not a dependency. Its wording for the merge check, "at merge", "target branch" and "change under review", does not require a pull request; only apmx's check does. Decision 13's flow, a fast-forward push held by a required status check, fits that wording. Its freshness rule (item 8) works too, because `main`'s tip is still the base when the check runs. Its item 1, running the check's definition from the target branch and never from the change, does not fit: a push-triggered workflow runs from the pushed commit. Phase 3 is the answer here as well. This repo is a case its open questions do not yet cover: Claude Code as the agent, and a merge with no pull request. The agent-contracts repository's discussions are the place to raise that.

## Later use cases

| Use case | What it adds | Why later |
|---|---|---|
| Align with Agent Contracts draft 0.1 | A CycloneDX 1.5 bill of materials, the changed source files as subjects next to the zip, and one signed SLSA verification summary | Owner decision 2026-11-05: zip now, align later. Decisions 2, 11 and 12 and R47's CycloneDX 1.7 document hold until then |

## Consequences

| Consequence | Mitigation |
|---|---|
| Every change waits for a pipeline run before it lands. On run 41900932055 the checks job took 63 s, then build and attest about 15 s each | Accept: the trade is a `main` that only moves to a checked commit |
| Scenarios run after landing. `scenarios.yml` runs on pushes to `main` only, so a change that breaks a scenario or a patch's context lands first and fails there | Accept. Phase 0 rebases the B10 patch for this reason (M05) |
| Every change runs the pipeline twice: on `candidate/` and again on `main` | Accept: only the `main` run deploys, and the second checks run is about a minute |
| A factory file changed without a new approved fingerprint fails at the receipt job, after checks and build | `node scripts/receipt.ts fingerprint` prints the value for the approver's commit |
| The zip is reproducible, so many commits share one digest and its attestation list grows with every push | Paginate; verify with `--source-digest` pinned to the commit |
| The test result's subject is the zip, though in-toto expects the tested source. `actions/attest` cannot sign a `gitCommit` digest | Record the deviation; put the commit and tree SHA in the predicate |
| Agent-written tests run before mutation and could rewrite a config | R44 compares each config with its committed blob after the run |
| `scripts/receipt.ts` gets unit tests but no mutation testing; Stryker covers `src/` only | Accept, or widen the mutate set as a separate signed change |
| `sast` and `sca` fetch rules and advisories at run time, so their PASS cannot be reproduced from the receipt | State it in the predicate schema |

## Related finding: the approver key

The signature that approves every policy change can be produced without a human. `.claude/settings.json` denies `git commit *-S*`, but `git -c x=y commit -S` does not match that pattern. `approvers.txt` holds a plain `ssh-ed25519` key, which signs without a physical touch. On the approver's laptop with ssh-agent loaded, a Claude Code session could make an approver-signed commit. This is inference from the rules and the key type; it has not been tried. A hardware-backed security key (`ed25519-sk`, or `ecdsa-sk`) closes it, and is a precondition for decision 8 meaning what it says. `docs/decisions/0003-approver-key.md` proposes that fix. It requires a touch on every signature, touch only for now per the owner decision of 2026-11-05: no `verify-required` and no PIN yet.

## Not yet verified

| Item | How to settle it |
|---|---|
| Whether the store refuses SLSA provenance with a custom `buildType`, as apmx's spec says. Custom non-SLSA types are stored: this repo's `provenance/v1` attestation on `function.zip` is listed | Not needed: this plan signs no custom `buildType` |
| `gh attestation verify --bundle` ignores bundles of other predicate types in one JSONL file | Phase 1 test |
| Which Node.js version the `ubuntu-24.04` image provides. It does strip TypeScript types: run 41544406198's deploy job ran `node scripts/checks.ts attestation` without `setup-node` and printed `CHECK attestation FAILED: dist/function.zip` | Add `actions/setup-node`, already pinned in the checks and build jobs, to every job that runs `.ts`, so the version is pinned |
| AWS accepts a `job_workflow_ref` pinned at a commit SHA for Phase 3 | Phase 3 spike against the sandbox account |
| The exact error a refused push to `main` prints, and whether the ruleset's required checks also hold the repository admin's own pushes when there are no bypass actors | M06: push an unchecked commit as the owner |
| Whether GitHub checks only the tip of a push of several commits to `main`, or every new commit. R41's wording holds either way. If GitHub checks every commit, each phase must land as one commit | M06: push two commits at once, the lower one never checked |
| The GitHub Actions app ID to name as the expected source | M03 reads it from an existing `checks` check run instead of hard-coding it |
| Whether GitHub accepts squash and rebase merges off while `protect main` requires linear history; its docs say it needs one allowed | M06: `github.sh` reports a refusal and reads the `allow_*` values back |

## Sources

| Source | Checked |
|---|---|
| https://theainativemind.com/blog/agent-contracts-and-receipts/ | 2026-11-04 |
| https://github.com/danielmeppiel/agent-contracts/blob/main/spec/receipt.md | 2026-11-04 |
| https://github.com/danielmeppiel/agent-contracts/blob/main/spec/contract.md | 2026-11-04 |
| https://github.com/danielmeppiel/agent-contracts/blob/main/spec/open-questions.md | 2026-11-04 |
| https://github.com/danielmeppiel/apmx/blob/main/.github/workflows/run.yml | 2026-11-04 |
| https://github.com/danielmeppiel/apmx/blob/main/docs/audit.md | 2026-11-04 |
| https://github.com/danielmeppiel/apmx/releases/tag/v0.8.0 | 2026-11-04 |
| https://slsa.dev/spec/v1.2/build-provenance | 2026-11-04 |
| https://slsa.dev/spec/v1.2/verification_summary | 2026-11-04 |
| https://github.com/in-toto/attestation/blob/main/spec/predicates/test-result.md | 2026-11-04 |
| https://github.com/in-toto/attestation/blob/main/spec/predicates/svr.md | 2026-11-04 |
| https://github.com/in-toto/attestation/blob/main/spec/predicates/cyclonedx.md | 2026-11-04 |
| https://github.com/CycloneDX/specification/blob/master/schema/bom-1.7.schema.json | 2026-11-04 |
| https://github.com/CycloneDX/specification/issues/895 | 2026-11-04 |
| https://github.com/package-url/purl-spec/blob/main/types/github-definition.json | 2026-11-04 |
| https://github.com/actions/attest/blob/main/README.md | 2026-11-04 |
| https://cli.github.com/manual/gh_attestation_verify | 2026-11-04 |
| https://docs.github.com/en/actions/concepts/security/artifact-attestations | 2026-11-04 |
| https://docs.github.com/en/rest/repos/attestations | 2026-11-04 |
| https://docs.zizmor.sh/audits/ | 2026-11-04 |
| https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches | 2026-11-05 |
| https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets | 2026-11-05 |
| https://docs.github.com/en/rest/repos/rules | 2026-11-05 |
| https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github | 2026-11-05 |
| https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification | 2026-11-05 |
