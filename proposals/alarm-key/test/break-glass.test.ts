import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SPEC-001-R217: the break-glass user is the only principal that may assume break-glass, with MFA, through the STS
// endpoint the break-glass rule watches. These tests read the Terraform as text, as test/producer.test.ts does: the
// repo has no HCL parser, and the iac check runs terraform validate on the same files.
const read = (path: string) => readFileSync(path, "utf8");
const iam = read("infra/sandbox/iam.tf");
const main = read("infra/sandbox/main.tf");
const org = read("infra/org/main.tf");

// block: the text of one top-level block, from its header to the closing brace in column 0.
const block = (text: string, header: string): string => {
  const start = text.indexOf(`${header} {`);
  if (start < 0) throw new Error(`no ${header}`);
  return text.slice(start, text.indexOf("\n}\n", start) + 2);
};
// statement: the text of one statement in a policy document, found by its Sid, up to the next Sid or the end.
const statement = (text: string, sid: string): string => {
  const start = text.search(new RegExp(`[Ss]id\\s+= "${sid}"`));
  if (start < 0) throw new Error(`no statement ${sid}`);
  const next = text.slice(start + 1).search(/[Ss]id\s+= "/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
};
const strings = (text: string): string[] => [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
const tfFiles = ["infra/sandbox", "infra/org"].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".tf")).map((f) => join(dir, f)));

describe("SPEC-001-R217 break-glass is assumed only by its own IAM user, with MFA, and every use of that user is alarmed", () => {
  it("SPEC-001-R217 defines the break-glass user with no password, key, MFA seed, group or managed policy in Terraform", () => {
    const user = block(iam, 'resource "aws_iam_user" "break_glass"');
    expect(user).toContain('name = "who-gets-the-keys-break-glass-user"');
    expect(user).toContain("path = local.role_path");
    expect(user).not.toContain("force_destroy");
    const all = tfFiles.map(read).join("\n");
    for (const type of ["aws_iam_access_key", "aws_iam_user_login_profile", "aws_iam_virtual_mfa_device", "aws_iam_user_policy_attachment",
      "aws_iam_user_group_membership", "aws_iam_group_membership", "aws_iam_user_ssh_key", "aws_iam_signing_certificate", "aws_iam_service_specific_credential"]) {
      expect([type, all.includes(`resource "${type}"`)]).toEqual([type, false]);
    }
    expect([...all.matchAll(/resource "aws_iam_user(_policy)?" "(\w+)"/g)].map((m) => m[0])).toEqual([
      'resource "aws_iam_user" "break_glass"', 'resource "aws_iam_user_policy" "break_glass"',
    ]);
  });

  it("SPEC-001-R217 lets the user's key do nothing but assume break-glass with MFA through var.region's endpoint", () => {
    const from = iam.indexOf("break_glass_conditions = {");
    expect(from).toBeGreaterThan(-1);
    const conditions = iam.slice(from, iam.indexOf("\n  }\n", from));
    expect(conditions).toMatch(/Bool\s+= \{ "aws:MultiFactorAuthPresent" = "true" \}/);
    expect(conditions).toMatch(/StringEquals = \{ "aws:RequestedRegion" = var\.region \}/);
    const policy = block(iam, 'resource "aws_iam_user_policy" "break_glass"');
    expect(policy).toContain("user = aws_iam_user.break_glass.name");
    expect([...policy.matchAll(/Sid\s+= "(\w+)"/g)].map((m) => m[1])).toEqual(["AssumeBreakGlassWithMfa", "NothingElse", "NoOtherRole"]);
    const allow = statement(policy, "AssumeBreakGlassWithMfa");
    expect(allow).toMatch(/Effect\s+= "Allow"/);
    expect(allow).toMatch(/Action\s+= "sts:AssumeRole"/);
    expect(allow).toMatch(/Resource\s+= aws_iam_role\.break_glass\.arn/);
    expect(allow).toMatch(/Condition = local\.break_glass_conditions/);
    const nothingElse = statement(policy, "NothingElse");
    expect(nothingElse).toMatch(/Effect\s+= "Deny"/);
    expect(nothingElse).toMatch(/NotAction = "sts:AssumeRole"/);
    expect(nothingElse).toMatch(/Resource\s+= "\*"/);
    expect(nothingElse).not.toContain("Condition");
    const noOtherRole = statement(policy, "NoOtherRole");
    expect(noOtherRole).toMatch(/Effect\s+= "Deny"/);
    expect(noOtherRole).toMatch(/Action\s+= "sts:AssumeRole"/);
    expect(noOtherRole).toMatch(/NotResource = aws_iam_role\.break_glass\.arn/);
    expect(noOtherRole).not.toContain("Condition");
    // The profile aws-setup.sh writes calls STS in the Region the trust requires.
    const region = /variable "region" \{[^}]*default\s+= "([^"]+)"/.exec(read("infra/sandbox/variables.tf"))?.[1];
    expect(region).toBe("us-east-1");
    expect(read("scripts/bootstrap/aws-setup.sh")).toContain(`\nregion="${region}"\n`);
  });

  it("SPEC-001-R217 makes break-glass trust only that user, under the same conditions, never the account root", () => {
    const role = block(iam, 'resource "aws_iam_role" "break_glass"');
    expect(role).toMatch(/Principal = \{ AWS = aws_iam_user\.break_glass\.arn \}/);
    expect(role).toMatch(/Action\s+= "sts:AssumeRole"/);
    expect(role).toMatch(/Condition = local\.break_glass_conditions/);
    expect(role).not.toContain(":root");
    expect(role.match(/Effect\s+= "Allow"/g)).toHaveLength(1);
    expect(role).toContain("max_session_duration = 3600");
  });

  it("SPEC-001-R217 lets the deploy role read the user and its policy only, and deny itself every write to it and to the producer role", () => {
    const deploy = block(iam, 'data "aws_iam_policy_document" "deploy"');
    const reads = deploy.slice(deploy.indexOf('sid       = "ReadBreakGlassUser"'));
    const readBlock = reads.slice(0, reads.indexOf("\n  }\n"));
    expect(strings(/actions\s+= \[([^\]]*)\]/.exec(readBlock)?.[1] ?? "")).toEqual(["iam:GetUser", "iam:GetUserPolicy", "iam:ListUserPolicies", "iam:ListUserTags"]);
    expect(strings(/resources = \[([^\]]*)\]/.exec(readBlock)?.[1] ?? "")).toEqual(["arn:aws:iam::${local.account_id}:user${local.role_path}*"]);
    // No other statement of the deploy role names a user, so it cannot list the user's keys or MFA devices.
    expect(deploy.split(":user").length - 1).toBe(1);
    const deny = deploy.slice(deploy.indexOf('sid     = "NoIdentityWrites"'));
    const denied = deny.slice(0, deny.indexOf("\n  }\n"));
    expect(denied).toContain("actions = local.identity_writes");
    for (const arn of ["aws_iam_role.producer.arn", "aws_iam_role.break_glass.arn", "aws_iam_user.break_glass.arn", "aws_iam_role.deploy.arn"]) {
      expect([arn, denied.includes(arn)]).toEqual([arn, true]);
    }
    const writes = strings(/identity_writes = \[([^\]]*)\]/.exec(iam)?.[1] ?? "");
    for (const family of ["iam:Change*", "iam:Create*", "iam:Deactivate*", "iam:Delete*", "iam:Enable*", "iam:Put*", "iam:Reset*", "iam:Resync*", "iam:Update*", "iam:Upload*"]) {
      expect([family, writes.includes(family)]).toEqual([family, true]);
    }
  });

  it("SPEC-001-R217 gives break-glass the user, its access key and its MFA device to manage, and never a login profile", () => {
    const identity = block(iam, 'resource "aws_iam_role_policy" "break_glass_identity"');
    const user = statement(identity, "BreakGlassUser");
    const actions = strings(/Action = \[([^\]]*)\]/.exec(user)?.[1] ?? "");
    for (const action of ["iam:GetUser", "iam:PutUserPolicy", "iam:CreateAccessKey", "iam:DeleteAccessKey", "iam:EnableMFADevice", "iam:DeactivateMFADevice"]) {
      expect([action, actions.includes(action)]).toEqual([action, true]);
    }
    expect(actions.filter((action) => /LoginProfile|Password|\*/.test(action))).toEqual([]);
    expect(strings(/Resource = \[([^\]]*)\]/.exec(user)?.[1] ?? "")).toEqual([
      "arn:aws:iam::${local.account_id}:user${local.role_path}*", "arn:aws:iam::${local.account_id}:mfa${local.role_path}*",
    ]);
    expect(identity).not.toMatch(/LoginProfile/);
  });

  it("SPEC-001-R217 has the SCP keep every user and MFA device under the path, and their credentials, for break-glass alone", () => {
    const identity = statement(org, "DenyIdentityWritesExceptBreakGlass");
    for (const arn of ["arn:aws:iam::${local.account}:user/who-gets-the-keys/*", "arn:aws:iam::${local.account}:mfa/who-gets-the-keys/*", "local.break_glass"]) {
      expect([arn, identity.includes(arn)]).toEqual([arn, true]);
    }
    expect(identity).toMatch(/Action\s+= local\.iam_writes/);
    expect(identity).toMatch(/Condition = \{ ArnNotLike = \{ "aws:PrincipalArn" = \[local\.break_glass, local\.service_linked\] \} \}/);
    const writes = strings(/iam_writes = \[([^\]]*)\]/.exec(org)?.[1] ?? "");
    for (const family of ["iam:Change*", "iam:Create*", "iam:Deactivate*", "iam:Delete*", "iam:Enable*", "iam:Put*", "iam:Reset*", "iam:Resync*", "iam:Update*", "iam:Upload*"]) {
      expect([family, writes.includes(family)]).toEqual([family, true]);
    }
  });

  it("SPEC-001-R217 alarms on every assumption of break-glass and every call by its user, read-only management events included", () => {
    const rule = block(main, 'resource "aws_cloudwatch_event_rule" "break_glass_used"');
    // AssumeRole is a read-only management event, which a rule in state ENABLED does not match.
    expect(rule).toMatch(/state\s+= "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"/);
    expect(rule).not.toContain("is_enabled");
    expect(rule).toMatch(/"detail-type" = \["AWS API Call via CloudTrail"\]/);
    expect(rule).toMatch(/"\$or" = \[/);
    expect(rule).toMatch(/source = \["aws\.sts"\]\s+detail = \{\s+eventName\s+= \["AssumeRole"\]\s+requestParameters = \{ roleArn = \[aws_iam_role\.break_glass\.arn\] \}/);
    expect(rule).toContain("{ detail = { userIdentity = { arn = [aws_iam_user.break_glass.arn] } } }");
    expect(block(main, 'resource "aws_cloudwatch_event_target" "break_glass_used"')).toContain("arn  = aws_sns_topic.break_glass.arn");
    expect(block(main, 'output "break_glass_user_name"')).toContain("value       = aws_iam_user.break_glass.name");
    expect(block(main, 'output "break_glass_role_arn"')).toContain("value       = aws_iam_role.break_glass.arn");
  });

  it("SPEC-001-R217 encrypts the alarm topic with a key that EventBridge may use and that encrypts nothing else", () => {
    const all = tfFiles.map(read).join("\n");
    // EventBridge cannot publish to a topic under the AWS managed key: every alarm failed until 2026-11-10.
    expect(all).not.toMatch(/kms_master_key_id\s+= "alias\/aws\/sns"/);
    expect(block(main, 'resource "aws_sns_topic" "break_glass"')).toContain("kms_master_key_id = aws_kms_key.break_glass_alarm.arn");
    // The topic is the key's only user, because EventBridge's grant cannot be scoped to the rule.
    expect(all.split("aws_kms_key.break_glass_alarm").length - 1).toBe(1);
    const key = block(main, 'resource "aws_kms_key" "break_glass_alarm"');
    expect(key).toContain("enable_key_rotation = true");
    expect([...key.matchAll(/Sid\s+= "(\w+)"/g)].map((m) => m[1])).toEqual(["Account", "DeployReads", "EventBridgePublishes"]);
    expect(key).not.toMatch(/Effect\s+= "Deny"/);
    const events = statement(key, "EventBridgePublishes");
    expect(events).toMatch(/Principal = \{ Service = "events\.amazonaws\.com" \}/);
    expect(strings(/Action\s+= \[([^\]]*)\]/.exec(events)?.[1] ?? "")).toEqual(["kms:GenerateDataKey*", "kms:Decrypt"]);
    // AWS does not support aws:SourceArn, aws:SourceAccount or aws:SourceOrgID here for EventBridge.
    expect(events).not.toContain("Condition");
    const deploy = statement(key, "DeployReads");
    expect(deploy).toMatch(/Principal = \{ AWS = aws_iam_role\.deploy\.arn \}/);
    expect(strings(/Action\s+= \[([^\]]*)\]/.exec(deploy)?.[1] ?? "")).toEqual(["kms:Describe*", "kms:Get*", "kms:List*"]);
    // The workload's key stays closed to EventBridge.
    expect(block(main, 'resource "aws_kms_key" "sandbox"')).not.toContain("events.amazonaws.com");
  });
});
