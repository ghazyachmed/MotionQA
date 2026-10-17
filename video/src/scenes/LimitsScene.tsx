import type React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Card, Hand, Mark, Pop } from "../components/kit";
import { fraction, links, verified } from "../lib/data";
import { limitsSegments as seg, scenes } from "../timeline";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - scenes.limits.from - segmentFrom;

// 240–280 s: what the evidence does not cover, then the judge links (checked before rendering, src/data/links.json).
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

const CheckItem: React.FC<{ text: string; note: string; at: number; tone: string }> = ({ text, note, at, tone }) => {
  const frame = useCurrentFrame();
  const tick = interpolate(frame, [at + 6, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <Pop at={at} style={{ display: "grid", gridTemplateColumns: "64px 1fr", alignItems: "start", gap: 20 }}>
      <div style={{ width: 52, height: 52, border: `3px solid ${colors.line}`, borderRadius: 6, backgroundColor: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.sans, fontWeight: 800, fontSize: 40, color: tone, scale: 0.6 + 0.4 * tick }}>
        {tick > 0 ? "!" : ""}
      </div>
      <div>
        <div style={{ fontFamily: fonts.sans, fontSize: size.body, fontWeight: 700, color: colors.ink, lineHeight: 1.25 }}>{text}</div>
        <Hand fontSize={40} color={tone}>
          {note}
        </Hand>
      </div>
    </Pop>
  );
};

const Limits: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.limits.from, fps);
  const review = verified.decisions.motionqa.normal.REVIEW;
  const items = [
    { text: "Benchmark only: VisA pcb1 boards.", note: "not validated on other parts, lines or factories", at: f(240.6), tone: colors.amber },
    { text: `${review} of ${verified.split.testNormal} good test boards go to REVIEW.`, note: "the price of 0 validation misses", at: f(247.1), tone: colors.amber },
    { text: `A missing component on plain background can pass (${fraction(verified.metrics.anomalyToPass.motionqa)}).`, note: "Anomaly/048, unfixed", at: f(253.2), tone: colors.red },
    { text: "FAIL and REVIEW need a person.", note: "the machine decision is never overwritten", at: f(256.2), tone: colors.blue },
    { text: "No prospective data, no independent test set yet.", note: "protocol ready: docs/INDEPENDENT_EVALUATION.md", at: f(257.6), tone: colors.amber },
  ];
  return (
    <Beat kicker="Limits" title="What this evidence does not show" fig={{ n: 21, text: "readme.md · docs/EVALUATION.md · docs/FAILURE_ANALYSIS.md" }}>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop, width: 1400, display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((item) => (
          <CheckItem key={item.text} {...item} />
        ))}
      </div>
    </Beat>
  );
};

const Access: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.access.from, fps);
  const linkCard = (heading: string, url: string, lines: string[], at: number, tone: string) => (
    <Pop at={at}>
      <Card accent={tone}>
        <Hand fontSize={42} color={tone}>
          {heading}
        </Hand>
        <div style={{ marginTop: 4, fontFamily: fonts.mono, fontSize: 40, fontWeight: 600, color: colors.ink, fontVariantLigatures: "none" }}>{url}</div>
        {lines.map((line) => (
          <div key={line} style={{ marginTop: 4, fontSize: size.small, color: colors.muted, lineHeight: 1.3 }}>
            {line}
          </div>
        ))}
      </Card>
    </Pop>
  );
  return (
    <Beat kicker="Access" title="Try it, read it" fig={{ n: 22, text: `both links checked ${links.endpoint.checkedAtUtc.slice(0, 16).replace("T", " ")} UTC (src/data/links.json)` }}>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop, width: 1728, display: "flex", flexDirection: "column", gap: 16, fontFamily: fonts.sans }}>
        {linkCard("live endpoint on AWS", links.endpoint.url, ["Model ready on OpenCV 5.0.0 at the last check. Operator token shared with judges privately.", "Planned teardown by 2026-11-11 (deployment record)."], f(259.5), colors.aws)}
        {linkCard("code, evaluation files, video sources", links.repository.url, ["Public repository, branch master."], f(266.0), colors.blue)}
      </div>
      <Pop at={f(268.6)} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 470, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted, lineHeight: 1.35 }}>
        <div>VisA dataset, CC BY 4.0 (Zou et al., ECCV 2022) · MobileNetV2 from OpenCV Zoo, Apache-2.0</div>
        <div>OpenCV, Apache-2.0 · Inter, JetBrains Mono and Caveat fonts, OFL-1.1</div>
      </Pop>
      <Pop at={f(272.1)} style={{ position: "absolute", right: layout.margin, top: layout.titleTop - 2, textAlign: "right", fontFamily: fonts.sans, color: colors.ink }}>
        <div style={{ fontSize: size.subtitle, fontWeight: 800 }}>
          <Mark at={f(272.3)}>MotionQA</Mark> · team Kia Kiu
        </div>
        <div style={{ fontSize: size.small, fontWeight: 600, marginTop: 8 }}>Ghazy Achmed Movlech Urbayani · Institut Teknologi Bandung</div>
      </Pop>
    </Beat>
  );
};
