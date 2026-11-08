# land.sh tests the batch before signing (Tracer 2 T3b, backlog u3u)

Status: staged in `proposals/land-presign/`, not landed. Drafted 2026-11-08. Lands after `proposals/producer-script/`, whose copies it builds on.

## What changes in `scripts/bootstrap/land.sh`

| When | New behaviour | Lesson |
|---|---|---|
| After the moves are staged, before the review | Checks `node --version` against `package.json`'s `engines` (`>=24.11.0 <25`). Then, in a temporary worktree holding exactly the staged tree, runs `npm ci --ignore-scripts`, `tsc --noEmit`, ESLint on each moved `.ts`, `.mts`, `.js` or `.mjs` file, `vitest run`, `node scripts/checks.ts trace`, and `git apply --check` on each scenario patch that touches a moved file. A failure prints `Preflight failed: <step>`, the step's last 20 lines, signs nothing, and puts the working tree and index back | L10, L19, L20 |
| After `main` moves | Waits, up to 10 minutes, until the deploy job, `deploy to sandbox`, waits for approval, then prints `Approve the sandbox deployment in main's run <ID>: <URL>`, and prints the URL again after `gh run watch` ends | backlog u3u, update of 2026-11-08 |
| After `main`'s run fails | If every job but the deploy passed or was skipped: a cancelled deploy says it was most likely cancelled by a newer push; a deploy that failed without running a step says it was rejected or never started. Both say nothing needs fixing. Any other failure keeps the old "fix the problem in a new commit on top" | L13 |
| When `gh` cannot read the run | The old messages, with no wait: the existing `land.sh` and `land.sh --delivery` tests' stub `gh` answers no `run view`, and they pass unchanged | |

Two choices beyond the backlog item's criteria, each recorded here: the preflight runs every test, not only the moved ones, because T3a and T4's failures were in tests the batch did not move (L19, L20); and it runs before the review rather than just before the signing prompt, so the owner never reads a diff that will be refused.

## Evidence for the cancelled and rejected cases

Read on 2026-11-08 through the GitHub API:

| Run | What happened | Deploy job as the API reports it |
|---|---|---|
| [42404547253](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42404547253) | Cancelled by a newer push to `main` (L12) | `conclusion: cancelled`, no steps, no runner |
| [42431648429](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42431648429) | Deploy rejected by the owner (L19) | `conclusion: failure`, no steps, no runner |

So "failed without running a step" stands for a rejection. Inference: a job that GitHub could not start for another reason would look the same, which is why the message says "rejected, or never started".

## Tests

| File | What |
|---|---|
| `test/land-presign.test.ts`, new | 16 tests naming SPEC-001-R213, against a temporary clone with a bare origin and stub `gh`, `node`, `npm` and `npx`, none of which needs a signing key: the step order and the worktree (not the owner's checkout, and holding the staged copy without `LAND.txt`); each step's failure refusing before the signing prompt with everything put back; Node.js 24.1, 25.0 and 22.22 refused before any step; a scenario patch that no longer applies refused; the approval URL before and after the watch; cancelled and rejected deploys; a failed deploy step and a failed check keeping the old message; and the old messages when `gh` cannot read the run |
| `test/land.test.ts` | Its repository gains a `package.json` with `engines`, and its stub directory a passing `node`, `npm` and `npx`, so its signing tests reach the signature as before. It needs `ssh-keygen`, which the agent's container lacks, so this copy was not run here: the candidate run of the landing is its first run |

## The landing of this batch itself

`land.sh` lands this batch with the copy on `main`, which has no preflight. The agent ran the same steps on the moved tree (`docs/notes/autonomous-run-2026-11-08.md`). Every later batch is landed by the new `land.sh`, so its own preflight runs on the owner's machine.

## Not verified

- `test/land.test.ts` with the changes, for want of `ssh-keygen` here.
- The job `status` value `waiting` for a job held at an environment's approval: the backlog item names it, and GitHub's REST reference lists it among job statuses; not read from a live waiting run.
- The preflight's run time on the owner's machine: `npm ci` plus the full suite, estimated 1 to 3 minutes (inference from this container's 40 to 60 s for the suite).
