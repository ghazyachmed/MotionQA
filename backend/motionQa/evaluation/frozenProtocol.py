"""Seal a prospective evaluation protocol. Does not certify human independence.

Manifest rows require image, sha256, physicalPartId, captureSessionId, split.
Splits: development, test. Keep labels with an independent evaluator.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def snapshot(root):
    root = Path(root)
    files = sorted(p for p in root.rglob('*') if p.is_file() and
                   p.suffix in {'.py', '.toml', '.lock'} and
                   not any(part.startswith('.') or part in {'__pycache__', 'models', 'data'}
                           for part in p.relative_to(root).parts))
    if not files:
        raise ValueError("No source files found; select the backend source directory")
    return {str(p.relative_to(root)): digest(p) for p in files}


def validate_manifest(manifest, image_root):
    rows = manifest['items']
    if not rows or {r['split'] for r in rows} != {'development', 'test'}:
        raise ValueError('Include development and test inventories, including all previously seen images.')
    if not manifest.get('provenance') or not manifest.get('custodian'):
        raise ValueError('Provenance and dataset custodian are required.')
    seen = set()
    groups = {'physicalPartId': {}, 'captureSessionId': {}}
    root = Path(image_root).resolve()
    for row in rows:
        path = (root / row['image']).resolve()
        if root not in path.parents:
            raise ValueError('Image path escapes image root')
        sha = digest(path)
        if sha != row['sha256'] or sha in seen:
            raise ValueError('Image checksum mismatch or duplicate image')
        seen.add(sha)
        for field, assigned in groups.items():
            key = row[field]
            if not isinstance(key, str) or not key.strip():
                raise ValueError(f'Missing {field}')
            if key in assigned and assigned[key] != row['split']:
                raise ValueError(f'{field} crosses development/test boundary: {key}')
            assigned[key] = row['split']
    return len(rows)


def artifact_hashes(profile_path):
    profile_path = Path(profile_path).resolve()
    profile = json.loads(profile_path.read_text())
    result = {'profile': digest(profile_path)}
    for key in ('featureModel', 'memoryBank'):
        ref = profile[key]
        sha = digest(profile_path.parent / ref['file'])
        if sha != ref['sha256']:
            raise ValueError(f'{key} checksum mismatch')
        result[key] = sha
    return result


def seal(args):
    manifest = json.loads(args.manifest.read_text())
    validate_manifest(manifest, args.images)
    if manifest.get('testPreviouslyUsedForDevelopment') is not False:
        raise ValueError('Custodian must explicitly attest test data was not used for development')
    record = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'status': 'PROTOCOL_SEALED_NOT_EVALUATED',
        'independence': 'Custodian attestation; checks cannot detect human inspection or near-duplicates.',
        'manifestSha256': digest(args.manifest),
        'protocolSha256': digest(args.protocol),
        'artifacts': artifact_hashes(args.profile),
        'sourceFiles': snapshot(args.source),
    }
    # Exclusive creation preserves the previous record instead of silently replacing it.
    with args.seal.open('x') as out:
        json.dump(record, out, indent=2)
    print('Protocol sealed. No accuracy or independence claim has been established.')


def verify(args):
    record = json.loads(args.seal.read_text())
    validate_manifest(json.loads(args.manifest.read_text()), args.images)
    current = {'manifestSha256': digest(args.manifest), 'protocolSha256': digest(args.protocol),
               'artifacts': artifact_hashes(args.profile), 'sourceFiles': snapshot(args.source)}
    for key, value in current.items():
        if value != record[key]:
            raise ValueError(f'Frozen input changed: {key}. This is a new experiment.')
    print('Frozen inputs match. Run inference without fitting or threshold selection.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['seal', 'verify'])
    for name in ('manifest', 'images', 'profile', 'source', 'protocol', 'seal'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    (seal if args.action == 'seal' else verify)(args)


if __name__ == '__main__':
    main()
