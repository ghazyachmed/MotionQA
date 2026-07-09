import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeCameraFrame, type CameraDemoMode } from "../lib/cameraDemoAnalysis";
import type { LiveQcEvent } from "../types/qcTypes";

interface CameraDemoState {
  videoRef: RefObject<HTMLVideoElement>;
  isCameraEnabled: boolean;
  cameraState: "IDLE" | "STARTING" | "OPEN" | "ERROR";
  cameraMode: CameraDemoMode;
  setCameraMode: (mode: CameraDemoMode) => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
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
  const [cameraMode, setCameraMode] = useState<CameraDemoMode>("scratch");

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

    await fetch(`${apiBaseUrl}/api/v1/live-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  }, [apiBaseUrl, cameraMode]);

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

  const startCamera = useCallback(async () => {
    try {
      setCameraState("STARTING");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
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
  }, [publishFrame, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return useMemo(
    () => ({
      videoRef,
      isCameraEnabled: cameraState === "OPEN" || cameraState === "STARTING",
      cameraState,
      cameraMode,
      setCameraMode,
      startCamera,
      stopCamera,
    }),
    [cameraMode, cameraState, startCamera, stopCamera],
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
