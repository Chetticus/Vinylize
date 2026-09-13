"""FastAPI application entry point.

Run locally with:  uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes_audio import router as audio_router
from app.api.routes_groove_detail import router as groove_detail_router

app = FastAPI(
    title="Vinylize",
    description="Physics-based vinyl record simulation engine",
    version="0.2.0",
)

# The dev frontend runs on Vite's default port; a production deployment
# should replace this list via environment configuration.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio_router)
app.include_router(groove_detail_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# Single-service deployment (e.g. the Hugging Face Space): the engine also
# serves the built web app, so the site and its /api live on one origin and
# the frontend's relative API paths work unchanged. Mounted last, so every
# /api route above takes precedence. In development Vite serves the app.
_static = os.environ.get("VINYLIZE_STATIC_DIR")
if _static and Path(_static).is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")
