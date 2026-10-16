"""Download verified VisA photos and prepare a labeled demonstration contact sheet.

This is public, previously used benchmark data, never a fresh independent test.
"""
import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .visaDataset import archiveUrl, archiveSha256, archiveSizeBytes, extractArchive
from ..edge.modelRegistry import computeSha256


def download(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if computeSha256(destination) != archiveSha256:
            raise ValueError('Existing archive checksum differs; inspect it before replacing')
        return
    partial = destination.with_suffix(destination.suffix + '.partial')
    # Never silently reuse interrupted downloads.
    with urllib.request.urlopen(archiveUrl, timeout=60) as response, partial.open('xb') as output:
        count = 0
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > archiveSizeBytes:
                raise ValueError('Download exceeds expected archive size')
            output.write(chunk)
    if partial.stat().st_size != archiveSizeBytes or computeSha256(partial) != archiveSha256:
        raise ValueError('Downloaded archive failed size or checksum verification')
    partial.rename(destination)


def load_development_use(split_manifest):
    """Map image path -> development splits it already belongs to (bank images are memory-bank members)."""
    if split_manifest is None or not split_manifest.exists():
        return {}
    membership = {}
    for split, items in json.loads(split_manifest.read_text())['splits'].items():
        for item in items:
            membership.setdefault(item['image'], []).append(split)
    return membership


def prepare(archive, dataset, output, split_manifest=None):
    import cv2 as cv
    import numpy as np
    development_use = load_development_use(split_manifest)
    extraction = extractArchive(archive, dataset)
    output.mkdir(parents=True, exist_ok=False)
    sheet = np.full((720, 1080, 3), 245, dtype=np.uint8)
    cv.putText(sheet, 'VisA pcb1 | PUBLIC BENCHMARK DEMO', (20, 35), cv.FONT_HERSHEY_SIMPLEX, .8, (0, 0, 0), 2)
    records = []
    for row, category in enumerate(('Normal', 'Anomaly')):
        photos = sorted(p for p in (dataset / 'pcb1' / 'Data' / 'Images' / category).iterdir()
                        if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))[:3]
        if len(photos) != 3:
            raise ValueError('Expected three photos in each public category')
        for col, photo in enumerate(photos):
            pixels = cv.imread(str(photo))
            if pixels is None:
                raise ValueError(f'Cannot decode {photo}')
            height, width = pixels.shape[:2]
            scale = min(340 / width, 240 / height)
            thumb = cv.resize(pixels, (round(width * scale), round(height * scale)))
            y, x = 65 + row * 305, 10 + col * 360
            sheet[y:y+thumb.shape[0], x:x+thumb.shape[1]] = thumb
            cv.putText(sheet, f'{category}: {photo.name}', (x, y+270), cv.FONT_HERSHEY_SIMPLEX, .5, (0, 0, 0), 1)
            relative = str(photo.relative_to(dataset))
            records.append({'image': relative, 'label': category.lower(), 'sha256': computeSha256(photo),
                            'developmentUse': development_use.get(relative, ['unknown'])})
    cv.putText(sheet, 'CC BY 4.0 | Zou et al., ECCV 2022 | Selected examples, not evaluation results',
               (10, 705), cv.FONT_HERSHEY_SIMPLEX, .45, (0, 0, 0), 1)
    if not cv.imwrite(str(output / 'public_benchmark_contact_sheet.jpg'), sheet):
        raise ValueError('Contact sheet could not be written')
    metadata = {'source': archiveUrl, 'license': 'CC BY 4.0',
                'citation': 'Zou et al., SPot-the-Difference, ECCV 2022',
                'preparedAt': datetime.now(timezone.utc).isoformat(),
                'status': 'PUBLIC_BENCHMARK_DEMO_NOT_INDEPENDENT',
                'selection': 'First three filenames per category; illustrative, not representative',
                'developmentUseNote': 'bank = memory-bank (training) image; validation = used for model and threshold '
                                      'selection; test = reused exploratory test split. None of these is independent.',
                'archive': extraction, 'photos': records}
    (output / 'photo_sources.json').write_text(json.dumps(metadata, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--download', action='store_true', help='Download approximately 1.93 GB from public AWS Open Data')
    parser.add_argument('--split-manifest', type=Path, default=Path(__file__).resolve().parents[3] / 'evaluation' / 'visaPcb1Split.json',
                        help='Records which development split each selected photo already belongs to')
    args = parser.parse_args()
    if args.download:
        download(args.archive)
    prepare(args.archive, args.dataset, args.output, args.split_manifest)


if __name__ == '__main__':
    main()
