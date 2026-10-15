import { Cpu, FlaskConical, KeyRound } from "lucide-react";
import { useState } from "react";
import type { ModelStatus, ProcessingMode } from "../types/qcTypes";

interface ModeBarProps {
  processingMode: ProcessingMode;
  setProcessingMode: (mode: ProcessingMode) => void;
  modelStatus: ModelStatus | null;
  modelStatusError: string | null;
  token: string;
  setToken: (token: string) => void;
}

// AI Assisted Logic
// The single, persistent provenance indicator for the whole page. Cards do not repeat it.
export function ModeBar({ processingMode, setProcessingMode, modelStatus, modelStatusError, token, setToken }: ModeBarProps): JSX.Element {
  const isReal = processingMode === "REAL_INFERENCE";
  const [draftToken, setDraftToken] = useState("");
  const modelText = modelStatusError
    ? `Backend unavailable: ${modelStatusError}`
    : !modelStatus
      ? "Checking model…"
      : modelStatus.ready
        ? `${modelStatus.profileId} v${modelStatus.profileVersion} · OpenCV ${modelStatus.opencv.version} · ${modelStatus.domainNote ?? ""}`
        : `Model unavailable: inspections return ERROR. ${modelStatus.loadError ?? ""}`;

  return (
    <div className={`border-b ${isReal ? "border-teal-800 bg-teal-900 text-white" : "border-amber-500 bg-amber-300 text-factory-ink"}`} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="inline-flex rounded-md border border-black/20 bg-black/10 p-0.5" role="radiogroup" aria-label="Processing mode">
            <ModeButton isActive={isReal} onClick={() => setProcessingMode("REAL_INFERENCE")} icon={<Cpu className="h-4 w-4" aria-hidden />} label="REAL INFERENCE" />
            <ModeButton isActive={!isReal} onClick={() => setProcessingMode("SIMULATED_DEMO")} icon={<FlaskConical className="h-4 w-4" aria-hidden />} label="SIMULATED DEMO" />
          </div>
          <p className="min-w-0 truncate text-sm font-semibold" title={isReal ? modelText : undefined}>
            {isReal ? modelText : "Browser pixel heuristics and forced scenarios. Not a model; events are stored as SIMULATED_DEMO and excluded from metrics."}
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setToken(draftToken);
            setDraftToken("");
          }}
        >
          <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
          <label className="sr-only" htmlFor="operatorToken">
            Operator token
          </label>
          <input
            id="operatorToken"
            type="password"
            autoComplete="off"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            placeholder={token ? "Token set for this tab" : "Operator token"}
            className="h-8 w-44 rounded border border-black/20 bg-white px-2 text-sm text-factory-ink placeholder:text-factory-steel"
          />
          <button type="submit" className="h-8 rounded bg-factory-ink px-3 text-xs font-bold text-white">
            {token ? "Replace" : "Set"}
          </button>
          {token ? (
            <button type="button" onClick={() => setToken("")} className="h-8 rounded border border-black/20 px-2 text-xs font-bold">
              Clear
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}

interface ModeButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
}

function ModeButton({ isActive, onClick, icon, label }: ModeButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-black tracking-wide ${isActive ? "bg-white text-factory-ink shadow" : "text-current opacity-80 hover:opacity-100"}`}
    >
      {icon}
      {label}
    </button>
  );
}
