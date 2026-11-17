# Refactor review, 2026-11-17

The owner asked for a deep look for areas to refactor, each double-checked, then filed in the backlog.

## Method

Four reviewers read the tree at `eab6bf5`, one area each: the owner scripts and hooks; `scripts/checks.ts` and the other TypeScript checks; the talk and video kits; and the tests, workflows and Terraform. They edited nothing. Each reported candidates with file and line evidence.

The agent then checked each claim it filed against the code at `eab6bf5`, by reading the lines, running a command or running a probe. Where an item states something only a reviewer read, it says so. Facts checked by running something:

| Claim | How it was checked | Result |
|---|---|---|
| The `no-sign` and `no-session-link` hooks break SPEC-001-R39 and R214 | Six commands fed to `.claude/hooks/hook.mjs` as JSON on standard input, as `test/hook.test.ts` does | Four break their requirement; the two controls behave |
| `vitest list` leaks temporary directories | Directories under `/tmp` counted before and after one `vitest list` | 339, then 350 |
| `factory-video/verify.mjs` accepts an unknown check name | `node factory-video/verify.mjs --only nosuch` | `0/0 checks passed.`, exit 0 |
| Backlog f7t is done | Its five criteria read against `70c1ce8` | Each met |

## Filed

| ID | Item | Priority | Signed batch |
|---|---|---|---|
| h2t | Parse commands with one shell tokenizer in all three Bash hooks | 2 | Yes, `.claude/` |
| t7r | Read Spec trailers one way in the trace check, the scope check and the receipt | 2 | Yes |
| r5c | Print the touch cue in rotate-approver-key.sh and refresh-slides.sh | 2 | Yes |
| d6j | Test owner scripts against the names and helpers they copy from other files | 2 | No, `test/` only |
| b4h | Report BOUNDARY HELD only on a recognised denial in the B9 and on-demand probes | 2 | Yes |
| w3d | Stop the test files leaking temporary directories on every vitest list | 3 | No |
| a8s | Have aws-setup.sh run doctor.sh first and build the Lambda without npm | 3 | Yes |
| u6f | Test every failure line of the trace, slides and ratchet checks | 3 | Yes |
| v2o | Import the check order into the walkthrough kit instead of copying it | 3 | No |
| p8w | Share one helper module between the factory-video and practices-carousel kits | 3 | The workflows' `paths` only |
| c9r | Run the practices carousel's browserless checks in the test check | 3 | Yes, a new requirement |
| w9h | Share one test helper that loads a workflow and runs a step as GitHub does | 3 | No |
| t2f | Test Terraform by block, not formatted text, and cover every role in the SCP | 3 | No |
| a3p | Give every apt install step in the workflows the same hang protection | 3 | Yes |
| c4s | Use one colour table for claim statuses, and stop typing the counts by hand | 4 | No |
| h5r | Make rewrite-history.ts judge re-signed history as the signatures check does | 4 | Yes |

Existing items changed: e6r and k9s each gained a refactor note for work they already touch; m7a notes that a history rewrite needs h5r first; ld4 depends on v2o; f7t is closed, done by `70c1ce8`.

## Not filed, and why

| Candidate | Why not |
|---|---|
| A shared, sourced `owner-lib.sh` for the copied shell helpers | `test/land.test.ts` line 369 forbids `source`, `.` and `eval` in `land.sh`, so it runs only reviewed code. d6j tests the copies instead |
| Restructure `land.sh`, 1,236 lines with functions between top-level code | A restructure alone puts a signed, heavily tested script at risk for no behaviour change. Do it inside o1p, j5j or k8d, which change the file anyway |
| One parser for the producer's and the scope check's view of a diff | They disagree on a deleted symlink, but each matches its own requirement, SPEC-001-R208 and R67, and no symlink is tracked |
| A test that each action is pinned to one SHA across workflows | Every action uses one SHA today; nothing has drifted |
| One definition of a control character | Five definitions serve different rules; whether the difference matters on a runner or a terminal is unverified |
| Unused exports, and `requirementRows` copying `requirementIds` | Low payoff |
| Build `SLIDE_LABELS` from `claims.json` | The claims check already fails when the two differ |
| Shared page code for `carousel.html` and `poster.html` | 66 identical lines, but no drift found. Named in p8w's "Out of scope" |
| One tested checker for the factory video's streams | Low payoff, by the reviewer's own ranking |
| Split `scripts/checks.ts` into modules | SPEC-001-R12 reads `REQUIRED_SIGNATURE_FLAGS` from that file at each commit's parent |
| A probe that the Terraform tests pass silently when resources are reordered | They fail loudly instead: `producer.test.ts` line 190 expects two statements and gets none |
