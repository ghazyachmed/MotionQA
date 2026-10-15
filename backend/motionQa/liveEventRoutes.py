import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from .accessControl import getClientKey, requireOperatorToken
from .dependencyContainer import getInspectionService, getRedisGateway
from .inspectionSchemas import InspectionResult
from .inspectionService import InspectionService
from .redisGateway import RedisGateway
from .streamSchemas import DemoEventRequest

logger = logging.getLogger("motionQa.api")
router = APIRouter(prefix="/api/v1/live-events", tags=["live-events"], dependencies=[Depends(requireOperatorToken)])


@router.post("", response_model=InspectionResult, status_code=status.HTTP_202_ACCEPTED)
async def publishDemoEvent(
    payload: DemoEventRequest,
    request: Request,
    service: InspectionService = Depends(getInspectionService),
    redisGateway: RedisGateway = Depends(getRedisGateway),
) -> InspectionResult:
    # AI Assisted Logic
    request.app.state.demoRateLimiter.check(getClientKey(request))
    stored, isCreated = await service.recordInspection(payload.toInspectionResult())
    if isCreated:
        try:
            await redisGateway.publishLiveEvent(stored)
        except Exception as error:
            logger.warning("demo event publish failed for %s: %s", stored.inspectionId, error)
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Event stored but live stream is unavailable") from error
    return stored
