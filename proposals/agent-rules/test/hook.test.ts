import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The no-sign hook (SPEC-001-R39) is defence in depth for SPEC-001-R12: it reads a Bash command as Claude Code passes it (JSON on
// standard input) and exits 2 to block. It cannot see inside a script the agent writes; the security key is the control.
describe("SPEC-001-R39 the no-sign hook", () => {
  const project = mkdtempSync(join(tmpdir(), "no-sign-"));
  mkdirSync(join(project, ".claude"));
  afterAll(() => rmSync(project, { recursive: true, force: true }));
  const hook = (command: string) =>
    spawnSync(process.execPath, [join(process.cwd(), ".claude/hooks/hook.mjs"), "no-sign"], {
      input: JSON.stringify({ session_id: "s", tool_input: { command } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      encoding: "utf8",
    }).status;

  it("SPEC-001-R39 blocks commands that could sign or reach a signing key, and logs each one", () => {
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
      "git commit -m \"x\" -S",
      "git -c \"user.signingkey=k\" commit -m x",
      "git config user.signingkey ~/.ssh/k",
      "bash -c \"git commit -S -m x\"",
      "bash <<'EOF'\ngit commit -S -m x\nEOF",
      "git -c commit.gpgsign=false commit -F - <<'EOF'\nmessage\nEOF\ngit commit --amend -S --no-edit",
    ];
    for (const command of blocked) expect([command, hook(command)]).toEqual([command, 2]);
    const log = readFileSync(join(project, ".claude/security-events.log"), "utf8").trim().split("\n");
    expect(log).toHaveLength(blocked.length);
    expect(JSON.parse(log[0] ?? "{}")).toMatchObject({ event: "signing-attempt", session: "s", command: blocked[0] });
  });

  it("SPEC-001-R39 allows the agent's unsigned commits and everyday git", () => {
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
      "git commit -m \"add -Signed-off handling to parser\"",
      "git commit -m \"fix: validate -S flag in CLI\"",
      "git config --get user.signingkey",
      "git log --grep=signingkey --oneline",
      "grep -rn signingkey docs/",
      "git -c commit.gpgsign=false commit -q -F - <<'EOF'\nThe deny rules miss git -c x=y commit -S\n\nAgent: Claude Code\nEOF",
    ];
    for (const command of allowed) expect([command, hook(command)]).toEqual([command, 0]);
  });
});

// The no-session-link hook (SPEC-001-R214) keeps Claude Code session links out of commit messages, per owner decision
// D24. It reads a Bash command's text, and a message file passed with -F or --file, and exits 2 to block.
describe("SPEC-001-R214 the no-session-link hook", () => {
  const project = mkdtempSync(join(tmpdir(), "no-session-link-"));
  afterAll(() => rmSync(project, { recursive: true, force: true }));
  writeFileSync(join(project, "linked.txt"), "docs: a change\n\nAgent: Claude Code\nClaude-Session: https://claude.ai/code/session_01AbCd\n");
  writeFileSync(join(project, "clean.txt"), "docs: a change\n\nAgent: Claude Code\n");
  mkdirSync(join(project, "sub"));
  writeFileSync(join(project, "sub", "linked.txt"), "docs: a change\n\nClaude-Session: https://claude.ai/code/session_01AbCd\n");
  const hook = (command: string, cwd?: string) =>
    spawnSync(process.execPath, [join(process.cwd(), ".claude/hooks/hook.mjs"), "no-session-link"], {
      input: JSON.stringify({ session_id: "s", tool_input: { command }, ...(cwd === undefined ? {} : { cwd }) }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      encoding: "utf8",
    });
  const link = "https://claude.ai/code/session_01AbCd";

  it("SPEC-001-R214 blocks a commit whose message, inline or in a file, links a Claude Code session", () => {
    const blocked = [
      `git commit -m "docs: x" -m "Claude-Session: ${link}"`,
      `git -c commit.gpgsign=false commit -q -F - <<'EOF'\ndocs: x\n\nAgent: Claude Code\nClaude-Session: ${link}\nEOF`,
      "git commit -F linked.txt",
      "git commit --file=linked.txt",
      `git commit -q -F ${join(project, "linked.txt")}`,
      `cd /tmp && git commit --amend -m "see ${link}"`,
      `git commit -m "docs: x" -m "Claude-Session: session_01AbCd"`,
      `git commit -m "see HTTPS://CLAUDE.AI/code/session_01AbCd"`,
      `git \\\n  commit -m "see ${link}"`,
      "git commit -F - < linked.txt",
      "cd sub && git commit -F linked.txt",
      "git -C sub commit -F linked.txt",
    ];
    for (const command of blocked) {
      const r = hook(command);
      expect([command, r.status]).toEqual([command, 2]);
      expect(r.stderr).toContain("Owner decision D24 names no Claude Code session in this repository");
    }
  });

  it("SPEC-001-R214 reads a relative message file from the command's own working directory", () => {
    expect(hook("git commit -F linked.txt", join(project, "sub")).status).toBe(2);
    expect(hook("git commit -F clean.txt", join(project, "sub")).status).toBe(0);
  });

  it("SPEC-001-R214 reads only regular files, and never fails closed on odd input", () => {
    expect(hook("git commit -F /dev/zero").status).toBe(0);
    const odd = spawnSync(process.execPath, [join(process.cwd(), ".claude/hooks/hook.mjs"), "no-session-link"], {
      input: JSON.stringify({ session_id: "s", tool_input: { command: 42 } }), env: { ...process.env, CLAUDE_PROJECT_DIR: project }, encoding: "utf8",
    });
    expect(odd.status).toBe(0);
  });

  it("SPEC-001-R214 allows other commits, and commands that only mention a session link", () => {
    const allowed = [
      "git -c commit.gpgsign=false commit -q -F - <<'EOF'\ndocs: x\n\nAgent: Claude Code\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF",
      "git commit -F clean.txt",
      "git commit -F missing.txt",
      'git commit -m "docs: say why commits carry no session link (D24)"',
      'grep -rn "claude.ai/code/session_" docs',
      "git log --grep=claude.ai/code/session_ --oneline",
    ];
    for (const command of allowed) expect([command, hook(command).status]).toEqual([command, 0]);
  });

  it("SPEC-001-R214 runs before every Bash command, beside no-sign", () => {
    const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as { hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] } };
    const bash = settings.hooks.PreToolUse.filter((h) => h.matcher === "Bash").flatMap((h) => h.hooks.map((c) => c.command));
    expect(bash).toContain('node "$CLAUDE_PROJECT_DIR"/.claude/hooks/hook.mjs no-session-link');
    expect(bash).toContain('node "$CLAUDE_PROJECT_DIR"/.claude/hooks/hook.mjs no-sign');
  });
});
