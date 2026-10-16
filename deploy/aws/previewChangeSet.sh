#!/bin/bash
# Create (but never execute) a CloudFormation change set for the MotionQA stack and print the exact resources.
# Requires deployerAccess.yaml deployed once and temporary deployer credentials.
# Usage: AWS_REGION=us-east-1 deploy/aws/previewChangeSet.sh <stack-name> <cloudformation-service-role-arn> [instance-type]
set -euo pipefail
stackName="$1"
serviceRoleArn="$2"
instanceType="${3:-t4g.small}"
region="${AWS_REGION:?Set AWS_REGION}"

prefixList=$(aws ec2 describe-managed-prefix-lists --region "$region" --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
vpcId=$(aws ec2 describe-vpcs --region "$region" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
subnetId=$(aws ec2 describe-subnets --region "$region" --filters Name=vpc-id,Values="$vpcId" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
if aws cloudformation describe-stacks --region "$region" --stack-name "$stackName" >/dev/null 2>&1; then changeSetType=UPDATE; else changeSetType=CREATE; fi
changeSetName="preview-$(date -u +%Y%m%dT%H%M%S)"

aws cloudformation create-change-set --region "$region" --stack-name "$stackName" --change-set-name "$changeSetName" \
  --change-set-type "$changeSetType" --template-body file://deploy/aws/motionQaStack.yaml --capabilities CAPABILITY_IAM \
  --role-arn "$serviceRoleArn" \
  --parameters ParameterKey=VpcId,ParameterValue="$vpcId" ParameterKey=PublicSubnetId,ParameterValue="$subnetId" \
               ParameterKey=CloudFrontOriginPrefixListId,ParameterValue="$prefixList" ParameterKey=InstanceType,ParameterValue="$instanceType" >/dev/null
aws cloudformation wait change-set-create-complete --region "$region" --stack-name "$stackName" --change-set-name "$changeSetName" || true

echo "== change set $changeSetName ($changeSetType) for $stackName in $region"
aws cloudformation describe-change-set --region "$region" --stack-name "$stackName" --change-set-name "$changeSetName" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
echo
echo "Inputs: VpcId=$vpcId PublicSubnetId=$subnetId PrefixList=$prefixList InstanceType=$instanceType"
echo "NOT EXECUTED. Review the cost of every resource above (EC2, public IPv4, EBS, S3, Secrets Manager, CloudWatch, CloudFront)."
echo "Execute only within a verified no-charge or approved budget:"
echo "  aws cloudformation execute-change-set --region $region --stack-name $stackName --change-set-name $changeSetName"
echo "Discard: aws cloudformation delete-change-set --region $region --stack-name $stackName --change-set-name $changeSetName"
