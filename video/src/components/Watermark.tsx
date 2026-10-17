import type React from "react";
import { colors, fonts, size } from "../theme";

// Draft marker in the strip above the safe area, clear of every result. Final renders never show it.
export const Watermark: React.FC<{ reasons: string[] }> = ({ reasons }) => (
  <div style={{ position: "absolute", top: 22, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
    <div
      style={{
        fontFamily: fonts.sans,
        fontSize: size.small,
        fontWeight: 800,
        letterSpacing: 1.5,
        color: colors.amber,
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        border: `2px solid ${colors.amber}`,
        borderRadius: 8,
        padding: "2px 18px",
        whiteSpace: "nowrap",
      }}
    >
      {`DRAFT — ${reasons.join(" · ")}`}
    </div>
  </div>
);
