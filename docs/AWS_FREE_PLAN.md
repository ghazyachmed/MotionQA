# AWS credits and low-cost deployment

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
- Stop EC2 between development sessions if appropriate. EBS and retained storage can still incur charges. Resume and test before demonstrations.
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
