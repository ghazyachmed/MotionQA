"""Compare two inspection profiles on every development image, through InspectionPipeline.analyze.

    python -m motionQa.evaluation.comparePolicies \
      --old models/visaPcb1/inspectionProfile.policy1.json --new models/visaPcb1/inspectionProfile.json \
      --output ../evaluation/results/policyComparison-p1-vs-p2.json

All VisA images here have influenced development (memory bank, validation, or the reused test split), so the output
describes behaviour changes on development data, not accuracy on new parts.
"""
import argparse
import json
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from ..inspection.evidenceStore import LocalEvidenceStore
from ..inspection.inspectionPipeline import InspectionPipeline
from .runEvaluation import degradationKinds, degradeImage, loadImage

repoRoot = Path(__file__).resolve().parents[3]
decisions = ("PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR")


def developmentItems(splits: dict) -> list[dict]:
    # AI Assisted Logic
    items = [{"image": it["image"], "stratum": "bank", "label": "normal"} for it in splits["bank"]]
    for split in ("validation", "test"):
        items += [{"image": it["image"], "stratum": split, "label": it["label"]} for it in splits[split]]
    for split in ("otherObjectValidation", "otherObjectTest"):
        items += [{"image": it["image"], "stratum": split, "label": "wrong_object"} for it in splits[split]]
    scenarioBase = [it for it in splits["test"] if it["label"] == "normal"][:40] + [it for it in splits["test"] if it["label"] == "anomaly"][:20]
    items += [{"image": it["image"], "stratum": f"synthetic_{kind}", "label": "capture_fault", "degradation": kind, "underlyingLabel": it["label"]}
              for kind in degradationKinds for it in scenarioBase]
    return items


def summarize(records: list[dict], key: str) -> dict:
    strata = {}
    for record in records:
        bucket = strata.setdefault(f"{record['stratum']}|{record['label']}", Counter())
        bucket[record[key]] += 1
    byLabel = {}
    for record in records:
        byLabel.setdefault(record["label"], Counter())[record[key]] += 1
    def count(label, decision):
        return byLabel.get(label, Counter())[decision]
    total = len(records)
    return {
        "byStratum": {name: {d: counts[d] for d in decisions} for name, counts in sorted(strata.items())},
        "byLabel": {label: {d: counts[d] for d in decisions} for label, counts in sorted(byLabel.items())},
        "falsePass": {"anomaly": count("anomaly", "PASS"), "wrong_object": count("wrong_object", "PASS"), "capture_fault": count("capture_fault", "PASS")},
        "falseFailNormal": count("normal", "FAIL"),
        "totals": {d: sum(1 for r in records if r[key] == d) for d in decisions},
        "count": total,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--old", type=Path, required=True)
    parser.add_argument("--new", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, default=repoRoot / "evaluation" / "visaPcb1Split.json")
    parser.add_argument("--dataset-dir", type=Path, default=repoRoot / "data" / "visa")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    evidence = LocalEvidenceStore(Path(tempfile.mkdtemp(prefix="motionqa-compare-")))
    pipelines = {"old": InspectionPipeline(args.old, evidence), "new": InspectionPipeline(args.new, evidence)}
    for name, pipeline in pipelines.items():
        if not pipeline.isReady:
            raise SystemExit(f"{name} profile not ready: {pipeline.loadError}")
    items = developmentItems(json.loads(args.manifest.read_text())["splits"])
    records = []
    for index, item in enumerate(items):
        image = loadImage(args.dataset_dir, item["image"])
        if "degradation" in item:
            image = degradeImage(image, item["degradation"])
        record = dict(item)
        for name, pipeline in pipelines.items():
            outcome = pipeline.analyze(image)
            record[f"{name}Decision"] = outcome.decision.value
            record[f"{name}Reason"] = outcome.reasonCode
        record["identityDistance"] = outcome.scores.get("identityDistance")
        record["anomalyScore"] = outcome.scores.get("anomalyScore")
        records.append(record)
        if index % 200 == 199:
            print(f"  {index + 1}/{len(items)}", flush=True)
    changes = [r for r in records if r["oldDecision"] != r["newDecision"]]
    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "DEVELOPMENT_DATA_BEHAVIOUR_COMPARISON_NOT_EVALUATION",
        "oldProfile": {"path": str(args.old.name), "policy": pipelines["old"].profile.decisionPolicy, "decision": pipelines["old"].profile.decision.model_dump()},
        "newProfile": {"path": str(args.new.name), "policy": pipelines["new"].profile.decisionPolicy, "decision": pipelines["new"].profile.decision.model_dump()},
        "old": summarize(records, "oldDecision"),
        "new": summarize(records, "newDecision"),
        "changedDecisions": [{key: r[key] for key in ("image", "stratum", "label", "oldDecision", "oldReason", "newDecision", "newReason", "identityDistance", "anomalyScore") if key in r} for r in changes],
        "transitionCounts": dict(Counter(f"{r['label']}: {r['oldDecision']} -> {r['newDecision']}" for r in changes)),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"count": len(records), "changed": len(changes), "transitions": result["transitionCounts"],
                      "falsePass": {"old": result["old"]["falsePass"], "new": result["new"]["falsePass"]},
                      "falseFailNormal": {"old": result["old"]["falseFailNormal"], "new": result["new"]["falseFailNormal"]},
                      "totals": {"old": result["old"]["totals"], "new": result["new"]["totals"]}}, indent=1))


if __name__ == "__main__":
    main()
