# MotionQA

MotionQA is a visual-inspection MVP. An operator uploads or captures one image of a part; the server runs an OpenCV 5
pipeline and returns one of six decisions — `NO_PART`, `RETAKE`, `REVIEW`, `PASS`, `FAIL`, `ERROR` — with the reason,
raw scores, thresholds, model version, latency, and stored image evidence. `FAIL` and `REVIEW` go to a human review queue;
the machine decision is never overwritten.

The intended target is component inspection on motorcycle production lines. **No target-component data, manufacturer
partnership, or site validation exists.** The shipped model profile is evaluated on a public benchmark (VisA `pcb1`,
HC-SR04 sensor boards), and its results say nothing about motorcycle parts.

| Capability | Status |
| --- | --- |
| Inspection pipeline, decision states, evidence, review, demo/real separation | Implemented, tested locally |
| Recapture sessions (one part, limited retakes, escalation to a reviewer) | Implemented, tested locally |
| Anomaly model on VisA `pcb1` | Evaluated on benchmark data ([docs/EVALUATION.md](docs/EVALUATION.md)) |
| OpenCV 5 runtime (`opencv-python-headless==5.0.0.93`, `cv.dnn` new engine) | Verified locally |
| AWS deployment (CloudFormation, S3 evidence, CloudFront) | Prepared; Linux ARM64 checked under t4g.small-like limits locally; **AWS deployment not executed** |
| Validation on target components / target workplace | Not done |

## Inspection task

Single-part stationary inspection, normal-only anomaly detection: a part is placed in a fixed station, photographed,
and compared with features of known-good parts. Defects are localized (heatmap + regions) but not classified.

Benchmark: VisA `pcb1` (CC BY 4.0, Amazon; `s3://amazon-visual-anomaly/VisA_20220922.tar`), 804 normal images for the
memory bank, 100 normal + 47 anomalous for validation, 100 normal + 53 anomalous for test. Defect types: melt, missing,
bent, scratch. Details, provenance, and the domain gap are in [docs/EVALUATION.md](docs/EVALUATION.md).

## Exploratory results (reused test split, Apple M2 CPU)

Independent evaluation has not run. See [the prospective protocol](docs/INDEPENDENT_EVALUATION.md). Every VisA image,
including this test split, has influenced development; these are development numbers.
See [AWS Free Plan guidance](docs/AWS_FREE_PLAN.md) before provisioning resources.

| Metric (deployed operating point) | MotionQA | OpenCV-only baseline |
| --- | --- | --- |
| Image AUROC, official VisA 1cls test split | 0.974 | 0.861 |
| Missed-defect rate (anomalous → PASS) | 1.9 % (1/53) | 0 % (0/53) |
| False-rejection rate (normal → FAIL) | 4.0 % (4/100) | 7.0 % |
| REVIEW rate | 26.8 % | 37.9 % |
| RETAKE / NO_PART on clean test images | 0 % / 0 % | 0 % / 0 % |
| Synthetic blur, exposure, cut-off, empty scene (360 cases), other objects (50) | 0 PASS | — |
| Server latency per 1404×1070 image (median of one run; 3 runs ranged 92–137 / 155–233 ms) | 94 ms inference, 155 ms end-to-end | — |

Scores are raw nearest-neighbour feature distances, not probabilities. Thresholds were chosen on validation data only.
Decision policy 2 sends parts whose identity falls between validated targets and validated other objects to `REVIEW`
instead of `NO_PART`. Known failures — a missed missing-pin defect (`Anomaly/048`) and an orientation confound in the
data — are analysed in [docs/FAILURE_ANALYSIS.md](docs/FAILURE_ANALYSIS.md).

## Setup

Prerequisites: Python 3.11, Node.js 22 (or 20.19+), PostgreSQL 15+ and Redis 7 (or Docker), ~3 GB free disk.

```bash
git clone https://github.com/ghazyachmed/MotionQA.git && cd MotionQA
cp environmentExample .env          # then set POSTGRES_PASSWORD and MOTIONQA_API_TOKENS

cd backend
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.lock && pip install --no-deps -e .
python -m motionQa.inspection.opencvRuntime     # must report version 5.x and isSupported: true
```

### Model retrieval and build

No model weights are committed. The profile is rebuilt from verifiable sources:

```bash
# 1. Backbone: OpenCV Zoo MobileNetV2 (Apache-2.0), sha256 verified
python -m motionQa.edge.modelRegistry --download-feature-backbone --model-dir models

# 2. Dataset: VisA archive (1.93 GB, CC BY 4.0), checksum verified, pcb1 + 100 other-object images extracted
mkdir -p ../data/downloads
curl -o ../data/downloads/VisA_20220922.tar https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar
python -m motionQa.evaluation.visaDataset

# 3. Build the profile and evaluate (≈10 min on an Apple M2; writes evaluation/results/visaPcb1Results.json)
python -m motionQa.evaluation.runEvaluation
```

Artifacts land in `backend/models/visaPcb1/` (`featureExtractor.onnx`, `memoryBank.npz`, `inspectionProfile.json`).
The API verifies their checksums at start-up; if anything is missing or altered, every inspection returns `ERROR` with
`MODEL_UNAVAILABLE` and `/api/v1/model/status` explains how to rebuild.

### Run locally

```bash
# terminal 1 (backend/, venv active; Postgres and Redis running, values from .env)
uvicorn motionQa.mainApi:createApp --factory --host 127.0.0.1 --port 8000

# terminal 2
cd frontend && npm ci && npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173, paste the operator token into the mode bar, keep **REAL INFERENCE**, and choose
*Inspect photo* with an image from `data/visa/pcb1/Data/Images/` (test-split names are listed in
`evaluation/visaPcb1Split.json`). *Camera* → *Capture & inspect* sends a single webcam frame.

Or with Docker (after building the profile):

```bash
docker compose -f dockerCompose.yml up --build postgresDb redisCache backendApi frontendUi
# UI and same-origin API on http://127.0.0.1:5173
MOTIONQA_TOKEN=<token> deploy/smokeTest.sh http://127.0.0.1:5173 data/visa/pcb1/Data/Images/Normal/0000.JPG
```

### Modes

- **REAL INFERENCE**: the server pipeline produces the decision. Only this path creates `REAL_INFERENCE` records, and only
  these records feed trends, the review queue, and alerts.
- **SIMULATED DEMO**: browser pixel heuristics and forced scenarios (OK / scratch / casting) for presentations. Scores are
  uncalibrated. Events are stored as `SIMULATED_DEMO` whatever the client sends and are excluded from metrics.
  `sampleImages/` holds synthetic renders for this mode only; they contain a coloured status square that leaks the label.
  Sent to real inference they return `RETAKE` (background outside the validated station range).

## Tests

```bash
cd backend && pytest -q                     # unit, pipeline, API tests (synthetic fixtures; no accuracy meaning)
cd frontend && npm test && npm run build    # Vitest + type check + production build
```

## AWS

`deploy/aws/motionQaStack.yaml` provisions one Graviton EC2 instance running the compose stack, a private S3 bucket
(evidence with expiry, model artifacts, releases), Secrets Manager secrets, CloudWatch Logs, and CloudFront for HTTPS.
Steps and cost assumptions: [docs/SUBMISSION_READINESS.md](docs/SUBMISSION_READINESS.md). **AWS deployment not executed**
for lack of credentials; no AWS endpoint or cloud measurement exists yet.

## Known limitations

- Benchmark-only model; no motorcycle-part data. Needed data is listed in [docs/EVALUATION.md](docs/EVALUATION.md).
- About a third of good boards on the test split go to `REVIEW` at the deployed operating point (zero validation misses);
  other operating points are tabulated in the evaluation.
- A missing component that exposes ordinary background can be passed (`Anomaly/048`); the patch memory has no notion of
  where a component should be.
- Recapture guidance keeps the fixture, camera, and lighting fixed; other viewpoints are not supported.
- Capture gates and identity thresholds are calibrated to one benchmark setup; a new station needs new validation images.
- Occlusion is not detected explicitly; dimensional measurement is not supported (no calibration or scale reference).
- Single operator-token model, single instance, no database migrations (`inspection_records` replaces `components_log`).
- MES, OPC-UA, WhatsApp, and email clients exist but have not been tested against real systems.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — pipeline, decision states, counting, API, AWS design
- [docs/EVALUATION.md](docs/EVALUATION.md) — dataset, splits, thresholds, results, latency
- [docs/FAILURE_ANALYSIS.md](docs/FAILURE_ANALYSIS.md) — Anomaly/048 and 043, policy comparison, orientation confound
- [docs/REVIEW_AND_CHANGES.md](docs/REVIEW_AND_CHANGES.md) — historical findings, verification, changes
- [docs/SUBMISSION_READINESS.md](docs/SUBMISSION_READINESS.md) — competition requirements and blockers
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — five-minute demo
- [docs/SUBMISSION_DRAFT.md](docs/SUBMISSION_DRAFT.md) — Devpost submission draft (not submitted)
- [docs/INDEPENDENT_EVALUATION.md](docs/INDEPENDENT_EVALUATION.md) and [docs/PROSPECTIVE_COLLECTION.md](docs/PROSPECTIVE_COLLECTION.md) — sealed prospective protocol, photo-collection tooling, and adapting the profile to another component (NOT RUN)
- [docs/AWS_FREE_PLAN.md](docs/AWS_FREE_PLAN.md) — Free Tier terms and owner account checks (NOT DEPLOYED)
- [evaluation/localRun-2026-10-16/README.md](evaluation/localRun-2026-10-16/README.md) — local agent run: tests, reproduction, real-inference demo
- [evaluation/localRun-2026-10-16b/README.md](evaluation/localRun-2026-10-16b/README.md) — second pass: verification, failure fix, sessions, t4g.small emulation
- [prd.md](prd.md) — product scope and goals

## Attribution

- VisA dataset: Zou et al., "SPot-the-Difference Self-Supervised Pre-training for Anomaly Detection and Segmentation",
  ECCV 2022 (arXiv:2207.14315). CC BY 4.0. Derived artifacts (memory bank, evidence images) inherit the attribution requirement.
- MobileNetV2 weights: OpenCV Zoo (`opencv/image_classification_mobilenet`), Apache-2.0.
- OpenCV: Apache-2.0.
