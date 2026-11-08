# Role ARNs as secrets (backlog m7a, step 2)

Status: staged in `proposals/role-arn-secrets/`, not landed. Drafted 2026-11-08 on top of `main` at `5351b63`.

## Why

A role ARN holds the AWS account ID. Four workflows pass one to `aws-actions/configure-aws-credentials` as `role-to-assume: ${{ vars.<NAME>_ROLE_ARN }}`. GitHub prints a step's inputs before the step runs and never masks a repository variable, so every run that assumes a role publishes the ID in a public log. `main` run 42501305077 shows it (backlog `who-gets-the-keys-m7a`). GitHub masks a secret in every log line.

## What the batch changes

| File | Change |
|---|---|
| `.github/workflows/pipeline.yml` | Deploy: `secrets.DEPLOY_ROLE_ARN` |
| `.github/workflows/issue-triage.yml` | Triage: `secrets.TRIAGE_ROLE_ARN` |
| `.github/workflows/producer.yml` | Agent job: `secrets.PRODUCER_ROLE_ARN`, its only secret |
| `.github/workflows/scenarios.yml` | On-demand probes: `secrets.PROBE_ROLE_ARN`, and `DEPLOY_ROLE_ARN` in the probe step's `env` from `secrets.DEPLOY_ROLE_ARN` |
| `scripts/bootstrap/github.sh` | `--vars` sets the four ARNs with `gh secret set`, keeps `TRIAGE_MODEL` and `PRODUCER_MODEL` as variables, and then deletes each variable of a role ARN's name that `gh variable list` shows. One confirm, as before, so `aws-setup.sh`'s two answers still fit |
| `scripts/bootstrap/aws-setup.sh` | Its summary and its last line name the secrets and print `gh secret list` beside `gh variable list` |
| `specs/SPEC-001-delivery-pipeline.md` | R85: exactly one secret, `secrets.PRODUCER_ROLE_ARN`, once, as the agent job's `role-to-assume`, in no `env` or `run`. R86: `github.sh --vars` sets the four secrets and `PRODUCER_MODEL`, then deletes the four variables; every workflow reads a role ARN only from `secrets` |
| `test/producer.test.ts` | A new R85 test: the only `secrets.` reference in `producer.yml` is the role ARN, in the `configure-aws-credentials` step's `with`, and the `env -i` step names neither. The R86 test reads `secrets.PRODUCER_ROLE_ARN` and `gh secret set`. A new R86 test reads every workflow: no `vars.*ROLE_ARN`, and exactly the five role ARN uses, each from `secrets` |
| `scenarios/B08b-action-pinned-by-tag.patch` | Regenerated against the staged `pipeline.yml`: its context held the old `role-to-assume: ${{ vars.DEPLOY_ROLE_ARN }}` line, so it stopped applying (found by the preflight's `git apply --check`, lesson L20). Same change, same expected line, so `Spec: SPEC-001-R27` |
| `test/aws-setup.test.ts` | The stub `gh` lists two role ARN variables and `TRIAGE_MODEL`. The end-to-end run must set the four secrets and the two model variables, then delete exactly the two listed ARN variables, never `TRIAGE_MODEL`. The no-write checks also refuse `secret set` and `variable delete` before the confirm |

## Why the secrets are repository secrets, not environment secrets

The probe job, in environment `probe`, reads both `PROBE_ROLE_ARN` and `DEPLOY_ROLE_ARN`: the second is the on-demand B9 probe that must be refused the deploy role. An environment secret on `sandbox` would not reach it. A repository secret is available to the same workflows a repository variable is, so nothing is exposed that is not exposed today. The ARN grants nothing alone: each role's trust pins the workflow, ref and environment.

## Order for the owner

Inference, from one observation: a run attempt fixes its `vars` context when it starts, and re-running a job starts a new attempt that reads the new values (`docs/verification.md`, "vars per run attempt", run 42325449980, whose row also labels it an inference). Further inference: secrets behave the same. So the secrets must exist before the landing's own `main` run starts, or its deploy fails at `configure-aws-credentials` with an empty `role-to-assume`.

1. Before `land.sh proposals/role-arn-secrets`: copy each variable into a secret of the same name with `gh` only, no AWS (commands in the hand-off). The variables stay, so the workflows on `main` keep working either way.
2. Land the batch and approve its deploy. Its log should show `role-to-assume: ***`.
3. Run `scripts/bootstrap/github.sh --vars`, now from `main`, which sets the secrets again from Terraform's outputs and deletes the four variables. It needs the AWS profile and `TRIAGE_MODEL`, as when `aws-setup.sh` runs it.
4. The next deploy's log should again show `role-to-assume: ***`, which shows nothing still reads the deleted variables.

## Checked here

| Check | Result |
|---|---|
| The workflows check (zizmor 1.31.1 `--offline`, default persona, plus `deploy-cache` and replay parity) on the moved tree | Pass |
| zizmor with `--persona=auditor` (the independent review) | One finding, `secrets-outside-env` at `issue-triage.yml` line 49: the triage job reads a secret without an environment. The check runs the default persona, which hides it. Recorded, not fixed: the secret is a role ARN, not a credential, and an environment for triage is a separate decision |
| Replay parity: the triage job's and the B9 replay job's `permissions` and `env` blocks | Unchanged by the batch: neither block names a role ARN. The B9 replay job now differs from triage in one way parity does not compare: triage reads one secret, the role ARN |
| tsc, ESLint, every test, trace, slides, secrets, allowlist, `git apply --check` on all 18 patches, B8b in the harness | Pass, with only the 3 `ssh-keygen` failures this container always has. Log: `docs/notes/autonomous-run-2026-11-08.md` |

## Not verified

- That GitHub fixes the `secrets` context per run attempt as it does `vars`. The order above does not depend on it.
- That `gh variable list --json name` lists repository variables only, not environment ones, on the owner's `gh`. Checked only against `gh` 2.89.0's help text.

## Review, 2026-11-08

An independent review found nothing critical or high, two medium and six low. It confirmed with mutations that the tests fail if a workflow goes back to `vars`, if `TRIAGE_MODEL` is deleted, if the deletes move before the secret sets, or if every variable is deleted unconditionally.

| Severity | Finding | Done |
|---|---|---|
| Medium | `issue-triage.yml`'s header still said the triage job holds no secrets; zizmor's auditor persona reports `secrets-outside-env` there | The header now says it holds no credential secret, and names its one secret, the role ARN. The auditor finding is recorded above |
| Medium | The on-demand probe step pipes into `tee` with no `shell:`, so GitHub's default `bash -e` without `pipefail` keeps the job green when `on-demand.sh` fails, including when `DEPLOY_ROLE_ARN` is missing | `shell: bash` on that step, as the B9 replay step has. It predates the batch, but the batch rewires that step |
| Low | `github.sh` read the deploy, triage and probe outputs without `// empty`, so a missing one would be set as the string `null` | All five outputs use `// empty`, and a missing one sets and deletes nothing. R86's sentence says "any of those five outputs" in this copy and the two later batches' copies |
| Low | No test ran `github.sh --vars` with no ARN variable present, or with an output missing | A new `describe` naming SPEC-001-R86 runs `github.sh --vars` with the stub `gh` and a stub `terraform`: six tests |
| Low | The backlog criterion says "checked by a test ... and by the workflows check"; no workflows-check rule reads `vars.*_ROLE_ARN` | Read as: the test enforces it, and the workflows check must still pass. A rule in `scripts/checks.ts` would be a further signed change; not added |
| Low | The notes stated the per-attempt `vars` behaviour as fact, and pointed at a preflight not yet logged | Labelled an inference; the preflight is in the run log |
| Low | `aws-setup.sh`'s header and one prompt, and the R30 test title, still said "repository variables"; LAND.txt lacked `spec: SPEC-001-R30` | All say "secrets and variables"; `spec: SPEC-001-R30` added |
| Low | The owner's copy command should use `--body "$(gh variable get ...)"`, which drops a trailing newline, and step 3 should keep the current `TRIAGE_MODEL` | Both in the hand-off's commands |
