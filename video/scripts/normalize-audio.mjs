// Normalises public/audio/narration.wav to -16 LUFS integrated, true peak <= -1.5 dBTP (EBU R128 loudnorm),
// with Remotion's bundled FFmpeg, and records the measurement in src/data/narration-audio.json.
//
//   node scripts/normalize-audio.mjs
//
// Run it after scripts/tts_narration.py. Timing is unchanged: loudnorm keeps sample positions.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remotion = path.join(videoRoot, "node_modules", ".bin", "remotion");
const wav = path.join(videoRoot, "public", "audio", "narration.wav");
const tmp = path.join(videoRoot, "public", "audio", "narration.normalized.wav");
const reportPath = path.join(videoRoot, "src", "data", "narration-audio.json");

function ffmpeg(args) {
  const result = spawnSync(remotion, ["ffmpeg", "-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}

// FFmpeg prints the loudnorm measurement as JSON on stderr.
function stats(file) {
  const text = ffmpeg(["-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  const parsed = JSON.parse(text.slice(text.lastIndexOf("{"), text.lastIndexOf("}") + 1));
  return { integratedLufs: Number(parsed.input_i), truePeakDbtp: Number(parsed.input_tp), loudnessRange: Number(parsed.input_lra) };
}

const before = stats(wav);
ffmpeg(["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", tmp]);
fs.renameSync(tmp, wav);
const after = stats(wav);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
report.loudness = { method: "FFmpeg loudnorm I=-16 TP=-1.5 LRA=11, 48 kHz mono", before, after };
report.sampleRate = 48000;
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 1)}\n`);
console.log(`narration loudness ${before.integratedLufs} LUFS → ${after.integratedLufs} LUFS, true peak ${after.truePeakDbtp} dBTP`);
