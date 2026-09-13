"""Track observations must survive digital silence next to loud audio."""

from __future__ import annotations

import math

import numpy as np

from app.explain.metrics import analyze


def test_quietest_level_with_digital_silence_is_finite():
    # Loud noise followed by exact zeros: the running mean of squares over
    # the silent stretch can come out fractionally negative, which used to
    # crash the dBFS log with "math domain error" (seen on a real song).
    sr = 48000
    rng = np.random.default_rng(3)
    loud = rng.uniform(-1.0, 1.0, size=(sr * 20, 2)).astype(np.float32)
    silent = np.zeros((sr * 5, 2), dtype=np.float32)
    clip = np.concatenate([loud, silent, loud])

    obs = analyze(clip, clip, sr)

    assert math.isfinite(obs.quietest_rms_dbfs)
    assert obs.quietest_rms_dbfs < -150  # the silence is found, not skipped
