#!/usr/bin/env python3
"""narrate.py: the guided video's voiceover, from narration.js.

    python3 narrate.py update                 render every line, write its length and digest into narration.js
    python3 narrate.py check                  fail if any line's text, the voice, the speed or the model
                                              changed since the last update (needs no model or packages)
    python3 narrate.py render <dir>           run check, render every line to <dir>/NN.wav, and fail
                                              if a stored length is off by more than TOLERANCE
    python3 narrate.py mix <dir> <shots.json> <out.wav>
                                              place each line at its shot's voice start and write
                                              one soundtrack as long as the video
    python3 narrate.py srt <shots.json> <out.srt>
                                              write the captions as SubRip cues timed to the voice,
                                              for players and platforms that draw their own

Voice: Kokoro-82M (Apache-licensed weights, "trained exclusively on permissive/non-copyrighted
audio data"), through kokoro-onnx 0.6.1, voice af_heart (Kokoro's only grade-A voice) at speed
0.9, about 167 words a minute (Kokoro's speed is not linear: 1.0 reads at about 179).

On one machine the same line renders byte-identical audio. Across machines it does not: on
2026-11-06 a GitHub runner rendered one line 0.022 s shorter than this repository's stored length,
which an earlier runner and the authoring machine both matched. So two checks keep narration.js
current. Each line's digest is a SHA-256 of the model files' hashes, the voice, the speed and the
text, so any change to what was measured fails exactly, on any machine. Each stored length must
then match the audio within TOLERANCE, which absorbs the differences between CPUs.
The model files are pinned by SHA-256 in narration/models.json, recorded on first download on
2026-11-06 (the release publishes no hashes of its own). narration/ holds every pin, as
video/narration/ does for the walkthrough, so changing one needs an approver's signature.

Setup (run narrate.py with this venv's python, or set NARRATE_PYTHON for build.sh):
    python3 -m venv .venv-kokoro && .venv-kokoro/bin/pip install --require-hashes -r narration/requirements.txt
    mkdir -p ~/.cache/kokoro && cd ~/.cache/kokoro
    R=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
    curl -LO $R/kokoro-v1.0.onnx && curl -LO $R/voices-v1.0.bin

KOKORO_MODEL_DIR overrides ~/.cache/kokoro.
"""
import array
import hashlib
import json
import os
import re
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
NARRATION = HERE / "narration.js"
VOICE = "af_heart"
SPEED = 0.9
MODEL_SHA256 = json.loads((HERE / "narration" / "models.json").read_text(encoding="utf-8"))["sha256"]
# Seconds a stored length may differ from the rendered audio. Lengths vary by a few hundredths
# of a second between CPUs. 0.1 s is a fifth of the 0.5 s tail each shot keeps after its line, so a
# line still ends inside its shot, and mix() fails if one does not. verify.mjs reads this value.
TOLERANCE = 0.1


def fail(msg):
    print(f"narrate.py: {msg}", file=sys.stderr)
    sys.exit(1)


def load():
    src = NARRATION.read_text(encoding="utf-8")
    start = src.index("[", src.index("window.NARRATION"))
    end = src.rindex("]") + 1
    return json.loads(src[start:end])


def line_digest(text):
    """The digest of a measured line: the model files, voice and speed it was rendered with, and its text."""
    basis = json.dumps([MODEL_SHA256["kokoro-v1.0.onnx"], MODEL_SHA256["voices-v1.0.bin"], VOICE, SPEED, text])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:12]


def check():
    lines = load()
    changed = [f"shot {i}" for i, l in enumerate(lines) if l.get("digest") != line_digest(l["text"])]
    if changed:
        fail("narration.js is stale: the text, voice, speed or model changed since its last "
             f"`python3 narrate.py update` for {', '.join(changed)}")
    return f"every digest matches its line's text, the voice, the speed and the model ({len(lines)} shots)"


def engine():
    mdir = Path(os.environ.get("KOKORO_MODEL_DIR", Path.home() / ".cache" / "kokoro"))
    for name, digest in MODEL_SHA256.items():
        path = mdir / name
        if not path.exists():
            fail(f"model file missing: {path}. See the Setup notes at the top of narrate.py.")
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        if h.hexdigest() != digest:
            fail(f"model file {path} has SHA-256 {h.hexdigest()}, expected {digest}")
    try:
        from kokoro_onnx import Kokoro
    except ImportError:
        fail("kokoro_onnx is not installed for this python. See the Setup notes at the top of narrate.py.")
    return Kokoro(str(mdir / "kokoro-v1.0.onnx"), str(mdir / "voices-v1.0.bin"))


def synthesize(text, out, kokoro):
    audio, rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    pcm = array.array("h", (max(-32768, min(32767, int(round(x * 32767)))) for x in audio))
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def seconds(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


def render_all(outdir):
    kokoro = engine()
    outdir.mkdir(parents=True, exist_ok=True)
    for f in outdir.glob("*.wav"):
        f.unlink()
    lengths = []
    for i, line in enumerate(load()):
        if not line["text"]:
            lengths.append(0.0)
            continue
        out = outdir / f"{i:02d}.wav"
        synthesize(line["text"], out, kokoro)
        lengths.append(round(seconds(out), 3))
    return lengths


def update():
    with tempfile.TemporaryDirectory() as tmp:
        lengths = render_all(Path(tmp))
    entries = [
        {"cam": l["cam"], "text": l["text"], "seconds": got, "digest": line_digest(l["text"])}
        for l, got in zip(load(), lengths)
    ]
    src = NARRATION.read_text(encoding="utf-8")
    start = src.index("[", src.index("window.NARRATION"))
    end = src.rindex("]") + 1
    body = "[\n" + ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in entries) + "\n]"
    NARRATION.write_text(src[:start] + body + src[end:], encoding="utf-8")
    words = sum(len(l["text"].split()) for l in load())
    print(f"narration.js: {len(lengths)} shots, {words} words, {sum(lengths):.1f} s of speech")


def render(outdir):
    check()  # before a minute of rendering
    lengths = render_all(outdir)
    stale = [
        f"shot {i}: stored {l['seconds']} s, audio {got} s"
        for i, (l, got) in enumerate(zip(load(), lengths))
        if abs(l["seconds"] - got) > TOLERANCE
    ]
    (outdir / "lengths.json").write_text(json.dumps(lengths))
    if stale:
        fail("narration.js is stale; run `python3 narrate.py update`. " + "; ".join(stale))
    worst = max(abs(l["seconds"] - got) for l, got in zip(load(), lengths))
    print(f"{sum(1 for x in lengths if x)} lines rendered to {outdir}; every stored length matches "
          f"within {TOLERANCE} s (largest difference {worst:.3f} s)")


def mix(outdir, shots_json, out_wav):
    shots = json.loads(Path(shots_json).read_text())
    total = shots["duration"]
    clips = sorted(outdir.glob("[0-9][0-9].wav"))
    if not clips:
        fail(f"no clips in {outdir}; run `python3 narrate.py render {outdir}` first")
    with wave.open(str(clips[0]), "rb") as w:
        params = w.getparams()
    rate, width = params.framerate, params.sampwidth
    buf = bytearray(int(round(total * rate)) * width)
    for clip in clips:
        i = int(clip.stem)
        with wave.open(str(clip), "rb") as w:
            if (w.getframerate(), w.getsampwidth(), w.getnchannels()) != (rate, width, 1):
                fail(f"{clip} does not match the first clip's format")
            data = w.readframes(w.getnframes())
        start = int(round(shots["shots"][i]["voiceStart"] * rate)) * width
        end_limit = int(round(shots["shots"][i]["g1"] * rate)) * width
        if start + len(data) > min(end_limit, len(buf)):
            fail(f"shot {i}: its line runs past the end of the shot")
        buf[start:start + len(data)] = data
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(width)
        w.setframerate(rate)
        w.writeframes(bytes(buf))
    print(f"{out_wav}: {total:.3f} s, {len(clips)} lines")


def cues(text):
    """A line as caption cues: its sentences, with a long one cut at the comma or colon nearest its middle."""
    out = []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        cuts = [m.end() for m in re.finditer(r"[,:;]\s", sentence)]
        if len(sentence) <= 84 or not cuts:
            out.append(sentence)
            continue
        cut = min(cuts, key=lambda c: abs(c - len(sentence) / 2))
        out += [sentence[:cut].strip(), sentence[cut:].strip()]
    return out


def wrap(cue, width=42):
    """At most two lines, broken at the space nearest the middle."""
    if len(cue) <= width:
        return cue
    i = min((k for k, ch in enumerate(cue) if ch == " "), key=lambda k: abs(k - len(cue) / 2))
    return cue[:i] + "\n" + cue[i + 1:]


def stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def srt(shots_json, out_srt):
    shots = json.loads(Path(shots_json).read_text())["shots"]
    blocks = []
    for s in shots:
        if s.get("caption"):
            # A silent end card's caption: one cue for its whole shot, cut at sentences (SPEC-001-R229).
            parts = cues(s["caption"])
            span = (s["g1"] - s["g0"]) / len(parts)
            for k, p in enumerate(parts):
                blocks.append((s["g0"] + k * span, s["g0"] + (k + 1) * span, wrap(p)))
            continue
        if not s["text"]:
            continue
        parts = cues(s["text"])
        total = sum(len(p) for p in parts)
        start, span = s["voiceStart"], s["seconds"]
        # Each cue's share of the voice follows its share of the characters. The first shows from
        # just before the voice; the last stays a little after it, never past its shot.
        t0, done = max(s["g0"], start - 0.2), 0
        for k, p in enumerate(parts):
            done += len(p)
            t1 = start + span * done / total if k < len(parts) - 1 else min(s["g1"], start + span + 0.3)
            blocks.append((t0, t1, wrap(p)))
            t0 = t1
    body = "".join(f"{i}\n{stamp(a)} --> {stamp(b)}\n{t}\n\n" for i, (a, b, t) in enumerate(blocks, 1))
    Path(out_srt).write_text(body, encoding="utf-8")
    print(f"{out_srt}: {len(blocks)} cues from {sum(1 for s in shots if s['text'])} lines and {sum(1 for s in shots if s.get('caption'))} end card")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["update"]:
        update()
    elif args[:1] == ["check"] and len(args) == 1:
        print(f"narration.js: {check()}")
    elif args[:1] == ["render"] and len(args) == 2:
        render(Path(args[1]))
    elif args[:1] == ["mix"] and len(args) == 4:
        mix(Path(args[1]), args[2], args[3])
    elif args[:1] == ["srt"] and len(args) == 3:
        srt(args[1], args[2])
    else:
        fail(__doc__.split("\n\n")[1])
