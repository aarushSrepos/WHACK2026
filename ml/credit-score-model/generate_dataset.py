"""Generate the synthetic UK credit-file dataset.

    python generate_dataset.py            # 120,000 profiles -> data/synthetic_credit_profiles.csv.gz

Profiles are drawn from 14 archetypes (students, renters, homeowners, people rebuilding
after a default, payday-loan cycles, new arrivals to the UK, retirees...) plus a 12%
"anything goes" slice sampled uniformly over the whole feature space, so the model sees
both realistic clusters and the gaps between them. The label is the hidden
`oracle_score` from world.py plus noise (the bureau-to-bureau wobble real files have).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from world import FEATURE_NAMES, band_of, oracle_score

HERE = Path(__file__).parent


def _poisson(rng, lam, n, cap):
    return np.minimum(rng.poisson(lam, n), cap)


def _clip_int(x, lo, hi):
    return np.clip(np.round(x), lo, hi).astype(int)


# Each archetype: weight and a sampler returning a dict of arrays (n rows).
def archetypes():
    A = {}

    def a(name, weight):
        def deco(fn):
            A[name] = (weight, fn)
            return fn
        return deco

    @a("student_thin_file", 0.08)
    def _(rng, n):
        return dict(age=rng.integers(18, 23, n), income=rng.normal(9_000, 4_000, n),
                    oldest=rng.integers(0, 30, n), accounts=rng.integers(0, 3, n),
                    limit=rng.choice([0, 250, 500, 1000, 1500], n, p=[.3, .2, .3, .15, .05]),
                    util=rng.beta(2, 3, n), miss_rate=0.15, searches=1.5, new=0.6,
                    roll=0.45, payday=0.03, od=2.0, fa=0.01, rent=0.05, renting=0.9, moves=1.2,
                    minpay=3.0, default_rate=0.01, ccj=0.002)

    @a("young_professional", 0.10)
    def _(rng, n):
        return dict(age=rng.integers(22, 32, n), income=rng.normal(32_000, 8_000, n),
                    oldest=rng.integers(12, 110, n), accounts=rng.integers(2, 6, n),
                    limit=rng.choice([1500, 3000, 5000, 8000], n), util=rng.beta(2, 4, n),
                    miss_rate=0.08, searches=1.6, new=0.5, roll=0.75, payday=0.02, od=1.0,
                    fa=0.03, rent=0.12, renting=0.8, moves=0.9, minpay=2.0, default_rate=0.02, ccj=0.003)

    @a("established_homeowner", 0.13)
    def _(rng, n):
        return dict(age=rng.integers(35, 65, n), income=rng.normal(48_000, 15_000, n),
                    oldest=rng.integers(120, 420, n), accounts=rng.integers(3, 9, n),
                    limit=rng.choice([5000, 10000, 15000, 25000], n), util=rng.beta(1.2, 8, n),
                    miss_rate=0.02, searches=0.4, new=0.15, roll=0.97, payday=0.0, od=0.2,
                    fa=0.02, rent=0.0, renting=0.0, moves=0.1, minpay=0.4, default_rate=0.005, ccj=0.001)

    @a("overextended_cards", 0.10)
    def _(rng, n):
        return dict(age=rng.integers(25, 55, n), income=rng.normal(30_000, 9_000, n),
                    oldest=rng.integers(36, 240, n), accounts=rng.integers(4, 13, n),
                    limit=rng.choice([3000, 6000, 10000, 15000], n), util=rng.beta(6, 2, n) * 1.05,
                    miss_rate=0.35, searches=3.0, new=1.0, roll=0.85, payday=0.08, od=3.0,
                    fa=0.06, rent=0.03, renting=0.5, moves=0.4, minpay=8.0, default_rate=0.06, ccj=0.01)

    @a("recovering_after_default", 0.08)
    def _(rng, n):
        return dict(age=rng.integers(24, 60, n), income=rng.normal(24_000, 8_000, n),
                    oldest=rng.integers(24, 260, n), accounts=rng.integers(1, 6, n),
                    limit=rng.choice([0, 500, 1500, 3000], n), util=rng.beta(3, 3, n),
                    miss_rate=0.45, searches=1.5, new=0.5, roll=0.75, payday=0.15, od=3.5,
                    fa=0.08, rent=0.06, renting=0.75, moves=0.8, minpay=5.0, default_rate=1.0, ccj=0.15)

    @a("payday_cycle", 0.05)
    def _(rng, n):
        return dict(age=rng.integers(20, 45, n), income=rng.normal(18_000, 5_000, n),
                    oldest=rng.integers(6, 150, n), accounts=rng.integers(1, 8, n),
                    limit=rng.choice([0, 500, 1000, 2000], n), util=rng.beta(5, 2, n),
                    miss_rate=0.8, searches=4.5, new=1.6, roll=0.6, payday=0.95, od=6.0,
                    fa=0.08, rent=0.02, renting=0.85, moves=1.3, minpay=7.0, default_rate=0.3, ccj=0.05)

    @a("new_to_uk", 0.06)
    def _(rng, n):
        return dict(age=rng.integers(22, 45, n), income=rng.normal(35_000, 14_000, n),
                    oldest=rng.integers(0, 20, n), accounts=rng.integers(0, 3, n),
                    limit=rng.choice([0, 250, 500, 1200], n, p=[.35, .2, .3, .15]), util=rng.beta(2, 3, n),
                    miss_rate=0.05, searches=2.0, new=0.8, roll=0.15, payday=0.01, od=0.8,
                    fa=0.01, rent=0.06, renting=0.95, moves=1.6, minpay=1.5, default_rate=0.0, ccj=0.0)

    @a("retired_low_activity", 0.07)
    def _(rng, n):
        return dict(age=rng.integers(65, 90, n), income=rng.normal(21_000, 7_000, n),
                    oldest=rng.integers(200, 600, n), accounts=rng.integers(0, 4, n),
                    limit=rng.choice([0, 2000, 6000, 12000], n), util=rng.beta(0.6, 12, n),
                    miss_rate=0.02, searches=0.1, new=0.05, roll=0.97, payday=0.0, od=0.1,
                    fa=0.02, rent=0.0, renting=0.15, moves=0.05, minpay=0.2, default_rate=0.004, ccj=0.0)

    @a("self_employed_irregular", 0.06)
    def _(rng, n):
        return dict(age=rng.integers(25, 60, n), income=rng.lognormal(10.3, 0.6, n),
                    oldest=rng.integers(24, 300, n), accounts=rng.integers(2, 8, n),
                    limit=rng.choice([2000, 5000, 10000, 20000], n), util=rng.beta(3, 3, n),
                    miss_rate=0.3, searches=1.8, new=0.5, roll=0.85, payday=0.03, od=3.0,
                    fa=0.05, rent=0.04, renting=0.4, moves=0.5, minpay=4.0, default_rate=0.04, ccj=0.02)

    @a("single_parent_stretched", 0.06)
    def _(rng, n):
        return dict(age=rng.integers(22, 50, n), income=rng.normal(20_000, 6_000, n),
                    oldest=rng.integers(24, 260, n), accounts=rng.integers(2, 7, n),
                    limit=rng.choice([1000, 2500, 4000, 6000], n), util=rng.beta(5, 2.5, n),
                    miss_rate=0.4, searches=2.0, new=0.6, roll=0.85, payday=0.12, od=4.5,
                    fa=0.2, rent=0.05, renting=0.8, moves=0.6, minpay=6.0, default_rate=0.08, ccj=0.02)

    @a("high_earner_high_spend", 0.05)
    def _(rng, n):
        return dict(age=rng.integers(28, 55, n), income=rng.normal(90_000, 25_000, n),
                    oldest=rng.integers(60, 300, n), accounts=rng.integers(4, 12, n),
                    limit=rng.choice([15000, 25000, 40000, 60000], n), util=rng.beta(3, 3.5, n),
                    miss_rate=0.06, searches=2.2, new=0.9, roll=0.9, payday=0.0, od=0.6,
                    fa=0.02, rent=0.02, renting=0.3, moves=0.4, minpay=1.5, default_rate=0.01, ccj=0.002)

    @a("financially_linked", 0.04)
    def _(rng, n):
        return dict(age=rng.integers(25, 60, n), income=rng.normal(30_000, 9_000, n),
                    oldest=rng.integers(36, 300, n), accounts=rng.integers(2, 7, n),
                    limit=rng.choice([2000, 4000, 8000], n), util=rng.beta(2, 4, n),
                    miss_rate=0.1, searches=1.0, new=0.3, roll=0.9, payday=0.02, od=1.5,
                    fa=1.0, rent=0.03, renting=0.5, moves=0.6, minpay=2.0, default_rate=0.02, ccj=0.005)

    @a("careful_renter", 0.06)
    def _(rng, n):
        return dict(age=rng.integers(23, 45, n), income=rng.normal(28_000, 7_000, n),
                    oldest=rng.integers(18, 140, n), accounts=rng.integers(1, 4, n),
                    limit=rng.choice([500, 1200, 2500, 4000], n), util=rng.beta(1.5, 7, n),
                    miss_rate=0.04, searches=0.6, new=0.2, roll=0.6, payday=0.0, od=0.4,
                    fa=0.01, rent=0.25, renting=1.0, moves=1.0, minpay=0.6, default_rate=0.005, ccj=0.0)

    @a("credit_hungry_switcher", 0.04)
    def _(rng, n):
        return dict(age=rng.integers(21, 40, n), income=rng.normal(34_000, 10_000, n),
                    oldest=rng.integers(12, 120, n), accounts=rng.integers(5, 15, n),
                    limit=rng.choice([4000, 8000, 15000], n), util=rng.beta(2.5, 3.5, n),
                    miss_rate=0.1, searches=6.0, new=2.2, roll=0.8, payday=0.02, od=1.0,
                    fa=0.02, rent=0.05, renting=0.6, moves=0.7, minpay=2.5, default_rate=0.02, ccj=0.003)
    return A


def sample_archetype(rng, sampler, n):
    s = sampler(rng, n)
    out = {}
    out["age"] = s["age"].astype(int)
    out["income"] = np.clip(np.round(s["income"], -2), 0, 300_000).astype(int)
    out["renting"] = (rng.random(n) < s["renting"]).astype(int)
    oldest = s["oldest"].astype(int)
    oldest = np.minimum(oldest, np.maximum(0, (out["age"] - 18) * 12))
    accounts = s["accounts"].astype(int)
    accounts = np.where(oldest == 0, 0, np.maximum(accounts, 1))
    oldest = np.where(accounts == 0, 0, oldest)
    limit = s["limit"].astype(float) * rng.uniform(0.7, 1.3, n)
    limit = np.where(accounts == 0, 0, np.round(limit, -1))
    out["total_limit"] = limit.astype(int)
    out["utilisation"] = np.where(limit > 0, np.clip(s["util"], 0, 1.5), 0).round(3)
    out["oldest_account_months"] = oldest
    out["num_accounts"] = accounts
    has_credit = accounts > 0
    # payment behaviour: a person-level "reliability" drives several features together
    shaky = rng.gamma(2.0, s["miss_rate"] / 2.0 + 1e-6, n)
    out["missed_12m"] = np.where(has_credit, _poisson(rng, shaky, n, 6), 0)
    out["missed_older"] = np.where(has_credit, _poisson(rng, shaky * 1.6 * np.minimum(1, oldest / 60), n, 10), 0)
    msm = np.full(n, 72)
    recent = out["missed_12m"] > 0
    msm[recent] = rng.integers(0, 12, recent.sum())
    older = (~recent) & (out["missed_older"] > 0)
    msm[older] = rng.integers(12, 72, older.sum())
    out["months_since_missed"] = msm
    d_on = has_credit & (rng.random(n) < s["default_rate"] * np.clip(shaky / (s["miss_rate"] + 1e-6), 0.3, 2))
    out["defaults"] = np.where(d_on, 1 + _poisson(rng, 0.4, n, 2), 0)
    out["months_since_default"] = np.where(out["defaults"] > 0, rng.integers(0, 72, n), 72)
    out["ccj"] = (rng.random(n) < s["ccj"] * (1 + 3 * d_on)).astype(int)
    out["new_accounts_6m"] = np.where(has_credit, _poisson(rng, s["new"], n, 5), 0)
    out["new_accounts_6m"] = np.minimum(out["new_accounts_6m"], accounts)
    out["hard_searches_12m"] = np.maximum(_poisson(rng, s["searches"], n, 10), out["new_accounts_6m"])
    out["electoral_roll"] = (rng.random(n) < s["roll"]).astype(int)
    out["payday_loan_12m"] = (rng.random(n) < s["payday"]).astype(int)
    out["overdraft_months_12m"] = _poisson(rng, s["od"], n, 12)
    out["financial_association"] = (rng.random(n) < s["fa"]).astype(int)
    out["rent_reported"] = ((rng.random(n) < s["rent"]) & (out["renting"] == 1)).astype(int)
    out["address_moves_2y"] = _poisson(rng, s["moves"], n, 5)
    revolve = has_credit & (limit > 0)
    out["min_payment_months"] = np.where(revolve, _poisson(rng, s["minpay"] * (0.5 + out["utilisation"]), n, 12), 0)
    return out


def sample_uniform(rng, n):
    """The 'anything goes' slice: fills the gaps between archetypes."""
    out = {}
    out["age"] = rng.integers(18, 85, n)
    out["income"] = rng.integers(0, 120_000, n) // 100 * 100
    out["renting"] = rng.integers(0, 2, n)
    out["num_accounts"] = rng.integers(0, 16, n)
    has = out["num_accounts"] > 0
    out["oldest_account_months"] = np.where(has, np.minimum(rng.integers(0, 480, n), (out["age"] - 18) * 12), 0)
    out["total_limit"] = np.where(has, rng.integers(0, 60_000, n) // 10 * 10, 0)
    out["utilisation"] = np.where(out["total_limit"] > 0, rng.uniform(0, 1.3, n), 0).round(3)
    out["min_payment_months"] = np.where(out["total_limit"] > 0, rng.integers(0, 13, n), 0)
    out["missed_12m"] = np.where(has, rng.integers(0, 7, n), 0)
    out["missed_older"] = np.where(has, rng.integers(0, 11, n), 0)
    msm = np.full(n, 72)
    recent = out["missed_12m"] > 0
    msm[recent] = rng.integers(0, 12, recent.sum())
    older = (~recent) & (out["missed_older"] > 0)
    msm[older] = rng.integers(12, 72, older.sum())
    out["months_since_missed"] = msm
    out["defaults"] = np.where(has & (rng.random(n) < 0.3), rng.integers(1, 4, n), 0)
    out["months_since_default"] = np.where(out["defaults"] > 0, rng.integers(0, 72, n), 72)
    out["ccj"] = (rng.random(n) < 0.15).astype(int)
    out["new_accounts_6m"] = np.minimum(rng.integers(0, 6, n), out["num_accounts"])
    out["hard_searches_12m"] = np.maximum(rng.integers(0, 11, n), out["new_accounts_6m"])
    out["electoral_roll"] = rng.integers(0, 2, n)
    out["payday_loan_12m"] = (rng.random(n) < 0.25).astype(int)
    out["overdraft_months_12m"] = rng.integers(0, 13, n)
    out["financial_association"] = (rng.random(n) < 0.25).astype(int)
    out["rent_reported"] = ((rng.random(n) < 0.3) & (out["renting"] == 1)).astype(int)
    out["address_moves_2y"] = rng.integers(0, 6, n)
    return out


def generate(n: int, seed: int = 2026, noise_sd: float = 22.0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    arch = archetypes()
    names = list(arch) + ["anything_goes"]
    weights = np.array([w for w, _ in arch.values()] + [0.12])
    weights /= weights.sum()
    counts = rng.multinomial(n, weights)
    frames = []
    for name, k in zip(names, counts):
        cols = sample_uniform(rng, k) if name == "anything_goes" else sample_archetype(rng, arch[name][1], k)
        df = pd.DataFrame(cols)
        df["archetype"] = name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True).sample(frac=1, random_state=seed).reset_index(drop=True)
    truth = oracle_score({f: df[f].to_numpy(float) for f in FEATURE_NAMES})
    df["oracle_score"] = truth.round(1)
    df["credit_score"] = np.clip(np.round(truth + rng.normal(0, noise_sd, len(df))), 0, 999).astype(int)
    df["band"] = [band_of(s) for s in df["credit_score"]]
    df.insert(0, "profile_id", [f"P{i:06d}" for i in range(len(df))])
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=120_000)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()
    df = generate(args.n, args.seed)
    out = HERE / "data" / "synthetic_credit_profiles.csv.gz"
    out.parent.mkdir(exist_ok=True)
    df.to_csv(out, index=False, compression="gzip")
    print(f"wrote {len(df):,} profiles to {out}")
    print(df["band"].value_counts(normalize=True).round(3).to_string())
    print(df.groupby("archetype")["credit_score"].describe()[["mean", "std", "min", "max"]].round(0).to_string())
