# Batch q7m: issue triage returns a label or stops before the model

Backlog `who-gets-the-keys-q7m`. Staged in `proposals/q7m/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/q7m`. The owner disabled the workflow on 2026-11-16 until this lands.

## What failed

`issue-triage.yml` has run 10 times, all on 2026-11-07, when ten issues were opened between 19:38 and 19:39 UTC. None applied a label.

| Runs | Conclusion | Cause, from the logs |
|---|---|---|
| 1 to 7, 9 | Failure | Claude Code stopped with result `error_max_turns` after 6 turns, against `--max-turns 5`, so it returned no structured output. The job then failed on `fromJSON(steps.classify.outputs.structured_output)` with an empty string: "Error reading JToken from JsonReader". Runs 1, 5 and 9 cost USD 0.56, 0.66 and 0.16 |
| 8, 10 | Cancelled | The Claude step ran from 19:39:43 to 19:54:46, the job's `timeout-minutes: 15` |

Why it needed more than five turns is inference: the action hides the transcript (`show_full_output` is off). The prompt named only the issue number, so the model had to fetch the issue. `permission_denials_count` was 0, so it used tools it was allowed: the deny list blocked Bash, WebFetch, WebSearch, Edit and Write, but not Read, Grep, Glob or the MCP tools the action adds. Why runs took from 68 s to over 15 minutes is also inference: ten runs called Bedrock within about 70 seconds.

## The change

| Change | Why | Evidence, read 2026-11-16 |
|---|---|---|
| The prompt carries the issue's title and body, between markers that call them untrusted data | The model needs no tool to read the issue | The action passes `prompt` to its runner as an environment variable, `PROMPT: ${{ inputs.prompt }}`, so the issue text is never a shell command (`action.yml` at `db77d4d`). zizmor reports no finding |
| `--tools=` | Leaves only `StructuredOutput`, the tool that returns the label | CLI reference: `--tools` "Restrict which built-in tools Claude can use. Use `""` to disable all". The action takes the next argument as a flag's value only if it is not empty (`if (nextArg && !nextArg.startsWith("--"))`, `base-action/src/parse-sdk-options.ts` at `db77d4d`), so `--tools ""` would lose its value. `--tools=` is one argument. Claude Code 2.1.325 in a cloud session, run against an unreachable API address so no model call could happen, listed only `["StructuredOutput"]` in its init event |
| `--disallowedTools "mcp__*"` | Removes the MCP servers the action adds through `--mcp-config` | CLI reference: `--tools` "doesn't affect MCP tools; to deny those too, use `--disallowedTools "mcp__*"`". The action "prepends its config (github_comment, github_ci, etc.) as inline JSON" (`parse-sdk-options.ts`) |
| `--max-turns 3` | Owner's choice. With one tool, an answer is one `StructuredOutput` call | Structured outputs page: Claude Code "adds this tool to the session, and the agent calls it to return its answer", and calls it again on a schema mismatch |
| A check step prints `Model cost: USD <amount>`, and sets the label only from the fixed set, or prints `CHECK triage FAILED: no label` | The job no longer fails on a template error that hides the real result | The action's outputs `structured_output` and `execution_file` (`action.yml`) |
| One run at a time, `queue: max`, and a budget job: at most 5 model runs a UTC day | Owner's choice of 5. A burst of ten cost about USD 5 | GitHub: "Up to 100 jobs or workflow runs can be pending", processed "in first-in-first-out (FIFO) order" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). Without it, "any existing pending job or workflow run in the same group is canceled" |

The triage job keeps its `permissions` and `env` blocks, so the workflows check's comparison with the B9 replay job still holds (SPEC-001-R4, `replay-parity`). The budget job is a separate job, because it needs `actions: read` to list runs.

## Not verified until a test issue runs

- That the action version at `db77d4d` installs a Claude Code that treats `--tools=` as 2.1.325 does.
- That `--disallowedTools "mcp__*"` removes the action's MCP tools on the runner.
- That a label takes one turn with `--max-turns 3` on Bedrock.

The owner's test issue after landing is the backlog's first acceptance criterion, and it checks all three.

While checking the second point, the agent ran Claude Code twice in the cloud session with an empty environment, expecting it to stop before any model call. The session's own credentials answered, from `claude-sonnet-5-5`. Each call was one short prompt, "Return the label bug.", billed to the session's account, not AWS. Both returned `{"label": "bug"}` through `StructuredOutput`, one with `--tools ""` and one with the default tools. The `--tools=` check above then used an unreachable API address, so it made no call.

## Owner steps after landing

1. `gh workflow enable issue-triage.yml`.
2. Open one test issue, for example titled "Test: the export fails on an empty table".
3. In its run: the budget job prints `Model runs today before this one: 0 of 5`. The triage job prints `Model cost: USD <amount>` and `Label: <label>`, and the issue gets that label.

If the triage job prints `CHECK triage FAILED: no label`, the three points above are where to look. The cost line says what the run spent.

## Preflight

In a scratch worktree with the batch's seven moves applied, on `main` at `0a9aeb2`, with a Homebrew-style `node@24` and a BSD-style `seq` first on `PATH`:

| Step | Result |
|---|---|
| `tsc --noEmit`; ESLint on `test/issue-triage.test.ts` | Clean |
| `checks.ts` secrets, workflows (zizmor, replay-parity), trace, slides | Pass |
| Vitest | 447 of 447. The 7 new tests fail, 7 of 7, against `main`'s workflow |
| `npm run progress` | Approved requirements 113 to 115; staged as `docs/progress.json` and `docs/progress.svg` |
| Scenario patches that touch a moved file | None |

## Independent review

REVIEW_PENDING
