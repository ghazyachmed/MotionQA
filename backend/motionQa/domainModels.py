from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, Enum as SqlEnum, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .databaseSession import Base
from .defectEnums import DefectType, InspectionDecision, ProcessingMode, ReviewStatus


def enumValues(enumClass: type) -> list[str]:
    return [item.value for item in enumClass]


def utcNow() -> datetime:
    return datetime.now(timezone.utc)


decisionEnumType = SqlEnum(InspectionDecision, values_callable=enumValues, name="inspection_decision")


class InspectionRecord(Base):
    """One physical inspection. `decision` is the immutable machine decision; review fields hold the human outcome."""

    __tablename__ = "inspection_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inspectionId: Mapped[str] = mapped_column("inspection_id", String(80), nullable=False, unique=True)
    componentId: Mapped[str | None] = mapped_column("component_id", String(80), nullable=True)
    lineId: Mapped[str] = mapped_column("line_id", String(40), nullable=False)
    stationId: Mapped[str] = mapped_column("station_id", String(40), nullable=False)
    capturedAt: Mapped[datetime] = mapped_column("captured_at", DateTime(timezone=True), nullable=False)
    processedAt: Mapped[datetime] = mapped_column("processed_at", DateTime(timezone=True), default=utcNow, nullable=False)
    decision: Mapped[InspectionDecision] = mapped_column(decisionEnumType, nullable=False)
    reasonCode: Mapped[str] = mapped_column("reason_code", String(60), nullable=False)
    reasonDetail: Mapped[str] = mapped_column("reason_detail", Text, nullable=False, default="")
    processingMode: Mapped[ProcessingMode] = mapped_column("processing_mode", SqlEnum(ProcessingMode, values_callable=enumValues, name="processing_mode"), nullable=False)
    modelId: Mapped[str | None] = mapped_column("model_id", String(120), nullable=True)
    modelVersion: Mapped[str | None] = mapped_column("model_version", String(60), nullable=True)
    defectFound: Mapped[DefectType] = mapped_column("defect_found", SqlEnum(DefectType, values_callable=enumValues, name="defect_type"), nullable=False, default=DefectType.none)
    scores: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    thresholds: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    regions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    partBox: Mapped[dict | None] = mapped_column("part_box", JSON, nullable=True)
    evidence: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    latency: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    imageWidth: Mapped[int] = mapped_column("image_width", Integer, nullable=False, default=0)
    imageHeight: Mapped[int] = mapped_column("image_height", Integer, nullable=False, default=0)
    frameNumber: Mapped[int | None] = mapped_column("frame_number", Integer, nullable=True)
    reviewStatus: Mapped[ReviewStatus] = mapped_column("review_status", SqlEnum(ReviewStatus, values_callable=enumValues, name="review_status"), nullable=False, default=ReviewStatus.notRequired)
    reviewerDecision: Mapped[InspectionDecision | None] = mapped_column("reviewer_decision", decisionEnumType, nullable=True)
    reviewerNote: Mapped[str | None] = mapped_column("reviewer_note", Text, nullable=True)
    reviewedBy: Mapped[str | None] = mapped_column("reviewed_by", String(80), nullable=True)
    reviewedAt: Mapped[datetime | None] = mapped_column("reviewed_at", DateTime(timezone=True), nullable=True)


Index("idx_inspection_records_captured_at", InspectionRecord.capturedAt)
Index("idx_inspection_records_decision", InspectionRecord.decision)
Index("idx_inspection_records_line_id", InspectionRecord.lineId)
Index("idx_inspection_records_mode", InspectionRecord.processingMode)
Index("idx_inspection_records_review", InspectionRecord.reviewStatus)


class InspectionSessionRecord(Base):
    """One physical part at one station: up to `maxAttempts` captures, then a conclusive decision or escalation."""

    __tablename__ = "inspection_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sessionId: Mapped[str] = mapped_column("session_id", String(80), nullable=False, unique=True)
    componentId: Mapped[str | None] = mapped_column("component_id", String(80), nullable=True)
    lineId: Mapped[str] = mapped_column("line_id", String(40), nullable=False)
    stationId: Mapped[str] = mapped_column("station_id", String(40), nullable=False)
    maxAttempts: Mapped[int] = mapped_column("max_attempts", Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    finalDecision: Mapped[str | None] = mapped_column("final_decision", String(20), nullable=True)
    finalReasonCode: Mapped[str | None] = mapped_column("final_reason_code", String(60), nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime(timezone=True), default=utcNow, nullable=False)
    closedAt: Mapped[datetime | None] = mapped_column("closed_at", DateTime(timezone=True), nullable=True)


class SessionAttemptRecord(Base):
    __tablename__ = "inspection_session_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sessionId: Mapped[str] = mapped_column("session_id", String(80), nullable=False)
    attemptNumber: Mapped[int] = mapped_column("attempt_number", Integer, nullable=False)
    inspectionId: Mapped[str] = mapped_column("inspection_id", String(80), nullable=False, unique=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime(timezone=True), default=utcNow, nullable=False)


Index("idx_session_attempts_session", SessionAttemptRecord.sessionId, SessionAttemptRecord.attemptNumber, unique=True)
