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
from urllib.parse import urlparse, urlunparse
from urllib.request import Request, urlopen

import yaml


def normalize_aiproxy_base_url(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw

    host = (parsed.hostname or "").strip().lower()
    path = (parsed.path or "").rstrip("/")
    if host.startswith("aiproxy.") and not path:
        parsed = parsed._replace(path="/v1")
        return urlunparse(parsed).rstrip("/")

    return raw.rstrip("/")


AIPROXY_PROVIDER_PROFILES = {
    "custom:aiproxy-chat": {
        "name": "aiproxy-chat",
        "path": "/v1",
    },
    "custom:aiproxy-responses": {
        "name": "aiproxy-responses",
        "path": "/v1",
    },
    "custom:aiproxy-anthropic": {
        "name": "aiproxy-anthropic",
        "path": "/anthropic",
    },
}


def is_aiproxy_provider(value: str) -> bool:
    return (value or "").strip().lower() in AIPROXY_PROVIDER_PROFILES


def resolve_aiproxy_base_url(base_url: str, provider: str) -> str:
    raw = normalize_aiproxy_base_url(base_url)
    profile = AIPROXY_PROVIDER_PROFILES.get((provider or "").strip().lower())
    if not raw or not profile or profile["path"] == "/v1":
        return raw

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw

    path = (parsed.path or "").rstrip("/")
    if path and path != "/v1":
        return raw.rstrip("/")

    parsed = parsed._replace(path=profile["path"])
    return urlunparse(parsed).rstrip("/")


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

expected_provider = os.environ.get("AGENT_MODEL_PROVIDER", "").strip() or "custom"
expected_base_url = os.environ.get("AGENT_MODEL_BASEURL", "")
expected_model = os.environ.get("AGENT_MODEL", "").strip()

if model_cfg.get("provider", "").strip() != expected_provider:
    raise SystemExit("model.provider mismatch")
if is_aiproxy_provider(expected_provider):
    custom_providers = config.get("custom_providers") or []
    if not isinstance(custom_providers, list):
        raise SystemExit("custom_providers is invalid")
    provider_name = AIPROXY_PROVIDER_PROFILES[expected_provider.lower()]["name"]
    expected_custom_base_url = resolve_aiproxy_base_url(expected_base_url, expected_provider)
    matched_entry = next(
        (
            entry for entry in custom_providers
            if isinstance(entry, dict)
            and str(entry.get("provider_key", "") or entry.get("name", "")).strip().lower() == provider_name
        ),
        None,
    )
    if matched_entry is None:
        raise SystemExit("custom provider entry missing")
    if expected_custom_base_url and str(matched_entry.get("base_url", "")).strip() != expected_custom_base_url:
        raise SystemExit("custom provider base_url mismatch")
else:
    expected_base_url = normalize_aiproxy_base_url(expected_base_url)
    if expected_base_url and model_cfg.get("base_url", "").strip() != expected_base_url:
        raise SystemExit("model.base_url mismatch")
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
