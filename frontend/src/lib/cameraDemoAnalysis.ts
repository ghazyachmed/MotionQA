import type { BoundingBox, DefectType, InspectionStatus } from "../types/qcTypes";

export type CameraDemoMode = "auto" | DefectType;

export interface CameraFrameStats {
  brightnessScore: number;
  edgeScore: number;
  varianceScore: number;
}

export interface CameraDemoDecision {
  defectFound: DefectType;
  confidenceScore: number;
  status: InspectionStatus;
  boundingBox: BoundingBox | null;
}

interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// AI Assisted Logic
export function analyzeCameraFrame(imageData: ImageData, mode: CameraDemoMode): CameraDemoDecision {
  const stats = calculateFrameStats({ data: imageData.data, width: imageData.width, height: imageData.height });
  const defectFound = selectDefectType(stats, mode);
  const confidenceScore = calculateConfidence(stats, defectFound);
  const status: InspectionStatus = defectFound === "none" ? "PASSED" : "FAILED";
  return {
    defectFound,
    confidenceScore,
    status,
    boundingBox: defectFound === "none" ? null : createDemoBoundingBox(imageData.width, imageData.height, stats),
  };
}

export function calculateFrameStats(pixelBuffer: PixelBuffer): CameraFrameStats {
  let brightnessTotal = 0;
  let varianceTotal = 0;
  let edgeTotal = 0;
  let previousLuma = 0;
  const pixelCount = pixelBuffer.width * pixelBuffer.height;

  for (let index = 0; index < pixelBuffer.data.length; index += 4) {
    const redValue = pixelBuffer.data[index] ?? 0;
    const greenValue = pixelBuffer.data[index + 1] ?? 0;
    const blueValue = pixelBuffer.data[index + 2] ?? 0;
    const lumaValue = (0.2126 * redValue + 0.7152 * greenValue + 0.0722 * blueValue) / 255;
    brightnessTotal += lumaValue;
    varianceTotal += Math.abs(redValue - greenValue) + Math.abs(greenValue - blueValue);
    edgeTotal += Math.abs(lumaValue - previousLuma);
    previousLuma = lumaValue;
  }

  return {
    brightnessScore: brightnessTotal / Math.max(1, pixelCount),
    varianceScore: varianceTotal / Math.max(1, pixelCount * 510),
    edgeScore: edgeTotal / Math.max(1, pixelCount),
  };
}

function selectDefectType(stats: CameraFrameStats, mode: CameraDemoMode): DefectType {
  if (mode !== "auto") {
    return mode;
  }
  if (stats.edgeScore > 0.075) {
    return "scratch";
  }
  if (stats.brightnessScore < 0.28) {
    return "casting_defect";
  }
  if (stats.varianceScore > 0.18) {
    return "dimensional_deviation";
  }
  return "none";
}

function calculateConfidence(stats: CameraFrameStats, defectFound: DefectType): number {
  if (defectFound === "none") {
    return 0;
  }
  const rawScore = 0.58 + stats.edgeScore * 2.4 + stats.varianceScore * 0.9 + Math.abs(0.5 - stats.brightnessScore) * 0.35;
  return Math.min(0.982, Math.max(0.621, rawScore));
}

function createDemoBoundingBox(width: number, height: number, stats: CameraFrameStats): BoundingBox {
  const centerOffset = Math.min(0.2, Math.max(-0.2, stats.brightnessScore - 0.5));
  const boxWidth = width * 0.38;
  const boxHeight = height * 0.34;
  const centerX = width * (0.48 + centerOffset);
  const centerY = height * (0.44 + stats.varianceScore * 0.12);
  return {
    xMin: Math.max(0, centerX - boxWidth / 2),
    yMin: Math.max(0, centerY - boxHeight / 2),
    xMax: Math.min(width, centerX + boxWidth / 2),
    yMax: Math.min(height, centerY + boxHeight / 2),
  };
}

