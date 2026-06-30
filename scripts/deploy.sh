#!/usr/bin/env bash
# Quick-deploy Startboard.
#
# Usage:
#   ./scripts/deploy.sh                 # build + (re)deploy behind Traefik (prod)
#   ./scripts/deploy.sh --dev           # build + deploy locally on :8002 (no Traefik)
#   ./scripts/deploy.sh --no-build      # redeploy current image without rebuilding
#   ./scripts/deploy.sh --no-cache      # rebuild image without Docker layer cache
#   ./scripts/deploy.sh --logs          # follow logs after deploy
#   ./scripts/deploy.sh --seed USER     # seed/update an admin user after deploy (prompts for password)
#   ./scripts/deploy.sh --import FILE --owner USER [--page NAME]   # import a homepage bookmarks.yaml
#
# Flags combine, e.g.:  ./scripts/deploy.sh --dev --seed kevin
#
# ── Host notes (BatServer / start.batserver.au) ──────────────────────────────
# The PROD path below assumes this repo owns the running container. On BatServer
# it does NOT: the live `startboard` container is run by the central aggregated
# compose at /mnt/docker/config/dockerconfigs/docker-compose.yml (compose
# project "config"), which pins ghcr.io/consecrated-hammer/startboard:latest
# with `pull_policy: always`. Three consequences:
#   1. Running this script's prod path collides on container_name "startboard".
#      Deploy the running container from the CENTRAL compose, not from here.
#   2. BuildKit can't resolve DNS on this host (IPv6-only to pypi/npm), so
#      `docker build` fails. Build with --network=host so RUN steps use the
#      working host network.
#   3. To run a LOCAL build (vs. the published image) you must pass
#      `--pull never`, else `pull_policy: always` pulls the older registry image
#      over your build. Local deploys are temporary — the next full
#      `docker compose up` or CI publish replaces them.
# Manual local-deploy sequence used on BatServer:
#   bash ./scripts/package-extension.sh
#   set -a; source ./.env; set +a
#   docker build --network=host -f Dockerfile \
#     -t ghcr.io/consecrated-hammer/startboard:latest \
#     --build-arg VITE_API_BASE_URL=/api \
#     --build-arg "VITE_APP_VERSION=${VITE_APP_VERSION:-dev}" .
#   (cd /mnt/docker/config/dockerconfigs && docker compose up -d --pull never startboard)
# The permanent path is to merge to main so CI publishes :latest to ghcr.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.traefik.yml"
BUILD=1
NO_CACHE=0
FOLLOW=0
SEED_USER=""
IMPORT_FILE=""
IMPORT_OWNER=""
IMPORT_PAGE="Imported"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)       COMPOSE_FILE="docker-compose.dev.yml"; shift ;;
    --no-build)  BUILD=0; shift ;;
    --no-cache)  NO_CACHE=1; shift ;;
    --logs)      FOLLOW=1; shift ;;
    --seed)      SEED_USER="$2"; shift 2 ;;
    --import)    IMPORT_FILE="$2"; shift 2 ;;
    --owner)     IMPORT_OWNER="$2"; shift 2 ;;
    --page)      IMPORT_PAGE="$2"; shift 2 ;;
    -h|--help)   sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

DC="docker compose -f ${COMPOSE_FILE}"
SVC="app"

# Ensure a SECRET_KEY exists and persists (compose reads .env automatically).
if [[ ! -f .env ]] || ! grep -q '^SECRET_KEY=' .env 2>/dev/null; then
  echo "==> No SECRET_KEY in .env — generating one"
  echo "SECRET_KEY=$(openssl rand -hex 24)" >> .env
fi

echo "==> Deploying via ${COMPOSE_FILE}"
if [[ "$BUILD" == "1" ]]; then
  BUILD_ARGS=()
  [[ "$COMPOSE_FILE" == "docker-compose.dev.yml" ]] && BUILD_ARGS+=(--dev)
  [[ "$NO_CACHE" == "1" ]] && BUILD_ARGS+=(--no-cache)
  bash ./scripts/build.sh "${BUILD_ARGS[@]}"
  if [[ "$COMPOSE_FILE" == "docker-compose.dev.yml" ]]; then
    $DC up -d
  else
    $DC up -d --pull never
  fi
else
  if [[ "$COMPOSE_FILE" != "docker-compose.dev.yml" ]]; then
    $DC pull "$SVC"
  fi
  $DC up -d
fi

# Resolve the container name to exec into.
CID="$($DC ps -q "$SVC")"
[[ -z "$CID" ]] && { echo "ERROR: container not running" >&2; exit 1; }

echo "==> Waiting for health…"
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID" 2>/dev/null || true)"
  if [[ "$status" == "healthy" || "$status" == "none" ]]; then
    docker exec "$CID" python3 -c "import urllib.request;urllib.request.urlopen('http://localhost:8002/api/health')" 2>/dev/null && break
  fi
  sleep 1
done
echo "    health: $(docker exec "$CID" sh -c "wget -qO- http://localhost:8002/api/health 2>/dev/null || true" || true)"

if [[ -n "$SEED_USER" ]]; then
  read -rsp "Password for admin '${SEED_USER}': " PW; echo
  docker exec "$CID" python3 -m scripts.seed --username "$SEED_USER" --password "$PW" --role admin
fi

if [[ -n "$IMPORT_FILE" ]]; then
  [[ -z "$IMPORT_OWNER" ]] && { echo "ERROR: --import requires --owner USER" >&2; exit 1; }
  docker cp "$IMPORT_FILE" "$CID:/tmp/import.yaml"
  docker exec "$CID" python3 -m scripts.import_homepage --yaml /tmp/import.yaml --owner "$IMPORT_OWNER" --page "$IMPORT_PAGE"
fi

if [[ "$COMPOSE_FILE" == "docker-compose.dev.yml" ]]; then
  echo "==> Up at http://localhost:8002"
else
  HOST="$(grep -E '^STARTBOARD_HOST=' .env 2>/dev/null | cut -d= -f2)"
  echo "==> Up behind Traefik at https://${HOST:-start.batserver.au}"
fi

[[ "$FOLLOW" == "1" ]] && $DC logs -f "$SVC"
exit 0
