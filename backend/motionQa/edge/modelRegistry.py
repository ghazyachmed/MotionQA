import argparse
import hashlib
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelReference:
    repoId: str
    filename: str
    task: str
    description: str
    license: str
    sha256: str | None = None
    revision: str = "main"

    @property
    def downloadUrl(self) -> str:
        return f"https://huggingface.co/{self.repoId}/resolve/{self.revision}/{self.filename}"


# Backbone used by the anomaly scorer. OpenCV Zoo, Apache-2.0, executed with cv.dnn.
featureBackbone = ModelReference(
    repoId="opencv/image_classification_mobilenet",
    filename="image_classification_mobilenetv2_2022apr.onnx",
    task="feature-extraction",
    description="MobileNetV2 ImageNet classifier from OpenCV Zoo; intermediate feature maps feed the anomaly scorer",
    license="Apache-2.0",
    sha256="c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5",
)

# Not used by the inspection pipeline. Part-type classifier trained on a private dataset; it does not detect defects.
componentClassifier = ModelReference(
    repoId="AswinG5/moto-parts-30cls",
    filename="motopartscls.pt",
    task="image-classification",
    description="YOLOv8n-cls motorcycle part-type classifier (30 classes, private training data, not a defect model)",
    license="MIT (model card); training data not published",
)


class ModelRegistry:
    def __init__(self, modelDir: Path = Path("models")):
        # AI Assisted Logic
        self.modelDir = modelDir
        self.featureBackbone = featureBackbone
        self.componentClassifier = componentClassifier

    def downloadVerified(self, reference: ModelReference) -> Path:
        self.modelDir.mkdir(parents=True, exist_ok=True)
        targetPath = self.modelDir / reference.filename
        if targetPath.exists() and verifySha256(targetPath, reference.sha256):
            return targetPath
        partialPath = targetPath.with_suffix(targetPath.suffix + ".part")
        with urllib.request.urlopen(reference.downloadUrl, timeout=60) as response, partialPath.open("wb") as handle:
            while chunk := response.read(1 << 20):
                handle.write(chunk)
        if not verifySha256(partialPath, reference.sha256):
            partialPath.unlink(missing_ok=True)
            raise RuntimeError(f"Checksum mismatch for {reference.filename}; refusing to install it")
        partialPath.replace(targetPath)
        return targetPath

    def downloadFeatureBackbone(self) -> Path:
        return self.downloadVerified(self.featureBackbone)

    def downloadComponentClassifier(self) -> Path:
        from huggingface_hub import hf_hub_download

        self.modelDir.mkdir(parents=True, exist_ok=True)
        path = hf_hub_download(
            repo_id=self.componentClassifier.repoId,
            filename=self.componentClassifier.filename,
            local_dir=str(self.modelDir),
        )
        return Path(path)


def computeSha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def verifySha256(path: Path, expectedSha256: str | None) -> bool:
    if expectedSha256 is None:
        return False
    return computeSha256(path) == expectedSha256


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download model artifacts with checksum verification")
    parser.add_argument("--download-feature-backbone", action="store_true")
    parser.add_argument("--download-component-classifier", action="store_true")
    parser.add_argument("--model-dir", default="models")
    return parser.parse_args()


def main() -> None:
    args = parseArgs()
    registry = ModelRegistry(Path(args.model_dir))
    if args.download_feature_backbone:
        print(str(registry.downloadFeatureBackbone()))
    if args.download_component_classifier:
        print(str(registry.downloadComponentClassifier()))


if __name__ == "__main__":
    main()
