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

// 0–25 s: who we are, the hook (a defect you can barely see), and why a bare PASS/FAIL is not enough.
export const TeamScene: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={seg.title.from} durationInFrames={seg.title.duration} name="Title and team">
      <TitleBeat />
    </Sequence>
    <Sequence from={seg.spot.from} durationInFrames={seg.spot.duration} name="Spot the defect">
      <SpotBeat />
    </Sequence>
    <Sequence from={seg.record.from} durationInFrames={seg.record.duration} name="Decision without a record">
      <RecordBeat />
    </Sequence>
  </AbsoluteFill>
);

const TitleBeat: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.ink }}>
      <div style={{ position: "absolute", left: layout.margin, top: 210, width: 1000 }}>
        <div style={{ clipPath: `inset(0 ${interpolate(frame, [0, 16], [100, 0], clamp)}% 0 0)` }}>
          <Hand>OpenCV AI Competition 2026 →</Hand>
        </div>
        <div style={{ marginTop: 8, fontSize: size.display, fontWeight: 800, letterSpacing: -3, lineHeight: 1, opacity: interpolate(frame, [4, 14], [0, 1], clamp) }}>MotionQA</div>
        <Pop at={12} style={{ marginTop: 18, fontSize: size.subtitle, fontWeight: 700, lineHeight: 1.2 }}>
          Evidence-backed PCB anomaly inspection
        </Pop>
        <Pop at={Math.round(3.6 * 30)} style={{ marginTop: 56 }}>
          <Card style={{ display: "inline-block", padding: "18px 28px", borderLeft: `8px solid ${colors.blue}` }}>
            <Hand fontSize={42}>team Kia Kiu ·</Hand>
            <div style={{ marginTop: 6, fontSize: size.body, fontWeight: 800 }}>Ghazy Achmed Movlech Urbayani</div>
            <div style={{ marginTop: 2, fontSize: size.small, color: colors.muted }}>Institut Teknologi Bandung</div>
          </Card>
        </Pop>
      </div>
      <Pop at={8} from="40px 0px" style={{ position: "absolute", left: 1180, top: 230, width: 644 }}>
        <Img src={staticFile("assets/dataset/normal-0011.jpg")} style={{ width: 644, borderRadius: 6, border: `2px solid ${colors.line}`, boxShadow: "8px 8px 0 rgba(11,23,48,0.08)" }} />
        <div style={{ marginTop: 10 }}>
          <Hand fontSize={40}>HC-SR04 board, VisA pcb1 (CC BY 4.0)</Hand>
        </div>
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
  const box = { left: layout.margin, top: layout.contentTop, width: 760, height: Math.round((760 * imgH) / imgW) };
  const zoomAt = cue(9.9, seg.spot.from, fps);
  const zoom = interpolate(frame, [zoomAt, zoomAt + 30], [1, 4.2], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cx = gx + gw / 2;
  const cy = gy + gh / 2;
  const base = box.width / imgW;
  const scale = base * zoom;
  // Keep the defect centred while zooming, never showing past the image edge (at zoom 1 the offset is 0).
  const offX = Math.min(0, Math.max(box.width - imgW * scale, box.width / 2 - cx * scale));
  const offY = Math.min(0, Math.max(box.height - imgH * scale, box.height / 2 - cy * scale));
  const circleX = box.left + offX + cx * scale;
  const circleY = box.top + offY + cy * scale;
  const ringAt = zoomAt + 30;
  const pct = ((100 * (d?.groundTruthPixels ?? 0)) / (d?.modelInputPixels ?? 1)).toFixed(2);
  return (
    <Beat kicker="Problem" title="Can you spot the defect?" fig={{ n: 1, text: "VisA pcb1 test image Anomaly/000 · the public benchmark MotionQA is limited to" }}>
      <div style={{ position: "absolute", ...box, overflow: "hidden", border: `2px solid ${colors.line}`, borderRadius: 6, boxShadow: "8px 8px 0 rgba(11,23,48,0.08)", backgroundColor: "#222" }}>
        <Img src={staticFile(s000.photo)} style={{ position: "absolute", left: offX, top: offY, width: imgW * scale, height: imgH * scale }} />
      </div>
      {frame >= ringAt ? (
        <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={circleX} cy={circleY} rx={gw * scale * 0.9 + 20} ry={gh * scale * 0.6 + 20} fill="none" stroke={colors.red} strokeWidth={6} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - interpolate(frame, [ringAt, ringAt + 14], [0, 1], clamp)} />
        </svg>
      ) : null}
      <div style={{ position: "absolute", left: 920, top: layout.contentTop + 10, width: 900, fontFamily: fonts.sans, color: colors.ink }}>
        <Pop at={20}>
          <Hand fontSize={52}>Look at the pins…</Hand>
        </Pop>
        <Pop at={ringAt} style={{ marginTop: 26 }}>
          <div style={{ fontSize: size.body, fontWeight: 700 }}>
            One <span style={{ color: colors.red }}>bent pin</span> (VisA label: {d?.defectType}).
          </div>
        </Pop>
        <Pop at={ringAt + 20} style={{ marginTop: 26 }}>
          <Card style={{ display: "inline-flex", gap: 40, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: fonts.mono, fontSize: 64, fontWeight: 600, color: colors.red }}>
                <CountUp to={d?.groundTruthPixels ?? 0} at={ringAt + 20} /> px
              </div>
              <div style={{ fontSize: size.small, color: colors.muted }}>{`of ${d?.inputSize} × ${d?.inputSize} = ${(d?.modelInputPixels ?? 0).toLocaleString("en-US")} px`}</div>
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: 64, fontWeight: 600, color: colors.ink }}>
              ≈ <CountUp to={Number(pct)} at={ringAt + 30} decimals={2} suffix=" %" />
            </div>
          </Card>
        </Pop>
        <Pop at={ringAt + 50} style={{ marginTop: 22 }}>
          <Hand color={colors.muted} fontSize={40}>
            ground-truth area at the model input (failure-analysis JSON)
          </Hand>
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
  const rows = ["PASS", "PASS", "FAIL", "PASS"];
  const questions = [
    { text: "why?", at: f(17.2), top: 0 },
    { text: "which region?", at: f(18.0), top: 78 },
    { text: "which threshold?", at: f(18.8), top: 156 },
  ];
  const fields: Array<{ label: string; value: React.ReactNode; at: number }> = [
    { label: "decision", value: <Pill decision={result?.decision ?? "FAIL"} />, at: f(20.6) },
    { label: "reason", value: "score ≥ FAIL threshold", at: f(21.4) },
    { label: "raw score", value: <span style={{ fontFamily: fonts.mono }}>{score3(result?.anomalyScore ?? 0)}</span>, at: f(22.1) },
    { label: "thresholds", value: <span style={{ fontFamily: fonts.mono }}>{`PASS < ${score3(t.passBelow)} · FAIL ≥ ${score3(t.failAtOrAbove)}`}</span>, at: f(22.8) },
    { label: "model", value: `profile ${result?.modelVersion ?? ""}`, at: f(23.4) },
  ];
  return (
    <Beat kicker="Problem" title="A verdict without a record" fig={{ n: 2, text: "left: a bare inspection log (illustration) · right: what MotionQA stores for Anomaly/000 (recorded API response)" }}>
      <Pop at={4} style={{ position: "absolute", left: layout.margin, top: layout.contentTop, width: 640 }}>
        <Card accent={colors.faint} style={{ height: 560 }}>
          <Hand fontSize={42} color={colors.muted}>
            manual check (illustration)
          </Hand>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
            {rows.map((decision, index) => (
              <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: size.body, borderBottom: `2px dashed #D8DCE4`, paddingBottom: 12 }}>
                <span style={{ fontFamily: fonts.mono }}>{`board ${index + 1}`}</span>
                <Pill decision={decision} />
              </div>
            ))}
          </div>
        </Card>
      </Pop>
      {questions.map((q) => (
        <Pop key={q.text} at={q.at} style={{ position: "absolute", left: 770, top: layout.contentTop + 90 + q.top, whiteSpace: "nowrap" }}>
          <Hand color={colors.red} fontSize={46}>{`← ${q.text}`}</Hand>
        </Pop>
      ))}
      <Pop at={f(20.4)} style={{ position: "absolute", left: 1150, top: layout.contentTop, width: 674 }}>
        <Card accent={colors.cyan} style={{ height: 568 }}>
          <Hand fontSize={42}>MotionQA record</Hand>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {fields.map((field) => (
              <Pop key={field.label} at={field.at} style={{ display: "grid", gridTemplateColumns: "150px 1fr", alignItems: "center", fontSize: size.small, gap: 10 }}>
                <span style={{ color: colors.muted }}>{field.label}</span>
                <span style={{ fontWeight: 600 }}>{field.value}</span>
              </Pop>
            ))}
            <Pop at={f(23.9)} style={{ display: "grid", gridTemplateColumns: "150px 1fr", alignItems: "center", fontSize: size.small, gap: 10 }}>
              <span style={{ color: colors.muted }}>evidence</span>
              <Img src={staticFile(stages.images["Anomaly/000"].overlay)} style={{ width: 210, border: `2px solid ${colors.line}`, borderRadius: 4 }} />
            </Pop>
          </div>
        </Card>
      </Pop>
      <Draw d={`M 980 ${layout.contentTop + 470} C 1030 ${layout.contentTop + 520}, 1090 ${layout.contentTop + 520}, 1140 ${layout.contentTop + 470}`} at={f(20.4)} head color={colors.blue} />
    </Beat>
  );
};
