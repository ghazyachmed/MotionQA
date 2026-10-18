import type React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Pill } from "../components/kit";
import stages from "../data/pipeline-stages.json";
import { cueIn } from "../lib/data";
import { architectureSegments as seg } from "../timeline";
import type { FootageClipName } from "../timeline";
import { colors, fonts, layout, size } from "../theme";
import { AwsJson, AwsMatch, AwsUi } from "./AppScene";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 135–180 s: the same app live on AWS, its status, one request through the stack, and the 20/20 cloud check.
export const ArchitectureScene: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => (
  <AbsoluteFill>
    <Sequence from={seg.awsUi.from} durationInFrames={seg.awsUi.duration} name="Live on AWS">
      <AwsUi available={available("aws-01-ui-status")} />
    </Sequence>
    <Sequence from={seg.awsJson.from} durationInFrames={seg.awsJson.duration} name="Status">
      <AwsJson available={available} />
    </Sequence>
    <Sequence from={seg.flow.from} durationInFrames={seg.flow.duration} name="Request through AWS">
      <Flow />
    </Sequence>
    <Sequence from={seg.awsMatch.from} durationInFrames={seg.awsMatch.duration} name="20 of 20">
      <AwsMatch />
    </Sequence>
  </AbsoluteFill>
);

type Node = { id: string; label: string; left: number; top: number; width: number; height: number; kind: "aws" | "app" | "opencv" | "client"; at: number };

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

// Sub-labels for the gallery still (detailed mode); the video keeps one word per box.
const details: Record<string, string> = {
  browser: "operator",
  cf: "HTTPS",
  nginx: "UI + /api proxy",
  api: "inspection pipeline",
  pg: "inspection records",
  redis: "live events",
  s3: "private evidence, 30-day expiry",
  sm: "token, DB password",
  cw: "container logs",
};

export const Flow: React.FC<{ kicker?: string; title?: string; detailed?: boolean }> = ({ kicker = "Live on AWS", title = "One request through the stack", detailed = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = cueIn("architecture", "flow", fps);
  const fade = (at: number) => interpolate(frame, [at, at + 10], [0, 1], clamp);
  const top = layout.contentTop;
  const ec2 = { left: 730, top: top + 60, width: 700, height: 530 };
  const nodes: Node[] = [
    { id: "browser", label: "Browser", left: 96, top: top + 250, width: 230, height: 110, kind: "client", at: 0 },
    { id: "cf", label: "CloudFront", left: 410, top: top + 250, width: 260, height: 110, kind: "aws", at: 4 },
    { id: "nginx", label: "nginx", left: 760, top: top + 160, width: 300, height: 110, kind: "app", at: 8 },
    { id: "api", label: "FastAPI + OpenCV 5", left: 760, top: top + 400, width: 300, height: 150, kind: "opencv", at: 10 },
    { id: "pg", label: "PostgreSQL", left: 1100, top: top + 160, width: 300, height: 110, kind: "app", at: 12 },
    { id: "redis", label: "Redis", left: 1100, top: top + 420, width: 300, height: 110, kind: "app", at: 14 },
    { id: "s3", label: "S3", left: 1510, top: top + 60, width: 290, height: 110, kind: "aws", at: 16 },
    { id: "sm", label: "Secrets Manager", left: 1510, top: top + 250, width: 290, height: 110, kind: "aws", at: 18 },
    { id: "cw", label: "CloudWatch", left: 1510, top: top + 440, width: 290, height: 110, kind: "aws", at: 20 },
  ];
  const tone = { aws: colors.aws, app: colors.line, opencv: colors.cyanDeep, client: colors.muted };
  const wash = { aws: colors.awsWash, app: colors.card, opencv: colors.cyanWash, client: colors.card };
  // Detailed mode (gallery still) adds a sub-label, so every box gets 40 px more height; the lines follow the centres.
  if (detailed) for (const node of nodes) node.height += node.id === "s3" || node.id === "sm" ? 66 : 40;
  const n = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const mid = (node: Node) => node.top + node.height / 2;
  const R = (node: Node) => node.left + node.width;
  const glowWindows: Record<string, [number, number]> = {
    api: [f(155.8), f(161.2)],
    s3: [f(161.8), f(163.0)],
    pg: [f(162.8), f(164.0)],
    redis: [f(163.8), f(165.0)],
    sm: [f(167.0), f(168.6)],
  };
  const glow = (id: string) => {
    const w = glowWindows[id];
    return w && frame >= w[0] && frame <= w[1] ? `0 0 0 8px ${colors.marker}` : "6px 6px 0 rgba(11,23,48,0.08)";
  };
  const thumb = <Img src={staticFile(stages.images["Anomaly/000"].input)} style={{ width: 96, border: `3px solid ${colors.ink}`, borderRadius: 4 }} />;
  const tag = (text: string, color: string) => <div style={{ fontFamily: fonts.sans, fontSize: size.small, fontWeight: 800, color: "#fff", backgroundColor: color, padding: "2px 12px", borderRadius: 6, whiteSpace: "nowrap" }}>{text}</div>;
  const elbowX = 715;
  const inPath = [[R(n.browser), mid(n.browser)], [n.cf.left, mid(n.cf)], [R(n.cf), mid(n.cf)], [elbowX, mid(n.cf)], [elbowX, mid(n.nginx)], [n.nginx.left, mid(n.nginx)], [n.nginx.left + 150, mid(n.nginx)], [n.nginx.left + 150, n.api.top + 50]];
  const outPath = [[n.api.left + 150, n.api.top + 50], [n.nginx.left + 150, mid(n.nginx)], [n.nginx.left, mid(n.nginx)], [elbowX, mid(n.nginx)], [elbowX, mid(n.cf)], [R(n.cf), mid(n.cf)], [n.cf.left, mid(n.cf)], [R(n.browser) - 70, n.browser.top - 30]];
  const lines = [
    [[R(n.browser), mid(n.browser)], [n.cf.left, mid(n.cf)]],
    [[R(n.cf), mid(n.cf)], [elbowX, mid(n.cf)], [elbowX, mid(n.nginx)], [n.nginx.left, mid(n.nginx)]],
    [[n.nginx.left + 150, n.nginx.top + n.nginx.height], [n.api.left + 150, n.api.top]],
    [[R(n.api), n.api.top + 30], [1080, n.api.top + 30], [1080, mid(n.pg)], [n.pg.left, mid(n.pg)]],
    [[R(n.api), mid(n.redis)], [n.redis.left, mid(n.redis)]],
    [[ec2.left + ec2.width, mid(n.s3)], [n.s3.left, mid(n.s3)]],
    [[n.sm.left, mid(n.sm)], [ec2.left + ec2.width, mid(n.sm)]],
    [[ec2.left + ec2.width, mid(n.cw)], [n.cw.left, mid(n.cw)]],
  ];
  return (
    <Beat kicker={kicker} title={title} note="deploy/aws/motionQaStack.yaml">
      <div style={{ position: "absolute", left: 380, top: top, width: 1444, height: 600, boxSizing: "border-box", border: `3px dashed ${colors.aws}`, borderRadius: 18, opacity: fade(0), boxShadow: frame >= f(168.8) ? `0 0 0 8px ${colors.marker}` : "none" }}>
        <div style={{ position: "absolute", left: 20, top: 8, fontFamily: fonts.hand, fontWeight: 600, fontSize: 42, color: colors.aws }}>one CloudFormation stack</div>
      </div>
      <div style={{ position: "absolute", ...ec2, boxSizing: "border-box", border: `3px solid ${colors.aws}`, borderRadius: 14, backgroundColor: "rgba(217,115,13,0.05)", opacity: fade(2) }}>
        <div style={{ position: "absolute", left: 20, top: 10, fontFamily: fonts.sans, fontSize: size.small, color: colors.aws, fontWeight: 800 }}>EC2 Graviton</div>
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
            boxShadow: glow(node.id),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 14px",
            opacity: fade(node.at),
            fontFamily: fonts.sans,
            fontSize: size.body,
            fontWeight: 800,
            color: node.kind === "opencv" ? colors.cyanDeep : colors.ink,
            lineHeight: 1.15,
          }}
        >
          {node.label}
          {detailed ? <div style={{ fontSize: size.small, fontWeight: 500, color: colors.muted, lineHeight: 1.15, marginTop: 4 }}>{details[node.id]}</div> : null}
        </div>
      ))}
      <Packet path={inPath} at={f(150.6)} duration={f(155.8) - f(150.6)}>
        {thumb}
      </Packet>
      <Packet path={[[n.api.left + 150, n.api.top + 50], [ec2.left + ec2.width + 6, mid(n.s3)], [n.s3.left + 40, mid(n.s3)]]} at={f(161.6)} duration={30}>
        {tag("evidence", colors.aws)}
      </Packet>
      <Packet path={[[R(n.api), n.api.top + 30], [1080, n.api.top + 30], [1080, mid(n.pg)], [n.pg.left + 60, mid(n.pg)]]} at={f(162.6)} duration={30}>
        {tag("record", colors.ink)}
      </Packet>
      <Packet path={[[R(n.api), mid(n.redis)], [n.redis.left + 80, mid(n.redis)]]} at={f(163.6)} duration={24}>
        {tag("live event", colors.ink)}
      </Packet>
      <Packet path={outPath} at={f(164.6)} duration={f(166.6) - f(164.6)} hold>
        <Pill decision={stages.images["Anomaly/000"].decision} />
      </Packet>
      <Packet path={[[n.sm.left, mid(n.sm)], [ec2.left + ec2.width - 6, mid(n.sm)], [R(n.api) - 10, n.api.top + 120]]} at={f(167.2)} duration={30}>
        {tag("token", colors.aws)}
      </Packet>
    </Beat>
  );
};
