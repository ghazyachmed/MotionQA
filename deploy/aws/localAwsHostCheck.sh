#!/bin/bash
# Simulates the t4g.small host locally: a linux/arm64 Docker-in-Docker "instance" with a memory cap, running the same
# build-and-start command as startStack.sh (dockerCompose.yml + dockerComposeAws.yml), with only CloudWatch logging and
# S3 evidence replaced (dockerComposeAwsLocalSim.yml). Not an AWS measurement.
# Usage (repo root, Docker running): deploy/aws/localAwsHostCheck.sh <output-dir> [host-memory, default 1700m]
# 1700m ≈ 2 GiB of a t4g.small minus Amazon Linux, the SSM agent and kernel reservations (assumption, not measured on AWS).
set -euo pipefail
outputDir="$1"
hostMemory="${2:-1700m}"
host=motionqa-host-sim
port=58280
mkdir -p "$outputDir"
workDir=$(mktemp -d)
trap 'docker rm -fv "$host" >/dev/null 2>&1 || true; rm -rf "$workDir"' EXIT

echo "== release contents: tracked files (working tree) + model artifacts; publishRelease.sh ships only committed files"
git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$workDir"
git diff --stat HEAD > "$outputDir/uncommitted-changes.txt"
mkdir -p "$workDir/backend/models/visaPcb1"
cp backend/models/visaPcb1/{inspectionProfile.json,featureExtractor.onnx,memoryBank.npz} "$workDir/backend/models/visaPcb1/"
cp deploy/aws/dockerComposeAwsLocalSim.yml "$workDir/deploy/aws/"
token=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
# Same .env as startStack.sh writes on the instance: its heredoc, filled with local values instead of AWS lookups.
operatorToken="$token" databasePassword=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')
MOTIONQA_LINE_ID=LINE_01 MOTIONQA_ARTIFACT_BUCKET=local-simulation MOTIONQA_LOG_GROUP=local-simulation
MOTIONQA_EVIDENCE_RETENTION_DAYS=30 AWS_REGION=us-east-1
eval "cat <<EOF
$(sed -n '/^cat > .env <<EOF$/,/^EOF$/{/^cat > .env <<EOF$/d;/^EOF$/d;p;}' deploy/aws/startStack.sh)
EOF" > "$workDir/.env"
grep -q '^MOTIONQA_API_TOKENS=.' "$workDir/.env" || { echo "could not reproduce startStack.sh .env" >&2; exit 1; }

echo "== simulated host: linux/arm64, ${hostMemory} memory, 2 CPUs"
docker run -d --privileged --name "$host" --platform linux/arm64 --memory="$hostMemory" --memory-swap="$hostMemory" --cpus=2 \
  -p "127.0.0.1:$port:80" -v "$workDir:/opt/motionqa/app" docker:29-dind >/dev/null
for attempt in $(seq 1 60); do docker exec "$host" docker info >/dev/null 2>&1 && break; sleep 2; done
{ echo "date: $(date -u +%FT%TZ)"; echo "hostMemoryCap: $hostMemory"; docker exec "$host" sh -c 'docker version --format "inner docker {{.Server.Version}} {{.Server.Arch}}"; docker compose version; nproc'; } > "$outputDir/environment.txt"

sample() {  # host-side memory of the whole simulated instance, every 2 s, until the stop file appears
  while [ ! -f "$workDir/stopSampling" ]; do
    docker stats --no-stream --format '{{.MemUsage}}' "$host" 2>/dev/null | awk -v t="$(date +%s)" '{print t, $1}'
    sleep 2
  done
}

echo "== build and start exactly as startStack.sh does"
sample > "$outputDir/memory-build.txt" & samplerPid=$!
buildStart=$(date +%s)
set +e
docker exec -w /opt/motionqa/app "$host" docker compose -f dockerCompose.yml -f deploy/aws/dockerComposeAws.yml -f deploy/aws/dockerComposeAwsLocalSim.yml \
  up -d --build --remove-orphans > "$outputDir/compose-up.txt" 2>&1
buildExit=$?
set -e
echo "exit=$buildExit seconds=$(( $(date +%s) - buildStart ))" >> "$outputDir/compose-up.txt"
touch "$workDir/stopSampling"; wait "$samplerPid"; rm -f "$workDir/stopSampling"
tail -1 "$outputDir/compose-up.txt"
grep -iE "killed|exit code: 137|out of memory|oom" "$outputDir/compose-up.txt" > "$outputDir/oom-build.txt" || echo "none" > "$outputDir/oom-build.txt"

for attempt in $(seq 1 60); do curl -fsS "http://127.0.0.1:$port/api/v1/health" > "$outputDir/health.json" 2>/dev/null && break; sleep 3; done
docker exec "$host" docker system df > "$outputDir/disk-usage.txt"
docker exec "$host" df -h /var/lib/docker >> "$outputDir/disk-usage.txt"

echo "== paced load through nginx at the deployed rate limits"
sample > "$outputDir/memory-serve.txt" & samplerPid=$!
python3 - "http://127.0.0.1:$port" "$token" "$outputDir" <<'EOF'
import json, statistics, sys, time, urllib.request, uuid
from pathlib import Path
base, token, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
items = json.load(open("evaluation/visaPcb1Split.json"))["splits"]["test"]
def call(path, body=None, ctype=None):
    headers = {"Authorization": f"Bearer {token}", **({"Content-Type": ctype} if ctype else {})}
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, data=body, headers=headers, method="POST" if body is not None else "GET"), timeout=120) as r:
            return r.status, (time.perf_counter() - started) * 1000, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, (time.perf_counter() - started) * 1000, None
def upload(path, image, fields=()):
    b = uuid.uuid4().hex
    parts = [f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in fields]
    parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"x.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".encode() + Path("data/visa", image).read_bytes() + b"\r\n")
    return call(path, b"".join(parts) + f"--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}")
results = []
for item in items[:60]:  # 60 inspections at 1 per 2.2 s stays under the API limit of 30/min per client
    results.append(upload("/api/v1/inspections", item["image"]))
    time.sleep(2.2)
session = call("/api/v1/sessions", json.dumps({"maxAttempts": 3}).encode(), "application/json")
attempt = upload(f"/api/v1/sessions/{session[2]['sessionId']}/attempts", items[60]["image"], [("attemptNumber", "1")]) if session[2] else (0, 0, None)
ok = [r for r in results if r[0] == 201]
summary = {"inspections": len(results), "statuses": {str(s): sum(1 for r in results if r[0] == s) for s in {r[0] for r in results}},
           "roundTripMsMedian": round(statistics.median([r[1] for r in ok]), 1) if ok else None,
           "inferenceMsMedian": round(statistics.median([r[2]["latency"]["inferenceMs"] for r in ok]), 1) if ok else None,
           "serverTotalMsMedian": round(statistics.median([r[2]["latency"]["totalMs"] for r in ok]), 1) if ok else None,
           "sessionCreate": session[0], "sessionAttempt": attempt[0], "sessionDecision": (attempt[2] or {}).get("inspection", {}).get("decision")}
(out / "load.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary))
EOF
touch "$workDir/stopSampling"; wait "$samplerPid"
docker exec "$host" docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' > "$outputDir/containers-after.txt"
docker exec "$host" sh -c 'for c in $(docker ps -aq); do docker inspect --format "{{.Name}} oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}} status={{.State.Status}}" $c; done' > "$outputDir/oom-serve.txt"
docker inspect --format 'host oomKilled={{.State.OOMKilled}} status={{.State.Status}}' "$host" >> "$outputDir/oom-serve.txt"
python3 - "$outputDir" <<'EOF'
import sys
from pathlib import Path
out = Path(sys.argv[1]); units = {"B": 1 / 2**20, "KiB": 1 / 1024, "MiB": 1, "GiB": 1024}
def peak(name):
    values = []
    for line in (out / name).read_text().split("\n"):
        if line.strip():
            raw = line.split()[1]
            number = raw.rstrip("KMGiB"); unit = raw[len(number):]
            values.append(float(number) * units[unit])
    return round(max(values), 1) if values else None
print(f"peak host memory MiB: build {peak('memory-build.txt')}, serving {peak('memory-serve.txt')}")
EOF
cat "$outputDir/oom-serve.txt"
echo "results in $outputDir"
