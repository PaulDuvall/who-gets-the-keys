# land.sh tests the batch before signing (Tracer 2 T3b, backlog u3u)

Status: staged in `proposals/land-presign/`, not landed. Drafted 2026-11-08. Lands after `proposals/producer-script/`, whose copies it builds on.

## What changes in `scripts/bootstrap/land.sh`

| When | New behaviour | Lesson |
|---|---|---|
| After the review, before the signing prompt | Checks `node --version` against `package.json`'s `engines` (`>=24.11.0 <25`), refusing a pre-release. Then, in a temporary worktree holding exactly the staged tree, from an empty environment with a temporary `HOME`, runs `npm ci --ignore-scripts`, `tsc --noEmit`, ESLint on each moved `.ts`, `.mts`, `.js` or `.mjs` file, `vitest run`, `node scripts/checks.ts trace`, and `git apply --check` on each scenario patch the batch moves, that touches a moved file, or that git cannot read. A failure prints `Preflight failed: <step>`, the failing tests and the last 20 lines, keeps the whole output in a named file, signs nothing, and puts the working tree and index back | L10, L19, L20 |
| After `main` moves | Waits, up to 10 minutes, until the run or its deploy job, `deploy to sandbox`, waits for approval, then prints `Approve the sandbox deployment in main's run <ID>: <URL>` and keeps polling, for up to an hour, until the deployment no longer waits: `gh run watch` switches to the terminal's alternate screen and would hide the line. Then it watches, and prints the URL again after the watch ends | backlog u3u, update of 2026-11-08 |
| After `main`'s run fails | If every job but the deploy passed or was skipped: a deploy cancelled before any step says it was most likely cancelled by a newer push, and nothing needs fixing; a deploy that failed without running a step says it was rejected or could not start, that nothing needs fixing if the owner rejected it, and otherwise how to see why. Any other failure, a cancel after steps ran included, keeps the old "fix the problem in a new commit on top" | L13 |
| When `gh` cannot read the run | The old messages, with no wait: the existing `land.sh` and `land.sh --delivery` tests' stub `gh` answers no `run view`, and they pass unchanged | |

One choice beyond the backlog item's criteria: the preflight runs every test, not only the moved ones, because T3a and T4's failures were in tests the batch did not move (L19, L20). It runs after the owner's review, not before it, because it runs the batch's own code; see the review below.

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

## Review, 2026-11-08

An independent review found two critical, two high, four medium and six low findings. It confirmed that `read-tree -u --reset` reproduces the staged tree exactly, that Ctrl-C during a step runs the cleanup, and that the gh expressions give the expected output on runs 42431648429 and 42404547253.

| Severity | Finding | Done |
|---|---|---|
| Critical | `land.sh` exports `GIT_LITERAL_PATHSPECS=1`, and every step inherited it: the trace check's `git ls-files -- specs/*.md` matched nothing, so trace and vitest would refuse every batch on the owner's machine. The stubs hid it | Each step runs under `env -i` with only `PATH`, the language, the npm cache, a temporary `HOME` and `TMPDIR`, and a git identity. A test checks that no step sees that variable, the SSH agent or `AWS_PROFILE`. The full suite and the trace check were run here under that environment: the same 3 `ssh-keygen` failures, trace passes |
| Critical | The staged `test/land.test.ts` added `package.json` to its repository but not to the first test's file list, so the landing's candidate run would fail after signing (shown with a stand-in `ssh-keygen`) | Added |
| High | The preflight ran the batch's own code before the owner's review, with the owner's SSH agent, gh and AWS credentials | It runs after the review, from the empty environment, and says the key must not blink. The repository's own git settings still reach it, so a test that signs could make the key blink: the message says to press Ctrl-C |
| High | `gh run watch` switches to the alternate screen, hiding the approval line | It keeps polling until the deployment no longer waits, then watches. A test feeds a sequence of states and checks no watch starts while it waits |
| Medium | R213's explanation clause fired for any deploy failure, and its wait had no bound | R213 says when it explains, and gives the 10-minute and one-hour bounds |
| Medium | "Nothing needs fixing" for a cancel after steps ran, and for any failure without steps | Only a cancel before any step; a failure without steps says nothing needs fixing only if the owner rejected it |
| Medium | A batch that changes only a scenario patch was not checked, and an unreadable patch made `land.sh` exit 128 | Both are checked as steps; two tests |
| Medium | Failure output was hard to use | Control characters stripped, failing tests listed, the whole output kept in a named file |
| Low | Prune only when the worktree directory existed; a pre-release Node.js gave a bash error; only the job-level `waiting` matched; no test of the order or the polling; macOS untested | Fixed, tested, except macOS: the full suite has not run there |
