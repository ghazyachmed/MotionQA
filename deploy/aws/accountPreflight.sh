#!/bin/bash
# Read-only AWS account preflight for MotionQA. Changes nothing; never upgrades plans or touches billing settings.
# Run with temporary credentials (aws login as an IAM user, or an assumed role), not root and not long-lived access keys.
# Usage: AWS_REGION=us-east-1 deploy/aws/accountPreflight.sh
set -uo pipefail
region="${AWS_REGION:?Set AWS_REGION}"

echo "== caller (must not be root)"
arn=$(aws sts get-caller-identity --query Arn --output text) || { echo "No valid credentials" >&2; exit 1; }
echo "$arn"
case "$arn" in
  *":root") echo "Refusing to continue with root credentials. Sign in with aws login as an IAM user instead." >&2; exit 1 ;;
esac
if [ -z "${AWS_SESSION_TOKEN:-}" ] && ! aws configure get login_session >/dev/null 2>&1 && ! aws configure get sso_session >/dev/null 2>&1 && ! aws configure get role_arn >/dev/null 2>&1; then
  echo "WARNING: credentials do not look temporary (no aws login session, session token, SSO, or role). Prefer short-lived credentials."
fi

echo "== account plan (Free or Paid), if this CLI version supports it"
aws freetier get-account-plan-state --region us-east-1 2>&1 || echo "freetier get-account-plan-state unavailable: check Console Home > Cost and usage"

echo "== Free Tier eligible instance types in $region"
aws ec2 describe-instance-types --region "$region" --filters Name=free-tier-eligible,Values=true \
  --query "InstanceTypes[*].InstanceType" --output text | tr '\t' '\n' | sort
echo "t4g.small eligible here: $(aws ec2 describe-instance-types --region "$region" --instance-types t4g.small --query 'InstanceTypes[0].FreeTierEligible' --output text 2>&1)"

echo "== existing budgets (alerts are not spending caps)"
account=$(aws sts get-caller-identity --query Account --output text)
aws budgets describe-budgets --account-id "$account" --query "Budgets[*].[BudgetName,BudgetLimit.Amount,BudgetLimit.Unit]" --output table 2>&1 || true

echo "== Credits and expiry are shown on Billing and Cost Management > Credits (no read-only CLI equivalent used here)."
echo "Preflight complete. Nothing was created or changed."
