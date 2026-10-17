# MotionQA video narration (English)

Status: TTS narration generated 2026-10-17 with Kokoro-82M v1.0 (Apache-2.0), generic voice af_heart; captions are timed to the generated audio.

Basis: docs/DEMO_SCRIPT.md shot list and docs/SUBMISSION_DRAFT.md text (no SUBMISSION_PACKAGE.md exists in the checkout). Numbers come from src/data/verified-results.json. Explainer structure follows the user's reference video.

Generated from `src/data/narration.json` by `npm run captions`. Edit the JSON, not this file.

## Team and problem

- `00:00` MotionQA: evidence-backed PCB anomaly inspection.
- `00:04` By team Kia Kiu, Institut Teknologi Bandung.
- `00:07` Can you spot the defect?
- `00:09` One bent pin. Just 0.13 percent of the model input.
- `00:15` A bare PASS or FAIL does not say why.
- `00:20` MotionQA keeps the reason, the score and the evidence.
## Application working

- `00:25` Here is how it decides. Every photo follows one path.
- `00:29` Bad photos are retaken. Unsure cases go to a person.
- `00:35` This is the real app, running locally.
- `00:38` A good board scores under the PASS line.
- `00:46` Bent pins score over the FAIL line.
- `00:51` A reviewer confirms. The machine decision stays on record.
- `00:58` A blurry photo gets RETAKE in the same session.
- `01:04` The sharp retake passes. Three failed tries go to a person.
- `01:10` Under the hood: one photo, step by step, in OpenCV 5.
- `01:15` Find the board. Check the focus.
- `01:20` Crop it and extract features with the new DNN engine.
- `01:27` Compare patches with normal boards, and mark what looks different.
## Review and failures

- `01:35` Now the hard cases. This good board lands just over the PASS line.
- `01:41` Too close to call, so a person decides.
- `01:44` A known miss: board 048 lost a pin, and it passes.
- `01:51` The hottest spot is on the transducer, not the missing pin.
- `01:56` This weakness is documented and unfixed.
- `02:01` Board 043 lost both transducers. The model is unsure it is the part.
- `02:08` An older policy said NO_PART. Now it goes to REVIEW, and it stays in all 153.
## Architecture

- `02:15` The same app runs live on AWS.
- `02:19` Without a token, only the status shows.
- `02:23` The model is ready on OpenCV 5, and health checks pass.
- `02:30` A photo enters through CloudFront and nginx.
- `02:35` FastAPI runs the OpenCV steps on one Graviton instance.
- `02:41` Evidence goes to S3. The record goes to PostgreSQL.
- `02:47` Secrets Manager holds the token. CloudFormation built the stack.
- `02:51` On October 16, twenty test images ran on AWS.
- `02:55` All twenty answers matched the local run.
## Evaluation

- `03:00` The data is the public VisA benchmark, on AWS Open Data.
- `03:05` Good boards build the memory. Validation sets the lines.
- `03:11` 153 test images give the results.
- `03:16` Each dot is one test image, placed by its score.
- `03:21` Two lines make three zones: PASS, REVIEW and FAIL.
- `03:27` One of 53 defective boards passed. Four of 100 good boards failed.
- `03:32` 41 images went to a person.
- `03:36` Image AUROC is 0.9745. A ranking score, not accuracy.
- `03:42` The OpenCV-only baseline ranks lower, 0.8689. It misses none, but rejects and reviews more.
- `03:52` We tuned capture gates after seeing test results.
- `03:55` So these are development results, not an independent test.
## Limits and access

- `04:00` MotionQA is tested on this benchmark only.
- `04:07` About one in three good boards goes to REVIEW.
- `04:13` Some missing parts can still pass.
- `04:19` Scan the code to open the live endpoint. Judges get the token privately.
- `04:25` The code, the data files and this video's sources are public.
- `04:32` MotionQA, by team Kia Kiu. Thank you.

Total: 51 cues, 462 words.
