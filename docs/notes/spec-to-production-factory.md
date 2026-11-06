# Spec-to-Production Factory: Design Notes

Working notes from the post-talk discussion, November 2026. Concept stage. Revised November 6, 2026.

Revision, November 6, 2026. This version corrects four points in the first version:

- Section 2 merged specs and policies, so it read as two signers per spec. Policies get two signers. Specs get one.
- The release signature was listed without "optional." It is now required by policy tier, not on every change.
- Section 3 said no regulation requires approval of every change. That was half right. Section 4 now states what the standards actually require.
- Section 5 let error issues start runs, with a reader choosing the spec. Runs now start only from signals named in signed policy.

## 1. Evolved model

- Humans define specs. A cloud-based Claude Code session does the work, merges automatically, and pushes through the pipeline.
- The pipeline is the source of truth. It deterministically decides whether a change is acceptable.
- Every change produces a receipt: signed evidence that software composition analysis (SCA), static analysis (SAST), spec conformance and other controls ran and passed, with provenance and attestations.
- Optional final human step, required only where the policy tier says so: a review in staging of whether the change does what the user wanted. It is reachable only once a complete receipt exists.
- When present, the human signs the release. The signature attests to intent and outcome, not to the code.

## 2. Where human signatures go

| Point | Signers | What is signed | Why |
|---|---|---|---|
| Spec approval | One | The spec going in | Auto-merge makes the spec the highest-risk human artifact. A bad spec yields a well-attested wrong feature. |
| Policy definition | Two | The policy the pipeline enforces, including which signals may start a run | Segregation of duties sits here. Human judgment once, deterministic enforcement every time. |
| Pipeline config changes | Two | Changes to controls and pipeline configuration | Prevents silent weakening of controls. A change the pipeline proves only makes a check stricter needs no signature. |
| Release | One, when the policy tier requires it | Behavior matches acceptance criteria and user intent | Judgment the pipeline cannot make. Not required on every change, since per-change approval is slower and weakens security. |

## 3. Segregation of duties

- Purpose: prevent one person, or colluding people, from defining and approving the same thing.
- Agent as author plus human as approver will likely not satisfy auditors. The agent is treated as a tool of whoever triggered it.
- Stronger position: two people define and digitally sign each policy. The policy then executes deterministically, with tamper-evident provenance and evidence.
- A spec's author is not the release signer for that spec.
- Runs started by telemetry have no human trigger. The two people who signed the policy naming that signal count as the trigger.
- So the release signer must differ from both policy signers. Where a release signature is required, that means at least three distinct people.
- The goal is approval at the policy, not a human approval on each change.

## 4. Regulated environments

- An attendee from a large enterprise asked whether this has been done in highly regulated environments. Answer: not yet. Very few people can claim it.
- Position: roughly 90% of the controls are the same as current regulated practice. This is an estimate, and the attendee disputed the figure.
- The remaining gap is auditor acceptance, which comes from precedent.

### What the standards require (checked November 6, 2026)

| Source | Requirement (paraphrased) | Implication |
|---|---|---|
| PCI DSS 6.2.3.1 | Applies only if manual code reviews are performed | Human code review is not mandatory |
| PCI DSS 6.5.1 | Production changes follow procedures that include documented change approval by authorized parties | Every change needs an approval record |
| PCI DSS 6.5.4 | Roles are separated between production and preproduction so only reviewed and approved changes deploy | Supports separating the agent's environment from release |
| NIST SP 800-53 rev. 5, CM-3 | Review proposed configuration-controlled changes and approve or disapprove them | Approval is required. The mechanism is not specified |
| CM-3(1) and CM-3(3) | Automated mechanisms document changes, request approval, prohibit unapproved changes, and implement changes | The standard itself anticipates automating the approval workflow |

- The claim to make: every change needs documented approval, and a policy signed by two people is that approval.
- Precedent: IT service management practice (ITIL) already defines a standard change as pre-authorized, low risk, and following a known procedure.
- Inference, not settled auditor practice: whether auditors accept a signed policy as approval under PCI 6.5.1 is untested.
- Next steps: map each receipt field to PCI 6.5.1 and CM-3, then run one regulated pilot.

## 5. Untrusted input

Principle: you cannot detect everything, so contain it.

### Sources and risk tiers

- Production telemetry: attacker-reachable through user agents, URLs, form fields and echoed error messages. Highest tier.
- Public GitHub issues: attacker-reachable. Highest tier.
- Customer requests via a team member: lower tier, unless the customer's text is pasted verbatim.
- The tier follows who actually wrote the text, not who filed the issue. The source sets the tier, never the content.
- Default: everything is untrusted. Trust is assigned per field, not per issue.

### Trusted signals start runs; untrusted text never does

- Revised November 6, 2026. The first version let error issues start runs, with a quarantined reader choosing the spec ID. That choice is itself an attack lever: an attacker who can trigger errors could choose where and when the agent works.
- Signed policy declares in advance which alarm maps to which spec. An alarm crossing its threshold starts a run. An attacker can still trip an alarm, but only from that pre-approved list.
- Issue fields are data the agent reads. They never start a run.
- Errors: the coding agent receives structured fields plus a normalized stack trace containing only frames that resolve to real files and functions in the repo.
- Features: the issue never reaches the coding agent. A human translates it into a spec change, which is signed. The agent works from the spec.

### Draft issue schema

| Field | Constraint |
|---|---|
| Source | Enum: telemetry, public issue, internal |
| Risk tier | 0, 1, 2. Derived from source |
| Spec ID | Set by the signed alarm-to-spec mapping, not by the reader. Must resolve to an existing spec |
| Error class | Fixed enumerated list |
| Location | File and line, verified against the repo |
| Count | Integer |
| Notes | Quarantined free text. Human-readable only, never passed to the coding agent |

### Containment controls

1. Quarantined reader: one agent reads raw telemetry and emits only enumerated schema fields. It does not choose the spec or start a run.
2. Sandboxed coder: no network egress, scoped credentials, no write access to specs, tests or pipeline config.
3. Blast-radius limits: caps on diff size and allowed paths for telemetry-originated fixes. Over the cap escalates to a human.
4. Provenance on the receipt: records that the change originated from untrusted input.
5. Rate limits: prevent attackers from flooding errors to keep the factory busy.

Controls 2 through 5 limit how much damage a manipulated run can do. The signed alarm-to-spec mapping limits where it can happen.

### Graduated trust

- Start with a human review on generated issues for telemetry and public issues, since issues are cheap to review.
- Track the unchanged-approval rate. Remove the review for low-risk error classes first, once data supports it.

## 6. Relationship to decision 0004

- Decision 0004 in the who-gets-the-keys repo already uses the trigger model in section 5. Runs start by hand or from a scheduled failure named in signed policy.
- Proposed decision 0005 would add four things from these notes: two-person policy signing, the trigger rule for telemetry-started runs, release signatures by policy tier, and a receipt tag for changes that started from untrusted input.
- Decision 0004 currently requires one approver for pipeline changes. Decision 0005 would raise that to two and keep the rule that a proven tightening needs no signature. This is a proposal, not a decision.

## 7. Open questions

- Exact enumerated error classes and stack-trace normalization rules.
- Alarm thresholds and the format of the alarm-to-spec mapping.
- How small teams meet the three-distinct-people rule when a release signature is required.
- Whether two-person policy signing applies in every tier or only regulated tiers.
- Which receipt fields map to PCI 6.5.1 and CM-3 first.
- Candidate customer for a regulated pilot.
- The PCI DSS text was read from Microsoft Learn's requirement 6 mapping, which reflects PCI DSS v4.0. It has not been checked against the v4.0.1 original from the PCI Security Standards Council.

## Sources

- [PCI DSS requirement 6 text, via Microsoft Learn](https://learn.microsoft.com/en-us/entra/standards/pci-requirement-6)
- [NIST SP 800-53 rev. 5, CM-3 Configuration Change Control, via CSF Tools](https://csf.tools/reference/nist-sp-800-53/r5/cm/cm-3/)
