"""PDF export for schedules using WeasyPrint."""

import logging
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)


def generate_schedule_pdf(
    missions: list[dict[str, Any]],
    template: dict[str, Any] | None,
    tenant_name: str,
    target_date: date,
) -> bytes:
    """Generate a PDF schedule from missions data.

    Args:
        missions: List of mission dicts with assignments.
        template: Optional daily board template layout config.
        tenant_name: Tenant display name for header.
        target_date: The date being exported.

    Returns:
        PDF file content as bytes.
    """
    from weasyprint import HTML

    html = _build_schedule_html(missions, template, tenant_name, target_date)
    pdf_bytes = HTML(string=html).write_pdf()
    return pdf_bytes


def _build_schedule_html(
    missions: list[dict[str, Any]],
    template: dict[str, Any] | None,
    tenant_name: str,
    target_date: date,
) -> str:
    """Build RTL Hebrew HTML table for the schedule."""

    # Build mission rows
    rows_html = ""
    for m in missions:
        assignments = m.get("assignments", [])
        assigned_names = ", ".join(
            a.get("employee_name", "—") for a in assignments
        ) or "—"

        status_label = {
            "draft": "טיוטה",
            "proposed": "מוצע",
            "approved": "מאושר",
            "active": "פעיל",
            "completed": "הושלם",
            "cancelled": "בוטל",
        }.get(m.get("status", ""), m.get("status", ""))

        rows_html += f"""
        <tr>
            <td>{m.get("name", "—")}</td>
            <td>{m.get("mission_type_name", "—")}</td>
            <td>{m.get("start_time", "—")} – {m.get("end_time", "—")}</td>
            <td>{assigned_names}</td>
            <td>{status_label}</td>
        </tr>"""

    if not rows_html:
        rows_html = '<tr><td colspan="5" style="text-align:center;">אין משימות לתאריך זה</td></tr>'

    template_name = ""
    if template:
        template_name = f' — {template.get("name", "")}'

    html = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
    @page {{
        size: A4 landscape;
        margin: 1.5cm;
    }}
    body {{
        font-family: Arial, Helvetica, sans-serif;
        direction: rtl;
        text-align: right;
        font-size: 11pt;
        color: #1a1a1a;
    }}
    h1 {{
        font-size: 18pt;
        margin-bottom: 4px;
    }}
    .subtitle {{
        font-size: 11pt;
        color: #555;
        margin-bottom: 16px;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
    }}
    th {{
        background-color: #2563eb;
        color: white;
        padding: 8px 12px;
        text-align: right;
        font-weight: bold;
    }}
    td {{
        padding: 6px 12px;
        border-bottom: 1px solid #ddd;
    }}
    tr:nth-child(even) td {{
        background-color: #f8f9fa;
    }}
    .footer {{
        margin-top: 20px;
        font-size: 9pt;
        color: #999;
        text-align: center;
    }}
</style>
</head>
<body>
    <h1>לוח משימות — {tenant_name}</h1>
    <div class="subtitle">{target_date.isoformat()}{template_name}</div>
    <table>
        <thead>
            <tr>
                <th>שם משימה</th>
                <th>סוג</th>
                <th>שעות</th>
                <th>משובצים</th>
                <th>סטטוס</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>
    <div class="footer">הופק אוטומטית • {target_date.isoformat()}</div>
</body>
</html>"""
    return html
