# Batch q7m: issue triage returns a label or stops before the model

Backlog `who-gets-the-keys-q7m`. Staged in `proposals/q7m/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/q7m`. Until it lands, the owner disables the workflow with `gh workflow disable issue-triage.yml`. On 2026-11-16, when this was staged, its state was still `active`.

## What failed

`issue-triage.yml` has run 10 times, all on 2026-11-07, when ten issues were opened between 19:38 and 19:39 UTC. None applied a label.

| Runs | Conclusion | Cause, from the logs |
|---|---|---|
| 1 to 7, 9 | Failure | Claude Code stopped with result `error_max_turns` after 6 turns, against `--max-turns 5`, so it returned no structured output. Runs 1 to 7 and 9 cost USD 0.56, 0.34, 0.86, 0.76, 0.66, 0.99, 0.88 and 0.16: USD 5.21 in all |
| 8, 10 | Cancelled | The job's `timeout-minutes: 15`. Run 8's Claude step ran from 19:39:34 to 19:54:32, run 10's from 19:39:43 to 19:54:46. Neither printed a result, so their cost is unknown |

All ten then failed on `fromJSON(steps.classify.outputs.structured_output)` with an empty string: "Error reading JToken from JsonReader".

What the six turns were spent on is not recorded: the action hides the transcript (`show_full_output` is off). The prompt named only the issue number. `permission_denials_count` was 0, so the model used only tools it was allowed. The deny list blocked Bash, WebFetch, WebSearch, Edit and Write. The CLI's default tool set on Linux leaves out Glob and Grep, and the review found the action adds no MCP server for an issue run like this one, so no allowed tool could fetch the issue. Inference: the model read repository files looking for it. Why runs took from 68 s to over 15 minutes is also inference: ten runs called Bedrock within about 70 seconds.

## The change

| Change | Why | Evidence, read 2026-11-16 |
|---|---|---|
| The prompt carries the issue's title and body, between markers that call them untrusted data | The model needs no tool to read the issue | The action passes `prompt` to its runner as an environment variable, `PROMPT: ${{ inputs.prompt }}`, so the issue text is never a shell command (`action.yml` at `db77d4d`). zizmor reports no finding |
| `--tools=` | Leaves only `StructuredOutput`, the tool that returns the label | CLI reference: `--tools` "Restrict which built-in tools Claude can use. Use `""` to disable all". The action takes the next argument as a flag's value only if it is not empty (`if (nextArg && !nextArg.startsWith("--"))`, `base-action/src/parse-sdk-options.ts` at `db77d4d`), so `--tools ""` would lose its value. `--tools=` is one argument. Claude Code 2.1.325 in a cloud session, run against an unreachable API address so no model call could happen, listed only `["StructuredOutput"]` in its init event |
| `--disallowedTools "mcp__*"` | Removes any MCP tool. For an issue run with no `mcp__` tool allowed, the action adds no MCP server (`src/mcp/install-mcp-server.ts` at `db77d4d`, read by the review), but its settings turn on `enableAllProjectMcpServers` (run 1's log) | CLI reference: `--tools` "doesn't affect MCP tools; to deny those too, use `--disallowedTools "mcp__*"`" |
| `--max-turns 3`, and the step stops at 10 minutes | Owner's choice of 3. With one tool, an answer is one `StructuredOutput` call. The step limit, below the job's 15 minutes, lets the check step run and print the cost when the model is slow, as runs 8 and 10 were | Structured outputs page: Claude Code "adds this tool to the session, and the agent calls it to return its answer", and calls it again on a schema mismatch |
| A check step prints `Model cost: USD <amount>`, and sets the label only from the fixed set, or prints `CHECK triage FAILED: no label` | The job no longer fails on a template error that hides the real result | The action's outputs `structured_output` and `execution_file` (`action.yml`) |
| One run at a time, `queue: max`, and a budget job: at most 5 triage jobs a UTC day start the model | Owner's choice of 5. A burst of ten cost USD 5.21 in its eight recorded runs. The budget job counts triage jobs by when they started, so a run that waits past midnight counts on the day its model runs, and a re-run attempt counts too | GitHub: "Up to 100 jobs or workflow runs can be pending" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). Without `queue: max`, "any existing pending job or workflow run in the same group is canceled". The spec does not rely on the order runs leave the queue |

The issue's text now always reaches the model, where before the model would have had to fetch it. In exchange the model has no tool: a hostile body can close `</issue-body>`, but it can only choose one of the three labels, or none. The label is checked against the fixed set three times, by the schema, the check step and the label job. Spend is bounded by 3 turns and the 10-minute step.

The triage job keeps its `permissions` and `env` blocks, so the workflows check's comparison with the B9 replay job still holds (SPEC-001-R4, `replay-parity`). The budget job is a separate job, because it needs `actions: read` to list runs.

## Not verified until a test issue runs

- That the Claude Code the action runs treats `--tools=` as 2.1.325 does. The review found the action at `db77d4d` runs 2.1.304, from its `bun.lock`; it also confirmed in the action and Agent SDK source that `--tools=` reaches the CLI as one argument.
- That `--disallowedTools "mcp__*"` removes the action's MCP tools on the runner.
- That a label takes one turn with `--max-turns 3` on Bedrock.

The owner's test issue after landing is the backlog's first acceptance criterion, and it checks all three.

While checking the second point, the agent ran Claude Code twice in the cloud session with an empty environment, expecting it to stop before any model call. The session's own credentials answered, from `claude-sonnet-5-5`. Each call was one short prompt, "Return the label bug.", billed to the session's account, not AWS. Both returned `{"label": "bug"}` through `StructuredOutput`, one with `--tools ""` and one with the default tools. The `--tools=` check above then used an unreachable API address, so it made no call.

## Owner steps after landing

1. `gh workflow enable issue-triage.yml`.
2. Open one test issue, for example titled "Test: the export fails on an empty table".
3. In its run: the budget job prints `Model runs today before this one: 0 of 5`. The triage job prints `Model cost: USD <amount>` and `Label: <label>`, and the issue gets that label.

If the triage job prints `CHECK triage FAILED: no label`, the three points above are where to look. The cost line says what the run spent.

Two more limits, accepted:

- Every new issue queues a run, an outsider's too, though its jobs skip at once. A flood of issues fills the queue of 100. GitHub then cancels the runs that do not fit, and the budget job, which fails closed at 100 runs a day, starts no model. A flood can delay or drop triage, but never add model runs.
- `proposals/video-alignment/` also stages SPEC-001 and `traceability.md`. Its `LAND.txt` says it is a review copy from 2026-11-06, to be rebuilt on `main` before it lands, so this batch is not built on it. When it is rebuilt, it keeps R237 and R238.

## Preflight

In a scratch worktree with the batch's seven moves applied, on `main` at `0a9aeb2`, with a Homebrew-style `node@24` and a BSD-style `seq` first on `PATH`:

| Step | Result |
|---|---|
| `tsc --noEmit`; ESLint on `test/issue-triage.test.ts` | Clean |
| `checks.ts` secrets, workflows (zizmor, replay-parity), trace, slides | Pass |
| Vitest | 448 of 448. The 8 new tests fail, 8 of 8, against `main`'s workflow |
| `npm run progress` | Approved requirements 113 to 115; staged as `docs/progress.json` and `docs/progress.svg` |
| Scenario patches that touch a moved file | None |

## Independent review

A subagent reviewed the batch against the action's source at `db77d4d`, the Claude Code and GitHub docs, the ten runs' job logs, `land.sh` and `scripts/checks.ts`, without this note's conclusions. It applied the moves itself: 447 of 447 tests, and every check, passed. It found no shell path for the issue text, and confirmed the budget job's permissions are least privilege.

| # | Finding | What changed |
|---|---|---|
| 1 | The staging commit drafted R237 and R238 under `proposals/` without regenerating the root `docs/progress.*`, so its own candidate run would fail the progress test | Root `docs/progress.*` regenerated: 166 drafted |
| 2 | The budget counted runs by `created_at`, so a run created before midnight that waited past it escaped the cap, and so did its own triage job | It counts triage jobs by `started_at`, in runs updated that day. A test covers the run that waits past midnight |
| 3 | Costs were USD 0.16 to 0.99, not 0.16 to 0.66; runs 8 and 10 stopped at the time limit, not the turn limit; "the model spent its turns fetching the issue" was stated as fact | Corrected in the spec intro, the workflow comment, `LAND.txt` and this note; the cause is marked inference |
| 4 | This note said the owner had disabled the workflow; the API said `active` | The note says the owner disables it until this lands |
| 5 | The action adds no MCP server for this run, and the default tool set on Linux leaves out Glob and Grep | The workflow comment and this note say so; `--disallowedTools "mcp__*"` stays, since `enableAllProjectMcpServers` is on |
| 6 | The action runs Claude Code 2.1.304, not the 2.1.325 probed | Named under "Not verified" |
| 7 | A timeout cancels the job, so the cost line never printed in 2 of the 10 runs | The model step stops at 10 minutes, inside the job's 15, and R237 says so |
| 8 | Tests: the job name was hard-coded; nothing checked that the check step follows the model step; a failing jobs call was untested; `today` came from JavaScript, so a run at UTC midnight could flake; a duplicate flag could pass | The budget step reads the job name from `TRIAGE_JOB`, tested equal to the job's name; step order, a failing jobs call and each flag appearing once are tested; a stand-in `date` fixes the day |
| 9 | R238 counted runs, not triage jobs across attempts; R237's "WHEN Claude Code has ended" missed an earlier failed step; the `Model runs ...` line was unspecified; GitHub does not guarantee queue order | Both rows rewritten to say what the steps do, the printed line included, and nothing about order |
| 10 | An outsider's issues take queue slots and count toward 100 | Recorded above as an accepted limit: it fails closed on cost |
| 11 | Run 8's step times were run 10's | Corrected |

Not changed: the tests need `jq`, as the producer tests already do. macOS 15 and later ships it; an older Mac needs Homebrew's.
