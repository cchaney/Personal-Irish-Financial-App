"""Key/value settings stored in SQLite, with defaults."""
import copy
import os

from sqlmodel import Session

from ..models import Setting

DEFAULTS = {
    "profile": {
        "name": "",
        "date_of_birth": "1992-01-01",
        "gross_salary": 55000,
        "salary_growth": 2.5,
        "retirement_age": 66,
        "tax_status": "single",       # single | married_one_income | married_two_incomes
        "partner_income": 0,
        "emergency_months_target": 6,
        "target_retirement_income": 35000,
    },
    "assumptions": {
        "inflation": 2.0,
        "cash_rate": 2.0,
        "post_retirement_return": 4.0,
        "drawdown_to_age": 90,
    },
    "ai": {
        "provider": os.environ.get("PIFA_AI_PROVIDER", "none"),   # none | ollama | openai | anthropic
        "ollama_url": os.environ.get("OLLAMA_URL", "http://ollama:11434"),
        "ollama_model": os.environ.get("OLLAMA_MODEL", "llama3.1:8b"),
        "openai_base_url": os.environ.get("OPENAI_BASE_URL", "http://host.docker.internal:1234/v1"),
        "openai_model": os.environ.get("OPENAI_MODEL", ""),
        "anthropic_model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5"),
        "share_merchant_names": True,
    },
}


def get(session: Session, key: str) -> dict:
    row = session.get(Setting, key)
    merged = copy.deepcopy(DEFAULTS.get(key, {}))
    if row and row.value:
        merged.update(row.value)
    return merged


def put(session: Session, key: str, value: dict) -> dict:
    current = get(session, key)
    current.update(value or {})
    row = session.get(Setting, key)
    if row:
        row.value = current
    else:
        row = Setting(key=key, value=current)
    session.add(row)
    session.commit()
    return current


def offline_mode() -> bool:
    return os.environ.get("PIFA_OFFLINE", "false").lower() in ("1", "true", "yes")
