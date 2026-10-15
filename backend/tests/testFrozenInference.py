import pytest
from motionQa.evaluation.frozenInference import score_predictions


def test_all_outcomes_remain_in_denominator():
    predictions = [{'image': str(i), 'decision': d} for i, d in enumerate(['PASS','FAIL','ERROR','REVIEW','NO_PART','RETAKE'])]
    result = score_predictions(predictions, {str(i): 'anomaly' for i in range(6)})
    assert result['missedDefects'] == {'numerator': 1, 'denominator': 6, 'rate': 1/6}
    assert result['counts']['anomaly']['ERROR'] == 1
    assert result['falseRejections']['rate'] is None


def test_missing_label_is_rejected():
    with pytest.raises(ValueError):
        score_predictions([{'image':'a','decision':'PASS'}], {})


def test_duplicate_prediction_is_rejected():
    with pytest.raises(ValueError):
        score_predictions([{'image':'a','decision':'PASS'}]*2, {'a':'normal'})


def test_unknown_decision_is_rejected():
    with pytest.raises(ValueError):
        score_predictions([{'image':'a','decision':'SUCCESS'}], {'a':'normal'})

@pytest.mark.asyncio
async def test_predict_uses_decoded_pixels_and_preserves_invalid_input(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace
    import cv2 as cv
    import numpy as np
    import motionQa.evaluation.frozenInference as runner
    import motionQa.inspection.inspectionPipeline as implementation

    good = np.zeros((128,128,3), dtype=np.uint8)
    cv.imwrite(str(tmp_path / 'good.png'), good)
    (tmp_path / 'bad.png').write_bytes(b'invalid')
    rows = [{'image':name,'sha256':runner.digest(tmp_path/name), 'physicalPartId':str(i),
             'captureSessionId':str(i),'split':'test'} for i,name in enumerate(['good.png','bad.png'])]
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'items':rows}))
    seal = tmp_path / 'seal.json'
    seal.write_text('{}')
    monkeypatch.setattr(runner, 'verify', lambda args: None)
    class FakePipeline:
        def __init__(self, *args, **kwargs): self.isReady = True
        async def inspect(self, image, request):
            assert isinstance(image, np.ndarray)
            return SimpleNamespace(model_dump=lambda **kwargs: {'decision':'REVIEW','reasonCode':'FIXTURE'})
    monkeypatch.setattr(implementation, 'InspectionPipeline', FakePipeline)
    args = SimpleNamespace(manifest=manifest, images=tmp_path, profile=tmp_path/'profile.json',
        evidence=tmp_path/'evidence',output=tmp_path/'run', seal=seal)
    await runner.predict(args)
    predictions = [json.loads(line) for line in (args.output/'predictions.jsonl').read_text().splitlines()]
    assert [row['decision'] for row in predictions] == ['REVIEW','ERROR']
    assert json.loads((args.output/'run.json').read_text())['count'] == 2
