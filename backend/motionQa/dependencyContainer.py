from collections.abc import AsyncGenerator
from pathlib import Path
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from .alertService import SupervisorAlertService
from .configSettings import AppSettings
from .databaseSession import getDbSession
from .inspection.evidenceStore import LocalEvidenceStore, S3EvidenceStore
from .inspection.inspectionPipeline import InspectionPipeline
from .inspectionRepository import InspectionRepository
from .inspectionService import InspectionService
from .mesClient import AhmMesClient
from .opcUaClient import OpcUaStatusClient
from .redisGateway import RedisGateway


def createEvidenceStore(settings: AppSettings):
    # AI Assisted Logic
    if settings.evidenceBackend == "s3":
        if not settings.evidenceBucket:
            raise RuntimeError("MOTIONQA_EVIDENCE_BACKEND=s3 requires MOTIONQA_EVIDENCE_BUCKET")
        return S3EvidenceStore(settings.evidenceBucket, settings.evidencePrefix, settings.awsRegion, settings.evidenceKmsKeyId)
    return LocalEvidenceStore(Path(settings.evidenceDir), settings.evidenceRetentionDays)


def createInspectionPipeline(settings: AppSettings, evidenceStore) -> InspectionPipeline:
    return InspectionPipeline(Path(settings.inspectionProfilePath), evidenceStore, timeoutSeconds=settings.inferenceTimeoutSeconds)


async def getInspectionService(session: AsyncSession = Depends(getDbSession)) -> InspectionService:
    return InspectionService(InspectionRepository(session))


def getInspectionPipeline(request: Request) -> InspectionPipeline:
    return request.app.state.inspectionPipeline


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
