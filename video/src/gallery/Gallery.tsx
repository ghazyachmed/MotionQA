import type React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { Draw, Hand, Header, Paper, Pill, Ruler } from "../components/kit";
import { scoreZones } from "../components/ClipPanel";
import stages from "../data/pipeline-stages.json";
import "../fonts";
import { verified } from "../lib/data";
import { Flow } from "../scenes/ArchitectureScene";
import { colors, fonts, size } from "../theme";

// Still images for the Devpost gallery, 1920 x 1280 (3:2). Same data and components as the video.

const Footer: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", left: 96, right: 96, bottom: 70, fontFamily: fonts.sans, fontSize: size.small, color: colors.muted }}>{text}</div>
);

// Architecture: the request-flow diagram, detailed labels, frozen after the decision has returned to the browser.
export const GalleryArchitecture: React.FC = () => (
  <AbsoluteFill>
    <Paper />
    <AbsoluteFill style={{ top: 60 }}>
      <Sequence from={-504} layout="none">
        <Flow kicker="Architecture" title="OpenCV 5 inference on AWS" detailed />
      </Sequence>
    </AbsoluteFill>
    <Footer text="Deployed 2026-10-16 in us-east-1 with one CloudFormation stack · orange = AWS service, cyan = OpenCV 5 · RTSP, MES and OPC-UA are not deployed" />
  </AbsoluteFill>
);

// The documented miss: VisA ground truth, the real anomaly map, and the score against the PASS line.
export const GalleryMissedPin: React.FC = () => {
  const s048 = stages.images["Anomaly/048"];
  const t = verified.thresholds;
  const map = { left: 620, top: 300, size: 640 };
  const k = map.size / s048.inputSize;
  const [px, py] = s048.mapPeak;
  const [gx, gy, gw, gh] = s048.groundTruthBox;
  const peak = { x: map.left + px * k, y: map.top + py * k };
  const gt = { x: map.left + (gx + gw / 2) * k, y: map.top + (gy + gh) * k };
  return (
    <AbsoluteFill>
      <Paper />
      <Sequence from={-300} layout="none">
        <Header kicker="Known failure" title="A missing header pin received PASS" note="VisA pcb1 test image Anomaly/048" />
        <div style={{ position: "absolute", left: 96, top: 300 }}>
          <Img src={staticFile("assets/dataset/anomaly-048-groundtruth-crop.jpg")} style={{ width: 480, height: 640, objectFit: "cover", border: `2px solid ${colors.line}`, borderRadius: 6 }} />
          <div style={{ marginTop: 10 }}>
            <Hand fontSize={42} color={colors.amber}>
              missing GND pin
            </Hand>
            <div style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.muted }}>VisA ground truth (dataset label)</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: map.left, top: map.top }}>
          <Img src={staticFile(s048.mapWithGroundTruth)} style={{ width: map.size, height: map.size, border: `2px solid ${colors.line}`, borderRadius: 6 }} />
          <div style={{ marginTop: 10 }}>
            <Hand fontSize={42} color={colors.cyanDeep}>
              MotionQA anomaly map
            </Hand>
            <div style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.muted }}>real model output · white outline = ground truth</div>
          </div>
        </div>
        <Draw d={`M 1350 380 C 1300 370, ${peak.x + 90} ${peak.y - 50}, ${peak.x + 22} ${peak.y - 8}`} at={0} color={colors.cyanDeep} head width={5} />
        <div style={{ position: "absolute", left: 1360, top: 330 }}>
          <Hand fontSize={52} color={colors.cyanDeep}>
            hottest spot
          </Hand>
          <div style={{ fontFamily: fonts.mono, fontSize: size.body, color: colors.ink }}>{s048.mapMax.toFixed(3)}, on the transducer</div>
        </div>
        <Draw d={`M 1350 600 C 1280 620, ${gt.x + 100} ${gt.y + 60}, ${gt.x + 14} ${gt.y + 8}`} at={0} color={colors.red} head width={5} />
        <div style={{ position: "absolute", left: 1360, top: 560 }}>
          <Hand fontSize={52} color={colors.red}>
            missing pin
          </Hand>
          <div style={{ fontFamily: fonts.mono, fontSize: size.body, color: colors.ink }}>{`${s048.maxInsideGroundTruth?.toFixed(3)} inside the defect`}</div>
        </div>
        <div style={{ position: "absolute", left: 1360, top: 760 }}>
          <Pill decision={s048.decision} large />
        </div>
        <Ruler
          left={1360}
          top={890}
          width={464}
          min={2.08}
          max={2.2}
          zones={scoreZones}
          ticks={[t.passBelow]}
          tickDecimals={3}
          at={0}
          marker={{ value: s048.anomalyScore, at: 0, label: s048.anomalyScore.toFixed(3), color: colors.ink }}
        />
      </Sequence>
      <Footer text="Position-independent patch matching sees plain fabric where the pin should be as normal. Unfixed, guarded by an expected-failure test (docs/FAILURE_ANALYSIS.md)." />
    </AbsoluteFill>
  );
};
