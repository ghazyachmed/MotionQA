from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator
from .defectEnums import DefectType, InspectionDecision, ProcessingMode, ReviewStatus

identifierPattern = r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$"


class BoundingBox(BaseModel):
    xMin: float = Field(ge=0.0)
    yMin: float = Field(ge=0.0)
    xMax: float = Field(ge=0.0)
    yMax: float = Field(ge=0.0)


class DefectRegion(BoundingBox):
    peakScore: float


class EvidenceReference(BaseModel):
    kind: str = Field(pattern=r"^[a-z_]{3,40}$")
    uri: str
    contentType: str
    sha256: str | None = None


class LatencyBreakdown(BaseModel):
    decodeMs: float = 0.0
    captureChecksMs: float = 0.0
    inferenceMs: float = 0.0
    evidenceMs: float = 0.0
    totalMs: float = 0.0


class ReviewState(BaseModel):
    status: ReviewStatus = ReviewStatus.notRequired
    reviewerDecision: InspectionDecision | None = None
    reviewerNote: str | None = None
    reviewedBy: str | None = None
    reviewedAt: datetime | None = None


class InspectionResult(BaseModel):
    """One physical inspection. `decision` is the machine decision and never changes after review."""

    model_config = ConfigDict(use_enum_values=True)

    inspectionId: str = Field(pattern=identifierPattern)
    componentId: str | None = Field(default=None, pattern=identifierPattern)
    lineId: str = Field(min_length=3, max_length=40)
    stationId: str = Field(default="STATION_01", min_length=3, max_length=40)
    capturedAt: datetime
    processedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decision: InspectionDecision
    reasonCode: str = Field(min_length=3, max_length=60)
    reasonDetail: str = ""
    processingMode: ProcessingMode
    modelId: str | None = None
    modelVersion: str | None = None
    defectFound: DefectType = DefectType.none
    scores: dict[str, float] = Field(default_factory=dict)
    thresholds: dict[str, float] = Field(default_factory=dict)
    regions: list[DefectRegion] = Field(default_factory=list)
    partBox: BoundingBox | None = None
    evidence: list[EvidenceReference] = Field(default_factory=list)
    latency: LatencyBreakdown = Field(default_factory=LatencyBreakdown)
    imageWidth: int = Field(default=0, ge=0)
    imageHeight: int = Field(default=0, ge=0)
    frameNumber: int | None = Field(default=None, ge=0)
    review: ReviewState = Field(default_factory=ReviewState)

    @model_validator(mode="after")
    def validateDecisionConsistency(self):
        # AI Assisted Logic
        if self.decision == InspectionDecision.passed.value and self.defectFound != DefectType.none.value:
            raise ValueError("PASS cannot carry a defect")
        if self.decision == InspectionDecision.failed.value and self.defectFound == DefectType.none.value:
            raise ValueError("FAIL requires a defect type")
        if self.processingMode == ProcessingMode.realInference.value and self.decision in (InspectionDecision.passed.value, InspectionDecision.failed.value, InspectionDecision.review.value):
            if not self.modelId or "anomalyScore" not in self.scores:
                raise ValueError("Real-inference PASS/FAIL/REVIEW requires a model identifier and anomalyScore")
        return self

    @computed_field
    @property
    def finalDecision(self) -> str:
        return self.review.reviewerDecision or self.decision


class ReviewRequest(BaseModel):
    reviewerDecision: InspectionDecision
    reviewerNote: str | None = Field(default=None, max_length=500)
    reviewedBy: str = Field(min_length=2, max_length=80)

    @model_validator(mode="after")
    def validateReviewerDecision(self):
        if self.reviewerDecision not in (InspectionDecision.passed, InspectionDecision.failed):
            raise ValueError("Reviewers resolve an inspection to PASS or FAIL")
        return self


class DecisionTrendBucket(BaseModel):
    bucketStart: datetime
    lineId: str
    counts: dict[str, int]


class DecisionTrendResponse(BaseModel):
    processingMode: ProcessingMode
    buckets: list[DecisionTrendBucket]
