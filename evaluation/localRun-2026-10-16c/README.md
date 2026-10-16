# Local agent run — 2026-10-16, third pass (AWS deployment preparation)

Nothing was created in AWS; the agent had no AWS access (no CLI, no credentials, no connected browser). Everything below
is a local check on an Apple M2 (Docker Desktop 29.8.0, linux/arm64 VM). **Not an AWS measurement.**

## 1. Simulated t4g.small host (`deploy/aws/localAwsHostCheck.sh`)

A linux/arm64 Docker-in-Docker container stands in for the instance: memory capped at **1,700 MiB** (2 GiB minus an
assumed allowance for Amazon Linux, the SSM agent and kernel reservations), 2 CPUs. Inside it the script runs the same
command as `startStack.sh` — `docker compose -f dockerCompose.yml -f deploy/aws/dockerComposeAws.yml up -d --build` —
with the `.env` reproduced from `startStack.sh` itself. Only CloudWatch logging and S3 evidence are swapped for local
equivalents (`deploy/aws/dockerComposeAwsLocalSim.yml`). Base images and Python/npm packages were downloaded fresh, as on
a new instance.

| Run | Result | Folder |
| --- | --- | --- |
| 1 (committed `dockerCompose.yml`) | **Failed at once**: `required variable MOTIONQA_RTSP_URL is missing a value`. `startStack.sh` does not set it, and compose interpolates the opt-in `edgeProcessor` service too, so the stack could never start on AWS. The README path (`cp environmentExample .env`, where the variable is empty) failed the same way. | `awsHostSim-run1-failed/` |
| 2 (fix: `${MOTIONQA_RTSP_URL:-}`; `edgeProcessor.py` still refuses to run without a URL) | Passed, details below | `awsHostSim/` |

Run 2:

| Check | Result |
| --- | --- |
| Build and start (images built on the host, as on EC2) | exit 0 in 271 s; no OOM or killed process (`oom-build.txt`) |
| Peak memory of the whole host during the build | **476.6 MiB** of 1,700 MiB (`memory-build.txt`, 2-s samples) |
| Health | postgres, redis, model ok (`health.json`) |
| 60 inspections through nginx at the deployed limits (1 per 2.2 s) | 60 × 201; round trip median 699 ms; inference median 592 ms; server total 678 ms (`load.json`) |
| Recapture session through nginx | create 201, attempt 201, decision PASS |
| Peak memory of the whole host while serving | **709.7 MiB** of 1,700 MiB (`memory-serve.txt`) |
| OOM kills / restarts | none for any container or the host (`oom-serve.txt`) |
| Docker disk use | images 1.17 GB, build cache 1.11 GB, volumes 48 MB (`disk-usage.txt`) — the 30 GB root volume has ample room |

Differences from AWS: Docker Compose inside the simulation was v5.6.0 (the instance pins v5.5.1); the M2's cores are not
Graviton2 cores and the instance's CPU-credit baseline is not emulated, so latency on AWS will differ.

## 2. Script dry runs against a stub AWS CLI

`deploy/aws/teardownStack.sh` and `deploy/aws/inventoryAccount.sh` were run with a stub `aws` on `PATH` that logs calls
and returns canned answers (the stub lives in the agent's scratchpad, not in the repository).

| Case | Result |
| --- | --- |
| Teardown, wrong confirmation | "Not confirmed; nothing deleted", exit 1, no delete call made |
| Teardown, confirmed | calls in order: delete-stack (via the service role) → wait → bucket versioning check → empty bucket → delete bucket → leftover checks; exit 0 |
| Teardown, an instance left behind | `LEFT: running or stopped instances of the stack`, exit 1 |
| Inventory | reports buckets, a permission-denied service as "not readable", an instance in a second region; 33 calls, none of them mutating |

`cfn-lint` 1.57.2: no findings for `motionQaStack.yaml` and `deployerAccess.yaml` after the deployer policy gained the
teardown permissions.

## 3. Prices and terms

Unit prices were read from AWS's public price files on 2026-10-16 (publication dates in `deploy/aws/estimateCost.py`);
plan terms from AWS documentation. Summary and sources: [docs/AWS_DEPLOYMENT_PLAN.md](../../docs/AWS_DEPLOYMENT_PLAN.md).
