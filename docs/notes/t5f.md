# Batch t5f: name each failing test, and keep pipefail scripts from failing when a reader exits early

Backlog `who-gets-the-keys-t5f`. Staged in `proposals/t5f/`. It lands as one approver-signed commit, with `scripts/bootstrap/land.sh proposals/t5f`.

## What happened

On 2026-11-15, pipeline run 274, attempt 1, failed on `80f3cdc` with `CHECK test FAILED: test/land.test.ts`. That commit changed only `docs/`, which no land test reads. An unchanged rerun passed.

Nothing in the run named the failing test. The test check ran Vitest with the JSON reporter alone. On a failure it printed the last 4,000 characters of Vitest's console output, which held only "JSON report written to …" and git noise, and then deleted the report that named the test.

## The cause

Found in a cloud session with `openssh-client` installed in that container only, 4 CPUs, and two busy loops for load.

| Step | Evidence |
|---|---|
| Reproduce | The full suite failed in 4 of 29 loaded runs. Each time a `land.sh` test failed: `land.test.ts` once, `land-presign.test.ts` twice, `land-owner.test.ts` once |
| Rule out a time limit | The slowest test took 3.6 s, against a 60 s limit |
| Capture `land.sh`'s output | It stopped at the doctor: `fix git signs with /usr/bin/ssh-keygen, whose OpenSSH lists no security-key type`, for an `ssh-keygen` that passes that check in every other run |
| Instrument the check | Adding a `mktemp` and a stderr file before the check stopped the failures: 0 in 35 runs. The timing mattered |
| Log only after a failure | Run 81: `pipestatus=141 0`, with all 16 key types present, `sk-ssh-ed25519@openssh.com` among them |

`doctor.sh` checked the list with `printf '%s\n' "$types" | grep -qxF 'sk-ssh-ed25519@openssh.com'` under `set -o pipefail`. `grep -q` exits at its first match. Bash's `printf` writes a multi-line value one line per `write()`, as the independent review saw with `strace`. A `printf` still writing then dies of SIGPIPE, status 141, and `pipefail` makes the whole test fail although `grep` matched.

In isolation the window is small: the review measured 1 failure in 2,000 tries on an idle machine. The full suite runs the doctor dozens of times per run, under load, which makes it about one run in seven.

The same class was recorded once before, for `simulate-land.sh`, in `docs/notes/owner-queue-handoff-2026-11-13.md`.

## Where else it could strike

| Script | Line | What a race would do |
|---|---|---|
| `scripts/bootstrap/doctor.sh` | signer check | Tell the owner to `brew install openssh` when nothing is wrong, and stop `land.sh`. The flake |
| `scripts/bootstrap/doctor.sh` | OATH and break-glass account checks | A false fix, or a missing note |
| `scripts/bootstrap/land.sh` | the preflight's moved-file test | Skip `git apply --check` for a scenario patch that touches a moved file (SPEC-001-R213) |
| `scenarios/b9-replay.sh` | "read any secret" | Read a secret in `env` as none, and report BOUNDARY HELD (SPEC-001-R28) |
| `scripts/bootstrap/aws-setup.sh` | key, device and code checks, and three `printf … \| head -n 1` | A wrong answer; at line 703, an assignment that ends an `\|\|` list, `set -e` would end the script |
| `scripts/bootstrap/github.sh` | branch policy and stale variable checks | A second POST of the `main` branch policy, or a variable left behind |

Every pipe into `grep -q` in a script that sets `pipefail`, and every builtin piped into `head` with no `|| true`, now reads a here-string or a captured variable. A here-string feeds exactly the value and one newline, as `printf '%s\n'` did. A capture that ends in `|| true` turns a failed command into an empty value, which matches nothing, as the failed pipeline did.

`land.sh`'s control character check keeps its pipe into `grep -m 1`. It uses the output, its `|| true` keeps a SIGPIPE harmless, and a here-string would drop the NUL bytes it looks for.

## The tests

| Test | What it proves |
|---|---|
| `test/doctor.test.ts`, "finds the security-key type in a list longer than two pipes hold" | The `ssh` stub prints 10,000 filler types, about 350 KB. The old check failed it 5 times in 5; the new one passes |
| `test/pipe-early-exit.test.ts` | No script that sets `pipefail` pipes into `grep -q`, or into `grep -m` or `head` without `\|\| true`, over continued lines too. Its patterns are tested on the shapes that failed and on their variants |
| `test/test-check.test.ts` | The test check's new output, end to end in a temporary directory, from report shapes Vitest 4.1 itself wrote |

## The test check

SPEC-001-R15 is amended. On a failure the check now prints, on standard error and in the run summary, each failing test's file, titles and duration, and its message up to the first stack frame. Standard output keeps the one failure line (SPEC-001-R1).

Vitest records a test that ran past its time limit as `Error: STACK_TRACE_ERROR`, so its duration is what shows it. A file that failed with no failing test, as when a `beforeAll` hook throws, gets a line that says so.

Each line starts with `FAIL ` or with two spaces, a bar and a space. Control characters are shown as `\uXXXX`, and `##[` as `##\[`, because the Actions runner reads an old-style `##[command]` anywhere in a line.

## Preflight

In a scratch worktree with the batch's 11 moves applied as `land.sh` applies them, on `main` at `40c3188`:

| Step | Result |
|---|---|
| File modes, `LAND.txt` | No mode changes; printable ASCII only |
| `tsc --noEmit`; ESLint on the 4 changed TypeScript files; `bash -n` on the 5 scripts | Clean |
| Vitest | 440 of 440 on Linux, and 440 of 440 with a Homebrew-style `node@24` and a BSD-style `seq` first on `PATH` |
| `checks.ts` trace, slides, secrets | Pass, with the full history fetched |
| Scenario patches that touch a changed file | None |
| `npm run progress` | No change |
| The same loaded loop that failed 4 times in 29 | 20 of 20 passed |

## Independent review

A subagent reviewed the diff, `LAND.txt`, the spec rows and the backlog item, without this note. It confirmed the cause with `strace`, and found the shell replacements equivalent and portable to bash 3.2.

| Finding | What changed |
|---|---|
| The doctor test was not certain: about 98 KB failed only some of the time, because grep reads up to a pipe-full before it matches | The stub prints its own filler, past twice a pipe |
| `aws-setup.sh` piped into `grep -q` across two lines, and the guard read one line at a time and missed `egrep`, prefixes, `\|&` and `grep -m` | A here-string there, and a guard that joins continued lines and knows those shapes |
| The runner reads `##[command]` anywhere in a line, and U+0080 to U+009F passed through | `##[` shown as `##\[`; C1 characters escaped |
| A time limit printed only `STACK_TRACE_ERROR`, and a failed hook only the file | Durations, and a line for a file with no failing test |
| R15 left out the 300 character cut, the "more failing tests" line and the summary's heading; the frame match took any line that starts "at "; the cut could split an emoji | R15 says each; the frame must be indented; the cut counts code points |
| `traceability.md` did not list the new tests | In the batch |
| A second pass: `pipe-early-exit.test.ts`'s titles named R213 and R28 without their `SPEC-001-` prefix, so the trace check would not count them | Full IDs in the titles |

## Not done, and why

- `ssh-keygen` is still missing from the cloud environment, so ten tests in five files fail in a cloud session. That is a change to the claude.ai setup script, an owner setting, and out of this item's scope.
- The check still prints the last 4,000 characters of Vitest's console output, unescaped, as before. R15's escaping covers the lines this batch adds.
- The review's second pass found two nits, left as they are. `shown()` does not double a backslash, so the text `\u001b` reads the same as an escaped character: doubling every backslash would make paths and patterns in messages harder to read, and the ambiguity is not a safety problem. The guard accepts a `|| true` anywhere on a line, not only on the pipeline it judges: it is a tripwire behind review, and scoping it would mean parsing shell.

## Landing

Until this lands, `main`'s `doctor.sh` still has the race. If `land.sh` stops at the doctor with "lists no security-key type", nothing has changed: run it again.

`land.sh` replaces itself with `git mv`, a rename, so the copy that is running keeps reading its old file to the end. That was tried on 2026-11-15.

## After landing

The batch landed on 2026-11-16 as `46d402d`, approver-signed. Its candidate run 43860517594 on `candidate/land-t5f` and `main`'s run 43860994026 passed, and the deploy was skipped (SPEC-001-R232).

### A failing test, named in the run

Commit `6b1a8b9` on `candidate/t5f-fail-demo` added one test that fails on purpose. It never lands. Its run, 43862764890, stopped at the test check and printed, on standard error:

```text
FAIL test/fail-demo.test.ts > SPEC-001-R15 fail demo > SPEC-001-R15 fails on purpose so the run summary names this test (5 ms)
  | AssertionError: expected 1 to be 2 // Object.is equality
  |     at test/fail-demo.test.ts:7:15
```

Standard output held one line, `CHECK test FAILED: test/fail-demo.test.ts`. The log has no `could not append the failing tests to the run summary` line, so the summary was written. GitHub's API does not return a job's summary, so the summary itself was read only on the run's page.

### 20 runs of one commit

`main`'s run 43860994026 was re-run 20 times, attempts 2 to 21, from 12:01 to 13:13 UTC. Each attempt ran the same commit, `46d402d`, on a fresh GitHub-hosted `ubuntu-24.04` runner. GitHub documents that a re-run uses "the same GITHUB_SHA (commit SHA) and GITHUB_REF (git ref) of the original event" and that "a workflow run can be re-run a maximum of 50 times" (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs, read 2026-11-16).

| Attempts | Checks job | Run | Deploy |
|---|---|---|---|
| 2 to 21 | 20 of 20 passed | 20 of 20 `success` | Skipped. The job lists for attempts 2 and 17 to 21 show it skipped, and no attempt waited for an approval |

Each passing run passed every test file, `test/land.test.ts`, `test/land-presign.test.ts` and `test/land-owner.test.ts` among them. Each attempt also signed two attestations for the same zip, 40 in all. The receipt check reads the newest 100 (SPEC-001-R50).

What 20 passes prove, as arithmetic and not a measurement: before the fix, `test/land.test.ts` failed once in 30 GitHub runs (run 274, after 29 passes). At that rate, 20 passes in a row would still happen 51% of the time with the bug in place, and 89 would be needed for 95% confidence. At the loaded cloud rate, one in seven, 20 passes would happen 5% of the time. So the causal evidence is the doctor test that failed 10 times in 10 on the old code and passes on the new. The 20 runs show that nothing else in the land tests fails often on GitHub's runners.
