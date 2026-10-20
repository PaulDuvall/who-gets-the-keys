data "aws_caller_identity" "current" {}

locals {
  account_id    = data.aws_caller_identity.current.account_id
  function_name = "who-gets-the-keys-export"
  role_path     = "/who-gets-the-keys/"
}

resource "aws_dynamodb_table" "export_jobs" {
  name                        = "export_jobs"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "job_id"
  deletion_protection_enabled = true

  attribute {
    name = "job_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_cloudwatch_log_group" "export" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 14
}

resource "aws_iam_role" "export_lambda" {
  name = "who-gets-the-keys-export-lambda"
  path = local.role_path
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "export_lambda_logs" {
  name = "logs"
  role = aws_iam_role.export_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.export.arn}:*"
    }]
  })
}

resource "aws_lambda_function" "export" {
  function_name    = local.function_name
  role             = aws_iam_role.export_lambda.arn
  runtime          = "nodejs24.x"
  handler          = "handler.handler"
  filename         = var.artifact_path
  source_code_hash = var.artifact_sha256
  memory_size      = 512
  timeout          = 10
  architectures    = ["arm64"]

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.export.name
  }
}

resource "aws_sns_topic" "break_glass" {
  name              = "who-gets-the-keys-break-glass"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_cloudwatch_event_rule" "break_glass_used" {
  name        = "who-gets-the-keys-break-glass-used"
  description = "Any assumption of the break-glass role"
  event_pattern = jsonencode({
    source        = ["aws.sts"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventName         = ["AssumeRole"]
      requestParameters = { roleArn = [aws_iam_role.break_glass.arn] }
    }
  })
}

resource "aws_cloudwatch_event_target" "break_glass_used" {
  rule = aws_cloudwatch_event_rule.break_glass_used.name
  arn  = aws_sns_topic.break_glass.arn
}

resource "aws_sns_topic_policy" "break_glass" {
  arn = aws_sns_topic.break_glass.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.break_glass.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.break_glass_used.arn } }
    }]
  })
}

output "deploy_role_arn" {
  description = "Role pipeline.yml assumes in environment sandbox"
  value       = aws_iam_role.deploy.arn
}

output "triage_role_arn" {
  description = "Role issue-triage.yml assumes for Bedrock"
  value       = aws_iam_role.triage.arn
}

output "probe_role_arn" {
  description = "Role scenarios.yml assumes for on-demand probes"
  value       = aws_iam_role.probe.arn
}

output "break_glass_topic_arn" {
  description = "SNS topic alarmed on every break-glass assumption; subscribe to it"
  value       = aws_sns_topic.break_glass.arn
}
