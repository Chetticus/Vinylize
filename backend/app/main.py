"""FastAPI application entry point.

Run locally with:  uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_audio import router as audio_router

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


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
