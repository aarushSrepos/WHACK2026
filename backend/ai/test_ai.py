"""Run from backend/:  pytest ai   or   python -m ai.test_ai
Fake LLMs stand in for Claude, so these run offline."""
import json
from datetime import date, timedelta

from ai import AnswerCache, ProposalError, ask, check_in_message, extract_pence, extract_percents, make_proposal, verify
from engine import Account, Transaction, build_figures, limit_status

TODAY = date(2026, 11, 7)
ACC = Account(200_000, 61_240, 2490, TODAY + timedelta(days=5), 40_000)
TXS = [Transaction(1, "Northgate Online Ltd", 4200, date(2026, 11, 3)),
       Transaction(2, "Octopus Energy", 8900, date(2026, 11, 2)),
       Transaction(3, "Tesco", 6418, date(2026, 11, 1)),
       Transaction(4, "TfL", 2180, date(2026, 10, 31))]


def fake(*replies):
    """An LLM that returns each reply in turn and counts calls."""
    calls = []
    def llm(system, user):
        calls.append(user)
        r = replies[min(len(calls) - 1, len(replies) - 1)]
        if isinstance(r, Exception):
            raise r
        return r if isinstance(r, str) else json.dumps(r)
    llm.calls = calls
    return llm


GOOD_BILL = {"text": "You spent £195.18 this month. Last month it was £21.80. That is £173.38 higher.",
             "figure_ids": ["month_spend", "last_month_spend", "spend_change"], "action": None}


def test_extraction():
    assert extract_pence("£35, £35.00, £1,234.50, £7.5, 12 pounds, 40p") == [3500, 3500, 123450, 750, 1200, 40]
    assert extract_percents("80% and 12.5 per cent and 3 percent") == [80.0, 12.5, 3.0]
    assert extract_pence("5 days and 24 hours") == []


def test_checker_accepts_known_and_rejects_unknown():
    f = build_figures(ACC, TXS, TODAY)
    assert verify("Pay your £35.00 minimum, due in 5 days. That is 31%.", f).ok
    r = verify("Pay £50.00 now, 90% used", f)
    assert not r.ok and r.unknown == ["£50.00", "90%"]
    assert not verify("It is £31", f).ok                      # 31% is a percent, not pence
    assert not verify("It is 3500%", f).ok


def test_live_answer_is_used_when_verified():
    llm = fake(GOOD_BILL)
    r = ask("Why is my bill higher this month?", ACC, TXS, TODAY, llm=llm)
    assert r["source"] == "ai" and r["verified"] and r["label"] == "Verified figures"
    assert [x["id"] for x in r["figures"]] == ["month_spend", "last_month_spend", "spend_change"]
    assert len(llm.calls) == 1


def test_bad_number_retries_once_then_succeeds():
    bad = dict(GOOD_BILL, text="You spent £999.00 this month.")
    llm = fake(bad, GOOD_BILL)
    r = ask("Why is my bill higher?", ACC, TXS, TODAY, llm=llm)
    assert r["source"] == "ai" and len(llm.calls) == 2
    assert "£999.00" in llm.calls[1]                          # the problem is fed back to the model


def test_two_failures_fall_back_to_template():
    bad = dict(GOOD_BILL, text="You spent £999.00.")
    llm = fake(bad, "not json at all")
    r = ask("Why is my bill higher?", ACC, TXS, TODAY, llm=llm)
    assert r["source"] == "template" and r["label"] == "Standard explanation" and r["verified"]
    assert len(llm.calls) == 2 and "higher" in r["answer"]


def test_network_failure_falls_back_without_retry():
    llm = fake(TimeoutError("slow wifi"))
    r = ask("When is my payment due?", ACC, TXS, TODAY, llm=llm)
    assert r["source"] == "template" and "£35.00" in r["answer"] and len(llm.calls) == 1


def test_offline_template_dispute_flow():
    r = ask("I don't recognise the £42 charge", ACC, TXS, TODAY)
    assert r["intent"] == "dispute" and "£42.00" in r["answer"] and "Northgate" in r["answer"]
    p = r["proposed_action"]
    assert p["type"] == "dispute" and p["details"]["transaction_id"] == 1
    assert p["read_back"] == "Dispute the £42.00 charge from Northgate Online Ltd on 3 November?"


def test_dispute_with_no_match_proposes_nothing():
    r = ask("I don't recognise the £77 charge", ACC, TXS, TODAY)
    assert r["proposed_action"] is None and "could not find" in r["answer"]


def test_pay_minimum_custom_full_and_too_much():
    assert ask("Pay the minimum", ACC, TXS, TODAY)["proposed_action"]["read_back"] == "Pay your £35.00 minimum payment today?"
    assert ask("pay £200", ACC, TXS, TODAY)["proposed_action"]["details"]["amount_pence"] == 20_000
    assert ask("pay the full balance", ACC, TXS, TODAY)["proposed_action"]["details"]["kind"] == "full"
    r = ask("pay £9,999", ACC, TXS, TODAY)
    assert r["proposed_action"] is None and "more than your balance" in r["answer"]


def test_model_cannot_propose_wrong_or_forged_actions():
    pay = dict(GOOD_BILL, action={"type": "pay", "amount_figure_id": "minimum_payment"})
    assert ask("Why is my bill higher?", ACC, TXS, TODAY, llm=fake(pay))["proposed_action"] is None   # not asked for
    forged = {"text": "I found it.", "figure_ids": [], "action": {"type": "dispute", "transaction_id": 3}}
    assert ask("I don't recognise the £42 charge", ACC, TXS, TODAY, llm=fake(forged))["proposed_action"] is None
    okay = {"text": "I found the £42.00 charge.", "figure_ids": ["charge_amount"], "action": {"type": "dispute", "transaction_id": 1}}
    assert ask("I don't recognise the £42 charge", ACC, TXS, TODAY, llm=fake(okay))["proposed_action"]["type"] == "dispute"
    cheat = {"text": "Paying.", "figure_ids": [], "action": {"type": "pay", "amount_figure_id": "x", "amount_pence": 1}}
    assert ask("Pay the minimum", ACC, TXS, TODAY, llm=fake(cheat))["proposed_action"] is None


def test_unknown_figure_id_is_rejected():
    bad = dict(GOOD_BILL, figure_ids=["secret_balance"])
    assert ask("Why is my bill higher?", ACC, TXS, TODAY, llm=fake(bad, bad))["source"] == "template"


def test_cache_serves_when_live_fails_and_rechecks_figures(tmp_path=None):
    cache = AnswerCache()
    ask("Why is my bill higher?", ACC, TXS, TODAY, llm=fake(GOOD_BILL), cache=cache)
    r = ask("why is my bill higher", ACC, TXS, TODAY, llm=fake(TimeoutError()), cache=cache)
    assert r["source"] == "cache" and r["verified"]
    prefer = ask("Why is my bill higher?", ACC, TXS, TODAY, llm=fake(TimeoutError()), cache=cache, prefer_cache=True)
    assert prefer["source"] == "cache"
    richer = Account(200_000, 61_240, 2490, ACC.due_date, 40_000)
    changed = TXS + [Transaction(9, "New", 5000, date(2026, 11, 5))]     # figures changed: cached numbers are stale
    assert ask("Why is my bill higher?", richer, changed, TODAY, llm=fake(TimeoutError()), cache=cache)["source"] == "template"


def test_reading_level_changes_template():
    s = ask("Why is my bill higher?", ACC, TXS, TODAY, reading_level="simple")["answer"]
    d = ask("Why is my bill higher?", ACC, TXS, TODAY, reading_level="detailed")["answer"]
    assert len(d) > len(s) and "interest" in d and "interest" not in s


def test_every_template_intent_passes_its_own_checker():
    for q in ["why is it higher", "when is it due", "how much do I owe", "what's my spending limit", "pause my card",
              "pay the minimum", "I don't recognise the £42 charge", "hello",
              "how much interest will I pay", "what happens if I miss a payment", "can I afford a £200 purchase"]:
        for lvl in ("simple", "detailed"):
            r = ask(q, ACC, TXS, TODAY, reading_level=lvl)
            assert r["verified"] and r["source"] == "template", (q, lvl, r["answer"])


def test_questions_ending_in_pay_do_not_propose_a_payment():
    for q, intent in [("how much interest will I pay", "interest"), ("what happens if I miss a payment", "missed_payment"),
                      ("I can't pay this month", "missed_payment"), ("can I afford a £200 purchase", "afford")]:
        r = ask(q, ACC, TXS, TODAY)
        assert r["intent"] == intent and r["proposed_action"] is None, (q, r["intent"])
    assert ask("I want to pay", ACC, TXS, TODAY)["intent"] == "pay"


def test_make_proposal_errors():
    for kwargs in ({"kind": "pay", "pay": 0}, {"kind": "pay", "pay": 10**9}, {"kind": "pay", "pay": "lots"},
                   {"kind": "dispute", "transaction_id": 99}, {"kind": "wire"}):
        try:
            make_proposal(account=ACC, transactions=TXS, today=TODAY, **kwargs)
            assert False, kwargs
        except ProposalError:
            pass
    assert make_proposal("pause", ACC, TXS, TODAY).read_back == "Pause your card for 24 hours?"


def test_merchant_name_cannot_smuggle_numbers_into_read_back():
    sneaky = [Transaction(1, "Shop £1,000 refund 99%", 4200, date(2026, 11, 3))]
    rb = make_proposal("dispute", ACC, sneaky, TODAY, transaction_id=1).read_back
    assert "£1,000" not in rb and "99%" not in rb


def test_check_in_message_at_80_percent():
    f = build_figures(ACC, TXS, TODAY)
    assert check_in_message(f, limit_status(ACC, 20_000)) is None
    busy = TXS + [Transaction(8, "Demo purchase", 12_500, date(2026, 11, 6))]
    f2 = build_figures(ACC, busy, TODAY)
    m = check_in_message(f2, limit_status(ACC, 4200 + 8900 + 6418 + 12_500))
    assert m["status"] == "check_in" and "80%" in m["text"] and verify(m["text"], f2).ok


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok  ", name)
