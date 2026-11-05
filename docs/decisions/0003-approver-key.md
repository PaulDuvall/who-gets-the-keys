# 0003. Approver signatures need a security key and a touch

- Status: Proposed
- Date: 2026-11-04
- Amended: 2026-11-05, by the owner decision "Touch-only for now" (below). A PIN is not required for now
- Requirements: SPEC-001-R12, amended; SPEC-001-R39, new
- Follows: the "Related finding" in `docs/decisions/0002-agent-receipt.md`

## Context

The human gate for `specs/`, `approvers.txt` and every protected path is an approver-signed commit (SPEC-001-R12). The agent must never be able to make one.

| Finding | Evidence |
|---|---|
| `approvers.txt` holds one plain `ssh-ed25519` key | `approvers.txt` |
| With that key in ssh-agent, any process of the same user gets a signature with no prompt. That includes a local Claude Code session's shell | OpenSSH `ssh-agent.c` checks only the caller's user ID; `ssh-keygen -Y sign` uses the agent whenever it holds the key |
| The deny rules miss `git -c x=y commit -S`, `git commit-tree -S`, `GIT_CONFIG_*` overrides and any script the agent writes | `.claude/settings.json`; Claude Code's permission docs say a Bash rule "isn't a security boundary" |
| Cloud sessions are not exposed | They have no approver key |

The laptop route is inferred from OpenSSH's source and the deny rules. It has not been tried.

## Owner decision, 2026-11-05: touch only for now

The owner decided: "Touch-only for now". Until the owner has a security key that supports `verify-required`, the approver check requires the touch flag (user presence, 0x01) only.

| Item | Detail |
|---|---|
| Symptom | The owner's FIDO2 security key refused every enrollment with `-O verify-required`, for both `ed25519-sk` and `ecdsa-sk`. Homebrew OpenSSH on macOS printed `Key enrollment failed: requested feature not supported` |
| The key's PIN | A FIDO2 PIN is already set: `fido2-token -S` returned `FIDO_ERR_NOT_ALLOWED` |
| Probable cause, an inference, not verified | The key lacks the CTAP 2.1 `credProtect` extension, which OpenSSH uses for `verify-required`. Both key types failing points there, rather than at the algorithm |
| What OpenSSH's source shows | `sk-usbhid.c` refuses to create a `verify-required` or resident key on a device without `credProtect`. `ssh-sk.c` and `ssherr.c` turn that refusal into "requested feature not supported". The same message also follows a libfido2 older than 1.5.0, or a device that refuses an option or algorithm |
| What changes | Check `signatures` requires the touch flag only. The rotation script makes `-O verify-required` opt-in (`VERIFY_REQUIRED=1`) and takes `KEY_TYPE`: `ed25519-sk` by default, `ecdsa-sk` as the fallback |
| Risk accepted | Whoever holds the security key and can use the Mac, where the key handle file lives, can sign with a touch and no PIN. An agent-started signing prompt also needs only a touch to complete |
| What stays | The touch is asserted by the authenticator. A signature made without one carries no touch flag, and the check refuses it |
| Until | The owner has a key that supports `credProtect`. "Tightening to touch and PIN later" below lists the steps |

## What changes

| Layer | What it does | What it cannot do |
|---|---|---|
| **The control:** the approver's private key lives on a FIDO2 security key | No signature without a touch passes check `signatures`. A process that can reach the plugged-in key and its handle file can still get one without a touch, and only the check refuses it. With `VERIFY_REQUIRED=1`, the authenticator also enforces the PIN for this credential (CTAP 2.1 `credProtect`). Touch only for now, per the owner decision of 2026-11-05 | Stop the approver from touching the key for a prompt the agent started |
| The `signatures` check reads each approver signature's flags | Fails when a security-key signature lacks a touch (0x01), and fails closed on any key type it does not recognise. It reads only the signature `git verify-commit` checks. `REQUIRED_SIGNATURE_FLAGS` set to 0x05 would also require a PIN (0x04). This catches an approver key created with `no-touch-required` | Prove a key lives on hardware. Whoever holds a private key chooses its flags, so a software key published under an `sk-` type passes |
| The `signatures` check reads `approvers.txt` at HEAD | Fails while it lists any key that is not a security-key type, such as a software key added by mistake | The same: a key type is a label, not proof |
| Broader deny rules and a PreToolUse `no-sign` hook | Block and log the signing commands an agent would normally write | Stop a script the agent writes and runs |

### What the check can and cannot prove

`ssh-keygen -Y verify`, and so `git verify-commit`, checks only the signature, the key and its namespace. It does not require a touch or a PIN, and an allowed-signers file has no option that would (`sshsig.c` accepts only `cert-authority`, `namespaces`, `valid-after` and `valid-before`). The flags are inside the signed data, so they cannot be changed without breaking the signature. The check therefore parses each approver signature (OpenSSH `PROTOCOL.sshsig` and `PROTOCOL.u2f`) and requires the touch flag. It requires the PIN flag too once `REQUIRED_SIGNATURE_FLAGS` includes it.

The check must read the same signature git verifies. A commit object can carry a second signature header, and in a SHA-1 repository `git verify-commit` checks only `gpgsig`. It leaves `gpgsig-sha256` out of the signed payload. A review put an earlier commit's touch-flagged signature in a `gpgsig-sha256` header before a no-touch `gpgsig`. The check read the decoy's flags and passed. It now reads only the header git verifies: `gpgsig`, or `gpgsig-sha256` in a SHA-256 repository. It fails closed when a commit has more than one header starting with `gpgsig`, or a signature that is not an SSH signature. git hands an OpenPGP signature to gpg whatever `gpg.format` says, so a key in a local gpg keyring passes `git verify-commit`. Behind the same decoy, that signature passed the check too. It now fails closed.

That proves the holder of the approver key asserted a touch. It proves nothing about where the key lives: a review built a software key typed `sk-ssh-ed25519@openssh.com`, signed with flags 0x05, and passed the check. The only thing that stops the agent is that the approver's private key is on a device the agent cannot use, and that `approvers.txt` lists only that key. Changing `approvers.txt` needs an approver signature, so after the rotation the agent cannot add a key of its own.

A green "Verified" on GitHub does not prove a touch either. GitHub reports `openssh-portable` commits whose security-key signatures carry flags `0x00` as verified.

### The rotation window

Until the rotation commit is pushed, the old software key can still approve. An agent session that reached it could sign an `approvers.txt` change adding a key of its own, and that key would then pass every check. The owner steps close the window: no Claude Code session runs from the start of the rotation until the old key is out of ssh-agent. Before rotating, the owner reviews every past change to `approvers.txt`; after it, the owner confirms the file holds only the new key.

## Decisions

| # | Decision |
|---|---|
| 1 | The approver key is `ed25519-sk`, or `ecdsa-sk` if the device lacks Ed25519 (`KEY_TYPE`), created with `-O application=ssh:who-gets-the-keys`. `-O verify-required` is opt-in (`VERIFY_REQUIRED=1`) until the owner has a key that supports it, per the owner decision of 2026-11-05. The rotation script turns it on by default, and refuses `VERIFY_REQUIRED=0`, once `REQUIRED_SIGNATURE_FLAGS` requires a PIN. A backup key on a second device may be a second line |
| 2 | Check `signatures` fails with `approver signature without touch: <first 12 characters of the SHA>` when a security-key signature (`sk-` or `webauthn-sk-`) lacks the touch flag. It fails the same way when a signature's key type is neither of the two security-key types nor a plain software key. It also fails that way when a commit has more than one header starting with `gpgsig`, or a signature that is not SSH. It reads the flags from the one header `git verify-commit` checks. The required flags are `REQUIRED_SIGNATURE_FLAGS` in `scripts/checks.ts` as of each commit's parent, always with the touch flag. The constant is 0x01, touch only for now, per the owner decision of 2026-11-05. Setting it to 0x05 restores touch and PIN for later commits, and the identifier then reads `approver signature without touch and PIN: <first 12 characters of the SHA>` |
| 3 | Check `signatures` fails with `approver key is not a security key: <principal>` while `approvers.txt` at HEAD lists any other key type. Lines are read by position, as `sshsig.c` reads them |
| 4 | One commit carries the new `approvers.txt` and the code, signed with the old key. `approvers.txt` as of a commit's parent decides who may sign it, and `main` never has the new rule without the new key |
| 5 | Deny rules and the `no-sign` hook (SPEC-001-R39) are tripwires. The hook ignores commit messages (`-m` arguments and a `git commit -F -` heredoc), so a message that mentions signing is not blocked. It logs each block to `.claude/security-events.log` |
| 6 | Node.js built-ins only. No new dependency |

## Proposals

Every file is staged under `proposals/`, so one signed commit lands the whole change. `proposals/infra/` and `proposals/scripts/bootstrap/aws.sh` belong to the earlier OIDC change (D25) and are not part of this one.

| Proposal | Moves to | Protected | What |
|---|---|---|---|
| `proposals/SPEC-001-delivery-pipeline.md` | `specs/SPEC-001-delivery-pipeline.md` | yes | The "approver" term, two new identifiers in R12, and R39 for the `no-sign` hook |
| `proposals/scripts/checks.ts` | `scripts/checks.ts` | yes | `approverKeys`, `commitSignature`, `sshSignature`, `REQUIRED_SIGNATURE_FLAGS`, `lacksRequiredFlags`, `flagWords`, `requiredFlagsIn`; two new failures in `signatures` |
| `proposals/claude-hooks/hook.mjs` | `.claude/hooks/hook.mjs` | yes | The `no-sign` hook |
| `proposals/claude-settings.json` | `.claude/settings.json` | yes | 15 more deny rules; registers `no-sign` |
| `proposals/scripts/bootstrap/rotate-approver-key.sh` | `scripts/bootstrap/rotate-approver-key.sh` | yes | Creates the key (`KEY_TYPE`; `-O verify-required` with `VERIFY_REQUIRED=1`, the default once `REQUIRED_SIGNATURE_FLAGS` requires a PIN), proves a test signature carries the required flags, writes `approvers.txt` |
| `proposals/CLAUDE.proposed.md` | `CLAUDE.md` | yes | The rotation script in the file map |
| `proposals/test/signatures.test.ts` | `test/signatures.test.ts` | no | 9 tests, named SPEC-001-R12 |
| `proposals/test/hook.test.ts` | `test/hook.test.ts` | no | 2 tests, named SPEC-001-R39: 29 commands blocked, 17 allowed |
| `proposals/approvers.txt.example` | `approvers.txt.example` | no | A security-key example line |
| `proposals/docs/lockdown-check.md` | `docs/lockdown-check.md` | no | Rows 19 to 25 for signing |
| `proposals/traceability.md` | `traceability.md` | no | `test/signatures.test.ts` for R12, and a row for R39 |
| `proposals/README.proposed.md` | `README.md` | no | The `signatures` row, the OpenSSH prerequisite and the approver's row |

The tests sign with a software Ed25519 key published as `sk-ssh-ed25519@openssh.com`. That lets a test choose the flags a real authenticator would assert, and `ssh-keygen` verifies those signatures as it verifies hardware-made ones. CI needs no security key. The same technique is why decision 2 cannot prove hardware.

## Owner steps

On the approver's Mac, with the security key plugged in. Close every Claude Code session first, and keep them closed until step 4 of the script's output.

macOS's own OpenSSH has no built-in security-key support, so the script refuses `/usr/bin/ssh-keygen`.

```bash
brew install openssh
```

Homebrew's `ssh` now comes before Apple's on `PATH`, and git uses it for SSH remotes. If `~/.ssh/config` sets `UseKeychain`, add `IgnoreUnknown UseKeychain` on the line above it first, or `git pull` and `git push` stop with `Bad configuration option: usekeychain`. If the old signing key's passphrase is kept only in the macOS keychain, load it into ssh-agent before the rotation commit:

```bash
/usr/bin/ssh-add --apple-load-keychain
```

```bash
cd ~/Code/who-gets-the-keys
```

```bash
git pull --ff-only origin main
```

Review every change ever made to `approvers.txt`. Each one should be yours:

```bash
git log -p --format='%h %an %ad %s' -- approvers.txt
```

```bash
git mv -f proposals/SPEC-001-delivery-pipeline.md specs/SPEC-001-delivery-pipeline.md
```

```bash
git mv -f proposals/scripts/checks.ts scripts/checks.ts
```

```bash
git mv -f proposals/claude-hooks/hook.mjs .claude/hooks/hook.mjs
```

```bash
git mv -f proposals/claude-settings.json .claude/settings.json
```

```bash
git mv proposals/scripts/bootstrap/rotate-approver-key.sh scripts/bootstrap/rotate-approver-key.sh
```

```bash
git mv -f proposals/CLAUDE.proposed.md CLAUDE.md
```

```bash
git mv proposals/test/signatures.test.ts test/signatures.test.ts
```

```bash
git mv proposals/test/hook.test.ts test/hook.test.ts
```

```bash
git mv -f proposals/approvers.txt.example approvers.txt.example
```

```bash
git mv -f proposals/docs/lockdown-check.md docs/lockdown-check.md
```

```bash
git mv -f proposals/traceability.md traceability.md
```

```bash
git mv -f proposals/README.proposed.md README.md
```

```bash
scripts/bootstrap/rotate-approver-key.sh
```

If creating the key fails with `requested feature not supported`, the key may lack Ed25519. Run the script again with the ECDSA fallback:

```bash
KEY_TYPE=ecdsa-sk scripts/bootstrap/rotate-approver-key.sh
```

The script creates the key, signs a test message, verifies it, requires the touch flag and writes `approvers.txt`. Only a touch is asked for: touch the key when it blinks. `ssh-keygen` may still ask for the key's PIN while it creates the key, because some keys need it to enroll. Signatures do not ask for it. Leave `VERIFY_REQUIRED` unset for now. `VERIFY_REQUIRED=1` asks for a touch and the PIN, and needs a key that supports `credProtect`.

For a backup key, plug in the second device and run it again before committing, with `KEY_FILE=~/.ssh/id_ed25519_sk_approver_backup APPEND=1`. Add the same `KEY_TYPE` if the first key needed it. It then prints the remaining commands:

1. Stage `approvers.txt`, commit signed with the old key with `Spec:` trailers for R12 and R39, check `git show HEAD:approvers.txt`, run `npm run checks` and push.
2. Point this repository's git at the security key.
3. Refresh `gh`'s scopes and add the new key to GitHub as a signing key.
4. Remove the old key from ssh-agent and move its file to offline storage.

## Verified before proposing, 2026-11-04

| Check | Result |
|---|---|
| The 7 new tests, in a scratch worktree with the proposals in place | pass, against `ssh-keygen` from OpenSSH 9.6 |
| Full Vitest suite | 97 tests in 8 files pass |
| `lint`, `typecheck`, `trace`, `slides`, `secrets`, `allowlist`, `workflows`, `sast` | pass |
| `signatures` | fails with `approver key is not a security key: 1619259+PaulDuvall@users.noreply.github.com`, as designed, until `approvers.txt` holds the security key |
| Scenario patches B1 to B18 | all 17 still apply |
| The 12 `git mv` owner steps, run in a scratch worktree | all succeed; then lint, typecheck, trace and slides pass and all 97 tests pass, with R39 named by the hook tests |
| Scenarios end to end | not run: they need the approver-signed rotation commit on `main` first |
| An adversarial review | 14 findings, all applied: the scope of the check (above), WebAuthn signatures, hook false positives, the rewrite limit, Homebrew and keychain steps, the backup key, and smaller corrections |

## Verified after the owner decision, 2026-11-05

| Check | Result |
|---|---|
| A scratch worktree from `origin/main` at `3224687`: this amendment with the review fixes, then 0003's 12 moves, Phase 0's 9 moves and slice 1's moves, one unsigned commit each | All moves succeed. The Phase 0 and slice 1 diffs leave R12 and the signature code unchanged |
| Full Vitest suite after all three batches | 115 tests in 10 files pass, against `ssh-keygen` from OpenSSH 9.6 and git 2.43 |
| After 0003 alone, then after Phase 0 | 101 tests in 8 files, then 109 tests in 9 files. Lint, typecheck, trace and slides pass at both |
| The 9 tests in `test/signatures.test.ts` | Pass. A touch passes, and so does touch with PIN; PIN without touch, no flags and unknown key types fail. One test raises the constant to 0x05 and shows that only later commits need the PIN |
| The constant changed to 0x05 and nothing else, after 0003 and after slice 1 | The 9 tests pass, and the full suite passes: 101 tests, then 115 |
| Three edits to the flag logic: no touch floor, unknown `sk-` types accepted, and the HEAD constant instead of the parent's | Each one fails at least one of the 9 tests |
| A no-touch `gpgsig` behind a touch-flagged `gpgsig-sha256` decoy, and an OpenPGP `gpgsig` from a local gpg key behind the same decoy | Before the fix, check `signatures` passed both. Now each fails with `approver signature without touch: <first 12 characters of the SHA>` |
| Four edits to `commitSignature`: the first `gpgsig` or `gpgsig-sha256` header, no count of `gpgsig` headers, no SSH armour check, and no object format | Each one fails the decoy test |
| `secrets`, `allowlist`, `workflows`, `lint`, `typecheck`, `trace`, `slides`, `sast` after all three batches | pass |
| `signatures` in that worktree | Fails with `unsigned change to specs/`, as expected for unsigned scratch commits |
| The rotation script end to end, with a stand-in `ssh-keygen` that signs with flags 0, 1, 4 and 5 | At 0x01 it passes 1 and 5, and with `VERIFY_REQUIRED=1` only 5. At 0x05 it adds `-O verify-required` by default and passes only 5. It refuses `VERIFY_REQUIRED=0` |
| The rotation script when creating the key fails, with `KEY_TYPE=ecdsa-sk` and no other option | It names a libfido2 older than 1.5.0 or a refused algorithm or option, and `fido2-token -I` |
| `bash -n` on both copies of `rotate-approver-key.sh` | pass |
| Scenario patches B1 to B18 | All 17 still apply |
| A review of this amendment | 6 findings, all applied: the decoy header, tests and R12 written against the constant, the rotation script following it, the empty failure hint, two overstated touch claims, and two long table cells |
| The rotation script on a real security key | Not run: the agent has none. The owner's first run settles it |

## Options considered

| Option | Verdict |
|---|---|
| A security key without `verify-required` | Accepted for now, by the owner decision of 2026-11-05, because the owner's key cannot enroll with it. The touch is requested by the host software (`ssh-keygen`), so a process holding the key handle can ask for a signature without one. The authenticator then asserts no touch flag, and the check rejects it. What is lost is the PIN, so the device and the Mac together can sign with a touch alone |
| A security key that supports `credProtect`, with `verify-required` | Later. It restores touch and PIN; see "Tightening to touch and PIN later" |
| Keep the plain software key until then | Rejected. It signs with no touch and no prompt, the finding this decision fixes |
| FIDO attestation (`-O write-attestation`), checked against the vendor's root | Not now. It would prove at enrolment that the key was made on hardware, which the flags cannot. It needs X.509 and CBOR parsing that Node.js built-ins do not provide |
| A passphrase key kept out of ssh-agent | Rejected. Whether the agent's shell can reach the approver's terminal or an askpass dialog is unverified |
| `ssh-add -c`, confirm each use | Rejected. The dialog does not say what is being signed, and macOS needs a third-party askpass program |
| `ssh-add -h`, destination constraints | Rejected. It stops git signing for everyone, the approver included |
| Claude Code's sandbox, blocking the ssh-agent socket | Not now. It is off by default and covers shell commands only, and its default for Unix sockets is unverified. It can still be added |
| GitHub ruleset "require signed commits" | Rejected. It accepts any key GitHub verifies, not only approvers', and would block the agent's unsigned commits |

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Resident key | Store the key on the security key too (`RESIDENT=1`), so a new machine can fetch it with `ssh-keygen -K`; or keep the handle file only | The handle file only, for now, with a copy kept offline. OpenSSH refuses a resident key on a device without `credProtect` (`sk-usbhid.c`), so `RESIDENT=1` probably fails on the owner's key too. Resident once the key supports it |
| A backup approver key | One security key; or a second device, added with `APPEND=1` before the rotation commit | A backup. One lost key otherwise leaves no approver |
| Claude Code sandbox | Enable it in `.claude/settings.json` with the ssh-agent socket blocked; or leave it off | Leave it off until its socket default is confirmed |

## Limits

| Limit | Note |
|---|---|
| The approver touching the key for a prompt the agent started | Without a PIN, one touch completes it. Never touch the key for a prompt you did not start, and unplug it when you are not signing |
| Touch only, no PIN, for now | A stolen security key, together with access to the Mac that holds its key handle file, can sign with a touch and no PIN. Owner decision of 2026-11-05; see "Tightening to touch and PIN later" |
| The check cannot tell a hardware key from a software key typed `sk-` | The approver keeps `approvers.txt` to keys on devices they hold |
| The rule binds approver commits after the rotation | Earlier commits were signed by the software key and stay valid |
| `scripts/bootstrap/rewrite-history.ts` signs every signed commit with one key and checks only against the tip's `approvers.txt` | After the rotation it cannot run unchanged: commits up to and including the rotation are judged by the old key, later ones by the security key. Keep the old key file offline, not deleted |
| Homebrew OpenSSH cannot read passphrases stored in the macOS keychain | It also affects git's SSH remotes and the old key's signature in step 1; the owner steps cover both |
| Malware that has the device and the approver's touch, and the PIN once one is required | Out of scope |

## Not yet verified

| Item | How to settle it |
|---|---|
| GitHub shows `sk-ssh-ed25519` signatures as Verified | Observed only for `sk-ecdsa-sha2-nistp256`. The first approver commit signed with the security key settles it: check its badge, or `gh api repos/PaulDuvall/who-gets-the-keys/commits/<sha> --jq .commit.verification.verified` |
| Whether the owner's security key supports Ed25519 | The first run of the rotation script. If `ed25519-sk` fails with `requested feature not supported` and `KEY_TYPE=ecdsa-sk` works, it does not |
| Whether the owner's security key supports `credProtect`, the probable cause of the enrollment failure | Run `fido2-token -L`, then `fido2-token -I` on the device it lists, and look for `credProtect` among its extensions. That output format is expected, not checked here |
| Whether a Claude Code Bash command on macOS can open the approver's terminal for a PIN prompt, once a PIN is required | Lockdown row 25, in a local session |
| Claude Code sandbox default for the ssh-agent socket | Before enabling the sandbox |
| `gh ssh-key add --type signing` needs the `admin:ssh_signing_key` scope | Step 3 refreshes it first; a scope error would name the right one |

## Tightening to touch and PIN later

The code change is one constant, `REQUIRED_SIGNATURE_FLAGS` in `scripts/checks.ts`, from 0x01 to 0x05. It is a protected path, so the change needs an approver signature. The check reads the constant as of each commit's parent, as it reads `approvers.txt`. Earlier touch-only commits stay valid, and only later commits need the PIN. No test or spec text changes with it: the R12 tests are written against the constant, and R12 names the constant, not its value. The rotation script reads the constant too, so its next key asks for a PIN by default.

1. Get a security key that supports `credProtect`, and check it as "Not yet verified" describes.
2. Run the rotation script with `VERIFY_REQUIRED=1` and a new `KEY_FILE`, adding `KEY_TYPE=ecdsa-sk` if Ed25519 is unsupported. It proves the test signature carries a touch and a PIN.
3. Make one commit, signed with the current approver key and its touch. It holds the new `approvers.txt` and the constant at 0x05, and nothing else.
4. Run `npm run checks`. Approver commits after that one then need a touch and a PIN.

Keep the new key and the constant in one commit. Raising the constant while `approvers.txt` still lists only the touch-only key leaves no key that can sign the next approver commit.

The "touch only for now" notes in `README.md`, decisions 0002 to 0004, `docs/lockdown-check.md` and `approvers.txt.example` are not protected. Correct them in a later unsigned commit. The comment in `.claude/hooks/hook.mjs` says the same, is protected, and can wait for the next signed change to that file.

## Sources

| Source | Checked |
|---|---|
| https://man.openbsd.org/ssh-keygen.1 | 2026-11-04 |
| https://www.openssh.org/releasenotes.html | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/PROTOCOL.u2f | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/PROTOCOL.sshsig | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/ssh-keygen.c | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/sshsig.c | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/sk-usbhid.c | 2026-11-04, 2026-11-05 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/ssh-sk.c | 2026-11-05 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/ssherr.c | 2026-11-05 |
| https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html | 2026-11-04 |
| https://developers.yubico.com/SSH/Securing_SSH_with_FIDO2.html | 2026-11-04 |
| https://git-scm.com/docs/git-config | 2026-11-04 |
| https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification | 2026-11-04 |
| https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account | 2026-11-04 |
| https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent | 2026-11-04 |
| https://code.claude.com/docs/en/permissions | 2026-11-04 |
| https://code.claude.com/docs/en/hooks | 2026-11-04 |
| https://code.claude.com/docs/en/sandboxing | 2026-11-04 |
