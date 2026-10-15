import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from ..configSettings import getSettings
from ..dependencyContainer import createEvidenceStore
from ..inspection.captureQuality import locatePart, measureCapture
from ..inspection.inspectionPipeline import InspectionPipeline, InspectionRequest
from ..inspection.sessionTracker import InspectAction, StationSessionTracker
from ..inspectionSchemas import InspectionResult
from ..redisGateway import RedisGateway
from .rtspCapture import RtspFrameSource

logger = logging.getLogger("motionQa.edge")


class EdgeProcessor:
    """Continuous RTSP capture with presence-based sessions: one published inspection per part placement."""

    def __init__(self, frameSource: RtspFrameSource, pipeline: InspectionPipeline, redisGateway: RedisGateway, tracker: StationSessionTracker):
        # AI Assisted Logic
        self.frameSource = frameSource
        self.pipeline = pipeline
        self.redisGateway = redisGateway
        self.tracker = tracker
        self.settings = getSettings()

    async def run(self) -> None:
        await self.frameSource.open()
        try:
            while True:
                framePacket = await self.frameSource.readFrame()
                if framePacket.frameNumber % self.settings.frameStride != 0:
                    continue
                location = await asyncio.to_thread(locatePart, framePacket.frame)
                metrics = await asyncio.to_thread(measureCapture, framePacket.frame, location)
                isPresent = location.found and not location.touchesBorder
                action = self.tracker.update(framePacket.frameNumber, isPresent, metrics.edgeSharpness, framePacket.frame, datetime.now(timezone.utc))
                if action is not None:
                    await self.inspectAndPublish(action)
        finally:
            await self.frameSource.close()
            await self.redisGateway.close()

    async def inspectAndPublish(self, action: InspectAction) -> InspectionResult:
        result = await self.pipeline.inspect(
            action.frame,
            InspectionRequest(inspectionId=action.inspectionId, lineId=self.settings.lineId, stationId=self.settings.stationId, capturedAt=action.capturedAt, frameNumber=action.frameNumber),
        )
        for attempt in range(3):
            try:
                await self.redisGateway.publishLiveEvent(result)
                break
            except Exception as error:
                logger.warning("publish attempt %d failed for %s: %s", attempt + 1, result.inspectionId, error)
                await asyncio.sleep(0.5 * (attempt + 1))
        else:
            logger.error("inspection %s not published after retries", result.inspectionId)
        return result


async def mainAsync() -> None:
    settings = getSettings()
    if not settings.rtspUrl:
        raise RuntimeError("MOTIONQA_RTSP_URL is required")
    pipeline = InspectionPipeline(Path(settings.inspectionProfilePath), createEvidenceStore(settings), timeoutSeconds=settings.inferenceTimeoutSeconds)
    if not pipeline.isReady:
        logger.error("inspection model unavailable; every inspection will be ERROR: %s", pipeline.loadError)
    tracker = StationSessionTracker(settings.stationId, presenceFrames=settings.stationPresenceFrames, absenceFrames=settings.stationAbsenceFrames)
    await EdgeProcessor(RtspFrameSource(settings.rtspUrl), pipeline, RedisGateway(settings), tracker).run()


if __name__ == "__main__":
    asyncio.run(mainAsync())
