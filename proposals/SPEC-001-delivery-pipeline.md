# SPEC-001: Delivery pipeline

<!-- PAUL: one-line description of the intent behind this spec -->

Status: proposal. Values marked **(proposed)** need owner approval at the Phase 1 checkpoint.

| Term | Meaning |
|---|---|
| gate | an npm script `gate:<name>` |
| failure line | exactly one line `GATE <name> FAILED: <identifier>` on standard output |
| scenario | a patch under `scenarios/` applied to `main` in a temporary worktree |
| approver | a key listed in `approvers.txt` in SSH allowed-signers format |

## Gates

| ID | Requirement |
|---|---|
| SPEC-001-R1 | WHEN `npm run gates` runs, THE pipeline SHALL run the gates in the order secrets, allowlist, workflows, install, lint, typecheck, iac, sast, sca, trace, signatures, slides, ratchet, test, mutation, SHALL stop at the first gate that fails, and SHALL exit nonzero. IF a gate fails, THEN it SHALL print exactly one failure line whose identifier is the same on every run against the same tree. |
| SPEC-001-R2 | WHEN the secrets gate runs, THE pipeline SHALL scan the working tree with gitleaks, excluding `scenarios/*.patch` by path. IF gitleaks reports a finding, THEN the identifier SHALL be its rule ID. |
| SPEC-001-R3 | WHEN the allowlist gate runs, before any install, THE pipeline SHALL check every dependency name in every `package.json` against `allowed-deps.txt`. IF a name is absent, THEN the identifier SHALL be that name. |
| SPEC-001-R4 | WHEN the workflows gate runs, THE pipeline SHALL run zizmor offline over `.github/workflows/` and SHALL compare the B9 replay job's `permissions` block and egress allowlist file with the triage job's. IF zizmor reports a finding, THEN the identifier SHALL be its audit ID. IF `pipeline.yml` does not set `cache-mode: none` at workflow level, or any of its jobs uses a cache step or enables a cache, THEN the identifier SHALL be `deploy-cache`. IF the replay job differs from the triage job, THEN the identifier SHALL be `replay-parity`. |
| SPEC-001-R5 | WHEN the install gate runs, THE pipeline SHALL run `npm ci --ignore-scripts` against the committed lockfile. IF it fails, THEN the identifier SHALL be `package-lock.json`. |
| SPEC-001-R6 | WHEN the lint gate runs, THE pipeline SHALL run ESLint with typescript-eslint and `vitest/expect-expect` as an error. IF ESLint reports an error, THEN the identifier SHALL be its rule ID. |
| SPEC-001-R7 | WHEN the typecheck gate runs, THE pipeline SHALL run `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. IF it reports an error, THEN the identifier SHALL be the first file path it names. |
| SPEC-001-R8 | WHEN the iac gate runs, THE pipeline SHALL run `terraform fmt -check`, `terraform validate` and tflint in `infra/sandbox` and `infra/org`. IF a check fails, THEN the identifier SHALL be the directory path. |
| SPEC-001-R9 | WHEN the sast gate runs, THE pipeline SHALL run `semgrep scan --config p/default` with metrics off and findings exiting nonzero. IF Semgrep reports a finding, THEN the identifier SHALL be its rule ID. |
| SPEC-001-R10 | WHEN the sca gate runs, THE pipeline SHALL scan every committed lockfile with OSV-Scanner, ignoring only advisories listed in `specs/sca-exceptions.toml` whose `ignoreUntil` has not passed. IF it reports a vulnerability, THEN the identifier SHALL be its advisory ID. |
| SPEC-001-R11 | WHEN the trace gate runs, THE pipeline SHALL check that (a) every commit touching `src/` or `test/` has a `Spec:` trailer naming an existing requirement ID, (b) every requirement ID in `specs/` is named by at least one test, and (c) every export from `src/` has a `@requirement` tag naming an existing requirement ID. IF (a) fails, THEN the identifier SHALL be `missing Spec trailer`. IF (b) fails, THEN it SHALL be `<requirement ID> has no test`. IF (c) fails, THEN it SHALL be `export <name> has no requirement`. |
| SPEC-001-R12 | WHEN the signatures gate runs, THE pipeline SHALL check every commit reachable from HEAD that touches `specs/` or `approvers.txt` is signed by a key in `approvers.txt` as of its parent commit, or, for the commit that first adds `approvers.txt`, as of that commit. IF a commit touching `specs/source-of-record/slides.txt` fails, THEN the identifier SHALL be `unsigned change to specs/source-of-record/slides.txt`; otherwise `unsigned change to specs/` or `unsigned change to approvers.txt`. |
| SPEC-001-R13 | WHEN the slides gate runs, THE pipeline SHALL check that the SHA-256 in `practices.yaml` equals the snapshot body's, every practice cites slides that exist in the snapshot, every scenario maps to at least one practice, and every listed file exists. IF a check fails, THEN the identifier SHALL be `snapshot hash`, `<practice ID> slide <n>`, `<scenario ID> has no practice` or the missing path. |
| SPEC-001-R14 | WHEN the ratchet gate runs, THE pipeline SHALL compare Stryker `thresholds.break` with its value in the parent commit. IF it is lower, THEN the identifier SHALL be `break threshold lowered`. |
| SPEC-001-R15 | WHEN the test gate runs, THE pipeline SHALL run every Vitest acceptance, property and unit test, including the video kit's tests that need no display or network. IF a test fails, THEN the identifier SHALL be the first failing test file path. |
| SPEC-001-R16 | WHEN the mutation gate runs, THE pipeline SHALL run Stryker incrementally with the Vitest runner and `thresholds.break` of **90 (proposed)**. IF the mutation score is below it, THEN the identifier SHALL be `below break threshold`. |
| SPEC-001-R17 | WHEN the deploy job starts, THE pipeline SHALL run `gh attestation verify` on the artifact before any AWS call. IF verification fails, THEN the deploy job SHALL stop and print `GATE attestation FAILED: <artifact path>`. |
| SPEC-001-R18 | WHEN the deploy job has written `plan.out`, THE pipeline SHALL fail if any change to an `aws_dynamodb_table`, `aws_s3_bucket`, `aws_db_instance` or `aws_kms_key` includes `delete`, unless the commit is signed by an approver, with identifier the resource address. THE deploy job SHALL apply that `plan.out` and no other plan. |

## Scenarios

Each scenario requirement reads: WHEN the scenario's patch is applied to `main` and the gates run, THE first failing gate SHALL be the named gate and its output SHALL contain the expected line.

| ID | Scenario | Gate | Expected line |
|---|---|---|---|
| SPEC-001-R19 | B1 test with no assertion | lint | `GATE lint FAILED: vitest/expect-expect` |
| SPEC-001-R20 | B2 weak assertion | mutation | `GATE mutation FAILED: below break threshold` |
| SPEC-001-R21 | B3 code change with no `Spec:` trailer | trace | `GATE trace FAILED: missing Spec trailer` |
| SPEC-001-R22 | B4 unsigned SPEC-014 criterion and code change | signatures | `GATE signatures FAILED: unsigned change to specs/` |
| SPEC-001-R23 | B5 synthetic secret in `src/` | secrets | `GATE secrets FAILED: <gitleaks rule ID>` |
| SPEC-001-R24 | B6 unregistered package name | allowlist | `GATE allowlist FAILED: <name>` |
| SPEC-001-R25 | B7 lowered `thresholds.break` | ratchet | `GATE ratchet FAILED: break threshold lowered` |
| SPEC-001-R26 | B8a cache step in the deploy job | workflows | `GATE workflows FAILED: deploy-cache` |
| SPEC-001-R27 | B8b action pinned by tag | workflows | `GATE workflows FAILED: <zizmor audit ID>` |
| SPEC-001-R28 | B9 poisoned issue #4821: WHEN the replay runs under the triage job's token and egress, each injected action (push to `main`, create a release, dispatch a workflow, read a secret, fetch the issue's URL, and on demand assume the deploy role with the triage OIDC token) SHALL be denied or blocked | boundary | `BOUNDARY HELD: <action>` per action |
| SPEC-001-R29 | B10 unattested artifact at deploy | attestation | `GATE attestation FAILED` |
| SPEC-001-R30 | B11 probe role writes a sandbox Lambda; denial SHALL come from the SCP | boundary | `BOUNDARY HELD: with an explicit deny in a service control policy` |
| SPEC-001-R31 | B12 `child_process.exec` with a request-supplied filename, with test and trailer | sast | `GATE sast FAILED: <Semgrep rule ID>` |
| SPEC-001-R32 | B13 `lodash@4.17.20` added | sca | `GATE sca FAILED: GHSA-35jh-r3h4-6jhm` |
| SPEC-001-R33 | B14 rename of `export_jobs`, forcing replacement | irreversible | `GATE irreversible FAILED: aws_dynamodb_table.export_jobs` |
| SPEC-001-R34 | B15 SPEC-014 requirement with no test | trace | `GATE trace FAILED: <requirement ID> has no test` |
| SPEC-001-R35 | B16 export with no `@requirement` tag | trace | `GATE trace FAILED: export <name> has no requirement` |
| SPEC-001-R36 | B17 unsigned removal of one practice from the slide snapshot | signatures | `GATE signatures FAILED: unsigned change to specs/source-of-record/slides.txt` |
| SPEC-001-R37 | IF a scenario's patch does not apply cleanly to `main`, THEN THE scenario harness SHALL fail that scenario. | harness | `SCENARIO <ID> FAILED: patch does not apply` |

A `<...>` identifier is the value recorded for that scenario in `scenarios/scenarios.yaml`, taken from a verified failing run.
