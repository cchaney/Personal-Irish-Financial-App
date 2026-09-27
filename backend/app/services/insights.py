"""
Rule-based insights. These run fully offline and are always shown; the AI coach
builds on top of them. Each insight: id, tone (act|watch|good), title, detail,
value (€/year it's worth, where we can estimate it), page (where to act).
"""
from datetime import date, timedelta

from sqlmodel import Session, select

from ..models import LIABILITY_TYPES, Transaction
from . import finance as fin
from . import irish_tax as tax
from . import settings as st


def eur(x: float) -> str:
    return f"€{x:,.0f}"


def build(session: Session) -> list[dict]:
    out: list[dict] = []
    profile = st.get(session, "profile")
    assumptions = st.get(session, "assumptions")
    accs = fin.accounts_with_values(session)
    avg = fin.monthly_averages(session)
    pen = fin.pension_summary(session)
    age = pen["age"]
    salary = float(profile["gross_salary"])

    liquid = sum(a["value"] for a in accs if a["type"] in ("current", "savings", "cash"))
    spend = avg["spending"] + avg["debt_repayment"]

    # 1. High-interest debt
    debts = [a for a in accs if a["type"] in LIABILITY_TYPES and a["value"] > 0]
    pricey = sorted([d for d in debts if d["interest_rate"] >= 7], key=lambda d: -d["interest_rate"])
    if pricey:
        yearly_interest = sum(d["value"] * d["interest_rate"] / 100 for d in pricey)
        top = pricey[0]
        out.append({
            "id": "high_interest_debt", "tone": "act",
            "title": f"Clear {top['name']} first — it costs {top['interest_rate']:.1f}% a year",
            "detail": (f"Your debts above 7% interest cost about {eur(yearly_interest)} a year. Paying them off is a "
                       f"guaranteed, tax-free return at that rate, which beats what investing is likely to earn after "
                       f"Irish exit tax. The Debts page shows how much sooner you'd be clear with extra payments."),
            "value": round(yearly_interest, 0), "page": "loans",
        })

    # 2. Emergency fund
    if spend > 0:
        months = liquid / spend
        target = profile.get("emergency_months_target", 6)
        if months < 3:
            out.append({"id": "emergency_fund", "tone": "act",
                        "title": f"Your cash covers {months:.1f} months of spending",
                        "detail": (f"Aim for {target} months ({eur(spend * target)}) in an instant-access account before "
                                   f"investing more. You're {eur(max(0, spend * target - liquid))} short."),
                        "value": None, "page": "accounts"})
        elif months > max(target, 6) + 3:
            excess = liquid - spend * target
            gain = excess * (0.055 * (1 - tax.EXIT_TAX) - assumptions["cash_rate"] / 100 * (1 - tax.DIRT))
            out.append({"id": "cash_drag", "tone": "watch",
                        "title": f"About {eur(excess)} of cash is doing very little",
                        "detail": (f"You hold {months:.0f} months of spending in cash, more than the {target} you set as a "
                                   f"buffer. Inflation erodes idle cash. Consider pension top-ups (tax relief first), "
                                   f"paying down debt, or a diversified fund for money you won't need for 5+ years. "
                                   f"State Savings products are DIRT-free if you want to stay safe."),
                        "value": round(max(gain, 0), 0), "page": "simulator"})
        else:
            out.append({"id": "emergency_ok", "tone": "good",
                        "title": f"Emergency fund: {months:.1f} months covered",
                        "detail": "Your cash buffer is in a healthy range.", "value": None, "page": "accounts"})

    # 3. Pension tax relief headroom
    if salary > 0 and pen["headroom"] > 500:
        mr = pen["marginal_rate"]
        out.append({
            "id": "pension_relief", "tone": "act" if mr >= 0.4 else "watch",
            "title": f"You could get {eur(pen['relief_on_headroom'])} more in pension tax relief",
            "detail": (f"At {age:.0f} you can put up to {pen['relief_pct_for_age'] * 100:.0f}% of salary "
                       f"({eur(pen['max_relievable'])}) a year into a pension with relief at {mr * 100:.0f}%. You're using "
                       f"{eur(pen['employee_annual'])}. Topping up the rest via an AVC or PRSA would cost you "
                       f"{eur(pen['net_cost_of_headroom'])} after relief. Lump-sum contributions can be backdated to the "
                       f"previous tax year until the 31 October return deadline (mid-November via ROS)."),
            "value": pen["relief_on_headroom"], "page": "pensions",
        })

    # 4. No pension at all
    if not pen["pots"] and 23 <= age <= 60 and salary >= tax.AUTO_ENROLMENT["earnings_threshold"]:
        ee, er, stt = tax.auto_enrolment_rates(date.today().year)
        out.append({"id": "no_pension", "tone": "act",
                    "title": "No pension recorded",
                    "detail": (f"If your employer has no scheme, you'll be auto-enrolled into My Future Fund "
                               f"({ee * 100:.1f}% from you, {er * 100:.1f}% from your employer, {stt * 100:.1f}% from the State). "
                               f"As a {'higher' if tax.marginal_rate(salary) >= 0.4 else 'standard'}-rate taxpayer, "
                               f"compare that with a PRSA, where your own contributions get relief at your marginal rate."),
                    "value": None, "page": "pensions"})

    # 5. Auto-enrolment vs higher-rate relief
    for p in pen["pots"]:
        m = p.get("meta") or {}
        if m.get("product_type") == "auto_enrolment" and tax.marginal_rate(salary) >= 0.4:
            out.append({"id": "ae_vs_prsa", "tone": "watch",
                        "title": "My Future Fund may not be your best option as a 40% taxpayer",
                        "detail": ("My Future Fund's State top-up (€1 for every €3 you pay) works out like 25% tax relief, "
                                   "while contributions to an employer scheme or PRSA get 40% relief at your rate. Ask "
                                   "your employer whether they'll match into a qualifying occupational scheme or PRSA instead."),
                        "value": None, "page": "pensions"})
            break

    # 6. Pension fees
    for p in pen["pots"]:
        fee = float((p.get("meta") or {}).get("annual_fee_pct", 0) or 0)
        if fee > 1.0 and p["value"] > 5000:
            drag = p["value"] * (fee - 0.75) / 100
            out.append({"id": f"pension_fee_{p['id']}", "tone": "watch",
                        "title": f"{p['name']} charges {fee:.2f}% a year",
                        "detail": (f"That's {eur(p['value'] * fee / 100)} this year on a {eur(p['value'])} pot. Many PRSAs and "
                                   f"company schemes charge 0.5-0.75%. Over decades a 0.5% difference can cost 10-15% of "
                                   f"your final pot. Ask your provider or a broker about cheaper fund options."),
                        "value": round(drag, 0), "page": "pensions"})

    # 7. Subscriptions
    recurring = [r for r in fin.recurring_payments(session) if r["category"] in ("Subscriptions", "Fitness", "Phone & internet", "Entertainment")]
    if recurring:
        total = sum(r["monthly"] for r in recurring)
        names = ", ".join(r["name"] for r in recurring[:5])
        out.append({"id": "subscriptions", "tone": "watch",
                    "title": f"{len(recurring)} recurring payments add up to {eur(total)}/month",
                    "detail": f"{names}{'…' if len(recurring) > 5 else ''}. Worth a quick check that you still use each one, and whether annual billing is cheaper.",
                    "value": round(total * 12, 0), "page": "spending", "items": recurring})

    # 8. Category spikes vs 3-month average
    this_month = {r["category"]: r["amount"] for r in fin.spending_by_category(session, fin.months_back(1)[0])}
    keys = fin.months_back(4)[:-1]
    prior = {}
    for k in keys:
        for r in fin.spending_by_category(session, k):
            prior[r["category"]] = prior.get(r["category"], 0) + r["amount"] / 3
    day = date.today().day
    for cat, amt in this_month.items():
        base = prior.get(cat, 0)
        if base > 50 and amt > base * 1.3 and amt - base > 75 and day >= 10:
            out.append({"id": f"spike_{cat}", "tone": "watch",
                        "title": f"{cat} is {eur(amt - base)} above your usual month",
                        "detail": f"{eur(amt)} so far this month against a 3-month average of {eur(base)}.",
                        "value": None, "page": "spending"})

    # 9. Savings rate
    if avg["income"] > 0:
        rate = (avg["income"] - avg["spending"]) / avg["income"]
        tone = "good" if rate >= 0.2 else ("watch" if rate >= 0.05 else "act")
        out.append({"id": "savings_rate", "tone": tone,
                    "title": (f"You keep {rate * 100:.0f}% of what you earn" if rate >= 0
                              else f"You're spending {abs(rate) * 100:.0f}% more than you earn"),
                    "detail": (f"Average take-home {eur(avg['income'])}/month, day-to-day spending {eur(avg['spending'])}/month "
                               f"over the last {avg['months']} full months. 20%+ is a strong savings rate."),
                    "value": None, "page": "spending"})

    # 10. Gambling
    start = date.today() - timedelta(days=90)
    gamb = session.exec(select(Transaction).where(Transaction.date >= start, Transaction.category == "Gambling")).all()
    g_total = -sum(t.amount for t in gamb if t.amount < 0)
    if g_total > 100:
        out.append({"id": "gambling", "tone": "watch", "title": f"{eur(g_total)} on betting in 90 days",
                    "detail": "If this is more than you'd like, gamblingcare.ie and problemgambling.ie offer free support, and most banks let you block gambling payments in their app.",
                    "value": round(g_total * 4, 0), "page": "spending"})

    # 11. Deemed disposal coming up
    soon = date.today() + timedelta(days=365)
    for h in fin.holdings_view(session):
        nd = h.get("next_deemed_disposal")
        if nd and date.fromisoformat(nd) <= soon and h["gain"] > 0:
            out.append({"id": f"deemed_{h['id']}", "tone": "watch",
                        "title": f"Deemed disposal on {h['name']} by {nd}",
                        "detail": (f"On the 8th anniversary Revenue treats this holding as sold. Estimated exit tax: "
                                   f"{eur(h.get('deemed_disposal_tax_estimate', 0))} at {tax.EXIT_TAX * 100:.0f}%. "
                                   f"Set cash aside — it's due by 31 October the following year."),
                        "value": None, "page": "investments"})

    # 12. ETFs while pension relief unused at 40%
    has_etfs = any(h["tax_regime"] == "exit_tax" and h["account_type"] == "brokerage" for h in fin.holdings_view(session))
    if has_etfs and pen["headroom"] > 1000 and pen["marginal_rate"] >= 0.4:
        out.append({"id": "etf_vs_pension", "tone": "watch",
                    "title": "Consider a pension before more ETFs",
                    "detail": ("ETFs outside a pension pay 38% exit tax and deemed disposal every 8 years. Inside a pension "
                               "or PRSA the same fund grows tax-free and you get 40% relief going in. The trade-off: the money "
                               "is locked until at least 60 (50 in some company schemes). The Simulator's wrapper comparison "
                               "shows the difference for your numbers."),
                    "value": None, "page": "simulator"})

    order = {"act": 0, "watch": 1, "good": 2}
    return sorted(out, key=lambda i: (order[i["tone"]], -(i.get("value") or 0)))
