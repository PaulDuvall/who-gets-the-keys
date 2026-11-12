# Owner-rules batch (backlog who-gets-the-keys-w2h)

Staged in `proposals/owner-rules/` on 2026-11-12, on top of `main` at `2a86484`. It writes the owner-step rules learned from 2026-11-09 to 2026-11-12 into `CLAUDE.md`, and adds SPEC-001-R230: a `no-inner-worktree` hook that refuses a `git worktree add` inside the checkout. `CLAUDE.md`, `.claude/` and `specs/` are protected, so the owner lands it with `land.sh` and signs it.

## What changes

| Change | Why | Where |
|---|---|---|
| SPEC-001-R230, the `no-inner-worktree` PreToolUse hook | Inside the checkout, `gitleaks-staged` finds the B5 scenario's synthetic secret in the worktree and blocks every commit (lesson L33); the owner chose "outside the checkout" on 2026-11-12 | `.claude/hooks/hook.mjs`, `.claude/settings.json`, `test/hook.test.ts`, spec row, `traceability.md` |
| Purpose says 22 bad changes | `scenarios/scenarios.yaml` holds 22 | `CLAUDE.md` |
| `npm run progress`, and regenerate the record with any change to its inputs | SPEC-001-R226, R227 | `CLAUDE.md` Commands, Conventions |
| Batches stage the record as it will be after landing | The test check runs on the landed tree | `CLAUDE.md` Batches |
| Test stand-ins avoid commands whose GNU and BSD behaviour differs | The BSD `seq 0` failure in the owner's preflight, `docs/notes/owner-tooling.md` | `CLAUDE.md` Batches |
| Simulate the owner's machine before the first landing step; zsh; lines of 120 characters or fewer; the touch on its own line; `owner-apply`; data sources before a Terraform plan; run-time advisory data before saying `main` passed; paste the summary block | Lessons L21 to L23, L30 and L33 in `docs/notes/owner-queue-lessons-2026-11-10.md`, and the owner-tooling notes | `CLAUDE.md` Owner steps |
| w2h closed, its criteria ticked; k7d and p9v closed | This batch is w2h's acceptance; k7d (SPEC-001-R218 to R225) and p9v (R226 to R229) landed on 2026-11-12 | `.tasks/backlog.jsonl` |
| Progress record after landing | SPEC-001-R227 | `docs/progress.json`, `docs/progress.svg` |

## Decisions and their reasons

| Decision | Why |
|---|---|
| The hook splits the command as a shell does and follows each `cd` in order | The first version took the last `cd` anywhere in the text, so a `cd` after the add hid it (review finding 1) |
| A path naming a variable, `~` or a command substitution is not judged | The hook cannot expand them; refusing would block the scratchpad path the hook itself recommends (finding 5) |
| The hook refuses only `git worktree add`, not `EnterWorktree` or agent isolation | Those are tool calls, not Bash. The rule in `CLAUDE.md` names them; a hook on them would need a matcher the harness may not offer for every surface (inference, not tested) |
| A path is inside when `relative(root, path)` is neither `..` nor starts with `../`, and is not absolute | A bare `startsWith("..")` let `..wt`, a directory inside, through (finding 2) |
| The hook resolves `cd` and `git -C` before the path | The command's working directory decides where a relative path lands |

## Not done, and why

- The hook reads command text only, like every Local sessions tripwire. A script the agent writes and runs can still make a worktree inside the checkout.
- No check reads `CLAUDE.md` rules. They are instructions, not controls.
- `git worktree move` into the checkout is not refused, and symbolic links in a path are not resolved. R230 names `add` only, the command that caused L33.
- A command run through `eval`, `sh -c` or a script is not read, as for every hook here.

## Preflight

Run in a scratch worktree on `2a86484` with the moves applied, again after the review fixes, Node.js 24.22.2, on 2026-11-12, with a BSD-like `seq` first on PATH and a Homebrew-style `node@24` under `/opt/homebrew`, as on the owner's Mac.

| Step | Result |
|---|---|
| `tsc --noEmit -p .` | passed |
| ESLint on `test/hook.test.ts` and `.claude/hooks/hook.mjs` | passed |
| every Vitest test | 22 files, 339 tests passed, before and after the fixes |
| `node scripts/checks.ts trace` | passed |
| `node scripts/checks.ts slides` | passed |
| `node scripts/checks.ts secrets` | passed |
| `npm run progress` on the landed tree | no change to the staged record |
| `git apply --check` on each scenario patch that touches a moved file | none touches one |

## Review

An independent subagent reviewed the staged files against SPEC-001-R230, ran the suite and probed the hook with 26 commands. Each finding, and what was done:

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | A `cd` after the add moved the resolved path: `git worktree add .claude/worktrees/x && cd /tmp` passed | high | Fixed: each `cd` applies only to what runs after it. Tested |
| 2 | `..wt` read as outside the checkout | high | Fixed: the inside test compares whole segments. Tested |
| 3 | `--orphan` treated as taking a value, so its path was skipped | high | Fixed: only `-b`, `-B` and `--reason` take one. Tested |
| 4 | Only one `-C`, and no other git option, before `worktree` | medium | Fixed: every global option is read, each `-C` applied. R230 now says so. Tested |
| 5 | `"$TMPDIR/wt"` and `-C "$HOME"` refused | medium | Fixed: not judged. R230 says so. Tested |
| 6 | A `cd` in a subshell, after a newline or with a quoted space ignored | low | Fixed. Tested |
| 7 | A quoted `--reason` value with a space read as the path | low | Fixed: quoted text is one word. Tested |
| 8 | A commit message naming the command was refused | low | Fixed: only a simple command that runs git is judged, and heredoc bodies are skipped. Tested |
| 9 | `git worktree move` and symbolic links not covered | low | Not fixed: outside R230's `add`. Named above |
| 10 | Tests missed the bypasses | medium | Added 23 cases |
| 11 | R230 said "a Claude Code session", which would include the runner producer | low | Fixed: "interactive", and it names R87's hooks off |
| 12 | The `CLAUDE.md` simulation rule pointed to a note that does not describe it | low | Fixed: the rule says what to simulate |
| 13 | The progress-input list left out `scripts/progress.ts` and `factory-video/verify.mjs` | low | Fixed |
| 14 | The backlog also closes k7d and p9v; w2h's boxes stayed unticked | low | Fixed: ticked, and both named above |
| 15 | Three notes mismatches | low | Fixed |
