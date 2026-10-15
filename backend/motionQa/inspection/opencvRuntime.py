import re
from dataclasses import asdict, dataclass

requiredMajorVersion = 5


class OpenCvVersionError(RuntimeError):
    """Installed OpenCV cannot run the inspection pipeline."""


@dataclass(frozen=True)
class OpenCvDiagnostics:
    version: str
    majorVersion: int
    isSupported: bool
    hasNewDnnEngine: bool
    cpuBaseline: str
    detail: str

    def toDict(self) -> dict[str, object]:
        return asdict(self)


def getOpenCvDiagnostics() -> OpenCvDiagnostics:
    # AI Assisted Logic
    try:
        import cv2 as cv
    except ImportError as error:
        return OpenCvDiagnostics("missing", 0, False, False, "", f"cv2 import failed: {error}. Install opencv-python-headless==5.0.0.93")
    version = cv.__version__
    majorVersion = int(version.split(".")[0])
    hasNewDnnEngine = hasattr(cv.dnn, "ENGINE_NEW")
    baselineMatch = re.search(r"Baseline:\s+(.+)", cv.getBuildInformation())
    isSupported = majorVersion >= requiredMajorVersion and hasNewDnnEngine
    detail = "ok" if isSupported else f"OpenCV {version} found; MotionQA requires OpenCV {requiredMajorVersion}.x with the new DNN engine"
    return OpenCvDiagnostics(version, majorVersion, isSupported, hasNewDnnEngine, baselineMatch.group(1).strip() if baselineMatch else "", detail)


def requireOpenCvFive() -> None:
    diagnostics = getOpenCvDiagnostics()
    if not diagnostics.isSupported:
        raise OpenCvVersionError(diagnostics.detail)


if __name__ == "__main__":
    import json

    print(json.dumps(getOpenCvDiagnostics().toDict(), indent=2))
