// Claude Code hooks. Usage: node hook.mjs <expect-expect|gitleaks-staged|security-event|no-sign|no-session-link|no-inner-worktree>
// Reads the hook's JSON from stdin. Exit 2 blocks (PreToolUse) or reports back (PostToolUse).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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
  // Deny rules match only a command's start; this reads all of its text, less commit messages (-m arguments and a
  // `git commit -F -` heredoc), so a message that mentions signing is not mistaken for it. Neither is a boundary: a
  // script the agent writes and runs can still try to sign. The approver's private key on a security key, which needs
  // a touch for every signature (touch only for now, per the owner decision of 2026-11-05), is the control
  // (SPEC-001-R39 and R12, docs/decisions/0003-approver-key.md).
  "no-sign"() {
    const full = (tool.command ?? "").replace(/\\\n/g, " ");
    const bare = full
      .replace(/^(git\b[^\n]*\bcommit\b[^\n]*\s-F\s*-\s*<<-?\s*(['"]?)(\w+)\2)\n[\s\S]*?\n\3(?=\n|$)/, "$1")
      .replace(/\s(?:-m|--message)(?:=|\s+)(?:"(?:[^"\\]|\\.)*"|'[^']*')/g, " -m ''");
    const signing = [
      [bare, /\bgit\b.*\b(?:commit|commit-tree|rebase|merge|am|cherry-pick|revert|pull)\b.*(?:\s-(?!-)[A-Za-z]*S|--gpg-sign\b)/],
      [bare, /\bgit\b.*\btag\b.*(?:\s-(?!-)[A-Za-z]*[su]|--sign\b|--local-user\b)/],
      [full, /\b(?:commit|tag|push)\.gpgsign\b\s*(?:=|\s)\s*["']?(?:true|yes|on|1)\b/i],
      [bare, /\bGIT_CONFIG_(?:KEY_\d+|PARAMETERS)\b/],
      [full, /\b(?:user\.signingkey|gpg(?:\.ssh)?\.program|gpg\.format)\s*=/i],
      [bare, /\bgit\b[^\n]*\bconfig\b(?![^\n]*\s--(?:get|get-all|list|unset)\b)[^\n]*\b(?:user\.signingkey|gpg(?:\.ssh)?\.program)\s+\S/i],
      [bare, /\bssh-keygen\b.*-Y\s*sign\b/],
      [bare, /\bssh-add\b|\bIdentityAgent\b/],
      [full, /\bSSH_AUTH_SOCK\b/],
      [bare, /--signed-(?:commits|tags)=sign/],
      [bare, /\bhash-object\b.*-t\s*commit\b/],
      [bare, /\b(?:node|npx|tsx|bun|deno)\b[^\n;&|]*rewrite-history/],
    ];
    if (!signing.some(([text, pattern]) => pattern.test(text))) return 0;
    const event = { at: new Date().toISOString(), event: "signing-attempt", session: input.session_id, command: full };
    appendFileSync(join(root, ".claude/security-events.log"), `${JSON.stringify(event)}\n`);
    process.stderr.write("Blocked: this command could sign a commit or tag, or reach a signing key. Only an approver signs, with a security key. Agent commits are unsigned: git -c commit.gpgsign=false commit.\n");
    return 2;
  },
  // PreToolUse on Bash: refuse a git commit whose message links a Claude Code session. Owner decision D24 names no
  // session in this repository, and some sessions are told to add a Claude-Session trailer (SPEC-001-R214). It reads
  // the command's text, and the message files it names with -F, --file or a < redirect, resolved from the command's
  // working directory after any cd or git -C. Like no-sign, it is a tripwire, not a boundary.
  "no-session-link"() {
    const command = typeof tool.command === "string" ? tool.command.replace(/\\\n/g, " ") : "";
    if (!/\bgit\b[^\n]*\bcommit\b/.test(command)) return 0;
    const link = /claude\.ai\/code\/session_|(?:^|[\s"'])Claude-Session:/im;
    let dir = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : root;
    const cd = [...command.matchAll(/(?:^|[;&|]\s*)cd\s+(["']?)([^\s"';&|]+)\1/g)].at(-1)?.[2];
    if (cd !== undefined) dir = isAbsolute(cd) ? cd : join(dir, cd);
    const gitC = /\bgit\s+-C\s+(["']?)([^\s"']+)\1[^\n]*\bcommit\b/.exec(command)?.[2];
    if (gitC !== undefined) dir = isAbsolute(gitC) ? gitC : join(dir, gitC);
    const named = [
      ...[...command.matchAll(/\s(?:-F|--file)(?:=|\s+)(["']?)([^\s"']+)\1/g)].map((m) => m[2]),
      ...[...command.matchAll(/\s<\s*(["']?)([^\s"'<>;&|]+)\1/g)].map((m) => m[2]),
    ].filter((f) => f !== undefined && f !== "-");
    // Only regular files up to 1 MiB: a FIFO would hang the hook, and /dev/zero would never end.
    const read = (file) => {
      try {
        const path = isAbsolute(file) ? file : join(dir, file);
        const stat = statSync(path);
        return stat.isFile() && stat.size <= 1024 * 1024 ? readFileSync(path, "utf8") : "";
      } catch {
        return "";
      }
    };
    if (![command, ...named.map(read)].some((text) => link.test(text))) return 0;
    process.stderr.write("Blocked: this commit message links a Claude Code session. Owner decision D24 names no Claude Code session in this repository, so leave out the Claude-Session trailer and any session link.\n");
    return 2;
  },
  // PreToolUse on Bash: refuse a git worktree inside the checkout (SPEC-001-R230, lesson L33). There, gitleaks-staged
  // scans the worktree's untracked files, finds the B5 scenario's synthetic secret in its scenarios/, and blocks every
  // commit until the worktree is removed. It splits the command into simple commands, as a shell would, with quoted
  // text and heredoc bodies kept as words, so a commit message that names the command is not one. It follows each cd
  // in order, a subshell's cd only inside it, and git's -C and other global options. A path or directory that names a
  // variable or ~ is not judged. Like the hooks above, it reads command text only.
  "no-inner-worktree"() {
    const text = typeof tool.command === "string" ? tool.command : "";
    const start = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : root;
    const tokens = [];
    let word = null;
    let i = 0;
    const heredocs = [];
    const push = () => {
      if (word !== null) tokens.push({ word: word.text, plain: !word.quoted });
      word = null;
    };
    const add = (ch, quoted = false) => {
      word ??= { text: "", quoted: false };
      word.text += ch;
      if (quoted) word.quoted = true;
    };
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\" && text[i + 1] === "\n") { i += 2; continue; }
      if (ch === "\\") { add(text[i + 1] ?? "", true); i += 2; continue; }
      if (ch === "'") {
        const close = text.indexOf("'", i + 1);
        const stop = close === -1 ? text.length : close;
        add(text.slice(i + 1, stop), true);
        i = stop + 1;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let body = "";
        while (j < text.length && text[j] !== '"') {
          if (text[j] === "\\" && j + 1 < text.length) { body += text[j + 1]; j += 2; } else body += text[j++];
        }
        add(body, true);
        i = j + 1;
        continue;
      }
      if (ch === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
        push();
        const m = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(text.slice(i));
        if (m) { heredocs.push(m[2]); i += m[0].length; continue; }
      }
      if (ch === "\n") {
        push();
        tokens.push({ op: ";" });
        i++;
        for (const tag of heredocs.splice(0)) {
          const rest = text.slice(i);
          const close = new RegExp(`^[\\t]*${tag}$`, "m").exec(rest);
          i += close ? close.index + close[0].length : rest.length;
        }
        continue;
      }
      if (/[;&|()]/.test(ch)) { push(); tokens.push({ op: ch }); i++; continue; }
      if (/\s/.test(ch)) { push(); i++; continue; }
      add(ch);
      i++;
    }
    push();

    const unknown = (w) => w.includes("$") || w.startsWith("~") || w.includes("`");
    const at = (dir, w) => (dir === null || unknown(w) ? null : resolve(dir, w));
    const inside = [];
    const stack = [];
    let dir = start;
    let simple = [];
    const judge = () => {
      const words = simple;
      simple = [];
      let k = 0;
      while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k].word) && words[k].plain) k++;
      const name = words[k]?.word;
      if (name === "cd") {
        const target = words[k + 1]?.word;
        dir = target === undefined ? null : at(dir, target);
        return;
      }
      if (name !== "git" && !/\/git$/.test(name ?? "")) return;
      let base = dir;
      k++;
      while (k < words.length && words[k].word.startsWith("-")) {
        const opt = words[k].word;
        if (opt === "-C") { base = at(base, words[k + 1]?.word ?? "$"); k += 2; }
        else if (opt === "-c" || opt === "--git-dir" || opt === "--work-tree" || opt === "--namespace" || opt === "--exec-path" || opt === "--config-env") k += 2;
        else k++;
      }
      if (words[k]?.word !== "worktree" || words[k + 1]?.word !== "add") return;
      k += 2;
      let path;
      for (; k < words.length && path === undefined; k++) {
        const w = words[k].word;
        if (w === "--") { path = words[k + 1]?.word; break; }
        if (["-b", "-B", "--reason"].includes(w)) k++;
        else if (!w.startsWith("-")) path = w;
      }
      if (path === undefined) return;
      const target = at(base, path);
      if (target === null) return;
      const rel = relative(resolve(root), target);
      if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) inside.push(path);
    };
    for (const t of tokens) {
      if (t.op === undefined) { simple.push(t); continue; }
      judge();
      if (t.op === "(") stack.push(dir);
      if (t.op === ")") dir = stack.length ? stack.pop() : dir;
    }
    judge();
    if (!inside.length) return 0;
    process.stderr.write(`Blocked: git worktree ${inside.join(", ")} would sit inside the checkout, where the gitleaks-staged hook finds the B5 scenario's synthetic secret and blocks every commit. Make it outside the checkout, under your scratchpad directory, and never use EnterWorktree or an agent's worktree isolation, which put it under .claude/worktrees/ (SPEC-001-R230).\n`);
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
