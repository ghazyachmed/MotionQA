import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeError, apiFetch } from "../lib/apiClient";
import { advanceDemoSession, analyzeCameraFrame, initialDemoSession, type CameraDemoDecision, type CameraDemoMode, type DemoSessionState } from "../lib/cameraDemoAnalysis";
import type { InspectionResult } from "../types/qcTypes";

export type CameraState = "IDLE" | "STARTING" | "OPEN" | "ERROR";

export interface PublishState {
  status: "IDLE" | "OK" | "FAILED";
  message: string;
}

interface CameraDemoState {
  videoRef: RefObject<HTMLVideoElement>;
  isCameraEnabled: boolean;
  cameraState: CameraState;
  cameraError: string | null;
  cameraMode: CameraDemoMode;
  demoEvent: InspectionResult | null;
  demoSnapshotUrl: string | null;
  publishState: PublishState;
  videoDevices: CameraDevice[];
  selectedDeviceId: string;
  setCameraMode: (mode: CameraDemoMode) => void;
  setCameraDevice: (deviceId: string) => void;
  analyzeDemoPhoto: (file: File) => Promise<void>;
  captureFrame: () => Promise<Blob | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  clearDemo: () => void;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

const cameraFrameIntervalMs = 250;

// AI Assisted Logic
export function buildDemoResult(decision: CameraDemoDecision, lineId: string, inspectionId: string, width: number, height: number): InspectionResult {
  const timestamp = new Date().toISOString();
  const resolvedDecision = decision.isInspectable ? decision.decision : "NO_PART";
  return {
    inspectionId,
    lineId,
    stationId: "BROWSER_DEMO",
    capturedAt: timestamp,
    processedAt: timestamp,
    decision: resolvedDecision,
    finalDecision: resolvedDecision,
    reasonCode: decision.isForcedScenario ? "SIMULATED_FORCED_SCENARIO" : "SIMULATED_HEURISTIC",
    reasonDetail: "Browser heuristic demo; not a model decision",
    processingMode: "SIMULATED_DEMO",
    modelId: "browser-heuristic-demo",
    modelVersion: "demo",
    defectFound: resolvedDecision === "FAIL" ? decision.defectFound : "none",
    scores: { heuristicScore: decision.heuristicScore },
    thresholds: {},
    regions: decision.boundingBox && resolvedDecision === "FAIL" ? [{ ...decision.boundingBox, peakScore: decision.heuristicScore }] : [],
    partBox: decision.componentBox,
    evidence: [],
    latency: { decodeMs: 0, captureChecksMs: 0, inferenceMs: 0, evidenceMs: 0, totalMs: 0 },
    imageWidth: width,
    imageHeight: height,
    review: { status: "NOT_REQUIRED" },
  };
}

export function useCameraDemo(apiBaseUrl: string, token: string, lineId: string, isSimulatedMode: boolean): CameraDemoState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef<DemoSessionState>(initialDemoSession);
  const [cameraState, setCameraState] = useState<CameraState>("IDLE");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraDemoMode>("auto");
  const [demoEvent, setDemoEvent] = useState<InspectionResult | null>(null);
  const [demoSnapshotUrl, setDemoSnapshotUrl] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<PublishState>({ status: "IDLE", message: "" });
  const [videoDevices, setVideoDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const loadVideoDevices = useCallback(async (): Promise<CameraDevice[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextDevices = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
    setVideoDevices(nextDevices);
    setSelectedDeviceId((currentDeviceId) => {
      if (currentDeviceId && nextDevices.some((device) => device.deviceId === currentDeviceId)) {
        return currentDeviceId;
      }
      return selectPreferredDeviceId(nextDevices) ?? "";
    });
    return nextDevices;
  }, []);

  const publishDemoEvent = useCallback(
    async (decision: CameraDemoDecision, event: InspectionResult) => {
      try {
        await apiFetch(apiBaseUrl, "/api/v1/live-events", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionId: event.inspectionId,
            lineId,
            decision: event.decision,
            defectFound: event.defectFound,
            heuristicScore: Number(decision.heuristicScore.toFixed(3)),
            isForcedScenario: decision.isForcedScenario,
            boundingBox: event.regions[0] ?? null,
            capturedAt: event.capturedAt,
            frameWidth: event.imageWidth,
            frameHeight: event.imageHeight,
          }),
        });
        setPublishState({ status: "OK", message: `Recorded ${event.inspectionId} as SIMULATED_DEMO` });
      } catch (error) {
        setPublishState({ status: "FAILED", message: `Not recorded: ${describeError(error)}` });
      }
    },
    [apiBaseUrl, lineId, token],
  );

  const analyzeVideoFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!isSimulatedMode || !video || video.readyState < 2 || video.videoWidth === 0) {
      return;
    }
    const sampleWidth = 320;
    const sampleHeight = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * sampleWidth));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const decision = analyzeCameraFrame(context.getImageData(0, 0, sampleWidth, sampleHeight), cameraMode);
    const { state, shouldPublish } = advanceDemoSession(sessionRef.current, decision.isInspectable);
    sessionRef.current = state;
    const scaled = scaleDecision(decision, sampleWidth, sampleHeight, video.videoWidth, video.videoHeight);
    const event = buildDemoResult(scaled, lineId, `demo-${crypto.randomUUID()}`, video.videoWidth, video.videoHeight);
    setDemoEvent(decision.isInspectable ? event : null);
    if (shouldPublish) {
      await publishDemoEvent(scaled, event);
    }
  }, [cameraMode, isSimulatedMode, lineId, publishDemoEvent]);

  const analyzeDemoPhoto = useCallback(
    async (file: File) => {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 960 / bitmap.width);
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        bitmap.close();
        return;
      }
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();
      const decision = analyzeCameraFrame(context.getImageData(0, 0, targetWidth, targetHeight), cameraMode);
      const event = buildDemoResult(decision, lineId, `demo-${crypto.randomUUID()}`, targetWidth, targetHeight);
      setDemoSnapshotUrl(canvas.toDataURL("image/jpeg", 0.82));
      setDemoEvent(event);
      await publishDemoEvent(decision, event);
    },
    [cameraMode, lineId, publishDemoEvent],
  );

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopCamera = useCallback(() => {
    clearTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    sessionRef.current = initialDemoSession;
    setDemoEvent(null);
    setCameraState("IDLE");
  }, []);

  const startCameraWithDevice = useCallback(
    async (deviceIdOverride?: string) => {
      try {
        setCameraState("STARTING");
        setCameraError(null);
        clearTimer();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setDemoSnapshotUrl(null);
        const nextDevices = await loadVideoDevices();
        const resolvedDeviceId = deviceIdOverride || selectedDeviceId || selectPreferredDeviceId(nextDevices) || undefined;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: createVideoConstraints(resolvedDeviceId) });
        streamRef.current = stream;
        if (resolvedDeviceId) {
          setSelectedDeviceId(resolvedDeviceId);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          await videoRef.current.play();
        }
        await loadVideoDevices();
        sessionRef.current = initialDemoSession;
        setCameraState("OPEN");
      } catch (error) {
        stopCamera();
        setCameraError(error instanceof Error ? `${error.name}: ${error.message}` : "Camera unavailable");
        setCameraState("ERROR");
      }
    },
    [loadVideoDevices, selectedDeviceId, stopCamera],
  );

  useEffect(() => {
    clearTimer();
    if (cameraState !== "OPEN" || !isSimulatedMode) {
      return;
    }
    timerRef.current = window.setInterval(() => {
      void analyzeVideoFrame();
    }, cameraFrameIntervalMs);
    return clearTimer;
  }, [analyzeVideoFrame, cameraState, isSimulatedMode]);

  useEffect(() => {
    setDemoEvent(null);
    setDemoSnapshotUrl(null);
    setPublishState({ status: "IDLE", message: "" });
    sessionRef.current = initialDemoSession;
  }, [isSimulatedMode]);

  const setCameraDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (streamRef.current) {
        void startCameraWithDevice(deviceId);
      }
    },
    [startCameraWithDevice],
  );

  const clearDemo = useCallback(() => {
    setDemoEvent(null);
    setDemoSnapshotUrl(null);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    void loadVideoDevices();
  }, [loadVideoDevices]);

  return useMemo(
    () => ({
      videoRef,
      isCameraEnabled: cameraState === "OPEN" || cameraState === "STARTING",
      cameraState,
      cameraError,
      cameraMode,
      demoEvent,
      demoSnapshotUrl,
      publishState,
      videoDevices,
      selectedDeviceId,
      setCameraMode,
      setCameraDevice,
      analyzeDemoPhoto,
      captureFrame,
      startCamera: () => startCameraWithDevice(),
      stopCamera,
      clearDemo,
    }),
    [analyzeDemoPhoto, cameraError, cameraMode, cameraState, captureFrame, clearDemo, demoEvent, demoSnapshotUrl, publishState, selectedDeviceId, setCameraDevice, startCameraWithDevice, stopCamera, videoDevices],
  );
}

function createVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
  return deviceId ? { ...baseConstraints, deviceId: { exact: deviceId } } : baseConstraints;
}

function selectPreferredDeviceId(devices: CameraDevice[]): string | null {
  if (devices.length === 0) {
    return null;
  }
  const preferredDevice = devices.find((device) => isPreferredDevice(device.label));
  if (preferredDevice) {
    return preferredDevice.deviceId;
  }
  const nonCamoDevice = devices.find((device) => !device.label.toLowerCase().includes("camo"));
  return nonCamoDevice?.deviceId ?? devices[0]?.deviceId ?? null;
}

function isPreferredDevice(label: string): boolean {
  const normalizedLabel = label.toLowerCase();
  return (
    !normalizedLabel.includes("camo") &&
    (normalizedLabel.includes("facetime") ||
      normalizedLabel.includes("built-in") ||
      normalizedLabel.includes("continuity") ||
      normalizedLabel.includes("iphone") ||
      normalizedLabel.includes("camera"))
  );
}

function scaleDecision(decision: CameraDemoDecision, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CameraDemoDecision {
  const scaleBox = (box: CameraDemoDecision["boundingBox"]) =>
    box
      ? {
          xMin: (box.xMin / sourceWidth) * targetWidth,
          yMin: (box.yMin / sourceHeight) * targetHeight,
          xMax: (box.xMax / sourceWidth) * targetWidth,
          yMax: (box.yMax / sourceHeight) * targetHeight,
        }
      : null;
  return { ...decision, boundingBox: scaleBox(decision.boundingBox), componentBox: scaleBox(decision.componentBox) };
}
