"""Run with: cd backend && PIFA_DATA_DIR=/tmp/pifa-test pytest -q"""
import os
import tempfile

os.environ.setdefault("PIFA_DATA_DIR", tempfile.mkdtemp())

from app.services import importers, irish_tax as tax, simulator as sim  # noqa: E402
from app.services.categorise import categorise, clean_merchant  # noqa: E402


def test_relief_bands():
    assert tax.relief_pct_for_age(29) == 0.15
    assert tax.relief_pct_for_age(34) == 0.20
    assert tax.relief_pct_for_age(62) == 0.40
    assert tax.max_relievable_contribution(45, 200_000) == 0.25 * 115_000


def test_marginal_rate():
    assert tax.marginal_rate(40_000) == 0.20
    assert tax.marginal_rate(50_000) == 0.40
    assert tax.marginal_rate(50_000, "married_one_income") == 0.20


def test_lump_sum_tax():
    assert tax.lump_sum_tax(150_000) == 0
    assert tax.lump_sum_tax(300_000) == 100_000 * 0.20


def test_auto_enrolment_phases():
    assert tax.auto_enrolment_rates(2026) == (0.015, 0.015, 0.005)
    assert tax.auto_enrolment_rates(2029) == (0.03, 0.03, 0.01)
    assert tax.auto_enrolment_rates(2040) == (0.06, 0.06, 0.02)


def test_revolut_import_skips_reverted_and_subtracts_fee():
    text = ("Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n"
            "CARD_PAYMENT,Current,2026-09-01 10:00:00,2026-09-02 10:00:00,Tesco,-45.20,0.50,EUR,COMPLETED,100\n"
            "CARD_PAYMENT,Current,2026-09-03 10:00:00,,Netflix,-12.99,0,EUR,REVERTED,90\n")
    headers, rows = importers.read_rows(text)
    m = importers.detect_mapping(headers)
    txs, _ = importers.parse(rows, m)
    assert m["preset"] == "Revolut"
    assert len(txs) == 1 and txs[0]["amount"] == -45.70


def test_aib_debit_credit_columns():
    text = (" Posted Account, Posted Transactions Date, Description1, Description2, Description3, Debit Amount, Credit Amount,Balance\n"
            "932,01/09/2026,VDP-CIRCLE K,DUBLIN,,52.10,,1000.00\n932,25/09/2026,ACME SALARY,,,,\"3,650.00\",4600\n")
    headers, rows = importers.read_rows(text)
    txs, _ = importers.parse(rows, importers.detect_mapping(headers))
    assert [t["amount"] for t in txs] == [-52.10, 3650.00]
    assert txs[0]["date"].isoformat() == "2026-09-01"


def test_amount_parsing():
    assert importers.parse_amount("1.234,56") == 1234.56
    assert importers.parse_amount("(12.50)") == -12.50
    assert importers.parse_amount("€1,200.00") == 1200.0


def test_categorise_irish_merchants():
    assert categorise("VDP-TESCO STORES", -40) == "Groceries"
    assert categorise("Leap Card Top-up TFI", -20) == "Transport"
    assert categorise("Top-Up by *1234", 200) == "Transfers"
    assert categorise("D/D ELECTRIC IRELAND", -80) == "Utilities"
    assert clean_merchant("VDP-CIRCLE K DUBLIN") == "Circle K"


def test_pension_sim_shapes():
    r = sim.simulate_pension(dict(current_age=35, retirement_age=66, current_pot=20000, salary=60000,
                                  employee_pct=5, employer_pct=5, expected_return=5.5, volatility=11,
                                  annual_fee=0.75, inflation=2, target_income=30000, n_paths=300))
    assert len(r["years"]) == 32
    a = r["at_retirement"]["pot_nominal"]
    assert a["p10"] < a["p50"] < a["p90"]
    assert r["totals"]["tax_relief"] > 0


def test_exit_tax_costs_more_than_cgt_over_long_horizon():
    r = sim.simulate_investment(dict(initial=10000, monthly=300, years=25, expected_return=6.5, volatility=15,
                                     annual_fee=0.2, n_paths=500))
    c = r["compare_wrappers"]
    assert c["gross"]["median_after_tax"] > c["cgt"]["median_after_tax"] > c["exit_tax"]["median_after_tax"]


def test_debt_avalanche_saves_interest():
    debts = [dict(name="Card", balance=2000, apr=22, min_payment=60), dict(name="Loan", balance=8000, apr=7, min_payment=250)]
    base = sim.simulate_debt(debts, 0)
    fast = sim.simulate_debt(debts, 200, "avalanche")
    assert fast["months"] < base["months"] and fast["total_interest"] < base["total_interest"]
    assert fast["order"][0]["name"] == "Card"
