"""Optional YOLO-style ONNX defect detector (requires a custom trained model; none ships with MotionQA).

The default inspection path is the normal-only anomaly scorer in motionQa.inspection. This detector is kept
for a future supervised model. Its decision rule never treats "no detections" as PASS on its own.
"""
import asyncio
from dataclasses import dataclass
import numpy as np
from ..defectEnums import DefectType, InspectionDecision
from ..inspection.featureExtractor import ModelOutputError
from ..inspectionSchemas import BoundingBox


@dataclass(frozen=True)
class DetectionResult:
    decision: InspectionDecision
    reasonCode: str
    defectFound: DefectType
    confidenceScore: float
    boundingBox: BoundingBox | None
    detectionCount: int


def decideFromDetections(
    detections: list[tuple[DefectType, float, BoundingBox]],
    failConfidence: float,
    isPartPresent: bool,
    isDetectorValidated: bool,
) -> tuple[InspectionDecision, str]:
    """Absent detections only support PASS when the part is verified present and the detector has validated recall."""
    # AI Assisted Logic
    if not isPartPresent:
        return InspectionDecision.noPart, "PART_NOT_VERIFIED"
    if any(confidence >= failConfidence for _, confidence, _ in detections):
        return InspectionDecision.failed, "DETECTION_AT_OR_ABOVE_FAIL_CONFIDENCE"
    if detections:
        return InspectionDecision.review, "LOW_CONFIDENCE_DETECTION"
    if not isDetectorValidated:
        return InspectionDecision.review, "DETECTOR_NOT_VALIDATED"
    return InspectionDecision.passed, "NO_DETECTIONS_VALIDATED_DETECTOR"


@dataclass(frozen=True)
class LetterboxResult:
    image: np.ndarray
    scale: float
    padX: int
    padY: int
    originalWidth: int
    originalHeight: int


class OnnxYoloInferenceEngine:
    def __init__(
        self,
        modelPath: str,
        inputName: str = "images",
        confidenceThreshold: float = 0.25,
        failConfidence: float = 0.45,
        iouThreshold: float = 0.45,
        isDetectorValidated: bool = False,
        defectLabels: tuple[DefectType, ...] = (
            DefectType.castingDefect,
            DefectType.scratch,
            DefectType.dimensionalDeviation,
        ),
    ):
        # AI Assisted Logic
        import onnxruntime as ort

        providers = self.selectProviders(ort)
        self.session = ort.InferenceSession(modelPath, providers=providers)
        self.inputName = inputName
        self.confidenceThreshold = confidenceThreshold
        self.failConfidence = failConfidence
        self.iouThreshold = iouThreshold
        self.isDetectorValidated = isDetectorValidated
        self.defectLabels = defectLabels

    async def predict(self, frame: np.ndarray, isPartPresent: bool) -> DetectionResult:
        return await asyncio.to_thread(self.predictSync, frame, isPartPresent)

    def predictSync(self, frame: np.ndarray, isPartPresent: bool) -> DetectionResult:
        letterboxResult = self.preprocessFrame(frame)
        outputs = self.session.run(None, {self.inputName: letterboxResult.image})
        if not outputs:
            raise ModelOutputError("Detector returned no outputs")
        detections = self.decodeDetections(outputs[0], letterboxResult)
        decision, reasonCode = decideFromDetections(detections, self.failConfidence, isPartPresent, self.isDetectorValidated)
        if not detections:
            return DetectionResult(decision, reasonCode, DefectType.none, 0.0, None, 0)
        defectFound, confidenceScore, boundingBox = max(detections, key=lambda item: item[1])
        reportedDefect = defectFound if decision == InspectionDecision.failed else DefectType.none
        return DetectionResult(decision, reasonCode, reportedDefect, round(confidenceScore, 3), boundingBox, len(detections))

    def preprocessFrame(self, frame: np.ndarray, targetSize: tuple[int, int] = (640, 640)) -> LetterboxResult:
        import cv2

        originalHeight, originalWidth = frame.shape[:2]
        targetWidth, targetHeight = targetSize
        scale = min(targetWidth / originalWidth, targetHeight / originalHeight)
        resizedWidth = int(round(originalWidth * scale))
        resizedHeight = int(round(originalHeight * scale))
        resizedFrame = cv2.resize(frame, (resizedWidth, resizedHeight), interpolation=cv2.INTER_LINEAR)
        padX = (targetWidth - resizedWidth) // 2
        padY = (targetHeight - resizedHeight) // 2
        paddedFrame = cv2.copyMakeBorder(
            resizedFrame,
            padY,
            targetHeight - resizedHeight - padY,
            padX,
            targetWidth - resizedWidth - padX,
            cv2.BORDER_CONSTANT,
            value=(114, 114, 114),
        )
        rgbFrame = cv2.cvtColor(paddedFrame, cv2.COLOR_BGR2RGB)
        normalizedFrame = rgbFrame.astype(np.float32) / 255.0
        tensorFrame = np.transpose(normalizedFrame, (2, 0, 1))[None, :, :, :]
        return LetterboxResult(np.ascontiguousarray(tensorFrame), scale, padX, padY, originalWidth, originalHeight)

    def decodeDetections(self, output: np.ndarray, letterboxResult: LetterboxResult) -> list[tuple[DefectType, float, BoundingBox]]:
        predictionRows = self.normalizeOutput(output)
        boxes: list[tuple[DefectType, float, BoundingBox]] = []
        for row in predictionRows:
            classScores = row[4 : 4 + len(self.defectLabels)]
            if classScores.size == 0:
                continue
            classIndex = int(np.argmax(classScores))
            confidenceScore = float(classScores[classIndex])
            if confidenceScore < self.confidenceThreshold:
                continue
            boundingBox = self.convertBox(row[:4], letterboxResult)
            boxes.append((self.defectLabels[classIndex], confidenceScore, boundingBox))
        return self.applyNms(boxes)

    def normalizeOutput(self, output: np.ndarray) -> np.ndarray:
        outputArray = np.squeeze(np.asarray(output))
        if outputArray.ndim != 2:
            raise ModelOutputError(f"Detector output must be 2D after squeeze, received shape {np.shape(output)}")
        expectedColumns = 4 + len(self.defectLabels)
        if outputArray.shape[0] == expectedColumns and outputArray.shape[1] != expectedColumns:
            outputArray = outputArray.T
        if outputArray.shape[1] != expectedColumns:
            raise ModelOutputError(f"Detector output has {outputArray.shape[1]} columns; expected {expectedColumns} (4 box + {len(self.defectLabels)} classes)")
        if not np.isfinite(outputArray).all():
            raise ModelOutputError("Detector output contains NaN or infinite values")
        return outputArray.astype(np.float32)

    def convertBox(self, rawBox: np.ndarray, letterboxResult: LetterboxResult) -> BoundingBox:
        centerX, centerY, width, height = [float(value) for value in rawBox]
        xMin = (centerX - width / 2 - letterboxResult.padX) / letterboxResult.scale
        yMin = (centerY - height / 2 - letterboxResult.padY) / letterboxResult.scale
        xMax = (centerX + width / 2 - letterboxResult.padX) / letterboxResult.scale
        yMax = (centerY + height / 2 - letterboxResult.padY) / letterboxResult.scale
        return BoundingBox(
            xMin=max(0.0, min(xMin, float(letterboxResult.originalWidth))),
            yMin=max(0.0, min(yMin, float(letterboxResult.originalHeight))),
            xMax=max(0.0, min(xMax, float(letterboxResult.originalWidth))),
            yMax=max(0.0, min(yMax, float(letterboxResult.originalHeight))),
        )

    def applyNms(self, boxes: list[tuple[DefectType, float, BoundingBox]]) -> list[tuple[DefectType, float, BoundingBox]]:
        sortedBoxes = sorted(boxes, key=lambda item: item[1], reverse=True)
        selectedBoxes: list[tuple[DefectType, float, BoundingBox]] = []
        while sortedBoxes:
            currentBox = sortedBoxes.pop(0)
            selectedBoxes.append(currentBox)
            sortedBoxes = [candidateBox for candidateBox in sortedBoxes if self.calculateIou(currentBox[2], candidateBox[2]) < self.iouThreshold]
        return selectedBoxes

    def calculateIou(self, firstBox: BoundingBox, secondBox: BoundingBox) -> float:
        interXMin = max(firstBox.xMin, secondBox.xMin)
        interYMin = max(firstBox.yMin, secondBox.yMin)
        interXMax = min(firstBox.xMax, secondBox.xMax)
        interYMax = min(firstBox.yMax, secondBox.yMax)
        interArea = max(0.0, interXMax - interXMin) * max(0.0, interYMax - interYMin)
        firstArea = max(0.0, firstBox.xMax - firstBox.xMin) * max(0.0, firstBox.yMax - firstBox.yMin)
        secondArea = max(0.0, secondBox.xMax - secondBox.xMin) * max(0.0, secondBox.yMax - secondBox.yMin)
        unionArea = firstArea + secondArea - interArea
        return interArea / unionArea if unionArea > 0 else 0.0

    def selectProviders(self, ort) -> list[str]:
        availableProviders = ort.get_available_providers()
        if "CUDAExecutionProvider" in availableProviders:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        return ["CPUExecutionProvider"]

