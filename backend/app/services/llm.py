"""
AI coach. Supports three back-ends:
  - ollama     : fully local (default in docker-compose 'ai' profile). Nothing leaves your machine.
  - openai     : any OpenAI-compatible local server (LM Studio, llama.cpp, vLLM, Jan...).
  - anthropic  : Claude via the Anthropic API. Sends an anonymised summary to the cloud.
"""
import json
import os

import httpx

from . import irish_tax as tax
from .settings import offline_mode

SYSTEM_PROMPT = """You are the money coach inside PIFA (Personal Irish Financial App), a private personal-finance app for someone living in Ireland.

You receive a JSON snapshot of their finances (balances, cash flow, spending, pensions, investments, debts,
and rule-based insights already computed). Use it to give specific, practical suggestions in euro.

How to answer:
- Lead with the answer. Use their actual numbers. Show simple maths when it helps ("€150/month × 12 = €1,800").
- Prioritise in this order unless their data says otherwise: high-interest debt, emergency fund, employer pension
  match and tax relief, then investing.
- Apply Irish rules correctly (see IRISH_RULES). Pension relief is at the marginal rate within age-band limits.
  Irish/EU ETFs pay exit tax with deemed disposal every 8 years; direct shares pay CGT with a small annual exemption.
- Be honest about trade-offs and uncertainty. Projections are not guarantees.
- You are not a regulated financial adviser. For big, irreversible decisions (pension transfers, mortgages,
  drawdown, large investments) suggest a fee-only Qualified Financial Adviser (QFA) or CFP. Say this once, briefly,
  only when relevant.
- Keep it concise: short paragraphs or a short list. No headers unless asked.
"""


def _system(context: dict) -> str:
    return (SYSTEM_PROMPT + "\nIRISH_RULES = " + json.dumps(tax.rules_summary()) +
            "\n\nFINANCIAL_SNAPSHOT = " + json.dumps(context, default=str))


class AIError(Exception):
    pass


def status(cfg: dict) -> dict:
    provider = cfg.get("provider", "none")
    info = {"provider": provider, "ready": False, "local": provider in ("ollama", "openai"), "detail": ""}
    try:
        if provider == "none":
            info["detail"] = "AI is off. Rule-based insights still work."
        elif provider == "ollama":
            r = httpx.get(cfg["ollama_url"].rstrip("/") + "/api/tags", timeout=5)
            models = [m["name"] for m in r.json().get("models", [])]
            info["models"] = models
            want = cfg["ollama_model"]
            info["ready"] = any(m == want or m.split(":")[0] == want.split(":")[0] for m in models)
            info["detail"] = ("Ready" if info["ready"] else
                              f"Ollama is running but '{want}' isn't downloaded. Run: docker compose exec ollama ollama pull {want}")
        elif provider == "openai":
            r = httpx.get(cfg["openai_base_url"].rstrip("/") + "/models", timeout=5)
            info["models"] = [m.get("id") for m in r.json().get("data", [])]
            info["ready"] = True
            info["detail"] = "Ready"
        elif provider == "anthropic":
            if offline_mode():
                info["detail"] = "Offline mode is on (PIFA_OFFLINE=true), so cloud AI is disabled."
            elif not os.environ.get("ANTHROPIC_API_KEY"):
                info["detail"] = "Set ANTHROPIC_API_KEY in your .env file and restart."
            else:
                info["ready"] = True
                info["detail"] = "Ready — summaries of your data are sent to Anthropic's API when you ask a question."
    except Exception as e:  # connection errors etc.
        info["detail"] = f"Can't reach the AI server: {e.__class__.__name__}. Is it running?"
    return info


def chat(cfg: dict, messages: list[dict], context: dict) -> str:
    provider = cfg.get("provider", "none")
    system = _system(context)
    msgs = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("content")]
    try:
        if provider == "ollama":
            r = httpx.post(cfg["ollama_url"].rstrip("/") + "/api/chat", timeout=300, json={
                "model": cfg["ollama_model"], "stream": False,
                "messages": [{"role": "system", "content": system}] + msgs,
                "options": {"temperature": 0.3, "num_ctx": 16384},
            })
            r.raise_for_status()
            return r.json()["message"]["content"]
        if provider == "openai":
            r = httpx.post(cfg["openai_base_url"].rstrip("/") + "/chat/completions", timeout=300, json={
                "model": cfg["openai_model"] or "local-model", "temperature": 0.3,
                "messages": [{"role": "system", "content": system}] + msgs,
            })
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        if provider == "anthropic":
            if offline_mode():
                raise AIError("Offline mode is on, so cloud AI is disabled.")
            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                raise AIError("ANTHROPIC_API_KEY isn't set.")
            r = httpx.post("https://api.anthropic.com/v1/messages", timeout=120, headers={
                "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json",
            }, json={"model": cfg["anthropic_model"], "max_tokens": 1500, "system": system, "messages": msgs})
            if r.status_code >= 400:
                raise AIError(f"Anthropic API error {r.status_code}: {r.text[:300]}")
            return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
    except AIError:
        raise
    except httpx.HTTPError as e:
        raise AIError(f"Couldn't reach the AI server ({e.__class__.__name__}). Check Settings → AI.") from e
    raise AIError("AI is turned off. Choose a provider in Settings → AI.")
