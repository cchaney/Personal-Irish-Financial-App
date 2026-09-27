"""Period-based reports that drive the Cash flow, Spending and Net worth pages."""
from collections import defaultdict
from datetime import date

from sqlmodel import Session, select

from ..models import Account, Transaction
from .catalogue import GROUP_COLORS, group_of
from . import finance as fin

EXCLUDED = {"Transfers", "Savings & investing"}   # moving money you still own isn't spending


def _txs(session: Session, start: date, end: date) -> list[Transaction]:
    return session.exec(select(Transaction).where(Transaction.date >= start, Transaction.date <= end)).all()


def cashflow(session: Session, start: date, end: date) -> dict:
    """Income sources → Income → expense groups (+ savings). Also a profit-and-loss table."""
    txs = [t for t in _txs(session, start, end) if t.category not in EXCLUDED]
    income_sources = defaultdict(float)
    expense_groups = defaultdict(lambda: defaultdict(float))
    for t in txs:
        if t.category == "Income":
            income_sources[t.merchant or t.description] += t.amount
        else:
            g = group_of(t.category)
            expense_groups[g][t.category] += -t.amount
    income = sum(income_sources.values())
    groups = []
    for g, cats in expense_groups.items():
        total = sum(cats.values())
        if total <= 0:
            continue
        groups.append({"name": g, "amount": round(total, 2), "color": GROUP_COLORS.get(g, "#9CA3AF"),
                       "categories": sorted([{"name": c, "amount": round(v, 2)} for c, v in cats.items() if v > 0],
                                            key=lambda r: -r["amount"])})
    groups.sort(key=lambda r: -r["amount"])
    expenses = sum(g["amount"] for g in groups)
    net = income - expenses
    sources = sorted([{"name": n, "amount": round(v, 2)} for n, v in income_sources.items() if v > 0],
                     key=lambda r: -r["amount"])
    # Fold small sources into "Other income" to keep the Sankey readable.
    if len(sources) > 5:
        other = sum(s["amount"] for s in sources[4:])
        sources = sources[:4] + [{"name": "Other income", "amount": round(other, 2)}]
    return {"income": round(income, 2), "expenses": round(expenses, 2), "net": round(net, 2),
            "savings_rate": round(net / income, 4) if income else None,
            "sources": sources, "groups": groups}


def spending(session: Session, start: date, end: date) -> dict:
    txs = [t for t in _txs(session, start, end)
           if t.category not in EXCLUDED and t.category != "Income"]
    by_group, by_cat, by_merchant = defaultdict(float), defaultdict(float), defaultdict(float)
    cat_group = {}
    monthly = defaultdict(lambda: defaultdict(float))
    count = 0
    for t in txs:
        amt = -t.amount
        g = group_of(t.category)
        by_group[g] += amt
        by_cat[t.category] += amt
        cat_group[t.category] = g
        by_merchant[t.merchant or t.description] += amt
        monthly[fin.month_key(t.date)][g] += amt
        if t.amount < 0:
            count += 1
    total = sum(v for v in by_group.values() if v > 0)
    months = max(1, (end.year - start.year) * 12 + end.month - start.month + 1)

    def rows(d, with_group=False):
        out = []
        for k, v in sorted(d.items(), key=lambda kv: -kv[1]):
            if v <= 0:
                continue
            g = cat_group.get(k, k) if with_group else k
            out.append({"name": k, "amount": round(v, 2), "share": round(v / total, 4) if total else 0,
                        "group": g if with_group else None, "color": GROUP_COLORS.get(g if with_group else k, "#9CA3AF")})
        return out

    groups = rows(by_group)
    merchants = [{**r, "color": "#9CA3AF"} for r in rows(by_merchant)[:50]]
    trend = [{"month": m, **{g: round(v, 2) for g, v in gs.items()}} for m, gs in sorted(monthly.items())]
    return {
        "total": round(total, 2), "average_per_month": round(total / months, 2), "transactions": count,
        "largest_group": groups[0] if groups else None,
        "groups": groups, "categories": rows(by_cat, with_group=True), "merchants": merchants,
        "trend": trend, "group_colors": GROUP_COLORS,
    }


def networth(session: Session, start: date, end: date) -> dict:
    history = fin.net_worth_history(session, 36)
    k0, k1 = fin.month_key(start), fin.month_key(end)
    in_range = [h for h in history if k0 <= h["month"] <= k1] or history[-1:]
    now = fin.net_worth(session)
    first = in_range[0]["net_worth"] if in_range else now["net_worth"]
    accs = fin.accounts_with_values(session)
    labels = {"current": "Cash", "savings": "Cash", "cash": "Cash", "brokerage": "Investments",
              "pension": "Retirement", "property": "Property", "other_asset": "Other assets",
              "credit_card": "Credit cards", "loan": "Loans", "mortgage": "Mortgages"}
    colors = {"Cash": "#2F6FDB", "Investments": "#8B5CF6", "Retirement": "#1E8E3E", "Property": "#E9A21A",
              "Other assets": "#9CA3AF", "Credit cards": "#DC4C3E", "Loans": "#E0739B", "Mortgages": "#F26B2A"}
    assets, liabilities = defaultdict(list), defaultdict(list)
    for a in accs:
        target = liabilities if a["is_liability"] else assets
        target[labels.get(a["type"], "Other assets")].append(
            {"id": a["id"], "name": a["name"], "institution": a["institution"], "value": a["value"], "type": a["type"]})

    def pack(d):
        return sorted([{"name": k, "color": colors.get(k, "#9CA3AF"), "total": round(sum(x["value"] for x in v), 2),
                        "accounts": sorted(v, key=lambda x: -x["value"])} for k, v in d.items()],
                      key=lambda r: -r["total"])
    return {**now, "change": round(now["net_worth"] - first, 2), "since": in_range[0]["month"] if in_range else None,
            "history": in_range, "assets_by_type": pack(assets), "liabilities_by_type": pack(liabilities)}
