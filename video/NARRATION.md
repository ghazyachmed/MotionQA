# MotionQA video narration (English)

Status: TEXT ONLY: no narration audio has been recorded. Timings are planned at about 2.5 words per second and must be re-synced to the real recording.

Basis: docs/DEMO_SCRIPT.md shot list and docs/SUBMISSION_DRAFT.md text (no SUBMISSION_PACKAGE.md exists in the checkout). Numbers come from src/data/verified-results.json. Explainer structure follows the user's reference video.

Generated from `src/data/narration.json` by `npm run captions`. Edit the JSON, not this file.

## Team and problem

- `00:00` MotionQA: evidence-backed PCB anomaly inspection.
- `00:03` Team Kia Kiu, Institut Teknologi Bandung.
- `00:06` Can you spot the defect on this benchmark board?
- `00:09` It is one bent pin: 262 pixels of the model input, about 0.13 percent.
- `00:15` A manual check records PASS or FAIL, but rarely why.
- `00:20` MotionQA stores the decision with its reason, score, thresholds and evidence.
## Application working

- `00:25` First, the live endpoint on AWS. CloudFront serves the app from one EC2 Graviton instance.
- `00:31` Without a token, only the model status is visible.
- `00:34` The server reports the model ready on OpenCV 5, and health is ok.
- `00:40` On October 16, twenty test images ran through CloudFront.
- `00:44` All twenty decisions matched the local run. Median inference took 450 milliseconds.
- `00:50` Every photo walks the same decision path.
- `00:55` Bad photos get RETAKE. Doubtful parts go to a person.
- `01:00` Now a local demonstration, same model profile.
- `01:03` A good board scores 2.06, below the PASS line at 2.16.
- `01:11` Bent pins push the score to 2.74, past the FAIL line.
- `01:16` A reviewer confirms. The machine decision stays on record.
- `01:22` A blurred photo gets RETAKE, and the session stays open.
- `01:28` The sharp retake passes. After three failed tries, the part goes to a person.
## Review and failures

- `01:35` This good board lands at 2.165, just over the PASS line.
- `01:41` So MotionQA asks a person instead of guessing.
- `01:44` Now a known failure. Test image 048 has a missing pin, and it passes.
- `01:51` The hottest spot sits on the transducer, not on the missing pin.
- `01:56` Plain background looks normal to a patch memory. This stays unfixed.
- `02:01` Board 043 lost both transducers. Its identity distance, 0.155, falls in the gap.
- `02:08` An older policy called it NO_PART. Now it goes to REVIEW, and stays in all 153.
## Architecture

- `02:15` Let us dissect one photo through OpenCV 5.
- `02:19` Otsu thresholding and contours find the board. Sobel edges check focus.
- `02:25` The crop goes through MobileNetV2 on the new DNN engine.
- `02:30` Patch distances to normal boards form the anomaly map and the evidence.
- `02:37` On AWS, the photo enters through CloudFront and nginx.
- `02:42` FastAPI runs the pipeline on one t4g.small instance.
- `02:48` Evidence goes to S3, the record to PostgreSQL, live events to Redis.
- `02:54` Secrets Manager holds the token. CloudFormation built the stack.
## Evaluation

- `03:00` Where does the data come from? The public VisA archive on AWS Open Data.
- `03:05` 804 good boards build the memory. Validation images set the thresholds.
- `03:11` 153 test images give the results.
- `03:16` Each dot is one test image, placed by its anomaly score.
- `03:21` Two lines split the axis into PASS, REVIEW and FAIL.
- `03:27` 1 of 53 defective boards passed. 4 of 100 good boards failed.
- `03:32` 41 of 153 images went to REVIEW.
- `03:36` Image AUROC is 0.9745. It ranks scores. It is not accuracy.
- `03:41` The OpenCV-only baseline: AUROC 0.8689, no missed defects, 7 false rejections, 58 reviews.
- `03:49` These are exploratory development results.
- `03:54` Capture gates changed after test outcomes, so this is not an independent evaluation.
## Limits and access

- `04:00` The model covers this benchmark only. It is not validated on other parts or lines.
- `04:07` About a third of good boards go to REVIEW at this operating point.
- `04:13` A missing component on plain background can pass. FAIL and REVIEW need a person.
- `04:19` Judges can open the CloudFront endpoint. We share the operator token privately.
- `04:25` The public repository holds the code, the evaluation files and this video's sources.
- `04:32` MotionQA, by team Kia Kiu. Thank you for watching.

Total: 51 cues, 545 words.
