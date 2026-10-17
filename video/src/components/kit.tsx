import type React from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { colors, decisionColor, decisionWash, fonts, layout, size } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Grid paper, drawn once per frame with CSS gradients (static, no animation).
export const Paper: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.paper,
      backgroundImage: [
        `linear-gradient(${colors.gridMajor} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${colors.gridMajor} 1px, transparent 1px)`,
        `linear-gradient(${colors.gridMinor} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${colors.gridMinor} 1px, transparent 1px)`,
      ].join(", "),
      backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
    }}
  />
);

export const Hand: React.FC<{ children: React.ReactNode; color?: string; fontSize?: number; style?: React.CSSProperties }> = ({ children, color = colors.blue, fontSize = size.hand, style }) => (
  <span style={{ fontFamily: fonts.hand, fontWeight: 600, fontSize, color, lineHeight: 1.1, ...style }}>{children}</span>
);

// Kicker in handwriting, bold title that darkens in, then an optional "Fig. n" line.
export const Header: React.FC<{ kicker: string; title: string; fig?: { n: number | string; text: string }; figAt?: number }> = ({ kicker, title, fig, figAt = 10 }) => {
  const frame = useCurrentFrame();
  const write = interpolate(frame, [0, 14], [100, 0], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: layout.margin, top: layout.kickerTop - 6, clipPath: `inset(0 ${write}% 0 0)` }}>
        <Hand>{`${kicker} →`}</Hand>
      </div>
      <div
        style={{
          position: "absolute",
          left: layout.margin,
          right: layout.margin,
          top: layout.titleTop,
          fontFamily: fonts.sans,
          fontSize: size.title,
          fontWeight: 800,
          letterSpacing: -0.8,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: interpolateColors(frame, [2, 16], [colors.faint, colors.ink]),
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      >
        {title}
      </div>
      {fig ? (
        <div style={{ position: "absolute", left: layout.margin, right: layout.margin, top: layout.figTop, display: "flex", alignItems: "baseline", gap: 14, whiteSpace: "nowrap", opacity: interpolate(frame, [figAt, figAt + 10], [0, 1], clamp) }}>
          <Hand fontSize={44}>{`Fig. ${fig.n}`}</Hand>
          <span style={{ fontFamily: fonts.sans, fontSize: size.small, color: colors.muted }}>{fig.text}</span>
        </div>
      ) : null}
    </>
  );
};

export const Beat: React.FC<{ kicker: string; title: string; fig?: { n: number | string; text: string }; figAt?: number; children: React.ReactNode }> = ({ kicker, title, fig, figAt, children }) => (
  <AbsoluteFill>
    <Header kicker={kicker} title={title} fig={fig} figAt={figAt} />
    {children}
  </AbsoluteFill>
);

// Fades and lifts a block in at a frame; it stays once shown.
export const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; from?: string }> = ({ at, children, style, from = "0px 18px" }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [at, at + 10], [0, 1], clamp),
        translate: interpolate(frame, [at, at + 12], [from, "0px 0px"], { ...clamp, easing: Easing.out(Easing.cubic) }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Yellow highlighter that sweeps in behind the text.
export const Mark: React.FC<{ at: number; children: React.ReactNode; color?: string }> = ({ at, children, color = colors.marker }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [at, at + 12], [0, 100], { ...clamp, easing: Easing.out(Easing.quad) });
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${sweep}% 100%`,
        padding: "0 6px",
        borderRadius: 4,
        boxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
};

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; accent?: string }> = ({ children, style, accent }) => (
  <div
    style={{
      backgroundColor: colors.card,
      border: `2px solid ${colors.line}`,
      borderTop: accent ? `10px solid ${accent}` : `2px solid ${colors.line}`,
      borderRadius: 6,
      boxShadow: "8px 8px 0 rgba(11, 23, 48, 0.08)",
      padding: "22px 26px",
      boxSizing: "border-box",
      fontFamily: fonts.sans,
      color: colors.ink,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{ decision: string; large?: boolean; style?: React.CSSProperties }> = ({ decision, large, style }) => (
  <span
    style={{
      display: "inline-block",
      padding: large ? "6px 22px" : "2px 14px",
      borderRadius: 8,
      backgroundColor: decisionWash(decision),
      border: `3px solid ${decisionColor(decision)}`,
      color: decisionColor(decision),
      fontFamily: fonts.sans,
      fontWeight: 800,
      fontSize: large ? 52 : size.body,
      letterSpacing: 1,
      ...style,
    }}
  >
    {decision}
  </span>
);

// A line that draws itself. Coordinates are absolute (1920 x 1080 canvas).
export const Draw: React.FC<{ d: string; at: number; duration?: number; color?: string; width?: number; dashed?: boolean; head?: boolean }> = ({ d, at, duration = 16, color = colors.blue, width = 4, dashed, head }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [at, at + duration], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const id = `h${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={layout.width} height={layout.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <marker id={id} markerUnits="userSpaceOnUse" markerWidth="22" markerHeight="22" refX="18" refY="11" orient="auto">
          <path d="M2,3 L20,11 L2,19" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {dashed ? (
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray="12 10" strokeLinecap="round" opacity={progress > 0 ? 1 : 0} style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }} />
      ) : (
        <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - progress} markerEnd={head && progress > 0.97 ? `url(#${id})` : undefined} />
      )}
    </svg>
  );
};

// Dimension bracket with a label, like a measurement on a drawing.
export const Bracket: React.FC<{ x: number; y1: number; y2: number; label: string; at: number; color?: string; side?: "left" | "right" }> = ({ x, y1, y2, label, at, color = colors.blue, side = "right" }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10], [0, 1], clamp);
  const dir = side === "right" ? 1 : -1;
  return (
    <div style={{ opacity: o }}>
      <svg width={layout.width} height={layout.height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <path d={`M ${x - 10 * dir} ${y1} L ${x} ${y1} L ${x} ${y2} L ${x - 10 * dir} ${y2}`} fill="none" stroke={color} strokeWidth={3} />
      </svg>
      <div style={{ position: "absolute", left: side === "right" ? x + 12 : undefined, right: side === "left" ? layout.width - x + 12 : undefined, top: (y1 + y2) / 2 - 28, whiteSpace: "nowrap" }}>
        <Hand color={color}>{label}</Hand>
      </div>
    </div>
  );
};

export const Stamp: React.FC<{ text: string; at: number; color?: string; style?: React.CSSProperties }> = ({ text, at, color = colors.red, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "inline-block",
        border: `5px solid ${color}`,
        color,
        fontFamily: fonts.sans,
        fontWeight: 800,
        fontSize: 40,
        letterSpacing: 2,
        padding: "6px 20px",
        borderRadius: 8,
        rotate: "-4deg",
        opacity: interpolate(frame, [at, at + 6], [0, 1], clamp),
        scale: interpolate(frame, [at, at + 8], [1.4, 1], { ...clamp, easing: Easing.out(Easing.back(2)) }),
        backgroundColor: "rgba(255,255,255,0.75)",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export const CountUp: React.FC<{ to: number; at: number; duration?: number; decimals?: number; suffix?: string }> = ({ to, at, duration = 24, decimals = 0, suffix = "" }) => {
  const frame = useCurrentFrame();
  const value = interpolate(frame, [at, at + duration], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
};

type Zone = { from: number; to: number; decision: string; label?: string };
type RefLine = { value: number; label: string; at: number; color?: string; side?: "left" | "right"; labelTop?: number };

// Number line with PASS / REVIEW / FAIL zones and a marker that slides to a value. The axis can zoom in.
export const Ruler: React.FC<{
  left: number;
  top: number;
  width: number;
  min: number;
  max: number;
  zones: Zone[];
  ticks: number[];
  tickDecimals?: number;
  at: number;
  marker?: { value: number; at: number; label: string; color: string };
  lines?: RefLine[];
  zoom?: { min: number; max: number; at: number; ticks: number[] };
}> = ({ left, top, width, min, max, zones, ticks, tickDecimals = 2, at, marker, lines = [], zoom }) => {
  const frame = useCurrentFrame();
  const zoomProgress = zoom ? interpolate(frame, [zoom.at, zoom.at + 30], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 0;
  const lo = zoom ? min + (zoom.min - min) * zoomProgress : min;
  const hi = zoom ? max + (zoom.max - max) * zoomProgress : max;
  const x = (v: number) => ((v - lo) / (hi - lo)) * width;
  const appear = interpolate(frame, [at, at + 10], [0, 1], clamp);
  const markerValue = marker ? interpolate(frame, [marker.at, marker.at + 26], [lo, marker.value], { ...clamp, easing: Easing.out(Easing.back(1.2)) }) : 0;
  const shownTicks = zoomProgress > 0.5 && zoom ? zoom.ticks : ticks;
  const tickDigits = zoomProgress > 0.5 ? 3 : tickDecimals;
  const barTop = 64;
  const barH = 40;
  return (
    <div style={{ position: "absolute", left, top, width, height: 190, opacity: appear }}>
      <svg width={width} height={190} style={{ overflow: "hidden" }}>
        {zones.map((zone) => (
          <rect key={zone.decision + zone.from} x={Math.max(0, x(zone.from))} y={barTop} width={Math.max(0, Math.min(width, x(zone.to)) - Math.max(0, x(zone.from)))} height={barH} fill={decisionWash(zone.decision)} stroke={decisionColor(zone.decision)} strokeWidth={2} />
        ))}
        <line x1={0} y1={barTop + barH} x2={width} y2={barTop + barH} stroke={colors.line} strokeWidth={3} />
        {shownTicks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} y1={barTop + barH} x2={x(tick)} y2={barTop + barH + 12} stroke={colors.line} strokeWidth={3} />
            <text x={x(tick)} y={barTop + barH + 48} fontSize={32} fontFamily={fonts.mono} fill={colors.muted} textAnchor="middle">
              {tick.toFixed(tickDigits)}
            </text>
          </g>
        ))}
        {zones
          .filter((zone) => zone.label)
          .map((zone) => {
            const cx = (Math.max(0, x(zone.from)) + Math.min(width, x(zone.to))) / 2;
            return cx > 30 && cx < width - 30 ? (
              <text key={`l${zone.decision}`} x={cx} y={barTop + barH / 2 + 11} fontSize={32} fontWeight={800} fontFamily={fonts.sans} fill={decisionColor(zone.decision)} textAnchor="middle">
                {zone.label}
              </text>
            ) : null;
          })}
        {lines.map((line) => (
          <g key={line.label} opacity={interpolate(frame, [line.at, line.at + 8], [0, 1], clamp)}>
            <line x1={x(line.value)} y1={barTop - 18} x2={x(line.value)} y2={barTop + barH + 8} stroke={line.color ?? colors.ink} strokeWidth={4} strokeDasharray="10 8" />
          </g>
        ))}
        {marker && frame >= marker.at ? (
          <g>
            <line x1={x(markerValue)} y1={barTop - 6} x2={x(markerValue)} y2={barTop + barH + 6} stroke={marker.color} strokeWidth={6} />
            <path d={`M ${x(markerValue) - 14} ${barTop - 26} L ${x(markerValue) + 14} ${barTop - 26} L ${x(markerValue)} ${barTop - 6} Z`} fill={marker.color} />
          </g>
        ) : null}
      </svg>
      {marker && frame >= marker.at ? (
        <div style={{ position: "absolute", left: Math.min(width - 160, Math.max(0, x(markerValue) - 80)), top: -24, width: 160, textAlign: "center", fontFamily: fonts.mono, fontWeight: 600, fontSize: 36, color: marker.color }}>{marker.label}</div>
      ) : null}
      {lines.map((line) => (
        <div key={`t${line.label}`} style={{ position: "absolute", left: line.side === "left" ? undefined : x(line.value) + 10, right: line.side === "left" ? width - x(line.value) + 10 : undefined, top: line.labelTop ?? -30, opacity: interpolate(frame, [line.at, line.at + 8], [0, 1], clamp), whiteSpace: "nowrap" }}>
          <Hand color={line.color ?? colors.ink} fontSize={40}>
            {line.label}
          </Hand>
        </div>
      ))}
    </div>
  );
};
