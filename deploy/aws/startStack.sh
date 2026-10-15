#!/bin/bash
# Runs on the EC2 instance (invoked by /opt/motionqa/deployRelease.sh). Pulls secrets and model
# artifacts, writes the compose .env, and (re)starts the stack. Secrets never leave the instance.
set -euo pipefail
source /opt/motionqa/stack.env
appDir=/opt/motionqa/app
cd "$appDir"

operatorToken=$(aws secretsmanager get-secret-value --secret-id "$MOTIONQA_OPERATOR_TOKEN_SECRET" --query SecretString --output text)
databasePassword=$(aws secretsmanager get-secret-value --secret-id "$MOTIONQA_DATABASE_PASSWORD_SECRET" --query SecretString --output text)

mkdir -p backend/models/visaPcb1
aws s3 cp --recursive "s3://$MOTIONQA_ARTIFACT_BUCKET/models/visaPcb1/" backend/models/visaPcb1/
test -f backend/models/visaPcb1/inspectionProfile.json || { echo "model artifacts missing in s3://$MOTIONQA_ARTIFACT_BUCKET/models/visaPcb1/" >&2; exit 1; }

umask 077
cat > .env <<EOF
POSTGRES_PASSWORD=$databasePassword
MOTIONQA_API_TOKENS=$operatorToken
MOTIONQA_LINE_ID=$MOTIONQA_LINE_ID
MOTIONQA_ARTIFACT_BUCKET=$MOTIONQA_ARTIFACT_BUCKET
MOTIONQA_LOG_GROUP=$MOTIONQA_LOG_GROUP
MOTIONQA_EVIDENCE_RETENTION_DAYS=$MOTIONQA_EVIDENCE_RETENTION_DAYS
AWS_REGION=$AWS_REGION
EOF

docker compose -f dockerCompose.yml -f deploy/aws/dockerComposeAws.yml up -d --build --remove-orphans
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/v1/health >/dev/null; then
    echo "MotionQA healthy after $attempt checks"
    exit 0
  fi
  sleep 5
done
echo "MotionQA did not become healthy" >&2
docker compose -f dockerCompose.yml -f deploy/aws/dockerComposeAws.yml ps >&2
exit 1
