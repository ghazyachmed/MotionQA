# AWS deployment record — 2026-10-16

**Deployed.** Endpoint: **https://d4dqbqmvvujy7.cloudfront.net** (UI, `/api`, `/ws`; API and evidence need the operator
token from Secrets Manager). Region `us-east-1`, account on the AWS **Free plan** (credits drawn, no plan change).
Everything below was measured on AWS on 2026-10-16 (UTC) unless marked otherwise. Teardown is planned by 2026-11-11
(`deploy/aws/teardownStack.sh`).

## Access and preflight

| Item | Result |
| --- | --- |
| Identity | IAM user `motionqa-deployer` (MFA), temporary credentials via `aws login`; no access keys |
| Permissions | `motionqa-deployer-policy` only, from the access stack `motionqa-access` (`deploy/aws/deployerAccess.yaml`), created once by the owner as root |
| Plan (Free Tier API) | FREE, ACTIVE, US$195.10 before deployment, plan ends 2026-12-02 23:08 UTC |
| `t4g.small` | Free Tier eligible in us-east-1; offered in us-east-1a/b/c/d/f, **not 1e** |

## Stack `motionqa`

| Step | Time (UTC) | Result |
| --- | --- | --- |
| Change set preview | 16:35 | 11 resources, all Add; reviewed before execution |
| Execute | 16:39:29 | — |
| Cache policy, secrets, security group, log group, bucket | 16:39:32–16:39:45 | CREATE_COMPLETE |
| Instance role (with permissions boundary), instance profile | 16:40:04, 16:42:16 | CREATE_COMPLETE |
| EC2 instance (`t4g.small`, us-east-1a) | 16:42:30 | CREATE_COMPLETE |
| CloudFront distribution | 16:45:35 | CREATE_COMPLETE |
| Stack | 16:45:36 | **CREATE_COMPLETE** (6 min 7 s), every resource on the first attempt through the least-privilege execution role |

Instance at boot (via SSM): Docker 25.0.14, Docker Compose v5.5.1, 1,840 MiB RAM (290 MiB used by the OS and agents),
30 GB root volume.

## Release

| Attempt | Release | Result |
| --- | --- | --- |
| 1 | `934ef1a` | **Failed**: `compose build requires buildx 0.17.0 or later`. Amazon Linux 2023's docker package lacks it; the local Docker-in-Docker simulation had a current buildx, so it did not reveal this. |
| 2 | `a9acfa4` (`startStack.sh` installs buildx v0.37.2, checksum-verified) | **Success**: images built on the instance, four containers started, health check passed |

## Smoke test through CloudFront (`deploy/smokeTest.sh`)

health ok (postgres, redis, model) · model ready `visa-pcb1-patchcore-mnv2` 2026.10.16 on **OpenCV 5.0.0** ·
unauthenticated request 401 · `Normal/0011` → PASS (score 2.056, server 1,147 ms, first request) · idempotent retry 200 ·
evidence overlay (1404×1070 JPEG) served from S3 → **passed**.

## Twenty inspections through CloudFront (test-split images, 1 per 2.2 s)

| Measure | Result |
| --- | --- |
| HTTP | 20 × 201 |
| Decisions | 7 PASS, 3 REVIEW, 10 FAIL — **20/20 identical to the local evaluation** (`evaluation/results/visaPcb1Results.json`) |
| Inference (`t4g.small`, 2 vCPU) | median **450 ms** |
| Server total (decode → evidence stored in S3) | median **779 ms** |
| Round trip from the team's machine in Indonesia via CloudFront | median **2.66 s** (includes uploading ~250 KB; `PriceClass_100` serves from North America/Europe edges) |

These images are development data (see `docs/FAILURE_ANALYSIS.md`); the run checks that the cloud reproduces local
inference, not accuracy.

## Instance after the load (via SSM, 16:53 UTC)

| Measure | Result |
| --- | --- |
| Memory | 610 MiB used of 1,840; 1,034 MiB available |
| Containers | API 225 MiB, Postgres 59 MiB, Redis 8 MiB, nginx 6 MiB |
| OOM kills / restarts | none; API, Postgres, Redis healthy |
| Disk | 3.6 GB of 30 GB |

## Cost (estimate, not a bill)

`deploy/aws/estimateCost.py`: about US$16.91 for the instance, IPv4, volume, secrets, logs, S3 and CloudFront if the
stack runs until 2026-11-11; Billing shows usage with a delay. Optional, owner: free budget alerts in Billing → Budgets.
