import type React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ClipPanel, clipBox, evidenceCrop, fullCrop, tilesCrop, zoomKeys } from "../components/ClipPanel";
import { FootageClip } from "../components/FootageClip";
import { Beat, Bracket, Draw, Hand, Mark, Pop } from "../components/kit";
import { cueIn, eventFrame, footage, resultFrame, score3, utcMinute, verified } from "../lib/data";
import { appSegments as seg } from "../timeline";
import { Dissect } from "./DissectBeat";
import type { FootageClipName } from "../timeline";
import { colors, decisionColor, decisionWash, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const t = verified.thresholds;
const recorded = (clip: FootageClipName) => {
  const info = footage(clip);
  return info ? `recorded ${utcMinute(info.recordedAtUtc)}` : "footage missing";
};

// 25–95 s: how it decides, the real app on recorded inputs, then one photo dissected in OpenCV 5.
export const AppScene: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => {
  const { fps } = useVideoConfig();
  const passAt = resultFrame("local-01-pass", 0, 0, fps);
  const failAt = resultFrame("local-02-fail", 0, 0, fps);
  const confirmAt = eventFrame("local-02-fail", "final decision", 0, fps);
  return (
    <AbsoluteFill>
      <Sequence from={seg.tree.from} durationInFrames={seg.tree.duration} name="Decision path">
        <DecisionTree />
      </Sequence>
      <Sequence from={seg.pass.from} durationInFrames={seg.pass.duration} name="Local PASS">
        <Beat kicker="Local demonstration" title="Good board → PASS" note={recorded("local-01-pass")}>
          <FootageClip clip="local-01-pass" available={available("local-01-pass")} box={clipBox} keys={zoomKeys(passAt)} />
          <ClipPanel clip="local-01-pass" fps={fps} />
        </Beat>
      </Sequence>
      <Sequence from={seg.fail.from} durationInFrames={seg.fail.duration} name="Local FAIL">
        <Beat kicker="Local demonstration" title="Bent pins → FAIL" note={recorded("local-02-fail")}>
          <FootageClip clip="local-02-fail" available={available("local-02-fail")} box={clipBox} keys={zoomKeys(failAt, confirmAt - 40)} />
          <ClipPanel clip="local-02-fail" fps={fps} noteAt={confirmAt} note={<Hand fontSize={52}>✓ a reviewer confirms</Hand>} />
        </Beat>
      </Sequence>
      <Sequence from={seg.retake.from} durationInFrames={seg.retake.duration} name="Local RETAKE">
        <RetakeBeat available={available("local-06-retake-session")} />
      </Sequence>
      <Sequence from={seg.dissect.from} durationInFrames={seg.dissect.duration} name="Under the hood">
        <Dissect />
      </Sequence>
    </AbsoluteFill>
  );
};

// Hides an annotation once the camera move it refers to begins.
const FadeOut: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return <div style={{ opacity: interpolate(frame, [at, at + 8], [1, 0], clamp) }}>{children}</div>;
};

export const AwsUi: React.FC<{ available: boolean }> = ({ available }) => {
  const s = clipBox.width / fullCrop.w;
  const statusEnd = { x: clipBox.left + (1310 - fullCrop.x) * s, y: clipBox.top + (154 - fullCrop.y) * s };
  const zoomCrop = { x: 130, y: 558, w: 900 };
  const z = clipBox.width / zoomCrop.w;
  const http401 = { x: clipBox.left + (560 - zoomCrop.x) * z, y: clipBox.top + (1066 - zoomCrop.y) * z };
  return (
    <Beat kicker="Live on AWS" title="The same app, live on AWS" note={recorded("aws-01-ui-status")}>
      <FootageClip clip="aws-01-ui-status" available={available} box={clipBox} keys={[{ frame: 0, ...fullCrop }, { frame: 120, ...fullCrop }, { frame: 150, ...zoomCrop }]} />
      <FadeOut at={112}>
        <Pop at={30} style={{ position: "absolute", left: 1185, top: layout.contentTop + 20 }}>
          <Hand fontSize={52}>model status ✓</Hand>
        </Pop>
        <Draw d={`M 1180 ${layout.contentTop + 60} C 1100 ${layout.contentTop + 60}, ${statusEnd.x + 60} ${statusEnd.y + 40}, ${statusEnd.x + 8} ${statusEnd.y + 8}`} at={40} head />
      </FadeOut>
      <Pop at={160} style={{ position: "absolute", left: 1185, top: layout.contentTop + 420 }}>
        <Hand fontSize={52} color={colors.red}>
          data needs the token
        </Hand>
      </Pop>
      <Draw d={`M 1180 ${layout.contentTop + 460} C 1100 ${layout.contentTop + 500}, ${http401.x + 120} ${http401.y - 60}, ${http401.x + 10} ${http401.y - 18}`} at={170} color={colors.red} head />
    </Beat>
  );
};

export const AwsJson: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => {
  const status = footage("aws-02-model-status")?.results[0]?.body as { ready?: boolean; opencv?: { version?: string } } | undefined;
  const health = footage("aws-03-health")?.results[0]?.body as { status?: string } | undefined;
  const checks: Array<{ label: string; value: string; at: number }> = [
    { label: "model ready", value: String(status?.ready), at: 20 },
    { label: "OpenCV", value: status?.opencv?.version ?? "?", at: 40 },
    { label: "health", value: health?.status ?? "?", at: 80 },
  ];
  return (
    <Beat kicker="Live on AWS" title="The model is up" note={`GET /api/v1/model/status · ${recorded("aws-02-model-status")}`}>
      <FootageClip clip="aws-02-model-status" available={available("aws-02-model-status")} box={{ left: layout.margin, top: layout.contentTop, width: 1728, height: 297 }} keys={[{ frame: 0, x: 0, y: 0, w: 1920 }]} />
      <Sequence from={60} layout="none">
        <FootageClip clip="aws-03-health" available={available("aws-03-health")} box={{ left: layout.margin, top: layout.contentTop + 318, width: 1728, height: 117 }} keys={[{ frame: 0, x: 0, y: 0, w: 1920 }]} />
      </Sequence>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 480, display: "flex", gap: 90, fontFamily: fonts.sans }}>
        {checks.map((c) => (
          <Pop key={c.label} at={c.at} style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ fontSize: 64, color: colors.green, fontWeight: 800 }}>✓</span>
            <span style={{ fontSize: size.subtitle, fontWeight: 700, color: colors.ink }}>{c.label}</span>
            <span style={{ fontSize: size.subtitle, fontFamily: fonts.mono, color: colors.ink }}>
              <Mark at={c.at + 6}>{c.value}</Mark>
            </span>
          </Pop>
        ))}
      </div>
    </Beat>
  );
};

const BoardIcon: React.FC<{ decision: string; at: number }> = ({ decision, at }) => {
  const frame = useCurrentFrame();
  const lit = frame >= at;
  return (
    <div style={{ width: 128, height: 96, position: "relative", opacity: interpolate(frame, [at - 8, at], [0.25, 1], clamp), scale: interpolate(frame, [at, at + 6], [0.8, 1], clamp) }}>
      <div style={{ position: "absolute", left: 50, top: 0, width: 28, height: 22, display: "flex", justifyContent: "space-between" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 4, height: 22, backgroundColor: colors.line }} />
        ))}
      </div>
      <div style={{ position: "absolute", top: 20, left: 0, right: 0, bottom: 0, borderRadius: 8, border: `3px solid ${lit ? decisionColor(decision) : colors.faint}`, backgroundColor: lit ? decisionWash(decision) : "#EEF0F4", display: "flex", alignItems: "center", justifyContent: "space-around" }}>
        <div style={{ width: 34, height: 34, borderRadius: 17, border: `3px solid ${colors.line}`, backgroundColor: "#fff" }} />
        <div style={{ width: 34, height: 34, borderRadius: 17, border: `3px solid ${colors.line}`, backgroundColor: "#fff" }} />
      </div>
      {lit ? <div style={{ position: "absolute", right: -6, top: 4, fontSize: 32, color: colors.green, fontWeight: 800, fontFamily: fonts.sans }}>✓</div> : null}
    </div>
  );
};

export const AwsMatch: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = cueIn("architecture", "awsMatch", fps);
  const aws = verified.latency.aws;
  if (!aws) return null;
  const order = [...Array(aws.decisions.PASS).fill("PASS"), ...Array(aws.decisions.REVIEW).fill("REVIEW"), ...Array(aws.decisions.FAIL).fill("FAIL")] as string[];
  const start = f(171.4);
  return (
    <Beat kicker="Cloud check" title="AWS gave the same 20 answers" note="2026-10-16 · evaluation/aws-2026-10-16/README.md">
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 40, display: "grid", gridTemplateColumns: "repeat(10, 128px)", columnGap: 44, rowGap: 34 }}>
        {order.map((decision, i) => (
          <BoardIcon key={i} decision={decision} at={start + i * 4} />
        ))}
      </div>
      <Pop at={f(175.7)} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 330, display: "flex", alignItems: "baseline", gap: 36 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 150, fontWeight: 600, color: colors.green, lineHeight: 1 }}>{`${aws.identicalToLocal}/${aws.requests}`}</span>
        <Hand fontSize={60}>same as the local run</Hand>
      </Pop>
    </Beat>
  );
};

type TreeNode = { id: string; title: string; sub?: string; left: number; top: number; width: number; height: number; at: number; decision?: string };

const DecisionTree: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = cueIn("app", "tree", fps);
  const top = layout.contentTop + 40;
  const nodes: TreeNode[] = [
    { id: "photo", title: "Photo", left: 96, top: top + 150, width: 200, height: 96, at: f(25.4) },
    { id: "gates", title: "Usable?", left: 380, top: top + 150, width: 280, height: 96, at: f(25.9) },
    { id: "identity", title: "Right part?", left: 750, top: top + 150, width: 300, height: 96, at: f(26.6) },
    { id: "score", title: "Score", left: 1140, top: top + 150, width: 230, height: 96, at: f(27.3) },
    { id: "retake", title: "RETAKE", left: 380, top: top + 360, width: 280, height: 96, at: f(30.1), decision: "RETAKE" },
    { id: "uncertain", title: "REVIEW", left: 750, top: top + 360, width: 300, height: 96, at: f(31.6), decision: "REVIEW" },
    { id: "pass", title: "PASS", left: 1500, top: top + 0, width: 300, height: 96, at: f(27.9), decision: "PASS" },
    { id: "review", title: "REVIEW", left: 1500, top: top + 150, width: 300, height: 96, at: f(28.2), decision: "REVIEW" },
    { id: "fail", title: "FAIL", left: 1500, top: top + 300, width: 300, height: 96, at: f(28.5), decision: "FAIL" },
  ];
  const n = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const mid = (node: TreeNode) => node.top + node.height / 2;
  const right = (node: TreeNode) => node.left + node.width;
  const cx = (node: TreeNode) => node.left + node.width / 2;
  return (
    <Beat kicker="How it decides" title="When unsure, it asks a person">
      <Draw d={`M ${right(n.photo)} ${mid(n.photo)} L ${n.gates.left - 4} ${mid(n.gates)}`} at={f(25.7)} head />
      <Draw d={`M ${right(n.gates)} ${mid(n.gates)} L ${n.identity.left - 4} ${mid(n.identity)}`} at={f(26.4)} head />
      <Draw d={`M ${right(n.identity)} ${mid(n.identity)} L ${n.score.left - 4} ${mid(n.score)}`} at={f(27.1)} head />
      {(["pass", "review", "fail"] as const).map((id) => (
        <Draw key={id} d={`M ${right(n.score)} ${mid(n.score)} C ${right(n.score) + 60} ${mid(n.score)}, ${n[id].left - 60} ${mid(n[id])}, ${n[id].left - 4} ${mid(n[id])}`} at={n[id].at - 6} color={decisionColor(n[id].decision ?? "")} head />
      ))}
      <Draw d={`M ${cx(n.gates)} ${n.gates.top + n.gates.height} L ${cx(n.gates)} ${n.retake.top - 4}`} at={f(29.9)} color={colors.muted} head />
      <Draw d={`M ${cx(n.identity)} ${n.identity.top + n.identity.height} L ${cx(n.identity)} ${n.uncertain.top - 4}`} at={f(31.4)} color={colors.amber} head />
      <Pop at={f(29.9)} style={{ position: "absolute", left: cx(n.gates) + 16, top: n.gates.top + n.gates.height + 30 }}>
        <Hand fontSize={44} color={colors.muted}>
          no
        </Hand>
      </Pop>
      <Pop at={f(31.4)} style={{ position: "absolute", left: cx(n.identity) + 16, top: n.identity.top + n.identity.height + 30 }}>
        <Hand fontSize={44} color={colors.amber}>
          not sure
        </Hand>
      </Pop>
      {nodes.map((node) => (
        <Pop key={node.id} at={node.at} style={{ position: "absolute", left: node.left, top: node.top, width: node.width, height: node.height }}>
          <div
            style={{
              height: "100%",
              boxSizing: "border-box",
              borderRadius: 10,
              border: `3px solid ${node.decision ? decisionColor(node.decision) : colors.line}`,
              backgroundColor: node.decision ? decisionWash(node.decision) : colors.card,
              boxShadow: "6px 6px 0 rgba(11,23,48,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.sans,
              fontSize: size.subtitle,
              fontWeight: 800,
              color: node.decision ? decisionColor(node.decision) : colors.ink,
            }}
          >
            {node.title}
          </div>
        </Pop>
      ))}
      <Bracket x={1816} y1={n.review.top + 6} y2={n.fail.top + n.fail.height - 6} label="" at={f(32.4)} color={colors.blue} side="left" />
      <Pop at={f(32.4)} style={{ position: "absolute", left: 1180, top: top + 430, width: 640, textAlign: "right" }}>
        <Hand fontSize={56}>REVIEW and FAIL → a person</Hand>
      </Pop>
    </Beat>
  );
};

const AttemptDot: React.FC<{ label: string; decision?: string; at: number }> = ({ label, decision, at }) => {
  const frame = useCurrentFrame();
  const done = Boolean(decision) && frame >= at;
  const d = decision ?? "";
  return (
    <div style={{ textAlign: "center", fontFamily: fonts.sans }}>
      <div
        style={{
          width: 150,
          height: 150,
          borderRadius: 75,
          border: `5px ${done ? "solid" : "dashed"} ${done ? decisionColor(d) : colors.faint}`,
          backgroundColor: done ? decisionWash(d) : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 60,
          fontWeight: 800,
          color: done ? decisionColor(d) : colors.faint,
          scale: done ? interpolate(frame, [at, at + 8], [1.25, 1], clamp) : 1,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 10, fontSize: size.body, fontWeight: 800, color: done ? decisionColor(d) : colors.faint }}>{done ? d : ""}</div>
    </div>
  );
};

const RetakeBeat: React.FC<{ available: boolean }> = ({ available }) => {
  const { fps } = useVideoConfig();
  const first = resultFrame("local-06-retake-session", 0, 0, fps);
  const second = resultFrame("local-06-retake-session", 1, 0, fps);
  const r2 = footage("local-06-retake-session")?.results[1];
  return (
    <Beat kicker="Local demonstration" title="Blurry photo → try again" note={`synthetic blur of Normal/0011 · ${recorded("local-06-retake-session")}`}>
      <FootageClip
        clip="local-06-retake-session"
        available={available}
        box={clipBox}
        keys={[
          { frame: 0, ...fullCrop },
          { frame: first + 12, ...fullCrop },
          { frame: first + 40, ...tilesCrop },
          { frame: second + 30, ...tilesCrop },
          { frame: second + 58, ...evidenceCrop },
          { frame: second + 150, ...evidenceCrop },
          { frame: second + 178, ...tilesCrop },
        ]}
      />
      <Pop at={first - 20} style={{ position: "absolute", left: 1185, top: layout.contentTop + 20 }}>
        <Hand fontSize={46}>one part, up to 3 tries</Hand>
      </Pop>
      <div style={{ position: "absolute", left: 1185, top: layout.contentTop + 110, display: "flex", gap: 34 }}>
        <AttemptDot label="1" decision="RETAKE" at={first} />
        <AttemptDot label="2" decision={r2?.decision} at={second} />
        <AttemptDot label="3" at={99999} />
      </div>
      <Pop at={second + 40} style={{ position: "absolute", left: 1185, top: layout.contentTop + 420, width: 640, fontFamily: fonts.sans, fontSize: size.body, color: colors.ink }}>
        {`score ${score3(r2?.anomalyScore ?? 0)} < ${score3(t.passBelow)}`}
      </Pop>
    </Beat>
  );
};

