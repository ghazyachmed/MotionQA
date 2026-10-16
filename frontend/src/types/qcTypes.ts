export type DefectType = "anomaly" | "casting_defect" | "scratch" | "dimensional_deviation" | "none";

export type InspectionDecision = "NO_PART" | "RETAKE" | "REVIEW" | "PASS" | "FAIL" | "ERROR";

export type ProcessingMode = "REAL_INFERENCE" | "SIMULATED_DEMO";

export type ReviewStatus = "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "OVERRIDDEN";

export const inspectionDecisions: InspectionDecision[] = ["PASS", "FAIL", "REVIEW", "RETAKE", "NO_PART", "ERROR"];

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface DefectRegion extends BoundingBox {
  peakScore: number;
}

export interface EvidenceReference {
  kind: string;
  uri: string;
  contentType: string;
  sha256?: string | null;
}

export interface LatencyBreakdown {
  decodeMs: number;
  captureChecksMs: number;
  inferenceMs: number;
  evidenceMs: number;
  totalMs: number;
}

export interface ReviewState {
  status: ReviewStatus;
  reviewerDecision?: InspectionDecision | null;
  reviewerNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface InspectionResult {
  inspectionId: string;
  componentId?: string | null;
  lineId: string;
  stationId: string;
  capturedAt: string;
  processedAt: string;
  decision: InspectionDecision;
  finalDecision: InspectionDecision;
  reasonCode: string;
  reasonDetail: string;
  processingMode: ProcessingMode;
  modelId?: string | null;
  modelVersion?: string | null;
  defectFound: DefectType;
  scores: Record<string, number>;
  thresholds: Record<string, number>;
  regions: DefectRegion[];
  partBox?: BoundingBox | null;
  evidence: EvidenceReference[];
  latency: LatencyBreakdown;
  imageWidth: number;
  imageHeight: number;
  frameNumber?: number | null;
  review: ReviewState;
}

export interface DecisionTrendBucket {
  bucketStart: string;
  lineId: string;
  counts: Record<InspectionDecision, number>;
}

export interface ModelStatus {
  ready: boolean;
  loadError: string | null;
  opencv: { version: string; isSupported: boolean };
  profileId: string | null;
  profileVersion: string | null;
  task: string | null;
  domainNote: string | null;
  decisionThresholds: { passBelow: number; failAtOrAbove: number } | null;
}

export interface InspectionSessionView {
  sessionId: string;
  componentId?: string | null;
  lineId: string;
  stationId: string;
  maxAttempts: number;
  status: "OPEN" | "COMPLETED" | "ESCALATED";
  finalDecision?: InspectionDecision | null;
  finalReasonCode?: string | null;
  nextAttemptAllowed: boolean;
  guidance: string;
  createdAt: string;
  closedAt?: string | null;
  attempts: InspectionResult[];
}
