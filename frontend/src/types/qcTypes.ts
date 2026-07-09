export type DefectType = "casting_defect" | "scratch" | "dimensional_deviation" | "none";

export type InspectionStatus = "PASSED" | "FAILED";

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface LiveQcEvent {
  eventId: string;
  componentCode: string;
  lineId: string;
  defectFound: DefectType;
  confidenceScore: string;
  status: InspectionStatus;
  detectedAt: string;
  imageSnapshotUrl?: string | null;
  boundingBox?: BoundingBox | null;
  frameNumber: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
}

export interface DefectTrendBucket {
  bucketStart: string;
  lineId: string;
  passedCount: number;
  failedCount: number;
  castingDefectCount: number;
  scratchCount: number;
  dimensionalDeviationCount: number;
}
