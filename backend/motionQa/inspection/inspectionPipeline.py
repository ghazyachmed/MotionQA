import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from ..defectEnums import DefectType, InspectionDecision, ProcessingMode, ReviewStatus
from ..inspectionSchemas import BoundingBox, DefectRegion, EvidenceReference, InspectionResult, LatencyBreakdown, ReviewState
from .anomalyScorer import MemoryBank, PatchCoreScorer, extractAnomalyRegions
from .captureQuality import CaptureThresholds, PartLocation, buildScoringMask, cropPartSquare, evaluateCaptureGates, locatePart, measureCapture
from .evidenceStore import EvidenceStorageError, buildEvidenceKey
from .featureExtractor import FeatureModelSpec, ModelOutputError, ModelUnavailableError, OpenCvFeatureExtractor
from .inspectionProfile import InspectionProfile, loadProfile
from .opencvRuntime import getOpenCvDiagnostics

logger = logging.getLogger("motionQa.inspection")


@dataclass
class InspectionRequest:
    inspectionId: str
    lineId: str
    stationId: str = "STATION_01"
    componentId: str | None = None
    capturedAt: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    frameNumber: int | None = None


@dataclass
class AnalysisOutcome:
    decision: InspectionDecision
    reasonCode: str
    reasonDetail: str
    scores: dict[str, float]
    thresholds: dict[str, float]
    location: PartLocation | None = None
    regions: list[DefectRegion] = field(default_factory=list)
    anomalyMap: np.ndarray | None = None
    cropBox: tuple[int, int, int] | None = None
    captureMs: float = 0.0
    inferenceMs: float = 0.0


def decideFromAnomalyScore(score: float, passBelow: float, failAtOrAbove: float) -> tuple[InspectionDecision, str]:
    # AI Assisted Logic
    if not np.isfinite(score):
        return InspectionDecision.error, "INVALID_MODEL_OUTPUT"
    if score >= failAtOrAbove:
        return InspectionDecision.failed, "ANOMALY_SCORE_AT_OR_ABOVE_FAIL_THRESHOLD"
    if score < passBelow:
        return InspectionDecision.passed, "ANOMALY_SCORE_BELOW_PASS_THRESHOLD"
    return InspectionDecision.review, "ANOMALY_SCORE_IN_REVIEW_BAND"


def reviewStatusFor(decision: InspectionDecision) -> ReviewStatus:
    return ReviewStatus.pending if decision in (InspectionDecision.review, InspectionDecision.failed) else ReviewStatus.notRequired


class InspectionPipeline:
    """Capture gates -> part identity -> anomaly score -> decision -> evidence. Never returns PASS on failure paths."""

    def __init__(self, profilePath: Path | None, evidenceStore, timeoutSeconds: float = 10.0, maxConcurrent: int = 2):
        self.profilePath = profilePath
        self.evidenceStore = evidenceStore
        self.timeoutSeconds = timeoutSeconds
        self.semaphore = asyncio.Semaphore(maxConcurrent)
        self.profile: InspectionProfile | None = None
        self.scorer: PatchCoreScorer | None = None
        self.loadError: str | None = None
        self.loadModel()

    def loadModel(self) -> None:
        # AI Assisted Logic
        diagnostics = getOpenCvDiagnostics()
        if not diagnostics.isSupported:
            self.loadError = diagnostics.detail
            return
        if self.profilePath is None or not self.profilePath.is_file():
            self.loadError = f"Inspection profile not found at {self.profilePath}. Build it with: python -m motionQa.evaluation.runEvaluation"
            return
        try:
            from ..edge.modelRegistry import computeSha256

            profile = loadProfile(self.profilePath)
            try:
                profile.captureThresholds
            except TypeError as error:
                raise ModelUnavailableError(f"Inspection profile capture thresholds do not match this code version ({error}); rebuild the profile") from error
            if not profile.decision.passBelow <= profile.decision.failAtOrAbove:
                raise ModelUnavailableError("Inspection profile has passBelow above failAtOrAbove")
            featurePath = profile.resolve(self.profilePath, profile.featureModel)
            bankPath = profile.resolve(self.profilePath, profile.memoryBank)
            if not bankPath.is_file():
                raise ModelUnavailableError(f"Memory bank not found at {bankPath}")
            if computeSha256(bankPath) != profile.memoryBank.sha256:
                raise ModelUnavailableError(f"Memory bank checksum mismatch at {bankPath}")
            extractor = OpenCvFeatureExtractor(
                FeatureModelSpec(
                    modelPath=str(featurePath),
                    sha256=profile.featureModel.sha256,
                    outputNames=profile.outputNames,
                    inputSize=profile.preprocessing.inputSize,
                    mean=profile.preprocessing.mean,
                    std=profile.preprocessing.std,
                )
            )
            self.scorer = PatchCoreScorer(extractor, MemoryBank.load(bankPath))
            self.profile = profile
            self.loadError = None
        except Exception as error:
            self.profile = None
            self.scorer = None
            self.loadError = f"{type(error).__name__}: {error}"
            logger.error("inspection model unavailable: %s", self.loadError)

    @property
    def isReady(self) -> bool:
        return self.profile is not None and self.scorer is not None

    def getStatus(self) -> dict[str, object]:
        profile = self.profile
        return {
            "ready": self.isReady,
            "loadError": self.loadError,
            "opencv": getOpenCvDiagnostics().toDict(),
            "profileId": profile.profileId if profile else None,
            "profileVersion": profile.version if profile else None,
            "task": profile.task if profile else None,
            "domainNote": profile.domainNote if profile else None,
            "decisionThresholds": profile.decision.model_dump() if profile else None,
            "timeoutSeconds": self.timeoutSeconds,
        }

    def analyze(self, image: np.ndarray) -> AnalysisOutcome:
        """Synchronous OpenCV + DNN analysis. Raises on model failures; the caller maps them to ERROR."""
        # AI Assisted Logic
        import cv2 as cv

        assert self.profile is not None and self.scorer is not None
        profile = self.profile
        captureThresholds: CaptureThresholds = profile.captureThresholds
        thresholds = {**captureThresholds.toDict(), **{key: float(value) for key, value in profile.decision.model_dump().items()}}
        captureStart = time.perf_counter()
        location = locatePart(image)
        metrics = measureCapture(image, location)
        scores = metrics.toScores()
        gate = evaluateCaptureGates(metrics, captureThresholds)
        captureMs = (time.perf_counter() - captureStart) * 1000
        if gate.decision is not None:
            return AnalysisOutcome(InspectionDecision(gate.decision), gate.reasonCode, gate.reasonDetail, scores, thresholds, location, captureMs=captureMs)

        inferenceStart = time.perf_counter()
        crop, cropMask, cropBox = cropPartSquare(image, location)
        inputSize = profile.preprocessing.inputSize
        cropResized = cv.resize(crop, (inputSize, inputSize), interpolation=cv.INTER_AREA)
        maskResized = buildScoringMask(cv.resize(cropMask, (inputSize, inputSize), interpolation=cv.INTER_NEAREST), profile.preprocessing.scoringMask)
        anomaly = self.scorer.score(cropResized, maskResized)
        inferenceMs = (time.perf_counter() - inferenceStart) * 1000
        scores["anomalyScore"] = anomaly.imageScore
        scores["identityDistance"] = anomaly.identityDistance
        if anomaly.identityDistance > profile.decision.identityMaxDistance:
            return AnalysisOutcome(
                InspectionDecision.noPart,
                "PART_NOT_RECOGNIZED",
                f"Object differs from the validated component (identity distance {anomaly.identityDistance:.3f} > {profile.decision.identityMaxDistance:.3f})",
                scores,
                thresholds,
                location,
                captureMs=captureMs,
                inferenceMs=inferenceMs,
            )
        decision, reasonCode = decideFromAnomalyScore(anomaly.imageScore, profile.decision.passBelow, profile.decision.failAtOrAbove)
        x0, y0, side = cropBox
        scale = side / inputSize
        regions = [
            DefectRegion(
                xMin=max(0.0, x0 + region.xMin * scale),
                yMin=max(0.0, y0 + region.yMin * scale),
                xMax=min(float(image.shape[1]), x0 + region.xMax * scale),
                yMax=min(float(image.shape[0]), y0 + region.yMax * scale),
                peakScore=region.peakScore,
            )
            for region in extractAnomalyRegions(anomaly.anomalyMap, profile.decision.regionThreshold)
        ]
        detail = f"Anomaly score {anomaly.imageScore:.3f}; PASS below {profile.decision.passBelow:.3f}, FAIL at or above {profile.decision.failAtOrAbove:.3f}"
        return AnalysisOutcome(decision, reasonCode, detail, scores, thresholds, location, regions, anomaly.anomalyMap, cropBox, captureMs, inferenceMs)

    async def inspect(self, image: np.ndarray, request: InspectionRequest, decodeMs: float = 0.0) -> InspectionResult:
        # AI Assisted Logic
        startTime = time.perf_counter()
        if not self.isReady:
            return self.buildErrorResult(request, image, "MODEL_UNAVAILABLE", self.loadError or "Model not loaded", decodeMs, startTime)
        try:
            async with self.semaphore:
                outcome = await asyncio.wait_for(asyncio.to_thread(self.analyze, image), timeout=self.timeoutSeconds)
        except asyncio.TimeoutError:
            return self.buildErrorResult(request, image, "INFERENCE_TIMEOUT", f"Inspection exceeded {self.timeoutSeconds:.1f}s", decodeMs, startTime)
        except ModelOutputError as error:
            return self.buildErrorResult(request, image, "INVALID_MODEL_OUTPUT", str(error), decodeMs, startTime)
        except Exception as error:
            logger.exception("inspection %s failed", request.inspectionId)
            return self.buildErrorResult(request, image, "INFERENCE_FAILED", f"{type(error).__name__}: {error}", decodeMs, startTime)

        evidenceStart = time.perf_counter()
        try:
            evidence = await asyncio.to_thread(self.writeEvidence, request, image, outcome)
        except EvidenceStorageError as error:
            logger.error("evidence storage failed for %s: %s", request.inspectionId, error)
            errorResult = self.buildErrorResult(request, image, "EVIDENCE_STORAGE_FAILED", str(error), decodeMs, startTime)
            errorResult.scores = outcome.scores
            return errorResult
        evidenceMs = (time.perf_counter() - evidenceStart) * 1000
        location = outcome.location
        assert self.profile is not None
        return InspectionResult(
            inspectionId=request.inspectionId,
            componentId=request.componentId,
            lineId=request.lineId,
            stationId=request.stationId,
            capturedAt=request.capturedAt,
            decision=outcome.decision,
            reasonCode=outcome.reasonCode,
            reasonDetail=outcome.reasonDetail,
            processingMode=ProcessingMode.realInference,
            modelId=self.profile.modelId,
            modelVersion=self.profile.version,
            defectFound=DefectType.anomaly if outcome.decision == InspectionDecision.failed else DefectType.none,
            scores=outcome.scores,
            thresholds=outcome.thresholds,
            regions=outcome.regions,
            partBox=BoundingBox(xMin=location.xMin, yMin=location.yMin, xMax=location.xMax, yMax=location.yMax) if location and location.found else None,
            evidence=evidence,
            latency=LatencyBreakdown(
                decodeMs=round(decodeMs, 2),
                captureChecksMs=round(outcome.captureMs, 2),
                inferenceMs=round(outcome.inferenceMs, 2),
                evidenceMs=round(evidenceMs, 2),
                totalMs=round(decodeMs + (time.perf_counter() - startTime) * 1000, 2),
            ),
            imageWidth=int(image.shape[1]),
            imageHeight=int(image.shape[0]),
            frameNumber=request.frameNumber,
            review=ReviewState(status=reviewStatusFor(outcome.decision)),
        )

    def buildErrorResult(self, request: InspectionRequest, image: np.ndarray | None, reasonCode: str, detail: str, decodeMs: float, startTime: float) -> InspectionResult:
        profile = self.profile
        return InspectionResult(
            inspectionId=request.inspectionId,
            componentId=request.componentId,
            lineId=request.lineId,
            stationId=request.stationId,
            capturedAt=request.capturedAt,
            decision=InspectionDecision.error,
            reasonCode=reasonCode,
            reasonDetail=detail[:500],
            processingMode=ProcessingMode.realInference,
            modelId=profile.modelId if profile else None,
            modelVersion=profile.version if profile else None,
            latency=LatencyBreakdown(decodeMs=round(decodeMs, 2), totalMs=round(decodeMs + (time.perf_counter() - startTime) * 1000, 2)),
            imageWidth=int(image.shape[1]) if image is not None else 0,
            imageHeight=int(image.shape[0]) if image is not None else 0,
            frameNumber=request.frameNumber,
        )

    def writeEvidence(self, request: InspectionRequest, image: np.ndarray, outcome: AnalysisOutcome) -> list[EvidenceReference]:
        import cv2 as cv
        from .evidenceRendering import renderOverlay

        references: list[EvidenceReference] = []
        displayImage = image
        longSide = max(image.shape[:2])
        if longSide > 1600:
            scale = 1600 / longSide
            displayImage = cv.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)), interpolation=cv.INTER_AREA)
        for kind, frame in (("input_image", displayImage), ("overlay", renderOverlay(image, outcome, self.profile))):
            success, encoded = cv.imencode(".jpg", frame, [cv.IMWRITE_JPEG_QUALITY, 90])
            if not success:
                raise EvidenceStorageError(f"JPEG encoding failed for {kind}")
            stored = self.evidenceStore.put(buildEvidenceKey(request.inspectionId, kind, request.capturedAt, "jpg"), encoded.tobytes(), "image/jpeg")
            references.append(EvidenceReference(kind=kind, uri=stored.uri, contentType=stored.contentType, sha256=stored.sha256))
        return references
