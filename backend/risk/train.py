"""Train the missed-payment model with gradient descent, exactly as in our notes:

1. Start with random betas.
2. Make predictions:      p = 1 / (1 + e^-z),  z = b0 + b1*x1 + ...
3. Measure how wrong:     log loss = -[y*ln(p) + (1-y)*ln(1-p)], averaged
4. Nudge every beta downhill (gradient descent), and repeat.

THE DATA IS SYNTHETIC. We have no real bank data at a hackathon, so make_dataset() invents
customer-months from a documented rule plus randomness. A real version would train on the
bank's own historical repayment records, test for bias, and be signed off by risk and compliance.

Run:  python -m risk.train     (writes risk/model.json, prints the test results)
"""
import json
import math
import random

from risk.model import FEATURE_NAMES, MODEL_PATH, RiskModel, sigmoid

SEED = 2026
ROWS = 4000
TEST_SHARE = 0.25
EPOCHS = 600
LEARNING_RATE = 0.3
L2 = 0.001  # a little regularisation keeps the weights sensible


def make_dataset(rows: int = ROWS, seed: int = SEED) -> tuple[list[list[float]], list[int]]:
    """Invent `rows` customer-months: the six features, and whether the next payment was missed (1) or not (0)."""
    rng = random.Random(seed)
    xs, ys = [], []
    for _ in range(rows):
        struggling = rng.random() < 0.25  # a hidden "money is tight" factor the model never sees directly
        utilisation = min(1.0, max(0.0, rng.gauss(0.65 if struggling else 0.35, 0.2)))
        min_only = min(3, max(0, round(rng.gauss(2.2 if struggling else 0.8, 0.9))))
        late = min(6, max(0, round(rng.expovariate(1 / (1.4 if struggling else 0.25)))))
        growth = max(0.6, rng.gauss(1.15 if struggling else 0.98, 0.12))
        spend_ratio = max(0.2, rng.gauss(1.25 if struggling else 0.95, 0.25))
        paid = 1 if rng.random() < (0.15 if struggling else 0.45) else 0

        # The "true" rule behind the made-up outcomes, plus noise. The model has to learn it from examples.
        z = (-3.0 + 2.0 * utilisation + 0.45 * min_only + 0.65 * late
             + 1.6 * (growth - 1) + 0.7 * (spend_ratio - 1) - 2.2 * paid
             + (0.8 if struggling else 0) + rng.gauss(0, 0.5))
        ys.append(1 if rng.random() < sigmoid(z) else 0)
        xs.append([utilisation, min_only, late, growth, spend_ratio, paid])
    return xs, ys


def standardise(xs: list[list[float]]) -> tuple[list[float], list[float]]:
    """Mean and spread of each feature, so no feature dominates just because its numbers are bigger."""
    n, k = len(xs), len(xs[0])
    means = [sum(row[j] for row in xs) / n for j in range(k)]
    stds = [math.sqrt(sum((row[j] - means[j]) ** 2 for row in xs) / n) or 1.0 for j in range(k)]
    return means, stds


def log_loss(ps: list[float], ys: list[int]) -> float:
    eps = 1e-12
    return -sum(y * math.log(p + eps) + (1 - y) * math.log(1 - p + eps) for p, y in zip(ps, ys)) / len(ys)


def auc(ps: list[float], ys: list[int]) -> float:
    """Chance that a random customer who missed is scored higher than one who paid (0.5 = guessing, 1 = perfect)."""
    pos = [p for p, y in zip(ps, ys) if y == 1]
    neg = [p for p, y in zip(ps, ys) if y == 0]
    wins = sum((p > q) + 0.5 * (p == q) for p in pos for q in neg)
    return wins / (len(pos) * len(neg))


def train(xs: list[list[float]], ys: list[int], epochs: int = EPOCHS, lr: float = LEARNING_RATE, seed: int = SEED,
          log_every: int = 0) -> tuple[float, list[float], list[float], list[float]]:
    means, stds = standardise(xs)
    zs = [[(v - m) / s for v, m, s in zip(row, means, stds)] for row in xs]
    n, k = len(zs), len(zs[0])

    rng = random.Random(seed)
    b0 = 0.0
    w = [rng.uniform(-0.1, 0.1) for _ in range(k)]  # 1. start with random betas

    for epoch in range(epochs):
        ps = [sigmoid(b0 + sum(wj * xj for wj, xj in zip(w, row))) for row in zs]  # 2. predict
        errors = [p - y for p, y in zip(ps, ys)]  # 3. how wrong (the gradient of log loss is just p - y)
        b0 -= lr * sum(errors) / n  # 4. nudge each beta against its gradient
        for j in range(k):
            grad = sum(e * row[j] for e, row in zip(errors, zs)) / n + L2 * w[j]
            w[j] -= lr * grad
        if log_every and epoch % log_every == 0:
            print(f"  epoch {epoch:4d}  log loss {log_loss(ps, ys):.4f}")
    return b0, w, means, stds


def main() -> None:
    xs, ys = make_dataset()
    cut = int(len(xs) * (1 - TEST_SHARE))
    train_x, train_y, test_x, test_y = xs[:cut], ys[:cut], xs[cut:], ys[cut:]

    print(f"Training on {len(train_x)} synthetic customer-months ({sum(train_y)} missed payments)...")
    b0, w, means, stds = train(train_x, train_y, log_every=100)
    model = RiskModel(b0, w, means, stds, metrics={})

    ps = [model.probability(x) for x in test_x]
    base_rate = sum(train_y) / len(train_y)
    metrics = {
        "trained_on": f"{len(train_x)} synthetic customer-months",
        "tested_on": f"{len(test_x)} held-out customer-months",
        "test_accuracy": round(sum((p >= 0.5) == (y == 1) for p, y in zip(ps, test_y)) / len(test_y), 3),
        "test_auc": round(auc(ps, test_y), 3),
        "test_log_loss": round(log_loss(ps, test_y), 3),
        "baseline_log_loss": round(log_loss([base_rate] * len(test_y), test_y), 3),
        "missed_rate": round(base_rate, 3),
        "synthetic_data": True,
    }
    model.metrics = metrics
    MODEL_PATH.write_text(json.dumps(model.to_json(), indent=2) + "\n")

    print("\nLearned weights (per standard deviation of each feature):")
    print(f"  {'intercept (b0)':<18} {b0:+.3f}")
    for name, wj in zip(FEATURE_NAMES, w):
        print(f"  {name:<18} {wj:+.3f}")
    print(f"\nHeld-out test: accuracy {metrics['test_accuracy']:.1%}, AUC {metrics['test_auc']}, "
          f"log loss {metrics['test_log_loss']} (always guessing the average: {metrics['baseline_log_loss']})")
    print(f"Saved {MODEL_PATH}")


if __name__ == "__main__":
    main()
