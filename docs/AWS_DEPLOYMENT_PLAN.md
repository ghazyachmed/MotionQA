# AWS deployment plan — MotionQA (prepared 2026-10-16; NOT DEPLOYED)

Nothing has been created in AWS. This plan is shown to the owner before any resource is created.

## 0. Status

| Item | Status |
| --- | --- |
| Account plan (Free Tier API via preflight, 2026-10-16) | **FREE, ACTIVE**, credits **US$195.10**, plan ends **2026-12-02 23:08 UTC** (2026-12-03 06:08 WIB). Do not upgrade. |
| Agent access | Profile `motionqa` (IAM user `motionqa-deployer`, `aws login`, MFA) with `motionqa-deployer-policy`; preflight passed (§ 5). |
| Inventory of existing resources | **NOT RUN** (needs the optional `ViewOnlyAccess`, § 7) |
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

## 2. Configuration that would be created (`deploy/aws/motionQaStack.yaml`)

| Resource | Setting | Charged |
| --- | --- | --- |
| EC2 instance | `t4g.small` only (2 vCPU, 2 GiB, Graviton), Amazon Linux 2023 arm64, **standard** CPU credits (no surplus charges), IMDSv2, no SSH (SSM only) | per hour |
| EBS root volume | gp3, 30 GB, encrypted | per GB-month |
| Public IPv4 | auto-assigned to the instance (CloudFront reaches the origin through it) | per hour |
| Security group | port 80 only from the CloudFront origin-facing prefix list; no SSH | no |
| S3 bucket | private, SSE-S3, TLS-only, evidence expires after 30 days, releases after 90; **retained** on stack deletion | per GB and request |
| Secrets Manager | `motionqa/operator-token`, `motionqa/database-password` | per secret-month |
| CloudWatch log group | `/motionqa/<stack>`, 14-day retention | per GB |
| IAM role and instance profile | S3 releases/models read, evidence read/write, 2 secrets, own log group, SSM core; capped by `motionqa-instance-boundary` | no |
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

## 5. Owner login (no passwords, codes, or keys in chat)

Done by the owner on 2026-10-16: AWS CLI 2.38.1 installed; IAM user **`motionqa-deployer`** with MFA; CLI profile
**`motionqa`** signed in with `aws login` (temporary credentials, region `us-east-1`, no access keys stored).
`aws sts get-caller-identity --profile motionqa` returned `arn:aws:iam::<account-id>:user/motionqa-deployer`. At first
every call was denied ("no identity-based policy allows"): the user's Permissions tab showed only
`IAMUserChangePassword` and `SignInLocalDevelopmentAccess`, because `motionqa-deployer-policy` did not exist yet (the
access stack had not been created successfully). After the owner created `motionqa-access` and attached the policy, the
preflight passed (2026-10-16):

| Check | Result |
| --- | --- |
| Caller | `arn:aws:iam::<account-id>:user/motionqa-deployer` (not root) |
| Plan | `FREE`, `ACTIVE`, US$195.10 remaining, expires 2026-12-02 23:08 UTC |
| `t4g.small` Free Tier eligible in us-east-1 | yes (eligible list: c7i-flex.large, m7i-flex.large, t3.micro, t3.small, t4g.micro, t4g.small, t8i.micro, t8i.small) |
| Budgets | none yet |
| `validate-template` | `motionQaStack.yaml` needs `CAPABILITY_IAM`, 8 parameters; `deployerAccess.yaml` needs `CAPABILITY_NAMED_IAM` |
| Default VPC and subnets | `vpc-05a5e0ecb525467c0`; six default subnets, all assign public IPv4 |
| `t4g.small` availability zones | us-east-1a, b, c, d, f — **not 1e**; `previewChangeSet.sh` now picks only a subnet in an offering zone (us-east-1a) |
| CloudFront origin-facing prefix list | `pl-3b927c52` |
| Amazon Linux 2023 arm64 AMI | `ami-0b2dad606b16e669c` |
| Existing `motionqa` stack | none before the preview |

Change set preview (2026-10-16 16:35 UTC, `deploy/aws/previewChangeSet.sh`, **not executed**): `preview-20261016T163551`,
status `CREATE_COMPLETE`, execution `AVAILABLE`; stack `motionqa` in `REVIEW_IN_PROGRESS`, bound to role
`motionqa-cloudformation-execution`; capability `CAPABILITY_IAM`. Eleven resources, all **Add**: EC2 instance, security
group, IAM role and instance profile, S3 bucket and bucket policy, two secrets, log group, CloudFront distribution and
cache policy. Inputs: `vpc-05a5e0ecb525467c0`, `subnet-0fc89b41677d24c4e` (us-east-1a), `pl-3b927c52`, `t4g.small`,
evidence 30 days, logs 14 days. Discarding it (`delete-change-set`, then deleting the empty stack) leaves nothing.

## 6. Deployment and teardown sequence (each step waits for the owner's decision)

1. Owner, as root, once: create the access stack and attach its policy (§ 7). Then sign out of root.
2. `AWS_PROFILE=motionqa AWS_REGION=us-east-1 deploy/aws/accountPreflight.sh` — refuses root; prints plan, credits,
   Free Tier eligible types, budgets.
3. Optional inventory with the temporary `ViewOnlyAccess` (§ 7): `AWS_PROFILE=motionqa deploy/aws/inventoryAccount.sh`.
4. `AWS_PROFILE=motionqa AWS_REGION=us-east-1 deploy/aws/previewChangeSet.sh motionqa <execution-role-arn>` — prints
   every resource; **not executed**.
5. Owner approves → execute the printed change set → `deploy/aws/publishRelease.sh motionqa` → `deploy/smokeTest.sh`.
6. Record endpoint, region, smoke output and cloud latency in `docs/SUBMISSION_READINESS.md`.
7. **Teardown by 2026-11-11** (not during preparation):
   `AWS_PROFILE=motionqa AWS_REGION=us-east-1 deploy/aws/teardownStack.sh motionqa <execution-role-arn> [backup-dir]`.
   It lists everything, asks you to type the stack name, optionally backs up evidence, deletes the stack through the
   execution role, empties and deletes the retained bucket, and checks for leftover instances, volumes, Elastic IPs,
   log group, CloudFront distribution and secrets. Console fallback: CloudFormation → delete stack; S3 → empty, then
   delete the bucket.
8. Next day: Billing → Bills and Credits; confirm usage stopped. Then delete the access stack `motionqa-access` and the
   IAM user. Everything must be gone well before the plan ends (2026-12-02 23:08 UTC).

## 7. Permissions

File: `deploy/aws/deployerAccess.yaml` (one CloudFormation template, three separate parts). Revised 2026-10-16 (fourth
pass) after checking it against the CloudFormation resource-handler permissions of every resource type in
`motionQaStack.yaml` (the schemas shipped with cfn-lint 1.57.2): the earlier version lacked the read-back permissions
CloudFormation needs after creating the bucket, role, log group, secret and distribution, so the first deployment would
most likely have failed; it also let a template write inline policies to any role named `motionqa-*`, including the
execution role itself, which is a privilege-escalation path.

| Part | Name in AWS | Used by | In plain words |
| --- | --- | --- | --- |
| Permissions boundary | `motionqa-instance-boundary` | the EC2 role CloudFormation creates | The most the server can ever do: read releases, models and evidence and write evidence in the MotionQA bucket, read the two MotionQA secrets, write to the MotionQA log group, and talk to the SSM agent. Nothing else, whatever a template says. |
| Execution role | `motionqa-cloudformation-execution` | CloudFormation only (trust policy) | What CloudFormation may do while building or deleting the `motionqa` stack: launch **only `t4g.small`**; create security groups and tags; stop, modify or terminate **only instances and security groups tagged `aws:cloudformation:stack-name = motionqa`**; create the server role **only with the boundary attached** and only the AWS SSM core managed policy; manage only the bucket `motionqa-*`, secrets `motionqa/*`, log group `/motionqa/motionqa*`; create/update/delete a CloudFront distribution and cache policy; read the public Amazon Linux AMI parameter. |
| Deployer policy | `motionqa-deployer-policy` | IAM user `motionqa-deployer` | What you may do: create, review, run and delete **change sets for the stack named exactly `motionqa`**, and only by handing the work to the execution role; validate templates; look up VPC, subnets and instance types; read plan state and budgets; upload releases and models into the MotionQA bucket; send the deploy command **only to the instance of that stack**; read **only the operator token** (for the smoke test); and, at teardown, empty and delete the MotionQA bucket. |

Not granted anywhere: AdministratorAccess, IAM users or policies, billing, payments, plan changes, AWS Organizations,
other stacks, other buckets, other secrets, other instances' termination or modification, access keys.

Where the services do not allow narrower scope (documented, not hidden):
- CloudFront distributions and cache policies get random ids at creation, so the execution role's CloudFront actions
  apply to the account's distributions. Only CloudFormation can use that role, and only for the `motionqa` stack.
- Security-group create, rule-authorize, and tag actions run before CloudFormation's tags exist, so they are scoped to
  the account, not the stack. None of them deletes anything; deletions and revocations of ingress are tag-scoped.
- Describe/List/Get lookups (EC2, CloudFront, log groups, change-command results) are account-wide reads.

Who creates what, once: the IAM user cannot grant itself permissions (by design). The **owner, signed in as root**
(the only administrator on this account), creates the access stack. CloudFormation then creates the boundary, the
execution role and the deployer policy. Root is used only for these console steps.

Console steps (owner, root, region N. Virginia):
1. CloudFormation → **Create stack** → *With new resources (standard)* → *Upload a template file* →
   `/Users/ghazy/Ghazy/MotionQA/deploy/aws/deployerAccess.yaml` → Next.
2. Stack name **`motionqa-access`**; parameter `AppStackName` = `motionqa` (default) → Next → leave options → Next.
3. Tick **"I acknowledge that AWS CloudFormation might create IAM resources with custom names"** → Submit. Wait for
   `CREATE_COMPLETE` (about a minute). Open **Outputs** and note `CloudFormationExecutionRoleArn`.
4. IAM → Users → `motionqa-deployer` → *Add permissions* → *Attach policies directly* → search
   **`motionqa-deployer-policy`** (Customer managed) → tick → Next → *Add permissions*. Keep
   `SignInLocalDevelopmentAccess` (needed for `aws login`).
5. Optional, for the one-time inventory only: also attach AWS managed **`ViewOnlyAccess`** (lists resources and
   metadata, cannot read object contents or secret values, cannot change anything). Detach it after the inventory.
6. Do **not** attach `AdministratorAccess`, `PowerUserAccess`, or `IAMFullAccess`. Do not create access keys.
7. Sign out of root. Tell the agent; it will run the preflight with `--profile motionqa`.

Validation done locally: `cfn-lint` 1.57.2 clean for both templates (it also rejects unknown IAM action names); every
read and delete handler permission is granted except two that apply only to features not used (log-group data
protection, secret replication); create-phase permissions that are not granted all belong to unused optional features
(S3 replication/CORS/website/versioning/S3 Tables, log delivery, SSM associations, volume attach, detailed
monitoring). Not yet exercised against AWS: the first real stack creation is the test, and a failure rolls back.
