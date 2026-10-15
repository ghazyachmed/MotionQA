import importlib.util
import json
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path

spec = importlib.util.spec_from_file_location('frozen', Path(__file__).resolve().parents[1] / 'backend/motionQa/evaluation/frozenProtocol.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)

class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.rows = []
        for n, split in enumerate(('development', 'test')):
            path = self.root / f'{n}.jpg'
            path.write_bytes(str(n).encode())
            self.rows.append(dict(image=path.name, sha256=frozen.digest(path),
                physicalPartId=str(n), captureSessionId=str(n), split=split))
        self.manifest = dict(items=self.rows, custodian='test custodian', provenance='test fixture')

    def test_valid_grouped_inventory(self):
        self.assertEqual(frozen.validate_manifest(self.manifest, self.root), 2)

    def test_repeated_part_rejected(self):
        self.rows[1]['physicalPartId'] = '0'
        with self.assertRaises(ValueError): frozen.validate_manifest(self.manifest, self.root)

    def test_repeated_session_rejected(self):
        self.rows[1]['captureSessionId'] = '0'
        with self.assertRaises(ValueError): frozen.validate_manifest(self.manifest, self.root)

    def test_altered_image_rejected(self):
        (self.root / '1.jpg').write_bytes(b'changed')
        with self.assertRaises(ValueError): frozen.validate_manifest(self.manifest, self.root)

    def test_duplicate_bytes_rejected(self):
        (self.root / '1.jpg').write_bytes(b'0')
        self.rows[1]['sha256'] = self.rows[0]['sha256']
        with self.assertRaises(ValueError): frozen.validate_manifest(self.manifest, self.root)

    def test_source_changes_detected(self):
        (self.root / 'app.py').write_text('before')
        before = frozen.snapshot(self.root)
        (self.root / 'app.py').write_text('after')
        self.assertNotEqual(before, frozen.snapshot(self.root))

    def test_seal_rejects_changed_protocol_and_overwrite(self):
        (self.root / 'app.py').write_text('source')
        (self.root / 'feature.onnx').write_bytes(b'feature')
        (self.root / 'bank.npz').write_bytes(b'bank')
        profile = {key: {'file': file, 'sha256': frozen.digest(self.root / file)}
                   for key, file in [('featureModel', 'feature.onnx'), ('memoryBank', 'bank.npz')]}
        (self.root / 'profile.json').write_text(json.dumps(profile))
        self.manifest['testPreviouslyUsedForDevelopment'] = False
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest))
        (self.root / 'protocol.md').write_text('prespecified metrics')
        args = SimpleNamespace(manifest=self.root / 'manifest.json', images=self.root,
            profile=self.root / 'profile.json', source=self.root,
            protocol=self.root / 'protocol.md', seal=self.root / 'seal.json')
        frozen.seal(args)
        frozen.verify(args)
        with self.assertRaises(FileExistsError): frozen.seal(args)
        args.protocol.write_text('changed after seeing results')
        with self.assertRaises(ValueError): frozen.verify(args)

if __name__ == '__main__': unittest.main()
