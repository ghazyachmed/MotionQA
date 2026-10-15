from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .defectEnums import DefectType, InspectionDecision, ProcessingMode, ReviewStatus
from .inspectionSchemas import BoundingBox, DefectRegion, InspectionResult, ReviewState, identifierPattern

# Stream payloads on Redis and the WebSocket are full inspection results.
LiveQcEvent = InspectionResult

simulatedModelId = "browser-heuristic-demo"


class DemoEventRequest(BaseModel):
    """Browser demo event. The server always stores it as SIMULATED_DEMO, whatever the client sends."""

    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    inspectionId: str = Field(pattern=identifierPattern)
    lineId: str = Field(min_length=3, max_length=40)
    decision: InspectionDecision
    defectFound: DefectType = DefectType.none
    heuristicScore: float = Field(ge=0.0, le=1.0)
    isForcedScenario: bool = False
    boundingBox: BoundingBox | None = None
    capturedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    frameWidth: int = Field(default=0, ge=0, le=10000)
    frameHeight: int = Field(default=0, ge=0, le=10000)
    frameNumber: int | None = Field(default=None, ge=0)

    @field_validator("decision")
    @classmethod
    def validateDecision(cls, decision: InspectionDecision):
        if decision not in (InspectionDecision.passed, InspectionDecision.failed, InspectionDecision.noPart, InspectionDecision.passed.value, InspectionDecision.failed.value, InspectionDecision.noPart.value):
            raise ValueError("Demo events carry PASS, FAIL, or NO_PART")
        return decision

    def toInspectionResult(self) -> InspectionResult:
        # AI Assisted Logic
        isFail = self.decision == InspectionDecision.failed.value
        reasonCode = "SIMULATED_FORCED_SCENARIO" if self.isForcedScenario else "SIMULATED_HEURISTIC"
        return InspectionResult(
            inspectionId=self.inspectionId,
            lineId=self.lineId,
            capturedAt=self.capturedAt,
            decision=self.decision,
            reasonCode=reasonCode,
            reasonDetail="Browser heuristic demo; not a model decision and excluded from inspection metrics",
            processingMode=ProcessingMode.simulatedDemo,
            modelId=simulatedModelId,
            modelVersion="demo",
            defectFound=self.defectFound if isFail else DefectType.none,
            scores={"heuristicScore": self.heuristicScore},
            regions=[DefectRegion(**self.boundingBox.model_dump(), peakScore=self.heuristicScore)] if self.boundingBox and isFail else [],
            imageWidth=self.frameWidth,
            imageHeight=self.frameHeight,
            frameNumber=self.frameNumber,
            review=ReviewState(status=ReviewStatus.notRequired),
        )
