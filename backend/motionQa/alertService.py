from email.message import EmailMessage
import aiosmtplib
import httpx
from .configSettings import AppSettings, getSettings
from .defectEnums import InspectionDecision, IntegrationStatus, ProcessingMode
from .defectSchemas import IntegrationResult
from .inspectionSchemas import InspectionResult


class SupervisorAlertService:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or getSettings()

    async def sendDefectAlert(self, event: InspectionResult) -> list[IntegrationResult]:
        # AI Assisted Logic
        if event.processingMode != ProcessingMode.realInference.value or event.decision not in (InspectionDecision.failed.value, InspectionDecision.error.value):
            return []
        results = []
        results.append(await self.sendWhatsappAlert(event))
        results.append(await self.sendEmailAlert(event))
        return results

    async def sendWhatsappAlert(self, event: InspectionResult) -> IntegrationResult:
        if not self.settings.whatsappWebhookUrl:
            return IntegrationResult(status=IntegrationStatus.configurationRequired, target="WHATSAPP_ALERT", detail="Webhook is required")
        async with httpx.AsyncClient(timeout=self.settings.requestTimeoutSeconds) as client:
            response = await client.post(self.settings.whatsappWebhookUrl, json=self.createAlertPayload(event))
        if response.is_success:
            return IntegrationResult(status=IntegrationStatus.synchronized, target="WHATSAPP_ALERT", detail="Alert sent")
        return IntegrationResult(status=IntegrationStatus.failed, target="WHATSAPP_ALERT", detail=response.text[:240])

    async def sendEmailAlert(self, event: InspectionResult) -> IntegrationResult:
        requiredValues = [self.settings.smtpHost, self.settings.emailFrom, self.settings.emailTo]
        if not all(requiredValues):
            return IntegrationResult(status=IntegrationStatus.configurationRequired, target="EMAIL_ALERT", detail="SMTP settings required")
        message = EmailMessage()
        message["From"] = self.settings.emailFrom or ""
        message["To"] = self.settings.emailTo or ""
        message["Subject"] = f"MotionQA {event.decision} {event.lineId}"
        message.set_content(f"Inspection {event.inspectionId} (component {event.componentId or 'unassigned'}): {event.decision} / {event.reasonCode}. Anomaly score {event.scores.get('anomalyScore')}.")
        await aiosmtplib.send(
            message,
            hostname=self.settings.smtpHost,
            port=self.settings.smtpPort,
            username=self.settings.smtpUsername,
            password=self.settings.smtpPassword,
            start_tls=True,
            timeout=self.settings.requestTimeoutSeconds,
        )
        return IntegrationResult(status=IntegrationStatus.synchronized, target="EMAIL_ALERT", detail="Alert sent")

    def createAlertPayload(self, event: InspectionResult) -> dict[str, object]:
        return {
            "inspectionId": event.inspectionId,
            "componentId": event.componentId,
            "lineId": event.lineId,
            "decision": event.decision,
            "reasonCode": event.reasonCode,
            "anomalyScore": event.scores.get("anomalyScore"),
            "capturedAt": event.capturedAt.isoformat(),
        }

