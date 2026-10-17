import type React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ClipPanel, clipBox, evidenceCrop, fullCrop, tilesCrop, zoomKeys } from "../components/ClipPanel";
import { FootageClip } from "../components/FootageClip";
import { Beat, Bracket, Card, Draw, Hand, Mark, Pill, Pop } from "../components/kit";
import { eventFrame, footage, resultFrame, score3, utcMinute, verified } from "../lib/data";
import { appSegments as seg, scenes } from "../timeline";
import type { FootageClipName } from "../timeline";
import { colors, decisionColor, decisionWash, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const t = verified.thresholds;
// Absolute narration second -> frame inside a segment of this scene.
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - scenes.app.from - segmentFrom;
const recorded = (clip: FootageClipName) => {
  const info = footage(clip);
  return info ? utcMinute(info.recordedAtUtc) : "footage missing";
};

// 25–95 s: the live AWS endpoint, the cloud reproduction record, the decision path, then local real inference.
export const AppScene: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => {
  const { fps } = useVideoConfig();
  const passAt = resultFrame("local-01-pass", 0, 0, fps);
  const failAt = resultFrame("local-02-fail", 0, 0, fps);
  const confirmAt = eventFrame("local-02-fail", "final decision", 0, fps);
  return (
    <AbsoluteFill>
      <Sequence from={seg.awsUi.from} durationInFrames={seg.awsUi.duration} name="AWS UI">
        <AwsUi available={available("aws-01-ui-status")} />
      </Sequence>
      <Sequence from={seg.awsJson.from} durationInFrames={seg.awsJson.duration} name="AWS JSON">
        <AwsJson available={available} />
      </Sequence>
      <Sequence from={seg.awsMatch.from} durationInFrames={seg.awsMatch.duration} name="AWS 20 of 20">
        <AwsMatch />
      </Sequence>
      <Sequence from={seg.tree.from} durationInFrames={seg.tree.duration} name="Decision path">
        <DecisionTree />
      </Sequence>
      <Sequence from={seg.pass.from} durationInFrames={seg.pass.duration} name="Local PASS">
        <Beat kicker="Local demonstration" title="A good board: PASS" fig={{ n: 7, text: `real inference on the local stack, recorded ${recorded("local-01-pass")} · Normal/0011` }}>
          <FootageClip clip="local-01-pass" available={available("local-01-pass")} box={clipBox} keys={zoomKeys(passAt)} />
          <ClipPanel clip="local-01-pass" fps={fps} note={<Hand fontSize={42}>{`score under the ${score3(t.passBelow)} line → PASS`}</Hand>} />
        </Beat>
      </Sequence>
      <Sequence from={seg.fail.from} durationInFrames={seg.fail.duration} name="Local FAIL">
        <Beat kicker="Local demonstration" title="Bent pins: FAIL, then a person" fig={{ n: 8, text: `recorded ${recorded("local-02-fail")} · Anomaly/000 · reviewer clicks Confirm FAIL` }}>
          <FootageClip clip="local-02-fail" available={available("local-02-fail")} box={clipBox} keys={zoomKeys(failAt, confirmAt - 40)} />
          <ClipPanel
            clip="local-02-fail"
            fps={fps}
            noteAt={confirmAt}
            note={
              <div style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.3 }}>
                <Mark at={confirmAt + 4}>Reviewer: Confirm FAIL.</Mark> Machine decision stays on record.
              </div>
            }
          />
        </Beat>
      </Sequence>
      <Sequence from={seg.retake.from} durationInFrames={seg.retake.duration} name="Local RETAKE">
        <RetakeBeat available={available("local-06-retake-session")} />
      </Sequence>
    </AbsoluteFill>
  );
};

const AwsUi: React.FC<{ available: boolean }> = ({ available }) => {
  const status = footage("aws-02-model-status")?.results[0]?.body as { opencv?: { version?: string }; profileVersion?: string } | undefined;
  const s = clipBox.width / fullCrop.w;
  // Mode-bar status text in the full crop, and the "HTTP 401" panel text after the zoom to the lower panels.
  const statusEnd = { x: clipBox.left + (1310 - fullCrop.x) * s, y: clipBox.top + (154 - fullCrop.y) * s };
  const zoomCrop = { x: 130, y: 558, w: 900 };
  const z = clipBox.width / zoomCrop.w;
  const http401 = { x: clipBox.left + (560 - zoomCrop.x) * z, y: clipBox.top + (1066 - zoomCrop.y) * z };
  return (
    <Beat kicker="Live on AWS" title="The deployed endpoint" fig={{ n: 3, text: `https://d4dqbqmvvujy7.cloudfront.net, opened without a token · recorded ${recorded("aws-01-ui-status")}` }}>
      <FootageClip clip="aws-01-ui-status" available={available} box={clipBox} keys={[{ frame: 0, ...fullCrop }, { frame: 120, ...fullCrop }, { frame: 150, ...zoomCrop }]} />
      <Pop at={30} style={{ position: "absolute", left: 1130, top: layout.contentTop }}>
        <Card style={{ width: 694 }}>
          <Hand fontSize={42}>model status, from the AWS server</Hand>
          <div style={{ marginTop: 8, fontSize: size.body, fontWeight: 700 }}>{`OpenCV ${status?.opencv?.version ?? "?"} · profile ${status?.profileVersion ?? "?"}`}</div>
        </Card>
      </Pop>
      <FadeOut at={112}>
        <Draw d={`M 1126 ${layout.contentTop + 60} C 1000 ${layout.contentTop + 60}, ${statusEnd.x + 60} ${statusEnd.y + 40}, ${statusEnd.x + 8} ${statusEnd.y + 8}`} at={40} head />
      </FadeOut>
      <Pop at={160} style={{ position: "absolute", left: 1130, top: layout.contentTop + 330 }}>
        <Card style={{ width: 694 }}>
          <Hand fontSize={42} color={colors.red}>
            no operator token entered
          </Hand>
          <div style={{ marginTop: 8, fontSize: size.body, fontWeight: 700 }}>data panels answer HTTP 401</div>
        </Card>
      </Pop>
      <Draw d={`M 1126 ${layout.contentTop + 400} C 1000 ${layout.contentTop + 470}, ${http401.x + 120} ${http401.y - 70}, ${http401.x + 10} ${http401.y - 18}`} at={170} color={colors.red} head />
    </Beat>
  );
};

// Hides an annotation once the camera move it refers to begins.
const FadeOut: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return <div style={{ opacity: interpolate(frame, [at, at + 8], [1, 0], clamp) }}>{children}</div>;
};

const AwsJson: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => {
  const status = footage("aws-02-model-status")?.results[0]?.body as { ready?: boolean; opencv?: { version?: string; hasNewDnnEngine?: boolean } } | undefined;
  const health = footage("aws-03-health")?.results[0]?.body as { status?: string; postgres?: string; redis?: string; inspectionModel?: string } | undefined;
  return (
    <Beat kicker="Live on AWS" title="Model ready, health ok" fig={{ n: 4, text: `GET /api/v1/model/status and /api/v1/health on the endpoint · recorded ${recorded("aws-02-model-status")}` }}>
      <FootageClip clip="aws-02-model-status" available={available("aws-02-model-status")} box={{ left: layout.margin, top: layout.contentTop, width: 1728, height: 297 }} keys={[{ frame: 0, x: 0, y: 0, w: 1920 }]} />
      <Sequence from={60} layout="none">
        <FootageClip clip="aws-03-health" available={available("aws-03-health")} box={{ left: layout.margin, top: layout.contentTop + 318, width: 1728, height: 117 }} keys={[{ frame: 0, x: 0, y: 0, w: 1920 }]} />
      </Sequence>
      <div style={{ position: "absolute", left: layout.margin, right: layout.margin, top: layout.contentTop + 462, display: "flex", flexWrap: "wrap", columnGap: 28, rowGap: 14, fontFamily: fonts.sans, fontSize: size.body, fontWeight: 700, color: colors.ink }}>
        <Pop at={18}>
          <Mark at={22}>{`ready: ${String(status?.ready)}`}</Mark>
        </Pop>
        <Pop at={30}>
          <Mark at={34}>{`OpenCV ${status?.opencv?.version}`}</Mark>
        </Pop>
        <Pop at={42}>
          <Mark at={46}>{`new DNN engine: ${String(status?.opencv?.hasNewDnnEngine)}`}</Mark>
        </Pop>
        <Pop at={84}>
          <Mark at={88}>{`health ${health?.status}: postgres ${health?.postgres} · redis ${health?.redis} · model ${health?.inspectionModel}`}</Mark>
        </Pop>
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

const BarGrow: React.FC<{ width: number; color: string; at: number }> = ({ width, color, at }) => {
  const frame = useCurrentFrame();
  return <div style={{ width: width * interpolate(frame, [at, at + 20], [0, 1], clamp), height: 40, backgroundColor: color, borderRadius: 4 }} />;
};

const AwsMatch: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.awsMatch.from, fps);
  const aws = verified.latency.aws;
  const local = verified.latency.localM2;
  if (!aws) return null;
  const order = [...Array(aws.decisions.PASS).fill("PASS"), ...Array(aws.decisions.REVIEW).fill("REVIEW"), ...Array(aws.decisions.FAIL).fill("FAIL")] as string[];
  const start = f(40.6);
  const maxMs = 500;
  const bar = (label: string, ms: number, color: string, at: number, note: string) => (
    <Pop at={at} style={{ display: "grid", gridTemplateColumns: "300px 1fr", alignItems: "center", gap: 18 }}>
      <span style={{ fontSize: size.small, fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <BarGrow width={(ms / maxMs) * 820} color={color} at={at} />
        <span style={{ fontFamily: fonts.mono, fontSize: size.body, fontWeight: 600 }}>{`${Math.round(ms)} ms`}</span>
        <span style={{ fontSize: size.small, color: colors.muted }}>{note}</span>
      </div>
    </Pop>
  );
  return (
    <Beat kicker="Cloud check" title={`${aws.identicalToLocal} of ${aws.requests} decisions matched`} fig={{ n: 5, text: "20 test-split images sent through CloudFront on 2026-10-16 · evaluation/aws-2026-10-16/README.md" }}>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 10, display: "grid", gridTemplateColumns: "repeat(10, 128px)", columnGap: 44, rowGap: 30, fontFamily: fonts.sans }}>
        {order.map((decision, i) => (
          <BoardIcon key={i} decision={decision} at={start + i * 4} />
        ))}
      </div>
      <Pop at={start + 84} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 258, display: "flex", gap: 20, alignItems: "center", fontFamily: fonts.sans }}>
        <Pill decision="PASS" />
        <span style={{ fontFamily: fonts.mono, fontSize: size.body }}>{aws.decisions.PASS}</span>
        <Pill decision="REVIEW" />
        <span style={{ fontFamily: fonts.mono, fontSize: size.body }}>{aws.decisions.REVIEW}</span>
        <Pill decision="FAIL" />
        <span style={{ fontFamily: fonts.mono, fontSize: size.body }}>{aws.decisions.FAIL}</span>
        <Hand fontSize={44}>✓ = same decision as the local evaluation</Hand>
      </Pop>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 352, width: 1728, display: "flex", flexDirection: "column", gap: 18, fontFamily: fonts.sans, color: colors.ink }}>
        <Pop at={f(46.0)}>
          <Hand fontSize={42}>median inference time · two different machines, not a benchmark</Hand>
        </Pop>
        {bar("AWS t4g.small", aws.inferenceMedianMs, colors.aws, f(46.6), `2 vCPU Graviton · ${aws.requests} requests`)}
        {bar("Apple M2 (local)", local.inferenceMedianMs, colors.blue, f(47.6), `${local.samples} inspections`)}
      </div>
    </Beat>
  );
};

type TreeNode = { id: string; title: string; sub?: string; left: number; top: number; width: number; height: number; at: number; decision?: string };

const DecisionTree: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.tree.from, fps);
  const top = layout.contentTop;
  const nodes: TreeNode[] = [
    { id: "photo", title: "1 photo", sub: "upload or camera", left: 96, top: top + 130, width: 220, height: 120, at: f(50.2) },
    { id: "gates", title: "Capture gates", sub: "blur · exposure · framing", left: 380, top: top + 130, width: 320, height: 120, at: f(51.0) },
    { id: "identity", title: "Part identity", sub: "distance to known boards", left: 770, top: top + 130, width: 320, height: 120, at: f(52.0) },
    { id: "score", title: "Anomaly score", sub: "vs two thresholds", left: 1160, top: top + 130, width: 320, height: 120, at: f(53.0) },
    { id: "retake", title: "RETAKE", sub: "or NO_PART", left: 380, top: top + 330, width: 320, height: 110, at: f(55.2), decision: "RETAKE" },
    { id: "uncertain", title: "REVIEW", sub: "identity uncertain", left: 770, top: top + 330, width: 320, height: 110, at: f(56.6), decision: "REVIEW" },
    { id: "pass", title: "PASS", sub: `< ${score3(t.passBelow)}`, left: 1540, top: top + 0, width: 262, height: 100, at: f(53.6), decision: "PASS" },
    { id: "review", title: "REVIEW", sub: `${score3(t.passBelow)}–${score3(t.failAtOrAbove)}`, left: 1540, top: top + 140, width: 262, height: 100, at: f(53.9), decision: "REVIEW" },
    { id: "fail", title: "FAIL", sub: `≥ ${score3(t.failAtOrAbove)}`, left: 1540, top: top + 280, width: 262, height: 100, at: f(54.2), decision: "FAIL" },
  ];
  const n = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const mid = (node: TreeNode) => node.top + node.height / 2;
  const right = (node: TreeNode) => node.left + node.width;
  const cx = (node: TreeNode) => node.left + node.width / 2;
  return (
    <Beat kicker="How it decides" title="One path for every photo" fig={{ n: 6, text: "decision states in backend/motionQa/inspection/inspectionPipeline.py · docs/ARCHITECTURE.md" }}>
      <Draw d={`M ${right(n.photo)} ${mid(n.photo)} L ${n.gates.left - 4} ${mid(n.gates)}`} at={f(50.8)} head />
      <Draw d={`M ${right(n.gates)} ${mid(n.gates)} L ${n.identity.left - 4} ${mid(n.identity)}`} at={f(51.8)} head />
      <Draw d={`M ${right(n.identity)} ${mid(n.identity)} L ${n.score.left - 4} ${mid(n.score)}`} at={f(52.8)} head />
      {(["pass", "review", "fail"] as const).map((id) => (
        <Draw key={id} d={`M ${right(n.score)} ${mid(n.score)} C ${right(n.score) + 40} ${mid(n.score)}, ${n[id].left - 40} ${mid(n[id])}, ${n[id].left - 4} ${mid(n[id])}`} at={n[id].at - 6} color={decisionColor(n[id].decision ?? "")} head />
      ))}
      <Draw d={`M ${cx(n.gates)} ${n.gates.top + n.gates.height} L ${cx(n.gates)} ${n.retake.top - 4}`} at={f(55.0)} color={colors.muted} head />
      <Draw d={`M ${cx(n.identity)} ${n.identity.top + n.identity.height} L ${cx(n.identity)} ${n.uncertain.top - 4}`} at={f(56.4)} color={colors.amber} head />
      <Pop at={f(55.0)} style={{ position: "absolute", left: cx(n.gates) + 14, top: n.gates.top + n.gates.height + 12 }}>
        <Hand fontSize={40} color={colors.muted}>
          bad photo
        </Hand>
      </Pop>
      <Pop at={f(56.4)} style={{ position: "absolute", left: cx(n.identity) + 14, top: n.identity.top + n.identity.height + 12 }}>
        <Hand fontSize={40} color={colors.amber}>
          not sure
        </Hand>
      </Pop>
      {nodes.map((node) => (
        <Pop key={node.id} at={node.at} style={{ position: "absolute", left: node.left, top: node.top, width: node.width, height: node.height }}>
          <div
            style={{
              height: "100%",
              boxSizing: "border-box",
              borderRadius: 8,
              border: `3px solid ${node.decision ? decisionColor(node.decision) : colors.line}`,
              backgroundColor: node.decision ? decisionWash(node.decision) : colors.card,
              boxShadow: "6px 6px 0 rgba(11,23,48,0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 18px",
              fontFamily: fonts.sans,
            }}
          >
            <div style={{ fontSize: size.body, fontWeight: 800, color: node.decision ? decisionColor(node.decision) : colors.ink }}>{node.title}</div>
            {node.sub ? <div style={{ fontSize: size.small, color: colors.muted, fontFamily: ["pass", "review", "fail"].includes(node.id) ? fonts.mono : fonts.sans }}>{node.sub}</div> : null}
          </div>
        </Pop>
      ))}
      <Bracket x={1816} y1={n.review.top + 8} y2={n.fail.top + n.fail.height - 8} label="" at={f(57.0)} color={colors.blue} side="left" />
      <Pop at={f(57.0)} style={{ position: "absolute", left: 1240, top: top + 410, width: 584, textAlign: "right" }}>
        <Hand fontSize={48}>FAIL and REVIEW → a person</Hand>
      </Pop>
      <Pop at={f(58.0)} style={{ position: "absolute", left: layout.margin, top: top + 490, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink }}>
        <Mark at={f(58.2)} color={colors.redWash}>
          model missing · invalid output · timeout → ERROR, never PASS
        </Mark>
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
          width: 120,
          height: 120,
          borderRadius: 60,
          border: `4px ${done ? "solid" : "dashed"} ${done ? decisionColor(d) : colors.faint}`,
          backgroundColor: done ? decisionWash(d) : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 48,
          fontWeight: 800,
          color: done ? decisionColor(d) : colors.faint,
          scale: done ? interpolate(frame, [at, at + 8], [1.25, 1], clamp) : 1,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: size.small, fontWeight: 700, color: done ? decisionColor(d) : colors.faint }}>{done ? d : "not used"}</div>
    </div>
  );
};

const RetakeBeat: React.FC<{ available: boolean }> = ({ available }) => {
  const { fps } = useVideoConfig();
  const first = resultFrame("local-06-retake-session", 0, 0, fps);
  const second = resultFrame("local-06-retake-session", 1, 0, fps);
  const r2 = footage("local-06-retake-session")?.results[1];
  const attempts: Array<{ label: string; decision?: string; at: number }> = [
    { label: "1", decision: "RETAKE", at: first },
    { label: "2", decision: r2?.decision, at: second },
    { label: "3", at: 99999 },
  ];
  return (
    <Beat kicker="Local demonstration" title="Blurred photo: RETAKE, same part" fig={{ n: 9, text: `recorded ${recorded("local-06-retake-session")} · synthetic blur of Normal/0011, then the sharp original` }}>
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
      <Pop at={first - 30} style={{ position: "absolute", left: 1130, top: layout.contentTop - 6 }}>
        <Hand fontSize={42}>one part session · max 3 attempts</Hand>
      </Pop>
      <div style={{ position: "absolute", left: 1130, top: layout.contentTop + 70, display: "flex", gap: 26 }}>
        {attempts.map((attempt) => (
          <AttemptDot key={attempt.label} label={attempt.label} decision={attempt.decision} at={attempt.at} />
        ))}
      </div>
      <Pop at={first + 10} style={{ position: "absolute", left: 1130, top: layout.contentTop + 260, width: 694, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.35 }}>
        <div>
          <Pill decision="RETAKE" /> photo too blurred to judge
        </div>
        <div style={{ color: colors.muted, marginTop: 6 }}>keep the fixture, camera and lighting</div>
      </Pop>
      <Pop at={second} style={{ position: "absolute", left: 1130, top: layout.contentTop + 390, width: 694, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.35 }}>
        <div>
          <Pill decision={r2?.decision ?? "PASS"} /> {`same session · score ${score3(r2?.anomalyScore ?? 0)}`}
        </div>
      </Pop>
      <Pop at={second + 60} style={{ position: "absolute", left: 1130, top: layout.contentTop + 490, width: 694 }}>
        <Hand fontSize={42}>3 failed attempts → REVIEW by a person</Hand>
      </Pop>
    </Beat>
  );
};
