"""Presence-based inspection sessions for a stationary camera.

One physical part placed in the station produces one inspection:
- a session opens after `presenceFrames` consecutive frames show a fully framed part,
- the sharpest of the first `candidateFrames` frames is inspected once,
- the session closes after `absenceFrames` consecutive frames without a part.
Frame numbers identify frames; inspection identifiers identify sessions. A part that stays in view
produces no further inspections; removing and re-placing it produces a new one (re-entry is counted again).
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
import numpy as np


@dataclass(frozen=True)
class InspectAction:
    inspectionId: str
    frameNumber: int
    capturedAt: datetime
    frame: np.ndarray


@dataclass
class StationSessionTracker:
    stationId: str
    presenceFrames: int = 5
    absenceFrames: int = 10
    candidateFrames: int = 5
    presentStreak: int = 0
    absentStreak: int = 0
    isOccupied: bool = False
    isInspected: bool = False
    sessionCount: int = 0
    sessionId: str | None = None
    candidates: list[tuple[float, int, datetime, np.ndarray]] = field(default_factory=list)

    def update(self, frameNumber: int, isPresent: bool, sharpness: float, frame: np.ndarray, capturedAt: datetime | None = None) -> InspectAction | None:
        # AI Assisted Logic
        capturedAt = capturedAt or datetime.now(timezone.utc)
        if isPresent:
            self.presentStreak += 1
            self.absentStreak = 0
        else:
            self.absentStreak += 1
            self.presentStreak = 0
        if not self.isOccupied and self.presentStreak >= self.presenceFrames:
            self.openSession(capturedAt)
        if not self.isOccupied:
            return None
        if isPresent and not self.isInspected:
            self.candidates.append((sharpness, frameNumber, capturedAt, frame))
            if len(self.candidates) >= self.candidateFrames:
                return self.emitInspection()
        if self.absentStreak >= self.absenceFrames:
            action = self.emitInspection() if not self.isInspected and self.candidates else None
            self.closeSession()
            return action
        return None

    def openSession(self, capturedAt: datetime) -> None:
        self.sessionCount += 1
        self.isOccupied = True
        self.isInspected = False
        self.candidates = []
        self.sessionId = f"{self.stationId}-{capturedAt.astimezone(timezone.utc):%Y%m%dT%H%M%S%f}-{self.sessionCount:05d}"

    def emitInspection(self) -> InspectAction:
        sharpness, frameNumber, capturedAt, frame = max(self.candidates, key=lambda candidate: candidate[0])
        self.isInspected = True
        self.candidates = []
        assert self.sessionId is not None
        return InspectAction(inspectionId=self.sessionId, frameNumber=frameNumber, capturedAt=capturedAt, frame=frame)

    def closeSession(self) -> None:
        self.isOccupied = False
        self.isInspected = False
        self.candidates = []
        self.sessionId = None
