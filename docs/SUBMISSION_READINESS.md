# Submission Readiness — OpenCV AI Competition 2026

> **Evaluation qualification (2026-10-15):** Existing VisA results are exploratory, not a fresh independent test. Capture gates changed after test inspection; official-test AUROC includes validation anomalies. Independent evaluation has NOT RUN. Follow [the prospective protocol](INDEPENDENT_EVALUATION.md).

**Status: not submission-ready.** The AWS requirement is unmet (deployment not executed), there is no working web endpoint,
and no video exists. Everything that can run locally has been implemented and verified locally, including the container
build and a docker compose smoke test.

**Update 2026-10-16:** requirements re-read (unchanged); local run evidence in `evaluation/localRun-2026-10-16/`;
submission text drafted in [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md). AWS account eligibility NOT CHECKED (owner steps in
[AWS_FREE_PLAN.md](AWS_FREE_PLAN.md)); AWS NOT DEPLOYED; prospective evaluation NOT RUN.

**Update 2026-10-16, second pass:** overview, rules and updates re-read (deadline and requirements unchanged). Added:
failure analysis and decision policy 2 ([FAILURE_ANALYSIS.md](FAILURE_ANALYSIS.md)), recapture sessions, owner-component
profile tooling, least-privilege deployer access, change-set preview, and a local linux/arm64 check under t4g.small-like
limits (no OOM; `evaluation/localRun-2026-10-16b/`). Still: AWS NOT CHECKED / NOT DEPLOYED, no endpoint, no video,
independent evaluation NOT RUN.

## Sources

| Source | URL | Accessed | Method |
| --- | --- | --- | --- |
| Competition overview | https://opencv26.devpost.com/ | 2026-10-15, 2026-10-16 (twice) | In-app browser (direct HTTP fetch returned 403) |
| Official rules | https://opencv26.devpost.com/rules | 2026-10-15, 2026-10-16 | In-app browser |
| Updates | https://opencv26.devpost.com/updates | 2026-10-16 | In-app browser; one post (grant notifications) |
| OpenCV releases | https://github.com/opencv/opencv/releases | 2026-10-15 | 5.0.0 listed as latest release (06 Jun 2026) |
| OpenCV Python wheels | https://pypi.org/pypi/opencv-python-headless/5.0.0.93/json | 2026-10-15 | Wheels uploaded 2026-07-02 for macOS arm64/x86_64, manylinux x86_64/aarch64, Windows |

Requirements below are paraphrased from those pages. Re-read the pages before submitting; organizers may change them.

## Deadline

The overview states final projects are due **26 October 2026, 11:59 p.m. Pacific Time**. The page header shows
"Oct 27, 2026 @ 1:45pm GMT+7", 14 minutes earlier than 11:59 p.m. PDT converted to GMT+7. Plan for the earlier time.
Judging runs 27 October – 9 November; winners are scheduled for 10 November.

## Requirement check

| Requirement (paraphrased) | Status | Evidence | Remaining work |
| --- | --- | --- | --- |
| OpenCV 5 used for substantive image or video analysis | **Met locally** | `opencv-python-headless==5.0.0.93`; `cv.dnn` new engine runs the feature model; OpenCV does localization, capture gates, preprocessing, anomaly maps, evidence (ARCHITECTURE.md). Runtime version recorded in results JSON; checked inside the Linux aarch64 container. | — |
| A meaningful component runs on AWS | **Not met** | Stack prepared (EC2 inference host, S3 evidence storage, Secrets Manager, CloudWatch, CloudFront); cfn-lint clean; deployer role and change-set preview prepared; linux/arm64 stack fits t4g.small-like memory limits in local emulation. | Owner account checks, then the sequence in AWS_FREE_PLAN.md; run `deploy/smokeTest.sh` against the CloudFront URL, record endpoint and measurements. |
| Technical report: problem, users, architecture, OpenCV 5 implementation, AWS deployment, evaluation, limitations, responsible use | **Partial** | README, ARCHITECTURE, EVALUATION, REVIEW_AND_CHANGES, responsible-use notes below. | Add the measured AWS deployment section after deployment; assemble the Devpost write-up from these docs. |
| Judge-accessible repository or archive | **Partial** | `github.com/ghazyachmed/MotionQA`; all work is on `master` (2026-10-16). | Confirm judges can access it (repository visibility or invitations). |
| Pinned dependencies; build, deployment, test instructions | **Met locally** | `pyproject.toml` exact pins, `requirements-runtime.lock`, `requirements-dev.lock`, `package-lock.json` + `npm ci`; README commands; both Docker images built and the compose stack smoke-tested locally. | Pin base images by digest if strict reproducibility is required. |
| Architecture diagram with OpenCV 5 and AWS components | **Met (design)** | Mermaid diagram in ARCHITECTURE.md; AWS part labelled "prepared, not deployed". | Update labels after deployment. |
| Working web endpoint or arranged live screen-share | **Not met** | Local run only. | Deploy, or arrange a live screen-share with organizers. |
| Video ≤ 5 minutes: team, working app, architecture, principal results | **Not met** | DEMO_SCRIPT.md. | Record. |
| Evaluation evidence including failures and limitations | **Met (benchmark, development data)** | EVALUATION.md, FAILURE_ANALYSIS.md, `evaluation/results/`. | Target-domain data and an independent test (INDEPENDENT_EVALUATION.md). |

Overall rubric (rules page): technical execution 30 %, innovation 20 %, real-world impact 20 %, user experience 10 %,
documentation and presentation 10 %, cloud delivery / reproducibility / responsible operation 10 %.

Special awards: **Best Use of COOL** requires the Cloud-Optimized OpenCV Library from AWS Marketplace executing the core
workload on Graviton — not used, so no eligibility is claimed. **Agentic Vision** requires vision results to change a later
agent plan, tool call, or action — MotionQA has no agent loop; the review queue is a human workflow. No eligibility is claimed.

## Responsible-use notes

- Decisions are framed as inspection support: `FAIL` and `REVIEW` require a person; the machine decision stays on record.
- When identity is uncertain, or retakes run out, the part goes to a person rather than being declared absent or failed.
- The model is evaluated on a public electronics benchmark only. Using it on other parts without new validation data would
  misrepresent its performance.
- Evidence images may show workers' hands or the workplace. Evidence is private (token-protected API, private bucket)
  and expires after a configurable retention period (default 30 days). There is no option yet to skip storing the input
  image while keeping the overlay.
- No personal data is processed by design; the RTSP path should point at a part station, not at people.
- Dataset and model licenses: VisA CC BY 4.0 (attribution in README), OpenCV Zoo MobileNetV2 Apache-2.0.

## AWS: exact remaining steps

Prerequisites: an AWS account the team is authorized to bill, AWS CLI v2 configured, the profile artifacts built locally
(`python -m motionQa.evaluation.runEvaluation`), changes committed (the release archive uses `git archive HEAD`).

```bash
export AWS_REGION=us-east-1          # any region with t4g instances
PL=$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
aws cloudformation deploy --stack-name motionqa --template-file deploy/aws/motionQaStack.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides VpcId=$VPC PublicSubnetId=$SUBNET CloudFrontOriginPrefixListId=$PL
deploy/aws/publishRelease.sh motionqa
TOKEN=$(aws secretsmanager get-secret-value --secret-id "$(aws cloudformation describe-stacks --stack-name motionqa --query "Stacks[0].Outputs[?OutputKey=='OperatorTokenSecretArn'].OutputValue" --output text)" --query SecretString --output text)
MOTIONQA_TOKEN=$TOKEN deploy/smokeTest.sh "$(aws cloudformation describe-stacks --stack-name motionqa --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" --output text)" data/visa/pcb1/Data/Images/Normal/0000.JPG
```

Then record in this file: the CloudFront URL, stack outputs, smoke-test output, CloudWatch log excerpt, and measured
latency from the instance. Delete the stack after judging if it is not needed (`aws cloudformation delete-stack`; the
bucket is retained and must be emptied and deleted separately).

## Historical cost estimate (not validated; do not use as a budget)

Use [AWS_FREE_PLAN.md](AWS_FREE_PLAN.md) and the official calculator before deployment.
The default is now t4g.small; the table below describes the former t4g.medium configuration.

Assumptions: us-east-1, on-demand, 730 h/month, 500 inspections/day, two ~250 KB JPEGs per inspection, 30-day evidence
retention, one dashboard open during working hours, no free-tier credits applied.

| Item | Unit price | Monthly |
| --- | --- | --- |
| EC2 t4g.medium | $0.0336/h (AWS public price map, published 2026-10-12) | $24.53 |
| Public IPv4 address | $0.005/h ¹ | $3.65 |
| EBS gp3 30 GB | $0.08/GB-month ¹ | $2.40 |
| S3 Standard, ~7.5 GB evidence steady state + requests | $0.023/GB-month ¹ | < $1 |
| Secrets Manager, 2 secrets | $0.40/secret-month ¹ | $0.80 |
| CloudWatch Logs, ~0.2 GB ingested | $0.50/GB ¹ | ~$0.10 |
| CloudFront, low traffic | free-tier allowance ¹ ² | ~$0 |
| **Total** | | **≈ $32/month** (≈ $19 with t4g.small at $0.0168/h) |

Jakarta (ap-southeast-3) and Singapore list t4g.medium at $0.0424/h (≈ $31/month for the instance alone), same price map.

¹ Secondary sources (2026 pricing guides), not checked against AWS pricing pages; verify in the AWS Pricing Calculator
before committing budget. ² CloudFront's free allowance depends on the account's plan.
