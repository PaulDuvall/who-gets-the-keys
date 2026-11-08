# Prompt: align who-gets-the-keys with the factory video

Derived on 2026-11-06 from the factory video, revision 18, and updated on 2026-11-07 for revision 19, which draws the factory's boundary. The video was then built in PaulDuvall/paulmduvallcom; since 2026-11-08 it lives in this repository's `factory-video/` (decision 0007). The repository state it compares against is PaulDuvall/who-gets-the-keys `main` at `c7b91a5`, before decision 0006 answered it.

Paste everything below the line into a Claude Code session in PaulDuvall/who-gets-the-keys.

---

## Task

The talk's software-factory video shows a delivery model, from a customer's intent to production. Make this repository's specs and decisions describe everything the video shows, so it can be built. The video is described in full below, so you do not need to watch it.

Where the video and this repository disagree, do not pick a side silently. Either propose requirements that make the repository match, or list a correction to the video. Put every such choice in front of the owner.

You are drafting, not deciding. Write only under `docs/` and `proposals/`, as CLAUDE.md requires. The owner signs anything that reaches `specs/`.

## Ground rules

- Follow CLAUDE.md. Say "check" for automated verification and "gate" only for a human approval. Say "customer", never "client". A failing check prints one line: `CHECK <name> FAILED: <identifier>`.
- Commit and push the way CLAUDE.md says: unsigned agent commits with `Agent: Claude Code`, a candidate branch first, and a fast-forward to `main` only after the checks pass.
- Write requirements in the EARS style SPEC-001 uses: `WHEN`, `WHILE`, `WHERE` or `IF`, then `THE <component> SHALL`. One behaviour per requirement, each with its exact failure line.
- Give every new requirement a scenario that proves its check fails on a bad change. Give each scenario the next free B number, its check, its exact failure line and its harness mode, as decision 0005's Scenarios table does.
- Number requirements after the highest SPEC-001 ID used anywhere in `specs/`, `proposals/` and `docs/`. On 2026-11-06 that was R143, from decision 0005, and scenarios ended at B48. Verify both before you allocate.
- Never invent a fact. A name, threshold, account, model, tool or vendor you cannot find in the repository goes under "Decisions for the owner" or "Not yet verified".
- Do not run `terraform`, `aws`, or a dependency install. Infrastructure changes are proposals under `proposals/infra/`.
- Date every external source you cite, and prefer primary sources.

## Read first

| Path | Why |
|---|---|
| `CLAUDE.md` | Conventions and authority boundaries |
| `docs/decisions/0004-factory-model.md` | The factory model the video started from |
| `docs/decisions/0005-signatures-and-triggers.md` | Proposed: two-person approval tiers, release signatures, alarm-started runs, the ORIGIN and TRIGGER receipt lines (R111 to R143) |
| `docs/notes/spec-to-production-factory.md` | The owner's design notes, revised 2026-11-06 |
| `docs/slide-reconciliation.md` | Slide claims and their status. Rows R08, R23, R34, R35, R36, R38 and P39 matter here |
| `docs/deviations.md` | Especially D26, D27 and D29 |
| `specs/SPEC-001-delivery-pipeline.md`, `traceability.md`, `practices.yaml` | The signed requirements and their tests |
| `.claude/hooks/hook.mjs`, `.claude/settings.json` | What runs inside the agent's session |
| `infra/org/`, `infra/sandbox/` | Accounts, roles and the service control policy |
| `proposals/phase-1/` | How a staged spec change is laid out |

## Terms

The video draws the factory as more than the pipeline. Use these terms, and write them into the decision's Terms table.

| Term | What it holds | Who signs it |
|---|---|---|
| Factory | Everything that turns a signed spec into a deployed change: the agent sandbox's rules (agent instructions, hooks, settings, in-run checks), issue triage and the quarantined reader, the pipeline, and the policy (receipt policy, approval tiers, alarm-to-task mapping) | Two engineers (0005 approval tiers) |
| Pipeline | The part of the factory that decides and ships: the checks of record, promotion to `main`, signing the evidence, deploy. It holds the keys | As the factory |
| Work orders | Specs and tasks | One engineer per change |
| Inspector | The drift monitor in a separate security account. It watches the factory and production, and sits outside the factory | Owners distinct from the factory's signers (owner decision, G2) |
| Release sign-off | The optional human judgment before production, by tier | One engineer who did not write the spec |

Decision 0004 already defines the factory this way: "The pipeline, the checks and the configs they read, the receipt policy and the agent inputs (R97). Specs and tasks are not factory files." The factory patterns in R97 cover `.github/`, so the triage workflow is already a factory file. Verify both.

## What the video shows

Each claim has an ID for traceability. On-screen text and narration are quoted exactly. Appendix A has the full narration, and Appendix B the on-screen text and receipts.

| ID | Claim | Where it appears |
|---|---|---|
| V01 | A customer states intent. An engineer captures it as a spec and signs it with a security key and a touch | Intake row; narration line 1 |
| V02 | One engineer signs a spec | Rule line "One engineer signs a spec, two the factory, one a release by tier."; line 15 |
| V03 | Two engineers sign the factory: the pipeline, its checks and the policy | "FACTORY v1 · two signers"; receipt factory row "v1 · two signers"; line 15 |
| V04 | The agent works in a cloud session, one run per task, and holds no keys | Agent card "cloud session, one run per task"; "The agent can write anything. It can't ship anything."; line 2 |
| V05 | Checks run inside the session: a hook flags a test that asserts nothing, and a dependency allowlist applies. A failed in-run check makes the agent retry | "In-run checks: Empty tests, Dep allowlist"; "RETRY 1/3" on T-0042; line 2 |
| V06 | The agent pushes only a candidate branch. Promotion to `main` happens after the checks, out of the agent's reach | "candidate/*"; "promote to main, out of reach"; line 4 |
| V07 | The pipeline runs the checks of record without the coding agent: SAST, DAST, SCA, Secrets and Scope, then Property, Mutation and Validator | PIPELINE container; line 3 |
| V08 | Scoped AI checks can fail a change, never pass one | "checks of record · AI can only fail"; line 3 |
| V09 | Only the pipeline signs the evidence and holds the deploy key | Deploy "pipeline signs the evidence, holds the key"; receipt "signed by: pipeline · out of reach"; line 4 |
| V10 | Where the policy tier requires it, an engineer who did not write the spec checks staging, then signs the release | Dashed gate before Production "signs the release, by tier"; line 4 |
| V11 | Free text from customers, agents, docs and URLs is untrusted and never starts a run | "Untrusted input · never starts a run"; "customers, agents, docs, URLs"; line 6 |
| V12 | An issue carrying an injection stops at the sandbox wall (NO RUN). An engineer checks it against the specs, and it becomes SPEC-118 rev 2, signed, then task T-0043 | Issue #4821 card with "ignore previous instructions…"; "Engineer checks it against the specs"; lines 7 and 8 |
| V13 | An issue's free text is a quarantined notes field | "notes: quarantined" on the issue card |
| V14 | Known errors start from alarms that the signed policy already maps to a task. No human approves each run | Lines 7 and 13; Telemetry flashes "alarm → approved task"; T-0044 enters as "trusted signal" |
| V15 | Production telemetry is untrusted. A quarantined reader fills a fixed schema, and its free text never reaches the agent | Telemetry "schema fields only"; line 12 |
| V16 | The receipt records where a change began: the owner, an untrusted issue, or a telemetry alarm | Receipt task rows "T-0042 · owner", "T-0043 · untrusted issue", "T-0044 · telemetry alarm"; line 10 |
| V17 | The receipt shows factory, intent, task, author (cloud session and attempt), checks, deploy (a release sign-off, or "no sign-off, policy v3") and signed by | Receipt panel; Appendix B |
| V18 | A separate security account watches the pipeline and production for drift. The pipeline cannot touch it | "Security account · watches for drift"; line 14 |
| V19 | Production opens only for a change whose evidence is complete | "No evidence, no deploy."; Production "locked"; "The agent advises. The pipeline acts." |
| V20 | The factory is the sandbox and its rules, issue triage and the pipeline, approved by two signers. Specs, the security account, the release sign-off and Production sit outside it | A blue dashed frame around the AGENT SANDBOX, Untrusted input and the PIPELINE, with "FACTORY v1 · two signers" on its top edge |

## Starting map

This is my reading of `main` at `c7b91a5` on 2026-11-06. Treat every row as a lead to verify, not a fact.

| Claim | Covered by | Status as read |
|---|---|---|
| V01 | Decisions 0003 and 0004; D26; SPEC-001-R12 | Covered |
| V02, V03 | 0005 R111 to R117: approval tiers, co-signs, `approval.two_person` | Proposed. Two signers apply only once `approval.two_person` is true (R114) |
| V04 | 0004: producer job R85, R88, R89; R108 | Covered or proposed |
| V05 | `.claude/hooks/hook.mjs` flags assertion-free tests (`vitest/expect-expect`); SPEC-001-R19 (B1) catches them in lint | Empty tests: covered. Dep allowlist: installs are denied to the session and the pipeline's `allowlist` check reads `allowed-deps.txt`, but no in-session dependency check was found |
| V06 | R68, R74, R109 | Covered or proposed |
| V07 | Check order in CLAUDE.md; slide reconciliation R08 marks DAST "not covered" because the export Lambda has no public URL | DAST is a gap |
| V08 | Slide reconciliation R23, "Independent validator: spec to code, code to spec; can fail, never pass", is partial: the validator subagent is advisory and nothing runs it | Gap |
| V09 | Decision 0002; R17; R40 | Covered |
| V10 | 0005 R120 to R124 and B41 to B48. B42 rejects a release signed by the approver who added the cited requirement | Proposed. No staging environment was confirmed for "checks staging" |
| V11 | 0004 R83, R84, R93; D27 | Covered |
| V12 | D27; the task file, R64, R65 | Covered |
| V13 | 0005 "Alarm-started runs" step 6, "Notes go to a separate record for humans"; R127 | Proposed for telemetry. Public GitHub issues have no schema, and triage is label-only (R93) |
| V14 | 0005 R125, R126, R128 | Proposed |
| V15 | 0005 R127 and the term "reader" | Proposed |
| V16 | 0005 R118, R119 | Conflict. R119 records `internal` for every run that an alarm did not start, so T-0043 would read `internal`, not "untrusted issue" |
| V17 | 0004 receipt lines; 0005 R124 | Partly. The video folds ORIGIN into the task row and omits TRIGGER |
| V18 | Slide reconciliation R34 and R38 not covered, R35 and R36 partial, P39 not shown | Gap |
| V19 | Decisions 0002 and 0004 | Covered |
| V20 | 0004 Terms ("factory") and R97; 0005 tiers for who signs | Covered for the sandbox's agent inputs, the pipeline and the policy. Not settled: whether the quarantined reader's workflow and any AI check are factory files, and that the drift monitor is not |

## Gaps to close

### G1. AI checks that can only fail (V08, slide R23)

Propose requirements for a scoped AI check in the pipeline. Start with the independent validator: spec to code, and code to spec. Cover at least these points.

- It runs in the checks job after the deterministic checks. It has none of the coding agent's session, token or tools. Its inputs are the cited requirements and the range's diff. It has no network beyond the model endpoint and no write access.
- Its output is a fixed record: `pass` or `fail`, a reason code from a fixed list, and the requirement ID it cites. Any other output counts as `fail`.
- A `pass` changes nothing, because the deterministic checks alone decide acceptance. A `fail` fails the check with one line.
- A failure sticks to the content. Key the verdict to a digest of the delivered tree or diff, so that neither a rerun nor the agent's next attempt with the same change can clear it. Only an approver signature can override a failure, and the receipt records the override.
- The receipt records the model identifier, a digest of the prompt, and the verdict.

State in the decision that a model's verdict is not deterministic. A failing change may pass on a rerun, so the sticky failure is what keeps "can fail, never pass" true under retries.

Owner decisions to raise: the model and endpoint; whether a failed model call fails the check; the reason codes; who may override a failure, and at which tier; the time and cost budget per run.

### G2. A drift monitor in a security account (V18, slide R34, R35, R36, R38 and P39)

Propose a separate security account and a monitor the pipeline cannot reach. Cover these points.

- What it compares. The deployed artifact's digest against the latest receipt's attested digest. Pipeline and spec files against `main` and the signed history.
- Isolation. The pipeline's roles get no access to the security account, enforced by the service control policy. The monitor reads the workload account through a read-only role.
- What it does on drift: notify, and freeze deploys (R35, R36). P39 says the monitor never changes production itself, yet R34 says production is redeployed. Resolve that tension. One option: the monitor raises a signal that a two-signed mapping entry turns into a redeploy task (0005 R125).
- Scenarios that prove it: a production change with no attested run, and a pipeline file changed outside the signed history.
- Separation of duties. The monitor inspects the factory, so it must sit outside it (V20). If the factory's signers could change the monitor, two of them could weaken the very thing that checks their work. Propose that the monitor's code and configuration match none of R97's factory patterns. Propose a check that fails when a factory pattern covers a monitor path, and a check that fails when a factory signer approves a monitor change.

Owner decisions: the account; the detector, for example AWS Config, CloudTrail with EventBridge, or a scheduled comparison; the notification channel; whether drift freezes deploys; and who owns and signs the monitor. One option is a security principal listed apart from `approvers.txt`, with its Terraform in its own repository.

### G3. DAST (V07, slide R08)

The export Lambda has no public URL, so nothing runs DAST today. Choose one of these and justify it.

- Propose a DAST check against a deployed non-production endpoint, with its tool, its target and its failure line.
- Record that DAST does not apply here, and add "drop the DAST chip" to Video corrections.

### G4. The origin of work an issue prompted (V16)

The video's T-0043 receipt reads "untrusted issue". Under 0005 R119 it would read `internal`. Propose one of these and recommend it.

- (a) An optional `prompted_by` field in the task file. The engineer writes it, and it is signed with the task. It names the issue, and the ORIGIN line then reads, for example, `internal, prompted by public issue #4821 (tier 2)`. The issue's text never enters the task.
- (b) Keep R119 as it is, and add "change T-0043's receipt to internal" to Video corrections.

### G5. A schema for public issues (V13)

The video puts "notes: quarantined" on a public GitHub issue. Telemetry has a schema (R127); public issues do not. Propose whether they get one: an issue form with enumerated fields, a triage step that keeps only the fields that validate, and notes that no agent receives.

GitHub issue forms do not bind the API, which accepts any issue body. So validation has to happen in triage, and any field that fails becomes notes. Keep triage label-only (R93) unless the owner decides otherwise.

### G6. A dependency allowlist inside the session (V05)

Confirm what enforces "Dep allowlist" inside the session today. If it is only a permission rule that denies installs, choose one of these:

- Propose a hook that checks changes to `package.json` against `allowed-deps.txt` at edit time.
- Add a relabel to Video corrections.

### G7. A staging environment for the release signer (V10)

The narration says the release signer "checks staging". Confirm that a staging environment exists that the release signer can check before signing. If it does not, propose one, or add a Video correction.

## Deliverables

1. `docs/video-reconciliation.md`: one row per claim, V01 to V20. Each row gives the requirement IDs, a status (covered, proposed, gap, or the video is wrong) and the evidence, as a file and line or a scenario.
2. `docs/decisions/0006-<topic>.md`, status Proposed, in the shape of 0005:
   - sections: Context, Terms, What changes, Draft requirements, Scenarios, Plan with tasks, Decisions for the owner, Not yet verified, Sources;
   - it covers G1 to G7;
   - where it amends 0005 (G4), its header says so, as 0005's header does for 0004.
3. Proposed spec text under `proposals/`, laid out the way `proposals/phase-1/` stages a spec change.
4. Updated rows in `docs/slide-reconciliation.md` for R08, R23, R34, R35, R36 and R38, pointing to the new requirements.
5. A "Video corrections" section in the decision, listing every place where this repository decides the video is wrong. Give the on-screen text or narration line to change. The video will be updated from that list.

## Acceptance criteria

- [ ] Every claim V01 to V20 has a row and a status in `docs/video-reconciliation.md`. Checked by counting 20 rows.
- [ ] Every row with status "proposed" or "gap" names at least one draft requirement ID or one Video correction. Checked by reading the table.
- [ ] Every new requirement is in EARS form with exactly one failure line `CHECK <name> FAILED: <identifier>`. Checked by reading the Draft requirements table.
- [ ] Every new requirement has a scenario numbered B49 or later, with its check, failure line and harness mode. Checked against the Scenarios table.
- [ ] No new requirement or scenario ID collides with one already used in `specs/`, `proposals/` or `docs/`. Checked with `git grep`.
- [ ] Nothing changed under `specs/`, in `approvers.txt`, or in a path listed in `specs/protected-paths.txt`. Checked with `git diff --stat origin/main`.
- [ ] `npm run checks` passes on the candidate branch.
- [ ] Every owner decision lists its options and a recommendation, and none is decided in the text. Checked by reading "Decisions for the owner".

## Out of scope

- Implementing the checks, hooks, workflows or infrastructure. This task makes them buildable; implementation follows the plan once the owner signs.
- The video, its captions and its narration. Corrections go in the Video corrections list.
- Mapping the receipt to PCI DSS or NIST SP 800-53 controls. Decision 0005's "Regulated environments" section covers that.
- Decision 0005's open questions that the video does not touch.

## Appendix A. Narration, verbatim

| Line | Camera | Narration |
|---|---|---|
| 0 | Overview | This is a software factory. Follow one change from intent to production. |
| 1 | Intake | A customer states intent. An engineer captures it as a spec, and signs it with a security key and a touch. |
| 2 | Agent | The agent works in a cloud session, one run per task. A hook flags a test that asserts nothing, and the agent fixes it. |
| 3 | Pipeline | Then the pipeline runs the checks of record, without the coding agent: scans, scope, and tests proven to catch broken code. Scoped AI checks can fail a change, never pass one. |
| 4 | Deploy to Production | The patch is promoted to main, out of the agent's reach, and only the pipeline signs the evidence. Where the tier requires it, an engineer who didn't write the spec checks staging, then signs the release. |
| 5 | Overview | Now an issue comes in. |
| 6 | Issue lane | Free text is untrusted. Whether it comes from a customer, an agent, a doc or a URL, it never starts a run. |
| 7 | Issue panel | This one becomes work through a spec an engineer signs. Known errors start from alarms the policy already signed. |
| 8 | Follows the spec | The signed spec queues as a new task. |
| 9 | Overview | It runs the same checks as every other change. |
| 10 | Deploy to Production | Its receipt records that it began as an untrusted issue, and traces it through the spec to the deploy. |
| 11 | Overview | (silent) |
| 12 | HOURS band | Production telemetry is untrusted too. A quarantined reader fills a fixed schema, and its free text never reaches the agent. |
| 13 | Telemetry and Agent | Only an alarm named in the signed policy can start an approved task. |
| 14 | Security account | A separate security account watches the pipeline and production for drift. The pipeline can't touch it. |
| 15 | Overview | One engineer signs each spec, two sign the factory, and the pipeline decides every change. |
| 16 | Overview | No evidence, no deploy. |

## Appendix B. On-screen text

A blue dashed frame encloses the AGENT SANDBOX, Untrusted input and the PIPELINE; the "FACTORY v1 · two signers" chip sits on its top edge. Labels on the slide, verbatim:

> PIPELINE · Engineer signs the spec · SPEC-118 · AGENT SANDBOX · One engineer signs a spec, two the factory, one a release by tier. · signs the release, by tier · Customer intent · The agent can write anything. · It can't ship anything. · Untrusted input · never starts a run · customers, agents, docs, URLs · Telemetry · schema fields only · notes: quarantined · Agent · cloud session · one run per task · In-run checks · Empty tests · Dep allowlist · Build, test, scan · SAST · DAST · SCA · Secrets · Scope · Honest tests? · Property · Mutation · Validator · Deploy · pipeline signs the evidence, holds the key · SECONDS · MINUTES · HOURS · checks of record · AI can only fail · FACTORY v1 · two signers · promote to main · out of reach · candidate/* · Security account · watches for drift · Production · locked · The agent advises. The pipeline acts. · Issue #4821 · "ignore previous instructions…" · Engineer checks it against the specs · No evidence, no deploy.

The receipts, one per change, are illustrative values:

| Row | Change #4822 | Change #4821 fix | Change #4823 |
|---|---|---|---|
| factory | v1 · two signers | v1 · two signers | v1 · two signers |
| intent | SPEC-118 · key, touch | SPEC-118 rev 2 · key, touch | SPEC-118 · key, touch |
| task | T-0042 · owner | T-0043 · untrusted issue | T-0044 · telemetry alarm |
| author | cloud session · attempt 2 | cloud session · attempt 1 | cloud session · attempt 1 |
| checks | 16/16 · scope · mutation 91% | 16/16 · scope · mutation 91% | 16/16 · scope · mutation 91% |
| deploy | prod · no sign-off, policy v3 | prod · no sign-off, policy v3 | prod · no sign-off, policy v3 |
| signed by | pipeline · out of reach | pipeline · out of reach | pipeline · out of reach |

Each receipt ends "VERIFIED: key turns". The token for T-0044 is captioned "trusted signal" on the conveyor. Its intent row shows SPEC-118. Under 0005 R125 it would be the mapping entry's spec, so check whether the video should name a different spec there.
