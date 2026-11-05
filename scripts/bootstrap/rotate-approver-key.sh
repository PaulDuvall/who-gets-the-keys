#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/rotate-approver-key.sh"
  echo "  Creates the approver's FIDO2 security key, proves that its test signature carries the flags the signatures"
  echo "  check requires, and writes it to approvers.txt. It never commits, pushes or uploads. Each signature needs a"
  echo "  touch, and a PIN too while REQUIRED_SIGNATURE_FLAGS in scripts/checks.ts asks for one. The owner decision of"
  echo "  2026-11-05 set it to a touch only."
  echo "  Run it from the repository root on the approver's machine, with the security key plugged in, after the"
  echo "  approver-key proposals are in the working tree (docs/decisions/0003-approver-key.md)."
  echo "  Close every Claude Code session first and keep them closed until the last step: until then the old key"
  echo "  can still approve, and an agent session on this machine could reach it."
  echo "  Environment:"
  echo "  KEY_TYPE           ed25519-sk (default), or ecdsa-sk if creating the key reports \"requested feature not supported\""
  echo "  KEY_FILE           default ~/.ssh/id_ed25519_sk_approver, or ~/.ssh/id_ecdsa_sk_approver for ecdsa-sk"
  echo "  VERIFY_REQUIRED=1  create the key with -O verify-required, so every signature also needs its PIN."
  echo "                     The security key must support CTAP 2.1 credProtect. It defaults to 1, and 0 is refused,"
  echo "                     while scripts/checks.ts requires a PIN"
  echo "  RESIDENT=1         store the key on the security key as well, so a new machine can fetch it with"
  echo "                     ssh-keygen -K. This also needs credProtect"
  echo "  APPEND=1           add a backup key as a second approvers.txt line instead of replacing the file"
  echo "  SSH_KEYGEN         the ssh-keygen to use"
}

confirm() { read -r -p "$1 [y/N] " answer; [ "$answer" = "y" ]; }

# Prints one command that lands HEAD through a candidate branch: main moves only to a commit whose checks passed (SPEC-001-R41).
# Every step is chained with &&, so a refused candidate push, no run after 5 minutes or a failed run stops it before main.
print_landing() {
  local branch="$1"
  echo "commit=\"\$(git rev-parse HEAD)\" && git push origin \"\${commit}:refs/heads/${branch}\" && run=\"\" && for attempt in \$(seq 60); do run=\"\$(gh run list --workflow pipeline.yml --branch ${branch} --commit \"\$commit\" --limit 1 --json databaseId --jq '.[0].databaseId // empty')\"; [ -n \"\$run\" ] && break; sleep 5; done && { [ -n \"\$run\" ] || { echo \"No pipeline run for \${commit} on ${branch} after 5 minutes.\"; false; }; } && gh run watch \"\$run\" --exit-status && git push origin \"\${commit}:refs/heads/main\" && git push origin --delete ${branch}"
  echo
  echo "If the run fails, fix it in a new commit on top and run the command again. If you amend or rebase instead,"
  echo "for example because main moved, delete the candidate branch first, or its push is refused:"
  echo "git push origin --delete ${branch}"
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage; exit 1 ;;
esac

key_type="${KEY_TYPE:-ed25519-sk}"
case "$key_type" in
  ed25519-sk|ecdsa-sk) ;;
  *) echo "KEY_TYPE must be ed25519-sk or ecdsa-sk, not ${key_type}."; exit 1 ;;
esac
[ -f approvers.txt ] && [ -f scripts/checks.ts ] || { echo "Run this from the repository root."; exit 1; }
grep -q "export const REQUIRED_SIGNATURE_FLAGS" scripts/checks.ts || {
  echo "scripts/checks.ts cannot read security-key flags yet. Move the approver-key proposals into place first."
  exit 1
}

# VERIFY_REQUIRED follows the PIN bit (0x04) of REQUIRED_SIGNATURE_FLAGS, so raising that constant to 0x05 is the only
# change a later tightening needs: the next key this script makes then asks for a PIN too.
pin_required="$(node --input-type=module -e '
  import { REQUIRED_SIGNATURE_FLAGS } from "./scripts/checks.ts";
  console.log((REQUIRED_SIGNATURE_FLAGS & 0x04) === 0 ? 0 : 1);
')"
verify_required="${VERIFY_REQUIRED:-$pin_required}"
case "$verify_required" in
  0|1) ;;
  *) echo "VERIFY_REQUIRED must be 1, 0 or unset, not ${verify_required}."; exit 1 ;;
esac
if [ "$pin_required" = "1" ] && [ "$verify_required" = "0" ]; then
  echo "REQUIRED_SIGNATURE_FLAGS in scripts/checks.ts requires a PIN, so a key made with VERIFY_REQUIRED=0 could not"
  echo "approve. Leave VERIFY_REQUIRED unset."
  exit 1
fi
if [ "$verify_required" = "1" ]; then
  asked="a touch and the key's PIN"
else
  asked="a touch only, with no PIN"
fi

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
  echo "${keygen} is OpenSSH ${major}.${minor}. This script needs OpenSSH 8.4 or later with security-key support."
  exit 1
fi
echo "Using ${keygen} (OpenSSH ${major}.${minor})."

old_line="$(grep -v '^[[:space:]]*#' approvers.txt | grep -v '^[[:space:]]*$' | head -n 1)"
principal="${old_line%% *}"
[ -n "$principal" ] || { echo "approvers.txt has no approver line to take the principal from."; exit 1; }
echo "Approver principal: ${principal}"

key="${KEY_FILE:-$HOME/.ssh/id_${key_type//-/_}_approver}"
if [ -f "$key" ]; then
  echo "Using the existing key ${key}. KEY_TYPE and VERIFY_REQUIRED do not change it; the test signature shows its flags."
  sign_prompt="Touch the key when it blinks, and enter its PIN if asked."
else
  sign_prompt="It asks for ${asked}: touch the key when it blinks."
  options=(-O application=ssh:who-gets-the-keys)
  [ "$verify_required" = "1" ] && options+=(-O verify-required)
  [ "${RESIDENT:-}" = "1" ] && options+=(-O resident)
  echo "Will create ${key}: ${key_type}, ${options[*]}. Each signature will need ${asked}."
  confirm "Create it? Touch the key when it blinks, and enter its PIN if ssh-keygen asks for it." || { echo "Nothing changed."; exit 1; }
  if ! "$keygen" -t "$key_type" "${options[@]}" -C "who-gets-the-keys approver" -f "$key"; then
    echo "Creating the key failed. If ssh-keygen printed \"requested feature not supported\", the cause may be:"
    [ "$key_type" = "ed25519-sk" ] && echo "- no Ed25519 support on the security key: run this again with KEY_TYPE=ecdsa-sk."
    if [ "$verify_required" = "1" ] && [ "$pin_required" = "1" ]; then
      echo "- no credProtect, which verify-required needs. scripts/checks.ts requires a PIN, so use a security key that has it."
    elif [ "$verify_required" = "1" ]; then
      echo "- no credProtect, which verify-required needs: run this again without VERIFY_REQUIRED=1."
    fi
    [ "${RESIDENT:-}" = "1" ] && echo "- no credProtect, which a resident key needs: run this again without RESIDENT=1."
    echo "- a libfido2 older than 1.5.0 on this machine, or a device that refuses this algorithm or option."
    echo "To list the device's algorithms and extensions, run fido2-token -L, then fido2-token -I on the device it lists."
    exit 1
  fi
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf 'who-gets-the-keys approver key check\n' > "$work/message"
new_line="${principal} namespaces=\"git\" $(cut -d' ' -f1,2 "${key}.pub")"
printf '%s\n' "$new_line" > "$work/allowed_signers"
echo
echo "Signing a test message. ${sign_prompt}"
"$keygen" -Y sign -n git -f "$key" "$work/message"
"$keygen" -Y verify -f "$work/allowed_signers" -I "$principal" -n git -s "$work/message.sig" < "$work/message"
if ! node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { REQUIRED_SIGNATURE_FLAGS, flagWords, lacksRequiredFlags, sshSignature } from "./scripts/checks.ts";
  const required = REQUIRED_SIGNATURE_FLAGS | (process.argv[2] === "1" ? 0x04 : 0);
  const sig = sshSignature(readFileSync(process.argv[1], "utf8"));
  console.log(`Signature: ${sig?.keyType ?? "unreadable"}, flags ${sig?.flags ?? "none"} (1 is a touch, 4 a PIN, 5 both).`);
  console.log(`Required: ${flagWords(required)}.`);
  process.exit(lacksRequiredFlags(sig, required) || sig?.flags === undefined ? 1 : 0);
' "$work/message.sig" "$verify_required"; then
  echo "That signature lacks a required flag, so it would not pass. Recreate the key with a new KEY_FILE, and do not"
  echo "use -O no-touch-required. If a PIN is required, set VERIFY_REQUIRED=1, on a security key that supports it."
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
  echo "Added. If you also replaced the key in this working tree, do not commit yet: run the rotation's step 1 commands, which commit both lines."
  echo "Otherwise commit it on its own, signed by an approver key already listed, and check it:"
  echo "git add approvers.txt"
  echo "git status --short"
  echo "git commit -S -m \"approvers: add a backup security key\" --trailer \"Spec: SPEC-001-R12\""
  echo "npm run checks"
  echo "git show HEAD:approvers.txt"
  echo "Before pushing, check that approvers.txt lists the approver key and the new backup key above."
  echo "Then push it to a candidate branch, wait for that pipeline run, and move main to the exact commit it checked:"
  echo
  print_landing "candidate/approver-key-backup"
  exit 0
fi
confirm "Replace approvers.txt with the new line?" || { echo "approvers.txt unchanged."; exit 1; }
printf '%s\n' "$new_line" > approvers.txt

echo
echo "Run these yourself, in order. The first commit must be signed with the OLD key, because approvers.txt as"
echo "of a commit's parent decides who may sign it (SPEC-001-R12)."
echo
echo "1. Commit approvers.txt, signed with the old key, and check it:"
echo "git add approvers.txt"
echo "git status --short"
echo "git commit -S -m \"approvers: rotate the approver key to a new security key\" --trailer \"Spec: SPEC-001-R12\""
echo "npm run checks"
echo "git show HEAD:approvers.txt"
echo "Before pushing, check that approvers.txt names only your principal and the new key above."
echo "Then push it to a candidate branch, wait for that pipeline run, and move main to the exact commit it checked."
echo "main refuses that commit until its checks job has passed (SPEC-001-R41):"
print_landing "candidate/approver-key-rotation"
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
