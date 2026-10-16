import json
from pathlib import Path
from pydantic import BaseModel, Field
from .captureQuality import CaptureThresholds


class ArtifactReference(BaseModel):
    file: str
    sha256: str
    source: str
    license: str


class PreprocessingSpec(BaseModel):
    inputSize: int = Field(ge=64, le=1024)
    colorOrder: str = "RGB"
    scale: str = "pixel / 255"
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    crop: str = "square crop centred on the located part, 6% margin, border replicated"
    scoringMask: str = Field(default="dilated", pattern="^(hull|dilated|full)$")


class DecisionThresholds(BaseModel):
    """Thresholds on the raw anomaly score (nearest-neighbour feature distance, not a probability).

    Identity: distances up to `identityMaxDistance` are treated as the validated part. With
    `identityNoPartMinDistance` set (decision policy 2), distances at or above it are `NO_PART` and the gap between
    the two is `REVIEW` (an object is present but validation never covered that appearance). Without it
    (policy 1 profiles), everything above `identityMaxDistance` is `NO_PART`.
    """

    passBelow: float
    failAtOrAbove: float
    identityMaxDistance: float
    identityNoPartMinDistance: float | None = None
    regionThreshold: float
    missedDefectTarget: float
    falseRejectTarget: float


class InspectionProfile(BaseModel):
    profileId: str
    version: str
    task: str
    domainNote: str
    backbone: ArtifactReference
    featureModel: ArtifactReference
    memoryBank: ArtifactReference
    outputNames: tuple[str, ...]
    preprocessing: PreprocessingSpec
    capture: dict[str, float]
    decision: DecisionThresholds
    dataset: dict[str, object]
    decisionPolicy: int = 1
    validationSummary: dict[str, object] = Field(default_factory=dict)

    @property
    def captureThresholds(self) -> CaptureThresholds:
        return CaptureThresholds(**self.capture)

    @property
    def modelId(self) -> str:
        return self.profileId

    def resolve(self, profilePath: Path, artifact: ArtifactReference) -> Path:
        candidate = Path(artifact.file)
        return candidate if candidate.is_absolute() else profilePath.parent / candidate


def loadProfile(profilePath: Path) -> InspectionProfile:
    return InspectionProfile.model_validate(json.loads(profilePath.read_text()))
