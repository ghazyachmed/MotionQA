#!/bin/bash
# Linux ARM64 memory/CPU check before a t4g.small deployment (local Docker emulation; not a cloud measurement).
# Usage (repo root): MOTIONQA_TOKEN=<token> deploy/aws/localT4gSmallCheck.sh <output-dir>
# SKIP_BUILD_CHECK=1 reuses build-*-1g.txt already in <output-dir> when both report OK.
set -euo pipefail
outputDir="$1"
token="${MOTIONQA_TOKEN:?Set MOTIONQA_TOKEN}"
mkdir -p "$outputDir"
project=motionqa-t4g
compose=(docker compose -p "$project" -f dockerCompose.yml -f deploy/aws/dockerComposeT4gSmall.yml)
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')}"
export MOTIONQA_API_TOKENS="$token" FRONTEND_PORT="${FRONTEND_PORT:-58180}" POSTGRES_PORT=55532 REDIS_PORT=56479 BACKEND_PORT=58100 MOTIONQA_RTSP_URL=rtsp://example.invalid/x
# The latency/memory phase talks to the API directly and must not be throttled; the nginx phase keeps nginx's own limits.
export MOTIONQA_INSPECTION_RATE_LIMIT_PER_MINUTE=600
baseUrl="http://127.0.0.1:$FRONTEND_PORT"
apiUrl="http://127.0.0.1:$BACKEND_PORT"

{ echo "date: $(date -u +%FT%TZ)"; docker version --format 'docker server {{.Server.Version}} {{.Server.Arch}}'; docker info --format 'vm cpus={{.NCPU}} memBytes={{.MemTotal}}'; } > "$outputDir/environment.txt"

if [ "${SKIP_BUILD_CHECK:-0}" = 1 ] && grep -q FRONTEND_BUILD_OK "$outputDir/build-frontend-1g.txt" 2>/dev/null && grep -q BACKEND_DEPS_OK "$outputDir/build-backend-1g.txt" 2>/dev/null; then
  echo "== build-memory check: reusing existing results"
else
  echo "== build-memory check: frontend and backend builds under a 1 GiB cap"
  docker run --rm --platform linux/arm64 --memory=1g --memory-swap=1g --cpus=2 -v "$PWD/frontend:/src:ro" node:22-alpine \
    sh -c "cp -r /src /build && cd /build && rm -rf node_modules dist && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null && echo FRONTEND_BUILD_OK" > "$outputDir/build-frontend-1g.txt" 2>&1 || echo "FRONTEND_BUILD_FAILED exit=$?" >> "$outputDir/build-frontend-1g.txt"
  docker run --rm --platform linux/arm64 --memory=1g --memory-swap=1g --cpus=2 -v "$PWD/backend:/src:ro" python:3.11-slim \
    sh -c "pip install -q --root-user-action=ignore --disable-pip-version-check -r /src/requirements-runtime.lock && python -c 'import cv2; print(\"BACKEND_DEPS_OK\", cv2.__version__)'" > "$outputDir/build-backend-1g.txt" 2>&1 || echo "BACKEND_BUILD_FAILED exit=$?" >> "$outputDir/build-backend-1g.txt"
fi
tail -1 "$outputDir/build-frontend-1g.txt"; tail -1 "$outputDir/build-backend-1g.txt"

echo "== stack under t4g.small-like limits"
"${compose[@]}" up -d --build postgresDb redisCache backendApi frontendUi > "$outputDir/compose-up.txt" 2>&1
for attempt in $(seq 1 60); do curl -fsS "$baseUrl/api/v1/health" >/dev/null 2>&1 && break; sleep 3; done
curl -sS "$baseUrl/api/v1/health" > "$outputDir/health.json"
docker exec "$project-backendApi-1" python -c "import cv2, os; print('opencv', cv2.__version__, 'threads', cv2.getNumThreads(), 'visibleCpus', os.cpu_count())" > "$outputDir/opencv-threads.txt"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' | grep "$project" > "$outputDir/stats-idle.txt"

python3 - "$apiUrl" "$baseUrl" "$token" "$outputDir" "$project" <<'EOF'
import concurrent.futures, json, re, statistics, subprocess, sys, threading, time, urllib.request, uuid
from pathlib import Path
api, proxy, token, out, project = sys.argv[1], sys.argv[2], sys.argv[3], Path(sys.argv[4]), sys.argv[5]
items = json.load(open("evaluation/visaPcb1Split.json"))["splits"]["test"]
units = {"B": 1 / 2**20, "KiB": 1 / 1024, "MiB": 1, "GiB": 1024}

def request(url, body=None, contentType=None):
    headers = {"Authorization": f"Bearer {token}"}
    if contentType:
        headers["Content-Type"] = contentType
    req = urllib.request.Request(url, data=body, method="POST" if body is not None else "GET", headers=headers)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, (time.perf_counter() - started) * 1000, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, (time.perf_counter() - started) * 1000, None
    except Exception:
        return 0, (time.perf_counter() - started) * 1000, None

def upload(url, path, fields=()):
    boundary = uuid.uuid4().hex
    parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in fields]
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"x.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".encode() + Path("data/visa", path).read_bytes() + b"\r\n")
    return request(url, b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}")

peaks, stop = {}, threading.Event()
def sampler():
    while not stop.is_set():
        lines = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{.Name}}|{{.MemUsage}}"], capture_output=True, text=True).stdout.splitlines()
        for line in lines:
            name, usage = line.split("|")
            if project in name:
                value, unit = re.match(r"([\d.]+)(\w+)", usage.split("/")[0].strip()).groups()
                peaks[name] = max(peaks.get(name, 0.0), float(value) * units[unit])
threading.Thread(target=sampler, daemon=True).start()

def p95(values):
    return round(sorted(values)[max(0, int(round(0.95 * len(values))) - 1)], 1) if values else None
def summarize(results):
    ok = [r for r in results if r[0] == 201]
    return {"requests": len(results), "statuses": dict(sorted({str(s): sum(1 for r in results if r[0] == s) for s in {r[0] for r in results}}.items())),
            "roundTripMs": {"median": round(statistics.median([r[1] for r in ok]), 1) if ok else None, "p95": p95([r[1] for r in ok]), "max": round(max(r[1] for r in ok), 1) if ok else None},
            "inferenceMs": {"median": round(statistics.median([r[2]["latency"]["inferenceMs"] for r in ok]), 1) if ok else None, "p95": p95([r[2]["latency"]["inferenceMs"] for r in ok])},
            "serverTotalMs": {"median": round(statistics.median([r[2]["latency"]["totalMs"] for r in ok]), 1) if ok else None, "p95": p95([r[2]["latency"]["totalMs"] for r in ok])}}

summary = {"note": "Local Docker emulation on Apple M2 (linux/arm64 VM), t4g.small-like container limits. Phases 1-2 bypass nginx with the API rate limit raised to 600/min; phase 3 uses nginx with its deployed limits. Not an AWS measurement."}
upload(f"{api}/api/v1/inspections", items[0]["image"])  # warm-up, excluded
summary["directSequential"] = summarize([upload(f"{api}/api/v1/inspections", it["image"]) for it in items[1:41]])
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    summary["directConcurrent4"] = summarize(list(pool.map(lambda it: upload(f"{api}/api/v1/inspections", it["image"]), items[41:61])))

session = request(f"{proxy}/api/v1/sessions", json.dumps({"maxAttempts": 3}).encode(), "application/json")
attempt = upload(f"{proxy}/api/v1/sessions/{session[2]['sessionId']}/attempts", items[61]["image"], [("attemptNumber", "1")]) if session[2] else (0, 0, None)
summary["proxySession"] = {"createStatus": session[0], "attemptStatus": attempt[0], "attemptDecision": (attempt[2] or {}).get("inspection", {}).get("decision")}
time.sleep(15)  # let the nginx bucket refill before the burst
with concurrent.futures.ThreadPoolExecutor(max_workers=15) as pool:
    burst = list(pool.map(lambda it: upload(f"{proxy}/api/v1/inspections", it["image"]), items[62:77]))
summary["proxyBurst15"] = {"statuses": dict(sorted({str(s): sum(1 for r in burst if r[0] == s) for s in {r[0] for r in burst}}.items())),
                           "expectation": "nginx admits about 11 (rate 60/min, burst 10) and answers the rest 429; no 503"}
time.sleep(3)
stop.set()
summary["peakMemoryMiB"] = {name: round(value, 1) for name, value in sorted(peaks.items())}
(out / "load.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=1))
EOF
for container in $("${compose[@]}" ps -q); do docker inspect --format '{{.Name}} oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}} status={{.State.Status}}' "$container"; done | tee "$outputDir/oom.txt"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' | grep "$project" > "$outputDir/stats-after.txt"
"${compose[@]}" down -v > /dev/null 2>&1
echo "results in $outputDir"
