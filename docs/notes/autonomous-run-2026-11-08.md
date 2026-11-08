# Autonomous run, 2026-11-08

The owner was away from about 19:10 UTC. The agent worked through the owner's work list of that day, unattended, and staged everything that needs a signature as batches under `proposals/`. Nothing was pushed to `main`. Every commit sits on one chain on `candidate/auto-2026-11-08`, on top of `main` at `5351b63`, starting with `e82fdfe` (four stale README passages), which had not landed.

Status: done; the hand-off below is the owner queue.

## Log

| Time (UTC) | Step | Result |
|---|---|---|
| 19:12 | Setup check | `node_modules` holds 198 entries; `npx vitest --version` prints `vitest/4.1.12 linux-x64 node-v24.22.2`. So the agent ran every preflight itself. No `ssh-keygen` here, so 3 signature tests fail locally as on `main` |
| 19:13 | Sync | `main` at `5351b63`; `e82fdfe`'s parent is `5351b63`, so it is the chain's first commit, unchanged |
| 19:20 | Requirement IDs | The highest SPEC-001 ID on every remote branch, and in every commit message, was R210. This run uses R211 to R217 |
| 19:25 | s7e staged (`0f233e1`) | No fix reachable in range; all 7 exceptions renewed to 2026-12-08 |
| 19:27 | s7e review fixes (`f581c3e`) | High finding fixed: zod 3 has the same flaw, so the zod override would only hide the advisory |
| 19:31 | m7a staged (`6b87dd5`, `60feb8c`) | The preflight's `git apply --check` found B8b's patch broken by the change (lesson L20); regenerated in the batch |
| 19:33 | 31r (`8f46f78`) | Agent commit: README rows for deploy-tip and the receipt check, made before any batch staged a README copy |
| 19:34 | j5t staged (`1100090`) | SPEC-001-R211 |
| 19:35 | j4e staged (`0996458`) | SPEC-001-R212 |
| 19:40 | m7a review fixes (`95a5e0a`) | Two medium, six low |
| 19:44 | u3u staged (`caff40b`) | SPEC-001-R213 |
| 19:50 | j5t, j4e review fixes (`72e003f`) | j4e high: agent output in the log could fail or fake a result; verdict now from GitHub's run and step conclusions |
| 19:52 | l3q staged (`13da8d3`) | SPEC-001-R214 |
| 19:53 | MODEL and AUTHOR memo (`b116f95`) | Nothing staged for either line |
| 19:58 | utq restaged (`2efad6f`) | R207 and R208 renumbered to R215 and R216 |
| 20:03 | u3u review fixes (`6c851d4`) | Two critical: the preflight inherited `GIT_LITERAL_PATHSPECS=1`, and the staged `land.test.ts` missed a file. Both fixed |
| 20:03 | Hook false positive | The `no-sign` hook refused one of the agent's commands because its text named the SSH agent variable, which a new test sets to prove the preflight drops it. It logged a `signing-attempt` in the ignored `.claude/security-events.log`. Nothing signed; the edit was redone with the Write tool |
| 20:08 | l3q review fixes (`8f93e12`) | Four medium, all fixed |
| 20:10 | utq review fixes (`b0c871c`) | Two medium, all fixed |
| 20:12 | 7v1 restaged (`bf49374`, `1f9524e`) | R210 renumbered to R217; account ID, email and SCP policy ID replaced by placeholders |
| 20:14 | k9s (`02e52b5`) | Blocked: kokoro-onnx 0.6.1 has no program to run. Decision note, nothing staged |
| 20:16 | Landing-order check (`ef423f6`) | Simulated `land.sh`'s "Changed since by" check across the landing order: every warning reports "keeps every line" |
| 20:25 | 7v1 review fixes | Nothing critical; its high finding was already fixed by `ef423f6`; one medium, seven low, fixed or recorded. The landing-order check re-run: still no copy lacks a line |

An out-of-memory kill hit one process at about 19:56, while a reviewer's test run overlapped the agent's. Every preflight after it was re-run and passed.

## Preflights

Each batch was preflighted by applying its moves, and every earlier batch's in landing order, in a scratch worktree and committing them unsigned, as `land.sh` does, then running `tsc`, ESLint on the changed files, every vitest test, the trace, slides, secrets, workflows and allowlist checks, `bash -n` on changed scripts and `git apply --check` on every scenario patch. Each run had only the 3 failures this container always has (`spawnSync ssh-keygen ENOENT` in `test/land.test.ts`, `test/signatures.test.ts` and one test in `test/checks.test.ts`).

| Batches applied, in order | Tests passed | Other | Result |
|---|---|---|---|
| sca-renewal | 213 | OSV-Scanner with the staged exceptions: exit 0 | ok |
| role-arn-secrets | 221 | B8b through the real harness: `CHECK workflows FAILED: unpinned-uses` | ok |
| all eight, in landing order (sca-renewal is independent) | 284 | `iac` (Terraform fmt, validate, tflint) and `sast` (Semgrep `p/default`) on the moved tree: exit 0. 19 of 19 scenario patches apply | ok |

## Hand-off

### 1. What is staged

Landing order is the table's order. Each later batch's spec, `traceability.md` and `README.md` copies carry every earlier batch's changes, and its `requires:` lines refuse it until the earlier one has landed.

| # | Batch | Backlog | Files it moves | Requirements | Review: findings, and what was done | Notes |
|---|---|---|---|---|---|---|
| 1 | `proposals/sca-renewal/` | s7e | `specs/sca-exceptions.toml` | Spec: R10 | 1 high (zod reasoning), 4 low. All fixed | `docs/notes/sca-renewal-2026-11-08.md` |
| 2 | `proposals/role-arn-secrets/` | m7a step 2 | 4 workflows, `github.sh`, `aws-setup.sh`, the spec, `test/producer.test.ts`, `test/aws-setup.test.ts`, B8b's patch | Amends R85, R86; Spec: R27, R30 | 2 medium, 6 low. All fixed except a workflows-check rule for `vars.*_ROLE_ARN` (a test enforces it) and zizmor's auditor-persona finding on triage, both recorded | `docs/notes/role-arn-secrets.md` |
| 3 | `proposals/cloud-session-setup/` | j5t | `scripts/bootstrap/cloud-session-setup.sh` (new), its test, the spec, `traceability.md`, `README.md` | New R211 | 1 medium, 3 low. All fixed | `docs/notes/cloud-session-setup.md` |
| 4 | `proposals/producer-script/` | j4e | `scripts/bootstrap/producer.sh` (new), its test, the spec, `traceability.md`, `README.md` | New R212 | 1 high, 2 medium, 6 low. All fixed | `docs/notes/producer-script.md` |
| 5 | `proposals/land-presign/` | u3u | `scripts/bootstrap/land.sh`, `test/land-presign.test.ts` (new), `test/land.test.ts`, the spec, `traceability.md`, `README.md` | New R213; Spec: R41 | 2 critical, 2 high, 4 medium, 6 low. All fixed except a macOS run of the full suite, which the next landing gives | `docs/notes/land-presign.md` |
| 6 | `proposals/agent-rules/` | l3q | `CLAUDE.md` (staged as `CLAUDE.proposed.md`), `.claude/hooks/hook.mjs`, `.claude/settings.json`, `test/hook.test.ts`, the spec, `traceability.md` | New R214; Spec: R39 | 4 medium, several low. All fixed except the tripwire's known misses, recorded | `docs/notes/agent-rules.md` |
| 7 | `proposals/npmrc/` | utq | `specs/protected-paths.txt`, `pipeline.yml`, `scripts/checks.ts`, `scenarios/run.ts`, `scenarios.yaml`, B18's and the new B81's patches, three test files, `practices.yaml`, `docs/practices.md`, `video/explanations.yaml`, `.claude/settings.json`, the spec, `traceability.md` | New R215, R216; amends R68; Spec: R38 | 2 medium, 6 low. All fixed except stale "npm run checks" text outside the batch, recorded | `docs/notes/npmrc-node-options.md` |
| 8 | `proposals/break-glass-mfa/` | 7v1 | `infra/sandbox/iam.tf`, `infra/sandbox/main.tf`, `infra/org/main.tf`, `aws-setup.sh`, `aws.sh`, `test/break-glass.test.ts` (new), `test/aws-setup.test.ts`, the spec, `traceability.md`, `README.md` | New R217; Spec: R30 | 1 high (already fixed), 1 medium, 7 low. All fixed except a stricter Terraform test and the quarterly drill, recorded | `docs/notes/break-glass-mfa.md`, `docs/decisions/0007-break-glass-mfa.md` |

Candidate runs on `candidate/auto-2026-11-08`: runs 124 to 136 passed, one per push; the tip's run is in the final message.

Agent commits on the chain that need no signature: `e82fdfe` (README), `8f46f78` (31r, README check table), the notes above, `b116f95` (MODEL and AUTHOR memo), `bf49374` (decision 0007, runbook, verification rows), `02e52b5` (k9s note) and this log.

### 2. Owner queue

One step at a time. Each step runs in a terminal at your local clone, on `main`, unless it says otherwise. Every `land.sh` step ends at a deploy approval in GitHub ([`main`'s pipeline runs](https://github.com/PaulDuvall/who-gets-the-keys/actions/workflows/pipeline.yml?query=branch%3Amain)), and `land.sh` prints the run to approve. From step 9 on, `land.sh` is the new one: it runs its preflight after your review and before it asks to sign, and needs network for `npm ci`. Your security key must not blink during the preflight.

When a `land.sh` step prints "Changed since by" warnings, answer yes only if each says "The staged copy keeps every line those commits added". The files that will warn are listed per step.

0. Check that no `main` deploy waits for approval. Success: no rows.

```bash
gh run list --repo PaulDuvall/who-gets-the-keys --workflow pipeline.yml --branch main --status waiting
```

1. Move `main` to the chain's tip. Success: `Landed <short SHA> on main.` Then approve its deploy; it changes no Lambda. If it says main has moved, tell the agent. The tip SHA is in the final message; this form reads it from GitHub:

```bash
scripts/bootstrap/land.sh --to-main "$(git ls-remote origin refs/heads/candidate/auto-2026-11-08 | cut -f1)" candidate/auto-2026-11-08
```

2. Land the sca renewal, before 2026-11-22. No warnings expected. Success: `Landed ... on main.`; approve the deploy.

```bash
scripts/bootstrap/land.sh proposals/sca-renewal
```

3. Copy the four role ARN variables into secrets of the same names, before step 4: a run fixes its secrets when it starts, so the landing's own deploy needs them first. One command each. Success: `gh secret list` shows the four names.

```bash
gh secret set DEPLOY_ROLE_ARN --repo PaulDuvall/who-gets-the-keys --body "$(gh variable get DEPLOY_ROLE_ARN --repo PaulDuvall/who-gets-the-keys)"
```

```bash
gh secret set TRIAGE_ROLE_ARN --repo PaulDuvall/who-gets-the-keys --body "$(gh variable get TRIAGE_ROLE_ARN --repo PaulDuvall/who-gets-the-keys)"
```

```bash
gh secret set PROBE_ROLE_ARN --repo PaulDuvall/who-gets-the-keys --body "$(gh variable get PROBE_ROLE_ARN --repo PaulDuvall/who-gets-the-keys)"
```

```bash
gh secret set PRODUCER_ROLE_ARN --repo PaulDuvall/who-gets-the-keys --body "$(gh variable get PRODUCER_ROLE_ARN --repo PaulDuvall/who-gets-the-keys)"
```

```bash
gh secret list --repo PaulDuvall/who-gets-the-keys
```

4. Land the role ARN batch. No warnings expected. Approve the deploy. Success: `Landed ... on main.`, and the deploy log shows `role-to-assume: ***` (replace `<run ID>` with the run `land.sh` printed):

```bash
scripts/bootstrap/land.sh proposals/role-arn-secrets
```

```bash
gh run view <run ID> --repo PaulDuvall/who-gets-the-keys --log | grep -m 1 'role-to-assume'
```

5. Run `github.sh --vars` from `main`, which sets the four secrets again from Terraform's outputs and deletes the four variables. It reads Terraform state, so it needs the sandbox profile, and it keeps the current triage model. It asks twice; answer y to both after reading what it will set. Success: `gh variable list` shows no `*_ROLE_ARN`. If `terraform output` fails, delete the four variables with `gh variable delete <NAME> --repo PaulDuvall/who-gets-the-keys` instead.

```bash
AWS_PROFILE=wgtk-sandbox-admin TRIAGE_MODEL="$(gh variable get TRIAGE_MODEL --repo PaulDuvall/who-gets-the-keys)" scripts/bootstrap/github.sh --vars
```

```bash
gh variable list --repo PaulDuvall/who-gets-the-keys
```

6. Land the cloud session setup script. Warns for `specs/SPEC-001-delivery-pipeline.md`. Approve the deploy; the next deploy log should again show `role-to-assume: ***`, which proves nothing reads the deleted variables.

```bash
scripts/bootstrap/land.sh proposals/cloud-session-setup
```

7. In claude.ai, open the cloud environment menu in a session's title bar, then Edit, and replace the Setup script with the one line in the README's "Cloud session environment". Then start a fresh session on `main`. Success: `node --version` prints `v24.22.2` and `npm run check:typecheck` passes.

8. Land producer.sh. Warns for the spec, `traceability.md` and `README.md`. Approve the deploy.

```bash
scripts/bootstrap/land.sh proposals/producer-script
```

9. Land the `land.sh` preflight. This landing still runs the old `land.sh`, so no preflight runs for it. Warns for the spec, `traceability.md` and `README.md`. Approve the deploy; the new `land.sh` prints the approval URL from the next landing on.

```bash
scripts/bootstrap/land.sh proposals/land-presign
```

10. Land the CLAUDE.md rules and the hook. The first landing with the new preflight: it must print `Preflight passed.` before `Sign and land?`. Warns for the spec and `traceability.md`. Approve the deploy.

```bash
scripts/bootstrap/land.sh proposals/agent-rules
```

11. Land the `.npmrc` batch. Warns for the spec, `traceability.md`, `.github/workflows/pipeline.yml` and `.claude/settings.json`. Approve the deploy. Then `scenarios.yml`'s run on `main` must pass: it is the first to observe B81's line, which is derived, not yet observed.

```bash
scripts/bootstrap/land.sh proposals/npmrc
```

12. Before signing, do `docs/notes/break-glass-mfa.md` step 1: check that `ykman info` lists OATH, and that a CloudTrail trail is logging. Then land break-glass, and leave its deploy waiting. Warns for the spec, `traceability.md`, `README.md`, `scripts/bootstrap/aws-setup.sh` and `test/aws-setup.test.ts`. Then, in a second terminal at the same checkout, follow the runbook's steps 4 to 7: lift the SCP, run `aws-setup.sh` (it enrolls the break-glass user's TOTP device on your YubiKey), check the SCP is back, and check the four boundary calls and their alert emails. Only then approve the deploy (step 8 there). The runbook has the exact commands and the plan to expect at each apply; the account ID, policy ID and email in them are placeholders you fill from your shell profile. If you take more than an hour, `land.sh` stops polling and starts watching the run; approve it from the URL it printed.

```bash
scripts/bootstrap/land.sh proposals/break-glass-mfa
```

13. Delete the two branches this run restaged from. They were staged before the history rewrite, and `claude/epic-dijkstra-7xi2um` still holds the sandbox account ID, your email and the SCP's policy ID. The agent may not delete branches. Success: `git ls-remote` lists neither.

```bash
git push origin --delete claude/epic-dijkstra-7xi2um claude/hopeful-sagan-ae220j
```

```bash
git ls-remote origin claude/epic-dijkstra-7xi2um claude/hopeful-sagan-ae220j
```

### 3. Questions for you, each with a recommendation

| # | Question | Recommendation |
|---|---|---|
| 1 | s7e: renew all 7 now, as staged, or upgrade first? | Renew now; no real fix exists, and the zod override would only hide its advisory |
| 2 | Add a requirement that the sca check warns, without failing, when an exception expires within 7 days? | Yes, after T3b |
| 3 | T3b MODEL line (versus D05): A keep `not recorded`, B the model the producer role may invoke, for verified runner deliveries, C an attested model | B now, C later (`docs/notes/t3b-model-author-decision.md`) |
| 4 | T3b AUTHOR line (R71): A as drafted, B verify the producer run and its patch artifact, C none until promote | B |
| 5 | k9s: Kokoro has no program of its own. A one GPL-licensed driver file as the separate program, B a third-party CLI package, C a driver generated at setup, D keep the import, E Piper | A, with the backlog criterion amended (`docs/notes/k9s-kokoro-separate-program.md`) |
| 6 | m7a: give the triage job an environment, so its secret sits outside the repository scope (zizmor's auditor finding)? | Not now: the secret is an ARN, and the trust policy pins the workflow |
| 7 | m7a steps 3 and 4: delete or let expire the old run logs that show the account ID, and whether to rewrite history. The 7v1 review also found your email and the SCP's policy ID in `main`'s history (`git log -S`) | Decide after step 2 lands, as planned. Leaning: let logs expire; no history rewrite, since earlier clones keep them anyway |
| 8 | l3q: where the private-repository denylist lives, for a hook that refuses those names | A file outside the repository, read by the hook only when present, such as one under your home directory; never committed |
| 9 | Decision 0006 #17, DAST | (b): record that DAST does not apply; the export service has no HTTP surface |
| 10 | Decision 0006 #22, dependency allowlist in the session | (b): build the `allowlist-staged` hook mode; the pipeline's allowlist check stays the control |
| 11 | Backlog x2r, the full scope rule | Adopt it after T3b lands, with `docs/`, `proposals/` and `.tasks/` as drafting paths |
| 12 | Backlog nlq: amend criterion 1 (the experiment) or reopen | Amend: GitHub's documentation answered it |
| 13 | j5t: the setup script runs as root from whatever branch a session checks out | Accept: it changes only that session's container, and `main`'s copy is signed |
| 14 | Decision 0007's three open decisions: a trail in `infra/sandbox` if none logs; session length; IAM Roles Anywhere later | As 0007 recommends: a trail in `infra/sandbox` if needed; keep 3600 s; revisit Roles Anywhere after the talk |
| 15 | utq: text that still says the checks job runs `npm run checks` (`video/kit.ts`, `docs/slide-reconciliation.md`, an R30 test title, R1's wording) | Leave R1 and the video kit; the agent fixes the slide reconciliation in an agent commit after the batch lands |

### 4. Not done, and why

| Item | Why |
|---|---|
| k9s, Kokoro as a separate program | Blocked on question 5: kokoro-onnx 0.6.1 ships no program, so the decision cannot be built as written |
| MODEL and AUTHOR receipt lines | Blocked on questions 3 and 4, as the work list said |
| The private-repository denylist hook (part of l3q) | Blocked on question 8 |
| `test/land.test.ts`'s staged change was not run | It needs `ssh-keygen`, which this container lacks. The reviewer ran it with a stand-in and found the file-list bug, now fixed. The landing's candidate run in step 9 is its first real run |
| B81's expected line, and the full suite on macOS | Observed only after landing: `scenarios.yml` on `main` (step 11), and the owner's first preflight (step 10) |
| The SHA in this log's first version for m7a's staging commit | Was wrong (`8e2c5d2`); it is `6b87dd5`, then `60feb8c` |
| Backlog 7v1's quarterly break-glass drill, and the stale "npm run checks" text outside the utq batch | Out of the batches' scope; the drill keeps 7v1 open, and the text is question 15 |
