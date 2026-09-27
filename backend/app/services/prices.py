"""
Optional online price refresh for holdings with a ticker, via Yahoo Finance's public chart endpoint.
Disabled when PIFA_OFFLINE=true. Irish pension funds generally have no ticker: update their unit
price from your provider's statement or online portal instead.
"""
from datetime import date

import httpx

UA = {"User-Agent": "Mozilla/5.0 (PIFA personal finance; self-hosted)"}
_fx_cache: dict[str, float] = {}


def _quote(client: httpx.Client, symbol: str) -> tuple[float, str]:
    r = client.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                   params={"range": "5d", "interval": "1d"}, headers=UA, timeout=15)
    r.raise_for_status()
    meta = r.json()["chart"]["result"][0]["meta"]
    return float(meta["regularMarketPrice"]), meta.get("currency", "EUR")


def _to_eur(client: httpx.Client, price: float, currency: str) -> float:
    if currency in ("GBp", "GBX"):
        price, currency = price / 100, "GBP"
    if currency == "EUR":
        return price
    if currency not in _fx_cache:
        rate, _ = _quote(client, f"{currency}EUR=X")
        _fx_cache[currency] = rate
    return price * _fx_cache[currency]


def refresh(holdings) -> dict:
    updated, failed = [], []
    _fx_cache.clear()
    with httpx.Client() as client:
        for h in holdings:
            if not h.symbol:
                continue
            try:
                p, cur = _quote(client, h.symbol)
                h.price = round(_to_eur(client, p, cur), 4)
                h.price_date = date.today()
                updated.append(h.symbol)
            except Exception as e:
                failed.append({"symbol": h.symbol, "error": e.__class__.__name__})
    return {"updated": updated, "failed": failed}
