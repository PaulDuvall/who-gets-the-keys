# The line runs through the factory

One picture for the talk. The pipeline is an assembly line inside a factory. Each control is drawn as the factory part an audience already knows.

![The pipeline drawn as an assembly line through a factory: engineering upstream, eight stations on the line, traceability and release downstream, plant security around it](factory-map.png)

## How to read it

- Left to right is the way a change travels: from engineering, through the agent's robot cell and eight stations, to shipping and the release dock.
- A person signs every drawing, not every part. Every change to a spec, or to the line itself, needs the approver's key (SPEC-001-R12). Other changes pass on the checks alone.
- Station numbers follow the repository's check order: the ordered checks of SPEC-001-R1, then the scope check of SPEC-001-R68.
- A reject tag marks what a station catches. It stands for the failure line `CHECK <name> FAILED: <identifier>`.
- The table below names each control's proof in this repository. A `B` ID is one of the deliberately bad changes in [`scenarios/scenarios.yaml`](../scenarios/scenarios.yaml), each with the exact failure line the pipeline must print. An `R` ID is a requirement row in SPEC-001, or SPEC-014 where it says so.

| Color | Family | Meaning |
|---|---|---|
| Slate | Engineering | Approved intent |
| Orange | Stations | Automated checks |
| Green | Traceability | Proof of the build |
| Yellow | Plant security | The walls: what the agent cannot reach |
| Blue | Sign-off | A person signs: a gate |
| Dashed | Audit | Advisory, not a gate |

## The controls

| Control | Factory picture | In this repository |
|---|---|---|
| Spec | One small drawing per change, signed before that part is built | `specs/`, changed only by an approver-signed commit. SPEC-014-R7, one row for one feature, was signed with its task file in `c7c6b4d`, then built and deployed: tracer slice T4, landed 2026-11-08 (`docs/notes/tracer-2.md`). B4, an agent rewriting acceptance criteria to fit its code, fails the signatures check |
| Task file | Kanban card: build exactly what's on it | `tasks/<ID>.task.md` (SPEC-001-R64). B24, a task citing an unapproved requirement, fails the task check |
| Agent | Robot cell: builds the part, never releases it | Claude Code. The runner producer, `producer.yml`, runs it with no allowed network host |
| Hooks | Error-proofing fixture: blocks mistakes, not intent | `.claude/hooks/hook.mjs`: `no-sign` (SPEC-001-R39), `no-session-link` (R214), `no-inner-worktree` (R230), `gitleaks-staged`, `expect-expect` |
| Secrets scanning, station 1 | Master key left inside the product | gitleaks, `check:secrets`. B5, a hard-coded secret |
| Allowlist, station 2 | Approved-supplier list | `allowed-deps.txt`, `check:allowlist`. B6, an invented package name, adds `csv-export-turbo` |
| SAST, station 3 | Each part checked for known failure modes, before it runs | Semgrep `p/default`, `check:sast`. B12, command injection in your code, passes a request-supplied filename to `child_process.exec` |
| SCA, station 4 | Incoming lots checked against recalls | OSV-Scanner, `check:sca`. B13, command injection in imported code, adds `lodash@4.17.20`, advisory GHSA-r5fr-rjxr-66jc |
| Trace, station 5 | Every part links to its drawing and its test | `check:trace`. B3, a code change with no spec ID; B15, a requirement with no test; B16, a capability with no requirement |
| Property testing, station 6 | Tested across the full tolerance range | `test/export.property.test.ts`, run by `check:test`, for SPEC-014-R1, every row out in order, and R2, quoting |
| Mutation testing, station 7 | Red rabbit: a known-bad part proves the sensor works | Stryker, `check:mutation`, break threshold 95 (SPEC-001-R16). B2, a weak assertion |
| Scope, station 8 | A part not on the kanban comes off the line | The scope check (SPEC-001-R67). B23, a change outside the task's scope, edits a file the task does not produce |
| Provenance | Build record: which line built it, and from what | SLSA build provenance, and the SPEC-001-R45 predicate: the commit, its spec IDs and its `Agent:` trailer. The model is always `not recorded` |
| Attestation | Certificate of conformance, checked at receiving | The attest job signs (SPEC-001-R48). Deploy verifies before any AWS call (SPEC-001-R17). B10, an unattested artifact reaching deploy |
| Receipt | Checked as it leaves the line, and again at receiving | The receipt job verifies the attestations and prints seven lines (SPEC-001-R50, R55); the deploy job verifies them again (R56) |
| Release dock | The end of the belt: release on evidence | The deploy job, after the receipt check passes again (SPEC-001-R56). Today a person also approves it: see below |
| Approver signature | Your own lockout padlock: only your key opens it | A FIDO2 key in `approvers.txt`, with a touch. The signatures check (SPEC-001-R12). B17, a tampered source of record; B18, an agent loosening the pipeline without a signature |
| Irreversible change | Scrapping master tooling needs sign-off | The deploy plan check (SPEC-001-R18). B14, an irreversible change without approval, replaces `aws_dynamodb_table.export_jobs` |
| Break-glass | Override key in an alarmed box | One IAM user with a TOTP code, and an alert email on every use (SPEC-001-R217) |
| Untrusted input | Mail room reads the note, holds no keys | B9, poisoned issue 4821: its injected actions are denied under the triage job's token and egress |
| SCP | Corporate safety rule no plant can waive | `infra/org`. B11, a non-deploy principal writing the sandbox: the denial comes from the service control policy |
| Validator | Auditor who never sees the operator's notes | `.claude/agents/validator.md`: the spec, the diff and test results only. Advisory, outside the checks |

## Where the picture is not literal

- A factory approves a product's drawings before the line starts. Here a drawing is one spec row for one change, signed just before that part is built, and amended as customer feedback comes in.
- The release dock shows the design. Today the owner still approves each `sandbox` deploy that changes a deployable path (SPEC-001-R232). Backlog `who-gets-the-keys-g4e` removes that reviewer, after `who-gets-the-keys-s3p` lands. Since 2026-11-20 the agent pushes each change to `main` once its checks pass, by working practice, not by the ruleset; the owner signs what needs a signature.
- An unsigned commit that also rewrites the check code can pass, because the checks run from the pushed commit. SPEC-001, "Checks before `main`", accepts that gap until the signer moves out of the agent's reach.
- Hooks read only command text, so a script the agent writes can pass them (SPEC-001, "Local sessions"). The approver's key is the control.
- An attestation proves who signed a claim, not that the claim is true. The receipt's SIGNED line says so: `editable by the agent`.
- A recall says a part is bad, not that this use reaches the flaw. Each SCA exception must say why it is not reached (SPEC-001-R234).
- The validator gives a second opinion. It is not a gate.
- There is no andon cord. Practice P43 is `not-shown`: each station stops the line on its own defect, and nothing stops it when defects climb.
- The commit `a1b2c3d` is a placeholder. Issue 4821, `csv-export-turbo`, `lodash 4.17.20` and `exec(file)` come from the scenarios.

## Sources

- Jidoka, stopping automatically on an abnormality: Toyota, [Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/index.html), read 2026-11-15.
- Red rabbit, a known-defective part run through an error-proofing device to prove it rejects it: Ease, [The Importance of Poka Yoke Verification](https://www.ease.io/blog/poka-yoke-verification/), a vendor article, read 2026-11-15.

## Changing the picture

[`factory-map-prompt.md`](factory-map-prompt.md) keeps the owner's instructions that shaped the map, the rules they set, and a prompt that rebuilds or updates it. `factory-map.html` is the source. Render it at 1920 by 1080 with device scale 2 to update `factory-map.png`. The page loads Barlow, Barlow Condensed and IBM Plex Mono from Google Fonts, so the render needs that network access.
