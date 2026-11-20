# Prompt: the factory map

Recorded on 2026-11-20.

`docs/factory-map.png` was not made from one prompt. It grew out of the owner's messages in one Claude Code session on 2026-11-15 and 2026-11-16, kept below as given. Next come the rules those messages set. Last is a prompt to paste into a new session, to rebuild or update the map under the same rules.

The video and the carousel keep theirs the same way: `factory-video/spec-sync-prompt.md` and `practices-carousel/prompt.md`.

## The owner's instructions, as given

Times are UTC. Each text is verbatim, dictation included. "[screenshot attached]" marks an image the owner sent with the message, and "Produced" says what came of it.

### 2026-11-15 19:27

> do not make any code/doc changes yet but was just thinking how i really like the receipt metaphor for providing proof of actions. However, I realize that what each of these things do is kinda obscure to people. For example, what are some good metaphors for SAST, SCA, Provenance, Attestations, Pedigree, hermetic, Secrets Scanning, Mutation Testing, Property Testing, Validator, Hooks, etc.

Produced: metaphor suggestions, in the chat only.

### 2026-11-15 19:35

> Yes, pick construction industry. Provide a list of all of the terms and their metaphors. Do not include if it's not represented in the repo

Produced: a construction-industry list of the terms this repository represents, in the chat only.

### 2026-11-15 19:45

> That might be, actually, definitely too many. Maybe keep to the most important ones and create an image around it, maybe almost like a periodic table, where you can show a number of them and show some useful images or drawings that kind of emulate what we're talking about. Make sure it's for the most important items.

Produced: the first image, a grid of tiles in a design artifact in the session. It was not committed.

### 2026-11-15 19:53

> This is a good start. I was just thinking of the periodic table, so I still like the idea of the boxes and everything, but this doesn't use space as well as it could. Instead, I think the actual logos or images or whatever should make it even more obvious what it's doing. We don't have to come up with the two-letter periodic stuff. That's not necessary here.
>
> I like the categorization, the coloring, the fact that these are drawings and these are inspections. That's all awesome. It's just the images and logos of what it actually is. Maybe those could be richer, so you look at it and it's obvious exactly what it is. I could use the space better without having to put SP and TK. No, that is helpful.

Produced: richer drawings, and no two-letter symbols. The families, the colours, and the split between drawings and inspections were kept.

### 2026-11-15 20:06

> Do not refer to it as a periodic table

### 2026-11-15 20:08

> Factory, as a pipeline is the assembly line. Thinking of which, might Toyota Production System be a better overall metaphor for the factory and then the line is where the work occurs. That is, the line is part of the factory.

### 2026-11-15 20:10

> Rebuild it with the line running through the factory

Produced, from the last three messages: the frame changed from a construction site to a factory, after Toyota's production system. That gave today's layout: the line (`pipeline.yml`) across the middle, engineering upstream, traceability downstream, and plant security and sign-off around the line.

### 2026-11-15 20:23

> this is great. add it to the docs?

Produced: `16e862a`, which added `docs/factory-map.html`, `.png` and `.md`.

### 2026-11-15 21:20 and 21:22

> Why does it say "Only a person releases what ships."?

> go ahead with the fix. Btw, a human should approve every spec change but not every change.

Produced: `80f3cdc`, "the factory map releases on evidence; a person signs every drawing, not every part".

### 2026-11-15 21:38 and 21:39

> [screenshot attached]
> Why does it say "Released"? Aren't specs written before they start building?

> go ahead with the fix

Produced: `5eebb4f`, "the factory map's spec is an approved drawing, not a released one".

### 2026-11-15 21:40

> [screenshot attached]
> "approved before anything is built" this could be seen as big design up front, where you have to approve the entire car before anything is built. That's not what we're saying here. In this case, we're talking about even the smallest parts, right? The analog is that you might have a small feature: you talk to a customer, you get some feedback, you build it, you send it out, and that's one of the big benefits of having software versus something physical.

Produced: `40c3188`, "a factory-map drawing is one small spec per change, not the whole product up front".

### 2026-11-15 22:34 and 22:37

> How does anyone know what B3/B15/B16 or R217, B17/B18 even mean or do the numbers even matter?

> Yes, I like that Name each ID where it appears, as in “B5, a hard-coded secret”, and link scenarios/scenarios.yaml once at the top

Produced: `3ed9ff5`, "the factory map names each scenario, drops its tile tags, and labels the build record plainly".

### 2026-11-16 19:04 and 19:07

> [screenshot attached]
> Did I ask if I was mixing metaphors in this image or not? Essentially, trying to show how parts of the AI Development Lifecycle would look like in the TPS

> Please apply the recommended changes

Produced: `7bef665`, "the factory map's SAST tile inspects a part, not a drawing".

## Rules the instructions set

| # | Rule | From |
|---|---|---|
| 1 | Show only controls this repository represents | 19:35 |
| 2 | Show the most important controls only, each as a drawing that makes its job obvious. No two-letter symbols | 19:45, 19:53 |
| 3 | Keep the families and their colours. Drawings are intent; stations are inspections | 19:53 |
| 4 | Never call it a periodic table | 20:06 |
| 5 | The factory is the frame, after Toyota's production system. The line, `pipeline.yml`, runs through it, and the work happens on the line | 20:08, 20:10 |
| 6 | A person signs every drawing, not every part. Changes to a spec or to the line need the approver's key; other changes pass on the checks. Release is on evidence | 21:20, 21:22 |
| 7 | A spec is approved, not released, and it is written before its part is built | 21:38 |
| 8 | A drawing is one small spec per change, signed just before that part is built and amended as customer feedback comes in. Never the whole product up front | 21:40 |
| 9 | Name each ID where it appears, as in "B5, a hard-coded secret", and link `scenarios/scenarios.yaml` once at the top | 22:37 |
| 10 | One metaphor throughout. Every tile is a factory object: an inspection checks a part, not a drawing | 2026-11-16 |

CLAUDE.md's words apply too: "check" means automated verification and "gate" means only a human approval, and the people the product serves are customers.

## Prompt: rebuild or update the map

Paste everything below the line into a Claude Code session in this repository.

---

Update the factory map, `docs/factory-map.html`, `docs/factory-map.png` and `docs/factory-map.md`, so it shows this repository as it is on `main`. Follow every rule in the table "Rules the instructions set" in `docs/factory-map-prompt.md`.

Read first: `docs/factory-map.md`, `docs/factory-map-prompt.md`, `practices.yaml`, `scenarios/scenarios.yaml`, the specs, `docs/progress.json` and the open items in `.tasks/backlog.jsonl`.

1. Check each row of the "The controls" table in `docs/factory-map.md` against `main`:
   - Each requirement ID exists in `specs/`.
   - Each file, hook and check named exists.
   - Each scenario ID and failure line matches `scenarios/scenarios.yaml`.

   List what no longer holds.
2. Find controls the repository has that the map lacks, and tiles whose control is gone or only planned. Ask me with AskUserQuestion which to add, drop or mark, keeping to the most important (rule 2).
3. Edit `factory-map.html`:
   - One tile per control, in its family's colour.
   - Stations in the order of SPEC-001-R1's checks, then the scope check of SPEC-001-R68.
   - A red tag only where a station prints a failure line.
   - Keep the page at 1920 by 1080.
4. Update `docs/factory-map.md`:
   - The controls table, naming each ID where it appears (rule 9).
   - "Where the picture is not literal", for each tile that shows the design rather than today. For example, the release dock shows release on evidence while the owner still approves `sandbox` deploys.
   - "Sources", with the date each was read.
5. Render `factory-map.png` at 1920 by 1080 with device scale 2, in Playwright's Chromium, after the Google Fonts the page loads (Barlow, Barlow Condensed and IBM Plex Mono) have loaded. Look at the PNG yourself before you commit.
6. Give an independent subagent only the PNG, `docs/factory-map.md` and the rules table. Ask it to find:
   - mixed metaphors (rule 10);
   - text unreadable at 1920 pixels wide;
   - any claim not true on `main`.

   Fix what it finds, and say what you did not fix, and why.
7. Commit unsigned, as CLAUDE.md says. The change is under `docs/` only, so it needs no signature. Push to a candidate branch only when I say so. When its run passes, land it on `main` yourself, as CLAUDE.md "Conventions" says, and report main's run.
