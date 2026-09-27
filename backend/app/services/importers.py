"""
CSV import that auto-detects the layout of Irish bank exports (AIB, Bank of Ireland,
PTSB, Revolut, N26, bunq, credit unions...). The detected column mapping is returned
to the UI so you can correct it before importing.
"""
import csv
import hashlib
import io
import re
from datetime import date, datetime

DATE_KEYS = ["completed date", "posted transactions date", "transaction date", "booking date",
             "value date", "date", "started date", "posting date"]
DESC_KEYS = ["description", "description1", "details", "payee", "narrative", "merchant",
             "counterparty", "name", "transaction details", "reference", "memo"]
EXTRA_DESC_KEYS = ["description2", "description3"]
AMOUNT_KEYS = ["amount", "amount (eur)", "transaction amount", "amount eur", "value"]
DEBIT_KEYS = ["debit", "debit amount", "money out", "paid out", "withdrawals", "out", "debit (eur)"]
CREDIT_KEYS = ["credit", "credit amount", "money in", "paid in", "deposits", "in", "credit (eur)"]
FEE_KEYS = ["fee"]
STATE_KEYS = ["state", "status"]

DATE_FORMATS = ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y",
                "%d %B %Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %y"]


def decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def read_rows(text: str) -> tuple[list[str], list[dict]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        return [], []
    # Some banks put account info above the header row; find the first row containing a date-like header.
    header_idx = 0
    for i, r in enumerate(rows[:15]):
        lowered = [c.strip().lower() for c in r]
        if any(k in lowered for k in DATE_KEYS) or any("date" in c for c in lowered):
            header_idx = i
            break
    headers = [h.strip() for h in rows[header_idx]]
    out = []
    for r in rows[header_idx + 1:]:
        out.append({headers[i]: (r[i].strip() if i < len(r) else "") for i in range(len(headers))})
    return headers, out


def _find(headers: list[str], keys: list[str]) -> str | None:
    lower = {h.lower(): h for h in headers}
    for k in keys:
        if k in lower:
            return lower[k]
    return None


def detect_mapping(headers: list[str]) -> dict:
    lower = [h.lower() for h in headers]
    preset = "generic"
    if "started date" in lower and "product" in lower:
        preset = "Revolut"
    elif "posted transactions date" in lower or "description1" in lower:
        preset = "AIB"
    elif "payee" in lower and any("amount (eur)" == h for h in lower):
        preset = "N26"
    elif lower[:5] == ["date", "details", "debit", "credit", "balance"]:
        preset = "Bank of Ireland"
    elif "money in" in lower and "money out" in lower:
        preset = "PTSB / generic"

    date_col = _find(headers, DATE_KEYS)
    if preset == "Revolut":
        date_col = _find(headers, ["completed date", "started date"])
    mapping = {
        "preset": preset,
        "date": date_col,
        "description": _find(headers, DESC_KEYS),
        "extra_description": [h for h in headers if h.lower() in EXTRA_DESC_KEYS],
        "amount": _find(headers, AMOUNT_KEYS),
        "debit": _find(headers, DEBIT_KEYS),
        "credit": _find(headers, CREDIT_KEYS),
        "fee": _find(headers, FEE_KEYS),
        "state": _find(headers, STATE_KEYS),
        "flip_sign": False,
    }
    if mapping["debit"] or mapping["credit"]:
        # Prefer debit/credit columns when both exist alongside a generic 'amount'.
        if mapping["debit"] and mapping["credit"]:
            mapping["amount"] = None
    return mapping


def parse_amount(value: str) -> float | None:
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    negative = v.startswith("(") and v.endswith(")")
    v = v.strip("()").replace("€", "").replace("EUR", "").replace("\u00a0", "").replace(" ", "")
    if v.endswith("-"):
        negative, v = True, v[:-1]
    if v.upper().endswith("DR"):
        negative, v = True, v[:-2]
    if v.upper().endswith("CR"):
        v = v[:-2]
    # European decimal comma: 1.234,56 or 12,50
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})*,\d{1,2}", v) or re.fullmatch(r"-?\d+,\d{1,2}", v):
        v = v.replace(".", "").replace(",", ".")
    else:
        v = v.replace(",", "")
    try:
        n = float(v)
    except ValueError:
        return None
    return -abs(n) if negative else n


def parse_date(value: str) -> date | None:
    v = (value or "").strip()
    if not v:
        return None
    candidates = [v, v[:10], v[:19]]
    for c in candidates:
        for fmt in DATE_FORMATS + ["%Y-%m-%d %H:%M:%S"]:
            try:
                return datetime.strptime(c, fmt).date()
            except ValueError:
                continue
    return None


def parse(rows: list[dict], mapping: dict) -> tuple[list[dict], list[str]]:
    """Returns (transactions, warnings). Each transaction: date, description, amount."""
    txs, warnings = [], []
    for i, row in enumerate(rows):
        if mapping.get("state"):
            state = (row.get(mapping["state"]) or "").upper()
            if state and state not in ("COMPLETED", "BOOKED", "POSTED", "SETTLED"):
                continue
        d = parse_date(row.get(mapping.get("date") or "", ""))
        if not d:
            warnings.append(f"Row {i + 2}: couldn't read a date, skipped")
            continue
        desc_parts = [row.get(mapping.get("description") or "", "")]
        desc_parts += [row.get(c, "") for c in mapping.get("extra_description") or []]
        desc = " ".join(p for p in desc_parts if p).strip() or "(no description)"

        amount = None
        if mapping.get("amount"):
            amount = parse_amount(row.get(mapping["amount"], ""))
        else:
            debit = parse_amount(row.get(mapping.get("debit") or "", "")) or 0.0
            credit = parse_amount(row.get(mapping.get("credit") or "", "")) or 0.0
            if debit or credit:
                amount = abs(credit) - abs(debit)
        if amount is None:
            warnings.append(f"Row {i + 2}: couldn't read an amount, skipped")
            continue
        if mapping.get("fee"):
            amount -= abs(parse_amount(row.get(mapping["fee"], "")) or 0.0)
        if mapping.get("flip_sign"):
            amount = -amount
        if amount == 0:
            continue
        txs.append({"date": d, "description": re.sub(r"\s+", " ", desc), "amount": round(amount, 2)})
    return txs, warnings


def tx_hash(account_id: int, d: date, amount: float, description: str, occurrence: int) -> str:
    key = f"{account_id}|{d.isoformat()}|{amount:.2f}|{description.lower()}|{occurrence}"
    return hashlib.sha1(key.encode()).hexdigest()
