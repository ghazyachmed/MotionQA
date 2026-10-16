# Failure analysis — Anomaly/048 and Anomaly/043 (2026-10-16)

All VisA `pcb1` images examined here, including the reused test split, are **development data**. Nothing below is an
independent accuracy estimate. Reproduce with:

```bash
cd backend
python -m motionQa.evaluation.failureAnalysis --output ../evaluation/results/failureAnalysis-2026-10-16.json
python -m motionQa.evaluation.comparePolicies --old models/visaPcb1/inspectionProfile.policy1.json \
  --new models/visaPcb1/inspectionProfile.json --output ../evaluation/results/policyComparison-p1-vs-p2.json
```

## Anomaly/048 — missed defect (PASS)

Defect: the GND header pin is missing; the exposed area shows ordinary background fabric.

| Check | Measured | Reading |
| --- | --- | --- |
| Alignment / framing | Part localized; ground-truth region 100 % inside the crop and scoring region | Not a framing or masking problem |
| Resolution | Ground truth covers 289 px at the 448×448 model input (≈ 1 × 7 patches at stride 8) | Visible to the model; not a resolution limit |
| Features | Highest anomaly-map value inside the ground truth 2.097; elsewhere 2.125 | The missing-pin region looks like normal fabric to a position-agnostic patch memory |
| Score aggregation | Image score = map maximum = 2.125, taken outside the defect | Aggregation is not hiding a stronger local signal |
| Threshold | PASS below 2.160 | Lowering it to catch 048 would push many normal boards (median score ≈ 2.14) into REVIEW; not done |

**Verified cause:** the scorer compares each patch with normal patches regardless of location. A *missing* component that
reveals normal background produces no unusual patch. This is a structural defect class the method cannot represent.

Candidates evaluated on development data, **not adopted**:

| Candidate | Result |
| --- | --- |
| OpenCV-only ECC template z-score (existing baseline) | 048 scores 12.03, inside the normal range (validation normals reach 12.4). High normal scores come from pins-down boards that the template fails to align, so this channel cannot separate 048. |
| Orientation-canonicalized, position-aware feature statistics (prototype) | Validation AUROC 0.86 (deployed scorer: 0.985); 048 scores 1.54 against a validation-normal 95th percentile of 2.81. |

Status: **unfixed known limitation**, guarded by a strict expected-failure regression test
(`backend/tests/testKnownFailureCases.py::testMissingHeaderPinIsNotPassed`). If a future change makes 048 non-PASS, the
test fails and the documentation must be updated.

## Anomaly/043 — severe missing parts reported as NO_PART

Defect: both ultrasonic transducers are missing; the board itself is present.

| Check | Measured |
| --- | --- |
| Identity distance of 043 | 0.155 |
| All other 299 target images (validation + test, normal + defective) | ≤ 0.0844 |
| Other-object images (100) | ≥ 0.202 (validation minimum 0.2167) |
| Policy-1 rule | single midpoint threshold 0.1506 → 043 above it → `NO_PART` |
| Silhouette (aspect, extent, shape match) | overlaps with chewing-gum sticks; cannot separate presence from identity alone |
| Colour signature (HSV histogram vs bank) | 0.43, overlapping the other PCB category (pcb2); cannot separate either |

**Verified cause:** the policy-1 identity threshold sat inside an evidence gap that validation never covered, so the
system stated "no part" with unwarranted certainty about a board that was present but incomplete.

**Fix (decision policy 2):** presence comes from localization; recognition decides only where validation has evidence.
Identity ≤ 0.0844 (largest validated target) → recognized; ≥ 0.2167 (smallest validated other object) → `NO_PART`;
between → `REVIEW · PART_IDENTITY_UNCERTAIN`, with anomaly evidence attached. FAIL is not forced. Both bounds come from
existing validation statistics; nothing was tuned to 043. Policy-1 profiles keep their old behaviour.

Regression tests: `testSevereMissingPartsAreReviewedNotDeclaredAbsent` (043 → REVIEW) and
`testPolicyOneComparatorStillDeclaresNoPart` (comparator unchanged).

## Old vs new on all development data (1,564 inspections)

Strata: 804 memory-bank images, 147 validation, 153 reused-test, 100 other-object images, and 360 synthetic capture faults
(6 kinds × 60 test images). Source: `evaluation/results/policyComparison-p1-vs-p2.json`.

| Outcome | Policy 1 | Policy 2 | Change |
| --- | --- | --- | --- |
| False PASS (defective → PASS) | 1 | 1 | 0 (048) |
| False PASS (wrong object or capture fault → PASS) | 0 | 0 | 0 |
| False FAIL (normal → FAIL) | 12 | 12 | 0 |
| REVIEW | 246 | 249 | +3 |
| RETAKE | 373 | 373 | 0 |
| NO_PART | 88 | 85 | −3 |
| ERROR | 0 | 0 | 0 |

Changed decisions (3): Anomaly/043 NO_PART → REVIEW; pcb2/Normal/0809 and pcb2/Normal/0881 (a different PCB type)
NO_PART → REVIEW. Old configuration kept at `evaluation/policies/visaPcb1-policy1-profile.json`.

The 12 normal false FAILs split as 6 memory-bank, 2 validation, 4 test images. Even memory-bank images are not always
accepted (632 PASS, 166 REVIEW, 6 FAIL of 804): the bank keeps a 16,000-patch coreset, not every patch.

## Additional finding — orientation confound in VisA pcb1

Boards appear in two orientations (pins up / pins down, a 180° rotation with different shadows). On the reused test split:

| Group | n | PASS | REVIEW | FAIL | Median score |
| --- | --- | --- | --- | --- | --- |
| Normal, pins up | 75 | 55 | 17 | 3 | 2.112 |
| Normal, pins down | 25 | 5 | 19 | 1 | 2.230 |
| Defective, pins up | 4 | 0 | 1 | 3 | 2.939 |
| Defective, pins down | 49 | 1 | 3 | 44 | 3.202 |

(Policy-1 decisions; one pins-down defective image was NO_PART.) Pins-down boards are under-represented among memory-bank
normals (about 16 % in the analysed half) but make up 49 of 53 defective test boards, so part of the measured separation
reflects orientation rather than defects, and pins-down good boards are sent to REVIEW far more often. A fix needs
orientation-balanced normal data or orientation-specific memory; it was not attempted here because any change would be
judged on the same, already-used development data.
