import io
import pytest
from motionQa.inspection.evidenceStore import EvidenceStorageError, S3EvidenceStore


class StubS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], dict] = {}

    def put_object(self, **kwargs):
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)]["Body"])}


def makeStore(kmsKeyId=None) -> tuple[S3EvidenceStore, StubS3Client]:
    # AI Assisted Logic
    store = S3EvidenceStore.__new__(S3EvidenceStore)
    store.bucketName = "motionqa-artifacts"
    store.keyPrefix = "evidence/"
    store.kmsKeyId = kmsKeyId
    store.client = StubS3Client()
    return store, store.client


def testPutUsesPrivatePrefixAndServerSideEncryption():
    store, client = makeStore()
    stored = store.put("2026/10/15/insp-1/overlay.jpg", b"jpeg-bytes", "image/jpeg")
    assert stored.uri == "s3://motionqa-artifacts/evidence/2026/10/15/insp-1/overlay.jpg"
    request = client.objects[("motionqa-artifacts", "evidence/2026/10/15/insp-1/overlay.jpg")]
    assert request["ServerSideEncryption"] == "AES256"
    assert request["ContentType"] == "image/jpeg"
    assert store.read(stored.uri) == b"jpeg-bytes"


def testKmsEncryptionWhenConfigured():
    store, client = makeStore(kmsKeyId="alias/motionqa")
    store.put("k.jpg", b"x", "image/jpeg")
    request = client.objects[("motionqa-artifacts", "evidence/k.jpg")]
    assert request["ServerSideEncryption"] == "aws:kms" and request["SSEKMSKeyId"] == "alias/motionqa"


def testReadRejectsForeignBucket():
    store, _ = makeStore()
    with pytest.raises(EvidenceStorageError):
        store.read("s3://someone-else/evidence/x.jpg")
