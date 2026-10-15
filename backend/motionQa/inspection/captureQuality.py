from dataclasses import asdict, dataclass
import numpy as np

analysisLongSide = 512
borderBandFraction = 0.04
darkClipLevel = 8
brightClipLevel = 247
silhouetteBandFraction = 0.01
backgroundGapFraction = 0.06
edgeSharpnessPercentile = 90


@dataclass(frozen=True)
class PartLocation:
    found: bool
    xMin: int
    yMin: int
    xMax: int
    yMax: int
    areaFraction: float
    touchesBorder: bool
    contrast: float
    mask: np.ndarray | None

    @property
    def boxWidth(self) -> int:
        return self.xMax - self.xMin

    @property
    def boxHeight(self) -> int:
        return self.yMax - self.yMin


@dataclass(frozen=True)
class CaptureMetrics:
    frameMeanLuminance: float
    frameDarkFraction: float
    frameBrightFraction: float
    partFound: bool
    partAreaFraction: float
    partTouchesBorder: bool
    partContrast: float
    partMedianLuminance: float
    partDarkFraction: float
    partBrightFraction: float
    backgroundMedianLuminance: float
    edgeSharpness: float

    def toScores(self) -> dict[str, float]:
        return {key: float(value) for key, value in asdict(self).items() if not isinstance(value, bool)}


@dataclass(frozen=True)
class CaptureThresholds:
    """Capture quality is measured where a defect on the part cannot change it: exposure on the background around
    the part (plus frame clipping), focus on the part's silhouette edge. Statistics taken over the part itself
    misread large defects (missing covers, bare metal) as blur or overexposure."""

    minFrameMeanLuminance: float
    maxFrameMeanLuminance: float
    maxFrameDarkFraction: float
    maxFrameBrightFraction: float
    minPartContrast: float
    minPartAreaFraction: float
    maxPartAreaFraction: float
    minBackgroundLuminance: float
    maxBackgroundLuminance: float
    minEdgeSharpness: float

    def toDict(self) -> dict[str, float]:
        return {key: float(value) for key, value in asdict(self).items()}


@dataclass(frozen=True)
class GateOutcome:
    decision: str | None
    reasonCode: str
    reasonDetail: str


def resizeLongSide(image: np.ndarray, longSide: int) -> tuple[np.ndarray, float]:
    import cv2 as cv

    scale = longSide / max(image.shape[:2])
    if scale >= 1.0:
        return image, 1.0
    resized = cv.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)), interpolation=cv.INTER_AREA)
    return resized, scale


def locatePart(imageBgr: np.ndarray, minContrast: float = 12.0) -> PartLocation:
    """Segment the dominant object against the background estimated from the frame border (Lab colour distance)."""
    # AI Assisted Logic
    import cv2 as cv

    small, scale = resizeLongSide(imageBgr, analysisLongSide)
    height, width = small.shape[:2]
    labImage = cv.cvtColor(cv.GaussianBlur(small, (5, 5), 0), cv.COLOR_BGR2Lab).astype(np.float32)
    band = max(2, round(min(height, width) * borderBandFraction))
    borderPixels = np.concatenate([labImage[:band].reshape(-1, 3), labImage[-band:].reshape(-1, 3), labImage[:, :band].reshape(-1, 3), labImage[:, -band:].reshape(-1, 3)])
    backgroundColor = np.median(borderPixels, axis=0)
    distance = np.linalg.norm(labImage - backgroundColor, axis=2)
    distance8 = np.clip(distance * 2.0, 0, 255).astype(np.uint8)
    otsuLevel, _ = cv.threshold(distance8, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    level = max(otsuLevel, minContrast * 2.0)
    foreground = (distance8 > level).astype(np.uint8) * 255
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (9, 9))
    foreground = cv.morphologyEx(foreground, cv.MORPH_CLOSE, kernel, iterations=2)
    foreground = cv.morphologyEx(foreground, cv.MORPH_OPEN, kernel)
    contours, _ = cv.findContours(foreground, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    if not contours:
        return PartLocation(False, 0, 0, 0, 0, 0.0, False, 0.0, None)
    largest = max(contours, key=cv.contourArea)
    hull = cv.convexHull(largest)
    smallMask = np.zeros((height, width), dtype=np.uint8)
    cv.drawContours(smallMask, [hull], -1, 255, thickness=cv.FILLED)
    areaFraction = float(cv.countNonZero(smallMask)) / float(height * width)
    x, y, boxWidth, boxHeight = cv.boundingRect(hull)
    edgeMargin = max(1, round(min(height, width) * 0.01))
    touchesBorder = x <= edgeMargin or y <= edgeMargin or x + boxWidth >= width - edgeMargin or y + boxHeight >= height - edgeMargin
    contrast = float(np.median(distance[smallMask > 0])) if areaFraction > 0 else 0.0
    fullMask = cv.resize(smallMask, (imageBgr.shape[1], imageBgr.shape[0]), interpolation=cv.INTER_NEAREST)
    inverse = 1.0 / scale
    return PartLocation(
        found=True,
        xMin=int(x * inverse),
        yMin=int(y * inverse),
        xMax=min(imageBgr.shape[1], int(round((x + boxWidth) * inverse))),
        yMax=min(imageBgr.shape[0], int(round((y + boxHeight) * inverse))),
        areaFraction=areaFraction,
        touchesBorder=bool(touchesBorder),
        contrast=contrast,
        mask=fullMask,
    )


def measureCapture(imageBgr: np.ndarray, location: PartLocation) -> CaptureMetrics:
    # AI Assisted Logic
    import cv2 as cv

    gray = cv.cvtColor(imageBgr, cv.COLOR_BGR2GRAY)
    frameMean = float(gray.mean()) / 255.0
    frameDark = float(np.count_nonzero(gray <= darkClipLevel)) / gray.size
    frameBright = float(np.count_nonzero(gray >= brightClipLevel)) / gray.size
    if not location.found or location.mask is None:
        frameMedian = float(np.median(gray)) / 255.0
        return CaptureMetrics(frameMean, frameDark, frameBright, False, 0.0, False, 0.0, frameMedian, frameDark, frameBright, frameMedian, 0.0)
    shortSide = min(gray.shape[:2])
    bandKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (max(3, round(shortSide * silhouetteBandFraction)) | 1,) * 2)
    silhouetteBand = cv.dilate(location.mask, bandKernel) - cv.erode(location.mask, bandKernel)
    gradientMagnitude = cv.magnitude(cv.Sobel(gray, cv.CV_32F, 1, 0, ksize=3), cv.Sobel(gray, cv.CV_32F, 0, 1, ksize=3))
    bandValues = gradientMagnitude[silhouetteBand > 0]
    gapKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (max(3, round(shortSide * backgroundGapFraction)) | 1,) * 2)
    backgroundPixels = gray[cv.dilate(location.mask, gapKernel) == 0]
    partPixels = gray[location.mask > 0]
    return CaptureMetrics(
        frameMeanLuminance=frameMean,
        frameDarkFraction=frameDark,
        frameBrightFraction=frameBright,
        partFound=True,
        partAreaFraction=location.areaFraction,
        partTouchesBorder=location.touchesBorder,
        partContrast=location.contrast,
        partMedianLuminance=float(np.median(partPixels)) / 255.0 if partPixels.size else 0.0,
        partDarkFraction=float(np.count_nonzero(partPixels <= darkClipLevel)) / max(1, partPixels.size),
        partBrightFraction=float(np.count_nonzero(partPixels >= brightClipLevel)) / max(1, partPixels.size),
        backgroundMedianLuminance=float(np.median(backgroundPixels)) / 255.0 if backgroundPixels.size else frameMean,
        edgeSharpness=float(np.percentile(bandValues, edgeSharpnessPercentile)) if bandValues.size else 0.0,
    )


def evaluateCaptureGates(metrics: CaptureMetrics, thresholds: CaptureThresholds) -> GateOutcome:
    """Return NO_PART or RETAKE when the capture cannot support an inspection, otherwise decision=None."""
    if metrics.frameMeanLuminance < thresholds.minFrameMeanLuminance or metrics.frameDarkFraction > thresholds.maxFrameDarkFraction:
        return GateOutcome("RETAKE", "UNDEREXPOSED", f"Frame mean luminance {metrics.frameMeanLuminance:.3f}, clipped-dark fraction {metrics.frameDarkFraction:.3f}")
    if metrics.frameMeanLuminance > thresholds.maxFrameMeanLuminance or metrics.frameBrightFraction > thresholds.maxFrameBrightFraction:
        return GateOutcome("RETAKE", "OVEREXPOSED", f"Frame mean luminance {metrics.frameMeanLuminance:.3f}, clipped-bright fraction {metrics.frameBrightFraction:.3f}")
    if not metrics.partFound or metrics.partContrast < thresholds.minPartContrast or metrics.partAreaFraction < thresholds.minPartAreaFraction * 0.25:
        return GateOutcome("NO_PART", "PART_NOT_FOUND", "No object separated from the background")
    if metrics.backgroundMedianLuminance < thresholds.minBackgroundLuminance:
        return GateOutcome("RETAKE", "UNDEREXPOSED", f"Background luminance {metrics.backgroundMedianLuminance:.3f} below {thresholds.minBackgroundLuminance:.3f}")
    if metrics.backgroundMedianLuminance > thresholds.maxBackgroundLuminance:
        return GateOutcome("RETAKE", "OVEREXPOSED", f"Background luminance {metrics.backgroundMedianLuminance:.3f} above {thresholds.maxBackgroundLuminance:.3f}")
    if metrics.partTouchesBorder:
        return GateOutcome("RETAKE", "PART_CUT_OFF", "Part touches the frame border; full coverage is not visible")
    if not thresholds.minPartAreaFraction <= metrics.partAreaFraction <= thresholds.maxPartAreaFraction:
        return GateOutcome("RETAKE", "PART_SCALE_OUT_OF_RANGE", f"Part covers {metrics.partAreaFraction:.3f} of the frame; validated range {thresholds.minPartAreaFraction:.3f}-{thresholds.maxPartAreaFraction:.3f}")
    if metrics.edgeSharpness < thresholds.minEdgeSharpness:
        return GateOutcome("RETAKE", "BLURRED", f"Silhouette edge sharpness {metrics.edgeSharpness:.1f} below {thresholds.minEdgeSharpness:.1f}")
    return GateOutcome(None, "CAPTURE_OK", "Capture checks passed")


def cropPartSquare(imageBgr: np.ndarray, location: PartLocation, marginFraction: float = 0.06) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int]]:
    """Square crop centred on the part, padded by replication; returns crop, crop mask, and (x0, y0, side) in image pixels."""
    import cv2 as cv

    side = int(round(max(location.boxWidth, location.boxHeight) * (1.0 + 2.0 * marginFraction)))
    centerX = (location.xMin + location.xMax) // 2
    centerY = (location.yMin + location.yMax) // 2
    x0 = centerX - side // 2
    y0 = centerY - side // 2
    padLeft, padTop = max(0, -x0), max(0, -y0)
    padRight = max(0, x0 + side - imageBgr.shape[1])
    padBottom = max(0, y0 + side - imageBgr.shape[0])
    paddedImage = cv.copyMakeBorder(imageBgr, padTop, padBottom, padLeft, padRight, cv.BORDER_REPLICATE)
    mask = location.mask if location.mask is not None else np.full(imageBgr.shape[:2], 255, dtype=np.uint8)
    paddedMask = cv.copyMakeBorder(mask, padTop, padBottom, padLeft, padRight, cv.BORDER_CONSTANT, value=0)
    crop = paddedImage[y0 + padTop : y0 + padTop + side, x0 + padLeft : x0 + padLeft + side]
    cropMask = paddedMask[y0 + padTop : y0 + padTop + side, x0 + padLeft : x0 + padLeft + side]
    return crop, cropMask, (x0, y0, side)


def buildScoringMask(cropMask: np.ndarray, mode: str) -> np.ndarray:
    """Region whose patches are scored: the part hull, the hull dilated to include protruding pins, or the full crop."""
    import cv2 as cv

    if mode == "hull":
        return cropMask
    if mode == "full":
        return np.full_like(cropMask, 255)
    if mode == "dilated":
        kernelSize = max(3, round(cropMask.shape[0] * 0.25)) | 1
        return cv.dilate(cropMask, cv.getStructuringElement(cv.MORPH_ELLIPSE, (kernelSize, kernelSize)))
    raise ValueError(f"Unknown scoring mask mode {mode}")
