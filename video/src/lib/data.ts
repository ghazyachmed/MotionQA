import links from "../data/links.json";
import timeline from "../data/timeline.json";
import verified from "../data/verified-results.json";
import type { FootageClipName } from "../timeline";

export { links, verified };

export type Fraction = { n: number; d: number };

export const fraction = (f: Fraction): string => `${f.n} / ${f.d}`;
export const score3 = (value: number): string => value.toFixed(3);
export const percent1 = (f: Fraction): string => `${((100 * f.n) / f.d).toFixed(1)} %`;

// "2026-10-17T04:18:29.505Z" -> "2026-10-17 04:18 UTC"
export const utcMinute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

type ClipResult = {
  decision?: string;
  reasonCode?: string;
  anomalyScore?: number | null;
  inferenceMs?: number | null;
  totalMs?: number | null;
  modelVersion?: string;
  sessionStatus?: string;
  sessionAttempts?: number;
  route?: string;
  body?: Record<string, unknown>;
};

type ClipEvent = { atSeconds: number; label: string; decision?: string };

export type FootageInfo = {
  label: string;
  recordedAtUtc: string;
  durationSeconds: number;
  appCommit: string | null;
  inputs: string[];
  events: ClipEvent[];
  results: ClipResult[];
};

export const footage = (clip: FootageClipName): FootageInfo | null => {
  const all = verified.footage as unknown as Record<string, FootageInfo | null>;
  return all[clip] ?? null;
};

// Frame (relative to the clip start, after trimming) at which the n-th result is on screen. The capture script marks
// a result after the evidence image has painted plus 400 ms, so the result is visible about 0.4 s before the mark.
export const resultFrame = (clip: FootageClipName, index: number, trim: number, fps: number): number => {
  const info = footage(clip);
  const marks = info?.events.filter((event) => event.label.startsWith("result")) ?? [];
  const mark = marks[index];
  return mark ? Math.max(0, Math.round((mark.atSeconds - 0.4) * fps) - trim) : 0;
};

export const eventFrame = (clip: FootageClipName, prefix: string, trim: number, fps: number): number => {
  const event = footage(clip)?.events.find((e) => e.label.startsWith(prefix));
  return event ? Math.max(0, Math.round(event.atSeconds * fps) - trim) : 0;
};

export const reasonText: Record<string, string> = {
  ANOMALY_SCORE_BELOW_PASS_THRESHOLD: "Score below the PASS threshold",
  ANOMALY_SCORE_AT_OR_ABOVE_FAIL_THRESHOLD: "Score at or above the FAIL threshold",
  ANOMALY_SCORE_IN_REVIEW_BAND: "Score inside the review band",
  PART_IDENTITY_UNCERTAIN: "Part identity uncertain",
  PART_NOT_RECOGNIZED: "Part not recognized",
  BLURRED: "Photo too blurred to judge",
};

// Absolute narration second -> frame inside a segment, using the shared timeline. Components call this so they keep
// their narration sync wherever the timeline places them.
export const cueIn = (scene: keyof typeof timeline.scenes, segment: string, fps: number) => {
  const sceneFrom = timeline.scenes[scene].from;
  const segments = timeline.segments[scene] as Record<string, { from: number }>;
  const segmentFrom = segments[segment]?.from ?? 0;
  return (seconds: number) => Math.round(seconds * fps) - sceneFrom - segmentFrom;
};
