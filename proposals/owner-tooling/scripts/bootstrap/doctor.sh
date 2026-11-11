#!/usr/bin/env bash
# Checks the owner's machine before an owner step, and prints the exact fix for each gap (SPEC-001-R218). It changes
# nothing. land.sh runs it first (SPEC-001-R219). Lessons L25 to L28 in docs/notes/owner-queue-lessons-2026-11-10.md.
# Runs on macOS's bash 3.2 and on Linux: no mapfile, no associative arrays, no case-changing expansions.
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/doctor.sh [--for all|land|push|aws]"
  echo "       scripts/bootstrap/doctor.sh --node-bin"
  echo "  Checks this machine for an owner step and prints one line per check: ok, or fix with the command that fixes it."
  echo "  It changes nothing. It exits 0 when every check passed, and 1 when something needs fixing."
  echo "  --for all   every check below (the default)"
  echo "  --for land  what land.sh needs to sign: Node.js, gh, git, ssh-keygen and one security key"
  echo "  --for push  what land.sh --to-main and --delivery need: gh and git"
  echo "  --for aws   what aws-setup.sh and break-glass need: one YubiKey with OATH, and the AWS profiles"
  echo "  --node-bin  print only the directory of a Node.js in package.json's engines range: the one on PATH, or else"
  echo "              Homebrew's node@<major>. Exits 1 when there is none"
  echo "  The AWS checks read SANDBOX_PROFILE and MANAGEMENT_PROFILE, as aws-setup.sh does, and are skipped when both are unset."
}

for_what="all"
node_bin_only=0
case "${1:-}" in
  "") [ $# -eq 0 ] || { usage >&2; exit 2; } ;;
  -h|--help) usage; exit 0 ;;
  --node-bin) [ $# -eq 1 ] || { usage >&2; exit 2; }; node_bin_only=1 ;;
  --for)
    [ $# -eq 2 ] || { usage >&2; exit 2; }
    case "$2" in
      all|land|push|aws) for_what="$2" ;;
      *) usage >&2; exit 2 ;;
    esac
    ;;
  *) usage >&2; exit 2 ;;
esac

top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$top" ] || { echo "Run this inside the repository." >&2; exit 2; }

fixes=0
ok() { printf 'ok    %s\n' "$1"; }
note() { printf 'note  %s\n' "$1"; shift; [ $# -eq 0 ] || printf '      %s\n' "$@"; }
# fix "<what is wrong>" "<command or step>"...: one gap, then each line of its fix, indented.
fix() {
  fixes=$((fixes + 1))
  printf 'fix   %s\n' "$1"
  shift
  [ $# -eq 0 ] || printf '      %s\n' "$@"
}

# version_at_least <version> <minimum>: both "X.Y.Z"; succeeds when <version> is not below <minimum>.
version_at_least() {
  local a1 a2 a3 b1 b2 b3
  IFS=. read -r a1 a2 a3 <<< "$1"
  IFS=. read -r b1 b2 b3 <<< "$2"
  [ "$a1" -gt "$b1" ] && return 0
  [ "$a1" -lt "$b1" ] && return 1
  [ "$a2" -gt "$b2" ] && return 0
  [ "$a2" -lt "$b2" ] && return 1
  [ "$a3" -ge "$b3" ]
}

# node_version <node>: prints that node's version without the v, or nothing when it is not a release version.
node_version() {
  local v
  v="$("$1" --version 2>/dev/null || true)"
  v="${v#v}"
  case "$v" in
    *[!0123456789.]*|"") return 0 ;;
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$v" ;;
  esac
}

# in_range <version>: succeeds when <version> is in package.json's engines range, >=min <max.
in_range() { [ -n "$1" ] && version_at_least "$1" "$min" && [ "${1%%.*}" -lt "$max" ]; }

engines="$(sed -n 's/^[[:space:]]*"node":[[:space:]]*">=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\) <\([0-9][0-9]*\)",\{0,1\}[[:space:]]*$/\1 \2/p' "$top/package.json" 2>/dev/null | head -n 1 || true)"
min=""
max=""
[ -z "$engines" ] || read -r min max <<< "$engines"

# keg_node: prints the bin directory of Homebrew's node@<major> for the engines range's highest major, when that node
# is in range. Homebrew installs node@<major> keg-only, so it is on PATH only where a shell profile puts it there.
keg_node() {
  local major prefix dir
  major=$((max - 1))
  for prefix in "${HOMEBREW_PREFIX:-}" /opt/homebrew /usr/local; do
    [ -n "$prefix" ] || continue
    dir="${prefix}/opt/node@${major}/bin"
    if [ -x "$dir/node" ] && in_range "$(node_version "$dir/node")"; then
      printf '%s' "$dir"
      return 0
    fi
  done
  return 1
}

# path_node: prints the bin directory of the node on PATH when it is in range.
path_node() {
  local found
  found="$(command -v node 2>/dev/null || true)"
  [ -n "$found" ] && in_range "$(node_version "$found")" || return 1
  printf '%s' "${found%/*}"
}

if [ "$node_bin_only" = 1 ]; then
  [ -n "$engines" ] || exit 1
  path_node || keg_node || exit 1
  printf '\n'
  exit 0
fi

check_node() {
  local found version dir shown_version
  if [ -z "$engines" ]; then
    fix "package.json's engines.node is not of the form \">=X.Y.Z <N\", so no Node.js version can be checked." \
      "Restore package.json from main."
    return 0
  fi
  found="$(command -v node 2>/dev/null || true)"
  version=""
  shown_version="missing"
  if [ -n "$found" ]; then
    version="$(node_version "$found")"
    shown_version="${version:-$("$found" --version 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9.+-' || true), not a release version}"
  fi
  if in_range "$version"; then
    ok "Node.js ${version} is in >=${min} <${max}"
  elif dir="$(keg_node)"; then
    ok "Node.js $(node_version "$dir/node") from ${dir} is in >=${min} <${max}"
    note "The node first on PATH is ${shown_version}. land.sh puts ${dir} first on PATH itself." \
      "For other commands, in this terminal:" "export PATH=\"${dir}:\$PATH\""
  else
    fix "No Node.js in >=${min} <${max}: the node on PATH is ${shown_version}, and Homebrew has no node@$((max - 1))." \
      "brew install node@$((max - 1))"
  fi
}

check_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    fix "The GitHub CLI, gh, is not installed." "brew install gh" "gh auth login"
  elif ! gh auth status >/dev/null 2>&1; then
    fix "gh is not signed in." "gh auth login"
  else
    ok "gh is signed in"
  fi
}

check_git() {
  local version major minor
  version="$(git --version 2>/dev/null | sed -n 's/^git version \([0-9]*\)\.\([0-9]*\).*/\1 \2/p')"
  read -r major minor <<< "${version:-0 0}"
  if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 34 ]; }; then
    fix "git is ${major}.${minor}. SSH signatures and commit trailers need 2.34 or later." "brew install git"
  else
    ok "git ${major}.${minor}"
  fi
}

# check_signer: the program git signs with must be able to use a security key. git runs gpg.ssh.program, or ssh-keygen.
# The OpenSSH it belongs to lists the key types it supports with ssh -Q key; the ssh beside it is asked first.
check_signer() {
  local program found ssh_bin types
  program="$(git config --get gpg.ssh.program 2>/dev/null || true)"
  [ -n "$program" ] || program="ssh-keygen"
  found="$(command -v "$program" 2>/dev/null || true)"
  if [ -z "$found" ]; then
    fix "git signs with ${program}, which is not installed." "brew install openssh"
    return 0
  fi
  ssh_bin="ssh"
  case "$found" in
    */*) [ ! -x "${found%/*}/ssh" ] || ssh_bin="${found%/*}/ssh" ;;
  esac
  types="$("$ssh_bin" -Q key 2>/dev/null || true)"
  if ! printf '%s\n' "$types" | grep -qxF 'sk-ssh-ed25519@openssh.com'; then
    fix "git signs with ${found}, whose OpenSSH lists no security-key type (sk-ssh-ed25519@openssh.com)." \
      "brew install openssh" "git config gpg.ssh.program \"\$(brew --prefix)/bin/ssh-keygen\""
    return 0
  fi
  ok "git signs with ${found}, which supports security keys"
  if [ "$(uname -s 2>/dev/null || true)" = Darwin ] && [ "$found" = /usr/bin/ssh-keygen ] && [ -z "${SSH_SK_PROVIDER:-}" ]; then
    note "That is macOS's own ssh-keygen. If signing says \"internal security key support not enabled\", use Homebrew's:" \
      "brew install openssh" "git config gpg.ssh.program \"\$(brew --prefix)/bin/ssh-keygen\""
  fi
}

# check_key <need OATH>: exactly one YubiKey plugged in, so a touch goes to the key that holds the approver key or the
# code, and ykman need not choose (lesson L27). With an argument, its OATH application must be enabled too.
check_key() {
  local count info
  if ! command -v ykman >/dev/null 2>&1; then
    fix "ykman, the YubiKey Manager CLI, is not installed." "brew install ykman"
    return 0
  fi
  count="$(ykman list 2>/dev/null | grep -c . || true)"
  case "$count" in
    0) fix "No YubiKey is plugged in." "Plug in the YubiKey that holds the approver key, then run this again." ;;
    1)
      ok "one YubiKey is plugged in"
      if [ $# -gt 0 ]; then
        # One column per interface: USB, then NFC on keys that have it. USB is the one in use here.
        info="$(ykman info 2>/dev/null || true)"
        if printf '%s\n' "$info" | grep -Eq '^OATH[[:space:]]+Enabled([[:space:]]|$)'; then
          ok "its OATH application is enabled, for the break-glass code"
        else
          fix "That YubiKey's OATH application is not enabled, so it cannot give the break-glass code." \
            "ykman config usb --enable OATH"
        fi
      fi
      ;;
    *) fix "${count} YubiKeys are plugged in, so a touch may go to the wrong one." \
      "Unplug every one but the YubiKey that holds the approver key, then run this again." ;;
  esac
}

# login_profile <profile>: the profile to sign in to. A role profile takes its credentials from its source_profile,
# so signing in to the role profile itself fails (lesson L28).
login_profile() {
  local source
  source="$(aws configure get source_profile --profile "$1" 2>/dev/null || true)"
  printf '%s' "${source:-$1}"
}

check_aws() {
  local name profile login
  if [ -z "${SANDBOX_PROFILE:-}${MANAGEMENT_PROFILE:-}" ]; then
    note "AWS profiles not checked: set SANDBOX_PROFILE and MANAGEMENT_PROFILE, as for aws-setup.sh, to check them."
    return 0
  fi
  if ! command -v aws >/dev/null 2>&1; then
    fix "The AWS CLI is not installed." "brew install awscli"
    return 0
  fi
  for name in SANDBOX_PROFILE MANAGEMENT_PROFILE; do
    profile="${!name:-}"
    [ -n "$profile" ] || continue
    if aws sts get-caller-identity --profile "$profile" --query Arn --output text >/dev/null 2>&1; then
      ok "AWS profile ${profile} (${name}) has working credentials"
      continue
    fi
    login="$(login_profile "$profile")"
    if [ "$login" = "$profile" ]; then
      fix "AWS profile ${profile} (${name}) has no working credentials." "aws sso login --profile ${profile}"
    else
      fix "AWS profile ${profile} (${name}) has no working credentials. It takes them from profile ${login}." \
        "aws sso login --profile ${login}"
    fi
  done
}

case "$for_what" in
  push) check_gh; check_git ;;
  land) check_node; check_gh; check_git; check_signer; check_key ;;
  aws) check_key oath; check_aws ;;
  all) check_node; check_gh; check_git; check_signer; check_key oath; check_aws ;;
esac

if [ "$fixes" = 0 ]; then
  echo "Doctor: ready."
  exit 0
fi
echo "Doctor: ${fixes} to fix. Fix them, then run this again."
exit 1
