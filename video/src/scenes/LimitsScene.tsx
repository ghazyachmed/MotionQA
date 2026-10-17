import type React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Card, Hand, Mark, Pop } from "../components/kit";
import { cueIn, links } from "../lib/data";
import { limitsSegments as seg } from "../timeline";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 240–280 s: what the evidence does not cover, then the live endpoint (QR) and the repository.
export const LimitsScene: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={seg.limits.from} durationInFrames={seg.limits.duration} name="Limits">
      <Limits />
    </Sequence>
    <Sequence from={seg.access.from} durationInFrames={seg.access.duration} name="Access">
      <Access />
    </Sequence>
  </AbsoluteFill>
);

const CheckItem: React.FC<{ text: string; at: number; tone: string }> = ({ text, at, tone }) => {
  const frame = useCurrentFrame();
  const tick = interpolate(frame, [at + 6, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <Pop at={at} style={{ display: "flex", alignItems: "center", gap: 30 }}>
      <div style={{ width: 70, height: 70, border: `4px solid ${colors.line}`, borderRadius: 8, backgroundColor: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.sans, fontWeight: 800, fontSize: 52, color: tone, scale: 0.6 + 0.4 * tick }}>
        {tick > 0 ? "!" : ""}
      </div>
      <div style={{ fontFamily: fonts.sans, fontSize: 52, fontWeight: 700, color: colors.ink }}>{text}</div>
    </Pop>
  );
};

const Limits: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = cueIn("limits", "limits", fps);
  return (
    <Beat kicker="Limits" title="What we cannot claim yet">
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 60, display: "flex", flexDirection: "column", gap: 56 }}>
        <CheckItem text="Tested on one public benchmark only" at={f(240.6)} tone={colors.amber} />
        <CheckItem text="About 1 in 3 good boards go to REVIEW" at={f(247.1)} tone={colors.amber} />
        <CheckItem text="Some missing parts can still pass" at={f(253.2)} tone={colors.red} />
      </div>
    </Beat>
  );
};

const Access: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = cueIn("limits", "access", fps);
  const qrAt = f(259.5);
  return (
    <Beat kicker="Try it" title="Scan to open the live app" note={`links checked ${links.endpoint.checkedAtUtc.slice(0, 10)}`}>
      <Pop at={qrAt} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 10 }}>
        <div style={{ padding: 18, backgroundColor: "#fff", border: `3px solid ${colors.line}`, borderRadius: 12, boxShadow: "10px 10px 0 rgba(11,23,48,0.10)", scale: interpolate(frame, [qrAt, qrAt + 12], [0.9, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }) }}>
          <Img src={staticFile("assets/qr/live-endpoint.png")} style={{ width: 420, height: 420, display: "block" }} />
        </div>
      </Pop>
      <div style={{ position: "absolute", left: 620, top: layout.contentTop + 20, width: 1204, display: "flex", flexDirection: "column", gap: 26, fontFamily: fonts.sans }}>
        <Pop at={qrAt + 10}>
          <Card accent={colors.aws}>
            <Hand fontSize={46} color={colors.aws}>
              live on AWS
            </Hand>
            <div style={{ marginTop: 4, fontFamily: fonts.mono, fontSize: 44, fontWeight: 600, color: colors.ink, fontVariantLigatures: "none" }}>{links.endpoint.url}</div>
            <div style={{ marginTop: 6, fontSize: size.small, color: colors.muted }}>operator token shared with judges privately</div>
          </Card>
        </Pop>
        <Pop at={f(266.0)}>
          <Card accent={colors.blue}>
            <Hand fontSize={46}>code, data files, video sources</Hand>
            <div style={{ marginTop: 4, fontFamily: fonts.mono, fontSize: 44, fontWeight: 600, color: colors.ink, fontVariantLigatures: "none" }}>{links.repository.url}</div>
          </Card>
        </Pop>
      </div>
      <Pop at={f(272.1)} style={{ position: "absolute", left: 620, top: layout.contentTop + 462, fontFamily: fonts.sans, color: colors.ink }}>
        <div style={{ fontSize: size.subtitle, fontWeight: 800 }}>
          <Mark at={f(272.3)}>MotionQA</Mark> · team Kia Kiu
        </div>
        <div style={{ marginTop: 6, fontSize: size.small, color: colors.muted }}>Ghazy Achmed Movlech Urbayani · Institut Teknologi Bandung</div>
      </Pop>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 560, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted, opacity: interpolate(frame, [f(268.6), f(268.6) + 10], [0, 1], clamp) }}>
        VisA CC BY 4.0 (Zou et al., ECCV 2022) · MobileNetV2, OpenCV Zoo, Apache-2.0 · voice: Kokoro-82M, Apache-2.0
      </div>
    </Beat>
  );
};
