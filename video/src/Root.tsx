import type React from "react";
import { Composition, getStaticFiles } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { MotionQADemo } from "./MotionQADemo";
import type { MotionQADemoProps } from "./MotionQADemo";
import { FPS, TOTAL_FRAMES, footageClips } from "./timeline";

// Files the video needs from public/. Final mode refuses to render without every one of them and a narration track.
const requiredAssets = [
  ...footageClips.map((clip) => `assets/footage/${clip}.mp4`),
  "assets/dataset/anomaly-048-groundtruth-crop.jpg",
  "assets/dataset/normal-0011.jpg",
  "assets/pipeline/anomaly-000-0-photo.jpg",
  "assets/pipeline/anomaly-048-map-gt.jpg",
  "assets/qr/live-endpoint.png",
  "captions/en.srt",
];
const narrationCandidates = ["audio/narration.wav", "audio/narration.mp3", "audio/narration.m4a"];

const calculateMetadata: CalculateMetadataFunction<MotionQADemoProps> = ({ props }) => {
  const present = new Set(getStaticFiles().map((file) => file.name));
  const missingAssets = requiredAssets.filter((asset) => !present.has(asset));
  const narrationFile = narrationCandidates.find((candidate) => present.has(candidate)) ?? null;
  if (props.mode === "final") {
    const blockers = [...missingAssets.map((asset) => `missing ${asset}`), ...(narrationFile ? [] : ["missing narration audio (public/audio/narration.wav)"])];
    if (blockers.length) {
      throw new Error(`Final render blocked: ${blockers.join("; ")}. Render the draft instead (npm run render:draft).`);
    }
  }
  return { props: { ...props, missingAssets, narrationFile } };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MotionQADemo"
    component={MotionQADemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ mode: "draft", missingAssets: [], narrationFile: null } satisfies MotionQADemoProps}
    calculateMetadata={calculateMetadata}
  />
);
