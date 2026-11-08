# T3b: the MODEL and AUTHOR receipt lines need two owner decisions

Date 2026-11-08. Status: open; nothing is staged for either line. Tracer 2's T3 plan said "MODEL becomes real because the runner pins the inference profile" (`docs/notes/tracer-2.md`), but the signed spec says otherwise, and the drafted AUTHOR rule mislabels a runner delivery. Both need an answer before T3b's receipt lines can be drafted.

## What is true today

| Fact | Source |
|---|---|
| Every receipt record's model is `not recorded`, whatever trailer the commit carries | Signed SPEC-001-R45 and R55; owner decision D05 of 2026-11-05, in decision 0002. Reason: trailers are written by the agent and nothing attests them |
| A runner delivery's commit carries `Task:`, `Spec:`, `Agent: Claude Code` and `Producer-Run: <run URL>`, written by the publish job, not the agent | SPEC-001-R208; `commitMessage` in `scripts/ci/producer.ts` |
| The producer's role may invoke one inference profile, `producer_inference_profile` in `infra/sandbox/variables.tf` (Sonnet 4.6 today), and its foundation model only through it. The SCP lets only break-glass change the role | SPEC-001-R86; `infra/sandbox/iam.tf`; `infra/org` |
| An unsigned commit can carry any trailer, `Producer-Run:` included | Inference from SPEC-001-R12: only protected paths need a signature |
| Draft R71 (decision 0004) labels a commit with `Agent:` and `Task:` trailers `cloud session on <branch>, environment not recorded`, and names producer runs only for commits that promote made | Decision 0004, "Draft requirements". Promote (0004 Phase B) is not built, and the publish job's commits carry both trailers, so R71 as drafted would call a runner delivery a cloud session (`docs/notes/factory-video-gaps.md`, "Not yet verified") |

## MODEL: options

| Option | What the line says | Cost | Risk |
|---|---|---|---|
| A. Keep D05 | `not recorded` for every commit | None | Honest, and says nothing. T4's receipt already shows it |
| B. Permitted model, runner deliveries only | `<profile ID> (the only model the producer role may invoke, per infra/sandbox at <commit>)` for a delivery whose producer run the build job verifies (see AUTHOR, option B); `not recorded` otherwise | Amend R45 and R55, record a decision superseding D05 for runner deliveries; the build job reads the Terraform variable at the delivery's parent | It states what IAM allowed, not what ran. Drift between the Terraform and the applied role is possible, because break-glass can change the role (inference). The wording "may invoke" says so |
| C. Attested model | The model from the transcript's `system` `init` event, signed by a new attest step in `producer.yml` and verified by the receipt check | A new job with `attestations: write` and `id-token: write` in `producer.yml`; a new predicate type; the receipt verifies a second subject | Strongest. The transcript is written by Claude Code, outside the agent's working directory; whether the agent's sandbox can write to it is not verified |

Recommendation: B now, as T3b's slice, and C as a later slice. B needs no new key holder and no new signer, and its value comes from signed, protected content, not a trailer, which is what D05 objected to. Confidence: medium. The owner's answer supersedes D05 in part, so it belongs in decision 0002 beside D05.

## AUTHOR: options

| Option | Rule | Cost | Risk |
|---|---|---|---|
| A. Draft R71 as written | Producer runs only for promote's commits; `Agent:` plus `Task:` means a cloud session | None now | Mislabels every runner delivery until promote exists |
| B. Verify the producer run | A commit with a `Producer-Run:` trailer reads `producer run <ID> attempt <n>` only when the build job verifies, through the API, that the run is `producer.yml` on `main`, dispatched by the owner's account, concluded `success`, with its head SHA equal to the commit's parent, and that the run's `producer-patch` artifact equals the commit's diff. Otherwise a commit with an `Agent:` trailer reads `agent, as reported, environment not recorded`, and any other the committer, as reported | Amend draft R71 before signing it; the build job needs `actions: read`; the artifact's 7-day retention bounds when a delivery can land with its AUTHOR line (inference: `land.sh --delivery` usually runs within an hour) | A forged `Producer-Run:` trailer on an unsigned commit fails the diff match and falls back to "as reported" |
| C. No AUTHOR line until promote | Leave R71 a draft | None | T3b's receipt keeps "AGENT ... (as reported by the commit)" only |

Recommendation: B. It is the only option under which the receipt can say a runner, not a session, made the change, without trusting a trailer. Confidence: medium; the artifact comparison has not been prototyped.

## What the owner decides

1. MODEL: A, B or C. Recommended: B now, C later.
2. AUTHOR: A, B or C. Recommended: B.
3. If B for both: whether a delivery older than the patch artifact's 7-day retention lands with `not recorded` and `as reported`, or is refused. Recommended: land it with those labels; a missing artifact must not block `main`.
