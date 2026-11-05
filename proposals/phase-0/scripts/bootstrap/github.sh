#!/usr/bin/env bash
set -euo pipefail

repo="${REPO:-PaulDuvall/who-gets-the-keys}"
ruleset="protect main"

usage() {
  echo "usage: scripts/bootstrap/github.sh [--vars]"
  echo "  default  read-only workflow token, SHA pinning required, environments sandbox and probe (main only),"
  echo "           merge commits as the only merge method (if GitHub accepts this with linear history required, no pull request"
  echo "           merges in GitHub; a refusal is reported and the script exits 1),"
  echo "           ruleset \"${ruleset}\" blocking force pushes, deletion and merge commits on the default branch, and"
  echo "           requiring the pipeline's checks job, from GitHub Actions, on a commit before main moves to it (SPEC-001-R41)."
  echo "           The ruleset names the GitHub Actions app ID read from main's checks run. If main has none yet, every"
  echo "           other setting is applied, the ruleset is skipped and the script exits 1."
  echo "           Once the repository is public, also: you as required reviewer on sandbox and probe,"
  echo "           secret scanning, push protection and private vulnerability reporting."
  echo "  --vars   also set DEPLOY_ROLE_ARN, TRIAGE_ROLE_ARN, PROBE_ROLE_ARN from infra/sandbox outputs and TRIAGE_MODEL from \$TRIAGE_MODEL."
  echo "           Refused on a public repository until sandbox and probe each have a required reviewer."
}

confirm() { read -r -p "$1 [y/N] " answer; [ "$answer" = "y" ]; }

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  ""|--vars) ;;
  *) usage; exit 2 ;;
esac

gh auth status >/dev/null
visibility="$(gh api "repos/${repo}" --jq .visibility)"
me="$(gh api user --jq .login)"
me_id="$(gh api user --jq .id)"
echo "Repository: ${repo} (${visibility})"
echo
echo "Current settings:"
gh api "repos/${repo}/actions/permissions/workflow" --jq '"  default workflow token: \(.default_workflow_permissions), can approve reviews: \(.can_approve_pull_request_reviews)"'
gh api "repos/${repo}/actions/permissions" --jq '"  actions enabled: \(.enabled), allowed: \(.allowed_actions), SHA pinning required: \(.sha_pinning_required // false)"'
gh api "repos/${repo}/environments" --jq '.environments[] | "  environment \(.name): required reviewers: \([.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[]?.reviewer.login] | if length == 0 then "none" else join(", ") end)"'
gh api "repos/${repo}" --jq '"  merge methods: merge commit \(.allow_merge_commit), squash \(.allow_squash_merge), rebase \(.allow_rebase_merge)"'
gh api "repos/${repo}" --jq '"  secret scanning: \(.security_and_analysis.secret_scanning.status // "unavailable"), push protection: \(.security_and_analysis.secret_scanning_push_protection.status // "unavailable")"'
reporting="$(gh api "repos/${repo}/private-vulnerability-reporting" --jq .enabled 2>/dev/null || echo unavailable)"
echo "  private vulnerability reporting: ${reporting}"
ruleset_id="$(gh api "repos/${repo}/rulesets?includes_parents=false" --paginate \
  --jq ".[] | select(.name == \"${ruleset}\") | .id")"
if [ -n "$ruleset_id" ]; then
  gh api "repos/${repo}/rulesets/${ruleset_id}" \
    --jq '"  ruleset \"\(.name)\": id \(.id), rules: \([.rules[].type] | join(", ")), bypass actors: \(.bypass_actors | length)"'
else
  echo "  ruleset \"${ruleset}\": absent"
fi
echo
echo "Will set:"
echo "  default workflow token: read, can approve reviews: false"
echo "  actions enabled: true, allowed: all, SHA pinning required: true"
echo "  merge methods: merge commit true, squash false, rebase false, read back after the change."
echo "    If GitHub accepts this with linear history required, no pull request merges in GitHub"
echo "  environments sandbox and probe, each deployable from branch main only"
echo "  ruleset \"${ruleset}\": default branch, blocks force pushes, deletion and merge commits, requires status check"
echo "    checks from GitHub Actions on the commit itself, no bypass actors, active (created or updated)."
echo "    The app ID is read from main's checks run just before the ruleset step. If main has none yet, the ruleset is skipped"
if [ "$visibility" = "public" ]; then
  echo "  environments sandbox and probe: required reviewer ${me}, self-review allowed because your pushes deploy as you"
  echo "  secret scanning and push protection: enabled"
  echo "  private vulnerability reporting: enabled"
else
  echo "  skipped while ${visibility}: required reviewers, secret scanning, push protection, private vulnerability reporting."
  echo "  Run this script again right after making the repository public, before the next push to main."
fi
confirm "Apply these settings?" || { echo "Nothing changed."; exit 1; }

gh api -X PUT "repos/${repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/${repo}/actions/permissions" \
  -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
reviewers=""
if [ "$visibility" = "public" ]; then
  reviewers=", \"reviewers\": [{\"type\": \"User\", \"id\": ${me_id}}], \"prevent_self_review\": false"
fi
for env in sandbox probe; do
  gh api -X PUT "repos/${repo}/environments/${env}" --input - >/dev/null <<JSON
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}${reviewers}}
JSON
  if ! gh api "repos/${repo}/environments/${env}/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main; then
    gh api -X POST "repos/${repo}/environments/${env}/deployment-branch-policies" -f name=main -f type=branch >/dev/null
  fi
  if [ -n "$reviewers" ]; then
    echo "environment ${env}: branch main only, required reviewer ${me}"
  else
    echo "environment ${env}: branch main only"
  fi
done

if [ "$visibility" = "public" ]; then
  gh api -X PATCH "repos/${repo}" --input - >/dev/null <<'JSON'
{"security_and_analysis": {"secret_scanning": {"status": "enabled"}, "secret_scanning_push_protection": {"status": "enabled"}}}
JSON
  gh api -X PUT "repos/${repo}/private-vulnerability-reporting" >/dev/null
  echo "secret scanning, push protection, private vulnerability reporting: enabled"
fi

# GitHub's docs say linear history needs squash or rebase merging allowed, so a refusal here must not stop the ruleset.
merge_refused=""
if ! gh api -X PATCH "repos/${repo}" -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false >/dev/null; then
  merge_refused="yes"
fi
merge_methods="$(gh api "repos/${repo}" --jq '"\(.allow_merge_commit) \(.allow_squash_merge) \(.allow_rebase_merge)"' || true)"
[ "$merge_methods" = "true false false" ] || merge_refused="yes"
if [ -n "$merge_refused" ]; then
  echo "merge methods: not changed as asked. Read back merge commit, squash, rebase: ${merge_methods:-unreadable}"
else
  echo "merge methods: merge commits only; squash and rebase merges off"
fi

actions_app="$(gh api "repos/${repo}/commits/main/check-runs?check_name=checks" \
  --jq '[.check_runs[] | select(.app.slug == "github-actions") | .app.id][0] // empty')"
ruleset_skipped=""
if [ -z "$actions_app" ]; then
  ruleset_skipped="yes"
  echo "ruleset \"${ruleset}\": skipped, because main has no checks run from GitHub Actions to read the app ID from"
else
  echo "GitHub Actions app ID, from main's checks run: ${actions_app}"
  ruleset_body="$(cat <<JSON
{
  "name": "${ruleset}",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {"type": "required_status_checks", "parameters": {
      "strict_required_status_checks_policy": true,
      "required_status_checks": [{"context": "checks", "integration_id": ${actions_app}}]
    }}
  ]
}
JSON
)"
  if [ -n "$ruleset_id" ]; then
    gh api -X PUT "repos/${repo}/rulesets/${ruleset_id}" --input - >/dev/null <<<"$ruleset_body"
    echo "ruleset \"${ruleset}\": updated"
  else
    gh api -X POST "repos/${repo}/rulesets" --input - >/dev/null <<<"$ruleset_body"
    echo "ruleset \"${ruleset}\": created"
  fi
fi

if [ "${1:-}" = "--vars" ]; then
  if [ "$visibility" = "public" ]; then
    for env in sandbox probe; do
      count="$(gh api "repos/${repo}/environments/${env}" --jq '[.protection_rules[]? | select(.type == "required_reviewers")] | length')"
      [ "$count" -gt 0 ] || { echo "Environment ${env} has no required reviewer. Variables not set."; exit 1; }
    done
  else
    echo
    echo "The repository is ${visibility}, so deploys stop at the attestation check (D06)."
    echo "Make it public, then run this script again before the next push to main so sandbox and probe get a required reviewer."
  fi
  outputs="$(terraform -chdir=infra/sandbox output -json)"
  deploy="$(jq -r .deploy_role_arn.value <<<"$outputs")"
  triage="$(jq -r .triage_role_arn.value <<<"$outputs")"
  probe="$(jq -r .probe_role_arn.value <<<"$outputs")"
  model="${TRIAGE_MODEL:?set TRIAGE_MODEL to the Bedrock model or inference profile ID for triage}"
  echo
  echo "Will set repository variables:"
  printf '  DEPLOY_ROLE_ARN=%s\n  TRIAGE_ROLE_ARN=%s\n  PROBE_ROLE_ARN=%s\n  TRIAGE_MODEL=%s\n' "$deploy" "$triage" "$probe" "$model"
  confirm "Set these variables?" || { echo "Variables not set."; exit 1; }
  gh variable set DEPLOY_ROLE_ARN --repo "$repo" --body "$deploy"
  gh variable set TRIAGE_ROLE_ARN --repo "$repo" --body "$triage"
  gh variable set PROBE_ROLE_ARN --repo "$repo" --body "$probe"
  gh variable set TRIAGE_MODEL --repo "$repo" --body "$model"
fi

echo
echo "Done. Verify:"
echo "gh api repos/${repo}/actions/permissions"
echo "gh api repos/${repo} --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'"
echo "gh api repos/${repo}/environments --jq '.environments[] | {name, rules: [.protection_rules[].type]}'"
echo "gh api repos/${repo}/rules/branches/main --jq '.[].type'"
echo "gh api repos/${repo}/rules/branches/main --jq '.[] | select(.type == \"required_status_checks\") | .parameters'"
if [ "$visibility" = "public" ]; then
  echo "gh api repos/${repo} --jq .security_and_analysis"
  echo "gh api repos/${repo}/private-vulnerability-reporting"
fi
if [ -n "$merge_refused" ]; then
  echo
  echo "GitHub refused squash and rebase merges off while linear history is required. Squash and rebase merges stay on,"
  echo "so do not merge pull requests in GitHub. Record this in docs/verification.md."
fi
if [ -n "$ruleset_skipped" ]; then
  echo
  echo "Every other setting is applied. The ruleset \"${ruleset}\" is not: main has no checks run from GitHub Actions yet."
  echo "Wait for main's pipeline run to start, or push to main if you have not yet, then run this script again to apply the ruleset."
fi
if [ -n "$merge_refused" ] || [ -n "$ruleset_skipped" ]; then
  exit 1
fi
