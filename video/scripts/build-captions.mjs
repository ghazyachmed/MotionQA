// Builds public/captions/en.srt and NARRATION.md from src/data/narration.json.
// Lines are wrapped here, once, so the renderer and the checks see the same two-line layout.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const maxLineChars = 52;
export const maxLines = 2;

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function wrapCaption(text) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxLineChars) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  // Balance two lines so the second line is not a single orphan word.
  if (lines.length === 2) {
    const all = text.split(/\s+/);
    let best = lines;
    let bestDiff = Math.abs(lines[0].length - lines[1].length);
    for (let i = 1; i < all.length; i += 1) {
      // Keep "OpenCV 5", "board 048" and similar pairs together.
      if (/^\d/.test(all[i]) && /[A-Za-z]$/.test(all[i - 1])) continue;
      const a = all.slice(0, i).join(" ");
      const b = all.slice(i).join(" ");
      const diff = Math.abs(a.length - b.length);
      if (a.length <= maxLineChars && b.length <= maxLineChars && diff < bestDiff) {
        best = [a, b];
        bestDiff = diff;
      }
    }
    return best;
  }
  return lines;
}

export function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}

export function buildSrt(cues) {
  return `${cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${wrapCaption(cue.text).join("\n")}\n`).join("\n")}`;
}

function buildNarrationMarkdown(narration) {
  const sceneNames = { team: "Team and problem", app: "Application working", review: "Review and failures", architecture: "Architecture", evaluation: "Evaluation", limits: "Limits and access" };
  const parts = [
    "# MotionQA video narration (English)",
    "",
    `Status: ${narration.status}`,
    "",
    `Basis: ${narration.basis}`,
    "",
    "Generated from `src/data/narration.json` by `npm run captions`. Edit the JSON, not this file.",
    "",
  ];
  let scene = null;
  for (const cue of narration.cues) {
    if (cue.scene !== scene) {
      scene = cue.scene;
      parts.push(`## ${sceneNames[scene] ?? scene}`, "");
    }
    parts.push(`- \`${srtTime(cue.start).slice(3, 8)}\` ${cue.text}`);
  }
  const words = narration.cues.reduce((sum, cue) => sum + cue.text.split(/\s+/).length, 0);
  parts.push("", `Total: ${narration.cues.length} cues, ${words} words.`, "");
  return parts.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const narration = JSON.parse(fs.readFileSync(path.join(videoRoot, "src", "data", "narration.json"), "utf8"));
  for (const cue of narration.cues) {
    const lines = wrapCaption(cue.text);
    if (lines.length > maxLines) {
      console.error(`cue at ${cue.start}s needs ${lines.length} lines: ${cue.text}`);
      process.exit(1);
    }
  }
  fs.mkdirSync(path.join(videoRoot, "public", "captions"), { recursive: true });
  fs.writeFileSync(path.join(videoRoot, "public", "captions", "en.srt"), buildSrt(narration.cues));
  fs.writeFileSync(path.join(videoRoot, "NARRATION.md"), buildNarrationMarkdown(narration));
  console.log(`wrote public/captions/en.srt and NARRATION.md (${narration.cues.length} cues)`);
}
