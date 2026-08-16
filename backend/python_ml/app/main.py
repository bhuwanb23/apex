# Apex ML Microservice — FastAPI entry point (Step 3).
# Runs independently on its own port (default 8001). Node.js calls it over
# HTTP for all heavy statistical work: injury risk, decision EV, momentum Cox,
# timeout recommendations and story generation.

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load python_ml/.env (WP_MODEL_PATH, TIMEOUT_TRAINING_DATA, ...) — uvicorn is
# launched from the python_ml directory, so the .env next to it is the one.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.data.model_cache import model_cache
from app.data.nfl_bridge import is_available as nfl_data_available
from app.routers import decisions, injury, momentum, nfl_data, story, timeout
from app.utils.logger import get_logger

logger = get_logger(__name__)

APP_TITLE = "Apex ML Microservice"
APP_DESCRIPTION = "Statistical and ML models for Apex Sports Intelligence"
APP_VERSION = "1.0.0"

# Node backend (8000) and the frontend (3000) may call us directly.
ALLOWED_ORIGINS = ["http://localhost:8000", "http://localhost:3000"]

# Model modules registered for startup warmup (steps 5-9 implement them).
MODEL_MODULES = [
    "app.models.injury_model",
    "app.models.decision_model",
    "app.models.momentum_model",
    "app.models.timeout_model",
    "app.models.story_model",
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup: load model files, init the model cache, warm up models.
    Warmup makes the first real call fast (library loading happens here)."""
    logger.info("Starting %s v%s", APP_TITLE, APP_VERSION)
    model_cache.clear()
    logger.info("Model cache initialized (%d entries)", model_cache.size())
    _warm_up_models()
    logger.info("Startup complete — ready to serve requests")
    yield
    logger.info("Shutdown complete")


def _warm_up_models() -> None:
    """Best-effort warmup; missing models must never block startup."""
    for module_name in MODEL_MODULES:
        try:
            module = __import__(module_name, fromlist=["warmup"])
            module.warmup()
            logger.info("Warmed up %s", module_name.rsplit(".", 1)[-1])
        except NotImplementedError:
            logger.info("Warmup skipped for %s (not implemented yet)", module_name)
        except Exception as exc:  # noqa: BLE001 — startup must survive any model issue
            logger.warning("Warmup failed for %s: %s", module_name, exc)


app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    lifespan=lifespan,
    # Swagger UI (auto generated) + ReDoc alternative
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — Node.js calls us internally, but the frontend may too (direct calls).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# Feature routers
app.include_router(injury.router)  # /injury
app.include_router(decisions.router)  # /decisions
app.include_router(momentum.router)  # /momentum
app.include_router(timeout.router)  # /timeout
app.include_router(story.router)  # /story
app.include_router(nfl_data.router)  # /nfl


def _model_status(cache_prefix: str | None = None, cache_key: str | None = None) -> str:
    """"loaded" when the model's trained artifact is in the model cache.
    Without it the model degrades to heuristic/rule mode — the endpoints still
    work, but /health lets the Node side know."""
    if cache_key is not None:
        return "loaded" if model_cache.has(cache_key) else "not loaded"
    if cache_prefix is not None:
        return "loaded" if any(k.startswith(cache_prefix) for k in model_cache.keys()) else "not loaded"
    return "not loaded"


@app.get("/health", tags=["system"], summary="Service health check")
async def health() -> dict:
    """Liveness + model readiness — Node's health endpoint pings this and
    uses the model flags to decide what to serve or recompute."""
    return {
        "status": "ok",
        "service": APP_TITLE,
        "version": APP_VERSION,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "models": {
            "wpModel": _model_status(cache_key="wp_model"),
            # The decision EV model embeds its lookup tables in code (no
            # artifact needed) — it is always fully loaded.
            "decisionModel": "loaded",
            "momentumModel": _model_status(cache_prefix="momentum_cox:"),
            "timeoutModel": _model_status(cache_key="timeout_tree"),
        },
        "nflDataAvailable": nfl_data_available(),
        "modelCacheSize": model_cache.size(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
