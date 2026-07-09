from sqlalchemy.exc import IntegrityError
from .defectRepository import DefectRepository
from .defectSchemas import DefectLogCreate, DefectLogRead, DefectTrendResponse


class DuplicateComponentError(Exception):
    """Duplicate component."""


class DefectService:
    def __init__(self, repository: DefectRepository):
        self.repository = repository

    async def recordInspection(self, payload: DefectLogCreate) -> DefectLogRead:
        try:
            defectLog = await self.repository.createLog(payload)
        except IntegrityError as error:
            raise DuplicateComponentError(payload.componentCode) from error
        return DefectLogRead.model_validate(defectLog)

    async def listRecentInspections(self, limit: int, lineId: str | None) -> list[DefectLogRead]:
        defectLogs = await self.repository.listRecentLogs(limit=limit, lineId=lineId)
        return [DefectLogRead.model_validate(defectLog) for defectLog in defectLogs]

    async def getTrendAnalytics(self, minutes: int, lineId: str | None) -> DefectTrendResponse:
        # AI Assisted Logic
        buckets = await self.repository.getTrendBuckets(minutes=minutes, lineId=lineId)
        return DefectTrendResponse(buckets=buckets)
