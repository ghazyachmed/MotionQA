import type React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Card, Draw, Hand, Pop, Stamp } from "../components/kit";
import { cueIn, fraction, verified } from "../lib/data";
import type { Fraction } from "../lib/data";
import { evaluationSegments as seg } from "../timeline";
import { colors, decisionColor, decisionWash, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const m = verified.metrics;
const sp = verified.split;
const t = verified.thresholds;

// 180–240 s: where the data comes from, every test image on one score axis, the baseline, and why it is exploratory.
export const EvaluationScene: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={seg.data.from} durationInFrames={seg.data.duration} name="Data origin">
      <DataOrigin />
    </Sequence>
    <Sequence from={seg.strip.from} durationInFrames={seg.strip.duration} name="153 test images">
      <StripPlot />
    </Sequence>
    <Sequence from={seg.compare.from} durationInFrames={seg.compare.duration} name="Baseline">
      <Compare />
    </Sequence>
    <Sequence from={seg.why.from} durationInFrames={seg.why.duration} name="Why exploratory">
      <WhyExploratory />
    </Sequence>
  </AbsoluteFill>
);

const Box: React.FC<{ left: number; top: number; width: number; height: number; at: number; accent?: string; children: React.ReactNode }> = ({ left, top, width, height, at, accent, children }) => (
  <Pop at={at} style={{ position: "absolute", left, top, width, height }}>
    <Card accent={accent} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, padding: "14px 24px" }}>
      {children}
    </Card>
  </Pop>
);

const DataOrigin: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = cueIn("evaluation", "data", fps);
  const o = verified.dataOrigin;
  const top = layout.contentTop + 20;
  const branches = [
    { y: top, count: `${sp.bankNormal} good`, what: "build the memory", at: f(185.9), accent: colors.blue },
    { y: top + 200, count: `${sp.validationNormal} + ${sp.validationAnomaly}`, what: "set the lines", at: f(188.6), accent: colors.amber },
    { y: top + 400, count: `${sp.testNormal} + ${sp.testAnomaly}`, what: "give the results", at: f(191.4), accent: colors.red },
  ];
  const big = { fontFamily: fonts.mono, fontSize: 48, fontWeight: 600, color: colors.ink } as const;
  return (
    <Beat kicker="Results" title="Public data, split three ways" note="VisA pcb1 · CC BY 4.0 · evaluation/visaPcb1Split.json">
      <Box left={96} top={top + 160} width={400} height={200} at={f(180.6)} accent={colors.aws}>
        <Hand fontSize={46} color={colors.aws}>
          AWS Open Data
        </Hand>
        <div style={{ fontSize: size.subtitle, fontWeight: 800 }}>VisA</div>
      </Box>
      <Draw d={`M 500 ${top + 260} L 600 ${top + 260}`} at={f(182.2)} head />
      <Box left={610} top={top + 160} width={380} height={200} at={f(182.6)} accent={colors.ink}>
        <div style={{ fontSize: size.subtitle, fontWeight: 800 }}>pcb1</div>
        <div style={big}>{`${o.pcb1Normal.toLocaleString("en-US")} + ${o.pcb1Anomaly}`}</div>
        <div style={{ fontSize: size.small, color: colors.muted }}>good + defective</div>
      </Box>
      {branches.map((b) => (
        <div key={b.what}>
          <Draw d={`M 994 ${top + 260} C 1060 ${top + 260}, 1060 ${b.y + 80}, 1130 ${b.y + 80}`} at={b.at - 8} color={b.accent} head />
          <Box left={1140} top={b.y} width={684} height={160} at={b.at} accent={b.accent}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              <span style={big}>{b.count}</span>
              <Hand fontSize={52} color={b.accent}>{`→ ${b.what}`}</Hand>
            </div>
          </Box>
        </div>
      ))}
    </Beat>
  );
};

type Dot = { id: string; label: string; decision: string; score: number; x: number; y: number; order: number };

const axisX = (v: number) => (v <= 3.3 ? 330 + ((v - 1.9) / 1.4) * 1230 : 1610 + ((v - 3.3) / 1.9) * 190);
const rowY = { normal: 412, anomaly: 680 };

// Deterministic beeswarm: dots sorted by score take the nearest free level (0, -1, +1, -2, ...), 17 px apart.
const dots: Dot[] = (() => {
  const result: Dot[] = [];
  for (const label of ["normal", "anomaly"] as const) {
    const rows = verified.testRecords.filter((r) => r.label === label).sort((a, b) => a.score - b.score);
    const placed: Array<{ x: number; level: number }> = [];
    for (const r of rows) {
      const x = axisX(r.score);
      let k = 0;
      let level = 0;
      for (;;) {
        level = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        if (placed.every((p) => Math.abs(p.x - x) >= 17 || p.level !== level)) break;
        k += 1;
      }
      placed.push({ x, level });
      result.push({ id: r.id, label, decision: r.decision, score: r.score, x, y: rowY[label] + level * 17, order: 0 });
    }
  }
  // Drop-in order follows the image id, not the score, so the swarm fills evenly.
  [...result].sort((a, b) => a.id.localeCompare(b.id)).forEach((d, i) => (d.order = i));
  return result;
})();

// Shows one annotation at a time: visible from `at` until `until`.
const Spot: React.FC<{ at: number; until: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, until, children, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [at, at + 8, until, until + 8], [0, 1, 1, 0], clamp);
  return opacity > 0 ? <div style={{ position: "absolute", opacity, ...style }}>{children}</div> : null;
};

const StripPlot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = cueIn("evaluation", "strip", fps);
  const dropAt = f(196.8);
  const linesAt = f(201.9);
  const colorAt = f(203.4);
  const missAt = f(207.4);
  const rejectAt = f(210.0);
  const reviewAt = f(213.0);
  const aurocAt = f(217.0);
  const passX = axisX(t.passBelow);
  const failX = axisX(t.failAtOrAbove);
  const zoneO = interpolate(frame, [linesAt, linesAt + 10], [0, 1], clamp);
  const miss = dots.find((d) => d.label === "anomaly" && d.decision === "PASS");
  const rejects = dots.filter((d) => d.label === "normal" && d.decision === "FAIL");
  const ticks = [2.0, 2.4, 2.8, 3.2, 4.0, 5.0];
  const chip = (value: string, text: string, tone: string) => (
    <Card style={{ padding: "8px 20px", borderColor: tone, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: fonts.mono, fontSize: 44, fontWeight: 600, color: tone }}>{value}</span>
      <span style={{ fontSize: size.body, fontWeight: 600 }}>{` ${text}`}</span>
    </Card>
  );
  return (
    <Beat kicker="Exploratory development results" title={`${sp.testTotal} test images, one score each`} note="each dot = one image · raw score, not a probability">
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
        <g opacity={zoneO}>
          <rect x={330} y={300} width={passX - 330} height={470} fill={decisionWash("PASS")} opacity={0.55} />
          <rect x={passX} y={300} width={failX - passX} height={470} fill={decisionWash("REVIEW")} opacity={0.6} />
          <rect x={failX} y={300} width={1800 - failX} height={470} fill={decisionWash("FAIL")} opacity={0.5} />
        </g>
        <line x1={330} y1={780} x2={1560} y2={780} stroke={colors.line} strokeWidth={3} />
        <line x1={1610} y1={780} x2={1800} y2={780} stroke={colors.line} strokeWidth={3} />
        <path d="M 1570 792 L 1584 768 M 1586 792 L 1600 768" stroke={colors.red} strokeWidth={3} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={axisX(v)} y1={780} x2={axisX(v)} y2={792} stroke={colors.line} strokeWidth={3} />
            <text x={axisX(v)} y={828} fontSize={32} fontFamily={fonts.mono} fill={colors.muted} textAnchor="middle">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {dots.map((d) => {
          const appear = dropAt + Math.floor(d.order / 2);
          if (frame < appear) return null;
          const fall = interpolate(frame, [appear, appear + 10], [-40, 0], { ...clamp, easing: Easing.out(Easing.bounce) });
          const colored = frame >= colorAt + Math.floor(d.order / 6);
          const focus =
            frame >= aurocAt ? false : frame >= reviewAt ? d.decision === "REVIEW" : frame >= rejectAt ? d.label === "normal" && d.decision === "FAIL" : frame >= missAt ? d.label === "anomaly" && d.decision === "PASS" : true;
          return <circle key={d.id} cx={d.x} cy={d.y + fall} r={8} fill={colored ? decisionColor(d.decision) : colors.faint} stroke="#fff" strokeWidth={1.5} opacity={focus ? 1 : 0.22} />;
        })}
        {frame >= linesAt ? (
          <>
            <line x1={passX} y1={300} x2={passX} y2={300 + 480 * interpolate(frame, [linesAt, linesAt + 14], [0, 1], clamp)} stroke={colors.green} strokeWidth={4} strokeDasharray="12 8" />
            <line x1={failX} y1={300} x2={failX} y2={300 + 480 * interpolate(frame, [linesAt + 6, linesAt + 20], [0, 1], clamp)} stroke={colors.red} strokeWidth={4} strokeDasharray="12 8" />
          </>
        ) : null}
        {miss && frame >= missAt && frame < rejectAt + 8 ? <circle cx={miss.x} cy={miss.y} r={22} fill="none" stroke={colors.red} strokeWidth={5} /> : null}
        {frame >= rejectAt && frame < reviewAt + 8 ? rejects.map((d) => <circle key={d.id} cx={d.x} cy={d.y} r={18} fill="none" stroke={colors.red} strokeWidth={4} />) : null}
      </svg>
      <div style={{ position: "absolute", left: 96, top: rowY.normal - 24, fontFamily: fonts.sans, fontSize: size.body, fontWeight: 800, color: colors.ink }}>good</div>
      <div style={{ position: "absolute", left: 96, top: rowY.anomaly - 24, fontFamily: fonts.sans, fontSize: size.body, fontWeight: 800, color: colors.ink }}>defective</div>
      <div style={{ position: "absolute", left: 0, top: 254, width: 1920, opacity: zoneO, fontFamily: fonts.sans, fontSize: size.body, fontWeight: 800 }}>
        <span style={{ position: "absolute", left: 345, color: colors.green }}>PASS</span>
        <span style={{ position: "absolute", left: passX + 14, color: colors.amber }}>REVIEW</span>
        <span style={{ position: "absolute", left: failX + 14, color: colors.red }}>FAIL</span>
      </div>
      {miss ? (
        <Spot at={missAt} until={rejectAt} style={{ left: miss.x + 34, top: miss.y - 110 }}>
          {chip(fraction(m.anomalyToPass.motionqa), "defective passed", colors.red)}
        </Spot>
      ) : null}
      <Spot at={rejectAt} until={reviewAt} style={{ left: 1180, top: 520 }}>
        {chip(fraction(m.normalToFail.motionqa), "good failed", colors.red)}
      </Spot>
      <Spot at={reviewAt} until={aurocAt} style={{ left: 760, top: 530 }}>
        {chip(fraction(m.review.motionqa), "to a person", colors.amber)}
      </Spot>
      <Spot at={aurocAt} until={99999} style={{ left: 510, top: 400, width: 900 }}>
        <Card accent={colors.cyan} style={{ textAlign: "center" }}>
          <div style={{ fontSize: size.body, fontWeight: 700 }}>Image AUROC</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 110, fontWeight: 600, lineHeight: 1.05 }}>{m.imageAuroc.motionqa.toFixed(4)}</div>
          <Hand fontSize={48} color={colors.red}>
            a ranking score, not accuracy
          </Hand>
        </Card>
      </Spot>
    </Beat>
  );
};

const PairBar: React.FC<{ f: Fraction; tone: string; at: number }> = ({ f, tone, at }) => {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [at, at + 18], [0, 1], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 44, fontWeight: 600, width: 230, textAlign: "right", whiteSpace: "nowrap" }}>{fraction(f)}</div>
      <div style={{ width: 230, height: 22, backgroundColor: "#E3E6EC", borderRadius: 11, overflow: "hidden" }}>
        <div style={{ width: `${(100 * f.n * grow) / f.d}%`, height: "100%", backgroundColor: tone }} />
      </div>
    </div>
  );
};

const Compare: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = cueIn("evaluation", "compare", fps);
  const rows: Array<{ label: string; a: React.ReactNode; b: React.ReactNode; at: number }> = [
    { label: "Image AUROC", a: <Big text={m.imageAuroc.motionqa.toFixed(4)} />, b: <Big text={m.imageAuroc.baseline.toFixed(4)} />, at: f(223.1) },
    { label: "Defective → PASS", a: <PairBar f={m.anomalyToPass.motionqa} tone={colors.red} at={f(226.4)} />, b: <PairBar f={m.anomalyToPass.baseline} tone={colors.red} at={f(226.4)} />, at: f(226.4) },
    { label: "Good → FAIL", a: <PairBar f={m.normalToFail.motionqa} tone={colors.red} at={f(227.9)} />, b: <PairBar f={m.normalToFail.baseline} tone={colors.red} at={f(227.9)} />, at: f(227.9) },
    { label: "REVIEW", a: <PairBar f={m.review.motionqa} tone={colors.amber} at={f(228.9)} />, b: <PairBar f={m.review.baseline} tone={colors.amber} at={f(228.9)} />, at: f(228.9) },
  ];
  return (
    <Beat kicker="Exploratory development results" title="Compared with an OpenCV-only baseline" note="baseline: cv.findTransformECC template difference">
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 20, display: "grid", gridTemplateColumns: "560px 560px 560px", columnGap: 24, fontFamily: fonts.sans, color: colors.ink }}>
        <div />
        <div style={{ fontSize: size.subtitle, fontWeight: 800, color: colors.cyanDeep, paddingBottom: 10, paddingLeft: 60 }}>MotionQA</div>
        <div style={{ fontSize: size.subtitle, fontWeight: 800, color: colors.muted, paddingBottom: 10, paddingLeft: 60 }}>baseline</div>
        {rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
    </Beat>
  );
};

const Big: React.FC<{ text: string }> = ({ text }) => <div style={{ fontFamily: fonts.mono, fontSize: 60, fontWeight: 600, paddingLeft: 60 }}>{text}</div>;

const Row: React.FC<{ row: { label: string; a: React.ReactNode; b: React.ReactNode; at: number } }> = ({ row }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [row.at, row.at + 10], [0, 1], clamp);
  const cell: React.CSSProperties = { opacity, borderTop: `2px solid ${colors.line}`, padding: "16px 0", display: "flex", alignItems: "center", minHeight: 96 };
  return (
    <>
      <div style={{ ...cell, fontSize: size.subtitle, fontWeight: 700 }}>{row.label}</div>
      <div style={cell}>{row.a}</div>
      <div style={cell}>{row.b}</div>
    </>
  );
};

const WhyExploratory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = cueIn("evaluation", "why", fps);
  const runs = verified.history;
  const xs = [200, 640, 1080, 1520];
  const lineP = interpolate(frame, [f(232.0), f(235.3)], [0, 1], clamp);
  return (
    <Beat kicker="Exploratory development results" title="Development results, not an independent test" note="evaluation/results/history/">
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
        <line x1={200} y1={420} x2={200 + (1520 - 200) * lineP} y2={420} stroke={colors.line} strokeWidth={4} />
      </svg>
      {runs.map((run, i) => {
        const at = f(232.0) + i * 16;
        const changed = i === 1;
        return (
          <Pop key={run.run} at={at} style={{ position: "absolute", left: xs[i] - 30, top: 390, width: 380 }}>
            <div style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: changed ? colors.red : colors.ink, border: "5px solid #fff", boxShadow: `0 0 0 4px ${changed ? colors.red : colors.ink}` }} />
            <div style={{ marginTop: 14, fontFamily: fonts.mono, fontSize: size.small, color: colors.muted }}>{`${run.generatedAt.slice(5, 10)} ${run.generatedAt.slice(11, 16)}`}</div>
          </Pop>
        );
      })}
      <Pop at={f(232.6)} style={{ position: "absolute", left: xs[1] - 40, top: 290 }}>
        <Hand fontSize={52} color={colors.red}>
          capture gates changed here ↓
        </Hand>
      </Pop>
      <Pop at={f(235.3)} style={{ position: "absolute", left: layout.margin, top: 600 }}>
        <Stamp text="NOT AN INDEPENDENT EVALUATION" at={f(235.5)} />
      </Pop>
    </Beat>
  );
};
