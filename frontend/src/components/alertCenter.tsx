import { AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDefect, formatPercent, formatTime } from "../lib/qcFormat";
import type { LiveQcEvent } from "../types/qcTypes";

interface AlertCenterProps {
  events: LiveQcEvent[];
}

// AI Assisted Logic
export function AlertCenter({ events }: AlertCenterProps): JSX.Element {
  const failedEvents = events.filter((event) => event.status === "FAILED").slice(0, 8);

  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft">
      <div className="flex h-12 items-center justify-between border-b border-factory-line px-4">
        <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Alert Center</h2>
        <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-factory-alarm">{failedEvents.length}</span>
      </div>
      <div className="max-h-[340px] overflow-auto">
        {failedEvents.length === 0 ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm font-semibold text-factory-steel">
            <CheckCircle2 className="h-5 w-5 text-factory-pass" />
            No active defect alerts
          </div>
        ) : (
          failedEvents.map((event) => (
            <div key={event.eventId} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-factory-line px-4 py-3 last:border-b-0">
              <AlertCircle className="mt-1 h-5 w-5 text-factory-alarm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-factory-ink">{event.componentCode}</div>
                <div className="text-xs font-medium text-factory-steel">{formatDefect(event.defectFound)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-factory-alarm">{formatPercent(event.confidenceScore)}</div>
                <div className="text-xs font-medium text-factory-steel">{formatTime(event.detectedAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

