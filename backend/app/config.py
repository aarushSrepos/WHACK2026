"""Settings read from environment variables (or from backend/.env).

Everything is read at call time, not import time, so tests can change it.
"""
import os

from dotenv import load_dotenv

load_dotenv()  # loads backend/.env if it exists; does nothing otherwise


def mock_default() -> bool:
    """True only when MOCK=1: routes then return fixed JSON from app/mocks/.

    Every route is built now, so the default is the real thing (database, engine, AI layer).
    """
    return os.getenv("MOCK", "0") == "1"


def live_routes() -> set[str]:
    """Routes that use real code even when MOCK=1, from LIVE_ROUTES=me,transactions."""
    raw = os.getenv("LIVE_ROUTES", "")
    return {name.strip() for name in raw.split(",") if name.strip()}


def use_mock(route: str) -> bool:
    """Should this route return mock data right now?"""
    if route in live_routes():
        return False
    return mock_default()


def database_path() -> str:
    """Where the SQLite file lives. Defaults to backend/spendsense.db (git ignores it)."""
    default = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "spendsense.db")
    return os.getenv("DATABASE_PATH", default)


def demo_enabled() -> bool:
    """The /demo/* routes are for rehearsals. Set ENABLE_DEMO_ROUTES=0 to switch them off."""
    return os.getenv("ENABLE_DEMO_ROUTES", "1") == "1"


def cors_origins() -> list[str]:
    """Frontend addresses allowed to call this API from a browser."""
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]
