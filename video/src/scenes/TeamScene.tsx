import type React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Card, CountUp, Draw, Hand, Pill, Pop } from "../components/kit";
import { footage, score3, verified } from "../lib/data";
import stages from "../data/pipeline-stages.json";
import { teamSegments as seg } from "../timeline";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
// Absolute narration second -> frame inside a segment of this scene.
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - segmentFrom;

// 0–25 s: who we are, the hook (a defect you can barely see), and why a bare verdict is not enough.
export const TeamScene: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={seg.title.from} durationInFrames={seg.title.duration} name="Title and team">
      <TitleBeat />
    </Sequence>
    <Sequence from={seg.spot.from} durationInFrames={seg.spot.duration} name="Spot the defect">
      <SpotBeat />
    </Sequence>
    <Sequence from={seg.record.from} durationInFrames={seg.record.duration} name="Verdict without reasons">
      <RecordBeat />
    </Sequence>
  </AbsoluteFill>
);

const TitleBeat: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.ink }}>
      <div style={{ position: "absolute", left: layout.margin, top: 240, width: 1000 }}>
        <div style={{ clipPath: `inset(0 ${interpolate(frame, [0, 16], [100, 0], clamp)}% 0 0)` }}>
          <Hand>OpenCV AI Competition 2026 →</Hand>
        </div>
        <div style={{ marginTop: 8, fontSize: size.display, fontWeight: 800, letterSpacing: -3, lineHeight: 1, opacity: interpolate(frame, [4, 14], [0, 1], clamp) }}>MotionQA</div>
        <Pop at={12} style={{ marginTop: 18, fontSize: size.subtitle, fontWeight: 700, lineHeight: 1.2 }}>
          Evidence-backed PCB anomaly inspection
        </Pop>
        <Pop at={Math.round(4.0 * 30)} style={{ marginTop: 56 }}>
          <Card style={{ display: "inline-block", padding: "18px 28px", borderLeft: `8px solid ${colors.blue}` }}>
            <Hand fontSize={42}>team Kia Kiu ·</Hand>
            <div style={{ marginTop: 6, fontSize: size.body, fontWeight: 800 }}>Ghazy Achmed Movlech Urbayani</div>
            <div style={{ marginTop: 2, fontSize: size.small, color: colors.muted }}>Institut Teknologi Bandung</div>
          </Card>
        </Pop>
      </div>
      <Pop at={8} from="40px 0px" style={{ position: "absolute", left: 1180, top: 260, width: 644 }}>
        <Img src={staticFile("assets/dataset/normal-0011.jpg")} style={{ width: 644, borderRadius: 6, border: `2px solid ${colors.line}`, boxShadow: "8px 8px 0 rgba(11,23,48,0.08)" }} />
      </Pop>
    </AbsoluteFill>
  );
};

const SpotBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = verified.problemDefect;
  const s000 = stages.images["Anomaly/000"];
  const [gx, gy, gw, gh] = s000.groundTruthBoxFull;
  const [imgW, imgH] = s000.imageSize;
  const box = { left: layout.margin, top: layout.contentTop, width: Math.round((600 * imgW) / imgH), height: 600 };
  const zoomAt = cue(9.9, seg.spot.from, fps);
  const zoom = interpolate(frame, [zoomAt, zoomAt + 30], [1, 4.2], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cx = gx + gw / 2;
  const cy = gy + gh / 2;
  const scale = (box.width / imgW) * zoom;
  // Keep the defect centred while zooming, never showing past the image edge (at zoom 1 the offset is 0).
  const offX = Math.min(0, Math.max(box.width - imgW * scale, box.width / 2 - cx * scale));
  const offY = Math.min(0, Math.max(box.height - imgH * scale, box.height / 2 - cy * scale));
  const ringAt = zoomAt + 30;
  const pct = (100 * (d?.groundTruthPixels ?? 0)) / (d?.modelInputPixels ?? 1);
  return (
    <Beat kicker="Problem" title="Can you spot the defect?" note="VisA pcb1 test image Anomaly/000">
      <div style={{ position: "absolute", ...box, overflow: "hidden", border: `2px solid ${colors.line}`, borderRadius: 6, boxShadow: "8px 8px 0 rgba(11,23,48,0.08)", backgroundColor: "#222" }}>
        <Img src={staticFile(s000.photo)} style={{ position: "absolute", left: offX, top: offY, width: imgW * scale, height: imgH * scale }} />
      </div>
      {frame >= ringAt ? (
        <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={box.left + offX + cx * scale} cy={box.top + offY + cy * scale} rx={gw * scale * 0.9 + 24} ry={gh * scale * 0.6 + 24} fill="none" stroke={colors.red} strokeWidth={6} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(frame, [ringAt, ringAt + 14], [0, 1], clamp)} />
        </svg>
      ) : null}
      <div style={{ position: "absolute", left: 1000, top: layout.contentTop + 120, width: 824, fontFamily: fonts.sans, color: colors.ink }}>
        <Pop at={ringAt}>
          <Hand fontSize={56} color={colors.red}>
            one bent pin
          </Hand>
        </Pop>
        <Pop at={ringAt + 16} style={{ marginTop: 6 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 140, fontWeight: 600, lineHeight: 1, color: colors.ink }}>
            <CountUp to={Number(pct.toFixed(2))} at={ringAt + 16} decimals={2} suffix="%" />
          </div>
        </Pop>
        <Pop at={ringAt + 40} style={{ marginTop: 12, fontSize: size.small, color: colors.muted }}>
          {`${d?.groundTruthPixels} of ${(d?.modelInputPixels ?? 0).toLocaleString("en-US")} model-input pixels`}
        </Pop>
      </div>
    </Beat>
  );
};

const RecordBeat: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.record.from, fps);
  const result = footage("local-02-fail")?.results[0];
  const t = verified.thresholds;
  return (
    <Beat kicker="Problem" title="A verdict alone does not say why">
      <Pop at={4} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 40, width: 560 }}>
        <Card accent={colors.faint} style={{ height: 470, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
          <Hand fontSize={42} color={colors.muted}>
            a bare check log (illustration)
          </Hand>
          <Pill decision="PASS" large style={{ fontSize: 96, padding: "10px 40px" }} />
          <Pop at={f(17.0)}>
            <Hand fontSize={88} color={colors.red}>
              why?
            </Hand>
          </Pop>
        </Card>
      </Pop>
      <Draw d={`M 690 ${layout.contentTop + 280} L 830 ${layout.contentTop + 280}`} at={f(20.4)} head color={colors.blue} width={6} />
      <Pop at={f(20.4)} style={{ position: "absolute", left: 870, top: layout.contentTop + 20, width: 954 }}>
        <Card accent={colors.cyan} style={{ padding: "20px 24px" }}>
          <Hand fontSize={42}>MotionQA keeps the evidence</Hand>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "520px 1fr", gap: 24, alignItems: "center" }}>
            <Img src={staticFile(stages.images["Anomaly/000"].overlay)} style={{ width: 520, border: `2px solid ${colors.line}`, borderRadius: 4 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Pop at={f(20.8)}>
                <Pill decision={result?.decision ?? "FAIL"} large />
              </Pop>
              <Pop at={f(21.6)} style={{ fontSize: size.body }}>
                score <b style={{ fontFamily: fonts.mono }}>{score3(result?.anomalyScore ?? 0)}</b>
              </Pop>
              <Pop at={f(22.4)} style={{ fontSize: size.body }}>
                FAIL line <b style={{ fontFamily: fonts.mono }}>{score3(t.failAtOrAbove)}</b>
              </Pop>
              <Pop at={f(23.2)}>
                <Hand fontSize={44}>+ the marked region</Hand>
              </Pop>
            </div>
          </div>
        </Card>
      </Pop>
    </Beat>
  );
};
