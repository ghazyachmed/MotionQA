from dataclasses import dataclass
from pathlib import Path
import numpy as np
from .featureExtractor import ModelOutputError, OpenCvFeatureExtractor, buildPatchEmbeddings


@dataclass(frozen=True)
class AnomalyRegion:
    xMin: float
    yMin: float
    xMax: float
    yMax: float
    peakScore: float
    areaPixels: int


@dataclass(frozen=True)
class AnomalyScore:
    imageScore: float
    identityDistance: float
    anomalyMap: np.ndarray
    patchGridSize: tuple[int, int]


@dataclass
class MemoryBank:
    patchFeatures: np.ndarray
    globalFeatures: np.ndarray

    def __post_init__(self) -> None:
        self.patchFeatures = np.ascontiguousarray(self.patchFeatures, dtype=np.float32)
        self.globalFeatures = np.ascontiguousarray(self.globalFeatures, dtype=np.float32)
        self.patchNorms = np.einsum("ij,ij->i", self.patchFeatures, self.patchFeatures)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as handle:
            np.savez(handle, patchFeatures=self.patchFeatures, globalFeatures=self.globalFeatures)

    @classmethod
    def load(cls, path: Path) -> "MemoryBank":
        with np.load(path, allow_pickle=False) as archive:
            return cls(patchFeatures=archive["patchFeatures"], globalFeatures=archive["globalFeatures"])


def nearestDistances(queries: np.ndarray, bank: np.ndarray, bankNorms: np.ndarray, chunkSize: int = 4096) -> np.ndarray:
    # AI Assisted Logic
    queryNorms = np.einsum("ij,ij->i", queries, queries)
    minimumSquared = np.full(queries.shape[0], np.inf, dtype=np.float32)
    for start in range(0, bank.shape[0], chunkSize):
        bankChunk = bank[start : start + chunkSize]
        squared = queryNorms[:, None] + bankNorms[None, start : start + chunkSize] - 2.0 * (queries @ bankChunk.T)
        np.minimum(minimumSquared, squared.min(axis=1), out=minimumSquared)
    return np.sqrt(np.maximum(minimumSquared, 0.0))


def selectGreedyCoreset(features: np.ndarray, targetCount: int, projectionDim: int = 32, seed: int = 0) -> np.ndarray:
    """Approximate k-center selection (PatchCore) on a random projection of the features."""
    if features.shape[0] <= targetCount:
        return np.arange(features.shape[0])
    generator = np.random.default_rng(seed)
    projection = generator.standard_normal((features.shape[1], projectionDim)).astype(np.float32) / np.sqrt(projectionDim)
    projected = np.ascontiguousarray(features @ projection)
    projectedNorms = np.einsum("ij,ij->i", projected, projected)
    selected = np.empty(targetCount, dtype=np.int64)
    selected[0] = int(generator.integers(features.shape[0]))

    def squaredDistancesTo(index: int) -> np.ndarray:
        return projectedNorms - 2.0 * (projected @ projected[index]) + projectedNorms[index]

    minimumDistances = squaredDistancesTo(selected[0])
    for index in range(1, targetCount):
        nextIndex = int(np.argmax(minimumDistances))
        selected[index] = nextIndex
        np.minimum(minimumDistances, squaredDistancesTo(nextIndex), out=minimumDistances)
    return selected


def computeGlobalFeature(patchEmbeddings: np.ndarray, patchMask: np.ndarray | None) -> np.ndarray:
    flatEmbeddings = patchEmbeddings.reshape(-1, patchEmbeddings.shape[2])
    if patchMask is not None and patchMask.any():
        flatEmbeddings = flatEmbeddings[patchMask.reshape(-1)]
    globalFeature = flatEmbeddings.mean(axis=0)
    return globalFeature / max(float(np.linalg.norm(globalFeature)), 1e-6)


def resizeMaskToGrid(cropMask: np.ndarray, gridSize: tuple[int, int]) -> np.ndarray:
    import cv2 as cv

    return cv.resize(cropMask, (gridSize[1], gridSize[0]), interpolation=cv.INTER_AREA) > 127


class PatchCoreScorer:
    """Normal-only anomaly scorer: nearest-neighbour distance from each patch to a bank of normal patches."""

    def __init__(self, extractor: OpenCvFeatureExtractor, memoryBank: MemoryBank, smoothingSigma: float = 4.0):
        self.extractor = extractor
        self.memoryBank = memoryBank
        self.smoothingSigma = smoothingSigma

    def embed(self, cropImage: np.ndarray, cropMask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        patchEmbeddings = buildPatchEmbeddings(self.extractor.extract(cropImage))
        patchMask = resizeMaskToGrid(cropMask, patchEmbeddings.shape[:2])
        return patchEmbeddings, patchMask

    def score(self, cropImage: np.ndarray, cropMask: np.ndarray) -> AnomalyScore:
        # AI Assisted Logic
        import cv2 as cv

        patchEmbeddings, patchMask = self.embed(cropImage, cropMask)
        gridHeight, gridWidth = patchEmbeddings.shape[:2]
        distances = nearestDistances(patchEmbeddings.reshape(-1, patchEmbeddings.shape[2]), self.memoryBank.patchFeatures, self.memoryBank.patchNorms)
        patchScores = distances.reshape(gridHeight, gridWidth).astype(np.float32)
        anomalyMap = cv.resize(patchScores, (cropImage.shape[1], cropImage.shape[0]), interpolation=cv.INTER_LINEAR)
        anomalyMap = cv.GaussianBlur(anomalyMap, (0, 0), self.smoothingSigma)
        maskedMap = np.where(cropMask > 0, anomalyMap, 0.0)
        imageScore = float(maskedMap.max()) if (cropMask > 0).any() else float(anomalyMap.max())
        globalFeature = computeGlobalFeature(patchEmbeddings, patchMask)
        identityDistance = float(np.min(1.0 - self.memoryBank.globalFeatures @ globalFeature))
        if not np.isfinite(imageScore) or not np.isfinite(identityDistance):
            raise ModelOutputError("Anomaly score is not finite")
        return AnomalyScore(imageScore=imageScore, identityDistance=identityDistance, anomalyMap=maskedMap.astype(np.float32), patchGridSize=(gridHeight, gridWidth))


def extractAnomalyRegions(anomalyMap: np.ndarray, threshold: float, maxRegions: int = 5, minAreaPixels: int = 16) -> list[AnomalyRegion]:
    """Connected regions above threshold, in anomaly-map pixel coordinates."""
    import cv2 as cv

    regionMask = (anomalyMap >= threshold).astype(np.uint8)
    componentCount, labels, stats, _ = cv.connectedComponentsWithStats(regionMask, connectivity=8)
    regions: list[AnomalyRegion] = []
    for label in range(1, componentCount):
        x, y, width, height, area = (int(value) for value in stats[label])
        if area < minAreaPixels:
            continue
        peakScore = float(anomalyMap[labels == label].max())
        regions.append(AnomalyRegion(float(x), float(y), float(x + width), float(y + height), peakScore, area))
    return sorted(regions, key=lambda region: region.peakScore, reverse=True)[:maxRegions]
