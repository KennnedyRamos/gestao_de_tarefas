from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.pickup_catalog_csv import canonical_code


class GiroCsvError(ValueError):
    pass


def normalize_header(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def _decode_encoding(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            raw[:4096].decode(encoding)
            return encoding
        except UnicodeDecodeError:
            continue
    raise GiroCsvError("Não foi possível ler o CSV. Salve o arquivo em UTF-8 ou ANSI.")


def read_csv(raw: bytes, label: str) -> tuple[list[str], Any]:
    if not raw:
        raise GiroCsvError(f"O arquivo CSV de {label} está vazio.")
    encoding = _decode_encoding(raw)
    sample = raw[:8192].decode(encoding)
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        delimiter = ";"
    reader = csv.DictReader(
        io.TextIOWrapper(io.BytesIO(raw), encoding=encoding, newline=""),
        delimiter=delimiter,
        strict=True,
    )
    if not reader.fieldnames:
        raise GiroCsvError(f"O CSV de {label} precisa ter uma linha de cabeçalho.")
    if len(reader.fieldnames) > 512:
        raise GiroCsvError(f"O CSV de {label} tem colunas demais para ser importado.")
    return reader.fieldnames, reader


def _iter_rows(reader: Any, label: str) -> Any:
    try:
        yield from reader
    except csv.Error as exc:
        raise GiroCsvError(f"CSV inválido na base de {label}: {exc}") from exc


def resolve_column(headers: list[str], aliases: tuple[str, ...], label: str) -> str:
    normalized = {normalize_header(header): header for header in headers if str(header or "").strip()}
    for alias in aliases:
        found = normalized.get(normalize_header(alias))
        if found:
            return found
    expected = ", ".join(aliases[:3])
    raise GiroCsvError(f"Coluna obrigatória ausente em {label}: {expected}.")


def _value(row: dict[str, Any], column: str) -> str:
    return str(row.get(column) or "").strip()


def _clean_code(value: str) -> str:
    token = str(value or "").strip()
    if re.fullmatch(r"\d+\.0+", token):
        token = token.split(".", 1)[0]
    return canonical_code(token)


def _is_filled(value: str) -> bool:
    return normalize_header(value) not in {"", "-", "na", "n a", "nao", "0"}


def parse_decimal(value: str, field: str, line: int) -> Decimal:
    token = str(value or "").strip().replace("R$", "").replace(" ", "")
    if not token:
        raise GiroCsvError(f"Valor vazio na linha {line} da coluna {field}.")
    if "," in token and "." in token:
        token = token.replace(".", "").replace(",", ".")
    elif "," in token:
        token = token.replace(",", ".")
    elif token.count(".") > 1:
        token = token.replace(".", "")
    try:
        return Decimal(token)
    except InvalidOperation as exc:
        raise GiroCsvError(f"Valor inválido na linha {line} da coluna {field}: {value}.") from exc


def parse_date(value: str, field: str, line: int) -> date:
    token = str(value or "").strip()
    if not token:
        raise GiroCsvError(f"Data vazia na linha {line} da coluna {field}.")
    for date_format in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(token, date_format).date()
        except ValueError:
            continue
    try:
        serial = Decimal(token)
        if serial == serial.to_integral_value() and 20000 <= serial <= 80000:
            return (datetime(1899, 12, 30) + timedelta(days=int(serial))).date()
    except InvalidOperation:
        pass
    raise GiroCsvError(f"Data inválida na linha {line} da coluna {field}: {value}.")


def parse_target_rows(raw: bytes) -> list[dict[str, Any]]:
    headers, reader = read_csv(raw, "metas")
    indicator_column = resolve_column(headers, ("Indicador", "Métrica", "Metrica"), "metas")
    year_column = next(
        (header for header in headers if normalize_header(header) in {"ano", "year"}),
        None,
    )
    month_columns = {
        month: next(
            (header for header in headers if normalize_header(header) == normalize_header(label)),
            None,
        )
        for month, label in (
            ("01", "Jan"), ("02", "Fev"), ("03", "Mar"), ("04", "Abr"),
            ("05", "Mai"), ("06", "Jun"), ("07", "Jul"), ("08", "Ago"),
            ("09", "Set"), ("10", "Out"), ("11", "Nov"), ("12", "Dez"),
        )
    }
    if not any(month_columns.values()):
        raise GiroCsvError("A base de metas precisa ter colunas mensais de Jan a Dez.")
    targets: dict[tuple[str, str], dict[str, Any]] = {}
    found_types: set[str] = set()
    for line, row in enumerate(_iter_rows(reader, "metas"), start=2):
        if line > 1_001:
            raise GiroCsvError("A base de metas excede o limite de 1.000 linhas.")
        indicator = normalize_header(_value(row, indicator_column))
        if indicator not in {"giro visa", "giro sopi"}:
            continue
        equipment_type = indicator.split()[-1]
        year_value = (_value(row, year_column) if year_column else "") or str(date.today().year)
        try:
            year = int(year_value)
        except ValueError as exc:
            raise GiroCsvError(f"Ano inválido na linha {line} da base de metas: {year_value}.") from exc
        for month_number, column in month_columns.items():
            if not column:
                continue
            raw_percent = _value(row, column)
            if not raw_percent or normalize_header(raw_percent) in {"-", "na", "n a"}:
                continue
            has_percent_sign = "%" in raw_percent
            percent = parse_decimal(raw_percent.replace("%", ""), column, line)
            if not has_percent_sign and percent <= 1:
                percent *= 100
            if not Decimal(0) <= percent <= Decimal(100):
                raise GiroCsvError(f"Percentual inválido na linha {line} da base de metas: {raw_percent}.")
            month = f"{year:04d}-{month_number}"
            targets[(month, equipment_type)] = {
                "month": month,
                "equipment_type": equipment_type,
                "target_percent": percent,
            }
            found_types.add(equipment_type)
    if found_types != {"visa", "sopi"}:
        raise GiroCsvError("A base de metas precisa ter percentuais para GIRO VISA e GIRO SOPI.")
    if not targets:
        raise GiroCsvError("A base de metas não contém percentuais mensais válidos.")
    return list(targets.values())


def _is_marketplace(value: str) -> bool:
    return "marketplace" in normalize_header(value).replace(" ", "")


def _is_cancelled(value: str) -> bool:
    return normalize_header(value) in {"sim", "s", "1", "true", "yes", "y", "cancelado", "cancelada"}


def _is_chopp(value: str) -> bool:
    text = normalize_header(value)
    return bool(re.search(r"\b(chopp?|chope|bag|barril|bib)\b", text))


def parse_sales_rows(
    raw: bytes,
) -> tuple[dict[tuple[str, str, str], Decimal], set[str], int, int]:
    headers, reader = read_csv(raw, "vendas")
    columns = {
        "code": resolve_column(headers, ("PDV", "Cod PDV", "Codigo Cliente", "Código Cliente", "Cliente"), "vendas"),
        "date": resolve_column(headers, ("Emissao", "Emissão", "Data Venda", "Data Operacao", "Data Operação"), "vendas"),
        "amount": resolve_column(headers, ("Total", "Valor Total", "Faturamento", "Valor"), "vendas"),
        "origin": resolve_column(headers, ("Origem do Pedido", "Origem", "Canal de Venda"), "vendas"),
        "description": resolve_column(headers, ("Descrição", "Descricao", "Produto"), "vendas"),
        "status": resolve_column(headers, ("Status", "Status NF-e", "Status NFe"), "vendas"),
    }
    basket_column = None
    for candidate in ("Cesta", "Categoria", "Grupo Produto"):
        basket_column = next((header for header in headers if normalize_header(header) == normalize_header(candidate)), None)
        if basket_column:
            break
    nab_column = next((header for header in headers if normalize_header(header) == "nab"), None)
    beer_columns = [
        header for header in headers
        if normalize_header(header) in {"cerveja", "match"}
    ]
    if not basket_column and (not nab_column or not beer_columns):
        raise GiroCsvError("O CSV de vendas precisa ter a coluna Cesta ou as colunas NAB e CERVEJA.")
    packaging_column = next((header for header in headers if normalize_header(header) in {"embalagem", "tipo embalagem"}), None)
    cancel_column = next((header for header in headers if "cancelamento" in normalize_header(header)), None)

    totals: dict[tuple[str, str, str], Decimal] = defaultdict(Decimal)
    source_months: set[str] = set()
    ignored = 0
    imported = 0
    for line, row in enumerate(_iter_rows(reader, "vendas"), start=2):
        if line > 500_001:
            raise GiroCsvError("A base de vendas excede o limite de 500.000 linhas.")
        if not any(str(value or "").strip() for value in row.values()):
            continue
        sale_date = parse_date(_value(row, columns["date"]), columns["date"], line)
        source_months.add(sale_date.strftime("%Y-%m"))
        status = normalize_header(_value(row, columns["status"]))
        if status and status not in {"a", "ativo", "autorizada", "autorizado", "ok", "1"}:
            ignored += 1
            continue
        if cancel_column and _is_cancelled(_value(row, cancel_column)):
            ignored += 1
            continue
        if _is_marketplace(_value(row, columns["origin"])):
            ignored += 1
            continue
        description = " ".join(
            value for value in (
                _value(row, columns["description"]),
                _value(row, packaging_column) if packaging_column else "",
            ) if value
        )
        if _is_chopp(description):
            ignored += 1
            continue
        if basket_column:
            basket_value = normalize_header(_value(row, basket_column))
            if basket_value == "nab":
                basket = "visa"
            elif basket_value in {"cerveja", "match", "sopi"}:
                basket = "sopi"
            else:
                ignored += 1
                continue
        else:
            has_nab = _is_filled(_value(row, nab_column))
            has_beer = any(_is_filled(_value(row, column)) for column in beer_columns)
            if has_nab == has_beer:
                ignored += 1
                continue
            basket = "visa" if has_nab else "sopi"
        client_code = _clean_code(_value(row, columns["code"]))
        if not client_code:
            raise GiroCsvError(f"Código de PDV vazio na linha {line} da base de vendas.")
        amount = parse_decimal(_value(row, columns["amount"]), columns["amount"], line)
        totals[(client_code, sale_date.strftime("%Y-%m"), basket)] += amount
        imported += 1
    if not source_months:
        raise GiroCsvError("A base de vendas não contém linhas de dados válidas.")
    return totals, source_months, imported, ignored
