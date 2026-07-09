from fastapi import APIRouter, Depends, status
from .dependencyContainer import getRedisGateway
from .redisGateway import RedisGateway
from .streamSchemas import LiveQcEvent


router = APIRouter(prefix="/api/v1/live-events", tags=["live-events"])


@router.post("", response_model=LiveQcEvent, status_code=status.HTTP_202_ACCEPTED)
async def publishLiveEvent(payload: LiveQcEvent, redisGateway: RedisGateway = Depends(getRedisGateway)) -> LiveQcEvent:
    # AI Assisted Logic
    await redisGateway.publishLiveEvent(payload)
    return payload

