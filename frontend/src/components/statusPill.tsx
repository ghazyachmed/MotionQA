import { AlertTriangle, CheckCircle2, Loader2, Wifi, WifiOff } from "lucide-react";
import type { InspectionStatus } from "../types/qcTypes";

interface StatusPillProps {
  status: InspectionStatus | "WAITING";
}

// AI Assisted Logic
export function StatusPill({ status }: StatusPillProps): JSX.Element {
  if (status === "FAILED") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-alarm px-3 text-sm font-semibold text-white">
        <AlertTriangle className="h-4 w-4" />
        FAILED
      </span>
    );
  }
  if (status === "PASSED") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-pass px-3 text-sm font-semibold text-white">
        <CheckCircle2 className="h-4 w-4" />
        PASSED
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-steel px-3 text-sm font-semibold text-white">
      <Loader2 className="h-4 w-4 animate-spin" />
      WAITING
    </span>
  );
}

interface ConnectionPillProps {
  state: "CONNECTING" | "OPEN" | "CLOSED" | "ERROR";
}

export function ConnectionPill({ state }: ConnectionPillProps): JSX.Element {
  const isOpen = state === "OPEN";
  return (
    <span
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
        isOpen ? "bg-factory-teal text-white" : "bg-factory-amber text-white"
      }`}
    >
      {isOpen ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {state}
    </span>
  );
}

