# SPEC-003: Exercise mode

Intent: a learner with Node.js, npm, git and OpenSSH rebuilds five of the pipeline's checks, one at a time, and the repo grades each attempt against the scenario that check exists to stop.

Status: proposed. It lands with its implementation, because the trace check requires a test that names every requirement.

| Term | Meaning |
|---|---|
| exercise | one scenario listed in `scenarios/exercises.yaml` whose check the learner rebuilds |
| enforcement | the part of a check an exercise removes: a check function in `scripts/checks.ts`, or a setting in a config file the check reads |
| exercise files | the files that hold an exercise's enforcement |
| base commit | the commit an exercise branch was created from |
| grading | running only the exercise's check, first on the base commit with the learner's exercise files, then with the scenario's patch applied as well |

## Exercises

`scenarios/exercises.yaml` lists them in this order, easiest first.

| Order | Scenario | Check | Enforcement removed |
|---|---|---|---|
| 1 | B1 test with no assertion | lint | the `vitest/expect-expect` rule in `eslint.config.js` |
| 2 | B6 invented package name | allowlist | `allowlist()` in `scripts/checks.ts` |
| 3 | B7 loosened guardrail | ratchet | `ratchet()` in `scripts/checks.ts` |
| 4 | B2 weak assertion | mutation | `thresholds.break` in `stryker.config.json` |
| 5 | B4 rewritten acceptance criteria | signatures | `signatures()` in `scripts/checks.ts` |

## Requirements

| ID | Requirement |
|---|---|
| SPEC-003-R1 | WHEN `npm run exercise -- start <ID>` runs, THE kit SHALL refuse unless the working tree is clean and `<ID>` is in `scenarios/exercises.yaml`. It SHALL then create the branch `exercise/<ID>` from the current commit, remove that exercise's enforcement so its check always passes, commit the change, and print each exercise file and where to edit it. |
| SPEC-003-R2 | WHEN `npm run exercise -- grade <ID>` runs, THE kit SHALL copy the learner's working-tree version of each exercise file onto a temporary worktree of the base commit, without committing them, and run only the exercise's check there. IF the check prints a failure line, THEN the kit SHALL print `EXERCISE <ID> FAILED: check fails on the clean tree`. |
| SPEC-003-R3 | WHEN the clean run in R2 passes, THE kit SHALL apply the scenario's patch in that worktree, commit it as the scenario harness does, and run only the exercise's check again. IF its standard output is not exactly the scenario's `expect` line from `scenarios/scenarios.yaml`, THEN the kit SHALL print `EXERCISE <ID> FAILED: expected "<expect>", got "<first line, or nothing>"`. Otherwise it SHALL print `EXERCISE <ID> PASSED`. |
| SPEC-003-R4 | IF the clone is shallow, THEN THE kit SHALL print `EXERCISE <ID> FAILED: shallow clone` and stop, because the signatures and ratchet checks read history. |
| SPEC-003-R5 | THE kit SHALL need only Node.js (the version in `package.json` `engines`), npm, git and, for B4, `ssh-keygen` from OpenSSH. It SHALL NOT call gitleaks, zizmor, Terraform, tflint, Semgrep, OSV-Scanner, Docker or any AWS API. |
| SPEC-003-R6 | WHEN `npm run exercise -- reset <ID>` runs on `exercise/<ID>`, THE kit SHALL restore the reference enforcement from the base commit into the working tree, without committing. |
| SPEC-003-R7 | THE kit SHALL never commit to, or change, any branch except `exercise/<ID>`. |
| SPEC-003-R8 | WHEN `npm run exercise -- list` runs, THE kit SHALL print the exercises in order, each with its scenario title, check, exercise files, and the post and recording links recorded for it in `scenarios/exercises.yaml`. |
| SPEC-003-R9 | THE kit SHALL use Node.js built-ins and the repository's existing dependencies only. |
| SPEC-003-R10 | THE README SHALL have an "Exercises" section that lists the five exercises in order, states the setup in SPEC-003-R5, and links to the generated walkthrough (SPEC-002) as the free preview. |

## Notes

- Grading runs on the base commit, not on the exercise branch. The branch's own commit changes protected files without an approver's signature, so the B4 learner's signatures check would rightly fail on it.
- On an exercise branch, `npm run checks` stops at `signatures`, for the same reason. That is expected; grading runs only the exercise's check.
- The reference enforcement for every exercise is public in `main` and its history. The free exercises do not hide it.

## Open questions

| Question | Why it matters |
|---|---|
| How long B2's grading takes on a fresh clone | Stryker's incremental cache is under `reports/`, which is not committed, so a fresh clone runs the full mutation suite. Not measured |
| Whether a single `npm run check:<name>` should print a pass line | Today a single check prints nothing on a pass (SPEC-001-R1 names only the failure line), so a learner running it directly sees no confirmation |
| The post and recording URLs for each exercise | They depend on the hosting and email tools, not chosen yet |
