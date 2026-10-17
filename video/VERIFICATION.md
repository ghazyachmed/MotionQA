# Verification report: MotionQA submission video

Date: 2026-10-17. Output: **`out/MotionQA_Draft.mp4` (draft, version 2)**. The final render is blocked because no
narration audio exists (see [section 5](#5-blockers-for-the-final-render)). The project is committed to `master`
locally; nothing was pushed, deployed or submitted.

Version 2 follows the team's reference video (an explainer on grid paper): every beat builds one diagram in sync with
the narration. New in version 2, all from real data: a zoom onto the bent pin of Anomaly/000 with its ground-truth size
(262 px of the 448 × 448 input, failure-analysis JSON); an animated decision path; a 20-board unit chart of the AWS
check; zooming score rulers on every clip; the 048 miss dissected on the real anomaly map; the identity-gap ruler for
043; seven real pipeline stages for one photo; one request travelling through the AWS diagram; the data-origin flow; and
all 153 test images as dots on the score axis.

## 1. Checkout and inputs

| Item | Result |
| --- | --- |
| Checkout | `master` at `c77ac5e`, clean, equal to `origin/master` after `git fetch` (https://github.com/ghazyachmed/MotionQA). No user changes, so work happened in this checkout; no worktree was needed. |
| `AGENTS.md` | Not found in the repository or user folders. |
| `MASTER-PROMPT.md`, `SKILL.md` | Found in `~/Downloads` (general prompt library; humanizer skill with ASD-STE100 "Mode D"). Narration follows Mode D: one idea per sentence, active voice, no em dash or semicolon. |
| `docs/submission/SUBMISSION_PACKAGE.md`, `MotionQA_SubmissionPackage.md` | **Not found.** The narration is based on `docs/DEMO_SCRIPT.md` and `docs/SUBMISSION_DRAFT.md`. |
| Facts used | `evaluation/results/visaPcb1Results.json` (policy 2, 2026-10-16T04:28Z, including the 153 per-image records), `evaluation/results/history/visaPcb1Results-run1/run2/run3-*.json`, `evaluation/results/failureAnalysis-2026-10-16.json`, `evaluation/visaPcb1Split.json`, `evaluation/policies/visaPcb1-policy1-profile.json`, `evaluation/aws-2026-10-16/README.md`, `docs/EVALUATION.md`, `docs/ARCHITECTURE.md`, `docs/FAILURE_ANALYSIS.md`, `docs/INDEPENDENT_EVALUATION.md` (status NOT RUN). SHA-256 of each machine source is stored in `src/data/verified-results.json`. |
| Toolchain | Node 25.9.0, npm 11.12.1. No system FFmpeg; Remotion's bundled `ffmpeg`/`ffprobe` n7.1 were used. Remotion 4.0.536 for every `@remotion/*` package, exact versions, `package-lock.json` committed with the project. Capture used the installed Chrome 155 through `playwright-core` 1.64.1 (no browser download). Fonts: Inter, JetBrains Mono, Caveat (all OFL-1.1, from `@fontsource`, served locally). |
| Reference video | `~/Downloads/ssstik.io_@ryanaidilp_1792215875348.mp4` (227 s, 576 × 1024), viewed as 57 sampled frames for style only. Nothing from it is in the video. |

## 2. Numbers: brief versus machine output

`npm run verify` derives every on-screen number from the files above and fails on any difference.

| Metric | Brief | JSON | Shown in video |
| --- | --- | --- | --- |
| Image AUROC, MotionQA / baseline | 0.9745 / 0.8689 | 0.9745 / 0.8689 | same, labelled "threshold-free ranking; not accuracy" |
| Anomalous → PASS | 1/53 · 0/53 | 1/53 · 0/53 | same |
| Normal → FAIL | 4/100 · 7/100 | 4/100 · 7/100 | same |
| REVIEW, baseline | 58/153 | 58/153 | same |
| REVIEW, MotionQA | **40/153** | **41/153** (current, policy 2) · 40/153 (policy-1 history) | 41/153, with the policy-1 value and its source as a footnote |

### Source conflicts (reported, not silently resolved)

1. **REVIEW 40/153 versus 41/153.** 40/153 comes from the policy-1 run of 2026-10-15, where `Anomaly/043` was `NO_PART`.
   The current results file uses decision policy 2 and sends 043 to `REVIEW · PART_IDENTITY_UNCERTAIN`. The video shows
   41/153 and states "Policy 1 run (2026-10-15): REVIEW 40/153, NO_PART 1/153 (Anomaly/043). Same denominator."
2. **Submission package missing.** Neither named file exists; see section 1.
3. **`docs/SUBMISSION_DRAFT.md` is internally inconsistent.** Its limitations list "no AWS deployment yet", while its
   AWS section and `evaluation/aws-2026-10-16/README.md` record the deployment of 2026-10-16. The video follows the
   deployment record. The draft file was not edited.

### Specific checks

- `Anomaly/043.JPG`: `NO_PART · PART_NOT_RECOGNIZED` in the policy-1 history (identity 0.155 above the single threshold
  0.151); `REVIEW · PART_IDENTITY_UNCERTAIN` in the current results. It stays in every denominator (153).
- `Anomaly/048.JPG`: in the test split; `PASS` with score 2.125 below 2.160 (current results, the policy-1 history and the
  local footage). Highest anomaly value inside the defect 2.097, outside 2.125 (failure-analysis JSON).
- Labels: "Exploratory development results" is on screen; "Not an independent evaluation" and the reasons (capture gates
  revised after test outcomes, 47 official-test anomalies in validation, failure analysis on test images, per-image
  rates, orientation confound 49/53 versus 25/100) are on screen and in the captions. The verifier fails on "accuracy"
  outside a "not accuracy" statement, on an independence claim, on AHM/Astra, and on production claims.

## 3. Application footage

| Clip | Label | Recorded (UTC) | Length (s) | Result recorded from the API |
| --- | --- | --- | --- | --- |
| `local-01-pass` | Local demonstration | 2026-10-17T04:54:47Z | 10.52 | PASS, score 2.056 (Normal/0011) |
| `local-02-fail` | Local demonstration | 2026-10-17T04:55:01Z | 11.52 | FAIL, score 2.742 (Anomaly/000), then Confirm FAIL |
| `local-03-review` | Local demonstration | 2026-10-17T04:55:16Z | 9.41 | REVIEW, score 2.165 (Normal/0027) |
| `local-04-missed-048` | Local demonstration | 2026-10-17T04:55:28Z | 9.42 | PASS, score 2.125 (Anomaly/048, defective) |
| `local-05-identity-043` | Local demonstration | 2026-10-17T04:55:41Z | 9.42 | REVIEW · identity uncertain, score 5.085 (Anomaly/043) |
| `local-06-retake-session` | Local demonstration | 2026-10-17T04:55:53Z | 13.94 | RETAKE (synthetic blur), then PASS 2.056 in the same session |
| `aws-01-ui-status` | AWS, no token | 2026-10-17T04:35:23Z | 8 | Deployed UI; model status line; panels answer HTTP 401 |
| `aws-02-model-status` | AWS, no token | 2026-10-17T04:35:33Z | 7 | `ready: true`, OpenCV 5.0.0, profile 2026.10.16 |
| `aws-03-health` | AWS, no token | 2026-10-17T04:35:42Z | 5 | postgres, redis, model: ok |

- **Local demonstration** ran at commit `c77ac5e` with a clean `backend/` and `frontend/` tree: uvicorn with the
  `visa-pcb1-patchcore-mnv2` 2026.10.16 profile (OpenCV 5.0.0), Homebrew PostgreSQL 16 (database `motionqa_video`,
  created for this capture) and Redis (db 5), Vite dev server, Apple M2. All five test-image results match the
  evaluation records exactly (decision equal, score within 0.001); `npm run verify` re-checks this.
- **AWS**: the endpoint was checked first. `GET /` 200, `/api/v1/model/status` `ready: true` on OpenCV 5.0.0,
  `/api/v1/health` ok (last check 2026-10-17T04:39:28Z, `src/data/links.json`). The AWS CLI session for profile
  `motionqa` had expired, so **no authenticated inference was recorded on AWS** and Secrets Manager was not accessed.
  The cloud inference claim in the video comes only from the deployment record (20/20 identical decisions, median
  450 ms inference, 779 ms server, 2026-10-16) and is labelled with that source.
- **Token handling**: a local test token was generated into a 0600 file outside the repository and placed in the tab's
  `sessionStorage` before page load. It was never typed, printed, recorded or written to any asset.
- **Not synthetic**: no UI animation imitates the app, and no heatmap was drawn. The pipeline stages and the 048
  anomaly map come from `scripts/export_pipeline_stages.py`, which calls the backend's own functions with the deployed
  profile; its outputs reproduce the evaluation records (000: FAIL 2.742; 048: PASS 2.125, inside-defect maximum 2.097)
  and `npm run verify` re-checks them. The VisA ground-truth outlines are labelled as dataset labels. Camera moves
  (crop and zoom) are applied to the recordings. Annotation arrows point at the recordings from outside, on the AWS
  status clip only, and fade before the camera moves.
- **Illustration, labelled**: the "manual check" log in Fig. 2 is an illustration and says so on screen. The 20 board
  icons in Fig. 5 are grouped by decision (7 / 3 / 10 from the deployment record), not in request order.
- **Dot plot**: every dot is one record of the results JSON. The axis is broken above 3.3 and marked with a red "//".
  AUROC recomputed from the 153 scores (Mann-Whitney) is 0.9745, equal to the stored value.
- **Fixed during review**: the first recordings showed the previous clip's result for about 1.5 s at the start of each
  clip (for example, a PASS screen under the FAIL title). The capture now reloads the page before each clip, and every
  clip starts at "Awaiting capture".

## 4. Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | pass |
| `npm run verify` | `verify-results: ok (9 sources, 7 footage results, brief table 8/8 match)`, plus AUROC from records and pipeline-export checks; `verify-assets: ok (43 public files, 51 cues)`, including highlight phrases on one caption line |
| `npm run verify:final` / `npm run render:final` | **fail as designed**: narration audio missing; `narration.json` still `TEXT ONLY` |
| Composition guard | `remotion still … --props=props/final.json` throws `Final render blocked: missing narration audio` |
| Sample frames | `npm run stills`: 113 frames (start, middle, end of all 25 segments and both sides of every cut), `out/contact-sheet-01..05.jpg` |
| Visual issues found and fixed (v1) | stale result at clip starts; header chips past the right safe margin; zoom cutting the evidence image; deployment diagram text overflowing boxes; "112 / 153" wrapping; "Apache-/2.0" line break; JetBrains Mono ligature turning `https://` into `https: //` |
| Visual issues found and fixed (v2) | margin note running under the record card; record card spilling into the caption band; an AWS arrow outliving its zoom; decision-tree labels overflowing boxes; MISSED DEFECT stamp covering text; figure labels past the right margin; an arrow drawn before its image; ruler labels colliding; dot-plot annotations on top of dots; access cards overlapping the credits |
| Encoded output | 26 frames extracted from the MP4 across 4–270 s (`out/contact-sheet-mp4-1.jpg`, `-2.jpg`); decisions, scores, overlays, diagrams and captions are legible |
| Layout rules | font sizes ≥ 32 px (captions 38 px), checked in source; 96 px safe margin; captions at most 2 lines of 52 characters in a reserved band; no transition covers a result (8-frame fades only) |

### ffprobe: `out/MotionQA_Draft.mp4`

```text
format: mov,mp4  duration 280.000000 s  size 22,572,834 bytes  bit_rate 645 kb/s
stream 0: video h264 (High), 1920x1080, yuv420p, r_frame_rate 30/1, avg_frame_rate 30/1, nb_frames 8400
audio: none (draft without narration)
sha256 c2d6f8962b00f5ecaca4d18517d7290da62539177eb1be860a51de1f1209782e
```

## 5. Blockers for the final render

1. **Narration audio.** No recording was found (searched the repository, Downloads, Desktop, Documents, Music, Movies).
   No authorized TTS was available: macOS system voices are licensed for personal, non-commercial use only, Amazon
   Polly needs the expired AWS session, and no other TTS licence was supplied. The user's voice was not imitated. To
   finish: record `NARRATION.md` (545 words, about 2.5 words/s), save it as `public/audio/narration.wav`, re-time
   `src/data/narration.json` to the recording, change its `status`, then run `npm run captions`,
   `node scripts/verify-assets.mjs --write-manifest` and `npm run render:final`.
2. **Optional, owner decision:** footage of an authenticated inspection on the AWS endpoint. It needs the operator token
   entered by the owner (the agent does not type tokens into a non-local site) or a renewed `aws login`. The draft
   separates the AWS status footage from the local inference footage, so this is not required for the final render.

## 6. Left in place on this machine

- Local servers started for capture (uvicorn on 127.0.0.1:8000, Vite on 127.0.0.1:5173) were stopped after recording.
- PostgreSQL database `motionqa_video` and Redis db 5 hold the demo inspection records; drop them with
  `dropdb motionqa_video` and `redis-cli -n 5 flushdb` if not needed.
- `.claude/launch.json` (ignored by git) gained a `motionqa-backend-demo` entry that points at a scratch launcher.
