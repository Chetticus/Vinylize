"""Physical constants of the LP record and playback chain.

Every DSP stage and the groove geometry generator read from this module, so the
audio simulation and the 3D visualization are guaranteed to describe the same
physical disc. Units are SI (meters, seconds, radians) unless suffixed.
"""

from __future__ import annotations

import math

# ---------------------------------------------------------------------------
# Disc geometry (standard 12" LP, 33 1/3 RPM)
# ---------------------------------------------------------------------------

RPM: float = 100.0 / 3.0
"""Platter speed: 33 1/3 revolutions per minute."""

OMEGA: float = 2.0 * math.pi * RPM / 60.0
"""Nominal angular velocity in rad/s (~3.49)."""

OUTER_RADIUS_M: float = 0.146
"""Radius where the program area starts on a 12\" LP (~146 mm)."""

INNER_RADIUS_M: float = 0.060
"""Innermost allowed program radius per IEC 98 (~60 mm). Linear groove speed
here is ~2.4x slower than at the outer edge — the root cause of every
radius-dependent effect in the pipeline."""

GROOVE_PITCH_M: float = 250e-6
"""Radial spacing between adjacent groove revolutions. Real mastering varies
this with program loudness; we model the constant-pitch case (see DESIGN.md)."""

GROOVE_HALF_WIDTH_M: float = 30e-6
"""Half-width of the groove opening at the disc surface (~60 um wide total)."""

# ---------------------------------------------------------------------------
# Signal calibration
# ---------------------------------------------------------------------------

PEAK_GROOVE_VELOCITY_MS: float = 0.10
"""Lateral groove-wall velocity assigned to a 0 dBFS sample (10 cm/s -- a hot
but legal cut; reference level on test records is ~3.54 cm/s RMS at 1 kHz).
This calibration is what lets us report groove excursion in real micrometers:
a full-scale 1 kHz tone gives x = v / (2*pi*f) ~= 16 um of excursion."""

# ---------------------------------------------------------------------------
# Stylus & cartridge mechanics
# ---------------------------------------------------------------------------

STYLUS_CONTACT_SIGMA_M: float = 8e-6
"""Effective contact-patch radius of a conical stylus tip (~8 um). Used as the
standard deviation of the spatial smoothing kernel in the StylusContact stage:
the stylus cannot respond to groove detail smaller than its own footprint."""

TONEARM_RESONANCE_HZ: float = 9.0
"""Tonearm/cartridge-compliance resonance (typically 8-12 Hz). Acts as the
physical high-pass of the playback system; we use it as the leak frequency of
the displacement integrator so numerical DC drift is controlled by the same
mechanism reality uses."""

CARTRIDGE_RESONANCE_HZ: float = 5000.0
"""Cantilever mechanical resonance excited by groove defects (clicks ring at
roughly this frequency for a few milliseconds)."""

CARTRIDGE_RESONANCE_Q: float = 6.0
"""Quality factor of the cantilever resonance (lightly damped)."""

# ---------------------------------------------------------------------------
# RIAA time constants (IEC 60098)
# ---------------------------------------------------------------------------

RIAA_T1_S: float = 3180e-6
"""Low-frequency shelf (50.05 Hz): limits bass boost on playback."""

RIAA_T2_S: float = 318e-6
"""Transition (500.5 Hz): boundary between constant-amplitude and
constant-velocity cutting regimes."""

RIAA_T3_S: float = 75e-6
"""High-frequency emphasis corner (2122 Hz): treble is boosted before cutting
to lift it above surface noise, then symmetrically cut on playback."""

RIAA_T4_S: float = 3.18e-6
"""The 'Neumann pole' (~50 kHz). The textbook RIAA pre-emphasis transfer
function has one more zero than poles and therefore unbounded gain at high
frequency; real cutting amplifiers add this pole to keep gain finite. We need
it for the same reason: it makes the transfer function proper so the bilinear
transform is applicable."""

# ---------------------------------------------------------------------------
# Turntable speed stability
# ---------------------------------------------------------------------------

WOW_RATE_HZ: float = 0.556
"""Dominant wow component: once per revolution (33.33 RPM / 60 = 0.556 Hz),
caused by spindle-hole eccentricity — the record itself is mounted slightly
off-center."""

WOW_DEPTH: float = 0.0020
"""Peak relative speed deviation from wow (0.20% — a mid-tier turntable)."""

FLUTTER_RATE_HZ: float = 33.0
"""Flutter component: motor pole / belt tooth rate (tens of Hz)."""

FLUTTER_DEPTH: float = 0.0006
"""Peak relative speed deviation from flutter (0.06%)."""

# ---------------------------------------------------------------------------
# Surface defects & noise
# ---------------------------------------------------------------------------

CLICK_DENSITY_PER_M: float = 6.0
"""Mean defect count per meter of groove for a lightly-worn record. Defects
are roughly uniform per unit groove LENGTH, so the click rate in TIME scales
with local groove speed v(r) = omega * r — i.e. slightly FEWER clicks per
second near the center, contrary to popular belief (see DESIGN.md 4.2)."""

SURFACE_NOISE_DBFS: float = -66.0
"""Broadband pink surface-noise floor relative to full scale."""

RUMBLE_DBFS: float = -58.0
"""Low-frequency bearing/motor rumble level (concentrated below ~30 Hz)."""

RUMBLE_CUTOFF_HZ: float = 22.0
"""Rumble spectral concentration corner."""

# ---------------------------------------------------------------------------
# Crosstalk
# ---------------------------------------------------------------------------

CROSSTALK_DB_AT_1KHZ: float = -30.0
"""Channel separation of a decent cartridge at 1 kHz."""

CROSSTALK_HF_CORNER_HZ: float = 6000.0
"""Above this, mechanical coupling in the cantilever suspension worsens and
separation degrades by ~6 dB/octave."""

CROSSTALK_HF_EXTRA_DB: float = 10.0
"""Additional leakage reached well above the corner."""

LEAD_IN_SECONDS: float = 6.0
"""Silent lead-in prepended to every clip before cutting. This is not a fade
or an audio effect: the pipeline genuinely cuts ~3 turns of unmodulated
groove, so the stylus rides real silent vinyl — hiss, rumble, clicks and all
— before the first musical groove arrives, exactly as on a pressed record.
The original (A/B reference) is padded with the same silence so the two
renditions stay sample-locked."""

# ---------------------------------------------------------------------------
# Processing limits
# ---------------------------------------------------------------------------

MAX_CLIP_SECONDS: float = 180.0
"""Only the first N seconds of an upload are processed. Three minutes — a
whole radio-edit song — is the ceiling where the synchronous-request
architecture still holds after the v0.3 optimizations (float32 spatial
domain, 2x oversampling with cubic interpolation, 16-bit transfer): ~10 s of
compute and a few hundred MB peak per render, with stage-level progress
reported to the UI. Raising it further is a job-queue conversation, not a
constant edit — see DESIGN.md 9/10."""

MAX_UPLOAD_BYTES: int = 150 * 1024 * 1024
"""Reject uploads larger than 150 MB before decoding. Sized for the clip cap:
a 3-minute stereo float32 WAV at 96 kHz is ~138 MB, and users legitimately
upload whole songs of which only the first MAX_CLIP_SECONDS are decoded (the
decoder reads capped frames, so decoded memory stays bounded regardless)."""

SPATIAL_OVERSAMPLE: float = 2.0
"""The spatial grid is sampled at (fs / v_min) * this factor so that even at
the slowest point of the clip the groove is sampled finer than the audio
Nyquist detail it must carry. v0.1 used 4x with *linear* interpolation; v0.3
uses 2x with *cubic* (Catmull-Rom) interpolation, whose error falls as the
4th power of the oversampling ratio instead of the 2nd — better accuracy at
half the memory and half the resampling work, which is what makes 3-minute
clips viable (the round-trip transparency test still guards this)."""
