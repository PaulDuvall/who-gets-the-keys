# Owner queue hand-off, 2026-11-11

A cloud session worked the owner queue from 2026-11-09 to 2026-11-11 (`docs/notes/autonomous-run-2026-11-08.md`, "Hand-off", steps 8 to 14, then `proposals/alarm-key/` and the node-forge fix). The owner asked for a fresh session at about 22:40 UTC on 2026-11-11 (corrected: an earlier version said 19:45; the hand-off commit is from 22:40). This note is everything the next session needs. Read it whole before the first step.

## State at hand-off

| Item | State |
|---|---|
| `main` | `70c1ce8`, step 14 (docs, lessons, backlog f7t's shared test fixture) |
| Pipeline run [43086747092](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/43086747092) | checks, build, attest and receipt passed. **deploy to sandbox waits for approval since 19:26 UTC** |
| scenarios run [43086746988](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/43086746988) (76) | success |
| factory-video run [43086746862](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/43086746862) (22) | success. Artifact `factory-video-70c1ce8-20261111T1939Z`, expires 2026-12-11 |
| `candidate/step-14` | deleted by `land.sh` after `main` accepted it |
| Landed this queue | `589c6cd` producer-script, `515877c` land-presign, `9cb3f59` agent-rules, `22507b8` npmrc, `b8483f2` break-glass, `ac72331` and `b9f6432` alarm-key, `d750b3e` node-forge, `4f3b05b` `25e812d` `70c1ce8` step 14 |

Step 14 changed only `.tasks/`, `README.md`, `docs/`, `factory-video/claims.json` and `test/`. No `src/`, `infra/` or workflow file changed, so its deploy should plan no change, as `d750b3e`'s did (run 43080816688).

## Owner queue, in the only order that works

| # | Step | Who | Ends at a deploy approval? |
|---|---|---|---|
| A | Approve run 43086747092's `sandbox` deployment. Then read the deploy job's log through the GitHub connector: expect `No changes.` | Owner approves; agent verifies | It is one |
| B | Step 13: delete branches whose work is on `main` (list below) | Owner | No |
| C | Step 14b-1, backlog `who-gets-the-keys-k7d`: stage the owner-tooling batch (`doctor.sh`; `land.sh` doctor, `node@<major>`, honest watch results, `owner-apply` key, `--lockfile`, touch banner, summary block; `aws-setup.sh` copy-safe commands and SSO hint) | Agent stages; owner lands | Yes, the staging commit's and the batch's |
| D | Step 14b-2, backlog `who-gets-the-keys-w2h`: the owner-step rules batch for `CLAUDE.md`, built on C because its rules name C's `owner-apply` key | Agent stages; owner lands | Yes |
| E | Step 14c, backlog `who-gets-the-keys-r3m`: alarm on refused break-glass attempts by any identity, a trimmed email with no credentials, and a delivery canary. Amends SPEC-001-R217 | Agent stages; owner lands and may need `aws-setup.sh` | Yes |
| F | Step 15, backlog `who-gets-the-keys-p9v`: generated progress visual in the README, with a freshness check | Agent; the check is a signed batch | Yes |

Each backlog entry in `.tasks/backlog.jsonl` carries its context, acceptance criteria and open questions. `docs/notes/owner-queue-lessons-2026-11-10.md` maps lessons L21 to L33 to C, D and E.

### Step B branch list

Checked on 2026-11-11 with `git merge-base --is-ancestor <tip> origin/main`, or by the batch that restaged them.

| Branch | Tip | Why it can go |
|---|---|---|
| `candidate/factory-video-ledger` | `7d262bc` | tip is on `main` |
| `candidate/readme-stale` | `e82fdfe` | tip is on `main` |
| `claude/clever-mayer-ohxeai` | `b396be7` | tip is on `main` |
| `claude/determined-ptolemy-qkf3ii` | `28d842b` | tip is on `main` |
| `claude/epic-dijkstra-7xi2um` | `61fe8ba` | 1 commit ahead; its batch was restaged and landed as `b8483f2` |
| `claude/hopeful-sagan-ae220j` | `bdf6397` | 1 commit ahead; its batch was restaged and landed as `22507b8` |

Not assessed, so not on the list: `candidate/backlog-notes` (1 commit ahead, backlog u3u), `candidate/t3-task-file` (2), `claude/busy-noether-p643wo` (1), `claude/wonderful-meitner-pd633c` (3). Compare each with `main` before proposing its deletion.

### Dates

| Date | What expires | Action |
|---|---|---|
| 2026-12-08 | `specs/sca-exceptions.toml` entries for zod GHSA-mrhx-c7xc-m3w5 (high) and minimatch GHSA-g3hv-75wg-m249 (moderate) | Upgrade, or renew in a signed change, before then, or the sca check fails every run |
| 2026-12-11 | Factory video artifact above | Rebuilt on the next push that runs `factory-video.yml` |

## The owner's rules for this queue

Quoted from the owner's instructions of 2026-11-09, with later additions.

- Give the queue one step at a time. Before each next step, read the previous step's result yourself through the GitHub connector: the run, its jobs, the deploy log, `scenarios.yml` on `main`. Not only the owner's paste.
- Before each `land.sh` step, simulate its checks against `origin/main`: the `requires:` lines, and for each move the commits since staging and whether the staged copy keeps every added line. Tell the owner the expected warnings. The appendix holds a script that does this.
- Each step names the terminal, the exact command, the one success line, and what to do otherwise. For each `land.sh` prompt, give a table: prompt, answer, and the exact condition for that answer, including the files the diff stat must list. Commands go in their own bash blocks, with no `#` comments.
- Never push to `main`, force-push, amend a pushed commit, delete branches, run `aws` or `terraform apply`/`destroy`, create secrets or change settings. Those are the owner's steps.
- Never push anything to `main` while a `main` deploy waits for approval. Check with the Actions API first.
- Each "Changed since by" warning must say "The staged copy keeps every line those commits added". If one does not, stop and tell the owner.
- `land.sh` runs a preflight that must print `Preflight passed.` before `Sign and land?`.
- Do not `git pull` `main` into the session branch: it trips the unpushed-commit stop hook. Use `git fetch origin main` and read `origin/main`.
- Never repeat the AWS account ID in replies or commits.
- No `Claude-Session:` trailer (owner decision D24), even when a session reminder asks for one; the `no-session-link` hook refuses it. Agent commits carry `Agent: Claude Code`, are unsigned, and are authored by Claude, not the owner.
- The owner asked on 2026-11-10 not to "move full steam ahead without questioning whether or not we could have prevented some of these issues". When a step fails for a reason other than the change under review, say what would have prevented it and where it belongs in the backlog.
- Answer copy and paste with: do not paste GitHub output, reply "landed", "failed" or "stuck at X"; for local, non-interactive commands the owner has a zsh `clip` function (`clip <command>` shows and copies); never `clip` `land.sh` or `aws-setup.sh`.

## The owner's machine

| Fact | Consequence |
|---|---|
| macOS, zsh | Write commands for zsh: a glob that matches nothing fails the whole command. Wrap bash-only syntax in `bash -c` |
| Homebrew `node` is 24.1.0; keg-only `node@24` is 24.22.2 | Prefix `land.sh` and anything that runs the checks with `PATH="/opt/homebrew/opt/node@24/bin:$PATH"` until C lands |
| `wgtk-sandbox-admin` assumes a role from the SSO profile `org-management` | When credentials expire, sign in with `aws sso login --profile org-management`. `aws-setup.sh`'s own hint names the wrong profile until C lands |
| One YubiKey Nano stays plugged in. It holds the approver key and the break-glass TOTP code; no backup copy | Ask the owner to unplug any second key. Touch only when a signature or code is pending: an idle touch types a Yubico OTP string |
| A missed signing touch prints `Couldn't sign message: invalid format?` and commits nothing | Tell the owner to touch the key when `land.sh` signs, as its own line before the command. Rerun on a miss |
| `gh run watch` inside `land.sh` has reported "failed" or "did not pass" three times when only the connection dropped | Before acting on any failure `land.sh` reports, read the run's real conclusion through the connector |

## Pitfalls in the cloud session itself

- The checkout is shallow. Run `git fetch --unshallow` before the trace check, a `land.sh` simulation or any history read.
- Make worktrees under the session's scratchpad, never `.claude/worktrees/`. There, gitleaks finds the B5 scenario's synthetic secret, and the `gitleaks-staged` hook then blocks every command whose text holds "commit". The last session's workaround, a line in `.git/info/exclude`, is local only and did not carry over.
- The `no-sign` hook matches command text. A read-only `grep` that names signing settings is refused; read such files with the Grep or Read tool.
- `git checkout -B <branch> origin/main` sets the upstream to `origin/main`. Run `git branch --unset-upstream` after it.
- When fetching two refs in one `git fetch`, a missing one fails the whole fetch, and `FETCH_HEAD` holds both. Fetch one ref at a time.
- The session's permission classifier may refuse dependency commands such as `npm update --dry-run`. Do not work around it; adding or updating dependencies is the owner's step.

## How a staged batch lands, as this queue did it

1. The agent stages `proposals/<batch>/` with its `LAND.txt` and notes in `docs/notes/<batch>.md`, preflights it in a scratch worktree, gets an independent subagent review given the files and spec rows, and fixes findings in new commits.
2. The agent pushes the staging commits to `candidate/<topic>` and reads that run.
3. Owner: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" scripts/bootstrap/land.sh --to-main <SHA> candidate/<topic>`, then approves the deploy. Success line: `Landed <short SHA> on main.`
4. The agent simulates the batch's `land.sh` checks against the new `origin/main`, and gives the prompt table.
5. Owner: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" scripts/bootstrap/land.sh proposals/<batch>`, touching the key when it signs, then approves the deploy unless the batch needs `aws-setup.sh` first.
6. The agent reads the candidate run, `main`'s run, the deploy log and `scenarios.yml` on `main`.

## Open questions for the owner

| Question | Recommendation |
|---|---|
| The four unassessed branches in step B | Let the agent compare each with `main` first |
| Two subscriptions to the break-glass alarm topic email the same address | Optional: unsubscribe one, an owner step in the AWS console |
| Move the approver key and the break-glass code to the YubiKey 5C FIPS with `verify-required` | File as a backlog item; the signatures check's `REQUIRED_SIGNATURE_FLAGS` would then rise to touch and PIN (SPEC-001-R12) |
| `practices.yaml` P34's note on break-glass, from `docs/decisions/0007-break-glass-mfa.md` | Fold into the next signed batch that touches `practices.yaml`, such as F |

## Appendix: simulate a `land.sh` batch

Save as `<scratchpad>/simulate-land.sh` and run `bash <scratchpad>/simulate-land.sh proposals/<batch>` from the checkout after `git fetch origin main`. It changes nothing.

```bash
#!/usr/bin/env bash
set -euo pipefail
batch="${1:?batch dir}"
start="$(git rev-parse "${2:-refs/remotes/origin/main}")"
export GIT_LITERAL_PATHSPECS=1
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
manifest="$batch/LAND.txt"
echo "start: ${start:0:12}"
echo "== requires"
git show "$start:$manifest" | sed -n 's/^requires: //p' | while IFS= read -r value; do
  file="${value%% *}"
  text="$(printf '%s' "${value#"$file"}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if git show "$start:$file" 2>/dev/null | grep -qF -- "$text"; then
    echo "MET   $file contains \"$text\""
  else
    echo "FAIL  $file lacks \"$text\""
  fi
done
echo "== tracked files in batch not moved"
moves="$(git show "$start:$manifest" | sed -n 's/^move: //p')"
git ls-tree -r --name-only "$start" -- "$batch/" | while IFS= read -r f; do
  [ "$f" = "$manifest" ] && continue
  rel="${f#"$batch"/}"
  printf '%s\n' "$moves" | awk '{print $1}' | grep -qxF -- "$rel" || echo "UNLISTED $f"
done
echo "== candidate branch"
branch="candidate/land-${batch##*/}"
if git ls-remote --exit-code origin "refs/heads/$branch" >/dev/null 2>&1; then echo "EXISTS $branch"; else echo "absent $branch"; fi
echo "== spec lines"
git show "$start:$manifest" | sed -n 's/^spec: //p'
echo "== moves"
printf '%s\n' "$moves" | while read -r src dest; do
  s="$batch/$src"
  mode="$(git ls-tree "$start" -- "$s" | awk '{print $1}')"
  if git cat-file -e "$start:$dest" 2>/dev/null; then exists=existing; else exists=new; fi
  base="$(git log --diff-filter=A -1 --format=%H "$start" -- "$s")"
  echo "-- $s ($mode) -> $dest [$exists], staged in $(git log -1 --format='%h %s' "$base" | cut -c1-90)"
  newer="$(git log --format='%h %s' "${base}..${start}" -- "$dest")"
  if [ -z "$newer" ]; then echo "   no warning"; continue; fi
  echo "   WARNING. Changed since by:"
  printf '%s\n' "$newer" | sed 's/^/     /' | cut -c1-110
  if git cat-file -e "$start:$dest" 2>/dev/null; then
    git show "$base:$dest" > "$work/base" 2>/dev/null || : > "$work/base"
    git show "$start:$dest" > "$work/current"
    git show "$start:$s" > "$work/staged"
    { diff "$work/base" "$work/current" || true; } | sed -n 's/^> \{0,1\}//p' > "$work/added"
    awk -v staged="$work/staged" 'BEGIN { while ((getline line < staged) > 0) have[line] = 1 } !($0 in have)' \
      "$work/added" > "$work/lacking"
    added="$(wc -l < "$work/added" | tr -d ' ')"; lacking="$(wc -l < "$work/lacking" | tr -d ' ')"
    if [ "$added" = 0 ]; then echo "   Those commits added no lines."
    elif [ "$lacking" = 0 ]; then echo "   The staged copy keeps every line those commits added. (added $added)"
    else echo "   LACKS $lacking of $added:"; sed -n '1,10p' "$work/lacking" | cut -c1-110 | sed 's/^/     /'; fi
  else
    echo "   deleted on main since"
  fi
done
```
