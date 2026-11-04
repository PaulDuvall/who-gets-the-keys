import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The no-sign hook is defence in depth for SPEC-001-R12: it reads a Bash command as Claude Code passes it (JSON on
// standard input) and exits 2 to block. It cannot see inside a script the agent writes; the security key is the control.
describe("SPEC-001-R12 the no-sign hook", () => {
  const project = mkdtempSync(join(tmpdir(), "no-sign-"));
  mkdirSync(join(project, ".claude"));
  afterAll(() => rmSync(project, { recursive: true, force: true }));
  const hook = (command: string) =>
    spawnSync(process.execPath, [join(process.cwd(), ".claude/hooks/hook.mjs"), "no-sign"], {
      input: JSON.stringify({ session_id: "s", tool_input: { command } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      encoding: "utf8",
    }).status;

  it("SPEC-001-R12 blocks commands that could sign or reach a signing key, and logs each one", () => {
    const blocked = [
      "git commit -S -m x",
      "git commit -Sm x",
      "git commit -eS -m x",
      "git -c user.signingkey=~/k -c gpg.format=ssh commit -S -m x",
      "git -c commit.gpgsign=1 commit -m x",
      "git -c COMMIT.GPGSIGN=Yes commit -m x",
      "git config commit.gpgsign true && git commit -m x",
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=true git commit -m x",
      "GIT_CONFIG_PARAMETERS=\"'commit.gpgsign'='true'\" git commit -m x",
      "git commit-tree -S HEAD^{tree} -m x",
      "git rebase --gpg-sign main",
      "git merge -S side",
      "git cherry-pick -S abc123",
      "git tag -s v1 -m x",
      "git tag -u KEY v1",
      "git -c gpg.ssh.program=/tmp/w commit -m x",
      "ssh-keygen -Y sign -n git -f ~/.ssh/id_ed25519 msg",
      "ssh-add -L",
      "SSH_AUTH_SOCK=/tmp/agent.sock git commit -m x",
      "git fast-import --signed-commits=sign-if-invalid < stream",
      "git hash-object -t commit -w --stdin < obj",
      "node scripts/bootstrap/rewrite-history.ts --apply",
      "git commit \\\n  -S -m x",
    ];
    for (const command of blocked) expect([command, hook(command)]).toEqual([command, 2]);
    const log = readFileSync(join(project, ".claude/security-events.log"), "utf8").trim().split("\n");
    expect(log).toHaveLength(blocked.length);
    expect(JSON.parse(log[0] ?? "{}")).toMatchObject({ event: "signing-attempt", session: "s", command: blocked[0] });
  });

  it("SPEC-001-R12 allows the agent's unsigned commits and everyday git", () => {
    const allowed = [
      "git -c commit.gpgsign=false commit -q -F - <<'EOF'\nSpec: SPEC-001-R12\nEOF",
      "git commit -am \"docs: fix -s typo\"",
      "git commit --no-gpg-sign -m x",
      "git log -S needle --oneline",
      "git merge -s ours side",
      "git verify-commit HEAD",
      "git config --get commit.gpgsign",
      "git tag -l",
      "npm run checks",
      "git push origin HEAD:main",
      "grep -n replace scripts/bootstrap/rewrite-history.ts",
    ];
    for (const command of allowed) expect([command, hook(command)]).toEqual([command, 0]);
  });
});
