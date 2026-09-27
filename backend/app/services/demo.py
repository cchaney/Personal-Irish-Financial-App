"""Demo data: a fictional 34-year-old in Ireland. Load it from Settings → Data, clear it any time."""
import random
from datetime import date, timedelta

from sqlmodel import Session, delete, select

from ..models import Account, BalanceSnapshot, Holding, Rule, Setting, Transaction
from .categorise import categorise, clean_merchant


def clear_all(session: Session) -> None:
    for model in (Transaction, BalanceSnapshot, Holding, Rule, Account, Setting):
        session.exec(delete(model))
    session.commit()


def seed(session: Session) -> dict:
    clear_all(session)
    rnd = random.Random(2026)
    today = date.today()

    def acc(**kw):
        a = Account(**kw)
        session.add(a)
        session.commit()
        session.refresh(a)
        return a

    aib = acc(name="AIB Current", type="current", institution="AIB", balance=3240.55)
    rev = acc(name="Revolut", type="current", institution="Revolut", balance=412.30)
    sav = acc(name="BOI Savings", type="savings", institution="Bank of Ireland", balance=9800, interest_rate=2.0)
    t212 = acc(name="Trading 212", type="brokerage", institution="Trading 212")
    pen = acc(name="Company pension", type="pension", institution="Irish Life", meta={
        "provider": "Irish Life", "product_type": "occupational_dc", "fund_name": "MAPS 4",
        "employee_pct": 5, "employer_pct": 5, "extra_monthly": 0, "annual_fee_pct": 0.75, "sri": 4})
    prsa = acc(name="Old job PRSA", type="pension", institution="Zurich Life", balance=6150, meta={
        "provider": "Zurich Life", "product_type": "prsa", "fund_name": "Prisma 5",
        "employee_pct": 0, "employer_pct": 0, "annual_fee_pct": 1.25, "sri": 5})
    card = acc(name="AIB Credit Card", type="credit_card", institution="AIB", balance=1850, interest_rate=22.6, min_payment=60)
    car = acc(name="Car loan", type="loan", institution="Credit Union", balance=11200, interest_rate=7.5, min_payment=320)

    holdings = [
        Holding(account_id=t212.id, name="Vanguard FTSE All-World UCITS ETF (Acc)", symbol="VWCE.DE", isin="IE00BK5BQT80",
                units=92, cost_basis=10150, price=138.40, tax_regime="exit_tax", purchase_date=date(2023, 3, 14), sri=4, asset_class="etf"),
        Holding(account_id=t212.id, name="iShares Core S&P 500 UCITS ETF (Acc)", symbol="CSPX.AS", isin="IE00B5BMR087",
                units=6, cost_basis=3050, price=610.00, tax_regime="exit_tax", purchase_date=date(2019, 2, 1), sri=4, asset_class="etf"),
        Holding(account_id=t212.id, name="Kerry Group", symbol="KRZ.IR", isin="IE0004906560",
                units=15, cost_basis=1320, price=92.10, tax_regime="cgt", purchase_date=date(2022, 6, 3), sri=5, asset_class="stock"),
        Holding(account_id=t212.id, name="Bitcoin", symbol="BTC-EUR", units=0.06, cost_basis=2280, price=61800.0,
                tax_regime="cgt", purchase_date=date(2024, 2, 1), sri=7, asset_class="crypto"),
        Holding(account_id=pen.id, name="Irish Life MAPS 4", units=15872.1, cost_basis=33400, price=2.4460,
                tax_regime="pension", sri=4, asset_class="fund"),
    ]
    for h in holdings:
        session.add(h)
    session.commit()

    # ---- transactions: ~7 months
    start = date(today.year, today.month, 1)
    for _ in range(6):
        start = (start - timedelta(days=1)).replace(day=1)
    txs = []

    def tx(a, d, desc, amt, reviewed=True):
        if d <= today:
            txs.append(Transaction(account_id=a.id, date=d, description=desc, merchant=clean_merchant(desc),
                                   amount=round(amt, 2), category=categorise(desc, amt), reviewed=reviewed))

    d = start
    while d <= today:
        dom = d.day
        if dom == 25:
            tx(aib, d, "ACME TECHNOLOGY LTD SALARY", 4236.18)
        if dom == 1:
            tx(aib, d, "SO RENT DAFT LANDLORD J MURPHY", -1750)
            tx(aib, d, "TRANSFER TO BOI SAVINGS", -400)
            tx(aib, d, "TRADING 212 DEPOSIT", -300)
        if dom == 3:
            tx(aib, d, "D/D CREDIT UNION LOAN REPAYMENT", -320)
        if dom == 5:
            tx(aib, d, "D/D ELECTRIC IRELAND", -rnd.uniform(78, 135))
        if dom == 7:
            tx(aib, d, "D/D VIRGIN MEDIA", -65)
        if dom == 8:
            tx(rev, d, "Netflix", -13.99)
        if dom == 12:
            tx(rev, d, "Spotify", -11.99)
            tx(aib, d, "D/D VHI HEALTHCARE", -118.40)
        if dom == 15:
            tx(aib, d, "D/D VODAFONE IRELAND", -30)
            tx(aib, d, "AIB CREDIT CARD PAYMENT THANK YOU", -250)
        if dom == 18:
            tx(rev, d, "Flyefit", -39.99)
            tx(rev, d, "Apple.com/bill iCloud", -2.99)
        if dom == 20:
            tx(aib, d, "D/D BORD GAIS ENERGY", -rnd.uniform(40, 95))
        if dom == 2:
            tx(rev, d, "Top-Up by *4417", 350)
            tx(aib, d, "TRANSFER TO REVOLUT", -350)
        if d.weekday() in (1, 5):
            shop = rnd.choice(["TESCO STORES", "LIDL", "DUNNES STORES", "ALDI", "SUPERVALU"])
            tx(aib, d, f"VDP-{shop} DUBLIN", -rnd.uniform(25, 88))
        if d.weekday() in (0, 1, 2, 3, 4) and rnd.random() < 0.55:
            tx(rev, d, rnd.choice(["Insomnia Coffee", "Butlers Chocolate Cafe", "Costa Coffee", "Chopped", "Boojum"]),
               -rnd.uniform(3.5, 14))
        if d.weekday() in (4, 5) and rnd.random() < 0.6:
            tx(rev, d, rnd.choice(["Deliveroo", "Just Eat", "The Brazen Head Pub", "Wagamama", "Bewleys Cafe"]),
               -rnd.uniform(22, 78))
        if d.weekday() == 0:
            tx(rev, d, "Leap Card Top-up TFI", -20)
        if dom in (9, 23):
            tx(aib, d, "VDP-CIRCLE K", -rnd.uniform(55, 75))
        if rnd.random() < 0.05:
            tx(card, d, rnd.choice(["AMAZON.IE", "PENNEYS", "ZARA", "IKEA", "SMYTHS TOYS", "HARVEY NORMAN", "ARGOS"]),
               -rnd.uniform(18, 160))
        if rnd.random() < 0.02:
            tx(card, d, rnd.choice(["RYANAIR", "AER LINGUS", "BOOKING.COM HOTEL"]), -rnd.uniform(60, 320))
        if rnd.random() < 0.03:
            tx(rev, d, "PADDY POWER", -rnd.uniform(10, 40))
        if rnd.random() < 0.04:
            tx(aib, d, rnd.choice(["HICKEYS PHARMACY", "BOOTS", "GP CLINIC RANELAGH"]), -rnd.uniform(12, 65))
        if rnd.random() < 0.02:
            tx(rev, d, "SQ *FARMERS MARKET STALL", -rnd.uniform(8, 30), reviewed=False)
        d += timedelta(days=1)
    # most recent week is "needs review", as if freshly imported
    for t in txs:
        if (today - t.date).days <= 6:
            t.reviewed = False
    session.add_all(txs)

    # ---- 24 months of balance history
    values_now = {aib.id: aib.balance, rev.id: rev.balance, sav.id: sav.balance,
                  t212.id: sum(h.units * h.price for h in holdings if h.account_id == t212.id),
                  pen.id: sum(h.units * h.price for h in holdings if h.account_id == pen.id),
                  prsa.id: prsa.balance, card.id: card.balance, car.id: car.balance}
    for m in range(24, -1, -1):
        y, mo = today.year, today.month - m
        while mo <= 0:
            y, mo = y - 1, mo + 12
        snap_date = date(y, mo, 28) if m else today
        for aid, now in values_now.items():
            if aid in (aib.id, rev.id):
                v = now * rnd.uniform(0.7, 1.3)
            elif aid == sav.id:
                v = max(0, now - 400 * m)
            elif aid == t212.id:
                v = now * (1 - 0.018 * m) * rnd.uniform(0.95, 1.04)
            elif aid == pen.id:
                v = now * (1 - 0.014 * m) * rnd.uniform(0.97, 1.02)
            elif aid == prsa.id:
                v = now * (1 - 0.004 * m)
            elif aid == car.id:
                v = min(18000, now + 250 * m)
            else:
                v = now * rnd.uniform(0.6, 1.4)
            session.add(BalanceSnapshot(account_id=aid, date=snap_date, balance=round(max(v, 0), 2)))

    session.add(Setting(key="emergency", value={"source": "account", "account_id": sav.id, "months": 3, "target": None}))
    session.add(Setting(key="profile", value={
        "name": "Demo", "date_of_birth": f"{today.year - 34}-04-12", "gross_salary": 72000, "salary_growth": 2.5,
        "retirement_age": 66, "tax_status": "single", "emergency_months_target": 6, "target_retirement_income": 35000}))
    session.commit()
    return {"accounts": 8, "transactions": len(txs)}
