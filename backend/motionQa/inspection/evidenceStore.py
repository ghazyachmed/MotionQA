import hashlib
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

safeKeyPattern = re.compile(r"^[A-Za-z0-9._:/-]+$")


class EvidenceStorageError(RuntimeError):
    """Evidence could not be written or read."""


@dataclass(frozen=True)
class StoredEvidence:
    uri: str
    sha256: str
    contentType: str


def buildEvidenceKey(inspectionId: str, kind: str, capturedAt: datetime, extension: str) -> str:
    key = f"{capturedAt.astimezone(timezone.utc):%Y/%m/%d}/{inspectionId}/{kind}.{extension}"
    if not safeKeyPattern.match(key) or ".." in key:
        raise EvidenceStorageError(f"Unsafe evidence key {key}")
    return key


class LocalEvidenceStore:
    """Evidence on local disk. URIs use the `local://` scheme and are served only through the authenticated API."""

    def __init__(self, rootDir: Path, retentionDays: int = 30):
        self.rootDir = rootDir.resolve()
        self.retentionDays = retentionDays

    def put(self, key: str, payload: bytes, contentType: str) -> StoredEvidence:
        targetPath = self.resolveKey(key)
        try:
            targetPath.parent.mkdir(parents=True, exist_ok=True)
            targetPath.write_bytes(payload)
        except OSError as error:
            raise EvidenceStorageError(f"Local evidence write failed: {error}") from error
        return StoredEvidence(uri=f"local://{key}", sha256=hashlib.sha256(payload).hexdigest(), contentType=contentType)

    def resolveKey(self, key: str) -> Path:
        targetPath = (self.rootDir / key).resolve()
        if self.rootDir not in targetPath.parents:
            raise EvidenceStorageError("Evidence key escapes the evidence root")
        return targetPath

    def localPath(self, uri: str) -> Path:
        if not uri.startswith("local://"):
            raise EvidenceStorageError("Not a local evidence URI")
        return self.resolveKey(uri.removeprefix("local://"))

    def read(self, uri: str) -> bytes:
        path = self.localPath(uri)
        if not path.is_file():
            raise EvidenceStorageError("Evidence expired or removed")
        return path.read_bytes()

    def purgeExpired(self, now: float | None = None) -> int:
        cutoff = (now or time.time()) - self.retentionDays * 86400
        removedCount = 0
        if not self.rootDir.exists():
            return 0
        for path in self.rootDir.rglob("*"):
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                removedCount += 1
        return removedCount


class S3EvidenceStore:
    """Evidence in a private S3 bucket (SSE enabled). Expiry is enforced by the bucket lifecycle rule."""

    def __init__(self, bucketName: str, keyPrefix: str = "evidence/", region: str | None = None, kmsKeyId: str | None = None):
        # AI Assisted Logic
        import boto3

        self.bucketName = bucketName
        self.keyPrefix = keyPrefix.rstrip("/") + "/"
        self.kmsKeyId = kmsKeyId
        self.client = boto3.client("s3", region_name=region)

    def put(self, key: str, payload: bytes, contentType: str) -> StoredEvidence:
        from botocore.exceptions import BotoCoreError, ClientError

        objectKey = self.keyPrefix + key
        encryption = {"ServerSideEncryption": "aws:kms", "SSEKMSKeyId": self.kmsKeyId} if self.kmsKeyId else {"ServerSideEncryption": "AES256"}
        try:
            self.client.put_object(Bucket=self.bucketName, Key=objectKey, Body=payload, ContentType=contentType, **encryption)
        except (BotoCoreError, ClientError) as error:
            raise EvidenceStorageError(f"S3 evidence write failed: {error}") from error
        return StoredEvidence(uri=f"s3://{self.bucketName}/{objectKey}", sha256=hashlib.sha256(payload).hexdigest(), contentType=contentType)

    def read(self, uri: str) -> bytes:
        """Streamed through the authenticated API, so the bucket needs no public access or CORS."""
        from botocore.exceptions import BotoCoreError, ClientError

        prefix = f"s3://{self.bucketName}/"
        if not uri.startswith(prefix):
            raise EvidenceStorageError("Evidence URI does not belong to the configured bucket")
        try:
            return self.client.get_object(Bucket=self.bucketName, Key=uri.removeprefix(prefix))["Body"].read()
        except (BotoCoreError, ClientError) as error:
            raise EvidenceStorageError(f"S3 evidence read failed: {error}") from error

    def purgeExpired(self, now: float | None = None) -> int:
        return 0
