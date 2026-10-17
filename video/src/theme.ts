// Visual constants. Explainer style on grid paper (after the user's reference video); navy #0B1730 stays the ink
// colour and cyan #43D9E8 the OpenCV accent. Font sizes below 32 px (captions: 30 px) fail scripts/verify-assets.mjs.

export const colors = {
  paper: "#F6F2E8",
  gridMinor: "rgba(11, 23, 48, 0.055)",
  gridMajor: "rgba(11, 23, 48, 0.10)",
  ink: "#0B1730",
  muted: "#5A6478",
  faint: "#9AA3B2",
  card: "#FFFFFF",
  line: "#1F2A3D",
  blue: "#2B4C9B",
  cyan: "#43D9E8",
  cyanDeep: "#0F8796",
  cyanWash: "#DDF6F9",
  amber: "#C98200",
  amberWash: "#FFE7AE",
  red: "#D43F3F",
  redWash: "#FBDADA",
  green: "#2E9E5B",
  greenWash: "#D5F0DF",
  aws: "#D9730D",
  awsWash: "#FCE6D2",
  marker: "#FFE36E",
};

export const fonts = {
  sans: "Inter, sans-serif",
  mono: "JetBrains Mono, monospace",
  hand: "Caveat, cursive",
};

export const size = {
  display: 120,
  title: 60,
  subtitle: 44,
  hand: 46,
  body: 34,
  small: 32,
  caption: 38,
};

// 96 px safe margin on every side. Header: kicker, title, figure label. The bottom band is reserved for captions.
export const layout = {
  width: 1920,
  height: 1080,
  margin: 96,
  kickerTop: 96,
  titleTop: 146,
  figTop: 226,
  contentTop: 282,
  contentBottom: 856,
  captionBottom: 984,
};

export const contentHeight = layout.contentBottom - layout.contentTop;
export const contentWidth = layout.width - 2 * layout.margin;

export const decisionColor = (decision: string): string => {
  switch (decision) {
    case "PASS":
      return colors.green;
    case "FAIL":
    case "ERROR":
      return colors.red;
    case "REVIEW":
      return colors.amber;
    default:
      return colors.muted;
  }
};

export const decisionWash = (decision: string): string => {
  switch (decision) {
    case "PASS":
      return colors.greenWash;
    case "FAIL":
    case "ERROR":
      return colors.redWash;
    case "REVIEW":
      return colors.amberWash;
    default:
      return "#E6E8EE";
  }
};
