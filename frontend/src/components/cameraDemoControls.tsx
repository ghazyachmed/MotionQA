import { ImageUp, SlidersHorizontal, Video, VideoOff } from "lucide-react";
import { useRef, useState } from "react";
import type { CameraDemoMode } from "../lib/cameraDemoAnalysis";
import type { CameraDevice } from "../hooks/useCameraDemo";

interface CameraDemoControlsProps {
  cameraState: "IDLE" | "STARTING" | "OPEN" | "ERROR";
  cameraMode: CameraDemoMode;
  videoDevices: CameraDevice[];
  selectedDeviceId: string;
  setCameraMode: (mode: CameraDemoMode) => void;
  setCameraDevice: (deviceId: string) => void;
  publishPhoto: (file: File) => Promise<void>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

const cameraModes: Array<{ label: string; value: CameraDemoMode }> = [
  { label: "Auto QC", value: "auto" },
  { label: "OK Part", value: "none" },
  { label: "Scratch", value: "scratch" },
  { label: "Casting", value: "casting_defect" },
];

// AI Assisted Logic
export function CameraDemoControls({
  cameraState,
  cameraMode,
  videoDevices,
  selectedDeviceId,
  setCameraMode,
  setCameraDevice,
  publishPhoto,
  startCamera,
  stopCamera,
}: CameraDemoControlsProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isOpen = cameraState === "OPEN";
  const isStarting = cameraState === "STARTING";

  const handlePhotoChange = async (fileList: FileList | null): Promise<void> => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    try {
      await publishPhoto(file);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

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
      {videoDevices.length > 0 ? (
        <label className="relative inline-flex h-9 max-w-56 items-center">
          <Video className="pointer-events-none absolute left-3 h-4 w-4 text-factory-steel" />
          <select
            value={selectedDeviceId}
            onChange={(event) => setCameraDevice(event.target.value)}
            className="h-9 w-full rounded-md border border-factory-line bg-white pl-9 pr-3 text-sm font-bold text-factory-ink shadow-soft"
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handlePhotoChange(event.currentTarget.files);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-factory-ink px-3 text-sm font-semibold text-white shadow-soft disabled:cursor-wait disabled:bg-factory-steel"
      >
        <ImageUp className="h-4 w-4" />
        {isUploading ? "Loading" : "Photo"}
      </button>
    </div>
  );
}
