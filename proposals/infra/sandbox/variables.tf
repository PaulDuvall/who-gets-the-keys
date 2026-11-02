variable "region" {
  description = "AWS region for the sandbox workload"
  type        = string
  default     = "us-east-1"
}

variable "github_subject_prefix" {
  description = "Immutable OIDC subject prefix: repo:OWNER@OWNER_ID/REPO@REPO_ID"
  type        = string
  default     = "repo:PaulDuvall@1619259/who-gets-the-keys@1443586681"
}

variable "github_repository" {
  description = "OWNER/REPO, used in job_workflow_ref conditions"
  type        = string
  default     = "PaulDuvall/who-gets-the-keys"
}

variable "artifact_path" {
  description = "Path to the Lambda zip built and attested by pipeline.yml"
  type        = string
  default     = "../../dist/function.zip"
}

variable "artifact_sha256" {
  description = "Base64 SHA-256 of the Lambda zip, passed by pipeline.yml"
  type        = string
  default     = ""
}
