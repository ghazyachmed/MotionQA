import type React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Card, CountUp, Draw, Hand, Mark, Pop, Stamp } from "../components/kit";
import { fraction, verified } from "../lib/data";
import type { Fraction } from "../lib/data";
import { evaluationSegments as seg, scenes } from "../timeline";
import { colors, decisionColor, decisionWash, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const m = verified.metrics;
const sp = verified.split;
const t = verified.thresholds;
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - scenes.evaluation.from - segmentFrom;

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
    <Card accent={accent} style={{ height: "100%", padding: "16px 22px" }}>
      {children}
    </Card>
  </Pop>
);

const DataOrigin: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.data.from, fps);
  const o = verified.dataOrigin;
  const top = layout.contentTop;
  const gb = ((o.archiveBytes ?? 0) / 1e9).toFixed(2);
  const branches = [
    { y: top + 0, title: "memory bank", line1: `${sp.bankNormal} good boards`, line2: `→ ${o.memoryBankPatches.toLocaleString("en-US")} normal patches`, at: f(185.9), accent: colors.blue },
    { y: top + 196, title: "validation", line1: `${sp.validationNormal} good + ${sp.validationAnomaly} defective`, line2: "→ thresholds, model choice", at: f(188.6), accent: colors.amber },
    { y: top + 392, title: "test", line1: `${sp.testNormal} good + ${sp.testAnomaly} defective`, line2: "→ every result in this video", at: f(191.4), accent: colors.red },
  ];
  return (
    <Beat kicker="Evaluation" title="Where the data comes from" fig={{ n: 17, text: "evaluation/visaPcb1Split.json, seed 20261015 · docs/EVALUATION.md" }}>
      <Box left={96} top={top + 150} width={430} height={250} at={f(180.6)} accent={colors.aws}>
        <Hand fontSize={42} color={colors.aws}>
          AWS Open Data · S3
        </Hand>
        <div style={{ fontSize: size.body, fontWeight: 800, marginTop: 4 }}>VisA archive</div>
        <div style={{ fontSize: size.small, color: colors.muted, lineHeight: 1.3 }}>{`${gb} GB · ${o.license}`}</div>
        <div style={{ fontSize: size.small, color: colors.muted, lineHeight: 1.3 }}>Zou et al., ECCV 2022</div>
      </Box>
      <Draw d={`M 530 ${top + 275} L 640 ${top + 275}`} at={f(182.2)} head />
      <Box left={650} top={top + 150} width={380} height={250} at={f(182.6)} accent={colors.ink}>
        <Hand fontSize={42}>category used</Hand>
        <div style={{ fontSize: size.body, fontWeight: 800, marginTop: 4 }}>pcb1 (HC-SR04)</div>
        <div style={{ fontSize: size.small, lineHeight: 1.35 }}>
          <span style={{ fontFamily: fonts.mono }}>
            <CountUp to={o.pcb1Normal} at={f(182.8)} />
          </span>{" "}
          good
        </div>
        <div style={{ fontSize: size.small, lineHeight: 1.35 }}>
          <span style={{ fontFamily: fonts.mono }}>
            <CountUp to={o.pcb1Anomaly} at={f(182.8)} />
          </span>{" "}
          defective
        </div>
      </Box>
      {branches.map((b) => (
        <div key={b.title}>
          <Draw d={`M 1034 ${top + 275} C 1090 ${top + 275}, 1090 ${b.y + 85}, 1150 ${b.y + 85}`} at={b.at - 8} color={b.accent} head />
          <Box left={1160} top={b.y} width={664} height={170} at={b.at} accent={b.accent}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontSize: size.body, fontWeight: 800 }}>{b.title}</span>
              <span style={{ fontSize: size.small, fontFamily: fonts.mono }}>{b.line1}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Hand fontSize={42} color={b.accent}>
                {b.line2}
              </Hand>
            </div>
          </Box>
        </div>
      ))}
      <Pop at={f(193.6)} style={{ position: "absolute", left: 96, top: top + 440, width: 940, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted, lineHeight: 1.35 }}>
        {`Plus ${o.otherObjectValidation} + ${o.otherObjectTest} images of 10 other VisA objects for the NO_PART and wrong-object checks.`}
      </Pop>
    </Beat>
  );
};

type Dot = { id: string; label: string; decision: string; score: number; x: number; y: number; order: number };

const axisX = (v: number) => (v <= 3.3 ? 330 + ((v - 1.9) / 1.4) * 1230 : 1610 + ((v - 3.3) / 1.9) * 190);
const rowY = { normal: 432, anomaly: 694 };

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

const StripPlot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.strip.from, fps);
  const dropAt = f(196.8);
  const linesAt = f(201.9);
  const colorAt = f(203.4);
  const missAt = f(207.4);
  const rejectAt = f(209.6);
  const reviewAt = f(213.0);
  const aurocAt = f(217.0);
  const passX = axisX(t.passBelow);
  const failX = axisX(t.failAtOrAbove);
  const zoneO = interpolate(frame, [linesAt, linesAt + 10], [0, 1], clamp);
  const miss = dots.find((d) => d.label === "anomaly" && d.decision === "PASS");
  const rejects = dots.filter((d) => d.label === "normal" && d.decision === "FAIL");
  const identity = dots.find((d) => d.id === "Anomaly/043");
  const ticks = [2.0, 2.4, 2.8, 3.2, 4.0, 5.0];
  return (
    <Beat kicker="Exploratory development results" title="All 153 test images on one axis" fig={{ n: 18, text: "each dot = one test image from visaPcb1Results.json, placed by its raw anomaly score (not a probability)" }}>
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
        <g opacity={zoneO}>
          <rect x={330} y={330} width={passX - 330} height={440} fill={decisionWash("PASS")} opacity={0.55} />
          <rect x={passX} y={330} width={failX - passX} height={440} fill={decisionWash("REVIEW")} opacity={0.6} />
          <rect x={failX} y={330} width={1800 - failX} height={440} fill={decisionWash("FAIL")} opacity={0.5} />
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
          const dim = (frame >= reviewAt && frame < aurocAt && d.decision !== "REVIEW") || frame >= aurocAt;
          return <circle key={d.id} cx={d.x} cy={d.y + fall} r={8} fill={colored ? decisionColor(d.decision) : colors.faint} stroke="#fff" strokeWidth={1.5} opacity={dim ? 0.25 : 1} />;
        })}
        {frame >= linesAt ? (
          <>
            <line x1={passX} y1={330} x2={passX} y2={330 + 450 * interpolate(frame, [linesAt, linesAt + 14], [0, 1], clamp)} stroke={colors.green} strokeWidth={4} strokeDasharray="12 8" />
            <line x1={failX} y1={330} x2={failX} y2={330 + 450 * interpolate(frame, [linesAt + 6, linesAt + 20], [0, 1], clamp)} stroke={colors.red} strokeWidth={4} strokeDasharray="12 8" />
          </>
        ) : null}
        {miss && frame >= missAt ? <circle cx={miss.x} cy={miss.y} r={20} fill="none" stroke={colors.red} strokeWidth={4} /> : null}
        {frame >= rejectAt
          ? rejects.map((d) => <circle key={d.id} cx={d.x} cy={d.y} r={16} fill="none" stroke={colors.red} strokeWidth={3} />)
          : null}
      </svg>
      <div style={{ position: "absolute", left: 96, top: rowY.normal - 30, width: 220, fontFamily: fonts.sans, fontSize: size.small, fontWeight: 800, color: colors.ink }}>{`${sp.testNormal} good`}</div>
      <div style={{ position: "absolute", left: 96, top: rowY.anomaly - 30, width: 220, fontFamily: fonts.sans, fontSize: size.small, fontWeight: 800, color: colors.ink }}>{`${sp.testAnomaly} defective`}</div>
      <div style={{ position: "absolute", left: 0, top: 288, width: 1920, opacity: zoneO, fontFamily: fonts.sans, fontSize: size.small, fontWeight: 800 }}>
        <span style={{ position: "absolute", left: 340, color: colors.green }}>PASS</span>
        <span style={{ position: "absolute", left: passX + 10, color: colors.amber }}>REVIEW</span>
        <span style={{ position: "absolute", left: failX + 10, color: colors.red }}>FAIL</span>
        <span style={{ position: "absolute", left: passX - 108, top: 0, fontFamily: fonts.mono, fontWeight: 600, color: colors.green }}>{t.passBelow.toFixed(3)}</span>
        <span style={{ position: "absolute", left: failX + 140, top: 0, fontFamily: fonts.mono, fontWeight: 600, color: colors.red }}>{t.failAtOrAbove.toFixed(3)}</span>
      </div>
      {miss ? (
        <Pop at={missAt} style={{ position: "absolute", left: miss.x + 26, top: miss.y + 8, whiteSpace: "nowrap" }}>
          <Hand fontSize={42} color={colors.red}>{`↖ 048 · ${miss.score.toFixed(3)} · missed`}</Hand>
        </Pop>
      ) : null}
      <Pop at={missAt + 10} style={{ position: "absolute", left: 340, top: 566 }}>
        <Card style={{ padding: "8px 18px" }}>
          <span style={{ fontFamily: fonts.mono, fontSize: size.body, fontWeight: 600, color: colors.red }}>{fraction(m.anomalyToPass.motionqa)}</span>
          <span style={{ fontSize: size.small }}> defective → PASS</span>
        </Card>
      </Pop>
      <Pop at={rejectAt} style={{ position: "absolute", left: 1280, top: 566 }}>
        <Card style={{ padding: "8px 18px" }}>
          <span style={{ fontFamily: fonts.mono, fontSize: size.body, fontWeight: 600, color: colors.red }}>{fraction(m.normalToFail.motionqa)}</span>
          <span style={{ fontSize: size.small }}> good → FAIL</span>
        </Card>
      </Pop>
      {identity ? (
        <Pop at={colorAt + 30} style={{ position: "absolute", left: 1580, top: 470, width: 240, textAlign: "right" }}>
          <Hand fontSize={40} color={colors.amber}>
            043 · identity
            <br />→ REVIEW ↓
          </Hand>
        </Pop>
      ) : null}
      <Pop at={reviewAt} style={{ position: "absolute", left: 880, top: 566 }}>
        <Card style={{ padding: "8px 18px", borderColor: colors.amber }}>
          <span style={{ fontFamily: fonts.mono, fontSize: size.body, fontWeight: 600, color: colors.amber }}>{fraction(m.review.motionqa)}</span>
          <span style={{ fontSize: size.small }}> to REVIEW</span>
        </Card>
      </Pop>
      <Pop at={aurocAt} style={{ position: "absolute", left: 460, top: 420, width: 1000 }}>
        <Card accent={colors.cyan} style={{ textAlign: "center" }}>
          <div style={{ fontSize: size.body, fontWeight: 700 }}>Image AUROC, test split</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 96, fontWeight: 600, lineHeight: 1.1 }}>{m.imageAuroc.motionqa.toFixed(4)}</div>
          <Hand fontSize={44}>how often a defective image outscores a good one</Hand>
          <div style={{ marginTop: 6, fontSize: size.small, fontWeight: 800, color: colors.red }}>a ranking measure, not accuracy</div>
        </Card>
      </Pop>
    </Beat>
  );
};

const FractionBar: React.FC<{ f: Fraction; tone: string; at: number }> = ({ f, tone, at }) => {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [at, at + 18], [0, 1], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: size.body, fontWeight: 600, width: 200, textAlign: "right", whiteSpace: "nowrap" }}>{fraction(f)}</div>
      <div style={{ width: 220, height: 18, backgroundColor: "#E3E6EC", borderRadius: 9, overflow: "hidden" }}>
        <div style={{ width: `${(100 * f.n * grow) / f.d}%`, height: "100%", backgroundColor: tone }} />
      </div>
    </div>
  );
};

const Compare: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.compare.from, fps);
  const rows: Array<{ label: string; sub: string; a: React.ReactNode; b: React.ReactNode; at: number }> = [
    { label: "Image AUROC", sub: "ranking, not accuracy", a: <Big text={m.imageAuroc.motionqa.toFixed(4)} />, b: <Big text={m.imageAuroc.baseline.toFixed(4)} />, at: f(221.4) },
    { label: "Defective → PASS", sub: "missed defects", a: <FractionBar f={m.anomalyToPass.motionqa} tone={colors.red} at={f(223.0)} />, b: <FractionBar f={m.anomalyToPass.baseline} tone={colors.red} at={f(223.0)} />, at: f(223.0) },
    { label: "Good → FAIL", sub: "false rejections", a: <FractionBar f={m.normalToFail.motionqa} tone={colors.red} at={f(224.4)} />, b: <FractionBar f={m.normalToFail.baseline} tone={colors.red} at={f(224.4)} />, at: f(224.4) },
    { label: "REVIEW", sub: "sent to a person", a: <FractionBar f={m.review.motionqa} tone={colors.amber} at={f(226.0)} />, b: <FractionBar f={m.review.baseline} tone={colors.amber} at={f(226.0)} />, at: f(226.0) },
    { label: "Automatic PASS or FAIL", sub: "all test images", a: <FractionBar f={m.automatic.motionqa} tone={colors.cyanDeep} at={f(227.0)} />, b: <FractionBar f={m.automatic.baseline} tone={colors.cyanDeep} at={f(227.0)} />, at: f(227.0) },
  ];
  return (
    <Beat kicker="Exploratory development results" title="Against an OpenCV-only baseline" fig={{ n: 19, text: `baseline: cv.findTransformECC template difference, same thresholding · ${sp.testTotal} test images · policy ${verified.evaluation.decisionPolicy}` }}>
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop, display: "grid", gridTemplateColumns: "640px 520px 520px", columnGap: 24, fontFamily: fonts.sans, color: colors.ink }}>
        <div />
        <div style={{ fontSize: size.body, fontWeight: 800, color: colors.cyanDeep, paddingBottom: 6 }}>MotionQA</div>
        <div style={{ fontSize: size.body, fontWeight: 800, color: colors.muted, paddingBottom: 6 }}>baseline</div>
        {rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
      <Pop at={f(227.6)} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 520, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted }}>
        {`Policy 1 run (${verified.policy1.generatedAt.slice(0, 10)}): REVIEW ${fraction(verified.policy1.review)}, NO_PART ${fraction(verified.policy1.noPart)} (Anomaly/043). Same denominator.`}
      </Pop>
    </Beat>
  );
};

const Big: React.FC<{ text: string }> = ({ text }) => <div style={{ fontFamily: fonts.mono, fontSize: 46, fontWeight: 600, paddingLeft: 60 }}>{text}</div>;

const Row: React.FC<{ row: { label: string; sub: string; a: React.ReactNode; b: React.ReactNode; at: number } }> = ({ row }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [row.at, row.at + 10], [0, 1], clamp);
  const cell: React.CSSProperties = { opacity, borderTop: `2px solid ${colors.line}`, padding: "8px 0", display: "flex", alignItems: "center", minHeight: 82 };
  return (
    <>
      <div style={{ ...cell, flexDirection: "column", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ fontSize: size.body, fontWeight: 700, lineHeight: 1.15 }}>{row.label}</div>
        <div style={{ fontSize: size.small, color: colors.muted, lineHeight: 1.15 }}>{row.sub}</div>
      </div>
      <div style={cell}>{row.a}</div>
      <div style={cell}>{row.b}</div>
    </>
  );
};

const WhyExploratory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.why.from, fps);
  const runs = verified.history;
  const xs = [140, 560, 980, 1400];
  const lineP = interpolate(frame, [f(229.2), f(231.6)], [0, 1], clamp);
  const o = verified.orientation;
  return (
    <Beat kicker="Exploratory development results" title="Why this is development data" fig={{ n: 20, text: "result files in evaluation/results/history/ and the current visaPcb1Results.json" }}>
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
        <line x1={140} y1={400} x2={140 + (1400 - 140) * lineP} y2={400} stroke={colors.line} strokeWidth={4} />
      </svg>
      {runs.map((run, i) => {
        const at = f(229.2) + i * 18;
        const changed = i === 1;
        return (
          <Pop key={run.run} at={at} style={{ position: "absolute", left: xs[i] - 24, top: 376, width: 400 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: changed ? colors.red : colors.ink, border: "4px solid #fff", boxShadow: `0 0 0 3px ${changed ? colors.red : colors.ink}` }} />
            <div style={{ marginTop: 14, fontFamily: fonts.mono, fontSize: size.small, color: colors.muted }}>{`${run.generatedAt.slice(5, 10)} ${run.generatedAt.slice(11, 16)}Z`}</div>
            <div style={{ marginTop: 4, fontFamily: fonts.sans, fontSize: size.small, fontWeight: 700, color: changed ? colors.red : colors.ink, width: 380, lineHeight: 1.25 }}>{run.run}</div>
          </Pop>
        );
      })}
      <Pop at={f(234.2)} style={{ position: "absolute", left: layout.margin, top: 640 }}>
        <Stamp text="NOT AN INDEPENDENT EVALUATION" at={f(234.4)} />
      </Pop>
      <Pop at={f(235.4)} style={{ position: "absolute", left: 1000, top: 620, width: 824, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.35 }}>
        <div>
          <Mark at={f(235.6)}>{`${sp.validationAnomaly} official-test anomalies`}</Mark> were used for thresholds.
        </div>
        <div>{`Pins down: ${fraction(o.anomalyPinsDown)} defective vs ${fraction(o.normalPinsDown)} good boards.`}</div>
      </Pop>
    </Beat>
  );
};
