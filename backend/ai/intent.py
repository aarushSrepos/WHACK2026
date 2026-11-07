"""Tiny keyword router. It picks which few figures to hand the model (never the full history)
and powers the no-network template path, so the demo works with no Wi-Fi."""
import re

INTENT_FIGURES = {
    "explain_bill": ["month_spend", "last_month_spend", "spend_change", "balance", "interest_estimate", "minimum_payment"],
    "due": ["minimum_payment", "days_until_due", "balance"],
    "balance": ["balance", "credit_limit", "available_credit", "utilisation"],
    "dispute": ["charge_amount"],
    "pay": ["minimum_payment", "balance", "requested_amount", "days_until_due"],
    "pause": [],
    "limit": ["spending_limit", "month_spend", "limit_progress"],
    "interest": ["interest_estimate", "balance", "minimum_payment"],
    "missed_payment": ["minimum_payment", "days_until_due"],
    "afford": ["available_credit", "spending_limit", "month_spend", "limit_progress"],
    "other": [],
}
ACTION_FOR_INTENT = {"dispute": "dispute", "pay": "pay", "pause": "pause"}   # only these may propose

_RULES = [
    ("pause", r"\b(pause|freeze|lock|stop)\b.*\bcard\b|\bcard\b.*\b(pause|freeze|lock)\b"),
    ("dispute", r"recogni[sz]e|dispute|fraud|wrong charge|didn'?t make|did not make|unauthori[sz]ed|not mine"),
    # These three come before "pay": "how much interest will I pay" is a question, not a payment.
    ("missed_payment", r"\bmiss(ed|ing)?\b|\blate (payment|fee)|can'?t pay|cannot pay|unable to pay|struggl"),
    ("interest", r"\binterest\b|\bapr\b"),
    ("afford", r"\bafford\b|can i (buy|spend)"),
    ("pay", r"\b(pay|settle)\s+(the|my|it|off|in full|minimum|full|£|\d)|make a payment|\bpay\b$"),
    ("due", r"\bdue\b|when|deadline|how much do i (need|have) to pay|minimum"),
    ("limit", r"limit|budget|spent|spending"),
    ("explain_bill", r"why|higher|bill|increase|explain|statement|more than"),
    ("balance", r"owe|balance|how much"),
]


def detect_intent(question: str) -> str:
    q = question.lower().replace("’", "'")
    for name, pattern in _RULES:
        if re.search(pattern, q):
            return name
    return "other"


def wants_full_balance(question: str) -> bool:
    return bool(re.search(r"\b(full|in full|all of it|everything|whole|off the balance|whole balance)\b", question.lower()))
