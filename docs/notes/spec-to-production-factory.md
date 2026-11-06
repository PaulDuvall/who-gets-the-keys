# Spec-to-Production Factory: Design Notes

Working notes from the post-talk discussion, November 2026. Concept stage.

## 1. Evolved model

- Humans define specs. A cloud-based Claude Code session does the work, merges automatically, and pushes through the pipeline.
- The pipeline is the source of truth. It deterministically decides whether a change is acceptable.
- Every change produces a receipt: signed evidence that SCA, SAST, spec conformance and other controls ran and passed, with provenance and attestations.
- Optional final human step before production: a review in staging of whether the change does what the user wanted. It is only reachable once a complete receipt exists.
- The human digitally signs the release. The signature attests to intent and outcome, not to the code.

## 2. Where human signatures go

| Point | What is signed | Why |
|---|---|---|
| Spec approval | The spec or policy going in | Auto-merge makes the spec the highest-risk human artifact. A bad spec yields a well-attested wrong feature |
| Release | Behavior matches acceptance criteria and user intent | Judgment the pipeline cannot make |
| Pipeline changes | Changes to controls and pipeline config | Prevents silent weakening of controls |

## 3. Segregation of duties

- Purpose: prevent one person (or colluding people) from defining and approving the same thing.
- Agent-as-author plus human-as-approver will likely not satisfy auditors. The agent is treated as a tool of whoever triggered it.
- Stronger position: two people define and digitally sign each policy. The policy then executes deterministically, with tamper-evident provenance and evidence.
- Pipeline config changes get the same two-person signed treatment.
- A spec's author should not be the sole release signer for that spec.
- No regulation explicitly requires a human review of every change. Per-change human approval is slower and weakens security.

## 4. Regulated environments

- Open question from an enterprise attendee: has this been done in highly regulated environments? Answer: not yet. Very few people can claim it.
- Position: roughly 90% of the controls are the same. Digital evidence is far ahead of manual review.
- The remaining gap is auditor acceptance, which comes from precedent.
- Next steps: map the receipt to specific controls (for example PCI DSS requirement 6, NIST 800-53 CM-3), then run one regulated pilot.

## 5. Untrusted input

Principle: you cannot detect everything, so contain it.

### Sources and risk tiers

- Production telemetry: attacker-reachable (user agents, URLs, form fields, echoed error messages). Highest tier.
- Public GitHub issues: attacker-reachable. Highest tier.
- Customer requests via a team member: lower tier, unless the customer's text is pasted verbatim.
- Tier follows who actually wrote the text, not who filed the issue. The tier is set by the source, never by content.
- Default: everything is untrusted. Trust is assigned per field, not per issue.

### Issues trigger, specs instruct

- Errors: the coding agent receives structured fields plus a normalized stack trace containing only frames that resolve to real files and functions in the repo.
- Features: the issue never reaches the coding agent. A human translates it into a spec change, which is signed. The agent works from the spec.

### Draft issue schema

| Field | Constraint |
|---|---|
| Source | Enum: telemetry, public issue, internal |
| Risk tier | 0, 1, 2. Derived from source |
| Spec ID | Must resolve to an existing spec |
| Error class | Fixed enumerated list |
| Location | File and line, verified against repo |
| Count | Integer |
| Notes | Quarantined free text. Human-readable only, never passed to the coding agent |

### Containment controls

1. Quarantined reader: one agent reads raw telemetry and emits only enumerated schema fields.
2. Sandboxed coder: no network egress, scoped credentials, no write access to specs, tests or pipeline config.
3. Blast-radius limits: caps on diff size and allowed paths for telemetry-originated fixes. Over the cap escalates to a human.
4. Provenance on the receipt: records that the change originated from untrusted input.
5. Rate limits: prevents attackers from flooding errors to keep the factory busy.

### Graduated trust

- Start with a human review of generated issues (cheap to review) for telemetry and public issues.
- Track the unchanged-approval rate. Remove the review for low-risk error classes first, once data supports it.

## 6. Open questions

- Exact enumerated error classes and stack-trace normalization rules.
- Which controls the receipt maps to first.
- Candidate customer for a regulated pilot.
- How this connects to the existing video-generation session work.

## Relation to this repository

Added when these notes were captured on 2026-11-06. It lists where the notes differ from what the repository does or proposes today, so a later decision can reconcile them. Nothing here is decided.

| Idea in the notes | This repository today | Difference to resolve |
|---|---|---|
| Name: spec-to-production factory | Decision 0004 (proposed) names it the spec-to-receipt software factory | Pick one name |
| The cloud session merges automatically | The agent lands its own unprotected commits through `candidate/`, then `main`. Protected batches land only by the approver's signed commit. Decision 0004 Phase B moves promotion out of the agent's reach | Whether the session itself may move `main`, or only a promote step it cannot reach |
| The human signs the release, attesting intent and outcome | Decision 0004 keeps a required reviewer on a production tier, an approval in GitHub rather than a signature | A signed release record, and where the receipt holds it |
| Two people sign each policy and each pipeline change | One approver key in `approvers.txt`; SPEC-001-R12 requires one approver signature | A two-signature rule for specs, policy and protected paths |
| Pipeline changes are signed | Decision 0004 lets a mechanically proven tightening land with no signature | Whether proven tightenings still need two signatures |
| Errors from telemetry may trigger a run with structured fields | Decision 0004: issues, comments and web pages never start work; only an approver-signed spec change does | Whether a schema-checked error report may start a run, and at which risk tiers |
| The receipt maps to controls such as PCI DSS requirement 6 and NIST 800-53 CM-3 | No control mapping exists yet | A mapping table, then one regulated pilot |
