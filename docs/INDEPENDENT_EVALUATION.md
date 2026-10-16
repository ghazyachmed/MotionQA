# Independent evaluation protocol

Status: NOT RUN. No new independent dataset has been supplied (rechecked 2026-10-16). Collection tooling and procedure: [PROSPECTIVE_COLLECTION.md](PROSPECTIVE_COLLECTION.md).

The existing VisA pcb1 results are exploratory development evidence. Capture gates were revised after viewing test outcomes. Also, 47 official-test anomalies entered validation/model selection, so AUROC on the entire official test set is not an independent estimate. Preserve every historical result; do not relabel it as fresh evidence.

## Required prospective procedure

1. Assign a dataset custodian. Inventory all previously used images and their physical-part and capture-session identifiers. Unknown identifiers are a limitation; never invent them.
2. Freeze the task, model, memory bank, capture gates, thresholds, runtime and decision logic. Freeze the primary metrics and exclusion rules in a protocol document.
3. Acquire new images of distinct physical parts in new sessions. The test images must not influence any development choice. Keep labels with the custodian until predictions are saved. Different views of one part stay together. Another view or augmentation of an old part is not an independent test item.
4. Include normal, defective and capture-failure examples. Report each stratum separately. Use agreed labels from a competent reviewer; record ambiguous cases before scoring.
5. Seal the inventory and frozen artifacts with the tool below. Record the seal in a timestamped commit before running inference. Exact hashes detect identical files, not resized duplicates or undeclared prior exposure.
6. Run inference only using InspectionPipeline and the frozen profile. Do NOT run runEvaluation on the new test set: that command fits and calibrates. Preserve per-image predictions, failures, original decisions, latency and evidence before revealing labels.
7. Verify the seal again after inference. Score all prespecified items. Missing predictions and ERROR remain visible; never discard them to improve accuracy.
8. Report counts and denominators for anomalous-to-PASS, normal-to-FAIL, REVIEW, RETAKE, NO_PART and ERROR. Show decision coverage separately. Report uncertainty grouped by physical part; do not count correlated frames as independent samples.
9. If results prompt changes, retire this test set into development. A new final claim needs a new prospective test set. Do not reshuffle old data to manufacture independence.

The seal tool is an integrity preflight, not an inference runner or independent assessor. A human custodian and new data remain necessary.

## Manifest

Create private JSON with provenance, custodian, testPreviouslyUsedForDevelopment=false and items. Each item requires image (relative path), sha256, physicalPartId, captureSessionId and split (development or test). Include both inventories. Do not commit private images or withheld labels. Use real IDs.

From backend/:

```bash
python -m motionQa.evaluation.frozenProtocol seal \
  --manifest /absolute/private/manifest.json --images /absolute/private/images \
  --profile models/visaPcb1/inspectionProfile.json --source . \
  --protocol ../docs/INDEPENDENT_EVALUATION.md --seal /absolute/private/seal.json
# Repeat with `verify` instead of `seal` before and after inference.
```

A changed source file, profile, model, memory bank, protocol or manifest invalidates the seal. The tool does not prove dependency binaries or the operating system remained unchanged; separately archive lockfiles, runtime diagnostics and container digest.

## Minimum practical experiment

Use one accessible component type and a fixed station. Determine sample size from the intended claim, defect frequency and tolerable uncertainty. A small pilot is useful but does not establish a low industrial defect-escape rate. Report actual counts rather than a universal minimum.

For adaptive recapture, preregister A (one photo), B (always two photos) and C (conditional recapture). Use identical component groups, a maximum attempt count, operator instructions and time budget. Record total capture time and human work, not just inference latency. This requires new multi-view data; the current single-view benchmark cannot establish the benefit.

Source: https://scikit-learn.org/stable/common_pitfalls.html (accessed 2026-10-15).

## Inference-only runner

A separate command now runs the frozen profile without model fitting or calibration.
Create a new seal after final code changes. The manifest must contain no labels in test rows.
Use opaque image filenames if original filenames reveal their labels.

```bash
# From backend/, after frozenProtocol seal:
python -m motionQa.evaluation.frozenInference predict \
  --manifest /absolute/private/manifest.json --images /absolute/private/images \
  --profile models/visaPcb1/inspectionProfile.json --source . \
  --protocol ../docs/INDEPENDENT_EVALUATION.md --seal /absolute/private/seal.json \
  --evidence /absolute/private/evidence --output /absolute/private/run-001

# Only after predictions.jsonl and run.json are finalized, reveal labels:
python -m motionQa.evaluation.frozenInference score \
  --run /absolute/private/run-001 --labels /absolute/private/labels.json \
  --output /absolute/private/metrics-001.json
```

Labels are a JSON mapping from exact image path to normal, anomaly, capture_fault or wrong_object.
Missing labels and duplicate predictions fail scoring. Changed predictions fail checksum verification.
Invalid images remain ERROR records. An interrupted run lacks run.json and cannot be scored as complete.
The output directory cannot be reused silently. The runner verifies the seal before and after inference.
It does not provide human independence, physical data collection, grouped confidence intervals or adaptive-recapture evaluation.
Reported rates are per image; no automatic generalization to independent parts is made.
