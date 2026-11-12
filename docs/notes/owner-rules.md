# Owner-rules batch (backlog who-gets-the-keys-w2h)

Staged in `proposals/owner-rules/` on 2026-11-12, on top of `main` at `2a86484`. It writes the owner-step rules learned from 2026-11-09 to 2026-11-12 into `CLAUDE.md`, and adds SPEC-001-R230: a `no-inner-worktree` hook that refuses a `git worktree add` inside the checkout. `CLAUDE.md`, `.claude/` and `specs/` are protected, so the owner lands it with `land.sh` and signs it.

## What changes

| Change | Why | Where |
|---|---|---|
| SPEC-001-R230, the `no-inner-worktree` PreToolUse hook | A worktree under the checkout is linted, tested and scanned as part of it; the owner chose "outside the checkout" on 2026-11-12 | `.claude/hooks/hook.mjs`, `.claude/settings.json`, `test/hook.test.ts`, spec row, `traceability.md` |
| Purpose says 22 bad changes | `scenarios/scenarios.yaml` holds 22 | `CLAUDE.md` |
| `npm run progress`, and regenerate the record with any change to its inputs | SPEC-001-R226, R227 | `CLAUDE.md` Commands, Conventions |
| Batches stage the record as it will be after landing | The test check runs on the landed tree | `CLAUDE.md` Batches |
| Test stand-ins avoid commands whose GNU and BSD behaviour differs | The BSD `seq 0` failure in the owner's preflight, `docs/notes/owner-tooling.md` | `CLAUDE.md` Batches |
| Simulate the owner's machine before the first landing step; zsh; lines of 120 characters or fewer; the touch on its own line; `owner-apply`; data sources before a Terraform plan; run-time advisory data before saying `main` passed; paste the summary block | Lessons L21 to L32 and the owner-tooling notes | `CLAUDE.md` Owner steps |
| w2h closed | This batch is its acceptance | `.tasks/backlog.jsonl` |
| Progress record after landing | SPEC-001-R227 | `docs/progress.json`, `docs/progress.svg` |

## Decisions and their reasons

| Decision | Why |
|---|---|
| The hook refuses only `git worktree add`, not `EnterWorktree` or agent isolation | Those are tool calls, not Bash. The rule in `CLAUDE.md` names them; a hook on them would need a matcher the harness may not offer for every surface (inference, not tested) |
| A path is inside when `relative(root, path)` does not start with `..` | The same test catches the root itself and any subdirectory |
| The hook resolves `cd` and `git -C` before the path | The command's working directory decides where a relative path lands |

## Not done, and why

- The hook reads command text only, like every Local sessions tripwire. A script the agent writes and runs can still make a worktree inside the checkout.
- No check reads `CLAUDE.md` rules. They are instructions, not controls.

## Preflight

Run in a scratch worktree on `2a86484` with the moves applied, Node.js 24.22.2, on 2026-11-12, with a BSD-like `seq` first on PATH and a Homebrew-style `node@24` under `/opt/homebrew`, as on the owner's Mac.

| Step | Result |
|---|---|
| `tsc --noEmit -p .` | passed |
| ESLint on `test/hook.test.ts` and `.claude/hooks/hook.mjs` | passed |
| every Vitest test | 22 files, 339 tests passed |
| `node scripts/checks.ts trace` | passed |
| `node scripts/checks.ts slides` | passed |
| `node scripts/checks.ts secrets` | passed |
| `npm run progress` on the landed tree | no change to the staged record |
| `git apply --check` on each scenario patch that touches a moved file | none touches one |

## Review

Pending: see the next commit.
