"""Rule-based categorisation tuned for Irish merchants. User rules always win."""
import re

DEFAULT_RULES: list[tuple[str, str]] = [
    # Income
    (r"\b(salary|payroll|wages|pay from|net pay)\b", "Income"),
    (r"\b(revenue commissioners refund|tax refund|dsp|dept social|child benefit)\b", "Income"),
    # Transfers between own accounts
    (r"\b(top-?up by|top-?up from|transfer to|transfer from|to savings|from savings|to pocket|internal transfer|own account)\b", "Transfers"),
    (r"\b(credit card payment|card payment received|payment thank you|payment - thank you)\b", "Transfers"),
    # Savings / investing
    (r"\b(trading ?212|degiro|interactive brokers|etoro|trade republic|davy|state savings|prize bonds|an post savings)\b", "Savings & investing"),
    (r"\b(irish life|zurich life|aviva|new ireland|standard life|royal london|prsa)\b", "Savings & investing"),
    # Debt
    (r"\b(credit union|loan repayment|car finance|bluestone|avant money|mortgage)\b", "Debt repayment"),
    # Housing
    (r"\b(rent|rtb|residential tenancies|landlord|daft\.ie)\b", "Housing"),
    (r"\b(lpt|local property tax)\b", "Taxes"),
    # Groceries
    (r"\b(tesco|dunnes|lidl|aldi|supervalu|super valu|centra|spar|mace|londis|eurospar|marks ?& ?spencer food|m&s|fresh the good food|donnybrook fair|polish shop)\b", "Groceries"),
    # Fuel & transport
    (r"\b(circle ?k|applegreen|maxol|texaco|top oil|emo|inver|certa|esso|ionity|easygo|esb ecars)\b", "Fuel"),
    (r"\b(leap|tfi|irish rail|iarnrod|dublin bus|bus eireann|go-ahead|luas|dart|freenow|free now|uber|bolt|eflow|toll|parking|apcoa|parkingtag|nct|motor tax)\b", "Transport"),
    # Utilities & comms
    (r"\b(electric ireland|bord gais|bord gáis|sse airtricity|energia|flogas|panda power|pinergy|community power|yuno|uisce eireann|irish water|panda waste|greenstar|city bin|bin)\b", "Utilities"),
    (r"\b(eir|vodafone|three ireland|\bthree\b|virgin media|sky ireland|sky digital|48 ?months|gomo|tesco mobile|clearmobile|pure telecom|digiweb)\b", "Phone & internet"),
    # Subscriptions
    (r"\b(netflix|spotify|disney|apple\.com|itunes|google storage|google one|youtube|amazon prime|prime video|now tv|audible|chatgpt|openai|claude|anthropic|patreon|xbox|playstation|nintendo|icloud|microsoft 365|dropbox)\b", "Subscriptions"),
    # Food
    (r"\b(deliveroo|just eat|justeat|uber eats|buymie)\b", "Takeaway"),
    (r"\b(starbucks|costa|insomnia|butlers|cafe|café|coffee|bewleys|restaurant|bistro|pizza|burrito|boojum|chopped|supermacs|mcdonald|burger king|nando|eddie rockets|five guys|wagamama|pub|bar |brasserie|kitchen|eatery|zaytoon)\b", "Eating out"),
    # Health
    (r"\b(vhi|laya|irish life health|level health)\b", "Health insurance"),
    (r"\b(pharmacy|chemist|boots|lloyds|hickey|sam mccauley|totalhealth|doctor|gp |medical|dental|dentist|clinic|hospital|physio|optician|specsavers)\b", "Health"),
    (r"\b(flyefit|energie|gym|pure gym|puregym|ben dunne|westwood|crossfit|yoga|parkrun|strava)\b", "Fitness"),
    # Shopping
    (r"\b(amazon|penneys|primark|zara|h ?& ?m|brown thomas|arnotts|dunnes stores clothing|tk ?maxx|ikea|harvey norman|currys|did electrical|power city|argos|woodies|b&q|homestore|smyths|easons|shein|asos|zalando|next |sports direct|elverys|jd sports|decathlon)\b", "Shopping"),
    # Travel
    (r"\b(ryanair|aer lingus|airbnb|booking\.com|hotel|hostel|expedia|irish ferries|stena|daa|dublin airport|cityjet|emerald airlines)\b", "Travel"),
    # Entertainment
    (r"\b(cinema|odeon|omniplex|imc|ticketmaster|eventbrite|lotto|national lottery|steam)\b", "Entertainment"),
    (r"\b(paddy ?power|boylesports|bet365|betfair|ladbrokes|betvictor)\b", "Gambling"),
    # Personal care, kids, gifts
    (r"\b(hairdress|barber|salon|beauty|nails)\b", "Personal care"),
    (r"\b(creche|childcare|montessori|school|ncs)\b", "Kids & childcare"),
    (r"\b(gofundme|charity|trocaire|concern|svp|barnardos|pieta)\b", "Gifts & charity"),
    # Insurance & fees
    (r"\b(insurance|axa|allianz|fbd|aviva general|liberty insurance|zurich insurance|chill insurance)\b", "Insurance"),
    (r"\b(fee|charge|interest charged|overdraft|stamp duty|government stamp)\b", "Fees & charges"),
    (r"\b(atm|cash withdrawal|withdrawal atm)\b", "Cash withdrawal"),
]

_COMPILED = [(re.compile(p, re.IGNORECASE), c) for p, c in DEFAULT_RULES]


def categorise(description: str, amount: float, user_rules: list[tuple[str, str]] | None = None) -> str:
    desc = description or ""
    for pattern, category in (user_rules or []):
        if pattern and pattern.lower() in desc.lower():
            return category
    for regex, category in _COMPILED:
        if regex.search(desc):
            # A positive amount matching a shop is a refund: keep the shop's category.
            return category
    return "Income" if amount > 0 and amount >= 500 else ("Other" if amount < 0 else "Uncategorised")


_PREFIXES = re.compile(
    r"^(vdp-|vdc-|vdA-|pos |pos\*|d/d |dd |so |s/o |sepa dd |sepa |bill pay |bp |atm |card payment to |"
    r"payment to |transfer to |to |from |sq \*|sq\*|sumup \*|zettle_\*|paypal \*|pp\*|cwb )+", re.IGNORECASE)
_NOISE = re.compile(r"(\b\d{4,}\b|\*+\d+|\bie\d+\b|\b(dublin|cork|galway|limerick|waterford|kilkenny|carlow|"
                    r"ie|irl|ireland|eur)\b|[#*]+)", re.IGNORECASE)

KNOWN = {
    "tesco": "Tesco", "dunnes": "Dunnes Stores", "lidl": "Lidl", "aldi": "Aldi", "supervalu": "SuperValu",
    "circle k": "Circle K", "applegreen": "Applegreen", "netflix": "Netflix", "spotify": "Spotify",
    "amazon": "Amazon", "deliveroo": "Deliveroo", "just eat": "Just Eat", "electric ireland": "Electric Ireland",
    "bord gais": "Bord Gáis Energy", "vodafone": "Vodafone", "eir": "eir", "leap": "Leap Card",
    "ryanair": "Ryanair", "aer lingus": "Aer Lingus", "penneys": "Penneys", "vhi": "VHI", "laya": "Laya Healthcare",
    "flyefit": "Flyefit", "revolut": "Revolut", "apple.com": "Apple", "centra": "Centra", "spar": "Spar",
}


def clean_merchant(description: str) -> str:
    d = (description or "").strip()
    low = d.lower()
    for key, name in KNOWN.items():
        if re.search(rf"\b{re.escape(key)}\b", low):
            return name
    d = _PREFIXES.sub("", d)
    d = _NOISE.sub(" ", d)
    d = re.sub(r"\s+", " ", d).strip(" -.,")
    if not d:
        return (description or "Unknown").strip()[:40]
    return d.title() if d.isupper() or d.islower() else d
