#!/usr/bin/env bash
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/opt/data}"
INSTALL_DIR="${INSTALL_DIR:-/opt/hermes}"
PYTHON_BIN="${HERMES_PYTHON_BIN:-${INSTALL_DIR}/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

mkdir -p "${HERMES_HOME}"

if [[ ! -f "${HERMES_HOME}/.env" && -f "${INSTALL_DIR}/.env.example" ]]; then
  cp "${INSTALL_DIR}/.env.example" "${HERMES_HOME}/.env"
fi

if [[ ! -f "${HERMES_HOME}/config.yaml" && -f "${INSTALL_DIR}/cli-config.yaml.example" ]]; then
  cp "${INSTALL_DIR}/cli-config.yaml.example" "${HERMES_HOME}/config.yaml"
fi

"${PYTHON_BIN}" <<'PY'
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import yaml


def atomic_write(path: Path, content: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def update_env_file(path: Path, values: dict[str, str | None]) -> None:
    existing: list[str] = []
    if path.exists():
        existing = path.read_text(encoding="utf-8").splitlines()

    remaining = dict(values)
    output: list[str] = []
    for line in existing:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue

        key, _, _ = line.partition("=")
        key = key.strip()
        if key in remaining:
            value = remaining.pop(key)
            if value is None:
                continue
            output.append(f"{key}={value}")
        else:
            output.append(line)

    for key, value in remaining.items():
        if value is None:
            continue
        output.append(f"{key}={value}")

    atomic_write(path, "\n".join(output).rstrip() + "\n")


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


AIPROXY_API_KEY_ENV = "AIPROXY_API_KEY"
AIPROXY_PROVIDER_PROFILES = {
    "custom:aiproxy-chat": {
        "name": "aiproxy-chat",
        "api_mode": "chat_completions",
        "path": "/v1",
    },
    "custom:aiproxy-responses": {
        "name": "aiproxy-responses",
        "api_mode": "codex_responses",
        "path": "/v1",
    },
    "custom:aiproxy-anthropic": {
        "name": "aiproxy-anthropic",
        "api_mode": "anthropic_messages",
        "path": "/anthropic",
    },
}


def is_aiproxy_provider(value: str) -> bool:
    return (value or "").strip().lower() in AIPROXY_PROVIDER_PROFILES


def is_aiproxy_responses_model(model_name: str) -> bool:
    return (model_name or "").strip().lower().startswith("gpt-5")


def is_aiproxy_anthropic_model(model_name: str) -> bool:
    return (model_name or "").strip().lower().startswith("claude")


def resolve_aiproxy_provider(provider: str, model_name: str) -> tuple[str, dict[str, str]]:
    normalized = (provider or "").strip().lower()
    if normalized in AIPROXY_PROVIDER_PROFILES:
        return normalized, AIPROXY_PROVIDER_PROFILES[normalized]

    if is_aiproxy_responses_model(model_name):
        normalized = "custom:aiproxy-responses"
    elif is_aiproxy_anthropic_model(model_name):
        normalized = "custom:aiproxy-anthropic"
    else:
        normalized = "custom:aiproxy-chat"

    return normalized, AIPROXY_PROVIDER_PROFILES[normalized]


def resolve_aiproxy_provider_base_url(base_url: str, provider: str, model_name: str = "") -> str:
    normalized, profile = resolve_aiproxy_provider(provider, model_name)
    raw = normalize_aiproxy_base_url(base_url)
    if not raw or profile["path"] == "/v1":
        return raw

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw

    path = (parsed.path or "").rstrip("/")
    if path and path != "/v1":
        return raw.rstrip("/")

    parsed = parsed._replace(path=profile["path"])
    return urlunparse(parsed).rstrip("/")


def upsert_aiproxy_custom_providers(config: dict, base_url: str, active_provider: str, model_name: str) -> None:
    existing_entries = config.get("custom_providers")
    if not isinstance(existing_entries, list):
        existing_entries = []

    managed_names = {
        profile["name"]
        for profile in AIPROXY_PROVIDER_PROFILES.values()
    }
    managed_entries: list[dict] = []
    remaining_entries: list[dict] = []

    for entry in existing_entries:
        if not isinstance(entry, dict):
            continue
        entry_name = str(entry.get("name", "") or "").strip().lower()
        provider_key = str(entry.get("provider_key", "") or "").strip().lower()
        if entry_name in managed_names or provider_key in managed_names:
            managed_entries.append(dict(entry))
        else:
            remaining_entries.append(entry)

    indexed_entries = {
        str(entry.get("provider_key") or entry.get("name") or "").strip().lower(): entry
        for entry in managed_entries
        if isinstance(entry, dict)
    }

    normalized_active, _ = resolve_aiproxy_provider(active_provider, model_name)
    next_entries: list[dict] = []
    for provider_id, profile in AIPROXY_PROVIDER_PROFILES.items():
        provider_name = profile["name"]
        entry = indexed_entries.get(provider_name, {})
        entry["name"] = provider_name
        entry["provider_key"] = provider_name
        entry["key_env"] = AIPROXY_API_KEY_ENV
        entry["base_url"] = resolve_aiproxy_provider_base_url(base_url, provider_id)
        entry["api_mode"] = profile["api_mode"]
        if provider_id == normalized_active and model_name:
            entry["model"] = model_name
        else:
            entry.pop("model", None)
        next_entries.append(entry)

    config["custom_providers"] = next_entries + remaining_entries


hermes_home = Path(os.environ.get("HERMES_HOME", "/opt/data"))
config_path = hermes_home / "config.yaml"
env_path = hermes_home / ".env"

config = load_yaml(config_path)
model_cfg = config.get("model")
if not isinstance(model_cfg, dict):
    model_cfg = {}
config["model"] = model_cfg

provider = os.environ.get("AGENT_MODEL_PROVIDER", "").strip() or "custom"
model_name = os.environ.get("AGENT_MODEL", "").strip()
base_url = os.environ.get("AGENT_MODEL_BASEURL", "")

if is_aiproxy_provider(provider):
    provider, _ = resolve_aiproxy_provider(provider, model_name)
    resolved_base_url = resolve_aiproxy_provider_base_url(base_url, provider, model_name)
    model_cfg["provider"] = provider
    model_cfg.pop("base_url", None)
    model_cfg.pop("api_mode", None)
    if model_name:
        model_cfg["default"] = model_name
    upsert_aiproxy_custom_providers(config, base_url, provider, model_name)
else:
    resolved_base_url = normalize_aiproxy_base_url(base_url)
    model_cfg["provider"] = provider
    if resolved_base_url:
        model_cfg["base_url"] = resolved_base_url
    model_cfg.pop("api_mode", None)
if model_name:
    model_cfg["default"] = model_name

atomic_write(
    config_path,
    yaml.safe_dump(config, sort_keys=False, allow_unicode=True),
)

env_updates = {}
api_key = os.environ.get("AGENT_MODEL_APIKEY", "").strip()
if is_aiproxy_provider(provider):
    env_updates["OPENAI_BASE_URL"] = None
    env_updates["OPENAI_API_KEY"] = None
    if api_key:
        env_updates[AIPROXY_API_KEY_ENV] = api_key
else:
    env_updates[AIPROXY_API_KEY_ENV] = None
    if api_key:
        env_updates["OPENAI_API_KEY"] = api_key
    if resolved_base_url:
        env_updates["OPENAI_BASE_URL"] = resolved_base_url

if env_updates:
    update_env_file(env_path, env_updates)
PY
