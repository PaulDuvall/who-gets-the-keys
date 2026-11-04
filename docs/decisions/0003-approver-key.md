# 0003. Approver signatures need a security key, a touch and a PIN

- Status: Proposed
- Date: 2026-11-04
- Requirements: SPEC-001-R12, amended
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

## What changes

| Layer | Stops | Does not stop |
|---|---|---|
| The approver key is a FIDO2 security key created with `verify-required` | Any signature without the approver's PIN and touch. The authenticator enforces the PIN for this credential (CTAP 2.1 `credProtect`) | The approver entering the PIN for a prompt the agent started |
| The `signatures` check reads each approver signature's flags and requires a touch (0x01) and a PIN (0x04); `approvers.txt` at HEAD may hold only security keys | A software key, or a security key without a PIN, approving any change after the rotation | Commits before the rotation, which stay judged by `approvers.txt` as of their parent |
| Broader deny rules and a PreToolUse `no-sign` hook that blocks and logs signing commands | The commands an agent would normally write | A script the agent writes and runs |

### Why the check reads the flags itself

`ssh-keygen -Y verify`, and so `git verify-commit`, checks only the signature, the key and its namespace. It does not require a touch or a PIN, and an allowed-signers file has no option that would (`sshsig.c` accepts only `cert-authority`, `namespaces`, `valid-after` and `valid-before`). The flags are inside the signed data, though, so they cannot be changed without breaking the signature. The check therefore parses each approver signature (OpenSSH `PROTOCOL.sshsig` and `PROTOCOL.u2f`) and requires both flags.

A green "Verified" on GitHub does not prove a touch either. GitHub reports `openssh-portable` commits whose security-key signatures carry flags `0x00` as verified.

## Decisions

| # | Decision |
|---|---|
| 1 | The approver key is `ed25519-sk`, created with `-O verify-required` and `-O application=ssh:who-gets-the-keys` |
| 2 | Check `signatures` fails with `approver signature without touch and PIN: <first 12 characters of the SHA>` when a security-key signature lacks either flag |
| 3 | Check `signatures` fails with `approver key is not a security key: <principal>` while `approvers.txt` at HEAD holds any other key type |
| 4 | One commit carries the new `approvers.txt` and the code, signed with the old key. `approvers.txt` as of a commit's parent decides who may sign it, and `main` never has the new rule without the new key |
| 5 | Deny rules and the `no-sign` hook are tripwires. They log to `.claude/security-events.log` |
| 6 | Node.js built-ins only. No new dependency |

## Proposals

Every protected file is staged under `proposals/`. The other three go with them, so one signed commit lands the whole change.

| Proposal | Moves to | Protected | What |
|---|---|---|---|
| `proposals/SPEC-001-delivery-pipeline.md` | `specs/SPEC-001-delivery-pipeline.md` | yes | The "approver" term and two new identifiers in R12 |
| `proposals/scripts/checks.ts` | `scripts/checks.ts` | yes | `approverKeys`, `commitSignature`, `sshSignature`, `lacksTouchAndPin`; two new failures in `signatures` |
| `proposals/claude-hooks/hook.mjs` | `.claude/hooks/hook.mjs` | yes | The `no-sign` hook |
| `proposals/claude-settings.json` | `.claude/settings.json` | yes | 15 more deny rules; registers `no-sign` |
| `proposals/scripts/bootstrap/rotate-approver-key.sh` | `scripts/bootstrap/rotate-approver-key.sh` | yes | Creates the key, proves a test signature carries both flags, writes `approvers.txt` |
| `proposals/test/signatures.test.ts` | `test/signatures.test.ts` | no | 5 tests, named SPEC-001-R12 |
| `proposals/test/hook.test.ts` | `test/hook.test.ts` | no | 2 tests: 23 commands blocked, 11 allowed |
| `proposals/approvers.txt.example` | `approvers.txt.example` | no | A security-key example line |
| `proposals/docs/lockdown-check.md` | `docs/lockdown-check.md` | no | Rows 19 to 25 for signing |

The tests sign with a software Ed25519 key published as `sk-ssh-ed25519@openssh.com`. That lets a test choose the flags a real authenticator would assert, and `ssh-keygen` verifies those signatures as it verifies hardware-made ones. CI needs no security key.

## Owner steps

On the approver's Mac, with the security key plugged in and a FIDO2 PIN set on it. macOS's own OpenSSH has no built-in security-key support, so the script refuses `/usr/bin/ssh-keygen`.

```bash
brew install openssh
```

```bash
cd ~/Code/who-gets-the-keys
```

```bash
git pull --ff-only origin main
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
scripts/bootstrap/rotate-approver-key.sh
```

The script creates the key, signs a test message (touch and PIN), verifies it, requires both flags and writes `approvers.txt`. It then prints the remaining commands:

1. Commit, signed with the old key, then run `npm run checks` and push.
2. Point this repository's git at the security key.
3. Add the new key to GitHub as a signing key.
4. Remove the old key from ssh-agent.

## Verified before proposing

| Check | Result |
|---|---|
| The 7 new tests, in a scratch worktree with the proposals in place | pass, against `ssh-keygen` from OpenSSH 9.6 |
| Full Vitest suite | 97 tests in 8 files pass |
| `lint`, `typecheck`, `trace`, `slides`, `secrets`, `allowlist`, `workflows`, `sast` | pass |
| `signatures` | fails with `approver key is not a security key: 1619259+PaulDuvall@users.noreply.github.com`, as designed, until `approvers.txt` holds the security key |
| Scenario patches B1 to B18 | all 17 still apply |
| Scenarios end to end | not run: they need the approver-signed rotation commit on `main` first |

## Options considered

| Option | Verdict |
|---|---|
| A security key without `verify-required` | Rejected. The touch is requested by the client, so a process holding the key handle can ask for a signature without one. The PIN is enforced by the authenticator, and the check rejects a signature lacking either flag |
| A passphrase key kept out of ssh-agent | Rejected. Whether the agent's shell can reach the approver's terminal or an askpass dialog is unverified |
| `ssh-add -c`, confirm each use | Rejected. The dialog does not say what is being signed, and macOS needs a third-party askpass program |
| `ssh-add -h`, destination constraints | Rejected. It stops git signing for everyone, the approver included |
| Claude Code's sandbox, blocking the ssh-agent socket | Not now. It is off by default and covers shell commands only, and its default for Unix sockets is unverified. It can still be added |
| GitHub ruleset "require signed commits" | Rejected. It accepts any key GitHub verifies, not only approvers', and would block the agent's unsigned commits |

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Resident key | Store the key on the security key too (`RESIDENT=1`), so a new machine can fetch it with `ssh-keygen -K`; or keep the handle file only | Resident. Losing the handle file then costs nothing |
| A second approver key | One security key; or a backup key on a second device, in `approvers.txt` as a second line | A backup. One lost key otherwise leaves no approver |
| Claude Code sandbox | Enable it in `.claude/settings.json` with the ssh-agent socket blocked; or leave it off | Leave it off until its socket default is confirmed |

## Limits

| Limit | Note |
|---|---|
| Touching the key and entering the PIN for a prompt the agent started | Never do either for a prompt you did not start |
| The rule binds approver commits after the rotation | Earlier commits were signed by the software key and stay valid |
| `scripts/bootstrap/rewrite-history.ts` re-signs every approver commit | 20 today, so 20 touches and PINs |
| Homebrew OpenSSH cannot read passphrases stored in the macOS keychain | GitHub's docs say so; it matters only for other keys |
| Malware that has both the PIN and the device | Out of scope |

## Not yet verified

| Item | How to settle it |
|---|---|
| GitHub shows `sk-ssh-ed25519` signatures as Verified | Observed only for `sk-ecdsa-sha2-nistp256`. Step 3 of the script settles it |
| Whether a Claude Code Bash command on macOS can open the approver's terminal for a PIN prompt | Lockdown row 25, in a local session |
| Claude Code sandbox default for the ssh-agent socket | Before enabling the sandbox |

## Sources

| Source | Checked |
|---|---|
| https://man.openbsd.org/ssh-keygen.1 | 2026-11-04 |
| https://www.openssh.org/releasenotes.html | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/PROTOCOL.u2f | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/PROTOCOL.sshsig | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/ssh-keygen.c | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/sshsig.c | 2026-11-04 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/sk-usbhid.c | 2026-11-04 |
| https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html | 2026-11-04 |
| https://developers.yubico.com/SSH/Securing_SSH_with_FIDO2.html | 2026-11-04 |
| https://git-scm.com/docs/git-config | 2026-11-04 |
| https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification | 2026-11-04 |
| https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account | 2026-11-04 |
| https://code.claude.com/docs/en/permissions | 2026-11-04 |
| https://code.claude.com/docs/en/hooks | 2026-11-04 |
| https://code.claude.com/docs/en/sandboxing | 2026-11-04 |
