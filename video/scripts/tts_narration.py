"""Generates the narration track with Kokoro-82M (Apache-2.0) and re-times the captions to the real audio.

    <tts venv>/bin/python scripts/tts_narration.py [--voice af_heart]

Needs a separate environment: python3.11 -m venv tts-venv && tts-venv/bin/pip install "kokoro>=0.9.4" soundfile numpy,
and brew install espeak-ng.
Kokoro downloads hexgrad/Kokoro-82M from Hugging Face on first use (setup time, not render time).

Each cue in src/data/narration.json is spoken from its `say` text (pronunciation spelled out) or its caption text,
at normal speed. The cue keeps its start time (anchored to the visuals). If the speech would run into the next cue,
the script stops and names the cue, so the text is shortened instead of the voice being sped up.
Writes public/audio/narration.wav, src/data/narration-audio.json, and updates cue end times and the status.
"""

import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from misaki import espeak as misakiEspeak  # noqa: F401  (sets the bundled eSpeak paths on import)
from phonemizer.backend.espeak.wrapper import EspeakWrapper

# The pip-bundled eSpeak NG has a build-machine data path and exits on load, so use Homebrew's espeak-ng
# (brew install espeak-ng). eSpeak only phonemises words missing from Kokoro's dictionary.
EspeakWrapper.set_library("/opt/homebrew/lib/libespeak-ng.dylib")
EspeakWrapper.set_data_path("/opt/homebrew/share/espeak-ng-data")

from kokoro import KPipeline  # noqa: E402

videoRoot = Path(__file__).resolve().parent.parent
narrationPath = videoRoot / "src" / "data" / "narration.json"
timelinePath = videoRoot / "src" / "data" / "timeline.json"
outWav = videoRoot / "public" / "audio" / "narration.wav"
reportPath = videoRoot / "src" / "data" / "narration-audio.json"
sampleRate = 24000
gapSeconds = 0.12


def trimSilence(audio: np.ndarray, threshold: float = 0.004) -> np.ndarray:
    loud = np.where(np.abs(audio) > threshold)[0]
    if loud.size == 0:
        return audio
    start = max(0, loud[0] - int(0.03 * sampleRate))
    end = min(audio.size, loud[-1] + int(0.08 * sampleRate))
    return audio[start:end]


def modelFingerprint() -> dict:
    cache = Path.home() / ".cache" / "huggingface" / "hub" / "models--hexgrad--Kokoro-82M"
    weights = sorted(cache.glob("snapshots/*/kokoro-v1_0.pth"))
    if not weights:
        return {}
    digest = hashlib.sha256(weights[-1].read_bytes()).hexdigest()
    return {"weights": "kokoro-v1_0.pth", "snapshot": weights[-1].parent.name, "sha256": digest}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="af_heart")
    args = parser.parse_args()

    narration = json.loads(narrationPath.read_text())
    timeline = json.loads(timelinePath.read_text())
    totalSeconds = timeline["totalFrames"] / timeline["fps"]
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    track = np.zeros(int(totalSeconds * sampleRate), dtype=np.float32)
    cues = narration["cues"]
    report = []
    problems = []
    for index, cue in enumerate(cues):
        spoken = cue.get("say") or cue["text"]
        pieces = [np.asarray(result.audio, dtype=np.float32) for result in pipeline(spoken, voice=args.voice, speed=1.0)]
        audio = trimSilence(np.concatenate(pieces)) if pieces else np.zeros(1, dtype=np.float32)
        duration = audio.size / sampleRate
        limit = (cues[index + 1]["start"] - gapSeconds) if index + 1 < len(cues) else totalSeconds - 0.2
        end = cue["start"] + duration
        if end > limit:
            problems.append(f"cue at {cue['start']}s needs {duration:.2f}s but only {limit - cue['start']:.2f}s is free: {cue['text']}")
        startSample = int(round(cue["start"] * sampleRate))
        segment = audio[: max(0, min(audio.size, track.size - startSample))]
        track[startSample : startSample + segment.size] += segment
        # Captions stay up for the speech plus a short tail, and at least long enough to read (2.6 words/s).
        readable = cue["start"] + len(cue["text"].split()) / 2.6
        cue["end"] = round(min(limit, max(end + 0.25, readable)), 2)
        report.append({"start": cue["start"], "speechSeconds": round(duration, 3), "speechEnd": round(end, 3), "spoken": spoken})
        print(f"{cue['start']:7.2f}s  {duration:5.2f}s  {spoken}")

    if problems:
        print("\n".join(problems), file=sys.stderr)
        raise SystemExit(1)

    peak = float(np.max(np.abs(track))) or 1.0
    track = track * (0.89 / peak)  # about -1 dBFS peak
    outWav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(outWav, track, sampleRate, subtype="PCM_16")

    generated = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    narration["status"] = (
        f"TTS narration generated {generated[:10]} with Kokoro-82M v1.0 (Apache-2.0), generic voice {args.voice}; "
        "captions are timed to the generated audio."
    )
    narrationPath.write_text(json.dumps(narration, indent=1) + "\n")
    reportPath.write_text(
        json.dumps(
            {
                "engine": "kokoro 0.9.4 (Apache-2.0)",
                "model": "hexgrad/Kokoro-82M v1.0 (Apache-2.0)",
                "modelFile": modelFingerprint(),
                "voice": args.voice,
                "speed": 1.0,
                "sampleRate": sampleRate,
                "generatedAtUtc": generated,
                "totalSeconds": totalSeconds,
                "cues": report,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"wrote {outWav.relative_to(videoRoot)} ({totalSeconds:.0f} s) and updated {narrationPath.relative_to(videoRoot)}")


if __name__ == "__main__":
    main()
