from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from motionQa.inspection.evidenceStore import EvidenceStorageError, LocalEvidenceStore, buildEvidenceKey
from motionQa.inspectionSchemas import InspectionResult, ReviewRequest
from motionQa.streamSchemas import DemoEventRequest

capturedAt = datetime(2026, 10, 15, tzinfo=timezone.utc)


def makeResult(**overrides) -> dict:
    base = {
        "inspectionId": "insp-0001",
        "lineId": "LINE_01",
        "capturedAt": capturedAt,
        "decision": "PASS",
        "reasonCode": "ANOMALY_SCORE_BELOW_PASS_THRESHOLD",
        "processingMode": "REAL_INFERENCE",
        "modelId": "visa-pcb1-patchcore-mnv2",
        "scores": {"anomalyScore": 1.0},
    }
    return {**base, **overrides}


def testPassCannotCarryDefect():
    # AI Assisted Logic
    with pytest.raises(ValidationError):
        InspectionResult(**makeResult(defectFound="anomaly"))


def testFailRequiresDefect():
    with pytest.raises(ValidationError):
        InspectionResult(**makeResult(decision="FAIL", defectFound="none"))


def testRealPassRequiresModelAndScore():
    with pytest.raises(ValidationError):
        InspectionResult(**makeResult(modelId=None))
    with pytest.raises(ValidationError):
        InspectionResult(**makeResult(scores={}))


def testErrorNeedsNoModel():
    result = InspectionResult(**makeResult(decision="ERROR", reasonCode="MODEL_UNAVAILABLE", modelId=None, scores={}))
    assert result.finalDecision == "ERROR"


def testReviewerMayOnlyResolveToPassOrFail():
    with pytest.raises(ValidationError):
        ReviewRequest(reviewerDecision="REVIEW", reviewedBy="qa")
    assert ReviewRequest(reviewerDecision="PASS", reviewedBy="qa").reviewerDecision == "PASS"


def testDemoEventCannotClaimRealInference():
    event = DemoEventRequest(inspectionId="demo-0001", lineId="LINE_01", decision="PASS", heuristicScore=0.2, processingMode="REAL_INFERENCE")
    result = event.toInspectionResult()
    assert result.processingMode == "SIMULATED_DEMO"
    assert result.modelId == "browser-heuristic-demo"
    assert "heuristicScore" in result.scores and "anomalyScore" not in result.scores


def testDemoEventRejectsReviewDecision():
    with pytest.raises(ValidationError):
        DemoEventRequest(inspectionId="demo-0002", lineId="LINE_01", decision="REVIEW", heuristicScore=0.2)


def testIdentifiersRejectPathCharacters():
    with pytest.raises(ValidationError):
        InspectionResult(**makeResult(inspectionId="../../etc/passwd"))


def testEvidenceKeysCannotEscapeRoot(tmp_path):
    store = LocalEvidenceStore(tmp_path)
    with pytest.raises(EvidenceStorageError):
        store.resolveKey("../outside.jpg")
    with pytest.raises(EvidenceStorageError):
        buildEvidenceKey("bad id with spaces", "overlay", capturedAt, "jpg")
    stored = store.put(buildEvidenceKey("insp-0001", "overlay", capturedAt, "jpg"), b"jpeg", "image/jpeg")
    assert stored.uri == "local://2026/10/15/insp-0001/overlay.jpg"
    assert store.localPath(stored.uri).read_bytes() == b"jpeg"


def testEvidenceRetentionPurgesOldFiles(tmp_path):
    import os
    import time

    store = LocalEvidenceStore(tmp_path, retentionDays=1)
    stored = store.put("2020/01/01/old/overlay.jpg", b"x", "image/jpeg")
    oldTime = time.time() - 3 * 86400
    os.utime(store.localPath(stored.uri), (oldTime, oldTime))
    store.put("2026/10/15/new/overlay.jpg", b"y", "image/jpeg")
    assert store.purgeExpired() == 1
