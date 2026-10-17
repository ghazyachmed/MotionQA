// Renders sample frames from every scene and every transition, then builds contact sheets.
//
//   node scripts/render-stills.mjs [--props=props/draft.json]
//
// Frames: start, middle and end of each segment, plus two frames around every cut.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timeline = JSON.parse(fs.readFileSync(path.join(videoRoot, "src", "data", "timeline.json"), "utf8"));
const props = process.argv.find((a) => a.startsWith("--props="))?.slice(8) ?? "props/draft.json";
const outDir = path.join(videoRoot, "out", "stills");

const frames = new Set();
const labels = {};
const add = (frame, label) => {
  const f = Math.max(0, Math.min(timeline.totalFrames - 1, Math.round(frame)));
  frames.add(f);
  labels[f] = labels[f] ? `${labels[f]} / ${label}` : label;
};
for (const [sceneName, scene] of Object.entries(timeline.scenes)) {
  for (const [segName, seg] of Object.entries(timeline.segments[sceneName])) {
    const start = scene.from + seg.from;
    add(start + 12, `${sceneName}.${segName} start`);
    add(start + seg.duration / 2, `${sceneName}.${segName} middle`);
    add(start + seg.duration - 12, `${sceneName}.${segName} end`);
    if (start > 0) {
      add(start - 2, `cut into ${sceneName}.${segName} (before)`);
      add(start + 3, `cut into ${sceneName}.${segName} (after)`);
    }
  }
}
const list = [...frames].sort((a, b) => a - b);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
execFileSync(path.join(videoRoot, "node_modules", ".bin", "remotion"), ["render", "MotionQADemo", outDir, `--frames=${list.join(",")}`, "--sequence", "--image-format=jpeg", "--jpeg-quality=90", `--props=${props}`, "--log=warn"], { stdio: "inherit", cwd: videoRoot });
fs.writeFileSync(path.join(outDir, "frames.json"), `${JSON.stringify(list.map((f) => ({ frame: f, seconds: Number((f / timeline.fps).toFixed(2)), label: labels[f] })), null, 2)}\n`);
execFileSync("python3", [path.join(videoRoot, "scripts", "contact_sheet.py"), outDir, path.join(videoRoot, "out")], { stdio: "inherit" });
console.log(`rendered ${list.length} frames to out/stills`);
