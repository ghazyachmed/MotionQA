from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from .databaseSession import getDbSession
from .redisGateway import RedisGateway


router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def getHealth(session: AsyncSession = Depends(getDbSession)) -> dict[str, str]:
    # AI Assisted Logic
    await session.execute(text("SELECT 1"))
    redisGateway = RedisGateway()
    try:
        await redisGateway.redis.ping()
    finally:
        await redisGateway.close()
    return {"status": "ok", "postgres": "ok", "redis": "ok"}

