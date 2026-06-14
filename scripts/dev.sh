#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
VENV_DIR="${ROOT_DIR}/.venv"
VENV_BIN="${VENV_DIR}/bin"
DEV_DATA_DIR="${ROOT_DIR}/.data/dev"

cd "${ROOT_DIR}"

lint_only=false
build_only=false
skip_tests=false
test_only=false

usage() {
  cat <<EOF
Usage: ./scripts/dev.sh [--lint-only] [--build-only] [--test-only] [--skip-tests] [--help]

Defaults to running frontend lint, backend smoke checks, then starting:
  - FastAPI locally with --reload
  - Vite locally

This is the immediate-feedback dev path for Startboard.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lint-only) lint_only=true ;;
    --build-only) build_only=true ;;
    --test-only) test_only=true ;;
    --skip-tests) skip_tests=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

ensure_frontend_deps() {
  if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "${FRONTEND_DIR}" && npm install)
  fi
}

ensure_backend_venv() {
  if [[ ! -x "${VENV_BIN}/python" ]]; then
    echo "Creating local Python virtualenv..."
    python3 -m venv "${VENV_DIR}"
  fi

  if [[ ! -f "${VENV_DIR}/.deps-installed" || "${BACKEND_DIR}/requirements.txt" -nt "${VENV_DIR}/.deps-installed" ]]; then
    echo "Installing backend dependencies..."
    "${VENV_BIN}/pip" install -r "${BACKEND_DIR}/requirements.txt" >/dev/null
    touch "${VENV_DIR}/.deps-installed"
  fi
}

load_env() {
  if [[ -f "${ROOT_DIR}/.env.dev" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.env.dev"
    set +a
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" | grep -q LISTEN
    return
  fi
  return 1
}

collect_matching_pids() {
  local pattern="$1"
  pgrep -f "${pattern}" 2>/dev/null || true
}

kill_matching_processes() {
  local label="$1"
  local pattern="$2"
  local pids
  pids="$(collect_matching_pids "${pattern}")"
  if [[ -n "${pids}" ]]; then
    echo "Stopping existing ${label}: ${pids}"
    kill ${pids} >/dev/null 2>&1 || true
    sleep 1
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

run_lint() {
  echo "Running frontend lint..."
  ensure_frontend_deps
  (cd "${FRONTEND_DIR}" && npm run lint)
}

run_tests() {
  echo "Running backend smoke checks..."
  ensure_backend_venv
  load_env
  mkdir -p "${DEV_DATA_DIR}/icons" "${DEV_DATA_DIR}/logs"
  export APP_ENV="${APP_ENV:-development}"
  export SECRET_KEY="${SECRET_KEY:-dev-secret-change-me}"
  export STARTBOARD_DB_PATH="${STARTBOARD_DB_PATH:-${DEV_DATA_DIR}/startboard.db}"
  export FAVICON_DIR="${FAVICON_DIR:-${DEV_DATA_DIR}/icons}"
  export LOG_DIR="${LOG_DIR:-${DEV_DATA_DIR}/logs}"
  export MANAGED_IMAGES_DIR="${MANAGED_IMAGES_DIR:-${DEV_DATA_DIR}/managed-images}"
  export MANAGED_VARIANTS_DIR="${MANAGED_VARIANTS_DIR:-${DEV_DATA_DIR}/managed-variants}"
  export MANAGED_IMAGE_IMPORT_DIR="${MANAGED_IMAGE_IMPORT_DIR:-${DEV_DATA_DIR}/imports}"
  export FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:${DEV_FRONTEND_PORT:-5173}}"
  export FRONTEND_ALLOWED_ORIGINS="${FRONTEND_ALLOWED_ORIGINS:-http://127.0.0.1:${DEV_FRONTEND_PORT:-5173},http://localhost:${DEV_FRONTEND_PORT:-5173}}"
  PYTHONPATH="${BACKEND_DIR}" "${VENV_BIN}/python" -m compileall "${BACKEND_DIR}/app" >/dev/null
}

run_build() {
  echo "Building frontend locally..."
  ensure_frontend_deps
  load_env
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
  export VITE_APP_VERSION="$(git describe --tags --always 2>/dev/null || echo 'dev')"
  (cd "${FRONTEND_DIR}" && npm run build)
}

run_local() {
  ensure_frontend_deps
  ensure_backend_venv
  load_env

  local bind_host="${DEV_BIND_HOST:-0.0.0.0}"
  local public_host="${DEV_PUBLIC_HOST:-127.0.0.1}"
  local backend_port="${DEV_BACKEND_PORT:-8002}"
  local frontend_port="${DEV_FRONTEND_PORT:-5173}"

  mkdir -p "${DEV_DATA_DIR}/icons" "${DEV_DATA_DIR}/logs"

  export APP_ENV="${APP_ENV:-development}"
  export SECRET_KEY="${SECRET_KEY:-dev-secret-change-me}"
  export BACKEND_HOST="${BACKEND_HOST:-${bind_host}}"
  export BACKEND_PORT="${BACKEND_PORT:-${backend_port}}"
  export STARTBOARD_DB_PATH="${STARTBOARD_DB_PATH:-${DEV_DATA_DIR}/startboard.db}"
  export FAVICON_DIR="${FAVICON_DIR:-${DEV_DATA_DIR}/icons}"
  export LOG_DIR="${LOG_DIR:-${DEV_DATA_DIR}/logs}"
  export MANAGED_IMAGES_DIR="${MANAGED_IMAGES_DIR:-${DEV_DATA_DIR}/managed-images}"
  export MANAGED_VARIANTS_DIR="${MANAGED_VARIANTS_DIR:-${DEV_DATA_DIR}/managed-variants}"
  export MANAGED_IMAGE_IMPORT_DIR="${MANAGED_IMAGE_IMPORT_DIR:-${DEV_DATA_DIR}/imports}"
  export SESSION_COOKIE_SECURE=false
  export FRONTEND_URL="${FRONTEND_URL:-http://${public_host}:${frontend_port}}"
  export FRONTEND_ALLOWED_ORIGINS="${FRONTEND_ALLOWED_ORIGINS:-http://${public_host}:${frontend_port},http://localhost:${frontend_port}}"
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
  export VITE_APP_VERSION="${VITE_APP_VERSION:-dev-local}"

  local backend_pattern="uvicorn app.main:app --reload --host ${bind_host} --port ${backend_port}"
  local frontend_pattern="vite --host ${bind_host} --port ${frontend_port}"

  if [[ -n "$(collect_matching_pids "${backend_pattern}")" || -n "$(collect_matching_pids "${frontend_pattern}")" ]]; then
    echo "Cleaning up existing Startboard dev processes..."
    kill_matching_processes "backend" "${backend_pattern}"
    kill_matching_processes "frontend" "${frontend_pattern}"
    sleep 1
  fi

  if port_in_use "${backend_port}"; then
    echo "Backend port ${backend_port} is already in use." >&2
    echo "Stop the conflicting service or change DEV_BACKEND_PORT in .env.dev." >&2
    exit 1
  fi

  if port_in_use "${frontend_port}"; then
    echo "Frontend port ${frontend_port} is already in use." >&2
    echo "Stop the conflicting service or change DEV_FRONTEND_PORT in .env.dev." >&2
    exit 1
  fi

  echo "Starting local backend on http://${public_host}:${backend_port}"
  (
    cd "${BACKEND_DIR}"
    PYTHONPATH="${BACKEND_DIR}" "${VENV_BIN}/uvicorn" app.main:app --reload --host "${bind_host}" --port "${backend_port}"
  ) >/tmp/startboard-api.log 2>&1 &
  backend_pid=$!

  cleanup() {
    if kill -0 "${backend_pid}" >/dev/null 2>&1; then
      kill "${backend_pid}" >/dev/null 2>&1 || true
      wait "${backend_pid}" 2>/dev/null || true
    fi
  }

  trap cleanup EXIT INT TERM

  echo "Backend log: /tmp/startboard-api.log"
  echo "Frontend: http://${public_host}:${frontend_port}"
  echo "Backend:  http://${public_host}:${backend_port}"
  echo "Data dir: ${DEV_DATA_DIR}"
  echo "Press Ctrl+C to stop both processes."

  (cd "${FRONTEND_DIR}" && npm run dev -- --host "${bind_host}" --port "${frontend_port}")
}

if [[ "${test_only}" == "true" ]]; then
  run_tests
  exit 0
fi

if [[ "${build_only}" == "true" ]]; then
  run_build
  exit 0
fi

run_lint

if [[ "${lint_only}" == "true" ]]; then
  exit 0
fi

if [[ "${skip_tests}" == "false" ]]; then
  run_tests
fi

run_local
