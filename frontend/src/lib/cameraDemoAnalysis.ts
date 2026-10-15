import type { BoundingBox, DefectType } from "../types/qcTypes";

// SIMULATED DEMO ONLY. Hand-tuned pixel heuristics for presentations; not a trained or validated model.
// `heuristicScore` is an uncalibrated presentation value, not a probability.
export type CameraDemoMode = "auto" | "none" | "scratch" | "casting_defect";

export type DemoDecision = "PASS" | "FAIL" | "NO_PART";

export interface CameraFrameStats {
  brightnessScore: number;
  edgeScore: number;
  varianceScore: number;
  castingCoverage: number;
  scratchCoverage: number;
}

export interface CameraDemoDecision {
  defectFound: DefectType;
  heuristicScore: number;
  decision: DemoDecision;
  boundingBox: BoundingBox | null;
  componentBox: BoundingBox | null;
  isInspectable: boolean;
  isForcedScenario: boolean;
}

export interface DemoSessionState {
  presentStreak: number;
  absentStreak: number;
  isPublished: boolean;
  sessionCount: number;
}

export const initialDemoSession: DemoSessionState = { presentStreak: 0, absentStreak: 0, isPublished: false, sessionCount: 0 };

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

interface BoxLike {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

interface MaskComponent {
  area: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

// AI Assisted Logic
export function analyzeCameraFrame(imageData: ImageData, mode: CameraDemoMode): CameraDemoDecision {
  const componentBox = locateComponentBox(imageData);
  const stats = calculateFrameStats({ data: imageData.data, width: imageData.width, height: imageData.height }, componentBox);
  if (!componentBox) {
    return {
      defectFound: "none",
      heuristicScore: 0,
      decision: "NO_PART",
      boundingBox: null,
      componentBox: null,
      isInspectable: false,
      isForcedScenario: mode !== "auto",
    };
  }
  const scratchBox = locateScratchBox(imageData, componentBox);
  const castingBox = locateCastingBox(imageData, componentBox);
  const defectFound = selectDefectType(stats, mode, scratchBox, castingBox);
  return {
    defectFound,
    heuristicScore: calculateHeuristicScore(stats, defectFound),
    decision: defectFound === "none" ? "PASS" : "FAIL",
    boundingBox: selectBoundingBox(defectFound, scratchBox, castingBox),
    componentBox,
    isInspectable: true,
    isForcedScenario: mode !== "auto",
  };
}

// One published demo event per part placement: publish after `presenceFrames` inspectable frames,
// start a new session only after `absenceFrames` frames without a part.
export function advanceDemoSession(
  state: DemoSessionState,
  isInspectable: boolean,
  presenceFrames = 3,
  absenceFrames = 4,
): { state: DemoSessionState; shouldPublish: boolean } {
  if (!isInspectable) {
    const absentStreak = state.absentStreak + 1;
    const isClosed = absentStreak >= absenceFrames;
    return { state: { ...state, presentStreak: 0, absentStreak, isPublished: isClosed ? false : state.isPublished }, shouldPublish: false };
  }
  const presentStreak = state.presentStreak + 1;
  const shouldPublish = !state.isPublished && presentStreak >= presenceFrames;
  return {
    state: {
      presentStreak,
      absentStreak: 0,
      isPublished: state.isPublished || shouldPublish,
      sessionCount: shouldPublish ? state.sessionCount + 1 : state.sessionCount,
    },
    shouldPublish,
  };
}

export function calculateFrameStats(pixelBuffer: PixelBuffer, componentBox: BoundingBox | null = null): CameraFrameStats {
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
    if (isStatsRoi(x, y, pixelBuffer.width, pixelBuffer.height, componentBox)) {
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

function calculateHeuristicScore(stats: CameraFrameStats, defectFound: DefectType): number {
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

function locateComponentBox(imageData: ImageData): BoundingBox | null {
  const mask = new Uint8Array(imageData.width * imageData.height);
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const index = (y * imageData.width + x) * 4;
      const redValue = imageData.data[index] ?? 0;
      const greenValue = imageData.data[index + 1] ?? 0;
      const blueValue = imageData.data[index + 2] ?? 0;
      const lumaValue = getLuma(redValue, greenValue, blueValue);
      if (isComponentPixel(redValue, greenValue, blueValue, lumaValue, x, y, imageData.width, imageData.height)) {
        mask[y * imageData.width + x] = 1;
      }
    }
  }
  const components = collectMaskComponents(mask, imageData.width, imageData.height);
  const componentCandidates = components
    .filter((component) => isInspectableComponent(component, imageData.width, imageData.height))
    .sort((leftComponent, rightComponent) => rightComponent.area - leftComponent.area);
  const component = componentCandidates[0];
  if (!component) {
    return null;
  }
  return padBoundingBox(component, imageData.width, imageData.height, 8);
}

function locateScratchBox(imageData: ImageData, componentBox: BoundingBox): BoundingBox | null {
  const slopes = [0.18, 0.24, 0.3, 0.36, 0.42];
  const buckets = new Map<string, LineBucket>();
  for (let y = 0; y < imageData.height; y += 2) {
    for (let x = 0; x < imageData.width; x += 2) {
      if (!isScratchRoi(x, y, componentBox)) {
        continue;
      }
      const index = (y * imageData.width + x) * 4;
      const lumaValue = getLuma(imageData.data[index] ?? 0, imageData.data[index + 1] ?? 0, imageData.data[index + 2] ?? 0);
      if (!isScratchCandidatePixel(imageData, x, y, lumaValue)) {
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
  const minMatchedPixels = Math.max(18, getBoxArea(componentBox) * 0.00016);
  if (!bestBucket || bestBucket.matchedPixels < minMatchedPixels) {
    return null;
  }
  return padBoundingBox(bestBucket, imageData.width, imageData.height, 18);
}

function locateCastingBox(imageData: ImageData, componentBox: BoundingBox): BoundingBox | null {
  const mask = new Uint8Array(imageData.width * imageData.height);
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      if (!isCastingRoi(x, y, componentBox)) {
        continue;
      }
      const index = (y * imageData.width + x) * 4;
      const lumaValue = getLuma(imageData.data[index] ?? 0, imageData.data[index + 1] ?? 0, imageData.data[index + 2] ?? 0);
      if (isCastingPixel(lumaValue)) {
        mask[y * imageData.width + x] = 1;
      }
    }
  }
  const components = collectMaskComponents(mask, imageData.width, imageData.height);
  const componentArea = getBoxArea(componentBox);
  const minArea = Math.max(3, componentArea * 0.00002);
  const maxArea = Math.max(24, componentArea * 0.008);
  const maxSpan = Math.max(10, Math.min(componentBox.xMax - componentBox.xMin, componentBox.yMax - componentBox.yMin) * 0.18);
  const defectComponents = components.filter((component) => {
    const componentWidth = component.xMax - component.xMin + 1;
    const componentHeight = component.yMax - component.yMin + 1;
    return component.area >= minArea && component.area <= maxArea && componentWidth <= maxSpan && componentHeight <= maxSpan;
  });
  const totalArea = defectComponents.reduce((sumValue, component) => sumValue + component.area, 0);
  const minTotalArea = Math.max(16, componentArea * 0.00045);
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

function collectMaskComponents(mask: Uint8Array, width: number, height: number): MaskComponent[] {
  const components: MaskComponent[] = [];
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

function padBoundingBox(boxValue: BoxLike, width: number, height: number, padding: number): BoundingBox {
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

function isScratchCandidatePixel(imageData: ImageData, x: number, y: number, lumaValue: number): boolean {
  if (!isScratchPixel(lumaValue)) {
    return false;
  }
  const offsets = [
    [-5, 0],
    [5, 0],
    [0, -5],
    [0, 5],
    [-4, -4],
    [4, 4],
  ];
  const supportCount = offsets.reduce((countValue, [xOffset, yOffset]) => {
    const sampleX = x + xOffset;
    const sampleY = y + yOffset;
    if (sampleX < 0 || sampleY < 0 || sampleX >= imageData.width || sampleY >= imageData.height) {
      return countValue;
    }
    const index = (sampleY * imageData.width + sampleX) * 4;
    const redValue = imageData.data[index] ?? 0;
    const greenValue = imageData.data[index + 1] ?? 0;
    const blueValue = imageData.data[index + 2] ?? 0;
    const sampleLuma = getLuma(redValue, greenValue, blueValue);
    return isComponentSurfacePixel(redValue, greenValue, blueValue, sampleLuma) ? countValue + 1 : countValue;
  }, 0);
  return supportCount >= 3;
}

function isScratchRoi(x: number, y: number, componentBox: BoundingBox): boolean {
  const boxWidth = componentBox.xMax - componentBox.xMin;
  const boxHeight = componentBox.yMax - componentBox.yMin;
  return (
    x > componentBox.xMin + boxWidth * 0.07 &&
    x < componentBox.xMax - boxWidth * 0.07 &&
    y > componentBox.yMin + boxHeight * 0.27 &&
    y < componentBox.yMax - boxHeight * 0.12
  );
}

function isComponentRoi(x: number, y: number, width: number, height: number): boolean {
  return x > width * 0.22 && x < width * 0.84 && y > height * 0.31 && y < height * 0.78;
}

function isCastingRoi(x: number, y: number, componentBox: BoundingBox): boolean {
  const boxWidth = componentBox.xMax - componentBox.xMin;
  const boxHeight = componentBox.yMax - componentBox.yMin;
  return (
    x > componentBox.xMin + boxWidth * 0.06 &&
    x < componentBox.xMax - boxWidth * 0.06 &&
    y > componentBox.yMin + boxHeight * 0.16 &&
    y < componentBox.yMax - boxHeight * 0.12
  );
}

function isStatsRoi(x: number, y: number, width: number, height: number, componentBox: BoundingBox | null): boolean {
  if (!componentBox) {
    return isComponentRoi(x, y, width, height);
  }
  const boxWidth = componentBox.xMax - componentBox.xMin;
  const boxHeight = componentBox.yMax - componentBox.yMin;
  return (
    x > componentBox.xMin + boxWidth * 0.05 &&
    x < componentBox.xMax - boxWidth * 0.05 &&
    y > componentBox.yMin + boxHeight * 0.14 &&
    y < componentBox.yMax - boxHeight * 0.1
  );
}

function isComponentPixel(
  redValue: number,
  greenValue: number,
  blueValue: number,
  lumaValue: number,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return (
    x > width * 0.08 &&
    x < width * 0.94 &&
    y > height * 0.08 &&
    y < height * 0.9 &&
    isComponentSurfacePixel(redValue, greenValue, blueValue, lumaValue)
  );
}

function isComponentSurfacePixel(redValue: number, greenValue: number, blueValue: number, lumaValue: number): boolean {
  const colorSpread = (Math.max(redValue, greenValue, blueValue) - Math.min(redValue, greenValue, blueValue)) / 255;
  return lumaValue > 0.24 && lumaValue < 0.69 && colorSpread < 0.16;
}

function isInspectableComponent(component: MaskComponent, width: number, height: number): boolean {
  const componentWidth = component.xMax - component.xMin + 1;
  const componentHeight = component.yMax - component.yMin + 1;
  const frameArea = width * height;
  const boxArea = componentWidth * componentHeight;
  const coverage = component.area / Math.max(1, frameArea);
  const fillRatio = component.area / Math.max(1, boxArea);
  return (
    coverage > 0.025 &&
    coverage < 0.58 &&
    fillRatio > 0.38 &&
    componentWidth > width * 0.18 &&
    componentHeight > height * 0.12 &&
    component.xMin > width * 0.04 &&
    component.xMax < width * 0.98 &&
    component.yMin > height * 0.04 &&
    component.yMax < height * 0.94
  );
}

function getBoxArea(boxValue: BoundingBox): number {
  return Math.max(1, (boxValue.xMax - boxValue.xMin) * (boxValue.yMax - boxValue.yMin));
}
