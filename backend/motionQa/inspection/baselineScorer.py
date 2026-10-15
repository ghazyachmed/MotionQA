"""Classical OpenCV baseline: ECC-aligned per-pixel statistical template (no learned weights).

Each crop is aligned to the mean normal template with cv.findTransformECC (Euclidean motion), then
scored by the largest smoothed z-score of the grayscale difference inside the part mask.
"""
from dataclasses import dataclass
import numpy as np

baselineSize = 256


@dataclass
class TemplateModel:
    meanTemplate: np.ndarray
    stdTemplate: np.ndarray


def prepareGray(cropBgr: np.ndarray) -> np.ndarray:
    import cv2 as cv

    gray = cv.cvtColor(cv.resize(cropBgr, (baselineSize, baselineSize), interpolation=cv.INTER_AREA), cv.COLOR_BGR2GRAY)
    return cv.GaussianBlur(gray, (5, 5), 0).astype(np.float32) / 255.0


def alignToTemplate(gray: np.ndarray, template: np.ndarray) -> np.ndarray:
    """Try identity and 180-degree initial warps (parts arrive in both orientations); keep the better ECC fit."""
    # AI Assisted Logic
    import cv2 as cv

    criteria = (cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 50, 1e-4)
    center = (baselineSize - 1) / 2.0
    initialWarps = [np.eye(2, 3, dtype=np.float32), cv.getRotationMatrix2D((center, center), 180, 1.0).astype(np.float32)]
    bestCorrelation, bestWarp = -np.inf, None
    for initialWarp in initialWarps:
        try:
            correlation, warp = cv.findTransformECC(template, gray, initialWarp.copy(), cv.MOTION_EUCLIDEAN, criteria, None, 5)
        except cv.error:
            continue
        if correlation > bestCorrelation:
            bestCorrelation, bestWarp = correlation, warp
    if bestWarp is None:
        return gray
    return cv.warpAffine(gray, bestWarp, (baselineSize, baselineSize), flags=cv.INTER_LINEAR + cv.WARP_INVERSE_MAP, borderMode=cv.BORDER_REPLICATE)


def fitTemplate(crops: list[np.ndarray]) -> TemplateModel:
    grays = [prepareGray(crop) for crop in crops]
    aligned = [alignToTemplate(gray, grays[0]) for gray in grays]
    meanTemplate = np.mean(aligned, axis=0).astype(np.float32)
    aligned = [alignToTemplate(gray, meanTemplate) for gray in grays]
    meanTemplate = np.mean(aligned, axis=0).astype(np.float32)
    stdTemplate = np.std(aligned, axis=0).astype(np.float32)
    return TemplateModel(meanTemplate=meanTemplate, stdTemplate=stdTemplate)


def scoreTemplate(model: TemplateModel, cropBgr: np.ndarray, cropMask: np.ndarray) -> float:
    import cv2 as cv

    aligned = alignToTemplate(prepareGray(cropBgr), model.meanTemplate)
    zScore = np.abs(aligned - model.meanTemplate) / (model.stdTemplate + 0.02)
    zScore = cv.GaussianBlur(zScore, (0, 0), 3.0)
    mask = cv.resize(cropMask, (baselineSize, baselineSize), interpolation=cv.INTER_NEAREST) > 0
    mask = cv.erode(mask.astype(np.uint8), cv.getStructuringElement(cv.MORPH_ELLIPSE, (7, 7))) > 0
    return float(zScore[mask].max()) if mask.any() else float(zScore.max())
