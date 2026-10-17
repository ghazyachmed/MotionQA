import timeline from "./data/timeline.json";

// Single timeline for the composition, in frames at 30 fps (src/data/timeline.json, also read by the scripts).
// Clip segments use the recorded clip length minus a short lead trim, so no segment outlasts its footage.

export const FPS = timeline.fps;
export const TOTAL_FRAMES = timeline.totalFrames;

export type FootageClipName =
  | "aws-01-ui-status"
  | "aws-02-model-status"
  | "aws-03-health"
  | "local-01-pass"
  | "local-02-fail"
  | "local-03-review"
  | "local-04-missed-048"
  | "local-05-identity-043"
  | "local-06-retake-session";

export const footageClips: FootageClipName[] = [
  "aws-01-ui-status",
  "aws-02-model-status",
  "aws-03-health",
  "local-01-pass",
  "local-02-fail",
  "local-03-review",
  "local-04-missed-048",
  "local-05-identity-043",
  "local-06-retake-session",
];

export const scenes = timeline.scenes;
export const teamSegments = timeline.segments.team;
export const appSegments = timeline.segments.app;
export const reviewSegments = timeline.segments.review;
export const architectureSegments = timeline.segments.architecture;
export const evaluationSegments = timeline.segments.evaluation;
export const limitsSegments = timeline.segments.limits;
