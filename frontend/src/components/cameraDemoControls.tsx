import { Aperture, ImageUp, SlidersHorizontal, Video, VideoOff } from "lucide-react";
import { useRef, useState } from "react";
import type { CameraDemoMode } from "../lib/cameraDemoAnalysis";
import type { CameraDevice, CameraState } from "../hooks/useCameraDemo";
import type { ProcessingMode } from "../types/qcTypes";

interface CaptureControlsProps {
  processingMode: ProcessingMode;
  cameraState: CameraState;
  cameraMode: CameraDemoMode;
  videoDevices: CameraDevice[];
  selectedDeviceId: string;
  isSubmitting: boolean;
  componentId: string;
  setComponentId: (componentId: string) => void;
  setCameraMode: (mode: CameraDemoMode) => void;
  setCameraDevice: (deviceId: string) => void;
  onPhoto: (file: File) => Promise<void>;
  onCaptureAndInspect: () => Promise<void>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

const demoScenarios: Array<{ label: string; value: CameraDemoMode }> = [
  { label: "Heuristic (auto)", value: "auto" },
  { label: "Forced: OK part", value: "none" },
  { label: "Forced: scratch", value: "scratch" },
  { label: "Forced: casting", value: "casting_defect" },
];

// AI Assisted Logic
export function CaptureControls({
  processingMode,
  cameraState,
  cameraMode,
  videoDevices,
  selectedDeviceId,
  isSubmitting,
  componentId,
  setComponentId,
  setCameraMode,
  setCameraDevice,
  onPhoto,
  onCaptureAndInspect,
  startCamera,
  stopCamera,
}: CaptureControlsProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoadingPhoto, setIsLoadingPhoto] = useState(false);
  const isReal = processingMode === "REAL_INFERENCE";
  const isOpen = cameraState === "OPEN";
  const isStarting = cameraState === "STARTING";
  const isBusy = isLoadingPhoto || isSubmitting;

  const handlePhotoChange = async (fileList: FileList | null): Promise<void> => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }
    setIsLoadingPhoto(true);
    try {
      await onPhoto(file);
    } finally {
      setIsLoadingPhoto(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isReal ? (
        <label className="inline-flex h-9 items-center">
          <span className="sr-only">Component ID (optional)</span>
          <input
            value={componentId}
            onChange={(event) => setComponentId(event.target.value)}
            placeholder="Component ID (optional)"
            pattern="[A-Za-z0-9][A-Za-z0-9._:-]{2,79}"
            className="h-9 w-48 rounded-md border border-factory-line bg-white px-3 text-sm font-semibold text-factory-ink placeholder:text-factory-steel"
          />
        </label>
      ) : (
        <label className="relative inline-flex h-9 items-center">
          <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-factory-steel" aria-hidden />
          <select
            value={cameraMode}
            onChange={(event) => setCameraMode(event.target.value as CameraDemoMode)}
            className="h-9 rounded-md border border-factory-line bg-white pl-9 pr-3 text-sm font-bold text-factory-ink"
            aria-label="Simulated demo scenario"
          >
            {demoScenarios.map((scenario) => (
              <option key={scenario.value} value={scenario.value}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {videoDevices.length > 1 ? (
        <label className="relative inline-flex h-9 max-w-56 items-center">
          <Video className="pointer-events-none absolute left-3 h-4 w-4 text-factory-steel" aria-hidden />
          <select
            value={selectedDeviceId}
            onChange={(event) => setCameraDevice(event.target.value)}
            className="h-9 w-full rounded-md border border-factory-line bg-white pl-9 pr-3 text-sm font-bold text-factory-ink"
            aria-label="Camera device"
          >
            {videoDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => (isOpen ? stopCamera() : void startCamera())}
        disabled={isStarting}
        className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white ${isOpen ? "bg-factory-alarm" : "bg-factory-teal"} disabled:cursor-wait disabled:bg-factory-steel`}
      >
        {isOpen ? <VideoOff className="h-4 w-4" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
        {isOpen ? "Stop camera" : isStarting ? "Starting" : "Camera"}
      </button>
      {isReal && isOpen ? (
        <button
          type="button"
          onClick={() => void onCaptureAndInspect()}
          disabled={isBusy}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-ink px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-factory-steel"
        >
          <Aperture className="h-4 w-4" aria-hidden />
          {isSubmitting ? "Inspecting" : "Capture & inspect"}
        </button>
      ) : null}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => void handlePhotoChange(event.currentTarget.files)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-ink px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-factory-steel"
      >
        <ImageUp className="h-4 w-4" aria-hidden />
        {isBusy ? "Working" : isReal ? "Inspect photo" : "Demo photo"}
      </button>
    </div>
  );
}
