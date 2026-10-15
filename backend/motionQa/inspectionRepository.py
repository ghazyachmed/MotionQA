from collections import defaultdict
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .defectEnums import InspectionDecision, ProcessingMode, ReviewStatus
from .domainModels import InspectionRecord
from .inspectionSchemas import DecisionTrendBucket, InspectionResult, ReviewRequest, ReviewState


def recordToResult(record: InspectionRecord) -> InspectionResult:
    return InspectionResult(
        inspectionId=record.inspectionId,
        componentId=record.componentId,
        lineId=record.lineId,
        stationId=record.stationId,
        capturedAt=ensureUtc(record.capturedAt),
        processedAt=ensureUtc(record.processedAt),
        decision=record.decision,
        reasonCode=record.reasonCode,
        reasonDetail=record.reasonDetail,
        processingMode=record.processingMode,
        modelId=record.modelId,
        modelVersion=record.modelVersion,
        defectFound=record.defectFound,
        scores=record.scores or {},
        thresholds=record.thresholds or {},
        regions=record.regions or [],
        partBox=record.partBox,
        evidence=record.evidence or [],
        latency=record.latency or {},
        imageWidth=record.imageWidth,
        imageHeight=record.imageHeight,
        frameNumber=record.frameNumber,
        review=ReviewState(
            status=record.reviewStatus,
            reviewerDecision=record.reviewerDecision,
            reviewerNote=record.reviewerNote,
            reviewedBy=record.reviewedBy,
            reviewedAt=ensureUtc(record.reviewedAt) if record.reviewedAt else None,
        ),
    )


def ensureUtc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class InspectionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def getByInspectionId(self, inspectionId: str) -> InspectionRecord | None:
        result = await self.session.execute(select(InspectionRecord).where(InspectionRecord.inspectionId == inspectionId))
        return result.scalar_one_or_none()

    async def insertIfAbsent(self, inspection: InspectionResult) -> tuple[InspectionRecord, bool]:
        # AI Assisted Logic
        existing = await self.getByInspectionId(inspection.inspectionId)
        if existing is not None:
            return existing, False
        payload = inspection.model_dump(mode="json")
        record = InspectionRecord(
            inspectionId=inspection.inspectionId,
            componentId=inspection.componentId,
            lineId=inspection.lineId,
            stationId=inspection.stationId,
            capturedAt=inspection.capturedAt,
            processedAt=inspection.processedAt,
            decision=InspectionDecision(inspection.decision),
            reasonCode=inspection.reasonCode,
            reasonDetail=inspection.reasonDetail,
            processingMode=ProcessingMode(inspection.processingMode),
            modelId=inspection.modelId,
            modelVersion=inspection.modelVersion,
            defectFound=inspection.defectFound,
            scores=payload["scores"],
            thresholds=payload["thresholds"],
            regions=payload["regions"],
            partBox=payload["partBox"],
            evidence=payload["evidence"],
            latency=payload["latency"],
            imageWidth=inspection.imageWidth,
            imageHeight=inspection.imageHeight,
            frameNumber=inspection.frameNumber,
            reviewStatus=ReviewStatus(inspection.review.status),
        )
        self.session.add(record)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            existing = await self.getByInspectionId(inspection.inspectionId)
            if existing is None:
                raise
            return existing, False
        await self.session.refresh(record)
        return record, True

    async def listRecent(self, limit: int, lineId: str | None, processingMode: ProcessingMode | None, reviewStatus: ReviewStatus | None) -> list[InspectionRecord]:
        statement = select(InspectionRecord).order_by(InspectionRecord.capturedAt.desc()).limit(limit)
        if lineId:
            statement = statement.where(InspectionRecord.lineId == lineId)
        if processingMode:
            statement = statement.where(InspectionRecord.processingMode == processingMode)
        if reviewStatus:
            statement = statement.where(InspectionRecord.reviewStatus == reviewStatus)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def applyReview(self, record: InspectionRecord, review: ReviewRequest) -> InspectionRecord:
        machineDecision = InspectionDecision(record.decision)
        record.reviewerDecision = review.reviewerDecision
        record.reviewerNote = review.reviewerNote
        record.reviewedBy = review.reviewedBy
        record.reviewedAt = datetime.now(timezone.utc)
        record.reviewStatus = ReviewStatus.confirmed if review.reviewerDecision == machineDecision else ReviewStatus.overridden
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def getDecisionBuckets(self, minutes: int, lineId: str | None, processingMode: ProcessingMode) -> list[DecisionTrendBucket]:
        sinceTime = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        statement = select(InspectionRecord.capturedAt, InspectionRecord.lineId, InspectionRecord.decision).where(
            InspectionRecord.capturedAt >= sinceTime, InspectionRecord.processingMode == processingMode
        )
        if lineId:
            statement = statement.where(InspectionRecord.lineId == lineId)
        buckets: dict[tuple[datetime, str], dict[str, int]] = defaultdict(lambda: {decision.value: 0 for decision in InspectionDecision})
        for capturedAt, recordLineId, decision in (await self.session.execute(statement)).all():
            bucketStart = ensureUtc(capturedAt).replace(second=0, microsecond=0)
            buckets[(bucketStart, recordLineId)][InspectionDecision(decision).value] += 1
        return [DecisionTrendBucket(bucketStart=bucketStart, lineId=bucketLineId, counts=counts) for (bucketStart, bucketLineId), counts in sorted(buckets.items())]
