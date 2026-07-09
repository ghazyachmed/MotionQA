import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ExportRequest:
    modelPath: Path
    outputDir: Path
    imageSize: int = 640
    opset: int = 12


class ModelExportPipeline:
    def __init__(self, request: ExportRequest):
        # AI Assisted Logic
        self.request = request

    async def exportOnnx(self) -> Path:
        self.request.outputDir.mkdir(parents=True, exist_ok=True)
        command = [
            "yolo",
            "export",
            f"model={self.request.modelPath}",
            "format=onnx",
            f"imgsz={self.request.imageSize}",
            f"opset={self.request.opset}",
            "simplify=True",
            "dynamic=False",
        ]
        process = await asyncio.create_subprocess_exec(*command)
        if await process.wait() != 0:
            raise RuntimeError("ONNX export failed")
        exportedPath = self.request.modelPath.with_suffix(".onnx")
        targetPath = self.request.outputDir / "yolov8AhmEdge.onnx"
        exportedPath.replace(targetPath)
        return targetPath


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--output-dir", default="models")
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--opset", type=int, default=12)
    return parser.parse_args()


async def mainAsync() -> None:
    args = parseArgs()
    request = ExportRequest(
        modelPath=Path(args.model_path),
        outputDir=Path(args.output_dir),
        imageSize=args.image_size,
        opset=args.opset,
    )
    path = await ModelExportPipeline(request).exportOnnx()
    print(str(path))


if __name__ == "__main__":
    asyncio.run(mainAsync())

