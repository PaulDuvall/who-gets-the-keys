// narration.js: the guided video's voiceover and captions, one entry per shot in
// guided.html, in shot order. An empty text is a silent shot.
//
// seconds is the length of the rendered line: Kokoro-82M, voice af_heart, speed 0.9. One machine
// renders byte-identical audio every time; other CPUs can differ by a few hundredths of a second,
// which narrate.py's TOLERANCE allows. digest is a SHA-256 of the model files' hashes, the voice, the
// speed and the text: what seconds was measured from. Write both with `python3 narrate.py update`
// after changing any text or the voice. build.sh fails if a digest no longer matches its line, or a
// length is off by more than TOLERANCE.
//
// The text below the assignment line must stay valid JSON: narrate.py reads it too.
window.NARRATION =
[
  {"cam": "overview", "text": "This is a software factory. Follow one change from intent to production.", "seconds": 4.629, "digest": "6b4043d2ca6f"},
  {"cam": "intake", "text": "A customer states intent. An engineer captures it as a spec, and signs it with a security key and a touch.", "seconds": 7.467, "digest": "344c075cb7e9"},
  {"cam": "agent", "text": "The agent works in a cloud session, one run per task. A hook flags a test that asserts nothing, and the agent fixes it.", "seconds": 7.915, "digest": "d6c208236a9e"},
  {"cam": "checks", "text": "Then the pipeline runs the checks of record, without the coding agent: scans, scope, and tests proven to catch broken code. Scoped AI checks can fail a change, never pass one.", "seconds": 12.501, "digest": "3a09544cfed8"},
  {"cam": "verify", "text": "The patch is promoted to main, out of the agent's reach, and only the pipeline signs the evidence. Where the tier requires it, an engineer who didn't write the spec checks staging, then signs the release.", "seconds": 12.949, "digest": "6237e2f7d294"},
  {"cam": "overview", "text": "Now an issue comes in.", "seconds": 1.493, "digest": "1f5be04d6662"},
  {"cam": "issue", "text": "Free text is untrusted. Whether it comes from a customer, an agent, a doc or a URL, it never starts a run.", "seconds": 7.957, "digest": "e3a89d5cb7cc"},
  {"cam": "tray", "text": "This one becomes work through a spec an engineer signs. Known errors start from alarms the policy already signed.", "seconds": 7.232, "digest": "3a46f760c9df"},
  {"cam": "route", "text": "The signed spec queues as a new task.", "seconds": 2.155, "digest": "81597b2a859c"},
  {"cam": "overview", "text": "It runs the same checks as every other change.", "seconds": 2.731, "digest": "56b1f99067c3"},
  {"cam": "verify", "text": "Its receipt records that it began as an untrusted issue, and traces it through the spec to the deploy.", "seconds": 6.187, "digest": "bfc6d69c0112"},
  {"cam": "overview", "text": "", "seconds": 0.0, "digest": "ef9368e01a0d"},
  {"cam": "telemetryBand", "text": "Production telemetry is untrusted too. A quarantined reader fills a fixed schema, and its free text never reaches the agent.", "seconds": 8.64, "digest": "4ac425f48dcf"},
  {"cam": "telemetryCard", "text": "Only an alarm named in the signed policy can start an approved task.", "seconds": 4.288, "digest": "00f7c1cea418"},
  {"cam": "monitor", "text": "A separate security account watches the pipeline and production for drift. The pipeline can't touch it.", "seconds": 6.272, "digest": "0f9dba0faa36"},
  {"cam": "overview", "text": "One engineer signs each spec, two sign the factory, and the pipeline decides every change.", "seconds": 5.995, "digest": "f9cd07d7e321"},
  {"cam": "overview", "text": "No evidence, no deploy.", "seconds": 1.877, "digest": "0540b713a2d9"},
  {"cam": "overview", "text": "", "seconds": 0.0, "digest": "ef9368e01a0d"}
]
;
