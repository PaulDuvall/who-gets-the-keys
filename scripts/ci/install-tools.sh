#!/usr/bin/env bash
# Installs the gate CLIs at pinned versions, each checked against a pinned SHA-256 (docs/verification.md).
# Usage: scripts/ci/install-tools.sh <bin-dir>. Python tools come from scripts/ci/requirements.txt with hashes.
set -euo pipefail

bin="${1:?bin dir}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$bin"

fetch() {
  local url="$1" sha="$2" out="$work/$3"
  curl -sSfL --retry 3 -o "$out" "$url"
  echo "$sha  $out" | sha256sum -c --quiet -
}

unzip_to() { python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"; }

gh="https://github.com"
fetch "$gh/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz" \
  551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb gitleaks.tgz
tar -xzf "$work/gitleaks.tgz" -C "$bin" gitleaks

fetch "$gh/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64" \
  160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b osv-scanner
install -m 0755 "$work/osv-scanner" "$bin/osv-scanner"

fetch "https://releases.hashicorp.com/terraform/1.16.6/terraform_1.16.6_linux_amd64.zip" \
  38034b38d03096399a7a1264a14561a8029b2b496fd1f169452656e53968f1b7 terraform.zip
unzip_to "$work/terraform.zip" "$bin"

fetch "$gh/terraform-linters/tflint/releases/download/v0.64.0/tflint_linux_amd64.zip" \
  cca9d13e2e1d7a2c627af60ff899a3c9b74212899416aeb96ec764d2ef954537 tflint.zip
unzip_to "$work/tflint.zip" "$bin"

plugins="$HOME/.tflint.d/plugins/github.com/terraform-linters/tflint-ruleset-aws/0.49.0"
fetch "$gh/terraform-linters/tflint-ruleset-aws/releases/download/v0.49.0/tflint-ruleset-aws_linux_amd64.zip" \
  98a530130d33efd49408f3d0ab9198072192ede413cc2a2ce38295d0922eb1c6 ruleset.zip
mkdir -p "$plugins"
unzip_to "$work/ruleset.zip" "$plugins"
chmod 0755 "$bin/terraform" "$bin/tflint" "$plugins/tflint-ruleset-aws"

uv venv --quiet --python 3.13 "$bin/../venv"
uv pip install --quiet --require-hashes --python "$bin/../venv/bin/python" -r scripts/ci/requirements.txt
ln -sf "$bin/../venv/bin/semgrep" "$bin/semgrep"
ln -sf "$bin/../venv/bin/zizmor" "$bin/zizmor"
