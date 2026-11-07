"""Small money calculations used by the live routes.

TODO(C): this is a stand-in so B is not blocked. When C's real functions exist in
backend/engine/, switch queries.py to call those and delete this file.

Everything here is whole pence in, whole pence out. No floats for money.
"""


def available_credit_pence(credit_limit_pence: int, balance_pence: int) -> int:
    return credit_limit_pence - balance_pence


def utilisation_percent(credit_limit_pence: int, balance_pence: int) -> float:
    """How much of the limit is used, to one decimal place (62000 of 150000 is 41.3)."""
    return round(balance_pence / credit_limit_pence * 100, 1)


def interest_estimate_pence(balance_pence: int, apr_basis_points: int) -> int:
    """About one month of interest on the current balance, rounded to the nearest penny.

    balance x (APR / 12). APR is in basis points (2490 = 24.90%), so divide by 10,000 and by 12.
    Integer maths: add half of the divisor before dividing so it rounds half up.
    """
    divisor = 10_000 * 12
    return (balance_pence * apr_basis_points + divisor // 2) // divisor


def percent_used(spent_pence: int, limit_pence: int | None) -> float | None:
    """How far through the customer's own spending limit they are. None if they have no limit."""
    if not limit_pence:
        return None
    return round(spent_pence / limit_pence * 100, 1)
