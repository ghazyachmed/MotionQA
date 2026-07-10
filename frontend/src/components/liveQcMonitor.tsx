import type { CSSProperties, RefObject } from "react";
import { Activity, Camera, Cpu, Gauge } from "lucide-react";
import { formatDefect, formatPercent, formatTime } from "../lib/qcFormat";
import type { LiveQcEvent } from "../types/qcTypes";
import { StatusPill } from "./statusPill";

interface LiveQcMonitorProps {
  event: LiveQcEvent | null;
  cameraVideoRef?: RefObject<HTMLVideoElement>;
  isCameraEnabled?: boolean;
}

// AI Assisted Logic
export function LiveQcMonitor({ event, cameraVideoRef, isCameraEnabled = false }: LiveQcMonitorProps): JSX.Element {
  const status = event?.status ?? "WAITING";
  const confidenceValue = event?.confidenceScore ?? "0";
  const defectText = event ? formatDefect(event.defectFound) : "None";
  const componentText = event?.componentCode ?? (isCameraEnabled ? "Awaiting component" : "No stream");
  const frameWidth = event?.frameWidth && event.frameWidth > 0 ? event.frameWidth : 1920;
  const frameHeight = event?.frameHeight && event.frameHeight > 0 ? event.frameHeight : 1080;
  const mediaFrameStyle = getMediaFrameStyle(frameWidth, frameHeight);

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
      <div className="overflow-hidden rounded-md border border-factory-line bg-factory-ink text-white shadow-soft">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-teal-300" />
            {event?.lineId ?? "LINE_KARAWANG_01"}
          </div>
          <StatusPill status={status} />
        </div>
        <div className="relative aspect-video min-h-[280px] bg-[radial-gradient(circle_at_40%_40%,rgba(20,184,166,0.22),transparent_28%),linear-gradient(135deg,#1c1917,#292524)]">
          {isCameraEnabled ? (
            <div className="absolute left-1/2 top-1/2 overflow-hidden bg-black" style={mediaFrameStyle}>
              <video ref={cameraVideoRef} className="h-full w-full object-fill" playsInline muted />
              <DetectionBox event={event} frameWidth={frameWidth} frameHeight={frameHeight} />
              {!event ? (
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded bg-black/55 px-3 py-2 text-xs font-medium text-white">
                  <Activity className="h-4 w-4 text-teal-300" />
                  Awaiting component
                </div>
              ) : null}
            </div>
          ) : event?.imageSnapshotUrl ? (
            <div className="absolute left-1/2 top-1/2 overflow-hidden bg-black" style={mediaFrameStyle}>
              <img src={event.imageSnapshotUrl} alt="Inspection snapshot" className="h-full w-full object-fill" />
              <DetectionBox event={event} frameWidth={frameWidth} frameHeight={frameHeight} />
            </div>
          ) : (
            <div className="absolute inset-0">
              <div className="absolute left-8 right-8 top-1/2 h-16 -translate-y-1/2 rounded bg-stone-700/80" />
              <div className="absolute left-[18%] top-[36%] h-28 w-44 rounded-md border border-teal-300/40 bg-zinc-500/35 shadow-[0_0_60px_rgba(45,212,191,0.2)]" />
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded bg-black/40 px-3 py-2 text-xs font-medium text-white">
                <Activity className="h-4 w-4 text-teal-300" />
                {event ? `Frame ${event.frameNumber}` : "Awaiting stream"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <MetricTile icon={<Cpu className="h-5 w-5" />} label="Defect" value={defectText} tone={event?.status === "FAILED" ? "alarm" : "neutral"} />
        <MetricTile icon={<Gauge className="h-5 w-5" />} label="Confidence" value={formatPercent(confidenceValue)} tone="teal" />
        <MetricTile icon={<Activity className="h-5 w-5" />} label="Throughput" value={`${event?.fps.toFixed(1) ?? "0.0"} fps`} tone="amber" />
        <MetricTile label="Component" value={componentText} tone="neutral" compact />
        <MetricTile label="Detected" value={event ? formatTime(event.detectedAt) : "--:--:--"} tone="neutral" compact />
      </div>
    </section>
  );
}

interface DetectionBoxProps {
  event: LiveQcEvent | null;
  frameWidth: number;
  frameHeight: number;
}

function DetectionBox({ event, frameWidth, frameHeight }: DetectionBoxProps): JSX.Element | null {
  if (!event?.boundingBox) {
    return null;
  }
  return (
    <div
      className="absolute border-2 border-red-400 bg-red-500/10"
      style={{
        left: `${Math.min(96, Math.max(0, (event.boundingBox.xMin / frameWidth) * 100))}%`,
        top: `${Math.min(96, Math.max(0, (event.boundingBox.yMin / frameHeight) * 100))}%`,
        width: `${Math.max(4, ((event.boundingBox.xMax - event.boundingBox.xMin) / frameWidth) * 100)}%`,
        height: `${Math.max(4, ((event.boundingBox.yMax - event.boundingBox.yMin) / frameHeight) * 100)}%`,
      }}
    />
  );
}

function getMediaFrameStyle(frameWidth: number, frameHeight: number): CSSProperties {
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  const containerAspect = 16 / 9;
  if (frameAspect >= containerAspect) {
    return {
      height: `${(containerAspect / frameAspect) * 100}%`,
      transform: "translate(-50%, -50%)",
      width: "100%",
    };
  }
  return {
    height: "100%",
    transform: "translate(-50%, -50%)",
    width: `${(frameAspect / containerAspect) * 100}%`,
  };
}

interface MetricTileProps {
  icon?: JSX.Element;
  label: string;
  value: string;
  tone: "alarm" | "amber" | "neutral" | "teal";
  compact?: boolean;
}

function MetricTile({ icon, label, value, tone, compact = false }: MetricTileProps): JSX.Element {
  const toneClass = {
    alarm: "border-red-200 bg-red-50 text-factory-alarm",
    amber: "border-amber-200 bg-amber-50 text-factory-amber",
    neutral: "border-factory-line bg-white text-factory-ink",
    teal: "border-teal-200 bg-teal-50 text-factory-teal",
  }[tone];

  return (
    <div className={`min-h-24 rounded-md border p-4 shadow-soft ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-normal text-factory-steel">
        {icon}
        {label}
      </div>
      <div className={`${compact ? "mt-3 text-base" : "mt-4 text-3xl"} break-words font-black leading-tight`}>{value}</div>
    </div>
  );
}
