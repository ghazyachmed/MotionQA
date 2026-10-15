# MotionQA Demo Script (≤ 5 minutes)

Limit source: the final submission requirements on https://opencv26.devpost.com/ (accessed 2026-10-15) ask for a
judge-accessible video of at most five minutes covering the team, the working application, its architecture, and its
principal results.

Record against a local run unless the AWS stack has been deployed and smoke-tested (see `SUBMISSION_READINESS.md`).
Do not show AWS screens for infrastructure that has not been deployed.

## Preparation (not recorded)

```bash
cd backend && . .venv/bin/activate
python -m motionQa.evaluation.visaDataset          # VisA pcb1 extraction + split manifest
python -m motionQa.evaluation.runEvaluation        # builds the profile, writes evaluation/results/visaPcb1Results.json
export MOTIONQA_API_TOKENS=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
uvicorn motionQa.mainApi:createApp --factory --host 127.0.0.1 --port 8000
# second terminal
cd frontend && npm run dev -- --host 127.0.0.1 --port 5173
```

Pick from the **test split** only (`evaluation/visaPcb1Split.json` → `splits.test`). The 2026-10-16 local run
(`artifacts/local-demo-001/demo_results.json`, recorded with `python -m motionQa.evaluation.runLocalDemo`) observed:
`Normal/0011` → PASS, `Anomaly/000` → FAIL, `Normal/0027` → REVIEW, `Anomaly/048` → **PASS (a missed defect)**,
`Anomaly/043` → NO_PART, a synthetic blur of `Normal/0011` → RETAKE, and any image with the profile missing → ERROR.
Show the missed defect: it is the honest failure case. Do not use memory-bank images (`Normal/0000`–`0002`) as
evidence of a correct PASS; they are part of the model.

## Shot list

| Time | Show | Say (summary) |
| --- | --- | --- |
| 0:00–0:20 | Team on camera | Who we are; MotionQA is a visual inspection MVP that states uncertainty and routes doubtful parts to people. |
| 0:20–0:50 | `docs/ARCHITECTURE.md` diagram | OpenCV 5 does localization, capture checks, DNN feature extraction, anomaly maps, and evidence rendering; AWS design is prepared (say "not yet deployed" unless it is). |
| 0:50–1:10 | UI, mode bar on **REAL INFERENCE**, model status line | The model profile is a public-benchmark task (VisA pcb1); it is not validated on motorcycle parts. |
| 1:10–1:40 | Inspect the normal test image | Decision `PASS`; raw anomaly score under the PASS threshold; latency split into inference and end-to-end. |
| 1:40–2:20 | Inspect the anomalous test image | Decision `FAIL`; heatmap and boxes in the evidence overlay; review status `PENDING`; click *Confirm FAIL*; machine decision stays on record. |
| 2:20–2:45 | Inspect the REVIEW image | Score between thresholds → `REVIEW`, not a forced PASS/FAIL. |
| 2:45–3:15 | Blurred copy, then other-object image | `RETAKE · BLURRED`; `NO_PART · PART_NOT_RECOGNIZED`. Absence of a defect alone never produces PASS. |
| 3:15–3:35 | Stop the API's model (rename profile) or show the `MODEL_UNAVAILABLE` test | Missing model → `ERROR`, never PASS. |
| 3:35–3:55 | Switch mode bar to **SIMULATED DEMO**, run a forced scenario | Clearly labelled heuristic; stored as `SIMULATED_DEMO`; excluded from the decision trend. |
| 3:55–4:40 | `docs/EVALUATION.md` table | Test-split missed-defect rate, false-rejection rate, REVIEW/RETAKE rates, AUROC vs the OpenCV-only baseline, latency on Apple M2. |
| 4:40–5:00 | `docs/SUBMISSION_READINESS.md` | Remaining gaps: target-domain data, AWS deployment, target-site validation. |

Keep the recording under 5:00 including titles.
