#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/rotate-approver-key.sh"
  echo "  Creates the approver's FIDO2 security key (ed25519-sk, a touch and a PIN for every signature), proves"
  echo "  that its signatures carry both, and writes it to approvers.txt. It never commits, pushes or uploads."
  echo "  Run it from the repository root on the approver's machine, with the security key plugged in, after the"
  echo "  approver-key proposals are in the working tree (docs/decisions/0003-approver-key.md)."
  echo "  Close every Claude Code session first and keep them closed until the last step: until then the old key"
  echo "  can still approve, and an agent session on this machine could reach it."
  echo "  Environment: KEY_FILE (default ~/.ssh/id_ed25519_sk_approver), SSH_KEYGEN, RESIDENT=1 to store the key on"
  echo "  the security key as well, so a new machine can fetch it with ssh-keygen -K, and APPEND=1 to add a backup"
  echo "  key as a second approvers.txt line instead of replacing the file."
}

confirm() { read -r -p "$1 [y/N] " answer; [ "$answer" = "y" ]; }

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage; exit 1 ;;
esac

[ -f approvers.txt ] && [ -f scripts/checks.ts ] || { echo "Run this from the repository root."; exit 1; }
grep -q "export function sshSignature" scripts/checks.ts || {
  echo "scripts/checks.ts cannot read security-key flags yet. Move the approver-key proposals into place first."
  exit 1
}

keygen="${SSH_KEYGEN:-}"
if [ -z "$keygen" ]; then
  for candidate in /opt/homebrew/bin/ssh-keygen /usr/local/bin/ssh-keygen; do
    if [ -x "$candidate" ]; then keygen="$candidate"; break; fi
  done
fi
[ -n "$keygen" ] || keygen="$(command -v ssh-keygen)"
if [ "$(uname -s)" = "Darwin" ] && [ "$keygen" = "/usr/bin/ssh-keygen" ] && [ -z "${SSH_SK_PROVIDER:-}" ]; then
  echo "macOS's own OpenSSH has no built-in security key support. Install Homebrew's, then run this again:"
  echo "brew install openssh"
  exit 1
fi
version="$("$(dirname "$keygen")/ssh" -V 2>&1 | sed -n 's/^OpenSSH_\([0-9]*\)\.\([0-9]*\).*/\1 \2/p')"
read -r major minor <<< "${version:-0 0}"
if [ "$major" -lt 8 ] || { [ "$major" -eq 8 ] && [ "$minor" -lt 4 ]; }; then
  echo "${keygen} is OpenSSH ${major}.${minor}. A PIN for every signature (verify-required) needs 8.4 or later."
  exit 1
fi
echo "Using ${keygen} (OpenSSH ${major}.${minor})."

old_line="$(grep -v '^[[:space:]]*#' approvers.txt | grep -v '^[[:space:]]*$' | head -n 1)"
principal="${old_line%% *}"
[ -n "$principal" ] || { echo "approvers.txt has no approver line to take the principal from."; exit 1; }
echo "Approver principal: ${principal}"

key="${KEY_FILE:-$HOME/.ssh/id_ed25519_sk_approver}"
if [ -f "$key" ]; then
  echo "Using the existing key ${key}."
else
  options=(-O verify-required -O application=ssh:who-gets-the-keys)
  [ "${RESIDENT:-}" = "1" ] && options+=(-O resident)
  echo "Will create ${key}: ed25519-sk, ${options[*]}."
  confirm "Create it? Touch the key and enter its PIN when asked." || { echo "Nothing changed."; exit 1; }
  "$keygen" -t ed25519-sk "${options[@]}" -C "who-gets-the-keys approver" -f "$key"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf 'who-gets-the-keys approver key check\n' > "$work/message"
new_line="${principal} namespaces=\"git\" $(cut -d' ' -f1,2 "${key}.pub")"
printf '%s\n' "$new_line" > "$work/allowed_signers"
echo
echo "Signing a test message. Touch the key and enter its PIN when asked."
"$keygen" -Y sign -n git -f "$key" "$work/message"
"$keygen" -Y verify -f "$work/allowed_signers" -I "$principal" -n git -s "$work/message.sig" < "$work/message"
if ! node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { lacksTouchAndPin, sshSignature } from "./scripts/checks.ts";
  const sig = sshSignature(readFileSync(process.argv[1], "utf8"));
  console.log(`Signature: ${sig?.keyType ?? "unreadable"}, flags ${sig?.flags ?? "none"} (5 means a touch and a PIN).`);
  process.exit(lacksTouchAndPin(sig) || sig?.flags === undefined ? 1 : 0);
' "$work/message.sig"; then
  echo "That signature lacks a touch or a PIN, so the signatures check would refuse it. Recreate the key with"
  echo "-O verify-required on a security key that supports a PIN, and do not use -O no-touch-required."
  exit 1
fi

echo
echo "New approvers.txt line:"
echo "$new_line"
old_key="$(printf '%s\n' "$old_line" | awk '{ for (i = 2; i < NF; i++) if ($i ~ /^(ssh-|sk-|ecdsa-)/) { print $i, $(i + 1); exit } }')"
echo "Current approver key: $(printf '%s\n' "$old_key" | "$keygen" -lf - 2>/dev/null || printf '%s\n' "$old_key" | cut -c1-80)"
echo "New approver key: $("$keygen" -lf "${key}.pub")"
if [ "${APPEND:-}" = "1" ]; then
  confirm "Add the new line to approvers.txt?" || { echo "approvers.txt unchanged."; exit 1; }
  printf '%s\n' "$new_line" >> approvers.txt
  echo "Added. Commit this with the rotation, or as its own commit signed by an approver key already listed."
  exit 0
fi
confirm "Replace approvers.txt with the new line?" || { echo "approvers.txt unchanged."; exit 1; }
printf '%s\n' "$new_line" > approvers.txt

echo
echo "Run these yourself, in order. The first commit must be signed with the OLD key, because approvers.txt as"
echo "of a commit's parent decides who may sign it (SPEC-001-R12)."
echo
echo "1. Commit approvers.txt with the applied proposals, signed with the old key, and check it:"
echo "git add approvers.txt"
echo "git status --short"
echo "git commit -S -m \"spec: approver keys live on a security key; touch and PIN on every signature\" --trailer \"Spec: SPEC-001-R12\" --trailer \"Spec: SPEC-001-R39\""
echo "npm run checks"
echo "git show HEAD:approvers.txt"
echo "git push origin HEAD:main"
echo "Before pushing, check that approvers.txt names only your principal and the new key above."
echo
echo "2. From now on, sign with the security key in this repository:"
echo "git config --local gpg.format ssh"
echo "git config --local gpg.ssh.program ${keygen}"
echo "git config --local user.signingkey ${key}"
echo
echo "3. Let GitHub show the new key's signatures as Verified:"
echo "gh auth refresh -h github.com -s admin:ssh_signing_key"
echo "gh ssh-key add ${key}.pub --type signing --title \"who-gets-the-keys approver (security key)\""
echo
echo "4. Take the old key out of reach of local agent sessions before opening one again: remove it from ssh-agent"
echo "   with ssh-add -d, and move its file to offline storage. Do not delete it: rewriting history needs it for the"
echo "   commits up to and including the rotation. It can no longer approve a new change here."
