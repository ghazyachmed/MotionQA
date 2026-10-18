// Captures the three app screenshots for the Devpost image gallery from the real local app (3:2, 2880 x 1920 JPEG).
//
//   MOTIONQA_DEMO_TOKEN_FILE=/path/to/token node scripts/capture-gallery.mjs
//
// Same token handling as capture-demo.mjs: written to sessionStorage before load, never typed, shown or stored.
// Writes out/gallery/1-inspection-result.jpg, 2-retake.jpg, 3-human-review.jpg and out/gallery/app-shots.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(videoRoot, "..");
const outDir = path.join(videoRoot, "out", "gallery");
const images = path.join(repoRoot, "data", "visa", "pcb1", "Data", "Images");
const base = process.env.MOTIONQA_DEMO_UI ?? "http://127.0.0.1:5173";
const tokenFile = process.env.MOTIONQA_DEMO_TOKEN_FILE;
if (!tokenFile || !fs.existsSync(tokenFile)) {
  console.error("Set MOTIONQA_DEMO_TOKEN_FILE to a file holding a local operator token.");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await context.addInitScript((value) => window.sessionStorage.setItem("motionqa.operatorToken", value), fs.readFileSync(tokenFile, "utf8").trim());
const page = await context.newPage();
const results = [];
page.on("response", async (response) => {
  if (!/\/api\/v1\/sessions\/[^/]+\/attempts$/.test(new URL(response.url()).pathname)) return;
  try {
    const body = await response.json();
    const i = body.inspection ?? {};
    results.push({ inspectionId: i.inspectionId, decision: i.decision, reasonCode: i.reasonCode, anomalyScore: i.scores?.anomalyScore ?? null, modelVersion: i.modelVersion });
  } catch {
    // Error bodies are visible in the screenshot.
  }
});

async function freshPage() {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByText("OpenCV 5.0.0").first().waitFor({ timeout: 15000 });
}

async function inspect(file) {
  const before = results.length;
  await page.locator('input[type="file"]').setInputFiles(file);
  for (let waited = 0; results.length === before; waited += 50) {
    if (waited > 20000) throw new Error(`no result for ${file}`);
    await sleep(50);
  }
  await page.locator('img[alt^="Inspection evidence"]').first().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  await sleep(900);
  return results[results.length - 1];
}

const shots = [];
async function shot(name, input, extra) {
  await page.screenshot({ path: path.join(outDir, name), type: "jpeg", quality: 90 });
  shots.push({ file: name, input: path.relative(repoRoot, input), capturedAtUtc: new Date().toISOString(), ...extra });
  console.log(`${name}: ${JSON.stringify(extra)}`);
}

try {
  await freshPage();
  const failInput = path.join(images, "Anomaly", "000.JPG");
  await shot("1-inspection-result.jpg", failInput, { result: await inspect(failInput) });

  await freshPage();
  const blurInput = path.join(videoRoot, "capture-inputs", "Normal-0011-blur-0.006.jpg");
  await shot("2-retake.jpg", blurInput, { result: await inspect(blurInput), note: "synthetic blur of Normal/0011" });

  await freshPage();
  const reviewInput = path.join(images, "Normal", "0027.JPG");
  const review = await inspect(reviewInput);
  await page.locator('section[aria-label="Current inspection"]').getByRole("button", { name: "Accept PASS" }).click();
  await page.getByText("Machine:").first().waitFor({ timeout: 10000 });
  await sleep(900);
  await shot("3-human-review.jpg", reviewInput, { result: review, reviewerAction: "Accept PASS" });

  fs.writeFileSync(path.join(outDir, "app-shots.json"), `${JSON.stringify({ label: "Local demonstration (real inference, local stack)", viewport: "1440x960 @2x", shots }, null, 2)}\n`);
} finally {
  await browser.close();
}
