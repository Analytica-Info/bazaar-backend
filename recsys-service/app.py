"""
recsys-service — Phase 3 ALS personalization microservice (skeleton).

This is a runnable scaffold. The actual ALS model integration is left as a
follow-up: the `/score` endpoint currently returns an empty list so the
backend's graceful-fallback path keeps working in dev. Wire in `implicit`
training + a loaded model to make this useful.

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="bazaar-recsys", version="0.1.0")


class ScoreRequest(BaseModel):
    userId: str
    candidateIds: Optional[List[str]] = None
    k: int = 20


class ScoredItem(BaseModel):
    productId: str
    score: float


class ScoreResponse(BaseModel):
    items: List[ScoredItem]


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "model_loaded": False}


@app.post("/score", response_model=ScoreResponse)
def score(_req: ScoreRequest) -> ScoreResponse:
    # Phase 3 TODO: load ALS model and return real scores. Until then, return
    # an empty list so bazaar-backend falls back to user-vector personalization.
    return ScoreResponse(items=[])


@app.post("/reload")
def reload_model() -> dict:
    # Phase 3 TODO: re-read model artifacts from disk after nightly training.
    return {"status": "ok", "reloaded": False}
