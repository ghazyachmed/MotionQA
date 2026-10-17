import { Video } from "@remotion/media";
import type React from "react";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { FootageClipName } from "../timeline";
import { colors, fonts, size } from "../theme";

export type Box = { left: number; top: number; width: number; height: number };
// Source region of the 1920x1080 recording shown in the box; its height follows the box aspect ratio.
export type CropKey = { frame: number; x: number; y: number; w: number };

// Real screen recording, cropped and optionally zoomed (a camera move on the recording, nothing drawn into it).
export const FootageClip: React.FC<{ clip: FootageClipName; available: boolean; trim?: number; box: Box; keys: CropKey[] }> = ({ clip, available, trim = 0, box, keys }) => {
  const frame = useCurrentFrame();
  if (!available) {
    return <MissingFootage clip={clip} box={box} />;
  }
  const frames = keys.map((k) => k.frame);
  const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  const x = keys.length > 1 ? interpolate(frame, frames, keys.map((k) => k.x), ease) : keys[0].x;
  const y = keys.length > 1 ? interpolate(frame, frames, keys.map((k) => k.y), ease) : keys[0].y;
  const w = keys.length > 1 ? interpolate(frame, frames, keys.map((k) => k.w), ease) : keys[0].w;
  const scale = box.width / w;
  return (
    <div
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        overflow: "hidden",
        borderRadius: 8,
        outline: `2px solid ${colors.line}`,
        boxShadow: "8px 8px 0 rgba(11, 23, 48, 0.10)",
        backgroundColor: "#000",
      }}
    >
      <Video
        src={staticFile(`assets/footage/${clip}.mp4`)}
        trimBefore={trim}
        muted
        objectFit="fill"
        style={{ position: "absolute", left: -x * scale, top: -y * scale, width: 1920 * scale, height: 1080 * scale }}
      />
    </div>
  );
};

const MissingFootage: React.FC<{ clip: string; box: Box }> = ({ clip, box }) => (
  <div
    style={{
      position: "absolute",
      ...box,
      borderRadius: 14,
      border: `4px dashed ${colors.red}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      fontFamily: fonts.sans,
      color: colors.red,
      textAlign: "center",
      padding: 32,
    }}
  >
    <div style={{ fontSize: size.subtitle, fontWeight: 800 }}>DEMO FOOTAGE MISSING</div>
    <div style={{ fontSize: size.small, color: colors.muted }}>{`public/assets/footage/${clip}.mp4 · run npm run capture:local / capture:aws`}</div>
  </div>
);
