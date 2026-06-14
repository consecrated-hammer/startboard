"""Simple in-memory, per-IP rate limiting.

A global sliding-window limiter as Starlette middleware, plus a small reusable
`hit_limit()` helper for stricter per-route limits (e.g. login).
"""

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# bucket key -> deque[timestamps]
_buckets: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hit_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Record a hit for `key`; return True if the caller is now over the limit."""
    now = time.monotonic()
    bucket = _buckets[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    bucket.append(now)
    return len(bucket) > max_requests


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int, window_seconds: int, exclude_paths=None):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.exclude_paths = exclude_paths or set()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            path in self.exclude_paths
            or path.startswith("/assets/")
            or path.startswith("/api/icons/")
            or path == "/api/auth/login"
            or path in {"/", "/favicon.ico", "/favicon.svg", "/sw.js"}
        ):
            return await call_next(request)
        key = f"global:{_client_ip(request)}"
        if hit_limit(key, self.max_requests, self.window_seconds):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please slow down."},
            )
        return await call_next(request)
