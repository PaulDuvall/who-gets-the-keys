import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { git, lines, originRef, runScript, scratchDir, tempRepo, TIMEOUT, writeStubs, type ScriptRun, type TempRepo } from "./helpers/temp-repo.ts";

// scripts/bootstrap/land.sh checks the machine first (SPEC-001-R219), reports a run as failed only when GitHub records it
// so (SPEC-001-R220), has the owner run an owner apply before main moves (SPEC-001-R221), lands a lockfile-only fix (SPEC-001-R222), cues
// every touch (SPEC-001-R223) and ends with a short summary (SPEC-001-R225). Each test runs it in a temporary clone
// with a local bare origin and stubs first on PATH. Signing uses a software key made here; nothing reaches GitHub.
const script = join(process.cwd(), "scripts/bootstrap/land.sh");

// gh: answers auth status; run list prints 101 for a candidate branch and 202 for main; run watch exits 1 for each run
// in STUB_FAIL; run view --json status,conclusion prints STUB_VIEW_<run>, or fails when it is unset; run view --json
// url prints STUB_URL; run view --json status,jobs prints the first line of the file states, dropping it until the last.
const gh = [
  "#!/usr/bin/env bash",
  'printf "gh %s\\n" "$*" >> "$STUB_DIR/calls"',
  'case "$1 ${2:-}" in',
  '  "auth status") exit 0 ;;',
  '  "run list") branch=""; while [ $# -gt 0 ]; do [ "$1" = --branch ] && branch="$2"; shift; done',
  '    if [ "$branch" = main ]; then echo 202; else echo 101; fi; exit 0 ;;',
  '  "run watch") echo "watch $3" >> "$STUB_DIR/events"; case " ${STUB_FAIL:-} " in *" $3 "*) exit 1 ;; esac; exit 0 ;;',
  '  "run view")',
  '    case "$*" in',
  '      *"--json status,conclusion "*) v="STUB_VIEW_$3"; [ -n "${!v:-}" ] || exit 1; echo "${!v}" ;;',
  '      *"--json url "*) [ -n "${STUB_URL:-}" ] || exit 1; echo "$STUB_URL" ;;',
  '      *"--json status,jobs "*) f="$STUB_DIR/states"; [ -s "$f" ] || exit 1; head -n 1 "$f"',
  '        if [ "$(wc -l < "$f" | tr -d " ")" -gt 1 ]; then tail -n +2 "$f" > "$f.next" && mv "$f.next" "$f"; fi ;;',
  "      *) exit 1 ;;",
  "    esac; exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

// node: --version prints v24.22.2; -e runs the real Node.js, for land.sh's lockfile check; anything else, the
// preflight's steps, passes. npm: update rewrites package-lock.json as STUB_LOCK says (own, other or none); anything
// else, the preflight's npm ci, passes. npx passes.
const node = [
  "#!/usr/bin/env bash",
  '[ "$*" = --version ] && { echo v24.22.2; exit 0; }',
  '[ "${1:-}" = -e ] && exec "$STUB_REAL_NODE" "$@"',
  "exit 0",
  "",
].join("\n");
const npm = [
  "#!/usr/bin/env bash",
  'printf "npm %s\\n" "$*" >> "$STUB_DIR/calls"',
  '[ "${1:-}" = update ] || exit 0',
  'case "${STUB_LOCK:-own}" in',
  '  own) sed -i.bak "s/\\"version\\": \\"1.3.1\\"/\\"version\\": \\"1.3.2\\"/" package-lock.json ;;',
  '  other) sed -i.bak "s/\\"version\\": \\"2.0.0\\"/\\"version\\": \\"2.0.1\\"/" package-lock.json ;;',
  '  extra) echo new > stray.txt; sed -i.bak "s/\\"version\\": \\"1.3.1\\"/\\"version\\": \\"1.3.2\\"/" package-lock.json ;;',
  "esac",
  "rm -f package-lock.json.bak",
  "",
].join("\n");
const pass = "#!/usr/bin/env bash\nexit 0\n";
const ykman = '#!/usr/bin/env bash\n[ "$1" = list ] && echo "YubiKey 5C Nano (5.7.1) [OTP+FIDO+CCID] Serial: 123456"\nexit 0\n';
// uname says Darwin, and osascript and pbcopy record what they get, for the macOS cue and clipboard.
const darwin = { uname: "#!/usr/bin/env bash\necho Darwin\n", osascript: '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$STUB_DIR/notified"\n', pbcopy: '#!/usr/bin/env bash\ncat > "$STUB_DIR/clipboard"\n' };

const LOCK = JSON.stringify({
  name: "t", version: "1.0.0", lockfileVersion: 3, requires: true,
  packages: { "": { name: "t", version: "1.0.0" }, "node_modules/node-forge": { version: "1.3.1" }, "node_modules/other": { version: "2.0.0" } },
}, null, 2) + "\n";
const BASE: Record<string, string> = {
  "package.json": '{\n  "name": "t",\n  "engines": {\n    "node": ">=24.11.0 <25"\n  }\n}\n',
  "package-lock.json": LOCK,
  "specs/SPEC-001-delivery-pipeline.md": "| ID | Requirement |\n|---|---|\n| SPEC-001-R41 | main only moves to a commit on which checks passed. |\n",
  "scripts/bootstrap/aws-setup.sh": "#!/usr/bin/env bash\n",
  "docs/b.md": "one\n",
};
const batch = (apply: string): Record<string, string> => ({
  "proposals/batch/LAND.txt": `message: spec: land the test batch\nspec: SPEC-001-R41\n${apply}move: b.md docs/b.md\n`,
  "proposals/batch/b.md": "one, staged\n",
});

interface Run extends ScriptRun { calls: string[]; events: string[] }

describe("SPEC-001-R219 to R225 land.sh checks the machine, tells the truth about runs, and cues each touch", () => {
  const scratch = scratchDir("land-owner-");
  let key = "";
  beforeAll(() => {
    key = join(scratch(), "approver");
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "land test", "-f", key]);
  });

  function makeRepo(files: Record<string, string> = {}, stubs: Record<string, string> = {}): TempRepo {
    return tempRepo(scratch(), {
      stubs: { gh, node, npm, npx: pass, ykman, ...stubs },
      env: { LAND_POLL_SECONDS: "0", STUB_REAL_NODE: process.execPath, HOMEBREW_PREFIX: join(scratch(), "no-brew") },
      config: { "gpg.format": "ssh", "user.signingkey": key }, files: { ...BASE, ...files },
    });
  }

  function land(repo: TempRepo, args: string[], input: string, env: NodeJS.ProcessEnv = {}): Run {
    for (const file of ["calls", "events", "notified", "clipboard"]) rmSync(join(repo.stub, file), { force: true });
    const r = runScript(repo, script, args, { input, env });
    return { ...r, calls: lines(join(repo.stub, "calls")), events: lines(join(repo.stub, "events")) };
  }

  // A commit on a candidate branch, one ahead of main, with the trailers given, pushed to origin.
  function candidate(repo: TempRepo, trailers: string[] = []): string {
    writeFileSync(join(repo.work, "docs/b.md"), "one, landed\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "docs: land", ...trailers.flatMap((t) => ["--trailer", t]));
    const sha = git(repo, "rev-parse", "HEAD");
    git(repo, "push", "-q", "origin", `${sha}:refs/heads/candidate/x`);
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    return sha;
  }

  const summary = (out: string): string[] => {
    const start = out.indexOf("--- land.sh summary: paste this to the agent ---");
    return start < 0 ? [] : out.slice(start).trimEnd().split("\n").slice(0, out.slice(start).trimEnd().split("\n").indexOf("---") + 1);
  };

  it("SPEC-001-R219 runs the doctor first, refuses on a gap before anything changes, and uses Homebrew's node@24 when PATH's node is out of range", { timeout: TIMEOUT }, () => {
    const two = makeRepo(batch(""), { ykman: '#!/usr/bin/env bash\n[ "$1" = list ] && printf "a\\nb\\n"\nexit 0\n' });
    const head = git(two, "rev-parse", "HEAD");
    const refused = land(two, ["proposals/batch"], "n\nn\n");
    expect(refused.status).toBe(1);
    expect(refused.out).toContain("fix   2 YubiKeys are plugged in, so a touch may go to the wrong one.");
    expect(refused.out).toContain("The doctor found something to fix on this machine. Fix each item it lists, then run this again. Nothing changed.");
    expect(refused.calls.filter((c) => !c.startsWith("gh "))).toEqual([]);
    expect(git(two, "rev-parse", "HEAD")).toBe(head);

    const old = makeRepo(batch(""), { node: '#!/usr/bin/env bash\n[ "$*" = --version ] && echo v24.1.0\nexit 0\n' });
    const keg = join(old.dir, "brew/opt/node@24/bin");
    mkdirSync(keg, { recursive: true });
    writeStubs(keg, { node });
    const r = land(old, ["proposals/batch"], "n\nn\n", { HOMEBREW_PREFIX: join(old.dir, "brew") });
    expect(r.out).toContain(`Using Node.js from ${keg}.`);
    expect(r.out).toContain("passed: Node.js 24.22.2 is in >=24.11.0 <25");
    expect(r.out).toContain("You chose not to sign.");
  });

  it("SPEC-001-R220 treats a watch that lost its connection as passed when GitHub records success, and never as failed when the end cannot be read", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const sha = candidate(repo);
    const passed = land(repo, ["--to-main", sha, "candidate/x"], "", { STUB_FAIL: "101", STUB_VIEW_101: "completed success" });
    expect(passed.out).toContain("gh run watch stopped with an error, but GitHub records run 101 as completed with conclusion success.");
    expect(passed.status).toBe(0);
    expect(originRef(repo, "main")).toBe(sha);

    const other = makeRepo();
    const sha2 = candidate(other);
    const lost = land(other, ["--to-main", sha2, "candidate/x"], "", { STUB_FAIL: "101", LAND_WATCH_TRIES: "2" });
    expect(lost.events).toEqual(["watch 101", "watch 101"]);
    expect(lost.out).toContain("Lost contact with run 101, which GitHub records as \"unreadable\". Watching it again.");
    expect(lost.out).toContain("This is not a failed run. To watch it again:\ngh run watch 101 --exit-status");
    expect(lost.out).toContain("Lost contact with the pipeline run 101 on candidate/x, so main has not moved. It may still pass.");
    expect(lost.out).not.toContain("failed, so main has not moved");
    expect(originRef(other, "main")).not.toBe(sha2);

    // Without LAND_WATCH_TRIES, three watches in all.
    const three = land(other, ["--to-main", sha2, "candidate/x"], "", { STUB_FAIL: "101" });
    expect(three.events).toEqual(["watch 101", "watch 101", "watch 101"]);
    const failed = land(other, ["--to-main", sha2, "candidate/x"], "", { STUB_FAIL: "101", STUB_VIEW_101: "completed failure" });
    expect(failed.out).toContain("The pipeline run 101 on candidate/x failed, so main has not moved.\nGitHub records it as concluded failure.");
  });

  it("SPEC-001-R221 has the owner run the script before main moves, and pushes nothing on a no, when a commit carries an Owner-Apply trailer", { timeout: TIMEOUT }, () => {
    const ask = "Run scripts/bootstrap/aws-setup.sh now, in another terminal, before main moves:";
    const repo = makeRepo();
    const sha = candidate(repo, ["Owner-Apply: scripts/bootstrap/aws-setup.sh"]);
    const before = originRef(repo, "main");
    const no = land(repo, ["--to-main", sha, "candidate/x"], "");
    expect(no.status).toBe(1);
    expect(no.out).toContain(ask);
    expect(no.out).toContain(`Nothing was pushed to main. When scripts/bootstrap/aws-setup.sh has finished, run:\nscripts/bootstrap/land.sh --to-main ${sha} candidate/x`);
    expect(originRef(repo, "main")).toBe(before);
    const yes = land(repo, ["--to-main", sha, "candidate/x"], "y\n");
    expect(yes.status).toBe(0);
    expect(yes.out.indexOf(ask)).toBeLessThan(yes.out.indexOf("main is at "));
    expect(yes.out).toContain("Its deploy to the sandbox needs no approval");
    expect(originRef(repo, "main")).toBe(sha);

    // A fix on top of the signed commit does not hide its trailer: every commit main gains is read.
    const fixed = makeRepo();
    candidate(fixed, ["Owner-Apply: scripts/bootstrap/aws-setup.sh"]);
    git(fixed, "fetch", "-q", "origin", "candidate/x");
    git(fixed, "checkout", "-q", "FETCH_HEAD");
    writeFileSync(join(fixed.work, "docs/b.md"), "one, fixed\n");
    git(fixed, "commit", "-q", "-am", "docs: fix on top");
    const tip = git(fixed, "rev-parse", "HEAD");
    git(fixed, "push", "-q", "origin", `${tip}:refs/heads/candidate/x`);
    git(fixed, "checkout", "-q", "main");
    const f = land(fixed, ["--to-main", tip, "candidate/x"], "");
    expect(f.out).toContain(ask);
    expect(f.status).toBe(1);

    const plain = makeRepo();
    const sha2 = candidate(plain);
    const p = land(plain, ["--to-main", sha2, "candidate/x"], "");
    expect(p.status).toBe(0);
    expect(p.out).not.toContain("before main moves");
    expect(p.out).not.toContain("still has a required reviewer");
  });

  it("SPEC-001-R231 says how to remove the reviewer when sandbox still has one and the deploy waits", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const sha = candidate(repo);
    writeFileSync(join(repo.stub, "states"), "in_progress waiting\ncompleted completed\n");
    const r = land(repo, ["--to-main", sha, "candidate/x"], "", { STUB_URL: "https://github.example/run/202" });
    expect(r.status).toBe(0);
    expect(r.out).toContain("The sandbox environment still has a required reviewer, so main's deploy waits for it.\nApprove the sandbox deployment in main's run 202: https://github.example/run/202\nThen run scripts/bootstrap/github.sh, which removes the reviewer (SPEC-001-R231).");
    expect(r.out).toContain("next: run scripts/bootstrap/github.sh, which removes the sandbox reviewer");
  });

  it("SPEC-001-R221 reads owner-apply from LAND.txt, shows it in the review, writes it as a trailer, and refuses a bad value", { timeout: TIMEOUT }, () => {
    const repo = makeRepo(batch("owner-apply: scripts/bootstrap/aws-setup.sh\n"));
    const r = land(repo, ["proposals/batch"], "n\ny\ny\n");
    expect(r.out).toContain("Owner apply: run scripts/bootstrap/aws-setup.sh before main moves. land.sh will ask for it then.");
    const signed = originRef(repo, "main");
    expect(signed).not.toBe("");
    expect(git(repo, "log", "-1", "--format=%(trailers:key=Owner-Apply,valueonly)", signed)).toBe("scripts/bootstrap/aws-setup.sh");
    expect(r.out).toContain("Run scripts/bootstrap/aws-setup.sh now, in another terminal, before main moves:");
    expect(r.out).not.toContain("DO NOT APPROVE");
    for (const bad of ["owner-apply: scripts/bootstrap/missing.sh", "owner-apply: rm.sh", "owner-apply: scripts/bootstrap/../x.sh", "owner-apply: scripts/bootstrap/aws-setup.sh\nowner-apply: scripts/bootstrap/aws-setup.sh"]) {
      const b = makeRepo(batch(`${bad}\n`));
      const head = git(b, "rev-parse", "HEAD");
      const refused = land(b, ["proposals/batch"], "n\nn\n");
      expect(refused.status).toBe(1);
      expect(refused.out).toMatch(/LAND\.txt (line \d+: (.* is not a script directly under scripts\/bootstrap\/\.|there may be at most one owner-apply line\.)|names owner-apply scripts\/bootstrap\/missing\.sh, which is neither on main nor moved by the batch\.)/);
      expect(refused.out).not.toContain("Show the full diff");
      expect(git(b, "rev-parse", "HEAD")).toBe(head);
    }
  });

  it("SPEC-001-R222 --lockfile updates only that package, shows it, signs, and lands it through a candidate branch", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const before = originRef(repo, "main");
    const r = land(repo, ["--lockfile", "node-forge"], "n\ny\n");
    expect(r.calls).toContain("npm update node-forge --package-lock-only --ignore-scripts --no-audit --no-fund");
    expect(r.out).toContain("Changed entries:\n  node_modules/node-forge: 1.3.1 -> 1.3.2");
    expect(r.out.indexOf("Preflight passed.")).toBeLessThan(r.out.indexOf("Sign and land? [y/N]"));
    const sha = originRef(repo, "main");
    expect(sha).not.toBe(before);
    expect(git(repo, "log", "-1", "--format=%s", sha)).toBe("deps: update node-forge in package-lock.json");
    expect(git(repo, "diff", "--name-only", before, sha)).toBe("package-lock.json");
    expect(r.out).toContain(`Landed ${sha.slice(0, 7)} on main.`);
    expect(originRef(repo, "candidate/lockfile-node-forge")).toBe("");
  });

  it.each([
    ["another entry", "other", "npm changed more than node-forge's entries in package-lock.json, so nothing was landed:\n  packages[\"node_modules/other\"]"],
    ["nothing", "none", "npm changed nothing: node-forge is already at the newest version that package.json allows."],
    ["another file", "extra", "npm changed more than package-lock.json, so nothing was landed:"],
  ])("SPEC-001-R222 --lockfile refuses when npm changes %s, and puts the lockfile back", { timeout: TIMEOUT }, (_what, mode, message) => {
    const repo = makeRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["--lockfile", "node-forge"], "n\ny\n", { STUB_LOCK: mode });
    expect(r.status).toBe(1);
    expect(r.out).toContain(message);
    expect(r.out).not.toContain("Sign and land?");
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(join(repo.work, "package-lock.json"), "utf8")).toBe(LOCK);
    expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(land(repo, ["--lockfile", "Not A Name"], "").out).toContain("Not A Name is not an npm package name.");
    expect(land(repo, ["--lockfile", "node-forge\nevil"], "").out).toContain("is not an npm package name.");
  });

  it("SPEC-001-R223 cues the touch on a line of its own, notifies on macOS, and translates OpenSSH's invalid format", { timeout: TIMEOUT }, () => {
    const keygen = '#!/usr/bin/env bash\nif [ "${1:-}" = -Y ]; then echo "Couldn\'t sign message: invalid format?" >&2; exit 255; fi\nexit 0\n';
    const ssh = '#!/usr/bin/env bash\n[ "$*" = "-Q key" ] && echo sk-ssh-ed25519@openssh.com\nexit 0\n';
    const repo = makeRepo(batch(""), { "ssh-keygen": keygen, ssh, ...darwin });
    const head = git(repo, "rev-parse", "HEAD");
    // Without a terminal, no notification, so a test run on the owner's Mac shows none.
    land(repo, ["proposals/batch"], "n\ny\n");
    expect(lines(join(repo.stub, "notified"))).toEqual([]);
    const r = land(repo, ["proposals/batch"], "n\ny\n", { OWNER_SCRIPT_DESKTOP: "always" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("\n\n==> TOUCH YOUR SECURITY KEY NOW. It blinks to sign: spec: land the test batch\n\n");
    expect(lines(join(repo.stub, "notified"))).toEqual(['-e display notification "Touch your security key now to sign." with title "land.sh"']);
    expect(r.stderr).toContain("No touch in time, or the wrong key was touched: nothing was committed.");
    expect(r.out).not.toContain("invalid format");
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("SPEC-001-R225 ends with a summary of at most 10 lines, with no account ID, copied to the clipboard on macOS", { timeout: TIMEOUT }, () => {
    const repo = makeRepo({}, darwin);
    const sha = candidate(repo);
    const r = land(repo, ["--to-main", sha, "candidate/x"], "", { OWNER_SCRIPT_DESKTOP: "always" });
    const block = summary(r.stdout);
    expect(block.length).toBeGreaterThan(3);
    expect(block.length).toBeLessThanOrEqual(10);
    expect(block).toEqual([
      "--- land.sh summary: paste this to the agent ---", "mode: --to-main candidate/x", `result: landed ${sha.slice(0, 7)} on main`,
      `commit: ${sha.slice(0, 10)}`, "candidate run 101 on candidate/x: success", `main run 202 for ${sha.slice(0, 7)}: success`, "---",
    ]);
    expect(readFileSync(join(repo.stub, "clipboard"), "utf8")).toBe(`${block.join("\n")}\n`);

    // Without a terminal, the clipboard is left alone, so a test run on the owner's Mac does not overwrite it.
    const quiet = land(makeRepo({}, darwin), ["--to-main", sha, "candidate/x"], "");
    expect(quiet.stdout).not.toContain("(copied to the clipboard)");

    // A refusal ends with the summary too, its first line as the result, and an account ID, twelve digits standing
    // alone, never passes. Twelve digits inside a longer word, such as a SHA, are left alone.
    const sha2 = "1234567890120000000000000000000000000000";
    const bad = land(makeRepo(), ["--to-main", sha2, "candidate/123456789012"], "");
    const failed = summary(bad.stdout);
    expect(failed[1]).toBe("mode: --to-main candidate/<account>");
    expect(failed[2]).toBe(`result: stopped: candidate/<account> on origin is at nothing, not ${sha2}. Pass the SHA the candidate branch holds.`);

    // An exit no message names still says the run stopped, with its status.
    const gone = makeRepo();
    git(gone, "remote", "set-url", "origin", join(gone.dir, "no-such-origin.git"));
    const lost = land(gone, ["--to-main", sha2, "candidate/x"], "");
    expect(lost.status).not.toBe(0);
    expect(summary(lost.stdout)[2]).toMatch(/^result: stopped with status \d+: read the lines above the summary$/);
  });
});
