import type React from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Beat, Pill } from "../components/kit";
import stages from "../data/pipeline-stages.json";
import { cueIn } from "../lib/data";
import { colors, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// One real photo (Anomaly/000) through the seven pipeline stages. Images are real outputs of the backend code.
export const Dissect: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = cueIn("app", "dissect", fps);
  const s = stages.images["Anomaly/000"];
  const steps = [
    { label: "Decode", image: s.input, call: "cv.imdecode", at: 0 },
    { label: "Find the board", image: s.mask, call: "cv.findContours", at: f(75.0) },
    { label: "Check focus", image: s.edges, call: "cv.Sobel", at: f(77.6) },
    { label: `Crop ${s.inputSize} × ${s.inputSize}`, image: s.crop, call: "cv.resize", at: f(80.6) },
    { label: "DNN features", image: s.features, call: "cv.dnn · ENGINE_NEW", at: f(83.4) },
    { label: "Anomaly map", image: s.anomalyMap, call: "kNN vs normal patches", at: f(87.0) },
    { label: "Evidence", image: s.overlay, call: "cv.applyColorMap", at: f(90.6) },
  ];
  const current = Math.max(0, steps.filter((step) => frame >= step.at).length - 1);
  const box = { left: layout.margin, top: layout.contentTop, width: 1000, height: 590 };
  return (
    <Beat kicker="Under the hood" title="One photo, seven OpenCV 5 steps" note={`real outputs of the backend · OpenCV ${stages.opencv}`}>
      <div style={{ position: "absolute", ...box, backgroundColor: "#111", border: `2px solid ${colors.line}`, borderRadius: 8, overflow: "hidden", boxShadow: "8px 8px 0 rgba(11,23,48,0.08)" }}>
        {steps.map((step, i) => {
          const next = steps[i + 1]?.at ?? 99999;
          const opacity = interpolate(frame, [step.at, step.at + 8, next, next + 8], [0, 1, 1, 0], clamp);
          return opacity > 0 ? (
            <Img key={step.label} src={staticFile(step.image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity }} />
          ) : null;
        })}
      </div>
      <div style={{ position: "absolute", left: box.left + 20, top: box.top + box.height - 70, display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ fontFamily: fonts.mono, fontSize: size.small, color: "#fff", backgroundColor: "rgba(11,23,48,0.85)", padding: "4px 14px", borderRadius: 6 }}>{steps[current].call}</span>
        {current === steps.length - 1 ? <Pill decision={s.decision} /> : null}
      </div>
      <div style={{ position: "absolute", left: 1160, top: layout.contentTop + 10, display: "flex", flexDirection: "column", gap: 14, fontFamily: fonts.sans }}>
        {steps.map((step, i) => {
          const active = i === current && frame >= step.at;
          const done = frame >= step.at;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 22, opacity: done ? 1 : 0.35 }}>
              <span style={{ width: 54, height: 54, borderRadius: 27, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.cyan : "transparent", border: `3px solid ${active ? colors.cyanDeep : colors.line}`, fontWeight: 800, fontSize: size.body, color: colors.ink }}>{i + 1}</span>
              <span style={{ fontSize: active ? 44 : size.body, fontWeight: active ? 800 : 600, color: colors.ink }}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};
