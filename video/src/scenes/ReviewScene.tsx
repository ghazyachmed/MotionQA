import type React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ClipPanel, clipBox, identityZones, zoomKeys } from "../components/ClipPanel";
import { FootageClip } from "../components/FootageClip";
import { Beat, Card, Draw, Hand, Mark, Pill, Pop, Ruler, Stamp } from "../components/kit";
import stages from "../data/pipeline-stages.json";
import { footage, fraction, resultFrame, score3, utcMinute, verified } from "../lib/data";
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
  return info ? utcMinute(info.recordedAtUtc) : "footage missing";
};

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
        <Beat kicker="Local demonstration" title="Borderline score: REVIEW" fig={{ n: 10, text: `recorded ${recorded("local-03-review")} · Normal/0027, a good board` }}>
          <FootageClip clip="local-03-review" available={available("local-03-review")} trim={seg.review.trim} box={clipBox} keys={zoomKeys(reviewAt)} />
          <ClipPanel
            clip="local-03-review"
            trim={seg.review.trim}
            fps={fps}
            zoom={{ min: 2.1, max: 2.22, ticks: [t.passBelow] }}
            note={<Hand fontSize={42}>{`zoomed in: +${(review - t.passBelow).toFixed(3)} over the PASS line → a person decides`}</Hand>}
            noteAt={reviewAt + 96}
          />
        </Beat>
      </Sequence>

      <Sequence from={seg.missed048.from} durationInFrames={seg.missed048.duration} name="Missed 048">
        <Beat kicker="Known failure" title="Anomaly/048 is defective, and it passes" fig={{ n: 11, text: `recorded ${recorded("local-04-missed-048")} · VisA label: missing GND header pin` }}>
          <FootageClip clip="local-04-missed-048" available={available("local-04-missed-048")} trim={seg.missed048.trim} box={clipBox} keys={zoomKeys(missedAt)} />
          <ClipPanel
            clip="local-04-missed-048"
            trim={seg.missed048.trim}
            fps={fps}
            zoom={{ min: 2.08, max: 2.2, ticks: [t.passBelow] }}
            note={<Hand fontSize={42} color={colors.red}>{`${(missed - t.passBelow).toFixed(3)} under the line → PASS on a defective board`}</Hand>}
            noteAt={missedAt + 96}
          />
          <div style={{ position: "absolute", left: 1460, top: layout.titleTop - 4 }}>
            <Stamp text="MISSED DEFECT" at={missedAt + 130} />
          </div>
        </Beat>
      </Sequence>

      <Sequence from={seg.why048.from} durationInFrames={seg.why048.duration} name="Why 048">
        <Why048 />
      </Sequence>

      <Sequence from={seg.identity043.from} durationInFrames={seg.identity043.duration} name="Identity 043">
        <Beat kicker="Edge case" title="Anomaly/043: is this even the part?" fig={{ n: 13, text: `recorded ${recorded("local-05-identity-043")} · both ultrasonic transducers missing` }}>
          <FootageClip clip="local-05-identity-043" available={available("local-05-identity-043")} trim={seg.identity043.trim} box={clipBox} keys={zoomKeys(identityAt)} />
          <ClipPanel
            clip="local-05-identity-043"
            trim={seg.identity043.trim}
            fps={fps}
            ruler="identity"
            note={<Hand fontSize={42} color={colors.amber}>{`${c.anomaly043.identityDistance.toFixed(3)} sits in the unvalidated gap → REVIEW`}</Hand>}
            noteAt={identityAt + 60}
          />
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
  const mapBox = { left: 560, top: layout.contentTop, size: 560 };
  const k = mapBox.size / s048.inputSize;
  const [px, py] = s048.mapPeak;
  const [gx, gy, gw, gh] = s048.groundTruthBox;
  const peak = { x: mapBox.left + px * k, y: mapBox.top + py * k };
  const gt = { x: mapBox.left + (gx + gw / 2) * k, y: mapBox.top + (gy + gh) * k };
  return (
    <Beat kicker="Dissecting a miss" title="Why 048 slips through" fig={{ n: 12, text: "left: VisA ground truth (dataset label) · right: real anomaly map, white outline = ground truth" }}>
      <Pop at={4} style={{ position: "absolute", left: layout.margin, top: layout.contentTop }}>
        <Img src={staticFile("assets/dataset/anomaly-048-groundtruth-crop.jpg")} style={{ width: 420, height: 560, objectFit: "cover", border: `2px solid ${colors.line}`, borderRadius: 6 }} />
      </Pop>
      <Pop at={14} style={{ position: "absolute", left: mapBox.left, top: mapBox.top }}>
        <Img src={staticFile(s048.mapWithGroundTruth)} style={{ width: mapBox.size, height: mapBox.size, border: `2px solid ${colors.line}`, borderRadius: 6 }} />
      </Pop>
      <Draw d={`M 1250 ${layout.contentTop + 70} C 1190 ${layout.contentTop + 60}, ${peak.x + 80} ${peak.y - 40}, ${peak.x + 22} ${peak.y - 8}`} at={Math.max(24, f(111.6))} color={colors.cyanDeep} head />
      <Pop at={Math.max(24, f(111.6))} style={{ position: "absolute", left: 1260, top: layout.contentTop + 30, width: 564 }}>
        <Hand fontSize={46} color={colors.cyanDeep}>{`hottest spot: ${s048.mapMax.toFixed(3)}`}</Hand>
        <div style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.ink }}>on the transducer mesh, not the defect</div>
      </Pop>
      <Draw d={`M 1250 ${layout.contentTop + 300} C 1190 ${layout.contentTop + 320}, ${gt.x + 90} ${gt.y + 40}, ${gt.x + 14} ${gt.y + 6}`} at={f(113.6)} color={colors.red} head />
      <Pop at={f(113.6)} style={{ position: "absolute", left: 1260, top: layout.contentTop + 260, width: 564 }}>
        <Hand fontSize={46} color={colors.red}>{`missing pin: max ${s048.maxInsideGroundTruth?.toFixed(3)}`}</Hand>
        <div style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.ink }}>{`both under the PASS line ${score3(t.passBelow)}`}</div>
      </Pop>
      <Pop at={f(116.9)} style={{ position: "absolute", left: 1260, top: layout.contentTop + 430, width: 564, fontFamily: fonts.sans, fontSize: size.small, color: colors.ink, lineHeight: 1.35 }}>
        Each patch is compared with normal patches, <Mark at={f(117.3)}>ignoring position</Mark>. Plain fabric where a pin should be looks normal.
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
    <Beat kicker="Same image, two policies" title="043: from NO_PART to REVIEW" fig={{ n: 14, text: "identity distance of Anomaly/043 against the policy thresholds · evaluation/results/history/" }}>
      <Ruler
        left={layout.margin}
        top={layout.contentTop + 40}
        width={1728}
        min={0}
        max={0.26}
        zones={identityZones}
        ticks={[t.identityRecognizedMax, t.policy1IdentitySingleThreshold, t.identityNoPartMin]}
        tickDecimals={3}
        at={0}
        marker={{ value: d, at: 6, label: d.toFixed(3), color: colors.ink }}
        lines={[{ value: t.policy1IdentitySingleThreshold, label: "policy 1: one threshold", at: f(128.2), color: colors.muted, side: "left", labelTop: 168 }]}
      />
      <div style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 270, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, width: 1728 }}>
        <Pop at={f(128.4)}>
          <Card accent={colors.faint}>
            <Hand fontSize={42} color={colors.muted}>{`policy 1 · run of ${p1.generatedAt.slice(0, 10)}`}</Hand>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 18, position: "relative" }}>
              <Pill decision={p1.anomaly043?.decision ?? "NO_PART"} large />
              <span style={{ fontSize: size.small }}>above the single threshold</span>
              <div style={{ position: "absolute", left: 0, top: "50%", height: 5, width: `${strike}%`, backgroundColor: colors.red }} />
            </div>
            <div style={{ marginTop: 12, fontSize: size.small, fontFamily: fonts.mono }}>{`REVIEW ${fraction(p1.review)} · NO_PART ${fraction(p1.noPart)}`}</div>
          </Card>
        </Pop>
        <Pop at={f(131.0)}>
          <Card accent={colors.amber}>
            <Hand fontSize={42} color={colors.amber}>{`policy 2 · current (${verified.evaluation.generatedAt.slice(0, 10)})`}</Hand>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 18 }}>
              <Pill decision={c.anomaly043.decision} large />
              <span style={{ fontSize: size.small }}>no validated evidence either way</span>
            </div>
            <div style={{ marginTop: 12, fontSize: size.small, fontFamily: fonts.mono }}>{`REVIEW ${fraction(verified.metrics.review.motionqa)} · NO_PART ${fraction(verified.metrics.noPart.motionqa)}`}</div>
          </Card>
        </Pop>
      </div>
      <Pop at={f(132.6)} style={{ position: "absolute", left: layout.margin, top: layout.contentTop + 520 }}>
        <Hand fontSize={46}>denominator stays 153 in both runs</Hand>
      </Pop>
    </Beat>
  );
};
