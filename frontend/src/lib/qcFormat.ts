import type { DefectType, InspectionDecision } from "../types/qcTypes";

const defectLabels: Record<DefectType, string> = {
  anomaly: "Anomaly (unclassified)",
  casting_defect: "Casting defect",
  scratch: "Scratch",
  dimensional_deviation: "Dimensional deviation",
  none: "None",
};

const decisionLabels: Record<InspectionDecision, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  REVIEW: "Needs review",
  RETAKE: "Retake capture",
  NO_PART: "No part",
  ERROR: "Error",
};

const reasonLabels: Record<string, string> = {
  ANOMALY_SCORE_BELOW_PASS_THRESHOLD: "Score below the validated PASS threshold",
  ANOMALY_SCORE_AT_OR_ABOVE_FAIL_THRESHOLD: "Score at or above the validated FAIL threshold",
  ANOMALY_SCORE_IN_REVIEW_BAND: "Score between PASS and FAIL thresholds",
  PART_NOT_FOUND: "No object separated from the background",
  PART_NOT_RECOGNIZED: "Object differs from the validated component",
  PART_IDENTITY_UNCERTAIN: "Part present but not recognized with confidence (may be incomplete)",
  RECAPTURE_LIMIT_REACHED: "No conclusive result after the allowed recaptures",
  UNDEREXPOSED: "Image too dark",
  OVEREXPOSED: "Image too bright",
  BLURRED: "Image not sharp enough",
  PART_CUT_OFF: "Part touches the frame edge",
  PART_SCALE_OUT_OF_RANGE: "Part size outside the validated range",
  MODEL_UNAVAILABLE: "Model not loaded",
  INVALID_MODEL_OUTPUT: "Model output failed validation",
  INFERENCE_TIMEOUT: "Inference timed out",
  INFERENCE_FAILED: "Inference failed",
  EVIDENCE_STORAGE_FAILED: "Evidence could not be stored",
  SIMULATED_HEURISTIC: "Browser heuristic (simulated)",
  SIMULATED_FORCED_SCENARIO: "Forced demo scenario (simulated)",
};

// AI Assisted Logic
export function formatDefect(defectType: DefectType): string {
  return defectLabels[defectType] ?? defectType;
}

export function formatDecision(decision: InspectionDecision): string {
  return decisionLabels[decision] ?? decision;
}

export function formatReason(reasonCode: string): string {
  return reasonLabels[reasonCode] ?? reasonCode;
}

export function formatScore(value: number | undefined | null, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export function formatMs(value: number | undefined | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(0)} ms` : "—";
}

export function formatPercent(value: number | string): string {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numericValue)) {
    return "0.0%";
  }
  return `${(numericValue * 100).toFixed(1)}%`;
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
