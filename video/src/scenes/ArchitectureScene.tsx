import type React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Hand, Mark, Pill, Pop } from "../components/kit";
import stages from "../data/pipeline-stages.json";
import { score3, verified } from "../lib/data";
import { architectureSegments as seg, scenes } from "../timeline";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - scenes.architecture.from - segmentFrom;

// 135–180 s: one real photo dissected stage by stage, then one request travelling through the AWS deployment.
export const ArchitectureScene: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={seg.dissect.from} durationInFrames={seg.dissect.duration} name="Dissect one photo">
      <Dissect />
    </Sequence>
    <Sequence from={seg.flow.from} durationInFrames={seg.flow.duration} name="Request through AWS">
      <Flow />
    </Sequence>
  </AbsoluteFill>
);

type Stage = { title: string; image: string; code: string; fact: React.ReactNode; at: number };

const cardW = 470;
const gap = 70;

const Dissect: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.dissect.from, fps);
  const s = stages.images["Anomaly/000"];
  const lat = verified.latencyStages;
  const list: Stage[] = [
    { title: "1 · decode", image: s.input, code: "cv.imdecode", fact: `${s.imageSize[0]} × ${s.imageSize[1]} JPEG`, at: f(135.6) },
    { title: "2 · find the board", image: s.mask, code: "Lab · Otsu · contours", fact: `part = ${(s.partAreaFraction * 100).toFixed(1)} % of the frame`, at: f(139.9) },
    { title: "3 · focus gate", image: s.edges, code: "Sobel · magnitude", fact: `sharpness ${s.edgeSharpness.toFixed(0)} ≥ ${s.minEdgeSharpness.toFixed(0)} ✓`, at: f(142.6) },
    { title: "4 · crop", image: s.crop, code: "cropPartSquare · resize", fact: `${s.inputSize} × ${s.inputSize} model input`, at: f(145.4) },
    { title: "5 · DNN features", image: s.features, code: "dnn.readNetFromONNX", fact: `MobileNetV2 · ENGINE_NEW`, at: f(147.6) },
    { title: "6 · anomaly map", image: s.anomalyMap, code: "kNN to 16,000 patches", fact: `max ${score3(s.anomalyScore)} ≥ ${score3(verified.thresholds.failAtOrAbove)}`, at: f(150.9) },
    { title: "7 · evidence", image: s.overlay, code: "applyColorMap", fact: <Pill decision={s.decision} />, at: f(153.0) },
  ];
  // Pan so the newest stage stays in view (camera move along the track).
  const step = cardW + gap;
  const pan = interpolate(frame, [f(139.4), f(140.4), f(144.9), f(145.9), f(150.4), f(151.4), f(152.6), f(153.6)], [0, step, step, 3 * step, 3 * step, 4 * step, 4 * step, 4 * step], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const total = lat.endToEndMs;
  const parts = [
    { label: "decode", ms: lat.decodeMs, color: colors.faint },
    { label: "gates", ms: lat.captureMs, color: colors.blue },
    { label: "inference", ms: lat.inferenceMs, color: colors.cyanDeep },
    { label: "evidence", ms: lat.evidenceMs, color: colors.muted },
  ];
  const barAt = f(154.4);
  const grow = interpolate(frame, [barAt, barAt + 24], [0, 1], clamp);
  let x = 0;
  return (
    <Beat kicker="Architecture" title="Dissecting one photo in OpenCV 5" fig={{ n: 15, text: `real intermediate outputs for Anomaly/000 from the backend code · OpenCV ${stages.opencv}` }}>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop, width: 1728, height: 440, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -pan, top: 0, display: "flex", gap }}>
          {list.map((stage, i) => (
            <Pop key={stage.title} at={stage.at} from="60px 0px" style={{ width: cardW, flexShrink: 0, position: "relative" }}>
              <div style={{ fontFamily: fonts.sans, fontSize: size.body, fontWeight: 800, color: colors.ink }}>{stage.title}</div>
              <div style={{ marginTop: 8, width: cardW, height: 270, backgroundColor: "#111", border: `2px solid ${colors.line}`, borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Img src={staticFile(stage.image)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
              <div style={{ marginTop: 8, fontFamily: fonts.mono, fontSize: size.small, color: colors.cyanDeep, whiteSpace: "nowrap" }}>{stage.code}</div>
              <div style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, whiteSpace: "nowrap" }}>{stage.fact}</div>
              {i < list.length - 1 ? <div style={{ position: "absolute", right: -gap + 8, top: 160, fontFamily: fonts.hand, fontSize: 64, color: colors.blue }}>→</div> : null}
            </Pop>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 448, width: 1728, opacity: interpolate(frame, [barAt, barAt + 8], [0, 1], clamp) }}>
        <Hand fontSize={42}>{`server time per photo, Apple M2, median of ${verified.latency.localM2.samples}: ${total.toFixed(0)} ms`}</Hand>
        <div style={{ marginTop: 8, display: "flex", width: 1728 * grow, height: 40, overflow: "hidden", borderRadius: 4 }}>
          {parts.map((p) => (
            <div key={p.label} style={{ width: `${(100 * p.ms) / total}%`, backgroundColor: p.color, flexShrink: 0 }} />
          ))}
        </div>
        <div style={{ position: "relative", height: 46, marginTop: 4 }}>
          {parts.map((p) => {
            const left = (x / total) * 1728;
            x += p.ms;
            return p.ms / total > 0.08 ? (
              <div key={p.label} style={{ position: "absolute", left, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, whiteSpace: "nowrap" }}>{`${p.label} ${p.ms.toFixed(0)} ms`}</div>
            ) : null;
          })}
        </div>
      </div>
    </Beat>
  );
};

type Node = { id: string; label: string; sub: string; left: number; top: number; width: number; height: number; kind: "aws" | "app" | "opencv" | "client"; at: number };

const Packet: React.FC<{ path: number[][]; at: number; duration: number; children: React.ReactNode; hold?: boolean }> = ({ path, at, duration, children, hold }) => {
  const frame = useCurrentFrame();
  if (frame < at || (!hold && frame > at + duration + 6)) return null;
  const p = interpolate(frame, [at, at + duration], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const lengths = path.slice(1).map((pt, i) => Math.hypot(pt[0] - path[i][0], pt[1] - path[i][1]));
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  let remaining = p * totalLength;
  let i = 0;
  while (i < lengths.length - 1 && remaining > lengths[i]) {
    remaining -= lengths[i];
    i += 1;
  }
  const r = lengths[i] ? remaining / lengths[i] : 0;
  const x = path[i][0] + (path[i + 1][0] - path[i][0]) * r;
  const y = path[i][1] + (path[i + 1][1] - path[i][1]) * r;
  return <div style={{ position: "absolute", left: x, top: y, translate: "-50% -50%", zIndex: 5 }}>{children}</div>;
};

const Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.flow.from, fps);
  const fade = (at: number) => interpolate(frame, [at, at + 10], [0, 1], clamp);
  const ec2 = { left: 730, top: 330, width: 710, height: 516 };
  const nodes: Node[] = [
    { id: "browser", label: "Operator", sub: "browser", left: 96, top: 500, width: 240, height: 140, kind: "client", at: 0 },
    { id: "cf", label: "CloudFront", sub: "HTTPS, WebSocket", left: 410, top: 500, width: 270, height: 140, kind: "aws", at: 4 },
    { id: "nginx", label: "nginx", sub: "UI + /api proxy", left: 755, top: 436, width: 320, height: 140, kind: "app", at: 8 },
    { id: "api", label: "FastAPI", sub: "OpenCV 5 pipeline", left: 755, top: 640, width: 320, height: 180, kind: "opencv", at: 10 },
    { id: "pg", label: "PostgreSQL", sub: "inspection records", left: 1105, top: 436, width: 310, height: 140, kind: "app", at: 12 },
    { id: "redis", label: "Redis + worker", sub: "live stream", left: 1105, top: 640, width: 310, height: 180, kind: "app", at: 14 },
    { id: "s3", label: "S3 private bucket", sub: "evidence, models", left: 1510, top: 330, width: 290, height: 160, kind: "aws", at: 16 },
    { id: "sm", label: "Secrets Manager", sub: "token, DB password", left: 1510, top: 510, width: 290, height: 170, kind: "aws", at: 18 },
    { id: "cw", label: "CloudWatch Logs", sub: "container logs", left: 1510, top: 700, width: 290, height: 146, kind: "aws", at: 20 },
  ];
  const tone = { aws: colors.aws, app: colors.line, opencv: colors.cyanDeep, client: colors.muted };
  const wash = { aws: colors.awsWash, app: colors.card, opencv: colors.cyanWash, client: colors.card };
  const n = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const mid = (node: Node) => node.top + node.height / 2;
  const R = (node: Node) => node.left + node.width;
  const glow = (id: string, at: number, until: number) => (frame >= at && frame <= until ? `0 0 0 8px ${colors.marker}` : "6px 6px 0 rgba(11,23,48,0.08)");
  const thumb = <Img src={staticFile(stages.images["Anomaly/000"].input)} style={{ width: 92, border: `3px solid ${colors.ink}`, borderRadius: 4 }} />;
  const tag = (text: string, color: string) => <div style={{ fontFamily: fonts.sans, fontSize: size.small, fontWeight: 800, color: "#fff", backgroundColor: color, padding: "2px 12px", borderRadius: 6, whiteSpace: "nowrap" }}>{text}</div>;
  const aws = verified.latency.aws;
  const inPath = [[R(n.browser), mid(n.browser)], [n.cf.left, mid(n.cf)], [R(n.cf), mid(n.cf)], [705, mid(n.cf)], [705, mid(n.nginx)], [n.nginx.left, mid(n.nginx)], [n.nginx.left + 160, mid(n.nginx)], [n.nginx.left + 160, n.api.top + 60]];
  const outPath = [[n.api.left + 160, n.api.top + 60], [n.nginx.left + 160, mid(n.nginx)], [n.nginx.left, mid(n.nginx)], [705, mid(n.nginx)], [705, mid(n.cf)], [R(n.cf), mid(n.cf)], [n.cf.left, mid(n.cf)], [R(n.browser) - 70, n.browser.top - 30]];
  const lines = [
    [[R(n.browser), mid(n.browser)], [n.cf.left, mid(n.cf)]],
    [[R(n.cf), mid(n.cf)], [705, mid(n.cf)], [705, mid(n.nginx)], [n.nginx.left, mid(n.nginx)]],
    [[n.nginx.left + 160, n.nginx.top + n.nginx.height], [n.api.left + 160, n.api.top]],
    [[R(n.api), n.api.top + 40], [1090, n.api.top + 40], [1090, mid(n.pg)], [n.pg.left, mid(n.pg)]],
    [[R(n.api), mid(n.redis)], [n.redis.left, mid(n.redis)]],
    [[ec2.left + ec2.width, mid(n.s3)], [n.s3.left, mid(n.s3)]],
    [[n.sm.left, mid(n.sm)], [ec2.left + ec2.width, mid(n.sm)]],
    [[ec2.left + ec2.width, mid(n.cw)], [n.cw.left, mid(n.cw)]],
  ];
  return (
    <Beat kicker="Architecture" title="One request through AWS" fig={{ n: 16, text: "deploy/aws/motionQaStack.yaml · orange = AWS service · RTSP, MES, OPC-UA not deployed" }}>
      <div style={{ position: "absolute", left: 386, top: 290, width: 1438, height: 566, boxSizing: "border-box", border: `3px dashed ${colors.aws}`, borderRadius: 18, opacity: fade(0), boxShadow: frame >= f(176.6) ? `0 0 0 6px ${colors.marker}` : "none" }}>
        <div style={{ position: "absolute", right: 20, top: 6, fontFamily: fonts.sans, fontSize: size.small, color: colors.aws, fontWeight: 700 }}>AWS us-east-1 · one CloudFormation stack</div>
      </div>
      <div style={{ position: "absolute", ...ec2, boxSizing: "border-box", border: `3px solid ${colors.aws}`, borderRadius: 14, backgroundColor: "rgba(217,115,13,0.05)", opacity: fade(2) }}>
        <div style={{ position: "absolute", left: 20, top: 12, fontFamily: fonts.sans, fontSize: size.small, color: colors.aws, fontWeight: 700, lineHeight: 1.2 }}>
          EC2 t4g.small (Graviton)
          <br />
          Docker Compose
        </div>
      </div>
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, opacity: fade(6) }}>
        {lines.map((pts) => (
          <polyline key={pts.join(" ")} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={colors.faint} strokeWidth={4} />
        ))}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            position: "absolute",
            left: node.left,
            top: node.top,
            width: node.width,
            height: node.height,
            boxSizing: "border-box",
            borderRadius: 10,
            border: `3px solid ${tone[node.kind]}`,
            backgroundColor: wash[node.kind],
            boxShadow: glow(node.id, node.id === "api" ? f(163.0) : node.id === "sm" ? f(174.4) : node.id === "s3" ? f(168.8) : node.id === "pg" ? f(169.8) : node.id === "redis" ? f(170.8) : 99999, node.id === "api" ? f(168.2) : node.id === "sm" ? f(176.0) : node.id === "s3" ? f(170.0) : node.id === "pg" ? f(171.0) : f(172.0)),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 2,
            padding: "0 18px",
            opacity: fade(node.at),
            fontFamily: fonts.sans,
          }}
        >
          <div style={{ fontSize: size.body, fontWeight: 800, color: node.kind === "opencv" ? colors.cyanDeep : colors.ink, lineHeight: 1.15 }}>{node.label}</div>
          <div style={{ fontSize: size.small, color: colors.muted, lineHeight: 1.2 }}>{node.sub}</div>
        </div>
      ))}
      <Packet path={inPath} at={f(157.6)} duration={f(163.0) - f(157.6)}>
        {thumb}
      </Packet>
      <Packet path={[[n.api.left + 160, n.api.top + 60], [ec2.left + ec2.width + 6, mid(n.s3)], [n.s3.left + 40, mid(n.s3)]]} at={f(168.6)} duration={30}>
        {tag("evidence JPEG", colors.aws)}
      </Packet>
      <Packet path={[[R(n.api), n.api.top + 40], [1090, n.api.top + 40], [1090, mid(n.pg)], [n.pg.left + 60, mid(n.pg)]]} at={f(169.6)} duration={30}>
        {tag("record", colors.ink)}
      </Packet>
      <Packet path={[[R(n.api), mid(n.redis)], [n.redis.left + 80, mid(n.redis)]]} at={f(170.6)} duration={24}>
        {tag("live event", colors.ink)}
      </Packet>
      <Packet path={outPath} at={f(171.6)} duration={f(173.8) - f(171.6)} hold>
        <Pill decision={stages.images["Anomaly/000"].decision} />
      </Packet>
      <Packet path={[[n.sm.left, mid(n.sm)], [ec2.left + ec2.width - 6, mid(n.sm)], [n.api.left + n.api.width - 10, n.api.top + 140]]} at={f(174.6)} duration={30}>
        {tag("token", colors.aws)}
      </Packet>
      <Pop at={f(163.4)} style={{ position: "absolute", left: 410, top: 336, width: 300 }}>
        <Hand fontSize={42} color={colors.cyanDeep}>
          the 7 stages from Fig. 15 run here
        </Hand>
      </Pop>
      {aws ? (
        <Pop at={f(172.4)} style={{ position: "absolute", left: 96, top: 680, width: 280, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.3 }}>
          <Mark at={f(172.6)}>{`server ${aws.serverMedianMs} ms`}</Mark>
          <div style={{ color: colors.muted }}>{`median on AWS, ${aws.requests} requests`}</div>
        </Pop>
      ) : null}
    </Beat>
  );
};
