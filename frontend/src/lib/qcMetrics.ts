import type { DefectTrendBucket, LiveQcEvent } from "../types/qcTypes";

export interface SummaryMetrics {
  passedCount: number;
  failedCount: number;
  totalCount: number;
  failRate: number;
}

// AI Assisted Logic
export function calculateSummaryMetrics(buckets: DefectTrendBucket[]): SummaryMetrics {
  const totals = buckets.reduce(
    (currentTotals, bucket) => ({
      passedCount: currentTotals.passedCount + bucket.passedCount,
      failedCount: currentTotals.failedCount + bucket.failedCount,
    }),
    { passedCount: 0, failedCount: 0 },
  );
  const totalCount = totals.passedCount + totals.failedCount;
  return {
    ...totals,
    totalCount,
    failRate: totalCount > 0 ? totals.failedCount / totalCount : 0,
  };
}

export function retainRecentEvents(events: LiveQcEvent[], event: LiveQcEvent, limit: number): LiveQcEvent[] {
  if (events.some((currentEvent) => currentEvent.eventId === event.eventId)) {
    return events;
  }
  return [event, ...events].slice(0, limit);
}

