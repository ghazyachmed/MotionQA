"""Build the VisA pcb1 inspection profile, calibrate thresholds on validation data, and evaluate on test data.

    python -m motionQa.evaluation.runEvaluation

Outputs:
- models/visaPcb1/{featureExtractor.onnx, memoryBank.npz, inspectionProfile.json}  (runtime artifacts, gitignored)
- ../evaluation/results/visaPcb1Results.json                                       (machine-readable results)
"""
import argparse
import asyncio
import json
import platform
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from ..edge.modelRegistry import ModelRegistry, computeSha256, featureBackbone
from ..inspection.anomalyScorer import MemoryBank, PatchCoreScorer, selectGreedyCoreset, computeGlobalFeature
from ..inspection.baselineScorer import fitTemplate, scoreTemplate
from ..inspection.captureQuality import CaptureMetrics, CaptureThresholds, buildScoringMask, cropPartSquare, evaluateCaptureGates, locatePart, measureCapture
from ..inspection.evidenceStore import LocalEvidenceStore
from ..inspection.featureExtractor import FeatureModelSpec, OpenCvFeatureExtractor, buildFeatureModel, defaultOutputNames, imagenetMean, imagenetStd
from ..inspection.imageInput import decodeImage
from ..inspection.inspectionPipeline import InspectionPipeline, InspectionRequest, decideFromAnomalyScore
from ..inspection.opencvRuntime import getOpenCvDiagnostics, requireOpenCvFive

repoRoot = Path(__file__).resolve().parents[3]
backendRoot = Path(__file__).resolve().parents[2]
missedDefectTarget = 0.02
falseRejectTarget = 0.02
operatingPointMissTargets = (missedDefectTarget, 0.05, 0.10)
patchSampleFraction = 0.25
coresetSize = 16000
samplingSeed = 7
degradationKinds = ("blur_mild", "blur_strong", "underexposed", "overexposed", "cut_off", "empty_scene")
candidateInputSizes = (320, 448)
candidateMaskModes = ("hull", "dilated", "full")
selectionBankImages = 300
selectionCoresetSize = 8000


def loadImage(datasetDir: Path, relativePath: str) -> np.ndarray:
    import cv2 as cv

    image = cv.imread(str(datasetDir / relativePath), cv.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(datasetDir / relativePath)
    return image


def computeAuroc(normalScores: list[float], anomalyScores: list[float]) -> float:
    """Mann-Whitney estimate of P(anomaly score > normal score), ties counted as one half."""
    normal = np.asarray(normalScores)[:, None]
    anomaly = np.asarray(anomalyScores)[None, :]
    return float(((anomaly > normal).sum() + 0.5 * (anomaly == normal).sum()) / (normal.size * anomaly.size))


def computeAveragePrecision(normalScores: list[float], anomalyScores: list[float]) -> float:
    scores = np.concatenate([normalScores, anomalyScores])
    labels = np.concatenate([np.zeros(len(normalScores)), np.ones(len(anomalyScores))])
    order = np.argsort(-scores, kind="stable")
    sortedLabels = labels[order]
    truePositives = np.cumsum(sortedLabels)
    precision = truePositives / np.arange(1, len(sortedLabels) + 1)
    return float((precision * sortedLabels).sum() / max(1.0, sortedLabels.sum()))


def selectDecisionThresholds(normalScores: list[float], anomalyScores: list[float], missTarget: float = missedDefectTarget, rejectTarget: float = falseRejectTarget) -> dict[str, float]:
    """PASS threshold limits validation missed defects; FAIL threshold limits validation false rejections.

    Scores between the two thresholds go to REVIEW. If the targets can be met with one cut, no review band is used.
    """
    # AI Assisted Logic
    normalSorted = np.sort(np.asarray(normalScores))[::-1]
    anomalySorted = np.sort(np.asarray(anomalyScores))
    allowedFalseRejects = int(np.floor(rejectTarget * len(normalSorted)))
    allowedMisses = int(np.floor(missTarget * len(anomalySorted)))
    failAtOrAbove = float(np.nextafter(normalSorted[allowedFalseRejects], np.inf))
    passBelow = float(anomalySorted[allowedMisses])
    hasReviewBand = passBelow < failAtOrAbove
    if not hasReviewBand:
        cut = (passBelow + failAtOrAbove) / 2.0
        passBelow = failAtOrAbove = float(cut)
    return {"passBelow": passBelow, "failAtOrAbove": failAtOrAbove, "allowedFalseRejects": allowedFalseRejects, "allowedMisses": allowedMisses, "hasReviewBand": hasReviewBand}


def calibrateCaptureThresholds(metricsList: list[CaptureMetrics]) -> CaptureThresholds:
    """Margins around the range of validation-normal captures. Checked afterwards on every validation target
    image (normal and anomalous) and on synthetic capture faults applied to validation images."""
    # AI Assisted Logic
    def values(name: str) -> np.ndarray:
        return np.asarray([getattr(metrics, name) for metrics in metricsList], dtype=np.float64)

    frameMean, background, area, edgeSharpness, contrast = values("frameMeanLuminance"), values("backgroundMedianLuminance"), values("partAreaFraction"), values("edgeSharpness"), values("partContrast")
    return CaptureThresholds(
        minFrameMeanLuminance=float(max(0.02, frameMean.min() * 0.5)),
        maxFrameMeanLuminance=float(min(0.97, 1.0 - (1.0 - frameMean.max()) * 0.5)),
        maxFrameDarkFraction=float(min(0.9, values("frameDarkFraction").max() + 0.15)),
        maxFrameBrightFraction=float(min(0.9, values("frameBrightFraction").max() + 0.15)),
        minPartContrast=float(contrast.min() * 0.5),
        minPartAreaFraction=float(area.min() * 0.75),
        maxPartAreaFraction=float(min(0.97, area.max() * 1.25)),
        minBackgroundLuminance=float(background.min() * 0.6),
        maxBackgroundLuminance=float(min(0.97, background.max() + (1.0 - background.max()) * 0.5)),
        minEdgeSharpness=float(np.percentile(edgeSharpness, 1) * 0.85),
    )


def degradeImage(image: np.ndarray, kind: str) -> np.ndarray:
    """Synthetic capture faults applied to real images. Used only to test the capture gates."""
    # AI Assisted Logic
    import cv2 as cv

    longSide = max(image.shape[:2])
    if kind == "blur_mild":
        return cv.GaussianBlur(image, (0, 0), longSide * 0.003)
    if kind == "blur_strong":
        return cv.GaussianBlur(image, (0, 0), longSide * 0.008)
    if kind == "underexposed":
        return cv.convertScaleAbs(image, alpha=0.15, beta=0)
    if kind == "overexposed":
        return cv.convertScaleAbs(image, alpha=3.0, beta=60)
    if kind == "cut_off":
        location = locatePart(image)
        shiftX = int((location.xMin + location.xMax) / 2) if location.found else image.shape[1] // 2
        matrix = np.float32([[1, 0, image.shape[1] * 0.5 - shiftX + (location.boxWidth * 0.45 if location.found else 0)], [0, 1, 0]])
        return cv.warpAffine(image, matrix, (image.shape[1], image.shape[0]), borderMode=cv.BORDER_REPLICATE)
    if kind == "empty_scene":
        band = max(2, round(min(image.shape[:2]) * 0.04))
        border = np.concatenate([image[:band].reshape(-1, 3), image[-band:].reshape(-1, 3)])
        empty = np.empty_like(image)
        empty[:] = np.median(border, axis=0).astype(np.uint8)
        noise = np.random.default_rng(0).normal(0, 2.0, image.shape)
        return np.clip(empty.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    raise ValueError(kind)


def prepareCrop(image: np.ndarray, inputSize: int, maskMode: str):
    import cv2 as cv

    location = locatePart(image)
    metrics = measureCapture(image, location)
    if not location.found:
        return None, None, location, metrics
    crop, cropMask, _ = cropPartSquare(image, location)
    return (
        cv.resize(crop, (inputSize, inputSize), interpolation=cv.INTER_AREA),
        buildScoringMask(cv.resize(cropMask, (inputSize, inputSize), interpolation=cv.INTER_NEAREST), maskMode),
        location,
        metrics,
    )


def buildMemoryBank(extractor: OpenCvFeatureExtractor, datasetDir: Path, items: list[dict], inputSize: int, maskMode: str, targetCoresetSize: int, generator: np.random.Generator, keepCrops: int = 0):
    # AI Assisted Logic
    embedder = PatchCoreScorer(extractor, MemoryBank(np.zeros((1, 128), np.float32), np.zeros((1, 128), np.float32)))
    patchChunks, globalFeatures, keptCrops, locateFailures = [], [], [], []
    for item in items:
        crop, cropMask, _, _ = prepareCrop(loadImage(datasetDir, item["image"]), inputSize, maskMode)
        if crop is None:
            locateFailures.append(item["image"])
            continue
        patchEmbeddings, patchMask = embedder.embed(crop, cropMask)
        maskedPatches = patchEmbeddings.reshape(-1, patchEmbeddings.shape[2])[patchMask.reshape(-1)]
        keepCount = max(1, int(len(maskedPatches) * patchSampleFraction))
        patchChunks.append(maskedPatches[generator.choice(len(maskedPatches), size=keepCount, replace=False)])
        globalFeatures.append(computeGlobalFeature(patchEmbeddings, patchMask))
        if len(keptCrops) < keepCrops:
            keptCrops.append((crop, cropMask))
    sampledPatches = np.concatenate(patchChunks).astype(np.float32)
    coresetIndices = selectGreedyCoreset(sampledPatches, targetCoresetSize, seed=samplingSeed)
    return MemoryBank(sampledPatches[coresetIndices], np.stack(globalFeatures)), keptCrops, locateFailures


def selectConfiguration(datasetDir: Path, splits: dict, extractors: dict[int, OpenCvFeatureExtractor]) -> tuple[dict[str, object], list[dict[str, object]]]:
    """Choose input size and scoring mask by validation image AUROC with a reduced bank. Test data is not used."""
    # AI Assisted Logic
    generator = np.random.default_rng(samplingSeed)
    bankItems = [splits["bank"][index] for index in sorted(generator.choice(len(splits["bank"]), size=selectionBankImages, replace=False))]
    candidates = []
    for inputSize in candidateInputSizes:
        for maskMode in candidateMaskModes:
            memoryBank, _, _ = buildMemoryBank(extractors[inputSize], datasetDir, bankItems, inputSize, maskMode, selectionCoresetSize, np.random.default_rng(samplingSeed))
            scorer = PatchCoreScorer(extractors[inputSize], memoryBank)
            scores = {"normal": [], "anomaly": []}
            for item in splits["validation"]:
                crop, cropMask, _, _ = prepareCrop(loadImage(datasetDir, item["image"]), inputSize, maskMode)
                if crop is not None:
                    scores[item["label"]].append(scorer.score(crop, cropMask).imageScore)
            auroc = computeAuroc(scores["normal"], scores["anomaly"])
            candidates.append({"inputSize": inputSize, "scoringMask": maskMode, "validationImageAuroc": round(auroc, 4)})
            print(f"    candidate input={inputSize} mask={maskMode} validation AUROC={auroc:.4f}", flush=True)
    best = max(candidates, key=lambda candidate: (candidate["validationImageAuroc"], -candidate["inputSize"]))
    return best, candidates


def summarizeDecisions(records: list[dict[str, object]]) -> dict[str, object]:
    # AI Assisted Logic
    decisions = ["PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR"]
    summary: dict[str, object] = {}
    for label in sorted({str(record["label"]) for record in records}):
        subset = [record for record in records if record["label"] == label]
        counts = {decision: sum(1 for record in subset if record["decision"] == decision) for decision in decisions}
        summary[label] = {"count": len(subset), "decisions": counts, "rates": {decision: round(counts[decision] / max(1, len(subset)), 4) for decision in decisions}}
    normal = summary.get("normal", {"count": 0, "decisions": {}})
    anomaly = summary.get("anomaly", {"count": 0, "decisions": {}})
    if normal["count"] and anomaly["count"]:
        total = normal["count"] + anomaly["count"]
        automatic = normal["decisions"]["PASS"] + normal["decisions"]["FAIL"] + anomaly["decisions"]["PASS"] + anomaly["decisions"]["FAIL"]
        correctAutomatic = normal["decisions"]["PASS"] + anomaly["decisions"]["FAIL"]
        summary["keyMetrics"] = {
            "missedDefectRate": round(anomaly["decisions"]["PASS"] / anomaly["count"], 4),
            "falseRejectionRate": round(normal["decisions"]["FAIL"] / normal["count"], 4),
            "reviewRate": round((normal["decisions"]["REVIEW"] + anomaly["decisions"]["REVIEW"]) / total, 4),
            "retakeRate": round((normal["decisions"]["RETAKE"] + anomaly["decisions"]["RETAKE"]) / total, 4),
            "noPartRate": round((normal["decisions"]["NO_PART"] + anomaly["decisions"]["NO_PART"]) / total, 4),
            "automaticDecisionRate": round(automatic / total, 4),
            "automaticDecisionAccuracy": round(correctAutomatic / max(1, automatic), 4),
        }
    return summary


def describeDistribution(values: list[float]) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    return {"count": int(array.size), "mean": round(float(array.mean()), 2), "median": round(float(np.median(array)), 2), "p95": round(float(np.percentile(array, 95)), 2), "max": round(float(array.max()), 2)}


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", default=str(repoRoot / "evaluation" / "visaPcb1Split.json"))
    parser.add_argument("--dataset-dir", default=str(repoRoot / "data" / "visa"))
    parser.add_argument("--model-dir", default=str(backendRoot / "models"))
    parser.add_argument("--results", default=str(repoRoot / "evaluation" / "results" / "visaPcb1Results.json"))
    parser.add_argument("--input-size", type=int, default=None, help="skip selection when given together with --scoring-mask")
    parser.add_argument("--scoring-mask", choices=candidateMaskModes, default=None)
    parser.add_argument("--latency-samples", type=int, default=60)
    return parser.parse_args()


def main() -> None:
    # AI Assisted Logic
    import cv2 as cv

    requireOpenCvFive()
    args = parseArgs()
    startedAt = datetime.now(timezone.utc)
    manifest = json.loads(Path(args.manifest).read_text())
    datasetDir = Path(args.dataset_dir)
    splits = manifest["splits"]
    profileDir = Path(args.model_dir) / "visaPcb1"
    generator = np.random.default_rng(samplingSeed)
    inputSize = args.input_size

    backbonePath = ModelRegistry(Path(args.model_dir)).downloadFeatureBackbone()
    featurePath = buildFeatureModel(backbonePath, profileDir / "featureExtractor.onnx")
    extractors = {size: OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(featurePath), inputSize=size)) for size in candidateInputSizes}

    print("[0/6] Selecting input size and scoring mask on validation data", flush=True)
    if args.input_size and args.scoring_mask:
        selected, selectionCandidates = {"inputSize": args.input_size, "scoringMask": args.scoring_mask}, []
    else:
        selected, selectionCandidates = selectConfiguration(datasetDir, splits, extractors)
    inputSize, maskMode = int(selected["inputSize"]), str(selected["scoringMask"])
    extractor = extractors.get(inputSize) or OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(featurePath), inputSize=inputSize))

    print(f"[1/6] Building memory bank from {len(splits['bank'])} normal images (input={inputSize}, mask={maskMode})", flush=True)
    bankStart = time.perf_counter()
    memoryBank, bankCrops, bankLocateFailures = buildMemoryBank(extractor, datasetDir, splits["bank"], inputSize, maskMode, coresetSize, generator, keepCrops=250)
    bankPath = profileDir / "memoryBank.npz"
    memoryBank.save(bankPath)
    scorer = PatchCoreScorer(extractor, memoryBank)
    templateModel = fitTemplate([crop for crop, _ in bankCrops])
    bankSeconds = time.perf_counter() - bankStart

    print(f"[2/6] Scoring {len(splits['validation'])} validation images", flush=True)
    validationRecords = []
    for item in splits["validation"]:
        crop, cropMask, location, metrics = prepareCrop(loadImage(datasetDir, item["image"]), inputSize, maskMode)
        record = {"image": item["image"], "label": item["label"], "defectType": item["defectType"], "metrics": metrics}
        if crop is not None:
            anomaly = scorer.score(crop, cropMask)
            record.update(anomalyScore=anomaly.imageScore, identityDistance=anomaly.identityDistance, baselineScore=scoreTemplate(templateModel, crop, cropMask))
        validationRecords.append(record)
    otherValidation = []
    for item in splits["otherObjectValidation"]:
        crop, cropMask, _, _ = prepareCrop(loadImage(datasetDir, item["image"]), inputSize, maskMode)
        otherValidation.append(scorer.score(crop, cropMask).identityDistance if crop is not None else None)

    captureThresholds = calibrateCaptureThresholds([record["metrics"] for record in validationRecords if record["label"] == "normal" and record["metrics"].partFound])
    captureGateValidation: dict[str, dict[str, int]] = {}
    for record in validationRecords:
        gate = evaluateCaptureGates(record["metrics"], captureThresholds)
        bucket = captureGateValidation.setdefault(f"clean_{record['label']}", {})
        bucket[gate.reasonCode] = bucket.get(gate.reasonCode, 0) + 1
    for item in [item for item in splits["validation"] if item["label"] == "normal"][:30]:
        image = loadImage(datasetDir, item["image"])
        for kind in degradationKinds:
            degraded = degradeImage(image, kind)
            gate = evaluateCaptureGates(measureCapture(degraded, locatePart(degraded)), captureThresholds)
            bucket = captureGateValidation.setdefault(kind, {})
            bucket[gate.reasonCode] = bucket.get(gate.reasonCode, 0) + 1
    print(f"    capture gates on validation: {json.dumps(captureGateValidation)}", flush=True)
    scored = [record for record in validationRecords if "anomalyScore" in record]
    validationNormal = [record["anomalyScore"] for record in scored if record["label"] == "normal"]
    validationAnomaly = [record["anomalyScore"] for record in scored if record["label"] == "anomaly"]
    decisionThresholds = selectDecisionThresholds(validationNormal, validationAnomaly)
    baselineThresholds = selectDecisionThresholds([r["baselineScore"] for r in scored if r["label"] == "normal"], [r["baselineScore"] for r in scored if r["label"] == "anomaly"])
    targetIdentity = [record["identityDistance"] for record in scored]
    otherIdentity = [value for value in otherValidation if value is not None]
    maxTarget = max(targetIdentity)
    identityMaxDistance = maxTarget + 0.5 * (min(otherIdentity) - maxTarget) if otherIdentity and min(otherIdentity) > maxTarget else maxTarget * 1.1

    profile = {
        "profileId": "visa-pcb1-patchcore-mnv2",
        "version": startedAt.strftime("%Y.%m.%d"),
        "task": "Single-board stationary visual inspection on the public VisA pcb1 benchmark (normal-only anomaly detection)",
        "domainNote": "Benchmark task only. Not validated on motorcycle components or any customer production line.",
        "backbone": {"file": str(backbonePath.relative_to(profileDir.parent.parent)) if backbonePath.is_relative_to(profileDir.parent.parent) else str(backbonePath), "sha256": featureBackbone.sha256, "source": featureBackbone.downloadUrl, "license": featureBackbone.license},
        "featureModel": {"file": featurePath.name, "sha256": computeSha256(featurePath), "source": f"derived from {featureBackbone.filename} by motionQa.inspection.featureExtractor.buildFeatureModel", "license": featureBackbone.license},
        "memoryBank": {"file": bankPath.name, "sha256": computeSha256(bankPath), "source": f"VisA pcb1 bank split ({len(splits['bank'])} normal images), {coresetSize}-patch greedy coreset", "license": "CC BY 4.0 (derived from VisA)"},
        "outputNames": list(defaultOutputNames),
        "preprocessing": {"inputSize": inputSize, "mean": list(imagenetMean), "std": list(imagenetStd), "scoringMask": maskMode},
        "capture": captureThresholds.toDict(),
        "decision": {
            "passBelow": decisionThresholds["passBelow"],
            "failAtOrAbove": decisionThresholds["failAtOrAbove"],
            "identityMaxDistance": float(identityMaxDistance),
            "regionThreshold": decisionThresholds["passBelow"],
            "missedDefectTarget": missedDefectTarget,
            "falseRejectTarget": falseRejectTarget,
        },
        "dataset": {"name": "VisA", "category": "pcb1", "license": "CC BY 4.0", "source": manifest["source"], "archiveSha256": manifest.get("archive", {}).get("archiveSha256"), "splitSeed": manifest["splitSeed"]},
        "validationSummary": {"normalCount": len(validationNormal), "anomalyCount": len(validationAnomaly), "hasReviewBand": decisionThresholds["hasReviewBand"]},
    }
    profilePath = profileDir / "inspectionProfile.json"
    profilePath.write_text(json.dumps(profile, indent=2) + "\n")

    print("[3/6] Evaluating test split through the inspection pipeline", flush=True)
    evidenceDir = Path(tempfile.mkdtemp(prefix="motionqa-eval-evidence-"))
    loadStart = time.perf_counter()
    pipeline = InspectionPipeline(profilePath, LocalEvidenceStore(evidenceDir))
    coldLoadMs = (time.perf_counter() - loadStart) * 1000
    if not pipeline.isReady:
        raise RuntimeError(pipeline.loadError)
    testRecords, testScores = [], {"normal": [], "anomaly": []}
    baselineRecords = []
    for item in splits["test"]:
        image = loadImage(datasetDir, item["image"])
        outcome = pipeline.analyze(image)
        testRecords.append({"image": item["image"], "label": item["label"], "defectType": item["defectType"], "decision": outcome.decision.value, "reasonCode": outcome.reasonCode, "anomalyScore": outcome.scores.get("anomalyScore"), "identityDistance": outcome.scores.get("identityDistance")})
        if outcome.scores.get("anomalyScore") is not None:
            testScores[item["label"]].append(outcome.scores["anomalyScore"])
        crop, cropMask, location, metrics = prepareCrop(image, inputSize, maskMode)
        gate = evaluateCaptureGates(metrics, captureThresholds)
        if gate.decision is not None or crop is None:
            baselineRecords.append({"label": item["label"], "decision": gate.decision or "NO_PART"})
        else:
            baselineScore = scoreTemplate(templateModel, crop, cropMask)
            baselineDecision, _ = decideFromAnomalyScore(baselineScore, baselineThresholds["passBelow"], baselineThresholds["failAtOrAbove"])
            baselineRecords.append({"label": item["label"], "decision": baselineDecision.value, "baselineScore": baselineScore})
    officialAnomalyScores = testScores["anomaly"] + validationAnomaly
    officialBaselineAnomaly = [r["baselineScore"] for r in baselineRecords if r["label"] == "anomaly" and "baselineScore" in r] + [r["baselineScore"] for r in scored if r["label"] == "anomaly"]
    officialBaselineNormal = [r["baselineScore"] for r in baselineRecords if r["label"] == "normal" and "baselineScore" in r]

    print("[4/6] Capture-fault and wrong-object scenarios", flush=True)
    scenarioRecords = []
    scenarioItems = [item for item in splits["test"] if item["label"] == "normal"][:40] + [item for item in splits["test"] if item["label"] == "anomaly"][:20]
    for item in scenarioItems:
        image = loadImage(datasetDir, item["image"])
        for kind in degradationKinds:
            outcome = pipeline.analyze(degradeImage(image, kind))
            scenarioRecords.append({"scenario": kind, "label": item["label"], "decision": outcome.decision.value, "reasonCode": outcome.reasonCode})
    for item in splits["otherObjectTest"]:
        outcome = pipeline.analyze(loadImage(datasetDir, item["image"]))
        scenarioRecords.append({"scenario": "other_object", "label": "other_object", "image": item["image"], "decision": outcome.decision.value, "reasonCode": outcome.reasonCode, "identityDistance": outcome.scores.get("identityDistance")})
    scenarioSummary = {}
    for kind in (*degradationKinds, "other_object"):
        subset = [record for record in scenarioRecords if record["scenario"] == kind]
        scenarioSummary[kind] = {
            "count": len(subset),
            "decisions": {decision: sum(1 for record in subset if record["decision"] == decision) for decision in ("PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR")},
            "reasonCodes": {code: sum(1 for record in subset if record["reasonCode"] == code) for code in sorted({record["reasonCode"] for record in subset})},
        }

    print(f"[5/6] Latency on {args.latency_samples} test images", flush=True)
    latencyItems = splits["test"][: args.latency_samples]
    decodeTimes, captureTimes, inferenceTimes, evidenceTimes, totalTimes = [], [], [], [], []
    firstInspectionMs = None

    async def measureLatency() -> None:
        nonlocal firstInspectionMs
        for index, item in enumerate(latencyItems):
            payload = (datasetDir / item["image"]).read_bytes()
            decodeStart = time.perf_counter()
            decoded = decodeImage(payload)
            decodeMs = (time.perf_counter() - decodeStart) * 1000
            result = await pipeline.inspect(decoded.image, InspectionRequest(inspectionId=f"eval-{index:04d}", lineId="EVAL_LINE"), decodeMs=decodeMs)
            if index == 0:
                firstInspectionMs = result.latency.totalMs
                continue
            decodeTimes.append(result.latency.decodeMs)
            captureTimes.append(result.latency.captureChecksMs)
            inferenceTimes.append(result.latency.inferenceMs)
            evidenceTimes.append(result.latency.evidenceMs)
            totalTimes.append(result.latency.totalMs)

    coldPipeline = pipeline
    asyncio.run(measureLatency())
    del coldPipeline
    sampleImage = loadImage(datasetDir, latencyItems[0]["image"])

    operatingPoints = []
    for missTarget in operatingPointMissTargets:
        pointThresholds = selectDecisionThresholds(validationNormal, validationAnomaly, missTarget=missTarget)
        pointRecords = []
        for record in testRecords:
            decision = record["decision"]
            if decision in ("PASS", "REVIEW", "FAIL") and record["anomalyScore"] is not None:
                decision = decideFromAnomalyScore(record["anomalyScore"], pointThresholds["passBelow"], pointThresholds["failAtOrAbove"])[0].value
            pointRecords.append({"label": record["label"], "decision": decision})
        operatingPoints.append({"validationMissTarget": missTarget, "validationRejectTarget": falseRejectTarget, "thresholds": {key: pointThresholds[key] for key in ("passBelow", "failAtOrAbove")}, "testKeyMetrics": summarizeDecisions(pointRecords).get("keyMetrics")})

    print("[6/6] Writing results", flush=True)
    results = {
        "evaluationStatus": "EXPLORATORY_TEST_INFORMED",
        "independentEvaluationCompleted": False,
        "qualification": "Capture gates were revised after test inspection; officialTest includes validation anomalies.",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "command": "python -m motionQa.evaluation.runEvaluation",
        "environment": {"python": platform.python_version(), "platform": platform.platform(), "machine": platform.machine(), "processor": platform.processor(), "opencv": getOpenCvDiagnostics().toDict(), "numpy": np.__version__},
        "task": profile["task"],
        "domainNote": profile["domainNote"],
        "dataset": {**profile["dataset"], "splitCounts": {name: {label: sum(1 for item in items if item["label"] == label) for label in sorted({item["label"] for item in items})} for name, items in splits.items()}, "bankLocateFailures": bankLocateFailures},
        "modelSelection": {"method": "validation image AUROC with a 300-image bank; test split unused", "selected": selected, "candidates": selectionCandidates},
        "model": {"profileId": profile["profileId"], "version": profile["version"], "backbone": profile["backbone"], "featureModel": profile["featureModel"], "memoryBank": {**profile["memoryBank"], "patches": int(memoryBank.patchFeatures.shape[0]), "dimension": int(memoryBank.patchFeatures.shape[1])}, "inputSize": inputSize, "scoringMask": maskMode, "buildSeconds": round(bankSeconds, 1)},
        "thresholds": {"decision": profile["decision"], "decisionSelection": decisionThresholds, "capture": profile["capture"], "baseline": baselineThresholds},
        "captureGateValidation": {"note": "Validation images only: clean target images must pass the gates; synthetic faults are applied to 30 validation normals.", "outcomes": captureGateValidation},
        "operatingPoints": {"note": "Thresholds chosen on validation for each missed-defect target (false-rejection target fixed), applied unchanged to test scores. The deployed profile uses the first row.", "points": operatingPoints},
        "validation": {
            "imageAuroc": round(computeAuroc(validationNormal, validationAnomaly), 4),
            "baselineImageAuroc": round(computeAuroc([r["baselineScore"] for r in scored if r["label"] == "normal"], [r["baselineScore"] for r in scored if r["label"] == "anomaly"]), 4),
            "identityDistance": {"targetMax": round(float(maxTarget), 4), "otherObjectMin": round(float(min(otherIdentity)), 4) if otherIdentity else None},
        },
        "test": {
            "imageAuroc": round(computeAuroc(testScores["normal"], testScores["anomaly"]), 4),
            "imageAveragePrecision": round(computeAveragePrecision(testScores["normal"], testScores["anomaly"]), 4),
            "decisions": summarizeDecisions(testRecords),
            "perDefectType": {defectType: {decision: sum(1 for r in testRecords if r["defectType"] == defectType and r["decision"] == decision) for decision in ("PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR")} for defectType in sorted({r["defectType"] for r in testRecords if r["label"] == "anomaly"})},
            "scoreDistribution": {"normal": describeDistribution(testScores["normal"]), "anomaly": describeDistribution(testScores["anomaly"])},
        },
        "officialSplit": {
            "note": "Official VisA 1cls test split (threshold-free). Memory bank excludes the 100 validation normals held out from the official train split.",
            "imageAuroc": round(computeAuroc(testScores["normal"], officialAnomalyScores), 4),
            "baselineImageAuroc": round(computeAuroc(officialBaselineNormal, officialBaselineAnomaly), 4) if officialBaselineNormal and officialBaselineAnomaly else None,
        },
        "baseline": {"method": "ECC-aligned per-pixel z-score template (OpenCV only)", "testImageAuroc": round(computeAuroc([r["baselineScore"] for r in baselineRecords if r["label"] == "normal" and "baselineScore" in r], [r["baselineScore"] for r in baselineRecords if r["label"] == "anomaly" and "baselineScore" in r]), 4), "decisions": summarizeDecisions(baselineRecords)},
        "scenarios": {"note": "Synthetic capture faults applied to real test images, plus real images of other VisA objects.", "summary": scenarioSummary},
        "latency": {
            "hardware": f"{platform.machine()} {platform.processor() or ''}".strip(),
            "method": "time.perf_counter around each stage inside InspectionPipeline.inspect; sequential, single process, CPU only; first inspection excluded and reported separately",
            "imageResolution": f"{sampleImage.shape[1]}x{sampleImage.shape[0]}",
            "modelInput": f"{inputSize}x{inputSize}",
            "coldStart": {"profileAndModelLoadMs": round(coldLoadMs, 1), "firstInspectionTotalMs": firstInspectionMs},
            "decodeMs": describeDistribution(decodeTimes),
            "captureChecksMs": describeDistribution(captureTimes),
            "inferenceMs": describeDistribution(inferenceTimes),
            "evidenceMs": describeDistribution(evidenceTimes),
            "endToEndMs": describeDistribution(totalTimes),
        },
        "records": {"test": testRecords, "scenarios": scenarioRecords},
    }
    resultsPath = Path(args.results)
    resultsPath.parent.mkdir(parents=True, exist_ok=True)
    resultsPath.write_text(json.dumps(results, indent=2, default=float) + "\n")
    print(json.dumps({key: results[key] for key in ("validation", "officialSplit")}, indent=2))
    print(json.dumps(results["test"]["decisions"].get("keyMetrics", {}), indent=2))
    print(f"profile: {profilePath}\nresults: {resultsPath}")
    del cv


if __name__ == "__main__":
    main()
