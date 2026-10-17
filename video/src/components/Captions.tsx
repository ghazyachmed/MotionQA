import { parseSrt } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import narration from "../data/narration.json";
import { colors, fonts, layout, size } from "../theme";

type Cue = { start: number; text: string; highlight?: string[] };
const cues = narration.cues as Cue[];

// Highlight phrases (narration.json) get a marker sweep shortly after the cue starts.
const renderLine = (line: string, phrases: string[], sweep: number) => {
  const phrase = phrases.find((p) => line.includes(p));
  if (!phrase) return line;
  const start = line.indexOf(phrase);
  return (
    <>
      {line.slice(0, start)}
      <span
        style={{
          backgroundImage: `linear-gradient(${colors.marker}, ${colors.marker})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sweep}% 100%`,
          padding: "0 6px",
          borderRadius: 4,
        }}
      >
        {phrase}
      </span>
      {line.slice(start + phrase.length)}
    </>
  );
};

// Burned-in English captions from public/captions/en.srt. Line breaks come from the SRT (two lines at most).
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading captions"));

  const load = useCallback(async () => {
    try {
      const response = await fetch(staticFile("captions/en.srt"));
      if (!response.ok) throw new Error(`captions/en.srt: HTTP ${response.status}`);
      const { captions: parsed } = parseSrt({ input: await response.text() });
      setCaptions(parsed);
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [cancelRender, continueRender, handle]);

  useEffect(() => {
    load();
  }, [load]);

  if (!captions) return null;
  const nowMs = (frame / fps) * 1000;
  const index = captions.findIndex((caption) => nowMs >= caption.startMs && nowMs < caption.endMs);
  if (index < 0) return null;
  const active = captions[index];
  const cue = cues.find((c) => Math.abs(c.start * 1000 - active.startMs) < 2);
  const startFrame = (active.startMs / 1000) * fps;
  const sweep = interpolate(frame, [startFrame + 6, startFrame + 18], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lines = active.text.trim().split("\n");

  return (
    <div style={{ position: "absolute", left: layout.margin, right: layout.margin, bottom: layout.height - layout.captionBottom, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          backgroundColor: "rgba(246, 242, 232, 0.94)",
          borderRadius: 12,
          padding: "6px 28px",
          fontFamily: fonts.sans,
          fontSize: size.caption,
          fontWeight: 700,
          lineHeight: 1.32,
          color: colors.ink,
          textAlign: "center",
        }}
      >
        {lines.map((line) => (
          <div key={line} style={{ whiteSpace: "nowrap" }}>
            {renderLine(line, cue?.highlight ?? [], sweep)}
          </div>
        ))}
      </div>
    </div>
  );
};
