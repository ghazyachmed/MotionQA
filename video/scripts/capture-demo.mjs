// Records real MotionQA screen footage with headless Chrome and the CDP screencast.
//
//   node scripts/capture-demo.mjs local   (needs the local stack and MOTIONQA_DEMO_TOKEN_FILE)
//   node scripts/capture-demo.mjs aws     (public, unauthenticated pages of the deployed endpoint only)
//
// The operator token is read from a file and written to the tab's sessionStorage before the page loads, the same
// place the UI keeps it after "Set". It is never typed, never shown on screen, and never written to any output.
// Each clip becomes public/assets/footage/<clip>.mp4 plus a JSON sidecar with timestamps, events and API results.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(videoRoot, "..");
const footageDir = path.join(videoRoot, "public", "assets", "footage");
const framesRoot = path.join(videoRoot, ".capture-frames");
const chromePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const imagesDir = path.join(repoRoot, "data", "visa", "pcb1", "Data", "Images");
const awsBase = "https://d4dqbqmvvujy7.cloudfront.net";
const localBase = process.env.MOTIONQA_DEMO_UI ?? "http://127.0.0.1:5173";
const fps = 30;

const target = process.argv[2];
if (target !== "local" && target !== "aws") {
  console.error("usage: node scripts/capture-demo.mjs local|aws");
  process.exit(2);
}

fs.mkdirSync(footageDir, { recursive: true });
fs.mkdirSync(framesRoot, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const remotionBin = path.join(videoRoot, "node_modules", ".bin", "remotion");

function gitHead() {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function appTreeClean() {
  try {
    const out = execFileSync("git", ["-C", repoRoot, "status", "--porcelain", "--", "backend", "frontend"], { encoding: "utf8" });
    return out.trim() === "";
  } catch {
    return null;
  }
}

// One clip = one screencast session. Frames are stamped when Node receives them: on a static page the compositor
// timestamp of the first frame can be seconds old, which would stretch the clip. The encoder outputs constant 30 fps.
async function recordClip(page, clip, actions) {
  const dir = path.join(framesRoot, clip.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    const receivedAt = Date.now() / 1000;
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: receivedAt });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
  });
  const startedAt = new Date();
  const t0 = startedAt.getTime() / 1000;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const events = [];
  const mark = (label, extra = {}) => events.push({ atSeconds: Number((Date.now() / 1000 - t0).toFixed(2)), label, ...extra });
  await actions(mark);
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  if (frames.length === 0) {
    throw new Error(`${clip.name}: no screencast frames received`);
  }

  // Constant-rate sequence: output frame i shows the newest captured frame received at or before t0 + i / fps.
  // Each output frame is a hard link, so the clip length is exactly round((t1 - t0) * fps) frames.
  const seqDir = path.join(dir, "cfr");
  fs.mkdirSync(seqDir, { recursive: true });
  const outputFrames = Math.round((t1 - t0) * fps);
  let source = 0;
  for (let i = 0; i < outputFrames; i += 1) {
    const at = t0 + i / fps;
    while (source + 1 < frames.length && frames[source + 1].t <= at) source += 1;
    fs.linkSync(frames[source].file, path.join(seqDir, `${String(i).padStart(6, "0")}.jpg`));
  }

  const outFile = path.join(footageDir, `${clip.name}.mp4`);
  execFileSync(
    remotionBin,
    ["ffmpeg", "-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(seqDir, "%06d.jpg"), "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-movflags", "+faststart", "-an", outFile],
    { stdio: "inherit" },
  );
  const durationSeconds = Number((t1 - t0).toFixed(2));
  const sidecar = {
    clip: clip.name,
    target,
    label: target === "local" ? "Local demonstration" : "AWS deployment (public status pages, no token)",
    url: page.url(),
    recordedAtUtc: startedAt.toISOString(),
    durationSeconds,
    capturedFrames: frames.length,
    outputFrames,
    fps,
    viewport: page.viewportSize(),
    browser: clip.browserVersion,
    appCommit: target === "local" ? gitHead() : "a9acfa4 (release recorded in evaluation/aws-2026-10-16/README.md)",
    appTreeCleanAtCapture: target === "local" ? appTreeClean() : null,
    inputs: clip.inputs ?? [],
    events,
    apiResults: clip.apiResults ?? [],
    sha256: sha256(outFile),
  };
  fs.writeFileSync(path.join(footageDir, `${clip.name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`${clip.name}: ${frames.length} frames, ${durationSeconds}s -> ${path.relative(videoRoot, outFile)}`);
  return sidecar;
}

function inputRecord(file, note) {
  return { path: path.relative(repoRoot, file), sha256: sha256(file), note };
}

// Keeps only result fields; request headers (with the token) are never read.
function watchInspections(page, sink) {
  page.on("response", async (response) => {
    if (!/\/api\/v1\/sessions\/[^/]+\/attempts$/.test(new URL(response.url()).pathname)) return;
    try {
      const body = await response.json();
      const inspection = body.inspection ?? {};
      sink.push({
        httpStatus: response.status(),
        inspectionId: inspection.inspectionId,
        decision: inspection.decision,
        reasonCode: inspection.reasonCode,
        anomalyScore: inspection.scores?.anomalyScore ?? null,
        identityDistance: inspection.scores?.identityDistance ?? null,
        passBelow: inspection.thresholds?.passBelow ?? null,
        failAtOrAbove: inspection.thresholds?.failAtOrAbove ?? null,
        inferenceMs: inspection.latency?.inferenceMs ?? null,
        totalMs: inspection.latency?.totalMs ?? null,
        modelId: inspection.modelId,
        modelVersion: inspection.modelVersion,
        processingMode: inspection.processingMode,
        sessionStatus: body.session?.status,
        sessionAttempts: body.session?.attempts?.length,
      });
    } catch {
      // Non-JSON error bodies are visible in the footage itself.
    }
  });
}

async function uploadAndWait(page, file, mark, results) {
  const before = results.length;
  mark(`upload ${file.startsWith(imagesDir) ? path.relative(imagesDir, file) : path.basename(file)}`);
  await page.locator('input[type="file"]').setInputFiles(file);
  const deadline = Date.now() + 20000;
  while (results.length === before) {
    if (Date.now() > deadline) throw new Error(`no inspection result for ${file}`);
    await sleep(50);
  }
  const result = results[results.length - 1];
  // Let the evidence image load and paint before the hold starts.
  await page
    .locator('img[alt^="Inspection evidence"]')
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => undefined);
  await sleep(400);
  mark(`result ${result.decision} ${result.reasonCode}`, { decision: result.decision, reasonCode: result.reasonCode, anomalyScore: result.anomalyScore });
  return result;
}

async function captureLocal(browser) {
  const tokenFile = process.env.MOTIONQA_DEMO_TOKEN_FILE;
  if (!tokenFile || !fs.existsSync(tokenFile)) {
    throw new Error("Set MOTIONQA_DEMO_TOKEN_FILE to a file holding a local operator token.");
  }
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  await context.addInitScript((value) => window.sessionStorage.setItem("motionqa.operatorToken", value), token);
  const page = await context.newPage();
  const results = [];
  watchInspections(page, results);
  await page.goto(localBase, { waitUntil: "networkidle" });
  await page.getByText("OpenCV 5.0.0").first().waitFor({ timeout: 15000 });
  const browserVersion = browser.version();
  const img = (name) => path.join(imagesDir, name);

  const plan = [
    { name: "local-01-pass", files: [["Normal/0011.JPG", "test split, normal"]], leadMs: 2500, holdMs: 7300 },
    { name: "local-02-fail", files: [["Anomaly/000.JPG", "test split, anomaly (bent)"]], leadMs: 1500, holdMs: 5300, confirm: true },
    { name: "local-03-review", files: [["Normal/0027.JPG", "test split, normal"]], leadMs: 1500, holdMs: 7300 },
    { name: "local-04-missed-048", files: [["Anomaly/048.JPG", "test split, anomaly (missing header pin)"]], leadMs: 1500, holdMs: 7300 },
    { name: "local-05-identity-043", files: [["Anomaly/043.JPG", "test split, anomaly (both transducers missing)"]], leadMs: 1500, holdMs: 7300 },
    {
      name: "local-06-retake-session",
      files: [
        [path.join(videoRoot, "capture-inputs", "Normal-0011-blur-0.006.jpg"), "synthetic Gaussian blur of Normal/0011 (sigma 0.6 % of long side, runLocalDemo.blurred_copy)"],
        ["Normal/0011.JPG", "test split, normal (sharp original, same session)"],
      ],
      leadMs: 1500,
      holdMs: 6300,
      betweenMs: 5000,
    },
  ];

  const sidecars = [];
  for (const step of plan) {
    // Fresh page per clip: the UI keeps no history across loads, so every clip starts at "Awaiting capture"
    // instead of showing the previous clip's result.
    await page.goto(localBase, { waitUntil: "networkidle" });
    await page.getByText("OpenCV 5.0.0").first().waitFor({ timeout: 15000 });
    const clipResults = [];
    const inputs = step.files.map(([name, note]) => inputRecord(path.isAbsolute(name) ? name : img(name), note));
    const clip = { name: step.name, browserVersion, inputs, apiResults: clipResults };
    sidecars.push(
      await recordClip(page, clip, async (mark) => {
        await sleep(step.leadMs);
        for (const [index, [name]] of step.files.entries()) {
          const file = path.isAbsolute(name) ? name : img(name);
          clipResults.push(await uploadAndWait(page, file, mark, results));
          if (index + 1 < step.files.length) await sleep(step.betweenMs ?? 4000);
        }
        if (step.confirm) {
          await sleep(4000);
          mark("reviewer clicks Confirm FAIL");
          await page.locator('section[aria-label="Current inspection"]').getByRole("button", { name: "Confirm FAIL" }).click();
          await page.getByText("Machine: Fail").first().waitFor({ timeout: 10000 });
          mark("final decision shown; machine decision kept");
        }
        await sleep(step.holdMs);
      }),
    );
  }
  await context.close();
  return sidecars;
}

async function captureAws(browser) {
  const browserVersion = browser.version();
  const sidecars = [];
  const uiContext = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const uiPage = await uiContext.newPage();
  await uiPage.goto(awsBase, { waitUntil: "load" });
  await uiPage.getByText("OpenCV 5.0.0").first().waitFor({ timeout: 20000 });
  sidecars.push(
    await recordClip(uiPage, { name: "aws-01-ui-status", browserVersion }, async (mark) => {
      mark("deployed UI loaded without a token: model status from AWS, data panels answer HTTP 401");
      await sleep(8000);
    }),
  );
  await uiContext.close();

  const jsonContext = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const jsonPage = await jsonContext.newPage();
  for (const [name, route, holdMs] of [
    ["aws-02-model-status", "/api/v1/model/status", 7000],
    ["aws-03-health", "/api/v1/health", 5000],
  ]) {
    await jsonPage.goto(`${awsBase}${route}`, { waitUntil: "load" });
    const body = await jsonPage.evaluate(() => document.body.innerText);
    sidecars.push(
      await recordClip(jsonPage, { name, browserVersion, apiResults: [{ route, body: JSON.parse(body) }] }, async (mark) => {
        mark(`GET ${route}`);
        await sleep(holdMs);
      }),
    );
  }
  await jsonContext.close();
  return sidecars;
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const sidecars = target === "local" ? await captureLocal(browser) : await captureAws(browser);
  console.log(JSON.stringify(sidecars.map((s) => ({ clip: s.clip, results: s.apiResults.map((r) => r.decision ?? r.route) })), null, 2));
} finally {
  await browser.close();
}
