#!/usr/bin/env bash
# Rebuild every deliverable in out/ from source, then verify.
# Needs: node with playwright (Chromium), ffmpeg. Intermediate frames go to frames/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p frames/f30 frames/f20 out

node render.mjs slide.html frames/f30 30
node render.mjs slide.html frames/f20 20

# MP4: one 18 s loop at 30 fps, then 9 more copies by stream copy = 180 s.
ffmpeg -y -v error -framerate 30 -i frames/f30/f_%04d.png \
  -vf scale=1920:-2:flags=lanczos -c:v libx264 -preset veryfast -crf 16 \
  -pix_fmt yuv420p -movflags +faststart frames/loop.mp4
ffmpeg -y -v error -stream_loop 9 -i frames/loop.mp4 -c copy -movflags +faststart out/factory-full-3min.mp4

# Guided MP4: one narrated pass with a speed track, a camera and captions (guided.html), for
# video, not the deck. 1920x1080: 900 of scene and 180 of captions. narrate.py renders the voice
# (Kokoro; see its Setup notes, and set NARRATE_PYTHON to the python that has kokoro-onnx) and
# fails if narration.js's stored line lengths have gone stale.
NARRATE_PYTHON="${NARRATE_PYTHON:-python3}"
mkdir -p frames/guided frames/narration
"$NARRATE_PYTHON" narrate.py render frames/narration
# The end card's counts and tags, from the same code as the README's progress picture (SPEC-001-R229).
(cd .. && node scripts/progress.ts --video-data factory-video/frames/progress.js)
node render.mjs guided.html frames/guided 30
"$NARRATE_PYTHON" narrate.py mix frames/narration frames/guided/shots.json frames/narration/narration.wav
ffmpeg -y -v error -framerate 30 -i frames/guided/f_%04d.png -i frames/narration/narration.wav \
  -map 0:v -map 1:a -vf scale=1920:-2:flags=lanczos -c:v libx264 -preset veryfast -crf 16 \
  -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart out/factory-guided.mp4
# The same video without burned-in captions, for platforms that draw their own: the scene only
# (1920x900), with the captions as a soft track and as a SubRip file to upload.
"$NARRATE_PYTHON" narrate.py srt frames/guided/shots.json out/factory-guided.srt
ffmpeg -y -v error -framerate 30 -i frames/guided/f_%04d.png -i frames/narration/narration.wav -i out/factory-guided.srt \
  -map 0:v -map 1:a -map 2:s -vf "crop=2400:1125:0:0,scale=1920:-2:flags=lanczos" -c:v libx264 -preset veryfast \
  -crf 16 -pix_fmt yuv420p -c:a aac -b:a 128k -c:s mov_text -metadata:s:s:0 language=eng \
  -movflags +faststart out/factory-guided-clean.mp4

# GIF: two-pass palette, no dither, rectangle diffs, infinite loop.
ffmpeg -y -v error -framerate 20 -i frames/f20/f_%04d.png \
  -vf "scale=1920:-2:flags=lanczos,palettegen=max_colors=160:stats_mode=full" frames/palette.png
ffmpeg -y -v error -framerate 20 -i frames/f20/f_%04d.png -i frames/palette.png \
  -lavfi "scale=1920:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 out/factory-full-1920.gif

# Contact sheet: one loop at 0, 3, 6, 9, 12 and 15 s.
node render.mjs slide.html out --sheet --log frames/sheet-log.json

if [ -f poster.html ]; then
  node render.mjs poster.html out --poster --log frames/poster-log.json
fi

ls -l out
node verify.mjs
