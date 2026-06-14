# =============================================================================
# Startboard — unified image: Vite frontend built, then served by FastAPI.
# (Frontend lives under frontend/ — added in build increment B.)
# =============================================================================

# ---- Stage 1: build the React/Vite frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_APP_VERSION=unknown
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build

# ---- Stage 2: FastAPI backend serving the built SPA ----
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY extension/edge-companion ./extension/edge-companion
COPY --from=frontend-build /frontend/dist ./app/static

RUN python3 - <<'PY'
from pathlib import Path
import shutil
import zipfile

src = Path("/app/extension/edge-companion")
out_dir = Path("/app/app/extension_dist")
unpacked = out_dir / "startboard-edge-companion"
zip_path = out_dir / "startboard-edge-companion.zip"

if unpacked.exists():
    shutil.rmtree(unpacked)
if zip_path.exists():
    zip_path.unlink()

out_dir.mkdir(parents=True, exist_ok=True)
shutil.copytree(src, unpacked)

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(unpacked.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(out_dir))
PY

RUN mkdir -p /data
EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/api/health')"

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
