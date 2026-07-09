from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import DateTime, Enum as SqlEnum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .databaseSession import Base
from .defectEnums import DefectType, InspectionStatus


def enumValues(enumClass: type) -> list[str]:
    return [item.value for item in enumClass]


class DefectLog(Base):
    __tablename__ = "components_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    componentCode: Mapped[str] = mapped_column("component_code", String(50), nullable=False, unique=True)
    detectedAt: Mapped[datetime] = mapped_column("timestamp", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    defectFound: Mapped[DefectType] = mapped_column("defect_found", SqlEnum(DefectType, values_callable=enumValues, name="defect_type"), default=DefectType.none, nullable=False)
    confidenceScore: Mapped[Decimal] = mapped_column("confidence_score", Numeric(4, 3), nullable=False)
    status: Mapped[InspectionStatus] = mapped_column(SqlEnum(InspectionStatus, values_callable=enumValues, name="inspection_status"), nullable=False)
    imageSnapshotUrl: Mapped[str | None] = mapped_column("image_snapshot_url", Text, nullable=True)
    lineId: Mapped[str] = mapped_column("line_id", String(20), nullable=False)


Index("idx_components_log_timestamp", DefectLog.detectedAt)
Index("idx_components_log_status", DefectLog.status)
Index("idx_components_log_line_id", DefectLog.lineId)

