import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { formatPercent } from "../lib/qcFormat";
import { calculateSummaryMetrics } from "../lib/qcMetrics";
import type { DefectTrendBucket } from "../types/qcTypes";

interface DefectTrendAnalyticsProps {
  buckets: DefectTrendBucket[];
  isLoading: boolean;
}

// AI Assisted Logic
export function DefectTrendAnalytics({ buckets, isLoading }: DefectTrendAnalyticsProps): JSX.Element {
  const summary = useMemo(() => calculateSummaryMetrics(buckets), [buckets]);
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.passedCount + bucket.failedCount));

  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft">
      <div className="flex h-12 items-center justify-between border-b border-factory-line px-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-factory-teal" />
          <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Defect Trend</h2>
        </div>
        <span className="text-xs font-bold text-factory-steel">{isLoading ? "SYNCING" : "LIVE"}</span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[180px_1fr]">
        <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
          <TrendStat label="Units" value={String(summary.totalCount)} />
          <TrendStat label="Failed" value={String(summary.failedCount)} />
          <TrendStat label="Fail Rate" value={formatPercent(summary.failRate)} />
        </div>
        <div className="flex h-44 items-end gap-2 overflow-hidden rounded border border-factory-line bg-factory-panel p-3">
          {buckets.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-factory-steel">No trend data</div>
          ) : (
            buckets.slice(-30).map((bucket) => {
              const totalCount = bucket.passedCount + bucket.failedCount;
              const failedHeight = Math.max(3, (bucket.failedCount / maxTotal) * 100);
              const passedHeight = Math.max(3, (bucket.passedCount / maxTotal) * 100);
              return (
                <div key={`${bucket.lineId}-${bucket.bucketStart}`} className="flex h-full min-w-3 flex-1 flex-col justify-end gap-1">
                  <div className="rounded-sm bg-factory-alarm" style={{ height: `${failedHeight}%` }} title={`Failed ${bucket.failedCount}`} />
                  <div className="rounded-sm bg-factory-pass" style={{ height: `${passedHeight}%` }} title={`Passed ${bucket.passedCount}`} />
                  <span className="sr-only">{totalCount}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

interface TrendStatProps {
  label: string;
  value: string;
}

function TrendStat({ label, value }: TrendStatProps): JSX.Element {
  return (
    <div className="rounded border border-factory-line bg-factory-panel p-3">
      <div className="text-xs font-bold uppercase tracking-normal text-factory-steel">{label}</div>
      <div className="mt-1 text-2xl font-black text-factory-ink">{value}</div>
    </div>
  );
}

