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
echo "Written and staged. Before you sign, reconcile practices.yaml in this same commit:"
echo "set source.sha256 to ${new_sha}, set source.exported to the new export time, and fix any slide citations the changed lines move."
echo "One signed commit holds the snapshot and its reconciliation, so main can accept it whether GitHub checks only the tip or every commit."
echo
echo "git add practices.yaml"
echo "npm run check:slides"
echo "git commit -S -m \"spec: refresh slide snapshot to body-sha256 ${new_sha:0:12}\""
echo "git -c gpg.ssh.allowedSignersFile=approvers.txt verify-commit HEAD"
echo
echo "Then push it to a candidate branch, wait for that pipeline run, and move main to the exact commit it checked."
echo "main refuses that commit until its checks job has passed (SPEC-001-R41):"
echo
print_landing "candidate/slides-${new_sha:0:12}"
