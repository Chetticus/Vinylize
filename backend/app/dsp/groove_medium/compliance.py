"""Compliance / harmonic saturation stage — vinyl 'warmth'.

Physics: a phono cartridge outputs voltage proportional to groove-wall
*velocity* — for a groove described as displacement-vs-arc-length x(s), that
is the wall slope dx/ds times the groove's linear speed. The mechanical chain
(cutter head drive, vinyl elasticity, cantilever suspension) is progressively
nonlinear in that slope: steep walls are cut and read slightly compressed.
Because the drive variable is *slope*, the effect is strongest on loud,
high-frequency content (which has the steepest walls) and — since slope for a
given audio signal scales as 1/v(r) — noticeably stronger toward the inner
radius. That is the honest mechanism behind both 'vinyl warmth' (low-order
harmonics on hot passages) and the way loud inner-groove material audibly
strains.

Model: saturate the slope with an asymmetric soft limiter and re-integrate:

    slope' = S0 * tanh((slope + eps * slope^2 / S0) / S0)

The tanh gives odd (3rd, 5th...) harmonics; the small eps * slope^2 term
breaks symmetry the way real suspensions do, adding gentler even (2nd)
harmonics — the component listeners describe as 'warm'. S0 is the knee slope
(~0.35 by default: a full-scale cut at the outer radius reaches slope ~0.2 and
is barely touched; the same cut at the inner radius reaches ~0.5 and is
clearly compressed). Re-integration uses the shared leaky integrator so the
DC term created by the asymmetry cannot accumulate.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.dsp.constants import TONEARM_RESONANCE_HZ
from app.dsp.filters import leaky_integrate

_KNEE_SLOPE = 0.35
_ASYMMETRY = 0.05


@dataclass(frozen=True)
class ComplianceResult:
    lateral: np.ndarray
    vertical: np.ndarray
    peak_slope: float
    """Steepest groove-wall slope this track reached (dimensionless dx/ds)."""
    peak_compression_pct: float
    """How much the loudest moment was compressed by the saturator (%)."""


def _saturate(slope: np.ndarray, knee: float) -> np.ndarray:
    biased = slope + _ASYMMETRY * np.square(slope) / knee
    return knee * np.tanh(biased / knee)


def process(
    lateral: np.ndarray,
    vertical: np.ndarray,
    ds: float,
    mean_groove_speed: float,
    drive: float = 1.0,
) -> ComplianceResult:
    """Saturate wall slope for both components and re-integrate.

    `drive` > 1 lowers the knee (more saturation); the UI exposes it so users
    can exaggerate the effect to learn its sound, then return to realism.
    `mean_groove_speed` converts the tonearm-resonance leak from Hz into the
    spatial domain (leak length = v / f).
    """
    knee = _KNEE_SLOPE / max(drive, 1e-3)
    spatial_leak_hz = TONEARM_RESONANCE_HZ / mean_groove_speed  # cycles per meter

    peak_slope = 0.0
    peak_compression = 0.0
    out = []
    for x in (lateral, vertical):
        slope = np.diff(x, prepend=x[0]) / ds
        sat = _saturate(slope, knee)
        p = float(np.max(np.abs(slope)))
        if p > peak_slope:
            peak_slope = p
            s_at_peak = float(np.abs(sat[np.argmax(np.abs(slope))]))
            peak_compression = 100.0 * (1.0 - s_at_peak / max(p, 1e-12))
        out.append(leaky_integrate(sat, ds, spatial_leak_hz))

    return ComplianceResult(
        lateral=out[0],
        vertical=out[1],
        peak_slope=peak_slope,
        peak_compression_pct=peak_compression,
    )
