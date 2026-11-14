# Prompt: make this repository the source of record for the practices carousel

The owner's prompt of 2026-11-14 that started this kit, kept here as given (its appendices in code blocks), followed by the owner's instructions during the same session and what each changed. Decision 0009 records the decisions; `docs/notes/practices-carousel.md` records the evidence. The kit has moved on from Appendix A: `carousel.yaml` is the source of record, and the follow-ups below say how it got there.

## The prompt, as given

---

Prompt: make this repository the source of record for the practices carousel
Written on 2026-11-14 against PaulDuvall/who-gets-the-keys main at 0e2acac.

Paste everything below the line into a Claude Code session in PaulDuvall/who-gets-the-keys.

Task
The owner posts a 10-page LinkedIn carousel built from the talk "Who Gets the Keys?". Each page is 1080 × 1350, LinkedIn's 4:5 portrait size. It lists 36 practices for code an AI agent writes. For each practice it shows when it runs, where in the factory it runs, and example tools. It was built outside this repository. Make this repository its source of record:

A content file the owner edits.
A kit that renders it to a PDF.
Checks that keep it honest.
A workflow that builds it in GitHub Actions and keeps only the newest copy.
The content is in Appendix A, and the look is in Appendix B. Build from them. Do not read the live deck: CLAUDE.md makes specs/source-of-record/slides.txt the source of record, and this prompt carries everything the deck adds.

The model the carousel shows
These are the owner's corrections, so follow them where they differ from older material.

A factory view. The factory is everything that turns a signed spec into a deployed change. The pipeline is its main workflow and holds the only deploy key. Around it, factory policy guards the keys. An inspector watches the pipeline and production from a security account outside the factory. Humans decide intent, irreversible actions and security events. This matches decision 0004's definition and the factory video's frame (revision 19).
The agent runs in the cloud. Each task gets its own sandbox on a cloud runner, as the runner producer does (SPEC-001-R83 to R89 and R207 to R210). A desktop Claude Code session and its local sandbox play no part. The carousel names no desktop tooling and no local hooks; the producer sets disableAllHooks (R87). "Seconds" means checks inside the agent's sandbox, before its patch leaves.
Ground rules
Follow CLAUDE.md. Say "check" for automated verification and "gate" only for a human approval, and say "customer", never "client".
Commit unsigned with Agent: Claude Code and push to candidate/practices-carousel. Never push to main. Fix a failed candidate run in a new commit on top.
Write to protected paths only through proposals/, as a land.sh batch like proposals/factory-video/.
Add no dependency. The kit reads YAML with the root yaml package, which is already a devDependency. It gets Playwright from video/record through factory-video/playwright.mjs.
Pin every input. Fonts load from local files whose SHA-256 values are pinned, and the page fetches nothing over the network.
Write plain copy. The phrasing check (Part 3) fails on the patterns the owner rejects: "X, not Y", "not just X", "Not X. Y.", em dashes, double hyphens, and a short list of stock words.
Read first
Path	Why
CLAUDE.md	Conventions and authority boundaries
practices.yaml, docs/practices.md	The practice IDs (P01 to P49) every row cites
docs/decisions/0004-factory-model.md	The factory definition
docs/decisions/0008-factory-video-kit.md	The pattern to copy: kit layout, pinned inputs, one artifact, a prune job, a landing batch
factory-video/ (README.md, verify.mjs, playwright.mjs, build.sh)	Kit conventions and the verify report format
.github/workflows/factory-video.yml	Action SHAs, runner, timeouts, the claims job and the prune job to copy
specs/SPEC-001-delivery-pipeline.md, "Runner producer"	What the cloud sandbox is (R83 to R89, R207 to R210)
scripts/bootstrap/land.sh, proposals/factory-video/LAND.txt	How a batch lands
Part 1: the kit
Create practices-carousel/ at the top level. Using video/ would trigger the walkthrough's 120-minute build, and using factory-video/ would trigger its 45-minute build.

File	Holds
carousel.yaml	The content, exactly as Appendix A gives it. This file is the source of record
carousel.html	The page template. It holds no content
render.mjs	Loads carousel.yaml, puts it into the page, waits for fonts, sizes each section page, then writes out/who-gets-the-keys-carousel.pdf, out/pages/pNN.png and out/contact.png
verify.mjs	The Part 3 checks. Writes out/report.md
fonts.json	For each font file: family, weight range, a versioned source URL and its SHA-256
build.sh	Downloads the fonts into an ignored folder, checks each SHA-256, then runs render.mjs and verify.mjs
README.md, .gitignore	How to build and edit. Ignores out/ and the font cache
Pages
#	Page	From
1	Cover: title, thesis, subtitle with the row count computed from the data, a bar of the four timing windows, byline	meta, windows
2	The factory map (below)	factory
3 to 8	One page per section, in file order	sections
9	Where humans still decide, plus the day-one box	humans
10	Three things to do tomorrow, plus the closing line and sites	close, meta
Section pages follow Appendix B:

a top line with the title and "n / 10";
the section name, tag and summary;
rows, each with an optional lead label in brass, the text, an optional OWASP reference, and a meta line with tools, an optional DIY tag, a "where" tag unless the row runs in the pipeline, and a four-segment timing bar;
a legend at the foot.
Each section page scales its row type with --k between 0.8 and 1.5, so the rows fill the space above the legend without overflowing. Appendix B has the algorithm.

The factory map (page 2) is the one page with no reference design. Build it from the Appendix B tokens. Lay out the four flow boxes in order, left to right or top to bottom: signed spec, agent sandbox, pipeline, production. Make the pipeline the largest box and mark it "holds the only deploy key". Place the around boxes at their positions:

factory policy beside the pipeline;
the inspector outside a line that marks the factory's edge;
humans beside the spec and the pipeline.
Each box shows its text and the carousel page or pages that cover it. Keep text at 26 px or larger, so it reads on a phone without zooming.

Part 2: the workflow (a proposal)
Stage proposals/github-workflows/practices-carousel.yml, modelled on factory-video.yml:

Triggers: workflow_dispatch, and a push to main that touches practices-carousel/**, practices.yaml or the workflow. Rows cite practices.yaml IDs, so an edit there reruns the checks.
Workflow level: permissions: {} and cache-mode: none. Every action pinned by SHA, reusing the SHAs in factory-video.yml.
build job, with contents: read only and a 15-minute timeout:
check out with no persisted credentials;
run npm ci --ignore-scripts at the root, for yaml;
install Playwright and Chromium from video/record, as factory-video.yml does;
install poppler-utils for pdffonts, with the same apt timeouts;
run practices-carousel/build.sh;
upload out/ as one artifact named practices-carousel-<short SHA>-<UTC time>, with if-no-files-found: error and retention-days: 30.
prune job, with actions: write only, run when build succeeds: delete every earlier unexpired artifact whose name starts with practices-carousel-. Copy the loop from factory-video.yml.
Stage the batch in proposals/practices-carousel/:

a LAND.txt that moves the workflow into .github/workflows/;
if the owner agrees (decision 2 below), a protected-paths.txt that adds practices-carousel/fonts.json;
if you change the file map, a proposals/CLAUDE.md that adds the kit to it.
Choose the Spec: trailers by the requirements the landing touches; proposals/factory-video/LAND.txt used SPEC-001-R12. Stage from origin/main. If another unlanded branch also changes specs/protected-paths.txt, whichever lands second restages.

Part 3: the checks
verify.mjs prints one PASS or FAIL row per check, as factory-video/verify.mjs does, and exits nonzero on any FAIL.

Check	Fails when
Schema	carousel.yaml does not parse; a row lacks text, when, where or tools; when or where names a key the file does not define; a tool URL is not https://; a factory box names a page outside 1 to 10
Practices	A row cites an ID that is not in practices.yaml, or cites none without source: qa. Also reports, without failing, which practices.yaml IDs no row cites. P01 and P10 do today: P01 appears as "Check" on page 10, and P10 was dropped
Phrasing	Any text in carousel.yaml (tool URLs excepted) matches: an em dash; --; not just; a comma followed by not; a sentence that starts with Not; never; Here's; or one of delve, unlock, harness, robust, crucial, pivotal, landscape, ecosystem, transformative, cutting-edge, game-changer, seamless (whole words, any case)
Pages	The PDF does not have exactly 10 pages, or a page is not 810 × 1013.04 pt (1080 × 1350 px)
Fit	Any page overflows; any tool line runs under its tags; any section page's --k falls outside 0.8 to 1.5. Reports each page's --k
Fonts	A font file's SHA-256 differs from fonts.json, pdffonts lists a font as not embedded, or Archivo, IBM Plex Sans or IBM Plex Mono is missing
Offline	The page requests anything that is not file://, or logs an error
Count	The cover's count differs from the number of rows
The report also lists, for each row, the coverage practices.yaml records for its IDs (good+bad, partial, not-shown and so on). That shows the owner how much of the carousel the repository demonstrates today. Like the factory video, the carousel is the target, so the report lists gaps and the check still passes.

Decisions for the owner
#	Question	Options	Recommendation
1	Where the kit lives	(a) practices-carousel/. (b) Inside factory-video/	(a). Any change under factory-video/ triggers a 45-minute build
2	Whether fonts.json is a protected path	(a) Yes, like factory-video/narration/. (b) No	(a). Chromium parses the font files, so the pins decide what runs
3	Rows that come from the deck's Q&A slides	(a) Mark them source: qa, as Appendix A does, until the snapshot holds the Q&A. (b) Refresh the snapshot with scripts/bootstrap/refresh-slides.sh first	(a) now, then (b). The snapshot is file 19RnjfRh…, exported 2026-11-02. The talk's current deck, file 1Zq6B8Ag… modified 2026-11-03, adds four Q&A slides. Which file is the source of record is the owner's call
4	The single-image poster built from the same data	(a) A second template later. (b) Now	(a). This task is the PDF
Done when
 practices-carousel/build.sh passes locally: every Part 3 check PASSes and out/report.md lists each page's --k. Checked by pasting the verify table into the commit message.
 out/who-gets-the-keys-carousel.pdf has 10 pages at 810 × 1013.04 pt, and its text matches carousel.yaml. Checked with pdfinfo and pdftotext.
 The carousel names no desktop or local-hook tooling, and "Seconds" reads as checks inside the agent's sandbox. Checked by grep -i -E 'desktop|hook' practices-carousel/carousel.yaml returning nothing.
 candidate/practices-carousel passes the pipeline's checks job. Checked by the run ID in your final message.
 proposals/practices-carousel/ holds the workflow and LAND.txt, and your final message gives the owner the commands: the land.sh --to-main for the kit commit, then land.sh proposals/practices-carousel.
 The decision is recorded in docs/decisions/<next number>-practices-carousel.md. On 2026-11-14 that number was 0009; check every branch before you take it.
Not yet verified
The tool URLs in Appendix A returned 200 on 2026-11-13 and 2026-11-14. github.com refuses automated checks from some environments; the three repositories behind those links exist (git ls-remote). No check here re-tests links, so they can go stale.
zizmor has not audited the proposed workflow; the workflows check runs on it only once it lands.
The font sources. Pick versioned URLs, a release tag or a commit, for Archivo and IBM Plex. Both are under the SIL Open Font License; confirm that in each source and record its URL in fonts.json.
Appendix A: practices-carousel/carousel.yaml
Use this file as given. Report anything you change, and why, in the commit message.

```yaml
# Source of record for the "Who gets the keys?" LinkedIn carousel: a factory view.
# Every row cites the practices.yaml IDs it shows, or `source: qa` when the practice comes
# only from the deck's Q&A slides, which specs/source-of-record/slides.txt does not hold.
meta:
  title: Who gets the keys?
  thesis_key: The pipeline
  thesis_rest: holds the keys to production.
  subtitle: "{count} practices for code an AI agent writes, with when each one runs, where in the factory it runs and tools to start with."
  byline: Paul Duvall · AI Native DevCon 2026
  close_line_plain: The agent writes the change, and
  close_line_key: the pipeline ships it.
  sites: [paulmduvall.com, redactedventures.com]

windows:
  before: Before code
  seconds: Seconds, in the agent's sandbox
  minutes: Minutes, in the pipeline
  hours: Hours, in production
  always: Always on

where:
  sandbox: Sandbox
  pipeline: ""            # untagged on the page: the pipeline is the default
  policy: Factory policy
  inspector: Inspector
  human-intent: Human · intent
  human-approval: Human · approval
  human-security: Human · security

legend:
  windows: "Runs: before code, in the sandbox (seconds), in the pipeline (minutes), in production (hours)"
  untagged: "Untagged: runs in the pipeline"
  diy: rules you write

factory:
  heading: The factory
  lede: Everything that turns a signed spec into a deployed change. The pipeline is its main workflow, and it holds the only deploy key.
  flow:
    - name: Signed spec
      text: An engineer captures the customer's intent and signs it with a security key.
      page: [5, 9]
    - name: Agent sandbox
      text: One cloud runner per task. Its commands get no secrets, no deploy keys and no network. It returns a patch.
      page: 3
    - name: Pipeline
      text: Runs the checks of record, signs the evidence and holds the only deploy key.
      page: [4, 5]
    - name: Production
      text: Changes only when the evidence for a change is complete.
      page: 5
  around:
    - name: Factory policy
      text: Guards the keys with pinned inputs, one deploy identity, no other writer to production and signed changes to the factory itself.
      page: 6
    - name: Inspector
      text: Sits outside the factory in a security account and watches the pipeline and production for drift.
      page: 7
    - name: Humans
      text: Approve intent, approve irreversible actions and handle security events.
      page: [8, 9]

sections:
  - name: Agent sandbox
    tag: One cloud runner per task
    blurb: The agent runs on a runner started for one task. Its commands get no network and no secrets, and its only output is a patch.
    rows:
      - lead: Told
        text: Limit what the agent can do to an allow list of commands and paths
        ref: LLM01
        when: [seconds]
        where: sandbox
        practices: [P15, P24]
        tools:
          - { name: GitHub-hosted runners, url: "https://docs.github.com/en/actions/concepts/runners/github-hosted-runners" }
          - { name: Claude Code permissions, url: "https://code.claude.com/docs/en/settings" }
      - lead: Assigned
        text: Treat issues, docs and URLs as read-only data
        when: [seconds]
        where: sandbox
        practices: [P15, P46]
        tools:
          - { name: issue forms, url: "https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms" }
          - { name: sandbox egress allowlist, url: "https://code.claude.com/docs/en/sandboxing" }
      - lead: Knows
        text: Check provenance and integrity of what it retrieves
        ref: LLM05
        when: [minutes]
        where: pipeline
        practices: [P16]
        tools:
          - { name: signed commits, url: "https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification" }
          - { name: Sigstore, url: "https://docs.sigstore.dev/" }
      - lead: Observes
        text: Read telemetry redacted, with no prod credentials
        when: [hours]
        where: sandbox
        practices: [P17]
        tools:
          - { name: CloudWatch masking, url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html" }
          - { name: OTel redaction, url: "https://opentelemetry.io/docs/security/handling-sensitive-data/" }
      - lead: Writes
        text: Check new dependencies against an allowlist and a hash-pinned mirror
        ref: LLM04
        when: [seconds, minutes]
        where: sandbox
        practices: [P18, P19]
        tools:
          - { name: npm ci, url: "https://docs.npmjs.com/cli/commands/npm-ci" }
          - { name: pip --require-hashes, url: "https://pip.pypa.io/en/stable/topics/secure-installs/" }
          - { name: CodeArtifact, url: "https://docs.aws.amazon.com/codeartifact/latest/ug/welcome.html" }
      - text: Flag agent tests that assert nothing before the patch leaves the sandbox
        when: [seconds]
        where: sandbox
        practices: [P11]
        tools:
          - { name: vitest/expect-expect, url: "https://github.com/vitest-dev/eslint-plugin-vitest" }
      - text: Scan for secrets in the sandbox and again in the pipeline
        when: [seconds, minutes]
        where: sandbox
        practices: [P06]
        tools:
          - { name: gitleaks, url: "https://github.com/gitleaks/gitleaks" }
          - { name: push protection, url: "https://docs.github.com/en/code-security/concepts/secret-security/push-protection" }

  - name: Pipeline checks
    tag: The checks of record
    blurb: The pipeline runs the same checks on every change, the agent's or a human's, and nothing reaches main without them.
    rows:
      - text: SAST on every change
        when: [minutes]
        where: pipeline
        practices: [P07]
        tools:
          - { name: Semgrep, url: "https://semgrep.dev/docs/" }
          - { name: CodeQL, url: "https://codeql.github.com/" }
      - text: SCA on every lockfile
        when: [minutes]
        where: pipeline
        practices: [P08]
        tools:
          - { name: OSV-Scanner, url: "https://google.github.io/osv-scanner/" }
          - { name: Dependabot, url: "https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain" }
      - text: DAST where there is an HTTP surface, in parallel
        when: [minutes, hours]
        where: pipeline
        practices: [P09]
        tools:
          - { name: ZAP API scan, url: "https://www.zaproxy.org/docs/docker/api-scan/" }
      - text: Gate on mutation score, run on changed code only
        when: [minutes]
        where: pipeline
        practices: [P12, P14]
        tools:
          - { name: Stryker, url: "https://stryker-mutator.io/docs/stryker-js/incremental/" }
          - { name: PIT, url: "https://pitest.org/" }
      - text: Property tests hold invariants across generated inputs
        when: [minutes]
        where: pipeline
        practices: [P13]
        tools:
          - { name: Hypothesis, url: "https://hypothesis.readthedocs.io/" }
          - { name: fast-check, url: "https://fast-check.dev/" }

  - name: Pipeline evidence
    tag: Evidence authorizes the deploy
    blurb: Evidence does the job a human used to skim on a change request, and it covers intent as well as behavior.
    rows:
      - text: The customer confirms acceptance criteria before code exists
        when: [before]
        where: human-intent
        practices: [P47]
        tools:
          - { name: EARS, url: "https://alistairmavin.com/ears/" }
      - text: Specs change only through an approver-signed commit
        when: [before, minutes]
        where: human-intent
        practices: [P02]
        tools:
          - { name: signed commits, url: "https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification" }
          - { name: rulesets, url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets" }
      - text: Trace every change to a spec ID and every requirement to a test
        when: [minutes]
        where: pipeline
        diy: true
        practices: [P03, P04, P05]
        tools:
          - { name: git trailers, url: "https://git-scm.com/docs/git-interpret-trailers" }
      - text: An independent validator compares spec and code, and can only fail a change
        when: [minutes]
        where: pipeline
        diy: true
        practices: [P22]
        tools:
          - { name: Claude Code headless, url: "https://code.claude.com/docs/en/headless" }
      - text: The pipeline signs attestations, and deploy verifies them first
        when: [minutes]
        where: pipeline
        practices: [P20]
        tools:
          - { name: GitHub attestations, url: "https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations" }
          - { name: Sigstore, url: "https://docs.sigstore.dev/" }
      - text: Provenance records the commit, spec ID, agent and model version
        when: [minutes]
        where: pipeline
        practices: [P21]
        tools:
          - { name: SLSA, url: "https://slsa.dev/" }
          - { name: in-toto, url: "https://in-toto.io/" }

  - name: Factory policy
    tag: Guard the keys
    blurb: The pipeline can hold the keys only if it is the best-protected system you run.
    rows:
      - text: Pin actions by commit SHA, dependencies and images by hash
        when: [minutes]
        where: pipeline
        practices: [P28, P29]
        tools:
          - { name: zizmor unpinned-uses, url: "https://docs.zizmor.sh/audits/" }
      - text: No cache shared between untrusted jobs and release
        when: [minutes]
        where: pipeline
        practices: [P27]
        tools:
          - { name: zizmor cache-poisoning, url: "https://docs.zizmor.sh/audits/" }
      - text: Deploy with one short-lived identity, federated through OIDC
        when: [minutes]
        where: policy
        practices: [P30]
        tools:
          - { name: GitHub OIDC, url: "https://docs.github.com/en/actions/concepts/security/openid-connect" }
          - { name: npm trusted publishing, url: "https://docs.npmjs.com/trusted-publishers" }
      - text: No other principal, human or agent, can change prod
        when: [always]
        where: policy
        practices: [P24]
        tools:
          - { name: AWS SCPs, url: "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html" }
      - text: A human approves irreversible actions, and the pipeline checks the approval
        ref: LLM03
        when: [minutes]
        where: human-approval
        practices: [P26]
        tools:
          - { name: terraform show -json, url: "https://developer.hashicorp.com/terraform/internals/json-format" }
          - { name: env reviewers, url: "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments" }
      - text: Approvers sign every change to the factory that the agent proposes
        when: [minutes]
        where: human-approval
        practices: [P25, P49]
        tools:
          - { name: rulesets, url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets" }
          - { name: signed commits, url: "https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification" }
      - text: Prove IAM changes add no access and nothing public
        when: [minutes]
        where: pipeline
        practices: [P37]
        tools:
          - { name: IAM Access Analyzer, url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html" }

  - name: Inspector
    tag: Watch the pipeline from outside the factory
    blurb: The inspector runs in a security account the pipeline can't reach. Production drift redeploys the last attested build, and pipeline or spec drift freezes deploys.
    rows:
      - text: Detect from a security account the pipeline can't reach
        when: [hours]
        where: inspector
        practices: [P35]
        tools:
          - { name: org CloudTrail, url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/creating-trail-organization.html" }
          - { name: AWS Config, url: "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html" }
      - lead: Prod drift
        text: Redeploy the last attested build and notify
        when: [hours]
        where: inspector
        diy: true
        practices: [P31, P39]
        tools:
          - { name: EventBridge, url: "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html" }
      - lead: Pipeline, spec drift
        text: Freeze deploys
        when: [hours]
        where: inspector
        diy: true
        practices: [P32, P33]
        tools: []
      - lead: Break-glass
        text: A separate, alarmed path, reconciled as prod drift
        when: [hours]
        where: human-security
        practices: [P34]
        tools:
          - { name: EventBridge, url: "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html" }
      - text: Allowlist expected changes by principal and action
        when: [hours]
        where: inspector
        source: qa
        practices: []
        tools:
          - { name: AWS Config, url: "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html" }

  - name: Route humans
    tag: Late reviews are defects
    blurb: Every review after the code exists gets a root cause, and the fix is usually a new check.
    rows:
      - text: Risk tiers set in the room route every change, and a classifier can only escalate
        when: [minutes]
        where: human-intent
        diy: true
        practices: [P45]
        tools: []
      - text: A human handles security events, and the fix runs the same pipeline
        when: [minutes]
        where: human-security
        diy: true
        practices: [P44, P38]
        tools: []
      - text: Root-cause each review after code exists and codify the check
        when: [hours]
        where: human-intent
        diy: true
        practices: [P36]
        tools: []
      - text: Measure cry wolf and miss wolf, and steer by revert rate
        when: [hours]
        where: human-intent
        diy: true
        practices: [P36]
        tools: []
      - text: Circuit breakers tighten approval when reverts move
        when: [hours]
        where: pipeline
        diy: true
        practices: [P40, P43]
        tools: []
      - text: Each waiver records who approved it and when it expires
        when: [minutes]
        where: pipeline
        practices: [P48]
        tools:
          - { name: OSV-Scanner ignoreUntil, url: "https://google.github.io/osv-scanner/configuration/" }

humans:
  heading: Where humans still decide
  rows:
    - label: Intent
      text: Capture and approve the spec before code exists.
      note: The customer confirms the acceptance criteria.
    - label: Approval
      text: Approve irreversible actions and changes to the factory, and the pipeline carries them out.
      note: Deletes of stateful resources, IAM that loosens access, factory changes signed by two engineers.
    - label: Security
      text: Handle security events, and the fix runs the same pipeline.
      note: A blocked injection, a break-glass use.
  day_one:
    heading: Day one for a small team
    source: qa
    items:
      - Secrets and dependency scanning
      - One deploy identity
      - Agents in a cloud sandbox, with no prod keys or long-lived credentials
    end: About an afternoon of setup.

close:
  heading: Three things to do tomorrow
  items:
    - verb: Check
      what: Make controls machine-checkable.
      how: Stop treating downstream review as a control.
    - verb: Trace
      what: Verify intent and behavior.
      how: Confirm intent before code exists and trace every change to it.
    - verb: Prove
      what: Let evidence authorize every deploy.
      how: A deploy without complete evidence stops.
```

Appendix B: the look
This is the stylesheet of the carousel the owner approved, with the content left out. Keep the tokens, type and spacing. Replace .sectionpage with whatever class render.mjs puts on section pages, and give page 2 its own rules built from the same tokens. The @font-face rules point at the local font files.

```css
/* Ten 1080 x 1350 pages (LinkedIn 4:5). Dark cover and close, light section pages, one section per page in the talk's order. */
@page { size: 1080px 1350px; margin: 0; }
:root {
  --paper: #f7f8f9; --ink: #121820; --muted: #59646f; --line: #dce1e6;
  --band: #121820; --band-ink: #eef1f4; --band-muted: #9aa6b2; --band-line: #2a3440;
  --brass: #94650e; --brass-hi: #e2b04f; --brass-soft: #f1e6cc;
  --w-before: #94650e; --w-s: #0b7a72; --w-m: #2350b8; --w-h: #8b3a8f; --w-off: #dfe4e9;
  --font-display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --font-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: #c9cfd5; -webkit-font-smoothing: antialiased; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: var(--font-body); color: var(--ink); }
.slide { width: 1080px; height: 1350px; overflow: hidden; position: relative; background: var(--paper); page-break-after: always; break-after: page; display: flex; flex-direction: column; padding: 64px 72px 52px; }
.slide:last-child { page-break-after: auto; break-after: auto; }
.dark { background: var(--band); color: var(--band-ink); }
a { color: inherit; text-decoration: none; }

.top { display: flex; justify-content: space-between; align-items: baseline; font: 500 20px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.dark .top { color: var(--band-muted); }
.pg { font-variant-numeric: tabular-nums; }

/* Cover */
.cover h1 { margin: 120px 0 0; font: 800 172px/0.9 var(--font-display); font-stretch: 115%; letter-spacing: -.025em; }
.cover .thesis { margin: 40px 0 0; font: 600 46px/1.15 var(--font-display); }
.cover .thesis .key { color: var(--brass-hi); }
.cover .sub { margin: 28px 0 0; font-size: 30px; line-height: 1.4; color: var(--band-muted); max-width: 30ch; }
.timeline { margin-top: auto; }
.timeline .bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.timeline .bar i { height: 22px; border-radius: 4px; }
.timeline .lab { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; font: 500 22px var(--font-mono); color: var(--band-muted); }
.timeline .cap { margin: 0 0 18px; font: 600 24px var(--font-body); color: var(--band-ink); }

/* Section pages */
.sec-head { margin-top: 34px; }
.sec-head h2 { margin: 0; font: 800 92px/0.95 var(--font-display); font-stretch: 115%; letter-spacing: -.01em; text-transform: uppercase; }
.sec-head .tag { margin: 12px 0 0; font: 600 38px/1.15 var(--font-display); color: var(--brass); }
.sec-head .blurb { margin: 18px 0 0; font-size: 27px; line-height: 1.4; color: var(--muted); max-width: 42ch; }
.rows { list-style: none; margin: 30px 0 0; padding: 0; border-top: 3px solid var(--ink); }
.rows li { padding: calc(18px * var(--k, 1)) 0 calc(17px * var(--k, 1)); border-bottom: 1px solid var(--line); }
.rows .p { font-size: calc(31px * var(--k, 1)); font-weight: 600; line-height: 1.24; text-wrap: pretty; }
.rows .lead { font: 700 calc(22px * var(--k, 1)) var(--font-mono); letter-spacing: .05em; text-transform: uppercase; color: var(--brass); margin-right: 12px; }
.rows .ref { font: 500 calc(21px * var(--k, 1)) var(--font-mono); color: var(--muted); margin-left: 10px; white-space: nowrap; }
.rows .meta { display: flex; align-items: center; gap: 14px; margin-top: calc(8px * var(--k, 1)); }
.rows .tools { flex: 1 1 auto; min-width: 0; font: calc(22px * var(--k, 1))/1.35 var(--font-mono); color: var(--muted); }
.rows .tools a { white-space: nowrap; }
.rows .sep { color: #b6bfc8; }
.diy { display: inline-block; font: 600 18px var(--font-mono); letter-spacing: .04em; color: var(--brass); border: 2px solid var(--brass); border-radius: 5px; padding: 0 6px; }
.who { flex: none; font: 600 17px var(--font-mono); letter-spacing: .05em; text-transform: uppercase; background: #e8ecef; border-radius: 5px; padding: 3px 10px; }
.who.human { background: var(--brass-soft); color: var(--brass); }
.track { flex: none; display: grid; grid-template-columns: repeat(4, 20px); gap: 4px; }
.track i { height: 14px; border-radius: 3px; background: var(--w-off); }
.track .b { background: var(--w-before); } .track .s { background: var(--w-s); } .track .m { background: var(--w-m); } .track .h { background: var(--w-h); }
.track.all i { background: var(--ink); }

.legend { margin-top: auto; padding-top: 20px; display: flex; flex-wrap: wrap; gap: 10px 28px; align-items: center; font-size: 20px; color: var(--muted); }
.legend b { color: var(--ink); font-weight: 600; }
.lkey { display: inline-flex; gap: 4px; margin-right: 8px; vertical-align: 2px; }
.lkey span { font: 600 16px var(--font-mono); color: #fff; padding: 1px 6px; border-radius: 4px; }
.legend .diy { font-size: 15px; border-width: 1.5px; margin-right: 6px; }

/* Humans and day one */
.big-h { margin: 34px 0 0; font: 800 76px/0.98 var(--font-display); font-stretch: 115%; letter-spacing: -.01em; }
.humans { margin-top: 30px; display: grid; gap: 0; border-top: 3px solid var(--ink); }
.humans .h { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 24px; align-items: baseline; padding: 24px 0; border-bottom: 1px solid var(--line); }
.humans dt { font: 700 26px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--brass); }
.humans dd { margin: 0; font-size: 32px; font-weight: 600; line-height: 1.3; }
.humans .note { display: block; margin-top: 6px; font-size: 24px; font-weight: 400; color: var(--muted); }
.dayone { margin-top: auto; background: var(--brass-soft); border-radius: 14px; padding: 30px 34px 32px; }
.dayone .k { font: 600 20px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--brass); }
.dayone ul { margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.dayone li { font-size: 30px; font-weight: 600; line-height: 1.3; padding-left: 28px; position: relative; }
.dayone li::before { content: ""; position: absolute; left: 0; top: .48em; width: 12px; height: 12px; border-radius: 2px; background: var(--brass); }
.dayone .end { margin: 18px 0 0; font: 700 28px var(--font-display); color: var(--brass); }

/* Close */
.close h2 { margin: 52px 0 0; font: 800 40px var(--font-mono); font-weight: 600; font-size: 22px; letter-spacing: .08em; text-transform: uppercase; color: var(--band-muted); }
.three { list-style: none; margin: 22px 0 0; padding: 0; display: grid; gap: 18px; }
.three li { border: 2px solid var(--band-line); border-radius: 14px; padding: 28px 30px; display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 20px; align-items: baseline; }
.three .verb { font: 800 36px var(--font-display); font-stretch: 115%; letter-spacing: .04em; text-transform: uppercase; color: var(--brass-hi); }
.three .what { font: 600 36px/1.2 var(--font-body); }
.three .how { display: block; margin-top: 8px; font-size: 26px; line-height: 1.35; color: var(--band-muted); }
.sign { margin-top: auto; border-top: 2px solid var(--band-line); padding-top: 30px; }
.sign .line { font: 700 38px/1.2 var(--font-display); }
.sign .line .key { color: var(--brass-hi); }
.sign .who-am-i { margin-top: 18px; font-size: 26px; color: var(--band-muted); }
.sign .who-am-i b { color: var(--band-ink); font-weight: 600; }
```

The fit step runs after fonts load and before the PDF is written. It raises each section page's --k in steps of 0.02 from 0.8 and keeps the last value that fits:

```js
function fits(page) {
  const rows = page.querySelector(".rows").getBoundingClientRect();
  const legend = page.querySelector(".legend").getBoundingClientRect();
  const toolsOverlap = [...page.querySelectorAll(".meta")].some((m) => {
    const t = m.querySelector(".tools");
    return t.scrollWidth > t.clientWidth + 1;
  });
  return page.scrollHeight <= page.clientHeight && rows.bottom <= legend.top - 6 && !toolsOverlap;
}
for (const page of document.querySelectorAll(".sectionpage")) {
  let k = 0.8;
  page.style.setProperty("--k", k);
  while (k < 1.5) {
    page.style.setProperty("--k", (k + 0.02).toFixed(2));
    if (!fits(page)) { page.style.setProperty("--k", k.toFixed(2)); break; }
    k += 0.02;
  }
}
```

Render the PDF with Playwright's page.pdf({ width: "1080px", height: "1350px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }), with @page { size: 1080px 1350px; margin: 0; } in the stylesheet.

---

## The owner's follow-up instructions, 2026-11-14

Each is quoted as the owner wrote it, in order, with what changed. The commits on the branch carry the detail.

| # | The owner's words | What changed |
|---|---|---|
| 1 | "add 'always on' to the legend" | Each section page's legend shows the all-dark bar with "Always on" |
| 2 | "Where is this view?", with the earlier "Pipeline view" poster; "Not exactly the same words but a view similar to the above but more a factory view as discussed"; "It's just a one-pager of the current carousel really" | `poster.html`: one page of the same `carousel.yaml`, laid out as the factory (decision 0009, 2a; owner question 4 became (b)) |
| 3 | "'It returns a patch.' - what does that mean? Usually that refers to a bug/error/issue. That does not apply here." | "Patch" became "proposed change" in three places, and the Phrasing check rejects it |
| 4 | "The tools are just suggestions not the tools they start with. Meaning it's more about the tool types vs. the specific tools. That said, I provide tools to make it practical" | The subtitle says "an example of the kind of tool that does it"; the legends say "Tools are examples" |
| 5 | "change 'Gate on mutation score' to your suggested wording" | "Fail a change whose mutation score drops, on changed code only" |
| 6 | "move Observes to the inspector" | The Observes row moved to page 7, tagged inspector |
| 7 | "the back should be a checklist of the practices" | The poster's second page: every practice with a box to tick |
| 8 | "have you accounted for all the relevant checks described in https://aws-samples.github.io/aws-deployment-pipeline-reference-architecture/application-pipeline/index.html"; then "go with (a)" | Rows from the AWS Deployment Pipeline Reference Architecture, `source: dpra` (decision 0009, owner question 8) |
| 9 | "See attached for inspiration on additions/changes. Also, specs is more than EARS as shown", with the "Pipeline view" poster | Three practices from it, `source: pipeline-view`; specs list EARS, Gherkin and Markdown; more tool examples (owner question 9) |
| 10 | Two pages of the OWASP Top 10 for LLM Applications 2026: its title and its table of contents | The `ref` IDs name the 2026 list, which the cover and poster now say (owner question 10) |
| 11 | "Pretty sure this would be figured out by doing mutation tests, so it doesn't seem to deserve its own box." | "Flag agent tests that assert nothing" folded into the unit-test and code-quality row, which cites P11 |
| 12 | "'Watch the pipeline from outside the factory' - this whole thing is the factory, so it's just watching the pipeline outside the pipeline. Still, everything is part of that factory." | Everything is the factory; the inspector's frame marks the security account the pipeline cannot reach |
| 13 | "would it be possible to show an sample receipt that encapsulates the 'no evidence, no deploy' and many of the 42 practices?" | A first receipt, with invented values marked illustrative |
| 14 | "make the receipt page 11 of the carousel" | The receipt became page 11, after the close |
| 15 | "This doesn't indicate that there's real evidence such as provenance, hash-pinned, digital attestations. I went through that on this repo with a receipt. Maybe check the specs. This just looks like marketing" | Page 11 now shows `main` run 114's real receipt for delivery `9f959a3`, the evidence behind each line from the logs, and what it lacks; the Receipt check ties it to the record and git (decision 0009, owner question 11) |
