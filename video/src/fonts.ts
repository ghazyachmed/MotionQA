import { loadFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// Local OFL-1.1 fonts from @fontsource, copied to public/fonts. No network access at render time.
const faces: Array<{ family: string; file: string; weight: string }> = [
  { family: "Inter", file: "inter-latin-400-normal.woff2", weight: "400" },
  { family: "Inter", file: "inter-latin-500-normal.woff2", weight: "500" },
  { family: "Inter", file: "inter-latin-600-normal.woff2", weight: "600" },
  { family: "Inter", file: "inter-latin-700-normal.woff2", weight: "700" },
  { family: "Inter", file: "inter-latin-800-normal.woff2", weight: "800" },
  { family: "JetBrains Mono", file: "jetbrains-mono-latin-400-normal.woff2", weight: "400" },
  { family: "JetBrains Mono", file: "jetbrains-mono-latin-600-normal.woff2", weight: "600" },
  { family: "Caveat", file: "caveat-latin-500-normal.woff2", weight: "500" },
  { family: "Caveat", file: "caveat-latin-600-normal.woff2", weight: "600" },
  { family: "Caveat", file: "caveat-latin-700-normal.woff2", weight: "700" },
];

const handle = delayRender("Loading local fonts");

Promise.all(faces.map((face) => loadFont({ family: face.family, url: staticFile(`fonts/${face.file}`), weight: face.weight })))
  .then(() => continueRender(handle))
  .catch((error: unknown) => cancelRender(new Error(`Local font failed to load: ${String(error)}`)));
