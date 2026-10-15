import asyncio
import logging
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker
from .alertService import SupervisorAlertService
from .databaseSession import asyncSessionMaker
from .defectEnums import ProcessingMode
from .defectSchemas import MesUpdatePayload, OpcUaStatusPayload
from .inspectionRepository import InspectionRepository
from .inspectionSchemas import InspectionResult
from .inspectionService import InspectionService
from .mesClient import AhmMesClient
from .opcUaClient import OpcUaStatusClient
from .redisGateway import RedisGateway

logger = logging.getLogger("motionQa.worker")


class RedisPersistenceWorker:
    """Persists stream events (edge processor path) idempotently and dispatches integrations once per real inspection."""

    def __init__(
        self,
        redisGateway: RedisGateway | None = None,
        sessionMaker: async_sessionmaker | None = None,
        alertService: SupervisorAlertService | None = None,
        mesClient: AhmMesClient | None = None,
        opcUaClient: OpcUaStatusClient | None = None,
    ):
        self.redisGateway = redisGateway or RedisGateway()
        self.sessionMaker = sessionMaker or asyncSessionMaker
        self.alertService = alertService or SupervisorAlertService()
        self.mesClient = mesClient or AhmMesClient()
        self.opcUaClient = opcUaClient or OpcUaStatusClient()
        self.isRunning = False

    async def run(self) -> None:
        # AI Assisted Logic
        self.isRunning = True
        while self.isRunning:
            try:
                async for payload in self.redisGateway.subscribeLiveEvents():
                    try:
                        event = InspectionResult.model_validate_json(payload)
                    except ValidationError as error:
                        logger.warning("dropping invalid stream event: %s", error.errors()[:2])
                        continue
                    await self.persistEvent(event)
            except asyncio.CancelledError:
                self.isRunning = False
                raise
            except Exception:
                logger.exception("persistence worker error; reconnecting")
                await asyncio.sleep(1.0)

    async def persistEvent(self, event: InspectionResult) -> bool:
        async with self.sessionMaker() as session:
            stored, isCreated = await InspectionService(InspectionRepository(session)).recordInspection(event)
        if stored.processingMode != ProcessingMode.realInference.value:
            return isCreated
        if not await self.redisGateway.claimIntegrationDispatch(stored.inspectionId):
            return isCreated
        mesPayload = MesUpdatePayload(inspectionId=stored.inspectionId, componentId=stored.componentId, decision=stored.decision, reasonCode=stored.reasonCode)
        opcPayload = OpcUaStatusPayload(inspectionId=stored.inspectionId, componentId=stored.componentId, lineId=stored.lineId, decision=stored.decision, anomalyScore=stored.scores.get("anomalyScore"))
        results = await asyncio.gather(
            self.alertService.sendDefectAlert(stored),
            self.mesClient.syncInspection(mesPayload),
            self.opcUaClient.publishStatus(opcPayload),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.warning("integration failed for %s: %s", stored.inspectionId, result)
        return isCreated

    async def close(self) -> None:
        self.isRunning = False
        await self.redisGateway.close()
