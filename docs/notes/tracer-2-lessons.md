# Tracer 2: lessons from T1 and T2, 2026-11-07

T1 and T2 took one working day. The design held, but much of the owner's time went on manual steps, stale deploys, account set-up nobody had checked and probes that tested the wrong thing. Each row below names what happened, what it cost, and the change that stops it happening again. A script or check is preferred to a note wherever one is possible.

Status: proposed. Nothing in the "Systematize as" column is built yet unless the row says so. Each open row is an item in `.tasks/backlog.jsonl`; "Backlog" below maps them.

## The account and the platform

| # | What happened | Cost | Systematize as | Where |
|---|---|---|---|---|
| L1 | An `ACTIVE` inference profile was not callable. Sonnet 5.5 needed an accepted Marketplace agreement, and even then the account's applied quota was 0 tokens per minute (default 6,000,000). Every Claude 4.7 and 5.x model had 0 | One failed probe, four diagnostic rounds, a model switch | `aws-setup.sh` refuses, before any write, a model whose agreement is not `AVAILABLE` (`get-foundation-model-availability`) or whose applied cross-region quota is 0 (Service Quotas), and makes one real `converse` call with the admin profile. The quota request for Sonnet 5.5 is pending (ID `a0116af473f24b3a8318eb65e330979emyLAOEaY`) | `scripts/bootstrap/aws-setup.sh`, signed batch |
| L2 | `who-gets-the-keys-break-glass` could not be assumed from the owner's IAM Identity Center session: its trust requires `aws:MultiFactorAuthPresent`. It had never been assumed, and only it can change its own trust under the SCP | The model switch had to lift the SCP from the management account (route C) | Route B, queued as its own task: a principal that can assume break-glass with TOTP MFA. Then a break-glass drill: assume it once a quarter and confirm the alert email arrives | Task "Make the break-glass role assumable with MFA" |
| L3 | `main`'s ruleset did not count `checks` from the producer's dispatched run (`workflow_dispatch` by `github-actions[bot]`), though name, app ID 15368 and commit matched. The same commit's `checks` from the owner's `push` run counted | The good path needed the owner to re-push the commit to a candidate branch | T3 decides how a producer delivery gets counted checks: the owner's re-push (0004 Phase A), the owner dispatching `pipeline.yml`, or a GitHub App token (a new key holder). A first experiment separates event from actor: the owner dispatches `pipeline.yml` on a producer branch | T3 |
| L4 | The claude.ai cloud environment was not recorded anywhere, had no `node_modules`, and its Node was 22, while `package.json` needs 24 | No real `tsc` or vitest in the agent's session, so every batch needed an owner preflight | Done: the setup script and README "Cloud session environment". T3 moves the script into `scripts/bootstrap/cloud-session-setup.sh` with claude.ai holding a one-line call | T3 |

## Claude Code in the runner

| # | What happened | Cost | Systematize as | Where |
|---|---|---|---|---|
| L5 | Claude Code 2.1.304 forces `default` mode while `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is set, with or without `--allowedTools` | Two probes, one design decision (option A) | Done: R88 accepts `dontAsk` or `default` and the probe proves denial. A Claude Code version bump in R88 or R207 must be followed by a probe before any task | `docs/notes/tracer-2-t2-producer.md` owner steps |
| L6 | Claude Code runs a built-in, non-configurable set of read-only commands in every mode. The probe used `uname`, which ran, so the check printed `BROKEN` about nothing | One probe and one signed landing | Done: the probe's unlisted command writes (`touch`). Rule for any probe: the forbidden action must be one the control is documented to stop | This file |
| L7 | The model adds `allowed_domains` to its first `curl`. A prompt line "do not retry" then stopped it before the request that shows the proxy's 403 | One probe with an `INVALID` egress result | The probe prompt says not to set `allowed_domains`. Rule: a probe prompt must not contain an instruction that can prevent the evidence | Next producer batch |
| L8 | The egress check read only the first `curl` attempt, the refused one. Replaying run 42400602621's real transcript found it before landing | Would have been one more failed probe | Keep every probe transcript as a test fixture under `test/fixtures/producer/` and run the check steps against them in vitest, so a check change is tested on real runs, not only on hand-made ones | Next producer batch |

## The owner's steps

| # | What happened | Cost | Systematize as | Where |
|---|---|---|---|---|
| L9 | Four signed landings in one day for the producer (`4812f27`, `0fd9906`, `31ac807`, `3422d04`), each found by the previous probe | Four preflights, four taps, four deploy approvals | Run the check steps against recorded transcripts (L8) before staging. Batch fixes found the same day into one landing | Practice |
| L10 | The preflight was a pasted one-liner. It hit zsh's read-only `status`, macOS bash 3.2 (`mapfile`), and terminals without Node 24 on `PATH` | Three failed or repeated preflights | `land.sh` runs the moved tests itself before it asks to sign, under `bash` with a Node version check, so the preflight stops being a separate step | `scripts/bootstrap/land.sh`, signed batch |
| L11 | Workflow steps used bash 4 features that tests run with the first `bash` on `PATH`, 3.2 on macOS | One failed preflight | A test that refuses `mapfile`, `readarray`, `declare -A` and `${x,,}` in workflow `run:` blocks | `test/`, next batch |
| L12 | Stale deploys: three `main` runs for docs-only staging commits held the `pipeline-deploy` slot while waiting for approval. One approval went to a stale run, and one of the owner's pending deploys was cancelled by a newer push | Two refused deploys, one cancelled deploy, confusion over which run to approve | The deploy job runs only when deployable paths changed (`src/`, `infra/sandbox/`, the lockfile, the build), so docs and proposals commits never wait at the gate. Until then the agent pushes nothing to `main` while a deploy waits | Spec change, signed batch; agent rule now |
| L13 | `land.sh` said "main's run did not pass ... fix the problem" when only the deploy was cancelled or rejected | Confusion | `land.sh` names the failed job and says "nothing to fix" when only the deploy was cancelled or rejected | `scripts/bootstrap/land.sh`, signed batch |
| L14 | Dispatching the producer and finding its run took two commands, and `sleep 5 && gh run list --limit 1` picked up the previous run. Reading a result meant `gh run view --log` and a `grep` | Repeated questions about which run and where the result is | `scripts/bootstrap/producer.sh probe` and `producer.sh task <ID> ...`: dispatch, find the run created after the dispatch time, watch it, and print only the `Permission mode`, `BOUNDARY`, `RUN ENDED` and `CHECK` lines | `scripts/bootstrap/`, signed batch |

## The agent's instructions to the owner

These are the agent's own lessons. They belong in `CLAUDE.md` through a signed change.

| # | What went wrong | Rule |
|---|---|---|
| L15 | "Wait for the run" did not say which run or which terminal | Every owner step names the terminal, the command, the one line that means success, and what to do on anything else |
| L16 | Several steps were sent at once while a previous one was still running | One step at a time; the next step only after the agent has read the previous step's result itself |
| L17 | The agent pushed staging commits to `main` while the owner's deploy waited | Never push to `main` while any deploy waits for approval |
| L18 | The agent's first probe designs were not checked against the platform's documented behaviour | Before a probe, quote the documented behaviour it relies on, and replay any existing transcript through the check |

## Order

1. Next producer batch (no AWS change): L7, L8, L11 (`who-gets-the-keys-1kw`).
2. T3's signed batch: L3 (`nlq`), L4 (`j5t`), L10 and L13 (`u3u`), L14 (`j4e`), and L15 to L18 in `CLAUDE.md` (`l3q`).
3. A pipeline batch: L12 (`nh9`).
4. `aws-setup.sh`: L1 (`far`).
5. Separate task: L2 (`7v1`).

## Backlog

Moved from GitHub issues 1 to 10 to `.tasks/backlog.jsonl` on 2026-11-07. Each item's description is the issue's body, and each issue is closed with a pointer to its ID. `spec_ref` names the requirement IDs an item amends, `SPEC-001 new` when it needs a requirement not yet numbered, or is empty when no spec changes.

| ID | Lessons | Priority | `spec_ref` | Title |
|---|---|---|---|---|
| `who-gets-the-keys-nlq` | L3 | 1 | SPEC-001-R209 | Decide how a producer delivery gets checks that main's ruleset counts |
| `who-gets-the-keys-u3u` | L10, L13 | 1 | SPEC-001-R41 | Make land.sh test a batch before signing and explain a cancelled deploy |
| `who-gets-the-keys-nh9` | L12 | 1 | SPEC-001-R40 | Run the deploy job only when deployable paths change |
| `who-gets-the-keys-7v1` | L2 | 1 | SPEC-001 new | Make the break-glass role assumable with MFA, and drill it |
| `who-gets-the-keys-l3q` | L15 to L18 | 1 | none | Add the agent's owner-step rules to CLAUDE.md |
| `who-gets-the-keys-utq` | none (independent review of T2) | 1 | SPEC-001-R12, SPEC-001 new | Protect .npmrc and run the checks without npm's project config |
| `who-gets-the-keys-1kw` | L7, L8, L11 | 2 | SPEC-001-R87 | Harden the producer egress probe and test its checks on real transcripts |
| `who-gets-the-keys-j4e` | L14 | 2 | none | Add producer.sh to dispatch, find and summarise producer runs |
| `who-gets-the-keys-far` | L1 | 2 | SPEC-001-R28, SPEC-001-R30 | Make aws-setup.sh refuse a Bedrock model the account cannot call |
| `who-gets-the-keys-j5t` | L4 | 2 | SPEC-001 new | Version the cloud session setup script in the repo |

L5 and L6 are done, and L9 is practice, so they have no item. The five rows of the Backlog table in `docs/notes/carry-over-2026-11-07.md` not covered above are items `31r`, `ld4`, `0v4`, `wum` and `6bt`.
