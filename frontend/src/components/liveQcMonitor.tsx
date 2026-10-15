import type { CSSProperties, RefObject } from "react";
import { useState } from "react";
import { Activity, AlertTriangle, Camera, Fingerprint, Gauge, RotateCcw, Timer } from "lucide-react";
import { formatDecision, formatMs, formatReason, formatScore, formatTime } from "../lib/qcFormat";
import type { PublishState } from "../hooks/useCameraDemo";
import type { InspectionDecision, InspectionResult, ProcessingMode } from "../types/qcTypes";
import { DecisionPill } from "./statusPill";

interface LiveQcMonitorProps {
  processingMode: ProcessingMode;
  event: InspectionResult | null;
  evidenceUrl: string | null;
  evidenceError: string | null;
  demoSnapshotUrl: string | null;
  cameraVideoRef: RefObject<HTMLVideoElement>;
  isCameraEnabled: boolean;
  cameraError: string | null;
  submitError: string | null;
  canRetry: boolean;
  isSubmitting: boolean;
  publishState: PublishState;
  onRetry: () => Promise<void>;
  onReview: (inspectionId: string, decision: Extract<InspectionDecision, "PASS" | "FAIL">, reviewedBy: string) => Promise<unknown>;
}

// AI Assisted Logic
export function LiveQcMonitor({
  processingMode,
  event,
  evidenceUrl,
  evidenceError,
  demoSnapshotUrl,
  cameraVideoRef,
  isCameraEnabled,
  cameraError,
  submitError,
  canRetry,
  isSubmitting,
  publishState,
  onRetry,
  onReview,
}: LiveQcMonitorProps): JSX.Element {
  const isReal = processingMode === "REAL_INFERENCE";
  const frameWidth = event?.imageWidth && event.imageWidth > 0 ? event.imageWidth : 1600;
  const frameHeight = event?.imageHeight && event.imageHeight > 0 ? event.imageHeight : 900;
  const mediaFrameStyle = getMediaFrameStyle(frameWidth, frameHeight);
  const errorMessage = submitError ?? cameraError ?? evidenceError ?? (publishState.status === "FAILED" ? publishState.message : null);

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]" aria-label="Current inspection">
      <div className="min-w-0 overflow-hidden rounded-md border border-factory-line bg-factory-ink text-white shadow-soft">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-teal-300" aria-hidden />
            {event ? `${event.lineId} · ${event.stationId}` : isReal ? "Awaiting capture" : "Simulated demo"}
          </div>
          <DecisionPill decision={isSubmitting ? "WAITING" : (event?.finalDecision ?? "WAITING")} />
        </div>
        <div className="relative aspect-[4/3] sm:aspect-video sm:min-h-[280px] bg-[linear-gradient(135deg,#1c1917,#292524)]">
          {isCameraEnabled ? (
            <div className="absolute left-1/2 top-1/2 overflow-hidden bg-black" style={getMediaFrameStyle(16, 9)}>
              <video ref={cameraVideoRef} className="h-full w-full object-contain" playsInline muted />
              {!isReal && event ? <RegionBoxes event={event} frameWidth={frameWidth} frameHeight={frameHeight} /> : null}
              {isReal && evidenceUrl ? (
                <figure className="absolute bottom-3 right-3 w-[32%] overflow-hidden rounded border border-white/40 bg-black shadow-lg">
                  <img src={evidenceUrl} alt="Evidence overlay from the last inspection" className="w-full" />
                  <figcaption className="bg-black/70 px-2 py-1 text-[11px] font-semibold">Last evidence</figcaption>
                </figure>
              ) : null}
            </div>
          ) : isReal && evidenceUrl ? (
            <img src={evidenceUrl} alt="Inspection evidence: part outline, anomaly heatmap, candidate regions" className="absolute inset-0 h-full w-full object-contain" />
          ) : !isReal && demoSnapshotUrl ? (
            <div className="absolute left-1/2 top-1/2 overflow-hidden bg-black" style={mediaFrameStyle}>
              <img src={demoSnapshotUrl} alt="Demo photo" className="h-full w-full object-fill" />
              {event ? <RegionBoxes event={event} frameWidth={frameWidth} frameHeight={frameHeight} /> : null}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
              <div className="max-w-md text-sm font-medium text-stone-200">
                <Activity className="mx-auto mb-3 h-6 w-6 text-teal-300" aria-hidden />
                {isReal
                  ? event
                    ? "This inspection has no stored image evidence."
                    : "Choose Inspect photo, or start the camera and use Capture & inspect. The server runs the OpenCV 5 pipeline and returns a decision with evidence."
                  : "Start the camera or load a demo photo. Results come from browser heuristics and are labelled SIMULATED DEMO."}
              </div>
            </div>
          )}
          {errorMessage ? (
            <div className="absolute left-3 right-3 top-3 flex items-start gap-2 rounded bg-red-700/95 px-3 py-2 text-sm font-semibold text-white" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
              {submitError && canRetry ? (
                <button type="button" onClick={() => void onRetry()} className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-bold text-red-800">
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {!isReal && publishState.status === "OK" && !errorMessage ? (
            <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-semibold">{publishState.message}</div>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <DecisionTile event={event} onReview={onReview} />
        <ScoreTile event={event} isReal={isReal} />
        <InfoTile icon={<Timer className="h-4 w-4" aria-hidden />} label="Latency">
          {event && isReal ? (
            <dl className="grid grid-cols-2 gap-x-3 text-sm">
              <dt className="text-factory-steel">Inference</dt>
              <dd className="text-right font-bold">{formatMs(event.latency.inferenceMs)}</dd>
              <dt className="text-factory-steel">End-to-end (server)</dt>
              <dd className="text-right font-bold">{formatMs(event.latency.totalMs)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-factory-steel">{isReal ? "No inspection yet" : "Not measured for simulated events"}</p>
          )}
        </InfoTile>
        <InfoTile icon={<Fingerprint className="h-4 w-4" aria-hidden />} label="Traceability">
          {event ? (
            <dl className="grid gap-1 text-sm">
              <Row label="Inspection" value={event.inspectionId} />
              <Row label="Component" value={event.componentId ?? "Not assigned"} />
              <Row label="Captured" value={formatTime(event.capturedAt)} />
              <Row label="Model" value={`${event.modelId ?? "none"}${event.modelVersion ? ` v${event.modelVersion}` : ""}`} />
            </dl>
          ) : (
            <p className="text-sm text-factory-steel">No inspection yet</p>
          )}
        </InfoTile>
      </div>
    </section>
  );
}

function DecisionTile({ event, onReview }: { event: InspectionResult | null; onReview: LiveQcMonitorProps["onReview"] }): JSX.Element {
  const [reviewer, setReviewer] = useState("operator");
  const isPending = event?.processingMode === "REAL_INFERENCE" && event.review.status === "PENDING";
  const isReviewed = event && (event.review.status === "CONFIRMED" || event.review.status === "OVERRIDDEN");
  return (
    <InfoTile icon={<Activity className="h-4 w-4" aria-hidden />} label="Decision">
      {event ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionPill decision={event.finalDecision} />
            {isReviewed ? <span className="text-xs font-semibold text-factory-steel">Machine: {formatDecision(event.decision)}</span> : null}
          </div>
          <p className="text-sm font-semibold">{formatReason(event.reasonCode)}</p>
          {event.reasonDetail ? <p className="text-xs text-factory-steel">{event.reasonDetail}</p> : null}
          {isPending ? (
            <div className="mt-1 grid gap-2 rounded border border-amber-300 bg-amber-50 p-2">
              <p className="text-xs font-bold text-factory-ink">Human review required. The machine decision stays on record.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="reviewerName">
                  Reviewer
                </label>
                <input id="reviewerName" value={reviewer} onChange={(changeEvent) => setReviewer(changeEvent.target.value)} className="h-8 w-28 rounded border border-factory-line px-2 text-sm" />
                <button type="button" onClick={() => void onReview(event.inspectionId, "FAIL", reviewer)} className="h-8 rounded bg-factory-alarm px-2 text-xs font-bold text-white">
                  Confirm FAIL
                </button>
                <button type="button" onClick={() => void onReview(event.inspectionId, "PASS", reviewer)} className="h-8 rounded bg-factory-pass px-2 text-xs font-bold text-white">
                  Accept PASS
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-factory-steel">No inspection yet</p>
      )}
    </InfoTile>
  );
}

function ScoreTile({ event, isReal }: { event: InspectionResult | null; isReal: boolean }): JSX.Element {
  const anomalyScore = event?.scores.anomalyScore;
  const passBelow = event?.thresholds.passBelow;
  const failAtOrAbove = event?.thresholds.failAtOrAbove;
  if (!isReal) {
    return (
      <InfoTile icon={<Gauge className="h-4 w-4" aria-hidden />} label="Heuristic score">
        <p className="text-2xl font-black">{formatScore(event?.scores.heuristicScore)}</p>
        <p className="text-xs text-factory-steel">Uncalibrated presentation value from pixel heuristics. Not a probability.</p>
      </InfoTile>
    );
  }
  const hasScale = typeof anomalyScore === "number" && typeof passBelow === "number" && typeof failAtOrAbove === "number";
  const scaleMax = hasScale ? Math.max(failAtOrAbove * 1.5, anomalyScore * 1.1) : 1;
  const toPercent = (value: number) => `${Math.min(100, Math.max(0, (value / scaleMax) * 100))}%`;
  return (
    <InfoTile icon={<Gauge className="h-4 w-4" aria-hidden />} label="Anomaly score (raw)">
      <p className="text-2xl font-black">{formatScore(anomalyScore)}</p>
      {hasScale ? (
        <div className="mt-2" aria-label={`Score ${formatScore(anomalyScore)}; pass below ${formatScore(passBelow)}; fail at or above ${formatScore(failAtOrAbove)}`}>
          <div className="relative h-3 overflow-hidden rounded bg-stone-200">
            <div className="absolute inset-y-0 left-0 bg-green-600" style={{ width: toPercent(passBelow) }} />
            <div className="absolute inset-y-0 bg-amber-400" style={{ left: toPercent(passBelow), width: `calc(${toPercent(failAtOrAbove)} - ${toPercent(passBelow)})` }} />
            <div className="absolute inset-y-0 right-0 bg-red-600" style={{ left: toPercent(failAtOrAbove) }} />
          </div>
          <div className="relative h-4">
            <div className="absolute -top-4 h-5 w-0.5 bg-factory-ink" style={{ left: toPercent(anomalyScore) }} />
          </div>
          <p className="text-xs text-factory-steel">
            PASS &lt; {formatScore(passBelow)} · FAIL ≥ {formatScore(failAtOrAbove)}. Nearest-neighbour feature distance, not a probability.
          </p>
        </div>
      ) : (
        <p className="text-xs text-factory-steel">{event ? "No anomaly score: the capture gates stopped this inspection before scoring." : "No inspection yet"}</p>
      )}
    </InfoTile>
  );
}

function InfoTile({ icon, label, children }: { icon: JSX.Element; label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-md border border-factory-line bg-white p-4 text-factory-ink shadow-soft">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-normal text-factory-steel">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <dt className="text-factory-steel">{label}</dt>
      <dd className="truncate font-semibold" title={value}>
        {value}
      </dd>
    </div>
  );
}

function RegionBoxes({ event, frameWidth, frameHeight }: { event: InspectionResult; frameWidth: number; frameHeight: number }): JSX.Element {
  return (
    <>
      {event.regions.map((region, index) => (
        <div
          key={`${region.xMin}-${region.yMin}-${index}`}
          className="absolute border-2 border-red-400 bg-red-500/10"
          style={{
            left: `${(region.xMin / frameWidth) * 100}%`,
            top: `${(region.yMin / frameHeight) * 100}%`,
            width: `${((region.xMax - region.xMin) / frameWidth) * 100}%`,
            height: `${((region.yMax - region.yMin) / frameHeight) * 100}%`,
          }}
        />
      ))}
    </>
  );
}

function getMediaFrameStyle(frameWidth: number, frameHeight: number): CSSProperties {
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  const containerAspect = 16 / 9;
  if (frameAspect >= containerAspect) {
    return { height: `${(containerAspect / frameAspect) * 100}%`, transform: "translate(-50%, -50%)", width: "100%" };
  }
  return { height: "100%", transform: "translate(-50%, -50%)", width: `${(frameAspect / containerAspect) * 100}%` };
}
