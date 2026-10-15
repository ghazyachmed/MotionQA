import numpy as np
import pytest
from motionQa.inspection.captureQuality import CaptureThresholds, cropPartSquare, evaluateCaptureGates, locatePart, measureCapture
from motionQa.inspection.imageInput import InvalidImageError, decodeImage
from syntheticFixtures import createPartImage, encodeJpeg


@pytest.fixture
def thresholds() -> CaptureThresholds:
    # AI Assisted Logic
    metrics = measureCapture(createPartImage(), locatePart(createPartImage()))
    return CaptureThresholds(
        minFrameMeanLuminance=0.05,
        maxFrameMeanLuminance=0.9,
        maxFrameDarkFraction=0.5,
        maxFrameBrightFraction=0.3,
        minPartContrast=metrics.partContrast * 0.5,
        minPartAreaFraction=metrics.partAreaFraction * 0.7,
        maxPartAreaFraction=min(0.95, metrics.partAreaFraction * 1.3),
        minBackgroundLuminance=metrics.backgroundMedianLuminance * 0.6,
        maxBackgroundLuminance=0.9,
        minEdgeSharpness=metrics.edgeSharpness * 0.6,
    )


def testLocatesSyntheticPart():
    location = locatePart(createPartImage())
    assert location.found
    assert not location.touchesBorder
    assert 0.15 < location.areaFraction < 0.4


def testCleanCapturePassesGates(thresholds):
    image = createPartImage(seed=3)
    assert evaluateCaptureGates(measureCapture(image, locatePart(image)), thresholds).decision is None


def testEmptySceneIsNoPart(thresholds):
    empty = np.full((480, 640, 3), 30, dtype=np.uint8)
    gate = evaluateCaptureGates(measureCapture(empty, locatePart(empty)), thresholds)
    assert gate.decision == "NO_PART"


def testUnderexposedIsRetake(thresholds):
    dark = (createPartImage().astype(np.float32) * 0.1).astype(np.uint8)
    gate = evaluateCaptureGates(measureCapture(dark, locatePart(dark)), thresholds)
    assert gate.decision == "RETAKE"
    assert gate.reasonCode == "UNDEREXPOSED"


def testBlurredIsRetake(thresholds):
    import cv2 as cv

    blurred = cv.GaussianBlur(createPartImage(), (0, 0), 6)
    gate = evaluateCaptureGates(measureCapture(blurred, locatePart(blurred)), thresholds)
    assert gate.decision == "RETAKE"
    assert gate.reasonCode == "BLURRED"


def testLocalBrightDefectIsNotMistakenForOverexposure(thresholds):
    import cv2 as cv

    image = createPartImage(seed=5)
    cv.circle(image, (290, 250), 45, (255, 255, 255), cv.FILLED)
    gate = evaluateCaptureGates(measureCapture(image, locatePart(image)), thresholds)
    assert gate.decision is None, gate.reasonDetail


def testLocalSmoothDefectIsNotMistakenForBlur(thresholds):
    import cv2 as cv

    image = createPartImage(seed=6)
    region = image[180:300, 200:330]
    image[180:300, 200:330] = cv.GaussianBlur(region, (0, 0), 8)
    gate = evaluateCaptureGates(measureCapture(image, locatePart(image)), thresholds)
    assert gate.decision is None, gate.reasonDetail


def testCutOffPartIsRetake(thresholds):
    shifted = np.roll(createPartImage(), 300, axis=1)
    shifted[:, :300] = 30
    gate = evaluateCaptureGates(measureCapture(shifted, locatePart(shifted)), thresholds)
    assert gate.decision == "RETAKE"
    assert gate.reasonCode == "PART_CUT_OFF"


def testSquareCropIsPaddedAndMasked():
    image = createPartImage()
    crop, cropMask, (x0, y0, side) = cropPartSquare(image, locatePart(image))
    assert crop.shape[:2] == (side, side) == cropMask.shape
    assert cropMask.max() == 255


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        (b"", "EMPTY_UPLOAD"),
        (b"not an image at all", "UNSUPPORTED_MEDIA_TYPE"),
        (b"\xff\xd8\xff" + b"\x00" * 64, "UNDECODABLE_IMAGE"),
    ],
)
def testInvalidUploadsAreRejected(payload, code):
    with pytest.raises(InvalidImageError) as error:
        decodeImage(payload)
    assert error.value.code == code


def testOversizedAndTinyUploadsAreRejected():
    with pytest.raises(InvalidImageError) as tooLarge:
        decodeImage(encodeJpeg(createPartImage()), maxBytes=1024)
    assert tooLarge.value.code == "UPLOAD_TOO_LARGE"
    with pytest.raises(InvalidImageError) as tooSmall:
        decodeImage(encodeJpeg(np.zeros((64, 64, 3), np.uint8)))
    assert tooSmall.value.code == "IMAGE_TOO_SMALL"
