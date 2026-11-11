# Owner tooling batch (backlog who-gets-the-keys-k7d)

Staged in `proposals/owner-tooling/` on 2026-11-11, on top of `main` at `70c1ce8`. It answers lessons L23 to L30 and L32 in `docs/notes/owner-queue-lessons-2026-11-10.md`, and adds SPEC-001-R218 to R225 in a new section, "Owner tooling". `scripts/bootstrap/` is a protected path, so the owner lands it with `land.sh` and signs it.

## What changes

| Acceptance criterion in k7d | Requirement | Where |
|---|---|---|
| `doctor.sh` checks Node.js, gh, git, the signer, one YubiKey with OATH, and the AWS profiles, each with its fix | R218 | new `scripts/bootstrap/doctor.sh`, `test/doctor.test.ts` |
| `land.sh` runs the doctor first and uses `node@<major>` | R219 | `land.sh` `run_doctor` |
| A watch that exits nonzero is checked against GitHub's record of the run | R220 | `land.sh` `watch_run` |
| `owner-apply:` in `LAND.txt` makes `land.sh` say "do not approve yet" | R221 | `land.sh`, carried as an `Owner-Apply` trailer so `--to-main` knows it too |
| `land.sh --lockfile <package>` | R222 | `land.sh` `land_lockfile` |
| A touch line before every signature, a macOS notification, and `invalid format` translated | R223 | `land.sh` `touch_cue`, `sign_commit` |
| Copy-safe `ykman` lines and a sign-in hint naming the SSO source profile | R224 | `aws-setup.sh` |
| A summary of 10 lines or fewer, with no account ID, copied to the clipboard on macOS | R225 | `land.sh` and `aws-setup.sh` `print_summary` |

New tests are in `test/doctor.test.ts` and `test/land-owner.test.ts`. The existing land tests get a `ykman` stub and a `gh run view --json status,conclusion` answer. Six of their expectations change with the new behaviour: four Node.js refusals now come from the doctor, one test reads the new touch line, and one reads the line before the summary.

## Decisions and their reasons

| Decision | Why |
|---|---|
| `land.sh` refuses when the doctor finds a gap, not only warns | The criterion is to catch the gap before the step. A warning is what the owner scrolled past in L25 to L27 |
| The macOS `ssh-keygen` check is a note, not a fix | Inference, not tested on a Mac: Apple's OpenSSH lists `sk-` key types but may need a security-key provider to sign. A false fix would block every landing, so the doctor only names the symptom and the Homebrew fix |
| The OATH check runs for `--for aws` and `all`, not `land` | Signing uses FIDO2. OATH matters only for the break-glass code |
| `owner-apply` names a script under `scripts/bootstrap/` only | `land.sh` prints it to the owner. A free-text value would be a way for a batch to put arbitrary text in front of the owner at the approval moment |
| The summary masks 12 digits that stand alone and prints SHAs as 10 characters | Account IDs appear in ARNs bounded by colons. A 12-character SHA prefix of digits only, which happened in one test run, would otherwise be masked |
| `rotate-approver-key.sh` and `refresh-slides.sh` are unchanged | They print a signing command for the owner; they do not sign. A touch line for printed commands is an owner-step rule, batch D (backlog w2h) |

## Not done, and why

- `aws-setup.sh` still refuses a Node.js outside 24.11 or later on its own, rather than finding `node@24`. The criterion names `land.sh` only. Running `aws-setup.sh` after `doctor.sh` shows the fix.
- The doctor does not refuse when the approver key and the break-glass code are on one device. That is k7d's open question; the owner decides.
- GitHub run IDs are 11 digits today. When they reach 12, the summary will mask them as `<account>`. That is acceptable: the run's URL is printed above the summary.

## Preflight

Run in a scratch worktree on `origin/main` at `70c1ce8` with the moves applied, Node.js 24.22.2, on 2026-11-11.

| Step | Result |
|---|---|
| `tsc --noEmit -p .` | passed |
| ESLint on the six changed test files | passed |
| `npx vitest run`, every test | 21 files, 326 tests passed |
| `node scripts/checks.ts trace` | passed |
| `node scripts/checks.ts slides` | passed |
| `node scripts/checks.ts secrets` | passed |
| `git apply --check` on each scenario patch that touches a moved file | none touches one |

The container had no OpenSSH, so `openssh-client` was installed for the land tests, which sign with a software key. The pipeline's runner has it.

## Review

Pending: an independent subagent review, given the files and the spec rows.
