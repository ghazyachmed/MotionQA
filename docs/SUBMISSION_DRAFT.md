# Submission draft — OpenCV AI Competition 2026

**Draft only. Not submitted.** Requirements re-read at https://opencv26.devpost.com/, `/rules` and `/updates` on
2026-10-16 (second pass, in-app browser): final projects due **26 October 2026, 11:59 p.m. Pacific Time** (page
header: "Oct 27, 2026 @ 1:45pm GMT+7", 14 minutes earlier — plan for the header time); every entry must use OpenCV 5 for
substantive image or video analysis **and run a meaningful component on AWS**. The Updates tab shows only the grant
notification post. The rules allow judges to reject entries that misrepresent capabilities, results, benchmarks, or the
role of human review. Submission is an owner action.

## Requirement checklist (live list, paraphrased)

| Requirement | Status 2026-10-16 | Evidence / gap |
| --- | --- | --- |
| Technical report: problem, users, architecture, OpenCV 5, AWS deployment, evaluation, limitations, responsible use | Draft below; AWS section blocked | This file + linked docs |
| Judge-accessible repository | Repo exists; all work merged into `master` (2026-10-16) | Confirm judge access (owner) |
| Pinned dependencies; build, deployment, test instructions | Done | `backend/requirements-*.lock`, `package-lock.json`, `readme.md` |
| Architecture diagram with OpenCV 5 and AWS components | Done (AWS part is a design) | `docs/ARCHITECTURE.md` |
| Working web endpoint **or** arranged live screen-share | **Missing** | AWS NOT DEPLOYED; local demo runs (`evaluation/localRun-2026-10-16/`) |
| Video ≤ 5 minutes: team, app working, architecture, results | **Missing** | Script: `docs/DEMO_SCRIPT.md` |
| Evaluation evidence incl. failures and limitations | Development benchmark only; failure analysis done | `docs/EVALUATION.md`, `docs/FAILURE_ANALYSIS.md`, `docs/INDEPENDENT_EVALUATION.md` (NOT RUN) |
| Core rule: meaningful AWS component | **Not met** | Owner account check pending: `docs/AWS_FREE_PLAN.md` |

Special awards: COOL not used; no agentic loop. No special-award eligibility is claimed.

## Devpost fields (draft)

**Project name:** MotionQA

**Elevator pitch (≤ 200 characters):**
> Single-photo part inspection with OpenCV 5 that answers PASS, FAIL, REVIEW, RETAKE, NO_PART or ERROR, shows its evidence, and sends doubtful parts to a person.

**Built with:** opencv (5.0.0), python, fastapi, onnx, numpy, postgresql, redis, react, typescript, tailwindcss, nginx,
docker, aws-cloudformation *(add AWS services only after they actually run)*.

**Try it out:** repository link · `TODO(owner)`: endpoint URL only after a verified deployment, otherwise state
"live screen-share by arrangement".

**Video:** `TODO(owner)` after recording (≤ 5 min).

**Team:** `TODO(owner)` names and roles. Do not list contributors who did not take part.

## About the project (draft text)

### Problem and users
Visual checks of manufactured parts are often manual and leave little record of what was inspected and why. MotionQA
targets quality inspectors and line supervisors who photograph a part at a fixed station. It is a prototype; no
manufacturer has used it, and no field trial has taken place.

### What it does
An operator uploads or captures one photo. The server returns one decision with a reason, raw scores, the thresholds
used, model version, latency, and an evidence image with the suspicious regions marked. If the photo cannot be judged
(`RETAKE`, `NO_PART`, `ERROR`), the operator retakes it within the same inspection session, with guidance that keeps the
fixture, camera and lighting unchanged; after three attempts the part goes to a person (`REVIEW`). `FAIL` and `REVIEW` go to a
review queue; a reviewer's decision is stored beside the machine decision, never over it. A missing model, invalid
output, timeout, or storage failure returns `ERROR`, never `PASS`. A browser-only simulated demo is labelled as such and
excluded from metrics.

### How OpenCV 5 is used
Part localization (Lab colour distance, Otsu, morphology, contours), capture checks (background luminance, frame
clipping, silhouette edge sharpness), cropping and `cv.dnn.blobFromImageWithParams`, feature extraction with
`cv.dnn.readNetFromONNX(..., cv.dnn.ENGINE_NEW)` on an OpenCV Zoo MobileNetV2 with intermediate tensors exposed,
anomaly-map smoothing, connected-component evidence regions, and evidence rendering. OpenCV-only baseline:
`cv.findTransformECC`-aligned template differences.

### AWS
`TODO(owner)` — complete only after a verified deployment: region, services that actually ran, endpoint, smoke-test
output, measured cloud latency, cost observed. **Current status: NOT DEPLOYED.** Prepared design: one Graviton
instance running the compose stack, private S3 evidence bucket with expiry, Secrets Manager, CloudWatch Logs,
CloudFront (`deploy/aws/motionQaStack.yaml`).

### Evaluation (measured, development data)
Public VisA `pcb1` benchmark (HC-SR04 boards; CC BY 4.0, Zou et al. ECCV 2022). On the reused test split
(100 normal, 53 defective images): missed defects 1/53, false rejections 4/100, REVIEW 41/153, NO_PART 0, automatic
decisions 73.2 %. Capture checks were revised after test outcomes were seen, 47 official-test anomalies were used for
threshold selection, and two test failures were analysed and one fixed, so every image is **development data: these
are not independent results**. A clean rebuild reproduced every artifact checksum and all 153 decisions.
Failure analysis: the missed defect is a missing header pin that exposes normal background, which the
position-agnostic patch memory cannot flag (unfixed); a board with both transducers missing had been reported as
"no part" and now goes to `REVIEW`. Across 1,564 development inspections that fix changed 3 decisions, all
`NO_PART → REVIEW`, and no PASS/FAIL counts. Defective boards are mostly photographed pins-down (49 of
53), so part of the separation reflects orientation.
Local latency on an Apple M2 (single worker): model step median 96.7 ms; client round trip median 165.9 ms. Local
linux/arm64 emulation with t4g.small-like limits (2 CPUs, 1 GiB API): inference median 496 ms, peak API memory 557 MiB,
no out-of-memory events — an emulation, not an AWS measurement.

### Limitations
- Benchmark-only model; not validated on any other component, including motorcycle parts.
- One of 53 defective test boards (a missing header pin) was passed; this defect class is not covered.
- Orientation confound in the benchmark data; pins-down good boards go to REVIEW far more often.
- About a third of good test boards go to REVIEW at the deployed operating point.
- Rates are per image with no grouped confidence intervals; VisA has no physical-part identifiers.
- No prospective data, no human-labelled new test set, no AWS deployment yet.

### Responsible use
Inspection support, not an autonomous reject decision: FAIL and REVIEW require a person. Evidence is private
(token-protected API, private bucket) with configurable retention. The station should photograph parts, not people.
Dataset and model licences: VisA CC BY 4.0; OpenCV Zoo MobileNetV2 Apache-2.0.

### Planned, not built
Prospective collection on a real component with a custodian and sealed protocol (`docs/PROSPECTIVE_COLLECTION.md`),
with a development profile for that component built by `buildComponentProfile` and frozen before the final test;
position-aware checks for missing components; physical-part-grouped uncertainty; AWS deployment within verified
zero-cost scope.

## Evidence index

| Claim type | Where |
| --- | --- |
| Measured (benchmark, exploratory) | `evaluation/results/visaPcb1Results.json`, `docs/EVALUATION.md` |
| Measured (local run 2026-10-16) | `evaluation/localRun-2026-10-16/`, `artifacts/local-demo-001/`, `artifacts/public-photos-001/` |
| Measured (second pass 2026-10-16) | `evaluation/localRun-2026-10-16b/`, `evaluation/results/policyComparison-p1-vs-p2.json`, `evaluation/results/failureAnalysis-2026-10-16.json` |
| Assumptions | Cost figures in `docs/SUBMISSION_READINESS.md` (historical estimate), AWS eligibility (unchecked) |
| Planned | Prospective evaluation, owner-component profile, AWS deployment |
