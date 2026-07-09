from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from motionQa.databaseSession import Base
from motionQa.defectEnums import DefectType, InspectionStatus
from motionQa.defectRepository import DefectRepository
from motionQa.defectSchemas import DefectLogCreate
from motionQa.defectService import DefectService


@pytest.mark.asyncio
async def testRecordInspectionPersistsDefectLog():
    # AI Assisted Logic
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessionMaker = async_sessionmaker(engine, expire_on_commit=False)
    async with sessionMaker() as session:
        service = DefectService(DefectRepository(session))
        result = await service.recordInspection(
            DefectLogCreate(
                componentCode="LINE_KARAWANG_01-0001",
                lineId="LINE_KARAWANG_01",
                defectFound=DefectType.scratch,
                confidenceScore=Decimal("0.912"),
                status=InspectionStatus.failed,
            )
        )

    await engine.dispose()
    assert result.id == 1
    assert result.status == InspectionStatus.failed.value
    assert result.defectFound == DefectType.scratch.value

