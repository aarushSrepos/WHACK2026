"""One error type for "the customer asked for something we cannot do" (person B owns this file).

The message is written to be shown to the customer, so keep it plain and kind.
main.py turns it into a JSON reply like {"detail": "..."} with the right status code.
"""


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
