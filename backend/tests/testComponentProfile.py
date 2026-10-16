"""Synthetic fixtures only: part IDs, sessions, and labels below are test data, not an owner collection."""
import json
from types import SimpleNamespace
import cv2 as cv
import numpy as np
import pytest
from motionQa.evaluation.buildComponentProfile import build, fit_check, partition_development
from motionQa.evaluation.frozenProtocol import digest
from motionQa.inspection.evidenceStore import LocalEvidenceStore
from motionQa.inspection.inspectionPipeline import InspectionPipeline
from conftest import backbonePath
from syntheticFixtures import createPartImage


def wrongObject(seed: int) -> np.ndarray:
    image = np.full((480, 640, 3), 30, np.uint8)
    cv.circle(image, (320 + seed, 240), 120, (40, 160, 230), cv.FILLED)
    return image


@pytest.fixture
def ownerCollection(tmp_path):
    # AI Assisted Logic
    if not backbonePath.is_file():
        pytest.skip("backbone not downloaded")
    images = tmp_path / "images"
    images.mkdir()
    rows, labels = [], {}

    def add(name, image, part, session, split, label):
        cv.imwrite(str(images / name), image)
        rows.append({"image": name, "sha256": digest(images / name), "physicalPartId": part, "captureSessionId": session, "split": split})
        if split == "development":
            labels[name] = label

    for index in range(40):
        add(f"dev-n{index:02d}.png", createPartImage(seed=700 + index), f"FX-N{index:02d}", f"FX-S{index % 4}", "development", "normal")
    for index in range(6):
        add(f"dev-d{index:02d}.png", createPartImage(seed=800 + index, defect=True), f"FX-D{index:02d}", f"FX-S{index % 4}", "development", "anomaly")
    for index in range(3):
        add(f"dev-w{index:02d}.png", wrongObject(index * 7), f"FX-W{index:02d}", "FX-S0", "development", "wrong_object")
    add("test-a.png", createPartImage(seed=900), "FX-T1", "FX-T", "test", None)
    add("test-b.png", createPartImage(seed=901, defect=True), "FX-T2", "FX-T", "test", None)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"provenance": "synthetic fixture", "custodian": "fixture", "testPreviouslyUsedForDevelopment": False, "items": rows}))
    devLabels = tmp_path / "dev-labels.json"
    devLabels.write_text(json.dumps(labels))
    return SimpleNamespace(root=tmp_path, images=images, manifest=manifest, devLabels=devLabels, labels=labels, rows=rows)


def buildArgs(collection, outputName="profile", allowNormalOnly=False):
    return SimpleNamespace(manifest=collection.manifest, images=collection.images, dev_labels=collection.devLabels, profile_id="fixture-component",
                           component_name="synthetic fixture part", output_dir=collection.root / outputName, backbone=backbonePath, input_size=224,
                           scoring_mask="hull", coreset_size=2000, bank_fraction=0.6, seed="fixture", allow_normal_only=allowNormalOnly)


def testPartitionKeepsPartsTogether(ownerCollection):
    rows = [r for r in ownerCollection.rows if r["split"] == "development"]
    bank, calibration = partition_development(rows, ownerCollection.labels, 0.6, "fixture")
    assert {r["physicalPartId"] for r in bank}.isdisjoint({r["physicalPartId"] for r in calibration})
    assert all(ownerCollection.labels[r["image"]] == "normal" for r in bank)


def testBuildsLoadableDevelopmentProfileWithoutReadingTestRows(ownerCollection, tmp_path):
    report = build(buildArgs(ownerCollection))
    profilePath = ownerCollection.root / "profile" / "inspectionProfile.json"
    profile = json.loads(profilePath.read_text())
    assert report["status"] == "DEVELOPMENT_PROFILE_NOT_VALIDATED"
    assert profile["decisionPolicy"] == 2 and profile["decision"]["passBelow"] <= profile["decision"]["failAtOrAbove"]
    assert "test-a.png" not in json.dumps(report) and "FX-T1" not in json.dumps(report)
    pipeline = InspectionPipeline(profilePath, LocalEvidenceStore(tmp_path / "evidence"))
    assert pipeline.isReady, pipeline.loadError
    # An empty, darker-than-calibrated station may be RETAKE (exposure) or NO_PART; never PASS or FAIL.
    assert pipeline.analyze(np.full((480, 640, 3), 30, np.uint8)).decision.value in ("NO_PART", "RETAKE")


def testRefusesTestLabelsAndTooFewDefects(ownerCollection):
    leaky = json.loads(ownerCollection.devLabels.read_text())
    leaky["test-a.png"] = "normal"
    ownerCollection.devLabels.write_text(json.dumps(leaky))
    with pytest.raises(ValueError, match="test images"):
        build(buildArgs(ownerCollection, "leaky"))
    labels = {k: v for k, v in leaky.items() if not k.startswith(("test-", "dev-d"))}
    ownerCollection.devLabels.write_text(json.dumps(labels))
    rows = [r for r in ownerCollection.rows if not r["image"].startswith("dev-d")]
    ownerCollection.manifest.write_text(json.dumps({"provenance": "p", "custodian": "c", "testPreviouslyUsedForDevelopment": False, "items": rows}))
    with pytest.raises(ValueError, match="FAIL threshold cannot be validated"):
        build(buildArgs(ownerCollection, "nodefects"))
    report = build(buildArgs(ownerCollection, "normalonly", allowNormalOnly=True))
    assert report["thresholdBasis"].startswith("NORMAL-ONLY")


def testFitCheckSummarizesExistingProfile(ownerCollection, syntheticProfilePath):
    summary = fit_check(SimpleNamespace(profile=syntheticProfilePath, manifest=ownerCollection.manifest, images=ownerCollection.images))
    assert summary["developmentImages"] == 49 and sum(summary["outcomes"].values()) == 49
