import { useCallback, useEffect, useMemo, useState } from "react";
import { ReviewQueue } from "./components/alertCenter";
import { CaptureControls } from "./components/cameraDemoControls";
import { TraceabilityLog } from "./components/componentTelemetry";
import { DecisionTrend } from "./components/defectTrendAnalytics";
import { LiveQcMonitor } from "./components/liveQcMonitor";
import { ModeBar } from "./components/modeBar";
import { ConnectionPill } from "./components/statusPill";
import { useCameraDemo } from "./hooks/useCameraDemo";
import { useDecisionTrends } from "./hooks/useDecisionTrends";
import { useEvidenceImage } from "./hooks/useEvidenceImage";
import { useOperatorToken } from "./hooks/useOperatorToken";
import { useQcStream } from "./hooks/useQcStream";
import { useRealInspection } from "./hooks/useRealInspection";
import { useReviewQueue } from "./hooks/useReviewQueue";
import type { InspectionDecision, ProcessingMode } from "./types/qcTypes";

function getDefaultApiBaseUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function getDefaultWsBaseUrl(): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.hostname}:8000`;
}

function getSameOriginWsBaseUrl(): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}`;
}

// An empty VITE_API_BASE_URL means same origin (the container build, behind the nginx proxy).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl();
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || (apiBaseUrl === "" ? getSameOriginWsBaseUrl() : getDefaultWsBaseUrl());
const lineId = import.meta.env.VITE_LINE_ID || "LINE_01";

// AI Assisted Logic
export function App(): JSX.Element {
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("REAL_INFERENCE");
  const [componentId, setComponentId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const { token, setToken } = useOperatorToken();
  const isReal = processingMode === "REAL_INFERENCE";
  const stream = useQcStream(`${wsBaseUrl}/ws/qc-stream`, token);
  const real = useRealInspection(apiBaseUrl, token, lineId);
  const camera = useCameraDemo(apiBaseUrl, token, lineId, !isReal);
  const trends = useDecisionTrends(apiBaseUrl, token, refreshKey);
  const reviewQueue = useReviewQueue(apiBaseUrl, token, refreshKey);
  const { upsertEvent } = stream;

  useEffect(() => {
    if (real.lastResult) {
      upsertEvent(real.lastResult);
      setRefreshKey((key) => key + 1);
    }
  }, [real.lastResult, upsertEvent]);

  const modeEvents = useMemo(() => stream.recentEvents.filter((event) => event.processingMode === processingMode), [processingMode, stream.recentEvents]);
  const monitorEvent = isReal ? (real.lastResult ?? modeEvents[0] ?? null) : camera.demoEvent;
  const evidence = useEvidenceImage(apiBaseUrl, token, isReal ? monitorEvent : null);

  const handleReview = useCallback(
    async (inspectionId: string, decision: Extract<InspectionDecision, "PASS" | "FAIL">, reviewedBy: string) => {
      const result = await real.reviewInspection(inspectionId, decision, reviewedBy);
      if (result) {
        upsertEvent(result);
        setRefreshKey((key) => key + 1);
      }
      return result;
    },
    [real, upsertEvent],
  );

  const handlePhoto = useCallback(
    async (file: File) => {
      if (isReal) {
        camera.stopCamera();
        await real.submitImage(file, componentId);
      } else {
        await camera.analyzeDemoPhoto(file);
      }
    },
    [camera, componentId, isReal, real],
  );

  const handleCaptureAndInspect = useCallback(async () => {
    const frame = await camera.captureFrame();
    if (frame) {
      await real.submitImage(frame, componentId);
    }
  }, [camera, componentId, real]);

  return (
    <main className="min-h-screen bg-[#ebe8df] text-factory-ink">
      <header className="border-b border-factory-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <h1 className="text-2xl font-black tracking-normal text-factory-ink">MotionQA</h1>
            <p className="mt-1 text-sm font-semibold text-factory-steel">Visual inspection with explicit uncertainty and human review</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CaptureControls
              processingMode={processingMode}
              cameraState={camera.cameraState}
              cameraMode={camera.cameraMode}
              videoDevices={camera.videoDevices}
              selectedDeviceId={camera.selectedDeviceId}
              isSubmitting={real.isSubmitting}
              componentId={componentId}
              setComponentId={setComponentId}
              setCameraMode={camera.setCameraMode}
              setCameraDevice={camera.setCameraDevice}
              onPhoto={handlePhoto}
              onCaptureAndInspect={handleCaptureAndInspect}
              startCamera={camera.startCamera}
              stopCamera={camera.stopCamera}
            />
            <ConnectionPill state={stream.connectionState} />
          </div>
        </div>
      </header>
      <ModeBar processingMode={processingMode} setProcessingMode={setProcessingMode} modelStatus={real.modelStatus} modelStatusError={real.modelStatusError} token={token} setToken={setToken} />

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4 lg:px-6">
        <LiveQcMonitor
          processingMode={processingMode}
          event={monitorEvent}
          evidenceUrl={evidence.url}
          evidenceError={isReal ? evidence.error : null}
          demoSnapshotUrl={camera.demoSnapshotUrl}
          cameraVideoRef={camera.videoRef}
          isCameraEnabled={camera.isCameraEnabled}
          cameraError={camera.cameraError}
          submitError={isReal ? real.submitError : null}
          canRetry={real.isSubmitErrorRetryable}
          isSubmitting={isReal && real.isSubmitting}
          publishState={camera.publishState}
          onRetry={real.retryLast}
          onReview={handleReview}
          session={isReal ? real.session : null}
          onNewPart={real.startNewPart}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(320px,0.38fr)]">
          <DecisionTrend buckets={trends.buckets} isLoading={trends.isLoading} error={trends.error} />
          <ReviewQueue pending={reviewQueue.pending} error={reviewQueue.error} onReview={handleReview} />
        </div>
        <TraceabilityLog events={modeEvents} processingMode={processingMode} />
      </div>
    </main>
  );
}
