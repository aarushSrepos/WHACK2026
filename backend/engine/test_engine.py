"""Run from backend/:  pytest engine   or   python -m engine.test_engine"""
from datetime import date, timedelta

from engine import (Account, Transaction, build_figures, build_facts, days_until, find_transaction,
                    gbp, interest_estimate_pence, limit_progress_percent, limit_status,
                    minimum_payment_pence, month_spend_pence, utilisation_percent)

TODAY = date(2026, 11, 7)
ACC = Account(limit_pence=200_000, balance_pence=61_240, apr_bp=2490, due_date=TODAY + timedelta(days=5),
              spending_limit_pence=40_000)
TXS = [
    Transaction(1, "Northgate Online Ltd", 4200, date(2026, 11, 3)),
    Transaction(2, "Octopus Energy", 8900, date(2026, 11, 2)),
    Transaction(3, "Tesco", 6418, date(2026, 11, 1)),
    Transaction(4, "TfL", 2180, date(2026, 10, 31)),
    Transaction(5, "Boots", 1535, date(2026, 10, 29)),
    Transaction(6, "Declined shop", 9999, date(2026, 11, 4), "declined"),
]


def test_interest_and_minimum():
    assert interest_estimate_pence(61_240, 2490) == 1271            # 61240 * 24.9% / 12 = 1270.73
    assert minimum_payment_pence(61_240, 2490) == 3500              # floor applies
    assert minimum_payment_pence(2_000, 2490) == 2_000              # never above the balance
    assert minimum_payment_pence(0, 2490) == 0
    assert minimum_payment_pence(500_000, 2490) == 5000 + 10375     # 1% + interest beats the floor


def test_utilisation_and_days():
    assert utilisation_percent(61_240, 200_000) == 31
    assert utilisation_percent(1, 0) == 0
    assert days_until(ACC.due_date, TODAY) == 5


def test_month_spend_ignores_declined_and_other_months():
    assert month_spend_pence(TXS, 2026, 11) == 4200 + 8900 + 6418
    assert month_spend_pence(TXS, 2026, 10) == 2180 + 1535


def test_limit_progress_rounds_down_so_check_in_is_never_early():
    assert limit_progress_percent(31_999, 40_000) == 79
    assert limit_progress_percent(32_000, 40_000) == 80
    assert limit_progress_percent(10, None) is None
    assert limit_status(ACC, 31_999) == "under"
    assert limit_status(ACC, 32_000) == "check_in"
    assert limit_status(ACC, 40_000) == "over"


def test_find_transaction():
    assert find_transaction(TXS, amount_pence=4200).id == 1
    assert find_transaction(TXS, merchant_hint="the tesco one").id == 3
    assert find_transaction(TXS, amount_pence=1) is None
    assert find_transaction(TXS) is None
    assert find_transaction(TXS, amount_pence=9999) is None          # declined is not disputable
    disputed = [Transaction(9, "X", 4200, date(2026, 11, 3), "disputed")]
    assert find_transaction(disputed, amount_pence=4200) is None


def test_figures_and_display():
    f = build_figures(ACC, TXS, TODAY, candidate=TXS[0], requested_pence=20_000)
    assert f["balance"].display == "£612.40" and f["minimum_payment"].display == "£35.00"
    assert f["utilisation"].display == "31%" and f["days_until_due"].display == "5 days"
    assert f["spend_change"].value == (4200 + 8900 + 6418) - (2180 + 1535)
    assert f["limit_progress"].value == 48 and f["charge_amount"].value == 4200
    assert f["requested_amount"].value == 20_000
    assert "requested_amount" not in build_figures(ACC, TXS, TODAY, requested_pence=999_999)
    assert build_facts(ACC, TXS, TODAY, TXS[0])["spend_direction"] == "higher"
    assert gbp(123456789) == "£1,234,567.89"


def test_no_spending_limit_means_no_limit_figures():
    f = build_figures(Account(200_000, 61_240, 2490, ACC.due_date), TXS, TODAY)
    assert "spending_limit" not in f and "limit_progress" not in f


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok  ", name)
