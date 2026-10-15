from .defectEnums import ProcessingMode, ReviewStatus
from .inspectionRepository import InspectionRepository, recordToResult
from .inspectionSchemas import DecisionTrendResponse, InspectionResult, ReviewRequest


class InspectionNotFoundError(Exception):
    """Unknown inspection identifier."""


class InspectionService:
    def __init__(self, repository: InspectionRepository):
        self.repository = repository

    async def recordInspection(self, inspection: InspectionResult) -> tuple[InspectionResult, bool]:
        # AI Assisted Logic
        record, isCreated = await self.repository.insertIfAbsent(inspection)
        return recordToResult(record), isCreated

    async def getInspection(self, inspectionId: str) -> InspectionResult | None:
        record = await self.repository.getByInspectionId(inspectionId)
        return recordToResult(record) if record else None

    async def listRecentInspections(self, limit: int, lineId: str | None, processingMode: ProcessingMode | None, reviewStatus: ReviewStatus | None) -> list[InspectionResult]:
        records = await self.repository.listRecent(limit=limit, lineId=lineId, processingMode=processingMode, reviewStatus=reviewStatus)
        return [recordToResult(record) for record in records]

    async def reviewInspection(self, inspectionId: str, review: ReviewRequest) -> InspectionResult:
        record = await self.repository.getByInspectionId(inspectionId)
        if record is None:
            raise InspectionNotFoundError(inspectionId)
        return recordToResult(await self.repository.applyReview(record, review))

    async def getTrendAnalytics(self, minutes: int, lineId: str | None, processingMode: ProcessingMode) -> DecisionTrendResponse:
        buckets = await self.repository.getDecisionBuckets(minutes=minutes, lineId=lineId, processingMode=processingMode)
        return DecisionTrendResponse(processingMode=processingMode, buckets=buckets)
