"""Exports the real intermediate stages of the MotionQA OpenCV 5 pipeline for the architecture scene.

    ../backend/.venv/bin/python scripts/export_pipeline_stages.py

Every image comes from the backend's own functions with the deployed profile (no drawing of model output):
locatePart -> measureCapture (silhouette band + Sobel) -> cropPartSquare/resize -> OpenCV DNN features ->
PatchCoreScorer anomaly map -> renderOverlay. Writes public/assets/pipeline/*.jpg and src/data/pipeline-stages.json.
For Anomaly/048 it also writes the anomaly map with the VisA ground-truth outline (dataset label) and the map maximum.
"""

import json
import sys
import time
from pathlib import Path

videoRoot = Path(__file__).resolve().parent.parent
repoRoot = videoRoot.parent
sys.path.insert(0, str(repoRoot / "backend"))

import cv2 as cv  # noqa: E402
import numpy as np  # noqa: E402

from motionQa.inspection import captureQuality  # noqa: E402
from motionQa.inspection.captureQuality import buildScoringMask, cropPartSquare, locatePart, measureCapture  # noqa: E402
from motionQa.inspection.evidenceRendering import renderOverlay  # noqa: E402
from motionQa.inspection.inspectionPipeline import InspectionPipeline  # noqa: E402

imagesDir = repoRoot / "data" / "visa" / "pcb1" / "Data"
outDir = videoRoot / "public" / "assets" / "pipeline"
outDir.mkdir(parents=True, exist_ok=True)


def save(name: str, image: np.ndarray, width: int | None = None) -> str:
    if width and image.shape[1] != width:
        scale = width / image.shape[1]
        image = cv.resize(image, None, fx=scale, fy=scale, interpolation=cv.INTER_AREA if scale < 1 else cv.INTER_CUBIC)
    cv.imwrite(str(outDir / name), image, [cv.IMWRITE_JPEG_QUALITY, 92])
    return f"assets/pipeline/{name}"


def heat(anomalyMap: np.ndarray, low: float, high: float) -> np.ndarray:
    scaled = np.clip((anomalyMap - low) / (high - low) * 255.0, 0, 255).astype(np.uint8)
    return cv.applyColorMap(scaled, cv.COLORMAP_INFERNO)


def main() -> None:
    pipeline = InspectionPipeline(repoRoot / "backend" / "models" / "visaPcb1" / "inspectionProfile.json", evidenceStore=None)
    pipeline.loadModel()
    if not pipeline.isReady:
        raise SystemExit(f"model not ready: {pipeline.loadError}")
    profile = pipeline.profile
    stages: dict[str, object] = {"profile": f"{profile.profileId} {profile.version}", "opencv": cv.__version__, "images": {}}

    for name in ("Anomaly/000", "Anomaly/048"):
        image = cv.imread(str(imagesDir / "Images" / f"{name}.JPG"), cv.IMREAD_COLOR)
        tag = name.replace("/", "-").lower()
        started = time.perf_counter()
        location = locatePart(image)
        metrics = measureCapture(image, location)
        crop, cropMask, cropBox = cropPartSquare(image, location)
        size = profile.preprocessing.inputSize
        cropResized = cv.resize(crop, (size, size), interpolation=cv.INTER_AREA)
        scoringMask = buildScoringMask(cv.resize(cropMask, (size, size), interpolation=cv.INTER_NEAREST), profile.preprocessing.scoringMask)
        features = pipeline.scorer.extractor.extract(cropResized)
        anomaly = pipeline.scorer.score(cropResized, scoringMask)
        outcome = pipeline.analyze(image)
        elapsedMs = (time.perf_counter() - started) * 1000

        record: dict[str, object] = {
            "decision": outcome.decision.value,
            "reasonCode": outcome.reasonCode,
            "anomalyScore": round(anomaly.imageScore, 4),
            "identityDistance": round(anomaly.identityDistance, 4),
            "partAreaFraction": round(metrics.partAreaFraction, 4),
            "edgeSharpness": round(metrics.edgeSharpness, 1),
            "minEdgeSharpness": round(profile.captureThresholds.minEdgeSharpness, 1),
            "partBox": [location.xMin, location.yMin, location.xMax, location.yMax],
            "cropBox": list(cropBox),
            "inputSize": size,
            "featureShapes": [list(f.shape) for f in features],
            "exportElapsedMs": round(elapsedMs, 1),
        }

        if name == "Anomaly/000":
            record["input"] = save(f"{tag}-1-input.jpg", image, 900)
            maskView = cv.cvtColor(location.mask, cv.COLOR_GRAY2BGR)
            cv.rectangle(maskView, (location.xMin, location.yMin), (location.xMax, location.yMax), (60, 200, 230), 6)
            record["mask"] = save(f"{tag}-2-mask.jpg", maskView, 900)
            gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
            kernelSide = max(3, round(min(gray.shape[:2]) * captureQuality.silhouetteBandFraction)) | 1
            kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (kernelSide, kernelSide))
            band = cv.dilate(location.mask, kernel) - cv.erode(location.mask, kernel)
            magnitude = cv.magnitude(cv.Sobel(gray, cv.CV_32F, 1, 0, ksize=3), cv.Sobel(gray, cv.CV_32F, 0, 1, ksize=3))
            # The band the focus gate measures (dilate - erode of the part mask), coloured by Sobel magnitude, over a dimmed photo.
            bandView = (image * 0.3).astype(np.uint8)
            bandView[band > 0] = cv.applyColorMap(np.clip(magnitude / 2, 0, 255).astype(np.uint8), cv.COLORMAP_INFERNO)[band > 0]
            record["edges"] = save(f"{tag}-3-edges.jpg", bandView)
            record["edgeBandKernelPx"] = kernelSide
            gt = cv.imread(str(imagesDir / "Masks" / "Anomaly" / "000.png"), cv.IMREAD_GRAYSCALE)
            gx, gy, gw, gh = cv.boundingRect((gt > 0).astype(np.uint8))
            record["groundTruthBoxFull"] = [gx, gy, gw, gh]
            record["imageSize"] = [image.shape[1], image.shape[0]]
            record["photo"] = save(f"{tag}-0-photo.jpg", image)
            outlined = cropResized.copy()
            contours, _ = cv.findContours((scoringMask > 0).astype(np.uint8), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
            cv.drawContours(outlined, contours, -1, (60, 200, 230), 2, cv.LINE_AA)
            record["crop"] = save(f"{tag}-4-crop.jpg", outlined)
            stride8 = features[0][0]
            tiles = []
            for channel in range(8):
                fmap = stride8[channel]
                fmap = (fmap - fmap.min()) / max(float(fmap.max() - fmap.min()), 1e-6)
                tiles.append(cv.resize(cv.applyColorMap((fmap * 255).astype(np.uint8), cv.COLORMAP_VIRIDIS), (160, 160), interpolation=cv.INTER_NEAREST))
            grid = np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])])
            record["features"] = save(f"{tag}-5-features.jpg", grid)
            low, high = profile.decision.passBelow * 0.9, profile.decision.failAtOrAbove * 1.25
            mapView = heat(anomaly.anomalyMap, low, high)
            mapView[anomaly.anomalyMap < low] = (cropResized[anomaly.anomalyMap < low] * 0.35).astype(np.uint8)
            record["anomalyMap"] = save(f"{tag}-6-anomaly-map.jpg", mapView)
            record["anomalyMapRange"] = [round(low, 3), round(high, 3)]
            record["overlay"] = save(f"{tag}-7-overlay.jpg", renderOverlay(image, outcome, profile), 900)

        if name == "Anomaly/048":
            gtMask = cv.imread(str(imagesDir / "Masks" / "Anomaly" / "048.png"), cv.IMREAD_GRAYSCALE)
            x0, y0, side = cropBox
            gtCrop = np.zeros((side, side), np.uint8)
            ys, xs = max(0, y0), max(0, x0)
            ye, xe = min(gtMask.shape[0], y0 + side), min(gtMask.shape[1], x0 + side)
            gtCrop[ys - y0 : ye - y0, xs - x0 : xe - x0] = gtMask[ys:ye, xs:xe]
            gtResized = cv.resize(gtCrop, (size, size), interpolation=cv.INTER_NEAREST) > 0
            low, high = profile.decision.passBelow * 0.9, profile.decision.failAtOrAbove * 1.25
            view = heat(anomaly.anomalyMap, low, high)
            view[anomaly.anomalyMap < low] = (cropResized[anomaly.anomalyMap < low] * 0.45).astype(np.uint8)
            contours, _ = cv.findContours(gtResized.astype(np.uint8), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
            cv.drawContours(view, contours, -1, (255, 255, 255), 2, cv.LINE_AA)
            peakY, peakX = np.unravel_index(int(np.argmax(anomaly.anomalyMap)), anomaly.anomalyMap.shape)
            cv.circle(view, (int(peakX), int(peakY)), 14, (80, 220, 255), 3, cv.LINE_AA)
            insideMax = float(anomaly.anomalyMap[gtResized].max()) if gtResized.any() else None
            gx, gy, gw, gh = cv.boundingRect(cv.vconcat(list(contours)))
            record["mapWithGroundTruth"] = save(f"{tag}-map-gt.jpg", view)
            record["mapPeak"] = [int(peakX), int(peakY)]
            record["groundTruthBox"] = [gx, gy, gw, gh]
            record["maxInsideGroundTruth"] = round(insideMax, 4) if insideMax is not None else None
            record["mapMax"] = round(float(anomaly.anomalyMap.max()), 4)

        stages["images"][name] = record
        print(name, record["decision"], record["anomalyScore"])

    (videoRoot / "src" / "data" / "pipeline-stages.json").write_text(json.dumps(stages, indent=2) + "\n")


if __name__ == "__main__":
    main()
