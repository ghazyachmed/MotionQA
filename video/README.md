# MotionQA submission video (Remotion)

Source of the OpenCV AI Competition 2026 video: **MotionQA: Evidence-Backed PCB Anomaly Inspection**, team Kia Kiu
(Ghazy Achmed Movlech Urbayani, Institut Teknologi Bandung). 1920 × 1080, 30 fps, 8,400 frames (280 s), H.264.
This folder is separate from `frontend/`; nothing here is a dependency of the production app.

Style: an explainer on grid paper, after the team's reference video. Each beat builds one diagram step by step in
sync with the narration: a handwritten kicker (Caveat) above a bold title, a "Fig. n" source line, drawn arrows and
brackets, an animated score ruler, and highlighted keywords in the captions. Navy `#0B1730` is the ink colour and cyan
`#43D9E8` marks OpenCV 5.

Status and evidence for every claim: [VERIFICATION.md](VERIFICATION.md). Narration text: [NARRATION.md](NARRATION.md).
Asset hashes, sources and licences: [ASSET_MANIFEST.json](ASSET_MANIFEST.json).

## Commands

```bash
npm ci
npm run dev            # Remotion Studio, composition MotionQADemo
npm run typecheck
npm run verify         # numbers vs evaluation JSON, assets, captions, timeline, on-screen rules
npm run render:draft   # out/MotionQA_Draft.mp4 (watermarked)
npm run render:final   # out/MotionQA_Final.mp4; refuses to run until every final condition holds
npm run stills         # sample frames of every segment and cut, plus out/contact-sheet-*.jpg
```

Rendering is offline: fonts, footage, images and captions load from `public/` with `staticFile()`.

## Draft versus final

`render:final` runs `verify-assets.mjs --final`, and the composition's `calculateMetadata` throws in final mode. A final
render needs all of these:

- every footage clip in `public/assets/footage/` (real recordings, not UI animation);
- a narration recording at `public/audio/narration.wav` (or `.mp3` / `.m4a`), at most 300 s;
- `src/data/narration.json` re-timed to that recording, with `status` no longer starting with `TEXT ONLY`;
- verified judge links in `src/data/links.json` (`npm run check-links`);
- no placeholder text; `props/final.json` sets `mode: "final"`, which removes the draft watermark.

The draft watermark names what is missing, for example `DRAFT — NARRATION AUDIO MISSING` or
`DRAFT — DEMO FOOTAGE MISSING`. A missing clip renders as a red "DEMO FOOTAGE MISSING" panel, never as a mock UI.

## Data flow

| File | Made by | Used for |
| --- | --- | --- |
| `src/data/verified-results.json` | `node scripts/verify-results.mjs --write` | Every number on screen. Derived from `evaluation/results/visaPcb1Results.json`, the policy-1 history file, the failure analysis, the split manifest, and the AWS deployment record. `npm run verify` fails if it drifts from those files. |
| `src/data/narration.json` | hand-written | Narration cues; `npm run captions` writes `public/captions/en.srt` and `NARRATION.md` |
| `src/data/timeline.json` | hand-written | Scene and segment frames, shared by the scenes and the scripts |
| `src/data/links.json` | `npm run check-links` | Judge links with the time and result of the last check (network, before rendering) |
| `public/assets/footage/*.mp4` + `.json` | `npm run capture:local` / `capture:aws` | Real screen recordings; the JSON sidecar holds timestamps, events and the API results |
| `src/data/pipeline-stages.json` + `public/assets/pipeline/*` | `../backend/.venv/bin/python scripts/export_pipeline_stages.py` | Real intermediate outputs of the OpenCV 5 pipeline (part mask, focus band, crop, DNN feature maps, anomaly map, evidence) for Anomaly/000, and the 048 anomaly map with the VisA ground-truth outline. `npm run verify` checks them against the evaluation records. |
| `public/assets/dataset/*` | `scripts/prepare_dataset_figures.py` | VisA images; the 048 crop shows the VisA ground-truth mask (a dataset label) |

## Recording the footage again

Local demonstration (real inference on the local stack; see the repository `readme.md` for setup):

```bash
# backend: uvicorn with MOTIONQA_API_TOKENS from a token file; frontend: npm run dev on 127.0.0.1:5173
MOTIONQA_DEMO_TOKEN_FILE=/path/to/token npm run capture:local
npm run capture:aws          # public, unauthenticated routes of the CloudFront endpoint only
node scripts/verify-results.mjs --write && node scripts/verify-assets.mjs --write-manifest
```

The capture script writes the token into the tab's `sessionStorage` before the page loads (where the UI keeps it after
*Set*). The token is never typed, shown, logged or stored in an asset. Each clip starts from a fresh page, so it never
shows the previous clip's result. If a re-recorded clip is shorter than its segment, `npm run verify` names it; adjust
`src/data/timeline.json`.

The synthetic blur input (`capture-inputs/Normal-0011-blur-0.006.jpg`) comes from the repository's own
`motionQa.evaluation.runLocalDemo.blurred_copy` (Gaussian blur, sigma 0.6 % of the long side).

## Credits

VisA dataset, CC BY 4.0 (Zou et al., ECCV 2022). MobileNetV2 from OpenCV Zoo, Apache-2.0. OpenCV, Apache-2.0.
Inter, JetBrains Mono and Caveat fonts, SIL Open Font License 1.1 (`public/fonts/*-OFL.txt`). Remotion is free for teams of up
to three people (remotion.pro/license).
