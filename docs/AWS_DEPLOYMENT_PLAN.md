# AWS deployment plan — MotionQA (prepared 2026-10-16; NOT DEPLOYED)

Nothing has been created in AWS. This plan is shown to the owner before any resource is created.

## 0. Status

| Item | Status |
| --- | --- |
| Account plan (owner, console, 2026-10-16) | **Free plan**, credits **US$195.10**, **49 days** left (plan ends about 2026-12-04). Do not upgrade. |
| Agent access | None: no AWS CLI, no `~/.aws`, no `AWS_*` variables; Claude in Chrome not connected. |
| Inventory of existing resources | **NOT RUN** (needs the owner's login, § 5) |
| Linux ARM64 and memory | Tested locally (§ 4); not an AWS measurement |
| Cost estimate to 10 Nov 2026 | § 3 |
| Teardown | `deploy/aws/teardownStack.sh` (§ 6) |

## 1. What the Free plan means here (official sources, read 2026-10-16)

- Usage on the Free plan is drawn from credits; the plan itself does not bill. The account **closes automatically**
  when credits run out or the plan period ends, and AWS deletes its resources after 90 days unless it is upgraded
  ([Choosing a plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)). MotionQA must
  therefore use a small, capped share of the credits; other work on the account needs the rest.
- The Free plan omits services that could deplete credits (examples given: Savings Plans, Reserved Instances, some
  Marketplace offers). The stack uses none of these. Joining **AWS Organizations** (also required by IAM Identity Center
  permission sets), Control Tower, or the Partner Network **upgrades the account to Paid automatically** — avoid them.
- `t4g.small` and gp3 volumes are Free Tier eligible for accounts created on or after 2025-07-15
  ([EC2 Free Tier](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html)); usage counts against
  credits.
- AWS also runs a `t4g.small` free trial (750 h/month, until 2026-12-31, "all existing and new customers"; surplus CPU
  credits still billed) ([T4g](https://aws.amazon.com/ec2/instance-types/t4/), [EC2 FAQ](https://aws.amazon.com/ec2/faqs/)).
  The plan page lists short-term trials as a Paid-plan feature, so whether the trial covers a **Free plan** account is
  **unconfirmed**. The estimate charges EC2 to credits and shows the trial as a best case only.
- Public IPv4: $0.005/h in use or idle; no free allowance is stated ([VPC pricing](https://aws.amazon.com/vpc/pricing/)).
- CloudWatch Logs free tier: 5 GB data per month (ingestion, storage, Insights) — not counted in the estimate.
- AWS Budgets without actions are free; email reports cost $0.01 each
  ([Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)).
- Which services the credits apply to is listed per credit on Billing → **Credits** ("Applicable products"); the owner
  should confirm EC2, S3, CloudFront, Secrets Manager and CloudWatch appear there.

## 2. Configuration that would be created (`deploy/aws/motionQaStack.yaml`, unchanged)

| Resource | Setting | Charged |
| --- | --- | --- |
| EC2 instance | `t4g.small` (2 vCPU, 2 GiB, Graviton), Amazon Linux 2023 arm64, **standard** CPU credits (no surplus charges), IMDSv2, no SSH (SSM only) | per hour |
| EBS root volume | gp3, 30 GB, encrypted | per GB-month |
| Public IPv4 | auto-assigned to the instance (CloudFront reaches the origin through it) | per hour |
| Security group | port 80 only from the CloudFront origin-facing prefix list; no SSH | no |
| S3 bucket | private, SSE-S3, TLS-only, evidence expires after 30 days, releases after 90; **retained** on stack deletion | per GB and request |
| Secrets Manager | operator token, database password | per secret-month |
| CloudWatch log group | `/motionqa/<stack>`, 14-day retention | per GB |
| IAM role and instance profile | S3 releases/models read, evidence read/write, 2 secrets, own log group, SSM core | no |
| CloudFront | HTTPS, `PriceClass_100`, API and WebSocket passed through uncached | per GB and request |

Operational rule: **do not stop/start the instance**. Its public address changes and the CloudFront origin, fixed at
creation, breaks. To pause, delete the stack (§ 6) and recreate it later.

Region: `us-east-1` is the cheapest (below). Singapore (`ap-southeast-1`) or Jakarta (`ap-southeast-3`) are closer to the
team but cost about US$3 more over the window; inference time on the instance (about 0.5 s) dominates either way.

## 3. Cost estimate, 2026-10-17 00:00 to 2026-11-11 00:00 WIB (600 h)

`python3 deploy/aws/estimateCost.py --region <region>`; unit prices from AWS's public price files fetched 2026-10-16
(EC2/EBS price maps published 2026-10-15; VPC 2026-09-17; S3 2026-10-15; CloudWatch 2026-10-07; Secrets Manager
2026-09-11; CloudFront 2026-10-03; Data Transfer 2026-09-16).

| Item | us-east-1 | ap-southeast-1 / -3 | Basis |
| --- | --- | --- | --- |
| EC2 `t4g.small` | $10.08 | $12.72 | 600 h × $0.0168 / $0.0212 |
| EBS gp3 30 GB | $1.97 | $2.37 | $0.08 / $0.096 per GB-month |
| Public IPv4 | $3.00 | $3.00 | 600 h × $0.005 |
| S3 storage and requests | $0.05 | $0.06 | 3,000 inspections × 763 KiB evidence, 10 releases |
| Secrets Manager | $0.66 | $0.66 | 2 × $0.40 per month |
| CloudWatch Logs | $0.52 | $0.72 | 1 GB ingested ($0.50 / $0.70 per GB) |
| CloudFront out and requests | $0.63 | $0.63 | 5 GB × $0.085, 200,000 HTTPS requests |
| Data transfer EC2→CloudFront, inbound | $0.00 | $0.00 | AWS Data Transfer price list |
| **Total, all charged** | **$16.91** | **$20.15** | 8.7 % / 10.3 % of US$195.10 |
| If the `t4g.small` trial applies | $6.83 | $7.43 | unconfirmed for the Free plan |

Usage assumptions are generous for a demo (3,000 inspections, 5 GB viewer traffic, 1 GB logs). The evidence size was
measured (763 KiB per inspection, two JPEGs); the release archive (1.55 MB) and model artifacts (10.7 MB) were measured.

**Proposed MotionQA envelope: US$25** (12.8 % of the credits). Optional free budget alerts (no actions): actual cost
US$10 and US$20, forecast US$25, with credits excluded from the budget so it tracks gross usage. Alerts do not cap
spending; the teardown date does.

## 4. Linux ARM64 and memory (local, before deployment)

Local simulation of the instance (`deploy/aws/localAwsHostCheck.sh`): linux/arm64 Docker-in-Docker capped at 1,700 MiB
and 2 CPUs, running the same build-and-start command as `startStack.sh`. Details:
[evaluation/localRun-2026-10-16c/README.md](../evaluation/localRun-2026-10-16c/README.md).

- **Deployment bug found and fixed**: the stack could not start on AWS. `startStack.sh` does not set `MOTIONQA_RTSP_URL`,
  and `dockerCompose.yml` required it even for the unused edge service. Now optional in compose; the edge processor
  still refuses to start without it.
- After the fix: build and start in 271 s, peak 477 MiB; 60 inspections through nginx at the deployed rate limits all
  succeeded (inference median 592 ms); serving peak 710 MiB of 1,700; no OOM kills or restarts; Docker uses about
  2.3 GB of disk.
- Earlier, with per-container caps (API 1 GiB): peak API memory 556.5 MiB under 4-way concurrency
  (`evaluation/localRun-2026-10-16b/`).

Conclusion: `t4g.small` has enough memory; a larger instance is not needed. CPU is the limit (about 1.5 inspections/s),
which is ample for a demo.

## 5. Owner login and inventory (no passwords, codes, or keys in chat)

1. Install AWS CLI v2 (≥ 2.32.0 for `aws login`): `brew install awscli` (Homebrew offers 2.38.1), then `aws --version`.
2. Console, signed in yourself: IAM → Users → **Create user** `motionqa-owner`, console access with your own password,
   then enable **MFA** for it. Attach `ReadOnlyAccess` and `SignInLocalDevelopmentAccess`. Create **no access keys**.
3. Terminal: `aws login --profile motionqa-readonly` (region `us-east-1`); sign in **as that IAM user** in the browser.
4. Inventory (read-only, nothing created): `AWS_PROFILE=motionqa-readonly deploy/aws/inventoryAccount.sh`. The agent
   can run this once the profile exists; the output stays in `deploy/aws/private/` (gitignored).
5. Read the plan state and credit lines it prints; resolve anything unexpected that is drawing credits.

## 6. Deployment and teardown sequence (each step waits for the owner's decision)

1. Console, as administrator: CloudFormation → Create stack → upload `deploy/aws/deployerAccess.yaml`. Attach the
   output policy `motionqa-deployer` to `motionqa-owner`. Then `aws login --profile motionqa-deploy`.
2. `AWS_REGION=<region> deploy/aws/accountPreflight.sh` (refuses root; prints plan and eligible types).
3. `AWS_REGION=<region> deploy/aws/previewChangeSet.sh motionqa <service-role-arn>` — prints every resource; **not executed**.
4. Owner approves → execute the printed change set → `deploy/aws/publishRelease.sh motionqa` → `deploy/smokeTest.sh`.
5. Record endpoint, region, smoke output and cloud latency in `docs/SUBMISSION_READINESS.md`.
6. **Teardown by 2026-11-11**: `AWS_REGION=<region> deploy/aws/teardownStack.sh motionqa <service-role-arn> [backup-dir]`.
   It lists everything, asks you to type the stack name, optionally backs up evidence, deletes the stack, empties and
   deletes the retained bucket, and checks for leftover instances, volumes, Elastic IPs, log group, CloudFront
   distribution and secrets. Console fallback: CloudFormation → delete stack; S3 → empty, then delete the bucket.
7. Next day: Billing → Bills and Credits; confirm usage stopped. Optionally delete the `deployerAccess` stack and the
   IAM user. Everything must be gone well before the plan ends (about 2026-12-04).
