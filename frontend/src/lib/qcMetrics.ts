import { inspectionDecisions, type DecisionTrendBucket, type InspectionDecision, type InspectionResult } from "../types/qcTypes";

export interface SummaryMetrics {
  counts: Record<InspectionDecision, number>;
  totalCount: number;
  automaticCount: number;
  failShareOfAutomatic: number;
  reviewRate: number;
  recaptureRate: number;
}

// AI Assisted Logic
export function calculateSummaryMetrics(buckets: DecisionTrendBucket[]): SummaryMetrics {
  const counts = Object.fromEntries(inspectionDecisions.map((decision) => [decision, 0])) as Record<InspectionDecision, number>;
  buckets.forEach((bucket) => {
    inspectionDecisions.forEach((decision) => {
      counts[decision] += bucket.counts[decision] ?? 0;
    });
  });
  const totalCount = inspectionDecisions.reduce((sum, decision) => sum + counts[decision], 0);
  const automaticCount = counts.PASS + counts.FAIL;
  return {
    counts,
    totalCount,
    automaticCount,
    failShareOfAutomatic: automaticCount > 0 ? counts.FAIL / automaticCount : 0,
    reviewRate: totalCount > 0 ? counts.REVIEW / totalCount : 0,
    recaptureRate: totalCount > 0 ? (counts.RETAKE + counts.NO_PART) / totalCount : 0,
  };
}

export function retainRecentEvents(events: InspectionResult[], event: InspectionResult, limit: number): InspectionResult[] {
  const remaining = events.filter((currentEvent) => currentEvent.inspectionId !== event.inspectionId);
  return [event, ...remaining].slice(0, limit);
}

export function isInspectionResult(value: unknown): value is InspectionResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<InspectionResult>;
  return (
    typeof candidate.inspectionId === "string" &&
    typeof candidate.decision === "string" &&
    inspectionDecisions.includes(candidate.decision) &&
    (candidate.processingMode === "REAL_INFERENCE" || candidate.processingMode === "SIMULATED_DEMO")
  );
}
