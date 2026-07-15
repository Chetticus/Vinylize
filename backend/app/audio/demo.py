"""Built-in demo clip: a synthesized 8-second funk loop.

Users without an audio file on hand still deserve the full experience, so the
backend can synthesize a deterministic, copyright-free demo groove. The
arrangement is chosen to exercise every pipeline stage on purpose:

  * closed hi-hats (bright noise bursts, panned right) -> stylus tracing loss
    has something to erase;
  * a hot kick + bass -> compliance saturation gets steep groove walls;
  * a sustained detuned electric-piano pad -> wow & flutter is audible;
  * hard left/right panning -> crosstalk and the vertical (stereo) groove
    component are visible in the 3D view.

Pure NumPy additive/subtractive synthesis; deterministic (fixed seed).
"""

from __future__ import annotations

import numpy as np
from scipy import signal as sp_signal

from app.audio.ingestion import DecodedAudio

SAMPLE_RATE = 44_100
BPM = 112.0
BARS = 4  # ~8.6 s at 112 BPM in 4/4


def _env(n: int, attack_s: float, decay_s: float, sr: int) -> np.ndarray:
    """Exponential attack/decay envelope of length n."""
    t = np.arange(n) / sr
    a = np.minimum(t / max(attack_s, 1e-4), 1.0)
    d = np.exp(-np.maximum(t - attack_s, 0.0) / max(decay_s, 1e-4))
    return a * d


def _place(track: np.ndarray, clip: np.ndarray, start_idx: int) -> None:
    """Add `clip` into `track` at `start_idx`, clipping at the end."""
    end = min(start_idx + clip.shape[0], track.shape[0])
    if end > start_idx:
        track[start_idx:end] += clip[: end - start_idx]


def _kick(sr: int) -> np.ndarray:
    n = int(0.25 * sr)
    t = np.arange(n) / sr
    freq = 40.0 + 70.0 * np.exp(-t / 0.03)  # pitch sweep 110 -> 40 Hz
    phase = 2.0 * np.pi * np.cumsum(freq) / sr
    return 0.9 * np.sin(phase) * _env(n, 0.002, 0.11, sr)


def _snare(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(0.2 * sr)
    noise = rng.standard_normal(n)
    sos = sp_signal.butter(2, [1200.0, 6500.0], btype="band", fs=sr, output="sos")
    body = 0.35 * np.sin(2.0 * np.pi * 190.0 * np.arange(n) / sr) * _env(n, 0.001, 0.05, sr)
    return 0.55 * sp_signal.sosfilt(sos, noise) * _env(n, 0.001, 0.08, sr) + body


def _hat(sr: int, rng: np.random.Generator, open_: bool = False) -> np.ndarray:
    n = int((0.18 if open_ else 0.06) * sr)
    noise = rng.standard_normal(n)
    sos = sp_signal.butter(4, 7500.0, btype="high", fs=sr, output="sos")
    return 0.30 * sp_signal.sosfilt(sos, noise) * _env(n, 0.001, 0.09 if open_ else 0.025, sr)


def _bass_note(freq: float, dur_s: float, sr: int) -> np.ndarray:
    n = int(dur_s * sr)
    t = np.arange(n) / sr
    # Band-limited-ish saw: first 8 harmonics, low-passed.
    wave = sum((1.0 / k) * np.sin(2.0 * np.pi * freq * k * t) for k in range(1, 9))
    sos = sp_signal.butter(2, 900.0, btype="low", fs=sr, output="sos")
    return 0.5 * sp_signal.sosfilt(sos, np.asarray(wave)) * _env(n, 0.005, dur_s * 0.6, sr)


def _pad_chord(freqs: list[float], dur_s: float, sr: int) -> np.ndarray:
    n = int(dur_s * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)
    for f in freqs:
        # Two slightly detuned sines per voice: chorused e-piano character,
        # and a steady tone for wow/flutter to bend audibly.
        out += np.sin(2.0 * np.pi * f * 1.0015 * t) + np.sin(2.0 * np.pi * f * 0.9985 * t)
    tremolo = 1.0 + 0.12 * np.sin(2.0 * np.pi * 4.5 * t)
    return 0.16 * out / len(freqs) * tremolo * _env(n, 0.03, dur_s, sr)


def synthesize_demo() -> DecodedAudio:
    """Render the demo loop as a stereo DecodedAudio, ready for the pipeline."""
    sr = SAMPLE_RATE
    rng = np.random.default_rng(19571)  # year the 45/45 stereo groove shipped
    beat = 60.0 / BPM
    n = int(BARS * 4 * beat * sr)
    left = np.zeros(n)
    right = np.zeros(n)

    a1, c2, e2, g2 = 55.0, 65.41, 82.41, 98.0
    am7 = [220.0, 261.63, 329.63, 392.0]   # A C E G
    fmaj7 = [174.61, 220.0, 261.63, 329.63]  # F A C E

    for bar in range(BARS):
        t0 = bar * 4 * beat

        # Drums: kick 1 & 2.5 & 3, snare 2 & 4, eighth hats (open on 4+).
        for b in (0.0, 1.5, 2.0):
            k = _kick(sr)
            _place(left, k, int((t0 + b * beat) * sr))
            _place(right, k, int((t0 + b * beat) * sr))
        for b in (1.0, 3.0):
            s = _snare(sr, rng)
            _place(left, 0.9 * s, int((t0 + b * beat) * sr))
            _place(right, 1.0 * s, int((t0 + b * beat) * sr))
        for e in range(8):
            h = _hat(sr, rng, open_=(e == 7))
            _place(left, 0.4 * h, int((t0 + e * 0.5 * beat) * sr))   # hats panned
            _place(right, 1.0 * h, int((t0 + e * 0.5 * beat) * sr))  # mostly right

        # Bass: A . A G | A . C G walk.
        pattern = [(0.0, a1), (1.0, a1), (2.0, c2 if bar % 2 else g2), (3.0, g2)]
        for b, f in pattern:
            note = _bass_note(f, 0.9 * beat, sr)
            _place(left, note, int((t0 + b * beat) * sr))
            _place(right, note, int((t0 + b * beat) * sr))

        # Pad: whole-bar chord, panned left (Am7 / Fmaj7 alternating).
        chord = _pad_chord(am7 if bar % 2 == 0 else fmaj7, 4 * beat, sr)
        _place(left, 1.0 * chord, int(t0 * sr))
        _place(right, 0.45 * chord, int(t0 * sr))

    stereo = np.stack([left, right], axis=1)
    peak = float(np.max(np.abs(stereo)))
    stereo = (stereo / peak * 0.85).astype(np.float32)  # healthy but unclipped level

    return DecodedAudio(
        samples=np.ascontiguousarray(stereo),
        sample_rate=sr,
        n_channels=2,
        full_duration_s=n / sr,
        clip_duration_s=n / sr,
    )
