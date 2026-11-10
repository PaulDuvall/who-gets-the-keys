# The break-glass alarm key

Status: staged in `proposals/alarm-key/`, not landed. Backlog `who-gets-the-keys-q2n`. Amends SPEC-001-R217.

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

When it prints `Approve the sandbox deployment in main's run`, do not approve. The deploy role cannot create the key, so the deploy would fail without applying anything, as on 2026-11-09.

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

Its step 4 skips both email subscriptions, and step 7 sets the same secrets and variables as before.

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

Approve the deploy in the run `land.sh` printed. It plans no change: the deploy role reads the new key through `DeployReads`.

### Optional: one subscription

The topic has two confirmed email subscriptions, both to the same inbox, so each alarm arrives twice. `aws-setup.sh` subscribes `ALERT_EMAIL` and never removes one, and Terraform does not manage them. To keep one, remove the other with `aws sns unsubscribe --subscription-arn <ARN> --region us-east-1 --profile wgtk-sandbox-admin`, and keep passing the kept address as `ALERT_EMAIL`.

## How it was tested

Filled in after the preflight below.
