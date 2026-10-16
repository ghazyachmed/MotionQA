import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from .accessControl import getClientKey, requireOperatorToken
from .defectEnums import ProcessingMode, ReviewStatus
from .dependencyContainer import getInspectionPipeline, getInspectionService, getRedisGateway
from .inspection.evidenceStore import EvidenceStorageError
from .inspection.imageInput import InvalidImageError, decodeImage
from .inspection.inspectionPipeline import InspectionPipeline, InspectionRequest
from .inspectionSchemas import DecisionTrendResponse, InspectionResult, ReviewRequest, identifierPattern
from .inspectionService import InspectionNotFoundError, InspectionService
from .redisGateway import RedisGateway

logger = logging.getLogger("motionQa.api")
router = APIRouter(prefix="/api/v1/inspections", tags=["inspections"], dependencies=[Depends(requireOperatorToken)])
modelRouter = APIRouter(prefix="/api/v1/model", tags=["model"])
invalidImageStatus = {"UPLOAD_TOO_LARGE": status.HTTP_413_CONTENT_TOO_LARGE, "UNSUPPORTED_MEDIA_TYPE": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE}


@modelRouter.get("/status")
async def getModelStatus(pipeline: InspectionPipeline = Depends(getInspectionPipeline)) -> dict[str, object]:
    return pipeline.getStatus()


@router.post("", response_model=InspectionResult, status_code=status.HTTP_201_CREATED)
async def createInspection(
    request: Request,
    response: Response,
    image: UploadFile = File(...),
    inspectionId: str | None = Form(default=None, pattern=identifierPattern),
    componentId: str | None = Form(default=None, pattern=identifierPattern),
    lineId: str | None = Form(default=None, min_length=3, max_length=40),
    capturedAt: datetime | None = Form(default=None),
    service: InspectionService = Depends(getInspectionService),
    pipeline: InspectionPipeline = Depends(getInspectionPipeline),
    redisGateway: RedisGateway = Depends(getRedisGateway),
) -> InspectionResult:
    # AI Assisted Logic
    request.app.state.inspectionRateLimiter.check(getClientKey(request))
    resolvedInspectionId = inspectionId or f"insp-{uuid.uuid4()}"
    existing = await service.getInspection(resolvedInspectionId)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
        return existing
    stored, isCreated = await performInspection(request, response, image, resolvedInspectionId, componentId, lineId, capturedAt, service, pipeline, redisGateway)
    if not isCreated:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
    return stored


async def performInspection(request: Request, response: Response, image: UploadFile, inspectionId: str, componentId: str | None, lineId: str | None,
                            capturedAt: datetime | None, service: InspectionService, pipeline: InspectionPipeline, redisGateway: RedisGateway) -> tuple[InspectionResult, bool]:
    """Decode, inspect, persist, and publish one capture. Shared by single inspections and session attempts."""
    settings = request.app.state.settings
    payload = await image.read(settings.maxUploadBytes + 1)
    decodeStart = time.perf_counter()
    try:
        decoded = decodeImage(payload, maxBytes=settings.maxUploadBytes)
    except InvalidImageError as error:
        raise HTTPException(status_code=invalidImageStatus.get(error.code, status.HTTP_400_BAD_REQUEST), detail={"code": error.code, "message": error.detail}) from error
    decodeMs = (time.perf_counter() - decodeStart) * 1000
    inspectionRequest = InspectionRequest(
        inspectionId=inspectionId,
        lineId=lineId or settings.lineId,
        stationId=settings.stationId,
        componentId=componentId,
        capturedAt=capturedAt or datetime.now(timezone.utc),
    )
    result = await pipeline.inspect(decoded.image, inspectionRequest, decodeMs=decodeMs)
    stored, isCreated = await service.recordInspection(result)
    if not isCreated:
        return stored, False
    logger.info("inspection %s decision=%s reason=%s mode=%s totalMs=%.1f", stored.inspectionId, stored.decision, stored.reasonCode, stored.processingMode, stored.latency.totalMs)
    try:
        await redisGateway.publishLiveEvent(stored)
        response.headers["X-MotionQA-Live-Publish"] = "ok"
    except Exception as error:
        logger.warning("live publish failed for %s: %s", stored.inspectionId, error)
        response.headers["X-MotionQA-Live-Publish"] = "failed"
    return stored, True


@router.get("", response_model=list[InspectionResult])
async def listInspections(
    limit: int = Query(default=50, ge=1, le=500),
    lineId: str | None = Query(default=None, min_length=3, max_length=40),
    processingMode: ProcessingMode | None = Query(default=None),
    reviewStatus: ReviewStatus | None = Query(default=None),
    service: InspectionService = Depends(getInspectionService),
) -> list[InspectionResult]:
    return await service.listRecentInspections(limit=limit, lineId=lineId, processingMode=processingMode, reviewStatus=reviewStatus)


@router.get("/trends", response_model=DecisionTrendResponse)
async def getInspectionTrends(
    minutes: int = Query(default=60, ge=1, le=1440),
    lineId: str | None = Query(default=None, min_length=3, max_length=40),
    processingMode: ProcessingMode = Query(default=ProcessingMode.realInference),
    service: InspectionService = Depends(getInspectionService),
) -> DecisionTrendResponse:
    return await service.getTrendAnalytics(minutes=minutes, lineId=lineId, processingMode=processingMode)


@router.get("/{inspectionId}", response_model=InspectionResult)
async def getInspection(inspectionId: str, service: InspectionService = Depends(getInspectionService)) -> InspectionResult:
    inspection = await service.getInspection(inspectionId)
    if inspection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return inspection


@router.post("/{inspectionId}/review", response_model=InspectionResult)
async def reviewInspection(inspectionId: str, review: ReviewRequest, service: InspectionService = Depends(getInspectionService)) -> InspectionResult:
    try:
        return await service.reviewInspection(inspectionId, review)
    except InspectionNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found") from error


@router.get("/{inspectionId}/evidence/{kind}")
async def getEvidence(inspectionId: str, kind: str, request: Request, service: InspectionService = Depends(getInspectionService)):
    inspection = await service.getInspection(inspectionId)
    reference = next((item for item in inspection.evidence if item.kind == kind), None) if inspection else None
    if reference is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    try:
        payload = await asyncio.to_thread(request.app.state.evidenceStore.read, reference.uri)
    except EvidenceStorageError as error:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Evidence expired or unavailable") from error
    return Response(content=payload, media_type=reference.contentType, headers={"Cache-Control": "private, no-store"})
