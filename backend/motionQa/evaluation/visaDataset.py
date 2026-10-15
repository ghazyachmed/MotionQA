"""Prepare the VisA `pcb1` benchmark task from the AWS Open Data archive.

Source: s3://amazon-visual-anomaly/VisA_20220922.tar (registry.opendata.aws/visa), CC BY 4.0.
Citation: Zou et al., "SPot-the-Difference Self-Supervised Pre-training for Anomaly Detection and
Segmentation", ECCV 2022, arXiv:2207.14315.
"""
import argparse
import csv
import json
import tarfile
from pathlib import Path, PurePosixPath
import numpy as np
from ..edge.modelRegistry import computeSha256

repoRoot = Path(__file__).resolve().parents[3]
archiveUrl = "https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar"
archiveSizeBytes = 1_929_840_640
archiveSha256 = "2eb8690c803ab37de0324772964100169ec8ba1fa3f7e94291c9ca673f40f362"
targetCategory = "pcb1"
otherCategories = ("candle", "capsules", "cashew", "chewinggum", "fryum", "macaroni1", "pcb2", "pcb3", "pcb4", "pipe_fryum")
otherImagesPerCategory = 10
validationNormalCount = 100
splitSeed = 20261015


def isSafeMember(member: tarfile.TarInfo) -> bool:
    memberPath = PurePosixPath(member.name)
    return member.isfile() and not memberPath.is_absolute() and ".." not in memberPath.parts


def selectMembers(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    # AI Assisted Logic
    selected: list[tarfile.TarInfo] = []
    otherCounts = {category: 0 for category in otherCategories}
    for member in archive:
        if not isSafeMember(member):
            continue
        parts = PurePosixPath(member.name).parts
        if parts[0] in ("LICENSE-DATASET", "split_csv") or parts[0] == targetCategory:
            selected.append(member)
            continue
        if parts[0] in otherCounts and len(parts) >= 4 and parts[1:4] == ("Data", "Images", "Normal") and otherCounts[parts[0]] < otherImagesPerCategory:
            otherCounts[parts[0]] += 1
            selected.append(member)
    return selected


def extractArchive(archivePath: Path, outputDir: Path) -> dict[str, object]:
    archiveDigest = computeSha256(archivePath)
    if archiveSha256 and archiveDigest != archiveSha256:
        raise RuntimeError(f"VisA archive checksum mismatch: {archiveDigest}")
    outputDir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archivePath, "r:") as archive:
        members = selectMembers(archive)
    with tarfile.open(archivePath, "r:") as archive:
        archive.extractall(outputDir, members=members, filter="data")
    return {"archiveSha256": archiveDigest, "archiveBytes": archivePath.stat().st_size, "extractedFiles": len(members)}


def readOfficialSplit(datasetDir: Path) -> list[dict[str, str]]:
    with (datasetDir / "split_csv" / "1cls.csv").open(newline="") as handle:
        return [row for row in csv.DictReader(handle) if row["object"] == targetCategory]


def readDefectTypes(datasetDir: Path) -> dict[str, str]:
    with (datasetDir / targetCategory / "image_anno.csv").open(newline="") as handle:
        return {row["image"]: row["label"] for row in csv.DictReader(handle)}


def buildSplitManifest(datasetDir: Path) -> dict[str, object]:
    """Deterministic bank / validation / test split.

    - bank: official train normals minus a held-out validation subset (normal-only memory bank)
    - validation: held-out train normals + half of the official test anomalies (threshold selection)
    - test: official test normals + the other half of the anomalies (reported decision metrics)
    - officialTest: the unmodified official test split (threshold-free AUROC for comparability)
    VisA publishes no physical item identifiers, so correlated captures cannot be grouped.
    """
    # AI Assisted Logic
    generator = np.random.default_rng(splitSeed)
    rows = readOfficialSplit(datasetDir)
    defectTypes = readDefectTypes(datasetDir)
    trainNormals = sorted(row["image"] for row in rows if row["split"] == "train" and row["label"] == "normal")
    testNormals = sorted(row["image"] for row in rows if row["split"] == "test" and row["label"] == "normal")
    testAnomalies = sorted(row["image"] for row in rows if row["split"] == "test" and row["label"] == "anomaly")
    maskByImage = {row["image"]: row.get("mask", "") for row in rows}
    validationNormals = sorted(generator.choice(trainNormals, size=validationNormalCount, replace=False).tolist())
    bankNormals = sorted(set(trainNormals) - set(validationNormals))
    validationAnomalies: list[str] = []
    for defectType in sorted({defectTypes.get(image, "unknown") for image in testAnomalies}):
        typedImages = sorted(image for image in testAnomalies if defectTypes.get(image, "unknown") == defectType)
        shuffled = generator.permutation(typedImages).tolist()
        validationAnomalies.extend(shuffled[: len(shuffled) // 2])
    validationAnomalies = sorted(validationAnomalies)
    heldOutAnomalies = sorted(set(testAnomalies) - set(validationAnomalies))
    otherImages = sorted(str(path.relative_to(datasetDir)) for path in datasetDir.glob("*/Data/Images/Normal/*") if path.parts[-5] != targetCategory)
    shuffledOther = generator.permutation(otherImages).tolist()
    otherValidation = sorted(shuffledOther[: len(shuffledOther) // 2])
    otherTest = sorted(shuffledOther[len(shuffledOther) // 2 :])

    def describe(images: list[str], label: str) -> list[dict[str, str]]:
        return [{"image": image, "label": label, "defectType": defectTypes.get(image, "normal" if label == "normal" else "unknown"), "mask": maskByImage.get(image, "")} for image in images]

    return {
        "dataset": "VisA",
        "category": targetCategory,
        "source": archiveUrl,
        "license": "CC BY 4.0",
        "splitSeed": splitSeed,
        "splits": {
            "bank": describe(bankNormals, "normal"),
            "validation": describe(validationNormals, "normal") + describe(validationAnomalies, "anomaly"),
            "test": describe(testNormals, "normal") + describe(heldOutAnomalies, "anomaly"),
            "officialTest": describe(testNormals, "normal") + describe(testAnomalies, "anomaly"),
            "otherObjectValidation": [{"image": image, "label": "other_object"} for image in otherValidation],
            "otherObjectTest": [{"image": image, "label": "other_object"} for image in otherTest],
        },
    }


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract VisA pcb1 and write the MotionQA split manifest")
    parser.add_argument("--archive", default=str(repoRoot / "data" / "downloads" / "VisA_20220922.tar"))
    parser.add_argument("--output-dir", default=str(repoRoot / "data" / "visa"))
    parser.add_argument("--manifest", default=str(repoRoot / "evaluation" / "visaPcb1Split.json"))
    return parser.parse_args()


def main() -> None:
    args = parseArgs()
    outputDir = Path(args.output_dir)
    extraction = extractArchive(Path(args.archive), outputDir)
    manifest = buildSplitManifest(outputDir)
    manifest["archive"] = extraction
    manifestPath = Path(args.manifest)
    manifestPath.parent.mkdir(parents=True, exist_ok=True)
    manifestPath.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"manifest": str(manifestPath), **extraction, **{name: len(items) for name, items in manifest["splits"].items()}}, indent=2))


if __name__ == "__main__":
    main()
