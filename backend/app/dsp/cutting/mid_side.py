"""Mid/side (lateral/vertical) encoding — the 45/45 stereo groove geometry.

Physics: each groove wall is cut at 45 degrees to the disc surface, one wall
per channel (Westrex 45/45 system, 1957). Motion shared by both channels
(L + R) moves the stylus *laterally*; motion that differs between channels
(L - R) moves it *vertically*. This choice was deliberate: it makes a stereo
record mono-compatible (a mono pickup reads only lateral motion = the sum) and
puts the harder-to-cut vertical motion on the usually-quieter difference
signal.

The same two arrays produced here drive both the audio pipeline and the 3D
groove mesh (lateral -> in-plane wiggle, vertical -> groove depth wiggle), so
what the user sees and what they hear are one model.
"""

from __future__ import annotations

import math

import numpy as np

_SQRT2_INV = 1.0 / math.sqrt(2.0)


def encode(samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(n, ch) L/R samples -> (lateral, vertical) 1-D arrays.

    Mono input maps entirely to lateral motion — a mono groove really does
    only wiggle side to side, with constant depth.

    The 1/sqrt(2) scaling makes the transform orthonormal (energy-preserving),
    so encode followed by decode is exactly the identity.
    """
    if samples.ndim != 2:
        raise ValueError("expected (n_frames, n_channels)")
    # Dtype-preserving: float32 in, float32 out (the pipeline's time-domain
    # arrays are float32 for memory; python-float scalars don't promote).
    left = samples[:, 0]
    right = samples[:, -1]  # mono: right column == left
    lateral = (left + right) * _SQRT2_INV
    vertical = (left - right) * _SQRT2_INV
    return lateral, vertical


def decode(lateral: np.ndarray, vertical: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(lateral, vertical) -> (left, right). Inverse of encode."""
    left = (lateral + vertical) * _SQRT2_INV
    right = (lateral - vertical) * _SQRT2_INV
    return left, right
