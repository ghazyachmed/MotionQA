import { describe, expect, it } from "vitest";
import { analyzeCameraFrame, calculateFrameStats } from "./cameraDemoAnalysis";

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
  for (let x = 94; x < 220; x += 1) {
    const y = Math.round(74 + (x - 94) * 0.34);
    drawDisc(imageData, x, y, 3, 248, 248, 248);
  }
  return imageData;
}

function drawCasting(imageData: ImageData): ImageData {
  const centers = [
    [96, 74],
    [116, 106],
    [142, 88],
    [164, 122],
    [184, 94],
    [204, 116],
    [222, 82],
    [236, 132],
  ];
  centers.forEach(([x, y]) => drawDisc(imageData, x, y, 4, 54, 54, 54));
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
      const index = (y * imageData.width + x) * 4;
      imageData.data[index] = redValue;
      imageData.data[index + 1] = greenValue;
      imageData.data[index + 2] = blueValue;
      imageData.data[index + 3] = 255;
    }
  }
}

// AI Assisted Logic
describe("cameraDemoAnalysis", () => {
  it("calculates normalized frame brightness", () => {
    const imageData = createImageData(255, 255, 255, 4, 4);
    const stats = calculateFrameStats({ data: imageData.data, width: imageData.width, height: imageData.height });
    expect(stats.brightnessScore).toBeCloseTo(1, 2);
  });

  it("keeps a clean part passed in auto mode", () => {
    const decision = analyzeCameraFrame(createImageData(120, 120, 120), "auto");
    expect(decision.defectFound).toBe("none");
    expect(decision.status).toBe("PASSED");
    expect(decision.boundingBox).toBeNull();
  });

  it("finds a scratch box from diagonal evidence", () => {
    const decision = analyzeCameraFrame(drawScratch(createImageData(122, 122, 122)), "auto");
    expect(decision.defectFound).toBe("scratch");
    expect(decision.status).toBe("FAILED");
    expect(decision.boundingBox).not.toBeNull();
  });

  it("finds casting defect from repeated pore evidence", () => {
    const decision = analyzeCameraFrame(drawCasting(createImageData(122, 122, 122)), "auto");
    expect(decision.defectFound).toBe("casting_defect");
    expect(decision.status).toBe("FAILED");
    expect(decision.boundingBox).not.toBeNull();
  });
});
