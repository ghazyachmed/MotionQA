import { describe, expect, it } from "vitest";
import { calculateSummaryMetrics, isInspectionResult, retainRecentEvents } from "./qcMetrics";
import type { InspectionResult } from "../types/qcTypes";

const baseEvent: InspectionResult = {
  inspectionId: "insp-0001",
  lineId: "LINE_01",
  stationId: "STATION_01",
  capturedAt: "2026-10-15T10:00:00.000Z",
  processedAt: "2026-10-15T10:00:00.200Z",
  decision: "PASS",
  finalDecision: "PASS",
  reasonCode: "ANOMALY_SCORE_BELOW_PASS_THRESHOLD",
  reasonDetail: "",
  processingMode: "REAL_INFERENCE",
  modelId: "visa-pcb1-patchcore-mnv2",
  modelVersion: "2026.10.15",
  defectFound: "none",
  scores: { anomalyScore: 1.2 },
  thresholds: { passBelow: 2, failAtOrAbove: 3 },
  regions: [],
  evidence: [],
  latency: { decodeMs: 1, captureChecksMs: 1, inferenceMs: 1, evidenceMs: 1, totalMs: 4 },
  imageWidth: 100,
  imageHeight: 100,
  review: { status: "NOT_REQUIRED" },
};

// AI Assisted Logic
describe("qcMetrics", () => {
  it("summarizes decision buckets without treating REVIEW or RETAKE as pass or fail", () => {
    const result = calculateSummaryMetrics([
      { bucketStart: "2026-10-15T10:00:00.000Z", lineId: "LINE_01", counts: { PASS: 6, FAIL: 2, REVIEW: 1, RETAKE: 1, NO_PART: 0, ERROR: 0 } },
    ]);
    expect(result.totalCount).toBe(10);
    expect(result.automaticCount).toBe(8);
    expect(result.failShareOfAutomatic).toBe(0.25);
    expect(result.reviewRate).toBe(0.1);
    expect(result.recaptureRate).toBe(0.1);
  });

  it("deduplicates by inspection id and keeps the newest copy", () => {
    const reviewed = { ...baseEvent, finalDecision: "FAIL" as const };
    const result = retainRecentEvents([baseEvent], reviewed, 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.finalDecision).toBe("FAIL");
  });

  it("rejects malformed stream payloads", () => {
    expect(isInspectionResult(baseEvent)).toBe(true);
    expect(isInspectionResult({ ...baseEvent, decision: "PASSED" })).toBe(false);
    expect(isInspectionResult({ ...baseEvent, processingMode: "UNKNOWN" })).toBe(false);
    expect(isInspectionResult(null)).toBe(false);
  });
});
