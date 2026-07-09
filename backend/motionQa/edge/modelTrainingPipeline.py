import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TrainingRequest:
    datasetYamlPath: Path
    outputDir: Path
    baseModelPath: str = "yolov8n.pt"
    epochs: int = 50
    imageSize: int = 640
    device: str = "0"


class ModelTrainingPipeline:
    def __init__(self, request: TrainingRequest):
        # AI Assisted Logic
        self.request = request

    async def initiateTransferLearning(self) -> bool:
        command = [
            "yolo",
            "detect",
            "train",
            f"model={self.request.baseModelPath}",
            f"data={self.request.datasetYamlPath}",
            f"epochs={self.request.epochs}",
            f"imgsz={self.request.imageSize}",
            f"device={self.request.device}",
            f"project={self.request.outputDir}",
            "name=ahmDefectDetector",
            "exist_ok=True",
        ]
        process = await asyncio.create_subprocess_exec(*command)
        return await process.wait() == 0


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-yaml", required=True)
    parser.add_argument("--output-dir", default="runs/defectTraining")
    parser.add_argument("--base-model", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--device", default="0")
    return parser.parse_args()


async def mainAsync() -> None:
    args = parseArgs()
    request = TrainingRequest(
        datasetYamlPath=Path(args.dataset_yaml),
        outputDir=Path(args.output_dir),
        baseModelPath=args.base_model,
        epochs=args.epochs,
        imageSize=args.image_size,
        device=args.device,
    )
    isSuccessful = await ModelTrainingPipeline(request).initiateTransferLearning()
    raise SystemExit(0 if isSuccessful else 1)


if __name__ == "__main__":
    asyncio.run(mainAsync())

