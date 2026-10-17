import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Captions } from "./components/Captions";
import { Paper } from "./components/kit";
import { Watermark } from "./components/Watermark";
import "./fonts";
import { AppScene } from "./scenes/AppScene";
import { ArchitectureScene } from "./scenes/ArchitectureScene";
import { EvaluationScene } from "./scenes/EvaluationScene";
import { LimitsScene } from "./scenes/LimitsScene";
import { ReviewScene } from "./scenes/ReviewScene";
import { TeamScene } from "./scenes/TeamScene";
import type { FootageClipName } from "./timeline";
import { scenes } from "./timeline";

export type MotionQADemoProps = {
  mode: "draft" | "final";
  // Filled by calculateMetadata from the files present in public/.
  missingAssets: string[];
  narrationFile: string | null;
};

export const draftReasons = (props: MotionQADemoProps): string[] => {
  const reasons: string[] = [];
  if (props.missingAssets.some((asset) => asset.startsWith("assets/footage/"))) reasons.push("DEMO FOOTAGE MISSING");
  if (!props.narrationFile) reasons.push("NARRATION AUDIO MISSING");
  if (props.missingAssets.some((asset) => !asset.startsWith("assets/footage/"))) reasons.push("ASSETS MISSING");
  return reasons.length ? reasons : ["NOT FOR SUBMISSION"];
};

export const MotionQADemo: React.FC<MotionQADemoProps> = (props) => {
  const available = (clip: FootageClipName) => !props.missingAssets.includes(`assets/footage/${clip}.mp4`);
  return (
    <AbsoluteFill>
      <Paper />
      <Sequence from={scenes.team.from} durationInFrames={scenes.team.duration} name="1 Team and problem">
        <TeamScene />
      </Sequence>
      <Sequence from={scenes.app.from} durationInFrames={scenes.app.duration} name="2 Application working">
        <AppScene available={available} />
      </Sequence>
      <Sequence from={scenes.review.from} durationInFrames={scenes.review.duration} name="3 Review and failures">
        <ReviewScene available={available} />
      </Sequence>
      <Sequence from={scenes.architecture.from} durationInFrames={scenes.architecture.duration} name="4 Architecture">
        <ArchitectureScene available={available} />
      </Sequence>
      <Sequence from={scenes.evaluation.from} durationInFrames={scenes.evaluation.duration} name="5 Evaluation">
        <EvaluationScene />
      </Sequence>
      <Sequence from={scenes.limits.from} durationInFrames={scenes.limits.duration} name="6 Limits and access">
        <LimitsScene />
      </Sequence>
      <Captions />
      {props.narrationFile ? <Audio src={staticFile(props.narrationFile)} /> : null}
      {props.mode === "draft" ? <Watermark reasons={draftReasons(props)} /> : null}
    </AbsoluteFill>
  );
};
