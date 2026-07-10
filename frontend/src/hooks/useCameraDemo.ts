import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeCameraFrame, type CameraDemoMode } from "../lib/cameraDemoAnalysis";
import type { LiveQcEvent } from "../types/qcTypes";

interface CameraDemoState {
  videoRef: RefObject<HTMLVideoElement>;
  isCameraEnabled: boolean;
  cameraState: "IDLE" | "STARTING" | "OPEN" | "ERROR";
  cameraMode: CameraDemoMode;
  videoDevices: CameraDevice[];
  selectedDeviceId: string;
  setCameraMode: (mode: CameraDemoMode) => void;
  setCameraDevice: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  publishPhoto: (file: File) => Promise<void>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

const lineId = "LINE_KARAWANG_01";

// AI Assisted Logic
export function useCameraDemo(apiBaseUrl: string): CameraDemoState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const frameNumberRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const [cameraState, setCameraState] = useState<CameraDemoState["cameraState"]>("IDLE");
  const [cameraMode, setCameraMode] = useState<CameraDemoMode>("auto");
  const [videoDevices, setVideoDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const loadVideoDevices = useCallback(async (): Promise<CameraDevice[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextDevices = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
    setVideoDevices(nextDevices);
    setSelectedDeviceId((currentDeviceId) => {
      if (currentDeviceId && nextDevices.some((device) => device.deviceId === currentDeviceId)) {
        return currentDeviceId;
      }
      return selectPreferredDeviceId(nextDevices) ?? "";
    });
    return nextDevices;
  }, []);

  const refreshDevices = useCallback(async () => {
    await loadVideoDevices();
  }, [loadVideoDevices]);

  const publishLiveEvent = useCallback(
    async (event: LiveQcEvent) => {
      await fetch(`${apiBaseUrl}/api/v1/live-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    },
    [apiBaseUrl],
  );

  const publishFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const canvas = document.createElement("canvas");
    const sampleWidth = 320;
    const sampleHeight = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * sampleWidth));
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const decision = analyzeCameraFrame(context.getImageData(0, 0, sampleWidth, sampleHeight), cameraMode);
    frameNumberRef.current += 1;
    const currentTime = performance.now();
    const elapsedMs = Math.max(1, currentTime - lastFrameTimeRef.current);
    lastFrameTimeRef.current = currentTime;
    const fps = 1000 / elapsedMs;
    const timestamp = new Date().toISOString();
    const event: LiveQcEvent = {
      eventId: crypto.randomUUID(),
      componentCode: `${lineId}-CAMERA-${timestamp.replace(/\D/g, "")}-${frameNumberRef.current}`,
      lineId,
      defectFound: decision.defectFound,
      confidenceScore: decision.confidenceScore.toFixed(3),
      status: decision.status,
      detectedAt: timestamp,
      imageSnapshotUrl: null,
      boundingBox: scaleBoundingBox(decision.boundingBox, sampleWidth, sampleHeight, video.videoWidth, video.videoHeight),
      frameNumber: frameNumberRef.current,
      frameWidth: video.videoWidth,
      frameHeight: video.videoHeight,
      fps,
    };

    await publishLiveEvent(event);
  }, [cameraMode, publishLiveEvent]);

  const publishPhoto = useCallback(
    async (file: File) => {
      const bitmap = await createImageBitmap(file);
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / bitmap.width);
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();
      const decision = analyzeCameraFrame(context.getImageData(0, 0, targetWidth, targetHeight), cameraMode);
      frameNumberRef.current += 1;
      const timestamp = new Date().toISOString();
      await publishLiveEvent({
        eventId: crypto.randomUUID(),
        componentCode: `${lineId}-PHOTO-${timestamp.replace(/\D/g, "")}-${frameNumberRef.current}`,
        lineId,
        defectFound: decision.defectFound,
        confidenceScore: decision.confidenceScore.toFixed(3),
        status: decision.status,
        detectedAt: timestamp,
        imageSnapshotUrl: canvas.toDataURL("image/jpeg", 0.82),
        boundingBox: decision.boundingBox,
        frameNumber: frameNumberRef.current,
        frameWidth: targetWidth,
        frameHeight: targetHeight,
        fps: 1,
      });
    },
    [cameraMode, publishLiveEvent],
  );

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState("IDLE");
  }, []);

  const startCameraWithDevice = useCallback(async (deviceIdOverride?: string) => {
    try {
      setCameraState("STARTING");
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const nextDevices = await loadVideoDevices();
      const resolvedDeviceId = deviceIdOverride || selectedDeviceId || selectPreferredDeviceId(nextDevices) || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: createVideoConstraints(resolvedDeviceId),
      });
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
      lastFrameTimeRef.current = performance.now();
      setCameraState("OPEN");
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      timerRef.current = window.setInterval(() => {
        void publishFrame().catch(() => setCameraState("ERROR"));
      }, 1200);
      await publishFrame();
    } catch {
      stopCamera();
      setCameraState("ERROR");
    }
  }, [loadVideoDevices, publishFrame, selectedDeviceId, stopCamera]);

  const startCamera = useCallback(async () => {
    await startCameraWithDevice();
  }, [startCameraWithDevice]);

  const setCameraDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      if (streamRef.current) {
        void startCameraWithDevice(deviceId);
      }
    },
    [startCameraWithDevice],
  );

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) {
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => setCameraState("ERROR"));
  }, [cameraState]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  return useMemo(
    () => ({
      videoRef,
      isCameraEnabled: cameraState === "OPEN" || cameraState === "STARTING",
      cameraState,
      cameraMode,
      videoDevices,
      selectedDeviceId,
      setCameraMode,
      setCameraDevice,
      refreshDevices,
      publishPhoto,
      startCamera,
      stopCamera,
    }),
    [cameraMode, cameraState, publishPhoto, refreshDevices, selectedDeviceId, setCameraDevice, startCamera, stopCamera, videoDevices],
  );
}

function createVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  if (!deviceId) {
    return baseConstraints;
  }
  return {
    ...baseConstraints,
    deviceId: { exact: deviceId },
  };
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

function scaleBoundingBox(
  boundingBox: LiveQcEvent["boundingBox"],
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): LiveQcEvent["boundingBox"] {
  if (!boundingBox) {
    return null;
  }
  return {
    xMin: (boundingBox.xMin / sourceWidth) * targetWidth,
    yMin: (boundingBox.yMin / sourceHeight) * targetHeight,
    xMax: (boundingBox.xMax / sourceWidth) * targetWidth,
    yMax: (boundingBox.yMax / sourceHeight) * targetHeight,
  };
}
