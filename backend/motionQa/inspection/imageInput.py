import os
from dataclasses import dataclass
import numpy as np

maxUploadBytes = 8 * 1024 * 1024
maxImagePixels = 40_000_000
minImageSide = 128

# OpenCV reads this limit lazily; setting it before the first decode makes imdecode refuse decompression bombs.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(maxImagePixels))

jpegMagic = b"\xff\xd8\xff"
pngMagic = b"\x89PNG\r\n\x1a\n"


class InvalidImageError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class DecodedImage:
    image: np.ndarray
    mediaType: str
    byteCount: int


def detectMediaType(payload: bytes) -> str | None:
    if payload.startswith(jpegMagic):
        return "image/jpeg"
    if payload.startswith(pngMagic):
        return "image/png"
    return None


def decodeImage(payload: bytes, maxBytes: int = maxUploadBytes) -> DecodedImage:
    # AI Assisted Logic
    import cv2 as cv

    if not payload:
        raise InvalidImageError("EMPTY_UPLOAD", "Upload is empty")
    if len(payload) > maxBytes:
        raise InvalidImageError("UPLOAD_TOO_LARGE", f"Upload exceeds {maxBytes} bytes")
    mediaType = detectMediaType(payload)
    if mediaType is None:
        raise InvalidImageError("UNSUPPORTED_MEDIA_TYPE", "Only JPEG and PNG images are accepted")
    try:
        image = cv.imdecode(np.frombuffer(payload, dtype=np.uint8), cv.IMREAD_COLOR)
    except cv.error as error:
        raise InvalidImageError("UNDECODABLE_IMAGE", f"Image could not be decoded: {str(error).splitlines()[-1][:160]}") from error
    if image is None or image.size == 0:
        raise InvalidImageError("UNDECODABLE_IMAGE", "Image bytes could not be decoded")
    height, width = image.shape[:2]
    if height * width > maxImagePixels:
        raise InvalidImageError("IMAGE_TOO_LARGE", f"Image exceeds {maxImagePixels} pixels")
    if min(height, width) < minImageSide:
        raise InvalidImageError("IMAGE_TOO_SMALL", f"Image sides must be at least {minImageSide} pixels")
    return DecodedImage(image=image, mediaType=mediaType, byteCount=len(payload))
