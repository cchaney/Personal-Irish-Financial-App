"""Database tables."""
import datetime as dt
from typing import Optional

from sqlmodel import JSON, Column, Field, SQLModel

ASSET_TYPES = ["current", "savings", "cash", "brokerage", "pension", "property", "other_asset"]
LIABILITY_TYPES = ["credit_card", "loan", "mortgage"]
ACCOUNT_TYPES = ASSET_TYPES + LIABILITY_TYPES
LIQUID_TYPES = {"current", "savings", "cash"}


class Account(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str = "current"
    institution: str = ""
    currency: str = "EUR"
    # Always stored as a positive number. For liabilities it is the amount owed.
    balance: float = 0.0
    # Annual %: APR for debts, AER for savings.
    interest_rate: float = 0.0
    # Monthly repayment for debts.
    min_payment: float = 0.0
    # Type-specific details, e.g. pension provider, contribution %, fund risk rating.
    meta: dict = Field(default_factory=dict, sa_column=Column(JSON))
    archived: bool = False
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    @property
    def is_liability(self) -> bool:
        return self.type in LIABILITY_TYPES


class BalanceSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(index=True, foreign_key="account.id")
    date: dt.date
    balance: float


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(index=True, foreign_key="account.id")
    date: dt.date = Field(index=True)
    description: str          # raw text from the bank
    merchant: str = ""        # cleaned-up name shown in the UI
    # Negative = money out, positive = money in.
    amount: float
    category: str = Field(default="Uncategorised", index=True)
    notes: str = ""
    reviewed: bool = Field(default=True, index=True)   # imported rows start as "needs review"
    import_hash: Optional[str] = Field(default=None, index=True)


class Rule(SQLModel, table=True):
    """User categorisation rule: if description contains `pattern`, set `category`."""
    id: Optional[int] = Field(default=None, primary_key=True)
    pattern: str
    category: str


class Holding(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(index=True, foreign_key="account.id")
    name: str
    symbol: str = ""          # Yahoo Finance ticker, e.g. VWCE.DE, CSPX.L
    isin: str = ""
    asset_class: str = "equity"   # equity, bond, multi_asset, property, cash, crypto
    units: float = 0.0
    cost_basis: float = 0.0   # total € paid
    price: float = 0.0        # € per unit
    price_date: Optional[dt.date] = None
    # exit_tax (Irish/EU funds & ETFs), cgt (shares), pension (gross roll-up), none
    tax_regime: str = "exit_tax"
    purchase_date: Optional[dt.date] = None
    sri: int = 5              # EU risk indicator 1-7 from the fund factsheet

    @property
    def value(self) -> float:
        return round(self.units * self.price, 2)


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: dict = Field(default_factory=dict, sa_column=Column(JSON))
