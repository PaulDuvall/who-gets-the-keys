// Claude Code hooks. Usage: node hook.mjs <expect-expect|gitleaks-staged|security-event|no-sign>
// Reads the hook's JSON from stdin. Exit 2 blocks (PreToolUse) or reports back (PostToolUse).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = JSON.parse(readFileSync(0, "utf8"));
const tool = input.tool_input ?? {};

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    return null;
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || String(err);
  }
};

const hooks = {
  // PostToolUse on Write|Edit: lint a test file for assertion-free tests.
  "expect-expect"() {
    const file = tool.file_path ?? "";
    if (!/\.test\.[cm]?[jt]s$/.test(file)) return 0;
    const out = run(join(root, "node_modules/.bin/eslint"), ["--no-warn-ignored", "--rule", '{"vitest/expect-expect":"error"}', file]);
    if (out === null) return 0;
    process.stderr.write(`vitest/expect-expect: ${file} has a test with no assertion. Add an expect before committing.\n${out}\n`);
    return 2;
  },
  // PreToolUse on Bash: before any command that mentions commit, scan everything the commit could include:
  // staged changes, unstaged changes to tracked files (git commit -a; git add ... && git commit) and untracked
  // files (git add -A). The command text is not parsed, so quoting, -C and chained commands cannot skip the scan.
  "gitleaks-staged"() {
    if (!/\bcommit\b/.test(tool.command ?? "")) return 0;
    if (run("gitleaks", ["version"]) !== null) {
      process.stderr.write("gitleaks is not installed or does not run, so commits are blocked. scripts/ci/install-tools.sh installs the pinned version.\n");
      return 2;
    }
    const flags = ["--no-banner", "--redact", "--exit-code", "1", "--config", join(root, ".gitleaks.toml")];
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0").filter(Boolean);
    const scans = [
      ["staged changes", ["git", "--staged", ...flags, root]],
      ["unstaged changes", ["git", "--pre-commit", ...flags, root]],
      ...untracked.map((file) => [`untracked file ${file}`, ["dir", ...flags, join(root, file)]]),
    ];
    for (const [what, args] of scans) {
      const out = run("gitleaks", args);
      if (out === null) continue;
      process.stderr.write(`gitleaks found a secret in ${what}. Remove it before committing.\n${out}\n`);
      return 2;
    }
    return 0;
  },
  // PreToolUse on Bash: record dependency install or add attempts. The deny rules block them.
  "security-event"() {
    const command = tool.command ?? "";
    const pattern = /\b(?:npm\s+(?:i|install|add|ci)|pnpm\s+(?:i|install|add)|yarn\s+(?:add|install)|npx\s+--yes|pip3?\s+install|uv\s+(?:add|pip\s+install))\b/;
    if (!pattern.test(command)) return 0;
    const event = { at: new Date().toISOString(), event: "dependency-install-attempt", session: input.session_id, command };
    appendFileSync(join(root, ".claude/security-events.log"), `${JSON.stringify(event)}\n`);
    return 0;
  },
  // PreToolUse on Bash: refuse a command that could sign a commit or tag, or reach a signing key, and log it.
  // Deny rules match only a command's start; this reads all of its text. Neither is a boundary: a script the agent
  // writes and runs can still try to sign. The approver's security key, which needs a touch and a PIN for every
  // signature, is the control, and the signatures check requires both (SPEC-001-R12, docs/decisions/0003).
  "no-sign"() {
    const command = (tool.command ?? "").replace(/\\\n/g, " ");
    const signing = [
      /\bgit\b.*\b(?:commit|commit-tree|rebase|merge|am|cherry-pick|revert|pull)\b.*(?:\s-(?!-)[A-Za-z]*S|--gpg-sign\b)/,
      /\bgit\b.*\btag\b.*(?:\s-(?!-)[A-Za-z]*[su]|--sign\b|--local-user\b)/,
      /\b(?:commit|tag|push)\.gpgsign\b\s*(?:=|\s)\s*["']?(?:true|yes|on|1)\b/i,
      /\bGIT_CONFIG_(?:KEY_\d+|PARAMETERS)\b/,
      /signingkey|\bgpg(?:\.ssh)?\.program\b/i,
      /\bssh-keygen\b.*-Y\s*sign\b/,
      /\bssh-add\b|\bSSH_AUTH_SOCK\b|\bIdentityAgent\b/,
      /--signed-(?:commits|tags)=sign/,
      /\bhash-object\b.*-t\s*commit\b/,
      /\b(?:node|npx|tsx|bun|deno)\b[^\n;&|]*rewrite-history/,
    ];
    if (!signing.some((pattern) => pattern.test(command))) return 0;
    const event = { at: new Date().toISOString(), event: "signing-attempt", session: input.session_id, command };
    appendFileSync(join(root, ".claude/security-events.log"), `${JSON.stringify(event)}\n`);
    process.stderr.write("Blocked: this command could sign a commit or tag, or reach a signing key. Only an approver signs, with a security key. Agent commits are unsigned: git -c commit.gpgsign=false commit.\n");
    return 2;
  },
};

const name = process.argv[2] ?? "";
const hook = hooks[name];
if (!hook) {
  process.stderr.write(`unknown hook: ${name}\n`);
  process.exit(1);
}
process.exit(hook());
