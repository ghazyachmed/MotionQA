import numpy as np
from motionQa.inspection.sessionTracker import StationSessionTracker

frame = np.zeros((4, 4, 3), np.uint8)


def runSequence(tracker: StationSessionTracker, presence: list[bool]) -> list:
    actions = []
    for frameNumber, isPresent in enumerate(presence, start=1):
        action = tracker.update(frameNumber, isPresent, sharpness=float(frameNumber % 7), frame=frame)
        if action:
            actions.append(action)
    return actions


def testStationaryPartProducesOneInspection():
    # AI Assisted Logic
    tracker = StationSessionTracker("ST1", presenceFrames=3, absenceFrames=4, candidateFrames=3)
    actions = runSequence(tracker, [False] * 5 + [True] * 200 + [False] * 10)
    assert len(actions) == 1


def testReentryProducesNewInspectionWithNewIdentifier():
    tracker = StationSessionTracker("ST1", presenceFrames=3, absenceFrames=4, candidateFrames=3)
    actions = runSequence(tracker, [True] * 20 + [False] * 6 + [True] * 20 + [False] * 6)
    assert len(actions) == 2
    assert actions[0].inspectionId != actions[1].inspectionId


def testShortOcclusionDoesNotSplitSession():
    tracker = StationSessionTracker("ST1", presenceFrames=3, absenceFrames=4, candidateFrames=3)
    actions = runSequence(tracker, [True] * 20 + [False] * 2 + [True] * 20 + [False] * 6)
    assert len(actions) == 1


def testFlickerBelowPresenceThresholdIsIgnored():
    tracker = StationSessionTracker("ST1", presenceFrames=3, absenceFrames=4, candidateFrames=3)
    assert runSequence(tracker, [True, True, False] * 10) == []


def testInspectionUsesSharpestCandidateAndFrameIdIsSeparate():
    tracker = StationSessionTracker("ST1", presenceFrames=2, absenceFrames=3, candidateFrames=4)
    actions = runSequence(tracker, [True] * 10)
    assert len(actions) == 1
    assert actions[0].frameNumber == 5
    assert actions[0].inspectionId.startswith("ST1-")
    assert actions[0].inspectionId.endswith("-00001")


def testPartLeavingBeforeEnoughCandidatesIsStillInspected():
    tracker = StationSessionTracker("ST1", presenceFrames=2, absenceFrames=2, candidateFrames=10)
    actions = runSequence(tracker, [True] * 4 + [False] * 3)
    assert len(actions) == 1
