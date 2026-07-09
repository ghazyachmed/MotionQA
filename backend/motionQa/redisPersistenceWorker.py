import asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker
from .alertService import SupervisorAlertService
from .databaseSession import asyncSessionMaker
from .defectRepository import DefectRepository
from .defectSchemas import MesUpdatePayload, OpcUaStatusPayload
from .defectService import DefectService, DuplicateComponentError
from .mesClient import AhmMesClient
from .opcUaClient import OpcUaStatusClient
from .redisGateway import RedisGateway
from .streamSchemas import LiveQcEvent


class RedisPersistenceWorker:
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
                    event = LiveQcEvent.model_validate_json(payload)
                    await self.persistEvent(event)
            except asyncio.CancelledError:
                self.isRunning = False
                raise
            except Exception:
                await asyncio.sleep(1.0)

    async def persistEvent(self, event: LiveQcEvent) -> None:
        async with self.sessionMaker() as session:
            service = DefectService(DefectRepository(session))
            try:
                defectLog = await service.recordInspection(event.toDefectLogCreate())
            except DuplicateComponentError:
                return
        mesPayload = MesUpdatePayload(componentCode=event.componentCode, status=event.status, defectLogId=defectLog.id)
        opcPayload = OpcUaStatusPayload(
            componentCode=event.componentCode,
            lineId=event.lineId,
            status=event.status,
            defectFound=event.defectFound,
            confidenceScore=float(event.confidenceScore),
        )
        await asyncio.gather(
            self.alertService.sendDefectAlert(event),
            self.mesClient.syncInspection(mesPayload),
            self.opcUaClient.publishStatus(opcPayload),
            return_exceptions=True,
        )

    async def close(self) -> None:
        self.isRunning = False
        await self.redisGateway.close()

