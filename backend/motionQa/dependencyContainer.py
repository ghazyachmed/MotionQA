from collections.abc import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .alertService import SupervisorAlertService
from .databaseSession import getDbSession
from .defectRepository import DefectRepository
from .defectService import DefectService
from .mesClient import AhmMesClient
from .opcUaClient import OpcUaStatusClient
from .redisGateway import RedisGateway


async def getDefectService(session: AsyncSession = Depends(getDbSession)) -> DefectService:
    # AI Assisted Logic
    return DefectService(DefectRepository(session))


async def getRedisGateway() -> AsyncGenerator[RedisGateway, None]:
    gateway = RedisGateway()
    try:
        yield gateway
    finally:
        await gateway.close()


def getMesClient() -> AhmMesClient:
    return AhmMesClient()


def getOpcUaClient() -> OpcUaStatusClient:
    return OpcUaStatusClient()


def getAlertService() -> SupervisorAlertService:
    return SupervisorAlertService()

