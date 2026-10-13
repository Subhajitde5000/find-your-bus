from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DEFAULT_DATA_DIR = REPO_DIR / "data"


class Settings(BaseSettings):
    """Runtime settings. Values can be set in backend/.env or real environment variables."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/find_your_bus"
    # Origins allowed to call the API from a browser (the Next.js frontend).
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
