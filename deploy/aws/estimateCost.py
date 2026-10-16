"""Itemized cost estimate for the MotionQA stack (deploy/aws/motionQaStack.yaml) over a date window.

    python3 deploy/aws/estimateCost.py --region us-east-1 --start 2026-10-17T00:00+07:00 --end 2026-11-11T00:00+07:00

Unit prices are pinned from AWS's public price files (fetched 2026-10-16; publication dates below). On the Free plan every
charge is drawn from credits; nothing here is a bill or a quote. Usage figures are assumptions; change them with flags.
"""
import argparse
from datetime import datetime

hoursPerMonth = 730
# Source per item: EC2/EBS price maps b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2 (published 2026-10-15T19:13Z);
# Price List API offers (pricing.us-east-1.amazonaws.com): AmazonVPC 2026-09-17, AmazonS3 2026-10-15,
# AmazonCloudWatch 2026-10-07, AWSSecretsManager 2026-09-11, AmazonCloudFront 2026-10-03.
prices = {
    "us-east-1": {"ec2": 0.0168, "ebsGbMonth": 0.08, "ipv4Hour": 0.005, "s3GbMonth": 0.023, "s3Put": 0.005 / 1000,
                  "s3Get": 0.0004 / 1000, "logsIngestGb": 0.50, "logsStoreGbMonth": 0.03, "secretMonth": 0.40,
                  "secretCall": 0.05 / 10000},
    "ap-southeast-1": {"ec2": 0.0212, "ebsGbMonth": 0.096, "ipv4Hour": 0.005, "s3GbMonth": 0.025, "s3Put": 0.005 / 1000,
                       "s3Get": 0.0004 / 1000, "logsIngestGb": 0.70, "logsStoreGbMonth": 0.03, "secretMonth": 0.40,
                       "secretCall": 0.05 / 10000},
    "ap-southeast-3": {"ec2": 0.0212, "ebsGbMonth": 0.096, "ipv4Hour": 0.005, "s3GbMonth": 0.025, "s3Put": 0.005 / 1000,
                       "s3Get": 0.0004 / 1000, "logsIngestGb": 0.70, "logsStoreGbMonth": 0.03, "secretMonth": 0.40,
                       "secretCall": 0.05 / 10000},
}
# CloudFront PriceClass_100 serves from North America and Europe edges (first 10 TB tier).
cloudFrontGb, cloudFrontHttpsRequest = 0.085, 0.01 / 10000


def estimate(args) -> list[tuple[str, str, float]]:
    # AI Assisted Logic
    p = prices[args.region]
    hours = (datetime.fromisoformat(args.end) - datetime.fromisoformat(args.start)).total_seconds() / 3600
    months = hours / hoursPerMonth
    evidenceGb = args.inspections * args.evidence_mb / 1024
    releaseGb = args.releases * (args.release_mb + args.model_mb) / 1024
    storedGbMonths = (evidenceGb / 2 + releaseGb) * months  # evidence grows roughly linearly over the window
    s3Puts = args.inspections * 2 + args.releases * 4
    s3Gets = args.inspections * args.evidence_views + args.releases * 4
    return [
        ("EC2 t4g.small (on-demand, standard credits)", f"{hours:.0f} h × ${p['ec2']}", hours * p["ec2"]),
        ("EBS gp3 root volume", f"{args.ebs_gb} GB × {months:.2f} mo × ${p['ebsGbMonth']}", args.ebs_gb * months * p["ebsGbMonth"]),
        ("Public IPv4 (instance, CloudFront origin)", f"{hours:.0f} h × ${p['ipv4Hour']}", hours * p["ipv4Hour"]),
        ("S3 storage (evidence, releases, models)", f"{storedGbMonths:.2f} GB-mo × ${p['s3GbMonth']}", storedGbMonths * p["s3GbMonth"]),
        ("S3 requests", f"{s3Puts} PUT, {s3Gets} GET", s3Puts * p["s3Put"] + s3Gets * p["s3Get"]),
        ("Secrets Manager (2 secrets)", f"2 × {months:.2f} mo × ${p['secretMonth']} + calls", 2 * months * p["secretMonth"] + args.releases * 4 * p["secretCall"]),
        ("CloudWatch Logs", f"{args.log_gb} GB ingest + storage", args.log_gb * p["logsIngestGb"] + args.log_gb * months * p["logsStoreGbMonth"]),
        ("CloudFront data out", f"{args.cloudfront_gb} GB × ${cloudFrontGb}", args.cloudfront_gb * cloudFrontGb),
        ("CloudFront HTTPS requests", f"{args.cloudfront_requests} × ${cloudFrontHttpsRequest:.6f}", args.cloudfront_requests * cloudFrontHttpsRequest),
        # AWSDataTransfer offer (2026-09-16): region→CloudFront $0.00/GB, internet→region $0.00/GB. Same-region S3↔EC2
        # is free per S3 pricing (not re-checked); at ~3 GB it would stay under $0.05 even if charged.
        ("Data transfer EC2→CloudFront, internet→EC2, S3↔EC2 same region", "$0.00/GB", 0.0),
        ("CloudFormation, IAM, SSM Session Manager/Run Command, EBS/S3 default encryption", "no charge", 0.0),
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", choices=sorted(prices), default="us-east-1")
    parser.add_argument("--start", default="2026-10-17T00:00+07:00")
    parser.add_argument("--end", default="2026-11-11T00:00+07:00", help="teardown time (default: end of 10 Nov, WIB)")
    parser.add_argument("--inspections", type=int, default=3000, help="development, smoke tests, demo and judging together")
    parser.add_argument("--evidence-mb", type=float, default=0.75, help="measured 763 KiB per inspection (two JPEGs)")
    parser.add_argument("--evidence-views", type=float, default=1.0)
    parser.add_argument("--releases", type=int, default=10)
    parser.add_argument("--release-mb", type=float, default=1.5, help="git archive of HEAD, measured 1.55 MB")
    parser.add_argument("--model-mb", type=float, default=10.7, help="featureExtractor.onnx + memoryBank.npz + profile")
    parser.add_argument("--ebs-gb", type=int, default=30)
    parser.add_argument("--log-gb", type=float, default=1.0)
    parser.add_argument("--cloudfront-gb", type=float, default=5.0)
    parser.add_argument("--cloudfront-requests", type=int, default=200000)
    parser.add_argument("--credits", type=float, default=195.10)
    parser.add_argument("--budget", type=float, default=25.0, help="share of credits set aside for MotionQA")
    args = parser.parse_args()
    rows = estimate(args)
    total = sum(cost for _, _, cost in rows)
    width = max(len(name) for name, _, _ in rows)
    print(f"Region {args.region}, {args.start} → {args.end}")
    for name, basis, cost in rows:
        print(f"  {name:<{width}}  ${cost:7.2f}   {basis}")
    print(f"  {'TOTAL (all items charged)':<{width}}  ${total:7.2f}")
    ec2 = rows[0][2]
    print(f"  {'If the t4g.small free trial applies':<{width}}  ${total - ec2:7.2f}   (not confirmed for Free plan accounts)")
    print(f"  Share of the MotionQA budget ${args.budget:.2f}: {100 * total / args.budget:.0f} %; of all credits ${args.credits:.2f}: {100 * total / args.credits:.1f} %")


if __name__ == "__main__":
    main()
