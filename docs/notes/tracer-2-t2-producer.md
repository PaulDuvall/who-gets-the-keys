# Tracer 2, slice T2: the runner producer batch

Status: landed as `4812f27` on 2026-11-07; `aws-setup.sh` created the producer role and variables, and `main` run 42388493889 deployed. The first egress probe failed before the agent ran a tool; see "Probe run 1". Fixes are staged in `proposals/producer-fixes/`. Originally staged on `f6044ef`, the phase 1 landing. Plan: `docs/notes/tracer-2.md`. Drafted 2026-11-07; revised the same day after an independent review (two blockers and five smaller issues, listed under "Review fixes").

## What the batch changes

| Destination | Change |
|---|---|
| `.github/workflows/producer.yml` | New. Four jobs, below |
| `.github/workflows/pipeline.yml` | Main's copy plus `workflow_dispatch` with no inputs. The checks job stays unconditional; its first step fails a dispatched run on any ref but `refs/heads/candidate/**` (SPEC-001-R209) |
| `.github/egress/producer-allowlist.json` | New. The producer's sandbox allowlist, with no host |
| `scripts/ci/producer.ts` | New. Settings, prompt, patch scope and commit message, Node.js built-ins only, reusing `guardedBy` from `scripts/checks.ts` |
| `infra/sandbox/iam.tf`, `main.tf`, `variables.tf` | Role `who-gets-the-keys-producer-bedrock`, its trust, its one-profile policy, outputs `producer_role_arn` and `producer_inference_profile`, and variable `producer_inference_profile` (default `us.anthropic.claude-sonnet-5-5`) |
| `infra/org/main.tf` | The SCP's identity-write deny lists the producer role |
| `scripts/bootstrap/github.sh` | Environment `producer`, main only, never a reviewer. `--vars` also sets `PRODUCER_ROLE_ARN` and `PRODUCER_MODEL`, and sets nothing if those outputs are missing |
| `scripts/bootstrap/aws-setup.sh` | Summary text only |
| `specs/SPEC-001-delivery-pipeline.md` | Phase 1's copy plus a "Runner producer" section: R83, R85 to R89 (0004's drafts, thinned) and R207 to R209 (new) |
| `test/producer.test.ts` | New. 17 tests |
| `test/checks-before-main.test.ts` | Phase 1's copy plus R209 and the producer environment; R40's "unconditional jobs" becomes `build` only |
| `test/aws-setup.test.ts` | The stub's Terraform outputs and the expected variable writes |
| `traceability.md`, `CLAUDE.md` | New rows; the file map names `producer.yml` |

## How `producer.yml` runs

| Job | Holds | Does |
|---|---|---|
| install | `contents: read` | Checks the inputs in its first step. `npm ci --ignore-scripts`. Fetches `@anthropic-ai/claude-code-linux-x64@2.1.304` from the npm registry and checks a pinned SHA-256. Hands both over as one artifact, with the `node_modules` archive's SHA-256 as an output |
| agent | `contents: read`, `id-token: write`, environment `producer` | Checks both digests. Writes the settings and the prompt with `producer.ts` before any credential. Assumes the producer role. Starts Claude Code with `env -i` and an explicit list of variables, so no `GITHUB_`, `ACTIONS_` or token variable reaches it. After the agent, only `git`, `jq` and `openssl` run: the patch is `git diff --cached --binary --no-renames <github.sha>` |
| publish | `contents: write` | Checks out `github.sha` twice: `trusted` runs `producer.ts`, `work` takes the patch. Checks the digest and applies the patch to the index. Scope is an allowlist: only `src/`, `test/`, `docs/` and `traceability.md`, no dot-file segment, and no path listed at `github.sha` as protected. It commits only after `scope` prints `scope ok`, unsigned, and pushes `candidate/<task>` without force |
| dispatch | `actions: write` | Starts `pipeline.yml` on that branch |

Every job runs only for `refs/heads/main`, `github.actor_id == '1619259'` and `github.triggering_actor == github.actor`. With `egress_probe` true the agent gets one fixed prompt, publish and dispatch are skipped, and the job prints `BOUNDARY HELD: egress to example.com` only if the curl output holds the proxy's 403.

## Choices, and why

| Choice | Why | Alternative not taken |
|---|---|---|
| Claude Code from the npm platform package, SHA-256 pinned, no install script | The trusted `claude-code-action@db77d4d` base action installs the same version, 2.1.304, through `curl https://claude.ai/install.sh \| bash`, an unpinned script, plus `bun install`. It also passes its whole environment to Claude Code | Reuse the base action |
| `env -i` launch | Removes `ACTIONS_ID_TOKEN_REQUEST_*`, `ACTIONS_RUNTIME_TOKEN` and every `GITHUB_` variable from the agent's process, not only from its subprocesses. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` then removes the AWS credentials from its Bash commands | Overwrite them through `GITHUB_ENV` |
| Permission rules in the settings file, built by `producer.ts` | One unit-tested function. `--settings` with `allowUnsandboxedCommands: false` makes the sandbox admin-required, so the repository's settings cannot loosen it | `--allowedTools` on the command line, as 0004's R88 drafts |
| `--tools Bash,Read,Edit,Write,Glob,Grep`, `blockReadsOutsideWorkingDirectories`, `Read(//proc/**)` denied | Removes WebFetch, WebSearch and subagents outright, and keeps file tools and sandboxed commands out of the runner's home and process environments | Deny rules only |
| `strictAllowlist: true` and an empty producer allowlist | Refuses every host in every mode, from `--settings`. Sandboxed commands need no network; Claude Code's own Bedrock calls are not sandboxed | The shared `allowlist.json`, which allows `api.github.com` |
| `autoAllowBashIfSandboxed: false` | It defaults to `true`, which approves every sandboxed command, so dontAsk and the exact Bash rules would not limit commands | Leave the default |
| A guard step, not a job condition, on `pipeline.yml`'s checks job | A skipped job reports success, and does not block even when it is a required check | A job-level `if:`, as first staged |
| A dispatch job | A push made with `GITHUB_TOKEN` starts no workflow run, so the candidate's checks would never run | See owner decision 1 |
| Deploy role's `NoIdentityWrites` not extended | That policy is on the deploy role, which the SCP lets only break-glass change, so `aws-setup.sh` as the sandbox admin would fail at apply. The deploy role has no allow on roles anyway; the deny is a second layer | Extend it and apply `infra/sandbox` as break-glass |
| The model pinned in `variables.tf` | One signed source for the policy and the `PRODUCER_MODEL` variable. A drifted variable can only fail the call, never widen it | A repository variable alone |
| The deploy job's `if:` left as is | Changing it would stop the B10 patch applying (SPEC-001-R37). A dispatched run skips checks, and so skips deploy | A second guard on deploy |

## Owner decisions left open

| # | Decision | Recommendation |
|---|---|---|
| 1 | How the candidate's checks start: (a) the dispatch job and `workflow_dispatch` on `pipeline.yml`, as staged; (b) you push `candidate/<task>` yourself from the patch artifact; (c) a GitHub App or fine-grained token as a secret, which adds a key holder | (a). It widens `pipeline.yml` only to checks on candidate refs |
| 2 | The pinned profile: `us.anthropic.claude-sonnet-5-5`, or Opus 5.5 at a higher price | Sonnet 5.5 for the tracer. Edit the default in `proposals/producer/infra/sandbox/variables.tf` before landing if not. **Corrected 2026-11-07:** this recommendation was wrong for this account. Its quota for Sonnet 5.5, and for every Claude 4.7 and 5.x model, is 0 tokens per minute, so the owner chose Sonnet 4.6 (`proposals/producer-fixes/`) and a separate Sonnet 5.5 quota request |
| 3 | Limits: 40 turns, USD 5, 40 minutes for the agent step, 50 for its job | Keep for T2 |
| 4 | The sandbox allowlist. Resolved as a recommendation you can reverse: the batch now uses `.github/egress/producer-allowlist.json`, with no host, instead of the shared file (`api.github.com`, `bedrock-runtime.us-east-1.amazonaws.com`). To reverse it, point `EGRESS_ALLOWLIST` in `producer.yml` back at `allowlist.json` | Keep the empty list |
| 5 | No reviewer on `producer` (0004) | Keep: only you can dispatch |
| 6 | Defer the deploy role's `NoIdentityWrites` entry to a break-glass change | Defer, and do it with phase 4 |

## Verified, with sources (all read 2026-11-07)

| Fact | Source |
|---|---|
| Events triggered by `GITHUB_TOKEN` create no workflow run, except `workflow_dispatch` and `repository_dispatch` | https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow |
| `sub` for a job with an environment is `repo:<repo>:environment:<name>` | https://docs.github.com/en/actions/reference/security/oidc |
| `allowUnsandboxedCommands: false` through `--settings` makes the sandbox admin-required; `strictAllowlist` is honored from `--settings`; dontAsk refuses hosts off the list; the proxy answers a refused host with 403 | https://code.claude.com/docs/en/sandboxing |
| `blockReadsOutsideWorkingDirectories` and what it blocks for sandboxed commands | https://code.claude.com/docs/en/settings-reference |
| "`autoAllowBashIfSandboxed` still defaults to `true`, so sandboxed commands keep running without prompts" | https://code.claude.com/docs/en/sandboxing |
| "A job that is skipped will report its status as "Success". It will not prevent a pull request from merging, even if it is a required check." | https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions |
| `--settings '{"disableAllHooks": true}'` takes precedence over project settings | https://code.claude.com/docs/en/hooks |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` removes AWS credentials from subprocesses and leaves GitHub tokens | https://code.claude.com/docs/en/env-vars |
| `--tools`, `--setting-sources`, `--strict-mcp-config`, `--max-budget-usd`, `--no-session-persistence` | https://code.claude.com/docs/en/cli-reference |
| With `ANTHROPIC_MODEL` set, background tasks use that model; without profile discovery the prefix is applied unchecked | https://code.claude.com/docs/en/amazon-bedrock |
| A profile in `Resource` needs its foundation model in each Region, limited with `bedrock:InferenceProfileArn` | https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html |
| Sonnet 5.5's Bedrock ID is `anthropic.claude-sonnet-5-5` | https://platform.claude.com/docs/en/about-claude/models/overview |
| `@anthropic-ai/claude-code-linux-x64@2.1.304`: one binary `package/claude`, no scripts, SHA-256 `1eda4ee5...a8acd15` (downloaded and hashed here; matches the registry's sha512 integrity) | https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/2.1.304 |
| The base action pins Claude Code 2.1.304 and installs it through `install.sh` | https://github.com/anthropics/claude-code-action/blob/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/base-action/action.yml |

## Not verified

1. Claude Code's bubblewrap sandbox starts for `claude -p` Bash commands on `ubuntu-24.04`. Inference from the B9 replay, which runs `srt` there; the triage job never runs Bash. The first producer run answers tracer question 1.
2. An invoke-only role works with the pinned profile (tracer question 2). Run 42389828816 assumed the role, but Bedrock refused the model for the whole account, so this is still open.
3. Answered 2026-11-07, and the answer was no: `us.anthropic.claude-sonnet-5-5` was listed `ACTIVE`, yet not callable. A listed profile, an authorized account, an accepted agreement and a quota above 0 are each needed (`docs/verification.md`, "Bedrock: what makes a model callable" and "Bedrock quota"). `aws-setup.sh` checks only the first. For Sonnet 4.6, a `converse` call printing `OK` is the check.
4. The stream-json shapes the `jq` steps read. Observed in run 42389828816: `system` `init` with `permissionMode`, `system` `api_retry`, and `result` with `subtype` and `is_error`. `tool_use` and `tool_result` are not observed yet, because no tool ran.
5. curl prints `403` for the proxy's refusal (`CONNECT tunnel failed, response 403`). If not, the probe reports `BOUNDARY CHECK INVALID` and fails, which is safe.
6. `gh workflow run` succeeds with only `actions: write`.
7. A dispatched run's `checks` check run satisfies the `protect main` ruleset for that SHA, as a push's does.
8. `npm run check:test` passes inside the agent's sandbox without the check tools. If not, the agent sees failures its change did not cause.
9. With `autoAllowBashIfSandboxed: false` and dontAsk, a Bash command that no allow rule names is denied rather than run, and an empty `allowedDomains` with `strictAllowlist` refuses every host. Both follow from the docs; neither has been observed on a runner. Run 42389828816 also showed that dontAsk was not in force at all: Claude Code forced `default` (see "Probe run 1").
10. Passing the allow rules on `--allowedTools` keeps `dontAsk` under `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`. This is inferred from Claude Code's own warning. The new permission-mode step fails the run if it does not.
11. Observed 2026-11-07: break-glass cannot be assumed from the owner's IAM Identity Center session through `OrganizationAccountAccessRole`. A profile with `role_arn` set to `who-gets-the-keys-break-glass` and `source_profile` `wgtk-sandbox-admin` got `AccessDenied ... is not authorized to perform: sts:AssumeRole`. The role's trust requires `aws:MultiFactorAuthPresent` (`infra/sandbox/iam.tf` line 299), and inference: the chained session does not carry it. The role has never been assumed. The owner chose route C for the model switch (below) and a separate follow-up to make break-glass usable (route B: a sandbox IAM principal whose only permission is to assume break-glass, with a TOTP MFA device).

## Review fixes, 2026-11-07

The first staging commit had these faults. The second commit fixes them; this section records them rather than erasing them.

| # | Fault in the first commit | Fix |
|---|---|---|
| 1 | Blocker. A job-level `if:` on `pipeline.yml`'s checks job let a dispatch on a non-candidate ref produce a skipped `checks` check run, which counts as passed, on an unchecked commit | No job-level condition; a first step fails such a run. R209 reworded |
| 2 | Blocker. Scope refused only protected paths, so a patch adding `.npmrc` with `node-options=--import=...` would run code in the candidate's `npm run checks` | Scope is an allowlist: `src/`, `test/`, `docs/`, `traceability.md`, no dot-file segment. R208 updated |
| 3 | `autoAllowBashIfSandboxed` defaults to `true`, so the exact Bash rules did not limit sandboxed commands | Set to `false`. R87 updated |
| 4 | The agent's sandbox allowed `api.github.com` through the shared allowlist | Producer-only allowlist with no host. R87 updated |
| 5 | The entry-point guard could skip `scope` silently, exit 0, on a symlinked or percent-encoded path | Real paths compared; publish commits only after `scope ok` |
| 6 | `git diff --stat` printed agent-chosen file names with workflow commands on | Wrapped in `::stop-commands::` |
| 7 | `LAND.txt` expected a "Changed since by" warning that, after the rebase onto `f6044ef`, cannot appear; R83, R85 and R86 put conditions after SHALL | Comment corrected; EARS order fixed |

Found while fixing: a path with a newline could have put a workflow command on a line of its own in the refusal line. Scope now refuses any path with a control character without echoing it.

## How it was tested

In a scratch clone matching `f6044ef` with this batch's moves applied, with pinned tools from `scripts/ci/install-tools.sh` and Node.js 24.22.2:

| Command | Result |
|---|---|
| `node scripts/checks.ts workflows` | exit 0. zizmor offline: no findings. `--persona auditor` shows only three `undocumented-permissions` notes, on `pipeline.yml` jobs already on main |
| `node scripts/checks.ts iac` | exit 0: fmt, validate and tflint in `infra/sandbox` and `infra/org` |
| `node scripts/checks.ts secrets` | exit 0 |
| `semgrep scan --config p/default --error` on the new and changed files | no findings |
| `git apply --check` of B04, B08a, B08b, B10, B14, B17, B18 | all apply |
| `producer.test.ts`, `checks-before-main.test.ts`, `aws-setup.test.ts` | 19, 11 and 37 passed, under a stand-in for `vitest` and `yaml` written for this check. Seven deliberate mutations, three in the first round and four in the second, each made the tests fail |

Not run: the real `lint`, `typecheck`, `trace` and `test` checks, because this session may not install dependencies. The staging commit's own pipeline lints the staged TypeScript but does not typecheck or test it. Run the preflight below before you sign. The PostToolUse ESLint hook reported false failures on the staged test files: ESLint is not installed (`ENOENT`).

## Owner preflight, before you sign

Run it once the staging commits are on `main`. It checks the batch with the real tools in a throwaway worktree, commits nothing, and removes the worktree. It must end with `preflight exit 0`.

```bash
git fetch -q origin main && wt="$(mktemp -d)/t2-preflight" && git worktree add -q --detach "$wt" origin/main && (cd "$wt" && grep '^move: ' proposals/producer/LAND.txt | while read -r _ src dest; do mkdir -p "$(dirname "$dest")" && git mv -f "proposals/producer/$src" "$dest" || exit 1; done && npm ci --ignore-scripts --no-audit --no-fund && npx tsc --noEmit -p . && npx eslint scripts/ci/producer.ts test/producer.test.ts test/checks-before-main.test.ts test/aws-setup.test.ts && npx vitest run test/producer.test.ts test/checks-before-main.test.ts test/aws-setup.test.ts test/receipt.test.ts test/checks.test.ts); rc=$?; git worktree remove --force "$wt"; echo "preflight exit ${rc}"
```

## Owner steps

1. Run the preflight. Then run `scripts/bootstrap/land.sh proposals/producer`. It should print no "Changed since by" warning; if it does, answer no.
2. When it asks you to approve the sandbox deploy, leave it waiting. In a second terminal run `aws-setup.sh` as the README's "AWS setup" shows. Review the infra/sandbox plan: one role, one role policy, two outputs. Review the infra/org plan: the SCP gains one ARN. Then approve the deploy; it plans no changes.
3. Bad path first, because it pushes nothing:

```bash
gh workflow run producer.yml --repo PaulDuvall/who-gets-the-keys --ref main -f task=TASK-T2-PROBE -f subject="Egress probe" -f prompt="egress probe" -f egress_probe=true
```

```bash
gh run watch "$(gh run list --repo PaulDuvall/who-gets-the-keys --workflow producer.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

   Done when the agent job's log shows the curl result and `BOUNDARY HELD: egress to example.com`.

4. Good path, docs only, so no Spec input:

```bash
gh workflow run producer.yml --repo PaulDuvall/who-gets-the-keys --ref main -f task=TASK-T2-GOOD-1 -f subject="Add a producer runs table to the Tracer 2 notes" -f prompt="In docs/notes/tracer-2.md, add a section 'Producer runs' at the end with a table whose header is Run, Task, Result and no rows. Change nothing else."
```

   Done when `candidate/TASK-T2-GOOD-1` exists and its dispatched `pipeline.yml` run passes. Then land it with `scripts/bootstrap/land.sh --to-main <SHA> candidate/TASK-T2-GOOD-1`, or delete the branch.

## Probe run 1, 2026-11-07

Producer run 42389828816 (`egress_probe=true`) failed at "Check that the sandbox blocked the probe" with `BOUNDARY CHECK INVALID: egress probe did not run`. That failure was correct and safe. Install, digests, sandbox packages, settings and role assumption all passed. The transcript artifact shows why no tool ran:

| Finding | Evidence | Fix in `proposals/producer-fixes/` |
|---|---|---|
| Bedrock refused the model for the account | 12 `api_retry` events, then `API Error: 403 anthropic.claude-sonnet-5-5 is not available for this account`. An admin `converse` call failed the same way, before and after the owner accepted the model's agreement. The account's Sonnet 5.5 quota is 0 tokens per minute (`docs/verification.md`) | `producer_inference_profile` defaults to `us.anthropic.claude-sonnet-4-6`, whose quota is 6,000,000 |
| dontAsk was not in force | Claude Code 2.1.304 printed "Permission mode forced to default — CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is set … Declare allowedTools explicitly", and `init` showed `permissionMode: default` | SPEC-001-R88: the settings' allow rules also go on `--allowedTools`, and a step fails any run whose `init` event is not `dontAsk`, before the probe and end-of-run checks |
| A failed run can look successful | `result` had `subtype: success` and `is_error: true`, with 0 tokens | SPEC-001-R89: `is_error` must be `false`, or the run fails with `CHECK producer FAILED: agent error` |

### Owner steps for `proposals/producer-fixes/`

1. Accept Sonnet 4.6's agreement, then check that a call works and that the profile's foundation model is the one `iam.tf` derives (`anthropic.claude-sonnet-4-6`, from trimming `us.`):

```bash
token="$(aws bedrock list-foundation-model-agreement-offers --region us-east-1 --profile wgtk-sandbox-admin --model-id anthropic.claude-sonnet-4-6 --query 'offers[0].offerToken' --output text)" && aws bedrock create-foundation-model-agreement --region us-east-1 --profile wgtk-sandbox-admin --model-id anthropic.claude-sonnet-4-6 --offer-token "$token"
```

```bash
aws bedrock-runtime converse --region us-east-1 --profile wgtk-sandbox-admin --model-id us.anthropic.claude-sonnet-4-6 --messages '[{"role":"user","content":[{"text":"Reply with OK"}]}]' --query 'output.message.content[0].text' --output text
```

```bash
aws bedrock get-inference-profile --region us-east-1 --profile wgtk-sandbox-admin --inference-profile-identifier us.anthropic.claude-sonnet-4-6 --query 'models[].modelArn' --output text
```

   Stop unless `converse` prints `OK` and every ARN ends in `foundation-model/anthropic.claude-sonnet-4-6`.

2. Request the Sonnet 5.5 quota separately. It changes nothing in this batch:

```bash
aws service-quotas list-service-quotas --service-code bedrock --region us-east-1 --profile wgtk-sandbox-admin --query "Quotas[?QuotaName=='Cross-region model inference tokens per minute for Anthropic Claude Sonnet 5.5'].[QuotaCode, Adjustable]" --output text
```

   If it shows `True`, request a value of your choice with `aws service-quotas request-service-quota-increase --service-code bedrock --region us-east-1 --profile wgtk-sandbox-admin --quota-code <code> --desired-value <tokens per minute>`. If it shows `False`, it takes an AWS Support case.

3. Once the staging commit is on `main`, run this preflight. It must end with `preflight exit 0`:

```bash
git fetch -q origin main && wt="$(mktemp -d)/t2-fixes-preflight" && git worktree add -q --detach "$wt" origin/main && (cd "$wt" && grep '^move: ' proposals/producer-fixes/LAND.txt | while read -r _ src dest; do mkdir -p "$(dirname "$dest")" && git mv -f "proposals/producer-fixes/$src" "$dest" || exit 1; done && npm ci --ignore-scripts --no-audit --no-fund && npx tsc --noEmit -p . && npx eslint test/producer.test.ts && npx vitest run test/producer.test.ts test/checks-before-main.test.ts); rc=$?; git worktree remove --force "$wt"; echo "preflight exit ${rc}"
```

   Then run `scripts/bootstrap/land.sh proposals/producer-fixes`. When it asks you to approve the sandbox deploy, leave it waiting.

4. Route C, owner decision of 2026-11-07, because break-glass cannot be assumed (Not verified, item 11). Lift the SCP with the management profile, and check that only `FullAWSAccess` is left:

```bash
aws organizations detach-policy --policy-id p-zolwyr2a --target-id 462701644281 --profile org-management
```

```bash
aws organizations list-policies-for-target --target-id 462701644281 --filter SERVICE_CONTROL_POLICY --profile org-management --query 'Policies[].[Id,Name]' --output text
```

5. Run `aws-setup.sh` with the new triage model. `infra/sandbox` must plan only `aws_iam_role_policy.producer` updated in place, its two resources now naming `claude-sonnet-4-6` (0 to add, 1 to change, 0 to destroy). `infra/org` must plan only the SCP attachment created (1 to add). Answer no to anything else. `github.sh --vars` sets `PRODUCER_MODEL` from the new output:

```bash
SANDBOX_ACCOUNT_ID=462701644281 SANDBOX_PROFILE=wgtk-sandbox-admin MANAGEMENT_PROFILE=org-management ALERT_EMAIL=pduvall@gmail.com TRIAGE_MODEL=us.anthropic.claude-sonnet-4-6 scripts/bootstrap/aws-setup.sh
```

   Then check that `p-zolwyr2a` is attached again, with the `list-policies-for-target` command above.

6. Approve the deploy of `main`'s tip; it plans no change. Then dispatch the egress probe again. Done when the agent job prints `Permission mode: dontAsk.` and `BOUNDARY HELD: egress to example.com`.
