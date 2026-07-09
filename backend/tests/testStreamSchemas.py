from decimal import Decimal
import pytest
from pydantic import ValidationError
from motionQa.defectEnums import DefectType, InspectionStatus
from motionQa.streamSchemas import LiveQcEvent


def testLiveQcEventRejectsFailedWithoutDefect():
    # AI Assisted Logic
    with pytest.raises(ValidationError):
        LiveQcEvent(
            eventId="evt-12345678",
            componentCode="LINE_KARAWANG_01-0001",
            lineId="LINE_KARAWANG_01",
            defectFound=DefectType.none,
            confidenceScore=Decimal("0.000"),
            status=InspectionStatus.failed,
            frameNumber=1,
            fps=30.0,
        )


def testLiveQcEventConvertsToDefectLog():
    event = LiveQcEvent(
        eventId="evt-12345678",
        componentCode="LINE_KARAWANG_01-0001",
        lineId="LINE_KARAWANG_01",
        defectFound=DefectType.none,
        confidenceScore=Decimal("0.000"),
        status=InspectionStatus.passed,
        frameNumber=1,
        fps=30.0,
    )

    payload = event.toDefectLogCreate()
    assert payload.componentCode == "LINE_KARAWANG_01-0001"
    assert payload.status == InspectionStatus.passed.value

