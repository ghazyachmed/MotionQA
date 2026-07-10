import type { BoundingBox, DefectType, InspectionStatus } from "../types/qcTypes";

export type CameraDemoMode = "auto" | "none" | "scratch" | "casting_defect";

export interface CameraFrameStats {
  brightnessScore: number;
  edgeScore: number;
  varianceScore: number;
  castingCoverage: number;
  scratchCoverage: number;
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

interface LineBucket {
  matchedPixels: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

interface CastingComponent {
  area: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

// AI Assisted Logic
export function analyzeCameraFrame(imageData: ImageData, mode: CameraDemoMode): CameraDemoDecision {
  const stats = calculateFrameStats({ data: imageData.data, width: imageData.width, height: imageData.height });
  const scratchBox = locateScratchBox(imageData);
  const castingBox = locateCastingBox(imageData);
  const defectFound = selectDefectType(stats, mode, scratchBox, castingBox);
  const confidenceScore = calculateConfidence(stats, defectFound);
  const status: InspectionStatus = defectFound === "none" ? "PASSED" : "FAILED";
  return {
    defectFound,
    confidenceScore,
    status,
    boundingBox: selectBoundingBox(defectFound, scratchBox, castingBox),
  };
}

export function calculateFrameStats(pixelBuffer: PixelBuffer): CameraFrameStats {
  let brightnessTotal = 0;
  let varianceTotal = 0;
  let edgeTotal = 0;
  let scratchPixels = 0;
  let castingPixels = 0;
  let roiPixels = 0;
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
    const pixelIndex = index / 4;
    const x = pixelIndex % pixelBuffer.width;
    const y = Math.floor(pixelIndex / pixelBuffer.width);
    if (isComponentRoi(x, y, pixelBuffer.width, pixelBuffer.height)) {
      roiPixels += 1;
      if (isScratchPixel(lumaValue)) {
        scratchPixels += 1;
      }
      if (isCastingPixel(lumaValue)) {
        castingPixels += 1;
      }
    }
    previousLuma = lumaValue;
  }

  return {
    brightnessScore: brightnessTotal / Math.max(1, pixelCount),
    varianceScore: varianceTotal / Math.max(1, pixelCount * 510),
    edgeScore: edgeTotal / Math.max(1, pixelCount),
    castingCoverage: castingPixels / Math.max(1, roiPixels),
    scratchCoverage: scratchPixels / Math.max(1, roiPixels),
  };
}

function selectDefectType(
  stats: CameraFrameStats,
  mode: CameraDemoMode,
  scratchBox: BoundingBox | null,
  castingBox: BoundingBox | null,
): DefectType {
  if (mode === "none") {
    return "none";
  }
  if (mode === "scratch") {
    return scratchBox ? "scratch" : "none";
  }
  if (mode === "casting_defect") {
    return castingBox ? "casting_defect" : "none";
  }
  if (scratchBox && stats.scratchCoverage > 0.01) {
    return "scratch";
  }
  if (castingBox && stats.castingCoverage > 0.012) {
    return "casting_defect";
  }
  return "none";
}

function calculateConfidence(stats: CameraFrameStats, defectFound: DefectType): number {
  if (defectFound === "none") {
    return 0;
  }
  const coverageScore = defectFound === "scratch" ? stats.scratchCoverage * 5.5 : stats.castingCoverage * 2.8;
  const rawScore = 0.56 + coverageScore + stats.edgeScore * 1.4 + stats.varianceScore * 0.5;
  return Math.min(0.982, Math.max(0.621, rawScore));
}

function selectBoundingBox(defectFound: DefectType, scratchBox: BoundingBox | null, castingBox: BoundingBox | null): BoundingBox | null {
  if (defectFound === "scratch") {
    return scratchBox;
  }
  if (defectFound === "casting_defect") {
    return castingBox;
  }
  return null;
}

function locateScratchBox(imageData: ImageData): BoundingBox | null {
  const slopes = [0.18, 0.24, 0.3, 0.36, 0.42];
  const buckets = new Map<string, LineBucket>();
  for (let y = 0; y < imageData.height; y += 2) {
    for (let x = 0; x < imageData.width; x += 2) {
      if (!isScratchRoi(x, y, imageData.width, imageData.height)) {
        continue;
      }
      const index = (y * imageData.width + x) * 4;
      const lumaValue = getLuma(imageData.data[index] ?? 0, imageData.data[index + 1] ?? 0, imageData.data[index + 2] ?? 0);
      if (!isScratchPixel(lumaValue)) {
        continue;
      }
      slopes.forEach((slopeValue, slopeIndex) => {
        const bucketKey = `${slopeIndex}:${Math.round((y - slopeValue * x) / 6)}`;
        const currentBucket = buckets.get(bucketKey);
        if (!currentBucket) {
          buckets.set(bucketKey, { matchedPixels: 1, xMin: x, yMin: y, xMax: x, yMax: y });
          return;
        }
        currentBucket.matchedPixels += 1;
        currentBucket.xMin = Math.min(currentBucket.xMin, x);
        currentBucket.yMin = Math.min(currentBucket.yMin, y);
        currentBucket.xMax = Math.max(currentBucket.xMax, x);
        currentBucket.yMax = Math.max(currentBucket.yMax, y);
      });
    }
  }
  const bestBucket = [...buckets.values()]
    .filter((bucket) => bucket.xMax - bucket.xMin > imageData.width * 0.1 && bucket.yMax - bucket.yMin > imageData.height * 0.025)
    .sort((leftBucket, rightBucket) => rightBucket.matchedPixels - leftBucket.matchedPixels)[0];
  const minMatchedPixels = Math.max(24, imageData.width * imageData.height * 0.00012);
  if (!bestBucket || bestBucket.matchedPixels < minMatchedPixels) {
    return null;
  }
  return padBoundingBox(bestBucket, imageData.width, imageData.height, 18);
}

function locateCastingBox(imageData: ImageData): BoundingBox | null {
  const mask = new Uint8Array(imageData.width * imageData.height);
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      if (!isCastingRoi(x, y, imageData.width, imageData.height)) {
        continue;
      }
      const index = (y * imageData.width + x) * 4;
      const lumaValue = getLuma(imageData.data[index] ?? 0, imageData.data[index + 1] ?? 0, imageData.data[index + 2] ?? 0);
      if (isCastingPixel(lumaValue)) {
        mask[y * imageData.width + x] = 1;
      }
    }
  }
  const components = collectCastingComponents(mask, imageData.width, imageData.height);
  const minArea = Math.max(3, imageData.width * imageData.height * 0.00002);
  const maxArea = Math.max(24, imageData.width * imageData.height * 0.0025);
  const maxSpan = Math.max(10, Math.min(imageData.width, imageData.height) * 0.13);
  const defectComponents = components.filter((component) => {
    const componentWidth = component.xMax - component.xMin + 1;
    const componentHeight = component.yMax - component.yMin + 1;
    return component.area >= minArea && component.area <= maxArea && componentWidth <= maxSpan && componentHeight <= maxSpan;
  });
  const totalArea = defectComponents.reduce((sumValue, component) => sumValue + component.area, 0);
  const minTotalArea = Math.max(18, imageData.width * imageData.height * 0.00035);
  if (defectComponents.length < 5 || totalArea < minTotalArea) {
    return null;
  }
  const defectBox = defectComponents.reduce<LineBucket>(
    (boxValue, component) => ({
      matchedPixels: boxValue.matchedPixels + component.area,
      xMin: Math.min(boxValue.xMin, component.xMin),
      yMin: Math.min(boxValue.yMin, component.yMin),
      xMax: Math.max(boxValue.xMax, component.xMax),
      yMax: Math.max(boxValue.yMax, component.yMax),
    }),
    {
      matchedPixels: 0,
      xMin: imageData.width,
      yMin: imageData.height,
      xMax: 0,
      yMax: 0,
    },
  );
  return padBoundingBox(defectBox, imageData.width, imageData.height, 18);
}

function collectCastingComponents(mask: Uint8Array, width: number, height: number): CastingComponent[] {
  const components: CastingComponent[] = [];
  const queue = new Int32Array(width * height);
  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    if (mask[pixelIndex] !== 1) {
      continue;
    }
    let queueStart = 0;
    let queueEnd = 0;
    let area = 0;
    let xMin = width;
    let yMin = height;
    let xMax = 0;
    let yMax = 0;
    mask[pixelIndex] = 2;
    queue[queueEnd] = pixelIndex;
    queueEnd += 1;
    while (queueStart < queueEnd) {
      const currentIndex = queue[queueStart] ?? 0;
      queueStart += 1;
      const x = currentIndex % width;
      const y = Math.floor(currentIndex / width);
      area += 1;
      xMin = Math.min(xMin, x);
      yMin = Math.min(yMin, y);
      xMax = Math.max(xMax, x);
      yMax = Math.max(yMax, y);
      queueEnd = visitNeighbor(mask, queue, queueEnd, currentIndex - 1, x > 0);
      queueEnd = visitNeighbor(mask, queue, queueEnd, currentIndex + 1, x < width - 1);
      queueEnd = visitNeighbor(mask, queue, queueEnd, currentIndex - width, y > 0);
      queueEnd = visitNeighbor(mask, queue, queueEnd, currentIndex + width, y < height - 1);
    }
    components.push({ area, xMin, yMin, xMax, yMax });
  }
  return components;
}

function visitNeighbor(mask: Uint8Array, queue: Int32Array, queueEnd: number, nextIndex: number, canVisit: boolean): number {
  if (!canVisit || mask[nextIndex] !== 1) {
    return queueEnd;
  }
  mask[nextIndex] = 2;
  queue[queueEnd] = nextIndex;
  return queueEnd + 1;
}

function padBoundingBox(boxValue: LineBucket, width: number, height: number, padding: number): BoundingBox {
  return {
    xMin: Math.max(0, boxValue.xMin - padding),
    yMin: Math.max(0, boxValue.yMin - padding),
    xMax: Math.min(width, boxValue.xMax + padding),
    yMax: Math.min(height, boxValue.yMax + padding),
  };
}

function getLuma(redValue: number, greenValue: number, blueValue: number): number {
  return (0.2126 * redValue + 0.7152 * greenValue + 0.0722 * blueValue) / 255;
}

function isScratchPixel(lumaValue: number): boolean {
  return lumaValue > 0.76;
}

function isCastingPixel(lumaValue: number): boolean {
  return lumaValue < 0.42;
}

function isScratchRoi(x: number, y: number, width: number, height: number): boolean {
  return x > width * 0.24 && x < width * 0.78 && y > height * 0.39 && y < height * 0.76;
}

function isComponentRoi(x: number, y: number, width: number, height: number): boolean {
  return x > width * 0.22 && x < width * 0.84 && y > height * 0.31 && y < height * 0.78;
}

function isCastingRoi(x: number, y: number, width: number, height: number): boolean {
  return x > width * 0.24 && x < width * 0.8 && y > height * 0.34 && y < height * 0.75;
}
