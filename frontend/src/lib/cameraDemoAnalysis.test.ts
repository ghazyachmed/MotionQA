import { describe, expect, it } from "vitest";
import { analyzeCameraFrame, calculateFrameStats } from "./cameraDemoAnalysis";

function createImageData(redValue: number, greenValue: number, blueValue: number): ImageData {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = redValue;
    data[index + 1] = greenValue;
    data[index + 2] = blueValue;
    data[index + 3] = 255;
  }
  return { data, width: 4, height: 4, colorSpace: "srgb" } as ImageData;
}

// AI Assisted Logic
describe("cameraDemoAnalysis", () => {
  it("calculates normalized frame brightness", () => {
    const stats = calculateFrameStats({ data: createImageData(255, 255, 255).data, width: 4, height: 4 });
    expect(stats.brightnessScore).toBeCloseTo(1, 2);
  });

  it("uses explicit defect mode for deterministic local MVP demos", () => {
    const decision = analyzeCameraFrame(createImageData(120, 120, 120), "scratch");
    expect(decision.defectFound).toBe("scratch");
    expect(decision.status).toBe("FAILED");
    expect(decision.boundingBox).not.toBeNull();
  });
});

