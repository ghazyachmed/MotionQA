import { AlertCenter } from "./components/alertCenter";
import { CameraDemoControls } from "./components/cameraDemoControls";
import { ComponentTelemetry } from "./components/componentTelemetry";
import { DefectTrendAnalytics } from "./components/defectTrendAnalytics";
import { LiveQcMonitor } from "./components/liveQcMonitor";
import { ConnectionPill } from "./components/statusPill";
import { useCameraDemo } from "./hooks/useCameraDemo";
import { useDefectTrends } from "./hooks/useDefectTrends";
import { useQcStream } from "./hooks/useQcStream";

function getDefaultApiBaseUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function getDefaultWsBaseUrl(): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.hostname}:8000`;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl();
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL ?? getDefaultWsBaseUrl();

// AI Assisted Logic
export function App(): JSX.Element {
  const { currentEvent, recentEvents, connectionState } = useQcStream(`${wsBaseUrl}/ws/qc-stream`);
  const { buckets, isLoading } = useDefectTrends(apiBaseUrl, currentEvent?.lineId ?? "LINE_KARAWANG_01");
  const cameraDemo = useCameraDemo(apiBaseUrl);

  return (
    <main className="min-h-screen bg-[#ebe8df] text-factory-ink">
      <header className="border-b border-factory-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <h1 className="text-2xl font-black tracking-normal text-factory-ink">MotionQA</h1>
            <p className="mt-1 text-sm font-semibold text-factory-steel">AHM Karawang Live Quality Monitor</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CameraDemoControls
              cameraState={cameraDemo.cameraState}
              cameraMode={cameraDemo.cameraMode}
              videoDevices={cameraDemo.videoDevices}
              selectedDeviceId={cameraDemo.selectedDeviceId}
              setCameraMode={cameraDemo.setCameraMode}
              setCameraDevice={cameraDemo.setCameraDevice}
              publishPhoto={cameraDemo.publishPhoto}
              startCamera={cameraDemo.startCamera}
              stopCamera={cameraDemo.stopCamera}
            />
            <ConnectionPill state={connectionState} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:px-6">
        <LiveQcMonitor event={currentEvent} cameraVideoRef={cameraDemo.videoRef} isCameraEnabled={cameraDemo.isCameraEnabled} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(360px,0.38fr)]">
          <DefectTrendAnalytics buckets={buckets} isLoading={isLoading} />
          <AlertCenter events={recentEvents} />
        </div>
        <ComponentTelemetry events={recentEvents} />
      </div>
    </main>
  );
}
