"""Decode user uploads into calibrated float32 arrays.

Decoding is done by libsndfile (via the `soundfile` package), which handles
WAV, FLAC, OGG and — since libsndfile 1.1 — MP3, so we do not need the much
heavier librosa/audioread stack. The file is sniffed by content, never trusted
by extension.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import soundfile as sf

from app.dsp.constants import MAX_CLIP_SECONDS, MAX_UPLOAD_BYTES


class AudioIngestError(ValueError):
    """Raised when an upload cannot be safely decoded."""


@dataclass(frozen=True)
class DecodedAudio:
    """A decoded, duration-capped audio clip.

    `samples` is always shaped (n_frames, n_channels) float32 in [-1, 1],
    with n_channels in {1, 2}. `full_duration_s` is the duration of the
    original file, which may exceed the processed clip length.
    """

    samples: np.ndarray
    sample_rate: int
    n_channels: int
    full_duration_s: float
    clip_duration_s: float

    @property
    def is_stereo(self) -> bool:
        return self.n_channels == 2


# Magic-byte prefixes we accept. MP3 may start with an ID3 tag or directly
# with an MPEG frame sync (0xFFEx/0xFFFx).
_WAV_MAGIC = b"RIFF"
_ID3_MAGIC = b"ID3"
_FLAC_MAGIC = b"fLaC"
_OGG_MAGIC = b"OggS"


def _looks_like_audio(head: bytes) -> bool:
    """Cheap content sniff so obviously-wrong files fail fast with a clear
    message instead of deep inside the decoder."""
    if head.startswith((_WAV_MAGIC, _ID3_MAGIC, _FLAC_MAGIC, _OGG_MAGIC)):
        return True
    # Raw MPEG frame sync: 11 set bits.
    return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0


def decode_upload(data: bytes) -> DecodedAudio:
    """Decode an uploaded audio file and cap it to MAX_CLIP_SECONDS.

    Raises AudioIngestError on oversized, unrecognized, or undecodable input.
    """
    if len(data) == 0:
        raise AudioIngestError("Empty upload.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise AudioIngestError(
            f"File is {len(data) / 1e6:.1f} MB; the limit is "
            f"{MAX_UPLOAD_BYTES / 1e6:.0f} MB."
        )
    if not _looks_like_audio(data[:16]):
        raise AudioIngestError(
            "Unrecognized file format — please upload a WAV or MP3 file."
        )

    try:
        with sf.SoundFile(io.BytesIO(data)) as f:
            sample_rate = int(f.samplerate)
            n_channels = int(f.channels)
            full_frames = int(f.frames)
            max_frames = int(MAX_CLIP_SECONDS * sample_rate)
            samples = f.read(frames=max_frames, dtype="float32", always_2d=True)
    except (sf.LibsndfileError, RuntimeError) as exc:
        raise AudioIngestError(f"Could not decode audio: {exc}") from exc

    if samples.shape[0] == 0:
        raise AudioIngestError("File decoded to zero audio frames.")

    # Fold any multichannel (>2) source down to stereo: the vinyl format
    # physically carries exactly two channels (the two groove walls).
    if n_channels > 2:
        left = samples[:, 0]
        right = samples[:, 1]
        samples = np.stack([left, right], axis=1)
        n_channels = 2

    # Defensive clamp: some encoders overshoot [-1, 1] slightly.
    np.clip(samples, -1.0, 1.0, out=samples)

    return DecodedAudio(
        samples=np.ascontiguousarray(samples, dtype=np.float32),
        sample_rate=sample_rate,
        n_channels=n_channels,
        full_duration_s=full_frames / sample_rate,
        clip_duration_s=samples.shape[0] / sample_rate,
    )
