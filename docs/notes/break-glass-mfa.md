# Route B: the break-glass MFA batch

Status: staged in `proposals/break-glass-mfa/`, not landed. Drafted 2026-11-07 on a branch from before the history rewrite, as SPEC-001-R210, and restaged on 2026-11-08 on today's `main` as SPEC-001-R217, last in that day's landing order. Decision, sources and alternatives: `docs/decisions/0007-break-glass-mfa.md`. The sandbox account ID, the alert email and the SCP's policy ID are placeholders: the owner keeps them outside this public repository.

## Restaged 2026-11-08

| Change | Why |
|---|---|
| SPEC-001-R210 renumbered to R217 | `main` uses R210 for `land.sh --delivery` (T3); this run's other batches use R211 to R216 |
| `iam.tf`, both `main.tf` files and `aws.sh` taken as staged | Their destinations on today's `main` are byte for byte those the first staging was built on |
| `aws-setup.sh` and `test/aws-setup.test.ts` merged onto `proposals/role-arn-secrets/`'s copies | That batch changes both. Two conflicts, both resolved by keeping both sides: the header names the break-glass user and the secrets, and the last lines print both the secret and variable lists and the break-glass check |
| The spec on `proposals/npmrc/`'s copy, `traceability.md` on the same, `README.md` on `proposals/land-presign/`'s copy | Each later batch carries the earlier batches' changes |
| The owner's preflight step is gone | Once `proposals/land-presign/` lands, `land.sh` runs it before asking to sign (SPEC-001-R213) |

## What the batch changes

| Destination | Change |
|---|---|
| `infra/sandbox/iam.tf` | New `aws_iam_user.break_glass` and `aws_iam_user_policy.break_glass` (allow the assumption; deny everything else and every other role). Break-glass trusts only that user, with MFA and `aws:RequestedRegion` `us-east-1`. The deploy role gains `ReadBreakGlassUser` and its `NoIdentityWrites` lists the user and the producer role. Break-glass gains a `BreakGlassUser` statement |
| `infra/sandbox/main.tf` | The break-glass rule moves to state `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS` and also matches every call by the user. Outputs `break_glass_role_arn` and `break_glass_user_name` |
| `infra/org/main.tf` | The SCP's identity-write deny covers `user/who-gets-the-keys/*` and `mfa/who-gets-the-keys/*`, and the credential action families |
| `scripts/bootstrap/aws-setup.sh` | New step 5 of 7: the user's TOTP device and access key, while the SCP is not attached, and the profiles `who-gets-the-keys-break-glass` and `who-gets-the-keys-break-glass-user`. Optional `BREAK_GLASS_PROFILE` |
| `scripts/bootstrap/aws.sh` | Its printed step 4 applies as break-glass through `aws configure export-credentials`, because Terraform cannot ask for an MFA code |
| `specs/SPEC-001-delivery-pipeline.md` | A "Break-glass" section with SPEC-001-R217, and one sentence in the producer section |
| `test/break-glass.test.ts` | New. 7 tests on the Terraform and the SCP |
| `test/aws-setup.test.ts` | Stubs for the new calls, the new call order, and 5 new tests |
| `traceability.md` | Row SPEC-001-R217 |
| `README.md` | "AWS setup" names the enrollment step and gains a "Break-glass" subsection |

## Owner steps

### 1. Before you sign

Check that your YubiKey has the OATH application enabled. `ykman info` must list `OATH` as enabled over USB:

```bash
ykman info
```

Check that the sandbox account has a trail that is logging. Without one, the alarm cannot fire, before or after this batch:

```bash
aws cloudtrail describe-trails --include-shadow-trails --region us-east-1 --profile wgtk-sandbox-admin --query 'trailList[].[TrailARN,HomeRegion,IsMultiRegionTrail,IsOrganizationTrail]' --output text
```

For each trail it lists:

```bash
aws cloudtrail get-trail-status --name <trail ARN> --region us-east-1 --profile wgtk-sandbox-admin --query IsLogging
```

```bash
aws cloudtrail get-event-selectors --trail-name <trail ARN> --region us-east-1 --profile wgtk-sandbox-admin
```

You want `IsLogging` `true`, and management events with `ReadWriteType` `All` (or advanced selectors that include read events), because AssumeRole is a read-only event. If no trail qualifies, land anyway; the steps below still work, but no email will arrive. Decide on owner decision 1 in decision 0007.

### 2. Preflight

`land.sh` runs it itself, after your review and before it asks you to sign (SPEC-001-R213). It must print `Preflight passed.`

### 3. Land

```bash
scripts/bootstrap/land.sh proposals/break-glass-mfa
```

It prints a "Changed since by" warning for each of `specs/SPEC-001-delivery-pipeline.md`, `traceability.md`, `README.md`, `scripts/bootstrap/aws-setup.sh` and `test/aws-setup.test.ts`, naming the earlier batches' landing commits, each followed by "The staged copy keeps every line those commits added." Answer yes. If it warns about any other file, or says a copy lacks lines, answer no.

When it asks you to approve the sandbox deploy in `main`'s run, leave it waiting. Do steps 4 to 7 in a second terminal at the same checkout first.

### 4. Lift the SCP, one last time

```bash
aws organizations detach-policy --policy-id <SCP policy ID> --target-id <sandbox account ID> --profile org-management
```

Only `FullAWSAccess` may be left:

```bash
aws organizations list-policies-for-target --target-id <sandbox account ID> --filter SERVICE_CONTROL_POLICY --profile org-management --query 'Policies[].[Id,Name]' --output text
```

### 5. Run aws-setup.sh

```bash
SANDBOX_ACCOUNT_ID=<sandbox account ID> SANDBOX_PROFILE=wgtk-sandbox-admin MANAGEMENT_PROFILE=org-management ALERT_EMAIL=<alert email> TRIAGE_MODEL=us.anthropic.claude-sonnet-4-6 scripts/bootstrap/aws-setup.sh
```

Answer no to any plan that differs from these.

| Plan | Expected |
|---|---|
| `infra/sandbox` | `Plan: 2 to add, 4 to change, 0 to destroy.` Add `aws_iam_user.break_glass`, `aws_iam_user_policy.break_glass`. Change in place `aws_iam_role.break_glass`, `aws_iam_role_policy.break_glass_identity`, `aws_iam_role_policy.deploy`, `aws_cloudwatch_event_rule.break_glass_used` |
| `infra/org` | `Plan: 1 to add, 1 to change, 0 to destroy.` Change `aws_organizations_policy.sandbox_writes` in place; add `aws_organizations_policy_attachment.sandbox` |

These are the first staging's expectations for the case where `producer-fixes`' route C run was done, which it was on 2026-11-07. Not re-derived on 2026-11-08: the agent runs no Terraform plan against AWS.

In step 5 of 7 it creates the TOTP device and asks you to add its secret to the YubiKey in another terminal, with the exact `ykman oath accounts add --touch` command. Then it asks for two codes, each from `ykman oath accounts code --single who-gets-the-keys-break-glass-user` and a touch, the second from the next 30-second window. It then creates the access key into profile `who-gets-the-keys-break-glass-user` without printing it, and writes profile `who-gets-the-keys-break-glass`. If anything fails there, it says why and still attaches the SCP in step 6. Break-glass then stays unusable until you repeat steps 4 and 5.

If the `infra/sandbox` apply fails with "Invalid principal in policy", IAM had not yet propagated the new user. Run the same command again; the plan then holds only what is left.

The `infra/sandbox` plan may also update `aws_lambda_function.export` in place, if a `main` deploy since 2026-11-08's `src/` change was left unapproved. That change is acceptable; any other is not.

If `aws-setup.sh` stops before its step 6, after a declined plan, a failed apply or Ctrl-C, the SCP stays detached. If you will not run it again now, attach the SCP again, then do step 6's check:

```bash
aws organizations attach-policy --policy-id <SCP policy ID> --target-id <sandbox account ID> --profile org-management
```

### 6. Check that the SCP is back

`<SCP policy ID>` must be listed again:

```bash
aws organizations list-policies-for-target --target-id <sandbox account ID> --filter SERVICE_CONTROL_POLICY --profile org-management --query 'Policies[].[Id,Name]' --output text
```

### 7. Check the boundary, bad paths first

Each of these four calls should produce one alert email within a few minutes, if a trail is logging.

The old route is refused:

```bash
aws sts assume-role --role-arn arn:aws:iam::<sandbox account ID>:role/who-gets-the-keys/who-gets-the-keys-break-glass --role-session-name old-route --profile wgtk-sandbox-admin --region us-east-1
```

Expect `AccessDenied ... is not authorized to perform: sts:AssumeRole`.

The access key without a code is refused:

```bash
aws sts assume-role --role-arn arn:aws:iam::<sandbox account ID>:role/who-gets-the-keys/who-gets-the-keys-break-glass --role-session-name no-code --profile who-gets-the-keys-break-glass-user --region us-east-1
```

Expect `AccessDenied`.

The access key can do nothing else:

```bash
aws s3 ls --profile who-gets-the-keys-break-glass-user --region us-east-1
```

Expect `AccessDenied ... with an explicit deny in an identity-based policy`.

The good path. It asks for a code; touch the YubiKey for it with `ykman oath accounts code --single who-gets-the-keys-break-glass-user`:

```bash
aws sts get-caller-identity --profile who-gets-the-keys-break-glass --region us-east-1
```

Expect `arn:aws:sts::<sandbox account ID>:assumed-role/who-gets-the-keys-break-glass/<session>`. Done when the alert email for it arrives, with `"eventName": "AssumeRole"`.

### 8. Approve the deploy

Approve the sandbox deploy of `main`'s tip in the run `land.sh` is watching. It plans no change. If it ran before step 5 and failed, rerun its failed jobs, then approve.

## How it was tested

On 2026-11-07, before the history rewrite, in a scratch worktree of the commit that staged it with `proposals/producer-fixes` and then this batch moved into place, with the pinned tools from `scripts/ci/install-tools.sh`, Node.js 24.22.2 and the repository's `node_modules`. History was unshallowed first, because the trace check reads it.

| Command | Result |
|---|---|
| `node scripts/checks.ts secrets`, `allowlist`, `workflows`, `lint`, `typecheck`, `iac`, `sast`, `trace`, `ratchet`, `slides` | exit 0 each. `sast` first failed on two Semgrep rules the new `BreakGlassUser` statement trips by design, now suppressed for that statement only, with the reason in the comment |
| `npx vitest run`, the whole suite | 182 passed, 18 skipped, 1 failed. The failures are the 3 files that need `ssh-keygen` (`checks.test.ts`, `land.test.ts`, `signatures.test.ts`), which this container lacks. They fail the same way on `main` here; CI has OpenSSH |
| `test/aws-setup.test.ts` | 42 passed: the 37 existing, with the new call order, and 5 new |
| `test/break-glass.test.ts` | 7 passed |
| Ten deliberate mutations: no umask on the seed file, enrolling while the SCP is attached, printing the secret, letting a failed enrollment stop the run before the SCP step, an account-root trust, a wider `NotAction`, no rule state, no MFA path in the SCP, no producer entry in the deny, the deploy role listing access keys | each made a test fail |
| `git apply --check` of all 17 scenario patches | all apply |
| The SCP's rendered size, with `terraform console` | 2,637 characters, from 2,358; the limit is 10,240 |

Not run: `install`, because `npm ci` would rewrite the shared `node_modules`; `sca`, because no lockfile changes; `signatures` and `mutation`. `signatures` fails on `main` in this container for the same missing `ssh-keygen`.

2026-11-08, after restaging: the preflight in `docs/notes/autonomous-run-2026-11-08.md`, with every batch of that day applied in order.

## Review of the restaged batch, 2026-11-08

An independent review applied the seven batches in order: `test/break-glass.test.ts` 7 passed, `test/aws-setup.test.ts` 48 passed, and `tsc`, trace, iac (with `terraform init` against the registry), sast, secrets, lint and slides passed. It found the rebuild faithful (`iam.tf`, both `main.tf` files, `aws.sh` and the new test byte for byte as first staged, but for the ID), R217 met, nothing that locks the owner out or widens access, and nothing critical.

| Severity | Finding | Done |
|---|---|---|
| High | The staged `aws-setup.sh` reworded two header lines the role ARN batch adds, so `land.sh` would report "lacks lines" and the runbook would have the owner answer no | Fixed in `ef423f6` before the review ended |
| Medium | No way back if `aws-setup.sh` stops before attaching the SCP | Step 5 gives the `attach-policy` command |
| Low | An `AWS_REGION` in the shell overrides the profile's region and fails the trust's `aws:RequestedRegion` | `--region us-east-1` on step 7's calls, the README's check and `aws-setup.sh`'s closing hint |
| Low | The expected plan did not allow for a Lambda update left by an unapproved deploy | Named as acceptable |
| Low | A failed `aws configure set` after a key was made exited before the SCP step, against R217 | Each failure now sets the status line and the run goes on; a new test covers the "no break-glass user yet" path |
| Low | The secret passes through `aws configure set`'s command line | Said in decision 0007 beside the seed's exposure |
| Low | `break-glass.test.ts`'s regexes would miss an extra condition key | Not changed: the ten recorded mutations each fail a test |
| Low | Backlog 7v1's quarterly drill is not addressed | Stays open in the backlog |
| Low | The branch this was first staged on still holds the real account ID, email and SCP policy ID, and `main`'s history holds the email and policy ID | Owner step: delete the branch; the history is part of backlog m7a's steps 3 and 4 |
