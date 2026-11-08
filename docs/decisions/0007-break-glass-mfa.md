# 0007. Break-glass is assumed only by its own IAM user, with a TOTP code from the owner's YubiKey

- Status: Proposed. Staged in `proposals/break-glass-mfa/`, not landed. Drafted 2026-11-07 as SPEC-001-R210 on a branch from before the history rewrite; restaged 2026-11-08 on today's `main` as SPEC-001-R217, because `main` has used R210 for `land.sh --delivery` since T3. Account IDs, emails and policy IDs in this record are placeholders
- Date: 2026-11-07
- Requirements: SPEC-001-R217, new. The deploy role's producer entry deferred by SPEC-001-R86 lands with it
- Follows: `docs/verification.md`, row "Break-glass from IAM Identity Center"; `docs/notes/tracer-2-t2-producer.md`, "Not verified" item 11
- Owner steps: `docs/notes/break-glass-mfa.md`

## Context

On 2026-11-07 the owner could not assume `who-gets-the-keys-break-glass` in sandbox account <sandbox account ID>. The profile chained from IAM Identity Center in the management account, through `OrganizationAccountAccessRole`, and got `AccessDenied` on `sts:AssumeRole`. The role trusted `arn:aws:iam::<account>:root` with `Bool aws:MultiFactorAuthPresent = true`.

The SCP's `DenyIdentityWritesExceptBreakGlass` lets only break-glass change the workload's roles, its own trust policy included. So the trust could not be fixed from inside the sandbox while the SCP was attached. The interim was route C: the management account lifts SCP `<SCP policy ID>` for one `aws-setup.sh` run, which attaches it again. The owner chose route B: a supported, MFA-backed way to assume break-glass.

## What the docs say

All sources fetched on 2026-11-07. Quotes are verbatim.

| Question | Answer | Source |
|---|---|---|
| (a) Is `aws:MultiFactorAuthPresent` in an IAM Identity Center permission-set session? | No. A permission-set session is a federated role session, and "This condition key is not present for federated identities or requests made using access keys to sign AWS CLI, AWS API, or AWS SDK requests." For SAML, "AWS cannot determine whether that provider required MFA." The Identity Center guide itself says nothing about the key | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html; https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html |
| (b) Does a session chained from it, such as `OrganizationAccountAccessRole`'s, carry MFA? | No. "The temporary credentials returned by AssumeRole do not include MFA information in the context." A role session also has no MFA device to present: `SerialNumber` is "the MFA device that is associated with the user who is making the AssumeRole call" | id_credentials_mfa_configure-api-require.html; https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html |
| (c) Does an IAM user with MFA satisfy it, through `aws sts assume-role --serial-number --token-code` or a profile with `mfa_serial`? | Yes. It is the documented pattern: the user's AssumeRole call carries "the ID of the MFA device, and the current TOTP", and the CLI "prompts the user to enter the one-time password (OTP)" for a role profile with `mfa_serial`. No page states the key's value during trust evaluation; the scenarios rely on it | id_credentials_mfa_configure-api-require.html; https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html |

**The inference is confirmed, with one correction.** The record said "the chained session does not carry the MFA flag". The docs say no session in that chain ever had it: the first link is federated, so the key is absent, and an AssumeRole session carries no MFA context. No principal the owner had could satisfy the trust. Only an IAM user can.

## Three more findings

| # | Finding | Evidence | What this batch does |
|---|---|---|---|
| 1 | The account-root trust was weaker than it looked. "Any identity in the trusted account that has permission to create virtual MFA devices can construct an MFA claim to satisfy that part of your role's trust policy." `OrganizationAccountAccessRole` has administrator rights and IAM users are not in the SCP, so a sandbox admin could have created a user, given it a virtual MFA device and assumed break-glass. That would have raised the alarm, if the alarm worked (finding 2) | id_credentials_mfa_configure-api-require.html | Break-glass trusts only the break-glass user's ARN. The SCP covers every user and MFA device under `/who-gets-the-keys/` |
| 2 | **The break-glass alarm has never matched an assumption.** CloudTrail logs AssumeRole with `readOnly: true`, "even though they are logged as read-only". "A rule in the default ENABLED state does not match read-only management events, so its targets are not invoked." The rule on `main` is in state `ENABLED` | https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-integration.html; https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html | The rule moves to `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS` |
| 3 | The alarm also needs a trail, and sees only its own Region. "To record events with one of the CloudTrail detail-type values, you must enable a CloudTrail trail with logging." Calls to a regional STS endpoint "are logged in CloudTrail to their appropriate region", and AWS CLI v2 always uses the regional endpoint | eb-service-event-cloudtrail.html; https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html; https://docs.aws.amazon.com/sdkref/latest/guide/feature-sts-regionalized-endpoints.html | The trust requires `aws:RequestedRegion` = `us-east-1`, the rule's Region. Whether the account has a logging trail is an open owner check (below) |

Finding 2 means practice P34, "Break-glass is separate and alarmed", has not held on `main`, though the role has never been assumed. `docs/practices.md` still describes P34 as "The role and its EventBridge alarm exist". That stays true, but it does not say the alarm could not fire.

## Decision

| Part | Choice | Why |
|---|---|---|
| Principal | IAM user `who-gets-the-keys-break-glass-user` at path `/who-gets-the-keys/`. No console password, group or managed policy | The only principal type that can present MFA to STS. The path puts it under the SCP |
| Its policy | Allow `sts:AssumeRole` on break-glass with MFA and `us-east-1`. Deny every other action (`NotAction`). Deny every other role (`NotResource`) | A trust that names a user "in the same account" needs "no additional identity-based policy" (API_AssumeRole), so the Allow alone restricts nothing. The two Denies make the key good for one call whatever else grants it. `sts:GetCallerIdentity` "No permissions are required" and cannot be denied |
| Break-glass trust | That user's ARN only, with `aws:MultiFactorAuthPresent` true and `aws:RequestedRegion` `us-east-1` | Closes finding 1. The Region keeps every assumption where the alarm can see it. "Requests made to the AWS STS global endpoint have a value of us-east-1 for the aws:RequestedRegion condition key" |
| MFA device | A virtual MFA device, made by `aws-setup.sh` with `--path /who-gets-the-keys/`, its seed loaded into the YubiKey's OATH application with touch required | Terraform's `aws_iam_virtual_mfa_device` keeps `base_32_string_seed` in state "as plain-text". STS takes no FIDO2 key: "You cannot pass the MFA information for a security key or passkey to AWS STS API operations" |
| Access key | One, made by `aws-setup.sh` and written to profile `who-gets-the-keys-break-glass-user` with `aws configure set`, never printed | `aws_iam_access_key` writes `secret` "to the state file" |
| Deploy role | Reads only `GetUser`, `GetUserPolicy`, `ListUserPolicies`, `ListUserTags` on users under the path, which is what the provider's refresh calls. It cannot list the key or the MFA device. `NoIdentityWrites` adds the user and the producer role | The plan must refresh the new user. The producer entry was deferred because only break-glass can change this policy (SPEC-001-R86); this apply is that change |
| Break-glass's own grant | A second statement: read, create and delete the user, its inline policy and tags, its access keys and its MFA devices. Never a login profile | So a break-glass session can plan `infra/sandbox`, rotate the key and replace the YubiKey without lifting the SCP. It already can rewrite its own trust, so this adds no power |
| SCP | The identity-write deny covers `user/who-gets-the-keys/*` and `mfa/who-gets-the-keys/*`, and gains `Change*`, `Deactivate*`, `Enable*`, `Reset*`, `Resync*` and `Upload*`. Rendered size 2,637 of 10,240 characters | Without these, a sandbox admin could deactivate the owner's device and enable one of their own. "Maximum size of a policy document Service control policies: 10,240 characters" (https://docs.aws.amazon.com/organizations/latest/userguide/orgs_reference_limits.html) |
| Alarm | One rule, state `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`, with a top-level `$or`: AssumeRole of break-glass, or any call whose `userIdentity.arn` is the user | Every legitimate use emails once. A leaked key emails on its first call, denied calls included. `$or` with branches holding `source` plus `detail` is documented (https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-patterns-best-practices.html) |

## Alternatives weighed against "who gets the keys"

The talk's question is who holds a credential that can act, and whether the pipeline or a person proves it. Break-glass is the one deliberate exception to "the pipeline holds the keys", so its key should be something the owner physically holds and the trust policy can check.

| Option | Holds the key | Long-lived secret | Trust can check MFA | Verdict |
|---|---|---|---|---|
| A. IAM user with a YubiKey TOTP device (chosen) | The owner: the seed is on the YubiKey, the access key on the laptop | One access key, useless without a code | Yes, `aws:MultiFactorAuthPresent` | Smallest change that works in this account, with no new service |
| B. Trust the owner's Identity Center role in the sandbox, `AWSReservedSSO_<set>_<hash>`, by `aws:PrincipalArn`, with no MFA condition | Identity Center in the management account. Its MFA setting and permission-set assignments live outside the sandbox and outside the SCP | None | No: the key is absent for federated sessions. The policy must trust that sign-in required MFA | Rejected. Whoever administers Identity Center can assign that permission set to anyone, and nothing in the sandbox would show it. It also needs a permission set the owner does not have in the sandbox, and the role's suffix changes if it is provisioned again |
| C. IAM Roles Anywhere with a certificate whose private key is in the YubiKey's PIV application | The owner, with no exportable secret at all | None | No: the trust checks the certificate instead | Better on the thesis, not the smallest. It needs a CA, a trust anchor, a profile, `aws_signing_helper` with PKCS#11 and a PIN. A follow-up candidate if the access key becomes the weak point |
| D. Keep route C as the only way | The management account's administrator | None | Not applicable | Rejected as the normal path: it lifts every protection the SCP gives, not only identity writes. It stays the recovery path, because the management account can always detach an SCP |
| E. TEAM (temporary elevated access) for Identity Center | An approver workflow | None | No | The deck's example. Rejected for a one-account demo: it is an application to deploy and run |
| F. The YubiKey's FIDO2 credential on an IAM user | The owner | None | Console sign-in only | Not possible for the CLI: STS takes no security key |

**The long-lived access key this adds.** It is the repo's first long-lived AWS credential. It sits in plain text in `~/.aws/credentials` on the owner's laptop. What it can do alone: call `sts:GetCallerIdentity`, and fail at everything else, each call emailing the owner. With a code from the YubiKey, which needs a touch: assume break-glass for at most one hour, in `us-east-1`, emailing the owner. Residual risk: an attacker with the laptop and the YubiKey, or with the key file and a way to make the owner touch for a code. The owner should rotate the key every 90 days (below). Option C removes it.

## The YubiKey

| Question | Answer | Confidence |
|---|---|---|
| Does its OATH-TOTP application work for the AWS CLI? | Yes, as an AWS virtual MFA device: AWS asks for a TOTP app "that produces a six-digit OTP", and the YubiKey OATH application implements "OATH-TOTP (standard RFC6238)" with the defaults SHA1, 6 digits, 30 s. No Yubico or AWS page names the pairing | Inference, medium-high. `enable-mfa-device` accepting two codes from it proves it, in step 5 of `aws-setup.sh` |
| Register it as an authenticator app or as a hardware TOTP token? | Authenticator app. AWS hardware tokens from other sources "will not function with IAM" | Documented (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html) |
| Does the owner's YubiKey have the OATH application? | Unknown. Decision 0003 records that the owner's FIDO2 key refused `verify-required`. Run `ykman info`: OATH must be listed as enabled. If it is not, any RFC 6238 authenticator app works, at the cost of the key being on a phone | Not verified |
| Commands | `ykman oath accounts add --touch --issuer AWS who-gets-the-keys-break-glass-user "$(cat <seed file>)"`, then `ykman oath accounts code --single who-gets-the-keys-break-glass-user` for each code | Documented (https://docs.yubico.com/software/yubikey/tools/ykman/OATH_Commands.html) |
| Backups | IAM users "can register up to eight MFA devices of any type". A second YubiKey can be added later as break-glass, from the same seed at enrollment or as a second device | Documented |

The seed passes through `ykman`'s command line for a moment, where another process of the same user could read it. The access key's secret passes through `aws configure set`'s command line the same way, for the same moment. The seed file is mode 600 in the run's private temporary directory and is deleted when the step ends.

## Bootstrapping: route C one last time

Every change this batch makes to break-glass, its policy and the deploy role is one the SCP keeps for break-glass, and break-glass cannot be assumed until the change is in. Planning `infra/sandbox` as break-glass also needs `iam:GetUser` on the new user, which only this change grants. So the first apply needs the SCP lifted once more. On a fresh account the same step runs with no SCP yet, so there is one code path.

`proposals/producer-fixes` landed on 2026-11-07, and its route C run is done, so this batch needs a route C run of its own. A staged alternative that never lifts the SCP was weighed and not taken: it needs a separate Terraform root for the user, or targeted and refresh-free applies, plus a change to the iac check (SPEC-001-R8). That is more surface for a one-time step.

## Operating it

| Task | How | Lifts the SCP |
|---|---|---|
| Check access | `aws sts get-caller-identity --profile who-gets-the-keys-break-glass`, a code from the YubiKey. Emails the alert | No |
| Apply `infra/sandbox` as break-glass | The commands `scripts/bootstrap/aws.sh` prints in its step 4: the CLI asks for the code, and `aws configure export-credentials` hands the role's credentials to Terraform in a subshell. The AWS provider docs have no MFA prompt setting; they support `credential_process` | No |
| Rotate the access key, every 90 days | As break-glass: `aws iam create-access-key --user-name who-gets-the-keys-break-glass-user`, update profile `who-gets-the-keys-break-glass-user` with `aws configure set`, check access, then `aws iam delete-access-key` for the old key | No |
| Replace the YubiKey while the old one works | As break-glass: `aws iam create-virtual-mfa-device --path /who-gets-the-keys/` with a new name, `enable-mfa-device`, then `deactivate-mfa-device` and `delete-virtual-mfa-device` for the old one, and set `mfa_serial` in the profile | No |
| Lost YubiKey, or lost key file on a new computer | Lift the SCP and rerun `aws-setup.sh`. Step 5 offers to replace a key this computer does not hold. For a lost YubiKey, first deactivate its device as the sandbox admin | Yes, route C |

## Not verified

1. That the account has a CloudTrail trail logging management events. Without one, no alarm email arrives, before or after this change. Check in the owner steps.
2. That an organization trail in the management account, if that is the only trail, delivers to the sandbox account's default event bus. The CloudTrail and EventBridge pages do not say.
3. That `aws configure export-credentials` reuses the role credentials the CLI cached in `~/.aws/cli/cache`, so the second code prompt does not appear. Either way it works; the owner enters one more code at most.
4. That the provider retries `UpdateAssumeRolePolicy` while IAM propagates the newly made user. If the apply fails with "Invalid principal in policy", run `aws-setup.sh` again: its plan then holds only that change.
5. The YubiKey row above.

## Owner decisions open

| # | Decision | Recommendation |
|---|---|---|
| 1 | If the account has no logging trail: add a single-Region management-events trail to `infra/sandbox` in a follow-up batch, or rely on an organization trail | A trail in `infra/sandbox`, so the alarm's dependency is in the same plan. The first copy of management events has no CloudTrail charge; check current pricing before deciding |
| 2 | Role session length: 3600 s now | Keep. A shorter `duration_seconds` in the profile is the owner's choice per use |
| 3 | Option C, IAM Roles Anywhere with the YubiKey's PIV application, to remove the access key | Revisit after the talk |

## Docs to update once this lands

- README, "Who holds which keys": add the break-glass user; the break-glass role "cannot be assumed by anyone but that user, with MFA".
- README, "Tool choices": the break-glass row.
- `practices.yaml` P34's note, and so `docs/practices.md`, if finding 2 should be visible there.
