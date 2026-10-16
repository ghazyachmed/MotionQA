# MotionQA local agent execution brief

You are the implementation and evaluation agent for MotionQA.
Work in https://github.com/ghazyachmed/MotionQA. Read AGENTS.md if present.
Read this brief, INDEPENDENT_EVALUATION.md, EVALUATION.md, AWS_FREE_PLAN.md,
and SUBMISSION_READINESS.md before editing. Preserve unrelated local work.

## Objective and priorities

Deliver a reproducible, honest computer-vision inspection demo and credible evidence.
Prioritize correctness, real OpenCV inference, clear failure handling, and reproducibility.
Do not promise competition success. Do not invent customers, field trials or novelty.
Check the current competition rules and deadline at https://opencv26.devpost.com/.
Do not submit an entry or send messages without the owner's explicit instruction.

First inspect the current branch and diff. This package was based on master commit
400ca6a20031de787e34549432e75a946b84a90f. Reconcile newer changes without overwriting them.
Implement on a separate branch. Report concrete blockers and continue unblocked tasks.

## 1. Environment and public photos

Use Python 3.11 or 3.12 in a virtual environment. Install the existing lockfile.
If pinned packages cannot be resolved, report that failure. Do not silently substitute versions.
From backend/ run:

```bash
python -m pip install -r requirements-dev.lock
python -m pytest -q -rs
python -m motionQa.evaluation.preparePublicPhotos \
  --download --archive ../data/downloads/VisA_20220922.tar \
  --dataset ../data/visa --output ../artifacts/public-photos-001
```

The download is approximately 1.93 GB. Allow additional extraction and model space.
It requires internet but no AWS account or credentials. Reuse a verified local archive.
An interrupted download leaves a .partial file. Inspect and remove that file before retrying.
Never bypass a checksum mismatch. Do not commit the archive, private images or model binaries.

Outputs include six actual benchmark image references, hashes, attribution, and a contact sheet.
Inspect the contact sheet visually. The six images are illustrative selections, not a sample
supporting accuracy. Keep full-resolution originals for inference, not the contact sheet.

Source https://registry.opendata.aws/visa/
Archive https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar
License CC BY 4.0. Credit Zou et al., SPot-the-Difference, ECCV 2022.
Archive SHA-256 2eb8690c803ab37de0324772964100169ec8ba1fa3f7e94291c9ca673f40f362.

## 2. Restore a genuine local demo

Inspect modelRegistry and the existing artifact download/build commands first.
If artifacts are absent, reproduce the documented public benchmark build:

```bash
python -m motionQa.edge.modelRegistry --download-feature-backbone --model-dir models
python -m motionQa.evaluation.visaDataset
python -m motionQa.evaluation.runEvaluation
```

runEvaluation fits and calibrates. Run it only on the public development benchmark.
Record fresh outputs separately; preserve historical evaluation records.
Never call its outputs an independent validation or run it on a reserved new test set.
Inspect results for model readiness, input dimensions, latency, and all six outcomes.
Keep DEMO mode visibly separate from actual model inference.
Never hardcode image labels or manufacture successful predictions for the presentation.

Run the application according to its current README. Verify authenticated inference,
evidence retrieval, human review retaining the original decision, and failure handling.
Capture a short demo showing a normal case, defective case, and genuine uncertain/failure case.
Report end-to-end latency separately from model-only latency and name the test hardware.
Do not cherry-pick demo outputs into accuracy claims.

## 3. Prepare prospective evidence, without pretending to collect it

Public VisA pcb1 has already influenced this project's development.
Downloading it again, renaming it, or changing its split cannot create independence.
Generated images and synthetic defect overlays may test robustness only when labeled synthetic.

Ask the owner for access to multiple physical components of one clearly specified type.
For the existing profile, verify the exact target and imaging geometry in the real photos first.
If choosing another component, create a separate profile using development components only.
Do not assume a PCB profile generalizes to arbitrary mechanical parts.

Prepare a capture worksheet with real part ID, session ID, timestamp, operator, camera,
lighting, distance, view, and relative filename. Use opaque image filenames.
Use stable diffuse lighting, a fixed mount, and a consistent background.
Record at least a primary view and a second view per component when studying recapture.
Keep every view of a component in the same partition. Record natural defects separately
from intentionally created or simulated defects. Do not damage powered equipment.
Use genuine normal, defective, wrong-object, and poor-capture examples where available.
Do not claim a sample count until images exist. Specify sample size from the intended claim.

A competent human custodian must retain ground-truth labels until predictions are finalized.
Have ambiguous labels adjudicated before scoring. Record reviewer identity and criteria privately.
The agent cannot impersonate a reviewer or claim physical collection occurred.
If no suitable parts or reviewer are available, mark prospective evaluation NOT RUN.
Continue the benchmark demo and deployment preparation.

Inventory prior development images honestly. VisA lacks physical-part identifiers.
Do not invent physicalPartId values to pass the strict seal tool. If legacy provenance
prevents its manifest requirements, report the limitation. Use a fully documented prospective
development/test collection for a new experiment rather than weakening validation silently.

## 4. Freeze, predict, then reveal labels

Follow INDEPENDENT_EVALUATION.md exactly. Freeze source, model, thresholds and protocol.
Create a fresh seal only after all code changes are complete. Record the seal before inference.
Use frozenInference predict for new test images. It must not fit or calibrate anything.
Keep labels outside the agent's inference inputs and out of label-revealing filenames.
Only after predictions.jsonl and run.json exist may the custodian release labels for score.

Report all PASS, FAIL, REVIEW, RETAKE, NO_PART and ERROR counts by ground-truth stratum.
Report missed defects and false rejections with numerators and denominators.
Report decision coverage and unresolved outcomes beside those rates.
An ERROR is not proof that a defect was detected. Do not describe low escape rates alone as high accuracy.
The current scoring tool uses images as units and does not compute grouped confidence intervals.
Implement physical-part-aware uncertainty before making population-level statistical claims.
Do not count correlated views as separate independent physical components.
If test results trigger changes, retire that set into development and collect a new final test.

Adaptive recapture is optional after the core demo works. Compare one photo, always two,
and conditional recapture on the same part groups with matched maximum views and time budgets.
Measure acquisition time and operator effort. Do not claim improvements without new multiview data.

## 5. AWS through the owner's local session

The remote assistant could not open the AWS console. Nothing has been deployed there.
Use the owner's existing local browser session. Google identity alone does not establish
an AWS account or federation. Follow the actual AWS authentication flow.
If login, MFA, account creation or payment verification requires the owner, hand off that step.
Never request passwords, tokens or card information in chat, logs or repository files.

Read current official Free Tier terms and inspect actual account plan, credit balance,
expiration, region and service eligibility before creating resources.
Do not assume t4g.small is universally free or that account creation guarantees free service.
Do not upgrade the account, activate paid services or change payment methods automatically.
If zero-cost eligibility cannot be established, prepare an estimate and stop resource creation.
Local demonstration and deployment templates can still be completed.

Inspect the existing CloudFormation and deployment workflow. Build models locally.
Verify ARM64 compatibility and memory consumption before using t4g.small.
CPU credits must stay standard. Measure cold start and sustained performance.
Avoid adding GPUs, NAT gateways, load balancers or managed databases without a demonstrated need.
Account for storage, public IPv4, logs, transfer and retained resources in the cost review.
Configure available budget alerts, remembering alerts are not a hard spending cap.
Create a change set and inspect the exact resources before execution.
Deploy only within the owner's authorized no-charge scope and verified account constraints.
Record health checks, actual URL, region, runtime diagnostics and cleanup commands.
If no deployment occurs, say NOT DEPLOYED. Do not fabricate a URL or performance measurement.

## Required final delivery

Provide a PR with focused changes, tests and their results, not a silent master push.
Provide the contact sheet and source manifest, a runnable local demo, actual evaluation files,
and a short demo script. Keep secrets, raw private images and withheld labels out of Git.
Create a compact submission draft following the live competition requirements.
Separate measured evidence, assumptions, and planned features throughout.
List unresolved owner-only actions precisely. Finish every task that does not depend on them.

## Handoff verification status

The preparation environment passed seven frozen-protocol tests and four scoring tests.
Python syntax compilation and git diff whitespace checks passed.
The full backend suite terminated with a native Bus error while importing cv2.
The new inference integration test and photo contact-sheet generation therefore remain unverified here.
Reproduce the import in a subprocess locally and report Python, OS, architecture and wheel versions.
Do not hide this failure or claim that all backend tests passed.
The full VisA archive was not downloaded during this handoff. Download and inspect it locally.
No fresh physical images, independent results or AWS deployment were produced by this package.

## Local execution results (2026-10-16)

Run by the local agent on `feat/local-agent-evaluation-kit`; details and raw outputs in
`evaluation/localRun-2026-10-16/README.md`. The section above is kept as the original handoff record.

| Handoff item | Result |
| --- | --- |
| 1. Lockfile install | Resolved on clean Python 3.11.15 and 3.12.13 venvs (macOS 26.6.2 arm64); `pip check` clean |
| 1. cv2 Bus error | Not reproduced: subprocess import exits 0 (OpenCV 5.0.0, NumPy 2.4.6, wheel `opencv-python-headless` 5.0.0.93). Handoff platform unknown; linux/amd64 probe NOT RUN (Docker Desktop unavailable) |
| 1. Test suites | backend 75 passed / 0 skipped; root frozen-protocol 7 passed (both Python versions); frontend 11 passed |
| 1. Public photos | Archive SHA-256 verified; contact sheet and `photo_sources.json` in `artifacts/public-photos-001/` (now records each photo's prior development use) |
| 2. Model restore | Artifacts present and checksum-verified; clean rebuild reproduced all checksums and all 153 test decisions (`reproducibility.json`) |
| 2. Real demo | Authenticated local API; PASS, FAIL, REVIEW, RETAKE, NO_PART, and ERROR all observed from real inference, including one missed defect (`artifacts/local-demo-001/`) |
| 2. Latency | Model step median 96.7 ms; client round trip median 165.9 ms (Apple M2, battery, single worker) |
| 3. Prospective evidence | **NOT RUN** — no physical parts, photos, custodian, or reviewer available to the agent. Tooling and procedure added: `prospectiveCollection.py`, `docs/PROSPECTIVE_COLLECTION.md` |
| 4. Freeze/predict/score | Seal → real-pipeline predict → verify → score passes on synthetic fixtures only; no real sealed run exists. VisA lacks part IDs, so legacy data cannot be sealed |
| 5. AWS | **NOT DEPLOYED**; account eligibility NOT CHECKED (Claude in Chrome not connected; no CLI/credentials). Owner steps in `docs/AWS_FREE_PLAN.md` |
| Submission | Draft only: `docs/SUBMISSION_DRAFT.md`; nothing submitted |
