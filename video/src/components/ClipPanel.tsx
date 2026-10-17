import type React from "react";
import { footage, reasonText, resultFrame, score3, verified } from "../lib/data";
import type { FootageClipName } from "../timeline";
import { colors, fonts, layout, size } from "../theme";
import type { Box, CropKey } from "./FootageClip";
import { Hand, Pill, Pop, Ruler } from "./kit";

export const clipBox: Box = { left: layout.margin, top: layout.contentTop, width: 990, height: 574 };
export const panelLeft = 1130;
export const panelWidth = layout.width - layout.margin - panelLeft;
// Whole app below the page header; aspect matches clipBox. Then the evidence image, then the decision tiles.
export const fullCrop = { x: 130, y: 118, w: 1660 };
export const evidenceCrop = { x: 150, y: 272, w: 1150 };
export const tilesCrop = { x: 880, y: 196, w: 1000 };

export const zoomKeys = (resultAt: number, tilesAt = resultAt + 120): CropKey[] => [
  { frame: 0, ...fullCrop },
  { frame: resultAt + 12, ...fullCrop },
  { frame: resultAt + 40, ...evidenceCrop },
  { frame: tilesAt, ...evidenceCrop },
  { frame: tilesAt + 28, ...tilesCrop },
];

const t = verified.thresholds;
export const scoreZones = [
  { from: 1.9, to: t.passBelow, decision: "PASS", label: "PASS" },
  { from: t.passBelow, to: t.failAtOrAbove, decision: "REVIEW", label: "REVIEW" },
  { from: t.failAtOrAbove, to: 3.05, decision: "FAIL", label: "FAIL" },
];
export const identityZones = [
  { from: 0, to: t.identityRecognizedMax, decision: "PASS", label: "known" },
  { from: t.identityRecognizedMax, to: t.identityNoPartMin, decision: "REVIEW", label: "gap" },
  { from: t.identityNoPartMin, to: 0.26, decision: "NO_PART", label: "other" },
];

export const inputName = (clip: FootageClipName, index: number): string => {
  const input = footage(clip)?.inputs[index] ?? "";
  return input.includes("data/visa/") ? `${input.replace("data/visa/pcb1/Data/Images/", "")} · test split` : "synthetic blur of Normal/0011";
};

// Right-hand panel for a recorded clip: decision, an animated score ruler, latency, input and a note.
export const ClipPanel: React.FC<{
  clip: FootageClipName;
  trim?: number;
  fps: number;
  index?: number;
  ruler?: "score" | "identity" | "none";
  zoom?: { min: number; max: number; ticks: number[] };
  note?: React.ReactNode;
  noteAt?: number;
}> = ({ clip, trim = 0, fps, index = 0, ruler = "score", zoom, note, noteAt }) => {
  const result = footage(clip)?.results[index];
  const at = resultFrame(clip, index, trim, fps);
  const top = layout.contentTop;
  const isIdentity = ruler === "identity";
  const identity = verified.cases.anomaly043.identityDistance;
  return (
    <>
      <Pop at={Math.max(0, at - 30)} style={{ position: "absolute", left: panelLeft, top: top - 6 }}>
        <Hand fontSize={42}>recorded API response ↓</Hand>
      </Pop>
      <Pop at={at} style={{ position: "absolute", left: panelLeft, top: top + 52, width: panelWidth, fontFamily: fonts.sans, color: colors.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Pill decision={result?.decision ?? "MISSING"} large />
          <span style={{ fontSize: size.small, fontWeight: 600, lineHeight: 1.25 }}>{reasonText[result?.reasonCode ?? ""] ?? result?.reasonCode}</span>
        </div>
      </Pop>
      {ruler !== "none" && (isIdentity || typeof result?.anomalyScore === "number") ? (
        <Ruler
          left={panelLeft}
          top={top + 196}
          width={panelWidth - 10}
          min={isIdentity ? 0 : 1.9}
          max={isIdentity ? 0.26 : 3.05}
          zones={isIdentity ? identityZones : scoreZones}
          ticks={isIdentity ? [t.identityRecognizedMax, t.identityNoPartMin] : [t.passBelow, t.failAtOrAbove]}
          tickDecimals={3}
          at={at + 4}
          marker={{
            value: isIdentity ? identity : (result?.anomalyScore as number),
            at: at + 12,
            label: isIdentity ? identity.toFixed(3) : score3(result?.anomalyScore as number),
            color: colors.ink,
          }}
          zoom={zoom ? { ...zoom, at: at + 60 } : undefined}
        />
      ) : null}
      <Pop at={at + 36} style={{ position: "absolute", left: panelLeft, top: top + 404, width: panelWidth, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted, lineHeight: 1.35 }}>
        {isIdentity ? <div>{`anomaly score ${score3(result?.anomalyScore ?? 0)} kept as evidence`}</div> : null}
        {!isIdentity && typeof result?.inferenceMs === "number" ? <div>{`inference ${Math.round(result.inferenceMs)} ms · server ${Math.round(result.totalMs ?? 0)} ms · Apple M2`}</div> : null}
        <div>{inputName(clip, index)}</div>
      </Pop>
      {note ? (
        <Pop at={noteAt ?? at + 70} style={{ position: "absolute", left: panelLeft, top: top + 500, width: panelWidth }}>
          {note}
        </Pop>
      ) : null}
    </>
  );
};
