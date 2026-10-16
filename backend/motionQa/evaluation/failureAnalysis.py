"""Reproduce the 2026-10-16 analysis of two development failures (Anomaly/048 false PASS, Anomaly/043 NO_PART).

    python -m motionQa.evaluation.failureAnalysis --output ../evaluation/results/failureAnalysis-2026-10-16.json

Every image used here has influenced development; the output explains behaviour and is not an accuracy estimate.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import cv2 as cv
import numpy as np
from ..inspection.anomalyScorer import MemoryBank, PatchCoreScorer
from ..inspection.baselineScorer import fitTemplate, scoreTemplate
from ..inspection.captureQuality import buildScoringMask, cropPartSquare, locatePart
from ..inspection.featureExtractor import FeatureModelSpec, OpenCvFeatureExtractor, buildPatchEmbeddings
from ..inspection.inspectionProfile import loadProfile
from .runEvaluation import computeAuroc, loadImage, prepareCrop

repoRoot = Path(__file__).resolve().parents[3]
backendRoot = Path(__file__).resolve().parents[2]
alignSize = 128


def percentiles(values, points=(50, 90, 95, 98, 100)):
    return {f"p{p}": round(float(np.percentile(values, p)), 4) for p in points}


def ground_truth_overlap(scorer, profile, datasetDir, name):
    # AI Assisted Logic
    size = profile.preprocessing.inputSize
    image = loadImage(datasetDir, f"pcb1/Data/Images/Anomaly/{name}.JPG")
    mask = cv.imread(str(datasetDir / f"pcb1/Data/Masks/Anomaly/{name}.png"), cv.IMREAD_GRAYSCALE)
    location = locatePart(image)
    crop, cropMask, (x0, y0, side) = cropPartSquare(image, location)
    padded = cv.copyMakeBorder(mask, max(0, -y0), max(0, y0 + side - mask.shape[0]), max(0, -x0), max(0, x0 + side - mask.shape[1]), cv.BORDER_CONSTANT, value=0)
    truth = cv.resize(padded[y0 + max(0, -y0): y0 + max(0, -y0) + side, x0 + max(0, -x0): x0 + max(0, -x0) + side], (size, size), interpolation=cv.INTER_NEAREST) > 0
    scoring = buildScoringMask(cv.resize(cropMask, (size, size), interpolation=cv.INTER_NEAREST), profile.preprocessing.scoringMask)
    result = scorer.score(cv.resize(crop, (size, size), interpolation=cv.INTER_AREA), scoring)
    anomalyMap = result.anomalyMap
    return {"image": f"Anomaly/{name}", "imageScore": round(result.imageScore, 4), "identityDistance": round(result.identityDistance, 4),
            "groundTruthPixelsAtModelInput": int(truth.sum()), "groundTruthInsideScoringRegion": round(float((truth & (scoring > 0)).sum()) / max(1, truth.sum()), 3),
            "maxScoreInsideGroundTruth": round(float(anomalyMap[truth].max()), 4), "maxScoreOutsideGroundTruth": round(float(anomalyMap[~truth].max()), 4),
            "passBelow": profile.decision.passBelow}


def canonical_gray(crop):
    return cv.GaussianBlur(cv.cvtColor(cv.resize(crop, (alignSize, alignSize), interpolation=cv.INTER_AREA), cv.COLOR_BGR2GRAY), (3, 3), 0).astype(np.float32) / 255


def canonicalize(crop, reference, size):
    """Pick 0 or 180 degrees by normalized correlation with the reference, then refine with ECC (Euclidean)."""
    gray = canonical_gray(crop)
    rotated = cv.rotate(gray, cv.ROTATE_180)
    scores = [float(cv.matchTemplate(candidate, reference, cv.TM_CCOEFF_NORMED)[0, 0]) for candidate in (gray, rotated)]
    isRotated = scores[1] > scores[0]
    source = cv.rotate(crop, cv.ROTATE_180) if isRotated else crop
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv.findTransformECC(reference, rotated if isRotated else gray, warp, cv.MOTION_EUCLIDEAN, (cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 60, 1e-5), None, 3)
    except cv.error:
        pass
    warp[:, 2] *= size / alignSize
    return cv.warpAffine(source, warp, (size, size), flags=cv.INTER_LINEAR + cv.WARP_INVERSE_MAP, borderMode=cv.BORDER_REPLICATE), isRotated


def main() -> None:
    # AI Assisted Logic
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", type=Path, default=backendRoot / "models" / "visaPcb1" / "inspectionProfile.json")
    parser.add_argument("--dataset-dir", type=Path, default=repoRoot / "data" / "visa")
    parser.add_argument("--manifest", type=Path, default=repoRoot / "evaluation" / "visaPcb1Split.json")
    parser.add_argument("--results", type=Path, default=repoRoot / "evaluation" / "results" / "history" / "visaPcb1Results-run3-policy1.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    profile = loadProfile(args.profile)
    size = profile.preprocessing.inputSize
    extractor = OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(args.profile.parent / profile.featureModel.file), inputSize=size))
    scorer = PatchCoreScorer(extractor, MemoryBank.load(args.profile.parent / profile.memoryBank.file))
    splits = json.loads(args.manifest.read_text())["splits"]
    evaluation = [it for split in ("validation", "test") for it in splits[split]]
    crops = {}
    for item in evaluation:
        crop, cropMask, _, _ = prepareCrop(loadImage(args.dataset_dir, item["image"]), size, profile.preprocessing.scoringMask)
        crops[item["image"]] = (crop, cropMask, item)
    result = {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "DEVELOPMENT_DATA_ANALYSIS_NOT_EVALUATION", "profile": profile.profileId}
    result["groundTruthOverlap"] = [ground_truth_overlap(scorer, profile, args.dataset_dir, name) for name in ("048", "043", "000")]

    print("template baseline", flush=True)
    template = fitTemplate([prepareCrop(loadImage(args.dataset_dir, it["image"]), size, profile.preprocessing.scoringMask)[0] for it in splits["bank"][:250]])
    baseline = {image: scoreTemplate(template, crop, cropMask) for image, (crop, cropMask, _) in crops.items()}
    validationNormal = [baseline[it["image"]] for it in splits["validation"] if it["label"] == "normal"]
    result["templateBaseline"] = {"validationNormal": percentiles(validationNormal), "anomaly048": round(baseline["pcb1/Data/Images/Anomaly/048.JPG"], 4),
                                  "note": "048 scores inside the normal range; high normal scores are pins-down boards (alignment), so this channel cannot separate 048"}

    print("position-aware prototype", flush=True)
    bankItems = splits["bank"][::2]
    first = prepareCrop(loadImage(args.dataset_dir, bankItems[0]["image"]), size, profile.preprocessing.scoringMask)[0]
    reference = canonical_gray(first)
    reference = np.mean([canonical_gray(canonicalize(prepareCrop(loadImage(args.dataset_dir, it["image"]), size, profile.preprocessing.scoringMask)[0], reference, size)[0])
                         for it in bankItems[:60]], axis=0).astype(np.float32)
    features, bankRotated = [], []
    for item in bankItems:
        aligned, isRotated = canonicalize(prepareCrop(loadImage(args.dataset_dir, item["image"]), size, profile.preprocessing.scoringMask)[0], reference, size)
        features.append(buildPatchEmbeddings(extractor.extract(aligned)))
        bankRotated.append(isRotated)
    features = np.stack(features)
    mean, std = features.mean(0), features.std(0) + 1e-3
    positional, orientation = {}, {}
    for image, (crop, _, _) in crops.items():
        aligned, isRotated = canonicalize(crop, reference, size)
        z = np.sqrt(np.mean(((buildPatchEmbeddings(extractor.extract(aligned)) - mean) / std) ** 2, axis=2)).astype(np.float32)
        z = cv.GaussianBlur(cv.erode(z, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
        positional[image] = float(z.max())
        orientation[image] = "pinsDown" if isRotated else "pinsUp"
    valNormal = [positional[it["image"]] for it in splits["validation"] if it["label"] == "normal"]
    valAnomaly = [positional[it["image"]] for it in splits["validation"] if it["label"] == "anomaly"]
    result["positionalPrototype"] = {"bankImages": len(bankItems), "bankFractionRotated": round(float(np.mean(bankRotated)), 3),
                                     "validationImageAuroc": round(computeAuroc(valNormal, valAnomaly), 4), "validationNormal": percentiles(valNormal),
                                     "anomaly048": round(positional["pcb1/Data/Images/Anomaly/048.JPG"], 4),
                                     "note": "Not adopted: 048 stays well inside the normal range and validation AUROC is below the deployed scorer"}

    print("identity and orientation", flush=True)
    identity = {}
    for image, (crop, cropMask, item) in crops.items():
        identity[image] = scorer.score(crop, cropMask).identityDistance
    others = {}
    for split in ("otherObjectValidation", "otherObjectTest"):
        for item in splits[split]:
            crop, cropMask, _, _ = prepareCrop(loadImage(args.dataset_dir, item["image"]), size, profile.preprocessing.scoringMask)
            if crop is not None:
                others[item["image"]] = scorer.score(crop, cropMask).identityDistance
    def labelled(split, label):
        return [identity[it["image"]] for it in splits[split] if it["label"] == label]
    result["identity"] = {
        "validationTargetMax": round(max(labelled("validation", "normal") + labelled("validation", "anomaly")), 4),
        "testTargetsAboveValidationMax": [{"image": it["image"], "identity": round(identity[it["image"]], 4)} for it in splits["test"]
                                          if identity[it["image"]] > max(labelled("validation", "normal") + labelled("validation", "anomaly"))],
        "otherObjectValidationMin": round(min(others[it["image"]] for it in splits["otherObjectValidation"] if it["image"] in others), 4),
        "otherObjectTestMin": round(min(others[it["image"]] for it in splits["otherObjectTest"] if it["image"] in others), 4),
        "anomaly043": round(identity["pcb1/Data/Images/Anomaly/043.JPG"], 4),
    }
    records = json.loads(args.results.read_text())["records"]["test"]
    table = Counter((r["label"], orientation[r["image"]], r["decision"]) for r in records)
    result["orientationConfound"] = {
        "source": args.results.name,
        "decisionsByLabelAndOrientation": {f"{label}|{side}": {d: table[(label, side, d)] for d in ("PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR")}
                                           for label in ("normal", "anomaly") for side in ("pinsUp", "pinsDown")},
        "medianAnomalyScore": {f"{label}|{side}": round(float(np.median([r["anomalyScore"] for r in records if r["label"] == label and orientation[r["image"]] == side and r["anomalyScore"] is not None])), 4)
                               for label in ("normal", "anomaly") for side in ("pinsUp", "pinsDown")},
        "note": "Pins-down boards are under-represented among bank normals but make up most anomalies; reported metrics partly reflect orientation.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ("groundTruthOverlap", "templateBaseline", "positionalPrototype", "identity")}, indent=1))


if __name__ == "__main__":
    main()
