import type React from "react";
import { footage, resultFrame, score3, verified } from "../lib/data";
import type { FootageClipName } from "../timeline";
import { colors, layout } from "../theme";
import type { Box, CropKey } from "./FootageClip";
import { Pill, Pop, Ruler } from "./kit";

export const clipBox: Box = { left: layout.margin, top: layout.contentTop, width: 1045, height: 606 };
export const panelLeft = 1185;
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
  { from: t.identityRecognizedMax, to: t.identityNoPartMin, decision: "REVIEW", label: "unsure" },
  { from: t.identityNoPartMin, to: 0.26, decision: "NO_PART", label: "other" },
];

// Right-hand panel for a recorded clip: the decision, one animated ruler, and at most one short note.
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
      <Pop at={at} style={{ position: "absolute", left: panelLeft, top: top + 40 }}>
        <Pill decision={result?.decision ?? "MISSING"} large style={{ fontSize: 72, padding: "8px 30px" }} />
      </Pop>
      {ruler !== "none" && (isIdentity || typeof result?.anomalyScore === "number") ? (
        <Ruler
          left={panelLeft}
          top={top + 230}
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
      {note ? (
        <Pop at={noteAt ?? at + 70} style={{ position: "absolute", left: panelLeft, top: top + 470, width: panelWidth }}>
          {note}
        </Pop>
      ) : null}
    </>
  );
};
