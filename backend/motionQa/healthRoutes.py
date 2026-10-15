import logging
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from .databaseSession import getDbSession
from .redisGateway import RedisGateway

logger = logging.getLogger("motionQa.health")
router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def getHealth(request: Request, response: Response, session: AsyncSession = Depends(getDbSession)) -> dict[str, object]:
    # AI Assisted Logic
    checks: dict[str, str] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as error:
        checks["postgres"] = f"error: {type(error).__name__}"
    redisGateway = RedisGateway()
    try:
        await redisGateway.redis.ping()
        checks["redis"] = "ok"
    except Exception as error:
        checks["redis"] = f"error: {type(error).__name__}"
    finally:
        await redisGateway.close()
    pipeline = request.app.state.inspectionPipeline
    checks["inspectionModel"] = "ok" if pipeline.isReady else f"unavailable: {pipeline.loadError}"
    isHealthy = all(value == "ok" for value in checks.values())
    if not isHealthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        logger.warning("health degraded: %s", checks)
    return {"status": "ok" if isHealthy else "degraded", **checks}
