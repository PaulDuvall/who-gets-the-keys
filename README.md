# who-gets-the-keys

<!-- PAUL: one-line description of the repo -->

| | |
|---|---|
| Rule demonstrated | Bad changes never reach production, because the pipeline prevents them |
| Good scenario | `main`, always green |
| Bad scenarios | 17 patches against `main` (B1 to B17, with B8 split into B8a and B8b), each failing at one named gate with one expected line |
| Source of record | Talk deck "Who Gets the Keys?" (AI Native DevCon 2026), pinned at `specs/source-of-record/slides.txt` |
| Status | <!-- PAUL: one-line status, e.g. which phases are complete --> |

<!-- PAUL: short paragraph on why this repo exists and who it is for -->

## Quick start

```bash
git clone https://github.com/PaulDuvall/who-gets-the-keys.git
cd who-gets-the-keys
npm ci --ignore-scripts
npm run gates
npm run scenarios
```

| Command | Result |
|---|---|
| `npm run gates` | Runs every gate fail-fast; exits 0 on `main` |
| `npm run gate:<name>` | Runs one gate |
| `npm run scenarios` | Applies each local bad patch in a temporary worktree and asserts its gate and line |
| `npm run scenario -- B12` | Runs one scenario |
| `npm run video` | Builds the narrated walkthrough into `build/video/` |
| `npm run video -- --page-only` | Builds the walkthrough page alone, no browser |
| `npm run practices` | Regenerates `docs/practices.md` from `practices.yaml` |

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 24.x (`engines`) | everything |
| gitleaks | 8.30.1 | `gate:secrets` |
| zizmor | 1.31.1 | `gate:workflows` |
| Terraform, tflint | 1.16.6, 0.64.0 | `gate:iac` |
| Semgrep | 1.181.0 | `gate:sast` |
| OSV-Scanner | 2.7.0 | `gate:sca` |
| ssh-keygen | any OpenSSH | `gate:signatures` |
| ffmpeg, ffprobe, Xvfb, uv | system | `npm run video` |

Versions, sources and dates: [docs/verification.md](docs/verification.md).

## Gates

`npm run gates` runs them in this order and stops at the first failure. Every failure prints one line: `GATE <name> FAILED: <identifier>`.

| # | Gate | Tool | Fails when |
|---|---|---|---|
| 1 | secrets | gitleaks | A secret is in the working tree |
| 2 | allowlist | `package.json` scan | A dependency name is not in `allowed-deps.txt` |
| 3 | workflows | zizmor | Any workflow finding, or the B9 replay job differs from the triage job |
| 4 | install | `npm ci --ignore-scripts` | The lockfile does not install |
| 5 | lint | ESLint, typescript-eslint, `@vitest/eslint-plugin` | Any error, including a test with no assertion |
| 6 | typecheck | `tsc --noEmit` | Any type error under strict settings |
| 7 | iac | `terraform fmt`, `validate`, tflint | `infra/sandbox` or `infra/org` fails a check |
| 8 | sast | Semgrep `p/default` | Any finding |
| 9 | sca | OSV-Scanner | A known vulnerability in any lockfile |
| 10 | trace | git + script | No `Spec:` trailer, a requirement with no test, or an export with no `@requirement` |
| 11 | signatures | `git verify-commit` | A change to `specs/` or `approvers.txt` not signed by an approver |
| 12 | slides | script | `practices.yaml` disagrees with the pinned slide snapshot |
| 13 | ratchet | script | Stryker `thresholds.break` went down |
| 14 | test | Vitest | Any test fails |
| 15 | mutation | Stryker | Mutation score below `thresholds.break` (90) |
| deploy | attestation | `gh attestation verify` | The artifact has no valid attestation |
| deploy | irreversible | `terraform show -json plan.out` | A stateful resource would be deleted without an approver-signed commit |

## Scenarios

| ID | Bad thing attempted | Stopped by | Slide |
|---|---|---|---|
| B1 | Test with no assertion | lint | 5 |
| B2 | Weak assertion | mutation | 5 |
| B3 | Code change with no spec ID | trace | 3, 7 |
| B4 | Agent rewrites acceptance criteria to fit its code | signatures | 3 |
| B5 | Hard-coded secret | secrets | 4 |
| B6 | Invented package name | allowlist | 6 |
| B7 | Guardrail loosened | ratchet | 8 |
| B8a | Cache in a deploy job | workflows | 9, 10 |
| B8b | Action pinned by tag | workflows | 9, 10 |
| B9 | Poisoned issue #4821 | boundary | 6, 9, 12 |
| B10 | Unattested artifact reaches deploy | attestation | 7 |
| B11 | Non-deploy principal writes the sandbox | boundary (SCP) | 10 |
| B12 | Command injection in your code | sast | 4 |
| B13 | Command injection in imported code | sca | 4 |
| B14 | Irreversible change without approval | irreversible | 8, 10 |
| B15 | Requirement with no test | trace | 7 |
| B16 | Capability with no requirement | trace | 7 |
| B17 | Tampered source of record | signatures | 6 |

Expected lines and patches: `scenarios/scenarios.yaml`. B9's AWS checks, B11 and B14 need the sandbox account and run on demand.

## Who holds which keys

| Principal | Can | Cannot |
|---|---|---|
| Agent (Claude Code) | Write code, tests, docs, workflows; propose spec changes in `proposals/` | Sign commits, write `specs/`, deploy, hold cloud credentials, loosen guardrails |
| Human approver | Sign spec changes and irreversible changes; use break-glass | Deploy outside the pipeline without raising an alarm |
| `pipeline.yml` deploy role | Plan and apply `infra/sandbox` from environment `sandbox` | Be assumed from any other workflow, ref or environment |
| Triage role | Invoke Bedrock models | Anything else; network limited to an allowlist |
| Scenario probe role | Read state | Write: the SCP denies it |
| Break-glass role | Write, alarmed | Be assumed by any workflow |

## Repository map

| Path | Holds |
|---|---|
| `specs/` | Approved requirements (SPEC-001, SPEC-002, SPEC-014) and the slide snapshot. Approver-signed commits only |
| `proposals/` | Agent-proposed spec changes, awaiting a signed move into `specs/` |
| `approvers.txt` | SSH allowed-signers file for approvers |
| `practices.yaml` | Slide practice → gate, scenario and files |
| `traceability.md` | Requirement → test file → gate → scenario |
| `src/`, `test/` | Export service and its acceptance, property and unit tests |
| `scripts/gates.ts` | Gate dispatcher |
| `scripts/bootstrap/` | Scripts the owner runs: GitHub settings, AWS bootstrap, slide refresh |
| `scenarios/` | Scenario definitions, patches and harness |
| `.github/workflows/` | `pipeline.yml`, `issue-triage.yml`, `scenarios.yml`, `video.yml` |
| `infra/sandbox/`, `infra/org/` | Terraform for the workload and roles; the SCP |
| `video/` | Walkthrough page template, orchestrator, recorder and narration pins |
| `.claude/` | Subagents, the video skill and hooks |
| `CLAUDE.md` | Conventions and authority boundaries for Claude Code sessions |

## Docs

| Doc | Contents |
|---|---|
| [docs/verification.md](docs/verification.md) | Every version and syntax choice, with source URL and date |
| [docs/deviations.md](docs/deviations.md) | Where the build departs from its prompt, the slides or the reference, and why |
| [docs/slide-reconciliation.md](docs/slide-reconciliation.md) | Each slide practice and what demonstrates it |
| [docs/slide-audit.md](docs/slide-audit.md) | Snapshot practices the `slide-auditor` agent found with no matching `practices.yaml` row |
| [docs/decisions/0001-walkthrough-video.md](docs/decisions/0001-walkthrough-video.md) | Decisions behind the walkthrough video |

## Licence

<!-- PAUL: licence choice -->
