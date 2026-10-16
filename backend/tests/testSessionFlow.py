import cv2 as cv
import numpy as np
import pytest
from motionQa.inspection.sessionPolicy import evaluateSession
from syntheticFixtures import createPartImage, encodeJpeg
from testInspectionApi import apiContext, authHeaders  # noqa: F401  (pytest fixture reuse)


def testTerminalDecisionCompletesSession():
    # AI Assisted Logic
    for decision in ("PASS", "FAIL", "REVIEW"):
        state = evaluateSession([(decision, "X")], maxAttempts=3)
        assert state.status == "COMPLETED" and state.finalDecision == decision and not state.nextAttemptAllowed


def testRecapturableDecisionsAllowLimitedRetries():
    state = evaluateSession([("RETAKE", "BLURRED")], maxAttempts=3)
    assert state.status == "OPEN" and state.nextAttemptAllowed
    assert "same camera position" in state.guidance and "2 attempt(s) left" in state.guidance
    state = evaluateSession([("RETAKE", "BLURRED"), ("NO_PART", "PART_NOT_FOUND"), ("RETAKE", "UNDEREXPOSED")], maxAttempts=3)
    assert state.status == "ESCALATED" and state.finalDecision == "REVIEW" and state.finalReasonCode == "RECAPTURE_LIMIT_REACHED"


def testGuidanceNeverAsksForNewViewpoint():
    for reason in ("BLURRED", "UNDEREXPOSED", "OVEREXPOSED", "PART_CUT_OFF", "PART_SCALE_OUT_OF_RANGE", "PART_NOT_FOUND", "PART_NOT_RECOGNIZED"):
        guidance = evaluateSession([("RETAKE" if reason not in ("PART_NOT_FOUND", "PART_NOT_RECOGNIZED") else "NO_PART", reason)], 3).guidance.lower()
        assert "another angle" not in guidance and "new angle" not in guidance and "rotate" not in guidance


def testMissingModelEscalatesImmediately():
    state = evaluateSession([("ERROR", "MODEL_UNAVAILABLE")], maxAttempts=3)
    assert state.status == "ESCALATED" and state.finalReasonCode == "MODEL_UNAVAILABLE"


def postAttempt(client, sessionId, number, image, headers=authHeaders):
    return client.post(f"/api/v1/sessions/{sessionId}/attempts", files={"image": ("capture.jpg", encodeJpeg(image), "image/jpeg")},
                       data={"attemptNumber": str(number)}, headers=headers)


def blurred() -> np.ndarray:
    return cv.GaussianBlur(createPartImage(seed=610), (0, 0), 6)


def testSessionEscalatesAfterRecaptureLimit(apiContext):
    client, _, _ = apiContext
    created = client.post("/api/v1/sessions", json={"sessionId": "sess-escalate-01", "maxAttempts": 3}, headers=authHeaders)
    assert created.status_code == 201 and created.json()["status"] == "OPEN"
    first = postAttempt(client, "sess-escalate-01", 1, blurred()).json()
    assert first["inspection"]["decision"] == "RETAKE" and first["session"]["status"] == "OPEN" and first["session"]["nextAttemptAllowed"]
    second = postAttempt(client, "sess-escalate-01", 2, np.full((480, 640, 3), 30, np.uint8)).json()
    assert second["inspection"]["decision"] == "NO_PART" and second["session"]["status"] == "OPEN"
    third = postAttempt(client, "sess-escalate-01", 3, blurred()).json()
    assert third["session"]["status"] == "ESCALATED"
    assert third["session"]["finalDecision"] == "REVIEW" and third["session"]["finalReasonCode"] == "RECAPTURE_LIMIT_REACHED"
    assert third["inspection"]["decision"] == "RETAKE" and third["inspection"]["review"]["status"] == "PENDING"
    assert [a["decision"] for a in third["session"]["attempts"]] == ["RETAKE", "NO_PART", "RETAKE"]
    assert postAttempt(client, "sess-escalate-01", 4, blurred()).status_code == 409
    pending = client.get("/api/v1/inspections", params={"reviewStatus": "PENDING"}, headers=authHeaders).json()
    assert "sess-escalate-01-a03" in [item["inspectionId"] for item in pending]


def testConclusiveAttemptClosesSessionAndRetriesReplay(apiContext):
    client, _, _ = apiContext
    client.post("/api/v1/sessions", json={"sessionId": "sess-complete-01"}, headers=authHeaders)
    first = postAttempt(client, "sess-complete-01", 1, createPartImage(seed=611))
    assert first.status_code == 201
    body = first.json()
    assert body["inspection"]["decision"] in ("PASS", "REVIEW", "FAIL") and body["session"]["status"] == "COMPLETED"
    replay = postAttempt(client, "sess-complete-01", 1, createPartImage(seed=611))
    assert replay.status_code == 200 and replay.headers["Idempotent-Replay"] == "true"
    assert len(replay.json()["session"]["attempts"]) == 1
    assert postAttempt(client, "sess-complete-01", 2, createPartImage(seed=612)).status_code == 409


def testStoredButUnlinkedAttemptIsLinkedOnRetry(apiContext):
    # State left when the inspection committed but the request failed before the attempt was linked to its session.
    client, _, _ = apiContext
    client.post("/api/v1/sessions", json={"sessionId": "sess-link-01"}, headers=authHeaders)
    orphan = client.post("/api/v1/inspections", files={"image": ("capture.jpg", encodeJpeg(blurred()), "image/jpeg")},
                         data={"inspectionId": "sess-link-01-a01"}, headers=authHeaders).json()
    retried = postAttempt(client, "sess-link-01", 1, blurred())
    assert retried.status_code == 201
    body = retried.json()
    assert body["inspection"]["latency"] == orphan["latency"]  # not inspected a second time
    assert [a["inspectionId"] for a in body["session"]["attempts"]] == ["sess-link-01-a01"]
    assert body["session"]["status"] == "OPEN" and postAttempt(client, "sess-link-01", 2, blurred()).status_code == 201


def testAttemptsMustBeSequentialAndAuthenticated(apiContext):
    client, _, _ = apiContext
    client.post("/api/v1/sessions", json={"sessionId": "sess-order-01"}, headers=authHeaders)
    assert postAttempt(client, "sess-order-01", 2, blurred()).status_code == 409
    assert postAttempt(client, "sess-order-01", 1, blurred(), headers={}).status_code == 401
    assert client.get("/api/v1/sessions/sess-missing-01", headers=authHeaders).status_code == 404
