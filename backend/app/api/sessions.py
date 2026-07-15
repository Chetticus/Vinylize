"""In-memory session store.

Holds decoded uploads and the most recent processed result per session so the
binary buffer endpoints can serve them. Deliberately simple (single-process,
LRU-bounded dict): the duration cap keeps per-session memory small, and a
portfolio deployment is single-instance — see DESIGN.md 9 for the scaling
caveat.
"""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np

from app.audio.ingestion import DecodedAudio

# A 3-minute stereo session holds ~120 MB (decoded samples + two 16-bit WAVs
# + geometry), so the LRU is small. The frontend library caps its list to the
# same number — keep them in sync or library entries will dangle.
_MAX_SESSIONS = 4


@dataclass
class Session:
    session_id: str
    audio: DecodedAudio
    filename: str
    # Filled by /api/process:
    vinyl_wav: bytes | None = None
    original_wav: bytes | None = None
    geometry_bin: bytes | None = None
    # Live render progress, polled by GET .../progress while /process runs.
    # Written from the worker thread, read from the event loop — a plain
    # (float, str) tuple swap is atomic enough for a progress bar.
    progress_frac: float = 0.0
    progress_label: str = ""


class SessionStore:
    """Thread-safe LRU store (FastAPI may serve requests from many threads)."""

    def __init__(self, max_sessions: int = _MAX_SESSIONS) -> None:
        self._lock = threading.Lock()
        self._sessions: OrderedDict[str, Session] = OrderedDict()
        self._max = max_sessions

    def create(self, audio: DecodedAudio, filename: str) -> Session:
        session = Session(session_id=uuid.uuid4().hex, audio=audio, filename=filename)
        with self._lock:
            self._sessions[session.session_id] = session
            while len(self._sessions) > self._max:
                self._sessions.popitem(last=False)  # evict least recently used
        return session

    def get(self, session_id: str) -> Session | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                self._sessions.move_to_end(session_id)
            return session


store = SessionStore()
"""Module-level singleton used by the route handlers."""
