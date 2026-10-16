# Prospective photo collection — preparation only

**Status: NOT RUN.** No new photographs, physical parts, human labels, or prospective results exist. This document and
the tooling prepare the collection; they do not replace it. Follow [INDEPENDENT_EVALUATION.md](INDEPENDENT_EVALUATION.md)
for sealing, inference, and scoring.

## 1. Decide the component first (owner)

The shipped profile (`visa-pcb1-patchcore-mnv2`) was built for HC-SR04 ultrasonic boards photographed top-down on dark
grey fabric, with the board covering 20–42 % of the frame (capture thresholds in `evaluation/results/visaPcb1Results.json`).

- **Same component (HC-SR04 boards):** the existing profile can be tested only if real photos match that geometry.
  Take 5 development photos first and run them through the API; if most return `RETAKE` (scale, exposure) or `NO_PART`
  (`PART_NOT_RECOGNIZED`), the station differs from VisA and a new development profile is needed before any test.
- **Any other component (for example a motorcycle bracket or casting):** build a separate profile from development
  photos of that component only. The PCB profile must not be assumed to transfer. A new profile requires changing the
  build script to read a development manifest instead of VisA; that change and its validation happen before the test set
  is sealed.

## 2. Roles

| Role | Responsibility | Can the agent do it? |
| --- | --- | --- |
| Owner | Provide physical parts, station, camera; choose the claim | No |
| Operator | Capture photos following the worksheet | No |
| Custodian | Keep labels and the original-filename mapping private until predictions are frozen | No |
| Reviewer(s) | Label each test image; adjudicate disagreements before scoring | No |
| Agent | Prepare tools, run frozen inference on sealed inputs, report counts | Yes |

The agent must not label images, invent part or session IDs, or describe a collection that has not happened.

## 3. Station

- Fixed camera mount and focus; record camera model and settings in the worksheet `camera` column.
- Stable diffuse lighting; record it in `lighting`. Consistent plain background contrasting with the part.
- Fixed distance (`distanceCm`) so the part fills a similar fraction of every frame; keep the whole part inside the frame.
- Views: `primary` for every part; add `secondary` (another angle) only if recapture will be studied. All views of one
  physical part stay in the same split.
- Do not damage powered equipment to create defects. Record defects as `natural`, `introduced` (deliberately made on an
  unpowered part), or `simulated` (any digital edit). Report the three groups separately.

## 4. What to capture

| Stratum | Purpose | Notes |
| --- | --- | --- |
| Normal parts | false-rejection rate | distinct physical parts, several sessions |
| Defective parts | missed-defect rate | distinct parts; note defect type and origin |
| Wrong object / empty station | `NO_PART` behaviour | real objects found at the station |
| Poor capture (blur, glare, partial view) | `RETAKE` behaviour | real captures, labelled `capture_fault` |

Sample size follows from the claim. Images of the same part are not independent. With **zero** observed misses among
*n* independent defective parts, the exact one-sided 95 % upper bound on the missed-defect rate is:

| Defective parts (n) | 95 % upper bound, 0 misses | 95 % upper bound, 1 miss |
| --- | --- | --- |
| 10 | 25.9 % | 39.4 % |
| 20 | 13.9 % | 21.6 % |
| 30 | 9.5 % | 14.9 % |
| 60 | 4.9 % | 7.7 % |
| 100 | 3.0 % | 4.7 % |
| 300 | 1.0 % | 1.6 % |

A pilot with 10–20 defective parts can show the workflow works; it cannot support a low escape-rate claim. These bounds
assume independent parts; `frozenInference score` currently reports per-image rates only and computes no grouped interval.

## 5. Workflow

From `backend/`, with every path outside the repository (private):

```bash
# 1. Operator copies raw captures into /private/raw (any filenames). Make opaque copies:
python -m motionQa.evaluation.prospectiveCollection opaque-names \
  --raw-dir /private/raw --images-out /private/images --mapping-out /private/original-names.csv

# 2. Fill a copy of evaluation/prospective/captureWorksheet.template.csv (no label columns allowed)
#    with the opaque filenames and real part/session IDs, then build the sealable manifest:
python -m motionQa.evaluation.prospectiveCollection manifest \
  --worksheet /private/worksheet.csv --images /private/images \
  --custodian "<custodian name>" --provenance "<station, dates, how parts were obtained>" \
  --attest-test-unused --output /private/manifest.json

# 3. Commit all code changes, then seal and record the seal before inference (INDEPENDENT_EVALUATION.md):
python -m motionQa.evaluation.frozenProtocol seal --manifest /private/manifest.json --images /private/images \
  --profile models/<profile>/inspectionProfile.json --source . --protocol ../docs/INDEPENDENT_EVALUATION.md \
  --seal /private/seal.json

# 4. Predict (no fitting, no thresholds changed):
python -m motionQa.evaluation.frozenInference predict --manifest /private/manifest.json --images /private/images \
  --profile models/<profile>/inspectionProfile.json --source . --protocol ../docs/INDEPENDENT_EVALUATION.md \
  --seal /private/seal.json --evidence /private/evidence --output /private/run-001

# 5. Only now the custodian converts final labels (copy of custodianLabels.template.csv) and scores:
python -m motionQa.evaluation.prospectiveCollection labels \
  --custodian-sheet /private/custodian-labels.csv --manifest /private/manifest.json --output /private/labels.json
python -m motionQa.evaluation.frozenInference score --run /private/run-001 --labels /private/labels.json \
  --output /private/metrics-001.json
```

`--attest-test-unused` is the custodian's statement that no test image influenced development. Omit it if that is not
true; the seal tool then refuses to seal.

Label values: `normal`, `anomaly`, `capture_fault`, `wrong_object`. `adjudicationStatus` must be `final` for every test
image before `labels` runs. Keep reviewer identities and criteria in the private sheet.

## 6. Legacy VisA data

VisA publishes no physical-part or capture-session identifiers. The seal tool requires both, and inventing them would
defeat its purpose, so the VisA development history cannot be sealed. It remains exploratory, development-only evidence.
A prospective experiment uses a fully documented new development/test collection instead.

## 7. Verified so far (2026-10-16)

- The tooling and the full seal → predict → verify → score sequence pass automated tests with the real
  `InspectionPipeline` on **synthetic** fixtures (`backend/tests/testProspectiveCollection.py`). The fixture IDs and labels
  are test data, not a collection.
- No real collection, labels, or metrics exist.

## 8. Adapting to the owner's component (prepared 2026-10-16)

The VisA profile is not assumed to fit any other board or part. `motionQa.evaluation.buildComponentProfile` provides:

```bash
# a) Does the existing VisA profile fit your station? (development photos only; expect mostly RETAKE/NO_PART if not)
python -m motionQa.evaluation.buildComponentProfile fit-check \
  --profile models/visaPcb1/inspectionProfile.json --manifest /private/manifest.json --images /private/images

# b) Build a separate profile from DEVELOPMENT rows only (test rows are never read):
python -m motionQa.evaluation.buildComponentProfile build \
  --manifest /private/manifest.json --images /private/images --dev-labels /private/dev-labels.json \
  --profile-id <component>-v1 --component-name "<component name>" --output-dir models/<component>-v1
```

- `dev-labels.json` maps development images only to `normal`, `anomaly`, `capture_fault`, or `wrong_object`. The tool
  refuses a label file that names any test image.
- Normal development parts are split by `physicalPartId` into memory-bank and calibration groups (all views of a part stay
  together). Capture gates, identity bands, and PASS/FAIL thresholds come from the calibration group only.
- With fewer than 5 development defect images the tool refuses to set a FAIL threshold unless `--allow-normal-only` is
  given; the profile then states `NORMAL-ONLY … FAIL threshold NOT validated on defects`.
- Without development wrong-object images, unrecognized objects go to `REVIEW` rather than `NO_PART`.
- Output: `inspectionProfile.json`, `featureExtractor.onnx`, `memoryBank.npz`, `developmentReport.json`
  (status `DEVELOPMENT_PROFILE_NOT_VALIDATED`).

Freeze before the final test: commit all code, run `frozenProtocol seal` with the new profile, record the seal, then use
`frozenInference predict` on test images from **different parts and sessions**. Any change after seeing test results
retires that test set into development.

Minimum development inputs enforced by the tool: 20 memory-bank normal images and 10 calibration normal images (more
parts are better; these are software floors, not a sample-size justification). Verified only on synthetic fixtures
(`backend/tests/testComponentProfile.py`).
