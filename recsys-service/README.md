# recsys-service

Phase 3 personalization microservice for the bazaar recommendation system.

## Purpose

Hosts the matrix-factorization (ALS) model trained on `Order` x `Product` implicit
feedback and exposes a thin HTTP API consumed by `bazaar-backend` via
`personalizationService.alsScore()`.

## Stack

- Python 3.11+
- FastAPI + uvicorn
- `implicit` (Cython ALS)
- pymongo for nightly retrain reads

## Contract

```
POST /score
{
  "userId": "string",
  "candidateIds": ["productId", ...],   // optional; if omitted, top-k overall
  "k": 20
}

200 OK
{
  "items": [{ "productId": "string", "score": 0.0 }, ...]
}
```

`bazaar-backend` calls with an 800ms timeout. Return 503 (not 500) when the
model is still loading so the caller falls back gracefully.

## Training

`scripts/train.py` runs nightly:

1. Pulls `Order` + `OrderDetail` from MongoDB (lookback configurable, default 365d)
2. Builds a sparse user×item matrix using purchase counts as implicit signal
3. Fits `implicit.als.AlternatingLeastSquares(factors=64, regularization=0.05)`
4. Writes `model.npz` + `userIndex.json` + `itemIndex.json` to disk
5. Triggers `/reload` on the running service (or supervisor restart)

## Deployment

Out of scope for this commit. Recommended path: dedicated container in the
same network as `bazaar-backend`, exposed only on the internal network.
Set `RECSYS_URL=http://recsys:8000` in the backend environment to enable.

## Status

**Scaffolded — not yet implemented.** This README documents the intended
interface so backend code can be built against it. Implementation tracked
under Phase 3 of the recommendation roadmap.
