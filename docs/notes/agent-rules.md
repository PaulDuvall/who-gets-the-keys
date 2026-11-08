# CLAUDE.md rules and the no-session-link hook (Tracer 2 T3b, backlog l3q)

Status: staged in `proposals/agent-rules/`, not landed. Drafted 2026-11-08. Lands after `proposals/land-presign/`, whose spec and traceability copies it builds on.

## What changes

| File | Change |
|---|---|
| `CLAUDE.md` (staged as `CLAUDE.proposed.md`) | Conventions: the public-repository rule, the no-session-link rule with the trailer-block rule, and the rule on requirement IDs (amend, never remove; allocate above the highest on every remote branch). New sections: "Batches", "Owner steps" (lessons L15 to L18) and "Unattended runs", from the owner's instructions of 2026-11-08 |
| `.claude/hooks/hook.mjs` | A new mode, `no-session-link`: for a Bash command that runs `git commit`, it reads the command's text and any file passed with `-F` or `--file`, and exits 2 if either holds `claude.ai/code/session_` |
| `.claude/settings.json` | Registers it as a PreToolUse hook on Bash, after `no-sign` |
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R214 in "Local sessions", after R39 |
| `test/hook.test.ts` | Three R214 tests: six blocked commands (inline `-m`, a `-F -` heredoc, `-F <file>`, `--file=<file>`, an absolute path, `--amend`), six allowed ones (commits without a link, a missing file, `grep` and `git log --grep` that only mention it), and the settings entry |
| `traceability.md` | Row SPEC-001-R214 |

## Why a Claude Code hook, not a git hook

The backlog item asks for "a commit hook". A git `commit-msg` hook would also catch commits that scripts make, but it lives in `.git/hooks` or needs `core.hooksPath`, neither of which a clone versions or the agent may set. The PreToolUse hook sits beside `no-sign` and `gitleaks-staged`, which already read every Bash command, and is versioned under the protected `.claude/`. Like `no-sign`, it is a tripwire: a script the agent writes can still commit a link. The owner's review of each landing is the control.

## Not done, and why

- The private-repository denylist in the backlog item ("a check or commit hook refuses a commit whose diff or message adds a name on a denylist of the owner's private repositories, kept outside this repository"). Its open question, where the denylist lives, is the owner's: listing the names here would break the rule. The CLAUDE.md rule is staged; the hook is a question in the hand-off.

## Checked here

The three R214 tests and the two R39 tests pass with the staged hook and settings. The rest is in the run log's preflight.
