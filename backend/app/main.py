# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.trigger import router as trigger_router
from app.api.build import router as build_router

app = FastAPI(
    title="Predict-Xplore Compute Gateway",
    description="Stateless ML Inference Gateway — receives pipeline triggers from Next.js and dispatches Celery tasks.",
    version="0.1.0",
)

# Allow Next.js dev server and production URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trigger_router)
app.include_router(build_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "predict-xplore-backend"}
