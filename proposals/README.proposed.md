# who-gets-the-keys

[![bad changes stopped](https://img.shields.io/github/actions/workflow/status/PaulDuvall/who-gets-the-keys/scenarios.yml?branch=main&label=bad%20changes%20stopped)](https://github.com/PaulDuvall/who-gets-the-keys/actions/workflows/scenarios.yml)
[![licence: MIT](https://img.shields.io/github/license/PaulDuvall/who-gets-the-keys)](LICENSE)

Companion repo to the talk “Who Gets the Keys?”: an AI agent writes the code, the pipeline holds the keys, and 19 deliberately bad changes are stopped before they ship.

| | |
|---|---|
| Rule demonstrated | Bad changes never reach production, because the pipeline prevents them |
| Good scenario | `main`, always green |
| Bad scenarios | 19 scenarios (B1 to B18, with B8 split into B8a and B8b), each failing at one named check with one expected line. 17 are patches against `main`; B9 replays an issue fixture and B11 is an AWS call |
| Source of record | Talk deck "Who Gets the Keys? Trust and Authority in Software Factories" (AI Native DevCon 2026), pinned at `specs/source-of-record/slides.txt` |
| Status | All 15 checks and 16 local scenarios pass on `main`. The repo is public, and the attest job has signed builds since 2026-11-02. No deploy has reached AWS yet: the first waits for the `sandbox` reviewer. The sandbox-account scenarios (B11, B14) have not been recorded |

Coding agents now change code faster than anyone can read the diffs. The talk argues that human review after the code exists was never the control, so the deployment pipeline has to hold the keys. This repo runs that argument end to end. Claude Code wrote a small export service. A pipeline of 15 checks guards it, and 19 deliberately bad changes show each control holding, from a test that asserts nothing to a poisoned GitHub issue. It is for engineering, platform and security leads deciding how far to trust agent-written code, and for anyone who saw the talk and wants to see the practices run.

## Quick start

```bash
git clone https://github.com/PaulDuvall/who-gets-the-keys.git
cd who-gets-the-keys
npm ci --ignore-scripts
npm run checks
npm run scenarios
```

| Command | Result |
|---|---|
| `npm run checks` | Runs every check fail-fast; exits 0 on `main` |
| `npm run check:<name>` | Runs one check |
| `npm run scenarios` | Applies each local bad patch in a temporary worktree and asserts its check and line |
| `npm run scenario -- B12` | Runs one scenario |
| `npm run video` | Builds the narrated walkthrough into `build/video/` |
| `npm run video -- --page-only` | Builds the walkthrough page alone, no browser |
| `npm run practices` | Regenerates `docs/practices.md` from `practices.yaml` |

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 24.x (`engines`) | everything |
| gitleaks | 8.30.1 | `check:secrets` |
| zizmor | 1.31.1 | `check:workflows` |
| Terraform, tflint | 1.16.6, 0.64.0 | `check:iac` |
| Semgrep | 1.181.0 | `check:sast` |
| OSV-Scanner | 2.7.0 | `check:sca` |
| ssh-keygen | OpenSSH 8.2 or later; to sign approver commits, 8.4 or later with security-key support (Homebrew's on macOS) | `check:signatures` |
| ffmpeg, ffprobe, Xvfb, uv | system | `npm run video` |

Versions, sources and dates: [docs/verification.md](docs/verification.md).

## Checks

A check is automated. A gate is a human approval: an approver-signed commit, or a required reviewer's approval of a deployment to the `sandbox` or `probe` environment.

`npm run checks` runs them in this order and stops at the first failure. Every failure prints one line: `CHECK <name> FAILED: <identifier>`.

| # | Check | Tool | Fails when |
|---|---|---|---|
| 1 | secrets | gitleaks | A secret is in the working tree |
| 2 | allowlist | `package.json` scan | A dependency name is not in `allowed-deps.txt` |
| 3 | workflows | zizmor + script | Any zizmor finding; a cache in `pipeline.yml` (`deploy-cache`); or the B9 replay job's permissions or egress differ from the triage job's (`replay-parity`) |
| 4 | install | `npm ci --ignore-scripts` | The lockfile does not install |
| 5 | lint | ESLint, typescript-eslint, `@vitest/eslint-plugin` | Any error, including a test with no assertion |
| 6 | typecheck | `tsc --noEmit` | Any type error under strict settings |
| 7 | iac | `terraform fmt`, `validate`, tflint | `infra/sandbox` or `infra/org` fails a check |
| 8 | sast | Semgrep `p/default` | Any finding |
| 9 | sca | OSV-Scanner | A known vulnerability in any npm or Python lockfile, unless `specs/sca-exceptions.toml` lists it and its `ignoreUntil` has not passed |
| 10 | trace | git + script | No `Spec:` trailer, a requirement with no test, or an export with no `@requirement` |
| 11 | signatures | `git verify-commit`, then the signature's flags | An unsigned change to `specs/`, `approvers.txt` or a protected path. An approver signature without a touch: touch only for now, per the owner decision of 2026-11-05. A key in `approvers.txt` that is not a security key |
| 12 | slides | script | `practices.yaml` disagrees with the pinned slide snapshot |
| 13 | ratchet | script | Stryker `thresholds.break` is below the highest value it has had in any commit |
| 14 | test | Vitest | Any test fails |
| 15 | mutation | Stryker | Mutation score below `thresholds.break` (95) |
| deploy | attestation | `gh attestation verify` | The artifact has no valid attestation |
| deploy | irreversible | `terraform show -json plan.out` | A stateful resource would be deleted without an approver-signed commit |

## Scenarios

| ID | Bad thing attempted | Stopped by | Slide |
|---|---|---|---|
| B1 | Test with no assertion | lint | 5, 12 |
| B2 | Weak assertion | mutation | 5, 7 |
| B3 | Code change with no spec ID | trace | 3, 13 |
| B4 | Agent rewrites acceptance criteria to fit its code | signatures | 3, 11 |
| B5 | Hard-coded secret | secrets | 4 |
| B6 | Invented package name | allowlist | 6, 12 |
| B7 | Guardrail loosened | ratchet | 8 |
| B8a | Cache in a deploy job | workflows | 9, 10 |
| B8b | Action pinned by tag | workflows | 10 |
| B9 | Poisoned issue #4821 | boundary | 6, 9, 12 |
| B10 | Unattested artifact reaches deploy | attestation | 7, 13 |
| B11 | Non-deploy principal writes the sandbox | boundary (SCP) | 10 |
| B12 | Command injection in your code | sast | 4 |
| B13 | Command injection in imported code | sca | 4 |
| B14 | Irreversible change without approval | irreversible | 8, 10 |
| B15 | Requirement with no test | trace | 7, 13 |
| B16 | Capability with no requirement | trace | 7, 13, Q3 |
| B17 | Tampered source of record | signatures | 6 |
| B18 | Agent loosens the pipeline without a signature | signatures | 8, Q3 |

Expected lines and patches: `scenarios/scenarios.yaml`. B9's AWS checks, B11 and B14 need the sandbox account and run on demand.

## Who holds which keys

| Principal | Can | Cannot |
|---|---|---|
| Agent (Claude Code) | Write code, tests and docs; propose spec, pipeline and dependency changes in `proposals/` | Sign commits, write `specs/` or any path in `specs/protected-paths.txt`, deploy, hold cloud credentials, loosen guardrails |
| Human approver | Sign spec changes and irreversible changes, with a security key and a touch each time, touch only for now per the owner decision of 2026-11-05; use break-glass | Deploy outside the pipeline without raising an alarm |
| `pipeline.yml` deploy role | Plan and apply `infra/sandbox` from environment `sandbox` | Be assumed from any other workflow, ref or environment |
| Triage role | Invoke Bedrock models; the triage agent returns one label from a fixed schema | Write to the repo or post text; run a shell; reach the network beyond an allowlist |
| Scenario probe role | Read state (`ReadOnlyAccess`) | Write: its one Lambda write grant exists so B11 can show the SCP deny it |
| Break-glass role | Write, alarmed | Be assumed by any workflow |

## Tool choices compared with the deck

The deck's speaker notes name example tools for each practice. Where this repo uses something else, this table says what and why.

| Practice | The deck names | This repo uses | Why |
|---|---|---|---|
| SAST, SCA, secrets | Semgrep or CodeQL; OSV-Scanner, Trivy or Snyk; gitleaks or TruffleHog | Semgrep, OSV-Scanner, gitleaks | The first tool the deck names for each |
| Mutation and property tests | Stryker or PIT; fast-check or Hypothesis | Stryker, fast-check | TypeScript repo |
| Runner egress control | StepSecurity Harden-Runner | Anthropic `srt` and Claude Code sandbox settings, both from `.github/egress/allowlist.json` | Harden-Runner block mode needs a paid plan for private repos (D04) |
| Codified policy checks | Open Policy Agent with Conftest, or Cedar | `scripts/checks.ts`, one function per check | One language for repo code; each check prints one failure line |
| Specs and acceptance criteria | Tessl, GitHub Spec Kit or Kiro; Cucumber | EARS-style tables in `specs/`; Vitest tests titled by requirement ID | The trace check verifies both directions without another toolchain |
| Spec and pipeline approval | CODEOWNERS, rulesets, GitHub Environments required reviewers | Approver-signed commits, checked by the signatures check for `specs/`, `approvers.txt` and every path in `specs/protected-paths.txt` | Trunk-based with no pull requests, so approval is a signature the pipeline verifies |
| Attestation verification | Kyverno or Sigstore policy-controller; cosign | GitHub artifact attestations, verified by `gh attestation verify` before any AWS call | The deploy target is a Lambda, not Kubernetes; deploy fails closed without a valid attestation (B10) |
| Waivers with an expiry | Snyk ignore, Trivy `expired_at`, OPA exceptions | OSV-Scanner `ignoreUntil` entries in `specs/sca-exceptions.toml`, owner-signed | OSV-Scanner is the SCA tool |
| Dependency intake | CodeArtifact, Artifactory or Socket; pip `--require-hashes`, `npm ci` | `allowed-deps.txt`, lockfile hashes, `npm ci`, pip `--require-hashes` | No private mirror in a demo repo |
| Break-glass | TEAM for IAM Identity Center; CloudTrail plus an EventBridge alarm | A separate IAM role with MFA and an EventBridge alarm | One sandbox account, no Identity Center |
| Not shown | DAST (ZAP, StackHawk), CloudWatch Logs data protection, OpenTelemetry redaction, IAM Access Analyzer, Security Hub, GuardDuty, CodeDeploy or Argo rollback | none | The repo shows the pipeline, not a running production service; see `docs/slide-reconciliation.md` |

## Repository map

| Path | Holds |
|---|---|
| `specs/` | Approved requirements (SPEC-001, SPEC-002, SPEC-014), SCA exceptions (`sca-exceptions.toml`) and the slide snapshot. Approver-signed commits only |
| `proposals/` | Agent-proposed spec changes, awaiting a signed move into `specs/` |
| `approvers.txt` | SSH allowed-signers file for approvers |
| `allowed-deps.txt` | Package names the allowlist check accepts |
| `practices.yaml` | Slide practice → check, scenario and files |
| `traceability.md` | Requirement → test file → check → scenario |
| `src/`, `test/` | Export service and its acceptance, property and unit tests |
| `scripts/checks.ts` | Check dispatcher |
| `scripts/bootstrap/` | Scripts the owner runs: GitHub settings, AWS bootstrap, slide refresh |
| `scenarios/` | Scenario definitions, patches and harness |
| `.github/workflows/` | `pipeline.yml`, `issue-triage.yml`, `scenarios.yml`, `video.yml` |
| `infra/sandbox/`, `infra/org/` | Terraform for the workload and roles; the SCP |
| `video/` | Walkthrough page template, orchestrator, recorder and narration pins |
| `.claude/` | Settings (deny rules, env, hooks), hook script, subagents, the video skill |
| `CLAUDE.md` | Conventions and authority boundaries for Claude Code sessions |

## Docs

| Doc | Contents |
|---|---|
| [docs/verification.md](docs/verification.md) | Every version and syntax choice, with source URL and date |
| [docs/deviations.md](docs/deviations.md) | Where the build departs from its prompt, the slides or the reference, and why |
| [docs/slide-reconciliation.md](docs/slide-reconciliation.md) | Each practice the audience slides state, and what demonstrates it |
| [docs/practices.md](docs/practices.md) | Practice table generated from `practices.yaml` by `npm run practices` |
| [docs/lockdown-check.md](docs/lockdown-check.md) | Manual check that `.claude/settings.json` denies and hooks work in a local session |
| [docs/decisions/0001-walkthrough-video.md](docs/decisions/0001-walkthrough-video.md) | Decisions behind the walkthrough video |
| [docs/decisions/0002-agent-receipt.md](docs/decisions/0002-agent-receipt.md) | Proposed: required checks before `main`, with no pull requests needed, and a signed receipt for every deploy (SLSA, in-toto test results, CycloneDX, Sigstore) |
| [docs/decisions/0003-approver-key.md](docs/decisions/0003-approver-key.md) | Proposed: approver signatures need a security key and a touch, touch only for now per the owner decision of 2026-11-05 |
| [docs/decisions/0004-factory-model.md](docs/decisions/0004-factory-model.md) | Proposed: the spec-to-receipt software factory. Signed spec in, signed receipt out. An approver signs the spec and the factory; checks of record and a signed receipt, not a reviewer, decide each change |

## Licence

MIT. See [LICENSE](LICENSE).
