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

A run attempt fixes its `vars` context when it starts, and re-running a job starts a new attempt that reads the new values (`docs/verification.md`, "vars per run attempt", run 42325449980). Inference: secrets behave the same. So the secrets must exist before the landing's own `main` run starts, or its deploy fails at `configure-aws-credentials` with an empty `role-to-assume`.

1. Before `land.sh proposals/role-arn-secrets`: copy each variable into a secret of the same name with `gh` only, no AWS (commands in the hand-off). The variables stay, so the workflows on `main` keep working either way.
2. Land the batch and approve its deploy. Its log should show `role-to-assume: ***`.
3. Run `scripts/bootstrap/github.sh --vars`, now from `main`, which sets the secrets again from Terraform's outputs and deletes the four variables. It needs the AWS profile and `TRIAGE_MODEL`, as when `aws-setup.sh` runs it.
4. The next deploy's log should again show `role-to-assume: ***`, which shows nothing still reads the deleted variables.

## Checked here

| Check | Result |
|---|---|
| zizmor 1.31.1 `--offline` over the four staged workflows with the rest of `.github/workflows/` | See the preflight in `docs/notes/autonomous-run-2026-11-08.md` |
| Replay parity: the triage job's and the B9 replay job's `permissions` and `env` blocks | Unchanged by the batch: neither block names a role ARN |

## Not verified

- That GitHub fixes the `secrets` context per run attempt as it does `vars`. The order above does not depend on it.
- That `gh variable list --json name` lists repository variables only, not environment ones, on the owner's `gh`. Checked only against `gh` 2.89.0's help text.
