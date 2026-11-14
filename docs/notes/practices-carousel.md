# Batch notes: practices-carousel (decision 0009)

The kit, `practices-carousel/`, is unprotected and lands by `land.sh --to-main`. The batch `proposals/practices-carousel/` moves the workflow and the protected-paths copy, and needs an approver's signature. Decision 0009 holds the why; these notes hold the evidence.

## Preflight, 2026-11-14

A scratch worktree outside the checkout at `71d354e`, with the batch's two moves applied and committed as `land.sh` would, `node_modules` linked from the checkout. The owner's Mac was simulated as CLAUDE.md asks: a Homebrew-style `node@24` under `/opt/homebrew/opt/`, and a `seq` first on `PATH` that prints `1` and `0` for `seq 0`.

| Step | Result |
|---|---|
| `tsc --noEmit` | Passed |
| ESLint on `practices-carousel/` | Passed. The workflow and `protected-paths.txt` are not linted files |
| Vitest, every test | 313 passed, 28 skipped, 10 failed. The same 10 fail on unchanged `main` at `0e2acac` in the same container: `test/checks.test.ts` R12's signing test (`spawnSync ssh-keygen ENOENT`, as the container has no OpenSSH) and 9 tests in `test/land-presign.test.ts`, which stop at the doctor's signer check for the same reason. The batch changes neither file nor anything they read. The candidate run's test check covers them on a runner that has OpenSSH |
| `node scripts/checks.ts trace`, `slides`, `secrets`, `workflows` | Passed |
| zizmor 1.31.1 offline over `.github/workflows/` with the new file | No findings (11 suppressed, as on `main`) |
| `git apply --check` on scenario patches that touch a changed file | None touches one. All 19 apply |
| `npm run progress` | No change: neither the decision nor the batch changes an input it counts |
| Semgrep `p/default` on `practices-carousel/` | No findings |

The kit's own checks, `practices-carousel/build.sh` from an empty font cache: 10 of 10 passed at `71d354e`, and 11 of 11 with the poster and the review's fixes. Each check was made to fail once on purpose; decision 0009, "The checks", lists how.

## Second preflight, after the rebase onto `fc97f75`, 2026-11-14

`main` moved to `fc97f75` (backlog w8x) while the first candidate run was going, so the chain was replayed onto it with no conflict. The same preflight, at `47dc327` with the moves applied: `tsc`, ESLint, trace, slides, secrets, workflows and zizmor passed; every scenario patch applies; `npm run progress` changes nothing; `node factory-video/verify.mjs --only claims` passed, since landing touches `docs/decisions/` and `proposals/`. Vitest: 322 passed, 28 skipped and 10 failed, the same 10 tests as on unchanged `main` at `fc97f75` in this container.

The first candidate run, 43610590868 on `71d354e`, passed its `checks` job and failed its `receipt` job: `gh attestation verify` reported `Error: verifying with issuer "sigstore.dev"`. The second, 43612336637 on `b987689` in `candidate/practices-carousel-2`, did the same. Nothing in this chain changes what the build, attest or receipt jobs read.

The cause is backlog `who-gets-the-keys-r1k`, which another session diagnosed and staged in `proposals/receipt-limit/` on `candidate/progress-badge-2026-11-14` (its notes, `docs/notes/receipt-limit.md`). The Lambda zip has been the same bytes since 2026-11-12, so every run attests one digest; from its 101st attestation, at run 218, `gh` 2.103.3's paging overwrites the newest entries, and the run cannot find its own. Until that batch lands, every pipeline run fails its receipt job and `land.sh --to-main` refuses every candidate, this one included. When it has landed, this chain is replayed onto the new `main` and pushed to a new candidate branch, whose run should then pass.

## Third base, `fa38bed`, 2026-11-14

`main` moved to `fa38bed` when the receipt-limit batch (backlog r1k) landed, so the chain was replayed onto it with no conflict, to `candidate/practices-carousel-3`. Its 15 new commits touch no workflow, `specs/protected-paths.txt` or `practices.yaml`, so the staged batch is unchanged.

## Independent review

A general-purpose subagent reviewed `0e2acac..71d354e` against the task's requirements, CLAUDE.md, `land.sh` and SPEC-001-R4, R12, R41 and R232, given the files and the requirements, not these notes. It confirmed the workflow, the batch's format, the pipeline checks with the moves applied, the fit loop's choice of `--k`, `build.sh` on BSD tools and the prose rules. Its findings, most severe first, and what happened to each:

| # | Finding | Outcome |
|---|---|---|
| 1 | Fit missed text running sideways into the margin, and `fits()` checked only height | Fixed. `fits()` checks width too, row text wraps a word too long for its line, and `measure()` checks every line of text against the margins. A 59-character word with wrapping turned off now fails Fit |
| 2 | Map never checked the flow's order or which boxes sit beside which | Fixed. Map checks spec, sandbox, pipeline and production run top to bottom, policy sits beside the pipeline and humans beside the spec. Humans reach the pipeline by a wire, not by position: a box cannot sit beside both without covering policy |
| 3 | The `--` exemption covered all text, and any key named `url` was skipped | Fixed. Only a tool's name may hold a flag, and only a tool's `url` is skipped |
| 4 | The template held text of its own: DIY, the OWASP prefix, the map's page labels | Fixed. They moved to `labels` in `carousel.yaml`. The ` · ` separator stays in the templates as punctuation |
| 5 | Count compared a number with itself and needed the word "practices" | Fixed. It counts the rows the pages render and the poster's cards, and finds the number where the subtitle's and the poster's templates put it |
| 6 | Schema accepts `tools: []` | Not changed. Six of Appendix A's rows name no tool, because each is a rule you write; the owner's tools are examples (decision 0009) |
| 7 | "Gate on mutation score" uses "gate" for a check; "Observes" sits in the sandbox in the hours window | Fixed as the owner chose: the first reads "Fail a change whose mutation score drops, on changed code only", and "Observes" moved to the inspector section, tagged inspector. Decision 0009, owner question 7 |
| 8 | `verify.mjs` could throw before printing its table, and `--only` with a bad name passed with no checks | Fixed. A check that throws is a FAIL with its error, a check the page could not build is a FAIL, and `--only` with an unknown or empty name exits 2 |
| 9 | The landing steps named one commit, and the `requires:` lines could never refuse | Fixed. The steps name the candidate tip, and the `requires:` lines are gone |
| 10 | Protecting `fonts.json` alone does not stop an unsigned change to `build.sh` or the templates | Recorded. Decision 0009 says so in decision 8 and asks the owner (question 6) |
| 11 | The decision names the live deck's file ID | Not changed. The task gave the ID and the date; no file was read |
| 12 | Page 2's top line is 20 px | Not changed. It is the top line every page shares; the 26 px rule is for the map, which Map measures |

## Second independent review

A second subagent reviewed `059d608..47dc327`, the poster and the first review's fixes, given the files and the requirements. It found nothing wrong in Phrasing's handling of comments and flags, in Schema, Count, Offline or Pages, in the templates, in the poster's fit at scale 1 against scale 2, in the edge label, in `LAND.txt` or the staged files, or in the workflow. Its findings:

| # | Finding | Outcome |
|---|---|---|
| 1 | Poster read each card's section from a label the template sets, and only the arrows' order, so columns swapped on the grid passed | Fixed. Each column must sit under its own arrow, which must name its section; policy under the columns; the bands in order down the page |
| 2 | The poster's margin was its page edge, as it has no padding | Fixed. The poster's margins are 64 px at each side; only the full-width header, legend, body and footer boxes may cross them, and no text may |
| 3 | A word wider than its own box, such as "Specifications" in the spec's arrow, passed while clipped | Fixed. Every line of text must fit across its own box, on every page and the poster. A word too long for a heading fails; a row's text still wraps |
| 4 | The poster leaves out part of page 9 and more, which the comment and README did not say | Fixed in the words: the README, the decision and the comment list what it leaves out |
| 5 | A string repeated on the poster could stand in for one missing | Fixed. Each card must hold its own row's text, lead, reference, tools, where tag and DIY tag |
| 6 | "Patch" had no Phrasing rule | Fixed |
| 7 | The Fonts detail listed one PDF's fonts for both, and any name starting `Archivo` or `IBMPlex` passed | Fixed. Each PDF's fonts are listed, and each must be one of the pinned files by the PostScript name in its name table |
| 8 | `build.sh` and the README's key table did not mention the poster | Fixed |

Each fix was made to fail once on purpose, as decision 0009, "The checks", lists.

## The AWS Deployment Pipeline Reference Architecture

On 2026-11-14 the owner asked whether the carousel accounts for every relevant check on the reference architecture's application pipeline page. It did not: Appendix A kept the security scans and dropped the tests, infrastructure scans, SBOM and progressive release, and neither `practices.yaml` nor the deck snapshot lists them. The owner chose four grouped rows, `source: dpra` (decision 0009, owner question 8). The Practices check accepts that source only on a row that cites no practice. Every new tool link returned 200 on 2026-11-14. Page 5 overflowed with both a test row and the release row, so the release row went to page 7, and two rows were shortened to fit at `--k` 0.84.

## The pipeline-view poster

On 2026-11-14 the owner shared the earlier "Pipeline view" poster, 43 practices, as a source of additions and changes, and said specs are more than EARS. Three practices the carousel lacked were added, `source: pipeline-view`, with the poster's OWASP IDs; specs list EARS, Gherkin and Markdown; three rows gained a tool. Every new link returned 200, and the Claude Code docs name `allowedMcpServers`, `managed-mcp.json`, `--max-turns` and `--max-budget-usd`. Correction: these notes first said the OWASP list is the 2025 edition and three IDs did not match it. OWASP's web page showed the 2025 list on 2026-11-14, but the owner showed the 2026 document, and every ID matches its titles (decision 0009, owner question 10). The cover and the poster now name the list. Firecrawl had run out of credits, so the page was fetched with `curl`.

Fitting 43 rows took three steps, each checked by Fit: the staging-tests row moved to page 4; the section summaries widened from 42 to 52 characters; and the legend's tools line became "Tools are examples", which fits on the second line (239 px free, measured) where "Tools: examples of the kind of tool to use" needed 366 px.

## Everything is the factory

On 2026-11-14 the owner said the whole picture is the factory: the inspector watches the pipeline from outside the pipeline, not from outside the factory. The inspector's tag now reads "Watch the pipeline from a separate account", its map box "Runs in a security account the pipeline can't reach", and page 2's lede "Everything that turns a signed spec into a deployed change, and watches it". The dashed "factory's edge" around the sandbox, pipeline and policy is gone; a dashed frame labelled "Security account" surrounds the inspector alone, on page 2 and on the poster. Map and Poster check that only the inspector is framed and that the frame carries its label.

## Page 11: a real receipt

On 2026-11-14 the owner asked for a sample receipt that shows "No evidence, no deploy" and many of the 42 practices, then made it page 11. The first version invented its values: `TASK-0042`, commit `7f5c682`, a PASS beside each line, marked "illustrative". The owner said it showed no real evidence, such as provenance, hash pins or attestations, and read as marketing, and pointed at this repository's own receipt. That was right: SPEC-001-R45 to R56 define a receipt, and `main` run 114 printed one for a real delivery.

Page 11 now shows that receipt: the seven lines `main` run 114 printed for the runner producer's delivery `9f959a3` (TASK-T4-DUP-COLUMNS, SPEC-014-R7), as `docs/notes/tracer-2-t4.md` records them. Under them, "What backs it" gives the evidence behind each line, from the logs of the producer run that wrote the patch and the pipeline run that shipped it. Then come four things the receipt does not show yet, under "Missing so far", and scenario B10's failure line. Nothing on the page is invented. The Receipt check in `verify.mjs` compares the printed lines with that record and with the commit's own trailers. It checks that the spec commit is an ancestor with a security-key signature that adds the task file, and that every digest and run ID on the page appears in the record or in the table below.

### The evidence, read on 2026-11-14 through the GitHub API

| Line on page 11 | What the log says | Where |
|---|---|---|
| SPEC | `c7c6b4d` carries an SSH signature whose public key type is `sk-ecdsa-sha2-nistp256@openssh.com`, a security key. It changes `specs/SPEC-014-export-latency.md` and adds `tasks/TASK-T4-DUP-COLUMNS.task.md` | `git cat-file commit c7c6b4d`; the SSHSIG blob's public key |
| AGENT | `RUN ENDED: success, 10 turns, estimated USD 0.2377491`. The command line holds `--max-turns 40 --max-budget-usd 5`. `CLAUDE_CODE_SHA256: 1eda4ee54631c2e313df7bd9c2b7d3ca22815e09c6145774309214f06a8acd15`, checked with `sha256sum -c` before unpacking, as is the `node_modules` archive, `b3c9c2d1a5ee6f22048679ca27669fbfaeb38940a3ab33cd0bc76aaac7b3ef92`. The settings hold `"allowedDomains": []`. `--strict-mcp-config` with a config that names no server (SPEC-001-R88). `Permission mode: default.` | producer run 42499336951, job 128788563404, "produce a patch with Claude Code" |
| DIFF | The agent's tool calls: two reads, three edits of `src/handler.ts` and `test/export.acceptance.test.ts`, then `npm run check:lint`, `check:typecheck`, `check:trace` and `check:test`. The publish job, which runs no agent, checked `PATCH_SHA256: 0c1051d044e7b3f02d7000cfd4fb806a99232266b70865cd49326ddf5d5c3e97` before applying it, and could commit only after its scope command printed `scope ok`. It printed `Pushed 9f959a350e541d1aa52654e4ace7d7fdd4fa52a6 to candidate/TASK-T4-DUP-COLUMNS` | the same run, jobs 128788563404 and 128788887004 |
| CHECKS | Fifteen lines, `check secrets passed` to `check mutation passed`, in SPEC-001-R1's order. On `main` the task and scope checks cover an empty range (SPEC-001-R68) | `main` run 114 (42501305077), job 128794438881 |
| BUILD, VERIFY | Two lines, `receipt: verified https://slsa.dev/provenance/v1` and `receipt: verified https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2`. Each certificate has `certificateIssuer` `CN=sigstore-intermediate,O=sigstore.dev`, `issuer` `https://token.actions.githubusercontent.com`, `subjectAlternativeName` `https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main`, `runnerEnvironment` `github-hosted`, and `buildSignerDigest` and `sourceRepositoryDigest` both `9f959a350e541d1aa52654e4ace7d7fdd4fa52a6`. Then the seven lines | run 114, job 128794922989, "receipt" |
| DEPLOY | The deploy-tip, attestation and receipt checks ran, in that order, before `configure-aws-credentials`. The saved plan changed `aws_lambda_function.export`'s `source_code_hash` to `cirGcVoNEagYllHWjviAKNAav4EOSi564+nsdKTnZsw=`, which is base64 for `722ac6715a0d11a8189651d68ef88028d01abf810e4a2e7ae3e9ec74a4e766cc`, the attested zip's digest. `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.` at 16:46:39 UTC | run 114, job 128795003787, "deploy to sandbox" |
| B10 stub | `CHECK attestation FAILED: dist/function.zip`: SPEC-001-R29's scenario, an unattested artifact at deploy. `docs/verification.md` records it from the E2E-R1 run on 2026-11-07 | `scenarios/scenarios.yaml`, B10 |

### Which rows it covers

| Covers | Rows |
|---|---|
| In full, 15 | Allow list of commands and paths; cap turns and spend; tests and code quality in the sandbox and the pipeline; SAST; SCA; mutation score; property tests; approver-signed specs; trace; build once and verify attestations at deploy; pin by SHA and hash; no shared cache; one OIDC identity; allowlist MCP servers (none); approvers sign factory changes |
| In part, 6 | Secrets (the pipeline scanned, the agent did not); IaC scan and SBOM (lint and validate, no SBOM); dependency allowlist and mirror (the allowlist check, no mirror); provenance with the model (MODEL reads `not recorded`); a hash of every agent input (Claude Code and `node_modules` only); human approval of irreversible actions (the check ran and found none to approve) |
| Not on this receipt | The other 21: DAST, staging tests, the customer's acceptance, the validator, IAM proofs, every watch and every routing practice |

The page's four gaps are the decision 0002 lines not built yet: the model (deviation D05), the INTENT and TASK lines (T3b), the factory fingerprint over every agent input, and a signer outside the agent's reach (Phase 3). "No agent runs in the jobs that verify and deploy" is true of run 114: the agent ran only in producer run 42499336951's agent job, which had model access only. The SIGNED line says what that sentence leaves out: the agent can edit `pipeline.yml`.

## Not fixed

Findings 6, 11 and 12 of the first review, for the reasons given. The ten Vitest failures in the preflight are the container's, and the candidate run's test check covers them.
