"""Prepare a prospective photo collection for frozenProtocol / frozenInference without exposing labels.

Three steps, each refusing to overwrite existing outputs:

  opaque-names  copy raw captures to random filenames; the original-name mapping stays private
  manifest      capture worksheet (no labels) -> frozenProtocol manifest with SHA-256 per image
  labels        custodian label sheet -> labels JSON for `frozenInference score` (test rows only)

The tool records what the custodian supplies. It cannot verify that photos are new, that parts are distinct,
or that labels are correct; those remain custodian attestations.
"""
import argparse
import csv
import json
import re
import secrets
import shutil
from pathlib import Path
from .frozenProtocol import digest, validate_manifest

opaqueNamePattern = re.compile(r"^img-[0-9a-f]{12}\.(jpg|jpeg|png)$")
imageSuffixes = {".jpg", ".jpeg", ".png"}
worksheetColumns = ("relativeFilename", "physicalPartId", "captureSessionId", "capturedAtUtc", "operator", "camera",
                    "lighting", "distanceCm", "view", "split")
labelLikeColumns = {"label", "groundtruth", "isanomaly", "defecttype", "defect", "decision", "result", "class"}
labelValues = {"normal", "anomaly", "capture_fault", "wrong_object"}
defectOrigins = {"none", "natural", "introduced", "simulated"}


def opaque_names(raw_dir: Path, images_out: Path, mapping_out: Path) -> int:
    # AI Assisted Logic
    sources = sorted(p for p in raw_dir.rglob("*") if p.is_file() and p.suffix.lower() in imageSuffixes)
    if not sources:
        raise ValueError(f"No JPEG/PNG captures found under {raw_dir}")
    images_out.mkdir(parents=True, exist_ok=False)
    rows = []
    used = set()
    for source in sources:
        while True:
            name = f"img-{secrets.token_hex(6)}{'.jpg' if source.suffix.lower() == '.jpeg' else source.suffix.lower()}"
            if name not in used:
                used.add(name)
                break
        shutil.copy2(source, images_out / name)
        rows.append({"relativeFilename": name, "originalPath": str(source.relative_to(raw_dir)), "sha256": digest(images_out / name)})
    with mapping_out.open("x", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["relativeFilename", "originalPath", "sha256"])
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return [{key.strip(): (value or "").strip() for key, value in row.items()} for row in csv.DictReader(handle)]


def build_manifest(worksheet: Path, images: Path, custodian: str, provenance: str, attest_test_unused: bool, output: Path) -> int:
    # AI Assisted Logic
    rows = read_csv(worksheet)
    if not rows:
        raise ValueError("Worksheet has no rows")
    header = set(rows[0])
    missing = [column for column in worksheetColumns if column not in header]
    if missing:
        raise ValueError(f"Worksheet is missing columns: {missing}")
    leaked = sorted(column for column in header if column.replace("_", "").lower() in labelLikeColumns)
    if leaked:
        raise ValueError(f"Worksheet contains label-like columns {leaked}; keep labels in the custodian sheet only")
    items = []
    for row in rows:
        name = row["relativeFilename"]
        if not opaqueNamePattern.match(name):
            raise ValueError(f"{name} is not an opaque filename; run opaque-names first")
        if row["split"] not in ("development", "test"):
            raise ValueError(f"{name}: split must be development or test")
        for column in worksheetColumns:
            if not row[column]:
                raise ValueError(f"{name}: {column} is empty; record the real value or exclude the image")
        items.append({**{column: row[column] for column in worksheetColumns if column != "relativeFilename"},
                      "image": name, "sha256": digest(images / name)})
    manifest = {"provenance": provenance, "custodian": custodian, "testPreviouslyUsedForDevelopment": False if attest_test_unused else None,
                "items": items}
    validate_manifest(manifest, images)
    with output.open("x") as handle:
        json.dump(manifest, handle, indent=2)
    return len(items)


def build_labels(custodian_sheet: Path, manifest: Path, output: Path) -> int:
    # AI Assisted Logic
    test_images = {row["image"] for row in json.loads(manifest.read_text())["items"] if row["split"] == "test"}
    labels = {}
    for row in read_csv(custodian_sheet):
        name = row["relativeFilename"]
        if name not in test_images:
            continue
        if row["label"] not in labelValues:
            raise ValueError(f"{name}: label must be one of {sorted(labelValues)}")
        if row.get("defectOrigin", "none") not in defectOrigins:
            raise ValueError(f"{name}: defectOrigin must be one of {sorted(defectOrigins)}")
        if row.get("adjudicationStatus", "final") != "final":
            raise ValueError(f"{name}: label not final; adjudicate before scoring")
        labels[name] = row["label"]
    missing = sorted(test_images - set(labels))
    if missing:
        raise ValueError(f"{len(missing)} test images have no final label, e.g. {missing[:3]}")
    with output.open("x") as handle:
        json.dump(labels, handle, indent=2)
    return len(labels)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("opaque-names")
    p.add_argument("--raw-dir", type=Path, required=True)
    p.add_argument("--images-out", type=Path, required=True)
    p.add_argument("--mapping-out", type=Path, required=True)
    p = sub.add_parser("manifest")
    p.add_argument("--worksheet", type=Path, required=True)
    p.add_argument("--images", type=Path, required=True)
    p.add_argument("--custodian", required=True)
    p.add_argument("--provenance", required=True)
    p.add_argument("--attest-test-unused", action="store_true", help="Custodian attests test images never influenced development")
    p.add_argument("--output", type=Path, required=True)
    p = sub.add_parser("labels")
    p.add_argument("--custodian-sheet", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "opaque-names":
        print(f"{opaque_names(args.raw_dir, args.images_out, args.mapping_out)} images copied; keep {args.mapping_out} private")
    elif args.action == "manifest":
        print(f"{build_manifest(args.worksheet, args.images, args.custodian, args.provenance, args.attest_test_unused, args.output)} manifest rows written")
    else:
        print(f"{build_labels(args.custodian_sheet, args.manifest, args.output)} test labels written; score only after run.json exists")


if __name__ == "__main__":
    main()
