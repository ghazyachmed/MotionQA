import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .accessControl import getClientKey, requireOperatorToken
from .databaseSession import getDbSession
from .defectEnums import ReviewStatus
from .dependencyContainer import getInspectionPipeline, getRedisGateway
from .domainModels import InspectionRecord, InspectionSessionRecord, SessionAttemptRecord
from .inspection.inspectionPipeline import InspectionPipeline
from .inspection.sessionPolicy import evaluateSession
from .inspectionRepository import InspectionRepository, ensureUtc, recordToResult
from .inspectionRoutes import performInspection
from .inspectionSchemas import InspectionSessionView, SessionAttemptResponse, SessionCreateRequest
from .inspectionService import InspectionService
from .redisGateway import RedisGateway

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"], dependencies=[Depends(requireOperatorToken)])


async def loadSession(db: AsyncSession, sessionId: str) -> InspectionSessionRecord:
    record = (await db.execute(select(InspectionSessionRecord).where(InspectionSessionRecord.sessionId == sessionId))).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return record


async def buildView(db: AsyncSession, session: InspectionSessionRecord) -> InspectionSessionView:
    # AI Assisted Logic
    attemptRows = (await db.execute(select(SessionAttemptRecord).where(SessionAttemptRecord.sessionId == session.sessionId).order_by(SessionAttemptRecord.attemptNumber))).scalars().all()
    repository = InspectionRepository(db)
    attempts = []
    for row in attemptRows:
        record = await repository.getByInspectionId(row.inspectionId)
        if record is not None:
            attempts.append(recordToResult(record))
    state = evaluateSession([(attempt.decision, attempt.reasonCode) for attempt in attempts], session.maxAttempts)
    return InspectionSessionView(
        sessionId=session.sessionId, componentId=session.componentId, lineId=session.lineId, stationId=session.stationId,
        maxAttempts=session.maxAttempts, status=session.status, finalDecision=session.finalDecision, finalReasonCode=session.finalReasonCode,
        nextAttemptAllowed=state.nextAttemptAllowed and session.status == "OPEN", guidance=state.guidance,
        createdAt=ensureUtc(session.createdAt), closedAt=ensureUtc(session.closedAt) if session.closedAt else None, attempts=attempts,
    )


@router.post("", response_model=InspectionSessionView, status_code=status.HTTP_201_CREATED)
async def createSession(payload: SessionCreateRequest, request: Request, response: Response, db: AsyncSession = Depends(getDbSession)) -> InspectionSessionView:
    settings = request.app.state.settings
    sessionId = payload.sessionId or f"sess-{uuid.uuid4()}"
    existing = (await db.execute(select(InspectionSessionRecord).where(InspectionSessionRecord.sessionId == sessionId))).scalar_one_or_none()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
        return await buildView(db, existing)
    session = InspectionSessionRecord(sessionId=sessionId, componentId=payload.componentId, lineId=payload.lineId or settings.lineId,
                                      stationId=settings.stationId, maxAttempts=payload.maxAttempts, status="OPEN")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return await buildView(db, session)


@router.get("/{sessionId}", response_model=InspectionSessionView)
async def getSession(sessionId: str, db: AsyncSession = Depends(getDbSession)) -> InspectionSessionView:
    return await buildView(db, await loadSession(db, sessionId))


@router.post("/{sessionId}/attempts", response_model=SessionAttemptResponse, status_code=status.HTTP_201_CREATED)
async def addAttempt(
    sessionId: str,
    request: Request,
    response: Response,
    image: UploadFile = File(...),
    attemptNumber: int = Form(..., ge=1, le=5),
    capturedAt: datetime | None = Form(default=None),
    db: AsyncSession = Depends(getDbSession),
    pipeline: InspectionPipeline = Depends(getInspectionPipeline),
    redisGateway: RedisGateway = Depends(getRedisGateway),
) -> SessionAttemptResponse:
    """Run one capture inside a session. Re-sending the same attemptNumber replays the stored result."""
    # AI Assisted Logic
    request.app.state.inspectionRateLimiter.check(getClientKey(request))
    session = await loadSession(db, sessionId)
    inspectionId = f"{sessionId}-a{attemptNumber:02d}"
    repository = InspectionRepository(db)
    existing = await repository.getByInspectionId(inspectionId)
    isLinked = existing is not None and (await db.execute(select(SessionAttemptRecord).where(SessionAttemptRecord.inspectionId == inspectionId))).scalar_one_or_none() is not None
    if isLinked:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
        return SessionAttemptResponse(session=await buildView(db, session), inspection=recordToResult(existing))
    attemptCount = len((await db.execute(select(SessionAttemptRecord).where(SessionAttemptRecord.sessionId == sessionId))).scalars().all())
    if session.status != "OPEN":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Session is {session.status}; start a new session for another part")
    if attemptNumber != attemptCount + 1 or attemptNumber > session.maxAttempts:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Expected attempt {attemptCount + 1} of at most {session.maxAttempts}")
    if existing is None:
        stored, _ = await performInspection(request, response, image, inspectionId, session.componentId, session.lineId, capturedAt,
                                            InspectionService(repository), pipeline, redisGateway)
    else:
        # Stored by an earlier request that failed before linking: link it now instead of inspecting a second time.
        stored = recordToResult(existing)
    db.add(SessionAttemptRecord(sessionId=sessionId, attemptNumber=attemptNumber, inspectionId=inspectionId))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
        return SessionAttemptResponse(session=await buildView(db, await loadSession(db, sessionId)), inspection=stored)
    view = await buildView(db, session)
    state = evaluateSession([(attempt.decision, attempt.reasonCode) for attempt in view.attempts], session.maxAttempts)
    if state.status != "OPEN":
        session.status, session.finalDecision, session.finalReasonCode = state.status, state.finalDecision, state.finalReasonCode
        session.closedAt = datetime.now(timezone.utc)
        if state.status == "ESCALATED":
            # The last attempt enters the existing human review queue; its machine decision stays unchanged.
            record = await repository.getByInspectionId(inspectionId)
            record.reviewStatus = ReviewStatus.pending
        await db.commit()
        view = await buildView(db, session)
    return SessionAttemptResponse(session=view, inspection=recordToResult(await repository.getByInspectionId(inspectionId)))
