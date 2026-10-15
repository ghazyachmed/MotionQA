"""Run the public-benchmark demo against a running MotionQA API and record what actually happens.

    MOTIONQA_TOKEN=... python -m motionQa.evaluation.runLocalDemo --api http://127.0.0.1:8000 --output ../artifacts/local-demo-001

Images: the six contact-sheet photos plus reused-test-split images chosen to show each outcome the exploratory
evaluation recorded (including a missed defect), and one synthetic blur of a test image. Outcomes are recorded as
returned; nothing is expected or hardcoded. This is a demonstration, not an evaluation: every image has already been
used in development (see developmentUse in the output).
"""
import argparse
import json
import os
import platform
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
import httpx

repoRoot = Path(__file__).resolve().parents[3]
demoImages = [
    ("pcb1/Data/Images/Normal/0000.JPG", "contact sheet"),
    ("pcb1/Data/Images/Normal/0001.JPG", "contact sheet"),
    ("pcb1/Data/Images/Normal/0002.JPG", "contact sheet"),
    ("pcb1/Data/Images/Anomaly/000.JPG", "contact sheet"),
    ("pcb1/Data/Images/Anomaly/001.JPG", "contact sheet"),
    ("pcb1/Data/Images/Anomaly/002.JPG", "contact sheet"),
    ("pcb1/Data/Images/Normal/0011.JPG", "reused test split: normal case"),
    ("pcb1/Data/Images/Normal/0027.JPG", "reused test split: borderline normal"),
    ("pcb1/Data/Images/Anomaly/048.JPG", "reused test split: defect the exploratory run missed"),
    ("pcb1/Data/Images/Anomaly/043.JPG", "reused test split: severe missing-part defect"),
]


def load_development_use() -> dict[str, list[str]]:
    membership: dict[str, list[str]] = {}
    for split, items in json.loads((repoRoot / "evaluation" / "visaPcb1Split.json").read_text())["splits"].items():
        for item in items:
            membership.setdefault(item["image"], []).append(split)
    return membership


def blurred_copy(path: Path) -> bytes:
    import cv2 as cv

    image = cv.imread(str(path), cv.IMREAD_COLOR)
    blurred = cv.GaussianBlur(image, (0, 0), max(image.shape[:2]) * 0.006)
    ok, encoded = cv.imencode(".jpg", blurred, [cv.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("JPEG encoding failed")
    return encoded.tobytes()


def main() -> None:
    # AI Assisted Logic
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--dataset", type=Path, default=repoRoot / "data" / "visa")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--hardware", default=f"{platform.machine()} {platform.platform()}")
    args = parser.parse_args()
    token = os.environ.get("MOTIONQA_TOKEN")
    if not token:
        raise SystemExit("Set MOTIONQA_TOKEN to an operator token (never pass it on the command line)")
    args.output.mkdir(parents=True, exist_ok=False)
    headers = {"Authorization": f"Bearer {token}"}
    membership = load_development_use()
    runId = uuid.uuid4().hex[:8]
    records = []
    with httpx.Client(base_url=args.api, timeout=60) as client:
        status = client.get("/api/v1/model/status").json()
        inputs = [(name, why, (args.dataset / name).read_bytes(), False) for name, why in demoImages]
        inputs.append((demoImages[6][0], "SYNTHETIC blur of a reused test image (capture-fault demo)", blurred_copy(args.dataset / demoImages[6][0]), True))
        for index, (name, why, payload, isSynthetic) in enumerate(inputs):
            inspectionId = f"demo-{runId}-{index:02d}"
            started = time.perf_counter()
            response = client.post("/api/v1/inspections", headers=headers, files={"image": (Path(name).name, payload, "image/jpeg")}, data={"inspectionId": inspectionId})
            roundTripMs = (time.perf_counter() - started) * 1000
            body = response.json()
            record = {"image": name, "selectionReason": why, "syntheticDegradation": isSynthetic, "developmentUse": membership.get(name, ["unknown"]),
                      "httpStatus": response.status_code, "clientRoundTripMs": round(roundTripMs, 1)}
            if response.status_code in (200, 201):
                record.update({key: body[key] for key in ("inspectionId", "decision", "reasonCode", "processingMode", "modelId", "modelVersion")})
                record["anomalyScore"] = body["scores"].get("anomalyScore")
                record["identityDistance"] = body["scores"].get("identityDistance")
                record["serverLatencyMs"] = body["latency"]
                evidence = client.get(f"/api/v1/inspections/{inspectionId}/evidence/overlay", headers=headers)
                record["evidenceHttpStatus"] = evidence.status_code
                if evidence.status_code == 200:
                    evidencePath = args.output / f"{index:02d}-overlay.jpg"
                    evidencePath.write_bytes(evidence.content)
                    record["evidenceFile"] = evidencePath.name
            else:
                record["error"] = body
            records.append(record)
        checks = {}
        # Resolving a REVIEW result shows that an override is stored beside, not over, the machine decision.
        reviewable = next((r for r in records if r.get("decision") == "REVIEW"), None) or next((r for r in records if r.get("decision") == "FAIL"), None)
        if reviewable:
            reviewerDecision = "PASS" if reviewable["decision"] == "REVIEW" else "FAIL"
            reviewed = client.post(f"/api/v1/inspections/{reviewable['inspectionId']}/review", headers=headers,
                                   json={"reviewerDecision": reviewerDecision, "reviewedBy": "demo-operator", "reviewerNote": "demo review action, not a ground-truth label"}).json()
            checks["reviewKeepsMachineDecision"] = {"inspectionId": reviewable["inspectionId"], "machineDecision": reviewed["decision"],
                                                    "finalDecision": reviewed["finalDecision"], "reviewStatus": reviewed["review"]["status"],
                                                    "machineDecisionUnchanged": reviewed["decision"] == reviewable["decision"]}
        checks["missingTokenStatus"] = client.get("/api/v1/inspections").status_code
        checks["invalidUploadStatus"] = client.post("/api/v1/inspections", headers=headers, files={"image": ("note.txt", b"not an image", "text/plain")}).status_code
        retry = client.post("/api/v1/inspections", headers=headers, files={"image": ("retry.jpg", inputs[6][2], "image/jpeg")}, data={"inspectionId": records[6]["inspectionId"]})
        checks["retrySameInspectionId"] = {"httpStatus": retry.status_code, "idempotentReplay": retry.headers.get("Idempotent-Replay")}
    result = {"createdAt": datetime.now(timezone.utc).isoformat(), "status": "PUBLIC_BENCHMARK_DEMO_NOT_EVALUATION",
              "qualification": "Every image was already used in development (bank, validation, or the reused test split). Outcomes are illustrative and must not be counted as accuracy.",
              "hardware": args.hardware, "api": args.api, "modelStatus": status, "records": records, "checks": checks,
              "latencyNote": "clientRoundTripMs includes HTTP upload, server processing, database write and response; serverLatencyMs.inferenceMs is the model step only."}
    (args.output / "demo_results.json").write_text(json.dumps(result, indent=2) + "\n")
    for record in records:
        print(f"{record['image']:<36} {record.get('decision', record['httpStatus']):<8} {record.get('reasonCode', ''):<42} roundTrip={record['clientRoundTripMs']}ms")
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
