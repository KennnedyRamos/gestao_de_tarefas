from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=1,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            alignment=1,
            spaceAfter=4,
        ),
        "copy_tag": ParagraphStyle(
            "copy_tag",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            alignment=2,
            textColor=colors.HexColor("#444444"),
            spaceAfter=8,
        ),
        "section": ParagraphStyle(
            "section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            spaceBefore=6,
            spaceAfter=3,
        ),
        "normal": ParagraphStyle(
            "normal",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=12,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
        ),
    }


def _client_table(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    client = order.get("client", {}) or {}
    rows = [
        ["Código", client.get("client_code", ""), "Setor", client.get("setor", "")],
        ["Nome Fantasia", client.get("nome_fantasia", ""), "Razão Social", client.get("razao_social", "")],
        ["CNPJ/CPF", client.get("cnpj_cpf", ""), "Telefone", client.get("telefone", "")],
        ["Endereço", client.get("endereco", ""), "Bairro", client.get("bairro", "")],
        ["Cidade", client.get("cidade", ""), "CEP", client.get("cep", "")],
        ["Inscrição Est.", client.get("inscricao_estadual", ""), "Responsável Cliente", client.get("responsavel_cliente", "")],
        [
            "Responsável Retirada",
            client.get("responsavel_retirada", ""),
            "Responsável Conferência",
            client.get("responsavel_conferencia", ""),
        ],
        ["Data Retirada", order.get("withdrawal_date", ""), "Horário Retirada", order.get("withdrawal_time", "")],
    ]
    table = Table(rows, colWidths=[33 * mm, 67 * mm, 38 * mm, 52 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f6f6f6")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f6f6f6")),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _open_equipment_block(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    story: list[Any] = []
    story.append(Paragraph("Equipamentos em aberto do mesmo tipo selecionado", styles["section"]))
    equip_lines = order.get("open_equipment_summary", []) or []
    if not equip_lines:
        story.append(Paragraph("Sem filtro por tipo selecionado na retirada.", styles["small"]))
        return story
    for line in equip_lines:
        story.append(Paragraph(f"- {line}", styles["small"]))
    return story


def _withdrawal_table(order: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    data = [["Descrição", "Tipo", "Quantidade", "RG"]]
    for item in order.get("items", []):
        item_type = item.get("item_type", "outro")
        rg_text = item.get("rg", "") if item_type == "refrigerador" else ""
        data.append(
            [
                item.get("description", ""),
                item.get("type_label", ""),
                item.get("quantity_text", str(item.get("quantity", 0))),
                rg_text,
            ]
        )

    table = Table(data, colWidths=[82 * mm, 35 * mm, 38 * mm, 35 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ececec")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _signature_table(styles: dict[str, ParagraphStyle]) -> Table:
    table = Table(
        [
            ["", ""],
            ["Responsável do Cliente", "Responsável Conferência / Logistica"],
            ["RG:", ""],
        ],
        colWidths=[95 * mm, 95 * mm],
        rowHeights=[13 * mm, 7 * mm, 8 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (0, 0), 0.8, colors.black),
                ("LINEABOVE", (1, 0), (1, 0), 0.8, colors.black),
                ("FONTNAME", (0, 1), (-1, 2), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, 2), 9),
                ("ALIGN", (0, 1), (-1, 1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _copy_story(order: dict[str, Any], copy_tag: str, styles: dict[str, ParagraphStyle]) -> list[Any]:
    story: list[Any] = []
    story.append(Paragraph("Solicitação de Retirada", styles["title"]))
    story.append(Paragraph(order.get("company_name", "Ribeira Beer"), styles["subtitle"]))
    story.append(Paragraph(copy_tag, styles["copy_tag"]))

    story.append(_client_table(order, styles))
    story.append(Spacer(1, 5))

    story.extend(_open_equipment_block(order, styles))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Equipamentos para retirada", styles["section"]))
    story.append(_withdrawal_table(order, styles))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Observação", styles["section"]))
    story.append(Paragraph(order.get("observation", "Sem observações."), styles["normal"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Necessária a assinatura do responsável pela conferência logística.", styles["small"]))
    story.append(Spacer(1, 16))
    story.append(_signature_table(styles))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"Gerado em: {order.get('generated_at', '')}", styles["small"]))
    story.append(Paragraph(f"Número da ordem: {order.get('order_number', '')}", styles["small"]))
    return story


def build_withdrawal_pdf(order: dict[str, Any]) -> bytes:
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title="Ordem de Retirada",
    )

    styles = _styles()
    story: list[Any] = []
    copies = order.get("copies", ["Via do Cliente", "Via da Logística"])
    for index, copy_tag in enumerate(copies):
        story.extend(_copy_story(order, copy_tag, styles))
        if index < len(copies) - 1:
            story.append(PageBreak())

    document.build(story)
    return output.getvalue()

