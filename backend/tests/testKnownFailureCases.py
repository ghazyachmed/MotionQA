"""Regression tests on two real VisA pcb1 images examined during development (2026-10-16).

Both images are development data now; these tests guard behaviour, they do not measure accuracy.
Skipped when the dataset or the built profile is not present locally.
"""
import json
from pathlib import Path
import cv2 as cv
import pytest
from motionQa.inspection.evidenceStore import LocalEvidenceStore
from motionQa.inspection.inspectionPipeline import InspectionPipeline

backendRoot = Path(__file__).resolve().parents[1]
datasetRoot = backendRoot.parent / "data" / "visa" / "pcb1" / "Data" / "Images" / "Anomaly"
profilePath = backendRoot / "models" / "visaPcb1" / "inspectionProfile.json"
policyOneProfilePath = backendRoot / "models" / "visaPcb1" / "inspectionProfile.policy1.json"

requiresData = pytest.mark.skipif(not (datasetRoot / "043.JPG").is_file() or not profilePath.is_file(), reason="VisA pcb1 images or built profile not present")


def analyze(path: Path, image: str):
    # AI Assisted Logic
    pipeline = InspectionPipeline(path, LocalEvidenceStore(Path("/tmp/motionqa-known-failure-evidence")))
    assert pipeline.isReady, pipeline.loadError
    return pipeline.analyze(cv.imread(str(datasetRoot / image)))


@requiresData
def testSevereMissingPartsAreReviewedNotDeclaredAbsent():
    """043: both transducers missing. The board is present; identity is outside validated evidence -> REVIEW."""
    if json.loads(profilePath.read_text()).get("decisionPolicy", 1) < 2:
        pytest.skip("profile built with decision policy 1")
    outcome = analyze(profilePath, "043.JPG")
    assert outcome.decision.value == "REVIEW"
    assert outcome.reasonCode == "PART_IDENTITY_UNCERTAIN"
    assert outcome.scores["identityDistance"] > outcome.thresholds["identityMaxDistance"]
    assert outcome.scores["identityDistance"] < outcome.thresholds["identityNoPartMinDistance"]


@requiresData
@pytest.mark.skipif(not policyOneProfilePath.is_file(), reason="policy 1 comparator profile not present")
def testPolicyOneComparatorStillDeclaresNoPart():
    """Documents the old behaviour kept for comparison: policy 1 reported 043 as NO_PART."""
    assert analyze(policyOneProfilePath, "043.JPG").decision.value == "NO_PART"


@requiresData
@pytest.mark.xfail(strict=True, reason="Known limitation: a missing header pin exposes normal background, which position-agnostic patch scoring accepts")
def testMissingHeaderPinIsNotPassed():
    """048: GND header pin missing. Currently PASS (score 2.125 < 2.160). If this starts passing, update the docs."""
    assert analyze(profilePath, "048.JPG").decision.value != "PASS"
