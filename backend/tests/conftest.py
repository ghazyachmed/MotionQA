import json
import sys
from pathlib import Path
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
backendRoot = Path(__file__).resolve().parents[1]
backbonePath = backendRoot / "models" / "image_classification_mobilenetv2_2022apr.onnx"


@pytest.fixture(scope="session")
def syntheticProfilePath(tmp_path_factory) -> Path:
    """A real-artifact profile built from synthetic images: exercises the code path, says nothing about accuracy."""
    # AI Assisted Logic
    if not backbonePath.is_file():
        pytest.skip("backbone not downloaded; run python -m motionQa.edge.modelRegistry --download-feature-backbone --model-dir models")
    import cv2 as cv
    from motionQa.edge.modelRegistry import computeSha256, featureBackbone
    from motionQa.inspection.anomalyScorer import MemoryBank, PatchCoreScorer, computeGlobalFeature
    from motionQa.inspection.captureQuality import cropPartSquare, locatePart, measureCapture
    from motionQa.inspection.featureExtractor import FeatureModelSpec, OpenCvFeatureExtractor, buildFeatureModel
    from syntheticFixtures import createPartImage

    profileDir = tmp_path_factory.mktemp("profile")
    featurePath = buildFeatureModel(backbonePath, profileDir / "featureExtractor.onnx")
    extractor = OpenCvFeatureExtractor(FeatureModelSpec(modelPath=str(featurePath), inputSize=224))
    embedder = PatchCoreScorer(extractor, MemoryBank(np.zeros((1, 128), np.float32), np.zeros((1, 128), np.float32)))

    def prepare(image):
        location = locatePart(image)
        crop, mask, _ = cropPartSquare(image, location)
        return cv.resize(crop, (224, 224), interpolation=cv.INTER_AREA), cv.resize(mask, (224, 224), interpolation=cv.INTER_NEAREST)

    patches, globals_ = [], []
    for seed in range(10):
        crop, mask = prepare(createPartImage(seed=seed))
        embeddings, patchMask = embedder.embed(crop, mask)
        patches.append(embeddings.reshape(-1, 128)[patchMask.reshape(-1)])
        globals_.append(computeGlobalFeature(embeddings, patchMask))
    bank = MemoryBank(np.concatenate(patches), np.stack(globals_))
    bankPath = profileDir / "memoryBank.npz"
    bank.save(bankPath)
    scorer = PatchCoreScorer(extractor, bank)
    normalScores = [scorer.score(*prepare(createPartImage(seed=100 + seed))).imageScore for seed in range(4)]
    defectScores = [scorer.score(*prepare(createPartImage(seed=200 + seed, defect=True))).imageScore for seed in range(4)]
    passBelow = max(normalScores) * 1.05
    failAtOrAbove = max(passBelow, min(defectScores) * 0.95)
    metrics = measureCapture(createPartImage(), locatePart(createPartImage()))
    profile = {
        "profileId": "synthetic-test-profile",
        "version": "test",
        "task": "synthetic software test",
        "domainNote": "synthetic images; no accuracy meaning",
        "backbone": {"file": str(backbonePath), "sha256": featureBackbone.sha256, "source": "test", "license": "Apache-2.0"},
        "featureModel": {"file": featurePath.name, "sha256": computeSha256(featurePath), "source": "test", "license": "Apache-2.0"},
        "memoryBank": {"file": bankPath.name, "sha256": computeSha256(bankPath), "source": "synthetic", "license": "n/a"},
        "outputNames": ["365", "426"],
        "preprocessing": {"inputSize": 224, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225], "scoringMask": "hull"},
        "capture": {
            "minFrameMeanLuminance": 0.03,
            "maxFrameMeanLuminance": 0.9,
            "maxFrameDarkFraction": 0.5,
            "maxFrameBrightFraction": 0.3,
            "minPartContrast": metrics.partContrast * 0.5,
            "minPartAreaFraction": metrics.partAreaFraction * 0.7,
            "maxPartAreaFraction": min(0.95, metrics.partAreaFraction * 1.3),
            "minBackgroundLuminance": metrics.backgroundMedianLuminance * 0.6,
            "maxBackgroundLuminance": 0.9,
            "minEdgeSharpness": metrics.edgeSharpness * 0.6,
        },
        "decision": {"passBelow": passBelow, "failAtOrAbove": failAtOrAbove, "identityMaxDistance": 0.5, "regionThreshold": passBelow, "missedDefectTarget": 0.02, "falseRejectTarget": 0.02},
        "dataset": {"name": "synthetic"},
    }
    profilePath = profileDir / "inspectionProfile.json"
    profilePath.write_text(json.dumps(profile))
    return profilePath
