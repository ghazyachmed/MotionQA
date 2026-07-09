import argparse
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelReference:
    repoId: str
    filename: str
    task: str
    description: str


class ModelRegistry:
    def __init__(self, modelDir: Path = Path("models")):
        # AI Assisted Logic
        self.modelDir = modelDir
        self.componentClassifier = ModelReference(
            repoId="AswinG5/moto-parts-30cls",
            filename="motopartscls.pt",
            task="image-classification",
            description="YOLOv8n-cls motorcycle parts classifier",
        )

    def downloadComponentClassifier(self) -> Path:
        from huggingface_hub import hf_hub_download

        self.modelDir.mkdir(parents=True, exist_ok=True)
        path = hf_hub_download(
            repo_id=self.componentClassifier.repoId,
            filename=self.componentClassifier.filename,
            local_dir=str(self.modelDir),
        )
        return Path(path)


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-component-classifier", action="store_true")
    parser.add_argument("--model-dir", default="models")
    return parser.parse_args()


def main() -> None:
    args = parseArgs()
    registry = ModelRegistry(Path(args.model_dir))
    if args.download_component_classifier:
        path = registry.downloadComponentClassifier()
        print(str(path))


if __name__ == "__main__":
    main()

