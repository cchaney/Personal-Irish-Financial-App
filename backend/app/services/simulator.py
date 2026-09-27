"""
Projection engines: pension, investments (with Irish exit tax / deemed disposal), debt payoff.

Monte Carlo uses annual log-normal returns. It is a planning model, not a forecast.
"""
from datetime import date

import numpy as np

from . import irish_tax as tax

PCTS = [10, 25, 50, 75, 90]


def _lognormal_params(mean_pct: float, vol_pct: float):
    mu = mean_pct / 100.0
    vol = max(vol_pct, 0.0001) / 100.0
    s2 = np.log(1 + (vol / (1 + mu)) ** 2)
    m = np.log(1 + mu) - s2 / 2
    return m, np.sqrt(s2)


def _draw_returns(rng, n_paths, mean_pct, vol_pct):
    m, s = _lognormal_params(mean_pct, vol_pct)
    return np.exp(rng.normal(m, s, n_paths)) - 1


def _pct_dict(arr):
    vals = np.percentile(arr, PCTS)
    return {f"p{p}": round(float(v), 0) for p, v in zip(PCTS, vals)}


def _pmt(pv: float, rate: float, n: int) -> float:
    if n <= 0:
        return 0.0
    if abs(rate) < 1e-9:
        return pv / n
    return pv * rate / (1 - (1 + rate) ** -n)


# --------------------------------------------------------------------------- pension

def simulate_pension(p: dict) -> dict:
    """
    p keys: current_age, retirement_age, current_pot, salary, salary_growth, employee_pct,
    employer_pct, extra_monthly, expected_return, volatility, annual_fee, inflation,
    lifestyle_years, target_income, include_state_pension, tax_status, partner_income,
    drawdown_to_age, post_retirement_return, n_paths, seed
    """
    rng = np.random.default_rng(p.get("seed", 42))
    n_paths = int(p.get("n_paths", 2000))
    age0 = float(p["current_age"])
    ret_age = int(p["retirement_age"])
    years = max(1, int(round(ret_age - age0)))
    infl = p.get("inflation", 2.0) / 100
    fee = p.get("annual_fee", 0.75) / 100
    g = p.get("salary_growth", 2.5) / 100
    lifestyle = int(p.get("lifestyle_years", 5))
    mr = tax.marginal_rate(p["salary"], p.get("tax_status", "single"), p.get("partner_income", 0))
    this_year = date.today().year

    pots = np.full(n_paths, float(p.get("current_pot", 0)))
    det = float(p.get("current_pot", 0))
    rows = [{"age": int(age0), "year": this_year, **{k: round(float(det), 0) for k in ("p10", "p25", "p50", "p75", "p90")},
             "expected": round(det, 0), "contributed": 0.0}]
    tot_ee = tot_er = tot_relief = 0.0

    for y in range(years):
        age = age0 + y
        salary = p["salary"] * (1 + g) ** y
        ee = salary * p.get("employee_pct", 5) / 100 + p.get("extra_monthly", 0) * 12
        er = salary * p.get("employer_pct", 5) / 100
        relief = min(ee, tax.max_relievable_contribution(age, salary)) * mr
        contrib = ee + er
        tot_ee += ee
        tot_er += er
        tot_relief += relief

        # Lifestyling: glide towards a cautious mix over the final years.
        mean, vol = p.get("expected_return", 5.5), p.get("volatility", 11)
        yrs_left = years - y
        if lifestyle and yrs_left <= lifestyle:
            w = (lifestyle - yrs_left + 1) / (lifestyle + 1)
            mean = mean * (1 - w) + 3.0 * w
            vol = vol * (1 - w) + 5.0 * w
        r = _draw_returns(rng, n_paths, mean, vol) - fee
        pots = (pots + contrib / 2) * (1 + r) + contrib / 2
        det = (det + contrib / 2) * (1 + mean / 100 - fee) + contrib / 2

        deflator = (1 + infl) ** (y + 1)
        row = {"age": int(age + 1), "year": this_year + y + 1, "expected": round(det, 0),
               "contributed": round(tot_ee + tot_er, 0), "expected_real": round(det / deflator, 0)}
        row.update(_pct_dict(pots))
        row.update({f"{k}_real": round(v / deflator, 0) for k, v in _pct_dict(pots).items()})
        rows.append(row)

    deflator = (1 + infl) ** years
    real_pots = pots / deflator

    # Retirement: 25% lump sum, remainder into an ARF drawn down to `drawdown_to_age`.
    lump = np.minimum(pots * tax.LUMP_SUM_FRACTION, 10_000_000)
    lump_tax = np.vectorize(tax.lump_sum_tax)(lump)
    arf = pots - lump
    post_r = p.get("post_retirement_return", 4.0) / 100
    real_post_r = (1 + post_r) / (1 + infl) - 1
    n_draw = max(1, int(p.get("drawdown_to_age", 90)) - ret_age)
    real_arf = arf / deflator
    gross_income_real = np.array([_pmt(v, real_post_r, n_draw) for v in real_arf])
    state = tax.STATE_PENSION_WEEKLY * 52 if p.get("include_state_pension", True) else 0.0
    total_income_real = gross_income_real + state
    target = float(p.get("target_income", 0) or 0)
    success = float(np.mean(total_income_real >= target)) if target else None

    final_salary_real = p["salary"] * (1 + g) ** years / deflator
    sft = tax.sft_for_year(this_year + years)

    return {
        "years": rows,
        "marginal_rate": mr,
        "totals": {
            "employee": round(tot_ee, 0), "employer": round(tot_er, 0),
            "tax_relief": round(tot_relief, 0), "net_cost_to_you": round(tot_ee - tot_relief, 0),
        },
        "at_retirement": {
            "age": ret_age, "year": this_year + years,
            "pot_nominal": _pct_dict(pots),
            "pot_today_money": _pct_dict(real_pots),
            "lump_sum_today_money": _pct_dict((lump - lump_tax) / deflator),
            "arf_income_today_money": _pct_dict(gross_income_real),
            "state_pension": round(state, 0),
            "total_income_today_money": _pct_dict(total_income_real),
            "replacement_ratio_median": round(float(np.median(total_income_real)) / final_salary_real, 3) if final_salary_real else None,
            "chance_of_meeting_target": success,
            "target_income": target,
            "sft_limit": sft,
            "chance_over_sft": float(np.mean(pots > sft)),
            "bridge_years_before_state_pension": max(0, tax.STATE_PENSION_AGE - ret_age),
        },
        "assumptions": {k: p.get(k) for k in ("expected_return", "volatility", "annual_fee", "inflation",
                                               "salary_growth", "lifestyle_years", "post_retirement_return",
                                               "drawdown_to_age")},
    }


# --------------------------------------------------------------------------- investments

def _run_regime(growth: np.ndarray, contribs: list[float], regime: str, deposit_rate: float = 2.5):
    """growth: [paths, years] annual returns after fees. Returns (gross_value, after_tax_value, tax_paid) per year."""
    n_paths, years = growth.shape
    out_gross = np.zeros((n_paths, years + 1))
    out_net = np.zeros((n_paths, years + 1))
    tax_paid = np.zeros(n_paths)
    out_gross[:, 0] = contribs[0]
    out_net[:, 0] = contribs[0]

    if regime == "deposit":
        bal = np.full(n_paths, 0.0)
        for y in range(years):
            bal = bal + contribs[y]
            interest = bal * deposit_rate / 100
            dirt = interest * tax.DIRT
            tax_paid += dirt
            bal = bal + interest - dirt
            out_gross[:, y + 1] = bal
            out_net[:, y + 1] = bal
        return out_gross, out_net, tax_paid

    index = np.ones(n_paths)
    units = np.zeros((n_paths, years))
    base = np.zeros((n_paths, years))
    for y in range(years):
        units[:, y] = contribs[y] / index
        base[:, y] = contribs[y]
        index = index * (1 + growth[:, y])
        if regime == "exit_tax":
            for k in range(y + 1):
                held = y + 1 - k
                if held % tax.DEEMED_DISPOSAL_YEARS == 0:
                    gain = units[:, k] * index - base[:, k]
                    t = np.maximum(gain, 0) * tax.EXIT_TAX
                    tax_paid += t
                    units[:, k] -= t / index          # assume the tax is paid by selling units
                    base[:, k] = units[:, k] * index
        value = (units * index[:, None]).sum(axis=1)
        out_gross[:, y + 1] = value
        if regime == "exit_tax":
            liability = (np.maximum(units * index[:, None] - base, 0) * tax.EXIT_TAX).sum(axis=1)
        elif regime == "cgt":
            gain = value - base.sum(axis=1)
            liability = np.maximum(gain - tax.CGT_ANNUAL_EXEMPTION, 0) * tax.CGT
        else:  # gross roll-up (inside a pension, before drawdown tax)
            liability = np.zeros(n_paths)
        out_net[:, y + 1] = value - liability
    return out_gross, out_net, tax_paid


def simulate_investment(p: dict) -> dict:
    """
    p keys: initial, monthly, years, expected_return, volatility, annual_fee, inflation,
    tax_regime (exit_tax|cgt|gross|deposit), deposit_rate, n_paths, seed
    """
    rng = np.random.default_rng(p.get("seed", 7))
    n_paths = int(p.get("n_paths", 2000))
    years = max(1, int(p.get("years", 20)))
    fee = p.get("annual_fee", 0.2) / 100
    infl = p.get("inflation", 2.0) / 100
    m, s = _lognormal_params(p.get("expected_return", 6.5), p.get("volatility", 15))
    growth = np.exp(rng.normal(m, s, (n_paths, years))) - 1 - fee
    contribs = [p.get("initial", 0) + p.get("monthly", 0) * 12] + [p.get("monthly", 0) * 12] * (years - 1)
    regime = p.get("tax_regime", "exit_tax")
    deposit_rate = p.get("deposit_rate", 2.5)

    gross, net, tax_paid = _run_regime(growth, contribs, regime, deposit_rate)
    rows = []
    this_year = date.today().year
    initial = float(p.get("initial", 0))
    for y in range(years + 1):
        deflator = (1 + infl) ** y
        values = np.full(n_paths, initial) if y == 0 else net[:, y]
        row = {"year": this_year + y, "t": y,
               "contributed": round(initial if y == 0 else float(sum(contribs[:y])), 0)}
        row.update(_pct_dict(values))
        row.update({f"{k}_real": round(v / deflator, 0) for k, v in _pct_dict(values).items()})
        rows.append(row)
    total_in = sum(contribs)

    # Same money, same markets, different wrappers (median outcome after tax if sold at the end).
    compare = {}
    for reg in ("exit_tax", "cgt", "gross", "deposit"):
        _, n, t = _run_regime(growth, contribs, reg, deposit_rate)
        compare[reg] = {"median_after_tax": round(float(np.median(n[:, -1])), 0),
                        "median_tax_paid_along_the_way": round(float(np.median(t)), 0)}

    final = net[:, -1]
    return {
        "years": rows,
        "total_contributed": round(total_in, 0),
        "final": _pct_dict(final),
        "final_today_money": _pct_dict(final / (1 + infl) ** years),
        "chance_of_loss": float(np.mean(final < total_in)),
        "median_tax_paid_along_the_way": round(float(np.median(tax_paid)), 0),
        "compare_wrappers": compare,
        "regime": regime,
    }


# --------------------------------------------------------------------------- debt

def simulate_debt(debts: list[dict], extra_monthly: float = 0.0, strategy: str = "avalanche") -> dict:
    """debts: [{name, balance, apr, min_payment}]. Returns payoff timeline."""
    ds = [dict(d) for d in debts if d.get("balance", 0) > 0]
    if not ds:
        return {"months": 0, "total_interest": 0, "timeline": [], "order": [], "warnings": []}
    warnings = []
    for d in ds:
        interest = d["balance"] * d["apr"] / 100 / 12
        if d.get("min_payment", 0) <= interest:
            warnings.append(f"{d['name']}: the monthly payment doesn't cover the interest — this balance will never clear at this rate.")
    budget = sum(d.get("min_payment", 0) for d in ds) + extra_monthly
    total_interest, month, timeline, order = 0.0, 0, [], []
    while any(d["balance"] > 0.005 for d in ds) and month < 600:
        month += 1
        for d in ds:
            if d["balance"] > 0:
                i = d["balance"] * d["apr"] / 100 / 12
                d["balance"] += i
                total_interest += i
        remaining = budget
        for d in ds:
            if d["balance"] > 0:
                pay = min(d.get("min_payment", 0), d["balance"], remaining)
                d["balance"] -= pay
                remaining -= pay
        live = [d for d in ds if d["balance"] > 0.005]
        if strategy == "snowball":
            live.sort(key=lambda d: d["balance"])
        else:
            live.sort(key=lambda d: -d["apr"])
        for d in live:
            if remaining <= 0:
                break
            pay = min(d["balance"], remaining)
            d["balance"] -= pay
            remaining -= pay
        for d in ds:
            if d["balance"] <= 0.005 and d["name"] not in [o["name"] for o in order]:
                d["balance"] = 0
                order.append({"name": d["name"], "month": month})
        timeline.append({"month": month, "total": round(sum(d["balance"] for d in ds), 2)})
    return {"months": month, "total_interest": round(total_interest, 2), "timeline": timeline,
            "order": order, "warnings": warnings, "capped": month >= 600}
