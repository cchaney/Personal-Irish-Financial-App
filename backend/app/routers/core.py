"""Accounts, holdings, transactions, rules and CSV import."""
import json
from collections import Counter
import datetime as dt
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, col, func, or_, select

from ..db import get_session
from ..models import ACCOUNT_TYPES, Account, BalanceSnapshot, Holding, Rule, Transaction
from ..services import finance as fin
from ..services import importers
from ..services.categorise import categorise, clean_merchant
from ..services.settings import offline_mode
from ..services import prices

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ accounts
class AccountIn(BaseModel):
    name: str
    type: str = "current"
    institution: str = ""
    currency: str = "EUR"
    balance: float = 0
    interest_rate: float = 0
    min_payment: float = 0
    meta: dict = {}
    archived: bool = False


@router.get("/accounts")
def list_accounts(session: Session = Depends(get_session)):
    return fin.accounts_with_values(session)


def _snapshot(session: Session, account: Account, value: float):
    today = date.today()
    existing = session.exec(select(BalanceSnapshot).where(
        BalanceSnapshot.account_id == account.id, BalanceSnapshot.date == today)).first()
    if existing:
        existing.balance = value
        session.add(existing)
    else:
        session.add(BalanceSnapshot(account_id=account.id, date=today, balance=value))


@router.post("/accounts")
def create_account(body: AccountIn, session: Session = Depends(get_session)):
    if body.type not in ACCOUNT_TYPES:
        raise HTTPException(400, f"type must be one of {ACCOUNT_TYPES}")
    a = Account(**body.model_dump())
    a.balance = abs(a.balance)
    session.add(a)
    session.commit()
    session.refresh(a)
    _snapshot(session, a, a.balance)
    session.commit()
    return a


@router.put("/accounts/{account_id}")
def update_account(account_id: int, body: AccountIn, session: Session = Depends(get_session)):
    a = session.get(Account, account_id)
    if not a:
        raise HTTPException(404, "Account not found")
    changed_balance = abs(body.balance) != a.balance
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    a.balance = abs(a.balance)
    session.add(a)
    if changed_balance:
        _snapshot(session, a, a.balance)
    session.commit()
    session.refresh(a)
    return a


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    a = session.get(Account, account_id)
    if not a:
        raise HTTPException(404, "Account not found")
    for model in (Transaction, BalanceSnapshot, Holding):
        for row in session.exec(select(model).where(model.account_id == account_id)).all():
            session.delete(row)
    session.delete(a)
    session.commit()
    return {"ok": True}


@router.get("/accounts/{account_id}/history")
def account_history(account_id: int, session: Session = Depends(get_session)):
    rows = session.exec(select(BalanceSnapshot).where(BalanceSnapshot.account_id == account_id)
                        .order_by(BalanceSnapshot.date)).all()
    return [{"date": r.date.isoformat(), "balance": r.balance} for r in rows]


@router.post("/snapshot")
def snapshot_all(session: Session = Depends(get_session)):
    """Record today's value of every account (holdings-based accounts use live holding values)."""
    accs = fin.accounts_with_values(session)
    for a in accs:
        _snapshot(session, session.get(Account, a["id"]), a["value"])
    session.commit()
    return {"ok": True, "accounts": len(accs)}


# ------------------------------------------------------------------ holdings
class HoldingIn(BaseModel):
    account_id: int
    name: str
    symbol: str = ""
    isin: str = ""
    asset_class: str = "equity"
    units: float = 0
    cost_basis: float = 0
    price: float = 0
    tax_regime: str = "exit_tax"
    purchase_date: Optional[date] = None
    sri: int = 5


@router.get("/holdings")
def list_holdings(session: Session = Depends(get_session)):
    return fin.holdings_view(session)


@router.post("/holdings")
def create_holding(body: HoldingIn, session: Session = Depends(get_session)):
    h = Holding(**body.model_dump(), price_date=date.today())
    session.add(h)
    session.commit()
    session.refresh(h)
    return h


@router.put("/holdings/{holding_id}")
def update_holding(holding_id: int, body: HoldingIn, session: Session = Depends(get_session)):
    h = session.get(Holding, holding_id)
    if not h:
        raise HTTPException(404, "Holding not found")
    price_changed = body.price != h.price
    for k, v in body.model_dump().items():
        setattr(h, k, v)
    if price_changed:
        h.price_date = date.today()
    session.add(h)
    session.commit()
    session.refresh(h)
    return h


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, session: Session = Depends(get_session)):
    h = session.get(Holding, holding_id)
    if h:
        session.delete(h)
        session.commit()
    return {"ok": True}


POSITION_TEMPLATE = (
    "name,ticker,type,units,buy_price,price,purchase_date,isin\n"
    "Vanguard FTSE All-World UCITS ETF (Acc),VWCE.DE,etf,52,104.10,128.60,2023-03-14,IE00BK5BQT80\n"
    "iShares Core MSCI World UCITS ETF,IWDA.AS,etf,148,82.40,101.20,2022-05-02,IE00B4L5Y983\n"
    "Apple Inc.,AAPL,stock,12,168.00,214.50,2024-01-15,US0378331005\n"
    "Bitcoin,BTC-EUR,crypto,0.18,38200,61800,2024-02-01,\n"
)
TYPE_TAX = {"etf": "exit_tax", "fund": "exit_tax", "stock": "cgt", "crypto": "cgt", "bond": "cgt", "other": "none"}


@router.get("/holdings/template")
def holdings_template():
    from fastapi.responses import Response
    return Response(POSITION_TEMPLATE, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=pifa-positions-template.csv"})


@router.post("/holdings/import")
async def import_holdings(file: UploadFile = File(...), account_id: int = Form(...),
                          session: Session = Depends(get_session)):
    acc = session.get(Account, account_id)
    if not acc:
        raise HTTPException(400, "Choose the account these positions are held in.")
    headers, rows = importers.read_rows(importers.decode(await file.read()))
    low = {h.lower().strip(): h for h in headers}

    def col(*names):
        for n in names:
            if n in low:
                return low[n]
        return None
    c_name = col("name", "instrument", "security", "position", "description")
    c_tick = col("ticker", "symbol", "code")
    c_type = col("type", "asset type", "asset_class", "class")
    c_units = col("units", "quantity", "shares", "no. of shares", "amount held")
    c_buy = col("buy_price", "buy price", "average price", "avg price", "cost per unit", "price paid")
    c_cost = col("cost", "total cost", "cost basis", "invested")
    c_price = col("price", "current price", "last price")
    c_date = col("purchase_date", "purchase date", "date", "bought")
    c_isin = col("isin")
    if not (c_name or c_tick) or not c_units:
        raise HTTPException(400, "The CSV needs at least a name or ticker column and a units column. "
                                 "Download the template to see the format.")
    added, warnings = 0, []
    for i, r in enumerate(rows):
        units = importers.parse_amount(r.get(c_units, "")) if c_units else None
        if not units:
            warnings.append(f"Row {i + 2}: no units, skipped")
            continue
        buy = importers.parse_amount(r.get(c_buy, "")) if c_buy else None
        cost = importers.parse_amount(r.get(c_cost, "")) if c_cost else None
        price = importers.parse_amount(r.get(c_price, "")) if c_price else None
        kind = (r.get(c_type, "") if c_type else "").strip().lower() or "etf"
        kind = {"share": "stock", "shares": "stock", "equity": "stock", "cryptocurrency": "crypto"}.get(kind, kind)
        if kind not in TYPE_TAX:
            kind = "other"
        cost_basis = cost if cost else (buy * units if buy else 0)
        session.add(Holding(
            account_id=account_id, name=(r.get(c_name) if c_name else "") or r.get(c_tick, ""),
            symbol=(r.get(c_tick, "") if c_tick else "").strip(), isin=(r.get(c_isin, "") if c_isin else "").strip(),
            asset_class=kind, units=units, cost_basis=round(cost_basis, 2),
            price=price or (buy or 0), price_date=date.today(),
            tax_regime="pension" if acc.type == "pension" else TYPE_TAX[kind],
            purchase_date=importers.parse_date(r.get(c_date, "")) if c_date else None))
        added += 1
    session.commit()
    return {"added": added, "warnings": warnings[:20]}


@router.post("/prices/refresh")
def refresh_prices(session: Session = Depends(get_session)):
    if offline_mode():
        raise HTTPException(400, "Offline mode is on (PIFA_OFFLINE=true). Update prices by hand instead.")
    hs = session.exec(select(Holding)).all()
    result = prices.refresh(hs)
    for h in hs:
        session.add(h)
    session.commit()
    snapshot_all(session)
    return result


# ------------------------------------------------------------------ transactions
class TransactionIn(BaseModel):
    account_id: int
    date: dt.date
    description: str
    merchant: str = ""
    amount: float
    category: Optional[str] = None
    notes: str = ""
    reviewed: bool = True


class TransactionPatch(BaseModel):
    category: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None
    reviewed: Optional[bool] = None
    date: Optional[dt.date] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    create_rule: bool = False   # "always categorise this merchant like this"


class BulkPatch(BaseModel):
    ids: list[int]
    category: Optional[str] = None
    reviewed: Optional[bool] = None
    delete: bool = False


def _user_rules(session: Session) -> list[tuple[str, str]]:
    return [(r.pattern, r.category) for r in session.exec(select(Rule)).all()]


@router.get("/transactions")
def list_transactions(start: Optional[date] = None, end: Optional[date] = None, q: str = "",
                      account_id: Optional[int] = None, category: Optional[str] = None,
                      status: str = "all", kind: str = "all", limit: int = 300, offset: int = 0,
                      session: Session = Depends(get_session)):
    stmt = select(Transaction)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if status == "review":
        stmt = stmt.where(Transaction.reviewed == False)  # noqa: E712
    elif status == "uncategorised":
        stmt = stmt.where(Transaction.category.in_(["Uncategorised", "Other"]))
    if kind == "in":
        stmt = stmt.where(Transaction.amount > 0)
    elif kind == "out":
        stmt = stmt.where(Transaction.amount < 0)
    if q:
        like = f"%{q}%"
        conds = [col(Transaction.description).ilike(like), col(Transaction.merchant).ilike(like),
                 col(Transaction.category).ilike(like), col(Transaction.notes).ilike(like)]
        try:
            conds.append(func.abs(Transaction.amount) == abs(float(q.replace("€", "").replace(",", ""))))
        except ValueError:
            pass
        stmt = stmt.where(or_(*conds))
    rows = session.exec(stmt.order_by(Transaction.date.desc(), Transaction.id.desc())).all()
    total_in = sum(t.amount for t in rows if t.amount > 0 and t.category != "Transfers")
    total_out = sum(t.amount for t in rows if t.amount < 0 and t.category != "Transfers")
    return {"count": len(rows), "total_in": round(total_in, 2), "total_out": round(total_out, 2),
            "needs_review": sum(1 for t in rows if not t.reviewed),
            "items": [t.model_dump() for t in rows[offset:offset + limit]]}


@router.get("/transactions/counts")
def counts(session: Session = Depends(get_session)):
    review = session.exec(select(func.count()).select_from(Transaction).where(Transaction.reviewed == False)).one()  # noqa: E712
    uncat = session.exec(select(func.count()).select_from(Transaction)
                         .where(Transaction.category.in_(["Uncategorised", "Other"]))).one()
    return {"needs_review": review, "uncategorised": uncat}


@router.post("/transactions")
def create_transaction(body: TransactionIn, session: Session = Depends(get_session)):
    data = body.model_dump()
    data["merchant"] = data["merchant"] or clean_merchant(data["description"])
    data["category"] = data["category"] or categorise(data["description"], data["amount"], _user_rules(session))
    t = Transaction(**data)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


@router.patch("/transactions/{tx_id}")
def patch_transaction(tx_id: int, body: TransactionPatch, session: Session = Depends(get_session)):
    t = session.get(Transaction, tx_id)
    if not t:
        raise HTTPException(404, "Transaction not found")
    data = body.model_dump(exclude_unset=True)
    create_rule = data.pop("create_rule", False)
    for k, v in data.items():
        setattr(t, k, v)
    if "category" in data and "reviewed" not in data:
        t.reviewed = True
    session.add(t)
    updated = 1
    if create_rule and body.category:
        pattern = t.merchant or t.description
        session.add(Rule(pattern=pattern, category=body.category))
        for other in session.exec(select(Transaction).where(
                or_(col(Transaction.merchant) == pattern, col(Transaction.description).ilike(f"%{pattern}%")))).all():
            other.category = body.category
            session.add(other)
            updated += 1
    session.commit()
    return {"ok": True, "updated": updated}


@router.post("/transactions/bulk")
def bulk(body: BulkPatch, session: Session = Depends(get_session)):
    rows = session.exec(select(Transaction).where(col(Transaction.id).in_(body.ids))).all()
    for t in rows:
        if body.delete:
            session.delete(t)
            continue
        if body.category:
            t.category = body.category
            t.reviewed = True
        if body.reviewed is not None:
            t.reviewed = body.reviewed
        session.add(t)
    session.commit()
    return {"ok": True, "count": len(rows)}


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, session: Session = Depends(get_session)):
    t = session.get(Transaction, tx_id)
    if t:
        session.delete(t)
        session.commit()
    return {"ok": True}


# ------------------------------------------------------------------ import
@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...)):
    text = importers.decode(await file.read())
    headers, rows = importers.read_rows(text)
    if not headers:
        raise HTTPException(400, "That file looks empty. Export transactions as CSV from your bank and try again.")
    mapping = importers.detect_mapping(headers)
    parsed, warnings = importers.parse(rows[:200], mapping)
    return {"headers": headers, "mapping": mapping, "rows": len(rows),
            "sample": [{**p, "date": p["date"].isoformat(), "merchant": clean_merchant(p["description"]),
                        "category": categorise(p["description"], p["amount"])} for p in parsed[:12]],
            "warnings": warnings[:10]}


@router.post("/import")
async def import_csv(file: UploadFile = File(...), account_id: int = Form(...), mapping: str = Form(...),
                     session: Session = Depends(get_session)):
    if not session.get(Account, account_id):
        raise HTTPException(400, "Choose an account to import into.")
    text = importers.decode(await file.read())
    headers, rows = importers.read_rows(text)
    parsed, warnings = importers.parse(rows, json.loads(mapping))
    user_rules = _user_rules(session)
    seen = Counter()
    added = skipped = 0
    for p in parsed:
        key = (p["date"], p["amount"], p["description"].lower())
        h = importers.tx_hash(account_id, p["date"], p["amount"], p["description"], seen[key])
        seen[key] += 1
        if session.exec(select(Transaction.id).where(Transaction.import_hash == h)).first():
            skipped += 1
            continue
        session.add(Transaction(account_id=account_id, date=p["date"], description=p["description"],
                                merchant=clean_merchant(p["description"]), amount=p["amount"],
                                category=categorise(p["description"], p["amount"], user_rules),
                                reviewed=False, import_hash=h))
        added += 1
    session.commit()
    return {"added": added, "skipped_duplicates": skipped, "warnings": warnings[:20]}


# ------------------------------------------------------------------ rules
class RuleIn(BaseModel):
    pattern: str
    category: str


@router.get("/rules")
def list_rules(session: Session = Depends(get_session)):
    return session.exec(select(Rule)).all()


@router.post("/rules")
def create_rule(body: RuleIn, session: Session = Depends(get_session)):
    r = Rule(**body.model_dump())
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    r = session.get(Rule, rule_id)
    if r:
        session.delete(r)
        session.commit()
    return {"ok": True}


@router.post("/rules/apply")
def apply_rules(session: Session = Depends(get_session)):
    user_rules = _user_rules(session)
    n = 0
    for t in session.exec(select(Transaction)).all():
        c = categorise(t.description, t.amount, user_rules)
        if c != t.category and (not t.reviewed or t.category in ("Uncategorised", "Other")):
            t.category = c
            session.add(t)
            n += 1
    session.commit()
    return {"updated": n}
