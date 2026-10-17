import type React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ClipPanel, clipBox, identityZones, zoomKeys } from "../components/ClipPanel";
import { FootageClip } from "../components/FootageClip";
import { Beat, Draw, Hand, Pill, Pop, Ruler, Stamp } from "../components/kit";
import stages from "../data/pipeline-stages.json";
import { footage, fraction, resultFrame, utcMinute, verified } from "../lib/data";
import { reviewSegments as seg, scenes } from "../timeline";
import type { FootageClipName } from "../timeline";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const t = verified.thresholds;
const c = verified.cases;
const p1 = verified.policy1;
const cue = (seconds: number, segmentFrom: number, fps: number) => Math.round(seconds * fps) - scenes.review.from - segmentFrom;
const recorded = (clip: FootageClipName) => {
  const info = footage(clip);
  return info ? `recorded ${utcMinute(info.recordedAtUtc)}` : "footage missing";
};
const delta = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;

// 95–135 s: a borderline REVIEW, the missed defect 048 and why, and the identity case 043 across policies.
export const ReviewScene: React.FC<{ available: (clip: FootageClipName) => boolean }> = ({ available }) => {
  const { fps } = useVideoConfig();
  const reviewAt = resultFrame("local-03-review", 0, seg.review.trim, fps);
  const missedAt = resultFrame("local-04-missed-048", 0, seg.missed048.trim, fps);
  const identityAt = resultFrame("local-05-identity-043", 0, seg.identity043.trim, fps);
  const review = footage("local-03-review")?.results[0]?.anomalyScore ?? 0;
  const missed = footage("local-04-missed-048")?.results[0]?.anomalyScore ?? 0;
  return (
    <AbsoluteFill>
      <Sequence from={seg.review.from} durationInFrames={seg.review.duration} name="REVIEW">
        <Beat kicker="Local demonstration" title="Too close to call → REVIEW" note={recorded("local-03-review")}>
          <FootageClip clip="local-03-review" available={available("local-03-review")} trim={seg.review.trim} box={clipBox} keys={zoomKeys(reviewAt)} />
          <ClipPanel
            clip="local-03-review"
            trim={seg.review.trim}
            fps={fps}
            zoom={{ min: 2.1, max: 2.22, ticks: [t.passBelow] }}
            note={<Hand fontSize={56} color={colors.amber}>{`${delta(review - t.passBelow)} over the line`}</Hand>}
            noteAt={reviewAt + 96}
          />
        </Beat>
      </Sequence>

      <Sequence from={seg.missed048.from} durationInFrames={seg.missed048.duration} name="Missed 048">
        <Beat kicker="Known failure" title="A missing pin → PASS" note={`Anomaly/048 · ${recorded("local-04-missed-048")}`}>
          <FootageClip clip="local-04-missed-048" available={available("local-04-missed-048")} trim={seg.missed048.trim} box={clipBox} keys={zoomKeys(missedAt)} />
          <ClipPanel
            clip="local-04-missed-048"
            trim={seg.missed048.trim}
            fps={fps}
            zoom={{ min: 2.08, max: 2.2, ticks: [t.passBelow] }}
            note={<Hand fontSize={56} color={colors.red}>{`${delta(missed - t.passBelow)} under the line`}</Hand>}
            noteAt={missedAt + 96}
          />
          <div style={{ position: "absolute", right: layout.margin, top: layout.titleTop + 2 }}>
            <Stamp text="MISSED DEFECT" at={missedAt + 110} />
          </div>
        </Beat>
      </Sequence>

      <Sequence from={seg.why048.from} durationInFrames={seg.why048.duration} name="Why 048">
        <Why048 />
      </Sequence>

      <Sequence from={seg.identity043.from} durationInFrames={seg.identity043.duration} name="Identity 043">
        <Beat kicker="Edge case" title="Not sure it is the part → REVIEW" note={`Anomaly/043 · ${recorded("local-05-identity-043")}`}>
          <FootageClip clip="local-05-identity-043" available={available("local-05-identity-043")} trim={seg.identity043.trim} box={clipBox} keys={zoomKeys(identityAt)} />
          <ClipPanel clip="local-05-identity-043" trim={seg.identity043.trim} fps={fps} ruler="identity" note={<Hand fontSize={52} color={colors.amber}>both transducers missing</Hand>} noteAt={identityAt + 60} />
        </Beat>
      </Sequence>

      <Sequence from={seg.history043.from} durationInFrames={seg.history043.duration} name="043 history">
        <History043 />
      </Sequence>
    </AbsoluteFill>
  );
};

const Why048: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (s: number) => cue(s, seg.why048.from, fps);
  const s048 = stages.images["Anomaly/048"];
  const mapBox = { left: 380, top: layout.contentTop, size: 600 };
  const k = mapBox.size / s048.inputSize;
  const [px, py] = s048.mapPeak;
  const [gx, gy, gw, gh] = s048.groundTruthBox;
  const peak = { x: mapBox.left + px * k, y: mapBox.top + py * k };
  const gt = { x: mapBox.left + (gx + gw / 2) * k, y: mapBox.top + (gy + gh) * k };
  const first = Math.max(24, f(111.6));
  return (
    <Beat kicker="Why it missed" title="It looks in the wrong place" note="real anomaly map · white outline = VisA ground truth">
      <Pop at={4} style={{ position: "absolute", left: mapBox.left, top: mapBox.top }}>
        <Img src={staticFile(s048.mapWithGroundTruth)} style={{ width: mapBox.size, height: mapBox.size, border: `2px solid ${colors.line}`, borderRadius: 6 }} />
      </Pop>
      <Draw d={`M 1180 ${layout.contentTop + 90} C 1120 ${layout.contentTop + 80}, ${peak.x + 90} ${peak.y - 50}, ${peak.x + 22} ${peak.y - 8}`} at={first} color={colors.cyanDeep} head width={5} />
      <Pop at={first} style={{ position: "absolute", left: 1190, top: layout.contentTop + 40 }}>
        <Hand fontSize={60} color={colors.cyanDeep}>
          hottest spot
        </Hand>
        <div style={{ fontFamily: fonts.mono, fontSize: size.body, color: colors.ink }}>{s048.mapMax.toFixed(3)}</div>
      </Pop>
      <Draw d={`M 1180 ${layout.contentTop + 420} C 1100 ${layout.contentTop + 440}, ${gt.x + 100} ${gt.y + 60}, ${gt.x + 14} ${gt.y + 8}`} at={first + 40} color={colors.red} head width={5} />
      <Pop at={first + 40} style={{ position: "absolute", left: 1190, top: layout.contentTop + 370 }}>
        <Hand fontSize={60} color={colors.red}>
          missing pin
        </Hand>
        <div style={{ fontFamily: fonts.mono, fontSize: size.body, color: colors.ink }}>{s048.maxInsideGroundTruth?.toFixed(3)}</div>
      </Pop>
    </Beat>
  );
};

const History043: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const f = (s: number) => cue(s, seg.history043.from, fps);
  const d = c.anomaly043.identityDistance;
  const strike = interpolate(frame, [f(130.4), f(130.8)], [0, 100], clamp);
  return (
    <Beat kicker="Same image, two policies" title={`043 stays in all ${verified.split.testTotal}`}>
      <Ruler
        left={layout.margin}
        top={layout.contentTop + 60}
        width={1728}
        min={0}
        max={0.26}
        zones={identityZones}
        ticks={[t.identityRecognizedMax, t.policy1IdentitySingleThreshold, t.identityNoPartMin]}
        tickDecimals={3}
        at={0}
        marker={{ value: d, at: 6, label: d.toFixed(3), color: colors.ink }}
        lines={[{ value: t.policy1IdentitySingleThreshold, label: "old single line", at: f(128.2), color: colors.muted, side: "left", labelTop: 168 }]}
      />
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 330, display: "flex", alignItems: "center", gap: 40, fontFamily: fonts.sans }}>
        <Pop at={f(128.4)} style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
          <Hand fontSize={46} color={colors.muted}>{p1.generatedAt.slice(0, 10)}</Hand>
          <Pill decision={p1.anomaly043?.decision ?? "NO_PART"} large />
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 6, width: `${strike}%`, backgroundColor: colors.red }} />
        </Pop>
        <Pop at={f(130.9)}>
          <Hand fontSize={64}>→</Hand>
        </Pop>
        <Pop at={f(131.0)} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Hand fontSize={46} color={colors.amber}>
            now
          </Hand>
          <Pill decision={c.anomaly043.decision} large />
        </Pop>
      </div>
      <Pop at={f(132.6)} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 470, fontFamily: fonts.mono, fontSize: size.body, color: colors.ink }}>
        {`REVIEW ${fraction(p1.review)} → ${fraction(verified.metrics.review.motionqa)}`}
      </Pop>
    </Beat>
  );
};
