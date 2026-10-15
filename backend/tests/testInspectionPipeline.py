import asyncio
import json
import shutil
import time
from types import SimpleNamespace
import numpy as np
import pytest
from motionQa.inspection.evidenceStore import EvidenceStorageError, LocalEvidenceStore
from motionQa.inspection.featureExtractor import FeatureModelSpec, ModelOutputError, OpenCvFeatureExtractor
from motionQa.inspection.inspectionPipeline import InspectionPipeline, InspectionRequest
from syntheticFixtures import createPartImage


def makeRequest(suffix: str = "0001") -> InspectionRequest:
    return InspectionRequest(inspectionId=f"test-{suffix}", lineId="TEST_LINE")


def makeStubbedPipeline(tmp_path, analyze) -> InspectionPipeline:
    pipeline = InspectionPipeline(None, LocalEvidenceStore(tmp_path), timeoutSeconds=0.2)
    pipeline.profile = SimpleNamespace(modelId="stub-model", version="0")
    pipeline.scorer = object()
    pipeline.analyze = analyze
    return pipeline


@pytest.mark.asyncio
async def testMissingModelReturnsError(tmp_path):
    # AI Assisted Logic
    pipeline = InspectionPipeline(tmp_path / "missing.json", LocalEvidenceStore(tmp_path))
    result = await pipeline.inspect(createPartImage(), makeRequest())
    assert not pipeline.isReady
    assert result.decision == "ERROR"
    assert result.reasonCode == "MODEL_UNAVAILABLE"
    assert "runEvaluation" in result.reasonDetail


@pytest.mark.asyncio
async def testInvalidModelOutputReturnsError(tmp_path):
    def analyze(image):
        raise ModelOutputError("Model output contains NaN or infinite values")

    result = await makeStubbedPipeline(tmp_path, analyze).inspect(createPartImage(), makeRequest())
    assert result.decision == "ERROR"
    assert result.reasonCode == "INVALID_MODEL_OUTPUT"


@pytest.mark.asyncio
async def testTimeoutReturnsError(tmp_path):
    def analyze(image):
        time.sleep(0.6)

    result = await makeStubbedPipeline(tmp_path, analyze).inspect(createPartImage(), makeRequest())
    assert result.decision == "ERROR"
    assert result.reasonCode == "INFERENCE_TIMEOUT"


@pytest.mark.asyncio
async def testUnexpectedFailureReturnsError(tmp_path):
    def analyze(image):
        raise RuntimeError("backend crashed")

    result = await makeStubbedPipeline(tmp_path, analyze).inspect(createPartImage(), makeRequest())
    assert result.decision == "ERROR"
    assert result.reasonCode == "INFERENCE_FAILED"


def testFeatureOutputValidation(syntheticProfilePath):
    extractor = OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(syntheticProfilePath.parent / "featureExtractor.onnx"), inputSize=224))
    good = [np.zeros((1, 32, 28, 28), np.float32), np.zeros((1, 96, 14, 14), np.float32)]
    assert extractor.validateOutputs(good)
    with pytest.raises(ModelOutputError):
        extractor.validateOutputs(good[:1])
    with pytest.raises(ModelOutputError):
        extractor.validateOutputs([np.zeros((1, 16, 28, 28), np.float32), good[1]])
    with pytest.raises(ModelOutputError):
        extractor.validateOutputs([np.full((1, 32, 28, 28), np.nan, np.float32), good[1]])


@pytest.mark.asyncio
async def testEndToEndDecisionsAndEvidence(syntheticProfilePath, tmp_path):
    pipeline = InspectionPipeline(syntheticProfilePath, LocalEvidenceStore(tmp_path))
    assert pipeline.isReady, pipeline.loadError
    normal = await pipeline.inspect(createPartImage(seed=300), makeRequest("normal"))
    defect = await pipeline.inspect(createPartImage(seed=301, defect=True), makeRequest("defect"))
    empty = await pipeline.inspect(np.full((480, 640, 3), 30, np.uint8), makeRequest("empty"))
    assert normal.decision in ("PASS", "REVIEW")
    assert defect.decision in ("FAIL", "REVIEW")
    assert defect.regions, "defect evidence regions expected"
    assert empty.decision == "NO_PART"
    for result in (normal, defect, empty):
        assert result.processingMode == "REAL_INFERENCE"
        assert result.modelId == "synthetic-test-profile"
        assert {item.kind for item in result.evidence} == {"input_image", "overlay"}
        assert all(LocalEvidenceStore(tmp_path).localPath(item.uri).is_file() for item in result.evidence)
        assert result.latency.totalMs > 0
    assert "anomalyScore" in normal.scores and "passBelow" in normal.thresholds


@pytest.mark.asyncio
async def testEvidenceFailureNeverPasses(syntheticProfilePath, tmp_path):
    class FailingStore(LocalEvidenceStore):
        def put(self, key, payload, contentType):
            raise EvidenceStorageError("disk full")

    pipeline = InspectionPipeline(syntheticProfilePath, FailingStore(tmp_path))
    result = await pipeline.inspect(createPartImage(seed=300), makeRequest())
    assert result.decision == "ERROR"
    assert result.reasonCode == "EVIDENCE_STORAGE_FAILED"


def testTamperedMemoryBankIsRejected(syntheticProfilePath, tmp_path):
    copyDir = tmp_path / "copy"
    shutil.copytree(syntheticProfilePath.parent, copyDir)
    with (copyDir / "memoryBank.npz").open("ab") as handle:
        handle.write(b"tamper")
    pipeline = InspectionPipeline(copyDir / "inspectionProfile.json", LocalEvidenceStore(tmp_path))
    assert not pipeline.isReady
    assert "checksum" in (pipeline.loadError or "")
    result = asyncio.run(pipeline.inspect(createPartImage(), makeRequest()))
    assert result.decision == "ERROR"


def testProfileIsReadable(syntheticProfilePath):
    assert json.loads(syntheticProfilePath.read_text())["decision"]["passBelow"] > 0


def testIncompatibleProfileIsRejectedAtLoad(syntheticProfilePath, tmp_path):
    copyDir = tmp_path / "stale"
    shutil.copytree(syntheticProfilePath.parent, copyDir)
    profilePath = copyDir / "inspectionProfile.json"
    profile = json.loads(profilePath.read_text())
    profile["capture"]["retiredThreshold"] = 1.0
    profilePath.write_text(json.dumps(profile))
    pipeline = InspectionPipeline(profilePath, LocalEvidenceStore(tmp_path))
    assert not pipeline.isReady
    assert "rebuild the profile" in (pipeline.loadError or "")
