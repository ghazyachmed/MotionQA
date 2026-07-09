from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from .defectEnums import DefectType, InspectionStatus
from .defectSchemas import DefectLogCreate, DefectTrendBucket
from .domainModels import DefectLog


class DefectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def createLog(self, payload: DefectLogCreate) -> DefectLog:
        # AI Assisted Logic
        defectLog = DefectLog(
            componentCode=payload.componentCode,
            detectedAt=payload.detectedAt or datetime.now(timezone.utc),
            defectFound=DefectType(payload.defectFound),
            confidenceScore=Decimal(payload.confidenceScore),
            status=InspectionStatus(payload.status),
            imageSnapshotUrl=payload.imageSnapshotUrl,
            lineId=payload.lineId,
        )
        self.session.add(defectLog)
        await self.session.commit()
        await self.session.refresh(defectLog)
        return defectLog

    async def getLog(self, defectLogId: int) -> DefectLog | None:
        result = await self.session.execute(select(DefectLog).where(DefectLog.id == defectLogId))
        return result.scalar_one_or_none()

    async def listRecentLogs(self, limit: int = 50, lineId: str | None = None) -> list[DefectLog]:
        statement = select(DefectLog).order_by(DefectLog.detectedAt.desc()).limit(limit)
        if lineId:
            statement = statement.where(DefectLog.lineId == lineId)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def getTrendBuckets(self, minutes: int = 60, lineId: str | None = None) -> list[DefectTrendBucket]:
        sinceTime = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        bucketStart = func.date_trunc("minute", DefectLog.detectedAt)
        statement = (
            select(
                bucketStart.label("bucketStart"),
                DefectLog.lineId.label("lineId"),
                func.sum(case((DefectLog.status == InspectionStatus.passed, 1), else_=0)).label("passedCount"),
                func.sum(case((DefectLog.status == InspectionStatus.failed, 1), else_=0)).label("failedCount"),
                func.sum(case((DefectLog.defectFound == DefectType.castingDefect, 1), else_=0)).label("castingDefectCount"),
                func.sum(case((DefectLog.defectFound == DefectType.scratch, 1), else_=0)).label("scratchCount"),
                func.sum(case((DefectLog.defectFound == DefectType.dimensionalDeviation, 1), else_=0)).label("dimensionalDeviationCount"),
            )
            .where(DefectLog.detectedAt >= sinceTime)
            .group_by(bucketStart, DefectLog.lineId)
            .order_by(bucketStart.asc())
        )
        if lineId:
            statement = statement.where(DefectLog.lineId == lineId)
        result = await self.session.execute(statement)
        return [
            DefectTrendBucket(
                bucketStart=row.bucketStart,
                lineId=row.lineId,
                passedCount=int(row.passedCount or 0),
                failedCount=int(row.failedCount or 0),
                castingDefectCount=int(row.castingDefectCount or 0),
                scratchCount=int(row.scratchCount or 0),
                dimensionalDeviationCount=int(row.dimensionalDeviationCount or 0),
            )
            for row in result
        ]

