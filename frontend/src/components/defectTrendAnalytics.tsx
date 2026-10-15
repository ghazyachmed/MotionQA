import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { formatDecision, formatPercent } from "../lib/qcFormat";
import { calculateSummaryMetrics } from "../lib/qcMetrics";
import { inspectionDecisions, type DecisionTrendBucket, type InspectionDecision } from "../types/qcTypes";

interface DecisionTrendProps {
  buckets: DecisionTrendBucket[];
  isLoading: boolean;
  error: string | null;
}

const decisionBarColors: Record<InspectionDecision, string> = {
  PASS: "bg-factory-pass",
  FAIL: "bg-factory-alarm",
  REVIEW: "bg-amber-500",
  RETAKE: "bg-sky-700",
  NO_PART: "bg-stone-500",
  ERROR: "bg-purple-800",
};

// AI Assisted Logic
export function DecisionTrend({ buckets, isLoading, error }: DecisionTrendProps): JSX.Element {
  const summary = useMemo(() => calculateSummaryMetrics(buckets), [buckets]);
  const maxTotal = Math.max(1, ...buckets.map((bucket) => inspectionDecisions.reduce((sum, decision) => sum + (bucket.counts[decision] ?? 0), 0)));

  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft" aria-label="Decision trend">
      <div className="flex h-12 items-center justify-between border-b border-factory-line px-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-factory-teal" aria-hidden />
          <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Decisions, last 4 h</h2>
        </div>
        <span className="text-xs font-bold text-factory-steel">Real inference only{isLoading ? " · syncing" : ""}</span>
      </div>
      {error ? (
        <p className="px-4 py-6 text-sm font-semibold text-factory-alarm" role="alert">
          {error}
        </p>
      ) : (
        <div className="grid gap-4 p-4 md:grid-cols-[200px_1fr]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
            <TrendStat label="Inspections" value={String(summary.totalCount)} />
            <TrendStat label="FAIL / automatic" value={formatPercent(summary.failShareOfAutomatic)} />
            <TrendStat label="Review rate" value={formatPercent(summary.reviewRate)} />
            <TrendStat label="Retake + no part" value={formatPercent(summary.recaptureRate)} />
          </div>
          <div>
            <div className="flex h-44 items-end gap-1 overflow-hidden rounded border border-factory-line bg-factory-panel p-3">
              {buckets.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-factory-steel">No real inspections in this window</div>
              ) : (
                buckets.slice(-40).map((bucket) => (
                  <div key={`${bucket.lineId}-${bucket.bucketStart}`} className="flex h-full min-w-2 flex-1 flex-col justify-end" title={`${bucket.bucketStart}: ${inspectionDecisions.map((decision) => `${decision} ${bucket.counts[decision] ?? 0}`).join(", ")}`}>
                    {inspectionDecisions.map((decision) =>
                      (bucket.counts[decision] ?? 0) > 0 ? <div key={decision} className={decisionBarColors[decision]} style={{ height: `${((bucket.counts[decision] ?? 0) / maxTotal) * 100}%` }} /> : null,
                    )}
                  </div>
                ))
              )}
            </div>
            <ul className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-factory-steel">
              {inspectionDecisions.map((decision) => (
                <li key={decision} className="inline-flex items-center gap-1">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${decisionBarColors[decision]}`} aria-hidden />
                  {formatDecision(decision)} {summary.counts[decision]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function TrendStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-factory-line bg-factory-panel p-3">
      <div className="text-xs font-bold uppercase tracking-normal text-factory-steel">{label}</div>
      <div className="mt-1 text-2xl font-black text-factory-ink">{value}</div>
    </div>
  );
}
