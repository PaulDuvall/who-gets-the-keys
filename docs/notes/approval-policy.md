# Batch approval-policy: CLAUDE.md asks with AskUserQuestion and follows decision 0010

Staged in `proposals/approval-policy/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/approval-policy`, after decision 0010 and `docs/factory-log.md` are on `main`. Its `LAND.txt` requires both. No backlog item was filed: the owner asked for it directly, in the session of 2026-11-16.

## Why

On 2026-11-16 the owner asked for two things:

- Questions to the owner go through the AskUserQuestion tool.
- Decision 0010 goes into `CLAUDE.md`, "so I do not need to keep asking".

The owner answered decision 0010's four questions that day, each with its recommended option:

- The pipeline and its check code count as impacting specs.
- A tier loosens after 60 approvals in a row with no rejection.
- An escaped defect leads to a tier change that the agent proposes and the owner signs.
- `docs/factory-log.md` starts now, kept by hand.

## What moves

`CLAUDE.proposed.md` to `CLAUDE.md`. It changes two things.

First, the file map's `docs/` row names `factory-log.md`.

Second, a new section, "Questions and approvals", between "Owner steps" and "Unattended runs":

- Questions go through AskUserQuestion: at most four in one call, each standing alone, with the recommended option first. An unattended run writes its questions into the hand-off instead, as that section already says.
- Approvals follow decisions 0004 ("Signed intent, checked delivery") and 0010 without asking again. Where those unsigned records differ from the section, the section wins. The recommendation for other repositories comes first, then what this repository does: signatures on `specs/`, `approvers.txt`, the protected paths and irreversible changes. The `sandbox` reviewer stays until backlog items s3p, x2r and g4e have landed.
- Each approval, rejection and escaped defect gets a row in `docs/factory-log.md`. A tier changes, either way, only through a batch the owner signs.

Nothing deployable changes, so `main`'s `sandbox` deploy is skipped (SPEC-001-R232). No input of `npm run progress` changes.

## Preflight

The batch was checked in a scratch worktree with the move applied, as `land.sh` applies it, on `main` at `39e57f0` plus decision 0010, the factory log and the review fixes. It was first built on `7bef665`; `main` then moved, and decision 0004 gained the section the batch now cites. A Homebrew-style `node@24` and a BSD-style `seq` were first on `PATH`.

| Step | Result |
|---|---|
| File modes, `LAND.txt` | `100644`; printable ASCII, no line over 120 characters |
| `tsc --noEmit` | Clean |
| Vitest | 440 of 440. `test/task-scope.test.ts` and `test/producer.test.ts` read `CLAUDE.md` |
| `checks.ts` secrets, trace, slides | Pass |
| Scenario patches that touch `CLAUDE.md` | None |
| `npm run progress` | No change |

## Independent review

A subagent reviewed the three files, `LAND.txt` and the spec rows, against `specs/`, decisions 0004 and 0005, the backlog, `land.sh` and git history, without this note.

| # | Finding | What changed |
|---|---|---|
| 1 | The staged section and decision 0010 said a backlog change needs a signature only for a file under `specs/`, which read as leaving `scripts/checks.ts` unsigned | Both now name `specs/`, `approvers.txt` and the protected paths |
| 2 | `approvers.txt` was missing; SPEC-001-R12 names it apart from the protected paths | Added in both |
| 3 | Decision 0010 said the owner pushes every commit to `main`; the README lets a session push an unprotected commit by its SHA | The row now says both, and that the ruleset requires only a passing `checks` status |
| 4 | The signed `CLAUDE.md` made two unsigned records binding, so an unsigned edit could change what sessions treat as settled; 0010 said Proposed while `CLAUDE.md` said settled | The section wins where they differ, and 0010 is Accepted |
| 5 | 0010 said decision 0005 drafts the same split | It now says 0005 drafts only the two-signer part, and how its tiers differ |
| 6 | 0010 left out the `probe` reviewer | A row in section 3 |
| 7 | The factory log claimed one row per approval but left out seven signed commits from 2026-11-13 to 2026-11-15, and cited g4e for a count only R232 gives | A summary row for the seven, verified signed and on `main`; both counts cited; the count of 60 starts on 2026-11-16 |
| 8 | `LAND.txt` named notes that did not exist, its message named only 0010, and its skipped deploy needs the last `sandbox` deploy to have succeeded | These notes; both decisions named; the condition stated |
| 9 | Loosening read as automatic | A tier changes either way only through a signed batch |
| 10 | No fallback where AskUserQuestion is missing | A subagent returns its questions, with recommended answers, to the session that started it |

Not changed:

- `LAND.txt`'s `requires:` lines can never refuse in practice. `land.sh` reads `LAND.txt` from `main`, and the two files arrive on `main` in the same linear chain. They stay as a guard against a cherry-pick or a rename.
- CLAUDE.md "Batches" asks for one batch per backlog item. None was filed, because the owner asked for this directly. This note records why.
