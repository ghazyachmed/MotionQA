import asyncio
import time
from dataclasses import dataclass
import numpy as np


@dataclass
class FramePacket:
    frame: np.ndarray
    frameNumber: int
    fps: float


class RtspFrameSource:
    def __init__(self, rtspUrl: str):
        # AI Assisted Logic
        if not rtspUrl.startswith("rtsp://") and not rtspUrl.startswith("rtsps://"):
            raise ValueError("RTSP URL required")
        self.rtspUrl = rtspUrl
        self.capture = None
        self.frameNumber = 0
        self.lastTime = time.perf_counter()
        self.fps = 0.0

    async def open(self) -> None:
        await asyncio.to_thread(self.openSync)

    def openSync(self) -> None:
        import cv2

        self.capture = cv2.VideoCapture(self.rtspUrl, cv2.CAP_FFMPEG)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 2)
        if not self.capture.isOpened():
            raise RuntimeError("Unable to open RTSP stream")

    async def readFrame(self) -> FramePacket:
        if self.capture is None:
            await self.open()
        success, frame = await asyncio.to_thread(self.capture.read)
        if not success or frame is None:
            await self.reconnect()
            success, frame = await asyncio.to_thread(self.capture.read)
        if not success or frame is None:
            raise RuntimeError("Unable to read RTSP frame")
        self.frameNumber += 1
        currentTime = time.perf_counter()
        elapsedTime = max(currentTime - self.lastTime, 1e-6)
        self.lastTime = currentTime
        self.fps = (self.fps * 0.9) + ((1.0 / elapsedTime) * 0.1)
        return FramePacket(frame=frame, frameNumber=self.frameNumber, fps=self.fps)

    async def reconnect(self) -> None:
        await self.close()
        await asyncio.sleep(0.5)
        await self.open()

    async def close(self) -> None:
        if self.capture is not None:
            await asyncio.to_thread(self.capture.release)
            self.capture = None

