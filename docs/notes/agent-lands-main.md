# Batch agent-lands-main: the agent lands passing commits; the owner only signs

Staged in `proposals/agent-lands-main/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/agent-lands-main`, because it changes `CLAUDE.md`.

## The owner's decision, 2026-11-20

Signing a SCA exception that day took the owner seven commands at the Mac, then `land.sh --to-main`. The owner said: "So again, I'm fine running the key, but all these commands … I have to continue to run in my terminal. A real, real annoyance." Then: "I'm fine. Signing the key is what I was referring to, like Yubikey."

The agent asked: "May I push to main myself, for commits that need no signature, after their candidate run passes (exact SHA, fast-forward, checked for waiting deploys first)? That removes your land.sh --to-main step for agent commits. Signed changes still need your touch." The owner chose "Yes, and make it durable". The owner also let the agent push to `main` a commit the owner had already signed and pushed to a candidate branch.

## The change

| File | Change |
|---|---|
| `CLAUDE.md`, "Conventions" | One new rule. The agent pushes to `main` itself, without asking, each commit whose candidate run has passed and that needs no approver signature or already carries the owner's. It pushes the exact SHA as a fast-forward, after checking with the Actions API that no `main` deploy waits for approval. It then deletes the candidate branch and reports main's run. An unattended run still stops before `main` |
| `docs/factory-map.md`, "Where the picture is not literal" | Its last item said the owner pushes each change to `main`. It now says the agent does, by working practice, not by the ruleset, and the owner signs what needs a signature |

## What it changes, and what it does not

- No check changes. `main` still moves only to a commit whose `checks` job passed on it (SPEC-001-R41), and every change to a protected path still needs the approver's signature (SPEC-001-R12).
- Deploys still wait for the owner's `sandbox` approval in the browser (SPEC-001-R232), and the agent never pushes while one waits.
- The gap SPEC-001 accepts under "Checks before `main`" is unchanged: the checks run from the pushed commit. Today the owner runs `land.sh --to-main` without reviewing an unsigned commit, so the owner's push adds no review that this rule removes.
- Unattended runs still stop before `main`, so nothing lands while the owner is away.

## Preflight

On branch `followups-2026-11-20` at `d1d61b3`, in a scratch worktree with both moves applied. A Homebrew-style `node@24` under `/opt/homebrew/opt/` and a BSD-style `seq`, which prints `1` and `0` for `seq 0`, came first on `PATH`.

| Step | Result |
|---|---|
| `node scripts/checks.ts` trace, slides, secrets | Pass |
| Vitest | 448 of 448 passed, in 28 files |
| `LAND.txt` | Plain ASCII |
| Scenario patches that touch a moved file | None |

## Independent review

A subagent was given the staged copies, `main`'s versions and the owner's words, and not this note. It was still running when the batch was staged. Its findings, what changed for each and what was not fixed are recorded in a later commit.
