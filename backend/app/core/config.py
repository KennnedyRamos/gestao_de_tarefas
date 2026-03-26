from dotenv import load_dotenv
import os

load_dotenv()  # Carrega variáveis do .env

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador")
ADMIN_ROLE = os.getenv("ADMIN_ROLE", "admin")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip()


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

def parse_cors_origins(value: str):
    if not value:
        return []
    if value.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]
