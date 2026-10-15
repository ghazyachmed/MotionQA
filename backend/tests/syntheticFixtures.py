"""Synthetic images for software-behaviour tests only. They carry no information about model accuracy."""
import numpy as np


def createPartImage(seed: int = 0, width: int = 640, height: int = 480, defect: bool = False, background: int = 30) -> np.ndarray:
    import cv2 as cv

    generator = np.random.default_rng(seed)
    image = np.full((height, width, 3), background, dtype=np.uint8)
    center = (width // 2 + int(generator.integers(-6, 7)), height // 2 + int(generator.integers(-6, 7)))
    cv.ellipse(image, center, (int(width * 0.3), int(height * 0.28)), 0, 0, 360, (150, 160, 170), cv.FILLED)
    for index in range(6):
        cv.circle(image, (center[0] - 120 + index * 48, center[1] - 40), 10, (60, 60, 60), cv.FILLED)
    cv.line(image, (center[0] - 140, center[1] + 50), (center[0] + 140, center[1] + 50), (220, 220, 220), 4)
    noise = generator.normal(0, 3.0, image.shape)
    image = np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    if defect:
        cv.circle(image, (center[0] + 60, center[1] + 10), 26, (20, 20, 140), cv.FILLED)
    return image


def encodeJpeg(image: np.ndarray) -> bytes:
    import cv2 as cv

    success, encoded = cv.imencode(".jpg", image, [cv.IMWRITE_JPEG_QUALITY, 92])
    assert success
    return encoded.tobytes()
