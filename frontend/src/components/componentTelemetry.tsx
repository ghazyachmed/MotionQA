import { Rows3 } from "lucide-react";
import { formatDecision, formatReason, formatScore, formatTime } from "../lib/qcFormat";
import type { InspectionResult, ProcessingMode } from "../types/qcTypes";
import { DecisionPill } from "./statusPill";

interface TraceabilityLogProps {
  events: InspectionResult[];
  processingMode: ProcessingMode;
}

// AI Assisted Logic
export function TraceabilityLog({ events, processingMode }: TraceabilityLogProps): JSX.Element {
  const isReal = processingMode === "REAL_INFERENCE";
  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft" aria-label="Traceability log">
      <div className="flex h-12 items-center justify-between gap-2 border-b border-factory-line px-4">
        <div className="flex items-center gap-2">
          <Rows3 className="h-4 w-4 text-factory-teal" aria-hidden />
          <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Traceability log</h2>
        </div>
        <span className="text-xs font-semibold text-factory-steel">{isReal ? "Real inference records" : "Simulated demo records"} from this session</span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-factory-panel text-xs uppercase tracking-normal text-factory-steel">
            <tr>
              <th className="w-28 px-4 py-3">Time</th>
              <th className="w-64 px-4 py-3">Inspection / component</th>
              <th className="w-40 px-4 py-3">Decision</th>
              <th className="w-72 px-4 py-3">Reason</th>
              <th className="w-24 px-4 py-3">{isReal ? "Score" : "Heuristic"}</th>
              <th className="w-32 px-4 py-3">Review</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-28 px-4 text-center font-semibold text-factory-steel">
                  No {isReal ? "real inspections" : "simulated events"} received yet
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.inspectionId} className="border-t border-factory-line">
                  <td className="px-4 py-3 font-medium text-factory-steel">{formatTime(event.capturedAt)}</td>
                  <td className="truncate px-4 py-3" title={event.inspectionId}>
                    <div className="truncate font-bold text-factory-ink">{event.componentId ?? event.inspectionId}</div>
                    {event.componentId ? <div className="truncate text-xs text-factory-steel">{event.inspectionId}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <DecisionPill decision={event.finalDecision} size="sm" />
                  </td>
                  <td className="truncate px-4 py-3 text-factory-ink" title={event.reasonDetail}>
                    {formatReason(event.reasonCode)}
                  </td>
                  <td className="px-4 py-3 font-bold text-factory-ink">{formatScore(isReal ? event.scores.anomalyScore : event.scores.heuristicScore)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-factory-steel">
                    {event.review.status === "OVERRIDDEN" ? `Overridden (was ${formatDecision(event.decision)})` : event.review.status.replace("_", " ").toLowerCase()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
