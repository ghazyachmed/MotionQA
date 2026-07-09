from datetime import datetime, timezone
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .defectEnums import DefectType, InspectionStatus


class BoundingBox(BaseModel):
    xMin: float = Field(ge=0.0)
    yMin: float = Field(ge=0.0)
    xMax: float = Field(ge=0.0)
    yMax: float = Field(ge=0.0)


class LiveQcEvent(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    eventId: str = Field(min_length=8, max_length=80)
    componentCode: str = Field(min_length=3, max_length=50)
    lineId: str = Field(min_length=3, max_length=20)
    defectFound: DefectType = DefectType.none
    confidenceScore: Decimal = Field(ge=0, le=1, max_digits=4, decimal_places=3)
    status: InspectionStatus
    detectedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    imageSnapshotUrl: str | None = None
    boundingBox: BoundingBox | None = None
    frameNumber: int = Field(ge=0)
    frameWidth: int = Field(default=0, ge=0)
    frameHeight: int = Field(default=0, ge=0)
    fps: float = Field(ge=0.0)

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

    def toDefectLogCreate(self):
        from .defectSchemas import DefectLogCreate

        # AI Assisted Logic
        return DefectLogCreate(
            componentCode=self.componentCode,
            lineId=self.lineId,
            defectFound=self.defectFound,
            confidenceScore=self.confidenceScore,
            status=self.status,
            imageSnapshotUrl=self.imageSnapshotUrl,
            detectedAt=self.detectedAt,
        )
