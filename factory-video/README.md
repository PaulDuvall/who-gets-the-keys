# Software factory slide animation

The "software factory" scene for *Who Gets the Keys? Trust and Authority in Software Factories* (AI Native DevCon 2026). It has been built here since 2026-11-08 ([decision 0008](../docs/decisions/0008-factory-video-kit.md)), so the picture sits next to the specs it shows.

**Watch it:** download the newest build from the [factory-video runs on `main`](https://github.com/PaulDuvall/who-gets-the-keys/actions/workflows/factory-video.yml?query=branch%3Amain), as [Outputs](#outputs) describes. `factory-guided.mp4` is the narrated version.

The video shows what this repository should look like and do, not only what it does today. `claims.json` ties every on-screen label and narration line to a claim and cites how far the repository has got: built (requirements in `specs/`), planned (drafts in `docs/decisions/`) or open (backlog items). Each build checks the ledger and writes `out/claims-report.md`, so the video doubles as a check of the code against the target.

The current loop shows the factory model of decision 0004, as evolved in the post-talk design notes (November 2026, a proposed decision 0005). One engineer signs a spec and two sign the factory. Where the policy tier requires it, an engineer who did not write the spec signs the release. The pipeline decides every change. Each place a human decides stays on screen for the whole loop, in blue, and nothing else is blue.

| Principle | What the viewer sees |
|---|---|
| The factory is more than the pipeline | A blue dashed frame holds the agent sandbox and its rules, Untrusted input (triage) and the pipeline, with the "FACTORY v1 · two signers" chip on its top edge over the seam between sandbox and pipeline. Specs (the intake row), the security account, the release sign-off and Production sit outside it. Decision 0004 defines the factory the same way: the pipeline, the checks and the configs they read, the receipt policy and the agent inputs; specs and tasks are not factory files |
| Engineers decide; customers do not | A blue engineer sits at the intake ("Engineer signs the spec"), on the issue panel ("Engineer checks it against the specs") and on the "FACTORY v1 · two signers" chip in every frame. A rule line reads "One engineer signs a spec, two the factory, one a release by tier." Customers are humans too, shown in grey twice: "Customer intent" flows to the engineer who signs the spec (slide 3), and customers are one of the untrusted sources, whose text never starts a run |
| Signing is a digital signature | The engineer signs a git commit to `specs/` with a key on a FIDO2 security key, and the touch is asserted by the key (decisions 0003, 0004). It proves the key holder touched the key, not that they read the spec |
| Only the pipeline signs evidence; a release signature is by tier | Deploy reads "pipeline signs the evidence, holds the key". Between Deploy and Production, a dashed blue gate reads "signs the release, by tier": where the policy tier requires it, an engineer who did not write the spec checks the change in staging and signs the release, attesting intent and outcome, not code. It is reachable only once the receipt is complete, adds a decision, never evidence, and never animates, so the loop never shows a sign-off being given. Decision 0004 has a reviewer approve the receipt by tier; the design notes make that a signature and add the separation of duties |
| Signing is a moment you can see | An outlined halo marks each signing: key, then touch, as in decision 0003. The human's key and seal are blue; the pipeline's key is red |
| The receipt follows decision 0004 | Rows: factory, intent, task, author, checks, deploy, signed by. The factory and intent rows are blue: the two human signatures. TASK says where a run began, so the #4821 fix reads "T-0043 · untrusted issue" and T-0044 reads "telemetry alarm" (the design notes' provenance tag). "signed by" is red: the pipeline signed the evidence. AUTHOR names the cloud session and attempt, never "agent run" (deviation D29). DEPLOY reads "prod · no sign-off, policy v3" |
| No human rides the conveyor | No token ever carries a human badge, and no human approves a change |
| Trusted signals start runs | A telemetry alarm creates task T-0044 with no human |
| All free text is untrusted | Customers, agents, docs and URLs all feed Untrusted input, which "never starts a run". Issue #4821 stops at the sandbox wall (NO RUN); this one becomes work through a signed revision of SPEC-118. A known error class starts instead from an alarm the policy already signed, so not every issue needs an engineer. Telemetry reads "schema fields only"; only its alarm, named in the signed policy, starts an approved task |
| The issue schema is a control | An issue reaches the coding agent only as fixed schema fields. Its free text is the notes field: the issue card reads "notes: quarantined" under the injection, and the narration says a quarantined reader fills a fixed schema from telemetry |
| The agent authors, never commits | The agent's session pushes only a candidate branch ("candidate/*" at the pipeline's entrance). After the checks of record, "promote to main" happens "out of reach" |
| The checks are the pipeline | One PIPELINE container holds Build, test, scan (SAST, DAST, SCA, Secrets, Scope); Honest tests? (Property, Mutation, Validator); promote; and Deploy, which holds the key. Scope fails any path outside the task's list or under `specs/`, `tasks/` or a protected path (decision 0004, R67). The header reads "checks of record · AI can only fail": the coding agent never runs here, and a scoped AI check may fail a change but never pass one |
| In-run checks are feedback | Inside the sandbox, in seconds: "Empty tests" (a hook flags a test that asserts nothing) and "Dep allowlist". On T-0042's first attempt "Empty tests" turns red: RETRY 1/3 |
| A security account watches for drift | Outside the pipeline, an eye and "Security account · watches for drift" with dotted watch lines into Deploy and Production. The pipeline cannot touch it |
| The agent runs as a cloud session | The Agent card reads "cloud session · one run per task": a fresh container per task, with no laptop credentials and no approver key |

Google Slides cannot loop video, so the primary output for the deck is the looping GIF. The 3-minute MP4 is the fallback.

## Outputs

Generated files are never committed, so they never pile up in git history. `build.sh` writes them to `out/` on your machine. On every push to `main` that touches this folder, and on demand, the `factory-video` workflow (`.github/workflows/factory-video.yml`, landed in `9f887da` on 2026-11-08) builds and verifies them. It uploads them as one artifact, `factory-video-<short SHA>-<UTC time>`, then a separate job deletes every earlier `factory-video-` artifact. So only one copy of each file exists, and it expires 30 days after upload. The build job can only read the repository; the prune job can only delete artifacts. A failed check uploads nothing, and the previous build stays.

To download the newest build:

| Where | How |
|---|---|
| Browser | Open the [factory-video runs on `main`](https://github.com/PaulDuvall/who-gets-the-keys/actions/workflows/factory-video.yml?query=branch%3Amain). Open the newest run whose Artifacts section lists a `factory-video-…` artifact, and download it; GitHub asks you to sign in. A push that changes only specs, decisions, proposals or the backlog runs the claims check alone, and its run lists a `factory-claims-…` artifact instead |
| Terminal | The first command below, with the GitHub CLI signed in. It downloads the newest artifact whose name matches |
| Nothing listed | No build has run in the last 30 days, so the artifact has expired. Start one with the second command, or with **Run workflow** on the runs page. Starting it needs write access |

```bash
gh run download --repo PaulDuvall/who-gets-the-keys --pattern 'factory-video-*'
```

```bash
gh workflow run factory-video.yml --repo PaulDuvall/who-gets-the-keys --ref main
```

| File | What it is |
|---|---|
| `factory-full-3min.mp4` | 1920×900, H.264, yuv420p, 30 fps, 180 s: the 18 s loop ×10 |
| `factory-full-1920.gif` | 1920×900, 20 fps, 360 frames, 18 s, infinite loop, about 3.5 MB |
| `factory-guided-clean.mp4` | 1920×900, the same video with no burned-in captions, and the captions as a soft `mov_text` track: for platforms that draw their own |
| `factory-guided.srt` | The captions as SubRip cues, a sentence or half-sentence at a time, timed to the voice: to upload alongside the clean video |
| `claims-report.md` | Every claim the video makes, with its status in this repository at the build commit: built, partly built, planned, open or illustrative |
| `factory-guided.mp4` | 1920×1080, H.264, yuv420p, 30 fps, AAC voiceover, 124.8 s: one narrated, captioned pass with a camera, for video rather than the deck. See [The guided video](#the-guided-video) |
| `contact-sheet.png` | Six frames of one loop, at 0, 3, 6, 9, 12 and 15 s, with what each shows |
| `poster.png`, `poster.pdf` | 3840×2160 static poster and a one-page vector PDF with every font embedded |
| `probe/t-*.png` | Local only. Frames at each story beat, written by `verify.mjs` for review |

## Source

| File | Purpose |
|---|---|
| `scene.js` | Design tokens, layout constants, inline Lucide-style icons, SVG components, receipts, and `drawScene(state)` |
| `loop.js` | The 18 s timeline, shared by `slide.html` and `guided.html` |
| `slide.html` | The deck's loop. Exposes a pure `window.render(t)`, `window.LOOP_SECONDS` and `window.__debug(t)` |
| `guided.html` | The guided video: three passes of the loop with a speed track, a camera and captions. Exposes `window.render(g)`, `window.DURATION_SECONDS`, `window.FRAME_SIZE`, `window.GUIDED_SHOTS` and `window.__debug(g)` |
| `narration.js` | The guided video's script: one line per shot, with each line's rendered length |
| `spec-sync-prompt.md` | A prompt for a session in this repository: every claim the video makes, mapped to the requirements, with the gaps to specify. Decision 0006 answered it |
| `narrate.py` | Renders the lines with Kokoro (`update`, `render`), checks their digests (`check`), mixes them into the soundtrack (`mix`) and writes the SubRip captions (`srt`) |
| `claims.json` | The claims ledger: each on-screen label and narration line, the claim it makes, and the IDs that show it built, planned or open |
| `narration/requirements.in` | `kokoro-onnx==0.6.1`, the one direct dependency, which the batch adds to `allowed-deps.txt` |
| `narration/requirements.txt` | kokoro-onnx 0.6.1 and its dependencies, hash-pinned (pip-compile --generate-hashes). A protected path once the batch `proposals/factory-video/` lands |
| `narration/models.json` | The two Kokoro model files' source and SHA-256, which `narrate.py` checks before use. Protected with `narration/requirements.txt` |
| `poster.html` | Static full-detail scene on a 2400×1350 canvas, from the same components |
| `playwright.mjs` | Loads Playwright from `video/record`'s pinned package, so this kit adds no dependency. Falls back to a Playwright the machine already has |
| `render.mjs` | Playwright frame stepper: `node render.mjs <html> <outDir> <fps>`, or `--poster`, or `--sheet`. It renders `DURATION_SECONDS` if the page sets it, else one loop, at `FRAME_SIZE` if set, and writes `shots.json` for the soundtrack |
| `build.sh` | Renders frames, encodes both MP4s and the GIF, renders the contact sheet and poster, then runs `verify.mjs` |
| `verify.mjs` | Every acceptance check, reported as a table; exits non-zero on failure |

Everything runs offline. Fonts are system Liberation Sans and Liberation Mono, which are metric-compatible with Arial and Courier New. Icons are inline paths. There is no CDN and no fetch.

## Run it

Run these from `factory-video/`. Needs Node 24, Playwright with Chromium (CI installs `video/record`'s pinned copy), ffmpeg, poppler-utils (`pdfinfo`, `pdffonts`), and Kokoro for the guided video's voice (Python 3.12+). The model files go in `~/.cache/kokoro`, or wherever `KOKORO_MODEL_DIR` points:

```bash
python3 -m venv .venv-kokoro && .venv-kokoro/bin/pip install --require-hashes -r narration/requirements.txt
```

```bash
mkdir -p ~/.cache/kokoro && cd ~/.cache/kokoro && R=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0 && curl -LO $R/kokoro-v1.0.onnx && curl -LO $R/voices-v1.0.bin
```

Then run the build with `NARRATE_PYTHON=.venv-kokoro/bin/python ./build.sh`. Without poppler the build still writes every file; only the poster PDF check fails, with an install hint.

```bash
./build.sh
```

```bash
node verify.mjs --only beats,model
```

To preview, open `slide.html` in a browser. It plays with `requestAnimationFrame`. Add `?t=10.9` to the URL to freeze one moment. `guided.html` works the same way, with `?g=25` for a moment of the guided video.

## The 18 s loop

| Time | Main lane | Side lane |
|---|---|---|
| 0–2 s | The approver signs SPEC-118 at the intake: key, then touch. It becomes task T-0042 and drops into the Agent | |
| 2–5 s | The Agent returns a patch. In-run checks fail it once (RETRY 1/3); it loops back and passes on attempt 2 | 3–9 s: issue #4821 reaches Untrusted input, stops at the sandbox wall (NO RUN) and drops to the issue panel. A human turns it into a spec and signs it with the key. SPEC-118 rev 2 travels around the sandbox to the intake and queues as T-0043 |
| 5–9 s | Build/test/scan chips light, then Scope, then Property, Mutation, Validator | |
| 9–10 s | The patch crosses "promote · out of reach" and becomes a promoted change | |
| 10–12 s | The receipt fills line by line, then "VERIFIED: key turns". The key turns and Production opens briefly | |
| 12–18 s | T-0043 (last loop's issue, via its spec) runs behind T-0042 and deploys at 15.2 s | Telemetry returns along HOURS; Telemetry flashes "alarm → task"; task T-0044 enters the Agent labelled "trusted signal" |

Three runs share the conveyor, staggered so it is never empty: T-0042 (the signed spec), T-0043 (the #4821 fix, via SPEC-118 rev 2) and T-0044 (the trusted signal), which wraps into the next loop and deploys at 5.7 s. Production opens only for those three verified changes.

`render(t)` reads only `t`. Time is quantised to whole microseconds, so `t` and `t + 18` produce byte-identical frames. The belt treads move 2,000 units per loop (80 treads of 25).

## The guided video

`factory-guided.mp4` is narrated and zooms in on one beat at a time. The loop runs three lanes at once: a signed spec on the conveyor, an untrusted issue, and telemetry. A camera that frames one lane hides the others, and in the loop it would also repeat 10 times. So the guided video plays the loop three times in a row. The loop is periodic, so the passes join with no jump, and each pass follows one story.

| Video time | Narration and caption | Camera |
|---|---|---|
| 0.0–5.5 s | "This is a software factory. Follow one change from intent to production." | Overview |
| 5.5–13.9 s | "A customer states intent. An engineer captures it as a spec, and signs it with a security key and a touch." | Intake, 1.8× |
| 13.9–22.7 s | "The agent works in a cloud session, one run per task. A hook flags a test that asserts nothing, and the agent fixes it." | Agent, 1.7× |
| 22.7–36.1 s | "Then the pipeline runs the checks of record, without the coding agent: scans, scope, and tests proven to catch broken code. Scoped AI checks can fail a change, never pass one." | PIPELINE, 1.6× |
| 36.1–50.0 s | "The patch is promoted to main, out of the agent's reach, and only the pipeline signs the evidence. Where the tier requires it, an engineer who didn't write the spec checks staging, then signs the release." | Deploy to Production, 1.18× |
| 50.0–52.8 s | "Now an issue comes in." | Overview |
| 52.8–61.7 s | "Free text is untrusted. Whether it comes from a customer, an agent, a doc or a URL, it never starts a run." | Issue lane, 1.7× |
| 61.7–69.8 s | "This one becomes work through a spec an engineer signs. Known errors start from alarms the policy already signed." | Issue panel, 2.0× |
| 69.8–72.9 s | "The signed spec queues as a new task." | Follows the spec, 1.5× |
| 72.9–76.5 s | "It runs the same checks as every other change." | Overview |
| 76.5–83.6 s | "Its receipt records that it began as an untrusted issue, and traces it through the spec to the deploy." | Deploy to Production, 1.18× |
| 83.6–87.2 s | (silent) | Overview |
| 87.2–96.8 s | "Production telemetry is untrusted too. A quarantined reader fills a fixed schema, and its free text never reaches the agent." | HOURS band, 1.1× |
| 96.8–101.9 s | "Only an alarm named in the signed policy can start an approved task." | Telemetry and Agent, 1.8× |
| 101.9–109.1 s | "A separate security account watches the pipeline and production for drift. The pipeline can't touch it." | Security account, 1.8× |
| 109.1–116.0 s | "One engineer signs each spec, two sign the factory, and the pipeline decides every change." | Overview |
| 116.0–118.8 s | "No evidence, no deploy." | Overview |
| 118.8–124.8 s | (silent) End card: built so far, and what is left | Overview |

The narration sets the pace. Each shot lasts at least its line plus 0.4 s before and 0.5 s after, and the loop slows to fit; parts no shot follows still play at 2–4× in overview. Each line is also its shot's caption, in a strip below the picture, so the frame is 1920×1080 and captions never cover the scene. The voice is Kokoro-82M (Apache-licensed weights, "trained exclusively on permissive/non-copyrighted audio data") with `af_heart`, the only grade-A voice in Kokoro's own table, at speed 0.9: about 167 words a minute. Kokoro renders byte-identical audio for the same line on one machine; between CPUs a line's length can differ by a few hundredths of a second. `narration.js` stores each line's length and a key over its text, the voice, the speed and the model. The build fails if a key no longer matches its line, or a length is off by more than 0.1 s. To change a line or the voice (`VOICE` in `narrate.py`), edit it, then run `narrate.py update` with the Kokoro python.

The camera zooms by changing the SVG `viewBox`, so text stays vector-sharp and is never smaller than in the loop. Speed changes ramp over 0.5 s. The story starts and ends on the same overview frame. A silent end card then holds that frame: each label of a claim not yet built is outlined, solid amber for planned, solid red for open, dashed amber for partly built, a planned or open one is faded, and the caption, also a cue in the SRT, counts claims built, partly built, planned and open, and requirements approved and drafted. `build.sh` writes the counts with `scripts/progress.ts`, the code behind the README's progress picture, so the two agree (SPEC-001-R229). Blue stays for the places a human decides. The GIF keeps a fixed camera: the same camera track made a test GIF of 23.5 MB, against 3.6 MB without it and a 5 MB limit.

## Checks

`verify.mjs` checks every acceptance criterion in the brief:

| Criterion | Check |
|---|---|
| The loop is seamless | The MP4's frames at 0 s and 18 s differ by a mean of 0.0000 grey levels (limit 0.3). Stream copy makes that comparison close to automatic, so the GIF check also compares the last frame with the first against the largest normal frame change |
| Length | ffprobe: 1920×900, 180.000 s |
| The human shows at every human decision, and nowhere else | All 540 frames of one loop: a human icon at the intake, the issue panel, the factory chip, the rule line and the optional deploy approval in every frame, none anywhere else, signing only at the intake and the issue panel, the deploy approval always dashed, and no token with a human badge |
| The issue never reaches the Agent card | All 540 frames: the issue never enters the sandbox or touches the Agent card |
| Every token that reaches Production passes Scope and the promote marker | All 540 frames, for T-0042, T-0043 and T-0044 |
| No "commit" label before the checks of record | No on-screen text is the word "commit", in any frame, and no `text()` call in the source draws it |
| Text stays legible | No text in any frame is below 23.59 units, the smallest text in the previous build. The smallest is now 24.28 |
| Text stays off pictures | No text crosses an area marked `data-keepout`, such as the issue card's slot. Revision 18 added this after a monospace "notes: quarantined" ran into the slot and the card check missed it |

For the guided video, `verify.mjs` checks:

| Criterion | Check |
|---|---|
| One guided pass | 40–150 s; story time runs from 0 to 54, three passes of the loop, and never backwards |
| The narration fits | Every shot lasts its line plus 0.4 s before and 0.5 s after, and shows the line as its caption |
| The narration digests are current | Each line's `digest` in `narration.js` is the SHA-256 of the model files' hashes, the voice, the speed and its text (`narrate.py check`), so any edit since the last `narrate.py update` fails |
| The narration lengths are current | Each line's rendered length is within 0.1 s of the length stored in `narration.js` (`TOLERANCE` in `narrate.py`) |
| The camera frames each beat | Every frame: once the camera settles, the shot's focus box is fully in frame; zoom stays between 1.0 and 2.0; every zoomed shot holds at least 1 s |
| The story starts and ends on the overview | The first frame and the last frame before the end card are identical |
| The end card shows what is left | Every label of a claim not yet built is outlined, and its caption starts "Built so far:" with the counts |
| The MP4 matches the page | 1920×1080, H.264, yuv420p, 30 fps, an AAC voiceover as long as the video, and a duration within 0.05 s of the page's |
| The claims ledger is complete | Every on-screen label and narration line belongs to a claim in `claims.json`; every cited requirement is in `specs/`, every draft in `docs/decisions/` or `proposals/`, every backlog ID in `.tasks/backlog.jsonl`, every file string in its file. Gaps do not fail; they go in `out/claims-report.md` |
| Captions stay in the safe area | Every caption keeps to the middle 80% of the width and to its strip, in at most three lines, so a player that crops the sides still shows all of it |
| The clean MP4 matches the page | 1920×900, H.264, 30 fps, the AAC voiceover, a `mov_text` caption track, and a duration within 0.05 s of the page's |
| The captions file is right | The SubRip cues are in order, never overlap, end inside the video, have at most two lines each, and together are exactly the narration's words |

It also checks the labels, the 12 story beats (with a PNG of each in `probe/`), determinism, layout over every frame, that Production opens only while a verified change enters, that nothing is fetched, and the GIF, contact sheet and poster files.

## Decisions made in this revision

Revision 20, moved to who-gets-the-keys (decision 0008):

- **Built here, kept once.** The `factory-video` workflow builds the kit on a push to `main` that touches it, and uploads one artifact. A separate job deletes the earlier ones. That replaces a GitHub release that was deleted and recreated on each build and needed `contents: write`.
- **No new dependency.** Playwright comes from `video/record`'s pinned package through `playwright.mjs`. The voice's pins moved to `narration/`, which joins the protected paths.
- **The video is the target, and the ledger is the check.** `claims.json` and its check report, per claim, what is built, planned or open. At this revision: 11 built, 6 partly built, 6 planned, 1 open (DAST) and 2 illustrative.
- **Dependencies pinned and protected.** `narration/requirements.in` names `kokoro-onnx==0.6.1`; the batch adds it to `allowed-deps.txt` and protects `narration/`, `package.json` and `package-lock.json` under this folder.
- **Made to pass this repository's checks.** `render.js` became the ES module `render.mjs`. `loop.js` parses each frame's SVG with `DOMParser` instead of assigning `innerHTML`. Each narration line's SHA-256 is named `digest`, not `key`, which gitleaks's generic API-key rule would match. The scene, the narration and every output are unchanged.

Revision 19, the factory is more than the pipeline:

- **What the factory is.** Everything that turns a signed spec into a deployed change: the sandbox's rules and in-run checks, issue triage and the quarantined reader, the pipeline, and the policy. That matches decision 0004's definition. The chip sat on the PIPELINE tab, which read as factory equals pipeline.
- **A frame, not more words.** A blue dashed outline encloses the sandbox, Untrusted input and the pipeline; the pipeline's own right wall closes it. The chip hangs from its top edge over the seam between sandbox and pipeline. Blue, because two engineers approve what is inside.
- **What stays outside, and why.** Specs are work orders, signed one per change. The security account inspects the factory: if it were inside, the factory's signers could weaken it. The release sign-off is a separate human judgment, and Production is the output.
- **Room for it.** The intake row moved up 12 units so the frame's top edge fits between it and the sandbox, and the security account moved right 40 units so the frame can drop to the pipeline's top wall left of it. The scene scales by 1.1476 (from 1.1563), and the smallest text is still above the floor.
- **Complexity.** Unchanged at 179 words, 75 text elements and 29 boxes: the frame is one outline, not a card. The poster is unchanged.

Revision 18, the issue schema, AI checks that can only fail, and safer captions:

- **Not every issue needs an engineer.** The issue line read "An issue becomes work only when an engineer checks it against the specs and signs off." That is true for a feature, not for a known error, which starts from an alarm the policy already signed. It now reads "This one becomes work through a spec an engineer signs. Known errors start from alarms the policy already signed."
- **The issue schema is a control.** The coding agent sees an issue only as fixed fields. The issue card adds "notes: quarantined" under the injection, Telemetry reads "schema fields only" instead of "read-only, untrusted", and the narration says a quarantined reader fills a fixed schema.
- **AI checks can only fail.** The pipeline header reads "checks of record · AI can only fail" instead of "no agent", and the narration says the coding agent never runs there while scoped AI checks can fail a change, never pass one. Not drawn: an AI check's verdict can differ between runs, so a failure has to stick to the diff's hash, or rerunning could wash it out. That belongs in decision 0005.
- **Captions for cropping players.** Captions now keep to the middle 75% of the width (from 88%), and a check holds them to the middle 80%. A player's own live captions can still draw on top; the MP4 carries none of its own on the burned-in version.
- **A clean video and a captions file.** `factory-guided-clean.mp4` is the scene only, 1920×900, with the captions as a soft track, and `factory-guided.srt` holds the same cues for platforms that take a captions file. The release publishes both.
- **Complexity.** On the overview frame: 179 words (from 174), 75 text elements (from 74), 29 boxes.
- **Length.** Three narration lines changed: speech is 100.3 s (from 94.1 s) and the guided video 118.8 s (from 112.6 s). The captions file has 31 cues.

Revision 17, the design notes' model:

- **Who signs what, and how many.** The rule line reads "One engineer signs a spec, two the factory, one a release by tier.", and the factory chip and receipt read "two signers". Decision 0004 has one approver for the factory; the design notes propose two, so one person cannot both weaken a control and approve it.
- **A release signature, by tier.** The dashed gate before Production reads "signs the release, by tier", replacing "optional last look → deploy". The narration adds the separation of duties: the release signer did not write the spec.
- **Provenance on the receipt.** TASK reads "T-0043 · untrusted issue" and "T-0044 · telemetry alarm". The narration says the receipt records that the change began as an untrusted issue, and that a quarantined reader passes on only fixed fields from telemetry.
- **What stays as decision 0004 has it.** A telemetry alarm starts an approved task, not a spec (the notes say alarm to spec; 0004's R92 names a task, whose path list the scope check already enforces). The notes' three-person rule for telemetry-started runs and the two-person policy signature are not drawn separately: the factory chip covers the policy.
- **Complexity.** On the overview frame: 174 words (from 172), 74 text elements, 29 boxes, both unchanged. The rule line is one word longer. Four narration lines changed, so speech is 94.1 s (from 86.3 s) and the guided video is 112.6 s (from 104.8 s).

Revision 16, a text check for the narration:

- **Each line carries a key.** `narrate.py update` stores, beside each length, the first 12 hex digits of a SHA-256 over the model files' hashes, the voice, the speed and the text. `narrate.py check` recomputes it with the standard library alone; `render` runs it first, and `verify.mjs` records it as a check. Any edit since the last update fails, however small: revision 15's 0.1 s length check missed dropping "a" from a line (0.064 s).
- **Two checks, two jobs.** The key says exactly what was measured. The 0.1 s tolerance absorbs the differences between CPUs. Neither has to do the other's job.

Revision 15, a narration tolerance that holds across machines:

- **Kokoro is repeatable on one machine, not across machines.** The release build for revision 14 failed because a GitHub runner rendered "The signed spec queues as a new task." in 2.133 s against a stored 2.155 s. The run before it, and the authoring machine at 1, 2 and 4 threads, matched exactly. The likely cause is onnxruntime choosing different kernels for a different CPU (inference: the logs do not record the runner's CPU).
- **The tolerance is 0.1 s, up from 0.02 s.** That is a fifth of the 0.5 s tail each shot keeps after its line, so a line still ends inside its shot, and `narrate.py mix` fails if one does not. It is a length check, not a text check: dropping "a" from "The signed spec queues as a new task." moves that line by 0.064 s, so an edit that small goes unflagged until the next `narrate.py update`. That costs nothing in the video, because the tail absorbs it. Adding or removing a longer word still fails: "every" in "It runs the same checks as every other change." is 0.384 s. `verify.mjs` reads the value from `narrate.py`, and `narrate.py render` prints the largest difference it saw.

Revision 14, issues checked against the specs:

- **An issue may need no new spec.** An engineer signs off in one of three ways: a new spec, a revision of an existing one (the video's SPEC-118 rev 2), or a task citing a requirement already approved (R65 checks only that the cited IDs exist). The caption now reads "An issue becomes work only when an engineer checks it against the specs and signs off. Unread issues just wait.", and the issue panel reads "Engineer checks it against the specs". The line is 7.125 s, so the guided video is 104.8 s.
- **The check can be automated; the sign-off cannot.** The triage job may label the issue (R93), and a session may draft a matching task under `proposals/` (R66). Committing the task needs an approver's signature (R67), and a run starts only from the owner or a signal named in the signed policy (R83, R92). A validator that started runs from issue text would make its verdict a security control.

Revision 13, a more natural voice:

- **Kokoro instead of Piper.** Piper's `en_US-ljspeech-medium` was the ceiling of its engine. Kokoro is newer and more expressive, and the talk track's narration already uses it. Its licence clears decision 0001's bar: Apache-licensed weights, trained on permissive or public-domain audio.
- **`af_heart`, not `am_michael`.** Kokoro grades its voices: `af_heart` is the only A; `am_michael`, the talk track's voice, is C+, the best male voice. Switching is one line (`VOICE` in `narrate.py`), then `narrate.py update`.
- **Speed 0.9, about 167 words a minute.** At 1.0 Kokoro reads the script at 179. The 237 words take 85.8 s, and the guided video is 104.3 s.
- **Unread issues just wait.** The issue line read "That is the only way it becomes work", which sounded as if an engineer must read every issue. Under decision 0004 issues never start a run, and no human reads or strips one first (deviation D27). It now reads "An issue becomes work only if an engineer writes a spec from it and signs it. Unread issues just wait."
- **Pinned like the rest.** kokoro-onnx and its 12 dependencies are hash-pinned. The two model files are pinned by SHA-256 recorded on first download, because the release publishes no hashes. Kokoro needs no system espeak-ng: `espeakng-loader` bundles it.

Revision 12, the narrated guided video:

- **Narrate the guided video, not the loop.** The loop plays behind the speaker on stage; the guided video is watched on its own.
- **The narration sets the timing.** At 167 words a minute, 236 words need 86 s, so the guided video grew from 47.75 s to 104.4 s rather than the voice rushing.
- **Captions below the picture.** Many feeds play video muted, so every line is also on screen, in a strip that never covers the scene.
- **The same voice, pinned the same way, as decision 0001.** Piper is installed from hash-pinned requirements, and `narrate.py` checks the voice files' SHA-256 before use. (Revision 13 replaced Piper with Kokoro.)

Revision 11, customer intent and the reviewer gate:

- **The customer is the source of intent.** The top row reads "Customer intent" → the engineer → SPEC-118 → "Engineer signs the spec" → "T-0043 · queued". The queue moved right, so the signed rev-2 spec now travels round the left edge and along the top to it.
- **Only the pipeline signs evidence.** Deploy says so. The optional reviewer moved off the Production card to a dashed gate between Deploy and Production, so its place in the order is visible: evidence first, then an optional last look, then Production. The Production card is 320 units tall again, and the telemetry return starts at its right-hand corner.

Revision 10, more moving parts with less to read. Measured on the overview frame (t = 0) against revision 9: words 196 → 167, text elements 76 → 72, boxes 27 → 29 (the two In-run chips).

- **Added:** engineers and customers named; every free-text source ("customers, agents, docs, URLs"); telemetry content untrusted, only its alarm trusted; In-run check examples; git ("candidate/*", "promote to main"); a security account watching for drift; a guided-video shot on it.
- **Cut, because something else already said it:** the three sandbox bullets (Deploy holds the key; promote is out of reach; the factory is engineer-approved); "Enforcement belongs in the deployment pipeline" on the slide (the PIPELINE tab; the poster keeps it); "redacted, read-only telemetry" (the Telemetry card); "out of the agent's reach" on Deploy (the promote marker); "Intent routes to a human."; "feedback, retry" (the chips); the reviewer's second line.
- **Not shown:** a schema for issue creation. The talk track, the slides and decision 0004 do not describe one (0004 has a schema only for task files).

Revision 9, the checks are the pipeline:

- **One PIPELINE container.** Build, test, scan; Honest tests?; promote; and the stage that holds the key now sit inside one solid outline, with a PIPELINE tab and MINUTES on its top wall. Before, a separate "Pipeline" station came after the checks, so the checks looked like a step before the pipeline. Slide 4 shows the pipeline as Source, Build, Test, Deploy, with SAST, DAST, SCA and Secrets running "Minutes in the pipeline". Slide 7 makes mutation scores, the independent validator and attestations the pipeline's own evidence.
- **The last stage is "Deploy"**, slide 4's stage name. It still "signs evidence, holds the key, out of the agent's reach".
- **No KEEP, CHANGE or ADD.** They are the talk's section names, not what a station does. The stations show the checks they run. The words are gone from the slide and the poster, and `verify.mjs` fails if they return on either.
- **The guided video's checks shot frames the whole container.**

Revision 8, aligned with [decision 0004](https://github.com/PaulDuvall/who-gets-the-keys/blob/main/docs/decisions/0004-factory-model.md) (Proposed, 2026-11-05) in PaulDuvall/who-gets-the-keys:

- **The deploy approval names its terms.** 0004's third human row reads "Optionally approve production deploys and irreversible changes", by tier, set in policy, and its deploy tiers say the reviewer approves "The receipt, not the diff", with admin bypass off. The card and rule line now say "the receipt, by policy".
- **The receipt uses 0004's lines.** 0004 defines FACTORY, INTENT, TASK, AUTHOR and DEPLOY. The receipt keeps the checks and the signer, and merges "checks" and "tests" into one row, so it has 7 rows instead of 6. Rows tick by 42% of the Deploy dwell, before "VERIFIED" at 45%. Values are illustrative.
- **AUTHOR is the cloud session and its attempt.** T-0042 retried once, so its line reads "attempt 2". 0004's deviation D29 names the producer run or cloud session, not "agent run".
- **Poster: an approver signs the spec.** The upstream Spec chip read "customer confirms". 0004's deviation D26 says an approver signs and no customer confirms, so it reads "approver signs", in blue.

Revision 7, the guided video:

- **Three passes, not per-lane clocks.** The loop's lanes share one clock and wrap round 18 s. Replaying the loop keeps its timing exact, and needs no change to it. Moving it into `loop.js` left its output byte-identical: the SHA-256 of all 540 frames' SVG matched before and after.
- **Speed and camera tracks only.** Beats run at 0.6–0.9×; the parts no shot follows play at 2–4× in overview.
- **No captions.** The labels on screen carry each beat. Captions would be a later addition.

Revision 6, the optional deploy approval:

- **Dashed, not solid.** A human may approve a deploy, but the factory does not require it. The dashed outline says "may", and the icon never animates, so no frame implies the approval happened or blocked a change.
- **On the Production card**, not above it. The poster draws a watch line into the top of that card, so a label there would cross it. The card is 40 units taller (360) and the telemetry path starts at its new bottom edge.
- **The rule line dropped "The pipeline decides every change."** A third approval did not fit on the row with it. The Production card's "The pipeline acts." carries that point.
- **Changes entering Production are clipped below the card.** A change's hanging receipt used to show under the card's bottom edge for 3 frames at each entry.

Revision 5, where the human gets involved:

- **Blue means a human decision.** `C.human` (#1f57a4) is used only for the approver, their key, touch and seal, the factory approval, the rule line and the receipt's spec line (revision 8: its factory and intent lines).
- **The approver is always shown.** Revision 4 showed a human only while a spec was being signed, 3.7 s of the 18 s loop (0–2.3 s and 5.9–7.3 s), so most frames had no human at all. The acceptance check changed with it: "a human icon only at spec signing" became "a human at every human decision, nowhere else".
- **The rule line uses the intake row's empty right side**, so the scene keeps its 1.156 scale and its 24.28-unit smallest text.
- **"signed spec" became "Human signs the spec"**, and the factory chip became "FACTORY v1 · human-approved".

Revision 4, the factory model:

- **Decision 0004 is not in a repo yet.** Neither branch of `PaulDuvall/who-gets-the-keys` has it, so this build follows the task brief. The signing beat follows decision 0003: key, then touch.
- **The issue panel's human icon** showed only while the rev-2 spec was signed (5.9–7.3 s). Revision 5 shows it throughout, with the signing halo in that window.
- **Untrusted input moved outside the sandbox**, so the issue can stop at the wall. Telemetry stays inside: it is a trusted signal.
- **T-0044's receipt** reads "T-0044 · trusted signal", with change #4823. The brief gave receipts only for T-0042 and the #4821 fix.
- **"FACTORY v1 · approved"** sits beside the pipeline header. "checks of record · no agent" sits on the MINUTES band. (Revision 9 moved both onto the PIPELINE container.)
- **Text floor.** Scene text is at least 21 units. The slide scales scene space by 1.156, so the smallest text renders at 24.28.
- **Poster.** It keeps the upstream and watchtower rows, shows every conveyor token as an agent run, and shows the issue stopped at the wall.

## Earlier revisions

| Revision | Change |
|---|---|
| 1 | The first build, from the brief's Layout section: 12 s loop, seven stations |
| 2 | Fewer boxes and words, five stations, a 20-unit text floor |
| 2.1 | Cut the watchtower subtitle and the tray's second line |
| 3 | Dropped the upstream and watchtower rows from the slide; the scene scales up to fill the frame |
| 4 | The factory model (decision 0004): 18 s loop, signed-spec intake, NO RUN at the wall, promote out of reach, trusted-signal tasks |
| 5 | Where the human gets involved: one colour for human decisions, always on screen, a signing halo, a rule line and a blue spec line on the receipt |
| 6 | An optional human approval of the deploy, dashed on the Production card |
| 7 | The guided video: three passes of the loop with a speed track and a camera |
| 8 | Aligned with decision 0004: the deploy approval is of the receipt, by policy; the receipt's 7 rows; "approver signs" on the poster |
| 9 | The checks are the pipeline: one PIPELINE container with Deploy as its last stage; no KEEP, CHANGE or ADD |
| 10 | Engineers and customers, all free text untrusted, in-run check examples, git, a security account; fewer words |
| 11 | Customer intent at the intake; only the pipeline signs evidence; an optional reviewer gate between Deploy and Production |
| 12 | The guided video is narrated and captioned: 104.4 s at 1920×1080 |
| 13 | A more natural voice: Kokoro `af_heart` replaces Piper; the issue caption says unread issues just wait; the guided video is 104.3 s |
| 14 | An issue is checked against the specs, not always made a spec: new caption and issue-panel label; 104.8 s |
| 15 | A 0.1 s narration tolerance, because Kokoro's line lengths differ slightly between CPUs |
| 16 | A key per narration line, so any text, voice, speed or model change since the last `narrate.py update` fails the build |
| 17 | The design notes' model: two factory signers, a release signature by tier, provenance on the receipt; 112.6 s |
| 18 | The issue schema on screen, AI checks that can only fail, captions in a safe area, a clean video and an SRT; 118.8 s |
| 19 | A factory frame around the sandbox, triage and pipeline; specs, the security account, the release sign-off and Production outside |
| 20 | Moved to who-gets-the-keys: built by the `factory-video` workflow, one artifact kept, no new dependency |
| 21 | A silent end card: what is built and what is left, from `scripts/progress.ts`; 124.8 s |

## Poster sources

Receipt values and IDs are illustrative, and the poster says so. Incident captions and OWASP IDs were checked on 2026-11-05:

- OWASP Top 10 for LLM Applications 2026 (LLM01 prompt injection, LLM03 excessive agency, LLM04 supply chain, LLM05 data and model poisoning): <https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/>, change table at <https://www.imperva.com/blog/owasp-llm-top-10-2026-what-changed/>
- Amazon Q Developer extension 1.84.0, AWS-2025-015: <https://aws.amazon.com/security/security-bulletins/AWS-2025-015/>
- Nx "s1ngularity": <https://www.wiz.io/blog/s1ngularity-supply-chain-attack>
- Clinejection: <https://snyk.io/blog/cline-supply-chain-attack-prompt-injection-github-actions/> and <https://adnanthekhan.com/posts/clinejection/>
