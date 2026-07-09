import { describe, expect, it } from "vitest";
import { calculateSummaryMetrics, retainRecentEvents } from "./qcMetrics";
import type { LiveQcEvent } from "../types/qcTypes";

const baseEvent: LiveQcEvent = {
  eventId: "evt-12345678",
  componentCode: "LINE_KARAWANG_01-1",
  lineId: "LINE_KARAWANG_01",
  defectFound: "none",
  confidenceScore: "0.000",
  status: "PASSED",
  detectedAt: "2026-07-09T10:00:00.000Z",
  frameNumber: 1,
  frameWidth: 1920,
  frameHeight: 1080,
  fps: 30,
};

// AI Assisted Logic
describe("qcMetrics", () => {
  it("calculates fail rate from trend buckets", () => {
    const result = calculateSummaryMetrics([
      {
        bucketStart: "2026-07-09T10:00:00.000Z",
        lineId: "LINE_KARAWANG_01",
        passedCount: 8,
        failedCount: 2,
        castingDefectCount: 1,
        scratchCount: 1,
        dimensionalDeviationCount: 0,
      },
    ]);

    expect(result.totalCount).toBe(10);
    expect(result.failRate).toBe(0.2);
  });

  it("deduplicates live stream events", () => {
    const result = retainRecentEvents([baseEvent], baseEvent, 10);
    expect(result).toHaveLength(1);
  });
});
