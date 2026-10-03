import os
from urllib.parse import urlsplit

from dotenv import load_dotenv

load_dotenv()  # Carrega variáveis do .env

ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})
INSECURE_SECRET_VALUES = {
    "secret",
    "changeme",
    "change-me",
    "replace-me",
    "troque-por-uma-chave-segura",
}


def is_production_environment() -> bool:
    environment = str(os.getenv("APP_ENV", "") or "").strip().lower()
    return environment in {"prod", "production"} or bool(
        os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_INSTANCE_ID")
    )


def validate_security_settings(
    secret_key: str | None,
    algorithm: str | None,
    *,
    production: bool,
) -> None:
    normalized_secret = str(secret_key or "").strip()
    normalized_algorithm = str(algorithm or "").strip()
    if not normalized_secret:
        raise ValueError("SECRET_KEY must be configured.")
    if normalized_algorithm not in ALLOWED_JWT_ALGORITHMS:
        raise ValueError("ALGORITHM must be one of the supported HMAC algorithms.")
    if production and (
        len(normalized_secret.encode("utf-8")) < 32
        or normalized_secret.lower() in INSECURE_SECRET_VALUES
        or normalized_secret.lower().startswith(("change-", "troque-"))
    ):
        raise ValueError("SECRET_KEY must be a strong, non-placeholder secret in production.")


def parse_cors_origins(value: str | None, *, production: bool = False) -> list[str]:
    raw_origins = str(value or "").strip()
    if not raw_origins:
        if production:
            raise ValueError("CORS_ORIGINS must configure exact frontend origins in production.")
        raw_origins = "http://localhost:3000,http://127.0.0.1:3000"
    if raw_origins == "*":
        raise ValueError("CORS_ORIGINS does not allow wildcard origins.")

    origins: list[str] = []
    for raw_origin in raw_origins.split(","):
        origin = raw_origin.strip().rstrip("/")
        if not origin:
            continue
        parsed = urlsplit(origin)
        try:
            valid_port = parsed.port is None or 1 <= parsed.port <= 65535
        except ValueError:
            valid_port = False
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or not valid_port
        ):
            raise ValueError("CORS_ORIGINS must contain exact HTTP or HTTPS origins only.")
        normalized_origin = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
        if normalized_origin not in origins:
            origins.append(normalized_origin)
    if not origins and production:
        raise ValueError("CORS_ORIGINS must configure exact frontend origins in production.")
    return origins

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
validate_security_settings(SECRET_KEY, ALGORITHM, production=is_production_environment())
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador")
ADMIN_ROLE = os.getenv("ADMIN_ROLE", "admin")
CORS_ORIGINS = parse_cors_origins(os.getenv("CORS_ORIGINS"), production=is_production_environment())


def env_positive_int(name: str, default: int) -> int:
    raw_value = str(os.getenv(name, "") or "").strip()
    if not raw_value:
        return default
    try:
        parsed_value = int(raw_value)
    except ValueError:
        return default
    return parsed_value if parsed_value > 0 else default


PICKUP_CATALOG_CLIENTS_CSV_MAX_BYTES = (
    env_positive_int("PICKUP_CATALOG_CLIENTS_CSV_MAX_MB", 200) * 1024 * 1024
)
PICKUP_CATALOG_INVENTORY_CSV_MAX_BYTES = (
    env_positive_int("PICKUP_CATALOG_INVENTORY_CSV_MAX_MB", 200) * 1024 * 1024
)
PICKUP_CATALOG_CLIENTS_CSV_MAX_LINES = env_positive_int(
    "PICKUP_CATALOG_CLIENTS_CSV_MAX_LINES",
    50000,
)
PICKUP_CATALOG_INVENTORY_CSV_MAX_LINES = env_positive_int(
    "PICKUP_CATALOG_INVENTORY_CSV_MAX_LINES",
    120000,
)
