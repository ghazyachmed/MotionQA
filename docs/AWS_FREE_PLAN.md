# AWS credits and low-cost deployment

> Current plan, estimate and teardown: [AWS_DEPLOYMENT_PLAN.md](AWS_DEPLOYMENT_PLAN.md) (2026-10-16, third pass).

Checked 2026-10-15. No resources were provisioned in this review.

## Account decision

Eligible new customers receive USD 100 initially and can earn up to USD 100 more through eligible activities. The Free plan lasts up to six months or until credits expire/run out. Check your console's plan, available credits and expiry before provisioning. Existing accounts do not automatically receive a new-customer offer.

Free plan services are restricted. Do not upgrade merely because a template fails. Confirm EC2, CloudFormation, CloudFront, S3, Secrets Manager, SSM and CloudWatch availability for your account. A credit balance is not an unlimited free service. Paid-plan usage beyond credits can be billed. Budget notifications are alerts, not a hard spending cap.

The competition grant is a separate selection process; do not assume registration gives USD 150. Free Tier credits are explicitly permitted for eligible competition usage. AWS states Free plans cannot receive additional promotional credits: confirm account requirements before redeeming a competition grant or Activate offer.

## MotionQA configuration

The stack now defaults to t4g.small (ARM, 2 GiB), which AWS lists among eligible instance types for new Free Tier accounts. This is a cost-conscious starting point, NOT a verified memory/performance recommendation. The former default was t4g.medium. Confirm account eligibility and regional availability. If memory is insufficient, measure it before selecting a larger instance or changing the account plan.

Build the feature model and memory bank locally. Upload the artifacts; do not retrain in the small instance. The current release workflow builds application containers on EC2; monitor build memory as well as serving memory. Keep the existing CPU-only single-instance architecture. Do not add a GPU, NAT Gateway, managed database or load balancer for the demo without a demonstrated need.

Burstable instances use standard CPU credits in the template, avoiding unlimited-mode surplus CPU charges. Sustained workloads can be throttled after credits run out; measure latency under the intended workload.

## Before and after deployment

- Verify credits and plan in Billing. Select Basic Support for the prototype.
- Estimate EC2, public IPv4, EBS, S3, requests, Secrets Manager, CloudWatch and CloudFront in the official calculator. The previous USD 32/month figure is an unverified historical estimate, not a free-deployment promise.
- Set actual and forecast budget alerts. Check credit balance independently; credits can hide gross resource consumption.
- Run the documented smoke test, record the endpoint and measure cloud latency.
- Do **not** stop and restart the instance to save money: its public IPv4 address and DNS name change, and the CloudFront
  origin (fixed at stack creation) then points nowhere. Delete the stack and recreate it instead (see
  [AWS_DEPLOYMENT_PLAN.md](AWS_DEPLOYMENT_PLAN.md)). EBS and retained storage incur charges regardless.
- Preserve availability during judging, or arrange the permitted live demonstration explicitly.
- After judging, back up needed evidence and delete the stack. Its S3 bucket is retained; inspect and delete that bucket separately when no longer needed. Check Billing for remaining resources.

No paid resource creation, account upgrade or Marketplace subscription was performed. COOL is optional for the overall award. Graviton alone does not establish COOL usage.

## Official sources

- https://aws.amazon.com/free/
- https://aws.amazon.com/free/free-tier-faqs/
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-standard-mode.html
- https://calculator.aws/
- https://opencv26.devpost.com/

## Account eligibility check — 2026-10-16: NOT CHECKED (owner action required)

The local agent could not read the owner's AWS account:

- Claude in Chrome reported no connected browser, so the owner's logged-in console session was not reachable.
- This machine has no AWS CLI, no `~/.aws` configuration, and no `AWS_*` environment variables.

Nothing was created, upgraded, or changed. **AWS: NOT DEPLOYED.**

Official terms re-read on 2026-10-16 (public pages, no login):

- Free plan and Free Tier credits are for new AWS customers only; an existing or previous account is not eligible.
  USD 100 at sign-up plus up to USD 100 for activities (https://aws.amazon.com/free/free-tier-faqs/).
- The Free plan ends after 6 months or when credits run out, whichever is first, and cannot be extended. When it ends the
  account is suspended; data is kept for 90 days unless the account is upgraded. Upgrading is manual and irreversible.
- Free plan accounts cannot receive other promotional credits.
- EC2 instance types marked Free Tier eligible depend on account creation date: before 15 Jul 2025 → `t2.micro`,
  `t3.micro` (12-month usage limits); on or after 15 Jul 2025 → `t3.micro`, `t3.small`, `t4g.micro`, **`t4g.small`**,
  `c7i-flex.large`, `m7i-flex.large` (credit-based)
  (https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html).
- Credit balance and days remaining appear in the Console Home "Cost and usage" widget and on the Billing → Credits page.

### Owner steps (read-only unless stated)

1. Sign in at https://console.aws.amazon.com/ yourself (password, MFA, and any verification stay with you).
2. Console Home → *Cost and usage* widget: note plan type (Free or Paid), credit balance, and days remaining.
3. Billing and Cost Management → *Credits*: note each credit's amount, expiry, and applicable services.
4. Account page: note the account creation date (on or after 2025-07-15 is needed for `t4g.small` Free Tier eligibility).
5. Pick one region. EC2 → *Launch instance* → instance type list: check that `t4g.small` shows "Free tier eligible".
   Close the wizard without launching.
6. Confirm that CloudFormation, EC2, S3, CloudFront, Secrets Manager, Systems Manager, and CloudWatch Logs are usable
   on the account's plan (the Free plan blocks some services).
7. Optional, owner decision: create a Budgets alert (actual and forecast) at a low amount. Alerts do not cap spending.
8. Either send these values to the agent, or connect Claude in Chrome (extension signed in with the same Claude account)
   so the agent can read the same pages. Never paste passwords, tokens, or card details into chat or files.

If zero-cost eligibility cannot be established from these values, do not deploy; use the live screen-share option for
judging instead.

## Deployment preparation with temporary credentials (2026-10-16, second pass)

Status re-checked: still no connected owner browser, AWS CLI, or credentials on the agent's machine.
**Account plan, credits, expiry, and service availability remain NOT CHECKED. AWS: NOT DEPLOYED.**

Prepared and validated locally (cfn-lint 1.57.2, no findings; scripts `bash -n` clean):

| File | Purpose |
| --- | --- |
| `deploy/aws/deployerAccess.yaml` | Admin deploys once: a permissions boundary for the EC2 role, a CloudFormation execution role limited to this stack's resources (EC2 launches only `t4g.small`), and the deployer policy `motionqa-deployer-policy`. No billing, plan, or payment permissions. Revised 2026-10-16, fourth pass — see AWS_DEPLOYMENT_PLAN.md § 7. |
| `deploy/aws/accountPreflight.sh` | Read-only: refuses root credentials, warns on non-temporary credentials, prints plan state (if the CLI supports `freetier get-account-plan-state`), Free Tier eligible instance types in the region, and budgets. |
| `deploy/aws/previewChangeSet.sh` | Creates a change set through the service role and prints every resource; **never executes it**. |
| `deploy/aws/dockerComposeT4gSmall.yml`, `deploy/aws/localT4gSmallCheck.sh` | Local Linux ARM64 emulation of a 2 GiB / 2 vCPU budget before deployment (results in `evaluation/localRun-2026-10-16b/t4gSmall/`). |

Owner sequence (each step stops before any charge-bearing action without your decision):

1. Sign in yourself; complete the read-only console checks listed above (plan, credits, expiry, account creation date).
2. As an administrator, deploy `deployerAccess.yaml` once and attach the `motionqa-deployer-policy` policy, plus
   `SignInLocalDevelopmentAccess`, to an IAM user with console password and MFA. Do not create access keys.
   **Correction (2026-10-16, third pass):** do not use IAM Identity Center permission sets on a Free plan account —
   they need AWS Organizations, and joining Organizations upgrades the account to the Paid plan.
3. `aws login --profile motionqa-deploy` (AWS CLI ≥ 2.32.0; browser sign-in as that IAM user; temporary credentials
   refreshed for up to 12 hours).
4. `AWS_REGION=<region> deploy/aws/accountPreflight.sh` — continue only if the plan, credits, and `t4g.small` eligibility support a no-charge or approved budget.
5. Optional, owner decision: create an actual and forecast budget alert (alerts are not caps).
6. `deploy/aws/localT4gSmallCheck.sh` results must show no OOM kills under the emulated limits.
7. `AWS_REGION=<region> deploy/aws/previewChangeSet.sh motionqa <service-role-arn>` → review every resource and its cost.
8. Only then, and only if you decide to: execute the printed change set, run `deploy/aws/publishRelease.sh`, and
   `deploy/smokeTest.sh`. Record the real endpoint, region, smoke output, and measured latency.

### Local Linux ARM64 emulation result (2026-10-16)

Docker Desktop linux/arm64 VM on the Apple M2, containers capped at API 1 GiB + 2 CPUs, Postgres 256 MiB, Redis 64 MiB,
nginx 64 MiB (≈ 1.4 GiB, leaving ≈ 0.6 GiB of a t4g.small for the OS, Docker and agents). **Emulation, not a t4g
measurement**; the instance's CPU-credit baseline is not emulated.

- Frontend build and backend lock-file install both succeed under a 1 GiB cap; OpenCV 5.0.0 imports on linux/arm64.
- 40 sequential + 20 four-way-concurrent inspections: all 201; peak API memory 556.5 MiB of 1 GiB; no OOM kills or
  restarts. Inference median 496 ms sequential (2 OpenCV threads), about 1.3–1.5 inspections/s in total.
- Through nginx: a recapture session works; a 15-request burst gets 11 × 201 and 4 × 429.

Implication for step 6: memory fits with margin. CPU is the constraint. In **standard** credit mode (the stack's
setting), sustained load above the t4g.small baseline throttles the instance instead of adding charges; do not switch to
unlimited mode without a budget decision. Details: `evaluation/localRun-2026-10-16b/README.md` § 6.
