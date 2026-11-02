terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }

  # Partial configuration: the bucket name carries the account ID, so it is passed at init with
  # -backend-config=bucket=who-gets-the-keys-tfstate-<account>-us-east-1-an (see local.state_bucket).
  backend "s3" {
    key          = "sandbox/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "who-gets-the-keys"
      managed = "terraform"
    }
  }
}
