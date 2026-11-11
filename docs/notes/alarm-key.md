# The break-glass alarm key

Status: landed and verified. Backlog `who-gets-the-keys-q2n`, closed 2026-11-11. Amends SPEC-001-R217. The outcome, and two corrections to the steps below, are in "What happened" at the end.

## Why

On 2026-11-09 the owner landed `proposals/break-glass-mfa/` (`b8483f2`), enrolled the break-glass user and made the four boundary calls of `docs/notes/break-glass-mfa.md` step 7. All four behaved as required, and no alarm email arrived.

| Check, 2026-11-09 | Result |
|---|---|
| CloudTrail trail in the sandbox | One multi-Region trail, logging, management events `ReadWriteType` `All` |
| Email subscriptions on `who-gets-the-keys-break-glass` | Two, both confirmed (two addresses of the same inbox) |
| Rule `who-gets-the-keys-break-glass-used`, 22:30 to 23:30 UTC | `TriggeredRules` 3, `FailedInvocations` 3 |

So the rule matched and every delivery to SNS failed. The topic was encrypted with the AWS managed key `alias/aws/sns`. AWS's SNS developer guide, "Enable compatibility between event sources from AWS services and encrypted topics" (https://docs.aws.amazon.com/sns/latest/dg/sns-key-management.html, read 2026-11-09), says an AWS event source can publish to an encrypted topic only through a customer managed key whose policy grants its service principal, `events.amazonaws.com` for EventBridge, `kms:GenerateDataKey*` and `kms:Decrypt`. The AWS managed key's policy cannot be changed. No alarm could ever have been delivered; lesson L2 records that break-glass had never been assumed before.

The same page: "Adding the aws:SourceAccount, aws:SourceArn, and aws:SourceOrgID to a AWS KMS policy is not supported for EventBridge-to-encrypted topics." The grant cannot be scoped to the rule.

## What the batch changes

| Destination | Change |
|---|---|
| `infra/sandbox/main.tf` | New `aws_kms_key.break_glass_alarm`, rotation on, three statements: `Account` (the account root, as for the sandbox key), `DeployReads` (the deploy role may describe, get and list it) and `EventBridgePublishes` (`events.amazonaws.com` may `kms:GenerateDataKey*` and `kms:Decrypt`, unscoped). The topic's `kms_master_key_id` moves from `alias/aws/sns` to that key |
| `test/break-glass.test.ts` | One new test under SPEC-001-R217 |
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R217 amended: the topic's key, its three grants, why, and what happened before 2026-11-10 |

## Decision

The owner chose, on 2026-11-09, a key for the alarm alone over the two alternatives.

| Option | Why not |
|---|---|
| Add the grant to the existing sandbox key | The grant cannot be scoped, so EventBridge's service principal could also use the key that encrypts the `export_jobs` table and the export log group |
| No encryption on the topic | Alarm messages carry ARNs and source addresses. The sast check may flag an unencrypted topic |

`DeployReads` is in the key policy, not the deploy role's IAM policy, because that IAM policy names `aws_kms_key.sandbox` only, and the SCP lets only break-glass change it. A key policy that names a principal in the same account grants it without an IAM allow. The deploy role still denies itself `kms:CreateKey` and `kms:PutKeyPolicy` (`NoKeyAdministration`), so the pipeline cannot create this key; the owner does, as the sandbox admin, which the SCP allows because it covers no KMS or SNS action.

Residual risk, accepted: `EventBridgePublishes` names a service principal with no condition, as AWS requires. The key encrypts only alarm messages.

## Owner steps

Each step runs in a terminal at your local clone, on `main`, unless it says otherwise.

### 1. Move `main` to the staging commit

The agent's unsigned commit adds this batch, these notes and the backlog entry. Success: `Landed <short SHA> on main.` Approve its deploy; it plans no change.

```bash
scripts/bootstrap/land.sh --to-main <staging commit SHA> candidate/alarm-key
```

### 2. Land the batch, and leave its deploy waiting

```bash
scripts/bootstrap/land.sh proposals/alarm-key
```

Expect no "Changed since by" warning, unless another commit has changed one of the three destinations since step 1. The preflight prints `passed: git apply --check scenarios/B14-irreversible-table-rename.patch`, then `Preflight passed.`

When it prints `Approve the sandbox deployment in main's run`, do not approve. The deploy role cannot create the key, so an early deploy fails at the key, and the topic change, which depends on it, never starts, as on 2026-11-09. Terraform does not roll back, so any change in that plan unrelated to the key would still apply; this batch adds none, and every deploy since 2026-11-08 has planned "No changes".

### 3. Apply `infra/sandbox` with `aws-setup.sh`

No SCP lift: the SCP covers no KMS or SNS action. In a second terminal, with your SSO session fresh (`aws sso login --profile org-management`):

```bash
SANDBOX_ACCOUNT_ID=<sandbox account ID> SANDBOX_PROFILE=wgtk-sandbox-admin MANAGEMENT_PROFILE=org-management ALERT_EMAIL=<alert email> TRIAGE_MODEL="$(gh variable get TRIAGE_MODEL --repo PaulDuvall/who-gets-the-keys)" scripts/bootstrap/aws-setup.sh
```

| Prompt | Answer yes only if |
|---|---|
| `infra/sandbox` plan | `Plan: 1 to add, 1 to change, 0 to destroy.` Adds `aws_kms_key.break_glass_alarm`; changes `aws_sns_topic.break_glass` in place, `kms_master_key_id` only. Answer no to anything that touches `aws_lambda_function.export` or an IAM role or user: the SCP refuses those to this profile |
| `infra/org` plan | `No changes.`, or no prompt |
| Its step 5 | `already has TOTP device` and `already has access key`, each `Skipped.` |

Its step 4 skips the `ALERT_EMAIL` subscription, which exists, and step 7 sets the same secrets and variables as before.

The plan's "1 to add, 1 to change" assumes the Lambda artifact `aws-setup.sh` builds at `HEAD` has the deployed SHA-256, as it did on 2026-11-09 (that run's plan held no Lambda change). If the plan also changes `aws_lambda_function.export`, answer no: the SCP refuses that change to this profile.

### 4. Check the alarm

Repeat `docs/notes/break-glass-mfa.md` step 7: four calls. Each should send an email to each subscribed address within a few minutes. Then, with the hour of the calls:

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Events --metric-name Invocations --dimensions Name=RuleName,Value=who-gets-the-keys-break-glass-used --start-time <hour start, UTC> --end-time <hour end, UTC> --period 3600 --statistics Sum --region us-east-1 --profile wgtk-sandbox-admin
```

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Events --metric-name FailedInvocations --dimensions Name=RuleName,Value=who-gets-the-keys-break-glass-used --start-time <hour start, UTC> --end-time <hour end, UTC> --period 3600 --statistics Sum --region us-east-1 --profile wgtk-sandbox-admin
```

Success: `Invocations` above 0 and `FailedInvocations` 0, or no datapoint. Count the emails per call: SPEC-001-R217 requires every assumption of break-glass, denied ones included, and every call by its user to be matched. On 2026-11-09 the rule matched 3 events in an hour with at least four matching calls; that count is the check.

### 5. Approve the deploy

Approve the deploy in the run `land.sh` printed. It should plan no change: the deploy role reads the new key through `DeployReads`. If it plans a change to `aws_sns_topic.break_glass`'s `kms_master_key_id`, SNS returned the key in another form than the ARN Terraform set, which the files cannot show. Do not approve another deploy; tell the agent. The topic kept `alias/aws/sns` with no such diff on every earlier deploy.

### Optional: one subscription

The topic has two confirmed email subscriptions, both to the same inbox, so each alarm arrives twice. `aws-setup.sh` subscribes `ALERT_EMAIL` and never removes one, and Terraform does not manage them. To keep one, remove the other with `aws sns unsubscribe --subscription-arn <ARN> --region us-east-1 --profile wgtk-sandbox-admin`, and keep passing the kept address as `ALERT_EMAIL`.

## How it was tested

On 2026-11-10, in a scratch worktree of the staging commit with the three moves applied as `land.sh` applies them, in a cloud session with no `ssh-keygen`:

| Step | Result |
|---|---|
| `land.sh`'s checks, simulated | Both `requires` lines met, no "Changed since by" warning, `candidate/land-alarm-key` absent |
| `tsc --noEmit`, ESLint on `test/break-glass.test.ts` | Pass |
| vitest, every test | All pass but the 3 that need `ssh-keygen` (`test/checks.test.ts`, `test/land.test.ts`, `test/signatures.test.ts`), as on `main` in this container |
| The new test against `main`'s `infra/sandbox/main.tf` | Fails on `kms_master_key_id = "alias/aws/sns"`, so it catches the fault |
| The new test against three wrong keys, after the review: an extra Allow with no Sid, a `Condition` on `DeployReads`, and a log group using a literal key ARN | Fails on each; passes on the staged copy |
| Checks trace, slides, secrets, iac (`terraform fmt`, `validate`, tflint), sast (Semgrep `p/default`) | Pass |
| `git apply --check`, every scenario patch | 19 of 19 apply; `land.sh`'s preflight checks B14, which touches `infra/sandbox/main.tf` |

Not tested: any call to AWS. The agent runs no Terraform plan against the sandbox; the owner's step 3 plan is the first.

## Review

An independent review by the `validator` subagent, given the files, the spec row and the AWS quote, found nothing critical or high.

| Finding | Severity | Done |
|---|---|---|
| SPEC-001-R217 named two of the key's three statements, not the account root's `kms:*` | low | Fixed: the row names all three |
| These notes said an early deploy "would fail without applying anything", true only while the plan holds nothing else | medium | Fixed in step 2 |
| The test missed an extra statement without a Sid, a `Condition` on `Account` or `DeployReads`, and a second user of the key through a literal ARN or a data source | low to medium | Fixed: exactly three unconditional Allow statements on `*`, the `Account` principal and action, every key attribute names a key resource, and no `aws_kms_key` data source |
| Whether SNS returns `KmsMasterKeyId` as the ARN Terraform set; a different form would leave a diff in every plan | cannot be decided from the files | Not fixed; step 5 checks it, and `alias/aws/sns` round-tripped with no diff before |
| The expected plan assumes a reproducible Lambda zip | low | Recorded in step 3 |
| The key policy's events grant is unscoped | low, accepted | AWS supports no scoping there; the key encrypts only alarm messages |

## What happened, 2026-11-10 and 2026-11-11

| Step | Result |
|---|---|
| 1. Staging change | `ac72331` on `main`; its deploy planned no change |
| 2. The batch | `b9f6432`, owner-signed. `main`'s run then failed the sca check on GHSA-6cv4-p8m7-4r25 (node-forge 1.4.2), an advisory published at 21:16 UTC on 2026-11-10, after the candidate run's check and before `main`'s. No deploy ran. The fix, `d750b3e` (node-forge 1.4.3), was an owner-signed lockfile change: an unsigned staging change could not pass the sca check either |
| 3. `aws-setup.sh` | The `infra/sandbox` plan was **1 to add, 2 to change**, not the "1 to change" step 3 said. `data.aws_iam_policy_document.deploy` names the topic's ARN, so Terraform read it only during the apply ("depends on a resource or a module with changes pending"), and `aws_iam_role_policy.deploy` showed `policy … -> (known after apply)`. At apply the read gave the same JSON and that update became a no-op: `Apply complete! Resources: 1 added, 1 changed, 0 destroyed.` No `PutRolePolicy` call was made, so the SCP was not involved. The first attempt stopped before any change on a DNS failure resolving the SSO portal |
| 4. The alarm | Four boundary calls at 21:59 to 22:00 UTC on 2026-11-10 gave the four required answers. Three emailed both subscriptions: the user's refused `AssumeRole`, its refused `ListBuckets`, and the assumption with a code. The old route, the admin role's refused `AssumeRole`, emailed nothing: CloudTrail records a refused `AssumeRole` with `requestParameters` `null`, so the rule's `roleArn` pattern cannot match it. That also accounts for the 3 matches of 2026-11-09. Backlog `who-gets-the-keys-r3m` |
| 5. The deploy | `d750b3e`'s deploy, run 43080816688, planned no change: the deploy role reads the new key through `DeployReads`, and SNS returns the key ARN as Terraform set it |

Corrections to the steps above: step 3's expected plan should have been "1 to add, 2 to change, the second being the deploy role's policy with `(known after apply)` only". Step 4 should have expected three emails, not four, until `who-gets-the-keys-r3m` lands. The alarm email also carries the assumed session's access key ID and session token, though not its secret key; `who-gets-the-keys-r3m` sends a trimmed message instead.
