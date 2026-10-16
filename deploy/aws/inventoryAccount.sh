#!/bin/bash
# Read-only inventory of an AWS account before deploying MotionQA: what already exists and may draw on credits.
# Creates, changes and deletes nothing. Cost Explorer is not called (each request is billed).
# Run with temporary credentials (`aws login --profile <name>` as an IAM user with ReadOnlyAccess).
# Usage: AWS_PROFILE=<name> deploy/aws/inventoryAccount.sh [output-file]
# Default output: deploy/aws/private/inventory-<UTC time>.txt (gitignored; it contains account and resource ids).
set -uo pipefail
output="${1:-deploy/aws/private/inventory-$(date -u +%Y%m%dT%H%M%SZ).txt}"
mkdir -p "$(dirname "$output")"

run() {  # print a heading and the command's table, or a one-line note when empty or not permitted
  local title="$1"; shift
  local result
  result=$("$@" 2>&1) || { echo "  $title: not readable ($(echo "$result" | tail -1 | cut -c1-120))"; return; }
  if [ -z "$(echo "$result" | tr -d '[:space:]-|+')" ] || [ "$result" = "None" ]; then return; fi
  echo "  -- $title"; echo "$result" | sed 's/^/     /'
}

{
echo "MotionQA read-only account inventory, $(date -u +%FT%TZ)"
echo "== caller"
aws sts get-caller-identity --query '[Account, Arn]' --output text || { echo "No valid credentials. Run: aws login --profile <name>"; exit 1; }

echo "== account plan, credits and expiry (Free Tier API)"
aws freetier get-account-plan-state --region us-east-1 --output json 2>&1 || echo "  unavailable here: read Billing and Cost Management > Credits in the console"

echo "== global"
run "S3 buckets (name, created)" aws s3api list-buckets --query 'Buckets[].[Name, CreationDate]' --output table
run "CloudFront distributions" aws cloudfront list-distributions --query 'DistributionList.Items[].[Id, DomainName, Enabled, Comment]' --output table
run "Route 53 hosted zones (monthly fee each)" aws route53 list-hosted-zones --query 'HostedZones[].[Name, ResourceRecordSetCount]' --output table
run "IAM users" aws iam list-users --query 'Users[].[UserName, CreateDate]' --output table
account=$(aws sts get-caller-identity --query Account --output text)
run "Budgets (alerts, not caps)" aws budgets describe-budgets --account-id "$account" --query 'Budgets[].[BudgetName, BudgetLimit.Amount, BudgetLimit.Unit]' --output table

for region in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
  echo "== $region"
  run "EC2 instances" aws ec2 describe-instances --region "$region" --query 'Reservations[].Instances[].[InstanceId, InstanceType, State.Name, LaunchTime, PublicIpAddress, Tags[?Key==`Name`]|[0].Value]' --output table
  run "EBS volumes" aws ec2 describe-volumes --region "$region" --query 'Volumes[].[VolumeId, Size, VolumeType, State]' --output table
  run "EBS snapshots owned by this account" aws ec2 describe-snapshots --region "$region" --owner-ids self --query 'Snapshots[].[SnapshotId, VolumeSize, StartTime]' --output table
  run "Elastic IPs (charged even when idle)" aws ec2 describe-addresses --region "$region" --query 'Addresses[].[PublicIp, InstanceId]' --output table
  run "NAT gateways" aws ec2 describe-nat-gateways --region "$region" --filter Name=state,Values=pending,available --query 'NatGateways[].[NatGatewayId, State]' --output table
  run "Interface VPC endpoints" aws ec2 describe-vpc-endpoints --region "$region" --filters Name=vpc-endpoint-type,Values=Interface --query 'VpcEndpoints[].[VpcEndpointId, ServiceName]' --output table
  run "Load balancers" aws elbv2 describe-load-balancers --region "$region" --query 'LoadBalancers[].[LoadBalancerName, Type, State.Code]' --output table
  run "RDS instances" aws rds describe-db-instances --region "$region" --query 'DBInstances[].[DBInstanceIdentifier, DBInstanceClass, DBInstanceStatus]' --output table
  run "Lambda functions" aws lambda list-functions --region "$region" --query 'Functions[].[FunctionName, Runtime]' --output table
  run "CloudFormation stacks" aws cloudformation list-stacks --region "$region" --query 'StackSummaries[?StackStatus!=`DELETE_COMPLETE`].[StackName, StackStatus]' --output table
  run "Secrets (incl. scheduled deletion)" aws secretsmanager list-secrets --region "$region" --include-planned-deletion --query 'SecretList[].[Name, DeletedDate]' --output table
  run "Log groups (stored bytes, retention days)" aws logs describe-log-groups --region "$region" --query 'logGroups[].[logGroupName, storedBytes, retentionInDays]' --output table
done
echo "Inventory complete. Nothing was created, changed, or deleted."
} 2>&1 | tee "$output"
echo "Saved to $output (do not commit; it contains account and resource ids)."
