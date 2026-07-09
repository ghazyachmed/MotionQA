import httpx
from .configSettings import AppSettings, getSettings
from .defectEnums import IntegrationStatus
from .defectSchemas import IntegrationResult, MesUpdatePayload


class AhmMesClient:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or getSettings()

    async def syncInspection(self, payload: MesUpdatePayload) -> IntegrationResult:
        # AI Assisted Logic
        if not self.settings.ahmMesBaseUrl:
            return IntegrationResult(
                status=IntegrationStatus.configurationRequired,
                target="SAP_MES_AHM",
                detail="MOTIONQA_AHM_MES_BASE_URL is required",
            )
        headers = {}
        if self.settings.ahmMesApiKey:
            headers["Authorization"] = f"Bearer {self.settings.ahmMesApiKey}"
        async with httpx.AsyncClient(timeout=self.settings.requestTimeoutSeconds) as client:
            response = await client.post(
                f"{self.settings.ahmMesBaseUrl.rstrip('/')}/quality/inspection",
                json=payload.model_dump(mode="json"),
                headers=headers,
            )
        if response.is_success:
            return IntegrationResult(status=IntegrationStatus.synchronized, target="SAP_MES_AHM", detail="Inspection synced")
        return IntegrationResult(status=IntegrationStatus.failed, target="SAP_MES_AHM", detail=response.text[:240])

