"""Reference data: Irish providers and banks. Used for dropdowns — you can type any name."""

PENSION_PROVIDERS = [
    "Irish Life", "Zurich Life", "Aviva Life & Pensions", "New Ireland Assurance",
    "Standard Life International", "Royal London Ireland", "Davy", "Mercer",
    "Acorn Life", "Cornmarket", "My Future Fund (auto-enrolment)", "Other",
]

PENSION_PRODUCTS = {
    "occupational_dc": "Company pension (defined contribution)",
    "prsa": "PRSA",
    "personal_pension": "Personal pension / retirement annuity (RAC)",
    "avc": "Additional voluntary contributions (AVC)",
    "auto_enrolment": "My Future Fund (auto-enrolment)",
    "prb": "Personal retirement bond (PRB)",
    "arf": "Approved retirement fund (ARF, in drawdown)",
    "db": "Defined benefit (enter the transfer value)",
}

BANKS = [
    "AIB", "Bank of Ireland", "PTSB", "Revolut", "N26", "bunq", "Trade Republic",
    "Credit Union", "An Post Money", "State Savings", "Avant Money", "Other",
]

BROKERS = [
    "Trading 212", "Degiro", "Interactive Brokers", "Trade Republic", "eToro",
    "Revolut", "Davy Select", "Goodbody", "Other",
]

CATEGORIES = [
    "Income", "Housing", "Groceries", "Eating out", "Takeaway", "Transport", "Fuel",
    "Utilities", "Phone & internet", "Subscriptions", "Shopping", "Health",
    "Health insurance", "Fitness", "Travel", "Entertainment", "Personal care",
    "Kids & childcare", "Gifts & charity", "Education", "Insurance", "Fees & charges",
    "Taxes", "Gambling", "Savings & investing", "Debt repayment", "Transfers",
    "Cash withdrawal", "Other", "Uncategorised",
]

# Categories that are not real spending (moving money between your own accounts).
NON_SPEND_CATEGORIES = {"Transfers", "Savings & investing", "Debt repayment", "Income"}


# Category → group (as in the Spending and Cash flow pages) and group colours.
CATEGORY_GROUPS = {
    "Income": "Income",
    "Housing": "Home", "Utilities": "Home",
    "Groceries": "Food & dining", "Eating out": "Food & dining", "Takeaway": "Food & dining",
    "Transport": "Transport", "Fuel": "Transport",
    "Phone & internet": "Bills", "Subscriptions": "Bills", "Insurance": "Bills",
    "Fees & charges": "Bills", "Taxes": "Bills",
    "Shopping": "Shopping",
    "Health": "Health", "Health insurance": "Health", "Fitness": "Health", "Personal care": "Health",
    "Travel": "Travel",
    "Entertainment": "Lifestyle", "Gambling": "Lifestyle", "Gifts & charity": "Lifestyle", "Education": "Lifestyle",
    "Kids & childcare": "Kids",
    "Savings & investing": "Savings", "Debt repayment": "Debt",
    "Transfers": "Transfers",
    "Cash withdrawal": "Other", "Other": "Other", "Uncategorised": "Uncategorised",
}

GROUP_COLORS = {
    "Home": "#2F6FDB", "Food & dining": "#E9A21A", "Transport": "#E0739B", "Bills": "#1E8E3E",
    "Shopping": "#9CA3AF", "Health": "#14A3A3", "Travel": "#8B5CF6", "Lifestyle": "#C4B5A0",
    "Kids": "#B8B8B8", "Other": "#D1D5DB", "Uncategorised": "#F26B2A", "Savings": "#34B27B",
    "Debt": "#DC4C3E", "Income": "#1FA971", "Transfers": "#CBD5E1",
}


def group_of(category: str) -> str:
    return CATEGORY_GROUPS.get(category, "Other")
