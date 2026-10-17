# Verification report: MotionQA submission video

Date: 2026-10-17. Output: **`out/MotionQA_Final.mp4`** (version 3, with narration). The final gate
(`npm run render:final`) passed: real footage present, narration track present and synced, judge links re-checked, QR
code decodes to the endpoint, no placeholders, no draft watermark. Committed to `master`; nothing was pushed, deployed
or submitted.

## What changed in version 3

| Feedback | Change |
| --- | --- |
| Too much text on screen | One message per beat: the title states the point, one visual, at most one or two short labels. Figure lines, panel lines and secondary notes were removed. Narration cut from 563 to 462 words. |
| Audio with natural pronunciation and intonation | Narration synthesised locally with Kokoro-82M (Apache-2.0), generic voice `af_heart`, normal speed. Each cue has a spoken form for hard tokens (for example "Open C V five", "zero point nine seven four five", "engine X"). |
| QR code for the live endpoint | `public/assets/qr/live-endpoint.png`, generated offline from `src/data/links.json`; `npm run verify` decodes it back and requires the exact URL. |
| AWS shown too early | New order: problem → how it decides and the real app → under the hood (OpenCV 5) → hard cases → live on AWS → results → limits and scan-to-try. |
| Judge appeal | Clear chapter kickers, hero numbers (0.13 %, 20/20, 0.9745), progressive diagrams, and a closing scan-to-try card. |

## 1. Checkout and inputs

| Item | Result |
| --- | --- |
| Checkout | `master`, started at `c77ac5e` (clean, equal to `origin/master`); work committed locally on `master` as requested. |
| `AGENTS.md`, submission package | Not found. Narration basis: `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION_DRAFT.md`. `MASTER-PROMPT.md` and `SKILL.md` were found in `~/Downloads`; narration follows the ASD-STE100 style (short, active, no em dash or semicolon). |
| Facts | `evaluation/results/visaPcb1Results.json` (policy 2, with 153 per-image records), the run1–run3 history files, `failureAnalysis-2026-10-16.json`, `visaPcb1Split.json`, `visaPcb1-policy1-profile.json`, `evaluation/aws-2026-10-16/README.md`, `docs/EVALUATION.md`. SHA-256 of each source is in `src/data/verified-results.json`. |
| Reference video | `~/Downloads/ssstik.io_@ryanaidilp_1792215875348.mp4`, viewed as sampled frames for style only; nothing from it is in the video. |
| Toolchain | Node 25.9.0, npm 11.12.1, Remotion 4.0.536 (exact versions, lockfile committed), bundled FFmpeg/ffprobe n7.1, Chrome 155 via `playwright-core` for capture. TTS: separate Python 3.11 venv outside the repo with `kokoro` 0.9.4, `torch` 2.14.1, and Homebrew `espeak-ng` 1.52.0 (installed for this task; used only to phonemise words missing from Kokoro's dictionary, because the pip-bundled eSpeak exits on a build-machine path). |

## 2. Numbers

Every number comes from `src/data/verified-results.json`, rebuilt and compared by `npm run verify`.

| Metric | Brief | Machine output | Shown |
| --- | --- | --- | --- |
| Image AUROC, MotionQA / baseline | 0.9745 / 0.8689 | same; AUROC recomputed from the 153 scores = 0.9745 | same, "a ranking score, not accuracy" |
| Defective → PASS | 1/53 · 0/53 | same | same |
| Good → FAIL | 4/100 · 7/100 | same | same |
| REVIEW, baseline | 58/153 | same | same |
| REVIEW, MotionQA | **40/153** | **41/153** (policy 2) · 40/153 (policy-1 run, 2026-10-15) | 41/153, and "REVIEW 40 / 153 → 41 / 153" on the 043 policy beat |

Source conflicts, reported and not resolved silently:

1. **40/153 vs 41/153**: 40 is the policy-1 run where `Anomaly/043` was `NO_PART`; the current file (policy 2) sends 043 to
   REVIEW. Both runs keep all 153 images in every denominator.
2. **Submission package missing** (neither named file exists).
3. **`docs/SUBMISSION_DRAFT.md`** lists "no AWS deployment yet" although its AWS section and the deployment record say
   deployed on 2026-10-16. The video follows the deployment record; the draft was not edited.

Specific checks: 043 is `NO_PART` in the policy-1 history and REVIEW now; 048 is a test-split PASS at 2.125 < 2.160, with
2.097 inside the defect (failure-analysis JSON and the pipeline export agree). The problem hook's "0.13 %" is the
ground-truth area of Anomaly/000 at the 448 × 448 model input (262 of 200,704 px, failure-analysis JSON).

## 3. Footage and generated assets

| Asset | Provenance |
| --- | --- |
| `local-01…06` clips | Real inference on the local stack at commit `c77ac5e` (clean `backend/` and `frontend/`), profile 2026.10.16, OpenCV 5.0.0, recorded 2026-10-17 04:54–04:55 UTC; each clip starts from a fresh page. All five test-image results equal the evaluation records (`npm run verify`). Labelled "Local demonstration". |
| `aws-01…03` clips | The deployed endpoint without a token, recorded 2026-10-17 04:35 UTC: UI (model status visible, data panels HTTP 401), `/api/v1/model/status`, `/api/v1/health`. No authenticated AWS inference was recorded: the AWS CLI session had expired and Secrets Manager was not accessed. The 20/20 cloud result is from the 2026-10-16 deployment record and is labelled with it. |
| `assets/pipeline/*` | Real intermediate outputs of the backend pipeline (`scripts/export_pipeline_stages.py`), cross-checked against the evaluation records. |
| `assets/qr/live-endpoint.png` | `qrcode` 1.5.4, error correction M; decoded by `jsQR` to `https://d4dqbqmvvujy7.cloudfront.net`. |
| `audio/narration.wav` | Kokoro-82M v1.0, voice `af_heart`, speed 1.0; model file sha256 `496dba11…ad1e4`. 462 words in 168.4 s of speech (2.74 words/s). Normalised by `scripts/normalize-audio.mjs` from −23.3 to −16.4 LUFS, true peak −1.49 dBTP, 48 kHz mono; cue onsets unchanged. |

Not synthetic: no UI animation imitates the app and no heatmap was drawn. The "bare check log" on the problem beat is
labelled as an illustration. The 20 board icons are grouped by decision (7 / 3 / 10 from the deployment record). The
voice is a generic model voice; the user's voice was not imitated. The local test token lived in a 0600 file outside
the repository and never appears in any asset (checked by searching the project for it before committing).

## 4. Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm run verify` | `verify-results: ok (9 sources, 7 footage results, brief table 8/8 match)`; `verify-assets: ok (45 public files, 51 cues)` |
| `npm run verify:final` | **pass** (narration present and synced, status updated, links verified, no placeholders) |
| Narration fit | Every cue fits before the next at normal speed (the script stops instead of speeding up); two tight beats were given more time. Silence detection finds speech within 0.25 s of each cue start, except three cues that follow the previous one with less than 0.35 s of silence. |
| Captions | ≤ 2 lines of ≤ 52 characters, ≥ 1.5 s on screen, ≤ 3.0 words/s, highlights on one line, timed to the audio |
| Sample frames | 113 frames over all 25 segments and every cut (`out/contact-sheet-01..05.jpg`, final props) |
| Visual fixes in v3 | 048 note colliding with the ruler label; team line touching the repository card; empty first frames of the dissection; the v1 and v2 fixes still hold |

### ffprobe: `out/MotionQA_Final.mp4`

```text
format: mov,mp4  duration 280.000000 s  size 29,525,866 bytes  bit_rate 844 kb/s
stream 0: video h264 (High), 1920x1080, yuv420p, r_frame_rate 30/1, avg_frame_rate 30/1, nb_frames 8400, 280.000 s
stream 1: audio aac (LC), 48000 Hz, 2 channels, 280.000 s
loudness: -13.4 LUFS integrated (mono narration on both channels), true peak -1.5 dBTP
sha256 1b9ffe5c5c1b14c2adb987a7586fd0e47b4c491859e2d4972fa9c273123fd348
```

Frames extracted from this file at 26 points from 3 s to 276 s (`out/contact-sheet-mp4-1.jpg`, `-2.jpg`) show every beat,
the captions and the QR code as designed, with no draft watermark.

## 5. Remaining owner decisions

- Listen to the narration once before submitting: the voice is synthetic; names (Kia Kiu, Institut Teknologi Bandung)
  are pronounced by an English model.
- Optional: footage of an authenticated inspection on the AWS endpoint needs the owner to enter the operator token (or
  a renewed `aws login`). The video separates AWS status footage from local inference footage, so this is not required.
- The endpoint is planned to be torn down by 2026-11-11 (deployment record); the QR code stops working after that.

## 6. Left in place on this machine

- PostgreSQL database `motionqa_video` and Redis db 5 hold the demo inspection records (`dropdb motionqa_video`,
  `redis-cli -n 5 flushdb` to remove).
- Homebrew package `espeak-ng` (`brew uninstall espeak-ng` to remove), the TTS venv in the session scratchpad, and the
  Kokoro model in `~/.cache/huggingface`.
- `.claude/launch.json` (ignored by git) has a `motionqa-backend-demo` entry pointing at a scratch launcher.
