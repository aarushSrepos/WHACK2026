"""The synthetic credit world shared by the generator, the trainer and the validation.

Nothing here is a real credit reference agency's formula. It is a deliberately rich,
non-linear "hidden truth" with interactions, used for two things:

1. generating a labelled dataset (truth + noise), and
2. checking afterwards whether the advice our trained model gives matches what really
   moves the score in this world (the model never sees `oracle_score`).

`plan_profile` describes how a person's credit file changes over time if they carry on
as they are, or if they change one or more habits. The browser port of it lives in
frontend/src/lib/credit-coach/engine.ts and must stay in step with this file.
"""
from __future__ import annotations

import numpy as np

# (name, monotonic direction for the model: +1 more is better, -1 more is worse, 0 free)
FEATURES: list[tuple[str, int]] = [
    ("utilisation", -1),            # revolving balances / revolving limits (0 to 1.5)
    ("total_limit", +1),            # £ of revolving credit limits
    ("min_payment_months", -1),     # of the last 12 months, how many paid only the minimum
    ("missed_12m", -1),             # missed / late payments in the last 12 months
    ("missed_older", -1),           # missed payments 13 to 72 months ago
    ("months_since_missed", +1),    # 72 = none in the last 6 years
    ("defaults", -1),               # defaults still on file (6 years)
    ("months_since_default", +1),   # 72 = none on file
    ("ccj", -1),                    # county court judgment on file
    ("oldest_account_months", +1),  # age of the oldest account
    ("num_accounts", 0),            # open credit accounts (non-monotonic: too few and too many)
    ("new_accounts_6m", -1),        # accounts opened in the last 6 months
    ("hard_searches_12m", -1),      # hard credit searches in the last 12 months
    ("electoral_roll", +1),         # registered to vote at current address
    ("payday_loan_12m", -1),        # used a payday loan in the last 12 months
    ("overdraft_months_12m", -1),   # months over an arranged overdraft / unarranged
    ("financial_association", -1),  # linked to someone with poor credit (joint account)
    ("rent_reported", +1),          # rent payments shared with credit reference agencies
    ("address_moves_2y", -1),       # house moves in the last 2 years
]
FEATURE_NAMES = [f for f, _ in FEATURES]

BANDS = [  # UK-style 0-999 scale
    (0, 560, "Very poor"),
    (561, 720, "Poor"),
    (721, 880, "Fair"),
    (881, 960, "Good"),
    (961, 999, "Excellent"),
]


def band_of(score: float) -> str:
    for lo, hi, name in BANDS:
        if score <= hi:
            return name
    return BANDS[-1][2]


def oracle_score(d: dict[str, np.ndarray]) -> np.ndarray:
    """Noise-free 'true' score in the synthetic world. Vectorised over profiles."""
    u = np.clip(d["utilisation"], 0, 1.5)
    oldest = d["oldest_account_months"]
    thin = np.exp(-oldest / 30.0)  # 1 for a brand-new file, ~0 after 8 years
    n = d["num_accounts"]
    lim = d["total_limit"]
    has_rev = (lim > 0).astype(float)

    s = np.full(u.shape, 700.0)
    s += 185 * (1 - np.exp(-oldest / 48.0))
    s += 45 * np.minimum(n, 4) / 4 - 6 * np.maximum(n - 9, 0) - 25 * (n == 0)

    util_pen = np.where(u <= 0.15, 0.0, 240 * np.maximum(u - 0.15, 0) ** 1.15) + 55 * (u > 0.9)
    util_pen *= 1 + 0.35 * (d["missed_12m"] > 0)  # high usage looks worse alongside recent misses
    s -= util_pen * has_rev
    s -= 12 * has_rev * (u < 0.005)  # cards held but never used tell lenders little
    s += 22 * np.log1p(lim / 500.0) / np.log1p(120.0)

    s -= 4.5 * d["min_payment_months"]
    s -= 80 * d["missed_12m"] ** 0.7 + 22 * d["missed_older"] ** 0.6
    any_miss = ((d["missed_12m"] + d["missed_older"]) > 0).astype(float)
    s -= 70 * any_miss * np.exp(-d["months_since_missed"] / 10.0)

    fade = 1 - 0.65 * d["months_since_default"] / 72.0
    s -= (140 * (d["defaults"] > 0) + 35 * np.maximum(d["defaults"] - 1, 0)) * fade
    s -= 150 * d["ccj"]

    s -= 11 * d["hard_searches_12m"] * (1 + thin)          # searches hurt thin files more
    s -= 14 * d["new_accounts_6m"] * (1 + 0.5 * thin)
    s += d["electoral_roll"] * (45 + 40 * thin)             # and the electoral roll helps them more
    s -= 55 * d["payday_loan_12m"]
    s -= 6 * d["overdraft_months_12m"]
    s -= 40 * d["financial_association"]
    s += d["rent_reported"] * (10 + 40 * thin)
    s -= 7 * d["address_moves_2y"]
    return np.clip(s, 0, 999)


# ---------------------------------------------------------------------------------------
# Habits and time. Each action is a change of habit; the baseline is "carry on as now".
# ---------------------------------------------------------------------------------------
ACTIONS = [
    "lower_utilisation", "electoral_roll", "pause_applications", "on_time_payments",
    "more_than_minimum", "avoid_payday", "overdraft", "rent_reporting",
    "dissociate", "build_history",
]


def applicable(p: dict, action: str) -> bool:
    """Whether an action makes sense for this single profile (a dict of scalars)."""
    if action == "lower_utilisation":
        return p["total_limit"] > 0 and p["utilisation"] > 0.2
    if action == "electoral_roll":
        return p["electoral_roll"] == 0
    if action == "pause_applications":
        return p["hard_searches_12m"] > 0 or p["new_accounts_6m"] > 0
    if action == "on_time_payments":
        return p["missed_12m"] > 0
    if action == "more_than_minimum":
        return p["min_payment_months"] >= 3
    if action == "avoid_payday":
        return p["payday_loan_12m"] == 1
    if action == "overdraft":
        return p["overdraft_months_12m"] > 0
    if action == "rent_reporting":
        return p["rent_reported"] == 0 and p.get("renting", 0) == 1
    if action == "dissociate":
        return p["financial_association"] == 1
    if action == "build_history":
        return p["num_accounts"] <= 2 or p["total_limit"] == 0
    raise ValueError(action)


def plan_profile(p: dict, months: int, actions: set[str], util_target: float = 0.09) -> dict:
    """The profile `months` from now if the person keeps their habits except `actions`."""
    q = dict(p)
    t = months
    q["oldest_account_months"] = p["oldest_account_months"] + t
    if p["defaults"] > 0:
        msd = p["months_since_default"] + t
        if msd >= 72:
            q["defaults"], q["months_since_default"] = 0, 72
        else:
            q["months_since_default"] = msd
    # missed payments older than 6 years drop off (approximation: once the latest is 72 months old)
    if "on_time_payments" in actions and p["missed_12m"] > 0:
        left = p["missed_12m"] * max(0, 12 - t) / 12
        q["missed_12m"] = round(left)
        q["missed_older"] = p["missed_older"] + (p["missed_12m"] - q["missed_12m"])
        q["months_since_missed"] = min(71, p["months_since_missed"] + t)
    elif p["missed_12m"] == 0 and p["missed_older"] > 0:
        msm = p["months_since_missed"] + t
        if msm >= 72:
            q["missed_older"], q["months_since_missed"] = 0, 72
        else:
            q["months_since_missed"] = msm
    if "lower_utilisation" in actions and p["utilisation"] > util_target:
        frac = min(1.0, t / 2)  # reaches the target over about two statements
        q["utilisation"] = p["utilisation"] + (util_target - p["utilisation"]) * frac
    if "pause_applications" in actions:
        q["hard_searches_12m"] = round(p["hard_searches_12m"] * max(0, 12 - t) / 12)
        q["new_accounts_6m"] = round(p["new_accounts_6m"] * max(0, 6 - t) / 6)
    if "more_than_minimum" in actions:
        q["min_payment_months"] = round(p["min_payment_months"] * max(0, 12 - t) / 12)
    if "overdraft" in actions:
        q["overdraft_months_12m"] = round(p["overdraft_months_12m"] * max(0, 12 - t) / 12)
    if "avoid_payday" in actions and t >= 12:
        q["payday_loan_12m"] = 0
    if "electoral_roll" in actions and t >= 1:
        q["electoral_roll"] = 1
    if "rent_reporting" in actions and t >= 2:
        q["rent_reported"] = 1
    if "dissociate" in actions and t >= 2:
        q["financial_association"] = 0
    if "build_history" in actions and t >= 1:
        # one credit-builder card (£500 limit), used lightly and repaid in full every month
        q["num_accounts"] = p["num_accounts"] + 1
        if p["total_limit"] == 0:
            q["utilisation"] = 0.1
        else:
            bal = p["utilisation"] * p["total_limit"]
            q["utilisation"] = min(q["utilisation"], (bal + 50) / (p["total_limit"] + 500))
        q["total_limit"] = p["total_limit"] + 500
        q["new_accounts_6m"] = q["new_accounts_6m"] + (1 if t <= 6 else 0)
        q["hard_searches_12m"] = q["hard_searches_12m"] + (1 if t <= 12 else 0)
        if p["num_accounts"] == 0:
            q["oldest_account_months"] = t
    return q


def to_matrix(rows: list[dict]) -> np.ndarray:
    return np.array([[r[f] for f in FEATURE_NAMES] for r in rows], dtype=float)


def oracle_rows(rows: list[dict]) -> np.ndarray:
    m = to_matrix(rows)
    return oracle_score({f: m[:, i] for i, f in enumerate(FEATURE_NAMES)})
