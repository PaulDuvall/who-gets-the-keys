# k9s: Kokoro cannot run as a separate program without a new decision

Date 2026-11-08. Status: blocked on an owner decision; nothing is staged. Backlog `who-gets-the-keys-k9s`.

## What the owner decided, and why it cannot be built as written

Decision 0008, "Owner decisions, 2026-11-08": run Kokoro "only as a separate program from a venv under `build/`, as SPEC-002-R8 does for Piper, so no repository file imports it". The backlog item's first criterion is that `git grep kokoro_onnx` finds no import in a repository file.

Piper ships a program, `piper`, so the walkthrough kit runs it without importing it. kokoro-onnx does not:

| Fact | Source, read 2026-11-08 |
|---|---|
| kokoro-onnx 0.6.1's wheel holds `kokoro_onnx/` and its dist-info only: no `entry_points.txt`, so no console script, and no `__main__.py`, so no `python -m kokoro_onnx` | The wheel `kokoro_onnx-0.6.1-py3-none-any.whl` from PyPI, listed with Python's `zipfile` |
| So some Python file must `from kokoro_onnx import Kokoro` and call `create()` | Inference from the above |

## Licences, rechecked

| Package | Version pinned in `factory-video/narration/requirements.txt` | Licence, from PyPI's JSON for that version or the wheel |
|---|---|---|
| kokoro-onnx | 0.6.1 | MIT: the wheel's `licenses/LICENSE` |
| phonemizer | 3.6.0 | GPL-3.0-or-later: its PyPI classifier "GNU General Public License v3 or later (GPLv3+)" |
| espeakng-loader | 0.2.4 | None declared: no licence in its PyPI metadata and no licence file in its `win_arm64` wheel. It loads espeak-ng's library and data; espeak-ng's own licence (GPL-3.0-or-later) was not re-read here |
| onnxruntime | 1.31.1 | MIT: its PyPI classifier |

Decision 0008 read phonemizer and espeak-ng as GPL-3.0 at medium confidence. The phonemizer part is confirmed; the espeak-ng part rests on espeakng-loader bundling it, which its metadata does not state.

## Options

| Option | What changes | Meets "no repository file imports it"? | Cost |
|---|---|---|---|
| A. A driver file in the repository, licensed GPL-3.0-or-later on its own | `factory-video/narration/kokoro-say.py` (protected path) reads lines on stdin and writes WAV files; it is the only file that imports `kokoro_onnx`, and its header says it is GPL-3.0-or-later. `narrate.py` drops the import and runs that file with the venv's Python as a separate process | No, but the import sits in one separately licensed program, which is the point of R8's rule. The criterion becomes "no file but the driver imports it" | One signed batch: the driver, `narrate.py`, the workflow's venv path under `build/`, and a test that only the driver imports `kokoro_onnx` |
| B. A third-party command-line package that wraps kokoro-onnx | A new dependency with its own pins, an `allowed-deps.txt` entry, and SCA exposure | Yes | A dependency review the agent may not do alone; and the wrapper may not reproduce today's audio, so every line's length would need re-measuring |
| C. A driver generated at setup time into the venv under `build/` | `narrate.py` writes the driver's text into `build/` before running it | Formally, for a `git grep` on imports; the text still lives in `narrate.py` | Hides the import rather than separating it. Not recommended |
| D. Keep the in-process import | Nothing | No | Reverses the decision of 2026-11-08 |
| E. Piper, the walkthrough's voice | Re-render every line in another voice; the narration digests and lengths change | Yes | The owner rejected this in decision 0008 (option c) |

Recommendation: A. It keeps the voice, the digests and, in all likelihood, the lengths unchanged, because the same library calls run with the same arguments; it puts the GPL-linked code in one GPL-licensed program; and it needs no new dependency. Confidence: medium. The lengths must still be confirmed by the factory-video workflow's render, because the agent cannot install kokoro-onnx or download the 300 MB of model files here.

## What the owner decides

1. Option A, B, C, D or E. Recommended: A, with the backlog criterion amended to "no file but `factory-video/narration/kokoro-say.py` imports `kokoro_onnx`".
2. If A: whether the driver's GPL-3.0-or-later header is enough, or the repository also needs a `LICENSES/` note naming the one GPL file. Recommended: the header plus one line in `factory-video/README.md`.
