from dataclasses import dataclass, field
from pathlib import Path
import numpy as np

# MobileNetV2 tensors at stride 8 (32 channels) and stride 16 (96 channels), taken from the OpenCV Zoo graph.
defaultOutputNames = ("365", "426")
defaultOutputChannels = (32, 96)
defaultOutputStrides = (8, 16)
imagenetMean = (0.485, 0.456, 0.406)
imagenetStd = (0.229, 0.224, 0.225)


class ModelUnavailableError(RuntimeError):
    """Model artifact is missing, unreadable, or fails checksum verification."""


class ModelOutputError(RuntimeError):
    """Model produced outputs that do not match the documented contract."""


@dataclass(frozen=True)
class FeatureModelSpec:
    modelPath: str
    sha256: str | None = None
    outputNames: tuple[str, ...] = defaultOutputNames
    outputChannels: tuple[int, ...] = defaultOutputChannels
    outputStrides: tuple[int, ...] = defaultOutputStrides
    inputSize: int = 320
    mean: tuple[float, float, float] = imagenetMean
    std: tuple[float, float, float] = imagenetStd
    extra: dict[str, object] = field(default_factory=dict)


def buildFeatureModel(backbonePath: Path, outputPath: Path, outputNames: tuple[str, ...] = defaultOutputNames) -> Path:
    """Cut the classifier at intermediate tensors and make the spatial input size dynamic.

    OpenCV 5's new DNN engine only returns declared graph outputs, so intermediate tensors
    must be promoted to graph outputs instead of requested by layer name at runtime.
    """
    # AI Assisted Logic
    import onnx
    from onnx import shape_inference, utils

    inferredModel = shape_inference.infer_shapes(onnx.load(str(backbonePath)))
    featureModel = utils.Extractor(inferredModel).extract_model(["input"], list(outputNames))
    del featureModel.graph.value_info[:]
    for graphOutput in featureModel.graph.output:
        outputDims = graphOutput.type.tensor_type.shape.dim
        for axisIndex, axisName in ((2, "h"), (3, "w")):
            outputDims[axisIndex].ClearField("dim_value")
            outputDims[axisIndex].dim_param = f"{graphOutput.name}_{axisName}"
    inputDims = featureModel.graph.input[0].type.tensor_type.shape.dim
    inputDims[0].ClearField("dim_param")
    inputDims[0].dim_value = 1
    for axisIndex, axisName in ((2, "height"), (3, "width")):
        inputDims[axisIndex].ClearField("dim_value")
        inputDims[axisIndex].dim_param = axisName
    featureModel.producer_name = "motionqa-feature-extractor"
    onnx.checker.check_model(featureModel)
    outputPath.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(featureModel, str(outputPath))
    return outputPath


class OpenCvFeatureExtractor:
    """Runs the feature model with cv.dnn (OpenCV 5 new engine, CPU)."""

    def __init__(self, spec: FeatureModelSpec):
        # AI Assisted Logic
        import cv2 as cv
        from ..edge.modelRegistry import computeSha256

        modelPath = Path(spec.modelPath)
        if not modelPath.is_file():
            raise ModelUnavailableError(f"Feature model not found at {modelPath}. Run: python -m motionQa.evaluation.runEvaluation --build-profile")
        if spec.sha256 and computeSha256(modelPath) != spec.sha256:
            raise ModelUnavailableError(f"Feature model checksum mismatch at {modelPath}; rebuild the inspection profile")
        try:
            self.net = cv.dnn.readNetFromONNX(str(modelPath), cv.dnn.ENGINE_NEW)
        except cv.error as error:
            raise ModelUnavailableError(f"OpenCV could not load {modelPath}: {str(error).splitlines()[-1][:200]}") from error
        self.spec = spec
        self.blobParams = cv.dnn.Image2BlobParams(
            scalefactor=tuple(1.0 / (255.0 * value) for value in spec.std) + (0.0,),
            size=(spec.inputSize, spec.inputSize),
            mean=tuple(255.0 * value for value in spec.mean) + (0.0,),
            swapRB=True,
            ddepth=cv.CV_32F,
        )

    def createBlob(self, imageBgr: np.ndarray) -> np.ndarray:
        import cv2 as cv

        return cv.dnn.blobFromImageWithParams(imageBgr, self.blobParams)

    def extract(self, imageBgr: np.ndarray) -> list[np.ndarray]:
        self.net.setInput(self.createBlob(imageBgr))
        outputs = self.net.forward(list(self.spec.outputNames))
        return self.validateOutputs(list(outputs))

    def validateOutputs(self, outputs: list[np.ndarray]) -> list[np.ndarray]:
        if len(outputs) != len(self.spec.outputNames):
            raise ModelOutputError(f"Expected {len(self.spec.outputNames)} outputs, received {len(outputs)}")
        for output, channels, stride in zip(outputs, self.spec.outputChannels, self.spec.outputStrides):
            expectedSide = int(np.ceil(self.spec.inputSize / stride))
            if output.ndim != 4 or output.shape[0] != 1 or output.shape[1] != channels:
                raise ModelOutputError(f"Unexpected output shape {output.shape}; expected (1, {channels}, H, W)")
            if output.shape[2] != expectedSide or output.shape[3] != expectedSide:
                raise ModelOutputError(f"Unexpected spatial size {output.shape[2:]}; expected {expectedSide}x{expectedSide}")
            if not np.isfinite(output).all():
                raise ModelOutputError("Model output contains NaN or infinite values")
        return outputs


def buildPatchEmbeddings(outputs: list[np.ndarray]) -> np.ndarray:
    """Locally aggregate both feature levels and stack them on the finer grid: (H, W, C)."""
    import cv2 as cv

    fineMap = np.ascontiguousarray(outputs[0][0].transpose(1, 2, 0))
    coarseMap = np.ascontiguousarray(outputs[1][0].transpose(1, 2, 0))
    fineMap = cv.blur(fineMap, (3, 3), borderType=cv.BORDER_REFLECT)
    coarseMap = cv.blur(coarseMap, (3, 3), borderType=cv.BORDER_REFLECT)
    coarseMap = cv.resize(coarseMap, (fineMap.shape[1], fineMap.shape[0]), interpolation=cv.INTER_LINEAR)
    return np.concatenate([fineMap, coarseMap], axis=2).astype(np.float32)
