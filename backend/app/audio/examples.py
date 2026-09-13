"""Example records a visitor can cut without uploading anything.

The catalogue below names each record; the audio itself lives in a directory
outside the source tree (``backend/examples/`` by default, or
``VINYLIZE_EXAMPLES_DIR``), because commercial recordings must not be
committed to a public repository. Only records whose file is actually present
are offered, so a checkout without the audio simply shows no examples.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import soundfile as sf

from app.audio.ingestion import DecodedAudio, decode_upload


@dataclass(frozen=True)
class Example:
    id: str
    title: str
    artist: str | None
    file: str


CATALOGUE: tuple[Example, ...] = (
    Example("come-a-little-bit-closer", "Come a Little Bit Closer", "Jay & The Americans", "come-a-little-bit-closer.mp3"),
    Example("family-business", "Family Business", "Kanye West", "family-business.mp3"),
    Example("stand-by-me", "Stand By Me", "Ben E. King", "stand-by-me.mp3"),
)


def examples_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "examples"
    return Path(os.environ.get("VINYLIZE_EXAMPLES_DIR", default))


@lru_cache(maxsize=None)
def _duration_s(path: str, mtime: float) -> float:
    # mtime is part of the cache key so a replaced file is re-measured.
    return float(sf.info(path).duration)


def available() -> list[tuple[Example, float]]:
    """Catalogue entries whose audio file exists, with full durations."""
    out: list[tuple[Example, float]] = []
    for ex in CATALOGUE:
        path = examples_dir() / ex.file
        if path.is_file():
            try:
                out.append((ex, _duration_s(str(path), path.stat().st_mtime)))
            except RuntimeError:
                continue  # unreadable file: leave it off the shelf
    return out


def find(example_id: str) -> Example | None:
    return next((ex for ex in CATALOGUE if ex.id == example_id), None)


def display_name(ex: Example) -> str:
    return f"{ex.artist} — {ex.title}" if ex.artist else ex.title


def decode_example(ex: Example) -> DecodedAudio:
    """Decode through the same path as an upload (caps, sniffing, clip)."""
    return decode_upload((examples_dir() / ex.file).read_bytes())
