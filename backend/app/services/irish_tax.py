"""
Irish tax & pension rules used across PIFA.

All figures are for the 2026 tax year and were checked in September 2026.
They change every Budget (usually October) — update this file when they do.
Nothing here is tax advice; it is a best-effort model for planning.
"""

TAX_YEAR = 2026

# Income tax: 20% up to the standard rate band, 40% above.
STANDARD_RATE_BAND = {
    "single": 44_000,
    "married_one_income": 53_000,
    "married_two_incomes": 53_000,  # + up to 35,000 transferable to the second earner
}
MARRIED_SECOND_EARNER_MAX_INCREASE = 35_000

# Pension tax relief: max % of earnings you can contribute with relief, by age.
PENSION_RELIEF_AGE_BANDS = [
    (0, 29, 0.15),
    (30, 39, 0.20),
    (40, 49, 0.25),
    (50, 54, 0.30),
    (55, 59, 0.35),
    (60, 200, 0.40),
]
PENSION_EARNINGS_CAP = 115_000

# At retirement
LUMP_SUM_FRACTION = 0.25
LUMP_SUM_TAX_FREE = 200_000
LUMP_SUM_20PC_BAND = 300_000          # next €300k taxed at 20%
STANDARD_FUND_THRESHOLD = {2026: 2_200_000, 2027: 2_400_000, 2028: 2_600_000, 2029: 2_800_000}

# State Pension (Contributory), maximum personal rate from January 2026
STATE_PENSION_WEEKLY = 299.30
STATE_PENSION_AGE = 66

# My Future Fund (auto-enrolment), launched 1 January 2026
AUTO_ENROLMENT = {
    "min_age": 23, "max_age": 60, "earnings_threshold": 20_000, "earnings_cap": 80_000,
    # (from_year_of_scheme, employee, employer, state)
    "phases": [(1, 0.015, 0.015, 0.005), (4, 0.03, 0.03, 0.01),
               (7, 0.045, 0.045, 0.015), (10, 0.06, 0.06, 0.02)],
    "start_year": 2026,
}

# Investment taxes
EXIT_TAX = 0.38            # Irish/EU-domiciled funds & ETFs (reduced from 41% on 1 Jan 2026)
DEEMED_DISPOSAL_YEARS = 8
CGT = 0.33                 # direct shares, most non-EU ETFs
CGT_ANNUAL_EXEMPTION = 1_270
DIRT = 0.33                # deposit interest

# Assumed long-run returns by EU Summary Risk Indicator (1-7), nominal, before fees.
# Every Irish pension/investment fund factsheet shows this 1-7 rating.
SRI_ASSUMPTIONS = {
    1: {"return": 1.5, "volatility": 1.0},
    2: {"return": 2.5, "volatility": 3.0},
    3: {"return": 4.0, "volatility": 7.0},
    4: {"return": 5.5, "volatility": 11.0},
    5: {"return": 6.5, "volatility": 15.0},
    6: {"return": 7.5, "volatility": 20.0},
    7: {"return": 8.5, "volatility": 28.0},
}


def relief_pct_for_age(age: float) -> float:
    for lo, hi, pct in PENSION_RELIEF_AGE_BANDS:
        if lo <= age <= hi:
            return pct
    return 0.15


def marginal_rate(gross_salary: float, tax_status: str = "single", partner_income: float = 0) -> float:
    band = STANDARD_RATE_BAND.get(tax_status, STANDARD_RATE_BAND["single"])
    if tax_status == "married_two_incomes":
        band += min(partner_income, MARRIED_SECOND_EARNER_MAX_INCREASE)
    return 0.40 if gross_salary > band else 0.20


def max_relievable_contribution(age: float, gross_salary: float) -> float:
    return relief_pct_for_age(age) * min(gross_salary, PENSION_EARNINGS_CAP)


def lump_sum_tax(lump: float) -> float:
    """Tax on the retirement lump sum (the part above the income-tax-at-marginal-rate band is ignored)."""
    taxable = max(0.0, lump - LUMP_SUM_TAX_FREE)
    in_20 = min(taxable, LUMP_SUM_20PC_BAND)
    above = max(0.0, taxable - LUMP_SUM_20PC_BAND)
    return in_20 * 0.20 + above * 0.40


def auto_enrolment_rates(calendar_year: int):
    """(employee, employer, state) rates for My Future Fund in a given calendar year."""
    scheme_year = calendar_year - AUTO_ENROLMENT["start_year"] + 1
    rates = AUTO_ENROLMENT["phases"][0][1:]
    for start, ee, er, st in AUTO_ENROLMENT["phases"]:
        if scheme_year >= start:
            rates = (ee, er, st)
    return rates


def sft_for_year(year: int) -> float:
    if year in STANDARD_FUND_THRESHOLD:
        return STANDARD_FUND_THRESHOLD[year]
    return STANDARD_FUND_THRESHOLD[max(STANDARD_FUND_THRESHOLD)] if year > 2029 else 2_000_000


def rules_summary() -> dict:
    """Plain summary used by the UI and fed to the AI coach."""
    return {
        "tax_year": TAX_YEAR,
        "standard_rate_band_single": STANDARD_RATE_BAND["single"],
        "pension_relief_age_bands": [
            {"ages": f"{lo}-{hi if hi < 200 else '+'}", "max_pct_of_earnings": pct}
            for lo, hi, pct in PENSION_RELIEF_AGE_BANDS
        ],
        "pension_earnings_cap": PENSION_EARNINGS_CAP,
        "lump_sum": "25% of pot; first €200,000 tax-free, next €300,000 taxed at 20%",
        "standard_fund_threshold_2026": STANDARD_FUND_THRESHOLD[2026],
        "state_pension_weekly": STATE_PENSION_WEEKLY,
        "state_pension_age": STATE_PENSION_AGE,
        "auto_enrolment": "My Future Fund: 1.5% employee + 1.5% employer + 0.5% State on earnings up to €80,000 "
                          "(2026-2028), rising every 3 years to 6%/6%/2% from 2035. No tax relief on employee part.",
        "exit_tax": EXIT_TAX,
        "deemed_disposal_years": DEEMED_DISPOSAL_YEARS,
        "cgt": CGT,
        "cgt_annual_exemption": CGT_ANNUAL_EXEMPTION,
        "dirt": DIRT,
    }
