import re
from typing import Iterable


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_text(
    value: object,
    *,
    max_length: int,
    min_length: int = 0,
    lower: bool = False,
) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if lower:
        text = text.lower()
    if min_length and len(text) < min_length:
        raise ValueError(f"Campo deve ter pelo menos {min_length} caractere(s).")
    if len(text) > max_length:
        raise ValueError(f"Campo deve ter no máximo {max_length} caracteres.")
    return text


def normalize_optional_text(
    value: object,
    *,
    max_length: int,
    lower: bool = False,
) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return None
    if lower:
        text = text.lower()
    if len(text) > max_length:
        raise ValueError(f"Campo deve ter no máximo {max_length} caracteres.")
    return text


def normalize_string_list(
    values: object,
    *,
    max_items: int,
    item_max_length: int,
    lower: bool = False,
    allowed_values: Iterable[str] | None = None,
) -> list[str]:
    source = values if isinstance(values, list) else list(values or [])
    normalized_allowed = {str(item).strip() for item in (allowed_values or []) if str(item).strip()}
    result: list[str] = []
    seen: set[str] = set()

    for raw_item in source:
        item = re.sub(r"\s+", " ", str(raw_item or "")).strip()
        if not item:
            continue
        if lower:
            item = item.lower()
        if len(item) > item_max_length:
            raise ValueError(f"Itens devem ter no máximo {item_max_length} caracteres.")
        if normalized_allowed and item not in normalized_allowed:
            raise ValueError(f"Valor inválido na lista: {item}.")
        dedupe_key = item.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        result.append(item)

    if len(result) > max_items:
        raise ValueError(f"Lista excede o limite de {max_items} itens.")
    return result


def validate_email(value: object) -> str:
    email = normalize_text(value, max_length=254, min_length=5, lower=True)
    if not EMAIL_PATTERN.match(email):
        raise ValueError("Email inválido.")
    return email
