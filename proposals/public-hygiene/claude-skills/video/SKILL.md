---
name: video
description: Rebuild and check the walkthrough page and narrated video from video/. Use when asked to rebuild, re-record or check the walkthrough video, or after a change to practices.yaml, scenarios/ or video/.
---

# Walkthrough video

SPEC-002 holds the requirements; `docs/decisions/0001-walkthrough-video.md` holds the decisions.

## 1. Build from a clean tree

```bash
git status --porcelain
npm run video
```

`git status --porcelain` must print nothing; the build refuses a dirty tree. Exit status 1 names the failed step or check, and so does `problems` in `build/video/report.json`.

## 2. Read the report

```bash
jq '{passed, problems, commit, page_sha256, video, layout}' build/video/report.json
```

`problems` must be empty. A slide change at `null` means no frame scored 0.03 or more: two steps look alike. The 100 ms blank between steps in `video/page/template.html` prevents it; check that it still applies. A change more than 0.25 s late usually means a busy machine: rebuild.

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

These frames come before each step's replayed output, which starts 1.2 s after the step, so terminal panes are empty in them. Check the end state too, with one frame 0.25 s before each step ends:

```bash
node -e 'const t=require("./build/video/narration/timeline.json");const b=t.entries[0].start;t.entries.forEach((e,i)=>console.log(String(i+1).padStart(2,"0"),(e.start-b+e.hold-0.25).toFixed(2)))' > build/video/ends.txt
while read n at; do ffmpeg -nostdin -loglevel error -y -ss "$at" -i build/video/walkthrough.mp4 -frames:v 1 "build/video/end-$n.png"; done < build/video/ends.txt
```

| Check | Fail when |
|---|---|
| Replay | A terminal pane is empty, or a scenario's last line is not its red failure or `BOUNDARY HELD` line |
| Verdict | The verdict line is missing, except on steps marked "Not recorded" |

Fix what you find in `video/page/template.html`, then go back to step 1.

## 4. Note the commit

```bash
git rev-parse --short HEAD
```

That SHA is the video's commit. The opening step must show it.

## 5. Deliver

- Page to publish: `npm run video -- --page-only`, then check `sha256sum build/video-page/walkthrough.html` equals `page_sha256` in `build/video/report.json`. Never publish a page from a workflow artifact.
- Video: copy it to a timestamped name, then send that copy with its length, size, SHA-256 and the commit from step 4. The SHA is the one the report recorded, and the time is when the build wrote the video, in UTC:

```bash
cp build/video/walkthrough.mp4 "build/video/walkthrough-$(jq -r .commit build/video/report.json | cut -c1-7)-$(date -u -r build/video/walkthrough.mp4 +%Y%m%dT%H%MZ).mp4"
```
- Never commit anything under `build/`.
