from __future__ import annotations

import csv
import io
import re
import unicodedata
from typing import Any


CLIENT_FORM_FIELDS = [
    "client_code",
    "nome_fantasia",
    "razao_social",
    "cnpj_cpf",
    "setor",
    "telefone",
    "endereco",
    "bairro",
    "cidade",
    "cep",
    "inscricao_estadual",
    "responsavel_cliente",
    "responsavel_retirada",
    "responsavel_conferencia",
]

CLIENT_FIELD_ALIASES = {
    "client_code": [
        "codigo",
        "codigo cliente",
        "código do cliente",
        "cod cliente",
        "cod_cliente",
        "código",
        "código cliente",
        "cliente",
    ],
    "nome_fantasia": ["nome fantasia", "fantasia"],
    "razao_social": ["razao social", "razão social", "razao"],
    "cnpj_cpf": ["cnpj/cpf", "cnpj cpf", "cnpj", "cpf"],
    "setor": [
        "setor",
        "cod setor",
        "cod. setor",
        "codigo setor",
        "código setor",
        "secao",
        "seção",
        "canal",
    ],
    "telefone": ["telefone", "fone", "celular"],
    "endereco": ["endereco", "endereço", "logradouro"],
    "bairro": ["bairro"],
    "cidade": ["cidade", "municipio", "município"],
    "cep": ["cep"],
    "inscricao_estadual": ["inscricao estadual", "inscr est", "inscr. est.", "ie"],
    "responsavel_cliente": [
        "responsavel",
        "responsável",
        "responsavel pdv",
        "responsavel loja",
    ],
    "responsavel_retirada": ["responsavel retirada"],
    "responsavel_conferencia": ["responsavel conferencia"],
}

INVENTORY_ALIASES = {
    "client_code": CLIENT_FIELD_ALIASES["client_code"],
    "description": [
        "descricao",
        "descrição",
        "material",
        "produto",
        "item",
        "nome produto",
        "equipamento",
    ],
    "baixados": ["baixados", "baixado", "qtd baixados", "qtde baixados", "saldo baixados"],
    "saldo": ["saldo"],
    "rg": [
        "nro serie mercadoria",
        "numero serie mercadoria",
        "rg",
        "numero rg",
        "n rg",
        "serial",
        "serie",
        "identificador",
    ],
    "comodato_number": ["nro comodato", "numero comodato", "n comodat", "nr comodato"],
    "issue_date": ["data emissao", "data emissão", "emissao", "emissão"],
    "product_code": ["codigo produto", "cod produto", "material codigo", "codigo material"],
}

ITEM_TYPE_LABELS = {
    "refrigerador": "Refrigerador",
    "garrafeira": "Garrafeira",
    "vasilhame_caixa": "Vasilhame (Caixa)",
    "vasilhame_garrafa": "Vasilhame (Garrafa)",
    "outro": "Outro",
}

BOTTLES_PER_CRATE = {"300ml": 24, "600ml": 24, "1l": 12}


def canonical_code(value: str) -> str:
    text = (value or "").strip()
    normalized = re.sub(r"[^A-Za-z0-9]+", "", text).upper()
    if normalized.isdigit():
        return normalized.lstrip("0") or "0"
    return normalized


def parse_integer(value: Any) -> int:
    raw = str(value or "").strip()
    if not raw:
        return 0

    direct = re.fullmatch(r"[-+]?\d+", raw.replace(" ", ""))
    if direct:
        return int(direct.group(0))

    token = raw.replace(" ", "")
    if "," in token and "." in token:
        token = token.replace(".", "").replace(",", ".")
    elif "," in token and "." not in token:
        left, right = token.split(",", 1)
        token = token.replace(",", "") if len(right) == 3 else f"{left}.{right}"
    elif "." in token and "," not in token and token.count(".") > 1:
        token = token.replace(".", "")

    try:
        return int(float(token))
    except ValueError:
        only_digits = re.search(r"[-+]?\d+", token.replace(".", "").replace(",", ""))
        return int(only_digits.group(0)) if only_digits else 0


def _compact_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _digits_only(value: str) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def _normalize_document(value: str) -> str:
    digits = _digits_only(value)
    if not digits:
        return ""
    if len(digits) >= 14:
        return digits[-14:]
    if len(digits) >= 9:
        return digits[-9:]
    return ""


def _normalize_setor(value: str) -> str:
    digits = _digits_only(value)
    if not digits:
        return ""
    return digits[-3:]


def _normalize_client_field(field: str, value: str) -> str:
    if field == "cnpj_cpf":
        return _normalize_document(value)
    if field == "setor":
        return _normalize_setor(value)
    return _compact_spaces(value)


def item_type_label(item_type: str) -> str:
    return ITEM_TYPE_LABELS.get(item_type, ITEM_TYPE_LABELS["outro"])


def calculate_bottles_for_crates(volume_key: str | None, crates_quantity: int) -> int | None:
    if crates_quantity <= 0:
        return 0
    per_crate = BOTTLES_PER_CRATE.get((volume_key or "").lower().strip())
    if per_crate is None:
        return None
    return per_crate * crates_quantity


def find_code_in_mapping(
    mapping: dict[str, Any],
    searched_code: str,
) -> tuple[str, Any | None]:
    canonical = canonical_code(searched_code)
    if not canonical:
        return "", None
    if canonical in mapping:
        return canonical, mapping[canonical]
    return "", None


def normalize_header(name: str) -> str:
    stripped = (name or "").strip().lower()
    ascii_only = unicodedata.normalize("NFKD", stripped)
    ascii_only = "".join(ch for ch in ascii_only if not unicodedata.combining(ch))
    ascii_only = re.sub(r"[^a-z0-9]+", " ", ascii_only)
    return re.sub(r"\s+", " ", ascii_only).strip()


def _decode_csv_bytes(raw_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Não foi possível ler o CSV. Salve o arquivo em UTF-8 ou ANSI e tente novamente.")


def _detect_delimiter(sample_text: str) -> str:
    sample = sample_text[:4000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,|\t")
        return dialect.delimiter
    except csv.Error:
        semicolons = sample.count(";")
        commas = sample.count(",")
        return ";" if semicolons >= commas else ","


def _read_csv_rows(raw_bytes: bytes) -> tuple[list[dict[str, str]], dict[str, list[str]]]:
    text = _decode_csv_bytes(raw_bytes)
    delimiter = _detect_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    headers = next(reader, None)
    if not headers:
        raise ValueError("CSV sem cabeçalho. Verifique o arquivo enviado.")

    # Preserve duplicate headers (e.g. "CNPJ") with stable unique keys.
    seen_headers: dict[str, int] = {}
    unique_headers: list[str] = []
    header_map: dict[str, list[str]] = {}

    for raw_name in headers:
        base_name = (raw_name or "").strip()
        if not base_name:
            base_name = "coluna"
        seen_headers[base_name] = seen_headers.get(base_name, 0) + 1
        count = seen_headers[base_name]
        unique_name = base_name if count == 1 else f"{base_name}__{count}"
        unique_headers.append(unique_name)
        header_map.setdefault(normalize_header(base_name), []).append(unique_name)

    rows: list[dict[str, str]] = []
    for row in reader:
        if len(row) < len(unique_headers):
            row = row + [""] * (len(unique_headers) - len(row))
        elif len(row) > len(unique_headers):
            row = row[: len(unique_headers)]
        rows.append({header: (row[idx] or "").strip() for idx, header in enumerate(unique_headers)})
    return rows, header_map


def _pick_column(
    normalized_to_raw: dict[str, list[str]],
    aliases: list[str],
    required: bool = False,
    context_label: str = "",
) -> str | None:
    for alias in aliases:
        key = normalize_header(alias)
        if key in normalized_to_raw and normalized_to_raw[key]:
            return normalized_to_raw[key][0]
    if required:
        raise ValueError(f"Coluna obrigatória não encontrada: {context_label or aliases[0]}.")
    return None


def _blank_client() -> dict[str, str]:
    return {field: "" for field in CLIENT_FORM_FIELDS}


def _extract_client_payload_from_row(
    row: dict[str, str],
    header_map: dict[str, list[str]],
) -> dict[str, str]:
    payload = _blank_client()
    for field, aliases in CLIENT_FIELD_ALIASES.items():
        column = _pick_column(header_map, aliases, required=False)
        if column:
            payload[field] = _normalize_client_field(field, row.get(column, ""))
    if payload.get("client_code"):
        payload["client_code"] = payload["client_code"].strip()
    return payload


def _normalized_description(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").lower())
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = normalized.replace("ç", "c")
    return normalized


def detect_volume_key(description: str) -> str:
    text = _normalized_description(description)
    if re.search(r"\b300\s*ml\b", text):
        return "300ml"
    if re.search(r"\b600\s*ml\b", text):
        return "600ml"
    if re.search(r"\b(1|1000)\s*(l|lt|litro|litros)\b", text):
        return "1l"
    return ""


def classify_item_type(description: str) -> str:
    text = _normalized_description(description)

    if "garrafeira" in text:
        return "garrafeira"

    refrigerador_words = (
        "refrigerador",
        "geladeira",
        "frigobar",
        "cervejeira",
        "horizontal",
        "vertical",
        "mini",
    )
    if any(word in text for word in refrigerador_words):
        return "refrigerador"

    caixa_words = ("caixa", "cx ", "cx.", "engrad", "fardo")
    garrafa_words = ("garrafa", "gfa", "vasilhame")
    has_caixa = any(word in text for word in caixa_words)
    has_garrafa = any(word in text for word in garrafa_words)

    if has_caixa:
        return "vasilhame_caixa"
    if has_garrafa:
        return "vasilhame_garrafa"

    return "outro"


def load_clients_csv(raw_bytes: bytes) -> dict[str, dict[str, str]]:
    rows, header_map = _read_csv_rows(raw_bytes)
    if not rows:
        raise ValueError("CSV 01.20.11 sem linhas de dados.")

    code_col = _pick_column(
        header_map,
        CLIENT_FIELD_ALIASES["client_code"],
        required=True,
        context_label="código do cliente",
    )

    clients: dict[str, dict[str, str]] = {}
    for row in rows:
        raw_code = (row.get(code_col or "", "") or "").strip()
        code = canonical_code(raw_code)
        if not code:
            continue

        payload = _extract_client_payload_from_row(row, header_map)
        payload["client_code"] = raw_code or code
        clients[code] = payload

    if not clients:
        raise ValueError("Nenhum cliente válido encontrado no CSV 01.20.11.")
    return clients


def load_inventory_csv(raw_bytes: bytes) -> dict[str, list[dict[str, Any]]]:
    rows, header_map = _read_csv_rows(raw_bytes)
    if not rows:
        raise ValueError("CSV 02.02.20 sem linhas de dados.")

    code_col = _pick_column(
        header_map,
        INVENTORY_ALIASES["client_code"],
        required=True,
        context_label="código do cliente",
    )
    desc_col = _pick_column(
        header_map,
        INVENTORY_ALIASES["description"],
        required=True,
        context_label="descrição do item",
    )
    baixados_col = _pick_column(header_map, INVENTORY_ALIASES["baixados"], required=False)
    saldo_col = _pick_column(header_map, INVENTORY_ALIASES["saldo"], required=False)
    if not baixados_col and not saldo_col:
        raise ValueError("Coluna obrigatória não encontrada: baixados ou saldo.")
    rg_col = _pick_column(header_map, INVENTORY_ALIASES["rg"], required=False)
    rg_fallback_col = _pick_column(
        header_map,
        ["controla nr serie", "controla nr. serie", "controla n serie"],
        required=False,
    )
    comodato_col = _pick_column(header_map, INVENTORY_ALIASES["comodato_number"], required=False)
    issue_date_col = _pick_column(header_map, INVENTORY_ALIASES["issue_date"], required=False)
    product_col = _pick_column(header_map, INVENTORY_ALIASES["product_code"], required=False)

    result: dict[str, list[dict[str, Any]]] = {}
    row_number = 0
    for row in rows:
        row_number += 1
        raw_code = (row.get(code_col or "", "") or "").strip()
        code = canonical_code(raw_code)
        if not code:
            continue

        baixados_value = parse_integer(row.get(baixados_col or "", "0")) if baixados_col else 0
        saldo_value = parse_integer(row.get(saldo_col or "", "0")) if saldo_col else 0

        open_balance = None
        if baixados_col and baixados_value < 0:
            open_balance = baixados_value
        elif saldo_col and saldo_value < 0:
            open_balance = saldo_value

        if open_balance is None:
            continue

        open_quantity = abs(open_balance)
        description = (row.get(desc_col or "", "") or "").strip()
        description = _compact_spaces(description)
        if not description:
            continue

        rg = _compact_spaces(row.get(rg_col or "", "")) if rg_col else ""
        if not rg and rg_fallback_col:
            rg = _compact_spaces(row.get(rg_fallback_col or "", ""))
        comodato_number = _compact_spaces(row.get(comodato_col or "", "")) if comodato_col else ""
        issue_date = _compact_spaces(row.get(issue_date_col or "", "")) if issue_date_col else ""
        product_code = _compact_spaces(row.get(product_col or "", "")) if product_col else ""
        item_type = classify_item_type(description)
        volume_key = detect_volume_key(description)

        item = {
            "id": f"inv_{row_number}",
            "description": description,
            "open_quantity": open_quantity,
            "item_type": item_type,
            "rg": rg,
            "comodato_number": comodato_number,
            "issue_date": issue_date,
            "volume_key": volume_key,
            "source_baixados": open_balance,
            "product_code": product_code,
            "client_snapshot": _extract_client_payload_from_row(row, header_map),
        }
        result.setdefault(code, []).append(item)

    return result


def merge_clients_with_inventory_snapshots(
    clients: dict[str, dict[str, str]],
    inventory: dict[str, list[dict[str, Any]]],
) -> dict[str, dict[str, str]]:
    merged = {code: dict(payload) for code, payload in clients.items()}

    for code, items in inventory.items():
        if not items:
            continue
        snapshot = dict(items[0].get("client_snapshot") or {})

        if code not in merged:
            merged[code] = _blank_client()
            merged[code]["client_code"] = snapshot.get("client_code") or code

        for field in CLIENT_FORM_FIELDS:
            current = (merged[code].get(field, "") or "").strip()
            incoming = (snapshot.get(field, "") or "").strip()
            if not current and incoming:
                merged[code][field] = incoming

    return merged
