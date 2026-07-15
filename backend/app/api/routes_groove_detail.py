"""Groove inspection endpoint: local high-resolution windows for the 3D
microscope. See app/groove/detail_window.py for the payload format."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.api.sessions import store
from app.groove.detail_window import extract_window

router = APIRouter(prefix="/api")


@router.get("/session/{session_id}/groove-window")
async def groove_window(
    session_id: str,
    t: float = Query(..., description="Playback time (s) to center the window on"),
    span_mm: float = Query(80.0, ge=5.0, le=400.0),
    max_points: int = Query(2000, ge=100, le=8000),
) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    if session.detail_lateral is None or session.detail_vertical is None:
        raise HTTPException(status_code=404, detail="Not processed yet.")

    payload = extract_window(
        session.detail_lateral,
        session.detail_vertical,
        session.detail_ds_m,
        session.detail_start_radius_m,
        t_center_s=t,
        span_mm=span_mm,
        max_points=max_points,
    )
    return Response(content=payload, media_type="application/octet-stream")
