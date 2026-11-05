# 0002. A signed receipt for every deploy

- Status: Proposed
- Date: 2026-11-04
- Requirements: proposed SPEC-001-R40 to SPEC-001-R62. None is in the signed spec yet. Renumbered on 2026-11-04 from R39 to R59, because decision 0003 proposes SPEC-001-R39. R61 and R62, the merge gate, added on 2026-11-05
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

The repo has been public since 2026-11-02. On commit `13be9b2` (run 41548920455) the attest job succeeded and the deploy job waits for the `sandbox` reviewer. Run 41549035939 on `a744cb3` also attested; its deploy is queued behind that one. Deviation D06 (the deploy job fails closed because attestations need a public repo on this plan) therefore no longer blocks, and a receipt can run end to end today.

Today a commit is on `main` before the pipeline runs, so the first thing a failed check can still block is the deploy. GitHub can hold a direct push until checks pass, with no pull request: "After all required status checks pass, any commits must either be pushed to another branch and then merged or pushed directly to the protected branch" (GitHub, About protected branches). This decision therefore gates at merge: a commit reaches `main` only after the pipeline has passed on that same commit. The deploy-time checks stay as a second line of defence.

## What the receipt would and would not prove here

| It would prove | It would not prove |
|---|---|
| Which agent inputs were in the tree at the deployed commit, by SHA-256 | That the agent loaded or followed them, or what user-level `~/.claude` settings, plugins or connectors the session had |
| Which checks passed, recomputed by a job with no agent | Anything a failing run would show: build needs checks, so every signed receipt says 15/15 |
| That the zip was not changed between build and deploy | That the code is right. Green is as good as the checks |
| What each commit says about its agent and model | Which model ran. Trailers are written by the agent and nothing attests them |
| That no commit reached `main` without passing the checks, and from Phase 2 the receipt check, on that same commit | That nobody can bypass the ruleset. Today it has no bypass actors; anyone later added to that list could push around it |
| That `pipeline.yml` on `main` signed it | That the signer was out of the agent's reach. The agent can push to `pipeline.yml`; the `signatures` check catches an unsigned edit only afterwards, inside the same pipeline (Phase 3 closes this) |

## Today, line by line

| Receipt line | Today | Gap |
|---|---|---|
| FACTORY and fingerprint | Nothing. `specs/protected-paths.txt` lists the paths but computes no digest | An approver-signed list of agent inputs and a digest over them |
| AGENT and MODEL | Partial. `pipeline.yml:94-100` reads trailers with `git log -1`, so a push of several commits records one. The model is empty for agent commits (deviation D05: they carry no `Model:` trailer). `attestationArgs` passes no `--predicate-type`, so the custom predicate is signed but never verified | Every commit since the last receipt, labelled as reported. An owner decision on D05 |
| FILES | Partial. One subject, the zip, built reproducibly (`pipeline.yml:60-67`) | Zip members and the push's changed files, each with SHA-256, inside the predicate |
| Each check PASS, TOTAL | Nothing. `checks.ts` prints pass lines to standard error and keeps no record | A results file from the checks job, signed as an in-toto test result |
| SKILL pinned | Nothing | A CycloneDX bill of materials of the factory files (decision 3) and any MCP servers |
| SIGNED | Yes, through `actions/attest` and Sigstore's public-good instance | No new signer for Phases 1 and 2 |
| Policy evaluation | Signature and signer only | `specs/receipt-policy.json` and a `receipt` check |

## Decisions (proposed)

| # | Decision |
|---|---|
| 1 | Emit the receipt natively with the already-pinned `actions/attest` and the runner image's preinstalled `gh`, which nothing pins today. Do not adopt apmx, the agent-contracts author's tool that runs agents from Markdown contracts and writes receipts (see Options) |
| 2 | `dist/function.zip` stays the only subject of every statement. Member and changed-file digests go inside the predicates. GitHub advises signing manifests of hashes, not individual files |
| 3 | The factory is the agent's inputs: `CLAUDE.md` and every nested `CLAUDE.md`, the specs `CLAUDE.md` imports, `.claude/**` and `.mcp.json`. Check definitions are recorded separately, in the test result's `configuration` |
| 4 | The fingerprint is the SHA-256 of canonical JSON (sorted keys, compact separators, non-ASCII escaped as `\uXXXX`, final LF) of the path-sorted list of `{path, sha256}`. Each file is hashed as raw bytes |
| 5 | Repository code never runs in a job that can sign. The checks and build jobs compute the predicates; the attest job only signs them with pinned actions |
| 6 | A new `receipt` job runs after attest, with no environment, and writes the receipt to the run summary. The deploy job needs it, so the review request appears only after the receipt exists. The `sandbox` reviewer approves before the deploy job's first step, so this is the only place the reviewer can read it in time |
| 7 | `receipt` is a check outside the ordered fifteen, like `attestation` and `irreversible`. It prints one line, `CHECK receipt FAILED: <identifier>`. The build and checks jobs print the same prefix for the R40 and R42 failures |
| 8 | Policy lives in `specs/receipt-policy.json`, so the existing `signatures` check already requires an approver's signature on every change to it |
| 9 | The receipt check fetches every attestation for the zip digest, unfiltered and paginated, then verifies each required predicate type. It uses the signer pins `attestationArgs` already applies for SPEC-001-R17: `pipeline.yml` on `refs/heads/main`, a GitHub-hosted runner and the commit. GitHub documents the server-side `predicate_type` filter as taking free text for custom types. apmx reports that the list API refuses the VSA type as a filter, and `gh` reads one page of 30 |
| 10 | Commit records run from the last receipted commit to `GITHUB_SHA`, not from `github.event.before`. A newer queued run may cancel a pending one (see Not yet verified), and the first push to a new repo has no `before` |
| 11 | No SLSA Verification Summary Attestation (VSA) in Phases 1 and 2. If one is added later, use the in-toto Simple Verification Result or a VSA with `SLSA_BUILD_LEVEL_UNEVALUATED`, signed by the job that ran the verification |
| 12 | Borrow two conventions from agent-contracts draft 0.1: canonical-JSON hashing and one shared subject set. The digests are not comparable with apmx's, which hash a contract graph |
| 13 | Gate at merge, without a pull request. Every author, agent or human, pushes a commit to a short-lived `candidate/` branch first. The pipeline runs checks, build, attest and, from Phase 2, the receipt check on that commit. The `protect main` ruleset requires those status checks, with GitHub Actions as the expected source, so `main` accepts the same commit as a fast-forward only after they pass. The author then pushes it to `main` |
| 14 | The push to `main` runs the pipeline again, as today, and only that run deploys. Its attestations carry `refs/heads/main`, so the SPEC-001-R17 pins stay as they are. The zip is reproducible, so both runs attest the same digest. The receipt check also runs again in the deploy job (R54), as a second line of defence |
| 15 | No workflow pushes to `main`. A job that fast-forwards `main` after green would hold a write token inside a workflow the agent can edit |

## Plan

Four phases. Phase 0, the merge gate, needs no receipt code and can land first. Each phase lands as one push whose last commit is approver-signed and carries a `Spec:` trailer. The agent's unprotected files land in earlier commits of the same push, because the slides, trace and test checks fail on any half of the change. The test check includes `test/video.test.ts`.

| Phase | Delivers | Protected files (through `proposals/`) | Unprotected files |
|---|---|---|---|
| 0. Merge gate | Commits reach `main` only after the 15 checks pass on that commit | `specs/SPEC-001-delivery-pipeline.md`, `.github/workflows/pipeline.yml`, `scripts/bootstrap/github.sh`, `CLAUDE.md` | `test/checks.test.ts`, `docs/` |
| 1. Emit and show | Three new signed statements and the receipt in the run summary | `specs/SPEC-001-delivery-pipeline.md`, `specs/receipt-policy.json`, `specs/protected-paths.txt`, `scripts/checks.ts`, `.github/workflows/pipeline.yml` | `scripts/receipt.ts`, `test/receipt.test.ts`, `test/checks.test.ts`, `docs/` |
| 2. Evaluate | The `receipt` check, in the receipt and deploy jobs, and scenarios B19 to B22 | the same spec, policy, `checks.ts` and `pipeline.yml`, plus `scripts/receipt.ts` (protected by T08), `scenarios/run.ts` and `CLAUDE.md` | tests, the rest of `scenarios/`, `practices.yaml`, `video/explanations.yaml`, `docs/` |
| 3. Signer out of reach | Build, attest and deploy run in a reusable workflow in a repository the agent cannot push to | `pipeline.yml`, `scripts/checks.ts`, `infra/sandbox/iam.tf` | `test/checks.test.ts`, `docs/` |

### Tasks

| ID | Phase | Task | Files | Protected | Verified by |
|---|---|---|---|---|---|
| M01 | 0 | Spec amendment R61 and R62 | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once M02 and M03 name R61 and R62 in test titles |
| M02 | 0 | `pipeline.yml`: also run on pushes to `candidate/**`; the deploy job runs only on `refs/heads/main` | `proposals/github-workflows/pipeline.yml`, `test/checks.test.ts` | yes, except the test | `npm run check:workflows`; an R61 test reading the trigger and the deploy condition |
| M03 | 0 | `github.sh`: add a `required_status_checks` rule for `checks` to `protect main`, naming the GitHub Actions app ID read from an existing `checks` check run. Also update the ruleset when it exists; today the script skips it | `proposals/scripts/bootstrap/github.sh`, `test/checks.test.ts` | yes, except the test | an R62 test reading the rule from the script |
| M04 | 0 | `CLAUDE.md`: push to `candidate/<name>`, wait for the checks, then push the same commit to `main` | `proposals/CLAUDE.proposed.md` | yes | approver review |
| M05 | 0 | Approver lands Phase 0 and runs `github.sh`; owner tries to push an unchecked commit straight to `main` | M01 to M04, then `docs/verification.md` | yes, except `docs/verification.md` | GitHub refuses the push; the same commit lands after its `candidate/` run passes |
| T01 | 1 | Spec amendment R40 to R46 and R53 | `proposals/SPEC-001-delivery-pipeline.md` | yes | approver review; trace passes once T02 to T09 name each of R40 to R46 and R53 in a test title |
| T02 | 1 | Policy file with factory patterns and version | `proposals/receipt-policy.json` | yes | `test/receipt.test.ts` R40 |
| T03 | 1 | `receipt.ts`: canonical JSON, raw-byte SHA-256, fingerprint, `@`-import check | `scripts/receipt.ts`, `test/receipt.test.ts` | no, until T08 | unit tests: order-independent, one-byte change detected, untracked files excluded |
| T04 | 1 | `receipt.ts`: commit records, changed files (deletions without digest), zip members from `dist/function/` | same | no | git fixture with two commits and a first-push case |
| T05 | 1 | `receipt.ts`: in-toto test result and CycloneDX 1.7 builders | same | no | byte-identical output for fixed fixtures |
| T06 | 1 | `receipt.ts`: run-summary renderer | same | no | snapshot test of the rendered receipt |
| T07 | 1 | `checks.ts`: results writer when `CHECK_RESULTS` is set; order and lines unchanged | `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes | existing R1 order test still passes; new R41 test |
| T08 | 1 | Protect `scripts/receipt.ts`, and `.mcp.json` and nested `CLAUDE.md` if the owner agrees | `proposals/protected-paths.txt`, `proposals/scripts/checks.ts` | yes | `guardedBy` test |
| T09 | 1 | `pipeline.yml`: checks job uploads results and config digests; build job checks out with `fetch-depth: 0` and writes predicates; attest job signs three more; `receipt` job renders, and deploy needs it. Rebase the B10 and B18 patches, whose context this changes | `proposals/github-workflows/pipeline.yml`, `scenarios/B10-unattested-artifact.patch`, `scenarios/B18-unsigned-pipeline-change.patch` | yes, except the patches | `npm run check:workflows`; R42 and R46 tests; scenarios B8a, B8b, B10 and B18 still fail with their recorded lines |
| T10 | 1 | Publish the predicate schema; update D06; record deviations for decisions 2 and 12 | `docs/predicates/provenance-v2.md`, `docs/deviations.md` | no | review |
| T11 | 1 | Approver lands Phase 1; owner records the first receipt | T01 to T10, then `docs/verification.md` | yes, except `docs/verification.md` | run summary shows the receipt; `gh attestation verify` passes per predicate type |
| T12 | 2 | Spec amendment R47 to R51 and R54 to R59, plus R52 and R60 if the owner keeps the `Model:` trailer | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes after T19 |
| T13 | 2 | `receipt.ts`: policy evaluator, one function per requirement R47 to R52, run in that order | `proposals/scripts/receipt.ts`, `test/receipt.test.ts` | yes, after T08 | one test per requirement asserting the exact identifier |
| T14 | 2 | `checks.ts`: `receipt` check entry with R17 pins and its own pass line | `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes | pin test mirroring `test/checks.test.ts:208-215` |
| T15 | 2 | Policy: approved factory entries (version, fingerprint, and each file's path and SHA-256), required checks and predicate types, revoked inputs | `proposals/receipt-policy.json` | yes | R47 and R49 to R51 tests |
| T16 | 2 | `pipeline.yml`: `receipt` job runs the check; deploy runs it after `attestation`; the receipt and deploy jobs both check out with `fetch-depth: 0`. `github.sh` adds `receipt` to the required status checks | `proposals/github-workflows/pipeline.yml`, `proposals/scripts/bootstrap/github.sh` | yes | `npm run check:workflows`; an R62 test for `receipt` |
| T17 | 2 | `run.ts`: receipt-only mode, a scenario with no patch, a `results:` field separate from `fixture` | `proposals/scenarios/run.ts`, `test/scenarios.test.ts` | yes | scenario table test |
| T18 | 2 | Scenarios B19 to B22, and B25 if the owner keeps R52; fixtures under `scenarios/fixtures/`; a negative control | `scenarios/` | no | `npm run scenarios` after landing |
| T19 | 2 | Scenario table rows R56 to R59, and R60 if the owner keeps R52; `receipt` treated as a local check, needing no GitHub Actions or sandbox account | `test/scenarios.test.ts` | no | trace and test checks |
| T20 | 2 | Plain words for `receipt` and B19 to B22. Map them to practices P20 (deploy verifies attestations first) and P21 (provenance records commit, spec ID, agent and model). Regenerate the practices table | `video/explanations.yaml`, `practices.yaml`, `docs/practices.md` | no | test and slides checks |
| T21 | 2 | `CLAUDE.md`: file map, scenario count, the `receipt` check | `proposals/CLAUDE.proposed.md` | yes | approver review |
| T22 | 2 | Approver lands Phase 2 | T12 to T21 | yes | `npm run checks` and `npm run scenarios` pass on `main` |
| T23 | 3 | Owner creates the signer repository and its reusable workflow | new repository | owner only | `gh attestation verify --signer-workflow <signer repo>/.github/workflows/<file>` |
| T24 | 3 | `pipeline.yml` calls it by SHA; `iam.tf` trusts only its `job_workflow_ref`; `attestationArgs` pins it | `proposals/github-workflows/pipeline.yml`, `proposals/infra/sandbox/iam.tf`, `proposals/scripts/checks.ts`, `test/checks.test.ts` | yes, except the test | deploy assumes the role only from the signer workflow |

Agent notes:

- The agent cannot sign, so it cannot run the scenarios against the proposed batch before it lands. T22 verifies them on `main`.
- `proposals/package.json` is blocked by `Edit(**/package.json)`. No dependency change is needed, because `receipt.ts` uses Node.js built-ins only. SPEC-001 defines a check as an npm script `check:<name>`, so a `check:receipt` script, like `check:irreversible`, goes to the approver as `proposals/package.proposed.json`. `attestation` has no script today.
- The PostToolUse hook runs ESLint's `vitest/expect-expect` on any staged `proposals/test/*.test.ts` file and reports a false failure there.

## Draft requirements

| ID | Requirement |
|---|---|
| SPEC-001-R40 | WHEN the build job runs, THE pipeline SHALL compute the factory fingerprint over every tracked file matching a factory pattern in `specs/receipt-policy.json`, excluding that file. The fingerprint SHALL be the SHA-256 of canonical JSON (sorted keys, compact separators, non-ASCII escaped, final LF) of the path-sorted `{path, sha256}` list, each file hashed as raw bytes. IF `CLAUDE.md` imports a file outside the patterns, THEN the build job SHALL print `CHECK receipt FAILED: import outside factory <path>`. |
| SPEC-001-R41 | WHERE `CHECK_RESULTS` names a file, WHEN `npm run checks` runs, THE pipeline SHALL append `{check, status}` to it after each check exits. It SHALL leave the order, pass lines and failure line unchanged. |
| SPEC-001-R42 | WHEN the checks job has passed, THE pipeline SHALL hash `scripts/checks.ts` and each config file the checks read, and compare each with its committed blob. IF one differs, THEN the checks job SHALL print `CHECK receipt FAILED: <path> changed during checks`. |
| SPEC-001-R43 | WHEN the build job runs, THE pipeline SHALL write the predicate `https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2`. It SHALL hold the fingerprint, the policy's factory version and one record per commit since the last receipted commit. It SHALL also hold each changed file's and each zip member's path and SHA-256. Agent and model SHALL be labelled as reported by the commit. |
| SPEC-001-R44 | WHEN the build job runs, THE pipeline SHALL write an `https://in-toto.io/attestation/test-result/v0.1` predicate with `passedTests` in check order. Its `configuration` SHALL hold the R42 digests and the commit and tree SHA, and its `url` SHALL name the run. |
| SPEC-001-R45 | WHEN the build job runs, THE pipeline SHALL write a CycloneDX 1.7 document with one `file` component per factory file and MCP servers under `services`. Each component SHALL have a SHA-256 hash and a `pkg:github` purl with the path as subpath. The document SHALL have no `serialNumber` and no timestamp. |
| SPEC-001-R46 | WHEN the attest job runs, THE pipeline SHALL sign the R43, R44 and R45 predicates over `dist/function.zip` with `actions/attest`, and SHALL run no repository code. |
| SPEC-001-R47 | WHEN the receipt check runs, THE pipeline SHALL read `specs/receipt-policy.json` with full history. IF it is unreadable, THEN the identifier SHALL be `policy unreadable`. IF its last change is not signed by an approver, THEN it SHALL be `policy not approver-signed`. |
| SPEC-001-R48 | WHEN the receipt check runs, THE pipeline SHALL fetch every attestation for the zip digest and verify each predicate type the policy requires, with the SPEC-001-R17 pins. IF one is missing or fails, THEN the identifier SHALL be `missing <predicate type>`. |
| SPEC-001-R49 | IF the verified test result lacks a check the policy requires, THEN the identifier SHALL be `missing check result <name>`, naming the first in policy order. |
| SPEC-001-R50 | IF a verified bill-of-materials component matches a revoked entry on path and SHA-256, THEN the identifier SHALL be `revoked <path>`. |
| SPEC-001-R51 | IF the verified fingerprint is not approved, THEN the identifier SHALL be `factory file <path> not approved`, naming the first path that differs from the latest approved entry. |
| SPEC-001-R52 | WHERE the policy sets `require_model`, IF a recorded commit has an `Agent` trailer and no `Model` trailer, THEN the identifier SHALL be `agent commit has no model`. |
| SPEC-001-R53 | WHEN the receipt job runs, THE pipeline SHALL write the receipt to the run summary. It SHALL show factory version and fingerprint, agent and model per commit, file count, each check with PASS and `TOTAL <n>/<n> PASSED`. It SHALL then show each factory file and the signer workflow and ref, labelled editable by the agent while the signer is `pipeline.yml` in this repository. |
| SPEC-001-R54 | THE receipt check SHALL evaluate R47 to R52 in order and print only the first failure as `CHECK receipt FAILED: <identifier>`. It SHALL run again in the deploy job before any AWS call. |
| SPEC-001-R55 | WHEN a scenario has `run: receipt-verify`, THE harness SHALL evaluate R47 and R49 to R52 on the patched tree, without R48. It SHALL take check results from the scenario's `results` fixture when it names one. |
| SPEC-001-R56 | B19 root `.mcp.json` declaring an MCP server: `CHECK receipt FAILED: factory file .mcp.json not approved` |
| SPEC-001-R57 | B20 check results without mutation: `CHECK receipt FAILED: missing check result mutation` |
| SPEC-001-R58 | B21 video skill restored to a revoked version: `CHECK receipt FAILED: revoked .claude/skills/video/SKILL.md` |
| SPEC-001-R59 | B22 unsigned policy edit approving a new fingerprint: `CHECK receipt FAILED: policy not approver-signed` |
| SPEC-001-R60 | B25, only WHERE `require_model` is set: `CHECK receipt FAILED: agent commit has no model` |
| SPEC-001-R61 | WHEN a commit is pushed to a branch matching `candidate/**`, THE pipeline SHALL run the checks, build and attest jobs on it, and from Phase 2 the receipt job. It SHALL NOT start the deploy job, which SHALL run only for `refs/heads/main`. |
| SPEC-001-R62 | THE `protect main` ruleset that `scripts/bootstrap/github.sh` applies SHALL require the status check `checks`, and from Phase 2 `receipt`. Each SHALL name GitHub Actions as its expected source, with no bypass actors. `main` SHALL then accept a pushed commit only after those checks have passed on that commit. |

B19 to B22 run in receipt-only mode (`run: receipt-verify`), because `npm run checks` does not run the receipt check. B10 likewise runs only the attestation check (`run: deploy-verify`). B21 and B22 also change protected paths, so a full run would stop first at `signatures`. A negative control runs the same mode on the unpatched tree and expects a pass.

Where every factory file is protected, the receipt check repeats part of `signatures`. What it adds is explicit factory versions: an approver-signed change still fails until its fingerprint is approved, and an approved input can later be revoked.

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Model (D05) | `Model:` trailer and `require_model`; the `Co-Authored-By` display name; "not recorded" | "Not recorded" until something other than the agent can report it. B25, R52 and R60 drop out |
| Protect `.mcp.json` and nested `CLAUDE.md` | Add them to `protected-paths.txt`; or leave them to the receipt check alone | Protect them. B19 then changes a protected path like B21 and B22, so a full run would stop first at `CHECK signatures FAILED: unsigned change to .mcp.json`. Nested `CLAUDE.md` needs basename matching in `guardedBy`, which today matches exact paths and `/` prefixes only |
| Factory version | An integer the approver bumps in the policy; or the SHA of the last signed commit touching the set | Integer: readable on the receipt |
| Signer out of reach | Phase 3 reusable workflow; a custom deployment protection rule (a GitHub App); accept and label the gap | Phase 3. Until then the receipt says "signed by `pipeline.yml@refs/heads/main`, editable by the agent" |
| What goes public | Predicates are readable through GitHub's attestation API for a public repo. The signing certificate in Rekor, Sigstore's public transparency log, keeps repo, workflow, ref, commit and run URL forever | Commit trailers, file paths, digests and check names are acceptable; no file contents |
| Scenario count | The purpose line says "19 deliberately bad changes" | Update it with Phase 2 |
| Revoked skill for B21 | Which earlier `SKILL.md` digest to revoke | One of its 2 earlier versions, from commits `ebe586c` and `124eca2` |
| Candidate branch names | `candidate/**`; or reuse each cloud session's `claude/**` branch | `candidate/**`: one pattern for agents and humans |
| Ruleset bypass | No bypass actors, as today; or let the owner bypass | None. Approver commits take the same path, which is the talk's "the human's fix runs the same pipeline". AWS break-glass is unaffected |

## Options considered

| Option | Verdict |
|---|---|
| A. Adopt apmx and the APM agent package manager it bundles, as-is | Rejected. apmx runs only Copilot CLI or OpenCode 1.2.24, and runs the agent itself outside a Git checkout. Its `apmx audit` check runs on pull requests, and its docs recommend `pull_request_target`, which zizmor's offline `dangerous-triggers` audit flags. Its documented `audit.yml` example also pins actions by tag. Its release is an "EXPERIMENTAL prerelease" |
| B. Native emission with `actions/attest`, `gh` and `scripts/receipt.ts` | **Chosen**. Pinned actions only, no new dependencies, fits the check and signature model |
| C. B plus an agent-contracts `receipt.intoto.jsonl` export and a VSA | Deferred until the format leaves draft 0.1 |
| D. Extend only the existing custom predicate | Rejected. No per-check evidence and no bill of materials |

## Agent Contracts & Receipts

| Fact | Source |
|---|---|
| Draft 0.1: "Nothing here is stable". No format version field and no conformance classes | `spec/README.md` |
| Two commits, both on 2026-11-04 UTC; no tags or releases | `git log` and `git ls-remote`, 2026-11-04 |
| Spec text CC-BY-4.0; schemas and examples Apache-2.0 | repository page |
| Its bill of materials is CycloneDX 1.5 with packages and no hashes; skill digests sit in the provenance | `spec/receipt.md` |
| Its own open questions include model attestation, harness portability and where skills belong in CycloneDX | `spec/open-questions.md` |

The format is a useful reference, not a dependency. Its gate wording, "at merge", "target branch" and "change under review", does not require a pull request; only apmx's gate does. Decision 13's flow, a fast-forward push held by required status checks, fits that wording. Its freshness rule (item 8) works too, because `main`'s tip is still the base when the gate runs. Its item 1, running the gate's definition from the target branch and never from the change, does not fit: a push-triggered workflow runs from the pushed commit. Phase 3 is the answer here as well. This repo is a case its open questions do not yet cover: Claude Code as the agent, and a merge with no pull request. The agent-contracts repository's discussions are the place to raise that.

## Consequences

| Consequence | Mitigation |
|---|---|
| Every change waits for a pipeline run before it lands. On run 41900932055 the checks job took 63 s, then build and attest about 15 s each | Accept: the trade is a `main` that never holds an unchecked commit |
| Every change runs the pipeline twice: on `candidate/` and again on `main` | Accept: only the `main` run deploys, and the second checks run is about a minute |
| A factory file changed without a new approved fingerprint fails at the receipt job, after checks and build | `node scripts/receipt.ts fingerprint` prints the value for the approver's commit |
| The zip is reproducible, so many commits share one digest and its attestation list grows with every push | Paginate; verify with `--source-digest` pinned to the commit |
| The test result's subject is the zip, though in-toto expects the tested source. `actions/attest` cannot sign a `gitCommit` digest | Record the deviation; put the commit and tree SHA in the predicate |
| Agent-written tests run before mutation and could rewrite a config | R42 compares each config with its committed blob after the run |
| `scripts/receipt.ts` gets unit tests but no mutation testing; Stryker covers `src/` only | Accept, or widen the mutate set as a separate signed change |
| `sast` and `sca` fetch rules and advisories at run time, so their PASS cannot be reproduced from the receipt | State it in the predicate schema |

## Related finding: the approver key

The signature that approves every policy change can be produced without a human. `.claude/settings.json` denies `git commit *-S*`, but `git -c x=y commit -S` does not match that pattern. `approvers.txt` holds a plain `ssh-ed25519` key, which signs without a physical touch. On the approver's laptop with ssh-agent loaded, a Claude Code session could make an approver-signed commit. This is inference from the rules and the key type; it has not been tried. A hardware-backed `ed25519-sk` key with `verify-required` closes it, and is a precondition for decision 8 meaning what it says. `docs/decisions/0003-approver-key.md` proposes that fix.

## Not yet verified

| Item | How to settle it |
|---|---|
| Whether the store refuses SLSA provenance with a custom `buildType`, as apmx's spec says. Custom non-SLSA types are stored: this repo's `provenance/v1` attestation on `function.zip` is listed | Not needed: this plan signs no custom `buildType` |
| `gh attestation verify --bundle` ignores bundles of other predicate types in one JSONL file | Phase 1 test |
| Which Node.js version the `ubuntu-24.04` image provides. It does strip TypeScript types: run 41544406198's deploy job ran `node scripts/checks.ts attestation` without `setup-node` and printed `CHECK attestation FAILED: dist/function.zip` | Add `actions/setup-node`, already pinned in the checks and build jobs, to every job that runs `.ts`, so the version is pinned |
| AWS accepts a `job_workflow_ref` pinned at a commit SHA for Phase 3 | Phase 3 spike against the sandbox account |
| GitHub cancels a pending run in the same concurrency group when a newer one queues | Decision 10 avoids depending on it |
| The exact error a refused push to `main` prints, and whether the ruleset's required checks also hold the repository admin's own pushes when there are no bypass actors | M05: push an unchecked commit as the owner |
| The GitHub Actions app ID to name as the expected source | M03 reads it from an existing `checks` check run instead of hard-coding it |

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
