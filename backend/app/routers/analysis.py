"""Reports, pensions, simulators, insights, AI coach, settings and data management."""
import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import LIABILITY_TYPES, Account, BalanceSnapshot, Holding, Rule, Setting, Transaction
from ..services import catalogue, demo, insights, llm, reports
from ..services import finance as fin
from ..services import irish_tax as tax
from ..services import settings as st
from ..services import simulator as sim

router = APIRouter(prefix="/api")


def _range(start: Optional[date], end: Optional[date]):
    today = date.today()
    return start or date(today.year, 1, 1), end or today


# ------------------------------------------------------------------ reports
@router.get("/overview")
def overview(session: Session = Depends(get_session)):
    return {"net_worth": fin.net_worth(session), "history": fin.net_worth_history(session, 12),
            "cashflow": fin.cashflow(session, 6), "averages": fin.monthly_averages(session),
            "insights": insights.build(session)[:4], "pensions": fin.pension_summary(session)}


@router.get("/reports/cashflow")
def cashflow(start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    s, e = _range(start, end)
    return reports.cashflow(session, s, e)


@router.get("/reports/spending")
def spending(start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    s, e = _range(start, end)
    return reports.spending(session, s, e)


@router.get("/reports/networth")
def networth(start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session)):
    s, e = _range(start, end)
    return reports.networth(session, s, e)


@router.get("/pensions")
def pensions(session: Session = Depends(get_session)):
    return fin.pension_summary(session)


@router.get("/emergency")
def emergency(session: Session = Depends(get_session)):
    return fin.emergency_summary(session)


@router.get("/insights")
def get_insights(session: Session = Depends(get_session)):
    return {"insights": insights.build(session), "recurring": fin.recurring_payments(session)}


@router.get("/meta")
def meta():
    return {"categories": catalogue.CATEGORIES, "category_groups": catalogue.CATEGORY_GROUPS,
            "group_colors": catalogue.GROUP_COLORS, "pension_providers": catalogue.PENSION_PROVIDERS,
            "pension_products": catalogue.PENSION_PRODUCTS, "banks": catalogue.BANKS,
            "brokers": catalogue.BROKERS, "sri": tax.SRI_ASSUMPTIONS, "rules": tax.rules_summary(),
            "offline": st.offline_mode()}


# ------------------------------------------------------------------ simulators
@router.get("/simulate/defaults")
def sim_defaults(session: Session = Depends(get_session)):
    profile, assumptions = st.get(session, "profile"), st.get(session, "assumptions")
    pen = fin.pension_summary(session)
    salary = float(profile["gross_salary"]) or 1
    weighted_sri, fee = 4, 0.75
    if pen["pots"] and pen["total"]:
        weighted_sri = round(sum(float((p.get("meta") or {}).get("sri", 4)) * p["value"] for p in pen["pots"]) / pen["total"])
        fee = round(sum(float((p.get("meta") or {}).get("annual_fee_pct", 0.75)) * p["value"] for p in pen["pots"]) / pen["total"], 2)
    a = tax.SRI_ASSUMPTIONS.get(weighted_sri, tax.SRI_ASSUMPTIONS[4])
    holdings = [h for h in fin.holdings_view(session) if h["account_type"] == "brokerage"]
    brokerage = sum(h["value"] for h in holdings)
    avg = fin.monthly_averages(session)
    example = not pen["pots"]
    return {
        "example": example,
        "pension": {
            "current_age": round(pen["age"]), "retirement_age": profile["retirement_age"],
            "current_pot": round(pen["total"]), "salary": profile["gross_salary"],
            "salary_growth": profile["salary_growth"],
            "employee_pct": 5.0 if example else round(pen["employee_annual"] / salary * 100, 2),
            "employer_pct": 5.0 if example else round(pen["employer_annual"] / salary * 100, 2), "extra_monthly": 0,
            "expected_return": a["return"], "volatility": a["volatility"], "annual_fee": fee,
            "inflation": assumptions["inflation"], "lifestyle_years": 5,
            "target_income": profile["target_retirement_income"], "include_state_pension": True,
            "tax_status": profile["tax_status"], "partner_income": profile.get("partner_income", 0),
            "post_retirement_return": assumptions["post_retirement_return"],
            "drawdown_to_age": assumptions["drawdown_to_age"],
        },
        "investment": {
            "initial": round(brokerage), "monthly": round(avg.get("saved_invested", 0) / 2) or 200, "years": 20,
            "expected_return": 6.5, "volatility": 15, "annual_fee": 0.22, "inflation": assumptions["inflation"],
            "tax_regime": "exit_tax", "deposit_rate": assumptions["cash_rate"],
        },
        "sri": tax.SRI_ASSUMPTIONS,
    }


@router.post("/simulate/pension")
def simulate_pension(body: dict):
    try:
        return sim.simulate_pension(body)
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Check the simulator inputs: {e}")


@router.post("/simulate/investment")
def simulate_investment(body: dict):
    try:
        return sim.simulate_investment(body)
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Check the simulator inputs: {e}")


class DebtSim(BaseModel):
    extra_monthly: float = 0
    debts: Optional[list[dict]] = None


@router.post("/simulate/debt")
def simulate_debt(body: DebtSim, session: Session = Depends(get_session)):
    debts = body.debts
    if debts is None:
        debts = [{"name": a["name"], "balance": a["value"], "apr": a["interest_rate"], "min_payment": a["min_payment"]}
                 for a in fin.accounts_with_values(session) if a["type"] in LIABILITY_TYPES and a["value"] > 0]
    return {
        "debts": debts,
        "minimum_only": sim.simulate_debt(debts, 0, "avalanche"),
        "avalanche": sim.simulate_debt(debts, body.extra_monthly, "avalanche"),
        "snowball": sim.simulate_debt(debts, body.extra_monthly, "snowball"),
    }


# ------------------------------------------------------------------ AI coach
def ai_context(session: Session) -> dict:
    cfg = st.get(session, "ai")
    today = date.today()
    ytd = reports.spending(session, date(today.year, 1, 1), today)
    cf = reports.cashflow(session, date(today.year, 1, 1), today)
    pen = fin.pension_summary(session)
    ctx = {
        "today": today.isoformat(),
        "profile": {k: v for k, v in st.get(session, "profile").items() if k != "name"},
        "net_worth": fin.net_worth(session),
        "monthly_averages_last_3_full_months": fin.monthly_averages(session),
        "cashflow_year_to_date": {k: cf[k] for k in ("income", "expenses", "net", "savings_rate")},
        "spending_ytd_by_group": [{"group": g["name"], "amount": g["amount"]} for g in ytd["groups"]],
        "spending_ytd_by_category": [{"category": c["name"], "amount": c["amount"]} for c in ytd["categories"][:15]],
        "accounts": [{"name": a["name"], "type": a["type"], "institution": a["institution"], "value": a["value"],
                      "interest_rate": a["interest_rate"], "min_payment": a["min_payment"]}
                     for a in fin.accounts_with_values(session)],
        "pensions": {k: v for k, v in pen.items() if k != "pots"} | {
            "pots": [{"name": p["name"], "value": p["value"], **(p.get("meta") or {})} for p in pen["pots"]]},
        "holdings": [{k: h.get(k) for k in ("name", "value", "gain", "gain_pct", "tax_regime", "account_type",
                                              "next_deemed_disposal", "sri")} for h in fin.holdings_view(session)],
        "rule_based_insights": [{k: i.get(k) for k in ("title", "detail", "value")} for i in insights.build(session)],
    }
    if cfg.get("share_merchant_names", True):
        ctx["top_merchants_ytd"] = [{"merchant": m["name"], "amount": m["amount"]} for m in ytd["merchants"][:15]]
        ctx["recurring_payments"] = fin.recurring_payments(session)
    return ctx


@router.get("/ai/status")
def ai_status(session: Session = Depends(get_session)):
    return llm.status(st.get(session, "ai"))


class ChatIn(BaseModel):
    messages: list[dict]


@router.post("/ai/chat")
def ai_chat(body: ChatIn, session: Session = Depends(get_session)):
    try:
        reply = llm.chat(st.get(session, "ai"), body.messages[-12:], ai_context(session))
    except llm.AIError as e:
        raise HTTPException(400, str(e))
    return {"reply": reply}


@router.get("/ai/context")
def ai_context_preview(session: Session = Depends(get_session)):
    """Exactly what gets sent to the AI, so you can inspect it."""
    return ai_context(session)


# ------------------------------------------------------------------ settings & data
@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    return {k: st.get(session, k) for k in ("profile", "assumptions", "ai", "emergency")}


@router.put("/settings/{key}")
def put_settings(key: str, body: dict, session: Session = Depends(get_session)):
    if key not in ("profile", "assumptions", "ai", "emergency"):
        raise HTTPException(404, "Unknown settings section")
    return st.put(session, key, body)


@router.post("/data/demo")
def load_demo(session: Session = Depends(get_session)):
    return demo.seed(session)


@router.post("/data/clear")
def clear(session: Session = Depends(get_session)):
    demo.clear_all(session)
    return {"ok": True}


@router.get("/data/export")
def export(session: Session = Depends(get_session)):
    def dump(model):
        return [json.loads(r.model_dump_json()) for r in session.exec(select(model)).all()]
    payload = {"app": "pifa", "version": 1, "exported_at": datetime.now().isoformat(),
               "accounts": dump(Account), "snapshots": dump(BalanceSnapshot), "transactions": dump(Transaction),
               "holdings": dump(Holding), "rules": dump(Rule), "settings": dump(Setting)}
    return Response(json.dumps(payload, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f"attachment; filename=pifa-backup-{date.today()}.json"})


@router.post("/data/restore")
def restore(body: dict, session: Session = Depends(get_session)):
    if body.get("app") != "pifa":
        raise HTTPException(400, "That isn't a PIFA backup file.")
    demo.clear_all(session)
    for key, model in (("accounts", Account), ("snapshots", BalanceSnapshot), ("transactions", Transaction),
                       ("holdings", Holding), ("rules", Rule), ("settings", Setting)):
        for row in body.get(key, []):
            session.add(model.model_validate(row))
        session.commit()
    return {"ok": True}
