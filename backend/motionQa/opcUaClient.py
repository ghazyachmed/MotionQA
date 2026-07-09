import asyncio
from .configSettings import AppSettings, getSettings
from .defectEnums import IntegrationStatus
from .defectSchemas import IntegrationResult, OpcUaStatusPayload


class OpcUaStatusClient:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or getSettings()

    async def publishStatus(self, payload: OpcUaStatusPayload) -> IntegrationResult:
        # AI Assisted Logic
        if not self.settings.opcUaEndpoint:
            return IntegrationResult(
                status=IntegrationStatus.configurationRequired,
                target="OPC_UA_FACTORY",
                detail="MOTIONQA_OPC_UA_ENDPOINT is required",
            )
        try:
            from opcua import Client
        except ImportError:
            return IntegrationResult(status=IntegrationStatus.failed, target="OPC_UA_FACTORY", detail="opcua package missing")
        await asyncio.to_thread(self.publishStatusSync, payload, Client)
        return IntegrationResult(status=IntegrationStatus.synchronized, target="OPC_UA_FACTORY", detail="Status published")

    def publishStatusSync(self, payload: OpcUaStatusPayload, clientClass) -> None:
        client = clientClass(self.settings.opcUaEndpoint)
        client.connect()
        try:
            node = client.get_node("ns=2;s=MotionQA.LastInspection")
            node.set_value(payload.model_dump_json())
        finally:
            client.disconnect()
