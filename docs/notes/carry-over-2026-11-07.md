# Carry-over from the 2026-11-06 and 2026-11-07 session

Items that existed only in that session's conversation. Next steps are in `docs/notes/tracer-2.md`.

## State at the end of the session

- `main` is at `dd4d261` (the signed AWS setup landing). `candidate/tracer-2-plan` holds this note and the Tracer 2 plan, not yet on `main`.
- The AWS sandbox is set up in member account 462701644281, with the SCP `who-gets-the-keys-sandbox-writes` attached to that account only. The management account is 417764041678.
- The first deploy through OIDC succeeded: run 42325449980, attempt 2. Terraform planned no changes.
- The owner's CLI profiles are `org-management` (management account) and `wgtk-sandbox-admin` (sandbox, through `OrganizationAccountAccessRole`).

## Observed, not yet recorded in `docs/verification.md`

- A run's `vars` context did not see repository variables created after the run started, even though the deploy was approved later. Re-running the failed job (attempt 2) did see them. Inference: variables are fixed per run attempt. GitHub's docs do not say. Record it with Phase 1's round-2 commit.
- The rows marked "pending owner run (aws-setup)" can be marked observed: the owner's run on 2026-11-07 created 23 sandbox resources and 2 org resources and set 4 repository variables.

## Backlog

| Item | Notes |
|---|---|
| `land.sh` failure message | After a rejected deploy it says "main's run did not pass ... fix the problem in a new commit on top". That is misleading when the only failure is a rejected deployment |
| README check table | Lists the deploy-time checks attestation and irreversible, but not deploy-tip |
| Rename the `ratchet` check | To `mutation-floor`. The name collides with the open-source tool sethvargo/ratchet. Deferred by the owner |
| Dependabot alerts | GitHub reports 6 moderate alerts on `main`, while the `sca` check (OSV-Scanner) passes. Find out whether they are covered by `specs/sca-exceptions.toml` or missing from OSV |
| Decision 0006 | 28 owner decisions are open. The first three are where the validator runs, its model endpoint, and whether a failed model call fails closed |
| Roadmap page | The shared roadmap page still shows the full-breadth estimate of 6 to 10 weeks. Tracer 2 replaces it |

## Touch ID as an approver key (research, 2026-11-06)

- macOS ships `/usr/lib/ssh-keychain.dylib`, which lets OpenSSH use Secure Enclave keys. The key is created with `sc_auth create-ctk-identity -l ssh -k p-256-ne -t bio` and downloaded with `ssh-keygen -w /usr/lib/ssh-keychain.dylib -K`. Apple publishes no release note for it; reports place it in macOS 15 or 26.
- Its public key type is `sk-ecdsa-sha2-nistp256@openssh.com`, which the signatures check accepts. Secretive, 1Password and similar tools make plain key types, which the check rejects.
- One report (y.mo.la, 2026-10-28) says Touch ID signatures carry user presence (0x01) but not user verification (0x04). So it would not allow raising `REQUIRED_SIGNATURE_FLAGS` to 0x05. Not verified on the owner's Mac.
- Apple provides no attestation for these keys, and the key is lost with the Mac.
- Recommendation: add it as a second line under the same principal and keep the YubiKey as backup. That commit must be signed with the YubiKey. Probe first with `scripts/bootstrap/rotate-approver-key.sh`, using `KEY_FILE` for the downloaded handle, `SSH_KEYGEN=/usr/bin/ssh-keygen`, `SSH_SK_PROVIDER=/usr/lib/ssh-keychain.dylib` and `APPEND=1`, and answer no at the last question. It prints the signature's flags.
- Repo changes if adopted: `approvers.txt`, the "approver" term in SPEC-001, an owner decision in 0003, and the "one line per approver" wording in `approvers.txt.example`.
