# Local agent run — 2026-10-16, second pass

Branch `feat/failure-analysis-and-retake-sessions`, cut from `0c7527e` (PR #2 merge, `origin/master`). Everything here is
**development evidence** on the public VisA `pcb1` benchmark, every image of which has now influenced development.
Nothing here is an independent evaluation, a field result, or an AWS deployment.

Hardware: Apple M2 (4P + 4E cores), 16 GiB, macOS 26.6.2 arm64. Docker Desktop 29.8.0 (linux/arm64 VM, 8 CPUs, 7.7 GiB).

## 0. Repository state at start

| Item | Observed |
| --- | --- |
| PR #2 | Merged on GitHub as `0c7527e`; `de0898c` is its last branch commit |
| Local `master` | One unpushed owner commit `b55315d` (revert of `de0898c`), never pushed |
| Work branch | New branch from `0c7527e`; no local changes were overwritten |
| Outcome | At the owner's request the work was merged into `master` as one commit and all other branches were deleted; `master` follows `origin/master`, so `b55315d` is not on it |

## 1. Verification of the first-pass report (`evaluation/localRun-2026-10-16/`)

| Claim | Method | Result |
| --- | --- | --- |
| Backend 75 passed, frozen-protocol 7 passed (Python 3.11 and 3.12) | **Re-run** in the clean lock-file venvs | 75 / 7 on both — matches |
| Frontend `tsc`, 11 Vitest tests, build | **Re-run** | ok / 11 passed / built — matches |
| VisA archive SHA-256 `2eb8690c…f362` | **Re-computed** | matches |
| Feature model and memory bank checksums in the profile | **Re-computed** | match; memory bank also matches `reproducibility.json` |
| Contact-sheet photo hashes (`artifacts/public-photos-001/photo_sources.json`) | **Re-computed** | all match |
| 11 real-inference demo decisions (`artifacts/local-demo-001/demo_results.json`) | **Re-run in process** (same images and synthetic blur, policy-1 profile, no API) | 11 / 11 reproduced |
| Clean rebuild gives identical 153 test decisions | Read-only comparison of the two results files | identical |
| Latency and memory figures of the first pass | Read-only | not re-measured (machine state differs per run; see § 6) |

## 2. Failure analysis and fix

Full tables: [docs/FAILURE_ANALYSIS.md](../../docs/FAILURE_ANALYSIS.md); data:
`evaluation/results/failureAnalysis-2026-10-16.json` (`python -m motionQa.evaluation.failureAnalysis`).

- `Anomaly/048` (PASS, missing header pin): cause verified — position-agnostic patch memory; the defect region looks like
  normal background. Two candidate channels were measured and rejected. **Not fixed**; strict `xfail` regression test.
- `Anomaly/043` (NO_PART, both transducers missing): cause verified — the policy-1 identity midpoint lay inside an
  unvalidated gap. **Fixed** with decision policy 2 (identity uncertain → `REVIEW · PART_IDENTITY_UNCERTAIN`).
- New finding: orientation confound (49 of 53 defective test boards pins-down vs 25 of 100 normal).

## 3. Old vs new decision policy (1,564 development inspections)

`evaluation/results/policyComparison-p1-vs-p2.json` (`python -m motionQa.evaluation.comparePolicies`).

| Outcome | Policy 1 | Policy 2 |
| --- | --- | --- |
| False PASS, defective | 1 | 1 |
| False PASS, wrong object or capture fault | 0 | 0 |
| False FAIL, normal | 12 | 12 |
| REVIEW | 246 | 249 |
| RETAKE | 373 | 373 |
| NO_PART | 88 | 85 |
| ERROR | 0 | 0 |

Changed: `Anomaly/043`, `pcb2/Normal/0809`, `pcb2/Normal/0881`, each `NO_PART → REVIEW`. The policy-1 profile is kept at
`evaluation/policies/visaPcb1-policy1-profile.json`. The full evaluation was re-run with policy 2
(`evaluation/results/visaPcb1Results.json`): model, memory bank and thresholds byte-identical; test split REVIEW 26.8 %,
NO_PART 0 %.

## 4. Recapture sessions

`POST /api/v1/sessions`, `POST /api/v1/sessions/{id}/attempts`, `GET /api/v1/sessions/{id}`; policy in
`backend/motionQa/inspection/sessionPolicy.py`. One part = one session; every photo is a normal inspection record linked
to the session. `RETAKE`, `NO_PART` and `ERROR` allow another attempt with guidance that keeps fixture, camera and
lighting unchanged (no new angles); `PASS`, `FAIL`, `REVIEW` close the session. After the limit (default 3, maximum 5)
the session is `ESCALATED` with final `REVIEW · RECAPTURE_LIMIT_REACHED`, and the last attempt enters the review queue.
Tests: `backend/tests/testSessionFlow.py` (8, including linking a stored-but-unlinked attempt on retry).

Browser check (in-app Chromium, Docker stack with the t4g.small-like limits, real pipeline, VisA test images):

| Captures in one part session | UI result |
| --- | --- |
| Blurred `Normal/0011` → original `Normal/0011` | `1: RETAKE` (attempt 1 of 3, re-seat guidance, 2 left) → `2: PASS`, session Complete |
| Darkened → blurred → blurred copy of `Normal/0011` | lighting guidance → re-seat guidance → `ESCALATED`, "Sent to human review"; attempt `-a03` appears in the review queue (1 pending) |
| `Anomaly/043` | `REVIEW · PART_IDENTITY_UNCERTAIN`, score 5.09, regions shown; session Complete |
| *New part* | session tile cleared |

The first browser attempt showed **no session tile**: the component was defined but never rendered, and `tsc` did not
flag it. Fixed, and `noUnusedLocals` is now on, so `tsc` reports such dead components (TS6133). Phone width (375 px):
no horizontal overflow. Screenshots: `ui/session-attempt1-retake.jpg`, `ui/anomaly043-identity-review.jpg`.

## 5. Adapting to the owner's component

`python -m motionQa.evaluation.buildComponentProfile fit-check|build` — see
[docs/PROSPECTIVE_COLLECTION.md § 8](../../docs/PROSPECTIVE_COLLECTION.md). Uses development photos only, partitions by
physical part, refuses label files that contain final-test images, and marks its output
`DEVELOPMENT_PROFILE_NOT_VALIDATED`. **Not run on real photos: none exist yet.**

## 6. Linux ARM64 under t4g.small-like limits (`t4gSmall/`)

`deploy/aws/localT4gSmallCheck.sh` — local Docker emulation (linux/arm64 VM on the M2) with container limits that fit a
2 vCPU / 2 GiB instance: API 1 GiB + 2 CPUs, Postgres 256 MiB, Redis 64 MiB, nginx 64 MiB. **Not an AWS measurement**;
t4g CPUs and the instance's CPU-credit baseline are not emulated.

| Check | Result | File |
| --- | --- | --- |
| Frontend `npm ci` + build under a 1 GiB cap | `FRONTEND_BUILD_OK` | `build-frontend-1g.txt` |
| Backend runtime lock install + `import cv2` under 1 GiB | `BACKEND_DEPS_OK 5.0.0` | `build-backend-1g.txt` |
| Stack health | postgres, redis, model ok | `health.json` |
| OpenCV threads in the API container | 2 (follows the CPU quota) | `opencv-threads.txt` |
| 40 sequential inspections, direct to API | 40 × 201; round trip median 679 ms (p95 787); inference median 496 ms (p95 601) | `load.json` |
| 20 inspections, 4 concurrent, direct to API | 20 × 201; round trip median 3.0 s (max 3.2 s); inference median 1.06 s | `load.json` |
| Recapture session through nginx | create 201, attempt 201, decision PASS | `load.json` |
| 15 simultaneous inspections through nginx | 11 × 201, 4 × 429 (nginx 60/min, burst 10) | `load.json` |
| Peak memory during load | API 556.5 MiB / 1 GiB; Postgres 64.7 / 256; Redis 10.8 / 64; nginx 9.1 / 64 MiB | `load.json` |
| OOM kills / restarts | none | `oom.txt` |

Throughput is about 1.3–1.5 inspections/s on two cores whether requests are sequential (1 / 0.68 s) or concurrent
(4 / 3.0 s); concurrency only adds waiting time. Run 1 (`run1-throttled.log`) sent load through the deployed rate limits, got 429 from the API (30/min) and
**503** from nginx, and is not usable for latency. Two changes followed: nginx now answers 429 (`limit_req_status`), and
session attempts share nginx's inspection limit. For run 2 the API limit was raised to 600/min by environment variable for
the direct phase only; the nginx phase kept deployed limits.

## 7. Tests after the changes

| Suite | Result | File |
| --- | --- | --- |
| Backend, Python 3.11 and 3.12 (clean lock-file venvs) | 91 passed, 1 xfailed (048) | `pytest-python3.11.txt`, `pytest-python3.12.txt` |
| Frozen protocol (repo root) | 7 passed | same files |
| Frontend `tsc`, Vitest, build | ok, 11 passed, built | `frontend-checks.txt` |

## 8. Not done here

- AWS account, plan, credits, expiry and service availability: **NOT CHECKED** (no AWS credentials on this machine;
  Claude in Chrome not connected). **NOT DEPLOYED.**
- Independent evaluation: **NOT RUN** (needs physical parts, a custodian and a reviewer).
- Owner's component profile: tooling only; no photos.
