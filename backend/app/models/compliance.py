"""Compliance rules and violations models."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class ComplianceRule(Base):
    """Work law / regulation rule definition."""

    __tablename__ = "compliance_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    rule_type = Column(String(50), nullable=False)
    parameters = Column(JSONB, nullable=False)
    severity = Column(String(20), default="warning")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    violations = relationship("ComplianceViolation", backref="rule")


# Default compliance rules (Israeli work law + military)
DEFAULT_COMPLIANCE_RULES = [
    {
        "name": "מנוחה בין משמרות",
        "description": "מינימום 8 שעות מנוחה בין משמרות (חוק שעות עבודה ומנוחה)",
        "rule_type": "rest_between_shifts",
        "parameters": {"min_hours": 8},
        "severity": "error",
    },
    {
        "name": "מקסימום שעות שבועיות",
        "description": "לא יותר מ-42 שעות שבועיות (חוק שעות עבודה)",
        "rule_type": "max_weekly_hours",
        "parameters": {"max_hours": 42},
        "severity": "warning",
    },
    {
        "name": "ימים רצופים",
        "description": "לא יותר מ-6 ימים רצופים ללא יום מנוחה",
        "rule_type": "max_consecutive_days",
        "parameters": {"max_days": 6},
        "severity": "warning",
    },
    {
        "name": "משמרת מקסימלית",
        "description": "משמרת בודדת לא תעלה על 12 שעות",
        "rule_type": "max_shift_duration",
        "parameters": {"max_hours": 12},
        "severity": "error",
    },
    {
        "name": "חלוקה הוגנת",
        "description": "פער מקסימלי של 30% בין חייל עם הכי הרבה משמרות לחייל עם הכי פחות",
        "rule_type": "fair_distribution",
        "parameters": {"max_deviation_pct": 30},
        "severity": "info",
    },
]


class ComplianceViolation(Base):
    """Logged compliance violation."""

    __tablename__ = "compliance_violations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False)
    mission_id = Column(UUID(as_uuid=True), ForeignKey("missions.id"), nullable=True)
    violation_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)
    resolved = Column(Boolean, default=False)
    resolved_by = Column(UUID(as_uuid=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    employee = relationship("Employee", backref="compliance_violations")
