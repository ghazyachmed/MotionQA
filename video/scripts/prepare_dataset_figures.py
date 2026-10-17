"""Dataset figures for the video. Run with the backend venv (OpenCV 5):

    ../backend/.venv/bin/python -I scripts/prepare_dataset_figures.py

Draws the VisA ground-truth mask outline on a crop of Anomaly/048. This is a dataset label, not model output;
the video labels it that way. No heatmap or score is drawn here.
"""

from pathlib import Path

import cv2 as cv

videoRoot = Path(__file__).resolve().parent.parent
visaRoot = videoRoot.parent / "data" / "visa" / "pcb1" / "Data"
outDir = videoRoot / "public" / "assets" / "dataset"


def groundTruthCrop(name: str, padding: int = 170) -> None:
    image = cv.imread(str(visaRoot / "Images" / "Anomaly" / f"{name}.JPG"), cv.IMREAD_COLOR)
    mask = cv.imread(str(visaRoot / "Masks" / "Anomaly" / f"{name}.png"), cv.IMREAD_GRAYSCALE)
    if image is None or mask is None:
        raise SystemExit(f"missing VisA image or mask for {name}")
    if mask.shape[:2] != image.shape[:2]:
        mask = cv.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv.INTER_NEAREST)
    _, binary = cv.threshold(mask, 0, 255, cv.THRESH_BINARY)
    contours, _ = cv.findContours(binary, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    x, y, w, h = cv.boundingRect(cv.vconcat([c for c in contours]))
    outlined = image.copy()
    cv.drawContours(outlined, contours, -1, (32, 176, 245), 4, cv.LINE_AA)
    x0, y0 = max(0, x - padding), max(0, y - padding)
    x1, y1 = min(image.shape[1], x + w + padding), min(image.shape[0], y + h + padding)
    crop = outlined[y0:y1, x0:x1]
    crop = cv.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv.INTER_CUBIC)
    outDir.mkdir(parents=True, exist_ok=True)
    cv.imwrite(str(outDir / f"anomaly-{name}-groundtruth-crop.jpg"), crop, [cv.IMWRITE_JPEG_QUALITY, 92])
    print(f"{name}: mask bbox x={x} y={y} w={w} h={h}; crop {x0},{y0}-{x1},{y1}")


def scaledCopy(folder: str, name: str, width: int = 1404) -> None:
    image = cv.imread(str(visaRoot / "Images" / folder / f"{name}.JPG"), cv.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"missing VisA image {folder}/{name}")
    scale = width / image.shape[1]
    resized = cv.resize(image, None, fx=scale, fy=scale, interpolation=cv.INTER_AREA) if scale < 1 else image
    cv.imwrite(str(outDir / f"{folder.lower()}-{name}.jpg"), resized, [cv.IMWRITE_JPEG_QUALITY, 90])


if __name__ == "__main__":
    groundTruthCrop("048")
    scaledCopy("Normal", "0011")
    print("cv", cv.__version__)
