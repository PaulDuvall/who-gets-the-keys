import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/bootstrap/cloud-session-setup.sh";
const text = readFileSync(script, "utf8");
const pinned = (name: string): string => new RegExp(`^${name}=(\\S+)$`, "m").exec(text)?.[1] ?? "";

describe("SPEC-001-R211 cloud-session-setup.sh sets up a cloud session's container from the repository", () => {
  it("SPEC-001-R211 parses as bash and pins the Node.js release and SHA-256 that docs/verification.md records", () => {
    execFileSync("bash", ["-n", script]);
    const version = pinned("node_version");
    const sha = pinned("node_sha256");
    expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const row = readFileSync("docs/verification.md", "utf8").split("\n").find((l) => l.startsWith("| Node.js for cloud sessions |")) ?? "";
    expect(row).toContain(`\`node-${version}-linux-x64.tar.xz\`, SHA-256 \`${sha}\``);
  });

  it("SPEC-001-R211 the README gives the claude.ai setup script as the one line in the script's header", () => {
    const header = /^#   (if \[ -f .*; fi)$/m.exec(text)?.[1] ?? "";
    expect(header).toBe("if [ -f who-gets-the-keys/scripts/bootstrap/cloud-session-setup.sh ]; then bash who-gets-the-keys/scripts/bootstrap/cloud-session-setup.sh; fi");
    const readme = readFileSync("README.md", "utf8");
    const section = readme.slice(readme.indexOf("## Cloud session environment"), readme.indexOf("\n## ", readme.indexOf("## Cloud session environment") + 1));
    const blocks = [...section.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks).toEqual([`${header}\n`]);
  });

  it("SPEC-001-R211 pins a Node.js version that package.json's engines range admits", () => {
    expect((JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } }).engines.node).toBe(">=24.11.0 <25");
    const [major = 0, minor = 0] = pinned("node_version").slice(1).split(".").map(Number);
    expect(major).toBe(24);
    expect(minor).toBeGreaterThanOrEqual(11);
  });

  it("SPEC-001-R211 checks the download, then installs Node.js, the check CLIs and node_modules, in that order", () => {
    const steps = ["curl -sSfL", "sha256sum -c", "tar -xJf", "scripts/ci/install-tools.sh \"$bin\"", "npm ci --ignore-scripts"];
    const at = steps.map((s) => text.indexOf(s));
    expect(at.every((i) => i > 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(text).toContain('"https://nodejs.org/dist/${node_version}/node-${node_version}-linux-x64.tar.xz"');
  });

  it("SPEC-001-R211 refuses a download that does not match the pinned SHA-256, before it unpacks or installs anything", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloud-setup-"));
    try {
      const stubs = join(dir, "stubs");
      const calls = join(dir, "calls");
      mkdirSync(stubs);
      const curl = ['#!/usr/bin/env bash', `echo "curl $*" >> "${calls}"`, 'out=""', 'while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done', 'printf "not node" > "$out"', ""];
      writeFileSync(join(stubs, "curl"), curl.join("\n"));
      for (const name of ["tar", "npm", "uv"]) writeFileSync(join(stubs, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${calls}"\n`);
      for (const name of ["curl", "tar", "npm", "uv"]) chmodSync(join(stubs, name), 0o755);
      // An earlier install must survive a refused download.
      mkdirSync(join(dir, "node"));
      writeFileSync(join(dir, "node", "marker"), "earlier install\n");
      const r = spawnSync("bash", [script], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${stubs}:${process.env["PATH"] ?? ""}`, NODE_PREFIX: join(dir, "node"), BIN_DIR: join(dir, "bin") },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`node-${pinned("node_version")}-linux-x64.tar.xz does not match its pinned SHA-256. Nothing was installed.`);
      const made = readFileSync(calls, "utf8").trim().split("\n");
      expect(made).toHaveLength(1);
      expect(made[0]).toMatch(/^curl -sSfL --retry 3 -o \S+\/node\.tar\.xz https:\/\/nodejs\.org\/dist\/v\d+\.\d+\.\d+\/node-v\d+\.\d+\.\d+-linux-x64\.tar\.xz$/);
      expect([readFileSync(join(dir, "node", "marker"), "utf8"), existsSync(join(dir, "bin"))]).toEqual(["earlier install\n", false]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
