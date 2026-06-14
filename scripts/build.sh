#!/usr/bin/env bash
# Standard Startboard build entrypoint.
#
# Usage:
#   ./scripts/build.sh               # build prod image via traefik compose file
#   ./scripts/build.sh --dev         # build dev image via local compose file
#   ./scripts/build.sh --no-cache    # force a clean docker build
#
# This script is intentionally build-only. Deployment lives in deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.traefik.yml"
NO_CACHE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)       COMPOSE_FILE="docker-compose.dev.yml"; shift ;;
    --no-cache)  NO_CACHE=1; shift ;;
    -h|--help)   sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo "==> Packaging Edge companion extension"
bash ./scripts/package-extension.sh

echo "==> Building via ${COMPOSE_FILE}"
if [[ "$COMPOSE_FILE" == "docker-compose.dev.yml" ]]; then
  DC=(docker compose -f "$COMPOSE_FILE")
  if [[ "$NO_CACHE" == "1" ]]; then
    "${DC[@]}" build --no-cache
  else
    "${DC[@]}" build
  fi
else
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    source ./.env
  fi
  IMAGE="ghcr.io/consecrated-hammer/startboard:${TAG:-latest}"
  BUILD_ARGS=(
    docker build
    -f Dockerfile
    -t "$IMAGE"
    --build-arg "VITE_API_BASE_URL=/api"
    --build-arg "VITE_APP_VERSION=${VITE_APP_VERSION:-dev}"
    .
  )
  if [[ "$NO_CACHE" == "1" ]]; then
    BUILD_ARGS=(docker build --no-cache -f Dockerfile -t "$IMAGE" --build-arg "VITE_API_BASE_URL=/api" --build-arg "VITE_APP_VERSION=${VITE_APP_VERSION:-dev}" .)
  fi
  "${BUILD_ARGS[@]}"
fi

echo "==> Build completed"
