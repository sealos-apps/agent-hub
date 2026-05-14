#!/usr/bin/env bash
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/opt/data}"
API_SERVER_PORT="${API_SERVER_PORT:-8642}"
PYTHON_BIN="${HERMES_PYTHON_BIN:-/opt/hermes/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

"${PYTHON_BIN}" <<'PY'
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import yaml


hermes_home = Path(os.environ.get("HERMES_HOME", "/opt/data"))
config_path = hermes_home / "config.yaml"
env_path = hermes_home / ".env"

if not config_path.exists():
    raise SystemExit("config.yaml not found")
if not env_path.exists():
    raise SystemExit(".env not found")

config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
model_cfg = config.get("model") or {}
if not isinstance(model_cfg, dict):
    raise SystemExit("model config is invalid")

expected_model = os.environ.get("AGENT_MODEL", "").strip()
if expected_model and model_cfg.get("default", "").strip() != expected_model:
    raise SystemExit("model.default mismatch")

health_url = f"http://127.0.0.1:{os.environ.get('API_SERVER_PORT', '8642')}/health"
with urlopen(Request(health_url), timeout=5) as response:
    payload = json.loads(response.read().decode("utf-8"))
    if payload.get("status") != "ok":
        raise SystemExit("gateway healthcheck failed")

api_key = os.environ.get("API_SERVER_KEY", "").strip()
models_url = f"http://127.0.0.1:{os.environ.get('API_SERVER_PORT', '8642')}/v1/models"
headers = {}
if api_key:
    headers["Authorization"] = f"Bearer {api_key}"

with urlopen(Request(models_url, headers=headers), timeout=5) as response:
    payload = json.loads(response.read().decode("utf-8"))
    if payload.get("object") != "list":
        raise SystemExit("models endpoint returned unexpected payload")
PY
