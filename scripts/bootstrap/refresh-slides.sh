#!/usr/bin/env bash
set -euo pipefail

deck_id="19RnjfRhGtxNv-KKmLKdpjWcheoN15Vvs1eWpGXjuDbQ"
deck_url="https://docs.google.com/presentation/d/${deck_id}/"
target="specs/source-of-record/slides.txt"
proposal="proposals/source-of-record/slides.txt"
api="https://www.googleapis.com/drive/v3/files/${deck_id}"

usage() {
  echo "usage: scripts/bootstrap/refresh-slides.sh [--from-proposal]"
  echo "  default          export the deck from Google Drive (gcloud auth login --enable-gdrive-access)"
  echo "  --from-proposal  use ${proposal}, written by an agent session, after checking its header hash"
}

sha256() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }
body_of() { sed '1,/^---$/d' "$1"; }
sha_of() { body_of "$1" | sha256 | cut -d' ' -f1; }
header_sha() { sed -n 's/^body-sha256: //p' "$1"; }

cd "$(git rev-parse --show-toplevel)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
new="$work/slides.txt"

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  --from-proposal)
    [ -f "$proposal" ] || { echo "no ${proposal}"; exit 1; }
    [ "$(sha_of "$proposal")" = "$(header_sha "$proposal")" ] || { echo "${proposal}: body does not match its body-sha256 header"; exit 1; }
    cp "$proposal" "$new"
    ;;
  "")
    command -v gcloud >/dev/null || { echo "gcloud not found"; exit 1; }
    token="$(gcloud auth print-access-token)"
    modified="$(curl -sSf -H "Authorization: Bearer ${token}" "${api}?fields=modifiedTime" | sed -n 's/.*"modifiedTime": *"\([^"]*\)".*/\1/p')"
    curl -sSf -H "Authorization: Bearer ${token}" -o "$work/body.txt" "${api}/export?mimeType=text/plain"
    {
      echo "source-url: ${deck_url}"
      echo "drive-file-id: ${deck_id}"
      echo "drive-modified: ${modified}"
      echo "exported: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "export-method: Google Drive files.export, mimeType text/plain (includes speaker notes)"
      echo "body-sha256: $(sha256 < "$work/body.txt" | cut -d' ' -f1)"
      echo "---"
      cat "$work/body.txt"
    } > "$new"
    ;;
  *)
    usage
    exit 2
    ;;
esac

old_sha="$(sha_of "$target")"
new_sha="$(sha_of "$new")"
if [ "$old_sha" = "$new_sha" ]; then
  echo "${target} is already current (body-sha256 ${new_sha}). Nothing to do."
  exit 0
fi

echo "This will replace ${target}"
echo "  current body-sha256: ${old_sha}"
echo "  new body-sha256:     ${new_sha}"
echo "Changed lines:"
diff <(body_of "$target") <(body_of "$new") | grep -E '^[<>]' | cut -c1-160 || true
read -r -p "Write the new snapshot? [y/N] " answer
[ "$answer" = "y" ] || { echo "Nothing written."; exit 1; }

cp "$new" "$target"
if [ "${1:-}" = "--from-proposal" ]; then
  git rm -q --cached --ignore-unmatch "$proposal"
  rm -f "$proposal"
fi
git add "$target"

echo
echo "Written. Sign, verify and push with:"
echo
echo "git commit -S -m \"spec: refresh slide snapshot to body-sha256 ${new_sha:0:12}\""
echo "git -c gpg.ssh.allowedSignersFile=approvers.txt verify-commit HEAD"
echo "git push origin main"
echo
echo "The slides gate fails until practices.yaml carries sha256 ${new_sha}. That is intended: it forces reconciliation."
