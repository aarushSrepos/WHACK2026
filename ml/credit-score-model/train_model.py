"""Train, compare and stress-test credit-score models on the synthetic dataset, then
export the chosen one for the browser.

    python generate_dataset.py && python train_model.py

Writes:
  frontend/public/credit-coach/model.json   trees + segments + metadata used by the page
  frontend/public/credit-coach/fixtures.json  profiles with Python predictions, so the
                                              TypeScript port can be checked for drift
  results/metrics.json                       every number quoted in README.md
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold, train_test_split
from sklearn.preprocessing import StandardScaler

from world import ACTIONS, BANDS, FEATURE_NAMES, FEATURES, applicable, band_of, oracle_rows, plan_profile

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
OUT_WEB = ROOT / "frontend" / "public" / "credit-coach"
OUT_RES = HERE / "results"
SEED = 7
HORIZON = 12  # months, for comparing actions


def make_hgb(monotonic: bool) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="squared_error", learning_rate=0.08, max_iter=600, max_leaf_nodes=31,
        min_samples_leaf=40, l2_regularization=1.0, early_stopping=True,
        validation_fraction=0.1, n_iter_no_change=25, random_state=SEED,
        monotonic_cst=[d for _, d in FEATURES] if monotonic else None,
    )


def band_accuracy(y_true, y_pred) -> float:
    return float(np.mean([band_of(a) == band_of(b) for a, b in zip(y_true, y_pred)]))


def evaluate(model, X, y, oracle) -> dict:
    p = np.clip(model.predict(X), 0, 999)
    return {
        "r2": round(float(r2_score(y, p)), 4),
        "mae": round(float(mean_absolute_error(y, p)), 2),
        "mae_vs_noise_free_truth": round(float(mean_absolute_error(oracle, p)), 2),
        "band_accuracy": round(band_accuracy(y, p), 4),
    }


def rows_of(df: pd.DataFrame) -> list[dict]:
    cols = FEATURE_NAMES + ["renting"]
    return [dict(zip(cols, r)) for r in df[cols].to_numpy(float)]


def action_gains(predict, rows: list[dict]) -> list[dict[str, float]]:
    """Points each applicable action adds at HORIZON, versus carrying on as now."""
    base, plans, index = [], [], []
    for i, r in enumerate(rows):
        base.append(plan_profile(r, HORIZON, set()))
        for a in ACTIONS:
            if applicable(r, a):
                plans.append(plan_profile(r, HORIZON, {a}))
                index.append((i, a))
    b = predict(base)
    g = predict(plans) if plans else []
    out = [dict() for _ in rows]
    for (i, a), v in zip(index, g):
        out[i][a] = float(v - b[i])
    return out


def advice_fidelity(model_predict, rows: list[dict]) -> dict:
    """Does the model rank actions the way the hidden truth does, person by person?"""
    from scipy.stats import spearmanr

    mg = action_gains(model_predict, rows)
    tg = action_gains(oracle_rows, rows)
    top1, top_in_true_top2, harmful, rhos, errs, n_multi = 0, 0, 0, [], [], 0
    for m, t in zip(mg, tg):
        if not m:
            continue
        acts = list(m)
        errs += [abs(m[a] - t[a]) for a in acts]
        best_m = max(acts, key=m.get)
        harmful += t[best_m] < 0
        if len(acts) >= 2:
            n_multi += 1
            ranked_t = sorted(acts, key=t.get, reverse=True)
            # ties in the truth (within 2 points) count as agreement
            top1 += t[best_m] >= t[ranked_t[0]] - 2
            top_in_true_top2 += best_m in ranked_t[:2]
            if len(acts) >= 3 and np.std([t[a] for a in acts]) > 0:
                rhos.append(spearmanr([m[a] for a in acts], [t[a] for a in acts]).statistic)
    return {
        "people_with_2plus_actions": n_multi,
        "top_action_matches_truth": round(top1 / max(1, n_multi), 4),
        "top_action_in_truth_top2": round(top_in_true_top2 / max(1, n_multi), 4),
        "mean_rank_correlation": round(float(np.nanmean(rhos)), 4) if rhos else None,
        "gain_mae_points": round(float(np.mean(errs)), 2),
        "top_action_harmful_rate": round(harmful / max(1, len(mg)), 4),
    }


def export_trees(model: HistGradientBoostingRegressor) -> dict:
    trees = []
    for (pred,) in model._predictors:
        n = pred.nodes
        f = np.where(n["is_leaf"] == 1, -1, n["feature_idx"]).astype(int)
        v = np.where(n["is_leaf"] == 1, n["value"], n["num_threshold"])
        trees.append({
            "f": f.tolist(),
            "v": [float(f"{x:.6g}") for x in v],
            "l": n["left"].astype(int).tolist(),
            "r": n["right"].astype(int).tolist(),
        })
    return {"base": float(np.ravel(model._baseline_prediction)[0]), "trees": trees}


def predict_exported(exp: dict, X: np.ndarray) -> np.ndarray:
    out = np.full(len(X), exp["base"])
    for t in exp["trees"]:
        for i, x in enumerate(X):
            k = 0
            while t["f"][k] != -1:
                k = t["l"][k] if x[t["f"][k]] <= t["v"][k] else t["r"][k]
            out[i] += t["v"][k]
    return out


SEGMENT_RULES = [  # first match wins; checked against each cluster centre (original units)
    ("Rebuilding after a county court judgment", lambda c: c["ccj"] >= 0.5),
    ("Rebuilding after a default", lambda c: c["defaults"] >= 1),
    ("Juggling several credit problems", lambda c: c["missed_12m"] >= 2),
    ("Caught in short-term borrowing", lambda c: c["payday_loan_12m"] >= 0.5),
    ("Linked to someone else's credit", lambda c: c["financial_association"] >= 0.5),
    ("Brand new to credit", lambda c: c["oldest_account_months"] < 12),
    ("Building a first track record", lambda c: c["oldest_account_months"] < 30),
    ("Renting and building steadily", lambda c: c["rent_reported"] >= 0.5),
    ("Cards close to the limit", lambda c: c["utilisation"] >= 0.55),
    ("Long, steady history", lambda c: c["oldest_account_months"] >= 150 and c["utilisation"] < 0.25),
    ("Steady, with room to grow", lambda c: True),
]


def segment_features(df: pd.DataFrame) -> np.ndarray:
    X = df[FEATURE_NAMES].to_numpy(float).copy()
    for name in ("total_limit", "oldest_account_months"):
        j = FEATURE_NAMES.index(name)
        X[:, j] = np.log1p(X[:, j])
    return X


def main():
    t0 = time.time()
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    OUT_RES.mkdir(exist_ok=True)
    df = pd.read_csv(HERE / "data" / "synthetic_credit_profiles.csv.gz")
    train, test = train_test_split(df, test_size=0.2, random_state=SEED, stratify=df["archetype"])
    Xtr, ytr = train[FEATURE_NAMES].to_numpy(float), train["credit_score"].to_numpy(float)
    Xte, yte = test[FEATURE_NAMES].to_numpy(float), test["credit_score"].to_numpy(float)
    metrics: dict = {"dataset": {
        "profiles": len(df), "train": len(train), "test": len(test),
        "archetypes": df["archetype"].value_counts().to_dict(),
        "bands": df["band"].value_counts().to_dict(),
        "score_mean": round(float(df["credit_score"].mean()), 1),
        "noise_floor_mae": round(float(mean_absolute_error(df["oracle_score"], df["credit_score"])), 2),
    }}

    # 1. Model comparison (5-fold CV on train, then the untouched test set)
    candidates = {
        "linear_regression": lambda: LinearRegression(),
        "gradient_boosting": lambda: make_hgb(False),
        "gradient_boosting_monotonic": lambda: make_hgb(True),
    }
    metrics["cv"], metrics["test"], fitted = {}, {}, {}
    kf = KFold(5, shuffle=True, random_state=SEED)
    for name, build in candidates.items():
        scores = []
        for a, b in kf.split(Xtr):
            m = build().fit(Xtr[a], ytr[a])
            scores.append(evaluate(m, Xtr[b], ytr[b], train["oracle_score"].to_numpy()[b]))
        metrics["cv"][name] = {k: round(float(np.mean([s[k] for s in scores])), 4) for k in scores[0]}
        fitted[name] = build().fit(Xtr, ytr)
        metrics["test"][name] = evaluate(fitted[name], Xte, yte, test["oracle_score"].to_numpy())
        print(name, metrics["cv"][name], metrics["test"][name], flush=True)

    # 2. Advice fidelity: rank actions with each model, compare with the hidden truth
    rng = np.random.default_rng(SEED)
    sample = test.iloc[rng.choice(len(test), 6000, replace=False)]
    sample_rows = rows_of(sample)
    metrics["advice_fidelity"] = {}
    for name, m in fitted.items():
        pred = (lambda mm: lambda rows: np.clip(mm.predict(pd.DataFrame(rows)[FEATURE_NAMES].to_numpy(float)), 0, 999))(m)
        metrics["advice_fidelity"][name] = advice_fidelity(pred, sample_rows)
        print("fidelity", name, metrics["advice_fidelity"][name], flush=True)

    chosen_name = "gradient_boosting"  # best on accuracy AND advice fidelity; see README
    model = fitted[chosen_name]
    predict = lambda rows: np.clip(model.predict(pd.DataFrame(rows)[FEATURE_NAMES].to_numpy(float)), 0, 999)

    # Stress test: improving one thing in isolation should never cost points
    nudges = {
        "utilisation": lambda r: dict(r, utilisation=max(0.15, r["utilisation"] - 0.1)) if r["utilisation"] > 0.2 else None,
        "missed_12m": lambda r: dict(r, missed_12m=r["missed_12m"] - 1) if r["missed_12m"] > 0 else None,
        "hard_searches_12m": lambda r: dict(r, hard_searches_12m=r["hard_searches_12m"] - 1) if r["hard_searches_12m"] > 0 else None,
        "electoral_roll": lambda r: dict(r, electoral_roll=1) if r["electoral_roll"] == 0 else None,
        "min_payment_months": lambda r: dict(r, min_payment_months=r["min_payment_months"] - 2) if r["min_payment_months"] >= 2 else None,
        "overdraft_months_12m": lambda r: dict(r, overdraft_months_12m=r["overdraft_months_12m"] - 2) if r["overdraft_months_12m"] >= 2 else None,
        "payday_loan_12m": lambda r: dict(r, payday_loan_12m=0) if r["payday_loan_12m"] else None,
        "financial_association": lambda r: dict(r, financial_association=0) if r["financial_association"] else None,
        "oldest_account_months": lambda r: dict(r, oldest_account_months=r["oldest_account_months"] + 12) if r["num_accounts"] else None,
    }
    stress = {}
    for name, m in fitted.items():
        pr = (lambda mm: lambda rows: np.clip(mm.predict(pd.DataFrame(rows)[FEATURE_NAMES].to_numpy(float)), 0, 999))(m)
        bad = tot = 0
        for f, nudge in nudges.items():
            pairs = [(r, nudge(r)) for r in sample_rows[:3000]]
            pairs = [(a, b) for a, b in pairs if b is not None]
            if not pairs:
                continue
            d = pr([b for _, b in pairs]) - pr([a for a, _ in pairs])
            bad += int(np.sum(d < -5)); tot += len(d)
        stress[name] = {"checks": tot, "improvement_lowered_score_by_5plus": round(bad / tot, 4)}
    metrics["stress_test"] = stress
    print("stress", stress, flush=True)

    # Per-archetype quality, so no group is served badly
    per_arch = {}
    for arch, g in sample.groupby("archetype"):
        rows = rows_of(g)
        p = predict(rows)
        per_arch[arch] = {
            "n": len(g), "mae": round(float(mean_absolute_error(g["credit_score"], p)), 1),
            "band_accuracy": round(band_accuracy(g["credit_score"].to_numpy(), p), 3),
            **{k: v for k, v in advice_fidelity(predict, rows).items() if k in ("top_action_matches_truth", "top_action_harmful_rate", "gain_mae_points")},
        }
    metrics["per_archetype"] = per_arch
    per_band = {}
    for band, g in sample.groupby("band"):
        rows = rows_of(g)
        per_band[band] = {"n": len(g), **{k: v for k, v in advice_fidelity(predict, rows).items() if k in ("top_action_matches_truth", "gain_mae_points")}}
    metrics["per_band"] = per_band

    # 3. Patterns the model found
    sub = test.sample(8000, random_state=SEED)
    pi = permutation_importance(model, sub[FEATURE_NAMES].to_numpy(float), sub["credit_score"].to_numpy(float),
                                n_repeats=5, random_state=SEED, scoring="neg_mean_absolute_error")
    importance = sorted(zip(FEATURE_NAMES, pi.importances_mean), key=lambda x: -x[1])
    metrics["importance_mae_points"] = {k: round(float(v), 2) for k, v in importance}

    # Partial dependence of utilisation: where does using less stop helping?
    grid = np.round(np.arange(0, 1.21, 0.05), 2)
    base_rows = rows_of(sub.sample(2000, random_state=SEED))
    curve = []
    for u in grid:
        rr = [dict(r, utilisation=float(u)) for r in base_rows if r["total_limit"] > 0]
        curve.append(float(np.mean(predict(rr))))
    metrics["utilisation_curve"] = {f"{u:.2f}": round(c, 1) for u, c in zip(grid, curve)}

    # Searches hurt thin files more? (interaction the model should have picked up)
    def search_cost(rows):
        return float(np.mean(predict([dict(r, hard_searches_12m=r["hard_searches_12m"] + 1) for r in rows]) - predict(rows)))
    thin = [r for r in base_rows if r["oldest_account_months"] < 24]
    thick = [r for r in base_rows if r["oldest_account_months"] > 120]
    metrics["one_extra_search_points"] = {"file_under_2y": round(search_cost(thin), 1), "file_over_10y": round(search_cost(thick), 1)}
    roll_gain = lambda rows: float(np.mean(predict([dict(r, electoral_roll=1) for r in rows]) - predict([dict(r, electoral_roll=0) for r in rows])))
    metrics["electoral_roll_points"] = {"file_under_2y": round(roll_gain(thin), 1), "file_over_10y": round(roll_gain(thick), 1)}

    # 4. Segments ("people in a similar situation"), found by k-means
    Xs = segment_features(train)
    scaler = StandardScaler().fit(Xs)
    km = KMeans(n_clusters=10, n_init=10, random_state=SEED).fit(scaler.transform(Xs))
    train = train.assign(segment=km.labels_)
    segments = []
    used: dict[str, int] = {}
    seg_sample = train.groupby("segment").sample(400, random_state=SEED, replace=True)
    for k in range(km.n_clusters):
        g = train[train.segment == k]
        centre = scaler.inverse_transform(km.cluster_centers_[k:k + 1])[0]
        c = {f: (np.expm1(v) if f in ("total_limit", "oldest_account_months") else v) for f, v in zip(FEATURE_NAMES, centre)}
        name = next(n for n, rule in SEGMENT_RULES if rule(c))
        used[name] = used.get(name, 0) + 1
        if used[name] > 1:
            name = f"{name} ({used[name]})"
        rows = rows_of(seg_sample[seg_sample.segment == k])
        gains = action_gains(predict, rows)
        top = pd.Series([max(g_, key=g_.get) for g_ in gains if g_]).value_counts(normalize=True)
        full_plan = predict([plan_profile(r, HORIZON, {a for a in ACTIONS if applicable(r, a)}) for r in rows]) - predict([plan_profile(r, HORIZON, set()) for r in rows])
        segments.append({
            "id": k, "name": name, "share": round(len(g) / len(train), 4),
            "median_score": int(g["credit_score"].median()),
            "typical_top_actions": {a: round(float(v), 3) for a, v in top.head(3).items()},
            "median_plan_gain_12m": int(np.median(full_plan)),
            "main_archetypes": g["archetype"].value_counts(normalize=True).head(3).round(3).to_dict(),
        })
        print("segment", segments[-1], flush=True)
    metrics["segments"] = segments

    # 5. Export for the browser, and check the export matches sklearn exactly
    exp = export_trees(model)
    check = Xte[:300]
    drift = float(np.max(np.abs(predict_exported(exp, check) - model.predict(check))))
    metrics["export_max_drift"] = drift
    assert drift < 1e-3, drift
    metrics["chosen_model"] = chosen_name
    metrics["model_size"] = {"trees": len(exp["trees"]), "nodes": int(sum(len(t["f"]) for t in exp["trees"]))}

    payload = {
        "version": 1,
        "features": FEATURE_NAMES,
        "bands": [{"min": lo, "max": hi, "name": n} for lo, hi, n in BANDS],
        "model": exp,
        "segments": {
            "scaler_mean": scaler.mean_.round(6).tolist(), "scaler_scale": scaler.scale_.round(6).tolist(),
            "log_features": ["total_limit", "oldest_account_months"],
            "centroids": km.cluster_centers_.round(5).tolist(),
            "info": segments,
        },
        "metrics": {
            "profiles": len(df), "test_mae": metrics["test"][chosen_name]["mae"],
            "test_r2": metrics["test"][chosen_name]["r2"],
            "band_accuracy": metrics["test"][chosen_name]["band_accuracy"],
            "top_action_matches_truth": metrics["advice_fidelity"][chosen_name]["top_action_matches_truth"],
        },
    }
    (OUT_WEB / "model.json").write_text(json.dumps(payload, separators=(",", ":")))

    fixtures = []
    fx = test.groupby("archetype").head(15)
    for r, p in zip(rows_of(fx), predict(rows_of(fx))):
        plan12 = {a: float(v) for a, v in action_gains(predict, [r])[0].items()}
        fixtures.append({"profile": r, "score": float(p), "gains12": plan12})
    (OUT_WEB / "fixtures.json").write_text(json.dumps(fixtures, separators=(",", ":")))

    metrics["seconds"] = round(time.time() - t0, 1)
    (OUT_RES / "metrics.json").write_text(json.dumps(metrics, indent=2, default=float))
    print(json.dumps({k: metrics[k] for k in ("test", "advice_fidelity", "stress_test", "importance_mae_points", "one_extra_search_points", "electoral_roll_points", "model_size")}, indent=1, default=float))
    print(f"done in {metrics['seconds']}s; model.json {(OUT_WEB / 'model.json').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
