from __future__ import annotations

from html import escape
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PAGE_WIDTH = 190 * mm


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            alignment=1,
        ),
        "logo": ParagraphStyle(
            "logo",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            alignment=1,
        ),
        "copy_tag": ParagraphStyle(
            "copy_tag",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            alignment=1,
            textColor=colors.HexColor("#444444"),
        ),
        "section": ParagraphStyle(
            "section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=11,
        ),
        "section_center": ParagraphStyle(
            "section_center",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=11,
            alignment=1,
        ),
        "field_label": ParagraphStyle(
            "field_label",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10.5,
            wordWrap="CJK",
        ),
        "field_value": ParagraphStyle(
            "field_value",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            wordWrap="CJK",
        ),
        "small_center": ParagraphStyle(
            "small_center",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            alignment=1,
            wordWrap="CJK",
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9,
            wordWrap="CJK",
        ),
    }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _p(value: Any, style: ParagraphStyle) -> Paragraph:
    content = escape(_text(value)).replace("\n", "<br/>")
    return Paragraph(content or "&nbsp;", style)


def _header_table(order: dict[str, Any], copy_tag: str, styles: dict[str, ParagraphStyle]) -> Table:
    company = escape(_text(order.get("company_name")) or "Ribeira Beer")
    table = Table(
        [
            [
                Paragraph("AMBEV<br/>Skol / Brahma", styles["logo"]),
                Paragraph(f"Solicita\u00e7\u00e3o de Retirada<br/><b>{company}</b>", styles["title"]),
                Paragraph(f"{escape(_text(copy_tag))}<br/>Ribeira Beer", styles["copy_tag"]),
            ]
        ],
        colWidths=[32 * mm, 126 * mm, 32 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("BOX", (0, 0), (0, 0), 0.6, colors.black),
                ("BOX", (2, 0), (2, 0), 0.6, colors.black),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _reseller_header_table(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    client = order.get("client", {}) or {}
    reseller_lines = order.get("reseller_lines", []) or []
    reseller_name = _text(reseller_lines[0]) if reseller_lines else "Ribeira Beer Distribuidora de Bebidas Ltda"

    row = [
        _p("Revenda:", styles["field_label"]),
        _p(reseller_name, styles["field_value"]),
        _p("C\u00f3digo:", styles["field_label"]),
        _p(client.get("client_code", ""), styles["field_value"]),
        _p("Setor:", styles["field_label"]),
        _p(client.get("setor", ""), styles["field_value"]),
    ]

    table = Table([row], colWidths=[18 * mm, 84 * mm, 16 * mm, 24 * mm, 14 * mm, 34 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f1f1f1")),
                ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#f1f1f1")),
                ("BACKGROUND", (4, 0), (4, 0), colors.HexColor("#f1f1f1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _client_table(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    client = order.get("client", {}) or {}
    rows = [
        [
            _p("Raz\u00e3o Social:", styles["field_label"]),
            _p(client.get("razao_social", ""), styles["field_value"]),
            _p("Inscr. Est.:", styles["field_label"]),
            _p(client.get("inscricao_estadual", ""), styles["field_value"]),
        ],
        [
            _p("Nome Fantasia:", styles["field_label"]),
            _p(client.get("nome_fantasia", ""), styles["field_value"]),
            _p("CEP:", styles["field_label"]),
            _p(client.get("cep", ""), styles["field_value"]),
        ],
        [
            _p("CNPJ/CPF:", styles["field_label"]),
            _p(client.get("cnpj_cpf", ""), styles["field_value"]),
            _p("Cidade:", styles["field_label"]),
            _p(client.get("cidade", ""), styles["field_value"]),
        ],
        [
            _p("Endere\u00e7o:", styles["field_label"]),
            _p(client.get("endereco", ""), styles["field_value"]),
            _p("Telefone:", styles["field_label"]),
            _p(client.get("telefone", ""), styles["field_value"]),
        ],
        [
            _p("Bairro:", styles["field_label"]),
            _p(client.get("bairro", ""), styles["field_value"]),
            _p("Hor\u00e1rio da retirada:", styles["field_label"]),
            _p(order.get("withdrawal_time", ""), styles["field_value"]),
        ],
        [
            _p("Respons\u00e1vel:", styles["field_label"]),
            _p(client.get("responsavel_cliente", ""), styles["field_value"]),
            _p("Respons\u00e1vel confer\u00eancia:", styles["field_label"]),
            _p(client.get("responsavel_conferencia", ""), styles["field_value"]),
        ],
        [
            _p("Data para retirada:", styles["field_label"]),
            _p(order.get("withdrawal_date", ""), styles["field_value"]),
            _p("", styles["field_label"]),
            _p("", styles["field_value"]),
        ],
    ]

    table = Table(rows, colWidths=[30 * mm, 65 * mm, 42 * mm, 53 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f7f7f7")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f7f7f7")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _section_lines_table(
    title: str,
    lines: list[str],
    styles: dict[str, ParagraphStyle],
    min_rows: int,
) -> Table:
    normalized = [_text(line) for line in lines if _text(line)]
    while len(normalized) < min_rows:
        normalized.append("")

    rows: list[list[Any]] = [[_p(title, styles["section"])]]
    rows.extend([[_p(line, styles["field_value"])] for line in normalized])

    table = Table(rows, colWidths=[PAGE_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _withdrawal_reason_lines(order: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for item in order.get("items", []) or []:
        quantity_text = _text(item.get("quantity_text")) or str(item.get("quantity", 0))
        description = _text(item.get("description"))
        item_type = _text(item.get("item_type")) or "outro"
        rg = _text(item.get("rg"))

        base = " - ".join(part for part in [quantity_text, description] if part)
        if item_type == "refrigerador" and rg:
            base = f"{base} | RG: {rg}"
        if base:
            lines.append(base)

    return lines or ["Nenhum item selecionado."]


def _reseller_cadastro_box(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    lines = order.get("reseller_lines", []) or []
    if not lines:
        lines = [
            "Ribeira Beer Distribuidora de Bebidas Ltda",
            "Rua Arapongal N 40 - Arapongal",
            "Registro - SP",
            "11900-000",
        ]

    inner_rows = [[_p("DADOS CADASTRAIS DA REVENDA", styles["section_center"])]]
    inner_rows.extend([[_p(line, styles["small_center"])] for line in lines])
    inner = Table(inner_rows, colWidths=[145 * mm])
    inner.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )

    box = Table([[inner]], colWidths=[PAGE_WIDTH])
    box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.2, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return box


def _signature_table(copy_tag: str, styles: dict[str, ParagraphStyle]) -> Table:
    is_logistics = "log" in _text(copy_tag).lower()

    if not is_logistics:
        table = Table(
            [
                [""],
                [_p("Respons\u00e1vel pela Recolha", styles["small_center"])],
                [_p("____________________________________________", styles["small_center"])],
            ],
            colWidths=[PAGE_WIDTH],
            rowHeights=[12 * mm, 8 * mm, 10 * mm],
        )
        table.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 0), (0, 0), 0.8, colors.black),
                    ("ALIGN", (0, 1), (0, 2), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return table

    table = Table(
        [
            ["", ""],
            [_p("Cliente/Respons\u00e1vel", styles["small_center"]), _p("Conferente", styles["small_center"])],
            [_p("____________________________________________", styles["small_center"]), _p("____________________________________________", styles["small_center"])],
        ],
        colWidths=[95 * mm, 95 * mm],
        rowHeights=[12 * mm, 8 * mm, 10 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (0, 0), 0.8, colors.black),
                ("LINEABOVE", (1, 0), (1, 0), 0.8, colors.black),
                ("ALIGN", (0, 1), (-1, 2), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _copy_story(order: dict[str, Any], copy_tag: str, styles: dict[str, ParagraphStyle]) -> list[Any]:
    story: list[Any] = []
    story.append(_header_table(order, copy_tag, styles))
    story.append(Spacer(1, 4 * mm))
    story.append(_reseller_header_table(order, styles))
    story.append(Spacer(1, 4 * mm))
    story.append(_client_table(order, styles))
    story.append(Spacer(1, 4 * mm))
    story.append(_section_lines_table("MOTIVO DA RETIRADA:", _withdrawal_reason_lines(order), styles, min_rows=4))
    story.append(Spacer(1, 3 * mm))
    story.append(_p("VOLTAGEM DO EQUIPAMENTO: ( ) 110 volts    ( ) 220 volts", styles["small"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_section_lines_table("OBSERVA\u00c7\u00c3O:", [], styles, min_rows=4))
    story.append(Spacer(1, 4 * mm))
    story.append(_reseller_cadastro_box(order, styles))
    story.append(Spacer(1, 4 * mm))
    story.append(_signature_table(copy_tag, styles))
    story.append(Spacer(1, 3 * mm))
    return story


def _draw_footer_on_page(canvas, document, order: dict[str, Any]) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    y = 5 * mm
    left_x = document.leftMargin
    right_x = document.pagesize[0] - document.rightMargin
    canvas.drawString(left_x, y, f"N\u00famero da ordem: {_text(order.get('order_number'))}")
    canvas.drawRightString(right_x, y, f"Gerado em: {_text(order.get('generated_at'))}")
    canvas.restoreState()


def build_withdrawal_pdf(order: dict[str, Any]) -> bytes:
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
        title="Ordem de Retirada",
    )

    styles = _styles()
    story: list[Any] = []
    copies = order.get("copies", ["Via do Cliente", "Via da Log\u00edstica"])
    for index, copy_tag in enumerate(copies):
        story.extend(_copy_story(order, copy_tag, styles))
        if index < len(copies) - 1:
            story.append(PageBreak())

    on_page = lambda canvas, doc: _draw_footer_on_page(canvas, doc, order)
    document.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return output.getvalue()
