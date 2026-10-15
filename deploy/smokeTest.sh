#!/bin/bash
# End-to-end smoke test against a running MotionQA deployment (local compose or AWS).
# Usage: MOTIONQA_TOKEN=... deploy/smokeTest.sh <base-url> <image-file>
# Example: MOTIONQA_TOKEN=$TOKEN deploy/smokeTest.sh http://127.0.0.1:5173 data/visa/pcb1/Data/Images/Normal/0000.JPG
set -euo pipefail
baseUrl="${1%/}"
imageFile="$2"
token="${MOTIONQA_TOKEN:?Set MOTIONQA_TOKEN}"
inspectionId="smoke-$(date -u +%Y%m%dT%H%M%S)"

echo "== health"; curl -fsS "$baseUrl/api/v1/health"; echo
echo "== model"; curl -fsS "$baseUrl/api/v1/model/status" | python3 -c "import json,sys; s=json.load(sys.stdin); print({k: s[k] for k in ('ready','profileId','profileVersion')}, 'opencv', s['opencv']['version'])"
echo "== unauthenticated request is rejected"
test "$(curl -s -o /dev/null -w '%{http_code}' "$baseUrl/api/v1/inspections")" = "401"
echo "== inspection"
response=$(curl -fsS -H "Authorization: Bearer $token" -F "image=@$imageFile;type=image/jpeg" -F "inspectionId=$inspectionId" "$baseUrl/api/v1/inspections")
echo "$response" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['decision'], r['reasonCode'], 'score', r['scores'].get('anomalyScore'), 'totalMs', r['latency']['totalMs'])"
echo "== idempotent retry"
test "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" -F "image=@$imageFile;type=image/jpeg" -F "inspectionId=$inspectionId" "$baseUrl/api/v1/inspections")" = "200"
echo "== evidence"
curl -fsSL -H "Authorization: Bearer $token" -o /tmp/motionqa-smoke-overlay.jpg "$baseUrl/api/v1/inspections/$inspectionId/evidence/overlay"
file /tmp/motionqa-smoke-overlay.jpg
echo "smoke test passed: $inspectionId"
