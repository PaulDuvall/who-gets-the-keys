---
name: video
description: Rebuild and check the walkthrough page and narrated video from video/. Use when asked to rebuild, re-record or check the walkthrough video, or after a change to practices.yaml, scenarios/ or video/.
---

# Walkthrough video

Adapted from the `explainer-video` skill in an earlier private repository at `469f0fda93535e0b4a40fe61d22d6e122064d309`. SPEC-002 holds the requirements; `docs/decisions/0001-walkthrough-video.md` holds the decisions.

## 1. Build from a clean tree

```bash
git status --porcelain
npm run video
```

`git status --porcelain` must print nothing; the build refuses a dirty tree. Exit status 1 names the failed step or check, and so does `problems` in `build/video/report.json`.

## 2. Read the report

```bash
jq '{problems, page_sha256, commit, voice, slides, length}' build/video/report.json
```

`problems` must be empty. A slide change more than 0.25 s late usually means a busy machine: rebuild. Early or missing changes are a page or timeline fault: read the capture's frame times before rebuilding.

## 3. Look at one frame per narration line

```bash
npm run video -- --frames
```

`--frames` removes old frames and extracts one PNG per timeline entry, 0.5 s after its voice starts, as `build/video/frame-NN.png`. Read each frame and check:

| Check | Fail when |
|---|---|
| Clipping | Any text or box is cut off at an edge |
| Overlap | Two elements cover each other |
| Caption | The caption row does not match that line's written form |

Fix what you find in `video/page/template.html`, then go back to step 1.

## 4. Note the commit

```bash
git rev-parse --short HEAD
```

That SHA is the video's commit. The opening step must show it.

## 5. Deliver

- Page to publish: `npm run video -- --page-only`, then check `sha256sum build/video-page/walkthrough.html` equals `page_sha256` in `build/video/report.json`. Never publish a page from a workflow artifact.
- Video: send `build/video/walkthrough.mp4` with its length, size, SHA-256 and the commit from step 4.
- Never commit anything under `build/`.
