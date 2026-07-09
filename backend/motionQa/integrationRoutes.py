from fastapi import APIRouter, Depends
from .defectSchemas import IntegrationResult, MesUpdatePayload, OpcUaStatusPayload
from .dependencyContainer import getMesClient, getOpcUaClient
from .mesClient import AhmMesClient
from .opcUaClient import OpcUaStatusClient


router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


@router.post("/mes", response_model=IntegrationResult)
async def syncToAhmMes(payload: MesUpdatePayload, client: AhmMesClient = Depends(getMesClient)) -> IntegrationResult:
    # AI Assisted Logic
    return await client.syncInspection(payload)


@router.post("/opcua/status", response_model=IntegrationResult)
async def publishOpcUaStatus(payload: OpcUaStatusPayload, client: OpcUaStatusClient = Depends(getOpcUaClient)) -> IntegrationResult:
    return await client.publishStatus(payload)

