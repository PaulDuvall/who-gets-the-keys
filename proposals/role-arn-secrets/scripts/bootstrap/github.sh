#!/usr/bin/env bash
set -euo pipefail

repo="${REPO:-PaulDuvall/who-gets-the-keys}"
ruleset="protect main"

usage() {
  echo "usage: scripts/bootstrap/github.sh [--vars]"
  echo "  default  read-only workflow token, SHA pinning required, environments sandbox, probe and producer (main only),"
  echo "           merge commits as the only merge method (if GitHub accepts this with linear history required, no pull request"
  echo "           merges in GitHub; a refusal is reported and the script exits 1),"
  echo "           ruleset \"${ruleset}\" blocking force pushes, deletion and merge commits on the default branch, and"
  echo "           requiring the pipeline's checks job, from GitHub Actions, on a commit before main moves to it (SPEC-001-R41)."
  echo "           The ruleset names the GitHub Actions app ID read from main's checks run. If main has none yet, every"
  echo "           other setting is applied, the ruleset is skipped and the script exits 1."
  echo "           Once the repository is public, also: you as required reviewer on sandbox and probe (not producer,"
  echo "           whose runs only you can start; SPEC-001-R85),"
  echo "           secret scanning, push protection and private vulnerability reporting."
  echo "  --vars   also set the secrets DEPLOY_ROLE_ARN, TRIAGE_ROLE_ARN, PROBE_ROLE_ARN and PRODUCER_ROLE_ARN and the"
  echo "           variable PRODUCER_MODEL from infra/sandbox outputs, and the variable TRIAGE_MODEL from \$TRIAGE_MODEL."
  echo "           Then deletes any repository variable of those four role ARN names: GitHub masks a secret in run"
  echo "           logs and prints a variable in clear, and a role ARN holds the AWS account ID (SPEC-001-R86)."
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
echo "  environments sandbox, probe and producer, each deployable from branch main only; producer never has a reviewer"
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
# producer gets no reviewer: only the owner can start producer.yml, and its job checks the actor (SPEC-001-R83, R85).
for env in sandbox probe producer; do
  env_reviewers="$reviewers"
  [ "$env" != producer ] || env_reviewers=""
  gh api -X PUT "repos/${repo}/environments/${env}" --input - >/dev/null <<JSON
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}${env_reviewers}}
JSON
  if ! gh api "repos/${repo}/environments/${env}/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main; then
    gh api -X POST "repos/${repo}/environments/${env}/deployment-branch-policies" -f name=main -f type=branch >/dev/null
  fi
  if [ -n "$env_reviewers" ]; then
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
      [ "$count" -gt 0 ] || { echo "Environment ${env} has no required reviewer. Nothing set."; exit 1; }
    done
  else
    echo
    echo "The repository is ${visibility}, so deploys stop at the attestation check (D06)."
    echo "Make it public, then run this script again before the next push to main so sandbox and probe get a required reviewer."
  fi
  outputs="$(terraform -chdir=infra/sandbox output -json)"
  deploy="$(jq -r '.deploy_role_arn.value // empty' <<<"$outputs")"
  triage="$(jq -r '.triage_role_arn.value // empty' <<<"$outputs")"
  probe="$(jq -r '.probe_role_arn.value // empty' <<<"$outputs")"
  producer="$(jq -r '.producer_role_arn.value // empty' <<<"$outputs")"
  producer_model="$(jq -r '.producer_inference_profile.value // empty' <<<"$outputs")"
  if [ -z "$deploy" ] || [ -z "$triage" ] || [ -z "$probe" ] || [ -z "$producer" ] || [ -z "$producer_model" ]; then
    echo "infra/sandbox lacks one of the outputs deploy_role_arn, triage_role_arn, probe_role_arn, producer_role_arn and"
    echo "producer_inference_profile. Apply infra/sandbox first. Nothing set."
    exit 1
  fi
  model="${TRIAGE_MODEL:?set TRIAGE_MODEL to the Bedrock model or inference profile ID for triage}"
  # A role ARN holds the AWS account ID. GitHub prints a step's inputs before the step runs and never masks a variable,
  # so the ARNs are secrets, which it masks in every log line. The variables of the same names, from earlier runs of this
  # script, are deleted once the secrets are set (SPEC-001-R86).
  existing="$(gh variable list --repo "$repo" --json name --jq '.[].name')"
  stale=""
  for name in DEPLOY_ROLE_ARN TRIAGE_ROLE_ARN PROBE_ROLE_ARN PRODUCER_ROLE_ARN; do
    if printf '%s\n' "$existing" | grep -qx "$name"; then stale="${stale} ${name}"; fi
  done
  echo
  echo "Will set repository secrets:"
  printf '  DEPLOY_ROLE_ARN=%s\n  TRIAGE_ROLE_ARN=%s\n  PROBE_ROLE_ARN=%s\n  PRODUCER_ROLE_ARN=%s\n' "$deploy" "$triage" "$probe" "$producer"
  echo "Will set repository variables:"
  printf '  TRIAGE_MODEL=%s\n  PRODUCER_MODEL=%s\n' "$model" "$producer_model"
  if [ -n "$stale" ]; then
    echo "Will then delete these repository variables, which the secrets replace:"
    for name in $stale; do echo "  ${name}"; done
  fi
  confirm "Set these secrets and variables?" || { echo "Nothing set."; exit 1; }
  gh secret set DEPLOY_ROLE_ARN --repo "$repo" --body "$deploy"
  gh secret set TRIAGE_ROLE_ARN --repo "$repo" --body "$triage"
  gh secret set PROBE_ROLE_ARN --repo "$repo" --body "$probe"
  gh secret set PRODUCER_ROLE_ARN --repo "$repo" --body "$producer"
  gh variable set TRIAGE_MODEL --repo "$repo" --body "$model"
  gh variable set PRODUCER_MODEL --repo "$repo" --body "$producer_model"
  for name in $stale; do
    gh variable delete "$name" --repo "$repo"
  done
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
