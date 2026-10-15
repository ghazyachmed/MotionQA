from pydantic import BaseModel, ConfigDict, Field
from .defectEnums import InspectionDecision, IntegrationStatus


class MesUpdatePayload(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    inspectionId: str = Field(min_length=3, max_length=80)
    componentId: str | None = Field(default=None, max_length=80)
    decision: InspectionDecision
    reasonCode: str


class IntegrationResult(BaseModel):
    status: IntegrationStatus
    target: str
    detail: str


class OpcUaStatusPayload(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    inspectionId: str = Field(min_length=3, max_length=80)
    componentId: str | None = Field(default=None, max_length=80)
    lineId: str = Field(min_length=3, max_length=40)
    decision: InspectionDecision
    anomalyScore: float | None = None
