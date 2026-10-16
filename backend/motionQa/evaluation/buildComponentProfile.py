"""Adapt MotionQA to an owner-supplied component using development photos only.

  fit-check  run an existing profile (for example VisA pcb1) on development photos and summarize what happens;
             mostly RETAKE / NO_PART means the station or component differs and a new profile is required
  build      build a new profile from development rows of a frozenProtocol manifest plus private development labels

Test rows are never read: their physical parts and capture sessions are excluded, and the manifest validation
rejects any part or session shared between development and test. After `build`, seal the new profile with
`frozenProtocol seal` before the final test; any later change to code, profile, or thresholds needs a new test set.
"""
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from ..edge.modelRegistry import computeSha256, featureBackbone
from ..inspection.anomalyScorer import PatchCoreScorer
from ..inspection.captureQuality import evaluateCaptureGates
from ..inspection.featureExtractor import FeatureModelSpec, OpenCvFeatureExtractor, buildFeatureModel, defaultOutputNames, imagenetMean, imagenetStd
from .frozenProtocol import validate_manifest
from .runEvaluation import buildMemoryBank, calibrateCaptureThresholds, loadImage, prepareCrop, selectDecisionThresholds

backendRoot = Path(__file__).resolve().parents[2]
labelValues = {"normal", "anomaly", "capture_fault", "wrong_object"}
minimumBankImages = 20
minimumCalibrationNormals = 10
minimumCalibrationAnomalies = 5


def stable_fraction(text: str, seed: str) -> float:
    return int(hashlib.sha256(f"{seed}:{text}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def partition_development(rows: list[dict], labels: dict[str, str], bank_fraction: float, seed: str) -> tuple[list[dict], list[dict]]:
    """Normal images of ~bank_fraction of the normal parts form the memory bank; everything else calibrates.
    Grouping by physicalPartId keeps every view of a part on one side."""
    # AI Assisted Logic
    normalParts = sorted({row["physicalPartId"] for row in rows if labels[row["image"]] == "normal"})
    bankParts = {part for part in normalParts if stable_fraction(part, seed) < bank_fraction}
    bank = [row for row in rows if row["physicalPartId"] in bankParts and labels[row["image"]] == "normal"]
    calibration = [row for row in rows if row["physicalPartId"] not in bankParts]
    return bank, calibration


def development_rows(manifest_path: Path, images: Path, labels_path: Path) -> tuple[list[dict], dict[str, str], dict]:
    manifest = json.loads(manifest_path.read_text())
    validate_manifest(manifest, images)
    rows = [row for row in manifest["items"] if row["split"] == "development"]
    labels = json.loads(labels_path.read_text())
    missing = [row["image"] for row in rows if row["image"] not in labels]
    if missing:
        raise ValueError(f"{len(missing)} development images have no development label, e.g. {missing[:3]}")
    testImages = {row["image"] for row in manifest["items"] if row["split"] == "test"}
    if testImages & set(labels):
        raise ValueError("The development label file contains test images; keep test labels with the custodian only")
    unknown = {value for value in labels.values()} - labelValues
    if unknown:
        raise ValueError(f"Unsupported labels {sorted(unknown)}")
    return rows, labels, manifest


def build(args) -> dict:
    # AI Assisted Logic
    rows, labels, manifest = development_rows(args.manifest, args.images, args.dev_labels)
    bank, calibration = partition_development(rows, labels, args.bank_fraction, args.seed)
    calNormals = [row for row in calibration if labels[row["image"]] == "normal"]
    calAnomalies = [row for row in calibration if labels[row["image"]] == "anomaly"]
    calWrong = [row for row in calibration if labels[row["image"]] == "wrong_object"]
    if len(bank) < minimumBankImages or len(calNormals) < minimumCalibrationNormals:
        raise ValueError(f"Need at least {minimumBankImages} bank and {minimumCalibrationNormals} calibration normal images; have {len(bank)} and {len(calNormals)}")
    if len(calAnomalies) < minimumCalibrationAnomalies and not args.allow_normal_only:
        raise ValueError(f"Only {len(calAnomalies)} development defect images; a FAIL threshold cannot be validated. "
                         "Collect more defects or pass --allow-normal-only (FAIL threshold then marked unvalidated)")
    args.output_dir.mkdir(parents=True, exist_ok=False)
    featurePath = buildFeatureModel(args.backbone, args.output_dir / "featureExtractor.onnx")
    extractor = OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(featurePath), inputSize=args.input_size))
    memoryBank, _, locateFailures = buildMemoryBank(extractor, args.images, bank, args.input_size, args.scoring_mask, args.coreset_size, np.random.default_rng(7))
    bankPath = args.output_dir / "memoryBank.npz"
    memoryBank.save(bankPath)
    scorer = PatchCoreScorer(extractor, memoryBank)
    scored = {}
    metricsByImage = {}
    for row in calibration:
        crop, cropMask, _, metrics = prepareCrop(loadImage(args.images, row["image"]), args.input_size, args.scoring_mask)
        metricsByImage[row["image"]] = metrics
        if crop is not None:
            result = scorer.score(crop, cropMask)
            scored[row["image"]] = (result.imageScore, result.identityDistance)
    capture = calibrateCaptureThresholds([metricsByImage[row["image"]] for row in calNormals if metricsByImage[row["image"]].partFound])
    gateOutcomes = Counter(f"{labels[row['image']]}:{evaluateCaptureGates(metricsByImage[row['image']], capture).reasonCode}" for row in calibration)
    normalScores = [scored[row["image"]][0] for row in calNormals if row["image"] in scored]
    anomalyScores = [scored[row["image"]][0] for row in calAnomalies if row["image"] in scored]
    if len(anomalyScores) >= minimumCalibrationAnomalies:
        decision = selectDecisionThresholds(normalScores, anomalyScores)
        thresholdBasis = "validated on development normals and defects"
    else:
        top = float(max(normalScores))
        decision = {"passBelow": float(np.nextafter(top, np.inf)), "failAtOrAbove": top * 1.5, "hasReviewBand": True}
        thresholdBasis = "NORMAL-ONLY: PASS limited to the calibration-normal range; FAIL threshold NOT validated on defects"
    targetIdentity = [scored[row["image"]][1] for row in calNormals + calAnomalies if row["image"] in scored]
    wrongIdentity = [scored[row["image"]][1] for row in calWrong if row["image"] in scored]
    identityMax = float(max(targetIdentity))
    identityNoPart = float(min(wrongIdentity)) if wrongIdentity and min(wrongIdentity) > identityMax else 2.0
    profile = {
        "profileId": args.profile_id,
        "version": datetime.now(timezone.utc).strftime("%Y.%m.%d"),
        "task": f"Stationary inspection of {args.component_name} (owner development data)",
        "domainNote": "Development profile for one owner-supplied component and station. Not validated until a sealed, independent test is run.",
        "backbone": {"file": str(args.backbone), "sha256": featureBackbone.sha256, "source": featureBackbone.downloadUrl, "license": featureBackbone.license},
        "featureModel": {"file": featurePath.name, "sha256": computeSha256(featurePath), "source": "derived by buildFeatureModel", "license": featureBackbone.license},
        "memoryBank": {"file": bankPath.name, "sha256": computeSha256(bankPath), "source": f"{len(bank)} development normal images from {len({r['physicalPartId'] for r in bank})} parts", "license": "owner data"},
        "outputNames": list(defaultOutputNames),
        "preprocessing": {"inputSize": args.input_size, "mean": list(imagenetMean), "std": list(imagenetStd), "scoringMask": args.scoring_mask},
        "capture": capture.toDict(),
        "decision": {"passBelow": float(decision["passBelow"]), "failAtOrAbove": float(decision["failAtOrAbove"]), "identityMaxDistance": identityMax,
                     "identityNoPartMinDistance": identityNoPart, "regionThreshold": float(decision["passBelow"]), "missedDefectTarget": 0.02, "falseRejectTarget": 0.02},
        "decisionPolicy": 2,
        "dataset": {"name": args.component_name, "manifestSha256": computeSha256(args.manifest), "developmentLabelsSha256": computeSha256(args.dev_labels),
                    "provenance": manifest.get("provenance"), "custodian": manifest.get("custodian")},
        "validationSummary": {"thresholdBasis": thresholdBasis, "bankImages": len(bank), "calibrationNormals": len(calNormals),
                              "calibrationDefects": len(calAnomalies), "calibrationWrongObjects": len(calWrong),
                              "identityNoPartBasis": "closest development wrong object" if identityNoPart < 2.0 else "no wrong-object examples: unrecognized objects go to REVIEW, not NO_PART"},
    }
    (args.output_dir / "inspectionProfile.json").write_text(json.dumps(profile, indent=2) + "\n")
    report = {"status": "DEVELOPMENT_PROFILE_NOT_VALIDATED", "createdAt": datetime.now(timezone.utc).isoformat(), "partitionSeed": args.seed,
              "bankParts": sorted({r["physicalPartId"] for r in bank}), "calibrationParts": sorted({r["physicalPartId"] for r in calibration}),
              "bankLocateFailures": locateFailures, "calibrationGateOutcomes": dict(gateOutcomes), "thresholds": profile["decision"], "thresholdBasis": thresholdBasis,
              "next": "Commit code, then run frozenProtocol seal with this profile before predicting any test image."}
    (args.output_dir / "developmentReport.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def fit_check(args) -> dict:
    """Run an existing profile on development photos (labels optional) and summarize decisions."""
    from ..inspection.evidenceStore import LocalEvidenceStore
    from ..inspection.inspectionPipeline import InspectionPipeline
    import tempfile

    manifest = json.loads(args.manifest.read_text())
    rows = [row for row in manifest["items"] if row["split"] == "development"]
    pipeline = InspectionPipeline(args.profile, LocalEvidenceStore(Path(tempfile.mkdtemp(prefix="motionqa-fitcheck-"))))
    if not pipeline.isReady:
        raise ValueError(f"Profile not ready: {pipeline.loadError}")
    outcomes = Counter()
    for row in rows:
        outcome = pipeline.analyze(loadImage(args.images, row["image"]))
        outcomes[f"{outcome.decision.value}:{outcome.reasonCode}"] += 1
    gated = sum(count for key, count in outcomes.items() if key.startswith(("RETAKE", "NO_PART")))
    summary = {"profile": pipeline.profile.profileId, "developmentImages": len(rows), "outcomes": dict(outcomes),
               "gatedFraction": round(gated / max(1, len(rows)), 3),
               "interpretation": "Mostly RETAKE/NO_PART means this profile does not fit the station or component; build a new profile."}
    print(json.dumps(summary, indent=2))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("fit-check")
    p.add_argument("--profile", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--images", type=Path, required=True)
    p = sub.add_parser("build")
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--images", type=Path, required=True)
    p.add_argument("--dev-labels", type=Path, required=True, help="Private JSON: development image -> normal | anomaly | capture_fault | wrong_object")
    p.add_argument("--profile-id", required=True)
    p.add_argument("--component-name", required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--backbone", type=Path, default=backendRoot / "models" / "image_classification_mobilenetv2_2022apr.onnx")
    p.add_argument("--input-size", type=int, default=448)
    p.add_argument("--scoring-mask", choices=("hull", "dilated", "full"), default="dilated")
    p.add_argument("--coreset-size", type=int, default=16000)
    p.add_argument("--bank-fraction", type=float, default=0.7)
    p.add_argument("--seed", default="motionqa-dev-partition")
    p.add_argument("--allow-normal-only", action="store_true")
    args = parser.parse_args()
    if args.action == "fit-check":
        fit_check(args)
    else:
        print(json.dumps(build(args), indent=2))


if __name__ == "__main__":
    main()
