// Claude Code hooks. Usage: node hook.mjs <expect-expect|gitleaks-staged|security-event>
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
  // PreToolUse on Bash: scan staged changes before git commit.
  "gitleaks-staged"() {
    if (!/\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+commit\b/.test(tool.command ?? "")) return 0;
    const out = run("gitleaks", ["git", "--staged", "--no-banner", "--redact", "--exit-code", "1", root]);
    if (out === null) return 0;
    process.stderr.write(`gitleaks found a secret in staged changes. Remove it before committing.\n${out}\n`);
    return 2;
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
};

const name = process.argv[2] ?? "";
const hook = hooks[name];
if (!hook) {
  process.stderr.write(`unknown hook: ${name}\n`);
  process.exit(1);
}
process.exit(hook());
