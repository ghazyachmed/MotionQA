import { describe, expect, it } from "vitest";
import { advanceDemoSession, analyzeCameraFrame, calculateFrameStats, initialDemoSession } from "./cameraDemoAnalysis";

function createImageData(redValue: number, greenValue: number, blueValue: number, width = 320, height = 180): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = redValue;
    data[index + 1] = greenValue;
    data[index + 2] = blueValue;
    data[index + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

function drawScratch(imageData: ImageData): ImageData {
  for (let x = 96; x < 224; x += 1) {
    const y = Math.round(82 + (x - 96) * 0.32);
    drawDisc(imageData, x, y, 3, 248, 248, 248);
  }
  return imageData;
}

function drawCasting(imageData: ImageData): ImageData {
  const centers = [
    [92, 78],
    [116, 106],
    [142, 88],
    [164, 118],
    [184, 96],
    [204, 116],
    [222, 84],
    [236, 126],
  ];
  centers.forEach(([x, y]) => drawDisc(imageData, x, y, 4, 54, 54, 54));
  return imageData;
}

function drawCleanPart(imageData: ImageData): ImageData {
  const centerX = imageData.width / 2;
  const centerY = imageData.height / 2;
  const radiusX = imageData.width * 0.32;
  const radiusY = imageData.height * 0.28;
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      if (normalizedX ** 2 + normalizedY ** 2 <= 1) {
        setPixel(imageData, x, y, 124, 127, 130);
      }
    }
  }
  for (let x = 92; x < 228; x += 1) {
    drawDisc(imageData, x, 61, 1, 238, 238, 238);
  }
  drawDisc(imageData, 104, 83, 9, 58, 58, 58);
  drawDisc(imageData, 214, 83, 9, 58, 58, 58);
  drawDisc(imageData, 160, 112, 10, 58, 58, 58);
  return imageData;
}

function drawDisc(imageData: ImageData, centerX: number, centerY: number, radius: number, redValue: number, greenValue: number, blueValue: number): void {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) {
        continue;
      }
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) {
        continue;
      }
      setPixel(imageData, x, y, redValue, greenValue, blueValue);
    }
  }
}

function setPixel(imageData: ImageData, x: number, y: number, redValue: number, greenValue: number, blueValue: number): void {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = redValue;
  imageData.data[index + 1] = greenValue;
  imageData.data[index + 2] = blueValue;
  imageData.data[index + 3] = 255;
}

// AI Assisted Logic
describe("cameraDemoAnalysis", () => {
  it("calculates normalized frame brightness", () => {
    const imageData = createImageData(255, 255, 255, 4, 4);
    const stats = calculateFrameStats({ data: imageData.data, width: imageData.width, height: imageData.height });
    expect(stats.brightnessScore).toBeCloseTo(1, 2);
  });

  it("waits when no component is visible", () => {
    const decision = analyzeCameraFrame(createImageData(232, 232, 232), "auto");
    expect(decision.isInspectable).toBe(false);
    expect(decision.decision).toBe("NO_PART");
    expect(decision.defectFound).toBe("none");
    expect(decision.boundingBox).toBeNull();
  });

  it("keeps a clean visible part passed in auto mode", () => {
    const decision = analyzeCameraFrame(drawCleanPart(createImageData(232, 232, 232)), "auto");
    expect(decision.isInspectable).toBe(true);
    expect(decision.defectFound).toBe("none");
    expect(decision.decision).toBe("PASS");
    expect(decision.isForcedScenario).toBe(false);
    expect(decision.boundingBox).toBeNull();
  });

  it("finds a scratch box from diagonal evidence", () => {
    const decision = analyzeCameraFrame(drawScratch(drawCleanPart(createImageData(232, 232, 232))), "auto");
    expect(decision.isInspectable).toBe(true);
    expect(decision.defectFound).toBe("scratch");
    expect(decision.decision).toBe("FAIL");
    expect(decision.boundingBox).not.toBeNull();
  });

  it("finds casting defect from repeated pore evidence", () => {
    const decision = analyzeCameraFrame(drawCasting(drawCleanPart(createImageData(232, 232, 232))), "auto");
    expect(decision.isInspectable).toBe(true);
    expect(decision.defectFound).toBe("casting_defect");
    expect(decision.decision).toBe("FAIL");
    expect(decision.boundingBox).not.toBeNull();
  });

  it("flags forced scenarios so they are never shown as detections", () => {
    const decision = analyzeCameraFrame(drawScratch(drawCleanPart(createImageData(232, 232, 232))), "scratch");
    expect(decision.isForcedScenario).toBe(true);
  });

  it("publishes one demo event per part placement", () => {
    const presence = [true, true, true, true, true, true, false, false, false, false, true, true, true, true];
    let state = initialDemoSession;
    let publishCount = 0;
    presence.forEach((isInspectable) => {
      const next = advanceDemoSession(state, isInspectable);
      state = next.state;
      publishCount += next.shouldPublish ? 1 : 0;
    });
    expect(publishCount).toBe(2);
    expect(state.sessionCount).toBe(2);
  });

  it("does not split a session on a short dropout", () => {
    const presence = [true, true, true, false, false, true, true, true, true];
    let state = initialDemoSession;
    let publishCount = 0;
    presence.forEach((isInspectable) => {
      const next = advanceDemoSession(state, isInspectable);
      state = next.state;
      publishCount += next.shouldPublish ? 1 : 0;
    });
    expect(publishCount).toBe(1);
  });
});
