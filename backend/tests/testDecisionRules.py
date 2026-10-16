import math
import pytest
from motionQa.defectEnums import DefectType, InspectionDecision, ReviewStatus
from motionQa.edge.inferenceEngine import decideFromDetections
from motionQa.inspection.inspectionPipeline import decideFromAnomalyScore, reviewStatusFor
from motionQa.inspectionSchemas import BoundingBox


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.5, InspectionDecision.passed),
        (1.0, InspectionDecision.review),
        (1.49, InspectionDecision.review),
        (1.5, InspectionDecision.failed),
        (9.0, InspectionDecision.failed),
        (math.nan, InspectionDecision.error),
        (math.inf, InspectionDecision.error),
    ],
)
def testAnomalyScoreDecisionBands(score, expected):
    # AI Assisted Logic
    decision, _ = decideFromAnomalyScore(score, passBelow=1.0, failAtOrAbove=1.5)
    assert decision == expected


def testSingleCutHasNoReviewBand():
    assert decideFromAnomalyScore(0.999, 1.0, 1.0)[0] == InspectionDecision.passed
    assert decideFromAnomalyScore(1.0, 1.0, 1.0)[0] == InspectionDecision.failed


def testReviewStatusRequiresHumanForFailAndReview():
    assert reviewStatusFor(InspectionDecision.review) == ReviewStatus.pending
    assert reviewStatusFor(InspectionDecision.failed) == ReviewStatus.pending
    assert reviewStatusFor(InspectionDecision.passed) == ReviewStatus.notRequired


def testDetectorWithoutDetectionsNeverPassesUnvalidated():
    decision, reasonCode = decideFromDetections([], failConfidence=0.5, isPartPresent=True, isDetectorValidated=False)
    assert decision == InspectionDecision.review
    assert reasonCode == "DETECTOR_NOT_VALIDATED"


def testDetectorWithoutVerifiedPartIsNoPart():
    decision, _ = decideFromDetections([], failConfidence=0.5, isPartPresent=False, isDetectorValidated=True)
    assert decision == InspectionDecision.noPart


def testDetectorConfidenceBands():
    box = BoundingBox(xMin=1, yMin=1, xMax=5, yMax=5)
    assert decideFromDetections([(DefectType.scratch, 0.7, box)], 0.5, True, True)[0] == InspectionDecision.failed
    assert decideFromDetections([(DefectType.scratch, 0.3, box)], 0.5, True, True)[0] == InspectionDecision.review
    assert decideFromDetections([], 0.5, True, True)[0] == InspectionDecision.passed


def testIdentityBandsSeparatePresenceFromRecognition():
    from motionQa.inspection.inspectionPipeline import classifyIdentity

    assert classifyIdentity(0.05, acceptMax=0.0844, noPartMin=0.2167) == "RECOGNIZED"
    assert classifyIdentity(0.155, acceptMax=0.0844, noPartMin=0.2167) == "UNCERTAIN"
    assert classifyIdentity(0.30, acceptMax=0.0844, noPartMin=0.2167) == "NOT_RECOGNIZED"
    assert classifyIdentity(float("nan"), acceptMax=0.0844, noPartMin=0.2167) == "INVALID"


def testPolicyOneProfilesKeepTwoWayIdentity():
    from motionQa.inspection.inspectionPipeline import classifyIdentity

    assert classifyIdentity(0.155, acceptMax=0.1506, noPartMin=None) == "NOT_RECOGNIZED"
    assert classifyIdentity(0.10, acceptMax=0.1506, noPartMin=None) == "RECOGNIZED"
