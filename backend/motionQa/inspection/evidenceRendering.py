import numpy as np

decisionColors = {
    "PASS": (60, 160, 40),
    "FAIL": (40, 40, 200),
    "REVIEW": (0, 140, 230),
    "RETAKE": (0, 170, 210),
    "NO_PART": (120, 120, 120),
    "ERROR": (90, 30, 140),
}


def renderOverlay(image: np.ndarray, outcome, profile) -> np.ndarray:
    """Annotated evidence frame: part outline, anomaly heatmap within the part, candidate regions, and decision banner."""
    # AI Assisted Logic
    import cv2 as cv

    canvas = image.copy()
    decisionValue = outcome.decision.value if hasattr(outcome.decision, "value") else str(outcome.decision)
    color = decisionColors.get(decisionValue, (200, 200, 200))
    if outcome.anomalyMap is not None and outcome.cropBox is not None and profile is not None:
        x0, y0, side = outcome.cropBox
        # Only areas at or above 90% of the PASS threshold are coloured, so normal regions stay unmarked.
        lowLevel = profile.decision.passBelow * 0.9
        highLevel = max(profile.decision.failAtOrAbove * 1.25, lowLevel + 1e-6)
        heat = np.clip((outcome.anomalyMap - lowLevel) / (highLevel - lowLevel) * 255.0, 0, 255).astype(np.uint8)
        heat = cv.resize(heat, (side, side), interpolation=cv.INTER_LINEAR)
        heatColor = cv.applyColorMap(heat, cv.COLORMAP_INFERNO)
        heatMask = cv.resize((outcome.anomalyMap >= lowLevel).astype(np.uint8), (side, side), interpolation=cv.INTER_NEAREST)
        xStart, yStart = max(0, x0), max(0, y0)
        xEnd, yEnd = min(canvas.shape[1], x0 + side), min(canvas.shape[0], y0 + side)
        if xEnd > xStart and yEnd > yStart:
            target = canvas[yStart:yEnd, xStart:xEnd]
            heatPatch = heatColor[yStart - y0 : yEnd - y0, xStart - x0 : xEnd - x0]
            maskPatch = heatMask[yStart - y0 : yEnd - y0, xStart - x0 : xEnd - x0] > 0
            blended = cv.addWeighted(target, 0.55, heatPatch, 0.45, 0)
            target[maskPatch] = blended[maskPatch]
    location = outcome.location
    thickness = max(2, round(max(canvas.shape[:2]) / 400))
    if location is not None and location.found:
        cv.rectangle(canvas, (location.xMin, location.yMin), (location.xMax, location.yMax), (200, 200, 0), thickness)
    for region in outcome.regions:
        cv.rectangle(canvas, (int(region.xMin), int(region.yMin)), (int(region.xMax), int(region.yMax)), (40, 40, 230), thickness)
    bannerHeight = max(36, round(canvas.shape[0] * 0.06))
    cv.rectangle(canvas, (0, 0), (canvas.shape[1], bannerHeight), color, cv.FILLED)
    anomalyScore = outcome.scores.get("anomalyScore")
    scoreText = f"  score {anomalyScore:.2f}" if anomalyScore is not None else ""
    fontScale = bannerHeight / 48
    cv.putText(canvas, f"{decisionValue}  {outcome.reasonCode}{scoreText}", (12, int(bannerHeight * 0.72)), cv.FONT_HERSHEY_SIMPLEX, fontScale, (255, 255, 255), max(1, thickness // 2), cv.LINE_AA)
    longSide = max(canvas.shape[:2])
    if longSide > 1600:
        scale = 1600 / longSide
        canvas = cv.resize(canvas, (round(canvas.shape[1] * scale), round(canvas.shape[0] * scale)), interpolation=cv.INTER_AREA)
    return canvas
