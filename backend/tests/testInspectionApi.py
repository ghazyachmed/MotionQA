import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from starlette.websockets import WebSocketDisconnect
from motionQa.accessControl import SlidingWindowRateLimiter
from motionQa.configSettings import getSettings
from motionQa.databaseSession import Base, getDbSession
from motionQa.dependencyContainer import getRedisGateway
from syntheticFixtures import createPartImage, encodeJpeg

token = "test-operator-token-0123456789"
authHeaders = {"Authorization": f"Bearer {token}"}


class FakeRedisGateway:
    def __init__(self, shouldFail: bool = False):
        self.shouldFail = shouldFail
        self.published: list[str] = []

    async def publishLiveEvent(self, event) -> None:
        if self.shouldFail:
            raise ConnectionError("redis down")
        self.published.append(event.inspectionId)


@pytest.fixture
def apiContext(tmp_path, monkeypatch, syntheticProfilePath):
    # AI Assisted Logic
    monkeypatch.setenv("MOTIONQA_REQUIRE_AUTH", "true")
    monkeypatch.setenv("MOTIONQA_API_TOKENS", token)
    monkeypatch.setenv("MOTIONQA_INSPECTION_PROFILE_PATH", str(syntheticProfilePath))
    monkeypatch.setenv("MOTIONQA_EVIDENCE_DIR", str(tmp_path / "evidence"))
    monkeypatch.setenv("MOTIONQA_ENABLE_REDIS_PERSISTENCE", "false")
    monkeypatch.setenv("MOTIONQA_AUTO_CREATE_TABLES", "false")
    getSettings.cache_clear()
    from motionQa.mainApi import createApp

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}", poolclass=NullPool)

    async def createSchema() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    asyncio.run(createSchema())
    sessionMaker = async_sessionmaker(engine, expire_on_commit=False)

    async def overrideSession():
        async with sessionMaker() as session:
            yield session

    fakeRedis = FakeRedisGateway()
    app = createApp()
    app.dependency_overrides[getDbSession] = overrideSession
    app.dependency_overrides[getRedisGateway] = lambda: fakeRedis
    yield TestClient(app), app, fakeRedis
    getSettings.cache_clear()


def postImage(client, inspectionId: str, image=None, headers=authHeaders):
    payload = encodeJpeg(image if image is not None else createPartImage(seed=500))
    return client.post("/api/v1/inspections", files={"image": ("part.jpg", payload, "image/jpeg")}, data={"inspectionId": inspectionId}, headers=headers)


def testInspectionEndpointsRequireToken(apiContext):
    client, _, _ = apiContext
    assert postImage(client, "insp-auth-1", headers={}).status_code == 401
    assert postImage(client, "insp-auth-2", headers={"Authorization": "Bearer wrong-token-000000000"}).status_code == 401
    assert client.get("/api/v1/inspections").status_code == 401


def testModelStatusReportsOpenCvFive(apiContext):
    client, _, _ = apiContext
    status = client.get("/api/v1/model/status").json()
    assert status["ready"] is True
    assert status["opencv"]["majorVersion"] >= 5


def testInvalidUploadsAreRejectedWithoutRecords(apiContext):
    client, _, _ = apiContext
    textFile = client.post("/api/v1/inspections", files={"image": ("a.txt", b"hello world", "text/plain")}, headers=authHeaders)
    assert textFile.status_code == 415
    truncated = client.post("/api/v1/inspections", files={"image": ("a.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg")}, headers=authHeaders)
    assert truncated.status_code == 400
    oversized = client.post("/api/v1/inspections", files={"image": ("a.jpg", b"\xff\xd8\xff" + b"\x00" * (9 * 1024 * 1024), "image/jpeg")}, headers=authHeaders)
    assert oversized.status_code == 413
    assert client.get("/api/v1/inspections", headers=authHeaders).json() == []


def testRealInspectionIsPersistedOnceAndRetriesReplay(apiContext):
    client, _, fakeRedis = apiContext
    first = postImage(client, "insp-idem-0001")
    assert first.status_code == 201
    body = first.json()
    assert body["processingMode"] == "REAL_INFERENCE"
    assert body["decision"] in ("PASS", "REVIEW", "FAIL")
    assert body["modelId"] == "synthetic-test-profile"
    assert "anomalyScore" in body["scores"] and "failAtOrAbove" in body["thresholds"]
    retry = postImage(client, "insp-idem-0001")
    assert retry.status_code == 200
    assert retry.headers["Idempotent-Replay"] == "true"
    assert retry.json()["processedAt"] == body["processedAt"]
    assert len(client.get("/api/v1/inspections", headers=authHeaders).json()) == 1
    assert fakeRedis.published == ["insp-idem-0001"]


def testEmptySceneIsNoPartNotPass(apiContext):
    import numpy as np

    client, _, _ = apiContext
    response = postImage(client, "insp-empty-01", image=np.full((480, 640, 3), 30, np.uint8))
    assert response.json()["decision"] == "NO_PART"


def testDemoEventsAreForcedToSimulatedAndExcludedFromRealTrends(apiContext):
    client, _, _ = apiContext
    demo = client.post(
        "/api/v1/live-events",
        json={"inspectionId": "demo-0001", "lineId": "LINE_01", "decision": "FAIL", "defectFound": "scratch", "heuristicScore": 0.8, "processingMode": "REAL_INFERENCE", "isForcedScenario": True},
        headers=authHeaders,
    )
    assert demo.status_code == 202
    assert demo.json()["processingMode"] == "SIMULATED_DEMO"
    assert demo.json()["reasonCode"] == "SIMULATED_FORCED_SCENARIO"
    realTrend = client.get("/api/v1/inspections/trends", headers=authHeaders).json()
    assert realTrend["processingMode"] == "REAL_INFERENCE" and realTrend["buckets"] == []
    demoTrend = client.get("/api/v1/inspections/trends", params={"processingMode": "SIMULATED_DEMO"}, headers=authHeaders).json()
    assert sum(bucket["counts"]["FAIL"] for bucket in demoTrend["buckets"]) == 1


def testReviewPreservesMachineDecision(apiContext):
    client, _, _ = apiContext
    machine = postImage(client, "insp-review-01").json()
    reviewed = client.post("/api/v1/inspections/insp-review-01/review", json={"reviewerDecision": "FAIL", "reviewedBy": "qa.lead", "reviewerNote": "visible burr"}, headers=authHeaders).json()
    assert reviewed["decision"] == machine["decision"]
    assert reviewed["finalDecision"] == "FAIL"
    assert reviewed["review"]["status"] == ("CONFIRMED" if machine["decision"] == "FAIL" else "OVERRIDDEN")
    invalid = client.post("/api/v1/inspections/insp-review-01/review", json={"reviewerDecision": "RETAKE", "reviewedBy": "qa.lead"}, headers=authHeaders)
    assert invalid.status_code == 422


def testEvidenceIsServedOnlyWithToken(apiContext):
    client, _, _ = apiContext
    postImage(client, "insp-evid-01")
    assert client.get("/api/v1/inspections/insp-evid-01/evidence/overlay").status_code == 401
    evidence = client.get("/api/v1/inspections/insp-evid-01/evidence/overlay", headers=authHeaders)
    assert evidence.status_code == 200
    assert evidence.headers["content-type"] == "image/jpeg"
    assert client.get("/api/v1/inspections/insp-evid-01/evidence/unknown", headers=authHeaders).status_code == 404


def testPublicationFailureIsReported(apiContext):
    client, app, _ = apiContext
    from motionQa.dependencyContainer import getRedisGateway as dependency

    app.dependency_overrides[dependency] = lambda: FakeRedisGateway(shouldFail=True)
    real = postImage(client, "insp-pubfail-1")
    assert real.status_code == 201
    assert real.headers["X-MotionQA-Live-Publish"] == "failed"
    demo = client.post("/api/v1/live-events", json={"inspectionId": "demo-pubfail-1", "lineId": "LINE_01", "decision": "PASS", "heuristicScore": 0.1}, headers=authHeaders)
    assert demo.status_code == 503


def testRateLimitIsEnforced(apiContext):
    client, app, _ = apiContext
    app.state.inspectionRateLimiter = SlidingWindowRateLimiter(2)
    assert postImage(client, "insp-rate-1").status_code == 201
    assert postImage(client, "insp-rate-2").status_code == 201
    assert postImage(client, "insp-rate-3").status_code == 429


def testWebsocketRejectsMissingToken(apiContext):
    client, _, _ = apiContext
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/qc-stream") as websocket:
            websocket.receive_text()


def testMissingModelYieldsErrorDecision(apiContext, monkeypatch, tmp_path):
    _, app, _ = apiContext
    from motionQa.inspection.evidenceStore import LocalEvidenceStore
    from motionQa.inspection.inspectionPipeline import InspectionPipeline

    app.state.inspectionPipeline = InspectionPipeline(tmp_path / "absent.json", LocalEvidenceStore(tmp_path))
    client = TestClient(app)
    response = postImage(client, "insp-nomodel-1")
    assert response.status_code == 201
    assert response.json()["decision"] == "ERROR"
    assert response.json()["reasonCode"] == "MODEL_UNAVAILABLE"
