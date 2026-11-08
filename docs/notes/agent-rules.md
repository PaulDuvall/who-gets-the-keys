# CLAUDE.md rules and the no-session-link hook (Tracer 2 T3b, backlog l3q)

Status: staged in `proposals/agent-rules/`, not landed. Drafted 2026-11-08. Lands after `proposals/land-presign/`, whose spec and traceability copies it builds on.

## What changes

| File | Change |
|---|---|
| `CLAUDE.md` (staged as `CLAUDE.proposed.md`) | Conventions: the public-repository rule, the no-session-link rule with the trailer-block rule, and the rule on requirement IDs (amend, never remove; allocate above the highest on every remote branch). New sections: "Batches", "Owner steps" (lessons L15 to L18) and "Unattended runs", from the owner's instructions of 2026-11-08 |
| `.claude/hooks/hook.mjs` | A new mode, `no-session-link`: for a Bash command that runs `git commit`, it reads the command's text and any file passed with `-F` or `--file`, and exits 2 if either holds `claude.ai/code/session_` |
| `.claude/settings.json` | Registers it as a PreToolUse hook on Bash, after `no-sign` |
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R214 in "Local sessions", after R39 |
| `test/hook.test.ts` | Five R214 tests: twelve blocked commands (inline `-m`, a bare `Claude-Session:` trailer, an upper-case URL, a line continuation, a `-F -` heredoc, `-F <file>`, `--file=<file>`, an absolute path, `< file`, `cd sub &&`, `git -C sub`, `--amend`); a relative file read from the command's working directory; a FIFO-like `/dev/zero` and a non-string command, which pass rather than hang or fail closed; six allowed commands; and the settings entry |
| `traceability.md` | Row SPEC-001-R214 |

## Why a Claude Code hook, not a git hook

The backlog item asks for "a commit hook". A git `commit-msg` hook would also catch commits that scripts make, but it lives in `.git/hooks` or needs `core.hooksPath`, neither of which a clone versions or the agent may set. The PreToolUse hook sits beside `no-sign` and `gitleaks-staged`, which already read every Bash command, and is versioned under the protected `.claude/`. Like `no-sign`, it is a tripwire: a script the agent writes can still commit a link. The owner's review of each landing is the control.

## Not done, and why

- The private-repository denylist in the backlog item ("a check or commit hook refuses a commit whose diff or message adds a name on a denylist of the owner's private repositories, kept outside this repository"). Its open question, where the denylist lives, is the owner's: listing the names here would break the rule. The CLAUDE.md rule is staged; the hook is a question in the hand-off.

## Checked here

The five R214 tests and the two R39 tests pass with the staged hook and settings. The rest is in the run log's preflight.

## Review, 2026-11-08

An independent review found nothing critical or high, four medium and several low. The suite, `tsc`, trace, slides and secrets passed with all five batches applied.

| Severity | Finding | Done |
|---|---|---|
| Medium | A relative `-F` path was resolved against the project, not the command's working directory, missing `cd sub &&`, `git -C sub` and scratch worktrees | Resolved from the hook input's `cwd`, after any `cd` or `git -C`; tests for each |
| Medium | CLAUDE.md promised more than the hook matched: a bare `Claude-Session:` trailer, an upper-case URL, `< file`, a line continuation | All four matched now, with tests; CLAUDE.md says what the hook refuses |
| Medium | Pull request text was not covered, though D24 names no session anywhere | CLAUDE.md's rule covers commits, pull requests, issues and comments, and the public-repository rule covers branch names and pull requests. Only commits are checked |
| Medium | The requirement-ID rule pointed at `specs/` alone, where R211 to R216 do not yet exist | It reads `specs/`, `proposals/` and `docs/` |
| Low | A non-string command or `-F /dev/zero` (which exhausted memory here) or a FIFO | Non-strings pass; only regular files up to 1 MiB are read |
| Low | R214 covered the runner producer, which runs with hooks off; the Local sessions intro said "this requirement" | R214 names interactive sessions and says why the producer is outside it; the intro is plural |
| Low | CLAUDE.md: every trailer in one block; how the Write tool's mode 644 meets executable copies; land.sh's third outcome, "added no lines"; "any push to `main`"; "the list"; the MCP section; the `proposals/<batch>/` layout | All reworded |
| Low | Known misses and false positives of a text tripwire: `-Fmsg`, `--fil`, `commit.template`, split strings; a message that only mentions the link is refused | Not fixed: R214 says it is a tripwire, and the owner's review of each landing is the control |
| Low | CLAUDE.md grows from 896 to about 1,600 words | Kept: the owner asked for these rules in it. A later pass could move the unattended-run rules to a skill |
