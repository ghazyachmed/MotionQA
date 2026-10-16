#!/bin/bash
# Delete the MotionQA stack and everything it left behind, then verify that nothing billable remains.
# Destructive: asks you to type the stack name before deleting. Run with the deployer's temporary credentials.
# Usage: AWS_REGION=<region> deploy/aws/teardownStack.sh <stack-name> <cloudformation-service-role-arn> [evidence-backup-dir]
set -euo pipefail
stackName="$1"
serviceRoleArn="$2"
backupDir="${3:-}"
region="${AWS_REGION:?Set AWS_REGION}"
record="deploy/aws/private/teardown-$stackName-$(date -u +%Y%m%dT%H%M%SZ).txt"
mkdir -p "$(dirname "$record")"
exec > >(tee "$record") 2>&1

output() {
  aws cloudformation describe-stacks --region "$region" --stack-name "$stackName" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
bucket=$(output ArtifactBucketName); instanceId=$(output InstanceId); logGroup=$(output LogGroupName); webUrl=$(output WebUrl)
echo "== stack $stackName in $region"
echo "web $webUrl | instance $instanceId | bucket $bucket (retained by the template) | log group $logGroup"
aws cloudformation describe-stack-resources --region "$region" --stack-name "$stackName" \
  --query 'StackResources[].[LogicalResourceId, ResourceType, PhysicalResourceId]' --output table
read -r -p "Type the stack name to delete all of the above and the bucket contents: " confirmation
[ "$confirmation" = "$stackName" ] || { echo "Not confirmed; nothing deleted."; exit 1; }

if [ -n "$backupDir" ]; then
  echo "== backing up evidence to $backupDir"
  aws s3 sync --region "$region" "s3://$bucket/evidence/" "$backupDir"
fi

echo "== deleting the stack (CloudFront deletion can take 15-30 minutes)"
aws cloudformation delete-stack --region "$region" --stack-name "$stackName" --role-arn "$serviceRoleArn"
aws cloudformation wait stack-delete-complete --region "$region" --stack-name "$stackName"

echo "== emptying and deleting the retained bucket $bucket"
versioning=$(aws s3api get-bucket-versioning --region "$region" --bucket "$bucket" --query Status --output text)
if [ "$versioning" != "None" ]; then
  echo "Bucket versioning is $versioning; delete object versions in the console, then delete the bucket." >&2; exit 1
fi
aws s3 rm --region "$region" "s3://$bucket" --recursive --only-show-errors
aws s3api delete-bucket --region "$region" --bucket "$bucket"

echo "== verifying that nothing billable is left"
leftover=0
check() {  # $1 description, rest: command whose non-empty output means something is left
  local title="$1"; shift
  local result; result=$("$@" 2>&1 | grep -v '^None$' || true)
  if [ -n "$result" ]; then echo "LEFT: $title: $result"; leftover=1; else echo "ok: $title"; fi
}
check "stack" sh -c "aws cloudformation describe-stacks --region '$region' --stack-name '$stackName' --query 'Stacks[0].StackStatus' --output text 2>/dev/null"
check "running or stopped instances of the stack" aws ec2 describe-instances --region "$region" --filters "Name=tag:aws:cloudformation:stack-name,Values=$stackName" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[].Instances[].InstanceId' --output text
check "unattached EBS volumes in the region (any owner)" aws ec2 describe-volumes --region "$region" --filters Name=status,Values=available --query 'Volumes[].VolumeId' --output text
check "Elastic IPs" aws ec2 describe-addresses --region "$region" --query 'Addresses[].PublicIp' --output text
check "bucket" sh -c "aws s3api head-bucket --bucket '$bucket' >/dev/null 2>&1 && echo '$bucket'"
check "log group" aws logs describe-log-groups --region "$region" --log-group-name-prefix "$logGroup" --query 'logGroups[].logGroupName' --output text
check "CloudFront distribution" aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='MotionQA $stackName'].Id" --output text
check "secrets still active" aws secretsmanager list-secrets --region "$region" --filters "Key=tag-value,Values=$stackName" --query 'SecretList[?DeletedDate==`null`].Name' --output text
scheduled=$(aws secretsmanager list-secrets --region "$region" --include-planned-deletion --filters "Key=tag-value,Values=$stackName" \
  --query 'SecretList[?DeletedDate!=`null`].[Name, DeletedDate]' --output text)
if [ -n "$scheduled" ]; then echo "$scheduled" | sed 's/^/secret scheduled for deletion (recovery window): /'; fi
echo
if [ "$leftover" = 0 ]; then echo "Teardown complete: no MotionQA resources found."; else echo "Teardown incomplete: see LEFT lines above." >&2; fi
echo "The deployer access stack (IAM role and policy, no charge) remains; delete it in CloudFormation if no longer needed."
echo "Check Billing and Cost Management > Bills tomorrow; usage appears with a delay. Record: $record"
[ "$leftover" = 0 ]
