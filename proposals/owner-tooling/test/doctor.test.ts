import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runScript, scratchDir, tempRepo, TIMEOUT, writeStubs, type ScriptRun, type TempRepo } from "./helpers/temp-repo.ts";

// scripts/bootstrap/doctor.sh checks the owner's machine before an owner step and prints the exact fix for each gap
// (SPEC-001-R218). Each test runs it in a temporary clone with stub node, gh, ssh, ssh-keygen, ykman and aws first on
// PATH. A stub's answer comes from a STUB_ variable, so one test changes one answer. Nothing reaches GitHub or AWS.
const script = join(process.cwd(), "scripts/bootstrap/doctor.sh");

const node = '#!/usr/bin/env bash\n[ "$*" = --version ] && echo "${STUB_NODE:-v24.22.2}"\nexit 0\n';
const gh = '#!/usr/bin/env bash\n[ "$1 $2" = "auth status" ] && exit "${STUB_GH_AUTH:-0}"\nexit 2\n';
const ssh = '#!/usr/bin/env bash\n[ "$*" = "-Q key" ] && printf "ssh-ed25519\\n%s\\n" "${STUB_SK-sk-ssh-ed25519@openssh.com}"\nexit 0\n';
const keygen = "#!/usr/bin/env bash\nexit 0\n";
const ykman = [
  "#!/usr/bin/env bash",
  'case "$1" in',
  '  list) for n in $(seq "${STUB_KEYS:-1}"); do echo "YubiKey 5C Nano (5.7.1) [OTP+FIDO+CCID] Serial: 12345$n"; done ;;',
  '  info) printf "Applications\\nYubico OTP         Enabled\\nOATH               %s\\n" "${STUB_OATH:-Enabled}" ;;',
  '  oath) [ "$2 $3" = "accounts list" ] && printf "%s\\n" ${STUB_ACCOUNTS:-} ;;',
  "esac",
  "",
].join("\n");
// aws: get-caller-identity works for the profiles in STUB_AWS_OK; configure get source_profile answers from
// STUB_SOURCE ("<profile>=<source>").
const aws = [
  "#!/usr/bin/env bash",
  'arg() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { printf "%s" "$2"; return 0; }; shift; done; }',
  'p="$(arg --profile "$@")"',
  'case "$1 $2" in',
  '  "sts get-caller-identity") case " ${STUB_AWS_OK:-} " in *" $p "*) echo "arn:aws:sts::111111111111:assumed-role/Admin/owner"; exit 0 ;; esac',
  '    echo "Error when retrieving token from sso: Token has expired and refresh failed" >&2; exit 255 ;;',
  '  "configure get") case "${STUB_SOURCE:-}" in "$p="*) echo "${STUB_SOURCE#*=}"; exit 0 ;; esac; exit 1 ;;',
  "esac",
  "exit 2",
  "",
].join("\n");

const PACKAGE = { "package.json": '{\n  "name": "t",\n  "engines": {\n    "node": ">=24.11.0 <25"\n  }\n}\n' };

describe("SPEC-001-R218 doctor.sh checks the owner's machine and prints the fix for each gap", () => {
  const scratch = scratchDir("doctor-");

  function makeRepo(): TempRepo {
    return tempRepo(scratch(), { stubs: { node, gh, ssh, "ssh-keygen": keygen, ykman, aws }, files: PACKAGE });
  }

  // HOMEBREW_PREFIX points at an empty directory unless a test makes a node@24 there.
  function doctor(repo: TempRepo, args: string[], env: NodeJS.ProcessEnv = {}): ScriptRun {
    return runScript(repo, script, args, { env: { HOMEBREW_PREFIX: join(repo.dir, "brew"), ...env } });
  }

  it("SPEC-001-R218 says ready when Node.js, gh, git, the signer, one YubiKey with OATH and both AWS profiles pass", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = doctor(repo, [], { SANDBOX_PROFILE: "sbx", MANAGEMENT_PROFILE: "mgmt", STUB_AWS_OK: "sbx mgmt" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ok    Node.js 24.22.2 is in >=24.11.0 <25");
    expect(r.stdout).toContain("ok    gh is signed in");
    expect(r.stdout).toMatch(/^ok {4}git \d+\.\d+$/m);
    expect(r.stdout).toContain(`ok    git signs with ${repo.stub}/ssh-keygen, which supports security keys`);
    expect(r.stdout).toContain("ok    one YubiKey is plugged in");
    expect(r.stdout).toContain("ok    its OATH application is enabled, for the break-glass code");
    expect(r.stdout).toContain("ok    AWS profile sbx (SANDBOX_PROFILE) has working credentials");
    expect(r.stdout).toContain("ok    AWS profile mgmt (MANAGEMENT_PROFILE) has working credentials");
    expect(r.stdout).not.toMatch(/\d{12}/);
    expect(r.stdout.trimEnd().split("\n").at(-1)).toBe("Doctor: ready.");
  });

  it.each([
    ["Node.js out of range, with no node@24", { STUB_NODE: "v24.1.0" },
      ["fix   No Node.js in >=24.11.0 <25: the node on PATH is 24.1.0, and Homebrew has no node@24.", "      brew install node@24"]],
    ["gh signed out", { STUB_GH_AUTH: "1" }, ["fix   gh is not signed in.", "      gh auth login"]],
    ["a signer without security-key types", { STUB_SK: "" },
      [`fix   git signs with ${"<stub>"}/ssh-keygen, whose OpenSSH lists no security-key type (sk-ssh-ed25519@openssh.com).`, "      brew install openssh"]],
    ["no YubiKey", { STUB_KEYS: "0" }, ["fix   No YubiKey is plugged in."]],
    ["two YubiKeys", { STUB_KEYS: "2" }, ["fix   2 YubiKeys are plugged in, so a touch may go to the wrong one.",
      "      Unplug every one but the YubiKey that holds the approver key, then run this again."]],
    ["OATH turned off", { STUB_OATH: "Disabled" }, ["      ykman config usb --enable OATH"]],
  ])("SPEC-001-R218 names the fix for %s and exits 1", { timeout: TIMEOUT }, (_name, env, expected) => {
    const repo = makeRepo();
    const r = doctor(repo, [], env);
    expect(r.status).toBe(1);
    for (const line of expected) expect(r.stdout).toContain(line.replace("<stub>", repo.stub));
    expect(r.stdout.trimEnd().split("\n").at(-1)).toBe("Doctor: 1 to fix. Fix them, then run this again.");
  });

  it("SPEC-001-R218 reads OATH from the USB column when ykman info also shows an NFC column, for --for aws alone", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    writeStubs(repo.stub, { ykman: '#!/usr/bin/env bash\ncase "$1" in list) echo "YubiKey 5 NFC" ;; info) printf "Applications\\tUSB\\tNFC\\nOATH\\tEnabled\\tDisabled\\n" ;; esac\n' });
    const r = doctor(repo, ["--for", "aws"]);
    expect(r.stdout).toContain("ok    its OATH application is enabled, for the break-glass code");
    expect(r.stdout).not.toContain("Node.js");
    expect(r.status).toBe(0);
  });

  it("SPEC-001-R218 notes, without failing, when the one YubiKey also holds the break-glass code", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const both = doctor(repo, ["--for", "aws"], { STUB_ACCOUNTS: "AWS:who-gets-the-keys-break-glass-user" });
    expect(both.status).toBe(0);
    expect(both.stdout).toContain("note  This YubiKey holds the break-glass code, and it is the one plugged in to sign: one device for both.");
    expect(doctor(repo, ["--for", "aws"]).stdout).not.toContain("one device for both");
  });

  it("SPEC-001-R218 says when ykman is missing", { timeout: TIMEOUT }, () => {
    const repo = tempRepo(scratch(), { stubs: { node, gh, ssh, "ssh-keygen": keygen }, files: PACKAGE });
    const r = runScript(repo, script, ["--for", "land"], { env: { PATH: `${repo.stub}:/usr/bin:/bin`, HOMEBREW_PREFIX: join(repo.dir, "brew") } });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("fix   ykman, the YubiKey Manager CLI, is not installed.\n      brew install ykman\n");
  });

  it("SPEC-001-R218 finds Homebrew's keg-only node@24 when the node on PATH is out of range, and --node-bin prints it", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const keg = join(repo.dir, "brew/opt/node@24/bin");
    mkdirSync(keg, { recursive: true });
    writeStubs(keg, { node: '#!/usr/bin/env bash\n[ "$*" = --version ] && echo v24.22.2\nexit 0\n' });
    const r = doctor(repo, ["--for", "land"], { STUB_NODE: "v24.1.0" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`ok    Node.js 24.22.2 from ${keg} is in >=24.11.0 <25`);
    expect(r.stdout).toContain("note  The node first on PATH is 24.1.0. land.sh puts");
    const bin = doctor(repo, ["--node-bin"], { STUB_NODE: "v24.1.0" });
    expect([bin.status, bin.stdout]).toEqual([0, `${keg}\n`]);
    const none = doctor(makeRepo(), ["--node-bin"], { STUB_NODE: "v25.0.0" });
    expect([none.status, none.stdout]).toEqual([1, ""]);
  });

  it("SPEC-001-R218 names the SSO source profile when a role profile has no working credentials", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = doctor(repo, ["--for", "aws"], { SANDBOX_PROFILE: "sbx", MANAGEMENT_PROFILE: "mgmt", STUB_AWS_OK: "mgmt", STUB_SOURCE: "sbx=org-management" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("fix   AWS profile sbx (SANDBOX_PROFILE) has no working credentials. It takes them from profile org-management.\n      aws sso login --profile org-management\n");
    const plain = doctor(repo, ["--for", "aws"], { SANDBOX_PROFILE: "sbx", STUB_AWS_OK: "" });
    expect(plain.stdout).toContain("fix   AWS profile sbx (SANDBOX_PROFILE) has no working credentials.\n      aws sso login --profile sbx\n");
  });

  it("SPEC-001-R218 checks only gh and git for --for push, and skips AWS without profiles", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const push = doctor(repo, ["--for", "push"], { STUB_NODE: "v20.0.0", STUB_KEYS: "0" });
    expect(push.status).toBe(0);
    expect(push.stdout.split("\n").filter(Boolean).map((l) => l.slice(0, 6).trim())).toEqual(["ok", "ok", "Doctor"]);
    const all = doctor(repo, []);
    expect(all.stdout).toContain("note  AWS profiles not checked: set SANDBOX_PROFILE and MANAGEMENT_PROFILE");
    expect(doctor(repo, ["--for", "nothing"]).status).toBe(2);
  });
});
