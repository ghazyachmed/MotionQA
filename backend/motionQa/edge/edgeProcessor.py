import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from ..configSettings import getSettings
from ..redisGateway import RedisGateway
from ..streamSchemas import LiveQcEvent
from .inferenceEngine import OnnxYoloInferenceEngine
from .rtspCapture import RtspFrameSource


class EdgeProcessor:
    def __init__(self, frameSource: RtspFrameSource, inferenceEngine: OnnxYoloInferenceEngine, redisGateway: RedisGateway):
        # AI Assisted Logic
        self.frameSource = frameSource
        self.inferenceEngine = inferenceEngine
        self.redisGateway = redisGateway
        self.settings = getSettings()

    async def run(self) -> None:
        await self.frameSource.open()
        try:
            while True:
                framePacket = await self.frameSource.readFrame()
                if framePacket.frameNumber % self.settings.frameStride != 0:
                    continue
                detection = await self.inferenceEngine.predict(framePacket.frame)
                event = LiveQcEvent(
                    eventId=str(uuid4()),
                    componentCode=self.createComponentCode(framePacket.frameNumber),
                    lineId=self.settings.lineId,
                    defectFound=detection.defectFound,
                    confidenceScore=detection.confidenceScore,
                    status=detection.status,
                    detectedAt=datetime.now(timezone.utc),
                    boundingBox=detection.boundingBox,
                    frameNumber=framePacket.frameNumber,
                    frameWidth=int(framePacket.frame.shape[1]),
                    frameHeight=int(framePacket.frame.shape[0]),
                    fps=round(framePacket.fps, 2),
                )
                await self.redisGateway.publishLiveEvent(event)
        finally:
            await self.frameSource.close()
            await self.redisGateway.close()

    def createComponentCode(self, frameNumber: int) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        return f"{self.settings.lineId}-{timestamp}-{frameNumber}"


async def mainAsync() -> None:
    settings = getSettings()
    if not settings.rtspUrl:
        raise RuntimeError("MOTIONQA_RTSP_URL is required")
    frameSource = RtspFrameSource(settings.rtspUrl)
    inferenceEngine = OnnxYoloInferenceEngine(
        modelPath=settings.modelPath,
        inputName=settings.modelInputName,
        confidenceThreshold=settings.modelConfidenceThreshold,
        iouThreshold=settings.modelIouThreshold,
    )
    redisGateway = RedisGateway(settings)
    await EdgeProcessor(frameSource, inferenceEngine, redisGateway).run()


if __name__ == "__main__":
    asyncio.run(mainAsync())
