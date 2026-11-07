"""The model itself: the features, the sigmoid, and a plain-English explanation of each prediction.

The features are ACCOUNT BEHAVIOUR ONLY. The model never sees anything from the needs profile,
disabilities, support requests or anything else a customer told us about themselves. Using those would
penalise people for asking for help, which is unfair and (under the Equality Act) potentially unlawful.
test_risk.py checks that this list stays account-only.
"""
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

MODEL_PATH = Path(__file__).with_name("model.json")


@dataclass(frozen=True)
class Feature:
    name: str
    label: str        # what the staff console calls it
    raises: str       # sentence when it pushes the risk up
    lowers: str       # sentence when it pushes the risk down


FEATURES: list[Feature] = [
    Feature("utilisation", "Credit used",
            "Using {value} of their credit limit.", "Using only {value} of their credit limit."),
    Feature("min_only_last_3", "Minimum-only payments",
            "Paid only the minimum in {value} of the last 3 months.", "Paid more than the minimum recently."),
    Feature("late_last_6", "Late payments",
            "Late with {value} of their last 6 payments.", "No late payments in the last 6 months."),
    Feature("balance_growth", "Balance trend",
            "Balance has grown {value} over 3 months.", "Balance is steady or falling ({value} over 3 months)."),
    Feature("spend_ratio", "Recent spending",
            "Spent {value} of their usual monthly amount in the last 30 days.",
            "Spending is at or below usual ({value} of their usual amount)."),
    Feature("paid_this_cycle", "Paid this month",
            "No payment yet this month.", "Has already paid at least the minimum this month."),
]
FEATURE_NAMES = [f.name for f in FEATURES]


def sigmoid(z: float) -> float:
    """Turns any number into a probability between 0 and 1. Big z -> close to 1."""
    if z < -40:
        return 0.0
    if z > 40:
        return 1.0
    return 1 / (1 + math.exp(-z))


def format_value(name: str, x: float) -> str:
    if name in ("utilisation", "spend_ratio"):
        return f"{round(x * 100)}%"
    if name == "balance_growth":
        change = round((x - 1) * 100)
        return f"{'+' if change > 0 else ''}{change}%"
    return str(int(x))


@dataclass
class Driver:
    feature: str
    label: str
    value: str
    effect: str       # "raises" or "lowers"
    impact: float     # how much it moves z, compared with an average customer
    text: str


@dataclass
class Prediction:
    probability: float
    band: str                      # "low", "medium" or "high"
    drivers: list[Driver] = field(default_factory=list)


# Where we draw the lines: "high" = more likely than not to miss; "medium" = 1 in 5 or more.
BANDS = [(0.5, "high"), (0.2, "medium"), (0.0, "low")]


@dataclass
class RiskModel:
    intercept: float               # b0
    weights: list[float]           # b1..bn, for standardised features
    means: list[float]             # used to standardise: (x - mean) / std
    stds: list[float]
    metrics: dict

    def z(self, x: list[float]) -> float:
        """z = b0 + b1*x1 + b2*x2 + ... on standardised features."""
        return self.intercept + sum(w * (xi - m) / s for w, xi, m, s in zip(self.weights, x, self.means, self.stds))

    def probability(self, x: list[float]) -> float:
        return sigmoid(self.z(x))

    def predict(self, features: dict[str, float]) -> Prediction:
        x = [float(features[name]) for name in FEATURE_NAMES]
        p = self.probability(x)
        band = next(label for cut, label in BANDS if p >= cut)
        drivers = []
        for f, w, xi, m, s in zip(FEATURES, self.weights, x, self.means, self.stds):
            # Each feature's push on z compared with an average customer (where it would be 0).
            impact = w * (xi - m) / s
            effect = "raises" if impact > 0 else "lowers"
            value = format_value(f.name, xi)
            drivers.append(Driver(f.name, f.label, value, effect, round(impact, 3),
                                  (f.raises if impact > 0 else f.lowers).format(value=value)))
        drivers.sort(key=lambda d: abs(d.impact), reverse=True)
        return Prediction(round(p, 4), band, drivers)

    def to_json(self) -> dict:
        return {
            "kind": "logistic_regression",
            "features": FEATURE_NAMES,
            "intercept": self.intercept,
            "weights": self.weights,
            "means": self.means,
            "stds": self.stds,
            "metrics": self.metrics,
        }


def load_model(path: Path = MODEL_PATH) -> RiskModel:
    """Load the trained weights. Run `python -m risk.train` to (re)create model.json."""
    data = json.loads(path.read_text())
    if data["features"] != FEATURE_NAMES:
        raise ValueError("model.json was trained on different features. Run: python -m risk.train")
    return RiskModel(data["intercept"], data["weights"], data["means"], data["stds"], data["metrics"])
