#!/bin/bash
# Run from the repository root on an operator machine with AWS credentials.
# Uploads the committed source (git archive) and the model artifacts, then deploys via SSM Run Command.
# Usage: deploy/aws/publishRelease.sh <stack-name> [region]
set -euo pipefail
stackName="$1"
region="${2:-${AWS_REGION:-}}"
regionArgs=()
if [ -n "$region" ]; then regionArgs=(--region "$region"); fi

output() {
  aws cloudformation describe-stacks "${regionArgs[@]}" --stack-name "$stackName" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

bucket=$(output ArtifactBucketName)
instanceId=$(output InstanceId)
commit=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes; the release archive only contains committed files." >&2
fi
for artifact in inspectionProfile.json featureExtractor.onnx memoryBank.npz; do
  test -f "backend/models/visaPcb1/$artifact" || { echo "Missing backend/models/visaPcb1/$artifact. Run: cd backend && python -m motionQa.evaluation.runEvaluation" >&2; exit 1; }
done

archive="motionqa-$commit.tar.gz"
git archive --format=tar.gz -o "/tmp/$archive" HEAD
aws s3 cp "${regionArgs[@]}" "/tmp/$archive" "s3://$bucket/releases/$archive"
aws s3 cp "${regionArgs[@]}" --recursive backend/models/visaPcb1/ "s3://$bucket/models/visaPcb1/"

commandId=$(aws ssm send-command "${regionArgs[@]}" --instance-ids "$instanceId" --document-name AWS-RunShellScript \
  --parameters "commands=[\"/opt/motionqa/deployRelease.sh $archive\"]" --timeout-seconds 1800 --query Command.CommandId --output text)
echo "Deploying $archive to $instanceId (SSM command $commandId)"
aws ssm wait command-executed "${regionArgs[@]}" --command-id "$commandId" --instance-id "$instanceId" || true
aws ssm get-command-invocation "${regionArgs[@]}" --command-id "$commandId" --instance-id "$instanceId" --query "[Status, StandardOutputContent, StandardErrorContent]" --output text
echo "Web URL: $(output WebUrl)"
