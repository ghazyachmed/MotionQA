import { Rows3 } from "lucide-react";
import { formatDefect, formatPercent, formatTime } from "../lib/qcFormat";
import type { LiveQcEvent } from "../types/qcTypes";
import { StatusPill } from "./statusPill";

interface ComponentTelemetryProps {
  events: LiveQcEvent[];
}

// AI Assisted Logic
export function ComponentTelemetry({ events }: ComponentTelemetryProps): JSX.Element {
  return (
    <section className="rounded-md border border-factory-line bg-white shadow-soft">
      <div className="flex h-12 items-center gap-2 border-b border-factory-line px-4">
        <Rows3 className="h-4 w-4 text-factory-teal" />
        <h2 className="text-sm font-black uppercase tracking-normal text-factory-ink">Traceability Log</h2>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-factory-panel text-xs uppercase tracking-normal text-factory-steel">
            <tr>
              <th className="w-44 px-4 py-3">Time</th>
              <th className="w-64 px-4 py-3">Component</th>
              <th className="w-44 px-4 py-3">Defect</th>
              <th className="w-32 px-4 py-3">Confidence</th>
              <th className="w-32 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="h-28 px-4 text-center font-semibold text-factory-steel">
                  Awaiting inspection events
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.eventId} className="border-t border-factory-line">
                  <td className="px-4 py-3 font-medium text-factory-steel">{formatTime(event.detectedAt)}</td>
                  <td className="truncate px-4 py-3 font-bold text-factory-ink">{event.componentCode}</td>
                  <td className="px-4 py-3 font-semibold text-factory-ink">{formatDefect(event.defectFound)}</td>
                  <td className="px-4 py-3 font-bold text-factory-teal">{formatPercent(event.confidenceScore)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={event.status} />
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

