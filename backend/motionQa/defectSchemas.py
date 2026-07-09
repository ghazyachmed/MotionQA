from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .defectEnums import DefectType, InspectionStatus, IntegrationStatus


class DefectLogCreate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    componentCode: str = Field(min_length=3, max_length=50)
    lineId: str = Field(min_length=3, max_length=20)
    defectFound: DefectType = DefectType.none
    confidenceScore: Decimal = Field(ge=0, le=1, max_digits=4, decimal_places=3)
    status: InspectionStatus
    imageSnapshotUrl: str | None = None
    detectedAt: datetime | None = None

    @field_validator("status")
    @classmethod
    def validateStatus(cls, status: InspectionStatus, values):
        defectFound = values.data.get("defectFound")
        isNoneDefect = defectFound in (DefectType.none, DefectType.none.value)
        isFailed = status in (InspectionStatus.failed, InspectionStatus.failed.value)
        isPassed = status in (InspectionStatus.passed, InspectionStatus.passed.value)
        if isNoneDefect and isFailed:
            raise ValueError("FAILED requires defect")
        if not isNoneDefect and isPassed:
            raise ValueError("PASSED requires none")
        return status


class DefectLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    componentCode: str
    detectedAt: datetime
    defectFound: DefectType
    confidenceScore: Decimal
    status: InspectionStatus
    imageSnapshotUrl: str | None
    lineId: str


class DefectTrendBucket(BaseModel):
    bucketStart: datetime
    lineId: str
    passedCount: int
    failedCount: int
    castingDefectCount: int
    scratchCount: int
    dimensionalDeviationCount: int


class DefectTrendResponse(BaseModel):
    buckets: list[DefectTrendBucket]


class MesUpdatePayload(BaseModel):
    componentCode: str = Field(min_length=3, max_length=50)
    status: InspectionStatus
    defectLogId: int = Field(gt=0)


class IntegrationResult(BaseModel):
    status: IntegrationStatus
    target: str
    detail: str


class OpcUaStatusPayload(BaseModel):
    componentCode: str = Field(min_length=3, max_length=50)
    lineId: str = Field(min_length=3, max_length=20)
    status: InspectionStatus
    defectFound: DefectType
    confidenceScore: float = Field(ge=0.0, le=1.0)
