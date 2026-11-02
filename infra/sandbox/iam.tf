resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  oidc = "token.actions.githubusercontent.com"
  workflow_ref = {
    pipeline  = "${var.github_repository}/.github/workflows/pipeline.yml@refs/heads/main"
    triage    = "${var.github_repository}/.github/workflows/issue-triage.yml@refs/heads/main"
    scenarios = "${var.github_repository}/.github/workflows/scenarios.yml@refs/heads/main"
  }
}

# One trust policy per OIDC role: exact StringEquals on aud, sub and job_workflow_ref.
data "aws_iam_policy_document" "github_trust" {
  for_each = {
    deploy = { sub = "${var.github_subject_prefix}:environment:sandbox", workflow = local.workflow_ref.pipeline }
    triage = { sub = "${var.github_subject_prefix}:ref:refs/heads/main", workflow = local.workflow_ref.triage }
    probe  = { sub = "${var.github_subject_prefix}:environment:probe", workflow = local.workflow_ref.scenarios }
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values   = [each.value.sub]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:job_workflow_ref"
      values   = [each.value.workflow]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "who-gets-the-keys-deploy"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["deploy"].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "State"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${local.state_bucket}", "arn:aws:s3:::${local.state_bucket}/sandbox/*"]
  }
  statement {
    sid     = "Workload"
    actions = ["lambda:*", "dynamodb:*", "logs:*", "sns:*", "events:*"]
    resources = [
      "arn:aws:lambda:${var.region}:${local.account_id}:function:${local.function_name}",
      "arn:aws:dynamodb:${var.region}:${local.account_id}:table/export_jobs",
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${local.function_name}*",
      "arn:aws:sns:${var.region}:${local.account_id}:who-gets-the-keys-*",
      "arn:aws:events:${var.region}:${local.account_id}:rule/who-gets-the-keys-*",
    ]
  }
  statement {
    sid       = "Describe"
    actions   = ["logs:DescribeLogGroups", "iam:GetOpenIDConnectProvider", "sts:GetCallerIdentity", "kms:CreateKey", "kms:ListAliases"]
    resources = ["*"]
  }
  statement {
    sid       = "Keys"
    actions   = ["kms:*"]
    resources = ["arn:aws:kms:${var.region}:${local.account_id}:key/*", "arn:aws:kms:${var.region}:${local.account_id}:alias/who-gets-the-keys-*"]
  }
  statement {
    sid       = "Identities"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::${local.account_id}:role${local.role_path}*", aws_iam_openid_connect_provider.github.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role" "triage" {
  name                 = "who-gets-the-keys-triage-bedrock"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["triage"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "triage" {
  name = "bedrock-invoke"
  role = aws_iam_role.triage.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/anthropic.*",
        "arn:aws:bedrock:${var.region}:${local.account_id}:inference-profile/us.anthropic.*",
      ]
    }]
  })
}

resource "aws_iam_role" "probe" {
  name                 = "who-gets-the-keys-scenario-probe"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["probe"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "probe_read" {
  role       = aws_iam_role.probe.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Allows the Lambda write on purpose: B11 must observe the SCP's explicit deny, not this policy's.
resource "aws_iam_role_policy" "probe" {
  name = "b11-write"
  role = aws_iam_role.probe.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:UpdateFunctionConfiguration", "lambda:TagResource"]
      Resource = aws_lambda_function.export.arn
    }]
  })
}

resource "aws_iam_role" "break_glass" {
  name                 = "who-gets-the-keys-break-glass"
  path                 = local.role_path
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = { Bool = { "aws:MultiFactorAuthPresent" = "true" } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "break_glass" {
  role       = aws_iam_role.break_glass.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}
