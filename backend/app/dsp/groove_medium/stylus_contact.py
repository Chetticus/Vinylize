"""Stylus contact stage — one mechanism, three audible effects.

Physics: the stylus tip has a finite contact patch (~8 um for a conical tip).
It cannot follow groove-wall detail smaller than its own footprint: it reads a
weighted average of the wall over the patch, and where the wall curves tighter
than the tip radius it physically loses contact and rides the envelope
(mistracking). Because the patch is a *fixed physical size* while the groove's
linear speed shrinks toward the center, a fixed audio frequency occupies an
ever-shorter spatial wavelength (lambda = v(r) / f) as the record plays
inward — so the same tip erases more treble and distorts more at the inner
radius. High-frequency loss, tracing distortion, and 'inner groove distortion'
are one phenomenon, which is why this is one stage and one toggle.

Model: operating on displacement-vs-arc-length x(s),
  1. traced = gaussian(x, sigma = tip radius): the linear part — contact-patch
     averaging is well modeled as convolution with a fixed spatial kernel.
  2. residual = x - traced is the detail finer than the patch. Elastic
     deformation of the vinyl and tip lets the stylus partially follow it, so
     a *fraction* of the residual is recovered — but soft-clipped:
     out = traced + R * L * tanh(residual / L). For small residuals this is a
     fixed partial recovery (a mild, always-on high-frequency shelf — the
     'scanning loss' every stylus has); for large residuals the tanh
     saturates, generating the harmonic products of mistracking — which
     onsets exactly as it does in reality: on loud treble, worse toward the
     center where the same audio occupies shorter wavelengths.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import gaussian_filter1d

from app.dsp.constants import STYLUS_CONTACT_SIGMA_M

# Residual amplitude (as a fraction of tip radius) at which mistracking
# saturation sets in.
_RESIDUAL_LIMIT_FRACTION = 0.25

# Fraction of sub-patch detail recovered through elastic deformation when the
# residual is small. Sets the depth of the always-on scanning-loss shelf: 1.0
# would mean a lossless stylus, 0.0 a purely averaging one.
_RESIDUAL_RECOVERY = 0.35


@dataclass(frozen=True)
class StylusResult:
    lateral: np.ndarray
    vertical: np.ndarray
    hf_detail_removed_rms_m: float
    """RMS of the groove detail (meters) the tip could not trace — an honest,
    per-upload measure of how much of *this* track exceeded the tip's ability."""


def process(
    lateral: np.ndarray,
    vertical: np.ndarray,
    ds: float,
    tip_scale: float = 1.0,
) -> StylusResult:
    """Apply contact-patch tracing to both groove motion components.

    `ds` is the spatial sample spacing in meters; `tip_scale` lets the UI
    grow/shrink the stylus (a worn tip is effectively larger).
    """
    sigma_m = STYLUS_CONTACT_SIGMA_M * tip_scale
    sigma_samples = sigma_m / ds
    limit = sigma_m * _RESIDUAL_LIMIT_FRACTION

    out = []
    removed_sq = 0.0
    for x in (lateral, vertical):
        traced = gaussian_filter1d(x, sigma_samples, mode="nearest")
        residual = x - traced
        kept = _RESIDUAL_RECOVERY * limit * np.tanh(residual / limit)
        removed = residual - kept
        removed_sq += float(np.mean(removed * removed))
        out.append(traced + kept)

    return StylusResult(
        lateral=out[0],
        vertical=out[1],
        hf_detail_removed_rms_m=float(np.sqrt(removed_sq / 2.0)),
    )
