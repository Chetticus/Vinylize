"""Peak-decimated waveform data for display.

The frontend never receives raw sample arrays for drawing: a 10 s clip at
44.1 kHz is 441k points, far beyond what a canvas needs. We reduce to
min/max pairs per bucket, which preserves the visual envelope exactly
(unlike naive striding, which would alias transients away).
"""

from __future__ import annotations

import numpy as np


def peak_decimate(mono: np.ndarray, n_buckets: int = 2000) -> tuple[list[float], list[float]]:
    """Return (mins, maxs) per bucket for a 1-D signal.

    The last partial bucket is included, so the full clip is always covered.
    """
    n = mono.shape[0]
    if n == 0:
        return [], []
    n_buckets = min(n_buckets, n)
    edges = np.linspace(0, n, n_buckets + 1, dtype=np.int64)
    mins = np.empty(n_buckets, dtype=np.float32)
    maxs = np.empty(n_buckets, dtype=np.float32)
    for i in range(n_buckets):
        chunk = mono[edges[i] : edges[i + 1]]
        mins[i] = chunk.min()
        maxs[i] = chunk.max()
    return mins.tolist(), maxs.tolist()
