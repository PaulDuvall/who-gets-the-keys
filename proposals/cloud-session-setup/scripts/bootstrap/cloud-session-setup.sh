#!/usr/bin/env bash
# Sets up a Claude Code cloud session's container for this repository (SPEC-001-R211). The claude.ai cloud environment's
# setup script runs it as root, from the directory that holds the checkout, when a fresh container is built:
#   if [ -f who-gets-the-keys/scripts/bootstrap/cloud-session-setup.sh ]; then bash who-gets-the-keys/scripts/bootstrap/cloud-session-setup.sh; fi
# It installs the Node.js release that package.json's engines range admits, checked against a pinned SHA-256 before
# anything is unpacked; then the pinned check CLIs from scripts/ci/install-tools.sh; then node_modules from the lockfile,
# with install scripts off. NODE_PREFIX and BIN_DIR exist for the tests; the cloud environment sets neither.
set -euo pipefail

node_version=v24.22.2
node_sha256=48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75
prefix="${NODE_PREFIX:-/opt/node24}"
bin="${BIN_DIR:-/root/.local/bin}"

cd "$(dirname "$0")/../.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -sSfL --retry 3 -o "$tmp/node.tar.xz" "https://nodejs.org/dist/${node_version}/node-${node_version}-linux-x64.tar.xz"
if ! echo "${node_sha256}  $tmp/node.tar.xz" | sha256sum -c --quiet - >/dev/null 2>&1; then
  echo "cloud-session-setup: node-${node_version}-linux-x64.tar.xz does not match its pinned SHA-256. Nothing was installed." >&2
  exit 1
fi
rm -rf "$prefix"
mkdir -p "$prefix" "$bin"
tar -xJf "$tmp/node.tar.xz" -C "$prefix" --strip-components=1
ln -sf "$prefix/bin/node" "$prefix/bin/npm" "$prefix/bin/npx" "$bin/"
PATH="$bin:$PATH" UV_VENV_CLEAR=1 scripts/ci/install-tools.sh "$bin"
PATH="$bin:$PATH" npm ci --ignore-scripts --no-audit --no-fund
echo "cloud-session-setup: node $("$bin/node" --version) in $bin, the check CLIs from scripts/ci/install-tools.sh, and node_modules from the lockfile."
