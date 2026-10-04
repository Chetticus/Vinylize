"""Codrops' recorded surface texture; the original physical model stays intact.

Source and usage terms are recorded beside the bundled asset. The reference
player uses gain 0.5. Our initial 0.45 trial is reduced a further 40% to 0.27.
"""

from functools import lru_cache
from pathlib import Path
from math import gcd

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


ASSET = Path(__file__).resolve().parents[2] / "audio" / "assets" / "codrops-noise1.mp3"
SURFACE_GAIN = 0.27  # 0.45 * 0.60: 40% below the previous listening preset


@lru_cache(maxsize=3)
def sample_at_rate(sample_rate: int) -> np.ndarray:
    samples, source_rate = sf.read(ASSET, dtype="float32", always_2d=True)
    if source_rate != sample_rate:
        divisor = gcd(source_rate, sample_rate)
        samples = resample_poly(samples, sample_rate // divisor, source_rate // divisor).astype(np.float32)
    if samples.shape[1] == 1:
        samples = np.repeat(samples, 2, axis=1)
    samples = samples[:, :2].copy()
    # Very short fades prevent a discontinuity at the repeat boundary.
    fade = min(int(sample_rate * 0.005), samples.shape[0] // 2)
    if fade:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        samples[:fade] *= ramp
        samples[-fade:] *= ramp[::-1]
    samples.setflags(write=False)
    return samples


def mix_sampled_surface(vinyl: np.ndarray, sample_rate: int, level_scale: float = 4.0) -> np.ndarray:
    texture = sample_at_rate(sample_rate)
    output = vinyl.astype(np.float32, copy=True)
    gain = SURFACE_GAIN * level_scale / 4.0
    # Block copies avoid allocating a minutes-long tiled sample or indices.
    for start in range(0, output.shape[0], texture.shape[0]):
        length = min(texture.shape[0], output.shape[0] - start)
        output[start:start + length] += texture[:length] * gain
    return output
