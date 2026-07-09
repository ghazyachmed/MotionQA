import { SlidersHorizontal, Video, VideoOff } from "lucide-react";
import type { CameraDemoMode } from "../lib/cameraDemoAnalysis";

interface CameraDemoControlsProps {
  cameraState: "IDLE" | "STARTING" | "OPEN" | "ERROR";
  cameraMode: CameraDemoMode;
  setCameraMode: (mode: CameraDemoMode) => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

const cameraModes: Array<{ label: string; value: CameraDemoMode }> = [
  { label: "Scratch", value: "scratch" },
  { label: "Casting", value: "casting_defect" },
  { label: "Dimensional", value: "dimensional_deviation" },
  { label: "Pass", value: "none" },
  { label: "Auto", value: "auto" },
];

// AI Assisted Logic
export function CameraDemoControls({
  cameraState,
  cameraMode,
  setCameraMode,
  startCamera,
  stopCamera,
}: CameraDemoControlsProps): JSX.Element {
  const isOpen = cameraState === "OPEN";
  const isStarting = cameraState === "STARTING";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex h-9 items-center">
        <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-factory-steel" />
        <select
          value={cameraMode}
          onChange={(event) => setCameraMode(event.target.value as CameraDemoMode)}
          className="h-9 rounded-md border border-factory-line bg-white pl-9 pr-3 text-sm font-bold text-factory-ink shadow-soft"
          aria-label="Camera demo mode"
        >
          {cameraModes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            stopCamera();
            return;
          }
          void startCamera();
        }}
        disabled={isStarting}
        className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white shadow-soft ${
          isOpen ? "bg-factory-alarm" : "bg-factory-teal"
        } disabled:cursor-wait disabled:bg-factory-steel`}
      >
        {isOpen ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        {isOpen ? "Stop" : isStarting ? "Starting" : "Camera"}
      </button>
    </div>
  );
}
