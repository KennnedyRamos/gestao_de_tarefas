import csv
import re
import unicodedata
from pathlib import Path

REFERENCE_DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _canonical_code(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "", str(value or "")).upper()
    if normalized.isdigit():
        return normalized.lstrip("0") or "0"
    return normalized


def normalize_header(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def _load_reference_map(filename: str, *, equipment_map: bool = False) -> dict[str, str]:
    path = REFERENCE_DATA_DIR / filename
    mapping: dict[str, str] = {}
    try:
        with path.open(encoding="utf-8-sig", newline="") as reference_file:
            for line_number, row in enumerate(csv.reader(reference_file, delimiter="\t"), start=1):
                if not row or not any(value.strip() for value in row):
                    continue
                minimum_columns = 2 if equipment_map else 4
                if len(row) < minimum_columns:
                    raise RuntimeError(f"Invalid row {line_number} in Giro reference file {filename}.")
                code = _canonical_code(row[0])
                if not code:
                    raise RuntimeError(f"Missing code on row {line_number} in Giro reference file {filename}.")
                if equipment_map:
                    category = normalize_header(row[1])
                    mapped_value = category if category in {"visa", "sopi"} else ""
                    code_values = [(row[0], mapped_value)]
                else:
                    primary_category = normalize_header(row[1])
                    if primary_category not in {"ctt", "nab"}:
                        raise RuntimeError(
                            f"Unknown basket {row[1]!r} on row {line_number} in Giro reference file {filename}."
                        )
                    code_values = [(row[0], "sopi")]
                    if len(row) > 2 and row[2].strip() not in {"", "-"}:
                        alternate_category = normalize_header(row[3]) if len(row) > 3 else ""
                        alternate_basket = {"nab": "visa", "ctt": "sopi"}.get(alternate_category)
                        if not alternate_basket:
                            raise RuntimeError(
                                f"Unknown alternate basket {row[3]!r} on row {line_number} "
                                f"in Giro reference file {filename}."
                            )
                        code_values.append((row[2], alternate_basket))
                for raw_code, mapped_value in code_values:
                    code = _canonical_code(raw_code)
                    if not code or code == "-":
                        raise RuntimeError(f"Missing code on row {line_number} in Giro reference file {filename}.")
                    if code in mapping and mapping[code] != mapped_value:
                        raise RuntimeError(f"Conflicting code {code} in Giro reference file {filename}.")
                    mapping[code] = mapped_value
    except OSError as exc:
        raise RuntimeError(f"Unable to load Giro reference file: {path}") from exc
    return mapping


BASKET_BY_PRODUCT_CODE = _load_reference_map("giro_basket_products.tsv")
EQUIPMENT_TYPE_BY_PRODUCT_CODE = _load_reference_map(
    "giro_equipment_types.tsv",
    equipment_map=True,
)
