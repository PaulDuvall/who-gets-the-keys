#!/usr/bin/env bash
# Builds the practices carousel from carousel.yaml and checks it (decision 0009).
#   1. Downloads each font in fonts.json into fonts/ (ignored), unless a copy with the pinned SHA-256 is already there,
#      and refuses any file whose SHA-256 differs. Nothing else is downloaded.
#   2. render.mjs writes out/: the PDF, a PNG per page, a contact sheet and the one-page poster.
#   3. verify.mjs runs every check and writes out/report.md. It exits nonzero on any failure, so this script does too.
# Needs: node, curl, the root node_modules (for yaml), Playwright with Chromium (factory-video/playwright.mjs), and
# pdfinfo, pdffonts and pdftotext from poppler.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts

# The pins, one "file url sha256" line per font. The digest is checked by node, the same on macOS and Linux.
pins="$(node -e '
  const { fonts } = JSON.parse(require("fs").readFileSync("fonts.json", "utf8"));
  for (const f of fonts) {
    if (!/^[A-Za-z0-9._-]+\.ttf$/.test(f.file) || !/^https:\/\/\S+$/.test(f.url)) throw new Error(`bad entry ${f.file}`);
    console.log(`${f.file} ${f.url} ${f.sha256}`);
  }')"
digest() {
  node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"
}
while read -r file url want; do
  [ -n "$file" ] || continue
  if [ -f "fonts/$file" ] && [ "$(digest "fonts/$file")" = "$want" ]; then
    continue
  fi
  rm -f "fonts/$file" "fonts/$file.part"
  curl -fsSL --proto '=https' --retry 3 --max-time 120 -o "fonts/$file.part" "$url"
  got="$(digest "fonts/$file.part")"
  if [ "$got" != "$want" ]; then
    rm -f "fonts/$file.part"
    echo "CHECK fonts FAILED: $file has SHA-256 $got, and fonts.json pins $want" >&2
    exit 1
  fi
  mv "fonts/$file.part" "fonts/$file"
  echo "Downloaded $file ($want)"
done <<EOF
$pins
EOF

node render.mjs
node verify.mjs
