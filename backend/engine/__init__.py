"""Account engine, owned by C.

Plain Python functions that compute every figure: minimum payment, utilisation,
interest estimate, month spend, "what if I pay X". No web code in here, so B can
call these from routes and they are easy to test.

Money is always whole pence (int), never floats.
"""
