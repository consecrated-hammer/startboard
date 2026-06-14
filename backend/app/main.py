"""Startboard — FastAPI application entrypoint.

Serves the JSON API under /api and the built React SPA as static files.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, Response

from app.config import settings
from app.db.database import init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.routes import admin, auth, bookmarks, extension, groups, images, inbox, pages, public, settings as settings_routes
from app.services.docker_status import docker_status_loop
from app.services.icon_store import icon_dir
from app.utils.session_manager import cleanup_expired_sessions

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

API_PREFIX = "/api"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    removed = cleanup_expired_sessions()
    logger.info("Startboard starting (env=%s); pruned %d expired sessions", settings.app_env, removed)
    docker_task = asyncio.create_task(docker_status_loop())
    yield
    docker_task.cancel()
    try:
        await docker_task
    except asyncio.CancelledError:
        pass
    logger.info("Startboard shutting down")


app = FastAPI(title="Startboard API", version="0.1.0", lifespan=lifespan)

# CORS only matters in dev (Vite on a different origin). In prod the SPA is
# same-origin so these are unused.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers under /api.
for r in (auth, pages, groups, bookmarks, images, inbox, admin, public, settings_routes, extension):
    app.include_router(r.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health")
def health():
    return {"status": "ok"}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.url.path.startswith(API_PREFIX):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response


app.add_middleware(SecurityHeadersMiddleware)

if settings.rate_limit_enabled:
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=settings.rate_limit_requests_per_minute,
        window_seconds=settings.rate_limit_window_seconds,
        exclude_paths={f"{API_PREFIX}/health"},
    )

# User/bookmark icons are cached locally and remain publicly readable for
# authenticated and shared boards. Mount this before the SPA routes so
# /api/icons/* is handled by StaticFiles instead of the frontend catch-all.
app.mount(f"{API_PREFIX}/icons", StaticFiles(directory=str(icon_dir())), name="bookmark-icons")


# Serve the built frontend (if present). The Dockerfile copies Vite's dist here.
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    static_root = static_dir.resolve()
    assets_dir = static_root / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    index_path = static_root / "index.html"
    static_files = {e.name: e for e in static_root.iterdir() if e.is_file()}

    @app.get("/", response_class=FileResponse)
    async def serve_index():
        return FileResponse(str(index_path))

    @app.get("/{full_path:path}", response_class=FileResponse)
    async def spa_catch_all(full_path: str):
        # Real 404 (JSON) for unknown API paths; never mask them with the SPA shell.
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        target = static_files.get(full_path)
        if target and target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(index_path))
else:
    logger.warning("No static dir at %s — serving API only (run the frontend via Vite).", static_dir)
