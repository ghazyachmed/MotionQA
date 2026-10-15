import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { formatReason, formatScore, formatTime } from "../lib/qcFormat";
import type { InspectionDecision, InspectionResult } from "../types/qcTypes";
import { DecisionPill } from "./statusPill";

interface ReviewQueueProps {
  pending: InspectionResult[];
  error: string | null;
  onReview: (inspectionId: string, decision: Extract<InspectionDecision, "PASS" | "FAIL">, reviewedBy: string) => Promise<unknown>;
}

// AI Assisted Logic
// Real-inference FAIL and REVIEW results waiting for a person. Simulated events never enter this queue.
export function ReviewQueue({ pending, error, onReview }: ReviewQueueProps): JSX.Element {
  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft" aria-label="Review queue">
      <div className="flex h-12 items-center justify-between border-b border-factory-line px-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-factory-teal" aria-hidden />
          <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Review queue</h2>
        </div>
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-factory-ink">{pending.length} pending</span>
      </div>
      <div className="max-h-[340px] overflow-auto">
        {error ? (
          <p className="px-4 py-6 text-sm font-semibold text-factory-alarm" role="alert">
            {error}
          </p>
        ) : pending.length === 0 ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm font-semibold text-factory-steel">
            <CheckCircle2 className="h-5 w-5 text-factory-pass" aria-hidden />
            Nothing waiting for review
          </div>
        ) : (
          pending.map((inspection) => (
            <div key={inspection.inspectionId} className="grid gap-2 border-b border-factory-line px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <DecisionPill decision={inspection.decision} size="sm" />
                <span className="text-xs font-medium text-factory-steel">{formatTime(inspection.capturedAt)}</span>
              </div>
              <div className="min-w-0 text-sm">
                <div className="truncate font-bold text-factory-ink" title={inspection.inspectionId}>
                  {inspection.componentId ?? inspection.inspectionId}
                </div>
                <div className="text-xs text-factory-steel">
                  {formatReason(inspection.reasonCode)} · score {formatScore(inspection.scores.anomalyScore)}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void onReview(inspection.inspectionId, "FAIL", "operator")} className="h-7 rounded bg-factory-alarm px-2 text-xs font-bold text-white">
                  Confirm FAIL
                </button>
                <button type="button" onClick={() => void onReview(inspection.inspectionId, "PASS", "operator")} className="h-7 rounded bg-factory-pass px-2 text-xs font-bold text-white">
                  Accept PASS
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
