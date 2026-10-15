"""Inference-only evaluation, then a separate label-scoring command.

Never fits models or calibrates thresholds. Requires the frozenProtocol seal.
"""
import argparse
import asyncio
import json
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from .frozenProtocol import digest, verify

DECISIONS = {'PASS', 'FAIL', 'REVIEW', 'RETAKE', 'NO_PART', 'ERROR'}


def score_predictions(predictions, labels):
    ids = [row['image'] for row in predictions]
    if len(ids) != len(set(ids)) or set(ids) != set(labels):
        raise ValueError('Labels must match every prediction exactly; duplicate predictions are forbidden')
    counts = {label: Counter() for label in ('normal', 'anomaly', 'capture_fault', 'wrong_object')}
    for row in predictions:
        label, decision = labels[row['image']], row['decision']
        if label not in counts or decision not in DECISIONS:
            raise ValueError('Unsupported label or decision')
        counts[label][decision] += 1
    totals = {label: sum(values.values()) for label, values in counts.items()}
    def rate(label, decision):
        n = totals[label]
        return {'numerator': counts[label][decision], 'denominator': n,
                'rate': counts[label][decision] / n if n else None}
    return {'counts': {label: {d: values[d] for d in sorted(DECISIONS)} for label, values in counts.items()},
            'missedDefects': rate('anomaly', 'PASS'), 'falseRejections': rate('normal', 'FAIL'),
            'sampleUnit': 'image; not independent physical-part trials',
            'qualification': 'All ERROR/REVIEW/RETAKE/NO_PART retained. No accuracy on discarded subsets.'}


async def predict(args):
    verify(args)
    from ..inspection.inspectionPipeline import InspectionPipeline, InspectionRequest
    from ..inspection.evidenceStore import LocalEvidenceStore
    from ..inspection.imageInput import decodeImage
    from ..inspection.opencvRuntime import getOpenCvDiagnostics

    manifest = json.loads(args.manifest.read_text())
    rows = [row for row in manifest['items'] if row['split'] == 'test']
    if any(set(row) & {'label', 'groundTruth', 'isAnomaly', 'defectType'} for row in rows):
        raise ValueError('Remove labels from the inference manifest; keep them in a separate file')
    pipeline = InspectionPipeline(args.profile, LocalEvidenceStore(args.evidence), maxConcurrent=1)
    if not pipeline.isReady:
        raise ValueError(f'Model unavailable: {pipeline.loadError}')
    # Exclusive run directory reserves this run before processing starts.
    args.output.mkdir(parents=True, exist_ok=False)
    run_id = uuid.uuid4().hex
    prediction_path = args.output / 'predictions.jsonl'
    with prediction_path.open('x') as out:
        for index, row in enumerate(rows):
            try:
                image = decodeImage((args.images / row['image']).read_bytes()).image
                result = await pipeline.inspect(image, InspectionRequest(
                    inspectionId=f'{run_id}-{index:06d}', lineId='EVALUATION', stationId='FROZEN_TEST'))
                record = result.model_dump(mode='json')
            except Exception as error:
                record = {'decision': 'ERROR', 'reasonCode': 'EVALUATION_INPUT_OR_RUNTIME_ERROR',
                          'reasonDetail': type(error).__name__}
            record.update({key: row[key] for key in ('image', 'sha256', 'physicalPartId', 'captureSessionId')})
            out.write(json.dumps(record, allow_nan=False) + '\n')
            out.flush()
    verify(args)
    diagnostics = getOpenCvDiagnostics()
    run = {'createdAt': datetime.now(timezone.utc).isoformat(), 'status': 'PREDICTIONS_FROZEN_LABELS_NOT_SCORED',
           'sealSha256': digest(args.seal), 'predictionsSha256': digest(prediction_path),
           'count': len(rows), 'opencv': str(diagnostics),
           'qualification': 'Integrity checks passed; independence still depends on provenance and custodian.'}
    (args.output / 'run.json').write_text(json.dumps(run, indent=2))


def score(args):
    run_path = args.run / 'run.json'
    run = json.loads(run_path.read_text())
    predictions_path = args.run / 'predictions.jsonl'
    if digest(predictions_path) != run['predictionsSha256']:
        raise ValueError('Predictions changed after inference')
    predictions = [json.loads(line) for line in predictions_path.read_text().splitlines()]
    if len(predictions) != run['count']:
        raise ValueError('Prediction count differs from completed run')
    labels = json.loads(args.labels.read_text())
    results = score_predictions(predictions, labels)
    results.update({'runSha256': digest(run_path), 'labelsSha256': digest(args.labels),
                    'predictionsSha256': run['predictionsSha256']})
    with args.output.open('x') as out:
        json.dump(results, out, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('predict')
    for name in ('manifest', 'images', 'profile', 'source', 'protocol', 'seal', 'evidence', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p = sub.add_parser('score')
    for name in ('run', 'labels', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    if args.action == 'predict': asyncio.run(predict(args))
    else: score(args)


if __name__ == '__main__': main()
