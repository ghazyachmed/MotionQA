// Checks the assets, captions, timeline and on-screen rules. Offline; never touches the network.
//
//   node scripts/verify-assets.mjs                    draft checks
//   node scripts/verify-assets.mjs --final            also require narration audio and refuse placeholders
//   node scripts/verify-assets.mjs --write-manifest   regenerate ASSET_MANIFEST.json (hashes, sources, licences)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSrt, maxLineChars, maxLines } from "./build-captions.mjs";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(videoRoot, "public");
const manifestPath = path.join(videoRoot, "ASSET_MANIFEST.json");
const finalMode = process.argv.includes("--final");
const writeManifest = process.argv.includes("--write-manifest");
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
const rel = (file) => path.relative(publicDir, file).split(path.sep).join("/");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const timeline = readJson(path.join(videoRoot, "src", "data", "timeline.json"));
const narration = readJson(path.join(videoRoot, "src", "data", "narration.json"));
const links = readJson(path.join(videoRoot, "src", "data", "links.json"));
const clips = ["aws-01-ui-status", "aws-02-model-status", "aws-03-health", "local-01-pass", "local-02-fail", "local-03-review", "local-04-missed-048", "local-05-identity-043", "local-06-retake-session"];

// 1. Timeline: 8400 frames at 30 fps, contiguous scenes and segments.
if (timeline.fps !== 30 || timeline.totalFrames !== 8400) fail(`timeline must be 8400 frames at 30 fps (is ${timeline.totalFrames} at ${timeline.fps})`);
let cursor = 0;
for (const [name, scene] of Object.entries(timeline.scenes)) {
  if (scene.from !== cursor) fail(`scene ${name} starts at ${scene.from}, expected ${cursor}`);
  cursor = scene.from + scene.duration;
  let segCursor = 0;
  for (const [segName, seg] of Object.entries(timeline.segments[name] ?? {})) {
    if (seg.from !== segCursor) fail(`segment ${name}.${segName} starts at ${seg.from}, expected ${segCursor}`);
    segCursor = seg.from + seg.duration;
  }
  if (segCursor !== scene.duration) fail(`segments of ${name} cover ${segCursor} of ${scene.duration} frames`);
}
if (cursor !== timeline.totalFrames) fail(`scenes cover ${cursor} of ${timeline.totalFrames} frames`);
if (timeline.totalFrames / timeline.fps > 300) fail("duration exceeds 300 s");

// 2. Footage: present, sidecar hash matches, long enough for its segment, local clips labelled.
const missingFootage = [];
for (const clip of clips) {
  const mp4 = path.join(publicDir, "assets", "footage", `${clip}.mp4`);
  const json = path.join(publicDir, "assets", "footage", `${clip}.json`);
  if (!fs.existsSync(mp4) || !fs.existsSync(json)) {
    missingFootage.push(clip);
    continue;
  }
  const sidecar = readJson(json);
  if (sidecar.sha256 !== sha256(mp4)) fail(`${clip}: sidecar sha256 does not match the mp4 (stale sidecar?)`);
  if (clip.startsWith("local-") && sidecar.label !== "Local demonstration") fail(`${clip}: label must be "Local demonstration"`);
  if (!sidecar.recordedAtUtc) fail(`${clip}: no recording timestamp`);
  for (const scene of Object.values(timeline.segments)) {
    for (const seg of Object.values(scene)) {
      if (seg.clip === clip && seg.duration + (seg.trim ?? 0) > sidecar.outputFrames) fail(`${clip}: segment needs ${seg.duration + (seg.trim ?? 0)} frames, clip has ${sidecar.outputFrames}`);
    }
  }
  if (clip === "aws-03-health" && 60 + sidecar.outputFrames > timeline.segments.app.awsJson.duration + 1) fail("aws-03-health outlasts its segment");
}
if (missingFootage.length) (finalMode ? fail : (m) => notes.push(m))(`demo footage missing: ${missingFootage.join(", ")}`);

// 3. Captions: generated from narration.json, two lines at most, no overlaps, readable pace.
const srtPath = path.join(publicDir, "captions", "en.srt");
if (!fs.existsSync(srtPath)) fail("public/captions/en.srt missing");
else if (fs.readFileSync(srtPath, "utf8") !== buildSrt(narration.cues)) fail("en.srt is out of date; run npm run captions");
let previousEnd = 0;
for (const cue of narration.cues) {
  const words = cue.text.split(/\s+/).length;
  const duration = cue.end - cue.start;
  if (cue.start < previousEnd) fail(`cue at ${cue.start}s overlaps the previous cue`);
  if (cue.end > timeline.totalFrames / timeline.fps) fail(`cue at ${cue.start}s ends after the video`);
  if (duration < 1.5) fail(`cue at ${cue.start}s is shorter than 1.5 s`);
  if (words / duration > 3.0) fail(`cue at ${cue.start}s needs ${(words / duration).toFixed(2)} words/s (max 3.0)`);
  previousEnd = cue.end;
}
// Highlight phrases must sit on one caption line, or the marker would not render.
{
  const blocks = fs.existsSync(srtPath) ? fs.readFileSync(srtPath, "utf8").trim().split(/\n\n/) : [];
  narration.cues.forEach((cue, index) => {
    const lines = (blocks[index] ?? "").split("\n").slice(2);
    for (const phrase of cue.highlight ?? []) if (!lines.some((line) => line.includes(phrase))) fail(`cue at ${cue.start}s: highlight "${phrase}" is not on a single caption line`);
  });
}
for (const block of fs.existsSync(srtPath) ? fs.readFileSync(srtPath, "utf8").trim().split(/\n\n/) : []) {
  const lines = block.split("\n").slice(2);
  if (lines.length > maxLines) fail(`caption ${block.split("\n")[0]} has ${lines.length} lines`);
  for (const line of lines) if (line.length > maxLineChars) fail(`caption line over ${maxLineChars} chars: ${line}`);
}

// 4. Source rules: font sizes, offline media, labels.
const srcFiles = walk(path.join(videoRoot, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const theme = fs.readFileSync(path.join(videoRoot, "src", "theme.ts"), "utf8");
const sizeBlock = theme.slice(theme.indexOf("export const size"), theme.indexOf("};", theme.indexOf("export const size")));
for (const [, name, value] of sizeBlock.matchAll(/(\w+): (\d+)/g)) {
  const min = name === "caption" ? 30 : 32;
  if (Number(value) < min) fail(`theme size.${name} = ${value} px is below ${min} px`);
}
for (const file of srcFiles) {
  const text = fs.readFileSync(file, "utf8");
  const name = path.relative(videoRoot, file);
  for (const [, value] of text.matchAll(/fontSize[:=]\s*\{?(\d+)/g)) if (Number(value) < 32) fail(`${name}: fontSize ${value} below 32 px`);
  if (/src=\{?["'`]https?:/.test(text) || /fetch\(\s*["'`]https?:/.test(text)) fail(`${name}: loads media from the network`);
  if (/@remotion\/google-fonts|fonts\.googleapis/.test(text)) fail(`${name}: uses network fonts`);
}
const scenesText = srcFiles.filter((f) => f.includes(`${path.sep}scenes${path.sep}`)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
if (!scenesText.includes("Local demonstration")) fail('scenes do not label local footage "Local demonstration"');
if (!scenesText.includes("Exploratory development results")) fail('scenes lack the label "Exploratory development results"');

// 5. Links shown to judges.
for (const [key, link] of Object.entries(links)) {
  if (!link.url || !link.url.startsWith("https://")) fail(`link ${key} is empty or not https`);
  if (!link.ok || !link.checkedAtUtc) fail(`link ${key} not verified (run node scripts/check-links.mjs)`);
}

// 6. Manifest: every public file listed with hash, source, licence and purpose.
const publicFiles = walk(publicDir).filter((f) => !f.endsWith(".DS_Store"));
if (writeManifest) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(buildManifest(publicFiles), null, 2)}\n`);
  console.log(`wrote ASSET_MANIFEST.json (${publicFiles.length} files)`);
}
if (!fs.existsSync(manifestPath)) fail("ASSET_MANIFEST.json missing; run with --write-manifest");
else {
  const manifest = readJson(manifestPath);
  const byPath = new Map(manifest.assets.map((a) => [a.path, a]));
  for (const file of publicFiles) {
    const entry = byPath.get(`public/${rel(file)}`);
    if (!entry) fail(`ASSET_MANIFEST.json lacks public/${rel(file)}`);
    else {
      if (entry.sha256 !== sha256(file)) fail(`ASSET_MANIFEST.json hash differs for public/${rel(file)}`);
      for (const field of ["source", "license", "purpose"]) if (!entry[field]) fail(`ASSET_MANIFEST.json: public/${rel(file)} has no ${field}`);
    }
  }
  for (const entry of manifest.assets) if (!fs.existsSync(path.join(videoRoot, entry.path))) fail(`ASSET_MANIFEST.json lists missing file ${entry.path}`);
}

// 7. Final-only requirements.
const audio = ["audio/narration.wav", "audio/narration.mp3", "audio/narration.m4a"].map((p) => path.join(publicDir, p)).find((p) => fs.existsSync(p));
if (finalMode) {
  if (!audio) fail("final: narration audio missing (public/audio/narration.wav); a caption-only video is a draft");
  else {
    const seconds = Number(execFileSync(path.join(videoRoot, "node_modules", ".bin", "remotion"), ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], { encoding: "utf8" }).trim());
    if (!(seconds > 0) || seconds > 300) fail(`final: narration audio length ${seconds}s is outside (0, 300]`);
    if (seconds < narration.cues[narration.cues.length - 1].end - 5) fail(`final: narration audio (${seconds}s) is shorter than the captions; re-sync narration.json to the recording`);
  }
  if (/^TEXT ONLY/.test(narration.status)) fail("final: narration.json status still says TEXT ONLY; update it after syncing captions to the recording");
  const placeholder = /\b(TODO|TBD|FIXME|PLACEHOLDER|lorem ipsum)\b/i;
  for (const file of [...srcFiles, srtPath, path.join(videoRoot, "NARRATION.md")]) {
    if (fs.existsSync(file) && placeholder.test(fs.readFileSync(file, "utf8"))) fail(`final: placeholder text in ${path.relative(videoRoot, file)}`);
  }
  const finalProps = readJson(path.join(videoRoot, "props", "final.json"));
  if (finalProps.mode !== "final") fail("final: props/final.json must set mode final (no draft watermark)");
} else if (!audio) {
  notes.push("narration audio missing: draft only (watermark DRAFT — NARRATION AUDIO MISSING)");
}

function buildManifest(files) {
  const purpose = {
    "aws-01-ui-status": "Deployed UI on CloudFront without a token: model status line, data panels answer HTTP 401",
    "aws-02-model-status": "GET /api/v1/model/status on the AWS endpoint",
    "aws-03-health": "GET /api/v1/health on the AWS endpoint",
    "local-01-pass": "Real inference, PASS on test image Normal/0011",
    "local-02-fail": "Real inference, FAIL on test image Anomaly/000, then reviewer confirmation",
    "local-03-review": "Real inference, REVIEW on test image Normal/0027",
    "local-04-missed-048": "Real inference, PASS on defective test image Anomaly/048 (missed defect)",
    "local-05-identity-043": "Real inference, REVIEW (identity uncertain) on test image Anomaly/043",
    "local-06-retake-session": "Real inference, RETAKE on a synthetic blur, then PASS in the same session",
  };
  const assets = files.map((file) => {
    const p = rel(file);
    const base = path.basename(p).replace(/\.(mp4|json)$/, "");
    const entry = { path: `public/${p}`, sha256: sha256(file), bytes: fs.statSync(file).size };
    if (p.startsWith("assets/footage/")) {
      const sidecar = readJson(path.join(publicDir, "assets", "footage", `${base}.json`));
      const isLocal = base.startsWith("local-");
      Object.assign(entry, {
        source: isLocal
          ? "Screen recording of the local MotionQA app (uvicorn + Vite, Apple M2) by scripts/capture-demo.mjs local; headless Chrome CDP screencast"
          : "Screen recording of https://d4dqbqmvvujy7.cloudfront.net public routes without a token by scripts/capture-demo.mjs aws",
        license: "Recording made by the team for this video; shows VisA pcb1 images (CC BY 4.0, Zou et al., ECCV 2022)",
        purpose: p.endsWith(".json") ? `Capture metadata for ${base}: timestamps, events, API results` : purpose[base],
        label: sidecar.label,
        recordedAtUtc: sidecar.recordedAtUtc,
        appCommit: sidecar.appCommit,
        appTreeCleanAtCapture: sidecar.appTreeCleanAtCapture,
        browser: `Chrome ${sidecar.browser}`,
      });
    } else if (p.startsWith("assets/evidence/")) {
      const info = readJson(path.join(publicDir, "assets", "evidence", p.endsWith(".source.json") ? path.basename(p) : `${path.basename(p)}.source.json`));
      Object.assign(entry, {
        source: `Evidence overlay written by the local MotionQA API for inspection ${info.inspectionId} (clip ${info.clip}); copied by scripts/collect-evidence.mjs`,
        license: "Derived from VisA pcb1 (CC BY 4.0, Zou et al., ECCV 2022)",
        purpose: p.endsWith(".json") ? "Provenance of the evidence overlay" : "Model evidence for Anomaly/048 in the failure explanation",
        recordedAtUtc: info.recordedAtUtc,
      });
    } else if (p.startsWith("assets/pipeline/")) {
      Object.assign(entry, {
        source: "Intermediate output of the MotionQA OpenCV 5 pipeline (locatePart, measureCapture, cropPartSquare, OpenCV DNN features, PatchCoreScorer, renderOverlay) for VisA pcb1 Anomaly/000 or 048, scripts/export_pipeline_stages.py",
        license: "Derived from VisA pcb1 (CC BY 4.0, Zou et al., ECCV 2022)",
        purpose: p.includes("048") ? "Anomaly map of the missed defect with the VisA ground-truth outline (dataset label) and the map maximum" : "Architecture dissection: one stage of the real pipeline",
      });
    } else if (p === "assets/dataset/anomaly-048-groundtruth-crop.jpg") {
      Object.assign(entry, { source: "VisA pcb1 Anomaly/048.JPG with the VisA ground-truth mask outline, scripts/prepare_dataset_figures.py (OpenCV 5)", license: "CC BY 4.0 (VisA, Zou et al., ECCV 2022)", purpose: "Shows where the missing pin is; labelled as a dataset label, not model output" });
    } else if (p.startsWith("assets/dataset/")) {
      Object.assign(entry, { source: "VisA pcb1 Normal/0011.JPG (test split), copied by scripts/prepare_dataset_figures.py", license: "CC BY 4.0 (VisA, Zou et al., ECCV 2022)", purpose: "Board photo on the title card" });
    } else if (p === "captions/en.srt") {
      Object.assign(entry, { source: "Generated from src/data/narration.json by scripts/build-captions.mjs", license: "Team text", purpose: "Burned-in English captions; also delivered as a sidecar file" });
    } else if (p.startsWith("fonts/") && p.endsWith(".woff2")) {
      Object.assign(entry, { source: p.includes("inter") ? "@fontsource/inter 5.3.0 (npm)" : p.includes("caveat") ? "@fontsource/caveat 5.3.0 (npm)" : "@fontsource/jetbrains-mono 5.3.0 (npm)", license: "SIL Open Font License 1.1", purpose: p.includes("caveat") ? "Handwritten kicker and annotation layer, loaded locally" : "On-screen typography, loaded locally" });
    } else if (p.startsWith("fonts/") && p.endsWith(".txt")) {
      Object.assign(entry, { source: "LICENSE file of the @fontsource package", license: "SIL Open Font License 1.1 (text)", purpose: "Licence text shipped with the fonts" });
    } else if (p.startsWith("audio/")) {
      Object.assign(entry, { source: "Narration recording supplied by the team", license: "Team recording", purpose: "Narration track" });
    }
    return entry;
  });
  return {
    note: "Hashes identify these exact files. They do not show that the dataset images are independent of model development.",
    generatedBy: "node scripts/verify-assets.mjs --write-manifest",
    assets,
  };
}

if (failures.length) {
  console.error(`verify-assets${finalMode ? " --final" : ""}: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
for (const n of notes) console.log(`  · ${n}`);
console.log(`verify-assets${finalMode ? " --final" : ""}: ok (${publicFiles.length} public files, ${narration.cues.length} cues)`);
