# Evaluation

> **Evaluation qualification (2026-10-15):** Existing VisA results are exploratory, not a fresh independent test. Capture gates changed after test inspection; official-test AUROC includes validation anomalies. Independent evaluation has NOT RUN. Follow [the prospective protocol](INDEPENDENT_EVALUATION.md).

> **Reproduction (2026-10-16):** a clean rebuild reproduced every artifact checksum, all thresholds, and all 153 test-split decisions (`evaluation/localRun-2026-10-16/reproducibility.json`). This shows determinism on one machine, not independence or accuracy.

All numbers come from `evaluation/results/visaPcb1Results.json`, written by
`python -m motionQa.evaluation.runEvaluation` on 2026-10-15. They describe a **public benchmark task**, not motorcycle
components or any production line.

## 1. Task and claims

- Task: single-part stationary inspection, normal-only anomaly detection, on VisA `pcb1` (HC-SR04 ultrasonic sensor
  boards photographed on dark fabric, 1404×1070 JPEG).
- Defect scope: what VisA labels for `pcb1` — melt, missing (transducer cover, mesh, or component), bent (header pins),
  scratch, and combinations. The model localizes anomalies; it does not classify defect types.
- Claims supported: benchmark performance under the protocol below, software behaviour under failure scenarios, local latency.
- Claims **not** supported: performance on motorcycle parts, castings, or any other component; performance in a factory;
  dimensional accuracy; calibrated probabilities.

## 2. Dataset provenance

| Item | Value |
| --- | --- |
| Dataset | Visual Anomaly (VisA), Amazon Science |
| Source | `https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar` (AWS Open Data registry, `registry.opendata.aws/visa`) |
| Version | Archive `VisA_20220922.tar`, S3 Last-Modified 2022-09-22 |
| Size / SHA-256 | 1,929,840,640 bytes / `2eb8690c803ab37de0324772964100169ec8ba1fa3f7e94291c9ca673f40f362` (pinned in `visaDataset.py`) |
| License | CC BY 4.0 (registry entry and `LICENSE-DATASET` in the archive) |
| Citation | Zou et al., SPot-the-Difference Self-Supervised Pre-training for Anomaly Detection and Segmentation, ECCV 2022, arXiv:2207.14315 |
| Category used | `pcb1`: 1,004 normal, 100 anomalous images with pixel masks |
| Other-object images | First 10 normal images of 10 other VisA categories (candle, capsules, cashew, chewinggum, fryum, macaroni1, pcb2, pcb3, pcb4, pipe_fryum), used only for `NO_PART` / wrong-object tests |

## 3. Splits

Deterministic (seed `20261015`), written to `evaluation/visaPcb1Split.json` by `python -m motionQa.evaluation.visaDataset`.

| Split | Normal | Anomalous | Built from | Used for |
| --- | --- | --- | --- | --- |
| bank | 804 | 0 | official 1cls train normals minus validation holdout | memory bank (normal-only "training") |
| validation | 100 | 47 | 100 train normals held out + half of official test anomalies, stratified by defect label | model selection, decision thresholds, capture-gate thresholds, identity threshold |
| test | 100 | 53 | official test normals + remaining anomalies | all reported decision metrics |
| officialTest | 100 | 100 | unmodified official 1cls test split | threshold-free AUROC for comparison with published work |
| other-object validation / test | 50 / 50 | — | other VisA categories | identity threshold (validation), wrong-object scenarios (test) |

Correlation: VisA publishes no physical-item or capture-session identifiers, so correlated captures cannot be kept in the
same split. If several images show the same board, validation and test results are optimistic.

## 4. Model

| Item | Value |
| --- | --- |
| Method | PatchCore-style nearest-neighbour anomaly scoring (normal-only; no defect images used to build the bank) |
| Backbone | OpenCV Zoo `image_classification_mobilenetv2_2022apr.onnx`, Apache-2.0, SHA-256 `c0c3f76d…2ad5`, from `huggingface.co/opencv/image_classification_mobilenet` |
| Feature model | Derived ONNX with outputs `365` (stride 8, 32 ch) and `426` (stride 16, 96 ch), dynamic H×W; SHA-256 `742edd54…41a6` |
| Runtime | `cv.dnn.readNetFromONNX(path, cv.dnn.ENGINE_NEW)`, CPU; OpenCV 5.0.0 (`opencv-python-headless==5.0.0.93`) |
| Input | 1×3×448×448 float32, RGB, `(pixel/255 − mean)/std`, mean (0.485, 0.456, 0.406), std (0.229, 0.224, 0.225); square crop around the located part with 6 % margin |
| Patch features | 3×3 local mean of each level, coarse level resized to 56×56, concatenated → 128-d per patch |
| Scoring region | part hull dilated by 25 % of the crop side (includes header pins) |
| Memory bank | 16,000 patches (greedy coreset from a 25 % sample of masked patches of 804 images) + 804 global features; SHA-256 `396c4d74…8124` |
| Output interpretation | Image score = maximum of the Gaussian-smoothed (σ = 4) patch distance map inside the scoring region. Raw distance, **not a probability**. Identity distance = 1 − max cosine similarity of the image's mean patch feature to the bank images' features. |
| Class mapping | None; anomalies are reported as `anomaly` with regions |
| Build time | 118.6 s for the bank on the Apple M2 (CPU) |

Model selection used validation data only, with a 300-image bank:

| Input | Scoring region | Validation image AUROC |
| --- | --- | --- |
| 320 | hull | 0.961 |
| 320 | dilated | 0.982 |
| 320 | full crop | 0.898 |
| 448 | hull | 0.989 |
| **448** | **dilated** | **0.991** (selected) |
| 448 | full crop | 0.919 |

## 5. Thresholds (validation only)

| Threshold | Value | Rule |
| --- | --- | --- |
| `passBelow` | 2.160 | Highest value at which validation missed defects ≤ 2 % (0 of 47 allowed) |
| `failAtOrAbove` | 2.594 | Lowest value at which validation false rejections ≤ 2 % (2 of 100 allowed) |
| `identityMaxDistance` | 0.151 | Midpoint between the largest validation target distance (0.084) and the smallest other-object validation distance (0.217) |
| Region threshold | 2.160 | Connected regions of the anomaly map ≥ `passBelow` become evidence boxes |
| Capture gates | see results JSON `thresholds.capture` | Margins around the range of validation normals: frame mean luminance [0.236, 0.764], frame clipping (dark ≤ 0.150, bright ≤ 0.210), background median luminance [0.245, 0.741], part area fraction [0.197, 0.423], silhouette edge sharpness ≥ 114.3 (0.85 × 1st percentile) |

Capture-gate check on validation images only:

| Validation input | Outcome |
| --- | --- |
| 100 clean normals | 100 pass the gates |
| 47 clean anomalies | 47 pass the gates |
| 30 normals × mild blur (σ = 0.3 % of long side) | 30 `RETAKE · BLURRED` |
| 30 × strong blur (σ = 0.8 %) | 30 `RETAKE · BLURRED` |
| 30 × underexposure (×0.15) | 30 `RETAKE · UNDEREXPOSED` |
| 30 × overexposure (×3 + 60) | 30 `RETAKE · OVEREXPOSED` |
| 30 × part shifted across the frame edge | 30 `RETAKE · PART_CUT_OFF` |
| 30 × empty scene (background colour + noise) | 30 `NO_PART · PART_NOT_FOUND` |

## 6. Results on the test split (100 normal, 53 anomalous)

Threshold-free:

| Metric | Model | OpenCV-only baseline |
| --- | --- | --- |
| Image AUROC, test split | **0.975** | 0.869 |
| Image average precision, test split | 0.952 | — |
| Image AUROC, official VisA 1cls test split (100/100) | **0.974** | 0.861 |
| Image AUROC, validation | 0.985 | 0.931 |

Baseline: ECC-aligned (`cv.findTransformECC`, Euclidean, 0° and 180° initializations) per-pixel z-score against a mean
template of 250 bank crops, with the same thresholding procedure. No learned weights.

Inspection decisions at the deployed operating point:

| True class | PASS | FAIL | REVIEW | RETAKE | NO_PART | ERROR |
| --- | --- | --- | --- | --- | --- | --- |
| Normal (100) | 60 | 4 | 36 | 0 | 0 | 0 |
| Anomalous (53) | **1** | 47 | 4 | 0 | 1 | 0 |

| Key metric | Model | Baseline |
| --- | --- | --- |
| Missed-defect rate (anomalous → PASS) | **1.9 %** (1/53) | 0.0 % (0/53) |
| False-rejection rate (normal → FAIL) | 4.0 % (4/100) | 7.0 % (7/100) |
| REVIEW rate (all test images) | 26.1 % | 37.9 % |
| RETAKE rate | 0.0 % | 0.0 % |
| NO_PART rate | 0.7 % (1 anomalous image) | 0.0 % |
| Automatic decisions (PASS + FAIL) | 73.2 % | 62.1 % |
| Accuracy of automatic decisions | 95.5 % | 92.6 % |

The baseline reaches 0 % missed defects only by sending 58 % of anomalous boards to REVIEW; it has more false rejections
and more reviews. Neither result transfers to other parts.

Per defect label (anomalous test images):

| Label | n | PASS | FAIL | REVIEW | NO_PART |
| --- | --- | --- | --- | --- | --- |
| melt | 23 | 0 | 21 | 2 | 0 |
| missing | 9 | 1 | 6 | 1 | 1 |
| bent | 7 | 0 | 7 | 0 | 0 |
| scratch | 7 | 0 | 7 | 0 | 0 |
| combinations (bent+melt, melt+missing, melt+scratch ×3, melt+scratch+missing, scratch+missing) | 7 | 0 | 6 | 1 | 0 |

Failure analysis:

- The one missed defect (`Anomaly/048.JPG`, "missing") scored 2.125, just under `passBelow` (2.160).
- `Anomaly/043.JPG` ("missing": both transducers absent) scored 5.09 but its identity distance (0.155) exceeded
  `identityMaxDistance` (0.151), so it was reported as `NO_PART · PART_NOT_RECOGNIZED`. It is not a PASS, but the reason
  is misleading. Proposed fix (not applied, to avoid another test-informed change): route identity distances between the
  validated target maximum and the other-object minimum to `REVIEW`.
- The four false rejections (`Normal/0306, 0333, 0730, 0920`) scored 2.60–3.73.
- 36 % of good boards go to REVIEW: the 0-miss validation target places `passBelow` near the median normal score (2.14).

Operating points (thresholds chosen on validation for each missed-defect target, applied unchanged to test):

| Validation miss target | `passBelow` / `failAtOrAbove` | Test missed-defect | Test false-rejection | Test REVIEW | Automatic decisions |
| --- | --- | --- | --- | --- | --- |
| ≤ 2 % (deployed) | 2.160 / 2.594 | 1.9 % | 4.0 % | 26.1 % | 73.2 % |
| ≤ 5 % | 2.502 / 2.594 | 7.5 % | 4.0 % | 1.3 % | 98.0 % |
| ≤ 10 % | 2.664 / 2.664 | 18.9 % | 3.0 % | 0.0 % | 99.3 % |

The REVIEW band is how the system trades human effort for missed defects; the choice belongs to the quality owner.

## 7. Capture faults and wrong objects (test images)

| Scenario (60 test images: 40 normal + 20 anomalous; synthetic fault on real images) | Outcome |
| --- | --- |
| Mild blur | 60 RETAKE (BLURRED) |
| Strong blur | 60 RETAKE (BLURRED) |
| Underexposure | 60 RETAKE (UNDEREXPOSED) |
| Overexposure | 60 RETAKE (OVEREXPOSED) |
| Part cut off by the frame edge | 60 RETAKE (PART_CUT_OFF) |
| Empty scene | 60 NO_PART (PART_NOT_FOUND) |
| 50 real images of other objects (other VisA categories) | 0 PASS, 0 FAIL, 0 REVIEW; 16 NO_PART (11 not recognized, 5 not found), 34 RETAKE (27 underexposed, 3 blurred, 3 scale, 1 cut off) |

No synthetic fault or wrong object produced PASS. Wrong objects often receive `RETAKE` because the capture gates run before
the identity check; the reason then describes a capture mismatch rather than a wrong part.

## 8. Latency

| Item | Value |
| --- | --- |
| Hardware | Apple M2 (4 performance + 4 efficiency cores), 16 GiB, macOS 26.6.2, on battery power |
| Software | Python 3.11.15, OpenCV 5.0.0 (NEON baseline), NumPy 2.4.6, single process, CPU only |
| Input | 1404×1070 JPEG (~250 KB) from the test split; model input 448×448 |
| Samples | 59 sequential inspections (first excluded and reported as cold) |
| Method | `time.perf_counter` around each stage inside `InspectionPipeline.inspect`, local evidence store |

| Stage | Median | p95 |
| --- | --- | --- |
| JPEG decode (`cv.imdecode`) | 4.4 ms | 4.7 ms |
| Capture gates (localization, exposure, silhouette sharpness) | 37.1 ms | 39.1 ms |
| **Inference** (DNN forward + nearest-neighbour scoring + anomaly map) | **91.6 ms** | 93.3 ms |
| Evidence rendering, JPEG encoding, storage | 56.9 ms | 60.4 ms |
| **End-to-end, server side** (decode → stored evidence) | **190.6 ms** | 195.3 ms |
| Cold start: profile + model load | 19.4 ms | — |
| Cold start: first inspection | 241.4 ms | — |

Not included: HTTP upload time, database write, browser rendering, Python import/process start. Single smoke-test
requests through the full stack measured 292 ms (local uvicorn) and 382 ms (docker compose with nginx) server-side
totals; these are single observations, not benchmarks. No AWS latency has been measured.

## 9. Software tests (synthetic fixtures; no accuracy meaning)

- Backend: `cd backend && pytest -q` → 66 passed. Covers decision bands, detector no-PASS rule, capture gates (empty scene,
  blur, underexposure, cut-off, local defects not mistaken for capture faults), invalid uploads (empty, wrong type,
  truncated, oversized, tiny), missing model, invalid model output, inference timeout, inference exception, evidence storage
  failure, tampered memory bank, stale profile, session counting (stationary part, re-entry, short dropout, flicker),
  idempotent retries, demo provenance enforcement, trends excluding simulated events, review preserving the machine
  decision, evidence access control, publication failure reporting, rate limiting, WebSocket token check, S3 evidence store.
- Frontend: `cd frontend && npm test` → 11 passed (demo heuristic labelling, forced-scenario flag, one event per placement,
  metrics without treating REVIEW/RETAKE as pass or fail, stream payload validation); `tsc --noEmit` and `npm run build` pass.

## 10. End-to-end runs (local)

- Uvicorn against PostgreSQL 16.14 and Redis 7 (Homebrew), operator token required: `deploy/smokeTest.sh` passed
  (health, model status with OpenCV 5.0.0, 401 without token, inspection, idempotent replay, evidence download).
  A FAIL inspection was persisted with review status PENDING, delivered over the authenticated WebSocket, and the
  unauthenticated WebSocket was refused. The worker claimed integration dispatch once per inspection.
- Browser (in-app Chromium, 1024 px and 375 px wide): REAL INFERENCE upload → FAIL with evidence overlay and score bar;
  review → final decision with "Machine: Fail" retained; REVIEW result for a borderline normal board; invalid upload →
  visible HTTP 415 message; SIMULATED DEMO → amber mode bar, uncalibrated heuristic score, record stored as
  `SIMULATED_DEMO`; demo publication without a token → "Not recorded: HTTP 401".
- Docker 29.8.0 (aarch64): both images built from the lock files; the in-image OpenCV 5 check passed; the compose stack
  (Postgres, Redis, API, nginx) passed the same smoke test through the nginx same-origin proxy; API container health check
  reported healthy.

## 11. Reproduce

```bash
cd backend && . .venv/bin/activate
python -m motionQa.edge.modelRegistry --download-feature-backbone --model-dir models
python -m motionQa.evaluation.visaDataset            # needs ../data/downloads/VisA_20220922.tar
python -m motionQa.evaluation.runEvaluation          # ≈10 min on an Apple M2
```

Model selection, the memory bank, and decision thresholds were identical across the three full runs of this round. Capture
gates changed twice after test outcomes were seen (see REVIEW_AND_CHANGES.md, N10); earlier result files are in
`evaluation/results/history/`.

## 12. Domain gap and data required for target validation

VisA `pcb1` differs from motorcycle components in material (FR-4 boards vs. cast aluminium, steel, painted or plated
surfaces), geometry (flat boards vs. 3D parts with self-occlusion), defects (melt/missing/bent pins vs. porosity, cracks,
scratches, burrs, dents), and imaging (diffuse studio light vs. specular metal and line lighting).

Minimum data to validate MotionQA on one target component (estimates for an MVP, to be refined with the quality owner):

- One part number and one station: fixed camera, lens, lighting, and fixture, documented.
- Normal: ≥ 300 images from ≥ 100 distinct physical parts across several shifts and production lots, with part serials so
  splits can be grouped by part.
- Defective: ≥ 50 images per defect type of interest from distinct parts, labelled by the quality team, with pixel masks
  for a subset; include borderline cases the quality team accepts.
- Capture faults recorded at the station (blur, glare, misplacement, empty fixture) for gate validation.
- Grouped train/validation/test split by part serial and capture day; thresholds set with the quality owner's
  missed-defect and false-rejection targets; a shadow-mode period comparing MotionQA with existing manual inspection.
