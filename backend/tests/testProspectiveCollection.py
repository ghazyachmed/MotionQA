"""Synthetic fixtures only: these IDs and labels test the tooling and describe no real parts or reviewers."""
import csv
import json
from types import SimpleNamespace
import numpy as np
import pytest
from motionQa.evaluation import frozenInference, frozenProtocol
from motionQa.evaluation.prospectiveCollection import build_labels, build_manifest, opaque_names, worksheetColumns
from syntheticFixtures import createPartImage, encodeJpeg


def writeCsv(path, rows, fieldnames):
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def collection(tmp_path):
    # AI Assisted Logic
    raw = tmp_path / "raw"
    raw.mkdir()
    captures = {
        "dev_normal_a.jpg": createPartImage(seed=401),
        "test_normal_b.jpg": createPartImage(seed=402),
        "test_defect_c.jpg": createPartImage(seed=403, defect=True),
        "test_empty_d.jpg": np.full((480, 640, 3), 30, np.uint8),
    }
    for name, image in captures.items():
        (raw / name).write_bytes(encodeJpeg(image))
    images = tmp_path / "images"
    mapping = tmp_path / "private_mapping.csv"
    assert opaque_names(raw, images, mapping) == 4
    original = {row["originalPath"]: row["relativeFilename"] for row in csv.DictReader(mapping.open())}
    parts = {"dev_normal_a.jpg": ("FIXTURE-P1", "FIXTURE-S1", "development"), "test_normal_b.jpg": ("FIXTURE-P2", "FIXTURE-S2", "test"),
             "test_defect_c.jpg": ("FIXTURE-P3", "FIXTURE-S2", "test"), "test_empty_d.jpg": ("FIXTURE-P4", "FIXTURE-S2", "test")}
    worksheet = [{"relativeFilename": original[name], "physicalPartId": part, "captureSessionId": session, "capturedAtUtc": "2026-10-16T00:00:00Z",
                  "operator": "fixture", "camera": "fixture", "lighting": "fixture", "distanceCm": "30", "view": "primary", "split": split}
                 for name, (part, session, split) in parts.items()]
    labels = {"test_normal_b.jpg": "normal", "test_defect_c.jpg": "anomaly", "test_empty_d.jpg": "wrong_object"}
    custodian = [{"relativeFilename": original[name], "label": label, "defectOrigin": "simulated" if label == "anomaly" else "none",
                  "adjudicationStatus": "final"} for name, label in labels.items()]
    writeCsv(tmp_path / "worksheet.csv", worksheet, list(worksheetColumns))
    writeCsv(tmp_path / "custodian.csv", custodian, ["relativeFilename", "label", "defectOrigin", "adjudicationStatus"])
    return SimpleNamespace(root=tmp_path, images=images, original=original)


def testOpaqueNamesHideOriginalLabels(collection):
    assert all(name.startswith("img-") and "defect" not in name and "normal" not in name for name in collection.original.values())


def testManifestRejectsLabelColumnsAndBuildsSealableRows(collection):
    leaky = collection.root / "leaky.csv"
    rows = list(csv.DictReader((collection.root / "worksheet.csv").open()))
    writeCsv(leaky, [{**row, "label": "normal"} for row in rows], list(worksheetColumns) + ["label"])
    with pytest.raises(ValueError, match="label-like"):
        build_manifest(leaky, collection.images, "fixture custodian", "fixture", True, collection.root / "m0.json")
    count = build_manifest(collection.root / "worksheet.csv", collection.images, "fixture custodian", "synthetic fixture", True, collection.root / "manifest.json")
    assert count == 4
    with pytest.raises(FileExistsError):
        build_manifest(collection.root / "worksheet.csv", collection.images, "c", "p", True, collection.root / "manifest.json")


def testLabelsRequireFinalAdjudication(collection):
    build_manifest(collection.root / "worksheet.csv", collection.images, "c", "p", True, collection.root / "manifest.json")
    rows = list(csv.DictReader((collection.root / "custodian.csv").open()))
    rows[0]["adjudicationStatus"] = "disputed"
    writeCsv(collection.root / "disputed.csv", rows, list(rows[0]))
    with pytest.raises(ValueError, match="not final"):
        build_labels(collection.root / "disputed.csv", collection.root / "manifest.json", collection.root / "l0.json")
    assert build_labels(collection.root / "custodian.csv", collection.root / "manifest.json", collection.root / "labels.json") == 3


@pytest.mark.asyncio
async def testFrozenSequenceWithRealPipeline(collection, syntheticProfilePath, tmp_path):
    """Seal -> predict with the real InspectionPipeline -> verify -> score. Synthetic profile and images."""
    root = collection.root
    build_manifest(root / "worksheet.csv", collection.images, "fixture custodian", "synthetic fixture", True, root / "manifest.json")
    build_labels(root / "custodian.csv", root / "manifest.json", root / "labels.json")
    protocol = root / "protocol.md"
    protocol.write_text("fixture protocol")
    source = tmp_path / "source"
    source.mkdir()
    (source / "frozen.py").write_text("fixture source")
    args = SimpleNamespace(manifest=root / "manifest.json", images=collection.images, profile=syntheticProfilePath, source=source,
                           protocol=protocol, seal=root / "seal.json", evidence=root / "evidence", output=root / "run")
    frozenProtocol.seal(args)
    await frozenInference.predict(args)
    run = json.loads((args.output / "run.json").read_text())
    predictions = [json.loads(line) for line in (args.output / "predictions.jsonl").read_text().splitlines()]
    assert run["count"] == 3 and run["status"] == "PREDICTIONS_FROZEN_LABELS_NOT_SCORED"
    byImage = {row["image"]: row for row in predictions}
    empty = byImage[collection.original["test_empty_d.jpg"]]
    assert empty["decision"] == "NO_PART" and empty["processingMode"] == "REAL_INFERENCE"
    assert byImage[collection.original["test_defect_c.jpg"]]["decision"] in ("FAIL", "REVIEW")
    assert all("label" not in row for row in predictions)
    scoreArgs = SimpleNamespace(run=args.output, labels=root / "labels.json", output=root / "metrics.json")
    frozenInference.score(scoreArgs)
    metrics = json.loads((root / "metrics.json").read_text())
    assert metrics["missedDefects"]["denominator"] == 1
    assert metrics["counts"]["wrong_object"]["NO_PART"] == 1
