import { AlertTriangle, Ban, Camera, CheckCircle2, CircleHelp, Loader2, Lock, ScanSearch, Wifi, WifiOff, XCircle } from "lucide-react";
import { formatDecision } from "../lib/qcFormat";
import type { StreamConnectionState } from "../hooks/useQcStream";
import type { InspectionDecision } from "../types/qcTypes";

interface DecisionPillProps {
  decision: InspectionDecision | "WAITING";
  size?: "sm" | "md";
}

const decisionStyles: Record<InspectionDecision, { className: string; icon: JSX.Element }> = {
  PASS: { className: "bg-factory-pass text-white", icon: <CheckCircle2 className="h-4 w-4" aria-hidden /> },
  FAIL: { className: "bg-factory-alarm text-white", icon: <XCircle className="h-4 w-4" aria-hidden /> },
  REVIEW: { className: "bg-amber-500 text-factory-ink", icon: <ScanSearch className="h-4 w-4" aria-hidden /> },
  RETAKE: { className: "bg-sky-700 text-white", icon: <Camera className="h-4 w-4" aria-hidden /> },
  NO_PART: { className: "bg-stone-500 text-white", icon: <Ban className="h-4 w-4" aria-hidden /> },
  ERROR: { className: "bg-purple-800 text-white", icon: <AlertTriangle className="h-4 w-4" aria-hidden /> },
};

// AI Assisted Logic
export function DecisionPill({ decision, size = "md" }: DecisionPillProps): JSX.Element {
  const sizeClass = size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm";
  if (decision === "WAITING") {
    return (
      <span className={`inline-flex items-center gap-2 rounded-md bg-factory-steel font-semibold text-white ${sizeClass}`}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Waiting
      </span>
    );
  }
  const style = decisionStyles[decision] ?? { className: "bg-factory-steel text-white", icon: <CircleHelp className="h-4 w-4" aria-hidden /> };
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md font-bold ${style.className} ${sizeClass}`} title={decision}>
      {style.icon}
      {formatDecision(decision)}
    </span>
  );
}

interface ConnectionPillProps {
  state: StreamConnectionState;
}

export function ConnectionPill({ state }: ConnectionPillProps): JSX.Element {
  const isOpen = state === "OPEN";
  const label = { OPEN: "Live stream", CONNECTING: "Connecting", CLOSED: "Stream closed", ERROR: "Stream error", UNAUTHORIZED: "Stream locked" }[state];
  return (
    <span
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${isOpen ? "bg-factory-teal text-white" : "bg-stone-200 text-factory-ink"}`}
      title={state === "UNAUTHORIZED" ? "Set the operator token to receive live events" : state}
    >
      {state === "UNAUTHORIZED" ? <Lock className="h-4 w-4" aria-hidden /> : isOpen ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
      {label}
    </span>
  );
}
