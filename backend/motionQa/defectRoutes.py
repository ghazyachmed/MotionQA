from fastapi import APIRouter, Depends, HTTPException, Query, status
from .defectSchemas import DefectLogCreate, DefectLogRead, DefectTrendResponse
from .defectService import DefectService, DuplicateComponentError
from .dependencyContainer import getDefectService


router = APIRouter(prefix="/api/v1/defects", tags=["defects"])


@router.post("", response_model=DefectLogRead, status_code=status.HTTP_201_CREATED)
async def createDefectLog(payload: DefectLogCreate, service: DefectService = Depends(getDefectService)) -> DefectLogRead:
    # AI Assisted Logic
    try:
        return await service.recordInspection(payload)
    except DuplicateComponentError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="componentCode already logged") from error


@router.get("", response_model=list[DefectLogRead])
async def listDefectLogs(
    limit: int = Query(default=50, ge=1, le=500),
    lineId: str | None = Query(default=None, min_length=3, max_length=20),
    service: DefectService = Depends(getDefectService),
) -> list[DefectLogRead]:
    return await service.listRecentInspections(limit=limit, lineId=lineId)


@router.get("/trends", response_model=DefectTrendResponse)
async def getDefectTrends(
    minutes: int = Query(default=60, ge=1, le=1440),
    lineId: str | None = Query(default=None, min_length=3, max_length=20),
    service: DefectService = Depends(getDefectService),
) -> DefectTrendResponse:
    return await service.getTrendAnalytics(minutes=minutes, lineId=lineId)

