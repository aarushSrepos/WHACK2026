"""Missed-payment risk: a logistic regression model, written from scratch so every step can be explained.

    z = b0 + b1*x1 + b2*x2 + ...        (a weighted score)
    P(miss next payment) = 1 / (1 + e^-z) (squashed to a probability between 0 and 1)

Used only to offer help earlier. Never for lending decisions, limits or pricing.
"""
from risk.model import FEATURES, Prediction, RiskModel, load_model

__all__ = ["FEATURES", "Prediction", "RiskModel", "load_model"]
