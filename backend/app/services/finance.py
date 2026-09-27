"""Aggregations for the dashboard, insights and the AI coach."""
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean

from sqlmodel import Session, select

from ..models import LIABILITY_TYPES, LIQUID_TYPES, Account, BalanceSnapshot, Holding, Transaction
from . import irish_tax as tax
from . import settings as st
from .catalogue import NON_SPEND_CATEGORIES


def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def months_back(n: int, today: date | None = None) -> list[str]:
    today = today or date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def age_from_dob(dob: str) -> float:
    try:
        y, m, d = map(int, dob.split("-"))
        born = date(y, m, d)
        return (date.today() - born).days / 365.25
    except Exception:
        return 35.0


def account_value(acc: Account, holdings: list[Holding]) -> float:
    hs = [h for h in holdings if h.account_id == acc.id]
    if hs and acc.type in ("brokerage", "pension"):
        return round(sum(h.value for h in hs), 2)
    return acc.balance


def accounts_with_values(session: Session) -> list[dict]:
    accs = session.exec(select(Account).where(Account.archived == False)).all()  # noqa: E712
    holdings = session.exec(select(Holding)).all()
    out = []
    for a in accs:
        v = account_value(a, holdings)
        d = a.model_dump()
        d["value"] = v
        d["is_liability"] = a.type in LIABILITY_TYPES
        d["holdings_count"] = len([h for h in holdings if h.account_id == a.id])
        out.append(d)
    return out


def net_worth(session: Session) -> dict:
    accs = accounts_with_values(session)
    groups = defaultdict(float)
    assets = liabilities = 0.0
    for a in accs:
        if a["is_liability"]:
            liabilities += a["value"]
            groups["debt"] += a["value"]
        else:
            assets += a["value"]
            g = "cash" if a["type"] in LIQUID_TYPES else ("investments" if a["type"] == "brokerage" else a["type"])
            groups[g] += a["value"]
    return {"net_worth": round(assets - liabilities, 2), "assets": round(assets, 2),
            "liabilities": round(liabilities, 2), "groups": {k: round(v, 2) for k, v in groups.items()}}


def net_worth_history(session: Session, months: int = 24) -> list[dict]:
    accs = {a.id: a for a in session.exec(select(Account)).all()}
    snaps = session.exec(select(BalanceSnapshot).order_by(BalanceSnapshot.date)).all()
    by_acc = defaultdict(list)
    for s in snaps:
        by_acc[s.account_id].append(s)
    out = []
    for mk in months_back(months):
        y, m = map(int, mk.split("-"))
        end = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
        assets = liab = 0.0
        has = False
        for aid, lst in by_acc.items():
            a = accs.get(aid)
            if not a:
                continue
            latest = None
            for s in lst:
                if s.date <= end:
                    latest = s
            if latest is None:
                continue
            has = True
            if a.type in LIABILITY_TYPES:
                liab += latest.balance
            else:
                assets += latest.balance
        if has:
            out.append({"month": mk, "net_worth": round(assets - liab, 0), "assets": round(assets, 0),
                        "liabilities": round(liab, 0)})
    if out:
        now = net_worth(session)
        out[-1] = {"month": out[-1]["month"], "net_worth": round(now["net_worth"], 0),
                   "assets": round(now["assets"], 0), "liabilities": round(now["liabilities"], 0)}
    return out


def cashflow(session: Session, months: int = 12) -> list[dict]:
    keys = months_back(months)
    start = date(int(keys[0][:4]), int(keys[0][5:]), 1)
    txs = session.exec(select(Transaction).where(Transaction.date >= start)).all()
    agg = {k: {"month": k, "income": 0.0, "spending": 0.0, "saved_invested": 0.0, "debt_repayment": 0.0} for k in keys}
    for t in txs:
        k = month_key(t.date)
        if k not in agg:
            continue
        if t.category == "Income":
            agg[k]["income"] += t.amount
        elif t.category == "Transfers":
            continue
        elif t.category == "Savings & investing":
            agg[k]["saved_invested"] += -t.amount
        elif t.category == "Debt repayment":
            agg[k]["debt_repayment"] += -t.amount
        else:
            agg[k]["spending"] += -t.amount
    return [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in row.items()} for row in agg.values()]


def spending_by_category(session: Session, month: str | None = None, months: int = 1) -> list[dict]:
    keys = months_back(months) if not month else [month]
    start = date(int(keys[0][:4]), int(keys[0][5:]), 1)
    txs = session.exec(select(Transaction).where(Transaction.date >= start)).all()
    agg = defaultdict(float)
    for t in txs:
        if month_key(t.date) in keys and t.category not in NON_SPEND_CATEGORIES:
            agg[t.category] += -t.amount
    rows = [{"category": c, "amount": round(v / len(keys), 2)} for c, v in agg.items() if v > 0]
    return sorted(rows, key=lambda r: -r["amount"])


def full_months(session: Session, n: int = 3) -> list[dict]:
    """The last n complete months of cashflow that actually contain transactions."""
    cf = cashflow(session, 13)[:-1]  # exclude current partial month
    with_data = [c for c in cf if c["income"] or c["spending"]]
    return with_data[-n:]


def monthly_averages(session: Session) -> dict:
    rows = full_months(session, 3)
    if not rows:
        return {"income": 0, "spending": 0, "saved_invested": 0, "debt_repayment": 0, "months": 0}
    return {
        "income": round(mean(r["income"] for r in rows), 2),
        "spending": round(mean(r["spending"] for r in rows), 2),
        "saved_invested": round(mean(r["saved_invested"] for r in rows), 2),
        "debt_repayment": round(mean(r["debt_repayment"] for r in rows), 2),
        "months": len(rows),
    }


def recurring_payments(session: Session) -> list[dict]:
    """Same merchant, similar amount, in 3+ of the last 4 months → likely a subscription/direct debit."""
    start = date.today() - timedelta(days=125)
    txs = session.exec(select(Transaction).where(Transaction.date >= start, Transaction.amount < 0)).all()
    groups = defaultdict(list)
    for t in txs:
        if t.category in ("Transfers", "Savings & investing"):
            continue
        key = " ".join(t.description.lower().split()[:2])
        groups[key].append(t)
    out = []
    for key, lst in groups.items():
        months = {month_key(t.date) for t in lst}
        if len(months) < 3:
            continue
        amounts = [-t.amount for t in lst]
        avg = mean(amounts)
        if max(amounts) - min(amounts) > max(3.0, avg * 0.15):
            continue
        if len(lst) > len(months) + 1:   # multiple per month → groceries, coffee etc.
            continue
        out.append({"name": lst[-1].description, "category": lst[-1].category,
                    "monthly": round(avg, 2), "yearly": round(avg * 12, 2)})
    return sorted(out, key=lambda r: -r["monthly"])


def pension_summary(session: Session) -> dict:
    profile = st.get(session, "profile")
    age = age_from_dob(profile["date_of_birth"])
    salary = float(profile["gross_salary"])
    accs = [a for a in accounts_with_values(session) if a["type"] == "pension"]
    ee_annual = er_annual = 0.0
    pots = []
    for a in accs:
        m = a.get("meta") or {}
        if m.get("product_type") == "auto_enrolment":
            ee, er, stt = tax.auto_enrolment_rates(date.today().year)
            capped = min(salary, tax.AUTO_ENROLMENT["earnings_cap"])
            e, r = capped * ee, capped * er + capped * stt
        else:
            e = salary * float(m.get("employee_pct", 0) or 0) / 100 + float(m.get("extra_monthly", 0) or 0) * 12
            r = salary * float(m.get("employer_pct", 0) or 0) / 100
        # AE employee contributions get no tax relief, so don't count them against headroom
        if m.get("product_type") != "auto_enrolment":
            ee_annual += e
        er_annual += r
        pots.append({**a, "employee_annual": round(e, 0), "employer_annual": round(r, 0)})
    limit = tax.max_relievable_contribution(age, salary)
    mr = tax.marginal_rate(salary, profile.get("tax_status", "single"), profile.get("partner_income", 0))
    headroom = max(0.0, limit - ee_annual)
    return {
        "age": round(age, 1),
        "total": round(sum(p["value"] for p in pots), 2),
        "pots": pots,
        "employee_annual": round(ee_annual, 0),
        "employer_annual": round(er_annual, 0),
        "relief_pct_for_age": tax.relief_pct_for_age(age),
        "max_relievable": round(limit, 0),
        "headroom": round(headroom, 0),
        "marginal_rate": mr,
        "relief_on_headroom": round(headroom * mr, 0),
        "net_cost_of_headroom": round(headroom * (1 - mr), 0),
    }


def holdings_view(session: Session) -> list[dict]:
    hs = session.exec(select(Holding)).all()
    accs = {a.id: a for a in session.exec(select(Account)).all()}
    out = []
    for h in hs:
        d = h.model_dump()
        d["value"] = h.value
        d["buy_price"] = round(h.cost_basis / h.units, 4) if h.units else None
        d["type"] = {"equity": "etf", "multi_asset": "fund", "property": "fund", "cash": "other"}.get(h.asset_class, h.asset_class)
        d["gain"] = round(h.value - h.cost_basis, 2)
        d["gain_pct"] = round((h.value / h.cost_basis - 1) * 100, 2) if h.cost_basis else None
        d["account_name"] = accs[h.account_id].name if h.account_id in accs else ""
        d["account_type"] = accs[h.account_id].type if h.account_id in accs else ""
        nd = None
        if h.purchase_date and h.tax_regime == "exit_tax" and d["account_type"] != "pension":
            yrs = tax.DEEMED_DISPOSAL_YEARS
            nd = h.purchase_date.replace(year=h.purchase_date.year + yrs)
            while nd < date.today():
                nd = nd.replace(year=nd.year + yrs)
            d["deemed_disposal_tax_estimate"] = round(max(d["gain"], 0) * tax.EXIT_TAX, 2)
        d["next_deemed_disposal"] = nd.isoformat() if nd else None
        out.append(d)
    return sorted(out, key=lambda r: -r["value"])


def emergency_summary(session: Session) -> dict:
    cfg = st.get(session, "emergency")
    avg = monthly_averages(session)
    monthly = round(avg["spending"] + avg["debt_repayment"], 2)
    accs = accounts_with_values(session)
    linked = next((a for a in accs if a["id"] == cfg.get("account_id")), None) if cfg.get("source") == "account" else None
    balance = float(linked["value"]) if linked else float(cfg.get("amount") or 0)
    months = int(cfg.get("months") or 3)
    suggested = round(monthly * months, 0)
    target = float(cfg["target"]) if cfg.get("target") else None
    configured = bool(balance or target or linked)
    return {
        "config": cfg,
        "configured": configured,
        "balance": round(balance, 2),
        "linked_account": {"id": linked["id"], "name": linked["name"]} if linked else None,
        "target": target,
        "effective_target": target or (suggested if configured else None),
        "average_monthly_spending": monthly,
        "coverage_months": round(balance / monthly, 1) if monthly else None,
        "suggested_target": suggested,
        "progress": round(min(1.0, balance / (target or suggested)), 3) if (target or suggested) else None,
        "accounts": [{"id": a["id"], "name": a["name"], "value": a["value"]} for a in accs
                     if a["type"] in ("current", "savings", "cash")],
    }
