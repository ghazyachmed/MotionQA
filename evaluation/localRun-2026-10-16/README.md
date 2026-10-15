# Local agent run — 2026-10-16

Executed on the PR #2 branch (`feat/local-agent-evaluation-kit`) following `docs/LOCAL_AGENT_HANDOFF.md`.
Everything here is **public-benchmark development evidence** (VisA `pcb1`, already used to build and tune the model).
Nothing here is an independent evaluation, a field result, or an AWS deployment.

Hardware: Apple M2 (4 performance + 4 efficiency cores), 16 GiB, macOS 26.6.2 arm64, on battery power.

## 1. Dependencies and the reported cv2 Bus error

| Check | Result | File |
| --- | --- | --- |
| `pip install -r backend/requirements-dev.lock` into clean venvs | Resolved without substitution on Python 3.11.15 and 3.12.13; `pip check` clean | — |
| `import cv2` in a subprocess (`-X faulthandler`) | Exit 0 on both clean venvs and the project venv: OpenCV 5.0.0, NumPy 2.4.6, `cv2.dnn.ENGINE_NEW` present | `cv2-import-probe-macos.txt` |
| Handoff's native **Bus error** importing cv2 | **Not reproduced** on macOS arm64. The handoff environment's OS/CPU are not recorded, so the cause is unknown. Linux arm64 import passed in the Docker image built on 2026-10-15. | — |
| linux/amd64 import probe (Docker, emulated) | **NOT RUN**: Docker Desktop quit during the image pull (its UI log shows `before-quit` shortly after a settings event; the cause was not confirmed), and the agent did not restart it a third time. Command below. | — |

## 2. Tests

| Suite | Python 3.11.15 | Python 3.12.13 | File |
| --- | --- | --- | --- |
| `backend/` `pytest -q -rs` | 75 passed, 0 skipped | 75 passed, 0 skipped | `pytest-python3.11.txt`, `pytest-python3.12.txt` |
| `tests/test_frozen_protocol.py` (repo root) | 7 passed | 7 passed | same files |
| Frontend `tsc`, Vitest, production build | ok, 11 passed, built | — | `frontend-checks.txt` |

The 75 backend tests include `testProspectiveCollection.py::testFrozenSequenceWithRealPipeline`: seal → `frozenInference
predict` with the real `InspectionPipeline` → verify → score, on synthetic fixtures. The PR's own
`testFrozenInference.py` predict test uses a fake pipeline.

## 3. Public photos

`python -m motionQa.evaluation.preparePublicPhotos --download ...` reused the local archive after verifying SHA-256
`2eb8690c…f362` (1,929,840,640 bytes); no new download was needed. Output: `artifacts/public-photos-001/`
(contact sheet, `photo_sources.json` with per-photo SHA-256 and prior development use). The three "normal" photos are
memory-bank images; `Anomaly/002` was used for threshold selection; `Anomaly/000` and `001` belong to the reused test split.

## 4. Model restore and reproduction

The profile in `backend/models/visaPcb1/` loaded with verified checksums. A full rebuild from scratch into a separate
directory (`rebuild/visaPcb1Results.json`, status `EXPLORATORY_TEST_INFORMED`) produced identical feature-model and
memory-bank SHA-256, identical thresholds and model selection, and identical decisions and scores for all 153 test-split
images (`reproducibility.json`). This shows determinism on this machine, not accuracy.

## 5. Real-inference demo (authenticated local API)

`MOTIONQA_TOKEN=… python -m motionQa.evaluation.runLocalDemo --output ../artifacts/local-demo-001` against uvicorn +
PostgreSQL 16 + Redis. Results: `artifacts/local-demo-001/demo_results.json`, tiled evidence `demo_overlays_sheet.jpg`.

| Image (prior use) | Decision · reason |
| --- | --- |
| Normal/0000, 0001, 0002 (bank) | PASS — uninformative: these images are in the memory bank |
| Anomaly/000, 001 (test), 002 (validation) | FAIL · score at/above FAIL threshold (bent pins localized) |
| Normal/0011 (test) | PASS |
| Normal/0027 (test) | REVIEW · score in review band |
| Anomaly/048 (test, missing header pin) | **PASS — a missed defect**, as in the exploratory run |
| Anomaly/043 (test, both transducers missing) | NO_PART · part not recognized (misleading reason; not a PASS) |
| Normal/0011, synthetic Gaussian blur | RETAKE · BLURRED |
| Any image, API started with a missing profile | ERROR · MODEL_UNAVAILABLE; health 503 (`missing_model_error.txt`) |

Checks in the same run: missing token → 401; text upload → 415; retry with the same inspection id → 200 with
`Idempotent-Replay: true`; review of the REVIEW case to PASS → machine decision REVIEW kept, final PASS, status OVERRIDDEN.

Image selection was made to show each outcome; the outcomes are not a sample and must not be counted as accuracy.

## 6. Latency and memory (macOS arm64, single uvicorn worker)

From `api-memory-macos.txt` (40 sequential test-split uploads, 1404×1070 JPEG, model input 448×448):

| Measure | Median | p95 |
| --- | --- | --- |
| Client round trip (HTTP upload → response, includes DB write) | 165.9 ms | 256.2 ms |
| Server total (decode → evidence stored) | 157.2 ms | 246.8 ms |
| Model step only (DNN forward + nearest-neighbour scoring) | 96.7 ms | 149.8 ms |

API process resident memory: 143 MB after start-up, 462 MB after 40 inspections, 463 MB after 120 (plateau). PostgreSQL,
Redis, nginx, Docker, and the OS are not included, and Linux memory was not measured, so fitness for `t4g.small`
(2 GiB) is **not established**.

## 7. Not done here (owner action or unavailable)

- AWS account check: Claude in Chrome had no connected browser; no AWS CLI or credentials on this machine.
  **AWS: NOT DEPLOYED.** Owner steps: `docs/AWS_FREE_PLAN.md`.
- Prospective photos, physical parts, human labels: none exist. **Prospective evaluation: NOT RUN.** Tooling and
  procedure: `docs/PROSPECTIVE_COLLECTION.md`.
- Docker checks to run when Docker Desktop is available:

```bash
docker run --rm --platform linux/amd64 python:3.11-slim sh -c "pip install -q opencv-python-headless==5.0.0.93 numpy==2.4.6 && python -X faulthandler -c 'import cv2; print(cv2.__version__)'"
docker compose -f dockerCompose.yml up -d --build postgresDb redisCache backendApi frontendUi && docker stats --no-stream
```
