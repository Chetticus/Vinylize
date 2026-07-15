"""Channel crosstalk — imperfect 45/45 decoding in the cartridge.

Physics: perfect stereo separation would require the cartridge's two
generators to respond to exactly orthogonal (45 degree) wall motions. Real
cantilevers are not infinitely rigid and their suspension is not perfectly
symmetric, so each output picks up a little of the other wall's motion.
Separation for a good cartridge is ~25-35 dB at 1 kHz — and it *degrades at
high frequency*, because above a few kHz the cantilever begins to flex and
its tip no longer moves as a rigid body (the azimuth alignment error also
matters more as wavelengths shrink).

Model: L' = L + k_lo * R + k_hf * HP(R) and symmetrically for R'. The flat
term sets the 1 kHz separation; the first-order high-passed term adds the
extra leakage above CROSSTALK_HF_CORNER_HZ. Only the *leakage* path is
filtered — the direct signal is untouched, so disabling the stage is exactly
transparent.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.dsp.constants import (
    CROSSTALK_DB_AT_1KHZ,
    CROSSTALK_HF_CORNER_HZ,
    CROSSTALK_HF_EXTRA_DB,
)
from app.dsp.filters import first_order_highpass


@dataclass(frozen=True)
class CrosstalkResult:
    left: np.ndarray
    right: np.ndarray
    separation_at_1khz_db: float
    separation_hf_db: float


def process(
    left: np.ndarray,
    right: np.ndarray,
    sample_rate: int,
    amount_scale: float = 1.0,
) -> CrosstalkResult:
    """Mix a frequency-shaped copy of each channel into the other."""
    k_lo = 10.0 ** (CROSSTALK_DB_AT_1KHZ / 20.0) * amount_scale
    # Extra HF leakage on top of the flat floor.
    k_hf_total = 10.0 ** ((CROSSTALK_DB_AT_1KHZ + CROSSTALK_HF_EXTRA_DB) / 20.0) * amount_scale
    k_hf = max(k_hf_total - k_lo, 0.0)

    hp_left = first_order_highpass(left, CROSSTALK_HF_CORNER_HZ, sample_rate)
    hp_right = first_order_highpass(right, CROSSTALK_HF_CORNER_HZ, sample_rate)

    out_l = left + k_lo * right + k_hf * hp_right
    out_r = right + k_lo * left + k_hf * hp_left

    sep_lo = -20.0 * np.log10(max(k_lo, 1e-9))
    sep_hf = -20.0 * np.log10(max(k_lo + k_hf, 1e-9))
    return CrosstalkResult(
        left=out_l,
        right=out_r,
        separation_at_1khz_db=float(sep_lo),
        separation_hf_db=float(sep_hf),
    )
