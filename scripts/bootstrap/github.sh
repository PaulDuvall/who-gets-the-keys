#!/usr/bin/env bash
set -euo pipefail

repo="${REPO:-PaulDuvall/who-gets-the-keys}"
ruleset="protect main"

usage() {
  echo "usage: scripts/bootstrap/github.sh [--vars]"
  echo "  default  read-only workflow token, SHA pinning required, environments sandbox and probe (main only),"
  echo "           ruleset \"${ruleset}\" blocking force pushes and deletion of the default branch"
  echo "  --vars   also set DEPLOY_ROLE_ARN, TRIAGE_ROLE_ARN, PROBE_ROLE_ARN from infra/sandbox outputs and TRIAGE_MODEL from \$TRIAGE_MODEL"
}

confirm() { read -r -p "$1 [y/N] " answer; [ "$answer" = "y" ]; }

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  ""|--vars) ;;
  *) usage; exit 2 ;;
esac

gh auth status >/dev/null
echo "Repository: ${repo}"
echo
echo "Current settings:"
gh api "repos/${repo}/actions/permissions/workflow" --jq '"  default workflow token: \(.default_workflow_permissions), can approve reviews: \(.can_approve_pull_request_reviews)"'
gh api "repos/${repo}/actions/permissions" --jq '"  actions enabled: \(.enabled), allowed: \(.allowed_actions), SHA pinning required: \(.sha_pinning_required // false)"'
gh api "repos/${repo}/environments" --jq '"  environments: \([.environments[].name] | join(", "))"'
ruleset_id="$(gh api "repos/${repo}/rulesets?includes_parents=false" --paginate \
  --jq ".[] | select(.name == \"${ruleset}\") | .id")"
if [ -n "$ruleset_id" ]; then
  echo "  ruleset \"${ruleset}\": exists, id ${ruleset_id}"
else
  echo "  ruleset \"${ruleset}\": absent"
fi
echo
echo "Will set:"
echo "  default workflow token: read, can approve reviews: false"
echo "  actions enabled: true, allowed: all, SHA pinning required: true"
echo "  environments sandbox and probe, each deployable from branch main only"
echo "  ruleset \"${ruleset}\": default branch, blocks force pushes and deletion, no bypass actors, active (skipped if it exists)"
confirm "Apply these settings?" || { echo "Nothing changed."; exit 1; }

gh api -X PUT "repos/${repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/${repo}/actions/permissions" \
  -F enabled=true -f allowed_actions=all -F sha_pinning_required=true

for env in sandbox probe; do
  gh api -X PUT "repos/${repo}/environments/${env}" --input - >/dev/null <<JSON
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
  if ! gh api "repos/${repo}/environments/${env}/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main; then
    gh api -X POST "repos/${repo}/environments/${env}/deployment-branch-policies" -f name=main -f type=branch >/dev/null
  fi
  echo "environment ${env}: branch main only"
done

if [ -n "$ruleset_id" ]; then
  echo "ruleset \"${ruleset}\": exists, skipped"
else
  gh api -X POST "repos/${repo}/rulesets" --input - >/dev/null <<JSON
{
  "name": "${ruleset}",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}]
}
JSON
  echo "ruleset \"${ruleset}\": created"
fi

if [ "${1:-}" = "--vars" ]; then
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
echo "gh api repos/${repo}/environments --jq '.environments[].name'"
echo "gh api repos/${repo}/rules/branches/main --jq '.[].type'"
